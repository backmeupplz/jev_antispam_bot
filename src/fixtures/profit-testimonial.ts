// #465: the investment-testimonial funnel Jev kept at 0.7956 (prod capture, Nov 3 and Nov 5, two chats). Paraphrased: the
// "sir" and the invite link are replaced, the rest keeps the captured wording and layout. Everything else is SYNTHETIC.
export const profitTestimonialIncident = "I never knew trading pays massively until I meet a channel that introduced me to sir Daniel Brooks who turned my €500 to €38,600  within 48 hours of trading with him, I never believe my eyes until i received it in my account. \nI advise anyone having difficulty in trading to contact him and earn massively...\nClick the link below and thank me later\n👇👇👇👇\n\nhttps://t.me/+aB3dE5fG7hJ9kL1m";

// The family's other English copies in the capture (Oct 27–31, 0.76–0.79), paraphrased: a bare closing handle, and
// "would recommend @…".
export const profitTestimonialFamily = [
  "I was surprised at how fast i got my profit back, I invested ₹1000 and I got a profit of ₹10,800 in less than 3 hours. She is a real professional and an honest one, all thanks to miss Vera Novak.\n@message_Admin_vera_to_earn",
  "Having a good account manager who helped manage my trades and grow my $700 capital to $7,800 in profits has been one of the best experiences I’ve had in forex trading. I’m grateful for the experience and would recommend @Mentor_Anna_Forex to anyone interested in exploring forex trading. Always remember that trading involves risk and results can vary.",
];

// Held-out RU/EN ads, written before the rule was tuned.
export const profitTestimonialParaphrases = [
  "Mrs Linda Carter turned my $300 into $9,450 in just 3 days. If you want to earn like me, contact her now 👇 https://t.me/+AbCdEf123xyz",
  "I invested $1,000 with Mr. Williams and withdrew $15,000 after one week. Reach out to him on WhatsApp +1 415 555 0134",
  "Never thought crypto could pay this much! I made $12,500 from just $500 with Expert Sarah's signals. Join her channel and thank me later: t.me/sarahsignals",
  "My $250 became $6,800 in 72 hours thanks to Mr James and his trading team. DM him @jamestrades_fx",
  "From $200 to $7,800 in 5 days of trading!!! I'm so grateful to Mr. Robert Daniel, contact him today 👉 wa.me/14155550199",
  "I started with $500 and now I have $21,000 in my account after 10 days with Mrs Kate. Click the link below to join her channel\nhttps://t.me/+KateProfits",
  "Thanks to Mr Jason my €1.5k turned into €27k within a week of forex trading. Contact him on Telegram:\n@Jason_FX_Mentor",
  "Никогда не думала, что трейдинг может так приносить, пока не познакомилась с Анной Сергеевной. Она превратила мои 500$ в 38 600$ всего за 48 часов! Всем, у кого не получается в трейдинге, советую связаться с ней. Переходите по ссылке и потом скажете спасибо 👇👇 https://t.me/+QwErTy12345",
  "Вложила 10 000 ₽, через 2 дня вывела 150 000 ₽ 🔥 Пишите ей в лс @anna_invest_pro",
  "Благодаря Михаилу я приумножил свои 1000$ до 25 000$ за неделю торговли. Обращайтесь к нему, не пожалеете: t.me/+MikhailTrade",
  "Я заработал 50 000₽ с 5000₽ вложений в крипту, пишите мне @invest_ru_pro",
];

// Ads the #465 review found missed or added as regressions, which the rule was then fixed for (not held out): a "he" before the
// claim (folded, the Russian "не" reads "he"), currency words next to symbols, and a fee word after the result.
export const profitTestimonialReviewAds = [
  "Mr Daniel is amazing, he turned my $500 into $38,600 in 48 hours of trading. Contact him 👇 t.me/+abcdefgh",
  "Mr X turned my $500 into $38,000 with zero fees in a week of trading, contact him 👇 t.me/+abcdefgh",
  "Вложил 10 000 рублей, через неделю вывел 150 000 ₽ на карту. Пишите ему @invest_guru_pro",
  "Она превратила мои 500 евро в 12 000 € за неделю трейдинга! Свяжитесь с ней 👇 t.me/+abcdefgh",
];

