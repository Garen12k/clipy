jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-09T10:00:00.000Z" }));
import { migrateProject } from "../migrate";
import { duplicateClip, setClipCutout, splitClipAt } from "../ops";
import { activeCutout, makeClip, makeLayer, makePhotoClip, makeProject, newLayer, SCHEMA_VERSION, type Clip } from "../types";

const project = () => makeProject({
  clips: [makeClip({ id: "a", sourceDuration: 8 }), makePhotoClip({ id: "ph" }), makeClip({ id: "r", sourceDuration: 5, reversed: true })],
  layers: [makeLayer({ id: "L", sourceDuration: 6 })],
});
const item = (p: ReturnType<typeof project>, id: string): Clip => [...p.clips, ...p.layers].find((c) => c.id === id)!;

test("schema is v20; a new clip, photo and layer have no cutout key", () => {
  expect(SCHEMA_VERSION).toBe(20);
  for (const c of [makeClip({ id: "x", sourceDuration: 3 }), makePhotoClip({ id: "y" }), makeLayer({ id: "z", sourceDuration: 3 })]) {
    expect("cutout" in c).toBe(false);
    expect(activeCutout(c)).toBe(false);
  }
});

test("setClipCutout switches it on for a clip, a photo and a layer, and off again leaves no key", () => {
  const p0 = project();
  for (const id of ["a", "ph", "L"]) {
    const on = setClipCutout(p0, id, true);
    expect(on).not.toBe(p0);
    expect(item(on, id).cutout).toBe(true);
    expect(activeCutout(item(on, id))).toBe(true);
    expect(setClipCutout(on, id, true)).toBe(on);                 // already on: the same project
    const off = setClipCutout(on, id, false);
    expect("cutout" in item(off, id)).toBe(false);
    expect({ ...item(off, id) }).toEqual({ ...item(p0, id) });    // back as it was
    expect(setClipCutout(off, id, false)).toBe(off);              // already off: the same project
  }
  expect(setClipCutout(p0, "nope", true)).toBe(p0);
});

test("a reversed clip is refused, and a clip reversed afterwards is not active", () => {
  const p0 = project();
  expect(setClipCutout(p0, "r", true)).toBe(p0);
  expect(activeCutout({ ...makeClip({ id: "x", sourceDuration: 3 }), cutout: true, reversed: true })).toBe(false);
});

test("a layer made from a clip, a duplicate and both halves of a split keep it", () => {
  const on = setClipCutout(project(), "a", true);
  expect(newLayer(item(on, "a"), 0).cutout).toBe(true);
  const cut = splitClipAt(on, 3);
  expect(cut.clips.slice(0, 2).map((c) => c.cutout)).toEqual([true, true]);
  const twice = duplicateClip(on, "a");
  expect(twice.clips.filter((c) => c.cutout === true)).toHaveLength(2);
});

test("the sanity pass keeps exactly true on a clip that plays forwards and removes everything else", () => {
  const withKey = (id: string, cutout: unknown, extra: Partial<Clip> = {}) => ({ ...makeClip({ id, sourceDuration: 4, ...extra }), cutout }) as unknown as Clip;
  const p = migrateProject(makeProject({ clips: [withKey("ok", true), withKey("no", false), withKey("one", 1), withKey("text", "true"), withKey("nil", null), withKey("rev", true, { reversed: true })] }));
  const clip = (id: string) => p.clips.find((c) => c.id === id)!;
  expect(clip("ok").cutout).toBe(true);
  for (const id of ["no", "one", "text", "nil", "rev"]) expect("cutout" in clip(id)).toBe(false);
  expect(migrateProject(p)).toEqual(p);
});
