# The IMF SDMX 3.0 WEO flow as the IMF primary (October 2026)

The question was whether StatCite should read the four WEO registry codes from the IMF's own SDMX 3.0 flow (`IMF.RES/WEO/9.0.0` on `api.imf.org`) in place of the DataMapper API. The SDMX flow serves unrounded values. Barbados real GDP growth for 2024 is 3.366949 there and 3.4 on the DataMapper. If the switch were safe, the `rounded_source` limitation could be narrowed or retired.

StatCite keeps the DataMapper as the IMF primary. The SDMX flow stays on the dated-vintage path only, where it already serves. The reasons are below, with the measurements they rest on.

All reads were taken on 23 October 2026 between 13:50 and 14:05 UTC, anonymously, with StatCite's own user agent. The main run made 89 calls and 10 follow-up calls were made after it. All 99 returned HTTP 200. The scripts and raw payloads are kept outside the repo.

## What was compared

Six registry keys are IMF-backed: `gdp_growth` (NGDP_RPCH), `current_account_gdp` (BCA_NGDPD), `govt_debt_gdp` (GGXWDG_NGDP), `fiscal_balance_gdp` (GGXCNL_NGDP), `govt_revenue_gdp` (GGR_G01_GDP_PT) and `govt_expenditure_gdp` (G_X_G01_GDP_PT). The DataMapper labelled the first four "World Economic Outlook (October 2026)" and the last two "Fiscal Monitor (October 2026)".

The two Fiscal Monitor codes are absent from the WEO flow. A request for each on `USA` returned zero series. The DataMapper already serves Fiscal Monitor codes at full precision, so they were never part of the rounding question. Any change could reach four keys out of six.

## Measurements

### Edition agreement

Every cell present in both sources was compared after rounding the SDMX value to one decimal place.

| Code | Cells in both | Equal after rounding | Within 0.05 | Beyond 0.05 |
|---|---|---|---|---|
| NGDP_RPCH | 9,277 | 9,268 | 9 | 0 |
| BCA_NGDPD | 8,937 | 8,937 | 0 | 0 |
| GGXWDG_NGDP | 6,948 | 6,948 | 0 | 0 |
| GGXCNL_NGDP | 7,671 | 7,670 | 1 | 0 |

The 10 cells within 0.05 are all exact ties at the second decimal, such as 14.15 served as 14.1 by the DataMapper. They are a rounding convention. On the day, the live SDMX flow and the DataMapper carried the same edition. Kosovo is left out of this table because the two sources code it differently (`KOS` and `UVK`, see Coverage). With an alias its cells also fall within 0.05.

The SDMX payload carries no edition label. Its series attributes are `SCALE`, `DECIMALS_DISPLAYED`, `OVERLAP` and `COUNTRY_UPDATE_DATE`, which holds a per-economy date such as 9/24/2026 for Barbados. Its observation attributes `PRECISION` and `DERIVATION_TYPE` were empty. The flow's own `lastUpdatedAt` reads 2025-10-08, which dates the flow definition and says nothing about the data. A citation that names the edition would still need the DataMapper's `/indicators` call, so a switch adds an upstream call and lets the label and the values come from different editions during a release window. That skew is the failure the DataMapper boundary rule was written to prevent.

### The projection boundary

StatCite anchors the DataMapper projection boundary on the payload's data horizon: the latest year any economy carries, minus 5. The DataMapper returns every economy in one payload, so that horizon is the edition's horizon (2031 for all four codes on the day).

A per-economy SDMX call lists only that economy's own periods. Syria's NGDP_RPCH payload lists 1980 to 2010, Lebanon's 1980 to 2025. Per code, 7 or 8 economies end before the edition horizon: Afghanistan, Eritrea, Lebanon, Senegal, Syria, West Bank and Gaza and Venezuela on growth, with Ecuador and Macao joining on debt. Anchoring on a per-economy payload would mark Lebanon's 2021 to 2025 values as projections. The flow carries no "estimates start after" year either, so the source cannot supply the boundary.

Anchoring correctly needs the all-economy pull or a second reference call per request.

### Payload size

The all-economy SDMX payload for NGDP_RPCH was 195 KB against the DataMapper's 122 KB, about 60 per cent larger. A per-economy SDMX payload was about 5 KB. Two separate timing runs of the parse in Node disagreed on the cost of the larger payload, so this note draws no conclusion about CPU against the Worker's 10 ms budget. The decision below does not rest on it.

