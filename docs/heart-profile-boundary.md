# Heart-only profile evidence boundary (GEN-KANEO-43)

## What is known

The Sep 30 report in Telegram topic 4041081, messages 21745/21746, shows a brown
heart replying to an unrelated channel post. Its second screenshot shows a
personal-channel title, a promotional **channel-post preview**, and branding
in an avatar. It does not show a user bio or establish channel description
contents. No screenshot content has been relabeled as API profile metadata.

The supplied privacy-safe production records correlate a two-character,
non-media current message with fresh user/channel profile lookups, a channel
reply preview, no same-actor history, and a completed KEEP. Adult-profile
score was .20; the highest signal was quoted-promotion amplification .63.
The previous linked-channel exemption belongs to the source post, not its
human replier. Time/order/shape correlation is strong, not exact identity
proof. Sender ID, original update, and exact returned profile fields are
not available. We did not collect historical updates, guess the identity,
query the reported username as a user ID, or capture raw production content.

## Retrieval versus model boundary

The production profile cache at the report baseline validates numeric user/private-chat identity,
then validates the personal channel ID/type. It projects only optional bio,
channel title, and optional description. A title alone produces both
user:present and channel:present. Those outcomes cannot prove that the
promotional screenshot text was supplied to the model. Cache/failure labels
also do not identify which text fields were present.

