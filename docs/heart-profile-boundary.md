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

## Bounded calibration result (Sep 30 continuation)

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
General review/CI is a separate gate from these optional model diagnostics.


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

The bottleneck is not recognizing the explicit offer or emoji, but interpreting
its conversational purpose. Independent strategy review identified a material
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
