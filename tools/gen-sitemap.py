#!/usr/bin/env python3
"""Generate site/sitemap.xml with a <lastmod> derived from git history.

Why generated rather than hand-maintained: <lastmod> is only useful to Google
if it is consistently accurate, and a hand-typed date stops tracking real edits
the first time someone forgets. A lastmod that lies is worse than none.

Why git and not file mtime: mtime moves for reasons that are not edits. On
2026-08-31 site/docs.html had mtime 2026-08-31 while `git status` was clean and
its content last changed on 2026-08-29, so an mtime-based generator would have
published a false date on its very first run.

Run before committing a site change:  python tools/gen-sitemap.py
Then commit the regenerated sitemap alongside the edit, so the date does not
trail the content by one commit.

Check without writing:  python tools/gen-sitemap.py --check
Exits 1 and prints the differing lines when site/sitemap.xml is not what the
generator would write from the current git history. It never writes. Because
the dates come from commits, run it after committing: a site edit committed
without a regenerated sitemap is exactly what it exists to catch.
"""
import difflib
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BASE = "https://statcite.com"

# (url path, source file). Order is the published order.
ENTRIES = [
    ("/", "site/index.html"),
    ("/docs", "site/docs.html"),
    ("/guide", "site/guide.html"),
    ("/bench", "site/bench.html"),
    ("/sources", "site/sources.html"),
    ("/privacy", "site/privacy.html"),
    ("/terms", "site/terms.html"),
    ("/llms.txt", "site/llms.txt"),
    ("/llms-full.txt", "site/llms-full.txt"),
    ("/openapi.json", "site/openapi.json"),
]


def last_commit_date(path: str) -> str:
    """Author date of the last commit touching this file, as YYYY-MM-DD."""
    r = subprocess.run(
        ["git", "log", "-1", "--format=%cs", "--", path],
        cwd=ROOT, capture_output=True, text=True,
    )
    out = r.stdout.strip()
    if r.returncode != 0 or not out:
        raise SystemExit(f"no git history for {path}; refusing to invent a lastmod")
    return out


def build() -> str:
    """The sitemap XML the current git history implies, exactly as written."""
    lines = ['<?xml version="1.0" encoding="UTF-8"?>',
             '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for url, src in ENTRIES:
        f = ROOT / src
        if not f.exists():
            raise SystemExit(f"missing source file {src}")
        lines.append(f"  <url><loc>{BASE}{url}</loc><lastmod>{last_commit_date(src)}</lastmod></url>")
    lines.append("</urlset>")
    return "\n".join(lines) + "\n"


def check() -> int:
    """Compare without writing. 0 when site/sitemap.xml matches, 1 when not."""
    expected = build()
    out = ROOT / "site" / "sitemap.xml"
    # Normalise line endings: a CRLF checkout of an LF file is not drift.
    actual = out.read_text(encoding="utf8").replace("\r\n", "\n") if out.exists() else ""
    if actual == expected:
        print(f"{out.relative_to(ROOT)} is current ({len(ENTRIES)} entries)")
        return 0
    print(f"{out.relative_to(ROOT)} is STALE. Run: python tools/gen-sitemap.py", file=sys.stderr)
    for line in difflib.unified_diff(actual.splitlines(), expected.splitlines(),
                                     "site/sitemap.xml (committed)", "site/sitemap.xml (from git history)",
                                     lineterm=""):
        print(line, file=sys.stderr)
    return 1


def main() -> int:
    if "--check" in sys.argv[1:]:
        return check()

    dirty = subprocess.run(
        ["git", "status", "--porcelain", "--", "site/"],
        cwd=ROOT, capture_output=True, text=True,
    ).stdout.strip()

    out = ROOT / "site" / "sitemap.xml"
    out.write_text(build(), encoding="utf8", newline="\n")
    print(f"wrote {out.relative_to(ROOT)} with {len(ENTRIES)} entries")

    if dirty:
        print()
        print("NOTE: site/ has uncommitted changes, so the dates above are the")
        print("      LAST COMMITTED ones and will trail this edit by one commit.")
        print("      Re-run this after committing, or commit the sitemap with it:")
        for line in dirty.splitlines():
            print("       ", line)
    return 0


if __name__ == "__main__":
    sys.exit(main())
