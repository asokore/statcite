#!/usr/bin/env node
// Traffic snapshot for statcite.com.
//
// WHY THIS EXISTS. Cloudflare's free plan keeps only 30 days of daily rollups and
// SEVEN DAYS of the request-level detail that says WHO is calling. That detail is
// the only thing that separates "1,500 agent calls a day" from "1,500 liveness
// pings a day", and it is deleted before any change we make could be judged
// against it. Without a local record, every growth question restarts from zero
// and no experiment can ever be evaluated.
//
// So: append a dated snapshot, never overwrite one. The file becomes the history
// Cloudflare will not keep.
//
//   node tools/analytics.mjs              # last 30 days + today's caller mix
//   node tools/analytics.mjs --days 7
//   node tools/analytics.mjs --date 2026-08-12
//
// OUTPUT GOES TO A GITIGNORED PATH. This repo is public. Traffic figures are not
// covered by the publication boundary, but publishing them is a business
// decision and not one a scheduled script should make by default.

import { readFileSync, existsSync, mkdirSync, appendFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const ZONE = "9d183b85f315b73cc41ff0059caac168"; // statcite.com
const GQL = "https://api.cloudflare.com/client/v4/graphql";
const OUT = join(process.cwd(), "analytics");

// --- credentials -----------------------------------------------------------
//
// Reuses wrangler's own OAuth token rather than asking for a second credential.
// It is already on this machine, already scoped to this account, and already
// refreshed by wrangler. A separate API token would be one more secret to leak.

function token() {
  if (process.env.CLOUDFLARE_API_TOKEN) return process.env.CLOUDFLARE_API_TOKEN;
  const roots = [
    join(homedir(), "AppData", "Roaming", "xdg.config", ".wrangler", "config"),
    join(homedir(), ".wrangler", "config"),
    join(homedir(), ".config", ".wrangler", "config"),
  ];
  for (const dir of roots) {
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".toml"))) {
      const m = readFileSync(join(dir, f), "utf8").match(/^oauth_token\s*=\s*"([^"]+)"/m);
      if (m) return m[1];
    }
  }
  throw new Error(
    "No Cloudflare credential. Run `npx wrangler login`, or set CLOUDFLARE_API_TOKEN.",
  );
}

