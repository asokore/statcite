#!/usr/bin/env python3
"""Live audit of statcite.com — API behaviour, SEO surface, and doc consistency.

Re-checks the 41 defects from audit-defects.json against the DEPLOYED service,
plus a broader sweep of the website. Everything here is verified against the
live origin, never against the repository, because the repository is not what
users get.

    python tools/audit-live.py
    python tools/audit-live.py --only seo

Exit status is 1 if any check fails.
"""

import json
import re
import sys
import urllib.error
import urllib.parse
import urllib.request

BASE = "https://statcite.com"
UA = "statcite-self-audit/1.0 (+https://statcite.com)"

results = []


def get(path, headers=None, method="GET", timeout=45):
    url = path if path.startswith("http") else BASE + path
    req = urllib.request.Request(url, method=method)
    req.add_header("user-agent", UA)
    for k, v in (headers or {}).items():
        req.add_header(k, v)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, dict(r.headers), r.read().decode("utf8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers), e.read().decode("utf8", "replace")
    except Exception as e:  # network/DNS
        return 0, {}, f"ERROR {e}"


def get_no_redirect(path):
    """Status without following redirects, to test canonical/sitemap targets."""
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, *a, **k):
            return None

    op = urllib.request.build_opener(NoRedirect)
    req = urllib.request.Request(BASE + path)
    req.add_header("user-agent", UA)
    try:
        with op.open(req, timeout=45) as r:
            return r.status, dict(r.headers)
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers)
    except Exception as e:
        return 0, {"error": str(e)}


def check(area, name, ok, detail=""):
    results.append((area, name, bool(ok), detail))
    mark = "PASS" if ok else "FAIL"
    print(f"  [{mark}] {area}/{name}" + (f" — {detail}" if detail and not ok else ""))


def jget(path):
    st, _, body = get(path)
    try:
        return st, json.loads(body)
    except Exception:
        return st, None


# ---------------------------------------------------------------- API surface
def audit_api():
    print("\n== API behaviour ==")

    st, d = jget("/v1/indicator/gdp_current_usd?country=BRB&start_year=2023&end_year=2024&transform=yoy")
    unit = (d or {}).get("unit") or ""
    check("api", "transform rewrites unit", st == 200 and "%" in unit, f"status {st} unit={unit!r}")

    st, d = jget("/v1/indicator/gdp_growth?country=BRB&latest_only=1")
    n = len((d or {}).get("observations") or [])
    check("api", "latest_only=1 honoured", st == 200 and n == 1, f"status {st} obs={n}")

    st, d = jget("/v1/indicator/gdp_growth?country=BRB&latest_only=banana")
    check("api", "unparseable boolean is 400", st == 400, f"status {st}")

    st, d = jget("/v1/indicator/gdp_growth?country=BRB&strict_source=1")
    check("api", "strict_source=1 accepted", st in (200, 422), f"status {st}")

    st, d = jget("/v1/indicator/gdp_growth?country=XYZ")
    txt = json.dumps(d or {})
    fabricated = "is not a World Bank reporting economy" in txt or "some economies are not" in txt
    check("api", "made-up ISO3 asserts no coverage fact", not fabricated, txt[:100])

    st, d = jget("/v1/fx?from=USD&to=EUR&amount=1&date=2099-01-01")
    check("api", "future FX date is 4xx not 502", 400 <= st < 500, f"status {st}")

    st, hdr, _ = get("/v1/indicator/gdp_growth?country=BRB", method="HEAD")
    check("api", "HEAD supported on /v1", st == 200, f"status {st}")

    st, d = jget("/v1/series?id=worldbank/NY.GDP.MKTP.CD&country=BRB")
    check("api", "/v1/series carries unit", st == 200 and (d or {}).get("unit"), f"status {st} unit={(d or {}).get('unit')!r}")

    st, d = jget("/v1/status")
    srcs = (d or {}).get("sources") or []
    zero_ms = [s for s in srcs if s.get("ms") == 0 and s.get("ok")]
    check("api", "/v1/status not all ms:0", not (srcs and len(zero_ms) == len(srcs)), f"{len(zero_ms)}/{len(srcs)} zero-ms")

    st, d = jget("/v1/indicator/not_a_real_indicator?country=BRB")
    msg = json.dumps(d or {})
    check("api", "unknown indicator suggests no dead FRED keys", "fred" not in msg.lower(), msg[:90])

    # search -> fetch round trip: every suggested id must resolve
    st, d = jget("/v1/search?q=barbados+inflation")
    ids = [r.get("id") for r in (d or {}).get("results", []) if r.get("id")]
    bad = []
    for i in ids[:6]:
        s2, _ = jget("/v1/series?id=" + urllib.parse.quote(str(i), safe=""))
        if s2 != 200:
            s3, _ = jget("/v1/indicator/" + urllib.parse.quote(str(i), safe="") + "?country=BRB")
            if s3 != 200:
                bad.append(f"{i}:{s3}")
    # This is stricter than "the id exists somewhere". A query naming Barbados
    # that returns a euro-area-only series is a bad recommendation even though
    # the series is real: following it returns 422. euro_area_hicp ranked third
    # here until searchIndicators learned to drop fixed-geography series when
    # the query names a country they cannot serve.
    check("api", "suggestions for a named country are usable for it", not bad, "; ".join(bad)[:140])

    st, _, _ = get("/health")
    check("api", "/health responds", st == 200, f"status {st}")


