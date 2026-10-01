import { CAPTION_STYLE, FILTERS, SHAPES, TRANSITIONS } from "../effects";
import { FILTER_IDS, SHAPE_IDS, TRANSITION_TYPES } from "../model/types";

test("registry covers every id with sane preview params", () => {
  expect(FILTER_IDS).toHaveLength(8);
  for (const id of FILTER_IDS) {
    const f = FILTERS[id];
    expect(f.label.length).toBeGreaterThan(0);
    expect(f.preview.tintOpacity).toBeGreaterThanOrEqual(0); expect(f.preview.tintOpacity).toBeLessThanOrEqual(0.5);
    expect(f.preview.saturation).toBeGreaterThanOrEqual(0); expect(f.preview.saturation).toBeLessThanOrEqual(2);
    expect(Math.abs(f.preview.brightness)).toBeLessThanOrEqual(0.3);
  }
  expect(FILTERS.none.preview).toEqual({ tint: "#000000", tintOpacity: 0, saturation: 1, brightness: 0 });
  expect(TRANSITION_TYPES).toHaveLength(5);
  for (const t of TRANSITION_TYPES) expect(TRANSITIONS[t].label.length).toBeGreaterThan(0);
});

test("shape paths use only absolute M/L/C/Q/Z commands in a 100×100 box", () => {
  expect(SHAPE_IDS).toHaveLength(7);
  for (const id of SHAPE_IDS) {
    const path = SHAPES[id].path;
    expect(path.startsWith("M")).toBe(true);
    expect(path.trim().endsWith("Z")).toBe(true);
    expect(path).toMatch(/^[MLCQZ0-9 .-]+$/);
    for (const n of path.match(/-?\d+(\.\d+)?/g) ?? []) { expect(Number(n)).toBeGreaterThanOrEqual(0); expect(Number(n)).toBeLessThanOrEqual(100); }
  }
});

test("caption style default", () => {
  expect(CAPTION_STYLE).toEqual({ fontId: "montserrat", fontScale: 0.045, color: "#FFFFFF", background: { color: "#000000", opacity: 0.6 }, outline: false, align: "center", x: 0.5, y: 0.86 });
});
