import type { ModerationMessage } from "./spam";

// Nikita #126 option B: two ad shapes Laya keeps under the gate. The rules match
// the structure of the ad (offer + pay per period + move-to-DM call; a first-person
// "I took the test in @…bot" endorsement), not its wording. Data: docs/promo-patterns.md.
// #142 adds a third: an unsolicited P2P crypto trade ask (buy/sell intent + a crypto asset + a deal cue).
// #145 adds a fourth: explicit adult-content promotion (explicit porn/XXX content + a funnel to a button, site, bot or DM).
// #153 adds a fifth: free-copy bait (a first-person book or course review + an offer to send a copy + an interest or DM cue).
// #470 adds a sixth, judged on the sender's profile rather than the text: see profile-funnel.ts.
// #465 adds a seventh: an investment-profit testimonial (a first-person claim that a stake grew + a contact call + an invite or contact link).
export type PromoPattern =
  | "side_gig_offer"
  | "bot_testimonial"
  | "crypto_trade_ask"
  | "adult_content_promo"
  | "book_copy_offer"
  | "profit_testimonial"
  | "profile_channel_funnel";
// A match deletes only when the model sees some spam signal too: under this
// score the model is confident the post is benign and the rule stays silent.
export const PATTERN_MIN_SCORE = 0.2;

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
const QUOTED = /«[^»]{8,600}»|“[^”]{8,600}”|„[^“”]{8,600}[“”]|‘[^’]{8,600}’|"[^"]{8,600}"/gu;
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
const DM_SENT = "пишут|пишет|писали|писал[аи]?|написал[аи]?|зовут|звали|позвали|зов[её]т|предлага[ею]т|предложил[аи]?|приглаша[ею]т|пригласил[аи]?|прислал[аи]?|скинул[аи]?|кидают";
// Adult content arrives in members' DMs uninvited, so more verbs report it: "Мне в личку порно шлют", "В лс порно скидывают",
// "Порно бот в лс постучался". They stay out of gig and trade offers, where "Резюме пришли в лс" is a call.
const ADULT_DM_SENT = `${DM_SENT}|кидает|кинул[аи]?|шл[юе]т|шл[её]т|скидыва[ею]т|присыла[ею]т|пришл[оа]|пришел|пришёл|прилета[ею]т|прилетел[аи]?|приход[яи]т|стуч[ия]тся|постучал(?:ся|ась|ись)|ломятся|лезут|спам\\p{L}*|отправил[аи]?|отправля[ею]т|получил[аи]?|получа[ею]т|рассыла[ею]т|кидал[аи]?|слал[аи]?|скидывал[аи]?|присылал[аи]?|(?<!‹и\\s)пришли(?!\\s(?:\\+|плюс|фото|мне|свои|сво[йеё]))|прилетело|texted|messaged|wrote|dm['’]?e?d|spamm\\p{L}*|slid`;
const dmReported = (sent: string, before = "", after = "") => ({
  before: re(`‹(?:${sent})›(?:\\s[\\p{L}-]+){0,2}\\s?$|‹(?:got|received|sent me)\\s(?:a |an |some |this |the |another )?$${before}`),
  after: re(`^\\s?(?:[\\p{L}-]+\\s){0,3}(?:${sent})›${after}`),
});
const DM_REPORTED = dmReported(DM_SENT);
// …and so does who sent it or getting it: "В лс порно от бота", "Got porn in DM from someone here", "I'm getting porn in DM".
const ADULT_DM_REPORTED = dmReported(ADULT_DM_SENT, "|‹(?:got|getting|received|receiving)(?:\\s[\\p{L}-]+){0,2}\\s?$",
  "|^\\s?(?:[\\p{L}-]+\\s){0,3}(?:от|from)\\s(?!(?:меня|нас|me|us)›)(?=\\p{L}|@|\\d+(?:-?(?:х|x|ти|ми|ех|ух|го)|\\+)?(?:\\s?[-–]\\s?\\d+)?\\s(?:[\\p{L}-]+\\s)?(?:бот|акк|аккаунт|номер|людей|человек|bots?›|accounts?›|numbers?›|people›|users?›|guys?›))");
