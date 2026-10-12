import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { Api } from "grammy";
import pg from "pg";
import { AUDIT_CHAT_ID, PostgresDeletionAudit } from "./audit-outbox";
import { renderAuditReport, type AuditSnapshot } from "./audit-report";
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
  await pool.query("TRUNCATE deletion_audit_parts,deletion_audit_outbox; UPDATE deletion_audit_sink SET next_send_at=NOW(),prepared=0,refused=0,expired=0,expired_undelivered=0");
  const state = async (id: string) => (await pool.query("SELECT state,attempts FROM deletion_audit_outbox WHERE id=$1", [id])).rows[0];
  const ready = async () => { await pool.query("UPDATE deletion_audit_sink SET next_send_at=NOW(); UPDATE deletion_audit_outbox SET next_attempt_at=NOW(); UPDATE deletion_audit_parts SET next_attempt_at=NOW()"); };
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
    const reasons: string[] = [];
    expect(await other.prepare(-69, 1, "fixture", reason => reasons.push(reason))).toBeUndefined();
    expect(reasons).toEqual(["duplicate"]);
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
    f.t.action(async () => { entered(); await gate; return { ok: true, result: { message_id: 1 } }; });
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
    const reasons: string[] = [];
    expect(await audit.prepare(-69, 1, "private fixture", reason => reasons.push(reason))).toBeUndefined();
    expect(reasons).toEqual(["database"]); expect(audit.health().capacityRefused).toBe(0);
    expect(audit.health().refused).toBe(1); expect(audit.health().error).toBeGreaterThan(0);
    await audit.confirmed(randomUUID()); await audit.failed(randomUUID());
  } finally { await audit.close(); }
});


integration("first migration is race-safe and database constraints reject invalid leases", async () => {
  const pool = new pg.Pool({ connectionString: url });
  await pool.query("DROP TABLE deletion_audit_parts; DROP TABLE deletion_audit_outbox; DROP TABLE deletion_audit_sink");
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
    expect(await f.audit.status(id)).toBe("pending"); await f.ready(); await f.audit.runOnce();
    expect(await f.audit.status(id)).toBe("sent");
    expect(f.t.calls).toHaveLength(2);
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
    f.t.action(async () => { entered(); await gate; return { ok: true, result: { message_id: 1 } }; });
    f.audit.start(); f.audit.start(); await started;
    let closed = false; const closing = f.audit.close().then(() => { closed = true; });
    await Bun.sleep(10); expect(closed).toBe(false); release(); await closing;
    expect((await f.state(id)).state).toBe("sent"); expect(f.t.calls).toHaveLength(1);
    const reasons: string[] = [];
    expect(await f.audit.prepare(-69, 2, "fixture", reason => reasons.push(reason))).toBeUndefined();
    expect(reasons).toEqual(["closing"]);
  } finally { await f.close(); }
});

function accepted(messageId: number) { return { ok: true, result: { message_id: messageId } }; }

integration("complete multipart snapshot survives restart after first receipt with ordered no-replay delivery", async () => {
  const f = await fixture(); const other = new PostgresDeletionAudit(url!, f.t.api, options);
  try {
    const parts = Array.from({ length: 4 }, (_, i) => "<pre>" + ("段😀 &amp; " + i).repeat(200) + "</pre>");
    const expected = [...parts]; const preparing = f.audit.prepare(-69, 1, parts); parts[0] = "caller mutation";
    const id = (await preparing)!; expect(id).toBeDefined();
    const stored = (await f.pool.query("SELECT report FROM deletion_audit_parts WHERE audit_id=$1 ORDER BY sequence", [id])).rows.map(row => row.report);
    expect(stored).toEqual(expected); expect(stored.join("")).toBe(expected.join(""));
    await f.audit.runOnce(); expect(f.t.calls).toHaveLength(0);
    await f.audit.confirmed(id); f.t.action(async () => accepted(901)); await f.audit.runOnce();
    expect(await f.audit.status(id)).toBe("pending"); expect(await f.audit.receipts(id)).toEqual([{ sequence: 1, messageId: 901 }]);
    await f.audit.close();
    for (let i = 1; i < expected.length; i++) { await f.ready(); f.t.action(async () => accepted(901 + i)); await other.runOnce(); }
    expect(await other.status(id)).toBe("sent");
    expect(f.t.calls.map(call => (call as {text:string}).text)).toEqual(expected);
    expect(await other.receipts(id)).toEqual(expected.map((_, i) => ({ sequence: i + 1, messageId: 901 + i })));
    await f.ready(); await other.runOnce(); expect(f.t.calls).toHaveLength(4);
  } finally { await other.close(); await f.close(); }
});

