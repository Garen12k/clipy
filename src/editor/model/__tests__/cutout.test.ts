import { coveringCopy, CUTOUT, CUTOUT_PREVIEW, CUTOUT_VERSION, cutoutBytes, cutoutDeadlineMs, cutoutFileName, cutoutNeed, cutoutRange, cutoutRefusal, cutoutSize, cutoutStillName, neededCutouts, parseCutoutName } from "../cutout";
import { TRANSITION_HANDLE_MAX, transitionHandles } from "../timeline";
import { makeClip, makeLayer, makePhotoClip, makeProject, type Clip } from "../types";

const MEDIA = "file:///doc/projects/p1/media";
const video = (id: string, extra: Partial<Clip> = {}) => makeClip({ id, sourceDuration: 30, sourceUri: `${MEDIA}/abc.mov`, cutout: true, ...extra });
const photo = (id: string, extra: Partial<Clip> = {}) => makePhotoClip({ id, sourceUri: `${MEDIA}/p.jpg`, cutout: true, ...extra });
/** A name that is one path component and nothing a shell or a url would read as more. */
const SAFE = /^[A-Za-z0-9_-]+\.(mov|png)$/;

test("the constants", () => {
  expect(CUTOUT_VERSION).toBe(1);
  expect(CUTOUT).toEqual({ maxSeconds: 60, pad: 2, videoMaxSide: 1920, photoMaxSide: 2560, minFrameGap: 0.03, minPerson: 0.005, alphaQuality: 0.75, bitsPerPixel: 0.1, stillSeconds: 60, exportOpacity: 0.999 });
  expect(CUTOUT_PREVIEW).toEqual({ layerVideo: true, mainVideo: true });
  // The pad is whole seconds and never less than the longest transition handle the export can read outside a trim.
  expect(Number.isInteger(CUTOUT.pad)).toBe(true);
  expect(CUTOUT.pad).toBeGreaterThanOrEqual(TRANSITION_HANDLE_MAX);
});

test("cutoutRange: the trim plus two seconds each side, on whole seconds, inside the file", () => {
  expect(cutoutRange({ trimStart: 0, trimEnd: 30, sourceDuration: 30 })).toEqual({ from: 0, to: 30 });
  expect(cutoutRange({ trimStart: 4.2, trimEnd: 9.7, sourceDuration: 30 })).toEqual({ from: 2, to: 12 });
  expect(cutoutRange({ trimStart: 2.5, trimEnd: 9, sourceDuration: 30 })).toEqual({ from: 0, to: 11 });
  expect(cutoutRange({ trimStart: 0.4, trimEnd: 7.25, sourceDuration: 7.25 })).toEqual({ from: 0, to: 8 });
  expect(cutoutRange({ trimStart: 100, trimEnd: 160, sourceDuration: 600 })).toEqual({ from: 98, to: 162 });
});