# ------------------------------------------------------------------ SEO/meta
PAGES = ["/", "/docs", "/sources", "/bench", "/privacy", "/terms"]


def audit_seo():
    print("\n== SEO and metadata ==")

    st, _, sm = get("/sitemap.xml")
    urls = re.findall(r"<loc>([^<]+)</loc>", sm)
    check("seo", "sitemap parses", st == 200 and urls, f"status {st}, {len(urls)} urls")

    redirecting = []
    for u in urls:
        p = u.replace(BASE, "") or "/"
        code, _ = get_no_redirect(p)
        if code != 200:
            redirecting.append(f"{p}:{code}")
    check("seo", "every sitemap URL is 200 (no redirects)", not redirecting, "; ".join(redirecting)[:160])

    for p in PAGES:
        st, _, html = get(p)
        if st != 200:
            check("seo", f"{p} loads", False, f"status {st}")
            continue
        canon = re.search(r'<link[^>]+rel="canonical"[^>]+href="([^"]+)"', html)
        desc = re.search(r'<meta[^>]+name="description"[^>]+content="([^"]*)"', html)
        ogimg = re.search(r'<meta[^>]+property="og:image"[^>]+content="([^"]+)"', html)
        ogtitle = re.search(r'<meta[^>]+property="og:title"', html)
        title = re.search(r"<title>([^<]*)</title>", html)
        check("seo", f"{p} has canonical", bool(canon), "missing")
        if canon:
            cp = canon.group(1).replace(BASE, "") or "/"
            code, _ = get_no_redirect(cp)
            check("seo", f"{p} canonical resolves 200", code == 200, f"{cp} -> {code}")
        check("seo", f"{p} has meta description", bool(desc and desc.group(1).strip()), "missing")
        check("seo", f"{p} has og:image", bool(ogimg), "missing")
        check("seo", f"{p} has og:title", bool(ogtitle), "missing")
        check("seo", f"{p} has title", bool(title and title.group(1).strip()), "missing")

    for asset in ["/favicon.ico", "/apple-touch-icon.png", "/og.png", "/favicon.svg", "/robots.txt", "/llms.txt", "/openapi.json"]:
        st, hdr, _ = get(asset)
        check("seo", f"{asset} serves", st == 200, f"status {st}")

    st, _, robots = get("/robots.txt")
    check("seo", "robots references sitemap", "sitemap" in robots.lower(), "")


