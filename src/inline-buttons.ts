import type { Message } from "grammy/types";

export type InlineUrlButton = { kind: "url" | "login_url" | "web_app"; text: string; url: string };
export const BUTTON_LIMITS = { count: 8, label: 128, url: 512, rows: 100, scanned: 100 } as const;

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

// Bot API InlineKeyboardButton has three URL-bearing variants. This is data
// extraction only: never execute callbacks, log in, launch apps, or pay.
export function inlineUrlButtons(message: Message): InlineUrlButton[] {
  const markup: unknown = "reply_markup" in message ? message.reply_markup : undefined;
  if (!record(markup) || !Array.isArray(markup.inline_keyboard)) return [];
  const buttons: InlineUrlButton[] = [];
  const seen = new Set<string>();
  let scanned = 0;
  for (const row of markup.inline_keyboard.slice(0, BUTTON_LIMITS.rows)) {
    if (!Array.isArray(row)) continue;
    for (const button of row) {
      if (++scanned > BUTTON_LIMITS.scanned || buttons.length >= BUTTON_LIMITS.count) return buttons;
      if (!record(button) || typeof button.text !== "string") continue;
      const kinds = (["url", "login_url", "web_app"] as const).filter(kind => kind in button);
      if (kinds.length !== 1) continue;
      const kind = kinds[0]!;
      const field = button[kind];
      const url = kind === "url" ? field : record(field) ? field.url : undefined;
      // Reject overlong targets rather than truncate into a different fetchable URL.
      if (typeof url !== "string" || !url || url.length > BUTTON_LIMITS.url || /[\s\\]/u.test(url)) continue;
      try {
        const parsed = new URL(url);
        if (!(kind === "url" ? ["http:", "https:", "tg:"] : ["https:"]).includes(parsed.protocol)) continue;
      } catch { continue; }
      const text = button.text.slice(0, BUTTON_LIMITS.label);
      const key = JSON.stringify([kind, text, url]);
      if (seen.has(key)) continue;
      seen.add(key);
      buttons.push({ kind, text, url });
    }
  }
  return buttons;
}
