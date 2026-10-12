import { expect, test } from "bun:test";
import { APPROVED_MODEL, APPROVED_PROMPT_SHA256, effectiveModel } from "./policy";
import { JevSpamClassifier, SPAM_QUESTIONS } from "./spam";
import { cacheFingerprint } from "./spam-cache";
import type { Message } from "grammy/types";
test("old production aliases resolve atomically to a new cache identity", () => {
  expect(APPROVED_MODEL).toBe("laya-jev-ckpt-v2-examples-85-83403c71");
  expect(effectiveModel("laya-jev-ckpt-v2")).toBe(APPROVED_MODEL);
  expect(effectiveModel("laya-jev-ckpt-v2-examples-856e52e3")).toBe(APPROVED_MODEL);
  expect(effectiveModel("other-model")).toBe("other-model");
  expect(APPROVED_PROMPT_SHA256).toBe("83403c71dcdb06854e38456abac6951e1073501491e1053f93d4d4cabb610757");
  const raw = { message_id: 1, date: 1, chat: { id: -1, type: "group", title: "test" }, text: "long enough synthetic content" } as Message;
  const input = { text: raw.text!, embeddedLinks: [], isForwarded: false };
  for (const old of ["laya-jev-ckpt-v2", "laya-jev-ckpt-v2-examples-856e52e3"])
    expect(cacheFingerprint(raw, "user:1", input, 0, old, .8, true)).not.toBe(cacheFingerprint(raw, "user:1", input, 0, APPROVED_MODEL, .8, true));
});
test("approved classifier fails open on old model responses during rollout", async () => {
  for (const old of ["laya-jev-ckpt-v2", "laya-jev-ckpt-v2-examples-856e52e3"]) {
    const classifier = new JevSpamClassifier("fixture", { model: APPROVED_MODEL, threshold: .8, timeoutMs: 1000, fetch: async () => Response.json({ model: old, answers: Object.fromEntries(Object.keys(SPAM_QUESTIONS).map(key => [key, { type: "noul", noul: .99 }])) }) });
    await expect(classifier.classify({ text: "synthetic", embeddedLinks: [], isForwarded: false })).rejects.toThrow("identity mismatch");
  }
});
