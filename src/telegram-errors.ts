import { GrammyError } from "grammy";

// Allowlisted, content-free classes of Telegram error descriptions (#193).
// The raw description is never logged; anything unlisted becomes "other".
const REASONS: [RegExp, string][] = [
  [/CHAT_ADMIN_REQUIRED|need administrator rights|not enough rights/i, "chat_admin_required"],
  [/member list is inaccessible/i, "member_list_inaccessible"],
  [/PARTICIPANT_ID_INVALID/i, "participant_invalid"],
  [/USER_ID_INVALID|user not found/i, "user_not_found"],
  [/chat not found|CHANNEL_INVALID|CHANNEL_PRIVATE/i, "chat_not_found"],
  [/bot was kicked|bot is not a member|not in the chat/i, "bot_not_member"],
  [/group chat was upgraded/i, "chat_migrated"],
  [/message can't be deleted/i, "message_cant_be_deleted"],
  [/message to delete not found/i, "message_not_found"],
  [/too many requests/i, "too_many_requests"],
];

export function telegramErrorReason(error: unknown): string | undefined {
  if (!(error instanceof GrammyError)) return undefined;
  return REASONS.find(([pattern]) => pattern.test(error.description))?.[1] ?? "other";
}
