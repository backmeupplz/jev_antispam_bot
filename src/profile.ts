import type { ChatFullInfo } from "grammy/types";
import type { SenderProfile } from "./spam";

type GetChat = (chatId: number, signal: AbortSignal) => Promise<ChatFullInfo>;

export class SenderProfileCache {
  private readonly entries = new Map<number, { expiresAt: number; profile?: SenderProfile }>();
  private readonly inFlight = new Map<number, Promise<SenderProfile | undefined>>();

  constructor(
    private readonly ttlMs = 10 * 60_000,
    private readonly maxEntries = 1_000,
    private readonly timeoutMs = 1_500,
  ) {}

  async get(userId: number, getChat: GetChat, now = Date.now()): Promise<SenderProfile | undefined> {
    const cached = this.entries.get(userId);
    if (cached && cached.expiresAt > now) return cached.profile;
    if (cached) this.entries.delete(userId);

    const active = this.inFlight.get(userId);
    if (active) return active;

    const request = this.load(userId, getChat)
      .then((profile) => {
        while (this.entries.size >= this.maxEntries) {
          const oldest = this.entries.keys().next().value;
          if (oldest === undefined) break;
          this.entries.delete(oldest);
        }
        this.entries.set(userId, { expiresAt: Date.now() + this.ttlMs, profile });
        return profile;
      })
      .finally(() => this.inFlight.delete(userId));

    this.inFlight.set(userId, request);
    return request;
  }

  private async load(userId: number, getChat: GetChat): Promise<SenderProfile | undefined> {
    const user = await getChat(userId, AbortSignal.timeout(this.timeoutMs));
    if (user.type !== "private" || user.id !== userId) throw new Error("Invalid private profile metadata");

    const bio = clean(user.bio);
    let personalChannel: SenderProfile["personalChannel"];
    if (user.personal_chat?.type === "channel") {
      const channel = await getChat(user.personal_chat.id, AbortSignal.timeout(this.timeoutMs));
      if (channel.type !== "channel" || channel.id !== user.personal_chat.id) {
        throw new Error("Invalid personal channel metadata");
      }
      personalChannel = {
        title: channel.title.trim(),
        username: clean(channel.username),
        description: clean(channel.description),
      };
    }

    return bio || personalChannel ? { bio, personalChannel } : undefined;
  }
}

function clean(value: string | undefined): string | undefined {
  return value?.trim() || undefined;
}
