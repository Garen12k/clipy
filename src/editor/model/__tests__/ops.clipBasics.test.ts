jest.mock("@/src/lib/id", () => ({ newId: jest.fn(() => "new-id") }));
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
import { clampNum, DEFAULT_TRANSFORM, makeClip, makePhotoClip, makeProject, newPhotoClip, PHOTO } from "../types";
import { clipDuration } from "../timeline";
import {
  duplicateClip, fillClip, fitClip, flipClip, frameSize, resetClipTransform, rotateClip90, setBackgroundForAllClips, setClipBackground, setClipCrop,
  setClipMuted, setClipReversed, setClipSpeed, setClipTransform, setClipVolume, splitClipAt, trimClip,
} from "../ops";
import { useEditorStore } from "../../store";

const land = makeClip({ id: "land", sourceDuration: 4, width: 1920, height: 1080 });
const vid = makeClip({ id: "v", sourceDuration: 4 });
const photo = makePhotoClip({ id: "ph", seconds: 3 });
const p = makeProject({ clips: [land, vid, photo] });
const tf = (id: string, q: ReturnType<typeof makeProject>) => q.clips.find((c) => c.id === id)!.transform;

test("frameSize is 1080 wide with the ratio's height", () => {
  expect(frameSize(makeProject({ aspectRatio: "9:16" }))).toEqual({ width: 1080, height: 1920 });
  expect(frameSize(makeProject({ aspectRatio: "1:1" }))).toEqual({ width: 1080, height: 1080 });
  expect(frameSize(makeProject({ aspectRatio: "16:9" }))).toEqual({ width: 1080, height: 607.5 });
});

test("setClipTransform patches and clamps; no change returns same project; unknown id unchanged", () => {
  const q = setClipTransform(p, "v", { scale: 99, x: 5, rotation: 270 });
  expect(tf("v", q)).toMatchObject({ scale: 5, x: 1, rotation: -90 });
  expect(setClipTransform(p, "v", { scale: 1 })).toBe(p);
  expect(setClipTransform(p, "nope", { scale: 2 })).toBe(p);
});

test("resetClipTransform restores the default", () => {
  const q = setClipTransform(p, "v", { scale: 2, flipH: true });
  expect(tf("v", resetClipTransform(q, "v"))).toEqual(DEFAULT_TRANSFORM);
  expect(resetClipTransform(p, "v")).toBe(p);
  expect(resetClipTransform(p, "nope")).toBe(p);
});

test("rotateClip90 adds 90 degrees, normalised, keeping offsets", () => {
  let q = setClipTransform(p, "v", { x: 0.3, rotation: 30 });
  q = rotateClip90(q, "v");
  expect(tf("v", q)).toMatchObject({ rotation: 120, x: 0.3 });
  q = rotateClip90(rotateClip90(q, "v"), "v");
  expect(tf("v", q).rotation).toBe(-60);
  expect(rotateClip90(p, "nope")).toBe(p);
});

test("flipClip toggles the axis", () => {
  const q = flipClip(p, "v", "h");
  expect(tf("v", q)).toMatchObject({ flipH: true, flipV: false });
  expect(tf("v", flipClip(q, "v", "h")).flipH).toBe(false);
  expect(tf("v", flipClip(p, "v", "v")).flipV).toBe(true);
  expect(flipClip(p, "nope", "h")).toBe(p);
});

test("fitClip uses fitScale for the frame; rotating a landscape clip changes it", () => {
  const q = fitClip(p, "land");
  expect(tf("land", q)).toMatchObject({ scale: 0.31640625, x: 0, y: 0 });
  expect(tf("land", fitClip(rotateClip90(p, "land"), "land")).scale).toBe(1);
  expect(fitClip(q, "land")).toBe(q);
  expect(fitClip(p, "nope")).toBe(p);
});

test("fillClip resets scale and offsets only", () => {
  let q = setClipTransform(p, "v", { scale: 2, x: 0.5, y: -0.2, rotation: 90 });
  q = fillClip(q, "v");
  expect(tf("v", q)).toMatchObject({ scale: 1, x: 0, y: 0, rotation: 90 });
  expect(fillClip(p, "v")).toBe(p);
  expect(fillClip(p, "nope")).toBe(p);
});

test("setClipCrop clamps and is a no-op when unchanged", () => {
  const q = setClipCrop(p, "v", { x: 0.9, y: 0, w: 0.5, h: 0.01 });
  expect(q.clips[1].crop).toEqual({ x: 0.5, y: 0, w: 0.5, h: 0.1 });
  expect(setClipCrop(p, "v", { x: 0, y: 0, w: 1, h: 1 })).toBe(p);
  expect(setClipCrop(p, "nope", { x: 0, y: 0, w: 0.5, h: 0.5 })).toBe(p);
});

