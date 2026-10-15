import { expect, test } from "bun:test";
import { botTestimonialControls, botTestimonialIncident, botTestimonialParaphrases, sideGigControls, sideGigIncident, sideGigParaphrases } from "./fixtures/promo-patterns";
import { testimonialControls, testimonialPromotions } from "./fixtures/testimonial-promotion";
import { reportedRecruitment, vagueRecruitmentControls, vagueRecruitmentVariants } from "./fixtures/vague-recruitment";
import { usdtAsk, usdtAskVariants } from "./fixtures/usdt-repeat";
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

test("normalization folds case, accents, lookalikes, emoji and o-for-zero but keeps й", () => {
  expect(promoText("Зaрплaтa 5ООО₽ в ДЕНЬ 🔥 пиши!")).toBe("зapплata 5000₽ b дehь пиши!");
  expect(promoText("Райский")).toBe(promoText("райский"));
  expect(promoText("Райский")).not.toBe(promoText("раиский"));
});
