# Jev Anti-Spam Bot

A minimal [grammY](https://grammy.dev/) Telegram bot that asks TypeSafe's Jev model whether each group message is spam and deletes only high-confidence matches.

It targets common Telegram spam:

- token, investment, referral, gambling, giveaway, and service shilling;
- “check my bio/profile/description” and DM/channel funnels;
- low-substance emoji or generic-engagement hooks backed by adult-content bio/personal-channel metadata;
- phishing, wallet drainers, fake support, and fraudulent airdrops;
- unsolicited bot/game promotion, sexual/DM bait, and easy-money pitches;
- unsolicited testimonial/social-proof promotion of bots, channels, groups, mini apps, sites, courses, or providers, even without a start/join/buy command;
- unsolicited service or product ads that funnel members to DMs, email, or another direct contact;
- repetitive, irrelevant, or mass-mention spam.

Group administrators, bot senders, and genuine anonymous group administrators (`sender_chat.id` equals the receiving group) are exempt. Channel identities are exempt only when a fresh Telegram `getChat` lookup proves that they are the receiving group’s official `linked_chat_id`. External channel identities are analyzed, even when Telegram supplies a synthetic bot sender or no `from` user. Forwarding alone never establishes an exemption. If Jev or Telegram is unavailable, the bot leaves the message untouched.

## Setup

1. Open `@BotFather`, run `/setprivacy`, select the bot, and choose **Disable**. This is a one-time bot setting required to receive every group message.
2. Set the environment variables:

   ```sh
   cp .env.example .env
   ```

   - `TELEGRAM_BOT_TOKEN`: token from BotFather
   - `TYPESAFE_API_KEY`: TypeSafe API key
   - `DATABASE_URL` (optional): private PostgreSQL connection URL for chat/deletion statistics

3. Install and run:

   ```sh
   bun install
   bun run check
   bun start
   ```

4. Add the bot to a group as an administrator with **Delete messages** permission.

From then on, adding it as an admin is all a group owner needs to do. Run `/status` in the group to verify the deletion permission.

## Policy

Every new or edited text message or media caption from a non-admin group member or an external channel identity is evaluated in one Jev request using twenty-one spam questions plus one linkage question per recent message. For eligible human messages up to 280 characters, the bot makes a best-effort request to Telegram for the numeric sender's private-chat bio and, when exposed, the sender's personal-channel title and description. Forwarded user messages use the exposed origin user ID. Telegram does not expose private-chat metadata for every group member or forwarded user; inaccessible profiles fall back to normal message-only classification. Successful and empty results expire from memory after ten minutes, failures after one minute, and settled plus pending lookups share a 1,000-entry bound. The text fields are sent only as structured Jev input and are never logged, persisted, or added to message history. Telegram stories, profile-photo image content, and personal-channel usernames are not sent to this text moderation path.

The bot keeps up to ten messages per chat and sender in memory for about ten minutes so Jev can recognize a spam pitch split across several messages. After any spam signal reaches `SPAM_THRESHOLD` (default `0.90`), Jev separately identifies the contiguous recent messages that belong to the same campaign and the bot deletes only that linked suffix plus the current message. The model is pinned to `jev-1.13.0` so a new model cannot silently change moderation behavior.

History keys distinguish users from channel identities and isolate receiving groups; synthetic Telegram sender users never combine separate channels. The history is process-local and expires automatically; it is not persisted or logged. The bot does not log message text, sender identity, profile metadata, or personal-channel metadata. Each analyzed message produces structured JSON logs with chat/message IDs, message size and link count, a boolean profile-metadata-presence flag, all spam-signal probabilities, the strongest signal, the final keep/delete decision, model version, and analysis duration. Failed profile lookups continue with message-only classification; failed classifications emit a terminal fail-open `keep` result with unavailable probabilities, and successful deletions are logged separately.

When `DATABASE_URL` is set, the bot also records each chat ID observed in normal Telegram updates, first/last-seen timestamps, chat type, membership-active state when Telegram supplies it, and a lifetime count of confirmed successful deletions. It never stores message text, user profiles, Jev prompts, or credentials. Statistics are optional and fail open: database startup, migration, latency, or outages never block moderation or Telegram deletion calls.

Database writes use one connection and one bounded asynchronous flusher. Chat sightings are coalesced, deletion identities are deduplicated by `(chat_id, message_id)`, and each atomic batch increments counters only for newly inserted identities. Dedupe identities expire after 90 days; lifetime counters do not. The defaults cap pending memory at 1,000 chats plus 1,000 deletions, batch up to 100 of each per flush, retry with exponential backoff and jitter, and attempt a five-second shutdown drain without bypassing retry delays. New observations are ignored once shutdown begins, and no timer or database write starts after the store-close boundary. An abrupt process/container crash, shutdown deadline, or queue overflow can lose records that have not reached PostgreSQL; moderation remains available and overflow/failure health is emitted as rate-limited structured logs.

Every new/edited message skipped before classification emits exactly one `message_skipped` record with `decision:"keep"`, receiving chat/message IDs, edited flag, and a specific reason: `private_chat`, `unsupported_chat_type`, `no_text_or_caption`, `missing_sender`, `bot_itself`, `bot_sender`, `group_admin`, `anonymous_group_admin`, `official_linked_channel`, `unsupported_sender_chat`, `sender_chat_metadata_invalid`, `sender_chat_metadata_failed`, or `admin_metadata_failed`. No sender ID, channel ID, display name, forward origin, text, caption, or API error description is logged. Metadata failures keep the message and do not add it to classification history. Jev currently accepts text only, so media without a caption is not classified.

## Validation

`bun run check` runs typechecking and deterministic tests, including the real grammY handlers with mocked Telegram/classifier calls. These tests prove routing, deletion selection, skip telemetry, history isolation, and unchanged statistics hooks—not live Jev probabilities or Telegram UI behavior.

Live model regression tests require explicit `RUN_LIVE_JEV=1` plus a valid `TYPESAFE_API_KEY`:

```sh
RUN_LIVE_JEV=1 bun test src/spam.live.test.ts
```

The suite includes a known Chinese advertisement, synthetic testimonial promotions across destination types, and forwarded/non-forwarded controls for requested recommendations, ordinary experience, warnings, support, citations, moderation quotes and bare links. To check a private reported post without retaining it as a fixture, supply its transcription on stdin with `JEV_PRIVATE_FIXTURE_STDIN=1 RUN_LIVE_JEV=1 bun test src/spam.live.test.ts -t "private screenshot"`; the test asserts probabilities without printing the text. Keep the 0.90 gate; do not treat mocked handler outcomes as model calibration. Test Telegram changes with a real account before deploying them. PostgreSQL integration tests separately require a disposable test database (`TEST_DATABASE_URL`); never point them at production.

## Docker

```sh
docker build -t jev-antispam-bot .
docker run --rm --env-file .env jev-antispam-bot
```

## Optional PostgreSQL statistics

Create a PostgreSQL database and set `DATABASE_URL` to its connection URL:

```sh
DATABASE_URL=postgresql://jev_antispam:<password>@localhost:5432/jev_antispam
```

The database user needs permission to connect, create tables in its schema, and read/write those tables. Keep the database private and use persistent storage in production.

The bot applies [`migrations/001_chat_stats.sql`](migrations/001_chat_stats.sql) automatically on the first queued batch. The migration is idempotent, so no separate migration command is required. After the bot receives a normal update, a `stats_storage_ready` log confirms that storage is available. You can inspect the totals with:

```sql
SELECT COUNT(*) AS known_chats, COALESCE(SUM(successful_deletions), 0) AS successful_deletions
FROM known_chats;
```

To disable statistics, remove `DATABASE_URL` and restart the bot. Existing database data is left untouched.

## License

MIT
