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


def parse(raw: str):
    table = re.search(r"<table[\s\S]*?</table>", raw, re.I)
    if not table:
        return None, None
    header, rows = None, []
    for tr in re.findall(r"<tr[\s\S]*?</tr>", table.group(0), re.I):
        cs = cells(tr)
        if not cs:
            continue
        if header is None and len(cs) > 1 and all(re.fullmatch(r"(19|20)\d{2}(-Q[1-4]|-\d{2})?", c) for c in cs[1:]):
            header = cs[1:]
            continue
        if header is None:
            continue
        rows.append((cs[0], [to_number(x) for x in cs[-len(header):]]))
    return header, rows


def main() -> int:
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
            published = os.path.join(DATA, table_id, freq, f"{iso3}.json")
            if not os.path.exists(published):
                problems.append(("NOT PUBLISHED", rel, "", "", ""))
                continue
            files += 1
            with open(os.path.join(root, name), encoding="utf8", errors="replace") as fh:
                header, rows = parse(fh.read())
            doc = json.load(open(published, encoding="utf8"))
            where = f"{table_id}/{freq}/{iso3}"
            if header is None:
                problems.append(("NO TABLE IN SOURCE", where, "", "", ""))
                continue
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
