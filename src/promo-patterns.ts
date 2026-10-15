import type { ModerationMessage } from "./spam";

// Nikita #126 option B: two ad shapes Laya keeps under the gate. The rules match
// the structure of the ad (offer + pay per period + move-to-DM call; a first-person
// "I took the test in @…bot" endorsement), not its wording. Data: docs/promo-patterns.md.
export type PromoPattern = "side_gig_offer" | "bot_testimonial";
// A match deletes only when the model sees some spam signal too: under this
// score the model is confident the post is benign and the rule stays silent.
export const PATTERN_MIN_SCORE = 0.3;

// Lookalike letters fold to one form in both the text and the patterns, so a
// swapped Latin/Cyrillic letter matches either way.
const HOMOGLYPHS: Record<string, string> = {
  а: "a", в: "b", е: "e", ё: "e", к: "k", м: "m", н: "h", о: "o", р: "p", с: "c", т: "t", у: "y", х: "x",
  і: "i", ї: "i", ј: "j", ѕ: "s", ԁ: "d", ӏ: "l", ο: "o", α: "a", ε: "e", ρ: "p", τ: "t", υ: "u", ν: "v", ι: "i", κ: "k",
};
const glyphs = (text: string) => [...text].map((char) => HOMOGLYPHS[char] ?? char).join("");

// Case, accents, format characters, emoji and lookalikes never change a match.
// The breve of й survives (NFKD would split it off and turn й into и).
export function promoText(text: string): string {
  const folded = text.replace(/й/giu, "\u0000").normalize("NFKD").toLowerCase()
    .replace(/[\p{Cf}\p{M}]/gu, "").replace(/\u0000/g, "й");
  return glyphs(folded)
    .replace(/[^\p{L}\p{N}\p{Sc}\s.,!?;:«»"“”„'’@/%+\-–—_]/gu, " ")
    // A letter o typed for a zero inside a number: 5ooo, 1o 000.
    .replace(/(?<![\p{L}\p{N}])(?=[\do]*\d)[\do]+(?![\p{L}])/gu, (n) => n.replaceAll("o", "0"))
    // A line break ends a sentence (multi-line ads rarely punctuate), so only horizontal space collapses.
    .replace(/[^\S\n\r\u2028\u2029]+/gu, " ").replace(/ ?[\n\r\u2028\u2029]\s*/gu, "\n").trim();
}

// Sources are lowercase plain text; `‹`/`›` mark word starts/ends (\b is ASCII-only).
const re = (source: string, flags = "iu") => new RegExp(glyphs(source)
  .replaceAll("‹", "(?<![\\p{L}\\p{N}])").replaceAll("›", "(?![\\p{L}\\p{N}])"), flags);
const any = (...sources: string[]) => re(sources.join("|"));

// Quoted spans are someone else's words, e.g. a warning that quotes the ad.
// Spans are bounded so unclosed quotes stay linear on long input.
const QUOTED = /«[^»]{8,600}»|“[^”]{8,600}”|„[^“”]{8,600}[“”]|"[^"]{8,600}"/gu;
// "Имя Фамилия: …" is a copied message with its author: the shape of a moderator's repost.
const ATTRIBUTED = /^\p{Lu}[\p{L}'’-]+(?:\s\p{Lu}[\p{L}'’-]+){1,2}\s?:\s/u;
// "Внимание!" and "warning" open ads as often as warnings, so they are not report words on their own.
const REPORT = any("‹(?:осторожн|остерега|предупрежд|развод›|разводил|разводят|мошен|кидал|скам|спам|фейк|не ведит|не отвечайт|не пишит|не переходит|жалоб|модератор|пример спам)",
  "‹(?:scam|spam|fake|beware|careful|report|moderator|don'?t (?:reply|respond|answer|click))");
// Ads deny being what they are ("не развод", "без обмана и спама"); a denial is no report.
const DENIAL = re("‹(?:не|ни|без|no|not(?: a)?)\\s(?:\\p{L}+\\s(?:и|или|and|or)\\s)?(?:развод|скам|спам|обман|лохотрон|мошен|фейк|кидал|scam|spam|fake|fraud)\\p{L}*", "giu");
// Calling a job offer a con is a warning. Job offers only: "развод" is also a divorce in a personal story.
const CON = re("‹(?:обман|лохотрон|развод|fraud)\\p{L}*", "giu");
// Ads deny it in more ways than DENIAL lists: "никакого обмана", "обмана нет", "без вложений, предоплат и обмана".
// The negation must govern the word itself, so a warning's own advice ("не верьте, это обман") stays a warning.
// A list must end in "и/или" ("без вложений, предоплат и обмана"), so "ни денег, ни работы, обман" stays a warning.
const CON_DENIED_BEFORE = re("‹(?:(?:без(?!\\sсомнени|\\sвопрос)|нет|никак\\p{L}*|no|without)\\s(?:(?:\\p{L}+,\\s){0,2}\\p{L}+\\s(?:и|или|and|or)\\s)?|(?:не|ни|not|zero)\\s)$");
const CON_DENIED_AFTER = any("^\\s?(?:нет|нету|исключ\\p{L}*)›");
function callsItACon(text: string): boolean {
  return [...text.matchAll(CON)].some((match) => !CON_DENIED_BEFORE.test(text.slice(Math.max(0, match.index - 80), match.index))
    && !CON_DENIED_AFTER.test(text.slice(match.index + match[0].length)));
}

