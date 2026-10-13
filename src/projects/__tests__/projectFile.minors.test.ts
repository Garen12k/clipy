import type { ChunkReader } from "@/src/publish/fileReader";
import type { ChunkWriter } from "../fileWriter";
import { memoryFs } from "../fs";
import { ProjectFileError, extractFiles, fileNameFor, isEntryPath, isSafeName, readHeader, writeProjectFile, type FileHeader, type FileRun } from "../projectFile";
import { makeStorage, type PickedAsset } from "../storage";

// The review's minor findings (task 5), each pinned where it was fixed.
const now = async () => {};
const go = (): FileRun => ({ cancelled: false });
const mem = (b: Uint8Array): ChunkReader => ({ size: b.byteLength, read: (o, l) => b.slice(o, o + l), close() {} });
function sink() { const parts: number[] = []; const w: ChunkWriter = { write: (b) => { parts.push(...b); }, close() {} }; return { w, all: () => Uint8Array.from(parts) }; }
const header = (files: FileHeader["files"]): FileHeader => ({ app: "clipy", schemaVersion: 1, savedAt: "", name: "A", project: {}, files });
const utf8Bytes = (s: string) => unescape(encodeURIComponent(s)).length;

test("m2: a name a file:// uri would read as something else (%, #, ?) is not a safe name, and a file that lists one is damaged", async () => {
  for (const name of ["a#1.mov", "%2e%2e", "x%2F..", "a?b.mov", "100%.mov"]) { expect(isSafeName(name)).toBe(false); expect(isEntryPath(`media/${name}`)).toBe(false); }
  for (const name of ["3f2a-9c.mov", "speech-a1-b2.caf", "رحلة.mov", "a b.mov"]) expect(isSafeName(name)).toBe(true);
  // The writer refuses to make such a file, so one is built by hand from a good one: same length of name, one character changed.
  const out = sink();
  await writeProjectFile(out.w, header([{ path: "media/a_1.mov", size: 0 }]), () => mem(new Uint8Array(0)), go(), now);
  const file = out.all();
  const at = String.fromCharCode(...file).indexOf("a_1.mov");
  file[at + 1] = "#".charCodeAt(0);
  expect(() => readHeader(mem(file))).toThrow(ProjectFileError);
  try { readHeader(mem(file)); } catch (e) { expect((e as ProjectFileError).code).toBe("damaged"); }
});

test("m6: the file's name fits a file system's 255 bytes whatever the letters, and a lone surrogate never reaches it", () => {
  const emoji = fileNameFor("🏖".repeat(100));
  expect(utf8Bytes(emoji)).toBeLessThanOrEqual(255);
  expect(emoji).toBe(`${"🏖".repeat(50)}.clipy`);
  expect(utf8Bytes(fileNameFor("رحلة".repeat(40)))).toBeLessThanOrEqual(255);
  expect(fileNameFor("a".repeat(100))).toBe(`${"a".repeat(80)}.clipy`);          // still at most 80 characters
  const lone = fileNameFor("Beach \ud83c trip \udfd6");
  expect(lone).toBe("Beach trip.clipy");
  expect(() => encodeURIComponent(lone)).not.toThrow();
  expect(fileNameFor("\ud83c")).toBe("Clipy project.clipy");
  expect(fileNameFor("Beach 🏖")).toBe("Beach 🏖.clipy");                        // a whole pair stays
});

test("m8: a file with no bytes takes a turn of its own, and a cancel is heard between such files", async () => {
  const files = Array.from({ length: 5 }, (_, i) => ({ path: `media/e${i}.mov`, size: 0 }));
  const out = sink();
  await writeProjectFile(out.w, header(files), () => mem(new Uint8Array(0)), go(), now);
  const { header: back, bodyStart } = readHeader(mem(out.all()));
  let turns = 0;
  await extractFiles(mem(out.all()), back, bodyStart, () => sink().w, go(), async () => { turns++; });
  expect(turns).toBe(5);
  const run: FileRun = { cancelled: false };
  const opened: string[] = [];
  await expect(extractFiles(mem(out.all()), back, bodyStart, (p) => { opened.push(p); return sink().w; }, run, async () => { run.cancelled = true; })).rejects.toMatchObject({ code: "cancelled" });
  expect(opened).toEqual(["media/e0.mov"]);
});

describe("m5: a phone that does not say how much room is free", () => {
  const asset = (uri: string): PickedAsset => ({ uri, kind: "video", durationSec: 4, width: 1080, height: 1920, fileName: "clip.mov" });
  async function setup() {
    const fs = memoryFs();
    let n = 0;
    const storage = makeStorage(fs, { thumbnail: async () => { fs.files.set("file:///tmp/t.jpg", "JPEG"); return "file:///tmp/t.jpg"; }, newId: () => `id${++n}`, nowIso: () => "2026-10-13T10:00:00.000Z" });
    fs.files.set("file:///picked/a.mov", "AAAA");
    await storage.createProject("Beach", [asset("file:///picked/a.mov")]);
    return { fs, storage };
  }
  test.each([null, undefined, NaN])("free space %p is unknown, not zero: the copy is saved and opens", async (free) => {
    const s = await setup();
    s.fs.freeBytes = async () => free as unknown as number;
    const made = await s.storage.packProject("id1", go(), now);
    await s.fs.copy(made.uri, "file:///picked/Beach.clipy");
    const back = await s.storage.restoreProject("file:///picked/Beach.clipy", go(), now);
    expect((await s.storage.listProjects()).map((p) => p.id)).toContain(back.id);
  });
});
