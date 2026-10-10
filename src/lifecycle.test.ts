import { expect, test } from "bun:test";
import { Bot } from "grammy";
import type { UserFromGetMe, Update } from "grammy/types";
import { trackHandlers, drainBot } from "./lifecycle";
import { registerBotHandlers } from "./bot";
import { AsyncStatsBuffer } from "./stats";
import { PostgresDeletionAudit } from "./audit-outbox";
import { SPAM_QUESTIONS, type SpamAssessment } from "./spam";
const testUrl = process.env.AUDIT_TEST_DATABASE_URL;
if (testUrl && (!["127.0.0.1", "localhost"].includes(new URL(testUrl).hostname) || !["/jev_audit_test", "/jev_stats_test"].includes(new URL(testUrl).pathname))) throw new Error("Isolated local test database required");
const defer = () => { let resolve!: () => void; const promise = new Promise<void>(r => { resolve = r; }); return { promise, resolve }; };
for (const durable of [false, true]) (durable && !process.env.AUDIT_TEST_DATABASE_URL ? test.skip : test)("real grammY stop drains deletion before audit closes durable=" + durable, async () => {
  const bot = new Bot("123:fixture", { botInfo: { id: 99, is_bot: true, first_name: "Fixture", username: "fixture_bot" } as UserFromGetMe });
  const drain = trackHandlers(bot);
  const deleting = defer(), release = defer(); const events: string[] = [];
  let closed = false, delivered = false;
  const msg = { message_id: 1, date: 1, chat: { id: -1, type: "group", title: "Fixture" }, from: { id: 42, is_bot: false, first_name: "Fixture" }, text: "synthetic test offer" };
  bot.api.config.use(async (_prev, method) => {
    if (method === "getUpdates") {
      if (!delivered) { delivered = true; return { ok: true, result: [{ update_id: 1, message: msg } as Update] } as never; }
      return { ok: true, result: [] } as never;
    }
    if (method === "getChatMember") return { ok: true, result: { status: "member", user: msg.from } } as never;
    if (method === "getChat") return { ok: true, result: { id: 42, type: "private", first_name: "Fixture" } } as never;
    if (method === "deleteMessage") { events.push("delete_started"); deleting.resolve(); await release.promise; events.push("delete_succeeded"); }
    return { ok: true, result: true } as never;
  });
  const outbox = durable ? new PostgresDeletionAudit(process.env.AUDIT_TEST_DATABASE_URL!, bot.api) : undefined;
  if (outbox) await outbox.initialize();
  let intent: string | undefined;
  const stats = new AsyncStatsBuffer({ writeBatch: async () => {}, close: async () => {} }, { autoStart: false });
  registerBotHandlers(bot, { model: "fixture", stats, logger: { info() {}, error() {} },
    classifier: { classify: async () => ({ shouldDelete: true, probability: .99, strongestSignal: "unsolicited_promotion", model: "fixture", contextProbabilities: [], signals: Object.fromEntries(Object.keys(SPAM_QUESTIONS).map(k => [k, .99])) } as unknown as SpamAssessment) },
    deletionAudit: { prepare: async (chat, id, report) => intent = outbox ? await outbox.prepare(chat, id, report) : "intent", confirmed: async id => { expect(closed).toBe(false); await outbox?.confirmed(id); events.push("confirmed"); }, failed: async id => { await outbox?.failed(id); events.push("failed"); } },
  });
  const polling = bot.start();
  await deleting.promise;
  const stopping = drainBot(bot, polling, drain).then(async () => {
    if (outbox) expect(await outbox.status(intent!)).toBe("pending");
    await outbox?.close(); closed = true; events.push("closed");
  });
  await Bun.sleep(10); expect(closed).toBe(false);
  release.resolve(); await stopping;
  expect(events).toEqual(["delete_started", "delete_succeeded", "confirmed", "closed"]);
  await stats.stop();
});
