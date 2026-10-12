import type { Message } from "grammy/types";
import type { RecentMessage } from "./history";

// Nikita #81 option B: an actor posting the same comment under several linked
// channel posts is a campaign even when each copy alone stays under the gate.
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

export function campaignMessageIds(
  recentMessages: RecentMessage[],
  current: { messageId: number; text: string; campaignPost?: number },
): number[] {
  const text = campaignText(current.text);
  if (!text || current.campaignPost === undefined) return [];
  const copies = recentMessages.filter((message) => message.campaignPost !== undefined
    && campaignText(message.text) === text);
  const posts = new Set([...copies.map((message) => message.campaignPost), current.campaignPost]);
  return posts.size >= CAMPAIGN_MIN_POSTS ? [...copies.map((message) => message.messageId), current.messageId] : [];
}
