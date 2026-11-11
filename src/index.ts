import { handleConcurrently, drainBot } from "./lifecycle";
import { PostgresDeletionAudit, RETAINED_REPORTS_ALERT } from "./audit-outbox";
import { CACHE_POLICY_REVISION } from "./spam-cache";
import { APPROVED_MODEL, APPROVED_PROMPT_SHA256, APPROVED_CHECKPOINT_SHA256 } from "./policy";
import { PostgresSpamCache } from "./spam-cache";
import { PostgresRepeatStore } from "./repeat-sends";
import { Bot } from "grammy";
import { registerBotHandlers } from "./bot";
import { DeleteRetryQueue } from "./delete-retry";
import { startWithHandover } from "./handover";
import { loadConfig } from "./config";
import { JevSpamClassifier } from "./spam";
import { AdaptiveClassifier } from "./classifier-resilience";
import { createStatsRecorder } from "./stats";
import { PostgresTrainingCapture } from "./training-capture";
import { promos } from "./promo";
import { PostgresPromoStore } from "./promo-store";

const config = loadConfig();
if (!config.databaseUrl) throw new Error("DATABASE_URL is required for private deletion auditing");
if (config.jevModel === APPROVED_MODEL && config.spamThreshold !== 0.80) throw new Error("Approved policy requires SPAM_THRESHOLD=0.80");
const bot = new Bot(config.telegramBotToken);
const updates = handleConcurrently(bot, { limit: config.concurrency });
const deletionAudit = new PostgresDeletionAudit(config.databaseUrl, bot.api);
await deletionAudit.initialize();
deletionAudit.start();
const auditHealthTimer = setInterval(() => {
  void deletionAudit.summary().then(summary => {
    console.info(JSON.stringify({ event: "deletion_audit_health", ...summary, process: deletionAudit.health() }));
    if (summary.retained > RETAINED_REPORTS_ALERT) console.warn(JSON.stringify({ event: "deletion_audit_retention_high", retained: summary.retained, threshold: RETAINED_REPORTS_ALERT }));
  }).catch(() => console.error(JSON.stringify({ event: "deletion_audit_health", outcome: "unavailable" })));
}, 60_000);
auditHealthTimer.unref();
// Telegram's queue of updates not yet confirmed (#613): it should stay near zero.
const backlogTimer = setInterval(() => {
  void bot.api.getWebhookInfo().then(
    info => console.info(JSON.stringify({ event: "update_backlog", pendingUpdateCount: info.pending_update_count, handling: updates.size,
      classifierLimit: classifier.limit, classifying: classifier.running, classifierWaiting: classifier.waiting, classifierPaused: classifier.paused })),
    () => console.error(JSON.stringify({ event: "update_backlog", outcome: "unavailable", handling: updates.size })),
  );
}, 60_000);
backlogTimer.unref();
const deleteRetries = new DeleteRetryQueue();
const stats = createStatsRecorder(config.databaseUrl);
const spamCache = config.databaseUrl && process.env.SPAM_CACHE_ENABLED !== "false"
  ? new PostgresSpamCache(config.databaseUrl) : undefined;
// Repeat-send escalation needs history that survives restarts (#124).
const repeats = new PostgresRepeatStore(config.databaseUrl);
const trainingCapture = config.databaseUrl && process.env.TRAINING_CAPTURE === "true"
  ? new PostgresTrainingCapture(config.databaseUrl, { retentionDays: Number(process.env.TRAINING_CAPTURE_DAYS || 30) }) : undefined;
// At most JEV_CONCURRENCY model calls at once, fewer while they time out (#625).
const classifier = new AdaptiveClassifier(new JevSpamClassifier(config.typesafeApiKey, {
  model: config.jevModel,
  threshold: config.spamThreshold,
  timeoutMs: config.jevTimeoutMs,
  url: config.jevUrl,
}), config.concurrency, {
  onLimit: (limit, previous) => console.info(JSON.stringify({ event: "classifier_concurrency", limit, previous })),
  onPause: (ms) => console.error(JSON.stringify({ event: "classifier_paused", pauseMs: ms })),
});
// Stopping ends classification retries (#625): the handover confirms in-flight updates and exits soon after SIGTERM.
const stopping = new AbortController();
const shadowClassifier = config.shadow && new JevSpamClassifier(config.shadow.apiKey, {
  model: config.shadow.model,
  threshold: config.spamThreshold,
  timeoutMs: config.shadow.timeoutMs,
  url: config.shadow.url,
});

// Prime Radiant's reply promos: off without PROMO_TOKEN or with PROMO=off
const promoStore = new PostgresPromoStore(config.databaseUrl);
const promo = promos("jev", promoStore);
promo.start();

registerBotHandlers(bot, { classifier, shadowClassifier, trainingCapture, deletionAudit, model: config.jevModel, stats, spamCache, spamThreshold: config.spamThreshold, repeats,
  promo, isNewChat: (chatId) => promoStore.isNewChat(chatId), deleteRetries, classifyRetry: { signal: stopping.signal } });

let polling: Promise<void> = Promise.resolve();
let shutdownPromise: Promise<void> | undefined;
function shutdown(): Promise<void> {
  if (!shutdownPromise) {
    shutdownPromise = (async () => {
      console.info(JSON.stringify({ event: "bot_stopping", ...stats.health() }));
      stopping.abort();
      await drainBot(bot, polling, updates.settle);
      clearInterval(auditHealthTimer);
      clearInterval(backlogTimer);
      // Queued deletions are in memory only; a restart drops them (logged as the count at stop).
      const pendingRetries = deleteRetries.size; await deleteRetries.stop();
      if (pendingRetries) console.info(JSON.stringify({ event: "delete_retry", outcome: "dropped", reason: "shutdown", count: pendingRetries }));
      await deletionAudit.close();
      await spamCache?.close();
      await repeats.close();
      await trainingCapture?.close();
      await promo.stop();
      await promoStore.close();
      const health = await stats.stop();
      console.info(JSON.stringify({ event: "bot_stopped", ...health }));
    })();
  }
  return shutdownPromise;
}

console.info(JSON.stringify({
  event: "bot_starting",
  model: config.jevModel,
  threshold: config.spamThreshold,
  cachePolicyRevision: CACHE_POLICY_REVISION,
  approvedPromptSha256: config.jevModel === APPROVED_MODEL ? APPROVED_PROMPT_SHA256 : null,
  approvedCheckpointSha256: config.jevModel === APPROVED_MODEL ? APPROVED_CHECKPOINT_SHA256 : null,
  deletionAuditEnabled: true,
  statsEnabled: Boolean(config.databaseUrl),
  spamCacheEnabled: Boolean(spamCache),
  shadowModel: config.shadow?.model ?? null,
  trainingCapture: Boolean(trainingCapture),
  concurrency: config.concurrency,
}));
try {
  // Polls only while holding the handover lock; SIGTERM/SIGINT stop polling, then run shutdown()
  polling = startWithHandover(bot, {
    allowed_updates: ["message", "edited_message", "my_chat_member", "chat_member"],
    onStart: ({ username }) => {
      console.info(JSON.stringify({ event: "bot_started", username }));
      // Only once polling, so the handover's own handler already keeps a signal from killing the process outright.
      for (const signal of ["SIGTERM", "SIGINT"] as const) process.once(signal, () => stopping.abort());
    },
  }, shutdown, updates.settle);
  await polling;
} finally {
  await shutdown();
}
