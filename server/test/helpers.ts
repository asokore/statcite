// Test helpers: fixture-backed fetch stub + request runner.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { handleRequest, type Env } from "../src/index.ts";
import { _clearMemCache } from "../src/core/upstream.ts";

const fixturesDir = fileURLToPath(new URL("./fixtures/", import.meta.url));

function fixture(name: string): string {
  return readFileSync(`${fixturesDir}${name}.json`, "utf8");
}

type Route = { test: (url: string) => boolean; body: () => string; status?: number };

const routes: Route[] = [
  { test: (u) => u.includes("api.worldbank.org") && u.includes("FP.CPI.TOTL.ZG") && u.includes("/BRB/"), body: () => fixture("wb-bb-inflation") },
  { test: (u) => u.includes("api.worldbank.org") && u.includes("NY.GDP.MKTP.KD.ZG%3B") , body: () => fixture("wb-usa-multi-mrv") },
  { test: (u) => u.includes("api.worldbank.org") && u.includes("NY.GDP.MKTP.KD.ZG;"), body: () => fixture("wb-usa-multi-mrv") },
  { test: (u) => u.includes("api.worldbank.org") && u.includes("FP.CPI.TOTL?") && u.includes("/USA/"), body: () => fixture("wb-usa-cpi-index") },
  { test: (u) => u.includes("api.worldbank.org") && u.includes("PA.NUS.FCRF") && u.includes("/BRB/"), body: () => fixture("wb-fx-brb") },
  { test: (u) => u.includes("api.worldbank.org") && u.includes("NOT.A.CODE"), body: () => fixture("wb-bad-indicator") },
  { test: (u) => u.includes("api.frankfurter.dev/v1/currencies"), body: () => fixture("frankfurter-currencies") },
  { test: (u) => u.includes("api.frankfurter.dev/v1/latest"), body: () => fixture("frankfurter-latest") },
  { test: (u) => u.includes("api.frankfurter.dev/v1/2020-01-01..2020-12-31"), body: () => fixture("frankfurter-range-2020") },
  { test: (u) => u.includes("api.frankfurter.dev/v1/2020-06-15"), body: () => fixture("frankfurter-hist") },
  { test: (u) => u.includes("api.db.nomics.world") && u.includes("/search"), body: () => fixture("dbnomics-search") },
  { test: (u) => u.includes("api.db.nomics.world") && u.includes("BRB.NGDP_RPCH"), body: () => fixture("dbnomics-series") },
];

export const unmatchedUrls: string[] = [];

export function installFetchStub(): void {
  _clearMemCache();
  unmatchedUrls.length = 0;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const route = routes.find((r) => r.test(url));
    if (!route) {
      unmatchedUrls.push(url);
      return new Response(JSON.stringify({ error: "no fixture for " + url }), { status: 599 });
    }
    return new Response(route.body(), {
      status: route.status ?? 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
}

export const testEnv: Env = {
  ASSETS: {
    fetch: async () =>
      new Response("<!doctype html><title>StatCite</title>", { headers: { "content-type": "text/html" } }),
  },
  BASE_URL: "https://statcite.test",
};

export async function call(path: string, init?: RequestInit): Promise<Response> {
  return handleRequest(new Request(`https://statcite.test${path}`, init), testEnv);
}

export async function mcpCall(body: unknown, headers: Record<string, string> = {}): Promise<Response> {
  return call("/mcp", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...headers },
    body: JSON.stringify(body),
  });
}

let idCounter = 100;
export async function mcpTool(name: string, args: Record<string, unknown>): Promise<{ res: Response; rpc: any; payload: any; isError: boolean }> {
  const res = await mcpCall({ jsonrpc: "2.0", id: ++idCounter, method: "tools/call", params: { name, arguments: args } });
  const rpc = await res.json() as any;
  const text = rpc?.result?.content?.[0]?.text;
  let payload: any = undefined;
  try { payload = text ? JSON.parse(text) : undefined; } catch { payload = text; }
  return { res, rpc, payload, isError: Boolean(rpc?.result?.isError) };
}