# ------------------------------------------------------- internal link health
def audit_links():
    print("\n== internal links ==")
    seen = {}
    for p in PAGES:
        st, _, html = get(p)
        if st != 200:
            continue
        for href in re.findall(r'href="(/[^"#?]*)"', html):
            seen.setdefault(href, set()).add(p)
    broken = []
    for href, pages in sorted(seen.items()):
        code, _ = get_no_redirect(href)
        if code not in (200, 301, 302, 307, 308):
            broken.append(f"{href}({code}) on {','.join(sorted(pages))}")
    check("links", f"{len(seen)} internal links resolve", not broken, "; ".join(broken)[:200])


# ------------------------------------------------------ doc/count consistency
def audit_consistency():
    print("\n== published claims vs live service ==")

    st, d = jget("/v1/indicators")
    inds = (d or {}).get("indicators") or []
    total = len(inds)
    active = len([i for i in inds if not i.get("disabled")])
    check("claims", "/v1/indicators responds", total > 0, f"{total} total")

    st, _, home = get("/")
    st2, _, docs = get("/docs")
    st3, _, llms = get("/llms.txt")

    # any "N indicators" claim on the site must match the live registry
    bad = []
    for name, body in (("index", home), ("docs", docs), ("llms.txt", llms)):
        for m in re.finditer(r"(\d+)\s+(?:curated\s+)?indicators", body):
            n = int(m.group(1))
            if n not in (total, active):
                bad.append(f"{name}:{n}")
    check("claims", f"indicator counts match live ({total} total / {active} active)", not bad, "; ".join(bad))

    st, d = jget("/v1/sources")
    srcs = (d or {}).get("sources") or []
    bis = next((s for s in srcs if s.get("id") == "bis"), {})
    cov = str(bis.get("coverage", "")) + str(bis.get("license_note", ""))
    check("claims", "BIS coverage not stale '~38'", "38 central banks" not in cov, cov[:80])

    # version consistency: deployed vs changelog vs registry
    st, d = jget("/v1")
    live_ver = (d or {}).get("version") or (d or {}).get("server_version")
    if not live_ver:
        st, d2 = jget("/health")
        live_ver = (d2 or {}).get("version")
    vers = re.findall(r"\b(\d+\.\d+\.\d+)\b", docs)
    newest_doc = max(vers, key=lambda v: tuple(int(x) for x in v.split("."))) if vers else None
    check(
        "claims",
        "docs changelog covers deployed version",
        bool(live_ver) and bool(newest_doc) and tuple(int(x) for x in newest_doc.split(".")) >= tuple(int(x) for x in str(live_ver).split(".")),
        f"live={live_ver} newest-in-docs={newest_doc}",
    )

    st, d = jget("/v1")
    eps = json.dumps(d or {})
    check("claims", "/v1 index lists endpoints", "/v1/indicator" in eps, "")

    # every example URL printed in the /v1 index must actually work
    ex = re.findall(r"/v1/[A-Za-z0-9/_{}?=&+.,\-]+", eps)
    bad_ex = []
    for e in ex[:14]:
        if "{" in e:
            continue
        # The index documents some endpoints as POST-only (verify_claims says
        # so inline). GET-probing those reports a 405 that is correct behaviour,
        # which is a fault in the checker rather than the service.
        if re.search(re.escape(e) + r"[^\"]*\(POST", eps):
            continue
        s2, _, _ = get(e)
        if s2 >= 400:
            bad_ex.append(f"{e}:{s2}")
    check("claims", "/v1 index examples work", not bad_ex, "; ".join(bad_ex)[:180])


