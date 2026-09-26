import { expect, test } from "bun:test";
import { CONTEXT_LINK_THRESHOLD, JevSpamClassifier } from "./spam";
import { reportedRecruitment, vagueRecruitmentControls, vagueRecruitmentVariants } from "./fixtures/vague-recruitment";

const key = process.env.TYPESAFE_API_KEY;
const liveTest = process.env.RUN_LIVE_JEV === "1" && key ? test : test.skip;
const classifier = new JevSpamClassifier(key ?? "unused", {
  model: "jev-1.13.0", threshold: 0.9, timeoutMs: 10_000,
});

const positives = [
  reportedRecruitment.paidCompletion,
  reportedRecruitment.shiftCover,
  ...vagueRecruitmentVariants,
];

for (const isForwarded of [true, false]) {
  liveTest("deletes vague paid recruitment (forwarded=" + isForwarded + ")", async () => {
    for (const text of positives) {
      const result = await classifier.classify({ text, embeddedLinks: [], isForwarded });
      expect(result.signals.unsolicited_vague_recruitment).toBeGreaterThanOrEqual(0.9);
      expect(result.shouldDelete).toBe(true);
    }
  });

  liveTest("keeps legitimate recruitment controls (forwarded=" + isForwarded + ")", async () => {
    for (const text of vagueRecruitmentControls) {
      const result = await classifier.classify({ text, embeddedLinks: [], isForwarded });
      expect(result.probability).toBeLessThan(0.9);
      expect(result.shouldDelete).toBe(false);
    }
  });
}

liveTest("measures the reported no-pay appeal without presuming payment", async () => {
  const result = await classifier.classify({
    text: reportedRecruitment.unpaidAmbiguous, embeddedLinks: [], isForwarded: true,
  });
  // A brief unpaid request has no reliable observable separator from this report;
  // retain the measurement without forcing deletion of friends' requests.
  expect(result.probability).toBeLessThan(0.9);
});

liveTest("deletes a repeated paid offer and links its same-actor suffix", async () => {
  const previous = { text: reportedRecruitment.shiftCover, embeddedLinks: [], isForwarded: false };
  const result = await classifier.classify(previous, [previous, previous]);
  expect(result.shouldDelete).toBe(true);
  expect(result.contextProbabilities.every((p) => p >= CONTEXT_LINK_THRESHOLD)).toBe(true);
});

liveTest("keeps unrelated earlier conversation below the linkage boundary", async () => {
  const result = await classifier.classify(
    { text: reportedRecruitment.shiftCover, embeddedLinks: [], isForwarded: false },
    [{ text: "Спасибо за помощь с настройкой сервера", embeddedLinks: [], isForwarded: false }],
  );
  expect(result.contextProbabilities[0]).toBeLessThan(CONTEXT_LINK_THRESHOLD);
});
