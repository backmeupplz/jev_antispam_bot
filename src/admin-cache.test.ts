import { expect, test } from "bun:test";
import { GrammyError, type Api } from "grammy";
import { AdminCache, FloodWaitError, type AdminLookup } from "./admin-cache";

const human = { id: 42, is_bot: false };
const other = { id: 43, is_bot: false };
const helperBot = { id: 77, is_bot: true };
const flood = (retry_after?: number) => new GrammyError("Call failed",
  { ok: false, error_code: 429, description: "Too Many Requests", ...(retry_after === undefined ? {} : { parameters: { retry_after } }) },
  "getChatAdministrators", {});
const refused = new GrammyError("Call failed", { ok: false, error_code: 400, description: "Bad Request: CHAT_ADMIN_REQUIRED" }, "getChatMember", {});

function fixture() {
  let now = 1_000_000;
  const calls: string[] = [];
  const slept: number[] = [];
  const outcomes: (AdminLookup | `${AdminLookup}:${string}`)[] = [];
  const admins = new Map<number, number[]>([[-100, [human.id]], [-200, []]]);
  const listFailures: unknown[] = [];
  const memberFailures: unknown[] = [];
  const memberStatus = new Map<number, string>([[helperBot.id, "administrator"]]);
  const api = {
    getChatAdministrators: async (chatId: number) => {
      calls.push(`list:${chatId}`);
      if (listFailures.length) throw listFailures.shift();
      return (admins.get(chatId) ?? []).map(id => ({ status: "administrator", user: { id } }));
    },
    getChatMember: async (chatId: number, userId: number) => {
      calls.push(`member:${chatId}:${userId}`);
      if (memberFailures.length) throw memberFailures.shift();
      return { status: memberStatus.get(userId) ?? "member" };
    },
  } as unknown as Api;
  const cache = new AdminCache(() => now, async ms => { slept.push(ms); now += ms; });
  return {
    cache, calls, slept, outcomes, admins, listFailures, memberFailures, memberStatus,
    advance: (ms: number) => { now += ms; },
    isAdmin: (chatId: number, sender: { id: number; is_bot: boolean }, wait = true) =>
      cache.isAdmin(api, chatId, sender, (o, reason) => outcomes.push(reason ? `${o}:${reason}` : o), { wait }),
  };
}

test("one administrator list per chat answers every human sender for five minutes", async () => {
  const f = fixture();
  expect(await f.isAdmin(-100, human)).toBe(true);
  expect(await f.isAdmin(-100, other)).toBe(false);
  expect(await f.isAdmin(-100, human)).toBe(true);
  expect(await f.isAdmin(-200, human)).toBe(false);
  expect(f.calls).toEqual(["list:-100", "list:-200"]);
  f.advance(5 * 60_000);
  expect(await f.isAdmin(-100, other)).toBe(false);
  expect(f.calls).toEqual(["list:-100", "list:-200", "list:-100"]);
  expect(f.outcomes).toEqual([]);
});

test("bots missing from the list keep a cached per-user lookup", async () => {
  const f = fixture();
  expect(await f.isAdmin(-100, helperBot)).toBe(true);
  expect(await f.isAdmin(-100, helperBot)).toBe(true);
  f.memberStatus.set(helperBot.id, "member");
  expect(await f.isAdmin(-200, helperBot)).toBe(false);
  expect(f.calls).toEqual(["list:-100", `member:-100:${helperBot.id}`, "list:-200", `member:-200:${helperBot.id}`]);
  // A bot that is in the list needs no second call.
  f.admins.set(-300, [helperBot.id]);
  expect(await f.isAdmin(-300, helperBot)).toBe(true);
  expect(f.calls.at(-1)).toBe("list:-300");
});

test("chat_member updates patch the cached list instead of waiting for expiry", async () => {
  const f = fixture();
  expect(await f.isAdmin(-100, other)).toBe(false);
  f.cache.update(-100, other.id, "administrator");
  expect(await f.isAdmin(-100, other)).toBe(true);
  f.cache.update(-100, human.id, "member");
  expect(await f.isAdmin(-100, human)).toBe(false);
  expect(await f.isAdmin(-100, helperBot)).toBe(true);
  f.cache.update(-100, helperBot.id, "left");
  f.memberStatus.set(helperBot.id, "member");
  expect(await f.isAdmin(-100, helperBot)).toBe(false);
  expect(f.calls).toEqual(["list:-100", `member:-100:${helperBot.id}`, `member:-100:${helperBot.id}`]);
});

test("a short 429 is waited out once, then the lookup is retried", async () => {
  const f = fixture();
  f.listFailures.push(flood(2));
  expect(await f.isAdmin(-100, human)).toBe(true);
  expect(f.slept).toEqual([2_000]);
  expect(f.calls).toEqual(["list:-100", "list:-100"]);
  expect(f.outcomes).toEqual(["retried_after_429"]);
});

