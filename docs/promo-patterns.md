# Ad-shape rules (#126)

On 2026-10-15 Laya kept two ads. The first was a Russian side-gig recruitment comment under a channel post ("срочно нужны люди, … подработка …, зарплата от 5 тысяч в день, … писать в лс"), which scored 0.797, just under the 0.80 gate. The second was a forwarded first-person testimonial plugging a bot ("Я проходила тест в @…bot и узнала …"), which scored 0.437. Eighteen prompt and example variants could not lift either one without shifting held-out traffic (see #126), so Nikita chose bot-side rules, generalized to the shape of each ad rather than its wording (Telegram message 23502). The gate and the model are unchanged.

## Rules

Both rules run in `src/promo-patterns.ts` on the current text or caption after a completed classification (or a cache verdict). They never run on uncaptioned media, skipped updates, administrators, the linked channel or failed classifications.

- **Normalization.** Text is decomposed with NFKD and lowercased. Format characters and accents are dropped, but й keeps its breve. Cyrillic and Greek lookalike letters fold to Latin in both the text and the patterns, emoji become spaces, and a letter o typed inside a number reads as 0 ("5ООО"). Horizontal whitespace collapses, but a line break stays and ends a sentence, since multi-line ads rarely punctuate.
- **`side_gig_offer`** needs all three parts of the ad:
  - a work or earnings offer ("подработка", "нужны люди", "набираем", "требуются", "доход", "side job", "hiring", "earn", …);
  - a pay rate per period, meaning an amount with a currency, a multiplier or at least three digits, tied to a day, shift, hour, week, month or weekend ("от 5 тысяч в день", "4к в день", "2500р в час", "3000-4500 за смену", "$250/day", "в день от 5000"). Bare counts such as "за 1 день" and "2 раза в день" never count;
  - a move-to-private call ("в лс", "в личку", "в личные сообщения", "пиши мне", "DM", "message me"). An @handle or link counts only when something introduces it as a contact ("пиши - @…", "подробнее 👉 http…", "контакты @…"), so addressing someone or sharing an article doesn't count.

  A first-person job seeker ("ищу подработку", "looking for a part-time job") never matches. Neither does an author talking about their own job ("работаю курьером, получаю 4000 в день", "I work part time and earn $20 per hour") unless the message also recruits ("нужны люди в команду", "with this side job"), a pay statement asked as a question ("…платят 5000 в день, а у тебя?"), or a message that calls the offer a con ("обман", "лохотрон", "развод", "fraud"). The con words apply to job offers only, because "развод" is also a divorce in a personal story, and one negated directly ("никакого обмана", "обмана нет", "обман исключён", "без вложений, предоплат и обмана") is an ad's denial, not a warning. A "не" that belongs to the warning's own advice ("не верьте, это обман") doesn't negate it. A call to action such as "Интересно?" after the offer still matches.
- **`bot_testimonial`** needs a first-person experience verb ("прошла", "проходила", "попробовала", "сделала", "воспользовалась", "took", "tried", "passed", "used", …) followed within one clause by an `@…bot` handle or a `t.me/…bot` link. The sentence must describe a self-assessment, which is what these bots sell. That means a psychology or fortune-telling term (психолог, тревожность, выгорание, гадание, таро, гороскоп, therapy, anxiety, personality, …; everyday words such as "стресс", "эмоции", "терапевт" or "удостоверение личности" don't count), a test or quiz the author took, in the past and in person ("прошла тест", "попробовала тест", "tried the quiz"), or a test about themselves ("тест … о себе", "a quiz about myself"). Making a poll, form or quiz with a bot is a tool tip, so "сделал опрос в @PollBot, помог", "сделала тест для учеников в @QuizBot", "did a survey for my class with @SurveyBot" and "so my students could take a quiz" never match, and neither does "to test my code". An outcome must then follow the handle in the same or the next sentence ("узнала", "поняла", "помог", "изменил", "советую", "realized", "helped", "recommend", …). Negated outcomes ("не помогло") and outcomes asked as a question on the next line ("…в @…bot\nПомогло?") don't count, unless the message answers its own question ("Помогло? Да, очень!"). A clause with another subject or a question ("кто-нибудь проходил…?", "ты пробовала…") doesn't count either.
- **Never a match**:
  - a reply to, or a quote of, another member's **request on the same topic**: a question or a request phrase ("ищу", "подскажите", "есть у кого", "нужен", "looking for", "recommend", …) that is about work for `side_gig_offer`, or about bots or tests for `bot_testimonial`. Requested job answers and bot recommendations arrive this way. A reply to an unrelated message, a channel post, one's own message, a forum-topic root or an external source with no text grants nothing;
  - text that answers a request or continues a discussion ("ты просил…", "в ответ на…", "продолжая…");
  - reports and warnings ("осторожно", "развод", "мошенники", "спам", "не ведитесь", "scam", "beware", …). A denial inside an ad ("не развод!", "без обмана и спама") is not a report, and "Внимание!" or "warning" alone isn't either, since ads open with them;
  - text inside quotation marks (it is removed before matching);
  - a repost attributed to a named author ("Имя Фамилия: …"), which is the shape of a moderator quoting the ad.
- **Decision.** A match deletes the message when the model score is at least **0.30** (`PATTERN_MIN_SCORE`). Below that the model is confident the post is benign and the rule only logs. A match deletes through the normal audit-reported, stats-counted path with `rule: "side_gig_offer"` or `"bot_testimonial"`. Like a model delete, it also removes the account's earlier unhandled copies of the same content from the #124 repeat-send window, in every group.

## Data

The rules were replayed on the production capture (`training_samples`): 72,511 classified texts over 8.9 days (2026-10-06 to 2026-10-15), each using the latest captured request per message.

| rule | matches | already deleted by the model (≥ 0.80) | new deletions (0.30–0.80) | under the floor | false positives in the new deletions |
|---|---:|---:|---:|---:|---:|
| `side_gig_offer` | 73 | 63 | 10 | 0 | 0 |
| `bot_testimonial` | 1 | 0 | 1 | 0 | 0 |

- **New `side_gig_offer` deletions (10).** These are the incident (0.797) and eight copies of the same "набираем людей на временную подработку … от 5 тысяч в день … писать в лс" campaign in two other chats (0.50–0.79), two of which the repeat rule had already deleted. The tenth is an English "Earn between $1,350 and $2,600 daily from home … Send me a direct message" ad at 0.333, which set the floor at 0.30 rather than 0.35. The moderator's attributed repost of the campaign text stayed kept.
- **The 63 model-deleted matches** are all job-scam ads (remote "work", warehouse recruitment, "под работка 8-12к в день, пиши в личные", lookalike-letter variants). That is the rule's precision on traffic the model already agrees with.
- **New `bot_testimonial` deletions (1).** The only match is the incident itself. The shape is rare, so this rule rests on the synthetic held-out set more than on traffic.

## Tests

`src/promo-patterns.test.ts` checks the following:
- Both incidents match standalone, as channel-post comments and when forwarded.
- Held-out RU/EN paraphrases match, including lookalike letters, emoji and o-for-zero. Their wording is not in the rule text.
- Every control stays unmatched: job seekers, wage discussion and wage questions, @mention-addressed and article-sharing wage talk, warnings and quoted reports, the attributed repost, requested answers, bot questions, neutral bot tool tips, a negated outcome, the requested/discussion testimonial controls, the vague-recruitment controls and the #124 USDT controls.
- Ads that deny being scams ("не развод"), open with "ВНИМАНИЕ!" or end with "Интересно?" still match, and so do replies to unrelated or off-topic member questions.
- Matching stays under 50 ms on 4,096-character adversarial input (digit runs, repeated amounts, unclosed quotes), because every repetition is bounded.

`src/bot.test.ts` routes the incidents through the real handler. It covers deletion, logging, the audit and stats; silence under the floor, for administrators, for requested replies and for failed classifications; and the interaction with earlier repeat copies.

Logs add `promo_pattern_detected` (chat and message IDs, pattern, model score, decision). As elsewhere, nothing logs text or sender identity.
