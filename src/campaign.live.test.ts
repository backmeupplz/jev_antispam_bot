import { expect, test } from "bun:test";
import { Bot } from "grammy";
import type { Message, Update, UserFromGetMe } from "grammy/types";
import { registerBotHandlers } from "./bot";
import { APPROVED_MODEL } from "./policy";
import { JevSpamClassifier } from "./spam";
import { AsyncStatsBuffer } from "./stats";
import { channelPosts, repeatControls, repeatedOffer } from "./fixtures/repeat-campaign";

// Before/after for #81 on the approved Laya endpoint at the unchanged 0.80 gate.
// RUN_LIVE_LAYA=1 JEV_URL=http://127.0.0.1:8811/v1/systemone bun test src/campaign.live.test.ts
const url = process.env.JEV_URL;
const liveTest = process.env.RUN_LIVE_LAYA === "1" && url ? test : test.skip;
const group = { id: -1002, type: "supergroup" as const, title: "Synthetic discussion" };
const channel = { id: -1003, type: "channel" as const, title: "Synthetic channel" };
const botInfo = { id: 99, is_bot: true, first_name: "Moderator", username: "moderator_bot" } as UserFromGetMe;

function handler(bio?: string) {
  const bot = new Bot("123:local-test-only", { botInfo });
  const logs: Record<string, unknown>[] = [];
  const deletes: number[] = [];
  const logger = { info: (line: string) => { logs.push(JSON.parse(line)); }, error: (line: string) => { logs.push(JSON.parse(line)); } };
  bot.api.config.use(async (_prev, method, payload) => {
    const p = payload as { chat_id?: number; user_id?: number; message_id?: number };
    if (method === "getChatMember") return { ok: true, result: { status: "member", user: { id: p.user_id, is_bot: false, first_name: "m" } } } as never;
    if (method === "getChat") return { ok: true, result: p.chat_id === group.id ? { ...group, accent_color_id: 0, max_reaction_count: 1 }
      : { id: p.chat_id, type: "private", first_name: "member", accent_color_id: 0, max_reaction_count: 1, accepted_gift_types: {}, ...(bio ? { bio } : {}) } } as never;
    if (method === "deleteMessage") deletes.push(p.message_id!);
    return { ok: true, result: true } as never;
  });
  const stats = new AsyncStatsBuffer({ writeBatch: async () => {}, close: async () => {} }, { autoStart: false, logger });
  registerBotHandlers(bot, { model: APPROVED_MODEL, stats, logger, spamThreshold: 0.8,
    previewRequest: async () => ({ status: 404, headers: {}, body: "" }),
    classifier: new JevSpamClassifier("", { model: APPROVED_MODEL, threshold: 0.8, timeoutMs: 60_000, url }) });
  let id = 0;
  const send = async (text: string, reply?: Record<string, unknown>, from = 12) => {
    const message = { message_id: ++id, date: 1, chat: group, from: { id: from, is_bot: false, first_name: "member" }, text,
      ...(reply ? { reply_to_message: reply } : {}) } as Message;
    await bot.handleUpdate({ update_id: id, message: JSON.parse(JSON.stringify(message)) } as Update);
  };
  const scores = () => logs.filter((log) => log.event === "message_analyzed").map((log) => [log.decision, log.confidence]);
  return { send, logs, deletes, scores, stop: () => stats.stop() };
}
const post = (index: number) => ({ message_id: 500 + index, date: 1, chat: group, sender_chat: channel, is_automatic_forward: true,
  forward_origin: { type: "channel", chat: channel, message_id: 60 + index, date: 1 }, text: channelPosts[index % channelPosts.length] });
const request = (index: number) => ({ message_id: 700 + index, date: 1, chat: group, from: { id: 40 + index, is_bot: false, first_name: "seeker" },
  text: repeatControls.seekerRequest });

for (const bio of [undefined, "promises are the sweetest lies..."]) {
  liveTest(`incident: model keeps every channel copy, campaign deletes all three (bio=${Boolean(bio)})`, async () => {
    const h = handler(bio);
    for (let index = 0; index < 3; index += 1) await h.send(repeatedOffer, post(index));
    console.log(JSON.stringify({ case: "incident", bio: Boolean(bio), before: h.scores(), after: h.deletes }));
    expect(h.scores().every(([decision]) => decision === "keep")).toBe(true);
    expect(h.deletes).toEqual([1, 2, 3]);
    await h.stop();
  }, 120_000);

  liveTest(`controls never trigger the campaign rule (bio=${Boolean(bio)})`, async () => {
    const h = handler(bio);
    for (let index = 0; index < 3; index += 1) await h.send(repeatControls.requestedOffer, request(index));
    const texts = [repeatControls.jobSeeker, repeatControls.wageDiscussion, repeatControls.warning, repeatControls.report];
    for (const [index, text] of texts.entries()) await h.send(text, post(index), 13);
    for (let index = 0; index < 3; index += 1) await h.send(repeatControls.chatter, post(index), 14);
    console.log(JSON.stringify({ case: "controls", bio: Boolean(bio), scores: h.scores(), deletes: h.deletes }));
    expect(h.logs.some((log) => log.event === "repeat_campaign_detected")).toBe(false);
    // Any deletion here is the model's own verdict, unchanged by this rule.
    expect(h.logs.filter((log) => log.event === "spam_deleted").every((log) => log.rule === "model")).toBe(true);
    await h.stop();
  }, 120_000);
}
