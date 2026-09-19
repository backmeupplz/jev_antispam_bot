import type { ModerationMessage } from "./spam";

export type RecentMessage = ModerationMessage & {
  messageId: number;
  receivedAt: number;
};

export class MessageHistory {
  private readonly messages = new Map<string, RecentMessage[]>();

  constructor(
    private readonly ttlMs = 10 * 60_000,
    private readonly maxMessages = 10,
  ) {
    setInterval(() => this.pruneExpired(Date.now()), Math.min(ttlMs, 60_000)).unref();
  }

  recent(chatId: number, senderId: number, now = Date.now(), excludeMessageId?: number): RecentMessage[] {
    const key = `${chatId}:${senderId}`;
    const recent = (this.messages.get(key) ?? []).filter(
      (message) => now - message.receivedAt < this.ttlMs && message.messageId !== excludeMessageId,
    );

    if (recent.length) this.messages.set(key, recent);
    else this.messages.delete(key);
    return recent;
  }

  remember(chatId: number, senderId: number, message: RecentMessage): void {
    const recent = this.recent(chatId, senderId, message.receivedAt, message.messageId);
    this.messages.set(`${chatId}:${senderId}`, [...recent, message].slice(-this.maxMessages));
  }

  clear(chatId: number, senderId: number): void {
    this.messages.delete(`${chatId}:${senderId}`);
  }

  private pruneExpired(now: number): void {
    for (const [key, messages] of this.messages) {
      const recent = messages.filter((message) => now - message.receivedAt < this.ttlMs);
      if (recent.length) this.messages.set(key, recent);
      else this.messages.delete(key);
    }
  }
}

export function deletionMessageIds(
  recentMessages: RecentMessage[],
  currentMessageId: number,
  linkedProbabilities: number[],
  threshold: number,
): number[] {
  const linkedMessageIds: number[] = [];
  for (let index = recentMessages.length - 1; index >= 0; index -= 1) {
    if ((linkedProbabilities[index] ?? 0) < threshold) break;
    linkedMessageIds.unshift(recentMessages[index]!.messageId);
  }
  return [...new Set([...linkedMessageIds, currentMessageId])];
}
