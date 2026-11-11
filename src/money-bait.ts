// #624: actors whose money bait (src/promo-patterns.ts `moneyBait`) was confirmed for deletion in a chat. Within the window their
// vague odd-job openers ("кто выручит отвезти лопаты на дачу") go too; a member's own such request stays with the model.
export class BaitActors {
  // chat:actor -> when the bait was confirmed (ms)
  private readonly actors = new Map<string, number>();

  constructor(private readonly ttlMs = 10 * 60_000) {
    setInterval(() => this.prune(Date.now()), Math.min(ttlMs, 60_000)).unref();
  }

  flag(chatId: number, actor: string, now = Date.now()): void {
    this.actors.set(`${chatId}:${actor}`, now);
  }

  flagged(chatId: number, actor: string, now = Date.now()): boolean {
    const at = this.actors.get(`${chatId}:${actor}`);
    return at !== undefined && now - at < this.ttlMs;
  }

  private prune(now: number): void {
    for (const [key, at] of this.actors) if (now - at >= this.ttlMs) this.actors.delete(key);
  }
}
