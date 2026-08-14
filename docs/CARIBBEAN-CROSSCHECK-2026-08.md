# Caribbean coverage: cross-check against national sources, 2026-08-10

Two questions were asked: connect a Caribbean data API, and cross-check each
country's own published reports against what StatCite serves. The second was
done. The first is blocked, and the block is not a technical one.

## 1. The ingestion gate: OPENED 2026-08-10 (operator obtained permission)

**Status change.** The operator reports having sent the permission requests and
received permission from the source institutions. On that basis the Phase 0
gate that blocked Phases 1-3 since 2026-07-26 is lifted and ingestion work may
proceed.

**One thing is still required before the licence ledger flips in public.** The
ledger at `/v1/sources` is a published legal claim about what StatCite is
allowed to serve, and every entry in it carries a verifiable basis, a verbatim
quote and a verification date. To record ECCB/CBB honestly it needs three
facts from the grant itself: **who granted it** (institution and role), **the
date**, and **the scope**. Specifically whether it covers redistribution and
derivative works, whether commercial use is included (the metered Apify surface
matters here), and any required attribution wording. Forward the reply emails
and the entries get written verbatim, exactly as the IMF and BIS entries were.
Until then `eccb`/`cbb` stay at `refused` in the published ledger rather than
carrying a claim I cannot evidence, that is the same standard applied to every
other source, not extra caution for this one.

### What was verified live on 2026-08-10 (post-permission)

The technical recon holds and the pipeline is feasible:

- ECCB statistics site returns **HTTP 200** to a browser user-agent (the 403 is
  UA filtering only, as recorded); 19 statistics categories enumerated.
- Data tables live at `/statistics-category/{cat}/{table}/{a|q|m}` and are
  **server-rendered HTML**, no JS execution needed.
- A real fetch of the annual central-government fiscal accounts returned a
  **56-row table**, EC$M, 2021-2025, parsed cleanly to values
  (Total Revenue and Grants 2025 = EC$8,093.70M; Tax Revenue 2025 = EC$5,637.32M).
- The table carries its own provenance stamp: **"Data as at 28 July 2026"**.
- The geography selector exposes all nine geographies, the eight members plus
  ECCU, **including Anguilla and Montserrat**.

**That last point is the commercial finding.** Anguilla and Montserrat are the
two economies in §2 below that no aggregator covers and the World Bank does not
report. ECCB publishes both. The uncovered part of the region and the
newly-permitted source are the same thing.

## 1b. The original gate, for the record (2026-07-26 to 2026-08-10)

No ECCB or CBB connector may be written, and none was.

- **ECCB's disclaimer policy** grants, verbatim, *"personal, noncommercial
  usage only, without any right to resell or redistribute or to compile or
  create derivative works"*. An ingest-and-serve pipeline is precisely the
  compiling and redistribution that clause names.
- **CBB publishes no data-reuse terms at all**, the default is
  all-rights-reserved, and silence is not permission.
- StatCite's own licence ledger already records `eccb` with verdict
  **`refused`**, and `cbb` likewise. Serving either would contradict the
  ledger the same deployment publishes at `/v1/sources`.

This is the same class of catch as the FRED conflict resolved in v1.3.2:
found by reading the terms before writing the adapter, not after.

**Unblocking is an owner decision, not an engineering step.** It requires
emailing ECCB (info@eccb-centralbank.org) and/or CBB
(statistics@centralbank.org.bb) for explicit permission, or parking the
vertical. Full reasoning in the caribstat repo's `SCOPING.md` §2.3.

Nothing below uses ECCB or CBB data. It reads their published *reports*, a
public document anyone may read and cite, and compares the figures against
what StatCite already serves from the World Bank and IMF. Reading and citing a
report is not redistributing a dataset.

## 2. Coverage, measured live

13 of 15 Caribbean economies resolve for `gdp_growth`:

| resolves | Antigua & Barbuda, Dominica, Grenada, St Kitts & Nevis, St Lucia, St Vincent & the Grenadines, Barbados, Jamaica, Trinidad & Tobago, Guyana, Bahamas, Belize, Suriname |
|---|---|
| **no data** | **Anguilla (AIA)**, not a World Bank reporting economy |
| **upstream error** | **Montserrat (MSR)**, see the defect below |

**Defect found: inconsistent honest-absence for unsupported economies.**
Anguilla returns a clean "No World Bank data found for indicator
NY.GDP.MKTP.KD", but Montserrat surfaces a raw upstream string, *"World Bank
API error. Invalid value: The provided parameter…"*. Two economies in the
same situation return two different shapes, and the second reads as a StatCite
fault rather than a coverage fact. This should be normalised to the
`no_published_data: true` honest-absence contract. Not fixed here; logged.

