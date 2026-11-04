import type { Message } from "grammy/types";
// #428: uncaptioned media whose only words are its URL buttons. Labels follow the
// reported screenshot (a picture with 13 "airdrop"/"bonus" buttons, posted as a
// reply); every URL is a synthetic reserved address, NOT the real destination.
export type MediaButtonCase = {
  id: string;
  delete: boolean;
  from: "bot" | "human";
  media: "photo" | "sticker" | "video" | "animation";
  buttons: { text: string; url: string }[];
  forwarded?: boolean;
  reply?: string;
};
const ad = (path: string) => `https://claim-rewards.example/${path}`;
export const airdropButtons = [
  { text: "BINANCE", url: ad("binance") },
  { text: "WALLET", url: ad("wallet") },
  { text: "BINANCE AIRDROP", url: ad("airdrop") },
  { text: "CLAIM $100 BONUS", url: ad("claim-100") },
  { text: "WELCOME BONUS", url: ad("welcome") },
  { text: "TELEGRAM × BINANCE", url: ad("telegram-binance") },
];
export const mediaButtonCases: MediaButtonCase[] = [
  { id: "incident-bot-reply", delete: true, from: "bot", media: "photo", buttons: airdropButtons,
    reply: "Has anyone finished the new research tree yet?" },
  { id: "incident-human", delete: true, from: "human", media: "photo", buttons: airdropButtons },
  { id: "game-bot-play", delete: false, from: "bot", media: "photo",
    buttons: [{ text: "Play", url: "https://t.me/fixture_game_bot?startapp=play" }] },
  { id: "utility-bot-open", delete: false, from: "bot", media: "photo",
    buttons: [{ text: "Open", url: "https://example.invalid/app/dashboard" }] },
  { id: "member-docs", delete: false, from: "human", media: "photo", forwarded: true,
    buttons: [{ text: "Documentation", url: "https://example.invalid/docs/getting-started" }] },
  { id: "member-link-reply", delete: false, from: "human", media: "photo",
    buttons: [{ text: "Read the article", url: "https://example.invalid/news/patch-notes" }],
    reply: "Where can I read about the new patch?" },
  { id: "casino-bonus-bot", delete: true, from: "bot", media: "animation", buttons: [
    { text: "🎰 500 FREE SPINS", url: "https://lucky-spins.example/free" },
    { text: "💰 200% DEPOSIT BONUS", url: "https://lucky-spins.example/bonus" },
    { text: "PLAY NOW", url: "https://lucky-spins.example/play" }] },
  { id: "usdt-giveaway-human", delete: true, from: "human", media: "photo", buttons: [
    { text: "🎁 FREE 50 USDT", url: "https://usdt-drop.example/claim" },
    { text: "CONNECT WALLET", url: "https://usdt-drop.example/connect" },
    { text: "CLAIM NOW", url: "https://usdt-drop.example/now" }] },
  { id: "ru-airdrop-bot", delete: true, from: "bot", media: "photo", buttons: [
    { text: "🎁 ПОЛУЧИТЬ АИРДРОП", url: "https://claim-rewards.example/ru" },
    { text: "БОНУС 100$", url: "https://claim-rewards.example/ru-bonus" },
    { text: "КОШЕЛЁК", url: "https://claim-rewards.example/ru-wallet" }] },
  { id: "game-bot-menu", delete: false, from: "bot", media: "photo", buttons: [
    { text: "▶️ Play", url: "https://t.me/fixture_game_bot?startapp=play" },
    { text: "🏆 Leaderboard", url: "https://t.me/fixture_game_bot?startapp=top" },
    { text: "📖 Rules", url: "https://example.invalid/game/rules" }] },
  { id: "sticker-pack", delete: false, from: "human", media: "sticker",
    buttons: [{ text: "Add sticker pack", url: "https://t.me/addstickers/FixturePack" }] },
  { id: "news-forward", delete: false, from: "human", media: "photo", forwarded: true,
    buttons: [{ text: "Read more", url: "https://example.invalid/news/release-notes" }] },
  { id: "meetup-event", delete: false, from: "human", media: "photo",
    buttons: [{ text: "Register for the meetup", url: "https://example.invalid/events/meetup" }],
    reply: "Is there a meetup this month?" },
  { id: "ru-member-docs", delete: false, from: "human", media: "photo",
    buttons: [{ text: "Документация", url: "https://example.invalid/docs/ru" }] },
];

export function mediaButtonMessage(fixture: MediaButtonCase, chat = { id: -1001, type: "supergroup" as const, title: "Fixture" }): Message {
  const media = {
    photo: { photo: [{ file_id: "fixture", file_unique_id: "fixture", width: 1, height: 1 }] },
    sticker: { sticker: { file_id: "fixture", file_unique_id: "fixture", type: "regular", width: 1, height: 1, is_animated: false, is_video: false } },
    video: { video: { file_id: "fixture", file_unique_id: "fixture", duration: 1, width: 1, height: 1 } },
    animation: { animation: { file_id: "fixture", file_unique_id: "fixture", duration: 1, width: 1, height: 1 } },
  }[fixture.media];
  return {
    message_id: 2, date: 1, chat,
    from: fixture.from === "bot" ? { id: 87001, is_bot: true, first_name: "Fixture bot", username: "fixture_poster_bot" }
      : { id: 12, is_bot: false, first_name: "Fixture" },
    ...(fixture.forwarded ? { forward_origin: { type: "channel", date: 1, chat: { id: -2001, type: "channel", title: "Original source" }, message_id: 50 } } : {}),
    ...(fixture.reply ? { reply_to_message: { message_id: 1, date: 1, chat, from: { id: 31, is_bot: false, first_name: "Member" }, text: fixture.reply } } : {}),
    ...media,
    reply_markup: { inline_keyboard: fixture.buttons.map(({ text, url }) => [{ text, url }]) },
  } as Message;
}
