import { expect, test } from "bun:test";
import type { AuditRefusal, DeletionAudit } from "./audit-outbox";
import { DeleteRetryQueue, prepareIntent, type RetryOutcome } from "./delete-retry";

/** prepare() answering from a script: an id, a refusal, a throw, or a slow refusal that advances the clock. */
function scripted(steps: Array<string | AuditRefusal | "throw" | { slow: number }>, clock: { now: number }) {
  let calls = 0;
  const audit: DeletionAudit = {
    prepare: async (_chat, _message, _report, refused) => {
      const step = steps[calls++] ?? "database";
      if (step === "throw") throw new Error("private driver detail");
      if (typeof step === "object") { clock.now += step.slow; refused?.("database"); return undefined; }
      if (["invalid", "closing", "duplicate", "capacity", "database"].includes(step)) { refused?.(step as AuditRefusal); return undefined; }
      return step;
    },
    confirmed: async () => {}, failed: async () => {},
  };
  return { audit, calls: () => calls };
}
const fakeTime = () => {
  const clock = { now: 0 }; const slept: number[] = [];
  return { clock, slept, opts: { now: () => clock.now, sleep: async (ms: number) => { slept.push(ms); clock.now += ms; } } };
};

test("prepareIntent retries a database refusal (and a throw) inside its budget", async () => {
  const t = fakeTime(); const s = scripted(["database", "throw", "intent-1"], t.clock);
  expect(await prepareIntent(s.audit, -1, 1, "fixture", t.opts)).toEqual({ id: "intent-1", attempts: 3 });
  expect(t.slept).toEqual([250, 1_000]);
});

test("prepareIntent never retries a refusal about the message or the outbox", async () => {
  for (const refusal of ["duplicate", "capacity", "invalid", "closing"] as const) {
    const t = fakeTime(); const s = scripted([refusal, "intent-1"], t.clock);
    expect(await prepareIntent(s.audit, -1, 1, "fixture", t.opts)).toEqual({ refusal, attempts: 1 });
    expect(s.calls()).toBe(1);
  }
});

test("prepareIntent stops at its budget: a slow failure is not retried inline", async () => {
  const t = fakeTime(); const s = scripted([{ slow: 5_000 }, "intent-1"], t.clock);
  expect(await prepareIntent(s.audit, -1, 1, "fixture", t.opts)).toEqual({ refusal: "database", attempts: 1 });
  const u = fakeTime(); const v = scripted(["database", "database", "database", "intent-1"], u.clock);
  expect(await prepareIntent(v.audit, -1, 1, "fixture", u.opts)).toEqual({ refusal: "database", attempts: 3 });
});

function queue(options: ConstructorParameters<typeof DeleteRetryQueue>[0] = {}) {
  const clock = { now: 0 }; const logs: Record<string, unknown>[] = [];
  const q = new DeleteRetryQueue({ pollMs: 0, now: () => clock.now, logger: { info: line => logs.push(JSON.parse(line)) }, ...options });
  return { q, clock, logs, outcomes: () => logs.map(x => x.outcome) };
}

test("queue retries on its schedule until deleted, one entry per message", async () => {
  const t = queue({ delaysMs: [10, 20] });
  const results: RetryOutcome[] = [{ outcome: "deferred", reason: "database" }, { outcome: "deferred", reason: "database" }, { outcome: "deleted" }];
  const at: number[] = [];
  expect(t.q.add(-1, 5, async () => { at.push(t.clock.now); return results.shift()!; })).toBe(true);
  expect(t.q.add(-1, 5, async () => ({ outcome: "deleted" }))).toBe(true); // already queued: kept, not doubled
  expect(t.q.size).toBe(1);
  for (const step of [5, 5, 10, 10, 10, 10]) { t.clock.now += step; await t.q.runDue(); }
  expect(at).toEqual([10, 30, 50]); // delaysMs[0] after queueing, then delaysMs[n] (last repeats)
  expect(t.outcomes()).toEqual(["queued", "deferred", "deferred", "deleted"]);
  expect(t.logs.at(-1)).toEqual({ event: "delete_retry", outcome: "deleted", chatId: -1, messageId: 5, attempts: 3, queued: 0 });
});

test("queue drops terminal outcomes, a thrown attempt is deferred, and full or expired entries never run", async () => {
  const t = queue({ capacity: 2, ttlMs: 100, delaysMs: [10] });
  t.q.add(-1, 1, async () => ({ outcome: "duplicate", reason: "duplicate" }));
  t.q.add(-1, 2, async () => { throw new Error("private"); });
  expect(t.q.add(-1, 3, async () => ({ outcome: "deleted" }))).toBe(false);
  t.clock.now = 10; await t.q.runDue();
  expect(t.q.size).toBe(1);
  t.clock.now = 100; await t.q.runDue();
  expect(t.q.size).toBe(0);
  expect(t.logs.map(x => [x.outcome, x.messageId, x.reason ?? null])).toEqual([
    ["queued", 1, null], ["queued", 2, null], ["dropped", 3, "capacity"],
    ["duplicate", 1, "duplicate"], ["deferred", 2, "unavailable"], ["expired", 2, null]]);
  expect(JSON.stringify(t.logs)).not.toContain("private");
});

test("overlapping passes share one run and stop() waits for it", async () => {
  const t = queue({ delaysMs: [0] });
  let release!: () => void; let runs = 0;
  t.q.add(-1, 1, async () => { runs++; await new Promise<void>(resolve => { release = resolve; }); return { outcome: "deleted" }; });
  const first = t.q.runDue(), second = t.q.runDue();
  expect(first).toBe(second);
  await Promise.resolve(); const stopped = t.q.stop(); release(); await stopped; await first;
  expect(runs).toBe(1); expect(t.q.size).toBe(0);
});

test("a transient failure ends the pass; the rest stay due for the next one", async () => {
  const t = queue({ delaysMs: [10, 100] }); const ran: number[] = [];
  let failing = true;
  for (const id of [1, 2, 3]) t.q.add(-1, id, async () => { ran.push(id); return failing ? { outcome: "deferred", reason: "database" } : { outcome: "deleted" }; });
  t.clock.now = 10; await t.q.runDue();
  expect(ran).toEqual([1]);
  failing = false; await t.q.runDue();
  expect(ran).toEqual([1, 2, 3]); expect(t.q.size).toBe(1); // 1 waits for its own next attempt
});

test("forget withdraws an entry, even while its attempt runs, without deleting a newer one", async () => {
  const t = queue({ delaysMs: [0] });
  let release!: () => void;
  t.q.add(-1, 1, async () => { await new Promise<void>(resolve => { release = resolve; }); return { outcome: "duplicate" }; });
  const pass = t.q.runDue(); await Promise.resolve();
  t.q.forget(-1, 1); t.q.add(-1, 1, async () => ({ outcome: "deleted" }));
  release(); await pass;
  expect(t.q.size).toBe(1);
  t.q.forget(-1, 2); // unknown: no-op
  expect(t.outcomes()).toEqual(["queued", "superseded", "queued", "duplicate"]);
});
