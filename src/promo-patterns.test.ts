import { expect, test } from "bun:test";
import { debtAnswer, debtHelpIncident, debtQuestion, dmAnswer, dmQuestion, moneyBaitControls, moneyBaitFamily, moneyBaitReviewAds, moneyBaitReviewControls, moneyBaitReview3Ads, moneyBaitReview3Controls, moneyBaitReview4Ads, moneyBaitReview4Controls, moneyBaitReview6Ads, moneyBaitReview6Controls, moneyBaitReview10Ads, moneyBaitReview10Controls, moneyBaitReview13Ads, moneyBaitReview13Controls, notOddJobs, sideGigBait, oddJobIncident, oddJobOpeners, quickMoneyIncident } from "./fixtures/money-bait";
import { botTestimonialControls, botTestimonialFloorIncident, botTestimonialIncident, botTestimonialParaphrases, sideGigControls, sideGigEuroWeeklyControls, sideGigEuroWeeklyIncident,
  sideGigEuroWeeklyParaphrases, sideGigHiddenLinkControls, sideGigHiddenLinkIncident, sideGigHiddenLinkVariants, sideGigIncident, sideGigParaphrases } from "./fixtures/promo-patterns";
import { testimonialControls, testimonialPromotions } from "./fixtures/testimonial-promotion";
import { reportedRecruitment, vagueRecruitmentControls, vagueRecruitmentVariants } from "./fixtures/vague-recruitment";
import { usdtAsk, usdtAskVariants, usdtBareAsk, usdtBareAskVariants, usdtControls } from "./fixtures/usdt-repeat";
import { cryptoTradeControls, cryptoTradeIncident, cryptoTradeParaphrases, cryptoTradeRepliedAnswers, cryptoTradeReviewAds } from "./fixtures/crypto-trade-asks";
import { directCryptoTradeControls, directCryptoTradeOffer } from "./fixtures/crypto-trade-courier";
import { cryptoCorpusAds, cryptoCorpusKeeps, cryptoCorpusKnownMatches, cryptoCorpusKnownMisses } from "./fixtures/crypto-trade-corpus";
import { corpusAds, corpusKeeps, corpusKnownMatches, corpusKnownMisses, corpusRepliedAnswers } from "./fixtures/promo-corpus";
import { adultPromoControls, adultPromoIncident, adultPromoIncidentButtons, adultPromoParaphrases, adultPromoReviewAds, lonelyBaitControls,
  lonelyBaitIncident, lonelyBaitParaphrases } from "./fixtures/adult-promo";
import { adultCorpusAds, adultCorpusKeeps, adultCorpusKnownMatches, adultCorpusKnownMisses, type AdultCorpusItem } from "./fixtures/adult-promo-corpus";
import { bookCopyControls, bookCopyFamily, bookCopyIncident, bookCopyLongReview, bookCopyParaphrases } from "./fixtures/book-copy-offer";
import { bookCorpusAds, bookCorpusKeeps, bookCorpusKnownMatches, bookCorpusKnownMisses } from "./fixtures/book-copy-corpus";
import { profitTestimonialAnswer, profitTestimonialArrowAds, profitTestimonialControls, profitTestimonialEnglishGuardAds, profitTestimonialFamily,
  profitTestimonialFrDeControls, profitTestimonialFrDeIncidents, profitTestimonialFrDeParaphrases, profitTestimonialFrDePointerAds,
  profitTestimonialFrDePointerControls, profitTestimonialFrDeReviewAds, profitTestimonialFrDeReviewControls, profitTestimonialIncident,
  profitTestimonialParaphrases, profitTestimonialRequest, profitTestimonialReviewAds } from "./fixtures/profit-testimonial";
import { mindsetHookAnswer, mindsetHookControls, mindsetHookIncident, mindsetHookParaphrases, mindsetHookRequest, mindsetHookReview2Ads, mindsetHookReview2Controls, mindsetHookReview4Ads, mindsetHookReview4Controls, mindsetHookReview5Ads, mindsetHookReview5Controls, mindsetHookReview6Ads, mindsetHookReview6Controls, mindsetHookReview7Ads, mindsetHookReview7Controls, mindsetHookReview8Controls, mindsetHookReview9Ads, mindsetHookReview9Controls, mindsetHookReview10Ads, mindsetHookReview10Controls, mindsetHookReview11Ads, mindsetHookReview11Controls, mindsetHookReview12Controls, mindsetHookReview13Ads, mindsetHookReview13Controls, mindsetHookReview15Ads, mindsetHookReview15Controls, mindsetHookReview16Ads, mindsetHookReview16Controls, mindsetHookReview18Ads, mindsetHookReview18Controls, mindsetHookReview19Ads, mindsetHookReview19Controls, mindsetHookReviewAds,
  mindsetHookReviewControls, mindsetHookReviewReplies } from "./fixtures/mindset-hook";
import {
  botSummonControls, botSummonFamily, botSummonIncident, cjkIncidentScores, cjkJobControls, cjkJobFamily, cjkJobIncident, cjkJobMentionFamily,
  cjkJobMentionRemarks,
} from "./fixtures/cjk-job-spam";
import {
  botSummon, carriesLink, chatMovedLure, CJK_MENTION_MIN_SCORE, cjkJobSpam, moneyBait, oddJobOpener, PATTERN_MIN_SCORE, patternMinScore, promoPattern,
  promoText,
} from "./promo-patterns";
import type { ModerationMessage } from "./spam";
import { chatMovedControls, chatMovedFamily, chatMovedHidden, chatMovedIncident, chatMovedLink, guestSummon } from "./fixtures/chat-moved-lure";

