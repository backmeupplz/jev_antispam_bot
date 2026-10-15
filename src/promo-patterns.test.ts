import { expect, test } from "bun:test";
import { botTestimonialControls, botTestimonialIncident, botTestimonialParaphrases, sideGigControls, sideGigIncident, sideGigParaphrases } from "./fixtures/promo-patterns";
import { testimonialControls, testimonialPromotions } from "./fixtures/testimonial-promotion";
import { reportedRecruitment, vagueRecruitmentControls, vagueRecruitmentVariants } from "./fixtures/vague-recruitment";
import { usdtAsk, usdtAskVariants } from "./fixtures/usdt-repeat";
import { corpusAds, corpusKeeps, corpusKnownMatches, corpusKnownMisses } from "./fixtures/promo-corpus";
import { promoPattern, promoText } from "./promo-patterns";
import type { ModerationMessage } from "./spam";

const plain = (text: string, patch: Partial<ModerationMessage> = {}): ModerationMessage => ({ text, embeddedLinks: [], isForwarded: false, ...patch });
const memberReply = (source: string): Partial<ModerationMessage> => ({ preview: [{ kind: "reply", origin: "same_chat",
  sourceKind: "user", sourceAuthor: "other_author", isForwarded: false, text: source, embeddedLinks: [] }] });
const channelReply: Partial<ModerationMessage> = { preview: [{ kind: "reply", origin: "same_chat", sourceKind: "channel",
  sourceAuthor: "other_author", isForwarded: true, text: "Сегодня утром на трассе произошло ДТП с участием трёх автомобилей.", embeddedLinks: [] }] };

test("both #126 incidents match, standalone, as channel-post comments and forwarded", () => {
  for (const patch of [{}, channelReply, { isForwarded: true }]) {
    expect(promoPattern(plain(sideGigIncident, patch))).toBe("side_gig_offer");
    expect(promoPattern(plain(botTestimonialIncident, patch))).toBe("bot_testimonial");
  }
});

test.each(sideGigParaphrases)("held-out side-gig paraphrase matches: %s", (text) => {
  expect(promoPattern(plain(text))).toBe("side_gig_offer");
});

test.each(botTestimonialParaphrases)("held-out bot testimonial paraphrase matches: %s", (text) => {
  expect(promoPattern(plain(text, { isForwarded: true }))).toBe("bot_testimonial");
});

test("existing synthetic @…bot testimonial fixture matches; non-bot promotions are left to the model", () => {
  const results = Object.fromEntries(testimonialPromotions.map(({ id, text }) => [id, promoPattern(plain(text)) ?? null]));
  expect(results).toEqual({ bot: "bot_testimonial", channel: null, group: null, "mini-app": null, site: null, course: null, provider: null });
});

test("controls never match: seekers, discussion, warnings, quoted reports, requests and questions", () => {
  const controls = [...sideGigControls, ...botTestimonialControls, ...testimonialControls.map((c) => c.text),
    ...vagueRecruitmentControls, ...Object.values(reportedRecruitment), ...vagueRecruitmentVariants, usdtAsk, ...usdtAskVariants];
  expect(controls.filter((text) => promoPattern(plain(text)) || promoPattern(plain(text, { isForwarded: true })))).toEqual([]);
});

test("a reply to another member's unrelated message is not a request", () => {
  expect(promoPattern(plain(sideGigIncident, memberReply("Сегодня отличная погода, гуляли весь день")))).toBe("side_gig_offer");
  expect(promoPattern(plain(botTestimonialIncident, memberReply("Вчера на трассе была авария, все живы")))).toBe("bot_testimonial");
  // A question or request on another topic is no invitation either.
  expect(promoPattern(plain(sideGigIncident, memberReply("Как дела у всех?")))).toBe("side_gig_offer");
  expect(promoPattern(plain(sideGigIncident, memberReply("Нужно купить хлеб")))).toBe("side_gig_offer");
  expect(promoPattern(plain(botTestimonialIncident, memberReply("Кто знает, где тут хорошая шаурма?")))).toBe("bot_testimonial");
  expect(promoPattern(plain(botTestimonialIncident, memberReply("Ищу подработку, есть варианты?")))).toBe("bot_testimonial");
  // An external reply carries no source text and grants nothing.
  expect(promoPattern(plain(sideGigIncident, { preview: [{ kind: "external_reply", origin: "external", sourceKind: "user",
    sourceAuthor: "other_author", isForwarded: false, embeddedLinks: [] }] }))).toBe("side_gig_offer");
});

