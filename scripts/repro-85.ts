// SYNTHETIC #85 reconstruction of the investment-testimonial funnel and its
// nearest legitimate controls, scored through the real bot normalization
// (toModerationMessage), the real t.me destination enrichment (fixture page) and
// JevSpamClassifier against a Jev-compatible endpoint.
// Usage: JEV_URL=http://127.0.0.1:8885/v1/systemone PAGE=wealthx.html [PROMPTS=a,b] bun scripts/repro-85.ts
// PAGE is the public https://t.me/WealthXMarkets HTML; other t.me pages are unavailable.
// PROMPTS sends an X-Prompt header understood only by a local sweep harness.
import type { Message, MessageEntity } from "grammy/types";
import { toModerationMessage } from "../src/message";
import { JevSpamClassifier, type CurrentModerationMessage, type ModerationMessage } from "../src/spam";
import { TelegramPreviewCache } from "../src/telegram-preview";

const url = process.env.JEV_URL ?? "http://127.0.0.1:8885/v1/systemone";
const model = process.env.JEV_MODEL ?? "laya-jev-ckpt-v2-examples-856e52e3";
const prompts = (process.env.PROMPTS ?? "default").split(",");
const page = process.env.PAGE ? await Bun.file(process.env.PAGE).text() : undefined;
const destinations = new TelegramPreviewCache({ request: async (target) => target === "https://t.me/wealthxmarkets" && page
  ? { status: 200, headers: { "content-type": "text/html; charset=utf-8" }, body: page }
  : { status: 404, headers: {}, body: "" } });
const chat = { id: -1001, type: "supergroup" as const, title: "Synthetic chat" };
const channel = { id: -1003, type: "channel" as const, title: "Synthetic channel" };
const link = "https://t.me/WealthXMarkets";
// Screenshot transcription: 387 UTF-16 chars (incident log: 388, so one invisible char may differ).
export const testimonial = "I never knew trading pays massively until I meet a channel that introduced me to sir Charles Johnson who turned my $200 to $65,071  within 48 hours of trading with him, I never believe my eyes until i received it in my account.\nI advise anyone having difficulty in trading to contact him and earn massively...\nClick the link below and thank me later\n👇👇👇👇\n\n" + link;

function urlEntities(text: string): MessageEntity[] {
  return [...text.matchAll(/https:\/\/\S+/g)].map(m => ({ type: "url", offset: m.index!, length: m[0].length }));
}
function user(text: string, id: number, from = 12): Message {
  return { message_id: id, date: 0, chat, from: { id: from, is_bot: false, first_name: "U" + from }, text,
    ...(urlEntities(text).length ? { entities: urlEntities(text) } : {}) } as Message;
}
function channelPost(text: string, id: number): Message {
  return { message_id: id, date: 0, chat, sender_chat: channel, is_automatic_forward: true,
    forward_origin: { type: "channel", chat: channel, message_id: id, date: 0 }, text } as unknown as Message;
}
// Mirrors bot.ts: normalize, then attach current-message t.me destination previews.
async function msg(text: string, id: number, opts: { replyTo?: Message; enrich?: boolean } = {}): Promise<CurrentModerationMessage> {
  const raw = { ...user(text, id), ...(opts.replyTo ? { reply_to_message: opts.replyTo } : {}) } as Message;
  const m: CurrentModerationMessage = toModerationMessage(raw)!;
  const previews = opts.enrich === false ? [] : await destinations.enrich(raw);
  return previews.length ? { ...m, destinationPreviews: previews } : m;
}

