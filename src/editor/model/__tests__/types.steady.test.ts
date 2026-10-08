jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-10T10:00:00.000Z" }));
import { migrateProject } from "../migrate";
import { duplicateClip, setClipCutout, setClipSmooth, setClipSpeed, setClipStabilize, splitClipAt } from "../ops";
import { makeClip, makeLayer, makePhotoClip, makeProject, newLayer, SCHEMA_VERSION, STABILIZE_IDS, type Clip } from "../types";

const project = () => makeProject({
  clips: [makeClip({ id: "a", sourceDuration: 8 }), makeClip({ id: "slow", sourceDuration: 8, speed: 0.5 }), makePhotoClip({ id: "ph" }),
    makeClip({ id: "r", sourceDuration: 5, reversed: true, speed: 0.5 }), makeClip({ id: "cut", sourceDuration: 6, speed: 0.5, cutout: true })],
  layers: [makeLayer({ id: "L", sourceDuration: 6, speed: 0.5 })],
});
const item = (p: ReturnType<typeof project>, id: string): Clip => [...p.clips, ...p.layers].find((c) => c.id === id)!;

test("schema is v21; a new clip, photo and layer have neither key", () => {
  expect(SCHEMA_VERSION).toBe(21);
  expect(STABILIZE_IDS).toEqual(["low", "medium", "high"]);
  for (const c of [makeClip({ id: "x", sourceDuration: 3 }), makePhotoClip({ id: "y" }), makeLayer({ id: "z", sourceDuration: 3 })]) {
    expect("stabilize" in c).toBe(false);
    expect("smooth" in c).toBe(false);
  }
});

test("setClipStabilize writes a strength on a clip and a layer, changes it, and null leaves no key", () => {
  const p0 = project();
  for (const id of ["a", "L"]) {
    const on = setClipStabilize(p0, id, "medium");
    expect(item(on, id).stabilize).toBe("medium");
    expect(setClipStabilize(on, id, "medium")).toBe(on);
    expect(item(setClipStabilize(on, id, "high"), id).stabilize).toBe("high");
    const off = setClipStabilize(on, id, null);
    expect("stabilize" in item(off, id)).toBe(false);
    expect({ ...item(off, id) }).toEqual({ ...item(p0, id) });
    expect(setClipStabilize(off, id, null)).toBe(off);
  }
  expect(setClipStabilize(p0, "nope", "low")).toBe(p0);
  expect(setClipStabilize(p0, "a", "extreme" as never)).toBe(p0);
});

test("Stabilize is refused for a photo, a reversed clip and a clip with Remove background", () => {
  const p0 = project();
  for (const id of ["ph", "r", "cut"]) expect(setClipStabilize(p0, id, "low")).toBe(p0);
});

test("setClipSmooth: only on a slowed video that plays forwards and has no cut-out; off leaves no key", () => {
  const p0 = project();
  for (const id of ["a", "ph", "r", "cut"]) expect(setClipSmooth(p0, id, true)).toBe(p0);   // not slowed, a photo, reversed, cut out
  for (const id of ["slow", "L"]) {
    const on = setClipSmooth(p0, id, true);
    expect(item(on, id).smooth).toBe(true);
    expect(setClipSmooth(on, id, true)).toBe(on);
    const off = setClipSmooth(on, id, false);
    expect("smooth" in item(off, id)).toBe(false);
    expect({ ...item(off, id) }).toEqual({ ...item(p0, id) });
    expect(setClipSmooth(off, id, false)).toBe(off);
  }
});

test("a clip sped back up keeps the stored switch, and off is never refused", () => {
  const fast = setClipSpeed(setClipSmooth(project(), "slow", true), "slow", 1.5);
  expect(item(fast, "slow").smooth).toBe(true);
  expect("smooth" in item(setClipSmooth(fast, "slow", false), "slow")).toBe(false);
});

test("Remove background is refused beside a strength or an active Smooth slow motion, and takes an idle switch with it", () => {
  const steady = setClipStabilize(project(), "a", "low");
  expect(setClipCutout(steady, "a", true)).toBe(steady);
  const smooth = setClipSmooth(project(), "slow", true);
  expect(setClipCutout(smooth, "slow", true)).toBe(smooth);
  const idle = setClipSpeed(smooth, "slow", 1);                       // no longer slowed: the switch is idle
  const cut = setClipCutout(idle, "slow", true);
  expect(item(cut, "slow").cutout).toBe(true);
  expect("smooth" in item(cut, "slow")).toBe(false);
});

test("a layer made from a clip, a duplicate and both halves of a split keep the keys", () => {
  const on = setClipSmooth(setClipStabilize(project(), "slow", "high"), "slow", true);
  expect(newLayer(item(on, "slow"), 0)).toMatchObject({ stabilize: "high", smooth: true });
  const cut = splitClipAt(on, 9);                                     // "a" is 8 s long; "slow" starts at 8
  expect(cut.clips.filter((c) => c.stabilize === "high" && c.smooth === true)).toHaveLength(2);
  expect(duplicateClip(on, "slow").clips.filter((c) => c.stabilize === "high")).toHaveLength(2);
});

test("the sanity pass keeps a known strength and exactly true on a forward video without a cut-out, and removes everything else", () => {
  const withKeys = (id: string, keys: Record<string, unknown>, extra: Partial<Clip> = {}) => ({ ...makeClip({ id, sourceDuration: 4, ...extra }), ...keys }) as unknown as Clip;
  const p = migrateProject(makeProject({ clips: [
    withKeys("ok", { stabilize: "low", smooth: true }), withKeys("bad", { stabilize: "off", smooth: 1 }), withKeys("nil", { stabilize: null, smooth: false }),
    withKeys("rev", { stabilize: "high", smooth: true }, { reversed: true }), withKeys("cut", { stabilize: "high", smooth: true, cutout: true }),
    { ...makePhotoClip({ id: "ph" }), stabilize: "low", smooth: true } as unknown as Clip,
  ] }));
  const clip = (id: string) => p.clips.find((c) => c.id === id)!;
  expect(clip("ok")).toMatchObject({ stabilize: "low", smooth: true });
  for (const id of ["bad", "nil", "rev", "cut", "ph"]) { expect("stabilize" in clip(id)).toBe(false); expect("smooth" in clip(id)).toBe(false); }
  expect(clip("cut").cutout).toBe(true);                              // the older setting stays
  expect(migrateProject(p)).toEqual(p);
});
