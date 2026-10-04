import { moveRect, resizeRectCorner, scaleRect } from "../regionRect";
import { REGION_LIMITS, type EffectRect } from "../types";

const MIN = REGION_LIMITS.min;
const close = (a: EffectRect, b: EffectRect) => { for (const k of ["x", "y", "w", "h"] as const) expect(a[k]).toBeCloseTo(b[k], 9); };
const inside = (r: EffectRect) => {
  expect(r.x).toBeGreaterThanOrEqual(0); expect(r.y).toBeGreaterThanOrEqual(0);
  expect(r.x + r.w).toBeLessThanOrEqual(1 + 1e-9); expect(r.y + r.h).toBeLessThanOrEqual(1 + 1e-9);
  expect(r.w).toBeGreaterThanOrEqual(MIN - 1e-9); expect(r.h).toBeGreaterThanOrEqual(MIN - 1e-9);
};
const box: EffectRect = { x: 0.3, y: 0.4, w: 0.4, h: 0.2 };

describe("moveRect", () => {
  test("moves by the deltas, keeping the size", () => close(moveRect(box, 0.1, -0.2), { x: 0.4, y: 0.2, w: 0.4, h: 0.2 }));
  test("stops at the left and top edges", () => close(moveRect(box, -1, -1), { x: 0, y: 0, w: 0.4, h: 0.2 }));
  test("stops at the right and bottom edges", () => close(moveRect(box, 1, 1), { x: 0.6, y: 0.8, w: 0.4, h: 0.2 }));
  test("a full-frame box cannot move", () => close(moveRect({ x: 0, y: 0, w: 1, h: 1 }, 0.3, -0.2), { x: 0, y: 0, w: 1, h: 1 }));
  test("no movement returns the same rect", () => expect(moveRect(box, 0, 0)).toBe(box));
  test("a move that the edges stop completely returns the same rect", () => {
    const corner: EffectRect = { x: 0, y: 0.79, w: 0.37, h: 0.21 };
    expect(moveRect(corner, -0.2, 0)).toBe(corner);
    const full: EffectRect = { x: 0, y: 0, w: 1, h: 1 };
    expect(moveRect(full, 0.3, -0.2)).toBe(full);
  });
  test("non-finite deltas leave the rect", () => {
    expect(moveRect(box, NaN, 0)).toBe(box);
    expect(moveRect(box, 0, Infinity)).toBe(box);
  });
});

describe("scaleRect", () => {
  test("scales both sides about the centre", () => close(scaleRect(box, 1.5), { x: 0.2, y: 0.35, w: 0.6, h: 0.3 }));
  test("shrinks about the centre", () => close(scaleRect(box, 0.5), { x: 0.4, y: 0.45, w: 0.2, h: 0.1 }));
  test("growing stops when the longer side fills the frame, keeping the shape", () => {
    const r = scaleRect(box, 10);
    close(r, { x: 0, y: 0.25, w: 1, h: 0.5 });
    inside(r);
  });
  test("shrinking stops when the shorter side reaches the minimum, keeping the shape", () => {
    const r = scaleRect(box, 0.001);
    close(r, { x: 0.5 - MIN, y: 0.5 - MIN / 2, w: 2 * MIN, h: MIN });
    inside(r);
  });
  test("a box near an edge is shifted back inside after growing", () => {
    const r = scaleRect({ x: 0.7, y: 0.05, w: 0.3, h: 0.1 }, 2);
    close(r, { x: 0.4, y: 0, w: 0.6, h: 0.2 });
    inside(r);
  });
  test("a factor of 1 returns the same rect", () => expect(scaleRect(box, 1)).toBe(box));
  test("a factor the limits hold at exactly 1 returns the same rect (no rounding drift in x / y)", () => {
    const wide: EffectRect = { x: 0, y: 0.37, w: 1, h: 0.21 };   // already as wide as the frame
    expect(scaleRect(wide, 2)).toBe(wide);
    const small: EffectRect = { x: 0.37, y: 0.41, w: MIN, h: 0.21 };   // the shorter side is already the minimum
    expect(scaleRect(small, 0.5)).toBe(small);
  });
  test("a zero or negative factor gives the smallest box of that shape", () => {
    close(scaleRect(box, 0), scaleRect(box, 0.001));
    close(scaleRect(box, -3), scaleRect(box, 0.001));
  });
  test("a non-finite factor leaves the rect", () => {
    expect(scaleRect(box, NaN)).toBe(box);
    expect(scaleRect(box, Infinity)).toBe(box);
  });
});

describe("resizeRectCorner", () => {
  test("br moves the right and bottom sides; the top-left stays", () => close(resizeRectCorner(box, "br", 0.1, 0.2), { x: 0.3, y: 0.4, w: 0.5, h: 0.4 }));
  test("tl moves the left and top sides; the bottom-right stays", () => close(resizeRectCorner(box, "tl", 0.1, -0.1), { x: 0.4, y: 0.3, w: 0.3, h: 0.3 }));
  test("the sides resize independently (free shape)", () => close(resizeRectCorner(box, "br", -0.2, 0.3), { x: 0.3, y: 0.4, w: 0.2, h: 0.5 }));
  test("br stops at the frame's right and bottom edges", () => {
    const r = resizeRectCorner(box, "br", 5, 5);
    close(r, { x: 0.3, y: 0.4, w: 0.7, h: 0.6 });
    inside(r);
  });
  test("tl stops at the frame's left and top edges", () => {
    const r = resizeRectCorner(box, "tl", -5, -5);
    close(r, { x: 0, y: 0, w: 0.7, h: 0.6 });
    inside(r);
  });
  test("br cannot go below the minimum side; the top-left stays", () => close(resizeRectCorner(box, "br", -5, -5), { x: 0.3, y: 0.4, w: MIN, h: MIN }));
  test("tl cannot go below the minimum side; the bottom-right stays", () => {
    const r = resizeRectCorner(box, "tl", 5, 5);
    close(r, { x: 0.7 - MIN, y: 0.6 - MIN, w: MIN, h: MIN });
    inside(r);
  });
  test("a drag inward on a minimum-size box returns the same rect", () => {
    const tiny: EffectRect = { x: 0.37, y: 0.41, w: MIN, h: MIN };
    expect(resizeRectCorner(tiny, "tl", 0.1, 0.1)).toBe(tiny);
    expect(resizeRectCorner(tiny, "br", -0.1, -0.1)).toBe(tiny);
  });
  test("tl keeps the exact x (or y) of a side that cannot shrink", () => {
    const thin: EffectRect = { x: 0.1, y: 0.41, w: MIN, h: 0.3 };   // 0.1 + 0.05 − 0.05 is not exactly 0.1
    const r = resizeRectCorner(thin, "tl", 0.1, 0.1);
    expect(r.x).toBe(0.1);
    expect(r.w).toBe(MIN);
    close(r, { x: 0.1, y: 0.51, w: MIN, h: 0.2 });
  });
  test("no movement returns the same rect", () => {
    expect(resizeRectCorner(box, "tl", 0, 0)).toBe(box);
    expect(resizeRectCorner(box, "br", 0, 0)).toBe(box);
  });
  test("non-finite deltas leave the rect", () => {
    expect(resizeRectCorner(box, "br", NaN, 0)).toBe(box);
    expect(resizeRectCorner(box, "tl", 0, -Infinity)).toBe(box);
  });
});
