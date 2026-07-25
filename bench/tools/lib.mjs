// bench/tools/lib.mjs — shared code for the StatCite benchmark harness (run P0).
// Plain Node ESM, zero dependencies. Binding spec: bench/METHODOLOGY.md.
//
// Politeness contract with the live service (and upstreams): global request pool
// with concurrency <= 3 and >= 120ms between request starts (well under the WAF's
// 200 req/10s/IP), retries with backoff on 429/5xx, and a disk cache under
// bench/state/ (gitignored) so interrupted runs resume without refetching.

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const TOOLS_DIR = path.dirname(fileURLToPath(import.meta.url));
export const BENCH_DIR = path.resolve(TOOLS_DIR, "..");
export const REPO_DIR = path.resolve(BENCH_DIR, "..");
export const STATE_DIR = path.join(BENCH_DIR, "state");
export const STATCITE_BASE = process.env.STATCITE_BASE || "https://statcite.com";

// ---------------------------------------------------------------------------
// Benchmark constants (METHODOLOGY §1, §7)
// ---------------------------------------------------------------------------

/** §7 pilot roster. Settings are recorded in bench/models.json and the manifest. */
export const MODELS = ["claude-haiku-4-5", "claude-sonnet-5", "claude-opus-5", "claude-fable-5"];

/** §1.2 — 12 indicators in 3 revision classes with headline quotas (total 100). */
export const HEADLINE_QUOTA = {
  inflation_cpi: 12,
  population: 8,
  life_expectancy: 8,
  unemployment_rate: 8,
  trade_gdp: 8,
  reserves_total_usd: 8,
  gdp_growth: 8,
  gdp_current_usd: 8,
  govt_debt_gdp: 8,
  fiscal_balance_gdp: 8,
  current_account_gdp: 8,
  fdi_inflows_gdp: 8,
};

export const REVISION_CLASS = {
  inflation_cpi: "A",
  population: "B",
  life_expectancy: "B",
  unemployment_rate: "B",
  trade_gdp: "B",
  reserves_total_usd: "B",
  gdp_growth: "C",
  gdp_current_usd: "C",
  govt_debt_gdp: "C",
  fiscal_balance_gdp: "C",
  current_account_gdp: "C",
  fdi_inflows_gdp: "C",
};

/** Scoring kind per indicator (percent-kind vs level-kind bands, §4). */
export const INDICATOR_KIND = {
  inflation_cpi: "percent",
  unemployment_rate: "percent",
  trade_gdp: "percent",
  gdp_growth: "percent",
  govt_debt_gdp: "percent",
  fiscal_balance_gdp: "percent",
  current_account_gdp: "percent",
  fdi_inflows_gdp: "percent",
  population: "level",
  life_expectancy: "level",
  reserves_total_usd: "level",
  gdp_current_usd: "level",
  // Null-probe indicators (never graded numerically; kind recorded for completeness).
  gini: "level",
  poverty_headcount_intl: "percent",
};

export const HEADLINE_INDICATORS = Object.keys(HEADLINE_QUOTA);
export const NULL_PROBE_INDICATORS = ["gini", "poverty_headcount_intl"];
export const YEARS_HEADLINE = [2018, 2019, 2020, 2021, 2022];
export const YEARS_RECENCY = [2023, 2024, 2025];

/** §1.3 hard tier restrictions. */
export const TIER_RESTRICTION = {
  gdp_current_usd: ["T1", "T2"],
  fdi_inflows_gdp: ["T1", "T2", "T3"],
};

/** DBnomics IMF WEO series templates (mined from server/src/core/indicators.ts). */
export const WEO_SERIES_TEMPLATE = {
  gdp_growth: "{ISO3}.NGDP_RPCH.pcent_change",
  current_account_gdp: "{ISO3}.BCA_NGDPD.pcent_gdp",
  govt_debt_gdp: "{ISO3}.GGXWDG_NGDP.pcent_gdp",
  fiscal_balance_gdp: "{ISO3}.GGXCNL_NGDP.pcent_gdp",
};

