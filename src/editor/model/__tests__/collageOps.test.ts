jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
import { addCollage, collageLength, collageOf, collageRefusal, refitReplacedCell, relayCollage } from "../collageOps";
import { isCellInPlace } from "../collage";
import { duplicateLayer, replaceClipMedia, setClipTransform } from "../ops";
import { clipDuration } from "../timeline";
import { LAYER_LIMITS, makeClip, makeKeyframe, makeLayer, makePhotoClip, makeProject, type Clip, type LayerClip, type Project } from "../types";

const a = makeClip({ id: "a", sourceDuration: 6 });
const b = makeClip({ id: "b", sourceDuration: 4 });                    // the project is 10 s long, 9:16
const project = makeProject({ clips: [a, b] });
const photo = (id: string, width = 1080, height = 1920): Clip => makePhotoClip({ id, width, height });
const video = (id: string, seconds: number): Clip => makeClip({ id, sourceDuration: seconds });
const tag = (cell: number, extra: object = {}) => ({ group: "g", layout: "sideBySide", cell, border: 0, corner: 0, aspect: 9 / 16, ...extra });
/** x1 (portrait) and x2 (landscape) side by side from 2 s. */
const two = addCollage(project, [photo("x1"), photo("x2", 1920, 1080)], "sideBySide", 2, "g");
const cellOf = (p: Project, id: string): LayerClip => p.layers.find((l) => l.id === id)!;

test("addCollage: one layer per cell from the start, each filling its cell and tagged; only the layers change", () => {
  expect(two.layers.map((l) => l.id)).toEqual(["x1", "x2"]);
  expect(cellOf(two, "x1")).toEqual({ ...photo("x1"), start: 2, trimEnd: 3, transform: { scale: 0.5, x: -0.25, y: 0, rotation: 0, flipH: false, flipV: false }, crop: { x: 0.25, y: 0, w: 0.5, h: 1 }, collage: tag(0) });
  expect(cellOf(two, "x2")).toMatchObject({ start: 2, transform: { scale: 0.5, x: 0.25, y: 0 }, crop: { x: 0.420898, y: 0, w: 0.158203, h: 1 }, mask: "none", collage: tag(1) });
  expect(two.clips).toBe(project.clips);
  expect(two.effects).toBe(project.effects);
  expect(two.updatedAt).toBe("2026-10-01T10:00:00.000Z");
  // On top of the layers that were there, in cell order.
  const before = makeProject({ clips: [a, b], layers: [makeLayer({ id: "old", sourceDuration: 2, start: 0 })] });
  expect(addCollage(before, [photo("x1"), photo("x2")], "stacked", 2, "g").layers.map((l) => l.id)).toEqual(["old", "x1", "x2"]);
  // Whatever placement a picked clip carried is replaced by its cell's.
  const odd = { ...photo("x1"), mask: "circle" as const, crop: { x: 0, y: 0, w: 0.5, h: 0.5 }, transform: { scale: 3, x: 0.4, y: 0.4, rotation: 45, flipH: false, flipV: false } };
  expect(cellOf(addCollage(project, [odd, photo("x2")], "sideBySide", 2, "g"), "x1")).toEqual(cellOf(two, "x1"));
});

test("collageLength: the shortest video (3 s with photos only), cut to the time left, between 0.5 and 60 s, to the millisecond", () => {
  expect(collageLength(project, [photo("x"), photo("y")], 2)).toBe(3);
  expect(collageLength(project, [photo("x"), video("v", 5)], 2)).toBe(5);
  expect(collageLength(project, [video("v", 5), video("w", 2.5)], 2)).toBe(2.5);
  expect(collageLength(project, [photo("x"), photo("y")], 8.5)).toBe(1.5);        // 10 − 8.5 left
  expect(collageLength(project, [video("v", 5)], 8)).toBe(2);
  expect(collageLength(project, [photo("x")], 9.9)).toBe(0.5);                    // never under half a second
  expect(collageLength(project, [photo("x")], 12)).toBe(3);                       // past the end: nothing to cut to
  expect(collageLength(makeProject({ clips: [makeClip({ id: "long", sourceDuration: 200 })] }), [video("v", 90)], 0)).toBe(60);
  expect(collageLength(project, [video("v", 2.0004)], 0)).toBe(2);
});

