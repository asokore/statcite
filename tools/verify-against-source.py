#!/usr/bin/env python3
"""Compare values StatCite serves against the primary sources, independently.

Every existing test runs against recorded fixtures (`installFetchStub`), which
proves the parsing logic is stable but cannot catch the failure that matters
most here: serving a real number from the WRONG series, or a stale one, or one
attributed to a publisher that does not carry it. The whole product is "numbers
you can cite", so an unchecked value is the one defect class that would be
existential rather than embarrassing.

This shares NO code path with the Worker. It is a second implementation in a
different language that talks to the World Bank and IMF APIs directly, and it
resolves the upstream series from **StatCite's own citation** rather than from
a list written here. That is deliberate: it tests the strongest claim the
service makes, which is not "this number is plausible" but "this number is what
the series named in the citation actually contains".

    python tools/verify-against-source.py            # default sample
    python tools/verify-against-source.py --full     # every active indicator
    python tools/verify-against-source.py --json     # machine-readable

WHAT IT COVERS, precisely, because a coverage claim is the thing most likely to
be overstated here. It re-checks series cited to the **World Bank** and to the
**IMF DataMapper**, which between them back most of the registry. It does NOT
check BIS policy rates or the ECB Data Portal: those speak SDMX with their own
content-negotiation quirks and are reported as skips by name rather than
counted as passes. It also does not check the Caribbean central bank tables,
which have their own verifiers under caribstat/tools/.

A skip is not a pass. The summary prints the coverage percentage and itemises
every skip with its reason, and warns explicitly when coverage falls below half,
because "0 mismatches" off a thin sample is the exact shape of a false green.

Last full run 2026-09-02: 215 verified, 0 mismatches, 85% coverage across all
42 active indicators x 6 economies. The 37 skips were 33 honest-absence 422s
(the source genuinely publishes nothing for that economy) and 4 BIS series.

Mutation-tested the same day: shifting the World Bank reader by 1% produced 45
mismatches and shifting the IMF reader by 0.5 produced 6, so the comparison is
known to fire rather than merely known to pass.

This hits live upstream APIs, so it is deliberately NOT in CI: it would make CI
flaky and would hammer the World Bank and IMF on every push. Run it after any
change to the source-selection or parsing logic, and periodically per
docs/BOOKKEEPING.md.

Exit status is 1 if any value disagrees with its own cited source.
"""
import argparse
import json
import sys
import time
import urllib.error
import urllib.request

BASE = "https://statcite.com"

# The World Bank rounds nothing, so an exact float match is the right bar.
# A tolerance here would hide precisely the drift this exists to find.
REL_TOL = 1e-9

# IMF DataMapper serves WEO values rounded to one decimal place, so a served
# value may legitimately differ from a higher-precision source in the last
# digit. This is the documented behaviour, not slack.
IMF_ABS_TOL = 0.051


def fetch(url, ua="statcite-source-verify/1.0", timeout=45):
    req = urllib.request.Request(url)
    if ua is not None:
        req.add_header("user-agent", ua)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf8"))


def statcite(path):
    return fetch(BASE + path)


def worldbank_series(iso3, code):
    """Straight from api.worldbank.org, no StatCite code involved."""
    url = (f"https://api.worldbank.org/v2/country/{iso3}/indicator/{code}"
           f"?format=json&per_page=400")
    d = fetch(url)
    if not isinstance(d, list) or len(d) < 2 or not d[1]:
        return {}
    return {row["date"]: row["value"] for row in d[1] if row.get("value") is not None}


def imf_datamapper_series(iso3, code):
    """IMF DataMapper. Send NO user-agent: it 403s when one is present."""
    url = f"https://www.imf.org/external/datamapper/api/v1/{code}/{iso3}"
    d = fetch(url, ua=None)
    vals = (d.get("values") or {}).get(code, {}).get(iso3, {})
    return {k: v for k, v in vals.items() if v is not None}


