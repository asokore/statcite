# A StatCite panel through MCP Apps: scope (November 2026)

Backlog item A-072. The question is whether StatCite should show a panel inside AI hosts that support interactive connectors, and what that would take. Nothing has been built. This note sets out the work so the decision can be made on facts.

## What MCP Apps is

MCP Apps is an extension to the Model Context Protocol, identifier `io.modelcontextprotocol/ui`. Its specification is marked "Stable (2026-01-26)" and calls itself an MVP. Source: https://github.com/modelcontextprotocol/ext-apps/blob/main/specification/2026-01-26/apps.mdx, read on 14 November 2026 by a fetch agent. The points below come from that page and were not re-read by hand.

- A server offers a page as a resource with a `ui://` URI. Its `mimeType` must be `text/html;profile=mcp-app`, and the content must be a full HTML5 document.
- A tool points at that page through `_meta.ui.resourceUri`. The flat key `_meta["ui/resourceUri"]` is deprecated.
- The host advertises support. It sends `capabilities.extensions["io.modelcontextprotocol/ui"]` with the MIME type it accepts. The server should check for it before attaching pages to tools, and should keep a text-only answer for hosts without it.
- The host renders the page in a sandboxed frame and passes it the tool's input and its result, through `ui/notifications/tool-input` and `ui/notifications/tool-result`.
- The page may call the server's tools back through `tools/call`.
- With no `_meta.ui.csp` declared, the host must apply `default-src 'none'` and `connect-src 'none'`. A page that needs nothing from the network can therefore run under the strictest policy the host has.

Anthropic's Help Center says Claude's interactive connectors are built on MCP Apps and that a connector's developer chooses which views to support (article 13454812, read by the design lab's agent on 13 November 2026). The specification itself does not name any host.

## Where StatCite already stands

- `server/src/mcp.ts` is a hand-written MCP server that speaks the legacy and the 2026-07-28 revisions on one endpoint. It already serves `resources/list` and `resources/read`, with three text resources under `statcite://`.
- Every successful tool call already returns `structuredContent` beside the text copy (`toolTextObj`). A panel would read the same object the model reads, so it needs no new data path.
- Six tools declare an `outputSchema` (`server/src/tools.ts`).
- The legacy era has a byte-identical regression promise, covered in `test/regressions.test.ts` and `test/mcp.test.ts`.

## The proposed panel

One page, `ui://statcite/citation-card`, attached to `get_indicator`, `get_series` and `verify_stat`.

- It shows the figure, its period and unit, and the citation object: source, licence, retrieval time and the ready citation sentence, with a copy button for that sentence.
- For `verify_stat` it shows the verdict beside the published figure.
- It draws everything from the tool result. It declares no `connectDomains`, so the host's default policy blocks all network access and the page cannot leak or fetch anything.
- It carries no fonts or images from outside. Inline CSS and script only.

This fits the positions `docs/VENTURE-CONTEXT.md` names as defensible: the citation on every figure, verification, and delivery inside the tools agents already use. It is not on the list of ideas ruled out there.

## Work involved

1. **Capability gate.** Read `capabilities.extensions["io.modelcontextprotocol/ui"]` from `initialize` in the legacy era and from `params._meta` in the modern era. Attach `_meta.ui` to the three tools only when it is present. A host without it sees today's bytes, and the regression tests stay as they are.
2. **The resource.** Add the `ui://` entry to `RESOURCES` with the new MIME type, served from a constant in the bundle. The Worker stays free of new dependencies.
3. **The page.** One self-contained HTML file that implements `ui/initialize`, listens for the tool result and renders it. Light and dark, readable at narrow widths.
4. **Tests.** Gate on and gate off for both eras. The page's `resources/read` shape. A check that the page names no external origin, mutation-tested by planting one and confirming the check fails.
5. **A host to try it on.** The spec names none. Before building, confirm that Claude renders MCP Apps panels for a custom remote connector that is not in Anthropic's directory. If it renders them only for listed connectors, the listing goes through Anthropic's submission process first.

## Cost

No money. The page ships inside the existing Worker on the current plan and calls no paid service. The cost is time: about one session to build and test, plus the host check in step 5.

## Open questions

- Whether Claude renders panels from an unlisted custom connector is not yet known. The answer decides whether step 5 comes first.
- Which other hosts support MCP Apps today is not yet known. The Glama, Smithery and Apify listings would each need checking.
- A chart of a short series from `get_series` could follow later. A table is enough for a first version.
