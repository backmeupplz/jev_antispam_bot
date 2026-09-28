# Reply and quote moderation context

The grammY 1.46 / Bot API types in `@grammyjs/types/message.d.ts` are the schema reference. A screenshot alone cannot identify the original update or exact message.

- `reply_to_message` supplies text/caption and hidden text-link entities. Only the direct source is normalized; nested replies are never visited.
- `quote` supplies quoted text. Its supported entities are formatting/custom emoji/date-time, not hidden text-link targets; formatting does not change normalized plain text. Source hidden links remain in the reply entry.
- `external_reply` supplies origin and optional source chat/message/media metadata, **not full text/caption**. We retain structural origin/author relation only, never IDs, titles, contact details or media identifiers. No source fetch, account login or history crawl occurs. Another forum topic can still be the same chat; missing chat metadata is unknown, not assumed external.
- The current text is bounded to 4096 UTF-16 code units; source/quote text to 1200 each, hidden links to 8 of at most 512 code units per entry, and depth to one (at most reply + external metadata + quote). Source is separately attributed untrusted data, not the current author's speech.
- Preview context remains attached to each current-actor history entry and survives edits. It is never an independent deletion target. Deletion still requires a >=0.90 current spam verdict and independently linked contiguous same-actor history suffix; no source or cross-chat deletion is added.
- Telemetry contains only structural enums, source availability and counts. Missing/deleted/inaccessible/metadata-only source content is not reconstructed.

The amplification question asks about the current author's promotional conduct, not the presence of an advertisement alone. Reports, criticism, verification, scam warnings, ordinary replies and requested discussion are controls. No keyword override, model change or threshold reduction is introduced.

## Verification limits

Deterministic `bot.handleUpdate` tests prove input coverage, bounded attribution, edit/history behavior, privacy and deletion routing with substituted classifier/API boundaries. They do not prove model accuracy. The opt-in `RUN_LIVE_JEV=1` suite retains the short approving reply positive and adjacent keep controls through the real request builder/parser.

Earlier candidate d821c78096528532ee9382a3e3701b150074385f had recorded live pinned-model scores of 0.79–0.85 for reported-style short replies, below 0.90; those are historical observations, not exact-head results. This patch generalizes the criterion rather than matching a literal number or shop name. Exact-head credentialed model and real-account Telegram screenshot checks have not been performed. The residual live detection gap requires focused follow-up, not a lower gate or a claim of successful deletion. General project acceptance is code review + tests + green CI; optional live/UI checks are nonblocking.
