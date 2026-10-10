import { expect, test } from "bun:test";
import { decodeHTML } from "entities";
import type { Message } from "grammy/types";
import { auditSnapshot, renderAuditReport, type AuditSnapshot } from "./audit-report";
const raw = { message_id: 5, date: 1, chat: { id: -1, type: "group", title: "private chat" }, from: { id: 10, first_name: "Alice", is_bot: false } } as Message;
const sender = '<a href="tg://user?id=10">Alice</a>';
function snapshot(fields: Record<string, unknown> = {}) {
  return auditSnapshot({ ...raw, ...fields } as Message, { text: "not a summary", embeddedLinks: ["https://hidden.invalid"], isForwarded: false, senderProfile: { bio: "private profile" } }, false);
}
const render = (fields: Record<string, unknown>) => renderAuditReport(snapshot(fields));
test("nonreply is exactly sender and original text, including without a username", () => {
  expect(render({ text: "Original message" })).toEqual([sender + '\n<pre>Original message</pre>']);
  expect(render({ caption: "Original caption", photo: [] })).toEqual([sender + '\n<pre>Original caption</pre>']);
  expect(render({ caption: "[no text/caption]", photo: [] })).toEqual([sender + '\n<pre>[no text/caption]</pre>']);
});
test("reply adds only direct source text/caption, never nested or quoted content", () => {
  for (const field of ["text", "caption"]) {
    expect(render({ text: "Deleted", quote: { text: "partial quote", position: 0 }, reply_to_message: { ...raw, [field]: "Direct source", reply_to_message: { ...raw, text: "nested source" } } })).toEqual([
      sender + '\n<pre>Deleted</pre>\n\nReply to: <pre>Direct source</pre>',
    ]);
  }
});
test("sender_chat takes precedence over synthetic from and source identity", () => {
  const message = { text: "Deleted", sender_chat: { id: -22, type: "channel", title: "Channel <&>", username: "real_channel" }, from: { ...raw.from, id: 136817688 }, reply_to_message: { ...raw, text: "Source" } };
  expect(render(message)).toEqual(['<a href="https://t.me/real_channel">Channel &lt;&amp;&gt;</a>\n<pre>Deleted</pre>\n\nReply to: <pre>Source</pre>']);
  expect(render({ ...message, reply_to_message: undefined, sender_chat: { id: -22, type: "channel", title: "Private <&>" } })).toEqual(['Private &lt;&amp;&gt;\n<pre>Deleted</pre>']);
  expect(render({ text: "Deleted", from: undefined })).toEqual(['unavailable\n<pre>Deleted</pre>']);
});
test("textless media and unavailable direct/external sources are factual", () => {
  expect(render({ sticker: {} })).toEqual([sender + '\n<pre>[sticker]</pre>']);
  expect(render({ photo: [] })).toEqual([sender + '\n<pre>[photo]</pre>']);
  expect(render({ text: "Deleted", reply_to_message: { ...raw, photo: [] } })).toEqual([sender + '\n<pre>Deleted</pre>\n\nReply to: <pre>[photo]</pre>']);
  for (const fields of [{ reply_to_message: raw }, { external_reply: { origin: { type: "hidden_user", sender_user_name: "Other", date: 1 } }, quote: { text: "partial only", position: 0 } }, { quote: { text: "partial only", position: 0 } }]) {
    expect(render({ text: "Deleted", ...fields })).toEqual([sender + '\n<pre>Deleted</pre>\n\nReply to: <pre>[text unavailable]</pre>']);
  }
});
test("untrusted HTML, URLs and metadata stay inert and internal fields absent", () => {
  const body = '<a href="tg://user?id=999">fake</a> https://evil.invalid @someone & 😀';
  const s = snapshot({ text: body, from: { ...raw.from, first_name: '<b>Fake</b>' } });
  expect(renderAuditReport(s)).toEqual(['<a href="tg://user?id=10">&lt;b&gt;Fake&lt;/b&gt;</a>\n<pre>&lt;a href=&quot;tg://user?id=999&quot;&gt;fake&lt;/a&gt; https://evil.invalid @someone &amp; 😀</pre>']);
  for (const senderUrl of ['https://evil.invalid/', 'https://t.me/valid_name?x=1', 'tg://user?id=0', 'tg://user?id=10" onclick="evil', 'javascript:evil']) {
    expect(renderAuditReport({ ...s, body: "Body", senderUrl })).toEqual(['&lt;b&gt;Fake&lt;/b&gt;\n<pre>Body</pre>']);
  }
  expect(renderAuditReport(snapshot({ text: "Body" }))).toEqual([sender + '\n<pre>Body</pre>']);
});
test("old snapshots parse only recognized direct fields, never spill stored JSON", () => {
  const old: AuditSnapshot = { chatId: -1, messageId: 1, chatTitle: "private", actor: "user:10", actorName: "Alice", senderUrl: "tg://user?id=10", edited: true, body: "Old body", media: "photo; contents not inspected or attached", context: JSON.stringify({ replySource: { text: "Old source", actor: "user:999" }, preview: [{ text: "not direct" }] }), links: '{"private":"links"}', profile: '{"private":"bio"}' };
  expect(renderAuditReport(old)).toEqual([sender + '\n<pre>Old body</pre>\n\nReply to: <pre>Old source</pre>']);
  expect(renderAuditReport({ ...old, context: '{"replySource": {"messageId": 90}}' })).toEqual([sender + '\n<pre>Old body</pre>\n\nReply to: <pre>[text unavailable]</pre>']);
  for (const context of ['malformed <json>', 'null', '[]', '{"replySource":"unavailable","preview":[{"text":"unrelated"}]}']) {
    expect(renderAuditReport({ ...old, context })).toEqual([sender + '\n<pre>Old body</pre>']);
  }
});
for (const body of ['a'.repeat(1511) + 'TAIL', '<&😀"'.repeat(1024), 'z'.repeat(4096), '👨‍👩‍👧‍👦é中'.repeat(1000)]) {
  test('long Unicode and escaping reconstruct without loss: ' + body.length, () => {
    const source = 'source 😀<&'.repeat(900);
    const parts = render({ caption: body, reply_to_message: { ...raw, text: source } });
    let own = '', reply = '', inReply = false;
    for (const part of parts) {
      expect(part.length).toBeLessThanOrEqual(4000);
      expect(Buffer.byteLength(part)).toBeLessThanOrEqual(16000);
      expect(new TextDecoder().decode(new TextEncoder().encode(part))).toBe(part);
      for (const match of part.matchAll(/(Reply to(?: \(continued\))?: )?<pre>([\s\S]*?)<\/pre>/g)) {
        if (match[1]) inReply = true;
        const text = decodeHTML(match[2]!);
        if (inReply) reply += text; else own += text;
      }
    }
    expect(own).toBe(body); expect(reply).toBe(source);
    expect(parts.join('').match(/<a href=/g)).toHaveLength(1);
    expect(parts.join('')).not.toContain('profile');
    expect(parts.join('')).not.toContain('Source chat');
  });
}
test("ordinary combined content remains one message; large body has minimal continuation", () => {
  expect(render({ text: 'a'.repeat(1900), reply_to_message: { ...raw, text: 'b'.repeat(1900) } })).toHaveLength(1);
  const parts = render({ text: 'z'.repeat(4096) });
  const firstCount = 4000 - sender.length - '\n<pre></pre>'.length;
  const boundary = render({ text: 'z'.repeat(firstCount), reply_to_message: { ...raw, text: 'r'.repeat(5000) } });
  expect(boundary.every(part => part.length <= 4000)).toBe(true);
  expect(boundary).toHaveLength(3);
  expect(parts).toEqual([sender + '\n<pre>' + 'z'.repeat(firstCount) + '</pre>', 'Message (continued): <pre>' + 'z'.repeat(4096 - firstCount) + '</pre>']);
});