// Best of 3 runs: a cold first call (regex compilation, JIT) or a busy CI runner can exceed a bound once,
// while backtracking is slow on every run. A warm run takes ~20 ms here (55 ms on the Easypanel build host) and
// catastrophic backtracking takes seconds; the bound sits between, with room for a runner shared with ~10x its
// cores of other work (320 ms seen).
const LINEAR_MS = 1_000;
function fastest(run: () => unknown): number {
  let best = Infinity;
  for (let i = 0; i < 3; i++) { const started = performance.now(); run(); best = Math.min(best, performance.now() - started); }
  return best;
}

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

test("the #152 forwarded testimonial matches, standalone, as a channel-post comment and forwarded", () => {
  for (const patch of [{}, channelReply, { isForwarded: true }]) expect(promoPattern(plain(botTestimonialFloorIncident, patch))).toBe("bot_testimonial");
});

test.each(sideGigParaphrases)("held-out side-gig paraphrase matches: %s", (text) => {
  expect(promoPattern(plain(text))).toBe("side_gig_offer");
});

test("the #561 weekly-euro vacancy matches, standalone, as a channel-post comment and forwarded", () => {
  for (const patch of [{}, channelReply, { isForwarded: true }]) expect(promoPattern(plain(sideGigEuroWeeklyIncident, patch))).toBe("side_gig_offer");
  // "здесь" carrying the link as a hidden text link.
  for (const text of sideGigHiddenLinkVariants) expect(promoPattern(plain(text, { embeddedLinks: ["https://example.sbs/job"] }))).toBe("side_gig_offer");
  expect(promoPattern(plain(sideGigHiddenLinkIncident))).toBeUndefined();
  for (const { text, url, isForwarded } of sideGigHiddenLinkControls) expect(promoPattern(plain(text, { embeddedLinks: [url], isForwarded }))).toBeUndefined();
  // Answering a member who asked for work from home is requested.
  expect(promoPattern(plain(sideGigEuroWeeklyIncident, memberReply("Ищу работу из дома, есть варианты?")))).toBeUndefined();
});

test.each(sideGigEuroWeeklyParaphrases)("#561 paraphrase matches: %s", (text) => {
  expect(promoPattern(plain(text))).toBe("side_gig_offer");
});

test.each(sideGigEuroWeeklyControls)("#561 control never matches: %s", (text) => {
  expect(promoPattern(plain(text))).toBeUndefined();
  expect(promoPattern(plain(text, { isForwarded: true }))).toBeUndefined();
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
  for (const text of inputs) {
    expect(fastest(() => promoPattern(plain(text)))).toBeLessThan(LINEAR_MS);
  }
});

test("#561 bare domains, periodic pay and hidden links stay linear on long adversarial input", () => {
  const inputs = ["работа 800 евро еженедельно здесь " + "a.".repeat(2040), "вакансия еженедельно " + "1 евро ".repeat(580) + "здесь x.sbs",
    "работа 800 еженедельно подробнее " + "a-".repeat(2040) + ".com", "работа 800 евро в неделю здесь " + "a.b ".repeat(1020),
    "работа 800 евро еженедельно " + "ежемесячный ".repeat(340) + "здесь", "работа 800 евро в неделю " + "👉".repeat(2000),
    "работа 800 евро в неделю здесь " + ".".repeat(4000) + "a", "работа 800 евро в неделю здесь " + ". ".repeat(2000) + "a"];
  for (const text of inputs) for (const embeddedLinks of [[], ["https://example.sbs"]]) {
    expect(fastest(() => promoPattern(plain(text, { embeddedLinks })))).toBeLessThan(LINEAR_MS);
  }
}, 30_000);

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

const adult = "adult_content_promo";
test("the #145 adult promo matches with or without its buttons, standalone, as a channel-post comment and forwarded", () => {
  for (const patch of [{}, channelReply, { isForwarded: true }, { isForwarded: true, inlineButtons: adultPromoIncidentButtons }]) {
    expect(promoPattern(plain(adultPromoIncident, patch))).toBe(adult);
  }
});

test.each(adultPromoParaphrases)("held-out adult promo matches: %s", (text) => {
  expect(promoPattern(plain(text))).toBe(adult);
});

test.each(adultPromoReviewAds)("adult promo found in review matches: %s", (text) => {
  expect(promoPattern(plain(text))).toBe(adult);
});

test("adult promo controls never match: reports, complaints, rules, denials, health, news, jokes and look-alike words", () => {
  expect(adultPromoControls.filter((text) => promoPattern(plain(text)) || promoPattern(plain(text, { isForwarded: true })))).toEqual([]);
});

test("explicit terms need a funnel, and URL buttons are one", () => {
  const bare = "XxX unlim p0rn content, new drops every night";
  expect(promoPattern(plain(bare))).toBeUndefined();
  expect(promoPattern(plain(bare, { inlineButtons: adultPromoIncidentButtons }))).toBe(adult);
  // One adult-service phrase is no adult term; two together are.
  expect(promoPattern(plain("Private rooms available, tap the button below"))).toBeUndefined();
  expect(promoPattern(plain("Private rooms · face cam · no blur — tap the button below"))).toBe(adult);
  // A quoted ad inside a moderator's reminder is not the author's offer.
  expect(promoPattern(plain("Posts like «XXX p0rn content, tap a button below» get you removed, please read the pinned message"))).toBeUndefined();
});

