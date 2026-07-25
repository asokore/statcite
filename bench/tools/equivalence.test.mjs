// bench/tools/equivalence.test.mjs — CI equivalence test (METHODOLOGY §4):
// the standalone scorer's Class-A verdicts must equal StatCite's server judge()
// on a boundary grid (percent-kind and level-kind), and the widened Class-B/C
// bands may only ever RELAX a verdict, never tighten one, wherever the
// methodology widens them.
//
// Run from the server package so tsx can load the TypeScript module:
//   cd server && node --import tsx ../bench/tools/equivalence.test.mjs

if (process.argv.includes("--help")) {
  console.log(`equivalence.test.mjs — scorer vs server judge() equivalence (METHODOLOGY §4)

Usage: cd server && node --import tsx ../bench/tools/equivalence.test.mjs

Asserts: (1) scorer Class-A verdicts equal server judge() on a boundary grid
(percent-kind and level-kind, including official=0 and exact-zero-diff cases);
(2) the widened B/C bands only ever RELAX a verdict wherever §4 widens them;
(3) the band literals equal the §4 table. Exits 1 on any failure.
Must run under tsx from server/ so the TypeScript import resolves.`);
  process.exit(0);
}

// Dynamic imports so `node equivalence.test.mjs --help` works without tsx
// (static TS imports would be hoisted above the --help check and fail).
const { judge } = await import("../../server/src/core/verify.ts");
const { BANDS, ZERO_OFFICIAL_CLOSE_ABS, judgeBand } = await import("./score.mjs");

let checks = 0;
let failures = 0;

function fail(msg) {
  failures++;
  console.error(`FAIL: ${msg}`);
}

const RANK = { mismatch: 0, close: 1, match: 2 };

// ---------------------------------------------------------------------------
// 1. Boundary grid: Class A == server judge() exactly, both kinds.
// ---------------------------------------------------------------------------
const percentOfficials = [2.5, -3.2, 0.05, 12.0, 100, 250.7, 0];
// pp offsets straddling the 0.06 match and 0.3 close boundaries (and the 0.05
// zero-official boundary), plus relative offsets straddling 0.5% and 2%.
const ppOffsets = [0, 0.001, 0.049, 0.05, 0.051, 0.059, 0.06, 0.0601, 0.061, 0.1, 0.299, 0.3, 0.3001, 0.31, 0.5, 1.0, 1.01, 2.5];
const relOffsets = [0.0001, 0.0049, 0.005, 0.0051, 0.0199, 0.02, 0.0201, 0.029, 0.03, 0.031, 0.049, 0.05, 0.0501, 0.08];

for (const official of percentOfficials) {
  const claims = new Set();
  for (const d of ppOffsets) {
    claims.add(official + d);
    claims.add(official - d);
  }
  if (official !== 0) {
    for (const r of relOffsets) {
      claims.add(official * (1 + r));
      claims.add(official * (1 - r));
    }
  }
  for (const claimed of claims) {
    const server = judge(claimed, official, true, {}).verdict;
    const ours = judgeBand(claimed, official, "percent", "A");
    checks++;
    if (server !== ours) fail(`percent A: claimed=${claimed} official=${official} server=${server} scorer=${ours}`);
  }
}

const levelOfficials = [1_000_000, 67_500_000, 3.9e11, 71.4, 5_000, 0];
for (const official of levelOfficials) {
  const claims = new Set();
  if (official === 0) {
    for (const d of [0, 0.049, 0.05, 0.051, 1]) {
      claims.add(d);
      claims.add(-d);
    }
  } else {
    for (const r of relOffsets) {
      claims.add(official * (1 + r));
      claims.add(official * (1 - r));
    }
    claims.add(official);
    claims.add(-official);
    claims.add(official * 1000); // scale slip far outside every band
  }
  for (const claimed of claims) {
    const server = judge(claimed, official, false, {}).verdict;
    const ours = judgeBand(claimed, official, "level", "A");
    checks++;
    if (server !== ours) fail(`level A: claimed=${claimed} official=${official} server=${server} scorer=${ours}`);
  }
}

// ---------------------------------------------------------------------------
// 2. Relax-only property everywhere:
//    percent-kind: A -> B -> C monotone (0.3pp/2% -> 0.5pp/3% -> 1.0pp/5%);
//    level-kind:   B and C close (5%) never demote relative to A/server (5%) —
//    the benchmark never tightens below the product's public bands.
// ---------------------------------------------------------------------------
for (const official of percentOfficials) {
  const claims = [];
  for (const d of ppOffsets) claims.push(official + d, official - d);
  if (official !== 0) for (const r of relOffsets) claims.push(official * (1 + r), official * (1 - r));
  for (const claimed of claims) {
    const a = RANK[judgeBand(claimed, official, "percent", "A")];
    const b = RANK[judgeBand(claimed, official, "percent", "B")];
    const c = RANK[judgeBand(claimed, official, "percent", "C")];
    checks++;
    if (!(b >= a && c >= b)) fail(`percent relax violated: claimed=${claimed} official=${official} A=${a} B=${b} C=${c}`);
  }
}
for (const official of levelOfficials) {
  if (official === 0) continue;
  for (const r of relOffsets) {
    for (const claimed of [official * (1 + r), official * (1 - r)]) {
      const a = RANK[judgeBand(claimed, official, "level", "A")];
      const b = RANK[judgeBand(claimed, official, "level", "B")];
      const c = RANK[judgeBand(claimed, official, "level", "C")];
      checks += 2;
      if (!(b >= a)) fail(`level B relax violated: claimed=${claimed} official=${official} A=${a} B=${b}`);
      if (!(c >= a)) fail(`level C relax violated: claimed=${claimed} official=${official} A=${a} C=${c}`);
    }
  }
}

// ---------------------------------------------------------------------------
// 3. Spec-value assertions on the band literals themselves (§4 table).
// ---------------------------------------------------------------------------
const expectBands = [
  ["A.percent", BANDS.A.percent, { match_pp: 0.06, match_rel: 0.005, close_pp: 0.3, close_rel: 0.02 }],
  ["B.percent", BANDS.B.percent, { match_pp: 0.06, match_rel: 0.005, close_pp: 0.5, close_rel: 0.03 }],
  ["C.percent", BANDS.C.percent, { match_pp: 0.06, match_rel: 0.005, close_pp: 1.0, close_rel: 0.05 }],
  ["A.level", BANDS.A.level, { match_rel: 0.005, close_rel: 0.05 }],
  ["B.level", BANDS.B.level, { match_rel: 0.005, close_rel: 0.05 }],
  ["C.level", BANDS.C.level, { match_rel: 0.005, close_rel: 0.05 }],
];
for (const [name, got, want] of expectBands) {
  for (const [k, v] of Object.entries(want)) {
    checks++;
    if (got[k] !== v) fail(`band literal ${name}.${k}: got ${got[k]}, want ${v} (METHODOLOGY §4)`);
  }
}
checks++;
if (ZERO_OFFICIAL_CLOSE_ABS !== 0.05) fail(`zero-official close threshold: got ${ZERO_OFFICIAL_CLOSE_ABS}, want 0.05 (server judge())`);

// ---------------------------------------------------------------------------
if (failures) {
  console.error(`equivalence test FAILED: ${failures} failures over ${checks} checks`);
  process.exit(1);
}
console.log(`equivalence test PASSED: ${checks} checks (Class-A == server judge() on the boundary grid; widened bands relax-only; band literals match METHODOLOGY §4)`);
