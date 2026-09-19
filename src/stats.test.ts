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

test("running retries still recover after the configured backoff", async () => {
  const store = new FakeStore();
  store.failuresRemaining = 1;
  const stats = new AsyncStatsBuffer(store, {
    autoStart: false,
    retryBaseMs: 1,
    retryMaxMs: 1,
    random: () => 0,
    logger: silentLogger,
  });
  stats.recordDeletion({ chatId: -1001, messageId: 78 });

  await stats.flush();
  await waitFor(() => store.batches.length === 2);

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

test("shutdown respects retry backoff when the database is immediately offline", async () => {
  const store = new FakeStore();
  store.failuresRemaining = Number.POSITIVE_INFINITY;
  const stats = new AsyncStatsBuffer(store, {
    autoStart: false,
    retryBaseMs: 10_000,
    retryMaxMs: 10_000,
    shutdownTimeoutMs: 25,
    random: () => 0,
    logger: silentLogger,
  });
  stats.recordDeletion({ chatId: -1003, messageId: 6 });

  const startedAt = performance.now();
  const health = await stats.stop();

  expect(performance.now() - startedAt).toBeLessThan(250);
  expect(store.batches).toHaveLength(1);
  expect(store.closed).toBe(true);
  expect(health.pendingDeletions).toBe(1);
});

test("a write that rejects after shutdown cannot schedule work after close", async () => {
  let rejectWrite!: (error: Error) => void;
  const blockedWrite = new Promise<void>((_resolve, reject) => { rejectWrite = reject; });
  let writes = 0;
  let writesAfterClose = 0;
  let closeCalls = 0;
  let closed = false;
  const store: StatsStore = {
    writeBatch: async () => {
      writes += 1;
      if (closed) writesAfterClose += 1;
      await blockedWrite;
    },
    close: async () => {
      closeCalls += 1;
      closed = true;
    },
  };
  const stats = new AsyncStatsBuffer(store, {
    autoStart: false,
    retryBaseMs: 1,
    retryMaxMs: 1,
    shutdownTimeoutMs: 10,
    random: () => 0,
    logger: silentLogger,
  });
  stats.recordDeletion({ chatId: -1004, messageId: 7 });
  const flush = stats.flush();

  await waitFor(() => writes === 1);
  await stats.stop();
  rejectWrite(new Error("late offline failure"));
  await flush;
  await Bun.sleep(10);
  await stats.flush();

  expect(writes).toBe(1);
  expect(writesAfterClose).toBe(0);
  expect(closeCalls).toBe(1);
});

test("shutdown is deadline-bounded, idempotent, and ignores late enqueue", async () => {
  const never = new Promise<void>(() => undefined);
  let writes = 0;
  let closeCalls = 0;
  const store: StatsStore = {
    writeBatch: async () => {
      writes += 1;
      await never;
    },
    close: async () => {
      closeCalls += 1;
    },
  };
  const stats = new AsyncStatsBuffer(store, {
    autoStart: false,
    shutdownTimeoutMs: 10,
    logger: silentLogger,
  });
  stats.observeChat({ chatId: -1005 });

  const startedAt = performance.now();
  await Promise.all([stats.stop(), stats.stop()]);
  expect(performance.now() - startedAt).toBeLessThan(250);

  const healthAtStop = stats.health();
  stats.observeChat({ chatId: -1006 });
  stats.recordDeletion({ chatId: -1006, messageId: 8 });
  await stats.flush();
  await stats.stop();

  expect(stats.health()).toEqual(healthAtStop);
  expect(writes).toBe(1);
  expect(closeCalls).toBe(1);
});

async function waitFor(predicate: () => boolean, timeoutMs = 250): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate() && Date.now() < deadline) await Bun.sleep(1);
  expect(predicate()).toBe(true);
}