The [Bot API ChatFullInfo contract](https://core.telegram.org/bots/api#chatfullinfo),
checked Sep 30, exposes personal_chat as Chat metadata, optional bio,
optional channel description, photo file references, and optional
pinned_message. A pinned message is not the latest channel post or the
personal-channel post preview shown by the client. The inspected production
path uses neither pinned_message nor photo files. The documented schema has
no personal-channel latest-post-preview field. getUserProfilePhotos/getFile
can support a separately designed bot-authenticated image retrieval path;
that is not OCR and does not establish this sender's available photo or
permission to add image analysis. No such retrieval/analysis was attempted.
The docs fetch was size-truncated beyond the inspected schema; this is not
a claim to have exhaustively disproved every Telegram API capability.

**Conclusion:** the screenshot's independently explicit promotion resides
in sources outside the existing model input. Whether the real user also had
sufficient bio/description text is unknown. No prompt change can recover
missing content; conversely the synthetic comparison below gives no evidence
that an unrelated legitimate reply erases explicit supplied profile evidence.
Neither a heart nor a title such as Private Secret alone justifies deletion.

## Synthetic comparison, unchanged pinned model

All fixtures in src/fixtures/heart-profile.ts are synthetic, not a recovered
update or live profile. In particular the explicit description/bio is a
counterfactual sufficient-evidence control, not the screenshot post preview.
Candidate-source tests ran in an isolated temporary directory in the existing
application container, using its credential without exporting it or modifying
/app, service configuration, persistent state, or the running bot. The
staging directory was removed. Only synthetic Jev requests were sent.

Model jev-1.13.0, threshold .90, baseline production builder/parser unchanged. Two
bounded baseline runs returned the following adult_profile_bait scores:

| Synthetic input | Run 1 | Run 2 | Parsed result |
| --- | ---: | ---: | --- |
| Title only + unrelated source | .30 | .29 | KEEP |
| No profile + unrelated source | .05 | .04 | KEEP |
| Ordinary private channel | .03 | .04 | KEEP |
| Explicit description, standalone | .97 | .97 | DELETE |
| Same explicit description, unrelated channel reply | .94 | .94 | DELETE |
| Same description, forwarded source with unknown author | .94 | .94 | DELETE |
| Explicit bio + unrelated source | .93 | .93 | DELETE |
| Substantive technical contribution, same explicit profile | .33 | .32 | KEEP |
| Explicitly requested heart, same explicit profile | .90 | .90 | DELETE — existing false positive |
| Requested sticker, same explicit profile | .92 | .92 | KEEP via media gate .17/.19 |

In that baseline, the requested-heart control was expected KEEP and the opt-in test
correctly failed it (9 pass/1 fail each run). We did not weaken its expectation,
lower a threshold, add a title/domain blacklist, or adopt a stronger prompt then.
This safety finding argues against blindly making profile detection more
aggressive. It is not a successful fix for the original screenshot.

The second run retains complete synthetic requests/questions and responses
in workspace artifacts/gen43/exchanges/*.json; the first log interleaved
stdout/stderr and is superseded for structured request evidence. Both
standalone baselines have zero history and therefore zero dynamic linkage
questions/answers. Real-handler regressions separately exercise one retained
unrelated same-actor message, the context_message_0 question/answer, parser,
and deletion selection. Artificial scores prove routing, not model recall.

## Deterministic coverage

- Real grammY handleUpdate for emoji/custom-emoji, new/edited replies,
  standalone messages, unknown/other-author sources and requested replies.
- Official linked source exemption does not transfer to its human replier.
  A confirmed synthetic current verdict cannot delete the source, another
  actor's message, or unrelated same-actor history.
- Fresh/cache title-only, bio-only, partial channel-invalid, empty and failed
  profile lookups; edit replacement retains no duplicate current history.
- Title-only projection cannot silently borrow pinned-post text or photo IDs.
- Existing real-handler sticker/media, failure, request, linked-suffix and
  malformed-response regressions remain unchanged in the full suite.
- At the baseline checkpoint, production files, model, threshold, exemptions and telemetry were unchanged. The public-context implementation described below supersedes that tests-only checkpoint.

Commands: bun run check; optional authorized
RUN_LIVE_JEV=1 HEART_EVIDENCE_DIR=<task-owned-directory> bun test src/heart-profile.live.test.ts.
At the baseline checkpoint the latter was red on the measured requested-heart
false positive. Candidate results below are separate from that baseline.
No UI deletion or exact historical replay is claimed.

## Authorized public-context follow-up (#21749)

The subsequent request #21749 explicitly authorizes bounded accessible
sender-owned personal-channel posts and their links. This supersedes the
earlier text-only-versus-OCR decision proposal: no further collection
permission is required for this narrow public-post scope. Avatar OCR,
appearance analysis and external advertised-site fetching remain excluded.

A benign capability check of the official public https://t.me/s/telegram
channel on Sep 30 returned HTTP 200, 127,692 HTML bytes and 20 structurally
identified posts with visible text/link containers. The implementation parser
accepted the latest two complete posts (IDs 460/459; text lengths 205/142;
four links each) without retaining or publishing their text. This establishes a
public-web capability, not accessibility of the reported sender’s channel.
The original numeric sender ID, exact update/profile fields and personal
channel handle remain unknown; no exact historical replay is claimed.

The implementation validates a fresh numeric private user → personal_chat
channel association and channel ID → public username before requesting any
public-web page. It admits only the canonical HTTPS Telegram /s/<username>
page with pinned public IPv4 TLS, no redirects, no private joins and no
external advertised-site fetch. At most two complete, owner-matched,
nonforwarded recent posts (each ≤1,200 characters) and at most four links
per post reach the classifier. The two-message recent sample does not
guarantee the screenshot-highlighted post is among them. POST content is a
separate typed field, not channel description.

The finite per-update public-web envelope is four distinct URLs, six requests
and ≤576 KiB reserved bytes over 4.5 seconds, with global concurrency four.
Post pages may use up to 256 KiB; destination pages remain capped at 64 KiB.
Telegram links in a post have one nonrecursive preview level; external links
are string evidence only. Timeouts, 429s, private/unavailable or generic
pages fail open without invented content. Profiles retain the original
ten-minute cache, while public post pages use bounded positive/negative
cache TTLs; fresh numeric ownership is revalidated before each public-web
lookup even when the profile entry was cached.

Public-post input must remain separate from bio/description, attributed only
through the validated actual sender’s personal channel, with bounded shared
fetch budgets. Private/unavailable pages and generic landings yield no invented
content. A public recent-post sample cannot promise the exact profile-highlighted
post when Telegram supplies no locator. A green tests-only baseline is not a
completed enrichment implementation.

Do not join channels, open advertised domains, add a personal-user login,
expand MTProto credentials, crawl history, or substitute channel-post text
into description. Any later exact authorized update reproduction narrows
uncertainty without authorizing those expansions.

## Historical bounded calibration result (Sep 30 continuation)

The KEEP policy in this section was superseded by #21968; inputs and scores
are retained unchanged as historical evidence, not current release guidance.

The public-context candidate adds an explicit requested-heart safety clause to
adult_profile_bait and source labels for public posts. With that clause, the
predecessor 20-case run was 18 pass / 2 fail: supplied public-post heart .86,
post plus Telegram destination .81 (both KEEP), standalone post .92 DELETE,
and requested description/post hearts .52/.52 KEEP. These are synthetic
inputs, not the reported sender's recovered metadata.

Two further wording variants were tried, without changing model, .90 gate,
fixtures, parser, or history linkage contract:

| Candidate | Public-post reply | Post + destination | Standalone post | Requested hearts (description/post) | Result |
| --- | ---: | ---: | ---: | ---: | --- |
| A: rewrite question and explicit source attribution | .88 KEEP | .82 KEEP | .93 DELETE | .46/.57 KEEP | 15 pass / 5 fail |
| B: retain question, add post-evidence equivalence | .86 KEEP | .83 KEEP | .93 DELETE | .55/.54 KEEP | 18 pass / 2 fail |

A additionally lost three explicit-bio/description positives (.86–.88).
Neither candidate fixed the two targeted reply misses, so **both wording
variants were rejected** and the predecessor criterion retained. No third
wording sweep, forced-positive rule, lower threshold or weakened fixture was
introduced. The requested-heart safety clause remains; the original
production false positive is not restored.

All 40 responses passed the real production parser and included every
requested question answer. The public-post-heart case included the actual
context_message_0 request/answer and parsed unrelated-history linkage .06
in each run, below the separate .75 linkage gate. No other-author source or
post is a deletion candidate. The full synthetic input, complete questions,
responses and parsed results are retained under workspace
artifacts/gen43/candidate-18eb-a/ and candidate-18eb-b/ (exchanges, summary.json,
live.log and exact staged source.tar). Candidate-source runs used container
763ee2eef4af in task-owned temporary directories, removed after completion;
they did not deploy code or modify /app, the service, or stored credentials.

**Residual product boundary:** bounded public retrieval supplies the missing
source type, but the pinned model still does not confidently delete the
supplied rich-post reply cases. This is measured recall failure, not a missing
live-test credential or mere absence of UI proof. Exact historical retrieval
and deletion remain unproved because the real sender/update is unavailable.
The enrichment must not be described as resolving that original miss.
This was the Sep 30 decision boundary, not current release permission.
On Oct 1, Nikita answered the choice (Telegram #21941): pursue stronger
detection of the combined emoji + sender-owned profile + attached promotional
channel post. Enrichment-only release accepting the known miss is rejected.
The same PR must demonstrate the actual combined positive outcomes and close
negative controls with a scoped, independently reviewed detection strategy.
The .90 gate, fail-open behavior, source attribution and existing public-access
bounds remain unchanged; no forced-score/blanket-emoji rule is authorized.
The stronger policy work is already authorized: do not ask that same question
again or create an evaluation-only clone. A model change must be explicit and
reviewed, not a silent provider/version substitution. No new collection
permission is needed for the already-authorized public-post scope.

The opt-in fixtures retain their intended positive/negative expectations;
known model misses remain visible, never silently reclassified as legitimate.
General review/CI is separate from opt-in model-test execution; a confirmed detection miss on the acceptance target remains release-blocking.


## Oct 1 stronger-policy investigation (rejected candidates)

The follow-up kept the 20 original synthetic fixtures and intended labels,
`jev-1.13.0`, .90 deletion gate and complete original response/linkage parser.
No historical update/profile was recovered. Two bounded policy rewrites were
followed by a distinct focused-adjudication strategy, not repeated retries
until a score happened to cross:

| Candidate | Change | Public-post reply | Post + destination | Standalone post |
| --- | --- | ---: | ---: | ---: |
| A | Whole attributed funnel, no separate profile CTA required | .89 KEEP | .87 KEEP | .92 DELETE |
| B | Observable conjunction instead of inferred hidden motive | .89 KEEP | .88 KEEP | .87 KEEP |
| C | B's profile question in a separate same-model request, full state retained | .90 DELETE | .88 KEEP | .86 KEEP |
| D | Original profile criterion in focused request with profile-specific attribution instructions | .85 KEEP | .87 KEEP | .94 DELETE |

All four preserve the existing negative controls, but lose additional intended
bio/description positives. C's isolated crossing is not acceptance: it still
misses the destination and standalone cases. All four were rejected. The
focused two-call runtime and rewritten prompts were reverted; this follow-up
ships **no runtime modification** to the enrichment candidate.

A final diagnostic E asked three atomic model questions alongside the complete
original classifier questions: explicit sender-owned offer, low-information
reaction, and uninvited/non-conversational context. The original production
parser still parsed all original signals/linkage; additional component values
were separately validated. The experimental derived policy score
`max(0, offer + reaction + uninvited - 2)` was diagnostic only, not inserted
into a model answer, used to delete, or represented as a calibrated spam
probability. It requires no independence assumption, but model numbers alone
do not prove mathematical probability calibration.

- Public-post reply components: .94 / .95 / .86; derived score .75.
- Post + destination components: .95 / .95 / .81; derived score .71.
- Requested description/post hearts: context component .05/.06, derived 0.
- All 20 diagnostic derived scores remain below .90, including every intended
  positive. A successful probe process means complete evidence collection,
  **not successful detection**. This candidate was also rejected.

These probes suggest that interpreting the reaction's conversational purpose,
rather than recognizing the explicit offer or emoji, is a limiting factor.
Independent strategy review identified a material
boundary: the fixture source about being tired of maintaining tools can
plausibly receive a sympathetic heart. Absence of an explicit request is not
proof of promotional outreach. Future acceptance must include spontaneous
sympathy, congratulations, thanks, grief support, acknowledgement and joking
with the SAME promotional profile and no explicit emoji request. Do not erase
that ambiguity by removing the contextual question, relaxing its semantics,
rounding scores upward, or selecting the maximum across retries. The existing
intended positives remain visible; they were not silently relabeled.

Provider documentation checked Oct 1 lists only `jev-1.13.0` as the current
model; `jev-latest` and `jev-preview` resolve to it. There is no documented
newer Jev version to substitute. Its jaggedness guidance recommends atomic
questions but also warns about indirection and contextual calibration:
https://docs.typesafe.ai/models and
https://docs.typesafe.ai/model-jaggedness/jev-1.13.

Full synthetic requests, response answers, source archives and logs remain in
workspace `artifacts/gen43-fix-b07/candidate-{a,b,c,d,e}/`, with a compact
`summary.json` one level above. All probes used isolated task-owned temporary
staging in container 763ee2eef4af and removed it afterward; no service, /app,
credential, production-content logging, or advertised external-site change.

**Release remains blocked on the detection target**, not optional UI testing.
The Oct 1 authorization is not withdrawn or awaiting the old decision. A new
boundary is whether to evaluate a second-stage reasoning classifier outside
the current Jev service (additional provider exposure, latency and API cost),
or remain Jev-only with this known unresolved behavior. No such provider or
credential change has been made. Any new strategy must retain the same bounded
source attribution, false-positive controls, parser/handler proofs and
independent review before release.

## Historical Oct 1 requested 0.81 gate: assumed-KEEP results

**Superseded by Nikita #21968.** The following original interpretation and
labels are retained for audit only. These synthetic reactions were assumed
KEEP, not verified real legitimate messages; the later explicit policy makes
the emoji-only promotional-profile forms DELETE, including requested emoji.
References below to a current release hold or required decision are historical.

Nikita's Telegram #21951 explicitly authorizes evaluating/implementing a global
0.81 deletion gate and supersedes both the old unchanged-.90 restriction and
the second-provider question. No new provider is authorized. This is a score
threshold across **all** moderation categories, not calibrated 81% correctness.
The separate history-linkage threshold is 0.75 and must not change.

Call-site audit: loadConfig reads SPAM_THRESHOLD (default .90, allowed .5–1);
index.ts passes spamThreshold to JevSpamClassifier. parseAssessment compares the
maximum non-media signal inclusively with that threshold. Media-only input uses
only media_profile_funnel at the same gate. bot.ts consumes shouldDelete and
selects a contiguous history suffix using CONTEXT_LINK_THRESHOLD (.75); media
never selects earlier messages. No hidden category override was found.

An offline paired replay of all 20 retained candidate-9a71 exchanges first
verified **exact full request equality** against the current request builder,
then replayed original answers through JevSpamClassifier/parser at .90/.81.
The target heart changed KEEP→DELETE (.86); destination changed KEEP→DELETE
(.81); existing negative labels stayed KEEP. Rejected criterion variants are
not source-equivalent and are not pooled as current-source calibration.

A fresh 30-case synthetic-only candidate-source run at pinned jev-1.13.0 used
one real request per fixture, replaying that same response at the old gate.
Labels were fixed before calls; all required signal/linkage answers were
present. Result: **28 passed, 2 failed** at .81:

| Case | Score | .90 | .81 | Intended |
| --- | ---: | --- | --- | --- |
| Public-post heart reply | .85 | KEEP | DELETE | DELETE |
| Public-post destination | .79 | KEEP | KEEP | DELETE |
| Spontaneous congratulations, same promotional post/profile | .83 | KEEP | DELETE | KEEP |
| Spontaneous grief support, same promotional post/profile | .69 | KEEP | KEEP | KEEP |
| Spontaneous grief support, explicit promotional description | .72 | KEEP | KEEP | KEEP |
| Requested post-heart / description-heart | .49 / .52 | KEEP | KEEP | KEEP |
| Requested recruitment / link / media | .51 / .34 / .28 | KEEP | KEEP | KEEP |
| Unsolicited recruitment / mixed-history invite | .92 / .95 | DELETE | DELETE | DELETE |

The false-positive control is a brown-heart reply to “My daughter graduated
today! I am so proud of her.” by an ordinary participant who owns the SAME
synthetic promotional profile/post as the target. No explicit emoji request
is necessary for this ordinary congratulatory response to be legitimate.
Do not relabel it spam merely to satisfy the target or select maximum scores
across retries. It newly crosses .81 on adult_profile_bait. The post+destination
positive's .79 also demonstrates that .81 is not a reliable fix by itself.
No claim about population error rates follows from this small synthetic set.

The captured synthetic full request/response is committed as
src/fixtures/threshold-celebration-response.json. Four real bot.handleUpdate
replays (new/edit at each gate, custom emoji, actual profile/public-post
normalization, exact classifier request equality) prove .90 keeps and .81
would delete only the current reply, not its source. The deterministic test
asserts the **observed regression**, not that deletion is desired. The opt-in
live test retains KEEP as its expected label. Boundary tests cover below/at/
above .81 for every text signal and media, complete-parser failure behavior,
and the independent .75 contiguous suffix. The config test proves an explicit
SPAM_THRESHOLD=.81 reaches loadConfig while default remains .90 on hold.

Artifacts: workspace artifacts/gen43-3bbb/evaluation/{source.tar,live.log,
exchanges/}, retained-comparison.json. All are synthetic; no real profile or
message captured, no advertised site visited. Candidate staging ran in current
container 763ee2eef4af and was removed; /app, service configuration and worker
were unchanged. These are candidate-source model and handler results, not
deployment or UI proof. Original sender/update and exact profile remain unknown;
the observed historical .63 score would not cross .81 without enrichment.

**Deployment is blocked on this concrete legitimate-message regression**, as
required by the latest decision—not because lowering .90 was unauthorized.
The default/environment and runtime policy have deliberately NOT been changed.
Do not merge this as a detection fix or deploy enrichment-only. Report the
regression for a scoped decision; do not silently pick a different threshold,
provider, forced score or alternate criterion. Prior investigation tables above
are retained historical evidence, not current release authorization.

## Current policy: Oct 1 #21968 (supersedes earlier holds)

Nikita explicitly chose DELETE for emoji-only messages with actual sender-owned
explicit adult/private-content registration or paid-content promotion, including
celebration, bereavement, requested emoji acknowledgements and prior benign
participation. The old spontaneous-reaction KEEP labels were assumptions in
synthetic fixtures, not verified legitimate production messages. Inputs and old
scores/labels above and in threshold-celebration-response.json remain intact;
changing these expected labels is a declared policy change, not improved accuracy.

The adult_profile_bait question now asks about this observable combination,
including separately attributed public posts and their Telegram destination
metadata, rather than requiring the model to infer the sender's hidden intent.
Benign/missing/title-only profiles, substantive text, requested textual links,
warnings/reports and unknown media retain their protections. No hardcoded
handle/domain, score override, provider change, avatar analysis or new retrieval
permission was added. Other-author source posts and public profile posts are
never deletion candidates. The separate .75 linked-suffix gate is unchanged.

One fresh bounded 30-case pinned jev-1.13.0 comparison passed all 30 at the
previously authorized .81 global gate, with complete request/answer/parser and
linkage checks. Same responses at .90 retain misses; .81 is therefore the new
source default and .env.example value. This changes ALL categories, not just
profile bait, and is not an 81% correctness guarantee.

| Synthetic case | Candidate score | .90 | .81 / new policy |
| --- | ---: | --- | --- |
| Public-post heart with benign prior participation | .91 | DELETE | DELETE |
| Public-post destination (previous .79 miss) | .87 | KEEP | DELETE |
| Celebration / sympathy public-post replies | .91 / .90 | DELETE | DELETE |
| Sympathy with explicit description | .85 | KEEP | DELETE |
| Requested heart description / post | .81 / .85 | KEEP | DELETE |
| Benign / unavailable / title-only profile | .14 / .09 / .09 | KEEP | KEEP |
| Substantive text description / post | .68 / .46 | KEEP | KEEP |
| Requested textual channel link / warning | .72 / .29 | KEEP | KEEP |
| Requested recruitment / link / media | .52 / .32 / .30 | KEEP | KEEP |
| Unsolicited recruitment / mixed-history invite | .92 / .95 | DELETE | DELETE |

These are one-run measurements, not guaranteed future model scores or population
false-positive estimates. The requested-description heart lies exactly on .81;
no score rounding/boosting or retry maximum was used. Thirty full synthetic
exchanges and staged source are in workspace artifacts/gen43-d060/evaluation.
Seven exact full request/response captures are committed under
src/fixtures/policy-21968 and replayed through the real grammY handler for
new/edited plain/custom emoji forms, including keep controls. The historical .83
capture is replayed only as old-score routing, not current-prompt acceptance.

Release gate: independent exact-head review, green CI, current-main merge and
managed Easypanel deployment. Inspect the existing service env and merge only
SPAM_THRESHOLD=.81 if explicitly set; never assume the source default overrides
production env. Verify actual deployed commit, source and effective model/gate,
healthy startup and fail-open tests. This implementation stage is not deployment
or real-account UI proof. Exact historical sender/update/profile remains unknown;
the original incident is not claimed replayed or retrospectively deleted.
