import { expect, test } from "bun:test";
import pg from "pg";
import { PostgresRepeatStore, REPEAT_WINDOW_MS } from "./repeat-sends";
const url = process.env.TEST_DATABASE_URL;
if (url && !["/jev_stats_test", "/jev_ticket5_test"].includes(new URL(url).pathname)) throw new Error("Dedicated test database required");
const integration = url ? test : test.skip;
const logger = { info: () => {} };
const key = (n: number) => n.toString(16).padStart(64, "0");
const hour = 60 * 60_000;

integration("PostgreSQL repeat copies survive restart, match by window, keep edits and handled state", async () => {
  const pool = new pg.Pool({ connectionString: url });
  const now = Date.now();
  const first = new PostgresRepeatStore(url!, { logger, timeoutMs: 1000 });
  await first.forget(0, 0); await pool.query("DELETE FROM repeat_sends");
  expect(await first.record(key(1), { chatId: -1, messageId: 10, sentAt: now - 3 * hour })).toEqual([]);
  expect(await first.record(key(2), { chatId: -1, messageId: 11, sentAt: now - 2 * hour })).toEqual([]);
  await first.close();
  const restarted = new PostgresRepeatStore(url!, { logger, timeoutMs: 1000 });
  expect(await restarted.record(key(1), { chatId: -2, messageId: 5, sentAt: now - hour })).toEqual([
    { chatId: -1, messageId: 10, sentAt: now - 3 * hour, handled: false }]);
  await restarted.markHandled(-1, 10);
  // An edit keeps its send time and handled state; it is the same copy.
  expect(await restarted.record(key(1), { chatId: -1, messageId: 10, sentAt: now })).toEqual([
    { chatId: -2, messageId: 5, sentAt: now - hour, handled: false }]);
  expect(await restarted.record(key(1), { chatId: -3, messageId: 1, sentAt: now })).toEqual([
    { chatId: -2, messageId: 5, sentAt: now - hour, handled: false }, { chatId: -1, messageId: 10, sentAt: now - 3 * hour, handled: true }]);
  // Outside the current copy's window, and edited to another text.
  expect((await restarted.record(key(1), { chatId: -4, messageId: 1, sentAt: now + REPEAT_WINDOW_MS - hour + 1 }))!.map((c) => c.messageId)).toEqual([1]);
  await restarted.record(key(2), { chatId: -3, messageId: 1, sentAt: now });
  await restarted.forget(-2, 5);
  expect(await restarted.record(key(1), { chatId: -5, messageId: 1, sentAt: now })).toEqual([
    { chatId: -4, messageId: 1, sentAt: now + REPEAT_WINDOW_MS - hour + 1, handled: false }, { chatId: -1, messageId: 10, sentAt: now - 3 * hour, handled: true }]);
  // Content-free: the table holds only IDs, times and the actor+content hash.
  expect(Object.keys((await pool.query("SELECT * FROM repeat_sends LIMIT 1")).rows[0]).sort()).toEqual(["chat_id", "copy_key", "handled", "message_id", "sent_at"]);
  await restarted.close(); await pool.end();
});

integration("PostgreSQL repeat store prunes expired copies and bounds capacity", async () => {
  const pool = new pg.Pool({ connectionString: url });
  const store = new PostgresRepeatStore(url!, { logger, timeoutMs: 1000, capacity: 3 });
  await store.forget(0, 0); await pool.query("DELETE FROM repeat_sends");
  const now = Date.now();
  await store.record(key(3), { chatId: -1, messageId: 1, sentAt: now - 3 * REPEAT_WINDOW_MS });
  for (let id = 2; id <= 6; id += 1) await store.record(key(3), { chatId: -1, messageId: id, sentAt: now - id * 1000 });
  await store.prune();
  expect((await pool.query("SELECT message_id::int AS id FROM repeat_sends ORDER BY message_id")).rows.map((r) => r.id)).toEqual([2, 3, 4]);
  expect(store.health().pruned).toBe(3);
  await store.close(); await pool.end();
});

integration("PostgreSQL repeat store timeout or outage means no escalation", async () => {
  const pool = new pg.Pool({ connectionString: url });
  const store = new PostgresRepeatStore(url!, { logger, timeoutMs: 100 });
  await store.forget(0, 0);
  const lock = await pool.connect(); await lock.query("BEGIN"); await lock.query("LOCK TABLE repeat_sends IN ACCESS EXCLUSIVE MODE");
  const started = performance.now();
  expect(await store.record(key(4), { chatId: -1, messageId: 1, sentAt: Date.now() })).toBeUndefined();
  expect(performance.now() - started).toBeLessThan(500); expect(store.health().error).toBeGreaterThan(0);
  await lock.query("ROLLBACK"); lock.release(); await store.close(); await pool.end();
  const unavailable = new PostgresRepeatStore("postgresql://test@127.0.0.1:1/jev_stats_test", { logger, timeoutMs: 50 });
  expect(await unavailable.record(key(4), { chatId: -1, messageId: 1, sentAt: Date.now() })).toBeUndefined();
  await unavailable.markHandled(-1, 1); await unavailable.forget(-1, 1);
  expect(unavailable.health().error).toBe(3); await unavailable.close();
});
