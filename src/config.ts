import { effectiveModel } from "./policy";
export type Config = {
  telegramBotToken: string;
  typesafeApiKey: string;
  databaseUrl?: string;
  jevModel: string;
  spamThreshold: number;
  jevTimeoutMs: number;
  jevContextTimeoutMs: number;
  jevUrl: string;
  concurrency: number;
  updateConcurrency: number;
  shadow?: { url: string; apiKey: string; model: string; timeoutMs: number };
};

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function numberFromEnv(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`${name} must be a number`);
  return value;
}

export function loadConfig(): Config {
  const spamThreshold = numberFromEnv("SPAM_THRESHOLD", 0.81);
  if (spamThreshold < 0.5 || spamThreshold > 1) {
    throw new Error("SPAM_THRESHOLD must be between 0.5 and 1");
  }

  const jevTimeoutMs = numberFromEnv("JEV_TIMEOUT_MS", 8_000);
  if (!Number.isInteger(jevTimeoutMs) || jevTimeoutMs < 1_000 || jevTimeoutMs > 30_000) {
    throw new Error("JEV_TIMEOUT_MS must be an integer between 1000 and 30000");
  }

  // Extra time per context message, which laya-serve answers in a second pass (#616).
  const jevContextTimeoutMs = numberFromEnv("JEV_CONTEXT_TIMEOUT_MS", 8_000);
  if (!Number.isInteger(jevContextTimeoutMs) || jevContextTimeoutMs < 0 || jevContextTimeoutMs > 30_000) {
    throw new Error("JEV_CONTEXT_TIMEOUT_MS must be an integer between 0 and 30000");
  }

  // Model calls at once (#613); match laya-serve's LAYA_CONCURRENCY so requests never queue there.
  const concurrency = numberFromEnv("JEV_CONCURRENCY", 4);
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 16) {
    throw new Error("JEV_CONCURRENCY must be an integer between 1 and 16");
  }
  // Updates handled at once (#616). Most of an update's time is Telegram and network I/O, not the model, so this is
  // wider than JEV_CONCURRENCY; the model calls among them still wait for one of JEV_CONCURRENCY slots.
  const updateConcurrency = numberFromEnv("JEV_UPDATE_CONCURRENCY", 16);
  if (!Number.isInteger(updateConcurrency) || updateConcurrency < concurrency || updateConcurrency > 64) {
    throw new Error("JEV_UPDATE_CONCURRENCY must be an integer between JEV_CONCURRENCY and 64");
  }

  return {
    telegramBotToken: required("TELEGRAM_BOT_TOKEN"),
    typesafeApiKey: required("TYPESAFE_API_KEY"),
    databaseUrl: process.env.DATABASE_URL?.trim() || undefined,
    jevModel: effectiveModel(process.env.JEV_MODEL?.trim() || "jev-1.13.0"),
    spamThreshold,
    jevTimeoutMs,
    jevContextTimeoutMs,
    // Any Jev wire-compatible /v1/systemone server, e.g. self-hosted laya-serve.
    jevUrl: process.env.JEV_URL?.trim() || "https://api.typesafe.ai/v1/systemone",
    concurrency,
    updateConcurrency,
    // Shadow classifier: logged next to the primary verdict, never deletes.
    shadow: process.env.SHADOW_URL?.trim() ? {
      url: process.env.SHADOW_URL.trim(),
      apiKey: process.env.SHADOW_API_KEY?.trim() ?? "",
      model: process.env.SHADOW_MODEL?.trim() || "multilingual",
      timeoutMs: numberFromEnv("SHADOW_TIMEOUT_MS", 30_000),
    } : undefined,
  };
}
