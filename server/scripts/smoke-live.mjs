// Live smoke test: exercises the real handler against real upstream APIs.
// Run: npm run smoke   (network required; safe read-only calls)
import { handleRequest } from "../src/index.ts";

const env = {
  ASSETS: { fetch: async () => new Response("site", { headers: { "content-type": "text/html" } }) },
  BASE_URL: "https://statcite.com",
  FRED_API_KEY: process.env.FRED_API_KEY || undefined,
};

const call = (path, init) => handleRequest(new Request(`https://statcite.com${path}`, init), env);
const mcp = (body) =>
  call("/mcp", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify(body),
  });

let failures = 0;
let id = 0;
async function tool(name, args, check) {
  const res = await mcp({ jsonrpc: "2.0", id: ++id, method: "tools/call", params: { name, arguments: args } });
  const rpc = await res.json();
  const isError = Boolean(rpc?.result?.isError);
  let payload;
  try { payload = JSON.parse(rpc?.result?.content?.[0]?.text ?? "null"); } catch { payload = rpc?.result?.content?.[0]?.text; }
  let ok = !isError;
  let detail = "";
  if (ok && check) {
    try { detail = check(payload) ?? ""; } catch (e) { ok = false; detail = e.message; }
  }
  if (!ok) { failures++; detail = JSON.stringify(payload).slice(0, 240); }
  console.log(`${ok ? "PASS" : "FAIL"} ${name}(${JSON.stringify(args).slice(0, 90)}) ${detail}`);
  return payload;
}

// Protocol
const init = await mcp({ jsonrpc: "2.0", id: ++id, method: "initialize", params: { protocolVersion: "2025-11-25" } });
console.log(`${init.status === 200 ? "PASS" : "FAIL"} initialize -> ${init.status}`);
const toolsList = await (await mcp({ jsonrpc: "2.0", id: ++id, method: "tools/list" })).json();
console.log(`PASS tools/list -> ${toolsList.result.tools.length} tools`);

// Core tools against live data
await tool("get_indicator", { indicator: "inflation_cpi", country: "Barbados", latest_only: true },
  (p) => `latest ${p.observations[0].period}=${p.observations[0].value?.toFixed(2)} | ${p.citation.source}`);
await tool("get_indicator", { indicator: "gdp_growth", country: "world", start_year: 2020 },
  (p) => `world growth obs=${p.observations.length}`);
await tool("get_indicator", { indicator: "govt_debt_gdp", country: "Japan", latest_only: true },
  (p) => `JPN debt ${p.observations[0].period}=${p.observations[0].value?.toFixed(1)}% src=${p.citation.source}`);
await tool("verify_stat", { indicator: "inflation_cpi", country: "USA", period: "2023", claimed_value: 4.1 },
  (p) => `verdict=${p.verdict} official=${p.official_value?.toFixed(3)}`);
await tool("verify_stat", { indicator: "gdp_growth", country: "Guyana", period: "2022", claimed_value: 62.3 },
  (p) => `verdict=${p.verdict} official=${p.official_value?.toFixed(2)}`);
await tool("country_snapshot", { country: "BRB" },
  (p) => `items=${p.indicators.length} missing=[${p.missing.join(",")}]`);
await tool("inflation_adjust", { amount: 100, from_year: 1995, to_year: 2024, country: "USA" },
  (p) => `$100 (1995) = $${p.adjusted_amount.toFixed(2)} (2024)`);
await tool("fx_convert", { amount: 100, from: "USD", to: "EUR" },
  (p) => `rate=${p.rate} date=${p.rate_date} precision=${p.precision}`);
await tool("fx_convert", { amount: 100, from: "USD", to: "BBD" },
  (p) => `rate=${p.rate} (${p.precision})`);
await tool("fx_convert", { amount: 100, from: "USD", to: "JMD", date: "2023" },
  (p) => `rate=${p.rate} (${p.rate_date})`);
await tool("fx_convert", { amount: 250, from: "GBP", to: "JPY", date: "2020-06-15" },
  (p) => `rate=${p.rate} date=${p.rate_date}`);
await tool("get_series", { series_id: "dbnomics/IMF/WEO:latest/USA.GGXWDG_NGDP", start_year: 2019 },
  (p) => `US WEO debt obs=${p.observations.length} last=${p.observations.at(-1).period}`);
await tool("get_series", { series_id: "worldbank/SP.POP.TOTL", country: "IND", start_year: 2020 },
  (p) => `India pop ${p.observations.at(-1).period}=${(p.observations.at(-1).value / 1e9).toFixed(3)}bn`);
await tool("search_indicators", { query: "reserves" }, (p) => `results=${p.results.length}`);
const s = await tool("search", { query: "unemployment jamaica" }, (p) => p.results[0].id);
await tool("fetch", { id: s.results[0].id }, (p) => `title='${p.title}'`);
await tool("list_sources", {}, (p) => `sources=${p.sources.length}`);

// REST
for (const path of [
  "/v1",
  "/v1/indicator/unemployment_rate?country=CAN&latest_only=true",
  "/v1/snapshot/Trinidad%20and%20Tobago",
  "/v1/verify?indicator=population&country=NGA&period=2023&value=223800000",
  "/v1/fx?amount=1&from=EUR&to=XCD",
  "/health",
]) {
  const res = await call(path);
  const ok = res.status === 200;
  if (!ok) failures++;
  const body = await res.text();
  console.log(`${ok ? "PASS" : "FAIL"} GET ${path} -> ${res.status} ${body.slice(0, 110).replace(/\s+/g, " ")}`);
}

console.log(failures === 0 ? "\nSMOKE: ALL PASS" : `\nSMOKE: ${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
