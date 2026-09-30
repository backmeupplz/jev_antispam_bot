# Heart-only profile evidence boundary (GEN-KANEO-43)

## What is known

The Sep 30 report in Telegram topic 4041081, message 21746 shows a brown
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

The production profile cache validates numeric user/private-chat identity,
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

Model jev-1.13.0, threshold .90, production builder/parser unchanged. Two
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

The requested-heart control remains expected KEEP and the opt-in test
correctly fails it (9 pass/1 fail each run). We did not weaken its expectation,
lower a threshold, add a title/domain blacklist, or adopt a stronger prompt.
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
- All production files, model, threshold, exemptions and telemetry unchanged.

Commands: bun run check; optional authorized
RUN_LIVE_JEV=1 HEART_EVIDENCE_DIR=<task-owned-directory> bun test src/heart-profile.live.test.ts.
The latter is intentionally red on the measured requested-heart false
positive. No UI deletion, exact historical replay, or deployment is claimed.

## Product decision required, not a completed moderation fix

A) Accept the current text-only evidence boundary for this report; preserve
ambiguous hearts and retain these regressions/diagnosis. Address the measured
requested-heart false positive as a focused safety fix, not as evidence that
this reported sender was identified or fixed. Recommended immediate choice:
no expanded collection or speculative punishment.

B) Separately authorize a bounded feasibility/design investigation for
bot-authenticated **avatar text only** (not people/appearance), with strict
identity, byte/time/cache/privacy limits and a reviewable acceptance proposal
before any moderation use. File retrieval is documented, but support for this
specific account and safe OCR/provider behavior still need demonstration.
This would not supply arbitrary private-channel latest posts and is not a
guarantee of catching this report.

Do not join channels, open advertised domains, add a personal-user login,
expand MTProto credentials, crawl history, or substitute channel-post text
into description. A future exact authorized update/field-presence reproduction
could narrow uncertainty without authorizing any of those expansions.
The canonical ticket stays unresolved pending the explicit product choice;
a green test/docs PR is not resolution of the missing-source behavior.
