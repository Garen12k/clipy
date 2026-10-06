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

test("another sample rate: 110 bpm clicks at 22 050 Hz are read as 110 bpm, first beat within 15 ms (one tempo at one other rate — not every tempo: see the tie below)", () => {
  const a = detectBeats(clicks(110, 0.25, 20, 22050), 22050)!;
  expect(Math.abs(a.bpm - 110)).toBeLessThan(0.25);
  expect(Math.abs(a.first - 0.25)).toBeLessThan(0.015);
});

// PINNED, not promised. The sample rate CAN decide the octave. The coarse tempo is searched at WHOLE envelope lags only, and bare
// clicks give a very narrow autocorrelation peak. 143.94 bpm is 41.78 frames at 11 025 Hz (hop 110): lag 42 is 0.22 off, its double
// 84 is 0.44 off, so the tempo itself wins. At 22 050 Hz (hop 221) it is 41.59 frames: lag 42 is 0.41 off but the double, 83, only
// 0.18 — the half tempo's lag fits so much better that it beats the weight towards 120 bpm (0.97 against 0.76).
// Either answer is acceptable to the app: a half-tempo grid is still ON the beat (every second click), and Fewer / More moves
// between the octaves. What must hold at any rate is asserted first; the octave each rate picks today is pinned after it, so a
// change of the detector shows up here.
test("near an octave tie the sample rate decides: the same 143.94 bpm clicks read 143.94 at 11 025 Hz and 71.97 at 22 050 Hz — both on the beat", () => {
  const low = detectBeats(clicks(143.94, 0.03, 24, 11025), 11025)!;
  const high = detectBeats(clicks(143.94, 0.03, 24, 22050), 22050)!;
  const step = 60 / 143.94;
  for (const a of [low, high]) {
    const octave = a.bpm / 143.94;                                // 1 or 1/2, never anything else
    expect(Math.min(Math.abs(octave - 1), Math.abs(octave - 0.5))).toBeLessThan(0.002);
    for (const b of a.beats) {                                    // every beat found is on a click
      const off = (((b - 0.03) % step) + step) % step;
      expect(Math.min(off, step - off)).toBeLessThan(0.015);
    }
    expect(a.confidence).toBeGreaterThan(3);
  }
  expect(low.bpm).toBeCloseTo(143.94, 1);
  expect(high.bpm).toBeCloseTo(71.97, 1);
});

// PINNED, not promised. A beat at exactly t = 0 is not found: the envelope's frame 0 is forced to 0 (there is no frame before it
// to rise from), so the grid through 0 collects one onset less than the same grid one beat on, and the "first" beat is reported
// one whole beat late. The grid is still on the beat; a track only loses its very first marker. No bundled track starts on 0
// (the earliest shipped first beat is 0.03 s). Where a tie hides it (120 and 150 bpm at 22 050 Hz read 0) is not pinned.
test("a beat at exactly t = 0 is found one beat late: the first beat reported is the SECOND click", () => {
  const at120 = detectBeats(clicks(120, 0, 24), RATE)!;
  expect(Math.abs(at120.bpm - 120)).toBeLessThan(0.25);
  expect(Math.abs(at120.first - 0.5)).toBeLessThan(0.015);
  expect(at120.beats[0]).toBe(at120.first);
  for (const rate of [11025, 22050]) {
    const at90 = detectBeats(clicks(90, 0, 24, rate), rate)!;
    expect(Math.abs(at90.bpm - 90)).toBeLessThan(0.25);
    expect(Math.abs(at90.first - 60 / 90)).toBeLessThan(0.015);
  }
  // The same clicks 50 ms later are found where they are.
  expect(Math.abs(detectBeats(clicks(120, 0.05, 24), RATE)!.first - 0.05)).toBeLessThan(0.015);
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