test("the #625 lonely-night bait matches standalone, under a channel post and forwarded", () => {
  for (const patch of [{}, channelReply, { isForwarded: true }]) expect(promoPattern(plain(lonelyBaitIncident, patch))).toBe(adult);
});

test.each(lonelyBaitParaphrases)("held-out lonely-night bait matches: %s", (text) => {
  expect(promoPattern(plain(text))).toBe(adult);
});

test("lonely-night bait controls never match: a member's own evening, reports, jokes and posts about something else", () => {
  expect(lonelyBaitControls.filter((text) => promoPattern(plain(text)) || promoPattern(plain(text, { isForwarded: true })))).toEqual([]);
  // The bait needs a pointer and a teaser or a plea, and stays short.
  expect(promoPattern(plain("Так не хочется сегодня проводить ночь одной, поможешь мне с этим?😏"))).toBeUndefined();
  expect(promoPattern(plain("Так не хочется сегодня проводить ночь одной. Смотри внимательнее пост"))).toBeUndefined();
  expect(promoPattern(plain(`${"Длинная история про мой день. ".repeat(10)}${lonelyBaitIncident}`))).toBeUndefined();
});

test("lonely-night bait matching stays fast on 4,096-character adversarial input", () => {
  for (const unit of ["ночь ", "одной ", "смотри ", "ночь одной смотри ", "night alone check ", "скучно ", "a "]) {
    const text = unit.repeat(Math.ceil(4096 / unit.length)).slice(0, 4096);
    expect(fastest(() => promoPattern(plain(text)))).toBeLessThan(LINEAR_MS);
  }
});

test("the pinned adult review corpus keeps its exact outcome", () => {
  const withButtons = ([text, buttons]: AdultCorpusItem) => plain(text, buttons ? { inlineButtons: [{ kind: "url", text: "Open", url: "https://example.invalid/x" }] } : {});
  expect(adultCorpusAds.filter((item) => promoPattern(withButtons(item)) !== adult)).toEqual(adultCorpusKnownMisses);
  expect(adultCorpusKeeps.filter((item) => promoPattern(withButtons(item)))).toEqual(adultCorpusKnownMatches);
});

test("adult promo matching stays fast on 4,096-character adversarial input", () => {
  const inputs = ["p0rn ".repeat(819), "xxx ".repeat(1024), "18+ ".repeat(1024), "no blur private rooms face cam ".repeat(136),
    "someone ".repeat(512), "tap the ".repeat(512), "@a_bot ".repeat(585), "запрещено ".repeat(409), "porn, join ".repeat(373),
    "porn 👇 ".repeat(586), "порно в лс ".repeat(373), "dm me porn ".repeat(373), "porn — join — ".repeat(293),
    "stop sending me me me ".repeat(187), "порно хватит слать " + "это ".repeat(1100), "не шлите мне мне ".repeat(241), "бот @a_bot в ".repeat(316),
    "zz " + ("guys" + ",".repeat(300)).repeat(3) + "porn bot @x_bot in the comments", "zz " + ("ребят" + ".".repeat(300)).repeat(3) + "в комментах порно бот @x_bot"].map((text) => text.slice(0, 4096));
  // Every input with and without buttons: without them the content-call, DM-call and arrow funnels run too.
  for (const [i, text] of inputs.flatMap((text) => [text, text]).entries()) {
    expect(fastest(() => promoPattern(plain(text, i % 2 ? {} : { inlineButtons: adultPromoIncidentButtons })))).toBeLessThan(LINEAR_MS);
  }
});

const book = "book_copy_offer";
test("the #153 free-copy bait matches standalone, as a channel-post comment and forwarded", () => {
  for (const patch of [{}, channelReply, { isForwarded: true }]) expect(promoPattern(plain(bookCopyIncident, patch))).toBe(book);
});

test.each(bookCopyLongReview)("the #430 long-review bait matches standalone, as a channel-post comment and forwarded: %s", (text) => {
  for (const patch of [{}, channelReply, { isForwarded: true }]) expect(promoPattern(plain(text, patch))).toBe(book);
  expect(promoPattern(plain(text, memberReply("Кто читал Ротшильда? Скиньте книгу, пожалуйста")))).toBeUndefined();
});

test.each([...bookCopyFamily, ...bookCopyParaphrases])("free-copy bait variant matches: %s", (text) => {
  expect(promoPattern(plain(text))).toBe(book);
});

test("free-copy controls never match: requests, book talk, public links and libraries, reports, rules and refusals", () => {
  expect(bookCopyControls.filter((text) => promoPattern(plain(text)) || promoPattern(plain(text, { isForwarded: true })))).toEqual([]);
});

test("a free-copy offer answering another member's book request is a requested answer", () => {
  expect(promoPattern(plain(bookCopyIncident, memberReply("Кто-нибудь слушал Форда? Есть у кого аудиокнига?")))).toBeUndefined();
  expect(promoPattern(plain(bookCopyIncident, memberReply("Как дела у всех?")))).toBe(book);
});

