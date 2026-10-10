# #69 coupled release

Only the reviewed v2--examples prompt is authorized (Decision3196/Nikita23156); the disclosed tradeoff is accepted, not relabeled as a clean benchmark. No retraining or new experiments.

## Identity and ordering

The existing JEV_MODEL=laya-jev-ckpt-v2 setting is deliberately resolved to laya-jev-ckpt-v2-examples-856e52e3 at startup. Other models are untouched. The approved model requires the existing explicit SPAM_THRESHOLD=0.80; the model service's LAYA_GATE=0.81 and bot linkage threshold0.75 remain independent and unchanged. Startup logs expose the effective model, cache source revision and expected prompt/checkpoint hashes. These hashes are requirements, not an observation of the server's filesystem. Verify the model service /health separately.

Cache fingerprints bind both the effective new model and source revision (including policy.ts). Old model responses fail open before capture, cache seed or deletion. Do not perform a model-only rollout while the old bot remains active: stop/quiesce old bot through its managed service, deploy and verify the new model, deploy/start this matching bot, then prove report receipt. Preserve all env/secrets/DB and model mounts; TRAINING_CAPTURE is separately enabled in current production and must remain enabled. No broad cache purge is needed.

## Mandatory private auditing

DATABASE_URL is now required by the product entrypoint. Migration004 is additive and serialized; it does not change statistics, cache or training tables. Only fixed private sink -5477973916 is used, with no configurable alternate. The sink is excluded before stats, enrichment, classification, commands, history and training capture.

Each deletion has a committed bounded snapshot/intent before Telegram delete, then confirmation after Telegram returns true. On intent refusal (DB unavailable/capacity/deduplication), that destructive action is skipped with content-free counters/logs; moderation of subsequent messages continues. Confirmed deletion remains a deletion even when later persistence fails. Transport is asynchronous and never blocks classification. Unknown deletion/send states are explicit, finite-retained and never blindly retried; not exactly-once. See audit-outbox.md for bounds and operational response.

Current and linked historical reports use each message's OWN observed author, text/caption, profile and contextual snapshot. Actor history is process-local10minutes/10messages, and no private history is fetched. Snapshot/report fields are bounded, with explicit truncation; full media is not downloaded, inspected or attached. Only validated Telegram username or numeric user links are active; untrusted body/context/buttons are escaped inside preformatted text with previews off, and source/forward metadata never becomes author identity. Report body includes successful deletion, fresh/cache and linked/current attribution. Failed deletions never enter pending delivery.

## Release proof

Run protected product command bun scripts/audit-report.ts check and then send-integration after review. It uses the SAME Postgres outbox + grammY transport, fixed harmless labeled body, and never deletes a message. Read actual private receipt and confirm running git SHA/model health/bot startup identity/gates/capture state. No live destructive probe is required. Parent owns CI, independent exact-head review, PR/merge and Easypanel rollout.

## Local verification

bun run check with local PostgreSQL: 476passed,249live-only skipped,0failed (4613assertions); includes real migrations/restart/concurrent claims/capacity/retention/429/ambiguity, real grammY fresh/cache/new/edit/linked partial-failure routing, source ownership, escaping and identity regression. Twelve model offline tests passed separately. No Telegram API calls, credentials, model experiments or production actions occurred during implementation.
