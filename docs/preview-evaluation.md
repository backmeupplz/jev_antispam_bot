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

## Measured credentialed synthetic comparison (2026-09-28)

The committed opt-in evaluator was run in the existing production container using
candidate source `cc0c56c`, pinned `jev-1.13.0`, and threshold .90. All 16
synthetic fixtures parsed successfully; there were zero request/parsing failures.
These are actual model measurements, not mock responses or score assertions.

| Synthetic fixture | `quoted_promotion_amplification` | Additional measured outcome |
| --- | --- | --- |
| reported-style-666 | .32 | Strongest signal .35 |
| short-nice | .68 | |
| short-emoji | .69 | |
| short-deal | .76 | |
| explicit-endorsement | .90 | Strongest .97; selects only current message for deletion |
| report-to-mods | .03 | |
| warning | .03 | |
| criticism | .04 | |
| verification | .05 | |
| discussion-citation | .15 | |
| requested-recommendation | .05 | |
| ordinary-666 | .02 | |
| standalone-666 | .03 | |
| inaccessible-source | .05 | |
| mixed-history | .69 | Strongest .94; links [.12, .94]; selected IDs [11, 100], excluding requested message 10 |
| historical-ad-current-warning | .25 | Strongest .26; link .42; no deletion selected |

Selection means the evaluator's synthetic deletion decision, not an actual
Telegram deletion. Running inside the production container does not mean the
candidate source was deployed. This was not an exact reproduction of the user
screenshot, a deployed-source evaluation, or UI testing; no conclusion about
the real reported case follows from these synthetic results.

**Decision:** these measurements justify no runtime threshold or prompt changes.
Resolving the tiny-reaction ambiguity requires the exact attributed screenshot
payload and full advertisement text, or an explicit product-policy decision on
whether ambiguous tiny reactions should be deletion-worthy. Synthetic scores
alone do not settle that policy.

## Interpretation and decision boundary

Mock responses in deterministic tests prove source/current separation, per-message
request context, strict linkage validation, threshold handling, actor/chat isolation,
and fail-open behavior through a real grammY handler. They do **not** prove model
detection. The credentialed synthetic results above are not real-account UI
proof and do not establish improved confidence. Such evaluations are nonblocking
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
