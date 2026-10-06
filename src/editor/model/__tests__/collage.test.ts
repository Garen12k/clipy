import { placeClip } from "../clipLayout";
import { COLLAGE, cellPlacement, collageCells, isCellInPlace, placeInCell, type CellRect } from "../collage";
import { clampCrop, clampTransform, COLLAGE_CELLS, COLLAGE_LAYOUT_IDS, COLLAGE_LIMITS, CROP_MIN, DEFAULT_TRANSFORM, makeKeyframe, makePhotoClip, TRANSFORM_LIMITS, type CollageCell } from "../types";

const RATIOS = [9 / 16, 16 / 9, 1, 21 / 9, 9 / 21, 4 / 3, 3 / 4, 3 / 2, 2 / 3];
const PORTRAIT = { width: 1080, height: 1920 }, LANDSCAPE = { width: 1920, height: 1080 }, SQUARE = { width: 1000, height: 1000 }, PHOTO43 = { width: 4032, height: 3024 };
const close = (cells: CellRect[], want: number[][]) => {
  expect(cells).toHaveLength(want.length);
  cells.forEach((c, i) => { expect(c.x).toBeCloseTo(want[i][0], 9); expect(c.y).toBeCloseTo(want[i][1], 9); expect(c.w).toBeCloseTo(want[i][2], 9); expect(c.h).toBeCloseTo(want[i][3], 9); });
};

test("every layout has as many cells as COLLAGE_CELLS says; without a border they tile the frame (Inset aside)", () => {
  for (const id of COLLAGE_LAYOUT_IDS) for (const a of RATIOS) {
    const cells = collageCells(id, a, 0);
    expect(cells).toHaveLength(COLLAGE_CELLS[id]);
    if (id !== "inset") expect(cells.reduce((sum, c) => sum + c.w * c.h, 0)).toBeCloseTo(1, 9);
    for (const c of cells) { expect(c.x).toBeGreaterThanOrEqual(0); expect(c.y).toBeGreaterThanOrEqual(0); expect(c.x + c.w).toBeLessThanOrEqual(1 + 1e-9); expect(c.y + c.h).toBeLessThanOrEqual(1 + 1e-9); }
  }
});

test("the six layouts without a border", () => {
  close(collageCells("sideBySide", 9 / 16, 0), [[0, 0, 0.5, 1], [0.5, 0, 0.5, 1]]);
  close(collageCells("stacked", 9 / 16, 0), [[0, 0, 1, 0.5], [0, 0.5, 1, 0.5]]);
  close(collageCells("row3", 9 / 16, 0), [[0, 0, 1 / 3, 1], [1 / 3, 0, 1 / 3, 1], [2 / 3, 0, 1 / 3, 1]]);
  close(collageCells("grid4", 1, 0), [[0, 0, 0.5, 0.5], [0.5, 0, 0.5, 0.5], [0, 0.5, 0.5, 0.5], [0.5, 0.5, 0.5, 0.5]]);
  close(collageCells("inset", 9 / 16, 0), [[0, 0, 1, 1], [0.62, 0.62, 0.34, 0.34]]);
  expect(COLLAGE).toEqual({ insetAt: 0.62, insetSize: 0.34, inPlace: 1e-5 });
});

test("Big and two: the big cell is on top in a tall frame and on the left in a wide or square one", () => {
  close(collageCells("bigTwo", 9 / 16, 0), [[0, 0, 1, 0.5], [0, 0.5, 0.5, 0.5], [0.5, 0.5, 0.5, 0.5]]);
  close(collageCells("bigTwo", 16 / 9, 0), [[0, 0, 0.5, 1], [0.5, 0, 0.5, 0.5], [0.5, 0.5, 0.5, 0.5]]);
  close(collageCells("bigTwo", 1, 0), [[0, 0, 0.5, 1], [0.5, 0, 0.5, 0.5], [0.5, 0.5, 0.5, 0.5]]);
});

