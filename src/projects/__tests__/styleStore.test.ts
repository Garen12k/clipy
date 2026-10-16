import { memoryFs } from "../fs";
import { makeStorage } from "../storage";
import { StyleStoreError, cleanName, makeStyleStore } from "../styleStore";
import { STYLES, type StyleDraft } from "../userStyles";

const FILE = "file:///doc/styles/styles.json";
function setup() {
  const fs = memoryFs();
  let n = 0;
  const store = makeStyleStore(fs, { newId: () => `s${++n}`, nowIso: () => "2026-10-16T12:00:00.000Z" });
  fs.files.set("file:///doc/projects/p1/media/m.mp3", "SONG");
  return { fs, store };
}
const draft = (over: Partial<StyleDraft> = {}): StyleDraft => ({ music: null, filter: "vivid", filterIntensity: 0.8, transition: { type: "fade", duration: 0.5 }, title: null, motions: ["zoomIn"], motionStrength: 0.5, ...over });
const own = { kind: "own" as const, sourceUri: "file:///doc/projects/p1/media/m.mp3", title: "mine.mp3", durationSec: 30, beats: [1, 2, 3, 4] };
let warn: jest.SpyInstance;
beforeEach(() => { warn = jest.spyOn(console, "warn").mockImplementation(() => {}); });
afterEach(() => warn.mockRestore());