# ----------------------------------------------------------------- MCP surface
def audit_mcp():
    print("\n== MCP transport ==")
    body = json.dumps({"jsonrpc": "2.0", "id": 1, "method": "tools/list", "params": {}}).encode()
    req = urllib.request.Request(BASE + "/mcp", data=body, method="POST")
    req.add_header("content-type", "application/json")
    req.add_header("accept", "application/json, text/event-stream")
    req.add_header("user-agent", UA)
    try:
        with urllib.request.urlopen(req, timeout=45) as r:
            txt = r.read().decode("utf8", "replace")
            st = r.status
    except urllib.error.HTTPError as e:
        st, txt = e.code, e.read().decode("utf8", "replace")
    except Exception as e:
        st, txt = 0, str(e)
    m = re.search(r'"tools"\s*:\s*\[', txt)
    ntools = txt.count('"name":') if m else 0
    check("mcp", "legacy tools/list works", st == 200 and ntools > 0, f"status {st} tools~{ntools}")

    # modern era requires Mcp-Method
    req2 = urllib.request.Request(BASE + "/mcp", data=body, method="POST")
    for k, v in {
        "content-type": "application/json",
        "accept": "application/json, text/event-stream",
        "MCP-Protocol-Version": "2026-07-28",
        "Mcp-Method": "tools/list",
        "user-agent": UA,
    }.items():
        req2.add_header(k, v)
    try:
        with urllib.request.urlopen(req2, timeout=45) as r:
            txt2 = r.read().decode("utf8", "replace")
            st2 = r.status
    except urllib.error.HTTPError as e:
        st2, txt2 = e.code, e.read().decode("utf8", "replace")
    except Exception as e:
        st2, txt2 = 0, str(e)
    check("mcp", "2026-07-28 with Mcp-Method works", st2 == 200 and '"tools"' in txt2, f"status {st2}")

    # and rejects a missing Mcp-Method on the modern era
    req3 = urllib.request.Request(BASE + "/mcp", data=body, method="POST")
    for k, v in {
        "content-type": "application/json",
        "accept": "application/json, text/event-stream",
        "MCP-Protocol-Version": "2026-07-28",
        "user-agent": UA,
    }.items():
        req3.add_header(k, v)
    try:
        with urllib.request.urlopen(req3, timeout=45) as r:
            txt3 = r.read().decode("utf8", "replace")
    except urllib.error.HTTPError as e:
        txt3 = e.read().decode("utf8", "replace")
    except Exception as e:
        txt3 = str(e)
    check("mcp", "2026-07-28 without Mcp-Method is refused", "-32020" in txt3 or "Mcp-Method" in txt3, txt3[:90])


# ------------------------------------------------- accessibility (structural)
def audit_a11y():
    """Static accessibility checks.

    These are the ones answerable from the served HTML. Two things this CANNOT
    check and that need a real browser at 375px: horizontal overflow, and
    colour contrast on a non-root element (the preview pane pins root colours,
    so probing body gives a fake pass). Both were checked by hand on
    2026-08-16: contrast measured 7.2:1 on body prose, which passes AAA, and
    /docs overflowed by 90px until inline code was allowed to wrap.
    """
    print("\n== accessibility (structural) ==")
    for p in PAGES + ["/404.html"]:
        st, _, html = get(p)
        if st != 200:
            check("a11y", f"{p} loads", False, f"status {st}")
            continue
        check("a11y", f"{p} declares a viewport", bool(re.search(r'<meta[^>]+name="viewport"', html, re.I)), "missing")
        check("a11y", f"{p} declares a language", bool(re.search(r'<html[^>]+lang="', html, re.I)), "missing")
        h1s = len(re.findall(r"<h1[\s>]", html, re.I))
        check("a11y", f"{p} has exactly one h1", h1s == 1, f"found {h1s}")
        heads = [int(m) for m in re.findall(r"<h([1-6])[\s>]", html, re.I)]
        skip = next((f"h{heads[i-1]}->h{heads[i]}" for i in range(1, len(heads)) if heads[i] - heads[i - 1] > 1), None)
        check("a11y", f"{p} skips no heading level", skip is None, skip or "")
        imgs = re.findall(r"<img[^>]*>", html, re.I)
        no_alt = [i for i in imgs if "alt=" not in i.lower()]
        check("a11y", f"{p} images all have alt", not no_alt, f"{len(no_alt)} of {len(imgs)}")
        links = re.findall(r"<a\b[^>]*>(.*?)</a>", html, re.I | re.S)
        empty = [l for l in links if not re.sub(r"<[^>]+>", "", l).strip()]
        check("a11y", f"{p} has no empty links", not empty, f"{len(empty)} empty")

    # Inline code that cannot wrap is what pushed /docs 90px wide on mobile.
    # Any page that STYLES inline code must also let it break.
    for p in PAGES:
        st, _, html = get(p)
        if st != 200 or "code{font-family" not in html:
            continue
        wraps = "overflow-wrap" in html or "word-break" in html
        check("a11y", f"{p} lets inline code wrap", wraps, "long tokens will widen the page on mobile")


