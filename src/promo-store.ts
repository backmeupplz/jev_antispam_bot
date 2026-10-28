import { readFileSync } from "node:fs";
import pg from "pg";
import type { Store } from "./promo";

// promo.ts's key-value store in Jev's Postgres (migrations/008_promo_kv.sql, applied on first use)
export class PostgresPromoStore implements Store {
  private readonly pool: pg.Pool;
  private migration?: Promise<void>;
  constructor(databaseUrl: string) {
    this.pool = new pg.Pool({ connectionString: databaseUrl, max: 1, idleTimeoutMillis: 30_000 });
    this.pool.on("error", () => undefined);
  }
  private ready() {
    this.migration ??= this.pool.query(readFileSync(new URL("../migrations/008_promo_kv.sql", import.meta.url), "utf8"))
      .then(() => undefined).catch((error) => { this.migration = undefined; throw error; });
    return this.migration;
  }
  async get(key: string) {
    await this.ready();
    return (await this.pool.query<{ v: string }>("SELECT v FROM promo_kv WHERE k = $1", [key])).rows[0]?.v;
  }
  async set(key: string, value: string) {
    await this.ready();
    await this.pool.query("INSERT INTO promo_kv (k, v) VALUES ($1, $2) ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v, at = NOW()", [key, value]);
  }
  // A chat Jev first saw under 10 minutes ago, or not yet (stats are written in batches)
  async isNewChat(chatId: number) {
    try {
      const row = (await this.pool.query<{ first_seen_at: Date }>("SELECT first_seen_at FROM known_chats WHERE chat_id = $1", [chatId])).rows[0];
      return !row || Date.now() - row.first_seen_at.getTime() < 10 * 60_000;
    } catch {
      return false;
    }
  }
  close() { return this.pool.end(); }
}
