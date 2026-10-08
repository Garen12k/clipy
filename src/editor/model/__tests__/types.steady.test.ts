jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-10T10:00:00.000Z" }));
import { migrateProject } from "../migrate";
import { duplicateClip, insertFreezeFrame, replaceClipMedia, setClipCutout, setClipSmooth, setClipSpeed, setClipStabilize, splitClipAt } from "../ops";
import { steadyOf } from "../steady";
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

// ---- Replace: the keys belong to a video ----

const PHOTO_MEDIA = { sourceUri: "file:///media/new.jpg", sourceDuration: 0, width: 1080, height: 1920, kind: "photo" as const };
const VIDEO_MEDIA = { sourceUri: "file:///media/new.mp4", sourceDuration: 12, width: 1080, height: 1920, kind: "video" as const };

test("Replace with a photo drops Stabilize and Smooth slow motion with the same step: absent, never undefined", () => {
  const on = setClipSmooth(setClipStabilize(project(), "slow", "medium"), "slow", true);
  const photo = replaceClipMedia(on, "slow", PHOTO_MEDIA);
  expect(item(photo, "slow").kind).toBe("photo");
  expect("stabilize" in item(photo, "slow")).toBe(false);
  expect("smooth" in item(photo, "slow")).toBe(false);
  expect(steadyOf(item(photo, "slow"))).toBeNull();
  expect(migrateProject(photo)).toEqual(photo);                       // what the op leaves is what the sanity pass would
  const layer = replaceClipMedia(setClipStabilize(project(), "L", "high"), "L", PHOTO_MEDIA);
  expect("stabilize" in item(layer, "L")).toBe(false);
});

test("so Remove background works on that photo at once, and a video put back does not get Stabilize by itself", () => {
  const photo = replaceClipMedia(setClipStabilize(project(), "a", "medium"), "a", PHOTO_MEDIA);
  expect(item(setClipCutout(photo, "a", true), "a").cutout).toBe(true);
  const back = replaceClipMedia(photo, "a", VIDEO_MEDIA);
  expect(item(back, "a").kind).toBe("video");
  expect("stabilize" in item(back, "a")).toBe(false);
  expect(steadyOf(item(back, "a"))).toBeNull();
});

test("Replace with another video keeps the keys (spec 4.1): a copy of the new file is made", () => {
  const on = setClipSmooth(setClipStabilize(project(), "slow", "medium"), "slow", true);
  const video = replaceClipMedia(on, "slow", VIDEO_MEDIA);
  expect(item(video, "slow")).toMatchObject({ stabilize: "medium", smooth: true, sourceUri: VIDEO_MEDIA.sourceUri });
  expect(steadyOf(item(video, "slow"))).toEqual({ level: 2, grid: 60 });
});

test("a photo that carries the keys anyway (an older session, a hand-made file) is harmless: no copy, and Remove background is not refused and takes them away", () => {
  const stale = { ...project(), clips: project().clips.map((c) => (c.id === "ph" ? ({ ...c, stabilize: "high", smooth: true } as Clip) : c)) };
  expect(steadyOf(item(stale, "ph"))).toBeNull();
  const cut = setClipCutout(stale, "ph", true);
  expect(item(cut, "ph").cutout).toBe(true);
  expect("stabilize" in item(cut, "ph")).toBe(false);
  expect("smooth" in item(cut, "ph")).toBe(false);
});

test("a freeze frame cut from a clip with both keys is a photo without them, and both halves keep them", () => {
  const on = setClipSmooth(setClipStabilize(project(), "slow", "high"), "slow", true);
  const frozen = insertFreezeFrame(on, 10, { id: "still", sourceUri: "file:///media/still.jpg", width: 1080, height: 1920 });
  expect("stabilize" in item(frozen, "still")).toBe(false);
  expect("smooth" in item(frozen, "still")).toBe(false);
  expect(frozen.clips.filter((c) => c.stabilize === "high" && c.smooth === true)).toHaveLength(2);
});
