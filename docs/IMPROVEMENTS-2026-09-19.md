# Improvement pass, 19 September 2026

Six lenses were run over the repository and the live service: the correctness of
the answers, what an agent experiences, the website and the documents agents
read, the test suite as a protective instrument, cost on the free plan, and the
deferred rows in REVIEW-2026-09-12.md. Every proposal was then handed to a second
pass whose job was to refute it. Seventeen survived and are in 1.13.0. One was
refused outright.

This file records the reasoning, so the next pass starts here rather than
rediscovering the same ground.

## Shipped in 1.13.0

| Area | What was wrong | Where |
|---|---|---|
| Verdict | A sign-reversed claim near zero was graded "match" and explained as "consistent", beside a 403% relative difference | `core/verify.ts` |
| Verdict | The adjacent-year diagnostic fired on exactly correct claims, 36% to 43% of them on three real series | `core/verify.ts` |
| Verdict | An ECCU coverage gap threw, so verify_claims counted Anguilla and Montserrat as errors | `core/verify.ts` |
| Series | A year window plus yoy or pct_change silently dropped the first requested period | `core/series.ts` |
| FX | A bridged cross rate carried whichever leg resolved first as its date | `core/fx.ts` |
| Agent | `search` emitted ids `fetch` was guaranteed to refuse | `tools.ts` |
| Agent | A failed claim carried prose only, with no code or details | `tools.ts` |
| Agent | REST bodies told HTTP callers to call MCP tools, including on a 200 | `core/series.ts` |
| Agent | A caribstat row could not be selected over HTTP without a URL fragment | `rest.ts` |
| Errors | A permanent geography lock was coded `upstream_unavailable` | `core/series.ts` |
| Cost | Identical concurrent upstream requests were not shared | `core/upstream.ts` |
| Cost | A dead host was retried in full by every claim in a batch | `core/upstream.ts` |
| Cost | country_snapshot fetched the five ECCU tables one at a time | `core/snapshot.ts` |
| Site | The privacy page denied analytics while the beacon ran on it | `site/privacy.html` |
| Status | /v1/status probed five of the upstreams and claimed to cover them all | `rest.ts` |
| Guard | The Apify bundle check was two sentinel strings | `test/docs-artifacts.test.ts` |
| Guard | Nothing tested the site-wide CSP, or stopped a force-add of harvested data | `test/site-security.test.ts` |

Each has a regression test that was shown to fail with the fix reverted.

## Refused

**Skipping Cloudflare's Browser Integrity Check from the repo.** A reviewer
proposed working around the 403 that Python's standard library client gets. The
block is generated at the edge before the Worker runs, so no code here can clear
it, and the prerender tool's own failure under it is a symptom rather than a
second finding. It stays an account-level setting.

## Equivalent mutants, kept as defence in depth

Two clauses in the ECCU path survive mutation without any test failing, and that
is correct rather than a coverage gap:

- Excluding `as_of` from the pointer path. Today the as_of absence carries no
  related series, so removing the clause changes nothing. It stays so that a
  future pointer cannot answer a dated-vintage question with a different measure.
- Requiring a non-empty related list. An empty list already falls through to the
  rethrow inside the builder.

## Not attempted

The MCP Apps citation card, the per-stratum benchmark table, and the homepage
integrity line remain deferred for the reasons recorded in REVIEW-2026-09-12.md.
Nothing in this pass changed those reasons.