test("the pinned free-copy review corpus keeps its exact outcome", () => {
  expect(bookCorpusAds.filter((text) => promoPattern(plain(text)) !== book)).toEqual(bookCorpusKnownMisses);
  expect(bookCorpusKeeps.filter((text) => promoPattern(plain(text)))).toEqual(bookCorpusKnownMatches);
});

test("free-copy matching stays fast on 4,096-character adversarial input", () => {
  const inputs = ["послушал книгу ".repeat(273), "могу скинуть ".repeat(315), "если кому интересно ".repeat(204), "послушал «".repeat(409),
    "прочитал книгу, могу скинуть " + "а ".repeat(2000), "i can send ".repeat(372), "if anyone is ".repeat(315), "могу а а скинуть ".repeat(240),
    "книга. ".repeat(585), "послушал аудиокнигу, если кому интересно, могу скинуть".repeat(73),
    // Every offer looks back over a bounded window at the last work word (#153 review 2).
    "прочитал книгу, очень понравилась, если кому надо, скину, ".repeat(70), "книга и ".repeat(512), "могу скинуть\n".repeat(315),
    "i read the book and loved it, if anyone wants it i can send it, ".repeat(64), "есть " + "очень ".repeat(800) + "книга, скину",
    // A long review before each offer is read over a bounded window (#430).
    "Дочитал книгу. " + "Это база. Испекла пирог. Могу скинуть, пишите. ".repeat(86), "Дочитал книгу" + ". ".repeat(2040) + "Могу скинуть, пишите",
    "Недавно дочитал «Искусство наживать деньги» " + "а ".repeat(2000) + ". Могу скинуть кому интересно",
    // Lead-ins, "в аудио" and formats (#153 review 5).
    "опять снова тот же вижу: ".repeat(164), "Опять снова снова снова снова: послушай ".repeat(103), "послушал " + "а ".repeat(2000) + "в аудио",
    "i just read the pdf rules, i can send it ".repeat(100),
    // A lead-in counts only before the first read verb (#153 review 6).
    "а ".repeat(1000) + "послушал. опять: послушал ".repeat(80), "опять: послушал книгу, скину. ".repeat(136)].map((text) => text.slice(0, 4096));
  for (const text of inputs) {
    expect(fastest(() => promoPattern(plain(text)))).toBeLessThan(LINEAR_MS);
  }
});

const profit = "profit_testimonial";
test("the #465 trading-guru testimonial matches standalone, as a channel-post comment and forwarded", () => {
  for (const patch of [{}, channelReply, { isForwarded: true }]) expect(promoPattern(plain(profitTestimonialIncident, patch))).toBe(profit);
});

test.each([...profitTestimonialFamily, ...profitTestimonialParaphrases, ...profitTestimonialReviewAds, ...profitTestimonialArrowAds])("profit testimonial variant matches: %s", (text) => {
  expect(promoPattern(plain(text))).toBe(profit);
});

test("a profit claim with a call reaches its contact through buttons or a text link too", () => {
  const claim = "Mrs Kate turned my $300 into $9,450 in 3 days of trading. Click the link below and thank me later";
  expect(promoPattern(plain(claim))).toBeUndefined();
  expect(promoPattern(plain(claim, { embeddedLinks: ["https://t.me/+KateProfits"] }))).toBe(profit);
  expect(promoPattern(plain(claim, { inlineButtons: [{ kind: "url", text: "Join", url: "https://t.me/+KateProfits" }] }))).toBe(profit);
});

test("profit testimonial controls never match: trading talk, warnings, victims, jokes, prices and conversions", () => {
  expect(profitTestimonialControls.filter((text) => promoPattern(plain(text)) || promoPattern(plain(text, { isForwarded: true })))).toEqual([]);
});

test.each([...profitTestimonialFrDeIncidents, ...profitTestimonialFrDeParaphrases, ...profitTestimonialFrDeReviewAds, ...profitTestimonialFrDePointerAds])(
  "#468 French or German profit testimonial matches: %s", (text) => {
    for (const patch of [{}, channelReply, { isForwarded: true }]) expect(promoPattern(plain(text, patch))).toBe(profit);
  });

test("#468 French and German controls never match: trading talk, warnings, victims, negations, questions, prices and conversions", () => {
  expect(profitTestimonialFrDeControls.filter((text) => promoPattern(plain(text)) || promoPattern(plain(text, { isForwarded: true })))).toEqual([]);
});

test("#468 French and German pointers toward the author's own channel, a friend or a public link never match", () => {
  expect(profitTestimonialFrDePointerControls.filter((text) => promoPattern(plain(text)) || promoPattern(plain(text, { isForwarded: true })))).toEqual([]);
});

test("#468 English claims stay with the English lexicon, and its review controls never match", () => {
  expect(profitTestimonialEnglishGuardAds.filter((text) => promoPattern(plain(text)) !== profit)).toEqual([]);
  expect(profitTestimonialFrDeReviewControls.filter((text) => promoPattern(plain(text)) || promoPattern(plain(text, { isForwarded: true })))).toEqual([]);
});

