jest.mock("@/src/lib/id", () => ({ newId: jest.fn(() => "new-id") }));
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
import { useEditorStore } from "@/src/editor/store";
import { LAYER_LIMITS, makeClip, makeEffect, makeKeyframe, makeLayer, makePhotoClip, makeProject, type LayerClip, type Project } from "../types";
import { clipDuration, findItem, itemOffsetAt, layerEnd, layersAt } from "../timeline";
import {
  addLayer, deleteClip, deleteLayer, duplicateClip, duplicateLayer, editClipTransformAt, fillClip, fitClip, flipClip, insertFreezeFrame, moveClip, moveLayer,
  reorderLayer, replaceClipMedia, resetClipAdjust, resetClipTransform, rotateClip90, setAdjustForAllClips, setAnimationForAllClips, setBackgroundForAllClips,
  setClipAdjust, setClipAnimation, setClipBackground, setClipCrop, setClipFade, setClipFilter, setClipFilterIntensity, setClipMask, setClipMuted, setClipOpacity,
  setClipReversed, setClipSpeed, setClipSpeedCurve, setClipTransform, setClipVolume, setFilterForAllClips, setTransition, splitClipAt, toggleClipKeyframe,
  trimClip, trimLayer, videoLayerOverlap,
} from "../ops";

const photoLayer = (id: string, start: number, seconds = 3): LayerClip => ({ ...makePhotoClip({ id, seconds }), start });
const a = makeClip({ id: "a", sourceDuration: 6 });
const b = makeClip({ id: "b", sourceDuration: 4 });
const v1 = makeLayer({ id: "v1", sourceDuration: 4, start: 1 });      // 1 – 5
const ph = photoLayer("ph", 2);                                         // 2 – 5
const v2 = makeLayer({ id: "v2", sourceDuration: 5, start: 8 });      // 8 – 13: runs past the 10 s project
const p = makeProject({ clips: [a, b], layers: [v1, ph, v2], effects: [makeEffect({ id: "e1", start: 1, end: 2 })] });
const layer = (x: Project, id: string) => x.layers.find((l) => l.id === id)!;

/** Every change to a layer leaves the main track (and what hangs off it) alone. */
function expectLayerOnly(next: Project, from: Project = p) {
  expect(next).not.toBe(from);
  expect(next.clips).toBe(from.clips);
  expect(next.effects).toBe(from.effects);
  expect(next.updatedAt).toBe("2026-10-01T10:00:00.000Z");
}

