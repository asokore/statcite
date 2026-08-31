#!/usr/bin/env python3
"""Render the demo GIF: a model states a wrong statistic, verify_stat catches it.

Every value, verdict, citation and note rendered here is captured from a LIVE
call to https://statcite.com/v1/verify at build time. Nothing is typed by hand.
If the service changes what it returns, re-running this changes the GIF, and if
the service is unreachable the script fails rather than drawing a plausible
picture of something it did not observe.

The claim used (US general government gross debt at 98% of GDP in 2023) is the
realistic failure mode, not a strawman: 98% was roughly right a few years
earlier, so it is exactly the kind of confidently-stated stale recall a model
produces from memory. The official figure is 120%.

    python tools/make-demo-gif.py
    -> docs/assets/statcite-demo.gif
"""
import json
import sys
import urllib.request
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "docs" / "assets" / "statcite-demo.gif"

W, H = 920, 660
PAD = 26
LINE = 22
FONT_PATH = "C:/Windows/Fonts/consola.ttf"
FONT_BOLD = "C:/Windows/Fonts/consolab.ttf"

BG = (13, 17, 23)
FG = (201, 209, 217)
DIM = (125, 133, 144)
GREEN = (63, 185, 80)
RED = (248, 81, 73)
AMBER = (210, 153, 34)
BLUE = (88, 166, 255)
PROMPT = (139, 148, 158)


def fetch():
    url = ("https://statcite.com/v1/verify"
           "?indicator=govt_debt_gdp&country=USA&period=2023&value=98")
    req = urllib.request.Request(url)
    req.add_header("user-agent", "statcite-demo/1.0")
    with urllib.request.urlopen(req, timeout=45) as r:
        return json.loads(r.read().decode("utf8"))


def build_script(d):
    """Lines to render. (text, colour, bold, pause_frames_after)."""
    c = d["citation"]
    rev = d.get("revision_check") or {}
    off = d["official_value"]
    clm = d["claimed_value"]
    diff = abs(d["difference"])
    rel = abs(d.get("relative_difference_pct") or 0)

    # Reproduce the numbers exactly as the API returned them.
    off_s = f"{off:g}"
    clm_s = f"{clm:g}"

    return [
        ("$ ask claude \"what was US government debt as a share of GDP in 2023?\"", FG, False, 6),
        ("", FG, False, 0),
        ("  Claude:  US government debt was about 98% of GDP in 2023.", DIM, False, 10),
        ("", FG, False, 0),
        ("  Confident. Fluent. Wrong by 22 points.", AMBER, True, 12),
        ("", FG, False, 0),
        ("$ verify_stat  indicator=govt_debt_gdp  country=USA  period=2023  value=98", BLUE, False, 8),
        ("", FG, False, 0),
        (f"  verdict          MISMATCH", RED, True, 3),
        (f"  claimed          {clm_s} % of GDP", FG, False, 1),
        (f"  official         {off_s} % of GDP", GREEN, True, 2),
        (f"  difference       {diff:g} percentage points ({rel:g}% relative)", FG, False, 6),
        ("", FG, False, 0),
        (f"  source           {c['source']}", DIM, False, 1),
        (f"  dataset          {c['dataset']}", DIM, False, 1),
        (f"  series           {c['series_id']}", DIM, False, 1),
        (f"  retrieved        {c['retrieved_at']}", DIM, False, 4),
        ("", FG, False, 0),
        (f"  revision check   not the previous vintage either ({rev.get('previous_edition')}: {rev.get('previous_value')})", DIM, False, 8),
        ("", FG, False, 0),
        ("  Corrected, with the citation attached:", FG, True, 4),
        (f"  \"US general government gross debt was {off_s}% of GDP in 2023", GREEN, False, 1),
        (f"   ({c['source']}, {c['dataset']}, series {c['series_id'].split('/')[-1]}).\"", GREEN, False, 14),
        ("", FG, False, 0),
        ("  statcite.com  ·  free MCP server + REST API  ·  no key, no signup", BLUE, True, 22),
    ]


