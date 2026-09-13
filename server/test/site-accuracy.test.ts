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
import { spawnSync } from "node:child_process";
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

// The machine-readable files are published prose too: openapi.json feeds
// generated clients and GPT Actions, and llms.txt and llms-full.txt are what
// agents read. On 2026-09-12 openapi.json still carried 22 em dashes, all as
// JSON "\u2014" escapes that a search for the character itself cannot see.
test("no em dash in openapi.json or the llms files, literal, escaped or as an entity", () => {
  const files = [
    "site/openapi.json",
    ...readdirSync(path.join(repoRoot, "site")).filter((f) => /^llms.*\.txt$/.test(f)).map((f) => `site/${f}`),
  ];
  assert.ok(files.includes("site/llms.txt") && files.includes("site/llms-full.txt"), `llms files not found: ${files.join(", ")}`);
  const offences: string[] = [];
  for (const rel of files) {
    const text = read(rel);
    for (const m of text.matchAll(/\u2014|\\u2014|&mdash;|&#8212;|&#x2014;/gi)) {
      const at = m.index ?? 0;
      offences.push(`${rel}: ...${text.slice(Math.max(0, at - 50), at + 20).replace(/\s+/g, " ")}...`);
    }
  }
  assert.deepEqual(offences, [], `em dashes in machine-readable files:\n${offences.join("\n")}`);
});

// A 2026-08-14 writing pass replaced em dashes in the licence ledger with full
// stops, which left fragments such as "The current edition, verbatim edition
// label passed through unrewritten." Those strings are served at /v1/sources
// and prerendered into /sources. This holds every served ledger string to no
// em dash and none of the retired fragment openings.
test("ledger strings carry no em dash and none of the retired sentence fragments", async () => {
  const { SOURCES } = await import("../src/core/sources.ts");
  const retired = [
    /(^|\. )The current edition, verbatim edition label/,
    /(^|\. )A separate, more permissive regime/,
    /(^|\. )Disabled\. /,
    /(^|\. )Used ONLY by/,
    /(^|\. )Governed by the same/,
    /(^|\. )Verified by direct/,
    /(^|\. )Distinct from the/,
    /(^|\. )Includes Anguilla/,
    /(^|\. )Collected on a schedule/,
    /(^|\. )Recorded here on/,
  ];
  const offences: string[] = [];
  for (const s of SOURCES as Array<Record<string, unknown>>) {
    for (const [field, value] of Object.entries(s)) {
      if (typeof value !== "string") continue;
      if (/\u2014/.test(value)) offences.push(`${s.id}.${field}: em dash`);
      for (const re of retired) if (re.test(value)) offences.push(`${s.id}.${field}: fragment ${re}`);
    }
  }
  assert.deepEqual(offences, [], `ledger fragments:\n${offences.join("\n")}`);
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

// --- structured data --------------------------------------------------------
//
// JSON-LD is invisible on the page, so a broken block or a dangling reference
// ships unnoticed. /docs pointed its "about" at https://statcite.com/#app for
// weeks while no node on the site declared that @id.

function jsonLd(rel: string): any[] {
  const html = read(rel);
  return [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m, i) => {
    try {
      return JSON.parse(m[1]);
    } catch (e) {
      throw new Error(`${rel}: JSON-LD block ${i + 1} does not parse: ${(e as Error).message}`);
    }
  });
}

test("every JSON-LD block parses, and every @id reference resolves to a declared node", () => {
  const declared = new Set<string>();
  const referenced: string[] = [];
  const walk = (v: any, rel: string) => {
    if (Array.isArray(v)) return v.forEach((x) => walk(x, rel));
    if (!v || typeof v !== "object") return;
    if (typeof v["@id"] === "string") {
      const keys = Object.keys(v).filter((k) => k !== "@id" && k !== "@type");
      if (keys.length) declared.add(v["@id"]);
      else referenced.push(`${rel} -> ${v["@id"]}`);
    }
    Object.values(v).forEach((x) => walk(x, rel));
  };
  let blocks = 0;
  for (const rel of sitePages()) {
    for (const b of jsonLd(rel)) {
      blocks++;
      walk(b, rel);
    }
  }
  assert.ok(blocks >= 7, `found only ${blocks} JSON-LD blocks, expected one per content page at least`);
  const dangling = referenced.filter((r) => !declared.has(r.split(" -> ")[1]));
  assert.deepEqual(dangling, [], `JSON-LD references to an @id no page declares:\n${dangling.join("\n")}`);
});

test("homepage Organization: one @id, referenced by WebSite, sameAs only from the listings block", () => {
  const html = read("site/index.html");
  const graph = jsonLd("site/index.html").flatMap((b) => b["@graph"] ?? [b]);
  const org = graph.find((n) => n["@type"] === "Organization" && n["@id"] === "https://statcite.com/#org");
  assert.ok(org, "no Organization node with @id https://statcite.com/#org");
  const site = graph.find((n) => n["@type"] === "WebSite");
  assert.equal(site?.publisher?.["@id"], org["@id"], "WebSite.publisher must reference the Organization @id");
  assert.deepEqual(org.alternateName, ["StatCite MCP server", "StatCite API"]);

  // sameAs asserts identity, so every URL in it must be a profile the page
  // itself shows a reader in "Where StatCite is listed".
  const block = html.match(/<div id="listings"[\s\S]*?<\/div>/);
  assert.ok(block, "homepage has no #listings block");
  const listed = new Set([...block[0].matchAll(/href="(https?:\/\/[^"]+)"/g)].map((m) => m[1]));
  assert.ok(Array.isArray(org.sameAs) && org.sameAs.length >= 3, "Organization.sameAs is missing or too short");
  const unlisted = org.sameAs.filter((u: string) => !listed.has(u));
  assert.deepEqual(unlisted, [], `sameAs URLs not shown in #listings: ${unlisted.join(", ")}`);
  assert.ok(org.sameAs.includes("https://github.com/asokore/statcite"), "sameAs must include the GitHub repository");
});

test("no structured data on any page names a person or a ministry", () => {
  // sameAs and other JSON-LD fields are how search engines link entities, so
  // a profile URL whose slug carries a personal name ties the product to a
  // person. tools/audit-live.py checks the live homepage for the same terms;
  // this catches it before deploy, on every page.
  const pages = readdirSync(new URL("../../site/", import.meta.url)).filter((f: string) => f.endsWith(".html"));
  for (const page of pages) {
    const html = read(`site/${page}`);
    const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1].toLowerCase());
    for (const b of blocks) {
      assert.ok(!b.includes("beckles") && !b.includes("ministry"), `${page}: JSON-LD names a person or a ministry`);
    }
  }
});

test("the visible FAQ and the FAQPage JSON-LD ask the same questions, including the arXiv one", () => {
  const html = read("site/index.html");
  const section = html.match(/<section id="faq">([\s\S]*?)<\/section>/);
  assert.ok(section, "homepage has no #faq section");
  const visible = [...section[1].matchAll(/<summary>([^<]+)<\/summary>/g)].map((m) => m[1].replace(/&amp;/g, "&").trim());
  const graph = jsonLd("site/index.html").flatMap((b) => b["@graph"] ?? [b]);
  const faq = graph.find((n) => n["@type"] === "FAQPage");
  const structured = (faq?.mainEntity ?? []).map((q: any) => String(q.name).trim());
  assert.deepEqual([...visible].sort(), [...structured].sort(), "visible FAQ and FAQPage JSON-LD have drifted apart");
  assert.ok(visible.includes("Is StatCite related to the StatCite dataset on arXiv?"), "the arXiv disambiguation question is missing");
});

// --- the privacy page describes what tools/analytics.mjs actually does ----
//
// Until 2026-09-12 /privacy said Cloudflare's logs were not analysed and that
// user agents were not kept, while tools/analytics.mjs read Cloudflare
// analytics grouped by user-agent and wrote the top strings to a local file.
// The page now says so. These tests hold the code to the page's two promises:
// no IP address is ever requested, and email-shaped text never survives into
// a stored user-agent string.

test("analytics.mjs requests no IP dimension, as /privacy promises", () => {
  const privacy = read("site/privacy.html");
  assert.match(privacy, /We never read or keep IP addresses\./, "the promise this test protects is no longer on /privacy");
  assert.match(privacy, /grouped by user-agent string/, "/privacy must say analytics are grouped by user-agent string");
  const src = read("tools/analytics.mjs");
  const dims = [...src.matchAll(/dimensions\{([^}]*)\}/g)].map((m) => m[1]);
  assert.ok(dims.length >= 3, `expected the GraphQL queries' dimension lists, found ${dims.length}`);
  const ipish = dims.filter((d) => /ip|address|asn|coloCode|clientCountry/i.test(d));
  assert.deepEqual(ipish, [], `analytics.mjs requests dimensions /privacy does not disclose: ${ipish.join(" | ")}`);
});

