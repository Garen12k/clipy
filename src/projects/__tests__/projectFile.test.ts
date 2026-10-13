import type { ChunkReader } from "@/src/publish/fileReader";
import type { ChunkWriter } from "../fileWriter";
import { PROJECT_FILE, ProjectFileError, encodeHeader, extractFiles, fileNameFor, freeName, isEntryPath, readHeader, totalBytes, writeProjectFile, type FileHeader } from "../projectFile";

const now = async () => {};
const bytes = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0));
const mem = (b: Uint8Array): ChunkReader => ({ size: b.byteLength, read: (o, n) => b.slice(o, o + n), close() {} });
const sink = () => {
  const parts: Uint8Array[] = [];
  const w: ChunkWriter = { write: (b) => { parts.push(b.slice()); }, close() {} };
  const all = () => { const out = new Uint8Array(parts.reduce((n, p) => n + p.byteLength, 0)); let at = 0; for (const p of parts) { out.set(p, at); at += p.byteLength; } return out; };
  return { w, all };
};
const FILES: Record<string, Uint8Array> = { "media/a.mov": bytes("AAAAAAAAAA"), "media/empty.m4a": new Uint8Array(0), "thumb.jpg": bytes("JPEG") };
const header = (): FileHeader => ({ app: "clipy", schemaVersion: 21, savedAt: "2026-10-13T10:00:00.000Z", name: "رحلة 🏖 Beach",
  project: { id: "p", name: "رحلة 🏖 Beach", clips: [] }, files: Object.entries(FILES).map(([path, b]) => ({ path, size: b.byteLength })) });
const pack = async (h = header()) => { const s = sink(); const total = await writeProjectFile(s.w, h, (p) => mem(FILES[p]), { cancelled: false }, now); return { file: s.all(), total }; };
const code = (fn: () => unknown) => { try { fn(); return "ok"; } catch (e) { return e instanceof ProjectFileError ? e.code : `other: ${String(e)}`; } };
const u32 = (n: number) => { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, n, true); return b; };
/** A file with a right prelude and trailer around any header bytes, and no body. */
const around = (head: Uint8Array) => { const s = sink(); for (const p of [bytes("CLIPYPRJ"), u32(1), u32(head.byteLength), head, bytes("CLIPYEND"), u32(32 + head.byteLength), u32(0)]) s.w.write(p); return mem(s.all()); };

test("the layout: magic, version 1, header length, an ASCII header, the bytes, the end magic and the file's own length", async () => {
  const { file, total } = await pack();
  const H = encodeHeader(header()).byteLength;
  expect(file.byteLength).toBe(total);
  expect(total).toBe(16 + H + 14 + 16);
  expect(total).toBe(totalBytes(H, header().files));
  expect(String.fromCharCode(...file.slice(0, 8))).toBe("CLIPYPRJ");
  expect([...file.slice(8, 16)]).toEqual([1, 0, 0, 0, ...u32(H)]);
  expect(file.slice(16, 16 + H).every((b) => b < 128)).toBe(true);
  expect(String.fromCharCode(...file.slice(16 + H, 16 + H + 14))).toBe("AAAAAAAAAAJPEG");
  expect(String.fromCharCode(...file.slice(total - 16, total - 8))).toBe("CLIPYEND");
  expect([...file.slice(total - 8)]).toEqual([...u32(total), 0, 0, 0, 0]);
});

test("round trip: the header (Arabic and emoji included) and every file come back byte for byte; progress only grows and ends at the sum", async () => {
  const { file } = await pack();
  const { header: back, bodyStart } = readHeader(mem(file));
  expect(back).toEqual(header());
  const got: Record<string, ReturnType<typeof sink>> = {};
  const seen: number[] = [];
  await extractFiles(mem(file), back, bodyStart, (p) => (got[p] = sink()).w, { cancelled: false, onProgress: (d) => seen.push(d) }, now);
  for (const [p, b] of Object.entries(FILES)) expect([...got[p].all()]).toEqual([...b]);
  expect(seen).toEqual([10, 14]);
});