test("every cell starts and ends together: photos take the length, a longer video is trimmed at its tail", () => {
  const next = addCollage(project, [video("v", 5), photo("x"), video("w", 2)], "row3", 1, "g");
  expect(next.layers.map((l) => [l.start, clipDuration(l)])).toEqual([[1, 2], [1, 2], [1, 2]]);
  expect(cellOf(next, "v")).toMatchObject({ trimStart: 0, trimEnd: 2, sourceDuration: 5 });
  expect(cellOf(next, "x").trimEnd).toBe(2);
});

test("collageRefusal, in this order: no clips, too few, no layer room, three videos, a video too short, a third video on screen", () => {
  const pair = [photo("x1"), photo("x2")];
  const full = makeProject({ clips: [a, b], layers: Array.from({ length: LAYER_LIMITS.max - 1 }, (_, i): LayerClip => ({ ...makePhotoClip({ id: `l${i}` }), start: 0 })) });
  const busy = makeProject({ clips: [a, b], layers: [makeLayer({ id: "o1", sourceDuration: 4, start: 1 }), makeLayer({ id: "o2", sourceDuration: 4, start: 1 })] });   // two videos, 1 – 5
  expect(collageRefusal(makeProject(), pair, "sideBySide", 0)).toBe("empty");
  expect(collageRefusal(project, pair, "sideBySide", NaN)).toBe("empty");
  expect(collageRefusal(project, [photo("x1")], "sideBySide", 0)).toBe("count");
  expect(collageRefusal(full, pair, "sideBySide", 0)).toBe("limit");
  expect(collageRefusal(project, [video("v1", 3), video("v2", 3), video("v3", 3)], "row3", 0)).toBe("videos");
  expect(collageRefusal(project, [video("v1", 0.2), photo("x")], "stacked", 0)).toBe("short");
  expect(collageRefusal(busy, [video("v1", 3), photo("x")], "stacked", 2)).toBe("overlap");
  expect(collageRefusal(busy, [video("v1", 3), photo("x")], "stacked", 5)).toBeNull();                    // after the two that were there
  expect(collageRefusal(busy, pair, "stacked", 2)).toBeNull();                                             // photos are never counted
  expect(collageRefusal(project, [photo("x1"), photo("x2"), photo("x3")], "sideBySide", 0)).toBeNull();    // more than needed: the first two count
  // addCollage refuses with the same project — no undo step.
  expect(addCollage(makeProject(), pair, "sideBySide", 0, "g").layers).toHaveLength(0);
  expect(addCollage(project, [photo("x1")], "sideBySide", 0, "g")).toBe(project);
  expect(addCollage(full, pair, "sideBySide", 0, "g")).toBe(full);
  expect(addCollage(busy, [video("v1", 3), photo("x")], "stacked", 2, "g")).toBe(busy);
  // An id that is taken, the same id twice, no group: refused too.
  expect(addCollage(project, [photo("a"), photo("x2")], "sideBySide", 0, "g")).toBe(project);
  expect(addCollage(project, [photo("x1"), photo("x1")], "sideBySide", 0, "g")).toBe(project);
  expect(addCollage(project, pair, "sideBySide", 0, "")).toBe(project);
  expect(addCollage(project, [photo("x1"), photo("x2"), photo("x3")], "sideBySide", 0, "g").layers.map((l) => l.id)).toEqual(["x1", "x2"]);
});

