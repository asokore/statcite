// TEMP adversarial probe (deleted after the run). How long can ONE /v1 request
// run when every upstream hangs? Drives the real getIndicator() fallback chain
// for a 3-source indicator with a globally hung fetch.
import { getIndicator } from "./src/core/series.ts";

let calls = 0;
const urls: string[] = [];
const t0 = Date.now();

(globalThis as any).fetch = (url: any, init: any) => {
  calls++;
  urls.push(`${Math.round((Date.now() - t0) / 100) / 10}s ${String(url).slice(0, 72)}`);
  return new Promise((_resolve, reject) => {
    const sig = init?.signal;
    if (!sig) return;
    sig.addEventListener("abort", () => {
      const err = new Error("The operation was aborted");
      err.name = "AbortError";
      reject(err);
    });
  });
};

const ctx: any = { baseUrl: "https://statcite.com" };
try {
  await getIndicator(ctx, "gdp_growth", "TUV");
  console.log("UNEXPECTED: resolved");
} catch (e) {
  console.log("total fetch attempts:", calls);
  console.log(urls.join("\n"));
  console.log("TOTAL ELAPSED (ms):", Date.now() - t0);
  console.log("error:", (e as Error).name, "|", (e as Error).message.slice(0, 200));
}
