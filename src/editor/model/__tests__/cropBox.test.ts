import { applyPreset, CROP_PRESETS, dragCorner, moveBox, panToCorner, panToMove } from "../cropBox";
import { CROP_MIN, FULL_CROP, type CropRect } from "../types";

const LANDSCAPE = 16 / 9;
const PORTRAIT = 9 / 16;
const close = (a: CropRect, b: CropRect) => { for (const k of ["x", "y", "w", "h"] as const) expect(a[k]).toBeCloseTo(b[k], 6); };
const pixelRatio = (c: CropRect, sourceAspect: number) => (c.w * sourceAspect) / c.h;
const inside = (c: CropRect) => {
  expect(c.x).toBeGreaterThanOrEqual(0); expect(c.y).toBeGreaterThanOrEqual(0);
  expect(c.x + c.w).toBeLessThanOrEqual(1 + 1e-9); expect(c.y + c.h).toBeLessThanOrEqual(1 + 1e-9);
};
const box: CropRect = { x: 0.2, y: 0.3, w: 0.4, h: 0.4 };

test("presets are Free, 9:16, 1:1, 4:5, 16:9", () => {
  expect(CROP_PRESETS.map((p) => p.label)).toEqual(["Free", "9:16", "1:1", "4:5", "16:9"]);
  expect(CROP_PRESETS.map((p) => p.ratio)).toEqual([null, 9 / 16, 1, 4 / 5, 16 / 9]);
});

describe("moveBox", () => {
  test("moves by the deltas inside the picture", () => close(moveBox(box, 0.1, -0.1), { x: 0.3, y: 0.2, w: 0.4, h: 0.4 }));
  test("clamps at the left and top edges", () => close(moveBox(box, -1, -1), { x: 0, y: 0, w: 0.4, h: 0.4 }));
  test("clamps at the right and bottom edges", () => close(moveBox(box, 1, 1), { x: 0.6, y: 0.6, w: 0.4, h: 0.4 }));
  test("a full box cannot move", () => close(moveBox(FULL_CROP, 0.3, -0.2), FULL_CROP));
});

describe("dragCorner, free", () => {
  test("br grows right and down; the top-left stays", () => close(dragCorner(box, "br", 0.1, 0.2, null, LANDSCAPE), { x: 0.2, y: 0.3, w: 0.5, h: 0.6 }));
  test("tl moves the left and top sides; the bottom-right stays", () => close(dragCorner(box, "tl", 0.1, -0.1, null, LANDSCAPE), { x: 0.3, y: 0.2, w: 0.3, h: 0.5 }));
  test("tr moves the right and top sides", () => close(dragCorner(box, "tr", 0.1, 0.1, null, LANDSCAPE), { x: 0.2, y: 0.4, w: 0.5, h: 0.3 }));
  test("bl moves the left and bottom sides", () => close(dragCorner(box, "bl", -0.1, 0.1, null, LANDSCAPE), { x: 0.1, y: 0.3, w: 0.5, h: 0.5 }));
  test("clamps to the picture", () => {
    close(dragCorner(box, "br", 5, 5, null, LANDSCAPE), { x: 0.2, y: 0.3, w: 0.8, h: 0.7 });
    close(dragCorner(box, "tl", -5, -5, null, LANDSCAPE), { x: 0, y: 0, w: 0.6, h: 0.7 });
  });
  test("never goes below the minimum size; the opposite corner stays", () => {
    const r = dragCorner(box, "tl", 1, 1, null, LANDSCAPE);
    close(r, { x: 0.6 - CROP_MIN, y: 0.7 - CROP_MIN, w: CROP_MIN, h: CROP_MIN });
    close(dragCorner(box, "br", -1, -1, null, LANDSCAPE), { x: 0.2, y: 0.3, w: CROP_MIN, h: CROP_MIN });
  });
});