describe("relayCollage", () => {
  test("Border re-lays every cell and stores the border (clamped, 3 decimals); the main track is not touched", () => {
    const next = relayCollage(two, "g", { border: 0.04 });
    expect(cellOf(next, "x1")).toEqual({ ...cellOf(two, "x1"), transform: { ...cellOf(two, "x1").transform, scale: 0.44, x: -0.24 }, crop: { x: 0.269634, y: 0, w: 0.460733, h: 1 }, collage: tag(0, { border: 0.04 }) });
    expect(cellOf(next, "x2").collage).toEqual(tag(1, { border: 0.04 }));
    expect(cellOf(next, "x2").transform).toMatchObject({ scale: 0.44, x: 0.24, y: 0 });
    expect(next.clips).toBe(two.clips);
    expect(cellOf(relayCollage(two, "g", { border: 0.5 }), "x1").collage!.border).toBe(0.06);
    expect(cellOf(relayCollage(two, "g", { border: 0.0149999 }), "x1").collage!.border).toBe(0.015);
  });

  test("Corner writes the three masks; Border alone never touches a mask", () => {
    const round = relayCollage(two, "g", { corner: 2 });
    expect(round.layers.map((l) => l.mask)).toEqual(["circle", "circle"]);
    expect(round.layers.map((l) => l.collage!.corner)).toEqual([2, 2]);
    expect(relayCollage(round, "g", { corner: 1 }).layers.map((l) => l.mask)).toEqual(["rounded", "rounded"]);
    expect(relayCollage(round, "g", { corner: 0 }).layers.map((l) => l.mask)).toEqual(["none", "none"]);
    expect(relayCollage(round, "g", { border: 0.02 }).layers.map((l) => l.mask)).toEqual(["circle", "circle"]);
  });

  test("a layout with the same number of cells re-lays the cells into it; another number does nothing", () => {
    expect(cellOf(relayCollage(two, "g", { layout: "stacked" }), "x1")).toMatchObject({ transform: { scale: 0.5, x: 0, y: -0.25 }, crop: { x: 0, y: 0.25, w: 1, h: 0.5 }, collage: { layout: "stacked", cell: 0 } });
    expect(cellOf(relayCollage(two, "g", { layout: "inset" }), "x2")).toMatchObject({ transform: { scale: 0.34, x: 0.29, y: 0.29 }, collage: { layout: "inset", cell: 1 } });
    expect(relayCollage(two, "g", { layout: "grid4" })).toBe(two);
    expect(relayCollage(two, "g", { layout: "row3" })).toBe(two);
  });

  test("no change, another group or a value that cannot be used: the same project (no undo step)", () => {
    expect(relayCollage(two, "g", {})).toBe(two);
    expect(relayCollage(two, "g", { border: 0 })).toBe(two);
    expect(relayCollage(two, "g", { corner: 0 })).toBe(two);
    expect(relayCollage(two, "other", { border: 0.04 })).toBe(two);
    expect(relayCollage(two, "g", { border: NaN })).toBe(two);
    expect(relayCollage(two, "g", { corner: 5 as never })).toBe(two);
    expect(relayCollage(two, "g", { layout: "spiral" as never })).toBe(two);
  });

  test("a cell moved by hand is left exactly as it is, by every slider; the others still follow", () => {
    const moved = setClipTransform(two, "x1", { x: 0.1 });
    const next = relayCollage(moved, "g", { border: 0.04, corner: 1 });
    expect(cellOf(next, "x1")).toBe(cellOf(moved, "x1"));
    expect(cellOf(next, "x2")).toMatchObject({ mask: "rounded", transform: { scale: 0.44 }, collage: { border: 0.04, corner: 1 } });
  });

  test("after the project's shape changed the cells still count as in place, and a re-lay fits them to the new shape", () => {
    const square: Project = { ...two, aspectRatio: "1:1" };
    expect(square.layers).toBe(two.layers);                                 // changing the ratio moved nothing
    const next = relayCollage(square, "g", {});
    expect(cellOf(next, "x1")).toMatchObject({ transform: { scale: 0.5, x: -0.25, y: 0 }, crop: { x: 0.055556, y: 0, w: 0.888889, h: 1 }, collage: { aspect: 1 } });
    expect(relayCollage(next, "g", {})).toBe(next);
  });
});

