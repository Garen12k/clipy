import { setClipSpeedCurve } from "../ops";
import { clipDuration, curveProfile, curveSteps, isSmoothCurve, outputToSource, playbackSpans, rateAt, SMOOTH_PER_SLICE, smoothCurveSteps, smoothSpeedAt, sourceToOutput } from "../timeline";
import { clampSpeedCurve, makeClip, makeProject, SPEED_CURVE_IDS, SPEED_CURVE_LIMITS, SPEED_LIMITS, type Clip, type SpeedCurveId } from "../types";

const STEPPED: Record<SpeedCurveId, number[]> = {
  montage: [2.5, 2.5, 0.5, 2.5, 2.5, 0.5, 2.5, 2.5], hero: [1, 2, 3, 0.5, 0.5, 3, 2, 1], bullet: [3.5, 3.5, 3.5, 0.3, 0.3, 3.5, 3.5, 3.5],
  jumpCut: [1, 4, 1, 4, 1, 4, 1, 4], flashIn: [4, 3, 2, 1.5, 1, 1, 1, 1], flashOut: [1, 1, 1, 1, 1.5, 2, 3, 4],
};
const STEPPED_LENGTH: Record<SpeedCurveId, number> = { montage: 6.4, hero: 7.666667, bullet: 8.380952, jumpCut: 5, flashIn: 5.75, flashOut: 5.75 };
const SMOOTH: Record<SpeedCurveId, number[]> = {
  montage: [2.5, 2.5, 2.5, 2.5, 2.5, 2.5, 2.25, 1.75, 1.25, 0.75, 0.75, 1.25, 1.75, 2.25, 2.5, 2.5, 2.5, 2.5, 2.25, 1.75, 1.25, 0.75, 0.75, 1.25, 1.75, 2.25, 2.5, 2.5, 2.5, 2.5, 2.5, 2.5],
  hero: [1, 1, 1.125, 1.375, 1.625, 1.875, 2.125, 2.375, 2.625, 2.875, 2.6875, 2.0625, 1.4375, 0.8125, 0.5, 0.5, 0.5, 0.5, 0.8125, 1.4375, 2.0625, 2.6875, 2.875, 2.625, 2.375, 2.125, 1.875, 1.625, 1.375, 1.125, 1, 1],
  bullet: [3.5, 3.5, 3.5, 3.5, 3.5, 3.5, 3.5, 3.5, 3.5, 3.5, 3.1, 2.3, 1.5, 0.7, 0.3, 0.3, 0.3, 0.3, 0.7, 1.5, 2.3, 3.1, 3.5, 3.5, 3.5, 3.5, 3.5, 3.5, 3.5, 3.5, 3.5, 3.5],
  jumpCut: [1, 1, 1.375, 2.125, 2.875, 3.625, 3.625, 2.875, 2.125, 1.375, 1.375, 2.125, 2.875, 3.625, 3.625, 2.875, 2.125, 1.375, 1.375, 2.125, 2.875, 3.625, 3.625, 2.875, 2.125, 1.375, 1.375, 2.125, 2.875, 3.625, 4, 4],
  flashIn: [4, 4, 3.875, 3.625, 3.375, 3.125, 2.875, 2.625, 2.375, 2.125, 1.9375, 1.8125, 1.6875, 1.5625, 1.4375, 1.3125, 1.1875, 1.0625, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  flashOut: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1.0625, 1.1875, 1.3125, 1.4375, 1.5625, 1.6875, 1.8125, 1.9375, 2.125, 2.375, 2.625, 2.875, 3.125, 3.375, 3.625, 3.875, 4, 4],
};
const SMOOTH_LENGTH: Record<SpeedCurveId, number> = { montage: 4.749206, hero: 6.584331, bullet: 6.188205, jumpCut: 3.812711, flashIn: 5.702982, flashOut: 5.702982 };
const eight = (extra: Partial<Clip> = {}) => makeClip({ id: "a", sourceDuration: 8, ...extra });

