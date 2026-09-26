import { expect, test } from "bun:test";
import { Bot } from "grammy";
import type { Message, Update, UserFromGetMe } from "grammy/types";
import { registerBotHandlers } from "./bot";
import { chinesePromotion, chinesePromotionControls } from "./fixtures/chinese-promotion";
import { testimonialPromotions } from "./fixtures/testimonial-promotion";
import { reportedRecruitment } from "./fixtures/vague-recruitment";
import {
  SPAM_QUESTIONS,
  type CurrentModerationMessage,
  type ModerationMessage,
  type SpamAssessment,
} from "./spam";
import { AsyncStatsBuffer, type StatsBatch } from "./stats";

const botInfo: UserFromGetMe = {
  id: 99, is_bot: true, first_name: "Moderator", username: "moderator_bot",
  can_join_groups: true, can_read_all_group_messages: true, supports_inline_queries: false,
  can_connect_to_business: false, has_main_web_app: false,
  has_topics_enabled: false, allows_users_to_create_topics: false,
  can_manage_bots: false, supports_join_request_queries: false,
};
const group = { id: -1001, type: "supergroup" as const, title: "private group title" };
const channel = { id: -2001, type: "channel" as const, title: "private channel identity" };
const user = { id: 12, is_bot: false, first_name: "private sender name", username: "private_username" };
const forwardedUser = { id: 765432109, is_bot: false, first_name: "forward origin" };
const personalChannel = { id: -2013, type: "channel" as const, title: "private profile channel" };
const synthetic = { id: 136817688, is_bot: true, first_name: "Channel" };
const forwarded = { type: "channel" as const, chat: channel, message_id: 50, date: 1 };

function assessment(deleteIt = false, links: number[] = []): SpamAssessment {
  return {
    shouldDelete: deleteIt, probability: deleteIt ? 0.97 : 0.1,
    strongestSignal: "unsolicited_promotion", model: "jev-1.13.0",
    signals: Object.fromEntries(Object.keys(SPAM_QUESTIONS).map((key) => [key, deleteIt ? 0.97 : 0.1])) as SpamAssessment["signals"],
    contextProbabilities: links,
  };
}

