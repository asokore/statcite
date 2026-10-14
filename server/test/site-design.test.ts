// Site design guards for the "Observatory" redesign (docs/design/DESIGN-SYSTEM.md,
// sections 6 and 9, guards (a) to (m), plus (n) and (o) added after the design review).
//
// The redesign adds an orbit, a ticker, section bars and a scroll ruler on top of
// pages whose facts must stay in server-sent HTML. These guards hold the lines the
// design system draws: decoration is aria-hidden, carries no digits and names only things
// that exist, every animation stops under reduced motion, the orbit turns
// clockwise, the verifier script stays sandbox-safe, and binary files are never
// rewritten by the eol rule.
//
// Every guard was mutation-tested when it was written: the thing it protects was
// broken in a copy of the tree, this file was run against the copy and seen to
// fail on the named test, and the copy was restored and hash-checked.
//
// STATCITE_DESIGN_ROOT points the file-reading guards at such a copy. It is unset
// in CI, so the guards read the real repo. The registry (INDICATORS, SOURCES,
// TOOLS, countries, the Verdict type) always comes from this checkout's server/src.
//
// Fonts: (d) requires the three served faces to be declared with
// font-display: optional, preloaded on every page, recorded in
// docs/design/FONTS.md with the SHA-256 and size of the shipped bytes, and
// licensed by an OFL file beside them. (c) requires the /fonts/* cache block.
// (p) holds the orbit glyphs to inline SVG masks that draw shapes only. No network.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { INDICATORS } from "../src/core/indicators.ts";
import { SOURCES } from "../src/core/sources.ts";
import { TOOLS } from "../src/tools.ts";
import { resolveCountry } from "../src/core/countries.ts";

const checkoutRoot = path.resolve(fileURLToPath(new URL("../../", import.meta.url)));
const root = process.env.STATCITE_DESIGN_ROOT ? path.resolve(process.env.STATCITE_DESIGN_ROOT) : checkoutRoot;
const read = (rel: string) => readFileSync(path.join(root, rel), "utf8");
const size = (rel: string) => statSync(path.join(root, rel)).size;

// The eight published pages. The search-console verification file is not a page.
const PAGES = () =>
  readdirSync(path.join(root, "site"))
    .filter((f) => f.endsWith(".html") && !/^google[0-9a-f]+\.html$/.test(f))
    .map((f) => `site/${f}`)
    .sort();

const walk = (relDir: string): string[] => {
  const out: string[] = [];
  for (const ent of readdirSync(path.join(root, relDir), { withFileTypes: true })) {
    const rel = `${relDir}/${ent.name}`;
    if (ent.isDirectory()) out.push(...walk(rel));
    else out.push(rel);
  }
  return out;
};

// --- small parsers -----------------------------------------------------------

const stripCssComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, (m) => " ".repeat(m.length));

interface Block {
  prelude: string;
  open: number; // index of "{"
  close: number; // index of the matching "}"
  parent: Block | null;
  children: Block[];
}

// Brace-depth parse of comment-stripped CSS. Quoted strings are skipped so a
// brace inside content:"" or path("") never moves the depth.
function cssBlocks(css: string): Block[] {
  const all: Block[] = [];
  const stack: Block[] = [];
  let preludeStart = 0;
  for (let i = 0; i < css.length; i++) {
    const c = css[i];
    if (c === '"' || c === "'") {
      const end = css.indexOf(c, i + 1);
      assert.ok(end > i, `unterminated string in CSS at ${i}`);
      i = end;
      continue;
    }
    if (c === "{") {
      const b: Block = { prelude: css.slice(preludeStart, i).trim(), open: i, close: -1, parent: stack.at(-1) ?? null, children: [] };
      stack.at(-1)?.children.push(b);
      stack.push(b);
      all.push(b);
      preludeStart = i + 1;
    } else if (c === "}") {
      const b = stack.pop();
      assert.ok(b, `unbalanced "}" in CSS at ${i}`);
      b.close = i;
      preludeStart = i + 1;
    } else if (c === ";") {
      preludeStart = i + 1;
    }
  }
  assert.equal(stack.length, 0, "unbalanced \"{\" in CSS");
  return all;
}

const NO_PREF = /^@media\s*\(\s*prefers-reduced-motion\s*:\s*no-preference\s*\)$/i;

// Elements whose class list holds `cls`, as [openingTag, outerHTML]. Depth is
// counted on the element's own tag name so nested divs close correctly.
function elementsWithClass(html: string, cls: string): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  const re = /<([a-z][a-z0-9]*)\b[^>]*\bclass="([^"]*)"[^>]*>/gi;
  for (const m of html.matchAll(re)) {
    if (!m[2].split(/\s+/).includes(cls)) continue;
    const tag = m[1].toLowerCase();
    const start = m.index ?? 0;
    const tagRe = new RegExp(`<(/?)${tag}\\b[^>]*>`, "gi");
    tagRe.lastIndex = start + m[0].length;
    let depth = 1;
    let end = -1;
    for (let t = tagRe.exec(html); t; t = tagRe.exec(html)) {
      depth += t[1] ? -1 : 1;
      if (depth === 0) {
        end = t.index + t[0].length;
        break;
      }
    }
    assert.ok(end > 0, `no closing </${tag}> for class "${cls}"`);
    out.push([m[0], html.slice(start, end)]);
  }
  return out;
}

const attrValues = (html: string, attr: string) =>
  [...html.matchAll(new RegExp(`\\s${attr}="([^"]*)"`, "g"))].map((m) => m[1]);

const scripts = (html: string) =>
  [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].map((m) => ({ attrs: m[1].trim(), body: m[2] }));

const inlineStyles = (html: string) => [
  ...[...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]),
  ...[...html.matchAll(/\sstyle="([^"]*)"/gi)].map((m) => m[1]),
];

// Split on `sep` at depth 0, skipping quoted strings, parentheses and brackets,
// so ":is(a,b)" and path("M 0 0") never split.
function splitTop(s: string, sep: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '"' || c === "'") {
      const end = s.indexOf(c, i + 1);
      i = end < 0 ? s.length : end;
      continue;
    }
    if (c === "(" || c === "[") depth++;
    else if (c === ")" || c === "]") depth--;
    else if (c === sep && depth === 0) {
      out.push(s.slice(start, i));
      start = i + 1;
    }
  }
  out.push(s.slice(start));
  return out;
}

interface Decl { where: string; prop: string; value: string; prelude: string; block: Block | null }

// Every declaration in a stylesheet (or a style attribute), with the prelude of
// the block that holds it. Text between declarations and a nested block's
// prelude is dropped, so a nested rule never reads as a declaration.
function declarations(where: string, raw: string, attr = false): Decl[] {
  const css = stripCssComments(raw);
  const out: Decl[] = [];
  const take = (body: string, prelude: string, block: Block | null) => {
    for (const part of splitTop(body, ";")) {
      const i = part.indexOf(":");
      if (i < 0) continue;
      const prop = part.slice(0, i).trim().toLowerCase();
      if (!/^-{0,2}[a-z][a-z0-9-]*$/.test(prop)) continue;
      out.push({ where, prop, value: part.slice(i + 1).trim(), prelude, block });
    }
  };
  if (attr) {
    take(css, "(style attribute)", null);
    return out;
  }
  for (const b of cssBlocks(css)) {
    let body = "";
    let pos = b.open + 1;
    for (const c of b.children) {
      const seg = css.slice(pos, c.open);
      body += seg.slice(0, seg.lastIndexOf(";") + 1);
      pos = c.close + 1;
    }
    body += css.slice(pos, b.close);
    take(body, b.prelude, b);
  }
  return out;
}

// Every stylesheet the site ships: sc.css, each page's <style> blocks and each
// style attribute, as declarations.
function allDeclarations(): Decl[] {
  const out = declarations("site/assets/sc.css", read("site/assets/sc.css"));
  for (const rel of PAGES()) {
    const html = read(rel);
    for (const m of html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) out.push(...declarations(`${rel} <style>`, m[1]));
    for (const m of html.matchAll(/\sstyle="([^"]*)"/gi)) out.push(...declarations(`${rel} style=""`, m[1], true));
  }
  return out;
}

