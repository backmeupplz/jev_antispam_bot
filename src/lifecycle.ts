import type { Bot } from "grammy";
// Register before any product handler; stop() cancels polling but does not drain handlers.
export function trackHandlers(bot: Bot) {
  const active = new Set<Promise<void>>();
  bot.use(async (_ctx, next) => {
    const work = Promise.resolve().then(next); active.add(work);
    try { await work; } finally { active.delete(work); }
  });
  return async () => { while (active.size) await Promise.allSettled([...active]); };
}
export async function drainBot(bot: Pick<Bot, "stop" | "isRunning">, polling: Promise<void>, drain: () => Promise<void>) {
  if (bot.isRunning()) await bot.stop();
  // The raw start promise has no finally that awaits shutdown: no promise cycle.
  await polling.catch(() => undefined);
  await drain();
}
