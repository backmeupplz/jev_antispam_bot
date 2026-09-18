# Jev Anti-Spam Bot

A minimal [grammY](https://grammy.dev/) Telegram bot that asks TypeSafe's Jev model whether each group message is spam and deletes only high-confidence matches.

It targets common Telegram spam:

- token, investment, referral, gambling, giveaway, and service shilling;
- “check my bio/profile” and DM/channel funnels;
- phishing, wallet drainers, fake support, and fraudulent airdrops;
- repetitive, irrelevant, or mass-mention spam.

Group administrators and anonymous admin/channel posts are exempt. If Jev or Telegram is unavailable, the bot leaves the message untouched.

## Setup

1. Open `@BotFather`, run `/setprivacy`, select the bot, and choose **Disable**. This is a one-time bot setting required to receive every group message.
2. Set the environment variables:

   ```sh
   cp .env.example .env
   ```

   - `TELEGRAM_BOT_TOKEN`: token from BotFather
   - `TYPESAFE_API_KEY`: TypeSafe API key

3. Install and run:

   ```sh
   bun install
   bun run check
   bun start
   ```

4. Add the bot to a group as an administrator with **Delete messages** permission.

From then on, adding it as an admin is all a group owner needs to do. Run `/status` in the group to verify the deletion permission.

## Policy

Every text message or media caption from a non-admin group member is evaluated in one Jev request using four independent Noul questions. The message is deleted when any spam probability is at least `SPAM_THRESHOLD` (default `0.90`). The model is pinned to `jev-1.13.0` so a new model cannot silently change moderation behavior.

The bot does not log message text or sender identity. Logs contain only operational event names, chat/message IDs, the strongest spam signal, probability, and model version.

Jev currently accepts text only, so media without a caption is not classified.

## Docker

```sh
docker build -t jev-antispam-bot .
docker run --rm --env-file .env jev-antispam-bot
```

## License

MIT