type Case = { id: string; expected: "spam" | "keep"; message: CurrentModerationMessage; history?: ModerationMessage[] };
const post = channelPost("Bitcoin is back above $60k this morning. What are you watching this week?", 100);
const cases: Case[] = [
  { id: "T incident: standalone + available preview", expected: "spam", message: await msg(testimonial, 1) },
  { id: "T incident text, no preview", expected: "spam", message: await msg(testimonial, 2, { enrich: false }) },
  { id: "T 388-char rendering + preview", expected: "spam", message: await msg(testimonial.replace("massively...", "massively... "), 3) },
  { id: "T reply to channel post + preview", expected: "spam", message: await msg(testimonial, 4, { replyTo: post }) },
  { id: "T variant crypto @username", expected: "spam", message: await msg("Honestly I was skeptical at first but Mrs Linda Parker helped me grow my 0.05 BTC into 1.2 BTC in just one week with her strategy. She is real and trustworthy, reach out to her on @LindaParkerFX and thank me later!", 5) },
  { id: "T variant forex link", expected: "spam", message: await msg("God bless Mr Daniel Hart! I invested $500 with him on Monday and today I withdrew $11,400 profit. Anyone who wants financial freedom should message him now https://t.me/DanielHartTrades", 6) },
  { id: "T variant ru", expected: "spam", message: await msg("Никогда не думала, что трейдинг может так платить, пока не познакомилась с Александром — за 3 дня он превратил мои 10 000 ₽ в 320 000 ₽. Пишите ему, не пожалеете 👉 https://t.me/AlexInvestPro", 7) },
  { id: "T variant account manager", expected: "spam", message: await msg("I was losing money for months until a friend connected me with an account manager at a trading company. In 5 days my $1,000 became $23,500 and I withdrew everything. Don't miss this chance, write to @CryptoMaxSupport and tell him I sent you.", 8) },
  { id: "T variant es", expected: "spam", message: await msg("Gracias a la señora Valeria mis 300 dólares se convirtieron en 9.800 en solo 3 días. Si quieres ganar como yo, escríbele ya 👉 https://t.me/ValeriaInversiones", 9) },
  // Controls
  { id: "C trading results reply", expected: "keep", message: await msg("Finally closed my ETH position, turned $2k into about $2.6k over three months. Not huge but I'll take it, still learning risk management.", 20, { replyTo: user("How are everyone's trades going this quarter?", 200, 40) }) },
  { id: "C trading results standalone", expected: "keep", message: await msg("Down 12% this month after that liquidation cascade. Lesson learned: no more 20x leverage for me.", 21) },
  { id: "C asking for advice", expected: "keep", message: await msg("Has anyone here actually made money with a trading mentor or signal channel? I have $200 to start and don't want to get scammed, what would you recommend?", 22) },
  { id: "C warning exact scam + preview", expected: "keep", message: await msg("Careful everyone, there's a message going around saying 'sir Charles Johnson turned my $200 to $65,071 within 48 hours, contact him' with a link to " + link + ". It's a scam, nobody doubles money like that, don't contact them.", 23) },
  { id: "C member report reply", expected: "keep", message: await msg("wasn't recognized and passed through", 24, { replyTo: user(testimonial, 1, 13) }) },
  { id: "C quoted full report + preview", expected: "keep", message: await msg("This wasn't recognized and passed through: «" + testimonial + "»", 25) },
  { id: "C requested channel rec + preview", expected: "keep", message: await msg("I follow " + link + ", their daily market summaries are decent, but don't pay anyone for signals.", 26, { replyTo: user("Can anyone recommend a Telegram channel with good daily market news?", 201, 41) }) },
  { id: "C success story no funnel", expected: "keep", message: await msg("I started learning trading last year with free YouTube videos and now make a small side income. It takes a lot of patience, most people lose money at first.", 27) },
  { id: "C requested recommendation of a trader", expected: "keep", message: await msg("My cousin uses a licensed advisor at his bank, returns are boring but steady. Ask your bank, don't trust anyone promising 10x.", 29, { replyTo: user("Does anyone know a trustworthy financial advisor? I don't want to lose my savings.", 202, 42) }) },
  { id: "C scam victim story", expected: "keep", message: await msg("A guy on Telegram promised to turn my $200 into $5,000 in a week. I sent the money and he blocked me. Please don't fall for these 'account managers'.", 30) },
  { id: "C thanks member", expected: "keep", message: await msg("Big thanks to Alex from this chat who explained stop losses to me last week, it saved me from a nasty loss today.", 28) },
];

const classifiers = Object.fromEntries(prompts.map(p => [p, new JevSpamClassifier("", { model, threshold: 0.8, timeoutMs: 60_000, url,
  fetch: (input, init) => fetch(input, { ...init, headers: { ...(init?.headers as Record<string, string>), "X-Prompt": p } }) })]));
const rows: Record<string, unknown>[] = [];
for (const c of cases) {
  const row: Record<string, unknown> = { id: c.id, expected: c.expected, previews: c.message.destinationPreviews?.map(p => p.status) ?? [] };
  for (const p of prompts) {
    const r = await classifiers[p]!.classify(c.message, c.history ?? []);
    row[p] = Math.round(r.probability * 1e4) / 1e4;
  }
  rows.push(row);
  console.log(JSON.stringify(row));
}
if (process.env.OUT) await Bun.write(process.env.OUT, JSON.stringify(rows, null, 2));