test("a profit testimonial answering another member's trading request is a requested answer", () => {
  expect(promoPattern(plain(profitTestimonialAnswer, memberReply(profitTestimonialRequest)))).toBeUndefined();
  expect(promoPattern(plain(profitTestimonialAnswer, memberReply("How did you earn so much?")))).toBeUndefined();
  expect(promoPattern(plain(profitTestimonialAnswer, memberReply("Как дела у всех?")))).toBe(profit);
  // #468: French and German topic words count only in a French or German request ("retired", "placement" and "Handel" are English too).
  for (const request of ["Anyone here retired early?", "How do you plan for retirement?", "Anyone know a good job placement agency?", "Who likes Handel?"]) {
    expect(promoPattern(plain(profitTestimonialAnswer, memberReply(request)))).toBe(profit);
  }
  expect(promoPattern(plain(profitTestimonialAnswer, memberReply("Vous connaissez un bon courtier pour les placements ?")))).toBeUndefined();
  expect(promoPattern(plain(profitTestimonialAnswer))).toBe(profit);
});

test("profit testimonial matching stays fast on 4,096-character adversarial input", () => {
  const inputs = ["turned my $500 to ".repeat(228), "€1 ".repeat(1366), "1 000 000 ".repeat(410), "i invested $1 and ".repeat(228),
    "made $9 from only only ".repeat(178), "my $1 " + "only ".repeat(800) + "$900", "contact him ".repeat(342), "t.me/+".repeat(683),
    "i turned my $500 into $38,600, " + "a ".repeat(2000) + "click the link t.me/+abc", "1".repeat(4096), "1.".repeat(2048),
    "Mr. ".repeat(1024), "i invested $500 " + "x".repeat(4000) + " got $9000", "@aaaa\n".repeat(682),
    // #468: French and German.
    "ich nicht nicht 9.000 € mit 1 € ".repeat(128), "j'ai transformé 500 € en ".repeat(164), "Ich habe 500 € investiert und ".repeat(136),
    "aus 1 € wurden in 5 Tagen ".repeat(157), "M. ".repeat(1365), "mein Investment in einen Gewinn von 1 € ".repeat(102),
    "Après avoir investi la somme de 1000 €, j'ai réalisé un bénéfice de " + "très ".repeat(780) + "10 500 € t.me/+abc",
    "Grâce à M. " + "Dupont ".repeat(580) + "t.me/x", "Mes notes ici " + ": ".repeat(2000) + "t.me/x",
    // #468 review 5: a line of told calls, each read with its own negations and clause.
    "Ich habe 500 € investiert und 9.000 € erzielt, " + "er und schreibt mir, ".repeat(190) + "@abcd_x",
    "J'ai investi 500 € et j'ai obtenu 9 000 € en trading. " + "j'ai contacté M. ".repeat(230)].map((text) => text.slice(0, 4096));
  for (const text of inputs) {
    expect(fastest(() => promoPattern(plain(text)))).toBeLessThan(LINEAR_MS);
  }
});

const hook = "mindset_hook";
test("the #611 funnel-less mindset hook matches standalone, as a channel-post comment and forwarded", () => {
  for (const patch of [{}, channelReply, { isForwarded: true }]) expect(promoPattern(plain(mindsetHookIncident, patch))).toBe(hook);
  for (const text of mindsetHookParaphrases) expect([text, promoPattern(plain(text))]).toEqual([text, hook]);
});

test("film and book talk, questions to the chat, skeptics, stories about others and reports are no mindset hook", () => {
  for (const text of mindsetHookControls) expect([text, promoPattern(plain(text))]).toEqual([text, undefined]);
  // Every part is needed: the opener, the told second-person claim and the closing question to "you".
  const [opener, claim] = ["Недавно пересмотрел интересный фильм.", "Твой успех зависит от масштаба твоего мышления."];
  const close = "А если именно твой образ мышления определяет границы?";
  expect(promoPattern(plain([opener, claim, close].join(" ")))).toBe(hook);
  for (const parts of [[claim, close], [opener, close], [opener, claim], [opener, claim, "А ты смотрел?"], [opener, claim, close, "Пишите, что думаете."]]) {
    expect([parts, promoPattern(plain(parts.join(" ")))]).toEqual([parts, undefined]);
  }
  // Long posts are left to the model.
  expect(promoPattern(plain(mindsetHookIncident.replace("решительности", "решительности, " + "упорства и терпения, ".repeat(25))))).toBeUndefined();
});

test("in a reply to another member's message the \"you\" is that member; a channel-post comment still matches", () => {
  expect(promoPattern(plain(mindsetHookAnswer, memberReply(mindsetHookRequest)))).toBeUndefined();
  expect(promoPattern(plain(mindsetHookAnswer, memberReply("Какой фильм посмотреть вечером?")))).toBeUndefined();
  expect(promoPattern(plain(mindsetHookAnswer, memberReply("Всем привет! Как дела?")))).toBeUndefined();
  for (const [answer, source] of mindsetHookReviewReplies) {
    expect(promoPattern(plain(answer, memberReply(source)))).toBeUndefined();
    expect(promoPattern(plain(answer))).toBe(hook);
  }
  // A channel post, the author's own message or no reply at all leaves the post standalone.
  expect(promoPattern(plain(mindsetHookAnswer, channelReply))).toBe(hook);
  expect(promoPattern(plain(mindsetHookAnswer, { preview: [{ ...memberReply("Как дела?").preview![0]!, sourceAuthor: "same_author" }] }))).toBe(hook);
  expect(promoPattern(plain(mindsetHookAnswer))).toBe(hook);
});

