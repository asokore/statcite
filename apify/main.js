// StatCite Apify actor — the metered twin of statcite.com.
// Pay-per-event, differentiated by operation: 'statcite-verify' for verify_stat
// (the harder, higher-value query — checks a claim against the official series
// with diagnostics) and 'statcite-lookup' for everything else. Console pricing
// for each event is set separately (Apify has no in-repo pricing config file;
// see apify/README.md "Pricing").
import { Actor, log } from "apify";
import {
  getIndicator, getSeries, verifyStat, inflationAdjust, fxConvert,
  countrySnapshot, searchIndicators, listRegistry, ToolError,
} from "./core.bundle.mjs";

await Actor.init();

const ctx = {
  baseUrl: "https://statcite.com",
  fredApiKey: process.env.FRED_API_KEY || undefined,
};

const input = (await Actor.getInput()) ?? {};
const operation = input.operation ?? "indicator";
// Batch mode: `items` is an array of per-item parameter objects; otherwise the
// top-level input is the single item.
const items = Array.isArray(input.items) && input.items.length > 0 ? input.items : [input];

async function runOne(op, p) {
  switch (op) {
    case "indicator":
      return getIndicator(ctx, must(p, "indicator"), must(p, "country"), {
        start: p.start_year ? String(p.start_year) : undefined,
        end: p.end_year ? String(p.end_year) : undefined,
        transform: p.transform ?? "none",
        limit: p.latest_only ? 1 : 80,
      });
    case "series":
      return getSeries(ctx, must(p, "series_id"), {
        country: p.country || undefined,
        start: p.start_year ? String(p.start_year) : undefined,
        end: p.end_year ? String(p.end_year) : undefined,
        transform: p.transform ?? "none",
        limit: 120,
      });
    case "verify":
      return verifyStat(ctx, {
        indicator: must(p, "indicator"),
        country: p.country || undefined,
        period: String(must(p, "period")),
        claimed_value: Number(must(p, "claimed_value")),
        tolerance_abs: p.tolerance_abs != null ? Number(p.tolerance_abs) : undefined,
        tolerance_pct: p.tolerance_pct != null ? Number(p.tolerance_pct) : undefined,
      });
    case "snapshot":
      return countrySnapshot(ctx, must(p, "country"));
    case "inflation":
      return inflationAdjust(ctx, Number(must(p, "amount")), Number(must(p, "from_year")), Number(must(p, "to_year")), p.country || "USA");
    case "fx":
      return fxConvert(ctx, Number(must(p, "amount")), must(p, "from"), must(p, "to"), p.date || undefined);
    case "search":
      return { query: must(p, "query"), results: await searchIndicators(ctx, p.query) };
    case "registry":
      return { indicators: listRegistry() };
    default:
      throw new ToolError(`Unknown operation '${op}'. Use: indicator | series | verify | snapshot | inflation | fx | search | registry.`);
  }
}

function must(p, key) {
  if (p[key] == null || p[key] === "") throw new ToolError(`Missing required input '${key}' for this operation.`);
  return p[key];
}

let succeeded = 0;
let budgetReached = false;
for (const [i, item] of items.entries()) {
  const op = item.operation ?? operation;
  try {
    const result = await runOne(op, item);
    // Charge one pay-per-event unit per successful query (no charge on failures).
    // 'verify' is priced separately from lookups — see apify/README.md "Pricing".
    // Respect the run's charge budget: stop serving once the limit is reached.
    try {
      const eventName = op === "verify" ? "statcite-verify" : "statcite-lookup";
      const charge = await Actor.charge({ eventName, count: 1 });
      if (charge?.eventChargeLimitReached) {
        budgetReached = true;
      }
    } catch (e) {
      // Not running as pay-per-event (e.g. local run) — continue without charging.
      log.debug(`charge skipped: ${e.message}`);
    }
    await Actor.pushData({ ok: true, operation: op, input: item === input ? undefined : item, result });
    succeeded++;
    if (budgetReached && i < items.length - 1) {
      await Actor.pushData({
        ok: false,
        error: `Charge budget reached after ${succeeded} items; ${items.length - i - 1} remaining items were not processed. Increase the run's max charge to continue.`,
      });
      log.warning("charge budget reached — stopping batch");
      break;
    }
  } catch (e) {
    const message = e instanceof ToolError ? e.message : `Error: ${e.message}`;
    await Actor.pushData({ ok: false, operation: op, input: item === input ? undefined : item, error: message });
    log.warning(`item ${i} failed: ${message}`);
  }
}

log.info(`Done: ${succeeded}/${items.length} items succeeded.`);
await Actor.exit();
