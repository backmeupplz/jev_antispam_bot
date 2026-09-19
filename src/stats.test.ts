import { expect, test } from "bun:test";
import { AsyncStatsBuffer, type StatsBatch, type StatsStore } from "./stats";

class FakeStore implements StatsStore {
  readonly batches: StatsBatch[] = [];
  failuresRemaining = 0;
  closed = false;

  async writeBatch(batch: StatsBatch): Promise<void> {
    this.batches.push(structuredClone(batch));
    if (this.failuresRemaining > 0) {
      this.failuresRemaining -= 1;
      throw new Error("offline");
    }
  }

  async close(): Promise<void> {
    this.closed = true;
  }
}

const silentLogger = { info: () => undefined, error: () => undefined };

test("coalesces chat sightings and preserves signed 64-bit IDs", async () => {
  const store = new FakeStore();
  const stats = new AsyncStatsBuffer(store, { autoStart: false, logger: silentLogger });
  stats.observeChat({
    chatId: "-9223372036854775807",
    seenAt: new Date("2026-09-18T01:00:00Z"),
    chatType: "supergroup",
  });
  stats.observeChat({
    chatId: -9223372036854775807n,
    seenAt: new Date("2026-09-18T02:00:00Z"),
    membershipActive: true,
  });
  await stats.flush();

  expect(store.batches).toHaveLength(1);
  expect(store.batches[0]?.chats).toEqual([{
    chatId: "-9223372036854775807",
    firstSeenAt: "2026-09-18T01:00:00.000Z",
    lastSeenAt: "2026-09-18T02:00:00.000Z",
    chatType: "supergroup",
    membershipActive: true,
  }]);
  await stats.stop();
});

test("retries the same deletion identity after failure without losing it", async () => {
  const store = new FakeStore();
  store.failuresRemaining = 1;
  const stats = new AsyncStatsBuffer(store, {
    autoStart: false,
    retryBaseMs: 1,
    retryMaxMs: 1,
    random: () => 0,
    logger: silentLogger,
  });
  stats.recordDeletion({ chatId: -1001, messageId: 77, deletedAt: new Date("2026-09-18T03:00:00Z") });

  await stats.flush();
  expect(stats.health().pendingDeletions).toBe(1);
  await stats.flush();

  expect(store.batches).toHaveLength(2);
  expect(store.batches[0]).toEqual(store.batches[1]);
  expect(stats.health().pendingDeletions).toBe(0);
  await stats.stop();
});

test("bounds independent chat and deletion queues and recovers after backpressure", async () => {
  const store = new FakeStore();
  const stats = new AsyncStatsBuffer(store, {
    autoStart: false,
    maxPendingChats: 2,
    maxPendingDeletions: 2,
    batchSize: 10,
    logger: silentLogger,
  });
  for (let id = 1; id <= 3; id += 1) {
    stats.observeChat({ chatId: -id });
    stats.recordDeletion({ chatId: -id, messageId: id });
  }

  expect(stats.health()).toMatchObject({
    pendingChats: 2,
    pendingDeletions: 2,
    droppedChats: 1,
    droppedDeletions: 1,
  });
  await stats.flush();
  expect(stats.health()).toMatchObject({ pendingChats: 0, pendingDeletions: 0 });
  await stats.stop();
});

test("best-effort shutdown drains queued records and closes the store", async () => {
  const store = new FakeStore();
  const stats = new AsyncStatsBuffer(store, { autoStart: false, logger: silentLogger });
  stats.observeChat({ chatId: -1002 });
  stats.recordDeletion({ chatId: -1002, messageId: 5 });

  const health = await stats.stop();
  expect(health).toMatchObject({ pendingChats: 0, pendingDeletions: 0 });
  expect(store.batches).toHaveLength(1);
  expect(store.closed).toBe(true);
});
