import { expect, test } from "bun:test";
import { CONTEXT_LINK_THRESHOLD, JevSpamClassifier, SPAM_QUESTIONS, parseAssessment } from "./spam";
import { deletionMessageIds } from "./history";
const body = (signal: string, score: number, links: number[] = []) => ({ model: "jev-1.13.0", answers: Object.fromEntries([
  ...Object.keys(SPAM_QUESTIONS).map(key => [key, { type: "noul", noul: key === signal ? score : 0.01 }]),
  ...links.map((noul, i) => ["context_message_" + i, { type: "noul", noul }]),
]) });
for (const signal of Object.keys(SPAM_QUESTIONS).filter(key => key !== "media_profile_funnel")) {
  test("candidate 0.81 inclusive boundary: " + signal, () => {
    for (const score of [0.809999, 0.81, 0.810001]) expect(parseAssessment(body(signal, score), 0.81).shouldDelete).toBe(score >= 0.81);
  });
}
test("candidate gate preserves independent .75 history boundary and contiguous suffix", () => {
  expect(CONTEXT_LINK_THRESHOLD).toBe(0.75);
  const result = parseAssessment(body("adult_profile_bait", 0.81, [0.99, 0.749999, 0.75, 0.8]), 0.81, 4);
  const recent = [1, 2, 3, 4].map(messageId => ({ messageId, receivedAt: 1, text: "synthetic", embeddedLinks: [], isForwarded: false }));
  expect(deletionMessageIds(recent, 5, result.contextProbabilities, CONTEXT_LINK_THRESHOLD)).toEqual([3, 4, 5]);
  const incomplete = body("adult_profile_bait", 0.99);
  expect(() => parseAssessment(incomplete, 0.81, 1)).toThrow("context_message_0");
});
test("candidate .81 media gate remains separate from text signals", async () => {
  for (const score of [0.809999, 0.81, 0.810001]) {
    const response = body("media_profile_funnel", score);
    response.answers.profile_bait = { type: "noul", noul: 0.99 };
    const classifier = new JevSpamClassifier("fixture", { model: "jev-1.13.0", threshold: 0.81, timeoutMs: 1000, fetch: async () => Response.json(response) });
    expect((await classifier.classify({ text: "", mediaOnly: true, embeddedLinks: [], isForwarded: false })).shouldDelete).toBe(score >= 0.81);
    expect(parseAssessment(body("media_profile_funnel", 0.99), 0.81).shouldDelete).toBe(false);
  }
});