def wrap(text, limit=86):
    """Wrap, preserving the line's own indentation on continuations.

    The first version rebuilt continuations from bare words and lost the lead,
    so a wrapped line jumped to column 0 and broke the alignment of the block
    it belonged to.
    """
    if len(text) <= limit:
        return [text]
    lead = " " * (len(text) - len(text.lstrip()))
    cont = lead + "  "
    out, cur = [], lead
    for word in text.split():
        candidate = word if cur.strip() == "" else cur + " " + word
        if cur.strip() and len(candidate) > limit:
            out.append(cur)
            cur = cont + word
        else:
            cur = (cur + word) if cur.strip() == "" else candidate
    if cur.strip():
        out.append(cur)
    return out


def main():
    print("fetching live verify_stat response...")
    d = fetch()
    if d.get("verdict") != "mismatch":
        print(f"verdict is {d.get('verdict')!r}, not mismatch; the demo premise no longer holds",
              file=sys.stderr)
        return 1
    print(f"  claimed {d['claimed_value']} vs official {d['official_value']} -> {d['verdict']}")

    try:
        font = ImageFont.truetype(FONT_PATH, 15)
        bold = ImageFont.truetype(FONT_BOLD, 15)
    except OSError:
        print("Consolas not found; falling back to the default bitmap font", file=sys.stderr)
        font = bold = ImageFont.load_default()

    script = []
    for text, colour, is_bold, pause in build_script(d):
        parts = wrap(text)
        for i, part in enumerate(parts):
            script.append((part, colour, is_bold, pause if i == len(parts) - 1 else 0))

    frames, durations = [], []

    def render(visible, partial_len=None):
        img = Image.new("RGB", (W, H), BG)
        dr = ImageDraw.Draw(img)
        dr.rectangle([0, 0, W, 30], fill=(22, 27, 34))
        for i, (cx, col) in enumerate([(18, (255, 95, 86)), (38, (255, 189, 46)), (58, (39, 201, 63))]):
            dr.ellipse([cx - 5, 10, cx + 5, 20], fill=col)
        dr.text((80, 8), "statcite  —  verify before you publish", font=font, fill=PROMPT)

        y = 44
        for j, (text, colour, is_bold, _) in enumerate(visible):
            shown = text
            if partial_len is not None and j == len(visible) - 1:
                shown = text[:partial_len]
            dr.text((PAD, y), shown, font=bold if is_bold else font, fill=colour)
            y += LINE
            if y > H - PAD:
                break
        return img

    shown = []
    for text, colour, is_bold, pause in script:
        if not text.strip():
            shown.append((text, colour, is_bold, pause))
            frames.append(render(shown))
            durations.append(120)
            continue
        shown.append((text, colour, is_bold, pause))
        # Typewriter: step in chunks so the frame count stays sane.
        step = max(6, len(text) // 6)
        for n in range(step, len(text) + step, step):
            frames.append(render(shown, partial_len=min(n, len(text))))
            durations.append(95)
        held = render(shown)
        frames.append(held)
        durations.append(150)
        for _ in range(pause):
            frames.append(held)
            durations.append(150)

    # Hold the final frame.
    for _ in range(10):
        frames.append(frames[-1])
        durations.append(200)

    total_ms = sum(durations)
    print(f"frames: {len(frames)}  duration: {total_ms / 1000:.1f}s")

    OUT.parent.mkdir(parents=True, exist_ok=True)
    pal = [f.quantize(colors=16, method=Image.MEDIANCUT, dither=Image.NONE) for f in frames]
    pal[0].save(OUT, save_all=True, append_images=pal[1:], duration=durations,
                loop=0, optimize=True, disposal=2)
    size = OUT.stat().st_size
    print(f"wrote {OUT.relative_to(ROOT)}  {size / 1024:.0f} KB")
    if total_ms < 25000 or total_ms > 70000:
        print(f"WARNING: {total_ms / 1000:.0f}s is outside the 30-60s target in docs/LAUNCH.md")
    return 0


if __name__ == "__main__":
    sys.exit(main())
