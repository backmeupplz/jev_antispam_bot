import { expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { Api } from "grammy";
import pg from "pg";
import { AUDIT_CHAT_ID, PostgresDeletionAudit } from "./audit-outbox";
const url = process.env.AUDIT_TEST_DATABASE_URL;
if (url && (!["/jev_audit_test", "/jev_stats_test"].includes(new URL(url).pathname) || !["127.0.0.1", "localhost"].includes(new URL(url).hostname))) throw new Error("Dedicated local audit test database required");
const integration = url ? test : test.skip;
const options = { paceMs: 1, timeoutMs: 100, sendLeaseMs: 1_000 };
function transport() {
  const api = new Api("123:fixture");
  const calls: unknown[] = [];
  let action: () => Promise<unknown> = async () => ({ ok: true, result: { message_id: 1, date: 1, chat: { id: AUDIT_CHAT_ID, type: "group", title: "fixture" } } });
  api.config.use(async (_previous, _method, payload) => { calls.push(payload); return await action() as never; });
  return { api, calls, action: (next: typeof action) => { action = next; } };
}
async function fixture() {
  const pool = new pg.Pool({ connectionString: url });
  const t = transport();
  const audit = new PostgresDeletionAudit(url!, t.api, options);
  await audit.initialize();
  await pool.query("TRUNCATE deletion_audit_outbox; UPDATE deletion_audit_sink SET next_send_at=NOW(),prepared=0,refused=0,expired=0,expired_undelivered=0");
  const state = async (id: string) => (await pool.query("SELECT state,attempts FROM deletion_audit_outbox WHERE id=$1", [id])).rows[0];
  const ready = async () => { await pool.query("UPDATE deletion_audit_sink SET next_send_at=NOW(); UPDATE deletion_audit_outbox SET next_attempt_at=NOW()"); };
  return { pool, t, audit, state, ready, close: async () => { await audit.close(); await pool.end(); } };
}

integration("migration concurrency, durable intent, restart, source dedupe and no send before confirmation", async () => {
  const f = await fixture();
  const other = new PostgresDeletionAudit(url!, f.t.api, options);
  try {
    await Promise.all([f.audit.initialize(), other.initialize()]);
    const ids = await Promise.all([f.audit.prepare(-69, 1, "<b>confirmed fixture</b>"), other.prepare(-69, 1, "fixture")]);
    expect(ids.filter(Boolean)).toHaveLength(1); const id = ids.find(Boolean)!;
    expect((await f.state(id)).state).toBe("intent");
    await other.runOnce(); expect(f.t.calls).toHaveLength(0);
    await f.audit.close(); await other.confirmed(id); await other.confirmed(id);
    await other.runOnce(); expect(f.t.calls).toHaveLength(1); expect((await f.state(id)).state).toBe("sent");
    expect(await other.prepare(-69, 1, "fixture")).toBeUndefined();
    await other.runOnce(); expect(f.t.calls).toHaveLength(1);
  } finally { await other.close(); await f.close(); }
});

integration("known deletion failure retry fences old callbacks; ambiguity and stale intents never confirm", async () => {
  const f = await fixture();
  try {
    const first = (await f.audit.prepare(-69, 1, "fixture"))!;
    await f.audit.failed(first);
    const retry = (await f.audit.prepare(-69, 1, "retry"))!; expect(retry).not.toBe(first);
    await f.audit.confirmed(first); expect((await f.state(retry)).state).toBe("intent");
    await f.audit.failed(retry, true); await f.audit.confirmed(retry);
    expect((await f.state(retry)).state).toBe("delete_unknown");
    expect(await f.audit.prepare(-69, 1, "retry")).toBeUndefined();
    const stale = (await f.audit.prepare(-69, 2, "fixture"))!;
    await f.pool.query("UPDATE deletion_audit_outbox SET lease_until=NOW()-INTERVAL '1 second' WHERE id=$1", [stale]);
    await f.audit.confirmed(stale); await f.audit.runOnce();
    expect((await f.state(stale)).state).toBe("delete_unknown"); expect(f.t.calls).toHaveLength(0);
  } finally { await f.close(); }
});

integration("atomic leases across workers, durable pacing and stale send become unknown without replay", async () => {
  const f = await fixture(); const other = new PostgresDeletionAudit(url!, f.t.api, options);
  try {
    const id = (await f.audit.prepare(-69, 1, "fixture"))!; await f.audit.confirmed(id);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let entered!: () => void; const started = new Promise<void>((resolve) => { entered = resolve; });
    f.t.action(async () => { entered(); await gate; return { ok: true, result: {} }; });
    const running = f.audit.runOnce(); await started;
    await other.runOnce(); expect(f.t.calls).toHaveLength(1);
    release(); await running; expect((await f.state(id)).state).toBe("sent");
    const stale = (await other.prepare(-69, 2, "fixture"))!; await other.confirmed(stale);
    await f.pool.query("UPDATE deletion_audit_outbox SET state='sending',lease_token=$2,lease_until=NOW()-INTERVAL '1 second',attempts=1 WHERE id=$1", [stale, randomUUID()]);
    await f.audit.runOnce(); await other.runOnce();
    expect((await f.state(stale)).state).toBe("send_unknown"); expect(f.t.calls).toHaveLength(1);
    expect(await other.prepare(-69, 2, "fixture")).toBeUndefined();
  } finally { await other.close(); await f.close(); }
});

integration("capacity is atomic across replicas; expiry bounded, explicit and does not evict early", async () => {
  const f = await fixture(); const a = new PostgresDeletionAudit(url!, f.t.api, { ...options, capacity: 2 });
  const b = new PostgresDeletionAudit(url!, f.t.api, { ...options, capacity: 2 });
  try {
    const ids = await Promise.all([a.prepare(-69, 1, "private fixture"), b.prepare(-69, 2, "private fixture"), a.prepare(-69, 3, "private fixture")]);
    expect(ids.filter(Boolean)).toHaveLength(2);
    for (const id of ids.filter(Boolean)) await a.confirmed(id!);
    expect(await a.prepare(-69, 4, "fixture")).toBeUndefined();
    expect((await a.summary()).pending).toBe(2);
    await f.pool.query("UPDATE deletion_audit_outbox SET created_at=NOW()-INTERVAL '2 days',expires_at=NOW()-INTERVAL '1 day'");
    expect(await b.prepare(-69, 4, "fixture")).toBeDefined();
    const summary = await a.summary(); expect(summary.expired).toBe(2); expect(summary.expired_undelivered).toBe(2);
    expect(JSON.stringify(summary)).not.toContain("private"); expect(JSON.stringify(a.health())).not.toContain("fixture");
    expect(f.t.calls).toHaveLength(0);
  } finally { await Promise.all([a.close(), b.close()]); await f.close(); }
});

integration("429 durable global backoff survives restart, stops at five attempts", async () => {
  const f = await fixture(); const other = new PostgresDeletionAudit(url!, f.t.api, options);
  try {
    f.t.action(async () => ({ ok: false, error_code: 429, description: "private error must not be logged", parameters: { retry_after: 60 } }));
    const id = (await f.audit.prepare(-69, 1, "fixture"))!; await f.audit.confirmed(id); await f.audit.runOnce();
    expect((await f.state(id))).toEqual({ state: "pending", attempts: 1 });
    expect((await f.pool.query("SELECT next_send_at>NOW()+INTERVAL '59 seconds' AS delayed FROM deletion_audit_sink")).rows[0].delayed).toBe(true);
    await f.audit.close(); await other.runOnce(); expect(f.t.calls).toHaveLength(1);
    for (let i = 0; i < 4; i++) { await f.ready(); await other.runOnce(); }
    expect((await f.state(id))).toEqual({ state: "terminal", attempts: 5 });
    await f.ready(); await other.runOnce(); expect(f.t.calls).toHaveLength(5);
  } finally { await other.close(); await f.close(); }
});

integration("network errors, API 5xx and abort are unknown; known 400/403 are terminal", async () => {
  const f = await fixture();
  try {
    for (const [i, action, state] of [
      [1, async () => { throw new Error("private payload"); }, "send_unknown"],
      [2, async () => ({ ok: false, error_code: 500, description: "fixture" }), "send_unknown"],
      [3, async () => ({ ok: false, error_code: 400, description: "fixture" }), "terminal"],
      [4, async () => ({ ok: false, error_code: 403, description: "fixture" }), "terminal"],
      [5, async () => await new Promise<never>(() => {}), "send_unknown"],
    ] as const) {
      f.t.action(action); const id = (await f.audit.prepare(-69, i, "fixture"))!;
      await f.audit.confirmed(id); await f.ready(); await f.audit.runOnce(); expect((await f.state(id)).state).toBe(state);
    }
    await f.ready(); await f.audit.runOnce(); expect(f.t.calls).toHaveLength(5);
    expect(JSON.stringify(f.audit.health())).not.toContain("private");
  } finally { await f.close(); }
});

integration("database outage refuses deletion intent without leaking errors", async () => {
  const audit = new PostgresDeletionAudit("postgresql://fixture@127.0.0.1:1/jev_audit_test", transport().api);
  try {
    expect(await audit.prepare(-69, 1, "private fixture")).toBeUndefined();
    expect(audit.health().refused).toBe(1); expect(audit.health().error).toBeGreaterThan(0);
    await audit.confirmed(randomUUID()); await audit.failed(randomUUID());
  } finally { await audit.close(); }
});


integration("first migration is race-safe and database constraints reject invalid leases", async () => {
  const pool = new pg.Pool({ connectionString: url });
  await pool.query("DROP TABLE deletion_audit_outbox; DROP TABLE deletion_audit_sink");
  const t = transport(); const a = new PostgresDeletionAudit(url!, t.api, options); const b = new PostgresDeletionAudit(url!, t.api, options);
  try {
    await Promise.all([a.initialize(), b.initialize()]);
    const id = (await a.prepare(-69, 1, "fixture"))!;
    await expect(pool.query("UPDATE deletion_audit_outbox SET state='sending' WHERE id=$1", [id])).rejects.toBeDefined();
    await expect(pool.query("UPDATE deletion_audit_sink SET chat_id=1")).rejects.toBeDefined();
    await expect(pool.query("UPDATE deletion_audit_outbox SET report=repeat('x',16001) WHERE id=$1", [id])).rejects.toBeDefined();
  } finally { await Promise.all([a.close(), b.close()]); await pool.end(); }
});

integration("harmless integration report uses same durable route, fixed body and dedupe", async () => {
  const f = await fixture();
  try {
    const id = (await f.audit.integrationReport())!; expect(id).toBeDefined();
    expect(await f.audit.status(id)).toBe("pending"); await f.audit.runOnce();
    expect(await f.audit.status(id)).toBe("sent");
    expect(f.t.calls).toHaveLength(1);
    const payload = f.t.calls[0] as { chat_id: number; text: string };
    expect(payload.chat_id).toBe(AUDIT_CHAT_ID); expect(payload.text).toContain("NOT a deletion");
    expect(await f.audit.integrationReport()).toBeUndefined();
  } finally { await f.close(); }
});

integration("shutdown waits for active send and does not schedule another", async () => {
  const f = await fixture();
  try {
    const id = (await f.audit.prepare(-69, 1, "fixture"))!; await f.audit.confirmed(id);
    let entered!: () => void; const started = new Promise<void>((resolve) => { entered = resolve; });
    let release!: () => void; const gate = new Promise<void>((resolve) => { release = resolve; });
    f.t.action(async () => { entered(); await gate; return { ok: true, result: {} }; });
    f.audit.start(); f.audit.start(); await started;
    let closed = false; const closing = f.audit.close().then(() => { closed = true; });
    await Bun.sleep(10); expect(closed).toBe(false); release(); await closing;
    expect((await f.state(id)).state).toBe("sent"); expect(f.t.calls).toHaveLength(1);
    expect(await f.audit.prepare(-69, 2, "fixture")).toBeUndefined();
  } finally { await f.close(); }
});
