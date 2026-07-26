// MCP tool registry: definitions (agent-facing contract) + dispatch.

import type { Ctx } from "./core/types.ts";
import { ToolError } from "./core/types.ts";
import { getIndicator, getSeries, searchIndicators, listRegistry } from "./core/series.ts";
import { countrySnapshot } from "./core/snapshot.ts";
import { inflationAdjust } from "./core/inflation.ts";
import { fxConvert } from "./core/fx.ts";
import { verifyStat, type VerifyResult } from "./core/verify.ts";
import { SOURCES } from "./core/sources.ts";
import { resolveCountry } from "./core/countries.ts";
import { INDICATORS, searchIndicatorDefs } from "./core/indicators.ts";
import { parseTransform } from "./core/transforms.ts";
import { UpstreamError } from "./core/upstream.ts";
import { recordUsage, indicatorLabel, countryLabel, verdictLabel, type Outcome } from "./core/analytics.ts";

type Json = Record<string, unknown>;

export interface ToolDef {
  name: string;
  title: string;
  description: string;
  inputSchema: Json;
  outputSchema?: Json;
  handler: (ctx: Ctx, args: Json) => Promise<unknown>;
}

const annotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
};

function str(args: Json, key: string, required = true): string {
  const v = args[key];
  if (v == null || v === "") {
    if (required) throw new ToolError(`Missing required parameter '${key}'.`);
    return "";
  }
  if (typeof v !== "string") throw new ToolError(`Parameter '${key}' must be a string.`);
  return v;
}

function num(args: Json, key: string, required = true): number {
  const v = args[key];
  if (v == null) {
    if (required) throw new ToolError(`Missing required parameter '${key}'.`);
    return NaN;
  }
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) throw new ToolError(`Parameter '${key}' must be a number.`);
  return n;
}

const TRANSFORMS = ["none", "yoy", "pct_change", "index"];

// ——— verify_claims: batch verification sharing the verify_stat core ———

const MAX_CLAIMS = 15;
const CLAIM_CONCURRENCY = 4;

export interface ClaimSpec {
  indicator: string;
  country?: string;
  period: string;
  claimed_value: number;
  tolerance_abs?: number;
  tolerance_pct?: number;
}

export type ClaimResult =
  | { ok: true; claim: ClaimSpec; verification: VerifyResult }
  | { ok: false; claim: ClaimSpec; error: string };

export interface VerifyClaimsResult {
  summary: { total: number; match: number; close: number; mismatch: number; cannot_verify: number; error: number };
  results: ClaimResult[];
  note?: string;
}

function claimStr(claim: Json, index: number, key: string, required: boolean, hint: string): string | undefined {
  const v = claim[key];
  if (v == null || v === "") {
    if (required) throw new ToolError(`claims[${index}].${key} is required — ${hint}`);
    return undefined;
  }
  if (typeof v !== "string") throw new ToolError(`claims[${index}].${key} must be a string — ${hint}`);
  return v;
}

function claimNum(claim: Json, index: number, key: string, required: boolean, hint: string): number | undefined {
  const v = claim[key];
  if (v == null) {
    if (required) throw new ToolError(`claims[${index}].${key} is required — ${hint}`);
    return undefined;
  }
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) throw new ToolError(`claims[${index}].${key} must be a number — ${hint}`);
  return n;
}

