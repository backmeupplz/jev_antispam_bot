import { previewFixtures, type PreviewFixture } from "./fixtures/preview-amplification";
import { deletionMessageIds } from "./history";
import { toModerationMessage } from "./message";
import { CONTEXT_LINK_THRESHOLD, JevSpamClassifier } from "./spam";

// Calls the production request builder and strict parser; no question/answer reconstruction.
export async function evaluatePreview(classifier: JevSpamClassifier, fixture: PreviewFixture) {
  const message = toModerationMessage(fixture.message)!;
  const recent = fixture.recent.map(input => toModerationMessage(input)!);
  const result = await classifier.classify(message, recent);
  if (result.contextProbabilities.length !== recent.length) throw new Error("Incomplete linkage answers");
  const selectedMessageIds = result.shouldDelete ? deletionMessageIds(
    recent.map((item, index) => ({ ...item, messageId: fixture.recent[index]!.message_id, receivedAt: 1 })),
    fixture.message.message_id, result.contextProbabilities, CONTEXT_LINK_THRESHOLD,
  ) : [];
  return { id: fixture.id, intent: fixture.intent, ...result, selectedMessageIds };
}

if (import.meta.main) {
  if (process.env.RUN_LIVE_JEV !== "1" || !process.env.TYPESAFE_API_KEY) {
    console.error("Opt in with RUN_LIVE_JEV=1 and an existing protected TYPESAFE_API_KEY environment.");
    process.exitCode = 1;
  } else {
    const classifier = new JevSpamClassifier(process.env.TYPESAFE_API_KEY, {
      model: "jev-1.13.0", threshold: 0.9, timeoutMs: 10_000,
    });
    // Sequential, one attempt per synthetic fixture; no retries or Telegram writes.
    for (const fixture of previewFixtures) {
      try {
        console.log(JSON.stringify({ status: "parsed", synthetic: true, threshold: 0.9,
          linkageThreshold: CONTEXT_LINK_THRESHOLD, ...await evaluatePreview(classifier, fixture) }));
      } catch {
        // Do not leak credentials, provider bodies or source text through raw errors.
        console.log(JSON.stringify({ id: fixture.id, status: "failed", decision: "keep", selectedMessageIds: [] }));
        process.exitCode = 1;
      }
    }
  }
}
