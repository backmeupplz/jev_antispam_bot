# Concurrent update handling (#613)

Jev used to handle one update at a time. Each Laya classification takes about 2–3 s on hetzner-main's shared CPU, so at peak (40–76 updates a minute) Telegram held 600–770 unconfirmed updates and Jev ran about 15 minutes behind live chat. By the time it reached a spam message, people had often reported it or it was already gone.

## Design

`handleConcurrently` (`src/lifecycle.ts`) is the first middleware. It hands each update to a scheduler and returns at once, so `bot.start()` asks for the next batch straight away:

- An update waits for every earlier update that shares one of its keys (`updateKeys`): the sender (`user:<id>`, or `chat:<id>` for a channel or an anonymous admin) for messages and edits, and the changed member for `chat_member`. Message history, campaigns, repeat sends and profiles are all per sender, so they see that sender's updates in the order Telegram sent them, and an edit always follows its original. A promotion or demotion is handled before that member's next message.
- At most `JEV_CONCURRENCY` updates (default 4) run at once.
- Errors go to `bot.catch`, as with polling.

The handover poller (`startWithHandover`) takes the scheduler's `settle` and awaits it before each `getUpdates`. A `getUpdates` call confirms the batch before it, so Telegram still confirms a batch only once it is handled, exactly as before. On SIGTERM nothing changes: `bot.stop()` confirms every fetched update at once, the lock is released, and shutdown drains the scheduler (queued updates too) before closing the audit outbox and stores.

`AdminCache` shares one in-flight `getChatAdministrators` per chat between concurrent senders. A `chat_member` update that lands while that request runs keeps the older answer out of the cache.

## Laya

laya-serve (`backmeupplz/jev-laya`) used to hold a lock around every forward pass. It now runs `LAYA_CONCURRENCY` passes at once (default 4) with `LAYA_TORCH_THREADS` torch threads each (default 1). Measured inside the prod container on Nov 10, 2026 (load average 18–23 on the 6-core/12-thread Xeon E5-1650 v3, short synthetic texts, 12–16 requests per cell):

| torch threads | 1 at a time | 2 | 4 | 8 |
|---|---|---|---|---|
| 4 (the old setting) | 1.37 s, 44/min | 2.73 s, 43/min | 2.03 s, 111/min | 2.63 s, 173/min |
| 2 | 1.21 s, 50/min | 1.55 s, 72/min | 2.48 s, 89/min | 3.93 s, 114/min |
| 1 | 1.61 s, 37/min | 1.67 s, 67/min | 1.90 s, 120/min | 2.49 s, 174/min |

Cells are mean latency and throughput. Four single-threaded passes give about 2.7 times the old throughput, at about the old per-request latency and on the same 4 threads. Concurrent answers were bit-identical to serial ones, and 1 and 4 threads gave identical scores.

Keep `JEV_CONCURRENCY` equal to `LAYA_CONCURRENCY`; with more, requests queue inside laya-serve and eat into `JEV_TIMEOUT_MS`. Deploy laya-serve first: the bot at 4 against the old one-at-a-time server queues up to 3 requests (~6–8 s), still inside the 15 s prod timeout, but with no speed-up.

## Logs

- `message_analysis_started.updateLagMs`: now minus the message's `date` (`edit_date` for an edit), in ms.
- `update_backlog` every minute: `pendingUpdateCount` from `getWebhookInfo` and `handling`, the updates in the scheduler.
- laya-serve's `inference` event has `waitMs`, the time spent waiting for a free slot.
