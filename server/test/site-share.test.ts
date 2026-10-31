// Share-layer guards: the per-page link cards, the 9:16 story renderer in
// site/assets/share.js, and the Share button wiring on every page.
//
// (a) every published page names its own card in og:image and twitter:image,
//     and the card on disk is a JPEG of 1200x630 inside the 300 KB budget.
// (b) share.js has a card for exactly the published pages, under the same slug.
// (c) every page loads share.js once, deferred, after sc.js.
// (d) share.js reaches no network, writes no HTML, and links out only to the
//     three share intents it names.
// (e) page-card copy carries no digit, the same rule as the orbit: a figure
//     baked into an image goes stale and nothing tests it.
// (f) the verifier hands its result to share.js inside a try, so the share
//     layer can never cost the visitor the verdict.
// (g) site/_headers caches /share/*.
// (h) the result card's number format never turns a returned value into a
//     different figure: no 0 for a small value, no 1,000m, no runaway digits.
// (i) only the Copy link button, or the phone story flow that needs the link
//     for a sticker, writes to the visitor's clipboard.
//
// Each guard was mutation-tested when written: the thing it protects was broken
// in a copy of the tree, this file was pointed at the copy with
// STATCITE_DESIGN_ROOT and seen to fail on the named test.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const checkoutRoot = path.resolve(fileURLToPath(new URL("../../", import.meta.url)));
const root = process.env.STATCITE_DESIGN_ROOT ? path.resolve(process.env.STATCITE_DESIGN_ROOT) : checkoutRoot;
const read = (rel: string) => readFileSync(path.join(root, rel), "utf8");

const PAGES = () =>
  readdirSync(path.join(root, "site"))
    .filter((f) => f.endsWith(".html") && !/^google[0-9a-f]+\.html$/.test(f))
    .sort();
const SHARED = () => PAGES().filter((f) => f !== "404.html");
const pathOf = (f: string) => (f === "index.html" ? "/" : "/" + f.replace(/\.html$/, ""));
const meta = (html: string, attr: string, name: string) =>
  [...html.matchAll(new RegExp(`<meta ${attr}="${name.replace(/[.:]/g, "\\$&")}" content="([^"]*)"`, "g"))].map((m) => m[1]);

// Slugs declared in share.js, keyed by page path: "/guide":{slug:"guide",...
const shareSlugs = () => {
  const js = read("site/assets/share.js");
  return new Map([...js.matchAll(/"(\/[a-z]*)":\{slug:"([a-z]+)"/g)].map((m) => [m[1], m[2]]));
};

// Width and height from a baseline or progressive JPEG start-of-frame marker.
const jpegSize = (b: Buffer): [number, number] | null => {
  if (b[0] !== 0xff || b[1] !== 0xd8) return null;
  for (let i = 2; i + 9 < b.length; ) {
    if (b[i] !== 0xff) return null;
    const m = b[i + 1], len = b.readUInt16BE(i + 2);
    if (m === 0xc0 || m === 0xc2) return [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)];
    i += 2 + len;
  }
  return null;
};

test("(a) every published page names its own 1200x630 JPEG card, under 300 KB", () => {
  const slugs = shareSlugs();
  for (const f of SHARED()) {
    const html = read(`site/${f}`), slug = slugs.get(pathOf(f));
    assert.ok(slug, `${f}: share.js has no card for ${pathOf(f)}`);
    const want = new RegExp(`^https://statcite\\.com/share/og-${slug}\\.jpg\\?v=\\d{8}[a-z]?$`);
    const og = meta(html, "property", "og:image"), tw = meta(html, "name", "twitter:image");
    assert.equal(og.length, 1, `${f}: ${og.length} og:image tags`);
    assert.match(og[0], want, `${f}: og:image is ${og[0]}`);
    assert.deepEqual(tw, og, `${f}: twitter:image differs from og:image`);
    assert.deepEqual(meta(html, "property", "og:image:type"), ["image/jpeg"], `${f}: og:image:type`);
    assert.deepEqual(meta(html, "property", "og:image:width"), ["1200"], `${f}: og:image:width`);
    assert.deepEqual(meta(html, "property", "og:image:height"), ["630"], `${f}: og:image:height`);
    assert.ok((meta(html, "property", "og:image:alt")[0] ?? "").trim(), `${f}: og:image:alt is empty`);
    const file = path.join(root, "site", "share", `og-${slug}.jpg`);
    assert.ok(existsSync(file), `${f}: site/share/og-${slug}.jpg does not exist`);
    const b = readFileSync(file);
    assert.deepEqual(jpegSize(b), [1200, 630], `og-${slug}.jpg is not a 1200x630 JPEG`);
    assert.ok(b.length <= 300 * 1024, `og-${slug}.jpg is ${b.length} bytes, budget 300 KB`);
  }
});

test("(b) share.js has a card for exactly the published pages", () => {
  const declared = [...shareSlugs().keys()].sort();
  assert.deepEqual(declared, SHARED().map(pathOf).sort());
  const slugs = [...shareSlugs().values()];
  assert.equal(new Set(slugs).size, slugs.length, "two pages share a slug");
});