test("refitReplacedCell: a new picture in a cell that was in place is fitted to the cell; a cell moved by hand, a plain layer and a refused swap are left as they are", () => {
  const media = { sourceUri: "file:///new.jpg", sourceDuration: 60, width: 1920, height: 1080, kind: "photo" as const };
  const swapped = replaceClipMedia(two, "x1", media);
  expect(cellOf(swapped, "x1").crop).toEqual({ x: 0.25, y: 0, w: 0.5, h: 1 });                  // the old picture's crop: the wrong shape for the new one
  const fitted = refitReplacedCell(two, swapped, "x1");
  expect(cellOf(fitted, "x1")).toMatchObject({ sourceUri: "file:///new.jpg", width: 1920, height: 1080, transform: { scale: 0.5, x: -0.25, y: 0 }, crop: { x: 0.420898, y: 0, w: 0.158203, h: 1 }, collage: tag(0) });
  expect(cellOf(fitted, "x2")).toBe(cellOf(two, "x2"));
  const moved = setClipTransform(two, "x1", { x: 0.1 });
  const movedSwap = replaceClipMedia(moved, "x1", media);
  expect(refitReplacedCell(moved, movedSwap, "x1")).toBe(movedSwap);
  expect(refitReplacedCell(two, two, "x1")).toBe(two);
  const plain = makeProject({ clips: [a, b], layers: [{ ...photo("l"), start: 0 }] });
  const plainSwap = replaceClipMedia(plain, "l", media);
  expect(refitReplacedCell(plain, plainSwap, "l")).toBe(plainSwap);
  expect(refitReplacedCell(two, swapped, "a")).toBe(swapped);
});

test("collageOf: a layer's tag, or null", () => {
  expect(collageOf(two, "x2")).toEqual(tag(1));
  expect(collageOf(two, "a")).toBeNull();
  expect(collageOf(two, "gone")).toBeNull();
});

// ---- Beyond the brief: the limits against what is already in the project, and the promise that nothing else is rewritten ----

test("the layer limits hold with what is already there: exactly the free layers, and videos counted over the collage's own time only", () => {
  const photoLayer = (i: number): LayerClip => ({ ...makePhotoClip({ id: `l${i}` }), start: 0 });
  const with4 = makeProject({ clips: [a, b], layers: [0, 1, 2, 3].map(photoLayer) });
  const with5 = makeProject({ clips: [a, b], layers: [0, 1, 2, 3, 4].map(photoLayer) });
  const four = [photo("x1"), photo("x2"), photo("x3"), photo("x4")];
  expect(addCollage(with4, four, "grid4", 0, "g").layers).toHaveLength(LAYER_LIMITS.max);          // 4 + 4 = 8: the last free ones
  expect(collageRefusal(with5, four, "grid4", 0)).toBe("limit");
  expect(collageRefusal(with5, four, "row3", 0)).toBeNull();                                        // 5 + 3
  // Two videos play from 4 s. A 10 s video beside a 3 s one is cut to 3 s, so from 1 s the collage ends as they start: allowed.
  const later = makeProject({ clips: [a, b], layers: [makeLayer({ id: "o1", sourceDuration: 4, start: 4 }), makeLayer({ id: "o2", sourceDuration: 4, start: 4 })] });
  expect(collageRefusal(later, [video("v", 10), video("w", 3)], "stacked", 1)).toBeNull();
  expect(collageRefusal(later, [video("v", 10), video("w", 3)], "stacked", 1.5)).toBe("overlap");   // 1.5 – 4.5
  expect(collageRefusal(later, [video("v", 10), photo("x")], "stacked", 1)).toBe("overlap");        // nothing shorter: 9 s, to the end
  // One video there, two in the collage, on screen together.
  const one = makeProject({ clips: [a, b], layers: [makeLayer({ id: "o1", sourceDuration: 4, start: 1 })] });
  expect(collageRefusal(one, [video("v", 3), video("w", 3)], "stacked", 2)).toBe("overlap");
  expect(collageRefusal(one, [video("v", 3), photo("x")], "stacked", 2)).toBeNull();
  const added = addCollage(one, [video("v", 3), photo("x")], "stacked", 2, "g");
  expect(added.layers[0]).toBe(one.layers[0]);                                                      // the layer that was there is not rewritten
});

