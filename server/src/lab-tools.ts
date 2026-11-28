// Lab tool definitions, served on /lab/mcp and /all/mcp only. The /mcp tool
// list (tools.ts TOOLS) is not touched by anything in this file.

import type { Ctx } from "./core/types.ts";
import { ToolError } from "./core/types.ts";
import type { ToolDef } from "./tools.ts";
import { MAX_STR_LEN } from "./tools.ts";
import { asOfCapableIndicators } from "./core/series.ts";
import { assertLabArgsCovered, revisionRecords, methodRules, METHOD_RULE_IDS } from "./core/lab.ts";

type Json = Record<string, unknown>;

function str(args: Json, key: string, required = true): string {
  const v = args[key];
  if (v == null || v === "") {
    if (required) throw new ToolError(`Missing required parameter '${key}'.`);
    return "";
  }
  if (typeof v !== "string") throw new ToolError(`Parameter '${key}' must be a string.`);
  if (v.length > MAX_STR_LEN) throw new ToolError(`Parameter '${key}' is too long (max ${MAX_STR_LEN} characters).`);
  return v;
}

/** Every lab handler runs behind the coverage scan, so the check cannot be
 * forgotten on a tool added later. */
function covered(handler: (ctx: Ctx, args: Json) => Promise<unknown>): (ctx: Ctx, args: Json) => Promise<unknown> {
  return async (ctx, args) => {
    assertLabArgsCovered(args);
    return handler(ctx, args);
  };
}

const CITATION_SCHEMA = {
  type: "object",
  properties: {
    source: { type: "string" },
    dataset: { type: "string" },
    series_id: { type: "string" },
    source_url: { type: "string" },
    license: { type: "string" },
    retrieved_at: { type: "string" },
    citation_text: { type: "string" },
  },
  required: ["source", "dataset", "series_id", "source_url", "license", "retrieved_at", "citation_text"],
  additionalProperties: true,
};

export const LAB_TOOLS: ToolDef[] = [
  {
    name: "revision_records",
    title: "WEO edition records for one figure (lab)",
    description:
      `For one indicator, country and year, list the value in every IMF World Economic Outlook edition StatCite can reach, from 2008-04 to the current edition. Each value carries its own citation naming the edition, the series id and the retrieval date. Where the IMF's dated vintage states them, a record also carries BASE_YEAR and LATEST_ACTUAL_ANNUAL_DATA, and the year is classified as actual or projection against them. An edition StatCite cannot reach is listed as missing with the reason, never filled. The records carry no score. Indicators: ${asOfCapableIndicators().join(", ")}. Some jurisdictions and all aggregates are not covered by the lab tools. Definitions: method_rules.`,
    inputSchema: {
      type: "object",
      properties: {
        indicator: { type: "string", enum: asOfCapableIndicators(), description: "Registry key with dated WEO editions." },
        country: { type: "string", description: "ISO3/ISO2 code or English name of a single economy." },
        year: { type: "string", description: "The year the value refers to, e.g. '2023'." },
      },
      required: ["indicator", "country", "year"],
      additionalProperties: false,
    },
    outputSchema: {
      type: "object",
      properties: {
        indicator: { type: "string" },
        country: { type: "object", additionalProperties: true },
        year: { type: "string" },
        records: {
          type: "array",
          items: {
            type: "object",
            properties: {
              edition: { type: "string" },
              status: { type: "string", enum: ["value", "missing"] },
              value: { type: ["number", "null"] },
              citation: CITATION_SCHEMA,
              missing_reason: { type: "string" },
            },
            required: ["edition", "status", "value"],
            additionalProperties: true,
          },
        },
        notes: { type: "array", items: { type: "string" } },
      },
      required: ["indicator", "country", "year", "records", "notes"],
      additionalProperties: true,
    },
    handler: covered(async (ctx, args) => revisionRecords(ctx, str(args, "indicator"), str(args, "country"), str(args, "year"))),
  },
  {
    name: "method_rules",
    title: "Definitions behind the edition records (lab)",
    description:
      "Static, cited text on what a WEO edition is, what first release means in these records, the actual or projection boundary, how a base-year change is flagged, and how missing editions are shown. Each rule says whether it restates an IMF source or is a StatCite convention. Pass 'rule' for one rule, or nothing for all.",
    inputSchema: {
      type: "object",
      properties: {
        rule: { type: "string", enum: METHOD_RULE_IDS, description: "Optional: one rule id." },
      },
      additionalProperties: false,
    },
    handler: covered(async (_ctx, args) => methodRules(str(args, "rule", false) || undefined)),
  },
];

export const labToolByName = new Map(LAB_TOOLS.map((t) => [t.name, t]));
