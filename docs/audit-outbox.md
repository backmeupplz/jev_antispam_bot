# Private deletion audit outbox

## Integration

```ts
type DeletionAudit = {
  prepare(chatId: number, messageId: number, report: string | string[]): Promise<string | undefined>;
  confirmed(id: string): Promise<void>;
  failed(id: string, ambiguous?: boolean): Promise<void>;
};
```

Construct `PostgresDeletionAudit(databaseUrl, bot.api)`, await `initialize()` before polling, then `start()`. Exclude `AUDIT_CHAT_ID = -5477973916` from moderation. Await `prepare` **before** every current/cache/linked deletion; undefined means **skip deletion**, not unaudited deletion. Pass the complete array of bounded, safely escaped HTML chunks rendered before deletion (a single string remains supported). No clipping is permitted: an oversized report refuses deletion entirely. Call `confirmed` only after a successful delete. Call `failed(id, false)` only after a known Telegram rejection; transport/timeout/server uncertainty requires `failed(id, true)`. Never wrap post-delete persistence in the classification-error handler. Close after moderation handlers have settled: `close()` waits for an in-flight send and ends the owned pool.

`health()` gives process counters only. `summary()` asynchronously gives durable state counts plus prepared/refused/expiry totals. Both omit content, identities and error text. The index should log health periodically, not only on shutdown. Alerts should use rising refused/error/unknown/terminal/expired_undelivered counts, not expose stored reports.

## Confirmation format

New confirmations contain only the linked actual sender name, escaped original text/caption (or a factual media marker), and `Reply to:` with direct source text/caption when present. Missing source content is marked unavailable; previews, partial quotes, nested reply chains, profiles and classification metadata are not printed. Message bodies use inert `<pre>` blocks and previews remain disabled. Long bodies use bounded continuations without repeating sender metadata.

There is no persistence migration: stored outbox parts are already-rendered HTML, not snapshots. Pre-upgrade pending parts finish unchanged (and can still have the old verbose format); they are not re-rendered, purged or resent. Older in-memory snapshots use only recognized direct-source fields, never raw context JSON.

## State and bounds

* A unique source chat/message row and all ordered parts are committed atomically as intent before deletion. Known failures can retry with a **new UUID**, fencing callbacks from earlier attempts. Other existing rows refuse repeated deletion.
* Successful deletion makes pending; an atomic transaction takes a parent and part lease before sending. Only the earliest unsent part is eligible. Each accepted part stores its actual validated Telegram message ID atomically with progress; it is never resent on restart. Parent state becomes sent only after every part succeeds. Ambiguous or terminal parts block all remaining parts and set the same truthful parent state; earlier confirmed receipts remain available through receipts(id). One global sink row serializes capacity, pacing and concurrent worker claims. Migration itself uses advisory transaction lock 69004. All replicas must use the same limits; there is one fixed sink, not per-chat configuration.
* Expired intent becomes delete_unknown; expired sending becomes send_unknown. Neither is sent/retried. A late success after lease expiry cannot rewrite an unknown result. DB failure after successful deletion leaves intent for unknown recovery rather than falsely claiming an audit was delivered.
* The actual grammY sendMessage transport uses fixed sink, HTML, disabled previews, no keyboard and a 10-second abort. No auto-retry transformers may be installed on the supplied API. A network/timeout/API-5xx result is ambiguous and never automatically resent. Explicit API 400/403 and other non-429 4xx are terminal. Explicit 429 retries honor retry_after plus one second, backed by the durable global pacing clock, at most five attempts. Malformed or >30-day retry_after is terminal rather than early retry. Normal pacing is at least 3.1 seconds after each send completes, suitable for Telegram group limits.
* Default capacity: 10,000 retained **parts**, including sent, failed, and blocked parts; report limit: 256 parts, each at most 4,000 UTF-16 units and 16KB; retention: 7 days. Constructor test/operational overrides are finite (maximum 100,000 parts/30 days). Preparation reserves the complete report under the sink lock, or refuses it entirely. A known-failed replacement subtracts its old parts only within that atomic replacement; failed admission preserves the previous intent. The legacy parent report stores part one for additive compatibility, so bounded storage includes that duplicate. No confirmed row is evicted early to admit an intent; capacity instead refuses the destructive action. Expiry explicitly deletes all eligible records, including undelivered ones, and increments persistent expired/expired_undelivered counters. Pruning runs during preparation and every worker tick, not while the service is stopped; database backups follow their own retention. Deduplication lasts for the retention window, not forever. PostgreSQL autovacuum handles dead tuples; logical size limits do not bound backup/WAL history.
* Migration 005 is additive and idempotent, preserving legacy 004 rows as one part each. Legacy sent rows have no recoverable message ID: they remain sent, with no invented receipt and no resend. Existing sending leases remain fenced and expire to unknown. Deploy upgraded workers together; do not run old single-part workers against multipart intents.
* Default intent lease 120 seconds and send lease 60 seconds. Caller deletion timeout must be shorter than intent lease. SQL statement timeout 1 second/client query timeout 1.2 seconds, connection timeout 2 seconds. Failed transactions destroy their connection rather than reusing an uncertain transaction. Unknown records retain their report until retention expiry for private inspection, never raw operational logging.

This is bounded, conservative at-most-once-attempt recovery, **not guaranteed exactly-once delivery**. Ambiguous delivery sacrifices automatic retry to avoid duplicate private disclosures. A crash between intent commit and deletion confirmation can lose an audit report, but retains an explicit unknown intent until expiry.

## Harmless release proof

Run only with authorized product bot environment, not OpenClaw messaging credentials:

* `bun scripts/audit-report.ts check` performs read-only bot membership/permission checks for the fixed sink, without printing identity.
* `bun scripts/audit-report.ts send-integration` enqueues a fixed two-part **“Integration report — NOT a deletion”** body through the exact same outbox/transport. No arbitrary text/destination/source arguments exist. Synthetic source 0/1 dedupes repeated probes for the retention window; it never invokes deletion. The command waits up to 90 seconds, prints only confirmed Telegram API acceptance and the ordered sink message IDs (not human read confirmation or report content), and reports failure rather than claiming queued work is delivered. Normal worker owns any queued continuation. Check the private group for actual receipt. Do not blindly rerun an ambiguous probe or delete its dedupe row.

No production Telegram actions were performed during implementation.

## Tests

`bun test src/audit-outbox.test.ts` mocks the real grammY Api transformer (no network). Integration tests require explicit `AUDIT_TEST_DATABASE_URL` pointing to local `/jev_audit_test` or CI `/jev_stats_test`; they truncate/drop **only this isolated test database's audit tables**. Run `bun test src/audit-outbox.integration.test.ts`. Coverage: exact multipart reconstruction, restart after part one, ambiguous part two halting remainder, multipart capacity atomicity, 256-part admission/257-part refusal, receipt validation/IDs, legacy migration, race-safe migration, schema constraints, durability/restart/idempotency, retry token fencing, concurrency/leases, stale recovery, capacity/retention, durable 429 pacing/exhaustion, API/network ambiguity, outage, fixed integration route and shutdown.
