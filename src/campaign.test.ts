import { expect, test } from "bun:test";
import type { Message } from "grammy/types";
import { CampaignLedger, campaignPost, campaignText } from "./campaign";
import { repeatedOffer } from "./fixtures/repeat-campaign";

const chat = { id: -1001, type: "supergroup" as const, title: "group" };
const channel = { id: -2001, type: "channel" as const, title: "channel" };
const text = campaignText(repeatedOffer)!;
const copy = (messageId: number, post: number, receivedAt = 0, body = text) => ({ messageId, text: body, post, receivedAt });
const ids = (copies: { messageId: number }[] | undefined) => copies?.map((c) => c.messageId);

test("normalizes case, Unicode compatibility forms and whitespace; ignores short text", () => {
  expect(campaignText("  " + repeatedOffer.toUpperCase().replace(/ /g, "\n ") + " ")).toBe(text);
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

test("needs identical copies under three distinct posts and returns undeleted earlier copies", () => {
  const ledger = new CampaignLedger();
  expect(ledger.observe(1, "user:1", copy(1, 100))).toBeUndefined();
  expect(ledger.observe(1, "user:1", copy(2, 100))).toBeUndefined();
  expect(ledger.observe(1, "user:1", copy(3, 101, 0, "a different but long enough comment text here"))).toBeUndefined();
  expect(ledger.observe(1, "user:2", copy(4, 102))).toBeUndefined();
  expect(ledger.observe(2, "user:1", copy(5, 102))).toBeUndefined();
  ledger.markHandled(1, "user:1", 2);
  expect(ids(ledger.observe(1, "user:1", copy(6, 102)))).toBeUndefined();
  expect(ids(ledger.observe(1, "user:1", copy(7, 101)))).toEqual([1, 6]);
  ledger.markHandled(1, "user:1", 1);
  ledger.markHandled(1, "user:1", 6);
  ledger.markHandled(1, "user:1", 7);
  // Later copies in the same window are caught on arrival, even with nothing left to delete.
  expect(ids(ledger.observe(1, "user:1", copy(8, 103)))).toEqual([]);
});

test("edits replace their own copy; copies expire after the window; the ledger is bounded", () => {
  const ledger = new CampaignLedger(10 * 60_000, 3);
  ledger.observe(1, "a", copy(1, 100));
  expect(ledger.observe(1, "a", copy(1, 101))).toBeUndefined();
  expect(ledger.observe(1, "a", copy(2, 102))).toBeUndefined();
  const expiring = new CampaignLedger();
  expiring.observe(1, "a", copy(1, 100, 0));
  expiring.observe(1, "a", copy(2, 101, 1_000));
  expect(expiring.observe(1, "a", copy(3, 102, 10 * 60_000))).toBeUndefined();
  expect(ids(expiring.observe(1, "a", copy(4, 103, 10 * 60_000 + 500)))).toEqual([2, 3]);
  const bounded = new CampaignLedger(10 * 60_000, 2);
  bounded.observe(1, "a", copy(1, 100));
  bounded.observe(1, "a", copy(2, 101, 0, "x".repeat(50)));
  bounded.observe(1, "a", copy(3, 102, 0, "y".repeat(50)));
  expect(bounded.observe(1, "a", copy(4, 103))).toBeUndefined();
});

test("forgetting an edited-away copy removes it from the campaign", () => {
  const ledger = new CampaignLedger();
  ledger.observe(1, "a", copy(1, 100));
  ledger.observe(1, "a", copy(2, 101));
  ledger.forget(1, "a", 1);
  ledger.forget(1, "a", 99);
  expect(ledger.observe(1, "a", copy(3, 102))).toBeUndefined();
  expect(ids(ledger.observe(1, "a", copy(4, 103)))).toEqual([2, 3]);
});