function harness() {
  const bot = new Bot("123:local-test-only", { botInfo });
  const logs: Record<string, unknown>[] = [];
  const calls: { method: string; payload: Record<string, unknown> }[] = [];
  const classifications: { message: CurrentModerationMessage; recent: ModerationMessage[] }[] = [];
  const batches: StatsBatch[] = [];
  let answer = assessment();
  let classifyError = false;
  let metadataError = false;
  let profileError = false;
  let adminError = false;
  let memberStatus = "member";
  let metadata: Record<string, unknown> = { ...group, accent_color_id: 0, max_reaction_count: 1 };
  let profileMetadata: Record<string, unknown> = {
    id: user.id, type: "private", first_name: "private", accent_color_id: 0,
    max_reaction_count: 1, accepted_gift_types: {},
  };
  let personalChannelMetadata: Record<string, unknown> = {
    ...personalChannel, accent_color_id: 0, max_reaction_count: 1, accepted_gift_types: {},
  };
  const failedDeletes = new Set<number>();
  const logger = {
    info: (line: string) => { logs.push(JSON.parse(line)); },
    error: (line: string) => { logs.push(JSON.parse(line)); },
  };
  const stats = new AsyncStatsBuffer({
    writeBatch: async (batch) => { batches.push(structuredClone(batch)); },
    close: async () => {},
  }, { autoStart: false, logger });
  bot.api.config.use(async (_prev, method, payload) => {
    calls.push({ method, payload: payload as Record<string, unknown> });
    const chatId = (payload as { chat_id?: number }).chat_id;
    const isReceivingGroup = chatId === group.id || chatId === metadata.id;
    if ((method === "getChat" && isReceivingGroup && metadataError)
      || (method === "getChat" && !isReceivingGroup && profileError)
      || (method === "getChatMember" && adminError)) {
      return { ok: false, error_code: 403, description: "private API detail" };
    }
    if (method === "getChat") {
      if (isReceivingGroup) return { ok: true, result: metadata } as never;
      if (chatId === personalChannel.id) return { ok: true, result: personalChannelMetadata } as never;
      return { ok: true, result: { ...profileMetadata, id: chatId } } as never;
    }
    if (method === "getChatMember") return { ok: true, result: { status: memberStatus, user } } as never;
    if (method === "deleteMessage" && failedDeletes.has((payload as { message_id: number }).message_id)) {
      return { ok: false, error_code: 400, description: "private delete detail" };
    }
    return { ok: true, result: true } as never;
  });
  registerBotHandlers(bot, {
    model: "jev-1.13.0", stats, logger,
    classifier: { classify: async (message, recent = []) => {
      classifications.push(structuredClone({ message, recent }));
      if (classifyError) throw new Error("private model failure including message content");
      return answer;
    } },
  });
  let id = 0;
  const send = async (patch: Record<string, unknown> = {}, edited = false) => {
    const msg = { message_id: ++id, date: 1, chat: group, from: user, text: "ordinary discussion", ...patch } as Message;
    // Telegram JSON omits absent fields rather than supplying undefined keys.
    const telegramMessage = JSON.parse(JSON.stringify(msg)) as Message;
    await bot.handleUpdate({ update_id: id, [edited ? "edited_message" : "message"]: telegramMessage } as Update);
    return msg.message_id;
  };
  return {
    send, bot, logs, calls, classifications, batches, stats, failedDeletes,
    setAnswer: (value: SpamAssessment) => { answer = value; },
    setClassifyError: () => { classifyError = true; },
    setMetadataError: () => { metadataError = true; },
    setProfileError: () => { profileError = true; },
    setAdminError: () => { adminError = true; },
    setMemberStatus: (value: string) => { memberStatus = value; },
    setMetadata: (value: Record<string, unknown>) => { metadata = value; },
    setProfileMetadata: (value: Record<string, unknown>) => { profileMetadata = value; },
    setPersonalChannelMetadata: (value: Record<string, unknown>) => { personalChannelMetadata = value; },
    skipped: () => logs.filter((log) => log.event === "message_skipped"),
    deletes: () => calls.filter((call) => call.method === "deleteMessage").map((call) => call.payload.message_id),
  };
}

test.each([false, true])("vague paid recruitment reaches the real handler (forwarded=%s)", async (isForwarded) => {
  const h = harness();
  const answer = assessment();
  answer.signals.unsolicited_vague_recruitment = 0.91;
  answer.strongestSignal = "unsolicited_vague_recruitment";
  answer.probability = 0.91;
  answer.shouldDelete = true;
  h.setAnswer(answer);
  const text = reportedRecruitment.paidCompletion;
  await h.send({
    text,
    ...(isForwarded ? { forward_origin: { type: "hidden_user", sender_user_name: "private origin", date: 1 } } : {}),
  });
  expect(h.classifications).toEqual([{ message: { text, embeddedLinks: [], isForwarded }, recent: [] }]);
  expect(h.deletes()).toEqual([1]);
  expect(h.logs.filter((log) => log.event === "message_analyzed")[0]).toMatchObject({
    decision: "delete", strongestSignal: "unsolicited_vague_recruitment",
  });
  expect(JSON.stringify(h.logs)).not.toContain(text);
  await h.stats.stop();
});

test("ambiguous no-pay recruitment remains below the gate when classifier is uncertain", async () => {
  const h = harness();
  const answer = assessment();
  answer.signals.unsolicited_vague_recruitment = 0.62;
  answer.strongestSignal = "unsolicited_vague_recruitment";
  answer.probability = 0.62;
  h.setAnswer(answer);
  await h.send({ text: reportedRecruitment.unpaidAmbiguous, forward_origin: {
    type: "hidden_user", sender_user_name: "private origin", date: 1,
  } });
  expect(h.classifications[0]?.message).toMatchObject({ isForwarded: true, text: reportedRecruitment.unpaidAmbiguous });
  expect(h.deletes()).toEqual([]);
  await h.stats.stop();
});

