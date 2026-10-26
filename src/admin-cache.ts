import { GrammyError, type Api } from "grammy";
import { telegramErrorReason } from "./telegram-errors";

const ADMIN_TTL_MS = 5 * 60 * 1_000;
// An expired answer is still reused while Telegram refuses a refresh (#193).
const STALE_GRACE_MS = 30 * 60 * 1_000;
// Updates are handled one at a time, so a 429 is only waited out when it is short.
const MAX_RETRY_WAIT_MS = 3_000;
// After any other failed refresh, the stale answer is reused without calling again for a minute.
const REFRESH_BACKOFF_MS = 60 * 1_000;

type Entry<T> = { value: T; fetchedAt: number; retryAt?: number };
export type AdminLookup = "stale_reused" | "retried_after_429" | "member_fallback";
type Sender = { id: number; is_bot: boolean };
type OnLookup = (outcome: AdminLookup, reason?: string) => void;

const isAdminStatus = (status: string) => status === "administrator" || status === "creator";

/**
 * Human senders are checked against one cached administrator list per chat
 * (`getChatAdministrators`), so a busy chat costs one call per five minutes
 * instead of one `getChatMember` per new sender. The list also works in groups
 * that hide their members from a non-admin bot, where `getChatMember` returns
 * CHAT_ADMIN_REQUIRED. Bots missing from the list keep the per-user check,
 * because Telegram may leave bot administrators out of it.
 */
export class AdminCache {
  private readonly lists = new Map<number, Entry<Set<number>>>();
  private readonly members = new Map<string, Entry<boolean>>();
  // A chat whose list was refused goes straight to per-user lookups for one TTL.
  private readonly listRefusedAt = new Map<number, number>();
  // Per chat: the #193 storm hit ~20 chats while most other lookups still worked.
  private readonly floodUntil = new Map<number, number>();

  constructor(
    private readonly now: () => number = Date.now,
    private readonly sleep: (ms: number) => Promise<void> = ms => new Promise(resolve => setTimeout(resolve, ms)),
  ) {}

  /** Applies a chat_member update to the cached answers. */
  update(chatId: number, userId: number, status: string): void {
    const list = this.lists.get(chatId);
    if (list) isAdminStatus(status) ? list.value.add(userId) : list.value.delete(userId);
    this.members.delete(`${chatId}:${userId}`);
  }

  /**
   * `wait: false` never sleeps on a 429 (for secondary checks that may run once per
   * chat in a single update); stale answers are still reused.
   */
  async isAdmin(api: Api, chatId: number, sender: Sender, onLookup?: OnLookup, { wait = true } = {}): Promise<boolean> {
    const maxWaitMs = wait ? MAX_RETRY_WAIT_MS : 0;
    let admins: Set<number> | undefined;
    if (this.now() - (this.listRefusedAt.get(chatId) ?? -Infinity) >= ADMIN_TTL_MS) {
      try {
        admins = await this.cached(this.lists, chatId, chatId, onLookup, maxWaitMs, async () =>
          new Set((await api.getChatAdministrators(chatId)).filter(m => isAdminStatus(m.status)).map(m => m.user.id)));
        this.listRefusedAt.delete(chatId);
      } catch (error) {
        // Flood control would refuse the per-user lookup too; any other refusal falls back to it.
        if (isFlood(error)) throw error;
        // Only a definite refusal is remembered; a timeout or 5xx retries the list next time.
        if (error instanceof GrammyError && error.error_code < 500) this.listRefusedAt.set(chatId, this.now());
        onLookup?.("member_fallback", telegramErrorReason(error));
      }
    }
    if (admins?.has(sender.id)) return true;
    if (admins && !sender.is_bot) return false;
    return this.cached(this.members, `${chatId}:${sender.id}`, chatId, onLookup, maxWaitMs, async () =>
      isAdminStatus((await api.getChatMember(chatId, sender.id)).status));
  }

  private async cached<K, T>(entries: Map<K, Entry<T>>, key: K, chatId: number,
    onLookup: OnLookup | undefined, maxWaitMs: number, load: () => Promise<T>): Promise<T> {
    const entry = entries.get(key);
    const age = entry ? this.now() - entry.fetchedAt : Infinity;
    if (entry && age < ADMIN_TTL_MS) return entry.value;
    if (entry && age < ADMIN_TTL_MS + STALE_GRACE_MS && (entry.retryAt ?? 0) > this.now()) return entry.value;
    const stale = (reason?: string) => {
      if (!entry || age >= ADMIN_TTL_MS + STALE_GRACE_MS) return undefined;
      onLookup?.("stale_reused", reason);
      return entry;
    };
    const waitMs = (this.floodUntil.get(chatId) ?? 0) - this.now();
    if (waitMs > 0) {
      const reused = stale();
      if (reused) return reused.value;
      if (waitMs > maxWaitMs) throw new FloodWaitError();
      await this.sleep(waitMs);
    }
    for (let attempt = 0; ; attempt += 1) {
      try {
        const value = await load();
        entries.set(key, { value, fetchedAt: this.now() });
        if (attempt) onLookup?.("retried_after_429");
        return value;
      } catch (error) {
        const retryMs = retryAfterMs(error);
        if (retryMs !== undefined) this.floodUntil.set(chatId, this.now() + retryMs);
        const reused = stale(telegramErrorReason(error));
        if (reused) {
          if (retryMs === undefined) reused.retryAt = this.now() + REFRESH_BACKOFF_MS;
          return reused.value;
        }
        if (attempt || retryMs === undefined || retryMs > maxWaitMs) throw error;
        await this.sleep(retryMs);
      }
    }
  }
}

/** A lookup refused locally because its chat is still inside a Telegram retry_after window. */
export class FloodWaitError extends Error {
  constructor() { super("Telegram flood wait"); }
}

function isFlood(error: unknown): boolean {
  return error instanceof FloodWaitError || (error instanceof GrammyError && error.error_code === 429);
}

function retryAfterMs(error: unknown): number | undefined {
  if (!(error instanceof GrammyError) || error.error_code !== 429) return undefined;
  const seconds = error.parameters?.retry_after;
  // A 429 without a usable retry_after is still flood control: back off for a minute.
  return typeof seconds === "number" && Number.isFinite(seconds) && seconds >= 0 ? seconds * 1_000 : 60_000;
}