describe("lookup and timing helpers", () => {
  test("findItem: clips first, then layers; unknown → null", () => {
    expect(findItem(p, "a")).toEqual({ clip: a, layer: false });
    expect(findItem(p, "v1")).toEqual({ clip: v1, layer: true });
    expect(findItem(p, "v1")!.clip).toBe(v1);
    expect(findItem(p, "zzz")).toBeNull();
  });

  test("layerEnd = start + clipDuration (speed applies)", () => {
    expect(layerEnd(v1)).toBe(5);
    expect(layerEnd({ ...v1, speed: 2 })).toBe(3);
    expect(layerEnd(ph)).toBe(5);
  });

  test("layersAt: on screen at that time, in list order; the end is exclusive; at and past the project's end, the project's last frame", () => {
    expect(layersAt(p, 0.5)).toEqual([]);
    expect(layersAt(p, 1)).toEqual([v1]);
    expect(layersAt(p, 3)).toEqual([v1, ph]);
    expect(layersAt(p, 5)).toEqual([]);
    expect(layersAt(p, 9)).toEqual([v2]);
    // The project ends at 10 with v2 still running: it stays on the last frame (as the last main clip does), its rest never shown.
    expect(layersAt(p, 10)).toEqual([v2]);
    expect(layersAt(p, 12)).toEqual([v2]);
    expect(layersAt(p, NaN)).toEqual([]);
    expect(layersAt({ ...p, layers: [ph, v1] }, 3)).toEqual([ph, v1]);
    // A layer that ends exactly with the project is on its last frame too; one that ended earlier is not.
    const flush = makeLayer({ id: "flush", sourceDuration: 3, start: 7 });      // 7 – 10
    expect(layersAt({ ...p, layers: [v1, flush] }, 10)).toEqual([flush]);
    expect(layersAt({ ...p, layers: [v1, flush] }, 9.999)).toEqual([flush]);
    // Nothing shows in a project without main clips.
    expect(layersAt({ ...p, clips: [] }, 0)).toEqual([]);
  });

  test("itemOffsetAt for a layer: time − start while it is on screen (the project's end counts as its last frame)", () => {
    expect(itemOffsetAt(p, "v1", 1)).toBe(0);
    expect(itemOffsetAt(p, "v1", 3.5)).toBe(2.5);
    expect(itemOffsetAt(p, "v1", 5)).toBeNull();
    expect(itemOffsetAt(p, "v1", 0.9)).toBeNull();
    expect(itemOffsetAt(p, "v1", 10)).toBeNull();
    expect(itemOffsetAt(p, "v2", 9)).toBe(1);
    expect(itemOffsetAt(p, "v2", 10)).toBe(2);
    expect(itemOffsetAt(p, "v2", 99)).toBe(2);
    expect(itemOffsetAt(p, "v2", NaN)).toBeNull();
  });

  test("itemOffsetAt for a main clip: clipAt's offset when it is that clip (the last clip at the project's end)", () => {
    expect(itemOffsetAt(p, "a", 2)).toBe(2);
    expect(itemOffsetAt(p, "b", 2)).toBeNull();
    expect(itemOffsetAt(p, "b", 7)).toBe(1);
    expect(itemOffsetAt(p, "a", 7)).toBeNull();
    expect(itemOffsetAt(p, "b", 10)).toBe(4);
    expect(itemOffsetAt(p, "b", 99)).toBe(4);
    expect(itemOffsetAt(p, "a", NaN)).toBeNull();
    expect(itemOffsetAt(p, "zzz", 2)).toBeNull();
  });
});

describe("videoLayerOverlap", () => {
  const v = (id: string, start: number, len: number) => makeLayer({ id, sourceDuration: len, start });
  test("the largest number of video layers on screen at once; photos are not counted; touching is not overlapping", () => {
    expect(videoLayerOverlap([])).toBe(0);
    expect(videoLayerOverlap(p.layers)).toBe(1);
    expect(videoLayerOverlap([v("x", 0, 4), v("y", 4, 4), v("z", 8, 4)])).toBe(1);
    expect(videoLayerOverlap([v("x", 0, 4), v("y", 3, 4), v("z", 6.5, 4)])).toBe(2);
    expect(videoLayerOverlap([v("x", 0, 4), v("y", 3, 4), v("z", 3.5, 4)])).toBe(3);
    expect(videoLayerOverlap([photoLayer("i", 0), photoLayer("j", 0), photoLayer("k", 0), v("x", 0, 4)])).toBe(1);
  });
});

