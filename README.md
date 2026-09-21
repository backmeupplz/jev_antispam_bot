# Jev Anti-Spam Bot

A minimal [grammY](https://grammy.dev/) Telegram bot that asks TypeSafe's Jev model whether each group message is spam and deletes only high-confidence matches.

It targets common Telegram spam:

- token, investment, referral, gambling, giveaway, and service shilling;
- “check my bio/profile/description” and DM/channel funnels;
- phishing, wallet drainers, fake support, and fraudulent airdrops;
- unsolicited bot/game promotion, sexual/DM bait, and easy-money pitches;
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

Every new or edited text message or media caption from a non-admin group member or an external channel identity is evaluated in one Jev request using seventeen spam questions plus one linkage question per recent message. The bot keeps up to ten messages per chat and sender in memory for about ten minutes so Jev can recognize a spam pitch split across several messages. After any spam signal reaches `SPAM_THRESHOLD` (default `0.90`), Jev separately identifies the contiguous recent messages that belong to the same campaign and the bot deletes only that linked suffix plus the current message. The model is pinned to `jev-1.13.0` so a new model cannot silently change moderation behavior.

History keys distinguish users from channel identities and isolate receiving groups; synthetic Telegram sender users never combine separate channels. The history is process-local and expires automatically; it is not persisted or logged. The bot does not log message text or sender identity. Each analyzed message produces structured JSON logs with chat/message IDs, message size and link count, all spam-signal probabilities, the strongest signal, the final keep/delete decision, model version, and analysis duration. Failed classifications emit a terminal fail-open `keep` result with unavailable probabilities, and successful deletions are logged separately.

When `DATABASE_URL` is set, the bot also records each chat ID observed in normal Telegram updates, first/last-seen timestamps, chat type, membership-active state when Telegram supplies it, and a lifetime count of confirmed successful deletions. It never stores message text, user profiles, Jev prompts, or credentials. Statistics are optional and fail open: database startup, migration, latency, or outages never block moderation or Telegram deletion calls.

Database writes use one connection and one bounded asynchronous flusher. Chat sightings are coalesced, deletion identities are deduplicated by `(chat_id, message_id)`, and each atomic batch increments counters only for newly inserted identities. Dedupe identities expire after 90 days; lifetime counters do not. The defaults cap pending memory at 1,000 chats plus 1,000 deletions, batch up to 100 of each per flush, retry with exponential backoff and jitter, and attempt a five-second shutdown drain without bypassing retry delays. New observations are ignored once shutdown begins, and no timer or database write starts after the store-close boundary. An abrupt process/container crash, shutdown deadline, or queue overflow can lose records that have not reached PostgreSQL; moderation remains available and overflow/failure health is emitted as rate-limited structured logs.

Every new/edited message skipped before classification emits exactly one `message_skipped` record with `decision:"keep"`, receiving chat/message IDs, edited flag, and a specific reason: `private_chat`, `unsupported_chat_type`, `no_text_or_caption`, `missing_sender`, `bot_itself`, `bot_sender`, `group_admin`, `anonymous_group_admin`, `official_linked_channel`, `unsupported_sender_chat`, `sender_chat_metadata_invalid`, `sender_chat_metadata_failed`, or `admin_metadata_failed`. No sender ID, channel ID, display name, forward origin, text, caption, or API error description is logged. Metadata failures keep the message and do not add it to classification history. Jev currently accepts text only, so media without a caption is not classified.

## Validation

`bun run check` runs typechecking and deterministic tests, including the real grammY handlers with mocked Telegram/classifier calls. These tests prove routing, deletion selection, skip telemetry, history isolation, and unchanged statistics hooks—not live Jev probabilities or Telegram UI behavior.

Live model regression tests require explicit `RUN_LIVE_JEV=1` plus `TYPESAFE_API_KEY` supplied through a protected credential environment authorized for `api.typesafe.ai`:

```sh
RUN_LIVE_JEV=1 bun test src/spam.live.test.ts
```

The suite includes the screenshot-transcribed Chinese advertisement from Telegram #20414, legitimate official-channel forwards, requested promotion, and ordinary forwarded discussion. Keep the 0.90 gate; do not treat mocked handler outcomes as model calibration. Fresh real-account Telegram QA after a reviewed rollout must verify external-channel ad deletion and legitimate/official-channel exemptions. PostgreSQL integration tests separately require a disposable test database (`TEST_DATABASE_URL`); never point them at production.

## Docker

```sh
docker build -t jev-antispam-bot .
docker run --rm --env-file .env jev-antispam-bot
```

## Easypanel PostgreSQL rollout contract

Provision before enabling `DATABASE_URL`:

- Easypanel project: `bots`; PostgreSQL service: `jev-antispam-db`.
- PostgreSQL 16, one instance, no public domain or published database port.
- Private Easypanel network only; persistent volume mounted at `/var/lib/postgresql/data`.
- Database `jev_antispam`; dedicated non-superuser `jev_antispam_app` with only connect, schema create/usage, and DML rights for that database. Generate the password through the protected credential flow; do not put it in Git, chat, or logs.
- Bot service: keep one replica and its existing start command; add only `DATABASE_URL=postgresql://jev_antispam_app:<protected-password>@<Easypanel-private-host>:5432/jev_antispam`, using the hostname Easypanel exposes for `jev-antispam-db` and the protected generated credential.

The bot applies [`migrations/001_chat_stats.sql`](migrations/001_chat_stats.sql) lazily on the first queued batch with idempotent `IF NOT EXISTS` DDL. Rollout order is database service/volume → least-privilege credential → bot `DATABASE_URL` → bot deploy → observe `statsEnabled:true`, then `stats_storage_ready` after a normal update. Readiness can be checked privately with:

```sql
SELECT COUNT(*) AS known_chats, COALESCE(SUM(successful_deletions), 0) AS successful_deletions
FROM known_chats;
```

Rollback removes `DATABASE_URL` and redeploys the bot, leaving the PostgreSQL volume intact for later recovery. Do not reset or delete the database during rollback.

## License

MIT
