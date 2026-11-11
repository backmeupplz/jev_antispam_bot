import { expect, test } from "bun:test";
import type { Message } from "grammy/types";
import { cacheEligible, cacheFingerprint, PostgresSpamCache, SPAM_CACHE_POOL_MAX } from "./spam-cache";
import { toModerationMessage } from "./message";
const raw = (patch: Record<string, unknown> = {}) => JSON.parse(JSON.stringify({ message_id: 1, date: 1,
  chat: { id: -100, type: "supergroup", title: "fixture" }, from: { id: 1, is_bot: false, first_name: "test" },
  text: "Synthetic widget advertising", ...patch })) as Message;
const key = (message: Message, profile?: { bio: string }) => cacheFingerprint(message, "user:1", { ...toModerationMessage(message)!, ...(profile ? { senderProfile: profile } : {}) }, 0, "test-model", .81, true);

test("eligibility is strictly >10 graphemes, not UTF-16; excludes emoji and custom-emoji-only", () => {
  for (const text of ["a".repeat(10), "e\u0301".repeat(10), "😀".repeat(20), "1️⃣".repeat(11), "🇨🇦".repeat(11), "👨‍👩‍👧‍👦".repeat(11)]) expect(cacheEligible(raw({ text }))).toBe(false);
  for (const text of ["a".repeat(11), "e\u0301".repeat(11), "界".repeat(11)]) expect(cacheEligible(raw({ text }))).toBe(true);
  expect(cacheEligible(raw({ text: "abcdefghijk", entities: [{ type: "custom_emoji", offset: 0, length: 11, custom_emoji_id: "1" }] }))).toBe(false);
  expect(cacheEligible(raw({ text: undefined, sticker: {} }))).toBe(false);
  expect(cacheEligible(raw({ text: undefined, photo: [] }))).toBe(false);
  expect(cacheEligible(raw({ text: undefined, caption: "abcdefghijk", photo: [] }))).toBe(true);
});

test("fingerprint preserves whitespace, body kind, entities, buttons, attribution and actor", () => {
  const first = raw(); const original = key(first);
  expect(original).toMatch(/^[a-f0-9]{64}$/);
  expect(key(raw({ message_id: 9, date: 9, edit_date: 9 }))).toBe(original);
  for (const patch of [
    { text: " Synthetic widget advertising" }, { text: undefined, caption: "Synthetic widget advertising" },
    { entities: [{ type: "text_link", offset: 0, length: 9, url: "https://example.com/hidden" }] },
    { entities: [{ type: "custom_emoji", offset: 0, length: 1, custom_emoji_id: "new" }] },
    { reply_markup: { inline_keyboard: [[{ text: "buy", url: "https://example.com/" }]] } },
    { forward_origin: { type: "hidden_user", sender_user_name: "source", date: 1 } },
    { quote: { text: "warning", position: 0, is_manual: true } },
    { reply_to_message: raw({ text: "Please send relevant offers", message_id: 55 }) },
    { chat: { id: -101, type: "supergroup", title: "fixture" } },
    { from: { id: 2, is_bot: false, first_name: "test" } },
  ]) expect(key(raw(patch))).not.toBe(original);
  expect(key(first, { bio: "new bio" })).not.toBe(original);
  expect(cacheFingerprint(first, "user:2", toModerationMessage(first)!, 0, "test-model", .81, true)).not.toBe(original);
  for (const [history, complete] of [[1, true], [0, false]] as const)
    expect(cacheFingerprint(first, "user:1", toModerationMessage(first)!, history, "test-model", .81, complete)).toBeUndefined();
  expect(cacheFingerprint(first, "user:1", toModerationMessage(first)!, 0, "changed", .81, true)).not.toBe(original);
  expect(cacheFingerprint(first, "user:1", toModerationMessage(first)!, 0, "test-model", .9, true)).not.toBe(original);
});

test("#616: lookups up to the pool size run at once; only one past it is skipped", async () => {
  const logs: string[] = [];
  const cache = new PostgresSpamCache("postgres://127.0.0.1:1/none", { timeoutMs: 1_000, logger: { info: (line: string) => logs.push(line) } });
  const internals = cache as unknown as { migration: Promise<void>; pool: { query: () => Promise<{ rowCount: number }> } };
  internals.migration = Promise.resolve();
  const releases: Array<() => void> = [];
  internals.pool.query = () => new Promise(resolve => releases.push(() => resolve({ rowCount: 1 })));
  const lookups = Array.from({ length: SPAM_CACHE_POOL_MAX }, (_, i) => cache.lookup(String(i)));
  expect(await cache.lookup("over")).toBe(false);
  expect(cache.health()).toMatchObject({ hit: 0, error: 1 });
  await Bun.sleep(0);
  expect(releases).toHaveLength(SPAM_CACHE_POOL_MAX);
  releases.forEach(release => release());
  expect(await Promise.all(lookups)).toEqual(Array(SPAM_CACHE_POOL_MAX).fill(true));
  expect(cache.health()).toMatchObject({ hit: SPAM_CACHE_POOL_MAX, miss: 0, error: 1 });
  expect(SPAM_CACHE_POOL_MAX).toBeGreaterThan(2);
  await cache.close();
});
