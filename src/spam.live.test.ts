import { describe, expect, test } from "bun:test";
import { JevSpamClassifier } from "./spam";

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
    ];

    for (const text of messages) {
      const result = await classifier.classify({ text, embeddedLinks: [], isForwarded: false });
      expect(result.shouldDelete).toBe(true);
    }
  });

  liveTest("keeps legitimate Russian controls", async () => {
    const messages = [
      "Кто-нибудь пробовал @SpheriumGameBot? Это официальный бот проекта?",
      "Вот документация, которую ты просил: https://example.com/docs",
      "Я отправил тебе детали в личку, как ты просил.",
      "Casino.ru — это казино; не переходите по ссылке, похоже на мошенничество.",
      "Моя зарплата выросла до 5000 рублей в сутки после повышения.",
    ];

    for (const text of messages) {
      const result = await classifier.classify({ text, embeddedLinks: [], isForwarded: false });
      expect(result.shouldDelete).toBe(false);
    }
  });
});
