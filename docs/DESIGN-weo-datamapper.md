# Design: current-vintage IMF data via the IMF DataMapper API

Status: **accepted, adversarially reviewed** (2026-07-25) · Target release: v1.3.0
Author: StatCite maintainers · Supersedes the "WEO is stale via DBnomics"
limitation documented in v1.2.0 and `bench/runs/P0/NOTES.md` N-1.

Review provenance: drafted, then attacked by two independent adversarial
reviews (vintage-labeling honesty; systems/contracts) totalling 27 findings —
2 blockers and 12 majors, all folded in below. The reviews also *strengthened*
one claim: Fiscal Monitor / WEO fiscal-series equivalence holds at the same
vintage to ≤ 0.05 (the 1-dp rounding envelope) across 13 probed countries.

## 1. Problem

StatCite's six WEO-backed indicators are served from DBnomics (`IMF/WEO:latest`),
whose newest ingested edition is **2025-04** — two releases behind the IMF's
April/October calendar (re-verified 2026-07-25: DBnomics 404s both `WEO:2025-10`
and `WEO:2026-04`). v1.2.0 discloses the staleness on every response; this design
removes it.

## 2. Evidence (probed 2026-07-25, local + Cloudflare edge)

The IMF DataMapper API (`https://www.imf.org/external/datamapper/api/v1/…`, no
auth) serves the **April 2026** vintage today:

| StatCite indicator | DataMapper code | payload keys* | horizon | edition metadata | loaded |
|---|---|---|---|---|---|
| gdp_growth | `NGDP_RPCH` | 229 | 2031 | World Economic Outlook (April 2026) | 04-08 |
| current_account_gdp | `BCA_NGDPD` | 228 | 2031 | World Economic Outlook (April 2026) | 04-08 |
| govt_debt_gdp | `GGXWDG_NGDP` | 226 | 2031 | World Economic Outlook (April 2026) | 04-08 |
| fiscal_balance_gdp | `GGXCNL_NGDP` | 229 | 2031 | World Economic Outlook (April 2026) | 04-08 |
| govt_revenue_gdp | `GGR_G01_GDP_PT` | 213 | 2031 | Fiscal Monitor (April 2026) | 04-15 |
| govt_expenditure_gdp | `G_X_G01_GDP_PT` | 212 | 2031 | Fiscal Monitor (April 2026) | 04-15 |

\* Keys include ~8–15 group codes (WEOWORLD, EURO, FM_*, …), so real economy
coverage is ≈ 196–198 (WEO) / ≈ 197 (FM). Group keys cannot collide with
`resolveCountry` output.

Facts the design leans on — each one load-bearing:

- **The edition identifier exists and is authoritative.** `GET /api/v1/indicators`
  (48 KB, all site-showcased indicators) returns per indicator
  `source: "World Economic Outlook (April 2026)"` / `"Fiscal Monitor (April 2026)"`,
  `dataset`, `unit`, and the IMF's own `last-modified` load timestamp.
- **Loads are staggered, not atomic.** April 2026: WEO codes loaded 2026-04-08,
  FM codes 2026-04-15 — seven days apart. Mid-cycle reloads happen on this
  platform (other datasets reloaded 2025-12 and 2026-05). `last-modified`
  predates the public release date — it is a load timestamp, never a release date.
- **WEO database codes `GGR_NGDP`/`GGX_NGDP` have no DataMapper data** (empty
  envelope). The Fiscal Monitor general-government series are the fresh path for
  revenue/expenditure and are the same numbers: at the same vintage, FM vs WEO
  fiscal series differ by ≤ 0.05 across 13 countries × 2015–2025 (pure 1-dp
  rounding). FM is the WEO fiscal database at full precision.
- **Coverage deltas exist in both directions.** FM lacks WBG (Palestine) and —
  expenditure only — SOM (`GGR` has 213 keys, `G_X` 212; the diff is exactly
  SOM), both served today via DBnomics. DataMapper keys Palestine **WBG** and
  Kosovo **UVK** (PSE/XKX absent) — same convention as DBnomics-WEO, which
  StatCite's resolver (PSE/XKX) already fails against today; aliasing is a free
  coverage win (§5.6).
