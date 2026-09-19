// Security guards for the static site and the repository itself.
// Security review 2026-09-15. No network.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { SECURITY_HEADERS } from "../src/index.ts";

const repoRoot = path.resolve(fileURLToPath(new URL("../../", import.meta.url)));
const read = (rel: string) => readFileSync(path.join(repoRoot, rel), "utf8");

// --- the live verifier on the landing page -----------------------------------

/** Run the landing page's inline script against a fake DOM and a canned
 * /v1/verify response, and return the HTML it writes into the result box. */
async function renderVerifier(body: unknown): Promise<string> {
  const html = read("site/index.html");
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  const code = scripts.find((s) => s.includes("try-form"));
  assert.ok(code, "the verifier script is on the page");

  let submit: ((e: { preventDefault(): void }) => void) | undefined;
  const out = { innerHTML: "" };
  const field = (value: string) => ({ value });
  const elements: Record<string, unknown> = {
    "try-form": { addEventListener: (_: string, fn: typeof submit) => { submit = fn; } },
    "try-go": { disabled: false, textContent: "" },
    "try-result": out,
    "try-indicator": field("inflation_cpi"),
    "try-country": field("USA"),
    "try-period": field("2023"),
    "try-value": field("4.1"),
  };
  const document = {
    getElementById: (id: string) => elements[id] ?? null,
    querySelectorAll: () => [],
    // Serialises text the way a browser's innerHTML does: &, < and > only.
    createElement: () => {
      let text = "";
      return {
        set textContent(v: string) { text = v; },
        get innerHTML() { return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\u00a0/g, "&nbsp;"); },
      };
    },
  };
  const fetch = async () => ({ ok: true, json: async () => body });
  new Function("document", "fetch", "URLSearchParams", "navigator", code)(document, fetch, URLSearchParams, {});
  assert.ok(submit, "the verifier registers a submit handler");
  submit({ preventDefault() {} });
  for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0));
  return out.innerHTML;
}

test("the verifier never links a non-https source URL", async () => {
  const html = await renderVerifier({
    verdict: "match",
    explanation: "ok",
    citation: { citation_text: "World Bank", source_url: "javascript:alert(document.domain)" },
  });
  assert.match(html, /World Bank/);
  assert.doesNotMatch(html, /href=/);
  assert.doesNotMatch(html, /javascript:/);
});

test("the verifier escapes quotes, so a URL cannot break out of the href", async () => {
  const html = await renderVerifier({
    verdict: "match",
    explanation: "ok",
    citation: { citation_text: "x", source_url: 'https://example.test/" onmouseover="alert(1)' },
  });
  assert.match(html, /href="https:\/\/example\.test\/&quot; onmouseover=&quot;alert\(1\)"/);
  assert.doesNotMatch(html, /" onmouseover="/);
});

test("the verdict becomes a CSS class only from the closed set", async () => {
  const html = await renderVerifier({ verdict: 'match" onclick="alert(1)', explanation: "x" });
  assert.match(html, /class="v-cannot_verify"/);
  assert.doesNotMatch(html, /" onclick="/);
  const ok = await renderVerifier({ verdict: "close", explanation: "x" });
  assert.match(ok, /class="v-close"/);
});

// --- security.txt ------------------------------------------------------------

test("security.txt is served as UTF-8 plain text and points at a real disclosure policy", () => {
  const headers = read("site/_headers");
  const block = headers.split(/\n(?=\/)/).find((b) => b.startsWith("/.well-known/security.txt"));
  assert.ok(block, "_headers has a block for security.txt");
  assert.match(block, /Content-Type: text\/plain; charset=utf-8/);
  const txt = read("site/.well-known/security.txt");
  assert.match(txt, /^Policy: https:\/\/github\.com\/asokore\/statcite\/security\/policy$/m);
  assert.ok(read("SECURITY.md").includes("## Reporting a vulnerability"), "the policy it points at exists");
  const expires = /^Expires: (.+)$/m.exec(txt)?.[1];
  assert.ok(expires && Date.parse(expires) > Date.now(), "security.txt has not expired");
});

// --- repository hygiene ------------------------------------------------------

function trackedFiles(): string[] {
  const r = spawnSync("git", ["ls-files", "-z"], { cwd: repoRoot, encoding: "utf8" });
  assert.equal(r.status, 0, `git ls-files failed: ${r.stderr}`);
  return r.stdout.split("\0").filter(Boolean);
}

test("no archive bundles are tracked apart from the published skill", () => {
  // Archives hide their contents from review and from every text guard in this
  // suite. Two old zips carried private working notes onto the public remote.
  const allowed = new Set(["skill/statcite.skill"]);
  const archives = trackedFiles().filter((f) => /\.(zip|skill|tar|tgz|gz|7z|rar)$/i.test(f) && !allowed.has(f));
  assert.deepEqual(archives, []);
});

