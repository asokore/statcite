// bench/tools/prng.mjs — splitmix64 PRNG seeded from a hex string (SHA-256 output),
// with lexicographic-presort shuffle and pick helpers (METHODOLOGY §6: "in-repo
// splitmix64 PRNG, lexicographic pre-sort before every shuffle — bit-identical
// regeneration on any machine"). Pure BigInt arithmetic: deterministic across
// platforms. Zero dependencies.

import { createHash } from "node:crypto";

const MASK64 = (1n << 64n) - 1n;
const RANGE64 = 1n << 64n;

/** Fold a hex string (any length; typically 64 hex chars of SHA-256) into a 64-bit seed. */
export function seedFromHex(hex) {
  const clean = String(hex).trim().toLowerCase().replace(/^0x/, "");
  if (!/^[0-9a-f]+$/.test(clean)) throw new Error(`seedFromHex: not a hex string: '${hex}'`);
  let s = 0n;
  for (let i = 0; i < clean.length; i += 16) {
    s ^= BigInt("0x" + clean.slice(i, i + 16).padEnd(16, "0"));
  }
  return s & MASK64;
}

/** Derive a namespaced child seed: SHA-256 hex of `${hexSeed}:${namespace}`. */
export function deriveSeed(hexSeed, namespace) {
  return createHash("sha256").update(`${hexSeed}:${namespace}`, "utf8").digest("hex");
}

/** splitmix64 generator from a BigInt (or numeric) 64-bit seed. */
export function splitmix64(seed) {
  let state = BigInt(seed) & MASK64;
  const nextU64 = () => {
    state = (state + 0x9e3779b97f4a7c15n) & MASK64;
    let z = state;
    z = ((z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n) & MASK64;
    z = ((z ^ (z >> 27n)) * 0x94d049bb133111ebn) & MASK64;
    return (z ^ (z >> 31n)) & MASK64;
  };
  /** Uniform float in [0,1) with 53 bits of precision. */
  const nextFloat = () => Number(nextU64() >> 11n) / 9007199254740992;
  /** Uniform integer in [0, bound) via rejection sampling (no modulo bias). */
  const nextInt = (bound) => {
    if (!Number.isInteger(bound) || bound <= 0) throw new Error(`nextInt: bound must be a positive integer, got ${bound}`);
    const b = BigInt(bound);
    const threshold = RANGE64 - (RANGE64 % b);
    let u;
    do {
      u = nextU64();
    } while (u >= threshold);
    return Number(u % b);
  };
  return { nextU64, nextFloat, nextInt };
}

/** PRNG directly from a hex seed string. */
export function rngFromHex(hex) {
  return splitmix64(seedFromHex(hex));
}

function defaultKey(x) {
  return typeof x === "string" ? x : JSON.stringify(x);
}

function sortedCopy(array, keyFn) {
  return [...array].sort((a, b) => {
    const ka = keyFn(a);
    const kb = keyFn(b);
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });
}

/**
 * Deterministic shuffle: lexicographic pre-sort by keyFn (default: String/JSON key),
 * then Fisher–Yates driven by the supplied rng. Returns a new array.
 */
export function shuffle(array, rng, keyFn = defaultKey) {
  const out = sortedCopy(array, keyFn);
  for (let i = out.length - 1; i > 0; i--) {
    const j = rng.nextInt(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Deterministic single pick: pre-sort lexicographically, then index uniformly. */
export function pick(array, rng, keyFn = defaultKey) {
  if (!array.length) throw new Error("pick: empty array");
  const sorted = sortedCopy(array, keyFn);
  return sorted[rng.nextInt(sorted.length)];
}

/** Deterministic sample of n items without replacement. */
export function pickN(array, n, rng, keyFn = defaultKey) {
  return shuffle(array, rng, keyFn).slice(0, n);
}

// ---------------------------------------------------------------------------
// Self-test: `node prng.mjs --self-test`
// ---------------------------------------------------------------------------

// Published splitmix64 reference outputs for seed 0 (first three values).
const REFERENCE_SEED0 = ["e220a8397b1dcdaf", "6e789e6aa1b965f4", "06c45d188009454f"];

function selfTest() {
  // 1. Reference-vector check against the canonical splitmix64 test values.
  const r0 = splitmix64(0n);
  const got = [r0.nextU64(), r0.nextU64(), r0.nextU64()].map((v) => v.toString(16).padStart(16, "0"));
  for (let i = 0; i < 3; i++) {
    if (got[i] !== REFERENCE_SEED0[i]) {
      console.error(`FAIL reference vector [${i}]: got ${got[i]}, want ${REFERENCE_SEED0[i]}`);
      process.exit(1);
    }
  }
  console.log(`reference vector (seed 0): ${got.join(" ")}  OK`);

  // 2. Determinism: same hex seed twice → identical stream + identical shuffle.
  const seed = deriveSeed("00".repeat(32), "self-test");
  const a = rngFromHex(seed);
  const b = rngFromHex(seed);
  const streamA = Array.from({ length: 8 }, () => a.nextU64().toString(16));
  const streamB = Array.from({ length: 8 }, () => b.nextU64().toString(16));
  if (streamA.join(",") !== streamB.join(",")) {
    console.error("FAIL: identical seeds produced different streams");
    process.exit(1);
  }
  console.log(`derived seed ${seed.slice(0, 16)}… stream: ${streamA.slice(0, 4).join(" ")}  OK`);

  const items = ["BRB", "USA", "DEU", "JPN", "KEN", "FJI", "ARG", "VNM"];
  const s1 = shuffle(items, rngFromHex(seed));
  const s2 = shuffle([...items].reverse(), rngFromHex(seed)); // presort makes input order irrelevant
  if (s1.join(",") !== s2.join(",")) {
    console.error("FAIL: shuffle depends on input order despite lexicographic pre-sort");
    process.exit(1);
  }
  console.log(`shuffle (input-order independent): ${s1.join(" ")}  OK`);

  // 3. nextInt bounds sanity.
  const r = rngFromHex(seed);
  for (let i = 0; i < 10000; i++) {
    const v = r.nextInt(7);
    if (v < 0 || v > 6) {
      console.error(`FAIL: nextInt(7) out of range: ${v}`);
      process.exit(1);
    }
  }
  console.log("nextInt range check (10k draws in [0,7))  OK");
  console.log("prng self-test PASSED");
}

import { pathToFileURL } from "node:url";
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.includes("--self-test")) selfTest();
  else console.log("Usage: node prng.mjs --self-test");
}
