// WCAG 2.x contrast check for the Observatory kit tokens. No dependencies.
// Usage: node tools/contrast.mjs [path-to-css ...]   (default: site/assets/sc.css)
// Reads the custom properties declared in every :root{...} block of each file,
// resolves var() aliases, then measures the kit's token pairs against their floors.
// Exit code 1 if any pair is below its floor, or if a token a pair needs is missing
// or is not a six-digit hex colour. Exit code 0 otherwise. Run it before committing
// any brand block (see docs/design/DESIGN-SYSTEM.md).
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const TEXT = 4.5; // WCAG 1.4.3 normal text
const NONTEXT = 3; // WCAG 1.4.11 control borders, focus rings

const GROUNDS = ["--bg", "--bg-2", "--card", "--sbar-fill"];

// [foreground, [backgrounds], floor, note]
const PAIRS = [
  ["--text", GROUNDS, TEXT, "headings, body"],
  ["--text-2", GROUNDS, TEXT, "leads, captions, nav links, verdict cannot_verify"],
  ["--text-3", GROUNDS, TEXT, "footer, footnotes, ruler labels"],
  ["--link", ["--bg", "--card"], TEXT, "inline links"],
  ["--accent", ["--bg", "--card"], TEXT, "needle, active number, verdict match"],
  ["--on-accent", ["--accent"], TEXT, "text on the primary button"],
  ["--fam-1", ["--bg", "--bg-2"], TEXT, "family 1 text and arcs"],
  ["--fam-2", ["--bg", "--bg-2"], TEXT, "family 2 text and arcs"],
  ["--fam-3", ["--bg", "--bg-2"], TEXT, "family 3 text and arcs"],
  ["--fam-4", ["--bg", "--bg-2"], TEXT, "family 4 text and arcs"],
  ["--fam-1", ["--card"], NONTEXT, "focus ring on card"],
  ["--v-match", ["--bg", "--card"], TEXT, "verdict match"],
  ["--v-close", ["--bg", "--card"], TEXT, "verdict close"],
  ["--v-mismatch", ["--bg", "--card"], TEXT, "verdict mismatch, refused, error text"],
  ["--v-cannot", ["--bg", "--card"], TEXT, "verdict cannot_verify"],
  ["--line-strong", ["--bg", "--card"], NONTEXT, "field and tab borders, the control affordance"],
];
// Informational only: hairline separators have no WCAG floor.
const INFO = [["--line", ["--bg"], "hairline separators (exempt)"]];

function parseTokens(css) {
  css = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const raw = new Map();
  for (const m of css.matchAll(/:root\s*\{([^}]*)\}/g)) {
    for (const d of m[1].matchAll(/(--[\w-]+)\s*:\s*([^;]+?)\s*(?:;|$)/g)) raw.set(d[1], d[2]);
  }
  return raw;
}

function resolveToken(raw, name, seen = new Set()) {
  let v = raw.get(name);
  if (v === undefined || seen.has(name)) return undefined;
  seen.add(name);
  const m = v.match(/^var\(\s*(--[\w-]+)\s*\)$/);
  return m ? resolveToken(raw, m[1], seen) : v;
}

function hexToRgb(h) {
  const m = /^#([0-9a-f]{6})$/i.exec(h || "");
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function lum([r, g, b]) {
  const f = (c) => {
    c /= 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function ratio(a, b) {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

export function check(css) {
  const raw = parseTokens(css);
  const rows = [];
  let failed = 0;
  const get = (n) => hexToRgb(resolveToken(raw, n));
  for (const [fg, bgs, floor, note] of PAIRS) {
    for (const bg of bgs) {
      const a = get(fg), b = get(bg);
      if (!a || !b) {
        rows.push({ fg, bg, ratio: NaN, floor, status: "MISSING", note });
        failed++;
        continue;
      }
      const r = ratio(a, b);
      const ok = r >= floor;
      if (!ok) failed++;
      rows.push({ fg, bg, ratio: r, floor, status: ok ? "pass" : "FAIL", note });
    }
  }
  for (const [fg, bgs, note] of INFO) {
    for (const bg of bgs) {
      const a = get(fg), b = get(bg);
      rows.push({ fg, bg, ratio: a && b ? ratio(a, b) : NaN, floor: 0, status: "info", note });
    }
  }
  return { rows, failed };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const files = process.argv.slice(2);
  if (!files.length) files.push(resolve(root, "site/assets/sc.css"));
  let total = 0;
  for (const f of files) {
    let css;
    try {
      css = readFileSync(f, "utf8");
    } catch (e) {
      console.error("cannot read " + f + ": " + e.message);
      process.exit(1);
    }
    const { rows, failed } = check(css);
    console.log("\n" + f);
    console.log("foreground       background     ratio   floor  status  use");
    for (const r of rows) {
      const rr = Number.isNaN(r.ratio) ? "  n/a " : r.ratio.toFixed(2).padStart(6) + ":1";
      console.log(
        r.fg.padEnd(16) + " " + r.bg.padEnd(14) + " " + rr + "  " +
          (r.floor ? String(r.floor).padStart(4) : "   -") + "  " + r.status.padEnd(7) + " " + r.note
      );
    }
    console.log(failed ? failed + " pair(s) below floor or missing" : "all pairs meet their floors");
    total += failed;
  }
  process.exit(total ? 1 : 0);
}
