import { extractPersonalPosts, publicChannelPageUrl, POST_LIMITS, type PersonalChannelPost } from "./personal-posts";
import { lookup } from "node:dns/promises";
import { request } from "node:https";
import { decodeHTML, decodeHTMLAttribute } from "entities";
import type { Message, MessageEntity } from "grammy/types";

export const PREVIEW_LIMITS = { urls: 2, concurrent: 4, timeoutMs: 1_500, bytes: 65_536,
  redirects: 2, entries: 500, ttlMs: 300_000, negativeTtlMs: 30_000 } as const;
export type DestinationPreview = { url: string; status: "available" | "unavailable"; title?: string; description?: string };
type Category = "available" | "unavailable" | "timeout" | "network" | "unsafe" | "oversize" | "content_type" | "rate_limit" | "overload";
type Outcome = (result: Category, source: "network" | "cache" | "in_flight", durationMs: number) => void;
import { telegramPreviewUrl } from "./telegram-url";
export { telegramPreviewUrl } from "./telegram-url";

export function currentTelegramLinks(message: Message): string[] {
  const text = "text" in message ? message.text ?? "" : "caption" in message ? message.caption ?? "" : "";
  const entities: MessageEntity[] = ("entities" in message ? message.entities : "caption_entities" in message ? message.caption_entities : undefined) ?? [];
  const candidates: string[] = [];
  for (const entity of entities.slice(0, 100)) {
    if (entity.type === "text_link") candidates.push(entity.url);
    // JS slice uses UTF-16 code units, exactly Telegram entity offsets.
    if (entity.type === "url" && Number.isInteger(entity.offset) && Number.isInteger(entity.length)
      && entity.offset >= 0 && entity.length > 0 && entity.offset + entity.length <= text.length) {
      candidates.push(text.slice(entity.offset, entity.offset + entity.length));
    }
  }
  for (const match of text.slice(0, 4096).matchAll(/(?:^|[\s(<])((?:https:\/\/)?t\.me\/[^\s<>]+)/gi)) {
    candidates.push(match[1]!.replace(/[.,!;:)\]}]+$/, ""));
  }
  return [...new Set(candidates.map(telegramPreviewUrl).filter((url): url is string => Boolean(url)))].slice(0, PREVIEW_LIMITS.urls);
}

// IPv4-only DNS resolution simplifies the boundary: no mapped IPv6, zone IDs,
// alternate numeric forms or DNS-rebinding TOCTOU. The validated address is pinned
// into the TLS socket lookup; SNI and certificate verification still use t.me.
export function publicIPv4(address: string): boolean {
  if (!/^(?:\d{1,3}\.){3}\d{1,3}$/.test(address)) return false;
  const p = address.split(".").map(Number);
  if (p.some((n) => n > 255)) return false;
  const [a, b, c] = p as [number, number, number, number];
  return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
    || (a === 192 && b === 0) || (a === 192 && b === 88 && c === 99)
    || (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100)))
    || (a === 203 && b === 0 && c === 113));
}
class PreviewError extends Error { constructor(readonly category: Category) { super(category); } }
export type PreviewPage = { status: number; headers: Record<string, string | undefined>; body: string };
export type PageRequest = (url: string, signal: AbortSignal) => Promise<PreviewPage>;

export async function requestPublicTelegramPage(url: string, signal: AbortSignal, transport = { lookup, request }): Promise<PreviewPage> {
  if (telegramPreviewUrl(url) !== url && !publicChannelPageUrl(url)) throw new PreviewError("unsafe");
  const maxBytes = publicChannelPageUrl(url) ? POST_LIMITS.pageBytes : PREVIEW_LIMITS.bytes;
  const addresses = await transport.lookup("t.me", { family: 4, all: true });
  signal.throwIfAborted();
  if (!addresses.length || addresses.some(({ address }) => !publicIPv4(address))) throw new PreviewError("unsafe");
  return new Promise((resolve, reject) => {
    const req = transport.request(url, {
      method: "GET", signal, agent: false,
      // Bun 1.3 synthesizes Host: t.me:443 after custom lookup, then uses
      // that authority for TLS identity. Keep the exact admitted hostname,
      // without a port; DNS remains pinned and certificate checks stay enabled.
      headers: { Host: "t.me", Accept: "text/html", "Accept-Encoding": "identity", "User-Agent": "Jev-Public-Preview/1.0" },
      lookup: (_hostname, options, callback) => {
        if (options.all) callback(null, [{ address: addresses[0]!.address, family: 4 }]);
        else callback(null, addresses[0]!.address, 4);
      },
    }, (res) => {
      const headers = Object.fromEntries(Object.entries(res.headers).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value]));
      const status = res.statusCode ?? 0;
      if (status !== 200) { res.destroy(); resolve({ status, headers, body: "" }); return; }
      if (!/^text\/html(?:;|$)/i.test(headers["content-type"] ?? "") || (headers["content-encoding"] && headers["content-encoding"] !== "identity")) {
        res.destroy(); reject(new PreviewError("content_type")); return;
      }
      if (Number(headers["content-length"]) > maxBytes) { res.destroy(); reject(new PreviewError("oversize")); return; }
      let size = 0;
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > maxBytes) { res.destroy(new PreviewError("oversize")); return; }
        chunks.push(chunk);
      });
      res.on("error", reject);
      res.on("end", () => resolve({ status, headers, body: Buffer.concat(chunks).toString("utf8") }));
    });
    req.on("error", reject);
    req.end();
  });
}