// --- Side-gig recruitment: a work/earnings offer + pay per period + a move-to-DM call. ---
const GIG = any(
  "‹(?:подработ|работ[ауые]›|работк|ваканси|заработ|доход|сотрудник|персонал|исполнител|курьер|грузчик|промоутер|помощник|упаковщик)",
  "‹нужн[ыао]? (?:\\d+ |\\p{L}+ ){0,2}(?:людей|люди|человек|ребят|девуш|парн|девочк|мальчик)",
  "‹(?:требу[ею]тся|набира[ею]м|набор (?:людей|сотрудник|персонал)|ищем (?:людей|сотрудник|человек|помощник|курьер)|приглаша[ею]м (?:на работ|на подработ|людей))",
  "‹(?:side[ -]?(?:job|gig|hustle|income)|part[ -]?time|job|jobs|work|hiring|vacanc|earn|earning|income|need(?:ed)? (?:\\p{L}+ ){0,2}people|looking for (?:\\p{L}+ ){0,2}(?:people|workers|staff))›",
);
const CUR = "(?:\\p{Sc}|руб\\p{L}*|р\\.|р›|usdt?|eur|долл\\p{L}*|бакс\\p{L}*|грн|гривен\\p{L}*|тг|тенге|сум|byn|dollars?|bucks|euros?)";
const MULT = "(?:тыс\\p{L}*\\.?|т\\.|т›|k›|к›)";
// An amount needs a currency, a multiplier or at least three digits, so "1 day" or "2 раза" never count.
// Runs are bounded and start at a number's first digit, so long digit strings stay linear.
const AMOUNT = `(?<!\\d)(?:\\p{Sc}\\s?\\d[\\d\\s.,]{0,10}\\d|\\p{Sc}\\s?\\d|\\d[\\d.,]{0,8}\\s?${MULT}(?:\\s?${CUR})?|\\d[\\d\\s.,]{0,10}\\s?${CUR}|\\d{1,3}(?:[\\s.,]\\d{3}){1,3}|\\d{3,9})`;
const RANGE = `${AMOUNT}(?:\\s?[-–—]\\s?(?:${AMOUNT}|\\d{1,9}))?`;
const UNIT = "(?:день|сутки|смену|смена|час|неделю|месяц|выходн\\p{L}*|day|hour|hr|shift|week|month|weekend)›";
// "от 5 тысяч в день", "$100 a day", "300₽/час", "5-7к за смену", "в день от 5000".
const PAY = any(
  `${RANGE}\\s?(?:(?:в|за|/|per|a|an|each|каждый)\\s?)?${UNIT}`,
  `${RANGE}\\s?(?:daily|ежедневно)›`,
  `‹(?:в|за|per|a)\\s${UNIT}[^.!?]{0,12}?(?:от|from|до|up to)?\\s?${AMOUNT}`,
);
const DM = any(
  "‹(?:в|во)\\s?(?:лс|л\\.\\s?с\\.?|личк\\p{L}*|личн\\p{L}*|директ|пм)(?![\\p{L}\\p{N}])",
  "‹(?:пиш(?:и|ите)|напиш(?:и|ите)|писать|стучи(?:те)?|обраща(?:йся|йтесь|ться)) (?:мне|сюда|нам)›",
  "‹(?:dm|pm|direct message|message me|text me|write (?:to )?me|contact me|inbox me|hit me up)›",
  // A handle or link is a contact only when introduced as one ("пиши - @…", "подробнее 👉 http…"),
  // so addressing someone or sharing an article is not a DM call.
  "‹(?:пиш|напиш|писать|контакт|связ|обращ|подробн|детал|инф|звон|тел|ватсап|whatsapp|телеграм|тг|tg|сюда|тут|здесь|ниже|ссылк|переход|жми|details|info|contact|apply|join|write|message|text|dm|here|link)[^.!?]{0,20}?(?:@[a-z][a-z0-9_]{3,}|t\\.me/|wa\\.me/|https?://)",
);
// The author is the one looking for work, not offering it.
const SEEKER = any("‹(?:ищу (?:\\p{L}+ ){0,2}(?:подработ|работ|вакан|заработ|место)|в поисках (?:\\p{L}+ )?(?:подработ|работ)|возьмусь за|готова? (?:на любую )?работ)",
  "‹(?:(?:looking|searching) for (?:[\\p{L}-]+ ){0,3}(?:job|work|gig)|need (?:a |some )?(?:job|work))›",
);
// Talk about the author's own job ("работаю курьером, получаю 4000 в день", "I work part time and earn
// $20 per hour"), unless the message also recruits ("нужны люди в команду", "with this side job").
const OWN_JOB = any("‹(?:работаю|подрабатываю|зарабатываю)›", "‹i(?: also| currently| now)? (?:work|earn|make)›", "‹i'?m (?:working|earning|making)›");
const RECRUITS = any("‹(?:подработ|ваканси|сотрудник|персонал|требу[ею]тся|набира[ею]м|набор›|ищем|приглаша[ею]м|в команд|научу|обучу|обучение)",
  "‹нужн[ыао]? (?:\\d+ |\\p{L}+ ){0,2}(?:людей|люди|человек|ребят|девуш|парн)",
  "‹(?:side[ -]?(?:job|gig|hustle|income)|hiring|vacanc|join|team|teach you|show you|opportunit|need(?:ed)? (?:\\p{L}+ ){0,2}people|looking for (?:\\p{L}+ ){0,2}(?:people|workers|staff))");

