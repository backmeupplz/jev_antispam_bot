import { expect, test } from "bun:test";
import { AdaptiveClassifier, CLASSIFY_RETRY_DELAYS_MS, classifyWithRetries, PAUSE_AFTER, PAUSE_MS, RECOVER_AFTER } from "./classifier-resilience";
import { ClassifierRequestError, JevSpamClassifier, SPAM_QUESTIONS, type SpamAssessment } from "./spam";

const timeout = () => new ClassifierRequestError("TypeSafe request timed out after 15000 ms", "timeout");
const verdict = { probability: 0.1 } as SpamAssessment;
const message = { text: "hello", embeddedLinks: [], isForwarded: false };

test("retries only an exchange that got no verdict, three tries at most, with spread waits", async () => {
  const waits: number[] = [];
  const retried: [number, string, number][] = [];
  const options = (random: number) => ({ sleep: async (ms: number) => { waits.push(ms); }, random: () => random,
    onRetry: (attempt: number, error: ClassifierRequestError, delayMs: number) => { retried.push([attempt, error.reason, delayMs]); } });
  let calls = 0;
  expect(await classifyWithRetries(async () => { if (++calls < 3) throw timeout(); return "ok"; }, options(0))).toBe("ok");
  expect(waits).toEqual([1_500, 4_500]);
  expect(retried).toEqual([[1, "timeout", 1_500], [2, "timeout", 4_500]]);

  waits.length = 0;
  calls = 0;
  const error = new ClassifierRequestError("TypeSafe request failed in transport", "network");
  await expect(classifyWithRetries(async () => { calls++; throw error; }, options(1))).rejects.toBe(error);
  expect(calls).toBe(1 + CLASSIFY_RETRY_DELAYS_MS.length);
  expect(waits).toEqual([2_500, 7_500]);

  for (const final of [new ClassifierRequestError("TypeSafe request failed with HTTP 400", "http_400"), new SyntaxError("bad JSON"), "thrown string"]) {
    calls = 0;
    await expect(classifyWithRetries(async () => { calls++; throw final; }, options(0.5))).rejects.toBe(final);
    expect(calls).toBe(1);
  }
  for (const [reason, retryable] of [["http_429", true], ["http_500", true], ["http_503", true], ["http_404", false], ["timeout", true], ["network", true], ["paused", false]] as const) {
    expect(new ClassifierRequestError("x", reason).retryable).toBe(retryable);
  }
  // #616: a context request already had extra time per context message; the next try would cost the same.
  const contextTimeout = new ClassifierRequestError("x", "timeout", { withContext: true });
  expect([contextTimeout.retryable, contextTimeout.withContext]).toEqual([false, true]);
  calls = 0;
  await expect(classifyWithRetries(async () => { calls++; throw contextTimeout; }, options(0.5))).rejects.toBe(contextTimeout);
  expect(calls).toBe(1);
});

test("a context request's timeout halves the model calls and leads to the pause like any timeout (#616)", async () => {
  const contextTimeout = () => new ClassifierRequestError("TypeSafe request timed out after 39000 ms", "timeout", { withContext: true });
  const g = gate(4);
  const run = async () => {
    const call = g.start();
    await Bun.sleep(0);
    g.pending.at(-1)!.reject(contextTimeout());
    return call;
  };
  await run();
  await run();
  expect([g.limits, g.classifier.limit]).toEqual([[[2, 4], [1, 2]], 1]);
  for (let i = 0; i < PAUSE_AFTER - 1; i++) await run();
  expect(g.pauses).toEqual([]);
  expect(await run()).toMatchObject({ reason: "timeout", withContext: true });
  expect([g.pauses, g.classifier.paused]).toEqual([[PAUSE_MS], true]);
  expect(await g.start()).toMatchObject({ reason: "paused" });
});

test("a timeout whose budget was cut to the cap never cuts the model calls (#616)", async () => {
  const g = gate(4);
  for (let i = 0; i < PAUSE_AFTER + 2; i++) {
    const call = g.start();
    await Bun.sleep(0);
    g.pending.at(-1)!.reject(new ClassifierRequestError("TypeSafe request timed out after 60000 ms", "timeout", { withContext: true, capped: true }));
    expect(await call).toMatchObject({ reason: "timeout", capped: true });
  }
  expect([g.limits, g.classifier.limit, g.pauses]).toEqual([[], 4, []]);
});

