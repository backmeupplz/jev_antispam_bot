import type { CurrentModerationMessage, SenderProfile } from "../spam";

export const adultProfile: SenderProfile = {
  personalChannel: {
    title: "💦🍑 Full Heat",
    description: "🎞️💎 Private access to my videos. Registration required.",
  },
};

export const profileBaitMessages: CurrentModerationMessage[] = [
  { text: "❤️", embeddedLinks: [], isForwarded: true, senderProfile: adultProfile },
  {
    text: "This looks amazing, thanks for sharing!",
    embeddedLinks: [],
    isForwarded: false,
    senderProfile: adultProfile,
  },
];

export const profileBaitControls: CurrentModerationMessage[] = [
  {
    text: "❤️",
    embeddedLinks: [],
    isForwarded: false,
    senderProfile: {
      bio: "Travel photographer",
      personalChannel: { title: "Weekend hikes", description: "Landscapes and trail notes" },
    },
  },
  {
    text: "The API returns 429 after 30 requests; exponential backoff fixed it.",
    embeddedLinks: [],
    isForwarded: false,
    senderProfile: adultProfile,
  },
  {
    text: "This profile is advertising private adult videos; please report it.",
    embeddedLinks: [],
    isForwarded: false,
  },
  { text: "Thanks!", embeddedLinks: [], isForwarded: false },
];