test("cutoutRange is total: whole, finite, at least a second long, whatever the clip holds", () => {
  const odd: { trimStart: number; trimEnd: number; sourceDuration: number }[] = [
    { trimStart: NaN, trimEnd: NaN, sourceDuration: NaN }, { trimStart: NaN, trimEnd: 5, sourceDuration: 30 }, { trimStart: 4, trimEnd: NaN, sourceDuration: 30 },
    { trimStart: 9, trimEnd: 4, sourceDuration: 30 }, { trimStart: 5, trimEnd: 5, sourceDuration: 30 }, { trimStart: -3, trimEnd: 2, sourceDuration: 30 },
    { trimStart: 0, trimEnd: 50, sourceDuration: 30 }, { trimStart: 40, trimEnd: 50, sourceDuration: 30 }, { trimStart: 0, trimEnd: 5, sourceDuration: 0 },
    { trimStart: 0, trimEnd: Infinity, sourceDuration: Infinity }, { trimStart: -Infinity, trimEnd: 3, sourceDuration: -1 }, { trimStart: 0, trimEnd: 0, sourceDuration: 0 },
  ];
  for (const c of odd) {
    const r = cutoutRange(c);
    expect(Number.isInteger(r.from) && Number.isInteger(r.to)).toBe(true);
    expect(r.from).toBeGreaterThanOrEqual(0);
    expect(r.to).toBeGreaterThanOrEqual(r.from + 1);
  }
  expect(cutoutRange({ trimStart: 9, trimEnd: 4, sourceDuration: 30 })).toEqual({ from: 7, to: 11 });      // a backwards trim is its start, nothing long
  expect(cutoutRange({ trimStart: 5, trimEnd: 5, sourceDuration: 30 })).toEqual({ from: 3, to: 7 });
  expect(cutoutRange({ trimStart: 0, trimEnd: 50, sourceDuration: 30 })).toEqual({ from: 0, to: 30 });     // a trim past the file's end stops at the file
  expect(cutoutRange({ trimStart: 2, trimEnd: 5, sourceDuration: NaN })).toEqual({ from: 0, to: 7 });      // an unknown length does not cap
  expect(cutoutRange({ trimStart: NaN, trimEnd: NaN, sourceDuration: NaN })).toEqual({ from: 0, to: 2 });
});

test("names: the source's stem, the version and the range in milliseconds; a photo has a PNG and a still movie beside it", () => {
  expect(cutoutFileName(`${MEDIA}/abc.mov`, false, 3, 11)).toBe("abc-c1-3000-11000.mov");
  expect(cutoutFileName(`${MEDIA}/3f2b8c1e-9a4d-4e6f-b1a2-0c9d8e7f6a5b.MOV`, false, 0, 30)).toBe("3f2b8c1e-9a4d-4e6f-b1a2-0c9d8e7f6a5b-c1-0-30000.mov");   // what storage.ts writes: <uuid>.<ext>
  expect(cutoutFileName(`${MEDIA}/p.jpg`, true)).toBe("p-c1-photo.png");
  expect(cutoutFileName(`${MEDIA}/p.jpg`, true, 3, 11)).toBe("p-c1-photo.png");     // a photo has no range
  expect(cutoutStillName("p-c1-photo.png")).toBe("p-c1-photo.mov");
  expect(parseCutoutName("abc-c1-3000-11000.mov")).toEqual({ stem: "abc", photo: false, from: 3, to: 11 });
  expect(parseCutoutName("a-b-c1-c1-0-500.mov")).toEqual({ stem: "a-b-c1", photo: false, from: 0, to: 0.5 });
  expect(parseCutoutName("p-c1-photo.png")).toEqual({ stem: "p", photo: true, from: 0, to: 0 });
  for (const other of ["p-c1-photo.mov", "part-abc-c1-3000-11000.mov", "abc-c2-3000-11000.mov", "abc-v1-deep-s50-p0-flat-l0.m4a", "abc-c1-x-y.mov", ""]) expect(parseCutoutName(other)).toBeNull();
});

