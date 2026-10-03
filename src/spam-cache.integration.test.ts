import { expect, test } from "bun:test";
import pg from "pg";
import { PostgresSpamCache } from "./spam-cache";
import { PostgresStatsStore } from "./stats";
const url = process.env.TEST_DATABASE_URL;
if (url && !["/jev_stats_test", "/jev_ticket5_test"].includes(new URL(url).pathname)) throw new Error("Dedicated test database required");
const integration = url ? test : test.skip;
const logger = { info: () => {} };
const key = (n: number) => n.toString(16).padStart(64, "0");

integration("PostgreSQL cache persists restart, expires, versions, prunes and bounds concurrent writes", async () => {
  const pool = new pg.Pool({ connectionString: url });
  const first = new PostgresSpamCache(url!, { logger, capacity: 3, timeoutMs: 1000 });
  await first.lookup(key(1)); await pool.query("DELETE FROM spam_verdict_cache");
  await first.seed(key(1)); expect(await first.lookup(key(1))).toBe(true); await first.close();
  const restarted = new PostgresSpamCache(url!, { logger, capacity: 3, timeoutMs: 1000 });
  expect(await restarted.lookup(key(1))).toBe(true);
  const before = (await pool.query("SELECT expires_at FROM spam_verdict_cache WHERE fingerprint=$1", [key(1)])).rows[0];
  await restarted.lookup(key(1)); await restarted.seed(key(1));
  expect((await pool.query("SELECT expires_at FROM spam_verdict_cache WHERE fingerprint=$1", [key(1)])).rows[0]).toEqual(before);
  const other = new PostgresSpamCache(url!, { logger, capacity: 3, timeoutMs: 1000 });
  await other.lookup(key(1));
  await Promise.all([restarted.seed(key(2)), other.seed(key(3)), restarted.seed(key(4)), other.seed(key(5))]);
  expect(Number((await pool.query("SELECT COUNT(*) FROM spam_verdict_cache")).rows[0].count)).toBe(3);
  expect(restarted.health().eviction + other.health().eviction).toBeGreaterThan(0);
  await pool.query("UPDATE spam_verdict_cache SET expires_at=NOW()-INTERVAL '1 second'");
  expect(await restarted.lookup(key(5))).toBe(false);
  await restarted.seed(key(9));
  const changed = new PostgresSpamCache(url!, { logger, revision: "f".repeat(64), timeoutMs: 1000 });
  expect(await changed.lookup(key(9))).toBe(false);
  await Promise.all([restarted.close(), other.close(), changed.close()]); await pool.end();
});

integration("PostgreSQL cache timeout/outage never returns a positive, nor leaks content", async () => {
  const pool = new pg.Pool({ connectionString: url });
  const cache = new PostgresSpamCache(url!, { logger, timeoutMs: 100 });
  await cache.lookup(key(9));
  const lock = await pool.connect(); await lock.query("BEGIN"); await lock.query("LOCK TABLE spam_verdict_cache IN ACCESS EXCLUSIVE MODE");
  const started = performance.now(); expect(await cache.lookup(key(9))).toBe(false);
  expect(performance.now() - started).toBeLessThan(500); expect(cache.health().error).toBeGreaterThan(0);
  await lock.query("ROLLBACK"); lock.release(); await cache.close(); await pool.end();
  const unavailable = new PostgresSpamCache("postgresql://test@127.0.0.1:1/jev_stats_test", { logger, timeoutMs: 50 });
  expect(await unavailable.lookup(key(9))).toBe(false); await unavailable.seed(key(10));
  expect(unavailable.health().error).toBeGreaterThan(0); await unavailable.close();
});

integration("cache deletions count once across retries/restarts and never count as Jev", async () => {
  const pool = new pg.Pool({ connectionString: url });
  const store = new PostgresStatsStore(url!);
  await store.writeBatch({ chats: [], deletions: [], classificationAttempts: [] });
  const chatId = "-9050001";
  await pool.query("DELETE FROM deletion_dedup WHERE chat_id=$1", [chatId]);
  await pool.query("DELETE FROM known_chats WHERE chat_id=$1", [chatId]);
  const batch = { chats: [], classificationAttempts: [], deletions: [{ chatId, messageId: "1", deletedAt: new Date().toISOString(), source: "cache" as const }] };
  await store.writeBatch(batch); await store.close();
  const restart = new PostgresStatsStore(url!);
  await Promise.all([restart.writeBatch(batch), restart.writeBatch(batch)]); await restart.close();
  expect((await pool.query("SELECT successful_deletions::text, cache_deletions::text, processed_messages::text FROM known_chats WHERE chat_id=$1", [chatId])).rows[0]).toEqual({ successful_deletions: "1", cache_deletions: "1", processed_messages: "0" });
  await pool.end();
});
