import type { Message } from "grammy/types";
import { toModerationMessage } from "../message";
import { reportedRecruitment } from "./vague-recruitment";

export const hiringRequest = "Ищу оплачиваемую подработку на сегодняшний вечер. Кто нанимает, пришлите сюда предложения со временем и оплатой.";
export const invitedHiring = "В этой ветке обсуждаем вакансии на подмену. Работодатели, разместите ваши предложения и оплату.";
export const unrelatedReply = "Как вам вчерашний фильм? Обсуждаем концовку.";
export function recruitmentReply(text = reportedRecruitment.paidCompletion, source?: string, forwarded = false, sourceId = 20): Message {
  const chat = { id: -1001, type: "supergroup" as const, title: "Fixture" };
  return {
    message_id: 1, date: 1, chat, from: { id: 12, is_bot: false, first_name: "Poster" }, text,
    ...(forwarded ? { forward_origin: { type: "hidden_user" as const, date: 1, sender_user_name: "Origin" } } : {}),
    ...(source ? { reply_to_message: { message_id: 900, date: 0, chat,
      from: { id: sourceId, is_bot: false, first_name: "Requester" }, text: source } } : {}),
  } as Message;
}
export function normalizedRecruitment(text: string, source?: string, forwarded = false, sourceId = 20) {
  return toModerationMessage(recruitmentReply(text, source, forwarded, sourceId))!;
}
