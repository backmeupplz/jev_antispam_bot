import { expect, test } from "bun:test";
import { Bot } from "grammy";
import { startWithHandover } from "./handover";

// A fake Bot API: long polls return `batch` once, then hang until aborted
async function stopAfter(batch: number[]) {
  const calls: Record<string, unknown>[] = [];
  const server = Bun.serve({
    port: 0,
    async fetch(req) {
      const method = new URL(req.url).pathname.split("/").pop();
      const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
      if (method === "getMe") {
        return Response.json({ ok: true, result: { id: 1, is_bot: true, first_name: "b", username: "b" } });
      }
      if (method !== "getUpdates") return Response.json({ ok: true, result: true });
      calls.push(body);
      if (body.timeout && calls.length > 1) await Bun.sleep(60000);
      const message = { message_id: 1, date: 0, chat: { id: 1, type: "private" }, text: "x" };
      const updates = calls.length > 1 ? [] : batch.map(update_id => ({ update_id, message }));
      return Response.json({ ok: true, result: updates });
    },
  });
  const bot = new Bot("1:x", { client: { apiRoot: `http://localhost:${server.port}` } });
  const handled: number[] = [];
  bot.on("message", async ctx => {
    await Bun.sleep(100);
    handled.push(ctx.update.update_id);
  });
  let closed = false;
  const exit = process.exit;
  const exited = new Promise(resolve => ((process as any).exit = resolve));
  const polling = startWithHandover(bot, {}, () => (closed = true));
  await Bun.sleep(150);
  const t = Date.now();
  process.emit("SIGTERM");
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
  expect(ms).toBeLessThan(1000);
});
