// server/src/stdio-entry.ts — stdio transport entry point for local/sandboxed
// hosts (e.g. Glama's Docker build-and-scan flow) that expect to spawn and talk
// to an MCP server over stdin/stdout, rather than connect to a deployed HTTP
// endpoint. Reuses the exact same JSON-RPC dispatch as the production HTTP
// transport (mcp.ts's dispatchMessage) — no protocol logic is duplicated here,
// only the stdio framing (one JSON-RPC message per line, per the MCP stdio
// transport spec).
//
// Run with: node --import tsx server/src/stdio-entry.ts
// (or from repo root: node --import tsx server/src/stdio-entry.ts, run from server/)

import * as readline from "node:readline";
import type { Ctx } from "./core/types.ts";
import { dispatchMessage, requestEra } from "./mcp.ts";

/** Era per message. stdio carries no HTTP headers, so the only signal is the
 * body: `params._meta` protocol version, or a `server/discover` call — which
 * is exactly the probe the 2026-07-28 stdio backward-compatibility flow tells
 * dual-era clients to send first. */
function eraOf(msg: unknown): "legacy" | "modern" {
  const m = (msg ?? {}) as { method?: string; params?: Record<string, unknown> };
  return requestEra(m.method, (m.params ?? {}) as Record<string, unknown>, null);
}

// A fresh Ctx per line, not one shared for the process lifetime: _dmMemo
// memoizes rejections too (see core/types.ts), which is correct within one
// request/line but would let one transient IMF blip permanently degrade every
// later call in a long-running stdio process if the Ctx (and its memo) were
// reused across lines.
function newCtx(): Ctx {
  return { baseUrl: "https://statcite.com" };
}

const rl = readline.createInterface({ input: process.stdin, terminal: false });

rl.on("line", (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  void handleLine(trimmed);
});

async function handleLine(line: string): Promise<void> {
  const ctx = newCtx();
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    process.stdout.write(
      JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error: line must be JSON." } }) + "\n",
    );
    return;
  }

  if (Array.isArray(parsed)) {
    // Mirrors the batch cap in mcp.ts (same free-tier subrequest-budget reason).
    if (parsed.length > 20) {
      process.stdout.write(
        JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Invalid Request: batch too large (max 20 messages)." } }) + "\n",
      );
      return;
    }
    const bodies: Record<string, unknown>[] = [];
    for (const m of parsed) {
      const r = await dispatchMessage(m as Parameters<typeof dispatchMessage>[0], ctx, eraOf(m));
      if (r.body) bodies.push(r.body);
    }
    if (bodies.length > 0) process.stdout.write(JSON.stringify(bodies) + "\n");
    return;
  }

  const r = await dispatchMessage(parsed as Parameters<typeof dispatchMessage>[0], ctx, eraOf(parsed));
  if (r.body !== null) process.stdout.write(JSON.stringify(r.body) + "\n");
}

process.stdin.resume();
