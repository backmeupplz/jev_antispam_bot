import type { Message } from "grammy/types";
import type { AuditSnapshot } from "./audit-report";

// Nikita #81 option B: an actor posting the same comment under several linked
// channel posts is a campaign even when each copy alone stays under the gate.
// Laya cannot see this (identical prior copies lower its score), so the bot
// keeps its own ledger, independent of the model-kept classifier history.
export const CAMPAIGN_MIN_CHARS = 40;
export const CAMPAIGN_MIN_POSTS = 3;

export function campaignText(text: string): string | undefined {
  const normalized = text.normalize("NFKC").toLowerCase().replace(/\s+/gu, " ").trim();
  return [...normalized].length >= CAMPAIGN_MIN_CHARS ? normalized : undefined;
}

// Only comments under the group's automatic forwards of linked channel posts
// count. Replies to another member's message (e.g. their own request) never do.
export function campaignPost(message: Message): number | undefined {
  const reply = message.reply_to_message;
  return reply && reply.chat.id === message.chat.id && reply.is_automatic_forward === true
    && reply.sender_chat?.type === "channel" ? reply.message_id : undefined;
}

export type CampaignCopy = {
  messageId: number;
  text: string;
  post: number;
  // Original Telegram post time (ms). The window is keyed on it, not on when
  // the bot processed the update, so delays and edits never move a copy.
  postedAt: number;
  // Deletion was attempted (succeeded or failed); never retried in the window.
  handled?: boolean;
  auditSnapshot?: AuditSnapshot;
};

// size counts every copy in the campaign; pending are those not yet handled,
// oldest first, the current copy last when it is still pending.
export type Campaign = { size: number; pending: CampaignCopy[] };

type Entry = CampaignCopy & { seenAt: number };

export class CampaignLedger {
  // chat:actor -> normalized text -> copies. Texts are kept in least-recently
  // seen order and only whole texts are evicted, so the cap can never drop part
  // of a campaign; copies of one text are bounded by the window alone.
  private readonly actors = new Map<string, Map<string, Entry[]>>();

  constructor(
    private readonly ttlMs = 10 * 60_000,
    private readonly maxTexts = 20,
  ) {
    setInterval(() => {
      const now = Date.now();
      for (const key of this.actors.keys()) this.live(key, now);
    }, Math.min(ttlMs, 60_000)).unref();
  }

  // Records the current copy and returns the campaign it completes, if any.
  observe(chatId: number, actor: string, copy: CampaignCopy, now = Date.now()): Campaign | undefined {
    const key = `${chatId}:${actor}`;
    const texts = this.live(key, now);
    // An edit keeps the copy's original time and its handled state.
    const previous = this.take(texts, copy.messageId);
    const current: Entry = previous
      ? { ...copy, postedAt: previous.postedAt, handled: previous.handled, seenAt: previous.seenAt }
      : { ...copy, seenAt: now };
    const copies = texts.get(current.text) ?? [];
    texts.delete(current.text);
    texts.set(current.text, [...copies, current]);
    for (const text of texts.keys()) {
      if (texts.size <= this.maxTexts) break;
      texts.delete(text);
    }
    this.actors.set(key, texts);
    const same = copies.filter((c) => Math.abs(c.postedAt - current.postedAt) < this.ttlMs);
    const posts = new Set([...same.map((c) => c.post), current.post]);
    if (posts.size < CAMPAIGN_MIN_POSTS) return undefined;
    return { size: same.length + 1, pending: [...same, current].filter((c) => !c.handled) };
  }

  markHandled(chatId: number, actor: string, messageId: number): void {
    for (const copies of this.actors.get(`${chatId}:${actor}`)?.values() ?? []) {
      const copy = copies.find((c) => c.messageId === messageId);
      if (copy) copy.handled = true;
    }
  }

  // An edit that is no longer an eligible copy must not keep its old text/snapshot.
  forget(chatId: number, actor: string, messageId: number): void {
    const key = `${chatId}:${actor}`;
    const texts = this.actors.get(key);
    if (!texts) return;
    this.take(texts, messageId);
    if (!texts.size) this.actors.delete(key);
  }

  private take(texts: Map<string, Entry[]>, messageId: number): Entry | undefined {
    for (const [text, copies] of texts) {
      const found = copies.find((c) => c.messageId === messageId);
      if (!found) continue;
      const rest = copies.filter((c) => c !== found);
      if (rest.length) texts.set(text, rest);
      else texts.delete(text);
      return found;
    }
  }

  // Memory is bounded by when copies were seen; matching uses post times.
  private live(key: string, now: number): Map<string, Entry[]> {
    const texts = this.actors.get(key) ?? new Map<string, Entry[]>();
    for (const [text, copies] of texts) {
      const live = copies.filter((c) => now - c.seenAt < this.ttlMs);
      if (live.length) texts.set(text, live);
      else texts.delete(text);
    }
    if (!texts.size) this.actors.delete(key);
    return texts;
  }
}
