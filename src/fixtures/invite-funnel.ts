// Synthetic links; the reported invite transcription/destination identity is not committed.
export const invite = "https://t.me/+ExampleInviteAbc123";
export const caption = `Kontaktiere den Administrator unten 👇👇\n${invite}\n${invite}`;

// Shapes with distinguishing evidence: minimal contact-admin CTA (any language).
export const invitePositives = [
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
