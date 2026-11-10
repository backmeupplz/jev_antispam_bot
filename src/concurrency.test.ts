import { expect, test } from "bun:test";
import { Bot } from "grammy";
import type { Message, Update, UserFromGetMe } from "grammy/types";
import { handleConcurrently, updateKeys } from "./lifecycle";
import { registerBotHandlers } from "./bot";
import { AsyncStatsBuffer } from "./stats";
import { SPAM_QUESTIONS, type CurrentModerationMessage, type ModerationMessage, type SpamAssessment } from "./spam";

const botInfo = { id: 99, is_bot: true, first_name: "Moderator", username: "moderator_bot" } as UserFromGetMe;
const group = { id: -1001, type: "supergroup" as const, title: "fixture group" };
const channel = { id: -2001, type: "channel" as const, title: "fixture channel" };
const person = (id: number) => ({ id, is_bot: false, first_name: `fixture ${id}` });
const defer = () => { let resolve!: () => void; const promise = new Promise<void>(r => { resolve = r; }); return { promise, resolve }; };
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
let nextId = 0;
const message = (from: number, patch: Record<string, unknown> = {}) =>
  ({ message_id: ++nextId, date: 1, chat: group, from: person(from), text: `fixture ${nextId}`, ...patch }) as Message;
const update = (msg: Message, edited = false) => ({ update_id: ++nextId, [edited ? "edited_message" : "message"]: msg }) as Update;
const promote = (userId: number): Update => ({
  update_id: ++nextId,
  chat_member: { chat: group, from: person(1), date: 1,
    old_chat_member: { status: "member", user: person(userId) },
    new_chat_member: { status: "administrator", user: person(userId), can_be_edited: false, is_anonymous: false,
      can_manage_chat: true, can_delete_messages: true, can_manage_video_chats: true, can_restrict_members: true,
      can_promote_members: false, can_change_info: true, can_invite_users: true, can_post_stories: false,
      can_edit_stories: false, can_delete_stories: false, can_manage_tags: false } },
} as Update);

test("updateKeys orders by actor: user, sender chat, the member a chat_member update changes", () => {
  expect(updateKeys(update(message(5)))).toEqual(["user:5"]);
  expect(updateKeys(update(message(5), true))).toEqual(["user:5"]);
  expect(updateKeys(update(message(136817688, { sender_chat: channel })))).toEqual([`chat:${channel.id}`]);
  expect(updateKeys(update(message(1087968824, { sender_chat: group })))).toEqual([`chat:${group.id}`]);
  expect(updateKeys(promote(7))).toEqual(["user:7"]);
  expect(updateKeys({ update_id: 1, my_chat_member: { chat: group } } as Update)).toEqual([`in:${group.id}`]);
  // Who added or blocked Jev: the promo stats for that user follow their /start.
  expect(updateKeys({ update_id: 1, my_chat_member: { chat: group, from: { id: 5 } } } as Update)).toEqual([`in:${group.id}`, "user:5"]);
});

/** A bot whose handler holds each update until the test releases it. */
function scheduler(limit: number) {
  const bot = new Bot("123:fixture", { botInfo });
  const updates = handleConcurrently(bot, { limit });
  const started: number[] = [];
  const finished: number[] = [];
  const gates = new Map<number, ReturnType<typeof defer>>();
  let running = 0, peak = 0;
  bot.on(["message", "edited_message", "chat_member"], async ctx => {
    const id = ctx.update.update_id;
    started.push(id); running++; peak = Math.max(peak, running);
    const gate = defer(); gates.set(id, gate);
    await gate.promise;
    running--; finished.push(id);
  });
  const release = async (id: number) => { while (!gates.has(id)) await tick(); gates.get(id)!.resolve(); await tick(); };
  return { bot, updates, started, finished, release, peak: () => peak };
}

test("different actors run at once up to the limit; one actor's updates run one by one, in order", async () => {
  const s = scheduler(2);
  const a1 = update(message(1)), b1 = update(message(2)), a2 = update(message(1)), c1 = update(message(3));
  for (const u of [a1, b1, a2, c1]) await s.bot.handleUpdate(u); // each returns before its update is handled
  await tick();
  expect(s.started).toEqual([a1.update_id, b1.update_id]);
  await s.release(a1.update_id);
  // a2 could not queue for a slot until a1 finished, so the freed slot goes to c1, already waiting
  expect(s.started).toEqual([a1.update_id, b1.update_id, c1.update_id]);
  await s.release(b1.update_id);
  expect(s.started.at(-1)).toBe(a2.update_id);
  let settled = false;
  const settling = s.updates.settle().then(() => { settled = true; });
  await tick();
  expect(settled).toBe(false);
  await s.release(c1.update_id); await s.release(a2.update_id);
  await settling;
  expect(s.peak()).toBe(2);
  expect(s.finished).toEqual([a1.update_id, b1.update_id, c1.update_id, a2.update_id]);
  expect(s.updates.size).toBe(0);
});

test("an edit waits for its original; a promotion is ordered with that member's messages", async () => {
  const s = scheduler(4);
  const original = message(1);
  const sent = update(original), edit = update({ ...original, edit_date: 2, text: "edited" } as Message, true);
  const before = update(message(5)), promotion = promote(5), after = update(message(5));
  for (const u of [sent, edit, before, promotion, after]) await s.bot.handleUpdate(u);
  await tick();
  expect(s.started).toEqual([sent.update_id, before.update_id]);
  await s.release(before.update_id);
  expect(s.started).toEqual([sent.update_id, before.update_id, promotion.update_id]);
  await s.release(promotion.update_id);
  await s.release(sent.update_id);
  await s.release(edit.update_id); await s.release(after.update_id);
  await s.updates.settle();
  expect(s.finished).toEqual([before.update_id, promotion.update_id, sent.update_id, edit.update_id, after.update_id]);
});

