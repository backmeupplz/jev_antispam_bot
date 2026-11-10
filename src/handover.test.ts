import { expect, test } from "bun:test";
import { Bot } from "grammy";
import { startWithHandover } from "./handover";
import { handleConcurrently } from "./lifecycle";

// A fake Bot API: long polls return `batch` once, then hang until aborted
async function stopAfter(batch: number[], concurrent = false) {
  const calls: Record<string, unknown>[] = [];
  const handled: number[] = [];
  const server = Bun.serve({
    port: 0,
    async fetch(req) {
      const method = new URL(req.url).pathname.split("/").pop();
      const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
      if (method === "getMe") {
        return Response.json({ ok: true, result: { id: 1, is_bot: true, first_name: "b", username: "b" } });
      }
      if (method !== "getUpdates") return Response.json({ ok: true, result: true });
      calls.push({ ...body, handledBefore: [...handled] });
      if (body.timeout && calls.length > 1) { idle(); await Bun.sleep(60000); }
      const message = { message_id: 1, date: 0, chat: { id: 1, type: "private" }, text: "x" };
      const updates = calls.length > 1 ? [] : batch.map(update_id => ({ update_id, message }));
      return Response.json({ ok: true, result: updates });
    },
  });
  const bot = new Bot("1:x", { client: { apiRoot: `http://localhost:${server.port}` } });
  const updates = concurrent ? handleConcurrently(bot) : undefined;
  // SIGTERM comes once the bot is busy: handling the batch's first update (held until then), or long polling
  let busy!: () => void;
  const started = new Promise<void>(resolve => (busy = resolve));
  const idle = busy;
  let release!: () => void;
  const released = new Promise<void>(resolve => (release = resolve));
  bot.on("message", async ctx => {
    busy();
    await released;
    handled.push(ctx.update.update_id);
  });
  let closed = false;
  const exit = process.exit;
  const exited = new Promise(resolve => ((process as any).exit = resolve));
  const polling = startWithHandover(bot, {}, async () => { await updates?.settle(); closed = true; }, updates?.settle);
  await started;
  const t = Date.now();
  process.emit("SIGTERM");
  release();
  await exited;
  await polling;
  process.exit = exit;
  server.stop(true);
  return { calls, handled, closed, ms: Date.now() - t };
}

test("stopping mid-batch confirms the whole batch and finishes handling it", async () => {
  const { calls, handled, closed } = await stopAfter([10, 11, 12]);
  expect(calls.at(-1)).toMatchObject({ offset: 13, timeout: 0 });
  expect(handled).toEqual([10, 11, 12]);
  expect(closed).toBe(true);
});

test("stopping while idle sends no confirming getUpdates", async () => {
  const { calls, ms } = await stopAfter([]);
  expect(calls.length).toBe(2);
  // Not the 10 s a stop stuck behind the long poll would take
  expect(ms).toBeLessThan(5000);
});

test("concurrent handling: stopping mid-batch still confirms the whole batch and finishes handling it", async () => {
  const { calls, handled, closed } = await stopAfter([10, 11, 12], true);
  expect(calls.at(-1)).toMatchObject({ offset: 13, timeout: 0 });
  expect(handled).toEqual([10, 11, 12]);
  expect(closed).toBe(true);
});

test("concurrent handling: the next poll, which confirms a batch, waits until the batch is handled", async () => {
  const calls: { offset?: number; handledBefore: number[] }[] = [];
  const handled: number[] = [];
  let polled!: () => void;
  const secondPoll = new Promise<void>(resolve => (polled = resolve));
  const server = Bun.serve({
    port: 0,
    async fetch(req) {
      const method = new URL(req.url).pathname.split("/").pop();
      const body = (await req.json().catch(() => ({}))) as { offset?: number };
      if (method === "getMe") return Response.json({ ok: true, result: { id: 1, is_bot: true, first_name: "b", username: "b" } });
      if (method !== "getUpdates") return Response.json({ ok: true, result: true });
      calls.push({ offset: body.offset, handledBefore: [...handled] });
      if (calls.length === 2) polled();
      if (calls.length > 1) return Response.json({ ok: true, result: [] });
      // Three senders: handled at once, finishing in reverse order
      return Response.json({ ok: true, result: [1, 2, 3].map(n => ({ update_id: 20 + n,
        message: { message_id: n, date: 0, chat: { id: n, type: "private" }, from: { id: n, is_bot: false, first_name: "f" }, text: "x" } })) });
    },
  });
  const bot = new Bot("1:x", { client: { apiRoot: `http://localhost:${server.port}` } });
  const updates = handleConcurrently(bot);
  bot.on("message", async ctx => { await Bun.sleep(80 - ctx.msg.message_id * 20); handled.push(ctx.update.update_id); });
  const exit = process.exit;
  const exited = new Promise(resolve => ((process as any).exit = resolve));
  const polling = startWithHandover(bot, {}, () => updates.settle(), updates.settle);
  await secondPoll;
  process.emit("SIGTERM");
  await exited;
  await polling;
  process.exit = exit;
  server.stop(true);
  expect(calls[1]).toEqual({ offset: 24, handledBefore: [23, 22, 21] });
});

