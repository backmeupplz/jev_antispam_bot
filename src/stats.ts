import { readFile } from "node:fs/promises";
import pg from "pg";

const { Pool } = pg;
const MIGRATION_URL = new URL("../migrations/001_chat_stats.sql", import.meta.url);
const DEDUPE_RETENTION_DAYS = 90;

export type ChatId = number | bigint | string;

export type ChatObservation = {
  chatId: ChatId;
  seenAt?: Date;
  chatType?: string;
  membershipActive?: boolean;
};

export type DeletionObservation = {
  chatId: ChatId;
  messageId: number | bigint | string;
  deletedAt?: Date;
};

type PendingChat = {
  chatId: string;
  firstSeenAt: string;
  lastSeenAt: string;
  chatType: string | null;
  membershipActive: boolean | null;
};

type PendingDeletion = {
  chatId: string;
  messageId: string;
  deletedAt: string;
};

export type StatsBatch = {
  chats: PendingChat[];
  deletions: PendingDeletion[];
};

export interface StatsStore {
  writeBatch(batch: StatsBatch): Promise<void>;
  close(): Promise<void>;
}

export interface StatsRecorder {
  observeChat(observation: ChatObservation): void;
  recordDeletion(observation: DeletionObservation): void;
  stop(): Promise<StatsHealth>;
  health(): StatsHealth;
}

export type StatsHealth = {
  pendingChats: number;
  pendingDeletions: number;
  droppedChats: number;
  droppedDeletions: number;
  flushFailures: number;
};

type BufferOptions = {
  flushIntervalMs?: number;
  batchSize?: number;
  maxPendingChats?: number;
  maxPendingDeletions?: number;
  dbTimeoutMs?: number;
  retryBaseMs?: number;
  retryMaxMs?: number;
  shutdownTimeoutMs?: number;
  random?: () => number;
  logger?: Pick<Console, "info" | "error">;
  autoStart?: boolean;
};

const BATCH_SQL = `
WITH supplied_chats AS (
  SELECT
    "chatId"::BIGINT AS chat_id,
    "firstSeenAt" AS first_seen_at,
    "lastSeenAt" AS last_seen_at,
    "chatType" AS chat_type,
    "membershipActive" AS membership_active
  FROM jsonb_to_recordset($1::jsonb) AS x(
    "chatId" TEXT,
    "firstSeenAt" TIMESTAMPTZ,
    "lastSeenAt" TIMESTAMPTZ,
    "chatType" TEXT,
    "membershipActive" BOOLEAN
  )
),
deletion_rows AS (
  SELECT "chatId"::BIGINT AS chat_id, "messageId"::BIGINT AS message_id, "deletedAt" AS deleted_at
  FROM jsonb_to_recordset($2::jsonb) AS x(
    "chatId" TEXT,
    "messageId" TEXT,
    "deletedAt" TIMESTAMPTZ
  )
),
deletion_chats AS (
  SELECT
    chat_id,
    MIN(deleted_at) AS first_seen_at,
    MAX(deleted_at) AS last_seen_at,
    NULL::TEXT AS chat_type,
    NULL::BOOLEAN AS membership_active
  FROM deletion_rows
  WHERE NOT EXISTS (SELECT 1 FROM supplied_chats WHERE supplied_chats.chat_id = deletion_rows.chat_id)
  GROUP BY chat_id
),
inserted_deletions AS (
  INSERT INTO deletion_dedup (chat_id, message_id, deleted_at)
  SELECT deletion_rows.chat_id, deletion_rows.message_id, deletion_rows.deleted_at
  FROM deletion_rows
  ON CONFLICT (chat_id, message_id) DO NOTHING
  RETURNING chat_id
),
deletion_counts AS (
  SELECT chat_id, COUNT(*)::BIGINT AS increment
  FROM inserted_deletions
  GROUP BY chat_id
),
upserted_chats AS (
  INSERT INTO known_chats (
    chat_id,
    first_seen_at,
    last_seen_at,
    chat_type,
    membership_active,
    successful_deletions
  )
  SELECT
    chats.chat_id,
    chats.first_seen_at,
    chats.last_seen_at,
    chats.chat_type,
    chats.membership_active,
    COALESCE(deletion_counts.increment, 0)
  FROM (
    SELECT * FROM supplied_chats
    UNION ALL
    SELECT * FROM deletion_chats
  ) AS chats
  LEFT JOIN deletion_counts USING (chat_id)
  ON CONFLICT (chat_id) DO UPDATE SET
    first_seen_at = LEAST(known_chats.first_seen_at, EXCLUDED.first_seen_at),
    last_seen_at = GREATEST(known_chats.last_seen_at, EXCLUDED.last_seen_at),
    chat_type = COALESCE(EXCLUDED.chat_type, known_chats.chat_type),
    membership_active = COALESCE(EXCLUDED.membership_active, known_chats.membership_active),
    successful_deletions = known_chats.successful_deletions + EXCLUDED.successful_deletions,
    updated_at = NOW()
  RETURNING chat_id
)
DELETE FROM deletion_dedup
WHERE deleted_at < NOW() - ($3::INTEGER * INTERVAL '1 day');
`;

