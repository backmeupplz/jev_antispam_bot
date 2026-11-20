// #779: a code to type into Telegram search, behind free child-content wording, reported by a Jev Antispam Support member
// (Nov 20). No link, handle or button. The incident is the reported text with its search line sent four times; the live model
// scored it 0.8908 standalone and 0.7853 after one context message. The other ads are SYNTHETIC wordings of the same shape.
const searchLine = "🍃 В п̃oо𝚞́𝚜̃𝚔𝚎 PLG135";
export const searchCodeBaitIncident = `🔮 ДẼЕТ S̃K0E БEС̇П̂ЛӒӒTH0 🍇\n${searchLine}\n${searchLine}\n${searchLine}\n${searchLine}\nbaby`;

export const searchCodeBaitAds = [
  "🔮 ДẼЕТ S̃K0E БEС̇П̂ЛӒӒTH0 🍇\n🍃 В п̃oо𝚞́𝚜̃𝚔𝚎 PLG135",
  "🌸 Д̃ЕТ̇СК0Е Б̂ЕСПЛ̈АТН0 🍓\n🍃 Ищu в п0uсkе KDZ407\nbaby",
  "🔮 ШК0Л̃ЬНӤЦЫ БЕСП̂ЛАТНО 🍇\n🍃 В пои̃ске PLG135",
  "🔮 F̃R̈EE B̂ABY C0NT̃ENT 🍇\n🍃 S̃ëarch PLG135 in Telegram",
  // The code in math letters.
  "🔮 ДẼЕТ S̃K0E БEС̇П̂ЛӒӒTH0 🍇\n🍃 В п̃oо𝚞́𝚜̃𝚔𝚎 𝙿𝙻𝙶𝟷𝟹𝟻",
  // Plain wording.
  "Детское бесплатно. В поиске PLG135",
  "🔞 Порно бесплатно 🍓 ищи в поиске: XQ7741",
  "DETSK0E BESPLATN0 🍇 v poiske PLG135 baby",
  "Free p0rn, search XXV2024",
  // "18+" names content only next to a content word (fifth review).
  "18+ контент бесплатно 🔞 ищи XQ7741",
  // A giveaway verb never excuses "детское видео" (sixth review).
  "Раздаю детское видео бесплатно, ищи PLG135",
  // The code ends a sentence; the content is named as video.
  "Детское бесплатно. В поиске PLG135.",
  "Детское видео бесплатно, в поиске PLG135",
  // Minors named as content, and "ЦП" beside the free word (seventh review).
  "Видео школьниц бесплатно, в поиске PLG135",
  "ЦП бесплатно 🍓 ищи XQ7741",
  // A "не" away from the free word, a resolution, "взрослое" with no price and "процесс" excuse nothing (tenth review).
  "ЦП бесплатно, не пропусти! Ищи XQ7741",
  "Бесплатно ЦП, не пропусти. Ищи XQ7741",
  "ЦП бесплатно, процесс простой: ищи XQ7741",
  "Детское бесплатно 1080p. В поиске PLG135",
  "Детское бесплатно. В поиске PLG135 1080p",
  "Детское бесплатно. Для взрослых тоже. В поиске PLG135",
  "ЦП бесплатно не пропусти! Ищи XQ7741",
  "ЦП бесплатно 🍓 не упусти, ищи XQ7741",
  "Детское бесплатно, взрослое 18+. В поиске PLG135",
  "ЦП бесплатно никто не узнает, ищи XQ7741",
  "Детское бесплатно, взрослое 18 лет. В поиске PLG135",
  "Видео со школьницами бесплатно, ищи PLG135",
  // The content and the free word on separate lines or sentences.
  "🔞 ДЕТСКОЕ ВИДЕО 🔞\nБЕСПЛАТНО\nв поиске PLG135",
  "Порно. Бесплатно. Ищи XQ7741",
  // The sample half disguised: two disguised words and a plain cue, or plain wording with only the cue disguised; a dash
  // before the code (eighth review).
  "🔮 ДẼЕТ S̃K0E БEС̇П̂ЛӒӒTH0 🍇\n🍃 В поиске PLG135\nbaby",
  "🔮 ДЕТСКОЕ БЕСПЛАТНО 🍇\n🍃 В п̃oо𝚞́𝚜̃𝚔𝚎 PLG135\nbaby",
  "Детское бесплатно 🍓 в поиске — PLG135",
  // Punctuation between "детское" and "бесплатно", the other order, and a zero in the Cyrillic word (ninth review); a spam
  // hook or a word that only starts like a giveaway (tenth review).
  "Детское. Бесплатно. В поиске PLG135",
  "🔥 РАЗДАЧА 🔥\nДетское бесплатно\nВ поиске PLG135",
  "Детское бесплатно. Продажа не нужна, в поиске PLG135",
  "БЕСПЛАТНО ДЕТСКОЕ!!! В поиске PLG135",
  "ДЕТСКОЕ!!! БЕСПЛАТНО!!! В поиске PLG135",
  "Бесплатно детское. В поиске PLG135",
  "ДЕТСК0Е БЕСПЛАТНО\nВ поиске PLG135",
  // An invisible character inside the code, and a zero inside "видео" (eleventh review).
  `🔮 ДẼЕТ S̃K0E БEС̇П̂ЛӒӒTH0 🍇\n🍃 В п̃oо𝚞́𝚜̃𝚔𝚎 PLG\u200b135\nbaby`,
  "ДЕТСКОЕ БЕСПЛАТНО\nВ ПОИСКЕ PLG\u200b135",
  "ДЕТСКОЕ БЕСПЛАТНО\nВ ПОИСКЕ PLG\u00ad135",
  "ДЕТСКОЕ БЕСПЛАТНО\nВ ПОИСКЕ PLG\u2060135",
  "ДЕТСКОЕ ВИДЕ0 БЕСПЛАТНО\nИщи PLG135",
  // "интим" as a whole word, and an age never excuses "детское видео".
  "Интим бесплатно, ищи XQ7741",
  "Детское видео бесплатно до 14 лет, ищи PLG135",
  "Малолетки ф0т0 бесплатно, ищи PLG135",
  "ДЕТСКОЕ БЕСПЛАТНО\nВ ПОИСКЕ PLG\u034f135",
  // An age outside a ticket notice, "интимн…" before a content word, a plain word between the disguised cue and the code, and
  // a giveaway word added to the disguise (eleventh review, second round).
  "ДЕТСКОЕ БЕСПЛАТНО до 14 лет\nВ поиске PLG135",
  "Детское бесплатно, девочки до 12 лет. Ищи PLG135",
  "ДЕТСКОЕ БЕСПЛАТНО детям до 14\nищи PLG135",
  "ДЕТСКОЕ БЕСПЛАТНО до 14 лет\nВ п̃oо𝚞́𝚜̃𝚔𝚎 PLG135",
  "Интимное видео бесплатно, ищи PLG135",
  "Интимные фото бесплатно! В поиске PLG135",
  "🔮 ДẼЕТ S̃K0E БEС̇П̂ЛӒӒTH0 🍇\n🍃 В п̃oо𝚞́𝚜̃𝚔𝚎 тг: PLG135",
  "🔮 ДẼЕТ S̃K0E БEС̇П̂ЛӒӒTH0 дарю 🍇\n🍃 В п̃oо𝚞́𝚜̃𝚔𝚎 PLG135\nbaby",
  "🔮 ДẼЕТ S̃K0E БEС̇П̂ЛӒӒTH0 любой размер 🍇\n🍃 В п̃oо𝚞́𝚜̃𝚔𝚎 PLG135\nbaby",
  // A ticket word that sells no ticket, and a giveaway word on a lookalike-only disguise (third round).
  "ДЕТСКОЕ БЕСПЛАТНО до 14 лет\nВходи: в поиске PLG135",
  "ДЕТСКОЕ БЕСПЛАТНО до 14 лет, вход свободный\nВ поиске PLG135",
  "ДЕТСКОЕ БЕСПЛАТНО детям до 12. Без покупки!\nИщи PLG135",
  "Детское бесплатно до 14 лет! Экскурсия\nИщи PLG135",
  "ДEТCKOE БECПЛATHO дарю\nВ пoиcкe PLG135",
  "ДEТCKOE БECПЛATHO куплю\nВ пoиcкe PLG135",
  "Интимное видео — бесплатно! Ищи PLG135",
  "Бесплатно: интимные фото. В поиске PLG135",
  "Интимные фото и видео бесплатно, ищи PLG135",
  "Интимное видео — бесплатно ищи PLG135",
  "Интимное видео: бесплатно в поиске PLG135",
  "Интимные фото — бесплатно 🔥 ищи PLG135",
];

