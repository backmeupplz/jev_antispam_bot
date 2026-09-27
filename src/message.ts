import type { Message, MessageEntity } from "grammy/types";
import type { ModerationMessage } from "./spam";

const MAX_CURRENT_CHARS = 4_096;
const MAX_SOURCE_CHARS = 1_200;
const MAX_LINKS = 8;

function links(entities: MessageEntity[] | undefined): string[] {
  return [...new Set((entities ?? [])
    .filter((entity): entity is Extract<MessageEntity, { type: "text_link" }> => entity.type === "text_link")
    .map((entity) => entity.url.slice(0, 512)))].slice(0, MAX_LINKS);
}

function sourceText(source: Message, maxChars = MAX_SOURCE_CHARS): { text?: string; embeddedLinks: string[] } {
  const text = "text" in source ? source.text : "caption" in source ? source.caption : undefined;
  const entities = "entities" in source ? source.entities
    : "caption_entities" in source ? source.caption_entities : undefined;
  return { ...(text?.trim() ? { text: text.slice(0, maxChars) } : {}), embeddedLinks: links(entities) };
}

function author(message: Message, source: Message): "same_author" | "other_author" | "unknown" {
  // A forwarded message's posting account is not necessarily its original author.
  if ("forward_origin" in source && source.forward_origin) return "unknown";
  if ("sender_chat" in message && message.sender_chat && "sender_chat" in source && source.sender_chat) {
    return message.sender_chat.id === source.sender_chat.id ? "same_author" : "other_author";
  }
  if ("from" in message && message.from && "from" in source && source.from &&
      !("sender_chat" in message && message.sender_chat) && !("sender_chat" in source && source.sender_chat)) {
    return message.from.id === source.from.id ? "same_author" : "other_author";
  }
  return "unknown";
}

function kind(origin: { type: string } | undefined): "user" | "channel" | "hidden_user" | "unknown" {
  if (origin?.type === "user" || origin?.type === "channel" || origin?.type === "hidden_user") return origin.type;
  return "unknown";
}

export function toModerationMessage(message: Message): ModerationMessage | null {
  const current = sourceText(message, MAX_CURRENT_CHARS);
  if (!current.text?.trim()) return null;

  const preview: NonNullable<ModerationMessage["preview"]> = [];
  const reply = "reply_to_message" in message ? message.reply_to_message : undefined;
  const external = "external_reply" in message ? message.external_reply : undefined;
  const quote = "quote" in message ? message.quote : undefined;

  if (reply) {
    preview.push({
      kind: "reply",
      origin: reply.chat.id === message.chat.id ? "same_chat" : "external",
      sourceKind: "forward_origin" in reply && reply.forward_origin ? kind(reply.forward_origin)
        : "sender_chat" in reply && reply.sender_chat ? "channel" : "from" in reply && reply.from ? "user" : "unknown",
      sourceAuthor: author(message, reply),
      isForwarded: "forward_origin" in reply && Boolean(reply.forward_origin),
      ...sourceText(reply),
    });
  }
  if (external) {
    // Bot API ExternalReplyInfo has origin/media metadata, NOT source text or
    // caption. Never fetch or infer content from its message_id or media.
    const origin = external.origin;
    const sourceAuthor = origin.type === "user" && "from" in message && message.from &&
      !("sender_chat" in message && message.sender_chat)
      ? (origin.sender_user.id === message.from.id ? "same_author" : "other_author")
      : "unknown";
    preview.push({ kind: "external_reply", origin: "external", sourceKind: kind(origin), sourceAuthor,
      isForwarded: false, embeddedLinks: [] });
  }
  if (quote) {
    preview.push({
      kind: "quote",
      origin: external ? "external" : reply ? (reply.chat.id === message.chat.id ? "same_chat" : "external") : "unknown",
      sourceKind: preview[0]?.sourceKind ?? "unknown",
      sourceAuthor: reply ? author(message, reply) : preview.find((item) => item.kind === "external_reply")?.sourceAuthor ?? "unknown",
      isForwarded: reply ? "forward_origin" in reply && Boolean(reply.forward_origin) : false,
      text: quote.text.slice(0, MAX_SOURCE_CHARS),
      embeddedLinks: links(quote.entities),
    });
  }

  return {
    text: current.text.slice(0, MAX_CURRENT_CHARS),
    embeddedLinks: current.embeddedLinks,
    isForwarded: "forward_origin" in message && Boolean(message.forward_origin),
    ...(preview.length ? { preview } : {}),
  };
}
