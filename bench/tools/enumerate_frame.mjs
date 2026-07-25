// bench/tools/enumerate_frame.mjs — enumerate the eligible cell universe (METHODOLOGY §1.1).
//
// For every registry economy (aggregates excluded mechanically): rank by nominal GDP
// (latest outturn, gdp_current_usd, latest_only=true), assign tiers T1 ranks 1-20 /
// T2 21-60 / T3 61-120 / T4 121+, then fetch each of the 12 headline indicators
// (plus the 2 null-probe indicators) once per economy over 2018-2022 and record
// per-year eligibility (exists, non-null, outturn) with an attrition reason.
//
// Outputs (under --base, default bench/):
//   frame/frame.json       — every cell with eligibility, value, source, reason
//   frame/tiers.json       — GDP ranking and tier list
//   frame/attrition.md     — tier × indicator × reason table
//   frame/exclusions.json  — contested-data exclusion list (each entry justified)
//
// Resumable: all HTTP goes through lib.mjs politeFetchJson (disk cache under bench/state/).

import {
  HEADLINE_INDICATORS, NULL_PROBE_INDICATORS, YEARS_HEADLINE, REVISION_CLASS,
  loadEconomies, log, mapLimit, obsFor, isProjectionObs, isTransientUpstreamError, parseArgs, scIndicatorRobust, tierOf,
  writeJson, writeText, benchPaths,
} from "./lib.mjs";
import path from "node:path";

const HELP = `enumerate_frame.mjs — enumerate the eligible cell universe (METHODOLOGY §1.1)

Usage: node enumerate_frame.mjs [--limit-economies N] [--base DIR] [--help]

  --limit-economies N   Probe mode: only the first N economies of a fixed,
                        tier-diverse probe order (for shakedown runs; pair with
                        --base so the real bench/frame/ is not overwritten).
  --base DIR            Output base directory (default: bench/). Outputs go to
                        DIR/frame/.
  --help                Show this help.

All HTTP is polite (lib.mjs pool) and disk-cached under bench/state/, so an
interrupted run resumes without refetching.`;

// Fixed probe order: deliberately spans expected tiers so --limit-economies runs
// exercise T1..T4 logic (large -> small), then falls back to ISO3 order.
const PROBE_ORDER = ["USA", "JPN", "DEU", "BRA", "VNM", "KEN", "FJI", "BRB", "IND", "NGA", "ARG", "ISL", "TON", "GHA", "URY", "MNG"];

