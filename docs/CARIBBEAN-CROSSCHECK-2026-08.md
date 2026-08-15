# Caribbean coverage: cross-check against national sources, 2026-08-10

Two questions were asked: connect a Caribbean data API, and cross-check each
country's own published reports against what StatCite serves. The second was
done. The first is blocked, and the block is not a technical one.

## 1. The ingestion gate: OPENED 2026-08-10 (operator obtained permission)

**Status change.** The operator reports having sent the permission requests and
received permission from the source institutions. On that basis the Phase 0
gate that blocked Phases 1-3 since 2026-07-26 is lifted and ingestion work may
proceed.

**Ledger state, corrected 2026-08-15.** This section used to say `eccb` and
`cbb` would stay at `refused` until the grant text arrived. They did not. Both
were flipped to **`served`** on 2026-08-14 and the live ledger at
`/v1/sources` has said so since. Leaving the old sentence here meant the docs
and the deployment asserted opposite things about a published legal claim,
which is worse than either position on its own.

What the published entries actually say is that the basis is *the operator's
confirmation* that permission was requested and granted, with the outbound
request public in `caribstat/outreach/`. That is disclosed in the entry rather
than dressed up as a verbatim grant, so the ledger is honest about the strength
of its own evidence.

**Still worth having, and still outstanding.** Every other entry in the ledger
carries a verbatim quote and a verification date taken from the source's own
words. ECCB and CBB carry an operator attestation instead. Forwarding the reply
emails would let these two be written to the same standard as the IMF and BIS
entries, and would pin down three things the attestation does not: **who
granted it** (institution and role), **the date**, and **the scope**, meaning
whether it covers redistribution and derivative works, whether commercial use
is included (the metered Apify surface matters here), and any required
attribution wording. That is an upgrade in evidence, not a blocker on
serving.

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
- StatCite's own licence ledger recorded `eccb` and `cbb` as **`refused`** at
  the time of this reading, so serving either would then have contradicted the
  ledger the same deployment publishes at `/v1/sources`. **Superseded**: both
  became `served` on 2026-08-14 once permission was obtained, on the basis set
  out in section 1. Kept as the record of why ingestion was held back for a
  fortnight, not as the current position.

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

## 6. Caribbean coverage audit, 2026-08-14

Thirty Caribbean economies were queried against the live service to find out
where the real gaps are rather than assuming them. **27 returned data and three
did not.** Two of the three are not gaps in the ordinary sense. The third was a
genuine defect, and it was only found because the sweep was re-run rather than
an earlier count repeated.

**Guadeloupe and Martinique are French overseas departments.** So are French
Guiana, Reunion and Mayotte. The World Bank and the IMF report them inside
France, so no international source this service draws on holds a country-level
series for them, and none is likely to. The figures do exist, published by
INSEE at department level. This is settled and does not need re-researching.

Until 2026-08-14 they returned a bare "No snapshot data available", which reads
as a lookup failure and invites a caller to retry with a different spelling.
They now return the constitutional reason, the parent economy, and the INSEE
department page, carrying the same `no_published_data` contract as every other
absence. See `INTEGRATED_TERRITORIES` in `server/src/core/countries.ts`.

One trap worth recording. The obvious INSEE deep link,
`insee.fr/fr/statistiques?geo=REG-nn`, returns HTTP 200 and a byte-identical
page for four different regions, because the filter is applied in the browser.
It looks like a working per-territory link and is not one. The stable
per-department page is `insee.fr/fr/statistiques/2011101?geo=DEP-nnn`, verified by
reading the title of each.

**The Caribbean Netherlands (BES) was the real defect.** Bonaire, Sint Eustatius
and Saba were missing from the country table, so the code fell through the
three-letter passthrough and the service answered "No snapshot data available
for 'BES' (BES)", echoing the code back as though it were a name. That is the
same defect the nineteen territories added on 2026-08-13 were meant to close.
BES is now in the table and refers the caller to CBS, which publishes Caribbean
Netherlands figures. It is three special municipalities of the Netherlands, not
an overseas department, so the explanation carries a per-territory description
of the relationship rather than one hardcoded phrase.

**Anguilla, Montserrat and the British Virgin Islands are the opposite case.**
They are real economies with no World Bank coverage, and they are served from
ECCB and from UNCTAD via DBnomics. They are the headline example of what this
vertical is for.

## 7. Open items

1. **OWNER**: forward the ECCB/CBB grant text so the licence ledger can flip.
   Everything sub-annual depends on it.
2. ~~Normalise the Montserrat upstream error into the honest-absence
   contract.~~ Done 2026-08-13, with tests.
3. Extend the cross-check to the six ECCU members individually, their
   national figures come via ECCB reports, readable and citable even while
   ingestion stays blocked.
4. Decide whether StatCite serves sub-national geographies at all. The INSEE
   referral answers the question for the French departments without committing
   to ingesting regional data, which is a much larger scope.