export class PostgresStatsStore implements StatsStore {
  private readonly pool: pg.Pool;
  private migration?: Promise<void>;

  constructor(databaseUrl: string, timeoutMs = 2_000) {
    this.pool = new Pool({
      connectionString: databaseUrl,
      max: 1,
      connectionTimeoutMillis: timeoutMs,
      idleTimeoutMillis: 10_000,
      query_timeout: timeoutMs,
      statement_timeout: Math.max(1, timeoutMs - 100),
      application_name: "jev_antispam_bot_stats",
    });
    this.pool.on("error", () => undefined);
  }

  async writeBatch(batch: StatsBatch): Promise<void> {
    await this.ensureMigrated();
    await this.pool.query(BATCH_SQL, [JSON.stringify(batch.chats), JSON.stringify(batch.deletions), DEDUPE_RETENTION_DAYS]);
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  private async ensureMigrated(): Promise<void> {
    if (!this.migration) {
      this.migration = readFile(MIGRATION_URL, "utf8")
        .then((sql) => this.pool.query(sql))
        .then(() => undefined)
        .catch((error) => {
          this.migration = undefined;
          throw error;
        });
    }
    await this.migration;
  }
}

export class AsyncStatsBuffer implements StatsRecorder {
  private readonly chats = new Map<string, PendingChat>();
  private readonly deletions = new Map<string, PendingDeletion>();
  private readonly flushIntervalMs: number;
  private readonly batchSize: number;
  private readonly maxPendingChats: number;
  private readonly maxPendingDeletions: number;
  private readonly dbTimeoutMs: number;
  private readonly retryBaseMs: number;
  private readonly retryMaxMs: number;
  private readonly shutdownTimeoutMs: number;
  private readonly random: () => number;
  private readonly logger: Pick<Console, "info" | "error">;
  private timer?: ReturnType<typeof setTimeout>;
  private writeInFlight?: Promise<void>;
  private accepting = true;
  private failures = 0;
  private droppedChats = 0;
  private droppedDeletions = 0;
  private lastFailureLogAt = 0;
  private lastOverflowLogAt = 0;
  private storageReady = false;

  constructor(private readonly store: StatsStore, options: BufferOptions = {}) {
    this.flushIntervalMs = options.flushIntervalMs ?? 1_000;
    this.batchSize = options.batchSize ?? 100;
    this.maxPendingChats = options.maxPendingChats ?? 1_000;
    this.maxPendingDeletions = options.maxPendingDeletions ?? 1_000;
    this.dbTimeoutMs = options.dbTimeoutMs ?? 2_000;
    this.retryBaseMs = options.retryBaseMs ?? 1_000;
    this.retryMaxMs = options.retryMaxMs ?? 30_000;
    this.shutdownTimeoutMs = options.shutdownTimeoutMs ?? 5_000;
    this.random = options.random ?? Math.random;
    this.logger = options.logger ?? console;
    if (options.autoStart !== false) this.schedule(this.flushIntervalMs);
  }

  observeChat({ chatId, seenAt = new Date(), chatType, membershipActive }: ChatObservation): void {
    if (!this.accepting) return;
    const key = normalizeId(chatId);
    const previous = this.chats.get(key);
    if (!previous && this.chats.size >= this.maxPendingChats) {
      this.droppedChats += 1;
      this.logOverflow();
      return;
    }
    const timestamp = seenAt.toISOString();
    this.chats.set(key, {
      chatId: key,
      firstSeenAt: previous && previous.firstSeenAt < timestamp ? previous.firstSeenAt : timestamp,
      lastSeenAt: previous && previous.lastSeenAt > timestamp ? previous.lastSeenAt : timestamp,
      chatType: chatType ?? previous?.chatType ?? null,
      membershipActive: membershipActive ?? previous?.membershipActive ?? null,
    });
    this.schedule(this.flushIntervalMs);
  }

  recordDeletion({ chatId, messageId, deletedAt = new Date() }: DeletionObservation): void {
    if (!this.accepting) return;
    const normalizedChatId = normalizeId(chatId);
    const normalizedMessageId = normalizeId(messageId);
    const key = `${normalizedChatId}:${normalizedMessageId}`;
    if (this.deletions.has(key)) return;
    if (this.deletions.size >= this.maxPendingDeletions) {
      this.droppedDeletions += 1;
      this.logOverflow();
      return;
    }
    this.deletions.set(key, {
      chatId: normalizedChatId,
      messageId: normalizedMessageId,
      deletedAt: deletedAt.toISOString(),
    });
    this.schedule(this.flushIntervalMs);
  }

