import { expect, test } from "bun:test";
import { DeleteRightsChecks, deleteMessages } from "./deletion";
import { AsyncStatsBuffer, type StatsBatch, type StatsStore } from "./stats";

test("records only confirmed successful Telegram deletions without waiting for a blocked database", async () => {
  let release!: () => void;
  const blocked = new Promise<void>((resolve) => { release = resolve; });
  const batches: StatsBatch[] = [];
  const store: StatsStore = {
    writeBatch: async (batch) => {
      batches.push(batch);
      await blocked;
    },
    close: async () => undefined,
  };
  const stats = new AsyncStatsBuffer(store, { autoStart: false, dbTimeoutMs: 20, logger: silentLogger });
  stats.observeChat({ chatId: -100123, chatType: "supergroup" });
  const flush = stats.flush();

  const startedAt = performance.now();
  const count = await deleteMessages(
    -100123,
    [10, 11],
    async (_chatId, messageId) => {
      if (messageId === 11) throw new Error("Telegram rejected deletion");
    },
    (chatId, messageId) => stats.recordDeletion({ chatId, messageId }),
    () => undefined,
  );
  const elapsedMs = performance.now() - startedAt;

  expect(count).toBe(1);
  expect(elapsedMs).toBeLessThan(100);
  expect(stats.health().pendingDeletions).toBe(1);
  await flush;
  expect(stats.health().pendingChats).toBe(1);
  release();
  await blocked;
  await Bun.sleep(0);
  expect(batches).toHaveLength(1);
  expect(batches[0]?.deletions).toEqual([]);
  await stats.flush();
  expect(batches[1]?.deletions.map(({ messageId }) => messageId)).toEqual(["10"]);
  await stats.stop();
});

const silentLogger = { info: () => undefined, error: () => undefined };

test("#634 delete-rights lookups run once a day per chat, and 10 min after a failed lookup", () => {
  const day = 24 * 60 * 60_000, checks = new DeleteRightsChecks(day, 10_000, 10 * 60_000);
  expect(checks.due(-1, 0)).toBe(true);
  // A burst of refused deletes during the lookup fires no second one.
  expect(checks.due(-1, 1_000)).toBe(false);
  expect(checks.due(-1, day - 1)).toBe(false);
  expect(checks.due(-1, day)).toBe(true);
  // A failed lookup is due again 10 min later, not a day later, and stays recorded until then.
  expect(checks.due(-2, 0)).toBe(true);
  checks.failed(-2, 5_000);
  expect(checks.due(-2, 5_000 + 10 * 60_000 - 1)).toBe(false);
  expect(checks.due(-2, 5_000 + 10 * 60_000)).toBe(true);
  // A success after that keeps the daily cadence; a chat never looked up is not recorded by failed().
  expect(checks.due(-2, 5_000 + 20 * 60_000)).toBe(false);
  checks.failed(-3, 0);
  expect(checks.due(-3, 0)).toBe(true);
});
