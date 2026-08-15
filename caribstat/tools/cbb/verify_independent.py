#!/usr/bin/env python3
"""Independent audit of published CBB JSON against the source workbooks.

WHY A SECOND IMPLEMENTATION. Every value-level defect this project has produced
came from the CBB spreadsheet path, and each was invisible to the pipeline
because the pipeline is what got it wrong:

  * a cell regex requiring </c> let an empty cell swallow its neighbour's value
  * the period axis was read off a column that was not an axis at all
  * a two-row header left eleven series unnamed
  * a column of Excel date serials was served as a statistic

A parser cannot audit itself. This file reads the same workbooks with Python's
zipfile and ElementTree, sharing no code with tools/xlsx.mjs. ElementTree is a
real XML parser, so the self-closing-cell class of bug cannot occur here at all.

WHAT IT CHECKS, and why it is not just the parser rewritten. Re-deriving the
tables would mean re-implementing the same header and axis heuristics, and two
implementations of one guess agreeing proves very little. Instead the published
document is treated as a CLAIM about the sheet, and the claim is audited:

  1. Some column of the sheet must actually carry the published periods, in the
     published order. A wrong axis fails here, because no real column will
     match.
  2. Every published series must equal, cell for cell, some real column of the
     sheet read at those same period rows. Invented or arithmetic-derived
     numbers fail here.
  3. That matching column's own header must contain the published label. A
     value shifted into a neighbouring column still matches a real column at
     step 2, so this is the step that catches it.

    node tools/cbb/capture.mjs
    python tools/cbb/verify_independent.py

Exit status is 1 on any disagreement, so it can gate a release.
"""

import json
import os
import re
import sys
import zipfile
import xml.etree.ElementTree as ET

NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
CAPTURE = os.path.join("..", ".capture", "cbb")
DATA = os.path.join("data", "cbb")


def col_index(ref):
    """'BC12' -> 54. Column letters are base-26 with no zero."""
    letters = re.match(r"[A-Z]+", ref).group(0)
    n = 0
    for ch in letters:
        n = n * 26 + (ord(ch) - 64)
    return n - 1


# Builtin number formats that show a month and a year but no day. 17 is
# "mmm-yy". The rest of the builtin date formats all carry a day component.
BUILTIN_MONTH_YEAR = {17}


def is_month_year(code):
    """Does this format code display month and year with NO day?

    Written from the OOXML format-code grammar rather than from the pipeline's
    implementation, which is the point of a second opinion. Quoted literals and
    escaped characters are stripped first, so a format like `mmmm "d" yyyy`
    is not mistaken for carrying a day. A code containing h or s is a time
    format, where `m` means minutes.
    """
    if not code:
        return False
    import re as _re

    t = str(code).split(";")[0]
    t = _re.sub(r"\[[^\]]*\]", "", t)
    t = _re.sub(r'"[^"]*"', "", t)
    t = _re.sub(r"\\.", "", t)
    t = t.lower()
    if _re.search(r"[hs]", t):
        return False
    return ("y" in t) and ("m" in t) and ("d" not in t)


def read_styles(z):
    """Style index -> True when that style displays month and year only.

    styles.xml holds cellStyleXfs BEFORE cellXfs, both made of identical <xf>
    elements. Only cellXfs is what a cell's s= attribute indexes.
    """
    if "xl/styles.xml" not in z.namelist():
        return []
    root = ET.fromstring(z.read("xl/styles.xml"))
    custom = {}
    for nf in root.iter(NS + "numFmt"):
        custom[int(nf.get("numFmtId"))] = nf.get("formatCode") or ""
    out = []
    cell_xfs = root.find(NS + "cellXfs")
    if cell_xfs is None:
        return out
    for xf in cell_xfs.findall(NS + "xf"):
        fid = int(xf.get("numFmtId") or 0)
        out.append(fid in BUILTIN_MONTH_YEAR or is_month_year(custom.get(fid)))
    return out