test("no secret-bearing file names are tracked", () => {
  const bad = trackedFiles().filter((f) => {
    const base = f.split("/").pop() ?? f;
    if (/^\.(env|dev\.vars)\.example$/.test(base)) return false;
    return /^\.env(\..+)?$/.test(base) || /^\.dev\.vars(\..+)?$/.test(base) || /\.(pem|key)$/i.test(base) || f.endsWith(".claude/settings.local.json");
  });
  assert.deepEqual(bad, []);
});

test("no tracked file carries the maintainer's personal address", () => {
  // The project address is hello@statcite.com. The personal one was removed from
  // the whole history on 15 September 2026 and must not come back.
  const offenders: string[] = [];
  for (const f of trackedFiles()) {
    if (f === "server/test/site-security.test.ts" || /\.(png|ico|svg|zip|skill|gz)$/i.test(f)) continue;
    let text: string;
    try {
      text = read(f);
    } catch {
      continue;
    }
    if (/[A-Za-z0-9._%-]+@gmail\.com/.test(text)) offenders.push(f);
  }
  assert.deepEqual(offenders, []);
});

test("the publish workflow runs a pinned, checksum-verified mcp-publisher", () => {
  const wf = read(".github/workflows/publish-mcp.yml");
  assert.doesNotMatch(wf, /releases\/latest\/download/);
  assert.match(wf, /PUBLISHER_SHA256: [0-9a-f]{64}/);
  assert.match(wf, /sha256sum -c -/);
  const top = wf.slice(0, wf.indexOf("\njobs:"));
  assert.doesNotMatch(top, /id-token: write/, "OIDC permission is granted to the job, not the whole workflow");
});

test("every workflow declares its token permissions", () => {
  const names = readdirSync(path.join(repoRoot, ".github/workflows")).filter((f) => /\.ya?ml$/i.test(f));
  assert.ok(names.length >= 3, "the workflow directory was enumerated");
  for (const name of names) {
    const wf = read(`.github/workflows/${name}`);
    assert.match(wf, /^permissions:\s*\r?\n\s+contents: read/m, name);
  }
});

test("no tracked file tells anyone to run a bare, unpinned npx wrangler", () => {
  // A bare `npx wrangler` fetches whatever release is newest and runs it with
  // the deploy credential. Every instruction names the pinned version.
  const pinned = /"deploy": "npx wrangler@(\d+\.\d+\.\d+) deploy"/.exec(read("server/package.json"))?.[1];
  assert.ok(pinned, "server/package.json pins wrangler");
  const offenders: string[] = [];
  for (const f of trackedFiles()) {
    // This file names the pattern it bans, so it is skipped.
    if (f === "server/test/site-security.test.ts") continue;
    if (!/\.(md|mjs|js|ts|json|jsonc|yml|yaml|sh|html|txt)$/i.test(f) || f.endsWith(".bundle.mjs") || f.startsWith("bench/runs/")) continue;
    let text: string;
    try {
      text = read(f);
    } catch {
      continue;
    }
    for (const m of text.matchAll(/npx\s+wrangler(@[\d.]+)?/g)) {
      if (m[1] !== `@${pinned}`) offenders.push(`${f}: ${m[0]}`);
    }
  }
  assert.deepEqual(offenders, []);
});

// --- the static pages' security headers, which live only in site/_headers ----

/** Parse one rule block out of site/_headers, comments stripped. The comment
 * lines matter: a naive split leaves the NEXT block's comments glued to this
 * one, so a comment naming a header would read as a header. */
