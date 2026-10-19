// #142: the kept single-send USDT ask (scored 0.7404) and SYNTHETIC held-out paraphrases and controls.
export const cryptoTradeIncident = "Всем привет, есть кто продаёт усдт? Напишите, договоримся.";

// Wording that is not in the rule text: other assets, slang, lookalike letters, RU and EN.
export const cryptoTradeParaphrases = [
  "Добрый вечер! Кто-нибудь продаст тезер? Пишите в личку",
  "Куплю USDT TRC20 в любом объёме, оплата на карту, пишите в лс",
  "Продам крипту по хорошему курсу, обращайтесь в личные сообщения",
  "Ищу продавца юсдт, нужно 300-500 штук, договоримся по цене",
  "Народ, у кого можно купить usdt за наличные? Отпишитесь",
  "Обменяю рубли на USDT, кому интересно — в лс",
  "Нужно поменять юсдт на рубли, кто поможет — пишите",
  "Куплю битки, крупный объём, связь в лс",
  "кто может обменять доллары на крипту? напишите в лс, договоримся",
  "Есть кто прoдаёт USDТ? Пишитe, дoгoвoримся",
  "Всем хорошего дня) кто готов продать 1000 юсдт по нормальному курсу? в личку",
  "💵 USDT 💵\nКуплю / продам\nВ любом объёме, пишите",
  "Anyone selling USDT? DM me, good rate",
  "WTB 1000 USDT, paying cash in person",
  "Looking to sell some BTC, message me if interested",
  "Hi all, who sells tether here? Text me",
  "Who wants to buy ETH? I have 2 ETH, hit me up",
  "I can exchange your dollars to USDT at the best rate, contact @fastswap_ex",
];

export const cryptoTradeControls = [
  // Genuine questions with no deal cue, and venue questions.
  "Где лучше продать биткоин, на бирже или через P2P? Подскажите",
  "Как купить USDT за рубли без комиссии? Напишите, кто знает",
  "Кто знает, где купить usdt по нормальному курсу?",
  "Есть кто продаёт usdt? Хочу понять, какой сейчас реальный курс на P2P",
  "Кто-нибудь продавал USDT через Bybit P2P? Как там с блокировками карт?",
  "Where can I buy USDT with a bank card? Any tips?",
  "How do I sell my BTC for cash safely?",
  // Market and price talk, and the author's own past or hedged trades.
  "Курс USDT вырос до 98, продавцы на P2P подняли цены",
  "Вчера продал USDT на Bybit P2P по 96, всё прошло нормально",
  "Я куплю биток, если упадёт до 60к, а пока жду",
  "I'd rather buy BTC on the dip than chase the pump",
  "BTC sellers look exhausted, buyers are stepping in at $78K",
  "Сбер с 1 декабря позволит покупать и продавать BTC и USDT прямо в приложении",
  // Goods paid in crypto are a classified ad for the goods, not a crypto trade.
  "Продам iPhone 13, можно оплату в USDT, пишите в лс",
  "Куплю ноутбук за USDT, пишите в личку",
  "Selling my bike, accept BTC or cash, DM me",
  // Warnings, reports and doubts about such asks.
  "Осторожно! В лс пишут люди, которые 'покупают USDT по выгодному курсу', это мошенники",
  "Админ, удалите, опять кто-то продаёт усдт в лс",
  "Мне в личку написали: куплю usdt по 100, договоримся. Это нормально?",
  "Не продавайте USDT незнакомцам, которые пишут в лс — потом карту заблокируют",
  "Never sell crypto to strangers who DM you",
  "Мне предлагают купить usdt по 90 в личке, это нормальный курс?",
  "Иван Петров: Куплю USDT в любом объёме, пишите в лс",
  "Кто продаёт USDT в лс — это скам, не ведитесь",
  // Addressed to one person.
  "@vasya_crypto, продашь usdt по курсу? напиши",
  "Ты вчера спрашивал, кто продаёт usdt — у меня есть, напиши",
];

// A member's question and an answer to it with a deal cue: a requested answer, not an ad.
export const cryptoTradeRepliedAnswers = [
  { question: "Кто продаст 200 usdt?", answer: "Могу продать 200 usdt по 95, напиши в лс" },
  { question: "Anyone selling USDT here?", answer: "I can sell you some USDT at a good rate, DM me" },
];
