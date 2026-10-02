import type { Message } from "grammy/types";
// Screenshot reconstruction, NOT original Telegram whitespace/message identity.
// Actual screenshot target is unknown; this reserved URL is synthetic only.
export const buttonAd = "V I P ❌❌❌\n i. HARDCORE 👀\n ii. HOMEMADE 📹\n iii. CASTING 🎬\n iv. MASSAGE 🥵\n v. SPY CAM 📸";
export const unknownButtonUrl = "https://example.invalid/test-only-unknown-button-destination";
export const adKeyboard = { inline_keyboard: [[{ text: "👉 CLICK HERE 👈", url: unknownButtonUrl }]] };
export const warningText = "Warning: this is an example of adult-content spam. Do not click the button. " + buttonAd;
export const buttonCases = [
  { id: "forwarded-text", text: buttonAd, delete: true },
  { id: "forwarded-caption", text: buttonAd, caption: true, delete: true },
  { id: "warning-original-failing-control", text: warningText, delete: false },
  { id: "report", text: "Moderators, this spam passed the filter. Please investigate: " + buttonAd, delete: false },
  { id: "support", text: "Here is the official support page you asked for.", label: "Support", url: "https://example.invalid/support", delete: false },
  { id: "docs", text: "API documentation for the function we are discussing.", label: "Documentation", url: "https://example.invalid/docs", delete: false },
  { id: "event", text: "Our book club meets at the library tomorrow, as agreed.", label: "Event details", url: "https://example.invalid/event", delete: false },
];
export function buttonMessage(fixture: typeof buttonCases[number]): Message {
  return { message_id: 1, date: 1, chat: { id: -1001, type: "supergroup", title: "Fixture" },
    from: { id: 12, is_bot: false, first_name: "Fixture" },
    forward_origin: { type: "channel", date: 1, chat: { id: -2001, type: "channel", title: "Original source" }, message_id: 50 },
    ...(fixture.caption ? { caption: fixture.text, video: { file_id: "fixture", file_unique_id: "fixture", duration: 1, width: 1, height: 1 } } : { text: fixture.text }),
    reply_markup: { inline_keyboard: [[{ text: fixture.label ?? "👉 CLICK HERE 👈", url: fixture.url ?? unknownButtonUrl }]] },
  } as Message;
}
