# IMF API (api.imf.org) — evaluation, 2026-08-10

> **STATUS: SHIPPED in v1.9.0 (2026-08-10).** The blocker below was cleared the
> same day — the IMF's copyright-and-terms page was read verbatim from an
> Internet Archive capture, the `imf_weo` ledger entry was corrected and
> re-dated, and a dedicated `imf_sdmx_vintage` ledger entry was added with a
> "served" verdict. The dated-vintage chain is now IMF-first with DBnomics as
> the deep-archive fallback, and both silent-failure modes documented below are
> guarded by mutation-verified tests. Live proof: the revision probe returns
> `status: "checked"` for WEO 2025-10 where it previously returned
> `"unavailable"`. Sections below are kept as the original evaluation record.

Triggered by the question "does StatCite use portal.api.imf.org, and is it
better?". Everything below marked VERIFIED was observed directly by live HTTP
call on 2026-08-10; everything else is explicitly flagged.

## What it is

`portal.api.imf.org` is an **Azure API Management developer portal** — a
console for browsing APIs and managing subscription keys. It is NOT the data
endpoint. The data endpoint is:

    https://api.imf.org/external/sdmx/2.1/...

## VERIFIED findings

- **No API key is needed for data.** Every call below was made anonymously with
  no key, no header, no account, and returned HTTP 200 with real data. The
  portal's sign-in wall guards the developer console, not the data.
- **222 dataflows** exposed anonymously (`/dataflow`), far beyond the ~6
  indicator families the DataMapper API serves. Includes CPI, BOP, GFS, COFER,
  FSI, HPD, and PCPS (commodity prices).
- **119 of those are dated VINTAGE dataflows** — e.g. `WEO_2025_OCT_VINTAGE`,
  `FM_2025_OCT_VINTAGE`, `CPI_2026_MAY_VINTAGE`. This is first-party dated-edition
  data, which StatCite currently gets only via DBnomics.
- **Format: flat SDMX-JSON, ECB-style, string values.** Default response is
  SDMX-ML (XML). `Accept: application/json` returns SDMX-JSON with NO `data`
  envelope and observation values as STRINGS — the exact shape
  `server/src/adapters/sdmx.ts` already normalises (it handles the BIS
  wrapped/string case and the ECB flat/numeric case). `Accept:
  application/vnd.sdmx.data+json` returns XML; `;version=2.0.0` returns a 500.
  Only `application/json` works.
- **Verified working call** (anonymous):
  `https://api.imf.org/external/sdmx/2.1/data/WEO_2025_OCT_VINTAGE/USA.NGDP_RPCH`
  with `Accept: application/json` → 51 periods, 1980–2030, US real GDP growth.
- **The legacy endpoint is DEAD.** `dataservices.imf.org/REST/SDMX_JSON.svc/`
  returns 502 from the Azure gateway. StatCite never used it, so no impact —
  but any documentation or third-party tool still pointing there is broken.
- **No rate-limit headers** are returned on anonymous calls (no `RateLimit-*`,
  no `Retry-After`). Responses carry `cache-control: no-store`. Actual limits
  are UNVERIFIED — the portal documents them behind login.

## Why this matters: it fixes a live degradation

StatCite's revision probe (v1.7.0) re-checks a mismatched claim against the
PREVIOUS WEO edition. In production on 2026-08-10 it returned
`status: "unavailable"` because DBnomics has not ingested WEO 2025-10 — the
edition the probe needed. **`WEO_2025_OCT_VINTAGE` is available first-party
here.** Adopting it would turn an honestly-degraded feature into a working one.

## The limitation — this is an ADDITION, not a replacement

Only **one** WEO vintage is exposed (`2025_OCT`), not an archive. DBnomics
carries dated editions back to 2010-04. So:

- **api.imf.org** → recent vintages (what DBnomics lags on)
- **DBnomics** → deep historical archive (what api.imf.org lacks)
- **DataMapper** → current edition, already primary, verbatim edition labels

The correct design is a chain, not a swap.

## CORRECTION to the initial probe (verified 2026-08-10, second pass)

My first pass used the **SDMX 2.1** endpoint with `Accept: application/json` and
found a FLAT, ECB-style payload with `id` keys. That was correct for 2.1 but is
NOT the endpoint to build on. The **SDMX 3.0** endpoint is better and behaves
differently — both verified directly:

    https://api.imf.org/external/sdmx/3.0/data/dataflow/IMF.RES/WEO/9.0.0/BRB.NGDP_RPCH.A?format=sdmx-json

- Envelope: **WRAPPED in `.data`** (BIS-style), string observation values.
- **Dimension values use `value`, NOT `id`.** This is SDMX-JSON 2.0.0.
  `sdmx.ts` currently reads `periods[i].id`, which would be `undefined` here;
  the existing `.filter(o => o.period)` would then drop every observation and
  return a SILENTLY EMPTY series. Any adapter work must read `value ?? id`.
