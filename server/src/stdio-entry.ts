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
import { dispatchMessage } from "./mcp.ts";

const ctx: Ctx = { baseUrl: "https://statcite.com" };

const rl = readline.createInterface({ input: process.stdin, terminal: false });

rl.on("line", (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  void handleLine(trimmed);
});

async function handleLine(line: string): Promise<void> {
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
    const bodies: Record<string, unknown>[] = [];
    for (const m of parsed) {
      const r = await dispatchMessage(m as Parameters<typeof dispatchMessage>[0], ctx);
      if (r.body) bodies.push(r.body);
    }
    if (bodies.length > 0) process.stdout.write(JSON.stringify(bodies) + "\n");
    return;
  }

  const r = await dispatchMessage(parsed as Parameters<typeof dispatchMessage>[0], ctx);
  if (r.body !== null) process.stdout.write(JSON.stringify(r.body) + "\n");
}

process.stdin.resume();
