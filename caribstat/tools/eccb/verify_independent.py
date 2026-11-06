#!/usr/bin/env python3
"""Independent cell-by-cell check of published ECCB JSON against source HTML.

WHY A SECOND IMPLEMENTATION, IN ANOTHER LANGUAGE. Every value-level defect this
pipeline has produced was a parsing defect, and a parser cannot audit itself.
Re-running the ingest and getting the same answer proves consistency, not
correctness. This file re-derives the table from the same HTML using different
code, written deliberately without reference to the JS parser's structure, and
compares the result against what was published.

It is not fully independent: it reads HTML that the pipeline's own fetch
retrieved (the CSRF handshake needs that code). Fetching is not where any
defect has been found. Parsing is.

    node tools/eccb/capture.mjs --all          # writes ../.capture/**.html
    python tools/eccb/verify_independent.py    # compares against data/eccb

Exit status is 1 if any cell disagrees, so this can gate a release.

SPLIT COLUMNS. Trade in Services splits each year into six sub-columns. The
first version of this file zipped the same 12 year headers as the first version
of the parser, so two "independent" readers agreed on the wrong data. The two
now share no method. The JS reader walks the header cells above each column.
parse_split below takes the width of a year from the top header row and reaches
each value by arithmetic, then checks the result against the arithmetic of the
table itself and against the Balance of Payments, which publishes the same
totals in a table with no split columns to misread.
"""

import html as htmllib
import json
import os
import re
import sys

CAPTURE = os.path.join("..", ".capture")
DATA = os.path.join("data", "eccb")


def cells(tr):
    out = []
    for c in re.findall(r"<t[hd][\s\S]*?</t[hd]>", tr, re.I):
        text = htmllib.unescape(re.sub(r"<[^>]+>", "", c)).replace(" ", " ")
        # Collapse internal whitespace runs, as the pipeline does. The source
        # writes "Savings Deps.: Minimum  NC" with a double space, and comparing
        # raw text reported 18 label disagreements that were purely this
        # checker failing to normalise.
        text = re.sub(r"\s+", " ", text).strip()
        out.append(text)
    return [x for x in out if x != ""]


def to_number(v: str):
    """ECCB writes a missing value as an em-dash run ("---") or "n/a", and a
    negative in accounting parentheses. Getting the dash run wrong is the one
    mistake this checker has already made: a single-dash pattern reported 44
    false mismatches on the first run."""
    v = v.replace(",", "").strip()
    if v == "" or re.fullmatch(r"[-–—]+", v) or re.fullmatch(r"n\.?a\.?", v, re.I):
        return None
    negative = v.startswith("(") and v.endswith(")")
    v = v.strip("()")
    try:
        n = float(v)
    except ValueError:
        return ("UNPARSED", v)
    return -n if negative else n


MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]


def to_period(label, freq):
    """A column header as the period string the pipeline publishes.

    Frequency is REQUIRED, not cosmetic: ECCB labels a quarterly column with
    the quarter's END MONTH, so "Mar 2020" means 2020-Q1 in a quarterly table
    and 2020-03 in a monthly one. Reading the label without knowing which would
    silently mislabel a whole table, and the first version of this checker did
    not recognise these labels at all, reporting nine quarterly and nine
    monthly documents as having no table in the source.
    """
    t = (label or "").strip()
    if re.fullmatch(r"(19|20)\d{2}", t):
        return t
    if re.fullmatch(r"(19|20)\d{2}-Q[1-4]", t, re.I):
        return t.upper()
    if re.fullmatch(r"(19|20)\d{2}-\d{2}", t):
        return t
    m = re.fullmatch(r"([A-Za-z]{3,9})\s+((?:19|20)\d{2})", t)
    if m and m.group(1)[:3].lower() in MONTHS:
        month = MONTHS.index(m.group(1)[:3].lower()) + 1
        year = m.group(2)
        if freq == "q":
            return f"{year}-Q{(month - 1) // 3 + 1}"
        if freq == "m":
            return f"{year}-{month:02d}"
        return year
    return None


def parse(raw, freq="a"):
    """(header periods, [(row label, values)]) or (None, reason)."""
    table = re.search(r"<table[\s\S]*?</table>", raw, re.I)
    if not table:
        return None, "no <table> element in the page"
    header, rows = None, []
    for tr in re.findall(r"<tr[\s\S]*?</tr>", table.group(0), re.I):
        cs = cells(tr)
        if not cs:
            continue
        if header is None and len(cs) > 1:
            got = [to_period(c, freq) for c in cs[1:]]
            if all(got):
                header = got
                continue
        if header is None:
            continue
        rows.append((cs[0], [to_number(x) for x in cs[-len(header):]]))
    if header is None:
        return None, "a table is present but no row of it reads as a period header"
    return header, rows