test("(c) every page loads share.js once, deferred, after sc.js", () => {
  for (const f of PAGES()) {
    const html = read(`site/${f}`);
    const tags = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
    const share = tags.filter((t) => /\bsrc="\/assets\/share\.js\?v=\d{8}[a-z]?"/.test(t[1]));
    assert.equal(share.length, 1, `${f}: loads share.js ${share.length} times`);
    assert.match(share[0][1], /(^|\s)defer(\s|=|$)/, `${f}: share.js is not deferred`);
    assert.equal(share[0][2].trim(), "", `${f}: the share.js tag holds inline code`);
    const sc = tags.findIndex((t) => /\bsrc="\/assets\/sc\.js/.test(t[1]));
    assert.ok(sc >= 0 && tags.indexOf(share[0]) > sc, `${f}: share.js does not follow sc.js`);
  }
});

test("(d) share.js reaches no network, writes no HTML, and links out only to its three intents", () => {
  const js = read("site/assets/share.js").replace(/\/\*[\s\S]*?\*\//g, " ");
  for (const bad of ["fetch(", "XMLHttpRequest", "sendBeacon", "WebSocket", "EventSource", "import(", "innerHTML", "outerHTML", "insertAdjacentHTML", "document.write", "eval(", "new Function"]) {
    assert.ok(!js.includes(bad), `share.js uses ${bad}`);
  }
  const hosts = new Set([...js.matchAll(/https?:\/\/([a-z0-9.-]+)/gi)].map((m) => m[1].toLowerCase()));
  hosts.delete("www.w3.org"); // the SVG namespace inside the inline icon
  assert.deepEqual([...hosts].sort(), ["wa.me", "www.linkedin.com", "x.com"]);
  assert.ok(!/http:\/\/(?!www\.w3\.org)/.test(js), "share.js names a plain-http URL");
});

test("(e) page-card copy carries no digit", () => {
  const js = read("site/assets/share.js");
  const block = /var PAGES=\{([\s\S]*?)\n\};/.exec(js);
  assert.ok(block, "share.js no longer declares PAGES as one block");
  const strings = [...block[1].matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1]).filter((s) => !/^\/[a-z]*$/.test(s));
  assert.ok(strings.length > 20, `only ${strings.length} strings found in PAGES`);
  const offenders = strings.filter((s) => /\p{N}/u.test(s));
  assert.deepEqual(offenders, [], "a page card carries a figure");
});

test("(f) the verifier hands its result to share.js inside a try", () => {
  const html = read("site/index.html");
  const at = html.indexOf("'sc:verdict'");
  assert.ok(at > 0, "index.html no longer fires sc:verdict");
  const line = html.slice(html.lastIndexOf("\n", at), html.indexOf("\n", at));
  assert.match(line, /^\s*try\s*\{\s*document\.dispatchEvent\(new CustomEvent\('sc:verdict'.*\}\s*catch\s*\(e\)\s*\{\s*\}\s*$/, `unguarded dispatch: ${line.trim()}`);
});

test("(h) the result card never prints a figure the API did not return", () => {
  const src = /function num\(v\)\{[\s\S]*?\n\}/.exec(read("site/assets/share.js"));
  assert.ok(src, "share.js no longer defines num(v)");
  const num = new Function(`${src[0]};return num;`)() as (v: unknown) => string;
  const cases: [unknown, string][] = [
    [4.11633838374487, "4.12"], [4.1, "4.1"], [-3.456, "-3.46"], [117.1, "117.1"], [29.15, "29.15"],
    [0.0001, "0.0001"], [-0.004, "-0.004"], [0.123456, "0.123"], [-0, "0"], [0, "0"],
    [1234567, "1.23m"], [-2.5e9, "-2.5bn"], [1e21, "1.00e+21"], [999999999, "1bn"], [999999.999, "1m"],
    [1e-20, "1.00e-20"], [-5e-324, "-4.94e-324"], [null, "n/a"], [Number.NaN, "n/a"], [Infinity, "n/a"],
  ];
  for (const [v, want] of cases) assert.equal(num(v), want, `num(${String(v)})`);
});

test("(i) the clipboard is written only by Copy link, or on a phone where the story button needs the link", () => {
  const js = read("site/assets/share.js").replace(/\/\*[\s\S]*?\*\//g, " ");
  assert.equal((js.match(/clipboard\.writeText\(/g) || []).length, 1, "writeText outside the copy() helper");
  const calls = [...js.matchAll(/(.{0,60})\bcopy\(/g)].map((m) => m[1]).filter((pre) => !/function\s*$/.test(pre));
  assert.ok(calls.length >= 1, "copy() is never called");
  const bad = calls.filter((pre) => !/if\(files\)$/.test(pre) && !/els\.copy\.addEventListener\("click",function\(\)\{if\(cur\)$/.test(pre));
  assert.deepEqual(bad, [], "copy() runs somewhere a visitor did not ask for it");
  // files must mean this browser can share a file, not only that canShare exists.
  assert.match(js, /files=touch&&!!navigator\.canShare&&!!w\.File&&navigator\.canShare\(\{files:\[new File\(/, "files no longer probes canShare with a real File");
});

test("(g) site/_headers caches /share/*", () => {
  const h = read("site/_headers");
  assert.match(h, /^\/share\/\*\n  Cache-Control: public, max-age=\d+\n/m);
});
