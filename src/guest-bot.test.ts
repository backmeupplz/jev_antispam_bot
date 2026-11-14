import { expect, setSystemTime, test } from "bun:test";
import { Bot } from "grammy";
import type { Message, Update, UserFromGetMe } from "grammy/types";
import type { DeletionAudit } from "./audit-outbox";
import { registerBotHandlers } from "./bot";
import { GuestReplyLinks, guestBotCaller } from "./guest-bot";
import { handleConcurrently, updateKeys } from "./lifecycle";
import { SPAM_QUESTIONS, type CurrentModerationMessage, type SpamAssessment } from "./spam";
import { AsyncStatsBuffer } from "./stats";
import { chatMovedIncident, chatMovedLink, guestSummon } from "./fixtures/chat-moved-lure";

// #668: a hijacked member summons a guest bot ("@TURAN732_BOT"); the bot replies as itself "for" that member with the
// "chat is moving, tap this text, press Start" lure. Real grammY handlers, updates through bot.handleUpdate, Telegram and the
// model mocked at their boundaries.
const botInfo = { id: 99, is_bot: true, first_name: "Moderator", username: "moderator_bot" } as UserFromGetMe;
const group = { id: -1001, type: "supergroup" as const, title: "private group title" };
const member = { id: 5_550_000_012, is_bot: false, first_name: "private member name", username: "private_member" };
const other = { id: 5_550_000_013, is_bot: false, first_name: "private other name", username: "private_other" };
const guestBot = { id: 7_700_000_001, is_bot: true, first_name: "private guest bot", username: "TURAN732_BOT" };
const helperBot = { id: 7_700_000_002, is_bot: true, first_name: "private helper bot", username: "helper_bot" };

function assessment(probability: number): SpamAssessment {
  return {
    shouldDelete: probability >= 0.8, probability, strongestSignal: "bot_promotion", model: "jev-1.13.0",
    signals: Object.fromEntries(Object.keys(SPAM_QUESTIONS).map((key) => [key, probability])) as SpamAssessment["signals"],
    contextProbabilities: [],
  };
}

function harness({ concurrent = false, audit = false } = {}) {
  const bot = new Bot("123:local-test-only", { botInfo });
  const updates = concurrent ? handleConcurrently(bot, { limit: 8 }) : undefined;
  const logs: Record<string, unknown>[] = [];
  const deletes: number[] = [];
  const classified: string[] = [];
  const reports = new Map<number, string>();
  // Score per text; a gate lets a test hold a classification until it releases it.
  const scores = new Map<string, number>([[guestSummon, 0.9355]]);
  const gates = new Map<string, Promise<void>>();
  const logger = { info: (line: string) => { logs.push(JSON.parse(line)); }, error: (line: string) => { logs.push(JSON.parse(line)); } };
  bot.api.config.use(async (_prev, method, payload) => {
    const p = payload as { chat_id?: number; user_id?: number; message_id?: number };
    if (method === "getChatAdministrators") return { ok: true, result: [] } as never;
    if (method === "getChatMember") return { ok: true, result: { status: "member", user: { id: p.user_id, is_bot: false, first_name: "m" } } } as never;
    if (method === "getChat") return { ok: true, result: { id: p.chat_id, type: "private", first_name: "member", accent_color_id: 0, max_reaction_count: 1, accepted_gift_types: {} } } as never;
    if (method === "deleteMessage") deletes.push(p.message_id!);
    return { ok: true, result: true } as never;
  });
  const deletionAudit: DeletionAudit | undefined = audit ? {
    prepare: async (_chat, id, report) => { reports.set(id, Array.isArray(report) ? report.join("\n") : report); return String(id); },
    confirmed: async () => {}, failed: async () => {},
  } : undefined;
  const stats = new AsyncStatsBuffer({ writeBatch: async () => {}, close: async () => {} }, { autoStart: false, logger });
  registerBotHandlers(bot, {
    model: "jev-1.13.0", stats, logger, spamThreshold: 0.8, deletionAudit,
    previewRequest: async () => ({ status: 404, headers: {}, body: "" }),
    classifier: { classify: async (message: CurrentModerationMessage) => {
      classified.push(message.text);
      await gates.get(message.text);
      return assessment(scores.get(message.text) ?? 0.1);
    } },
  });
  let id = 100;
  const update = (patch: Record<string, unknown>) => {
    const msg = { message_id: ++id, date: Math.floor(Date.now() / 1000), chat: group, from: member, text: "ordinary discussion", ...patch } as Message;
    return { update_id: id, message: JSON.parse(JSON.stringify(msg)) as Message } as Update;
  };
  const send = async (patch: Record<string, unknown> = {}) => {
    const u = update(patch);
    await bot.handleUpdate(u);
    await updates?.settle();
    return u.message!.message_id;
  };
  // A guest bot's reply "for" the member who called it; Telegram omits reply_to_message once the summon is deleted.
  const guestReply = (caller: typeof member | undefined, extra: Record<string, unknown> = {}) => ({
    from: guestBot, text: chatMovedIncident,
    entities: [{ type: "text_link", offset: 23, length: 21, url: chatMovedLink }],
    ...(caller ? { guest_bot_caller_user: caller } : {}), ...extra,
  });
  return { bot, updates, logs, deletes, classified, scores, gates, reports, update, send, guestReply,
    event: (name: string) => logs.filter((log) => log.event === name) };
}