// A promo code with no bait, giveaways that name what they give, styled or accented text, layout slips, and reports or admin
// requests that quote the ad.
export const searchCodeBaitControls = [
  "Промокод PLG135 даёт скидку 10% до конца месяца",
  "Ищите в поиске PLG135, это наш новый канал с расписанием",
  "Детское питание бесплатно, в поиске введите PLG135",
  "Отдам детские вещи бесплатно, ищите AB12 на Авито",
  "𝐒𝐚𝐥𝐞 𝐭𝐨𝐝𝐚𝐲, 𝐜𝐨𝐝𝐞 SALE20",
  "за́мок и замо́к — разные слова, а код урока AB12",
  "Скинул отчёт в Telegramе, рейс SU1234 задерживается",
  "Купил iPhoneы для всех, модель A2890",
  "П̃Р̃И̃В̃Е̃Т̃ В̃С̃Е̃М̃ Д̃Р̃У̃З̃Ь̃Я̃, как дела? Рейс SU1234",
  "Осторожно, спам: «🔮 ДẼЕТ S̃K0E БEС̇П̂ЛӒӒTH0 🍇 В п̃oо𝚞́𝚜̃𝚔𝚎 PLG135»",
  "Админ, удали пожалуйста: 🔮 ДẼЕТ S̃K0E БEС̇П̂ЛӒӒTH0 🍇 В п̃oо𝚞́𝚜̃𝚔𝚎 PLG135",
  // Ukrainian with a Latin i, Greek unit signs and physics notation, names with a zero, a stress lesson, layout slips, and
  // "ср" (Wednesday), which folds to a Latin "cp". Found by the review of the first draft.
  "Привiт! Хто летить завтра рейсом PS101 до Варшави? Можу взяти дiтей, мiсце є",
  "Дякую всiм! Нiчого не знайшов, замовив ESP32 на Алiекспресi",
  "Поставь на ESP32 конденсатор 100µF, резистор 10kΩ и дроссель 47µH",
  "Use NE555 with 10kΩ, 4.7kΩ and 100µF",
  "Задача из PHYS101: найдите Δv если Δx = 5 м и Δt = 2 с",
  "Купил iPhoneы и AirPodsы, ещё MacBookи в подарок, модель A2890 и SM24",
  "Баг P0 в релизе v0.3, формат A0 не печатается, тикет BUG123",
  "Layer0 airdrop: bridge USDT via TRC20, then L0 and v0 contracts",
  "Ударе́ние: зво́нит или звони́т? Пра́вильно звони́т, догово́р. Учебник RUS101",
  "Бесплатная доставка в пн и ср. Введите SALE20 при заказе",
  // Tatar, Kazakh and Chuvash typed with Latin letters for ә, ҫ, ӑ; brands glued to prepositions; hex constants; a photo album
  // given away. Found by the second review.
  "Сəлам! Бүген кичен рəхмəт əйтəм, поезд EK125 белəн кайтам",
  "Сəлеметсiз бе! Сəлем, рəхмет. Бiз ертең KC123 рейсiмен ұшамыз",
  "Тăван çĕршыв, кăмăллă çынсем! Паян рейс SU1234 тăрăх килетĕп",
  "Скинул вTelegramе, потом вWhatsAppе и наAvitoшке, артикул WB12345",
  "Регистры 0xC0DE, 0xB0BA и 0xD0DO у STM32 странные",
  "Отдам бесплатно, ищи PLG135, детское фото альбом",
  // Bashkir with a Latin h for һ (third review).
  "Иҫәнмеhегеҙ! Барыhы ла ниhаять ҡайтты, рейс SU1234 менән",
  // A struck-through old price, gamer leetspeak, a parents' giveaway and an age limit on an ordinary promo code (fourth review).
  "Продаю видеокарту RTX3060! Цена б̶ы̶л̶а̶ 3̶0̶0̶0̶0̶ 2̶8̶0̶0̶0̶, теперь 25000",
  "Ребята, кто играет? L0L, n0pe, g0t it — сервер CS16",
  "Отдам детское бесплатно, размер 98-104. В поиске введите LOT123 на Юле",
  "Первое занятие бесплатно, курсы вождения 18+, при записи введите PROMO50",
  // Other giveaway verbs and wordings, and other price-styling marks (fifth review).
  "Отдаём детское бесплатно, размер 98-104. В поиске введите LOT123 на Юле",
  "Раздаю детское бесплатно, в поиске введите LOT123 на Авито",
  "Дарю детское бесплатно, ищи LOT123",
  "Отдам всё детское бесплатно, в поиске введите LOT123",
  "Отдам: детское бесплатно, в поиске LOT123",
  "Продаю GTX1080! Ц̿е̿н̿а̿ б̿ы̿л̿а̿ 1̿5̿0̿0̿0̿, теперь 12000",
  "Отдам ноутбук ASUS X515, ц͟е͟н͟а͟ 4͟0͟0͟0͟0͟, сейчас 32000, торг",
  "Монитор LG 27GL850 за 1͓̽8͓̽0͓̽0͓̽0͓̽ 15000, самовывоз",
  // "18+" before a longer word that starts like a content word (sixth review).
  "Курсы вождения 18+ видеоуроки бесплатно, при записи введите PROMO50",
  "Фотошкола 18+ фотосессии бесплатно, введите PROMO50",
  // "ЦП" as a CPU, minors in camp and ticket notices, "Lolipop", the free word in another sentence, and lenny faces (seventh review).
  "Какой ЦП взять под RTX4070? Бесплатно никто не посоветует, ищи RTX4070 обзоры",
  "Видюху не бери, ЦП грузится на 100%. Ищи RTX3060 б/у, бесплатно никто не отдаст",
  "Бесплатный летний лагерь для школьниц! В поиске: CAMP2025",
  "Вход для несовершеннолетних бесплатный, билеты ищите: MUS2024",
  "Find GTX1080 drivers here, free. Lolipop theme is cute",
  "Купил RTX4090 ( ͡° ͜ʖ ͡°) ( ͡ᵔ ͜ʖ ͡ᵔ )",
  "Для школьниц видеоуроки бесплатно, ищи MATH2024",
  "Несовершеннолетним фотографировать бесплатно нельзя, ищи RULES24",
  // Fancy-text generators, Zalgo, kaomoji, IPA and math hats mark every letter; "ЦП видеокарта", "видео-уроки", and "детское"
  // as a thing given away or asked for in marketplace listings (eighth review).
  "S̾A̾L̾E̾ T̾O̾D̾A̾Y̾ F̾R̾E̾E̾ code SALE20",
  "С̾К̾И̾Д̾К̾И̾ С̾Е̾Г̾О̾Д̾Н̾Я̾ В̾С̾Е̾М̾, код SALE20",
  "Ṡ̤ä̤l̤ë̤ ẗ̤ö̤d̤ä̤ÿ̤, n̤ë̤ẅ̤ code SALE20",
  "Ч̴̛̝т̷͎̓о̶̼͝ з̵̙́а̸̫͛ б̷͎̓а̶̼͝г̵̙̈́ ERR404",
  "(▀̿Ĺ̯▀̿ ̿) (▀̿Ĺ̯▀̿ ̿) (▀̿Ĺ̯▀̿ ̿) новая RTX4090",
  "(ಠ_ಠ) ( ͡° ͜ʖ ͡°) (▀̿Ĺ̯▀̿ ̿) ¯\\_(ツ)_/¯ (ง̀-́)ง (̿▀̿ ̿Ĺ̯̿̿▀̿ ̿)̄ взял RTX4090",
  "Носовые гласные: [ɑ̃], [ɔ̃], [ɛ̃], [œ̃] — урок FR101",
  "Найдите х̂, у̂ и ẑ, если θ̂ = 0, задача MATH101",
  "Брат отдал бесплатно ЦП видеокарту и БП, драйвера в поиске GTX1060 не находятся",
  "ЦП видеокарта и материнка в сборе бесплатно, ищи RTX3060 на авито",
  "Курсы вождения 18+ видео-уроки бесплатно, при записи введите PROMO50",
  "Для школьниц видео-уроки бесплатно, ищи MATH2024",
  "Кресло детское, доставка бесплатно, на Озоне в поиске BRX123",
  "Отдам почти новое детское бесплатно, в поиске LOT123",
  "Детское: отдам бесплатно, размер 98. На Юле в поиске LOT123",
  "Есть бесплатно детское? Ищу для сына, в поиске Авито вбей LOT123",
  "Всё детское - бесплатно, взрослое по 100р, на Авито ищи LOT123",
  // IPA transcriptions, giveaways and marketplace listings that open with "Детское бесплатно", and a CPU given away (ninth review).
  "Носовые гласные: bon [bɔ̃], vin [vɛ̃], brun [bʁœ̃]. Урок FR101",
  "Free French lesson today: bon [bɔ̃], vin [vɛ̃]. Workbook FR101",
  "Транскрипция: pain [pɛ̃], bon [bɔ̃], урок FR101 бесплатно",
  "Детское бесплатно: одежда 98-104, на Юле в поиске LOT123",
  "Детское бесплатно отдаю, ищи LOT123",
  "Привет! Детское бесплатно отдам, размер 98. На Юле в поиске LOT123",
  "Бесплатно детское питание. В поиске PLG135",
  "Отдам ЦП бесплатно, на Авито ищи FX8350",
  "Отдам бесплатно ЦП, в поиске Авито введите LOT123",
  // Price lists, free meals, other marketplaces and pickup notes, and Portuguese nasal glides (tenth review).
  "Детское — бесплатно, взрослое — 300 ₽. При заказе на сайте введите FAMILY10",
  "Билеты на ёлку. Детское — бесплатно, взрослое — 500 ₽. Введите NY2025",
  // A price list without dashes, "ЦП бесплатно" in hardware talk or with a "не", and "№" read as a code (tenth review).
  "Билеты на ёлку. Детское бесплатно, взрослое 500 ₽. Введите NY2025",
  "Детское бесплатно, взрослое 300 ₽. При заказе на сайте введите FAMILY10",
  "Сколько стоит вход? Детское бесплатно, взрослое 500. Ищите в поиске: NY2025",
  "Детское бесплатно, остальное 300 руб. Введите NY2025",
  "Детское бесплатно, взрослое от 500. Введите NY2025",
  "Видюху не бери, ЦП бесплатно никто не отдаст. Ищи RTX3060 б/у",
  "ЦП бесплатно не отдадут, ищи RTX3060",
  // CPU models answer a CPU thread (review of baba827).
  "ЦП бесплатно не найдёшь, ищи FX8350 на барахолке",
  "ЦП бесплатно тебе никто не даст, ищи FX6300, он за копейки",
  "Цп бесплатно не бывает) ищи FX6300 за 1000",
  "Детское бесплатно! Ищите №45 на доске",
  "Бесплатно детское! Забирайте, в поиске LOT123",
  "Бесплатное детское? Нет, ищи LOT123",
  "Детское бесплатно, забирайте сами. Ищите на OLX в поиске LOT123",
  "Детское бесплатно, самовывоз. Kufar, в поиске LOT123",
  "Детское бесплатно, доставка Ozon, в поиске BRX123",
  "Детское бесплатно, на WB в поиске BRX123",
  "Детское бесплатное питание до 3 лет: при записи введите KIDS25",
  "Lesson5: Portuguese não [nɐ̃w̃], mãe [mɐ̃j̃], bom [bõw̃]. Workbook PT101",
  // "интимн…" is hygiene, haircuts and medicine; Russian typed with Latin lookalikes in a sale ad; an admission age (eleventh review).
  "Средства для интимной гигиены бесплатно для участниц. Введите MAMA10 при заказе",
  "Интимные стрижки бесплатно до конца месяца, введите BARBER25",
  "Консультация гинеколога по интимным вопросам бесплатно. Введите DOC2024 в форме записи",
  "Пpoдaм iPhone13 в xopoшeм cocтoянии, тopг",
  "Пpoдaм iPhone13, дocтaвкa бесплатно",
  "Детское бесплатно до 7 лет. Введите NY2025 при покупке",
  "Детское бесплатно детям до 7. Введите NY2025 при покупке",
  "Кyплю iPhone13 в xopoшeм cocтoянии",
  "Как удалить интимные фото из сети? Бесплатная консультация юриста, введите HELP24",
  "Бесплатный вебинар: как защитить интимные фото от утечек. Введите SAFE24",
  "Интимное видео слили? Бесплатно поможем, введите LAW2024",
  "Детское бесплатно до 7 лет, билеты на сайте. Введите NY2025",
  "Слили интимные фото — бесплатная консультация юриста, введите HELP24",
  "Интимные фото: бесплатная помощь юриста. Введите HELP24",
  "Шантажируют интимными фото — бесплатно поможем. Введите HELP24",
  "Интимные фото и видео: бесплатная юридическая помощь, введите HELP24",
  // "Интим не предлагать" is stock wording in rental and job ads, and a porn blocker fights what it names.
  "Интим не предлагать! Обучение бесплатно. Введите INVITE25 при регистрации",
  "Сдаю комнату, коммуналка бесплатно. Интим не предлагать. Ищите ID123456 на Циане",
  "Бесплатный блокировщик порно для детей: в поиске введи SAFE24",
  "Как бесплатно защитить ребёнка от порно? Поиск: KIDS2024 в AppStore",
  // One accidental mixed-script typo makes no Latin product name with a zero a second disguised word.
  "Пpивет! Продаю XB0X, пишите, введи AB123",
  "Наш сeрвер в T0P, введи CODE24",
  "Скидка на H0ME тариф, пoдключение бесплатно, код NET100",
  "Сeрвер B0T бесплатно AB123",
];