### Latency and errors

| Call shape | Calls | Errors | p50 | p95 | Max |
|---|---|---|---|---|---|
| SDMX, one economy | 24 | 0 | 294 ms | 398 ms | 868 ms |
| SDMX, all economies | 20 | 0 | 606 ms | 893 ms | 1,165 ms |
| DataMapper, all economies | 24 | 0 | 590 ms | 917 ms | 1,195 ms |

Per economy, the SDMX call is about twice as fast as the DataMapper. The all-economy call is level with it. No call failed, which sets a floor on reliability for one afternoon and no more.

### Coverage

| Code | SDMX economies | DataMapper economies | StatCite economies in SDMX | StatCite economies in DataMapper |
|---|---|---|---|---|
| NGDP_RPCH | 210 | 229 | 196 | 197 |
| BCA_NGDPD | 208 | 228 | 195 | 196 |
| GGXWDG_NGDP | 206 | 226 | 193 | 194 |
| GGXCNL_NGDP | 209 | 229 | 196 | 197 |

The one economy short is Kosovo, which the SDMX flow codes `KOS` and the DataMapper codes `UVK`. With an alias the two match. The DataMapper's extra keys are its regional groups, and the SDMX flow's are `G`-coded groups.

The DataMapper serves 88 cells across the four codes that the SDMX flow leaves empty, every one of them an exact 0. Most are on government debt: Macao 31, Brunei 21, Timor-Leste 11, Republic of Congo 11 and South Sudan 1. Macao's government carries no debt, so some of these zeros are likely true, and this check cannot say which. Wherever the DataMapper shows 0, the SDMX flow either has no value or has a small non-zero one. A switch would turn these 88 values into gaps.

### How much rounding a switch removes

The SDMX flow gives up to six decimals on outturn and estimate years. Projections vary by economy. Barbados growth for 2026 to 2031 arrives as 1.8, 2.2, 2.1, 2, 2 and 2, already at one decimal, and Jamaica's growth is at one decimal from 2029. Germany's growth is unrounded to 2031. In the three economies sampled (Barbados, Jamaica and Germany), debt and the fiscal balance arrive unrounded across the projection years, as does the Barbados current account. So a switch could narrow `rounded_source` for growth and could retire it only where every served value is unrounded, which three economies cannot establish.

### Caching

The SDMX flow answers with `cache-control: no-cache, no-store, max-age=0, must-revalidate` and no `ETag` or `Last-Modified`. StatCite's own memory and edge cache would carry the load. A per-economy adapter keys one cache entry per economy per code, about 200 per code, where one DataMapper entry today serves every economy.

### Licence and citation

The licence does not block a switch. The flow is IMF data under the same terms as the DataMapper, and the `imf_sdmx_vintage` ledger entry already records a served verdict for `api.imf.org`. That entry states the source is used only on the dated-vintage path, so a switch would have to re-date it. The citation dataset name in the payload is "World Economic Outlook (WEO)", without an edition, which brings back the label problem above.

## Decision

The DataMapper stays the IMF primary for the six keys, with DBnomics behind it. `rounded_source` stays as it is, because the DataMapper still serves the values it describes.

A switch would cost a second upstream call for the edition label, open a label and value skew in each release window, and either break the payload-anchored projection boundary or pull the larger all-economy payload on every uncached request. It would turn 88 DataMapper zeros into gaps. In return it would remove rounding on four of six keys, and on growth only in part, since some economies' growth projections are published at one decimal.

## What would change this

- The flow publishing an edition label or an "estimates start after" year per economy.
- A cheap way to read the edition horizon, such as a flow-level period listing, so a per-economy call can be anchored without the all-economy payload.
- A request type that needs unrounded IMF values badly enough to justify a second call, such as verification of a claim stated to two decimals. That path could read the SDMX flow alongside the DataMapper and leave the primary unchanged.

## A side finding

The IMF now publishes a frozen `WEO_2026_APR_VINTAGE` flow (its listing dates it 2026-10-05). StatCite's dated-vintage table lists only `WEO_2025_OCT_VINTAGE`, so as-of requests for the April 2026 edition still go to DBnomics. Adding the new flow to that table is a separate change.
