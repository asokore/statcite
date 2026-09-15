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
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { execFileSync } from "node:child_process";

export const ZONE = "9d183b85f315b73cc41ff0059caac168"; // statcite.com
const GQL = "https://api.cloudflare.com/client/v4/graphql";
const OUT = join(process.cwd(), "analytics");

// --- credentials -----------------------------------------------------------
//
// Reuses wrangler's own OAuth token rather than asking for a second credential.
// It is already on this machine, already scoped to this account, and already
// refreshed by wrangler. A separate API token would be one more secret to leak.

/**
 * Wrangler's OAuth token expires roughly hourly and wrangler refreshes it
 * lazily, on its next command. A tool that only READS the stored file
 * therefore works all session and then fails with a bare "Authentication
 * error" that says nothing about why. Ask wrangler to refresh first, which
 * costs one subprocess and turns an opaque failure into no failure.
 */
function refreshIfExpired() {
  for (const dir of configDirs()) {
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".toml"))) {
      const body = readFileSync(join(dir, f), "utf8");
      const exp = body.match(/^expiration_time\s*=\s*"([^"]+)"/m);
      if (!exp) continue;
      // Refresh a minute early: a token valid for 20 more seconds will expire
      // mid-run and fail on the second query rather than the first.
      if (Date.parse(exp[1]) - Date.now() > 60_000) return;
      try {
        execFileSync("npx", ["wrangler@4.131.1", "whoami"], { stdio: "ignore", shell: true });
      } catch {
        // If this fails the request below fails with its own message, which is
        // more informative than anything invented here.
      }
      return;
    }
  }
}

function configDirs() {
  return [
    join(homedir(), "AppData", "Roaming", "xdg.config", ".wrangler", "config"),
    join(homedir(), ".wrangler", "config"),
    join(homedir(), ".config", ".wrangler", "config"),
  ];
}

function token() {
  if (process.env.CLOUDFLARE_API_TOKEN) return process.env.CLOUDFLARE_API_TOKEN;
  refreshIfExpired();
  for (const dir of configDirs()) {
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".toml"))) {
      const m = readFileSync(join(dir, f), "utf8").match(/^oauth_token\s*=\s*"([^"]+)"/m);
      if (m) return m[1];
    }
  }
  throw new Error(
    "No Cloudflare credential. Run `npx wrangler@4.131.1 login`, or set CLOUDFLARE_API_TOKEN.",
  );
}

export async function gql(query, variables = {}) {
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
const AI_CRAWLERS = /gptbot|oai-searchbot|chatgpt-user|claudebot|claude-web|claude-searchbot|claude-user|anthropic|perplexity|google-extended|amazonbot|amzn-searchbot|bytespider|meta-external|ccbot|cohere|diffbot|youbot|duckassistbot|mistralai-user/i;

// --- real paths versus probes ---------------------------------------------
//
// Measured 2026-09-12: on 7, 8, 9 and 11 September, 86% to 95% of requests
// carrying AI-crawler user-agents went to paths this site does not serve
// (/.env, /@fs/proc/self/environ, /firebase-credentials.json and similar
// secret-file probes). A crawler user-agent is free text, so it proves nothing.
// The path does: a hit counts as real only when its path is one the site
// actually serves.
//
// The set is derived, never hand-listed, so a new page is covered the day it
// ships: every file under site/ (dot directories such as .well-known included,
// config files starting "_" excluded), the extensionless form of each HTML
// page, the short paths site/_redirects answers, and the /v1 routes that
// server/src/rest.ts declares.

const ROOT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");

function listFiles(dir, prefix = "") {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const rel = `${prefix}/${entry.name}`;
    if (entry.isDirectory()) out.push(...listFiles(join(dir, entry.name), rel));
    else out.push(rel);
  }
  return out;
}