- **Key order is `COUNTRY.INDICATOR.FREQUENCY`** (`BRB.NGDP_RPCH.A`), not the
  SDMX-2.1 `FREQ.REF_AREA.INDICATOR` convention.
- **A wrong key order returns HTTP 200 with an empty `series` object** — no
  error, no 404. VERIFIED: `A.BRB.NGDP_RPCH` → 200, 0 series. An adapter MUST
  treat "200 with zero series" as a malformed-key failure, never as
  "no published data", or a key-order mistake becomes an honest-looking
  absence claim.
- Vintage flows work on 3.0 too: `WEO_2025_OCT_VINTAGE/1.0.0/USA.NGDP_RPCH.A`
  returns the Oct-2025 edition (2030 = 1.753), genuinely different from the
  current flow — the vintage mechanism is real, not an alias.

Naming traps for any future mapping work: **IFS no longer exists** as a single
dataflow (decomposed into ER, IL, FA, PI, LS, MFS_*, NA_MAIN), and **DOTS is
now IMTS**.

## LICENSING — passes, with one live commercial-use question for the operator

Current terms page: `imf.org/en/about/copyright-and-terms`, effective
2024-10-11. Akamai blocks all scripted access to imf.org, so the text was read
via an Internet Archive capture — **flagged as an archive read, not a direct
one**, and worth one confirmation from a residential browser before the ledger
entry is dated.

Redistribution is expressly permitted (verbatim): *"You may download, extract,
copy, create derivative works, publish, distribute, and use Data obtained from
IMF Sites"*, conditioned on attribution in the form *"Source: International
Monetary Fund, Database Name, <<link to the dataset>>."*

Two obligations this creates that StatCite does not yet fully meet:

1. *"Users who make IMF Data available to other Users through any type of
   distribution or download environment agree to take reasonable efforts to
   communicate and promote compliance by their users with these terms."*
   StatCite redistributes IMF data through a public API, so this is an ACTIVE
   obligation to surface IMF's terms to its own consumers — not merely to cite
   the IMF. Partially met today (every citation carries `license` and
   `attribution`); worth strengthening explicitly.

2. **The 2020 terms said "publish, distribute, and sell". The current terms
   DROP "and sell"** and add: *"For any potential commercial reuse of IMF Data,
   please email copyright@imf.org to request permission."*
   **StatCite has a live paid surface** — the Apify actor charges per event and
   serves IMF-backed indicators. A free public API reads naturally as
   "publish/distribute", but the metered actor is closer to the line. This is
   an operator decision, not a code decision. [SUPERSEDED same day: the citation's disclosure was itself the Content/Data
   conflation — the corrected licence (v1.8.2) states the Data regime's actual
   conditions, and the "and sell" question is answered by the free-of-charge
   disclosure condition rather than a permission request. Kept for the record.]

## BLOCKER before any implementation (CLEARED 2026-08-10 — see status note at top)

House rule: a source enters the registry only after its licence-ledger entry
exists with a "served" verdict.

- The IMF's canonical terms URL has **MOVED**: `/external/terms.htm` now
  redirects to **`https://www.imf.org/en/About/copyright-and-terms`**
  (observed via the redirect target). `core/sources.ts` still cites the old
  URL — needs updating regardless of this evaluation.
- That page is **Akamai-blocked to datacenter IPs** (403 to curl, to WebFetch,
  and to a headless browser). It is a bot-block, not a dead link — it loads
  normally from a residential browser. So the terms text could not be re-read
  from this environment.
- The portal's own terms (`portal.api.imf.org/terms`) sit behind the sign-in
  wall and govern the API-management *service*, which is only relevant if a
  subscription key is registered. Since anonymous access works, StatCite does
  not need a key and does not need to accept those service terms.

**Recommendation:** do not wire in api.imf.org until the redistribution stance
on the current IMF copyright-and-terms page is read and recorded. The existing
`imf_weo` ledger entry (verified 2026-07-26) covers IMF data generally and is
almost certainly the governing document, but "almost certainly" is not the
standard this project uses for licensing.

## The change, as shipped in v1.9.0

1. Update the `imf_weo` ledger `terms_url` to the current canonical URL.
2. Add an `api.imf.org` ledger entry with its own verdict and verified-on date.
3. Insert it into the dated-vintage chain AHEAD of DBnomics in
   `getIndicatorAtEdition`, keeping DBnomics as the deep-archive fallback.
4. Reuse `fetchSdmxSeries` (flat/string shape already supported); add the
   `Accept: application/json` negotiation for this provider.
5. Regression test: the revision probe must return `status: "checked"` for the
   previous edition where it currently returns `"unavailable"`.
