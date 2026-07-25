// MCP tool registry: definitions (agent-facing contract) + dispatch.

import type { Ctx } from "./core/types.ts";
import { ToolError } from "./core/types.ts";
import { getIndicator, getSeries, searchIndicators, listRegistry } from "./core/series.ts";
import { countrySnapshot } from "./core/snapshot.ts";
import { inflationAdjust } from "./core/inflation.ts";
import { fxConvert } from "./core/fx.ts";
import { verifyStat } from "./core/verify.ts";
import { SOURCES } from "./core/sources.ts";
import { resolveCountry } from "./core/countries.ts";
import { INDICATORS, searchIndicatorDefs } from "./core/indicators.ts";
import { parseTransform } from "./core/transforms.ts";

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
          description: "Registry key ('inflation_cpi', 'gdp_growth', …) or explicit series id ('worldbank/FP.CPI.TOTL.ZG', 'fred/UNRATE', 'dbnomics/IMF/WEO:latest/USA.NGDP_RPCH.pcent_change').",
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
    handler: async (ctx, args) =>
      verifyStat(ctx, {
        indicator: str(args, "indicator"),
        country: str(args, "country", false) || undefined,
        period: str(args, "period"),
        claimed_value: num(args, "claimed_value"),
        tolerance_abs: args.tolerance_abs != null ? num(args, "tolerance_abs") : undefined,
        tolerance_pct: args.tolerance_pct != null ? num(args, "tolerance_pct") : undefined,
      }),
  },
  {
    name: "get_series",
    title: "Get a raw series by explicit id",
    description:
      "Fetch any supported series by explicit id: 'worldbank/<WDI code>' (needs country), 'fred/<SERIES>' (US, needs server FRED key), or 'dbnomics/<PROVIDER>/<DATASET>/<SERIES>' (IMF WEO, OECD, Eurostat and more via DBnomics). Supports year filters and transforms (yoy, pct_change, index). Every response carries a full citation. Prefer get_indicator for common indicators.",
    inputSchema: {
      type: "object",
      properties: {
        series_id: { type: "string", description: "e.g. 'worldbank/NY.GDP.MKTP.KD.ZG', 'fred/CPIAUCSL', 'dbnomics/IMF/WEO:latest/BRB.NGDP_RPCH.pcent_change'." },
        country: { type: "string", description: "Required for worldbank/* series." },
        start_year: { type: "integer" },
        end_year: { type: "integer" },
        transform: { type: "string", enum: TRANSFORMS },
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
      }),
  },
  {
    name: "search_indicators",
    title: "Search available indicators and datasets",
    description:
      "Search StatCite's curated indicator registry (World Bank WDI + IMF WEO + FRED) by topic — 'inflation', 'debt', 'unemployment', 'poverty' — and discover additional DBnomics datasets. Returns indicator keys usable with get_indicator/verify_stat, with units and source notes.",
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
      "One call for a country's headline economic picture: GDP, GDP growth, GDP per capita, inflation, unemployment, population, current account, trade openness, FDI, life expectancy (World Bank) plus general government debt (IMF WEO). Each value carries its own citation. Ideal for country briefs and report openers.",
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
      "The official sources behind StatCite (World Bank WDI, IMF WEO via DBnomics, ECB reference rates, optional FRED), what each covers, its license, and the attribution line to use when citing.",
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
