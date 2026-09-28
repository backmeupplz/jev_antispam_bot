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

import { mediaFixtures, mediaMessage, mediaUpdate, mediaCampaign } from "./fixtures/media-profile";

for (const isForwarded of [false, true]) {
  test("media fixtures preserve exact live projection forwarded=" + isForwarded, () => {
    for (const fixture of mediaFixtures) {
      const { senderProfile: _profile, ...expected } = mediaMessage(fixture, isForwarded);
      expect(toModerationMessage(mediaUpdate(fixture, isForwarded))).toEqual(expected);
    }
  });
}

test("media campaign text does not turn unknown or external sources into same-chat sender evidence", () => {
  const fixture = mediaFixtures.find(f => f.id === "same-actor campaign reply")!;
  const forwarded = mediaUpdate(fixture);
  Object.assign(forwarded.reply_to_message!, { forward_origin: { type: "user", date: 1, sender_user: forwarded.from } });
  expect(toModerationMessage(forwarded)?.preview?.[0]).toMatchObject({ text: mediaCampaign, sourceAuthor: "unknown", isForwarded: true });
  const unknown = mediaUpdate(fixture);
  delete unknown.reply_to_message!.from;
  expect(toModerationMessage(unknown)?.preview?.[0]?.sourceAuthor).toBe("unknown");
  const external = mediaUpdate(fixture);
  external.reply_to_message!.chat = { id: -2002, type: "supergroup", title: "Elsewhere" };
  expect(toModerationMessage(external)?.preview?.[0]).toMatchObject({ origin: "external", sourceAuthor: "same_author" });
  const channel = mediaUpdate(fixture);
  Object.assign(channel.reply_to_message!, { sender_chat: { id: 12, type: "channel", title: "Not user 12" } });
  expect(toModerationMessage(channel)?.preview?.[0]?.sourceAuthor).toBe("other_author");
});
