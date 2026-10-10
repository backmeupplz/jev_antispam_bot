import { expect, test } from "bun:test";
import { Bot } from "grammy";
import type { Message, Update, UserFromGetMe } from "grammy/types";
import { registerBotHandlers } from "./bot";
import { toModerationMessage } from "./message";
import { cacheFingerprint } from "./spam-cache";
import { AsyncStatsBuffer } from "./stats";
import { JevSpamClassifier, SPAM_QUESTIONS, type ModerationMessage } from "./spam";
import { evaluateWeekend, layaEvaluationConfig } from "./laya-weekend-evaluation";
import { weekendFixtures, weekendHistoryFixtures, weekendOffer, weekendSources, RECORDED_LAYA_MODEL, LAYA_DIAGNOSTIC_THRESHOLD } from "./fixtures/laya-weekend-recruitment";

const fixture = (id: string) => weekendFixtures.find(item => item.id === id)!;
type RequestBody = { model: string; state: { message: ModerationMessage; recentMessages: ModerationMessage[] }; questions: Record<string, unknown> };
// Laya broadcasts one aggregate score to the static question keys. This mocked
// adapter response proves parser/routing, NOT independent categories or correctness.
function aggregate(probability: number, links: number[] = []) {
  return { model: RECORDED_LAYA_MODEL, routing: { model: "multilingual" }, usage: { truncated: false },
    answers: Object.fromEntries([
      ...Object.keys(SPAM_QUESTIONS).map(key => [key, { type: "noul", noul: probability }]),
      ...links.map((noul, i) => ["context_message_" + i, { type: "noul", noul }]),
    ]) };
}
function classifier(respond: (request: RequestBody) => unknown) {
  const requests: RequestBody[] = [];
  const instance = new JevSpamClassifier("offline-only", {
    model: RECORDED_LAYA_MODEL, threshold: LAYA_DIAGNOSTIC_THRESHOLD, timeoutMs: 1000,
    url: "http://laya.invalid/v1/systemone", fetch: async (_url, init) => {
      const request = JSON.parse(String(init?.body)) as RequestBody;
      requests.push(request);
      return new Response(JSON.stringify(respond(request)));
    },
  });
  return { instance, requests };
}

test("paired synthetic reply sources retain attribution and valid Telegram entities", () => {
  expect(weekendSources.long.length).toBe(766);
  for (const id of ["standalone", "unrelated-visible", "unrelated-short", "unrelated-766", "requested"]) {
    const raw = fixture(id).raw;
    const normalized = toModerationMessage(raw)!;
    expect(normalized.text).toBe(weekendOffer);
    expect(normalized.embeddedLinks).toEqual([]);
    const source = raw.reply_to_message;
    if (source && "text" in source && source.text) {
      for (const entity of source.entities ?? []) {
        expect(entity.offset).toBeGreaterThanOrEqual(0);
        expect(entity.length).toBeGreaterThan(0);
        expect(entity.offset + entity.length).toBeLessThanOrEqual(source.text.length);
      }
      expect(normalized.preview).toHaveLength(1);
      expect(normalized.preview![0]).toMatchObject({ text: source.text, origin: "same_chat",
        sourceAuthor: id.startsWith("unrelated") ? "unknown" : "other_author",
        sourceKind: id.startsWith("unrelated") ? "channel" : "user" });
    } else expect(normalized.preview).toBeUndefined();
  }
});

test("recorded ckpt-v2 diagnostics expose requested and volunteer false positives as failed acceptance", async () => {
  const failures: string[] = [];
  for (const item of weekendFixtures) {
    const c = classifier(() => aggregate(item.recordedProbability!));
    const row = await evaluateWeekend(c.instance, item, RECORDED_LAYA_MODEL);
    expect(row.probability).toBe(item.recordedProbability!);
    expect(row.contextProbabilities).toEqual([]);
    expect(row.truncated).toBe(false);
    expect(row.model).toBe(RECORDED_LAYA_MODEL);
    expect(Object.keys(row.signals)).toEqual(Object.keys(SPAM_QUESTIONS));
    expect(new Set(Object.values(row.signals)).size).toBe(1);
    expect(c.requests[0]!.state.message).toEqual(toModerationMessage(item.raw)!);
    const serialized = JSON.stringify(row);
    expect(serialized).not.toContain(weekendOffer);
    expect(serialized).not.toContain(weekendSources.short);
    expect(serialized).not.toContain("senderProfile");
    if (!row.accepted) failures.push(item.id);
  }
  // Passing this diagnostic test means known acceptance failures are visible, NOT fixed.
  expect(failures).toEqual(["requested", "volunteer"]);
});