test("a name with odd characters: still one safe path component, and never the name of another file's copy", () => {
  // The stem is made safe; because that loses what made the name its own, a check of the whole file name is added.
  expect(cutoutFileName(`${MEDIA}/my clip (1).MOV`, false, 0, 30)).toBe("my_clip__1_-79f81381-c1-0-30000.mov");
  expect(cutoutFileName(`${MEDIA}/my_clip_(1).mov`, false, 0, 30)).toBe("my_clip__1_-b2a1ed53-c1-0-30000.mov");
  expect(cutoutFileName(`${MEDIA}/.mov`, false, 0, 30)).toBe("file-d08d5ef5-c1-0-30000.mov");
  expect(cutoutFileName("", true)).toBe("file-811c9dc5-c1-photo.png");
  // A source called part-… must not get the name a half-written copy has.
  expect(cutoutFileName(`${MEDIA}/part-abc.mov`, false, 3, 11)).toBe("part_abc-fe76af75-c1-3000-11000.mov");
  const odd = ["my clip (1).MOV", "my_clip_(1).mov", "my clip [1].MOV", "../../etc/passwd", "a/b\\c.mov", "ünï cödé.mov", "😀.mov", "a.tar.gz", "x?y=1&z.mov", "%20.mov", ".", "..", "", ".mov",
    "part-abc.mov", "abc-c1-photo.jpg", "abc-c1-0-500.mov", `${"long".repeat(100)}.mov`, "abc.mov", "abd.mov"];
  const names = odd.map((file) => cutoutFileName(`${MEDIA}/${file}`, false, 3, 11));
  for (const name of names) {
    expect(name).toMatch(SAFE);
    expect(name.length).toBeLessThanOrEqual(120);
    expect(parseCutoutName(name)).toMatchObject({ photo: false, from: 3, to: 11 });      // every name it writes, it reads back
  }
  expect(new Set(names).size).toBe(odd.length);
  for (const file of odd) expect(cutoutFileName(`${MEDIA}/${file}`, true)).toMatch(SAFE);
  // The same source, range and kind: always the same name.
  expect(cutoutFileName(`${MEDIA}/my clip (1).MOV`, false, 0, 30)).toBe(cutoutFileName(`${MEDIA}/my clip (1).MOV`, false, 0, 30));
  // Different ranges and kinds of one source: different names.
  const one = `${MEDIA}/abc.mov`;
  expect(new Set([cutoutFileName(one, false, 3, 11), cutoutFileName(one, false, 3, 12), cutoutFileName(one, false, 2, 11), cutoutFileName(one, false, 31, 1), cutoutFileName(one, true)]).size).toBe(5);
});

test("cutoutFileName and parseCutoutName are total", () => {
  expect(cutoutFileName(`${MEDIA}/abc.mov`, false, NaN, NaN)).toBe("abc-c1-0-0.mov");
  expect(cutoutFileName(`${MEDIA}/abc.mov`, false, 11, 3)).toBe("abc-c1-3000-11000.mov");        // the two ends in order
  expect(cutoutFileName(`${MEDIA}/abc.mov`, false, -5, 2)).toBe("abc-c1-0-2000.mov");
  expect(cutoutFileName(`${MEDIA}/abc.mov`, false, 0, 1e30)).toMatch(/^abc-c1-0-\d+\.mov$/);
  expect(cutoutFileName(`${MEDIA}/abc.mov`, false, 0, Infinity)).toBe("abc-c1-0-0.mov");
  // Not a finished copy: an empty or backwards range, numbers too long to be exact, leading zeros (not a name this module writes), a stem that is not safe.
  for (const other of ["abc-c1-0-0.mov", "abc-c1-11000-3000.mov", `abc-c1-0-${"9".repeat(400)}.mov`, "abc-c1-03000-11000.mov", "abc-c1--3000-11000.mov", "a b-c1-0-500.mov", "../x-c1-0-500.mov",
    "-c1-0-500.mov", "-c1-photo.png", "abc-c1-photo.PNG", "abc-c1-0-500.mov.part", "part-p-c1-photo.png"]) expect(parseCutoutName(other)).toBeNull();
});