test("#611 review: a named member, a film's, parent's or teacher's words, boundaries, sarcasm and pasted copies are no mindset hook", () => {
  for (const text of [...mindsetHookReviewControls, ...mindsetHookReview2Controls]) expect([text, promoPattern(plain(text))]).toEqual([text, undefined]);
  for (const text of [...mindsetHookReviewAds, ...mindsetHookReview2Ads]) expect([text, promoPattern(plain(text))]).toEqual([text, hook]);
});

test("#611 review 9: a close asking the chat for a recommendation, a fact, a shared taste or whether \"you\" saw it, and a \"Кто ещё …?\", are no mindset hook", () => {
  for (const text of [...mindsetHookReview9Controls, ...mindsetHookReview10Controls, ...mindsetHookReview11Controls, ...mindsetHookReview12Controls, ...mindsetHookReview13Controls, ...mindsetHookReview15Controls, ...mindsetHookReview16Controls, ...mindsetHookReview18Controls, ...mindsetHookReview19Controls]) expect([text, promoPattern(plain(text))]).toEqual([text, undefined]);
  for (const text of [...mindsetHookReview9Ads, ...mindsetHookReview10Ads, ...mindsetHookReview11Ads, ...mindsetHookReview13Ads, ...mindsetHookReview15Ads, ...mindsetHookReview16Ads, ...mindsetHookReview18Ads, ...mindsetHookReview19Ads]) expect([text, promoPattern(plain(text))]).toEqual([text, hook]);
  expect(promoPattern(plain(mindsetHookIncident))).toBe(hook);
  for (const text of mindsetHookParaphrases) expect([text, promoPattern(plain(text))]).toEqual([text, hook]);
});

test("#611 review 4: an @mention anywhere, a name before a closing emoji, a claim handed to a book, film, quote or coach and a reply to a textless member message are no mindset hook", () => {
  for (const text of [...mindsetHookReview4Controls, ...mindsetHookReview5Controls, ...mindsetHookReview6Controls, ...mindsetHookReview7Controls, ...mindsetHookReview8Controls]) expect([text, promoPattern(plain(text))]).toEqual([text, undefined]);
  for (const text of [...mindsetHookReview4Ads, ...mindsetHookReview5Ads, ...mindsetHookReview6Ads, ...mindsetHookReview7Ads]) expect([text, promoPattern(plain(text))]).toEqual([text, hook]);
  // A reply to another member's voice note, photo or sticker: "you" is that member, though the source has no text.
  const textless = { preview: [{ ...memberReply("x").preview![0]!, text: undefined }] };
  for (const [answer] of mindsetHookReviewReplies) expect(promoPattern(plain(answer, textless))).toBeUndefined();
  expect(promoPattern(plain(mindsetHookIncident, textless))).toBeUndefined();
  // A textless reply to the author's own message or a channel post, and an external reply, leave the post standalone.
  expect(promoPattern(plain(mindsetHookIncident, { preview: [{ ...textless.preview[0]!, sourceAuthor: "same_author" }] }))).toBe(hook);
  expect(promoPattern(plain(mindsetHookIncident, { preview: [{ ...textless.preview[0]!, sourceKind: "channel" }] }))).toBe(hook);
  expect(promoPattern(plain(mindsetHookIncident, { preview: [{ kind: "external_reply", origin: "external", sourceKind: "user",
    sourceAuthor: "other_author", isForwarded: false, embeddedLinks: [] }] }))).toBe(hook);
});

test("mindset hook matching stays fast on 4,096-character adversarial input", () => {
  const inputs = ["недавно посмотрел фильм. ".repeat(164), "твой успех зависит от твоего мышления, ".repeat(106), "а если твой успех? ".repeat(216),
    "недавно посмотрел фильм и " + "твой ".repeat(800) + "?", "смотрел".repeat(585), ".".repeat(4096), "?".repeat(4096), "\n".repeat(4096),
    "саша, " + "a, ".repeat(2000) + "дима?", "ты " + "a ".repeat(2000) + "советовал", "🎬 ".repeat(1400),
    // A run of hyphens or a long hyphenated word after a heading word, which once split many ways in the heading's tail (#611 review 18).
    "Посмотрел фильм. мысль " + "-".repeat(626) + ",твой успех зависит от мышления. А если твой успех?",
    "Посмотрел фильм. мысль " + "а-".repeat(313) + ",твой успех зависит от мышления. А если твой успех?",
    "Посмотрел фильм. мой " + "а-".repeat(313) + " мысль - твой успех зависит от мышления. А если твой успех?",
    "Посмотрел фильм. Твой успех " + "не от мышления ".repeat(45) + "зависит. А если твой успех?",
    "Посмотрел фильм. Твой успех зависит от удачи, а не от мышления" + " и амбиций".repeat(60) + ". А если твой успех?",
    "Посмотрел фильм. Твой успех зависит " + "не от позитивного мышления, ".repeat(24) + "а от удачи. А если твой успех?",
    "Посмотрел фильм. мысль " + "- ".repeat(300) + "твой успех зависит от мышления. А если твой успех?",
    "Посмотрел фильм. Твой успех зависит не " + "ого".repeat(215) + " мышления. А если твой успех?",
    "Посмотрел фильм. Твой успех зависит от удачи, а не " + "о-".repeat(320) + "о мышления. А если твой успех?"]
    // Over 700 characters the rule returns at once, so the inputs sit at its length bound.
    .map((text) => text.slice(0, 700));
  for (const text of inputs) expect(fastest(() => promoPattern(plain(text)))).toBeLessThan(LINEAR_MS);
});

