import { decodeHTML, decodeHTMLAttribute } from "entities";
import type { DestinationPreview } from "./telegram-preview";
import { telegramPreviewUrl } from "./telegram-url";

export const POST_LIMITS = { posts: 2, text: 1200, links: 4, pageBytes: 262_144 } as const;
export type PersonalChannelPost = { url: string; text: string; embeddedLinks: string[]; destinationPreviews?: DestinationPreview[] };

// Only a Bot-API-validated channel username may be passed by the profile path.
export function publicChannelUrl(username: string): string | undefined {
  if (!/^[a-z][a-z0-9_]{3,31}$/i.test(username)) return;
  const landing = telegramPreviewUrl("https://t.me/" + username);
  if (!landing || !/^https:\/\/t\.me\/[a-z][a-z0-9_]{3,31}$/.test(landing)) return;
  return landing.replace("t.me/", "t.me/s/");
}
export function publicChannelPageUrl(url: string): boolean {
  const match = /^https:\/\/t\.me\/s\/([a-z][a-z0-9_]{3,31})$/.exec(url);
  return Boolean(match && publicChannelUrl(match[1]!) === url);
}
function link(raw: string): string | undefined {
  if (raw.length > 512 || /[\u0000-\u0020\u007f\\]/.test(raw)) return;
  try { const url = new URL(raw); if ((url.protocol === "https:" || url.protocol === "http:") && !url.username && !url.password) return raw; } catch { /* unknown data */ }
}
const clean = (value: string) => decodeHTML(value).replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();

// HTML parser, not regex over markup: complete owner-matched post containers only.
// Forwarded posts are deliberately excluded rather than attributed to the owner.
export async function extractPersonalPosts(html: string, pageUrl: string): Promise<PersonalChannelPost[]> {
  if (!publicChannelPageUrl(pageUrl) || Buffer.byteLength(html) > POST_LIMITS.pageBytes) return [];
  const handle = pageUrl.split("/").at(-1)!;
  type Post = PersonalChannelPost & { id: number; complete: boolean; invalid: boolean; fields: number; closedFields: number };
  const posts: Post[] = [];
  let current: Post | undefined;
  let invalid = false;
  let hidden = 0;
  const parser = new HTMLRewriter();
  parser.on("script, style", { element(e) { hidden++; e.onEndTag(() => { hidden--; }); } });
  parser.on(".tgme_widget_message", { element(e) {
    if (current) { invalid = true; return; }
    const locator = e.getAttribute("data-post") ?? "";
    const match = /^([a-z][a-z0-9_]{3,31})\/([1-9][0-9]{0,14})$/i.exec(locator);
    const valid = match && match[1]!.toLowerCase() === handle;
    current = { id: valid ? Number(match[2]) : 0, url: valid ? "https://t.me/" + handle + "/" + match[2] : "", text: "", embeddedLinks: [], complete: false, invalid: !valid, fields: 0, closedFields: 0 };
    const post = current; posts.push(post);
    const tag = e.tagName;
    e.onEndTag(end => { post.complete = end.name === tag; current = undefined; });
  } });
  parser.on(".tgme_widget_message_forwarded_from", { element() { if (current) current.invalid = true; } });
  parser.on(".tgme_widget_message_text", {
    element(e) { if (!current) return; const post = current; post.fields++; const tag = e.tagName;
      e.onEndTag(end => { if (end.name === tag) post.closedFields++; }); },
    text(chunk) { if (current && !hidden) current.text += chunk.text; },
  });
  parser.on(".tgme_widget_message_text br, .tgme_widget_message_text p, .tgme_widget_message_text div", { element() { if (current && !hidden) current.text += " "; } });
  parser.on(".tgme_widget_message_text a", { element(e) {
    if (!current || hidden) return;
    const url = link(decodeHTMLAttribute(e.getAttribute("href") ?? ""));
    if (url && current.embeddedLinks.length < POST_LIMITS.links && !current.embeddedLinks.includes(url)) current.embeddedLinks.push(url);
  } });
  await parser.transform(new Response(html)).text();
  if (invalid || current || hidden || posts.some(p => !p.complete)) return [];
  const seen = new Set<number>();
  return posts.filter(p => !p.invalid && p.fields === 1 && p.closedFields === 1 && clean(p.text).length <= POST_LIMITS.text)
    .sort((a, b) => b.id - a.id).filter(p => { if (seen.has(p.id)) return false; seen.add(p.id); return true; })
    .slice(0, POST_LIMITS.posts).map(p => {
      const text = clean(p.text);
      for (const match of text.matchAll(/https?:\/\/[^\s<>]+/g)) {
        const url = link(match[0].replace(/[.,!;:)\]}]+$/, ""));
        if (url && p.embeddedLinks.length < POST_LIMITS.links && !p.embeddedLinks.includes(url)) p.embeddedLinks.push(url);
      }
      return { url: p.url, text, embeddedLinks: p.embeddedLinks };
    }).filter(p => p.text || p.embeddedLinks.length);
}
