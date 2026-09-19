import { expect, test } from "bun:test";
import { deleteMessages } from "./deletion";
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
