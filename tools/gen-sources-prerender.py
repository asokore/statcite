#!/usr/bin/env python3
"""Server-render the licence ledger into site/sources.html.

Why: /sources is the only page carrying the licence ledger, it is the page the
homepage JSON-LD names as the DataCatalog's canonical url, and llms-full.txt
directs machine readers to it as "Human-readable". Its served HTML contained
zero ledger content - no source name, no verdict, no licence text - because the
whole ledger was written by a fetch("/v1/sources") into #ledger.innerHTML.
GPTBot, ClaudeBot and PerplexityBot do not execute JavaScript, so the page
carrying StatCite's entire licensing argument was blank to exactly the audience
this service is built for. robots.txt explicitly invites those crawlers.

The prerendered cards are DEFAULT content: the existing script still overwrites
#ledger on load, so the page keeps the "cannot drift from what the API reports"
property it claims in its own visible copy. This generator plus the audit check
that /sources contains every name /v1/sources returns is what keeps the static
copy honest between runs.

Run after any change to the licence ledger:  python tools/gen-sources-prerender.py
"""
import json
import re
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PAGE = ROOT / "site" / "sources.html"
API = "https://statcite.com/v1/sources"

START = "<!-- ledger:prerender:start -->"
END = "<!-- ledger:prerender:end -->"


def esc(x) -> str:
    """Match the escaping the page's own JS applies, character for character."""
    s = "" if x is None else str(x)
    for a, b in [("&", "&amp;"), ("<", "&lt;"), (">", "&gt;"),
                 ('"', "&quot;"), ("'", "&#39;")]:
        s = s.replace(a, b)
    return s


def main() -> int:
    req = urllib.request.Request(API)
    req.add_header("user-agent", "statcite-prerender/1.0")
    with urllib.request.urlopen(req, timeout=30) as r:
        sources = json.loads(r.read().decode("utf8"))["sources"]

    order = {"served": 0, "flow_through": 1, "refused": 2}
    sources.sort(key=lambda s: order.get(s.get("license_verdict"), 3))

    cards = []
    for s in sources:
        attr = ""
        if s.get("license_verdict") != "refused":
            attr = f'      <div class="attr">Attribution: {esc(s.get("attribution_required"))}</div>\n'
        cards.append(
            '      <div class="card">\n'
            f'      <h3>{esc(s.get("name"))}<span class="pill {esc(s.get("license_verdict"))}">{esc(s.get("license_verdict"))}</span></h3>\n'
            f'      <div class="meta">id: {esc(s.get("id"))} · licence verified {esc(s.get("license_verified_on"))} · <a href="{esc(s.get("terms_url"))}">terms</a></div>\n'
            f'      <p><strong>Licence:</strong> {esc(s.get("license"))}</p>\n'
            f'      <p>{esc(s.get("license_note"))}</p>\n'
            f'{attr}'
            f'      <p>{esc(s.get("coverage"))}</p>\n'
            "      </div>"
        )

    block = START + "\n" + "\n".join(cards) + "\n      " + END

    html = PAGE.read_text(encoding="utf8")
    if START in html:
        html = re.sub(re.escape(START) + r".*?" + re.escape(END), lambda _: block, html, flags=re.S)
    else:
        anchor = '      <p class="lead" id="ledger-loading">Loading the ledger from /v1/sources…</p>'
        if anchor not in html:
            print("anchor not found; has the page changed?", file=sys.stderr)
            return 1
        # Keep the loading line AFTER the prerender: the script replaces the
        # whole container, so it never shows to a JS client, and a non-JS
        # client reads real cards instead of "Loading…".
        html = html.replace(anchor, block, 1)

    PAGE.write_text(html, encoding="utf8", newline="\n")
    print(f"prerendered {len(cards)} ledger cards into {PAGE.relative_to(ROOT)}")
    for s in sources:
        print(f"  {s.get('license_verdict'):13s} {s.get('name')}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
