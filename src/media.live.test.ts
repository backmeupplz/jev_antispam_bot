import { expect, test } from "bun:test";
import { JevSpamClassifier, type CurrentModerationMessage } from "./spam";

const key = process.env.TYPESAFE_API_KEY;
const liveTest = process.env.RUN_LIVE_JEV === "1" && key ? test : test.skip;
const classifier = new JevSpamClassifier(key ?? "unused", { model: "jev-1.13.0", threshold: 0.9, timeoutMs: 10_000 });
const senderProfile = { personalChannel: { title: "Full Access", description: "Private videos. Register for paid access." } };
for (const isForwarded of [false, true]) {
  for (const [name, source, shouldDelete] of [
    ["requested screenshot from promotional channel owner", "Can you share a screenshot of the app error so we can debug it?", false],
    ["requested sticker from same promotional channel owner", "Please send the heart sticker we were discussing.", false],
    ["ambiguous standalone media", undefined, false],
    ["explicit unsolicited campaign context", "Stop spamming these heart stickers to advertise your paid private-video signup channel. Nobody requested your promotion here.", true],
  ] as const) {
    liveTest(name + " forwarded=" + isForwarded, async () => {
      const message: CurrentModerationMessage = { text: "", embeddedLinks: [], isForwarded, mediaOnly: true, senderProfile,
        ...(source ? { preview: [{ kind: "reply", origin: "same_chat", sourceKind: "user", sourceAuthor: "other_author", isForwarded: false, text: source, embeddedLinks: [] }] } : {}),
      };
      const result = await classifier.classify(message);
      console.info(JSON.stringify({ fixture: name, isForwarded, probability: result.probability, shouldDelete: result.shouldDelete }));
      expect(result.contextProbabilities).toHaveLength(0);
      expect(result.shouldDelete).toBe(shouldDelete);
      expect(result.strongestSignal).toBe("media_profile_funnel");
    }, 15_000);
  }
}