integration("ambiguous part two blocks remainder across restart but preserves first confirmed receipt", async () => {
  const f = await fixture(); const other = new PostgresDeletionAudit(url!, f.t.api, options);
  try {
    const id = (await f.audit.prepare(-69, 1, ["one", "two", "three"]))!; await f.audit.confirmed(id);
    f.t.action(async () => accepted(101)); await f.audit.runOnce(); await f.ready();
    f.t.action(async () => { throw new Error("lost response after delivery"); }); await f.audit.runOnce();
    expect(await f.audit.status(id)).toBe("send_unknown"); await f.audit.close();
    await f.ready(); await other.runOnce(); expect(f.t.calls).toHaveLength(2);
    expect(await other.receipts(id)).toEqual([{ sequence: 1, messageId: 101 }]);
    expect((await f.pool.query("SELECT state FROM deletion_audit_parts WHERE audit_id=$1 ORDER BY sequence", [id])).rows.map(row => row.state)).toEqual(["sent", "send_unknown", "pending"]);
  } finally { await other.close(); await f.close(); }
});

integration("429 retries only the current part and durably paces all workers and reports", async () => {
  const f = await fixture(); const other = new PostgresDeletionAudit(url!, f.t.api, options);
  try {
    const id = (await f.audit.prepare(-69, 1, ["one", "two", "three"]))!; await f.audit.confirmed(id);
    f.t.action(async () => accepted(101)); await f.audit.runOnce(); await f.ready();
    f.t.action(async () => ({ ok: false, error_code: 429, description: "fixture", parameters: { retry_after: 60 } })); await f.audit.runOnce();
    const second = (await other.prepare(-69, 2, "other"))!; await other.confirmed(second);
    await f.audit.close(); await other.runOnce(); expect(f.t.calls).toHaveLength(2);
    f.t.action(async () => accepted(102));
    for (let i = 0; i < 3; i++) { await f.ready(); await other.runOnce(); }
    expect(await other.status(id)).toBe("sent");
    expect(f.t.calls.map(call => (call as {text:string}).text).filter(text => text !== "other")).toEqual(["one", "two", "two", "three"]);
    expect((await f.pool.query("SELECT attempts FROM deletion_audit_parts WHERE audit_id=$1 ORDER BY sequence", [id])).rows.map(row => row.attempts)).toEqual([1, 2, 1]);
  } finally { await other.close(); await f.close(); }
});

integration("multipart capacity counts live parts atomically and refuses whole intents", async () => {
  const f = await fixture(); const a = new PostgresDeletionAudit(url!, f.t.api, { ...options, capacity: 3 });
  const b = new PostgresDeletionAudit(url!, f.t.api, { ...options, capacity: 3 });
  try {
    const ids = await Promise.all([a.prepare(-69, 1, ["a1", "a2"]), b.prepare(-69, 2, ["b1", "b2"])]);
    expect(ids.filter(Boolean)).toHaveLength(1);
    expect((await f.pool.query("SELECT COUNT(*)::int AS count FROM deletion_audit_parts")).rows[0].count).toBe(2);
    expect((await f.pool.query("SELECT COUNT(*)::int AS count FROM deletion_audit_outbox")).rows[0].count).toBe(1);
    const id = ids.find(Boolean)!; await a.failed(id);
    const source = ids[0] ? 1 : 2;
    expect(await a.prepare(-69, source, ["1", "2", "3", "4"])).toBeUndefined();
    expect(await a.status(id)).toBe("delete_failed");
    const retry = await b.prepare(-69, source, ["1", "2", "3"]); expect(retry).toBeDefined();
    expect((await f.pool.query("SELECT COUNT(*)::int AS count FROM deletion_audit_parts")).rows[0].count).toBe(3);
  } finally { await a.close(); await b.close(); await f.close(); }
});

