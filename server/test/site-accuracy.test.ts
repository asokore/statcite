// Site accuracy guards: the public pages must say what is true, in whole sentences.
//
// Deliberately a separate file from docs-artifacts.test.ts so site-copy guards
// can be added without touching the tests other work depends on. Every guard
// here was mutation-tested when it was written: the thing it protects was
// broken on purpose, the test was seen to fail, and the break was reverted.
// No network.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repoRoot = path.resolve(fileURLToPath(new URL("../../", import.meta.url)));
const read = (rel: string) => readFileSync(path.join(repoRoot, rel), "utf8");
const sitePages = () =>
  readdirSync(path.join(repoRoot, "site"))
    .filter((f) => f.endsWith(".html"))
    .map((f) => `site/${f}`);

// --- em dashes and the fragments their removal left ------------------------
//
// House style bans the em dash. A 2026-08-14 writing pass removed 263 of them,
// but it replaced several with a full stop, which split one sentence into two
// fragments ("...memory. No tools, no retrieval?" and "IMF. A retrieval
// platform..."), and it renamed three ledger sources to "IMF. World Economic
// Outlook" and "European Central Bank. Euro foreign exchange...". A later page
// (/guide) then shipped four new em dashes because nothing checked. JSON-LD
// hid two more as JSON "\u2014" escapes, which no search for the character finds.

