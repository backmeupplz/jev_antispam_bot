# Pinned Telegram preview TLS (GEN-KANEO-41)

The managed Easypanel Nixpacks 1.41.0 build runs Bun 1.3.0, independently of the Dockerfile and previous CI pin (1.4.0). On 1.3.0, `node:https` custom lookup synthesizes `Host: t.me:443` and uses that authority for TLS identity; the validated public IP succeeds without custom lookup but fails with `ERR_TLS_CERT_ALTNAME_INVALID` when pinned. Explicit `servername` alone does not fix it. Bun 1.4.0 accepts the original request.

Set the exact admitted `Host: t.me` explicitly. Keep the original URL, validated IPv4 lookup callback, normal CA and hostname verification, manual redirect admission, deadline and byte limits. No insecure TLS flags, new outbound hosts, runtime upgrade, environment changes or unpinned retries.

## Deterministic regression

`bun test src/telegram-preview.tls.test.ts` creates ephemeral test CA/leaf certificates using `openssl` (required on test/build hosts), binds a loopback HTTPS server, and exercises the production request options with only the validated-IP-to-local-socket seam substituted. The valid t.me certificate succeeds; a trusted certificate for another hostname and an untrusted certificate both fail before HTTP handling. No global CA trust is changed. Temporary keys are deleted.

The test fails on deployed Bun 1.3.0 with the explicit Host removed and passes with it restored. CI now runs the full suite on both 1.3.0 and 1.4.0, including PostgreSQL integration. Existing tests retain DNS admission, both callback shapes, redirects, body caps, deadline capacity and real-handler failure/context coverage.

## Candidate runtime evidence (not deployment)

On 2026-09-28, an isolated candidate under `/tmp/gen41-candidate` in the existing managed bot container ran against its Bun 1.3.0 and installed dependencies, without changing `/app`, service config, env, DB, worker or persistent state. The directory was removed afterward.

- Real TLS regression: pre-fix fails with hostname mismatch; fixed passes including invalid-certificate controls.
- Preview + real-handler deterministic suites: 115 pass, 0 fail.
- Authorized public rich fixture: available; title 70 characters, description 218; 66 ms.
- Generic landing page: unavailable, no metadata; 21 ms (not a network error).
- Simulated lookup failure: one model-builder/parser invocation, message and reply context preserved, zero deletions/skips. Telegram/model boundaries were synthetic; no real-account UI action or live model scoring claimed.
- Candidate runtime module SHA-256: `a3085fc91650648336fbc127c065e7c7992533bbe534e71472647f837c9a2d53`. Local source and container hashes matched.

## Release handoff

Reviewer must obtain green exact-head and merged-main matrix CI, merge, inspect existing Easypanel actions before triggering the managed bots/jev-antispam-bot rollout, preserve its env/DB/state, and verify action completion, running commit/task and deployed module hash. Repeat public-rich/generic/fail-open checks against deployed source; do not call this candidate evidence a rollout. Only after that verification return predecessor GEN-KANEO-40 to Done alongside this correction. Raw invites and fetched text must not appear in logs.
