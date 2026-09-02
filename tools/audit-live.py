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
PAGES = ["/", "/docs", "/guide", "/sources", "/bench", "/privacy", "/terms"]


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
    # `active`, not `disabled`: /v1/indicators emits active:boolean and has
    # never emitted a `disabled` key, so the old expression collapsed to total.
    active = len([i for i in inds if i.get("active")])
    check("claims", "/v1/indicators responds", total > 0, f"{total} total")

    st, _, home = get("/")
    st2, _, docs = get("/docs")
    st3, _, llms = get("/llms.txt")

    # any "N indicators" claim on the site must match the live registry
    bad = []
    for name, body in (("index", home), ("docs", docs), ("llms.txt", llms)):
        # Broadened to the QUALIFIED forms the site actually ships:
        # "42 active curated indicators", "48 registry keys", "42 are active".
        # The old pattern matched none of them, so a wrong number on the page
        # could never turn this red.
        pats = [
            r"(\d+)\s+(?:active\s+)?(?:curated\s+)?indicators",
            r"(\d+)\s+registry\s+keys",
            r"(\d+)\s+(?:of\s+which\s+)?are\s+active",
            r"(\d+)\s+active\b(?!\s+curated)",
        ]
        for pat in pats:
            for m in re.finditer(pat, body):
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

    # ---- /guide prints real numbers, or it refutes itself.
    #
    # The page argues that a figure in a draft is a liability until you know
    # where it came from. Every value it shows is a captured live response, so
    # a drift between the page and the service turns the page into an example
    # of the thing it warns about. Official values also legitimately CHANGE on
    # revision, which is exactly why this is a standing check and not a
    # one-time verification at authoring time.
    st, _, guide = get("/guide")
    if st != 200:
        check("claims", "/guide loads", False, f"status {st}")
    else:
        drift = []

        def guide_figure(path, expect, label):
            """Assert the page PRINTS what the endpoint currently returns.

            `expect` is (api_key, api_value, exact_page_fragment). The fragment
            must be the rendered line, not the bare number: an earlier version
            tested `str(value) in guide`, and "120" is also inside
            `og:image:width content="1200"`, so rewriting the figure in the
            worked example left the check green. A substring search over a
            whole page is not a test of the value it names.
            """
            _, d = jget(path)
            d = d or {}
            for key, want, fragment in expect:
                got = d.get(key)
                if str(got) != str(want):
                    drift.append(f"{label}.{key}: page says {want}, live says {got}")
                elif fragment not in guide:
                    drift.append(f"{label}.{key}: page no longer prints {fragment!r}")

        guide_figure("/v1/verify?indicator=inflation_cpi&country=USA&period=2023&value=8.0",
                     [("official_value", "4.11633838374488", '"official_value": 4.11633838374488'),
                      ("verdict", "mismatch", '"verdict": "mismatch"')], "wrong-year")
        guide_figure("/v1/verify?indicator=govt_debt_gdp&country=USA&period=2023&value=98",
                     [("official_value", "120", '"official_value": 120,'),
                      ("verdict", "mismatch", '"verdict": "mismatch"')], "stale-recall")
        guide_figure("/v1/verify?indicator=inflation_cpi&country=BRB&period=2024&value=1.45",
                     [("verdict", "match", '"verdict": "match"'),
                      ("official_value", "1.4464366430616", "1.4464")], "rounding")
        # The revision-check figures are the point of that example.
        _, rv = jget("/v1/verify?indicator=govt_debt_gdp&country=USA&period=2023&value=98")
        rc = (rv or {}).get("revision_check") or {}
        for key, fragment in [("previous_edition", '"previous_edition": "WEO 2025-10"'),
                              ("previous_value", '"previous_value": 119.836')]:
            val = str(rc.get(key))
            if val not in fragment:
                drift.append(f"revision.{key}: live says {val}, page prints {fragment!r}")
            elif fragment not in guide:
                drift.append(f"revision.{key}: page no longer prints {fragment!r}")
        check("claims", "/guide figures match the live service", not drift, "; ".join(drift)[:200])

        # Quoted verbatim, so a reworded upstream message must not be left
        # sitting on the page inside quotation marks.
        _, d = jget("/v1/verify?indicator=inflation_cpi&country=USA&period=2023&value=8.0")
        diag = " ".join((d or {}).get("diagnostics") or [])
        quoted = "matches the 2022 figure (8.0028), the year may be misattributed"
        check("claims", "/guide quotes the diagnostic verbatim",
              quoted in diag and quoted in guide, "the quoted diagnostic no longer matches the API")

        # The benchmark's own publication covenant: the three rates are never
        # quoted apart from one another. A later edit that trims the sentence
        # to just the flattering number would breach it silently.
        plain = re.sub(r"<[^>]+>", " ", guide)
        sentence = next((x for x in re.split(r"\.\s", plain) if "82.0%" in x), "")
        check("claims", "/guide keeps the three benchmark rates in one sentence",
              bool(sentence) and "15.5%" in sentence and "97.0%" in sentence,
              "the accuracy figure has been separated from confabulation/answer rates")


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

    # Google's Dataset schema, checked field by field. The harness passed
    # 122/122 on 2026-08-29 while Search Console was reporting the markup as
    # invalid, because it only checked that datasets EXISTED and that their
    # URLs resolved. "Missing field 'description'" is CRITICAL: it stops the
    # page appearing as a rich result at all, so a structural check that does
    # not test the required fields is checking the wrong thing.
    incomplete = []
    for ds in dsets:
        for field in ("name", "description", "license", "keywords"):
            if not ds.get(field):
                incomplete.append(f"{str(ds.get('name', '?'))[:28]}:{field}")
    check("disc", "every dataset has name, description, license and keywords", not incomplete, "; ".join(incomplete)[:180])

    # The licence must be the PUBLISHER's, never one blanket claim over six
    # publishers' data. Distinct licences are the evidence of that.
    licences = {str(ds.get("license") or "") for ds in dsets}
    check("disc", "licences are per-publisher, not one blanket claim", len(licences) >= 5, f"{len(licences)} distinct across {len(dsets)} datasets")
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



