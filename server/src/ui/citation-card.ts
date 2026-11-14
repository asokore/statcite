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
//   - Figures are shown as the server returned them, with digit grouping only.
//     A verdict card that rounds the claim and the official value can make a
//     mismatch look equal, and the cited licences forbid altering the data.
//   - The headline value follows series.ts "latest" semantics: the latest
//     value not marked as a projection or as ECCB future data, with the
//     observation's own note shown beside it.
//   - Every disclosure the server attaches travels with the card: limitations,
//     notes, fallback_used, is_projection, as_of, and citation.notices (which
//     are also copied with the citation text).
//   - The handshake is written by hand instead of loading the ext-apps SDK,
//     which keeps the Worker at zero runtime dependencies (CLAUDE.md
//     invariant 5). Wire format taken from the SDK's App.connect():
//     ui/initialize { appCapabilities, appInfo, protocolVersion } then
//     ui/notifications/initialized. The host context from the initialize
//     result and from host-context-changed sets the theme and style variables.
//   - No backslash escapes inside the template literal below: a template
//     literal silently drops unknown escapes, so the script avoids them.

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
[hidden]{display:none!important}
body{margin:0;padding:14px 16px;font:14px/1.45 var(--font);color:var(--fg);background:var(--bg)}
#head{font-weight:600}
#sub{color:var(--muted);font-size:12.5px;margin-top:2px;overflow-wrap:anywhere}
#value{font-size:28px;font-weight:650;margin:10px 0 2px;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}
#period{color:var(--muted);font-size:12.5px}
#verdict{display:inline-block;margin:10px 0 0;padding:2px 9px;border:1px solid var(--line);border-radius:999px;font-size:12.5px;font-weight:600}
#explain{margin:8px 0 0}
#notes{margin:8px 0 0;padding-left:18px;color:var(--muted);font-size:12.5px;overflow-wrap:anywhere}
#cite{margin-top:12px;padding-top:10px;border-top:1px solid var(--line)}
#ctext,#cnotice{margin:0;font-size:13px;overflow-wrap:anywhere}
#cnotice{margin-top:6px;font-style:italic}
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
<ul id="notes" hidden></ul>
<div id="cite" hidden>
<div id="cbody"><p id="ctext"></p><p id="cnotice" hidden></p></div>
<div id="meta"></div>
<button id="copy" type="button">Copy citation</button>
</div>
<script>
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var nextId = 1, pending = {}, lastSize = "", ready = false;
  var DOT = " " + String.fromCharCode(183) + " ";
  function send(msg) { window.parent.postMessage(msg, "*"); }
  function request(method, params) {
    var id = nextId++;
    send({ jsonrpc: "2.0", id: id, method: method, params: params });
    return new Promise(function (resolve, reject) { pending[id] = { resolve: resolve, reject: reject }; });
  }
  function notify(method, params) { send(params === undefined ? { jsonrpc: "2.0", method: method } : { jsonrpc: "2.0", method: method, params: params }); }

  // As returned, with digit grouping only. Never rounds.
  function fmt(v) {
    if (typeof v !== "number" || !isFinite(v)) return v == null ? "" : String(v);
    return v.toLocaleString("en-GB", { maximumFractionDigits: 20 });
  }
  function set(id, text) { var el = $(id); el.textContent = text == null ? "" : String(text); return el; }
  function isProjection(o) {
    var n = (o && o.note) || "";
    return /projection/i.test(n) || /^The ECCB shades [^ ]+ as future data/.test(n);
  }

  function reset() {
    set("head", "Waiting for a StatCite result");
    ["sub", "value", "period", "verdict", "explain", "ctext", "cnotice", "meta"].forEach(function (id) { set(id, ""); });
    ["verdict", "explain", "cnotice", "cite"].forEach(function (id) { $(id).hidden = true; });
    listNotes([]);
  }
  function listNotes(lines) {
    var ul = $("notes"), seen = {};
    while (ul.firstChild) ul.removeChild(ul.firstChild);
    lines.forEach(function (t) {
      if (t == null || t === "") return;
      t = String(t);
      if (seen[t]) return;
      seen[t] = true;
      var li = document.createElement("li");
      li.textContent = t;
      ul.appendChild(li);
    });
    ul.hidden = !ul.firstChild;
  }
  function errorText(result) {
    var t = result && result.content && result.content[0] && result.content[0].text;
    if (!t) return "";
    try {
      var j = JSON.parse(t);
      if (j && j.error) return typeof j.error === "string" ? j.error : (j.error.message || String(t));
    } catch (e) { /* not JSON, show as is */ }
    return String(t);
  }

  function render(result) {
    reset();
    var sc = result && result.structuredContent;
    if (!sc || typeof sc !== "object" || (result && result.isError)) {
      set("head", result && result.isError ? "StatCite returned an error" : "StatCite result");
      set("sub", errorText(result).slice(0, 600));
      return resize();
    }
    var series = sc.series || {}, country = sc.country || {}, notes = [];
    set("head", sc.name || series.name || (sc.citation && sc.citation.series_name) || "StatCite figure");
    set("sub", [country.name, sc.unit || series.unit].filter(Boolean).join(DOT));
    if (sc.verdict) {
      var hasOfficial = typeof sc.official_value === "number";
      set("value", hasOfficial ? fmt(sc.official_value) : "No official value");
      set("period", (hasOfficial ? (sc.fallback_used ? "Indicative value for " : "Official value for ") : "Period ") + (sc.period || "") + (sc.claimed_value != null ? ", claimed " + fmt(sc.claimed_value) : ""));
      $("verdict").hidden = false;
      set("verdict", "Verdict: " + String(sc.verdict).replace(/_/g, " "));
      if (sc.explanation) { set("explain", sc.explanation); $("explain").hidden = false; }
      if (sc.is_projection) notes.push("The source marks this period as a projection or future data, not a final figure.");
      if (sc.fallback_used) notes.push("This official value came from a fallback source, not the primary one.");
      if (Array.isArray(sc.diagnostics)) sc.diagnostics.forEach(function (d) { notes.push(d); });
      if (sc.as_of && sc.as_of.resolved_vintage) notes.push("Checked against the archived edition " + sc.as_of.resolved_vintage + (sc.as_of.requested ? " as of " + sc.as_of.requested : "") + ", not today's data.");
    } else {
      var obs = Array.isArray(sc.observations) ? sc.observations.filter(function (o) { return o && o.value != null; }) : [];
      var outturns = obs.filter(function (o) { return !isProjection(o); });
      var pick = outturns.length ? outturns[outturns.length - 1] : obs[obs.length - 1];
      if (pick) {
        set("value", fmt(pick.value));
        var lead = obs.length > 1 ? (outturns.length && outturns.length < obs.length ? "Latest value not marked as a projection, of " : "Latest of ") + obs.length + " observations, " : "";
        set("period", lead + "period " + pick.period);
        if (pick.note) notes.push(pick.note);
        if (outturns.length && outturns.length < obs.length) notes.push("Later periods in this result are marked as projections or future data.");
      } else {
        set("period", "No observations returned");
      }
    }
    if (Array.isArray(sc.limitations)) sc.limitations.forEach(function (l) { if (l && l.detail) notes.push(l.detail); });
    if (Array.isArray(sc.notes)) sc.notes.forEach(function (n) { notes.push(n); });
    listNotes(notes);
    var c = sc.citation;
    if (c && c.citation_text) {
      var notices = Array.isArray(c.notices) ? c.notices.filter(Boolean).map(String) : [];
      set("ctext", c.citation_text);
      set("cnotice", notices.join(" "));
      $("cnotice").hidden = !notices.length;
      set("meta", [c.license && "Licence: " + c.license, c.retrieved_at && "Retrieved " + c.retrieved_at].filter(Boolean).join(DOT));
      $("cite").hidden = false;
      var full = [String(c.citation_text)].concat(notices).join(" ");
      $("copy").onclick = function () { copy(full); };
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
    var r = document.createRange(); r.selectNodeContents($("cbody"));
    var s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
    set("copy", "Selected. Use your copy shortcut");
  }
  // No size is sent before the host has answered ui/initialize, so the first
  // size-changed always follows ui/notifications/initialized.
  function resize() {
    if (!ready) return;
    var root = document.documentElement;
    var w = Math.ceil(root.clientWidth), h = Math.ceil(root.getBoundingClientRect().height);
    var key = w + "x" + h;
    if (key === lastSize) return;
    lastSize = key;
    notify("ui/notifications/size-changed", { width: w, height: h });
  }
  function applyHost(ctx) {
    if (!ctx || typeof ctx !== "object") return;
    var root = document.documentElement;
    if (ctx.theme === "light" || ctx.theme === "dark") root.style.colorScheme = ctx.theme;
    var vars = ctx.styles && ctx.styles.variables;
    if (vars && typeof vars === "object") {
      Object.keys(vars).forEach(function (k) {
        if (/^--[A-Za-z0-9-]+$/.test(k) && typeof vars[k] === "string") root.style.setProperty(k, vars[k]);
      });
    }
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
    if (m.method === "ui/notifications/tool-cancelled") { reset(); set("head", "The tool call was cancelled"); return resize(); }
    if (m.method === "ui/notifications/host-context-changed") { applyHost(m.params); return resize(); }
    if (m.id != null && m.method) {
      if (m.method === "ping" || m.method === "ui/resource-teardown") send({ jsonrpc: "2.0", id: m.id, result: {} });
      else send({ jsonrpc: "2.0", id: m.id, error: { code: -32601, message: "Method not found" } });
    }
  });

  if (typeof ResizeObserver === "function") new ResizeObserver(function () { resize(); }).observe(document.documentElement);

  request("ui/initialize", {
    appCapabilities: { availableDisplayModes: ["inline"] },
    appInfo: { name: "StatCite citation card", version: "1.0.0" },
    protocolVersion: "2026-01-26"
  }).then(function (res) { applyHost(res && res.hostContext); notify("ui/notifications/initialized"); ready = true; resize(); }, function () { ready = true; resize(); });
})();
</script>
</body></html>`;
