import { PostgresDeletionAudit } from "./audit-outbox";
import { CACHE_POLICY_REVISION } from "./spam-cache";
import { APPROVED_MODEL, APPROVED_PROMPT_SHA256, APPROVED_CHECKPOINT_SHA256 } from "./policy";
import { PostgresSpamCache } from "./spam-cache";
import { Bot } from "grammy";
import { registerBotHandlers } from "./bot";
import { loadConfig } from "./config";
import { JevSpamClassifier } from "./spam";
import { createStatsRecorder } from "./stats";
import { PostgresTrainingCapture } from "./training-capture";

const config = loadConfig();
if (!config.databaseUrl) throw new Error("DATABASE_URL is required for private deletion auditing");
if (config.jevModel === APPROVED_MODEL && config.spamThreshold !== 0.80) throw new Error("Approved policy requires SPAM_THRESHOLD=0.80");
const bot = new Bot(config.telegramBotToken);
const deletionAudit = new PostgresDeletionAudit(config.databaseUrl, bot.api);
await deletionAudit.initialize();
deletionAudit.start();
const auditHealthTimer = setInterval(() => {
  void deletionAudit.summary().then(summary => console.info(JSON.stringify({ event: "deletion_audit_health", ...summary, process: deletionAudit.health() })))
    .catch(() => console.error(JSON.stringify({ event: "deletion_audit_health", outcome: "unavailable" })));
}, 60_000);
auditHealthTimer.unref();
const stats = createStatsRecorder(config.databaseUrl);
const spamCache = config.databaseUrl && process.env.SPAM_CACHE_ENABLED !== "false"
  ? new PostgresSpamCache(config.databaseUrl) : undefined;
const trainingCapture = config.databaseUrl && process.env.TRAINING_CAPTURE === "true"
  ? new PostgresTrainingCapture(config.databaseUrl, { retentionDays: Number(process.env.TRAINING_CAPTURE_DAYS || 30) }) : undefined;
const classifier = new JevSpamClassifier(config.typesafeApiKey, {
  model: config.jevModel,
  threshold: config.spamThreshold,
  timeoutMs: config.jevTimeoutMs,
  url: config.jevUrl,
});
const shadowClassifier = config.shadow && new JevSpamClassifier(config.shadow.apiKey, {
  model: config.shadow.model,
  threshold: config.spamThreshold,
  timeoutMs: config.shadow.timeoutMs,
  url: config.shadow.url,
});

registerBotHandlers(bot, { classifier, shadowClassifier, trainingCapture, deletionAudit, model: config.jevModel, stats, spamCache, spamThreshold: config.spamThreshold });

let shutdownPromise: Promise<void> | undefined;
function shutdown(signal: string): Promise<void> {
  if (!shutdownPromise) {
    shutdownPromise = (async () => {
      console.info(JSON.stringify({ event: "bot_stopping", signal, ...stats.health() }));
      await bot.stop();
      clearInterval(auditHealthTimer);
      await deletionAudit.close();
      await spamCache?.close();
      await trainingCapture?.close();
      const health = await stats.stop();
      console.info(JSON.stringify({ event: "bot_stopped", ...health }));
    })();
  }
  return shutdownPromise;
}

process.once("SIGTERM", () => void shutdown("SIGTERM"));
process.once("SIGINT", () => void shutdown("SIGINT"));

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
}));
try {
  await bot.start({
    allowed_updates: ["message", "edited_message", "my_chat_member", "chat_member"],
    onStart: ({ username }) => console.info(JSON.stringify({ event: "bot_started", username })),
  });
} finally {
  if (shutdownPromise) await shutdownPromise;
  else { clearInterval(auditHealthTimer); await deletionAudit.close(); await spamCache?.close(); await trainingCapture?.close(); await stats.stop(); }
}
