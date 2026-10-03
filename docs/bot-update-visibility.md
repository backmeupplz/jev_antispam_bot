# Bot-triggered messages: delivery versus moderation

Investigation for agentboard #3, 2026-10-03. **Tests/documentation so far; runtime correction awaits a third-party-bot policy decision. The original incident remains unverified.**

## Authoritative delivery contract

Checked the live [Bot-to-Bot Communication feature](https://core.telegram.org/bots/features#bot-to-bot-communication), [detailed communication rules](https://core.telegram.org/api/bots/bot-to-bot), and [Bot API Message](https://core.telegram.org/bots/api#message) / [Update](https://core.telegram.org/bots/api#update) documentation on 2026-10-03.

**Correction:** the older [bot FAQ](https://core.telegram.org/bots/faq#what-messages-will-my-bot-get) still says bots never receive other bots' messages. That blanket statement is superseded by the explicit Bot-to-Bot Communication documentation and must not be used to close this incident as inherently impossible.

- In the same group, a bot can receive another bot's addressed command or direct reply when at least one participant has Bot-to-Bot Communication Mode enabled.
- With the receiving bot's mode enabled, it also receives ordinary bot messages without addressed commands/replies when it has **admin rights OR Group Privacy Mode disabled** (the Bot API feature page explicitly states “or”).
- Outside the supported contexts, bots normally do not receive other bots' messages. Mode being ON alone does not establish the receiving group's permissions or original event delivery.
- Human-message privacy restrictions still apply to non-admin privacy-enabled bots. A handle mention alone is not a delivery guarantee to the moderation bot.

The current [Guest Mode section](https://core.telegram.org/bots/features#guest-bots) also distinguishes a human sending an inline result from a guest bot replying **as itself**, even without group membership. A human mention can summon that independent response. This is another reason not to infer inline authorship from the screenshot. The original payload/delivery still needs correlation; no guest bot was contacted.
| Telegram-shaped event | Platform meaning and local behavior if delivered |
| --- | --- |
| Human `from`, text mentioning a bot | Ordinary human message; classify after current admin check. A mention alone is neither spam proof nor a request to fetch the bot. |
| Human `from`, `via_bot`, text/caption | `via_bot` means “Bot through which the message was sent,” not the message actor. Under human-message privacy rules, admin/privacy-disabled delivery is expected, but was not live-proven for this incident. Classifies as the human; caption, links, buttons and attributed source context remain available. |
| Direct third-party `from.is_bot`, no `sender_chat` | Delivery is supported in the bot-to-bot contexts above. A delivered event is nevertheless skipped locally as `bot_sender`. This is a concrete application-level exemption, separate from platform settings. |
| Self `from.id` | Locally injected event is skipped as `bot_itself`; not a claim Telegram echoes the bot’s own sends. |
| Human forwarding bot content | `forward_origin` describes the original message, not the current sender. Ordinary human delivery rules apply; local classification uses the human actor and forwarded flag. |
| External `sender_chat` plus synthetic bot `from` | API explicitly permits fake sender users for backward compatibility. Real actor is the chat, never the synthetic user. External unlinked channels classify after receiving-group metadata verification. |
| Anonymous group admin / official linked channel | Local exemption requires matching group ID/type or fresh receiving-group metadata proving the linked channel. Forward flags alone do not exempt. |
| `edited_message` | API calls this a new version of a message **known to the bot**; it is not a way to recover unseen bot posts. Same eligibility and normalization apply. |
| `reply_to_message` | API supplies the original same-chat/thread message, without further nested replies; it can be omitted for ephemeral sources. If supplied, source text/caption is bounded attributed context, not a new actor or deletion candidate. Presence of a bot source in a locally injected reply does not prove Telegram delivered that source independently, or supplies it in every real reply. |

## Routing evidence and scope decision

`src/bot.test.ts` registers production grammY handlers on a real `Bot`, JSON-round-trips absent fields, and calls `bot.handleUpdate`. Only API/classifier boundaries are substituted. The `bot visibility:` cases cover both new/edited human mentions, inline captions, human forwards of bot content, external channels with synthetic bot senders, bot/self skips, requested inline replies, and safety reports quoting bot sources. Existing tests separately cover anonymous/official-linked administrators, metadata failures, real-actor namespace isolation and edit replacement.

Assertions check classification inputs, terminal logs, deletion IDs, and no bot/destination discovery. Two humans using one inline bot remain separate history actors; one human switching inline bots retains that human’s history. Reply sources and other authors never enter the deletion set. Mock keep/delete scores prove plumbing only, not semantic accuracy or Telegram delivery. All new payloads are non-graphic synthetic text with `example.invalid` destinations; no incident media or advertised content is included or retrieved.

A delivered third-party bot message demonstrably reaches the local bot_sender exemption and never reaches classification. User correction to the investigation reports Bot-to-Bot Communication Mode ON; that makes unconditional non-delivery an invalid explanation, though it does not prove the original event was received. `via_bot` identity is not explicitly projected into model input, but the user-authored caption/body already reaches classification. Its absence is not evidence of the reported miss, nor permission to treat bot usage as spam. Normalization, model, threshold, profile/destination lookup behavior, fail-open behavior and admin protections remain unchanged. Changing the third-party-bot exemption needs an explicit policy decision under this ticket; it is not authorized by the mode screenshot alone. No runtime deployment has occurred. No live-model replay or UI deletion proof is claimed.

## Original incident: what remains unknown

The private report shows a human first-stage reply mentioning a bot, an apparent second bot reply, then manual administrator deletions/bans. The screenshot proves administrator intervention, not Jev’s delivery, skip, keep, failure or delete result. UI attribution is insufficient to distinguish direct bot output from a human inline result. Screenshot clock times have no established timezone.

The receiving numeric chat ID, original message IDs, event timezone and contemporaneous bot admin/privacy state were not established from the supplied report or available incident records. Therefore **no exact production log correlation or original classifier score is claimed**. If the second message was bot-origin and delivered, the local bot_sender skip is a concrete candidate explanation. Its precise payload and actual branch remain unverified, not proven platform-blocked.

To continue incident attribution, obtain from the reporting administrator (without reposting the unsafe media): receiving chat ID and original message IDs or safe message references, date/time/timezone, and bot admin/privacy state. With those identifiers, inspect retained privacy-safe logs for the exact chat/message pair: `message_skipped`, `message_analysis_started`, `message_analyzed`, classification/API failures and deletion results. Missing retained logs are unknown, not proof of non-delivery. Do not start a second polling consumer, crawl private history, guess IDs, retrieve the advertised destination, or associate a different author’s reply through same-actor history.

Recommended narrow policy, pending owner approval: classify delivered third-party bot-authored group text/captions under the existing gate, preserving self/admin/linked-channel exemptions and actor-scoped history. Do not borrow a triggering human’s history or delete their message because the bot reply is spam. Keep all group permissions and BotFather settings unchanged; skip bot-profile enrichment and ensure bot handling cannot generate reply loops. Trade-offs: legitimate utility-bot messages become subject to normal false-positive risk and classifier costs. Alternative: retain the exemption and explicitly accept this coverage gap. Changes to bot-add permissions, removing/denying bots, allowlists or expanded account access are outside this recommendation and require separate approval. The pictured accounts were already manually banned; this investigation performs no duplicate moderation.
