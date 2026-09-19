# Improvement pass 2, 19 September 2026 (1.14.0)

The second hunt of the day, run over six lenses: protocol, errors, registry,
layout, pipeline, release engineering. Eighteen findings survived a second
reviewer paid to knock them down, and all eighteen shipped. Every one carries a test that
fails without the change, and every one of those tests was mutation-proved:
the guard was broken on purpose, the test was seen to fail, and the break was
reverted. Thirty-nine mutants, thirty-nine killed, one of them only after the
test was strengthened.

The first pass of the day is recorded in `IMPROVEMENTS-2026-09-19.md`. This one
is separate because it was found after 1.13.0 shipped, and one of its findings
is about how 1.13.0 shipped.

## What was wrong, in one line each

| # | Where | What a caller was told |
|---|---|---|
| 1 | `rest.ts` | An outage answered 422, "your request was wrong", on the four busiest routes |
| 2 | `tools.ts`, `mcp.ts` | A malformed upstream document was reported as a StatCite crash |
| 3 | `snapshot.ts` | A dead World Bank became "this economy publishes none of these", cached an hour |
| 4 | `series.ts` | A primary that stopped in 2017 outranked a fallback publishing through 2025 |
| 5 | `indicators.ts` | The poverty key advertised a line the World Bank retired |
| 6 | `indicators.ts` | Tourism receipts sold as a headline measure, series frozen since 2020 |
| 7 | `mcp.ts` | Prompts declared no arguments and `prompts/get` discarded the ones sent |
| 8 | `mcp.ts` | `server/discover` put identity only in `_meta`, which hosts strip |
| 9 | `mcp.ts` | Every tool result pretty-printed on the wire, about 30% waste |
| 10 | `site/*.html` | The mobile table rule never fired: the registry rendered 10,584px tall |
| 11 | `site/index.html` | Seven of eight Connect panels invisible without JavaScript |
| 12 | `site/index.html` | The verifier form discarded the visitor's input without JavaScript |
| 13 | `caribstat/tools/cbb` | An unreadable period label deleted its observations, silently |
| 14 | `adapters/caribstat.ts` | Four of 23 catalogue sample rows answered 422 |
| 15 | `adapters/caribstat.ts` | Every CBB row error read "undefined/BRB" |
| 16 | `publish-mcp.yml` | The registry publish had no green-CI gate |
| 17 | `ci.yml` | The sitemap guard skipped on every run since it was written |
| 18 | `smoke-live.mjs` | The twice-daily live smoke never sent a request to statcite.com |

## The measurements

Numbers here were taken in this pass, not carried over.

**Poverty line.** `api.worldbank.org` names SI.POV.DDAY "Poverty headcount ratio
at $3.00 a day (2021 PPP) (% of population)". The registry, `site/docs.html`
and `site/llms-full.txt` all said $2.15/day, 2017 PPP.

**Tourism receipts.** 1,325 rows returned for 2021 to 2026 on
ST.INT.RCPT.XP.ZS, every one null. Barbados last reports 2016, Jamaica 2011,
St Lucia 2018, Maldives 2020.

**The stale-primary threshold.** Set at more than three years because at that
level the note fires for 21 of 200 economies on BN.CAB.XOKA.GD.ZS and 10 of 257
on NY.GDP.MKTP.KD.ZG, while the 14 economies sitting exactly three years back
are ordinary slow refreshes. No annual series publishes the current year, so a
gap of one or two is normal.

**Tables.** At 375px the /docs registry table measured 10,584px before and
4,257px after, the homepage sources table 3,051px before and 1,550px after, the
bench table 552px before and 331px after. `display` went from `block`, which
drops a table's implicit ARIA role, back to `table`. No horizontal page overflow
at 375px or 1280px.

**Connect panels.** One panel visible with the noscript stylesheet absent, eight
with it applied in source order, tabs hidden. Measured by injecting the
stylesheet, not by reading it.

**CaribStat period labels.** 662 documents in the local corpus, 29 distinct
unparsed labels. The relaxed month pattern admits exactly one, "February2025",
and no prose. The publish sentinel, which requires the label to be entirely a
period AND the row to have carried numbers, fires on that one label and nothing
else across the ten sample workbooks.

**Catalogue sample rows.** 23 entries fetched and run through the production
`selectRow`: 4 failed before, 0 after.

## Three things deliberately not done

**The footnote-marker strip.** Parsing "April 2020*" and "February 2021*"
recovers nothing, because those rows are NA in every column and the all-null
spacer guard drops them, and it would erase the only surviving record of two
months the bank's own footnote says had no activity. Strictly worse than
leaving them in `unparsed_labels`.

**A period-shape-only publish sentinel.** It fires on five prose footnotes
across the corpus, and a problem blocks the whole document, so
`interest-rates`, `the-wages-index` and both inflation RW sheets would fail on
every run.

**`gni_per_capita_atlas`.** Its label matches upstream exactly and its note is
correct. Adding a date to a correct note is a cosmetic edit with no defect
behind it.

## Two things the next pass should know

The 26 pre-registered benchmark questions that name the $2.15 poverty line were
left alone. Their expected answers are null and therefore insensitive to the
line named, and editing a pre-registered question is worse than leaving a stale
phrase in it.

The CaribStat parser fix does not repair the three live holes by itself. The
published documents are written by the ingest pipeline, which runs separately,
so 2025-02 stays missing from the e4 document until that pipeline next runs
over the workbook. The new sentinel means the next run either fixes it or
refuses to publish the table.
