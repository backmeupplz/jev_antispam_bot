import { expect, test } from "bun:test";
import { Bot } from "grammy";
import type { Message, UserFromGetMe } from "grammy/types";
import { registerBotHandlers } from "./bot";
import { previewAdText, previewFixtures, previewMessage } from "./fixtures/preview-amplification";
import { toModerationMessage } from "./message";
import { evaluatePreview } from "./preview-evaluation";
import { JevSpamClassifier, SPAM_QUESTIONS } from "./spam";
import { AsyncStatsBuffer } from "./stats";

// These artificial responses prove plumbing and fail-open, NOT model detection quality.
function response(score = 0.01, links: number[] = []) {
  return { model: "jev-1.13.0", answers: Object.fromEntries([
    ...Object.keys(SPAM_QUESTIONS).map(key => [key, { type: "noul", noul: key === "quoted_promotion_amplification" ? score : 0.01 }]),
    ...links.map((noul, index) => ["context_message_" + index, { type: "noul", noul }]),
  ]) };
}
const options = { model: "jev-1.13.0", threshold: 0.9, timeoutMs: 1_000 };
const mixed = previewFixtures.find(f => f.id === "mixed-history")!;

for (const fixture of previewFixtures) {
  test("normalizes and sends synthetic preview fixture: " + fixture.id, async () => {
    const classifier = new JevSpamClassifier("test-key", { ...options, fetch: async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      expect(body.model).toBe("jev-1.13.0");
      expect(body.state.message).toEqual(toModerationMessage(fixture.message));
      expect(body.state.message.text).toBe(fixture.message.text);
      expect(body.state.recentMessages).toEqual(fixture.recent.map(toModerationMessage));
      expect(Object.keys(body.questions).filter(key => key.startsWith("context_message_"))).toEqual(
        fixture.recent.map((_message, index) => "context_message_" + index));
      if (fixture.message.reply_to_message || fixture.message.external_reply || fixture.recent.length) {
        for (const question of Object.values(body.questions) as { instructions: string }[]) {
          expect(question.instructions).toContain("untrusted data");
          expect(question.instructions).toContain("Respect each historical message's own preview");
        }
      }
      return Response.json(response(0.01, fixture.recent.map(() => 0.99)));
    } });
    const result = await evaluatePreview(classifier, fixture);
    expect(result.contextProbabilities).toHaveLength(fixture.recent.length);
    expect(result.selectedMessageIds).toEqual([]); // High links never override current keep.
  });
}

test("per-message requested context and inaccessible content remain distinguishable", () => {
  const requested = toModerationMessage(mixed.recent[0]!)!;
  const promotional = toModerationMessage(mixed.recent[1]!)!;
  expect(requested.preview?.[0]).toMatchObject({ origin: "same_chat", sourceAuthor: "other_author" });
  expect(requested.preview?.[0]?.text).toContain("Can someone recommend");
  expect(promotional.preview?.[0]).toMatchObject({ sourceAuthor: "unknown", isForwarded: true, text: previewAdText });
  const unavailable = toModerationMessage(previewFixtures.find(f => f.id === "inaccessible-source")!.message)!;
  expect(unavailable.preview?.[0]).not.toHaveProperty("text");
});

test("strict parser gates current deletion and selects only independently linked suffix", async () => {
  for (const [score, ids] of [[0.899, []], [0.9, [11, 100]]] as const) {
    const classifier = new JevSpamClassifier("test-key", { ...options,
      fetch: async () => Response.json(response(score, [0.01, 0.99])),
    });
    const result = await evaluatePreview(classifier, mixed);
    expect(result.selectedMessageIds).toEqual([...ids]);
    expect(result.selectedMessageIds).not.toContain(900);
  }
  for (const key of ["context_message_0", "context_message_1", "quoted_promotion_amplification"]) {
    const invalid = response(0.99, [0.01, 0.99]);
    delete invalid.answers[key];
    const classifier = new JevSpamClassifier("test-key", { ...options, fetch: async () => Response.json(invalid) });
    await expect(evaluatePreview(classifier, mixed)).rejects.toThrow("invalid " + key + " answer");
  }
});

const botInfo: UserFromGetMe = {
  id: 99, is_bot: true, first_name: "Moderator", username: "moderator_bot",
  can_join_groups: true, can_read_all_group_messages: true, supports_inline_queries: false,
  can_connect_to_business: false, has_main_web_app: false, has_topics_enabled: false,
  allows_users_to_create_topics: false, can_manage_bots: false, supports_join_request_queries: false,
};

for (const missingLink of [false, true]) {
  test("real handler preserves attribution and " + (missingLink ? "fails open on missing linkage" : "deletes only same-actor linked suffix"), async () => {
    const bot = new Bot("123:local-test-only", { botInfo });
    const deletes: { chat_id: number; message_id: number }[] = [];
    const logs: Record<string, unknown>[] = [];
    const logger = { info: (line: string) => logs.push(JSON.parse(line)), error: (line: string) => logs.push(JSON.parse(line)) };
    const stats = new AsyncStatsBuffer({ writeBatch: async () => {}, close: async () => {} }, { autoStart: false, logger });
    bot.api.config.use(async (_prev, method, payload) => {
      if (method === "getChatMember") return { ok: true, result: { status: "member", user: mixed.message.from } } as never;
      if (method === "getChat") return { ok: false, error_code: 403, description: "optional profile unavailable" };
      if (method === "deleteMessage") deletes.push(payload as { chat_id: number; message_id: number });
      return { ok: true, result: true } as never;
    });
    let currentRequest: { state: { recentMessages: unknown[] }; questions: Record<string, unknown> } | undefined;
    const classifier = new JevSpamClassifier("test-key", { ...options, fetch: async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      const isCurrent = body.state.message.text === mixed.message.text;
      if (isCurrent) {
        currentRequest = body;
        const answer = response(0.99, [0.01, 0.99]);
        if (missingLink) delete answer.answers.context_message_0;
        return Response.json(answer);
      }
      return Response.json(response(0.01, body.state.recentMessages.map(() => 0.01)));
    } });
    registerBotHandlers(bot, { classifier, model: options.model, stats, logger });
    let update = 0;
    const send = async (message: Message) => bot.handleUpdate({ update_id: ++update, message: JSON.parse(JSON.stringify(message)) });
    // Another actor and another receiving chat must never enter current sender's history.
    await send({ ...previewMessage("Other actor's message", 51), from: { id: 50, is_bot: false, first_name: "Other" } });
    await send({ ...previewMessage("Other chat's message", 52), chat: { ...mixed.message.chat, id: -20037 } });
    for (const prior of mixed.recent) await send(prior);
    await send(mixed.message);
    // Assert outside the handler: its fail-open catch must not swallow assertion failures.
    expect(currentRequest).toBeDefined();
    expect(currentRequest!.state.recentMessages).toEqual(mixed.recent.map(toModerationMessage));
    expect(currentRequest!.questions).toHaveProperty("context_message_0");
    expect(currentRequest!.questions).toHaveProperty("context_message_1");
    expect(deletes).toEqual(missingLink ? [] : [11, 100].map(message_id => ({ chat_id: mixed.message.chat.id, message_id })));
    if (missingLink) expect(logs.some(log => log.event === "classification_failed")).toBe(true);
    expect(JSON.stringify(logs)).not.toContain(previewAdText);
  });
}
