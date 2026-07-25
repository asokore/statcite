// Local sanity test of the bundled core (no Apify platform needed).
import { verifyStat, fxConvert, listRegistry } from "../core.bundle.mjs";
const ctx = { baseUrl: "https://statcite.com" };
const v = await verifyStat(ctx, { indicator: "inflation_cpi", country: "USA", period: "2023", claimed_value: 4.1 });
console.log("verify:", v.verdict, v.official_value?.toFixed(3));
const f = await fxConvert(ctx, 100, "USD", "BBD");
console.log("fx:", f.converted_amount, f.precision);
console.log("registry:", listRegistry().length, "indicators");
if (v.verdict !== "match" || Math.abs(f.converted_amount - 200) > 1e-6) { console.error("LOCAL TEST FAILED"); process.exit(1); }
console.log("ACTOR CORE: PASS");
