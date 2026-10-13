import type { ChunkReader } from "@/src/publish/fileReader";
import type { ChunkWriter } from "./fileWriter";

export interface FsAdapter {
  documentDir: string;
  cacheDir: string;
  exists(path: string): Promise<boolean>;
  mkdir(path: string): Promise<void>;
  readText(path: string): Promise<string>;
  writeText(path: string, text: string): Promise<void>;
  copy(from: string, to: string): Promise<void>;
  move(from: string, to: string): Promise<void>;
  remove(path: string): Promise<void>;
  list(dir: string): Promise<string[]>;
  freeBytes(): Promise<number>;
  /** The file's length in bytes; null when there is no such file. */
  size(path: string): Promise<number | null>;
  /** Renames a whole folder. `to` must not exist yet (its parent must). */
  moveDir(from: string, to: string): Promise<void>;
  /** Byte access in chunks — never a whole file in memory. A writer makes its file (and its folder), empty, at once. */
  openReader(path: string): ChunkReader;
  openWriter(path: string): ChunkWriter;
}

const norm = (p: string) => p.replace(/\/+$/, "");

/**
 * In-memory adapter for tests. Files keyed by full path; directories tracked separately. Its files are strings, so byte access
 * (`size`, `openReader`, `openWriter`) sees ONE BYTE PER CHARACTER: give it ASCII (or characters up to U+00FF) in tests.
 */
export function memoryFs(): FsAdapter & { files: Map<string, string>; dirs: Set<string> } {
  const files = new Map<string, string>();
  const dirs = new Set<string>();
  const inDir = (dir: string, p: string) => p.startsWith(norm(dir) + "/");
  const childName = (dir: string, p: string) => p.slice(norm(dir).length + 1).split("/")[0];
  const copy = async (from: string, to: string) => {
    const t = files.get(norm(from));
    if (t === undefined) throw new Error(`ENOENT ${from}`);
    files.set(norm(to), t);
  };
  return {
    files, dirs,
    documentDir: "file:///doc/", cacheDir: "file:///cache/",
    async exists(p) { const n = norm(p); return files.has(n) || dirs.has(n) || [...files.keys()].some((f) => inDir(n, f)); },
    async mkdir(p) { dirs.add(norm(p)); },
    async readText(p) { const t = files.get(norm(p)); if (t === undefined) throw new Error(`ENOENT ${p}`); return t; },
    async writeText(p, text) { files.set(norm(p), text); },
    copy,
    async move(from, to) { await copy(from, to); files.delete(norm(from)); },
    async remove(p) {
      const n = norm(p); files.delete(n); dirs.delete(n);
      for (const f of [...files.keys()]) if (inDir(n, f)) files.delete(f);
      for (const d of [...dirs]) if (inDir(n, d)) dirs.delete(d);
    },
    async list(dir) {
      const names = new Set<string>();
      for (const f of files.keys()) if (inDir(dir, f)) names.add(childName(dir, f));
      for (const d of dirs) if (inDir(dir, d)) names.add(childName(dir, d));
      return [...names];
    },
    async freeBytes() { return 10 * 1024 ** 3; },
    async size(p) { const t = files.get(norm(p)); return t === undefined ? null : t.length; },
    async moveDir(from, to) {
      const a = norm(from), b = norm(to);
      for (const f of [...files.keys()]) if (inDir(a, f)) { files.set(b + f.slice(a.length), files.get(f)!); files.delete(f); }
      for (const d of [...dirs]) if (d === a || inDir(a, d)) { dirs.add(b + d.slice(a.length)); dirs.delete(d); }
    },
    openReader(p) {
      const t = files.get(norm(p));
      if (t === undefined) throw new Error(`ENOENT ${p}`);
      return { size: t.length, read: (offset, length) => Uint8Array.from(t.slice(offset, offset + length), (c) => c.charCodeAt(0) & 255), close() {} };
    },
    openWriter(p) {
      const n = norm(p);
      files.set(n, "");
      return { write(bytes) { files.set(n, (files.get(n) ?? "") + Array.from(bytes, (c) => String.fromCharCode(c)).join("")); }, close() {} };
    },
  };
}
