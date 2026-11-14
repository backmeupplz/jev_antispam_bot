import type { Message } from "grammy/types";
import type { AuditSnapshot } from "./audit-report";

// #668: Bot API 10.0 Guest Mode. A member (often a hijacked account) mentions a bot that is not in the group, and the bot
// answers that message in the group as itself, "for <member>": "‼️ Чат переносится в новую группу. Нажмите на этот текст…".
// Telegram marks such a message with the member (or chat) whose message called the bot.

/** The actor whose message called a guest bot (`user:<id>` or `chat:<id>`, the same keys as the sender history). */
export function guestBotCaller(message: Message): string | undefined {
  if (message.guest_bot_caller_chat) return `chat:${message.guest_bot_caller_chat.id}`;
  if (message.guest_bot_caller_user) return `user:${message.guest_bot_caller_user.id}`;
}

export type GuestReplyLink = "reply_to_deleted" | "caller_deleted";

// `sender` is the bot itself (its history key), so a reply taken for deletion leaves its history too.
type Kept = { messageId: number; sender: string; replyTo?: number; caller?: string; at: number; snapshot?: AuditSnapshot };
type Taken = { messageId: number; sender: string; link: GuestReplyLink; snapshot?: AuditSnapshot };

/**
 * Per chat, what Jev decided to delete in the last ten minutes (message ids and their actors), and the guest-bot replies it kept
 * that pointed at a message or caller it had not deleted (yet). A guest-bot reply to a deleted message, or one called by an actor
 * whose message was deleted, goes too, whichever of the two Jev handles first. Bounded like the sender history: a TTL, a cap per
 * chat (oldest out first) and a cap on chats.
 */
export class GuestReplyLinks {
  private readonly deletedMessages = new Map<number, Map<number, number>>();
  private readonly deletedActors = new Map<number, Map<string, number>>();
  private readonly kept = new Map<number, Map<number, Kept>>();

  constructor(
    private readonly ttlMs = 10 * 60_000,
    private readonly maxPerChat = 200,
    private readonly maxChats = 5_000,
    // Kept replies hold their audit snapshot, so fewer of them.
    private readonly maxKeptPerChat = 50,
  ) {
    setInterval(() => this.prune(Date.now()), Math.min(ttlMs, 60_000)).unref();
  }

  /** Jev decided to delete these messages of `actor` in a chat (whether or not Telegram let it). */
  deleted(chatId: number, actor: string, messageIds: number[], now = Date.now()): void {
    const messages = this.chat(this.deletedMessages, chatId);
    for (const id of messageIds) put(messages, id, now, this.maxPerChat);
    put(this.chat(this.deletedActors, chatId), actor, now, this.maxPerChat);
    // A kept reply deleted on its own (e.g. as the bot's repeat) is no longer waiting.
    const kept = this.kept.get(chatId);
    if (kept) for (const id of messageIds) kept.delete(id);
  }

  /** Why a bot reply goes with a deleted message: it replies to one, or its guest-bot caller just had one deleted. */
  linked(chatId: number, replyTo: number | undefined, caller: string | undefined, now = Date.now()): GuestReplyLink | undefined {
    const fresh = (at: number | undefined) => at !== undefined && now - at < this.ttlMs;
    if (replyTo !== undefined && fresh(this.deletedMessages.get(chatId)?.get(replyTo))) return "reply_to_deleted";
    if (caller !== undefined && fresh(this.deletedActors.get(chatId)?.get(caller))) return "caller_deleted";
  }

  /** A bot reply kept for now: it goes if its target or caller is deleted later in the window. */
  keep(chatId: number, reply: Omit<Kept, "at">, now = Date.now()): void {
    if (reply.replyTo === undefined && reply.caller === undefined) return;
    put(this.chat(this.kept, chatId), reply.messageId, { ...reply, at: now }, this.maxKeptPerChat);
  }

  /** A kept reply was moderated again (an edit) or deleted on its own: it is no longer waiting. */
  forget(chatId: number, messageId: number): void {
    this.kept.get(chatId)?.delete(messageId);
  }

  /** Kept bot replies to these deleted messages, or called by this actor: returned once, then forgotten. */
  take(chatId: number, actor: string, messageIds: number[], now = Date.now()): Taken[] {
    const kept = this.kept.get(chatId);
    if (!kept) return [];
    const ids = new Set(messageIds);
    const taken: Taken[] = [];
    for (const [id, reply] of kept) {
      if (now - reply.at >= this.ttlMs) { kept.delete(id); continue; }
      if (ids.has(id)) { kept.delete(id); continue; }
      const link = reply.replyTo !== undefined && ids.has(reply.replyTo) ? "reply_to_deleted"
        : reply.caller === actor ? "caller_deleted" : undefined;
      if (!link) continue;
      kept.delete(id);
      taken.push({ messageId: id, sender: reply.sender, link, ...(reply.snapshot ? { snapshot: reply.snapshot } : {}) });
    }
    if (!kept.size) this.kept.delete(chatId);
    return taken;
  }

  /** Entry counts, for tests of the bounds. */
  get size(): { chats: number; deletedMessages: number; deletedActors: number; kept: number } {
    const count = (maps: Map<number, Map<unknown, unknown>>) => [...maps.values()].reduce((n, m) => n + m.size, 0);
    const chats = new Set([...this.deletedMessages.keys(), ...this.deletedActors.keys(), ...this.kept.keys()]);
    return { chats: chats.size, deletedMessages: count(this.deletedMessages), deletedActors: count(this.deletedActors), kept: count(this.kept) };
  }

  private chat<K, V>(maps: Map<number, Map<K, V>>, chatId: number): Map<K, V> {
    let map = maps.get(chatId);
    if (map) {
      // Most recently used chat last, so the oldest chat goes first when there are too many.
      maps.delete(chatId);
    } else {
      map = new Map();
      while (maps.size >= this.maxChats) maps.delete(maps.keys().next().value!);
    }
    maps.set(chatId, map);
    return map;
  }

  private prune(now: number): void {
    const expired = (value: number | Kept) => now - (typeof value === "number" ? value : value.at) >= this.ttlMs;
    for (const maps of [this.deletedMessages, this.deletedActors, this.kept] as Map<number, Map<unknown, number | Kept>>[]) {
      for (const [chatId, map] of maps) {
        for (const [key, value] of map) if (expired(value)) map.delete(key);
        if (!map.size) maps.delete(chatId);
      }
    }
  }
}

function put<K, V>(map: Map<K, V>, key: K, value: V, max: number): void {
  map.delete(key);
  map.set(key, value);
  while (map.size > max) map.delete(map.keys().next().value!);
}
