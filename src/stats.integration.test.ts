import { expect, test } from "bun:test";
import pg from "pg";
import { AsyncStatsBuffer, PostgresStatsStore, type StatsBatch, type StatsStore } from "./stats";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (databaseUrl && new URL(databaseUrl).pathname !== "/jev_stats_test") {
  throw new Error("TEST_DATABASE_URL must target jev_stats_test");
}
const integrationTest = databaseUrl ? test : test.skip;

integrationTest("runs the idempotent migration and persists restart-safe deletion totals", async () => {
  const chatId = "-9223372036854775707";
  const messageId = "9223372036854775001";
  const firstBatch: StatsBatch = {
    chats: [{
      chatId,
      firstSeenAt: "2026-09-18T01:00:00.000Z",
      lastSeenAt: "2026-09-18T01:00:00.000Z",
      chatType: "supergroup",
      membershipActive: true,
    }],
    deletions: [{ chatId, messageId, deletedAt: "2026-09-18T01:00:01.000Z" }],
    classificationAttempts: [{
      chatId,
      messageId,
      updateId: "9223372036854775003",
      attemptedAt: "2026-09-18T01:00:00.500Z",
    }],
  };

  const firstStore = new PostgresStatsStore(databaseUrl!, 2_000);
  await firstStore.writeBatch(firstBatch);
  await firstStore.close();

  const restartedStore = new PostgresStatsStore(databaseUrl!, 2_000);
  await restartedStore.writeBatch({
    chats: [{
      chatId,
      firstSeenAt: "2026-09-18T01:00:00.000Z",
      lastSeenAt: "2026-09-18T02:00:00.000Z",
      chatType: "supergroup",
      membershipActive: false,
    }],
    deletions: firstBatch.deletions,
    classificationAttempts: firstBatch.classificationAttempts,
  });
  await restartedStore.close();

  const pool = new pg.Pool({ connectionString: databaseUrl!, max: 1 });
  const row = await pool.query(
    "SELECT chat_id::text, first_seen_at, last_seen_at, chat_type, membership_active, successful_deletions::text, processed_messages::text FROM known_chats WHERE chat_id = $1::bigint",
    [chatId],
  );
  const aggregate = await pool.query(
    "SELECT COALESCE(SUM(successful_deletions), 0)::text AS total FROM known_chats WHERE chat_id = $1::bigint",
    [chatId],
  );
  await pool.end();

  expect(row.rows[0]).toMatchObject({
    chat_id: chatId,
    chat_type: "supergroup",
    membership_active: false,
    successful_deletions: "1",
    processed_messages: "1",
  });
  expect(new Date(row.rows[0].first_seen_at).toISOString()).toBe("2026-09-18T01:00:00.000Z");
  expect(new Date(row.rows[0].last_seen_at).toISOString()).toBe("2026-09-18T02:00:00.000Z");
  expect(aggregate.rows[0]?.total).toBe("1");
});

integrationTest("a commit-uncertain retry cannot double-count a deletion", async () => {
  const chatId = "-9223372036854775607";
  const messageId = "9223372036854775002";
  const delegate = new PostgresStatsStore(databaseUrl!, 2_000);
  let throwAfterCommit = true;
  const uncertainStore: StatsStore = {
    writeBatch: async (batch) => {
      await delegate.writeBatch(batch);
      if (throwAfterCommit) {
        throwAfterCommit = false;
        throw new Error("connection lost after commit");
      }
    },
    close: () => delegate.close(),
  };
  const stats = new AsyncStatsBuffer(uncertainStore, { autoStart: false, logger: silentLogger });
  stats.recordClassificationAttempt({
    chatId,
    messageId,
    updateId: "9223372036854775004",
    attemptedAt: new Date("2026-09-18T02:59:59Z"),
  });
  stats.recordDeletion({ chatId, messageId, deletedAt: new Date("2026-09-18T03:00:00Z") });
  await stats.flush();
  await stats.flush();
  await stats.stop();

  const pool = new pg.Pool({ connectionString: databaseUrl!, max: 1 });
  const result = await pool.query(
    "SELECT successful_deletions::text, processed_messages::text FROM known_chats WHERE chat_id = $1::bigint",
    [chatId],
  );
  await pool.end();
  expect(result.rows[0]?.successful_deletions).toBe("1");
  expect(result.rows[0]?.processed_messages).toBe("1");
});

integrationTest("prunes expired classification dedupe rows while preserving recent retry dedupe", async () => {
  const chatId = "-9223372036854775507";
  const oldUpdateId = "9223372036854775005";
  const recentUpdateId = "9223372036854775006";
  const recentAttempt = {
    chatId,
    messageId: "9223372036854775007",
    updateId: recentUpdateId,
    attemptedAt: new Date().toISOString(),
  };
  const store = new PostgresStatsStore(databaseUrl!, 2_000);

  await store.writeBatch({ chats: [], deletions: [], classificationAttempts: [] });
  const setupPool = new pg.Pool({ connectionString: databaseUrl!, max: 1 });
  await setupPool.query(
    "DELETE FROM classification_attempt_dedup WHERE update_id = ANY($1::bigint[])",
    [[oldUpdateId, recentUpdateId]],
  );
  await setupPool.query("DELETE FROM known_chats WHERE chat_id = $1::bigint", [chatId]);
  await setupPool.end();

  await store.writeBatch({
    chats: [],
    deletions: [],
    classificationAttempts: [{
      chatId,
      messageId: "9223372036854775006",
      updateId: oldUpdateId,
      attemptedAt: "2025-01-01T00:00:00.000Z",
    }, recentAttempt],
  });
  await store.writeBatch({
    chats: [],
    deletions: [],
    classificationAttempts: [recentAttempt],
  });
  await store.close();

  const pool = new pg.Pool({ connectionString: databaseUrl!, max: 1 });
  const dedupeRows = await pool.query(
    "SELECT update_id::text FROM classification_attempt_dedup WHERE update_id = ANY($1::bigint[]) ORDER BY update_id",
    [[oldUpdateId, recentUpdateId]],
  );
  const total = await pool.query(
    "SELECT processed_messages::text FROM known_chats WHERE chat_id = $1::bigint",
    [chatId],
  );
  await pool.end();

  expect(dedupeRows.rows).toEqual([{ update_id: recentUpdateId }]);
  expect(total.rows[0]?.processed_messages).toBe("2");
});

const silentLogger = { info: () => undefined, error: () => undefined };
