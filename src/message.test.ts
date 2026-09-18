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

test("ignores messages without text or caption", () => {
  const message = {
    message_id: 1,
    date: 0,
    chat: { id: -1, type: "supergroup", title: "Test" },
    sticker: { file_id: "x", file_unique_id: "x", type: "regular", width: 1, height: 1, is_animated: false, is_video: false },
  } as Message;
  expect(toModerationMessage(message)).toBeNull();
});