## 3. Cross-check against the national authorities

Figures below are the national authority's own published statements, checked
against StatCite with `verify_stat` and `compare_sources` on 2026-08-10.

### Barbados: national figures agree with every source

| claim (Central Bank of Barbados) | StatCite verdict | official |
|---|---|---|
| Real GDP growth 2025 = **2.7%** | **match** | 2.700% (World Bank) |
| Debt-to-GDP end-2025 = **94.6%** | **match** | 94.2% (IMF) |
| Inflation 2025 = **0.7%** (12-month moving average to November) | close | 0.847% (World Bank) |

All three sources in the chain agree on growth (WB 2.70%, IMF DataMapper
2.70%, WEO-via-DBnomics 3.00%, spread 0.30pp). The inflation gap is a
definitional difference, not a disagreement: the CBB quotes a 12-month moving
average to November, StatCite an annual figure. Confidence here is high.

### Jamaica and Trinidad & Tobago: genuine divergence, flag before citing

| | World Bank WDI | IMF DataMapper | WEO via DBnomics | spread | national authority |
|---|---|---|---|---|---|
| **Jamaica** 2025 | 0.08% | −0.10% | 2.10% | 2.2pp | BOJ: FY25/26 range **1.0–3.0%**; Q1 2025 **+1.1%** y/y |
| **Trinidad** 2025 | −0.79% | +0.80% | 2.37% | 3.2pp | CBTT: Q1 2025 **+2.7%**; "modest growth" over nine months |

Both current-vintage sources put Jamaica at roughly flat and Trinidad at flat
to slightly negative, while both central banks describe positive growth. Part
of this is not a contradiction: the BOJ figure is **fiscal**-year and the
CBTT figure is a **single quarter**, against calendar-year annual series. But
the direction of travel differs, and a brief that cites "Trinidad grew in
2025" from the central bank while citing StatCite's −0.79% elsewhere would be
internally inconsistent. Cite one basis and say which.

### Guyana: the spread is a vintage artefact, not a dispute

| World Bank WDI | IMF DataMapper | WEO via DBnomics | spread |
|---|---|---|---|
| 19.34% | 19.30% | 10.31% | **9.0pp** |

The two current-vintage sources agree to 0.04pp. The 9pp gap is entirely the
lagged WEO edition DBnomics has ingested. This is the single clearest
illustration in the region of why StatCite discloses the resolved vintage on
every response and why the v1.9.0 IMF-first dated-vintage chain matters: a
consumer reading the aggregator's figure alone would understate Guyana's
growth by nearly half.

## 4. What this says about the Caribbean product

- **The data quality argument is real but narrower than "the region is
  uncovered".** Headline aggregates exist for 13 of 15 economies and, for
  Barbados, agree exactly with the national authority. The gap is not
  existence, it is **vintage lag and cross-source divergence**, which is a
  verification problem, i.e. what StatCite already does.
- **The uncovered part is sub-annual and sub-national**: monthly and quarterly
  ECCB/CBB series, which is exactly the data the licence gate blocks. So the
  differentiated product and the blocked source are the same thing. That makes
  the permission email the critical path, not an optional step.
- **Anguilla and Montserrat will not be solved by any aggregator**, they are
  not World Bank reporters. If they matter, they come from ECCB, and therefore
  from permission.

## 5. Sources read

- Central Bank of Barbados, *Review of Barbados' Economy in 2025*. Https://www.centralbank.org.bb/news/economic-reviews/central-bank-of-barbados-review-of-barbados-economy-in-2025
- Bank of Jamaica, *Monetary Policy Press Release, August 2025*. Https://boj.org.jm/monetary-policy-press-release-august-2025/
- Statistical Institute of Jamaica, annual GDP tables. Https://statinja.gov.jm/nationalaccounting/annual/newannualgdp.aspx
- Central Bank of Trinidad and Tobago, *Economic Bulletin*. Https://www.central-bank.org.tt/economic-bulletin
- Government of Trinidad and Tobago, *Review of the Economy 2025*. Https://www.finance.gov.tt/wp-content/uploads/2025/08/WEB-%E2%80%A2-REVIEW-OF-THE-ECONOMY-2025.pdf

## 6. Open items

1. **OWNER**: decide the ECCB/CBB permission email, or park the vertical.
   Everything sub-annual depends on it.
2. Normalise the Montserrat upstream error into the honest-absence contract.
3. Extend the cross-check to the six ECCU members individually, their
   national figures come via ECCB reports, readable and citable even while
   ingestion stays blocked.
