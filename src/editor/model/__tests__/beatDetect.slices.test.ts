import { readFileSync } from "fs";
import { join } from "path";
import { BEAT_ACCEPT, BEAT_DETECT, beatPeriod, beatsFromPeriod, coarsePeriod, detectBeats, finePeriodSlice, fineStart, isSteady, onsetEnvelope, type BeatAnalysis, type FineBest } from "../beatDetect";

const RATE = 11025;
/** The click track of beatDetect.test.ts. */
function clicks(bpm: number, first: number, seconds: number, rate = RATE): Float32Array {
  const x = new Float32Array(Math.round(rate * seconds));
  for (let t = first; t < seconds; t += 60 / bpm) {
    const s = Math.round(t * rate);
    for (let i = 0; i < 300 && s + i < x.length; i++) x[s + i] += Math.sin(i * 0.9) * Math.exp(-i / 60);
  }
  return x;
}
function noise(seconds: number, rate = RATE): Float32Array {
  let s = 12345;
  return Float32Array.from({ length: Math.round(rate * seconds) }, () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return (s / 4294967296) * 2 - 1; });
}
/** Clicks under a little noise: a pulse the detector has to work for. */
function noisy(bpm: number, first: number, seconds: number, rate = RATE): Float32Array {
  const x = clicks(bpm, first, seconds, rate), n = noise(seconds, rate);
  for (let i = 0; i < x.length; i++) x[i] += 0.05 * n[i];
  return x;
}
const SIGNAL = { clicks, noisy, noise: (_bpm: number, _first: number, seconds: number, rate: number) => noise(seconds, rate) };

// Written and seen green against the detector BEFORE it was cut into pieces (one `beatPeriod`, one `detectBeats`), from that
// detector's own output: the period to the last bit, then tempo, first beat, confidence, how many beats, the last one and their sum.
describe("PROOF: the detector answers what it answered before it was cut into pieces (never edited to make a change pass)", () => {
  type Row = [keyof typeof SIGNAL, number, number, number, number, number, { bpm: number; first: number; confidence: number; count: number; last: number; sum: number }];
  const rows: Row[] = [
    ["clicks", 100, 0.2, 20, 11025, 60.132, { bpm: 100.01, first: 0.2, confidence: 43.66, count: 34, last: 19.998, sum: 343.359 }],
    ["clicks", 128, 0.31, 30, 11025, 46.9812, { bpm: 128, first: 0.309, confidence: 34.8, count: 64, last: 29.84, sum: 964.787 }],
    ["clicks", 143.94, 0.1, 24, 11025, 41.7774, { bpm: 143.94, first: 0.1, confidence: 29.47, count: 58, last: 23.859, sum: 694.8009999999999 }],
    ["clicks", 87, 0.5, 40, 11025, 69.1242, { bpm: 87, first: 0.499, confidence: 49.48, count: 58, last: 39.81, sum: 1168.967 }],
    ["clicks", 174, 0.2, 24, 11025, 69.1242, { bpm: 87, first: 0.2, confidence: 25.03, count: 35, last: 23.648, sum: 417.34000000000003 }],
    ["clicks", 110, 0.25, 20, 22050, 54.415800000000004, { bpm: 110.01, first: 0.251, confidence: 39.1, count: 37, last: 19.885, sum: 372.503 }],
    ["clicks", 143.94, 0.03, 24, 22050, 83.1743, { bpm: 71.97, first: 0.03, confidence: 29.93, count: 29, last: 23.372, sum: 339.326 }],
    ["clicks", 120, 0, 24, 11025, 50.114999999999995, { bpm: 120, first: 0.499, confidence: 36.74, count: 48, last: 24, sum: 587.9530000000003 }],
    ["noisy", 128, 0.37, 24, 11025, 46.967099999999995, { bpm: 128.04, first: 0.374, confidence: 4.04, count: 51, last: 23.804, sum: 616.5539999999999 }],
    ["noisy", 96.5, 0.11, 30, 22050, 62.031, { bpm: 96.51, first: 0.11, confidence: 3.57, count: 49, last: 29.953, sum: 736.5400000000001 }],
    ["noise", 0, 0, 20, 11025, 33.999, { bpm: 176.88, first: 0.319, confidence: 1.06, count: 59, last: 19.994, sum: 599.241 }],
  ];

  test.each(rows)("%s %d bpm from %d s, %d s at %d Hz", (kind, bpm, first, seconds, rate, period, want) => {
    const x = SIGNAL[kind](bpm, first, seconds, rate);
    const e = onsetEnvelope(x, rate);
    expect(beatPeriod(e.env, e.rate)).toBe(period);
    const a = detectBeats(x, rate)!;
    expect({ bpm: a.bpm, first: a.first, confidence: a.confidence, count: a.beats.length, last: a.beats[a.beats.length - 1], sum: a.beats.reduce((s, b) => s + b, 0) }).toEqual(want);
  });

  test("a whole answer, every beat of it", () => {
    expect(detectBeats(clicks(100, 0.3, 8), RATE)).toEqual({
      bpm: 100.02, first: 0.299, beats: [0.299, 0.899, 1.499, 2.099, 2.699, 3.299, 3.899, 4.499, 5.098, 5.698, 6.298, 6.898, 7.498], confidence: 43.42,
    });
  });
});

