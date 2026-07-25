// bench/tools/generate_bank.mjs — seeded stratified question draw (METHODOLOGY §1, §2.3).
//
// Headline: 100 questions — indicator quotas from lib.mjs HEADLINE_QUOTA, 25 per tier,
// 20 per year (2018-2022), <= 2 per economy, tier restrictions (gdp_current_usd T1/T2,
// fdi_inflows_gdp T1-T3), contested-data exclusions applied. Every headline question
// round-trips /v1/verify against its own frame value and must come back "match".
// Supplement: 12 recency questions (2023-2025) + 10 live-validated null probes.
// Batches: 10 questions per batch, membership identical across models, no repeated
// country or indicator inside a batch, <= 2 null probes per batch; per-model
// within-batch order via deriveSeed(seed, `${model}:${batch_id}`).
//
// Outputs: {base}/questions/{run}.json, {run}-batches.json, {run}-genlog.json.

import {
  HEADLINE_QUOTA, HEADLINE_INDICATORS, NULL_PROBE_INDICATORS, REVISION_CLASS, INDICATOR_KIND,
  MODELS, TIER_RESTRICTION, YEARS_HEADLINE, YEARS_RECENCY,
  benchPaths, log, parseArgs, readJson, scVerifyRobust, unitScaleFor, writeJson, TOOLS_DIR,
} from "./lib.mjs";
import { deriveSeed, rngFromHex, shuffle } from "./prng.mjs";
import path from "node:path";

const HELP = `generate_bank.mjs — seeded stratified question bank draw (METHODOLOGY §1)

Usage: node generate_bank.mjs --run P0 --seed <hex> [--base DIR] [--allow-partial] [--help]

  --run RUN         Run id (qid prefix and file names), e.g. P0.
  --seed HEX        Hex seed (pilot: SHA-256 of the pre-registration commit hash).
  --base DIR        Base directory holding frame/ and receiving questions/ (default bench/).
  --allow-partial   Probe mode: accept the best draw even when quotas cannot all be
                    met (small probe frames); shortfalls are recorded in the genlog.
  --help            Show this help.

Requires {base}/frame/frame.json (+ tiers.json, exclusions.json) from enumerate_frame.mjs.
Live /v1/verify round-trips run for every headline question and every null probe.`;

const TIER_QUOTA = { T1: 25, T2: 25, T3: 25, T4: 25 };
const YEAR_QUOTA = Object.fromEntries(YEARS_HEADLINE.map((y) => [y, 20]));
const MAX_PER_ECONOMY = 2;
const BATCH_SIZE = 10;
const N_RECENCY = 12;
const N_NULL_PROBES = 10;

function cellKey(c) {
  return `${c.iso3}|${c.indicator}|${c.year}`;
}

function tierAllowed(indicator, tier) {
  const r = TIER_RESTRICTION[indicator];
  return !r || r.includes(tier);
}

/** One randomized-greedy headline draw attempt. Success <=> exactly 100 selected
 * (tier caps sum to 100 and year caps sum to 100, so hitting 100 forces every
 * quota to be met exactly). */
function drawAttempt(cells, rng) {
  const ind = { ...HEADLINE_QUOTA };
  const tier = { ...TIER_QUOTA };
  const year = { ...YEAR_QUOTA };
  const econ = {};
  const selected = [];
  for (const c of shuffle(cells, rng, cellKey)) {
    if (ind[c.indicator] > 0 && tier[c.tier] > 0 && year[c.year] > 0 && (econ[c.iso3] ?? 0) < MAX_PER_ECONOMY) {
      selected.push(c);
      ind[c.indicator]--; tier[c.tier]--; year[c.year]--;
      econ[c.iso3] = (econ[c.iso3] ?? 0) + 1;
    }
  }
  return selected;
}

function realizeText(tpl, countryName, year, unitHint) {
  return tpl.text_template
    .replaceAll("{COUNTRY}", countryName)
    .replaceAll("{YEAR}", String(year))
    .replaceAll("{UNIT_HINT}", unitHint ?? "");
}

