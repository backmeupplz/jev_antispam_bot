import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import pg from "pg";
import type { AuditSnapshot } from "./audit-report";

// Nikita #124: an account sending the same content again, in the same group or
// another one the bot moderates, is evidence the model cannot see. Each repeat
// raises the effective score; once it crosses the gate, the current copy and the
// account's earlier copies in the window are deleted. Constants and the data
// behind them are documented in docs/repeat-sends.md.
export const REPEAT_MIN_CHARS = 30;
export const REPEAT_MIN_SCORE = 0.5;
export const REPEAT_DECAY = 0.5;
export const REPEAT_WINDOW_MS = 24 * 60 * 60_000;
// Copies returned per lookup; also caps how far the boost can compound.
export const REPEAT_MAX_COPIES = 20;

// Lookalike letters from other scripts fold to one Latin form, applied to both
// copies alike, so a swapped letter does not make a new text.
const HOMOGLYPHS: Record<string, string> = {
  а: "a", в: "b", е: "e", ё: "e", к: "k", м: "m", н: "h", о: "o", р: "p", с: "c", т: "t", у: "y", х: "x",
  і: "i", ї: "i", ј: "j", ѕ: "s", ԁ: "d", ӏ: "l", ο: "o", α: "a", ε: "e", ρ: "p", τ: "t", υ: "u", ν: "v", ι: "i", κ: "k",
};

// Case, whitespace, punctuation, emoji and invisible characters never make a
// copy new. Short texts ("+", "спасибо", "11") never count as repeats.
export function repeatText(text: string): string | undefined {
  // NFKD splits compatibility forms and accents; marks (and so й/ё breves) drop.
  const folded = [...text.normalize("NFKD").toLowerCase().replace(/[\p{Cf}\p{M}]/gu, "")]
    .map((char) => HOMOGLYPHS[char] ?? char).join("")
    .replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  return [...folded].length >= REPEAT_MIN_CHARS ? folded : undefined;
}

// The stored key hashes the actor with the content, so storage holds neither.
export function repeatKey(actor: string, text: string): string | undefined {
  const normalized = repeatText(text);
  return normalized === undefined ? undefined : createHash("sha256").update(actor + "\0" + normalized).digest("hex");
}

// Every other copy halves the remaining distance to 1. Scores under the floor
// are clearly benign to the model and are never pushed over the gate.
export function escalatedScore(probability: number, otherCopies: number): number {
  if (!(probability >= REPEAT_MIN_SCORE) || otherCopies < 1) return probability;
  return 1 - (1 - probability) * REPEAT_DECAY ** Math.min(otherCopies, REPEAT_MAX_COPIES);
}

export type RepeatCopy = { chatId: number; messageId: number; sentAt: number; handled: boolean };
export interface RepeatStore {
  /** Upserts this copy and returns the other copies of the same key whose send times are within the window of it, unhandled first, then newest first; undefined when unavailable. */
  record(key: string, copy: Omit<RepeatCopy, "handled">): Promise<RepeatCopy[] | undefined>;
  /** A deletion was attempted (succeeded or failed); it is never retried. */
  markHandled(chatId: number, messageId: number): Promise<void>;
  /** An edit that is no longer an eligible copy. */
  forget(chatId: number, messageId: number): Promise<void>;
}

const near = (a: number, b: number) => Math.abs(a - b) < REPEAT_WINDOW_MS;

export class MemoryRepeatStore implements RepeatStore {
  // chat:message -> copy, in insertion order for the capacity bound. Retention
  // follows when a copy was seen, so a late or odd send time cannot evict it early.
  private readonly copies = new Map<string, RepeatCopy & { key: string; seenAt: number }>();
  constructor(private readonly capacity = 50_000, private readonly now = () => Date.now()) {
    setInterval(() => this.prune(), 10 * 60_000).unref();
  }
  async record(key: string, copy: Omit<RepeatCopy, "handled">): Promise<RepeatCopy[]> {
    this.prune();
    const id = `${copy.chatId}:${copy.messageId}`;
    const previous = this.copies.get(id);
    this.copies.delete(id);
    this.copies.set(id, { ...copy, key, handled: previous?.handled ?? false, sentAt: previous?.sentAt ?? copy.sentAt,
      seenAt: previous?.seenAt ?? this.now() });
    for (const oldest of this.copies.keys()) {
      if (this.copies.size <= this.capacity) break;
      this.copies.delete(oldest);
    }
    const sentAt = this.copies.get(id)!.sentAt;
    return [...this.copies.values()]
      .filter((c) => c.key === key && !(c.chatId === copy.chatId && c.messageId === copy.messageId) && near(c.sentAt, sentAt))
      .sort((a, b) => Number(a.handled) - Number(b.handled) || b.sentAt - a.sentAt).slice(0, REPEAT_MAX_COPIES)
      .map(({ chatId, messageId, sentAt, handled }) => ({ chatId, messageId, sentAt, handled }));
  }
  async markHandled(chatId: number, messageId: number): Promise<void> {
    const copy = this.copies.get(`${chatId}:${messageId}`);
    if (copy) copy.handled = true;
  }
  async forget(chatId: number, messageId: number): Promise<void> {
    this.copies.delete(`${chatId}:${messageId}`);
  }
  private prune() {
    const now = this.now();
    for (const [id, copy] of this.copies) if (now - copy.seenAt >= 2 * REPEAT_WINDOW_MS) this.copies.delete(id);
  }
}