test("the border is a fraction of the SHORTER side: the same pixels at the edges and between cells, in both directions", () => {
  // 9:16, b = 0.04: gx = 0.04, gy = 0.04·9/16 = 0.0225 → x' = gx + x(1 − gx), w' = w(1 − gx) − gx.
  close(collageCells("sideBySide", 9 / 16, 0.04), [[0.04, 0.0225, 0.44, 0.955], [0.52, 0.0225, 0.44, 0.955]]);
  // 16:9: the other way round.
  close(collageCells("sideBySide", 16 / 9, 0.04), [[0.0225, 0.04, 0.46625, 0.92], [0.51125, 0.04, 0.46625, 0.92]]);
  close(collageCells("grid4", 1, 0.02), [[0.02, 0.02, 0.47, 0.47], [0.51, 0.02, 0.47, 0.47], [0.02, 0.51, 0.47, 0.47], [0.51, 0.51, 0.47, 0.47]]);
  close(collageCells("inset", 9 / 16, 0.06), [[0.06, 0.03375, 0.88, 0.9325], [0.6428, 0.632825, 0.2596, 0.294775]]);
  close(collageCells("stacked", 21 / 9, 0.06), [[0.06 * 9 / 21, 0.06, 1 - 0.12 * 9 / 21, 0.41], [0.06 * 9 / 21, 0.53, 1 - 0.12 * 9 / 21, 0.41]]);
  // In pixels of a 1080-wide 9:16 frame: left edge, middle gap and top edge are all 43.2.
  const [a, b] = collageCells("sideBySide", 9 / 16, 0.04);
  expect(a.x * 1080).toBeCloseTo(43.2, 6);
  expect((b.x - (a.x + a.w)) * 1080).toBeCloseTo(43.2, 6);
  expect(a.y * 1920).toBeCloseTo(43.2, 6);
});

test("collageCells is total: a frame shape that cannot be used counts as square, a border that is not a number as none", () => {
  for (const bad of [0, -1, NaN, Infinity]) close(collageCells("bigTwo", bad, 0), [[0, 0, 0.5, 1], [0.5, 0, 0.5, 0.5], [0.5, 0.5, 0.5, 0.5]]);
  close(collageCells("sideBySide", 1, NaN), [[0, 0, 0.5, 1], [0.5, 0, 0.5, 1]]);
  close(collageCells("sideBySide", 1, -0.5), [[0, 0, 0.5, 1], [0.5, 0, 0.5, 1]]);
});

test("cellPlacement: the picture is cropped to the cell's shape, centred, and scaled onto the cell", () => {
  const at = (media: { width: number; height: number }, layout: Parameters<typeof collageCells>[0], aspect: number, border: number, i: number) => cellPlacement(media, collageCells(layout, aspect, border)[i], aspect);
  expect(at(PORTRAIT, "sideBySide", 9 / 16, 0, 0)).toEqual({ crop: { x: 0.25, y: 0, w: 0.5, h: 1 }, scale: 0.5, x: -0.25, y: 0 });
  expect(at(LANDSCAPE, "sideBySide", 9 / 16, 0, 1)).toEqual({ crop: { x: 0.420898, y: 0, w: 0.158203, h: 1 }, scale: 0.5, x: 0.25, y: 0 });
  expect(at(LANDSCAPE, "stacked", 9 / 16, 0, 0)).toEqual({ crop: { x: 0.183594, y: 0, w: 0.632813, h: 1 }, scale: 0.5, x: 0, y: -0.25 });
  expect(at(PORTRAIT, "stacked", 9 / 16, 0, 1)).toEqual({ crop: { x: 0, y: 0.25, w: 1, h: 0.5 }, scale: 0.5, x: 0, y: 0.25 });
  expect(at(PHOTO43, "grid4", 1, 0.02, 3)).toEqual({ crop: { x: 0.125, y: 0, w: 0.75, h: 1 }, scale: 0.47, x: 0.245, y: 0.245 });
  expect(at(SQUARE, "row3", 16 / 9, 0, 1)).toEqual({ crop: { x: 0.203704, y: 0, w: 0.592593, h: 1 }, scale: 0.333333, x: 0, y: 0 });      // never −0
  expect(at(SQUARE, "row3", 16 / 9, 0, 0)).toEqual({ crop: { x: 0.203704, y: 0, w: 0.592593, h: 1 }, scale: 0.333333, x: -0.333333, y: 0 });
  expect(at(PORTRAIT, "inset", 9 / 16, 0, 0)).toEqual({ crop: { x: 0, y: 0, w: 1, h: 1 }, scale: 1, x: 0, y: 0 });
  expect(at(PORTRAIT, "inset", 9 / 16, 0, 1)).toEqual({ crop: { x: 0, y: 0, w: 1, h: 1 }, scale: 0.34, x: 0.29, y: 0.29 });
  expect(at(LANDSCAPE, "inset", 9 / 16, 0.06, 1)).toEqual({ crop: { x: 0.360675, y: 0, w: 0.27865, h: 1 }, scale: 0.2596, x: 0.2726, y: 0.280213 });
  expect(at(LANDSCAPE, "bigTwo", 16 / 9, 0, 0)).toEqual({ crop: { x: 0.25, y: 0, w: 0.5, h: 1 }, scale: 0.5, x: -0.25, y: 0 });
  expect(at(PORTRAIT, "bigTwo", 9 / 16, 0.04, 2)).toEqual({ crop: { x: 0.02815, y: 0, w: 0.9437, h: 1 }, scale: 0.44, x: 0.24, y: 0.244375 });
  expect(at(PORTRAIT, "sideBySide", 9 / 16, 0.04, 0)).toEqual({ crop: { x: 0.269634, y: 0, w: 0.460733, h: 1 }, scale: 0.44, x: -0.24, y: 0 });
  expect(at(PORTRAIT, "sideBySide", 1, 0, 0)).toEqual({ crop: { x: 0.055556, y: 0, w: 0.888889, h: 1 }, scale: 0.5, x: -0.25, y: 0 });
});

