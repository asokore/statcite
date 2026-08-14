# CaribStat

Caribbean and small-states official statistics: scheduled ingestion from
regional central banks into dated, citable JSON snapshots, served through
[StatCite](https://statcite.com).

Read `SCOPING.md` first. It holds the source recon, the architecture decision
and the phasing. This file records current status only.

## Status: 2026-08-10

**Phase 0 (licence gate): CLEARED.** The operator obtained permission from the
source institution. Ingestion proceeds.

**Phase 1 (ECCB): complete.** **Phase 2 (StatCite adapter): built, not served.**
**Phase 3 (CBB): ingesting.** Fetch, parse, validate and snapshot work end to
end against both banks.

| corpus | series files | snapshots |
|---|---|---|
| ECCB (9 geographies, 7 tables, a/q/m) | 153 | 153 |
| CBB (7 categories, 43 sheets) | 43 | 43 |

One CBB gap remains, recorded rather than hidden: the `statistics` workbook's
B2F/B3F sheets have no period label and no plausible period column, so the
fallback correctly declines rather than adopting a data column. It fails loudly
in the runner every run.

Balance of payments now extracts 14 of 15 sheets (the 15th is the workbook's
Table of Contents). Its merged year headers anchor at the LEFT of their span, 1967 sits in column 0 while its values sit in column 1, so the reader maps each
period to the last column of its merge span. That mapping was checked against
the raw sheet before being trusted, because an off-by-one year on a
balance-of-payments figure is exactly the wrong-but-plausible number this
pipeline exists to prevent.

| | state |
|---|---|
| Session handshake (UA + CSRF + cookies) | working |
| Per-geography retrieval, all 9 geographies | working |
| Annual sweep, 7 tables | complete |
| Quarterly sweep, 6 tables | complete |
| Monthly sweep, 4 tables | complete |
| **Corpus** | **153 series files, 153 dated snapshots, 78,111 non-null observations** |
| Shape sentinels | working, and proven to reject |
| Tests | 52 passing, fixture-backed |
| Publish to a static origin | not started |
| StatCite adapter (Phase 2) | not started |

### Why this exists, demonstrated

**Anguilla and Montserrat are not World Bank reporting economies.** Checked
live on 2026-08-10: `gdp_growth` for Anguilla returns no data and Montserrat
returns an upstream error. ECCB publishes full fiscal, debt, monetary,
tourism, interest-rate and CPI series for both. That gap is the product.

### Independent validation

ECCB's own debt-to-GDP, parsed by this pipeline, against the IMF's general
government gross debt via StatCite (2025, percent of GDP):

| | ECCB | IMF | diff |
|---|---|---|---|
| Saint Lucia | 76.82 | 77.1 | −0.3 |
| Grenada | 73.44 | 71.6 | +1.8 |
| St Vincent and the Grenadines | 109.05 | 113.4 | −4.4 |
| St Kitts and Nevis | 54.54 | 58.4 | −3.9 |
| Dominica | 98.20 | 102.6 | −4.4 |
| Antigua and Barbuda | 67.78 | 69.7 | −1.9 |

Two independent pipelines agreeing within a few points is evidence the parser
extracts real values. The consistent direction (ECCB slightly lower) is the
expected definitional difference between ECCB's *public sector debt* and the
IMF's *general government gross debt*, not an error by either, and exactly
the kind of thing a citation has to name.

## What is NOT done, and must not be skipped

**Nothing here is published or served.** StatCite's licence ledger still
records `eccb` with verdict `refused`. That ledger is a public legal claim and
every entry in it carries a verbatim basis, a scope and a verification date.
Flipping it needs the grant itself: **who granted it** (institution and role),
**the date**, and **the scope**, redistribution, derivative works, commercial
use (the metered Apify surface makes that live), and any required attribution
wording. Until those are recorded, output stays local.

## Collection when new data is available

Two schedulers, because one of them cannot run yet.

- **Local (active now):** a daily task at 07:30 runs both ingests, commits only
  what the banks changed, and reports NEW / PUB / qry / same counts plus any
  sentinel failures. Defined in `~/.claude/scheduled-tasks/caribstat-ingest/`. It runs
  while the app is open; if the app was closed when it was due, it runs on next
  launch.
- **CI: deliberately removed.** The old `.github/workflows/ingest.yml` committed
  `data/` on every run. That was harmless while this lived in a repository with
  no remote. It is now inside a PUBLIC repository, where the same workflow would
  be an automated redistribution engine for data the licence ledger says may not
  be redistributed. It was not carried over, and must not be reinstated while
  the ledger records these sources as not served.

**Change detection is what makes a schedule worth having.** `tools/changed.mjs`
compares a freshly-built document against what is on disk, ignoring only our own
`retrieved_at`. A dated snapshot is written ONLY when the source's content
actually moved, so the history is a record of what the banks published rather
than of when the cron happened to fire. A quiet week produces no commits, and
"nothing changed" becomes a real signal instead of a wall of identical diffs.

**A content diff is not by itself a publication.** The first full sequence run
reported 135 ECCB series as changed in an hour. Central bank statistics do not
move like that, and they had not: every bank stamp still read 2026-07-28. The
diff was a 2026 column that appeared because the ingest window was widened from
`--end 2025` to `--end 2026`. Our request had changed, not the source. Reported
without that distinction it is a false claim about the world rather than about
our query, so the runners now print four states, judged against the banks' OWN
currency stamps (ECCB prints `data_as_at`, CBB gives `published_at`):

| | meaning |
|---|---|
| `NEW ` | nothing on disk yet |
| `PUB ` | content moved AND the bank's stamp moved, **the source republished** |
| `qry ` | content moved but the stamp did not, our window or parser changed |
| `same` | identical once our own `retrieved_at` is set aside |

Only `PUB` means a bank published something. Widening a window, fixing a parser
or adding a table all show as `qry`, which is real work worth committing but is
not news about the region.

## Usage

```bash
npm test                                    # parser + sentinel tests, no network
node tools/eccb/run.mjs --dry-run           # what would be fetched, no requests
node tools/eccb/run.mjs --freq a --start 2015 --end 2025
node tools/eccb/run.mjs --table consumer-price-index --freq q
```

The runner exits non-zero if any series fails its sentinel. **Do not pipe it
through `tee` without `set -o pipefail`**, a pipeline reports the last stage's
status, so failures vanish. That happened on the first annual sweep: exit 0
with 18 failed series.

## Layout

```
tools/eccb/fetch.mjs      session handshake, table parsing, period normalisation
tools/eccb/catalogue.mjs  table definitions, geographies, sentinel rows
tools/eccb/ingest.mjs     validation, document shape, snapshot writing
tools/eccb/run.mjs        CLI
data/eccb/{table}/{freq}/{ISO3}.json              latest (mutable)
data/eccb/{table}/{freq}/snapshots/{ISO3}.{date}.json   immutable vintage
```

## Traps already paid for

Each of these cost a debugging cycle and is documented at its call site:

- `frequency` is **uppercase** (`A`/`Q`/`M`) in the POST body while the URL
  suffix is lowercase (`/a`). Sending lowercase returns an opaque HTTP 500.
- The geography field is `country_code[]`, an array, and dates are
  `DD/MM/YYYY`. Both fail the same silent way.
- The CSRF token lives in `<meta name="csrf-token">`, not reliably in a hidden
  input. Matching only the input yields an empty token and a 419 that reads
  like a block.
- **CPI is one table per country**, not a geography selector like every other
  table, and its URL slugs differ from the selector's display names.
- Column labels differ by frequency: `2024` annual, `Mar 2024` quarterly,
  `Jan 2024` monthly. Normalised to `2024`, `2024-Q1`, `2024-01`, with the raw
  labels preserved.
- **Provenance is per table, not per site**: fiscal accounts stamp
  2026-07-28, public sector debt 2026-06-08, monetary survey 2026-07-09, and
  CPI varies *by country*. Caching one date for the source would mislabel most
  of the corpus.

## Where this lives, and where the data does not

This pipeline sits inside the StatCite repository because the sources it
collects are declared on statcite.com: `eccb` and `cbb` both appear in the
public licence ledger at https://statcite.com/v1/sources. Code that backs a
claim the website makes belongs beside the website.

**The harvested data is deliberately NOT in this repository.** `caribstat/data/`
is gitignored. This repository is public, and the ledger states plainly that
neither source's terms permit the redistribution StatCite would be performing:

> Not served. ECCU monetary and financial statistics are published by the ECCB,
> but its website terms do not permit the redistribution this service would
> perform.

Committing the harvest here would carry out precisely the redistribution that
sentence says we refuse, which would make a legal claim we publish about
ourselves untrue. The extraction code is open. The extract is local.

That stays true even after a grant arrives. The gate is the licence ledger entry
with its verbatim basis, and flipping it is the operator's decision, not a
consequence of permission landing in an inbox.

Data lives at `caribstat/data/` on the operator's machine and is not backed up
by this repository.