async function main() {
  const args = parseArgs(process.argv.slice(2), {
    "limit-economies": { type: "number" },
    base: { type: "string" },
    help: { type: "boolean" },
  });
  if (args.help) {
    console.log(HELP);
    return;
  }
  const paths = benchPaths(args.base, "frame");
  const frameDir = paths.frameDir;

  let economies = loadEconomies();
  if (args["limit-economies"]) {
    const n = args["limit-economies"];
    const byIso = new Map(economies.map((e) => [e.iso3, e]));
    const picked = [];
    for (const iso of PROBE_ORDER) {
      if (picked.length >= n) break;
      if (byIso.has(iso)) picked.push(byIso.get(iso));
    }
    for (const e of [...economies].sort((a, b) => (a.iso3 < b.iso3 ? -1 : 1))) {
      if (picked.length >= n) break;
      if (!picked.includes(e)) picked.push(e);
    }
    economies = picked;
    log(`probe mode: ${economies.length} economies (${economies.map((e) => e.iso3).join(", ")})`);
  } else {
    log(`full frame: ${economies.length} economies`);
  }

  // ---- 1. GDP ranking -----------------------------------------------------
  log("ranking economies by nominal GDP (gdp_current_usd, latest outturn)…");
  const gdpRows = await mapLimit(economies, 3, async (e) => {
    const r = await scIndicatorRobust("gdp_current_usd", e.iso3, { latestOnly: true }, { attempts: 4 });
    if (r.status !== 200) {
      const msg = JSON.stringify(r.body?.error?.message ?? `http_${r.status}`).slice(0, 160);
      log(`  GDP fetch failed for ${e.iso3}: ${msg}`);
      return { ...e, gdp_usd: null, gdp_year: null, gdp_error: msg };
    }
    const o = (r.body.observations ?? [])[0];
    return { ...e, gdp_usd: o?.value ?? null, gdp_year: o?.period ?? null };
  });
  gdpRows.sort((a, b) => {
    if (a.gdp_usd == null && b.gdp_usd == null) return a.iso3 < b.iso3 ? -1 : 1;
    if (a.gdp_usd == null) return 1;
    if (b.gdp_usd == null) return -1;
    return b.gdp_usd - a.gdp_usd || (a.iso3 < b.iso3 ? -1 : 1);
  });
  const tiers = gdpRows.map((e, i) => ({
    iso3: e.iso3, name: e.name, rank: i + 1, tier: tierOf(i + 1),
    gdp_usd: e.gdp_usd, gdp_year: e.gdp_year, ...(e.gdp_error ? { gdp_error: e.gdp_error } : {}),
  }));
  const tierByIso = new Map(tiers.map((t) => [t.iso3, t.tier]));
  writeJson(path.join(frameDir, "tiers.json"), {
    generated_at: new Date().toISOString(),
    rule: "ranked by nominal GDP (current US$, latest published outturn at enumeration time); T1 ranks 1-20, T2 21-60, T3 61-120, T4 121+; economies with no retrievable GDP rank last (T4), ties broken by ISO3",
    economies: tiers,
  });
  log(`tiers written (${tiers.length} economies; T1=${tiers.filter((t) => t.tier === "T1").length})`);

  // ---- 2. Per economy × indicator × year eligibility ------------------------
  const allIndicators = [...HEADLINE_INDICATORS, ...NULL_PROBE_INDICATORS];
  const cells = [];
  const seriesMeta = [];
  const tasks = [];
  for (const e of economies) for (const key of allIndicators) tasks.push({ e, key });
  log(`fetching ${tasks.length} economy×indicator series (2018-2022)…`);

  let done = 0;
  await mapLimit(tasks, 3, async ({ e, key }) => {
    const tier = tierByIso.get(e.iso3);
    const isProbeInd = NULL_PROBE_INDICATORS.includes(key);
    let body = null;
    let fetchReason = null;
    const r = await scIndicatorRobust(key, e.iso3, { start: 2018, end: 2022 }, { attempts: 4 });
    if (r.status === 200) body = r.body;
    else if (isTransientUpstreamError(r.status, r.body)) fetchReason = "fetch_failed_transient";
    else fetchReason = r.status === 422 ? "no_series_in_window" : `http_${r.status}`;
    if (body) {
      seriesMeta.push({
        iso3: e.iso3, indicator: key, series_id: body.series_id,
        source: String(body.series_id ?? "").startsWith("worldbank/") ? "worldbank" : "dbnomics_imf_weo",
        notes: body.notes ?? [],
      });
    }
    for (const year of YEARS_HEADLINE) {
      const cell = {
        iso3: e.iso3, country_name: e.name, tier, indicator: key, year,
        revision_class: REVISION_CLASS[key] ?? null, null_probe_indicator: isProbeInd || undefined,
      };
      if (!body) {
        cell.eligible = false;
        cell.reason = fetchReason;
      } else {
        const o = obsFor(body, year);
        if (!o) {
          cell.eligible = false;
          cell.reason = "missing_year";
        } else if (o.value == null) {
          cell.eligible = false;
          cell.reason = "null_value";
        } else if (isProjectionObs(o)) {
          cell.eligible = false;
          cell.reason = "projection";
          cell.value = o.value;
        } else {
          cell.eligible = !isProbeInd; // probe indicators are never headline-eligible
          if (isProbeInd) cell.reason = "null_probe_indicator";
          cell.value = o.value;
          cell.series_id = body.series_id;
          cell.source = String(body.series_id ?? "").startsWith("worldbank/") ? "worldbank" : "dbnomics_imf_weo";
        }
      }
      cells.push(cell);
    }
    done++;
    if (done % 50 === 0) log(`  ${done}/${tasks.length} series done`);
  });

  // ---- 3. Exclusions (contested list, each entry justified) -----------------
  const exclusions = [];
  const CLASS_C = HEADLINE_INDICATORS.filter((k) => REVISION_CLASS[k] === "C");
  if (economies.some((e) => e.iso3 === "VEN")) {
    exclusions.push({
      iso3: "VEN", country_name: "Venezuela", indicators: CLASS_C, years: YEARS_HEADLINE,
      reason: "contested_official_data",
      justification: "Venezuela's Class-C macro aggregates for 2018-2022 (GDP levels and growth, debt, fiscal and external balances, FDI ratios) span a hyperinflation and reporting breakdown in which official figures are disputed and heavily model-imputed; grading recall against them measures politics, not memory (METHODOLOGY §1.3).",
    });
  }
  // WEO-only entities: no World Bank WDI presence at all (every WB-backed indicator
  // failed to return a series) but at least one IMF WEO-backed series succeeded.
  const byEcon = new Map();
  for (const c of cells) {
    if (c.null_probe_indicator) continue;
    if (!byEcon.has(c.iso3)) byEcon.set(c.iso3, []);
    byEcon.get(c.iso3).push(c);
  }
  for (const [iso3, econCells] of byEcon) {
    const wbAny = econCells.some((c) => c.source === "worldbank");
    const weoAny = econCells.some((c) => c.source === "dbnomics_imf_weo");
    if (!wbAny && weoAny) {
      exclusions.push({
        iso3, country_name: econCells[0].country_name, indicators: "*", years: YEARS_HEADLINE,
        reason: "weo_only_entity",
        justification: "Entity absent from World Bank WDI (no WB-sourced series retrievable for any headline indicator); its only coverage is IMF WEO. Cross-source auditability (METHODOLOGY §3.2) and the contested-data rule (§1.3) exclude WEO-only entities from the frame.",
      });
    }
  }
  writeJson(path.join(frameDir, "exclusions.json"), {
    generated_at: new Date().toISOString(),
    spec: "METHODOLOGY §1.3 contested-data exclusion list. Every entry carries a justification. generate_bank.mjs applies these on top of frame eligibility.",
    exclusions,
  });
  // Mark excluded cells in the frame for transparency.
  for (const ex of exclusions) {
    for (const c of cells) {
      if (c.iso3 !== ex.iso3) continue;
      if (ex.indicators !== "*" && !ex.indicators.includes(c.indicator)) continue;
      if (!ex.years.includes(c.year)) continue;
      c.excluded = true;
      c.exclusion_reason = ex.reason;
    }
  }

  // ---- 4. frame.json --------------------------------------------------------
  writeJson(path.join(frameDir, "frame.json"), {
    generated_at: new Date().toISOString(),
    statcite_base: process.env.STATCITE_BASE || "https://statcite.com",
    economies: economies.length,
    probe_mode: Boolean(args["limit-economies"]) || undefined,
    indicators: allIndicators,
    years: YEARS_HEADLINE,
    series_meta: seriesMeta.sort((a, b) => (a.iso3 + a.indicator < b.iso3 + b.indicator ? -1 : 1)),
    cells: cells.sort((a, b) => ((a.iso3 + a.indicator + a.year) < (b.iso3 + b.indicator + b.year) ? -1 : 1)),
  });

  // ---- 5. attrition.md (tier × indicator × reason) ---------------------------
  const reasons = new Set();
  const counts = new Map(); // tier|indicator|reason -> n
  for (const c of cells) {
    if (c.null_probe_indicator) continue;
    const reason = c.excluded ? `excluded_${c.exclusion_reason}` : c.eligible ? "eligible" : c.reason;
    reasons.add(reason);
    const k = `${c.tier}|${c.indicator}|${reason}`;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const reasonList = ["eligible", ...[...reasons].filter((r) => r !== "eligible").sort()];
  let md = `# Frame attrition — tier × indicator × reason\n\nGenerated ${new Date().toISOString()} from ${economies.length} economies × ${HEADLINE_INDICATORS.length} indicators × ${YEARS_HEADLINE.length} years.\n`;
  md += `\nReasons: \`missing_year\` (no observation returned for that year), \`null_value\` (observation present, value null), \`projection\` (flagged IMF WEO estimate/projection, ineligible per §1.4), \`no_series_in_window\`/\`fetch_failed\` (series not retrievable), \`excluded_*\` (contested-data list, see exclusions.json).\n`;
  for (const tier of ["T1", "T2", "T3", "T4"]) {
    md += `\n## ${tier}\n\n| indicator | ${reasonList.join(" | ")} | total |\n|---|${reasonList.map(() => "---:").join("|")}|---:|\n`;
    for (const ind of HEADLINE_INDICATORS) {
      const row = reasonList.map((r) => counts.get(`${tier}|${ind}|${r}`) ?? 0);
      const total = row.reduce((a, b) => a + b, 0);
      md += `| ${ind} | ${row.join(" | ")} | ${total} |\n`;
    }
  }
  writeText(path.join(frameDir, "attrition.md"), md);

  const eligibleN = cells.filter((c) => c.eligible && !c.excluded).length;
  log(`frame written: ${cells.length} cells, ${eligibleN} eligible headline cells, ${exclusions.length} exclusion entries`);
  log(`outputs in ${frameDir}`);
}

main().catch((e) => {
  console.error(`enumerate_frame FAILED: ${e.stack ?? e}`);
  process.exit(1);
});
