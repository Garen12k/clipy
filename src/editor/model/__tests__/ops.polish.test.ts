jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-04T10:00:00.000Z" }));
let mockN = 0;
jest.mock("@/src/lib/id", () => ({ newId: () => `n${++mockN}` }));
import { deleteClips, duplicateClips, forClips, mainClipIds, setClipSpeed, setClipVolume, setCover } from "../ops";
import { coverTimeOf, totalDuration } from "../timeline";
import { makeClip, makeEffect, makeLayer, makePhotoClip, makeProject } from "../types";

const a = makeClip({ id: "a", sourceDuration: 4, transitionOut: { type: "fade", duration: 0.5 } });   // 0–4
const b = makeClip({ id: "b", sourceDuration: 6 });                                                    // 4–10
const c = makePhotoClip({ id: "c", seconds: 5 });                                                      // 10–15
const l = makeLayer({ id: "l", sourceDuration: 2, start: 1 });
const p = makeProject({ clips: [a, b, c], layers: [l], effects: [makeEffect({ id: "e", start: 12, end: 14 })], cover: { time: 12, title: "T" } });
beforeEach(() => { mockN = 0; });

test("mainClipIds keeps main clips only, in timeline order, once each", () => {
  expect(mainClipIds(p, ["c", "zz", "a", "a", "l"])).toEqual(["a", "c"]);
  expect(mainClipIds(p, [])).toEqual([]);
});

test("deleteClips removes every given main clip in one step and applies the main-track rules once", () => {
  const next = deleteClips(p, ["b", "c"]);
  expect(next.clips.map((x) => x.id)).toEqual(["a"]);
  expect(next.clips[0].transitionOut).toEqual({ type: "none", duration: 0 });   // a is now the last clip
  expect(next.effects).toEqual([]);                 // the effect started at 12 s; the project is now 4 s long
  expect(next.layers).toBe(p.layers);               // layers are never touched
  expect(next.cover).toEqual({ time: 12, title: "T" });   // stored as it was …
  expect(coverTimeOf(next)).toBe(4);                      // … and clamped when read
  expect(next.updatedAt).toBe("2026-10-04T10:00:00.000Z");
});

test("deleteClips: nothing to delete → the same project; deleting every clip is allowed, as the single Delete allows it", () => {
  expect(deleteClips(p, [])).toBe(p);
  expect(deleteClips(p, ["zz", "l"])).toBe(p);      // unknown id, layer id
  expect(deleteClips(p, ["a", "b", "c"]).clips).toEqual([]);
});

test("duplicateClips puts each copy right after its original, with its own nested objects and no transition", () => {
  const next = duplicateClips(p, ["c", "a"]);
  expect(next.clips.map((x) => x.id)).toEqual(["a", "n1", "b", "c", "n2"]);   // ids are taken in timeline order
  expect(next.clips[1]).toEqual({ ...a, id: "n1", transitionOut: { type: "none", duration: 0 } });
  expect(next.clips[1].transform).not.toBe(a.transform);
  expect(next.clips[1].adjust).not.toBe(a.adjust);
  expect(next.clips[0]).toBe(a);                    // originals untouched (a keeps its fade)
  expect(totalDuration(next)).toBe(24);             // 15 + 4 (copy of a) + 5 (copy of c)
  expect(duplicateClips(p, ["l", "zz"])).toBe(p);
  expect(duplicateClips(p, [])).toBe(p);
});

test("forClips folds a single-clip op over the main clips: one project out, the op's own rules per clip", () => {
  const quiet = forClips(p, ["a", "b", "c", "l"], (q, id) => setClipVolume(q, id, 0.5));
  expect(quiet.clips.map((x) => x.volume)).toEqual([0.5, 0.5, 1]);   // the photo is skipped by setClipVolume itself
  expect(quiet.clips[2]).toBe(c);
  expect(quiet.layers[0]).toBe(l);                                   // a layer id is not a main clip
  expect(forClips(p, ["c"], (q, id) => setClipVolume(q, id, 0.5))).toBe(p);   // nothing changed → same project
  const fast = forClips(p, ["a", "b"], (q, id) => setClipSpeed(q, id, 2));
  expect(totalDuration(fast)).toBe(10);                              // 4 / 2 + 6 / 2 + 5
  expect(fast.clips[0].transitionOut).toEqual({ type: "fade", duration: 0.5 });   // cap = min(1, r2(0.5 × min(2, 3))) = 1 ≥ 0.5
});

test("setCover clamps through clampCover; null clears; unchanged or invalid → the same project", () => {
  const base = makeProject({ clips: [a, b, c] });
  expect(setCover(base, { time: 3.14159, title: "  Hello  " }).cover).toEqual({ time: 3.142, title: "Hello" });
  expect(setCover(base, { time: 99, title: "" }).cover).toEqual({ time: 15, title: "" });   // 4 + 6 + 5
  expect(setCover(base, { time: NaN, title: "x" })).toBe(base);
  expect(setCover(base, null)).toBe(base);
  expect(setCover(p, null).cover).toBeNull();
  expect(setCover(p, { time: 12, title: "T" })).toBe(p);
  expect(setCover(p, { time: 12.0004, title: " T " })).toBe(p);     // rounds and trims to what is stored
});

describe("forClips refits effects once, against the final length", () => {
  const slow = makeClip({ id: "s", sourceDuration: 4, speed: 0.5 });   // 8 s
  const fastClip = makeClip({ id: "f", sourceDuration: 8, speed: 2 }); // 4 s
  const fx = makeEffect({ id: "fx", start: 11, end: 12 });
  const q = makeProject({ clips: [slow, fastClip], effects: [fx] });   // 12 s

  test("an effect that fits the final project survives although an intermediate step was shorter", () => {
    expect(totalDuration(q)).toBe(12);
    const out = forClips(q, ["s", "f"], (r, id) => setClipSpeed(r, id, 1));   // s → 4 s first (total 8), then f → 8 s (total 12)
    expect(totalDuration(out)).toBe(12);
    expect(out.effects).toEqual([fx]);
  });

  test("a fold that changes nothing returns the same project", () => {
    expect(forClips(q, ["s", "f"], (r) => r)).toBe(q);
    expect(forClips(q, ["s"], (r, id) => setClipSpeed(r, id, 0.5))).toBe(q);
  });

  test("an effect that truly no longer fits is still dropped", () => {
    const out = forClips(q, ["s", "f"], (r, id) => setClipSpeed(r, id, 2));   // 2 + 4 = 6 s
    expect(totalDuration(out)).toBe(6);
    expect(out.effects).toEqual([]);
  });
});
