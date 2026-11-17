// #716: the German investment testimonial Jev kept, with no amount: skeptical at first, steady growth, a smooth first withdrawal,
// then "reach her via the link below" and a public investing-named Telegram handle. Reconstructed in German from the forwarded
// report's paraphrase (the original text is not in any capture); the handle is replaced. Everything else is SYNTHETIC.
export const payoutTestimonialIncident = "Ehrlich gesagt mache ich so etwas normalerweise nicht… Ich rede online nicht über Geld, aber ich hatte das Gefühl, "
  + "dass ich es teilen sollte, weil meine Erfahrung anders war.\n\n"
  + "Als ich das erste Mal von dieser Plattform hörte, war ich sehr, sehr skeptisch. Überall verspricht jemand Gewinne. Ich habe mit "
  + "etwas Kleinem angefangen. Alles war organisiert und ich wurde zu nichts gedrängt.\n\n"
  + "Ich habe mein Konto regelmäßig überprüft und stetige Fortschritte gesehen. Nichts Verrücktes oder Unrealistisches, einfach "
  + "ein schrittweises Wachstum.\n\n"
  + "Was mich überzeugt hat, war meine erste Auszahlung. Ich war nervös 😅 aber sie lief reibungslos.\n\n"
  + "Sie können sie über den untenstehenden Link erreichen:\nhttps://t.me/InvestwithMara";

