import type { ModerationMessage, SenderProfile } from "./spam";

// #470: reply-guy accounts post a short, harmless-looking comment ("What's the stack
// you're using for this?") so readers open their profile, where a brand-new personal
// channel holds a single teaser post pointing to a private invite link. Laya scores
// the comment itself (0.26–0.69 in the capture), so the bot judges the profile's
// shape instead: a channel that exists only to carry that one funnel post.
// Data: docs/promo-patterns.md.

// t.me/s renders a channel's service events as posts; they carry no content.
const SERVICE = /^(?:channel created|channel photo (?:updated|removed)|channel name was changed to «[^»]*»)$/i;
// A private invite hides its destination until the reader joins, unlike a public @channel.
const PRIVATE_INVITE = /^https:\/\/t\.me\/(?:\+|joinchat\/)[\w-]+$/;
// A host is anything up to the path (школа.рф too); the path keeps URL characters only, so an
// emoji glued to a link ("…/+AbC👇") does not make a second destination.
const PATH_CHARS = "[\\w.~:/?#\\[\\]@!$&'()*+,;=%-]*";
const URL = new RegExp(`https?://(?:(?!https?://)[^\\s/?#<>])+(?:[/?#]${PATH_CHARS})?|(?<![\\w@./])(?:t|telegram)\\.me/${PATH_CHARS}`, "gi");
// The channel's whole history fits in its first few message IDs (creation, photo, post).
const FRESH_POST_ID = 10;
const TEASER_WORDS = 3;
// Words that only point at the owner's own channel ("Мой основной канал тут 👇", "My main channel is here").
const POINTER = new Set(("my our main private personal second backup new old official channel channels group chat here is it's this "
  + "that link links join subscribe follow the a to in on and below please мой моя моё мое мои наш наша наше наши основной основная "
  + "приватный приватная личный личная второй вторая запасной резервный резервная новый новая официальный канал каналы группа "
  + "чат тут здесь вот это ссылка ссылки подписывайтесь подпишись переходите заходите ниже на в и asosiy kanal kanalim kanalimiz "
  + "guruh guruhim shaxsiy yangi zaxira havola bu yerda mening bizning obuna telegram tg check out телеграм тг подпишитесь "
  + "вступайте нашу нашем нашей мою моём моем моей канале канала каналу группу группе группы чате чата kanalimga kanalga "
  + "guruhga bo'ling").split(" "));

function destination(raw: string): string {
  const [, host = "", rest = ""] = /^((?:https?:\/\/)?[^\s/?#<>]*)(.*)$/is.exec(raw)!;
  const path = new RegExp(`^${PATH_CHARS}`).exec(rest)![0];
  // A trailing emoji or mark ends a bare host ("https://site.example👇").
  const url = (path ? host + path : host.replace(/[^\p{L}\p{N}]+$/u, "")).replace(/[.,!?;:)\]}'"]+$/, "")
    .replace(/^(?:https?:\/\/)?/i, "https://").replace(/\/$/, "");
  // Host case never changes a destination; an invite hash's case does.
  return url.replace(/^https:\/\/([^/?#]+)/, (_match, host: string) => {
    const name = host.toLowerCase().replace(/^www\./, "");
    return "https://" + (name === "telegram.me" ? "t.me" : name);
  });
}

/** A fresh personal channel whose only content is one teaser post leading to one private invite link (and at most one website). */
export function funnelChannel(profile: SenderProfile | undefined): boolean {
  const posts = profile?.personalChannel?.posts ?? [];
  const content = posts.filter(post => !SERVICE.test(post.text.trim()));
  if (content.length !== 1) return false;
  const [post] = content as [typeof content[0]];
  const id = Number(post.url.split("/").at(-1));
  if (!Number.isInteger(id) || id < 1 || id > FRESH_POST_ID) return false;
  // A contact handle or a second Telegram destination makes it a hub or a storefront card, not a lone funnel.
  if (/@\w/.test(post.text)) return false;
  const links = new Set([...post.text.matchAll(URL)].map(match => destination(match[0])).concat(post.embeddedLinks.flatMap(link => {
    // A hyperlink can hide a second URL glued to the first ("site.example👉https://t.me/…").
    const found = [...link.matchAll(URL)].map(match => destination(match[0]));
    return found.length ? found : [destination(link)];
  })));
  const telegram = [...links].filter(link => link.startsWith("https://t.me/"));
  if (telegram.length !== 1 || !PRIVATE_INVITE.test(telegram[0]!)) return false;
  // The invite may come with the offer's own website ("Официальный сайт ⬇️ …"), but not a list of them.
  if (links.size - telegram.length > 1) return false;
  // A bare link or a one-word label ("main") is a pointer to the owner's own channel, not a teaser.
  const words = (post.text.replace(URL, " ").match(/\p{L}[\p{L}\p{M}'’‘]*/gu) ?? []).map(word => word.toLowerCase().replace(/[’‘ʻ]/g, "'"));
  return words.length >= TEASER_WORDS && !words.every(word => POINTER.has(word));
}

/** The sender's own text (not a forward, not uncaptioned media) backed by a funnel channel. */
export function profileChannelFunnel(message: ModerationMessage, profile: SenderProfile | undefined): boolean {
  if (message.mediaOnly || message.isForwarded || !message.text.trim()) return false;
  return funnelChannel(profile);
}