integration("default capacity ignores 10k finished parts but still refuses a live backlog with a distinct reason", async () => {
  const f = await fixture(); const audit = new PostgresDeletionAudit(url!, f.t.api, { paceMs: 60_000, timeoutMs: 100, sendLeaseMs: 1_000 });
  const rows = async (chatId: number, count: number, outbox: string, part: string) => {
    await f.pool.query("INSERT INTO deletion_audit_outbox(id,chat_id,message_id,report,state,expires_at) SELECT gen_random_uuid(),$1,g,'x',$2,NOW()+INTERVAL '1 day' FROM generate_series(1,$3::int) g", [chatId, outbox, count]);
    await f.pool.query("INSERT INTO deletion_audit_parts(audit_id,sequence,report,state,receipt_message_id) SELECT id,1,'x',$2,CASE WHEN $2='sent' THEN message_id END FROM deletion_audit_outbox WHERE chat_id=$1", [chatId, part]);
  };
  try {
    // Production incident shape: every retained part already finished (mostly sent), at the 10k default.
    await rows(-70, 10_000, "sent", "sent");
    for (const [chat, outbox, part] of [[-71, "delete_failed", "pending"], [-72, "delete_unknown", "pending"], [-73, "terminal", "terminal"], [-74, "send_unknown", "send_unknown"]] as const) await rows(chat, 500, outbox, part);
    const reasons: string[] = [];
    const id = await audit.prepare(-69, 1, ["one", "two"], reason => reasons.push(reason));
    expect(id).toBeDefined(); expect(reasons).toEqual([]);
    // Undelivered work is still bounded: 2 live intent parts + 9,997 pending parts leave room for exactly one more.
    await rows(-75, 9_997, "pending", "pending");
    expect(await audit.prepare(-69, 2, ["a", "b"], reason => reasons.push(reason))).toBeUndefined();
    expect(reasons).toEqual(["capacity"]); expect(audit.health().capacityRefused).toBe(1);
    expect((await audit.summary()).refused).toBe(1);
    expect(await audit.prepare(-69, 3, "fits", reason => reasons.push(reason))).toBeDefined();
    // Delivering frees capacity without waiting for retention expiry.
    await f.pool.query("UPDATE deletion_audit_parts SET state='sent' WHERE audit_id IN (SELECT id FROM deletion_audit_outbox WHERE chat_id=-75 AND message_id<=2)");
    await f.pool.query("UPDATE deletion_audit_outbox SET state='sent' WHERE chat_id=-75 AND message_id<=2");
    expect(await audit.prepare(-69, 2, ["a", "b"], reason => reasons.push(reason))).toBeDefined();
    expect(reasons).toEqual(["capacity"]); expect(f.t.calls).toHaveLength(0);
  } finally { await audit.close(); await f.close(); }
});