test("repeated reply-shaped paid recruitment deletes only a linked same-actor suffix", async () => {
  const h = harness();
  const text = reportedRecruitment.shiftCover;
  h.setAnswer(assessment(false));
  await h.send({ text: "Unrelated earlier discussion" });
  await h.send({ text, reply_to_message: { message_id: 900, date: 1, chat: group, text: "Other topic" } });
  await h.send({ text, reply_to_message: { message_id: 901, date: 1, chat: group, text: "Other topic" } });
  h.setAnswer(assessment(true, [0.08, 0.96, 0.97]));
  await h.send({ text, reply_to_message: { message_id: 902, date: 1, chat: group, text: "Other topic" } });
  expect(h.classifications[3]?.recent.map((message) => message.text)).toEqual([
    "Unrelated earlier discussion", text, text,
  ]);
  expect(h.deletes()).toEqual([2, 3, 4]);
  expect(JSON.stringify(h.logs)).not.toContain(text);
  await h.stats.stop();
});

test.each([false, true])("testimonial signal deletes normalized human post (forwarded=%s)", async (isForwarded) => {
  const h = harness();
  const answer = assessment();
  answer.signals.unsolicited_testimonial_promotion = 0.9;
  answer.strongestSignal = "unsolicited_testimonial_promotion";
  answer.probability = 0.9;
  answer.shouldDelete = true;
  h.setAnswer(answer);
  const text = testimonialPromotions[0]!.text;
  await h.send({
    text,
    entities: [{ type: "mention", offset: text.indexOf("@"), length: "@ClarityExampleBot".length }],
    ...(isForwarded ? { forward_origin: { type: "hidden_user", sender_user_name: "private origin", date: 1 } } : {}),
  });
  expect(h.classifications).toEqual([{ message: { text, embeddedLinks: [], isForwarded }, recent: [] }]);
  expect(h.deletes()).toEqual([1]);
  expect(h.skipped()).toEqual([]);
  const completed = h.logs.filter((log) => log.event === "message_analyzed");
  expect(completed).toHaveLength(1);
  expect(completed[0]).toMatchObject({ decision: "delete", strongestSignal: "unsolicited_testimonial_promotion" });
  expect(JSON.stringify(h.logs)).not.toContain(text);
  expect(JSON.stringify(h.logs)).not.toContain("private origin");
  await h.stats.stop();
});

test("emoji bait is classified with forwarded-user bio and personal-channel text", async () => {
  const h = harness();
  h.setAnswer(assessment(true));
  h.setProfileMetadata({
    id: forwardedUser.id, type: "private", first_name: "private", accent_color_id: 0,
    max_reaction_count: 1, accepted_gift_types: {}, bio: "private adult access",
    personal_chat: personalChannel,
  });
  h.setPersonalChannelMetadata({
    ...personalChannel, accent_color_id: 0, max_reaction_count: 1, accepted_gift_types: {},
    description: "private videos, registration required",
  });

  const forwardOrigin = { type: "user" as const, sender_user: forwardedUser, date: 1 };
  await h.send({ text: "❤️", forward_origin: forwardOrigin });
  await h.send({ text: "❤️", forward_origin: forwardOrigin });

  expect(h.classifications[0]?.message).toEqual({
    text: "❤️", embeddedLinks: [], isForwarded: true,
    senderProfile: {
      bio: "private adult access",
      personalChannel: {
        title: personalChannel.title,
        description: "private videos, registration required",
      },
    },
  });
  expect(h.calls.filter((call) => call.method === "getChat" && call.payload.chat_id === forwardedUser.id)).toHaveLength(1);
  expect(h.calls.filter((call) => call.method === "getChat" && call.payload.chat_id === personalChannel.id)).toHaveLength(1);
  expect(h.deletes()).toEqual([1, 2]);
  const serialized = JSON.stringify(h.logs);
  for (const sensitive of ["private adult access", "private videos", personalChannel.title, String(forwardedUser.id)]) {
    expect(serialized).not.toContain(sensitive);
  }
  await h.stats.stop();
});

test("profile metadata failure logs safely and continues message-only classification", async () => {
  const h = harness();
  h.setProfileError();
  await h.send({ text: "❤️" });
  await h.send({ text: "Another short hook" });
  expect(h.classifications[0]?.message).toEqual({ text: "❤️", embeddedLinks: [], isForwarded: false });
  expect(h.classifications[1]?.message).toEqual({
    text: "Another short hook", embeddedLinks: [], isForwarded: false,
  });
  expect(h.logs.filter((log) => log.event === "profile_metadata_failed")).toHaveLength(1);
  expect(h.calls.filter((call) => call.method === "getChat" && call.payload.chat_id === user.id)).toHaveLength(1);
  expect(h.logs.filter((log) => log.event === "message_analysis_started")
    .every((log) => log.senderProfilePresent === false)).toBe(true);
  expect(JSON.stringify(h.logs)).not.toContain("private API detail");
  await h.stats.stop();
});

