import type { Message } from "grammy/types";
import type { CurrentModerationMessage } from "./spam";

// Only data already made available to this update/enrichment is retained.
export type AuditSnapshot = {
  chatId: number; messageId: number; chatTitle: string; actor: string;
  actorName: string; senderUrl?: string; edited: boolean;
  body: string; media: string; context: string; links: string; profile: string;
};
const clip = (value: string, max: number) => value.length <= max ? value : value.slice(0, max - 24) + " [truncated to bound]";
const encode = (value: unknown, max: number) => clip(JSON.stringify(value) ?? "unavailable", max);
const usernameUrl = (name?: string) => name && /^[a-zA-Z][a-zA-Z0-9_]{4,31}$/.test(name) ? "https://t.me/" + name : undefined;
export function auditSnapshot(raw: Message, input: CurrentModerationMessage, edited: boolean): AuditSnapshot {
  const actor = raw.sender_chat;
  const user = actor ? undefined : raw.from;
  const actorId = actor ? "chat:" + actor.id : user ? "user:" + user.id : "unknown";
  const media = ["photo", "video", "animation", "sticker", "audio", "voice", "document", "video_note", "story", "paid_media"].filter(k => k in raw);
  const reply = raw.reply_to_message;
  return {
    chatId: raw.chat.id, messageId: raw.message_id,
    chatTitle: clip("title" in raw.chat ? raw.chat.title ?? "unavailable" : "unavailable", 160),
    actor: actorId, actorName: clip(actor ? ("title" in actor ? actor.title ?? "sender chat" : "sender chat") : user ? [user.first_name, user.last_name].filter(Boolean).join(" ") : "unavailable", 160),
    senderUrl: actor ? usernameUrl("username" in actor ? actor.username : undefined) : user && Number.isSafeInteger(user.id) && user.id > 0 ? usernameUrl(user.username) ?? "tg://user?id=" + user.id : undefined,
    edited,
    body: clip("text" in raw ? raw.text ?? "" : "caption" in raw ? raw.caption ?? "" : "[no text/caption]", 4096),
    media: media.length ? media.join(", ") + "; contents not inspected or attached" : "none supplied",
    context: encode({
      replySource: reply ? { chatId: reply.chat.id, messageId: reply.message_id, actor: reply.sender_chat ? "chat:" + reply.sender_chat.id : reply.from ? "user:" + reply.from.id : "unknown", note: "reply source only, not deleted author" } : "unavailable",
      preview: input.preview ?? "unavailable",

      forwardOrigin: "forward_origin" in raw ? raw.forward_origin : undefined,
    }, 5000),
    links: encode({ embeddedLinks: input.embeddedLinks, inlineButtons: input.inlineButtons ?? [], destinationPreviews: input.destinationPreviews ?? "unavailable" }, 3000),
    profile: encode(input.senderProfile ?? "unavailable/not fetched; not inferred", 2400),
  };
}
const escape = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
// Bound the encoded payload itself, so HTML expansion cannot exceed Telegram limits.
function escapedBound(value: string, max: number) {
  let result = "";
  for (const char of value) { const next = escape(char); if (result.length + next.length > max - 25) return result + " [truncated to bound]"; result += next; }
  return result;
}
export function renderAuditReport(snapshot: AuditSnapshot, details: {
  source: "cache" | "jev"; model: string; linked: boolean; history: AuditSnapshot[];
}): string {
  const sender = snapshot.senderUrl ? '<a href="' + snapshot.senderUrl + '">sender</a> (Telegram access may be restricted)' : "sender link unavailable";
  const header = '<b>Confirmed spam deletion</b>\n' + escapedBound(snapshot.chatTitle, 180) +
    '\nSource chat ' + snapshot.chatId + ' / message ' + snapshot.messageId +
    '\nActor ' + snapshot.actor + ' — ' + escapedBound(snapshot.actorName, 180) + '\n' + sender +
    '\n' + (snapshot.edited ? 'Edited message' : 'New message') + (details.linked ? '; linked historical deletion' : '; current deletion') +
    '; verdict ' + details.source + '\nModel: ' + escapedBound(details.model, 140) +
    '\nDeleted-message links are not provided; they may no longer work.\n';
  const history = details.history.filter(s => s.messageId !== snapshot.messageId).slice(-10).map(s => ({ messageId: s.messageId, actor: s.actor, text: clip(s.body, 120) }));
  return header + '\n<b>Own text/caption</b>\n<pre>' + escapedBound(snapshot.body, 1100) + '</pre>\nMedia: ' + escapedBound(snapshot.media, 160) +
    '\n<b>Own available context (untrusted; source ≠ author)</b>\n<pre>' + escapedBound(snapshot.context, 530) + '</pre>' +
    '\n<b>Own links/buttons/destinations (inert)</b>\n<pre>' + escapedBound(snapshot.links, 360) + '</pre>' +
    '\n<b>Own profile at observation</b>\n<pre>' + escapedBound(snapshot.profile, 420) + '</pre>' +
    '\n<b>Recent same-actor context (not all deleted)</b>\n<pre>' + escapedBound(history.length ? JSON.stringify(history) : 'unavailable/none retained; no private history fetched', 420) + '</pre>';
}