// Trading talk, warnings, victims' stories, jokes about the ads, prices and conversions: never a match.
export const profitTestimonialControls = [
  "I turned my $500 into $2,000 trading BTC last year, mostly luck. Don't chase gurus.",
  "Beware: posts like 'sir X turned my €500 into €38,600, contact him t.me/+abc' are a scam",
  "This guy promised to turn my $500 into $38,000 in 48 hours, I contacted him on t.me/+abcdef and lost everything",
  "If I could turn my $500 into $38,000 in 48 hours I'd quit my job lol, DM me t.me/joke_chat",
  "I turned my $5,000 into $500 trading with a mentor. Contact me if you want to know who to avoid @mike_k",
  "I didn't turn my $500 into $38,000, I lost it all. Don't contact him @fake_mentor",
  "Did anyone else see the ad saying someone turned their €500 into €38,600 in 48 hours? t.me/+abc Is it legit?",
  "Has sir Charles really turned your €500 into €38,600? Contact him? https://t.me/+abc",
  "lol who falls for this: he turned my $500 into $38k in 48 hours of trading, click the link t.me/+abcdef",
  "he turned my $500 into $38k trading 😂😂 click the link below t.me/+abcdef",
  "Bitcoin went from $16,000 to $100,000 in two years. Analysis t.me/cryptonews/1234",
  "My rent went from $1,000 to $2,000 this year, contact the landlord @landlord_bob if you want the flat",
  "Grew my channel from 500 to 38,600 subscribers, contact me @growth_guy",
  "Он вложил 500$ и через месяц получил 5000$, но это обман, не пишите ему @scammer_x",
  "Мой брат вложил 500$ и через месяц получил 600$, пишите ему @brother_trade",
  "Такие сообщения уже достали: превратил мои 500$ в 38 600$ за 48 часов трейдинга, переходите по ссылке t.me/+abc",
  "Хозяйка подняла мне аренду с 30 000₽ до 60 000₽, напишите ей, может вам сдаст @hozyaika_spb",
  "Цены снижены с 5000₽ до 2500₽! Пишите в лс @shop_spb",
  "Я поменял с биржи 100 usdt в 9500₽ по крипте, пишите @obmen_spb",
  "A trader invested $500 and got $38,000 in a week of trading. I can't believe it. Link 👇 t.me/+abcdefgh",
  "Я поменял с карты 100 usdt в 9500 по курсу крипты, пишите @obmen_spb",
  "Bitcoin went from $16,000 to $100,000 in two years. I'm still holding mine. Chart 👇 t.me/cryptonews/1234",
  "I saw a post today: sir David turned his $500 into $38,000 in 48 hours of trading. I don't believe it.\nt.me/+abcdefgh",
  "My rent went from $1,000 to $2,000 this year and my income stayed the same. Message her @landlady_ann if you want the flat",
  "Хозяйка подняла мне аренду с 30 000₽ до 60 000₽, а доход тот же. Напишите ей @hozyaika_spb, может вам дешевле сдаст",
  "We invested $2,000 in solar panels and got 5,000 kWh in the first year. Message him @solar_ivan if you want the same installer",
  "Haha sir Daniel turned my €5 into €10 in 48 hours of trading, contact him and thank me later 👇 t.me/+memes_chat",
  "I went from $1,000 to $2,000 in rent this year and my income stayed the same. Message her @landlady_ann if you want the flat",
  "Мне подняли с 30 000₽ до 60 000₽ аренду, а доход тот же. Напишите ей @hozyaika_spb, может вам дешевле сдаст",
  "Я теперь плачу с 30 000₽ до 60 000₽ за квартиру в месяц, а доход тот же. Напишите ей @hozyaika_spb",
  // #465 review 4: price ranges in classified ads, costs that grew, and genuine investing talk sharing a post with an arrow.
  "Я делаю маникюр с 1500₽ до 3000₽, перевод на карту. Запись в лс @nails_spb",
  "Мы чиним ноутбуки с 1500₽ до 5000₽, оплата на карту. Пишите в лс @remont_spb",
  "I sell used phones from $50 to $300, I trade-in too. DM me @phones_ny",
  "Мой платёж по кредиту вырос с 15 000₽ до 32 000₽, а доход тот же. Пишите ей @bank_manager_spb",
  "Мы сдаём квартиру посуточно с 3000₽ до 6000₽ в сутки, оплата на карту. Пишите @kvartira_spb",
  "My car insurance premium went from $800 to $1,900 this year and my income stayed flat. Message them @insure_bob",
  "My kid's daycare went from $600 to $1,300 this year, my income is the same. Message them @daycare_ann",
  "I invested $1,000 in an S&P index fund in 2015 and now I have $3,500. No mentors, no signals, just patience. Good book on it 👇 t.me/finance_books/12",
  "Я вложил 10 000₽ в акции Сбера в 2020, сейчас у меня 25 000₽. Без всяких сигналов. Хороший разбор тут 👇 t.me/investfuture/123",
  "I invested $1,000 in an index fund in 2015 and now I have $3,500. My notes on it 👇 t.me/my_index_notes",
  "Я вложил 10 000₽ в индексный фонд, сейчас у меня 25 000₽. Мой канал про это 👇 @my_index_notes",
  // #465 review 5: own-channel investing talk with a pronoun, and bills or costs with the author or an account as the range's subject.
  "Вложил 100 000₽ в индексный фонд в 2016, сейчас у меня 300 000₽. Никаких сигналов, просто терпение, всем его советую. Мой канал 👇 t.me/my_index_fund",
  "Я вложил 100 000₽ в биткоин в 2020, сейчас у меня 400 000₽. Держу его и не продаю. Мой канал про крипту 👇 t.me/my_crypto_ru",
  "I invested $1,000 in VOO in 2015 and now I have $3,500. My wife thought I was crazy, now she agrees. My channel 👇 @my_invest_notes",
  "I invested $1,000 in VOO in 2015 and now I have $3,500. Read Bogle, his book changed everything for me. My notes 👇 t.me/my_invest_notes",
  "I went from $800 to $1,900 on car insurance this year and my income stayed flat. Message them @insure_bob",
  "Мой счёт за свет вырос с 900₽ до 2400₽, а доход тот же. Пишите @energosbyt_help",
  "Мой счёт вырос с 900₽ до 2400₽ за свет, а доход тот же. Пишите @energosbyt_help",
  "I went from $500 to $1,200 in savings this year with my wife, she is a great coach. Her blog 👇 @wife_budget_blog",
  "Я с 1500₽ до 3000₽ беру за маникюр, пишите @nails_spb",
  "Мой счёт вырос с 900₽ до 2400₽ благодаря новому тарифу, а доход тот же. Пишите им @energo_spb",
  "I went from $40 to $90 per session as a fitness coach, my income doubled. DM me @fit_coach_ny",
  "My balance went from $200 to $900 thanks to my tax refund, income finally. Contact them @bank_help",
  // #465 review 6: a public link or handle introduced with ordinary words, or closing the message, shares or addresses.
  "I invested $1,000 in VOO in 2015 and now I have $3,500. Wrote about it here t.me/my_invest_notes",
  "I invested $2,000 in an index fund in 2016 and now I have $6,800. My wife thought I was crazy, now she agrees. My channel:\n@my_invest_notes",
  "I started with $1,000 in BTC in 2020 and now I have $9,000. Not financial advice. Details: t.me/btc_notes",
  "Told you so. I invested $500 in ETH in 2019 and now I have $4,000\n@vasya_petrov",
  "Я вложил 50 000 ₽ в крипту в 2020, сейчас у меня 140 000 ₽, так что зря ты не верил\n@vasya_petrov",
  "Я вложил 10 000₽ в акции Сбера в 2020, сейчас у меня 25 000₽. Инвестирую без сигналов. Подробнее писал тут: t.me/my_index_notes",
  // #465 review 7: a role or thanks word naming no person, or a negated one, credits no third party.
  "Thanks to compound interest my $10,000 became $30,000 over 10 years of investing. My channel 👇 t.me/my_invest",
  "I put $1,000 into an index fund in 2020 and now I have $3,500. No mentor, no signals, just patience. My notes 👇 t.me/my_index_notes",
  "Я вложил 60 000 ₽ в крипту в 2019, сейчас у меня 170 000 ₽. Спасибо за совет!\n@vasya_petrov",
  "As a trader I turned my $1,000 into $2,500 over two years, nothing fancy. My channel 👇 t.me/my_trade_notes",
  "I started with $2,000 in BTC in 2021 and now I have $7,000. I'm no expert, just held. Details: t.me/btc_notes",
  "I invested $1,000 via my broker in 2015 and now I have $3,500. My notes 👇 t.me/my_invest_notes",
  "Благодаря сложному проценту мои 100 000₽ превратились в 300 000₽ за 10 лет инвестиций. Мой канал 👇 t.me/my_invest",
  "Я вложил 10 000₽ в индексный фонд в 2019, сейчас у меня 25 000₽. Без ментора и сигналов, просто терпение. Мой канал 👇 @my_index_notes",
  "Я вложил 200 000₽ в индексный фонд в 2015, сейчас у меня 500 000₽. Никаких трейдеров и сигналов. Подробнее тут: t.me/my_index_fund",
  "Я вложил 30 000₽ в эфир в 2019, сейчас у меня 90 000₽. Держу и не продаю. Спасибо, что читаете! Мой канал про крипту 👇 t.me/my_crypto_ru",
  "I invested $1,000 in BTC in 2017 and now I have $40,000. Huge thanks to my brother for the push!\n@bro_handle",
  "I invested $2,000 in ETH in 2018 and now I have $9,000. Thanks to my dad who told me to buy.\n@dad_handle",
  "I used an Expert Advisor and turned my $1,000 into $2,500 trading forex last year. My notes 👇 t.me/my_ea_notes",
  "I invested $3,000 via my broker Revolut in 2016 and now I have $8,000. My notes 👇 t.me/my_revolut_notes",
  "I miss my old portfolio days, I turned my $1,000 into $2,600 trading. My notes 👇 t.me/my_old_notes",
  "Yes sir I turned my $1,500 into $4,000 holding BTC. My channel 👇 t.me/my_btc_hold",
  // A role word ending its sentence, "miss" as a verb, "sir" addressing the reader, and "Mr Market" name no guru.
  "I'm a swing trader. Patience paid off: my $1,200 grew to $2,900 in two years. Channel 👇 t.me/my_swing_notes",
  "Я трейдер. Терпение решает: мои 120 000₽ выросли до 290 000₽ за два года. Канал 👇 t.me/my_swing_ru",
  "I invested $1,300 in VTI in 2014 and now I have $4,100. I never paid a mentor. Patience wins. My notes 👇 t.me/my_vti_notes",
  "I turned my $1,100 into $2,800 holding crypto. I miss Bitcoin at $3,000 though. My notes 👇 t.me/my_hodl_notes",
  "I turned my $1,400 into $3,300 holding ETH. Still miss buying BTC at $3k though. My notes 👇 t.me/my_eth_notes",
  "Yes sir Bitcoin did that, I turned my $1,600 into $3,900 holding it. My notes 👇 t.me/my_btc_diary",
  "I turned my $1,700 into $4,200 holding SOL. Thanks Mr Market! My channel 👇 t.me/my_sol_hold",
  "I turned my $1,450 into $3,350 holding ETH. Miss buying BTC at $3k though. My notes 👇 t.me/my_eth_diary",
  "I check my portfolio once a month and miss nothing. My $1,800 became $5,100 in two years of investing. My notes 👇 t.me/my_monthly_notes",
  "I set price alerts so I never have to miss anything. My $1,900 became $5,600 in two years of investing. My notes 👇 t.me/my_alert_notes",
  "Yes, sir Bitcoin did that, I turned my $2,100 into $5,300 holding it. My notes 👇 t.me/my_btc_log",
  // #465 review 8: "join", "click" and "link in bio" only point, like an arrow; a public link the author labels as their own shares,
  // even after thanking a public figure.
  "I invested $1,000 in VOO in 2015 and now I have $3,500. Join my channel t.me/my_invest_notes",
  "I invested $1,000 in VOO in 2015 and now I have $3,500. Join our group for long-term investors t.me/bogleheads_chat",
  "I invested $1,000 in VOO in 2015 and now I have $3,500. Click the link to read my notes t.me/my_invest_notes",
  "I turned my $1,000 into $3,000 over two years of index investing. I write about it, link in bio @my_index_notes",
  "I turned my $2,000 into $9,000 holding BTC. Thank you Mr Saylor! My channel 👇 @my_btc_notes",
  "I invested $1,000 in Berkshire in 2012 and now I have $3,600. Thanks Mr Buffett 😄 My notes 👇 t.me/my_brk_notes",
  "I invested $1,000 following Sir John Templeton's advice and now I have $5,000. My notes 👇 t.me/my_value_notes",
  "Following trader Mark Minervini's book I turned my $2,000 into $5,000 last year. My notes 👇 t.me/my_swing_notes",
  "Мои 100 000₽ превратились в 300 000₽ за 5 лет инвестиций. Спасибо мистеру Баффету! Мой канал 👇 t.me/my_invest",
  "I turned my $2,000 into $9,000 holding BTC. Thank you Mr Saylor! Link in my bio @my_btc_notes",
  "I turned my $2,000 into $9,000 holding BTC. Thank you Mr Saylor! My Telegram 👇 @my_btc_notes",
  "I turned my $2,000 into $9,000 holding BTC. Thank you Mr Saylor! My notes are here: t.me/my_btc_notes",
  "Мои 100 000₽ превратились в 300 000₽ за 5 лет инвестиций. Спасибо мистеру Баффету! Мой канал тут 👇 t.me/my_invest",
  "I turned my $2,000 into $9,000 holding BTC. Thank you Mr Saylor! My channel (free) 👇 t.me/my_btc_notes",
];

