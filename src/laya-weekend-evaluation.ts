import { weekendFixtures, weekendHistoryFixtures, LAYA_DIAGNOSTIC_THRESHOLD, type WeekendFixture } from "./fixtures/laya-weekend-recruitment";
import { deletionMessageIds } from "./history";
import { toModerationMessage } from "./message";
import { CONTEXT_LINK_THRESHOLD, JevSpamClassifier } from "./spam";

// Diagnostic only. Always the production builder/parser; never a raw-score shortcut.
export async function evaluateWeekend(classifier: JevSpamClassifier, fixture: WeekendFixture, requestedModel: string) {
  const message = toModerationMessage(fixture.raw)!;
  const recent = fixture.recent.map(raw => toModerationMessage(raw)!);
  const result = await classifier.classify(message, recent);
  const contextLinks = result.contextProbabilities.map(p => p >= CONTEXT_LINK_THRESHOLD);
  const selectedMessageIds = result.shouldDelete ? deletionMessageIds(
    recent.map((item, i) => ({ ...item, messageId: fixture.recent[i]!.message_id, receivedAt: 1 })),
    fixture.raw.message_id, result.contextProbabilities, CONTEXT_LINK_THRESHOLD,
  ) : [];
  const accepted = result.shouldDelete === fixture.expectedDelete
    && result.contextProbabilities.length === fixture.expectedContextLinks.length
    && contextLinks.every((linked, i) => linked === fixture.expectedContextLinks[i])
    && result.model === requestedModel && result.truncated === false;
  // Only allowlisted numeric/verdict metadata: never request, source, profile or provider body.
  return { id: fixture.id, synthetic: true, sourceForm: fixture.sourceForm, status: "parsed",
    threshold: LAYA_DIAGNOSTIC_THRESHOLD, linkageThreshold: CONTEXT_LINK_THRESHOLD,
    expectedDelete: fixture.expectedDelete, expectedContextLinks: fixture.expectedContextLinks,
    requestedModel, model: result.model, route: result.route ?? null, truncated: result.truncated ?? null,
    shouldDelete: result.shouldDelete, strongestSignal: result.strongestSignal,
    probability: result.probability, signals: result.signals, contextProbabilities: result.contextProbabilities,
    contextLinks, selectedMessageIds, accepted };
}

export function layaEvaluationConfig(env: Record<string, string | undefined>) {
  if (env.RUN_LAYA_WEEKEND_EVAL !== "1" || !env.LAYA_EVAL_URL || !env.LAYA_EVAL_MODEL || !env.LAYA_EVAL_KEY)
    throw new Error("Explicit Laya evaluation opt-in, URL, model and protected key environment required");
  const url = new URL(env.LAYA_EVAL_URL);
  url.hostname = url.hostname.replace(/\.$/, "");
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash
    || url.pathname !== "/v1/systemone" || /(^|\.)typesafe\.ai$/i.test(url.hostname)
    || !/^laya[-a-zA-Z0-9_.]+$/.test(env.LAYA_EVAL_MODEL))
    throw new Error("Explicit Laya endpoint and model required; paid TypeSafe endpoint is not supported");
  return { url: url.toString(), model: env.LAYA_EVAL_MODEL, key: env.LAYA_EVAL_KEY };
}

if (import.meta.main) {
  try {
    const config = layaEvaluationConfig(process.env);
    const classifier = new JevSpamClassifier(config.key, {
      url: config.url, model: config.model, threshold: LAYA_DIAGNOSTIC_THRESHOLD, timeoutMs: 15_000,
      fetch: (url, init) => fetch(url, { ...init, redirect: "error" }),
    });
    // Exactly 13 sequential calls maximum, no retries, no Telegram writes or enrichment fetches.
    for (const fixture of [...weekendFixtures, ...weekendHistoryFixtures]) {
      try {
        const row = await evaluateWeekend(classifier, fixture, config.model);
        console.log(JSON.stringify(row));
        if (!row.accepted) process.exitCode = 1;
      } catch {
        console.log(JSON.stringify({ id: fixture.id, synthetic: true, status: "failed", accepted: false }));
        process.exitCode = 1;
        break; // Transport/parser failure must not trigger repeated failing requests.
      }
    }
  } catch {
    console.error("Evaluation not started: set RUN_LAYA_WEEKEND_EVAL=1 and protected LAYA_EVAL_URL/MODEL/KEY for an explicit Laya /v1/systemone endpoint.");
    process.exitCode = 1;
  }
}
