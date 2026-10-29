import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { GrammyError, type Api } from "grammy";
import pg from "pg";

export const AUDIT_CHAT_ID = -5477973916;
/** Fixed, content-free reasons an intent was not admitted (safe to log). */
export type AuditRefusal = "invalid" | "closing" | "duplicate" | "capacity" | "database";
export interface DeletionAudit {
  /** undefined means skip deletion; `refused` (optional) receives the allowlisted reason. */
  prepare(chatId: number, messageId: number, report: string | string[], refused?: (reason: AuditRefusal) => void): Promise<string | undefined>;
  confirmed(id: string): Promise<void>;
  failed(id: string, ambiguous?: boolean): Promise<void>;
}
type AuditApi = Pick<Api, "sendMessage">;
type Options = { capacity?: number; retentionMs?: number; timeoutMs?: number; intentLeaseMs?: number;
  sendLeaseMs?: number; pollMs?: number; paceMs?: number; stallMs?: number };
type Claimed = { id: string; sequence: number; report: string; lease_token: string; attempts: number };
export const MAX_AUDIT_PARTS = 256;
/** Retained reports have no hard cap (retention × deletion attempts); above the tested 100k scale, alert. */
export const RETAINED_REPORTS_ALERT = 100_000;
/** Parts that may still be sent; the only rows that occupy capacity (exported for the plan test). */
export const LIVE_PARTS_SQL = "SELECT COUNT(*) FROM deletion_audit_parts p JOIN deletion_audit_outbox o ON o.id=p.audit_id WHERE p.state IN ('pending','sending') AND o.state IN ('intent','pending','sending') AND o.expires_at>statement_timestamp()";
const DAY = 86_400_000;
const STATEMENT_MS = 1_000;
/** Intents whose prepare() failed with an unknown COMMIT outcome, kept so the same process can reuse them. */
const UNCERTAIN_INTENTS = 1_000;
/** node-postgres honours a per-query query_timeout (lib/client.js); @types/pg does not declare it. */
const timed = (text: string, timeoutMs: number, values?: unknown[]) => ({ text, values, query_timeout: timeoutMs }) as pg.QueryConfig;
function bounded(value: number | undefined, fallback: number, min: number, max: number): number {
  const result = value ?? fallback;
  if (!Number.isSafeInteger(result) || result < min || result > max) throw new Error("Invalid audit limit");
  return result;
}

/** One attempt only. No transformer retries: a lost response is not proof of non-delivery. */
export async function sendAuditReport(api: AuditApi, report: string, timeoutMs: number): Promise<number> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const receipt = await Promise.race([
      api.sendMessage(AUDIT_CHAT_ID, report, { parse_mode: "HTML", link_preview_options: { is_disabled: true } }, controller.signal as Parameters<Api["sendMessage"]>[3]),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => { controller.abort(); reject(new Error("Audit transport timeout")); }, timeoutMs);
      }),
    ]);
    if (!Number.isSafeInteger(receipt?.message_id) || receipt.message_id <= 0) throw new Error("Invalid audit receipt");
    return receipt.message_id;
  } finally { if (timer) clearTimeout(timer); }
}