describe("addLayer", () => {
  const clip = makeClip({ id: "n", sourceDuration: 3, transform: { scale: 2, x: 0.3, y: 0.1, rotation: 20, flipH: true, flipV: false }, transitionOut: { type: "fade", duration: 0.5 } });

  test("appended on top through newLayer: default scale, centred, no transition, start rounded", () => {
    const next = addLayer(p, clip, 2.00049);
    expectLayerOnly(next);
    expect(next.layers.map((l) => l.id)).toEqual(["v1", "ph", "v2", "n"]);
    expect(layer(next, "n")).toMatchObject({ start: 2, transitionOut: { type: "none", duration: 0 },
      transform: { scale: LAYER_LIMITS.defaultScale, x: 0, y: 0, rotation: 20, flipH: true, flipV: false } });
    expect(layer(next, "n").transform).not.toBe(clip.transform);
    expect(layer(addLayer(p, clip, -4), "n").start).toBe(0);
  });

  test("refused: at the limit, an id already used by a clip or a layer, no main clips, non-finite start", () => {
    const full = makeProject({ clips: [a], layers: Array.from({ length: LAYER_LIMITS.max }, (_, i) => photoLayer(`l${i}`, 0)) });
    expect(addLayer(full, clip, 0)).toBe(full);
    expect(addLayer(p, { ...clip, id: "a" }, 0)).toBe(p);
    expect(addLayer(p, { ...clip, id: "v1" }, 0)).toBe(p);
    const empty = makeProject();
    expect(addLayer(empty, clip, 0)).toBe(empty);
    for (const bad of [NaN, Infinity, -Infinity]) expect(addLayer(p, clip, bad)).toBe(p);
  });

  test("refused when a third video layer would be on screen at once; photos are never counted", () => {
    const two = addLayer(p, clip, 2);                                    // v1 + n at 2 – 5
    expect(videoLayerOverlap(two.layers)).toBe(2);
    expect(addLayer(two, makeClip({ id: "m", sourceDuration: 3 }), 3)).toBe(two);
    expect(addLayer(two, makeClip({ id: "m", sourceDuration: 3 }), 5).layers).toHaveLength(5);   // touching v1's and n's end
    expect(addLayer(two, makePhotoClip({ id: "m" }), 3).layers).toHaveLength(5);
  });

  test("refused when shorter than the layer minimum", () => {
    expect(addLayer(p, makeClip({ id: "n", sourceDuration: 3, trimEnd: 0.2 }), 6)).toBe(p);
  });
});

describe("moveLayer", () => {
  test("start = max(0, 3 decimals); the layer may run past the project's end", () => {
    const next = moveLayer(p, "v1", 6.0004);
    expectLayerOnly(next);
    expect(layer(next, "v1")).toEqual({ ...v1, start: 6 });
    expect(layer(moveLayer(p, "v1", -3), "v1").start).toBe(0);
    expect(layer(moveLayer(p, "ph", 40), "ph").start).toBe(40);
  });

  test("same project: no change, unknown id, a main clip's id, non-finite", () => {
    expect(moveLayer(p, "v1", 1)).toBe(p);
    expect(moveLayer(p, "zzz", 3)).toBe(p);
    expect(moveLayer(p, "a", 3)).toBe(p);
    for (const bad of [NaN, Infinity, -Infinity]) expect(moveLayer(p, "v1", bad)).toBe(p);
  });

  test("refused where the overlap rule would break — a drag stops at the last valid position", () => {
    const x = makeProject({ clips: [a, b], layers: [makeLayer({ id: "x", sourceDuration: 2, start: 0 }), makeLayer({ id: "y", sourceDuration: 2, start: 1 }), makeLayer({ id: "z", sourceDuration: 2, start: 5 })] });
    const near = moveLayer(x, "z", 3);       // touches y's end: fine
    expect(layer(near, "z").start).toBe(3);
    expect(moveLayer(near, "z", 1.5)).toBe(near);
    expect(layer(moveLayer(near, "z", 2), "z").start).toBe(2);   // touches x's end, overlaps only y
    const withPhoto = { ...x, layers: [...x.layers, photoLayer("i", 6)] };
    expect(layer(moveLayer(withPhoto, "i", 1.2), "i").start).toBe(1.2);   // a photo is never refused
  });

  test("one drag = one undo step", () => {
    const st = () => useEditorStore.getState();
    st().reset(); st().setProject(p);
    st().beginTransaction();
    for (const t of [2, 3, 4]) st().applyTransient((x) => moveLayer(x, "v1", t));
    expect(layer(st().project!, "v1").start).toBe(4);
    expect(st().past).toHaveLength(1);
    st().undo();
    expect(st().project).toBe(p);
    expect(st().canUndo()).toBe(false);
    st().reset();
  });
});

