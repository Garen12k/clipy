import { Directory, File, Paths } from "expo-file-system";
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
  // The phone's move with `overwrite` REMOVES the destination first and never asks whether the source is there
  // (FileSystemPath.swift, `move`): a move with nothing to put in place is refused here, before the phone hears of it.
  async move(from, to) {
    const source = new File(from);
    if (!source.exists) throw new Error(`nothing to move: ${from}`);
    await source.move(new File(to), { overwrite: true });
  },
  async remove(p) {
    const d = new Directory(p);
    if (d.exists) { d.delete(); return; }
    const f = new File(p);
    if (f.exists) f.delete();
  },
  async list(dir) { const d = new Directory(dir); return d.exists ? d.list().map((e) => e.name) : []; },
  async freeBytes() { return Paths.availableDiskSpace; },
};
