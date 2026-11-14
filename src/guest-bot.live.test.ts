import { expect, test } from "bun:test";
import { Bot } from "grammy";
import type { Message, Update, UserFromGetMe } from "grammy/types";
import { registerBotHandlers } from "./bot";
import { APPROVED_MODEL } from "./policy";
import { JevSpamClassifier } from "./spam";
import { AsyncStatsBuffer } from "./stats";
import { chatMovedControls, chatMovedFamily, chatMovedModelOnly, chatMovedIncident, chatMovedLink, guestSummon } from "./fixtures/chat-moved-lure";

// #668 on the approved Laya endpoint at the unchanged 0.80 gate: the guest-bot "chat is moving" lure, its variants and controls,
// and the one-handle summon, through the real handlers with Telegram mocked.
// RUN_LIVE_LAYA=1 JEV_URL=http://127.0.0.1:8811/v1/systemone [LAYA_API_KEY=…] bun test src/guest-bot.live.test.ts
const url = process.env.JEV_URL;
const liveTest = process.env.RUN_LIVE_LAYA === "1" && url ? test : test.skip;
const group = { id: -1002, type: "supergroup" as const, title: "Synthetic discussion" };
const botInfo = { id: 99, is_bot: true, first_name: "Moderator", username: "moderator_bot" } as UserFromGetMe;
const member = { id: 12, is_bot: false, first_name: "member" };
const guestBot = { id: 7_700_000_001, is_bot: true, first_name: "guest", username: "TURAN732_BOT" };
const helperBot = { id: 7_700_000_002, is_bot: true, first_name: "helper", username: "helper_bot" };

function handler() {
  const bot = new Bot("123:local-test-only", { botInfo });
  const logs: Record<string, unknown>[] = [];
  const deletes: number[] = [];
  const logger = { info: (line: string) => { logs.push(JSON.parse(line)); }, error: (line: string) => { logs.push(JSON.parse(line)); } };
  bot.api.config.use(async (_prev, method, payload) => {
    const p = payload as { chat_id?: number; user_id?: number; message_id?: number };
    if (method === "getChatAdministrators") return { ok: true, result: [] } as never;
    if (method === "getChatMember") return { ok: true, result: { status: "member", user: { id: p.user_id, is_bot: false, first_name: "m" } } } as never;
    if (method === "getChat") return { ok: true, result: { id: p.chat_id, type: "private", first_name: "member", accent_color_id: 0, max_reaction_count: 1, accepted_gift_types: {} } } as never;
    if (method === "deleteMessage") deletes.push(p.message_id!);
    return { ok: true, result: true } as never;
  });
  const stats = new AsyncStatsBuffer({ writeBatch: async () => {}, close: async () => {} }, { autoStart: false, logger });
  registerBotHandlers(bot, { model: APPROVED_MODEL, stats, logger, spamThreshold: 0.8,
    previewRequest: async () => ({ status: 404, headers: {}, body: "" }),
    classifier: new JevSpamClassifier(process.env.LAYA_API_KEY ?? "", { model: APPROVED_MODEL, threshold: 0.8, timeoutMs: 60_000, url }) });
  let id = 0;
  // Each message comes from its own sender, so no case sees another's history.
  const send = async (patch: Record<string, unknown>) => {
    const message = { message_id: ++id, date: Math.floor(Date.now() / 1000), chat: group, from: { ...member, id: 1000 + id }, ...patch } as Message;
    await bot.handleUpdate({ update_id: id, message: JSON.parse(JSON.stringify(message)) } as Update);
    const analyzed = logs.find((log) => log.event === "message_analyzed" && log.messageId === id);
    const pattern = logs.find((log) => log.event === "promo_pattern_detected" && log.messageId === id);
    return { id, deleted: deletes.includes(id), confidence: analyzed?.confidence, pattern: pattern?.pattern };
  };
  return { send, stop: () => stats.stop() };
}

const hidden = (text: string) => ({ entities: [{ type: "text_link", offset: text.indexOf("Нажмите на этот текст"), length: 21, url: chatMovedLink }] });

liveTest("#668: the guest-bot lure is deleted from a bot or a human, with or without the hidden link", async () => {
  const h = handler();
  const results = [];
  for (const from of [guestBot, member]) {
    for (const extra of [{}, hidden(chatMovedIncident)]) {
      const caller = from.is_bot ? { guest_bot_caller_user: { ...member, id: 4242 } } : {};
      results.push({ case: `${from.is_bot ? "bot" : "human"}${"entities" in extra ? "+link" : ""}`, ...await h.send({ from, text: chatMovedIncident, ...extra, ...caller }) });
    }
  }
  for (const text of chatMovedFamily.slice(1)) results.push({ case: text.slice(0, 40), ...await h.send({ from: guestBot, text }) });
  console.log(JSON.stringify(results));
  expect(results.filter((r) => !r.deleted)).toEqual([]);
  await h.stop();
}, 600_000);

liveTest("#668: controls stay: where the chat moved, bot help, an inline-bot result, warnings and normal Russian chat", async () => {
  const h = handler();
  const results = [];
  // Two controls the model already deletes on its own (no rule) are pattern controls only.
  for (const text of chatMovedControls.filter((text) => !chatMovedModelOnly.includes(text))) results.push({ case: text.slice(0, 40), ...await h.send({ text }) });
  results.push({ case: "bot help", ...await h.send({ from: helperBot, text: "Commands: /start to begin, /help for this list, /settings to change the language." }) });
  results.push({ case: "inline result", ...await h.send({ text: "Moscow is the capital and largest city of Russia.", via_bot: { id: 7_700_000_003, is_bot: true, first_name: "wiki", username: "wiki" } }) });
  results.push({ case: "@gif mention", ...await h.send({ text: "@gif котики" }) });
  console.log(JSON.stringify(results));
  expect(results.filter((r) => r.deleted)).toEqual([]);
  await h.stop();
}, 600_000);

// The incident's 21-character summon scored 0.9355 with its sender's profile; a bare handle from a member without one scores about
// 0.71 here. Either way it stays with the model: no rule deletes a single bot mention (@gif-style use must stay).
liveTest("#668: the single-handle summon from a member stays with the model, no rule", async () => {
  const h = handler();
  const result = await h.send({ text: guestSummon });
  console.log(JSON.stringify(result));
  expect(result.pattern).toBeUndefined();
  expect(typeof result.confidence).toBe("number");
  await h.stop();
}, 120_000);