export class PostgresDeletionAudit implements DeletionAudit {
  private readonly pool: pg.Pool;
  private readonly limits: Required<Options>;
  private migration?: Promise<void>;
  private timer?: ReturnType<typeof setInterval>;
  private work?: Promise<void>;
  private closing = false;
  private closePromise?: Promise<void>;
  private readonly uncertain = new Map<string, string>();
  /** (chat, message) keys with a prepare() in flight here: two callers must never share one reused intent. */
  private readonly preparing = new Set<string>();
  private readonly counters = { prepared: 0, refused: 0, capacityRefused: 0, duplicate: 0, confirmed: 0, deleteFailed: 0,
    deleteUnknown: 0, sent: 0, sendUnknown: 0, retried: 0, terminal: 0, expired: 0, expiredUndelivered: 0, error: 0 };
  constructor(databaseUrl: string, private readonly api: AuditApi, options: Options = {}) {
    const timeoutMs = bounded(options.timeoutMs, 10_000, 10, 30_000);
    const sendLeaseMs = bounded(options.sendLeaseMs, 60_000, timeoutMs + 100, 120_000);
    this.limits = { timeoutMs, sendLeaseMs,
      capacity: bounded(options.capacity, 10_000, 1, 100_000),
      retentionMs: bounded(options.retentionMs, 7 * DAY, sendLeaseMs + 100, 30 * DAY),
      intentLeaseMs: bounded(options.intentLeaseMs, 120_000, 100, 300_000),
      pollMs: bounded(options.pollMs, 1_000, 10, 60_000),
      paceMs: bounded(options.paceMs, 3_100, 1, 60_000),
      stallMs: bounded(options.stallMs, 3_000, STATEMENT_MS, 30_000),
    };
    // The worker tick, the update handler and the bot's delete-retry queue may each wait out a stall on one
    // connection; the rest keep confirmed()/failed() and the health summary from waiting on them.
    this.pool = new pg.Pool({ connectionString: databaseUrl, max: 5, connectionTimeoutMillis: 2_000,
      statement_timeout: STATEMENT_MS, query_timeout: STATEMENT_MS + 200, idle_in_transaction_session_timeout: 3_000,
      idleTimeoutMillis: 10_000, application_name: "jev_deletion_audit" });
    this.pool.on("error", () => { this.counters.error++; });
  }
  health() { return { ...this.counters }; }
  initialize(): Promise<void> {
    return this.migration ??= this.transaction(async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(69004)");
      // 004/005 (with 005's whole-table legacy backfill) run only until the parts table exists: they commit
      // together, and re-running CREATE INDEX IF NOT EXISTS takes table locks that can deadlock a live replica.
      if (!(await client.query("SELECT to_regclass('deletion_audit_parts') AS parts")).rows[0].parts) {
        await client.query(readFileSync(new URL("../migrations/004_deletion_audit.sql", import.meta.url), "utf8"));
        await client.query(readFileSync(new URL("../migrations/005_deletion_audit_parts.sql", import.meta.url), "utf8"));
      }
      await client.query(readFileSync(new URL("../migrations/006_deletion_audit_live_indexes.sql", import.meta.url), "utf8"));
    }).catch(() => { this.migration = undefined; this.counters.error++; throw new Error("Audit database initialization failed"); });
  }
  private async transaction<T>(run: (client: pg.PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    let failed = false;
    try {
      await client.query("BEGIN");
      const result = await run(client);
      // COMMIT waits for the WAL fsync, which stalls for seconds when the host disk is busy (#277). Giving up
      // early would only make an outcome that is usually a success unknown.
      await client.query(timed("COMMIT", this.limits.stallMs + 200));
      return result;
    } catch (error) {
      // Destroy on timeout/uncertain COMMIT; never reuse a possibly open transaction.
      failed = true; throw error;
    }
    finally { client.release(failed); }
  }
  private async lock(client: pg.PoolClient) {
    // ponytail: one sink row serializes capacity and send pacing across replicas.
    // Its holder keeps it through COMMIT, so waiting for it gets the fsync-stall budget, not the 1s statement
    // budget (#277: most audit timeouts were waits here while the holder sat in IO:WALSync).
    await client.query(`SET LOCAL statement_timeout = ${this.limits.stallMs}`);
    const lock = await client.query(timed("SELECT chat_id FROM deletion_audit_sink WHERE chat_id=$1 FOR UPDATE",
      this.limits.stallMs + 200, [AUDIT_CHAT_ID]));
    if (lock.rowCount !== 1) throw new Error("Audit sink unavailable");
    await client.query(`SET LOCAL statement_timeout = ${STATEMENT_MS}`);
  }
  private async maintain(client: pg.PoolClient) {
    await client.query("UPDATE deletion_audit_parts p SET state='send_unknown',lease_until=NULL,lease_token=NULL FROM deletion_audit_outbox o WHERE p.audit_id=o.id AND p.state='sending' AND o.state='sending' AND o.lease_until<=clock_timestamp()");
    const stale = await client.query(
      "UPDATE deletion_audit_outbox SET state=CASE state WHEN 'intent' THEN 'delete_unknown' ELSE 'send_unknown' END, lease_until=NULL, lease_token=NULL WHERE state IN ('intent','sending') AND lease_until<=clock_timestamp() RETURNING state");
    for (const row of stale.rows) this.counters[row.state === "delete_unknown" ? "deleteUnknown" : "sendUnknown"]++;
    const expired = await client.query(
      // Stable statement_timestamp() keeps expiry on the expires_at index; 100 reports (≤25,600 parts) per pass.
      "WITH gone AS (DELETE FROM deletion_audit_outbox WHERE id IN (SELECT id FROM deletion_audit_outbox WHERE expires_at<=statement_timestamp() AND state NOT IN ('intent','sending') ORDER BY expires_at LIMIT 100) RETURNING state) SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE state IN ('pending','send_unknown','delete_unknown','terminal'))::int AS undelivered FROM gone");
    const { total, undelivered } = expired.rows[0];
    if (total) {
      await client.query("UPDATE deletion_audit_sink SET expired=expired+$1, expired_undelivered=expired_undelivered+$2", [total, undelivered]);
      this.counters.expired += total; this.counters.expiredUndelivered += undelivered;
    }
  }
  async prepare(chatId: number, messageId: number, report: string | string[], refused?: (reason: AuditRefusal) => void): Promise<string | undefined> {
    const refuse = (reason: AuditRefusal): undefined => {
      this.counters[reason === "duplicate" ? "duplicate" : "refused"]++;
      if (reason === "capacity") this.counters.capacityRefused++;
      try { refused?.(reason); } catch { /* A reporting callback never changes admission. */ }
      return undefined;
    };
    // Snapshot caller-owned arrays before the first await; never clip an intent.
    const parts = typeof report === "string" ? [report] : Array.isArray(report) ? [...report] : [];
    if (this.closing) return refuse("closing");
    if (!Number.isSafeInteger(chatId) || chatId === AUDIT_CHAT_ID || !Number.isSafeInteger(messageId) || messageId <= 0 ||
        parts.length < 1 || parts.length > MAX_AUDIT_PARTS || parts.some(part => typeof part !== "string" || !part || part.length > 4_000 || Buffer.byteLength(part) > 16_000)) {
      return refuse("invalid");
    }
    let result: { id: string } | { refusal: AuditRefusal };
    const key = `${chatId}:${messageId}`;
    // Another prepare() for this message is in flight here; its outcome is unknown yet, so this is transient:
    // the caller retries or queues, and meets a real `duplicate` once that one has landed.
    if (this.preparing.has(key)) return refuse("database");
    // A retry after an unknown COMMIT outcome reuses that attempt's id, so whichever attempt landed is ours.
    // It is handed out once: taken here, put back only if this attempt fails too.
    const id = this.uncertain.get(key) ?? randomUUID();
    this.uncertain.delete(key); this.preparing.add(key);
    try {
      await this.initialize();
      // Counters/callback run once, after COMMIT settles: a failed COMMIT is only a database refusal.
      result = await this.transaction(async (client): Promise<typeof result> => {
        await this.lock(client); await this.maintain(client);
        const existing = (await client.query("SELECT id,state FROM deletion_audit_outbox WHERE chat_id=$1 AND message_id=$2 FOR UPDATE", [chatId, messageId])).rows[0];
        // Our own earlier prepare() whose COMMIT outcome was unknown: its id never reached a caller, so no
        // deletion ran under it. A live intent is reused; one that went delete_unknown is replaced.
        const own = existing?.id === id;
        if (own && existing.state === "intent") {
          await client.query("UPDATE deletion_audit_outbox SET lease_until=clock_timestamp()+$2*INTERVAL '1 millisecond' WHERE id=$1", [existing.id, this.limits.intentLeaseMs]);
          return { id: existing.id };
        }
        if (existing && existing.state !== "delete_failed" && !(own && existing.state === "delete_unknown")) return { refusal: "duplicate" };
        // Capacity bounds only parts that may still be sent. Sent, terminal, unknown and failed-deletion
        // rows are finished: they stay for dedupe/inspection until retention expiry but never block intents.
        // (A replaced delete_failed intent is therefore already excluded.) Expired reports are never sent either.
        const occupied = Number((await client.query(LIVE_PARTS_SQL)).rows[0].count);
        if (occupied + parts.length > this.limits.capacity) {
          await client.query("UPDATE deletion_audit_sink SET refused=refused+1"); return { refusal: "capacity" };
        }
        // Replace only known-failed (or own never-used) intent, atomically, fencing its old callbacks.
        if (existing) await client.query("DELETE FROM deletion_audit_outbox WHERE id=$1", [existing.id]);
        await client.query(
          "INSERT INTO deletion_audit_outbox(id,chat_id,message_id,report,state,expires_at,lease_until) VALUES ($1,$2,$3,$4,'intent',clock_timestamp()+$5*INTERVAL '1 millisecond',clock_timestamp()+$6*INTERVAL '1 millisecond')",
          [id, chatId, messageId, parts[0], this.limits.retentionMs, this.limits.intentLeaseMs]);
        await client.query("INSERT INTO deletion_audit_parts(audit_id,sequence,report,state) SELECT $1,ordinality,body,'pending' FROM unnest($2::text[]) WITH ORDINALITY AS part(body,ordinality)", [id, parts]);
        await client.query("UPDATE deletion_audit_sink SET prepared=prepared+1");
        return { id };
      });
    } catch {
      this.counters.error++;
      // The COMMIT may still have landed; remember the id (bounded, oldest first out) for a retry.
      this.uncertain.set(key, id);
      if (this.uncertain.size > UNCERTAIN_INTENTS) this.uncertain.delete(this.uncertain.keys().next().value!);
      return refuse("database");
    } finally { this.preparing.delete(key); }
    if ("refusal" in result) return refuse(result.refusal);
    this.counters.prepared++; return result.id;
  }
  /** A fixed, content-free probe. Never accepts an export body or a destination. */
  async integrationReport(): Promise<string | undefined> {
    const id = await this.prepare(0, 1, ["<b>Integration report — NOT a deletion (1/2)</b>\nHarmless audit delivery check. No message was deleted; no user content is included.", "<b>Integration report — NOT a deletion (2/2)</b>\nFixed multipart delivery check complete. No user content is included."]);
    if (id) await this.confirmed(id);
    return id;
  }
  async status(id: string): Promise<string | undefined> {
    try {
      await this.initialize();
      return (await this.pool.query("SELECT state FROM deletion_audit_outbox WHERE id=$1", [id])).rows[0]?.state;
    } catch { this.counters.error++; throw new Error("Audit status unavailable"); }
  }
  /** Confirmed sink IDs only, in part order; no report or source identity. */
  async receipts(id: string): Promise<Array<{ sequence: number; messageId: number }>> {
    try {
      await this.initialize();
      const rows = await this.pool.query("SELECT sequence,receipt_message_id FROM deletion_audit_parts WHERE audit_id=$1 AND state='sent' AND receipt_message_id IS NOT NULL ORDER BY sequence", [id]);
      return rows.rows.map(row => ({ sequence: row.sequence, messageId: Number(row.receipt_message_id) }));
    } catch { this.counters.error++; throw new Error("Audit receipts unavailable"); }
  }
  async confirmed(id: string): Promise<void> { await this.finishDeletion(id, "pending"); }
  async failed(id: string, ambiguous = false): Promise<void> { await this.finishDeletion(id, ambiguous ? "delete_unknown" : "delete_failed"); }
  private async finishDeletion(id: string, state: string) {
    if (this.closing) { this.counters.error++; return; }
    try {
      await this.initialize();
      const result = await this.pool.query(
        "UPDATE deletion_audit_outbox SET state=$2,lease_until=NULL WHERE id=$1 AND state='intent' AND lease_until>clock_timestamp() AND expires_at>clock_timestamp()",
        [id, state]);
      if (result.rowCount) this.counters[state === "pending" ? "confirmed" : state === "delete_unknown" ? "deleteUnknown" : "deleteFailed"]++;
    } catch { this.counters.error++; } // Durable intent remains unknown; never misreport a classification failure.
  }
  start(): void {
    if (this.timer || this.closing) return;
    this.timer = setInterval(() => { void this.runOnce(); }, this.limits.pollMs);
    this.timer.unref(); void this.runOnce();
  }
  /** One bounded worker tick; also used by the harmless integration-report command. */
  runOnce(): Promise<void> {
    if (this.closing) return Promise.resolve();
    return this.work ??= this.tick().catch(() => { this.counters.error++; }).finally(() => { this.work = undefined; });
  }
  private async tick() {
    await this.initialize();
    const row = await this.transaction(async (client): Promise<Claimed | undefined> => {
      await this.lock(client); await this.maintain(client);
      if (!(await client.query("SELECT 1 FROM deletion_audit_sink WHERE next_send_at<=clock_timestamp()")).rowCount) return;
      // One outstanding send per sink, including across processes and restarts.
      if ((await client.query("SELECT 1 FROM deletion_audit_outbox WHERE state='sending' LIMIT 1")).rowCount) return;
      const candidate = (await client.query("SELECT o.id,p.sequence FROM deletion_audit_outbox o JOIN deletion_audit_parts p ON p.audit_id=o.id WHERE o.state='pending' AND o.expires_at>clock_timestamp() AND p.state='pending' AND p.next_attempt_at<=clock_timestamp() AND NOT EXISTS (SELECT 1 FROM deletion_audit_parts earlier WHERE earlier.audit_id=o.id AND earlier.sequence<p.sequence AND earlier.state<>'sent') ORDER BY p.next_attempt_at,o.created_at,p.sequence LIMIT 1 FOR UPDATE OF o,p SKIP LOCKED")).rows[0];
      if (!candidate) return;
      const token = randomUUID();
      const claimed = (await client.query("UPDATE deletion_audit_parts SET state='sending',lease_until=clock_timestamp()+$3*INTERVAL '1 millisecond',lease_token=$4,attempts=attempts+1 WHERE audit_id=$1 AND sequence=$2 RETURNING audit_id AS id,sequence,report,lease_token,attempts,lease_until", [candidate.id, candidate.sequence, this.limits.sendLeaseMs, token])).rows[0];
      await client.query("UPDATE deletion_audit_outbox SET state='sending',lease_until=$2,lease_token=$3,attempts=$4 WHERE id=$1", [candidate.id, claimed.lease_until, token, claimed.attempts]);
      await client.query("UPDATE deletion_audit_sink SET next_send_at=clock_timestamp()+$1*INTERVAL '1 millisecond'", [this.limits.paceMs]);
      return claimed;
    });
    if (!row) return;
    let state = "sent", delay = this.limits.paceMs;
    let receipt: number | null = null;
    try { receipt = await sendAuditReport(this.api, row.report, this.limits.timeoutMs); }
    catch (error) {
      // Only an explicit Telegram rejection proves the request was not accepted.
      if (error instanceof GrammyError && error.error_code === 429) {
        const seconds = error.parameters.retry_after;
        if (typeof seconds === "number" && Number.isFinite(seconds) && seconds > 0 && seconds <= 30 * 86400) {
          delay = Math.max(delay, seconds * 1000 + 1000);
          state = row.attempts < 5 ? "pending" : "terminal";
        } else state = "terminal";
      } else if (error instanceof GrammyError && error.error_code >= 400 && error.error_code < 500) state = "terminal";
      else state = "send_unknown"; // Network/timeouts/5xx can follow delivery: never blindly resend.
    }
    await this.transaction(async (client) => {
      await this.lock(client);
      const updated = await client.query("UPDATE deletion_audit_parts SET state=$4,lease_until=NULL,lease_token=NULL,next_attempt_at=clock_timestamp()+$5*INTERVAL '1 millisecond',receipt_message_id=$6 WHERE audit_id=$1 AND sequence=$2 AND state='sending' AND lease_token=$3 AND lease_until>clock_timestamp()", [row.id, row.sequence, row.lease_token, state, delay, receipt]);
      if (!updated.rowCount) return;
      const remaining = state === "sent" && (await client.query("SELECT 1 FROM deletion_audit_parts WHERE audit_id=$1 AND state<>'sent' LIMIT 1", [row.id])).rowCount;
      await client.query("UPDATE deletion_audit_outbox SET state=$3,lease_until=NULL,lease_token=NULL,next_attempt_at=clock_timestamp()+$4*INTERVAL '1 millisecond' WHERE id=$1 AND state='sending' AND lease_token=$2", [row.id, row.lease_token, remaining ? "pending" : state, delay]);
      // Completion-based pacing is conservative and survives a 429/restart/second worker.
      await client.query("UPDATE deletion_audit_sink SET next_send_at=GREATEST(next_send_at,clock_timestamp()+$1*INTERVAL '1 millisecond')", [delay]);
      this.counters[state === "sent" ? "sent" : state === "pending" ? "retried" : state === "terminal" ? "terminal" : "sendUnknown"]++;
    });
  }
  /** Durable, identity/content-free state summary; throws a generic error on DB failure. */
  async summary(): Promise<Record<string, number> & { retained: number }> {
    try {
      await this.initialize();
      const rows = await this.pool.query("SELECT state,COUNT(*)::int AS count FROM deletion_audit_outbox GROUP BY state");
      const sink = (await this.pool.query("SELECT prepared,refused,expired,expired_undelivered FROM deletion_audit_sink")).rows[0];
      const retained = rows.rows.reduce((total, row) => total + row.count, 0);
      return { ...Object.fromEntries([...rows.rows.map((row) => [row.state, row.count]), ...Object.entries(sink).map(([key, value]) => [key, Number(value)])]), retained };
    } catch { this.counters.error++; throw new Error("Audit summary unavailable"); }
  }
  close(): Promise<void> {
    return this.closePromise ??= (async () => {
      this.closing = true; if (this.timer) clearInterval(this.timer);
      await this.work; await this.pool.end();
    })();
  }
}
