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
      username: "adult_channel",
      description: "Private videos",
    },
  });
  await cache.get(7, getChat);
  expect(calls).toEqual([7, -1007]);
});

test("does not cache failures and keeps the cache bounded", async () => {
  const cache = new SenderProfileCache(600_000, 1);
  let fail = true;
  const calls: number[] = [];
  const getChat = async (id: number) => {
    calls.push(id);
    if (fail) throw new Error("private API detail");
    return privateChat(id);
  };

  await expect(cache.get(1, getChat)).rejects.toThrow();
  fail = false;
  await cache.get(1, getChat);
  await cache.get(2, getChat);
  await cache.get(1, getChat);
  expect(calls).toEqual([1, 1, 2, 1]);
});
