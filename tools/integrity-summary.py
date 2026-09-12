#!/usr/bin/env python3
"""Render verify-against-source.py --json output as a Markdown summary.

    python tools/integrity-summary.py integrity.json >> "$GITHUB_STEP_SUMMARY"

Kept as a file rather than inline in the workflow, because code passed through
a YAML run block loses a level of escaping without any error.
"""
import json
import sys


def main(path):
    try:
        with open(path, encoding="utf8") as f:
            d = json.load(f)
    except (OSError, ValueError) as e:
        print("## Source integrity")
        print()
        print(f"The verifier produced no readable result ({type(e).__name__}). See the job log.")
        return 0
    print("## Source integrity")
    print()
    print("| Checked at | Verified | Skipped | Coverage | Mismatches | Network fault |")
    print("|---|---|---|---|---|---|")
    print(f"| {d['checked_at']} | {d['ok']} | {d['skipped']} | {d['coverage_pct']}% "
          f"| {len(d['mismatches'])} | {d['network_fault']} |")
    for m in d["mismatches"]:
        print(f"- MISMATCH {m[1]} {m[2]}: {m[3]}")
    if d.get("skip_reasons"):
        print()
        print("Skips, with reasons:")
        for reason, v in d["skip_reasons"].items():
            print(f"- {v['count']} x {reason} (for example {', '.join(v['examples'][:3])})")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1] if len(sys.argv) > 1 else "integrity.json"))
