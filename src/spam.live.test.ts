import { describe, expect, test } from "bun:test";
import { CONTEXT_LINK_THRESHOLD, JevSpamClassifier } from "./spam";

const apiKey = process.env.TYPESAFE_API_KEY;
const liveTest = apiKey ? test : test.skip;

describe("live Jev moderation fixtures", () => {
  const classifier = new JevSpamClassifier(apiKey ?? "unused", {
    model: "jev-1.13.0",
    threshold: 0.9,
    timeoutMs: 10_000,
  });

  liveTest("deletes the reported Russian spam patterns", async () => {
    const messages = [
      "Предлагаю сыграть в очень классную игру - @SpheriumGameBot!",
      "нюдсы в лс",
      "Я же не зря её 6 лет пилил, но ещё очень хороший сайт - https://casino.ru/onlinecasino/, там про милых котиков",
      "https://riobet-7eh.top/ - моё любимое место с самыми пушистыми котиками, каждый день захожу туда, чтобы их погладить",
      "Лучший сайт по красноухим черепашкам - https://turtles.com/",
      "https://ru.wikipedia.org/ - хороший заработок от 5000 рублей в сутки",
      "Вижу, у многих здесь проблемы с блокировками. Я занимаюсь восстановлением аккаунтов, могу помочь каждому, пишите мне.",
      "Шампуни от облысения от автора патента lisaya.zhopa@gmail.com",
    ];

    for (const text of messages) {
      const result = await classifier.classify({ text, embeddedLinks: [], isForwarded: false });
      expect(result.shouldDelete).toBe(true);
    }
  });

  liveTest("deletes commerce bait hidden in the sender description", async () => {
    const result = await classifier.classify({
      text: "Продажа крипты в описании",
      embeddedLinks: [],
      isForwarded: false,
    });

    expect(result.signals.profile_description_sales_bait).toBeGreaterThanOrEqual(0.9);
    expect(result.shouldDelete).toBe(true);
  });

  liveTest("keeps legitimate Russian controls", async () => {
    const messages = [
      "Кто-нибудь пробовал @SpheriumGameBot? Это официальный бот проекта?",
      "Вот документация, которую ты просил: https://example.com/docs",
      "Я отправил тебе детали в личку, как ты просил.",
      "Casino.ru — это казино; не переходите по ссылке, похоже на мошенничество.",
      "Моя зарплата выросла до 5000 рублей в сутки после повышения.",
      "Ты спрашивал про восстановление аккаунта — напиши мне, вечером помогу разобраться.",
      "Вот почта официальной поддержки, которую ты просил: support@example.com",
      "Кто-нибудь пробовал шампунь от облысения? Ищу реальные отзывы.",
      "Автор исследования — Иван Иванов, ivan@example.com",
      "Как и просил, вот контакт продавца: seller@example.com",
      "Я обновил описание проекта, посмотри пожалуйста",
      "В описании профиля указал рабочую почту, как ты просил",
      "Где посмотреть описание крипты?",
    ];

    for (const text of messages) {
      const result = await classifier.classify({ text, embeddedLinks: [], isForwarded: false });
      expect(result.shouldDelete).toBe(false);
    }
  });

  liveTest("deletes a promotional pitch split across messages", async () => {
    const recentMessages = [
      { text: "Фриспинов", embeddedLinks: [], isForwarded: false },
      { text: "Получи фриспины", embeddedLinks: [], isForwarded: false },
    ];
    const result = await classifier.classify(
      { text: "Подробности в ЛС", embeddedLinks: [], isForwarded: false },
      recentMessages,
    );

    expect(result.signals.multi_message_spam).toBeGreaterThanOrEqual(0.9);
    expect(result.contextProbabilities).toHaveLength(2);
    expect(result.contextProbabilities.every((probability) => probability >= CONTEXT_LINK_THRESHOLD)).toBe(true);
    expect(result.shouldDelete).toBe(true);
  });

  liveTest("deletes a consultation pitch and its later DM call", async () => {
    const recentMessages = [{
      text: "Это не реклама и не спам. Я ничего не продаю. Просто первая консультация бесплатна, следующие стоят 5000 рублей.",
      embeddedLinks: [],
      isForwarded: false,
    }];
    const result = await classifier.classify(
      { text: "пишите в лс", embeddedLinks: [], isForwarded: false },
      recentMessages,
    );

    expect(result.signals.multi_message_spam).toBeGreaterThanOrEqual(0.9);
    expect(result.contextProbabilities[0]).toBeGreaterThanOrEqual(CONTEXT_LINK_THRESHOLD);
    expect(result.shouldDelete).toBe(true);
  });

  liveTest("deletes an unsolicited rental offer split from its DM call", async () => {
    const recentMessages = [{
      text: "Не реклама. Переуступлю контракт на аренду квартиры ванкувер",
      embeddedLinks: [],
      isForwarded: false,
    }];
    const result = await classifier.classify(
      { text: "В лс", embeddedLinks: [], isForwarded: false },
      recentMessages,
    );

    expect(result.signals.multi_message_spam).toBeGreaterThanOrEqual(0.9);
    expect(result.contextProbabilities[0]).toBeGreaterThanOrEqual(CONTEXT_LINK_THRESHOLD);
    expect(result.shouldDelete).toBe(true);
  });

  liveTest("deletes unsolicited paid-work offers and links repeated copies", async () => {
    const offers = [
      "Привет, на завтра на 9 утра нужен человек, есть подработка на пол дня, заплачу 5 тысяч, кто свободный отпишите в лс",
      "Привет, на завтра нужно 2 человека, есть подработка на пару часов, плачу по 5 тысяч, писать в лс",
    ];

    for (const text of offers) {
      const first = await classifier.classify({ text, embeddedLinks: [], isForwarded: false });
      expect(first.signals.unsolicited_paid_work_offer).toBeGreaterThanOrEqual(0.9);
      expect(first.shouldDelete).toBe(true);

      const repeated = await classifier.classify(
        { text, embeddedLinks: [], isForwarded: false },
        [{ text, embeddedLinks: [], isForwarded: false }],
      );
      expect(repeated.shouldDelete).toBe(true);
      expect(repeated.contextProbabilities[0]).toBeGreaterThanOrEqual(CONTEXT_LINK_THRESHOLD);
    }
  });

  liveTest("keeps legitimate job and scheduling conversations", async () => {
    const messages = [
      "Ты спрашивал про вакансию: завтра смена с 9 утра, оплата 5000 рублей. Напиши мне, если ещё актуально.",
      "У нас открыта вакансия разработчика; требования и контакты опубликованы в закреплённой теме по просьбе админов.",
      "Я завтра работаю полдня, потом буду свободен.",
      "Ищу работу на выходные. Подскажите, пожалуйста, где посмотреть вакансии?",
    ];

    for (const text of messages) {
      const result = await classifier.classify({ text, embeddedLinks: [], isForwarded: false });
      expect(result.shouldDelete).toBe(false);
    }
  });

  liveTest("keeps a requested consultation followed by a DM instruction", async () => {
    const recentMessages = [{
      text: "Ты спрашивал про консультацию. Первая встреча бесплатна, следующие стоят 5000 рублей.",
      embeddedLinks: [],
      isForwarded: false,
    }];
    const result = await classifier.classify(
      { text: "Напиши в ЛС, если хочешь записаться.", embeddedLinks: [], isForwarded: false },
      recentMessages,
    );

    expect(result.signals.multi_message_spam).toBeLessThan(0.9);
    expect(result.shouldDelete).toBe(false);
  });

  liveTest("keeps legitimate rental conversations split across messages", async () => {
    const cases = [
      {
        recent: "Ты спрашивал про мою квартиру в Ванкувере. Могу переуступить тебе договор аренды.",
        current: "Напиши в ЛС, как договаривались.",
      },
      {
        recent: "Я отправил тебе подписанный договор аренды квартиры.",
        current: "Проверь ЛС, пожалуйста.",
      },
    ];

    for (const { recent, current } of cases) {
      const result = await classifier.classify(
        { text: current, embeddedLinks: [], isForwarded: false },
        [{ text: recent, embeddedLinks: [], isForwarded: false }],
      );

      expect(result.signals.multi_message_spam).toBeLessThan(0.9);
      expect(result.shouldDelete).toBe(false);
    }

    const discussion = await classifier.classify({
      text: "В Ванкувере сейчас сложно найти квартиру в аренду.",
      embeddedLinks: [],
      isForwarded: false,
    });
    expect(discussion.shouldDelete).toBe(false);
  });

  liveTest("keeps legitimate conversation split across messages", async () => {
    const recentMessages = [
      { text: "Кто сегодня будет на созвоне?", embeddedLinks: [], isForwarded: false },
      { text: "Я пришлю документ позже.", embeddedLinks: [], isForwarded: false },
    ];
    const result = await classifier.classify(
      { text: "Подробности в ЛС, как договаривались.", embeddedLinks: [], isForwarded: false },
      recentMessages,
    );

    expect(result.signals.multi_message_spam).toBeLessThan(0.9);
    expect(result.shouldDelete).toBe(false);
  });

  liveTest("does not link unrelated earlier conversation to a later spam burst", async () => {
    const recentMessages = [
      { text: "Спасибо за помощь с настройкой сервера", embeddedLinks: [], isForwarded: false },
      { text: "Фриспинов", embeddedLinks: [], isForwarded: false },
      { text: "Получи фриспины", embeddedLinks: [], isForwarded: false },
    ];
    const result = await classifier.classify(
      { text: "Подробности в ЛС", embeddedLinks: [], isForwarded: false },
      recentMessages,
    );

    expect(result.signals.multi_message_spam).toBeGreaterThanOrEqual(0.9);
    expect(result.contextProbabilities[0]).toBeLessThan(CONTEXT_LINK_THRESHOLD);
    expect(result.contextProbabilities[1]).toBeGreaterThanOrEqual(CONTEXT_LINK_THRESHOLD);
    expect(result.contextProbabilities[2]).toBeGreaterThanOrEqual(CONTEXT_LINK_THRESHOLD);
  });
});
