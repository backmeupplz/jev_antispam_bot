import { expect, test } from "bun:test";
import { JevSpamClassifier, CONTEXT_LINK_THRESHOLD, type ModerationMessage } from "./spam";
import { heartFixtures } from "./fixtures/heart-profile";

const key = process.env.TYPESAFE_API_KEY;
const liveTest = process.env.RUN_LIVE_JEV === "1" && key ? test : test.skip;
for (const fixture of heartFixtures) {
  liveTest("synthetic heart boundary: " + fixture.id, async () => {
    const exchanges: { request: { state: { message: unknown }; questions: Record<string, unknown> }; response: { answers: Record<string, unknown> } }[] = [];
    const classifier = new JevSpamClassifier(key!, {
      model: "jev-1.13.0", threshold: 0.81, timeoutMs: 10_000,
      fetch: async (url, init) => {
        const request = JSON.parse(String(init?.body));
        const response = await fetch(url, init);
        // Only synthetic state/questions and model answers, never headers or production data.
        const body = await response.clone().json();
        exchanges.push({ request, response: body });
        return response;
      },
    });
    const recent: ModerationMessage[] = fixture.id === "public-post-heart" ? [{ text: "The retry configuration worked, thank you.", embeddedLinks: [], isForwarded: false }] : [];
    const result = await classifier.classify(fixture.message, recent);
    if (process.env.HEART_EVIDENCE_DIR) {
      await Bun.write(process.env.HEART_EVIDENCE_DIR + "/" + fixture.id + ".json", JSON.stringify({ fixture: fixture.id, exchanges, result }, null, 2));
    }
    console.info(JSON.stringify({ fixture: fixture.id, result }));
    expect(exchanges).toHaveLength(1);
    const exchange = exchanges[0]!;
    expect(exchange.request.state.message).toEqual(fixture.message);
    for (const name of Object.keys(exchange.request.questions)) {
      expect(exchange.response.answers).toHaveProperty(name);
    }
    expect(Object.keys(exchange.request.questions).filter((name) => name.startsWith("context_message_"))).toHaveLength(recent.length);
    expect(result.contextProbabilities).toHaveLength(recent.length);
    if (recent.length) expect(result.contextProbabilities[0]!).toBeLessThan(CONTEXT_LINK_THRESHOLD);
    expect(result.shouldDelete).toBe(fixture.shouldDelete);
  }, 15_000);
}