function parseClaims(raw: unknown): ClaimSpec[] {
  if (!Array.isArray(raw)) {
    throw new ToolError(
      "Parameter 'claims' must be an array of claim objects: { indicator, country?, period, claimed_value, tolerance_abs?, tolerance_pct? }.",
    );
  }
  if (raw.length === 0) {
    throw new ToolError(
      "'claims' is empty. Extract every checkable macro claim from the draft — indicator + country + period + claimed value — and submit them together, " +
        'e.g. { "indicator": "inflation_cpi", "country": "BRB", "period": "2024", "claimed_value": 1.4 }.',
    );
  }
  if (raw.length > MAX_CLAIMS) {
    throw new ToolError(
      `Received ${raw.length} claims; verify_claims accepts at most ${MAX_CLAIMS} per call (free-tier subrequest budget). ` +
        `Split the draft into batches of up to ${MAX_CLAIMS} claims and call verify_claims once per batch.`,
    );
  }
  return raw.map((c, i) => {
    if (c == null || typeof c !== "object" || Array.isArray(c)) {
      throw new ToolError(`claims[${i}] must be an object: { indicator, country?, period, claimed_value }.`);
    }
    const o = c as Json;
    const claim: ClaimSpec = {
      indicator: claimStr(o, i, "indicator", true,
        "a registry key like 'inflation_cpi' (see search_indicators) or an explicit series id like 'worldbank/FP.CPI.TOTL.ZG'.")!,
      period: claimStr(o, i, "period", true, "the period of the claim, usually a year like '2024'.")!,
      claimed_value: claimNum(o, i, "claimed_value", true, "the value as claimed, in the series' own units.")!,
    };
    const country = claimStr(o, i, "country", false, "an ISO3 code or English country name.");
    if (country !== undefined) claim.country = country;
    const tolAbs = claimNum(o, i, "tolerance_abs", false, "an absolute tolerance in series units.");
    if (tolAbs !== undefined) claim.tolerance_abs = tolAbs;
    const tolPct = claimNum(o, i, "tolerance_pct", false, "a relative tolerance in percent.");
    if (tolPct !== undefined) claim.tolerance_pct = tolPct;
    return claim;
  });
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

function claimErrorMessage(e: unknown): string {
  if (e instanceof ToolError) return e.message;
  if (e instanceof UpstreamError) return `Upstream data source problem: ${e.message} Usually transient — retry shortly.`;
  return "Internal error verifying this claim. Please retry; if persistent, verify it individually with verify_stat.";
}

export async function runVerifyClaims(ctx: Ctx, claimsRaw: unknown, strictSource = false): Promise<VerifyClaimsResult> {
  const claims = parseClaims(claimsRaw);
  const results = await mapLimit(claims, CLAIM_CONCURRENCY, async (claim): Promise<ClaimResult> => {
    try {
      return { ok: true, claim, verification: await verifyStat(ctx, { ...claim, strict_source: strictSource }) };
    } catch (e) {
      return { ok: false, claim, error: claimErrorMessage(e) };
    }
  });
  const summary = { total: claims.length, match: 0, close: 0, mismatch: 0, cannot_verify: 0, error: 0 };
  let projections = 0;
  for (const r of results) {
    if (r.ok) {
      summary[r.verification.verdict] += 1;
      if (r.verification.is_projection) projections += 1;
    } else {
      summary.error += 1;
    }
  }
  const out: VerifyClaimsResult = { summary, results };
  if (projections > 0) out.note = `${projections} claim(s) verified against IMF WEO/Fiscal Monitor projections, not outturns.`;
  return out;
}

export const TOOLS: ToolDef[] = [
  {
    name: "get_indicator",
    title: "Get an economic indicator (with citation)",
    description:
      "Get official values for a common economic indicator — inflation, GDP growth, GDP, GDP per capita, unemployment, population, government debt, fiscal balance, current account, trade, FDI, and more — for any country. Returns the observations plus a full citation (source, dataset, series id, canonical URL, license, retrieval date) ready to cite in a report. Use ISO3 codes or plain country names. Start here for most questions; use search_indicators if unsure of the indicator key.",
    inputSchema: {
      type: "object",
      properties: {
        indicator: {
          type: "string",
          description: "Registry key, e.g. 'inflation_cpi', 'gdp_growth', 'unemployment_rate', 'govt_debt_gdp'. See search_indicators.",
        },
        country: { type: "string", description: "ISO3/ISO2 code or English name, e.g. 'USA', 'Barbados', 'euro area'." },
        start_year: { type: "integer", description: "First year to include (optional)." },
        end_year: { type: "integer", description: "Last year to include (optional)." },
        transform: { type: "string", enum: TRANSFORMS, description: "Optional transform computed by StatCite." },
        latest_only: { type: "boolean", description: "Return only the most recent non-null observation." },
        strict_source: {
          type: "boolean",
          description:
            "Reproducibility mode: if the primary source fails, return an error instead of silently serving the fallback source (a fallback can report a different value for the same nominal indicator). Default false; fallback responses always carry fallback_used=true and a disclosure note.",
        },
      },
      required: ["indicator", "country"],
      additionalProperties: false,
    },
    handler: async (ctx, args) => {
      const latestOnly = args.latest_only === true;
      const result = await getIndicator(ctx, str(args, "indicator"), str(args, "country"), {
        start: args.start_year != null ? String(num(args, "start_year")) : undefined,
        end: args.end_year != null ? String(num(args, "end_year")) : undefined,
        transform: parseTransform(args.transform),
        limit: latestOnly ? 1 : 80,
        strictSource: args.strict_source === true,
      });
      return result;
    },
  },
  {
    name: "verify_stat",
    title: "Verify a claimed statistic against the official source",
    description:
      "Check a claimed economic figure (from a draft, article, or memory) against the official statistical series and get a verdict: match, close, mismatch, or cannot_verify — with the official value, the difference, diagnostics for classic errors (wrong year, percent-vs-decimal, unit scaling), and a full citation for the correct number. Use this before publishing any economic statistic in a report, brief, or article.",
    inputSchema: {
      type: "object",
      properties: {
        indicator: {
          type: "string",
          description: "Registry key ('inflation_cpi', 'gdp_growth', …) or explicit series id ('worldbank/FP.CPI.TOTL.ZG', 'fred/UNRATE', 'imf/NGDP_RPCH', 'dbnomics/IMF/WEO:latest/USA.NGDP_RPCH.pcent_change').",
        },
        country: { type: "string", description: "Country for registry indicators / World Bank series." },
        period: { type: "string", description: "Period of the claim, usually a year: '2024'." },
        claimed_value: { type: "number", description: "The value as claimed (in the series' own units)." },
        tolerance_abs: { type: "number", description: "Optional absolute tolerance in series units (e.g. 0.1 percentage points)." },
        tolerance_pct: { type: "number", description: "Optional relative tolerance in percent." },
        strict_source: {
          type: "boolean",
          description:
            "Reproducibility mode: never verify against a fallback source — error instead if the primary source fails. Default false; fallback-based verdicts always carry fallback_used=true.",
        },
      },
      required: ["indicator", "period", "claimed_value"],
      additionalProperties: false,
    },
    handler: async (ctx, args) =>
      verifyStat(ctx, {
        indicator: str(args, "indicator"),
        country: str(args, "country", false) || undefined,
        period: str(args, "period"),
        claimed_value: num(args, "claimed_value"),
        tolerance_abs: args.tolerance_abs != null ? num(args, "tolerance_abs") : undefined,
        tolerance_pct: args.tolerance_pct != null ? num(args, "tolerance_pct") : undefined,
        strict_source: args.strict_source === true,
      }),
  },
  {
    name: "verify_claims",
    title: "Verify a batch of claimed statistics (fact-check a whole draft)",
    description:
      "Fact-check a whole draft or report in one call instead of calling verify_stat once per figure: extract every checkable macro claim from the text — indicator + country + period + claimed value — and submit them together. Each claim gets the same verdict engine as verify_stat (match, close, mismatch, cannot_verify, with diagnostics), and every verified result carries the full citation for the official number. Accepts 1–15 claims per call (free-tier subrequest budget) — split larger drafts into multiple calls of up to 15. Results come back in input order with a verdict-count summary; a claim that cannot be resolved (unknown indicator or country) reports its error in place without sinking the rest of the batch.",
    inputSchema: {
      type: "object",
      properties: {
        claims: {
          type: "array",
          minItems: 1,
          maxItems: 15,
          description: "The claims extracted from the draft, in the order they appear (max 15 per call).",
          items: {
            type: "object",
            properties: {
              indicator: {
                type: "string",
                description: "Registry key ('inflation_cpi', 'gdp_growth', …) or explicit series id ('worldbank/FP.CPI.TOTL.ZG', 'fred/UNRATE', 'imf/NGDP_RPCH', 'dbnomics/IMF/WEO:latest/USA.NGDP_RPCH.pcent_change').",
              },
              country: { type: "string", description: "Country for registry indicators / World Bank series." },
              period: { type: "string", description: "Period of the claim, usually a year: '2024'." },
              claimed_value: { type: "number", description: "The value as claimed (in the series' own units)." },
              tolerance_abs: { type: "number", description: "Optional absolute tolerance in series units (e.g. 0.1 percentage points)." },
              tolerance_pct: { type: "number", description: "Optional relative tolerance in percent." },
            },
            required: ["indicator", "period", "claimed_value"],
            additionalProperties: false,
          },
        },
        strict_source: {
          type: "boolean",
          description:
            "Reproducibility mode for the whole batch: never verify any claim against a fallback source — such claims error in place instead. Default false.",
        },
      },
      required: ["claims"],
      additionalProperties: false,
    },
    handler: async (ctx, args) => runVerifyClaims(ctx, args.claims, args.strict_source === true),
  },
  {
    name: "get_series",
    title: "Get a raw series by explicit id",
    description:
      "Fetch any supported series by explicit id: 'worldbank/<WDI code>' (needs country), 'fred/<SERIES>' (US, needs server FRED key), 'imf/<CODE>' (needs country; current-vintage IMF WEO/Fiscal Monitor via the DataMapper API), or 'dbnomics/<PROVIDER>/<DATASET>/<SERIES>' (IMF WEO, OECD, Eurostat and more via DBnomics — dated editions, e.g. 'WEO:2025-04', for vintage-pinned reproducibility). Supports year filters and transforms (yoy, pct_change, index). Every response carries a full citation. Prefer get_indicator for common indicators.",
    inputSchema: {
      type: "object",
      properties: {
        series_id: { type: "string", description: "e.g. 'worldbank/NY.GDP.MKTP.KD.ZG', 'fred/CPIAUCSL', 'imf/NGDP_RPCH', 'dbnomics/IMF/WEO:latest/BRB.NGDP_RPCH.pcent_change'." },
        country: { type: "string", description: "Required for worldbank/* series." },
        start_year: { type: "integer" },
        end_year: { type: "integer" },
        transform: { type: "string", enum: TRANSFORMS },
        strict_source: {
          type: "boolean",
          description: "Reproducibility mode for registry-key ids: never substitute the fallback source. No effect on explicit source-prefixed ids (they already pin one source).",
        },
      },
      required: ["series_id"],
      additionalProperties: false,
    },
    handler: async (ctx, args) =>
      getSeries(ctx, str(args, "series_id"), {
        country: str(args, "country", false) || undefined,
        start: args.start_year != null ? String(num(args, "start_year")) : undefined,
        end: args.end_year != null ? String(num(args, "end_year")) : undefined,
        transform: parseTransform(args.transform),
        limit: 120,
        strictSource: args.strict_source === true,
      }),
  },
  {
    name: "search_indicators",
    title: "Search available indicators and datasets",
    description:
      "Search StatCite's curated indicator registry (World Bank WDI + IMF DataMapper/WEO/Fiscal Monitor + FRED) by topic — 'inflation', 'debt', 'unemployment', 'poverty' — and discover additional DBnomics datasets. Returns indicator keys usable with get_indicator/verify_stat, with units and source notes.",
    inputSchema: {
      type: "object",
      properties: { query: { type: "string", description: "Free-text topic, e.g. 'government debt' or 'fx reserves'." } },
      required: ["query"],
      additionalProperties: false,
    },
    handler: async (ctx, args) => ({
      query: str(args, "query"),
      results: await searchIndicators(ctx, str(args, "query")),
    }),
  },
  {
    name: "country_snapshot",
    title: "Country snapshot — headline indicators with citations",
    description:
      "One call for a country's headline economic picture: GDP, GDP growth, GDP per capita, inflation, unemployment, population, current account, trade openness, FDI, life expectancy (World Bank) plus general government debt (IMF DataMapper API, current vintage). Each value carries its own citation. Ideal for country briefs and report openers.",
    inputSchema: {
      type: "object",
      properties: { country: { type: "string", description: "ISO3/ISO2 code or English name." } },
      required: ["country"],
      additionalProperties: false,
    },
    handler: async (ctx, args) => countrySnapshot(ctx, str(args, "country")),
  },
  {
    name: "inflation_adjust",
    title: "Adjust an amount for inflation between two years",
    description:
      "Convert a nominal amount between years using official CPI: 'what is 100 (1995) worth in 2025 money?' Works for any country with CPI data (default USA). Returns the adjusted amount, the exact index values and formula used, and the citation. Annual-average precision.",
    inputSchema: {
      type: "object",
      properties: {
        amount: { type: "number" },
        from_year: { type: "integer" },
        to_year: { type: "integer" },
        country: { type: "string", description: "Default 'USA'." },
      },
      required: ["amount", "from_year", "to_year"],
      additionalProperties: false,
    },
    handler: async (ctx, args) =>
      inflationAdjust(ctx, num(args, "amount"), num(args, "from_year"), num(args, "to_year"), str(args, "country", false) || "USA"),
  },
  {
    name: "fx_convert",
    title: "Convert currencies with official reference rates",
    description:
      "Convert an amount between currencies using ECB daily reference rates (~30 majors, any date since 1999) or, for ~90 other currencies (BBD, XCD, JMD, KES, …), official annual-average rates from the World Bank — with the method and citations stated explicitly. Pass date='YYYY-MM-DD' for daily or 'YYYY' for annual-average conversion.",
    inputSchema: {
      type: "object",
      properties: {
        amount: { type: "number" },
        from: { type: "string", description: "3-letter ISO code, e.g. 'USD'." },
        to: { type: "string", description: "3-letter ISO code, e.g. 'BBD'." },
        date: { type: "string", description: "'YYYY-MM-DD' (daily, ECB set) or 'YYYY' (annual average). Default: latest." },
      },
      required: ["amount", "from", "to"],
      additionalProperties: false,
    },
    handler: async (ctx, args) =>
      fxConvert(ctx, num(args, "amount"), str(args, "from"), str(args, "to"), str(args, "date", false) || undefined),
  },
  {
    name: "list_sources",
    title: "List data sources, licenses, and attribution rules",
    description:
      "The official sources behind StatCite (World Bank WDI, IMF WEO & Fiscal Monitor via the IMF DataMapper API — with DBnomics as a vintage-pinned fallback, ECB reference rates, optional FRED), what each covers, its license, and the attribution line to use when citing.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    handler: async () => ({ sources: SOURCES, registry_size: INDICATORS.length }),
  },
  // ——— ChatGPT deep-research compatibility pair ———
  {
    name: "search",
    title: "Search (deep-research compatible)",
    description:
      "Search official economic statistics by free text, e.g. 'inflation barbados' or 'government debt japan'. Returns result ids that can be passed to fetch. Designed for deep-research connectors; for richer control use get_indicator / get_series.",
    inputSchema: {
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"],
      additionalProperties: false,
    },
    outputSchema: {
      type: "object",
      properties: {
        results: {
          type: "array",
          items: {
            type: "object",
            properties: { id: { type: "string" }, title: { type: "string" }, url: { type: "string" } },
            required: ["id", "title", "url"],
            additionalProperties: false,
          },
        },
      },
      required: ["results"],
      additionalProperties: false,
    },
    handler: async (ctx, args) => {
      const query = str(args, "query");
      // Cap tokens (CPU budget) and resolve countries strictly: no unknown-code
      // pass-through, and lowercase 2/3-letter words ("in", "gdp") never match codes.
      const tokens = query.split(/\s+/).filter(Boolean).slice(0, 12);
      let country: ReturnType<typeof resolveCountry> = null;
      for (let n = Math.min(4, tokens.length); n >= 1 && !country; n--) {
        for (let i = 0; i + n <= tokens.length && !country; i++) {
          const cand = tokens.slice(i, i + n).join(" ");
          if (cand.length >= 2) country = resolveCountry(cand, { strict: true });
        }
      }
      const matches = searchIndicatorDefs(query, 6);
      const results: Array<{ id: string; title: string; url: string }> = [];
      for (const m of matches) {
        const iso = country?.iso3 ?? "WLD";
        const cname = country?.name ?? "World";
        results.push({
          id: `indicator/${m.def.key}/${iso}`,
          title: `${m.def.label} — ${cname}`,
          url: m.def.wb
            ? `https://data.worldbank.org/indicator/${m.def.wb}?locations=${iso}`
            : `${ctx.baseUrl}/docs#indicators`,
        });
      }
      if (results.length === 0) {
        results.push({
          id: "help/indicators",
          title: "StatCite indicator registry (list of available indicators)",
          url: `${ctx.baseUrl}/docs#indicators`,
        });
      }
      return { results };
    },
  },
  {
    name: "fetch",
    title: "Fetch (deep-research compatible)",
    description:
      "Fetch full data for a result id returned by search (format: 'indicator/<key>/<ISO3>'). Returns the recent observations and the full citation as text.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
      additionalProperties: false,
    },
    outputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        title: { type: "string" },
        text: { type: "string" },
        url: { type: "string" },
        metadata: { type: "object", additionalProperties: true },
      },
      required: ["id", "title", "text", "url"],
      additionalProperties: false,
    },
    handler: async (ctx, args) => {
      const id = str(args, "id");
      if (id === "help/indicators") {
        const lines = listRegistry().map((r) => `- ${r.key}: ${r.label} [${r.unit}] (${r.sources.join("; ")})`);
        return {
          id,
          title: "StatCite indicator registry",
          text: `Indicators available via get_indicator/verify_stat:\n${lines.join("\n")}`,
          url: `${ctx.baseUrl}/docs#indicators`,
          metadata: { count: lines.length },
        };
      }
      const m = id.match(/^indicator\/([a-z0-9_]+)\/([A-Za-z0-9]{2,3})$/);
      if (!m) {
        throw new ToolError("Unrecognized id. Expected 'indicator/<key>/<ISO3>' from a prior search call.", { id });
      }
      const result = await getIndicator(ctx, m[1], m[2], { limit: 15 });
      const obsLines = result.observations.map((o) => `${o.period}: ${o.value == null ? "·" : o.value}`);
      const text = [
        `${result.name} — ${result.country?.name ?? ""} (${result.unit ?? "units per source"})`,
        "",
        ...obsLines,
        "",
        `CITATION: ${result.citation.citation_text}`,
        ...result.notes.map((n) => `NOTE: ${n}`),
      ].join("\n");
      return {
        id,
        title: `${result.name} — ${result.country?.name ?? ""}`,
        text,
        url: result.citation.source_url,
        metadata: { citation: result.citation, series_id: result.series_id },
      };
    },
  },
];