SPLIT_DIRECTIONS = ["Imports", "Exports"]
SPLIT_PARTNERS = ["TOTAL", "Of Which: ECCU", "Of Which: Other CARICOM Countries"]


def spanned_cells(tr):
    """(text, colspan) for each cell of a row, blanks included."""
    found = []
    for attrs, body in re.findall(r"<t[hd]\b([^>]*)>([\s\S]*?)</t[hd]>", tr, re.I):
        span = re.search(r"colspan=[\"']?(\d+)", attrs, re.I)
        text = htmllib.unescape(re.sub(r"<[^>]+>", " ", body))
        found.append((re.sub(r"\s+", " ", text).strip(), int(span.group(1)) if span else 1))
    return found


def parse_split(raw):
    """(years, [(published label, values by year)]) or (None, reason)."""
    table = re.search(r"<table[\s\S]*?</table>", raw, re.I)
    if not table:
        return None, "no <table> element in the page"
    trs = re.findall(r"<tr[\s\S]*?</tr>", table.group(0), re.I)
    if len(trs) < 5:
        return None, "too few rows for a four-tier header"
    tiers = [spanned_cells(tr) for tr in trs[:4]]
    tops = [(t, s) for t, s in tiers[0] if re.fullmatch(r"(19|20)\d{2}", t)]
    if not tops or {s for _, s in tops} != {6}:
        return None, f"top header is not whole years of six columns: {tiers[0][:4]}"
    years = [t for t, _ in tops]
    if [t for t, _ in tiers[1]] != SPLIT_DIRECTIONS * len(years):
        return None, "second header tier is not imports then exports for every year"
    if [t for t, _ in tiers[2]] != ["TOTAL", "Of Which:"] * (2 * len(years)):
        return None, "third header tier is not total then of-which for every direction"
    if [t for t, _ in tiers[3]] != ["ECCU", "Other CARICOM Countries"] * (2 * len(years)):
        return None, "fourth header tier is not ECCU then other CARICOM for every direction"
    rows = []
    for tr in trs[4:]:
        row = [t for t, _ in spanned_cells(tr)]
        if len(row) == 0:
            continue
        if len(row) != 2 + 6 * len(years):
            return None, f"row {row[0]!r} has {len(row)} cells"
        for d, direction in enumerate(SPLIT_DIRECTIONS):
            for p, partner in enumerate(SPLIT_PARTNERS):
                offsets = [2 + 6 * y + 3 * d + p for y in range(len(years))]
                rows.append((f"{row[0]}: {direction}: {partner}", [to_number(row[i]) for i in offsets]))
    return years, rows


def split_identities(where, iso3, years, rows):
    """What must hold whichever parser read the table. Returns problems."""
    by_label = dict(rows)
    out = []
    if iso3 == "XCU":
        # The union has no trade with itself, which is the one outside fact
        # that tells the ECCU column from the other CARICOM column.
        for direction in SPLIT_DIRECTIONS:
            for year, value in zip(years, by_label[f"Total EBOPS Services: {direction}: Of Which: ECCU"]):
                if value not in (0.0, None):
                    out.append(("UNION WITH ITSELF", where, f"{direction} {year}", value, 0))
    bases = list(dict.fromkeys(label.split(": Imports:")[0].split(": Exports:")[0] for label, _ in rows))
    categories = [b for b in bases if re.match(r"\d+\. ", b)]
    for direction in SPLIT_DIRECTIONS:
        for partner in SPLIT_PARTNERS:
            head = by_label[f"Total EBOPS Services: {direction}: {partner}"]
            for i, year in enumerate(years):
                if not isinstance(head[i], float):
                    continue
                total = sum(v for v in (by_label[f"{b}: {direction}: {partner}"][i] for b in categories) if isinstance(v, float))
                if abs(total - head[i]) > 0.07:
                    out.append(("CATEGORY SUM", where, f"{direction} {partner} {year}", total, head[i]))
        for base in bases:
            whole = by_label[f"{base}: {direction}: TOTAL"]
            a = by_label[f"{base}: {direction}: Of Which: ECCU"]
            b = by_label[f"{base}: {direction}: Of Which: Other CARICOM Countries"]
            for i, year in enumerate(years):
                if all(isinstance(v, float) for v in (whole[i], a[i], b[i])) and a[i] + b[i] - whole[i] > 0.02:
                    out.append(("PARTS OVER TOTAL", where, f"{base} {direction} {year}", a[i] + b[i], whole[i]))
    return out


