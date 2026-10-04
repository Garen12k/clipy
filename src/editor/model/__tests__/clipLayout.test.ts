import { coverFactor, coversFrame, fitScale, isQuarterTurn, maskRadius, placeClip, SNAP, snapTransform } from "../clipLayout";
import { DEFAULT_TRANSFORM, FULL_CROP, MASK, MASK_IDS } from "../types";
import { MASK_VECTORS, PLACE_VECTORS } from "./clipLayout.vectors";

const PORTRAIT = { width: 1080, height: 1920 };
const LANDSCAPE = { width: 1920, height: 1080 };
const place = (t: Partial<typeof DEFAULT_TRANSFORM>, source = PORTRAIT) => placeClip(source, FULL_CROP, { ...DEFAULT_TRANSFORM, ...t }, 1080, 1920);

describe("placeClip vectors", () => {
  it.each(PLACE_VECTORS.map((v) => [v.name, v] as const))("%s", (_n, v) => {
    const p = placeClip(v.source, v.crop, v.transform, v.frame[0], v.frame[1]);
    expect(p.width).toBeCloseTo(v.expect.width, 3);
    expect(p.height).toBeCloseTo(v.expect.height, 3);
    expect(p.centerX).toBeCloseTo(v.expect.centerX, 3);
    expect(p.centerY).toBeCloseTo(v.expect.centerY, 3);
    expect(p.rotation).toBe(v.expect.rotation);
    expect(p.flipH).toBe(v.expect.flipH);
    expect(p.flipV).toBe(v.expect.flipV);
  });
});

describe("maskRadius vectors", () => {
  it.each(MASK_VECTORS.map((v) => [v.name, v] as const))("%s", (_n, v) => expect(maskRadius(v.placed, v.mask)).toBeCloseTo(v.expect, 6));
  it("covers every mask id", () => expect(new Set(MASK_VECTORS.map((v) => v.mask))).toEqual(new Set(MASK_IDS)));
  it("uses MASK.roundedRadius and takes a placed clip", () => {
    const placed = place({ scale: 0.4 });
    expect(maskRadius(placed, "rounded")).toBeCloseTo(MASK.roundedRadius * placed.width, 6);
    expect(maskRadius(placed, "circle")).toBeCloseTo(placed.width / 2, 6);
  });
  it("is 0 for an unknown mask or a broken box", () => {
    expect(maskRadius({ width: 100, height: 100 }, "star" as never)).toBe(0);
    expect(maskRadius({ width: NaN, height: 100 }, "circle")).toBe(0);
    expect(maskRadius({ width: -50, height: 100 }, "rounded")).toBe(0);
  });
});

describe("fitScale / coverFactor", () => {
  it("is 1 for portrait in portrait", () => expect(fitScale(PORTRAIT, FULL_CROP, 0, 1080, 1920)).toBeCloseTo(1, 6));
  it("is 0.31640625 for landscape in portrait", () => expect(fitScale(LANDSCAPE, FULL_CROP, 0, 1080, 1920)).toBeCloseTo(0.31640625, 6));
  it("is 1 for a quarter-turned landscape", () => expect(fitScale(LANDSCAPE, FULL_CROP, 90, 1080, 1920)).toBeCloseTo(1, 6));
  it("cover factor of landscape in portrait", () => expect(coverFactor(LANDSCAPE, FULL_CROP, 0, 1080, 1920)).toBeCloseTo(1.7777778, 6));
});

describe("coversFrame", () => {
  it("true for defaults", () => expect(coversFrame(place({}), 1080, 1920)).toBe(true));
  it("true for a landscape cover", () => expect(coversFrame(place({}, LANDSCAPE), 1080, 1920)).toBe(true));
  it("false at fit scale", () => expect(coversFrame(place({ scale: 0.31640625 }, LANDSCAPE), 1080, 1920)).toBe(false));
  it("false for any offset at scale 1", () => {
    expect(coversFrame(place({ x: 0.01 }), 1080, 1920)).toBe(false);
    expect(coversFrame(place({ y: -0.01 }), 1080, 1920)).toBe(false);
  });
  it("true at scale 2 with a small offset", () => expect(coversFrame(place({ scale: 2, x: 0.2, y: -0.1 }), 1080, 1920)).toBe(true));
  it("false at 45 degrees", () => expect(coversFrame(place({ scale: 3, rotation: 45 }), 1080, 1920)).toBe(false));
  it("true for a quarter turn", () => expect(coversFrame(place({ rotation: 90 }, LANDSCAPE), 1080, 1920)).toBe(true));
});

describe("snapTransform", () => {
  const T = DEFAULT_TRANSFORM;
  it("snaps x and y to centre", () => {
    const r = snapTransform({ ...T, x: 0.015, y: -0.02 }, 0.5);
    expect(r.transform.x).toBe(0);
    expect(r.transform.y).toBe(0);
    expect(r.snapped).toEqual(["x", "y"]);
  });
  it("snaps rotation to straight angles", () => {
    expect(snapTransform({ ...T, rotation: 2 }, 0.5).transform.rotation).toBe(0);
    expect(snapTransform({ ...T, rotation: 88 }, 0.5).transform.rotation).toBe(90);
    expect(snapTransform({ ...T, rotation: -178 }, 0.5).transform.rotation).toBe(-180);
    expect(snapTransform({ ...T, rotation: 2 }, 0.5).snapped).toEqual(["rotation"]);
  });
  it("snaps scale to 1 and to fit", () => {
    expect(snapTransform({ ...T, scale: 1.02 }, 0.4).transform.scale).toBe(1);
    expect(snapTransform({ ...T, scale: 0.41 }, 0.4).transform.scale).toBe(0.4);
    expect(snapTransform({ ...T, scale: 0.41 }, 0.4).snapped).toEqual(["scale"]);
  });
  it("engages nothing when already exact", () => {
    const r = snapTransform(T, 0.5);
    expect(r.snapped).toEqual([]);
    expect(r.transform).toEqual(T);
  });
  it("does not snap outside the thresholds", () => {
    const t = { ...T, x: SNAP.offset + 0.01, y: -(SNAP.offset + 0.01), rotation: SNAP.rotationDeg + 1, scale: 1.1 };
    const r = snapTransform(t, 0.5);
    expect(r.snapped).toEqual([]);
    expect(r.transform).toEqual(t);
  });
});

describe("isQuarterTurn", () => {
  it.each([[90, true], [-90, true], [270, true], [89.5, true], [45, false], [0, false], [180, false]])("%d -> %s", (d, e) => expect(isQuarterTurn(d)).toBe(e));
});