def audit_machine_clients():
    """Checks the self-audit was structurally blind to.

    Every request above sets a custom user-agent, so the harness could never
    see that Cloudflare's Browser Integrity Check 403s Python's standard
    library client on every path. 124 checks passed while /llms.txt - the file
    whose entire purpose is being machine-read - returned "error code: 1010"
    to the plainest possible agent.
    """
    print("\n== machine clients ==")

    # Deliberately NOT setting a user-agent: urllib sends Python-urllib/3.x,
    # which is the case being tested. Do not "fix" this by adding a UA.
    import urllib.request as _u

    blocked = []
    for path in ["/", "/llms.txt", "/llms-full.txt", "/openapi.json", "/robots.txt",
                 "/sitemap.xml", "/v1/sources", "/v1/indicators", "/.well-known/security.txt"]:
        try:
            with _u.urlopen(BASE + path, timeout=30) as r:
                if r.status >= 400:
                    blocked.append(f"{path}:{r.status}")
        except urllib.error.HTTPError as e:
            blocked.append(f"{path}:{e.code}")
        except Exception as e:
            blocked.append(f"{path}:{type(e).__name__}")
    check("machine", "the Python stdlib HTTP client is not blocked", not blocked,
          ("; ".join(blocked)[:150] + "  <-- FIX IS A CLOUDFLARE ZONE SETTING, NOT A REPO CHANGE: "
           "the 403 (error 1010) is Browser Integrity Check, generated at the edge before the "
           "Worker runs, so no code here can clear it. Cloudflare dashboard > Security > WAF > "
           "Custom rules > Create rule, action 'Skip', skip Browser Integrity Check, matching "
           "the machine paths (/, /v1/*, /mcp*, /llms*.txt, /openapi.json, /robots.txt, "
           "/sitemap.xml, /.well-known/*). BIC buys nothing here: it blocks Python-urllib and "
           "libwww-perl by user-agent string while allowing wget, Go, Java, okhttp and an EMPTY "
           "user-agent.") if blocked else "")

    # Charset. Workers Static Assets strips it on deploy, and both files carry
    # multi-byte UTF-8 including the documented verifier tolerances, which a
    # client applying the RFC 2616 text/* default renders as mojibake.
    for path in ["/llms.txt", "/llms-full.txt"]:
        st, h, _ = get(path)
        ct = (h.get("Content-Type") or h.get("content-type") or "").lower()
        check("machine", f"{path} declares charset=utf-8", "charset=utf-8" in ct, ct)

    # Vary. Four content-codings are served from one URL under
    # public, max-age=3600, so a shared cache may replay the wrong one.
    st, h, _ = get("/v1/sources")
    vary = (h.get("Vary") or h.get("vary") or "")
    check("machine", "/v1 responses send Vary: Accept-Encoding", "accept-encoding" in vary.lower(), vary or "(absent)")

    # llms.txt must parse with the REFERENCE implementation, not just look
    # right. Prose under an H2 crashed it outright, taking the correctly
    # formatted Docs and Quick use link lists down with it.
    try:
        from llms_txt import parse_llms_file
        st, _, body = get("/llms.txt")
        d = parse_llms_file(body)
        names = list((d.get("sections") or {}).keys())
        check("machine", "llms.txt parses with the reference llms.txt parser", bool(names), f"sections: {names}")
        check("machine", "llms.txt section names carry no stray CR", not any("\r" in n for n in names), str(names))
    except ImportError:
        check("machine", "llms.txt parser check available (pip install llms-txt)", False, "llms-txt not installed")