describe("PROOF: a stepped curve is exactly what it was before smooth ramps (literals; never edited to make a change pass)", () => {
  test.each(SPEED_CURVE_IDS)("%s: the same eight steps, the same length, the same export spans", (id) => {
    const steps = curveSteps(id, 0, 8);
    expect(steps).toEqual(STEPPED[id].map((speed, i) => ({ from: i, speed })));
    const clip = eight({ speedCurve: { id, steps } });
    expect(clipDuration(clip)).toBeCloseTo(STEPPED_LENGTH[id], 6);
    expect(playbackSpans(clip)).toEqual(STEPPED[id].map((speed) => ({ duration: 1, speed })));
    expect(clampSpeedCurve(clip.speedCurve, clip)).toEqual(clip.speedCurve);          // what is stored reloads as stored
    expect(isSmoothCurve(clip)).toBe(false);
  });

  test("the op without its new argument writes the stepped preset, as every caller before this batch did", () => {
    const p = makeProject({ clips: [eight()] });
    for (const id of SPEED_CURVE_IDS) {
      const c = setClipSpeedCurve(p, "a", id).clips[0];
      expect(c.speedCurve).toEqual({ id, steps: STEPPED[id].map((speed, i) => ({ from: i, speed })) });
      expect(c.speed).toBe(1);
    }
  });

  test("a trimmed, stepped clip: the steps stay on their source times and the walk is the old one", () => {
    const clip = eight({ trimStart: 2, trimEnd: 6, speedCurve: { id: "hero", steps: curveSteps("hero", 0, 8) } });
    expect(clipDuration(clip)).toBeCloseTo(1 / 3 + 1 / 0.5 + 1 / 0.5 + 1 / 3, 9);     // slices 2…5
    expect(outputToSource(clip, 0)).toBe(2);
    expect(outputToSource(eight({ speedCurve: { id: "hero", steps: curveSteps("hero", 0, 8) } }), 2)).toBeCloseTo(3.083333, 6);
  });
});

describe("the smooth sampling", () => {
  test("32 pieces: under the stored-step limit", () => {
    expect(SMOOTH_PER_SLICE).toBe(4);
    expect(SPEED_CURVE_LIMITS.slices * SMOOTH_PER_SLICE).toBeLessThanOrEqual(SPEED_CURVE_LIMITS.maxSteps);
  });

  test("smoothSpeedAt: the slice speeds sit at the slice centres, a straight line joins them, the edges hold", () => {
    const hero = STEPPED.hero;
    expect(smoothSpeedAt(hero, 0)).toBe(1);
    expect(smoothSpeedAt(hero, 0.0625)).toBe(1);            // the first centre
    expect(smoothSpeedAt(hero, 0.125)).toBe(1.5);           // half way to the second (2)
    expect(smoothSpeedAt(hero, 0.1875)).toBe(2);            // the second centre
    expect(smoothSpeedAt(hero, 0.5)).toBe(0.5);             // between the two slow slices
    expect(smoothSpeedAt(hero, 0.9375)).toBe(1);            // the last centre
    expect(smoothSpeedAt(hero, 1)).toBe(1);
    expect(smoothSpeedAt(hero, -3)).toBe(1);
    expect(smoothSpeedAt(hero, 7)).toBe(1);
  });

  test.each(SPEED_CURVE_IDS)("%s: the profile, the steps and the length are the specified ones", (id) => {
    expect(curveProfile(id, false)).toEqual(STEPPED[id]);
    expect(curveProfile(id, true)).toEqual(SMOOTH[id]);
    const steps = smoothCurveSteps(id, 0, 8);
    expect(steps).toEqual(SMOOTH[id].map((speed, j) => ({ from: j * 0.25, speed })));
    const clip = eight({ speedCurve: { id, steps } });
    expect(clipDuration(clip)).toBeCloseTo(SMOOTH_LENGTH[id], 6);
    expect(playbackSpans(clip)).toHaveLength(32);
    expect(clampSpeedCurve(clip.speedCurve, clip)).toEqual(clip.speedCurve);          // nothing merged, nothing clamped
    expect(isSmoothCurve(clip)).toBe(true);
    // No jump between two neighbouring pieces is as large as the stepped preset's largest.
    const jumps = (v: number[]) => Math.max(...v.slice(1).map((s, i) => Math.abs(s - v[i])));
    expect(jumps(SMOOTH[id])).toBeLessThan(jumps(STEPPED[id]));
  });

  test("the steps are spread over the trim they are given", () => {
    const steps = smoothCurveSteps("hero", 2, 6);
    expect(steps).toHaveLength(32);
    expect(steps[0].from).toBe(2);
    expect(steps[31].from).toBeCloseTo(5.875, 9);
    expect(steps.map((s) => s.speed)).toEqual(SMOOTH.hero);
  });

  test("the existing walk handles 32 steps: source and output times agree both ways, and the rate is the piece's", () => {
    const clip = eight({ speedCurve: { id: "hero", steps: smoothCurveSteps("hero", 0, 8) } });
    expect(outputToSource(clip, 2)).toBeCloseTo(3.262616, 6);
    for (const offset of [0, 0.3, 1.7, 3.1, 5.9, clipDuration(clip)]) expect(sourceToOutput(clip, outputToSource(clip, offset))).toBeCloseTo(offset, 9);
    expect(rateAt(clip, 0)).toBe(1);
    expect(rateAt(clip, clipDuration(clip) / 2)).toBe(0.5);
    const reversed = { ...clip, reversed: true };
    expect(playbackSpans(reversed).map((s) => s.speed)).toEqual([...SMOOTH.hero].reverse());
    expect(clipDuration(reversed)).toBeCloseTo(SMOOTH_LENGTH.hero, 6);
  });

  test("isSmoothCurve: no curve and a stepped curve are not smooth", () => {
    expect(isSmoothCurve(eight())).toBe(false);
    expect(isSmoothCurve(eight({ speedCurve: { id: "hero", steps: curveSteps("hero", 0, 8) } }))).toBe(false);
  });
});

