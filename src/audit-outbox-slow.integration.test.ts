import { expect } from "bun:test";
import pg from "pg";
import { LIVE_PARTS_SQL } from "./audit-outbox";
import { auditor, fixture, integration, options, owned, url } from "./audit-outbox.fixture";

// The slowest audit-outbox tests (100k rows, sink-lock stalls past the 1s statement budget), apart so they run
// beside the rest under bun test --parallel

integration("startup on an existing schema takes no table locks; live paths stay indexed with 100k finished rows", async () => {
  const f = await fixture(); const holder = owned(new pg.Client({ connectionString: url }), client => client.end());
  try {
    await f.pool.query("INSERT INTO deletion_audit_outbox(id,chat_id,message_id,report,state,expires_at) SELECT gen_random_uuid(),-70,g,'x',(ARRAY['sent','delete_failed','send_unknown','terminal'])[1+g%4],NOW()+INTERVAL '1 day' FROM generate_series(1,100000) g");
    await f.pool.query("INSERT INTO deletion_audit_parts(audit_id,sequence,report,state,receipt_message_id) SELECT id,1,report,CASE state WHEN 'delete_failed' THEN 'pending' ELSE state END,CASE state WHEN 'sent' THEN message_id END FROM deletion_audit_outbox WHERE chat_id=-70");
    await f.pool.query("ANALYZE deletion_audit_outbox; ANALYZE deletion_audit_parts");
    // A replica mid-transaction on both tables must not block (or deadlock) another replica's startup.
    await holder.connect(); await holder.query("BEGIN; LOCK TABLE deletion_audit_parts, deletion_audit_outbox IN ROW EXCLUSIVE MODE");
    const audit = auditor(f.t.api, options);
    try {
      await audit.initialize();
      await holder.query("COMMIT");
      const reasons: string[] = [];
      const id = await audit.prepare(-69, 1, "fixture", reason => reasons.push(reason)); expect(id).toBeDefined(); expect(reasons).toEqual([]);
      await audit.confirmed(id!); await f.ready(); await audit.runOnce(); expect(await audit.status(id!)).toBe("sent");
      const plan = JSON.stringify((await f.pool.query("EXPLAIN (FORMAT JSON) " + LIVE_PARTS_SQL)).rows);
      expect(plan).toContain("deletion_audit_parts_live"); expect(plan).toContain("deletion_audit_outbox_live");
      expect(plan).not.toContain("Seq Scan");
    } finally { await audit.close(); }
  } finally { await holder.end(); await f.close(); }
}, 180_000);

integration("#277: a sink-lock holder stalled past the 1s statement budget delays prepare() instead of refusing it", async () => {
  // The longest stall budget, so only the broken outcome (refused at the 1s statement budget) can fail it
  const f = await fixture(); const holder = await f.pool.connect(); const audit = auditor(f.t.api, { ...options, stallMs: 30_000 });
  try {
    await audit.prepare(-69, 99, "warm-up"); // initialized and connected before the lock is taken
    await holder.query("BEGIN"); await holder.query("SELECT 1 FROM deletion_audit_sink FOR UPDATE");
    const reasons: string[] = []; const startedAt = Date.now();
    const preparing = audit.prepare(-69, 1, "fixture", reason => reasons.push(reason));
    // Held for 1.5s from the moment prepare() is seen waiting on the holder, past the 1s statement budget
    const holderPid = (await holder.query("SELECT pg_backend_pid() AS pid")).rows[0].pid;
    while (!(await f.pool.query("SELECT 1 FROM pg_stat_activity WHERE $1=ANY(pg_blocking_pids(pid))", [holderPid])).rowCount) await Bun.sleep(5);
    await new Promise(resolve => setTimeout(resolve, 1_500)); await holder.query("COMMIT");
    const id = await preparing;
    expect(id).toBeDefined(); expect(reasons).toEqual([]); expect(Date.now() - startedAt).toBeGreaterThanOrEqual(1_400);
    expect((await f.state(id!)).state).toBe("intent");
  } finally { holder.release(); await audit.close(); await f.close(); }
});

integration("#277: the sink-lock wait is still bounded by stallMs", async () => {
  const f = await fixture(); const audit = auditor(f.t.api, { ...options, stallMs: 1_000 }); const holder = await f.pool.connect();
  try {
    await audit.prepare(-69, 99, "warm-up");
    await holder.query("BEGIN"); await holder.query("SELECT 1 FROM deletion_audit_sink FOR UPDATE");
    const reasons: string[] = [];
    expect(await audit.prepare(-69, 1, "fixture", reason => reasons.push(reason))).toBeUndefined();
    expect(reasons).toEqual(["database"]);
    await holder.query("ROLLBACK");
    expect((await f.pool.query("SELECT COUNT(*)::int AS n FROM deletion_audit_outbox WHERE message_id=1")).rows[0].n).toBe(0);
  } finally { holder.release(); await audit.close(); await f.close(); }
});