test("the crop limit: a picture more than ten times wider than its cell is fitted INSIDE the cell, never over a neighbour", () => {
  // A 16:9 video in a Row-of-three cell of a 9:16 frame with the widest border would need a crop of 0.086 wide: it gets 0.1.
  const cell = collageCells("row3", 9 / 16, 0.06)[0];
  const at = cellPlacement(LANDSCAPE, cell, 9 / 16);
  expect(at).toEqual({ crop: { x: 0.45, y: 0, w: 0.1, h: 1 }, scale: 0.253333, x: -0.313333, y: 0 });   // the tenth that is kept is the middle one
  const box = placeClip(LANDSCAPE, at.crop, { ...DEFAULT_TRANSFORM, scale: at.scale, x: at.x, y: at.y }, 1080, 1920);
  expect(box.width).toBeCloseTo(cell.w * 1080, 1);          // as wide as the cell …
  expect(box.height).toBeLessThan(cell.h * 1920);           // … and shorter: a gap above and below
});

test("PROOF for every layout, ratio, border and picture shape the placed box IS the cell (inside it at the crop limit), and what is stored survives the model's clamps", () => {
  for (const layout of COLLAGE_LAYOUT_IDS) for (const aspect of RATIOS) for (const border of [0, 0.005, 0.03, 0.06]) for (const media of [PORTRAIT, LANDSCAPE, SQUARE, PHOTO43]) {
    const frameW = 1080, frameH = 1080 / aspect;
    for (const cell of collageCells(layout, aspect, border)) {
      const at = cellPlacement(media, cell, aspect);
      const t = { ...DEFAULT_TRANSFORM, scale: at.scale, x: at.x, y: at.y };
      expect(clampCrop(at.crop)).toEqual(at.crop);
      expect(clampTransform(t)).toEqual(t);                 // scale ≥ 0.2, offsets inside ±1
      const box = placeClip(media, at.crop, t, frameW, frameH);
      const limited = at.crop.w === 0.1 || at.crop.h === 0.1;
      expect(box.centerX).toBeCloseTo((cell.x + cell.w / 2) * frameW, 2);
      expect(box.centerY).toBeCloseTo((cell.y + cell.h / 2) * frameH, 2);
      if (limited) { expect(box.width).toBeLessThanOrEqual(cell.w * frameW + 0.01); expect(box.height).toBeLessThanOrEqual(cell.h * frameH + 0.01); }
      else { expect(Math.abs(box.width - cell.w * frameW)).toBeLessThan(0.01); expect(Math.abs(box.height - cell.h * frameH)).toBeLessThan(0.01); }
    }
  }
});

