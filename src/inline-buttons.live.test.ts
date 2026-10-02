import { expect, test } from "bun:test";
import { JevSpamClassifier } from "./spam";
import { toModerationMessage } from "./message";
import { buttonCases, buttonMessage } from "./fixtures/inline-buttons";
// Explicit opt-in; no Telegram calls, button activation or destination fetches.
const enabled = process.env.RUN_INLINE_BUTTONS_LIVE === "1" && Boolean(process.env.TYPESAFE_API_KEY);
for (const fixture of buttonCases) (enabled ? test : test.skip)("inline buttons live: " + fixture.id, async () => {
  const threshold = Number(process.env.SPAM_THRESHOLD);
  if (!(threshold > 0 && threshold <= 1) || !process.env.JEV_MODEL) throw new Error("Live model and gate must come from runtime, not historical defaults");
  const classifier = new JevSpamClassifier(process.env.TYPESAFE_API_KEY!, { model: process.env.JEV_MODEL, threshold, timeoutMs: 25_000 });
  const result = await classifier.classify(toModerationMessage(buttonMessage(fixture))!);
  console.info(JSON.stringify({ fixture: fixture.id, threshold, model: result.model, shouldDelete: result.shouldDelete,
    probability: result.probability, strongestSignal: result.strongestSignal, signals: result.signals }));
  expect(result.contextProbabilities).toEqual([]);
  expect(result.shouldDelete).toBe(fixture.delete);
}, 30_000);