/** The fine search, a few steps at a time, as the app runs it. */
function slicedBest(env: Float64Array, rate: number, size: number): FineBest | null {
  const coarse = coarsePeriod(env, rate);
  if (coarse === 0) return null;
  let best = fineStart(coarse);
  for (let s = -BEAT_DETECT.fineSteps; s <= BEAT_DETECT.fineSteps; s += size) best = finePeriodSlice(env, coarse, s, s + size, best);
  return best;
}
const sliced = (env: Float64Array, rate: number, size: number): number => slicedBest(env, rate, size)?.period ?? 0;

describe("PROOF: the pieces compute what the whole computed (never edited to make a change pass)", () => {
  test.each([[100, 0.2, 20], [128, 0.31, 30], [143.94, 0.1, 24], [87, 0.5, 40]])("%s bpm: the period in slices of 1, 4 and 50 is the period in one go", (bpm, first, seconds) => {
    const { env, rate } = onsetEnvelope(clicks(bpm, first, seconds), RATE);
    const whole = beatPeriod(env, rate);
    expect(whole).toBeGreaterThan(0);
    for (const size of [1, 4, 50, 601]) expect(sliced(env, rate, size)).toBe(whole);
  });

  test("to the last bit, score included: noise and a noisy pulse in slices of 1, 4, 7 and 2.5 steps", () => {
    const signals: [Float32Array, number][] = [[noise(20), RATE], [noisy(96.5, 0.11, 30, 22050), 22050], [noisy(128, 0.37, 24), RATE]];
    for (const [x, sampleRate] of signals) {
      const { env, rate } = onsetEnvelope(x, sampleRate);
      const coarse = coarsePeriod(env, rate);
      const whole = finePeriodSlice(env, coarse, -BEAT_DETECT.fineSteps, BEAT_DETECT.fineSteps + 1, fineStart(coarse));
      expect(whole.period).toBe(beatPeriod(env, rate));
      for (const size of [1, 4, 7, 2.5]) expect(slicedBest(env, rate, size)).toEqual(whole);
    }
  });

  test("the coarse period is a whole number of frames, the fine one within fineSpan of it, and the search starts from the coarse one", () => {
    const { env, rate } = onsetEnvelope(clicks(128, 0.31, 30), RATE);
    const coarse = coarsePeriod(env, rate);
    expect(coarse).toBe(47);
    expect(Math.abs(beatPeriod(env, rate) / coarse - 1)).toBeLessThanOrEqual(BEAT_DETECT.fineSpan);
    expect(fineStart(coarse)).toEqual({ period: 47, score: -1 });
  });

  test("detectBeats is beatsFromPeriod of the envelope, the period and the length", () => {
    const x = clicks(120, 0.25, 20);
    const { env, rate } = onsetEnvelope(x, RATE);
    expect(beatsFromPeriod(env, rate, beatPeriod(env, rate), x.length / RATE)).toEqual(detectBeats(x, RATE));
    expect(detectBeats(x, RATE)?.bpm).toBeCloseTo(120, 0);
  });

  test("nothing to measure gives nothing: a period of 0, silence, a rate of 0", () => {
    const { env, rate } = onsetEnvelope(clicks(120, 0.25, 20), RATE);
    expect(beatsFromPeriod(env, rate, 0, 20)).toBeNull();
    expect(beatsFromPeriod(new Float64Array(2000), 100, 50, 20)).toBeNull();
    expect(beatsFromPeriod(env, 0, 50, 20)).toBeNull();
    expect(coarsePeriod(new Float64Array(100), 100)).toBe(0);
  });

  test("a slice outside the search changes nothing, and a slice never looks past the search's ends", () => {
    const { env, rate } = onsetEnvelope(clicks(120, 0.25, 20), RATE);
    const coarse = coarsePeriod(env, rate);
    const start = fineStart(coarse);
    expect(finePeriodSlice(env, coarse, 400, 500, start)).toEqual(start);
    expect(finePeriodSlice(env, coarse, -900, 900, start).period).toBe(beatPeriod(env, rate));
    expect(finePeriodSlice(env, coarse, 10, 10, start)).toEqual(start);
    expect(finePeriodSlice(env, coarse, 10, -10, start)).toEqual(start);
  });
});

