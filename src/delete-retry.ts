import type { AuditRefusal, DeletionAudit } from "./audit-outbox";

/** Refusals that say nothing about the message: the audit database was briefly unreachable or slow (#277). */
export type IntentFailure = AuditRefusal | "unavailable";
export const transientIntentFailure = (reason: IntentFailure) => reason === "database" || reason === "unavailable";

type Clock = { now?: () => number; sleep?: (ms: number) => Promise<void> };
const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

/**
 * prepare() with a bounded inline retry for transient failures. A retry starts only while the elapsed time plus
 * its delay stays inside budgetMs, so a slow failure (a timed-out lock wait) goes straight to the retry queue
 * instead of holding up the sequential update handler.
 */
export async function prepareIntent(audit: DeletionAudit, chatId: number, messageId: number, report: string | string[],
  { delaysMs = [250, 1_000], budgetMs = 2_000, now = Date.now, sleep: wait = sleep }: { delaysMs?: number[]; budgetMs?: number } & Clock = {},
): Promise<{ id: string; attempts: number } | { refusal: IntentFailure; attempts: number }> {
  const startedAt = now();
  for (let attempt = 0; ; attempt++) {
    let refusal: IntentFailure = "unavailable", id: string | undefined;
    try { id = await audit.prepare(chatId, messageId, report, reason => { refusal = reason; }); }
    catch { /* Persistence failures never become classifier failures. */ }
    if (id) return { id, attempts: attempt + 1 };
    const delay = delaysMs[attempt];
    if (!transientIntentFailure(refusal) || delay === undefined || now() - startedAt + delay > budgetMs) return { refusal, attempts: attempt + 1 };
    await wait(delay);
  }
}

export type RetryOutcome = { outcome: "deleted" | "deferred" | "duplicate" | "refused" | "delete_failed"; reason?: string; kind?: string };
type Logged = { outcome: RetryOutcome["outcome"] | "queued" | "dropped" | "expired" | "superseded"; reason?: string; kind?: string };
type Entry = { chatId: number; messageId: number; attempt: () => Promise<RetryOutcome>; attempts: number; dueAt: number; expiresAt: number };

/**
 * In-memory queue for confirmed deletions whose audit intent could not be written. Bounded by capacity and a TTL;
 * a restart drops it. Entries keep their own audit report in the attempt closure, never in logs.
 */
export class DeleteRetryQueue {
  private readonly entries = new Map<string, Entry>();
  private timer?: ReturnType<typeof setInterval>;
  private running?: Promise<void>;
  private stopped = false;
  private readonly capacity: number;
  private readonly ttlMs: number;
  private readonly delaysMs: number[];
  private readonly pollMs: number;
  private readonly now: () => number;
  private readonly logger: Pick<Console, "info">;
  constructor({ capacity = 1_000, ttlMs = 60 * 60_000, delaysMs = [15_000, 30_000, 60_000, 120_000, 300_000], pollMs = 5_000,
    now = Date.now, logger = console }: { capacity?: number; ttlMs?: number; delaysMs?: number[]; pollMs?: number;
    now?: () => number; logger?: Pick<Console, "info"> } = {}) {
    this.capacity = capacity; this.ttlMs = ttlMs; this.delaysMs = delaysMs; this.pollMs = pollMs; this.now = now; this.logger = logger;
  }
  get size() { return this.entries.size; }
  /** Whether the message is queued; false only when the queue is full (logged as dropped). */
  add(chatId: number, messageId: number, attempt: () => Promise<RetryOutcome>): boolean {
    const key = `${chatId}:${messageId}`;
    if (this.entries.has(key)) return true;
    if (this.entries.size >= this.capacity) { this.log(chatId, messageId, 0, { outcome: "dropped", reason: "capacity" }); return false; }
    const now = this.now();
    this.entries.set(key, { chatId, messageId, attempt, attempts: 0, dueAt: now + this.delaysMs[0]!, expiresAt: now + this.ttlMs });
    this.log(chatId, messageId, 0, { outcome: "queued" });
    return true;
  }
  /** Withdraws a queued message (an edit re-moderates it under its new content). */
  forget(chatId: number, messageId: number): void {
    const entry = this.entries.get(`${chatId}:${messageId}`);
    if (!entry) return;
    this.entries.delete(`${chatId}:${messageId}`);
    this.log(chatId, messageId, entry.attempts, { outcome: "superseded" });
  }
  /**
   * Runs due entries one at a time; overlapping calls share the same pass. A transient failure ends the pass:
   * the database is still failing, so the rest stay due for the next one instead of each waiting out a stall.
   */
  runDue(): Promise<void> {
    return this.running ??= this.pass().finally(() => { this.running = undefined; });
  }
  private async pass() {
    for (const [key, entry] of [...this.entries]) {
      if (this.stopped) return;
      const now = this.now();
      if (now >= entry.expiresAt) { this.entries.delete(key); this.log(entry.chatId, entry.messageId, entry.attempts, { outcome: "expired" }); continue; }
      if (now < entry.dueAt) continue;
      entry.attempts++;
      let result: RetryOutcome;
      try { result = await entry.attempt(); } catch { result = { outcome: "deferred", reason: "unavailable" }; }
      // An edit may have withdrawn (or replaced) the entry while its attempt ran.
      const current = this.entries.get(key) === entry;
      if (result.outcome !== "deferred") { if (current) this.entries.delete(key); }
      else entry.dueAt = this.now() + this.delaysMs[Math.min(entry.attempts, this.delaysMs.length - 1)]!;
      this.log(entry.chatId, entry.messageId, entry.attempts, result);
      if (result.outcome === "deferred") return;
    }
  }
  start(): void {
    if (this.timer || this.stopped || this.pollMs <= 0) return;
    this.timer = setInterval(() => { void this.runDue(); }, this.pollMs);
    this.timer.unref?.();
  }
  /** Stops the timer and waits for an attempt in flight; queued entries are dropped with the process. */
  async stop(): Promise<void> {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    await this.running;
  }
  private log(chatId: number, messageId: number, attempts: number, { outcome, reason, kind }: Logged) {
    this.logger.info(JSON.stringify({ event: "delete_retry", outcome, chatId, messageId, attempts,
      ...(reason ? { reason } : {}), ...(kind ? { kind } : {}), queued: this.entries.size }));
  }
}