test("cut off at ANY length it is never read as good: under 16 bytes it is not a Clipy file, from 16 on it is damaged", async () => {
  const { file, total } = await pack();
  for (let n = 0; n < 16; n++) expect(code(() => readHeader(mem(file.slice(0, n))))).toBe("notClipy");
  for (let n = 16; n < total; n++) expect(code(() => readHeader(mem(file.slice(0, n))))).toBe("damaged");
  const longer = new Uint8Array(total + 1); longer.set(file);
  expect(code(() => readHeader(mem(longer)))).toBe("damaged");
});

test("what a reader says: another file, a newer format, a damaged one", async () => {
  const { file, total } = await pack();
  const edit = (at: number, v: number) => { const b = file.slice(); b[at] = v; return mem(b); };
  expect(code(() => readHeader(mem(bytes("ID3 this is a song, not a project at all"))))).toBe("notClipy");
  expect(code(() => readHeader(edit(0, 88)))).toBe("notClipy");
  expect(code(() => readHeader(edit(8, 2)))).toBe("newer");
  expect(code(() => readHeader(edit(8, 0)))).toBe("damaged");
  expect(code(() => readHeader(edit(20, 200)))).toBe("damaged");             // a byte above 127 in the header
  expect(code(() => readHeader(edit(total - 16, 88)))).toBe("damaged");      // the end magic
  expect(code(() => readHeader(edit(total - 1, 1)))).toBe("damaged");        // the length in the trailer
  expect(code(() => readHeader(around(bytes("{not json"))))).toBe("damaged");
  expect(code(() => readHeader(around(bytes('{"app":"other","schemaVersion":21,"project":{},"files":[]}'))))).toBe("damaged");
  expect(code(() => readHeader(around(encodeHeader({ ...header(), files: [] }))))).toBe("ok");
  const tooLong = file.slice(); tooLong.set(u32(PROJECT_FILE.maxHeader + 1), 12);
  expect(code(() => readHeader(mem(tooLong)))).toBe("damaged");
});

test("a file can only name thumb.jpg or media/<one safe name>, once, with a whole size", () => {
  for (const ok of ["thumb.jpg", "media/a.mov", "media/speech-o1-x.caf", "media/رحلة.mov"]) expect(isEntryPath(ok)).toBe(true);
  for (const bad of ["../x", "media/..", "media/.", "media/a/b", "media/", "cover-1.jpg", "media/a\\b", "/media/a", "project.json", 3, null]) expect(isEntryPath(bad)).toBe(false);
  for (const files of [[{ path: "../x", size: 0 }], [{ path: "media/a", size: -1 }], [{ path: "media/a", size: 1.5 }], [{ path: "media/a", size: 0 }, { path: "media/a", size: 0 }]])
    expect(code(() => readHeader(around(encodeHeader({ ...header(), files }))))).toBe("damaged");
});

test("sizes past 4 GiB: every byte is counted and the trailer's high word is set — nothing is held in memory", async () => {
  const zero = new Uint8Array(PROJECT_FILE.chunk);
  const big = 5 * 1024 ** 3 + 123;
  const fake: ChunkReader = { size: big, read: (_o, n) => (n === zero.byteLength ? zero : new Uint8Array(n)), close() {} };
  let count = 0, last = 0, largest = 0, tail = new Uint8Array(0);
  const counter: ChunkWriter = { write: (b) => { count += b.byteLength; largest = Math.max(largest, b.byteLength); if (b.byteLength === 16) tail = b.slice(); }, close() {} };
  const h: FileHeader = { ...header(), files: [{ path: "media/big.mov", size: big }] };
  const total = await writeProjectFile(counter, h, () => fake, { cancelled: false, onProgress: (d) => { expect(d).toBeGreaterThan(last); last = d; } }, now);
  expect(count).toBe(total);
  expect(last).toBe(big);
  expect(largest).toBe(PROJECT_FILE.chunk);
  const dv = new DataView(tail.buffer);
  expect(dv.getUint32(12, true)).toBe(1);
  expect(dv.getUint32(8, true) + dv.getUint32(12, true) * 2 ** 32).toBe(total);
});