test("coveringCopy: the smallest known copy of the same file that holds the clip's trim and its transition handles", () => {
  const known = ["abc-c1-3000-11000.mov", "abc-c1-0-30000.mov", "other-c1-0-30000.mov", "p-c1-photo.png"];
  expect(coveringCopy(known, video("a", { trimStart: 4.2, trimEnd: 9.7 }))).toBe("abc-c1-3000-11000.mov");
  expect(coveringCopy(known, video("a", { trimStart: 5, trimEnd: 9 }))).toBe("abc-c1-3000-11000.mov");       // trimmed inwards: the same copy
  expect(coveringCopy(known, video("a", { trimStart: 3.5, trimEnd: 10.5 }))).toBe("abc-c1-3000-11000.mov");  // with its handles (half a second at 1×) exactly its ends
  expect(coveringCopy(known, video("a", { trimStart: 3, trimEnd: 11 }))).toBe("abc-c1-0-30000.mov");         // the trim fits, its handles do not: the larger
  expect(coveringCopy(known, video("a", { trimStart: 2.5, trimEnd: 9 }))).toBe("abc-c1-0-30000.mov");        // past the small one: the larger
  expect(coveringCopy(["abc-c1-3000-11000.mov"], video("a", { trimStart: 2.5, trimEnd: 9 }))).toBeNull();
  expect(coveringCopy(known, video("a", { sourceUri: `${MEDIA}/zzz.mov` }))).toBeNull();
  expect(coveringCopy(known, photo("ph"))).toBe("p-c1-photo.png");
  expect(coveringCopy([], photo("ph"))).toBeNull();
});

test("coveringCopy: outwards past either end needs another copy; the order of the list never matters; a video and a photo never share", () => {
  const small = "abc-c1-3000-11000.mov";
  expect(coveringCopy([small], video("a", { trimStart: 4.2, trimEnd: 11.2 }))).toBeNull();       // past its end
  expect(coveringCopy([small], video("a", { trimStart: 2.999, trimEnd: 9 }))).toBeNull();        // past its start
  expect(coveringCopy([small], video("a", { trimStart: 3.5000001, trimEnd: 10.4999999 }))).toBe(small);
  // Two copies as long as each other: the earlier one, whichever is listed first.
  const a = "abc-c1-3000-11000.mov", b = "abc-c1-2000-10000.mov";
  const clip = video("a", { trimStart: 4, trimEnd: 9 });
  expect(coveringCopy([a, b], clip)).toBe(b);
  expect(coveringCopy([b, a], clip)).toBe(b);
  const many = [a, "abc-c1-0-30000.mov", "abc-c1-3000-10000.mov", b];
  expect(coveringCopy(many, clip)).toBe("abc-c1-3000-10000.mov");
  expect(coveringCopy([...many].reverse(), clip)).toBe("abc-c1-3000-10000.mov");
  expect(coveringCopy(["abc-c1-4000-9000.mov"], clip)).toBeNull();     // exactly the trim: no room for a transition
  // Kinds: a photo's PNG is no video copy, a video copy no photo's.
  expect(coveringCopy(["abc-c1-photo.png"], video("a"))).toBeNull();
  expect(coveringCopy(["p-c1-0-60000.mov", "p-c1-photo.mov"], photo("ph"))).toBeNull();
  // What is not a finished copy is never used.
  expect(coveringCopy(["part-abc-c1-0-30000.mov", "abc-c2-0-30000.mov", "abc-c1-0-0.mov", ""], video("a"))).toBeNull();
  // A clip whose numbers are broken: an answer, not a throw.
  expect(coveringCopy([small], video("a", { trimStart: NaN, trimEnd: NaN }))).toBeNull();
  expect(coveringCopy(["abc-c1-0-30000.mov"], video("a", { trimStart: NaN, trimEnd: NaN }))).toBe("abc-c1-0-30000.mov");
  expect(coveringCopy(["abc-c1-0-30000.mov"], video("a", { trimStart: 0, trimEnd: 45 }))).toBe("abc-c1-0-30000.mov");     // a trim past the file's end is the file's end
});

