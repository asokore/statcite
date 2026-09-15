// Text safety helpers for anything the service echoes or passes through.

/**
 * Caller-supplied text quoted back inside a server-written message.
 *
 * Truncated, with control characters, newlines and quotes shown as visible
 * escapes, so a reflected value can neither flood an error message nor break
 * out of the quotes around it and read as the server's own prose. Normal names
 * render exactly as typed.
 */
export function quoteInput(value: unknown, max = 80): string {
  const s = String(value ?? "");
  const cut = s.length > max ? s.slice(0, max) : s;
  const escaped = JSON.stringify(cut).slice(1, -1);
  return s.length > max ? `${escaped}...` : escaped;
}

/** C0 and C1 controls, Unicode line and paragraph separators, and bidi
 * embedding and isolate controls. Each can break a line or reorder text in
 * whatever renders a citation. */
const CONTROL_RUN = /[\u0000-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069]+/g;

/**
 * Control characters removed from text, each run replaced by one space. No
 * length cap and no other change, so ordinary text is returned byte for byte.
 */
export function stripControls(value: string): string {
  return typeof value === "string" ? value.replace(CONTROL_RUN, " ") : value;
}

/**
 * Third-party text (a table title, a row label, a source name) made safe to
 * place in a citation an agent is told to reproduce: control characters and
 * line breaks become single spaces, and the length is capped. The longest real
 * CaribStat label is 106 characters, so the cap never trims legitimate text.
 *
 * Runs of ordinary spaces are kept. Some Central Bank of Barbados labels carry
 * two spaces, and those exact labels are the row selectors earlier responses
 * handed out. Collapsing them broke those selectors and merged two different
 * rows into one ambiguous label.
 */
export function cleanLabel(value: unknown, max = 300): string {
  const s = stripControls(String(value ?? "")).trim();
  return s.length > max ? `${s.slice(0, max - 3)}...` : s;
}

/** An https URL, or undefined. Anything else (http, javascript:, data:, garbage) is dropped. */
export function httpsUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  try {
    const u = new URL(value);
    return u.protocol === "https:" ? u.href : undefined;
  } catch {
    return undefined;
  }
}
