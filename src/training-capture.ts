import { readFileSync } from "node:fs";
import pg from "pg";
import type { SpamAssessment } from "./spam";

// Opt-in (TRAINING_CAPTURE=true): stores the exact Jev request (message text, context and
// sender-profile text included) plus Jev's answers, to distill a self-hosted model. Never
// stores sender IDs. Rows expire after retentionDays and are capped at maxRows.
export type TrainingCapture = Pick<PostgresTrainingCapture, "record">;
export class PostgresTrainingCapture {
  private readonly pool: pg.Pool;
  private migration?: Promise<unknown>;
  private inFlight = 0;
  private lastPrune = 0;
  readonly counters = { stored: 0, dropped: 0, failed: 0 };
  constructor(databaseUrl: string, private readonly options: { retentionDays?: number; maxRows?: number } = {}) {
    this.pool = new pg.Pool({ connectionString: databaseUrl, max: 1, connectionTimeoutMillis: 2_000,
      statement_timeout: 5_000, idleTimeoutMillis: 10_000, application_name: "jev_antispam_bot_training" });
    this.pool.on("error", () => undefined);
  }

  record(chatId: number, messageId: number, request: unknown, answers: unknown, assessment: SpamAssessment): void {
    // ponytail: drop rather than queue under load; training data is a sample, not a ledger.
    if (this.inFlight >= 4) { this.counters.dropped++; return; }
    this.inFlight++;
    void this.insert(chatId, messageId, request, answers, assessment)
      .then(() => { this.counters.stored++; }, () => { this.counters.failed++; })
      .finally(() => { this.inFlight--; });
  }

  async close() { await this.pool.end(); }

  private async insert(chatId: number, messageId: number, request: unknown, answers: unknown, a: SpamAssessment) {
    this.migration ??= this.pool.query(readFileSync(new URL("../migrations/003_training_samples.sql", import.meta.url), "utf8"))
      .catch((error) => { this.migration = undefined; throw error; });
    await this.migration;
    await this.pool.query(
      "INSERT INTO training_samples(chat_id, message_id, model, should_delete, probability, strongest_signal, request, answers) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
      [chatId, messageId, a.model, a.shouldDelete, a.probability, a.strongestSignal, JSON.stringify(request), JSON.stringify(answers)]);
    if (Date.now() - this.lastPrune < 3_600_000) return;
    this.lastPrune = Date.now();
    await this.pool.query("DELETE FROM training_samples WHERE created_at < NOW() - $1 * INTERVAL '1 day'", [this.options.retentionDays ?? 30]);
    await this.pool.query("DELETE FROM training_samples WHERE id <= (SELECT id FROM training_samples ORDER BY id DESC OFFSET $1 LIMIT 1)", [this.options.maxRows ?? 200_000]);
  }
}
