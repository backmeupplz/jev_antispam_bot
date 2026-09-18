import type { Api } from "grammy";

const ADMIN_TTL_MS = 5 * 60 * 1_000;

type Entry = { isAdmin: boolean; expiresAt: number };

export class AdminCache {
  private readonly entries = new Map<string, Entry>();

  invalidate(chatId: number, userId: number): void {
    this.entries.delete(`${chatId}:${userId}`);
  }

  async isAdmin(api: Api, chatId: number, userId: number): Promise<boolean> {
    const key = `${chatId}:${userId}`;
    const cached = this.entries.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.isAdmin;

    const member = await api.getChatMember(chatId, userId);
    const isAdmin = member.status === "administrator" || member.status === "creator";
    this.entries.set(key, { isAdmin, expiresAt: Date.now() + ADMIN_TTL_MS });
    return isAdmin;
  }
}