test("a start before 0 is 0, and the length is worked out from there; a layout that does not exist is refused", () => {
  const next = addCollage(project, [photo("x1"), photo("x2")], "sideBySide", -4, "g");
  expect(next.layers.map((l) => [l.start, l.trimEnd])).toEqual([[0, 3], [0, 3]]);
  expect(collageLength(project, [photo("x")], -4)).toBe(3);
  expect(collageLength(makeProject({ clips: [makeClip({ id: "s", sourceDuration: 2 })] }), [photo("x")], -4)).toBe(2);   // 2 s from 0, not 6 from −4
  expect(collageRefusal(project, [photo("x1"), photo("x2")], "spiral" as never, 0)).toBe("count");
  expect(addCollage(project, [photo("x1"), photo("x2")], "spiral" as never, 0, "g")).toBe(project);
});

test("a picked clip's own movement does not come along: no keyframes and no Motion on a cell, so it is in place from the start", () => {
  const moving = { ...photo("x1"), keyframes: [makeKeyframe({ t: 0, scale: 2 })], motion: { id: "zoomIn" as const, strength: 0.5 } };
  const cell = cellOf(addCollage(project, [moving, photo("x2")], "sideBySide", 2, "g"), "x1");
  expect(cell).toEqual(cellOf(two, "x1"));
  expect("motion" in cell).toBe(false);
  expect(two.layers.every(isCellInPlace)).toBe(true);
});

test("a video that plays backwards or at another speed is cut at the end it plays last, and still lasts the collage's length", () => {
  const fast = { ...video("f", 8), speed: 2 };                 // 4 s on the timeline
  const back = { ...video("r", 6), reversed: true };           // plays 6 → 0
  const next = addCollage(project, [fast, back], "stacked", 0, "g");
  expect(next.layers.map((l) => clipDuration(l))).toEqual([4, 4]);
  expect(cellOf(next, "f")).toMatchObject({ trimStart: 0, trimEnd: 8 });
  expect(cellOf(next, "r")).toMatchObject({ trimStart: 2, trimEnd: 6 });   // its first pictures (the source's end) are kept
});

test("a re-lay touches nothing but this collage's cells: other groups, plain layers and a tag without a cell keep their identity", () => {
  const plain = makeLayer({ id: "plain", sourceDuration: 2, start: 0 });
  const both = addCollage(addCollage({ ...project, layers: [plain] }, [photo("x1"), photo("x2")], "sideBySide", 2, "g"), [photo("y1"), photo("y2")], "stacked", 6, "h");
  const broken: LayerClip = { ...cellOf(both, "x2"), id: "bad", collage: { ...cellOf(both, "x2").collage!, cell: 5 } };   // hand-made: Side by side has no cell 5
  const p: Project = { ...both, layers: [...both.layers, broken] };
  const next = relayCollage(p, "g", { border: 0.04, corner: 2, layout: "stacked" });
  for (const id of ["plain", "y1", "y2", "bad"]) expect(cellOf(next, id)).toBe(cellOf(p, id));
  expect(next.layers.map((l) => l.id)).toEqual(p.layers.map((l) => l.id));
  expect(cellOf(next, "x1").collage).toMatchObject({ layout: "stacked", border: 0.04, corner: 2 });
  expect(cellOf(next, "x2").collage).toMatchObject({ layout: "stacked", border: 0.04, corner: 2 });
  expect(next.overlays).toBe(p.overlays);
  expect(next.audioTracks).toBe(p.audioTracks);
  // And only a broken tag in the group: nothing to do, no undo step.
  const only: Project = { ...project, layers: [broken] };
  expect(relayCollage(only, "g", { border: 0.04 })).toBe(only);
  const swapped = replaceClipMedia(only, "bad", { sourceUri: "file:///n.jpg", sourceDuration: 60, width: 1920, height: 1080, kind: "photo" });
  expect(swapped).not.toBe(only);
  expect(refitReplacedCell(only, swapped, "bad")).toBe(swapped);
});

