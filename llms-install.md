# Installing StatCite (for AI agents and MCP marketplaces)

StatCite is a **remote** MCP server. There is nothing to build, clone, or run
locally, and no API key or account exists anywhere in the flow.

- Endpoint: `https://statcite.com/mcp` (Streamable HTTP, stateless, no auth)
- Protocol revisions: 2025-03-26 / 2025-06-18 / 2025-11-25
- REST mirror: `https://statcite.com/v1` (OpenAPI at `https://statcite.com/openapi.json`)

## Clients with native remote-MCP support

Add the URL directly:

```json
{ "mcpServers": { "statcite": { "url": "https://statcite.com/mcp" } } }
```

VS Code (`.vscode/mcp.json` or user settings):

```json
{ "servers": { "statcite": { "type": "http", "url": "https://statcite.com/mcp" } } }
```

Claude Code:

```bash
claude mcp add --transport http statcite https://statcite.com/mcp
```

## stdio-only clients (incl. Cline)

Bridge with mcp-remote — no installation beyond npx:

```json
{
  "mcpServers": {
    "statcite": {
      "command": "npx",
      "args": ["-y", "mcp-remote@latest", "https://statcite.com/mcp"]
    }
  }
}
```

## Verify the installation

Ask the agent:

> Using StatCite, verify that US inflation was 4.1% in 2023 and cite the
> official source.

A working installation returns a `match` verdict with the official value
(4.116…%) and a World Bank citation. Or check the server directly:

```bash
curl "https://statcite.com/v1/verify?indicator=inflation_cpi&country=USA&period=2023&value=4.1"
curl "https://statcite.com/v1/status"
```

## What the server exposes

- 12 read-only tools (lookup, verification, batch fact-checking, cross-source
  comparison, FX/inflation utilities, deep-research `search`/`fetch`)
- 3 prompts (`fact_check`, `country_brief`, `cite_this_stat`)
- 3 resources (indicator registry, source licence ledger, SIDS country list)
- 46 curated indicators (40 active), 200+ economies

Full agent-facing reference: https://statcite.com/llms-full.txt
