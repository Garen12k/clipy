import { BEAT_DETECT, beatPeriod, detectBeats, onsetEnvelope } from "../beatDetect";

const RATE = 11025;
/** A click track: a short decaying burst at `first`, then every 60 / bpm seconds. Deterministic. */
function clicks(bpm: number, first: number, seconds: number, rate = RATE): Float32Array {
  const x = new Float32Array(Math.round(rate * seconds));
  for (let t = first; t < seconds; t += 60 / bpm) {
    const s = Math.round(t * rate);
    for (let i = 0; i < 300 && s + i < x.length; i++) x[s + i] += Math.sin(i * 0.9) * Math.exp(-i / 60);
  }
  return x;
}
/** Seeded noise in [-1, 1) (the LCG of scripts/generate-sfx.mjs): no pulse at all. */
function noise(seconds: number, rate = RATE): Float32Array {
  let s = 12345;
  return Float32Array.from({ length: Math.round(rate * seconds) }, () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return (s / 4294967296) * 2 - 1; });
}

test("the constants", () => {
  expect(BEAT_DETECT).toEqual({ envelopeRate: 100, windowSeconds: 0.023, minBpm: 70, maxBpm: 180, priorBpm: 120, priorOctaves: 1, fineSpan: 0.03, fineSteps: 300, compress: 1000 });
});

test("onsetEnvelope: about 100 frames a second, never negative, silent before the first sound, a peak at each click", () => {
  const { env, rate } = onsetEnvelope(clicks(120, 1, 6), RATE);
  expect(rate).toBeCloseTo(RATE / 110, 9);                       // hop = round(11025 / 100) = 110 samples
  expect(env.length).toBe(Math.floor((RATE * 6) / 110));
  for (const v of env) expect(v).toBeGreaterThanOrEqual(0);
  for (let i = 0; i < Math.floor(0.95 * rate); i++) expect(env[i]).toBe(0);
  const at = (t: number) => Math.max(...Array.from(env.slice(Math.round(t * rate) - 2, Math.round(t * rate) + 3)));
  const between = env[Math.round(1.25 * rate)];
  for (const t of [1, 1.5, 2, 2.5]) expect(at(t)).toBeGreaterThan(10 * (between + 1e-9));
});

test.each([[128, 0.37], [90, 0.12], [120, 0], [150, 0.2], [75, 0.5]])("detectBeats finds %d bpm with the first beat at %d s", (bpm, first) => {
  const a = detectBeats(clicks(bpm, first, 24), RATE)!;
  expect(Math.abs(a.bpm - bpm)).toBeLessThan(0.25);
  const step = 60 / bpm;
  // The first beat, compared on the beat circle (0.49 of a beat and 0.51 are neighbours).
  const off = (((a.first - first) % step) + step) % step;
  expect(Math.min(off, step - off)).toBeLessThan(0.015);
  expect(a.confidence).toBeGreaterThan(3);
  expect(Math.abs(a.beats.length - (24 - a.first) / step)).toBeLessThanOrEqual(1);
});

test("between a tempo and its half the one nearer 120 wins: 174 bpm of bare clicks is read as 87 (every second click)", () => {
  const a = detectBeats(clicks(174, 0.2, 24), RATE)!;
  expect(Math.abs(a.bpm - 87)).toBeLessThan(0.25);
});

test("the beats are a steady grid inside the file: ascending, 3 decimals, first + k * 60 / bpm", () => {
  const a = detectBeats(clicks(100, 0.3, 20), RATE)!;
  expect(a.beats[0]).toBe(a.first);
  a.beats.forEach((b, k) => {
    expect(b).toBe(Math.round(b * 1000) / 1000);
    expect(b).toBeLessThan(20);
    expect(Math.abs(b - (a.first + (k * 60) / a.bpm))).toBeLessThan(0.02);   // bpm is rounded to 2 decimals
    if (k > 0) expect(b).toBeGreaterThan(a.beats[k - 1]);
  });
});

test("the sample rate does not matter: the same clicks at 22 050 Hz give the same tempo", () => {
  const a = detectBeats(clicks(110, 0.25, 20, 22050), 22050)!;
  expect(Math.abs(a.bpm - 110)).toBeLessThan(0.25);
});

test("no pulse, no answer worth using: noise has a confidence near 1; silence and a file under 4 s give null", () => {
  const a = detectBeats(noise(20), RATE);
  expect(a === null || a.confidence < 1.5).toBe(true);
  expect(detectBeats(new Float32Array(RATE * 20), RATE)).toBeNull();
  expect(detectBeats(clicks(120, 0, 3), RATE)).toBeNull();
  expect(detectBeats(clicks(120, 0, 20), 0)).toBeNull();
});

test("beatPeriod: 0 for an envelope too short to hold four of the slowest beats", () => {
  expect(beatPeriod(new Float64Array(100), 100)).toBe(0);
});