describe("nothing here throws or hangs, whatever it is handed", () => {
  const empty = new Float64Array(0), nan = new Float64Array(4000).fill(NaN), short = Float64Array.from([0, 1, 0, 1]);
  const BAD = [0, -1, NaN, Infinity, -Infinity];

  test("coarsePeriod: empty, too short, NaN and flat envelopes, and every bad rate, give 0", () => {
    for (const env of [empty, short, nan, new Float64Array(4000), new Float64Array(4000).fill(3)]) expect(coarsePeriod(env, 100)).toBe(0);
    const { env } = onsetEnvelope(clicks(120, 0.25, 20), RATE);
    for (const rate of BAD) for (const e of [env, empty, nan]) expect(coarsePeriod(e, rate)).toBe(0);
  });

  test("finePeriodSlice: a period that is not a positive finite number, or bounds that are not numbers, hand back the best so far", () => {
    const { env } = onsetEnvelope(clicks(120, 0.25, 20), RATE);
    const best = { period: 50, score: 2 };
    for (const coarse of BAD) expect(finePeriodSlice(env, coarse, -300, 301, best)).toEqual(best);
    expect(finePeriodSlice(env, 50, NaN, 301, best)).toEqual(best);
    expect(finePeriodSlice(env, 50, -300, NaN, best)).toEqual(best);
    for (const e of [empty, nan, short]) expect(finePeriodSlice(e, 50, -2, 3, fineStart(50)).period).toBeGreaterThan(0);
    expect(finePeriodSlice(env, 50, -Infinity, Infinity, fineStart(50))).toEqual(finePeriodSlice(env, 50, -300, 301, fineStart(50)));
  });

  test("beatPeriod and detectBeats: 0 and null", () => {
    for (const env of [empty, short, nan]) for (const rate of [100, ...BAD]) expect(beatPeriod(env, rate)).toBe(0);
    expect(detectBeats(new Float32Array(0), RATE)).toBeNull();
    expect(detectBeats(new Float32Array(RATE * 6).fill(NaN), RATE)).toBeNull();
    for (const rate of [0, -1, NaN]) expect(detectBeats(clicks(120, 0.25, 6), rate)).toBeNull();
  });

  test("beatsFromPeriod: null for a bad period, rate or length and for an empty or NaN envelope", () => {
    const { env, rate } = onsetEnvelope(clicks(120, 0.25, 20), RATE);
    for (const bad of BAD) {
      expect(beatsFromPeriod(env, rate, bad, 20)).toBeNull();
      expect(beatsFromPeriod(env, bad, 50, 20)).toBeNull();
    }
    for (const seconds of [Infinity, NaN]) expect(beatsFromPeriod(env, rate, 50, seconds)).toBeNull();
    expect(beatsFromPeriod(empty, 100, 50, 20)).toBeNull();
    expect(beatsFromPeriod(nan, 100, 50, 20)).toBeNull();
    expect(beatsFromPeriod(env, rate, 50, 0)?.beats).toEqual([]);
    expect(beatsFromPeriod(env, rate, 50, -3)?.beats).toEqual([]);
  });

  test("isSteady: a tempo or a confidence that is not a number is not steady", () => {
    const beat = (bpm: number, confidence: number): BeatAnalysis => ({ bpm, first: 0, beats: [], confidence });
    expect(isSteady(beat(NaN, 2), beat(120, 2), beat(120, 2))).toBe(false);
    expect(isSteady(beat(120, 2), beat(NaN, 2), beat(120, 2))).toBe(false);
    expect(isSteady(beat(120, 2), beat(120, 2), beat(NaN, 2))).toBe(false);
    expect(isSteady(beat(120, NaN), beat(120, 2), beat(120, 2))).toBe(false);
  });
});

