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
// "Имя Фамилия: …" is a copied message with its author: the shape of a moderator's repost. Only a
// name counts (capitalised, then lowercase: "Анна-Мария", "О'Нил", "McDonald"), so "СРОЧНО НУЖНЫ ЛЮДИ:"
// stays an ad header, and so does a capitalised header word ("Hiring Now:", "Легкие Деньги:").
const NAME = "(?=\\p{Lu}['’]?\\p{Lu}?\\p{Ll})\\p{Lu}['’]?\\p{Ll}*(?:\\p{Lu}\\p{Ll}+)?(?:-\\p{Lu}?\\p{Ll}+)?";
const ATTRIBUTED = new RegExp(`^${NAME}(?:\\s${NAME}){1,2}(?=\\s?:\\s)`, "u");
const JOB_WORD = re("‹(?:работ|jobs?›|work)");
const HEADER = any("‹(?:срочн|внимани|важн|новост|объявлени|акци|набор|деньг|легк|быстр|бонус|оплат|зарплат|ежедневн|удал[её]нн|онлайн|urgent|attention|important|now›|today|new›|hot›|alert|news|offer|info|update|money|cash|easy|fast|quick|bonus|pay›|daily|remote|online)");
// "Внимание!" and "warning" open ads as often as warnings, so they are not report words on their own.
const MESSAGE = "(?:сообщени|смс|sms|письм|предложени|рассылк)";
// Where it arrived: "в личку", "на почту", "в вотсап".
const PLACE = " (?:в|на) (?:чат|группу|лс|личк\\p{L}*|личные|директ|вотсап|ватсап|whatsapp|телег\\p{L}*|тг|вк|инст\\p{L}*|почту|смс)›";
const OTHERS = "(?:детям|ребенк\\p{L}*|сыну|дочк\\p{L}*|дочер\\p{L}*|жене|мужу|маме|папе|брату|сестре|подруг\\p{L}*|друг[уа]|другу|коллег\\p{L}*|сосед\\p{L}*|знаком\\p{L}*|бабушк\\p{L}*|дедушк\\p{L}*|многим|всем нам)";
const RECIPIENT = `(?:мне|нам|${OTHERS.slice(3)}`;
// Money arrives too: "Вот что мне пришло: 15000 за неделю!" boasts, while "Опять пишут: 5000 в день, …" quotes
// an ad. So with nothing else marking a report, an "arrived" verb before a colon and an amount is a boast.
const NO_AMOUNT = "(?!\\s?[\\d\\p{Sc}])";
const ARRIVED = "(?:приходят|приходит|приходили|пришл[оаи]›|пришел›|получил[аи]?)";
const RECEIVED = "(?:приходят|приходит|приходили|пришл[оаи]›|пришел›|присылают|присылали|прислали|прислал[аи]?|написали|написал[аи]?|пишут|получил[аи]?)";
const COLON = `(?:${ARRIVED}\\s?:${NO_AMOUNT}|(?!${ARRIVED})${RECEIVED}\\s?:)`;
const REPORT = any("‹(?:осторожн|остерега|предупрежд|развод›|разводил|разводят|мошен|кидал|скам|спам|фейк|не ведит|не отвечайт|не пишит|не переходит|жалоб|пример спам)",
  // Recruiting into crime: "Это вербовка в закладчики!".
  "‹(?:вербов|вербу[юе]т|закладчик|закладк|наркот|дропп|дроповод)",
  // A message someone received, reported to the chat: "Детям приходят сообщения: …", "Вот такое пришло:",
  // "Ребенку написали: …", "мне пришло такое предложение". An ad telling readers what they will get
  // ("получаешь сообщение с заданием", "пришлите сообщение") is no report.
  // An ad boasting what the author got ("Мне пришло 5000 за день", "Я получил: 15000", "Деньги приходят:")
  // names no message, so a received message needs a message word, a demonstrative or a named recipient.
  `‹${RECEIVED}(?: (?:вот|такое|такие|это|${MESSAGE}\\p{L}*)|${PLACE}){1,3}\\s?:`,
  // "Мне в личку пришло:", "Нам в лс пишут:", "Опять пишут:".
  `‹${PLACE.slice(1)} (?:[\\p{L}-]+ )?${RECEIVED}\\s?:`,
  `‹(?:опять|снова|постоянно|тут|сюда) (?:[\\p{L}-]+ )?${COLON}`,
  // "Вот такое прислали:"; without a colon "Вот такие выплаты приходят каждый день!" is an earnings boast.
  // "Вот такое пришло мне: $500 за неделю!" boasts: money that arrived to the author.
  `‹(?:вот )?(?:такое|такие|это) (?:${MESSAGE}\\p{L}* )?(?:${RECIPIENT} )?(?:${RECEIVED}(?: ${OTHERS})?\\s?:|${ARRIVED} (?:мне|нам)\\s?:${NO_AMOUNT}|(?!${ARRIVED})${RECEIVED} (?:мне|нам)\\s?:)`,
  `‹(?:вот )?что (?:${RECIPIENT} )?(?:(?:${RECEIVED}) ${RECIPIENT}\\s?:${NO_AMOUNT}|${COLON})`,
  // A named recipient: "Ребенку написали: …", "мне пришло такое предложение", "Мужу написали в телеграме".
  // "Мне пишут в лс каждый день" boasts, so a place counts only in the past tense.
  `‹${OTHERS} (?:[\\p{L}-]+ )?${RECEIVED}(?: [\\p{L}-]+)?\\s?:`,
  `‹(?:мне|нам) (?:[\\p{L}-]+ )?(?:${COLON}|(?:${ARRIVED}) [\\p{L}-]+\\s?:${NO_AMOUNT}|(?!${ARRIVED})${RECEIVED} [\\p{L}-]+\\s?:)`,
  `‹${RECIPIENT} (?:[\\p{L}-]+ )?${RECEIVED} (?:[\\p{L}-]+ )?(?:вот|такое|такие|это|${MESSAGE})`,
  `‹${RECIPIENT} (?:[\\p{L}-]+ )?(?:пришл[оаи]|пришел|прислали|написали|написал[аи]?)${PLACE}(?! (?:уже )?\\d)`,
  `‹(?:такое|такие|это|подобн\\p{L}*|странн\\p{L}*|очередн\\p{L}*) (?:[\\p{L}-]+ )?${MESSAGE}\\p{L}* (?:[\\p{L}-]+ )?${RECEIVED}`,
  // Impersonal only: "Получила такое предложение и не пожалела!" is an ad's testimonial.
  `‹(?!получил)${RECEIVED} (?:[\\p{L}-]+ )?(?:такое|такие|это|подобн\\p{L}*|странн\\p{L}*|очередн\\p{L}*)›`,
  // An admin addressed at the start of a sentence or asked to act: "Админ, удали пожалуйста: …", "забаньте его".
  // Ads recruit admins and moderators ("Нужен админ, …", "We need mods!"), so a mention alone is no report.
  "(?:^|[.!?\\n]\\s?)(?:уважаем\\p{L}* )?(?:админ|модер)\\p{L}{0,6}\\s?(?:,(?!\\s?(?:(?:привет|здравствуйте|добр\\p{L}* (?:день|вечер|утро))[!,.]?\\s?)?(?:мы|нужны|требуются|срочно|набира\\p{L}*|ищем)›)|!+\\s?(?:опять|снова|тут|гляньте|посмотрите|удалите)›)|‹(?:удали(?:те)?|забан\\p{L}*|кикни(?:те)?|заблокируйте) (?:пожалуйста|плиз|это|этого|эту|его|е[её]|их|сообщени\\p{L}*|пост\\p{L}*|спам\\p{L}*|бот\\p{L}*)›|‹(?:сообщил|написал|пожаловал)\\p{L}* (?:[\\p{L}-]+ )?(?:админ|модер)",
  "‹(?:scam|spam|fake|beware|careful|report|don'?t (?:reply|respond|answer|click)|drugs?›(?!-free)|money mule|trafficking)",
  "(?:^|[.!?\\n]\\s?)(?:admins?|mods?|moderators?)\\s?,(?!\\s?(?:(?:hi|hello|hey)[!,.]?\\s?)?(?:we|we're|hiring|join)›)|‹(?:sent|forwarded) me (?:this|these)(?: [\\p{L}]+)?\\s?:|‹(?:will|can|could|would|please|pls|plz|should) (?:the )?(?:admins?|mods?|moderators?) (?:\\p{L}+ ){0,2}?(?:delete|remove|ban)›|‹(?:please|pls|plz) (?:remove|delete|ban)›|(?:^|[.!?\\n]\\s?)(?:ban|delete|remove) (?:this|him|her|them)›",
  "‹(?:got|getting|received|receiving) (?:[\\p{L}-]+ ){0,2}?(?:messages|texts|emails|offers) (?:like|saying|about|from)›",
  "‹(?:got|received) (?:this|these)(?: [\\p{L}]+)?\\s?:|‹(?:got|getting|received|receiving) (?:this|these|a|the following)(?: (?:weird |strange |random )?(?:message|text|dm|email|sms|offer)s?)?\\s?:|‹(?:got|received) (?:this|these) (?:message|text|dm|email|sms)s?›");