describe("trimLayer", () => {
  test('anchor "end": the start stays, the source range is clamped to the source', () => {
    const next = trimLayer(p, "v1", 0, 2.5, "end");
    expectLayerOnly(next);
    expect(layer(next, "v1")).toEqual({ ...v1, trimEnd: 2.5 });
    expect(layer(trimLayer(p, "v1", -1, 99, "end"), "v1")).toBe(v1);            // clamped to the whole source: nothing changes
    expect(trimLayer(p, "v1", -1, 99, "end")).toBe(p);
  });

  test('anchor "start": the layer\'s end keeps its project time', () => {
    const next = trimLayer(p, "v1", 1.5, 4, "start");
    expect(layer(next, "v1")).toMatchObject({ trimStart: 1.5, trimEnd: 4, start: 2.5 });
    expect(layerEnd(layer(next, "v1"))).toBe(5);
    const fast = makeProject({ clips: [a], layers: [makeLayer({ id: "f", sourceDuration: 8, trimStart: 2, speed: 2, start: 1 })] });   // 3 s long, ends at 4
    const t = layer(trimLayer(fast, "f", 4, 8, "start"), "f");
    expect(t).toMatchObject({ trimStart: 4, start: 2 });
    expect(layerEnd(t)).toBe(4);
  });

  test('anchor "start" growing past project time 0: the trim is clamped so the layer starts at 0', () => {
    const x = makeProject({ clips: [a], layers: [makeLayer({ id: "f", sourceDuration: 8, trimStart: 4, start: 1 })] });   // 1 – 5
    const t = layer(trimLayer(x, "f", 0, 8, "start"), "f");
    expect(t).toMatchObject({ start: 0, trimStart: 3, trimEnd: 8 });
    expect(layerEnd(t)).toBe(5);
    const r = makeProject({ clips: [a], layers: [makeLayer({ id: "f", sourceDuration: 8, trimEnd: 4, reversed: true, start: 1 })] });   // reversed: the head is the source end
    const tr = layer(trimLayer(r, "f", 0, 8, "start"), "f");
    expect(tr).toMatchObject({ start: 0, trimStart: 0, trimEnd: 5 });
  });

  test("photo layers: the length is trimEnd, by the photo rules", () => {
    expect(layer(trimLayer(p, "ph", 5, 4.5, "end"), "ph")).toEqual({ ...ph, trimStart: 0, trimEnd: 4.5 });
    expect(layer(trimLayer(p, "ph", 0, 0.01, "end"), "ph").trimEnd).toBe(0.5);
    expect(layer(trimLayer(p, "ph", 0, 500, "end"), "ph").trimEnd).toBe(60);
    const head = layer(trimLayer(p, "ph", 0, 1, "start"), "ph");
    expect(head).toMatchObject({ trimEnd: 1, start: 4 });
    expect(layer(trimLayer(p, "ph", 0, 30, "start"), "ph")).toMatchObject({ trimEnd: 5, start: 0 });   // cannot start before 0
  });

  test("refused: shorter than the layer minimum, unknown id, a main clip's id, non-finite, breaking the overlap rule", () => {
    expect(trimLayer(p, "v1", 0, 0.29, "end")).toBe(p);
    expect(layer(trimLayer(p, "v1", 0, 0.3, "end"), "v1").trimEnd).toBe(0.3);
    expect(trimLayer(p, "v1", 3, 2, "end")).toBe(p);
    expect(trimLayer(p, "zzz", 0, 1, "end")).toBe(p);
    expect(trimLayer(p, "a", 0, 1, "end")).toBe(p);
    for (const bad of [NaN, Infinity]) { expect(trimLayer(p, "v1", bad, 2, "end")).toBe(p); expect(trimLayer(p, "v1", 0, bad, "start")).toBe(p); }
    const x = makeProject({ clips: [a, b], layers: [makeLayer({ id: "x", sourceDuration: 6, trimEnd: 2, start: 0 }), makeLayer({ id: "y", sourceDuration: 3, start: 2 }), makeLayer({ id: "z", sourceDuration: 3, start: 2.5 })] });
    expect(trimLayer(x, "x", 0, 4, "end")).toBe(x);
  });
});

