import type { Message } from "grammy/types";
import type { ModerationMessage } from "../spam";

// Synthetic links; the reported invite transcription/destination identity is not committed.
export const invite = "https://t.me/+ExampleInviteAbc123";
export const caption = `Kontaktiere den Administrator unten 👇👇\n${invite}\n${invite}`;

// Minimal CTA cannot recover another actor’s omitted request either.
export const inviteAmbiguousCaptions = [
  { id: "caption-de", text: caption },
  { id: "caption-en", text: `Contact the administrator below 👇\n${invite}` },
];

// Repetition cannot recover another actor's omitted request. These are ambiguous keeps.
export const inviteRepeats = [
  { id: "repeated-bare", text: invite, recent: [{ text: invite, embeddedLinks: [], isForwarded: false }] },
  { id: "repeated-public", text: "https://t.me/ExampleCommunity", recent: [{ text: "https://t.me/ExampleCommunity", embeddedLinks: [], isForwarded: false }] },
  { id: "repeated-joinchat", text: "https://t.me/joinchat/ExampleInviteAbc123", recent: [{ text: "https://t.me/joinchat/ExampleInviteAbc123", embeddedLinks: [], isForwarded: false }] },
];

export const inviteCampaigns = [{
  id: "explicit-promotion-with-unrelated-prefix",
  text: invite,
  recent: [
    { text: "The library closes at six today.", embeddedLinks: [], isForwarded: false },
    { text: `Earn guaranteed easy money every day! Join my earning group: ${invite}`, embeddedLinks: [], isForwarded: false },
  ],
}];

// A single unrequested drop and a requested reply are textually identical without reply context;
// this input cannot distinguish them, so they must stay below the gate (GEN32 owns reply input).
export const inviteAmbiguousBare = [
  { id: "bare", text: invite },
  { id: "joinchat", text: "https://t.me/joinchat/ExampleInviteAbc123" },
  { id: "public", text: "https://t.me/ExampleCommunity" },
];

export const inviteControls = [
  { id: "requested", text: `You asked for the study-group invite: ${invite}` },
  { id: "coordination", text: `Here is the invite to our existing study group for tomorrow, as discussed: ${invite}` },
  { id: "support", text: `As requested, contact our group administrator for support here: ${invite}` },
  { id: "warning", text: `Warning: do not join this unsolicited group: ${invite}` },
  { id: "report", text: `Here is another one, which was not recognized — only the link was sent: ${invite}` },
  { id: "combined-report", text: `Also this one was not recognized as spam...\n${caption}` },
  { id: "docs", text: `Documentation for Telegram invite links: https://core.telegram.org/api/invites` },
  { id: "benign-url", text: `https://example.org/guide` },
  { id: "public-source", text: `Source for this discussion: https://t.me/ExampleCommunity/10` },
];

// GEN32 owns shared reply context. These are real requested replies, not inline disclaimers.
export const requestedAdminReplies = [
  { id: "requested-admin-de", text: caption, request: "Wen soll ich kontaktieren, um unserer Lerngruppe beizutreten? Bitte schicke den Kontakt zum Administrator." },
  { id: "requested-admin-en", text: `Contact the administrator below 👇\n${invite}`, request: "Who should I contact to join our study group? Please send the admin contact." },
].map(({ id, text, request }) => ({ id, input: {
  message_id: 2, date: 1, chat: { id: -1001, type: "supergroup", title: "Fixture" },
  from: { id: 12, is_bot: false, first_name: "Helper" }, text,
  reply_to_message: { message_id: 1, date: 1, chat: { id: -1001, type: "supergroup", title: "Fixture" },
    from: { id: 13, is_bot: false, first_name: "Requester" }, text: request },
} as Message }));

const hiddenLabel = "Kontaktiere den Administrator unten 👇👇";
const hiddenEntity = { type: "text_link", offset: 0, length: hiddenLabel.length, url: invite };
const video = { file_id: "fixture", file_unique_id: "fixture", width: 10, height: 10, duration: 25 };
export const inviteNormalizedCases: { id: string; input: Message; deleteIt: boolean; recent?: ModerationMessage[] }[] = [
  ...requestedAdminReplies.map(f => ({ ...f, deleteIt: false })),
  ...[false, true].map(forwarded => ({ id: `ambiguous-caption-de-forwarded-${forwarded}`, deleteIt: false,
    input: { caption, video, ...(forwarded ? { forward_origin: { type: "hidden_user", sender_user_name: "Fixture", date: 1 } } : {}) } as Message })),
  ...[false, true].flatMap(isCaption => {
    const input = (isCaption ? { caption: hiddenLabel, caption_entities: [hiddenEntity], video }
      : { text: hiddenLabel, entities: [hiddenEntity] }) as Message;
    return [
      { id: `hidden-${isCaption ? "caption" : "text"}-ambiguous-control`, input, deleteIt: false },
      { id: `hidden-${isCaption ? "caption" : "text"}-promotional-context`, input, deleteIt: true, recent: inviteCampaigns[0]!.recent },
    ];
  }),
  { id: "german-exact-caption-warning", deleteIt: false,
    input: { text: `Warnung vor Spam: Nicht beitreten! Diese Nachricht ist verdächtig: „${caption}“` } as Message },
];
