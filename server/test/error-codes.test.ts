// Errors carry a stable code from one closed list, on REST and on MCP, and the
// OpenAPI Error schema lists exactly that list.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ERROR_CODES } from "../src/core/types.ts";
import { installFetchStub, call, mcpTool } from "./helpers.ts";

test("REST errors carry the code a client should branch on", async () => {
  installFetchStub();
  const cases: Array<[string, RequestInit | undefined, number, string]> = [
    ["/v1/indicator/not_a_real_key?country=BRB", undefined, 422, "unknown_indicator"],
    ["/v1/indicator/inflation_cpi?country=Freedonia", undefined, 422, "unknown_country"],
    ["/v1/indicator/inflation_cpi?country=BRB&bogus=1", undefined, 400, "invalid_parameter"],
    ["/v1/nope", undefined, 404, "unknown_endpoint"],
    ["/v1/indicator/inflation_cpi?country=BRB&start_year=1800&end_year=1801", undefined, 422, "out_of_range"],
    ["/v1/verify_claims", { method: "POST", headers: { "content-type": "application/json" }, body: "{not json" }, 422, "invalid_body"],
    ["/v1/verify_claims", { method: "POST", headers: { "content-type": "text/plain" }, body: "{}" }, 415, "unsupported_media_type"],
  ];
  for (const [path, init, status, code] of cases) {
    const res = await call(path, init);
    const body = await res.json() as any;
    assert.equal(res.status, status, `${path}: ${JSON.stringify(body).slice(0, 200)}`);
    assert.equal(body.error.code, code, `${path}`);
    assert.ok(ERROR_CODES.includes(body.error.code), `${path}: code must be from the closed list`);
  }
});

test("MCP tool errors carry the same codes", async () => {
  installFetchStub();
  const bad = await mcpTool("get_indicator", { indicator: "inflation_cpi", country: "Freedonia" });
  assert.equal(bad.isError, true);
  assert.equal(bad.payload.code, "unknown_country");
  const args = await mcpTool("verify_stat", { indicator: "inflation_cpi", period: "2023", claimed_value: 1, tolerence_abs: 0.1 });
  assert.equal(args.payload.code, "invalid_parameter");
});

test("the OpenAPI Error schema lists exactly the codes the server can return", () => {
  const spec = JSON.parse(readFileSync(new URL("../../site/openapi.json", import.meta.url), "utf8"));
  const schema = spec.components.schemas.Error;
  assert.deepEqual([...schema.properties.error.properties.code.enum].sort(), [...ERROR_CODES].sort());
  for (const name of ["BadRequest", "Unprocessable", "MethodNotAllowed", "NotFound"]) {
    assert.equal(spec.components.responses[name].content["application/json"].schema.$ref, "#/components/schemas/Error", name);
  }
});