integration("capacity counts unsent parts of partly-sent and in-flight multipart reports", async () => {
  const f = await fixture(); const audit = new PostgresDeletionAudit(url!, f.t.api, { ...options, capacity: 4 });
  try {
    const pending = randomUUID(), sending = randomUUID(), token = randomUUID();
    await f.pool.query("INSERT INTO deletion_audit_outbox(id,chat_id,message_id,report,state,expires_at) VALUES ($1,-70,1,'x','pending',NOW()+INTERVAL '1 day')", [pending]);
    await f.pool.query("INSERT INTO deletion_audit_outbox(id,chat_id,message_id,report,state,expires_at,lease_until,lease_token) VALUES ($1,-70,2,'x','sending',NOW()+INTERVAL '1 day',NOW()+INTERVAL '1 hour',$2)", [sending, token]);
    await f.pool.query("INSERT INTO deletion_audit_parts(audit_id,sequence,report,state,receipt_message_id) VALUES ($1,1,'x','sent',1),($1,2,'x','pending',NULL)", [pending]);
    await f.pool.query("INSERT INTO deletion_audit_parts(audit_id,sequence,report,state,lease_until,lease_token) VALUES ($1,1,'x','sending',NOW()+INTERVAL '1 hour',$2),($1,2,'x','pending',NULL,NULL)", [sending, token]);
    // Live: 1 unsent part of the pending report + 2 of the in-flight report = 3 of 4.
    const reasons: string[] = [];
    expect(await audit.prepare(-69, 1, "fits", reason => reasons.push(reason))).toBeDefined();
    expect(await audit.prepare(-69, 2, "full", reason => reasons.push(reason))).toBeUndefined();
    expect(reasons).toEqual(["capacity"]);
    // Expired live reports free their capacity (they are never sent).
    await f.pool.query("UPDATE deletion_audit_outbox SET created_at=NOW()-INTERVAL '2 days',expires_at=NOW()-INTERVAL '1 second' WHERE id=$1", [pending]);
    expect(await audit.prepare(-69, 2, "fits after expiry", reason => reasons.push(reason))).toBeDefined();
  } finally { await audit.close(); await f.close(); }
});

integration("startup on an existing schema takes no table locks; live paths stay indexed with 100k finished rows", async () => {
  const f = await fixture(); const holder = new pg.Client({ connectionString: url });
  try {
    await f.pool.query("INSERT INTO deletion_audit_outbox(id,chat_id,message_id,report,state,expires_at) SELECT gen_random_uuid(),-70,g,repeat('x',1000),(ARRAY['sent','delete_failed','send_unknown','terminal'])[1+g%4],NOW()+INTERVAL '1 day' FROM generate_series(1,100000) g");
    await f.pool.query("INSERT INTO deletion_audit_parts(audit_id,sequence,report,state,receipt_message_id) SELECT id,1,report,CASE state WHEN 'delete_failed' THEN 'pending' ELSE state END,CASE state WHEN 'sent' THEN message_id END FROM deletion_audit_outbox WHERE chat_id=-70");
    await f.pool.query("ANALYZE deletion_audit_outbox; ANALYZE deletion_audit_parts");
    // A replica mid-transaction on both tables must not block (or deadlock) another replica's startup.
    await holder.connect(); await holder.query("BEGIN; LOCK TABLE deletion_audit_parts, deletion_audit_outbox IN ROW EXCLUSIVE MODE");
    const audit = new PostgresDeletionAudit(url!, f.t.api, options);
    try {
      await audit.initialize();
      await holder.query("COMMIT");
      const reasons: string[] = [];
      const id = await audit.prepare(-69, 1, "fixture", reason => reasons.push(reason)); expect(id).toBeDefined(); expect(reasons).toEqual([]);
      await audit.confirmed(id!); await f.ready(); await audit.runOnce(); expect(await audit.status(id!)).toBe("sent");
      const plan = JSON.stringify((await f.pool.query("EXPLAIN (FORMAT JSON) SELECT COUNT(*) FROM deletion_audit_parts p JOIN deletion_audit_outbox o ON o.id=p.audit_id WHERE p.state IN ('pending','sending') AND o.state IN ('intent','pending','sending')")).rows);
      expect(plan).toContain("deletion_audit_parts_live"); expect(plan).toContain("deletion_audit_outbox_live");
      expect(plan).not.toContain("Seq Scan");
    } finally { await audit.close(); }
  } finally { await holder.end(); await f.close(); }
}, 30_000);

