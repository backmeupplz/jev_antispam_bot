# Paid-care history attribution decision — GEN-KANEO-39

## Decision: reject this representation change; retain the safe baseline

Consumed GEN38's merged evaluator/report at cf944f69d3c3ea5a6faa9d1f0e6bc5f8baab5c1c
(PR25) before starting. One bounded comparison completed: **42/42 requests parsed**,
21 existing cases × unchanged aggregate versus explicit per-copy attribution.
The candidate did not recover campaign cleanup. No production representation,
question, model, parser, threshold, handler or deletion behavior is changed by this
report. This closes the authorized investigation, **not the detection gap**.
No further wording sweep, model switch or evaluation-only successor is proposed.

## What the inputs establish

The retained GEN38 final source and merged production builder have identical
src/spam.ts bytes (SHA-256 b68ee3449649888aabd27b3619a247ea453d8d91dc9694aa7d7429b78747bd5e).
The builder already places each normalized preview under its own message and
explicitly instructs per-message permission. Its shared question suffix also
applies CURRENT-author instructions to historical linkage questions. That is a
plausible source of scope competition, **not a proven internal model cause**;
GEN38 already rejected a wording change to that suffix, which was not repeated.

Current and historical permission evidence is present, not discarded by the
normalizer: another-author same-chat requests, unrelated laptop/RV previews,
and the unknown photo target remain attributed to their own copies. The photo
has no recoverable content; it cannot independently prove request or irrelevance.
All examples are reconstructed visible previews from the existing fixtures, not
original Telegram updates or recovered source-post identities.

The candidate adds only this lossless table to the existing state (original
message, recentMessages and every question remain unchanged):

	const copies = [...state.recentMessages, state.message]
	state.perCopyRequestContext = copies.map((copy, i) => ({
	  appliesOnlyTo: i === copies.length - 1 ? "message" : "recentMessages[" + i + "]",
	  attributedSourcePreviews: copy.preview ?? []
	}))

This is redundant explicit attribution, not removal of aggregate context, extra
calls for individual copy verdicts, or a new semantic permission classifier.
It adds no asserted request/unsolicited labels and infers no photo content.
It tests whether making the existing source-to-copy mapping explicit is sufficient;
it does not isolate all possible context interactions or prove that every possible
factorization would fail. No model instructions were changed.

## Observations (2026-09-28)

Actual JevSpamClassifier builder and strict parser; jev-1.13.0, current .90 and
linkage .75. One sequential aggregate then candidate call per case, no retries.
Cells: strongest current probability / historical links in chronological order.
IDs are synthetic evaluator IDs, not Telegram IDs. Selected IDs are hypothetical;
no Telegram API was called. Histories deliberately retain earlier missed copies,
not a replay of earlier successful deletes: the handler clears history only when
its selection includes a linked prior message (more than one ID), before deletion
attempts; a current-only delete leaves existing history intact.

| Case | Aggregate | Per-copy | Selected IDs aggregate → candidate |
| --- | --- | --- | --- |
| standalone | 0.93 / [] | 0.93 / [] | [1] → [1] |
| laptop | 0.9 / [] | 0.92 / [] | [1] → [1] |
| rv-repeat | 0.89 / [0.47] | 0.91 / [0.53] | [] → [2] |
| photo-third | 0.85 / [0.66, 0.68] | 0.89 / [0.67, 0.73] | [] → [] |
| requested | 0.61 / [] | 0.57 / [] | [] → [] |
| requested-repeat | 0.61 / [0.61, 0.72] | 0.64 / [0.66, 0.67] | [] → [] |
| invited | 0.62 / [] | 0.59 / [] | [] → [] |
| mixed | 0.7 / [0.61, 0.64, 0.59] | 0.72 / [0.64, 0.67, 0.45] | [] → [] |
| whitespace-0 | 0.93 / [] | 0.92 / [] | [1] → [1] |
| whitespace-1 | 0.91 / [] | 0.92 / [] | [1] → [1] |
| variant-0 | 0.94 / [] | 0.94 / [] | [1] → [1] |
| variant-1 | 0.92 / [] | 0.93 / [] | [1] → [1] |
| control-0 | 0.03 / [] | 0.03 / [] | [] → [] |
| control-1 | 0.12 / [] | 0.1 / [] | [] → [] |
| control-2 | 0.04 / [] | 0.03 / [] | [] → [] |
| control-3 | 0.28 / [] | 0.29 / [] | [] → [] |
| control-4 | 0.03 / [] | 0.03 / [] | [] → [] |
| control-5 | 0.77 / [] | 0.8 / [] | [] → [] |
| current-requested-after-unsolicited | 0.67 / [0.7, 0.69] | 0.69 / [0.76, 0.73] | [] → [] |
| requested-barrier | 0.76 / [0.67, 0.6, 0.6] | 0.73 / [0.67, 0.57, 0.47] | [] → [] |
| photo-without-history | 0.79 / [] | 0.8 / [] | [] → [] |

