import { expect, test } from "bun:test";
import { escalatedScore, MemoryRepeatStore, REPEAT_WINDOW_MS, repeatKey, repeatText, RepeatSnapshots } from "./repeat-sends";
import { shortRepeats, usdtAsk, usdtAskVariants, usdtControls } from "./fixtures/usdt-repeat";
import type { AuditSnapshot } from "./audit-report";

test("case, whitespace, punctuation, emoji, invisible characters and lookalikes do not make a new text", () => {
  const key = repeatKey("user:1", usdtAsk)!;
  for (const variant of usdtAskVariants) expect(repeatKey("user:1", variant)).toBe(key);
  expect(repeatText("ＡＢＣ" + " x".repeat(20))).toBe("abc" + " x".repeat(20));
  expect(repeatText("зӑйти " + "к нам ".repeat(6))).toBe(repeatText("зайти " + "к нам ".repeat(6)));
  // Another account, or other words, is another key.
  expect(repeatKey("user:2", usdtAsk)).not.toBe(key);
  expect(repeatKey("chat:1", usdtAsk)).not.toBe(key);
  expect(repeatKey("user:1", usdtAsk.replace("продать", "купить"))).not.toBe(key);
  expect(new Set(usdtControls.map((text) => repeatKey("user:1", text))).has(key)).toBe(false);
});

test("short texts never count as repeats", () => {
  for (const text of shortRepeats) expect(repeatKey("user:1", text)).toBeUndefined();
  expect(repeatText("x ".repeat(14) + "x")).toBeUndefined();
  expect(repeatText("x".repeat(30))).toBe("x".repeat(30));
  // Punctuation and emoji are not length.
  expect(repeatText("спасибо!!!!!!!!!!!!!!!!!!!!!!!!!!!!! 👍👍👍👍")).toBeUndefined();
});

test("each other copy halves the distance to 1; scores under the floor never move", () => {
  expect(escalatedScore(0.6407, 0)).toBe(0.6407);
  expect(escalatedScore(0.6407, 1)).toBeCloseTo(0.8204, 4);
  expect(escalatedScore(0.6, 1)).toBeCloseTo(0.8, 6);
  expect(escalatedScore(0.55, 1)).toBeCloseTo(0.775, 6);
  expect(escalatedScore(0.55, 2)).toBeCloseTo(0.8875, 6);
  expect(escalatedScore(0.5, 2)).toBeCloseTo(0.875, 6);
  for (const copies of [1, 5, 100]) expect(escalatedScore(0.4999, copies)).toBe(0.4999);
  expect(escalatedScore(Number.NaN, 3)).toBeNaN();
  expect(escalatedScore(0.5, 1_000)).toBeLessThan(1);
});

test("the store returns the account's other copies in the window, across chats, newest first", async () => {
  const store = new MemoryRepeatStore();
  const hour = 60 * 60_000;
  expect(await store.record("k", { chatId: 1, messageId: 10, sentAt: 0 })).toEqual([]);
  expect(await store.record("other", { chatId: 1, messageId: 11, sentAt: hour })).toEqual([]);
  expect(await store.record("k", { chatId: 2, messageId: 5, sentAt: 3 * hour })).toEqual([{ chatId: 1, messageId: 10, sentAt: 0, handled: false }]);
  await store.markHandled(1, 10);
  expect(await store.record("k", { chatId: 1, messageId: 12, sentAt: 4 * hour })).toEqual([
    { chatId: 2, messageId: 5, sentAt: 3 * hour, handled: false }, { chatId: 1, messageId: 10, sentAt: 0, handled: true }]);
  // Out of the window of the current copy.
  expect((await store.record("k", { chatId: 3, messageId: 1, sentAt: REPEAT_WINDOW_MS + 3 * hour + 1 })).map((c) => c.messageId)).toEqual([12]);
});

test("edits keep the send time and handled state; forgetting removes a copy", async () => {
  const store = new MemoryRepeatStore();
  await store.record("k", { chatId: 1, messageId: 1, sentAt: 0 });
  await store.markHandled(1, 1);
  await store.record("k", { chatId: 1, messageId: 1, sentAt: 9_999 });
  expect(await store.record("k", { chatId: 1, messageId: 2, sentAt: 10 })).toEqual([{ chatId: 1, messageId: 1, sentAt: 0, handled: true }]);
  await store.forget(1, 1);
  expect(await store.record("k", { chatId: 1, messageId: 3, sentAt: 20 })).toEqual([{ chatId: 1, messageId: 2, sentAt: 10, handled: false }]);
  // An edit to another text moves the copy to that text.
  await store.record("j", { chatId: 1, messageId: 2, sentAt: 10 });
  expect(await store.record("k", { chatId: 1, messageId: 4, sentAt: 30 })).toEqual([{ chatId: 1, messageId: 3, sentAt: 20, handled: false }]);
});

test("memory is bounded by capacity and expiry; lookups by a copy cap", async () => {
  let now = 0;
  const store = new MemoryRepeatStore(3, () => now);
  for (let id = 1; id <= 5; id += 1) await store.record("k", { chatId: 1, messageId: id, sentAt: 0 });
  expect((await store.record("k", { chatId: 1, messageId: 6, sentAt: 0 })).map((c) => c.messageId).sort()).toEqual([4, 5]);
  now = 2 * REPEAT_WINDOW_MS;
  expect(await store.record("k", { chatId: 1, messageId: 7, sentAt: now })).toEqual([]);
  const many = new MemoryRepeatStore();
  for (let id = 1; id <= 30; id += 1) await many.record("k", { chatId: 1, messageId: id, sentAt: id });
  expect(await many.record("k", { chatId: 1, messageId: 31, sentAt: 31 })).toHaveLength(20);
});

test("earlier copies keep their own audit evidence, or reuse the current content after a restart", () => {
  const snapshots = new RepeatSnapshots(2);
  const snap = (chatId: number, messageId: number, body = "own body") => ({ chatId, messageId, chatTitle: "t", actor: "user:1",
    actorName: "n", edited: false, body, media: "none", context: "{}", links: "{}", profile: "{}" }) satisfies AuditSnapshot;
  snapshots.set(snap(1, 1, "earlier body"));
  const current = snap(2, 9, "current body");
  expect(snapshots.get({ chatId: 1, messageId: 1, sentAt: 0, handled: false }, current).body).toBe("earlier body");
  const restored = snapshots.get({ chatId: 3, messageId: 4, sentAt: 0, handled: false }, current);
  expect(restored).toMatchObject({ chatId: 3, messageId: 4, body: "current body", chatTitle: "unavailable", actor: "user:1" });
  expect(JSON.parse(restored.context).repeatOf).toEqual({ chatId: 2, messageId: 9 });
  snapshots.set(snap(1, 2)); snapshots.set(snap(1, 3));
  expect(snapshots.get({ chatId: 1, messageId: 1, sentAt: 0, handled: false }, current).body).toBe("current body");
});