// #624: short Russian money bait, and the odd-job opener that only joins it in src/bot.ts.
test("the #624 quick-money and debt-help bait matches standalone, as a channel-post comment and forwarded", () => {
  for (const patch of [{}, channelReply, { isForwarded: true }]) {
    for (const text of [quickMoneyIncident, debtHelpIncident]) expect([text, promoPattern(plain(text, patch)), moneyBait(plain(text, patch))]).toEqual([text, "money_bait", true]);
  }
  for (const text of [...moneyBaitFamily, ...moneyBaitReviewAds, ...moneyBaitReview3Ads, ...moneyBaitReview4Ads, ...moneyBaitReview6Ads, ...moneyBaitReview10Ads, ...moneyBaitReview13Ads]) expect([text, promoPattern(plain(text))]).toEqual([text, "money_bait"]);
  // Matched first by the side-gig rule, it is still the actor's money bait.
  expect([promoPattern(plain(sideGigBait)), moneyBait(plain(sideGigBait))]).toEqual(["side_gig_offer", true]);
});

test("help requests, debt questions, seekers, own stories, plain DM calls and reports are no money bait", () => {
  for (const text of [...moneyBaitControls, ...moneyBaitReviewControls, ...moneyBaitReview3Controls, ...moneyBaitReview4Controls, ...moneyBaitReview6Controls, ...moneyBaitReview10Controls, ...moneyBaitReview13Controls]) expect([text, promoPattern(plain(text)), moneyBait(plain(text))]).toEqual([text, undefined, false]);
  // A reply that answers a member's debt question helps that member.
  expect(moneyBait(plain(debtAnswer, memberReply(debtQuestion)))).toBe(false);
  expect(promoPattern(plain(debtAnswer))).toBe("money_bait");
  expect(promoPattern(plain(dmAnswer, memberReply(dmQuestion)))).toBeUndefined();
});

test("the odd-job opener is never a pattern on its own", () => {
  for (const text of oddJobOpeners) {
    expect([text, oddJobOpener(plain(text))]).toEqual([text, true]);
    expect(promoPattern(plain(text))).toBeUndefined();
  }
  for (const text of notOddJobs) expect([text, oddJobOpener(plain(text))]).toEqual([text, false]);
  expect(oddJobOpener(plain(oddJobIncident, { mediaOnly: true }))).toBe(false);
});

test("money bait and odd-job matching stays linear on adversarial input", () => {
  const long = ("за пару часов поднять " + "денег ".repeat(40) + "кто выручит " + "очень ".repeat(40)).repeat(4).slice(0, 4096);
  expect(fastest(() => { promoPattern(plain(long)); oddJobOpener(plain(long)); })).toBeLessThan(LINEAR_MS);
  const digits = ("за 1" + "1".repeat(60) + " ").repeat(60).slice(0, 4096);
  expect(fastest(() => promoPattern(plain(digits)))).toBeLessThan(LINEAR_MS);
});

// #634: Chinese part-time-job recruitment, and the bot-summon opener that announces an ad.
test("the #634 Chinese job spam matches standalone, as a channel-post comment and forwarded, with its family", () => {
  // Rebuilt from the screenshot: 220 characters against the logged 221, so one whitespace character is not visible in it.
  expect(cjkJobIncident.length).toBe(220);
  for (const patch of [{}, channelReply, { isForwarded: true }]) expect(promoPattern(plain(cjkJobIncident, patch))).toBe("cjk_job_spam");
  for (const text of cjkJobFamily) expect([text, promoPattern(plain(text))]).toEqual([text, "cjk_job_spam"]);
});

test("a Chinese job line ending on a bare mention is a cjk_job_mention match, ad or remark alike, with its own floor", () => {
  for (const text of [...cjkJobMentionFamily, ...cjkJobMentionRemarks]) {
    expect([text, promoPattern(plain(text)), cjkJobSpam(plain(text))]).toEqual([text, "cjk_job_mention", false]);
  }
  expect(patternMinScore("cjk_job_mention")).toBe(CJK_MENTION_MIN_SCORE);
  expect(patternMinScore("cjk_job_spam")).toBe(PATTERN_MIN_SCORE);
  expect(CJK_MENTION_MIN_SCORE).toBeLessThan(Math.min(...Object.values(cjkIncidentScores).filter((score) => score > 0.6)));
});

test("Chinese conversation, @-addressed remarks, seekers, questions and warnings are no job spam", () => {
  for (const text of cjkJobControls) expect([text, promoPattern(plain(text)), cjkJobSpam(plain(text))]).toEqual([text, undefined, false]);
  // An answer to another member's job question is a requested answer; the same text alone is the ad.
  const answer = "日结兼职，联系 @ad_synth9";
  expect(promoPattern(plain(answer))).toBe("cjk_job_spam");
  expect(promoPattern(plain(answer, memberReply("哪里有日结兼职？")))).toBeUndefined();
  expect(promoPattern(plain(answer, channelReply))).toBe("cjk_job_spam");
  expect(cjkJobSpam(plain(cjkJobIncident, { mediaOnly: true }))).toBe(false);
});