test("external channel Chinese ad reaches classifier and deletion despite synthetic bot from", async () => {
  const h = harness();
  h.setAnswer(assessment(true));
  await h.send({ sender_chat: channel, from: synthetic, text: chinesePromotion, forward_origin: forwarded });
  expect(h.classifications).toEqual([{ message: { text: chinesePromotion, embeddedLinks: [], isForwarded: true }, recent: [] }]);
  expect(h.deletes()).toEqual([1]);
  expect(h.calls.map((call) => call.method)).toEqual(["getChat", "deleteMessage"]);
  expect(h.skipped()).toEqual([]);
  await h.stats.stop();
  expect(h.batches[0]?.deletions.map(({ chatId, messageId }) => [chatId, messageId])).toEqual([["-1001", "1"]]);
  expect(h.batches[0]?.classificationAttempts.map(({ chatId, messageId, updateId }) =>
    [chatId, messageId, updateId])).toEqual([["-1001", "1", "1"]]);
});

test("channel identity without from is eligible; edited captions and hidden links are normalized", async () => {
  const h = harness();
  h.setAnswer(assessment(true));
  await h.send({ from: undefined, sender_chat: channel, text: undefined, caption: chinesePromotion,
    caption_entities: [{ type: "text_link", offset: 0, length: 1, url: "https://example.com" }] }, true);
  expect(h.classifications[0]?.message).toEqual({ text: chinesePromotion, embeddedLinks: ["https://example.com"], isForwarded: false });
  expect(h.deletes()).toEqual([1]);
  expect(h.logs.find((log) => log.event === "message_analysis_started")?.isEdited).toBe(true);
  await h.stats.stop();
});

test.each(["administrator", "creator"])("human %s remains exempt", async (status) => {
  const h = harness();
  h.setMemberStatus(status);
  await h.send();
  expect(h.skipped().map((log) => log.reason)).toEqual(["group_admin"]);
  expect(h.classifications).toEqual([]);
  expect(h.deletes()).toEqual([]);
  await h.stats.stop();
});

test("genuine anonymous group admin is exempt without a metadata request", async () => {
  const h = harness();
  await h.send({ sender_chat: group, from: synthetic });
  expect(h.skipped().map((log) => log.reason)).toEqual(["anonymous_group_admin"]);
  expect(h.calls).toEqual([]);
  await h.stats.stop();
});

test("official linked channel is exempt only while current group metadata proves it", async () => {
  const h = harness();
  h.setMetadata({ ...group, linked_chat_id: channel.id });
  await h.send({ sender_chat: channel, from: synthetic, is_automatic_forward: true, forward_origin: forwarded });
  expect(h.skipped().map((log) => log.reason)).toEqual(["official_linked_channel"]);
  expect(h.classifications).toEqual([]);
  // The relationship can change. Do not trust a stale link or automatic-forward flag.
  h.setMetadata({ ...group, linked_chat_id: -9000 });
  await h.send({ sender_chat: channel, from: synthetic, is_automatic_forward: true, forward_origin: forwarded });
  expect(h.classifications).toHaveLength(1);
  expect(h.calls.filter((call) => call.method === "getChat")).toHaveLength(2);
  expect(h.deletes()).toEqual([]);
  await h.stats.stop();
});

test("ordinary user forwards are classified even when forward origin is the official channel", async () => {
  const h = harness();
  h.setMetadata({ ...group, linked_chat_id: channel.id });
  for (const text of chinesePromotionControls) await h.send({ text, forward_origin: forwarded });
  expect(h.classifications).toHaveLength(chinesePromotionControls.length);
  expect(h.classifications.every(({ message }) => message.isForwarded)).toBe(true);
  expect(h.calls.some((call) => call.method === "getChat" && call.payload.chat_id === group.id)).toBe(false);
  expect(h.deletes()).toEqual([]);
  await h.stats.stop();
});