// For adult content the author's own DMs or a bot sitting there are a report ("Porn bots in my DM", "У меня в лс порно бот",
// "Мне в лс порно бот", "Порно бот в личке")
// unless teased ("Free nudes in my DM 😏"); a gig or trade offer "у меня в лс" still calls.
const DM_OWN = re(`(?<!‹(?:come|slide|sliding|hop|jump|get)\\s)‹in(?:to)? my\\s$|‹у (?:меня|нас)\\s$|‹(?:ко )?(?:мне|нам)\\s$|(?<!‹(?:наш|мой|наши|мои)\\s)‹бот(?:ы|ов)?\\s$`);
// "Желающие пишут в лс" addresses readers: the verb is a call, not a report.
const WILLING = any("‹(?:желающ|заинтересован|интересующ|кому (?:интересно|надо|нужно)|кто (?:хочет|готов|заинтересован))");
function callsToDm(text: string, adult?: { teased: boolean }): boolean {
  const reported = adult ? ADULT_DM_REPORTED : DM_REPORTED;
  return [...text.matchAll(DM_ALL)].some((match) => {
    const end = match.index + match[0].length;
    const after = text.slice(end, end + 60);
    // "someone DM'd me" is a DM received.
    if (match[0].endsWith("dm") && /^'?d(?![\p{L}\p{N}])/u.test(after)) return false;
    const start = Math.max(0, ...[".", "!", "?", "\n", ",", ":", ";"].map((mark) => text.lastIndexOf(mark, match.index - 1) + 1));
    const before = text.slice(Math.max(start, match.index - 40), match.index);
    return WILLING.test(before)
      || !reported.before.test(before) && (!adult || adult.teased || !DM_OWN.test(before)) && !reported.after.test(after);
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

// --- P2P crypto trade ask (#142): a buy/sell intent for a crypto asset + a deal cue. ---
// A token that is also a common word ("5 ton truck", "TRX тренажер", "эфир на радио", "Solana beach towel") is the asset only
// before the end of a clause, an amount, a connector, a network, terms, a trade verb or a call; a connector may not lead to media.
const AMBIGUOUS_NEXT = "(?=\\s?(?:[.,!?;:)/&+—–\\n-]|$)|\\s(?:\\d|\\p{Sc}"
  + "|(?:на|в|за|по|у|с|и|или|через|from|for|at|to|into|in|on|via|and|or)\\s(?!(?:[\\p{L}-]+\\s)?(?:радио|тв›|телевид|телеканал|реклам|ютуб|youtube|стрим|канал))"
  + "|(?:срочно|быстро|дешево|дешевле|дорого|недорого|выгодн|налич|нал›|кэш|cash|крупн|больш|много|лично|моментальн|мгновенн|instant|right now|tonight|при встреч|от \\d|до \\d|без (?:комисс|накрут|посредник|переплат|kyc|верифик)|with (?:no|zero|low)›|no fees?›|ниже|выше|оптом|любы\\p{L}*|любой|сегодня|сейчас|bulk|cheap|fast|quick|below|above|any›|today|now|asap|sol›|coins?›|монет|токен|tokens?›|network|сет[ьи]›|trc|erc|bep"
  + "|кто|куп|прод|обмен|поменя|меня|скуп|выкуп|sell|buy|wtb|wts|exchang|swap|договор|торг|пиш|напиш|отпиш|стучи|маякни|dm›|pm›|write|text|message|msg|contact|hmu|inbox)))";
// Lookalikes fold first, so "уcдт" with a Latin c is "усдт"; "юстд" is a common transposition.
const ASSET = "‹(?:(?:u|ю|у)(?:s|с|\\$)(?:d|д)(?:t|т)\\p{L}{0,4}|(?:u|ю|у)(?:s|с)(?:t|т)(?:d|д)|(?:ю|у)сд(?:э|е)|usdc|(?:ю|у)сдц|тезер\\p{L}*|тетер\\p{L}*|tether"
  + "|крипт(?:а|ы|у|е|ой|ою|о|о(?:валют|актив|монет)\\p{L}*)|crypto(?:s|currenc\\p{L}*)?|стейбл\\p{L}*|stable ?coins?|btc|биткоин(?:а|у|ом|е|ы|ов|ами)?|биткойн(?:а|у|ом|е|ы|ов|ами)?"
  + "|битк(?:а|у|ом|и|ов|ами)?|биток|bitcoins?|eth|ethereum|эфириум(?:а|у|ом|е)?|toncoin|тонкоин(?:а|у|ом|ы|ов)?|bnb|ltc|litecoin|xmr|monero"
  + `|(?:эфир(?:а|у|ом)?|(?<!‹a )ton|trx|tron|solana)›${AMBIGUOUS_NEXT})›`
  // Crypto-themed goods are no asset, hyphenated or not: "криптокошелёк", "биткоин-кошелёк", "BTC майнер", "crypto wallet Ledger";
  // a network or fiat pair still is ("USDT-TRC20").
  + "(?!-(?!(?:trc|erc|bep|ton|usdt|usd|rub|руб)\\p{L}*\\p{N}*›)\\p{L})(?!\\s(?:(?:кошел|wallet)(?![\\p{L}\\s-]{0,4}(?:в|на|to|-)\\s?(?:кошел|wallet))|майнер|майнинг|асик|ферм|miner|mining|rigs?›|asics?›))";
const ASSETS = re(ASSET);
const TRADE_INF = "(?:продать|купить|обменять|поменять|выкупить|отдать)";
const TRADE_3RD = "(?:прода[её]т|продаст|продают|купит|покупает|покупают|скупает|обменяет|обменяют|обменивает|поменяет|поменяют|меняет|меняют|отдаст)";
const SOMEONE = "(?:-(?:нибудь|то|либо)| (?:нибудь|то))?";
// Someone sought to trade with: "есть кто продаёт", "продаст кто-нибудь", "есть желающие продать", "у кого есть",
// "есть продавцы", "anyone selling", "who has USDT for sale". Venue questions ("кто знает, где купить") ask where, not who.
const ASK = re(`‹кто${SOMEONE}(?: (?!(?:где|как|куда|откуда)›)[\\p{L}-]+){0,3}? (?:${TRADE_3RD}|${TRADE_INF})›|‹${TRADE_3RD} (?:ли )?кто${SOMEONE}›`
  + `|‹(?:есть )?желающи\\p{L}* (?:[\\p{L}-]+ )?${TRADE_INF}›`
  + `|‹у кого (?:[\\p{L}-]+ ){0,2}?(?:${TRADE_INF}|${TRADE_3RD})›|‹у кого (?:[\\p{L}-]+ ){0,3}?на (?:продажу|обмен)›`
  + "|‹(?:anyone|anybody|someone|somebody|who|who['’]s)(?: here)?(?: (?:can|could|will|would|wants? to|willing to|is|who|that|interested in))?(?: (?:want|wanna|like) to)? (?:sells?|selling|buys?|buying|exchanges?|exchanging|swaps?|swapping)›"
  + "|‹(?:anyone|anybody|someone|somebody|who)(?: here)? (?:has|have|got) (?:[\\p{L}\\p{N}]+ ){0,3}?(?:for sale|to sell|to spare)›"
  + "|‹looking for (?:someone|somebody|a person|a trader) to (?:sell|buy|exchange|swap)›"
  + "|‹(?:ищу|ищем|нужен|нужны|есть|looking for|need|any) (?:[\\p{L}-]+ )?(?:продав\\p{L}*|покупател\\p{L}*|обменник\\p{L}*|sellers?|buyers?)");
// The author's own offer, in a classified's words: "куплю", "скупаем", "могу продать", "WTB", "will buy", "we buy".
const OFFER = re("‹(?:куплю|покупаю|скупаю|скуплю|выкуплю|выкупаю|продам|продаю|обменяю|обмениваю|поменяю|меняю|купим|покупаем|скупаем|продадим|прода[её]м|обменяем|обмениваем|меняем|wtb|wts)›"
  + `|‹(?:могу|можем|готов[аы]?) (?:[\\p{L}-]+ )?${TRADE_INF}›`
  + "|‹(?:i|we)(?:['’]ll| will| can)? (?:buy|sell|exchange|swap)›|‹(?:i['’]?m|we['’]?re|i am|we are) (?:buying|selling|exchanging)›|‹will (?:buy|sell|exchange)›"
  // A broker introducing themselves: "USDT buyer available", "P2P USDT trader here", "Bulk USDT seller here".
  + "|‹(?:buyers?|sellers?|traders?|exchangers?|dealers?) (?:here|available)›");
// A classified's header opens a sentence that asks nothing: "Обмен USDT", "Продажа крипты", "Buying USDT" (not news inside
// a sentence, "Сбер запустит продажу BTC", nor a question, "Продажа USDT облагается налогом?").
const HEADER_OFFER = re("(?:^|[.!?\\n])\\s?(?:обмен(?:ник)?|продажа|покупка|скупка|buying|selling|buy|sell|exchange|swap)›");
// The author's wish, which takes a DM call to be an ad: "хочу продать", "нужен юсдт", "интересует USDT", "looking to sell".
const WANT = re(`‹(?:хочу|хотим|хотел\\p{L}{0,2} бы|нужно|надо|нужн[ао]|желаю) (?:[\\p{L}-]+ )?${TRADE_INF}›|‹(?:нуж(?:ен|на|ны|но)|ищу|ищем|интересует|need|want)›`
  + "|‹(?:i|we) (?:want to|wanna|need to|would like to|['’]d like to|am looking to|['’]m looking to|are looking to|['’]re looking to) (?:buy|sell|exchange|swap)›|‹(?:looking|ready) to (?:buy|sell|exchange|swap)›");
// Who has the asset is a trade ask only with a deal cue of the author's own: a trade ("Есть у кого лишние usdt? Куплю…"), a price,
// cash or negotiation ("есть у кого усдт? Напишите, договоримся"). "У кого есть крипта на Binance? Напишите, нужен совет по
// налогам" and "Anyone have USDT on Binance? Can't sell it, DM me" are support questions.
const HAS = re("‹(?:у кого (?:есть|найд[её]тся|будет)|есть (?:ли )?у кого|(?:anyone|anybody|who)(?: here)? (?:has|have|got))›");
const HAS_ALL = new RegExp(HAS.source, "giu");
const ASK_ALL = new RegExp(ASK.source, "giu");
const OWN_TRADE = re("‹(?:куплю|покупаю|возьму|заберу|выкуплю|продам|продаю|обменяю|поменяю|меняю|оплачу|плачу|заплачу(?! за)|(?:i|i['’]ll|i will|will) (?:buy|pay)|buying|paying|wtb|(?:need|нужн[оаы]?|нужен) \\d)");
const HAS_DEAL = re("‹(?:договор(?:имся|иться)|торг›|жду (?:ваших )?предложени|negotiable|let['’]?s deal|(?:обсудим|let['’]?s talk)\\s?(?:[.!,)]|$)|наличн\\p{L}*|налик\\p{L}*|наличк\\p{L}*|нал›|кэш(?!б[эе]к)|cash›(?!\\s?out))");
// A cue inside a where/how question asks about it: "У кого есть usdt на Bybit? Как вывести в наличные? Напишите в лс".
const hasDeal = (text: string) => sentences(text).some((part) => !(isQuestion(part) && VENUE_QUESTION.test(part))
  && (OWN_TRADE.test(part) || RATE.test(part) || HAS_DEAL.test(part)));
const OFFER_ALL = new RegExp(OFFER.source, "giu");
const HEADER_OFFER_ALL = new RegExp(HEADER_OFFER.source, "giu");
const WANT_ALL = new RegExp(WANT.source, "giu");
const NOT_OWN = re("‹(?:не|ни|not|never|won['’]?t|don['’]?t|didn['’]?t|can['’]?t|cannot)\\s(?:[\\p{L}-]+\\s)?$");
const VENUE = re("‹(?:где|как|куда|откуда|через что|на как\\p{L}+|в как\\p{L}+|where|how|which [\\p{L}-]+)\\s(?:[\\p{L}-]+\\s){0,3}?$");
// The author's own trade in market talk is hedged: "куплю биток, если упадёт", "I'd rather buy BTC on the dip", "куплю позже".
// "если интересно", "если что", "если у кого есть", "когда удобно" and "if interested" call readers instead.
const HEDGE = any("‹(?:(?:если|if)(?! (?:что|у кого|удобно|интерес|нужн|надо|кому|кто|вам|тебе|есть|прода|купите|обменяете|interested|you|needed|anyone|someone|any))|когда(?! (?:удобно|угодно|(?:будет )?(?:нужно|надо)))|(?<!хотел\\p{L}{0,2} )бы"
  + "|наверное|думаю|может быть|просадк\\p{L}*|подешевеет|упад[её]т|позже|потом|when(?! (?:ready|convenient|you))|would|rather|maybe|probably|dips?|think|wait|later)›");
// Market timing makes buying an investment, not a trade with a member: "Anyone buying BTC on this dip?", "Кто покупает TON на
// этих уровнях?".
const MARKET = any("‹(?:dips?|просадк\\p{L}*|уровн\\p{L}*|levels?|хаях|лоях|highs|lows|на (?:падении|росте|коррекции)|коррекци\\p{L}*|pump\\p{L}*|dump\\p{L}*|памп\\p{L}*|дамп\\p{L}*|hodl\\p{L}*|холд\\p{L}*|bull\\p{L}*|bear\\p{L}*|бычк\\p{L}*|медвеж\\p{L}*)›");
// Where, how or which, asked: "Хочу купить 500 usdt. Где это лучше сделать?", "Кто меняет usdt на p2p — какие банки не блокируют?".
const VENUE_QUESTION = any("‹(?:где|куда|откуда|как|каком|какой|какая|какую|какие|каким|сколько|почему|зачем|что делать|where|how|which|what|why)›");
const ADVICE = any("‹(?:подскажите|посоветуйте|порекомендуйте|подскажи|посоветуй|нужен совет|нужна помощь|нужна подсказка|advise|recommend|suggest|any tips|advice)›|‹which (?:exchange|platform|app|service|site|bank)");
// The asset is what is traded, right after the verb with only amounts, fiat, owners and connectors between ("куплю USDT TRC20",
// "кто купит у меня 300 usdt", "обменяю лиры на USDT", "exchange my 2.4k$ in bank to crypto"), or just before it ("USDT куплю").
// Goods priced or paid in crypto ("Продам iPhone за 450 usdt", "Меняю iPhone на usdt") and crypto-themed goods ("Продам курс
// по крипте") are no trade. Each word is checked on its own, so a long run of digits or underscores stays linear.
const GAP_WORD = re("^(?:[/&+⇄↔→-]|\\d[\\d_.,]*(?:k|к|тыс\\p{L}*)?\\p{Sc}?|\\p{Sc}[\\d_.,]*|(?:шт\\.?|штук\\p{L}*|руб\\p{L}*|р|доллар\\p{L}*|бакс\\p{L}*|евро|гривн\\p{L}*|тенге"
  + "|лир\\p{L}*|лари|бат\\p{L}*|драм\\p{L}*|донг\\p{L}*|динар\\p{L}*|сом\\p{L}*|рупи\\p{L}*|юан\\p{L}*|злот\\p{L}*|налич\\p{L}*|нал|кэш|деньг\\p{L}*|фиат\\p{L}*"
  + "|usd|eur|rub|uah|inr|aed|thb|try|php|idr|vnd|cny|kzt|gel|amd|dollars?|bucks|euros?|rupees?|baht|lira|dirhams?|pesos?|yuan|cash|money|fiat|funds?"
  + "|мо[иий]|сво[иий]|ваш\\p{L}*|тво[иий]\\p{L}*|немного|чуть|пару|ещ[её]|my|your|our|some|the|a|an|bank|банк\\p{L}*"
  + "|покупк\\p{L}*|продаж\\p{L}*|обмен\\p{L}*|валют\\p{L}*|currenc\\p{L}*|лишн\\p{L}*|свободн\\p{L}*|spare|ли|кто-нибудь|кто-то|у|меня|нас|мне|нам|тебе|вам|me|us|you|и|или|and|or|на|в|с|со|to|into|in|from)[.]?)$");
const ASSET_BEFORE = re(`(?<!‹(?:за|в|во|for|in|with)\\s)${ASSET}\\s?(?:[,—–:-]\\s?)?(?:[\\p{L}-]+\\s)?$`);
// "Обменяю рубли в usdt" exchanges into the asset.
const EXCHANGE_VERB = re("‹(?:обмен|поменя|меня|swap|exchange|convert)");
const HOLDS = re("^(?:в|во|с|со|in|with)$");
function tradesAsset(part: string, start: number, end: number): boolean {
  if (ASSETS.test(part.slice(start, end))) return true;
  const after = part.slice(end, end + 80);
  const asset = ASSETS.exec(after);
  const gap = asset ? after.slice(0, asset.index).trim() : "";
  const gapWords = gap ? gap.split(/[\s/]+/u).filter(Boolean) : [];
  // "Продаю в usdt", "Продам карту с usdt": the asset is how it is paid or what something holds.
  return asset !== null && !/[,;:()]/u.test(gap) && gapWords.length <= 5 && gapWords.every((word) => GAP_WORD.test(word)) && !(HOLDS.test(gapWords.at(-1) ?? "") && !EXCHANGE_VERB.test(part.slice(start, end)))
    || ASSET_BEFORE.test(part.slice(Math.max(0, start - 30), start));
}
// The judgement is the shape: a good, fair or affordable price ("адекватн", "приемлем", "разумн", "справедлив", "доступн", …),
// never a reference rate ("по курсу", "по такому курсу", "по курсу биржи", "по рыночной цене", "по 95") or a market
// judgement ("по смешной цене", "по завышенному курсу"). "недорого", "ниже биржи", "at an adequate rate" and a volume
// ("любой объём", "any amount", "оптом") are terms too.
const FAIR = "(?:адекватн|хорош|нормальн|норм|выгодн|лучш|приятн|честн|отличн|вкусн|приемлем|разумн|справедлив|достойн|демократичн|бюджетн|доступн|комфортн|сладк|топов|человеческ|минимальн|добр|божеск)";
const RATE = any(`‹по (?:(?:очень|самому|самой|более|максимально|вполне) )?${FAIR}\\p{L}* (?:курсу|цене)›|‹${FAIR}\\p{L}* (?:курс|цен)\\p{L}*›`,
  "‹(?:недорого|подешевле|ниже (?:рынка|биржи|курса)|выше (?:рынка|биржи|курса)|без (?:накрутк|комисси)\\p{L}*)›",
  "‹(?:at|for|with) (?:a |an |the )?(?:very )?(?:good|best|fair|great|nice|decent|adequate|reasonable|competitive|top|cheap|low)(?:est)? (?:rates?|prices?)›|‹(?:best|good|fair|top) rates?›|‹(?:below|above) (?:market|binance)›",
  "‹(?:любой|любые|любом|крупн\\p{L}*|больш\\p{L}*) (?:объ[её]м\\p{L}*|сумм\\p{L}*)|‹(?:any|large|big) (?:amount|volume|size)s?›|‹(?:bulk|оптом)›");
// An offer may also name cash or a meeting, or price itself ("дорого", "выгодно"); a question about who trades for cash may be a
// member's caution ("Who sells USDT for cash in person? Asking because it seems risky").
const OFFER_TERMS = any("‹(?:налич\\p{L}*|нал›|кэш|cash›|личн\\p{L}* встреч\\p{L}*|при встрече|f2f|face to face|in person)", "‹(?:дорого|дешево|выгодно|cheap|cheaply)›");
const ASKED = re("^(?:кто(?:-нибудь| нибудь)|anyone|anybody)›");
// Only a later where, how or why question ("…? Где вы таких находите?") makes an ask talk; "…? Нужно 500, можно сегодня?" is practical.
const LATER_VENUE = re("‹(?:где|как|почему|зачем|откуда|куда|where|how|why)›");
const LATER_TALK = re("^\\s?(?:или|or|nobody|no one|никто|ни у кого|но|but)›");
const ASKED_BEFORE = re("‹(?:есть|есть ли|может|а)\\s$");
// A header is a short clause with no predicate: "Обмен USDT на рубли", "Exchange USDT to PHP", but not "Покупка USDT через сбер
// закрыта", "Продажа USDT облагается налогом", "Продажа биткоина Германией обвалила рынок" or "Buying BTC is risky".
// Russian endings only on a Russian word (one with a letter that has no Latin lookalike), so "market" is no predicate.
// "Обменник USDT на Руставели норм" and "Selling BTC at a loss hurts" judge; "Sell BTC, buy ETH — that's my plan" tells a plan.
const PREDICATE = any("‹(?=\\p{L}*[бгджзилпфцчшщъыьэюяй])\\p{L}+(?:ла|ло|ется|ются|ит|ят|ена|ено|ены|ана|ано|ыта|ыто|ята|ято|(?<!вал)(?:ет|ют))›", "‹(?:is|are|was|were|has|have|had|will|got|gets|became|becomes|стал\\p{L}*|теперь)›",
  "‹(?:норм|ок|hurts?|sucks|fine)›(?! (?:курс|цен|rates?|prices?))");
const TOLD = any("‹(?:that['’]s|it['’]s (?:my|a|an|the|not|just|how|what|why|risky|bad|dumb|stupid|wrong)›|this is|my plan|my strategy|мой план|works (?:fine|great|well|ok)|worked|hurts?|sucks)›");
const CALL_WORD = "(?:напиши(?:те)?|пиши(?:те)?|отпиши(?:те)?(?:сь)?|стучи(?:те)?|маякни(?:те)?|звони(?:те)?|обращайтесь|свяжитесь|write|text|message|msg|dm|pm|inbox|contact|hmu|hit me up)";
const LONG_HEAD_CALL = re(`^(?:${CALL_WORD}›|связь›|@[\\w])`);
// A longer head is a classified when a call or contact follows it: "Selling USDT for cash in Dubai Marina, DM me".
const isHeader = (clause: string, next?: string) => {
  const head = clause.split(/[,;:—–(]|\s-\s/u)[0]!;
  if (PREDICATE.test(head) || TOLD.test(clause)) return false;
  if (head.trim().split(/\s+/u).length <= 6) return true;
  const rest = clause.slice(head.length).replace(/^[\s,;:—–(-]+/u, "");
  return LONG_HEAD_CALL.test(rest) || !rest.trim() && LONG_HEAD_CALL.test((next ?? "").trim());
};
type TradeIntent = { kind: "ask" | "offer" | "want"; question: boolean; rate: boolean };
// The asset is named next to the verb, or the verb stands alone beside a header ("💵 USDT 💵\nКуплю / продам").
function tradeIntents(text: string): TradeIntent[] {
  // A decimal point ("2.4k$", "0.5 btc") ends no sentence.
  const parts = sentences(text.replace(/(?<=\d)\.(?=\d)/gu, "_"));
  const words = (part: string | undefined) => part?.trim().split(/\s+/u).filter(Boolean).length ?? 0;
  const header = (part: string | undefined) => part !== undefined && words(part) <= 3 && !isQuestion(part) && ASSETS.test(part);
  // A wish to trade asked with where, how or for advice anywhere in the message seeks help, not a trader.
  const advice = ADVICE.test(text) || parts.some((part) => isQuestion(part) && VENUE_QUESTION.test(part));
  const deal = hasDeal(text);
  // Counted once, so a long run of sentences stays linear.
  const venueQuestionAt = parts.map((part) => isQuestion(part) && LATER_VENUE.test(part));
  const venueQuestions = venueQuestionAt.filter(Boolean).length;
  return parts.flatMap((part, i) => {
    const beside = words(part) <= 4 && (header(parts[i - 1]) || header(parts[i + 1]));
    const named = (m: RegExpMatchArray) => beside || tradesAsset(part, m.index!, m.index! + m[0].length);
    const before = (m: RegExpMatchArray) => part.slice(Math.max(0, m.index! - 60), m.index);
    const own = (m: RegExpMatchArray) => named(m) && !NOT_OWN.test(before(m)) && !VENUE.test(before(m));
    const question = isQuestion(part);
    const venue = question && VENUE_QUESTION.test(part);
    const rate = !venue && RATE.test(part);
    const found: TradeIntent[] = [];
    // "Кто продаёт usdt на p2p — какие банки сейчас не блокируют?" asks traders a question; it seeks none.
    const asks = [...part.matchAll(ASK_ALL), ...deal ? part.matchAll(HAS_ALL) : []].filter((m) => named(m) && !VENUE.test(before(m))
      && !(question && VENUE_QUESTION.test(part.slice(m.index! + m[0].length))));
    // "есть кто может продать юстд по адекватному курсу" asks without its "?".
    // Terms alone make an ad of a lone ask; "Кто продаёт usdt по адекватному курсу? Где вы таких находите?" or "…? Или все на бирже?"
    // is talk about traders.
    const market = MARKET.test(part);
    const lone = venueQuestions - (venueQuestionAt[i] ? 1 : 0) === 0 && !LATER_TALK.test(parts[i + 1] ?? "");
    if (asks.length && !market) found.push({ kind: "ask", question: question || asks.some((m) => ASKED.test(m[0]) || ASKED_BEFORE.test(before(m))), rate: rate && lone && !ADVICE.test(text) });
    if (HEDGE.test(part) || market || venue) return found;
    if ([...part.matchAll(OFFER_ALL)].some(own) || !question && [...part.matchAll(HEADER_OFFER_ALL)].some((m) => named(m) && isHeader(part.slice(m.index!), parts[i + 1])))
      found.push({ kind: "offer", question, rate });
    if (!advice && [...part.matchAll(WANT_ALL)].some(own)) found.push({ kind: "want", question, rate });
    return found;
  });
}
// A call followed by a question to the chat asks for replies, not a deal: "Пишите, что почитать", "Напишите, кто как меняет",
// "Пишите, если есть вопросы", "DM me your thoughts", "Message me if you have tips".
const ASKS_REPLIES = new RegExp(re(`‹${CALL_WORD}(?: (?:мне|нам|me|us|в лс|в личку|в личные|в директ|in dm|in pm))?\\s?[,:—–-]?\\s?(?=(?:кто(?!${SOMEONE} (?:(?!(?:как|где|куда|когда|почему|зачем|сколько)›)[\\p{L}-]+ )?(?:${TRADE_3RD}|${TRADE_INF})›)|как|что|где|куда|откуда|как\\p{L}+(?! (?:объ[её]м|сумм|курс))|сколько(?! (?:у (?:вас|тебя) )?(?:есть|нужно|надо|прода|готов))|чем|почему|зачем|на что|подскажу|расскажу|объясню|поделюсь`
  + "|who|how(?! much (?:you|do you))|what(?! (?:you|u) (?:have|need|got|want))|where|which|why|me (?:your|ваш\\p{L}*)|your thoughts|i have a question|у меня (?:есть )?вопрос"
  // Writing to the admins reports someone: "Пишите в лс админам".
  + "|админ(?:ам|у|ке|истратору|истраторам)›|модер(?:ам|у|атору|аторам)›|(?:an?|the|to(?: the)?|our) (?:admins?|mods?|moderators?)›"
  + "|when(?! (?:ready|convenient|you(?:['’]re| are) ready))|когда(?! (?:удобно|угодно|(?:будет )?(?:нужно|надо)))"
  // "Пишите, если нужна инструкция", "Message me if you want my spreadsheet"; but "пишите, если интересно", "DM me if
  // interested" and "if you need USDT" are an ad's own call.
  // "пишите, если есть", "если есть лишние usdt", "если продаёте" and "if you have any" offer a trade too; "если есть такой опыт"
  // and "if you have any horror stories" ask for replies.
  + "|(?:если|if)(?! (?:интерес|надо›|нужн\\p{L}*›(?! (?:инструкц|совет|помощ|подсказ))|актуальн|что(?!-)›|удобно|у кого|кому|есть(?=(?:\\s?(?:[.,!?;)—–-]|$)|\\s(?:" + ASSET + "|\\d|(?:any|some)\\s?(?:[.,!?;)—–-]|$)|(?:any |some )?(?:to sell|for sale|to spare)|лишн|свободн|на продажу|что (?:продать|обменять)|желани\\p{L}* (?:продать|купить|обменять)|(?:что (?:предложить|отдать)|предложени\\p{L}*|интерес)\\s?(?:[.,!?;)]|$))))|прода[её]те|продадите|купите|обменяете"
  + "|interested|needed|you(?:['’]re| are)? (?:interested|selling|buying)|you (?:sell|buy)|you need (?!help|advice|tips|instructions)|you want (?:to (?:buy|sell|trade|exchange|swap)|some)|you (?:have|got)(?=(?:\\s?(?:[.,!?;)—–-]|$)|\\s(?:" + ASSET + "|\\d|(?:any|some)\\s?(?:[.,!?;)—–-]|$)|(?:any |some )?(?:to sell|for sale|to spare)|лишн|свободн|на продажу|что (?:продать|обменять)|(?:something|anything) to (?:sell|offer)|(?:an? (?:offer|deal)|offers|an? (?:good |better |fair )?(?:rate|price))\\s?(?:[.,!?;)]|$)))))))›)").source, "giu");
// A call to the admins reports someone: "Тут опять кто-то продаёт usdt. Напишите админу в личку", "DM the admin". "админ разрешил"
// in an ad is no call to them.
const ADMIN_CALL = new RegExp(re(`‹${CALL_WORD}(?: (?:в лс|в личку|в личные|in dm|in pm|privately))? (?:админ(?:ам|у|ке|истратору|истраторам)|модер(?:ам|у|атору|аторам)|(?:an?|the|our) (?:admins?|mods?|moderators?))›(?: (?:в лс|в личку|в личные|in (?:dm|pm|private)|privately))?`).source, "giu");
// A bare call: "Напишите, договоримся", "пишите", "маякните", "кому надо пишите", "text me", "PM".
const REPLY_CALL = any(`(?:^|[.!?,;:/\\n—–-]\\s?|‹если что )${CALL_WORD}(?: (?:мне|нам|me|us|со мной|с нами))?(?: (?:в|на|on|via|in) (?:ватсап|вотсап|whatsapp|телег\\p{L}*|тг|вайбер|viber|signal|telegram|tg))?(?: (?:пожалуйста|плиз|плз|please|pls))?\\s?(?:[.!,;/\\n]|\\+?\\d|$|(?=(?:если|if|когда|when) ))`,
  "‹кому (?:надо|нужно|интересно)\\s?[—–-]?\\s?(?:пиш|напиш)\\p{L}*|‹(?:пиш|напиш)\\p{L}* кому (?:надо|нужно|интересно)›");
// "Обсудим" or "let's talk" is a deal only standing alone or taken private; "Обсудим в чате" invites talk.
const NEGOTIATE = any("‹(?:договор(?:имся|иться)|торг›|жду (?:ваших )?предложени\\p{L}*|negotiable|let['’]?s deal)",
  "‹(?:обсудим|let['’]?s (?:talk|discuss))(?: (?:детали|цену|условия|курс|сумму|объ[её]м|the (?:price|terms|details|rate)|price|terms|details|rate|numbers))?"
  + "(?: (?:в лс|в личке|в личных|лично|в (?:телег\\p{L}*|тг|tg|whatsapp|ватсап\\p{L}*|вотсап\\p{L}*|telegram)|privately|in (?:dm|pm|private)|on (?:telegram|whatsapp|tg)))?"
  // A leading "Обсудим, кто продаёт дешевле?" opens a chat question.
  + "\\s?(?:[.!;)\\n]|,(?!\\s?(?:кто|где|как|какой|какие|почему|что|who|where|how|which|what|why)›)|$)");
// A handle or chat link closing a line after punctuation is a contact ("курс выгодный, @exchanger_x"). After a word it is a
// mention or a source ("покупаю через @wallet", "Подробнее: t.me/cryptonews_ru", "в канале @crypto_news"), and so is a bot.
const SOURCE = "(?:подробн\\p{L}*|источник\\p{L}*|details|source|more|via|канал\\p{L}*|channel)";
const CONTACT = re(`(?:^|\\n|[,:—–-])\\s?(?<!‹${SOURCE}\\s?:\\s?)(?!@(?:wallet|[a-z0-9_]*bot)›)(?:@[a-z][a-z0-9_]{3,}|(?:https?://)?(?:t|wa)\\.me/[\\w/+-]{1,64})[.!]*\\s?(?:\\n|$)`);
const SOURCE_LINK = new RegExp(re(`‹${SOURCE}[^.!?\\n]{0,20}?(?:@[a-z][a-z0-9_]{3,}|(?:https?://)?(?:t|wa)\\.me/[\\w/+-]{1,64})`).source, "giu");
const WEB_LINK = /https?:\/\/(?!(?:www\.)?(?:t|wa|telegram)\.me\/)\S+/gu;
// The ad's handle closes it; addressing someone opens the message: "@vasya, продашь usdt?".
const ADDRESS = /^@[a-z][a-z0-9_]{3,}/u;
// Warnings about such asks: "не продавайте usdt тем, кто пишет в лс", "never buy crypto from DMs".
// Reports of a repeat poster quoting the ad: "Этот тип опять пишет 'кто продаст usdt, пишите'".
const TRADE_WARNING = any("‹(?:не|никогда не) (?:покупайте|продавайте|меняйте|обменивайте|переводите|отправляйте|соглашайтесь)›",
  "‹(?:never|don['’]?t|do not) (?:buy|sell|send|trade|exchange|swap)›",
  "‹(?:опять|снова|постоянно|вечно|again|keeps?) (?:[\\p{L}-]+ ){0,2}?(?:пишет|пишут|постит|постят|кидает|кидают|рассылает|рассылают|спамит|спамят|posting|posts|spamming)›");
// Rule reminders quoting an ad, quoted or not: "Объявления типа «куплю usdt, пишите в лс» здесь запрещены", "…— бан", "Posts like
// 'selling USDT, DM me' are not allowed". An ad's plea ("не забаньте", "не запрещено") is no rule.
const TRADE_RULE = any(
  "(?<!‹не )‹(?:запрещ\\p{L}*|против правил|нарушени\\p{L}* правил|будут удал\\p{L}*|удаля(?:ем|ются|ться|ет)|удалим|бан|в бан|забан\\p{L}*|баним|банят|банить)›"
  + "|‹нельзя (?:[\\p{L}-]+ )?(?:писать|продавать|покупать|размещать|рекламировать|публиковать|предлагать|постить|торговать)›|‹(?:здесь|тут) нельзя›",
  "‹(?:(?:is|are)(?:n['’]?t| not) allowed|not allowed|banned|prohibited|forbidden|against (?:the )?rules|will be (?:deleted|removed|banned))›");
// …but a deal's own terms forbid things too: "Оплата от третьих лиц запрещена", "Third-party payments are not allowed".
const DEAL_RULE = re("‹(?:оплат|плат[её]ж|перевод|третьи\\p{L}* лиц|чужи\\p{L}* карт|payments?›|transfers?›|third[- ]part)");
const tradeRule = (text: string) => sentences(text).some((part) => TRADE_RULE.test(part) && !DEAL_RULE.test(part));
// The asker's doubt about a trade offer, not an offer: "это нормальный курс?", "Is this legit?".
const TRADE_DOUBT = any("‹это (?:[\\p{L}-]+ ){0,2}?(?:нормальн|норм›|правд|реальн|законн|безопасн|честн)",
  "‹(?:стоит ли|можно ли довер|доверя)", "‹(?:legit|legitimate|safe|a scam|trustworthy)\\s?\\?", "‹(?:is|are) (?:this|that|it|these|they) (?:[\\p{L}-]+ ){0,2}(?:ok|okay|normal|legit|real|safe|a scam)›");
// A member's question about crypto invites an answer with an offer; "Где купить хлеб?" or "Какой курс в обменнике?" does not.
const CRYPTO_TOPIC = (source: string) => ASSETS.test(source) || re("‹(?:p2p|п2п)›").test(source);
// The author wants information, not a trade: "Есть кто продаёт usdt? Хочу понять курс. Напишите", "Text me, I have a question".
// A support question: "У кого есть USDT на Bybit, напишите в лс, вопрос по выводу", "Anyone have USDT stuck on Binance? DM me, same problem".
const INFO = any("‹(?:хочу|хотел\\p{L}*|хотим) (?:понять|узнать|спросить|разобраться)›(?! (?:ваш|твой|ваши|твои)›)|‹i (?:want|wanted|need) to (?:know|ask|understand)›|‹(?:у меня|i have|i['’]ve got|i got) (?:a |one |пара |есть )?(?:вопрос|question)",
  "‹вопрос (?:по|про|о|насч[её]т)›|‹(?:same (?:problem|issue)|та же проблема|такая же проблема|stuck|застрял\\p{L}*|завис\\p{L}*)›");
// Where they trade, not a call: "Кто продаёт usdt в лс — сразу в бан".
const TRADES_IN_DM = new RegExp(re(`‹${TRADE_3RD}(?: (?!${CALL_WORD}›)[\\p{L}-]+){0,2}? (?:в|во) (?:лс|личк\\p{L}*|личн\\p{L}*|директ)›`).source, "giu");
// A condition before the call asks for replies too: "Если нужна инструкция — пишите", "If you need help, DM me". Questions are
// an ad's own call ("Куплю USDT. Если есть вопросы — пишите в лс") unless the author tells where they trade ("I buy BTC on
// Bybit. If you have questions, DM me").
const ifCall = (topic: string) => new RegExp(re(`‹(?:если|if) (?:[\\p{L}-]+ ){0,3}?(?:${topic})\\p{L}*\\s?[,:—–-]?\\s?`
  + `(?:${CALL_WORD}|обраща\\p{L}*)(?: (?:мне|нам|me|us))?(?: (?:в лс|в личку|в личные|in dm|in pm|privately))?›`).source, "giu");
const IF_HELP_CALL = ifCall("инструкц|помощ|совет|подсказ|help›|advice›|tips›|instructions?›");
const IF_QUESTION_CALL = ifCall("вопрос|questions?›");
// A DM refused is no call: "в личке не торгую", "never via DM", "no DMs".
const NO_DM = new RegExp(re("‹(?:(?:в|во) (?:лс|личк\\p{L}*|личн\\p{L}*|директ) (?:не|никогда не) [\\p{L}-]+|(?:не|никогда не) (?:[\\p{L}-]+ )?(?:в|во|через) (?:лс|личк\\p{L}*|личн\\p{L}*|директ)"
  + "|(?:never|not|don['’]?t|do not|won['’]?t) (?:[\\p{L}-]+ )?(?:via|in|through|over|by) (?:dms?|pms?|private)|no (?:dms?|pms?)›)").source, "giu");
// Where a member buys, or advises trading, describes a habit or a tip, not an ad: "Покупаю usdt у обменника возле дома",
// "I buy USDT on Binance P2P", "лучше через Bybit P2P". A seller naming their platform ("Продаю USDT на Bybit P2P") or how they
// are paid ("Куплю USDT дорого, оплата на Сбер") still advertises. How often the author trades is a habit too.
const VENUE_PLACE = re("‹(?:через|via|on|at|на|в|у|with) (?:[\\p{L}-]+ )?(?:binance|bybit|okx|kraken|htx|huobi|kucoin|mexc|bitget|gate|coinbase|p2p|п2п|бирж\\p{L}*|exchanges?|обменник\\p{L}*|тинькофф\\p{L}*|тиньк\\p{L}*|сбер\\p{L}*|банк\\p{L}*|bank|wallet|кошел\\p{L}*|приложени\\p{L}*|app)›");
// A comparison ("Курс лучше, чем в банке") is an offer's terms, not advice.
const VENUE_USER = re("‹(?:покупаю|меняю|обмениваю|беру|i (?:usually |always )?(?:buy|exchange|swap|get)|(?:лучше|проще|удобнее|безопаснее|надёжнее|надежнее)›(?!,?\\s?чем›))|‹(?:better|best|easiest|safest) (?:to|on|via|through|at|use)›|‹(?:rates?|prices?|курс\\p{L}*|цен\\p{L}*) (?:there|там)›");
// Selling on an exchange's order book ("продаю свои USDT на бирже", "Selling my BTC on Coinbase") is no P2P deal; its P2P
// market ("на Bybit P2P") is, and so is a rate compared to one ("дешевле, чем на бирже").
const EXCHANGE_PLACE = re("(?<!‹(?:чем|than)\\s)‹(?:через|via|on|at|на|в) (?:[\\p{L}-]+ )?(?:binance|bybit|okx|kraken|htx|huobi|kucoin|mexc|bitget|coinbase|бирж\\p{L}*)›(?! (?:p2p|п2п)›)");
// Where the money or coins go ("оплата на Сбер", "перевожу на Binance", "отправлю на любую биржу") is how a deal settles.
// Only the settlement phrase itself, up to its destination: "Сделал вывод: покупаю … через Тинькофф" keeps the member's venue.
const PAID_VIA = re("‹(?:оплат|перев[оеё][дж]|отправ|принима|зачисл|вывод|вывож|payment|transfer|pay›|send)\\p{L}*(?: [\\p{L}\\p{N}-]+){0,2}? (?:на|в|во|через|to|via|on|into)›(?: [\\p{L}-]+)? [\\p{L}\\p{N}-]+", "giu");
const HABIT = re("‹(?:обычно|всегда|регулярно|постоянно|каждую неделю|каждый месяц|каждый день|usually|always|regularly|every (?:week|month|day))›");
const ownVenue = (text: string) => HABIT.test(text)
  || sentences(text).some((part) => {
    const place = part.replace(PAID_VIA, " ");
    return (VENUE_USER.test(part) || EXCHANGE_PLACE.test(place)) && VENUE_PLACE.test(place);
  });
const HELPER = any("‹кто(?:-нибудь| нибудь)? (?:может|сможет|готов)\\s?(?:[—–,-]|$)|‹кто(?:-нибудь| нибудь)? (?:может |сможет |готов )?помо(?:жет|чь)›(?! (?:разобраться|советом|понять))|‹(?:who|anyone|someone) (?:can |could )?help (?:me )?(?:with (?:it|this|that)›|›(?! (?:me )?(?:understand|figure)))");
// A DM call, a contact or negotiation makes any intent an ad, and a bare "напишите" any but a wish. Good-rate or volume terms
// do for an offer and for a question seeking a trader ("есть кто может продать юстд по адекватному курсу?").
function cryptoTradeAsk(message: ModerationMessage, text: string): boolean {
  if (TRADE_WARNING.test(text) || tradeRule(text) || ADDRESSED.test(text) || ADDRESS.test(text)) return false;
  const intents = tradeIntents(text);
  if (!intents.length) return false;
  if (INFO.test(text)) return false;
  const habit = ownVenue(text);
  const calls = text.replace(ADMIN_CALL, " ").replace(IF_HELP_CALL, " ").replace(habit ? IF_QUESTION_CALL : /(?!)/u, " ").replace(ASKS_REPLIES, " ").replace(SOURCE_LINK, " ").replace(TRADES_IN_DM, " ").replace(NO_DM, " ");
  const dm = callsToDm(calls.replace(WEB_LINK, " ")) || CONTACT.test(calls) || NEGOTIATE.test(calls);
  // "Нужно поменять юсдт на рубли, кто поможет — пишите" seeks a trader, so a wish takes a bare call too.
  const reply = REPLY_CALL.test(calls);
  const helper = HELPER.test(text);
  const terms = sentences(text).filter((part) => !(isQuestion(part) && VENUE_QUESTION.test(part)));
  const offerTerms = !habit && terms.some((part) => OFFER_TERMS.test(part) || RATE.test(part));
  if (!intents.some(({ kind, question, rate }) => dm || (kind !== "want" || helper) && reply
    || kind === "ask" && question && rate || kind === "offer" && offerTerms)) return false;
  if (sentences(text).some((part) => isQuestion(part) && TRADE_DOUBT.test(part))) return false;
  return !answersRequest(message, CRYPTO_TOPIC);
}

// --- Explicit adult-content promotion (#145): explicit porn/XXX content + a funnel to a button, site, bot, channel or DM. ---
// What the funnel sells: "content", "videos", "clips", "контент", "видео", also obfuscated ("c0ntent").
// A channel or chat is no content: "18+ chat" is an age limit.
const CONTENT = "(?:content|c0nt[e3]nt|cont3nt|videos?|vids?|clip\\p{L}*|pics?|photos?|контент\\p{L}*|видео\\p{L}*|ролик\\p{L}*|клип\\p{L}*|фото\\p{L}*|klip\\p{L}*)›";
// Explicit terms, obfuscated or not: porn (p0rn, pr0n, порно), nudes, OnlyFans, hentai, a sex video/chat/cam, cam girls,
// leaked nudes, and "18+", "XXX", erotic or adult only next to what is sold ("XXX content", "18+ видео", "c0ntent xXx").
// NSFW counts only as an NSFW channel, bot or vault: "NSFW gore video, click the link" or "Warning: NSFW content. Link below"
// warns about a shared link. Sexuality, medicine and news words ("sexual", "sexualité", "pédopornographie", "18+ only", "uncensored video") are
// not, and "explicit content" is a platform setting ("Telegram now shows explicit content on iOS").
const ADULT = any("‹(?:p[o0]rn|pr[o0]n›|п[o0]рн)\\p{L}*",
  "‹(?:nud[e3]s|nudez|нюдс\\p{L}*|нюдес\\p{L}*|onlyfans|only fans|онлифанс\\p{L}*|hentai|хентай\\p{L}*)›",
  "‹nsfw (?:[\\p{L}-]+ )?(?:channel|bot|vault|leaks?|канал\\p{L}*|бот\\p{L}*)›",
  "‹(?:sex|секс)[ -]?(?:videos?|vids?|clips?|chats?|cams?|tapes?|content|видео|чат\\p{L}*|переписк\\p{L}*|ролик\\p{L}*|контент\\p{L}*)›|‹sexchat›|‹(?:sexy|naked|nude) (?:videos?|vids?|clips?|pics?|photos?|content)›",
  "‹cam ?girls?›|‹(?:webcam|live cam) (?:shows?|girls?|models?|sex)›",
  "‹(?:leaked|слив\\p{L}*|слит\\p{L}*) (?:[\\p{L}-]+ )?(?:nudes|onlyfans|онлифанс\\p{L}*|нюд\\p{L}*|интим\\p{L}*)",
  `(?<![\\p{L}\\p{N}])(?:18 ?\\+|x{3,}›|эро(?:тик|тическ)\\p{L}*|erotic\\p{L}*|интим\\p{L}*|adult›) (?:(?!only›|только›)[\\p{L}-]+ )?${CONTENT}`,
  `‹${CONTENT} (?:[\\p{L}-]+ )?(?:18 ?\\+|x{3,}›)`);
// Adult-service phrases explicit only together: "Private rooms · full-length scenes · face cam · no blur".
const ADULT_SERVICE = new RegExp(re("‹(?:no blur|private rooms?|face ?cam|full[- ]length (?:scenes?|videos?)|uncensored|без цензуры|приватн\\p{L}* комнат\\p{L}*)›").source, "giu");
// Ads never deny it; rules and channel descriptions do: "No porn, no spam, join @memes", "без порно". "Food porn" and other
// "X porn" slang is no porn. Only a quantity word may sit between, so "без регистрации порно видео" stays an ad. A "nudes
// palette" is make-up.
const ADULT_DENIED = re("‹(?:food|foodie|earth|car|sky|space|tech|gear|ruin|book|city|house|home|real estate|property|design|interior|architecture|nature|sunset|cat|dog|data|map|word|gun|fitness|travel|plant|garden|coffee|cable|cable management|keyboard|desk|setup|sound|audio|font|typography|code|ui|lego|engine|woodworking|kitchen|bike|watch|shoe|sneaker|chess|gpu|eye|visual|фуд|кабель\\p{L}*) p[o0]rn\\p{L}*|‹(?:no|not|without|zero|без|не|нет|никакого|никакой|никаких|ни) (?:(?:a|an|the|any|more|real|such|other|explicit|какого|какой|такого|всякого|лишнего|больше) )?(?:p[o0]rn|п[o0]рн|nsfw|nudes|18 ?\\+|x{3,}›|adult|explicit|эрот|интим|нюдс)\\p{L}*"
  + "|‹nud[e3]s? (?:palettes?|lipsticks?|shades?|tones?|collection)›", "giu");
// Porn as a predicate ending its clause, or as praise, is slang: "this code review is porn,", "the new MacBook is porn imo",
// "Эта клавиатура — чистое порно, жми", "не код, а порно.", "порно какое-то", "porn for nerds", "порно для любого дизайнера".
// An ad's "Pure porn 24/7" or "Это порно-канал" is no predicate. Slang cancels only weak cues (a click or жми call, an arrow, a
// DM call, a shared t.me post); an invite or channel link, a bot handle or URL buttons still sell it ("This is porn 🥵 t.me/+…").
const PRAISE = "pure|absolute|total|literal|literally|basically|straight up|kinda|just|visual|чистое|чистой воды|просто|прям|прямо|сплошное|визуальное";
const PRAISED = "(?:for|для) (?:(?:any|every|all|true|real|любого|каждого|настоящих|всех|истинных) )?(?:nerds?|geeks?|devs?|developers?|engineers?|designers?|programmers?|coders?|perfectionists?|gamers?|the eyes|eyes|ears|(?:гик|нерд|дизайнер|разработчик|программист|перфекционист|инженер|айтишник|геймер|глаз|ушей|души|мозг)\\p{L}*)›";
const ADULT_SLANG = re(`(?:‹(?:is|are|was|were|it['’]?s|that['’]?s|это|а)|\\s[—–-])\\s(?:(?:${PRAISE}) ){0,2}(?:p[o0]rn|п[o0]рн)\\p{L}*`
  + `(?=\\s?(?:[,.!;:—–]|$|\\p{Extended_Pictographic}|(?:imo|tbh|ngl|honestly|bro|dude|man|to me|какое-то|в чистом виде)›|${PRAISED})|\\s-\\s)`
  + `|‹(?:p[o0]rn|п[o0]рн)\\p{L}* (?:какое|какой|какая)-то|‹(?:p[o0]rn|п[o0]рн)\\p{L}* (?:в чистом виде|${PRAISED})`, "giu");
// The funnel: a button or door to pick, a site, bot, app or channel to open, a link below or in the bio, a DM call, a bot
// handle, a t.me link or URL buttons attached to the message. A plain web link is a shared article or joke, and "зайди в
// настройки" is settings help.
const FUNNEL = any(
  "‹(?:tap|click|press|hit|pick|choose|select|use) (?:[\\p{L}-]+ ){0,2}?(?:buttons?|doors?|links?|rooms?)›",
  "‹(?:buttons?|links?|doors?) (?:below|here|in (?:my |the )?(?:bio|profile|comments|description))›",
  "‹open (?:the |my |our |a )?(?:site|website|bot|app|link|channel|vault|chat|room)›",
  "‹(?:link in|in my|check my|on my) (?:bio|profile)›|‹(?:watch|play|enter) (?:it |them )?(?:now|free|here)›|‹get (?:it |them )?(?:now|free|access)›|‹free (?:preview|access|trial)›",
  "‹(?:жми|нажми|нажимай|кликай|кликни)›(?! (?:в )?(?:настройк|параметр))|‹смотри (?:тут|здесь|в профиле|по ссылке|ниже|бесплатно)›",
  "‹(?:ссылк|кнопк)\\p{L}* (?:ниже|тут|здесь|в профиле|в био|в описании|в шапке|в комментари\\p{L}*)|‹в (?:профиле|био|шапке|описании)›|‹(?:бот|канал)\\p{L}* (?:ниже|тут|здесь|по ссылке)›",
  "@[a-z][a-z0-9_]*bot›|(?:(?<![\\p{L}\\p{N}_.-])|(?<=www\\.))(?:t|telegram)\\.me/");
// A join, subscribe or open call is a funnel only in a sentence about the adult content: opening a clause about it
// ("Subscribe to my OnlyFans"), calling to a channel, bot, site or link ("Новые нюдсы каждый день, вступай в канал", "Leaked
// OnlyFans, join now https://…"), or as a bare call closing it ("Эротические видео каждый день, подписывайся", "Free porn
// videos — join now", "Free porn: join now"). "My ex is about to join OnlyFans", "pure porn for developers, join @devchat",
// "Join, we're watching the Pornhub documentary", "Watching hentai tonight: join if you want" or "это порно какое-то. Заходи
// в репозиторий" call to nothing of the kind, and neither does a call to something else or anything ("Hentai is trash, join
// the anime channel instead", "Ну и порно, подпишись на нормальный канал", "Открой любой порно сайт").
const CALL = "(?:join|subscribe|sign up|переходи|перейди|заходи|зайди|подписывайся|подпишись|вступай|вступи|открой|открывай)›";
const CALL_ON = `‹${CALL}(?:[\\s:—–-]+(?:[\\p{L}-]+ ){0,3}?)`;
const CALL_TO = any(`${CALL_ON}(?:channel|group|chat|bot|site|website|vault|rooms?|links?|buttons?|канал|групп|чат|бот|сайт|ссылк|кнопк|комнат|приват)\\p{L}*›`);
const CALL_TO_LINK = any(`${CALL_ON}https?://`);
const LEAD = "(?:(?:now|so|just|and|go|come|и|а|скорее|быстрее|давай)\\s)?";
const CLAUSE_CALL = any(`^${LEAD}${CALL}`);
const BARE_CALL = any(`^${LEAD}${CALL}(?:\\s(?:now|free|here|today|бесплатно|сейчас|скорее|быстрее))?$`);
const ELSEWHERE = any("‹(?:instead|вместо|нормальн\\p{L}*|normal|друг(?:ой|ую|ие|им)|other|better|лучше|люб(?:ой|ую|ые|ом)|any)›");
function callsToContent(told: string): boolean {
  return told.split(/[.!?\n]+/u).some((sentence) => {
    if (!ADULT.test(sentence)) return false;
    const clauses = sentence.split(/[,;]+|:(?!\/\/)|\s[—–-]\s/u).map((clause) => clause.trim()).filter(Boolean);
    return clauses.some((call, i) => (CLAUSE_CALL.test(call) && ADULT.test(call) || CALL_TO.test(call)) && !ELSEWHERE.test(call)
      || CALL_TO_LINK.test(call) || i === clauses.length - 1 && BARE_CALL.test(call));
  });
}
// Pointing down or right at the buttons or link: 👇 ⬇️ ⤵️ ⏬ 👉 ➡️, or → at a link or handle ("Settings → Privacy" is a path).
// An arrow alone points as often at a news link or the post a member reports ("porn bot in the comments, look 👇"), so it
// is a funnel only with a teaser or sales cue (😏 🥵 💦, "free", "unlim", "new drops") or in a row of arrows on one line ("⬇️ ⏬⏬⏬ 👉"; a digest bullets one per line).
const ARROWS = /[\u{1F447}⬇⤵⏬\u{1F449}➡]|→\s*(?:https?:\/\/|t\.me\/|@)/gu;
const TEASER = /[\u{1F60F}\u{1F975}\u{1F4A6}\u{1F608}\u{1F48B}\u{1FAE6}\u{1F445}\u{1F351}\u{1F346}]/u;
// "Free" and "hot" sell only the content or access ("Free porn videos", "Hot OnlyFans leaks", "free preview", "for free",
// "бесплатно"): "Pornhub gives free premium", "free for creators" or "free to read" is news.
const SALES = any("‹(?:free|hot|бесплатн\\p{L}*|горяч\\p{L}*) (?:[\\p{L}-]+ )?(?:p[o0]rn|п[o0]рн|nud|нюд|hentai|хентай|onlyfans|sex|секс|xxx|videos?›|vids?›|clips?›|pics?›|content›|access›|preview›|видео|ролик|контент)",
  "‹(?:for free|бесплатно|unlim\\p{L}*|new drops?|24/7|gratis|grátis|gratuit|kostenlos|real girls|no (?:registration|sign ?up)|безлимит\\p{L}*|без регистрации|реальн\\p{L}* девуш\\p{L}*)›");
// "Нюдсы у меня в лс, пиши" asks to write: the author's DMs are the funnel.
const WRITE = any("‹(?:пиши|пишите|напиши|напишите|write me|text me|message me)›");
// An ad opens a sentence with what it sells ("Free nudes in my DM"); "I got free porn in my DM" is a complaint.
const SELLS = new RegExp(`(?:^|[.!?\\n]\\s?)(?:${SALES.source})`, "iu");
function pointsAtAd(raw: string, text: string): boolean {
  if (!raw.match(ARROWS)) return false;
  return TEASER.test(raw) || SALES.test(text) || raw.split("\n").some((line) => (line.match(ARROWS)?.length ?? 0) >= 2);
}
// "Get it here" calls to a link, bot or the buttons: "porn bots get here every day" is a complaint.
const GET_HERE = any("‹get (?:it )?here›");
const LINK = /https?:\/\/|(?:(?<![\p{L}\p{N}_.-])|(?<=www\.))(?:t|telegram)\.me\/|@[a-z][a-z0-9_]*bot(?![\p{L}\p{N}])/u;
// Reports and complaints about it: "someone posted porn spam here, admins?", "этот бот опять кидает порно", "porn bots again".
// An ad tells what its model does in the present ("She posts new nudes daily"), so he, she and they report only in the past
// or progressive ("he was posting porn").
// A member asks to stop it: "Stop sending me porn in DM", "Хватит слать нюдсы в лс", "Не шлите мне порно в личку", "Please
// don't DM me nudes". Only about the content or the DMs: "Не шли деньги на OnlyFans, бесплатные нюдсы в боте" sells.
const STOP_FILLER = "(?:me|us|мне|нам|сюда|больше|ещ[её]|свои|ваши|твои|эти|any|more|your|these|those|such|random) ";
const STOP_TERMS = "p[o0]rn|п[o0]рн|nud|нюд|nsfw|xxx|hentai|хентай|интим|эрот|erotic|onlyfans|онлифанс|sex|секс";
// Writing verbs need the content itself: "Хватит писать мне в лс, все нюдсы в боте @…" sells. "This", "это" or "такое"
// points at it before the term ("Stop sending me this porn", "Хватит слать всякое порно в лс"), but before the DMs only with
// no link or handle to sell: "Хватит кидать мне это в лс, порно никому не нужно" complains, "Хватит слать это в лс, нюдсы
// в боте @…" sells.
const STOP_POINTER = "(?:this|that|это|эту|этот|всяк\\p{L}*|так(?:ое|ие|ую|ой)) ";
const STOP_ADULT = `(?:${STOP_FILLER}|${STOP_POINTER})*(?:${STOP_TERMS})`;
const STOP_OBJECT = `(?:${STOP_ADULT}|(?:${STOP_FILLER}|${STOP_POINTER}(?![\\s\\S]*(?:@[a-z]|(?:t|telegram)\\.me/|https?://|www\\.|[a-z0-9-]\\.(?:com|net|org|ru|me|io|xyz|app|site|link|club|tv)›)))*`
  + "(?:(?:в|во|to|in|into) (?:my |мою |мой |мне )?(?:лс›|личк|личн|директ|dms?›|pms?›|inbox›)|dms?›|pms?›))";
// A handle named as a report: "Порно бот @xxx_bot в комментах", "В комментах порно бот @xxx_bot, пожалуйтесь", "Porn bot
// alert: @xxx_bot", also fused ("Порнобот @…", "порно-бот @…"). An ad's "Best porn bot @…bot 🥵", "Bot alert! @…" or "our bot
// @…bot in the comments" names its own. These pleas and reports give way to a teaser or sales cue, so "Stop sending me porn
// in DM. FREE PORN VIDEOS 🥵 @…" or "Porn bot alert 🥵 @…" stays an ad.
// Selling one's own: "Хватит кидать нюдсы бесплатно, зарабатывай на них в боте @…", "Stop sending nudes for free, get paid".
const UNSOLD = "(?![^.!?\\n]{0,120}(?:‹(?:бесплатн|даром|за спасибо›|за (?:просто )?так›|for free›|for nothing›|sell|earn|monetiz|paid|tip(?:s|ped)?›|pay(?:ments?|outs?|pal)?›|money|cash|income|profit|прода[вйёе]|зараб[ао]т|монетиз|ден[еь][гж]|оплат|оплач|плат(?:им|ят)|выплат|доход(?:[аоуы]|ам|ами|ах|ов|ом|н\\p{L}*)?›|бабк|бабл|профит)|[$₽€]))";
const REPORTED_BOT = "(?:p[o0]rn|п[o0]рн)\\p{L}*?[- ]?(?:бот\\p{L}*|bots?)";
// A report opens the message, and only plain words may lead or sit inside it, so any adjective ("Best/Great/Топ-порно бот
// @…"), number ("18+ порно бот") or earlier pitch ("Подписывайся @…, порно бот @… в комментах") keeps it an ad.
const REPORT_LEAD = "(?<=^[^\\p{L}\\p{N}@]*(?:(?:a|an|the|another|this|that|some|one|there['’]?s|there|is|but|also|again|careful|warning|attention|guys|hey|hi|everyone|fyi|psa|опять|снова|ещё|еще|очередной|какой-то|этот|тот|тут|там|вот|здесь|осторожно|внимание|ребят\\p{L}*|народ|люди|всем|привет|ну|и|а|но)[^\\p{L}\\p{N}@\\s,.!?:;…—–]*[\\s,.!?:;…—–][^\\p{L}\\p{N}@]*){0,3})";
const REPORT_FILLER = "(?:a|another|this|some|again|опять|снова|ещё|еще|очередной|какой-то|есть|сидит|висит|крутится|бегает|появился|завёлся|завелся)";
const ADULT_PLEA = any(
  "(?<!‹не\\s)‹(?:пожалуйтесь|жалуйтесь|пожаловаться|пожаловал\\p{L}*|жалоб\\p{L}*)›|‹(?:(?:p[o0]rn|spam|scam|fake) (?:bots?|accounts?)|spam|scam|spammers?) alert›",
  `(?<!‹non[-–—]?\\s?)(?:(?<!‹(?:never|won['’]?t|не)\\s)|(?=\\p{L}+ (?:[\\p{L}-]+ ){0,2}?(?:sending|spamming|dming|messaging|texting|слать|кидать|присылать|скидывать|отправлять|спамить|писать) (?:me|us|мне|нам)›))‹(?:stop|quit|хватит|перестань\\p{L}*|прекрати\\p{L}*|не (?:надо|нужно))${UNSOLD} (?:[\\p{L}-]+ ){0,2}?(?:(?:sending|spamming|слать|кидать|присылать|скидывать|отправлять|спамить) ${STOP_OBJECT}|(?:dming|messaging|texting|писать) ${STOP_ADULT})`,
  `‹(?:не (?:шлите|шли|присылайте|присылай|кидайте|кидай|скидывайте|скидывай|отправляйте|отправляй)|(?:don['’]?t|do not) send)${UNSOLD} ${STOP_OBJECT}|‹(?:don['’]?t|do not) (?:dm|message|text)${UNSOLD} ${STOP_ADULT}`,
  `‹(?=p[o0]rn|п[o0]рн)${REPORT_LEAD}${REPORTED_BOT} @[a-z0-9_]+ (?:в|in(?: the)?) (?:коммент\\p{L}*|comments›)|‹(?=в коммент)${REPORT_LEAD}в коммент\\p{L}* (?:${REPORT_FILLER} ){0,2}?${REPORTED_BOT} @[a-z0-9_]+`);
const ADULT_REPORT = any("‹(?:admins?|mods?|moderators?|админ\\p{L}*|модер\\p{L}*)›",
  "‹(?:someone|somebody|some (?:\\p{L}+ )?(?:guy|bot|account|user)|this (?:guy|bot|account|user|person)|he|she|they|кто-то|какой-то|этот|эта|он|она|они) (?:[\\p{L}-]+ ){0,2}?(?:posted|posting|sent|sending|shared|sharing|promoting|spamming|dropped|кинул\\p{L}*|скинул\\p{L}*|прислал\\p{L}*|выложил\\p{L}*)›",
  "‹(?:someone|somebody|some (?:\\p{L}+ )?(?:guy|bot|account|user)|this (?:guy|bot|account|user|person)|кто-то|какой-то|этот|эта) (?:[\\p{L}-]+ ){0,2}?(?:posts|sends|promotes|spams|постит|кидает|присылает|рассылает|спамит)›",
  "‹(?:p[o0]rn\\p{L}*|nsfw|spam|fake|these|those) (?:bots|accounts|spammers) (?:[\\p{L}\\d-]+ ){0,2}?join›|‹(?:опять|снова|again|keep getting|keeps? (?:posting|sending|trying|adding)|(?:don['’]?t (?:join|click|open|subscribe|tap)|не (?:открывай|переходи|жми|нажимай|кликай|подписывайся)\\p{L}*)›(?!,?\\s(?:(?:it|this) )?(?:if|unless|если|пока)›)|задолбал\\p{L}*|достал\\p{L}*|надоел\\p{L}*|бесят|annoying|tired of|sick of|everywhere|why do|why are|who else|anyone else|кто ещ[её]|у кого ещ[её])›");
// Rules and moderation: "Porn is banned here", "no porn allowed", "за порно бан", "запрещено публиковать порно". An ad's
// "запрещённое видео", "запрещёнка" or "forbidden content" sells it, and so does "no rules".
const ADULT_RULE = any(`‹(?:запрещ(?![её]нк)\\p{L}*|forbidden|prohibited|banned)›(?! (?:[\\p{L}-]+ )?${CONTENT})`,
  "‹(?:удал(?:ить|ите|и)|против правил|нарушени\\p{L}* правил|будут удал\\p{L}*|удаля(?:ем|ются)|бан|в бан|забан\\p{L}*|баним|(?:здесь|тут) нельзя|нельзя(?=\\s?(?:[,.!;—–-]|$)))›|‹нельзя (?:[\\p{L}-]+ )?(?:писать|постить|публиковать|кидать|скидывать|размещать|выкладывать|отправлять|рекламировать)›",
  "‹(?:not allowed|against (?:the )?rules|will be (?:deleted|removed|banned)|ban|kick)›|(?<!‹no )‹rules?›",
  // A bot that removes it: "Поставьте @ChatKeeperBot, он удаляет порно-ботов" (but "watch before Telegram deletes it" sells).
  "(?:бот|bot|@[a-z][a-z0-9_]*)[^.!?\\n]{0,40}?‹(?:удаляет|удаляют|чистит|банит|банят|кикает|блочит|фильтрует|kicks|bans|removes|deletes|filters|blocks)›");
// Health, recovery, education, settings, security, law, crime, morals and news talk about it: "porn addiction support group, join @…", "закон о блокировке
// порно", "arrested for distributing porn, details: https://…". Ads never use these words.
const ADULT_TALK = any("‹(?:addict\\p{L}*|recover\\p{L}*|nofap|quit(?:ting)?›|reboot\\p{L}*|therap\\p{L}*|research\\p{L}*|study|studies|education|parent\\p{L}*|protect\\p{L}*|block\\p{L}*|law›|laws›|bill›|ban on|news|article|report\\p{L}*|survey)",
  "‹(?:settings|sensitive content|malware|virus\\p{L}*|deepfake\\p{L}*|privacy|tax\\p{L}*|evil›|настройк\\p{L}*|вирус\\p{L}*|дипфейк\\p{L}*|налог\\p{L}*|зло›)",
  "‹(?:safety (?:guides?|tips?|advice|rules)|online safety|stay safe|never (?:send|share)|don['’]?t (?:send|share)|не (?:отправляй|скидывай|присылай|пересылай)|безопасност\\p{L}* в (?:сети|интернете)|правила безопасности|podcasts?|documentary|adaptation|экранизаци\\p{L}*|подкаст\\p{L}*|интервью|документальн\\p{L}*)›",
  "‹(?:arrest\\p{L}*|police|court|convicted|charged|victims?›|abuse\\p{L}*|crime\\p{L}*|condamn\\p{L}*|enqu[eê]te|victime\\p{L}*|abus›|abus[ée]\\p{L}*|poursuivi\\p{L}*)",
  "‹(?:(?:за)?блокир\\p{L}*|зависим\\p{L}*|бросить|бросил\\p{L}*|исследован\\p{L}*|образован\\p{L}*|просвещ\\p{L}*|родител\\p{L}*|защит\\p{L}*|закон\\p{L}*|новост\\p{L}*|стать(?:я|и|ю|е|ей|ях)›|психолог\\p{L}*|врач\\p{L}*|арест\\p{L}*|полиц\\p{L}*|суд›|суда›|суде›|задерж\\p{L}*|осужд\\p{L}*|преступ\\p{L}*|насили\\p{L}*|жертв\\p{L}*)");
// Antispam bots members recommend or blame: "Поставьте @combot, он удаляет порно", "porn bots get past @shieldy_bot".
const MODERATION_BOT = /@(?:combot|shieldy_bot|grouphelpbot|rose_bot|missrose_bot|spambot|banofbot|join_captcha_bot|captcha_bot)(?![\p{L}\p{N}_])/gu;
// A scandal is news ("Sex tape scandal in parliament, details 👉 …") unless it is a leak being sold ("СКАНДАЛ! Слив интим видео…").
const SCANDAL = any("‹(?:scandal\\p{L}*|скандал\\p{L}*)");
const LEAK = any("‹(?:leak\\p{L}*|слив\\p{L}*|слил\\p{L}*|слит\\p{L}*|утек\\p{L}*|утечк\\p{L}*)");
const LINKED = /(?:(?<![\p{L}\p{N}_.-])|(?<=www\.))(?:t|telegram)\.me\/|@[a-z][a-z0-9_]*bot(?![\p{L}\p{N}])/u;
// An invite or channel link, not a shared post ("t.me/+…", "t.me/joinchat/…", "t.me/name", but not "t.me/name/123"), or a bot.
const INVITE = /(?:(?<![\p{L}\p{N}_.-])|(?<=www\.))(?:t|telegram)\.me\/(?:\+|joinchat\/|[a-z0-9_]+(?![a-z0-9_]*\/\d))|@[a-z][a-z0-9_]*bot(?![\p{L}\p{N}])/u;
// A joke or meme shared in chat: "lmao the nudes meme 👇", "lol dm me for nudes 😂 jk". Ads tease (😏 🥵 💦), they don't laugh.
const ADULT_JOKE = any("‹(?:lol|lmao|rofl|jk|haha\\p{L}*|memes?|jokes?|ахах\\p{L}*|хаха\\p{L}*|мем\\p{L}*|шутк\\p{L}*|прикол\\p{L}*)›");
const LAUGHING = /[\u{1F602}\u{1F923}]/u;
function adultPromo(message: ModerationMessage, raw: string, text: string): boolean {
  const undenied = text.replace(ADULT_DENIED, " ");
  // An emoji separates a call like a comma does: "Слив нюдсов 🔞 переходи", "Live sex cams 💋 sign up free". It also ends a
  // predicate: "Bro this setup is porn 🔥 click the link". Only when a term is found there, since an emoji may split one.
  const commaText = promoText(raw.replace(/\p{Extended_Pictographic}/gu, ","));
  const commas = commaText.replace(ADULT_DENIED, " ");
  const term = ADULT.test(undenied);
  const slang = term && (!ADULT.test(undenied.replace(ADULT_SLANG, " "))
    || ADULT.test(commas) && !ADULT.test(commas.replace(ADULT_SLANG, " ")));
  const services = new Set([...undenied.matchAll(ADULT_SERVICE)].map((m) => m[0])).size >= 2;
  if (!term && !services) return false;
  const teased = TEASER.test(raw) || SALES.test(text);
  if (ADULT_REPORT.test(text) || ADULT_PLEA.test(text) && !teased || ADULT_RULE.test(text) || ADULT_TALK.test(text) || ADDRESS.test(text) || ADDRESSED.test(text)
    || ADULT_JOKE.test(text) || LAUGHING.test(raw) || SCANDAL.test(text) && !LEAK.test(text)) return false;
  const told = toldPart(text);
  if (slang && !services) return Boolean(message.inlineButtons?.length) || INVITE.test(told);
  const clauses = toldPart(commaText).replace(ADULT_DENIED, " ").replace(ADULT_SLANG, " ");
  // A join call before a handle is a channel, not a DM: "pure porn for developers, join @devchat".
  // A shared channel post is news, not a funnel, unless teased or sold: "OnlyFans now accepts crypto, details t.me/cryptonews/1234"
  // is news, "Горячие нюдсы 🥵 t.me/hot_nudes/12" an ad. A call or arrow alone doesn't sell it: news shares end with one as
  // often ("Порно-актриса стала депутатом t.me/rian_ru/123, переходите", "Pornhub leaves Texas 👉 t.me/news/12").
  const posted = teased ? told : told.replace(TME_POST, " ");
  return Boolean(message.inlineButtons?.length) || pointsAtAd(raw, told) || FUNNEL.test(posted)
    || GET_HERE.test(told) && LINK.test(teased ? text : text.replace(TME_POST, " "))
    || callsToContent(clauses) || callsToDm(posted.replace(WEB_LINK, " ").replace(JOIN, " "), { teased: TEASER.test(raw) || SELLS.test(text) || WRITE.test(posted) });
}
const TME_POST = /(?:(?<![\p{L}\p{N}_.-])|(?<=www\.))(?:t|telegram)\.me\/[a-z0-9_]+\/\d+/giu;
const JOIN = re("‹join›", "giu");

// --- Free-copy bait (#153): a first-person review of a book, audiobook or course + an offer to send a copy + an interest
// or DM cue. "Недавно послушал «Время деньги» Генри Форда… Есть хорошая аудиоверсия. Если кому интересно пишите в личку, отправлю."
// What is reviewed: a book, an audio or text version of one, or a course the author took ("курс" alone is also a rate).
// Bare "аудио" is a voice message, a podcast or a song as often: "Послушала голосовое, если кому надо, перешлю аудио".
// A course of treatment is no course the author took: "Прошла курс ЛФК, если кому надо — скину".
const COURSE_TAKEN = "‹(?:прош(?:ла|[её]л)|проходил\\p{L}*|закончил\\p{L}*|окончил\\p{L}*|прослушал\\p{L}*) (?:[\\p{L}-]+ )?курс(?! (?:лечени|антибиот|терапи|уколов|капельниц|массаж|лфк|реабилит|физио|витамин|при[её]ма|процедур))";
const WORK = any("‹(?:книг|книжк|аудиокни|аудиоверси|аудио[- ]?формат|автобиограф|литератур)\\p{L}*", "‹(?:озвучк\\p{L}*|в аудио)›",
  "‹(?:текстов|электронн|печатн|бумажн)\\p{L}* (?:верси|вариант|формат)|‹электронк\\p{L}*", COURSE_TAKEN,
  "‹(?:books?|audiobooks?|audio ?versions?|e-?books?|novels?|memoirs?|biograph\\p{L}*|pdf|epub|fb2|audible)›", "(?<!‹of )‹courses?›");
// To start the check the book itself is named: in Russian a format, a voice-over or an e-mail is a document or a film as
// often ("Прошла собеседование. Есть pdf со списком документов", "электронный вариант протокола", "понравилась озвучка",
// "скину на электронку"). English titles go unquoted ("I read Atomic Habits… I can send the PDF"), so there a format counts.
// A notebook or a work-record book is no book, "в электронке" is the school e-diary or a mailbox, and "в аудио" is a recording
// of anything ("Прослушала собрание, перешлю в аудио"), so it counts only where the author listened: "Послушал Форда в аудио".
// In English a format counts unless a document is read: "Just read the new visa rules… I have the PDF".
const BOOK = any("(?<!‹(?:спис\\p{L}*|записн|трудов|телефонн|сберегательн|медицинск|санитарн|ветеринарн|зачетн|зачётн)\\p{L}*\\s)‹(?:книг|книжк|аудиокни|аудиоверси|аудио[- ]?формат|автобиограф|литератур)\\p{L}*|(?<!‹(?:на|в|во|из)\\s)‹электронк\\p{L}*", COURSE_TAKEN,
  "‹(?:books?|audiobooks?|audio ?versions?|e-?books?|novels?|memoirs?|biograph\\p{L}*|audible)›", "(?<!‹of )‹courses?›");
const FILE_FORMAT = re("‹(?:pdf|epub|fb2)›");
const DOCUMENT = re("‹(?:\\p{L}{0,8}papers?|decks?|proposals?|filings?|regulation|act|posts?|threads?|outlook|theses|curriculum|terms|thesis|dissertation|stud(?:y|ies)|research|preprints?|magazines?|journals?|earnings|catalog(?:ue)?s?|portfolio|cv|resume|rules|bylaws|handbook|manual|guidelines|minutes|contract|agreement|lease|template|policy|forms?|syllabus|schedule|notes|slides|report|article|instructions|checklist|regulations|test|exam|prep|application|documents?|docs?|letter|newsletter|brochure|menu|presentation|patterns?|guides?|itinerar(?:y|ies)|workbooks?)›");
const IN_AUDIO = re("‹(?:по|про|до|пере)?слуша(?:л|ла|ли|ю)›[^.,;:!?\\n—–]{0,60}?‹в аудио›");
const RECORDING = re("‹(?:лекци|собрани|вебинар|подкаст|интервью|урок|совещани|планерк|встреч|эфир|стрим|концерт|семинар|конференц|выступлени|голосов|разговор|звонок|звонк|песн|трек|проповед|сказк|медитац|мастер-класс|тренинг|марафон|консультац|передач|аффирмац|практик|обращени|молитв|спектакл|доклад|занят|стих)");
// An English title is capitalised right after the reading verb ("I just read The Alchemist", "finished reading Man's Search
// for Meaning"), so a PDF of a paper, a thesis or a plan is no book: "I just read the paper on fasting", "Just finished my thesis".
// The title is a run of capitalised words (joined by "of", "the", "and"… or a possessive), and what follows it is no noun
// of its own: "Liked Atomic Habits a lot", "read Rich Dad Poor Dad and it changed my mindset", not a show, a talk, a piece or
// a date: "Listened to Bankless this week", "Liked Delphi's piece on restaking", "Listened to Huberman on dopamine".
const EN_TITLE = /(?<![\p{L}\p{N}])(?:[Rr]ead(?:ing)?|[Ff]inished(?: reading| listening to)?|[Ll]isten(?:ed|ing) to|[Ll]oved|[Ll]iked|[Ee]njoyed|[Dd]evoured|[Rr]ecommend)\s(?:the\s|a\s)?(\p{Lu}[^.,;:!?\n—–()]*)/gu;
const TITLE_JOIN = /^(?:of|the|a|an|and|to|in|for|s)$/u;
const AFTER_TITLE = /^(?:and|a|so|now|too|again|twice|last|it|is|was|really|very|highly|honestly|recently|finally|by|loved|liked|enjoyed)$/u;
function titled(raw: string): boolean {
  return [...glyphs(raw.replace(/\p{Cf}/gu, "")).matchAll(EN_TITLE)].some(([, title]) => {
    const words = [...title!.matchAll(/[\p{L}\p{N}]+/gu)].map(([word]) => word);
    const caps = (word = "") => /^[\p{Lu}\p{N}]/u.test(word);
    const next = words.find((word, i) => !caps(word) && !(TITLE_JOIN.test(word) && caps(words[i + 1])));
    return next === undefined || AFTER_TITLE.test(next);
  });
}
const namesBook = (told: string, raw = "") => BOOK.test(told) || IN_AUDIO.test(told) && !RECORDING.test(told)
  || !/\p{Script=Cyrillic}/u.test(told) && FILE_FORMAT.test(told) && !DOCUMENT.test(told) && titled(raw);
// The author read, heard or took it, or praises it: "послушал", "слушал аудиокнигу", "открыл для себя", "понравилась",
// "I just finished", "highly recommend".
const CONSUMED = any("‹(?:по|про|до|пере)?слуша(?:л|ла|ли|ю)›|‹(?:про|до|пере)?чита(?:л|ла|ли|ю)›|‹(?:прочл[аи]?|прочел|прош(?:ла|[её]л)|понравил(?:ась|ся|ось|ись)|зашл[аои]|советую|рекомендую)›",
  "‹(?:прослушивани|открыл[аи]? для себя|помогл[аои]? мне)|‹(?:закончил|окончил)\\p{L}* (?:[\\p{L}-]+ )?курс|‹закончил[аи]? (?:[\\p{L}-]+ )?(?:книг|аудиокни|читать|слушать)",
  "‹(?:i (?:just |recently |finally )?(?:read|listened|finished|loved|enjoyed|liked|discovered|recommend|took (?:[\\p{L}-]+ ){0,2}?courses?›)|(?:just|recently) (?:read|finished|listened|discovered)|(?<=(?:^|[.!?\\n]\\s?))listened to|listening to|highly recommend|changed my|loved|enjoyed|liked|devoured)›");
// A title right after the verb is the work too ("Прочитал «Путь наименьшего сопротивления»"), though quotes are removed.
// A quoted document or talk is no title: "Прочитала «Положение о летнем лагере»", "Прочитали «Устав ТСЖ»".
const TITLED = re(`(?:${CONSUMED.source})\\s?[«"“„](?!\\s?(?:положени|правил|устав|требовани|порядо?к|услови|чек-лист|спис|меню|расписани|техзадани|задани|сценари|программ|договор|регламент|инструкци|приказ|постановлени|закон|кодекс|памятк|объявлени|протокол|бесед|проповед|вебинар|лекци|семинар|подкаст|интервью|урок|рекомендаци|методичк|распоряжени|письм|газет|журнал|ведомост|коммерсант|известия|новост|сводк|обзор|выпуск|дайджест)\\p{L}*)`);
// A long review's title has a few words: "«Искусство наживать деньги»", not "«Ведомости»" or "«Коммерсантъ»".
const LONG_TITLE = re(`(?:${TITLED.source})[^«»"“”„\n]{1,200}?\\s[^«»"“”„\n]{1,200}?[»"“”]`);
// A first-person offer to send it: "могу скинуть", "готов поделиться", "отправлю", "перешлю", "I can send", "I'll share".
// "не могу скинуть" refuses.
const SEND = "(?:скинуть|кинуть|переслать|отправить|прислать|выслать|сбросить|поделиться)";
const COPY_OFFER = re(`(?<!‹(?:не|ни)\\s)‹(?:могу|можем|готов[аы]?|с радостью|охотно)(?: [\\p{L}-]+){0,2}? ${SEND}›`
  + "|(?<!‹(?:не|ни)\\s)‹(?:скину|кину|закину|перешлю|отправлю|пришлю|вышлю|сброшу|поделюсь|скидываю|кидаю|пересылаю|отправляю|высылаю)›|‹" + SEND + " (?:могу|можем)›|‹кому (?:скинуть|переслать|отправить|прислать)›|‹делюсь (?:с желающими|со всеми|бесплатно)›"
  // "DM me for the PDF", "Message me if you want a copy".
  + "|‹(?:dm|pm|message|text|write) me (?:for|if you want) (?:the |a |an )?(?:pdf|cop(?:y|ies)|files?|audiobook|e-?book|mp3|audio(?: version)?|text version)›"
  + "|‹(?:i can|i could|i['’]ll|i will) (?:dm|pm|message) you›|‹(?:i can|i could|i['’]ll|i will|i['’]d (?:be )?(?:happy|glad) to|i['’]d love to|happy to|glad to|ready to|(?<!‹(?:you|we|they|he|she|anyone|someone|who)\\s)can) (?:gladly |happily |also |totally )?(?:send|share|forward|email)›", "giu");
// What it sends must be the copy: nothing more in the clause ("могу скинуть.", "отправлю, пишите"), or the work, a format,
// a recipient, a DM or "free" within a few filler words ("скину аудиоверсию", "перешлю в лс", "I'll send it to anyone").
const FILLER = "(?:и|полн\\p{L}*|каждому|любому|всякому|тем|тому|её|его|их|вам|тебе|всем|все|всю|весь|эту|этот|это|вами|всеми|целиком|сразу|тоже|также|обе|оба|свою|свой|мою|мой|в|на|с|со|по|завтра|сегодня|вечером|позже|it|them|this|that|the|a|an|you|over|along|both|to|with|one|later|today|tonight)";
const COPY_WORD = "(?:книг|книжк|аудио|текст|файл|pdf|пдф|epub|fb2|mp3|запис|урок|материал|верси|вариант|формат|электрон|кому|желающ|лс|(?<=‹(?:в|на|in|on|via) )(?:телег\\p{L}*|почт\\p{L}*|тг›|вотсап|ватсап|whatsapp|telegram)|your way|л\\.с|личк|личн|директ|бесплатн|даром|если|audio|text|files?›|pdf|epub|mp3|cop(?:y|ies)›|e-?books?›|books?›|recordings?›|lessons?›|materials?›|versions?›|anyone|anybody|whoever|everyone|if›|dm›|pm›|inbox|free›)";
const A_COPY = re(`^(?:\\s?${FILLER}›){0,3}\\s?(?:$|[.!…)\\n—–-]|,(?!\\s?(?:(?:на|в|во|с|о|об|про|у|из|для|at|on|in|from) )?(?:кто(?! (?:напиш|пиш|хоч|захоч|интерес|заинтерес|нужн|надо))|who(?! (?:wants|is interested|needs))|где|куда|откуда|о ч[её]м|про что|что|как|(?:в )?как(?:ой|ая|ое|ие|ом|их|ую)|сколько|когда|where|what|how|when)›)|${COPY_WORD})`);
// Interest or a DM: "если кому интересно", "кому интересно", "если есть желание", "пишите в личку", "if anyone's interested".
const INTEREST = any("‹(?:если|кому|кто|кого)(?:[- ](?:то|нибудь|либо))?(?: [\\p{L}-]+){0,2}? (?:интересн\\p{L}*|надо|нужн\\p{L}*|хочет|хотите|захочет|интересует|заинтересова\\p{L}*)›",
  "‹если (?:есть|будет) (?:желание|интерес)›|‹кто (?:[\\p{L}-]+ )?напиш(?:ет|ут)›|‹желающ\\p{L}*|‹(?:пиши|пишите|напиши|напишите|обращайтесь)›",
  "‹if (?:anyone|anybody|someone|somebody|you|any of you|people)(?:['’]s|['’]re| is| are)? (?:[\\p{L}-]+ ){0,2}?(?:interested|wants?|needs?|like)›|‹(?:let me know|hit me up|just ask|anyone interested|whoever wants)›");
// The copy is public: a link, a library, a store or an app ("есть на ЛитРес", "в Яндекс Книгах", "on Audible", "Libby").
const PUBLIC_COPY = any("https?://|www\\.|‹(?:t|telegram)\\.me/|[a-z0-9-]\\.(?:com|net|org|ru|me|io|app)›",
  "‹(?:литрес|litres|storytel|сторител|bookmate|букмейт|яндекс книг|яндекс музык|audible|libby|kindle|google (?:books|play)|apple books|spotify|youtube|ютуб|флибуст|flibusta|libgen|z-library|(?<!‹(?:мо(?:ей|ю|я)|сво(?:ей|ю|я)|домашн\\p{L}*|my|our)\\s)(?:библиотек|library))\\p{L}*");
// The author asks for a book, or trades one: "скиньте кто-нибудь…", "у кого есть аудиоверсия?", "Can someone send me the PDF?".
const BOOK_REQUEST = any("‹(?:скиньте|киньте|пришлите|перешлите|подскажите|посоветуйте|ищу|ищем|у кого(?:-нибудь|-то)? (?:есть|найд[её]тся)|есть у кого|может у кого|кто (?:может|сможет) (?:скинуть|переслать|отправить|поделиться))›",
  "‹поделитесь (?:[\\p{L}-]+ )?(?:книг|аудио|ссылк|pdf|файл)", "‹(?:looking for|does anyone have|anyone have|anybody have|(?:can|could) (?:someone|anyone|anybody)|(?:please )?send me(?! (?:a |an )?(?:dm|pm|message|text|line)›))›",
  "‹(?:в обмен|взамен|обменя(?:ю|юсь|емся)|поменя(?:ю|юсь|емся)|меняю|меняюсь|in exchange|swap(?:ping)? for|trade (?:it |them )?for)›",
  // A paper book is given away or sold, not a copy sent: "Книга в хорошем состоянии, могу отправить", "Книжка бумажная".
  "‹(?:в (?:хорошем|отличном|идеальном|новом|нормальном) состоянии|бумажн(?:ая|ую|ой|ые|ых|ом)?›(?! (?:и|или) электрон)|отда(?:м|ю) (?:даром|бесплатно|в добрые)|самовывоз)");
// Reports, rules and reminders about it: "Опять боты пишут: послушал книгу, могу скинуть", "такие сообщения удаляем",
// "Offers like this get you banned". English "bot" is left out: "вот" folds to it. A lead-in pastes the ad, so a read or
// listen verb follows its colon ("Опять: послушал книгу…") and no read work comes before it: a review's own colon tells a
// thought ("Снова убедился: …", "Послушал книгу Форда и снова убедился: время дороже денег. Особенно понравилась мысль…"),
// while a reporter reads or enters the chat ("Зашла в чат, а тут опять:", "Читаю чат, снова:", "Прошёл день, и снова:").
// English titles go unquoted, so there any read verb reads the work: "Just finished Atomic Habits again: …".
const LEAD_IN = re(`(?:^|[.!?\\n]\\s?)[^.!?\\n:]{0,60}?‹(?:опять|снова|again|тот же|та же|тем же|таким текстом|этим текстом|вижу|модер\\p{L}*|админ\\p{L}*|mods?|admins?|аккаунт\\p{L}*|heads up|this one)›[^.!?\\n:]{0,40}:(?=[\\s\\S]{0,120}?(?:${CONSUMED.source}))`);
function pastesAd(text: string): boolean {
  const lead = LEAD_IN.exec(text);
  if (!lead) return false;
  const head = text.slice(0, lead.index + lead[0].length);
  return !CONSUMED.test(head) || !namesBook(head) && !TITLED.test(head) && /\p{Script=Cyrillic}/u.test(head);
}
const BOOK_REPORT = any("‹кто ещ[её] (?:[\\p{L}-]+ )?получ\\p{L}*", "‹(?:пишут|предлагают|рассылают|кидают|присылают|скинули|прислали|написали|бот\\p{L}*|такие сообщения|такое сообщение|этот текст|одно и то же|копипаст\\p{L}*|copy-?paste|same (?:text|message))›",
  "‹(?:кто-то|какой-то|какая-то|некий|someone|somebody|some (?:guy|girl|account|user)|this guy|that guy) (?:[\\p{L}-]+ )?(?:пишет|написал\\p{L}*|присылает|прислал\\p{L}*|скинул\\p{L}*|рассылает|предлагает|dm['’]?e?d|messaged|texted|sent|wrote|says|keeps|posts)›",
  "‹(?:написал|прислал|скинул|предложил|отправил)[аи]? (?:мне|нам)›|‹пришл[оаи] (?:мне |нам )?(?:в лс|в личк\\p{L}*|в директ)|‹(?:dm['’]?e?d|messaged|texted) me›|‹(?:аккуратн|бдительн|игнорир|достал\\p{L}*|надоел\\p{L}*|вирус|ignore›|psa›|malware|virus|phishing|fall for)",
  "(?:‹это|[—–-])\\s?реклам|‹(?:правила (?:чата|группы)|напоминаю|reminder|chat rules|(?:are|is) (?:an )?ads?›|get (?:deleted|removed|banned))",
  "‹(?:запрещ\\p{L}*|удаля(?:ем|ются|ю)|будут удал\\p{L}*|бан›|в бан|забан\\p{L}*|против правил|нарушени\\p{L}* правил|нельзя|not allowed|against (?:the )?rules|will be (?:deleted|removed|banned)|banned|get you (?:banned|removed))");
// An offer sends the work only when nothing else is named between them: the rest of its sentence names the copy or
// nothing ("скину аудиоверсию", "отправлю, пишите в лс"), and before it the last work named is followed only by its
// author or title (up to the next punctuation) and praise, interest or DM words. So "Сделала конспект, если кому надо,
// скину", "Рецепт пирога могу скинуть", "Могу скинуть, если кому интересно, название" and "расскажу, сколько скину"
// send something else.
const WORDS = /[\p{L}\p{N}]+/gu;
const COPY_NAME = re("^(?:книг|книжк|аудио|текст|электрон|файл|пдф|запис|урок|материал|верси|вариант|формат|озвучк|курс|биограф|автобиограф|литератур"
  + "|(?:books?|audiobooks?|ebooks?|cop(?:y|ies)|files?|recordings?|lessons?|materials?|versions?|formats?|courses?|audio|pdf|epub|mp3|fb2|novels?|memoirs?)$)");
const BOOK_NAME = re("^(?:книг|книжк|аудиокни|аудиоверси|озвучк|курс|биограф|автобиограф|литератур|(?:books?|audiobooks?|ebooks?|courses?|novels?|memoirs?)$)");
const READ_WORD = re("^(?:(?:по|про|до|пере)?слуша(?:л|ла|ли|ю)|(?:про|до|пере)?чита(?:л|ла|ли|ю)|прочл[аи]?|прочел|понравил\\p{L}*|зашл[аои]|советую|рекомендую|мотивир\\p{L}*|вдохновля\\p{L}*"
  + "|открыл\\p{L}*|закончил\\p{L}*|read|listened|listening|finished|loved|enjoyed|liked|discovered|recommend|devoured|changed|changing)$");
const BETWEEN_WORD = re(`^(?:${FILLER.slice(3, -1)}|если|кому|кто|кого|то|нибудь|либо|интересн\\p{L}*|надо|нужн\\p{L}*|хоч\\p{L}*|хотите|захочет|интересует`
  + "|заинтересова\\p{L}*|есть|будет|желани\\p{L}*|интерес|желающ\\p{L}*|пиш\\p{L}*|напиш\\p{L}*|обращайтесь|лс|л|личк\\p{L}*|личн\\p{L}*|сообщени\\p{L}*"
  + "|директ|телег\\p{L}*|почт(?:а|е|у|ы)?|тг|так|сохранил\\p{L}*|вотсап|ватсап|ещ[её]|могу|можем|готов\\p{L}*|радостью|удовольствием|охотно|бесплатно|даром|и|а|или|у|меня|я|мне|же|тоже|что"
  + "|виде|очень|прям|просто|реально|всем|всеми|вами|хорош\\p{L}*|отличн\\p{L}*|полезн\\p{L}*|помогл\\p{L}*|огонь|супер|класс|кстати|она|он|was"
  + "|i|ll|s|re|m|ve|d|have|got|is|are|if|anyone|anybody|someone|somebody|want|wants|need|needs|interested|let|me|know|and|just|dm|pm|message|text|write"
  + "|hit|up|so|also|happy|glad|can|could|would|will|be|really|highly|honestly|like|way|your|whoever|everyone|free|for|who|or|too|great|amazing|gladly"
  + "|happily|send|share|good|nice|there|in|private|messages|dms|available)$");
const COORD = re("‹(?:и|а|но|and|but)›");
const HAS_WORD = re("^(?:есть|have|has|got)$");
const INTEREST_CLAUSE = re("^\\s?(?:если|кому|кто|желающ|if|whoever|anyone|anybody)›");
const plainWords = (text: string) => [...text.matchAll(WORDS)].every(([word]) => BETWEEN_WORD.test(word) || READ_WORD.test(word) || COPY_NAME.test(word));
// The work's clause reads or has the work itself: after "есть" only plain words ("Есть хорошая аудиоверсия", not "Есть
// таблица из книги"), and a read thing is no podcast, article or review of the work ("Послушала подкаст про книгу").
const OF_IT = re("‹(?:про|о|об|на|по|из|от|к|с|со|для|about|of|from|for|with)(?:\\s(?:эт\\p{L}*|т(?:у|ой|ого|от)|н(?:её|ее|ей|его|ему)|the|a|an|this|that))?\\s?$");
function readsIt(head: string): boolean {
  const words = [...head.matchAll(WORDS)];
  const at = words.reduce((found, [word], i) => READ_WORD.test(word) || HAS_WORD.test(word) ? i : found, -1);
  if (at < 0) return false;
  const tail = head.slice(words[at]!.index + words[at]![0].length);
  return plainWords(tail) || !HAS_WORD.test(words[at]![0]) && !OF_IT.test(tail);
}
// A statement between praises the work, naming nothing after its verb: "Зашло на ура", "Некоторые главы послушал дважды",
// not "Очень понравился рецепт шарлотки".
const PRAISE_TAIL = re("^\\s?(?:в|во|на|с|со|для|за|по|от|до|из|у|при|без|in|on|at|from|for|during|my|our|every|не|несколько|дважды|трижды|залпом|взахл\\p{L}*|много\\p{L}*|глав\\p{L}*|мысл\\p{L}*|иде\\p{L}*|част\\p{L}*|момент\\p{L}*|подход\\p{L}*|автор\\p{L}*|подач\\p{L}*|изложени\\p{L}*|стил\\p{L}*|chapters?|ideas?|parts?)›");
function praisesIt(part: string): boolean {
  const words = [...part.matchAll(WORDS)];
  const at = words.reduce((found, [word], i) => READ_WORD.test(word) ? i : found, -1);
  if (at < 0) return false;
  const tail = part.slice(words[at]!.index + words[at]![0].length);
  return plainWords(tail) || PRAISE_TAIL.test(tail);
}
// A long review closing on an offer sentence of its own sends the work it opened with (#430): "Недавно дочитал «Искусство
// наживать деньги» Ротшильда. Это база для финансового мышления. … И самое интересное - ловишь себя на тех же ошибках. Могу
// переслать кому интересно, пишите в личные сообщения." Only plain words come before the offer in its sentence, the
// sentence that reads the work points back at it as an offer right after it would (an author may follow a read title), and
// no sentence between them does or names something else to send ("Испекла пирог", "Сделала конспект", "Сходила на семинар",
// "Нашла там таблицу режима"), has or is given anything but the book ("Есть хороший консультант"), names a format or lesson
// rather than the book ("Lessons are available for members"), calls for interest or offers again. The bound keeps many offers in a long text linear.
const OTHER_THING = any("‹(?:сделал|составил|записал|собрал|нашл|нашёл|нашел|сохранил|скачал|сфоткал|сфотографировал|перев[её]л|выписал|законспектировал"
  + "|набросал|подготовил|оформил|нарисовал|сн(?:ял|яла|яли)|купил|заказал|распечатал|отсканировал|переписал|испек|пекл|приготовил|сварил|сшил|связал|вязал"
  + "|посмотрел|смотрел|продаю|прода[мл]|отда[мюл]|прислал|скинул|получил|завел|завёл|провёл|провел|организовал|создал|написал|напечатал|запустил)\\p{L}*",
  "‹(?:веду|вела|ведём|ведем|проводим|провожу|организуем|организую|собираем|сходил[аи]?|ходил[аи]?|made|wrote|saved|put together|took|baked|cooked|watched|bought"
  + "|sold|got|keep|kept|went|attended)›",
  "‹(?:конспект|рецепт|спис(?:ок|к)|таблиц|табличк|эксел|эксель|excel|шпаргалк|памятк|гайд|пометк|фотк|семинар|мастер-класс|выступлени|консультаци|консультант|брокер|специалист|юрист|бухгалтер|риелтор|советник|психолог|коуч|наставник|ментор|репетитор|врач|доктор|задач|схем|шаблон|чек-?лист|заметк|фото|видео|ролик|ссылк|ссылочк|презентаци|скрин|карт(?:а|у|ы|ой|очк)|подборк"
  + "|выжимк|саммари|тезис|цитат|расписани|программ|упражнени|задани|контакт|номер|адрес|канал|чат|групп|сайт|приложени|промокод|скидк|купон|подкаст"
  + "|вебинар|лекци|фильм|сериал|мультфильм|отзыв|рецензи|интервью|сочинени|проект|раскраск|меню|трекер|документ|гугл|тетрад|дневник|календар|бланк|анкет"
  + "|разбор|клуб|кружок|кружк|марафон|эфир|трансляци)\\p{L}*",
  "‹(?:встреч(?:а|у|и|ей|ах)|форм(?:а|у|ы|ой)|расч[её]т(?:ы|а|ом)?|мастер(?:а|у|ом)?|тренер(?:а|у|ом)?|пример(?:ы|ом|ов)?|план(?:ы|а|у|ом)?|ответ(?:ы|ов)?|пост(?:ы|а|у|ом)?|стать(?:я|ю|и|ей))›",
  "‹(?:notes?|summar\\p{L}*|recipes?|lists?|tables?|links?|photos?|videos?|templates?|slides?|quotes?|plans?|channels?|groups?|apps?|codes?|discounts?"
  + "|answers?|podcasts?|webinars?|lectures?|movies?|films?|reviews?|articles?|posts?|spreadsheets?|worksheets?|guides?|cheat ?sheets?|seminars?|workshops?|talks?"
  + "|advisors?|advisers?|brokers?|coach|coaches|contacts?|forms?)›");
// Something had or given in between is another thing to send, unless it is the book: "Есть хороший финансовый консультант",
// "Подруга посоветовала брокера", "My advisor gave me…", but "Есть хорошая аудиоверсия".
const HAS_OTHER = re("‹(?:есть|у меня|у нас|дал[аи]?|посоветовал[аи]?|порекомендовал[аи]?|подарил[аи]?|have|has|had|gave|given)›");
const OFFERS = re(COPY_OFFER.source, "iu");
// What a review's middle tells: the work or what it did ("Это база…", "После неё…", "Книга про то…", "Автор разбирает…",
// "Дом теперь другой!"), what anyone starts to notice ("Начинаешь замечать…", "ловишь себя…", "You start noticing…"), what
// the author made of it ("Многое переосмыслил"), praise or the reading ("Очень понравилось", "Слушал в машине"), or a word or
// three ("Сильно.", "Очень отрезвляет."). Anything else ("Подруга подсказала психолога", "Открыла вклад в Тинькофф",
// "Пользуюсь приложухой для бюджета", "I found a great planner") tells of something else the offer may send.
const REFLECTS = any("‹(?:эт(?:о|а|от|у|ой|им|ого)|она|её|ее|неё|нее|ней|нею|он|его|него|нём|нем|теперь|после|по-другому|иначе)›",
  "‹(?:книг|книжк|автор|вывод|мысл|иде|глав|литератур)\\p{L}*", "‹[\\p{L}-]+(?:ешь|ёшь|ишь)(?:ся)?›",
  "‹(?:переосмысл|понял|осозна|задумал|узнал|заметил|пересмотрел|поменял|изменил|перевернул|цепля|зацепил)\\p{L}*",
  "‹(?:it|this|the book|the author|after it|differently|you (?:start|notice|realize|realise|see|begin|catch|understand)\\p{L}*)›");
const AUTHOR = re("^\\s?[\\p{L}-]+(?:\\s[\\p{L}-]+){0,2}\\s?$");
// When the review read it: "Недавно дочитал", "На днях прочитала", "Наконец дослушал".
const WHEN = re("‹(?:недавно|вчера|наконец|на днях|только что|сегодня|на выходных|за выходные|recently|finally|yesterday)›", "giu");
// A middle sentence where the author or someone else acts tells of what the offer sends: "Открыла вклад, теперь коплю",
// "После неё подруга подсказала финансиста", "Пользуюсь приложухой", "Я теперь в сообществе", "I use YNAB for it now". What
// anyone starts to notice ("Начинаешь замечать, как люди тратят"), reading, praise and insight ("Многое переосмыслил",
// "так не цепляла") still tell of the work, but not alongside an action ("Пользуюсь приложухой, сразу видишь все траты").
const PAST = re("^\\p{L}+[аеиоуыяё]л(?:а|и|о)?(?:сь|ся)?$");
const KEPT_PAST = re("^(?:был|стал[оа]?$|переосмысл|понял|осозна|задумал|узнал|заметил|пересмотрел|изменил|перевернул|цеплял|зацепил|удивил|впечатлил|вдохновил"
  + "|мотивировал|научил[аи]?$|помогл[аои]?$|понравил|зашл|прочитал|прочел|прочёл|читал|дочитал|перечитал|слушал|послушал|прослушал|дослушал|переслушал|закончил"
  + "|капитал|материал|идеал|сигнал|стол$|пол$|футбол|сил[аы]$|дел[аоу]$|тел[аоу]$|цел[иь]$|мал[оа]$|мил[оа]$|смел[оа]$|весел[оа]$|правил|школ|зл[оа]$|масл)");
const ACTOR = any("‹(?:мы|подруг\\p{L}*|друг|друга|другу|друзья|муж|мужа|мужу|жен[аеуы]|сын\\p{L}*|доч\\p{L}*|мам[аеуы]|пап[аеуы]|брат\\p{L}*|сестр\\p{L}*|коллег\\p{L}*"
  + "|знаком\\p{L}*|сосед\\p{L}*)›",
  "‹я›(?!\\s(?:(?:теперь|тоже|сразу|наконец|реально|правда|вдруг)\\s)?(?:понял|осознал|переосмыслил|задумал|узнал|заметил|увидел)\\p{L}*)",
  "‹(?:пользуюсь|использую|коплю|экономлю|инвестирую|вкладываю|откладываю|плачу|покупаю|хожу|занимаюсь|работаю|подписан\\p{L}*|сижу|живу|учусь)›",
  // "he" is left out: "не" folds to it.
  "‹(?:a |my |our |her |his )?(?:friend|husband|wife|partner|mom|mum|dad|brother|sister|colleague|coworker|advisor|adviser|neighbou?r)s?›",
  "‹(?:i|we|my|our|she|they)\\s(?:(?:also|now|just|then|even|really|finally|recently)\\s)?(?!(?:read|loved|liked|enjoyed|think|thought|realized|realised|learned"
  + "|understood|noticed|feel|felt|see|saw|was|am|can|could|would|will|highly|recommend)›)");
const NOT = re("^(?:не|ни|not|never|didn)$");
// An English past action: "set up an account", "joined a community"; reading, praise and insight are none.
const DONE = /^[a-z]{2,}ed$/u;
const KEPT_DONE = /^(?:loved|liked|enjoyed|finished|listened|realized|realised|learned|noticed|changed|inspired|motivated|surprised|impressed|amazed|helped|recommended|needed|wanted|interested|discovered|devoured|related|based|called|named|titled|written|aimed|focused|packed|filled|explained|described|covered|talked)$/u;
// "Открыл для себя" reads; "Открыла вклад" acts. English "he" only counts in an English sentence: "не" folds to it.
const OPENED = re("^открыл");
const FOR_ME = re("^для себя");
const HE = re("‹(?:he|his)\\s");
function acts(part: string): boolean {
  if (ACTOR.test(part) || HE.test(part) && !/\p{Script=Cyrillic}/u.test(part)) return true;
  const words = [...part.matchAll(WORDS)].map(([word]) => word);
  const read = (word: string, i: number) => READ_WORD.test(word) && (!OPENED.test(word) || FOR_ME.test(words.slice(i + 1, i + 3).join(" ")));
  return words.some((word, i) => (PAST.test(word) && !KEPT_PAST.test(word) && !read(word, i) || DONE.test(word) && !KEPT_DONE.test(word))
    && !NOT.test(words[i - 1] ?? ""));
}
function reviewsThenOffers(head: string, readsTitle: boolean): boolean {
  const parts = sentences(head);
  const own = /[.!?\n]\s*$/u.test(parts.at(-1) ?? "") ? "" : parts.pop()!;
  if (!plainWords(own)) return false;
  const at = parts.findIndex((part) => CONSUMED.test(part) && (namesBook(part) || readsTitle));
  return at >= 0 && pointsBack(parts.slice(0, at + 1).join(""), readsTitle)
    && parts.slice(at + 1).every((part) => {
      const words = [...part.matchAll(WORDS)].map(([word]) => word);
      return (REFLECTS.test(part) || CONSUMED.test(part) || words.length <= 3) && !acts(part) && !OTHER_THING.test(part) && !INTEREST.test(part) && !OFFERS.test(part)
        && words.every((word) => !COPY_NAME.test(word) || BOOK_NAME.test(word))
        && (!HAS_OTHER.test(part) || words.some((word) => BOOK_NAME.test(word)));
    });
}
function sendsTheWork(told: string, start: number, end: number, longTitle: boolean): boolean {
  // A copy named ends the check at the end of its clause: "скину аудиоверсию, пишите", not "скину файл с дневником".
  let named = false;
  // An offer ending its line sends what the next line names: "Если кому надо, могу скинуть\nрецепт хлеба".
  const after = told.slice(end);
  let offered = after.split(/[.!?\n]/u)[0]!;
  if (!/[\p{L}\p{N}]/u.test(offered) && after[offered.length] === "\n") offered += after.slice(offered.length).split(/[.!?\n]/u)[1];
  for (const [word] of offered.matchAll(/[\p{L}\p{N}]+|[,;:—–()]/gu)) {
    if (!/[\p{L}\p{N}]/u.test(word)) { if (named) return true; continue; }
    if (COPY_NAME.test(word)) named = true;
    else if (!BETWEEN_WORD.test(word) && !READ_WORD.test(word)) return false;
  }
  // The work is named close by; the bound keeps many offers in a long text linear.
  const window = (size: number) => start > size ? told.slice(start - size, start).replace(/^[\p{L}\p{N}]+/u, "") : told.slice(0, start);
  return named || pointsBack(window(400)) || reviewsThenOffers(window(1000), longTitle);
}
// What stands before an offer points back at the work.
function pointsBack(before: string, authored = false): boolean {
  const words = [...before.matchAll(WORDS)];
  const last = (test: RegExp) => words.filter(([word]) => test.test(word)).at(-1);
  const anchor = last(COPY_NAME) ?? last(READ_WORD);
  if (!anchor) return false;
  const BREAK = /[.,!?\n:;—–()]/u;
  const clause = (text: string) => text.split(BREAK).at(-1)!;
  // The offer's own clause names nothing else ("Рецепт пирога могу скинуть"), the work's clause reads, praises or has it
  // ("Прочитала книгу…", "Есть аудиоверсия", not "Список похожих книг составила"), and a statement between them may
  // praise ("Зашло на ура", "Life changing").
  const head = clause(before.slice(0, anchor.index));
  // The author or title runs to the next punctuation or "и"/"а"/"and": "Прочитала книгу и нашла там схему" names the scheme.
  const [rest, ...clauses] = before.slice(anchor.index + anchor[0].length).split(BREAK);
  const [named, ...coordinated] = rest!.split(COORD);
  clauses.unshift(...coordinated);
  // A read or praise verb standing for a quoted title names nothing after it: "Прочитала «…», понравилась таблица оттуда";
  // a long review may name the title's author ("Недавно дочитал «…» Ротшильда.").
  if (!COPY_NAME.test(anchor[0]) && !plainWords(rest!) && !PRAISE_TAIL.test(rest!)
    && !(authored && AUTHOR.test(named!) && !OTHER_THING.test(named!) && !OF_IT.test(named!))) return false;
  // A format, unlike the book, has no author or title after it: "Есть pdf с билетами ПДД" sends the tickets.
  if (COPY_NAME.test(anchor[0]) && !BOOK_NAME.test(anchor[0]) && !plainWords(named!)) return false;
  return plainWords(clause(before)) && (plainWords(authored ? head.replace(WHEN, " ") : head) || readsIt(head)) && clauses.every((part) => plainWords(part)
    || !INTEREST_CLAUSE.test(part) && praisesIt(part));
}

function bookCopyOffer(message: ModerationMessage, raw: string, text: string): boolean {
  if (ADDRESS.test(text) || ADDRESSED.test(text) || PUBLIC_COPY.test(text) || BOOK_REQUEST.test(text) || BOOK_REPORT.test(text) || pastesAd(promoText(raw))) return false;
  const told = sentences(text).filter((part) => !isQuestion(part)).join("");
  const readsTitle = TITLED.test(promoText(raw));
  const readsLongTitle = LONG_TITLE.test(promoText(raw));
  if (!namesBook(told, raw) && !readsTitle || !CONSUMED.test(told) || !INTEREST.test(told) && !callsToDm(told)) return false;
  if (![...told.matchAll(COPY_OFFER)].some((match) => A_COPY.test(told.slice(match.index + match[0].length, match.index + match[0].length + 60))
    && sendsTheWork(told, match.index, match.index + match[0].length, readsLongTitle))) return false;
  return !answersRequest(message, (source) => WORK.test(source));
}

// #465: the investment-testimonial funnel ("…sir Charles Johnson who turned my €500 to €38,600 within 48 hours … contact him
// … Click the link below and thank me later 👇 https://t.me/+…"), kept at 0.7956. It needs a first-person claim that a stake
// grew at least twofold, a contact or click call, and an invite, channel or contact link.
// An amount is a number with an optional scale and currency; at least one side of a claim carries a currency.
const NUMBER = "\\d{1,3}(?:[ .,]\\d{3}){1,3}(?:[.,]\\d{1,2})?(?!\\d)|\\d{1,9}(?:[.,]\\d{1,2})?(?!\\d)";
const SCALE = "(?:k|к|тыс\\p{L}*\\.?|тысяч\\p{L}*|thousand|grand|m|mln|млн|million)›";
const CURRENCY = "(?:\\p{Sc}|usdt?›|eur›|euros?›|dollars?›|bucks›|pounds?›|gbp›|naira›|руб\\p{L}*|р\\.|р›|долл\\p{L}*|бакс\\p{L}*|евро›|грн›|гривен\\p{L}*|гривн\\p{L}*|тенге›)";
const MONEY = re(`(?<![\\p{L}\\p{N}.,])(?:(\\p{Sc})\\s?(${NUMBER})(?:\\s?(${SCALE}))?|(${NUMBER})(?:\\s?(${SCALE}))?(?:\\s?(${CURRENCY}))?)`, "giu");
type Amount = { start: number; end: number; value: number; money: boolean; currency?: string };
// A conversion is no gain ("поменял 100 usdt в 9500₽"): the result names a currency, and the stake names the same one or none.
// Marks are folded text ("рублей" reads "pyблeй"), so the patterns are folded too.
const CURRENCIES: [RegExp, string][] = [[re("^(?:\\$|usdt?|dollar|buck|долл|бакс)"), "usd"], [re("^(?:€|eur|евро)"), "eur"], [re("^(?:₽|руб|р\\.?$)"), "rub"],
  [re("^(?:£|pound|gbp)"), "gbp"], [re("^(?:₴|грн|гривн|гривен)"), "uah"], [re("^₹"), "inr"], [re("^(?:₦|naira)"), "ngn"], [re("^(?:₸|тенге)"), "kzt"]];
const currencyOf = (mark: string) => CURRENCIES.find(([pattern]) => pattern.test(mark))?.[1] ?? mark;
// "38,600", "38.600", "38 600" and "1,250.50" group thousands; a separator before one or two final digits is a decimal point.
function amountValue(number: string): number {
  const digits = number.replace(/ /g, "");
  const fraction = /[.,](\d{1,2})$/u.exec(digits);
  return Number((fraction ? digits.slice(0, fraction.index) : digits).replace(/[.,]/gu, "")) + (fraction ? Number(`0.${fraction[1]}`) : 0);
}
function amounts(sentence: string): Amount[] {
  return [...sentence.matchAll(MONEY)].map((match) => {
    const scale = match[3] ?? match[5];
    // Text and patterns are folded, so "млн" reads "mлh" and "тыс" reads "tыc".
    const value = amountValue((match[2] ?? match[4])!) * (!scale ? 1 : scale.startsWith("m") ? 1e6 : 1e3);
    const mark = match[1] ?? match[6];
    return { start: match.index, end: match.index + match[0].length, value, money: Boolean(mark), currency: mark && currencyOf(mark) };
  });
}
// The claim's verbs, right before the first amount (within four words) or between the two.
const NEAR = "(?:\\s[\\p{L}'’]+){0,4}\\s?$";
const GROWN = re(`‹(?:turn(?:ed|s|ing)?|grew|grow(?:n|s|ing)?|flip(?:ped|s|ping)?|multipl\\p{L}*|increas\\p{L}*|boost\\p{L}*|превратил\\p{L}*|превращ\\p{L}*|увеличил\\p{L}*|приумножил\\p{L}*|поднял\\p{L}*|разогнал\\p{L}*)›${NEAR}`);
// A bare range tells no gain by itself: "Маникюр с 1500₽ до 3000₽", "My premium went from $800 to $1,900". It counts only for
// the author's own stake ("took my $500 to…"), an earning verb in its clause, the author or their account as its subject with a
// trading word or a titled guru in its clause ("I went from $500 to $12,000 trading with Mrs Anna"), or as the opener
// ("From $200 to $7,800 in 5 days!!!").
const RANGED = re(`‹(?:took|taken|went|gone|from|из|с|со)›${NEAR}`);
const EARNS = re("‹(?:earn(?:ed|ing|s)?|made|making|profit\\p{L}*|заработал\\p{L}*|заработа[лв]|зарабатыва\\p{L}*)›");
// The author or the author's account as the subject of the range: "I went from $500 to…", "Мой счёт вырос с 1000$ до…".
const RANGED_SUBJECT = re("‹(?:i|we|i['’]ve|we['’]ve|i have|we have|я|мы|(?:my|our|мой|наш)\\s(?:account|balance|deposit|portfolio|сч[её]т|депозит|баланс|портфель))\\s(?:went|gone|вырос)\\s(?:from|с|со)\\s?$");
// A titled guru in the range's clause ("…with sir David"); "благодаря новому тарифу" or "as a coach" credits no one.
const HONORIFIC = re("‹(?:sir|mr|mrs|ms|miss|madam|сэр|мистер|миссис)›");
const GROWN_GAP = re("^\\s?(?:[\\p{L}'’]+\\s){0,3}?(?:to|into|in to|до|в)\\s?$");
// "My $250 became $6,800", "мои 500$ превратились в 38 600$".
const OWNED = re("‹(?:my|our|мои|мой|моих|мою|моя|наши|свои|своих)(?:\\s[\\p{L}'’]+){0,2}\\s?$");
// The author's own money right before the amount: "took my $500 to…", "с моих 500$ до…" ("My premium went from…" is no stake).
const OWN_STAKE = re("‹(?:my|our|мои|моих|свои|своих|наши|наших)(?:\\s(?:only|just|initial|small|little|first|всего|лишь|только|первые|первых))?\\s?$");
const BECAME_GAP = re("^\\s?(?:[\\p{L}'’]+\\s){0,2}?(?:became|become|turned into|grew (?:to|into)|grown (?:to|into)|is now|are now|now|превратил\\p{L}* в|стал[аио]?|выросл?\\p{L}* до|увеличил\\p{L}* до)\\s?$");
const STAKED = re(`‹(?:invest(?:ed|ing)?|deposit(?:ed|ing)?|put in|put|started with|start with|staked|funded|вложил\\p{L}*|вложив|инвестировал\\p{L}*|внес\\p{L}*|внёс\\p{L}*|закинул\\p{L}*|пополнил\\p{L}*|начал\\p{L}* с|начинал\\p{L}* с)›${NEAR}`);
const PAID_GAP = re("^.{0,80}?‹(?:got|get|gotten|received|receive|earned|earn|made|make|withdrew|withdraw|withdrawn|cashed out|profit(?:ed)?(?: of)?|returns? of|paid (?:me )?out|have|has|получил\\p{L}*|получаю|заработал\\p{L}*|вывел\\p{L}*|вывожу|снял\\p{L}*|забрал\\p{L}*|пришл\\p{L}*|стало|имею|у меня)›(?:\\s[\\p{L}'’]+){0,3}?\\s?$");
const EARNED = re(`‹(?:earned|made|received|got|withdrew|cashed out|profit(?:ed)?(?: of)?|заработал\\p{L}*|получил\\p{L}*|вывел\\p{L}*|поднял\\p{L}*|сделал\\p{L}*)›${NEAR}`);
const FROM_GAP = re("^\\s?(?:[\\p{L}'’]+\\s){0,3}?(?:from|with|off|out of|on|by investing|after investing|investing|depositing|с|со|из|вложив|имея|при вложении(?: в)?)(?:\\s(?:only|just|a|an|my|мои|моих|всего|лишь|только|initial|small|little|tiny))*\\s?$");
const CLAIM_GUARD = re("‹(?:if|wish|hope|hoping|want(?:ed|s)? to|trying to|try to|promis\\p{L}*|claim\\p{L}*|says?|said|supposed\\p{L}*|allegedly|pretend\\p{L}*|если|бы|хоч\\p{L}*|хотел\\p{L}*|обеща\\p{L}*|якобы|говорил\\p{L}*|говорит|сказал\\p{L}*)›");
// "не" folds to "he", so the Russian negations count only in a sentence with Cyrillic: "he turned my $500…" is no "не".
const NEGATED_EN = re("‹(?:not|never|didn['’]?t|did not|can['’]?t|cannot|won['’]?t|don['’]?t|do not)\\s(?:[\\p{L}'’]+\\s)?$");
const NEGATED_RU = re("‹(?:not|never|не|ни|никогда)\\s(?:[\\p{L}'’]+\\s)?$");
const negated = (head: string, sentence: string) => (CYRILLIC.test(sentence) ? NEGATED_RU : NEGATED_EN).test(head);
const FIRST_EN = re("‹(?:i|i['’](?:m|ve|d)|im|me|my|mine|myself|we|we['’](?:ve|re)|our|us)›");
const FIRST_RU = re("‹(?:я|мне|меня|мной|мой|моя|мои|моих|моим|мою|моего|мы|нам|нас|наш\\p{L}*|сама?)›");
// "Вложила 500$, через 2 дня вывела 15 000$": a sentence opening with the author's own past verb.
const FIRST_RU_VERB = re("^\\s?(?:(?:недавно|вчера|сегодня|когда-то|однажды|просто|лично)\\s)*(?:вложил|инвестировал|внес|внёс|закинул|пополнил|начал|начинал|заработал|получил|вывел|поднял|превратил|увеличил|приумножил)\\p{L}*›");
const PRICE = "(?:rent|bills?|prices?|costs?|fees?|tax(?:es)?|salary|wages?|tuition|mortgage|fundrais\\p{L}*|donations?|аренд\\p{L}*|квартплат\\p{L}*|коммуналк\\p{L}*|цен[аыуе]›|стоимост\\p{L}*|зарплат\\p{L}*|налог\\p{L}*|тариф\\p{L}*|сбор›)";
const PRICED = re(`‹(?:${PRICE}|pay›|paying|плач\\p{L}*|плати\\p{L}*)`);
// A price named right after the result ("from $1,000 to $2,000 in rent", "с 30 000₽ до 60 000₽ аренду"), not "…with zero fees".
const PRICED_AFTER = re(`^\\s?(?:(?:a|per|в|за) (?:month|year|week|месяц|год|неделю)\\s)?(?:(?:in|on|for|за|на)\\s(?:[\\p{L}'’]+\\s)?)?‹${PRICE}`);
// "From $200 to $7,800 in 5 days!!! I'm so grateful…" opens with the claim.
const OPENS_FROM = re("^\\s?(?:from|с|со|из)\\s?$");
const CYRILLIC = /\p{Script=Cyrillic}/u;
const firstPerson = (sentence: string) => (CYRILLIC.test(sentence) ? FIRST_RU : FIRST_EN).test(sentence) || FIRST_RU_VERB.test(sentence);
// Sentences end at ! ? and line breaks, and at a period that is no decimal point ("€38.600") or abbreviation ("Mr. Smith").
const claimSentences = (text: string) => text.split(/(?<=[!?\n]|(?<!(?:^|[^\p{L}])(?:mr|mrs|ms|dr|sr|st))\.(?!\d))(?![.!?\n])/u);
// The claim is the author's: a first-person word in its own clause, or a sentence that opens with it and a first-person word in the
// next ("From $200 to $7,800 in 5 days!!! I'm so grateful…").
function claimsProfit(sentence: string, next = ""): boolean {
  if (isQuestion(sentence) || !firstPerson(sentence) && !firstPerson(next)) return false;
  const found = amounts(sentence);
  // The result is the next amount, or the next one with a currency: "Вложила 10 000 ₽, через 2 дня вывела 150 000 ₽".
  return found.some((a, i) => [found[i + 1], found.slice(i + 1).find((next) => next.money)].some((b) => {
    // The result is money ("got 5,000 kWh", "100 usdt в 9500" are no gain), in the stake's currency if it names one.
    // A hypothetical or someone's claim guards the claim's own clause, up to its result: "…$38,600 in 48 hours, if you want the
    // same contact him" still claims it.
    if (!b || !b.money || a.currency && a.currency !== b.currency || CLAIM_GUARD.test(sentence.slice(0, b.end))) return false;
    const before = sentence.slice(Math.max(0, a.start - 60), a.start);
    const gap = sentence.slice(a.end, b.start);
    // The claim's own clause: "Bitcoin went from $16k to $100k, I'm holding" or "I saw a post: sir X turned his $500…" is
    // no claim of the author's, and a price is no stake ("My rent went from $1,000 to $2,000").
    const lead = sentence.slice(Math.max(0, a.start - 120), a.start);
    const tail = sentence.slice(b.end, b.end + 120);
    const stake = () => lead.slice(Math.max(...[",", ":", ";"].map((mark) => lead.lastIndexOf(mark))) + 1) + gap;
    const clause = () => stake() + tail.split(/[,:;]/u)[0];
    const mine = () => firstPerson(clause()) || OPENS_FROM.test(sentence.slice(0, a.start));
    const cue = (lead: RegExp) => {
      const match = lead.exec(before);
      const head = match && sentence.slice(0, a.start - before.length + match.index);
      return head !== null && !negated(head, sentence);
    };
    const ranged = () => cue(RANGED) && (OWN_STAKE.test(before) || EARNS.test(clause()) || OPENS_FROM.test(sentence.slice(0, a.start))
      || RANGED_SUBJECT.test(before) && (TRADING.test(clause()) || HONORIFIC.test(clause())));
    const grew = b.value >= 2 * a.value && a.value > 0
      && ((cue(GROWN) || ranged()) && GROWN_GAP.test(gap) || OWNED.test(before) && BECAME_GAP.test(gap) || cue(STAKED) && PAID_GAP.test(gap));
    // A price on the stake's side is no stake; an ad's "…with zero fees" after the result is still an ad.
    return (grew || a.value >= 2 * b.value && b.value > 0 && cue(EARNED) && FROM_GAP.test(gap)) && mine() && !PRICED.test(stake()) && !PRICED_AFTER.test(tail);
  }));
}
const CONTACT_CALL = any(
  "‹(?:contact|reach out to|reach|message|text|write to|dm|pm|inbox|call|chat with|talk to|get in touch with|connect with|whatsapp) (?:him|her|them|sir|mr|mrs|ms|miss|madam|ma['’]?am|the (?:expert|admin|manager|mentor|coach|trader|broker|team|account manager))›",
  "‹thank me later›",
  // An endorsement aimed at the contact: "would recommend @Mentor_…", "all thanks to @…".
  "‹(?:recommend\\p{L}*|thanks to|grateful to)\\s(?:[\\p{L}'’.-]+\\s){0,3}?(?=@[a-z]|t\\.me/|wa\\.me/|telegram\\.me/)",
  "‹(?:свяжитесь|связывайтесь|свяжись|обращайтесь|обратитесь|обратись|пишите|напишите|пиши|напиши) (?:с ним|с ней|ему|ей|к нему|к ней)›",
  "‹(?:потом|позже) (?:скажете|скажешь) (?:мне )?спасибо|‹спасибо (?:мне )?(?:скажете|скажешь) (?:потом|позже)");
const CONTACT_CALL_ALL = new RegExp(CONTACT_CALL.source, "giu");
// A call to click, tap, follow or join only points, like an arrow: "Join my channel t.me/my_notes", "link in bio @my_notes" share the
// author's own channel; "Click the link below … t.me/+…" points at a private invite.
const POINTER_CALL = any(
  "‹click (?:on )?(?:the |this |my )?(?:link|below|here|button)", "‹(?:tap|follow|use|open|visit) (?:on )?(?:the|this|my) link›", "‹links? (?:below|here|in (?:my |the )?bio)›",
  "‹join (?:the|his|her|their|my|this|our) (?:channel|group|community|team)›", "‹join (?:now|today|here|us)›",
  "‹(?:переходите|переходи|перейдите|перейди|жмите|жми|нажмите|нажми|кликайте) (?:по |на )?(?:ссылк|кнопк)", "‹ссылк\\p{L}* (?:ниже|внизу|в профиле|в био)");
const ARROW = new RegExp(ARROWS.source, "u");
// A public link the author labels as their own right before it, at most three filler words between ("My channel 👇 @…", "My notes
// are here: t.me/…", "Мой канал тут 👇", "Join my channel t.me/…",
// "link in my bio @…", "Мой канал 👇") shares, even after thanking a public figure: "Thanks Mr Buffett 😄 My notes 👇 t.me/my_brk_notes".
// Only "my": "our group" is the chat the ad is posted in, and a label elsewhere in the text ("he commented on my page") labels no
// link, nor does "my page" inside the credit ("Sir Daniel turned my page around 👇"). A private invite stays a funnel whatever its
// label.
const OWN_LINK = re(`‹(?:my|мой|мои|моя)\\s(?:own\\s|personal\\s|личн\\p{L}*\\s)?(?:channel|notes|blog|journal|diary|newsletter|substack|page|bio|telegram|канал|блог|заметки|дневник|страниц\\p{L}*|телеграм\\p{L}*)›(?:[^\\p{L}\\p{N}@\\n]{1,6}(?:is|are|here|below|link|links|free|on|in|telegram|тут|здесь|ниже|вот|ссылка|бесплатно|в|телеграм\\p{L}*)›){0,3}[^\\p{L}\\p{N}@]{0,12}(?:https?://)?(?:${"(?:t\\.me|telegram\\.(?:me|dog))/"}|@[a-z])`);
// An arrow is a call only toward a private invite or a third party the message credits ("sir X… 👇", "thanks to Mr…"); "Good book on
// it 👇 t.me/…" or "My channel 👇 @…" shares content.
// The credited third party is a named person: a title before a name ("sir Daniel", "Mrs Kate", "Мистер Джон", "all thanks to miss
// zala horvat" as the prod copies write it) or a role word right before a capitalised name in the same sentence ("mentor Anna",
// "Expert Sarah", "EXPERT SARAH", "с ментором Анной", "Спасибо ментору Ольге"). A bare role or thanks word credits no one: "As a
// trader I turned…", "I'm a swing trader. Patience…", "I'm no expert", "via my broker in 2015", "Thanks to compound interest",
// "Спасибо, что читаете". Noun cases only ("с ментором Анной"), not adjectives such as "экспертный совет"; bare pronouns ("его",
// "she") are in most messages. Both are look-aheads, so "my mentor mr ben" still reaches "mr ben".
const TITLE_CREDIT = re("‹(sir|mr|mrs|ms|miss|madam|(?:сэр|мистер)(?:[аеуы]|ом)?|миссис)›(?=\\.? (\\p{L}+))", "giu");
const ROLE_CREDIT = re("‹(mentors?|experts?|coach|trader|account manager|(?:ментор|эксперт|трейдер)(?:[аеуы]|ом|ов|ам|ами|ах)?)(?= (\\p{L}+))", "giu");
// A capitalised word after a role names a tool or a product, not a person: "Expert Advisor", "Mr Market". A broker is a firm ("my
// broker Revolut"), so it credits no one without a title.
const NOT_NAME = re("^(?:advisors?|advice|level|mode|tips?|signals?|team|group|channel|course|program|bot|trading|trader|investor|account|market)$");
// A function word is no name, even capitalised elsewhere: "I miss my old portfolio… My notes 👇", "yes sir I turned…".
const FUNCTION_WORD = re("^(?:i|me|my|you|your|he|him|his|she|her|it|its|we|us|our|they|them|their|the|a|an|this|that|these|those|and|or|but|so|if|to|of|in|on|at|for|with|from|by|out|up|is|was|are|were|be|been|do|did|have|has|had|not|no|yes|what|how|who|why|when|then|just|all|any|some|i['’]m|я|мне|меня|мой|мои|ты|вы|он|она|они|мы|и|а|но|не|да|нет|что|как|это|в|на|с|за|по)$");
const NO_CREDIT_EN = re("‹(?:no|not|never|without|any)\\s(?:[\\p{L}'’]+\\s)?$");
const NO_CREDIT_RU = re("‹(?:no|not|never|without|без|ни|не|никаких|никакого|никакой)\\s(?:[\\p{L}'’]+\\s)?$");
// "miss" is a verb unless it follows words that take a person ("all thanks to miss zala", "with miss…") or is written "Miss" mid-sentence
// or before a capitalised name: "I miss Bitcoin at $3k", "…and miss nothing" and "Miss buying BTC…" credit no one. "sir" and "madam"
// after "yes", "no" or "ok" address the reader ("Yes, sir…"); "Thank you sir Daniel" credits him.
const MISS_LEAD = re("‹(?:(?:thanks|thank|grateful) to|with|by|from|via|met|meet|contact|thank|thanks)\\s$");
const MISS = re("^miss$");
const VOCATIVE = re("^(?:sir|madam)$");
// A capital "Miss" opening a sentence is the verb ("Miss buying BTC at $3k"), unless a capitalised name follows ("Miss Vera turned…").
const capitalMiss = (raw: string) => new Set([...raw.matchAll(/(?<![\p{L}\p{N}])(?:Miss|MISS)[ \t\u00a0\u202f]+(\p{L}+)/gu)]
  .filter(({ index, 1: name }) => /^\p{Lu}/u.test(name!) || !/(?:^|[.!?\n])\s*$/u.test(raw.slice(0, index)))
  .map(([, name]) => promoText(name!)));
const VOCATIVE_LEAD = re("‹(?:yes|yeah|no|ok|okay|da|да|нет)[,!]?\\s$");
// Adjacent word pairs of the raw text, folded, whose second word is capitalised ("mentor Anna") or both are in capitals ("EXPERT
// SARAH"): case is gone from the folded text the patterns read. A look-ahead keeps every overlapping pair.
function namedPairs(raw: string): Set<string> {
  const pairs = new Set<string>();
  for (const [, first, second] of raw.matchAll(/(?<![\p{L}\p{N}_@/])(?=(\p{L}+)[ \t\u00a0\u202f]+(\p{Lu}\p{Ll}+|\p{Lu}{2,})(?![\p{L}\p{N}]))/gu)) {
    if (/^\p{Lu}+$/u.test(second!) && first !== first!.toUpperCase()) continue;
    pairs.add(`${promoText(first!)} ${promoText(second!)}`);
  }
  return pairs;
}
function thirdParty(text: string, raw: string): boolean {
  const pairs = namedPairs(raw);
  const lead = CYRILLIC.test(text) ? NO_CREDIT_RU : NO_CREDIT_EN;
  const credited = (match: RegExpMatchArray, ok: (before: string) => boolean) => {
    const before = text.slice(Math.max(0, match.index! - 40), match.index);
    return !NOT_NAME.test(match[2]!) && !FUNCTION_WORD.test(match[2]!) && !lead.test(before) && ok(before);
  };
  return [...text.matchAll(TITLE_CREDIT)].some((match) => credited(match, (before) => {
    if (MISS.test(match[1]!)) return MISS_LEAD.test(before) || capitalMiss(raw).has(match[2]!);
    return !VOCATIVE.test(match[1]!) || !VOCATIVE_LEAD.test(before);
  })) || [...text.matchAll(ROLE_CREDIT)].some((match) => credited(match, () => pairs.has(`${match[1]!.split(" ").at(-1)} ${match[2]}`)));
}
// A private invite or a direct contact is a funnel nobody uses to share a post or their own public channel.
const PRIVATE_INVITE = re("(?:t\\.me|telegram\\.(?:me|dog))/(?:\\+|joinchat/)|wa\\.me/|chat\\.whatsapp\\.com/");
// A channel post's permalink ("t.me/finance_books/12", "t.me/c/123/45") shares a post like a web link: no funnel.
const TG_CHAT = "(?:t\\.me|telegram\\.(?:me|dog))/(?![a-z0-9_]+/\\d)";
// An invite, channel or contact link: t.me or WhatsApp, a handle (not an e-mail), a phone number, or URL buttons.
const CONTACT_LINK = re(`${TG_CHAT}|(?:wa\\.me|chat\\.whatsapp\\.com)/|(?<![\\p{L}\\p{N}._])@[a-z][a-z0-9_]{3,}›|(?<![\\p{L}\\p{N}])\\+\\d(?:[ -]?\\d){9,13}(?![\\p{L}\\p{N}])`);
// A contact on the message's last line, alone or after a label: "…all thanks to miss X.\n@message_Admin_…".
const CLOSING_LINK = re(`(?:^|\\n)\\s?(?:(?:contact|whatsapp|telegram|tg|контакт\\p{L}*|телеграм|тг|ватсап)\\s?:?\\s?)?(?:https?://)?(?:(?:${TG_CHAT}|wa\\.me/|chat\\.whatsapp\\.com/)\\S+|@[a-z][a-z0-9_]{3,}|\\+\\d(?:[ -]?\\d){9,13})\\s?$`);
// A contact verb or label right before the link or handle calls on its own: "Contact @…", "Пишите в телеграм @…", "Связь: @…",
// "Join t.me/…", "My contact: @…"; "here" or "Details:" before it only points, and so does the author's own Telegram or WhatsApp
// ("My Telegram 👇 @…").
const NAMED_CALL = re(`‹(?:contact|write(?: to)?|message|text|(?<!‹(?:my|мой|мои)\\s)(?:whatsapp|telegram)|join|пиши(?:те)?|напиши(?:те)?|связь|контакт\\p{L}*|обращайтесь|жми(?:те)?|переходи(?:те)?|(?:свяжитесь|свяжись|связывайтесь|обратитесь|обращайтесь) (?:с|со|к) \\p{L}+(?: \\p{L}+)?)(?:\\s(?:в|on|in|via)\\s(?:telegram|whatsapp|телеграм\\p{L}*|тг|ватсап\\p{L}*))?\\s?:?\\s?(?:https?://)?(?:@[a-z]|${TG_CHAT}|wa\\.me/)`);
const LINKED_URL = re(`${TG_CHAT}|(?:wa\\.me|whatsapp\\.com)/`);
// Gain and trading words inside a handle or link ("@trade_mike", "t.me/invest_ru") tell nothing.
const HANDLES = /@[\p{L}\p{N}_]+|(?<![\p{L}\p{N}.\/-])(?:https?:\/\/)?(?:[\p{L}\p{N}-]+\.)+[a-z]{2,}\/\S*/giu;
// A victim's story or a warning: "…promised to turn my $500 into $38,000, I lost everything", "это обман".
// Talk about such posts, or a joke about them: "lol who falls for these posts", "такие сообщения уже достали".
const ABOUT_ADS = any("‹(?:falls? for|who believes|ads? like|posts? like|messages? like|such (?:posts|ads|messages)|these (?:ads|posts|messages)|this (?:ad|post)›|lol›|lmao|a?(?:ha|ха){2,}h?›|лол›|такие (?:посты|сообщения|объявления)|подобн\\p{L}* (?:посты|сообщения|объявления)|эти (?:посты|сообщения|объявления))");
const VICTIM = any("‹(?:fraud\\p{L}*|ponzi|pyramid|warning|warn(?:ed|s)?›|avoid|lost (?:my|all|everything|it|money|\\p{Sc}|\\d)|stole|stolen|stealing|thie(?:f|ves)|police|обман\\p{L}*|лохотрон\\p{L}*|пирамид\\p{L}*|потерял\\p{L}*|украл\\p{L}*|полици\\p{L}*)");
// Gains, not prices: "My rent went from $1,000 to $2,000, contact the landlord @…" tells no profit.
const GAIN = any("‹(?:earn\\p{L}*|profit\\p{L}*|multipl\\p{L}*|приумнож\\p{L}*|торговл\\p{L}*|income|returns?›|withdr\\p{L}*|pay(?:s|out)›|paid out|my account|massive\\p{L}*|заработ\\p{L}*|доход\\p{L}*|прибыл\\p{L}*|вывел\\p{L}*|вывела|вывод\\p{L}*)",
  // Money paid out to a card, not "оплата/перевод на карту" in a classified ad.
  "‹(?:пришл\\p{L}*|пришел|зачисл\\p{L}*|упал\\p{L}*|капнул\\p{L}*)(?:\\s[\\p{L}\\p{N}\\p{Sc}.,]+){0,4}?\\sна (?:сч[её]т|карт\\p{L}*)");
const TRADING = any("‹(?:trad(?:e|er|ers|ing)›|invest\\p{L}*|влож\\p{L}*|crypto\\p{L}*|bitcoin|btc›|forex|signals?›|broker\\p{L}*|mentor\\p{L}*|account manager|portfolio|profit\\p{L}*|трейд\\p{L}*|инвест\\p{L}*|крипт\\p{L}*|биткоин\\p{L}*|форекс|сигнал\\p{L}*|брокер\\p{L}*|ментор\\p{L}*|прибыл\\p{L}*|доход\\p{L}*|заработ\\p{L}*)");
function profitTestimonial(message: ModerationMessage, raw: string, text: string): boolean {
  if (ADDRESS.test(text) || ADDRESSED.test(text) || VICTIM.test(text.replace(DENIAL, " ")) || ABOUT_ADS.test(text) || /😂|🤣|😹/u.test(raw)) return false;
  const told = claimSentences(text).filter((part) => !isQuestion(part));
  const words = text.replace(HANDLES, " ");
  if (!GAIN.test(words) && !TRADING.test(words) || !told.some((part, i) => claimsProfit(part, told[i + 1]))) return false;
  const linked = CONTACT_LINK.test(text) || (message.inlineButtons?.length ?? 0) > 0 || message.embeddedLinks.some((url) => LINKED_URL.test(url));
  if (!linked) return false;
  // A link or handle pointed at ("Details: t.me/…", "here @…", a closing @handle, 👇, "Join my channel", "Click the link") is a call
  // only toward a private invite or a third party the message credits: "Wrote about it here t.me/my_notes" or tagging a friend shares
  // or addresses, and so does a public link labelled as the author's own.
  // "DM me" and "пиши в лс" call on their own, so they are also read with links and handles stripped.
  const pointed = callsToDm(told.join("")) || CLOSING_LINK.test(text) || ARROW.test(raw) || POINTER_CALL.test(told.join(""));
  const funnel = PRIVATE_INVITE.test(text) || !OWN_LINK.test(text) && thirdParty(words, raw);
  const calls = told.some((part) => [...part.matchAll(CONTACT_CALL_ALL)].some((match) => !negated(part.slice(0, match.index), part)))
    || callsToDm(told.join("").replace(HANDLES, " ")) || NAMED_CALL.test(told.join("")) || pointed && funnel;
  return calls && !answersRequest(message, (source) => TRADING.test(source) || GAIN.test(source));
}

// What the message tells, without its questions. A funnel inside a question asks about it: "My friend wants to join
// OnlyFans, is it worth it?". Punctuation inside a link or domain ("t.me/x_bot?start=1", "onlyfans.com?") ends no sentence.
function toldPart(text: string): string {
  const parts = text.split(/(?<=[.!?])(?![.!?\n\p{L}\p{N}_/])|(?<=\n)(?![.!?\n])/u);
  // An unpunctuated line running into a question is part of it ("My gf wants to join OnlyFans\nis it worth it?"), unless it
  // carries the link or bot itself.
  const asked = (part: string, i: number) => isQuestion(part)
    || /[^.!?]\n$/u.test(part) && !LINKED.test(part) && isQuestion(parts[i + 1] ?? "");
  return parts.filter((part, i) => !asked(part, i)).join("").replace(MODERATION_BOT, " ");
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
  if (cryptoTradeAsk(message, text)) return "crypto_trade_ask";
  if (adultPromo(message, raw.replace(QUOTED, " "), text)) return "adult_content_promo";
  if (bookCopyOffer(message, raw, text)) return "book_copy_offer";
  if (profitTestimonial(message, raw.replace(QUOTED, " "), text)) return "profit_testimonial";
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
