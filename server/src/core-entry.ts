// Bundle entry for non-Worker runtimes (the Apify actor).
// Exposes the pure core: no Workers APIs are referenced on these paths.

export { getIndicator, getSeries, searchIndicators, listRegistry } from "./core/series.ts";
export { countrySnapshot } from "./core/snapshot.ts";
export { inflationAdjust } from "./core/inflation.ts";
export { fxConvert } from "./core/fx.ts";
export { verifyStat } from "./core/verify.ts";
export { SOURCES } from "./core/sources.ts";
export { parseTransform } from "./core/transforms.ts";
export { ToolError } from "./core/types.ts";
export type { Ctx } from "./core/types.ts";
