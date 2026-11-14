import { type Bot, BotError, type Context } from "grammy";
import type { Update } from "grammy/types";
import { guestBotCaller } from "./guest-bot";

/**
 * Handles updates concurrently (#613) while keeping each actor's updates in order. One update at a
 * time left Jev ~15 min behind live chat at peak: each classification takes ~2-3 s on the shared CPU.
 *
 * An update starts once every earlier update sharing one of its keys (see `updateKeys`) has finished,
 * and at most `limit` updates run at once. Register before any product handler: the middleware
 * returns at once, so `bot.start()` asks for the next batch while this one is still being handled.
 * `settle` waits for every update handed in so far; the handover poller awaits it before each
 * getUpdates, so Telegram still confirms a batch only after it has been handled. Shutdown drains with
 * the same wait. Errors go to `bot.catch`, as with sequential handling.
 */
export function handleConcurrently(bot: Bot<any>, { limit = 4, keys = updateKeys }: { limit?: number; keys?: (update: Update) => string[] } = {}) {
  if (!Number.isInteger(limit) || limit < 1) throw new Error("limit must be a positive integer");
  const tails = new Map<string, Promise<void>>();
  const active = new Set<Promise<void>>();
  const queue: (() => void)[] = [];
  let running = 0;
  const acquire = () => running < limit ? (running++, Promise.resolve()) : new Promise<void>(resolve => queue.push(resolve));
  // A freed slot passes straight to the next waiter, so `running` stays at the limit while any wait.
  const release = () => { const next = queue.shift(); if (next) next(); else running--; };
  bot.use((ctx: Context, next) => {
    const own = keys(ctx.update);
    const before = own.flatMap(key => tails.get(key) ?? []);
    const work = (async () => {
      await Promise.all(before);
      await acquire();
      try { await next(); }
      catch (error) {
        try { await bot.errorHandler(new BotError(error, ctx)); }
        catch (handlerError) { console.error("Update error handler failed:", handlerError); }
      }
      finally { release(); }
    })();
    for (const key of own) tails.set(key, work);
    active.add(work);
    void work.finally(() => {
      active.delete(work);
      for (const key of own) if (tails.get(key) === work) tails.delete(key);
    });
    // Returns before the update is handled.
  });
  const settle = async () => { while (active.size) await Promise.all([...active]); };
  return { settle, get size() { return active.size; } };
}

/**
 * The order an update must keep. Per actor, not per chat: history, campaigns and repeat sends are all
 * keyed by the sender (`user:<id>`, or `chat:<id>` for a channel or anonymous admin), and an edit has
 * the same sender as its original. A chat_member update shares the key of the member it changes, so
 * an admin promotion or demotion lands before that member's next message. Anything else is ordered
 * per chat.
 */
export function updateKeys(update: Update): string[] {
  const message = update.message ?? update.edited_message;
  if (message) {
    if (message.sender_chat) return [`chat:${message.sender_chat.id}`];
    if (message.from) {
      const caller = message.from.is_bot ? guestBotCaller(message) : undefined;
      if (!caller) return [`user:${message.from.id}`];
      // #668: a Guest Mode reply waits for the member (or chat) that called it and for the member it answers: Jev has decided
      // about the summon by then, and a summon that arrives later waits for the reply instead.
      // A forum topic's messages "reply" to its creation message: no reply to anyone.
      const replied = message.reply_to_message && !message.reply_to_message.forum_topic_created ? message.reply_to_message : undefined;
      const target = replied?.sender_chat ? `chat:${replied.sender_chat.id}` : replied?.from ? `user:${replied.from.id}` : undefined;
      return [...new Set([`user:${message.from.id}`, caller, ...target ? [target] : []])];
    }
    return [`in:${message.chat.id}`];
  }
  if (update.chat_member) return [`user:${update.chat_member.new_chat_member.user.id}`];
  const chat = update.my_chat_member?.chat;
  if (!chat) return [`update:${update.update_id}`];
  // Its handler records promo use and blocks for the user who changed Jev, after that user's /start.
  const from = update.my_chat_member?.from;
  return from ? [`in:${chat.id}`, `user:${from.id}`] : [`in:${chat.id}`];
}

export async function drainBot(bot: Pick<Bot, "stop" | "isRunning">, polling: Promise<void>, drain: () => Promise<void>) {
  if (bot.isRunning()) await bot.stop();
  // The raw start promise has no finally that awaits shutdown: no promise cycle.
  await polling.catch(() => undefined);
  await drain();
}
