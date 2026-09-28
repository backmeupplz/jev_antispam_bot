import { expect, test } from "bun:test";
import { JevSpamClassifier, type ModerationMessage } from "./spam";

// Candidate-source probes use the complete production builder/parser. Explicit
// opt-in only; never start the bot, fetch private pages, or delete messages.
const enabled = process.env.RUN_DESTINATION_LIVE === "1" && Boolean(process.env.TYPESAFE_API_KEY);
const base: ModerationMessage = { text: "https://t.me/+g7RZcB6ymWozOGZi", embeddedLinks: [], isForwarded: false };
const rich: ModerationMessage = { ...base, destinationPreviews: [{ url: base.text, status: "available",
  title: "KONTO MANAGER KRYPTO WÄHRUNG HANDEL SIGNAL @EVEDEXofficial🇩🇪🌍📊📈📉",
  description: "Vielen Dank, dass Sie mein Glück in der Zeit, in der ich 150 € investiert habe, wiederhergestellt haben, und zu meiner größten Überraschung habe ich in nur 1 Tagen eine Rendite von 4.300 € erhalten. Er ist zuverlässig." }] };
const reply = (message: ModerationMessage, text: string): ModerationMessage => ({ ...message, preview: [{ kind: "reply", origin: "same_chat", sourceKind: "user", sourceAuthor: "other_author", isForwarded: false, text, embeddedLinks: [] }] });
const requested = reply(rich, "Please send the link to that investment channel so I can investigate it");
const unrelated = reply(rich, "My laptop has stopped working");
const cases: { id: string; message: ModerationMessage; recent?: ModerationMessage[]; expected: "keep" | "observe" }[] = [
  { id: "raw-token-before", message: base, expected: "keep" },
  { id: "rich-after", message: rich, expected: "observe" },
  { id: "benign-destination", message: { ...base, destinationPreviews: [{ url: base.text, status: "available", title: "Local book club", description: "Weekly reading and library discussion" }] }, expected: "keep" },
  { id: "revoked-unavailable", message: { ...base, destinationPreviews: [{ url: base.text, status: "unavailable" }] }, expected: "keep" },
  { id: "warning", message: { ...rich, text: "Beware of this investment scam: " + base.text }, expected: "keep" },
  { id: "report-wrapper", message: { ...rich, text: "another Link, that isn't recognized yet: " + base.text }, expected: "keep" },
  { id: "requested-link", message: requested, expected: "keep" },
  { id: "unrelated-reply", message: unrelated, expected: "observe" },
  { id: "discussion", message: { ...rich, text: "How can regulators investigate the claims on this channel? " + base.text }, expected: "keep" },
  { id: "mixed-history", message: unrelated, recent: [requested, unrelated], expected: "observe" },
  { id: "repeated-requested", message: requested, recent: [requested, requested], expected: "keep" },
  { id: "repeated-promotion", message: { ...rich, text: "Join for guaranteed daily investment returns! " + base.text }, recent: [{ ...rich, text: "Join for guaranteed daily investment returns! " + base.text }], expected: "observe" },
  { id: "video-caption-generic", message: { text: "Kontaktiere den Administrator unten 👇👇 https://t.me/+XUsbTjoIVr800Dc8 https://t.me/+XUsbTjoIVr800Dc8", embeddedLinks: [], isForwarded: true, destinationPreviews: [{ url: "https://t.me/+XUsbTjoIVr800Dc8", status: "unavailable" }] }, expected: "keep" },
];
for (const fixture of cases) (enabled ? test : test.skip)("destination live: " + fixture.id, async () => {
  const classifier = new JevSpamClassifier(process.env.TYPESAFE_API_KEY!, { model: "jev-1.13.0", threshold: 0.9, timeoutMs: 25_000 });
  const result = await classifier.classify(fixture.message, fixture.recent);
  expect(result.contextProbabilities).toHaveLength(fixture.recent?.length ?? 0);
  console.info(JSON.stringify({ fixture: fixture.id, model: result.model, shouldDelete: result.shouldDelete, probability: result.probability, strongestSignal: result.strongestSignal, contextProbabilities: result.contextProbabilities }));
  if (fixture.expected === "keep") expect(result.shouldDelete).toBe(false);
}, 30_000);
