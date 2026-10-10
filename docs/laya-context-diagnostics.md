# #69 context/instruction follow-up: diagnostic only

Both bounded context-only candidates failed. No bot runtime, prompt, threshold, provider, capture, model cache identity or production deployment changed.

The new offline file runner uses the real bot normalization/request builder and production parser/deletion selection. It covers existing 13 weekend/history cases plus 12 fresh synthetic German staffing/medical controls. Mock-based tests prove plumbing only. Measured model responses use the verified original weight hash (historical config/calibration/tokenizer asset identity was not fully verified; matching baseline scores corroborate behavior only) and unchanged serving Handler with only the two predeclared diagnostic state/question transforms, not score mocks.

Model repository companion: branch diag/69-context-only; context-diagnostic.md and diagnostics/context-69/{manifest,summary,responses,responses.json.parsed}.json. That report contains complete provenance, hashes, results and caveats. Local experiment: /Users/borodutch/.openclaw/workspace/artifacts/69-context-only; requests: artifacts/69-context-requests.json.

At .80: baseline 5/25 failures; attribution schema 6/25; compact policy state 7/25. Both add missed recruitment cases. Attribution has no truncation; compact policy overflows the 768-token budget on mixed history by 21 state tokens, a further rejection reason. All source context remains unchanged before model tokenization, but the truncated case cannot support a preserved-context claim. No broader replay or additional sweep ran.

The German medical screenshot is **not reproduced exactly**: fresh fixtures are a shorter paraphrase with names/link replaced, no thumbnail/destination enrichment or external lookup. Their promotion and protected controls pass baseline and both variants. Actual reported update identity remains uncorrelated, so no production medical miss is explained or fixed.

The actual adapter drops bot category policy instructions; simple edits to those ignored instructions cannot affect its aggregate spam score. Explicit receiving-chat purpose/rules are genuinely absent, but unavailable facts were not invented. Neither result proves context cannot work or that retraining is required. Owner options are original minimal incident context, a trustworthy source of explicit community invitation/rules, or a separately scoped fresh instruction experiment; no automatic training/provider/gate change.

Validation after review fixes: typecheck; 21 focused tests; full 467 pass, 257 skip, 0 fail. Model diagnostic suite: 17 pass. No inference was repeated. Production original ckpt-v2/.80 remains unchanged. These branches are reviewable evidence, not remediation or a release claim.

Review correction: parse now requires the complete registered 3×25 variant-fixture matrix before any output; empty, missing, duplicate and unknown variant/fixture rows fail closed without replacing existing parsed evidence. Model future runs require a reviewed full local checkpoint asset manifest; that safeguard does not retroactively attest the unchanged historical evidence.
