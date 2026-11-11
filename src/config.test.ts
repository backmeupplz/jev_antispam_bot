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

test("JEV_CONCURRENCY defaults to 4 and is validated (#613)", () => {
  const names = ["TELEGRAM_BOT_TOKEN", "TYPESAFE_API_KEY", "JEV_CONCURRENCY"] as const;
  const saved = Object.fromEntries(names.map(name => [name, process.env[name]]));
  try {
    process.env.TELEGRAM_BOT_TOKEN = "synthetic"; process.env.TYPESAFE_API_KEY = "synthetic";
    delete process.env.JEV_CONCURRENCY;
    expect(loadConfig().concurrency).toBe(4);
    process.env.JEV_CONCURRENCY = "1";
    expect(loadConfig().concurrency).toBe(1);
    for (const bad of ["0", "17", "2.5", "many"]) {
      process.env.JEV_CONCURRENCY = bad;
      expect(() => loadConfig()).toThrow("JEV_CONCURRENCY");
    }
  } finally { for (const name of names) { const value = saved[name]; if (value === undefined) delete process.env[name]; else process.env[name] = value; } }
});

test("JEV_UPDATE_CONCURRENCY and JEV_CONTEXT_TIMEOUT_MS default and are validated (#616)", () => {
  const names = ["TELEGRAM_BOT_TOKEN", "TYPESAFE_API_KEY", "JEV_CONCURRENCY", "JEV_UPDATE_CONCURRENCY", "JEV_CONTEXT_TIMEOUT_MS"] as const;
  const saved = Object.fromEntries(names.map(name => [name, process.env[name]]));
  try {
    process.env.TELEGRAM_BOT_TOKEN = "synthetic"; process.env.TYPESAFE_API_KEY = "synthetic";
    delete process.env.JEV_CONCURRENCY; delete process.env.JEV_UPDATE_CONCURRENCY; delete process.env.JEV_CONTEXT_TIMEOUT_MS;
    expect(loadConfig()).toMatchObject({ concurrency: 4, updateConcurrency: 16, jevContextTimeoutMs: 8_000 });
    process.env.JEV_UPDATE_CONCURRENCY = "4"; process.env.JEV_CONTEXT_TIMEOUT_MS = "0";
    expect(loadConfig()).toMatchObject({ updateConcurrency: 4, jevContextTimeoutMs: 0 });
    process.env.JEV_CONCURRENCY = "16"; delete process.env.JEV_UPDATE_CONCURRENCY;
    expect(loadConfig()).toMatchObject({ concurrency: 16, updateConcurrency: 16 });
    process.env.JEV_CONCURRENCY = "8";
    for (const bad of ["7", "65", "2.5", "many"]) {
      process.env.JEV_UPDATE_CONCURRENCY = bad;
      expect(() => loadConfig()).toThrow("JEV_UPDATE_CONCURRENCY");
    }
    delete process.env.JEV_UPDATE_CONCURRENCY;
    for (const bad of ["-1", "30001", "1.5", "slow"]) {
      process.env.JEV_CONTEXT_TIMEOUT_MS = bad;
      expect(() => loadConfig()).toThrow("JEV_CONTEXT_TIMEOUT_MS");
    }
  } finally { for (const name of names) { const value = saved[name]; if (value === undefined) delete process.env[name]; else process.env[name] = value; } }
});
