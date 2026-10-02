import type { Message, MessageEntity } from "grammy/types";
import type { ModerationMessage } from "./spam";
import { inlineUrlButtons } from "./inline-buttons";

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
  const actor = (source: Message): string | undefined => source.sender_chat
    ? `chat:${source.sender_chat.id}` : source.from ? `user:${source.from.id}` : undefined;
  const currentActor = actor(message);
  const sourceActor = actor(source);
  return !currentActor || !sourceActor ? "unknown"
    : currentActor === sourceActor ? "same_author" : "other_author";
}

function kind(origin: { type: string } | undefined): "user" | "chat" | "channel" | "hidden_user" | "unknown" {
  if (origin?.type === "chat") return "chat";
  if (origin?.type === "user" || origin?.type === "channel" || origin?.type === "hidden_user") return origin.type;
  return "unknown";
}

export function toModerationMessage(message: Message): ModerationMessage | null {
  const current = sourceText(message, MAX_CURRENT_CHARS);
  const inlineButtons = inlineUrlButtons(message);
  const mediaOnly = !current.text?.trim() && ("sticker" in message || "photo" in message || "video" in message || "animation" in message);
  if (!current.text?.trim() && !mediaOnly) return null;

  const preview: NonNullable<ModerationMessage["preview"]> = [];
  const reply = "reply_to_message" in message ? message.reply_to_message : undefined;
  const external = "external_reply" in message ? message.external_reply : undefined;
  const quote = "quote" in message ? message.quote : undefined;

  if (reply) {
    const sourceButtons = inlineUrlButtons(reply);
    preview.push({
      kind: "reply",
      origin: reply.chat.id === message.chat.id ? "same_chat" : "external",
      sourceKind: "forward_origin" in reply && reply.forward_origin ? kind(reply.forward_origin)
        : reply.sender_chat ? (reply.sender_chat.type === "channel" ? "channel" : "chat") : reply.from ? "user" : "unknown",
      sourceAuthor: author(message, reply),
      isForwarded: "forward_origin" in reply && Boolean(reply.forward_origin),
      ...sourceText(reply),
      ...(sourceButtons.length ? { inlineButtons: sourceButtons } : {}),
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
    preview.push({ kind: "external_reply",
      origin: external.chat ? (external.chat.id === message.chat.id ? "same_chat" : "external") : "unknown",
      sourceKind: kind(origin), sourceAuthor,
      isForwarded: false, embeddedLinks: [] });
  }
  if (quote) {
    preview.push({
      kind: "quote",
      origin: preview[0]?.origin ?? "unknown",
      sourceKind: preview[0]?.sourceKind ?? "unknown",
      sourceAuthor: reply ? author(message, reply) : preview.find((item) => item.kind === "external_reply")?.sourceAuthor ?? "unknown",
      isForwarded: reply ? "forward_origin" in reply && Boolean(reply.forward_origin) : false,
      text: quote.text.slice(0, MAX_SOURCE_CHARS),
      // TextQuote retains formatting entities, not hidden text_link targets.
      // Any source links are already attached to its separate reply entry.
      embeddedLinks: [],
    });
  }

  return {
    text: current.text ?? "",
    ...(mediaOnly ? { mediaOnly: true } : {}),
    embeddedLinks: current.embeddedLinks,
    ...(inlineButtons.length ? { inlineButtons } : {}),
    isForwarded: "forward_origin" in message && Boolean(message.forward_origin),
    ...(preview.length ? { preview } : {}),
  };
}
