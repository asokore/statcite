// How the live smoke reaches StatCite: in process by default, over the wire
// when BASE is set.
//
// ci.yml has run `BASE=https://statcite.com npm run smoke` twice a day since
// the workflow was written, and the README badge reports it as proof the
// service is alive. Nothing read BASE. Every assertion ran against the working
// tree's own handler with a stub ASSETS binding, so an expired domain, an
// unrouted Worker, a rolled-back deploy, a broken static-asset upload or a
// release where `npm run deploy` was simply never run all left the badge green.
// The only traffic that left the runner went to the upstream APIs.
//
// Split into its own module so it can be tested: smoke-live.mjs runs the whole
// suite at import time, so a test cannot import it to reach the mode switch.
// The deps argument exists for that test alone.

/**
 * @param {unknown} env Worker env, used only in the in-process branch.
 * @param {string|undefined} base Origin to send real requests to, e.g.
 *   https://statcite.com. Falsy means in process.
 * @param {{fetch: typeof fetch, handleRequest: Function}} deps injection seam.
 */
export function makeCall(env, base, deps) {
  const { fetch: doFetch, handleRequest } = deps;
  if (!base) return (path, init) => handleRequest(new Request(`https://statcite.com${path}`, init), env);
  return async (path, init) => {
    try {
      return await doFetch(new URL(path, base), { ...init, signal: AbortSignal.timeout(30000) });
    } catch (e) {
      // A DNS, TLS or connection failure has no Response at all, and a raw
      // throw would escape withRetry and end the run in an unhandled rejection
      // rather than on the FAILURES line. 599 and this wording are both already
      // matched by looksTransient, so a blip retries and a dead origin reports.
      return new Response(
        JSON.stringify({ error: { code: "unreachable", message: `fetch failed: ${e?.message ?? e}` } }),
        { status: 599, headers: { "content-type": "application/json" } },
      );
    }
  };
}