test("complete history questions/parser protect requested history and select only linked suffix", async () => {
  const item = weekendHistoryFixtures[0]!;
  const c = classifier(() => aggregate(.90, [.1, .93, .96]));
  const row = await evaluateWeekend(c.instance, item, RECORDED_LAYA_MODEL);
  expect(c.requests[0]!.state.recentMessages).toEqual(item.recent.map(raw => toModerationMessage(raw)!));
  expect(Object.keys(c.requests[0]!.questions).filter(key => key.startsWith("context_message_")))
    .toEqual(["context_message_0", "context_message_1", "context_message_2"]);
  expect(row.contextProbabilities).toEqual([.1, .93, .96]);
  expect(row.selectedMessageIds).toEqual([101, 102, 103]);
  expect(row.accepted).toBe(true); // Mock-only contract assertion, not live acceptance.
  const missing = classifier(() => aggregate(.99, [.1, .93]));
  await expect(evaluateWeekend(missing.instance, item, RECORDED_LAYA_MODEL)).rejects.toThrow("context_message_2");
  const wrongLinks = classifier(() => aggregate(.99, [.95, .93, .96]));
  expect((await evaluateWeekend(wrongLinks.instance, item, RECORDED_LAYA_MODEL)).accepted).toBe(false);
});

test("diagnostic acceptance rejects malformed answers, wrong model and missing/truncated metadata", async () => {
  const incomplete = classifier(() => { const response = aggregate(.9); delete response.answers.unsolicited_promotion; return response; });
  await expect(evaluateWeekend(incomplete.instance, fixture("standalone"), RECORDED_LAYA_MODEL)).rejects.toThrow("unsolicited_promotion");
  for (const patch of [{ model: "laya-other" }, { usage: { truncated: true } }, { usage: {} }]) {
    const c = classifier(() => ({ ...aggregate(.9), ...patch }));
    expect((await evaluateWeekend(c.instance, fixture("standalone"), RECORDED_LAYA_MODEL)).accepted).toBe(false);
  }
});

const botInfo: UserFromGetMe = {
  id: 99, is_bot: true, first_name: "Fixture moderator", username: "fixture_bot",
  can_join_groups: true, can_read_all_group_messages: true, supports_inline_queries: false,
  can_connect_to_business: false, has_main_web_app: false, has_topics_enabled: false,
  allows_users_to_create_topics: false, can_manage_bots: false, supports_join_request_queries: false,
};
function routingHarness(c: JevSpamClassifier) {
  const bot = new Bot("123:offline-only", { botInfo });
  const deleted: number[] = [];
  const logs: Record<string, unknown>[] = [];
  const logger = { info: (line: string) => logs.push(JSON.parse(line)), error: (line: string) => logs.push(JSON.parse(line)) };
  const stats = new AsyncStatsBuffer({ writeBatch: async () => {}, close: async () => {} }, { autoStart: false, logger });
  bot.api.config.use(async (_prev, method, payload) => {
    if (method === "getChatMember") return { ok: true, result: { status: "member", user: { id: 12, is_bot: false, first_name: "Fixture" } } } as never;
    if (method === "getChat") return { ok: true, result: { id: (payload as { chat_id: number }).chat_id, type: "private", first_name: "Fixture", accent_color_id: 0, max_reaction_count: 1 } } as never;
    if (method === "deleteMessage") deleted.push((payload as { message_id: number }).message_id);
    return { ok: true, result: true } as never;
  });
  registerBotHandlers(bot, { classifier: c, model: RECORDED_LAYA_MODEL, spamThreshold: .80, stats, logger,
    previewRequest: async () => { throw new Error("No external preview fetch permitted in offline fixture"); } });
  let update = 0;
  const send = async (raw: Message, edited = false) => {
    const message = JSON.parse(JSON.stringify({ ...raw, ...(edited ? { edit_date: 2 } : {}) }));
    await bot.handleUpdate({ update_id: ++update, [edited ? "edited_message" : "message"]: message } as Update);
  };
  return { send, stats, deleted, logs };
}

