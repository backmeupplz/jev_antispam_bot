import type { Message } from "grammy/types";
import type { ModerationMessage } from "./spam";

export function toModerationMessage(message: Message): ModerationMessage | null {
  const text = "text" in message ? message.text : "caption" in message ? message.caption : undefined;
  if (!text?.trim()) return null;

  const entities = "entities" in message
    ? message.entities
    : "caption_entities" in message
      ? message.caption_entities
      : undefined;

  const embeddedLinks = (entities ?? [])
    .filter((entity): entity is Extract<typeof entity, { type: "text_link" }> => entity.type === "text_link")
    .map((entity) => entity.url);

  const reply = "reply_to_message" in message ? message.reply_to_message : undefined;
  const replyText = reply && ("text" in reply ? reply.text : "caption" in reply ? reply.caption : undefined);
  const preview: NonNullable<ModerationMessage["preview"]> = [];
  if (reply && replyText?.trim()) {
    const actor = (source: Message): string | undefined => source.sender_chat
      ? `chat:${source.sender_chat.id}` : source.from ? `user:${source.from.id}` : undefined;
    const currentActor = actor(message);
    const sourceActor = actor(reply);
    const origin = reply.forward_origin;
    const entities = "entities" in reply ? reply.entities : "caption_entities" in reply ? reply.caption_entities : undefined;
    preview.push({
      kind: "reply",
      origin: reply.chat.id === message.chat.id ? "same_chat" : "external",
      sourceKind: origin?.type === "hidden_user" ? "hidden_user"
        : origin?.type === "channel" || reply.sender_chat ? "channel"
        : reply.from ? "user" : "unknown",
      sourceAuthor: origin || !currentActor || !sourceActor ? "unknown"
        : currentActor === sourceActor ? "same_author" : "other_author",
      isForwarded: Boolean(origin),
      text: replyText.slice(0, 1_200),
      embeddedLinks: [...new Set((entities ?? [])
        .filter((entity): entity is Extract<typeof entity, { type: "text_link" }> => entity.type === "text_link")
        .map((entity) => entity.url.slice(0, 512)))].slice(0, 8),
    });
  }

  return {
    text,
    embeddedLinks: [...new Set(embeddedLinks)],
    isForwarded: "forward_origin" in message,
    ...(preview.length ? { preview } : {}),
  };
}
