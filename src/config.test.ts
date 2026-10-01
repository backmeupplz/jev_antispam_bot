import { expect, test } from "bun:test";
import { loadConfig } from "./config";

test("authorized .81 default and explicit override reach production config", () => {
  const names = ["TELEGRAM_BOT_TOKEN", "TYPESAFE_API_KEY", "SPAM_THRESHOLD", "JEV_MODEL", "JEV_TIMEOUT_MS"] as const;
  const saved = Object.fromEntries(names.map(name => [name, process.env[name]]));
  try {
    process.env.TELEGRAM_BOT_TOKEN = "synthetic"; process.env.TYPESAFE_API_KEY = "synthetic";
    delete process.env.SPAM_THRESHOLD; delete process.env.JEV_MODEL; delete process.env.JEV_TIMEOUT_MS;
    expect(loadConfig().spamThreshold).toBe(0.81);
    process.env.SPAM_THRESHOLD = "0.9";
    expect(loadConfig().spamThreshold).toBe(0.9);
    process.env.SPAM_THRESHOLD = "0.81";
    expect(loadConfig()).toMatchObject({ spamThreshold: 0.81, jevModel: "jev-1.13.0" });
    process.env.SPAM_THRESHOLD = "not-a-number";
    expect(() => loadConfig()).toThrow("SPAM_THRESHOLD must be a number");
  } finally { for (const name of names) { const value = saved[name]; if (value === undefined) delete process.env[name]; else process.env[name] = value; } }
});