describe("deleteLayer / duplicateLayer / reorderLayer", () => {
  test("deleteLayer removes it; unknown or main-clip id → same project", () => {
    const next = deleteLayer(p, "ph");
    expectLayerOnly(next);
    expect(next.layers).toEqual([v1, v2]);
    expect(deleteLayer(p, "zzz")).toBe(p);
    expect(deleteLayer(p, "a")).toBe(p);
  });

  test("duplicateLayer: a deep copy with a new id that KEEPS the transform, right after the original in time and in the list", () => {
    const src = makeLayer({ id: "s", sourceDuration: 2, start: 1, opacity: 0.5, mask: "circle", keyframes: [makeKeyframe({ t: 0 })],
      transform: { scale: 0.7, x: 0.2, y: -0.1, rotation: 15, flipH: false, flipV: true } });
    const x = makeProject({ clips: [a], layers: [src, ph] });
    const next = duplicateLayer(x, "s");
    expectLayerOnly(next, x);
    expect(next.layers.map((l) => l.id)).toEqual(["s", "new-id", "ph"]);
    const copy = layer(next, "new-id");
    expect(copy).toEqual({ ...src, id: "new-id", start: 3 });
    for (const k of ["transform", "crop", "adjust", "animation", "keyframes", "background"] as const) expect(copy[k]).not.toBe(src[k]);
    expect(copy.keyframes[0]).not.toBe(src.keyframes[0]);
  });

  test("a copy of a layer with an awkward length never overlaps its original", () => {
    const x = makeProject({ clips: [a], layers: [makeLayer({ id: "s", sourceDuration: 10, speed: 3, start: 0 })] });   // 3.3333… s
    const next = duplicateLayer(x, "s");
    expect(layer(next, "new-id").start).toBeGreaterThanOrEqual(layerEnd(x.layers[0]));
    expect(videoLayerOverlap(next.layers)).toBe(1);
  });

  test("duplicateLayer refused: at the limit, where the overlap rule would break, unknown id", () => {
    const full = makeProject({ clips: [a], layers: Array.from({ length: LAYER_LIMITS.max }, (_, i) => photoLayer(`l${i}`, 0)) });
    expect(duplicateLayer(full, "l0")).toBe(full);
    const x = makeProject({ clips: [a, b], layers: [makeLayer({ id: "x", sourceDuration: 2, start: 0 }), makeLayer({ id: "y", sourceDuration: 3, start: 2 }), makeLayer({ id: "z", sourceDuration: 3, start: 2.5 })] });
    expect(duplicateLayer(x, "x")).toBe(x);
    expect(duplicateLayer(p, "zzz")).toBe(p);
  });

  test("reorderLayer swaps with the neighbour; same project at the ends", () => {
    const fwd = reorderLayer(p, "v1", "forward");
    expectLayerOnly(fwd);
    expect(fwd.layers).toEqual([ph, v1, v2]);
    expect(reorderLayer(p, "v2", "back").layers).toEqual([v1, v2, ph]);
    expect(reorderLayer(p, "v2", "forward")).toBe(p);
    expect(reorderLayer(p, "v1", "back")).toBe(p);
    expect(reorderLayer(p, "a", "forward")).toBe(p);
    expect(reorderLayer(p, "zzz", "back")).toBe(p);
  });

  test("deleteClip / duplicateClip with a layer id delegate to the layer ops", () => {
    expect(deleteClip(p, "ph").layers).toEqual([v1, v2]);
    expect(deleteClip(p, "ph").clips).toBe(p.clips);
    const dup = duplicateClip(p, "ph");
    expect(dup.clips).toBe(p.clips);
    expect(dup.layers.map((l) => l.id)).toEqual(["v1", "ph", "new-id", "v2"]);
    expect(layer(dup, "new-id").start).toBe(5);
  });
});

