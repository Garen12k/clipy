import type { ChunkReader } from "@/src/publish/fileReader";
import type { ChunkWriter } from "./fileWriter";

/**
 * A Clipy project file (`.clipy`), format version 1 — one project in one file. Pure: no Expo, no React, no file system; bytes
 * come and go through ChunkReader / ChunkWriter in chunks, so a file of any size is never in memory. All integers little-endian:
 *   0   8  "CLIPYPRJ"        8  4  format version (1)        12  4  header length H (2 … maxHeader)
 *   16  H  the header: JSON in ASCII (every character above U+007F as \uXXXX)
 *   …      the files' bytes, in the header's order, nothing between them
 *   end−16  8  "CLIPYEND"    end−8  8  the whole file's length (uint64: low word, high word)
 * The uint64 is two uint32 words because a JavaScript number is exact only to 2^53 − 1: a file is written, and read as good, only
 * when its length is a safe integer (the sizes are added as numbers and the sum checked), so the high word is at most 2^21 − 1.
 * Spec: docs/superpowers/specs/2026-10-13-project-backup-design.md §2.
 */
export const PROJECT_FILE = { magic: "CLIPYPRJ", end: "CLIPYEND", version: 1, prelude: 16, trailer: 16, maxHeader: 8 * 1024 * 1024, maxFiles: 10000,
  /** Bytes copied between two turns of the event loop: to be tuned on a phone. */ chunk: 2 * 1024 * 1024,
  /** Free space asked for on top of what will be written. */ spare: 100 * 1024 * 1024, ext: "clipy" } as const;

export type FileEntry = { path: string; size: number };
export type FileHeader = { app: "clipy"; schemaVersion: number; savedAt: string; name: string; project: Record<string, unknown>; files: FileEntry[] };
export type FileErrorCode = "notClipy" | "damaged" | "newer" | "space" | "cancelled";
/** What the screen has a sentence for. `need` / `free` are bytes, set for `space`. Any other Error is "something went wrong". */
export class ProjectFileError extends Error {
  code: FileErrorCode; need: number; free: number;
  constructor(code: FileErrorCode, need = 0, free = 0) { super(`project file: ${code}`); this.name = "ProjectFileError"; this.code = code; this.need = need; this.free = free; }
}
/** One save or one open: `cancelled` is read before every chunk; `onProgress` gets the body bytes copied so far. */
export interface FileRun { cancelled: boolean; onStart?: (info: { name: string; bytes: number }) => void; onProgress?: (done: number) => void }
export type Pause = () => Promise<void>;
/** A real turn of the event loop — a touch on Cancel and a redraw get through. (A resolved promise would not let them.) */
export const nextTurn: Pause = () => new Promise((r) => setTimeout(r, 0));

const TWO32 = 2 ** 32;
const u32 = (n: number): Uint8Array => { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, n >>> 0, true); return b; };
const getU32 = (b: Uint8Array, at: number): number => new DataView(b.buffer, b.byteOffset, b.byteLength).getUint32(at, true);
const ascii = (s: string): Uint8Array => Uint8Array.from(s, (c) => c.charCodeAt(0));
const isAscii = (b: Uint8Array, at: number, s: string): boolean => { for (let i = 0; i < s.length; i++) if (b[at + i] !== s.charCodeAt(i)) return false; return true; };
const join = (...parts: Uint8Array[]): Uint8Array => { const out = new Uint8Array(parts.reduce((n, p) => n + p.byteLength, 0)); let at = 0; for (const p of parts) { out.set(p, at); at += p.byteLength; } return out; };
const isRec = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** One path component that can only be a file inside the folder it is put in. */
export function isSafeName(name: unknown): name is string {
  return typeof name === "string" && name.length >= 1 && name.length <= 255 && name !== "." && name !== ".." && !/[\/\\\u0000-\u001f\u007f]/.test(name);
}
/** The only two places a file of a project file may go: the thumbnail, or one file in media/. */
export const isEntryPath = (path: unknown): path is string => path === "thumb.jpg" || (typeof path === "string" && path.startsWith("media/") && isSafeName(path.slice(6)));
/** The last path component of a reference ("" when there is none). */
export const baseName = (uri: unknown): string => String(uri ?? "").split("/").pop() ?? "";