integration("upgrade adds live indexes to an existing schema while another replica keeps admitting intents", async () => {
  const f = await fixture();
  try {
    await f.pool.query("DROP INDEX deletion_audit_parts_live; DROP INDEX deletion_audit_outbox_leased; DROP INDEX deletion_audit_outbox_live");
    const upgraded = new PostgresDeletionAudit(url!, f.t.api, options);
    try {
      const [, ...ids] = await Promise.all([upgraded.initialize(), ...Array.from({ length: 5 }, (_, i) => f.audit.prepare(-69, i + 1, "fixture"))]);
      expect(ids.every(Boolean)).toBe(true);
      expect((await f.pool.query("SELECT COUNT(*)::int AS count FROM pg_indexes WHERE indexname IN ('deletion_audit_parts_live','deletion_audit_outbox_leased','deletion_audit_outbox_live')")).rows[0].count).toBe(3);
    } finally { await upgraded.close(); }
    // Skipping 004 on restart still restores a missing sink row.
    await f.pool.query("DELETE FROM deletion_audit_sink");
    const restarted = new PostgresDeletionAudit(url!, f.t.api, options);
    try { await restarted.initialize(); expect(await restarted.prepare(-69, 9, "fixture")).toBeDefined(); } finally { await restarted.close(); }
  } finally { await f.close(); }
});

integration("256 parts persist intact and 257 parts are wholly refused", async () => {
  const f = await fixture();
  try {
    const reasons: string[] = [];
    expect(await f.audit.prepare(-69, 1, Array(257).fill("x"), reason => reasons.push(reason))).toBeUndefined();
    expect(reasons).toEqual(["invalid"]);
    expect((await f.pool.query("SELECT COUNT(*)::int AS count FROM deletion_audit_outbox")).rows[0].count).toBe(0);
    const id = (await f.audit.prepare(-69, 2, Array(256).fill("x")))!; expect(id).toBeDefined();
    expect((await f.pool.query("SELECT COUNT(*)::int AS count FROM deletion_audit_parts WHERE audit_id=$1", [id])).rows[0].count).toBe(256);
  } finally { await f.close(); }
});

integration("additive migration preserves old pending and sent rows without invented receipt or replay", async () => {
  const pool = new pg.Pool({ connectionString: url }); const t = transport();
  const audit = new PostgresDeletionAudit(url!, t.api, options); const other = new PostgresDeletionAudit(url!, t.api, options);
  try {
    await pool.query("DROP TABLE IF EXISTS deletion_audit_parts; DROP TABLE IF EXISTS deletion_audit_outbox; DROP TABLE IF EXISTS deletion_audit_sink");
    await pool.query(readFileSync(new URL("../migrations/004_deletion_audit.sql", import.meta.url), "utf8"));
    const pending = randomUUID(), sent = randomUUID();
    await pool.query("INSERT INTO deletion_audit_outbox(id,chat_id,message_id,report,state,expires_at) VALUES ($1,-69,1,'old pending','pending',NOW()+INTERVAL '1 day'),($2,-69,2,'old sent','sent',NOW()+INTERVAL '1 day')", [pending, sent]);
    await Promise.all([audit.initialize(), other.initialize()]);
    expect((await pool.query("SELECT report FROM deletion_audit_parts ORDER BY report")).rows.map(row => row.report)).toEqual(["old pending", "old sent"]);
    expect(await audit.receipts(sent)).toEqual([]); await audit.runOnce();
    expect(t.calls).toHaveLength(1); expect((t.calls[0] as {text:string}).text).toBe("old pending");
    expect(await audit.status(sent)).toBe("sent");
  } finally { await audit.close(); await other.close(); await pool.end(); }
});

