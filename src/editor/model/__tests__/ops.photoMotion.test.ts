jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
import { makeClip, makeKeyframe, makePhotoClip, makeProject, type Clip, type LayerClip, type PhotoMotion, type Project } from "../types";
import { duplicateClip, replaceClipMedia, setAnimationForAllClips, setClipAnimation, setMotionForAllPhotos, setPhotoMotion, splitClipAt, toggleClipKeyframe } from "../ops";

const zoom: PhotoMotion = { id: "zoomIn", strength: 0.5 };
const video = makeClip({ id: "v", sourceDuration: 4 });
const p1 = makePhotoClip({ id: "p1" });
const p2 = makePhotoClip({ id: "p2", animation: { in: { id: "fade", duration: 0.5 }, out: null, combo: null } });
const oldZoom = makePhotoClip({ id: "old", animation: { in: null, out: null, combo: "zoomInSlow" } });
const swaying = makePhotoClip({ id: "sway", animation: { in: null, out: null, combo: "sway" } });
const pinned = makePhotoClip({ id: "pin", keyframes: [makeKeyframe({ t: 0 }), makeKeyframe({ t: 2, scale: 1.5 })] });
const layer: LayerClip = { ...makePhotoClip({ id: "L" }), start: 1 };
const project = makeProject({ clips: [video, p1, p2, oldZoom, swaying, pinned], layers: [layer] });
const clip = (x: Project, id: string): Clip => [...x.clips, ...x.layers].find((c) => c.id === id)!;

test("setPhotoMotion writes the motion on a photo (strength to 2 decimals) and leaves every other clip the same object", () => {
  const next = setPhotoMotion(project, "p1", { id: "panUp", strength: 0.333 });
  expect(clip(next, "p1").motion).toEqual({ id: "panUp", strength: 0.33 });
  for (const id of ["v", "p2", "old", "sway", "pin"]) expect(clip(next, id)).toBe(clip(project, id));
  expect(next.layers).toBe(project.layers);
  expect(next.updatedAt).toBe("2026-10-01T10:00:00.000Z");
  // A layer too; the main track is then not touched.
  const onLayer = setPhotoMotion(project, "L", zoom);
  expect(clip(onLayer, "L").motion).toEqual(zoom);
  expect(onLayer.clips).toBe(project.clips);
});

test("setPhotoMotion keeps In / Out and clears a Combo: a Motion and a Combo never sit on one photo", () => {
  expect(clip(setPhotoMotion(project, "p2", zoom), "p2").animation).toEqual({ in: { id: "fade", duration: 0.5 }, out: null, combo: null });
  for (const id of ["old", "sway"]) {
    const next = clip(setPhotoMotion(project, id, zoom), id);
    expect(next.motion).toEqual(zoom);
    expect(next.animation).toEqual({ in: null, out: null, combo: null });
  }
});

test("setPhotoMotion(null) removes the key, and with it an older zoom / pan Combo — but not Sway or Pulse", () => {
  const moving = setPhotoMotion(project, "p1", zoom);
  const still = setPhotoMotion(moving, "p1", null);
  expect("motion" in clip(still, "p1")).toBe(false);
  expect(clip(still, "p1")).toEqual(p1);
  const cleared = clip(setPhotoMotion(project, "old", null), "old");
  expect(cleared.animation.combo).toBeNull();
  expect("motion" in cleared).toBe(false);
  expect(setPhotoMotion(project, "sway", null)).toBe(project);
  expect(setPhotoMotion(project, "p1", null)).toBe(project);        // already still: no undo step
});

test("setPhotoMotion refuses (same project): a video, a photo with keyframes, an unknown clip, an unknown motion, a strength that is not a number, no change", () => {
  expect(setPhotoMotion(project, "v", zoom)).toBe(project);
  expect(setPhotoMotion(project, "pin", zoom)).toBe(project);
  expect(setPhotoMotion(project, "gone", zoom)).toBe(project);
  expect(setPhotoMotion(project, "p1", { id: "spiral", strength: 0.5 } as unknown as PhotoMotion)).toBe(project);
  expect(setPhotoMotion(project, "p1", { id: "zoomIn", strength: NaN })).toBe(project);
  const moving = setPhotoMotion(project, "p1", zoom);
  expect(setPhotoMotion(moving, "p1", { id: "zoomIn", strength: 0.5 })).toBe(moving);
  expect(setPhotoMotion(moving, "p1", { id: "zoomIn", strength: 0.501 })).toBe(moving);   // the same after rounding
  // Out of range is clamped, not refused.
  expect(clip(setPhotoMotion(project, "p1", { id: "zoomIn", strength: 3 }), "p1").motion).toEqual({ id: "zoomIn", strength: 1 });
});