test("setClipBackground and setBackgroundForAllClips", () => {
  const red = { type: "color" as const, color: "#FF0000" };
  const q = setClipBackground(p, "v", red);
  expect(q.clips[1].background).toEqual(red);
  expect(setClipBackground(q, "v", { type: "color", color: "#FF0000" })).toBe(q);
  expect(setClipBackground(p, "nope", red)).toBe(p);
  const all = setBackgroundForAllClips(q, { type: "blur" });
  expect(all.clips.every((c) => c.background.type === "blur")).toBe(true);
  expect(all).not.toBe(q);
  expect(setBackgroundForAllClips(all, { type: "blur" })).toBe(all);
});

test("setClipReversed toggles for videos and is a no-op for photos", () => {
  expect(setClipReversed(p, "v", true).clips[1].reversed).toBe(true);
  expect(setClipReversed(p, "v", false)).toBe(p);
  expect(setClipReversed(p, "ph", true)).toBe(p);
  expect(setClipReversed(p, "nope", true)).toBe(p);
});

test("photo rules: trim keeps trimStart 0 and clamps the length", () => {
  expect(trimClip(p, "ph", 1, 5).clips[2]).toMatchObject({ trimStart: 0, trimEnd: 5 });
  expect(trimClip(p, "ph", 0, 0.1).clips[2].trimEnd).toBe(PHOTO.minSeconds);
  expect(trimClip(p, "ph", 0, 999).clips[2].trimEnd).toBe(PHOTO.maxSeconds);
  expect(trimClip(p, "ph", 0, 3)).toBe(p);
});

test("photo rules: speed, volume and mute are no-ops", () => {
  expect(setClipSpeed(p, "ph", 2)).toBe(p);
  expect(setClipVolume(p, "ph", 0.5)).toBe(p);
  expect(setClipMuted(p, "ph", false)).toBe(p);
});

test("photo rules: split yields two photos summing to the original", () => {
  const q = splitClipAt(makeProject({ clips: [photo] }), 1);
  expect(q.clips).toHaveLength(2);
  expect(q.clips.every((c) => c.kind === "photo" && c.trimStart === 0)).toBe(true);
  expect(clipDuration(q.clips[0]) + clipDuration(q.clips[1])).toBeCloseTo(3);
  expect(q.clips[0].trimEnd).toBe(1);
  const tooEarly = makeProject({ clips: [photo] });
  expect(splitClipAt(tooEarly, 0.05)).toBe(tooEarly);
  expect(splitClipAt(tooEarly, 2.95)).toBe(tooEarly);
});

test("duplicateClip copies every new field", () => {
  let q = setClipTransform(p, "v", { scale: 2, flipH: true });
  q = setClipCrop(q, "v", { x: 0.1, y: 0.1, w: 0.5, h: 0.5 });
  q = setClipBackground(q, "v", { type: "blur" });
  q = setClipReversed(q, "v", true);
  const d = duplicateClip(q, "v").clips[2];
  expect(d).toMatchObject({ kind: "video", transform: q.clips[1].transform, crop: q.clips[1].crop, background: { type: "blur" }, reversed: true });
  expect(duplicateClip(p, "ph").clips[3]).toMatchObject({ kind: "photo", muted: true });
});

test("newPhotoClip clamps its seconds", () => {
  const a = { id: "x", sourceUri: "file:///x.jpg", width: 10, height: 10 };
  expect(newPhotoClip({ ...a, seconds: 0 }).trimEnd).toBe(PHOTO.minSeconds);
  expect(newPhotoClip({ ...a, seconds: 500 }).trimEnd).toBe(PHOTO.maxSeconds);
  expect(newPhotoClip({ ...a, seconds: 5 }).trimEnd).toBe(5);
});

test("clampNum is exported from types", () => {
  expect(clampNum(5, 0, 1)).toBe(1);
  expect(clampNum(-5, 0, 1)).toBe(0);
});

test("one gesture is one undo step", () => {
  const s = useEditorStore.getState();
  s.reset();
  s.setProject(p);
  s.beginTransaction();
  for (const x of [0.1, 0.2, 0.3]) useEditorStore.getState().applyTransient((q) => setClipTransform(q, "v", { x }));
  expect(useEditorStore.getState().project!.clips[1].transform.x).toBe(0.3);
  expect(useEditorStore.getState().past).toHaveLength(1);
  useEditorStore.getState().undo();
  expect(useEditorStore.getState().project!.clips[1].transform.x).toBe(0);
});
