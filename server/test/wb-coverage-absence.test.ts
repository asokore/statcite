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
import { resolveCountry, INTEGRATED_TERRITORIES } from "../src/core/countries.ts";

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

// --- a coverage fact is not the same as an unknown code -------------------
//
// Live on 2026-08-13: country=XYZ returned "The World Bank does not publish
// NY.GDP.MKTP.KD.ZG for 'XYZ'. This is a coverage fact at the source ... some
// economies are not World Bank reporting economies at all." That invents a
// country and then reports a coverage fact about it, which is exactly the
// fabrication this service exists to prevent.
//
// The root cause was not the message. resolveCountry passes any plausible
// three-letter code through for the upstream to adjudicate, and the countries
// table was missing 19 REAL economies, so the passthrough could not tell a
// genuine uncovered economy from a made-up code. Both halves are tested here.

test("REAL economies resolve, and are not treated as unknown codes", () => {
  for (const iso3 of ["MSR", "AIA", "VGB", "TCA", "GIB", "GRL", "FRO", "IMN", "JEY", "GGY", "TWN", "COK", "NIU"]) {
    const c = resolveCountry(iso3);
    assert.ok(c, `${iso3} must resolve`);
    assert.ok(!c!.unverified, `${iso3} is a real economy and must not be flagged unverified`);
    assert.notEqual(c!.name, iso3, `${iso3} must resolve to a NAME, not echo its own code`);
  }
});

test("a made-up code is flagged unverified rather than described as an economy", () => {
  for (const junk of ["XYZ", "ZZZ", "QQQ"]) {
    const c = resolveCountry(junk);
    assert.ok(c?.unverified, `${junk} must be marked unverified so no coverage fact is asserted about it`);
  }
});

// --- integrated territories: absence with an address ----------------------
//
// A Caribbean coverage check on 2026-08-14 found Guadeloupe and Martinique
// returning a bare "No snapshot data available", which reads as a lookup
// failure and invites the caller to retry with a different spelling. They are
// French overseas departments: the World Bank and the IMF report them inside
// France, and the department-level figures do exist, published by INSEE. The
// dead end was ours, not the world's.

test("an overseas department explains where its figures actually live", async () => {
  stubWorldBank(EMPTY_RESULT);
  const { body } = await getIndicator("GLP");
  const text = JSON.stringify(body);
  assert.match(text, /overseas department of France/i, "must say WHY the sources hold nothing");
  assert.match(text, /INSEE/, "must name the publisher that does hold it");
  assert.match(text, /insee\.fr/, "must give a URL the caller can follow");
  assert.match(text, /no_published_data/, "same machine-readable contract as every other absence");
  assert.match(text, /FRA/, "must say which economy it is reported under");
});

test("the snapshot path carries the same explanation as the indicator path", async () => {
  stubWorldBank(EMPTY_RESULT);
  const res = await handleRequest(new Request("https://statcite.com/v1/snapshot/MTQ"), env);
  const text = JSON.stringify(await res.json());
  assert.match(text, /overseas department of France/i);
  assert.match(text, /INSEE/);
  assert.ok(!/No snapshot data available/.test(text), "the bare dead-end message must be gone");
});

test("the explanation does not fire for an ordinary uncovered economy", async () => {
  // Montserrat is genuinely not a World Bank reporting economy, but it is a
  // British Overseas Territory with its own statistics office and is NOT
  // reported inside another state's national accounts. Claiming otherwise
  // would be a fabricated constitutional fact.
  stubWorldBank(EMPTY_RESULT);
  const text = JSON.stringify((await getIndicator("MSR")).body);
  assert.ok(!/overseas department/i.test(text), "must not assert a parent state that does not exist");
  assert.ok(!/INSEE/.test(text));
});

test("every territory points at its own department page, not a shared one", () => {
  // A copy-paste slip here would send four territories to one department's
  // figures, which is worse than no referral at all.
  const urls = Object.values(INTEGRATED_TERRITORIES).map((t) => t.publisherUrl);
  assert.equal(new Set(urls).size, urls.length, "publisher URLs must be distinct per territory");
  for (const [iso3, t] of Object.entries(INTEGRATED_TERRITORIES)) {
    assert.match(t.publisherUrl, /^https:\/\/www\.insee\.fr\/.+DEP-\d{3}$/, `${iso3} URL shape`);
    assert.ok(resolveCountry(iso3)?.name, `${iso3} must resolve to a real name`);
    assert.ok(!resolveCountry(iso3)?.unverified, `${iso3} must not be an unverified passthrough`);
  }
});