test("setMotionForAllPhotos: every main-track photo without keyframes, in one change; videos, pinned photos and layers are left alone", () => {
  const next = setMotionForAllPhotos(project, { id: "panLeft", strength: 0.8 });
  for (const id of ["p1", "p2", "old", "sway"]) expect(clip(next, id).motion).toEqual({ id: "panLeft", strength: 0.8 });
  expect(clip(next, "old").animation.combo).toBeNull();
  expect(clip(next, "p2").animation.in).toEqual({ id: "fade", duration: 0.5 });
  expect(clip(next, "v")).toBe(video);
  expect(clip(next, "pin")).toBe(pinned);
  expect(next.layers).toBe(project.layers);
  expect(setMotionForAllPhotos(next, { id: "panLeft", strength: 0.8 })).toBe(next);
  // None for all: the motions go, and so do the older zoom / pan Combos; Sway stays.
  const none = setMotionForAllPhotos(next, null);
  for (const id of ["p1", "p2", "old", "sway"]) expect("motion" in clip(none, id)).toBe(false);
  expect(clip(setMotionForAllPhotos(project, null), "old").animation.combo).toBeNull();
  expect(clip(setMotionForAllPhotos(project, null), "sway").animation.combo).toBe("sway");
  expect(setMotionForAllPhotos(project, { id: "spiral", strength: 0.5 } as unknown as PhotoMotion)).toBe(project);
  expect(setMotionForAllPhotos(makeProject({ clips: [video] }), zoom).clips[0]).toBe(video);
});

test("picking a Combo removes the Motion; In / Out do not; a clip without a Motion goes the way it always did", () => {
  const moving = setPhotoMotion(project, "p1", zoom);
  const combo = clip(setClipAnimation(moving, "p1", { combo: "pulse" }), "p1");
  expect(combo.animation.combo).toBe("pulse");
  expect("motion" in combo).toBe(false);
  expect(clip(setClipAnimation(moving, "p1", { in: { id: "fade", duration: 0.5 } }), "p1").motion).toEqual(zoom);
  expect(clip(setClipAnimation(moving, "p1", { combo: null }), "p1")).toBe(clip(moving, "p1"));   // no Combo before, none after
  // The whole project: a Combo for all removes every Motion; edges for all keep them.
  const everywhere = setAnimationForAllClips(moving, { in: null, out: null, combo: "sway" });
  expect("motion" in clip(everywhere, "p1")).toBe(false);
  expect(clip(setAnimationForAllClips(moving, { in: { id: "fade", duration: 0.5 }, out: null, combo: null }), "p1").motion).toEqual(zoom);
  // Untouched behaviour for a clip that never had a Motion.
  expect(clip(setClipAnimation(project, "v", { combo: "sway" }), "v")).toEqual({ ...video, animation: { in: null, out: null, combo: "sway" } });
});

test("a keyframe is never added over a Motion (same project); a photo without one and a video pin as before", () => {
  const moving = makeProject({ clips: [{ ...p1, motion: zoom }, video, p2] });
  expect(toggleClipKeyframe(moving, "p1", 1)).toBe(moving);
  expect(clip(toggleClipKeyframe(moving, "p2", 1), "p2").keyframes).toHaveLength(1);
  expect(clip(toggleClipKeyframe(moving, "v", 1), "v").keyframes).toHaveLength(1);
});

const media = { sourceUri: "file:///media/new.mp4", sourceDuration: 5, width: 1080, height: 1920 };
test("replacing a photo with a video drops its motion key; with a photo it keeps it", () => {
  const moving = makeProject({ clips: [{ ...p1, motion: zoom }] });
  const toVideo = clip(replaceClipMedia(moving, "p1", { ...media, kind: "video" }), "p1");
  expect(toVideo.kind).toBe("video");
  expect("motion" in toVideo).toBe(false);
  const toPhoto = clip(replaceClipMedia(moving, "p1", { ...media, kind: "photo" }), "p1");
  expect(toPhoto.motion).toEqual(zoom);
});

test("splitting and duplicating a photo with a Motion carries it to both pieces and the copy", () => {
  const moving = makeProject({ clips: [{ ...makePhotoClip({ id: "m", seconds: 4 }), motion: zoom }] });
  const split = splitClipAt(moving, 2);
  expect(split.clips).toHaveLength(2);
  for (const c of split.clips) expect(c.motion).toEqual(zoom);
  const dup = duplicateClip(moving, "m");
  expect(dup.clips).toHaveLength(2);
  expect(dup.clips[1].motion).toEqual(zoom);
});
