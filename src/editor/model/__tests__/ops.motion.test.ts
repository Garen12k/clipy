jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
import { useEditorStore } from "@/src/editor/store";
import { fitScale } from "../clipLayout";
import { clipBaseAt, overlayBaseAt, sampleKeyframes } from "../motion";
import { clipDuration } from "../timeline";
import {
  applyTemplate, clipKeyframeAt, duplicateClip, duplicateOverlay, editClipTransformAt, editOverlayAt, fillClip, fitClip, frameSize, insertFreezeFrame,
  moveOverlay, overlayKeyframeAt, replaceClipMedia, resetClipTransform, rotateClip90, setAnimationForAllClips, setClipAnimation, setClipTransform,
  setOverlayAnimation, splitClipAt, toggleClipKeyframe, toggleOverlayKeyframe, updateOverlayShared,
} from "../ops";
import { TEMPLATES } from "../../templates";
import {
  ANIM_LIMITS, clampClipKeyframes, clampOverlayKeyframes, DEFAULT_TRANSFORM, KEYFRAME_LIMITS, makeClip, makeKeyframe, makeOverlay, makePhotoClip, makeProject,
  makeSticker, NO_CLIP_ANIMATION, NO_OVERLAY_ANIMATION, type Clip, type Overlay, type Project,
} from "../types";

const kf = makeKeyframe;
const base = makeProject({
  clips: [makeClip({ id: "a", sourceDuration: 10 }), makeClip({ id: "b", sourceDuration: 10 })],
  overlays: [makeOverlay({ id: "t", start: 2, end: 6 }), makeSticker({ id: "s", start: 0, end: 4 }), makeOverlay({ id: "cap", kind: "caption", start: 0, end: 2 })],
});
const withClip = (patch: Partial<Clip>, p: Project = base): Project => ({ ...p, clips: p.clips.map((c) => (c.id === "a" ? { ...c, ...patch } : c)) });
const withOverlay = (id: string, patch: Partial<Overlay>, p: Project = base): Project =>
  ({ ...p, overlays: p.overlays.map((o) => (o.id === id ? ({ ...o, ...patch } as Overlay) : o)) });
const clip = (p: Project, id = "a") => p.clips.find((c) => c.id === id)!;
const ov = (p: Project, id: string) => p.overlays.find((o) => o.id === id)!;
const fade = { id: "fade" as const, duration: 0.5 };
const pop = { id: "pop" as const, duration: 0.3 };

describe("setClipAnimation", () => {
  test("setting an edge keeps the other edge and clamps the duration", () => {
    let p = setClipAnimation(base, "a", { in: { id: "fade", duration: 99 } });
    expect(clip(p).animation).toEqual({ in: { id: "fade", duration: ANIM_LIMITS.maxDuration }, out: null, combo: null });
    p = setClipAnimation(p, "a", { out: { id: "pop", duration: 0 } });
    expect(clip(p).animation).toEqual({ in: { id: "fade", duration: ANIM_LIMITS.maxDuration }, out: { id: "pop", duration: ANIM_LIMITS.minDuration }, combo: null });
    expect(clip(p, "b").animation).toEqual(NO_CLIP_ANIMATION);
  });
  test("combo clears both edges; an edge clears the combo", () => {
    const edged = withClip({ animation: { in: fade, out: pop, combo: null } });
    expect(clip(setClipAnimation(edged, "a", { combo: "sway" })).animation).toEqual({ in: null, out: null, combo: "sway" });
    const combo = withClip({ animation: { in: null, out: null, combo: "sway" } });
    expect(clip(setClipAnimation(combo, "a", { in: fade })).animation).toEqual({ in: fade, out: null, combo: null });
    expect(clip(setClipAnimation(combo, "a", { out: fade })).animation).toEqual({ in: null, out: fade, combo: null });
  });
  test("null clears only what it names", () => {
    const edged = withClip({ animation: { in: fade, out: pop, combo: null } });
    expect(setClipAnimation(edged, "a", { combo: null })).toBe(edged);
    expect(clip(setClipAnimation(edged, "a", { in: null })).animation).toEqual({ in: null, out: pop, combo: null });
    expect(clip(setClipAnimation(edged, "a", { out: null })).animation).toEqual({ in: fade, out: null, combo: null });
    const combo = withClip({ animation: { in: null, out: null, combo: "sway" } });
    expect(clip(setClipAnimation(combo, "a", { combo: null })).animation).toEqual(NO_CLIP_ANIMATION);
    expect(setClipAnimation(combo, "a", { in: null })).toBe(combo);
  });
  test("unchanged: same value, missing clip, empty patch, non-finite duration, unknown ids", () => {
    const edged = withClip({ animation: { in: fade, out: null, combo: null } });
    expect(setClipAnimation(edged, "a", { in: { ...fade } })).toBe(edged);
    expect(setClipAnimation(edged, "nope", { in: pop })).toBe(edged);
    expect(setClipAnimation(edged, "a", {})).toBe(edged);
    expect(setClipAnimation(edged, "a", { in: { id: "fade", duration: Number.NaN } })).toBe(edged);
    expect(setClipAnimation(edged, "a", { in: { id: "bogus", duration: 1 } as never })).toBe(edged);
    expect(setClipAnimation(edged, "a", { combo: "bogus" as never })).toBe(edged);
  });
  test("the stored edge is a copy of the patch", () => {
    const edge = { id: "fade" as const, duration: 0.5 };
    expect(clip(setClipAnimation(base, "a", { in: edge })).animation.in).not.toBe(edge);
  });
});