for (const edited of [false, true]) {
  test("actual grammY routes every recorded weekend fixture; edited=" + edited, async () => {
    for (const item of weekendFixtures) {
      const c = classifier(() => aggregate(item.recordedProbability!));
      const h = routingHarness(c.instance);
      try {
        await h.send(item.raw, edited);
        expect(c.requests).toHaveLength(1);
        expect(c.requests[0]!.state.message).toEqual(toModerationMessage(item.raw)!);
        expect(c.requests[0]!.state.recentMessages).toEqual([]);
        // Recorded false positives must remain visible; mock does not certify accuracy.
        expect(h.deleted).toEqual(item.recordedProbability! >= .80 ? [item.raw.message_id] : []);
        expect(h.deleted).not.toContain(900);
        expect(h.logs.filter(log => log.event === "message_analyzed")).toHaveLength(1);
        expect(JSON.stringify(h.logs)).not.toContain(weekendOffer);
      } finally { await h.stats.stop(); }
    }
  });
}

test("real edit replaces own history while other actors and reply source stay protected", async () => {
  const c = classifier(request => aggregate(request.state.recentMessages.length ? .95 : .1,
    request.state.recentMessages.map(() => .1)));
  const h = routingHarness(c.instance);
  try {
    const requested = { ...fixture("requested").raw, message_id: 10 };
    await h.send({ ...fixture("volunteer").raw, message_id: 9, from: { id: 33, is_bot: false, first_name: "Other actor" } });
    await h.send(requested);
    await h.send({ ...fixture("unrelated-short").raw, message_id: 10 }, true);
    expect(c.requests[2]!.state.recentMessages).toEqual([]); // Edit excludes its own old version.
    await h.send({ ...fixture("unrelated-visible").raw, message_id: 11 });
    expect(c.requests[3]!.state.recentMessages).toHaveLength(1);
    expect(c.requests[3]!.state.recentMessages[0]!.preview![0]!.text).toBe(weekendSources.short);
    expect(h.deleted).toEqual([11]);
  } finally { await h.stats.stop(); }
});

test("actual routing with incomplete linkage fails open even for a high aggregate score", async () => {
  const c = classifier(request => aggregate(request.state.recentMessages.length ? .95 : .1));
  const h = routingHarness(c.instance);
  try {
    await h.send({ ...fixture("unrelated-short").raw, message_id: 10 });
    await h.send({ ...fixture("unrelated-visible").raw, message_id: 11 });
    expect(c.requests).toHaveLength(2);
    expect(c.requests[1]!.questions.context_message_0).toBeDefined();
    expect(h.deleted).toEqual([]);
    expect(h.logs.filter(log => log.event === "message_analyzed").at(-1)).toMatchObject({ status: "failed", decision: "keep" });
  } finally { await h.stats.stop(); }
});

test("weekend cache identity reuses only same actor/context and invalidates changed source/model", () => {
  const raw = fixture("unrelated-short").raw;
  const key = (message: Message, actor = "user:12", model = RECORDED_LAYA_MODEL, history = 0) =>
    cacheFingerprint(message, actor, toModerationMessage(message)!, history, model, .80, true);
  const original = key(raw);
  expect(original).toMatch(/^[a-f0-9]{64}$/);
  expect(key({ ...raw, message_id: 2, date: 3, edit_date: 4 })).toBe(original);
  for (const id of ["standalone", "unrelated-visible", "unrelated-766", "requested"])
    expect(key(fixture(id).raw)).not.toBe(original);
  expect(key(raw, "user:13")).not.toBe(original);
  expect(key(raw, "user:12", "laya-jev-ckpt-candidate")).not.toBe(original);
  expect(key(raw, "user:12", RECORDED_LAYA_MODEL, 1)).toBeUndefined();
});

