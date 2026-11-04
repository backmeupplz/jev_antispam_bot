import { expect, test } from "bun:test";
import { JevSpamClassifier } from "./spam";
import { toModerationMessage } from "./message";
import { effectiveModel } from "./policy";
import { mediaButtonCases, mediaButtonMessage } from "./fixtures/media-buttons";
// #428, explicit opt-in: no Telegram calls, button activation or destination fetches.
// Model, gate and endpoint come from the runtime: RUN_MEDIA_BUTTONS_LIVE=1 with JEV_MODEL, SPAM_THRESHOLD, JEV_URL.
const enabled = process.env.RUN_MEDIA_BUTTONS_LIVE === "1" && Boolean(process.env.TYPESAFE_API_KEY);
for (const fixture of mediaButtonCases) (enabled ? test : test.skip)("media buttons live: " + fixture.id, async () => {
  const threshold = Number(process.env.SPAM_THRESHOLD);
  if (!(threshold > 0 && threshold <= 1) || !process.env.JEV_MODEL) throw new Error("Live model and gate must come from runtime, not historical defaults");
  const classifier = new JevSpamClassifier(process.env.TYPESAFE_API_KEY!, { model: effectiveModel(process.env.JEV_MODEL),
    threshold, timeoutMs: 25_000, ...(process.env.JEV_URL ? { url: process.env.JEV_URL } : {}) });
  const message = toModerationMessage(mediaButtonMessage(fixture))!;
  expect(message.mediaOnly).toBe(true);
  const result = await classifier.classify(message);
  console.info(JSON.stringify({ fixture: fixture.id, threshold, model: result.model, shouldDelete: result.shouldDelete,
    probability: result.probability, strongestSignal: result.strongestSignal, signals: result.signals }));
  expect(result.shouldDelete).toBe(fixture.delete);
}, 30_000);
