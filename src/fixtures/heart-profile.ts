import type { CurrentModerationMessage, SenderProfile } from "../spam";

// Synthetic boundary comparisons, NOT recovered Telegram updates or profile fields.
export const heartTitle = "😘 Private Secret";
export const explicitHeartProfile: SenderProfile = {
  personalChannel: { title: heartTitle, description: "My adult videos: register for paid private access." },
};
export const heartSource = "I am tired of maintaining self-hosted open source tools.";
const reply: NonNullable<CurrentModerationMessage["preview"]> = [{
  kind: "reply", origin: "same_chat", sourceKind: "channel", sourceAuthor: "other_author",
  isForwarded: false, text: heartSource, embeddedLinks: [],
}];
const heart: CurrentModerationMessage = { text: "🤎", embeddedLinks: [], isForwarded: false };
export const heartFixtures: { id: string; message: CurrentModerationMessage; shouldDelete: boolean }[] = [
  { id: "title-only", message: { ...heart, senderProfile: { personalChannel: { title: heartTitle } }, preview: reply }, shouldDelete: false },
  { id: "no-profile", message: { ...heart, preview: reply }, shouldDelete: false },
  { id: "ordinary-channel", message: { ...heart, senderProfile: { personalChannel: { title: "Private family notes" } }, preview: reply }, shouldDelete: false },
  { id: "explicit-description-standalone", message: { ...heart, senderProfile: explicitHeartProfile }, shouldDelete: true },
  { id: "explicit-description-reply", message: { ...heart, senderProfile: explicitHeartProfile, preview: reply }, shouldDelete: true },
  { id: "explicit-description-unknown-source", message: { ...heart, senderProfile: explicitHeartProfile, preview: [{ ...reply[0]!, sourceAuthor: "unknown", isForwarded: true }] }, shouldDelete: true },
  { id: "explicit-bio-reply", message: { ...heart, senderProfile: { bio: explicitHeartProfile.personalChannel!.description }, preview: reply }, shouldDelete: true },
  { id: "substantive-owner", message: { ...heart, text: "The 429 response is rate limiting; exponential backoff fixes the retry loop.", senderProfile: explicitHeartProfile, preview: reply }, shouldDelete: false },
  { id: "requested-heart", message: { ...heart, senderProfile: explicitHeartProfile, preview: [{ ...reply[0]!, sourceKind: "user", text: "Please reply with a brown heart to confirm that you received this." }] }, shouldDelete: false },
  { id: "requested-sticker", message: { ...heart, text: "", mediaOnly: true, senderProfile: explicitHeartProfile, preview: [{ ...reply[0]!, sourceKind: "user", text: "Please send the heart sticker from your pack." }] }, shouldDelete: false },
];