describe("the acceptance rule of the bundled tracks", () => {
  const beat = (bpm: number, confidence: number): BeatAnalysis => ({ bpm, first: 0.1, beats: [0.1, 0.6], confidence });

  test("the numbers are the generator's, and so is the rule", () => {
    expect(BEAT_ACCEPT).toEqual({ minConfidence: 1.5, halvesWithin: 0.001 });
    const script = readFileSync(join(__dirname, "../../../../scripts/generate-beats.mjs"), "utf8");
    expect(script).toContain("const ACCEPT = { minConfidence: 1.5, halvesWithin: 0.001, durationWithin: 0.3 };");
    expect(script).toContain("const steady = whole && a && b && Math.abs(a.bpm - whole.bpm) <= whole.bpm * ACCEPT.halvesWithin && Math.abs(b.bpm - whole.bpm) <= whole.bpm * ACCEPT.halvesWithin;");
    expect(script).toContain("const ok = !!whole && whole.confidence >= ACCEPT.minConfidence && !!steady;");
  });

  test("steady: all three found, a clear pulse, and each half within a thousandth of the whole's tempo", () => {
    expect(isSteady(beat(120, 2), beat(120.1, 2), beat(119.9, 2))).toBe(true);
    expect(isSteady(beat(120, 2), beat(120.13, 2), beat(120, 2))).toBe(false);
    expect(isSteady(beat(120, 2), beat(120, 2), beat(119.87, 2))).toBe(false);
    expect(isSteady(beat(120, 1.49), beat(120, 2), beat(120, 2))).toBe(false);
    expect(isSteady(beat(120, 1.5), beat(120, 1), beat(120, 1))).toBe(true);     // only the whole's confidence counts
    expect(isSteady(null, beat(120, 2), beat(120, 2))).toBe(false);
    expect(isSteady(beat(120, 2), null, beat(120, 2))).toBe(false);
    expect(isSteady(beat(120, 2), beat(120, 2), null)).toBe(false);
  });

  test("clicks are steady by the rule; noise is not", () => {
    const judge = (x: Float32Array) => {
      const half = Math.floor(x.length / 2);
      return isSteady(detectBeats(x, RATE), detectBeats(x.subarray(0, half), RATE), detectBeats(x.subarray(half), RATE));
    };
    expect(judge(clicks(120, 0.2, 60))).toBe(true);     // whole and halves all read 120.00 (worked out with the detector before this change)
    expect(judge(noise(40))).toBe(false);
  });
});
