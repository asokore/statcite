// bench/tools/snapshot_weights.mjs — per-economy weights for the §1.3 reweighting
// sensitivity (headline recomputed under GDP-weighted, population-weighted, and
// equal weights). Frozen BEFORE model calls like every other snapshot artifact.
//
// For every distinct economy in the run's question bank, fetches gdp_current_usd
// and population (latest available year <= the frame's last headline year + 3) via
// StatCite and writes {base}/snapshots/{run}/weights.json. Missing weights are
// recorded as null and the affected economy falls back to its equal weight in the
// sensitivity (disclosed in the report), never silently dropped.

import { benchPaths, log, parseArgs, readJson, scIndicatorRobust, writeJson } from "./lib.mjs";
import path from "node:path";

const HELP = `snapshot_weights.mjs — freeze per-economy GDP/population weights (§1.3)

Usage: node snapshot_weights.mjs --run R2 [--base DIR] [--help]`;

function latestValue(body) {
  const obs = (body?.observations ?? []).filter((o) => o.value != null);
  return obs.length ? { year: obs[obs.length - 1].period, value: obs[obs.length - 1].value } : null;
}

async function main() {
  const args = parseArgs(process.argv.slice(2), {
    run: { type: "string" },
    base: { type: "string" },
    help: { type: "boolean" },
  });
  if (args.help) return void console.log(HELP);
  if (!args.run) throw new Error("--run is required");
  const paths = benchPaths(args.base, args.run);
  const bank = readJson(paths.questions);
  const economies = [...new Set(bank.questions.filter((q) => q.segment === "headline").map((q) => q.iso3))].sort();
  log(`fetching weights for ${economies.length} economies`);

  async function fetchOne(indicator, iso3) {
    // A null here is almost always a transient upstream blip, not a data gap
    // (USA population is never null) — retry with a pause before accepting it.
    for (let attempt = 0; attempt < 3; attempt++) {
      const r = await scIndicatorRobust(indicator, iso3, { start: 2018, end: 2026 }, { attempts: 3, forceRefresh: true });
      const v = r.status === 200 ? latestValue(r.body) : null;
      if (v) return v;
      await new Promise((res) => setTimeout(res, 3000));
    }
    return null;
  }
  const rows = [];
  for (const iso3 of economies) {
    rows.push({
      iso3,
      gdp_current_usd: await fetchOne("gdp_current_usd", iso3),
      population: await fetchOne("population", iso3),
    });
    log(`  ${iso3}: gdp ${rows.at(-1).gdp_current_usd?.value ?? "null"} pop ${rows.at(-1).population?.value ?? "null"}`);
  }
  writeJson(path.join(paths.snapshotDir, "weights.json"), {
    run: args.run,
    snapshot_at: new Date().toISOString(),
    note: "Reweighting sensitivity weights (§1.3). Null weights fall back to the economy's equal weight, disclosed in the report.",
    n: rows.length,
    rows,
  });
  log(`weights.json written (${rows.length} economies)`);
}

import { pathToFileURL } from "node:url";
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(`snapshot_weights FAILED: ${e.stack ?? e}`);
    process.exit(1);
  });
}