def read_workbook(path):
    """{sheet name: (values grid, month-only grid)}.

    The second grid matters more than it looks. A CBB date cell can hold
    2022-10-02 while displaying as "October-22", because the bank's own serials
    drift a day or two per month. The DISPLAY is what the publication means, so
    the day must be dropped, and only the number format says so. Ignoring
    formats made this audit report three correctly-published documents as
    having a wrong axis.
    """
    z = zipfile.ZipFile(path)
    month_only_style = read_styles(z)
    shared = []
    if "xl/sharedStrings.xml" in z.namelist():
        for si in ET.fromstring(z.read("xl/sharedStrings.xml")):
            shared.append("".join(t.text or "" for t in si.iter(NS + "t")))

    rels = {}
    for rel in ET.fromstring(z.read("xl/_rels/workbook.xml.rels")):
        rels[rel.get("Id")] = rel.get("Target").lstrip("/").replace("xl/", "", 1)

    sheets = {}
    wb = ET.fromstring(z.read("xl/workbook.xml"))
    for sh in wb.iter(NS + "sheet"):
        rid = sh.get("{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id")
        target = rels.get(rid)
        if not target:
            continue
        name = "xl/" + target if not target.startswith("xl/") else target
        if name not in z.namelist():
            continue
        grid, flags = [], []
        root = ET.fromstring(z.read(name))
        for row in root.iter(NS + "row"):
            idx = int(row.get("r")) - 1
            while len(grid) <= idx:
                grid.append([])
                flags.append([])
            cells, fl = grid[idx], flags[idx]
            for c in row.iter(NS + "c"):
                ci = col_index(c.get("r")) if c.get("r") else len(cells)
                while len(cells) <= ci:
                    cells.append(None)
                    fl.append(False)
                si = int(c.get("s") or 0)
                fl[ci] = si < len(month_only_style) and month_only_style[si]
                v = c.find(NS + "v")
                t = c.get("t")
                if t == "inlineStr":
                    node = c.find(NS + "is")
                    cells[ci] = "".join(x.text or "" for x in node.iter(NS + "t")) if node is not None else None
                elif v is None or v.text is None:
                    cells[ci] = None
                elif t == "s":
                    cells[ci] = shared[int(v.text)]
                elif t in ("str", "e"):
                    cells[ci] = v.text
                else:
                    try:
                        cells[ci] = float(v.text)
                    except ValueError:
                        cells[ci] = v.text
        sheets[sh.get("name")] = (grid, flags)
    return sheets


MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]


def serial_to_ym(n):
    """Excel serial -> (year, month, day). 1900 leap-year bug included, as Excel has it."""
    from datetime import date, timedelta

    if n < 1 or n > 60000:
        return None
    base = date(1899, 12, 30)
    d = base + timedelta(days=int(n))
    return d.year, d.month, d.day


def as_period(cell, month_only=False):
    """Normalise a label cell to the period string the pipeline publishes."""
    if cell is None:
        return None
    if isinstance(cell, float):
        if cell.is_integer() and 1900 <= cell <= 2100:
            return str(int(cell))
        got = serial_to_ym(cell)
        if not got:
            return None
        y, m, d = got
        import calendar

        last = calendar.monthrange(y, m)[1]
        if month_only:
            return f"{y}-{m:02d}"
        # February written as the 28th counts as month-end even in a leap year:
        # the investments sheet is a month-end series and writes 2024-02-28.
        if d == 1 or d == last or (m == 2 and d == 28):
            return f"{y}-{m:02d}"
        return f"{y}-{m:02d}-{d:02d}"
    s = str(cell).strip()
    s = re.sub(r"\s*\(([RP])\)$", "", s, flags=re.I)
    s = re.sub(r"(?<=\d)[RP]$", "", s).strip()
    if re.fullmatch(r"\d{4}", s):
        return s
    q = re.fullmatch(r"(?:(\d)Q\s*(\d{4})|Q(\d)\s*(\d{4}))", s, re.I)
    if q:
        return f"{q.group(2) or q.group(4)}-Q{q.group(1) or q.group(3)}"
    if re.fullmatch(r"\d{4}-Q[1-4]", s, re.I):
        return s.upper()
    if re.fullmatch(r"\d{4}-\d{2}(-\d{2})?", s):
        return s
    m = re.fullmatch(r"([A-Za-z]{3,9})\s+(\d{4})", s)
    if m and m.group(1)[:3].lower() in MONTHS:
        return f"{m.group(2)}-{MONTHS.index(m.group(1)[:3].lower()) + 1:02d}"
    m = re.fullmatch(r"(\d{1,2})[-\s]([A-Za-z]{3,9})[-\s](\d{4})", s)
    if m and m.group(2)[:3].lower() in MONTHS:
        import calendar

        y, mo, d = int(m.group(3)), MONTHS.index(m.group(2)[:3].lower()) + 1, int(m.group(1))
        last = calendar.monthrange(y, mo)[1]
        if d < 1 or d > last:
            return None
        return f"{y}-{mo:02d}" if d in (1, last) else f"{y}-{mo:02d}-{d:02d}"
    return None


def _match_in_order(labels, periods):
    """Indices of `labels` that spell out `periods` in order, or None.

    A SUBSEQUENCE, not an exact list. The pipeline drops rows whose value cells
    are all empty, so a column can legitimately parse more period labels than
    the document publishes: the inflation sheet parses 599 and publishes 595,
    the four missing ones being all-null spacer rows. Demanding an exact match
    reported that correct behaviour as a wrong axis on the first run.
    """
    out, i = [], 0
    for idx, lab in labels:
        if i < len(periods) and lab == periods[i]:
            out.append(idx)
            i += 1
    return out if i == len(periods) else None


