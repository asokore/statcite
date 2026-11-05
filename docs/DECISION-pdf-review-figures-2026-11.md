# Decision: figures the banks publish only in PDF reviews

A-062, decided 2026-11-03.

## The question

The Central Bank of Barbados posted its Review of Barbados' Economy for January to September 2026 on 28 October 2026 and an updated Outlook for Barbados' Economy on 30 October. Both are PDFs. Their GDP estimates, inflation rate, unemployment rate and outlook figures are newer than anything in the bank's workbooks. On 3 November 2026 the newest Retail Price Index workbook ran to October 2024, the newest labour workbook to the first quarter of 2024, and the GDP workbook to 2023. The ECCB publishes its Economic and Financial Review the same way. How should StatCite carry these figures?

## Options considered

1. Extract the figures from the PDFs automatically and serve them as series.
2. Enter selected figures by hand into a small curated table, each with its page.
3. Serve no review figures, and tell the reader when a newer review exists.
4. Do nothing.

## Decision

Option 3 now. Option 2 only later, and only under the rules below. Option 1 is ruled out.

## Why not automatic extraction

- Text extraction from PDF tables is not reliable enough to cite. Layout-preserving extraction can shift a row's figures under the wrong column headings, and nothing in the extracted text shows it happened. The safe reading of a PDF table is from a rendered page.
- Many review figures sit in prose rather than tables, are rounded, and are marked as preliminary estimates that the next review revises.
- Every StatCite value carries a citation that a reader can follow to a cell. A wrong number served under the bank's name is the specific harm this service exists to prevent, and an extractor's errors would arrive with a correct-looking citation attached.

## What option 3 does

Where a CBB or ECCB series ends before the period the bank's latest review or outlook runs to, the response carries a notice. It names that publication, its posting date and its link, and says the publication may hold newer figures than the series. The notice makes no claim about any value. It tells the reader that something newer exists and where to find it.

The test is the period the publication runs to, not its posting date. This decision first said posting date, and A-063 narrowed it. A review is posted weeks after its period closes, so a series current to that period would have been flagged, and so would nearly every monthly table. The January to September 2026 review, posted on 28 October, runs to September 2026. An item naming no period, such as the Outlook, takes the last full quarter before it was posted.

Two more limits came out of review. Measured on the corpus on 5 November 2026, the rule above still flagged 1,462 of 1,524 CBB rows, which is noise. An annual row stays current until a later whole year has closed, since a review to June 2026 cannot extend an annual 2025 total. A table that stopped more than five years before the publication gets no notice, because it was discontinued rather than overtaken: an October 1965 base index ending in 1980 will not continue in a 2026 review. With both limits the same measure gave 655 of 1,524 CBB rows and 639 of 6,732 ECCB rows, down from 2,321.

The coverage watch (`caribstat/tools/watch.mjs`) lists these publications when it runs, and the scheduled collection runs it after each ingest. A run on 3 November listed both CBB documents above. A-063 built the notice:

- the watch keeps the newest review and outlook per bank and geography (title, posting date, link and the month it runs to) in `caribstat/data/reviews.json`, which is published with the corpus
- the file is merged and never rebuilt, because the sites show recent items only, so an older item cannot replace a newer one
- the server attaches the notice when a series' last period with a value ends before that month
- the notice is best effort: it is read only after the series has succeeded, and if the file cannot be read the series is served without it, at the cost of one short wait every five minutes. The live smoke test fails if the file disappears
- it travels on series responses (REST `/v1/series`, MCP `get_series`, and `verify_stat` and `verify_claims`, which read through them). `compare_sources` and `country_snapshot` report one value for one period and carry no notice
- the tests show the notice appears for a stale series and not for a current one.

## Rules if option 2 is ever used

A figure is entered by hand only if all of these hold:

- it comes from a table in the PDF, not from prose
- it was read from a rendered page image, not from extracted text
- it carries the publication, its date and the page number
- a second reader checked it against the same page
- it is labelled as a preliminary estimate from a review, and kept apart from workbook series.

Nothing will be entered until there is demand for a specific figure that no workbook or international source carries.
