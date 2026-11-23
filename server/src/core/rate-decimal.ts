// The exact decimal text of an fx_convert rate, returned as `rate_decimal`
// beside the binary `rate`.
//
// R1, for a figure passed on unchanged (the direct ECB path): the number in
// plain positional notation, with exactly the significant digits of the
// ECMAScript Number::toString of that number. 6.5e-7 becomes "0.00000065".
//
// R2, for a computed figure (an annual average, a USD bridge, a peg, an
// inverse): each input is written as text by R1, and a decimal text with k
// places is the exact fraction n / 10^k. The figure is then an exact fraction
// p / q of two integers. It is rounded once, half to even, to
// max(8, 11 - e) places, where 10^e <= p / q < 10^(e + 1). No intermediate is
// rounded, because rounding first to a working precision can turn a figure
// just above a half into an exact half and send it the wrong way. Trailing
// zeros after the full stop are removed, then a bare full stop.
//
// Every function returns undefined when an input is missing, not finite, or
// zero or less. Nothing falls back to the binary result.

/** The grammar of rate_decimal. The string "0" alone also matches this
 * pattern and must be refused separately. */
export const RATE_DECIMAL_PATTERN = /^(0|[1-9][0-9]*)(\.[0-9]*[1-9])?$/;

interface Fraction {
  num: bigint;
  den: bigint;
}

/** R1. undefined for a value that is missing, not finite, or zero or less. */
export function plainDecimal(n: number | null | undefined): string | undefined {
  if (typeof n !== "number" || !Number.isFinite(n) || n <= 0) return undefined;
  const s = String(n);
  const m = /^(\d+)(?:\.(\d+))?(?:e([+-]\d+))?$/.exec(s);
  if (!m) return undefined;
  if (m[3] === undefined) return s;
  const digits = m[1] + (m[2] ?? "");
  const point = m[1].length + Number(m[3]);
  let out: string;
  if (point <= 0) out = `0.${"0".repeat(-point)}${digits}`;
  else if (point >= digits.length) out = digits + "0".repeat(point - digits.length);
  else out = `${digits.slice(0, point)}.${digits.slice(point)}`;
  out = out.replace(/^0+(?=\d)/, "");
  return out.includes(".") ? out.replace(/0+$/, "").replace(/\.$/, "") : out;
}

function fractionOf(n: number | null | undefined): Fraction | undefined {
  const text = plainDecimal(n);
  if (text === undefined) return undefined;
  const [int, frac = ""] = text.split(".");
  return { num: BigInt(int + frac), den: 10n ** BigInt(frac.length) };
}

/** The e with 10^e <= num / den < 10^(e + 1), for num and den above zero. */
function leadingExponent(num: bigint, den: bigint): number {
  const e = num.toString().length - den.toString().length;
  const atLeast = (k: number) => (k >= 0 ? num >= den * 10n ** BigInt(k) : num * 10n ** BigInt(-k) >= den);
  return atLeast(e) ? e : e - 1;
}

/** R2's single rounding of an exact fraction. */
export function decimalFromFraction(num: bigint, den: bigint): string | undefined {
  if (num <= 0n || den <= 0n) return undefined;
  const places = Math.max(8, 11 - leadingExponent(num, den));
  const scaled = num * 10n ** BigInt(places);
  let q = scaled / den;
  const twiceRem = 2n * (scaled % den);
  if (twiceRem > den || (twiceRem === den && q % 2n === 1n)) q += 1n;
  const digits = q.toString().padStart(places + 1, "0");
  const int = digits.slice(0, digits.length - places);
  const frac = digits.slice(digits.length - places).replace(/0+$/, "");
  return frac ? `${int}.${frac}` : int;
}

/** One side of a USD bridge as the figures were received: US dollars over
 * local units. A World Bank leg is 1 over the published units per dollar. */
export interface LegFigures {
  usd: number;
  units: number;
}

/** R2 for a bridge: (from.usd / from.units) / (to.usd / to.units), as one
 * exact fraction. */
export function bridgeDecimal(from: LegFigures, to: LegFigures): string | undefined {
  const parts = [from.usd, to.units, from.units, to.usd].map(fractionOf);
  if (parts.some((p) => p === undefined)) return undefined;
  const [a, b, c, d] = parts as Fraction[];
  return decimalFromFraction(a.num * b.num * c.den * d.den, a.den * b.den * c.num * d.num);
}

/** R2 for an average: the exact sum over the count. */
export function averageDecimal(values: Array<number | null | undefined>): string | undefined {
  if (values.length === 0) return undefined;
  const parts = values.map(fractionOf);
  if (parts.some((p) => p === undefined)) return undefined;
  const fr = parts as Fraction[];
  const den = fr.reduce((m, p) => (p.den > m ? p.den : m), 1n);
  const sum = fr.reduce((s, p) => s + p.num * (den / p.den), 0n);
  return decimalFromFraction(sum, den * BigInt(values.length));
}
