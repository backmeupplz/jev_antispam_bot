# Uncaptioned media with its own URL buttons (#428)

A reported post in the Veydrift group was a picture with no caption and a
keyboard of airdrop/bonus URL buttons ("BINANCE AIRDROP", "CLAIM $100 BONUS",
"WELCOME BONUS"...), sent by a bot account. It was skipped as
`media_profile_unavailable` before classification: bots never get human-profile
enrichment, and uncaptioned media was only eligible with sender-profile
evidence. The model never saw the buttons.

## Change

- **Eligibility** (`bot.ts`): uncaptioned photo/video/animation/sticker is
  classified when the post itself carries URL buttons (`url`, `login_url`,
  `web_app`, as extracted by `inlineUrlButtons`), with or without a sender
  profile, for humans, delivered third-party bots and unlinked channels alike.
  Media without its own URL buttons keeps the old profile requirement: callback
  buttons and a reply source's buttons do not count. Admin, anonymous-admin,
  linked-channel and `bot_itself` exemptions run first and are unchanged.
- **Request** (`spam.ts`): for such a post, the request's copy of
  `state.message.text` holds the button labels, one per line, and every
  question gets a note saying the buttons are the current author's own words.
  The bot's own message (history, cache, audit, logs) keeps its empty text.
- **Decision**: the larger of `media_profile_funnel` and the ordinary
  text-signal maximum, at the unchanged gate. Media without buttons is still
  judged on `media_profile_funnel` alone.
- **Attribution**: on a tie (Laya copies one score to every signal) the
  text signal, not `media_profile_funnel`, is reported as the strongest.
- **Training capture** stores the exact request, so these rows carry the
  labels as `text` on an uncaptioned post; replays and distillation should
  expect that shape.
- **Logs**: unchanged structure. `message_analysis_started` already carries
  `mediaOnly`, `inlineButtonCount` and `senderProfilePresent`; no labels or URLs.

## Why the labels go into `text`

The deployed Laya ckpt-v2 returns one score copied to every signal and ignores
question wording: the note above changed no score by even 0.0001. With the
buttons only in `inlineButtons` and empty text, the reconstructed incident
scored 0.17 (bot, reply) / 0.23 (human), far below the 0.80 gate. Dropping
`mediaOnly` or adding URLs to the text raised the incident, but also pushed
plain "Play"/"Open"/docs controls to 0.66–0.89. Labels as text with
`mediaOnly` kept separated the two sets cleanly.

## Live check (2026-11-04)

`src/media-buttons.live.test.ts` (opt-in `RUN_MEDIA_BUTTONS_LIVE=1`; model,
gate and endpoint from the runtime env) was run inside the production bot
container against its own model service: `laya-jev-ckpt-v2` →
`laya-jev-ckpt-v2-examples-85-83403c71`, gate 0.80. 14/14 passed:

| Fixture | Score | Verdict |
| --- | --- | --- |
| incident, bot, as a reply | 0.865 | DELETE |
| incident, human | 0.899 | DELETE |
| casino free-spins buttons, bot | 0.891 | DELETE |
| Russian airdrop buttons, bot | 0.903 | DELETE |
| free-USDT/connect-wallet buttons, human | 0.821 | DELETE |
| game bot "▶️ Play / 🏆 Leaderboard / 📖 Rules" | 0.651 | KEEP |
| sticker with "Add sticker pack" | 0.510 | KEEP |
| meetup photo replying to a request | 0.354 | KEEP |
| game bot single "Play" | 0.319 | KEEP |
| news forward "Read more", docs (en/ru), article, utility "Open" | 0.216–0.235 | KEEP |

Every URL is a synthetic reserved address, and the labels follow the
screenshot. The original 13-button keyboard and its real destinations are
unknown. The extractor keeps at most eight distinct buttons. The USDT case
clears the gate by only 0.021, so this is a bounded observation, not a recall
guarantee. Media that already had a sender profile and URL buttons now sends
labels as text too. That subset was not separately measured on production
traffic, because the capture holds no skipped posts.
