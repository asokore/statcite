# Security Policy

## Reporting a vulnerability

Email **hello@statcite.com** with details. You will get a human reply; there
is no bug-bounty program. Please do not open a public issue for anything
exploitable before it is fixed.

## Scope and posture

StatCite is a stateless Cloudflare Worker with **zero runtime dependencies**. No npm packages execute in production, which removes the supply-chain
surface entirely. There are no accounts, no sessions, no cookies, and no
stored user data: every request is anonymous and the only telemetry is
aggregate counters drawn from closed sets (see `site/privacy.html`; enforced
structurally in `server/src/core/analytics.ts` and proven by
`server/test/analytics.test.ts`).

Relevant properties:

- All upstream fetches go to a fixed allowlist of official statistical APIs
  over HTTPS; response bodies are validated before caching
  (`server/src/core/upstream.ts`).
- The MCP endpoint accepts JSON-RPC over POST only; batch size and string
  lengths are capped; tool errors are tool results, never crashes.
- REST endpoints are GET-only except `/v1/verify_claims` (POST, 15-claim
  cap). Per-IP rate limiting runs at the Cloudflare edge.
- No secrets exist in the Worker beyond Cloudflare's own bindings; the
  repository is public and the deploy path is `wrangler deploy` from CI or
  the maintainer's machine.

## Supported versions

The production deployment at statcite.com always runs the latest tagged
release; there are no maintained older branches. If you pin the Apify actor,
update to the newest build, data-integrity fixes are not backported.
