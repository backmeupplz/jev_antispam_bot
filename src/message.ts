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

  return {
    text,
    embeddedLinks: [...new Set(embeddedLinks)],
    isForwarded: "forward_origin" in message,
  };
}