describe("per-clip ops on a layer id", () => {
  const cases: [string, (x: Project, id: string) => Project, (l: LayerClip) => void][] = [
    ["setClipTransform", (x, id) => setClipTransform(x, id, { x: 0.2, scale: 0.6 }), (l) => expect(l.transform).toMatchObject({ x: 0.2, scale: 0.6 })],
    ["rotateClip90", (x, id) => rotateClip90(x, id), (l) => expect(l.transform.rotation).toBe(90)],
    ["flipClip", (x, id) => flipClip(x, id, "h"), (l) => expect(l.transform.flipH).toBe(true)],
    ["fillClip", (x, id) => fillClip(setClipTransform(x, id, { scale: 0.4 }), id), (l) => expect(l.transform.scale).toBe(1)],
    ["resetClipTransform", (x, id) => resetClipTransform(setClipTransform(x, id, { scale: 0.4, x: 0.1 }), id), (l) => expect(l.transform).toMatchObject({ scale: 1, x: 0 })],
    ["editClipTransformAt", (x, id) => editClipTransformAt(x, id, 0, { y: 0.25 }), (l) => expect(l.transform.y).toBe(0.25)],
    ["setClipCrop", (x, id) => setClipCrop(x, id, { x: 0.1, y: 0.1, w: 0.5, h: 0.5 }), (l) => expect(l.crop).toEqual({ x: 0.1, y: 0.1, w: 0.5, h: 0.5 })],
    ["setClipFilter", (x, id) => setClipFilter(x, id, "mono"), (l) => expect(l.filter).toBe("mono")],
    ["setClipFilterIntensity", (x, id) => setClipFilterIntensity(x, id, 0.4), (l) => expect(l.filterIntensity).toBe(0.4)],
    ["setClipAdjust", (x, id) => setClipAdjust(x, id, { brightness: 0.3 }), (l) => expect(l.adjust.brightness).toBe(0.3)],
    ["resetClipAdjust", (x, id) => resetClipAdjust(setClipAdjust(x, id, { brightness: 0.3 }), id), (l) => expect(l.adjust.brightness).toBe(0)],
    ["setClipAnimation", (x, id) => setClipAnimation(x, id, { in: { id: "fade", duration: 0.5 } }), (l) => expect(l.animation.in).toEqual({ id: "fade", duration: 0.5 })],
    ["toggleClipKeyframe", (x, id) => toggleClipKeyframe(x, id, 1), (l) => expect(l.keyframes).toHaveLength(1)],
    ["setClipSpeed", (x, id) => setClipSpeed(x, id, 2), (l) => expect(l.speed).toBe(2)],
    ["setClipSpeedCurve", (x, id) => setClipSpeedCurve(x, id, "montage"), (l) => expect(l.speedCurve?.id).toBe("montage")],
    ["setClipVolume", (x, id) => setClipVolume(x, id, 0.5), (l) => expect(l.volume).toBe(0.5)],
    ["setClipMuted", (x, id) => setClipMuted(x, id, true), (l) => expect(l.muted).toBe(true)],
    ["setClipFade", (x, id) => setClipFade(x, id, { fadeIn: 1 }), (l) => expect(l.fadeIn).toBe(1)],
    ["setClipReversed", (x, id) => setClipReversed(x, id, true), (l) => expect(l.reversed).toBe(true)],
  ];

  test.each(cases)("%s edits the layer and nothing on the main track", (_name, run, check) => {
    const next = run(p, "v1");
    expectLayerOnly(next);
    const l = layer(next, "v1");
    check(l);
    expect(l.start).toBe(1);
    expect(l.transitionOut).toEqual({ type: "none", duration: 0 });
    expect(layer(next, "ph")).toBe(ph);
    expect(layer(next, "v2")).toBe(v2);
  });

  test.each(cases)("%s still edits a main clip, leaving the layers alone", (_name, run, check) => {
    const next = run(p, "a");
    expect(next.layers).toBe(p.layers);
    check({ ...next.clips[0], start: 0 });
  });

  test("a keyframed layer: placement edits write the pin at the playhead; fit needs the offset", () => {
    const keyed = toggleClipKeyframe(p, "v1", 1);
    expect(fitClip(keyed, "v1")).toBe(keyed);
    expect(fillClip(keyed, "v1")).toBe(keyed);
    const edited = editClipTransformAt(keyed, "v1", 1, { x: 0.3, opacity: 0.5 });
    expect(layer(edited, "v1").keyframes[0]).toMatchObject({ x: 0.3, opacity: 0.5 });
    expect(layer(fillClip(edited, "v1", 1), "v1").keyframes[0]).toMatchObject({ x: 0, scale: 1 });
    expect(layer(fitClip(setClipTransform(p, "v1", { scale: 0.4 }), "v1"), "v1").transform.scale).toBe(1);   // portrait in portrait: fit = 1
  });

  test("photo layers refuse what photos refuse", () => {
    expect(setClipSpeed(p, "ph", 2)).toBe(p);
    expect(setClipSpeedCurve(p, "ph", "montage")).toBe(p);
    expect(setClipVolume(p, "ph", 0.5)).toBe(p);
    expect(setClipMuted(p, "ph", false)).toBe(p);
    expect(setClipFade(p, "ph", { fadeIn: 1 })).toBe(p);
    expect(setClipReversed(p, "ph", true)).toBe(p);
  });

  test("a length change is refused when it would break the overlap rule or the layer minimum", () => {
    const x = makeProject({ clips: [a, b], layers: [
      makeLayer({ id: "x", sourceDuration: 4, speed: 2, start: 0 }),   // 0 – 2
      makeLayer({ id: "y", sourceDuration: 3, start: 2 }), makeLayer({ id: "z", sourceDuration: 3, start: 2.5 })] });
    expect(setClipSpeed(x, "x", 1)).toBe(x);                             // would run 0 – 4, over y and z
    expect(layer(setClipSpeed(x, "x", 4), "x").speed).toBe(4);
    expect(setClipSpeedCurve(x, "x", "montage")).toBe(x);                // speed 1 under a curve: longer than 2 s
    const short = makeProject({ clips: [a], layers: [makeLayer({ id: "s", sourceDuration: 1, start: 0 })] });
    expect(setClipSpeed(short, "s", 4)).toBe(short);                     // 0.25 s < the layer minimum
    expect(layer(setClipSpeed(short, "s", 3), "s").speed).toBe(3);
  });

  test("replaceClipMedia on a layer keeps the start (and no transition); refused when the overlap rule would break", () => {
    const next = replaceClipMedia(p, "v1", { sourceUri: "file:///new.mp4", sourceDuration: 2, width: 1920, height: 1080, kind: "video" });
    expectLayerOnly(next);
    expect(layer(next, "v1")).toMatchObject({ sourceUri: "file:///new.mp4", start: 1, trimStart: 0, trimEnd: 2, transitionOut: { type: "none", duration: 0 } });
    const x = makeProject({ clips: [a, b], layers: [photoLayer("i", 2), makeLayer({ id: "y", sourceDuration: 3, start: 2 }), makeLayer({ id: "z", sourceDuration: 3, start: 2.5 })] });
    expect(replaceClipMedia(x, "i", { sourceUri: "file:///v.mp4", sourceDuration: 9, width: 1080, height: 1920, kind: "video" })).toBe(x);
    const ok = replaceClipMedia(x, "y", { sourceUri: "file:///i.jpg", sourceDuration: 0, width: 1080, height: 1920, kind: "photo" });
    expect(layer(ok, "y")).toMatchObject({ kind: "photo", start: 2, trimEnd: 3 });
  });
});