describe("dragCorner, locked", () => {
  // 1:1 on a 16:9 source: w × 16/9 / h = 1, so w = 0.5625 h.
  const square: CropRect = { x: 0.2, y: 0.2, w: 0.5625 * 0.4, h: 0.4 };
  test("1:1 on a 16:9 source keeps w × sourceAspect / h = 1", () => {
    const r = dragCorner(square, "br", 0.05, 0.3, 1, LANDSCAPE);
    expect(pixelRatio(r, LANDSCAPE)).toBeCloseTo(1, 6);
    expect(r.x).toBeCloseTo(0.2, 6); expect(r.y).toBeCloseTo(0.2, 6);
    expect(r.h).toBeCloseTo(0.7, 6);   // the height drag (0.3 → 0.169 in width) beats the width drag (0.05)
  });
  test("the larger component wins: a width drag sets the size", () => {
    const r = dragCorner(square, "br", 0.2, 0.01, 1, LANDSCAPE);
    expect(r.w).toBeCloseTo(0.225 + 0.2, 6);
    expect(pixelRatio(r, LANDSCAPE)).toBeCloseTo(1, 6);
  });
  test("tl keeps the bottom-right corner fixed", () => {
    const r = dragCorner(square, "tl", -0.05, -0.1, 1, LANDSCAPE);
    expect(r.x + r.w).toBeCloseTo(0.2 + 0.225, 6); expect(r.y + r.h).toBeCloseTo(0.6, 6);
    expect(pixelRatio(r, LANDSCAPE)).toBeCloseTo(1, 6);
  });
  test("a corner pushed past an edge keeps the ratio and stays inside", () => {
    for (const corner of ["tl", "tr", "bl", "br"] as const) {
      const r = dragCorner(square, corner, corner.includes("l") ? -5 : 5, corner.includes("t") ? -5 : 5, 1, LANDSCAPE);
      expect(pixelRatio(r, LANDSCAPE)).toBeCloseTo(1, 6);
      inside(r);
    }
    const br = dragCorner(square, "br", 5, 5, 1, LANDSCAPE);
    expect(br.y + br.h).toBeCloseTo(1, 6);   // height-limited: bottom edge reached
    expect(br.x).toBeCloseTo(0.2, 6);
  });
  test("shrinking stops at the minimum size at that ratio", () => {
    const r = dragCorner(square, "br", -1, -1, 1, LANDSCAPE);
    expect(Math.min(r.w, r.h)).toBeCloseTo(CROP_MIN, 6);
    expect(pixelRatio(r, LANDSCAPE)).toBeCloseTo(1, 6);
    expect(r.x).toBeCloseTo(0.2, 6); expect(r.y).toBeCloseTo(0.2, 6);
  });
  test("returns the crop unchanged when the minimum at that ratio does not fit", () => {
    // 9:16 on an extremely wide source needs h = w × sourceAspect × 16/9 → far taller than the picture.
    const c: CropRect = { x: 0.4, y: 0.4, w: 0.2, h: 0.2 };
    expect(dragCorner(c, "br", 0.1, 0.1, 9 / 16, 40)).toBe(c);
  });
});

