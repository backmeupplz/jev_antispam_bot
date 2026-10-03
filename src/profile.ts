import type { ChatFullInfo } from "grammy/types";
import type { SenderProfile } from "./spam";
import { publicChannelUrl } from "./personal-posts";

// Retrieval locators are internal capabilities, never classifier profile fields.
const publicChannels = new WeakMap<SenderProfile, { id: number; url: string }>();
export const personalChannelLocator = (profile: SenderProfile) => publicChannels.get(profile);

type GetChat = (chatId: number, signal: AbortSignal) => Promise<ChatFullInfo>;
type Outcome = (source: "user" | "channel" | "cache", outcome: "present" | "empty" | "unavailable" | "invalid" | "cached_present" | "cached_empty" | "cached_unavailable") => void;

export class SenderProfileCache {
  private readonly entries = new Map<number, {
    expiresAt: number;
    profile?: SenderProfile;
    failed?: boolean;
    timer: ReturnType<typeof setTimeout>;
  }>();
  private readonly inFlight = new Map<number, Promise<SenderProfile | undefined>>();

  constructor(
    private readonly ttlMs = 10 * 60_000,
    private readonly maxEntries = 1_000,
    private readonly timeoutMs = 1_500,
    private readonly failureTtlMs = 60_000,
  ) {}

  async get(userId: number, getChat: GetChat, now = Date.now(), onOutcome?: Outcome): Promise<SenderProfile | undefined> {
    const cached = this.entries.get(userId);
    if (cached && cached.expiresAt > now) {
      onOutcome?.("cache", cached.failed ? "cached_unavailable" : cached.profile ? "cached_present" : "cached_empty");
      return cached.profile;
    }
    if (cached) this.delete(userId);

    const active = this.inFlight.get(userId);
    if (active) {
      const profile = await active;
      const entry = this.entries.get(userId);
      onOutcome?.("cache", !entry || entry.failed ? "cached_unavailable" : profile ? "cached_present" : "cached_empty");
      return profile;
    }

    while (this.entries.size + this.inFlight.size >= this.maxEntries && this.entries.size) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.delete(oldest);
    }
    if (this.entries.size + this.inFlight.size >= this.maxEntries) {
      onOutcome?.("cache", "cached_unavailable");
      return undefined;
    }

    const request = this.load(userId, getChat, onOutcome)
      .then(({ profile, failed }) => {
        this.inFlight.delete(userId);
        this.store(userId, profile, failed ? this.failureTtlMs : this.ttlMs, failed);
        return profile;
      }, (error) => {
        this.inFlight.delete(userId);
        this.store(userId, undefined, this.failureTtlMs, true);
        throw error;
      })

    this.inFlight.set(userId, request);
    return request;
  }

  private store(userId: number, profile: SenderProfile | undefined, ttlMs: number, failed = false): void {
    this.delete(userId);
    const expiresAt = Date.now() + ttlMs;
    const timer = setTimeout(() => {
      const entry = this.entries.get(userId);
      if (entry?.expiresAt === expiresAt) this.entries.delete(userId);
    }, ttlMs);
    timer.unref?.();
    this.entries.set(userId, { expiresAt, profile, failed, timer });
  }

  invalidate(userId: number): void { this.delete(userId); }

  private delete(userId: number): void {
    const entry = this.entries.get(userId);
    if (entry) clearTimeout(entry.timer);
    this.entries.delete(userId);
  }

  private async load(userId: number, getChat: GetChat, onOutcome?: Outcome): Promise<{ profile?: SenderProfile; failed: boolean }> {
    let user: ChatFullInfo;
    try {
      user = await getChat(userId, AbortSignal.timeout(this.timeoutMs));
    } catch (error) {
      onOutcome?.("user", "unavailable");
      throw error;
    }
    if (user.type !== "private" || user.id !== userId) {
      onOutcome?.("user", "invalid");
      throw new Error("Invalid private profile metadata");
    }

    const bio = clean(user.bio);
    onOutcome?.("user", bio || user.personal_chat ? "present" : "empty");
    let personalChannel: SenderProfile["personalChannel"];
    let failed = false;
    let locator: { id: number; url: string } | undefined;
    if (user.personal_chat?.type === "channel") {
      try {
        const channel = await getChat(user.personal_chat.id, AbortSignal.timeout(this.timeoutMs));
        if (channel.type !== "channel" || channel.id !== user.personal_chat.id) {
          failed = true;
          onOutcome?.("channel", "invalid");
        } else {
          personalChannel = { title: channel.title.trim(), description: clean(channel.description) };
          const url = channel.username && publicChannelUrl(channel.username);
          if (url) locator = { id: channel.id, url };
          onOutcome?.("channel", personalChannel.title || personalChannel.description ? "present" : "empty");
        }
      } catch {
        // A private/inaccessible channel must not discard a successful bio.
        failed = true;
        onOutcome?.("channel", "unavailable");
      }
    }

    const profile = bio || personalChannel ? { bio, personalChannel } : undefined;
    if (profile && locator) publicChannels.set(profile, locator);
    return { profile, failed };
  }
}

function clean(value: string | undefined): string | undefined {
  return value?.trim() || undefined;
}