// --- Bot testimonial: first-person "I took/tried/passed a test in @…bot", then an outcome. ---
const BOT = "(?:@[a-z][a-z0-9_]*bot|t\\.me/[a-z][a-z0-9_]*bot)›";
const EXPERIENCE = "(?:прош(?:ла|[её]л)|проходил[аи]?|попробовал[аи]?|пробовал[аи]?|сделал[аи]?|воспользовал(?:ся|ась|ись)|обратил(?:ся|ась)|took|tried|passed|did|used|completed|went through)";
// The handle follows the experience within one clause: "прошла тест в @…bot".
const TESTIMONIAL = re(`‹${EXPERIENCE}›[^.!?\\n]{0,40}?${BOT}`, "giu");
// A self-assessment, which is what these bots sell. Neutral tool tips ("сделал опрос в @PollBot, помог",
// "used @QuizBot to make a quiz for my class") never match: a test or quiz counts only when the author
// took it ("прошла тест", "tried the quiz") or it was about themselves ("о себе", "about myself").
// Psychology and fortune-telling terms count on their own. Everyday words ("стресс", "эмоции", "терапевт"
// the GP, "удостоверение личности") don't: they turn up in tool tips too.
const PSYCH = any("‹(?:психолог|психотерап|психотип|тревожност|депресси|выгоран|самооценк|личностн|тип личности|гадани|расклад|таро›|тарол|гороскоп|натальн|астролог|нумеролог)",
  "‹(?:psycholog|psychotherap|therapy›|therapist|counsel|anxiety|depression|burnout|self-esteem|personality|tarot|horoscope|astrolog|numerolog)");
// Nouns only: "to test my code" is a tool tip, not an assessment.
const TEST_NOUN = "(?:тест(?:а|у|ом|ы|ов|е)?›|опрос|квиз|анкет|диагностик|(?<!to\\s)tests?›|quiz|survey|questionnaire|assessment|diagnos)";
// Taking a test is past and personal; making one ("сделала тест для учеников", "did a survey for my class",
// "so my students could take a quiz") is a tool.
const TOOK_TEST = any(`‹(?:прош(?:ла|[её]л|ли)|проходил[аи]?|сдал[аи]?|(?:по)?пробовал[аи]?|took|passed|completed|went through|tried)›\\s(?:[\\p{L}'’-]+\\s){0,2}?‹${TEST_NOUN}`);
const SELF_TEST = any(`‹${TEST_NOUN}[^]{0,80}?‹(?:о себе|про себя|в себе|about (?:me|myself)›)`);
const assessment = (text: string) => PSYCH.test(text) || TOOK_TEST.test(text) || SELF_TEST.test(text);
// What the author learned or how it helped, after the handle.
const OUTCOME = re("(?<!(?:не|ни|not|never|didn'?t|hasn'?t|wasn'?t)\\s)(?:" + ["‹(?:узнал|понял|осознал|разобрал|помог|изменил|стало (?:легче|проще|лучше)|открыл|рекоменд|советую)",
  "‹(?:realiz|learn|understood|helped|changed|figured|discovered|recommend|life[- ]changing)"].join("|") + ")");