test("a long 429 fails without a fallback call and blocks the chat until retry_after", async () => {
  const f = fixture();
  f.listFailures.push(flood(30));
  await expect(f.isAdmin(-100, human)).rejects.toBeInstanceOf(GrammyError);
  expect(f.calls).toEqual(["list:-100"]);
  // Still inside the window: no call at all, a local flood wait instead.
  f.advance(20_000);
  await expect(f.isAdmin(-100, other)).rejects.toBeInstanceOf(FloodWaitError);
  // Other chats are not throttled.
  expect(await f.isAdmin(-200, human)).toBe(false);
  // Within three seconds of the end, the remaining wait is slept off.
  f.advance(8_000);
  expect(await f.isAdmin(-100, human)).toBe(true);
  expect(f.slept).toEqual([2_000]);
  expect(f.calls).toEqual(["list:-100", "list:-200", "list:-100"]);
});

test("a 429 without retry_after still backs off and never retries immediately", async () => {
  const f = fixture();
  f.listFailures.push(flood());
  await expect(f.isAdmin(-100, human)).rejects.toBeInstanceOf(GrammyError);
  f.advance(30_000);
  await expect(f.isAdmin(-100, human)).rejects.toBeInstanceOf(FloodWaitError);
  expect(f.calls).toEqual(["list:-100"]);
});

test("an expired list is reused while Telegram refuses a refresh, for at most 30 minutes", async () => {
  const f = fixture();
  expect(await f.isAdmin(-100, human)).toBe(true);
  f.advance(6 * 60_000);
  f.listFailures.push(flood(60));
  expect(await f.isAdmin(-100, human)).toBe(true);
  // Inside the flood window the stale list answers without a call.
  expect(await f.isAdmin(-100, other)).toBe(false);
  expect(f.calls).toEqual(["list:-100", "list:-100"]);
  expect(f.outcomes).toEqual(["stale_reused:too_many_requests", "stale_reused"]);
  expect(f.slept).toEqual([]);
  // Any other failure also reuses it, logs its reason class and backs off for a minute.
  f.advance(60_000);
  f.listFailures.push(refused);
  expect(await f.isAdmin(-100, human)).toBe(true);
  expect(f.outcomes.at(-1)).toBe("stale_reused:chat_admin_required");
  f.advance(30_000);
  expect(await f.isAdmin(-100, other)).toBe(false);
  expect(f.calls).toEqual(["list:-100", "list:-100", "list:-100"]);
  f.advance(30_000);
  expect(await f.isAdmin(-100, human)).toBe(true);
  expect(f.calls).toHaveLength(4);
  // That refresh succeeded; 35 minutes later (TTL + grace) nothing is reused.
  f.advance(35 * 60_000);
  f.listFailures.push(flood(60));
  await expect(f.isAdmin(-100, human)).rejects.toBeInstanceOf(GrammyError);
});

test("a refused administrator list falls back to the per-user lookup", async () => {
  const f = fixture();
  f.listFailures.push(new GrammyError("Call failed", { ok: false, error_code: 400, description: "Bad Request: chat not found" }, "getChatAdministrators", {}));
  expect(await f.isAdmin(-100, human)).toBe(false);
  expect(f.outcomes).toEqual(["member_fallback:chat_not_found"]);
  // The refusal is remembered for one TTL, so the next sender doesn't retry the list.
  expect(await f.isAdmin(-100, other)).toBe(false);
  expect(f.calls).toEqual(["list:-100", `member:-100:${human.id}`, `member:-100:${other.id}`]);
  f.advance(5 * 60_000);
  expect(await f.isAdmin(-100, other)).toBe(false);
  expect(f.calls.at(-1)).toBe("list:-100");
  // A network failure is not remembered: the next sender tries the list again.
  f.listFailures.push(new Error("network"));
  expect(await f.isAdmin(-300, human)).toBe(false);
  expect(await f.isAdmin(-300, other)).toBe(false);
  expect(f.calls.slice(-3)).toEqual(["list:-300", `member:-300:${human.id}`, "list:-300"]);
  // Both refused: the per-user error surfaces.
  f.listFailures.push(new Error("network"));
  f.memberFailures.push(refused);
  await expect(f.isAdmin(-200, human)).rejects.toBe(refused);
});

test("wait: false never sleeps on a 429, but still reuses a stale answer", async () => {
  const f = fixture();
  f.listFailures.push(flood(1));
  await expect(f.isAdmin(-100, human, false)).rejects.toBeInstanceOf(GrammyError);
  expect(f.slept).toEqual([]);
  expect(await f.isAdmin(-200, human)).toBe(false);
  f.advance(6 * 60_000);
  f.listFailures.push(flood(1));
  expect(await f.isAdmin(-200, human, false)).toBe(false);
  expect(f.outcomes).toEqual(["stale_reused:too_many_requests"]);
  expect(f.slept).toEqual([]);
});