test.each([
  ["private_chat", { chat: { id: 12, type: "private", first_name: "private" } }],
  ["unsupported_chat_type", { chat: channel }],
  ["no_text_or_caption", { text: undefined, photo: [] }],
  ["no_text_or_caption", { text: "  \n " }],
  ["missing_sender", { from: undefined }],
  ["bot_itself", { from: botInfo }],
  ["bot_sender", { from: synthetic }],
  ["unsupported_sender_chat", { sender_chat: { ...group, id: -555 } }],
] as const)("pre-classifier branch logs exactly one private-safe %s record", async (reason, patch) => {
  const h = harness();
  await h.send(patch);
  expect(h.skipped()).toEqual([{
    event: "message_skipped", chatId: "chat" in patch ? patch.chat.id : group.id, messageId: 1,
    reason, decision: "keep", isEdited: false,
  }]);
  expect(h.classifications).toEqual([]);
  expect(h.deletes()).toEqual([]);
  expect(h.calls).toEqual([]);
  await h.stats.stop();
  expect(h.batches[0]?.chats).toHaveLength(1); // Global observation survives every skip.
  expect(h.batches[0]?.classificationAttempts).toEqual([]);
  expect(h.batches[0]?.deletions).toEqual([]);
});

test("metadata API failures and invalid responses fail open with terminal skip reasons", async () => {
  for (const reason of ["sender_chat_metadata_failed", "admin_metadata_failed", "sender_chat_metadata_invalid"]) {
    const h = harness();
    if (reason === "admin_metadata_failed") h.setAdminError();
    else if (reason === "sender_chat_metadata_failed") h.setMetadataError();
    else h.setMetadata({ ...group, id: -999 });
    await h.send(reason === "admin_metadata_failed" ? {} : { sender_chat: channel, from: synthetic });
    expect(h.skipped().map((log) => log.reason)).toEqual([reason]);
    expect(h.classifications).toEqual([]);
    expect(h.deletes()).toEqual([]);
    const logText = JSON.stringify(h.logs);
    for (const sensitive of ["private API detail", channel.title, user.first_name, user.username, String(channel.id), String(synthetic.id)]) {
      expect(logText).not.toContain(sensitive);
    }
    await h.stats.stop();
  }
});

test("channel history isolates identities, synthetic from, human users, receiving groups and edits", async () => {
  const h = harness();
  await h.send({ sender_chat: channel, from: synthetic, text: "channel A first" });
  await h.send({ sender_chat: { ...channel, id: -2002 }, from: synthetic, text: "channel B first" });
  await h.send({ from: { ...user, id: synthetic.id }, text: "synthetic ID as user" });
  await h.send({ from: { ...user, id: channel.id }, text: "same numeric ID as user" });
  h.setMetadata({ ...group, id: -1002 });
  await h.send({ chat: { ...group, id: -1002 }, sender_chat: channel, from: synthetic, text: "other group" });
  h.setMetadata(group);
  await h.send({ message_id: 1, sender_chat: channel, from: synthetic, text: "channel A edited" }, true);
  await h.send({ sender_chat: channel, from: synthetic, text: "channel A second" });
  expect(h.classifications.slice(0, 6).map(({ recent }) => recent.map(({ text }) => text)))
    .toEqual([[], [], [], [], [], []]);
  expect(h.classifications[6]?.recent.map(({ text }) => text)).toEqual(["channel A edited"]);
  // A confirmed linked verdict deletes only A's suffix, never B or other users/chats.
  h.setAnswer(assessment(true, [0.2, 0.98]));
  await h.send({ sender_chat: channel, from: synthetic, text: chinesePromotion });
  expect(h.deletes()).toEqual([7, 8]);
  await h.stats.stop();
});