- **Early-terminating countries are real and current**: NGDP_RPCH ends at
  SYR 2010, ERI 2019, LKA/WBG 2024, AFG/LBN 2025 — the projection-boundary
  heuristic must not imply their terminal values are outturns (§5.9).
- **DataMapper returns HTTP 200 for everything.** Three non-data 200 shapes
  observed: empty envelope, countries-list envelope, and WAF HTML (the Akamai
  WAF 403s unknown UAs on the API path — StatCite's honest UA is on the working
  side today, and that allowlist is load-bearing and can change without notice).
  Status codes carry no signal; body-shape validation is mandatory (§5.4).
- **Country path segments are ignored**; fetch the bare code (96–190 KB) and
  index client-side. No `Last-Modified`/`ETag` headers; responses carry
  `Set-Cookie` (a Cloudflare cache-everything caveat — §5.3 requires proof the
  edge cache engages). `JSON.parse` of all six payloads ≈ 6 ms desktop-Node.
- **Precision differs by dataset**: WEO codes 1 dp; FM codes full precision.
- **DBnomics `WEO:latest` costs 2 subrequests** (302 + follow) — this matters
  for worst-case budget math (§5.2).

## 3. Decisions

**D1 — Routing.** Wherever "IMF WEO via DBnomics" sits in an indicator's chain
today, a DataMapper-served IMF source is inserted immediately ahead of it.
WB-primary indicators stay WB-primary:

- gdp_growth: WB → **DM NGDP_RPCH** → DBnomics WEO
- current_account_gdp: WB → **DM BCA_NGDPD** → DBnomics WEO
- govt_debt_gdp: **DM GGXWDG_NGDP** → DBnomics WEO → WB (central-govt concept caveat unchanged)
- fiscal_balance_gdp: **DM GGXCNL_NGDP** → DBnomics WEO
- govt_revenue_gdp: **DM GGR_G01_GDP_PT (Fiscal Monitor)** → DBnomics WEO GGR_NGDP
- govt_expenditure_gdp: **DM G_X_G01_GDP_PT (Fiscal Monitor)** → DBnomics WEO GGX_NGDP

`country_snapshot`'s govt-debt item currently bypasses the chain with a
hardcoded DBnomics fetch (`snapshot.ts`) — it is routed through the same
DM-first logic in this release, or the two tools would contradict each other on
the same server.

**D2 — Vintage labeling: verbatim passthrough, never synthesis.** The citation's
edition label is the IMF's own `source` string from `/indicators`, passed
through verbatim. The parser extracts month + year (month names → MM; strings
like "January 2027 WEO Update" parse but never drive the projection boundary —
see D3). **Degraded mode** (metadata endpoint down or code absent): the label is
**year-only and two-sided** — "2026 vintage (April or October edition — edition
metadata unavailable; a newer edition may exist)". The calendar never picks the
month in degraded mode: between an October release and a lagging flip, a
calendar-chosen month would assert exactly the wrong edition indefinitely with
every cross-check green.