def against_balance_of_payments(where, iso3, freq, years, rows):
    """The Balance of Payments publishes the same totals one value per period,
    so a swapped or shifted column shows here even if every identity holds.
    Credit is exports, and credit less the balance is imports."""
    path = os.path.join(DATA, "balance-of-payments", freq, f"{iso3}.json")
    if not os.path.exists(path):
        return [("NO BOP TO COMPARE", where, "", "", "")]
    with open(path, encoding="utf8") as fh:
        bop = {s["label"]: {o["period"]: o["value"] for o in s["observations"]} for s in json.load(fh)["series"]}
    credit, balance = bop.get("Services Credit (Exports)"), bop.get("Balance on Services")
    if not credit or not balance:
        return [("BOP ROWS MISSING", where, "", "", "")]
    by_label = dict(rows)
    exports = by_label["Total EBOPS Services: Exports: TOTAL"]
    imports = by_label["Total EBOPS Services: Imports: TOTAL"]
    out = []
    for i, year in enumerate(years):
        if credit.get(year) is None or balance.get(year) is None:
            continue
        if not isinstance(exports[i], float) or not isinstance(imports[i], float):
            out.append(("HEADLINE NOT A NUMBER", where, year, exports[i], imports[i]))
            continue
        if abs(exports[i] - credit[year]) > 0.015:
            out.append(("BOP EXPORTS", where, year, exports[i], credit[year]))
        if abs(imports[i] - (credit[year] - balance[year])) > 0.015:
            out.append(("BOP IMPORTS", where, year, imports[i], credit[year] - balance[year]))
    return out


# Tables whose periods split into sub-columns, from the catalogue's split field.
# Kept as a literal so this file reads nothing from the code it audits.
SPLIT_TABLES = {"trade-in-services"}


def main() -> int:
    # --table limits the run to one table, so a release can gate on the table it
    # changed. Older captures of other tables disagree with later revisions.
    only = sys.argv[sys.argv.index("--table") + 1] if "--table" in sys.argv else None
    if not os.path.isdir(CAPTURE):
        print(f"No captures at {CAPTURE}. Run: node tools/eccb/capture.mjs --all")
        return 2
    files, compared, problems = 0, 0, []
    for root, _dirs, names in os.walk(CAPTURE):
        for name in names:
            if not name.endswith(".html"):
                continue
            rel = os.path.relpath(os.path.join(root, name), CAPTURE)
            table_id, freq, iso3 = rel.replace("\\", "/").split("/")
            iso3 = iso3[:-5]
            if only and table_id != only:
                continue
            published = os.path.join(DATA, table_id, freq, f"{iso3}.json")
            if not os.path.exists(published):
                problems.append(("NOT PUBLISHED", rel, "", "", ""))
                continue
            files += 1
            with open(os.path.join(root, name), encoding="utf8", errors="replace") as fh:
                raw = fh.read()
            is_split = table_id in SPLIT_TABLES
            header, rows = parse_split(raw) if is_split else parse(raw, freq)
            doc = json.load(open(published, encoding="utf8"))
            where = f"{table_id}/{freq}/{iso3}"
            if header is None:
                problems.append(("SOURCE UNREADABLE", where, str(rows), "", ""))
                continue
            if is_split:
                problems.extend(split_identities(where, iso3, header, rows))
                problems.extend(against_balance_of_payments(where, iso3, freq, header, rows))
            # Compare the OVERLAP of periods rather than demanding identical
            # windows. Tables in this corpus were collected with different date
            # ranges, so an exact-match rule reports a capture-configuration
            # difference as a data defect. The overlap still catches any wrong
            # value, which is the thing being checked.
            published_periods = doc.get("periods") or []
            shared = [p for p in header if p in published_periods]
            if not shared:
                problems.append(("NO OVERLAPPING PERIODS", where, str(header[:3]), str(published_periods[:3]), ""))
                continue
            served = doc.get("series", [])
            if len(rows) != len(served):
                problems.append(("ROW COUNT", where, len(rows), len(served), ""))
                continue
            for (label, values), s in zip(rows, served):
                if label != s["label"]:
                    problems.append(("LABEL", where, label, s["label"], ""))
                    continue
                mine_by_period = dict(zip(header, values))
                theirs_by_period = {o.get("period"): o.get("value") for o in s["observations"]}
                for period in shared:
                    mine, theirs = mine_by_period.get(period), theirs_by_period.get(period)
                    compared += 1
                    if isinstance(mine, tuple):
                        problems.append(("UNPARSED BY CHECKER", where, label, period, mine[1]))
                    elif mine != theirs:
                        problems.append(("VALUE", where, f"{label} @ {period}", mine, theirs))
    print(f"documents checked: {files}   cells compared: {compared}   disagreements: {len(problems)}")
    for p in problems[:40]:
        print("   ", " | ".join(str(x) for x in p if x != ""))
    if len(problems) > 40:
        print(f"    … and {len(problems) - 40} more")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