test("no em dash on any site page, literal, escaped or as an entity", () => {
  const pages = sitePages();
  assert.ok(pages.length >= 8, `page sweep looks too small to be real: ${pages.length}`);
  const offences: string[] = [];
  for (const rel of pages) {
    const text = read(rel);
    for (const m of text.matchAll(/\u2014|\\u2014|&mdash;|&#8212;|&#x2014;/gi)) {
      const at = m.index ?? 0;
      offences.push(`${rel}: ...${text.slice(Math.max(0, at - 50), at + 20).replace(/\s+/g, " ")}...`);
    }
  }
  assert.deepEqual(offences, [], `em dashes on the site:\n${offences.join("\n")}`);
});

test("ledger source names are one phrase, not two fragments", async () => {
  const { SOURCES } = await import("../src/core/sources.ts");
  assert.ok(SOURCES.length >= 8, `ledger looks too small to be real: ${SOURCES.length}`);
  // The first pattern is the shape "IMF. World Economic Outlook". It needs two
  // capitals before the stop, so "U.S. Treasury" and "St. Louis" pass. The
  // second catches the same break after an ordinary word, "Bank. Euro", which
  // the first cannot see. Three letters minimum keeps "St. Louis" legal.
  const patterns = [/\b[A-Z]{2,}\. [A-Z]/, /\b[A-Za-z]{3,}\. [A-Z]/];
  const offences = SOURCES.filter((s) => patterns.some((p) => p.test(s.name))).map((s) => `${s.id}: "${s.name}"`);
  assert.deepEqual(offences, [], `source names split into sentence fragments:\n${offences.join("\n")}`);
});

test("the /sources prerender carries every ledger name as the ledger states it", async () => {
  // gen-sources-prerender.py writes the names into static HTML for crawlers
  // that run no JavaScript. A renamed source that is not re-rendered leaves
  // the old name on the page those crawlers read.
  const { SOURCES } = await import("../src/core/sources.ts");
  const page = read("site/sources.html");
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  const missing = SOURCES.filter((s) => !page.includes(`<h3>${esc(s.name)}<span`)).map((s) => s.id);
  assert.deepEqual(missing, [], `site/sources.html prerender is stale for: ${missing.join(", ")}. Re-render it.`);
});

// --- the public changelog leads with the version the server reports -------
//
// On 2026-09-12 /docs#changelog opened with 1.11.3 while the server reported
// 1.12.1, two releases behind. The version is read from mcp.ts as text rather
// than imported, so this guard does not depend on the module graph behind it.

test("the /docs changelog opens with the SERVER_VERSION in mcp.ts", () => {
  const mcp = read("server/src/mcp.ts");
  const m = mcp.match(/export\s+const\s+SERVER_VERSION\s*=\s*"(\d+\.\d+\.\d+)"/);
  assert.ok(m, "could not read SERVER_VERSION from server/src/mcp.ts");
  const version = m[1];
  const docs = read("site/docs.html");
  const at = docs.indexOf('<h2 id="changelog">');
  assert.ok(at >= 0, 'site/docs.html has no <h2 id="changelog">');
  const first = docs.slice(at).match(/<li>\s*<strong>([^<]+)<\/strong>/);
  assert.ok(first, "no changelog entry found under #changelog");
  assert.equal(
    first[1].trim(),
    version,
    `the first /docs changelog entry is ${first[1]} but the server reports ${version}. Add the release to site/docs.html#changelog.`,
  );
});

// --- one nav, on every page, and it reaches Connect ------------------------
//
// Before 2026-09-12 the seven pages carried five different navs, /privacy and
// /terms had none, and not one linked to the connect instructions, which are
// the step that turns a visitor into a user. The Google verification file is
// not a page and is exempt.

const NAV = ["/guide", "/docs", "/bench", "/sources", "/#connect"];

function idsIn(html: string): Set<string> {
  return new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
}

test("every site page carries the one shared nav, ending in Connect", () => {
  const pages = sitePages().filter((p) => !/google[0-9a-f]+\.html$/.test(p));
  assert.ok(pages.length >= 8, `page sweep looks too small to be real: ${pages.length}`);
  const offences: string[] = [];
  for (const rel of pages) {
    const html = read(rel);
    const navs = [...html.matchAll(/<nav\b[^>]*>([\s\S]*?)<\/nav>/g)];
    if (navs.length !== 1) {
      offences.push(`${rel}: ${navs.length} <nav> elements, expected 1`);
      continue;
    }
    const links = navs[0][1].match(/<div class="links">([\s\S]*?)<\/div>/);
    const hrefs = links ? [...links[1].matchAll(/href="([^"]+)"/g)].map((m) => m[1]) : [];
    if (JSON.stringify(hrefs) !== JSON.stringify(NAV)) offences.push(`${rel}: nav links ${JSON.stringify(hrefs)}`);
    if (/llms(-full)?\.txt/.test(navs[0][1])) offences.push(`${rel}: llms.txt belongs in the footer, not the nav`);
  }
  assert.deepEqual(offences, [], `nav drift:\n${offences.join("\n")}`);
  assert.ok(idsIn(read("site/index.html")).has("connect"), "the nav links /#connect but index.html has no id=\"connect\"");
});

// --- the benchmark tables say which run they show, and when it was scored --

test("both benchmark tables are captioned with the R1 scoring date from the run itself", () => {
  const summary = JSON.parse(read("bench/runs/R1/scores/summary.json"));
  const d = new Date(summary.scored_at);
  assert.ok(!Number.isNaN(d.getTime()), `bench/runs/R1/scores/summary.json scored_at is not a date: ${summary.scored_at}`);
  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const expected = `Run 1, scored ${d.getUTCDate()} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  for (const rel of ["site/index.html", "site/bench.html"]) {
    const captions = [...read(rel).matchAll(/<caption>([^<]*)<\/caption>/g)].map((m) => m[1].trim());
    assert.ok(captions.includes(expected), `${rel}: no caption "${expected}" (found ${JSON.stringify(captions)})`);
  }
});

// --- redirects: only for paths the asset server handles, only to real targets

test("site/_redirects sends only asset-served paths, to pages and anchors that exist", () => {
  const rules = read("site/_redirects")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => l.split(/\s+/));
  assert.ok(rules.length >= 5, `expected at least 5 redirect rules, found ${rules.length}`);

  // A rule on a Worker-routed path never fires, because Workers Static Assets
  // does not apply _redirects to requests the Worker serves. Read the routing
  // list from the config rather than restating it here.
  const wrangler = read("server/wrangler.jsonc");
  const rwf = wrangler.match(/"run_worker_first"\s*:\s*\[([^\]]*)\]/);
  assert.ok(rwf, "could not read run_worker_first from server/wrangler.jsonc");
  const workerRoutes = [...rwf[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  const workerOwns = (p: string) =>
    workerRoutes.some((r) => (r.endsWith("/*") ? p.startsWith(r.slice(0, -1)) : p === r));

  const pageFor: Record<string, string> = { "/": "site/index.html" };
  const offences: string[] = [];
  for (const [from, to, code] of rules) {
    if (code !== "301") offences.push(`${from}: status ${code}, expected 301`);
    if (workerOwns(from)) offences.push(`${from}: the Worker routes this path, so the rule would never fire`);
    const [target, frag] = to.split("#");
    if (workerOwns(target)) continue; // a Worker route is a valid destination, e.g. /v1/status
    const rel = pageFor[target] ?? `site${target}.html`;
    let html: string;
    try {
      html = read(rel);
    } catch {
      offences.push(`${from} -> ${to}: no page at ${rel}`);
      continue;
    }
    if (frag && !idsIn(html).has(frag)) offences.push(`${from} -> ${to}: ${rel} has no id="${frag}"`);
  }
  assert.deepEqual(offences, [], `bad redirects:\n${offences.join("\n")}`);
});
