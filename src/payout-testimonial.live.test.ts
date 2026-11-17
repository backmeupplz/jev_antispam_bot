import { expect, test } from "bun:test";
import { Bot } from "grammy";
import type { Message, Update, UserFromGetMe } from "grammy/types";
import { registerBotHandlers } from "./bot";
import { APPROVED_MODEL } from "./policy";
import { JevSpamClassifier } from "./spam";
import { AsyncStatsBuffer } from "./stats";
import { payoutTestimonialAds, payoutTestimonialControls, payoutTestimonialIncident } from "./fixtures/payout-testimonial";

// #716 on the approved Laya endpoint at the unchanged 0.80 gate: the amount-free payout testimonial, its variants and controls,
// through the real handlers with Telegram mocked.
// RUN_LIVE_LAYA=1 JEV_URL=http://127.0.0.1:8811/v1/systemone [LAYA_API_KEY=…] bun test src/payout-testimonial.live.test.ts
const url = process.env.JEV_URL;
const liveTest = process.env.RUN_LIVE_LAYA === "1" && url ? test : test.skip;
const group = { id: -1002, type: "supergroup" as const, title: "Synthetic discussion" };
const botInfo = { id: 99, is_bot: true, first_name: "Moderator", username: "moderator_bot" } as UserFromGetMe;

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
  const send = async (text: string) => {
    const message = { message_id: ++id, date: Math.floor(Date.now() / 1000), chat: group, from: { id: 1000 + id, is_bot: false, first_name: "member" }, text } as Message;
    await bot.handleUpdate({ update_id: id, message: JSON.parse(JSON.stringify(message)) } as Update);
    const analyzed = logs.find((log) => log.event === "message_analyzed" && log.messageId === id);
    const pattern = logs.find((log) => log.event === "promo_pattern_detected" && log.messageId === id);
    return { case: text.slice(0, 40), deleted: deletes.includes(id), confidence: analyzed?.confidence, pattern: pattern?.pattern };
  };
  return { send, stop: () => stats.stop() };
}

liveTest("#716: the amount-free payout testimonial and its variants are deleted", async () => {
  const h = handler();
  const results = [];
  for (const text of [payoutTestimonialIncident, ...payoutTestimonialAds]) results.push(await h.send(text));
  console.log(JSON.stringify(results));
  expect(results.filter((r) => !r.deleted)).toEqual([]);
  await h.stop();
}, 600_000);

liveTest("#716: controls stay: own broker experience, own channel, warnings, questions and replies", async () => {
  const h = handler();
  const results = [];
  for (const text of payoutTestimonialControls) results.push(await h.send(text));
  console.log(JSON.stringify(results));
  expect(results.filter((r) => r.pattern)).toEqual([]);
  await h.stop();
}, 600_000);
