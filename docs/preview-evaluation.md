# Attributed preview comparison (GEN-KANEO-37)

Baseline: merged GEN32 commit `e058072ab1173c70383f07ed99798d3946540e85`.
This change adds evaluation coverage only; it does not alter production questions,
normalization, thresholds, parsing, or deletion behavior.

The 16 Telegram-shaped cases in `src/fixtures/preview-amplification.ts` are
synthetic comparisons, not an exact transcription or attribution of topic4041081
#21217. They cover reported-style 666, alternative short reactions, explicit
endorsement, reports, warnings, criticism, verification, citation, requested
recommendation, ordinary 666, inaccessible source, and individually attributed
mixed history. A forwarded source has unknown authorship; a direct request from
another member retains other-author attribution.

## Run

- Deterministic regressions: `bun run check`.
- Optional model comparison: with an existing protected `TYPESAFE_API_KEY`
  environment, run `RUN_LIVE_JEV=1 bun run src/preview-evaluation.ts`.
  Do not paste credentials into a command or tracker. There are 16 sequential
  requests, one attempt each, a 10-second timeout per request, no Telegram API
  calls and no actual deletions. Normal tests require no credentials.

The optional comparison calls production normalization, request construction,
and the strict response parser with pinned `jev-1.13.0` and threshold .90.
It reports every signal, parsed current decision, complete linkage array and
synthetic IDs selected by the production contiguous-suffix helper. Missing
answers fail rather than being filled in. Error output is sanitized; exit 1
means at least one request/parsing failure, not a model-quality verdict.
No score assertions force ambiguous tiny replies into a desired outcome.

## Interpretation and decision boundary

Mock responses in deterministic tests prove source/current separation, per-message
request context, strict linkage validation, threshold handling, actor/chat isolation,
and fail-open behavior through a real grammY handler. They do **not** prove model
detection. This commit includes no credentialed model results or real-account UI
proof, and does not claim improved confidence. Such evaluations are nonblocking
for General's review/test/CI gate.

A brief reaction may express endorsement, irony, acknowledgment or discussion;
source advertising alone is insufficient evidence to delete its current author.
Do not infer unavailable source text, lower the threshold, add keyword overrides,
or delete the referenced source. Historical .79–.85 scores at candidate d821c780
are not scores for this baseline. Until comparative evidence supports a safe
narrow criterion change, retain the existing criterion and fail-open gate.
The remaining product decision is whether evidence of endorsement beyond a tiny
reaction is required when intent is underdetermined; choosing a broader policy
requires explicit approval and near-neighbor false-positive evaluation, not a
hard-coded score. Exact screenshot-message attribution/full source text remains
unproven independently of this synthetic comparison.