/**
 * The same proof a second way, in fractions of the frame and edge by edge: the rectangle a layer covers on screen is worked out
 * only by `placeClip` (what ClipFrame and the export's ClipLayout.swift use) from the three stored things — crop, scale, offset.
 * Six stored decimals are all that separates the two: `OUT` is how far an edge may lie outside its cell (half a millionth on the
 * offset, half of that again on the scale), `IN` how far inside — the crop's rounded width or height makes the box a hair thinner
 * than the cell, and the box is fitted, so the hair is always a gap, never an overlap (0.003 px of a 1080 frame).
 */
describe("on screen: every cell's picture covers exactly its cell", () => {
  const OUT = 1e-6, IN = 3e-6;
  const FRAMES = [9 / 16, 16 / 9, 1, 4 / 5];
  const SHAPES = [PORTRAIT, LANDSCAPE, SQUARE];
  const BORDERS = [COLLAGE_LIMITS.border[0], COLLAGE_LIMITS.border[1]];
  /** left, top, right, bottom of the placed box, as fractions of the frame. */
  const covered = (media: { width: number; height: number }, cell: CellRect, aspect: number) => {
    const frameW = 1080, frameH = 1080 / aspect, at = cellPlacement(media, cell, aspect);
    const box = placeClip(media, at.crop, { ...DEFAULT_TRANSFORM, scale: at.scale, x: at.x, y: at.y }, frameW, frameH);
    return { l: (box.centerX - box.width / 2) / frameW, t: (box.centerY - box.height / 2) / frameH, r: (box.centerX + box.width / 2) / frameW, b: (box.centerY + box.height / 2) / frameH, at };
  };
  const overlap = (a: CellRect, b: CellRect) => Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 1e-12 && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 1e-12;

  test("cells stay inside the frame and never overlap (Inset: the small cell lies inside the big one, by design)", () => {
    for (const layout of COLLAGE_LAYOUT_IDS) for (const aspect of [...FRAMES, ...RATIOS]) for (const border of [0, 0.005, 0.03, 0.06]) {
      const cells = collageCells(layout, aspect, border);
      const gx = border * Math.min(1, 1 / aspect), gy = border * Math.min(aspect, 1);
      for (const c of cells) {
        expect(c.w).toBeGreaterThan(0); expect(c.h).toBeGreaterThan(0);
        expect(c.x).toBeGreaterThanOrEqual(gx - 1e-12); expect(c.y).toBeGreaterThanOrEqual(gy - 1e-12);          // the border is kept at the frame's edge too
        expect(c.x + c.w).toBeLessThanOrEqual(1 - gx + 1e-12); expect(c.y + c.h).toBeLessThanOrEqual(1 - gy + 1e-12);
      }
      if (layout === "inset") {
        const [big, small] = cells;
        expect(small.x).toBeGreaterThan(big.x); expect(small.y).toBeGreaterThan(big.y);
        expect(small.x + small.w).toBeLessThan(big.x + big.w + 1e-12); expect(small.y + small.h).toBeLessThan(big.y + big.h + 1e-12);
      } else for (let i = 0; i < cells.length; i++) for (let j = i + 1; j < cells.length; j++) expect(overlap(cells[i], cells[j])).toBe(false);
    }
  });

  test("the covered rectangle equals the cell, edge by edge; at the crop limit it is centred inside the cell and touches two of its sides", () => {
    let exact = 0, limited = 0;
    for (const layout of COLLAGE_LAYOUT_IDS) for (const aspect of FRAMES) for (const border of BORDERS) for (const media of SHAPES) {
      for (const cell of collageCells(layout, aspect, border)) {
        const { l, t, r, b, at } = covered(media, cell, aspect);
        const dl = l - cell.x, dt = t - cell.y, dr = cell.x + cell.w - r, db = cell.y + cell.h - b;      // how far INSIDE the cell each edge is
        if (at.crop.w === CROP_MIN || at.crop.h === CROP_MIN) {
          limited++;
          for (const d of [dl, dt, dr, db]) expect(d).toBeGreaterThan(-OUT);                              // never over a neighbour
          expect(Math.abs(dl - dr)).toBeLessThan(2 * OUT); expect(Math.abs(dt - db)).toBeLessThan(2 * OUT);     // centred
          expect(Math.min(Math.abs(dl), Math.abs(dt))).toBeLessThan(OUT);                                 // one direction is filled
        } else {
          exact++;
          for (const d of [dl, dt, dr, db]) { expect(d).toBeGreaterThan(-OUT); expect(d).toBeLessThan(IN); }
        }
      }
    }
    expect(exact).toBeGreaterThan(300);
    expect(limited).toBeGreaterThan(0);                     // 16:9 in Row of three, 9:16, widest border — and nothing else in this table
    expect(limited).toBeLessThan(10);
  });
});

