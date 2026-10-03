# Confirmed spam cache

Enabled automatically with DATABASE_URL. Set SPAM_CACHE_ENABLED=false and restart to disable (statistics remain enabled). PostgreSQL uses the existing database, a separate bounded two-connection pool and additive migrations. No Redis or SQLite service.

## Identity and useful scope

Same receiving chat AND same real actor only. A repeated standalone ad with no retained actor history can hit immediately after its parsed positive Jev verdict; successful spam is not inserted into conversation history. Safe synthetic routing tests demonstrate first-call seed, subsequent new/edit fast paths and persistence across restart without live model calls.

SHA-256 covers canonical sorted-key JSON of the entire current Telegram message (except delivery message_id/date/edit_date), the complete effective current classifier input, chat, actor, model, threshold and policy revision. Arrays retain order; text/caption kind, complete entities (hidden links and custom emoji IDs), buttons, sender metadata, reply/quote/forward attribution and media metadata stay distinct. No trim, case fold or Unicode normalization: whitespace changes MISS. Revision is a digest of the checked-in classifier, gate, input, profile, enrichment and cache sources; changes invalidate automatically. Source files must remain available (the current Bun Docker image copies src).

Strictly more than ten grapheme clusters in actual current text/caption, custom emoji spans counted as one. Emoji-only, sticker, uncaptioned and non-letter/non-number-only messages are excluded. This is not UTF-16 length or enriched/profile/source length.

V1 deliberately excludes any nonempty same-actor conversation history, any personal-channel profile and any public Telegram destination enrichment. Incomplete profile/enrichment also bypasses caching. Eligible short-text actors' profiles are freshly checked before reuse, including empty profiles; only equivalent effective bio data can hit. This avoids reusing campaign links, public posts or partially available metadata. Long text follows the existing classifier's no-profile policy unchanged. No cross-actor blacklist or strongestSignal-based evidence inference. These exclusions sacrifice hit rate, not safety or classifier policy; common repeated standalone textual ads remain useful.

## Persistence and accounting

Default TTL is 24 hours from original insertion, never extended by lookup or duplicate seed. Hard global capacity 10,000 rows; serialized database writers prune expired/versioned rows and oldest expiry on insertion. Expired rows never match even before pruning. Stored columns: bounded fingerprint, revision, positive verdict and expiry only. Hashes are pseudonymous fingerprints, NOT full anonymization. No raw content, URLs, profiles or deletion message IDs are stored in the cache.

Each cache operation has a 250ms end-to-end deadline, bounded in-flight work, connection/query/server deadlines. Errors/overload are misses and preserve ordinary Jev fail-open behavior. Content-free cumulative process counters hit/miss/error/eviction are emitted as spam_cache logs (reset on restart). Cache deletion success uses the normal deletion/statistics flow with source=cache; known_chats.cache_deletions and deletion_dedup.source are additive. Existing processed_messages counts only actual Jev attempts. Existing 90-day deletion dedup prevents retry/restart/concurrency double counting; unsuccessful Telegram deletes do not count. A hit authorizes only the current message, never historical suffix cleanup or cached side effects.

Manual invalidation: TRUNCATE spam_verdict_cache; this does not touch statistics. Disable before invalidation if it must remain empty. On a rolling revision change, older/newer writers may evict each other's entries (safe misses); stop-first single-worker deployment avoids churn.

## Checks

bun run check. PostgreSQL cases run when TEST_DATABASE_URL targets dedicated jev_stats_test (CI PostgreSQL16) or jev_ticket5_test (isolated local PostgreSQL14). Fixtures are synthetic and transport-mocked; no Telegram posts or Jev credits are consumed. Live hit rate and real-account UI behavior are not claimed.
