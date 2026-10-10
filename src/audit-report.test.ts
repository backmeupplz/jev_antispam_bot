import { expect, test } from "bun:test";
import type { Message } from "grammy/types";
import { auditSnapshot, renderAuditReport } from "./audit-report";
const raw = { message_id: 5, date: 1, chat: { id: -1, type: "group", title: "<untrusted>" }, from: { id: 10, first_name: "<evil>", is_bot: false }, caption: "<&".repeat(2048), video: { file_id: "do-not-copy" } } as Message;
test("bounded HTML escapes data and discloses media/context limits", () => {
  const snapshot = auditSnapshot(raw, { text: "", embeddedLinks: ["https://evil.invalid"], isForwarded: false, senderProfile: { bio: "<&".repeat(500) } }, true);
  const report = renderAuditReport(snapshot, { source: "jev", model: "x".repeat(200), linked: false, history: Array(10).fill(snapshot) });
  expect(report.length).toBeLessThanOrEqual(4000);
  expect(report).not.toContain("<evil>"); expect(report).not.toContain("<untrusted>");
  expect(report).toContain("tg://user?id=10");
  expect(report).toContain("contents not inspected or attached");
  expect(report).toContain("truncated to bound");
  expect(report).not.toContain("do-not-copy");
  expect(report.match(/<a /g)).toHaveLength(1);
  expect(report.split("<pre>").length).toBe(report.split("</pre>").length);
});
test("private sender chat has no invented user or guessed link", () => {
  const snapshot = auditSnapshot({ ...raw, sender_chat: { id: -22, type: "channel", title: "Private" } } as Message, { text: "caption", isForwarded: false, embeddedLinks: [] }, false);
  expect(snapshot.actor).toBe("chat:-22"); expect(snapshot.senderUrl).toBeUndefined();
  expect(renderAuditReport(snapshot, { source: "cache", model: "model", linked: true, history: [] })).toContain("sender link unavailable");
});