  health(): StatsHealth {
    return {
      pendingChats: this.chats.size,
      pendingDeletions: this.deletions.size,
      droppedChats: this.droppedChats,
      droppedDeletions: this.droppedDeletions,
      flushFailures: this.failures,
    };
  }

  async flush(): Promise<void> {
    if (this.writeInFlight || (!this.chats.size && !this.deletions.size)) return;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }

    const chats = [...this.chats.values()].slice(0, this.batchSize);
    const deletions = [...this.deletions.values()].slice(0, this.batchSize);
    const batch = { chats, deletions };
    const startedFailures = this.failures;
    const operation = this.store.writeBatch(batch).then(
      () => {
        for (const chat of chats) {
          if (this.chats.get(chat.chatId) === chat) this.chats.delete(chat.chatId);
        }
        for (const deletion of deletions) {
          const key = `${deletion.chatId}:${deletion.messageId}`;
          if (this.deletions.get(key) === deletion) this.deletions.delete(key);
        }
        this.failures = 0;
        if (!this.storageReady) {
          this.storageReady = true;
          this.logger.info(JSON.stringify({ event: "stats_storage_ready", ...this.health() }));
        }
        if (startedFailures) {
          this.logger.info(JSON.stringify({ event: "stats_flush_recovered", ...this.health() }));
        }
      },
      (error) => {
        this.failures += 1;
        this.logFailure("write_failed", error);
      },
    ).finally(() => {
      this.writeInFlight = undefined;
      if (this.accepting || this.chats.size || this.deletions.size) {
        const delay = this.failures ? this.retryDelay() : this.flushIntervalMs;
        this.schedule(delay);
      }
    });
    this.writeInFlight = operation;

    const completed = await Promise.race([
      operation.then(() => true),
      delay(this.dbTimeoutMs).then(() => false),
    ]);
    if (!completed) this.logFailure("deadline_exceeded");
  }

  async stop(): Promise<StatsHealth> {
    this.accepting = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    const deadline = Date.now() + this.shutdownTimeoutMs;

    while ((this.chats.size || this.deletions.size || this.writeInFlight) && Date.now() < deadline) {
      if (this.writeInFlight) {
        await Promise.race([this.writeInFlight, delay(Math.max(1, deadline - Date.now()))]);
      } else {
        await this.flush();
      }
      if (this.writeInFlight && Date.now() >= deadline) break;
    }

    await Promise.race([
      this.store.close().catch((error) => this.logFailure("close_failed", error)),
      delay(Math.max(1, deadline - Date.now())),
    ]);
    return this.health();
  }

  private schedule(delayMs: number): void {
    if (this.timer || this.writeInFlight || (!this.accepting && !this.chats.size && !this.deletions.size)) return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.flush();
    }, delayMs);
    this.timer.unref();
  }

  private retryDelay(): number {
    const exponential = Math.min(this.retryMaxMs, this.retryBaseMs * 2 ** Math.min(this.failures - 1, 10));
    return Math.round(exponential * (0.75 + this.random() * 0.5));
  }

  private logFailure(reason: string, error?: unknown): void {
    const now = Date.now();
    if (now - this.lastFailureLogAt < 60_000) return;
    this.lastFailureLogAt = now;
    this.logger.error(JSON.stringify({
      event: "stats_flush_failed",
      reason,
      kind: error instanceof Error ? error.name : error ? "unknown" : undefined,
      ...this.health(),
    }));
  }

  private logOverflow(): void {
    const now = Date.now();
    if (now - this.lastOverflowLogAt < 60_000) return;
    this.lastOverflowLogAt = now;
    this.logger.error(JSON.stringify({ event: "stats_queue_overflow", ...this.health() }));
  }
}

class DisabledStatsRecorder implements StatsRecorder {
  observeChat(): void {}
  recordDeletion(): void {}
  async stop(): Promise<StatsHealth> { return this.health(); }
  health(): StatsHealth {
    return { pendingChats: 0, pendingDeletions: 0, droppedChats: 0, droppedDeletions: 0, flushFailures: 0 };
  }
}

export function createStatsRecorder(databaseUrl?: string): StatsRecorder {
  if (!databaseUrl) return new DisabledStatsRecorder();
  return new AsyncStatsBuffer(new PostgresStatsStore(databaseUrl));
}

function normalizeId(id: number | bigint | string): string {
  return BigInt(id).toString();
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
