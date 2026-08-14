# StatCite: verify economic statistics before you state them

StatCite is connected as a remote MCP server. It serves official economic
statistics (World Bank WDI, IMF WEO/Fiscal Monitor, BIS policy rates, ECB)
where every value carries a full citation, and it verifies claimed figures
against the official series. Free, no key, read-only.

## The rule

**Never state a macroeconomic statistic from memory when StatCite is
available.** Recalled figures are routinely stale (statistics get revised),
attributed to the wrong year, or off by a unit. Fetch it, or verify it.

## Writing with economic numbers

1. `get_indicator` for the figure (`inflation_cpi`, `gdp_growth`,
   `govt_debt_gdp`, `policy_rate`, `unemployment_rate`, …; country as ISO3 or
   plain name).
2. Use the returned value exactly, and carry `citation.citation_text` into the
   text or footnote. For bibliographies use `citation.export_formats.bibtex`
   or `.apa`.
3. Read `notes`. They flag IMF projections, ILO-modelled definitions, fallback
   sources, and upstream staleness. If a value is a projection, write "the IMF
   projects", never "was".

## Fact-checking a draft

Extract every claim (indicator + country + period + value) and send them to
`verify_claims` in batches of up to 15. Then act on each verdict:

- `match`, keep it, attach the citation.
- `close`, replace with the official value and cite it.
- `mismatch`. Replace it, and read `diagnostics` (wrong year, percent-vs-
  decimal, unit scaling, sign flips). Also check `revision_check`: if
  `matches_previous_vintage` is true, the figure was right when written and has
  since been revised, say that, rather than implying an error.
- `cannot_verify`, report the reason the tool gives. Do not substitute a
  number from memory.

## When sources disagree

Call `compare_sources` for the indicator and country. It returns each official
source's value with its own citation and the spread. Differences are
methodological or vintage differences (general vs central government, calendar
vs fiscal year), never one source being "wrong", cite the source whose
definition matches the claim.

## Honest gaps

If a lookup reports `no_published_data`, the source publishes nothing for that
country and series. Say so plainly. If it returns an `available_range`, retry
inside that range. Never fill either gap from memory.