def audit_contracts():
    """API contracts that silently produced a WRONG ANSWER rather than an error."""
    print("\n== api contracts ==")

    # The worst defect this sweep found. Against the official BRB inflation_cpi
    # 2024 value of 1.4464366430616 and a claimed 1.4, tolerance_abs=0.001
    # returns mismatch, but a MISSPELLED tolerance was silently dropped and the
    # lenient default applied, so the caller who asked for a strict check was
    # told "match" at HTTP 200. That is the exact failure this service exists
    # to prevent.
    v = "/v1/verify?indicator=inflation_cpi&country=BRB&period=2024&value=1.4"
    st, d = jget(v + "&tolerance_abs=0.001")
    check("contract", "a strict tolerance is honoured", (d or {}).get("verdict") == "mismatch", str((d or {}).get("verdict")))
    for typo in ["tolerance", "toleranceAbs", "tolerence_abs", "startYear"]:
        st, d = jget(f"{v}&{typo}=0.001")
        check("contract", f"unknown parameter '{typo}' is refused, not ignored", st == 400, f"http {st}")

    # A boolean flag read with `=== "true"` does not fail on strict_source=1,
    # it SILENTLY DOWNGRADES: the caller asked for a primary-source-only
    # guarantee and quietly received a fallback value with a 200.
    st, _, _ = get(v + "&strict_source=bogus")
    check("contract", "an unparseable boolean is refused", st == 400, f"http {st}")

    # An inverted window used to run the full fetch and return a message whose
    # own available_range CONTAINED both requested years.
    st, d = jget("/v1/indicator/inflation_cpi?country=BRB&start_year=2024&end_year=2015")
    msg = json.dumps(d or {})
    check("contract", "an inverted year window is refused by name", st == 422 and "start_year" in msg and "swap" in msg.lower(), f"http {st}: {msg[:120]}")
    st, d = jget("/v1/indicator/inflation_cpi?country=BRB&start_year=2015&end_year=2024")
    check("contract", "a correct year window still works", st == 200 and len((d or {}).get("observations") or []) > 0, f"http {st}")

    # Truncation was silent: "gdp" returned 8 of 20 registry matches and looked
    # complete, so an agent concluded there was no tax_revenue_gdp indicator.
    st, d = jget("/v1/search?q=gdp")
    d = d or {}
    check("contract", "search discloses the total match count", isinstance(d.get("total_indicator_matches"), int), str(d.get("total_indicator_matches")))
    check("contract", "search flags truncation", d.get("truncated") is True and bool(d.get("note")), f"truncated={d.get('truncated')}")

    # verify could not round-trip its own response body: it RETURNS
    # claimed_value and used to 400 on being given one.
    st, d = jget(v.replace("value=1.4", "claimed_value=1.4"))
    check("contract", "/v1/verify accepts claimed_value as an alias", st == 200, f"http {st}")

    # Paste-ready BibTeX/APA is the strongest thing this product offers a
    # researcher, and it was documented only in openapi.json.
    st, d = jget("/v1/indicator/inflation_cpi?country=BRB&latest_only=true")
    ef = ((d or {}).get("citation") or {}).get("export_formats") or {}
    check("contract", "citations carry export_formats (bibtex + apa)", bool(ef.get("bibtex") and ef.get("apa")), str(list(ef)))

    st, _, docs = get("/docs")
    # Anchored on the section boundary, NOT on the word "changelog": the table
    # of contents links to #changelog near the top of the page, so splitting on
    # that word truncated the body before the citation section and reported a
    # false failure against correct content.
    cite_section = docs.split('<h2 id="rest">')[0].split('<h2 id="citation">')[-1]
    check("contract", "the docs citation spec documents export_formats", "export_formats" in cite_section, "absent from the citation section")

    # openapi.json promised only "an object" for 8 of 14 operations, so a
    # generated client had to call the endpoint blind to learn field names.
    st, spec = jget("/openapi.json")
    untyped = []
    for path_, ops in (spec or {}).get("paths", {}).items():
        for verb, op in ops.items():
            if not isinstance(op, dict):
                continue
            sch = (((op.get("responses") or {}).get("200") or {}).get("content") or {}).get("application/json", {}).get("schema")
            if sch is None:
                continue
            if sch == {} or (list(sch.keys()) == ["type"] and sch.get("type") == "object"):
                untyped.append(f"{verb.upper()} {path_}")
    check("contract", "every OpenAPI 200 response declares a real schema", not untyped, "; ".join(untyped)[:220])


