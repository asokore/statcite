// Security guards for the static site and the repository itself.
// Security review 2026-09-15. No network.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

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
