import { ApiFailure } from "./api";
import type { ChunkReader } from "./fileReader";
import { postWholeFile } from "./wholeFileUpload";

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

/** TikTok's plan: floor(total / chunk) chunks (at least 1); the last one carries the remainder. `end` is exclusive. */
export function tiktokChunkRanges(total: number, chunkSize: number): Array<{ start: number; end: number }> {
  const size = Math.min(chunkSize, total), count = Math.max(1, Math.floor(total / size));
  return Array.from({ length: count }, (_, i) => ({ start: i * size, end: i === count - 1 ? total : (i + 1) * size }));
}

const again = (what: string) => new UploadError(`${what} Post again.`, false);
/** Replies worth sending the same chunk again for: the server is busy or slow, not refusing. */
const retryInPlace = (status: number) => status >= 500 || status === 408 || status === 429;

/**
 * PUTs one chunk, retrying a dropped connection, 5xx, 408 or 429 in place (MAX_ATTEMPTS retries with backoff).
 * Returns any other reply for the caller to judge.
 */
async function putTikTokChunk(url: string, init: { headers: Record<string, string>; body: Uint8Array }, a: UploadArgs, sleep: (ms: number) => Promise<void>) {
  for (let failures = 0; failures <= MAX_ATTEMPTS; failures++) {
    if (failures > 0) await sleepOrAbort(1000 * 2 ** (failures - 1), a.signal, sleep);
    if (a.signal.aborted) throw cancelled();
    try {
      const res = await fetch(url, { method: "PUT", headers: init.headers, body: init.body as unknown as BodyInit, signal: a.signal });
      if (!retryInPlace(res.status)) return res;
    } catch { if (a.signal.aborted) throw cancelled(); }
  }
  throw new UploadError("The connection dropped. Post again to restart the TikTok upload.", false);
}

/**
 * TikTok's pre-signed upload address: the chunks go in order, 206 = keep going, 201 (or 200) on the last chunk = everything received.
 * TikTok offers no way to ask how far an upload got, so a failed upload is restarted from a fresh address (never "resumed").
 */
export async function uploadTikTokChunks(url: string, a: UploadArgs): Promise<void> {
  const total = a.reader.size, sleep = a.sleep ?? wait;
  if (!(total > 0)) throw new UploadError("The video file is empty.", false);
  const ranges = tiktokChunkRanges(total, a.chunkSize);
  for (let i = 0; i < ranges.length; i++) {
    const { start, end } = ranges[i], last = i === ranges.length - 1;
    if (a.signal.aborted) throw cancelled();
    const body = readChunk(a.reader, start, end - start);
    const res = await putTikTokChunk(url, { headers: { "Content-Type": a.mimeType, "Content-Range": `bytes ${start}-${end - 1}/${total}` }, body }, a, sleep);
    const s = res.status;
    if (s === 200 || s === 201) { if (!last) throw again("TikTok ended the upload early."); }
    else if (s === 206) { if (last) throw again("TikTok did not confirm the upload."); }
    else if (s === 403) throw again("The TikTok upload link expired.");
    // On the last chunk a 416 usually means a retry of a chunk TikTok already has: the video may well be there.
    else if (s === 416) throw last ? new UploadError("TikTok may already have this video — check your TikTok inbox before posting again.", false) : again("TikTok lost track of the upload.");
    else if (s >= 400) throw new UploadError(await platformText(res, `Upload failed (${s}).`), false);
    else throw again("TikTok sent an unexpected reply.");
    a.onProgress(end / total);
  }
}

const META_UPLOAD_HOST = "rupload.facebook.com";
/** Exactly `https://rupload.facebook.com/` followed by printable ASCII other than backslash: no userinfo, port, whitespace or look-alike host. */
const META_UPLOAD_URL = /^https:\/\/rupload\.facebook\.com\/[\x21-\x5b\x5d-\x7e]*$/;
/**
 * The headers carry a long-lived Meta token, so they only ever go to Meta's upload host. Checked twice: a fixed pattern (independent of
 * any parser) and the global `URL` (on Expo SDK 57 the WHATWG implementation installed by Expo's runtime, not React Native's older loose
 * one), which must agree and must not change the string.
 */
function isMetaUploadUrl(url: string): boolean {
  if (typeof url !== "string" || !META_UPLOAD_URL.test(url)) return false;
  try {
    const u = new URL(url);
    return u.protocol === "https:" && u.hostname === META_UPLOAD_HOST && u.port === "" && u.username === "" && u.password === "" && u.href === url;
  } catch { return false; }
}
/**
 * Hides the `Authorization` header's value (the token, with and without its "OAuth " scheme) in text that came back from the network
 * before it is shown. Other header values (offset, file_size) are not secret and stay readable.
 */
function redact(text: string, headers: Record<string, string>): string {
  let out = text;
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() !== "authorization" || typeof v !== "string") continue;
    for (const s of [v, v.replace(/^\S+\s+/, "")]) if (s.length >= 8) out = out.split(s).join("…");
  }
  return out;
}
/** Meta's error text: `error.message`, then a `success: false` reply's `message` / `debug_info.message`, else the raw start of the body. */
function metaText(body: string, fallback: string): string {
  let parsed = false;
  try {
    const j = JSON.parse(body) as { error?: { message?: unknown }; message?: unknown; debug_info?: { message?: unknown } };
    parsed = j !== null && typeof j === "object";
    const m = [j?.error?.message, j?.message, j?.debug_info?.message].find((x) => typeof x === "string" && x);
    if (typeof m === "string") return m;
  } catch { /* not JSON */ }
  // A JSON reply without any message says nothing useful to the user: show the status instead.
  return (parsed ? "" : body.slice(0, 200)) || fallback;
}

/**
 * Meta's `rupload` host: one request carrying the whole file from offset 0, streamed natively from disk. Meta offers resuming from an
 * offset, but a failed upload here is simply restarted from a fresh session ("Post again"), like TikTok. Never logs the headers.
 * Redirects are followed by iOS itself (see `postWholeFile`); a 3xx that does reach us is a failure like any other non-2xx.
 */
export async function uploadMetaWhole(url: string, headers: Record<string, string>, fileUri: string, a: Pick<UploadArgs, "onProgress" | "signal">, post: typeof postWholeFile = postWholeFile): Promise<void> {
  if (!isMetaUploadUrl(url)) throw new UploadError("Unexpected upload address.", false);
  if (a.signal.aborted) throw cancelled();
  let res: Awaited<ReturnType<typeof postWholeFile>>;
  try {
    res = await post(url, fileUri, headers, a.onProgress, a.signal);
  } catch {
    if (a.signal.aborted) throw cancelled();
    throw new UploadError("The connection dropped. Post again to restart the upload.", false);
  }
  const body = typeof res.body === "string" ? res.body : "";
  const fail = () => new UploadError(redact(metaText(body, `Upload failed (${res.status}).`), headers), false);
  if (!(res.status >= 200 && res.status < 300)) throw fail();
  let success: unknown;
  try { success = (JSON.parse(body) as { success?: unknown })?.success; } catch { /* a 2xx without JSON counts as accepted */ }
  if (success === false) throw fail();
  a.onProgress(1);
}
