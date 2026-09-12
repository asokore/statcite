// Crawler user-agents are free text, and most "AI crawler" hits on this site
// were vulnerability probes. Only a successful hit on a public path counts as
// crawling, and /privacy must disclose the path dimension the script reads.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");

test("a crawler user-agent probing for vulnerabilities is not counted as crawling", async () => {
  const mod = await import("../../tools/analytics.mjs");
  const kind = mod.siteRowKind as (ua: string, path: string, status: number) => string | null;
  const GPT = "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.2; +https://openai.com/gptbot)";
  assert.equal(kind(GPT, "/llms.txt", 200), "ai");
  assert.equal(kind(GPT, "/docs", 200), "ai", "extensionless page paths are public");
  assert.equal(kind(GPT, "/v1/indicators", 200), "ai");
  assert.equal(kind(GPT, "/.well-known/security.txt", 200), "ai");
  assert.equal(kind(GPT, "/wp-admin/setup-config.php", 404), "ai_probe");
  assert.equal(kind(GPT, "/.env", 403), "ai_probe");
  assert.equal(kind(GPT, "/docs", 404), "ai_probe", "a failed hit is not a crawl, even on a real path");
  assert.equal(kind("Mozilla/5.0 (compatible; Googlebot/2.1)", "/", 200), "search");
  assert.equal(kind("curl/8.0", "/", 200), null);
});

test("/privacy discloses every dimension the site query reads", () => {
  const src = read("tools/analytics.mjs");
  const site = /const SITE = `([\s\S]*?)`;/.exec(src);
  assert.ok(site, "SITE query not found");
  const privacy = read("site/privacy.html");
  if (/clientRequestPath/.test(site![1].split("dimensions{")[1] ?? "")) {
    assert.match(privacy, /by the page path/, "the site query reads request paths, so /privacy must say so");
    assert.match(privacy, /paths are not kept/, "/privacy must say probe paths are not kept");
  }
  if (/edgeResponseStatus/.test(site![1])) assert.match(privacy, /response status/);
});

test("probe paths are never written, only counted", () => {
  const src = read("tools/analytics.mjs");
  const loop = src.slice(src.indexOf("const crawlProbes"), src.indexOf("console.log(`\\n  site crawl on"));
  assert.ok(loop.length > 100, "crawl loop not found");
  const start = loop.indexOf('if (k.endsWith("_probe"))');
  const end = loop.indexOf("continue;", start);
  assert.ok(start >= 0 && end > start, "probe branch not found");
  const probeBranch = loop.slice(start, end);
  assert.match(probeBranch, /crawlProbes\[k\]/, "the slice must be the probe branch itself");
  assert.doesNotMatch(probeBranch, /clientRequestPath|crawlPaths|crawlAgents/, "a probe branch must not record its path or user-agent");
});