test("a failing update reaches bot.catch and does not block that actor's next update", async () => {
  const bot = new Bot("123:fixture", { botInfo });
  const updates = handleConcurrently(bot);
  const caught: number[] = [], handled: number[] = [];
  bot.catch(({ ctx }) => { caught.push(ctx.update.update_id); });
  bot.on("message", ctx => { if (ctx.msg.text === "fail") throw new Error("fixture"); handled.push(ctx.update.update_id); });
  const bad = update(message(1, { text: "fail" })), good = update(message(1));
  await bot.handleUpdate(bad); await bot.handleUpdate(good);
  await updates.settle();
  expect(caught).toEqual([bad.update_id]);
  expect(handled).toEqual([good.update_id]);
  expect(() => handleConcurrently(bot, { limit: 0 })).toThrow();
});

test("real handlers: one sender's history stays in order while other senders run alongside", async () => {
  const bot = new Bot("123:fixture", { botInfo });
  const updates = handleConcurrently(bot, { limit: 4 });
  const deletes: number[] = [];
  bot.api.config.use(async (_prev, method, payload) => {
    const p = payload as { chat_id?: number; user_id?: number; message_id?: number };
    if (method === "getChatAdministrators") return { ok: true, result: [] } as never;
    if (method === "getChatMember") return { ok: true, result: { status: "member", user: person(p.user_id!) } } as never;
    if (method === "getChat") return { ok: true, result: { id: p.chat_id, type: "private", first_name: "fixture" } } as never;
    if (method === "deleteMessage") deletes.push(p.message_id!);
    return { ok: true, result: true } as never;
  });
  const held = defer();
  const calls: { text: string; recent: string[] }[] = [];
  const verdict = (spam: boolean, links: number[] = []): SpamAssessment => ({
    shouldDelete: spam, probability: spam ? 0.97 : 0.1, strongestSignal: "unsolicited_promotion", model: "fixture",
    signals: Object.fromEntries(Object.keys(SPAM_QUESTIONS).map(k => [k, spam ? 0.97 : 0.1])) as SpamAssessment["signals"],
    contextProbabilities: links,
  });
  const logs: Record<string, unknown>[] = [];
  const stats = new AsyncStatsBuffer({ writeBatch: async () => {}, close: async () => {} }, { autoStart: false });
  registerBotHandlers(bot, { model: "fixture", stats, logger: { info: l => logs.push(JSON.parse(l)), error: l => logs.push(JSON.parse(l)) },
    classifier: { classify: async (msg: CurrentModerationMessage, recent: ModerationMessage[] = []) => {
      calls.push({ text: msg.text, recent: recent.map(r => r.text) });
      if (msg.text === "setup") { await held.promise; return verdict(false); }
      return msg.text === "pitch" ? verdict(true, [0.99]) : verdict(false);
    } },
  });
  const setup = message(1, { text: "setup" }), pitch = message(1, { text: "pitch" }), other = message(2, { text: "hello" });
  for (const msg of [setup, pitch, other]) await bot.handleUpdate(update(msg));
  while (calls.length < 2) await tick();
  // The other sender is classified while the first sender's first message is still with the model.
  expect(calls.map(c => c.text)).toEqual(["setup", "hello"]);
  held.resolve();
  await updates.settle();
  // The pitch saw the setup as context and its linked deletion removed both, oldest first.
  expect(calls[2]).toEqual({ text: "pitch", recent: ["setup"] });
  expect(deletes).toEqual([setup.message_id, pitch.message_id]);
  expect(logs.filter(l => l.event === "message_analysis_started").map(l => typeof l.updateLagMs)).toEqual(["number", "number", "number"]);
  await stats.stop();
});

test("updateLagMs uses edit_date for an edit", async () => {
  const bot = new Bot("123:fixture", { botInfo });
  bot.api.config.use(async (_prev, method, payload) => {
    if (method === "getChatAdministrators") return { ok: true, result: [] } as never;
    if (method === "getChat") return { ok: true, result: { id: (payload as { chat_id: number }).chat_id, type: "private", first_name: "f" } } as never;
    return { ok: true, result: true } as never;
  });
  const logs: Record<string, unknown>[] = [];
  const stats = new AsyncStatsBuffer({ writeBatch: async () => {}, close: async () => {} }, { autoStart: false });
  registerBotHandlers(bot, { model: "fixture", stats, logger: { info: l => logs.push(JSON.parse(l)), error() {} },
    classifier: { classify: async () => ({ shouldDelete: false, probability: 0.1, strongestSignal: "unsolicited_promotion", model: "fixture",
      signals: Object.fromEntries(Object.keys(SPAM_QUESTIONS).map(k => [k, 0.1])) as SpamAssessment["signals"], contextProbabilities: [] }) },
  });
  const now = Math.floor(Date.now() / 1000);
  const msg = message(1, { date: now - 600, edit_date: now - 5 });
  await bot.handleUpdate(update(msg));
  await bot.handleUpdate(update(msg, true));
  const [sent, edited] = logs.filter(l => l.event === "message_analysis_started").map(l => l.updateLagMs as number);
  expect(sent).toBeGreaterThanOrEqual(600_000);
  expect(sent).toBeLessThan(605_000);
  expect(edited).toBeGreaterThanOrEqual(5_000);
  expect(edited).toBeLessThan(10_000);
  await stats.stop();
});
