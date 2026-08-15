# CaribStat

Caribbean and small-states official statistics: scheduled ingestion from
regional central banks into dated, citable JSON snapshots, served through
[StatCite](https://statcite.com).

Read `SCOPING.md` first. It holds the source recon, the architecture decision
and the phasing. This file records current status only.

## Status: 2026-08-15

**ECCB IS SERVED, live at statcite.com since 2026-08-14.** The data is published at
github.com/asokore/caribstat and fetched by the Worker like any other upstream.
CBB is collected but not served: its documents carry a publication date rather
than the Bank's own currency stamp, and serving them as equivalent would
misstate the source.

**Phase 0 (licence gate): CLEARED.** The operator obtained permission from the
source institution. Ingestion proceeds.

**Phase 1 (ECCB): complete.** **Phase 2 (StatCite adapter): built, not served.**
**Phase 3 (CBB): ingesting.** Fetch, parse, validate and snapshot work end to
end against both banks.

| corpus | series files | snapshots |
|---|---|---|
| ECCB (9 geographies, 7 tables, a/q/m) | 153 | 153 |
| CBB (8 categories, 45 sheets) | 45 | 45 |

**No CBB gap remains.** This section previously recorded the `statistics`
workbook's B2F/B3F sheets as having no period label and no plausible period
column, failing loudly on every run. That was fixed on 2026-08-14 in the same
pass as the XLSX self-closing-cell bug: the category now ingests 148 monthly
periods to April 2026, and `CBB_UNEXTRACTED` in `tools/cbb/fetch.mjs` is empty.
A FAIL from any category is now a regression to investigate, not a known gap to
wave through.

Balance of payments extracts 14 of 15 sheets (the 15th is the workbook's
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

- **Local (active now):** a daily task at 07:30 runs both ingests and reports
  NEW / PUB / qry / same / SKIPPED counts plus any sentinel failures. It runs
  incrementally Monday to Saturday and with `--deep` on Sunday. Defined in
  `~/.claude/scheduled-tasks/caribstat-ingest/`. It runs while the app is open;
  if the app was closed when it was due, it runs on next launch.
  **It does not commit the data, and must not.** That bullet used to say it
  committed what the banks changed, which was true only while this lived in a
  repository with no remote; the rule inverted on 2026-08-13 when the pipeline
  moved into this public repo. See "Where this lives, and where the data does
  not" below.
- **CI: deliberately removed.** The old `.github/workflows/ingest.yml` committed
  `data/` into this repository on every run. That was harmless while this lived
  in a repository with no remote. It was not carried over and must not be
  reinstated here: the data's canonical home is github.com/asokore/caribstat,
  and a workflow committing it into this repo too would create a second copy
  that can drift from the one being served. (This bullet previously justified
  the removal by saying the ledger records these sources as not served. Both
  entries were flipped to `served` on 2026-08-14 once the banks' permission was
  obtained, so that justification is retired even though the removal stands.)

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

## Incremental collection: asking only for what could have moved

Change detection above still required fetching everything first, then throwing
almost all of it away. A daily run made 168 ECCB requests and downloaded 8 CBB
workbooks to conclude, nearly every time, that nothing had moved. The balance of
payments workbook has not been republished since **2022-07-28** and was being
downloaded in full every single day.

The runners now ask a cheaper question first, using each bank's own claim about
its currency:

- **ECCB.** A geography-selector table renders all nine geographies from one
  page, and that page prints the `Data as at` stamp. One GET reveals whether the
  table moved; if it did not, the nine POSTs behind it cannot return anything new
  and are not made. Per-country tables (CPI) get **no** shortcut and are not
  given a fake one: each geography's page IS its table, so there is nothing to
  save by fetching it and discarding it.
- **CBB.** The CDN puts a publication timestamp in the filename, so a new
  publication is necessarily a new URL. If the newest item still points at the
  workbook we already hold, the download does not happen.

Measured on 2026-08-15, a quiet day: **478s to 81s**, with 135 ECCB requests and
8 workbook downloads not made. The verdicts were identical, confirmed by running
`--deep` immediately afterwards and getting the same 45 sheets and 63,255
observations.

**`same` and `SKIPPED` are different claims and are never merged.** `same` means
we re-read the numbers and they matched. `SKIPPED` means we did not re-read them
and are trusting the bank's stamp. A report that collapsed the two would be
claiming verification it did not perform.

**What the shortcut cannot see, and what bounds it.** A stamp is a claim, not a
guarantee: a silent correction that left the stamp untouched, or a workbook
replaced in place under an unchanged URL, would slip past. `--deep` ignores the
shortcut entirely and re-reads everything. The schedule runs deep on Sundays, so
that class of change can hide for at most seven days. Two independent conditions
must hold before anything is skipped, and either one vetoes it:

1. the check ledger (`data/{source}/_last_check.json`) records the same stamp
   **and the same query window** as last time, because widening `--start`/`--end`
   legitimately changes our extract while the bank's stamp stands still, and
2. every document already on disk agrees it was built from that same stamp.

The ledger is our own bookkeeping and is deliberately not trusted alone. If it
drifts from the data, the cost is a redundant fetch, never a skipped update. An
unreadable ledger reads as empty, which fails toward doing the work.

The ledger also replaced a wart: the pipeline used to answer "when did we last
confirm this?" by rewriting all ~196 latest files with a fresh `retrieved_at`
every run, so a quiet day still churned every file and the schedule's notes had
to explain that the mtimes were not evidence of a write. That claim is now
recorded once, in one file, and the data files are left alone.

## Usage

```bash
npm test                                    # parser + sentinel tests, no network
node tools/eccb/run.mjs --dry-run           # what would be fetched, no requests
node tools/eccb/run.mjs --freq a --start 2015 --end 2025
node tools/eccb/run.mjs --table consumer-price-index --freq q
node tools/eccb/run.mjs --freq a --deep     # ignore the stamp shortcut, re-read everything
node tools/cbb/run.mjs --deep               # re-download every workbook
node tools/status.mjs                       # what we hold, and how far behind today it is
```

`tools/status.mjs` reports the newest period that actually **holds a value**,
not the newest column. Asking ECCB for `--end 2026` returns columns through
December 2026 whether or not those months exist yet, so a monthly table carries
several entirely-null future columns; counting them would have the inventory
claim coverage the data does not have.

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
tools/changed.mjs         did the content move, and did the SOURCE republish
tools/checkpoint.mjs      the check ledger and the skip decision
tools/status.mjs          inventory: newest period held, per series
data/eccb/{table}/{freq}/{ISO3}.json              latest (mutable)
data/eccb/{table}/{freq}/snapshots/{ISO3}.{date}.json   immutable vintage
data/{source}/_last_check.json                    check ledger (bookkeeping, never data)
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

### Independent verification of the ECCB values, 2026-08-15

Every value-level defect this pipeline has produced was a PARSING defect, and
a parser cannot audit itself: re-running the ingest and getting the same answer
proves consistency, not correctness. So the published ECCB data is checked
against a second implementation, written in another language so it shares no
code path with the ingest.

    node tools/eccb/capture.mjs --all --start 2015 --end 2026
    python tools/eccb/verify_independent.py

**Result: 55 documents, 11,838 cells, zero disagreements.** The capture step
reuses the pipeline's fetch, because the CSRF handshake needs it and fetching
is not where any defect has been found. The parse and the comparison are
independent.

The verifier is proven able to fail: changing one published value by 0.01 and
renaming one row is reported as exactly two disagreements, and the run returns
to zero when they are restored. A checker that has only ever printed zero is
not evidence of anything.

Two things the first run got wrong, both in the CHECKER rather than the data,
and both worth knowing before trusting a future report:

- ECCB writes a missing value as a run of dashes, `---`. A single-dash pattern
  reported 44 false mismatches.
- Tables in this corpus were collected with different date windows, so
  demanding identical period lists reported a capture-configuration difference
  as a data defect. The comparison now runs over the overlapping periods.

`.capture/` is gitignored. The verifier is committed; the publishers' raw HTML
is not ours to redistribute.

### ECCB: a repeated row label is not one series

A scan of all 154 ECCB documents on 2026-08-15, looking for the defect classes
the CBB half had just produced, found **27 with repeated row labels**. The
Anguilla fiscal accounts list "Domestic" three times, under Interest Payments,
under Financing and under Arrears, with entirely different values. StatCite's
row selector took the first exact match, so `#Domestic` served one series and
hid the other two while looking perfectly healthy. The prefix branch of that
selector had guarded against precisely this; the exact branch had not.

Repeated labels are now REFUSED with a message listing each occurrence and its
first value, and each is reachable as `#Domestic[1]`, `[2]`, `[3]`. The served
label carries "[2 of 3]" so three distinct series cannot share one citation,
and that display form can be pasted straight back in as a selector.

Note what was deliberately NOT done. The obvious fix is to name the rows
"Interest Payments: Domestic" and so on, as the CBB grouped-header fix does.
The parent heading is not available: the ingest reads the rendered table, whose
hierarchy is visual rather than structural, and a nearest-preceding-heading
rule gets it wrong (the "External" under Financing sits below an unrelated
"Other"). Inventing a parent we have not verified would be the same class of
error as everything else in this file, so the position is exposed instead. If
the source hierarchy can be recovered later, the named form is the better
answer.

### CBB spreadsheet traps, found 2026-08-14

The Central Bank of Barbados half is spreadsheets rather than HTML tables, and
four separate defects all surfaced as one message, "no data tables found", on
the `statistics` category. Each hid the next.

- **Self-closing cells.** Excel writes `<c r="A9" s="14"/>` for a blank cell
  that still carries formatting. `tools/xlsx.mjs` required a closing `</c>`, so
  the empty cell's match ran on to the NEXT cell's closing tag, took its value,
  and deleted it. This corrupted data that was already published: the wages
  index lost a whole series column and served values under the wrong labels,
  inflation carried four periods that do not exist, and BOP travel had a
  cruise-passenger figure that is genuinely null. If a sheet ever reads as a
  column of small ascending integers where labels should be, this is why.
- **Two date encodings in one column.** The investments sheet writes its early
  dates as text ("31-Jan-2014") and its later ones as Excel serials. Month-end
  folding has to run on both paths or the final observation is labelled
  `2026-04-30` while every other reads `2026-04`.
- **Revision markers in brackets.** The wages sheet ends "2016 (R)",
  "2017 (P)", "2018 (P)". Only a trailing bare R or P was handled, so the three
  most recent years of a series that stops in 2018 were dropped as
  unparseable.
- **Headers spanning two rows.** Sometimes the upper row carries country groups
  over repeated instrument names, sometimes the lower row names only a subset
  and the rest sit above. Blanks are filled from above and repeated labels are
  qualified as "BARBADOS: Fixed Income Securities", both only when needed, so
  sheets with unique complete labels are left alone.

### The period column can only be read through its number format, 2026-08-15

Three live sheets carried TWO period formats in one series — `tourism`
(H1 - Processing), `inflation-and-retail-price-index` (Jul2001_EOP_RW) and
`statistics` (B2F). Nothing caught it, because every individual label was
defensible on its own. Only the shape of the SERIES was wrong, and a consumer
joining on the period string sees `2025-01` and `2025-01-04` as two different
months.

**The tourism column drifts.** Its serials run 2022-01-01, 2022-02-01 … then
2022-10-02, 2022-11-03, 2022-12-04, and stay on the 4th forever. Read as dates
that is a series with a wandering day, and the month-start fold stops applying
partway through. Read through the cell's own number format, `[$-409]mmmm\-yy;@`,
every one of them displays to a human as "January-22" and **the day is never
shown at all**. The drift is an artefact of how the column was generated; the
bank means months. The inflation table is the same story with `mmmm\ yyyy`.

So the reader now resolves each cell's number format and `normalisePeriod`
folds an arbitrary day to `YYYY-MM` **only** when the format proves no day is
displayed. That is the one rule here allowed to discard a day component, and it
is allowed to because the format is evidence rather than an inference from the
values. Widening the fold to "any day of the month" would have been the obvious
fix and would have silently destroyed genuine daily dates elsewhere.

**B2F is the opposite case and needed the opposite reasoning.** Its format is
`[$-409]d\-mmm\-yyyy;@`, which does display a day, so the month-only rule
correctly does not fire. It is a month-end series, and 147 of its 148 labels
folded already; the one that did not was `2024-02-28`, because February 2024
ended on the 29th. 28 February now counts as month-end in a leap year too.

Two traps inside the trap, both of which produced a confidently wrong answer
before being caught:

- **`styles.xml` has two blocks of identical `<xf>` elements.** `cellStyleXfs`
  comes FIRST and `cellXfs` is the one cell `s=` indices point at. A regex that
  takes whichever it finds reported the tourism period column as an accounting
  number format, which is how this investigation initially concluded the bank
  displayed raw serials. `parseStyles` slices the `cellXfs` block explicitly.
- **A format's literals can contain a `d`.** `mmmm "d" yyyy` prints a letter,
  not a day, so quoted literals, escapes and `[$-409]`-style prefixes are
  stripped before looking for a day token.

A sentinel now FAILS any sheet whose periods carry more than one format, so
this class cannot pass silently again. It was checked against the three real
pre-fix documents and catches all three, naming the offending labels.

- **A wrong period axis, chosen by fallback.** The depository-corporations
  sheets label months as text in column 0 ("January 2007" … "February 2026").
  That format was unrecognised, so nothing in the column parsed, and the
  period-run search fell through to the next column along, an "End of Period"
  column of Excel serials. It is not a period axis: it is misaligned with the
  month labels (the row reading "January 2007" holds a serial for January
  2012) and it stops in 2019. The published result was real values under real
  labels with **invented dates**, and 143 of 230 months missing. When a parser
  picks its axis by heuristic, check WHICH column it picked, not just that the
  numbers look sane. There is now a sentinel for this: `axis_coverage` is the
  share of a sheet's data rows that carry a parsed period, and the ingest
  REFUSES a sheet below 0.6. Correctly-read CBB sheets measure 0.96 to 1.00;
  the bad read measured 0.38. Note that the coverage metric must ignore the
  period column itself, or a dated row whose values are all "NA" counts as
  data and a healthy sheet fails the gate — that false positive appeared on
  the industrial-production sheet the first time this ran.
- **A date column served as a statistic.** Same sheets: once the axis was
  right, the serial column became a "series" of five-figure numbers. It is
  dropped by `isDateColumn`, on either a date-naming header or a
  calendar-shaped step, because comparing it against the period axis does not
  work when the source's own serials disagree with its own labels.

One more, which is about citation rather than parsing. **CBB's page `<title>`
is not reliable.** The item page for the June 2025 tourism release carried
`<title>Long Stay & Cruise Arrivals December 2023</title>`, and a matching
og:title, while its `<h1>` and its attachment filename both said June 2025.
Their CMS had carried the previous release's title forward. Titles come from
the `<h1>`, and an ingest now refuses any item whose title and attachment
disagree on the year rather than storing a wrong citation.

## Where this lives, and where the data does not

This pipeline sits inside the StatCite repository because the sources it
collects are declared on statcite.com: `eccb` and `cbb` both appear in the
public licence ledger at https://statcite.com/v1/sources. Code that backs a
claim the website makes belongs beside the website.

**The harvested data is deliberately NOT in this repository.** `caribstat/data/`
is gitignored, and stays that way.

The reason changed on 2026-08-14 and this section has been corrected to match.
It previously quoted a ledger entry reading "Not served ... its website terms do
not permit the redistribution this service would perform", and argued that
committing the harvest here would make a claim the site publishes about itself
untrue. **That quotation is retired.** The operator wrote to both banks
describing this service and obtained permission, and the ledger entries for
`eccb` and `cbb` were flipped to `"license_verdict": "served"` on 2026-08-14
with their basis recorded. The requests that were granted are public in
`caribstat/outreach/`. Verified against the live ledger on 2026-08-15.

So redistribution is no longer the reason. The reason now is simply that the
data has ONE canonical home and this is not it: the collected JSON is published
at **github.com/asokore/caribstat**, which is the location the ledger's `access`
field names and the Worker fetches. Committing ~28MB of the same files here
would create a second copy that can silently disagree with the one being served.

A lesson worth keeping, since this section is where it was learned: **do not
paste a mutable ledger's prose into a document.** Cite the ledger and state the
date it was checked. The quotation above sat here as a confident verbatim block
for a day after the thing it quoted had changed.

Data lives at `caribstat/data/` on the operator's machine, is published from
there to github.com/asokore/caribstat, and is not backed up by this repository.

### Publishing: `tools/publish-run.mjs`, added 2026-08-15

For most of this pipeline's life "published from there" meant a one-off manual
sync, done by hand with a scratch clone whenever someone remembered to. That
gap produced a live incident the same day it was found: a period-format fix
landed in the local corpus and never reached github.com/asokore/caribstat, so
StatCite's public API kept serving the pre-fix labels for hours after the fix
existed, because the Worker's upstream is the PUBLISHED repo, not this one.

```bash
node tools/publish-run.mjs --dry-run   # classify only, no clone/commit/push
node tools/publish-run.mjs             # sync + commit + push, if anything changed
```

First run clones github.com/asokore/caribstat to `caribstat/.publish/`
(gitignored — it is a checkout of a DIFFERENT public repository and must never
be mistaken for part of this one). Every run after that fetches and hard-resets
that clone to `origin/main` before comparing, because nothing else should ever
be committing into it between runs.

Same discipline as the rest of this pipeline: comparison uses `changed.mjs`'s
`canonical()`, so a difference in nothing but `retrieved_at` is never mistaken
for real content and republished. A raw file diff would have shown all ~400
files as changed on the day this was written.

**A file published but no longer produced locally is reported and never
deleted.** "We stopped collecting X" and "X briefly failed to ingest" look
identical from inside a sync script; only a person can tell them apart. If a
run ever prints an orphan warning, that is the decision waiting, not a bug.

This is not yet wired into the scheduled task. Running it is a deliberate
extra step for now, not an automatic consequence of a clean ingest.
