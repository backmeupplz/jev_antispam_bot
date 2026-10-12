// SYNTHETIC reconstruction of the #81 incident and controls, scored through the
// real bot normalization (toModerationMessage) and JevSpamClassifier against a
// Jev-compatible endpoint. Usage: JEV_URL=http://127.0.0.1:8811/v1/systemone bun scripts/repro-81.ts
import type { Message } from "grammy/types";
import { toModerationMessage } from "../src/message";
import { JevSpamClassifier, type ModerationMessage } from "../src/spam";

const url = process.env.JEV_URL ?? "http://127.0.0.1:8811/v1/systemone";
const model = process.env.JEV_MODEL ?? "laya-jev-ckpt-v2-examples-856e52e3";
const classifier = new JevSpamClassifier("", { model, threshold: 0.8, timeoutMs: 60_000, url });

const chat = { id: -1002, type: "supergroup" as const, title: "Synthetic discussion" };
const channel = { id: -1003, type: "channel" as const, title: "Synthetic channel" };
export const offer = "Приветствую,есть работа со свободным графиком ,и ежедневной зарплатой в 5 тысяч ,по всем вопросам писать в лс";
const posts = [
  "Абракадабра: новое видео про то, как мы собирали прототип за выходные.",
  "mesh+ теперь доступен в Play Store, ставьте и пишите отзывы.",
  "Яндекс рассказал, как отличает ботов от людей в трафике сайтов.",
];
const bio = "promises are the sweetest lies...";

function channelPost(text: string, id: number): Message {
  // Discussion-group comments reply to the channel's automatic forward.
  return { message_id: id, date: 0, chat, sender_chat: channel, is_automatic_forward: true,
    forward_origin: { type: "channel", chat: channel, message_id: id, date: 0 }, text } as unknown as Message;
}
function userMessage(text: string, id: number, from = 12): Message {
  return { message_id: id, date: 0, chat, from: { id: from, is_bot: false, first_name: "U" + from }, text } as Message;
}
function comment(text: string, id: number, replyTo?: Message, from = 12): ModerationMessage {
  return toModerationMessage({ ...userMessage(text, id, from), ...(replyTo ? { reply_to_message: replyTo } : {}) } as Message)!;
}

type Case = { id: string; expected: "spam" | "keep"; message: ModerationMessage; profile?: boolean; history?: ModerationMessage[] };
const cases: Case[] = [];
for (const profile of [false, true]) {
  const p = profile ? "+profile" : "";
  cases.push({ id: "incident standalone" + p, expected: "spam", profile, message: comment(offer, 10) });
  for (let n = 0; n <= 2; n += 1) {
    cases.push({ id: `incident channel-reply history=${n}${p}`, expected: "spam", profile,
      message: comment(offer, 10 + n, channelPost(posts[n]!, 100 + n)),
      history: Array.from({ length: n }, (_v, i) => comment(offer, 10 + i, channelPost(posts[i]!, 100 + i))) });
  }
  cases.push({ id: "incident standalone history=2" + p, expected: "spam", profile,
    message: comment(offer, 12), history: [comment(offer, 10), comment(offer, 11)] });
}
const seekerRequest = userMessage("Ищу работу со свободным графиком, может кто-то знает вакансии? Пишите", 300, 40);
const controls: [string, ModerationMessage, ModerationMessage[]?][] = [
  ["requested job offer", comment("Есть работа со свободным графиком, оплата каждый день, напишите в лс — расскажу подробнее", 20, seekerRequest)],
  ["requested job offer repeated", comment("Есть работа со свободным графиком, оплата каждый день, напишите в лс — расскажу подробнее", 22, userMessage("Тоже ищу подработку, есть что-то с ежедневной оплатой?", 302, 41)),
    [comment("Есть работа со свободным графиком, оплата каждый день, напишите в лс — расскажу подробнее", 20, seekerRequest)]],
  ["job seeker", comment("Ищу работу со свободным графиком, рассмотрю любые предложения, пишите в лс", 21, channelPost(posts[0]!, 100))],
  ["job seeker repeated", comment("Ищу работу со свободным графиком, рассмотрю любые предложения, пишите в лс", 23, channelPost(posts[1]!, 101)),
    [comment("Ищу работу со свободным графиком, рассмотрю любые предложения, пишите в лс", 21, channelPost(posts[0]!, 100))]],
  ["wage discussion", comment("У нас курьерам платят примерно 5 тысяч в день, график свободный, но к вечеру выматываешься", 24, userMessage("Сколько сейчас реально платят курьерам?", 304, 42))],
  ["warning", comment("Осторожно, тут в комментах пишут «есть работа со свободным графиком и ежедневной зарплатой в 5 тысяч, писать в лс» — это развод, не пишите им", 25, channelPost(posts[2]!, 102))],
  ["moderator report", comment("Бот это не распознал: «" + offer + "»", 26, channelPost(posts[2]!, 102))],
  ["on-topic chatter repeated", comment("Классное видео, ждём продолжение!", 27, channelPost(posts[1]!, 101)),
    [comment("Классное видео, ждём продолжение!", 28, channelPost(posts[0]!, 100))]],
];
for (const [id, message, history] of controls) cases.push({ id, expected: "keep", message, history, profile: true });

const rows = [];
for (const c of cases) {
  const input = c.profile ? { ...c.message, senderProfile: { bio } } : c.message;
  const r = await classifier.classify(input, c.history ?? []);
  const row = { id: c.id, expected: c.expected, probability: r.probability, delete: r.shouldDelete,
    contextProbabilities: r.contextProbabilities.map((p) => Math.round(p * 1e4) / 1e4), truncated: r.truncated };
  rows.push(row);
  console.log(JSON.stringify(row));
}
if (process.env.OUT) await Bun.write(process.env.OUT, JSON.stringify(rows, null, 2));
