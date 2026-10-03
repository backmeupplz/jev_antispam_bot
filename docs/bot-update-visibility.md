# Bot-triggered messages: delivery versus moderation

Investigation for agentboard #3, 2026-10-03. **Tests/documentation only; no runtime fix or policy change. The original incident remains unverified.**

## Authoritative delivery contract

Checked the live [Telegram bot FAQ](https://core.telegram.org/bots/faq#what-messages-will-my-bot-get) and [Bot API Message](https://core.telegram.org/bots/api#message) / [Update](https://core.telegram.org/bots/api#update) documentation on 2026-10-03.

The FAQ says administrators and privacy-disabled bots receive all group messages **except messages sent by other bots**. Its [bot-to-bot explanation](https://core.telegram.org/bots/faq#why-doesnt-my-bot-see-messages-from-other-bots) says this exclusion applies regardless of mode. Privacy-enabled non-admin bots have narrower delivery: addressed commands, certain general commands, messages sent via that bot, and qualifying replies (with reply priority). A handle mention is not a delivery guarantee. Changing update filters, classifier prompts or local exemptions cannot recover events Telegram never sends.

| Telegram-shaped event | Platform meaning and local behavior if delivered |
| --- | --- |
| Human `from`, text mentioning a bot | Ordinary human message; classify after current admin check. A mention alone is neither spam proof nor a request to fetch the bot. |
| Human `from`, `via_bot`, text/caption | `via_bot` means “Bot through which the message was sent,” not the message actor. Under the FAQ human-message rules, admin/privacy-disabled delivery is expected, but was not live-proven for this incident. Classifies as the human; caption, links, buttons and attributed source context remain available. |
| Direct third-party `from.is_bot`, no `sender_chat` | FAQ excludes bot-origin group delivery. Locally injected events are skipped as `bot_sender`; removing that exemption does not fix non-delivery. |
| Self `from.id` | Locally injected event is skipped as `bot_itself`; not a claim Telegram echoes the bot’s own sends. |
| Human forwarding bot content | `forward_origin` describes the original message, not the current sender. Ordinary human delivery rules apply; local classification uses the human actor and forwarded flag. |
| External `sender_chat` plus synthetic bot `from` | API explicitly permits fake sender users for backward compatibility. Real actor is the chat, never the synthetic user. External unlinked channels classify after receiving-group metadata verification. |
| Anonymous group admin / official linked channel | Local exemption requires matching group ID/type or fresh receiving-group metadata proving the linked channel. Forward flags alone do not exempt. |
| `edited_message` | API calls this a new version of a message **known to the bot**; it is not a way to recover unseen bot posts. Same eligibility and normalization apply. |
| `reply_to_message` | API supplies the original same-chat/thread message, without further nested replies; it can be omitted for ephemeral sources. If supplied, source text/caption is bounded attributed context, not a new actor or deletion candidate. Presence of a bot source in a locally injected reply does not prove Telegram delivered that source independently, or supplies it in every real reply. |

## Routing evidence and scope decision

`src/bot.test.ts` registers production grammY handlers on a real `Bot`, JSON-round-trips absent fields, and calls `bot.handleUpdate`. Only API/classifier boundaries are substituted. The `bot visibility:` cases cover both new/edited human mentions, inline captions, human forwards of bot content, external channels with synthetic bot senders, bot/self skips, requested inline replies, and safety reports quoting bot sources. Existing tests separately cover anonymous/official-linked administrators, metadata failures, real-actor namespace isolation and edit replacement.

Assertions check classification inputs, terminal logs, deletion IDs, and no bot/destination discovery. Two humans using one inline bot remain separate history actors; one human switching inline bots retains that human’s history. Reply sources and other authors never enter the deletion set. Mock keep/delete scores prove plumbing only, not semantic accuracy or Telegram delivery. All new payloads are non-graphic synthetic text with `example.invalid` destinations; no incident media or advertised content is included or retrieved.

No observable eligibility gap was reproduced. `via_bot` identity is not explicitly projected into model input, but the user-authored caption/body already reaches classification. Its absence is not evidence of the reported miss, nor permission to treat bot usage as spam. We therefore leave normalization, model, threshold, profile/destination lookup behavior, bot exemption, fail-open behavior and admin protections unchanged. No production deployment is needed for this tests/docs change. No live-model replay or UI deletion proof is claimed.

## Original incident: what remains unknown

The private report shows a human first-stage reply mentioning a bot, an apparent second bot reply, then manual administrator deletions/bans. The screenshot proves administrator intervention, not Jev’s delivery, skip, keep, failure or delete result. UI attribution is insufficient to distinguish direct bot output from a human inline result. Screenshot clock times have no established timezone.

The receiving numeric chat ID, original message IDs, event timezone and contemporaneous bot admin/privacy state were not established from the supplied report or available incident records. Therefore **no exact production log correlation or original classifier score is claimed**. If the second message was truly bot-origin, the documented platform boundary applies; its precise payload remains unverified.

To continue incident attribution, obtain from the reporting administrator (without reposting the unsafe media): receiving chat ID and original message IDs or safe message references, date/time/timezone, and bot admin/privacy state. With those identifiers, inspect retained privacy-safe logs for the exact chat/message pair: `message_skipped`, `message_analysis_started`, `message_analyzed`, classification/API failures and deletion results. Missing retained logs are unknown, not proof of non-delivery. Do not start a second polling consumer, crawl private history, guess IDs, retrieve the advertised destination, or associate a different author’s reply through same-actor history.

No group-policy change is necessary for this evidence-only result. A future proposal to change bot-add permissions, remove/deny third-party bots, add allowlists or expand account access requires a separate explicit owner decision with legitimate-bot trade-offs. The pictured accounts were already manually banned; this investigation performs no duplicate moderation.