const deferred = () => { let release!: () => void; const promise = new Promise<void>((resolve) => { release = resolve; }); return { promise, release }; };

test("a guest-bot reply called by a member whose summon Jev deleted goes without the model", async () => {
  const h = harness({ audit: true });
  const summon = await h.send({ text: guestSummon });
  expect(h.deletes).toEqual([summon]);
  // The lure itself scores low here: only the link to the deleted summon removes it.
  h.scores.set(chatMovedIncident, 0.1);
  const reply = await h.send(h.guestReply(member));
  expect(h.deletes).toEqual([summon, reply]);
  expect(h.classified).toEqual([guestSummon]);
  expect(h.event("guest_reply_linked")).toEqual([expect.objectContaining({ messageId: reply, link: "caller_deleted", guestBotMessage: true, decision: "delete" })]);
  expect(h.event("spam_deleted").at(-1)).toMatchObject({ messageId: reply, rule: "guest_bot_reply", deletedMessageCount: 1 });
  // The deletion still runs under its own audit report.
  expect(h.reports.has(reply)).toBe(true);
});

test("a guest-bot reply to a deleted message goes; another bot's reply to it stays with the model", async () => {
  const h = harness();
  const summon = await h.send({ text: guestSummon });
  const replied = { message_id: summon, date: 1, chat: group, from: member, text: guestSummon };
  // A helper bot answering the spam (no Guest Mode caller) is classified as usual.
  await h.send({ from: helperBot, text: "reported ✅", reply_to_message: replied });
  expect(h.deletes).toEqual([summon]);
  expect(h.classified).toEqual([guestSummon, "reported ✅"]);
  // A guest bot called by someone else, answering the deleted message.
  const reply = await h.send(h.guestReply(other, { text: "Готово ✅", entities: [], reply_to_message: replied }));
  expect(h.deletes).toEqual([summon, reply]);
  expect(h.event("guest_reply_linked")[0]).toMatchObject({ messageId: reply, link: "reply_to_deleted", guestBotMessage: true });
});

test("a guest-bot reply to a normal message is classified as usual and kept, and a human reply to a deleted message is never auto-deleted", async () => {
  const h = harness();
  const normal = await h.send({ text: "кто знает хороший бот для гифок?" });
  await h.send(h.guestReply(member, { text: "Here is a GIF", entities: [], reply_to_message: { message_id: normal, date: 1, chat: group, from: member, text: "кто знает" } }));
  expect(h.deletes).toEqual([]);
  expect(h.classified).toEqual(["кто знает хороший бот для гифок?", "Here is a GIF"]);
  expect(h.event("guest_reply_linked")).toEqual([]);

  const summon = await h.send({ from: other, text: guestSummon });
  await h.send({ text: "что это было?", reply_to_message: { message_id: summon, date: 1, chat: group, from: other, text: guestSummon } });
  expect(h.deletes).toEqual([summon]);
});

test("the lure from a guest bot is deleted on its own as chat_moved_lure, with or without the hidden link", async () => {
  for (const entities of [[], [{ type: "text_link", offset: 23, length: 21, url: chatMovedLink }]]) {
    const h = harness();
    // The ticket's replay: 0.6825 plain, 0.8142 with the link; a caller who was not deleted.
    h.scores.set(chatMovedIncident, entities.length ? 0.8142 : 0.6825);
    const reply = await h.send(h.guestReply(other, { entities }));
    expect(h.deletes).toEqual([reply]);
    expect(h.event("spam_deleted")[0]).toMatchObject({ rule: entities.length ? "model" : "chat_moved_lure" });
  }
});

