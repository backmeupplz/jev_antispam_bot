# Concurrent update handling (#613)

Jev used to handle one update at a time. Each Laya classification takes about 2–3 s on hetzner-main's shared CPU, so at peak (40–76 updates a minute) Telegram held 600–770 unconfirmed updates and Jev ran about 15 minutes behind live chat. By the time it reached a spam message, people had often reported it or it was already gone.

## Design

`handleConcurrently` (`src/lifecycle.ts`) is the first middleware. It hands each update to a scheduler and returns at once, so `bot.start()` asks for the next batch straight away:

- An update waits for every earlier update that shares one of its keys (`updateKeys`): the sender (`user:<id>`, or `chat:<id>` for a channel or an anonymous admin) for messages and edits, and the changed member for `chat_member`. Message history, campaigns, repeat sends and profiles are all per sender, so they see that sender's updates in the order Telegram sent them, and an edit always follows its original. A promotion or demotion is handled before that member's next message.
- At most `JEV_UPDATE_CONCURRENCY` updates (default 16) run at once. Model calls among them are bounded separately to `JEV_CONCURRENCY` (default 4) by `AdaptiveClassifier`, so the updates waiting on Telegram lookups, link previews or the database don't hold a model slot (#616).
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

## The busy hour of Nov 11 (#616)

From 17:00 to 18:30Z (1,891 analysed messages, 160–275 per 10 min), `pendingUpdateCount` stayed between 0 and 49, but p95 `updateLagMs` was 15.6 s (p50 3.1 s, max 127 s). laya-serve never queued: `waitMs` was 0 on 1,409 of 1,411 passes. The lag was all in the bot, for two reasons:

- **Context requests timed out every time.** laya-serve answers `context_message_*` in a second pass (only when spam ≥ `LAYA_GATE`). That pass costs about 5–6 s per context message: 4 questions took 19–20 s, 5 took 27–31 s, and 7 took 41 s. With a flat 15 s timeout, three messages were tried three times each (~55 s, including the waits between tries) and then kept unchecked, even though they scored 0.82. Each timeout also halved the model calls allowed at once, down to 1, and it took 4–5 min to climb back to 4. Meanwhile the poller waited for the batch, and the lag reached 127 s. Since #616 a request gets `JEV_CONTEXT_TIMEOUT_MS` (default 8 s) more per context message, up to 60 s in all. When a context request still times out, it is not tried again, because the next try would cost the same. Its timeout still cuts the model calls allowed at once and counts toward the 30 s pause, like any other timeout. Its budget already grows with each context message, so running out of it means the model is overloaded, and in a busy chat most messages carry context (the sender's own recent messages). The exception is a request whose budget was cut to the 60 s cap (6 or more context messages with the 15 s prod `JEV_TIMEOUT_MS`, 7 or more at the 8 s code default; history keeps up to 10, which can take ~60 s on a healthy model): its timeout doesn't count as overload.
- **Update slots held by I/O.** Without those incidents, p95 was still 14.3 s from 18:02 to 18:30. Four update slots were shared by profile `getChat` calls, preview lookups (4–6 s over the network) and model calls, and laya-serve ran at about half its capacity. Since #616 updates and model calls have separate limits (`JEV_UPDATE_CONCURRENCY`, `JEV_CONCURRENCY`). The spam cache and the repeat-send store each run up to 4 queries at once (`SPAM_CACHE_POOL_MAX`, `REPEAT_STORE_POOL_MAX`), up from 2, with the in-flight cap equal to the pool size. A lookup or record past that is skipped at once and counted as an `error`, so with 16 updates in flight more copies of a spam wave still reach the cache instead of the model. Link-preview fetches likewise run up to 16 at once across all updates (`PREVIEW_LIMITS.concurrent`), up from 4. A fetch past that returns `unavailable` (`overload`) at once, so a burst of link messages would otherwise be classified without their destination previews.

The barrier before each `getUpdates` stays. Fetching ahead would confirm updates that are still being handled, so a crash would lose them.

Shutdown still drains for at most 15 s (`pollWithHandover`). The updates that `bot.stop()` has confirmed but that are not handled by then are dropped. Since #616 that includes a context request still inside its longer timeout. The same was already true before for queued updates and for a 15 s call that started late.

## Logs

- `message_analysis_started.updateLagMs`: now minus the message's `date` (`edit_date` for an edit), in ms.
- `update_backlog` every minute: `pendingUpdateCount` from `getWebhookInfo` and `handling`, the updates in the scheduler.
- laya-serve's `inference` event has `waitMs`, the time spent waiting for a free slot.