describe("setAnimationForAllClips", () => {
  test("every clip gets its own copy, clamped", () => {
    const a = { in: { id: "fade" as const, duration: 9 }, out: pop, combo: null };
    const p = setAnimationForAllClips(base, a);
    const want = { in: { id: "fade", duration: ANIM_LIMITS.maxDuration }, out: pop, combo: null };
    expect(clip(p, "a").animation).toEqual(want);
    expect(clip(p, "b").animation).toEqual(want);
    expect(clip(p, "a").animation).not.toBe(clip(p, "b").animation);
    expect(clip(p, "a").animation.in).not.toBe(clip(p, "b").animation.in);
    expect(clip(p, "a").animation.out).not.toBe(pop);
    expect(setAnimationForAllClips(p, a)).toBe(p);
  });
  test("bad input is refused: non-finite duration, unknown ids", () => {
    expect(setAnimationForAllClips(base, { in: { id: "fade", duration: Number.NaN }, out: null, combo: null })).toBe(base);
    expect(setAnimationForAllClips(base, { in: null, out: { id: "fade", duration: Number.POSITIVE_INFINITY }, combo: null })).toBe(base);
    expect(setAnimationForAllClips(base, { in: { id: "bogus", duration: 1 } as never, out: null, combo: null })).toBe(base);
    expect(setAnimationForAllClips(base, { in: null, out: null, combo: "bogus" as never })).toBe(base);
  });
  test("a combo wins over edges; untouched keyframes", () => {
    const keyed = withClip({ keyframes: [kf({ t: 1 })] });
    const p = setAnimationForAllClips(keyed, { in: fade, out: null, combo: "pulse" });
    expect(clip(p).animation).toEqual({ in: null, out: null, combo: "pulse" });
    expect(clip(p).keyframes).toBe(clip(keyed).keyframes);
  });
});

describe("setOverlayAnimation", () => {
  test("text and stickers: edges and loop are independent, durations clamped", () => {
    let p = setOverlayAnimation(base, "t", { in: { id: "pop", duration: 5 } });
    p = setOverlayAnimation(p, "t", { loop: "wiggle" });
    expect(ov(p, "t").animation).toEqual({ in: { id: "pop", duration: ANIM_LIMITS.maxDuration }, out: null, loop: "wiggle" });
    p = setOverlayAnimation(p, "t", { in: null });
    expect(ov(p, "t").animation).toEqual({ in: null, out: null, loop: "wiggle" });
    expect(ov(setOverlayAnimation(base, "s", { out: fade }), "s").animation).toEqual({ in: null, out: fade, loop: null });
  });
  test("captions are refused; no-ops return the same project", () => {
    expect(setOverlayAnimation(base, "cap", { in: fade })).toBe(base);
    expect(setOverlayAnimation(base, "nope", { in: fade })).toBe(base);
    expect(setOverlayAnimation(base, "t", { loop: null })).toBe(base);
    expect(setOverlayAnimation(base, "t", {})).toBe(base);
    expect(setOverlayAnimation(base, "t", { in: { id: "fade", duration: Number.POSITIVE_INFINITY } })).toBe(base);
    expect(setOverlayAnimation(base, "t", { loop: "bogus" as never })).toBe(base);
    expect(ov(base, "t").animation).toEqual(NO_OVERLAY_ANIMATION);
  });
});

describe("clipKeyframeAt", () => {
  const pins = [kf({ t: 1, x: 0.1 }), kf({ t: 2, x: 0.2 })];
  test("finds the pin within the gap, in source time", () => {
    const c = clip(withClip({ keyframes: pins }));
    expect(clipKeyframeAt(c, 1)).toBe(pins[0]);
    expect(clipKeyframeAt(c, 1.04)).toBe(pins[0]);
    expect(clipKeyframeAt(c, 1.05)).toBeNull();
    expect(clipKeyframeAt(c, 1.5)).toBeNull();
    expect(clipKeyframeAt(c, Number.NaN)).toBeNull();
    expect(clipKeyframeAt(clip(base), 1)).toBeNull();
  });
  test("speed, trim and reverse go through the timeline", () => {
    const fast = clip(withClip({ keyframes: pins, trimStart: 1, speed: 2 }));   // source 2 shows at offset 0.5
    expect(clipKeyframeAt(fast, 0.5)).toBe(pins[1]);
    expect(clipKeyframeAt(fast, 0)).toBe(pins[0]);
    const rev = clip(withClip({ keyframes: pins, reversed: true }));            // source 2 shows at offset 8
    expect(clipKeyframeAt(rev, 8)).toBe(pins[1]);
    expect(clipKeyframeAt(rev, 2)).toBeNull();
  });
  test("pins exactly minGap apart are distinct; the nearest wins", () => {
    const close = [kf({ t: 0.1 }), kf({ t: 0.15 })];
    const c = clip(withClip({ keyframes: close }));
    expect(clipKeyframeAt(c, 0.1)).toBe(close[0]);
    expect(clipKeyframeAt(c, 0.15)).toBe(close[1]);
    expect(clipKeyframeAt(c, 0.14)).toBe(close[1]);
  });
});