// Bounded and fail-open: an outage or slow query means no escalation, never a delete.
export class PostgresRepeatStore implements RepeatStore {
  private readonly pool: pg.Pool;
  private migration?: Promise<void>;
  private active = 0;
  private readonly timer: ReturnType<typeof setInterval>;
  private readonly counters = { recorded: 0, pruned: 0, error: 0 };
  // Copies whose forget failed: never returned as earlier copies until a
  // later forget succeeds or the copy is recorded again with its new content.
  private readonly forgotten = new Map<string, number>();
  constructor(databaseUrl: string, private readonly options: {
    timeoutMs?: number; capacity?: number; logger?: Pick<Console, "info">;
  } = {}) {
    if (!Number.isInteger(this.capacity) || this.capacity < 1 || this.capacity > 1_000_000) throw new Error("Invalid repeat store bounds");
    this.pool = new pg.Pool({ connectionString: databaseUrl, max: 2,
      connectionTimeoutMillis: this.timeout, query_timeout: this.timeout,
      // Eligible copies are sparse: keep connections warm so a lookup is not a connect.
      statement_timeout: Math.max(1, this.timeout - 20), idleTimeoutMillis: 15 * 60_000,
      application_name: "jev_antispam_bot_repeats",
      // #277: a host-IO fsync stall must not fail a repeat write; losing its last moments on a crash only misses a repeat.
      options: "-c synchronous_commit=off" });
    this.pool.on("error", () => undefined);
    this.timer = setInterval(() => void this.prune(), 10 * 60_000);
    this.timer.unref();
  }
  private get timeout() { return this.options.timeoutMs ?? 500; }
  private get capacity() { return this.options.capacity ?? 100_000; }
  health() { return { ...this.counters }; }
  async close() { clearInterval(this.timer); await this.pool.end(); }
  async record(key: string, copy: Omit<RepeatCopy, "handled">): Promise<RepeatCopy[] | undefined> {
    const rows = await this.bounded(async () => {
      await this.ensureMigrated();
      // An edit keeps its original send time and handled state.
      await this.pool.query(
        "INSERT INTO repeat_sends(chat_id, message_id, copy_key, sent_at) VALUES ($1,$2,$3,to_timestamp($4::double precision/1000)) ON CONFLICT (chat_id, message_id) DO UPDATE SET copy_key=EXCLUDED.copy_key",
        [copy.chatId, copy.messageId, key, copy.sentAt]);
      const result = await this.pool.query<{ chat_id: string; message_id: string; sent_ms: string; handled: boolean }>(
        `SELECT o.chat_id, o.message_id, (EXTRACT(EPOCH FROM o.sent_at)*1000)::bigint AS sent_ms, o.handled
         FROM repeat_sends c JOIN repeat_sends o ON o.copy_key=c.copy_key
           AND o.sent_at > c.sent_at - $3 * INTERVAL '1 millisecond' AND o.sent_at < c.sent_at + $3 * INTERVAL '1 millisecond'
           AND (o.chat_id, o.message_id) <> (c.chat_id, c.message_id)
         WHERE c.chat_id=$1 AND c.message_id=$2 ORDER BY o.handled, o.sent_at DESC LIMIT $4`,
        [copy.chatId, copy.messageId, REPEAT_WINDOW_MS, REPEAT_MAX_COPIES]);
      return result.rows;
    });
    if (rows === undefined) return;
    this.counters.recorded++;
    this.forgotten.delete(`${copy.chatId}:${copy.messageId}`);
    return rows.map((r) => ({ chatId: Number(r.chat_id), messageId: Number(r.message_id), sentAt: Number(r.sent_ms), handled: r.handled }))
      .filter((c) => !this.forgotten.has(`${c.chatId}:${c.messageId}`));
  }
  // Never dropped for the in-flight cap (pg queues it, still within the deadline): a lost write would retry a delete.
  async markHandled(chatId: number, messageId: number): Promise<void> {
    await this.bounded(async () => {
      await this.ensureMigrated();
      await this.pool.query("UPDATE repeat_sends SET handled=TRUE WHERE chat_id=$1 AND message_id=$2", [chatId, messageId]);
    }, true);
  }
  // Not dropped for the in-flight cap either; a lost forget is remembered in memory (until a
  // restart) so an edited copy is never deleted as a repeat.
  async forget(chatId: number, messageId: number): Promise<void> {
    const id = `${chatId}:${messageId}`;
    if (await this.delete(chatId, messageId)) { this.forgotten.delete(id); return; }
    this.forgotten.delete(id);
    this.forgotten.set(id, Date.now());
    for (const oldest of this.forgotten.keys()) {
      if (this.forgotten.size <= 10_000) break;
      this.forgotten.delete(oldest);
    }
  }
  private delete(chatId: number, messageId: number) {
    return this.bounded(async () => {
      await this.ensureMigrated();
      await this.pool.query("DELETE FROM repeat_sends WHERE chat_id=$1 AND message_id=$2", [chatId, messageId]);
      return true;
    }, true);
  }
  // Expired copies, then the oldest beyond capacity; failed forgets are retried.
  async prune(): Promise<void> {
    for (const [id, at] of [...this.forgotten]) {
      if (Date.now() - at >= 2 * REPEAT_WINDOW_MS) { this.forgotten.delete(id); continue; }
      if (this.forgotten.get(id) !== at) continue;
      const [chatId, messageId] = id.split(":").map(Number);
      if (!await this.delete(chatId!, messageId!)) break;
      // A copy recorded again meanwhile is no longer forgotten. If that record raced this
      // delete, the row is lost and the copy simply stops counting: a missed escalation, never a delete.
      if (this.forgotten.get(id) === at) this.forgotten.delete(id);
    }
    const pruned = await this.bounded(async () => {
      await this.ensureMigrated();
      const expired = await this.pool.query("DELETE FROM repeat_sends WHERE sent_at < NOW() - 2 * $1 * INTERVAL '1 millisecond'", [REPEAT_WINDOW_MS]);
      const over = await this.pool.query("DELETE FROM repeat_sends WHERE (chat_id, message_id) IN (SELECT chat_id, message_id FROM repeat_sends ORDER BY sent_at DESC, chat_id, message_id OFFSET $1)", [this.capacity]);
      return (expired.rowCount ?? 0) + (over.rowCount ?? 0);
    });
    if (pruned) { this.counters.pruned += pruned; this.log(); }
  }
  private async ensureMigrated() {
    this.migration ??= this.pool.query(readFileSync(new URL("../migrations/007_repeat_sends.sql", import.meta.url), "utf8"))
      .then(() => undefined).catch((error) => { this.migration = undefined; throw error; });
    await this.migration;
  }
  private async bounded<T>(operation: () => Promise<T>, queue = false): Promise<T | undefined> {
    if (this.active >= 2 && !queue) { this.counters.error++; this.log(); return; }
    this.active++;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const work = operation().finally(() => { this.active--; });
    try {
      return await Promise.race([work, new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("Repeat store deadline")), this.timeout);
      })]);
    } catch { this.counters.error++; this.log(); return; }
    finally { clearTimeout(timer); }
  }
  private log() { (this.options.logger ?? console).info(JSON.stringify({ event: "repeat_store", ...this.counters })); }
}

