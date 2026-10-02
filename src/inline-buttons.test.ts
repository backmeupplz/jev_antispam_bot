import { expect, test } from "bun:test";
import type { Message } from "grammy/types";
import { inlineUrlButtons, BUTTON_LIMITS } from "./inline-buttons";
import { toModerationMessage } from "./message";
import { currentTelegramLinks } from "./telegram-preview";
import { buttonCases, buttonMessage } from "./fixtures/inline-buttons";
const message = (reply_markup: unknown) => ({ ...buttonMessage(buttonCases[0]!), reply_markup }) as Message;

test("URL-bearing Bot API variants retain labels, not actions or login identity", () => {
  const result = inlineUrlButtons(message({ inline_keyboard: [[
    { text: "Site", url: "http://example.invalid/path" },
    { text: "Mention", url: "tg://user?id=123" },
    { text: "Login", login_url: { url: "https://example.invalid/login", bot_username: "private", request_write_access: true, forward_text: "Not current label" } },
    { text: "App", web_app: { url: "https://example.invalid/app" } },
    { text: "Callback", callback_data: "https://t.me/not_a_link" },
    { text: "Pay", pay: true }, { text: "Copy", copy_text: { text: "https://t.me/not_a_link" } },
  ]] }));
  expect(result).toEqual([
    { kind: "url", text: "Site", url: "http://example.invalid/path" },
    { kind: "url", text: "Mention", url: "tg://user?id=123" },
    { kind: "login_url", text: "Login", url: "https://example.invalid/login" },
    { kind: "web_app", text: "App", url: "https://example.invalid/app" },
  ]);
});

test("malformed keyboards and unsupported targets are ignored without throwing", () => {
  for (const markup of [undefined, null, [], "bad", {}, { inline_keyboard: {} }, { inline_keyboard: [null, 42, [null, [], {}, { text: 1, url: "https://t.me/example" }, { text: "bad", login_url: null }, { text: "bad", url: 4 }, { text: "bad", url: "javascript:alert(1)" }, { text: "bad", web_app: { url: "http://example.invalid" } }, { text: "bad", url: "https://t.me/with space" }]] }]) {
    expect(inlineUrlButtons(message(markup))).toEqual([]);
    expect(toModerationMessage(message(markup))?.text).toBe(buttonCases[0]!.text);
  }
});

test("bounded count, scan, labels and exact destinations; no truncation into fetchable targets", () => {
  const button = { text: "x".repeat(500), url: "https://t.me/example" };
  expect(inlineUrlButtons(message({ inline_keyboard: [[button, button]] }))).toEqual([{ kind: "url", text: "x".repeat(128), url: button.url }]);
  expect(inlineUrlButtons(message({ inline_keyboard: [Array.from({ length: 200 }, (_, i) => ({ text: String(i), url: button.url }))] }))).toHaveLength(BUTTON_LIMITS.count);
  expect(inlineUrlButtons(message({ inline_keyboard: [[...Array(100).fill(null), button]] }))).toEqual([]);
  const overlong = message({ inline_keyboard: [[{ text: "bad", url: "https://t.me/example?" + "x".repeat(600) }]] });
  expect(inlineUrlButtons(overlong)).toEqual([]);
  expect(currentTelegramLinks(overlong)).toEqual([]);
});

test("current button destinations share deduplication/cap with body links, never source buttons", () => {
  const raw = message({ inline_keyboard: [[{ text: "same", url: "https://t.me/Example?start=ignored" }, { text: "next", url: "https://t.me/second" }, { text: "third", url: "https://t.me/third" }, { text: "external", url: "https://example.invalid" }]] });
  Object.assign(raw, { text: "https://t.me/example", entities: [{ type: "text_link", offset: 0, length: 1, url: "https://t.me/example" }], reply_to_message: message({ inline_keyboard: [[{ text: "source", url: "https://t.me/source" }]] }) });
  expect(currentTelegramLinks(raw)).toEqual(["https://t.me/example", "https://t.me/second"]);
  const normalized = toModerationMessage(raw)!;
  expect(normalized.embeddedLinks).toEqual(["https://t.me/example"]);
  expect(normalized.inlineButtons?.map(b => b.text)).toEqual(["same", "next", "third", "external"]);
  expect(normalized.preview?.[0]?.inlineButtons).toEqual([{ kind: "url", text: "source", url: "https://t.me/source" }]);
});
