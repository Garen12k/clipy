import { Directory, File, Paths } from "expo-file-system";
import { openReader } from "@/src/publish/fileReader";
import { openWriter } from "./fileWriter";
import type { FsAdapter } from "./fs";

const withSlash = (uri: string) => (uri.endsWith("/") ? uri : uri + "/");
const dirExists = (uri: string) => { try { return new Directory(uri).exists; } catch { return false; } };

export const expoFs: FsAdapter = {
  documentDir: withSlash(Paths.document.uri),
  cacheDir: withSlash(Paths.cache.uri),
  async exists(p) { return new File(p).exists || dirExists(p); },
  async mkdir(p) { const d = new Directory(p); if (!d.exists) d.create({ intermediates: true, idempotent: true }); },
  async readText(p) { return await new File(p).text(); },
  async writeText(p, text) {
    const f = new File(p);
    const parent = f.parentDirectory;
    if (!parent.exists) parent.create({ intermediates: true, idempotent: true });
    if (!f.exists) f.create({ intermediates: true, overwrite: true });
    f.write(text);
  },
  async copy(from, to) { await new File(from).copy(new File(to), { overwrite: true }); },
  async move(from, to) { await new File(from).move(new File(to), { overwrite: true }); },
  async remove(p) {
    const d = new Directory(p);
    if (d.exists) { d.delete(); return; }
    const f = new File(p);
    if (f.exists) f.delete();
  },
  async list(dir) { const d = new Directory(dir); return d.exists ? d.list().map((e) => e.name) : []; },
  async freeBytes() { return Paths.availableDiskSpace; },
  async size(p) { const f = new File(p); return f.exists ? f.size : null; },
  // A destination folder that does not exist yet becomes the moved folder (expo-file-system: getMoveOrCopyPath) — a rename.
  // Its parent must exist: the move makes no folders.
  async moveDir(from, to) { await new Directory(from).move(new Directory(to)); },
  openReader,
  openWriter,
};