test("cancel stops between chunks; a short read and a file that changed size are failures, not a good file", async () => {
  const run = { cancelled: false, onProgress: (d: number) => { if (d >= 10) run.cancelled = true; } };
  const s = sink();
  await expect(writeProjectFile(s.w, header(), (p) => mem(FILES[p]), run, now)).rejects.toMatchObject({ code: "cancelled" });
  expect(code(() => readHeader(mem(s.all())))).toBe("damaged");   // what was written so far has no trailer
  await expect(writeProjectFile(sink().w, header(), (p) => ({ size: FILES[p].byteLength, read: () => new Uint8Array(0), close() {} }), { cancelled: false }, now)).rejects.toThrow(/short read/);
  await expect(writeProjectFile(sink().w, header(), (p) => mem(FILES[p].slice(1)), { cancelled: false }, now)).rejects.toThrow(/changed size/);
  const { file } = await pack();
  const { header: back, bodyStart } = readHeader(mem(file));
  const stop = { cancelled: true };
  await expect(extractFiles(mem(file), back, bodyStart, () => sink().w, stop, now)).rejects.toMatchObject({ code: "cancelled" });
});

test("every reader and writer that was opened is closed, also when the copy fails", async () => {
  const closed: string[] = [];
  const open = (p: string): ChunkReader => ({ ...mem(p === "thumb.jpg" ? FILES[p].slice(1) : FILES[p]), close: () => { closed.push(p); } });
  await expect(writeProjectFile(sink().w, header(), open, { cancelled: false }, now)).rejects.toThrow();
  expect(closed).toEqual(["media/a.mov", "media/empty.m4a", "thumb.jpg"]);
});

test("the pause runs after every chunk (the screen's turn)", async () => {
  let turns = 0;
  await writeProjectFile(sink().w, header(), (p) => mem(FILES[p]), { cancelled: false }, async () => { turns++; });
  expect(turns).toBe(2);   // one chunk for each file that has bytes
});

test("the file's name and a free project name", () => {
  expect(fileNameFor("Beach trip")).toBe("Beach trip.clipy");
  expect(fileNameFor(' ..a/b:c*?"<>|  d ')).toBe("a b c d.clipy");
  expect(fileNameFor("///")).toBe("Clipy project.clipy");
  expect(fileNameFor("رحلة")).toBe("رحلة.clipy");
  expect(fileNameFor("🏖".repeat(100))).toBe(`${"🏖".repeat(50)}.clipy`);   // 200 bytes: a name of 80 emoji is 320, more than a file's name may be (review m6)
  expect(freeName("A", [])).toBe("A");
  expect(freeName("A", ["A"])).toBe("A copy");
  expect(freeName("A", ["A", "A copy", "A copy 2"])).toBe("A copy 3");
});

// ── beyond the plan's cases: decisions of the implementer (see the report) ──────────────────────────────────────────────────────

test("two names that one file system would call the same file (case, or the same letters composed differently) are refused", () => {
  const twice = (a: string, b: string): FileHeader => ({ ...header(), files: [{ path: a, size: 0 }, { path: b, size: 0 }] });
  for (const [a, b] of [["media/A.mov", "media/a.mov"], ["media/café.mov", "media/café.mov"], ["media/É.mov", "media/é.mov"]])
    expect(code(() => readHeader(around(encodeHeader(twice(a, b)))))).toBe("damaged");
  expect(code(() => readHeader(around(encodeHeader(twice("media/a.mov", "media/a.mp4")))))).toBe("ok");
});