describe("the smooth maths is total", () => {
  test("smoothSpeedAt: a position that is not a number, or is infinite, gets an edge speed; a shape with one speed or none has an answer", () => {
    const hero = STEPPED.hero;
    expect(smoothSpeedAt(hero, NaN)).toBe(1);
    expect(smoothSpeedAt(hero, -Infinity)).toBe(1);
    expect(smoothSpeedAt([2, 3], Infinity)).toBe(3);
    expect(smoothSpeedAt([2.5], 0.3)).toBe(2.5);
    expect(smoothSpeedAt([], 0.3)).toBe(1);
  });

  test.each(SPEED_CURVE_IDS)("%s: every speed of both profiles is a number inside the speed limits, and never under the stepped preset's slowest or over its fastest", (id) => {
    for (const smooth of [false, true]) {
      const v = curveProfile(id, smooth);
      expect(v).toHaveLength(smooth ? 32 : 8);
      for (const s of v) {
        expect(Number.isFinite(s)).toBe(true);
        expect(s).toBeGreaterThanOrEqual(Math.min(...STEPPED[id]));
        expect(s).toBeLessThanOrEqual(Math.max(...STEPPED[id]));
        expect(s).toBeGreaterThanOrEqual(SPEED_LIMITS[0]);
        expect(s).toBeLessThanOrEqual(SPEED_LIMITS[1]);
      }
    }
    expect(curveProfile(id, true)).not.toBe(curveProfile(id, true));                  // a fresh list every time: a caller may keep it
  });

  test("a range with no length, a backwards one and one that is not a number still give 32 steps; the sanity rule keeps none of them whole", () => {
    const clip = eight();
    for (const [a, b] of [[3, 3], [NaN, 8], [0, NaN], [0, Infinity]] as const) {
      const steps = smoothCurveSteps("hero", a, b);
      expect(steps).toHaveLength(32);
      expect(steps.map((s) => s.speed)).toEqual(SMOOTH.hero);
      const kept = clampSpeedCurve({ id: "hero", steps }, clip);
      expect(kept === null || kept.steps.length < 32).toBe(true);
    }
    expect(smoothCurveSteps("hero", 6, 2)).toHaveLength(32);
  });

  test("the shortest clip a smooth curve fits: 32 steps of the smallest step; one hair shorter loses steps", () => {
    const least = 32 * SPEED_CURVE_LIMITS.minStep;
    expect(least).toBeCloseTo(0.32, 12);
    const clip = makeClip({ id: "a", sourceDuration: least });
    expect(clampSpeedCurve({ id: "hero", steps: smoothCurveSteps("hero", 0, least) }, clip)?.steps).toHaveLength(32);
    expect(clampSpeedCurve({ id: "hero", steps: smoothCurveSteps("hero", 0, 0.3) }, clip)!.steps.length).toBeLessThan(32);
  });

  test("a smooth clip trimmed to a sliver, to nothing and past its curve still has a length, spans and a rate", () => {
    const steps = smoothCurveSteps("bullet", 0, 8);
    for (const [trimStart, trimEnd] of [[3.9, 3.900001], [4, 4], [7.99, 8], [0, 0.001]] as const) {
      const clip = eight({ trimStart, trimEnd, speedCurve: { id: "bullet", steps } });
      expect(Number.isFinite(clipDuration(clip))).toBe(true);
      expect(clipDuration(clip)).toBeGreaterThanOrEqual(0);
      expect(playbackSpans(clip).length).toBeGreaterThanOrEqual(1);
      for (const s of playbackSpans(clip)) { expect(s.duration).toBeGreaterThanOrEqual(0); expect(s.speed).toBeGreaterThan(0); }
      expect(Number.isFinite(outputToSource(clip, 0))).toBe(true);
      expect(rateAt(clip, 0)).toBeGreaterThan(0);
    }
  });
});
