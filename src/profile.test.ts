import { expect, test } from "bun:test";
import type { ChatFullInfo } from "grammy/types";
import { SenderProfileCache } from "./profile";

const privateChat = (id: number, personalChannelId?: number): ChatFullInfo => ({
  id,
  type: "private",
  first_name: "private",
  accent_color_id: 0,
  max_reaction_count: 1,
  accepted_gift_types: {
    unlimited_gifts: false,
    limited_gifts: false,
    unique_gifts: false,
    premium_subscription: false,
    gifts_from_channels: false,
  },
  bio: "  adult bio  ",
  personal_chat: personalChannelId
    ? { id: personalChannelId, type: "channel", title: "preview title" }
    : undefined,
});

const channelChat = (id: number): ChatFullInfo => ({
  id,
  type: "channel",
  title: "  Full Heat  ",
  username: "adult_channel",
  description: "  Private videos  ",
  accent_color_id: 0,
  max_reaction_count: 1,
  accepted_gift_types: {
    unlimited_gifts: false,
    limited_gifts: false,
    unique_gifts: false,
    premium_subscription: false,
    gifts_from_channels: false,
  },
});

test("title-only metadata does not borrow photo identifiers or pinned post text", async () => {
  const cache = new SenderProfileCache();
  const user = { ...privateChat(7, -1007), bio: undefined,
    photo: { small_file_id: "avatar-text-is-not-a-file-id", small_file_unique_id: "small", big_file_id: "big", big_file_unique_id: "unique" } };
  const channel = { ...channelChat(-1007), title: "Private Secret", description: undefined,
    pinned_message: { message_id: 88, date: 1, chat: { id: -1007, type: "channel", title: "Private Secret" }, text: "Synthetic pinned promotion; not the personal-channel post preview" } } as ChatFullInfo;
  const outcomes: string[] = [];
  const calls: number[] = [];
  const lookup = async (id: number) => { calls.push(id); return id === 7 ? user : channel; };
  expect(await cache.get(7, lookup, Date.now(), (source, outcome) => outcomes.push(source + ":" + outcome)))
    .toEqual({ personalChannel: { title: "Private Secret" } });
  expect(outcomes).toEqual(["user:present", "channel:present"]);
  expect(calls).toEqual([7, -1007]);
});

test("loads and caches private bio plus personal-channel text", async () => {
  const calls: number[] = [];
  const cache = new SenderProfileCache();
  const getChat = async (id: number) => {
    calls.push(id);
    return id === 7 ? privateChat(7, -1007) : channelChat(-1007);
  };

  await expect(cache.get(7, getChat)).resolves.toEqual({
    bio: "adult bio",
    personalChannel: {
      title: "Full Heat",
      description: "Private videos",
    },
  });
  await cache.get(7, getChat);
  expect(calls).toEqual([7, -1007]);
});

test("briefly caches failures and retries after the negative-cache TTL", async () => {
  const cache = new SenderProfileCache(600_000, 1, 1_500, 10);
  let fail = true;
  const calls: number[] = [];
  const getChat = async (id: number) => {
    calls.push(id);
    if (fail) throw new Error("private API detail");
    return privateChat(id);
  };

  await expect(cache.get(1, getChat)).rejects.toThrow();
  fail = false;
  await expect(cache.get(1, getChat)).resolves.toBeUndefined();
  expect(calls).toEqual([1]);
  await Bun.sleep(15);
  await cache.get(1, getChat);
  expect(calls).toEqual([1, 1]);
});

test("channel access failure preserves successful bio and privacy-safe outcomes", async () => {
  const cache = new SenderProfileCache();
  const outcomes: string[] = [];
  const lookup = async (id: number) => {
    if (id === 7) return privateChat(7, -1007);
    throw new Error("private channel title and id must not reach telemetry");
  };
  await expect(cache.get(7, lookup, Date.now(), (source, outcome) => outcomes.push(source + ":" + outcome)))
    .resolves.toEqual({ bio: "adult bio" });
  expect(outcomes).toEqual(["user:present", "channel:unavailable"]);
  await cache.get(7, lookup, Date.now(), (source, outcome) => outcomes.push(source + ":" + outcome));
  expect(outcomes.at(-1)).toBe("cache:cached_unavailable");
});

test("removes expired profile text without requiring another access", async () => {
  const cache = new SenderProfileCache(10, 1);
  const getChat = async (id: number) => privateChat(id);
  await cache.get(1, getChat);
  expect(cache["entries"].size).toBe(1);
  await Bun.sleep(15);
  expect(cache["entries"].size).toBe(0);
});

test("bounds pending lookups as well as settled entries", async () => {
  const cache = new SenderProfileCache(600_000, 2);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const calls: number[] = [];
  const getChat = async (id: number) => {
    calls.push(id);
    await gate;
    return privateChat(id);
  };

  const first = cache.get(1, getChat);
  const second = cache.get(2, getChat);
  await expect(cache.get(3, getChat)).resolves.toBeUndefined();
  expect(calls).toEqual([1, 2]);
  expect(cache["inFlight"].size).toBe(2);
  release();
  await Promise.all([first, second]);
  expect(cache["entries"].size).toBe(2);
  expect(cache["inFlight"].size).toBe(0);
});

for (const mode of ["reject", "timeout", "invalid"] as const) {
  for (const withBio of [false, true]) {
    test(`partial channel ${mode} preserves bio=${withBio} and retries at failure TTL`, async () => {
      const cache = new SenderProfileCache(600_000, 10, 5, 60_000);
      const outcomes: string[] = [];
      const report = (source: string, outcome: string) => { outcomes.push(source + ":" + outcome); };
      let fail = true;
      let calls = 0;
      const lookup = async (id: number, signal: AbortSignal): Promise<ChatFullInfo> => {
        calls++;
        if (id === 7) return { ...privateChat(7, -1007), bio: withBio ? "  adult bio  " : undefined } as ChatFullInfo;
        if (!fail) return channelChat(id);
        if (mode === "invalid") return channelChat(-999);
        if (mode === "timeout") await new Promise<void>((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(new Error("timeout")), { once: true });
        });
        throw new Error("private channel failure");
      };
      expect(await cache.get(7, lookup, Date.now(), report)).toEqual(withBio ? { bio: "adult bio" } : undefined);
      expect(outcomes.at(-1)).toBe(mode === "invalid" ? "channel:invalid" : "channel:unavailable");
      fail = false;
      expect(await cache.get(7, lookup, Date.now(), report)).toEqual(withBio ? { bio: "adult bio" } : undefined);
      expect(outcomes.at(-1)).toBe("cache:cached_unavailable");
      expect(calls).toBe(2);
      const result = await cache.get(7, lookup, Date.now() + 61_000, report);
      expect(calls).toBe(4);
      expect(result?.personalChannel?.title).toBe("Full Heat");
      expect(result?.bio).toBe(withBio ? "adult bio" : undefined);
    });
  }
}