test("opt-in local runner emits failed acceptance and exits nonzero without source logging", async () => {
  let calls = 0;
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: async request => {
    const body = await request.json() as RequestBody;
    calls++;
    // A high mock score intentionally deletes controls; no real model is consulted.
    return Response.json(aggregate(.9, body.state.recentMessages.map(() => .1)));
  } });
  try {
    const child = Bun.spawn([process.execPath, "run", new URL("./laya-weekend-evaluation.ts", import.meta.url).pathname], {
      env: { RUN_LAYA_WEEKEND_EVAL: "1", LAYA_EVAL_URL: "http://127.0.0.1:" + server.port + "/v1/systemone",
        LAYA_EVAL_MODEL: RECORDED_LAYA_MODEL, LAYA_EVAL_KEY: "offline-only" },
      stdout: "pipe", stderr: "pipe",
    });
    const [output, errors, exit] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
    expect(exit).toBe(1);
    expect(errors).toBe("");
    expect(calls).toBe(13);
    const rows = output.trim().split("\n").map(line => JSON.parse(line));
    expect(rows).toHaveLength(13);
    expect(rows.find(row => row.id === "requested")).toMatchObject({ accepted: false, expectedDelete: false, shouldDelete: true });
    expect(rows.find(row => row.id === "volunteer")).toMatchObject({ accepted: false });
    expect(rows.find(row => row.id === "mixed-history").contextProbabilities).toHaveLength(3);
    expect(output).not.toContain(weekendOffer);
    expect(output).not.toContain(weekendSources.short);
    expect(output).not.toContain("offline-only");
  } finally { await server.stop(true); }
});

test("runner rejects 307 redirects without forwarding a request or credential", async () => {
  let calls = 0;
  const redirectedCredentials: (string | null)[] = [];
  // Same-origin redirect would preserve Authorization if fetch followed it.
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: request => {
    if (new URL(request.url).pathname === "/v1/systemone") {
      calls++;
      return new Response(null, { status: 307, headers: { location: "/unvalidated" } });
    }
    redirectedCredentials.push(request.headers.get("authorization"));
    return Response.json(aggregate(.9));
  } });
  try {
    const child = Bun.spawn([process.execPath, "run", new URL("./laya-weekend-evaluation.ts", import.meta.url).pathname], {
      env: { RUN_LAYA_WEEKEND_EVAL: "1", LAYA_EVAL_URL: "http://127.0.0.1:" + server.port + "/v1/systemone",
        LAYA_EVAL_MODEL: RECORDED_LAYA_MODEL, LAYA_EVAL_KEY: "offline-only" },
      stdout: "pipe", stderr: "pipe",
    });
    const [output, errors, exit] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
    expect(exit).toBe(1);
    expect(errors).toBe("");
    expect(calls).toBe(1);
    expect(redirectedCredentials).toEqual([]);
    expect(JSON.parse(output.trim())).toEqual({ id: "standalone", synthetic: true, status: "failed", accepted: false });
    expect(output).not.toContain("offline-only");
  } finally { await server.stop(true); }
});

test("runner has no default endpoint or paid TypeSafe fallback and requires explicit opt-in", () => {
  const valid = { RUN_LAYA_WEEKEND_EVAL: "1", LAYA_EVAL_URL: "http://127.0.0.1:8000/v1/systemone", LAYA_EVAL_MODEL: RECORDED_LAYA_MODEL, LAYA_EVAL_KEY: "offline-only" };
  expect(layaEvaluationConfig(valid).model).toBe(RECORDED_LAYA_MODEL);
  expect(layaEvaluationConfig({ ...valid, LAYA_EVAL_URL: "https://laya.example./v1/systemone" }).url)
    .toBe("https://laya.example/v1/systemone");
  for (const host of ["typesafe.ai", "typesafe.ai.", "api.typesafe.ai", "api.typesafe.ai.", "nested.api.typesafe.ai.", "API.TypeSafe.AI."])
    expect(() => layaEvaluationConfig({ ...valid, LAYA_EVAL_URL: "https://" + host + "/v1/systemone" })).toThrow();
  expect(() => layaEvaluationConfig({})).toThrow();
  for (const key of Object.keys(valid)) expect(() => layaEvaluationConfig({ ...valid, [key]: undefined })).toThrow();
  for (const url of ["https://api.typesafe.ai/v1/systemone", "http://127.0.0.1:8000/", "http://user:password@127.0.0.1/v1/systemone"])
    expect(() => layaEvaluationConfig({ ...valid, LAYA_EVAL_URL: url })).toThrow();
});