test("a message of nothing but two or more bot mentions is the #634 bot-summon opener", () => {
  for (const patch of [{}, channelReply, { isForwarded: true }]) expect(promoPattern(plain(botSummonIncident, patch))).toBe("bot_summon");
  for (const text of botSummonFamily) expect([text, promoPattern(plain(text)), botSummon(plain(text))]).toEqual([text, "bot_summon", true]);
  for (const text of botSummonControls) expect([text, botSummon(plain(text))]).toEqual([text, false]);
  // A member replying to someone's message with bots summons them to it.
  expect(botSummon(plain(botSummonIncident, memberReply("купите крипту")))).toBe(false);
  expect(botSummon(plain(botSummonIncident, { mediaOnly: true }))).toBe(false);
});

test("a follow-up carries a link when it has a handle, a URL, a bare domain, a text link or URL buttons", () => {
  for (const text of ["Чат переехал, все сюда @new_chat_x", "Мы переехали https://example.com/x", "Все в t.me/+abcdef", "go to newchat.xyz now"]) {
    expect([text, carriesLink(plain(text))]).toEqual([text, true]);
  }
  expect(carriesLink(plain("Мы переехали, все сюда", { embeddedLinks: ["https://t.me/+abc"] }))).toBe(true);
  expect(carriesLink(plain("", { mediaOnly: true, inlineButtons: [{ text: "Join", url: "https://t.me/+abc" }] as never }))).toBe(true);
  for (const text of ["Всем привет", "Мы переехали, все сюда", "hello @ab", "README.md"]) expect([text, carriesLink(plain(text))]).toEqual([text, false]);
});

test("#634 matching stays linear on 4,096-character adversarial input", () => {
  const inputs = [
    "兼职".repeat(2048), "联/".repeat(1365) + "系", ("飞机加群小兼职壹个二十 @Mizetz\n").repeat(200), "@a_bot ".repeat(585),
    "@" + "a".repeat(4000) + "bot", "联系" + " ".repeat(4000) + "@abcd", ("兼职 " + "一".repeat(60) + " ").repeat(60), "日结 " + "@abcd_".repeat(800),
    "赚钱 " + "二".repeat(4090), "兼职 " + "百".repeat(4090), "兼职 " + "1".repeat(4090),
  ].map((text) => text.slice(0, 4096));
  for (const text of inputs) expect(fastest(() => { promoPattern(plain(text)); carriesLink(plain(text)); })).toBeLessThan(LINEAR_MS);
});

// #668: the guest-bot "chat is moving, tap this text, press Start" lure.
test("the #668 chat-moved lure matches with or without its hidden link, from bot or human, as a reply too", () => {
  for (const text of chatMovedFamily) expect([text, promoPattern(plain(text)), chatMovedLure(plain(text))]).toEqual([text, "chat_moved_lure", true]);
  for (const patch of [{}, { embeddedLinks: [chatMovedLink] }, memberReply(guestSummon), channelReply]) {
    expect(promoPattern(plain(chatMovedIncident, patch))).toBe("chat_moved_lure");
  }
  // No visible call: only a bot's ?start= link behind the text or on a button makes it the lure.
  expect(chatMovedLure(plain(chatMovedHidden.text))).toBe(false);
  expect(chatMovedLure(plain(chatMovedHidden.text, { embeddedLinks: [chatMovedHidden.link] }))).toBe(true);
  expect(chatMovedLure(plain(chatMovedHidden.text, { inlineButtons: [{ kind: "url", text: "Join", url: chatMovedHidden.link }] }))).toBe(true);
  expect(chatMovedLure(plain(chatMovedHidden.text, { embeddedLinks: ["https://t.me/+AbCdEf"] }))).toBe(false);
  expect(chatMovedLure(plain(chatMovedHidden.text, { embeddedLinks: ["https://t.me/news_channel?start=x"] }))).toBe(false);
  expect(chatMovedLure(plain(chatMovedIncident, { mediaOnly: true }))).toBe(false);
});

test("a member saying where the chat moved, bot help, warnings and ordinary chat are no chat-moved lure", () => {
  for (const text of chatMovedControls) expect([text, chatMovedLure(plain(text)), promoPattern(plain(text))]).toEqual([text, false, undefined]);
  // The single-handle summon stays with the model (it scored 0.94); only two or more bot handles are a bot_summon opener.
  expect(promoPattern(plain(guestSummon))).toBeUndefined();
  expect(botSummon(plain("@gif cats"))).toBe(false);
});

test("#668 matching stays linear on adversarial input up to the rule's 1,000-character bound", () => {
  // Over 1,000 characters the rule does not run; at the bound every regex does.
  const inputs = ["чат ".repeat(250), "группа переехала ".repeat(58), "нажмите на ".repeat(90), "we moved to a new ".repeat(55),
    "t.me/" + "a".repeat(900) + "bot?start", "чат переехал " + "t.me/a_bot?start ".repeat(58), "a".repeat(999) + "?",
    "чат переносится в ".repeat(54) + "нажмите на этот текст", "нажмите кнопку ".repeat(66),
    "чат " + "переехал ".repeat(110), "мы переезжаем " + "в ".repeat(490)].map((text) => text.slice(0, 1_000));
  for (const text of inputs) {
    expect(text.length).toBeLessThanOrEqual(1_000);
    expect(fastest(() => { chatMovedLure(plain(text)); chatMovedLure(plain(text, { embeddedLinks: [text] })); })).toBeLessThan(LINEAR_MS);
  }
});