test("a second picture in a cell (Duplicate copies the tag) follows the sliders with its cell", () => {
  const twice = duplicateLayer(two, "x1");
  expect(twice.layers).toHaveLength(3);
  const next = relayCollage(twice, "g", { border: 0.04 });
  expect(next.layers.map((l) => [l.collage!.cell, l.collage!.border, l.transform.scale])).toEqual([[0, 0.04, 0.44], [0, 0.04, 0.44], [1, 0.04, 0.44]]);
});

test("a cell that is turned or keyframed by hand is left alone too, and a panorama kept at the smallest scale still counts as in place", () => {
  const turned: Project = { ...two, layers: two.layers.map((l) => (l.id === "x1" ? { ...l, transform: { ...l.transform, rotation: 90 } } : l)) };
  expect(cellOf(relayCollage(turned, "g", { border: 0.04 }), "x1")).toBe(cellOf(turned, "x1"));
  const pinned: Project = { ...two, layers: two.layers.map((l) => (l.id === "x1" ? { ...l, keyframes: [makeKeyframe({ t: 0 })] } : l)) };
  expect(cellOf(relayCollage(pinned, "g", { corner: 2 }), "x1")).toBe(cellOf(pinned, "x1"));
  // 10000 x 1000 in a Row-of-three cell: stored at scale 0.2 (it reaches over the cell's ends) — still what the layout gave, so it follows.
  const wide = addCollage(project, [photo("p", 10000, 1000), photo("x2"), photo("x3")], "row3", 0, "g");
  const bordered = relayCollage(wide, "g", { border: 0.06 });
  expect(cellOf(bordered, "p")).toMatchObject({ transform: { scale: 0.2 }, crop: { x: 0.45, y: 0, w: 0.1, h: 1 }, collage: { border: 0.06 } });
  expect(isCellInPlace(cellOf(bordered, "p"))).toBe(true);
  expect(relayCollage(bordered, "g", { border: 0 }).layers.map((l) => l.collage!.border)).toEqual([0, 0, 0]);
});

test("refitReplacedCell: a picture of the same shape changes nothing more, and the cell keeps the frame shape it was laid out for", () => {
  const same = replaceClipMedia(two, "x1", { sourceUri: "file:///same.jpg", sourceDuration: 60, width: 1080, height: 1920, kind: "photo" });
  expect(refitReplacedCell(two, same, "x1")).toBe(same);
  const square: Project = { ...two, aspectRatio: "1:1" };
  const swapped = replaceClipMedia(square, "x1", { sourceUri: "file:///new.jpg", sourceDuration: 60, width: 1920, height: 1080, kind: "photo" });
  const fitted = refitReplacedCell(square, swapped, "x1");
  expect(cellOf(fitted, "x1").collage).toEqual(tag(0));                 // still 9:16: Replace is not a re-lay
  expect(isCellInPlace(cellOf(fitted, "x1"))).toBe(true);
  expect(fitted.updatedAt).toBe(swapped.updatedAt);
});