function gate(max: number) {
  const pending: { resolve: (value: SpamAssessment) => void; reject: (error: unknown) => void }[] = [];
  const limits: [number, number][] = [];
  const pauses: number[] = [];
  const clock = { now: 1_000 };
  const classifier = new AdaptiveClassifier({ classify: () => new Promise((resolve, reject) => pending.push({ resolve, reject })) },
    max, { onLimit: (limit, previous) => limits.push([limit, previous]), onPause: ms => pauses.push(ms), now: () => clock.now });
  const start = () => classifier.classify(message).catch(error => error);
  return { classifier, pending, limits, pauses, clock, start };
}

test("a timeout halves the model calls in flight once per generation; successes add them back one by one", async () => {
  const g = gate(4);
  const first = Array.from({ length: 6 }, g.start);
  await Bun.sleep(0);
  expect([g.classifier.running, g.classifier.waiting, g.pending.length]).toEqual([4, 2, 4]);

  // Two calls of the same generation time out: one cut, to 2.
  g.pending[0]!.reject(timeout());
  g.pending[1]!.reject(timeout());
  await Bun.sleep(0);
  expect(g.limits).toEqual([[2, 4]]);
  // Two calls still run, so the waiters stay queued until the limit has room.
  expect([g.classifier.running, g.classifier.waiting]).toEqual([2, 2]);
  g.pending[2]!.resolve(verdict);
  await Bun.sleep(0);
  expect([g.classifier.running, g.classifier.waiting, g.pending.length]).toEqual([2, 1, 5]);

  // A timeout of a call started at the new limit cuts again, to 1; another 4xx or transport error never cuts.
  g.pending[4]!.reject(timeout());
  await Bun.sleep(0);
  expect(g.limits).toEqual([[2, 4], [1, 2]]);
  g.pending[3]!.reject(new ClassifierRequestError("TypeSafe request failed in transport", "network"));
  await Bun.sleep(0);
  expect(g.limits).toEqual([[2, 4], [1, 2]]);
  expect([g.classifier.running, g.classifier.waiting]).toEqual([1, 0]);
  g.pending[5]!.resolve(verdict);
  await Promise.all(first);

  // RECOVER_AFTER successes in a row at the current limit add one back, up to the maximum.
  for (let i = 0; i < RECOVER_AFTER * 3 + 5; i++) {
    const call = g.start();
    await Bun.sleep(0);
    g.pending.at(-1)!.resolve(verdict);
    await call;
  }
  expect(g.limits).toEqual([[2, 4], [1, 2], [2, 1], [3, 2], [4, 3]]);
  expect(g.classifier.limit).toBe(4);
});

test("timeouts in a row with one call at a time pause model calls, and a success in between resets the run", async () => {
  const g = gate(1);
  const run = async (outcome: "ok" | "timeout") => {
    const call = g.start();
    await Bun.sleep(0);
    if (outcome === "ok") g.pending.at(-1)!.resolve(verdict); else g.pending.at(-1)!.reject(timeout());
    return call;
  };
  // A timeout at the floor also resets the successes in a row (19 + timeout + 19 never reaches RECOVER_AFTER).
  for (let i = 0; i < RECOVER_AFTER - 1; i++) await run("ok");
  await run("timeout");
  for (let i = 0; i < RECOVER_AFTER - 1; i++) await run("ok");
  expect(g.limits).toEqual([]);
  for (let i = 0; i < PAUSE_AFTER - 1; i++) await run("timeout");
  await run("ok");
  expect(g.pauses).toEqual([]);
  for (let i = 0; i < PAUSE_AFTER; i++) await run("timeout");
  expect(g.pauses).toEqual([PAUSE_MS]);
  expect(g.classifier.paused).toBe(true);
  // Paused: calls fail at once without reaching the model, and are not retried.
  const calls = g.pending.length;
  const paused = await g.start();
  expect(paused).toMatchObject({ reason: "paused", retryable: false });
  expect(g.pending.length).toBe(calls);
  // After the pause the next call probes the model again.
  g.clock.now += PAUSE_MS;
  expect(g.classifier.paused).toBe(false);
  expect(await run("ok")).toBe(verdict);
});

