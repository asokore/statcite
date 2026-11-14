// MCP Apps view (io.modelcontextprotocol/ui, spec 2026-01-26) for the three
// figure tools: get_indicator, get_series and verify_stat. A host that
// supports MCP Apps renders this page in a sandboxed frame and posts it the
// tool result. A host that does not ignores the tool's _meta and reads the
// text content exactly as before.
//
// Constraints, all deliberate:
//   - No external origin of any kind. No script, font, image or stylesheet is
//     loaded, and the resource declares no CSP domains, so the host applies
//     its strictest default (connect-src 'none'). A test fails if an http(s)
//     origin ever appears in this file's HTML.
//   - Every value reaches the page through textContent, never innerHTML, so a
//     string from an upstream source cannot become markup.
//   - The handshake is written by hand (about 40 lines) instead of loading the
//     ext-apps SDK, which keeps the Worker at zero runtime dependencies
//     (CLAUDE.md invariant 5). Wire format taken from the SDK's App.connect():
//     ui/initialize { appCapabilities, appInfo, protocolVersion } then
//     ui/notifications/initialized.

export const CITATION_CARD_URI = "ui://statcite/citation-card";
export const MCP_APP_MIME = "text/html;profile=mcp-app";
/** Tools whose result the card can draw. */
export const CARD_TOOLS: ReadonlySet<string> = new Set(["get_indicator", "get_series", "verify_stat"]);

