import type { Message } from "grammy/types";

// Synthetic comparison set, NOT a transcription or exact attribution of topic4041081 #21217.
export const previewAdText = "WORLD SHOP-BOT offers automated sales 24/7 and a recharge bonus. Contact @example_support to buy or recharge.";
const chat = { id: -10037, type: "supergroup" as const, title: "Synthetic evaluation" };
const actor = { id: 37, is_bot: false, first_name: "Current" };
const other = { id: 38, is_bot: false, first_name: "Source" };

export function previewMessage(text: string, messageId = 100, sourceText?: string): Message.TextMessage {
  return { message_id: messageId, date: 1, chat, from: actor, text,
    ...(sourceText === undefined ? {} : { reply_to_message: {
      message_id: 900, date: 1, chat, from: other, text: sourceText, reply_to_message: undefined,
    } }),
  };
}

function adReply(text: string, messageId = 100): Message.TextMessage {
  const message = previewMessage(text, messageId, previewAdText);
  message.reply_to_message!.forward_origin = { type: "hidden_user", sender_user_name: "Synthetic advertiser", date: 1 };
  return message;
}

export type PreviewFixture = {
  id: string;
  intent: "ambiguous" | "promotion" | "control";
  message: Message.TextMessage;
  recent: Message.TextMessage[];
};

export const previewFixtures: PreviewFixture[] = [
  ...["666", "Nice!", "👍", "Great deal!"].map((text, index): PreviewFixture => ({
    id: ["reported-style-666", "short-nice", "short-emoji", "short-deal"][index]!,
    intent: "ambiguous", message: adReply(text), recent: [],
  })),
  { id: "explicit-endorsement", intent: "promotion", message: adReply("I recommend this shop: buy through the bot above and claim the recharge bonus!"), recent: [] },
  ...[
    ["report-to-mods", "Mods, please remove this spam."],
    ["warning", "Warning: this is a scam. Do not contact them or pay."],
    ["criticism", "These constant shop ads are unwelcome here."],
    ["verification", "Is this a scam? Can anyone verify this claim?"],
    ["discussion-citation", "This is an example of advertising language for our discussion of spam detection."],
  ].map(([id, text]): PreviewFixture => ({ id: id!, intent: "control", message: adReply(text!), recent: [] })),
  { id: "requested-recommendation", intent: "control", message: previewMessage("I have used Example Shop for stationery; it worked for my order.", 100, "Can someone recommend a stationery shop they have actually used?"), recent: [] },
  { id: "ordinary-666", intent: "control", message: previewMessage("666", 100, "Nice game yesterday"), recent: [] },
  { id: "standalone-666", intent: "control", message: previewMessage("666"), recent: [] },
  { id: "inaccessible-source", intent: "control", message: { ...previewMessage("666"), external_reply: {
    origin: { type: "hidden_user", sender_user_name: "Unavailable", date: 1 },
  } }, recent: [] },
  { id: "mixed-history", intent: "promotion", message: adReply("Buy through this bot today to get the bonus!"), recent: [
    previewMessage("I have used Example Shop for stationery; it worked for my order.", 10, "Can someone recommend a stationery shop they have actually used?"),
    adReply("This shop has a recharge bonus, buy through the bot!", 11),
  ] },
  { id: "historical-ad-current-warning", intent: "control", message: adReply("I was mistaken earlier. This is a scam; do not pay."), recent: [adReply("Nice!", 11)] },
];
