import { expect, test } from "bun:test";
import { Api, GrammyError } from "grammy";
import { AUDIT_CHAT_ID, sendAuditReport, PostgresDeletionAudit } from "./audit-outbox";

test("product grammY transport fixes sink, HTML and disabled previews without keyboards", async () => {
  const calls: unknown[] = [];
  const api = new Api("123:fixture");
  api.config.use(async (_prev, method, payload, signal) => {
    calls.push({ method, payload }); expect(signal).toBeDefined();
    return { ok: true, result: { message_id: 1, date: 1, chat: { id: AUDIT_CHAT_ID, type: "group", title: "fixture" }, text: "fixture" } } as never;
  });
  await sendAuditReport(api, "<b>fixture &amp; context</b>", 100);
  expect(calls).toEqual([{ method: "sendMessage", payload: { chat_id: AUDIT_CHAT_ID,
    text: "<b>fixture &amp; context</b>", parse_mode: "HTML", link_preview_options: { is_disabled: true } } }]);
});

test("transport timeout aborts and does not retry", async () => {
  let calls = 0, aborted = false;
  const api = new Api("123:fixture");
  api.config.use(async (_prev, _method, _payload, signal) => {
    calls++; signal?.addEventListener("abort", () => { aborted = true; });
    return await new Promise<never>(() => {});
  });
  await expect(sendAuditReport(api, "fixture", 20)).rejects.toThrow("Audit transport timeout");
  expect(calls).toBe(1); expect(aborted).toBe(true);
});

test("known Telegram errors are preserved for outbox classification", async () => {
  const api = new Api("123:fixture");
  api.config.use(async () => ({ ok: false, error_code: 429, description: "fixture", parameters: { retry_after: 7 } }));
  await expect(sendAuditReport(api, "fixture", 100)).rejects.toBeInstanceOf(GrammyError);
});

test("invalid intent inputs fail closed before any database connection", async () => {
  const outbox = new PostgresDeletionAudit("postgresql://test@127.0.0.1:1/jev_audit_test", new Api("123:fixture"));
  try {
    expect(await outbox.prepare(AUDIT_CHAT_ID, 1, "fixture")).toBeUndefined();
    expect(await outbox.prepare(-1, 0, "fixture")).toBeUndefined();
    expect(await outbox.prepare(-1, 1, "x".repeat(4001))).toBeUndefined();
    expect(outbox.health().refused).toBe(3); expect(outbox.health().error).toBe(0);
  } finally { await outbox.close(); }
});