function headerBlock(rule: string): Map<string, string> {
  const raw = read("site/_headers").split(/\r?\n/).filter((l) => !/^\s*#/.test(l)).join("\n");
  const block = raw.split(/\n(?=\S)/).find((b) => b.trimEnd() === rule || b.startsWith(`${rule}\n`));
  assert.ok(block, `site/_headers has no ${rule} block`);
  const out = new Map<string, string>();
  for (const line of block.split(/\r?\n/).slice(1)) {
    const m = /^\s+([A-Za-z0-9-]+):\s*(.+?)\s*$/.exec(line);
    if (m) out.set(m[1].toLowerCase(), m[2]);
  }
  return out;
}

test("every static page carries the site-wide security headers", () => {
  // The Worker hands static assets to env.ASSETS.fetch without touching their
  // headers, so this file is the only place they come from.
  const h = headerBlock("/*");
  assert.equal(h.get("x-frame-options"), "DENY");
  assert.equal(h.get("x-content-type-options"), "nosniff");
  assert.ok(h.get("referrer-policy"), "Referrer-Policy is set");
  assert.equal(h.get("strict-transport-security"), SECURITY_HEADERS["strict-transport-security"]);
  assert.match(h.get("strict-transport-security") ?? "", /max-age=(\d+)/);
  assert.ok(Number(/max-age=(\d+)/.exec(h.get("strict-transport-security") ?? "")?.[1]) >= 31536000);
});

test("the site CSP frames out clickjacking and leaves the verifier's own /v1 call working", () => {
  const csp = headerBlock("/*").get("content-security-policy") ?? "";
  const directives = new Map(
    csp.split(";").map((d) => d.trim()).filter(Boolean).map((d) => {
      const [name, ...values] = d.split(/\s+/);
      return [name, values];
    }),
  );
  assert.deepEqual(directives.get("default-src"), ["'self'"]);
  assert.deepEqual(directives.get("frame-ancestors"), ["'none'"]);
  assert.deepEqual(directives.get("base-uri"), ["'self'"]);
  assert.deepEqual(directives.get("form-action"), ["'self'"]);
  assert.ok(directives.get("connect-src")?.includes("'self'"), "the live verifier posts to same-origin /v1");
  const script = directives.get("script-src") ?? [];
  assert.ok(script.includes("'self'"));
  for (const v of script) {
    assert.ok(!v.includes("*"), `script-src must not wildcard: ${v}`);
    assert.notEqual(v, "'unsafe-eval'");
    assert.ok(!v.startsWith("http:"), `script-src must not allow plain HTTP: ${v}`);
  }
});

test("every external host the CSP allows is disclosed on the privacy page", () => {
  // The page used to say "no analytics scripts" while Cloudflare injected its
  // beacon into every response, including that page's own.
  const csp = headerBlock("/*").get("content-security-policy") ?? "";
  const privacy = read("site/privacy.html");
  const hosts = new Set<string>();
  for (const directive of csp.split(";")) {
    const [name, ...values] = directive.trim().split(/\s+/);
    if (name !== "script-src" && name !== "connect-src") continue;
    for (const v of values) {
      if (v.startsWith("'") || v === "data:" || !v.includes(".")) continue;
      hosts.add(v.replace(/^https?:\/\//, "").replace(/\/$/, ""));
    }
  }
  for (const host of hosts) {
    assert.ok(privacy.includes(host), `${host} is allowed by the CSP but not disclosed on /privacy`);
  }
  if (hosts.size > 0) {
    assert.ok(
      !/no analytics scripts/i.test(privacy),
      "the privacy page denies analytics scripts while the CSP allows an external script host",
    );
  }
});

test("no harvested source data is tracked, even force-added", () => {
  // caribstat/data holds the banks' own series. Both banks gave permission and
  // the ledger reads "served", but the canonical published copy is the caribstat
  // repository, which is what /v1/sources names and the Worker fetches. A second
  // copy here can drift from the one being served. .gitignore stops a plain
  // `git add`; `git add -f` walks straight past it. These prefixes are spelled
  // out on purpose: reading them from .gitignore would delete the guard the day
  // someone deletes the entry.
  const banned = ["caribstat/data/", "caribstat/reference/", "caribstat/.publish/", ".capture/"];
  const offenders = trackedFiles().filter((f) => banned.some((p) => f.startsWith(p)));
  assert.deepEqual(offenders, []);
});

test("the registry publish cannot run from a tree that fails the repository's own checks", () => {
  // 19 September 2026: CI run 35445862342 failed bench-equivalence at 13:28:29
  // for tag 1.13.0, and the release-triggered publish started 21 seconds later
  // and succeeded. The check had already run and gone red. Nothing stood
  // between it and the publish, so no checklist could have caught it.
  const wf = read(".github/workflows/publish-mcp.yml").replace(/\r\n/g, "\n");
  assert.match(wf, /^\s{2}gate:$/m, "publish-mcp.yml must have a gate job");
  assert.match(wf, /^\s{4}needs: gate$/m, "the publish job must depend on it");

  const gate = wf.slice(wf.indexOf("\n  gate:\n"), wf.indexOf("\n  publish:\n"));
  for (const cmd of [
    "npm run typecheck",
    "npm test",
    "node bench/tools/equivalence.test.mjs",
  ]) {
    assert.ok(gate.includes(cmd), `the gate must run \`${cmd}\`: that is what "green" has to mean`);
  }
  assert.ok(gate.includes("working-directory: caribstat"), "the gate must run the caribstat parser tests too");
  // The gate exists to be a plain read-only test runner. If it could mint the
  // namespace's OIDC token there would be nothing between an npm lifecycle
  // script and the registry credential, which is the reason mcp-publisher is
  // pinned and checksummed in the job below.
  assert.ok(!gate.includes("id-token"), "the gate must not be able to mint a publishing token");
});

test("CI runs the checks the gate promises, on the tree being published", () => {
  // The gate is self-contained rather than a poll of the Actions API: on a
  // release event the checkout resolves to the tag commit, so it tests exactly
  // what is about to be published. That only holds while the commands it runs
  // are the ones ci.yml runs, so compare the two rather than trusting the copy.
  const ci = read(".github/workflows/ci.yml").replace(/\r\n/g, "\n");
  const gate = (() => {
    const wf = read(".github/workflows/publish-mcp.yml").replace(/\r\n/g, "\n");
    return wf.slice(wf.indexOf("\n  gate:\n"), wf.indexOf("\n  publish:\n"));
  })();
  assert.ok(ci.includes("node bench/tools/equivalence.test.mjs"), "ci.yml still runs the equivalence check");
  assert.ok(gate.includes("node bench/tools/equivalence.test.mjs"), "and so does the gate");
  assert.match(gate, /node-version: 22/, "same Node as ci.yml, or a green gate means something else");
});
