import { expect, test } from "bun:test";
import type { Message } from "grammy/types";
import { campaignMessageIds, campaignPost, campaignText } from "./campaign";
import type { RecentMessage } from "./history";
import { repeatedOffer } from "./fixtures/repeat-campaign";

const chat = { id: -1001, type: "supergroup" as const, title: "group" };
const channel = { id: -2001, type: "channel" as const, title: "channel" };
const copy = (messageId: number, campaignPost?: number, text = repeatedOffer): RecentMessage =>
  ({ text, embeddedLinks: [], isForwarded: false, messageId, receivedAt: 0, campaignPost });

test("normalizes case, Unicode compatibility forms and whitespace; ignores short text", () => {
  expect(campaignText("  " + repeatedOffer.toUpperCase().replace(/ /g, "\n ") + " ")).toBe(campaignText(repeatedOffer));
  expect(campaignText("ＡＢＣ" + "x".repeat(40))).toBe("abc" + "x".repeat(40));
  expect(campaignText("x".repeat(39))).toBeUndefined();
  expect(campaignText("x".repeat(40))).toBe("x".repeat(40));
});

test("only same-chat automatic forwards of linked channel posts count as posts", () => {
  const post = { message_id: 7, date: 0, chat, sender_chat: channel, is_automatic_forward: true };
  const base = { message_id: 8, date: 0, chat, text: repeatedOffer };
  expect(campaignPost({ ...base, reply_to_message: post } as Message)).toBe(7);
  expect(campaignPost(base as Message)).toBeUndefined();
  // A non-linked channel speaking in the group, or a member's own message, is not a post.
  expect(campaignPost({ ...base, reply_to_message: { ...post, is_automatic_forward: undefined } } as Message)).toBeUndefined();
  expect(campaignPost({ ...base, reply_to_message: { message_id: 7, date: 0, chat, from: { id: 5, is_bot: false, first_name: "m" } } } as Message)).toBeUndefined();
  expect(campaignPost({ ...base, reply_to_message: { ...post, chat: { ...chat, id: -1 } } } as Message)).toBeUndefined();
});

test("needs identical copies under three distinct posts and returns every qualifying copy", () => {
  expect(campaignMessageIds([copy(1, 100)], { messageId: 2, text: repeatedOffer, campaignPost: 101 })).toEqual([]);
  expect(campaignMessageIds([copy(1, 100), copy(2, 100)], { messageId: 3, text: repeatedOffer, campaignPost: 101 })).toEqual([]);
  expect(campaignMessageIds([copy(1, 100), copy(2, 101)], { messageId: 3, text: repeatedOffer, campaignPost: 102 })).toEqual([1, 2, 3]);
  // Unrelated messages and copies that replied to members stay; they are not campaign copies.
  expect(campaignMessageIds([copy(1, 100), copy(2, undefined), copy(3, 101, "Unrelated message that is long enough to count here"), copy(4, 101)],
    { messageId: 5, text: repeatedOffer, campaignPost: 102 })).toEqual([1, 4, 5]);
  expect(campaignMessageIds([copy(1, 100), copy(2, 101)], { messageId: 3, text: repeatedOffer })).toEqual([]);
  expect(campaignMessageIds([copy(1, 100, "x".repeat(39)), copy(2, 101, "x".repeat(39))], { messageId: 3, text: "x".repeat(39), campaignPost: 102 })).toEqual([]);
});
