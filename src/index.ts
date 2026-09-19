import { Bot } from "grammy";
import { registerBotHandlers } from "./bot";
import { loadConfig } from "./config";
import { JevSpamClassifier } from "./spam";
import { createStatsRecorder } from "./stats";

const config = loadConfig();
const bot = new Bot(config.telegramBotToken);
const stats = createStatsRecorder(config.databaseUrl);
const classifier = new JevSpamClassifier(config.typesafeApiKey, {
  model: config.jevModel,
  threshold: config.spamThreshold,
  timeoutMs: config.jevTimeoutMs,
});

registerBotHandlers(bot, { classifier, model: config.jevModel, stats });

let shutdownPromise: Promise<void> | undefined;
function shutdown(signal: string): Promise<void> {
  if (!shutdownPromise) {
    shutdownPromise = (async () => {
      console.info(JSON.stringify({ event: "bot_stopping", signal, ...stats.health() }));
      await bot.stop();
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
  statsEnabled: Boolean(config.databaseUrl),
}));
try {
  await bot.start({
    allowed_updates: ["message", "edited_message", "my_chat_member", "chat_member"],
    onStart: ({ username }) => console.info(JSON.stringify({ event: "bot_started", username })),
  });
} finally {
  if (shutdownPromise) await shutdownPromise;
  else await stats.stop();
}