test("analytics.mjs strips email addresses from user-agent strings before keeping them", async () => {
  const mod = await import("../../tools/analytics.mjs");
  const scrub = mod.scrubUserAgent as (ua: unknown) => string;
  assert.equal(
    scrub("Mozilla/5.0 (compatible; Bytespider; spider-feedback@bytedance.com)"),
    "Mozilla/5.0 (compatible; Bytespider; [email])",
  );
  assert.equal(scrub("MyBot/1.0 (+mailto:jane.doe+bots@mail.example.co.uk)"), "MyBot/1.0 (+mailto:[email])");
  assert.equal(scrub("Claude-User"), "Claude-User", "an ordinary user-agent must pass through unchanged");
  assert.equal(scrub("node"), "node");
  assert.equal(scrub(undefined), "");
  // Every place a user-agent is cut down for output must go through the scrub,
  // or the one unscrubbed path is where an address gets written to disk.
  const src = read("tools/analytics.mjs");
  const cuts = [...src.matchAll(/^.*userAgent.*\.slice\(0,\s*44\).*$/gm)].map((m) => m[0].trim());
  assert.ok(cuts.length >= 2, `expected at least two truncated user-agent outputs, found ${cuts.length}`);
  const raw = cuts.filter((l) => !l.includes("scrubUserAgent("));
  assert.deepEqual(raw, [], `user-agent strings kept without scrubbing:\n${raw.join("\n")}`);
});

