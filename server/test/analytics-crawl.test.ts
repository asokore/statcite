// Crawler user-agents are free text. On 7 to 11 September 2026, 86% to 95% of
// hits carrying AI-crawler user-agents went to paths the site does not serve,
// such as /.env and /firebase-credentials.json. tools/analytics.mjs therefore
// splits crawl hits by path, derives the served paths from the repository
// rather than a hand list, and keeps the old crawl field for continuity.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
const mod = await import("../../tools/analytics.mjs");

const GPT = "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.2; +https://openai.com/gptbot)";
const BING = "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)";

/** A throwaway repository shape: site files, a redirects file, and a rest.ts. */
function fixtureRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "statcite-crawl-"));
  mkdirSync(join(root, "site", ".well-known"), { recursive: true });
  mkdirSync(join(root, "server", "src"), { recursive: true });
  writeFileSync(join(root, "site", "index.html"), "x");
  writeFileSync(join(root, "site", "docs.html"), "x");
  writeFileSync(join(root, "site", "llms.txt"), "x");
  writeFileSync(join(root, "site", "_headers"), "x");
  writeFileSync(join(root, "site", ".well-known", "security.txt"), "x");
  writeFileSync(join(root, "site", "_redirects"), "# comment\r\n/benchmark /bench 301\r\n/faq /#faq 301\r\n");
  writeFileSync(
    join(root, "server", "src", "rest.ts"),
    'if (path === "/v1/sources") {}\nconst m = path.match(/^\\/v1\\/snapshot\\/([^/]+)$/);\n',
  );
  return root;
}

test("served paths are derived from site files, redirects and declared routes", () => {
  const root = fixtureRoot();
  try {
    const pub = mod.derivePublicPaths(root);
    for (const p of ["/", "/index.html", "/index", "/docs", "/docs.html", "/llms.txt", "/.well-known/security.txt", "/benchmark", "/faq", "/v1/sources"]) {
      assert.ok(pub.exact.has(p), `${p} should be a served path`);
    }
    assert.ok(!pub.exact.has("/_headers"), "config files beginning _ are not served");
    assert.ok(!pub.exact.has("/# comment") && ![...pub.exact].some((p: string) => p.startsWith("#")));
    assert.deepEqual(pub.prefixes, ["/v1/snapshot/"]);
    // A new page is covered the day it ships, with no list to update.
    writeFileSync(join(root, "site", "newpage.html"), "x");
    assert.ok(mod.derivePublicPaths(root).exact.has("/newpage"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the real repository's derived set covers the pages and routes that exist", () => {
  const pub = mod.derivePublicPaths();
  for (const p of ["/", "/docs", "/guide", "/sources", "/llms.txt", "/openapi.json", "/robots.txt", "/sitemap.xml", "/.well-known/security.txt", "/v1", "/v1/sources", "/v1/verify_claims", "/benchmark"]) {
    assert.ok(pub.exact.has(p), `${p} is served but not derived`);
  }
  assert.ok(pub.prefixes.includes("/v1/indicator/") && pub.prefixes.includes("/v1/snapshot/"), JSON.stringify(pub.prefixes));
  assert.equal(new Set(pub.prefixes).size, pub.prefixes.length, "prefixes are deduplicated");
});

test("a crawler user-agent on a path the site does not serve is a probe", () => {
  const root = fixtureRoot();
  try {
    const pub = mod.derivePublicPaths(root);
    const kind = (ua: string, path: string) => mod.siteRowKind(ua, path, pub);
    assert.equal(kind(GPT, "/llms.txt"), "ai");
    assert.equal(kind(GPT, "/docs"), "ai");
    assert.equal(kind(GPT, "/v1/snapshot/BRB"), "ai");
    assert.equal(kind(BING, "/"), "search");
    for (const probe of ["/.env", "/@fs/proc/self/environ", "/config/application.properties", "/firebase-credentials.json", "/wp-admin/setup-config.php"]) {
      assert.equal(kind(GPT, probe), "ai_probe", probe);
    }
    // A one-parameter route matches one segment only, so traversal is a probe.
    assert.equal(kind(GPT, "/v1/snapshot/x/../../.env"), "ai_probe");
    assert.equal(kind(GPT, "/v1/snapshot/"), "ai_probe");
    assert.equal(kind(GPT, "/docs.html.bak"), "ai_probe");
    assert.equal(kind("curl/8.0", "/.env"), null, "a non-crawler is neither");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("summariseSiteRows keeps crawl continuous and splits it into real and probe hits", () => {
  const root = fixtureRoot();
  try {
    const pub = mod.derivePublicPaths(root);
    const rows = [
      { count: 5, dimensions: { userAgent: GPT, clientRequestPath: "/llms.txt" } },
      { count: 3, dimensions: { userAgent: GPT, clientRequestPath: "/docs" } },
      { count: 40, dimensions: { userAgent: GPT, clientRequestPath: "/.env" } },
      { count: 2, dimensions: { userAgent: BING, clientRequestPath: "/" } },
      { count: 7, dimensions: { userAgent: BING, clientRequestPath: "/firebase-credentials.json" } },
      { count: 9, dimensions: { userAgent: "curl/8.0", clientRequestPath: "/docs" } },
      { count: 1, dimensions: { userAgent: "MyBot/1.0 GPTBot (+mailto:jane@example.org)", clientRequestPath: "/.git/config" } },
    ];
    const s = mod.summariseSiteRows(rows, 100, pub);
    assert.equal(s.crawl_schema, 2);
    assert.deepEqual(s.crawl_real, { ai: 8, search: 2 });
    assert.deepEqual(s.crawl_probes, { ai: 41, search: 7 });
    // Schema-1 meaning: every crawler-user-agent hit, whatever the path.
    assert.deepEqual(s.crawl, { ai: 49, search: 9 });
    assert.equal(s.crawl.ai, s.crawl_real.ai + s.crawl_probes.ai);
    assert.equal(s.crawl.search, s.crawl_real.search + s.crawl_probes.search);
    // Only served paths are ever stored.
    assert.deepEqual(s.crawl_paths, { "/llms.txt": 5, "/docs": 3, "/": 2 });
    assert.ok(!JSON.stringify(s).includes(".env") && !JSON.stringify(s).includes("firebase"), "probe paths must never be stored");
    // Every stored user-agent is scrubbed.
    assert.ok(!JSON.stringify(s.crawl_agents).includes("jane@example.org"), "user-agents must be scrubbed");
    assert.equal(s.site_rows_truncated, false);
    assert.equal(mod.summariseSiteRows(rows, rows.length, pub).site_rows_truncated, true, "reaching the limit is flagged");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("/privacy discloses the dimensions the site query reads, and it asks for no IP-like one", () => {
  const src = read("tools/analytics.mjs");
  const site = /const SITE = `([\s\S]*?)`;/.exec(src);
  assert.ok(site, "SITE query not found");
  const dims = site![1].split("dimensions{")[1] ?? "";
  assert.doesNotMatch(dims, /ip|address|asn|coloCode|clientCountry/i);
  const privacy = read("site/privacy.html");
  if (/clientRequestPath/.test(dims)) {
    assert.match(privacy, /by the page path/, "the site query reads request paths, so /privacy must say so");
    assert.match(privacy, /paths are not kept/, "/privacy must say probe paths are not kept");
  }
  assert.match(site![1], /limit:\$\{SITE_LIMIT\}/, "the site query uses the measured limit constant");
  assert.ok(mod.SITE_LIMIT >= 5000, "the limit must stay well above the measured 1,574 groups a day");
});