# --------------------------------------------------- AI discovery surfaces
def audit_discovery():
    """The surfaces AI agents and dataset crawlers use to find this service.

    Every URL asserted here is fetched live. A structured-data example that
    404s is worse than none: the search catalogue and openapi both had exactly
    that defect, and a crawler that follows a dead example concludes the
    service is broken.
    """
    print("\n== AI discovery ==")

    st, _, home = get("/")
    blocks = re.findall(r'<script type="application/ld\+json">(.*?)</script>', home, re.S)
    check("disc", "homepage has one JSON-LD block", len(blocks) == 1, f"found {len(blocks)}")
    graph = []
    if blocks:
        try:
            d = json.loads(blocks[0])
            graph = d.get("@graph", [])
            check("disc", "JSON-LD parses", True)
        except Exception as e:
            check("disc", "JSON-LD parses", False, str(e)[:80])
    types = {g.get("@type") for g in graph}
    for want in ("SoftwareApplication", "WebAPI", "DataCatalog"):
        check("disc", f"JSON-LD declares {want}", want in types, f"types={sorted(types)}")
    cat = next((g for g in graph if g.get("@type") == "DataCatalog"), {})
    dsets = cat.get("dataset", [])
    check("disc", "DataCatalog lists 6 publisher datasets", len(dsets) == 6, f"found {len(dsets)}")
    bad = []
    for ds in dsets:
        creator = (ds.get("creator") or {}).get("name", "")
        if creator in ("", "StatCite"):
            bad.append(f"{ds.get('name','?')[:40]} creator={creator!r}")
        url = ((ds.get("distribution") or {}).get("contentUrl") or "")
        st2, _, _ = get(url.replace(BASE, "")) if url.startswith(BASE) else (0, {}, "")
        if st2 != 200:
            bad.append(f"{url[:60]}:{st2}")
    check("disc", "datasets are publisher-attributed and every contentUrl resolves", not bad, "; ".join(bad)[:180])
    # The publication boundary applies to markup too: no person, no employer.
    lower = (blocks[0] if blocks else "").lower()
    check("disc", "JSON-LD names no person or ministry", "beckles" not in lower and "ministry" not in lower, "")

    st, _, sec = get("/.well-known/security.txt")
    check("disc", "security.txt serves with a contact", st == 200 and "Contact:" in sec, f"status {st}")

    # A bare GET on /mcp must stay 405 (no SSE stream to offer) but carry a
    # discovery body: agents sniff the URL before speaking JSON-RPC, and until
    # 2026-08-29 they got zero bytes.
    st, hdr, body = get("/mcp")
    ok_shape = False
    try:
        j = json.loads(body)
        ok_shape = j.get("mcp", {}).get("name") == "statcite" and "docs" in j
    except Exception:
        pass
    check("disc", "GET /mcp is 405 with a discovery body", st == 405 and ok_shape, f"status {st} body={body[:60]!r}")


def main():
    only = None
    if "--only" in sys.argv:
        only = sys.argv[sys.argv.index("--only") + 1]
    for name, fn in [("api", audit_api), ("seo", audit_seo), ("links", audit_links), ("claims", audit_consistency), ("mcp", audit_mcp), ("a11y", audit_a11y), ("disc", audit_discovery)]:
        if only and only != name:
            continue
        try:
            fn()
        except Exception as e:
            check(name, "audit section ran", False, f"crashed: {e}")

    failed = [r for r in results if not r[2]]
    print(f"\n{'=' * 60}\nchecks: {len(results)}   passed: {len(results) - len(failed)}   FAILED: {len(failed)}")
    for a, n, _, d in failed:
        print(f"   FAIL {a}/{n}  {d}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
