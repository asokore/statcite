// World Bank coverage absence — one contract for both shapes.
//
// The World Bank signals "this economy is not one we report" in TWO different
// ways, and StatCite used to pass one of them through raw:
//
//   Anguilla (AIA)   -> HTTP 200, empty result set
//   Montserrat (MSR) -> HTTP 200, a PARAMETER-VALIDATION message
//                       ("Invalid value: The provided parameter value is not valid")
//
// Both mean exactly the same thing — neither is a World Bank reporting economy
// — but the second surfaced as "World Bank API error — …", which reads as a
// StatCite fault rather than a coverage fact, and carried no machine-readable
// flag. Found by a live Caribbean coverage sweep on 2026-08-10.
//
// The fix is not cosmetic: an agent deciding whether to look elsewhere needs to
// distinguish "the source publishes nothing here" from "our request was
// malformed", and it must not have to parse prose to do it.

import { test } from "node:test";
import assert from "node:assert/strict";
import { handleRequest, type Env } from "../src/index.ts";
import { _clearMemCache } from "../src/core/upstream.ts";

const env = { ASSETS: { fetch: async () => new Response("site") }, BASE_URL: "https://statcite.com" } as unknown as Env;

/** The two real World Bank envelope shapes, captured from live responses. */
const VALIDATION_ERROR = JSON.stringify([
  { message: [{ id: "120", key: "Invalid value", value: "The provided parameter value is not valid" }] },
]);
const EMPTY_RESULT = JSON.stringify([{ page: 0, pages: 0, per_page: 0, total: 0 }, []]);

function stubWorldBank(body: string): void {
  _clearMemCache();
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.includes("api.worldbank.org")) {
      return new Response(body, { status: 200, headers: { "content-type": "application/json" } });
    }
    // Everything else in the fallback chain fails, so the WB result is what surfaces.
    return new Response(JSON.stringify({ error: "unstubbed" }), { status: 599 });
  }) as typeof fetch;
}

async function getIndicator(country: string): Promise<{ status: number; body: any }> {
  const res = await handleRequest(
    new Request(`https://statcite.com/v1/indicator/gdp_growth?country=${country}`),
    env,
  );
  return { status: res.status, body: await res.json() };
}

test("a parameter-validation refusal is reported as a coverage fact, not an API error", async () => {
  stubWorldBank(VALIDATION_ERROR);
  const { body } = await getIndicator("MSR");
  const text = JSON.stringify(body);
  assert.match(text, /does not publish/i, "must state what the SOURCE does, not echo an upstream error string");
  assert.ok(!/World Bank API error/.test(text), "the raw upstream error must not reach the caller — it reads as a StatCite fault");
});

test("both absence shapes carry the same machine-readable flag", async () => {
  // This is the assertion that matters: a caller branches on the flag, not on
  // wording, so the two shapes must be indistinguishable to a program.
  stubWorldBank(VALIDATION_ERROR);
  const validation = JSON.stringify((await getIndicator("MSR")).body);
  stubWorldBank(EMPTY_RESULT);
  const empty = JSON.stringify((await getIndicator("AIA")).body);

  assert.match(validation, /no_published_data/, "validation-refusal path must set no_published_data");
  assert.match(empty, /no_published_data/, "empty-result path must set no_published_data");
});

test("a genuine upstream API error is still surfaced as an error, not disguised as absence", async () => {
  // The guard must not swallow real faults. An unrelated WB message has to keep
  // reaching the caller as an error — otherwise a broken query would be
  // reported as "this economy publishes nothing", which is a false claim about
  // the world rather than about our request.
  stubWorldBank(JSON.stringify([{ message: [{ id: "175", key: "Service temporarily unavailable", value: "try later" }] }]));
  const { body } = await getIndicator("BRB");
  const text = JSON.stringify(body);
  assert.match(text, /Service temporarily unavailable|World Bank API error/i);
  assert.ok(!/does not publish/i.test(text), "a transient fault must never be reported as a coverage fact");
});
