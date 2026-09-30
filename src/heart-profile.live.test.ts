import { expect, test } from "bun:test";
import { JevSpamClassifier } from "./spam";
import { heartFixtures } from "./fixtures/heart-profile";

const key = process.env.TYPESAFE_API_KEY;
const liveTest = process.env.RUN_LIVE_JEV === "1" && key ? test : test.skip;
for (const fixture of heartFixtures) {
  liveTest("synthetic heart boundary: " + fixture.id, async () => {
    const exchanges: unknown[] = [];
    const classifier = new JevSpamClassifier(key!, {
      model: "jev-1.13.0", threshold: 0.9, timeoutMs: 10_000,
      fetch: async (url, init) => {
        const request = JSON.parse(String(init?.body));
        const response = await fetch(url, init);
        // Only synthetic state/questions and model answers, never headers or production data.
        const body = await response.clone().json();
        exchanges.push({ request, response: body });
        return response;
      },
    });
    const result = await classifier.classify(fixture.message);
    if (process.env.HEART_EVIDENCE_DIR) {
      await Bun.write(process.env.HEART_EVIDENCE_DIR + "/" + fixture.id + ".json", JSON.stringify({ fixture: fixture.id, exchanges, result }, null, 2));
    }
    console.info(JSON.stringify({ fixture: fixture.id, result }));
    expect(result.contextProbabilities).toHaveLength(0);
    expect(result.shouldDelete).toBe(fixture.shouldDelete);
  }, 15_000);
}
