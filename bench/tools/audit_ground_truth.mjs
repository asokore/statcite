// bench/tools/audit_ground_truth.mjs — independent primary-source audit (METHODOLOGY §3.2).
//
// Re-fetches EVERY ground-truth value DIRECTLY from the primary APIs
// (api.worldbank.org / api.db.nomics.world). StatCite is nowhere in this code path:
// the only inputs are the frozen snapshot and the primary sources themselves.
// Diffs against the snapshot; any divergence is printed and recorded — a divergence
// is a logged deviation and a corrected, re-hashed snapshot BEFORE scoring.
//
// Output: {base}/snapshots/{run}/audit.json.

import { benchPaths, log, mapLimit, parseArgs, politeFetchJson, readJson, writeJson } from "./lib.mjs";
import path from "node:path";

const HELP = `audit_ground_truth.mjs — primary-source audit of the frozen snapshot (METHODOLOGY §3.2)

Usage: node audit_ground_truth.mjs --run P0 [--base DIR] [--help]

  --run RUN    Run id whose snapshots/{RUN}/ground_truth.json to audit.
  --base DIR   Base directory (default bench/).
  --help       Show this help.

Fetches every value directly from api.worldbank.org / api.db.nomics.world (never
StatCite), writes snapshots/{RUN}/audit.json, prints divergences, and exits non-zero
if any value diverges.`;

const REL_TOL = 1e-9; // exact same figure modulo float serialization

async function fetchWorldBankValue(iso3, wbCode, year) {
  const url = `https://api.worldbank.org/v2/country/${iso3}/indicator/${wbCode}?format=json&date=${year}`;
  const r = await politeFetchJson(url, { tag: "audit-wb" });
  if (r.status !== 200 || !Array.isArray(r.body)) return { value: undefined, url, error: `http_${r.status}` };
  const rows = Array.isArray(r.body[1]) ? r.body[1] : [];
  const hit = rows.find((row) => row.date === String(year));
  return { value: hit ? hit.value : null, url };
}

async function fetchDbnomicsValue(seriesId, year) {
  // seriesId: dbnomics/PROVIDER/DATASET/SERIES_CODE (as recorded in the snapshot).
  const parts = seriesId.split("/");
  const [, provider, dataset, ...rest] = parts;
  const code = rest.join("/");
  const url = `https://api.db.nomics.world/v22/series/${encodeURIComponent(provider)}/${encodeURIComponent(dataset)}/${encodeURIComponent(code)}?observations=1`;
  const r = await politeFetchJson(url, { tag: "audit-dbn" });
  if (r.status !== 200) return { value: undefined, url, error: `http_${r.status}` };
  const doc = (r.body?.series?.docs ?? []).find((d) => d.series_code === code) ?? (r.body?.series?.docs ?? [])[0];
  if (!doc) return { value: undefined, url, error: "series_not_found" };
  const idx = doc.period.indexOf(String(year));
  if (idx === -1) return { value: null, url };
  const raw = doc.value[idx];
  const v = typeof raw === "number" ? raw : raw == null || raw === "NA" || String(raw).trim() === "" ? null : Number(raw);
  return { value: v == null || Number.isNaN(v) ? null : v, url };
}

function diverges(a, b) {
  if (a == null && b == null) return false;
  if (a == null || b == null) return true;
  if (a === b) return false;
  const denom = Math.max(Math.abs(a), Math.abs(b));
  return Math.abs(a - b) / denom > REL_TOL;
}

async function main() {
  const args = parseArgs(process.argv.slice(2), {
    run: { type: "string" },
    base: { type: "string" },
    help: { type: "boolean" },
  });
  if (args.help) {
    console.log(HELP);
    return;
  }
  if (!args.run) throw new Error("--run is required (see --help)");
  const paths = benchPaths(args.base, args.run);
  const snapshot = readJson(path.join(paths.snapshotDir, "ground_truth.json"));
  log(`auditing ${snapshot.rows.length} snapshot rows against primary sources (StatCite not in path)`);

  const results = await mapLimit(snapshot.rows, 3, async (row) => {
    const out = {
      qid: row.qid, indicator: row.indicator, iso3: row.iso3, year: row.year,
      snapshot_value: row.value, series_id: row.series_id,
    };
    if (!row.series_id) {
      out.status = "no_series_in_snapshot"; // e.g. null probe where the whole window 422'd
      out.primary_value = null;
      out.divergent = row.value != null; // snapshot claimed a value with no series: divergent
      return out;
    }
    let res;
    if (row.series_id.startsWith("worldbank/")) {
      out.primary_api = "api.worldbank.org";
      res = await fetchWorldBankValue(row.iso3, row.series_id.slice("worldbank/".length), row.year);
    } else if (row.series_id.startsWith("dbnomics/")) {
      out.primary_api = "api.db.nomics.world";
      res = await fetchDbnomicsValue(row.series_id, row.year);
    } else {
      out.status = "unknown_source";
      out.divergent = true;
      return out;
    }
    out.primary_url = res.url;
    if (res.error) {
      out.status = `primary_fetch_error:${res.error}`;
      out.primary_value = null;
      out.divergent = true; // unauditable = treated as divergence, must be resolved
      return out;
    }
    out.primary_value = res.value;
    out.divergent = diverges(row.value, res.value);
    out.status = out.divergent ? "DIVERGENT" : "ok";
    return out;
  });

  const divergences = results.filter((r) => r.divergent);
  writeJson(path.join(paths.snapshotDir, "audit.json"), {
    run: args.run,
    audited_at: new Date().toISOString(),
    n: results.length,
    divergences: divergences.length,
    rel_tolerance: REL_TOL,
    rows: results.sort((a, b) => (a.qid < b.qid ? -1 : 1)),
  });

  if (divergences.length) {
    console.log(`\n${divergences.length} DIVERGENCES (deviation to log; snapshot must be corrected and re-hashed before scoring):`);
    for (const d of divergences) {
      console.log(`  ${d.qid} ${d.indicator} ${d.iso3} ${d.year}: snapshot=${d.snapshot_value} primary=${d.primary_value} (${d.status})`);
    }
    process.exitCode = 1;
  } else {
    log(`audit clean: ${results.length}/${results.length} values reproduced from primary sources`);
  }
  log(`audit.json written`);
}

main().catch((e) => {
  console.error(`audit_ground_truth FAILED: ${e.stack ?? e}`);
  process.exit(1);
});
