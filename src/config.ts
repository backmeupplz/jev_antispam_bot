export type Config = {
  telegramBotToken: string;
  typesafeApiKey: string;
  databaseUrl?: string;
  jevModel: string;
  spamThreshold: number;
  jevTimeoutMs: number;
  jevUrl: string;
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

  return {
    telegramBotToken: required("TELEGRAM_BOT_TOKEN"),
    typesafeApiKey: required("TYPESAFE_API_KEY"),
    databaseUrl: process.env.DATABASE_URL?.trim() || undefined,
    jevModel: process.env.JEV_MODEL?.trim() || "jev-1.13.0",
    spamThreshold,
    jevTimeoutMs,
    // Any Jev wire-compatible /v1/systemone server, e.g. self-hosted laya-serve.
    jevUrl: process.env.JEV_URL?.trim() || "https://api.typesafe.ai/v1/systemone",
    // Shadow classifier: logged next to the primary verdict, never deletes.
    shadow: process.env.SHADOW_URL?.trim() ? {
      url: process.env.SHADOW_URL.trim(),
      apiKey: process.env.SHADOW_API_KEY?.trim() ?? "",
      model: process.env.SHADOW_MODEL?.trim() || "multilingual",
      timeoutMs: numberFromEnv("SHADOW_TIMEOUT_MS", 30_000),
    } : undefined,
  };
}
