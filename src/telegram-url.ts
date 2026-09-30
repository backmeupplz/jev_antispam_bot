const reserved = new Set(["addstickers", "addemoji", "addtheme", "addlist", "addlanguage", "setlanguage", "share", "proxy", "socks", "login", "confirmphone", "iv", "s", "c", "joinchat", "boost", "giftcode", "invoice", "bg", "contact", "m", "nft", "apps"]);

// Accept only chat landing-page grammar, not arbitrary t.me routes or URL-parser repairs.
export function telegramPreviewUrl(raw: string): string | undefined {
  if (raw.length > 512 || /[\\\s%]/u.test(raw)) return;
  const match = /^(?:https:\/\/)?t\.me\/(\+[A-Za-z0-9_-]{1,128}|joinchat\/[A-Za-z0-9_-]{1,128}|[A-Za-z][A-Za-z0-9_]{3,31})\/?(?:\?[^#]*)?(?:#.*)?$/i.exec(raw);
  if (!match) return;
  const path = match[1]!;
  if (path.startsWith("+")) return `https://t.me/${path}`;
  if (path.toLowerCase().startsWith("joinchat/")) return `https://t.me/+${path.slice(9)}`;
  if (reserved.has(path.toLowerCase())) return;
  return `https://t.me/${path.toLowerCase()}`;
}