def find_axis(grid, periods, flags=None):
    """Locate the period axis, in either orientation.

    Returns (kind, index, positions):
      ("column", c, [row per period])  periods run down column c
      ("row",    r, [col per period])  periods run across row r

    Both orientations are needed: CBB puts periods down a column in most
    workbooks and ACROSS ROW 2 in the balance-of-payments one, which is why the
    first version of this audit reported all fourteen BOP sheets as having a
    wrong axis when they are read correctly.
    """
    if not periods:
        return None
    def flag(r, c):
        if not flags or r >= len(flags):
            return False
        fr = flags[r]
        return c < len(fr) and bool(fr[c])

    width = max((len(r) for r in grid), default=0)
    for c in range(min(width, 14)):
        labels = []
        for r, row in enumerate(grid):
            p = as_period(row[c], flag(r, c)) if c < len(row) else None
            if p is not None:
                labels.append((r, p))
        got = _match_in_order(labels, periods)
        if got:
            return ("column", c, got)
    for r, row in enumerate(grid[:20]):
        labels = []
        for c, cell in enumerate(row):
            p = as_period(cell, flag(r, c))
            if p is not None:
                labels.append((c, p))
        got = _match_in_order(labels, periods)
        if got:
            return ("row", r, got)
    return None


def _cell(grid, r, c):
    row = grid[r] if 0 <= r < len(grid) else []
    return row[c] if 0 <= c < len(row) else None


def _label_text(grid, kind, line, positions):
    """Text sitting where this candidate series is named.

    For a column-oriented sheet that is the cells above the first data row in
    the same column, which covers CBB's two-row headers. For a transposed one
    it is the cells to the left of the first value in the same row.
    """
    out = []
    if kind == "column":
        for r in range(max(0, positions[0] - 8), positions[0]):
            v = _cell(grid, r, line)
            if isinstance(v, str) and v.strip():
                out.append(v.strip())
    else:
        for c in range(0, min(positions[0], 6)):
            v = _cell(grid, line, c)
            if isinstance(v, str) and v.strip():
                out.append(v.strip())
    return out


def audit(doc, grid, flags=None):
    problems = []
    periods = doc.get("periods") or []
    found = find_axis(grid, periods, flags)
    if not found:
        problems.append(
            f"no row or column of the sheet carries the published periods "
            f"({len(periods)}: {periods[:2]} .. {periods[-1] if periods else '-'}) — the axis may be wrong"
        )
        return problems, 0
    kind, axis_line, positions = found

    # Every candidate series in the sheet, as the vector of values sitting at
    # the period positions. A published series must equal one of these exactly.
    candidates = {}
    if kind == "column":
        width = max((len(r) for r in grid), default=0)
        for c in range(width):
            if c == axis_line:
                continue
            candidates[c] = [
                _cell(grid, r, c) if isinstance(_cell(grid, r, c), float) else None for r in positions
            ]
    else:
        for r in range(len(grid)):
            if r == axis_line:
                continue
            candidates[r] = [
                _cell(grid, r, c) if isinstance(_cell(grid, r, c), float) else None for c in positions
            ]

    compared = 0
    for s_ in doc.get("series", []):
        published = [o.get("value") for o in s_["observations"]]
        compared += len(published)
        matches = [k for k, vals in candidates.items() if vals == published]
        if not matches:
            problems.append(
                f"series {s_['label']!r}: its values match no row or column of the sheet at the period positions"
            )
            continue
        wanted = s_["label"].split(": ")[-1].strip().lower()
        if not wanted:
            continue
        ok = False
        for k in matches:
            texts = " | ".join(_label_text(grid, kind, k, positions)).lower()
            if wanted in texts:
                ok = True
                break
        if not ok:
            problems.append(
                f"series {s_['label']!r}: values match {len(matches)} line(s) of the sheet but none is "
                f"headed with that label — the values may be assigned to the wrong series"
            )
    return problems, compared


def main():
    if not os.path.isdir(CAPTURE):
        print(f"No captures at {CAPTURE}. Run: node tools/cbb/capture.mjs")
        return 2
    books = {}
    for name in os.listdir(CAPTURE):
        books[name.split("__", 1)[-1]] = os.path.join(CAPTURE, name)

    checked = cells = 0
    all_problems = []
    for category in sorted(os.listdir(DATA)):
        cdir = os.path.join(DATA, category)
        if not os.path.isdir(cdir):
            continue
        for name in sorted(os.listdir(cdir)):
            if not name.endswith(".json"):
                continue
            doc = json.load(open(os.path.join(cdir, name), encoding="utf8"))
            file = (doc.get("attachment_url") or "").split("/")[-1]
            where = f"{category}/{name[:-5]}"
            if file not in books:
                all_problems.append((where, "source workbook not captured"))
                continue
            try:
                pair = read_workbook(books[file]).get(doc.get("sheet"))
            except Exception as e:
                all_problems.append((where, f"workbook unreadable: {e}"))
                continue
            if pair is None:
                all_problems.append((where, f"sheet {doc.get('sheet')!r} not in the workbook"))
                continue
            grid, flags = pair
            checked += 1
            problems, n = audit(doc, grid, flags)
            cells += n
            for p in problems:
                all_problems.append((where, p))

    print(f"documents audited: {checked}   values checked: {cells}   disagreements: {len(all_problems)}")
    for where, p in all_problems[:30]:
        print(f"    {where}: {p}")
    if len(all_problems) > 30:
        print(f"    ... and {len(all_problems) - 30} more")
    return 1 if all_problems else 0


if __name__ == "__main__":
    sys.exit(main())
