// Synthetic links; original invite transcription and destination identity are not required.
export const invite = "https://t.me/+ExampleInviteAbc123";
export const caption = `Kontaktiere den Administrator unten 👇👇\n${invite}\n${invite}`;
export const invitePositives = [
  { id: "bare", text: invite },
  { id: "joinchat", text: "https://t.me/joinchat/ExampleInviteAbc123" },
  { id: "public", text: "https://t.me/ExampleCommunity" },
  { id: "caption-de", text: caption },
  { id: "caption-en", text: `Contact the administrator below 👇\n${invite}` },
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