test("a reply that arrives while the summon is still being classified waits for that decision (update order)", async () => {
  const h = harness({ concurrent: true });
  const gate = deferred();
  h.gates.set(guestSummon, gate.promise);
  const summon = h.update({ text: guestSummon });
  const reply = h.update(h.guestReply(member));
  await h.bot.handleUpdate(summon);
  await h.bot.handleUpdate(reply);
  await Bun.sleep(5);
  // The reply waits behind its caller's summon: not classified, not deleted yet.
  expect(h.classified).toEqual([guestSummon]);
  expect(h.deletes).toEqual([]);
  gate.release();
  await h.updates!.settle();
  expect(h.deletes).toEqual([summon.message!.message_id, reply.message!.message_id]);
  expect(h.classified).toEqual([guestSummon]);
});

test("a reply Jev kept before the summon was decided goes when the summon is deleted", async () => {
  const h = harness({ audit: true });
  h.scores.set(chatMovedIncident, 0.1);
  // A guest bot reply that is no lure on its face, kept first; then its caller's summon is deleted.
  const reply = await h.send(h.guestReply(member, { text: "Готово ✅", entities: [] }));
  expect(h.deletes).toEqual([]);
  const summon = await h.send({ text: guestSummon });
  expect(h.deletes).toEqual([summon, reply]);
  expect(h.reports.has(reply)).toBe(true);
  expect(h.event("guest_reply_linked")).toEqual([expect.objectContaining({ messageId: summon, followUpCount: 1 })]);
  expect(h.event("spam_deleted").at(-1)).toMatchObject({ messageId: summon, deletedMessageCount: 2, guestReplyCount: 1 });
  // Taken once: a later deletion does not try it again.
  await h.send({ text: guestSummon });
  expect(h.deletes.filter((id) => id === reply)).toHaveLength(1);
});

test("the link expires after ten minutes", async () => {
  try {
    setSystemTime(new Date("2026-11-14T14:29:00Z"));
    const h = harness();
    h.scores.set(chatMovedIncident, 0.1);
    await h.send({ text: guestSummon });
    setSystemTime(new Date("2026-11-14T14:39:01Z"));
    await h.send(h.guestReply(member, { text: "Готово ✅", entities: [] }));
    expect(h.deletes).toHaveLength(1);
  } finally {
    setSystemTime();
  }
});

test("bot messages are logged structurally, with no text and no identities", async () => {
  const h = harness();
  await h.send({ text: guestSummon });
  await h.send(h.guestReply(member));
  await h.send({ from: helperBot, text: "/help shows the commands" });
  expect(h.event("bot_message")).toEqual([
    { event: "bot_message", chatId: group.id, messageId: 102, guestBotMessage: true, callerKind: "user", replyToMessageId: null,
      characterCount: chatMovedIncident.length, embeddedLinkCount: 1, inlineButtonCount: 0, viaBot: false, isEdited: false },
    { event: "bot_message", chatId: group.id, messageId: 103, guestBotMessage: false, callerKind: null, replyToMessageId: null,
      characterCount: 24, embeddedLinkCount: 0, inlineButtonCount: 0, viaBot: false, isEdited: false },
  ]);
  const text = JSON.stringify(h.logs);
  for (const secret of [chatMovedIncident.slice(4, 30), "TURAN732", chatMovedLink, "private", String(member.id), String(guestBot.id), String(helperBot.id), "/help"]) {
    expect([secret, text.includes(secret)]).toEqual([secret, false]);
  }
});

test("a guest bot's update waits for its caller and the member it replies to; other updates do not", () => {
  const message = (patch: Record<string, unknown>) => ({ update_id: 1, message: { message_id: 1, date: 1, chat: group, text: "x", ...patch } }) as Update;
  expect(updateKeys(message({ from: guestBot, guest_bot_caller_user: member }))).toEqual([`user:${guestBot.id}`, `user:${member.id}`]);
  expect(updateKeys(message({ from: guestBot, guest_bot_caller_chat: { id: -2001, type: "channel", title: "c" } }))).toEqual([`user:${guestBot.id}`, "chat:-2001"]);
  expect(updateKeys(message({ from: guestBot, guest_bot_caller_user: member, reply_to_message: { message_id: 2, date: 1, chat: group, from: other, text: "y" } })))
    .toEqual([`user:${guestBot.id}`, `user:${member.id}`, `user:${other.id}`]);
  expect(updateKeys(message({ from: guestBot, guest_bot_caller_user: member, reply_to_message: { message_id: 2, date: 1, chat: group, from: member, text: "y" } })))
    .toEqual([`user:${guestBot.id}`, `user:${member.id}`]);
  // Another bot's reply, a forum topic's root and a human's reply keep only the sender's own key.
  expect(updateKeys(message({ from: helperBot, reply_to_message: { message_id: 2, date: 1, chat: group, from: other, text: "y" } }))).toEqual([`user:${helperBot.id}`]);
  expect(updateKeys(message({ from: guestBot, guest_bot_caller_user: member, reply_to_message: { message_id: 2, date: 1, chat: group, from: other, forum_topic_created: { name: "t", icon_color: 1 } } })))
    .toEqual([`user:${guestBot.id}`, `user:${member.id}`]);
  expect(updateKeys(message({ from: member, reply_to_message: { message_id: 2, date: 1, chat: group, from: other, text: "y" } }))).toEqual([`user:${member.id}`]);
});