test("the copy planned for a clip always covers that clip, so it is found again once it exists", () => {
  const clips: Clip[] = [video("a"), video("a", { trimStart: 4.2, trimEnd: 9.7 }), video("a", { trimStart: 29.5, trimEnd: 30 }), video("a", { trimStart: 0, trimEnd: 0.1 }),
    video("a", { trimStart: 7, trimEnd: 7 }), video("a", { trimStart: 9, trimEnd: 4 }), video("a", { trimStart: NaN, trimEnd: NaN }), video("a", { trimStart: 0, trimEnd: 45 }),
    video("a", { sourceDuration: 7.25, trimStart: 0.4, trimEnd: 7.25 }), video("a", { sourceDuration: NaN, trimStart: 2, trimEnd: 5 }), video("a", { sourceUri: `${MEDIA}/my clip (1).MOV` }),
    video("a", { sourceUri: "" }), video("a", { speed: 4 }), video("a", { speed: 0.25, trimStart: 3.3, trimEnd: 8.8 }), photo("ph"), photo("ph", { sourceUri: `${MEDIA}/ä b.HEIC` })];
  for (const c of clips) {
    const planned = cutoutNeed(c, []);
    expect(coveringCopy([planned.name], c)).toBe(planned.name);
    expect(cutoutNeed(c, [planned.name])).toEqual(planned);
  }
});

// I1 (review): the export reads up to half a transition × the edge speed of source OUTSIDE the trim. A copy that merely contains
// the trim has nothing there (its timeline is empty before its first frame), so the transition would start late and jump.
test("a copy without room for the clip's transition handles does not cover it: a new one is planned", () => {
  const old = "abc-c1-3000-11000.mov";
  // Trimmed outwards to the copy's very start: half a second of handle would fall before the copy's first frame.
  const out = video("a", { trimStart: 3, trimEnd: 9.7 });
  expect(coveringCopy([old], out)).toBeNull();
  expect(cutoutNeed(out, [old])).toMatchObject({ name: "abc-c1-1000-12000.mov", from: 1, to: 12 });
  // The same trim covers at 1× and not at 4×, where the handle is two seconds of source.
  expect(coveringCopy([old], video("a", { trimStart: 4.2, trimEnd: 9.7 }))).toBe(old);
  expect(coveringCopy([old], video("a", { trimStart: 4.2, trimEnd: 9.7, speed: 4 }))).toBeNull();
  expect(coveringCopy([old], video("a", { trimStart: 5, trimEnd: 9, speed: 4 }))).toBe(old);          // 3 … 11 is exactly its room
  // A curve: the head at its first speed, the tail at its last.
  const curved = (steps: { from: number; speed: number }[]): Clip => ({ ...video("a", { trimStart: 4.2, trimEnd: 9.7 }), speedCurve: { id: "montage", steps } });
  expect(coveringCopy([old], curved([{ from: 4.2, speed: 4 }, { from: 6, speed: 1 }]))).toBeNull();
  expect(coveringCopy([old], curved([{ from: 4.2, speed: 1 }, { from: 6, speed: 4 }]))).toBeNull();
  expect(coveringCopy([old], curved([{ from: 4.2, speed: 1 }, { from: 6, speed: 2 }]))).toBe(old);
  // The tail the same way; at the file's own ends there is nothing more to hold.
  expect(coveringCopy([old], video("a", { trimStart: 4.2, trimEnd: 10.8 }))).toBeNull();
  expect(coveringCopy([old], video("a", { trimStart: 4.2, trimEnd: 11, sourceDuration: 11 }))).toBe(old);
  expect(coveringCopy(["abc-c1-0-8000.mov"], video("a", { trimStart: 0, trimEnd: 7.5, speed: 4 }))).toBeNull();
  expect(coveringCopy(["abc-c1-0-8000.mov"], video("a", { trimStart: 0, trimEnd: 6, speed: 4 }))).toBe("abc-c1-0-8000.mov");
});

test("a freshly planned copy holds everything the export can read for its clip, at any speed, on whole seconds", () => {
  for (const speed of [0.25, 1, 2, 3.7, 4]) {
    for (const [trimStart, trimEnd, sourceDuration] of [[0, 30, 30], [4.2, 9.7, 30], [1.9, 28.4, 30], [29.5, 30, 30], [0.4, 7.25, 7.25], [100, 160, 600], [2, 5, NaN]] as const) {
      const c = video("a", { trimStart, trimEnd, sourceDuration, speed });
      const { head, tail } = transitionHandles(c);
      const { from, to } = cutoutRange(c);
      expect(Number.isInteger(from) && Number.isInteger(to)).toBe(true);
      expect(from).toBeLessThanOrEqual(Math.max(0, trimStart - head));
      expect(to).toBeGreaterThanOrEqual(Math.min(Number.isFinite(sourceDuration) ? sourceDuration : Infinity, trimEnd + tail));
      const planned = cutoutNeed(c, []);
      expect(coveringCopy([planned.name], c)).toBe(planned.name);
    }
  }
});