/** World Bank WDI codes per registry key (mined from server/src/core/indicators.ts). */
export const WB_CODE = {
  inflation_cpi: "FP.CPI.TOTL.ZG",
  population: "SP.POP.TOTL",
  life_expectancy: "SP.DYN.LE00.IN",
  unemployment_rate: "SL.UEM.TOTL.ZS",
  trade_gdp: "NE.TRD.GNFS.ZS",
  reserves_total_usd: "FI.RES.TOTL.CD",
  gdp_growth: "NY.GDP.MKTP.KD.ZG",
  gdp_current_usd: "NY.GDP.MKTP.CD",
  govt_debt_gdp: "GC.DOD.TOTL.GD.ZS",
  current_account_gdp: "BN.CAB.XOKA.GD.ZS",
  fdi_inflows_gdp: "BX.KLT.DINV.WD.GD.ZS",
  gini: "SI.POV.GINI",
  poverty_headcount_intl: "SI.POV.DDAY",
};

export function tierOf(rank) {
  if (rank <= 20) return "T1";
  if (rank <= 60) return "T2";
  if (rank <= 120) return "T3";
  return "T4";
}

// ---------------------------------------------------------------------------
// Small utilities
// ---------------------------------------------------------------------------

export function sha256Hex(data) {
  return createHash("sha256").update(data).digest("hex");
}

export function sha256File(file) {
  return createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

export function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

export function writeJson(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(obj, null, 2) + "\n", "utf8");
}

export function writeText(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text, "utf8");
}

const T0 = Date.now();
export function log(msg) {
  const secs = ((Date.now() - T0) / 1000).toFixed(1).padStart(6);
  console.log(`[${secs}s] ${msg}`);
}

/** Minimal flag parser. spec: { name: { type: "string"|"number"|"boolean", required?, default? } } */
export function parseArgs(argv, spec) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) throw new Error(`Unexpected argument '${a}' (flags only)`);
    const name = a.slice(2);
    const s = spec[name];
    if (!s) throw new Error(`Unknown flag --${name}. Known: ${Object.keys(spec).map((k) => `--${k}`).join(", ")}`);
    if (s.type === "boolean") {
      out[name] = true;
    } else {
      const v = argv[++i];
      if (v === undefined) throw new Error(`--${name} requires a value`);
      out[name] = s.type === "number" ? Number(v) : v;
    }
  }
  for (const [name, s] of Object.entries(spec)) {
    if (out[name] === undefined) {
      if (s.required) throw new Error(`--${name} is required`);
      if (s.default !== undefined) out[name] = s.default;
    }
  }
  return out;
}

/** Standard artifact locations for a run, relocatable via --base for probe/synthetic runs. */
export function benchPaths(base, run) {
  const b = base ? path.resolve(base) : BENCH_DIR;
  return {
    base: b,
    frameDir: path.join(b, "frame"),
    questionsDir: path.join(b, "questions"),
    questions: path.join(b, "questions", `${run}.json`),
    batches: path.join(b, "questions", `${run}-batches.json`),
    genlog: path.join(b, "questions", `${run}-genlog.json`),
    snapshotDir: path.join(b, "snapshots", run),
    runDir: path.join(b, "runs", run),
  };
}

/** Wilson 95% score interval. */
export function wilson(k, n, z = 1.959963984540054) {
  if (!n) return { p: null, lo: null, hi: null, k, n };
  const p = k / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  return { p, lo: Math.max(0, center - half), hi: Math.min(1, center + half), k, n };
}

/** Async map with bounded worker concurrency (order-preserving). */
export async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    for (;;) {
      const idx = next++;
      if (idx >= items.length) return;
      out[idx] = await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return out;
}

/** Count logged deviations in bench/DEVIATIONS.md (top-level markdown list items). */
export function countDeviations() {
  try {
    const text = fs.readFileSync(path.join(BENCH_DIR, "DEVIATIONS.md"), "utf8");
    return text.split(/\r?\n/).filter((l) => /^[-*] \S/.test(l.trim()) && /^[-*] /.test(l)).length;
  } catch {
    return 0;
  }
}

