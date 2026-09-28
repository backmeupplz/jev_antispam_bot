# Paid care campaign confidence — GEN-KANEO-38

## Outcome: no safe confidence improvement established

GEN35/PR22 was merged before this work. Baseline is main d350332
(includes GEN30/34/35/36/37 safeguards). A bounded comparison of baseline plus
**two** prompt formulations did not resolve repeated-copy current/link confidence.
Both candidates were rejected; production classifier, model, thresholds, parser,
normalization and deletion policy remain unchanged. This is evaluation and
regression coverage, **not a shipped improvement in spam detection**.

Candidate 1 clarified complete repeated outreach (not only split pitches),
per-copy invitation and unknown-photo boundaries in the aggregate and linkage
questions. Candidate 2 additionally separated historical-link instructions from
the shared current-author preview instructions and expanded the care question to
same-actor continuation. Neither forced scores or introduced heuristic overrides.
Candidate 2 regressed the exact unrelated reply and whitespace positives. No
further wording search was performed.

## Bounded model comparison (2026-09-28)

Each formulation: 18 sequential calls, pinned jev-1.13.0, .90 deletion/.75 linkage,
actual JevSpamClassifier request builder and strict parser. All 54 responses parsed
with every dynamic answer present. Each cell is strongest current score / linkage
probabilities in chronological history order. These are single measurements, not
statistical accuracy estimates; small differences are not meaningful gains.

| Case | Baseline | Candidate 1 (rejected) | Candidate 2 (rejected) |
| --- | --- | --- | --- |
| standalone | 0.93 / [] | 0.93 / [] | 0.90 / [] |
| laptop | 0.93 / [] | 0.91 / [] | 0.89 / [] |
| rv-repeat | 0.89 / [0.48] | 0.89 / [0.54] | 0.88 / [0.42] |
| photo-third | 0.87 / [0.68, 0.64] | 0.86 / [0.66, 0.66] | 0.88 / [0.54, 0.56] |
| requested | 0.60 / [] | 0.60 / [] | 0.59 / [] |
| requested-repeat | 0.63 / [0.66, 0.72] | 0.64 / [0.52, 0.59] | 0.65 / [0.47, 0.52] |
| invited | 0.64 / [] | 0.61 / [] | 0.62 / [] |
| mixed | 0.74 / [0.62, 0.71, 0.63] | 0.70 / [0.53, 0.64, 0.58] | 0.73 / [0.47, 0.51, 0.58] |
| whitespace-0 | 0.91 / [] | 0.92 / [] | 0.89 / [] |
| whitespace-1 | 0.91 / [] | 0.92 / [] | 0.89 / [] |
| variant-0 | 0.93 / [] | 0.94 / [] | 0.92 / [] |
| variant-1 | 0.92 / [] | 0.92 / [] | 0.91 / [] |
| control-0 | 0.03 / [] | 0.03 / [] | 0.03 / [] |
| control-1 | 0.11 / [] | 0.11 / [] | 0.12 / [] |
| control-2 | 0.04 / [] | 0.04 / [] | 0.04 / [] |
| control-3 | 0.30 / [] | 0.31 / [] | 0.29 / [] |
| control-4 | 0.03 / [] | 0.03 / [] | 0.03 / [] |
| control-5 | 0.75 / [] | 0.74 / [] | 0.75 / [] |

In all three runs, the RV second copy, photo third copy and mixed history kept the
current message and selected no cleanup. Requested, repeated requested, invited,
unpaid, arranged, settlement, seeker, price-question and warning controls all kept.
The source is the existing #21391 visible transcription with defensible whitespace
variants and reconstructed truncated source previews, not original update identity.
No unavailable photo content is inferred. A lone photo-target case cannot establish
whether its source invited the offer. Visible unrelated text targets are distinct
from genuine other-author requests; their confidence miss is not a parser failure
or evidence that those normalized inputs are indistinguishable.

## Reproduce without changing the app

- Deterministic: bun run check (no credentials required).
- Optional: RUN_LIVE_JEV=1 bun run src/paid-care-evaluation.ts with an existing
  protected TYPESAFE_API_KEY environment; never paste a key into commands.

The evaluator sends 21 sequential requests with one attempt and a 10-second
per-request timeout, outputs all signal/link scores and hypothetical selected IDs,
and never calls Telegram or changes app state. Exit 1 denotes a request/parser
failure, not an unmet model-quality expectation. Existing opt-in positive tests
remain unchanged and still express the desired detection behavior.

The evaluator reuses existing normalization fixtures and production suffix
selection. It deliberately retains earlier copies in supplied history to measure
recovery of previously missed spam. This is **not** a replay of successful earlier
deletions: the real handler clears actor history before attempting deletion only
when it selects more than one ID; current-only deletion does not clear history.
Synthetic IDs are 1..N for history and N+1 for current, never source-post IDs.
No linked history can delete when the current score is below .90; after a current
positive, cleanup stops at the first link below .75 even if an older one is high.

The final unchanged-classifier evaluator run also parsed all 21 responses:

| Case | Strongest current | Links | Hypothetical selected IDs |
| --- | --- | --- | --- |
| standalone | 0.93 | [] | [1] |
| laptop | 0.92 | [] | [1] |
| rv-repeat | 0.88 | [0.47] | [] |
| photo-third | 0.87 | [0.69, 0.69] | [] |
| requested | 0.58 | [] | [] |
| requested-repeat | 0.64 | [0.64, 0.7] | [] |
| invited | 0.62 | [] | [] |
| mixed | 0.71 | [0.61, 0.65, 0.59] | [] |
| whitespace-0 | 0.92 | [] | [1] |
| whitespace-1 | 0.91 | [] | [1] |
| variant-0 | 0.93 | [] | [1] |
| variant-1 | 0.92 | [] | [1] |
| control-0 | 0.03 | [] | [] |
| control-1 | 0.12 | [] | [] |
| control-2 | 0.04 | [] | [] |
| control-3 | 0.29 | [] | [] |
| control-4 | 0.03 | [] | [] |
| control-5 | 0.76 | [] | [] |
| current-requested-after-unsolicited | 0.67 | [0.7, 0.65] | [] |
| requested-barrier | 0.75 | [0.66, 0.57, 0.55] | [] |
| photo-without-history | 0.81 | [] | [] |

All 75 calls were candidate-source nonposting probes in isolated temporary
directories inside existing app container b9769bbba814, reusing its credential and
dependencies without exporting secrets or altering /app, config, DB or worker.
Temporary staging was removed by the runner. This is not deployment evidence,
actual Telegram deletion or real-account UI proof. Full raw signal results and
source archives are local evidence under artifacts/gen38-950b/{baseline,candidate1,
candidate2,final}-results.jsonl and matching .tgz files in the OpenClaw workspace.

## Safety regressions and remaining work

Deterministic tests substitute only HTTP/API responses to prove the real
builder/parser/grammY route, complete dynamic schema, .899/.90 current boundary,
.749/.75 link boundary, historical requested preservation, an interior requested
barrier, current requested-after-unsolicited keep, source-post exclusion, privacy,
and missing/invalid linkage fail-open. Mock scores do not prove model recognition.

The residual product gap requires a focused model/context investigation using
these retained requests, not another blind wording sweep or weaker thresholds.
Establish why complete repeated offers score lower with attributed history, and
whether a bounded per-copy evidence representation can improve discrimination
without discarding requested context. Any future runtime change needs unchanged
model/threshold safety controls, real builder/parser evidence, deterministic
regressions and independent review. If missing source evidence prevents a sound
verdict, state the boundary rather than forcing a positive. General live/UI
observations remain supplementary, never a status gate.