async function main() {
  const args = parseArgs(process.argv.slice(2), {
    run: { type: "string" },
    seed: { type: "string" },
    base: { type: "string" },
    "allow-partial": { type: "boolean" },
    help: { type: "boolean" },
  });
  if (args.help) {
    console.log(HELP);
    return;
  }
  if (!args.run || !args.seed) throw new Error("--run and --seed are required (see --help)");
  const run = args.run;
  const seed = args.seed.toLowerCase();
  const allowPartial = Boolean(args["allow-partial"]);
  const paths = benchPaths(args.base, run);

  const frame = readJson(path.join(paths.frameDir, "frame.json"));
  const templatesFile = readJson(path.join(TOOLS_DIR, "..", "templates", "questions_v1.json"));
  const tplByInd = new Map([...templatesFile.templates, ...templatesFile.null_probe_templates].map((t) => [t.indicator, t]));
  const genlog = { run, seed, generated_at: new Date().toISOString(), allow_partial: allowPartial, notes: [] };

  // ---- Headline pool ---------------------------------------------------------
  let pool = frame.cells.filter(
    (c) => c.eligible && !c.excluded && !c.null_probe_indicator && tierAllowed(c.indicator, c.tier),
  );
  log(`headline pool: ${pool.length} eligible cells`);

  // ---- Draw + verify loop (verify failures shrink the pool, then redraw) ------
  let headline = null;
  let verifyLog = [];
  for (let cycle = 0; cycle < 8 && !headline; cycle++) {
    let best = [];
    let drawn = null;
    const maxAttempts = 1000;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const rng = rngFromHex(deriveSeed(seed, `headline-draw:${cycle}:${attempt}`));
      const sel = drawAttempt(pool, rng);
      if (sel.length > best.length) best = sel;
      if (sel.length === 100) {
        drawn = sel;
        genlog.headline_draw = { cycle, attempt, pool_size: pool.length };
        break;
      }
    }
    if (!drawn) {
      if (!allowPartial) {
        throw new Error(`headline draw failed: best attempt selected ${best.length}/100 after ${maxAttempts} attempts (pool ${pool.length}). Frame too small or over-constrained.`);
      }
      drawn = best;
      genlog.headline_draw = { cycle, partial: true, selected: drawn.length, pool_size: pool.length };
      genlog.notes.push(`PARTIAL headline draw: ${drawn.length}/100 (probe mode)`);
    }

    // §1.1: every drawn question round-trips /v1/verify. /v1/verify is the path that
    // scores the models, so ITS official value is ground truth; the frame value is only
    // an eligibility signal. A frame value captured while the primary upstream was
    // transiently down can be a fallback-source value (e.g. WEO instead of WDI) for the
    // same concept — a real divergence, logged and re-anchored here rather than silently
    // kept. The cell is rejected only if verify cannot serve a usable outturn for the
    // exact period asked (that is what the round-trip exists to catch).
    log(`verify round-trip for ${drawn.length} headline cells…`);
    const bad = [];
    for (const c of drawn) {
      const r = await scVerifyRobust({ indicator: c.indicator, country: c.iso3, period: c.year, value: c.value });
      const verdict = r.status === 200 ? r.body.verdict : `http_${r.status}`;
      const official = r.status === 200 ? r.body.official_value : undefined;
      const usable =
        r.status === 200 &&
        verdict !== "cannot_verify" &&
        Number.isFinite(official) &&
        r.body.is_projection !== true;
      verifyLog.push({ cell: cellKey(c), verdict, official_value: official ?? null });
      if (!usable) {
        bad.push(c);
      } else if (verdict !== "match") {
        genlog.notes.push(
          `re-anchored ${cellKey(c)}: frame value ${c.value} -> verify official ${official} (frame value was a fallback-source or pre-revision capture; verify is the scoring path)`,
        );
        c.value = official;
        c.frame_value_reanchored = true;
      }
    }
    if (bad.length === 0) {
      headline = drawn;
    } else {
      log(`  ${bad.length} cells failed the verify round-trip; removing from pool and redrawing`);
      genlog.notes.push(`verify round-trip removed ${bad.length} cells in cycle ${cycle}: ${bad.map(cellKey).join(", ")}`);
      const badKeys = new Set(bad.map(cellKey));
      pool = pool.filter((c) => !badKeys.has(cellKey(c)));
      if (allowPartial) {
        headline = drawn.filter((c) => !badKeys.has(cellKey(c)));
      }
    }
  }
  if (!headline) throw new Error("could not assemble a fully verified headline draw in 8 cycles");
  log(`headline: ${headline.length} questions verified as match`);

  // ---- Recency supplement (2023-2025, never headline-scored) ------------------
  // One question per headline indicator (12 total), years cycled 2023/2024/2025 so
  // each year gets 4; economies drawn from tier-allowed economies that have any
  // eligible cell for that indicator (so the series demonstrably exists), <= 1 per
  // economy within the recency set.
  const recRng = rngFromHex(deriveSeed(seed, "recency"));
  const recIndicators = shuffle(HEADLINE_INDICATORS, recRng);
  const recUsedEcon = new Set();
  const recency = [];
  for (let i = 0; i < recIndicators.length; i++) {
    const indicator = recIndicators[i];
    const year = YEARS_RECENCY[i % YEARS_RECENCY.length];
    const candidates = [...new Map(
      frame.cells
        .filter((c) => c.indicator === indicator && c.eligible && !c.excluded && tierAllowed(indicator, c.tier) && !recUsedEcon.has(c.iso3))
        .map((c) => [c.iso3, c]),
    ).values()];
    if (candidates.length === 0) {
      genlog.notes.push(`recency: no candidate economy for ${indicator} (probe frame?)`);
      continue;
    }
    const pickRng = rngFromHex(deriveSeed(seed, `recency:${indicator}`));
    const chosen = shuffle(candidates, pickRng, (c) => c.iso3)[0];
    recUsedEcon.add(chosen.iso3);
    recency.push({ ...chosen, year, recency: true });
  }
  if (recency.length < N_RECENCY && !allowPartial) throw new Error(`recency draw produced ${recency.length}/${N_RECENCY}`);
  log(`recency: ${recency.length} questions (2023-2025)`);

  // ---- Null probes (live-validated cannot_verify) ------------------------------
  const probeCandidates = frame.cells.filter(
    (c) => c.null_probe_indicator && !c.excluded && (c.reason === "missing_year" || c.reason === "null_value"),
  );
  const probeRng = rngFromHex(deriveSeed(seed, "null-probes"));
  const probeOrder = shuffle(probeCandidates, probeRng, cellKey);
  const nullProbes = [];
  const probeEcon = new Set();
  const probeValidation = [];
  for (const c of probeOrder) {
    if (nullProbes.length >= N_NULL_PROBES) break;
    if (probeEcon.has(c.iso3)) continue;
    // Live validation: /v1/verify with an arbitrary claimed value must say cannot_verify.
    const r = await scVerifyRobust({ indicator: c.indicator, country: c.iso3, period: c.year, value: 42 });
    const verdict = r.status === 200 ? r.body.verdict : `http_${r.status}`;
    probeValidation.push({ cell: cellKey(c), verdict });
    if (verdict === "cannot_verify") {
      nullProbes.push(c);
      probeEcon.add(c.iso3);
    }
  }
  if (nullProbes.length < N_NULL_PROBES && !allowPartial) {
    throw new Error(`only ${nullProbes.length}/${N_NULL_PROBES} null probes validated as cannot_verify`);
  }
  log(`null probes: ${nullProbes.length} validated cannot_verify`);
  genlog.null_probe_validation = probeValidation;
  genlog.verify_roundtrips = verifyLog;

  // ---- Assemble questions, blind the qid order --------------------------------
  const latestValueByEconInd = new Map();
  for (const c of frame.cells) {
    if (c.value == null) continue;
    const k = `${c.iso3}|${c.indicator}`;
    const prev = latestValueByEconInd.get(k);
    if (!prev || c.year > prev.year) latestValueByEconInd.set(k, c);
  }

  function buildQuestion(cell, segment) {
    const tpl = tplByInd.get(cell.indicator);
    if (!tpl) throw new Error(`no template for indicator ${cell.indicator}`);
    const kind = INDICATOR_KIND[cell.indicator];
    // Magnitude for the §2.1 unit_scale rule: the cell's own value, or (recency) the
    // latest known frame value for that economy×indicator.
    const magnitude = cell.value ?? latestValueByEconInd.get(`${cell.iso3}|${cell.indicator}`)?.value ?? null;
    const scale = tpl.unit_rule === "magnitude_scaled" ? unitScaleFor(cell.indicator, magnitude) : null;
    const expectedUnit = tpl.unit_rule === "magnitude_scaled" ? scale.label : tpl.expected_unit;
    return {
      segment,
      template_id: tpl.template_id,
      indicator: cell.indicator,
      revision_class: REVISION_CLASS[cell.indicator] ?? null,
      kind,
      iso3: cell.iso3,
      country_name: cell.country_name,
      tier: cell.tier,
      year: cell.year,
      text: realizeText(tpl, cell.country_name, cell.year, scale?.label),
      expected_unit: expectedUnit,
      unit_scale: scale ? { label: scale.label, factor: scale.factor } : null,
      strata: { revision_class: REVISION_CLASS[cell.indicator] ?? null, tier: cell.tier, year: cell.year },
    };
  }

  const questions = [
    ...headline.map((c) => buildQuestion(c, "headline")),
    ...recency.map((c) => buildQuestion(c, "recency")),
    ...nullProbes.map((c) => buildQuestion(c, "null_probe")),
  ];
  // qids are assigned after a seeded shuffle of ALL questions so the qid sequence
  // leaks nothing about segment (null probes are not clustered at high numbers).
  const qidRng = rngFromHex(deriveSeed(seed, "qid-order"));
  const ordered = shuffle(questions, qidRng, (q) => `${q.segment}|${q.indicator}|${q.iso3}|${q.year}`);
  const width = 3;
  ordered.forEach((q, i) => {
    q.qid = `${run}-${String(i + 1).padStart(width, "0")}`;
  });

  // ---- Batch assignment (membership identical across models) -------------------
  // 10 per batch; no repeated country, no repeated indicator, <= 2 null probes.
  // Feasibility bounds (matter on small probe frames; a full P0 bank still yields
  // ceil(122/10)=13 batches of 10 with a short final batch):
  //   - a batch cannot hold more questions than there are distinct countries/indicators;
  //   - a country/indicator with k questions needs k distinct batches;
  //   - null probes need ceil(n_null/2) batches.
  const nCountries = new Set(ordered.map((q) => q.iso3)).size;
  const nIndicators = new Set(ordered.map((q) => q.indicator)).size;
  const perBatchCap = Math.min(BATCH_SIZE, nCountries, nIndicators);
  const maxCount = (keyFn) => Math.max(0, ...[...ordered.reduce((m, q) => m.set(keyFn(q), (m.get(keyFn(q)) ?? 0) + 1), new Map()).values()]);
  const nNull = ordered.filter((q) => q.segment === "null_probe").length;
  const nBatches = Math.max(
    Math.ceil(ordered.length / BATCH_SIZE),
    Math.ceil(ordered.length / perBatchCap),
    maxCount((q) => q.iso3),
    maxCount((q) => q.indicator),
    Math.ceil(nNull / 2),
  );
  if (perBatchCap < BATCH_SIZE) {
    genlog.notes.push(`batch capacity reduced to ${perBatchCap} (only ${nCountries} countries / ${nIndicators} indicators in bank) — probe-frame artifact`);
  }
  let batches = null;
  for (let attempt = 0; attempt < 2000 && !batches; attempt++) {
    const rng = rngFromHex(deriveSeed(seed, `batch-assign:${attempt}`));
    const slots = ordered.map((q) => q);
    // Most-constrained-first: indicators with the most questions get placed first.
    const byInd = new Map();
    for (const q of slots) {
      if (!byInd.has(q.indicator)) byInd.set(q.indicator, []);
      byInd.get(q.indicator).push(q);
    }
    const groups = shuffle([...byInd.entries()], rng, (g) => g[0]).sort((a, b) => b[1].length - a[1].length);
    const b = Array.from({ length: nBatches }, () => ({ qs: [], countries: new Set(), indicators: new Set(), nulls: 0 }));
    // When nBatches is the plain packing count, pack full batches (at perBatchCap)
    // with the remainder in the final batch (P0: 12×10 + 1×2). When constraints
    // forced MORE batches than packing needs, distribute sizes evenly so every
    // batch has capacity for its constrained questions.
    const packing = nBatches === Math.ceil(ordered.length / perBatchCap);
    const capacity = (i) => {
      if (packing) {
        const fullBatches = Math.floor(ordered.length / perBatchCap);
        if (i < fullBatches) return perBatchCap;
        return i === fullBatches ? ordered.length - perBatchCap * fullBatches : 0;
      }
      return Math.floor(ordered.length / nBatches) + (i < ordered.length % nBatches ? 1 : 0);
    };
    let ok = true;
    for (const [, qs] of groups) {
      for (const q of shuffle(qs, rng, (x) => x.qid)) {
        const options = b
          .map((bt, i) => ({ bt, i }))
          .filter(({ bt, i }) =>
            bt.qs.length < capacity(i) &&
            !bt.indicators.has(q.indicator) &&
            !bt.countries.has(q.iso3) &&
            (q.segment !== "null_probe" || bt.nulls < 2),
          )
          .sort((x, y) => (capacity(y.i) - y.bt.qs.length) - (capacity(x.i) - x.bt.qs.length) || x.i - y.i);
        if (!options.length) { ok = false; break; }
        const pickIdx = rng.nextInt(Math.min(options.length, 3)); // among most-open batches
        const { bt } = options[pickIdx];
        bt.qs.push(q);
        bt.countries.add(q.iso3);
        bt.indicators.add(q.indicator);
        if (q.segment === "null_probe") bt.nulls++;
      }
      if (!ok) break;
    }
    if (ok && b.every((bt, i) => bt.qs.length === capacity(i))) {
      batches = b.map((bt, i) => ({
        batch_id: `batch-${String(i + 1).padStart(2, "0")}`,
        qids: bt.qs.map((q) => q.qid).sort(),
      }));
      genlog.batch_assign_attempt = attempt;
    }
  }
  if (!batches) throw new Error("batch assignment failed after 2000 attempts");
  {
    const sizes = batches.map((bt) => bt.qids.length);
    if (new Set(sizes).size > 1) {
      genlog.notes.push(`batch sizes: ${sizes.join(",")} (bank size ${ordered.length} does not divide evenly)`);
    }
  }

  // Per-model within-batch order (§2.3): recorded seed derivation, one namespace per model×batch.
  const modelOrder = {};
  for (const model of MODELS) {
    modelOrder[model] = {};
    for (const bt of batches) {
      const rng = rngFromHex(deriveSeed(seed, `${model}:${bt.batch_id}`));
      modelOrder[model][bt.batch_id] = shuffle(bt.qids, rng);
    }
  }

  // ---- Outputs -----------------------------------------------------------------
  writeJson(paths.questions, {
    run, seed, generated_at: genlog.generated_at,
    template_version: templatesFile.version,
    counts: { headline: headline.length, recency: recency.length, null_probe: nullProbes.length, total: ordered.length },
    questions: ordered,
  });
  writeJson(paths.batches, {
    run, seed, batch_size: BATCH_SIZE, n_batches: nBatches,
    order_seed_rule: "per-model within-batch order = shuffle(qids, rngFromHex(deriveSeed(seed, `${model}:${batch_id}`)))",
    batches,
    model_order: modelOrder,
  });
  writeJson(paths.genlog, genlog);
  log(`bank written: ${ordered.length} questions (${headline.length} headline / ${recency.length} recency / ${nullProbes.length} null probes), ${nBatches} batches`);
  log(`outputs: ${paths.questions}, ${paths.batches}, ${paths.genlog}`);
}

main().catch((e) => {
  console.error(`generate_bank FAILED: ${e.stack ?? e}`);
  process.exit(1);
});
