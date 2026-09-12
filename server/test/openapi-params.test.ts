// The REST routes refuse any query parameter they do not accept. The OpenAPI
// spec is what generated clients and Custom GPT Actions are built from, so a
// parameter the route accepts but the spec omits is unreachable for them, and
// one the spec lists but the route refuses is a guaranteed 400.
//
// The accepted lists are read from the route source itself, so this compares
// the two real artefacts rather than a copy of either.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const REST = readFileSync(new URL("../src/rest.ts", import.meta.url), "utf8");
const SPEC = JSON.parse(readFileSync(new URL("../../site/openapi.json", import.meta.url), "utf8"));

function acceptedByRoute(): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const verifyConst = /const VERIFY_PARAMS = \[([\s\S]*?)\]/.exec(REST);
  assert.ok(verifyConst, "VERIFY_PARAMS not found in rest.ts");
  const list = (src: string) => [...src.matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);
  const re = /rejectUnknownParams\(q, (\[[^\]]*\]|VERIFY_PARAMS)\)/g;
  for (const m of REST.matchAll(re)) {
    const before = REST.slice(0, m.index);
    const routeAt = Math.max(before.lastIndexOf('path === "/v1/'), before.lastIndexOf("indicatorPathKey(path)"));
    assert.ok(routeAt >= 0, "could not attribute a rejectUnknownParams call to a route");
    const head = before.slice(routeAt);
    const route = head.startsWith("indicatorPathKey") ? "/v1/indicator/{key}" : /path === "([^"]+)"/.exec(head)![1];
    out.set(route, m[1] === "VERIFY_PARAMS" ? list(verifyConst![1]) : list(m[1]));
  }
  return out;
}

test("every REST route's accepted query parameters match the OpenAPI spec exactly", () => {
  const routes = acceptedByRoute();
  assert.ok(routes.size >= 7, `expected the parameter-checked routes, found ${[...routes.keys()].join(", ")}`);
  for (const [route, accepted] of routes) {
    const op = SPEC.paths[route]?.get;
    assert.ok(op, `${route} is missing from openapi.json`);
    const documented = (op.parameters ?? []).filter((p: any) => p.in === "query").map((p: any) => p.name);
    assert.deepEqual([...documented].sort(), [...accepted].sort(), `${route}: openapi query parameters differ from what the route accepts`);
  }
});

test("/v1/verify's value alias has a spec-conformant use, and verify_claims declares its 400", () => {
  // value was required:true while the server refuses value plus claimed_value,
  // so a spec-driven client could never use the alias.
  const params = SPEC.paths["/v1/verify"].get.parameters;
  const value = params.find((p: any) => p.name === "value");
  const alias = params.find((p: any) => p.name === "claimed_value");
  assert.notEqual(value.required, true, "value cannot be required while claimed_value alone is accepted");
  assert.match(alias.description, /exactly one of value or claimed_value/);
  assert.ok(SPEC.paths["/v1/verify_claims"].post.responses["400"], "verify_claims returns 400 for body errors and must declare it");
});

test("the verify_claims request schema lists only request fields and refuses extras", () => {
  const body = SPEC.paths["/v1/verify_claims"].post.requestBody.content["application/json"].schema;
  assert.equal(body.additionalProperties, false);
  assert.deepEqual(Object.keys(body.properties).sort(), ["claims", "strict_source"]);
  const claim = body.properties.claims.items;
  assert.equal(claim.additionalProperties, false);
  const tools = readFileSync(new URL("../src/tools.ts", import.meta.url), "utf8");
  const keys = [...(/const CLAIM_KEYS = \[([^\]]*)\]/.exec(tools)![1].matchAll(/"([a-z_]+)"/g))].map((m) => m[1]);
  assert.deepEqual(Object.keys(claim.properties).sort(), [...keys].sort(), "claim properties must equal the keys parseClaims accepts");
});