export async function extractTelegramPreview(html: string): Promise<{ title: string; description?: string } | undefined> {
  const og: Record<string, string> = {};
  const visible: Record<string, string> = { title: "", description: "" };
  const fields = new Map<string, { complete: boolean }>();
  let openFields = 0;
  let invalidFields = false;
  let nonVisibleDepth = 0;
  const parser = new HTMLRewriter().on("meta", { element(element) {
    const key = element.getAttribute("property")?.toLowerCase();
    if ((key === "og:title" || key === "og:description") && !og[key]) og[key] = decodeHTMLAttribute(element.getAttribute("content") ?? "");
  } });
  // Text handlers include all descendants, even raw script/CSS text. Track
  // those subtrees structurally so escaped visible text remains ordinary data.
  parser.on("script, style", { element(element) {
    nonVisibleDepth++;
    element.onEndTag(() => { nonVisibleDepth--; });
  } });
  const boundaries = new Set(["br", "hr", "address", "article", "aside", "blockquote", "div", "dl", "dt", "dd", "fieldset", "figcaption", "figure", "footer", "form", "h1", "h2", "h3", "h4", "h5", "h6", "header", "li", "main", "nav", "ol", "p", "pre", "section", "table", "thead", "tbody", "tfoot", "tr", "td", "th", "ul"]);
  for (const [key, selector] of [["title", ".tgme_page_title"], ["description", ".tgme_page_description"]] as const) {
    parser.on(selector, {
      element(element) {
        // HTMLRewriter repairs truncated trees. Only accept explicitly closed,
        // distinct containers, never nested/duplicate fields merged as evidence.
        if (openFields || fields.has(key)) invalidFields = true;
        const field = { complete: false };
        fields.set(key, field);
        openFields++;
        const tagName = element.tagName;
        element.onEndTag((tag) => {
          if (tag.name !== tagName) invalidFields = true;
          field.complete = true;
          openFields--;
        });
      },
      text(chunk) { if (!nonVisibleDepth) visible[key] += chunk.text; },
    });
    // Preserve line/block boundaries, but not arbitrary inline element edges:
    // in<strong>vest</strong>ment is still one word. No CSS/JS evaluation.
    parser.on(`${selector} *`, { element(element) {
      if (nonVisibleDepth || !boundaries.has(element.tagName)) return;
      visible[key] += " ";
      if (element.tagName !== "br" && element.tagName !== "hr") {
        element.onEndTag(() => { visible[key] += " "; });
      }
    } });
  }
  await parser.transform(new Response(html)).text();
  if (invalidFields || openFields || !fields.get("title")?.complete
    || [...fields.values()].some(field => !field.complete)) return;
  // Actual markup was excluded structurally. Decoded angle brackets are
  // literal destination text (including qualifications), never markup to strip.
  const clean = (value: string, max: number) => value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
  const title = clean(og["og:title"] || decodeHTML(visible.title!), 200);
  const description = clean(og["og:description"] || decodeHTML(visible.description!), 800);
  // Match complete landing-page boilerplate, never a promotional title/description prefix.
  if (!title || /^(?:telegram|telegram: (?:join group chat|contact @[a-z0-9_]+)|join (?:group|chat)(?: on telegram)?)$/i.test(title)) return;
  if (/^you are invited to a group chat on telegram\.(?: click to join\.?)?$/i.test(description)
    || /^you can contact @[a-z0-9_]+ right away\.$/i.test(description)
    || /^you can view and join @[a-z0-9_]+ right away\.$/i.test(description)) return;
  return { title, ...(description ? { description } : {}) };
}