// --- sitemap lastmod dates match git history -------------------------------
//
// gen-sitemap.py derives each <lastmod> from the last commit touching the
// page. On 2026-09-12 the committed sitemap said /docs was last modified on
// 2 September and openapi.json on 31 August, while both had changed since.
// A lastmod that lies is worse than none, so the check runs here. It needs
// Python and full git history: CI's shallow checkout has neither the dates
// nor, sometimes, python on PATH, and there the test skips rather than lies.

function sitemapCheckEnvironment(): { python: string } | { skip: string } {
  const git = spawnSync("git", ["rev-parse", "--is-shallow-repository"], { cwd: repoRoot, encoding: "utf8" });
  if (git.error || git.status !== 0) return { skip: "git is unavailable or this is not a git checkout" };
  if (git.stdout.trim() === "true") return { skip: "shallow clone: commit dates are not the real history" };
  for (const python of ["python", "python3"]) {
    const v = spawnSync(python, ["--version"], { encoding: "utf8" });
    if (!v.error && v.status === 0) return { python };
  }
  return { skip: "python is not on PATH" };
}

test("site/sitemap.xml lastmod dates match git history (gen-sitemap.py --check)", (t) => {
  const env = sitemapCheckEnvironment();
  if ("skip" in env) {
    t.skip(env.skip);
    return;
  }
  const r = spawnSync(env.python, [path.join(repoRoot, "tools", "gen-sitemap.py"), "--check"], {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: 60_000,
  });
  assert.ok(!r.error, `could not run gen-sitemap.py: ${r.error?.message}`);
  assert.equal(r.status, 0, `site/sitemap.xml is stale. Run python tools/gen-sitemap.py and commit it.\n${r.stderr}`);
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
