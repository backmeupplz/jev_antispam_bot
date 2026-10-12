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
  receivedAt: number;
  deleted?: boolean;
  auditSnapshot?: AuditSnapshot;
};

export class CampaignLedger {
  private readonly copies = new Map<string, CampaignCopy[]>();

  constructor(
    private readonly ttlMs = 10 * 60_000,
    private readonly maxCopies = 20,
  ) {
    setInterval(() => {
      const now = Date.now();
      for (const key of this.copies.keys()) this.live(key, now);
    }, Math.min(ttlMs, 60_000)).unref();
  }

  // Records the current copy. Returns the earlier copies still to delete when it
  // completes a campaign (possibly none), or undefined when it does not.
  observe(chatId: number, actor: string, copy: CampaignCopy): CampaignCopy[] | undefined {
    const key = `${chatId}:${actor}`;
    const earlier = this.live(key, copy.receivedAt).filter((c) => c.messageId !== copy.messageId);
    this.copies.set(key, [...earlier, copy].slice(-this.maxCopies));
    const same = earlier.filter((c) => c.text === copy.text);
    const posts = new Set([...same.map((c) => c.post), copy.post]);
    return posts.size >= CAMPAIGN_MIN_POSTS ? same.filter((c) => !c.deleted) : undefined;
  }

  markDeleted(chatId: number, actor: string, messageId: number): void {
    const copy = this.copies.get(`${chatId}:${actor}`)?.find((c) => c.messageId === messageId);
    if (copy) copy.deleted = true;
  }

  private live(key: string, now: number): CampaignCopy[] {
    const live = (this.copies.get(key) ?? []).filter((c) => now - c.receivedAt < this.ttlMs);
    if (live.length) this.copies.set(key, live);
    else this.copies.delete(key);
    return live;
  }
}