describe("toggleClipKeyframe", () => {
  test("adds a pin from the static transform (opacity 1)", () => {
    const p0 = setClipTransform(base, "a", { x: 0.2, y: -0.1, scale: 2, rotation: 30 });
    const p = toggleClipKeyframe(p0, "a", 3);
    expect(clip(p).keyframes).toEqual([{ t: 3, x: 0.2, y: -0.1, scale: 2, rotation: 30, opacity: 1 }]);
    expect(clip(p).transform).toBe(clip(p0).transform);
  });
  test("adds a pin equal to the interpolated base, in sorted position", () => {
    const keyed = withClip({ keyframes: [kf({ t: 1, x: 0, opacity: 0.2 }), kf({ t: 3, x: 0.8, scale: 2, rotation: 400, opacity: 1 })] });
    const want = clipBaseAt(clip(keyed), 1.5);
    const p = toggleClipKeyframe(keyed, "a", 1.5);
    expect(clip(p).keyframes.map((k) => k.t)).toEqual([1, 1.5, 3]);
    expect(clip(p).keyframes[1]).toEqual({ t: 1.5, ...want });
    expect(want.opacity).toBeGreaterThan(0.2);
    expect(clipBaseAt(clip(p), 1.5)).toEqual(want);
  });
  test("on a pin removes it; the others are untouched", () => {
    const pins = [kf({ t: 1, x: 0.1 }), kf({ t: 2, x: 0.2 })];
    const p = toggleClipKeyframe(withClip({ keyframes: pins }), "a", 2.03);
    expect(clip(p).keyframes).toEqual([pins[0]]);
    expect(clip(p).transform).toEqual(DEFAULT_TRANSFORM);
  });
  test("removing the last pin copies x / y / scale / rotation to the static transform, keeps flips, drops opacity", () => {
    const keyed = withClip({ transform: { ...DEFAULT_TRANSFORM, x: 0.9, flipH: true }, keyframes: [kf({ t: 1, x: 0.3, y: -0.2, scale: 1.5, rotation: 370, opacity: 0.4 })] });
    const p = toggleClipKeyframe(keyed, "a", 1);
    expect(clip(p).keyframes).toEqual([]);
    expect(clip(p).transform).toEqual({ x: 0.3, y: -0.2, scale: 1.5, rotation: 10, flipH: true, flipV: false });
  });
  test("the offset is clamped to the clip; speed and reverse use source time", () => {
    expect(clip(toggleClipKeyframe(base, "a", 99)).keyframes[0].t).toBe(10);
    expect(clip(toggleClipKeyframe(base, "a", -5)).keyframes[0].t).toBe(0);
    expect(clip(toggleClipKeyframe(withClip({ trimStart: 2, speed: 2 }), "a", 1)).keyframes[0].t).toBe(4);
    expect(clip(toggleClipKeyframe(withClip({ reversed: true }), "a", 1)).keyframes[0].t).toBe(9);
    const photo = makeProject({ clips: [makePhotoClip({ id: "a", seconds: 3 })] });
    expect(clip(toggleClipKeyframe(photo, "a", 1.25)).keyframes[0].t).toBe(1.25);
  });
  test("unchanged: missing clip, non-finite offset, already max pins", () => {
    expect(toggleClipKeyframe(base, "nope", 1)).toBe(base);
    expect(toggleClipKeyframe(base, "a", Number.NaN)).toBe(base);
    const full = withClip({ sourceDuration: 100, trimEnd: 100, keyframes: Array.from({ length: KEYFRAME_LIMITS.max }, (_, i) => kf({ t: i })) });
    expect(toggleClipKeyframe(full, "a", 60.5)).toBe(full);
    expect(clip(toggleClipKeyframe(full, "a", 10)).keyframes).toHaveLength(KEYFRAME_LIMITS.max - 1);   // removing still works
  });
  test("what it stores survives the sanity pass unchanged", () => {
    let p = base;
    for (const at of [0.1, 0.15, 0.2, 3, 3.05]) p = toggleClipKeyframe(p, "a", at);
    expect(clip(p).keyframes).toHaveLength(5);
    expect(clampClipKeyframes(clip(p).keyframes)).toEqual(clip(p).keyframes);
  });
});