describe("main-track ops ignore layers", () => {
  test("refused on a layer id", () => {
    expect(setTransition(p, "v1", { type: "fade", duration: 0.5 })).toBe(p);
    expect(setClipBackground(p, "v1", { type: "color", color: "#112233" } as never)).toBe(p);
    expect(moveClip(p, "v1", 0)).toBe(p);
    expect(trimClip(p, "v1", 0, 2)).toBe(p);
  });

  test("split and freeze act on the main clip under the playhead; the layers are untouched", () => {
    const split = splitClipAt(p, 3);
    expect(split.clips).toHaveLength(3);
    expect(split.layers).toBe(p.layers);
    const frozen = insertFreezeFrame(p, 3, { id: "still", sourceUri: "file:///s.jpg", width: 1080, height: 1920 });
    expect(frozen.clips).toHaveLength(4);
    expect(frozen.layers).toBe(p.layers);
  });

  test('"apply to all" ops change main clips only', () => {
    for (const next of [setFilterForAllClips(p, "mono"), setAdjustForAllClips(p, { ...a.adjust, brightness: 0.2 }),
      setAnimationForAllClips(p, { in: { id: "fade", duration: 0.5 }, out: null, combo: null }), setBackgroundForAllClips(p, { type: "blur" } as never)]) {
      expect(next).not.toBe(p);
      expect(next.layers).toBe(p.layers);
    }
  });

  test("layers keep their project time when main clips change — even one left past the project's end", () => {
    const next = deleteClip(p, "b");      // the project is now 6 s; v2 starts at 8
    expect(next.layers).toBe(p.layers);
    expect(layersAt(next, 8.5)).toEqual([]);
  });
});

