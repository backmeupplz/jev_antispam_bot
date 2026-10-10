import type { Message } from "grammy/types";
import { hiringRequest, recruitmentReply } from "./recruitment-replies";

// Synthetic reconstruction, NOT the original Telegram payload or an incident replay.
// Spacing, punctuation and reply sources are deliberately explicit fixture choices.
export const weekendOffer = "Добрый День, нужны люди на выходные дни ,есть подработка - платим в день 4 тысячи,оплата сразу после смены\nПо всем вопросам писать мне";
export const weekendAnnouncement = "$veydrift is coming, the token for my onchain space game. Explore planets, build fleets and trade resources with other players. This is a game development update, not a jobs thread.";
export const weekendSources = {
  // Manually reconstructed visible fragment; ellipsis is source content, NOT model truncation.
  visible: "$veydrift is coming, the token for my onchain space gam...",
  short: weekendAnnouncement,
  // Artificial repetition/cut to match a structural length, not recovered source text.
  long: weekendAnnouncement.repeat(5).slice(0, 766),
  requested: hiringRequest,
};
export const LAYA_DIAGNOSTIC_THRESHOLD = 0.80;
export const RECORDED_LAYA_MODEL = "laya-jev-ckpt-v2";

export type WeekendFixture = {
  id: string;
  synthetic: true;
  sourceForm: "absent" | "reconstructed-visible-fragment" | "synthetic-short" | "synthetic-766-cut" | "synthetic-request" | "synthetic-offer";
  raw: Message;
  recent: Message[];
  expectedDelete: boolean;
  expectedContextLinks: boolean[];
  recordedProbability?: number;
};

function fixture(id: string, text: string, source: string | undefined,
  sourceForm: WeekendFixture["sourceForm"], expectedDelete: boolean, recordedProbability: number): WeekendFixture {
  const raw = recruitmentReply(text, source);
  if (id.startsWith("unrelated")) raw.reply_to_message!.forward_origin = {
    type: "channel", date: 1, chat: { id: -1002, type: "channel", title: "Synthetic announcement" }, message_id: 500,
  };
  // Real Telegram entity fields (UTF-16 offsets); formatting changes no normalized words.
  if (raw.reply_to_message && "text" in raw.reply_to_message) {
    raw.reply_to_message.entities = [{ type: "bold", offset: 0, length: 1 }];
  }
  return { id, synthetic: true, sourceForm, raw, recent: [], expectedDelete, expectedContextLinks: [], recordedProbability };
}

export const weekendFixtures: WeekendFixture[] = [
  fixture("standalone", weekendOffer, undefined, "absent", true, .9171),
  fixture("unrelated-visible", weekendOffer, weekendSources.visible, "reconstructed-visible-fragment", true, .8083),
  fixture("unrelated-short", weekendOffer, weekendSources.short, "synthetic-short", true, .8583),
  fixture("unrelated-766", weekendOffer, weekendSources.long, "synthetic-766-cut", true, .8881),
  fixture("requested", weekendOffer, weekendSources.requested, "synthetic-request", false, .8147),
  fixture("warning", "Осторожно, мошенники рассылают это предложение. Не пишите им и не переводите деньги.", weekendOffer, "synthetic-offer", false, .6469),
  fixture("report", "Модераторы, удалите этот спам с предложением работы.", weekendOffer, "synthetic-offer", false, .7104),
  fixture("volunteer", "Нужны волонтёры на выходные для уборки парка. Оплаты нет, пишите мне.", undefined, "absent", false, .8195),
  fixture("job-seeker", "Ищу подработку на выходные, могу выйти на смену.", undefined, "absent", false, .3984),
  fixture("agreed", "Подтверждаю нашу договорённость: выйду в субботу, оплата после смены.", undefined, "absent", false, .1782),
  fixture("wages", "У нас за смену платят четыре тысячи. Какая средняя зарплата в городе?", undefined, "absent", false, .1092),
];

const byId = (id: string) => weekendFixtures.find(item => item.id === id)!;
const withId = (id: string, messageId: number) => ({ ...structuredClone(byId(id).raw), message_id: messageId });
// Additional synthetic history controls: not part of the recorded scalar measurements.
export const weekendHistoryFixtures: WeekendFixture[] = [
  { id: "mixed-history", synthetic: true, sourceForm: "synthetic-short", raw: withId("unrelated-short", 103),
    recent: [withId("requested", 100), withId("unrelated-visible", 101), withId("unrelated-short", 102)],
    expectedDelete: true, expectedContextLinks: [false, true, true] },
  { id: "requested-history", synthetic: true, sourceForm: "synthetic-request", raw: withId("requested", 103),
    recent: [withId("requested", 100), withId("requested", 101)],
    expectedDelete: false, expectedContextLinks: [false, false] },
];