def audit_crawlable():
    """What a crawler that does not run JavaScript actually receives."""
    print("\n== crawlable content ==")

    # /sources is the page the homepage JSON-LD names as the DataCatalog's url,
    # and llms-full.txt sends machine readers to it as "Human-readable". Its
    # whole ledger was written by fetch() into innerHTML, so GPTBot, ClaudeBot
    # and PerplexityBot - the audience this service is built for - saw
    # "Loading the ledger from /v1/sources...".
    st, d = jget("/v1/sources")
    names = [x.get("name") for x in (d or {}).get("sources") or []]
    st, _, page = get("/sources")
    missing = [n for n in names if n and n.split(",")[0].split(".")[0][:28] not in page]
    check("crawl", "/sources server-renders every source in the ledger", not missing, f"{len(missing)} missing: {'; '.join(missing)[:150]}")
    for verdict in ["served", "flow_through", "refused"]:
        check("crawl", f"/sources server-renders the '{verdict}' verdict", verdict in page, "")

    # Structured data existed only on the homepage; /docs and /bench were
    # unclassified despite schema.org having exact types for both.
    for path in PAGES:
        st, _, body = get(path)
        blocks = re.findall(r'<script type="application/ld\+json">(.*?)</script>', body, re.S)
        ok = False
        types = []
        try:
            for b in blocks:
                obj = json.loads(b)
                nodes = obj.get("@graph", [obj])
                types += [n.get("@type") for n in nodes]
                ok = bool(nodes)
        except Exception as e:
            types = [f"UNPARSEABLE {e}"]
        check("crawl", f"{path} serves parseable JSON-LD", ok, str(types)[:110])

    # A lastmod that stops tracking real edits is worse than none, so check the
    # dates are present, real, and not in the future.
    from datetime import date
    st, _, sm = get("/sitemap.xml")
    locs = re.findall(r"<loc>([^<]+)</loc>", sm)
    mods = re.findall(r"<lastmod>([^<]+)</lastmod>", sm)
    check("crawl", "every sitemap URL carries a lastmod", len(locs) == len(mods) and len(locs) > 0, f"{len(locs)} locs, {len(mods)} lastmods")
    bad = []
    for m in mods:
        try:
            if date.fromisoformat(m.strip()[:10]) > date.today():
                bad.append(f"{m} is in the future")
        except ValueError:
            bad.append(f"{m} is not a date")
    check("crawl", "every lastmod is a real, non-future date", not bad, "; ".join(bad)[:150])

    # A link to a fragment that does not exist does not 404. It silently lands
    # at the top of the page, so a broken deep link looks exactly like a
    # working one to anyone not checking. The homepage tool cards were made
    # into deep links on 2026-08-31 and the anchors they point at are new.
    st, _, home = get("/")
    st, _, docs_body = get("/docs")
    ids = set(re.findall(r'id="([^"]+)"', docs_body))
    frags = sorted(set(re.findall(r'href="/docs#([^"]+)"', home)))
    dead = [f for f in frags if f not in ids]
    check("crawl", "every /docs# link on the homepage hits a real anchor",
          bool(frags) and not dead, f"{len(frags)} links, dead: {dead}")

    # The docs registry table drifted six keys behind the live registry and
    # contradicted the same page two sections earlier.
    st, d = jget("/v1/indicators")
    keys = [i["key"] for i in (d or {}).get("indicators") or []]
    st, _, docs = get("/docs")
    absent = [k for k in keys if f"<code>{k}</code>" not in docs]
    check("crawl", "the docs registry table lists every live registry key", not absent, f"{len(absent)} absent: {', '.join(absent)[:120]}")

def main():
    only = None
    if "--only" in sys.argv:
        only = sys.argv[sys.argv.index("--only") + 1]
    for name, fn in [("api", audit_api), ("seo", audit_seo), ("links", audit_links), ("claims", audit_consistency), ("mcp", audit_mcp), ("a11y", audit_a11y), ("disc", audit_discovery), ("machine", audit_machine_clients), ("contract", audit_contracts), ("crawl", audit_crawlable)]:
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