// An ad someone saw ("Видела объявление: …"), unless the author recruits from it ("…теперь 5000 в день, хочешь так же").
const SEEN_AD = any("‹(?:видела?|увидела?|наткнул(?:ся|ась)) (?:[\\p{L}-]+ )?(?:объявлени|реклам|пост)");
const RECRUIT_CALL = any("‹(?:хоч(?:ешь|ете|ет) (?:так же|также|тоже)|кому интересно|в команд|присоединя)");
// Ads deny being what they are ("не развод", "без обмана и спама", "никаких наркотиков"); a denial is no report.
const DENIAL = re("‹(?:не|ни|без|никак\\p{L}*|no|not(?: a)?|zero)\\s(?:\\p{L}+\\s(?:и|или|and|or)\\s)?(?:развод|скам|спам|обман|лохотрон|мошен|фейк|кидал|наркот|заклад|криминал|scam|spam|fake|fraud|drugs?›)\\p{L}*", "giu");
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
// The word "работа"/"job" alone is no offer ("электрик сделал всю работу", "did a great job"): the job
// must be offered, sought for, or be a side gig.
const ROLE = "(?:сотрудник|персонал|исполнител|курьер|грузчик|промоутер|помощни|упаковщик|работник|работниц|водител|оператор|менеджер|модератор|администратор)";
// A third-person hiring verb ("берут на работу курьеров") is judged by HIRES alone.
// The author's own move to a job: "Перешла на удалённую работу", "Устроился на работу курьером".
const MOVED = "(?:взял\\p{L}*|(?:берут|возьмут|примут|принимают|устроят)|перешл\\p{L}*|перешел|ушл\\p{L}*|ушел|пошл\\p{L}*|пошел|устроил\\p{L}*|вышл\\p{L}*|вышел)";
const GIG = any(
  "‹(?:подработ|под работк|работк|ваканси|заработ|доход|занятост)",
  "‹(?:возьму|возьм[её]м|бер[её]м|прим[уе]м|принима[ею]м|зов[её]м|зову|устрою|устроим|приглаша\\p{L}*) (?:[\\p{L}-]+ ){0,2}?на (?:[\\p{L}-]+ )?работу›",
  // "Надеюсь, найдётся работа", "Если есть работа — пишите" hope for one.
  "(?<!(?:надеюсь,?|если|может|вдруг|когда)(?: у кого(?:-то|-нибудь|-либо)?)?\\s)‹(?:предлага\\p{L}*|предложить|дам|да[её]м|есть|найд[её]тся|найдутся|будет|будут|появилась) (?:[\\p{L}-]+ ){0,2}?работ[ауые]?›",
  // A "Работа:" header, not a sentence about one's job ("Работа на заводе, устал").
  `(?:^|\\n)\\s?работа(?: [\\p{L}-]+)?\\s?(?:[:!\\n—–-]|$)|(?:^|\\n)\\s?работа (?:на|в|для|с|без)›|(?<!${MOVED} на\\s)‹удал[её]нн\\p{L}* работ`,
  `(?<!${MOVED} на\\s)‹работ[ауые]? (?:[\\p{L}-]+ )?${ROLE}`,
  "‹(?:нужн[аы]|ищет|ищете|ищешь) (?:\\p{L}+ ){0,2}?работ[ауые]?›",
  "‹работ[ауые]? (?:онлайн|на дому|из дома|удал[её]нн\\p{L}*|в интернете|с телефона|для (?:всех|студент|девуш|мам|школьник))",
  // A role counts only when hired at scale: "требуется водитель", "нужны модераторы", "набираем курьеров".
  // "Нужен водитель на свадьбу" or "ищу помощницу по хозяйству" is a member's one-off hire.
  `‹(?:нужны|требу\\p{L}*|ищем|набира\\p{L}*|набор|приглаша\\p{L}*|возьм[её]м) (?:[\\p{L}\\d]+ ){0,3}?${ROLE}`,
  // Plural or counted: "Нужна девушка посидеть с ребенком" is a one-off hire.
  "‹нужн[ыо]? (?:\\d+ |\\p{L}+ ){0,2}(?:людей|люди|человек|ребят|девуш|парн|девочк|мальчик)",
  "‹(?:требу[ею]тся|набира(?:ю|ем|ют)›|набор (?:людей|сотрудник|персонал)|ищем (?:людей|сотрудник|человек|ребят|девуш|парн)|приглаша[ею]м (?:на работ|на подработ|людей))",
  "‹(?:side[ -]?(?:job|gig|hustle|income)|part[ -]?time|full[ -]?time|hiring|vacanc|earn|earning|income|need(?:ed)? (?:\\p{L}+ ){0,2}(?:people|workers|staff|helpers?)|looking for (?:\\p{L}+ ){0,2}(?:people|workers|staff))›",
  "‹(?:remote|online|easy|simple|home|daily|flexible|extra|paid) (?:[\\p{L}-]+ )?(?:jobs?|work|gigs?)›|‹(?:jobs?|work) (?:from home|online|remotely|opportunit\\p{L}*|offers?|available)›|‹(?:offering|offer you|we have) (?:a |some )?(?:jobs?|work)›",
  "‹(?:need|want|looking for) (?:a |some )?(?:[\\p{L}-]+ )?(?:jobs?|work)›",
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
  `‹(?:в|за|per|a|каждый|каждую|every)\\s${UNIT}[^.!?]{0,12}?(?:от|from|до|up to)?\\s?${AMOUNT}`,
);
const DM = any(
  "‹(?:в|во)\\s?(?:лс|л\\.\\s?с\\.?|личк\\p{L}*|личн\\p{L}*|директ|пм)(?![\\p{L}\\p{N}])",
  "‹(?:пиш(?:и|ите)|напиш(?:и|ите)|писать|стучи(?:те)?|обраща(?:йся|йтесь|ться)) (?:мне|сюда|нам)›",
  "‹(?:dm|pm|direct message|message me|text me|write (?:to )?me|contact me|inbox me|hit me up)›",
  // A handle or link is a contact only when introduced as one ("пиши - @…", "подробнее 👉 http…"),
  // so addressing someone or sharing an article is not a DM call.
  "‹(?:пиш|напиш|писать|контакт|связ|обращ|подробн|детал|инф|звон|тел|ватсап|whatsapp|телеграм|тг|tg|сюда|тут|здесь|ниже|ссылк|переход|жми|details|info|contact|apply|join|write|message|text|dm|here|link)[^.!?]{0,20}?(?:@[a-z][a-z0-9_]{3,}|t\\.me/|wa\\.me/|https?://)",
);
const DM_ALL = new RegExp(DM.source, "giu");
// A DM someone else sent the author is a report, not a call: "мне написали в лс", "в лс писали", "got a DM".
const DM_SENDER = "(?:пишут|пишет|писали|писал[аи]?|написал[аи]?|зовут|звали|позвали|зов[её]т|предлага[ею]т|предложил[аи]?|приглаша[ею]т|пригласил[аи]?|прислал[аи]?|скинул[аи]?|кидают)›";
const DM_REPORTED_BEFORE = re(`‹${DM_SENDER}(?:\\s[\\p{L}-]+){0,2}\\s?$|‹(?:got|received|sent me)\\s(?:a |an |some |this |the |another )?$`);
const DM_REPORTED_AFTER = re(`^\\s?(?:[\\p{L}-]+\\s){0,3}${DM_SENDER}`);
// "Желающие пишут в лс" addresses readers: the verb is a call, not a report.
const WILLING = any("‹(?:желающ|заинтересован|интересующ|кому (?:интересно|надо|нужно)|кто (?:хочет|готов|заинтересован))");
function callsToDm(text: string): boolean {
  return [...text.matchAll(DM_ALL)].some((match) => {
    const end = match.index + match[0].length;
    const after = text.slice(end, end + 60);
    // "someone DM'd me" is a DM received.
    if (match[0].endsWith("dm") && /^'?d(?![\p{L}\p{N}])/u.test(after)) return false;
    const start = Math.max(0, ...[".", "!", "?", "\n", ",", ":", ";"].map((mark) => text.lastIndexOf(mark, match.index - 1) + 1));
    const before = text.slice(Math.max(start, match.index - 40), match.index);
    return WILLING.test(before) || !DM_REPORTED_BEFORE.test(before) && !DM_REPORTED_AFTER.test(after);
  });
}
// The author is the one looking for work, not offering it. People sought ("Ищу людей на подработку",
// "Ищем на работу курьеров", "Ищем студентов для подработки") recruit.
const SOUGHT = `(?:людей|люди|человек|ребят|девуш|парн|команд|желающ|студент|школьник|подрост|молод[её]ж|${ROLE.slice(3)}`;
// Someone the work is for is no one sought: "Ищем для подростка подработку".
const SEEKS = `(?:(?:для [\\p{L}-]+|(?!${SOUGHT})\\p{L}+) ){0,2}(?<!‹(?:на|в|для) )`;
// Seekers, for themselves or someone close: "Сын ищет подработку", "Ищем подработку для сына", "Двое парней ищут подработку",
// but not a generic crowd ("Студенты ищут подработку!", "Люди годами ищут…"), an ad's opener.
// It is told, never asked ("Ваш ребенок ищет подработку?"), and not of readers ("Кто из вас ищет…", "Ваш ребенок
// ищет подработку. Мы платим…") or crowds ("Студенты часто ищут…", "Каждая мама в декрете ищет…"), so it is judged
// per sentence, and an employer's voice in the message ("Мы платим", "У нас 5000 в день") makes it an ad's opener.
// "Ищем место для тебя" offers one.
const SEEKS_FOR = any(`(?<!‹(?:кто(?:-то|-нибудь|-либо)?|если|котор\\p{L}*|ваш\\p{L}*|тво[йяеи]\\p{L}*|кажд\\p{L}*|люб(?:ой|ая|ое|ые)|многие)\\s(?:\\p{L}+\\s){0,3})‹(?:ищет|ищем|(?<!‹(?:все|люди|народ|студенты|школьники|подростки|мамы|мамочки|пенсионеры|молод[её]жь|тысячи|большинство|часто|обычно|постоянно|годами|вечно|всегда)\\s(?:\\p{L}+\\s){0,3})ищут) ${SEEKS}(?:подработк|работу›|ваканси|заработ|место›(?! для (?:тебя|вас|всех|каждого|каждой)›))`);
// Only stated pay ("Мы платим 5000", "У нас от 5000 в день") or a recruiting verb: "платим ипотеку" or "у нас 3 детей" is a family's story.
const EMPLOYER = any(`‹(?:мы )?(?:платим|выплачиваем|предлагаем)(?: (?:от|до|по))? ${AMOUNT}|‹у нас (?:(?:от|до|по) )?(?:${AMOUNT}|оплата›|зп›)`,
  "‹(?:набира(?:ем|ю)›|требу[ею]тся›|зарабатывай(?:те)? с нами|присоединяй)");
const SEEKER = any(`‹ищу ${SEEKS}(?:подработ|работ|вакан|заработ|место)`,
  "‹(?:в поисках (?:\\p{L}+ )?(?:подработ|работ)|в поиске (?:\\p{L}+ )?(?:подработ|работ)|возьмусь за|(?<!(?:кто|если|тот|те)\\s)готова? (?:на любую )?работ)",
  "‹(?:кто (?:может|сможет|готов) (?:\\p{L}+ )?предложить|предложите (?:мне )?(?:\\p{L}+ )?(?:подработ|работ|вариант)|рассмотрю (?:\\p{L}+ )?(?:предложени|вариант)|(?:меня|мне) (?:устроит|устраивает|подойд[её]т)›|рассмотрю (?:вс[её]|все варианты)(?=\\s?(?:[,.!?\\n]|$))|могу (?:работать )?(?:за |от )?\\d[\\d\\s.,]{0,8}(?:\\s?(?:к|тыс\\p{L}*|р|руб\\p{L}*))?\\s?(?:в|за) (?:день|час|смену|сутки)›)",
  "‹(?:(?:looking|searching) for (?:[\\p{L}-]+ ){0,3}(?:job|work|gig)|available for (?:[\\p{L}-]+ ){0,2}(?:work|jobs?|gigs?|hire|projects?)|open to (?:[\\p{L}-]+ ){0,2}(?:work|jobs?|offers|opportunit\\p{L}*)|seeking (?:a |some )?(?:[\\p{L}-]+ )?(?:job|work)|hire me)›",
  // "Student here, $15/hour, DM me" introduces the author; "Any student here can earn…" addresses readers.
  "(?:^|[.!?\\n,]\\s?)(?:i'?m a |i am a )?(?:student|graduate|mom|mum|dad|teen|teenager|freelancer) here›(?!\\s?\\?)",
);
// "Нужна подработка", "need a job" stated by the author seeks work; asked ("Нужна подработка?") or said of
// readers ("кому нужна работа") it recruits.
// "Хочу подработку", "Готов на подработку", "Подработку ищу" too, but not "Хочу предложить подработку".
// "Хочу найти подработку", "Нуждаюсь в подработке", "Интересует подработка" too, but not "Кого интересует подработка".
const NEEDS_WORK = any("(?<!(?:кому|кого|если|кто|тем|вам|вас|тебе|тебя|всем)\\s)‹(?:"
    + "(?:(?:хочу|хотим|хочет|хотят) (?:найти|получить)|нужда(?:юсь|емся|ется|ются) в"
    // "Интересует подработка! …" exclaims an offer.
    + "|интересу(?:ет|ют)(?![^,.!?\\n—–-]{0,60}!)"
    + ") (?:\\p{L}+ )?(?:подработ|работ(?!ник|ниц))(?!\\p{L}*\\s?[—–-]\\s?(?:пиш|напиш|обращ|звон|в лс|в личк))|(?:очень|срочно) нужн[аы] (?:мне )?(?:\\p{L}+ )?(?:подработ|работ(?!ник|ниц))|нужн[аы] (?:мне )?(?:очень |срочно )?(?:\\p{L}+ )?(?:подработ|работ(?!ник|ниц))"
    // "Нужна подработка — пиши в лс" is a conditional call: need work? write me. "Срочно нужна работа — …" pleads.
    + "(?!\\p{L}*\\s?[—–-]\\s?(?:пиш|напиш|обращ|звон|в лс|в личк))"
    + "|(?:очень |срочно )?хочу (?:\\p{L}+(?:ую|юю) )?(?:подработ|работ)|готова? (?:на|к) (?:\\p{L}+ )?(?:подработ|работ)|рассмотрю (?:\\p{L}+ )?(?:подработ|работ)"
    + "|(?:подработ|работ)\\p{L}* (?:\\p{L}+ )?ищу›"
    // "Возьму любую подработку" seeks; "Возьму на работу" and "возьмём" hire.
    + "|возьму (?:(?!на›|в›)\\p{L}+ )?(?:подработк|работу›)"
    // "Подработка нужна срочно" seeks; "Подработка нужна всем" and "Подработка нужна — пиши" call.
    + "|(?:подработк[аи]|работа) (?:очень |срочно |мне )?нужн[аы]›(?! (?:всем|каждому|тем|вам|тебе|многим|людям|студентам|школьникам|мамам|именно (?:тебе|вам))›)(?!\\s?[—–-]\\s?(?:пиш|напиш|обращ|звон|в лс|в личк)))",
  "(?<!(?:who|if|you|anyone)\\s)‹(?:i )?(?:really |urgently )?need (?:a |some )?(?:[\\p{L}-]+ )?(?:job|work)›");
// "Есть хорошая работа для мужа?", "Может есть подработка для студентки?" ask for work.
// "Есть желание подработать?" recruits: the work asked for must be a noun.
const ASKS_FOR_WORK = any("‹(?:есть|найд[её]тся|найдутся|будет)(?: ли)?(?: у кого(?:-нибудь|-то)?)? (?:(?!желани|врем|возможност|мысл|сил)[\\p{L}-]+ )?(?:подработк\\p{L}*|работ[аыу]|ваканси\\p{L}*)›",
  "‹(?:is )?(?:anyone|anybody|someone|somebody)(?: here)? hiring›");
// "Если у кого-то есть работа для студента — пишите" hopes for one. Asked, it is ASKS_FOR_WORK's to judge, since an
// ad may answer it ("Может есть работа для студентов? Конечно!").
const HOPES = any("‹(?:если|вдруг|может),?(?: у (?:кого(?:-то|-нибудь|-либо)?|вас|тебя))? (?:есть|найд[её]тся|найдутся|будет) (?:(?!желани|врем|возможност|мысл|сил)[\\p{L}-]+ )?(?:подработк\\p{L}*|работ[аыу]|ваканси\\p{L}*)›(?! для (?:тебя|вас|всех(?! нас)|каждого|тех))");
// An ad answers its own question ("Есть работа? Есть! …", "Есть подработка для студентов? Да! …", "Anyone hiring? We are!").
const ANSWERED = any("^\\s?[—–-]?\\s?(?:да,? |конечно,? )?(?:есть|найд[её]тся|найдутся|будет|будут)\\s?(?:[!.,]|$)",
  "^\\s?(?:yes,? )?(?:we are|we're|we do|i am|i do)›");
// …but a seeker's own "Да, очень нужно" or "Конечно, любая подойдёт" is no answer.
// "Да, любая!" and "Да, готовы взять сразу!" are an ad's answer.
const SEEKER_YES = any("^\\s?(?:да|конечно|ага)[,!.]?\\s?(?:(?:очень |срочно |хоть )?(?:нужн|надо|подойд|хоть|какая)|люб\\p{L}* (?:подойд|устро)|готова? (?:на |к )?(?:\\p{L}+ )?работ)");
// "Возьмут на работу даже без опыта", "Берут на работу курьеров" promise a job. Asked ("Берут на работу без
// опыта?"), negated or said of someone ("Сына берут…", "Кто возьмёт…") it is a member's situation.
// Not said of a person ("Племянника берут…", "Нас не берут…", "Кто возьмёт…") or as hearsay ("Говорят, в Магнит берут…").
const PERSON = "(?:кто|не|меня|нас|их|его|е[её]|сына|сыночка|дочь|дочк\\p{L}*|внук\\p{L}*|внучк\\p{L}*|племянни\\p{L}*|мужа|жену|брата|сестру|маму|папу|подруг\\p{L}*|друга|друзей|знаком\\p{L}*|сосед\\p{L}*|ребенка|детей|девушку|парня|племяш\\p{L}*|т[её]т\\p{L}*|дяд\\p{L}*|бабушк\\p{L}*|дедушк\\p{L}*)";
// "Мою девушку берут…", "Нашего сына берут…", but not "В нашу компанию берут…".
const POSSESSIVE = "(?:мою|моего|моих|мой|нашу|нашего|наших|свою|своего|своих|твою|твоего)";
const HIRES = re(`(?<!${PERSON}\\s)(?<!(?<!(?:в|во|к|на)\\s)${POSSESSIVE}\\s(?:\\p{L}+\\s)?)‹(?:возьмут|примут|берут|принимают|устроят) (?:[\\p{L}\\d+-]+ ){0,2}?на (?:[\\p{L}-]+ )?работу›`, "giu");
// Reported speech: "Подруга сказала, что берут…", "Пишут, что берут…", "По слухам, берут…".
const HEARSAY = any("‹(?:говорят|говорили|слышал[аи]?|вроде|сказал[аи]?|рассказал[аи]?|читал[аи]?|пишут|узнал[аи]?|по слухам|якобы)›");
const hires = (text: string) => sentences(text).some((part) => !isQuestion(part)
  && [...part.matchAll(HIRES)].some((match) => !HEARSAY.test(part.slice(0, match.index))));

function seeksWork(text: string): boolean {
  if (SEEKER.test(text)) return true;
  const parts = sentences(text);
  return parts.some((part, i) => isQuestion(part)
    ? ASKS_FOR_WORK.test(part) && (!AFFIRM.test(parts[i + 1] ?? "") && !ANSWERED.test(parts[i + 1] ?? "") || SEEKER_YES.test(parts[i + 1] ?? ""))
    : NEEDS_WORK.test(part) || HOPES.test(part) || SEEKS_FOR.test(part) && !EMPLOYER.test(text));
}
// Talk about the author's own job ("работаю курьером, получаю 4000 в день", "I work part time and earn
// $20 per hour"), unless the message also recruits ("нужны люди в команду", "with this side job").
const OWN_JOB = any("‹(?:работаю|подрабатываю|зарабатываю|заработал[аи]?|подзаработал[аи]?|получаю)›",
  "‹i(?: also| currently| now| just)? (?:work|earn|make|worked|earned|made)›", "‹i'?m (?:working|earning|making)›");
const RECRUITS = any("‹(?:подработ|ваканси|сотрудник|персонал|требу[ею]тся|набира[ею]м|набор›|ищем|приглаша[ею]м|в команд|научу|обучу|обучение|кому интересно|хоч(?:ешь|ете|ет) (?:так же|также|тоже))",
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
// An ordinary question about work or pay invites a member's honest answer with its rate and a DM offer:
// "Кто-нибудь подрабатывал на складе? Сколько там платят?", "Кто работал в Ленте на выкладке?".
// Pay words are listed whole, so "платье" or "платформа" stays off topic. "работает" counts only of a person
// ("Кто-нибудь работает на Озоне?"), so "Магазин работает сегодня?" and "Does the elevator work?" don't, nor do
// "Can I pay by card?" or "Когда смена расписания?". Close calls still count ("Где работает банкомат?",
// "Где оплата за газ?"): the request must come from another member, and spam replies to members are rare.
const WORK_TOPIC = any("‹(?:подраб|(?:под)?зараб|работ(?!ает›|ают›)|зарплат|зп›|ваканс|трудоустр|трудил|устр(?:ои|аива)\\p{L}*с[яь]›|ставк|оклад|смен(?:у|ы|ам|ах|ами)›)",
  "‹(?:кто(?:-\\p{L}+)?|где) (?:\\p{L}+ ){0,2}?работа(?:ет|ют)›|‹работа(?:ет|ют) кто›",
  "‹(?:за|о|до|вы)?плат(?:ят|ит|или|ил[аи]?|ишь|ите|ать|а|у|ы|ой|е|ами)›|‹плотят›|‹сколько (?:\\p{L}+ ){0,3}?(?:получа|дают)",
  "‹(?:jobs?|hiring|hired|salary|salaries|wages?|shifts?|worked|working)›",
  "‹(?:you|anyone|anybody|someone|somebody|who|they|people) (?:\\p{L}+ ){0,2}?works?›",
  "‹how much (?:[\\p{L}']+ ){0,3}?(?:pay|pays|paid|earn|earns|make|makes)›|‹what (?:[\\p{L}']+ ){0,3}?(?:pay|pays|earn|earns)›|‹the pay›");
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
const sentences = (text: string) => text.split(/(?<=[.!?\n])(?![.!?\n])/u);

// Asking whether an offer is real or for advice on it: "это нормальная подработка?", "Legit?".
// Recruiting questions ("Кто готов?", "Интересно?", "Нужна подработка?") ask nothing of the kind.
const DOUBT = any("‹это (?:[\\p{L}-]+ ){0,2}?(?:нормальн|норм›|правд|реальн|законн|безопасн|честн|ок›|окей)",
  "‹(?:правда|реально|нормально|серь[её]зно|законно|честно|норм) (?:ли|или)›", "‹(?:правда|реально|серь[её]зно|норм)\\s?\\?",
  "‹кто(?:-нибудь|-то|-либо)? (?:знает|сталкивал|слышал|в курсе)", "‹(?:подскаж|посовету|стоит ли|верить›|доверя|что (?:скажете|думаете)|как (?:думаете|считаете))",
  // English doubt words count as the predicate ("Legit?", "Is it a scam?"), never as an ad's adjective ("real money?").
  "‹(?:legit|legitimate|real|safe|trustworthy|a scam)\\s?\\?", "‹(?:is|are) (?:this|that|it|these|they) (?:[\\p{L}-]+ ){0,2}(?:ok|okay|normal|true|for real|legit|real|safe|a scam)›",
  "‹(?:anyone|anybody|someone|somebody) (?:know|knows|heard)›", "‹(?:should i|what do you think|thoughts›)");
// The doubt is the author's own unless the ad answers it ("Это реально? Да! …").
function doubtsTheOffer(text: string): boolean {
  const parts = sentences(text);
  return parts.some((part, i) => isQuestion(part) && DOUBT.test(part) && !AFFIRM.test(parts[i + 1] ?? ""));
}

function isAttributed(raw: string): boolean {
  const name = ATTRIBUTED.exec(raw)?.[0];
  if (!name) return false;
  const words = promoText(name);
  return !HEADER.test(words) && !GIG.test(words) && !RECRUITS.test(words) && !JOB_WORD.test(words);
}

export function promoPattern(message: ModerationMessage): PromoPattern | undefined {
  if (message.mediaOnly) return;
  const raw = message.text.trim();
  if (!raw || isAttributed(raw)) return;
  const text = promoText(raw.replace(QUOTED, " "));
  const undenied = text.replace(DENIAL, " ");
  if (REPORT.test(undenied) || SEEN_AD.test(undenied) && !RECRUIT_CALL.test(undenied)) return;
  // A question about pay, or about whether the offer is real, is conversation, not an offer.
  if ((GIG.test(text) || hires(text)) && PAY.test(text) && callsToDm(text) && !seeksWork(text) && !(OWN_JOB.test(text) && !RECRUITS.test(text))
    && !asksAboutPay(text) && !doubtsTheOffer(text)) {
    if (callsItACon(undenied)) return;
    return answersRequest(message, (source) => GIG.test(source) || SEEKER.test(source) || WORK_TOPIC.test(source)) ? undefined : "side_gig_offer";
  }
  if (ADDRESSED.test(text) || answersRequest(message, (source) => BOT_TOPIC.test(source))) return;
  for (const match of text.matchAll(TESTIMONIAL)) {
    const sentenceStart = Math.max(...[".", "!", "?", "\n"].map((mark) => text.lastIndexOf(mark, match.index - 1))) + 1;
    if (OTHER_SUBJECT.test(text.slice(sentenceStart, match.index))) continue;
    const [rest, ...next] = sentences(text.slice(match.index + match[0].length));
    // A question ("Кто-нибудь проходил тест в @…bot?") is not an endorsement.
    if (isQuestion(rest!)) continue;
    if (!assessment(text.slice(sentenceStart, match.index + match[0].length) + rest!)) continue;
    // The outcome must be told, not asked ("Проходили тест в @…bot\nПомогло?"), unless the ad answers
    // its own question ("Помогло? Да, очень!").
    const told = !isQuestion(next[0] ?? "") || AFFIRM.test(next[1] ?? "");
    if (OUTCOME.test(rest! + " " + (told ? next[0] ?? "" : ""))) return "bot_testimonial";
  }
}