// The same shape in the four languages the testimonial rules read (#465, #468), written before the rule was tuned.
export const payoutTestimonialAds = [
  // German: shorter, an @handle, "kontaktieren Sie sie".
  "Ich war am Anfang skeptisch, aber diese Plattform hat mich überzeugt. Mein Konto wächst stetig, und meine erste Auszahlung kam ohne Probleme an. Kontaktieren Sie sie hier: @Invest_with_Lena",
  "Ich investiere seit zwei Monaten über diese Plattform und sehe jede Woche Fortschritte. Die Auszahlung hat problemlos geklappt 🙏 Schreiben Sie ihr über den Link unten:\nhttps://t.me/LenaTradingProfit",
  // English.
  "Honestly I don't usually post about money, but my experience was different. I was very skeptical about this platform at first, so I started small. I checked my account regularly and saw steady growth, nothing crazy. What convinced me was my first withdrawal, it went smoothly. You can reach her through the link below:\nhttps://t.me/InvestwithMara",
  "I was skeptical at first but this investment platform changed my mind. Steady profits every week and my first payout arrived without any issues. Contact her via the link below 👇\nt.me/TradeWithSophia",
  "My first withdrawal from this trading platform went through smoothly, and my account keeps growing every week. Reach out to her here: @crypto_invest_anna",
  // French.
  "Honnêtement, je ne parle jamais d'argent en ligne, mais mon expérience a été différente. J'étais très sceptique au sujet de cette plateforme, alors j'ai commencé petit. J'ai vu une croissance régulière sur mon compte et mon premier retrait s'est très bien passé. Vous pouvez la contacter via le lien ci-dessous :\nhttps://t.me/InvestirAvecClara",
  "J'étais sceptique au début, mais mes gains sont réguliers et mon premier retrait est arrivé sans problème. Contactez-la ici 👇 @Clara_Trading_Invest",
  // Russian.
  "Честно, я обычно не пишу о деньгах, но мой опыт оказался другим. Сначала я очень скептически относилась к этой платформе и начала с небольшой суммы. Счёт стабильно рос, а первый вывод прошёл без проблем. Связаться с ней можно по ссылке ниже:\nhttps://t.me/InvestWithMarina",
  "Был скептиком, но эта инвестиционная платформа меня убедила: стабильный рост и первый вывод средств пришёл быстро. Пишите ей 👇 @marina_invest_pro",
  // Terse copies with no first-person word, calling toward her (review of #716).
  "First withdrawal went smoothly, steady growth on the platform. Reach out to her 👇 t.me/InvestwithEmma",
  "Сначала не верила в эту платформу, но первый вывод прошёл без проблем. Свяжитесь с ней 👇 t.me/+AbCdEf1234",
  // The ads' stock question calls, praise of support, thanks to the admins and "our channel" still call (second review of #716).
  "My first withdrawal from this platform went smoothly. If you have any questions, contact her via the link below t.me/InvestwithMara",
  "Ich war skeptisch gegenüber dieser Plattform. Meine erste Auszahlung lief reibungslos. Bei Fragen können Sie sie über den untenstehenden Link erreichen: https://t.me/+AbCdEf123",
  "Сначала я скептически относилась к этой платформе, но мой первый вывод прошёл без проблем. По всем вопросам пишите ей по ссылке ниже: https://t.me/InvestWithMarina",
  "J'étais sceptique, mais mon premier retrait sur la plateforme s'est bien passé. Pour toute question, contactez-la via le lien ci-dessous : t.me/Clara_Trading_Invest",
  "My first withdrawal from this platform went smoothly. Her support is amazing, reach out to her: t.me/InvestwithMara",
  "My first withdrawal from this platform went smoothly. Thanks to the admins, contact her via the link below t.me/InvestwithMara",
  "My first withdrawal from this platform went smoothly. Join our channel 👇 t.me/InvestwithMara",
  "My first withdrawal from this platform went smoothly, my trading journal is full of wins now, write to her t.me/InvestwithMara",
  "My first withdrawal from this platform went smoothly. Everything I know comes from my mentor's channel 👇 t.me/InvestwithMara",
  "Мой первый вывод с платформы прошёл без проблем. Мой любимый канал 👇 t.me/InvestWithMarina",
  "My first withdrawal from this platform went smoothly. She is the best admin, contact her via the link below t.me/InvestwithMara",
  "My first withdrawal from this platform went smoothly. My channel about trading, write to her t.me/InvestwithMara",
  // Another payout named next to the author's, and praise of her support (fourth review of #716).
  "I was skeptical about this platform, but my first withdrawal went smoothly, and she will guide your first withdrawal too. Contact her t.me/InvestwithMara",
  "Ich war skeptisch gegenüber dieser Plattform. Meine erste Auszahlung lief reibungslos, und Ihre erste Auszahlung wird es auch. Schreiben Sie ihr: https://t.me/InvestwithMara",
  "Сначала я скептически относилась к этой платформе, но мой первый вывод прошёл без проблем, и ваш первый вывод тоже пройдёт. Пишите ей 👇 t.me/InvestWithMarina",
  "Thanks to her withdrawal strategy, my first withdrawal from this platform went smoothly. Contact her t.me/InvestwithMara",
  "Let's cash out together: my first withdrawal from this platform went smoothly. Contact her t.me/InvestwithMara",
  "My first withdrawal from this platform went smoothly. Her support replies within minutes, reach out to her: t.me/InvestwithMara",
  "Ich war skeptisch gegenüber dieser Plattform. Meine erste Auszahlung lief reibungslos. Sie bietet Support bei jedem Schritt, schreiben Sie ihr: https://t.me/InvestwithMara",
  "J'étais sceptique, mais mon premier retrait sur la plateforme s'est bien passé. Grâce au support de Clara tout est simple, contactez-la : t.me/Clara_Trading_Invest",
  "Сначала я скептически относилась к этой платформе, но мой первый вывод прошёл без проблем. Если нуждаетесь в поддержке, пишите ей по ссылке ниже: t.me/InvestWithMarina",
  "Ich war skeptisch gegenüber dieser Plattform. Meine erste Auszahlung lief reibungslos. Ich bin begeistert vom Support, den sie bietet, schreiben Sie ihr: https://t.me/InvestwithMara",
  "Ich war skeptisch gegenüber dieser Plattform. Meine erste Auszahlung lief reibungslos. Profitieren Sie vom Support von Mara und schreiben Sie ihr: https://t.me/InvestwithMara",
  "Сначала я скептически относилась к этой платформе, но мой первый вывод прошёл без проблем. Если нуждаетесь в поддержке работайте с ней, пишите ей: t.me/InvestWithMarina",
  // An English copy with no platform word, and a German one handing over the link (fourth-to-last review of #716).
  "I was skeptical at first. My first withdrawal went smoothly. You can reach her via the link below: t.me/InvestwithEmma",
  "Ich war am Anfang skeptisch. Meine erste Auszahlung lief reibungslos. Hier ist der Link: t.me/InvestwithEmma",
  // A credited guru beside a cheap call toward the author, a call asking "how", a team's "uns" and a profile mentioned in passing
  // (eighth review of #716).
  "I was skeptical at first, but thanks to Mrs Emma my first withdrawal went smoothly. Follow me for more 👇 t.me/InvestwithEmma",
  "I was skeptical of this platform. My first withdrawal went smoothly thanks to Mrs Emma. Don't take my word, ask me anything. Link below t.me/InvestwithEmma",
  "I was skeptical at first. My first withdrawal went smoothly. Ask me how, or use the link below: t.me/InvestwithEmma",
  "I was skeptical of this platform. My first withdrawal went smoothly. I share the link below t.me/InvestwithEmma",
  "Ich war skeptisch gegenüber dieser Plattform. Meine erste Auszahlung lief reibungslos. Folgen Sie uns 👇 t.me/InvestwithEmma",
  "I was skeptical of this platform. My first withdrawal went smoothly. Check my profile for proof, and reach out via the link below: t.me/InvestwithEmma",
  // A team's "Schreiben Sie uns" and a link handed over to her (ninth review of #716).
  "Ich war skeptisch gegenüber dieser Plattform. Meine erste Auszahlung lief reibungslos. Schreiben Sie uns: t.me/InvestwithEmma",
  "I was skeptical of this platform. My first withdrawal went smoothly. Here's the link to her channel: t.me/InvestwithEmma",
  "Сначала не верила этой платформе, но мой первый вывод прошёл без проблем. Вот ссылка на неё: t.me/InvestWithMarina",
  // A German verb-final claim with a long gap before the participle (tenth review of #716).
  "Ich habe letzte Woche meine ersten Gewinne problemlos abgehoben. Sie können sie über den untenstehenden Link erreichen: https://t.me/InvestwithEmma",
  "I withdrew my first profits without any issues. My account was never frozen. Reach her via the link below: t.me/InvestwithEmma",
  // A boast that nothing is frozen, and her own old account blocked, are the ads' story, not a victim's (eleventh review of #716).
  "I was skeptical of this platform. My first withdrawal went smoothly. No frozen accounts, no hidden fees. Reach her via the link below: t.me/InvestwithEmma",
  "I was skeptical of this platform. My first withdrawal went smoothly. Unlike other brokers, nothing gets blocked here. Reach her via the link below: t.me/InvestwithEmma",
  "J'étais sceptique envers cette plateforme. Mon premier retrait s'est bien passé. Aucun compte bloqué. Vous pouvez la contacter via le lien ci-dessous : t.me/InvestwithEmma",
  "Сначала не верила этой платформе, но мой первый вывод прошёл без проблем. Никаких блокировок. Свяжитесь с ней по ссылке ниже: t.me/InvestWithMarina",
  "I was skeptical of this platform. My first withdrawal went smoothly. Her old account was blocked, so this is her new one. Reach her via the link below: t.me/InvestwithEmma",
  "Сначала не верила этой платформе, но мой первый вывод прошёл без проблем. Её старый аккаунт заблокировали, вот новый. Свяжитесь с ней по ссылке ниже: t.me/InvestWithMarina",
  "I withdrew my first profits quickly and without any issues. Reach her via the link below: t.me/InvestwithEmma",
  // Longer boasts, a "froze" with no object, and a noun's speed (twelfth review of #716).
  "I was skeptical of this platform. My first withdrawal went smoothly. No account has ever been frozen. Reach her via the link below: t.me/InvestwithEmma",
  "I was skeptical of this platform. My first withdrawal went smoothly. Nobody's account gets frozen here. Reach her via the link below: t.me/InvestwithEmma",
  "I was skeptical of this platform. My first withdrawal went smoothly. I literally froze when I saw my balance. Reach her via the link below: t.me/InvestwithEmma",
  "Сначала не верила этой платформе, но мой первый вывод прошёл быстро. Свяжитесь с ней по ссылке ниже: t.me/InvestWithMarina",
  "I was skeptical of this platform. My first withdrawal went smoothly. Don't worry about frozen accounts. Reach her via the link below: t.me/InvestwithEmma",
  "Сначала не верила этой платформе, но мой первый вывод прошёл без проблем. Вывод без блокировок и комиссий. Свяжитесь с ней по ссылке ниже: t.me/InvestWithMarina",
  "Meine erste Auszahlung von der Plattform lief reibungslos. Kein Konto wird gesperrt. Sie können sie über den untenstehenden Link erreichen: https://t.me/InvestwithEmma",
  "I was skeptical of this platform. My first withdrawal went smoothly. I was frozen in disbelief when it landed. Reach her via the link below: t.me/InvestwithEmma",
  "I was skeptical of this platform. My first withdrawal went smoothly. I blocked all the copycat accounts, so use only this one. Reach her via the link below: t.me/InvestwithEmma",
  "I was skeptical of this platform. My first withdrawal went smoothly. Never had an account blocked. Reach her via the link below: t.me/InvestwithEmma",
  // A negation inside the freeze phrase (fifteenth review of #716).
  "My first withdrawal from this platform went smoothly. Funds are never locked. Contact her via the link below t.me/InvestwithMara",
  "My first withdrawal from this platform went smoothly. Withdrawals are not locked like on other platforms. Contact her via the link below t.me/InvestwithMara",
  "My first withdrawal went smoothly. I froze the moment I saw my balance. Contact her via the link below t.me/InvestwithMara",
  // Lists under one negation (seventeenth review of #716).
  "I was skeptical of this platform. My first withdrawal went smoothly. No frozen or blocked accounts. Reach her via the link below: t.me/InvestwithEmma",
  "I was skeptical of this platform. My first withdrawal went smoothly. My account was never frozen or blocked. Reach her via the link below: t.me/InvestwithEmma",
  "I was skeptical of this platform. My first withdrawal went smoothly. No hidden fees or frozen accounts. Reach her via the link below: t.me/InvestwithEmma",
  "Meine erste Auszahlung von der Plattform lief reibungslos. Mein Konto wurde nie gesperrt oder eingefroren. Sie können sie über den untenstehenden Link erreichen: https://t.me/InvestwithEmma",
  "Mon premier retrait sur la plateforme s'est bien passé. Mon compte n'a jamais été bloqué ou gelé. Vous pouvez la contacter via le lien ci-dessous : t.me/InvestwithEmma",
  "Сначала не верила этой платформе, но мой первый вывод прошёл без проблем. Никаких комиссий и блокировок. Свяжитесь с ней по ссылке ниже: t.me/InvestWithMarina",
  "Сначала не верила этой платформе, но мой первый вывод прошёл без проблем. Без комиссий и блокировок. Свяжитесь с ней по ссылке ниже: t.me/InvestWithMarina",
  // Boasts that no payout got stuck, waits or costs a fee, and a stuck job told before the claim (twenty-first review of #716).
  "My first withdrawal from this platform went smoothly. No withdrawal ever got stuck. Reach her via the link below: t.me/InvestwithEmma",
  "My first withdrawal from this platform went smoothly. Withdrawals never get stuck or pending. Reach her via the link below: t.me/InvestwithEmma",
  "My first withdrawal from this platform went smoothly. They never asked for a fee to withdraw. Reach her via the link below: t.me/InvestwithEmma",
  "I was stuck in a dead-end job. My first withdrawal from this platform went smoothly. Reach her via the link below: t.me/InvestwithEmma",
  "Meine erste Auszahlung von der Plattform lief reibungslos. Keine Auszahlung hing je fest. Sie können sie über den untenstehenden Link erreichen: https://t.me/InvestwithEmma",
  "Mon premier retrait sur la plateforme s'est bien passé. Aucun retrait n'est jamais resté en attente. Vous pouvez la contacter via le lien ci-dessous : t.me/InvestwithEmma",
  "Meine erste Auszahlung von der Plattform lief reibungslos. Keine Auszahlung wurde je abgelehnt. Sie können sie über den untenstehenden Link erreichen: https://t.me/InvestwithEmma",
  "Mon premier retrait sur la plateforme s'est bien passé. Aucun retrait n'a été refusé. Vous pouvez la contacter via le lien ci-dessous : t.me/InvestwithEmma",
  "Мой первый вывод с платформы прошёл без проблем. Ни один вывод не завис. Свяжитесь с ней по ссылке ниже: t.me/InvestWithMarina",
  "My first withdrawal from this platform went smoothly. No withdrawal was ever rejected. Reach her via the link below: t.me/InvestwithEmma",
  "Meine erste Auszahlung von der Plattform lief reibungslos. Ich musste keine Gebühren zahlen, um abzuheben. Sie können sie über den untenstehenden Link erreichen: https://t.me/InvestwithEmma",
  "Meine erste Auszahlung von der Plattform lief reibungslos. Ich musste nie eine Gebühr zahlen, um abzuheben. Sie können sie über den untenstehenden Link erreichen: https://t.me/InvestwithEmma",
];