// Audit evidence for copies this process saw. A copy recorded before a restart
// (or evicted by the cap) has none, so its report reuses the current copy's
// matching content.
export class RepeatSnapshots {
  private readonly snapshots = new Map<string, { snapshot: AuditSnapshot; at: number }>();
  constructor(private readonly capacity = 2_000) {}
  set(snapshot: AuditSnapshot, now = Date.now()) {
    const id = `${snapshot.chatId}:${snapshot.messageId}`;
    this.snapshots.delete(id);
    this.snapshots.set(id, { snapshot, at: now });
    for (const oldest of this.snapshots.keys()) {
      if (this.snapshots.size <= this.capacity) break;
      this.snapshots.delete(oldest);
    }
  }
  delete(chatId: number, messageId: number) { this.snapshots.delete(`${chatId}:${messageId}`); }
  get(copy: RepeatCopy, current: AuditSnapshot, now = Date.now()): AuditSnapshot {
    const saved = this.snapshots.get(`${copy.chatId}:${copy.messageId}`);
    if (saved && now - saved.at < 2 * REPEAT_WINDOW_MS) return saved.snapshot;
    return { ...current, chatId: copy.chatId, messageId: copy.messageId, chatTitle: "unavailable", edited: false,
      media: "unavailable", links: "unavailable",
      context: JSON.stringify({ repeatOf: { chatId: current.chatId, messageId: current.messageId },
        note: "earlier copy's own snapshot unavailable; body is the current copy, same content after normalization; reply context, media and links unavailable" }) };
  }
}