export const CITATION_CARD_HTML = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="color-scheme" content="light dark">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>StatCite citation</title>
<style>
:root{--bg:var(--color-background-primary,Canvas);--fg:var(--color-text-primary,CanvasText);--muted:var(--color-text-secondary,GrayText);--line:var(--color-border-primary,rgba(127,127,127,.35));--font:var(--font-sans,system-ui,sans-serif)}
*{box-sizing:border-box}
body{margin:0;padding:14px 16px;font:14px/1.45 var(--font);color:var(--fg);background:var(--bg)}
#head{font-weight:600}
#sub{color:var(--muted);font-size:12.5px;margin-top:2px}
#value{font-size:28px;font-weight:650;margin:10px 0 2px;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}
#period{color:var(--muted);font-size:12.5px}
#verdict{display:inline-block;margin:10px 0 0;padding:2px 9px;border:1px solid var(--line);border-radius:999px;font-size:12.5px;font-weight:600}
#verdict[hidden],#explain[hidden]{display:none}
#explain{margin:8px 0 0}
#cite{margin-top:12px;padding-top:10px;border-top:1px solid var(--line)}
#ctext{margin:0;font-size:13px;overflow-wrap:anywhere}
#meta{margin-top:6px;color:var(--muted);font-size:12px;overflow-wrap:anywhere}
button{margin-top:10px;font:inherit;font-size:12.5px;padding:5px 12px;border:1px solid var(--line);border-radius:8px;background:transparent;color:inherit;cursor:pointer}
button:focus-visible{outline:2px solid currentColor;outline-offset:2px}
</style></head>
<body>
<div id="head">Waiting for a StatCite result</div>
<div id="sub"></div>
<div id="value"></div>
<div id="period"></div>
<div id="verdict" hidden></div>
<p id="explain" hidden></p>
<div id="cite" hidden>
<p id="ctext"></p>
<div id="meta"></div>
<button id="copy" type="button">Copy citation</button>
</div>
<script>
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var nextId = 1, pending = {};
  function send(msg) { window.parent.postMessage(msg, "*"); }
  function request(method, params) {
    var id = nextId++;
    send({ jsonrpc: "2.0", id: id, method: method, params: params });
    return new Promise(function (resolve, reject) { pending[id] = { resolve: resolve, reject: reject }; });
  }
  function notify(method, params) { send(params === undefined ? { jsonrpc: "2.0", method: method } : { jsonrpc: "2.0", method: method, params: params }); }

  function fmt(v) {
    if (typeof v !== "number" || !isFinite(v)) return v == null ? "" : String(v);
    var a = Math.abs(v), d = a >= 1000 ? 0 : a >= 100 ? 1 : a >= 1 ? 3 : 4;
    return v.toLocaleString("en-GB", { maximumFractionDigits: d });
  }
  function set(id, text) { var el = $(id); el.textContent = text == null ? "" : String(text); return el; }

  function render(result) {
    var sc = result && result.structuredContent;
    if (!sc || typeof sc !== "object") {
      var t = result && result.content && result.content[0] && result.content[0].text;
      set("head", result && result.isError ? "StatCite returned an error" : "StatCite result");
      set("sub", t ? String(t).slice(0, 400) : "");
      return resize();
    }
    if (sc.error) { set("head", "StatCite returned an error"); set("sub", sc.error); return resize(); }
    var series = sc.series || {}, country = sc.country || {};
    set("head", sc.name || series.name || (sc.citation && sc.citation.series_name) || "StatCite figure");
    set("sub", [country.name, sc.unit || series.unit].filter(Boolean).join(" \\u00b7 "));
    if (sc.verdict) {
      set("value", fmt(sc.official_value));
      set("period", "Official value for " + (sc.period || "") + (sc.claimed_value != null ? ", claimed " + fmt(sc.claimed_value) : ""));
      set("verdict", "Verdict: " + String(sc.verdict).replace(/_/g, " ")).hidden = false;
      if (sc.explanation) set("explain", sc.explanation).hidden = false;
    } else {
      var obs = Array.isArray(sc.observations) ? sc.observations : [];
      var last = obs.length ? obs[obs.length - 1] : null;
      set("value", last ? fmt(last.value) : "");
      set("period", last ? (obs.length > 1 ? "Latest of " + obs.length + " observations, " : "") + "period " + last.period : "No observations returned");
    }
    var c = sc.citation;
    if (c && c.citation_text) {
      set("ctext", c.citation_text);
      set("meta", [c.license && "Licence: " + c.license, c.retrieved_at && "Retrieved " + c.retrieved_at].filter(Boolean).join(" \\u00b7 "));
      $("cite").hidden = false;
      $("copy").onclick = function () { copy(c.citation_text); };
    }
    resize();
  }

  function copy(text) {
    var done = function () { set("copy", "Copied"); setTimeout(function () { set("copy", "Copy citation"); }, 1500); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { selectText(); });
    } else { selectText(); }
  }
  function selectText() {
    var r = document.createRange(); r.selectNodeContents($("ctext"));
    var s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
    set("copy", "Selected, press Ctrl+C");
  }
  function resize() {
    var h = Math.ceil(document.documentElement.getBoundingClientRect().height);
    notify("ui/notifications/size-changed", { width: Math.ceil(document.documentElement.clientWidth), height: h });
  }

  window.addEventListener("message", function (event) {
    if (event.source !== window.parent) return;
    var m = event.data;
    if (!m || m.jsonrpc !== "2.0") return;
    if (m.id != null && !m.method && pending[m.id]) {
      var p = pending[m.id]; delete pending[m.id];
      if (m.error) p.reject(m.error); else p.resolve(m.result);
      return;
    }
    if (m.method === "ui/notifications/tool-result") return render(m.params);
    if (m.method === "ui/notifications/tool-cancelled") { set("head", "The tool call was cancelled"); return resize(); }
    // Any request from the host (ping, ui/resource-teardown) gets an empty result.
    if (m.id != null && m.method) send({ jsonrpc: "2.0", id: m.id, result: {} });
  });

  request("ui/initialize", {
    appCapabilities: { availableDisplayModes: ["inline"] },
    appInfo: { name: "StatCite citation card", version: "1.0.0" },
    protocolVersion: "2026-01-26"
  }).then(function () { notify("ui/notifications/initialized"); resize(); }, function () { resize(); });
})();
</script>
</body></html>`;