describe("editClipTransformAt", () => {
  test("no keyframes: exactly setClipTransform, opacity ignored", () => {
    const patch = { x: 0.4, scale: 9, rotation: 200 };
    expect(editClipTransformAt(base, "a", 1, patch)).toEqual(setClipTransform(base, "a", patch));
    expect(clip(editClipTransformAt(base, "a", 1, { ...patch, opacity: 0.2 })).keyframes).toEqual([]);
    expect(editClipTransformAt(base, "a", 1, { opacity: 0.2 })).toBe(base);
    expect(editClipTransformAt(base, "a", 1, {})).toBe(base);
  });
  test("keyframes, off a pin: adds one that starts from the interpolated base", () => {
    const keyed = withClip({ keyframes: [kf({ t: 1, x: 0, scale: 1 }), kf({ t: 3, x: 0.8, scale: 2 })] });
    const from = clipBaseAt(clip(keyed), 2);
    const p = editClipTransformAt(keyed, "a", 2, { y: 0.5 });
    expect(clip(p).keyframes).toHaveLength(3);
    expect(clip(p).keyframes[1]).toEqual({ t: 2, ...from, y: 0.5 });
    expect(clip(p).transform).toBe(clip(keyed).transform);
  });
  test("keyframes, on a pin: patches it and keeps its time and neighbours", () => {
    const pins = [kf({ t: 1 }), kf({ t: 1.05, x: 0.3 }), kf({ t: 3 })];
    const keyed = withClip({ keyframes: pins });
    const p = editClipTransformAt(keyed, "a", 1.07, { x: 0.6, opacity: 0.5 });
    expect(clip(p).keyframes).toEqual([pins[0], { ...pins[1], x: 0.6, opacity: 0.5 }, pins[2]]);
    expect(clip(p).keyframes[0]).toBe(pins[0]);
  });
  test("an empty patch adds no pin", () => {
    const keyed = withClip({ keyframes: [kf({ t: 1 }), kf({ t: 3, x: 0.8 })] });
    expect(editClipTransformAt(keyed, "a", 2, {})).toBe(keyed);
    expect(editClipTransformAt(keyed, "a", 2, { x: undefined })).toBe(keyed);
    expect(editClipTransformAt(keyed, "a", 1, {})).toBe(keyed);
  });
  test("reversed clip at speed 2 with a trim: the pin lands at the mirrored source time", () => {
    const rev = withClip({ trimStart: 2, trimEnd: 10, speed: 2, reversed: true, keyframes: [kf({ t: 3, x: 0.2 })] });   // 4 s long; offset 1 shows source 8
    const p = editClipTransformAt(rev, "a", 1, { x: 0.5 });
    expect(clip(p).keyframes).toEqual([kf({ t: 3, x: 0.2 }), kf({ t: 8, x: 0.5 })]);
    expect(clipKeyframeAt(clip(p), 1)).toBe(clip(p).keyframes[1]);
    expect(clipKeyframeAt(clip(p), 3.5)).toBe(clip(p).keyframes[0]);   // source 3 shows at (10 − 3) / 2
    expect(clipBaseAt(clip(p), 1).x).toBe(0.5);
    const again = editClipTransformAt(p, "a", 1.01, { x: 0.6 });       // 0.02 s of source away: the same pin
    expect(clip(again).keyframes.map((k) => [k.t, k.x])).toEqual([[3, 0.2], [8, 0.6]]);
  });
  test("values are clamped like the sanity pass; rotation is not normalised", () => {
    const keyed = withClip({ keyframes: [kf({ t: 1 })] });
    const p = editClipTransformAt(keyed, "a", 1, { x: 7, y: -7, scale: 100, rotation: 725, opacity: 3 });
    expect(clip(p).keyframes).toEqual(clampClipKeyframes([{ t: 1, x: 7, y: -7, scale: 100, rotation: 725, opacity: 3 }]));
    expect(clip(p).keyframes[0].rotation).toBe(725);
  });
  test("unchanged: same values, non-finite input, missing clip, max pins", () => {
    const keyed = withClip({ keyframes: [kf({ t: 1, x: 0.3 })] });
    expect(editClipTransformAt(keyed, "a", 1, { x: 0.3 })).toBe(keyed);
    expect(editClipTransformAt(keyed, "a", 1, { x: Number.NaN })).toBe(keyed);
    expect(editClipTransformAt(keyed, "a", Number.NaN, { x: 0.5 })).toBe(keyed);
    expect(editClipTransformAt(base, "a", 1, { x: Number.POSITIVE_INFINITY })).toBe(base);
    expect(editClipTransformAt(keyed, "nope", 1, { x: 0.5 })).toBe(keyed);
    const full = withClip({ sourceDuration: 100, trimEnd: 100, keyframes: Array.from({ length: KEYFRAME_LIMITS.max }, (_, i) => kf({ t: i })) });
    expect(editClipTransformAt(full, "a", 60.5, { x: 0.5 })).toBe(full);
    expect(clip(editClipTransformAt(full, "a", 10, { x: 0.5 })).keyframes[10].x).toBe(0.5);
  });
  test("one gesture = one undo step and one pin", () => {
    const store = useEditorStore.getState();
    store.reset();
    const keyed = withClip({ keyframes: [kf({ t: 1 })] });
    store.setProject(keyed);
    store.beginTransaction();
    for (const x of [0.1, 0.2, 0.3]) useEditorStore.getState().applyTransient((p) => editClipTransformAt(p, "a", 4, { x }));
    const s = useEditorStore.getState();
    expect(s.past).toHaveLength(1);
    expect(clip(s.project!).keyframes).toEqual([kf({ t: 1 }), kf({ t: 4, x: 0.3 })]);
    s.undo();
    expect(useEditorStore.getState().project).toEqual(keyed);
    expect(useEditorStore.getState().past).toHaveLength(0);
    store.reset();
  });
});

describe("existing clip ops with keyframes", () => {
  const pins = [kf({ t: 1, x: 0.4, y: 0.2, scale: 2, rotation: 350, opacity: 0.5 }), kf({ t: 3, rotation: 720 })];
  const keyed = withClip({ width: 1920, height: 1080, keyframes: pins, transform: { ...DEFAULT_TRANSFORM, x: 0.7, rotation: 135 } });

  test("rotateClip90: static +90 normalised, every pin +90 not normalised", () => {
    const p = rotateClip90(keyed, "a");
    expect(clip(p).transform.rotation).toBe(-135);
    expect(clip(p).keyframes.map((k) => k.rotation)).toEqual([440, 810]);
    expect(clip(p).keyframes[0]).toEqual({ ...pins[0], rotation: 440 });
    expect(clip(rotateClip90(base, "a")).keyframes).toBe(clip(base).keyframes);
  });
  test("fit / fill / reset with keyframes and an offset write the pin at the playhead", () => {
    const { width, height } = frameSize(keyed);
    const fit = clip(fitClip(keyed, "a", 1));
    expect(fit.keyframes[0]).toEqual({ ...pins[0], x: 0, y: 0, scale: fitScale(clip(keyed), clip(keyed).crop, 350, width, height) });
    expect(fit.transform).toBe(clip(keyed).transform);
    expect(clip(fillClip(keyed, "a", 1)).keyframes[0]).toEqual({ ...pins[0], x: 0, y: 0, scale: 1 });
    expect(clip(resetClipTransform(keyed, "a", 1)).keyframes[0]).toEqual({ t: 1, x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 });
    const added = clip(fillClip(keyed, "a", 2));
    expect(added.keyframes.map((k) => k.t)).toEqual([1, 2, 3]);
    expect(added.keyframes[1]).toMatchObject({ x: 0, y: 0, scale: 1 });
  });
  test("fit / fill / reset with keyframes and no offset leave the project alone", () => {
    expect(fitClip(keyed, "a")).toBe(keyed);
    expect(fillClip(keyed, "a")).toBe(keyed);
    expect(resetClipTransform(keyed, "a")).toBe(keyed);
  });
  test("fit / fill / reset without keyframes ignore the offset", () => {
    const moved = setClipTransform(withClip({ width: 1920, height: 1080 }), "a", { x: 0.3, scale: 2, flipH: true });
    expect(fitClip(moved, "a", 2)).toEqual(fitClip(moved, "a"));
    expect(fillClip(moved, "a", 2)).toEqual(fillClip(moved, "a"));
    expect(resetClipTransform(moved, "a", 2)).toEqual(resetClipTransform(moved, "a"));
    expect(clip(resetClipTransform(moved, "a", 2)).transform).toEqual(DEFAULT_TRANSFORM);
  });
});

