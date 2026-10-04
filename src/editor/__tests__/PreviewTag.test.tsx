import { DEFAULT_ADJUST, makeClip, makeEffect, makeKeyframe, makePhotoClip, makeProject, type Clip } from "@/src/editor/model/types";
import { setClipSpeedCurve } from "@/src/editor/model/ops";
import { needsPreviewTag } from "../components/PreviewTag";

const one = (over: Partial<Clip>) => makeProject({ clips: [makeClip({ id: "a", sourceDuration: 4, ...over })] });

test("a plain clip needs no tag", () => {
  expect(needsPreviewTag(one({}), 1)).toBe(false);
});
test("a filter needs the tag", () => {
  expect(needsPreviewTag(one({ filter: "vintage" }), 1)).toBe(true);
});
test("the playhead inside a transition window needs the tag", () => {
  const p = makeProject({ clips: [
    makeClip({ id: "a", sourceDuration: 4, transitionOut: { type: "fade", duration: 1 } }),
    makeClip({ id: "b", sourceDuration: 4 }),
  ] });
  expect(needsPreviewTag(p, 4.2)).toBe(true);
  expect(needsPreviewTag(p, 2)).toBe(false);
});
test("a reversed clip needs the tag", () => {
  expect(needsPreviewTag(one({ reversed: true }), 1)).toBe(true);
});
test("a blur background needs the tag only while it is visible", () => {
  expect(needsPreviewTag(one({ background: { type: "blur" } }), 1)).toBe(false); // covered by the picture
  expect(needsPreviewTag(one({ background: { type: "blur" }, width: 1920, height: 1080, transform: { scale: 0.5, x: 0, y: 0, rotation: 0, flipH: false, flipV: false } }), 1)).toBe(true);
  expect(needsPreviewTag(one({ background: { type: "color", color: "#FF0000" }, transform: { scale: 0.5, x: 0, y: 0, rotation: 0, flipH: false, flipV: false } }), 1)).toBe(false);
});
test("any non-zero adjust value needs the tag", () => {
  expect(needsPreviewTag(one({ adjust: { ...DEFAULT_ADJUST, contrast: 0.2 } }), 1)).toBe(true);
  expect(needsPreviewTag(one({ adjust: { ...DEFAULT_ADJUST, vignette: 1 } }), 1)).toBe(true);
  expect(needsPreviewTag(one({ adjust: { ...DEFAULT_ADJUST } }), 1)).toBe(false);
});
test("an effect needs the tag only while it covers the playhead", () => {
  const p = makeProject({ clips: [makeClip({ id: "a", sourceDuration: 4 })], effects: [makeEffect({ id: "e", type: "glitch", start: 1, end: 2 })] });
  expect(needsPreviewTag(p, 0.5)).toBe(false);
  expect(needsPreviewTag(p, 1)).toBe(true);
  expect(needsPreviewTag(p, 1.9)).toBe(true);
  expect(needsPreviewTag(p, 2)).toBe(false); // end is exclusive
});
test("a filter counts only while its strength is above 0", () => {
  expect(needsPreviewTag(one({ filter: "vintage", filterIntensity: 0 }), 1)).toBe(false);
  expect(needsPreviewTag(one({ filter: "vintage", filterIntensity: 0.01 }), 1)).toBe(true);
  expect(needsPreviewTag(one({ filter: "vintage", filterIntensity: 0, reversed: true }), 1)).toBe(true);
});
test("a photo at the default fill needs no tag", () => {
  expect(needsPreviewTag(makeProject({ clips: [makePhotoClip({ id: "p" })] }), 1)).toBe(false);
});
test("an empty project needs no tag", () => {
  expect(needsPreviewTag(makeProject(), 0)).toBe(false);
});

describe("a blur background behind a clip with motion", () => {
  const blur = { background: { type: "blur" as const } };
  test("keyframed small: the blur shows, so the tag does — only while the picture is small", () => {
    const p = one({ ...blur, keyframes: [makeKeyframe({ t: 0, scale: 0.5 }), makeKeyframe({ t: 2, scale: 1 })] });
    expect(needsPreviewTag(p, 0)).toBe(true);
    expect(needsPreviewTag(p, 1)).toBe(true);
    expect(needsPreviewTag(p, 3)).toBe(false);
  });
  test("the static transform is hidden by the pins: a keyframed picture that covers needs no tag", () => {
    const small = { scale: 0.5, x: 0, y: 0, rotation: 0, flipH: false, flipV: false };
    expect(needsPreviewTag(one({ ...blur, transform: small, keyframes: [makeKeyframe({ t: 0 })] }), 1)).toBe(false);
    expect(needsPreviewTag(one({ ...blur, transform: small }), 1)).toBe(true);
  });
  test("fading: a see-through picture shows the blur", () => {
    const fade = one({ ...blur, animation: { in: { id: "fade", duration: 1 }, out: null, combo: null } });
    expect(needsPreviewTag(fade, 0.5)).toBe(true);
    expect(needsPreviewTag(fade, 2)).toBe(false);
    expect(needsPreviewTag(one({ ...blur, keyframes: [makeKeyframe({ t: 0, opacity: 0.5 })] }), 1)).toBe(true);
  });
  test("an animation that moves the picture off the frame shows the blur; a colour background never needs the tag", () => {
    const slide = { in: { id: "slideLeft" as const, duration: 1 }, out: null, combo: null };
    expect(needsPreviewTag(one({ ...blur, animation: slide }), 0.2)).toBe(true);
    expect(needsPreviewTag(one({ ...blur, animation: slide }), 2)).toBe(false);
    expect(needsPreviewTag(one({ background: { type: "color", color: "#FF0000" }, animation: slide }), 0.2)).toBe(false);
  });
});

test("a clip with a speed curve needs the tag; clearing the curve drops it", () => {
  const curved = setClipSpeedCurve(one({}), "a", "hero");
  expect(needsPreviewTag(curved, 0)).toBe(true);
  expect(needsPreviewTag(curved, 1)).toBe(true);
  expect(needsPreviewTag(setClipSpeedCurve(curved, "a", null), 1)).toBe(false);
  expect(needsPreviewTag(one({ speed: 2 }), 1)).toBe(false); // a constant speed is exact
});