// Real members, warnings and replies: never a match.
export const payoutTestimonialControls = [
  // Own broker or index-fund experience, no contact funnel.
  "I was skeptical about index funds at first, but after three years my account shows steady growth. My first withdrawal went smoothly too. Just use a regulated broker.",
  "Ich war skeptisch gegenüber ETFs, aber mein Depot wächst stetig und die erste Auszahlung bei meiner Bank lief reibungslos. Kann ich nur empfehlen.",
  "Я сначала скептически относился к брокеру, но счёт стабильно растёт, первый вывод прошёл без проблем. Пользуюсь Тинькофф, всем советую.",
  "J'étais sceptique sur les ETF mais mon compte progresse régulièrement et mon premier retrait s'est bien passé. Je recommande un courtier régulé.",
  // A member's own channel link.
  "I write about my investing journey: steady growth, my first withdrawal from my broker went smoothly. My channel: https://t.me/my_invest_notes",
  "Ich schreibe über meine Erfahrungen mit ETFs, stetiges Wachstum und meine erste Auszahlung. Mein Kanal: https://t.me/meine_invest_notizen",
  // A scam warning quoting such an ad.
  "Vorsicht, diese Nachricht kursiert gerade: Meine erste Auszahlung lief reibungslos, Sie können sie über den untenstehenden Link erreichen: https://t.me/InvestwithMara — das ist Betrug!",
  "Beware of posts like this: 'my first withdrawal went smoothly, steady growth, reach her via the link below t.me/InvestwithMara'. It's a scam.",
  "Осторожно, мошенники! Пишут: «первый вывод прошёл без проблем, свяжитесь с ней по ссылке ниже» t.me/InvestWithMarina",
  // A reply to someone else's question, and a question.
  "Has anyone tried this platform? They say the first withdrawal goes smoothly, link below t.me/InvestwithMara. Legit?",
  "@peter_k yes, my first withdrawal from that platform went smoothly, the support contact is below t.me/platform_support",
  // A withdrawal problem, not a testimonial.
  "My first withdrawal is stuck for two weeks, support doesn't answer. Contact them via the link below if you have the same issue: t.me/exchange_support",
  // A game or an app payout, no investing word.
  "My first payout from the delivery app went smoothly, steady orders every week. Contact her here: @courier_anna",
  // A member pointing to a support, help or admin contact (review of #716).
  "Meine erste Auszahlung bei Trade Republic lief problemlos. Bei Fragen zur Plattform können Sie sie über den Link erreichen: t.me/TradeRepublicSupport",
  "My first payout from Interactive Brokers arrived in two days, steady growth on my account. If anyone needs help, message him, he's our group admin @crypto_admin_max",
  "My first withdrawal from my broker went smoothly. If you have issues contact the support via t.me/broker_support",
  "Meine erste Auszahlung lief problemlos, die Plattform ist gut. Wenden Sie sich an das Team: t.me/crypto_exchange_help",
  "I trade on Kraken, my withdrawals always arrive fine. For questions about the platform, contact them: t.me/KrakenSupport",
  "Мой первый вывод с биржи прошёл без проблем, рост на счёте ок. Если что, пишите ему, он админ чата @crypto_chat_admin",
  // The author's own channel with a qualified label (review of #716).
  "My first withdrawal from the platform went smoothly. My investing channel 👇 t.me/tom_invest",
  "Meine erste Auszahlung von der Plattform lief reibungslos. Mein Trading-Kanal 👇 t.me/tom_trading",
  "Meine erste Auszahlung von der Plattform lief reibungslos. Mein Investment-Blog 👇 t.me/tom_invest",
  "My first withdrawal from the platform went smoothly. I post my trading journal here 👇 t.me/my_trading_journal",
  // Someone else's first payout (second review of #716).
  "My brother uses this exchange and his first withdrawal arrived without issues, talk to him @crypto_tom",
  "I told my friend about the platform, her first withdrawal went smoothly. Contact her @invest_anna",
  "Мой брат пользуется этой платформой, его первый вывод прошёл без проблем. Пишите ему @crypto_vasya",
  "My friend's first withdrawal from the platform went smoothly. Contact her @invest_anna",
  // A member pointing at a chat admin or a support employee (third review of #716).
  "My first withdrawal from the platform went smoothly. If you have problems, write to him, he's admin here @crypto_tom",
  "My first withdrawal from the exchange went smoothly. If you have problems, write to him, he is one of the admins @crypto_tom",
  "Meine erste Auszahlung von der Plattform lief problemlos. Bei Problemen schreiben Sie ihm, er ist unser Gruppen-Admin: @krypto_max",
  "Mon premier retrait sur la plateforme s'est bien passé. En cas de souci, écrivez-lui, il est admin du groupe @crypto_paul",
  "My first withdrawal from the exchange went smoothly. If you get stuck, contact her, she is the platform's support manager @invest_anna",
  "My first withdrawal from the exchange went smoothly. If you get stuck, contact her, she works in support there @invest_anna",
  "Meine erste Auszahlung bei Trade Republic lief problemlos. Bei Fragen schreiben Sie ihr, sie arbeitet im Support von Trade Republic: @trade_anna",
  "Mon premier retrait sur la plateforme s'est bien passé. En cas de souci, contactez-la, elle travaille au support de la plateforme @trade_claire",
  "Мой первый вывод с платформы прошёл без проблем. Если будут вопросы, пишите ей, она из поддержки платформы @crypto_lena",
  "Meine erste Auszahlung von der Plattform lief problemlos. Bei Problemen schreiben Sie Max vom Support: @krypto_max",
  "Meine erste Auszahlung von der Plattform lief problemlos. Bei Problemen hilft Anna vom Support der Börse, schreiben Sie ihr: @krypto_anna",
  "Mon premier retrait sur la plateforme s'est bien passé. En cas de souci, contactez-la, elle fait partie du support @trade_claire",
  "Mon premier retrait sur la plateforme s'est bien passé. En cas de souci, contactez-la, elle bosse au support de la plateforme @trade_claire",
  "Мой первый вывод с платформы прошёл без проблем. Если будут вопросы, пишите ей, она в поддержке работает @crypto_lena",
  "Мой первый вывод с платформы прошёл без проблем. Если будут вопросы, пишите ей, она сидит в поддержке биржи @crypto_lena",
  // The author's own channel named with a topic phrase (third review of #716).
  "My first withdrawal from the platform went smoothly. My channel about trading 👇 t.me/tom_trading",
  "My first withdrawal from the platform went smoothly. My long-term investing channel 👇 t.me/tom_invest",
  "Meine erste Auszahlung von der Plattform lief reibungslos. Mein Kanal zum Thema Trading 👇 t.me/tom_trading",
  "Мой первый вывод с платформы прошёл без проблем. Мой канал про инвестиции 👇 t.me/tom_invest",
  "Mon premier retrait sur la plateforme s'est bien passé. Ma chaîne sur le trading 👇 t.me/tom_trading",
  // The author calling toward themselves at their own investing-named handle (seventh review of #716).
  "Meine erste Auszahlung beim Broker lief problemlos. Ihr könnt mich hier erreichen: @max_invest",
  "Meine erste Auszahlung beim Broker lief problemlos. Sie können mich gern über den Link unten erreichen: t.me/max_invest_blog",
  "Meine erste Auszahlung beim Broker lief problemlos, ihr könnt mir dort schreiben: t.me/max_trading",
  "My first withdrawal from my broker went smoothly. You can reach me via the link below: t.me/max_investing",
  "My first withdrawal from my broker went smoothly. Questions? Ask me, link below: t.me/max_investing",
  "My first withdrawal from my broker went smoothly. Happy to answer questions, my profile 👇 t.me/max_investing",
  "My first withdrawal from my broker went smoothly. I post my portfolio updates at the link below: t.me/max_investing",
  "Мой первый вывод с брокера прошёл без проблем. Можете написать мне по ссылке ниже: t.me/ivan_invest",
  "Mon premier retrait chez mon courtier s'est bien passé. Vous pouvez me contacter via le lien ci-dessous : t.me/paul_invest",
  // The formal "Sie" calling toward the author, a link named for what it leads to, and "learn" (eighth review of #716).
  "Meine erste Auszahlung beim Broker lief problemlos. Bei Fragen schreiben Sie mir: @max_invest",
  "Meine erste Auszahlung beim Broker lief problemlos. Kontaktieren Sie mich gern: t.me/max_invest",
  "Meine erste Auszahlung beim Broker lief problemlos. Sie erreichen mich über den Link unten: t.me/max_invest",
  "Meine erste Auszahlung beim Broker lief problemlos. Erreichen Sie mich hier: @max_invest",
  "Meine erste Auszahlung kam problemlos an. Hier ist der Link zur Gruppe: t.me/finanzfluss_community",
  "My first withdrawal went smoothly. Here's the link to the group where we discuss it: t.me/crypto_talk_de",
  "My first payout from Fiverr arrived! If you want to learn design, contact her via the link below: t.me/learn_design_anna",
  // A withdrawal that tells no success, and a first payout that was the bait of a frozen account (tenth review of #716).
  "Я вывел деньги с биржи, пока не поздно. Пишите ему, он подскажет @crypto_max",
  "J'ai retiré mon argent de la plateforme avant la faillite. Écrivez-lui, il m'a prévenu : @crypto_paul",
  "We withdrew all our savings from that broker after the news. Message him if you want details @invest_tom",
  "I withdrew my profits and closed the account, this platform is shady. Talk to her @crypto_lena",
  "Ich habe mein ganzes Geld von der Plattform abgehoben, bevor sie pleite ging. Schreiben Sie ihm, er hat mich gewarnt: @krypto_max",
  "My first withdrawal from her platform went smoothly, that's the hook. Then they froze my account and asked for a 'tax'. This is the woman 👇 t.me/InvestwithMara",
  "Мой первый вывод с платформы прошёл без проблем, так они и заманивают. Потом счёт заморозили. Вот её ссылка, жалуйтесь 👇 t.me/InvestWithMarina",
  "Meine erste Auszahlung von ihrer Plattform lief problemlos, so locken sie einen. Danach wurde mein Konto gesperrt und sie wollten eine 'Steuer'. Das ist die Frau 👇 t.me/InvestwithMara",
  "Mon premier retrait sur sa plateforme s'est bien passé, c'est l'appât. Ensuite ils ont bloqué mon compte et demandé une 'taxe'. Voici la femme 👇 t.me/InvestwithMara",
  "Mon premier retrait sur sa plateforme s'est bien passé. Puis ils ont gelé mon compte. Voici son lien 👇 t.me/InvestwithMara",
  "Meine erste Auszahlung lief reibungslos. Dann haben sie mein Konto eingefroren. Hier ist ihr Link 👇 t.me/InvestwithMara",
  // A withdrawal told only with speed or timing (eleventh review of #716).
  "Я быстро вывел деньги с биржи, пока не поздно. Пишите ему, он подскажет @crypto_max",
  "Я вывел деньги с биржи вовремя, пока не поздно. Пишите ему, он подскажет @crypto_max",
  "Ich habe sofort mein ganzes Geld von der Plattform abgehoben, bevor sie pleite ging. Schreiben Sie ihm, er hat mich gewarnt: @krypto_max",
  "J'ai retiré mon argent de la plateforme rapidement avant la faillite. Écrivez-lui, il m'a prévenu : @crypto_paul",
  "I withdrew my savings from that platform fast. Talk to her @crypto_lena",
  "I withdrew my money from the broker on time, before the crash. Message him @crypto_max",
  // Speed beside a generic noun, and a victim story naming the scammer's manager or team (twelfth review of #716).
  "Я быстро вывел деньги с биржи, пока не прекратили выплаты. Пишите ему, он подскажет @crypto_max",
  "Я быстро вывел деньги с биржи, пока ещё можно было выводить. Пишите ему, он подскажет @crypto_max",
  "I withdrew my savings from that platform fast, before the withdrawals were halted. Message him @crypto_max",
  "Ich habe sofort mein Geld abgehoben, bevor die Auszahlungen gestoppt wurden. Schreiben Sie ihm: @krypto_max",
  "My first withdrawal from her platform went smoothly. Then her manager blocked the account and asked for a tax. Here's her link 👇 t.me/InvestwithMara",
  "Мой первый вывод с её платформы прошёл без проблем. Потом её менеджер заморозил счёт. Вот её ссылка 👇 t.me/InvestWithMarina",
  "Meine erste Auszahlung lief reibungslos. Dann hat ihr Team das Konto gesperrt. Hier ist ihr Link 👇 t.me/InvestwithMara",
  "My first withdrawal from her platform went smoothly. Then they froze her clients' accounts, mine too. Here's her link 👇 t.me/InvestwithMara",
  // A negation of another phrase before the freeze (thirteenth review of #716).
  "My first withdrawal from her platform went smoothly. Then without any explanation they blocked my account. Here's her link 👇 t.me/InvestwithMara",
  "Мой первый вывод с её платформы прошёл без проблем. Через неделю мне без объяснений заблокировали аккаунт. Вот её ссылка 👇 t.me/InvestWithMarina",
  "Meine erste Auszahlung lief reibungslos. Dann wurde ohne Vorwarnung mein Konto gesperrt. Hier ist ihr Link 👇 t.me/InvestwithMara",
  "Mon premier retrait sur sa plateforme s'est bien passé. Puis sans prévenir ils ont gelé mon compte. Voici son lien 👇 t.me/InvestwithMara",
  "My first withdrawal from her platform went smoothly. Not long after they froze my account. Here's her link 👇 t.me/InvestwithMara",
  // Idioms with a negation of their own, and a negation that would reach across "my" (fourteenth review of #716).
  "My first withdrawal from her platform went smoothly. Then for no reason my account was blocked. Here's her link 👇 t.me/InvestwithMara",
  "My first withdrawal from her platform went smoothly. A week later with no explanation my account was suspended. Here's her link 👇 t.me/InvestwithMara",
  "Мой первый вывод с её платформы прошёл без проблем. Потом ни с того ни с сего заблокировали аккаунт. Вот её ссылка 👇 t.me/InvestWithMarina",
  "Мой первый вывод с её платформы прошёл без проблем. Потом ни с того ни с сего мой счёт заморозили. Вот её ссылка 👇 t.me/InvestWithMarina",
  "Мой первый вывод с её платформы прошёл без проблем. Через неделю не объяснив причин заблокировали мой аккаунт. Вот её ссылка 👇 t.me/InvestWithMarina",
  "Meine erste Auszahlung lief reibungslos. Keine Ahnung warum mein Konto gesperrt wurde. Hier ist ihr Link 👇 t.me/InvestwithMara",
  // Another clause's negation joined by a conjunction, and "no longer" (sixteenth review of #716).
  "Мой первый вывод с её платформы прошёл без проблем. Потом поддержка не отвечает и аккаунт заблокировали. Вот её ссылка 👇 t.me/InvestWithMarina",
  "Meine erste Auszahlung lief reibungslos. Der Support antwortet nicht und das Konto ist gesperrt. Hier ist ihr Link 👇 t.me/InvestwithMara",
  "Mon premier retrait sur sa plateforme s'est bien passé. Le support ne répond pas et le compte est bloqué. Voici son lien 👇 t.me/InvestwithMara",
  "My first withdrawal from her platform went smoothly. Then I could not log in and the account was locked. Here's her link 👇 t.me/InvestwithMara",
  "My first withdrawal from her platform went smoothly. Now I can no longer access the blocked account. Here's her link 👇 t.me/InvestwithMara",
  "My first withdrawal from her platform went smoothly. Then support didn't reply and froze my account. Here's her link 👇 t.me/InvestwithMara",
  "My first withdrawal from her platform went smoothly. Then support didn't reply and blocked my account. Here's her link 👇 t.me/InvestwithMara",
  // A conjunction after a negated verb starts a new clause (eighteenth review of #716).
  "My first withdrawal from her platform went smoothly. Support didn't answer and locked my account. Here's her link 👇 t.me/InvestwithMara",
  "My first withdrawal from her platform went smoothly. They didn't pay out and locked my funds. Here's her link 👇 t.me/InvestwithMara",
  "My first withdrawal from her platform went smoothly. Support didn't answer and blocked everything. Here's her link 👇 t.me/InvestwithMara",
  "Мой первый вывод с её платформы прошёл без проблем. Поддержка не отвечает и заморозила все средства. Вот её ссылка 👇 t.me/InvestWithMarina",
  "Мой первый вывод с её платформы прошёл без проблем. Поддержка не отвечает и заблокировала мне аккаунт. Вот её ссылка 👇 t.me/InvestWithMarina",
  "Mon premier retrait sur sa plateforme s'est bien passé. Le support ne répond pas et bloque tout. Voici son lien 👇 t.me/InvestwithMara",
  "Мой первый вывод с её платформы прошёл без проблем. Они не ответили и заблокировали. Вот её ссылка 👇 t.me/InvestWithMarina",
  // A verb negation inside a "ни" phrase, and "locked us out" (nineteenth review of #716).
  "Мой первый вывод с её платформы прошёл без проблем. Потом ни копейки не вернули и заблокировали. Вот её ссылка 👇 t.me/InvestWithMarina",
  "Мой первый вывод с её платформы прошёл без проблем. Потом ни рубля не вывели и заблокировали. Вот её ссылка 👇 t.me/InvestWithMarina",
  "My first withdrawal from her platform went smoothly. Support didn't answer and locked us out. Here's her link 👇 t.me/InvestwithMara",
  // A finite Russian freeze verb after a list negation (twentieth review of #716).
  "Мой первый вывод с её платформы прошёл без проблем. Потом без ответа и заблокировали. Вот её ссылка 👇 t.me/InvestWithMarina",
  "Мой первый вывод с её платформы прошёл без проблем. Потом никаких выплат и заморозили. Вот её ссылка 👇 t.me/InvestWithMarina",
  "Мой первый вывод с её платформы прошёл без проблем. Потом ни ответа и заблокировали. Вот её ссылка 👇 t.me/InvestWithMarina",
  // A later payout that never arrived, waits or is held for a fee or tax: the first payout was the bait (twenty-first review of #716).
  "My first withdrawal from this platform went smoothly. The second one never arrived. Her account 👇 t.me/InvestwithEmma",
  "My first withdrawal from her platform went smoothly. The second one has been pending for 3 weeks and she doesn't answer anymore. Her account 👇 t.me/InvestwithEmma",
  "My first withdrawal from this trading platform went smoothly. Then they asked for a 20% fee to release the rest and I never saw my money again. This is the woman 👇 t.me/InvestwithEmma",
  "My first withdrawal from this platform went smoothly. Then they demanded a tax before I could withdraw again. Her link below t.me/InvestwithEmma",
  "My first withdrawal went smoothly, so I invested 5000 more. The second withdrawal never arrived and now she ignores me. Message her and see: t.me/InvestwithEmma",
  "Meine erste Auszahlung von der Plattform lief reibungslos. Die zweite Auszahlung kam nie an und sie antwortet nicht mehr. Ihr Profil 👇 t.me/InvestwithEmma",
  "Мой первый вывод с платформы прошёл без проблем. Второй вывод так и не пришёл, она больше не отвечает. Вот её аккаунт 👇 t.me/InvestwithEmma",
  "Mon premier retrait sur la plateforme s'est bien passé. Le deuxième n'est jamais arrivé et elle ne répond plus. Son compte 👇 t.me/InvestwithEmma",
  "Meine erste Auszahlung von der Plattform lief reibungslos. Dann verlangten sie eine Steuer, bevor ich wieder abheben konnte. Ihr Profil 👇 t.me/InvestwithEmma",
  "Mon premier retrait sur la plateforme s'est bien passé. Ensuite ils ont exigé des frais pour débloquer le reste. Son compte 👇 t.me/InvestwithEmma",
  "Мой первый вывод с платформы прошёл без проблем. Потом потребовали налог за вывод остатка. Вот её аккаунт 👇 t.me/InvestwithEmma",
  "Meine erste Auszahlung von der Plattform lief reibungslos. Die zweite hängt seit Wochen fest. Ihr Profil 👇 t.me/InvestwithEmma",
  "Мой первый вывод с платформы прошёл без проблем. Второй завис уже месяц. Вот её аккаунт 👇 t.me/InvestwithEmma",
  // A fee demanded to pay out the rest, a payout declined, and one not received yet (twenty-second review of #716).
  "Ich war am Anfang skeptisch, aber diese Plattform hat mich überzeugt. Meine erste Auszahlung kam ohne Probleme an. Dann verlangten sie eine Gebühr, um den Rest auszuzahlen. Kontaktieren Sie sie hier: @Invest_with_Lena",
  "Meine erste Auszahlung von der Plattform lief reibungslos. Dann sollte ich Steuern zahlen, um mein Geld abzuheben. Ihr Profil 👇 t.me/InvestwithEmma",
  "Mon premier retrait sur la plateforme s'est bien passé. Ensuite j'ai dû payer des frais pour retirer le reste. Son compte 👇 t.me/InvestwithEmma",
  "My first withdrawal from this platform went smoothly. Then they told me to pay insurance to release the rest. Her account 👇 t.me/InvestwithEmma",
  "My first withdrawal from this platform went smoothly. My second withdrawal was rejected. Her account 👇 t.me/InvestwithEmma",
  "My first withdrawal from this platform went smoothly. I still haven't received the rest of my money. Her account 👇 t.me/InvestwithEmma",
  "Meine erste Auszahlung von der Plattform lief reibungslos. Die zweite ist bis heute nicht angekommen. Ihr Profil 👇 t.me/InvestwithEmma",
  "Мой первый вывод с платформы прошёл без проблем. Второй вывод отклонили. Вот её аккаунт 👇 t.me/InvestwithEmma",
  // A comparative or an unrelated negation between the demand and the fee (twenty-third review of #716).
  "Мой первый вывод с платформы прошёл без проблем. Потом потребовали не менее 20% комиссии за вывод остатка. Вот её аккаунт 👇 t.me/InvestwithEmma",
  "Мой первый вывод с платформы прошёл без проблем. Потом потребовали не меньше 20% комиссии за вывод остатка. Вот её аккаунт 👇 t.me/InvestwithEmma",
  "Meine erste Auszahlung von der Plattform lief reibungslos. Dann verlangten sie nicht weniger als 20% Gebühr, um den Rest abzuheben. Ihr Profil 👇 t.me/InvestwithEmma",
  "My first withdrawal from this platform went smoothly. Then they demanded not less than a 20% fee to withdraw the rest. Her account 👇 t.me/InvestwithEmma",
  "Мой первый вывод с платформы прошёл без проблем. Потом попросили не затягивать и оплатить комиссию за вывод остатка. Вот её аккаунт 👇 t.me/InvestwithEmma",
  "Mon premier retrait sur la plateforme s'est bien passé. Ensuite ils ont exigé pas moins de 20% de frais pour retirer le reste. Son compte 👇 t.me/InvestwithEmma",
  "Meine erste Auszahlung von der Plattform lief reibungslos. Die zweite Auszahlung wurde abgelehnt. Ihr Profil 👇 t.me/InvestwithEmma",
  "Mon premier retrait sur la plateforme s'est bien passé. Le deuxième retrait a été refusé. Son compte 👇 t.me/InvestwithEmma",
  // A member's own channel named with the Russian reflexive (twenty-first review of #716).
  "Мой первый вывод с биржи прошёл без проблем. Веду свой канал про инвестиции 👇 t.me/my_invest_notes",
  "Мой первый вывод с биржи прошёл без проблем. Пишу об инвестициях в своём канале 👇 t.me/my_invest_notes",
];