test("speed never counts: the copy is of source seconds", () => {
  const base = video("a", { trimStart: 4.2, trimEnd: 9.7 });
  for (const speed of [0.25, 1, 4]) expect(cutoutNeed({ ...base, speed }, [])).toEqual(cutoutNeed(base, []));
  const curved: Clip = { ...base, speedCurve: { id: "montage", steps: [{ from: 4.2, speed: 4 }, { from: 6, speed: 0.25 }] } };
  expect(cutoutNeed(curved, [])).toEqual(cutoutNeed(base, []));
  expect(cutoutBytes(curved)).toBe(cutoutBytes(base));
});

test("cutoutRefusal: a reversed clip, and a video whose trimmed source is over 60 seconds", () => {
  expect(cutoutRefusal(video("a"))).toBeNull();
  expect(cutoutRefusal(video("a", { reversed: true }))).toBe("reversed");
  const long = (trimEnd: number) => makeClip({ id: "l", sourceDuration: 600, trimStart: 100, trimEnd });
  expect(cutoutRefusal(long(160))).toBeNull();
  expect(cutoutRefusal(long(160.01))).toBe("tooLong");
  expect(cutoutRefusal(makeClip({ id: "f", sourceDuration: 240, speed: 4 }))).toBe("tooLong");     // source seconds count, not the timeline's
  expect(cutoutRefusal(photo("ph"))).toBeNull();
});

test("cutoutRefusal is total", () => {
  expect(cutoutRefusal(makeClip({ id: "s", sourceDuration: 240, trimStart: 0, trimEnd: 60, speed: 0.25 }))).toBeNull();    // four minutes on the timeline, 60 source seconds
  expect(cutoutRefusal(makeClip({ id: "r", sourceDuration: 600, reversed: true }))).toBe("reversed");                    // both: reversed is said first
  expect(cutoutRefusal(photo("ph", { reversed: true }))).toBe("reversed");
  expect(cutoutRefusal(makePhotoClip({ id: "ph", seconds: 60 }))).toBeNull();                                           // a photo is never too long
  expect(cutoutRefusal(video("a", { trimStart: NaN, trimEnd: NaN }))).toBeNull();
  expect(cutoutRefusal(video("a", { trimStart: 9, trimEnd: 4 }))).toBeNull();
  expect(cutoutRefusal(video("a", { trimStart: 5, trimEnd: 5 }))).toBeNull();
  expect(cutoutRefusal(video("a", { trimStart: 0, trimEnd: 500 }))).toBeNull();                                           // 30 seconds of file: the trim past its end does not count
  expect(cutoutRefusal(video("a", { sourceDuration: NaN, trimStart: 0, trimEnd: 61 }))).toBe("tooLong");
  // A clip that is not refused never plans a copy longer than the limit and its two pads.
  for (const c of [video("a"), makeClip({ id: "l", sourceDuration: 600, trimStart: 100, trimEnd: 160 }), makeClip({ id: "l", sourceDuration: 600, trimStart: 100.5, trimEnd: 160.5 })]) {
    expect(cutoutRefusal(c)).toBeNull();
    const { from, to } = cutoutRange(c);
    expect(to - from).toBeLessThanOrEqual(CUTOUT.maxSeconds + 2 * CUTOUT.pad + 1);
  }
});

