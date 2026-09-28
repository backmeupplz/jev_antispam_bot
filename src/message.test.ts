import { expect, test } from "bun:test";
import type { Message } from "grammy/types";
import { toModerationMessage } from "./message";

test("normalizes text and hidden links", () => {
  const message = {
    message_id: 1,
    date: 0,
    chat: { id: -1, type: "supergroup", title: "Test" },
    text: "click here",
    entities: [{ type: "text_link", offset: 0, length: 10, url: "https://example.com" }],
    forward_origin: { type: "hidden_user", sender_user_name: "Someone", date: 0 },
  } as Message;

  expect(toModerationMessage(message)).toEqual({
    text: "click here",
    embeddedLinks: ["https://example.com"],
    isForwarded: true,
  });
});

test("normalizes eligible uncaptioned media", () => {
  const message = {
    message_id: 1,
    date: 0,
    chat: { id: -1, type: "supergroup", title: "Test" },
    sticker: { file_id: "x", file_unique_id: "x", type: "regular", width: 1, height: 1, is_animated: false, is_video: false },
  } as Message;
  expect(toModerationMessage(message)).toEqual({ text: "", embeddedLinks: [], isForwarded: false, mediaOnly: true });
});

import { recruitmentReply, hiringRequest } from "./fixtures/recruitment-replies";

test("reply sources are bounded, nonrecursive and contain no identifiers", () => {
  const message = recruitmentReply("offer", "a".repeat(2000));
  const reply = message.reply_to_message!;
  Object.assign(reply, { entities: Array.from({ length: 12 }, (_, i) => ({ type: "text_link", offset: i, length: 1, url: "https://example.com/" + i + "x".repeat(600) })),
    reply_to_message: recruitmentReply("nested should not survive") });
  const normalized = toModerationMessage(message)!;
  expect(normalized.preview).toHaveLength(1);
  expect(normalized.preview![0]!.text).toHaveLength(1200);
  expect(normalized.preview![0]!.embeddedLinks).toHaveLength(8);
  expect(normalized.preview![0]!.embeddedLinks.every(link => link.length <= 512)).toBe(true);
  expect(JSON.stringify(normalized)).not.toMatch(/message_id|first_name|Requester|nested should not survive/);
});

test("reply actor attribution respects sender_chat, forwards, missing identity and captions", () => {
  const shape = recruitmentReply("offer", hiringRequest, false, 12);
  expect(toModerationMessage(shape)!.preview![0]!.sourceAuthor).toBe("same_author");
  const reply = shape.reply_to_message!;
  Object.assign(reply, { sender_chat: { id: -33, type: "channel", title: "source" } });
  expect(toModerationMessage(shape)!.preview![0]!.sourceAuthor).toBe("other_author");
  Object.assign(shape, { sender_chat: { id: -33, type: "channel", title: "source" } });
  expect(toModerationMessage(shape)!.preview![0]!.sourceAuthor).toBe("same_author");
  Object.assign(reply, { forward_origin: { type: "hidden_user", date: 1, sender_user_name: "hidden" } });
  expect(toModerationMessage(shape)!.preview![0]!.sourceAuthor).toBe("unknown");
  const caption = recruitmentReply("offer", hiringRequest);
  const source = caption.reply_to_message as unknown as Record<string, unknown>;
  delete source.text; delete source.from; source.caption = hiringRequest;
  expect(toModerationMessage(caption)!.preview![0]).toMatchObject({ text: hiringRequest, sourceAuthor: "unknown" });
});

test("keeps original author and a forwarded local reply distinct from current author", () => {
  const chat = { id: -1, type: "supergroup", title: "group" };
  const result = toModerationMessage({
    message_id: 2, date: 1, chat, from: { id: 2, is_bot: false, first_name: "current" },
    text: "666", reply_to_message: {
      message_id: 1, date: 1, chat, from: { id: 3, is_bot: false, first_name: "poster" },
      forward_origin: { type: "hidden_user", sender_user_name: "untrusted source", date: 1 },
      text: "Shop bot bonus — ask for details",
      entities: [{ type: "text_link", offset: 0, length: 4, url: "https://example.com/shop" }],
    },
  } as Message);
  expect(result).toEqual({ text: "666", embeddedLinks: [], isForwarded: false, preview: [{
    kind: "reply", origin: "same_chat", sourceKind: "hidden_user", sourceAuthor: "unknown", isForwarded: true,
    text: "Shop bot bonus — ask for details", embeddedLinks: ["https://example.com/shop"],
  }] });
});

test("external reply has metadata, not invented full text; quote content stays separate", () => {
  const chat = { id: -1, type: "supergroup", title: "group" };
  const base = { message_id: 2, date: 1, chat, from: { id: 2, is_bot: false, first_name: "current" },
    text: "please verify", external_reply: {
      origin: { type: "channel", chat: { id: -2, type: "channel", title: "external" },
        message_id: 9, date: 1 }, chat: { id: -2, type: "channel", title: "external" }, message_id: 9,
      link_preview_options: { is_disabled: false },
    } };
  const missing = toModerationMessage(base as Message);
  expect(missing?.preview).toEqual([{ kind: "external_reply", origin: "external", sourceKind: "channel",
    sourceAuthor: "unknown", isForwarded: false, embeddedLinks: [] }]);
  // Bot API TextQuote.entities keeps only formatting/custom-emoji/date-time
  // entities; text_link is not valid there and must not be expected.
  const quoted = toModerationMessage({ ...base,
    quote: { text: "contact for recharge bonus", position: 0,
      entities: [{ type: "bold", offset: 0, length: 7 }] },
  } as Message);
  expect(quoted?.preview?.[1]).toEqual({ kind: "quote", origin: "external", sourceKind: "channel",
    sourceAuthor: "unknown", isForwarded: false, text: "contact for recharge bonus",
    embeddedLinks: [] });
  expect(quoted?.embeddedLinks).toEqual([]);
});

test("bounds preview text, current text and links without following nested reply history", () => {
  const chat = { id: -1, type: "supergroup", title: "group" };
  const result = toModerationMessage({
    message_id: 2, date: 1, chat, text: "x".repeat(6_000),
    reply_to_message: { message_id: 1, date: 1, chat, text: "y".repeat(4_000),
      entities: Array.from({ length: 20 }, (_, index) => ({ type: "text_link", offset: 0,
        length: 1, url: "https://example.org/" + index })),
      reply_to_message: { message_id: 0, date: 1, chat, text: "never read" },
    },
  } as Message);
  expect(result?.text).toHaveLength(4_096);
  expect(result?.preview?.[0]?.text).toHaveLength(1_200);
  expect(result?.preview?.[0]?.embeddedLinks).toHaveLength(8);
  expect(JSON.stringify(result)).not.toContain("never read");
});

test("external replies distinguish another topic, another chat, and unavailable chat metadata", () => {
  const chat = { id: -1, type: "supergroup" as const, title: "group" };
  for (const sourceChat of [chat, { ...chat, id: -2 }, undefined]) {
    const result = toModerationMessage({ message_id: 2, date: 1, chat, text: "verify",
      external_reply: { origin: { type: "chat", sender_chat: chat, date: 1 },
        ...(sourceChat ? { chat: sourceChat, message_id: 9 } : {}) },
      quote: { text: "source", position: 0 },
    } as Message)!;
    expect(result.preview?.map(p => p.origin)).toEqual(Array(2).fill(
      !sourceChat ? "unknown" : sourceChat.id === chat.id ? "same_chat" : "external"));
    expect(result.preview?.[0]?.sourceKind).toBe("chat");
  }
});
