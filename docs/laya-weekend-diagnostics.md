# #69: Laya weekend recruitment diagnostics — not a fix

This is a **partial diagnostic harness, not remediation or a review-ready fix**.
Runtime classifier, prompts, serving checkpoint, .80 bot gate, cache and production
configuration are unchanged. No safe correction has been established. Green
offline tests certify plumbing and truthful failure reporting, not model acceptance,
deployment or Telegram cleanup.

## Synthetic evidence, 2026-10-10

All fixtures are synthetic. The offer is a screenshot-inspired reconstruction;
spacing and line breaks are not authenticated. The visible announcement is a
manually reconstructed fragment ending in an ellipsis. The short announcement is
invented; the 766-character version repeats/cuts it to reproduce a structural
length, **not** the original source. These cannot identify or replay the historical
candidate message, whose content-free log showed KEEP .6843. Historical correlation
remains unproven.

The parent's bounded deployed serving probes used the real bot normalization and
request builder and measured the full 13-case laya-jev-ckpt-v2 baseline at the
unchanged .80 gate:

| Synthetic case | Aggregate probability | Observed decision | Label |
| --- | ---: | --- | --- |
| standalone offer | .9171 | delete | delete |
| unrelated visible fragment | .8083 | delete | delete |
| unrelated short announcement | .8583 | delete | delete |
| unrelated synthetic 766-character source | .8881 | delete | delete |
| requested staffing reply | .8147 | **delete, false positive** | keep |
| unpaid volunteers | .8195 | **delete, false positive** | keep |
| warning replying to offer | .6469 | keep | keep |
| moderator report replying to offer | .7104 | keep | keep |
| job seeker | .3984 | keep | keep |
| agreed shift/payment | .1782 | keep | keep |
| wages discussion | .1092 | keep | keep |
| mixed-history | .5158 | **keep, false negative** | delete |
| requested-history | .5723 | keep | keep |

All 13 measured responses reported no model truncation (zero dropped state tokens).
The mixed-history linkage probabilities were [0, 0, 0], missing the two unsolicited
historical offers (expected links [false, true, true]); requested-history returned
[0, 0], correctly protecting both requested replies. Neither selected any deletion
IDs. The full baseline therefore fails acceptance on mixed-history as well as the
requested and volunteer false positives. Fixture ellipsis/cutting and model
truncation are different facts. The synthetic mixed-history false negative does
not establish a replay of the historical incident. All 27 static question answers
carried the same aggregate score; strongestSignal is not evidence of an
independently assessed category.
The serving adapter uses its compact SPAM_QUESTION, not the bot's per-question
prose as independent classifier prompts.

Two actual-serving compact SPAM_QUESTION experiments were rejected: the unrelated
short positive fell to **.7064** and **.7333**, respectively, both false negatives
at .80. This harness does not ship either experiment or pretend that improving a
control alone is a safe fix. Serving LAYA_GATE .81 was separately observed for
history-link optimization; the bot gate remains .80, and this harness changes
neither. A bounded training candidate was also rejected; it is not a safe fix and
was not adopted. These diagnostics remain partial, not remediation.

Evidence provenance (parent's private workspace artifacts, not required to run):
artifacts/69-cases.json, 69-live-results.jsonl, 69-live-unrelated-visible.jsonl,
69-prompt-results.json and the untracked probe69.ts/probe69-full.ts. Throwaway
scripts and raw artifacts are not committed. Recorded scalars in the fixture
module reproduce the 11 no-history measurements; the two history measurements
are documented above. Offline mock responses reconstruct the aggregate adapter shape.
Formatting entities added for Telegram validity tests do not change normalized input.

## Offline validation

Run bun run typecheck and bun test src/laya-weekend.test.ts (or full bun test).
No live environment or paid TypeSafe call is needed. Real grammY new/edit updates
route through production handlers, normalizer and complete JevSpamClassifier parser;
only external Telegram/model boundaries are mocked. Tests cover requested/source
attribution, unrelated source variants, edit history replacement, actor isolation,
full dynamic linkage questions, missing-answer fail-open and linked-suffix selection.
Mocked probabilities prove routing, **not classification correctness**. Recorded
requested/volunteer false positives produce accepted:false; a passing diagnostic
test checks that they are exposed, not relabelled as legitimate deletions.

Cache tests reuse only identical actor/context (ignoring current message ID/time),
distinguish changed source, other actor and model identity, and disable reuse with
history. If serving behavior/checkpoint changes later, give it a distinct model
identity/configuration: keeping the same model ID does not automatically invalidate
an existing cache just because remote weights changed. No cache change is made here.

## Explicit bounded Laya evaluation

Provide protected environment variables RUN_LAYA_WEEKEND_EVAL=1, LAYA_EVAL_URL
(full Laya /v1/systemone endpoint), LAYA_EVAL_MODEL (exact expected laya-... model
identity), and LAYA_EVAL_KEY. Then run:

    bun run src/laya-weekend-evaluation.ts

There is no default endpoint, credential lookup, TypeSafe fallback, retries,
Telegram mutation, profile enrichment, or training capture. Do not put credentials
in shell arguments or logs. The endpoint must be operator-authorized Laya; the
runner canonicalizes trailing-dot hostnames and explicitly rejects typesafe.ai
and all its subdomains. Its runner-only fetch rejects redirects, so requests and
credentials cannot follow an unvalidated redirect target. Production transport is
unchanged. It makes at most 13 sequential requests
(11 pairs/controls plus mixed and requested-history controls), 15 seconds each,
and stops on the first transport/parser failure. The gate is fixed at .80.
Run once per explicitly selected baseline/candidate and keep their outputs separate;
never silently replace the expected model identity to accept an unexpected response.

JSONL emits fixture IDs/source-form labels, full parsed current verdict and all
static signal probabilities, every context probability/link, selected synthetic
message IDs, requested/returned model, route and model-truncation metadata. It does
not emit message/source/profile text, requests, credentials or provider errors.
The full parser rejects incomplete static or linkage answers. Exit status is
nonzero for any label/linkage mismatch (including known false positives), wrong
returned model, missing/true truncation metadata, or request/parser failure.
No acceptance failures are hidden behind successful transport or parsing.
