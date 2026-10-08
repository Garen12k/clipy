import { setClipSpeedCurve, splitClipAt } from "../ops";
import { clipDuration, curveSteps, isSmoothCurve, smoothCurveSteps } from "../timeline";
import { makeClip, makeLayer, makePhotoClip, makeProject, MIN_CLIP_SECONDS } from "../types";

const project = () => makeProject({ clips: [makeClip({ id: "a", sourceDuration: 8 }), makeClip({ id: "s", sourceDuration: 0.2 }), makePhotoClip({ id: "ph" })], layers: [makeLayer({ id: "L", sourceDuration: 6, start: 0 })] });
const clip = (p: ReturnType<typeof project>, id: string) => p.clips.find((c) => c.id === id)!;

test("smooth writes 32 steps over the clip's trim and sets the speed to 1: one new project", () => {
  const p0 = project();
  const p1 = setClipSpeedCurve(p0, "a", "bullet", true);
  expect(p1).not.toBe(p0);
  expect(clip(p1, "a").speedCurve).toEqual({ id: "bullet", steps: smoothCurveSteps("bullet", 0, 8) });
  expect(clip(p1, "a").speed).toBe(1);
  expect(isSmoothCurve(clip(p1, "a"))).toBe(true);
  expect(setClipSpeedCurve(p1, "a", "bullet", true)).toBe(p1);          // the same form again: nothing changes
});

test("the same preset in the other form is a change, both ways", () => {
  const smooth = setClipSpeedCurve(project(), "a", "hero", true);
  const stepped = setClipSpeedCurve(smooth, "a", "hero", false);
  expect(stepped).not.toBe(smooth);
  expect(clip(stepped, "a").speedCurve).toEqual({ id: "hero", steps: curveSteps("hero", 0, 8) });
  expect(isSmoothCurve(clip(setClipSpeedCurve(stepped, "a", "hero", true), "a"))).toBe(true);
});

test("a clip too short for 32 steps is refused in the smooth form and still takes the stepped one", () => {
  const p0 = project();                                                 // "s": 0.2 source seconds; 32 steps need 0.32
  expect(setClipSpeedCurve(p0, "s", "flashOut", true)).toBe(p0);
  const stepped = setClipSpeedCurve(p0, "s", "flashOut", false);
  expect(clip(stepped, "s").speedCurve?.steps).toHaveLength(8);
  expect(clipDuration(clip(stepped, "s"))).toBeGreaterThanOrEqual(MIN_CLIP_SECONDS - 1e-9);
});

test("photos never take a curve; None clears a smooth curve; a layer takes one", () => {
  const p0 = project();
  expect(setClipSpeedCurve(p0, "ph", "hero", true)).toBe(p0);
  const smooth = setClipSpeedCurve(p0, "a", "hero", true);
  expect(clip(setClipSpeedCurve(smooth, "a", null), "a").speedCurve).toBeNull();
  expect(clip(setClipSpeedCurve(smooth, "a", null, true), "a").speedCurve).toBeNull();
  const layered = setClipSpeedCurve(p0, "L", "flashIn", true);
  expect(layered.layers[0].speedCurve?.steps).toHaveLength(32);
});

test("a split keeps the whole smooth curve on both halves, and together they last as long as the clip did", () => {
  const smooth = setClipSpeedCurve(project(), "a", "hero", true);
  const whole = clipDuration(clip(smooth, "a"));
  const cut = splitClipAt(smooth, whole / 3);                           // "a" is the first clip: project time = its own offset
  const [left, right] = cut.clips;
  expect(isSmoothCurve(left)).toBe(true);
  expect(isSmoothCurve(right)).toBe(true);
  expect(clipDuration(left) + clipDuration(right)).toBeCloseTo(whole, 9);
});

test("a clip whose trim is empty, backwards or not a number is refused in the smooth form: the same project", () => {
  for (const bad of [{ trimStart: 3, trimEnd: 3 }, { trimStart: 6, trimEnd: 2 }, { trimStart: NaN, trimEnd: 8 }, { trimStart: 0, trimEnd: NaN }]) {
    const p0 = makeProject({ clips: [makeClip({ id: "a", sourceDuration: 8, ...bad })] });
    expect(setClipSpeedCurve(p0, "a", "hero", true)).toBe(p0);
  }
});

test("the shortest clips: 0.32 source seconds is too short for some smooth presets only because the clip would play under the minimum", () => {
  // 32 steps fit in 0.32 s; Flash out then lasts 0.32 × 5.702982 / 8 = 0.228 s (kept), Jump cut 0.32 × 3.812711 / 8 = 0.1525 s (kept).
  const p0 = makeProject({ clips: [makeClip({ id: "a", sourceDuration: 0.32 })] });
  for (const id of ["flashOut", "jumpCut"] as const) {
    const c = setClipSpeedCurve(p0, "a", id, true).clips[0];
    expect(c.speedCurve?.steps).toHaveLength(32);
    expect(clipDuration(c)).toBeGreaterThanOrEqual(MIN_CLIP_SECONDS);
  }
  const under = makeProject({ clips: [makeClip({ id: "a", sourceDuration: 0.31 })] });
  expect(setClipSpeedCurve(under, "a", "flashOut", true)).toBe(under);
});

test("an unknown preset is refused whatever the form", () => {
  const p0 = project();
  expect(setClipSpeedCurve(p0, "a", "warp" as never, true)).toBe(p0);
  expect(setClipSpeedCurve(p0, "nobody", "hero", true)).toBe(p0);
});
