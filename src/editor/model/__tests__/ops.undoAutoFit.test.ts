import { fitScale } from "../clipLayout";
import { AUTO_FIT_WINDOW, undoAutoFit } from "../ops";
import { FULL_CROP, makeClip, makeLayer, makeProject, type Project } from "../types";

// A 1080×1920 clip in a 4:3 frame (1080 × 810): cover makes it 1080 wide, fit makes it 810 tall → 810 / 1920 = 0.421875.
const FIT_4_3 = fitScale({ width: 1080, height: 1920 }, FULL_CROP, 0, 1080, 810);
const INSIDE = new Date(AUTO_FIT_WINDOW.from + 60_000).toISOString();

const project = (over: Partial<Project> = {}, scale = FIT_4_3): Project => ({
  ...makeProject({ aspectRatio: "4:3", clips: [{ ...makeClip({ id: "a", sourceDuration: 4, width: 1080, height: 1920 }), transform: { scale, x: 0, y: 0, rotation: 0, flipH: false, flipV: false } }] }),
  updatedAt: INSIDE, ...over,
});

test("the fit scale used here is the hand-computed one", () => {
  expect(FIT_4_3).toBeCloseTo(0.421875, 6);
});

test("a clip the short-lived auto-fit shrank fills the frame again", () => {
  const p = project();
  const out = undoAutoFit(p);
  expect(out.clips[0].transform).toEqual({ ...p.clips[0].transform, scale: 1 });
  expect(out.updatedAt).toBe(p.updatedAt);
});

test("nothing to repair returns the same project", () => {
  const filled = project({}, 1);
  expect(undoAutoFit(filled)).toBe(filled);
});

test("a project saved outside the window is left alone (a deliberate Fit stays)", () => {
  const before = project({ updatedAt: new Date(AUTO_FIT_WINDOW.from - 1000).toISOString() });
  const after = project({ updatedAt: new Date(AUTO_FIT_WINDOW.to + 1000).toISOString() });
  expect(undoAutoFit(before)).toBe(before);
  expect(undoAutoFit(after)).toBe(after);
  const bad = project({ updatedAt: "not a date" });
  expect(undoAutoFit(bad)).toBe(bad);
});

test("a clip left at the Fit scale of an EARLIER frame (the shape was changed again afterwards) fills too", () => {
  // Fitted for 21:9 (27/112 ≈ 0.2411), then the frame went to 4:3 with the scale kept: not the 4:3 fit (0.421875), still shrunk.
  const stale = project({}, 27 / 112);
  expect(undoAutoFit(stale).clips[0].transform.scale).toBe(1);
});

test("a placement made by hand is left alone: moved, zoomed in, or keyframed", () => {
  const moved = project();
  moved.clips[0] = { ...moved.clips[0], transform: { ...moved.clips[0].transform, x: 0.1 } };
  expect(undoAutoFit(moved)).toBe(moved);
  const zoomed = project({}, 1.4);
  expect(undoAutoFit(zoomed)).toBe(zoomed);
  const pinned = project();
  pinned.clips[0] = { ...pinned.clips[0], keyframes: [{ time: 0, scale: FIT_4_3, x: 0, y: 0, rotation: 0, opacity: 1 }] as unknown as Project["clips"][number]["keyframes"] };
  expect(undoAutoFit(pinned)).toBe(pinned);
});

test("layers are never touched; untouched clips keep their identity", () => {
  const base = project();
  const other = { ...makeClip({ id: "b", sourceDuration: 4, width: 1440, height: 1080 }) };   // 4:3 clip: fit = fill = 1
  const layer = { ...makeLayer({ id: "L", sourceDuration: 2, start: 0, width: 1080, height: 1920 }), transform: { scale: FIT_4_3, x: 0, y: 0, rotation: 0, flipH: false, flipV: false } };
  const p: Project = { ...base, clips: [base.clips[0], other], layers: [layer] };
  const out = undoAutoFit(p);
  expect(out.clips[0].transform.scale).toBe(1);
  expect(out.clips[1]).toBe(other);
  expect(out.layers).toBe(p.layers);
});