// sc.js with comments removed and string contents blanked (quotes kept), for
// brace counting. The script holds no "//" inside a string or regex literal.
const jsNoComments = (js: string) => js.replace(/\/\*[\s\S]*?\*\//g, (m) => " ".repeat(m.length)).replace(/(^|[^:\\])\/\/[^\n]*/g, (m, p) => p + " ".repeat(m.length - p.length));
const jsNoStrings = (js: string) => js.replace(/"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'/g, (m) => m[0] + " ".repeat(m.length - 2) + m[0]);

// CSS escapes decoded, so "\34" reads as "4" and "\ff14" as a full-width digit.
const decodeCssEscapes = (s: string) =>
  s.replace(/\\([0-9a-fA-F]{1,6})[ \t\n]?|\\([^\n0-9a-fA-F])/g, (_m, hex, ch) => (hex ? String.fromCodePoint(parseInt(hex, 16)) : ch));

// --- (a) shared assets, one version, size budget -----------------------------

const KB = 1000; // decimal, the stricter reading of the caps in docs/design/DESIGN-SYSTEM.md section 1

test("(a) every page links sc.css once and sc.js deferred, all on one ?v= value, within the size budget", () => {
  const pages = PAGES();
  assert.equal(pages.length, 8, `expected the eight published pages, found: ${pages.join(", ")}`);
  const versions = new Set<string>();
  for (const rel of pages) {
    const html = read(rel);
    const links = [...html.matchAll(/<link\b[^>]*\bhref="\/assets\/sc\.css(?:\?v=([^"]*))?"[^>]*>/gi)];
    assert.equal(links.length, 1, `${rel}: links /assets/sc.css ${links.length} times`);
    assert.match(links[0][0], /\brel="stylesheet"/, `${rel}: the sc.css link is not rel="stylesheet"`);
    assert.match(links[0][1] ?? "", /^\d{8}$/, `${rel}: sc.css carries no ?v=YYYYMMDD`);
    versions.add(links[0][1]);
    const js = scripts(html).filter((s) => /\bsrc="\/assets\/sc\.js(?:\?v=[^"]*)?"/.test(s.attrs));
    assert.equal(js.length, 1, `${rel}: loads /assets/sc.js ${js.length} times`);
    assert.match(js[0].attrs, /(^|\s)defer(\s|=|$)/, `${rel}: sc.js is not loaded with defer`);
    assert.equal(js[0].body.trim(), "", `${rel}: the sc.js <script> tag holds inline code`);
    const jsV = /\?v=([^"]*)"/.exec(js[0].attrs)?.[1];
    assert.match(jsV ?? "", /^\d{8}$/, `${rel}: sc.js carries no ?v=YYYYMMDD`);
    versions.add(jsV!);
  }
  assert.equal(versions.size, 1, `pages disagree on the asset version: ${[...versions].join(", ")}`);
  assert.ok(size("site/assets/sc.css") <= 20 * KB, `sc.css is ${size("site/assets/sc.css")} bytes, cap 20 KB`);
  assert.ok(size("site/assets/sc.js") <= 5 * KB, `sc.js is ${size("site/assets/sc.js")} bytes, cap 5 KB`);
  assert.ok(size("site/index.html") <= 66 * KB, `index.html is ${size("site/index.html")} bytes, cap 66 KB`);
});

// --- (b) binary files are never touched by the eol rule ------------------------

const KNOWN_BINARY = new Set(["png", "ico", "gif", "jpg", "jpeg", "webp", "avif", "woff", "woff2", "ttf", "otf", "eot", "pdf", "zip", "gz", "br", "mp4", "webm", "mp3"]);

test("(b) .gitattributes marks every binary extension under site/ as binary, after the eol rule", () => {
  const files = walk("site");
  const binExts = new Set<string>();
  const binFiles: string[] = [];
  for (const rel of files) {
    const ext = path.extname(rel).slice(1).toLowerCase();
    const head = readFileSync(path.join(root, rel)).subarray(0, 8000);
    if (KNOWN_BINARY.has(ext) || head.includes(0)) {
      binExts.add(ext || "(none)");
      binFiles.push(rel);
    }
  }
  assert.ok(binExts.has("png") && binExts.has("ico"), `the walk found no png or ico, so it is not reading site/: ${[...binExts].join(", ")}`);
  const ga = read(".gitattributes").split(/\r?\n/);
  const eolLine = ga.findIndex((l) => /^site\/\*\*\s+text\s+eol=lf\s*$/.test(l));
  const missing: string[] = [];
  for (const ext of binExts) {
    const at = ga.findIndex((l) => l.trim() === `site/**/*.${ext} binary`);
    if (at < 0) missing.push(`${ext}: no "site/**/*.${ext} binary" line`);
    else if (eolLine >= 0 && at < eolLine) missing.push(`${ext}: binary line sits above "site/** text eol=lf", which then overrides it`);
  }
  assert.deepEqual(missing, [], missing.join("\n"));
  // The effect, as git computes it: text must be unset on every binary file.
  const r = spawnSync("git", ["-C", root, "check-attr", "text", "--", ...binFiles], { encoding: "utf8" });
  assert.equal(r.status, 0, `git check-attr failed: ${r.stderr}`);
  const notUnset = r.stdout.split(/\r?\n/).filter((l) => l && !/: text: unset$/.test(l));
  assert.deepEqual(notUnset, [], `binary files git would still treat as text:\n${notUnset.join("\n")}`);
});

// --- (c) _headers: the /* block untouched, cache block for /assets ------------

// Byte-for-byte copy of the /* block as committed before the redesign. The CSP,
// HSTS and TDM lines are guarded elsewhere too. This pins that the redesign
// changed none of them.
const HEADERS_ROOT_BLOCK = [
  "/*",
  "  TDM-Reservation: 1",
  "  Vary: Accept-Encoding",
  "  TDM-Policy: https://statcite.com/terms#reuse",
  "  X-Content-Type-Options: nosniff",
  "  Referrer-Policy: strict-origin-when-cross-origin",
  "  Strict-Transport-Security: max-age=31536000; includeSubDomains",
  "  Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' https://cloudflareinsights.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  "  X-Frame-Options: DENY",
].join("\n");

const headerBlock = (text: string, route: string) => {
  const lines = text.split(/\r?\n/);
  const at = lines.findIndex((l) => l === route);
  if (at < 0) return null;
  const out = [lines[at]];
  for (let i = at + 1; i < lines.length && /^\s+\S/.test(lines[i]); i++) out.push(lines[i]);
  return out.join("\n");
};

test("(c) site/_headers keeps the /* block byte-identical", () => {
  assert.equal(headerBlock(read("site/_headers"), "/*"), HEADERS_ROOT_BLOCK);
});

test("(c) site/_headers caches /assets/* and no longer claims all CSS and JS is inline", () => {
  const h = read("site/_headers");
  const assets = headerBlock(h, "/assets/*");
  assert.ok(assets, "site/_headers has no /assets/* block (the shared assets are cached for a day: Cache-Control: public, max-age=86400)");
  assert.match(assets, /^\s+Cache-Control:\s*public,\s*max-age=86400\s*$/m, `the /assets/* block does not set a one-day cache:\n${assets}`);
  assert.doesNotMatch(h, /all first-party CSS and JS is inline/i, "the _headers comment still says all CSS and JS is inline, which sc.css and sc.js made false");
  const fonts = headerBlock(h, "/fonts/*");
  assert.ok(fonts, "site/_headers has no /fonts/* block (hashed font files are cached for a year: Cache-Control: public, max-age=31536000, immutable)");
  assert.match(fonts, /^\s+Cache-Control:\s*public,\s*max-age=31536000,\s*immutable\s*$/m, `the /fonts/* block does not set a one-year immutable cache:\n${fonts}`);
});

// --- (d) sc.css loads nothing from another origin, and the fonts are what the record says -------

// Every url() in sc.css. A data: SVG is an inline mask (guard p reads its
// content), anything else must be a same-origin /fonts/ or /assets/ path.
const cssUrls = (css: string) =>
  [...css.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^'")\s]*))\s*\)/gi)].map((m) => ({ raw: m[0], u: (m[1] ?? m[2] ?? m[3]).trim() }));
const isDataSvg = (u: string) => /^data:image\/svg\+xml,/.test(u);

test("(d) every url() in sc.css is an inline SVG mask or a same-origin /fonts/ or /assets/ file that exists, and sc.css imports nothing", () => {
  const css = stripCssComments(read("site/assets/sc.css"));
  assert.doesNotMatch(css, /@import\b/i, "sc.css uses @import");
  const bad: string[] = [];
  let fontBytes = 0;
  const fontFiles = new Set<string>();
  for (const { raw, u: full } of cssUrls(css)) {
    if (isDataSvg(full)) continue;
    const u = full.replace(/[?#].*$/, "");
    if (!/^\/(fonts|assets)\/[^/]/.test(u)) {
      bad.push(`${raw.slice(0, 80)}: not a same-origin /fonts/ or /assets/ path`);
      continue;
    }
    const rel = `site${u}`;
    if (!existsSync(path.join(root, rel))) {
      bad.push(`${raw}: ${rel} does not exist`);
      continue;
    }
    if (/\.woff2?$/i.test(u)) {
      fontFiles.add(u);
      const s = size(rel);
      fontBytes += s;
      if (s > 30 * KB) bad.push(`${rel}: ${s} bytes, cap 30 KB`);
    }
  }
  assert.ok(fontBytes <= 100 * KB, `fonts total ${fontBytes} bytes, cap 100 KB`);
  assert.equal(fontFiles.size, 3, `sc.css references ${fontFiles.size} font files, the kit serves three: ${[...fontFiles].join(", ")}`);
  // Every @font-face is optional (no late swap can shift a view) and names one
  // of the kit families.
  const faces = [...css.matchAll(/@font-face\s*\{([^}]*)\}/g)].map((m) => m[1]);
  assert.equal(faces.length, 3, `sc.css declares ${faces.length} @font-face blocks, expected 3`);
  for (const f of faces) {
    if (!/font-display\s*:\s*optional/.test(f)) bad.push(`@font-face without font-display: optional: ${f.slice(0, 60)}`);
    if (!/font-family\s*:\s*"Orbit (?:Display|Serif|Mono)"/.test(f)) bad.push(`@font-face outside the kit families: ${f.slice(0, 60)}`);
  }
  // The serif is set only by the one rule `h1 em,.serif`, so a page uses it
  // exactly when its markup holds an em inside h1 or a .serif element. Any
  // other stylesheet reaching the serif would break that reading, so it is refused.
  const serifFace = faces.find((f) => /font-family\s*:\s*"Orbit Serif"/.test(f));
  const serifFile = serifFace && /url\(\s*["']?([^"')\s?#]+)/.exec(serifFace)?.[1];
  assert.ok(serifFile && fontFiles.has(serifFile), `the Orbit Serif @font-face does not name one of the served files: ${serifFile}`);
  for (const d of allDeclarations()) {
    if (!/--font-serif|Orbit Serif/.test(d.value) || d.prop === "--font-serif" || /^@font-face$/i.test(d.prelude)) continue;
    if (d.where !== "site/assets/sc.css" || d.prelude.replace(/\s+/g, "") !== "h1em,.serif") bad.push(`${d.where} ${d.prelude}: ${d.prop} sets the serif outside the "h1 em,.serif" rule, so the serif preload list cannot be read from markup`);
  }
  const usesSerif = (html: string) =>
    /\bclass="[^"]*\bserif\b/.test(html) || [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)].some((m) => /<em\b/i.test(m[1]));
  const serifPages: string[] = [];
  // Pages: every stylesheet, script and preload they pull is same-origin and
  // exists. Every page preloads the fonts sc.css references, less the serif on
  // a page that never sets it.
  for (const rel of PAGES()) {
    const html = read(rel);
    const preloaded = new Set<string>();
    for (const m of html.matchAll(/<(?:link|script)\b[^>]*\b(?:href|src)="([^"]+)"[^>]*>/gi)) {
      const tag = m[0];
      if (/^<link/i.test(tag) && !/\brel="(?:stylesheet|preload|modulepreload)"/i.test(tag)) continue;
      const u = m[1].replace(/[?#].*$/, "");
      if (!u.startsWith("/") || u.startsWith("//")) bad.push(`${rel}: ${tag} loads from another origin`);
      else if (!existsSync(path.join(root, `site${u}`))) bad.push(`${rel}: ${tag} points at a missing file`);
      if (/\brel="preload"/.test(tag) && /\bas="font"/.test(tag)) {
        preloaded.add(u);
        if (!/\btype="font\/woff2"/.test(tag) || !/\scrossorigin(\s|=|>)/.test(tag)) bad.push(`${rel}: font preload lacks type="font/woff2" or crossorigin: ${tag}`);
      }
    }
    const serif = usesSerif(html);
    if (serif) serifPages.push(rel);
    const want = [...fontFiles].filter((f) => serif || f !== serifFile).sort();
    const got = [...preloaded].sort();
    if (JSON.stringify(want) !== JSON.stringify(got)) bad.push(`${rel}: preloads [${got.join(", ")}] but should preload [${want.join(", ")}] (${serif ? "sets" : "never sets"} the serif)`);
  }
  // Both branches must be reached, or the rule above is not being exercised.
  assert.ok(serifPages.length >= 1 && serifPages.length < PAGES().length, `serif pages read as [${serifPages.join(", ")}], so the per-page preload rule is not being exercised`);
  assert.deepEqual(bad, [], bad.join("\n"));
});

// The per-file record in docs/design/FONTS.md, as rows of its tables: served
// file name with its size, and in the record table its SHA-256 too. Every row
// that names a file and a size is read, so the summary table is held to the
// bytes as well.
function fontsRecord() {
  const md = read("docs/design/FONTS.md");
  const rows = new Map<string, { sha?: string; bytes: number[] }>();
  for (const line of md.split(/\r?\n/)) {
    if (!line.startsWith("|")) continue;
    const cells = line.split("|").map((c) => c.trim());
    const file = cells.map((c) => /`(?:site\/fonts\/)?([\w.-]+\.woff2)`/.exec(c)?.[1]).find(Boolean);
    const sha = cells.map((c) => /^`([0-9a-f]{64})`$/.exec(c)?.[1]).find(Boolean);
    const bytes = cells.map((c) => /^(\d{1,3}(?:,\d{3})*) bytes$/.exec(c)?.[1]).find(Boolean);
    if (!file || !bytes) continue;
    const row = rows.get(file) ?? { bytes: [] };
    row.bytes.push(Number(bytes.replace(/,/g, "")));
    if (sha) {
      assert.ok(!row.sha, `FONTS.md records a SHA-256 for ${file} twice`);
      row.sha = sha;
    }
    rows.set(file, row);
  }
  return rows;
}

test("(d) every served font is recorded in FONTS.md with the SHA-256 and size of its bytes, and ships beside an OFL file", () => {
  const files = readdirSync(path.join(root, "site/fonts")).sort();
  const woff = files.filter((f) => /\.woff2$/.test(f));
  const ofl = files.filter((f) => /^OFL-[A-Za-z]+\.txt$/.test(f));
  assert.equal(woff.length, 3, `site/fonts holds ${woff.length} woff2 files: ${files.join(", ")}`);
  assert.equal(ofl.length, 3, `site/fonts holds ${ofl.length} OFL files, one per upstream family: ${files.join(", ")}`);
  for (const f of ofl) assert.match(read(`site/fonts/${f}`), /SIL Open Font License, Version 1\.1/, `${f} is not the OFL 1.1 text`);
  const record = fontsRecord();
  const problems: string[] = [];
  for (const f of woff) {
    const buf = readFileSync(path.join(root, `site/fonts/${f}`));
    const sha = createHash("sha256").update(buf).digest("hex");
    const row = record.get(f);
    if (!row) { problems.push(`${f}: no row in docs/design/FONTS.md`); continue; }
    if (!row.sha) problems.push(`${f}: no FONTS.md row carries its SHA-256`);
    else if (row.sha !== sha) problems.push(`${f}: FONTS.md records SHA-256 ${row.sha.slice(0, 12)}..., the file is ${sha.slice(0, 12)}...`);
    if (row.bytes.length < 2) problems.push(`${f}: FONTS.md gives its size ${row.bytes.length} times, the summary and the record should both carry it`);
    for (const b of row.bytes) if (b !== buf.length) problems.push(`${f}: FONTS.md records ${b} bytes, the file is ${buf.length}`);
    const stem = /^([a-z0-9-]+)\.([0-9a-f]{8})\.woff2$/.exec(f);
    if (!stem) problems.push(`${f}: not named <stem>.<8 hex of its SHA-256>.woff2`);
    else if (stem[2] !== sha.slice(0, 8)) problems.push(`${f}: the hash in the name is not the first 8 hex of its SHA-256 (${sha.slice(0, 8)})`);
  }
  for (const f of record.keys()) if (!woff.includes(f)) problems.push(`FONTS.md records ${f}, which is not in site/fonts`);
  assert.deepEqual(problems, [], problems.join("\n"));
});

// --- (e) no digit in decoration -------------------------------------------------

test("(e) decoration carries no digit and no text node", () => {
  const offences: string[] = [];
  let seen = 0;
  // Every attribute any stylesheet renders through attr() is checked, so a new
  // attr(data-x) cannot carry a figure past the fixed list.
  const rendered = new Set(["data-label", "data-tag", "data-t"]);
  for (const d of allDeclarations()) for (const m of d.value.matchAll(/attr\(\s*([\w-]+)/gi)) rendered.add(m[1].toLowerCase());
  for (const rel of PAGES()) {
    const html = read(rel);
    const deco = [...elementsWithClass(html, "orbit"), ...elementsWithClass(html, "ticker"), ...elementsWithClass(html, "sbar")];
    for (const [open, outer] of deco) {
      // A bar tag may name the API path it describes (sources.html carries
      // "LIVE FROM /v1/sources"). A route holds no figure, so "/v1" is the one
      // digit run allowed, and only on a bar.
      const isBar = /\bclass="[^"]*\bsbar\b/.test(open);
      for (const attr of rendered) {
        for (const v of attrValues(outer, attr)) {
          seen++;
          const checked = isBar ? v.replace(/\/v\d+\//g, "/") : v;
          if (/\d/.test(checked)) offences.push(`${rel}: ${attr}="${v}" holds a digit`);
        }
      }
      const text = outer.replace(/<[^>]*>/g, "").trim();
      if (text) offences.push(`${rel}: decoration holds a text node "${text.slice(0, 40)}"`);
      // A list item draws its own number marker with no CSS at all.
      const list = /<(ol|ul|li|menu)\b/i.exec(outer);
      if (list) offences.push(`${rel}: decoration holds a <${list[1]}>, whose marker can draw a number`);
    }
    for (const v of attrValues(html, "data-eyebrow")) if (/\d/.test(v)) offences.push(`${rel}: data-eyebrow="${v}" holds a digit`);
  }
  // 20 orbit cards x 2 + 24 ticker items + 16 bars x 2 + 4 stamps x 2 on 404.
  assert.ok(seen >= 80, `only ${seen} decorative attributes seen, so the sweep is not reading the decoration`);
  assert.deepEqual(offences, [], offences.join("\n"));
});

// Properties whose strings the browser draws as text.
const TEXT_PROPS = new Set(["content", "quotes", "list-style", "list-style-type", "symbols", "additive-symbols", "prefix", "suffix", "pad", "negative", "string-set"]);

test("(e) no stylesheet draws a digit from a string: content, quotes and counter strings hold none outside counter() and attr()", () => {
  const offences: string[] = [];
  let contents = 0;
  for (const d of allDeclarations()) {
    if (!TEXT_PROPS.has(d.prop)) continue;
    if (d.prop === "content") contents++;
    // counter(name[, style]) and attr(name) draw only what the markup or the
    // section count holds, which the HTML guard above already checks. Either
    // with any other argument (a fallback string, symbols()) is kept in, and so
    // is counters(), whose separator is a drawn string.
    const rest = d.value
      .replace(/\bcounter\(\s*[\w-]+\s*(?:,\s*[a-z-]+\s*)?\)/gi, " ")
      .replace(/\battr\(\s*[\w-]+\s*\)/gi, " ");
    const decoded = decodeCssEscapes(rest);
    if (/\p{N}/u.test(decoded.replace(/url\([^)]*\)/gi, " "))) offences.push(`${d.where} ${d.prelude}: ${d.prop}:${d.value} draws a digit`);
  }
  assert.ok(contents >= 10, `only ${contents} content declarations read, so the sweep is not reading sc.css`);
  assert.deepEqual(offences, [], offences.join("\n"));
});

// The last compound of each selector in a prelude (the element the rule styles),
// with any trailing ::before, ::after or ::marker dropped. Combinators inside
// :has(), :is() and the like are skipped.
function subjects(prelude: string): string[] {
  return splitTop(prelude, ",").map((sel) => {
    const s = sel.trim();
    let depth = 0;
    let start = 0;
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (c === "(" || c === "[") depth++;
      else if (c === ")" || c === "]") depth--;
      else if (depth === 0 && /[\s>+~]/.test(c)) start = i + 1;
    }
    return s.slice(start).replace(/::?(?:before|after|marker)$/i, "");
  });
}

// Classes that make up the decoration. A selector naming any of them, anywhere,
// styles the decoration or something inside it.
const DECO_CLASS = /\.(?:orbit|oc|ring|arcs|spin|bezel|glow|stamp|ticker(?:-[\w-]+)?|ruler|ticks|needle|progress|sbar)(?![\w-])/;
const COUNTER_PROPS = new Set(["counter-reset", "counter-set", "counter-increment"]);

test("(e) no counter starts at a set number outside the section bars, and no decoration draws a list marker", () => {
  const problems: string[] = [];
  let counters = 0;
  for (const d of allDeclarations()) {
    const where = `${d.where} ${d.prelude}: ${d.prop}:${d.value}`;
    const subs = d.block ? subjects(d.prelude) : ["(style attribute)"];
    if (COUNTER_PROPS.has(d.prop)) {
      counters++;
      // Every token after decoding must be a counter name or "none". An integer,
      // calc(), var() or reversed() can make a counter() draw any number.
      const tokens = splitTop(decodeCssEscapes(d.value).replace(/\s+/g, " ").trim(), " ").filter(Boolean);
      const literal = tokens.some((t) => !/^-?[a-zA-Z_][\w-]*$/.test(t));
      const sbarOrSection = d.block !== null && subs.every((s) => /^section(?![\w-])/i.test(s) || /\.sbar(?![\w-])/.test(s));
      if (literal && !sbarOrSection) problems.push(`${where} sets a counter to a literal value outside .sbar and section`);
    }
    if (d.prop === "display" && /list-item/i.test(d.value)) problems.push(`${where} makes a box a list item, whose marker can draw a number`);
    if ((d.prop === "list-style" || d.prop === "list-style-type") && !/^none$/i.test(d.value.trim())) {
      if (!d.block || DECO_CLASS.test(d.prelude)) problems.push(`${where} gives the decoration a list marker`);
      else {
        const nonList = subs.filter((s) => !/^(?:ol|ul|li|menu)(?![\w-])/i.test(s));
        if (nonList.length) problems.push(`${where} sets a list marker on ${nonList.join(", ")}, which may reach the decoration`);
      }
    }
    // counter() and counters() may be drawn only by the section bars.
    if (d.prop === "content" && /\bcounters?\(/i.test(d.value)) {
      const off = subs.filter((s) => !/\.sbar(?![\w-])/.test(s));
      if (!d.block || off.length) problems.push(`${where} draws a counter outside .sbar`);
    }
  }
  assert.ok(counters >= 2, `only ${counters} counter declarations read, so the sweep is not reading sc.css`);
  assert.deepEqual(problems, [], problems.join("\n"));
});

test("(e) sc.js writes no text node and no rendered attribute into the decoration", () => {
  const js = jsNoComments(read("site/assets/sc.js"));
  const problems: string[] = [];
  for (const re of [/\b(?:textContent|innerText|innerHTML|outerHTML|nodeValue)\s*\+?=(?!=)/, /insertAdjacent(?:HTML|Text)|createTextNode|document\.write|\.(?:append|prepend|before|after|replaceWith|replaceChildren)\(/, /\.dataset\s*\[/]) {
    const m = re.exec(js);
    if (m) problems.push(`sc.js writes text: "${m[0]}"`);
  }
  // Attribute writes are an allowlist. data-t (through put) feeds the needle's
  // per cent and section name, data-v the ruler ticks. Neither is orbit,
  // ticker or bar decoration.
  const ALLOWED_ATTRS = new Set(["aria-hidden", "aria-pressed", "data-v", "data-fam"]);
  for (const m of js.matchAll(/setAttribute\(\s*([^,]+),/g)) {
    const name = /^["']([\w-]+)["']$/.exec(m[1].trim())?.[1];
    if (!name || !ALLOWED_ATTRS.has(name)) problems.push(`sc.js sets attribute ${m[1].trim()}`);
  }
  for (const m of js.matchAll(/\.dataset\.(\w+)\s*=(?!=)/g)) if (m[1] !== "t") problems.push(`sc.js sets dataset.${m[1]}`);
  const putDef = /\bput\s*=\s*function\s*\(\s*(\w+)\s*,\s*(\w+)\s*\)\s*\{\s*(\w+)\.dataset\.t\s*=\s*(\w+)\s*;?\s*\}/.exec(js);
  if (!putDef || putDef[3] !== putDef[1] || putDef[4] !== putDef[2]) problems.push("sc.js put() no longer only sets dataset.t, so the dataset.t allowance needs revisiting");
  const dsT = [...js.matchAll(/\.dataset\.t\s*=(?!=)/g)].length;
  if (dsT !== 1) problems.push(`sc.js sets dataset.t ${dsT} times, only put() may`);
  for (const m of js.matchAll(/\bput\(\s*([^,]+),/g)) if (!["pc", "lb"].includes(m[1].trim())) problems.push(`sc.js calls put() on ${m[1].trim()}, only the needle's pc and lb may carry data-t`);
  for (const [v, cls] of [["pc", "pct"], ["lb", "label"]]) {
    if (!new RegExp(`\\b${v}\\s*=\\s*mk\\(\\s*["']span["']\\s*,\\s*["']${cls}["']\\s*,\\s*nd\\s*\\)`).test(js)) problems.push(`sc.js no longer builds ${v} as the needle's .${cls} span`);
  }
  assert.deepEqual(problems, [], problems.join("\n"));
});

// --- (f) chip registry ------------------------------------------------------------

// Short source names on orbit cards, mapped to the SOURCES id they stand for.
const SOURCE_CHIPS: Record<string, string> = {
  "World Bank": "worldbank",
  IMF: "imf_weo",
  ECB: "ecb_fx",
  BIS: "bis",
  ECCB: "eccb",
  CBB: "cbb",
  DBnomics: "dbnomics",
};

// The closed verdict set, read from the type the verifier returns, so a renamed
// verdict fails here instead of orbiting stale.
const VERDICTS = (() => {
  const src = readFileSync(path.join(checkoutRoot, "server/src/core/verify.ts"), "utf8");
  const m = /export type Verdict\s*=\s*([^;]+);/.exec(src);
  assert.ok(m, "export type Verdict not found in server/src/core/verify.ts");
  return new Set([...m[1].matchAll(/"([a-z_]+)"/g)].map((x) => x[1]));
})();

test("(f) every orbit label names a real indicator, source, tool, verdict or ISO3 code, and the ticker is exactly the tool list", () => {
  assert.ok(VERDICTS.has("match") && VERDICTS.has("cannot_verify") && VERDICTS.size === 4, `verdict set parsed wrong: ${[...VERDICTS].join(", ")}`);
  const indicatorKeys = new Set(INDICATORS.map((i) => i.key));
  const sourceIds = new Set(SOURCES.map((s) => s.id));
  const toolNames = new Set(TOOLS.map((t) => t.name));
  for (const [chip, id] of Object.entries(SOURCE_CHIPS)) assert.ok(sourceIds.has(id), `source chip ${chip} maps to ${id}, which is not in SOURCES`);
  const resolves = (label: string) => {
    if (indicatorKeys.has(label) || toolNames.has(label) || VERDICTS.has(label)) return true;
    if (Object.hasOwn(SOURCE_CHIPS, label)) return true;
    if (/^[A-Z]{3}$/.test(label)) {
      const c = resolveCountry(label, { strict: true });
      return !!c && c.iso3 === label && !c.unverified;
    }
    return false;
  };
  const unknown: string[] = [];
  let labels = 0;
  for (const rel of ["site/index.html", "site/404.html"]) {
    const orbits = elementsWithClass(read(rel), "orbit");
    assert.ok(orbits.length >= 1, `${rel} has no .orbit`);
    for (const [, outer] of orbits) {
      for (const label of attrValues(outer, "data-label")) {
        labels++;
        if (!resolves(label)) unknown.push(`${rel}: data-label="${label}"`);
      }
    }
  }
  assert.ok(labels >= 24, `only ${labels} orbit labels found (20 on index, 4 on 404)`);
  assert.deepEqual(unknown, [], `orbit labels that name nothing real:\n${unknown.join("\n")}`);

  const tickers = elementsWithClass(read("site/index.html"), "ticker");
  assert.equal(tickers.length, 1, "index.html should hold one .ticker");
  const items = attrValues(tickers[0][1], "data-t");
  const stray = items.filter((t) => !toolNames.has(t));
  assert.deepEqual(stray, [], `ticker items that are not tools: ${stray.join(", ")}`);
  assert.deepEqual([...new Set(items)].sort(), [...toolNames].sort(), "the ticker's tool set differs from TOOLS");
});

// --- (g) clockwise, pinned ------------------------------------------------------------

interface Arc { rx: number; ry: number; sweep: string }

// Every offset-path in a stylesheet, with the @media scope it sits in.
function offsetPaths(css: string) {
  const clean = stripCssComments(css);
  const blocks = cssBlocks(clean);
  const out: Array<{ selector: string; d: string; arcs: Arc[]; letters: number; scope: Block | null }> = [];
  for (const b of blocks) {
    if (b.children.length) continue; // declarations live in leaf blocks
    const body = clean.slice(b.open + 1, b.close);
    for (const m of body.matchAll(/offset-path\s*:\s*path\(\s*"([^"]*)"\s*\)/gi)) {
      const d = m[1];
      const arcs = [...d.matchAll(/\bA\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+0\s+0\s+(\d)\s/g)].map((a) => ({ rx: +a[1], ry: +a[2], sweep: a[3] }));
      let scope = b.parent;
      while (scope && !/^@media\b/i.test(scope.prelude)) scope = scope.parent;
      out.push({ selector: b.prelude, d, arcs, letters: (d.match(/[Aa]/g) ?? []).length, scope });
    }
  }
  return { clean, blocks, paths: out };
}

// The --ra-*/--rb-* values declared directly in a scope (not in a nested @media).
function ringTokens(clean: string, blocks: Block[], scope: Block | null) {
  const t: Record<string, number> = {};
  for (const b of blocks) {
    if (b.children.length) continue;
    let s = b.parent;
    while (s && !/^@media\b/i.test(s.prelude)) s = s.parent;
    if (s !== scope) continue;
    for (const m of clean.slice(b.open + 1, b.close).matchAll(/(--r[ab]-r[xy])\s*:\s*(\d+(?:\.\d+)?)px/g)) t[m[1]] = +m[2];
  }
  return t;
}

test("(g) the orbit turns clockwise: every arc has sweep-flag 1 and matches its ring's tokens", () => {
  const sources: Array<[string, string]> = [["site/assets/sc.css", read("site/assets/sc.css")]];
  for (const rel of PAGES()) for (const css of inlineStyles(read(rel))) if (/offset-path/.test(css)) sources.push([rel, css]);
  const problems: string[] = [];
  let scCssArcs = 0;
  for (const [rel, css] of sources) {
    const { clean, blocks, paths } = offsetPaths(css);
    for (const p of paths) {
      const where = `${rel} ${p.scope ? p.scope.prelude : "(base)"} ${p.selector}`;
      if (p.arcs.length !== p.letters || p.arcs.length === 0) problems.push(`${where}: path "${p.d}" has arc commands the clockwise check cannot read`);
      for (const a of p.arcs) if (a.sweep !== "1") problems.push(`${where}: sweep-flag ${a.sweep} turns the orbit anticlockwise`);
      if (rel === "site/assets/sc.css") scCssArcs += p.arcs.length;
      const ring = /data-ring=["']?b/.test(p.selector) ? "rb" : "ra";
      const tok = ringTokens(clean, blocks, p.scope);
      for (const a of p.arcs) {
        if (tok[`--${ring}-rx`] !== a.rx || tok[`--${ring}-ry`] !== a.ry)
          problems.push(`${where}: arc ${a.rx} ${a.ry} does not match --${ring}-rx/--${ring}-ry (${tok[`--${ring}-rx`]} ${tok[`--${ring}-ry`]}) in the same block`);
      }
    }
  }
  assert.ok(scCssArcs >= 12, `only ${scCssArcs} arc segments read in sc.css, expected at least 12`);
  assert.deepEqual(problems, [], problems.join("\n"));
});

test("(g) nothing reverses the clockwise motion: keyframes run forwards and nothing mirrors the orbit", () => {
  const css = stripCssComments(read("site/assets/sc.css"));
  const kf = (name: string) => {
    const m = new RegExp(`@keyframes\\s+${name}\\s*\\{`).exec(css);
    assert.ok(m, `@keyframes ${name} not found`);
    const blocks = cssBlocks(css);
    const b = blocks.find((x) => x.open === m.index + m[0].length - 1);
    assert.ok(b, `@keyframes ${name} block not parsed`);
    return css.slice(b.open + 1, b.close).replace(/\s+/g, "");
  };
  assert.equal(kf("orbit"), "from{offset-distance:0%}to{offset-distance:100%}", "the orbit keyframes no longer run 0% to 100%");
  assert.match(kf("spin"), /^to\{rotate:360deg\}$/, "the arc spin no longer turns +360deg (positive is clockwise)");
  assert.doesNotMatch(css, /animation-direction|\b(reverse|alternate|alternate-reverse)\b/, "an animation runs in reverse or alternates");
  assert.doesNotMatch(css, /scale(?:[XYZ]|3d)?\(\s*-|rotate[XY]\(\s*-?180deg/, "a mirror transform would flip the orbit's direction");
  for (const rel of ["site/index.html", "site/404.html"]) {
    for (const [, outer] of elementsWithClass(read(rel), "orbit")) {
      assert.doesNotMatch(outer, /\stransform="|scale\(\s*-/, `${rel}: a transform on the orbit markup could mirror its direction`);
    }
  }
});

// A mirror on .orbit, .ring, .oc or .arcs, or on any element that contains
// them (main, body, :root, a wrapper, *), reverses the visible direction. A
// selector cannot be traced to its ancestors statically, so every declaration
// the site ships is held to the forms that cannot mirror.
const ANGLE = String.raw`-?(?:\d+\.?\d*|\.\d+)(?:deg|rad|grad|turn)`;
const ROTATE_OK = new RegExp(String.raw`^(?:none|(?:z\s+)?${ANGLE}|${ANGLE}\s+z)$`, "i");
const SCALE_ARG_OK = /^[\s\d.,%]*$/; // no sign, no var(), calc() or env()
function transformProblems(value: string): string[] {
  const v = value.trim();
  if (/^none$/i.test(v)) return [];
  const out: string[] = [];
  let rest = v;
  for (const m of v.matchAll(/([a-zA-Z][\w-]*)\(((?:[^()]|\([^()]*\))*)\)/g)) {
    rest = rest.replace(m[0], " ");
    const fn = m[1].toLowerCase();
    const arg = m[2].trim();
    if (/^translate(?:x|y|z|3d)?$/.test(fn)) continue;
    if ((fn === "rotate" || fn === "rotatez") && (new RegExp(`^${ANGLE}$`, "i").test(arg) || /^var\(\s*--[\w-]+\s*\)$/.test(arg))) continue; // a 2D turn keeps handedness
    if (/^scale(?:x|y|z|3d)?$/.test(fn) && SCALE_ARG_OK.test(arg)) continue;
    out.push(`${m[0]} can mirror`);
  }
  if (rest.trim()) out.push(`"${rest.trim()}" is not a plain transform function list`);
  return out;
}

test("(g) no declaration, attribute or script mirrors the orbit or anything around it", () => {
  const problems: string[] = [];
  let read3 = 0;
  for (const d of allDeclarations()) {
    const where = `${d.where} ${d.prelude}: ${d.prop}:${d.value}`;
    if (d.prop === "scale" || d.prop === "-webkit-scale") {
      read3++;
      if (!/^none$/i.test(d.value) && !SCALE_ARG_OK.test(d.value)) problems.push(`${where} has a sign or a computed component and can mirror`);
    } else if (d.prop === "rotate") {
      read3++;
      if (!ROTATE_OK.test(d.value.trim())) problems.push(`${where} turns about another axis or a computed one and can mirror`);
    } else if (d.prop === "transform" || d.prop === "-webkit-transform") {
      read3++;
      for (const p of transformProblems(d.value)) problems.push(`${where}: ${p}`);
    } else if (d.prop === "offset-path" && !/^(?:none|path\(\s*"[^"]*"\s*\))$/i.test(d.value.trim())) {
      problems.push(`${where}: an offset-path the clockwise check cannot read`);
    }
  }
  assert.ok(read3 >= 6, `only ${read3} scale, rotate or transform declarations read, so the sweep is not reading the stylesheets`);
  for (const rel of PAGES()) {
    for (const m of read(rel).matchAll(/<[a-zA-Z][^>]*\s(?:transform|gradientTransform|patternTransform)\s*=[^>]*>/g)) problems.push(`${rel}: SVG transform attribute in ${m[0].slice(0, 80)}`);
  }
  const js = jsNoComments(read("site/assets/sc.js"));
  if (/\.style\s*\.\s*(?:scale|rotate|webkitTransform)\b|\.style\s*\[/.test(js)) problems.push("sc.js sets style.scale, style.rotate or a computed style property");
  for (const m of js.matchAll(/\.style\.transform\s*=\s*([^;]+)/g)) {
    if (!/^"(?:translateY|scaleX)\("\s*\+/.test(m[1].trim())) problems.push(`sc.js sets a transform that is not translateY() or scaleX(): ${m[1].trim().slice(0, 60)}`);
  }
  if (/scale(?:[XYZ]|3d)?\(\s*-|matrix|rotate(?:X|Y|3d)|perspective/i.test(js)) problems.push("sc.js holds a mirroring transform");
  // The one scaleX() it builds draws the scroll fraction, clamped to [0, 1].
  for (const m of js.matchAll(/"scaleX\("\s*\+\s*([^+;]+?)\s*(?:\+|;)/g)) if (!/^p\.toFixed\(4\)$/.test(m[1].trim())) problems.push(`sc.js scaleX() takes ${m[1].trim()}, not the clamped scroll fraction p`);
  if (!/\bp\s*=\s*cl\(/.test(js)) problems.push("sc.js no longer clamps p with cl()");
  assert.deepEqual(problems, [], problems.join("\n"));
});

// The arcs turn inside a square svg that a static `scale: 1 <ry/rx>` on its
// .spin wrapper flattens to the ring. A scale that drifts from its ring's tokens
// draws the arcs off the ring, so each one is pinned to the tokens declared in
// the same media scope, to four decimals. The rule lives only in sc.css.
test("(g) every .spin scale equals its ring's ry over rx at that breakpoint, and no page restates it inline", () => {
  const { clean, blocks } = offsetPaths(read("site/assets/sc.css"));
  const problems: string[] = [];
  const seen: string[] = [];
  for (const b of blocks) {
    if (b.children.length || !/\.spin(?![\w-])/.test(b.prelude)) continue;
    const body = clean.slice(b.open + 1, b.close);
    for (const m of body.matchAll(/(?<![-\w])scale\s*:\s*([^;}]+)/g)) {
      let scope = b.parent;
      while (scope && !/^@media\b/i.test(scope.prelude)) scope = scope.parent;
      const where = `${scope ? scope.prelude : "(base)"} ${b.prelude}`;
      const v = /^1\s+(\d*\.\d{4})$/.exec(m[1].trim());
      if (!v) { problems.push(`${where}: scale:${m[1].trim()} is not "1 <ry/rx to four decimals>"`); continue; }
      const ring = /data-ring=["']?b/.test(b.prelude) ? "rb" : "ra";
      const tok = ringTokens(clean, blocks, scope);
      const rx = tok[`--${ring}-rx`];
      const ry = tok[`--${ring}-ry`];
      if (rx === undefined || ry === undefined) { problems.push(`${where}: no --${ring}-rx/--${ring}-ry declared in the same scope`); continue; }
      const want = (ry / rx).toFixed(4);
      seen.push(`${where} ${ring} ${v[1]}`);
      if (Number(v[1]).toFixed(4) !== want) problems.push(`${where}: scale 1 ${v[1]} but --${ring}-ry/--${ring}-rx = ${ry}/${rx} = ${want}`);
    }
  }
  assert.ok(seen.length >= 6, `only ${seen.length} .spin scale declarations read, expected one per ring per breakpoint (6)`);
  for (const rel of PAGES()) {
    const html = read(rel);
    for (const css of inlineStyles(html)) {
      if (/\.spin(?![\w-])|\.arcs(?![\w-])/.test(css)) problems.push(`${rel}: an inline style restates .spin or .arcs, which sc.css owns`);
      for (const m of css.matchAll(/(?<![-\w])scale\s*:/g)) problems.push(`${rel}: inline scale declaration at "${css.slice(Math.max(0, (m.index ?? 0) - 30), (m.index ?? 0) + 20).replace(/\s+/g, " ")}"`);
    }
    // The composited markup on every orbit: arcs are an svg inside span.ring.spin,
    // never a <g> rotated inside the ring svg.
    for (const [, outer] of elementsWithClass(html, "orbit")) {
      if (/<g\b[^>]*\bclass="[^"]*\barcs\b/.test(outer)) problems.push(`${rel}: the orbit still rotates a <g class="arcs"> inside the ring svg`);
      const spins = [...outer.matchAll(/<span\b[^>]*\bclass="ring spin"[^>]*>\s*<svg\b[^>]*\bclass="arcs"/g)].length;
      const rings = [...outer.matchAll(/<svg\b[^>]*\bclass="ring"/g)].length;
      if (spins === 0 || spins !== rings) problems.push(`${rel}: ${rings} ring svgs but ${spins} span.ring.spin > svg.arcs wrappers`);
    }
  }
  assert.deepEqual(problems, [], problems.join("\n"));
});

// --- (h) every motion stops under reduced motion -------------------------------------

const MOTION_DECL = /(?<![-\w])(?:animation(?:-[a-z]+)*|transition(?:-[a-z]+)*)\s*:|scroll-behavior\s*:\s*smooth|@keyframes\b/gi;

test("(h) every animation, transition and smooth scroll in sc.css sits inside the no-preference block, and no page adds one inline", () => {
  const css = stripCssComments(read("site/assets/sc.css"));
  const blocks = cssBlocks(css);
  const safe = blocks.filter((b) => NO_PREF.test(b.prelude));
  assert.ok(safe.length >= 1, "sc.css has no @media (prefers-reduced-motion: no-preference) block");
  const outside: string[] = [];
  let found = 0;
  for (const m of css.matchAll(MOTION_DECL)) {
    found++;
    const at = m.index ?? 0;
    if (!safe.some((b) => b.open < at && at < b.close)) outside.push(`sc.css: "${css.slice(Math.max(0, at - 40), at + 40).replace(/\s+/g, " ")}"`);
  }
  assert.ok(found >= 8, `only ${found} motion declarations found, so the sweep is not reading sc.css`);
  for (const rel of PAGES()) {
    for (const s of inlineStyles(read(rel))) {
      for (const m of s.matchAll(MOTION_DECL)) outside.push(`${rel} inline style: "${m[0]}"`);
    }
  }
  assert.deepEqual(outside, [], `motion outside the reduced-motion guard:\n${outside.join("\n")}`);
});

test("(h) sc.js scrolls smoothly only when reduced motion is not requested, and animates nothing itself", () => {
  const js = read("site/assets/sc.js");
  const smooth = [...js.matchAll(/["']smooth["']/g)];
  assert.ok(smooth.length >= 1, "sc.js no longer mentions smooth scrolling, so this guard needs revisiting");
  for (const m of smooth) {
    const before = js.slice(Math.max(0, (m.index ?? 0) - 160), m.index);
    assert.match(before, /prefers-reduced-motion:\s*no-preference/, `sc.js asks for smooth scrolling without consulting prefers-reduced-motion: "...${before.slice(-80)}"`);
  }
  assert.doesNotMatch(js, /scrollBehavior|\.animate\(/, "sc.js sets scroll-behavior or runs a Web Animation outside the CSS guard");
  // Motion belongs to sc.css, inside the no-preference block. The script may
  // move the needle and the hairline per scroll event, but it names no
  // transition, animation or keyframe in any spelling (style.transition,
  // webkitTransition, animate(), getAnimations, KeyframeEffect), and it has no
  // route to write CSS around that check.
  const code = jsNoComments(js);
  const problems: string[] = [];
  for (const [re, what] of [
    [/transition/i, "a transition"],
    [/animat(?!ionFrame)/i, "an animation or animate()"],
    [/keyframe/i, "a keyframe"],
    [/\.style\s*\[|cssText|setProperty\s*\(|setAttribute\(\s*["']style["']/, "a computed or bulk style write"],
    // Object.assign(el.style, {...}) writes any property in one call, and a
    // bracket key built from strings hides the property name from the checks above.
    [/Object\s*\.\s*assign\s*\(\s*[^,)]*\bstyle\b/, "Object.assign onto a style object"],
    [/\[\s*["'`](?:transition|animation|webkitTransition|webkitAnimation)/i, "a bracketed transition or animation key"],
    [/\[\s*["'`]style["'`]\s*\]|\bstyle\s*\}\s*=/, "a style object reached by bracket or destructuring"],
    // Every .style use must name its property directly (.style.top), so the
    // object never escapes into a variable, an argument or a bracket.
    [/\.style(?!\s*\.\s*[a-zA-Z])/, "a style object used without a named property"],
    [/insertRule|adoptedStyleSheets|CSSStyleSheet|replaceSync|createElement\(\s*["'](?:style|link)["']|mk\(\s*["'](?:style|link)["']/, "a stylesheet it builds itself"],
  ] as Array<[RegExp, string]>) {
    const m = re.exec(code);
    if (m) problems.push(`sc.js holds ${what}: "${code.slice(Math.max(0, m.index - 30), m.index + 30).replace(/\s+/g, " ")}"`);
  }
  assert.deepEqual(problems, [], problems.join("\n"));
});

// --- (i) decoration is hidden from assistive technology and holds nothing focusable ----

test("(i) the orbit, ticker and every bar are aria-hidden, data-nosnippet and hold nothing focusable", () => {
  const problems: string[] = [];
  const counts: Record<string, number> = { orbit: 0, ticker: 0, sbar: 0 };
  for (const rel of PAGES()) {
    const html = read(rel);
    for (const cls of ["orbit", "ticker", "sbar"]) {
      for (const [open, outer] of elementsWithClass(html, cls)) {
        counts[cls]++;
        if (!/\saria-hidden="true"/.test(open)) problems.push(`${rel}: .${cls} lacks aria-hidden="true"`);
        if (!/\sdata-nosnippet(\s|=|>)/.test(open)) problems.push(`${rel}: .${cls} lacks data-nosnippet`);
        const inner = outer.slice(open.length);
        if (/<(a|button|input|select|textarea|h[1-6])\b|\stabindex=|\shref=|\scontenteditable/i.test(inner)) problems.push(`${rel}: .${cls} holds a link, control, heading or tab stop`);
      }
    }
    if (/<aside\b[^>]*\bclass="[^"]*\bruler\b/i.test(html) || /\bclass="[^"]*\bprogress\b/.test(html)) problems.push(`${rel}: the ruler or progress hairline is in the server HTML, it belongs to sc.js`);
  }
  assert.ok(counts.orbit >= 2 && counts.ticker >= 1 && counts.sbar >= 16, `decoration count looks wrong: ${JSON.stringify(counts)}`);
  const js = read("site/assets/sc.js");
  const hidden = (js.match(/setAttribute\(\s*["']aria-hidden["']\s*,\s*["']true["']\s*\)/g) ?? []).length;
  if (hidden < 2) problems.push(`sc.js sets aria-hidden="true" ${hidden} times, the ruler and the progress hairline both need it`);
  if (/tabindex|tabIndex|createElement\(\s*["'](a|button|input)["']|mk\(\s*["'](a|button|input)["']|\.href\s*=|\.focus\(/.test(js)) problems.push("sc.js builds something focusable inside the decoration");
  assert.deepEqual(problems, [], problems.join("\n"));
});

// --- (j) the pause control ------------------------------------------------------------

test("(j) index.html has the Pause motion checkbox and sc.css pauses on it without JavaScript", () => {
  const html = read("site/index.html");
  assert.match(html, /<input type="checkbox" id="motion"[^>]*>/, "the #motion checkbox is gone");
  const label = /<label for="motion">([\s\S]*?)<\/label>/.exec(html);
  assert.ok(label, "no <label for=\"motion\">");
  assert.equal(label[1].trim(), "Pause motion");
  const css = stripCssComments(read("site/assets/sc.css"));
  assert.match(css, /:has\(#motion:checked\)/, "sc.css no longer pauses on :has(#motion:checked)");
  const rule = /[^{}]*:has\(#motion:checked\)[^{}]*\{([^}]*)\}/.exec(css);
  assert.ok(rule && /animation-play-state\s*:\s*paused/.test(rule[1]), "the :has(#motion:checked) rule does not set animation-play-state: paused");
  for (const sel of [".oc", ".arcs", ".ticker-row"]) assert.ok(rule[0].includes(sel), `the pause rule does not reach ${sel}`);
});

// --- (k) the verifier script stays sandbox-safe ---------------------------------------

test("(k) one bare <script> holds try-form, and it touches no window, observer, frame or storage API", () => {
  for (const rel of PAGES()) {
    const bare = scripts(read(rel)).filter((s) => s.attrs === "");
    const verifier = bare.filter((s) => s.body.includes("try-form"));
    if (rel === "site/index.html") {
      assert.equal(verifier.length, 1, `index.html: ${verifier.length} bare <script> blocks mention try-form, the sandbox test needs exactly one`);
      const banned = ["window.", "matchMedia", "IntersectionObserver", "requestAnimationFrame", "localStorage"].filter((w) => verifier[0].body.includes(w));
      assert.deepEqual(banned, [], `the verifier script references ${banned.join(", ")}, which the security sandbox does not provide`);
      const head = bare.filter((s) => s.body.includes("sc-motion"));
      assert.equal(head.length, 1, "index.html should carry one inline head motion script");
      assert.ok(!head[0].body.includes("try-form"), "the head motion script mentions try-form");
      const headBanned = ["window.", "matchMedia", "IntersectionObserver", "requestAnimationFrame"].filter((w) => head[0].body.includes(w));
      assert.deepEqual(headBanned, [], `the head motion script references ${headBanned.join(", ")}`);
      assert.match(head[0].body.trim(), /^try\s*\{[\s\S]*\}\s*catch\s*\(/, "the head motion script is not wrapped in try/catch, and localStorage can throw");
      const firstWithForm = bare.findIndex((s) => s.body.includes("try-form"));
      assert.ok(bare.indexOf(head[0]) !== firstWithForm, "the head script would be taken for the verifier");
    } else {
      assert.equal(verifier.length, 0, `${rel}: a bare <script> mentions try-form`);
    }
  }
  assert.ok(!read("site/assets/sc.js").includes("try-form"), "sc.js mentions try-form");
});

// --- (l) em dashes in the new stylesheet and script -----------------------------------

test("(l) no em dash (literal, escaped or entity) and no \"quietly\" in any site .css or .js", () => {
  const files = walk("site").filter((f) => /\.(css|js|mjs)$/i.test(f));
  assert.ok(files.includes("site/assets/sc.css") && files.includes("site/assets/sc.js"), `sweep did not find sc.css and sc.js: ${files.join(", ")}`);
  const offences: string[] = [];
  for (const rel of files) {
    const text = read(rel);
    for (const m of text.matchAll(/—|\\u2014|&mdash;|&#8212;|&#x2014;/gi)) {
      const at = m.index ?? 0;
      offences.push(`${rel}: ...${text.slice(Math.max(0, at - 40), at + 20).replace(/\s+/g, " ")}...`);
    }
    if (/\bquietly\b/i.test(text)) offences.push(`${rel}: "quietly"`);
  }
  assert.deepEqual(offences, [], offences.join("\n"));
});

// --- (m) the live auditor reads the shared stylesheet ----------------------------------

test("(m) tools/audit-live.py checks inline-code wrapping across linked stylesheets, including sc.css", () => {
  const py = read("tools/audit-live.py").replace(/\r\n/g, "\n");
  const fn = (name: string) => {
    const m = new RegExp(`^def ${name}\\([^)]*\\):\\n([\\s\\S]*?)(?=^def |^if __name__|(?![\\s\\S]))`, "m").exec(py);
    assert.ok(m, `def ${name} not found in tools/audit-live.py`);
    return m[1];
  };
  const a11y = fn("audit_a11y");
  assert.doesNotMatch(a11y, /"code\{font-family" not in html/, "audit_a11y still skips any page whose own HTML lacks code{font-family");
  assert.match(a11y, /page_css\(/, "audit_a11y no longer reads the page's linked stylesheets");
  assert.match(a11y, /inline_code_wraps\(/, "audit_a11y no longer runs the inline-code wrap check");
  assert.match(a11y, /"\/assets\/sc\.css"/, "audit_a11y no longer checks that /assets/sc.css serves");
  assert.match(fn("page_css"), /stylesheet/, "page_css does not follow <link rel=stylesheet>");
  const wraps = fn("inline_code_wraps");
  assert.match(wraps, /anywhere/, "inline_code_wraps no longer requires overflow-wrap: anywhere");
  assert.match(wraps, /break-word/, "inline_code_wraps no longer accepts overflow-wrap: break-word");
});

// --- (n) text-transform reaches pseudo content only -------------------------------------

// innerText applies text-transform, so an upper-cased nav link, heading or
// table header changes the text crawlers and copy-paste read. Labels use
// font-variant-caps instead. Only ::before and ::after content, which innerText
// never holds, may be transformed.
test("(n) text-transform applies only to ::before and ::after content, and sc.js upper-cases nothing", () => {
  const problems: string[] = [];
  let seen = 0;
  for (const d of allDeclarations()) {
    if (d.prop !== "text-transform" && d.prop !== "-webkit-text-transform") continue;
    seen++;
    if (/^(?:none|initial|unset|revert|revert-layer)$/i.test(d.value.trim())) continue;
    if (!d.block || /^@/.test(d.prelude)) {
      problems.push(`${d.where}: text-transform:${d.value} outside a style rule`);
      continue;
    }
    const sels = splitTop(d.prelude, ",").map((s) => s.trim());
    const real = sels.filter((s) => !/::?(?:before|after)$/i.test(s));
    if (real.length) problems.push(`${d.where}: text-transform:${d.value} reaches real text through ${real.join(", ")}`);
  }
  assert.ok(seen >= 1, "no text-transform declaration read, so the sweep is not reading sc.css");
  const js = jsNoComments(read("site/assets/sc.js"));
  const m = /toUpperCase|toLocaleUpperCase|textTransform|text-transform/.exec(js);
  if (m) problems.push(`sc.js holds ${m[0]}, which changes real text`);
  assert.deepEqual(problems, [], problems.join("\n"));
});

// --- (o) short pages opt out of the ruler -------------------------------------------------

test("(o) privacy, terms and 404 carry data-ruler=\"off\", and sc.js returns before it builds the ruler or the hairline", () => {
  const problems: string[] = [];
  for (const rel of ["site/privacy.html", "site/terms.html", "site/404.html"]) {
    const body = /<body\b[^>]*>/i.exec(read(rel));
    if (!body) problems.push(`${rel}: no <body> tag`);
    else if (!/\sdata-ruler="off"/.test(body[0])) problems.push(`${rel}: ${body[0]} lacks data-ruler="off"`);
  }
  const js = jsNoComments(read("site/assets/sc.js"));
  assert.match(js, /\bvar\s+d\s*=\s*document\s*[,;]/, "sc.js no longer binds d to document");
  const optOut = /if\s*\(\s*(?:d|document)\.body\.dataset\.ruler\s*===?\s*["']off["']\s*\)\s*return\s*;/.exec(js);
  if (!optOut) {
    problems.push("sc.js has no top-level `if(d.body.dataset.ruler===\"off\")return;`");
  } else {
    // Brace depth at the opt-out must be the IIFE body's own (1), so the return
    // leaves the whole script and not a nested function.
    const flat = jsNoStrings(js).slice(0, optOut.index);
    const depth = (flat.match(/\{/g) ?? []).length - (flat.match(/\}/g) ?? []).length;
    if (depth !== 1) problems.push(`the ruler opt-out sits at brace depth ${depth}, so its return does not leave the script`);
    for (const [what, re] of [["the ruler", /mk\(\s*["']aside["']\s*,\s*["']ruler["']/], ["the hairline", /mk\(\s*["']div["']\s*,\s*["']progress["']/], ["the scroll listener", /addEventListener\(\s*["']scroll["']/]] as Array<[string, RegExp]>) {
      const at = re.exec(js);
      if (!at) problems.push(`sc.js no longer builds ${what} the way this guard reads it`);
      else if (at.index < optOut.index) problems.push(`sc.js builds ${what} before the ruler opt-out`);
    }
  }
  assert.deepEqual(problems, [], problems.join("\n"));
});

// --- (p) orbit glyphs are shapes only -------------------------------------------------------

// Each orbit card carries data-g naming a glyph that sc.css draws as a mask
// from an inline SVG. The SVG may hold shapes and nothing that draws text,
// loads a resource or runs script, so a glyph can never carry a figure, a flag
// or a logo fetched from elsewhere. No flag or logo artwork is allowed at all.
const SVG_SHAPE_TAGS = new Set(["svg", "path", "circle", "rect", "line", "polyline", "polygon", "ellipse", "g"]);

test("(p) every orbit data-g names a glyph sc.css defines, and every glyph is an inline SVG of plain shapes", () => {
  const css = stripCssComments(read("site/assets/sc.css"));
  const defined = new Map<string, string>();
  for (const m of css.matchAll(/\.oc\[data-g=([\w-]+)\]\s*\{\s*--glyph\s*:\s*url\(\s*"([^"]*)"\s*\)\s*\}/g)) {
    assert.ok(!defined.has(m[1]), `glyph ${m[1]} is defined twice`);
    defined.set(m[1], m[2]);
  }
  assert.ok(defined.size >= 8, `only ${defined.size} glyphs defined in sc.css, the orbit needs at least 8`);
  const problems: string[] = [];
  for (const [name, uri] of defined) {
    if (!isDataSvg(uri)) { problems.push(`glyph ${name}: not an inline data:image/svg+xml mask`); continue; }
    const svg = uri.slice("data:image/svg+xml,".length);
    if (/%[0-9a-f]{2}|&#|\\/i.test(svg)) problems.push(`glyph ${name}: holds an escape, so its content cannot be read as written`);
    for (const t of svg.matchAll(/<\/?([a-zA-Z][\w:-]*)/g)) if (!SVG_SHAPE_TAGS.has(t[1])) problems.push(`glyph ${name}: holds <${t[1]}>, which is not a plain shape`);
    if (/\b(?:href|src|url|style|on[a-z]+)\s*=/i.test(svg)) problems.push(`glyph ${name}: holds a reference, style or handler attribute`);
    if (/\bxmlns\s*=\s*'([^']*)'/.exec(svg)?.[1] !== "http://www.w3.org/2000/svg") problems.push(`glyph ${name}: xmlns is not the SVG namespace`);
    if (/http/.test(svg.replace("xmlns='http://www.w3.org/2000/svg'", ""))) problems.push(`glyph ${name}: holds a URL beyond the xmlns`);
    if (/>[^<]*[^\s<>][^<]*</.test(svg)) problems.push(`glyph ${name}: holds text between tags`);
  }
  // Every url() in sc.css that is a data: URI belongs to a --glyph rule.
  const glyphUris = new Set(defined.values());
  for (const { u } of cssUrls(css)) if (/^data:/i.test(u) && !glyphUris.has(u)) problems.push(`a data: url() outside the glyph rules: ${u.slice(0, 60)}`);
  // Every card names a defined glyph and holds the one empty <i> the mask paints.
  const used = new Set<string>();
  let cards = 0;
  for (const rel of ["site/index.html", "site/404.html"]) {
    for (const [, outer] of elementsWithClass(read(rel), "orbit")) {
      for (const m of outer.matchAll(/<span\b[^>]*\bclass="oc[^"]*"[^>]*>([\s\S]*?)<\/span>/g)) {
        cards++;
        const g = /\sdata-g="([^"]*)"/.exec(m[0])?.[1];
        if (!g) problems.push(`${rel}: a card has no data-g: ${m[0].slice(0, 80)}`);
        else if (!defined.has(g)) problems.push(`${rel}: data-g="${g}" names no glyph in sc.css`);
        else used.add(g);
        if (m[1] !== "<i></i>") problems.push(`${rel}: card body is "${m[1].slice(0, 40)}", expected one empty <i>`);
      }
      if (/<(?:img|svg|use|image|picture|object|embed)\b[^>]*\b(?:src|href|xlink:href)=/i.test(outer)) problems.push(`${rel}: the orbit pulls in artwork`);
    }
  }
  assert.ok(cards >= 24, `only ${cards} orbit cards read (20 on index, 4 on 404)`);
  for (const g of defined.keys()) if (!used.has(g)) problems.push(`glyph ${g} is defined in sc.css but no card uses it`);
  assert.deepEqual(problems, [], problems.join("\n"));
});

// The rule above reads glyphs from sc.css only, so a glyph set anywhere else
// would never be inspected: a percent-encoded --glyph in a card's style
// attribute, or a page <style> that redefines .oc[data-g=seal], could draw a
// figure. Glyphs and masks therefore live only in sc.css, and an orbit style
// attribute may hold nothing but the card order (--i, --m, --n as integers).
// Both sides are read after CSS escapes are decoded, so "\67" spells nothing past it.
const GLYPH_OR_MASK = /--glyph|(?<![\w-])(?:-webkit-)?mask(?:-[a-z-]+)?\s*:|\[\s*data-g\b/i;

test("(p) glyphs and masks are declared only in sc.css, and orbit style attributes hold only the card order", () => {
  const problems: string[] = [];
  const sc = decodeCssEscapes(stripCssComments(read("site/assets/sc.css")));
  const glyphRules = [...sc.matchAll(/\.oc\[data-g=[\w-]+\]\s*\{\s*--glyph\s*:/g)].length;
  const glyphDecls = [...sc.matchAll(/--glyph\s*:/g)].length;
  if (glyphDecls !== glyphRules) problems.push(`sc.css declares --glyph ${glyphDecls} times but holds ${glyphRules} .oc[data-g=...] glyph rules, so a glyph is set outside them`);
  for (const d of declarations("site/assets/sc.css", read("site/assets/sc.css"))) {
    if (/^(?:-webkit-)?mask(?:-[a-z-]+)?$/.test(d.prop) && d.prelude.replace(/\s+/g, "") !== ".oc>i") problems.push(`sc.css ${d.prelude}: ${d.prop} outside the one .oc>i mask rule`);
  }
  let attrs = 0;
  for (const rel of PAGES()) {
    const html = read(rel);
    for (const m of html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) {
      const css = decodeCssEscapes(stripCssComments(m[1]));
      const hit = GLYPH_OR_MASK.exec(css);
      if (hit) problems.push(`${rel} <style>: "${css.slice(Math.max(0, hit.index - 30), hit.index + 40).replace(/\s+/g, " ")}" sets a glyph or mask, which only sc.css may`);
    }
    for (const m of html.matchAll(/\sstyle="([^"]*)"/gi)) {
      const css = decodeCssEscapes(m[1]);
      if (GLYPH_OR_MASK.test(css)) problems.push(`${rel}: style="${m[1].slice(0, 60)}" sets a glyph or mask, which only sc.css may`);
    }
    for (const [, outer] of elementsWithClass(html, "orbit")) {
      for (const t of outer.matchAll(/<[a-zA-Z][^>]*>/g)) {
        const st = /\sstyle="([^"]*)"/i.exec(t[0]);
        if (!st) continue;
        attrs++;
        const css = decodeCssEscapes(st[1]);
        if (/--glyph|url\(/i.test(css)) problems.push(`${rel}: an orbit style attribute holds --glyph or url(): ${t[0].slice(0, 100)}`);
        else if (!/^\s*--[imn]\s*:\s*\d+\s*(?:;\s*--[imn]\s*:\s*\d+\s*)*;?\s*$/.test(st[1])) problems.push(`${rel}: an orbit style attribute holds more than --i, --m and --n: ${t[0].slice(0, 100)}`);
      }
    }
  }
  assert.ok(attrs >= 24, `only ${attrs} orbit style attributes read (20 on index, 4 on 404)`);
  assert.deepEqual(problems, [], problems.join("\n"));
});

// Elements in one stacking context paint in document order. A ring svg or
// .spin that comes after a card draws its line and comet arcs across the
// card's text, so every card must follow every ring. The outer ring's cards
// sit in their own .tilt after the inner ring's .spin for that reason.
test("(p) every orbit card paints after every ring svg and spin, the outer orbit leans, and each phone --m is unique", () => {
  const problems: string[] = [];
  let orbits = 0;
  // The base .oc rule sets the phone --n, which a card's inline --n may override.
  const baseN = declarations("site/assets/sc.css", read("site/assets/sc.css")).find((d) => d.block?.parent === null && d.prelude === ".oc" && d.prop === "--n");
  assert.ok(baseN && /^\d+$/.test(baseN.value), "the base .oc rule no longer sets --n to an integer");
  for (const rel of ["site/index.html", "site/404.html"]) {
    for (const [, outer] of elementsWithClass(read(rel), "orbit")) {
      orbits++;
      const rings = elementsWithClass(outer, "ring");
      const ringEnd = Math.max(...rings.map(([, r]) => outer.indexOf(r) + r.length));
      const cards = [...outer.matchAll(/<span\b[^>]*\bclass="oc\b[^"]*"[^>]*>/g)];
      if (rings.length < 2 || cards.length < 4) problems.push(`${rel}: read ${rings.length} rings and ${cards.length} cards, too few to judge the order`);
      for (const c of cards) if ((c.index ?? 0) < ringEnd) problems.push(`${rel}: card ${/data-label="([^"]*)"/.exec(c[0])?.[1]} comes before a ring svg or spin, which then paints over it`);
      // Everything on the outer ring sits inside a .tilt, so it leans with the ring.
      const ringB = [...outer.matchAll(/<[a-z]+\b[^>]*\sdata-ring="b"[^>]*>/g)].length;
      const tilted = elementsWithClass(outer, "tilt").reduce((n, [, t]) => n + [...t.matchAll(/<[a-z]+\b[^>]*\sdata-ring="b"[^>]*>/g)].length, 0);
      if (ringB !== tilted) problems.push(`${rel}: ${ringB} outer-ring elements but ${tilted} of them inside a .tilt`);
      // Phone order: each data-mobile card carries a unique --m, together 0 to N-1, with N the --n they run on.
      const ms: number[] = [];
      let n = Number(baseN.value);
      for (const c of cards) {
        const style = /\sstyle="([^"]*)"/.exec(c[0])?.[1] ?? "";
        const m = /--m\s*:\s*(\d+)/.exec(style);
        const inlineN = /--n\s*:\s*(\d+)/.exec(style);
        if (/\sdata-mobile(?:\s|=|>)/.test(c[0])) {
          if (!m) { problems.push(`${rel}: phone card without --m: ${c[0].slice(0, 90)}`); continue; }
          ms.push(Number(m[1]));
          if (inlineN) n = Number(inlineN[1]);
        } else if (m) problems.push(`${rel}: --m on a card that is not data-mobile: ${c[0].slice(0, 90)}`);
      }
      const dup = ms.filter((v, i) => ms.indexOf(v) !== i);
      if (dup.length) problems.push(`${rel}: phone --m ${[...new Set(dup)].join(", ")} used twice, so two cards sit on one spot`);
      const want = Array.from({ length: n }, (_, i) => i).join(",");
      if ([...ms].sort((a, b) => a - b).join(",") !== want) problems.push(`${rel}: phone --m values [${ms.join(", ")}] are not 0 to ${n - 1}, one per slot of --n ${n}`);
    }
  }
  assert.equal(orbits, 2, `read ${orbits} orbits, expected one on index and one on 404`);
  // The lean: in some media scope .tilt turns by a non-zero angle and the
  // outer cards turn back by the same angle, so their labels stay level.
  const { clean, blocks } = offsetPaths(read("site/assets/sc.css"));
  const rot = (b: Block) => /(?<![-\w])rotate\s*:\s*(-?\d*\.?\d+)deg/.exec(clean.slice(b.open + 1, b.close))?.[1];
  const scopeOf = (b: Block) => { let s = b.parent; while (s && !/^@media\b/i.test(s.prelude)) s = s.parent; return s; };
  const leans = blocks.filter((b) => !b.children.length && b.prelude === ".tilt" && rot(b) && Number(rot(b)) !== 0);
  if (!leans.length) problems.push("sc.css no longer turns .tilt, so the outer ring stops leaning");
  for (const t of leans) {
    const back = blocks.find((b) => !b.children.length && b.prelude === ".oc[data-ring=b]" && scopeOf(b) === scopeOf(t) && rot(b));
    if (!back || Number(rot(back)) !== -Number(rot(t))) problems.push(`sc.css turns .tilt by ${rot(t)}deg but .oc[data-ring=b] turns back by ${back ? rot(back) : "nothing"} in the same scope`);
  }
  assert.deepEqual(problems, [], problems.join("\n"));
});