integration("stale second-part lease is unknown on restart, never replayed or followed", async () => {
  const f = await fixture(); const other = new PostgresDeletionAudit(url!, f.t.api, options);
  try {
    const id = (await f.audit.prepare(-69, 1, ["one", "two", "three"]))!; await f.audit.confirmed(id);
    f.t.action(async () => accepted(701)); await f.audit.runOnce();
    const token = randomUUID();
    await f.pool.query("UPDATE deletion_audit_outbox SET state='sending',lease_token=$2,lease_until=NOW()-INTERVAL '1 second' WHERE id=$1", [id, token]);
    await f.pool.query("UPDATE deletion_audit_parts SET state='sending',attempts=1,lease_token=$2,lease_until=NOW()-INTERVAL '1 second' WHERE audit_id=$1 AND sequence=2", [id, token]);
    await f.audit.close(); await f.ready(); await other.runOnce();
    expect(await other.status(id)).toBe("send_unknown"); expect(f.t.calls).toHaveLength(1);
    expect(await other.receipts(id)).toEqual([{ sequence: 1, messageId: 701 }]);
    expect((await f.pool.query("SELECT state FROM deletion_audit_parts WHERE audit_id=$1 ORDER BY sequence", [id])).rows.map(row => row.state)).toEqual(["sent", "send_unknown", "pending"]);
  } finally { await other.close(); await f.close(); }
});

integration("normal multipart pacing is global and completion-based across restarted workers", async () => {
  const f = await fixture(); const paced = new PostgresDeletionAudit(url!, f.t.api, { ...options, paceMs: 60_000 });
  const other = new PostgresDeletionAudit(url!, f.t.api, { ...options, paceMs: 60_000 });
  try {
    const id = (await paced.prepare(-69, 1, ["one", "two"]))!; await paced.confirmed(id);
    await paced.runOnce(); await paced.close();
    expect((await f.pool.query("SELECT next_send_at>NOW()+INTERVAL '59 seconds' AS delayed FROM deletion_audit_sink")).rows[0].delayed).toBe(true);
    await other.runOnce(); expect(f.t.calls).toHaveLength(1);
    await f.ready(); await other.runOnce(); expect(f.t.calls).toHaveLength(2); expect(await other.status(id)).toBe("sent");
  } finally { await paced.close(); await other.close(); await f.close(); }
});

integration("concise rendering and pre-upgrade queued HTML survive restart without rewriting", async () => {
  const f = await fixture(); const other = new PostgresDeletionAudit(url!, f.t.api, options);
  try {
    const legacy = ['<b>Confirmed spam deletion — part 1/2</b>\n<pre>old body</pre>', '<b>Own available reply/context</b>\n<pre>{&quot;replySource&quot;:&quot;unavailable&quot;}</pre>'];
    const oldId = (await f.audit.prepare(-71, 1, legacy))!; await f.audit.confirmed(oldId);
    const snapshot: AuditSnapshot = { chatId: -71, messageId: 2, chatTitle: "private", actor: "user:10", actorName: "Alice", senderUrl: "tg://user?id=10", edited: false, body: "new body <&>", media: "none supplied", context: '{"replySource":{"text":"direct source"}}', links: "private links", profile: "private bio" };
    const concise = renderAuditReport(snapshot);
    const newId = (await f.audit.prepare(-71, 2, concise))!; await f.audit.confirmed(newId);
    const failedId = (await f.audit.prepare(-71, 3, renderAuditReport({ ...snapshot, body: "failed deletion" })))!; await f.audit.failed(failedId);
    await f.audit.close();
    for (let i = 0; i < 4; i++) { await f.ready(); await other.runOnce(); }
    expect(f.t.calls.map(call => (call as { text: string }).text)).toEqual([...legacy, '<a href="tg://user?id=10">Alice</a>\n<pre>new body &lt;&amp;&gt;</pre>\n\nReply to: <pre>direct source</pre>']);
    for (const call of f.t.calls) expect(call).toMatchObject({ chat_id: AUDIT_CHAT_ID, parse_mode: "HTML", link_preview_options: { is_disabled: true } });
    expect(await other.status(oldId)).toBe("sent"); expect(await other.status(newId)).toBe("sent"); expect(await other.status(failedId)).toBe("delete_failed");
    expect(await other.prepare(-71, 1, concise)).toBeUndefined();
  } finally { await other.close(); await f.close(); }
});
