# Media-profile fixture disposition (GEN-KANEO-36)

## Observed evidence, not a confirmed recall miss

The two former `explicit unsolicited campaign context` cases in
`src/media.live.test.ts` differed only in current-message forwarding. Both
contained empty current text, the same promotional personal-channel metadata,
no recent same-actor messages, and a same-chat reply preview whose
`sourceAuthor` was `other_author`. Its text accused the sender of spamming
heart stickers to advertise paid videos. It did not independently establish
that the sender was using this particular media as an unsolicited hook.

The prior candidate evaluation at
`c42086b7dae47e8761240f81449ea6439c3aed13` recorded media scores 0.56
(nonforwarded) and 0.54 (forwarded), below the unchanged 0.90 gate. Six
requested/ambiguous controls with the **same** promotional profile scored
0.16–0.32 and kept. Alternative prompts raised the accused cases only to
0.81–0.86 and were not adopted. These are historical measurements from
`/tmp/gen31-ac3-live.log` and `/tmp/gen31-ac3-sweep.log`, not new runs
or production deletion evidence. The original hearts screenshots lack exact
group/message correlation and cannot fill this evidence gap.

**Disposition:** relabel both accused cases as uncorroborated third-party
accusation controls with expected keep. The positive label was unjustified;
these scores do not demonstrate a classifier recall defect. A promotional
profile, a heart/sticker, forwarding, and somebody else's accusation do not
together authorize a forced positive. No prompt, production code, threshold,
actor attribution, or response score is changed by this PR.

## Separate, authoritative attribution fixtures

Shared synthetic fixtures now add two explicit campaign cases, each in
forwarded and nonforwarded current-media forms:

- A direct reply to the current sender's own, nonforwarded, same-chat statement
  linking their stickers to an unsolicited paid-profile signup campaign.
- That same statement in the receiving-chat/current-actor's observed text
  history. The real-handler test establishes it via a preceding update rather
  than injecting arbitrary history.

“Authoritative” means Telegram-shaped actor/chat attribution, **not** that
self-authored text is trusted instructions or every self-reply is spam. These
are synthetic policy positives, not reconstructions of the screenshots and
not newly measured live successes. They explicitly connect the media to the
promotion; same ownership of a promotional profile alone does not.

Requests for a screenshot, video and sticker, standalone ambiguous media,
and the accusation retain identical promotional profile metadata. Separate
normalization controls preserve unknown attribution for forwarded/missing
source identities, external-chat origin, and user/channel namespaces; they
never promote those sources to same-chat same-actor evidence.

## What the tests prove

- Real grammY handlers → production Jev request builder → response parser →
  deletion selection, replacing only Telegram and classifier HTTP boundaries.
- Exact normalized current/recent state; complete dynamic context questions
  and answers; the media gate at 0.90, with high text scores unable to delete
  below-gate media (the existing 0.899 boundary test remains).
- Only current media can be deleted, even with 0.99 historical linkage; a
  reply source is never a deletion target. Missing/invalid media answers and
  missing required context answers fail open through the real handler.
- Existing requested-media, admin, unavailable-profile, text/caption, history
  isolation and privacy regressions remain in the full deterministic suite.

Mock probabilities prove routing and decision behavior, **not** model recall.
Optional pinned-model evaluation uses the same fixtures and real parser:

```sh
RUN_LIVE_JEV=1 bun test src/media.live.test.ts
```

It requires an authorized `TYPESAFE_API_KEY`. This implementation does not
rerun live/model/UI tests and makes no new calibration or Telegram UI claim.
A future measured miss on the attributed positives would be a distinct
recall observation to investigate, not permission to lower 0.90. For General,
review, deterministic tests and green CI are the acceptance gates; optional
live/UI checks do not block merge or normal deployment.