// One finite budget for current-message destinations, sender posts and one-level
// post destinations. Reserve worst-case body bytes before opening any socket.
export const ENRICHMENT_LIMITS = { urls: 4, requests: 6, bytes: POST_LIMITS.pageBytes + 5 * PREVIEW_LIMITS.bytes, timeoutMs: 4_500 } as const;
export class EnrichmentBudget {
  readonly signal: AbortSignal;
  private readonly urls = new Set<string>();
  private requests = 0;
  private bytes = 0;
  constructor(timeoutMs: number = ENRICHMENT_LIMITS.timeoutMs) { this.signal = AbortSignal.timeout(timeoutMs); }
  admit(url: string): boolean {
    if (this.signal.aborted) return false;
    if (this.urls.has(url)) return true;
    if (this.urls.size >= ENRICHMENT_LIMITS.urls) return false;
    this.urls.add(url); return true;
  }
  reserve(postPage = false): void {
    this.signal.throwIfAborted();
    this.bytes += postPage ? POST_LIMITS.pageBytes : PREVIEW_LIMITS.bytes;
    if (++this.requests > ENRICHMENT_LIMITS.requests || this.bytes > ENRICHMENT_LIMITS.bytes) throw new PreviewError("overload");
  }
}
type CachedPreview = DestinationPreview & { posts?: PersonalChannelPost[] };

// Count underlying work, not callers waiting for a deadline. DNS lookup is not
// abortable, so a timed-out lookup must keep its slot until it actually settles.
// The process-wide counter retains no message, URL or invite-token keys.
let networkActive = 0;

export class TelegramPreviewCache {
  private readonly entries = new Map<string, { preview: CachedPreview; result: Category; expires: number; timer: ReturnType<typeof setTimeout> }>();
  private readonly active = new Map<string, Promise<{ preview: CachedPreview; result: Category }>>();
  private retryAt = 0;
  constructor(private readonly options: { request?: PageRequest; now?: () => number; timeoutMs?: number; ttlMs?: number; negativeTtlMs?: number; maxEntries?: number } = {}) {}
  private now() { return (this.options.now ?? Date.now)(); }

  async enrich(message: Message, outcome?: Outcome, budget = new EnrichmentBudget()): Promise<DestinationPreview[]> {
    return this.enrichLinks(currentTelegramLinks(message), budget, outcome);
  }
  async enrichLinks(links: string[], budget: EnrichmentBudget, outcome?: Outcome): Promise<DestinationPreview[]> {
    const urls = [...new Set(links.map(telegramPreviewUrl).filter((url): url is string => Boolean(url)))].slice(0, PREVIEW_LIMITS.urls);
    return Promise.all(urls.map(url => this.get(url, outcome, budget)));
  }
  async personalPosts({ id, url }: { id: number; url: string }, budget: EnrichmentBudget): Promise<PersonalChannelPost[]> {
    if (!Number.isSafeInteger(id) || id >= 0 || !publicChannelPageUrl(url)) return [];
    // Handles can move between channels while a cached or in-flight page exists.
    // Retain the freshly verified numeric owner in both cache namespaces.
    const preview = await this.get(url, undefined, budget, `channel:${id}:${url}`);
    // Never mutate cached post arrays with per-update destination evidence.
    const posts = structuredClone(preview.posts ?? []);
    for (const post of posts) {
      const destinations = await this.enrichLinks(post.embeddedLinks, budget);
      if (destinations.length) post.destinationPreviews = destinations;
    }
    return posts;
  }

