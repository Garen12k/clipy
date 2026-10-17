import { readFileSync } from "fs";
import { join } from "path";
import { ADJUST_LABELS } from "@/src/editor/components/AdjustSheet";
import { ADJUST_RANGE, DEFAULT_ADJUST } from "../types";
import { AUTO, AUTO_KEYS, AUTO_NAMES, autoLine, autoState, autoStrengthOf, autoTargets, autoTimes, autoValues, percentile, summarize, valuesOf, type AutoValues } from "../autoEnhance";
import { frame, flat, VECTORS } from "./autoEnhance.vectors";

const zero: AutoValues = { exposure: 0, contrast: 0, saturation: 0, temperature: 0, tint: 0 };
const dark: AutoValues = { exposure: 0.3, contrast: 0.2, saturation: 0.2, temperature: 0, tint: 0 };

describe("the vectors (spec §3)", () => {
  for (const v of VECTORS) test(v.name, () => expect(autoTargets(summarize([v.f])!)).toEqual(v.want));
});

test("the summary: percentiles inside a bin, every frame weighs the same, bad frames skipped", () => {
  const s = summarize([frame(0.0625, 0.875, 0.47, 0.47, 0.47, 0.22)])!;
  expect(s.p2).toBeCloseTo(0.07875, 10);
  expect(s.p50).toBeCloseTo(0.46875, 10);
  expect(s.p98).toBeCloseTo(0.85875, 10);
  const big = { ...frame(0.0625, 0.875, 0.47, 0.47, 0.47, 0.22), pixels: 4000, histogram: flat(0.0625, 0.875).map((n) => n * 4) };
  const two = summarize([frame(0.03125, 0.4375, 0.24, 0.23, 0.22, 0.12), big])!;
  expect(two.r).toBeCloseTo(0.355, 10);
  expect(two.p50).toBeCloseTo(0.3125, 10);
  expect(autoTargets(two)).toEqual({ ...zero, exposure: 0.3 });
  expect(summarize([])).toBeNull();
  expect(summarize([{ ...big, histogram: [1, 2] }, { ...big, r: Number.NaN }, { ...big, pixels: 0 }, { ...big, histogram: new Array(64).fill(0) }])).toBeNull();
  expect(percentile([0, 1, 0, 0], 0.5)).toBe(0.375);
});

test("the gentle limits sit well inside the sliders, and every target is on the slider's step", () => {
  for (const k of AUTO_KEYS) {
    const [lo, hi] = AUTO.limits[k];
    expect(lo).toBeGreaterThanOrEqual(-0.2);
    expect(hi).toBeLessThanOrEqual(0.3);
    expect(lo).toBeGreaterThan(ADJUST_RANGE[k][0]);
    expect(hi).toBeLessThan(ADJUST_RANGE[k][1]);
  }
  for (const v of VECTORS) for (const k of AUTO_KEYS) {
    const t = autoTargets(summarize([v.f])!)[k];
    expect(Math.round(t * 100) / 100).toBe(t);
    expect(Object.is(t, -0)).toBe(false);
  }
});

test("the times: a photo one, a video up to five at the middles of equal parts of its trim", () => {
  expect(autoTimes("photo", 0, 5)).toEqual([0]);
  expect(autoTimes("video", 0, 10)).toEqual([1, 3, 5, 7, 9]);
  expect(autoTimes("video", 2, 3)).toEqual([2.25, 2.75]);
  expect(autoTimes("video", 0, 0.3)).toEqual([0.15]);
  expect(autoTimes("video", 4, 4)).toEqual([4]);
});

test("the strength blends from the base, on the slider's step", () => {
  expect(autoValues(dark, zero, 1)).toEqual(dark);
  expect(autoValues(dark, zero, 0)).toEqual(zero);
  expect(autoValues(dark, zero, 0.5)).toEqual({ ...zero, exposure: 0.15, contrast: 0.1, saturation: 0.1 });
  expect(autoValues(dark, { ...zero, exposure: 0.5 }, 0.5)).toEqual({ ...zero, exposure: 0.4, contrast: 0.1, saturation: 0.1 });
});

test("which strength the clip shows: the hint first, else the highest that matches; never 0 inferred, never when nothing differs", () => {
  const half = autoValues(dark, zero, 0.5);
  expect(autoStrengthOf(half, dark, zero, 0.5)).toBe(0.5);
  expect(autoStrengthOf(half, dark, zero, 1)).toBe(0.51);           // 51 % rounds to the same values
  expect(autoStrengthOf(dark, dark, zero, 0.5)).toBe(1);             // Undo of a drag: the values say 100 %
  expect(autoStrengthOf(zero, dark, zero, 1)).toBeNull();            // Undo of the tap: the base, not "1 %"
  expect(autoStrengthOf(zero, dark, zero, 0)).toBe(0);               // dragged to 0 %: still Auto's
  expect(autoStrengthOf({ ...dark, contrast: 0.5 }, dark, zero, 1)).toBeNull();   // a slider moved by hand
  expect(autoStrengthOf(zero, zero, zero, 1)).toBeNull();
});

test("the state and the line", () => {
  expect(autoState(dark, dark, zero, 1)).toEqual({ kind: "set", strength: 1, line: "Set exposure +30, contrast +20, saturation +20" });
  expect(autoState(autoValues(dark, zero, 0.5), dark, zero, 0.5)).toEqual({ kind: "set", strength: 0.5, line: "Set exposure +15, contrast +10, saturation +10" });
  expect(autoState(zero, zero, zero, 1)).toEqual({ kind: "good" });
  expect(autoState({ ...zero, tint: 0.1 }, zero, zero, 1)).toBeNull();
  expect(autoState(zero, dark, zero, 1)).toBeNull();
  const cast: AutoValues = { ...zero, temperature: -0.04, tint: 0.03 };
  expect(autoLine(cast, cast, zero)).toBe("Set warmth -4, tint +3");
});

test("the names are the slider labels, lower-cased; the values are the clip's", () => {
  for (const k of AUTO_KEYS) expect(AUTO_NAMES[k]).toBe(ADJUST_LABELS[k].toLowerCase());
  expect(valuesOf({ ...DEFAULT_ADJUST, exposure: 0.2, brightness: 0.9 })).toEqual({ ...zero, exposure: 0.2 });
});

test("the phone's 64 bins are the model's", () => {
  const swift = readFileSync(join(__dirname, "../../../../modules/clipy-video/ios/FrameStats.swift"), "utf8");
  expect(swift).toContain(`static let bins: Int = ${AUTO.bins}`);
  expect(swift).toContain(`static let defaultSide: Int = ${AUTO.maxSide}`);
});
