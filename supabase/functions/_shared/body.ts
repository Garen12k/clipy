import { ApiError } from "./errors.ts";

const tooLarge = (message: string) => new ApiError(413, "too_large", message);

/**
 * Reads a request body into memory, refusing anything over `max` bytes.
 * A declared Content-Length over the cap is refused before reading; the bytes actually read are capped too,
 * because the header may be absent or wrong.
 */
export async function readCapped(req: Request, max: number, message = "Upload piece is too large."): Promise<Uint8Array> {
  const declared = Number(req.headers.get("Content-Length"));
  if (Number.isFinite(declared) && declared > max) throw tooLarge(message);
  if (!req.body) return new Uint8Array(0);
  const reader = req.body.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > max) { await reader.cancel().catch(() => {}); throw tooLarge(message); }
    parts.push(value);
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}