test("cutoutNeed: the covering copy when there is one, else the planned one", () => {
  const clip = video("a", { trimStart: 4.2, trimEnd: 9.7 });
  expect(cutoutNeed(clip, [])).toEqual({ name: "abc-c1-2000-12000.mov", sourceUri: `${MEDIA}/abc.mov`, photo: false, from: 2, to: 12 });
  expect(cutoutNeed(clip, ["abc-c1-0-30000.mov"])).toEqual({ name: "abc-c1-0-30000.mov", sourceUri: `${MEDIA}/abc.mov`, photo: false, from: 0, to: 30 });
  expect(cutoutNeed(photo("ph"), [])).toEqual({ name: "p-c1-photo.png", sourceUri: `${MEDIA}/p.jpg`, photo: true, from: 0, to: 0 });
});

test("the spec's table: trimmed inwards keeps the copy, outwards plans a new one, a split shares it", () => {
  const known = ["abc-c1-2000-12000.mov"];
  expect(cutoutNeed(video("a", { trimStart: 5, trimEnd: 9 }), known).name).toBe("abc-c1-2000-12000.mov");
  expect(cutoutNeed(video("a", { trimStart: 2.5, trimEnd: 9 }), known).name).toBe("abc-c1-2000-12000.mov");      // outwards, its handle still inside
  expect(cutoutNeed(video("a", { trimStart: 2, trimEnd: 9 }), known)).toEqual({ name: "abc-c1-0-11000.mov", sourceUri: `${MEDIA}/abc.mov`, photo: false, from: 0, to: 11 });
  expect(cutoutNeed(video("a", { trimStart: 4.2, trimEnd: 7 }), known).name).toBe("abc-c1-2000-12000.mov");
  expect(cutoutNeed(video("b", { trimStart: 7, trimEnd: 9.7 }), known).name).toBe("abc-c1-2000-12000.mov");
  // Back inwards after the new one exists: the smaller of the two that cover it.
  expect(cutoutNeed(video("a", { trimStart: 5, trimEnd: 9 }), [...known, "abc-c1-0-11000.mov"]).name).toBe("abc-c1-2000-12000.mov");
  expect(cutoutNeed(video("a", { trimStart: 2, trimEnd: 9 }), [...known, "abc-c1-0-11000.mov"]).name).toBe("abc-c1-0-11000.mov");
});

test("neededCutouts: one entry per different copy, for clips and layers whose switch is on and can be served", () => {
  const p = makeProject({
    clips: [video("a", { trimStart: 4.2, trimEnd: 7 }), video("b", { trimStart: 7, trimEnd: 9.7 }), makeClip({ id: "plain", sourceDuration: 5 }), photo("ph"),
      video("rev", { reversed: true }), makeClip({ id: "long", sourceDuration: 600, cutout: true }), video("gone", { sourceUri: `${MEDIA}/gone.mov` })],
    layers: [{ ...makeLayer({ id: "L", sourceDuration: 12, sourceUri: `${MEDIA}/layer.mov` }), cutout: true as const }],
  });
  // The two halves of a split plan different copies until one exists …
  expect(neededCutouts(p, [`${MEDIA}/gone.mov`], []).map((n) => n.name)).toEqual(["abc-c1-2000-9000.mov", "abc-c1-5000-12000.mov", "p-c1-photo.png", "layer-c1-0-12000.mov"]);
  // … and share one that covers both.
  expect(neededCutouts(p, [`${MEDIA}/gone.mov`], ["abc-c1-2000-12000.mov"]).map((n) => n.name)).toEqual(["abc-c1-2000-12000.mov", "p-c1-photo.png", "layer-c1-0-12000.mov"]);
  expect(neededCutouts(makeProject({ clips: [makeClip({ id: "x", sourceDuration: 4 })] }), [], [])).toEqual([]);
});

