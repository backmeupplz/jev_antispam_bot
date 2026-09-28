import type { Message } from "grammy/types";
import type { CurrentModerationMessage, ModerationMessage } from "../spam";

// Synthetic policy fixtures, not transcriptions of the uncorrelated hearts report.
export const mediaProfile = { personalChannel: {
  title: "Full Access", description: "Private videos. Register for paid access.",
} };
export const mediaAccusation = "Stop spamming these heart stickers to advertise your paid private-video signup channel. Nobody requested your promotion here.";
export const mediaCampaign = "I am posting these stickers here to advertise my paid private-video channel. Open my profile and register for paid access; this is an unsolicited promotion.";

export const mediaFixtures = [
  { id: "requested screenshot", source: "Can you share a screenshot of the app error so we can debug it?", author: "other_author", shouldDelete: false },
  { id: "requested video", source: "Please send a video of the app error so we can debug it.", author: "other_author", shouldDelete: false },
  { id: "requested sticker", source: "Please send the heart sticker we were discussing.", author: "other_author", shouldDelete: false },
  { id: "ambiguous standalone media", shouldDelete: false },
  // An accusation is attributed to somebody else, not a confession by the sender.
  { id: "uncorroborated third-party accusation", source: mediaAccusation, author: "other_author", shouldDelete: false },
  { id: "same-actor campaign reply", source: mediaCampaign, author: "same_author", shouldDelete: true },
  { id: "same-actor campaign history", recent: [{ text: mediaCampaign, embeddedLinks: [], isForwarded: false }], shouldDelete: true },
] satisfies { id: string; source?: string; author?: "other_author" | "same_author"; recent?: ModerationMessage[]; shouldDelete: boolean }[];

export function mediaMessage(fixture: typeof mediaFixtures[number], isForwarded = false): CurrentModerationMessage {
  return { text: "", embeddedLinks: [], isForwarded, mediaOnly: true, senderProfile: mediaProfile,
    ...(fixture.source ? { preview: [{ kind: "reply", origin: "same_chat", sourceKind: "user",
      sourceAuthor: fixture.author!, isForwarded: false, text: fixture.source, embeddedLinks: [],
    }] } : {}),
  };
}

// Telegram-shaped inputs let handler/normalization tests check the same live projection.
export function mediaUpdate(fixture: typeof mediaFixtures[number], isForwarded = false): Message {
  const chat = { id: -1001, type: "supergroup" as const, title: "Fixture group" };
  const from = { id: 12, is_bot: false, first_name: "Fixture sender" };
  return { message_id: 100, date: 1, chat, from,
    sticker: { file_id: "fixture", file_unique_id: "fixture", type: "regular", width: 48, height: 48, is_animated: false, is_video: false },
    ...(isForwarded ? { forward_origin: { type: "user" as const, sender_user: { ...from, id: 765432109 }, date: 1 } } : {}),
    ...(fixture.source ? { reply_to_message: { message_id: 900, date: 1, chat,
      from: { ...from, id: fixture.author === "same_author" ? 12 : 13 }, text: fixture.source,
    } } : {}),
  } as Message;
}
