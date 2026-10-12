import { expect, test } from "bun:test";
import type { Message } from "grammy/types";
import { CampaignLedger, campaignPost, campaignText, type CampaignCopy } from "./campaign";
import { repeatedOffer } from "./fixtures/repeat-campaign";

const chat = { id: -1001, type: "supergroup" as const, title: "group" };
const channel = { id: -2001, type: "channel" as const, title: "channel" };
const text = campaignText(repeatedOffer)!;
const copy = (messageId: number, post: number, postedAt = 0, body = text) => ({ messageId, text: body, post, postedAt });
const ids = (campaign: { pending: { messageId: number }[] } | undefined) => campaign?.pending.map((c) => c.messageId);

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

test("needs identical copies under three distinct posts and returns its undeleted copies", () => {
  const ledger = new CampaignLedger();
  expect(ledger.observe(1, "user:1", copy(1, 100))).toBeUndefined();
  expect(ledger.observe(1, "user:1", copy(2, 100))).toBeUndefined();
  expect(ledger.observe(1, "user:1", copy(3, 101, 0, "a different but long enough comment text here"))).toBeUndefined();
  expect(ledger.observe(1, "user:2", copy(4, 102))).toBeUndefined();
  expect(ledger.observe(2, "user:1", copy(5, 102))).toBeUndefined();
  ledger.markHandled(1, "user:1", 2);
  expect(ledger.observe(1, "user:1", copy(6, 102))).toBeUndefined();
  expect(ledger.observe(1, "user:1", copy(7, 101))).toEqual({ size: 4, pending: [expect.objectContaining({ messageId: 1 }),
    expect.objectContaining({ messageId: 6 }), expect.objectContaining({ messageId: 7 })] });
  for (const id of [1, 6, 7]) ledger.markHandled(1, "user:1", id);
  // Later copies in the same window are caught on arrival; the size is the whole campaign.
  const later = ledger.observe(1, "user:1", copy(8, 103));
  expect(later?.size).toBe(5);
  expect(ids(later)).toEqual([8]);
});

test("the window is keyed on post time, and edits keep the original time and handled state", () => {
  const ledger = new CampaignLedger();
  ledger.observe(1, "a", copy(1, 100, 0));
  ledger.observe(1, "a", copy(2, 101, 1_000));
  // Processed together, but posted more than ten minutes after the first copy.
  expect(ledger.observe(1, "a", copy(3, 102, 10 * 60_000))).toBeUndefined();
  expect(ids(ledger.observe(1, "a", copy(4, 103, 10 * 60_000 + 500)))).toEqual([2, 3, 4]);
  for (const id of [2, 3, 4]) ledger.markHandled(1, "a", id);
  // An unchanged edit (even reporting a later time) stays handled and is not retried.
  expect(ledger.observe(1, "a", copy(3, 102, 20 * 60_000))).toEqual({ size: 3, pending: [] });
  expect(ids(ledger.observe(1, "a", copy(5, 104, 10 * 60_000 + 700)))).toEqual([5]);
});

test("edits replace their own copy; copies are kept through a backlog, then forgotten", () => {
  const ledger = new CampaignLedger();
  ledger.observe(1, "a", copy(1, 100));
  expect(ledger.observe(1, "a", copy(1, 101))).toBeUndefined();
  expect(ledger.observe(1, "a", copy(2, 102))).toBeUndefined();
  // Posted minutes apart but processed late: the first copy is still there for the third.
  const backlog = new CampaignLedger();
  backlog.observe(1, "a", copy(1, 100, 0), 0);
  backlog.observe(1, "a", copy(2, 101, 3 * 60_000), 5 * 60_000);
  expect(ids(backlog.observe(1, "a", copy(3, 102, 6 * 60_000), 11 * 60_000))).toEqual([1, 2, 3]);
  const expiring = new CampaignLedger();
  expiring.observe(1, "a", copy(1, 100), 0);
  expiring.observe(1, "a", copy(2, 101), 0);
  // Even a matching post time cannot revive copies seen two windows ago.
  expect(expiring.observe(1, "a", copy(3, 102), 20 * 60_000)).toBeUndefined();
});