Controls 0–5 are unpaid help, arranged care, settlement, job seeker, price question,
and warning respectively. Requested/invited/current-requested controls all kept.

The RV current verdict crossed .90 in this single measurement, but the earlier
copy remained unlinked (.53 < .75). The third photo copy, mixed requested history,
and requested interior barrier still selected nothing. Even a hypothetical current
positive would not recover their intended suffix at these linkage probabilities.
The warning score rose .77 → .80 but remained below deletion. No negative control
was deleted; this bounded sample does not establish general safety or calibration.

The same current care text remains lower-confidence when embedded in some history
conditions. The new run reproduces the residual miss without a missing-answer or
parser failure. Exact current inputs are not identical across laptop/RV/photo, so
these rows cannot causally separate history length from target type or prove an
internal attention mechanism. The requested-repeat/current-requested cases show
why treating repeated text or stronger historical scores as a deletion override
would be unsafe. Candidate current-requested links include .76, but the .69
current verdict still correctly prevents every deletion.

## Precise limitation and required product/provider decision

**Observed boundary:** on this pinned model and preserved attributed context,
current spam confidence and independently required campaign membership do not
reliably both clear .90/.75 for the repeated paid-care fixtures. Explicit per-copy
scope alone is insufficient. The isolated RV crossing is not a robust gain or a
campaign fix; it does not justify shipping extra prompt state. This is a measured
model/request interaction, not proof of a provider defect or an indistinguishable
normalized-input pair.

The product owner must choose whether to **accept these conservative false
negatives under the existing gates**, or explicitly authorize a provider-side
calibration/context-scoping investigation using this evidence and a new bounded
budget. Any proposed provider/model change or multi-pass decision architecture
needs separate explicit authorization and safety acceptance, not automatic rollout.
No switch, weaker threshold, inferred permission, repetition-only rule, hardcoded
identity/amount/animal, or further trial is authorized by this report. Keep this
product decision on GEN-KANEO-39; do not create another evaluation-only successor.
Unknown photo-source evidence remains unknown regardless of provider choice.

## Evidence and verification

Local evidence root (not files shipped with the app):
/Users/borodutch/.openclaw/workspace/artifacts/gen39-dbf6/

- attribution-results.jsonl: all 42 actual request bodies (no auth headers), parsed
  signal/link scores and hypothetical selections. SHA-256:
  6eeb931c96661e10d3a87424b5baa2a74d151ab5a568f6748d57970c65f19e9b.
- attribution.tgz: exact candidate-source src/ and attribution-probe.ts; SHA-256:
  6bb3b7d136f6c5ab43ea6a786a6ea78c9098d4c2b21111541a372b0bb10e5f9b.
- audit.py / audit.txt: 21 paired original states and question sets equal, candidate
  table lossless, complete required static/dynamic question and parsed answer sets,
  correct linkage lengths and unchanged current boundary.
- Probe --self-test: 21 lossless representation assertions passed before network
  calls. Reproduce only the local assertion by extracting the archive into a temp
  directory and running bun attribution-probe.ts --self-test; no credential needed.
- bun run check: typecheck passed; 183 tests passed, 182 opt-in tests skipped,
  0 failed. Existing real grammY handler, parser fail-open and contiguous suffix
  regressions remain unchanged; mocked outcomes are not model-quality evidence.

The nonposting probe ran in a temporary directory inside freshly resolved app
container ff915a754524, inheriting its dependency credential and node_modules
without exporting secrets or changing /app, worker, configuration or database.
Runner exited 0 and removed staging. This is candidate-source model evidence,
not deployed-source, actual deletion, or real-account UI verification. No runtime
release is needed for this documentation-only decision; normal review and CI still
apply. General live/UI checks are supplementary, not a completion blocker.