test("matching stays linear on long adversarial input", () => {
  const inputs = ["job " + "1".repeat(4092), "работа " + "1,000 ".repeat(680), "подработка " + "1 ".repeat(2040) + "в лс",
    "«".repeat(4096), '"'.repeat(4096), "прошла " + "a".repeat(4000) + " @xbot", "нужны " + "люди ".repeat(800),
    "прошла @abot ".repeat(315), "ищем " + "людей ".repeat(800), "ищет " + "а ".repeat(2040) + "работу",
    "люди ищут ".repeat(400), "подработка нужна ".repeat(240), "возьму " + "любую ".repeat(680)];
  // Best of 3 runs: a cold first call (regex compilation, JIT) or a busy CI
  // runner can exceed the bound once, while backtracking is slow on every run.
  // The bound allows for the slower Easypanel build host (55 ms best warm run
  // there vs ~20 ms locally); catastrophic backtracking takes seconds.
  for (const text of inputs) {
    let best = Infinity;
    for (let run = 0; run < 3; run++) {
      const started = performance.now();
      promoPattern(plain(text));
      best = Math.min(best, performance.now() - started);
    }
    expect(best).toBeLessThan(250);
  }
});

test("a reply that answers another member is a requested answer, not an ad", () => {
  expect(promoPattern(plain("У нас на складе как раз нужны люди на выходные, платят от 4 тысяч в день, напиши мне в лс",
    memberReply("Ищу подработку на выходные со свободным графиком, может кто знает?")))).toBeUndefined();
  expect(promoPattern(plain("Я проходила тест в @SaveMindBot и поняла, что мне нужен отдых, рекомендую",
    memberReply("Подскажите бота с тестом на выгорание?")))).toBeUndefined();
  // A quote of another member's message is the same kind of answer.
  expect(promoPattern(plain(sideGigIncident, { preview: [{ kind: "quote", origin: "same_chat", sourceKind: "user",
    sourceAuthor: "other_author", isForwarded: false, text: "ищу работу", embeddedLinks: [] }] }))).toBeUndefined();
  // Replying to oneself, a channel post or a forum-topic root (no text) is no request.
  expect(promoPattern(plain(sideGigIncident, { preview: [{ kind: "reply", origin: "same_chat", sourceKind: "user",
    sourceAuthor: "same_author", isForwarded: false, text: "earlier", embeddedLinks: [] }] }))).toBe("side_gig_offer");
  expect(promoPattern(plain(sideGigIncident, { preview: [{ kind: "reply", origin: "same_chat", sourceKind: "user",
    sourceAuthor: "other_author", isForwarded: false, embeddedLinks: [] }] }))).toBe("side_gig_offer");
});

test("uncaptioned media and empty text never match", () => {
  expect(promoPattern(plain("", { mediaOnly: true }))).toBeUndefined();
  expect(promoPattern(plain("   "))).toBeUndefined();
});

test("normalization folds case, accents, lookalikes, emoji and o-for-zero but keeps й and line breaks", () => {
  expect(promoText("Подработка  \r\n\n  от 5000\t в день")).toBe("пoдpaбotka\not 5000 b дehь");
  expect(promoText("Зaрплaтa 5ООО₽ в ДЕНЬ 🔥 пиши!")).toBe("зapплata 5000₽ b дehь пиши!");
  expect(promoText("Райский")).toBe(promoText("райский"));
  expect(promoText("Райский")).not.toBe(promoText("раиский"));
});

test("the pinned review corpus keeps its exact outcome: no ad lost, no conversation matched", () => {
  expect(corpusAds.filter((text) => promoPattern(plain(text)) !== "side_gig_offer")).toEqual(corpusKnownMisses);
  expect(corpusKeeps.filter((text) => promoPattern(plain(text)))).toEqual(corpusKnownMatches);
});
