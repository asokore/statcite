// Request body reading with a hard byte cap, shared by /mcp and /v1/verify_claims.

/** Largest request body accepted, in bytes. A 20-message MCP batch or a
 * 15-claim verify_claims body is a few KB, so this leaves a wide margin. */
export const MAX_BODY_BYTES = 262_144;

export type BodyRead = { ok: true; text: string } | { ok: false; bytes?: number };

/**
 * Read a request body as text without ever buffering more than maxBytes.
 *
 * A declared Content-Length over the cap is refused before anything is read.
 * The counting reader then enforces the cap for bodies that declare no length
 * (chunked uploads) or declare a false one. Reading the whole body first and
 * checking its length afterwards, as /mcp did, let a caller make the Worker
 * buffer an arbitrarily large body before the check ran.
 */
export async function readBodyCapped(request: Request, maxBytes = MAX_BODY_BYTES): Promise<BodyRead> {
  const header = request.headers.get("content-length");
  if (header !== null) {
    const declared = Number(header);
    if (Number.isFinite(declared) && declared > maxBytes) return { ok: false, bytes: declared };
  }
  if (!request.body) return { ok: true, text: "" };
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return { ok: false };
    }
    chunks.push(value);
  }
  const buf = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    buf.set(c, off);
    off += c.byteLength;
  }
  return { ok: true, text: new TextDecoder().decode(buf) };
}