export const toolByName = new Map(TOOLS.map((t) => [t.name, t]));

// ——— Usage analytics (aggregate only; see core/analytics.ts) ———

/** Pull the aggregate dimensions out of a call. Nothing free-text is kept. */
function describeCall(name: string, args: Json, result?: unknown): { indicator?: string; country?: string; verdict?: string } {
  const a = args as Record<string, any>;
  const r = (result ?? undefined) as Record<string, any> | undefined;
  let indicatorRaw: unknown = typeof a?.indicator === "string" ? a.indicator : a?.series_id;
  let countryRaw: unknown = r && typeof r === "object" ? r?.country?.iso3 : undefined;
  if (typeof countryRaw !== "string") countryRaw = a?.country;
  // Deep-research `fetch` ids have the shape indicator/<key>/<ISO3>.
  if (name === "fetch" && typeof a?.id === "string") {
    const m = a.id.match(/^indicator\/([a-z0-9_]+)\/([A-Za-z0-9]{2,3})$/);
    if (m) {
      indicatorRaw = m[1];
      if (typeof countryRaw !== "string") countryRaw = m[2].toUpperCase();
    }
  }
  return {
    indicator: indicatorLabel(indicatorRaw),
    country: countryLabel(countryRaw),
    verdict: verdictLabel(r?.verdict),
  };
}

function outcomeOf(e: unknown): Outcome {
  if (e instanceof ToolError) return "tool_error";
  if (e instanceof UpstreamError) return "upstream_error";
  return "crash";
}

/**
 * Run a tool and record one aggregate usage event. Behaviour is identical to
 * calling `tool.handler` directly — errors propagate unchanged, and analytics
 * failures are swallowed inside recordUsage().
 */
export async function callTool(ctx: Ctx, tool: ToolDef, args: Json): Promise<unknown> {
  const started = Date.now();
  try {
    const result = await tool.handler(ctx, args);
    recordUsage(ctx.analytics, {
      transport: "mcp",
      op: tool.name,
      ...describeCall(tool.name, args, result),
      outcome: "ok",
      durationMs: Date.now() - started,
    });
    return result;
  } catch (e) {
    recordUsage(ctx.analytics, {
      transport: "mcp",
      op: tool.name,
      ...describeCall(tool.name, args),
      outcome: outcomeOf(e),
      durationMs: Date.now() - started,
    });
    throw e;
  }
}