  private async get(url: string, outcome: Outcome | undefined, budget: EnrichmentBudget, cacheKey = url): Promise<CachedPreview> {
    if (!budget.admit(url)) return { url, status: "unavailable" };
    const started = performance.now();
    const cached = this.entries.get(cacheKey);
    if (cached && cached.expires > this.now()) { outcome?.(cached.result, "cache", Math.round(performance.now() - started)); return cached.preview; }
    if (cached) this.remove(cacheKey);
    let pending = this.active.get(cacheKey);
    let source: "in_flight" | "network" = "in_flight";
    if (!pending) {
      source = "network";
      if (this.retryAt > this.now() || networkActive >= PREVIEW_LIMITS.concurrent) {
        outcome?.(this.retryAt > this.now() ? "rate_limit" : "overload", source, 0);
        return { url, status: "unavailable" };
      }
      pending = this.load(url, budget).then((result) => {
        const ttl = result.result === "available" ? this.options.ttlMs ?? PREVIEW_LIMITS.ttlMs : this.options.negativeTtlMs ?? PREVIEW_LIMITS.negativeTtlMs;
        while (this.entries.size >= (this.options.maxEntries ?? PREVIEW_LIMITS.entries)) this.remove(this.entries.keys().next().value!);
        const timer = setTimeout(() => this.remove(cacheKey), ttl); timer.unref();
        this.entries.set(cacheKey, { ...result, expires: this.now() + ttl, timer });
        return result;
      }).finally(() => this.active.delete(cacheKey));
      this.active.set(cacheKey, pending);
    }
    let onAbort: () => void = () => {};
    const result = await Promise.race([pending, new Promise<{ preview: CachedPreview; result: Category }>(resolve => {
      onAbort = () => resolve({ preview: { url, status: "unavailable" }, result: "timeout" });
      if (budget.signal.aborted) onAbort();
      else budget.signal.addEventListener("abort", onAbort, { once: true });
    })]).finally(() => budget.signal.removeEventListener("abort", onAbort));
    outcome?.(result.result, source, Math.round(performance.now() - started));
    return result.preview;
  }
  private remove(url: string) { const entry = this.entries.get(url); if (entry) clearTimeout(entry.timer); this.entries.delete(url); }

  private async load(url: string, budget: EnrichmentBudget): Promise<{ preview: CachedPreview; result: Category }> {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const deadline = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(new PreviewError("timeout")); }, this.options.timeoutMs ?? PREVIEW_LIMITS.timeoutMs);
    });
    try {
      networkActive++;
      const work = this.fetch(url, AbortSignal.any([controller.signal, budget.signal]), budget).finally(() => { networkActive--; });
      const metadata = await Promise.race([work, deadline]);
      return { preview: { url, status: metadata ? "available" : "unavailable", ...metadata }, result: metadata ? "available" : "unavailable" };
    } catch (error) {
      return { preview: { url, status: "unavailable" }, result: controller.signal.aborted ? "timeout" : error instanceof PreviewError ? error.category : "network" };
    } finally { clearTimeout(timer!); }
  }
  private async fetch(url: string, signal: AbortSignal, budget: EnrichmentBudget): Promise<{ title?: string; description?: string; posts?: PersonalChannelPost[] } | undefined> {
    const postPage = publicChannelPageUrl(url);
    for (let redirects = 0; redirects <= PREVIEW_LIMITS.redirects; redirects++) {
      signal.throwIfAborted();
      budget.reserve(postPage);
      const page = await (this.options.request ?? requestPublicTelegramPage)(url, signal);
      signal.throwIfAborted();
      if (page.status === 429) {
        const raw = page.headers["retry-after"] ?? "";
        const seconds = /^\d+$/.test(raw) ? Number(raw) * 1000 : Date.parse(raw) - this.now();
        this.retryAt = Math.max(this.retryAt, this.now() + (Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds, 2_147_000_000) : 60_000));
        throw new PreviewError("rate_limit");
      }
      if ([301, 302, 303, 307, 308].includes(page.status)) {
        // Public channel redirects never change ownership/path, even to another
        // Telegram username. Unavailable is safer than following a renamed page.
        if (postPage) throw new PreviewError("unsafe");
        const raw = page.headers.location ?? "";
        // Only absolute canonical Telegram links or root-relative chat paths.
        const next = telegramPreviewUrl(raw.startsWith("/") && !raw.startsWith("//") ? `https://t.me${raw}` : raw);
        if (!next || redirects === PREVIEW_LIMITS.redirects) throw new PreviewError("unsafe");
        if (!budget.admit(next)) throw new PreviewError("overload");
        url = next; continue;
      }
      if (page.status !== 200) return;
      if (!/^text\/html(?:;|$)/i.test(page.headers["content-type"] ?? "")) throw new PreviewError("content_type");
      if (Buffer.byteLength(page.body) > (postPage ? POST_LIMITS.pageBytes : PREVIEW_LIMITS.bytes)) throw new PreviewError("oversize");
      if (postPage) {
        const posts = await extractPersonalPosts(page.body, url);
        return posts.length ? { posts } : undefined;
      }
      return extractTelegramPreview(page.body);
    }
  }
}