/** The project's name as a file name: nothing a file system or a share sheet trips over, at most 80 characters, never empty. */
export function fileNameFor(name: string): string {
  const clean = Array.from(String(name).replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().replace(/^\.+/, "")).slice(0, 80).join("").trim();
  return `${clean || "Clipy project"}.${PROJECT_FILE.ext}`;
}
/** `name` if no project has it, else "name copy", "name copy 2", … (Duplicate's word). */
export function freeName(name: string, taken: readonly string[]): string {
  if (!taken.includes(name)) return name;
  for (let n = 1; ; n++) { const next = n === 1 ? `${name} copy` : `${name} copy ${n}`; if (!taken.includes(next)) return next; }
}

export function encodeHeader(header: FileHeader): Uint8Array {
  const text = JSON.stringify(header).replace(/[\u0080-\uffff]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`);
  if (text.length > PROJECT_FILE.maxHeader) throw new Error("project file: header too large");
  return ascii(text);
}
export const totalBytes = (headerLength: number, files: readonly FileEntry[]): number =>
  PROJECT_FILE.prelude + headerLength + files.reduce((n, f) => n + f.size, 0) + PROJECT_FILE.trailer;

/**
 * What a file system may call one name: iOS's APFS takes two spellings of the same letters (composed / decomposed) for one file
 * on every phone, and upper / lower case for one file on a case-insensitive volume (the simulator's). Two entries with one key
 * would be written over each other on the way out, so such a header is refused — and never written (writeProjectFile).
 */
const nameKey = (path: string): string => path.normalize("NFC").toLowerCase();
function isHeader(v: unknown): v is FileHeader {
  if (!isRec(v) || v.app !== "clipy" || !Number.isInteger(v.schemaVersion) || (v.schemaVersion as number) < 1 || !isRec(v.project) || !Array.isArray(v.files) || v.files.length > PROJECT_FILE.maxFiles) return false;
  const seen = new Set<string>();
  for (const f of v.files) {
    if (!isRec(f) || !isEntryPath(f.path) || !Number.isSafeInteger(f.size) || (f.size as number) < 0 || seen.has(nameKey(f.path))) return false;
    seen.add(nameKey(f.path));
  }
  return true;
}
function readAll(src: ChunkReader, offset: number, length: number): Uint8Array {
  const out = new Uint8Array(length);
  let got = 0;
  while (got < length) {
    const part = src.read(offset + got, length - got);
    if (part.byteLength === 0 || part.byteLength > length - got) throw new ProjectFileError("damaged");
    out.set(part, got); got += part.byteLength;
  }
  return out;
}

/**
 * The header of a project file, after the whole file has been proved complete — its first 16 bytes, its header and its last 16
 * bytes are read, nothing else. Throws ProjectFileError: `notClipy` (too short for a prelude, or another magic), `newer` (a
 * later format version), `damaged` (everything else). The app's own schema check is the caller's (storage.restoreProject).
 */
export function readHeader(src: ChunkReader): { header: FileHeader; bodyStart: number } {
  const damaged = () => new ProjectFileError("damaged");
  const size = src.size, P = PROJECT_FILE.prelude, T = PROJECT_FILE.trailer;
  if (!(size >= P)) throw new ProjectFileError("notClipy");
  let pre: Uint8Array;
  try { pre = readAll(src, 0, P); } catch { throw new ProjectFileError("notClipy"); }
  if (!isAscii(pre, 0, PROJECT_FILE.magic)) throw new ProjectFileError("notClipy");
  const version = getU32(pre, 8), length = getU32(pre, 12);
  if (version > PROJECT_FILE.version) throw new ProjectFileError("newer");
  if (version < 1 || length < 2 || length > PROJECT_FILE.maxHeader || size < P + length + T) throw damaged();
  const head = readAll(src, P, length);
  let text = "";
  for (let i = 0; i < head.byteLength; i += 8192) {
    const part = head.subarray(i, i + 8192);
    for (let j = 0; j < part.byteLength; j++) if (part[j] > 127) throw damaged();
    text += String.fromCharCode.apply(null, part as unknown as number[]);
  }
  let header: unknown;
  try { header = JSON.parse(text); } catch { throw damaged(); }
  if (!isHeader(header)) throw damaged();
  const total = totalBytes(length, header.files);
  if (!Number.isSafeInteger(total) || size !== total) throw damaged();
  const tail = readAll(src, size - T, T);
  if (!isAscii(tail, 0, PROJECT_FILE.end) || getU32(tail, 8) + getU32(tail, 12) * TWO32 !== size) throw damaged();
  return { header: { ...header, name: typeof header.name === "string" ? header.name : "", savedAt: typeof header.savedAt === "string" ? header.savedAt : "" }, bodyStart: P + length };
}

/** `length` bytes from `offset` of `src` into `out`, a chunk at a time with a pause after each. Returns the new count of bytes done. */
export async function copyBytes(src: ChunkReader, offset: number, length: number, out: ChunkWriter, run: FileRun, pause: Pause, done: number): Promise<number> {
  let at = offset, left = length;
  while (left > 0) {
    if (run.cancelled) throw new ProjectFileError("cancelled");
    const bytes = src.read(at, Math.min(PROJECT_FILE.chunk, left));
    if (bytes.byteLength === 0 || bytes.byteLength > left) throw new Error("project file: short read");
    out.write(bytes);
    at += bytes.byteLength; left -= bytes.byteLength; done += bytes.byteLength;
    run.onProgress?.(done);
    await pause();
  }
  return done;
}

/**
 * Writes a whole project file to `out` (the caller closes it); `open(path)` gives a reader for each listed file. Returns the file's
 * length. A header `readHeader` would refuse (an unsafe or repeated path, a size that is not a whole number, a length past what a
 * number holds) throws a plain Error BEFORE the first byte is written: a copy that could not be opened again is never made.
 */
export async function writeProjectFile(out: ChunkWriter, header: FileHeader, open: (path: string) => ChunkReader, run: FileRun, pause: Pause = nextTurn): Promise<number> {
  const head = encodeHeader(header);
  const total = totalBytes(head.byteLength, header.files);
  if (!isHeader(header) || !Number.isSafeInteger(total)) throw new Error("project file: a header that could not be read back");
  out.write(join(ascii(PROJECT_FILE.magic), u32(PROJECT_FILE.version), u32(head.byteLength)));
  out.write(head);
  let done = 0;
  for (const f of header.files) {
    const src = open(f.path);
    try {
      if (src.size !== f.size) throw new Error(`project file: ${f.path} changed size`);
      done = await copyBytes(src, 0, f.size, out, run, pause, done);
    } finally { src.close(); }
  }
  if (run.cancelled) throw new ProjectFileError("cancelled");
  out.write(join(ascii(PROJECT_FILE.end), u32(total % TWO32), u32(Math.floor(total / TWO32))));
  return total;
}

/** Every listed file out of a project file whose header `readHeader` accepted; `open(path)` gives a writer for each (closed here). */
export async function extractFiles(src: ChunkReader, header: FileHeader, bodyStart: number, open: (path: string) => ChunkWriter, run: FileRun, pause: Pause = nextTurn): Promise<void> {
  let at = bodyStart, done = 0;
  for (const f of header.files) {
    const out = open(f.path);
    try { done = await copyBytes(src, at, f.size, out, run, pause, done); } finally { out.close(); }
    at += f.size;
  }
  if (run.cancelled) throw new ProjectFileError("cancelled");
}