test("nothing saved yet: no styles, no file made by reading", async () => {
  const { fs, store } = setup();
  expect(await store.list()).toEqual({ status: "ok", styles: [] });
  expect([...fs.files.keys()].filter((k) => k.includes("/styles"))).toEqual([]);
});
test("add: newest first, in <documents>/styles/styles.json (never under projects/), version 1, written through the tmp", async () => {
  const { fs, store } = setup();
  const a = await store.add(draft(), "Summer", "Project 1");
  const b = await store.add(draft({ music: { kind: "bundled", trackId: "party-sector" } }), "Party", "Project 2");
  expect(a).toMatchObject({ id: "s1", name: "Summer", createdAt: "2026-10-16T12:00:00.000Z", filter: "vivid", music: null });
  expect(await store.list()).toEqual({ status: "ok", styles: [b, a] });
  expect(JSON.parse(fs.files.get(FILE)!)).toEqual({ version: 1, styles: [b, a] });
  expect(fs.files.has(`${FILE}.tmp`)).toBe(false);
});
test("own music is COPIED into styles/media under the style's id; the style names the file, never a uri", async () => {
  const { fs, store } = setup();
  const s = await store.add(draft({ music: own }), "Mine", "P");
  expect(s.music).toEqual({ kind: "own", file: "s1.mp3", title: "mine.mp3", durationSec: 30, beats: [1, 2, 3, 4] });
  expect(fs.files.get("file:///doc/styles/media/s1.mp3")).toBe("SONG");
  expect(await store.musicUri(s)).toBe("file:///doc/styles/media/s1.mp3");
  fs.files.delete("file:///doc/projects/p1/media/m.mp3");                       // the source project is deleted
  expect(await store.musicUri(s)).toBe("file:///doc/styles/media/s1.mp3");
});
test("own music whose file is gone: refused as missing, nothing written or copied", async () => {
  const { fs, store } = setup();
  fs.files.delete(own.sourceUri);
  await expect(store.add(draft({ music: own }), "Mine", "P")).rejects.toEqual(new StyleStoreError("missing"));
  expect(fs.files.has(FILE)).toBe(false);
  expect(await fs.list("file:///doc/styles/media")).toEqual([]);
});
test("a write that fails takes the copied music back", async () => {
  const { fs, store } = setup();
  const move = jest.spyOn(fs, "move").mockRejectedValueOnce(new Error("disk"));
  await expect(store.add(draft({ music: own }), "Mine", "P")).rejects.toThrow("disk");
  move.mockRestore();
  expect(await fs.list("file:///doc/styles/media")).toEqual([]);
});
test("at most 20 styles", async () => {
  const { store } = setup();
  for (let i = 0; i < STYLES.max; i++) await store.add(draft(), `S${i}`, "P");
  await expect(store.add(draft(), "One more", "P")).rejects.toEqual(new StyleStoreError("full"));
  const read = await store.list();
  expect(read.status === "ok" && read.styles.length).toBe(20);
});
test("names: trimmed, cut to 40 characters, blank → the fallback; duplicates allowed", () => {
  expect(cleanName("  Summer  ", "P")).toBe("Summer");
  expect(cleanName("é".repeat(50), "P")).toBe("é".repeat(40));
  expect(cleanName("   ", "Project 3")).toBe("Project 3");
  expect(cleanName("", "")).toBe("My style");
});
test("rename and remove; removing takes its music file with it, never anything else", async () => {
  const { fs, store } = setup();
  const a = await store.add(draft({ music: own }), "A", "P");
  const b = await store.add(draft(), "B", "P");
  await store.rename(a.id, "  Beach ");
  await store.rename(b.id, "  ");
  expect(await store.list()).toEqual({ status: "ok", styles: [b, { ...a, name: "Beach" }] });
  await store.remove(a.id);
  expect(await store.list()).toEqual({ status: "ok", styles: [b] });
  expect(fs.files.has("file:///doc/styles/media/s1.mp3")).toBe(false);
  expect(fs.files.get("file:///doc/projects/p1/media/m.mp3")).toBe("SONG");
  await store.remove("nope");
  expect(await store.list()).toEqual({ status: "ok", styles: [b] });
});
test("serial: two adds asked at once both land", async () => {
  const { store } = setup();
  await Promise.all([store.add(draft(), "A", "P"), store.add(draft(), "B", "P")]);
  const read = await store.list();
  expect(read.status === "ok" && read.styles.map((s) => s.name)).toEqual(["B", "A"]);
});
test("a damaged file is KEPT aside, never deleted; the styles start empty and saving works again", async () => {
  const { fs, store } = setup();
  fs.files.set(FILE, "{oops");
  expect(await store.list()).toEqual({ status: "ok", styles: [] });
  expect(fs.files.get("file:///doc/styles/damaged-20261016120000000.json")).toBe("{oops");
  await store.add(draft(), "A", "P");
  expect(JSON.parse(fs.files.get(FILE)!).styles).toHaveLength(1);
});
test("a newer file: nothing shown, nothing written, the file untouched", async () => {
  const { fs, store } = setup();
  const newer = JSON.stringify({ version: 2, styles: [] });
  fs.files.set(FILE, newer);
  expect(await store.list()).toEqual({ status: "newer" });
  await expect(store.add(draft(), "A", "P")).rejects.toEqual(new StyleStoreError("newer"));
  await expect(store.rename("x", "y")).rejects.toEqual(new StyleStoreError("newer"));
  expect(fs.files.get(FILE)).toBe(newer);
});
test("recovery: no styles.json but a tmp that reads → moved into place; a tmp that does not read is left alone", async () => {
  const { fs, store } = setup();
  fs.files.set(`${FILE}.tmp`, JSON.stringify({ version: 1, styles: [{ id: "x", name: "Kept" }] }));
  const read = await store.list();
  expect(read.status === "ok" && read.styles.map((s) => s.name)).toEqual(["Kept"]);
  expect(fs.files.has(`${FILE}.tmp`)).toBe(false);
  expect(fs.files.has(FILE)).toBe(true);
  const other = setup();
  other.fs.files.set(`${FILE}.tmp`, "{cut");
  expect(await other.store.list()).toEqual({ status: "ok", styles: [] });
  expect(other.fs.files.get(`${FILE}.tmp`)).toBe("{cut");
});
test("the first good read of a launch removes music no style names (an add cut off before its write)", async () => {
  const { fs, store } = setup();
  const kept = await store.add(draft({ music: own }), "A", "P");
  fs.files.set("file:///doc/styles/media/orphan.mp3", "X");
  const fresh = makeStyleStore(fs, { newId: () => "z", nowIso: () => "2026-10-16T12:00:00.000Z" });   // the next launch
  await fresh.list();
  expect(await fs.list("file:///doc/styles/media")).toEqual([`${kept.id}.mp3`]);
});

