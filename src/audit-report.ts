import type { Message } from "grammy/types";
import type { CurrentModerationMessage } from "./spam";
export type AuditSnapshot = {
  chatId: number; messageId: number; chatTitle: string; actor: string;
  actorName: string; senderUrl?: string; edited: boolean;
  body: string; media: string; context: string; links: string; profile: string;
};
const mediaKinds = ["photo", "video", "animation", "sticker", "audio", "voice", "document", "video_note", "story", "paid_media"] as const;
const mediaOf = (message: Message) => mediaKinds.filter(kind => kind in message);
const encode = (value: unknown) => JSON.stringify(value) ?? "unavailable";
const usernameUrl = (name?: string) => name && /^[a-zA-Z][a-zA-Z0-9_]{4,31}$/.test(name) ? "https://t.me/" + name : undefined;
export function auditSnapshot(raw: Message, input: CurrentModerationMessage, edited: boolean): AuditSnapshot {
  const actor = raw.sender_chat, user = actor ? undefined : raw.from;
  const media = mediaOf(raw);
  const reply = raw.reply_to_message;
  return {
    chatId: raw.chat.id, messageId: raw.message_id,
    chatTitle: "title" in raw.chat ? raw.chat.title ?? "unavailable" : "unavailable",
    actor: actor ? "chat:" + actor.id : user ? "user:" + user.id : "unknown",
    actorName: actor ? ("title" in actor ? actor.title ?? "sender chat" : "sender chat") : user ? [user.first_name, user.last_name].filter(Boolean).join(" ") : "unavailable",
    senderUrl: actor ? usernameUrl("username" in actor ? actor.username : undefined) : user && Number.isSafeInteger(user.id) && user.id > 0 ? "tg://user?id=" + user.id : undefined,
    edited,
    body: raw.text ?? raw.caption ?? (media.length ? "[" + media.join(", ") + "]" : "[no text/caption]"),
    media: media.length ? media.join(", ") + "; contents not inspected or attached" : "none supplied",
    context: encode({ replySource: reply ? {
      chatId: reply.chat.id, messageId: reply.message_id,
      actor: reply.sender_chat ? "chat:" + reply.sender_chat.id : reply.from ? "user:" + reply.from.id : "unknown",
      text: reply.text, caption: reply.caption, media: mediaOf(reply), entities: reply.entities ?? reply.caption_entities,
      buttons: reply.reply_markup?.inline_keyboard, note: "reply source only, not deleted author; media not inspected",
    } : "unavailable", preview: input.preview ?? "unavailable", quote: raw.quote,
      externalReply: raw.external_reply ? { origin: raw.external_reply.origin, chat: raw.external_reply.chat, messageId: raw.external_reply.message_id, note: "external source text/media unavailable; not fetched" } : undefined, forwardOrigin: raw.forward_origin }),
    links: encode({ embeddedLinks: input.embeddedLinks, entities: raw.entities ?? raw.caption_entities,
      inlineButtons: raw.reply_markup?.inline_keyboard ?? input.inlineButtons ?? [], destinationPreviews: input.destinationPreviews ?? "unavailable" }),
    profile: encode(input.senderProfile ?? "unavailable/not fetched; not inferred"),
  };
}
export const escapeAudit = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
// Only these captured fields are visible. Never fall back to previews, quotes,
// nested sources, profiles or serialized context when direct text is unavailable.
function replyBody(context: string): string | undefined {
  try {
    const value = JSON.parse(context);
    if (!value || typeof value !== "object" || Array.isArray(value)) return;
    const reply = value.replySource;
    if (reply && typeof reply === "object" && !Array.isArray(reply)) {
      if (typeof reply.text === "string" && reply.text) return reply.text;
      if (typeof reply.caption === "string" && reply.caption) return reply.caption;
      const media = Array.isArray(reply.media) ? mediaKinds.filter(kind => reply.media.includes(kind)) : [];
      return media.length ? "[" + media.join(", ") + "]" : "[text unavailable]";
    }
    if (value.externalReply || value.quote) return "[text unavailable]";
  } catch { /* Older/malformed context is not printable content. */ }
}

export function renderAuditReport(snapshot: AuditSnapshot): string[] {
  const safeSenderUrl = snapshot.senderUrl && /^(tg:\/\/user\?id=[1-9][0-9]*|https:\/\/t\.me\/[a-zA-Z][a-zA-Z0-9_]{4,31})$/.test(snapshot.senderUrl) ? snapshot.senderUrl : undefined;
  const name = escapeAudit(snapshot.actorName || "[sender unavailable]");
  const sender = safeSenderUrl ? '<a href="' + safeSenderUrl + '">' + name + '</a>' : name;
  const body = snapshot.body;
  const reply = replyBody(snapshot.context);
  const sections = [{ label: "", body }, ...(reply === undefined ? [] : [{ label: "Reply to: ", body: reply }])];
  // The outbox bounds HTML source to 4000 UTF-16 units. Count escaped characters
  // and wrappers, not raw input; close each pre before continuing. Pre keeps URLs
  // and fake markup inert, while the sender alone remains a clickable link.
  const parts: string[] = [];
  let current = sender;
  for (const section of sections) {
    let remaining = section.body;
    let continued = false;
    do {
      const label = continued ? (section.label ? "Reply to (continued): " : "Message (continued): ") : section.label;
      let prefix = (current ? (section.label ? "\n\n" : "\n") : "") + label + "<pre>";
      // Move an intact reply to the next part only when it fits there; otherwise
      // use remaining space rather than creating an unnecessary extra part.
      const encodedLength = escapeAudit(remaining).length;
      if (current && current !== sender && current.length + prefix.length + 6 + encodedLength > 4000 && label.length + 11 + encodedLength <= 4000) {
        parts.push(current); current = ""; prefix = label + "<pre>";
      }
      const firstSize = escapeAudit([...remaining][0] ?? "").length;
      if (current && current.length + prefix.length + 6 + firstSize > 4000) {
        parts.push(current); current = ""; prefix = label + "<pre>";
      }
      const budget = 4000 - current.length - prefix.length - 6;
      let chunk = "", consumed = 0;
      for (const char of remaining) {
        const encoded = escapeAudit(char);
        if (chunk.length + encoded.length > budget) break;
        chunk += encoded; consumed += char.length;
      }
      current += prefix + chunk + "</pre>";
      remaining = remaining.slice(consumed);
      if (remaining) { parts.push(current); current = ""; continued = true; }
    } while (remaining);
  }
  if (current) parts.push(current);
  return parts;
}