describe("split / duplicate / replace / freeze / template", () => {
  const pins = [kf({ t: 1, x: 0.4 }), kf({ t: 6, x: -0.4 })];
  const moving = withClip({ animation: { in: fade, out: pop, combo: null }, keyframes: pins });

  test("split: left keeps In, right keeps Out, both keep every pin in separate arrays", () => {
    const p = splitClipAt(moving, 4);
    const [l, r] = p.clips;
    expect(l.animation).toEqual({ in: fade, out: null, combo: null });
    expect(r.animation).toEqual({ in: null, out: pop, combo: null });
    expect(l.keyframes).toEqual(pins);
    expect(r.keyframes).toEqual(pins);
    expect(r.keyframes).not.toBe(l.keyframes);
    expect(r.keyframes[0]).not.toBe(l.keyframes[0]);
    expect(r.animation).not.toBe(l.animation);
    expect(r.animation.out).not.toBe(pop);
  });
  test("split: a combo stays on both halves; photos follow the same rule", () => {
    const p = splitClipAt(withClip({ animation: { in: null, out: null, combo: "sway" } }), 4);
    expect(p.clips[0].animation).toEqual({ in: null, out: null, combo: "sway" });
    expect(p.clips[1].animation).toEqual({ in: null, out: null, combo: "sway" });
    expect(p.clips[1].animation).not.toBe(p.clips[0].animation);
    const photo = makeProject({ clips: [makePhotoClip({ id: "a", seconds: 4, animation: { in: fade, out: pop, combo: null } })] });
    const q = splitClipAt(photo, 2);
    expect(q.clips[0].animation).toEqual({ in: fade, out: null, combo: null });
    expect(q.clips[1].animation).toEqual({ in: null, out: pop, combo: null });
    expect(q.clips[1].keyframes).toEqual([]);
  });
  test("split photo: the right half restarts at 0, so its pins are rebased and the motion is continuous at the cut", () => {
    const ppins = [kf({ t: 0, x: 0 }), kf({ t: 4, x: 1 })];
    const photo = makeProject({ clips: [makePhotoClip({ id: "a", seconds: 4, keyframes: ppins })] });
    const [l, r] = splitClipAt(photo, 2).clips;
    expect(l.keyframes).toEqual(ppins);                         // the pin after the cut still shapes the left half
    expect(r.keyframes).not.toBe(l.keyframes);
    expect(r.keyframes.map((k) => k.t)).toEqual([0, 2]);
    expect(clipBaseAt(l, clipDuration(l)).x).toBe(0.5);
    expect(clipBaseAt(r, 0)).toEqual(clipBaseAt(l, clipDuration(l)));
    expect(clipBaseAt(r, clipDuration(r)).x).toBe(1);
    expect(clampClipKeyframes(r.keyframes)).toEqual(r.keyframes);
    const split = (keyframes: ReturnType<typeof kf>[], at: number) =>
      splitClipAt(makeProject({ clips: [makePhotoClip({ id: "a", seconds: 4, keyframes })] }), at).clips[1].keyframes;
    // Several pins before the cut become one; no pin before the cut: only shifted; every pin before the cut: one pin with the last value.
    expect(split([kf({ t: 0, x: 0 }), kf({ t: 1, x: 0.1 }), kf({ t: 4, x: 1 })], 2).map((k) => k.t)).toEqual([0, 2]);
    expect(split([kf({ t: 2, x: 0.2 }), kf({ t: 3, x: 0.3 })], 2)).toEqual([kf({ t: 0, x: 0.2 }), kf({ t: 1, x: 0.3 })]);
    expect(split([kf({ t: 0.5, x: 0.2 }), kf({ t: 1, x: 0.3 })], 2)).toEqual([kf({ t: 0, x: 0.3 })]);
  });
  test("duplicateClip deep-copies animation and keyframes", () => {
    const p = duplicateClip(moving, "a");
    const [src, copy] = p.clips;
    expect(copy.animation).toEqual(src.animation);
    expect(copy.keyframes).toEqual(src.keyframes);
    expect(copy.animation).not.toBe(src.animation);
    expect(copy.animation.in).not.toBe(src.animation.in);
    expect(copy.animation.out).not.toBe(src.animation.out);
    expect(copy.keyframes).not.toBe(src.keyframes);
    expect(copy.keyframes[0]).not.toBe(src.keyframes[0]);
  });
  test("duplicateOverlay deep-copies animation and keyframes; the pins get the copy's offset, clamped", () => {
    const opins = [kf({ t: 0, x: 0.2, y: 0.2 }), kf({ t: 1, x: 0.6, y: 0.6 })];
    const src0 = withOverlay("s", { animation: { in: fade, out: null, loop: "spin" }, keyframes: opins });
    const p = duplicateOverlay(src0, "s");
    const src = ov(p, "s");
    const copy = p.overlays[p.overlays.indexOf(src) + 1];
    expect(copy.animation).toEqual(src.animation);
    expect(src.keyframes).toEqual(opins);
    expect(copy.keyframes.map((k) => k.t)).toEqual([0, 1]);
    expect(copy.keyframes[0]).toMatchObject({ x: expect.closeTo(0.23, 9), y: expect.closeTo(0.23, 9), scale: 1, rotation: 0, opacity: 1 });
    expect(copy.keyframes[1]).toMatchObject({ x: expect.closeTo(0.63, 9), y: expect.closeTo(0.63, 9) });
    expect(copy.x - src.x).toBeCloseTo(copy.keyframes[0].x - src.keyframes[0].x, 9);   // the same offset as the static placement
    const edge = duplicateOverlay(withOverlay("s", { keyframes: [kf({ t: 0, x: 0.99, y: 1 })] }), "s");
    expect(edge.overlays[edge.overlays.findIndex((o) => o.id === "s") + 1].keyframes).toEqual([kf({ t: 0, x: 1, y: 1 })]);
    expect(copy.animation).not.toBe(src.animation);
    expect(copy.animation.in).not.toBe(src.animation.in);
    expect(copy.keyframes).not.toBe(src.keyframes);
    expect(copy.keyframes[0]).not.toBe(src.keyframes[0]);
  });
  test("replaceClipMedia clears keyframes and keeps the animation", () => {
    const p = replaceClipMedia(moving, "a", { sourceUri: "file:///new.mp4", sourceDuration: 20, width: 720, height: 1280, kind: "video" });
    expect(clip(p).keyframes).toEqual([]);
    expect(clip(p).animation).toEqual({ in: fade, out: pop, combo: null });
    const q = replaceClipMedia(moving, "a", { sourceUri: "file:///new.jpg", sourceDuration: 0, width: 720, height: 1280, kind: "photo" });
    expect(clip(q).keyframes).toEqual([]);
    expect(clip(q).animation).toEqual({ in: fade, out: pop, combo: null });
  });
  test("replaceClipMedia keeps the placement shown at the clip's first frame (flips kept, opacity dropped)", () => {
    const tf = { scale: 1, x: 0.9, y: 0.9, rotation: 10, flipH: true, flipV: false };
    const keyedPins = [kf({ t: 2, x: 0.4, y: -0.2, scale: 2, rotation: 450, opacity: 0.3 }), kf({ t: 6, x: -0.4 })];
    const media = { sourceUri: "file:///new.mp4", sourceDuration: 20, width: 720, height: 1280, kind: "video" as const };
    const p = replaceClipMedia(withClip({ transform: tf, keyframes: keyedPins }), "a", media);
    expect(clip(p).transform).toEqual({ scale: 2, x: 0.4, y: -0.2, rotation: 90, flipH: true, flipV: false });
    expect(clip(p).keyframes).toEqual([]);
    // Trimmed into the pins: the first frame shows the interpolated value.
    const trimmed = withClip({ transform: tf, keyframes: keyedPins, trimStart: 4, trimEnd: 8 });
    const at = clipBaseAt(clip(trimmed), 0);
    expect(clip(replaceClipMedia(trimmed, "a", media)).transform).toMatchObject({ x: at.x, y: at.y, scale: at.scale, flipH: true });
    // A reversed clip starts on its LAST source moment.
    const rev = withClip({ transform: tf, keyframes: keyedPins, reversed: true });
    expect(clip(replaceClipMedia(rev, "a", media)).transform).toMatchObject({ x: -0.4, y: 0, scale: 1, rotation: 0 });
    // Without pins the static transform is untouched.
    expect(clip(replaceClipMedia(withClip({ transform: tf }), "a", media)).transform).toEqual(tf);
  });
  test("freeze frame of a keyframed clip: the still shows the placement at the freeze moment (flips kept, opacity dropped)", () => {
    const tf = { scale: 1, x: 0.9, y: 0.9, rotation: 10, flipH: true, flipV: true };
    const src = withClip({ transform: tf, keyframes: [kf({ t: 2, x: 0.4, y: -0.2, scale: 2, rotation: 400, opacity: 0.3 }), kf({ t: 6, x: -0.4 })] });
    const at = clipBaseAt(clip(src), 4);
    expect(at.x).toBeCloseTo(0, 9);
    const p = insertFreezeFrame(src, 4, { id: "still", sourceUri: "file:///still.jpg", width: 1080, height: 1920 });
    const still = p.clips[1];
    expect(still.transform).toEqual({ scale: at.scale, x: at.x, y: at.y, rotation: 200 - 360, flipH: true, flipV: true });
    expect(still.keyframes).toEqual([]);
    // Without pins the still copies the static transform, as before.
    const plain = insertFreezeFrame(withClip({ transform: tf }), 4, { id: "still", sourceUri: "file:///still.jpg", width: 1080, height: 1920 });
    expect(plain.clips[1].transform).toEqual(tf);
    expect(plain.clips[1].transform).not.toBe(tf);
  });
  test("freeze frame: the still has no animation and no keyframes; the halves follow the split rule", () => {
    const p = insertFreezeFrame(moving, 4, { id: "still", sourceUri: "file:///still.jpg", width: 1080, height: 1920 });
    const [l, still, r] = p.clips;
    expect(still.id).toBe("still");
    expect(still.animation).toEqual(NO_CLIP_ANIMATION);
    expect(still.keyframes).toEqual([]);
    expect(l.animation).toEqual({ in: fade, out: null, combo: null });
    expect(r.animation).toEqual({ in: null, out: pop, combo: null });
    expect(l.keyframes).toEqual(pins);
    expect(r.keyframes).toEqual(pins);
  });
  test("applyTemplate leaves animations and keyframes alone", () => {
    const start = withOverlay("t", { animation: { in: fade, out: null, loop: "float" }, keyframes: [kf({ t: 0, x: 0.3, y: 0.3 })] }, moving);
    const p = applyTemplate(start, Object.values(TEMPLATES)[0], "project", null);
    expect(p).not.toBe(start);
    expect(clip(p).animation).toEqual(clip(start).animation);
    expect(clip(p).keyframes).toEqual(pins);
    expect(clip(p, "b").animation).toEqual(NO_CLIP_ANIMATION);
    expect(ov(p, "t").animation).toEqual(ov(start, "t").animation);
    expect(ov(p, "t").keyframes).toEqual(ov(start, "t").keyframes);
  });
});

