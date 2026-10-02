# Inline URL-button context (GEN-KANEO-45)

The installed grammY Bot API types (1.46.0, @grammyjs/types markup.d.ts)
identify three URL-bearing inline-button variants: url, login_url.url and
web_app.url. Only data is retained: kind, displayed text and actual URL. Login
forward_text is not substituted for the current displayed text; login identity,
callback data, payments, switch queries and copy payloads are not interpreted.

Current buttons are separate inlineButtons, not body text or embeddedLinks.
Reply-source buttons appear only inside the attributed reply preview. Quotes
and external-reply metadata do not invent keyboards. No source button is fetched
or added to deletion history. Current button data survives same-actor history
and edit replacement. Existing author/admin/bot/linked-channel gates and media
policy remain unchanged; this is not a profile-bait or button-only eligibility
expansion. Forward title/identity was deliberately not added.

Bounds: eight distinct entries, 128 UTF-16 label units, exact URLs at most 512
units, at most 100 rows/100 inspected buttons. Overlong/invalid targets are
omitted, not truncated into different destinations. URL evidence supports
HTTP(S)/tg for ordinary URL buttons, HTTPS for login/app buttons. Enrichment
still admits only existing safe public Telegram landing-page grammar, dedupes
with body/entity links, and uses the same two-current-URL and global request,
byte, time, concurrency, cache, redirect and SSRF limits. No arbitrary website,
button click, login, app launch or payment action is performed.

## Evidence / limitations

The #22095 screenshot body is reconstructed, not the original Telegram update.
The original group/date/message identity and button URL are unknown. The
example.invalid fixture URL is NOT the screenshot destination. Missing button
input is independently verified, but not proven to have caused this historical
miss: deployed reconstructed body alone already scored above the current gate.
Original incident tracing requires the source message link or group/time.

Local deterministic tests exercise real grammY handleUpdate and exact complete
classifier inputs, text/caption/edits, human forwards, external sender_chat,
source attribution, history, privacy and bounded network destinations. Mocked
scores prove routing, not accuracy. The opt-in inline-buttons.live.test.ts uses
the real request builder/parser and requires runtime JEV_MODEL/SPAM_THRESHOLD.

Candidate-source run 2026-10-02 in isolated /tmp/gen45-candidate-92fa inside
container 0b69e2c2a448 (not deployment), jev-1.13.0, unchanged gate 0.81:
7/7 passed. Forwarded body/caption: DELETE 0.94/0.94. Previously measured
warning false positive 0.97: candidate KEEP 0.66. Report KEEP 0.52; support,
docs and event controls KEEP 0.27/0.26/0.32. This is a bounded observation, not
a guarantee over all warnings/spam. No real Telegram send/delete or UI test.

Merge/release owner must verify exact-head CI, merge and managed Easypanel
bots/jev-antispam-bot rollout, source identity and unchanged runtime config.
No threshold/model/config changes are included here.