test("all distinct posts must fit in one window with the current copy, edits included", () => {
  const ledger = new CampaignLedger();
  ledger.observe(1, "a", copy(1, 100, 0));
  ledger.observe(1, "a", copy(2, 101, 9 * 60_000));
  expect(ledger.observe(1, "a", copy(3, 102, 18 * 60_000))).toBeUndefined();
  // The middle copy is within ten minutes of both others, but they are 18 minutes apart.
  expect(ledger.observe(1, "a", copy(2, 101, 9 * 60_000))).toBeUndefined();
  expect(ids(ledger.observe(1, "a", copy(4, 100, 17 * 60_000)))?.sort()).toEqual([2, 3, 4]);
});

test("an edit to another eligible text keeps its handled state and drops its audit snapshot", () => {
  const ledger = new CampaignLedger();
  const other = "another long enough comment text that is also repeated";
  const snapshot = { messageId: 2 } as never;
  for (const [id, post] of [[1, 100], [2, 101], [3, 102]] as const) ledger.observe(1, "a", { ...copy(id, post), auditSnapshot: snapshot });
  for (const id of [1, 2, 3]) ledger.markHandled(1, "a", id);
  ledger.observe(1, "a", { ...copy(2, 101, 0, other), auditSnapshot: snapshot });
  ledger.observe(1, "a", copy(4, 102, 0, other));
  const campaign = ledger.observe(1, "a", copy(5, 103, 0, other));
  expect(campaign?.size).toBe(3);
  expect(ids(campaign)).toEqual([4, 5]);
  // The handled copy edited back to the first text carries no snapshot; only the new copy is pending.
  const back = ledger.observe(1, "a", { ...copy(2, 101), auditSnapshot: snapshot });
  expect(back?.pending).toEqual([]);
  ledger.observe(1, "a", { ...copy(6, 103), auditSnapshot: snapshot });
  const handled = (ledger as unknown as { actors: Map<string, Map<string, CampaignCopy[]>> }).actors.get("1:a")!.get(text)!;
  expect(handled.filter((c) => c.auditSnapshot).map((c) => c.messageId)).toEqual([6]);
});

test("a handled copy edited away and back stays handled", () => {
  const ledger = new CampaignLedger();
  for (const [id, post] of [[1, 100], [2, 101], [3, 102]] as const) ledger.observe(1, "a", copy(id, post));
  for (const id of [1, 2, 3]) ledger.markHandled(1, "a", id);
  ledger.forget(1, "a", 1);
  expect(ledger.observe(1, "a", copy(1, 100))).toEqual({ size: 3, pending: [] });
  expect(ids(ledger.observe(1, "a", copy(4, 103)))).toEqual([4]);
  // A tombstone older than retention is not restored.
  const stale = new CampaignLedger();
  stale.observe(1, "a", copy(1, 100), 0);
  stale.markHandled(1, "a", 1);
  stale.forget(1, "a", 1);
  stale.observe(1, "a", copy(2, 101, 20 * 60_000), 20 * 60_000);
  stale.observe(1, "a", copy(3, 102, 20 * 60_000), 20 * 60_000);
  expect(ids(stale.observe(1, "a", copy(1, 100, 20 * 60_000), 20 * 60_000))?.sort()).toEqual([1, 2, 3]);
});

test("the cap evicts whole texts, never copies of a campaign", () => {
  const ledger = new CampaignLedger(10 * 60_000, 2);
  for (let id = 1; id <= 25; id += 1) ledger.observe(1, "a", copy(id, 100 + (id % 2)));
  expect(ids(ledger.observe(1, "a", copy(26, 102)))).toEqual([...Array(26).keys()].map((i) => i + 1));
  const bounded = new CampaignLedger(10 * 60_000, 2);
  bounded.observe(1, "a", copy(1, 100));
  bounded.observe(1, "a", copy(2, 101));
  bounded.observe(1, "a", copy(3, 102, 0, "x".repeat(50)));
  bounded.observe(1, "a", copy(4, 103, 0, "y".repeat(50)));
  expect(bounded.observe(1, "a", copy(5, 104))).toBeUndefined();
});

test("forgetting an edited-away copy removes it from the campaign", () => {
  const ledger = new CampaignLedger();
  ledger.observe(1, "a", copy(1, 100));
  ledger.observe(1, "a", copy(2, 101));
  ledger.forget(1, "a", 1);
  ledger.forget(1, "a", 99);
  expect(ledger.observe(1, "a", copy(3, 102))).toBeUndefined();
  expect(ids(ledger.observe(1, "a", copy(4, 103)))).toEqual([2, 3, 4]);
});
