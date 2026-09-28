import type { Message } from "grammy/types";
import { toModerationMessage } from "../message";
import { recruitmentReply } from "./recruitment-replies";

// Screenshot #21391: visible transcription, not a recovered original payload.
export const reportedCare = "Привет Всем.Завтра уезжаю на неделю и нужно посидеть с кошкой и собакой.не чего сложного. Плачу в день по 4900.Есть кто сможет ?";
export const careWhitespaceVariants = [reportedCare.replace(" ?", "?"), reportedCare.replaceAll(".", ". ")];
// Only visible truncated previews; do not reconstruct unavailable source text.
export const laptopPreview = "Video, ok another agi moment, we used to connect a laptop t...";
export const rvPreview = "while on our rv trip around bc, i kept shoving my main machin...";
export const careRequest = "Ищу оплачиваемую работу: могу посидеть с питомцами, пока хозяева в отъезде. Напишите сюда сроки и оплату.";
export const careInvitation = "Соседи, в этой ветке разрешены предложения оплачиваемого присмотра за домом и питомцами. Кто уезжает, пишите сроки и оплату.";
export const careControls = [
  "Соседи, завтра уезжаю на неделю. Кто сможет бесплатно покормить кошку? Потом помогу вам.",
  "Как договорились, завтра привезу кошку и собаку на неделю. Оплата 4900 в день, спасибо, что присмотришь.",
  "Перевела 4900 за вчерашний присмотр за собакой, проверь оплату.",
  "Ищу работу по присмотру за питомцами. Есть опыт, могу на следующей неделе.",
  "Сколько обычно стоит присмотр за питомцами в день, пока хозяева в отъезде?",
  "Осторожно: по разным темам рассылают одинаковую платную подработку. Не откликайтесь. Цитата: «" + reportedCare + "»",
];
export const careVariants = [
  "Уезжаю послезавтра на пять дней. Нужен человек присматривать за домом, ничего трудного. Плачу по 3200 в день. Кто свободен?",
  "Leaving next week for ten days. Need someone to feed my birds, easy work, paying 65 a day. Who can do it?",
];
export function careReply(text = reportedCare, source?: string, sourceId = 20): Message {
  return recruitmentReply(text, source, false, sourceId);
}
export function carePhotoReply(): Message {
  const message = careReply();
  return { ...message, reply_to_message: {
    message_id: 902, date: 1, chat: message.chat,
    from: { id: 20, is_bot: false, first_name: "Source" },
    photo: [{ file_id: "fixture-photo", file_unique_id: "fixture", width: 100, height: 100 }],
  } } as Message;
}
export function normalizedCare(text = reportedCare, source?: string, sourceId = 20) {
  return toModerationMessage(careReply(text, source, sourceId))!;
}
export const photoCare = () => toModerationMessage(carePhotoReply())!;
