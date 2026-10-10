import { expect, test } from "bun:test";
import { decodeHTML } from "entities";
import type { Message } from "grammy/types";
import { auditSnapshot, renderAuditReport } from "./audit-report";
const raw = { message_id: 5, date: 1, chat: { id: -1, type: "group", title: "<untrusted>" }, from: { id: 10, username: "old_name", first_name: "<evil>", is_bot: false }, video: { file_id: "do-not-copy" } } as Message;
function section(parts: string[], label: string) {
  return parts.filter(p => p.includes('<b>' + label + '</b>')).map(p => decodeHTML(p.match(/<pre>([\s\S]*)<\/pre>/)![1]!)).join("");
}
for (const body of ["a".repeat(1511) + "TAILmarker", "<&😀".repeat(1024) + " literal " + String.fromCharCode(96).repeat(3), "z".repeat(4096)]) {
  test("all captured text and long contextual sections reconstruct losslessly: " + body.length, () => {
    const message = { ...raw, caption: body, reply_to_message: { ...raw, message_id: 99, text: "reply&".repeat(900) } } as Message;
    const snapshot = auditSnapshot(message, { text: body, embeddedLinks: ["https://evil.invalid/" + "q".repeat(900)], isForwarded: false, senderProfile: { bio: "profile<&".repeat(600) } }, true);
    const older = { ...snapshot, messageId: 2, body: "older".repeat(2000) };
    const parts = renderAuditReport(snapshot, { source: "jev", model: "model", linked: false, history: [older, snapshot] });
    for (const part of parts) {
      expect(part.length).toBeLessThanOrEqual(4000); expect(Buffer.byteLength(part)).toBeLessThanOrEqual(16000);
      expect(part).not.toContain("<evil>"); expect(part).not.toContain("<untrusted>");
      expect(part).toContain("tg://user?id=10"); expect(part).not.toContain("https://t.me/old_name");
      expect(part).not.toContain("truncated"); expect(part).not.toContain("do-not-copy");
      expect(part.split("<pre>").length).toBe(part.split("</pre>").length);
    }
    expect(section(parts, "Own text/caption")).toBe(body);
    expect(section(parts, "Own available reply/context (untrusted; source is not author)")).toBe(snapshot.context);
    expect(section(parts, "Own profile at observation")).toBe(snapshot.profile);
    expect(section(parts, "Own links/buttons/destinations (inert)")).toBe(snapshot.links);
    expect(JSON.parse(section(parts, "Recent same-actor context (not all deleted)"))).toEqual([older]);
    expect(parts.join("")).toContain("contents not inspected or attached");
  });
}
test("sender chat never becomes synthetic user and unsafe link is rejected", () => {
  const snapshot = auditSnapshot({ ...raw, sender_chat: { id: -22, type: "channel", title: "Private" } } as Message, { text: "caption", isForwarded: false, embeddedLinks: [] }, false);
  expect(snapshot.actor).toBe("chat:-22"); expect(snapshot.senderUrl).toBeUndefined();
  snapshot.senderUrl = 'https://evil.invalid/';
  expect(renderAuditReport(snapshot, { source: "cache", model: "model", linked: true, history: [] }).join("")).toContain("sender link unavailable");
});