**D3 — Projection boundary: payload-anchored.** Boundary year =
**payload max year − 5**, always (WEO/FM editions project exactly +5;
verified across 7 codes). The edition *string* never drives the boundary. This
makes the boundary immune to metadata/values cache skew, to Update-month
edition strings (a "January 2027" label would otherwise silently un-flag every
country's 2026 projections until April), and to degraded mode. Sanity clamp: if
|payloadYear−5 − calendar-expected year| > 1 (truncated/garbled payload), use
the calendar year and attach a caution note. Observations with year ≥ boundary
are marked estimate/projection, with dataset-correct wording (never "WEO" on
Fiscal Monitor data).

**D4 — The projection-flag contract (blocker fix).** Marking and detection are
string-coupled today: `series.ts` keys on `/WEO:(\d{4})/` and `verify.ts`
computes `is_projection` as `/WEO/i && /estimate|projection/i` over the note.
The DM path pins synthesized dataset codes **`WEO:YYYY-MM` / `FM:YYYY-MM`**,
generalises all four regex sites to `(WEO|FM)`, and ships guard-proving tests
that FAIL against today's code: an FM 2031 fixture observation must yield
`is_projection === true`, and `latest_only` on a DM fixture must prefer the
outturn. Without this there is no reading of the old design that works: either
projections silently un-mark (`latest_only` then serves 2031 projections as
"latest"), or FM data carries a false "IMF WEO" attribution.

**D5 — Fallback and strict_source: vintage changes count as reproducibility
breaks.** Any fall-through — including IMF-to-IMF (DM → DBnomics) — sets
`fallback_used: true`, serves `no-store`, and carries a note naming the channel
and the vintage delta. The note template uses **calendar wording** ("the
primary IMF DataMapper path — expected April 2026 edition per the IMF release
calendar — was unavailable"): the metadata that would state the DM edition as
fact lives on the path that just failed. `strict_source` blocks all
fall-through. Changelog names the per-key vintage and precision jumps
(e.g. USA 2026 debt 123.692 → 125.8; revenue 3 dp → full precision); docs state
that `strict_source` pins the *channel* while dated `dbnomics/IMF/WEO:YYYY-MM/…`
ids (D10) remain the instrument for pinning a *vintage*.

**D6 — Verify vintage-integrity.** A verify verdict against a known-superseded
vintage is not a verdict on the claim: Nigeria's revenue/GDP differs by ~2 pp
between 2025-04 and April-2026 editions for *identical historical years* (GDP
rebasing). When verify_stat's official value arrives via a vintage-crossing
fallback (DM down, DBnomics edition < calendar-expected), the verdict is
**cannot_verify**, with the superseded official value, full citation, and an
explanation ("the current-edition IMF path was unavailable; the superseded
2025-04 edition shows X — indicative, not a verification"). match verdicts
against a superseded vintage are as untrustworthy as mismatches (a claim
matching old-vintage 7.25 is *wrong* under the current edition's 5.15).
`get_indicator` keeps serving fallback values with disclosure — retrieval and
verification carry different promises.

**D7 — Transport.**
- Bare-code GET, standard StatCite UA, `cf: { cacheTtl: 3600, cacheEverything: true }`.
- **Release windows**: while `now` is within ±10 days of an expected April/October
  release, TTL drops to 300 s and responses carry a release-window caution note
  (editions flip mid-window; a 1 h cache would pin the old edition per colo).
- **Per-`Ctx` memo, promise-keyed, memoizing rejections**: one in-flight promise
  per URL per request; a failed 3-attempt fetch is *also* memoized so 15
  concurrent claims share ONE failure instead of re-running 45 attempts.
  (`verify_claims` runs 4-concurrent over a shared Ctx; MCP JSON-RPC batches
  share the Ctx and the 50-subrequest cap too. Without rejection-memoization, a
  DM outage makes a 15-claim batch attempt ~75 subrequests — 45 DM + 30
  DBnomics-with-redirects — and today's identical batch survives in ~30.)
- **Validate before cache**: `fetchJson` gains a `validate(data)` hook; a
  payload failing shape validation is never written to the in-isolate cache
  (today `mem.set` happens before any shape check — valid-JSON garbage would be
  pinned for an hour). On a shape failure after a cache-eligible fetch, make
  exactly ONE cache-bypassing refetch before classifying (self-heals a poisoned
  edge cache within one request).
- Post-deploy smoke must **prove** edge caching engages (two fetches, second
  shows `CF-Cache-Status`/timing evidence): DM responses set cookies, which can
  defeat cache-everything; if caching silently doesn't engage, the load and
  latency model here is void and must be revisited.
- Budget: worst healthy mixed batch ≈ 7 DM + ~15 WB/DBnomics fetches ≈ low-20s
  subrequests; worst DM-outage batch ≈ 3 + 1 + 30 ≈ 34. Both under 50, and §7
  includes a counted test asserting exactly that.

**D8 — Error taxonomy (D-001-preserving, without the permanent-transient trap).**
- Unparseable body (WAF HTML) → transient: retry per schedule, never cached,
  fall through with the transient-flavoured note.
- Parseable non-data envelopes (empty, countries-list) after the one
  cache-bypass refetch → **definitive channel failure**: no further retries, a
  note that says what happened ("IMF DataMapper returned no data for this
  series — served from IMF WEO via DBnomics"), never the false "the IMF has no
  data". If the code is also absent from `/indicators` metadata (already in
  hand), classify as config-grade and emit an ops-visible analytics dimension —
  a renamed/retired code must not masquerade as a transient blip for months
  with a standing "retry may recover" lie.
- Shape threshold: a values map with **< 150 country keys** fails validation
  (payloads carry 212–229; a 60-key truncation must not produce definitive
  "no data for {country}" claims).
- Healthy payload, requested ISO3 absent → **fall-through-eligible**, with the
  wording "not present in the IMF DataMapper {WEO|FM} payload" (SOM expenditure
  and WBG revenue take this path to DBnomics — no coverage regression, and no
  false "the IMF has no data" while StatCite itself serves the number).
- 403/4xx from the WAF → definitive for this request, wording
  "the IMF DataMapper API declined this request", never "no data exists".
- Country aliasing at the DM adapter: **PSE → WBG, XKX → UVK** (matches both
  DataMapper and DBnomics-WEO conventions; fixes today's silent Kosovo/Palestine
  misses on the DBnomics path too — Kosovo fiscal data is a free win).

**D9 — Citations.** source: IMF; via "IMF DataMapper API"; `source_url` = the
human page (`https://www.imf.org/external/datamapper/{CODE}@{DATASET}/{ISO3}`);
`api_url` = the exact API URL; attribution "Source: International Monetary
Fund" (FM citation_text names the Fiscal Monitor). Notes carry the IMF's
`last-modified`. **Series ids**: DM-served results stamp `imf/{CODE}` and
`get_series` routes the `imf/` prefix, so every citation's id round-trips
(an id that 422s on the server that issued it is not a citation). Precision
disclosure: WEO-code responses note 1-dp rounding; docs add that derived
changes (`transform=diff`-class) computed from 1-dp values carry up to
±0.1 pp error.

**D10 — What does not change.** Raw `dbnomics/IMF/WEO:…` ids remain untouched —
DBnomics's dated editions stay the vintage-pinning instrument and the
benchmark's revision-check instrument. The 36 non-WEO indicators, WB-primary
orderings, tolerance bands, and the citation schema are unchanged.

**D11 — Sentinels (all in-band, all provably firing).**
- **Stale-edition**: parsed edition (YYYY-MM, month from the string) <
  calendar-expected ⇒ stale note. Wording is channel-parameterised — the
  current `weoVintageStaleNote` text blames DBnomics by name, which would be
  false twice on the DM path.
- **Horizon**: fires when payload maxYear − editionYear ≠ 5 exactly. (The
  draft's "|gap| > 1" could never fire: adjacent-edition skew produces gaps of
  4–6.) On mismatch, the payload-anchored boundary (D3) already contains the
  flag damage; the note discloses the label skew.
- **Post-release-revision detector**: `last-modified` > edition month + 40 days
  ⇒ note that the IMF reloaded this indicator after the release (e.g. a WEO
  Update) and values may not be in the named edition's database. This is the
  Update-month detector the draft wrongly called impossible; it costs zero
  subrequests.
- **WEO/FM edition-mismatch note**: when the served WEO edition ≠ served FM
  edition (observed: 7-day April stagger), fiscal responses note that
  revenue/expenditure and balance may temporarily reflect different editions.
  Docs also note the permanent arithmetic caveat: balance (1-dp WEO) ≠
  revenue − expenditure (full-precision FM) to ±0.1.
- **Unconditional heuristic caveat**: every WEO/FM-sourced response carries the
  boundary-is-a-heuristic caveat — the draft attached it only when some
  observation ≥ boundary existed, which silenced it exactly where it matters
  most (SYR ends 2010, ERI 2019 …). When a country's series ends before the
  boundary year, a stronger note fires: "the IMF publishes no current-edition
  projections for {country}; this series ends at {year} — treat recent values
  as unconfirmed estimates." The `latest_only` note on IMF paths says "latest
  value not marked as a projection", not "latest published outturn".
- **Analytics**: a fallback/channel dimension is appended (append-only is
  allowed) so a standing DM failure is visible in `wrangler tail` instead of
  recording `outcome: "ok"` forever. HANDOFF's monthly upstream shape-check
  list adds the DataMapper values + metadata shapes.

## 4. Rejected alternatives

- **Full swap, drop DBnomics**: loses dated editions — the only vintage-pinning
  instrument in the stack — and the benchmark's revision instrument.
- **Calendar-only labeling** (no metadata fetch): mislabels during release-lag
  windows and Update months; the authoritative string is one cached 48 KB fetch.
- **Hardcoded vintage constant**: a frozen factor; silently wrong on release day.
- **Edition-string-anchored projection boundary**: breaks under cache skew,
  degraded mode, and Update-month labels (D3's reason for existing).
- **Per-request DBnomics cross-matching to date payloads**: subrequest cost for
  weaker evidence than the metadata string.
- **WEO bulk-file ingestion** (per-country "estimates start after"): the only
  exact fix for the boundary heuristic; needs storage + a twice-yearly
  pipeline; deferred. §3-D11's unconditional caveat is the honest interim.

## 5. Runtime rules (implementation contract)

1. Fetch values `GET /api/v1/{CODE}` and metadata `GET /api/v1/indicators`,
   standard UA, TTL per D7, per-Ctx promise memo (rejections included).
2. Budget invariant: ≤ 7 DM fetch *attempts-series* per request (6 values + 1
   metadata), shared across all claims/tools in the request, enforced by the
   memo — verified by a counted test, not asserted.
3. Validate shape pre-cache: `values[CODE]` present with ≥ 150 truthy country
   keys; skip falsy keys (`""` observed). Failure → D8 taxonomy.
4. Resolve country: ISO3 from `resolveCountry`, then DM aliases (PSE→WBG,
   XKX→UVK). Aggregates (WLD, EUU…) are absent upstream → normal fall-through.
5. Resolve edition: metadata entry → verbatim label + parsed YYYY-MM;
   missing/unparseable → degraded year-only two-sided label (D2).
6. Boundary: payload maxYear − 5 with the ±1 calendar clamp (D3); mark year ≥
   boundary via the generalised `(WEO|FM)` machinery (D4); dataset-correct text.
7. Sentinels per D11 — each note has a fixture test that proves it FIRES.
8. Fallback per D5; verify demotion per D6.
9. Series id `imf/{CODE}` stamped and routed (D9).

## 6. Consumer-breakage sweep (all in this release)

Docs/pages: llms-full.txt (source lists, WEO paragraph), docs.html (registry
table + prose ¶"IMF WEO (via DBnomics) for fiscal series" + the WEO-lag
paragraph + changelog), openapi.json descriptions, README, index.html (three
spots: get_indicator card, sources table row promising "newest vintage via
DBnomics", FAQ), HANDOFF (launch block + monthly checks), BRIEF.md, CLAUDE.md
(adapter roster + WEO-stale limitation), sources.ts / `/v1/sources`.
Tool surfaces: tools.ts descriptions (`list_sources`, `search_indicators`,
`country_snapshot`).
Second deployment: `apify/` README **and `core.bundle.mjs` rebuild + push**
(repo invariant: any core/ change rebuilds the bundle) — otherwise the two
public frontends serve different vintages for the same query. Skill zip repack
if its docs mention sources.
Marketing (forward-only): distribution/social-copy.md, submissions.md.
Bench: `runs/P0/NOTES.md` N-1 forward requirement satisfied; add a DataMapper
fetcher to `audit_ground_truth.mjs`/`snapshot_ground_truth.mjs` (they only
speak `worldbank/` + `dbnomics/` ids — Full Run 1 snapshots will contain
`imf/` ids the auditor must independently reproduce); pre-register that
Class-C bands for DM-served WEO cells floor at 1-dp publication precision, and
expect vintage churn (±3.7 pp on rebasing countries) between P0-era values and
Full Run 1 ground truth.
P0 itself is safe: its 18 WEO cells carry dated `dbnomics/IMF/WEO:2025-04/…`
ids and scoring never touches the live API.

## 7. Test plan

- Fixtures recorded from real payloads: values × {WEO, FM}, metadata, empty
  envelope, countries-list envelope, truncated (<150 keys), an
  early-terminating country (SYR), and a skew pair (old values + new metadata).
- **All four test stub tables** (helpers.ts, verify-claims, verify-judge,
  upstream-resilience) gain the DM routes — without this every six-key test
  silently flips to exercising the fallback path (with 1.2 s of real backoff
  sleeps per URL) while staying green. Happy-path batch/judge tests add
  `assert.equal(verification.fallback_used, undefined)`.
- Unit: edition parser (April/October/Update/garbage), degraded label,
  boundary payload-anchoring incl. January-Update string and skew fixtures,
  ≠ 5 horizon sentinel, post-release-revision detector, WEO/FM mismatch note,
  unconditional caveat + series-ends-early note, D8 taxonomy (each envelope
  class ⇒ its exact classification and note), alias map, memo dedupe AND
  rejection-memoization, D6 verify demotion, `imf/{CODE}` round-trip via
  get_series, `listRegistry` order asserted on **exact label strings** for all
  six keys.
- **Budget test**: 15-claim batch with DM stubbed down — assert total stub-log
  length stays under 50 and equals the D7 arithmetic.
- Guard-proving: FM 2031 fixture ⇒ `is_projection === true`;
  `latest_only` prefers outturn on DM fixture (both fail against v1.2.0 code).
- CPU: measure a cold all-six batch under `wrangler dev` before declaring done
  (parse alone ≈ 6 ms desktop; free-plan soft limit 10 ms — if over, document
  batch-splitting guidance rather than silently raising limits).
- Live smoke post-deploy: one indicator per dataset (edition string, no
  fallback_used, boundary 2026); the two-fetch edge-cache proof (D7).

## 8. Known accepted risks (post-review honest form)

- **Release-window skew** (IMF-side stagger up to 7 days + per-colo cache
  windows): labels can briefly disagree with payloads. The payload-anchored
  boundary means *flags* stay correct; the ≠ 5 sentinel + release-window TTL
  drop + mismatch notes bound the *label* damage to disclosed windows.
- **WEO Updates**: the 40-day detector catches reloads after that threshold;
  a reload *within* 40 days of release is indistinguishable from the release
  load — residual, disclosed here.
- **Per-country actual/estimate boundary** remains a heuristic (unchanged since
  v1.2.0), now with the caveat firing unconditionally and an explicit note for
  early-terminating countries. Exact fix deferred to bulk-file ingestion.
- **UA allowlist**: DataMapper reachability depends on WAF policy toward
  StatCite's UA; a policy change degrades to DBnomics with disclosure (D5/D8),
  which is exactly v1.2.0's behaviour.
- **CPU headroom** on cold all-six batches is thin (≈ 6 ms parse + logic vs
  10 ms soft limit) — measured before ship per §7.

## 9. Process notes

- Phase 1 initially concluded "no edition identifier exists" after probing
  `/metadata`, `/indicators/{code}`, and payload shapes — but `/indicators/{code}`
  is swallowed by the API's forgiving router; the bare `/indicators` endpoint
  carries full edition metadata. Separately, "all 6 WEO codes return data" was
  falsified for GGR_NGDP/GGX_NGDP: their 200s were countries-list fallback
  envelopes. Both errors came from eyeballing truncated previews of a
  status-code-blind API. Rule: with an API that never 4xxs, **parse, never
  preview**.
- The adversarial reviews changed material decisions: payload-anchored
  boundary (was edition-string-anchored), rejection-memoizing memo (was value
  memo), definitive classification for parseable envelopes (was
  all-transient), verify demotion on vintage-crossing fallbacks (was verdict
  as usual), degraded-mode two-sided labels (was calendar-picked month),
  ≠ 5 horizon trigger (was an inert |gap|>1), the unconditional heuristic
  caveat, the snapshot routing fix, and the four-stub-table test requirement.
  A design for an honesty product needs hostile readers before implementers.