test("classification failure keeps and remembers the channel message with one failed analysis", async () => {
  const h = harness();
  h.setClassifyError();
  await h.send({ sender_chat: channel, from: synthetic, text: chinesePromotion });
  await h.send({ sender_chat: channel, from: synthetic, text: "follow-up" });
  expect(h.classifications[1]?.recent[0]?.text).toBe(chinesePromotion);
  expect(h.logs.filter((log) => log.event === "message_analyzed")).toHaveLength(2);
  expect(h.logs.filter((log) => log.event === "message_analyzed").every((log) => log.status === "failed" && log.decision === "keep" && log.signals === null)).toBe(true);
  expect(h.skipped()).toEqual([]);
  expect(h.deletes()).toEqual([]);
  expect(JSON.stringify(h.logs)).not.toContain(chinesePromotion);
  expect(JSON.stringify(h.logs)).not.toContain("private model failure");
  await h.stats.stop();
  expect(h.batches[0]?.classificationAttempts.map(({ messageId, updateId }) =>
    [messageId, updateId])).toEqual([["1", "1"], ["2", "2"]]);
});

test("linked deletes persist only successful group/message identities, never sender or content", async () => {
  const h = harness();
  await h.send({ sender_chat: channel, from: synthetic, text: "prior" });
  h.setAnswer(assessment(true, [0.98]));
  h.failedDeletes.add(1);
  await h.send({ sender_chat: channel, from: synthetic, text: chinesePromotion });
  expect(h.deletes()).toEqual([1, 2]);
  expect(h.logs.find((log) => log.event === "spam_deleted")).toMatchObject({ attemptedMessageCount: 2, deletedMessageCount: 1 });
  expect(h.logs.filter((log) => log.event === "delete_failed")).toHaveLength(1);
  await h.stats.stop();
  expect(h.batches[0]?.deletions.map(({ chatId, messageId }) => [chatId, messageId])).toEqual([["-1001", "2"]]);
  expect(h.batches[0]?.classificationAttempts.map(({ chatId, messageId, updateId }) =>
    [chatId, messageId, updateId])).toEqual([
      ["-1001", "1", "1"],
      ["-1001", "2", "2"],
    ]);
  const serialized = JSON.stringify({ batches: h.batches, logs: h.logs });
  for (const sensitive of [chinesePromotion, "private delete detail", channel.title, user.first_name, user.username, String(channel.id), String(synthetic.id)]) {
    expect(serialized).not.toContain(sensitive);
  }
});

test("downstream command failure cannot relabel a linked-channel skip as metadata failure", async () => {
  const h = harness();
  h.setMetadata({ ...group, linked_chat_id: channel.id });
  h.setAdminError(); // /status fails after the eligibility middleware has continued.
  await expect(h.send({ sender_chat: channel, from: synthetic, text: "/status",
    entities: [{ type: "bot_command", offset: 0, length: 7 }] })).rejects.toThrow();
  expect(h.skipped().map((log) => log.reason)).toEqual(["official_linked_channel"]);
  expect(h.logs.some((log) => log.event === "sender_chat_check_failed")).toBe(false);
  await h.stats.stop();
});

test("membership updates retain stats lifecycle and invalidate cached human admin status", async () => {
  const h = harness();
  await h.send(); // Cache ordinary member status.
  h.setMemberStatus("administrator");
  await h.bot.handleUpdate({
    update_id: 100,
    chat_member: { chat: group, from: user, date: 1,
      old_chat_member: { status: "member", user },
      new_chat_member: { status: "administrator", user, can_be_edited: false,
        is_anonymous: false, can_manage_chat: true, can_delete_messages: true,
        can_manage_video_chats: true, can_restrict_members: true, can_promote_members: false,
        can_change_info: true, can_invite_users: true, can_post_stories: false,
        can_edit_stories: false, can_delete_stories: false, can_manage_tags: false },
    },
  } as Update);
  await h.send();
  expect(h.skipped().map((log) => log.reason)).toEqual(["group_admin"]);
  expect(h.classifications).toHaveLength(1);
  await h.bot.handleUpdate({
    update_id: 101,
    my_chat_member: { chat: group, from: user, date: 1,
      old_chat_member: { status: "member", user: botInfo },
      new_chat_member: { status: "left", user: botInfo },
    },
  });
  await h.stats.stop();
  expect(h.batches[0]?.chats[0]).toMatchObject({ chatId: String(group.id), chatType: "supergroup", membershipActive: false });
  expect(h.batches[0]?.deletions).toEqual([]);
  expect(h.calls.some((call) => call.method === "sendMessage")).toBe(false);
});