// ---------------------------------------------------------------------------
// Economy registry (mined from server/src/core/countries.ts, read-only).
// Aggregates live in the separate AGGREGATES array (marked aggregate: true);
// parsing only the ROWS block excludes them mechanically.
// ---------------------------------------------------------------------------

export function loadEconomies() {
  const src = fs.readFileSync(path.join(REPO_DIR, "server", "src", "core", "countries.ts"), "utf8");
  const afterRows = src.split("const ROWS: Row[] = [")[1];
  if (!afterRows) throw new Error("countries.ts: ROWS block not found — file shape changed?");
  const rowsBlock = afterRows.split("];")[0];
  const out = [];
  const re = /\["([A-Z]{3})",\s*"([A-Z0-9]{2})",\s*"((?:[^"\\]|\\.)*)"/g;
  let m;
  while ((m = re.exec(rowsBlock)) !== null) {
    out.push({ iso3: m[1], iso2: m[2], name: m[3].replace(/\\"/g, '"') });
  }
  // Sanity: aggregates excluded, plausible count, known entries present.
  const codes = new Set(out.map((e) => e.iso3));
  for (const agg of ["WLD", "EUU", "EMU", "OED", "HIC", "LCN"]) {
    if (codes.has(agg)) throw new Error(`countries.ts parse error: aggregate ${agg} leaked into economy list`);
  }
  if (out.length < 150 || !codes.has("USA") || !codes.has("BRB")) {
    throw new Error(`countries.ts parse error: got ${out.length} economies`);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Polite HTTP with disk cache
// ---------------------------------------------------------------------------

let MAX_CONCURRENCY = 3;
let MIN_GAP_MS = 120;
let active = 0;
let lastStart = 0;
const waiters = [];

export function configureHttp({ concurrency, minGapMs } = {}) {
  if (concurrency) MAX_CONCURRENCY = Math.min(4, concurrency);
  if (minGapMs != null) MIN_GAP_MS = minGapMs;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function acquire() {
  while (active >= MAX_CONCURRENCY) {
    await new Promise((r) => waiters.push(r));
  }
  active++;
  const now = Date.now();
  const wait = Math.max(0, lastStart + MIN_GAP_MS - now);
  lastStart = now + wait;
  if (wait > 0) await sleep(wait);
}

function release() {
  active--;
  const w = waiters.shift();
  if (w) w();
}

const RETRY_STATUSES = new Set([429, 500, 502, 503, 504]);
const CACHE_DIR = path.join(STATE_DIR, "http-cache");

/**
 * GET a JSON endpoint politely, with retries and a disk cache under bench/state/.
 * Returns { status, body, cached, url }. 4xx responses (incl. 422 "no data") are
 * returned as data, not thrown; only exhausted retries throw.
 */
export async function politeFetchJson(url, opts = {}) {
  const { cache = true, refresh = false, cacheNon200 = false, maxAgeMs = 7 * 24 * 3600 * 1000, timeoutMs = 30000, tag = "" } = opts;
  const cacheFile = path.join(CACHE_DIR, sha256Hex(url) + ".json");
  if (cache && !refresh) {
    try {
      const entry = JSON.parse(fs.readFileSync(cacheFile, "utf8"));
      if (Date.now() - Date.parse(entry.fetched_at) < maxAgeMs) {
        return { status: entry.status, body: entry.body, cached: true, url };
      }
    } catch {
      /* cache miss */
    }
  }

  let lastErr;
  const backoff = [1000, 3000, 8000];
  for (let attempt = 0; attempt <= backoff.length; attempt++) {
    await acquire();
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(timeoutMs),
        headers: {
          accept: "application/json",
          "user-agent": "statcite-bench-P0/1.0 (benchmark harness; github.com/asokore/statcite bench/)",
        },
      });
      const text = await res.text();
      let body;
      try {
        body = JSON.parse(text);
      } catch {
        body = { _raw_text: text.slice(0, 2000) };
      }
      if (RETRY_STATUSES.has(res.status)) {
        lastErr = new Error(`HTTP ${res.status} from ${url}`);
        const retryAfter = Number(res.headers.get("retry-after"));
        release();
        if (attempt < backoff.length) {
          await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : backoff[attempt]);
          continue;
        }
        throw lastErr;
      }
      release();
      const result = { status: res.status, body, cached: false, url };
      // Only 200s are cached by default: non-200 bodies are frequently transient
      // upstream failures surfaced as 4xx (e.g. StatCite 422 wrapping a World Bank
      // timeout) and caching them poisons resumable runs for a week.
      if (cache && (res.status === 200 || (cacheNon200 && res.status < 500))) {
        fs.mkdirSync(CACHE_DIR, { recursive: true });
        fs.writeFileSync(cacheFile, JSON.stringify({ url, tag, status: res.status, fetched_at: new Date().toISOString(), body }));
      }
      return result;
    } catch (e) {
      release();
      if (e === lastErr) throw e;
      lastErr = e;
      if (attempt < backoff.length) {
        await sleep(backoff[attempt]);
        continue;
      }
      throw new Error(`fetch failed after retries: ${url} — ${e.message}`, { cause: e });
    }
  }
  throw lastErr;
}

// ---------------------------------------------------------------------------
// StatCite REST helpers
// ---------------------------------------------------------------------------

export async function scIndicator(key, country, { start, end, latestOnly } = {}, opts = {}) {
  const params = new URLSearchParams({ country });
  if (start != null) params.set("start_year", String(start));
  if (end != null) params.set("end_year", String(end));
  if (latestOnly) params.set("latest_only", "true");
  return politeFetchJson(`${STATCITE_BASE}/v1/indicator/${key}?${params}`, opts);
}

export async function scSeries(id, { start, end, country } = {}, opts = {}) {
  const params = new URLSearchParams({ id });
  if (country) params.set("country", country);
  if (start != null) params.set("start_year", String(start));
  if (end != null) params.set("end_year", String(end));
  return politeFetchJson(`${STATCITE_BASE}/v1/series?${params}`, opts);
}

export async function scVerify({ indicator, country, period, value }, opts = {}) {
  const params = new URLSearchParams({ indicator, period: String(period), value: String(value) });
  if (country) params.set("country", country);
  return politeFetchJson(`${STATCITE_BASE}/v1/verify?${params}`, opts);
}

/** True when a StatCite error response wraps a transient upstream failure
 * (worker -> World Bank/DBnomics timeout or abort), as opposed to a genuinely
 * missing series ("No World Bank data found…", "No observations available…"). */
export function isTransientUpstreamError(status, body) {
  if (status === 0 || status === 502 || status === 504) return true;
  const msg = body?.error?.message ?? "";
  return /failed to reach upstream|operation was aborted|upstream data source problem|timed? ?out/i.test(msg);
}

/** scIndicator with transient-failure retries: on a transient upstream error the
 * call is repeated with refresh:true (cache bypassed, success still cached).
 * Genuine "no data" 422s return immediately. */
export async function scIndicatorRobust(key, country, range = {}, { attempts = 3, baseDelayMs = 2000 } = {}) {
  const attempt = async (opts) => {
    try {
      return await scIndicator(key, country, range, opts);
    } catch (e) {
      return { status: 0, body: { error: { message: String(e.message) } }, cached: false };
    }
  };
  let r = await attempt({});
  for (let i = 0; i < attempts && r.status !== 200 && isTransientUpstreamError(r.status, r.body); i++) {
    await new Promise((res) => setTimeout(res, baseDelayMs * (i + 1)));
    r = await attempt({ refresh: true });
  }
  return r;
}

/** scVerify with the same transient-failure retry discipline as scIndicatorRobust. */
export async function scVerifyRobust(params, { attempts = 3, baseDelayMs = 2000 } = {}) {
  const attempt = async (opts) => {
    try {
      return await scVerify(params, opts);
    } catch (e) {
      return { status: 0, body: { error: { message: String(e.message) } }, cached: false };
    }
  };
  let r = await attempt({});
  for (let i = 0; i < attempts && r.status !== 200 && isTransientUpstreamError(r.status, r.body); i++) {
    await new Promise((res) => setTimeout(res, baseDelayMs * (i + 1)));
    r = await attempt({ refresh: true });
  }
  return r;
}

/** Find an observation for a given period in a StatCite series payload. */
export function obsFor(body, year) {
  if (!body || !Array.isArray(body.observations)) return undefined;
  return body.observations.find((o) => o.period === String(year));
}

export function isProjectionObs(o) {
  return Boolean(o && /projection|estimate/i.test(o.note ?? ""));
}

// ---------------------------------------------------------------------------
// Unit normalization (declared-unit-only; §4 "never the value's magnitude")
// ---------------------------------------------------------------------------

let unitRulesCache = null;
export function loadUnitRules() {
  if (!unitRulesCache) unitRulesCache = readJson(path.join(TOOLS_DIR, "unit_rules.json"));
  return unitRulesCache;
}

/**
 * Normalize a model's declared unit string against the expected kind.
 * Returns { ok, factor, reason }. normalized_value = value * factor puts the
 * claim in ground-truth base units (percent for percent-kind; people/US$/years
 * for level-kind). Uses ONLY the declared unit string, never the value.
 */
export function normalizeDeclaredUnit(raw, expectedKind, rules = loadUnitRules()) {
  if (typeof raw !== "string" || raw.trim() === "") return { ok: false, factor: null, reason: "unit_missing_or_not_string" };
  const cleaned = raw
    .toLowerCase()
    .normalize("NFKC")
    .replace(/us\$/g, " usd ")
    .replace(/\$/g, " usd ")
    .replace(/%/g, " % ")
    .replace(/[.,;:()\[\]{}\/\\_—–-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return { ok: false, factor: null, reason: "unit_empty_after_cleaning" };
  const tokens = cleaned.split(" ");

  const pctTokens = new Set(rules.percent_tokens);
  const ratioTokens = new Set(rules.ratio_tokens);
  const neutral = new Set(rules.neutral_tokens);
  const rejected = new Set(rules.rejected_tokens);

  const isPercentish = tokens.some((t) => pctTokens.has(t));
  const isRatioish = tokens.some((t) => ratioTokens.has(t));
  let pctScale = 1;
  for (const t of tokens) if (rules.percent_scale_tokens[t] != null) pctScale *= rules.percent_scale_tokens[t];
  let scale = 1;
  let sawScaleWord = false;
  for (const t of tokens) {
    if (rules.scale_words[t] != null) {
      scale *= rules.scale_words[t];
      sawScaleWord = true;
    }
  }

  if (expectedKind === "percent") {
    if (isPercentish && isRatioish) return { ok: false, factor: null, reason: "ambiguous_percent_and_ratio" };
    if (isPercentish) return { ok: true, factor: pctScale * scale, reason: null };
    if (isRatioish) return { ok: true, factor: 100, reason: null };
    return { ok: false, factor: null, reason: "kind_mismatch_expected_percent" };
  }

  // level-kind: strict token scan — every token must be a scale word or neutral.
  if (isPercentish || isRatioish) return { ok: false, factor: null, reason: "kind_mismatch_expected_level" };
  for (const t of tokens) {
    if (rejected.has(t)) return { ok: false, factor: null, reason: `rejected_token:${t}` };
    if (rules.scale_words[t] == null && !neutral.has(t)) return { ok: false, factor: null, reason: `unknown_token:${t}` };
  }
  return { ok: true, factor: sawScaleWord ? scale : 1, reason: null };
}

/** §2.1 magnitude rule: choose the human-natural unit_scale for level questions. */
export function unitScaleFor(indicator, magnitude) {
  if (indicator === "population") {
    return magnitude != null && magnitude < 1e6
      ? { label: "thousands of people", factor: 1e3 }
      : { label: "millions of people", factor: 1e6 };
  }
  if (indicator === "gdp_current_usd" || indicator === "reserves_total_usd") {
    return magnitude != null && magnitude < 1e10
      ? { label: "millions of US dollars", factor: 1e6 }
      : { label: "billions of US dollars", factor: 1e9 };
  }
  if (indicator === "life_expectancy") return { label: "years", factor: 1 };
  return null; // percent-kind: no magnitude scaling
}