test("neededCutouts reads only: the project and the two lists are left as they were", () => {
  const p = makeProject({ clips: [video("a", { trimStart: 4.2, trimEnd: 7 }), photo("ph")], layers: [{ ...makeLayer({ id: "L", sourceDuration: 12 }), cutout: true as const }] });
  const before = JSON.stringify(p);
  const missing = Object.freeze([`${MEDIA}/gone.mov`]), known = Object.freeze(["abc-c1-3000-11000.mov"]);
  const out = neededCutouts(p, missing, known);
  expect(JSON.stringify(p)).toBe(before);
  expect(out).toEqual(neededCutouts(p, missing, known));
  expect(neededCutouts(makeProject(), [], [])).toEqual([]);
});

test("cutoutSize: at most the cap on the long side, even numbers, the shape kept", () => {
  expect(cutoutSize(1080, 1920, 1920)).toEqual({ width: 1080, height: 1920 });
  expect(cutoutSize(2160, 3840, 1920)).toEqual({ width: 1080, height: 1920 });
  expect(cutoutSize(1920, 1080, 1920)).toEqual({ width: 1920, height: 1080 });
  expect(cutoutSize(4032, 3024, 2560)).toEqual({ width: 2560, height: 1920 });
  expect(cutoutSize(1179, 2556, 1920)).toEqual({ width: 886, height: 1920 });
  expect(cutoutSize(3, 5, 1920)).toEqual({ width: 2, height: 4 });
  expect(cutoutSize(NaN, 0, 1920)).toEqual({ width: 2, height: 2 });
});

test("cutoutSize is total", () => {
  for (const [w, h, cap] of [[Infinity, 1080, 1920], [-4, -4, 1920], [1080, 1920, NaN], [1080, 1920, 0], [1080, 1920, -1], [1, 100000, 1920], [0.4, 0.4, 1920]] as const) {
    const s = cutoutSize(w, h, cap);
    for (const side of [s.width, s.height]) {
      expect(Number.isInteger(side) && side % 2 === 0).toBe(true);
      expect(side).toBeGreaterThanOrEqual(2);
    }
  }
  expect(cutoutSize(1080, 1920, NaN)).toEqual({ width: 1080, height: 1920 });     // no usable cap: the picture's own size
  expect(cutoutSize(1, 100000, 1920)).toEqual({ width: 2, height: 1920 });
});

test("the deadline grows with the range; the size estimate is about 9 MB per 10 seconds of 1080 × 1920", () => {
  expect(cutoutDeadlineMs({ photo: true, from: 0, to: 0 })).toBe(60000);
  expect(cutoutDeadlineMs({ photo: false, from: 3, to: 11 })).toBe(220000);
  expect(cutoutDeadlineMs({ photo: false, from: 0, to: 64 })).toBe(1340000);
  expect(cutoutBytes(makeClip({ id: "v", sourceDuration: 10, trimStart: 0, trimEnd: 10 }))).toBe(9491200);         // range 0 – 10
  expect(cutoutBytes(makeClip({ id: "v", sourceDuration: 600, trimStart: 100, trimEnd: 160 }))).toBe(60743680);    // range 98 – 162
  expect(cutoutBytes(photo("ph"))).toBe(5000000);
});

test("the deadline and the size estimate are total", () => {
  expect(cutoutDeadlineMs({ photo: false, from: NaN, to: NaN })).toBe(60000);
  expect(cutoutDeadlineMs({ photo: false, from: 11, to: 3 })).toBe(60000);
  expect(cutoutDeadlineMs({ photo: false, from: 0, to: Infinity })).toBe(60000);
  for (const c of [video("a", { width: NaN, height: NaN }), video("a", { width: 0, height: -1 }), video("a", { trimStart: NaN, trimEnd: NaN }), video("a", { trimStart: 9, trimEnd: 4 })]) {
    const bytes = cutoutBytes(c);
    expect(Number.isInteger(bytes) && bytes > 0).toBe(true);
  }
  // A tiny picture still has the floor of a megabit a second: 1 s × (1 000 000 × 1.2 + 128 000) / 8.
  expect(cutoutBytes(video("a", { width: 2, height: 2, trimStart: 0, trimEnd: 0, sourceDuration: 1 }))).toBe(166000);
});