// #465 reviews 4 and 5: ads the narrowed range and arrow checks must keep: the author's own stake over a bare range, the
// author or their account as its subject ("I went from…", "Мой счёт вырос с…"), and an arrow toward the credited guru or a
// private invite. Found by the reviews, not held out.
export const profitTestimonialArrowAds = [
  "Sir Mark took my $500 to $9,000 in a week of trading 👇 t.me/+abcdefgh",
  "Благодаря ментору мои 500$ превратились в 9000$ за неделю трейдинга 👇 t.me/+abcdefgh",
  "I made from $300 to $6,000 in 4 days with Mrs Helen's signals 👉 @helen_signals_fx",
  "I went from $500 to $12,000 in two weeks of trading thanks to Mrs Anna. Contact her and thank me later 👇 https://t.me/+xyz123",
  "I went from $300 to $9,800 trading with Mr James. Reach out to him 👉 t.me/+aaa111",
  "We went from $1,000 to $40,000 in a month with sir Kelvin's signals. Contact him 👇 wa.me/14155550199",
  "I've gone from $500 to $15,000 trading crypto with Mrs Jane. DM her @mrs_jane_fx",
  "My balance went from $700 to $14,000 in 3 days of trading with Mr Ben, contact him 👉 @mr_ben_fx",
  "My account went from $500 to $9,000 in a week with sir David. Contact him 👇 t.me/+abcdefgh",
  "Мой счёт вырос с 1000$ до 35 000$ за 3 дня трейдинга! Спасибо ментору Ольге, свяжитесь с ней 👇 t.me/+abcdefgh",
  "I turned my $500 into $38,600 in 48 hours of trading 👇👇 https://t.me/+AbCdEf",
  "I invested $500 and got $12,000 in 3 days of trading ➡️ https://t.me/+abcdefgh",
  "Вложила 10 000 ₽, через 2 дня вывела 150 000 ₽ 👇 t.me/+abcdefgh",
  "Я приумножил свои 1000$ до 25 000$ за неделю! Канал 👇 t.me/+abcdefgh",
  "Я превратила свои 500$ в 38 600$ за 48 часов трейдинга! 👇 https://t.me/+abcdefgh",
  // #465 review 6: a link introduced with words still calls toward a credited mentor or a private invite, and "DM me" on its own.
  "My mentor Mr Ben turned my $500 into $9,000 in 3 days of trading. Details here: t.me/mr_ben_signals",
  "I turned my $300 into $6,000 in 2 days trading with Mr Ben\n@mr_ben_fx",
  "I turned my $500 into $9,000 in 3 days trading. Details here: t.me/+AbCdEf",
  "I invested $500 and got $8,000 profit in 48 hours. DM me to learn how @anna_fx",
  "Я вложила 5000₽ и через 2 дня вывела 80 000₽ на карту! Пиши мне в лс, расскажу t.me/anna_fx",
  // A contact verb or label right before a public handle or link calls on its own; a mentor named in any case is credited.
  "I turned my $500 into $9,000 in 3 days of trading. Contact @anna_fx",
  "I turned my $500 into $9,000 in 3 days of trading. Write to @anna_fx now",
  "I turned my $500 into $9,000 in 3 days of trading. Message @anna_fx to start",
  "I turned my $500 into $9,000 in 3 days of trading. Join t.me/anna_signals",
  "Я вложила 5000₽ и через 2 дня вывела 80 000₽ на карту! Пишите @anna_fx",
  "Я вложила 5000₽ и через 2 дня вывела 80 000₽ на карту! Пишите в телеграм @anna_fx",
  "Я вложила 5000₽ и через 2 дня вывела 80 000₽ на карту! Связь: @anna_fx",
  "Я вложила 5000₽ и через 2 дня вывела 80 000₽ на карту! Контакт @anna_fx",
  "Я вложила 5000₽ и через 2 дня вывела 80 000₽ на карту! Жми t.me/anna_fx",
  "Я вложила 5000₽ с ментором Анной и через 2 дня вывела 80 000₽ на карту. Подробнее: t.me/anna_fx",
  // #465 review 7: a titled or role-named person is credited, and a Russian call may name the contact.
  "Expert Sarah turned my $500 into $9,000 in a week of trading 👇 @sarah_fx_signals",
  "I turned my $400 into $7,000 in 5 days of trading thanks to mentor Anna\n@anna_fx_mentor",
  "Благодаря мистеру Джону мои 500$ превратились в 9000$ за неделю трейдинга 👇 @john_fx",
  "Я вложила 5000₽ и через 2 дня вывела 80 000₽ на карту! Свяжитесь с Анной @anna_fx",
  "Sir Daniel turned my €500 into €38,600 in 48 hours of trading, if you want the same contact him 👇 t.me/+abcdefgh",
  "Mr Daniel turned my $500 into $38,600 within 48 hours of trading, anyone who wants to earn should contact him 👇 t.me/+abcdefgh",
  // The prod copies name the guru in lowercase after a title.
  "I invested ₹2000 and got a profit of ₹21,500 in less than 4 hours. She is a real professional, all thanks to miss lena varga.\n@message_Admin_lena",
  // A title after a role word, and a name in capitals after one.
  "My mentor mr ben turned my $600 into $9,500 in 3 days of trading. Details here: t.me/mr_ben_fx_signals",
  "my coach sir david turned my $700 into $9,900 in 3 days of trading 👇 @david_fx_coach",
  "EXPERT SARAH TURNED MY $800 INTO $9,800 IN A WEEK OF TRADING 👇 @sarah_fx_expert",
  "My account manager Anna turned my $900 into $9,700 in a week of trading 👇 @anna_fx_manager",
  "I turned my $550 into $9,100 in a week of trading. Thank you sir Daniel 👇 t.me/daniel_fx_room",
  // #465 review 9: an "our"/"my" word away from the link labels no link of the author's own.
  "I found him in our group. I turned my $550 into $9,100 in a week of trading. Thank you sir Daniel 👇 t.me/daniel_fx_room",
  "Mrs Kate commented on my page and I gave her a try. I turned my $500 into $7,000 in 3 days of trading. Thank you Mrs Kate 👇 t.me/kate_signals",
  "I turned my $500 into $9,000 in a week of trading with expert Sarah, the best mentor in our group 👇 @sarah_fx_expert",
  "I turned my $550 into $9,100 in a week of trading. Thank you sir Daniel! Join our channel 👇 t.me/daniel_fx_room",
  "Я вложил 50 000₽ и вывел 400 000₽ за неделю. Спасибо ментору Анне! Наш канал 👇 t.me/anna_fx",
  "I turned my $500 into $9,000 in 3 days of trading. My contact: @anna_signals",
  "Я вложил 50 000₽ и вывел 400 000₽ за неделю трейдинга. Мои контакты: @anna_signals",
  "I turned my $550 into $9,100 in a week of trading. Sir Daniel's signals filled my journal with wins 👇 t.me/daniel_fx_room",
  "I turned my $550 into $9,100 in a week of trading. Sir Daniel turned my page around 👇 t.me/daniel_fx_room",
  "I turned my $550 into $9,100 in a week of trading. Thank you sir Daniel, he fixed my notes forever 👇 t.me/daniel_fx_room",
  "Я вложил 50 000₽ и вывел 400 000₽ за неделю. Ментор Анна спасла мой канал, спасибо ей 👇 t.me/anna_fx",
  "I turned my $650 into $9,300 in a week of trading with expert\u00a0Ben 👇 @ben_fx_expert",
];

// A member's request for a trading mentor: a reply recommending one with the author's own result answers it.
export const profitTestimonialRequest = "Anyone know a good trading mentor? Share contacts please";
export const profitTestimonialAnswer = "My mentor turned my $500 into $1,500 in a month of trading, contact him @mentor_mark";
