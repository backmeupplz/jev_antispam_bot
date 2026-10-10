import type { Message } from "grammy/types";
import type { CurrentModerationMessage } from "./spam";
export type AuditSnapshot = {
  chatId: number; messageId: number; chatTitle: string; actor: string;
  actorName: string; senderUrl?: string; edited: boolean;
  body: string; media: string; context: string; links: string; profile: string;
};
const encode = (value: unknown) => JSON.stringify(value) ?? "unavailable";
const usernameUrl = (name?: string) => name && /^[a-zA-Z][a-zA-Z0-9_]{4,31}$/.test(name) ? "https://t.me/" + name : undefined;
export function auditSnapshot(raw: Message, input: CurrentModerationMessage, edited: boolean): AuditSnapshot {
  const actor = raw.sender_chat, user = actor ? undefined : raw.from;
  const media = ["photo", "video", "animation", "sticker", "audio", "voice", "document", "video_note", "story", "paid_media"].filter(k => k in raw);
  const reply = raw.reply_to_message;
  return {
    chatId: raw.chat.id, messageId: raw.message_id,
    chatTitle: "title" in raw.chat ? raw.chat.title ?? "unavailable" : "unavailable",
    actor: actor ? "chat:" + actor.id : user ? "user:" + user.id : "unknown",
    actorName: actor ? ("title" in actor ? actor.title ?? "sender chat" : "sender chat") : user ? [user.first_name, user.last_name].filter(Boolean).join(" ") : "unavailable",
    senderUrl: actor ? usernameUrl("username" in actor ? actor.username : undefined) : user && Number.isSafeInteger(user.id) && user.id > 0 ? "tg://user?id=" + user.id : undefined,
    edited,
    body: raw.text ?? raw.caption ?? "[no text/caption]",
    media: media.length ? media.join(", ") + "; contents not inspected or attached" : "none supplied",
    context: encode({ replySource: reply ? {
      chatId: reply.chat.id, messageId: reply.message_id,
      actor: reply.sender_chat ? "chat:" + reply.sender_chat.id : reply.from ? "user:" + reply.from.id : "unknown",
      text: reply.text, caption: reply.caption, entities: reply.entities ?? reply.caption_entities,
      buttons: reply.reply_markup?.inline_keyboard, note: "reply source only, not deleted author; media not inspected",
    } : "unavailable", preview: input.preview ?? "unavailable", quote: raw.quote,
      externalReply: raw.external_reply ? { origin: raw.external_reply.origin, chat: raw.external_reply.chat, messageId: raw.external_reply.message_id, note: "external source text/media unavailable; not fetched" } : undefined, forwardOrigin: raw.forward_origin }),
    links: encode({ embeddedLinks: input.embeddedLinks, entities: raw.entities ?? raw.caption_entities,
      inlineButtons: raw.reply_markup?.inline_keyboard ?? input.inlineButtons ?? [], destinationPreviews: input.destinationPreviews ?? "unavailable" }),
    profile: encode(input.senderProfile ?? "unavailable/not fetched; not inferred"),
  };
}
export const escapeAudit = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
// Split before HTML wrapping; never split a Unicode codepoint or encoded entity.
// Outbox refuses oversize reports atomically, rather than discarding captured content.
export function auditChunks(value: string, max = 3000): string[] {
  const chunks: string[] = []; let current = "";
  for (const char of value) {
    const encoded = escapeAudit(char);
    if (current.length + encoded.length > max) { chunks.push(current); current = ""; }
    current += encoded;
  }
  if (current || !chunks.length) chunks.push(current);
  return chunks;
}
export function renderAuditReport(snapshot: AuditSnapshot, details: {
  source: "cache" | "jev"; model: string; linked: boolean; history: AuditSnapshot[];
}): string[] {
  const safeSenderUrl = snapshot.senderUrl && /^(tg:\/\/user\?id=[1-9][0-9]*|https:\/\/t\.me\/[a-zA-Z][a-zA-Z0-9_]{4,31})$/.test(snapshot.senderUrl) ? snapshot.senderUrl : undefined;
  const sender = safeSenderUrl ? '<a href="' + safeSenderUrl + '">sender</a> (Telegram access may be restricted)' : "sender link unavailable";
  const sections: [string, string][] = [
    ["Source and result", encode({ sourceChat: snapshot.chatId, messageId: snapshot.messageId, chatTitle: snapshot.chatTitle,
      actor: snapshot.actor, actorName: snapshot.actorName, update: snapshot.edited ? "Edited message" : "New message",
      deletion: details.linked ? "linked historical deletion" : "current deletion", verdict: details.source, model: details.model,
      note: "Confirmed deletion. Deleted-message links may no longer work." })],
    ["Own text/caption", snapshot.body], ["Media", snapshot.media],
    ["Own available reply/context (untrusted; source is not author)", snapshot.context],
    ["Own links/buttons/destinations (inert)", snapshot.links], ["Own profile at observation", snapshot.profile],
    ["Recent same-actor context (not all deleted)", encode(details.history.filter(s => s.messageId !== snapshot.messageId))],
  ];
  const parts = sections.flatMap(([label, value]) => auditChunks(value).map(chunk => '<b>' + label + '</b>\n<pre>' + chunk + '</pre>'));
  return parts.map((part, i) => '<b>Confirmed spam deletion — part ' + (i + 1) + '/' + parts.length + '</b>\nSource chat ' + snapshot.chatId + ' / message ' + snapshot.messageId + '\nActor ' + snapshot.actor + '\n' + sender + '\n' + part);
}