// "Да" is a yes on its own ("Да!", "Да, очень", "да, ни разу не пожалела", "да не то слово"), but
// "да нет", "да не особо", "да нисколько" and "да, не очень" or "да, но не особо" are a no.
const AFFIRM = any("^\\s?(?:да(?:[.!]|$|,\\s(?!не›|нет›|но›|ни (?:капли|чуть)›|нисколько|ничуть)|\\sне то слово|\\s(?:очень|ещ[её]|реально|правда|сильно|конечно)›)|(?:ага|конечно|ещ[её] как|yes|yep|of course|absolutely|definitely)›)");
// The clause before the verb names nobody else: "кто-нибудь проходил…", "ты пробовала…" ask or report.
const OTHER_SUBJECT = any("‹(?:кто|кто-то|кто-нибудь|кто-либо|ты|вы|тебе|вам|anyone|anybody|someone|somebody|you|has|have|did|does|do)›");
// Answering someone's request or continuing a discussion is not an unsolicited plug.
const ADDRESSED = any("‹(?:ты|вы|you) (?:\\p{L}+ ){0,2}(?:просил|спрашивал|интересовал|asked|wanted)",
  "‹(?:в ответ на|отвечаю|по (?:твоей|вашей) просьбе|продолжая|к нашему обсуждению|since you asked|as you asked|to answer your|replying to)");

// A reply to (or a quote of) another member's request answers that request, which
// is how requested job answers and bot recommendations arrive. A reply to an
// unrelated message, a channel post, the author's own message, a forum-topic root
// or an external source with no text grants nothing.
const REQUEST = any("\\?", "‹(?:подскаж|посовету|порекоменд|кто (?:знает|может)|есть (?:ли |у )?кого|есть ли|ищу|ищем|нужен|нужна|нужны|нужно|где (?:найти|можно|взять)|как (?:найти|можно))",
  "‹(?:need|looking for|recommend|suggest|anyone|anybody|where can|how (?:do|can)|which bot)");
// The request must be on the rule's topic too: any chat question is no invitation to an ad.
const BOT_TOPIC = any("‹(?:бот|тест|опрос|квиз|психолог)", "‹(?:bots?›|tests?›|quiz|therap|counsel)", "@[a-z][a-z0-9_]*bot›");
function answersRequest(message: ModerationMessage, topic: (text: string) => boolean): boolean {
  return (message.preview ?? []).some((item) => {
    if (item.sourceKind === "channel" || item.sourceAuthor === "same_author" || !item.text?.trim()) return false;
    const source = promoText(item.text);
    return REQUEST.test(source) && topic(source);
  });
}
// The sentence that states the pay ends in "?": "…платят 5000 в день, а у тебя?".
function asksAboutPay(text: string): boolean {
  const pay = PAY.exec(text);
  return pay !== null && /^[^.!?\n]*\?/u.test(text.slice(pay.index));
}

// A sentence whose closing punctuation holds a "?" ("?", "?!", "?..") asks.
const isQuestion = (sentence: string) => /\?[.!?\s]*$/u.test(sentence);

export function promoPattern(message: ModerationMessage): PromoPattern | undefined {
  if (message.mediaOnly) return;
  const raw = message.text.trim();
  if (!raw || ATTRIBUTED.test(raw)) return;
  const text = promoText(raw.replace(QUOTED, " "));
  const undenied = text.replace(DENIAL, " ");
  if (REPORT.test(undenied)) return;
  // A question about pay is conversation, not an offer.
  if (GIG.test(text) && PAY.test(text) && DM.test(text) && !SEEKER.test(text) && !(OWN_JOB.test(text) && !RECRUITS.test(text))
    && !asksAboutPay(text)) {
    if (callsItACon(undenied)) return;
    return answersRequest(message, (source) => GIG.test(source) || SEEKER.test(source)) ? undefined : "side_gig_offer";
  }
  if (ADDRESSED.test(text) || answersRequest(message, (source) => BOT_TOPIC.test(source))) return;
  for (const match of text.matchAll(TESTIMONIAL)) {
    const sentenceStart = Math.max(...[".", "!", "?", "\n"].map((mark) => text.lastIndexOf(mark, match.index - 1))) + 1;
    if (OTHER_SUBJECT.test(text.slice(sentenceStart, match.index))) continue;
    const [rest, ...next] = text.slice(match.index + match[0].length).split(/(?<=[.!?\n])(?![.!?\n])/u);
    // A question ("Кто-нибудь проходил тест в @…bot?") is not an endorsement.
    if (isQuestion(rest!)) continue;
    if (!assessment(text.slice(sentenceStart, match.index + match[0].length) + rest!)) continue;
    // The outcome must be told, not asked ("Проходили тест в @…bot\nПомогло?"), unless the ad answers
    // its own question ("Помогло? Да, очень!").
    const told = !isQuestion(next[0] ?? "") || AFFIRM.test(next[1] ?? "");
    if (OUTCOME.test(rest! + " " + (told ? next[0] ?? "" : ""))) return "bot_testimonial";
  }
}