async function gql(query, variables = {}) {
  const r = await fetch(GQL, {
    method: "POST",
    headers: { authorization: `Bearer ${token()}`, "content-type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const j = await r.json();
  if (j.errors?.length) throw new Error(`Cloudflare: ${j.errors[0].message}`);
  return j.data;
}

// --- who is calling --------------------------------------------------------
//
// The single most important distinction in this whole file. A liveness prober
// and a person asking Claude for Barbados inflation both arrive as one POST to
// /mcp, and counting them together would turn a monitoring artefact into a
// growth story. Every bucket below was read off a real user-agent string in the
// logs on 2026-08-13, not guessed.

const USER_DRIVEN = [
  /^Claude-User/i, // Anthropic, user-initiated
  /^claude-code\//i,
  /codex-mcp-client/i, // OpenAI Codex
  /^Cursor/i,
  /^Windsurf/i,
  /ChatGPT/i,
  /^Claude-Web/i,
];

// Self-declared robots. Most name themselves honestly in the UA, which is the
// only reason this classification is possible at all.
const AUTOMATED = [
  /liveness/i, /health/i, /uptime/i, /monitor/i, /probe/i,
  /mcpbeat/i, /sentineloracle/i, /mcpwatch/i, /mcpwitness/i,
  /registry/i, /crawler/i, /bot\b/i, /research/i, /spike/i, /scanner/i,
];

export function classify(ua) {
  const s = ua || "";
  if (!s) return "unknown";
  if (USER_DRIVEN.some((r) => r.test(s))) return "user";
  if (AUTOMATED.some((r) => r.test(s))) return "automated";
  // Bare runtime strings (node, undici, python-httpx, Go-http-client, Bun) are
  // genuinely ambiguous: a self-hosted agent and a scraper look identical. They
  // are reported separately rather than being quietly credited as users.
  if (/^(node|undici|python-(httpx|requests)|Go-http-client|Bun|curl|axios|okhttp)/i.test(s)) return "ambiguous";
  return "other";
}

// --- queries ---------------------------------------------------------------

// --- who is CRAWLING (as opposed to calling) -------------------------------
//
// The single most surprising number this tool produces. On 2026-08-12 the site
// paths were crawled ~300 times by AI crawlers and FIVE times by conventional
// search engines (Googlebot 3, bingbot 2). StatCite is an AI-native property
// whose search presence is close to nil, and any growth plan that treats it as
// a normal website optimising for Google is optimising for 1.6% of its crawl
// budget. Tracked over time so that ratio stays honest.

const SEARCH_CRAWLERS = /googlebot|bingbot|slurp|duckduckbot|yandex|baidu|applebot|petalbot|seznam/i;
const AI_CRAWLERS = /gptbot|oai-searchbot|chatgpt-user|claudebot|claude-web|anthropic|perplexity|google-extended|amazonbot|amzn-searchbot|bytespider|meta-external|ccbot|cohere|diffbot|youbot/i;

export function crawlerKind(ua) {
  const s = ua || "";
  if (SEARCH_CRAWLERS.test(s)) return "search";
  if (AI_CRAWLERS.test(s)) return "ai";
  return null;
}

const DAILY = `query($zone:String!,$since:Date!,$until:Date!){
  viewer{zones(filter:{zoneTag:$zone}){
    httpRequests1dGroups(limit:60,filter:{date_geq:$since,date_leq:$until},orderBy:[date_ASC]){
      dimensions{date} sum{requests pageViews bytes cachedRequests} uniq{uniques}}}}}`;

// TWO queries, deliberately, and this is not a style choice.
//
// A single query over all paths ordered by count truncates: /mcp alone produces
// thousands of requests across dozens of user-agents, so at limit 100 the entire
// site-path population falls off the end. The first version of this file did
// exactly that and reported 8 AI crawler hits on a day that actually saw ~300,
// which would have inverted the one conclusion this tool exists to support.
// Filtering each population server-side is the only way to sample both honestly.

const CALLERS = `query($zone:String!,$from:Time!,$to:Time!){
  viewer{zones(filter:{zoneTag:$zone}){
    httpRequestsAdaptiveGroups(limit:100,filter:{datetime_geq:$from,datetime_lt:$to,clientRequestPath:"/mcp"},orderBy:[count_DESC]){
      count dimensions{userAgent edgeResponseStatus}}}}}`;

const SITE = `query($zone:String!,$from:Time!,$to:Time!){
  viewer{zones(filter:{zoneTag:$zone}){
    httpRequestsAdaptiveGroups(limit:100,filter:{datetime_geq:$from,datetime_lt:$to,clientRequestPath_neq:"/mcp"},orderBy:[count_DESC]){
      count dimensions{userAgent}}}}}`;

const iso = (d) => d.toISOString().slice(0, 10);
const daysAgo = (n) => { const d = new Date(); d.setUTCDate(d.getUTCDate() - n); return iso(d); };

// --- main ------------------------------------------------------------------

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };

const days = Number(arg("days", "30"));
const day = arg("date", daysAgo(1)); // yesterday: today is still accumulating

const daily = (await gql(DAILY, { zone: ZONE, since: daysAgo(days), until: iso(new Date()) }))
  .viewer.zones[0].httpRequests1dGroups;

console.log(`\nstatcite.com — ${daily.length} days of daily totals\n`);
console.log(`${"date".padEnd(12)}${"requests".padStart(10)}${"pageviews".padStart(11)}${"uniques".padStart(9)}`);
for (const r of daily) {
  console.log(
    r.dimensions.date.padEnd(12) +
    String(r.sum.requests).padStart(10) +
    String(r.sum.pageViews).padStart(11) +
    String(r.uniq.uniques).padStart(9),
  );
}

// The caller mix is only available for ~7 days, which is exactly why it is
// snapshotted rather than queried on demand.
let callers = [];
let siteRows = [];
try {
  const win = { zone: ZONE, from: `${day}T00:00:00Z`, to: `${day}T23:59:59Z` };
  callers = (await gql(CALLERS, win)).viewer.zones[0].httpRequestsAdaptiveGroups;
  siteRows = (await gql(SITE, win)).viewer.zones[0].httpRequestsAdaptiveGroups;
} catch (e) {
  console.log(`\nCaller detail for ${day} unavailable: ${e.message}`);
  console.log("Cloudflare's free plan keeps request-level detail for about a week.");
}

if (callers.length) {
  const mcp = callers;
  const buckets = {};
  for (const r of mcp) {
    const k = classify(r.dimensions.userAgent);
    buckets[k] = (buckets[k] || 0) + r.count;
  }
  const total = Object.values(buckets).reduce((a, b) => a + b, 0);
  console.log(`\n/mcp callers on ${day} — ${total} requests\n`);
  for (const [k, v] of Object.entries(buckets).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(11)} ${String(v).padStart(6)}  ${(100 * v / total).toFixed(1)}%`);
  }

  const named = {};
  for (const r of mcp) {
    const ua = (r.dimensions.userAgent || "(none)").slice(0, 44);
    named[ua] = (named[ua] || 0) + r.count;
  }
  console.log(`\n  top agents`);
  for (const [ua, n] of Object.entries(named).sort((a, b) => b[1] - a[1]).slice(0, 12)) {
    console.log(`  ${String(n).padStart(6)}  ${classify(ua).padEnd(10)} ${ua}`);
  }

  // Crawl mix on the SITE paths, which is a different population from the /mcp
  // callers above and answers a different question: not "who uses this" but
  // "who can find it".
  const site = siteRows;
  const crawl = { search: 0, ai: 0 };
  const crawlAgents = {};
  for (const r of site) {
    const k = crawlerKind(r.dimensions.userAgent);
    if (!k) continue;
    crawl[k] += r.count;
    const ua = (r.dimensions.userAgent || "").slice(0, 44);
    crawlAgents[ua] = (crawlAgents[ua] || 0) + r.count;
  }
  console.log(`\n  site crawl on ${day}`);
  console.log(`  ${String(crawl.ai).padStart(6)}  AI crawlers`);
  console.log(`  ${String(crawl.search).padStart(6)}  search engines` +
    (crawl.search < 20 ? "   <- barely crawled: this is why the domain does not rank" : ""));

  mkdirSync(OUT, { recursive: true });
  const file = join(OUT, "daily.jsonl");
  const already = existsSync(file)
    ? new Set(readFileSync(file, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l).date))
    : new Set();
  if (already.has(day)) {
    console.log(`\n${day} already recorded — not duplicated.`);
  } else {
    appendFileSync(file, JSON.stringify({
      date: day,
      requests: daily.find((r) => r.dimensions.date === day)?.sum.requests ?? null,
      pageviews: daily.find((r) => r.dimensions.date === day)?.sum.pageViews ?? null,
      uniques: daily.find((r) => r.dimensions.date === day)?.uniq.uniques ?? null,
      mcp_total: total,
      mcp: buckets,
      crawl,
      crawl_agents: crawlAgents,
      top_agents: Object.fromEntries(Object.entries(named).sort((a, b) => b[1] - a[1]).slice(0, 20)),
    }) + "\n", "utf8");
    console.log(`\nRecorded ${day} in analytics/daily.jsonl`);
  }
}
