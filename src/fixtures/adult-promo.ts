// #145: explicit adult-content promotion with a button/site/bot/DM funnel. The incident text is from Nikita's screenshot
// (Telegram msg 23727); its five URL buttons' targets were not visible, so the buttons below are SYNTHETIC placeholders.
import type { InlineUrlButton } from "../inline-buttons";

export const adultPromoIncident = "🔞 XxX unlim p0rn content 😏\n\nPrivate rooms · full-length scenes · face cam · new drops · no blur in app — pick a door below.\n\n⤵️ Tap a button - open site - open bot and get xXx c0ntent ⤵️";
export const adultPromoIncidentButtons: InlineUrlButton[] = ["Free Preview — Watch HD", "Tonight's Drop — Open", "Private Room — Enter",
  "Full Length — Play Now", "OPEN FULL VAULT — FREE"].map((text, i) => ({ kind: "url", text, url: `https://example.invalid/door/${i}` }));

// Held out: written before the rule was tuned, not copied from the incident.
export const adultPromoParaphrases = [
  "🔥 Free p0rn videos every night, link in bio 💋",
  "Best NSFW channel on Telegram, join now t.me/+AbCdEf123",
  "Hot leaked nudes of TikTok girls 💦 open the bot @leakvaultbot",
  "OnlyFans content for free — click the link below 👇",
  "XXX videos uncensored, full access in our app, tap the button",
  "18+ content without limits. Subscribe: t.me/hot_drops_18",
  "Порно без цензуры 🔞 жми на кнопку ниже",
  "Слив нюдсов блогерш — переходи по ссылке в профиле",
  "Лучший порно бот @hotvideo_ru_bot 🥵",
  "🔞 Секс видео и приватные комнаты, ссылка ниже ⬇️",
  "Cam girls live 24/7, private rooms, no blur — pick a room below",
  "Hentai collection 4K, DM me for access",
  "Эротик видео 18+ 💋 пиши в лс",
  "sex chat with real girls, write me in private",
  "Private rooms · face cam · full-length scenes — open the app below",
];

// Must stay kept: warnings and reports, moderation and rule reminders quoting such posts, sex-ed, health and news,
// jokes or slang without a funnel, complaints about adult bots.
export const adultPromoControls = [
  "someone posted porn spam here, admins?",
  "Admins, there is a porn bot in the chat again, please ban it",
  "Опять кто-то кидает порно ссылки в чат, админы удалите",
  "Этот бот опять прислал порно, куда жаловаться?",
  "He was promoting 18+ content and got banned",
  "Reminder: porn, nudes and NSFW links are not allowed here and will be removed",
  "Правила чата: порно и 18+ контент запрещены, за ссылки бан",
  "No porn, no spam, just memes. Join @memes_daily",
  "Без порно и спама, только мемы. Подписывайтесь на канал @memes_ru",
  "Porn addiction support group meets on Thursdays, join us at t.me/recovery_circle",
  "Новый закон о блокировке порно сайтов, подробнее в статье https://example.com/news",
  "Study: teens see porn earlier than parents think https://example.com/article",
  "Sex education for teenagers matters. Our clinic runs a free class, link below",
  "lol send nudes 😂",
  "this chat is pure porn for memes enjoyers 😂",
  "these porn bots are everywhere, so annoying",
  "Why do I keep getting porn bot DMs? Tired of this",
  "Кто-то знает, как заблокировать порно ботов в личке? Надоели",
  "Don't click links from porn bots, they steal accounts",
  "@vasya, did you see the porn bot here? lol",
  "XXX-XXX is the template for the phone number field, see the link below",
  "Rent is $XXX per month, DM me for details",
  "This is a nude lipstick shade, link in bio",
  "Private rooms available at our hostel, book via the link below",
  "Stream with face cam today, join the channel t.me/gaming_stream",
];
