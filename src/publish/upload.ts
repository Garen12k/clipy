import { ApiFailure } from "./api";
import type { ChunkReader } from "./fileReader";

export class UploadError extends Error { constructor(message: string, public resumable: boolean) { super(message); } }
export interface UploadArgs { reader: ChunkReader; mimeType: string; chunkSize: number; onProgress(fraction: number): void; signal: AbortSignal; resume?: boolean; sleep?(ms: number): Promise<void> }
export const MAX_ATTEMPTS = 3;

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const cancelled = () => new UploadError("Upload cancelled.", false);
const dropped = () => new UploadError("The connection dropped. Check your internet, then resume.", true);
const unreadable = () => new UploadError("Couldn't read the video file.", false);
/** "bytes=0-524287" → 524288 (the next byte the server wants); no header → nothing stored yet. */
const nextFromRange = (h: string | null) => { const m = /bytes=0-(\d+)/.exec(h ?? ""); return m ? Number(m[1]) + 1 : 0; };
async function platformText(res: { text(): Promise<string> }, fallback: string): Promise<string> {
  const t = await res.text().catch(() => "");
  try { return (JSON.parse(t) as { error?: { message?: string } }).error?.message ?? (t.slice(0, 200) || fallback); } catch { return t.slice(0, 200) || fallback; }
}
/** Reads one chunk from disk; a read error or a short read is a file problem, never a network one. */
function readChunk(reader: ChunkReader, offset: number, length: number): Uint8Array {
  let bytes: Uint8Array;
  try { bytes = reader.read(offset, length); } catch { throw unreadable(); }
  if (!bytes || bytes.length !== length) throw unreadable();
  return bytes;
}
/** Backoff sleep that ends early when the upload is aborted (the loop's next abort check then throws). */
function sleepOrAbort(ms: number, signal: AbortSignal, sleep: (ms: number) => Promise<void>): Promise<void> {
  return new Promise<void>((resolve) => {
    if (signal.aborted) return resolve();
    const done = () => { signal.removeEventListener("abort", done); resolve(); };
    signal.addEventListener("abort", done);
    sleep(ms).then(done, done);
  });
}

export async function uploadGoogleResumable(url: string, headers: Record<string, string>, a: UploadArgs): Promise<string> {
  const total = a.reader.size, sleep = a.sleep ?? wait;
  if (!(total > 0)) throw new UploadError("The video file is empty.", false);
  // `attempts` counts consecutive failures at one offset; `failOffset` is where the current streak began.
  let offset = 0, attempts = 0, failOffset = 0, query = !!a.resume;
  /** Count a failure; give up after MAX_ATTEMPTS in a row, otherwise back off. */
  const fail = async () => {
    if (attempts === 0) failOffset = offset;
    if (++attempts > MAX_ATTEMPTS) throw dropped();
    await sleepOrAbort(1000 * 2 ** (attempts - 1), a.signal, sleep);
  };
  for (;;) {
    if (a.signal.aborted) throw cancelled();
    let res: Awaited<ReturnType<typeof fetch>> | null = null;
    const end = Math.min(offset + a.chunkSize, total);
    const bytes = query ? null : readChunk(a.reader, offset, end - offset);
    try {
      res = bytes === null
        ? await fetch(url, { method: "PUT", headers: { ...headers, "Content-Length": "0", "Content-Range": `bytes */${total}` }, body: "", signal: a.signal })
        : await fetch(url, { method: "PUT", headers: { ...headers, "Content-Type": a.mimeType, "Content-Range": `bytes ${offset}-${end - 1}/${total}` }, body: bytes as unknown as BodyInit, signal: a.signal });
    } catch { if (a.signal.aborted) throw cancelled(); }
    if (res && (res.status === 200 || res.status === 201)) {
      a.onProgress(1);
      try { return await res.text(); } catch { throw new UploadError("YouTube did not confirm the upload.", false); }
    }
    if (res && res.status === 308) {
      const next = nextFromRange(res.headers.get("Range"));
      if (!Number.isInteger(next) || next < 0 || next > total) throw new UploadError("YouTube reported an impossible upload position.", false);
      const wasQuery = query;
      if (!wasQuery && next <= offset) {
        // The chunk was accepted but nothing advanced: back off, then re-send from where the server is.
        await fail();
        offset = next;
        continue;
      }
      if (next > (wasQuery ? failOffset : offset)) attempts = 0;
      offset = next;
      a.onProgress(offset / total);
      // Everything is stored but YouTube has not confirmed: ask again instead of sending a zero-length chunk.
      if (offset === total) { query = true; if (wasQuery) await fail(); } else query = false;
      continue;
    }
    if (res && res.status === 404) throw new UploadError("The upload session expired. Post again.", false);
    if (res && res.status >= 400 && res.status < 500) throw new UploadError(await platformText(res, `Upload failed (${res.status}).`), false);
    // Network error or 5xx: wait, then ask the server how much it has before sending more.
    await fail();
    query = true;
  }
}

export async function uploadRelay(send: (offset: number, total: number, bytes: Uint8Array, signal: AbortSignal) => Promise<{ nextOffset: number }>, a: UploadArgs): Promise<void> {
  const total = a.reader.size, sleep = a.sleep ?? wait;
  if (!(total > 0)) throw new UploadError("The video file is empty.", false);
  let offset = 0, attempts = 0;
  while (offset < total) {
    if (a.signal.aborted) throw cancelled();
    const end = Math.min(offset + a.chunkSize, total);
    const bytes = readChunk(a.reader, offset, end - offset);
    try {
      const next = (await send(offset, total, bytes, a.signal)).nextOffset;
      if (a.signal.aborted) throw cancelled();
      if (!Number.isInteger(next) || next <= offset || next > total) throw new UploadError("The server gave an unexpected upload position.", false);
      offset = next;
      attempts = 0;
      a.onProgress(offset / total);
    } catch (e) {
      if (!(e instanceof ApiFailure) || (e.code !== "unreachable" && e.code !== "internal")) throw e;
      if (++attempts > MAX_ATTEMPTS) throw dropped();
      await sleepOrAbort(1000 * 2 ** (attempts - 1), a.signal, sleep);
    }
  }
}
