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
  // the bot processed the update, so edits and short delays never move a copy.
  postedAt: number;
  // Deletion was attempted (succeeded or failed); never retried in the window.
  handled?: boolean;
  auditSnapshot?: AuditSnapshot;
};

// size counts every copy in the campaign; pending are those not yet handled
// (the current copy included while it is).
export type Campaign = { size: number; pending: CampaignCopy[] };

type Entry = CampaignCopy & { seenAt: number };

export class CampaignLedger {
  // chat:actor -> normalized text -> copies. Texts are kept in least-recently
  // seen order and only whole texts are evicted, so the cap can never drop part
  // of a campaign; copies of one text are bounded by retention alone. Losing a
  // text to the cap takes as many other distinct 40+ character texts in the
  // window, which is itself abnormal for one actor.
  private readonly actors = new Map<string, Map<string, Entry[]>>();
  // Handled copies edited out of eligibility: chat:actor:messageId -> seenAt.
  // Editing one back must not retry its delete.
  private readonly handledAway = new Map<string, number>();

  constructor(
    private readonly ttlMs = 10 * 60_000,
    private readonly maxTexts = 20,
  ) {
    setInterval(() => {
      const now = Date.now();
      for (const key of this.actors.keys()) this.live(key, now);
      for (const [id, seenAt] of this.handledAway) if (now - seenAt >= 2 * ttlMs) this.handledAway.delete(id);
    }, Math.min(ttlMs, 60_000)).unref();
  }

  // Records the current copy and returns the campaign it completes, if any.
  observe(chatId: number, actor: string, copy: CampaignCopy, now = Date.now()): Campaign | undefined {
    const key = `${chatId}:${actor}`;
    const texts = this.live(key, now);
    // An edit keeps the copy's original time and its handled state.
    const away = this.handledAway.get(`${key}:${copy.messageId}`);
    this.handledAway.delete(`${key}:${copy.messageId}`);
    const previous = this.take(texts, copy.messageId)
      ?? (away === undefined || now - away >= 2 * this.ttlMs ? undefined : { ...copy, handled: true, seenAt: away });
    const current: Entry = previous
      ? { ...copy, postedAt: previous.postedAt, handled: previous.handled, seenAt: previous.seenAt,
        auditSnapshot: previous.handled ? undefined : copy.auditSnapshot }
      : { ...copy, seenAt: now };
    const copies = texts.get(current.text) ?? [];
    texts.delete(current.text);
    texts.set(current.text, [...copies, current]);
    for (const text of texts.keys()) {
      if (texts.size <= this.maxTexts) break;
      texts.delete(text);
    }
    this.actors.set(key, texts);
    // Members: every copy sharing a window shorter than ttl with the current copy
    // that spans enough distinct posts. Two pointers over post time keep it linear.
    const sorted = [...copies, current].sort((a, b) => a.postedAt - b.postedAt);
    const members = new Set<Entry>();
    const posts = new Map<number, number>();
    for (let start = 0, end = 0, marked = 0; start < sorted.length; start += 1) {
      for (; end < sorted.length && sorted[end]!.postedAt - sorted[start]!.postedAt < this.ttlMs; end += 1) {
        posts.set(sorted[end]!.post, (posts.get(sorted[end]!.post) ?? 0) + 1);
      }
      const from = sorted[start]!.postedAt;
      if (from <= current.postedAt && current.postedAt - from < this.ttlMs && posts.size >= CAMPAIGN_MIN_POSTS) {
        for (marked = Math.max(marked, start); marked < end; marked += 1) members.add(sorted[marked]!);
      }
      const left = posts.get(sorted[start]!.post)! - 1;
      if (left) posts.set(sorted[start]!.post, left);
      else posts.delete(sorted[start]!.post);
    }
    if (!members.size) return undefined;
    const campaign = [...copies, current].filter((c) => members.has(c));
    return { size: campaign.length, pending: campaign.filter((c) => !c.handled) };
  }

  markHandled(chatId: number, actor: string, messageId: number): void {
    for (const copies of this.actors.get(`${chatId}:${actor}`)?.values() ?? []) {
      const copy = copies.find((c) => c.messageId === messageId);
      if (!copy) continue;
      copy.handled = true;
      // Only pending copies are deleted, so a handled copy needs no audit evidence.
      delete copy.auditSnapshot;
    }
  }

  // An edit that is no longer an eligible copy must not keep its old text/snapshot.
  forget(chatId: number, actor: string, messageId: number): void {
    const key = `${chatId}:${actor}`;
    const texts = this.actors.get(key);
    if (!texts) return;
    const taken = this.take(texts, messageId);
    if (taken?.handled) this.handledAway.set(`${key}:${messageId}`, taken.seenAt);
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

  // Memory is bounded by when copies were seen; matching uses post times. The
  // extra window of retention absorbs processing backlogs and late edits.
  private live(key: string, now: number): Map<string, Entry[]> {
    const texts = this.actors.get(key) ?? new Map<string, Entry[]>();
    for (const [text, copies] of texts) {
      const live = copies.filter((c) => now - c.seenAt < 2 * this.ttlMs);
      if (live.length) texts.set(text, live);
      else texts.delete(text);
    }
    if (!texts.size) this.actors.delete(key);
    return texts;
  }
}