test("a header the reader would refuse is never written: nothing reaches the file and no source is opened", async () => {
  const bad: FileHeader[] = [
    { ...header(), files: [{ path: "../x", size: 0 }] },
    { ...header(), files: [{ path: "media/a", size: 1.5 }] },
    { ...header(), files: [{ path: "media/A.mov", size: 0 }, { path: "media/a.mov", size: 0 }] },
    { ...header(), files: [{ path: "media/a", size: Number.MAX_SAFE_INTEGER }, { path: "media/b", size: Number.MAX_SAFE_INTEGER }] },
  ];
  for (const h of bad) {
    const s = sink(); let opened = 0;
    await expect(writeProjectFile(s.w, h, () => { opened++; return mem(new Uint8Array(0)); }, { cancelled: false }, now)).rejects.toThrow(/project file: /);
    expect(s.all().byteLength).toBe(0);
    expect(opened).toBe(0);
  }
});

test("a file past 4 GiB is read back from its two ends alone; a wrong high word, or a length no number can hold, is damaged", async () => {
  const big = 5 * 1024 ** 3 + 123;
  const zero = new Uint8Array(PROJECT_FILE.chunk);
  const h: FileHeader = { ...header(), files: [{ path: "media/big.mov", size: big }] };
  const kept: Uint8Array[] = [];
  const total = await writeProjectFile({ write: (b) => { if (b !== zero) kept.push(b.slice()); }, close() {} }, h,
    () => ({ size: big, read: (_o, n) => (n === zero.byteLength ? zero : new Uint8Array(n)), close() {} }), { cancelled: false }, now);
  const [pre, head, tail] = kept.filter((b) => b.byteLength === 16 || b.byteLength === encodeHeader(h).byteLength);
  const H = head.byteLength;
  const asked: [number, number][] = [];
  const ends = (t: Uint8Array, size = total): ChunkReader => ({ size, close() {}, read: (o, n) => {
    asked.push([o, n]);
    if (o < 16) return pre.slice(o, o + n);
    if (o < 16 + H) return head.slice(o - 16, o - 16 + n);
    if (o >= size - 16) return t.slice(o - (size - 16), o - (size - 16) + n);
    throw new Error("the body was read");
  } });
  const got = readHeader(ends(tail));
  expect(got.header.files).toEqual([{ path: "media/big.mov", size: big }]);
  expect(got.bodyStart).toBe(16 + H);
  expect(asked).toEqual([[0, 16], [16, H], [total - 16, 16]]);
  const high = (v: number) => { const t = tail.slice(); t.set(u32(v), 12); return t; };
  expect(code(() => readHeader(ends(high(0))))).toBe("damaged");
  expect(code(() => readHeader(ends(high(2))))).toBe("damaged");
  expect(code(() => readHeader(ends(high(0xffffffff))))).toBe("damaged");
  // sizes that add up past what a number holds exactly: refused whatever the file's own length claims
  const over: FileHeader = { ...header(), files: [{ path: "media/a", size: Number.MAX_SAFE_INTEGER }, { path: "media/b", size: 2 }] };
  const oh = encodeHeader(over);
  const fake: ChunkReader = { size: 2 ** 53 + 2, close() {}, read: (o, n) => (o < 16 ? join16(oh.byteLength).slice(o, o + n) : oh.slice(o - 16, o - 16 + n)) };
  expect(code(() => readHeader(fake))).toBe("damaged");
});
const join16 = (H: number) => { const b = new Uint8Array(16); b.set(bytes("CLIPYPRJ")); b.set(u32(1), 8); b.set(u32(H), 12); return b; };

test("the header is plain ASCII whatever the names hold, and comes back the same: Arabic, emoji, a lone surrogate, a line separator", () => {
  const name = "رحلة 🏖   \ud800 café \u007f";
  const h: FileHeader = { ...header(), name, project: { name }, files: [{ path: "media/رحلة 🏖.mov", size: 0 }] };
  const enc = encodeHeader(h);
  expect(enc.every((b) => b < 128)).toBe(true);
  expect(readHeader(around(enc)).header).toEqual(h);
});