export function derivePublicPaths(rootDir = ROOT_DIR) {
  const exact = new Set(["/"]);
  const prefixes = [];
  try {
    for (const rel of listFiles(join(rootDir, "site"))) {
      if (rel.split("/").pop().startsWith("_")) continue; // _headers, _redirects: config, not served
      exact.add(rel);
      if (rel.endsWith(".html")) exact.add(rel.slice(0, -5));
    }
  } catch {
    // No site directory: only "/" counts, which under-counts real crawling
    // rather than letting probes through.
  }
  try {
    for (const line of readFileSync(join(rootDir, "site", "_redirects"), "utf8").split(/\r?\n/)) {
      const from = line.trim().split(/\s+/)[0];
      if (from && from.startsWith("/")) exact.add(from);
    }
  } catch {
    // no redirects file
  }
  try {
    const rest = readFileSync(join(rootDir, "server", "src", "rest.ts"), "utf8");
    for (const m of rest.matchAll(/path === "(\/v1[^"]*)"/g)) exact.add(m[1]);
    // Routes with one path parameter, written as regexes such as
    // /^\/v1\/snapshot\/([^/]+)$/. Each becomes a one-segment prefix.
    for (const m of rest.matchAll(/\/\^\\\/v1\\\/([a-z_]+)\\\/\(\[\^\/\]\+\)\$\//g)) prefixes.push(`/v1/${m[1]}/`);
  } catch {
    // no server source: only file paths count
  }
  return { exact, prefixes: [...new Set(prefixes)] };
}

const PUBLIC = derivePublicPaths();

export function isPublicPath(path, publicPaths = PUBLIC) {
  const p = String(path || "");
  if (publicPaths.exact.has(p)) return true;
  // A one-parameter route matches exactly one further segment, so
  // /v1/snapshot/BRB is real and /v1/snapshot/x/../../.env is not.
  return publicPaths.prefixes.some((pre) => p.startsWith(pre) && p.length > pre.length && !p.slice(pre.length).includes("/"));
}

/** "ai" or "search" for a crawler user-agent on a path the site serves,
 * "ai_probe" or "search_probe" for one on any other path, else null. */
export function siteRowKind(ua, path, publicPaths = PUBLIC) {
  const k = crawlerKind(ua);
  if (!k) return null;
  return isPublicPath(path, publicPaths) ? k : `${k}_probe`;
}

/**
 * Crawl figures for one day of SITE rows. Schema 2 of the daily record.
 *
 * - crawl: every hit carrying a crawler user-agent, whatever the path. This is
 *   the schema-1 meaning, kept so the series continues. Schema-1 days came from
 *   a 100-row query and can be lower than a schema-2 day for that reason alone.
 * - crawl_real: hits on paths the site serves.
 * - crawl_probes: every other crawler-user-agent hit. Probe paths are never
 *   stored, because they are attacker-chosen text.
 * - crawl_paths: the 20 most requested real paths.
 * - crawl_agents: crawler user-agents, scrubbed and cut to 44 characters.
 */
export function summariseSiteRows(rows, limit, publicPaths = PUBLIC) {
  const crawl = { search: 0, ai: 0 };
  const crawlReal = { search: 0, ai: 0 };
  const crawlProbes = { search: 0, ai: 0 };
  const crawlAgents = {};
  const crawlPaths = {};
  for (const r of rows) {
    const kind = siteRowKind(r.dimensions.userAgent, r.dimensions.clientRequestPath, publicPaths);
    if (!kind) continue;
    const k = kind.replace(/_probe$/, "");
    crawl[k] += r.count;
    const ua = scrubUserAgent(r.dimensions.userAgent || "").slice(0, 44);
    crawlAgents[ua] = (crawlAgents[ua] || 0) + r.count;
    if (kind.endsWith("_probe")) {
      crawlProbes[k] += r.count;
      continue;
    }
    crawlReal[k] += r.count;
    crawlPaths[r.dimensions.clientRequestPath] = (crawlPaths[r.dimensions.clientRequestPath] || 0) + r.count;
  }
  return {
    crawl_schema: 2,
    crawl,
    crawl_real: crawlReal,
    crawl_probes: crawlProbes,
    crawl_paths: Object.fromEntries(Object.entries(crawlPaths).sort((a, b) => b[1] - a[1]).slice(0, 20)),
    crawl_agents: crawlAgents,
    // True when the query returned as many rows as it asked for, so the
    // smallest groups, which is where genuine crawls sit, may be missing.
    site_rows_truncated: rows.length >= limit,
  };
}

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

// Grouped by path as well as user-agent, so probes can be told from crawls.
// That multiplies the group count: one day in September produced well over a
// thousand groups, and ordering by count means truncation drops the SMALLEST
// groups first, which is exactly where genuine crawler page fetches sit. So the
// limit is set from measurement and the record says when it was reached.
// Measured 2026-09-12 over 5 to 11 September: at most 1,574 groups a day
// (9 September), so 10,000 leaves about six times headroom. The schema-1 query
// (userAgent only, limit 100) itself hit its limit on 7, 8 and 9 September and
// undercounted crawler hits by about half on those days.
export const SITE_LIMIT = 10000;
export const SITE = `query($zone:String!,$from:Time!,$to:Time!){
  viewer{zones(filter:{zoneTag:$zone}){
    httpRequestsAdaptiveGroups(limit:${SITE_LIMIT},filter:{datetime_geq:$from,datetime_lt:$to,clientRequestPath_neq:"/mcp"},orderBy:[count_DESC]){
      count dimensions{userAgent clientRequestPath}}}}}`;

const iso = (d) => d.toISOString().slice(0, 10);
const daysAgo = (n) => { const d = new Date(); d.setUTCDate(d.getUTCDate() - n); return iso(d); };

// --- user-agent strings are kept, so strip what identifies a person ---------
//
// A user-agent is free text chosen by the caller. Crawlers and hand-rolled
// clients often put a contact address in it ("MyBot/1.0 (+mailto:jane@example.org)"),
// and the top strings below are printed and written to analytics/daily.jsonl.
// Scrub before truncating, so a cut can never leave half an address that the
// pattern no longer recognises. The per-class counts still classify the raw
// string, so scrubbing never moves a caller between buckets.

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g;

export function scrubUserAgent(ua) {
  return String(ua ?? "").replace(EMAIL, "[email]");
}

// --- main ------------------------------------------------------------------

// Imported (by a test, for scrubUserAgent or classify) this does nothing. Run
// directly, it queries Cloudflare and records the snapshot. The comparison is
// case-insensitive because Windows drive letters arrive in either case.
const isMain = (() => {
  try {
    return resolve(fileURLToPath(import.meta.url)).toLowerCase() === resolve(process.argv[1] ?? "").toLowerCase();
  } catch {
    return false;
  }
})();

if (isMain) {
  const argv = process.argv.slice(2);
  const arg = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };

  const days = Number(arg("days", "30"));
  const day = arg("date", daysAgo(1)); // yesterday: today is still accumulating

  const daily = (await gql(DAILY, { zone: ZONE, since: daysAgo(days), until: iso(new Date()) }))
    .viewer.zones[0].httpRequests1dGroups;

  console.log(`\nstatcite.com: ${daily.length} days of daily totals\n`);
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
    console.log(`\n/mcp callers on ${day}: ${total} requests\n`);
    for (const [k, v] of Object.entries(buckets).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${k.padEnd(11)} ${String(v).padStart(6)}  ${(100 * v / total).toFixed(1)}%`);
    }

    const named = {};
    for (const r of mcp) {
      const ua = scrubUserAgent(r.dimensions.userAgent || "(none)").slice(0, 44);
      named[ua] = (named[ua] || 0) + r.count;
    }
    console.log(`\n  top agents`);
    for (const [ua, n] of Object.entries(named).sort((a, b) => b[1] - a[1]).slice(0, 12)) {
      console.log(`  ${String(n).padStart(6)}  ${classify(ua).padEnd(10)} ${ua}`);
    }

    // Outcomes per caller class. The query has always returned the edge status
    // next to the user-agent; until 2026-09-05 this tool discarded it, so it
    // could say who called and never whether the call worked. A rising 4xx share
    // among USER callers is the earliest retention signal there is, and a 5xx
    // share above zero is an outage that the status page will not show because
    // the status page probes upstreams, not our own handler.
    const outcomes = {};
    for (const r of mcp) {
      const k = classify(r.dimensions.userAgent);
      const st = Number(r.dimensions.edgeResponseStatus) || 0;
      const band = st >= 500 ? "5xx" : st >= 400 ? "4xx" : st >= 200 ? "2xx" : "other";
      outcomes[k] = outcomes[k] || { "2xx": 0, "4xx": 0, "5xx": 0, other: 0 };
      outcomes[k][band] += r.count;
    }
    console.log(`\n  outcomes by caller class (edge status)`);
    console.log(`  ${"class".padEnd(11)}${"2xx".padStart(7)}${"4xx".padStart(7)}${"5xx".padStart(7)}   4xx+5xx share`);
    for (const [k, o] of Object.entries(outcomes).sort((a, b) => b[1]["2xx"] - a[1]["2xx"])) {
      const n = o["2xx"] + o["4xx"] + o["5xx"] + o.other;
      const bad = n ? (100 * (o["4xx"] + o["5xx"]) / n).toFixed(1) : "0.0";
      console.log(`  ${k.padEnd(11)}${String(o["2xx"]).padStart(7)}${String(o["4xx"]).padStart(7)}${String(o["5xx"]).padStart(7)}   ${bad}%` +
        (k === "user" && o["5xx"] > 0 ? "   <- users saw server errors" : ""));
    }
    // Which 4xx, specifically, for USER callers: a 405 is a client probing GET,
    // a 400 is a malformed call, a 429 means we rate-limited a real person.
    const userCodes = {};
    for (const r of mcp) {
      if (classify(r.dimensions.userAgent) !== "user") continue;
      const st = Number(r.dimensions.edgeResponseStatus) || 0;
      if (st >= 400) userCodes[st] = (userCodes[st] || 0) + r.count;
    }
    if (Object.keys(userCodes).length) {
      console.log(`  user-class error codes: ` +
        Object.entries(userCodes).sort((a, b) => b[1] - a[1]).map(([c, n]) => `${c}x${n}`).join("  "));
    }

    // Crawl mix on the SITE paths, which is a different population from the /mcp
    // callers above and answers a different question: not "who uses this" but
    // "who can find it".
    const crawlSummary = summariseSiteRows(siteRows, SITE_LIMIT);
    const { crawl_real: real, crawl_probes: probes } = crawlSummary;
    if (crawlSummary.site_rows_truncated) {
      console.log(`\n  site rows reached the ${SITE_LIMIT}-row query limit, so real crawl counts are a lower bound`);
    }
    console.log(`\n  site crawl on ${day} (${siteRows.length} path and user-agent groups)`);
    console.log(`  ${String(real.ai).padStart(6)}  AI crawler hits on pages the site serves` +
      `   (${probes.ai} more used an AI crawler user-agent on paths it does not serve)`);
    console.log(`  ${String(real.search).padStart(6)}  search engine hits on pages the site serves` +
      `   (${probes.search} more on paths it does not serve)` +
      (real.search < 20 ? "   <- barely crawled: this is why the domain does not rank" : ""));

    mkdirSync(OUT, { recursive: true });
    const file = join(OUT, "daily.jsonl");
    const already = existsSync(file)
      ? new Set(readFileSync(file, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l).date))
      : new Set();
    if (already.has(day)) {
      console.log(`\n${day} is already recorded, so it was not duplicated.`);
    } else {
      appendFileSync(file, JSON.stringify({
        date: day,
        requests: daily.find((r) => r.dimensions.date === day)?.sum.requests ?? null,
        pageviews: daily.find((r) => r.dimensions.date === day)?.sum.pageViews ?? null,
        uniques: daily.find((r) => r.dimensions.date === day)?.uniq.uniques ?? null,
        mcp_total: total,
        outcomes,
        mcp: buckets,
        ...crawlSummary,
        top_agents: Object.fromEntries(Object.entries(named).sort((a, b) => b[1] - a[1]).slice(0, 20)),
      }) + "\n", "utf8");
      console.log(`\nRecorded ${day} in analytics/daily.jsonl`);
    }
  }
}