describe("overlay keyframes", () => {
  const opins = [kf({ t: 0, x: 0.2, y: 0.2 }), kf({ t: 2, x: 0.8, y: 0.6, scale: 2, rotation: 90, opacity: 0.5 })];
  const keyed = withOverlay("t", { keyframes: opins });   // t lives 2…6

  test("overlayKeyframeAt: project time, relative to the start, clamped to the overlay's life", () => {
    expect(overlayKeyframeAt(ov(keyed, "t"), 2)).toBe(opins[0]);
    expect(overlayKeyframeAt(ov(keyed, "t"), 4.04)).toBe(opins[1]);
    expect(overlayKeyframeAt(ov(keyed, "t"), 4.05)).toBeNull();
    expect(overlayKeyframeAt(ov(keyed, "t"), 0)).toBe(opins[0]);          // before the start → t = 0
    expect(overlayKeyframeAt(ov(keyed, "t"), Number.NaN)).toBeNull();
    expect(overlayKeyframeAt(ov(base, "t"), 2)).toBeNull();
  });
  test("toggle adds from the static placement, then from the interpolated base", () => {
    const placed = withOverlay("s", { x: 0.3, y: 0.7, scale: 1.5, rotation: 20 });
    const p = toggleOverlayKeyframe(placed, "s", 1);
    expect(ov(p, "s").keyframes).toEqual([{ t: 1, x: 0.3, y: 0.7, scale: 1.5, rotation: 20, opacity: 1 }]);
    const want = overlayBaseAt(ov(keyed, "t"), 3);
    const q = toggleOverlayKeyframe(keyed, "t", 3);
    expect(ov(q, "t").keyframes.map((k) => k.t)).toEqual([0, 1, 2]);
    expect(ov(q, "t").keyframes[1]).toEqual({ t: 1, ...want });
  });
  test("toggle on a pin removes it; the last one restores the static placement", () => {
    const p = toggleOverlayKeyframe(keyed, "t", 2);
    expect(ov(p, "t").keyframes).toEqual([opins[1]]);
    expect(ov(p, "t")).toMatchObject({ x: 0.5, y: 0.5, scale: 1, rotation: 0 });
    const q = toggleOverlayKeyframe(p, "t", 4);
    expect(ov(q, "t").keyframes).toEqual([]);
    expect(ov(q, "t")).toMatchObject({ x: 0.8, y: 0.6, scale: 2, rotation: 90 });
    expect(ov(q, "t")).not.toHaveProperty("opacity");
  });
  test("toggle: the time is clamped to the overlay's life; captions, unknown ids, non-finite and max are refused", () => {
    expect(ov(toggleOverlayKeyframe(base, "t", 99), "t").keyframes[0].t).toBe(4);
    expect(ov(toggleOverlayKeyframe(base, "t", 0), "t").keyframes[0].t).toBe(0);
    expect(toggleOverlayKeyframe(base, "cap", 1)).toBe(base);
    expect(toggleOverlayKeyframe(base, "nope", 1)).toBe(base);
    expect(toggleOverlayKeyframe(base, "t", Number.NaN)).toBe(base);
    const long = makeProject({ clips: [makeClip({ id: "a", sourceDuration: 100 })],
      overlays: [makeSticker({ id: "s", start: 0, end: 100, keyframes: Array.from({ length: KEYFRAME_LIMITS.max }, (_, i) => kf({ t: i, x: 0.5, y: 0.5 })) })] });
    expect(toggleOverlayKeyframe(long, "s", 60.5)).toBe(long);
    expect(editOverlayAt(long, "s", 60.5, { x: 0.1 })).toBe(long);
  });
  test("editOverlayAt without keyframes is the existing shared update; opacity ignored", () => {
    const patch = { x: 0.9, y: 7, scale: 100, rotation: 45 };
    expect(editOverlayAt(base, "t", 3, patch)).toEqual(updateOverlayShared(base, "t", patch));
    expect(editOverlayAt(base, "s", 3, { ...patch, opacity: 0.2 })).toEqual(updateOverlayShared(base, "s", patch));
    expect(ov(editOverlayAt(base, "t", 3, patch), "t").keyframes).toEqual([]);
    expect(editOverlayAt(base, "t", 3, { opacity: 0.2 })).toBe(base);
    expect(editOverlayAt(base, "t", 3, {})).toBe(base);
  });
  test("editOverlayAt with keyframes upserts the pin at (time − start)", () => {
    const p = editOverlayAt(keyed, "t", 4.02, { x: 0.1, opacity: 1 });
    expect(ov(p, "t").keyframes).toEqual([opins[0], { ...opins[1], x: 0.1, opacity: 1 }]);
    expect(ov(p, "t").x).toBe(0.5);
    const from = overlayBaseAt(ov(keyed, "t"), 3);
    const q = editOverlayAt(keyed, "t", 3, { rotation: 500, x: 5, scale: 0 });
    expect(ov(q, "t").keyframes).toHaveLength(3);
    expect(ov(q, "t").keyframes[1]).toEqual(clampOverlayKeyframes([{ t: 1, ...from, rotation: 500, x: 5, scale: 0 }])[0]);
    expect(ov(q, "t").keyframes[1].rotation).toBe(500);
  });
  test("editOverlayAt unchanged: captions, unknown ids, same values, non-finite", () => {
    expect(editOverlayAt(base, "cap", 1, { x: 0.1 })).toBe(base);
    expect(editOverlayAt(base, "nope", 1, { x: 0.1 })).toBe(base);
    expect(editOverlayAt(keyed, "t", 2, { x: 0.2 })).toBe(keyed);
    expect(editOverlayAt(keyed, "t", 3, {})).toBe(keyed);   // off a pin: an empty patch adds nothing
    expect(editOverlayAt(keyed, "t", 2, { x: Number.NaN })).toBe(keyed);
    expect(editOverlayAt(keyed, "t", Number.NaN, { x: 0.3 })).toBe(keyed);
    expect(editOverlayAt(base, "t", 2, { x: Number.NaN })).toBe(base);
  });
  test("moveOverlay keeps the pins (they are relative to the start)", () => {
    const p = moveOverlay(keyed, "t", 5);
    expect(ov(p, "t")).toMatchObject({ start: 5, end: 9 });
    expect(ov(p, "t").keyframes).toBe(opins);
  });
  test("trimming the start shifts the pins so they stay at the same project time", () => {
    const later = withOverlay("t", { keyframes: [kf({ t: 1, x: 0.2, y: 0.2 }), kf({ t: 3, x: 0.8, y: 0.8 })] });
    const p = updateOverlayShared(later, "t", { start: 2.5 });
    expect(ov(p, "t").keyframes).toEqual([kf({ t: 0.5, x: 0.2, y: 0.2 }), kf({ t: 2.5, x: 0.8, y: 0.8 })]);
    const back = updateOverlayShared(p, "t", { start: 1 });
    expect(ov(back, "t").keyframes).toEqual([kf({ t: 2, x: 0.2, y: 0.2 }), kf({ t: 4, x: 0.8, y: 0.8 })]);
    const end = updateOverlayShared(later, "t", { end: 5 });
    expect(ov(end, "t").keyframes).toBe(ov(later, "t").keyframes);
    const place = updateOverlayShared(later, "t", { x: 0.1 });
    expect(ov(place, "t").keyframes).toBe(ov(later, "t").keyframes);
  });
  test("a pin trimmed before the start lands on t = 0 and the result survives the sanity pass", () => {
    const later = withOverlay("t", { keyframes: [kf({ t: 0, x: 0.1, y: 0.1 }), kf({ t: 1, x: 0.2, y: 0.2 }), kf({ t: 3, x: 0.8, y: 0.8 })] });
    const p = updateOverlayShared(later, "t", { start: 4 });   // shift −2: pins at −2, −1, 1
    const got = ov(p, "t").keyframes;
    // The pins before the new start become ONE pin at 0 holding the value that was showing there (half way from 0.2 to 0.8).
    expect(got).toEqual([kf({ t: 0, x: expect.closeTo(0.5, 9), y: expect.closeTo(0.5, 9) }), kf({ t: 1, x: 0.8, y: 0.8 })]);
    expect(clampOverlayKeyframes(got)).toEqual(got);
  });

  describe("dragging the start handle past a pin", () => {
    const pins = [kf({ t: 0, x: 0.1 }), kf({ t: 1, x: 0.9 }), kf({ t: 4, x: 0.5 })];
    const long = withOverlay("t", { start: 0, end: 6, keyframes: pins });
    const want = sampleKeyframes(pins, 1.5)!;
    const from = { start: 0, keyframes: pins };   // what the pill snapshots when the drag starts

    test("one step: the head pin is the value that was showing at the new start", () => {
      const got = ov(updateOverlayShared(long, "t", { start: 1.5 }), "t");
      expect(got.start).toBe(1.5);
      expect(got.keyframes).toEqual([{ t: 0, ...want }, kf({ t: 2.5, x: 0.5 })]);
      expect(want.x).toBeLessThan(0.9);
      expect(want.x).toBeGreaterThan(0.5);
    });
    test("in 17 ms steps (each applied to the already-changed project) the result is the same as one step", () => {
      let p = long;
      for (let s = 0.017; s < 1.5; s += 0.017) p = updateOverlayShared(p, "t", { start: s }, from);
      p = updateOverlayShared(p, "t", { start: 1.5 }, from);
      const got = ov(p, "t").keyframes;
      expect(got).toHaveLength(2);
      expect(got[0].t).toBe(0);
      expect(got[0].x).toBeCloseTo(want.x, 9);
      expect(got[1]).toEqual(kf({ t: 2.5, x: 0.5 }));
      expect(got).toEqual(ov(updateOverlayShared(long, "t", { start: 1.5 }), "t").keyframes);
      expect(clampOverlayKeyframes(got)).toEqual(got);
    });
    test("dragging back within the same gesture brings the pins back", () => {
      let p = updateOverlayShared(long, "t", { start: 1.5 }, from);
      p = updateOverlayShared(p, "t", { start: 0.5 }, from);
      expect(ov(p, "t").keyframes).toEqual([{ t: 0, ...sampleKeyframes(pins, 0.5)! }, kf({ t: 0.5, x: 0.9 }), kf({ t: 3.5, x: 0.5 })]);
      p = updateOverlayShared(p, "t", { start: 0 }, from);
      expect(ov(p, "t").keyframes).toEqual(pins);
    });
    test("a snapshot is only used by a start trim", () => {
      const p = updateOverlayShared(long, "t", { end: 5 }, from);
      expect(ov(p, "t").keyframes).toBe(ov(long, "t").keyframes);
    });
  });
});
