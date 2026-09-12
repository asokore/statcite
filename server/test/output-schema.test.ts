// A declared outputSchema is a promise: clients that validate structuredContent
// reject a result that breaks it. So every tool's real successful output is
// checked against its own declared schema here, with a small validator that
// covers the keywords these schemas use.

import { test } from "node:test";
import assert from "node:assert/strict";
import { TOOLS } from "../src/tools.ts";
import { installFetchStub, mcpTool } from "./helpers.ts";

function validate(schema: any, value: unknown, path = "$"): string[] {
  const errs: string[] = [];
  const types = schema.type === undefined ? [] : Array.isArray(schema.type) ? schema.type : [schema.type];
  const typeOf = (v: unknown) => (v === null ? "null" : Array.isArray(v) ? "array" : Number.isInteger(v) ? "integer" : typeof v);
  if (types.length) {
    const t = typeOf(value);
    const ok = types.some((x: string) => x === t || (x === "number" && t === "integer"));
    if (!ok) return [`${path}: expected ${types.join("|")}, got ${t}`];
  }
  if (schema.enum && !schema.enum.includes(value)) errs.push(`${path}: ${JSON.stringify(value)} not in enum`);
  if (typeOf(value) === "object" && value !== null) {
    const o = value as Record<string, unknown>;
    for (const r of schema.required ?? []) if (!(r in o)) errs.push(`${path}: missing required '${r}'`);
    for (const [k, sub] of Object.entries(schema.properties ?? {})) {
      if (k in o && o[k] !== undefined) errs.push(...validate(sub, o[k], `${path}.${k}`));
    }
    if (schema.additionalProperties === false) {
      for (const k of Object.keys(o)) if (!(k in (schema.properties ?? {}))) errs.push(`${path}: unexpected '${k}'`);
    }
  }
  if (Array.isArray(value) && schema.items) value.forEach((v, i) => errs.push(...validate(schema.items, v, `${path}[${i}]`)));
  return errs;
}

test("the validator itself fails a result that breaks a schema", () => {
  const schema = TOOLS.find((t) => t.name === "get_indicator")!.outputSchema!;
  assert.ok(validate(schema, { series_id: "x", name: "y", observations: [], notes: [] }).some((e) => /citation/.test(e)));
  assert.ok(validate(schema, { series_id: 1, name: "y", observations: [], notes: [], citation: {} }).length > 0);
});

test("the series schema allows the shapes SeriesResult permits but fixtures rarely show", () => {
  // No fixture happens to return unit: null or a fallback, so check the schema
  // against those shapes directly rather than trusting an untested branch.
  const schema = TOOLS.find((t) => t.name === "get_series")!.outputSchema!;
  const citation = { source: "World Bank", series_id: "X", source_url: "https://x", license: "CC BY 4.0", retrieved_at: "2026-09-12", citation_text: "t" };
  const base = { series_id: "worldbank/X", name: "X", observations: [{ period: "2024", value: null }], citation, notes: [] };
  assert.deepEqual(validate(schema, { ...base, unit: null }), [], "unit: null is a documented value");
  assert.deepEqual(validate(schema, { ...base, fallback_used: true, fallback_reason: "definitive" }), []);
  assert.ok(validate(schema, { ...base, fallback_reason: "maybe" }).length > 0, "fallback_reason is a closed set");
});

test("get_indicator and get_series results satisfy their declared outputSchema", async () => {
  installFetchStub();
  const calls: Array<[string, Record<string, unknown>]> = [
    ["get_indicator", { indicator: "inflation_cpi", country: "BRB" }],
    ["get_indicator", { indicator: "inflation_cpi", country: "BRB", latest_only: true }],
    ["get_indicator", { indicator: "govt_debt_gdp", country: "USA" }],
    ["get_series", { series_id: "worldbank/FP.CPI.TOTL.ZG", country: "BRB" }],
    // Tools that already declared a schema are held to it too.
    ["verify_stat", { indicator: "inflation_cpi", country: "BRB", period: "2024", claimed_value: 1.4 }],
    ["verify_claims", { claims: [{ indicator: "inflation_cpi", country: "BRB", period: "2024", claimed_value: 1.4 }] }],
    ["search", { query: "Barbados inflation" }],
    ["fetch", { id: "indicator/inflation_cpi/BRB" }],
  ];
  for (const [name, args] of calls) {
    const tool = TOOLS.find((t) => t.name === name)!;
    assert.ok(tool.outputSchema, `${name} must declare an outputSchema`);
    const { isError, payload, rpc } = await mcpTool(name, args);
    assert.equal(isError, false, `${name} ${JSON.stringify(args)}: ${JSON.stringify(payload).slice(0, 200)}`);
    const errs = validate(tool.outputSchema, rpc.result.structuredContent);
    assert.deepEqual(errs, [], `${name} ${JSON.stringify(args)} breaks its own outputSchema`);
  }
});
