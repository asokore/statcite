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

Where a CBB or ECCB series ends before the bank's latest review or outlook was posted, the response carries a notice. It names that publication, its posting date and its link, and says the publication may hold newer figures than the series. The notice makes no claim about any value. It tells the reader that something newer exists and where to find it.

The coverage watch (`caribstat/tools/watch.mjs`) lists these publications when it runs, and the scheduled collection runs it after each ingest. A run on 3 November listed both CBB documents above. Building the notice is A-063:

- the watch writes the reviews and outlooks it finds (bank, title, posting date, link) to a small published file under `caribstat/data/`
- the server attaches the notice when a series' last period ends before that posting date
- a test shows the notice appears for a stale series and not for a current one.

## Rules if option 2 is ever used

A figure is entered by hand only if all of these hold:

- it comes from a table in the PDF, not from prose
- it was read from a rendered page image, not from extracted text
- it carries the publication, its date and the page number
- a second reader checked it against the same page
- it is labelled as a preliminary estimate from a review, and kept apart from workbook series.

Nothing will be entered until there is demand for a specific figure that no workbook or international source carries.
