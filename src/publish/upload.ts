import { ApiFailure } from "./api";
import type { ChunkReader } from "./fileReader";

export class UploadError extends Error { constructor(message: string, public resumable: boolean) { super(message); } }
export interface UploadArgs { reader: ChunkReader; mimeType: string; chunkSize: number; onProgress(fraction: number): void; signal: AbortSignal; resume?: boolean; sleep?(ms: number): Promise<void> }
export const MAX_ATTEMPTS = 3;

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const cancelled = () => new UploadError("Upload cancelled.", false);
const dropped = () => new UploadError("The connection dropped. Check your internet, then resume.", true);
/** "bytes=0-524287" → 524288 (the next byte the server wants); no header → nothing stored yet. */
const nextFromRange = (h: string | null) => { const m = /bytes=0-(\d+)/.exec(h ?? ""); return m ? Number(m[1]) + 1 : 0; };
async function platformText(res: { text(): Promise<string> }, fallback: string): Promise<string> {
  const t = await res.text().catch(() => "");
  try { return (JSON.parse(t) as { error?: { message?: string } }).error?.message ?? (t.slice(0, 200) || fallback); } catch { return t.slice(0, 200) || fallback; }
}

export async function uploadGoogleResumable(url: string, headers: Record<string, string>, a: UploadArgs): Promise<string> {
  const total = a.reader.size, sleep = a.sleep ?? wait;
  let offset = 0, attempts = 0, query = !!a.resume;
  for (;;) {
    if (a.signal.aborted) throw cancelled();
    let res: Awaited<ReturnType<typeof fetch>> | null = null;
    const end = Math.min(offset + a.chunkSize, total);
    try {
      res = query
        ? await fetch(url, { method: "PUT", headers: { ...headers, "Content-Range": `bytes */${total}` }, signal: a.signal })
        : await fetch(url, { method: "PUT", headers: { ...headers, "Content-Type": a.mimeType, "Content-Range": `bytes ${offset}-${end - 1}/${total}` }, body: a.reader.read(offset, end - offset) as unknown as BodyInit, signal: a.signal });
    } catch { if (a.signal.aborted) throw cancelled(); }
    if (res && (res.status === 200 || res.status === 201)) { a.onProgress(1); return res.text(); }
    if (res && res.status === 308) {
      const next = nextFromRange(res.headers.get("Range"));
      if (!query && next <= offset) { if (++attempts > MAX_ATTEMPTS) throw dropped(); } else attempts = 0;
      offset = next; query = false;
      a.onProgress(offset / total);
      continue;
    }
    if (res && res.status === 404) throw new UploadError("The upload session expired. Post again.", false);
    if (res && res.status >= 400 && res.status < 500) throw new UploadError(await platformText(res, `Upload failed (${res.status}).`), false);
    // Network error or 5xx: wait, then ask the server how much it has before sending more.
    if (++attempts > MAX_ATTEMPTS) throw dropped();
    await sleep(1000 * 2 ** (attempts - 1));
    query = true;
  }
}

export async function uploadRelay(send: (offset: number, total: number, bytes: Uint8Array) => Promise<{ nextOffset: number }>, a: UploadArgs): Promise<void> {
  const total = a.reader.size, sleep = a.sleep ?? wait;
  let offset = 0, attempts = 0;
  while (offset < total) {
    if (a.signal.aborted) throw cancelled();
    const end = Math.min(offset + a.chunkSize, total);
    try {
      offset = (await send(offset, total, a.reader.read(offset, end - offset))).nextOffset;
      attempts = 0;
      a.onProgress(offset / total);
    } catch (e) {
      if (!(e instanceof ApiFailure) || (e.code !== "unreachable" && e.code !== "internal")) throw e;
      if (++attempts >= MAX_ATTEMPTS) throw dropped();
      await sleep(1000 * 2 ** (attempts - 1));
    }
  }
}