test("overlapping writes on the realistic phone move: every one lands, the file is there after each, never lost", async () => {
  const { fs, store } = setup();
  const a = await store.add(draft(), "A", "P");
  const seen: boolean[] = [];
  const after = <T,>(p: Promise<T>) => p.then((v) => { seen.push(fs.files.has(FILE)); return v; });
  const [, , c] = await Promise.all([after(store.rename(a.id, "A2")), after(store.add(draft(), "B", "P")), after(store.add(draft(), "C", "P")), after(store.list())]);
  expect(seen).toEqual([true, true, true, true]);
  const read = await store.list();
  expect(read.status === "ok" && read.styles.map((s) => s.name)).toEqual(["C", "B", "A2"]);
  expect((c as { id: string }).id).toBe("s3");
  expect(fs.files.has(`${FILE}.tmp`)).toBe(false);
});
test("a failed turn rejects for its caller only; the next turn runs", async () => {
  const { fs, store } = setup();
  await store.add(draft(), "A", "P");
  const move = jest.spyOn(fs, "move").mockRejectedValueOnce(new Error("disk"));
  const [bad, good] = await Promise.allSettled([store.rename("s1", "X"), store.add(draft(), "B", "P")]);
  move.mockRestore();
  expect(bad.status).toBe("rejected");
  expect(good.status).toBe("fulfilled");
  const read = await store.list();
  expect(read.status === "ok" && read.styles.map((s) => s.name)).toEqual(["B", "A"]);
});
test("a song two styles name is removed only with the last of them", async () => {
  const { fs, store } = setup();
  const a = await store.add(draft({ music: own }), "A", "P");
  const raw = JSON.parse(fs.files.get(FILE)!);
  raw.styles.unshift({ ...raw.styles[0], id: "twin", name: "Twin" });
  fs.files.set(FILE, JSON.stringify(raw));
  await store.remove(a.id);
  expect(fs.files.get("file:///doc/styles/media/s1.mp3")).toBe("SONG");
  await store.remove("twin");
  expect(fs.files.has("file:///doc/styles/media/s1.mp3")).toBe(false);
});
test("no sweep after a damaged or newer read: music is kept", async () => {
  for (const text of ["{oops", JSON.stringify({ version: 2, styles: [] })]) {
    const { fs } = setup();
    fs.files.set(FILE, text);
    fs.files.set("file:///doc/styles/media/x.mp3", "X");
    const store = makeStyleStore(fs, { newId: () => "z", nowIso: () => "2026-10-16T12:00:00.000Z" });
    await store.list();
    await store.list();
    expect(fs.files.get("file:///doc/styles/media/x.mp3")).toBe("X");
  }
});
test("a failed write over an existing file keeps the old styles and takes the copy back", async () => {
  const { fs, store } = setup();
  await store.add(draft(), "A", "P");
  const move = jest.spyOn(fs, "move").mockRejectedValueOnce(new Error("disk"));
  await expect(store.add(draft({ music: own }), "B", "P")).rejects.toThrow("disk");
  move.mockRestore();
  expect(await fs.list("file:///doc/styles/media")).toEqual([]);
  const read = await store.list();
  expect(read.status === "ok" && read.styles.map((s) => s.name)).toEqual(["A"]);
});
test("nothing a style does is under projects/ or the cache; the project sweeps never reach styles/", async () => {
  const { fs, store } = setup();
  await store.add(draft({ music: own }), "A", "P");
  const made = [...fs.files.keys()].filter((k) => k !== own.sourceUri);
  expect(made.every((k) => k.startsWith("file:///doc/styles/"))).toBe(true);
  await makeStorage(fs, { thumbnail: async () => "", newId: () => "n", nowIso: () => "2026-10-16T12:00:00.000Z" }).sweepProjectFiles();
  expect(made.every((k) => fs.files.has(k))).toBe(true);
});
test("a newer Clipy's file of ANOTHER shape is newer: no styles shown, writes refused, the file kept exactly, nothing moved aside", async () => {
  const { fs, store } = setup();
  const text = JSON.stringify({ version: 2, styles: { byId: {} } });
  fs.files.set(FILE, text);
  expect(await store.list()).toEqual({ status: "newer" });
  await expect(store.add(draft(), "A", "P")).rejects.toEqual(new StyleStoreError("newer"));
  expect(fs.files.get(FILE)).toBe(text);
  expect([...fs.files.keys()].filter((k) => k.includes("damaged"))).toEqual([]);
});
test("only a newer Clipy's tmp (cut off between its remove and its rename): newer, the tmp kept, writes refused", async () => {
  const { fs, store } = setup();
  const text = JSON.stringify({ version: 2, styles: [] });
  fs.files.set(`${FILE}.tmp`, text);
  expect(await store.list()).toEqual({ status: "newer" });
  await expect(store.add(draft(), "A", "P")).rejects.toEqual(new StyleStoreError("newer"));
  expect(fs.files.get(`${FILE}.tmp`)).toBe(text);
  expect(fs.files.has(FILE)).toBe(false);
});
describe("the realistic failed write: the phone's move removes styles.json, THEN fails", () => {
  /** The fake's own queued move, failing after it removed the destination (the source, the tmp, stays). */
  const failAfterRemove = (fs: ReturnType<typeof memoryFs>) => {
    const real = fs.move.bind(fs);
    return jest.spyOn(fs, "move").mockImplementationOnce((from, to) => real(to, `${to}.gone`).catch(() => {}).then(() => { fs.files.delete(`${to}.gone`); throw new Error("disk"); }));
  };
  test("an add: no style is lost — the tmp (old + new) is the only copy, with its song, and is read back next time", async () => {
    const { fs, store } = setup();
    await store.add(draft(), "A", "P");
    const move = failAfterRemove(fs);
    await expect(store.add(draft({ music: own }), "B", "P")).rejects.toThrow("disk");
    move.mockRestore();
    expect(fs.files.has(FILE)).toBe(false);
    expect(fs.files.has(`${FILE}.tmp`)).toBe(true);
    expect(fs.files.get("file:///doc/styles/media/s2.mp3")).toBe("SONG");
    const next = makeStyleStore(fs, { newId: () => "z", nowIso: () => "2026-10-16T12:00:00.000Z" });   // the next launch
    const read = await next.list();
    expect(read.status === "ok" && read.styles.map((s) => s.name)).toEqual(["B", "A"]);
    expect(fs.files.has(FILE)).toBe(true);
    expect(fs.files.has(`${FILE}.tmp`)).toBe(false);
    expect(fs.files.get("file:///doc/styles/media/s2.mp3")).toBe("SONG");
  });
  test("a rename: the styles are not lost; the same store reads the tmp back", async () => {
    const { fs, store } = setup();
    await store.add(draft(), "A", "P");
    await store.add(draft(), "B", "P");
    const move = failAfterRemove(fs);
    await expect(store.rename("s1", "A2")).rejects.toThrow("disk");
    move.mockRestore();
    const read = await store.list();
    expect(read.status === "ok" && read.styles.map((s) => s.name)).toEqual(["B", "A2"]);
  });
  test("the first add (nothing before): both the tmp and the copy go — exactly the old state", async () => {
    const { fs, store } = setup();
    const move = failAfterRemove(fs);
    await expect(store.add(draft({ music: own }), "A", "P")).rejects.toThrow("disk");
    move.mockRestore();
    expect([...fs.files.keys()].filter((k) => k.includes("/styles"))).toEqual([]);
    expect(await store.list()).toEqual({ status: "ok", styles: [] });
  });
});
