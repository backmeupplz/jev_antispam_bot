import { expect, test } from "bun:test";
import { CONTEXT_LINK_THRESHOLD, JevSpamClassifier } from "./spam";
import { careControls, careInvitation, careRequest, careVariants, careWhitespaceVariants, laptopPreview, normalizedCare, photoCare, reportedCare, rvPreview } from "./fixtures/paid-care";

const key = process.env.TYPESAFE_API_KEY;
const live = process.env.RUN_LIVE_JEV === "1" && key ? test : test.skip;
const classifier = new JevSpamClassifier(key ?? "unused", { model: "jev-1.13.0", threshold: 0.9, timeoutMs: 10_000 });

for (const [index, text] of [reportedCare, ...careWhitespaceVariants, ...careVariants].entries()) {
  for (const [label, source, expected] of [
    ["standalone", undefined, true], ["unrelated", laptopPreview, true],
    ["requested", careRequest, false], ["invited", careInvitation, false],
  ] as const) {
    live("care offer " + index + ": " + label, async () => {
      const result = await classifier.classify(normalizedCare(text, source));
      expect(result.model).toBe("jev-1.13.0");
      expect(result.contextProbabilities).toHaveLength(0);
      expect(result.shouldDelete).toBe(expected);
    });
  }
}
for (const [index, text] of careControls.entries()) {
  live("care benign control " + index, async () => {
    expect((await classifier.classify(normalizedCare(text))).shouldDelete).toBe(false);
  });
}
live("three-copy laptop/RV/photo sequence measures current and linked suffix independently", async () => {
  const history = [];
  for (const current of [normalizedCare(reportedCare, laptopPreview), normalizedCare(reportedCare, rvPreview), photoCare()]) {
    const result = await classifier.classify(current, history);
    expect(result.contextProbabilities).toHaveLength(history.length);
    expect(result.shouldDelete).toBe(true);
    expect(result.contextProbabilities.every(p => p >= CONTEXT_LINK_THRESHOLD)).toBe(true);
    history.push(current);
  }
});
live("identical requested copies remain kept and excluded from later unrelated spam", async () => {
  const requested = normalizedCare(reportedCare, careRequest);
  const spam = normalizedCare(reportedCare, laptopPreview);
  const repeated = await classifier.classify(requested, [requested, requested]);
  expect(repeated.contextProbabilities).toHaveLength(2);
  expect(repeated.shouldDelete).toBe(false);
  const mixed = await classifier.classify(photoCare(), [requested, spam, normalizedCare(reportedCare, rvPreview)]);
  expect(mixed.shouldDelete).toBe(true);
  expect(mixed.contextProbabilities).toHaveLength(3);
  expect(mixed.contextProbabilities[0]).toBeLessThan(CONTEXT_LINK_THRESHOLD);
  expect(mixed.contextProbabilities.slice(1).every(p => p >= CONTEXT_LINK_THRESHOLD)).toBe(true);
});
live("self-authored request does not invite a care pitch", async () => {
  expect((await classifier.classify(normalizedCare(reportedCare, careRequest, 12))).shouldDelete).toBe(true);
});