test("the scale limit: a picture so long that even a tenth of it cannot be fitted at the smallest scale is stored at that scale, never below", () => {
  const cell = collageCells("row3", 9 / 16, 0.06)[0];
  const at = cellPlacement({ width: 10000, height: 1000 }, cell, 9 / 16);
  expect(at.crop).toEqual({ x: 0.45, y: 0, w: 0.1, h: 1 });
  expect(at.scale).toBe(TRANSFORM_LIMITS.scale[0]);
  const t = { ...DEFAULT_TRANSFORM, scale: at.scale, x: at.x, y: at.y };
  expect(clampTransform(t)).toEqual(t);
});

test("cellPlacement is total: a picture without a size is treated as cell-shaped", () => {
  const cell = collageCells("sideBySide", 9 / 16, 0)[0];
  for (const bad of [{ width: 0, height: 100 }, { width: NaN, height: 100 }, { width: 100, height: -1 }]) expect(cellPlacement(bad, cell, 9 / 16)).toEqual({ crop: { x: 0, y: 0, w: 1, h: 1 }, scale: 0.5, x: -0.25, y: 0 });
});

describe("placeInCell / isCellInPlace", () => {
  const tag: CollageCell = { group: "g", layout: "sideBySide", cell: 0, border: 0, corner: 0, aspect: 9 / 16 };
  const base = { ...makePhotoClip({ id: "c", mask: "circle", transform: { scale: 2, x: 0.3, y: 0.3, rotation: 40, flipH: true, flipV: false } }), start: 3 };
  const placed = placeInCell(base, tag);

  test("placeInCell writes scale, offset, rotation 0, the crop and the tag — and keeps flips, the mask and everything else", () => {
    expect(placed).toEqual({ ...base, transform: { scale: 0.5, x: -0.25, y: 0, rotation: 0, flipH: true, flipV: false }, crop: { x: 0.25, y: 0, w: 0.5, h: 1 }, collage: tag });
    expect(placed.collage).not.toBe(tag);
    expect(base.transform.scale).toBe(2);                   // not mutated
  });

  test("in place: exactly what the layout gave, judged against the tag's own frame shape", () => {
    expect(isCellInPlace(placed)).toBe(true);
    expect(isCellInPlace({ ...placed, mask: "none", opacity: 0.4, filter: "warm" })).toBe(true);                                 // a look is not a move
    expect(isCellInPlace({ ...placed, transform: { ...placed.transform, flipV: true } })).toBe(true);                             // nor is a flip
    expect(isCellInPlace({ ...placed, transform: { ...placed.transform, x: placed.transform.x + 0.000004 } })).toBe(true);        // inside the tolerance
  });

  test("not in place: moved, resized, turned, re-cropped, keyframed, or no tag at all", () => {
    expect(isCellInPlace(base)).toBe(false);
    expect(isCellInPlace({ ...placed, transform: { ...placed.transform, x: -0.24 } })).toBe(false);
    expect(isCellInPlace({ ...placed, transform: { ...placed.transform, scale: 0.6 } })).toBe(false);
    expect(isCellInPlace({ ...placed, transform: { ...placed.transform, rotation: 90 } })).toBe(false);
    expect(isCellInPlace({ ...placed, crop: { x: 0.2, y: 0, w: 0.5, h: 1 } })).toBe(false);
    expect(isCellInPlace({ ...placed, keyframes: [makeKeyframe({ t: 0 })] })).toBe(false);
    expect(isCellInPlace({ ...placed, width: 1920, height: 1080 })).toBe(false);                                                  // another picture: its crop no longer fits
  });

  test("a tag whose cell its layout does not have places nothing and is never in place", () => {
    const bad = { ...tag, cell: 5 };
    expect(placeInCell(base, bad)).toBe(base);
    expect(isCellInPlace({ ...placed, collage: bad })).toBe(false);
  });
});
