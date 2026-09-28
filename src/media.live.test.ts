import { expect, test } from "bun:test";
import { JevSpamClassifier } from "./spam";
import { mediaFixtures, mediaMessage } from "./fixtures/media-profile";

const key = process.env.TYPESAFE_API_KEY;
const liveTest = process.env.RUN_LIVE_JEV === "1" && key ? test : test.skip;
const classifier = new JevSpamClassifier(key ?? "unused", { model: "jev-1.13.0", threshold: 0.9, timeoutMs: 10_000 });
for (const isForwarded of [false, true]) {
  for (const fixture of mediaFixtures) {
    liveTest(fixture.id + " forwarded=" + isForwarded, async () => {
      const recent = fixture.recent ?? [];
      const result = await classifier.classify(mediaMessage(fixture, isForwarded), recent);
      console.info(JSON.stringify({ fixture: fixture.id, isForwarded, probability: result.probability, shouldDelete: result.shouldDelete }));
      expect(result.contextProbabilities).toHaveLength(recent.length);
      expect(result.shouldDelete).toBe(fixture.shouldDelete);
      expect(result.strongestSignal).toBe("media_profile_funnel");
    }, 15_000);
  }
}
