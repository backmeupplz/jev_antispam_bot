import { expect, test } from "bun:test";
import { botTestimonialControls, botTestimonialIncident, botTestimonialParaphrases, sideGigControls, sideGigIncident, sideGigParaphrases } from "./fixtures/promo-patterns";
import { testimonialControls, testimonialPromotions } from "./fixtures/testimonial-promotion";
import { reportedRecruitment, vagueRecruitmentControls, vagueRecruitmentVariants } from "./fixtures/vague-recruitment";
import { usdtAsk, usdtAskVariants, usdtBareAsk, usdtBareAskVariants, usdtControls } from "./fixtures/usdt-repeat";
import { cryptoTradeControls, cryptoTradeIncident, cryptoTradeParaphrases, cryptoTradeRepliedAnswers, cryptoTradeReviewAds } from "./fixtures/crypto-trade-asks";
import { directCryptoTradeControls, directCryptoTradeOffer } from "./fixtures/crypto-trade-courier";
import { cryptoCorpusAds, cryptoCorpusKeeps, cryptoCorpusKnownMatches, cryptoCorpusKnownMisses } from "./fixtures/crypto-trade-corpus";
import { corpusAds, corpusKeeps, corpusKnownMatches, corpusKnownMisses, corpusRepliedAnswers } from "./fixtures/promo-corpus";
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
    ...vagueRecruitmentControls, ...Object.values(reportedRecruitment), ...vagueRecruitmentVariants];
  expect(controls.filter((text) => promoPattern(plain(text)) || promoPattern(plain(text, { isForwarded: true })))).toEqual([]);
});