describe("opacity and mask", () => {
  test("setClipOpacity: clips and layers, clamped to 0–1, 2 decimals", () => {
    expect(setClipOpacity(p, "a", 0.456).clips[0].opacity).toBe(0.46);
    expect(setClipOpacity(p, "a", 0.456).layers).toBe(p.layers);
    const next = setClipOpacity(p, "v1", 0.3);
    expectLayerOnly(next);
    expect(layer(next, "v1").opacity).toBe(0.3);
    expect(setClipOpacity(p, "ph", -2).layers[1].opacity).toBe(0);
    expect(setClipOpacity(setClipOpacity(p, "a", 0.2), "a", 7).clips[0].opacity).toBe(1);
  });

  test("setClipOpacity: same project for no change, an unknown id, a non-finite value", () => {
    expect(setClipOpacity(p, "a", 1)).toBe(p);
    expect(setClipOpacity(p, "a", 5)).toBe(p);
    expect(setClipOpacity(p, "zzz", 0.5)).toBe(p);
    for (const bad of [NaN, Infinity, -Infinity]) expect(setClipOpacity(p, "v1", bad)).toBe(p);
  });

  test("setClipMask: clips and layers; an unknown mask, id or no change → same project", () => {
    expect(setClipMask(p, "a", "circle").clips[0].mask).toBe("circle");
    const next = setClipMask(p, "ph", "rounded");
    expectLayerOnly(next);
    expect(layer(next, "ph").mask).toBe("rounded");
    expect(setClipMask(p, "a", "none")).toBe(p);
    expect(setClipMask(p, "a", "star" as never)).toBe(p);
    expect(setClipMask(p, "zzz", "circle")).toBe(p);
  });

  test("an opacity slider drag is one undo step", () => {
    const st = () => useEditorStore.getState();
    st().reset(); st().setProject(p);
    st().beginTransaction();
    for (const v of [0.8, 0.6, 0.4]) st().applyTransient((x) => setClipOpacity(x, "v1", v));
    expect(layer(st().project!, "v1").opacity).toBe(0.4);
    expect(st().past).toHaveLength(1);
    st().undo();
    expect(st().project).toBe(p);
    st().reset();
  });
});

test("a layer edit keeps the main clips' transitions and the effects exactly as they are", () => {
  const withCut = makeProject({ clips: [{ ...a, transitionOut: { type: "fade", duration: 0.5 } }, b], layers: [v1], effects: [makeEffect({ id: "e", start: 9, end: 10 })] });
  const next = setClipSpeed(withCut, "v1", 2);
  expect(clipDuration(layer(next, "v1"))).toBe(2);
  expect(next.clips).toBe(withCut.clips);
  expect(next.effects).toBe(withCut.effects);
});
