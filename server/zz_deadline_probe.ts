// TEMP adversarial probe (deleted after the run). Does ONE fetchJson URL really
// cost 8000+300+8000+900+8000 when the upstream hangs? Stub global fetch so the
// request never settles on its own and only rejects when the AbortController
// fires — exactly how a hung upstream behaves.
import { fetchJson } from "./src/core/upstream.ts";

let calls = 0;
const marks: number[] = [];
const t0 = Date.now();

(globalThis as any).fetch = (_url: string, init: any) => {
  calls++;
  marks.push(Date.now() - t0);
  return new Promise((_resolve, reject) => {
    const sig = init?.signal;
    if (!sig) return; // hang forever
    sig.addEventListener("abort", () => {
      const err = new Error("The operation was aborted");
      err.name = "AbortError";
      reject(err);
    });
  });
};

try {
  await fetchJson("https://example.invalid/hang-probe");
  console.log("UNEXPECTED: resolved");
} catch (e) {
  console.log("fetch attempts:", calls);
  console.log("attempt start offsets (ms):", marks.join(", "));
  console.log("TOTAL ELAPSED (ms):", Date.now() - t0);
  console.log("error:", (e as Error).name, "|", (e as Error).message);
}