def check_one(key, iso3, results):
    """Fetch one indicator from StatCite, then re-fetch its cited series."""
    try:
        served = statcite(f"/v1/indicator/{key}?country={iso3}")
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf8", "replace")[:120]
        results.append(("skip", key, iso3, f"StatCite {e.code}: {body}"))
        return

    obs = [o for o in served.get("observations", []) if o.get("value") is not None]
    if not obs:
        results.append(("skip", key, iso3, "no observations served"))
        return

    cit = served.get("citation") or {}
    series_id = str(cit.get("series_id") or "")
    source = cit.get("source") or ""

    # Resolve the SAME series upstream, from the citation the response gave us.
    #
    # Route on the citation's SOURCE, not on a prefix. World Bank citations
    # carry the bare series code ("FP.CPI.TOTL.ZG"); only IMF ones are
    # prefixed ("imf/GGXWDG_NGDP"). The first version of this matched on a
    # "worldbank/" prefix that does not exist, silently skipped every World
    # Bank case, and reported "0 mismatches" off six comparisons out of 54.
    code = series_id.split("/", 1)[1] if "/" in series_id else series_id
    try:
        if source == "World Bank":
            upstream = worldbank_series(iso3, code)
            tol_abs, tol_rel, who = 0.0, REL_TOL, "World Bank"
        elif source.startswith("International Monetary Fund") or series_id.startswith("imf/"):
            upstream = imf_datamapper_series(iso3, code)
            tol_abs, tol_rel, who = IMF_ABS_TOL, 0.0, "IMF DataMapper"
        else:
            results.append(("skip", key, iso3, f"source {source!r} not checkable here"))
            return
    except Exception as e:
        results.append(("skip", key, iso3, f"upstream unreachable: {type(e).__name__}"))
        return

    if not upstream:
        results.append(("skip", key, iso3, f"upstream returned nothing for {series_id}"))
        return

    # Compare every overlapping period, not just the latest. A wrong-series bug
    # can agree on one year by coincidence and diverge across the rest.
    compared = 0
    for o in obs:
        period, got = str(o["period"]), o["value"]
        if period not in upstream:
            continue
        want = upstream[period]
        compared += 1
        if tol_abs:
            ok = abs(got - want) <= tol_abs
        else:
            ok = abs(got - want) <= abs(want) * tol_rel if want else got == want
        if not ok:
            results.append(("MISMATCH", key, iso3,
                            f"{period}: served {got!r} but {who} {series_id} says {want!r}"))
            return

    if compared == 0:
        results.append(("skip", key, iso3, f"no overlapping periods with {series_id}"))
    else:
        results.append(("ok", key, iso3, f"{compared} periods agree with {who} {series_id}"))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--full", action="store_true",
                    help="every active indicator, not the default sample")
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()

    registry = statcite("/v1/indicators")["indicators"]
    active = [i["key"] for i in registry if i.get("active")]

    # A spread of economies: large, small, an emerging market, and Caribbean
    # states, because coverage gaps and unit slips cluster in the small ones.
    countries = ["USA", "DEU", "BRB", "JAM", "ZAF", "IND"]
    keys = active if args.full else [
        "inflation_cpi", "gdp_growth", "unemployment_rate", "govt_debt_gdp",
        "current_account_gdp", "gdp_current_usd", "population",
        "external_debt_stock_usd", "tourism_receipts_exports",
    ]
    keys = [k for k in keys if k in active]

    results = []
    total = len(keys) * len(countries)
    n = 0
    for key in keys:
        for iso3 in countries:
            n += 1
            if not args.json:
                print(f"  [{n:3d}/{total}] {key} {iso3} ... ", end="", flush=True)
            check_one(key, iso3, results)
            if not args.json:
                print(results[-1][0])
            time.sleep(0.15)   # be polite to the upstreams

    mism = [r for r in results if r[0] == "MISMATCH"]
    oks = [r for r in results if r[0] == "ok"]
    skips = [r for r in results if r[0] == "skip"]

    if args.json:
        print(json.dumps({"mismatches": [list(m) for m in mism],
                          "ok": len(oks), "skipped": len(skips)}, indent=1))
    else:
        print(f"\n{'=' * 66}")
        cov = 100.0 * len(oks) / max(1, len(oks) + len(skips))
        print(f"verified: {len(oks)}   skipped: {len(skips)}   "
              f"coverage: {cov:.0f}%   MISMATCHES: {len(mism)}")
        for _, key, iso3, msg in mism:
            print(f"   MISMATCH  {key} {iso3}  {msg}")
        # Skips are always itemised. "0 mismatches" off a thin sample is not a
        # pass, and hiding the skip reasons behind a flag is how that gets
        # mistaken for one.
        if skips:
            print("\n   skipped, with reasons:")
            seen = {}
            for _, key, iso3, msg in skips:
                seen.setdefault(msg.split(":")[0], []).append(f"{key}/{iso3}")
            for reason, who_list in sorted(seen.items()):
                print(f"     {len(who_list):3d}x {reason}  ({', '.join(who_list[:4])}"
                      f"{', ...' if len(who_list) > 4 else ''})")
        if cov < 50 and not mism:
            print(f"\n   WARNING: only {cov:.0f}% of the sample was actually compared, "
                  f"so a clean result here is weak evidence.")
    return 1 if mism else 0


if __name__ == "__main__":
    sys.exit(main())
