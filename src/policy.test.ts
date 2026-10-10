import { expect, test } from "bun:test";
import { APPROVED_MODEL, APPROVED_PROMPT_SHA256, effectiveModel } from "./policy";
import { JevSpamClassifier, SPAM_QUESTIONS } from "./spam";
import { cacheFingerprint } from "./spam-cache";
import type { Message } from "grammy/types";
test("old production alias resolves atomically to a new cache identity", () => {
  expect(effectiveModel("laya-jev-ckpt-v2")).toBe(APPROVED_MODEL);
  expect(effectiveModel("other-model")).toBe("other-model");
  expect(APPROVED_PROMPT_SHA256).toBe("b74877bf4b066b8858526cdccc7fdb89746c453db8a86dd7642156a84933ccec");
  const raw = { message_id: 1, date: 1, chat: { id: -1, type: "group", title: "test" }, text: "long enough synthetic content" } as Message;
  const input = { text: raw.text!, embeddedLinks: [], isForwarded: false };
  expect(cacheFingerprint(raw, "user:1", input, 0, "laya-jev-ckpt-v2", .8, true)).not.toBe(cacheFingerprint(raw, "user:1", input, 0, APPROVED_MODEL, .8, true));
});
test("approved classifier fails open on old model response during rollout", async () => {
  const classifier = new JevSpamClassifier("fixture", { model: APPROVED_MODEL, threshold: .8, timeoutMs: 1000, fetch: async () => Response.json({ model: "laya-jev-ckpt-v2", answers: Object.fromEntries(Object.keys(SPAM_QUESTIONS).map(key => [key, { type: "noul", noul: .99 }])) }) });
  await expect(classifier.classify({ text: "synthetic", embeddedLinks: [], isForwarded: false })).rejects.toThrow("identity mismatch");
});