test("a reply to another member's unrelated message is not a request", () => {
  expect(promoPattern(plain(sideGigIncident, memberReply("Сегодня отличная погода, гуляли весь день")))).toBe("side_gig_offer");
  expect(promoPattern(plain(botTestimonialIncident, memberReply("Вчера на трассе была авария, все живы")))).toBe("bot_testimonial");
  // A question or request on another topic is no invitation either.
  expect(promoPattern(plain(sideGigIncident, memberReply("Как дела у всех?")))).toBe("side_gig_offer");
  expect(promoPattern(plain(sideGigIncident, memberReply("Нужно купить хлеб")))).toBe("side_gig_offer");
  // Pay words count whole: a dress or a platform is off topic.
  expect(promoPattern(plain(sideGigIncident, memberReply("Где купить платье на выпускной?")))).toBe("side_gig_offer");
  expect(promoPattern(plain(sideGigIncident, memberReply("Какая платформа лучше для курсов?")))).toBe("side_gig_offer");
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
    "люди ищут ".repeat(400), "подработка нужна ".repeat(240), "возьму " + "любую ".repeat(680),
    "кто " + "а ".repeat(2040) + "продать usdt", "куплю " + "usdt ".repeat(800), "куплю " + "1".repeat(4000) + " usdt",
    "who " + "x ".repeat(2040) + "sells btc", "@aaaa ".repeat(800), "куплю usdt по " + "хорошему ".repeat(400) + "курсу",
    "кто продаст usdt?" + " 1.5".repeat(1000),
    // Word-by-word gap checks: a run of digits, dots or underscores before a non-gap word stays linear (#142 round 2).
    "куплю " + "_".repeat(70) + "ж usdt", "нужен " + "_".repeat(4000) + "ж usdt, пишите", "кто продаст " + "1.".repeat(2000) + "x usdt?",
    "кто продаёт usdt? " + "напишите, кто ".repeat(280), "по " + "аааому ".repeat(580) + "курсу", "подробнее " + "@aaaa ".repeat(600),
    // Round 6: many question sentences, conditional calls, refused DMs and venues.
    "a?".repeat(2048), "кто продаёт usdt? где?".repeat(180), "куплю usdt. " + "если есть вопрос ".repeat(240) + "пишите",
    "куплю usdt, " + "в лс не ".repeat(500) + "торгую", "i buy btc " + "on the ".repeat(580) + "binance, best rates"];
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

test("an answer to an ordinary work question, with its rate and a DM offer, is a requested answer (#128)", () => {
  for (const { question, answer } of corpusRepliedAnswers) {
    expect(promoPattern(plain(answer))).toBe("side_gig_offer");
    expect(promoPattern(plain(answer, memberReply(question)))).toBeUndefined();
  }
  const answer = corpusRepliedAnswers[1]!.answer;
  // Other ways members ask about a job or its pay.
  for (const question of ["Кто-то устраивался в Магнит?", "Кто-нибудь устроился в Магнит?", "Где можно подзаработать?",
    "Сколько зарабатывают курьеры?", "Сколько курьеры получают?", "Какая там ставка?", "Кто где работает?", "Сколько там плотят?",
    "Anyone worked at the Amazon warehouse? How much do they pay?", "Where do you work?", "Кто-нибудь работает на Озоне?",
    "Кто из вас работает в Ленте?", "Работает кто-нибудь на складе?", "What's the pay like?"]) {
    expect(promoPattern(plain(answer, memberReply(question)))).toBeUndefined();
  }
  // Questions about something that works, paying for things or a schedule are off topic.
  for (const question of ["Магазин работает сегодня?", "У кого работает интернет?", "Когда смена расписания?",
    "Does the elevator work?", "Can I pay by card here?", "What should I make for dinner?"]) {
    expect(promoPattern(plain(answer, memberReply(question)))).toBe("side_gig_offer");
  }
  // The question must be another member's request: the same text not asked, or the author's own, exempts nothing.
  expect(promoPattern(plain(answer, memberReply("Работала в Ленте на выкладке")))).toBe("side_gig_offer");
  expect(promoPattern(plain(answer, { preview: [{ kind: "reply", origin: "same_chat", sourceKind: "user",
    sourceAuthor: "same_author", isForwarded: false, text: corpusRepliedAnswers[1]!.question, embeddedLinks: [] }] }))).toBe("side_gig_offer");
});

const crypto = "crypto_trade_ask";
test("#142 and #124 single-send USDT asks match, standalone, as channel-post comments and forwarded", () => {
  for (const text of [cryptoTradeIncident, usdtAsk, ...usdtAskVariants, directCryptoTradeOffer, ...cryptoTradeReviewAds]) {
    for (const patch of [{}, channelReply, { isForwarded: true }]) expect(promoPattern(plain(text, patch))).toBe(crypto);
  }
});

test.each(cryptoTradeParaphrases)("held-out crypto trade paraphrase matches: %s", (text) => {
  expect(promoPattern(plain(text))).toBe(crypto);
});

test("crypto trade controls never match: questions, market talk, goods paid in crypto, warnings, reports and doubts", () => {
  const controls = [...cryptoTradeControls, ...usdtControls, ...directCryptoTradeControls];
  expect(controls.filter((text) => promoPattern(plain(text)) || promoPattern(plain(text, { isForwarded: true })))).toEqual([]);
});

test("the #124 ask without its rate terms has no deal cue and is left to the model and the repeat rule", () => {
  expect([usdtBareAsk, ...usdtBareAskVariants].filter((text) => promoPattern(plain(text)))).toEqual([]);
});

test("a crypto trade answer to another member's trade question is a requested answer", () => {
  for (const { question, answer } of cryptoTradeRepliedAnswers) {
    expect(promoPattern(plain(answer))).toBe(crypto);
    expect(promoPattern(plain(answer, memberReply(question)))).toBeUndefined();
    // A reply to an off-topic member message or a channel post grants nothing.
    expect(promoPattern(plain(answer, memberReply("Как дела у всех?")))).toBe(crypto);
    expect(promoPattern(plain(answer, channelReply))).toBe(crypto);
  }
  expect(promoPattern(plain(cryptoTradeIncident, memberReply("Сегодня отличная погода, гуляли весь день")))).toBe(crypto);
});

test("the pinned crypto review corpus keeps its exact outcome", () => {
  expect(cryptoCorpusAds.filter((text) => promoPattern(plain(text)) !== crypto)).toEqual(cryptoCorpusKnownMisses);
  expect(cryptoCorpusKeeps.filter((text) => promoPattern(plain(text)))).toEqual(cryptoCorpusKnownMatches);
});
