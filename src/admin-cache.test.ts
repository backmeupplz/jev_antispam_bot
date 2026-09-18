import { expect, test } from "bun:test";
import type { Api } from "grammy";
import { AdminCache } from "./admin-cache";

test("caches admin status and can invalidate membership changes", async () => {
  let calls = 0;
  const api = {
    getChatMember: async () => {
      calls += 1;
      return { status: "administrator" };
    },
  } as unknown as Api;
  const cache = new AdminCache();

  expect(await cache.isAdmin(api, -100, 42)).toBe(true);
  expect(await cache.isAdmin(api, -100, 42)).toBe(true);
  expect(calls).toBe(1);

  cache.invalidate(-100, 42);
  expect(await cache.isAdmin(api, -100, 42)).toBe(true);
  expect(calls).toBe(2);
});
