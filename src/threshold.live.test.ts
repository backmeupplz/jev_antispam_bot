import { expect, test } from "bun:test";
import { JevSpamClassifier, CONTEXT_LINK_THRESHOLD, type CurrentModerationMessage, type ModerationMessage } from "./spam";
import { heartFixtures, publicPostProfile, explicitHeartProfile } from "./fixtures/heart-profile";
import { normalizedRecruitment, hiringRequest, unrelatedReply } from "./fixtures/recruitment-replies";
import { reportedRecruitment } from "./fixtures/vague-recruitment";
import { inviteCampaigns, requestedInviteReplies, inviteControls } from "./fixtures/invite-funnel";
import { toModerationMessage } from "./message";
import { deletionMessageIds } from "./history";

// Synthetic only: emoji/profile labels revised by Nikita #21968 before calls.
// Historical assumed-KEEP labels/scores retained; this is a policy revision.
const message = (text: string): CurrentModerationMessage => ({ text, embeddedLinks: [], isForwarded: false });
const sympathy = (profile = publicPostProfile, text = "My dog died today. I miss her so much."): CurrentModerationMessage => ({
  ...message("🤎"), senderProfile: profile, preview: [{ kind: "reply", origin: "same_chat", sourceKind: "user", sourceAuthor: "other_author", isForwarded: false, text, embeddedLinks: [] }],
});
const cases: { id: string; message: CurrentModerationMessage; shouldDelete: boolean; recent?: ModerationMessage[]; suffix?: number[] }[] = [
  ...heartFixtures.map(f => ({ ...f, ...(f.id === "public-post-heart" ? { recent: [message("The retry configuration worked, thank you.")], suffix: [100] } : {}) })),
  { id: "spontaneous-sympathy-post", message: sympathy(), shouldDelete: true },
  { id: "spontaneous-sympathy-description", message: sympathy(explicitHeartProfile), shouldDelete: true },
  { id: "spontaneous-celebration-post", message: sympathy(publicPostProfile, "My daughter graduated today! I am so proud of her."), shouldDelete: true },
  { id: "ordinary-reaction", message: { ...sympathy(), senderProfile: undefined }, shouldDelete: false },
  { id: "requested-recruitment", message: normalizedRecruitment(reportedRecruitment.paidCompletion, hiringRequest), shouldDelete: false },
  { id: "unsolicited-recruitment", message: normalizedRecruitment(reportedRecruitment.paidCompletion, unrelatedReply), shouldDelete: true },
  { id: "requested-link", message: toModerationMessage(requestedInviteReplies[0]!.input)!, shouldDelete: false },
  { id: "warning-link", message: message(inviteControls.find(f => f.id === "warning")!.text), shouldDelete: false },
  { id: "mixed-history-invite", message: message(inviteCampaigns[0]!.text), recent: inviteCampaigns[0]!.recent, shouldDelete: true, suffix: [2, 100] },
  { id: "requested-media-same-profile", message: { ...sympathy(publicPostProfile, "Please send a heart sticker to confirm receipt."), text: "", mediaOnly: true }, shouldDelete: false },
];
const live = process.env.RUN_LIVE_JEV === "1" && process.env.TYPESAFE_API_KEY ? test : test.skip;
for (const fixture of cases) live("0.81 comparison: " + fixture.id, async () => {
  const recent = fixture.recent ?? [];
  let request: any;
  let response: any;
  const classifier = new JevSpamClassifier(process.env.TYPESAFE_API_KEY!, {
    model: "jev-1.13.0", threshold: 0.81, timeoutMs: 10_000,
    fetch: async (url, init) => { request = JSON.parse(String(init?.body)); const reply = await fetch(url, init); response = await reply.clone().json(); return reply; },
  });
  const result = await classifier.classify(JSON.parse(JSON.stringify(fixture.message)), recent);
  const oldClassifier = new JevSpamClassifier("synthetic-replay", { model: "jev-1.13.0", threshold: 0.9, timeoutMs: 1000, fetch: async () => Response.json(response) });
  const oldResult = await oldClassifier.classify(fixture.message, recent);
  const selected = result.shouldDelete ? (fixture.message.mediaOnly ? [100] : deletionMessageIds(recent.map((m,i) => ({ ...m, messageId: i+1, receivedAt: 1 })), 100, result.contextProbabilities, CONTEXT_LINK_THRESHOLD)) : [];
  if (process.env.THRESHOLD_EVIDENCE_DIR) await Bun.write(process.env.THRESHOLD_EVIDENCE_DIR + "/" + fixture.id + ".json", JSON.stringify({ fixture: fixture.id, expectedDelete: fixture.shouldDelete, request, response, oldResult, result, selected }, null, 2));
  for (const name of Object.keys(request.questions)) expect(response.answers).toHaveProperty(name);
  expect(result.contextProbabilities).toHaveLength(recent.length);
  expect(result.shouldDelete).toBe(fixture.shouldDelete);
  if (fixture.suffix) expect(selected).toEqual(fixture.suffix);
}, 15_000);