test("calls queued before a pause fail with it once admitted", async () => {
  const g = gate(1);
  for (let i = 0; i < PAUSE_AFTER - 1; i++) {
    const call = g.start();
    await Bun.sleep(0);
    g.pending.at(-1)!.reject(timeout());
    await call;
  }
  const running = g.start();
  const queued = g.start();
  await Bun.sleep(0);
  expect([g.classifier.running, g.classifier.waiting, g.pending.length]).toEqual([1, 1, PAUSE_AFTER]);
  g.pending.at(-1)!.reject(timeout());
  expect(await running).toMatchObject({ reason: "timeout" });
  // The queued call never reaches the model.
  expect(await queued).toMatchObject({ reason: "paused" });
  expect(g.pending.length).toBe(PAUSE_AFTER);
  expect([g.classifier.running, g.classifier.waiting]).toEqual([0, 0]);
  expect(g.pauses).toEqual([PAUSE_MS]);
});

test("stopping ends the retries: no new wait or try once the signal is aborted", async () => {
  const stopping = new AbortController();
  let calls = 0;
  const waits: number[] = [];
  const run = classifyWithRetries(async () => { calls++; throw timeout(); }, { signal: stopping.signal, random: () => 0.5,
    sleep: (ms, signal) => { waits.push(ms); return new Promise(resolve => signal!.addEventListener("abort", resolve)); } });
  await Bun.sleep(0);
  expect([calls, waits]).toEqual([1, [2_000]]);
  stopping.abort();
  await expect(run).rejects.toMatchObject({ reason: "timeout" });
  expect(calls).toBe(1);
  // The default wait ends early on abort too.
  const aborted = new AbortController();
  const started = Date.now();
  const quick = classifyWithRetries(async () => { throw timeout(); }, { signal: aborted.signal, delaysMs: [60_000] });
  setTimeout(() => aborted.abort(), 10);
  await expect(quick).rejects.toMatchObject({ reason: "timeout" });
  expect(Date.now() - started).toBeLessThan(5_000);
});

test("waiters are admitted in arrival order", async () => {
  const g = gate(1);
  const order: number[] = [];
  const calls = [0, 1, 2].map(i => g.classifier.classify({ ...message, text: String(i) }).then(() => order.push(i)));
  for (let i = 0; i < 3; i++) {
    await Bun.sleep(0);
    g.pending[i]!.resolve(verdict);
  }
  await Promise.all(calls);
  expect(order).toEqual([0, 1, 2]);
  expect(() => new AdaptiveClassifier(g.classifier, 0)).toThrow("positive integer");
});

const answers = { model: "jev-1.13.0", answers: Object.fromEntries(Object.keys(SPAM_QUESTIONS).map(key => [key, { type: "noul", noul: 0.1 }])) };

test("the classifier reports a timeout, a transport failure and an HTTP error as a request error, a bad answer as a plain one", async () => {
  const classify = (fetch: (input: string | URL | Request, init?: RequestInit) => Promise<Response>) =>
    new JevSpamClassifier("key", { model: "jev-1.13.0", threshold: 0.8, timeoutMs: 20, fetch }).classify(message);
  const hang = (_: unknown, init?: RequestInit) => new Promise<Response>((_resolve, reject) =>
    init!.signal!.addEventListener("abort", () => reject(init!.signal!.reason)));
  await expect(classify(hang)).rejects.toMatchObject({ name: "ClassifierRequestError", reason: "timeout", retryable: true });
  // A body that stalls past the timeout is a timeout too.
  const stalledBody = async (_: unknown, init?: RequestInit) => new Response(new ReadableStream({
    start(controller) { init!.signal!.addEventListener("abort", () => controller.error(init!.signal!.reason)); } }));
  await expect(classify(stalledBody)).rejects.toMatchObject({ reason: "timeout" });
  await expect(classify(async () => { throw new TypeError("fetch failed"); })).rejects.toMatchObject({ reason: "network", retryable: true });
  await expect(classify(async () => new Response("busy", { status: 503 }))).rejects.toMatchObject({ reason: "http_503", retryable: true,
    message: "TypeSafe request failed with HTTP 503" });
  await expect(classify(async () => new Response("no", { status: 401 }))).rejects.toMatchObject({ reason: "http_401", retryable: false });
  const bad = await classify(async () => new Response("{not json")).catch(error => error);
  expect(bad).toBeInstanceOf(SyntaxError);
  expect((await classify(async () => Response.json(answers))).probability).toBe(0.1);
});

test("a real socket that stays silent past the timeout is a timeout", async () => {
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Promise<Response>(() => {}) });
  try {
    const classifier = new JevSpamClassifier("key", { model: "jev-1.13.0", threshold: 0.8, timeoutMs: 50, url: `http://127.0.0.1:${server.port}/v1/systemone` });
    await expect(classifier.classify(message)).rejects.toMatchObject({ reason: "timeout", retryable: true });
  } finally {
    server.stop(true);
  }
});