describe("applyPreset", () => {
  test("null leaves the box", () => expect(applyPreset(box, null, LANDSCAPE)).toBe(box));
  test("largest box for each preset on a landscape source, centred", () => {
    close(applyPreset(FULL_CROP, 9 / 16, LANDSCAPE), { x: (1 - 0.31640625) / 2, y: 0, w: 0.31640625, h: 1 });
    close(applyPreset(FULL_CROP, 1, LANDSCAPE), { x: (1 - 0.5625) / 2, y: 0, w: 0.5625, h: 1 });
    close(applyPreset(FULL_CROP, 4 / 5, LANDSCAPE), { x: (1 - 0.45) / 2, y: 0, w: 0.45, h: 1 });
    close(applyPreset(FULL_CROP, 16 / 9, LANDSCAPE), FULL_CROP);
  });
  test("largest box for each preset on a portrait source, centred", () => {
    close(applyPreset(FULL_CROP, 9 / 16, PORTRAIT), FULL_CROP);
    close(applyPreset(FULL_CROP, 1, PORTRAIT), { x: 0, y: (1 - 0.5625) / 2, w: 1, h: 0.5625 });
    close(applyPreset(FULL_CROP, 4 / 5, PORTRAIT), { x: 0, y: (1 - 0.703125) / 2, w: 1, h: 0.703125 });
    close(applyPreset(FULL_CROP, 16 / 9, PORTRAIT), { x: 0, y: (1 - 0.31640625) / 2, w: 1, h: 0.31640625 });
  });
  test("centres on the current box, shifted (not shrunk) to stay inside", () => {
    const r = applyPreset({ x: 0.8, y: 0.1, w: 0.2, h: 0.2 }, 1, LANDSCAPE);
    close(r, { x: 1 - 0.5625, y: 0, w: 0.5625, h: 1 });
    const mid = applyPreset({ x: 0.3, y: 0.3, w: 0.2, h: 0.2 }, 1, LANDSCAPE);
    expect(mid.x + mid.w / 2).toBeCloseTo(0.4, 6);
  });
  test("an extreme source that cannot meet the minimum returns the crop unchanged", () => {
    expect(applyPreset(box, 9 / 16, 40)).toBe(box);
  });
});

describe("unusable inputs leave the crop unchanged", () => {
  const BAD = [0, -1, NaN, Infinity];
  test("applyPreset with a source aspect of 0, negative, NaN or Infinity", () => {
    for (const a of BAD) expect(applyPreset(box, 1, a)).toBe(box);
  });
  test("dragCorner with a source aspect of 0, negative, NaN or Infinity, free or locked", () => {
    for (const a of BAD) for (const r of [null, 1]) expect(dragCorner(box, "br", 0.1, 0.1, r, a)).toBe(box);
  });
  test("non-finite deltas", () => {
    for (const d of [NaN, Infinity, -Infinity]) {
      expect(moveBox(box, d, 0)).toBe(box);
      expect(moveBox(box, 0, d)).toBe(box);
      expect(dragCorner(box, "tl", d, 0, null, LANDSCAPE)).toBe(box);
      expect(dragCorner(box, "tl", 0, d, 1, LANDSCAPE)).toBe(box);
    }
  });
  test("an unusable ratio", () => {
    expect(applyPreset(box, NaN, LANDSCAPE)).toBe(box);
    expect(dragCorner(box, "br", 0.1, 0.1, 0, LANDSCAPE)).toBe(box);
  });
});

describe("pan handlers", () => {
  test("panToMove converts points to fractions of the drawn picture", () => {
    close(panToMove(box, 40, -30, 400, 300), { x: 0.3, y: 0.2, w: 0.4, h: 0.4 });
  });
  test("panToCorner converts points to fractions and passes the lock through", () => {
    close(panToCorner(box, "br", 40, 60, 400, 300, null, LANDSCAPE), { x: 0.2, y: 0.3, w: 0.5, h: 0.6 });
    const r = panToCorner(box, "br", 40, 60, 400, 300, 1, LANDSCAPE);
    expect(pixelRatio(r, LANDSCAPE)).toBeCloseTo(1, 6);
  });
  test("successive updates from the same start do not stack", () => {
    // Translations are cumulative from the touch-down, so the second update replaces the first.
    panToMove(box, 40, 0, 400, 300);
    close(panToMove(box, 80, 0, 400, 300), { x: 0.4, y: 0.3, w: 0.4, h: 0.4 });
    panToCorner(box, "br", 40, 0, 400, 300, null, LANDSCAPE);
    close(panToCorner(box, "br", 80, 0, 400, 300, null, LANDSCAPE), { x: 0.2, y: 0.3, w: 0.6, h: 0.4 });
  });
  test("an unmeasured picture leaves the start", () => {
    expect(panToMove(box, 10, 10, 0, 300)).toBe(box);
    expect(panToCorner(box, "tl", 10, 10, 400, 0, null, LANDSCAPE)).toBe(box);
  });
});
