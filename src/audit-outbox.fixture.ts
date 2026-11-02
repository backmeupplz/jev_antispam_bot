// Shared by the audit-outbox integration test files (split so bun test --parallel runs them at once)
import { test } from "bun:test";
import { Api } from "grammy";
import pg from "pg";
import { AUDIT_CHAT_ID, PostgresDeletionAudit } from "./audit-outbox";
export const url = process.env.AUDIT_TEST_DATABASE_URL;
if (url && (!["/jev_audit_test", "/jev_stats_test"].includes(new URL(url).pathname) || !["127.0.0.1", "localhost"].includes(new URL(url).hostname))) throw new Error("Dedicated local audit test database required");
// A timed-out test never reaches its finally: close whatever it opened before the next test resets the tables,
// so a straggling worker, pool or open transaction cannot block (or deadlock) the next fixture.
const leftovers: Array<() => unknown> = [];
export function owned<T>(resource: T, close: (resource: T) => unknown): T { leftovers.push(() => close(resource)); return resource; }
// Runs inside each test rather than a beforeEach hook: the deploy build's Bun 1.3 rejects hook timeouts, and closing
// waits for in-flight queries (bounded by the 10s lock timeout and the audit's own timeouts), beyond Bun's 5s default.
async function closeLeftovers() { await Promise.allSettled(leftovers.splice(0).map(async close => await close())); }
// Bun's 5s default is too tight on a loaded host; a slow test should pass, not cascade into the next one.
export const integration = url
  ? (name: string, run: () => Promise<void>, timeoutMs = 60_000) => test(name, async () => { await closeLeftovers(); await run(); }, timeoutMs)
  : test.skip;
export const options = { paceMs: 1, timeoutMs: 100, sendLeaseMs: 1_000 };
export const testPool = () => owned(new pg.Pool({ connectionString: url, lock_timeout: 10_000 }), pool => pool.end());
export const auditor = (api: Api, overrides: ConstructorParameters<typeof PostgresDeletionAudit>[2] = options) =>
  owned(new PostgresDeletionAudit(url!, api, overrides), audit => audit.close());
export function transport() {
  const api = new Api("123:fixture");
  const calls: unknown[] = [];
  let action: () => Promise<unknown> = async () => ({ ok: true, result: { message_id: 1, date: 1, chat: { id: AUDIT_CHAT_ID, type: "group", title: "fixture" } } });
  api.config.use(async (_previous, _method, payload) => { calls.push(payload); return await action() as never; });
  return { api, calls, action: (next: typeof action) => { action = next; } };
}
export async function fixture() {
  const db = testPool();
  const t = transport();
  const audit = auditor(t.api);
  // Same lock order as the code under test (sink row, then tables), and before initialize() so rows left by an
  // aborted run cannot push its index creation past the 1s statement timeout (or, with only 004 applied, be
  // copied into parts by 005).
  await db.query("DO $$ BEGIN IF to_regclass('deletion_audit_sink') IS NOT NULL THEN PERFORM 1 FROM deletion_audit_sink FOR UPDATE; END IF; IF to_regclass('deletion_audit_parts') IS NOT NULL THEN TRUNCATE deletion_audit_parts,deletion_audit_outbox; ELSIF to_regclass('deletion_audit_outbox') IS NOT NULL THEN TRUNCATE deletion_audit_outbox; END IF; END $$");
  await audit.initialize();
  await db.query("UPDATE deletion_audit_sink SET next_send_at=NOW(),prepared=0,refused=0,expired=0,expired_undelivered=0");
  const state = async (id: string) => (await db.query("SELECT state,attempts FROM deletion_audit_outbox WHERE id=$1", [id])).rows[0];
  const ready = async () => { await db.query("UPDATE deletion_audit_sink SET next_send_at=NOW(); UPDATE deletion_audit_outbox SET next_attempt_at=NOW(); UPDATE deletion_audit_parts SET next_attempt_at=NOW()"); };
  return { pool: db, t, audit, state, ready, close: async () => { await audit.close(); await db.end(); } };
}
