import { addClips, deleteClip, moveClip, setAspectRatio } from "../ops";
import { ASPECT_LIMITS, ASPECT_RATIOS, aspectLabel, aspectRatioValue, frameAspect, isAspectRatio, makeClip, makePhotoClip, makeProject, type AspectRatio } from "../types";

jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-05T10:00:00.000Z" }));

const clip = (id: string, width: number, height: number) => makeClip({ id, sourceDuration: 4, width, height });
const auto = (...clips: ReturnType<typeof clip>[]) => makeProject({ aspectRatio: "auto", clips });

test("the nine ratios, in the menu's order, with their labels", () => {
  expect([...ASPECT_RATIOS]).toEqual(["auto", "1:1", "3:2", "2:3", "16:9", "9:16", "4:3", "3:4", "21:9"]);
  expect(ASPECT_RATIOS.map(aspectLabel)).toEqual(["Auto", "1:1", "3:2", "2:3", "16:9", "9:16", "4:3", "3:4", "21:9"]);
  expect(ASPECT_LIMITS).toEqual([9 / 21, 21 / 9]);
});

test("isAspectRatio knows exactly the nine ids", () => {
  for (const id of ASPECT_RATIOS) expect(isAspectRatio(id)).toBe(true);
  for (const bad of ["4:5", "", "AUTO", 1, null, undefined, {}]) expect(isAspectRatio(bad)).toBe(false);
});

test.each<[AspectRatio, number]>([
  ["1:1", 1], ["3:2", 3 / 2], ["2:3", 2 / 3], ["16:9", 16 / 9], ["9:16", 9 / 16], ["4:3", 4 / 3], ["3:4", 3 / 4], ["21:9", 21 / 9],
])("a fixed ratio %s is its own number, whatever the clips are", (id, value) => {
  expect(frameAspect(makeProject({ aspectRatio: id }))).toBe(value);
  expect(frameAspect(makeProject({ aspectRatio: id, clips: [clip("a", 1920, 1080)] }))).toBe(value);
  if (id !== "auto") expect(aspectRatioValue(id)).toBe(value);
});

describe("auto", () => {
  test("takes the shape of the first main clip: portrait video, landscape video, photo", () => {
    expect(frameAspect(auto(clip("a", 1080, 1920)))).toBe(1080 / 1920);
    expect(frameAspect(auto(clip("a", 1920, 1080)))).toBe(1920 / 1080);
    expect(frameAspect(auto(makePhotoClip({ id: "p", width: 4032, height: 3024 })))).toBe(4032 / 3024);
  });
  test("a clip filmed upright is stored with its displayed size (the picker applies the rotation), so auto is portrait", () => {
    // A 1920×1080 file with a 90° rotation arrives from the picker as 1080 × 1920.
    expect(frameAspect(auto(clip("a", 1080, 1920)))).toBeCloseTo(0.5625, 10);
  });
  test("the clip's own transform and crop do not change the frame", () => {
    const turned = { ...clip("a", 1920, 1080), transform: { scale: 2, x: 0.3, y: 0, rotation: 90, flipH: true, flipV: false }, crop: { x: 0, y: 0, w: 0.5, h: 1 } };
    expect(frameAspect(auto(turned))).toBe(1920 / 1080);
  });
  test("an extreme shape is clamped to 9:21 … 21:9", () => {
    expect(frameAspect(auto(clip("a", 6000, 1000)))).toBe(21 / 9);
    expect(frameAspect(auto(clip("a", 1000, 6000)))).toBe(9 / 21);
  });
  test("no clips, or a first clip without a usable size, is 9:16", () => {
    expect(frameAspect(auto())).toBe(9 / 16);
    for (const [w, h] of [[0, 1080], [1080, 0], [NaN, 1080], [1080, Infinity], [-1080, 1920]]) expect(frameAspect(auto(clip("a", w, h)))).toBe(9 / 16);
  });
  test("layers never set the frame", () => {
    expect(frameAspect(makeProject({ aspectRatio: "auto", layers: [{ ...clip("l", 1920, 1080), start: 0 }] }))).toBe(9 / 16);
  });
  test("the frame follows the first clip through reorder, delete and add", () => {
    const p = auto(clip("a", 1080, 1920), clip("b", 1920, 1080));
    expect(frameAspect(p)).toBe(9 / 16);
    expect(frameAspect(moveClip(p, "b", 0))).toBe(16 / 9);
    expect(frameAspect(deleteClip(p, "a"))).toBe(16 / 9);
    expect(frameAspect(addClips(p, [clip("c", 1000, 1000)]))).toBe(9 / 16);
    expect(frameAspect(deleteClip(deleteClip(p, "a"), "b"))).toBe(9 / 16);
  });
  test("works on picked media before a project exists", () => {
    expect(frameAspect({ aspectRatio: "auto", clips: [{ width: 1920, height: 1080 }, { width: 1080, height: 1920 }] })).toBe(16 / 9);
  });
});

test("setAspectRatio takes every id; the same id gives the same project", () => {
  let p = makeProject({ aspectRatio: "9:16" });
  for (const id of ASPECT_RATIOS) {
    if (id === p.aspectRatio) continue;
    const next = setAspectRatio(p, id);
    expect(next).not.toBe(p);
    expect(next.aspectRatio).toBe(id);
    expect(next.updatedAt).toBe("2026-10-05T10:00:00.000Z");
    expect(setAspectRatio(next, id)).toBe(next);
    p = next;
  }
  expect(setAspectRatio(p, "bogus" as AspectRatio)).toBe(p);
});

test("text and sticker positions stay where they are when the ratio changes", () => {
  const p = makeProject({ overlays: [{ id: "t", kind: "sticker", emoji: "⭐", shape: null, color: "#F5C542", x: 0.2, y: 0.8, scale: 1, rotation: 0, start: 0, end: 3, animation: { in: null, out: null, loop: null }, keyframes: [] }] });
  expect(setAspectRatio(p, "21:9").overlays).toBe(p.overlays);
});