test("guestBotCaller reads Guest Mode's caller user or chat", () => {
  const base = { message_id: 1, date: 1, chat: group, from: guestBot, text: "x" } as Message;
  expect(guestBotCaller(base)).toBeUndefined();
  expect(guestBotCaller({ ...base, guest_bot_caller_user: member } as Message)).toBe(`user:${member.id}`);
  expect(guestBotCaller({ ...base, guest_bot_caller_chat: { id: -2001, type: "channel", title: "c" } } as Message)).toBe("chat:-2001");
});

test("GuestReplyLinks: links within the TTL only, bounded per chat and in chats, kept replies taken once", () => {
  const links = new GuestReplyLinks(600_000, 3, 2);
  links.deleted(1, "user:12", [10, 11], 0);
  expect(links.linked(1, 10, undefined, 599_999)).toBe("reply_to_deleted");
  expect(links.linked(1, undefined, "user:12", 599_999)).toBe("caller_deleted");
  expect(links.linked(1, 10, "user:12", 600_000)).toBeUndefined();
  expect(links.linked(2, 10, "user:12", 0)).toBeUndefined();
  // Per chat: the oldest message ids go first.
  links.deleted(1, "user:13", [12, 13], 1);
  expect(links.linked(1, 10, undefined, 2)).toBeUndefined();
  expect(links.linked(1, 11, undefined, 2)).toBe("reply_to_deleted");
  expect(links.size.deletedMessages).toBe(3);
  // Chats: the least recently used chat goes first.
  links.deleted(2, "user:14", [1], 3);
  links.deleted(3, "user:15", [1], 4);
  expect(links.linked(1, 11, undefined, 5)).toBeUndefined();
  expect(links.linked(3, 1, undefined, 5)).toBe("reply_to_deleted");
  expect(links.size.chats).toBe(2);

  const sender = "user:7";
  links.keep(4, { messageId: 50, sender, replyTo: 40 }, 0);
  links.keep(4, { messageId: 51, sender, caller: "user:12" }, 0);
  links.keep(4, { messageId: 52, sender }, 0);
  expect(links.take(4, "user:99", [41], 1)).toEqual([]);
  expect(links.take(4, "user:12", [40], 1)).toEqual([{ messageId: 50, sender, link: "reply_to_deleted" }, { messageId: 51, sender, link: "caller_deleted" }]);
  expect(links.take(4, "user:12", [40], 1)).toEqual([]);
  links.keep(4, { messageId: 53, sender, replyTo: 40 }, 0);
  expect(links.take(4, "user:12", [40], 600_000)).toEqual([]);
  links.keep(4, { messageId: 54, sender, replyTo: 40 }, 0);
  links.forget(4, 54);
  expect(links.take(4, "user:12", [40], 1)).toEqual([]);
  // A kept reply deleted on its own (or within the same deletion) is not taken again later.
  links.keep(4, { messageId: 55, sender, replyTo: 40 }, 0);
  links.deleted(4, sender, [55], 1);
  expect(links.take(4, "user:12", [40], 2)).toEqual([]);
  links.keep(4, { messageId: 56, sender, replyTo: 40 }, 0);
  expect(links.take(4, sender, [56], 1)).toEqual([]);
  expect(links.take(4, "user:12", [40], 2)).toEqual([]);
  // Kept replies have their own, smaller cap per chat.
  const small = new GuestReplyLinks(600_000, 200, 10, 2);
  for (const id of [1, 2, 3]) small.keep(9, { messageId: id, sender, replyTo: 40 }, 0);
  expect(small.size.kept).toBe(2);
  expect(small.take(9, "user:12", [40], 1).map((t) => t.messageId)).toEqual([2, 3]);
});
