# Counting users: why the instrumentation was not built

Date: 2026-08-16. Status: **closed. Recommendation withdrawn; the policy
question was put to the owner and declined.**

## The question

"How many people are using this tool?" The honest answer from telemetry is
that nobody can say, and this records why, so the question is not reopened
from scratch and answered the wrong way.

## What the numbers actually support

Measured 2026-08-15 from Cloudflare's own analytics:

| | value |
|---|---|
| `/mcp` requests | 2,920 |
| distinct client IPs on `/mcp` | 76 |
| of those, IPs running a user-driven agent | 19 |
| user-driven share of requests | ~45% (1,325), overwhelmingly `Claude-User` |
| automated share | ~47% (1,359): SentinelOracle, mcpbeat, health probes, registries |
| site pageviews | ~154/day averaged over 15 days |
| site crawl, 15 Aug | 680 AI crawlers against 9 search engines |

**19 is not nineteen users.** `Claude-User` traffic reaches this service
through Anthropic's server infrastructure, so many different people egress
from a small shared pool of addresses. The figure is neither a floor nor a
ceiling on people. It is a count of network endpoints.

## Why the obvious fix is not available

The obvious way to count callers is a per-client or per-session identifier,
counted server-side. **That is foreclosed by a promise already published**, not
merely by taste:

- `site/privacy.html` states StatCite "does not retain free-text queries,
  claimed values, IP addresses, user agents, headers, or complete request
  payloads", and that it does "not build profiles".
- `server/src/core/analytics.ts` enforces it structurally. Its contract names
  **session/id** among the things never recorded, and every string written is
  drawn from a closed set so arbitrary input cannot enter the stream.
- Verified 2026-08-16: the emitted event is
  `{transport, op, indicator, country, verdict, outcome, bucket, ms}`. No
  client identifier of any kind. **The service is compliant with what it
  promises.**

Adding a client token, even a salted daily hash, would make the published
policy false on the day it shipped. It would also cut against the positioning
on that page, "designed to know as little about you as possible", which is a
reason some callers pick this service.

**So the recommendation to instrument per-client identity is withdrawn.** It
was made before reading the policy. Counting people and promising not to
recognise them are mutually exclusive, and the promise is the more valuable
asset.

## What could be done instead, if the question matters commercially

None of these identify anyone:

1. **Distinct MCP sessions, not clients.** If a session id is ever issued by
   the transport, counting live sessions per day is a better proxy for
   "conversations" than IPs and is ephemeral by construction. Check whether the
   2026-07-28 Streamable HTTP path issues one before assuming it exists.
2. **Ask, do not measure.** A one-line prompt in `/try` or the README inviting
   people to say what they use it for. Low yield, zero privacy cost, and it
   returns qualitative signal the counters never will.
3. **Accept request volume as the metric.** ~1,300 user-driven calls a day,
   steady across two weeks, is a real and defensible number for a README or an
   investor line, provided it is described as calls and never as users.

## CLOSED: the policy over-claim, raised and declined

Found while answering the question, and worth fixing whichever way is chosen.

`site/privacy.html` says of Cloudflare's network-level operational logs, which
can include IP addresses: *"This service does not export, store, or analyze
them."*

That sentence is stronger than the truth. `tools/analytics.mjs` queries
Cloudflare's analytics for user-agent and crawler breakdowns and writes daily
aggregate counts to a local gitignored file, and the session of 2026-08-16 ran
an ad-hoc query counting distinct client IPs. No IP has ever been stored; the
stored file holds aggregate counts plus **bot user-agent strings**
(`Googlebot`, `Claude-User`, `mcpbeat`). Nothing personal has been retained,
and nothing has been published.

The gap is between "operator reads aggregate dashboard data" and a sentence
that reads, to a careful person, as "we never look at this". Two honest
resolutions:

- **Amend the wording** to say the operator reviews Cloudflare's aggregate
  traffic analytics, including bot user agents, and exports no personal data
  and no IP addresses. Accurate, still strong, and keeps the crawler analysis
  that produced the AI-versus-search finding.
- **Narrow the tooling** to bucket counts only, dropping user-agent strings
  from `analytics/daily.jsonl`. This preserves the sentence exactly but loses
  the crawler breakdown.

**Outcome, 2026-08-16.** Both options were put to the owner with the exact
replacement wording drafted and ready to deploy. He judged the change not worth
making, and that is his call: he owns the risk and the sentence is his to
stand behind.

So the position is now DELIBERATE rather than accidental. The wording stays as
published, the tooling keeps its crawler breakdown, and the gap between the two
is small, local, aggregate, and knowingly accepted.

**Do not re-raise this.** It has been found, measured, written up, and decided.
A later session noticing the same sentence should read this paragraph and move
on, not spend an hour rediscovering it. If the position ever needs revisiting
the trigger would be an external one — a regulator, an enterprise customer's
privacy review, or a decision to publish traffic figures — and not simply
another agent reading the page fresh.
