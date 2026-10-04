import { clipGainAt, clipGainCurve, cutCurve, duckFactorAt, END_FADE, exportTrackCurve, fadeEnvelope, fitFades, gainOnCurve, restGain, trackGainAt, trackGainCurve, voiceIntervals, withEndFade } from "../audioMix";
import { DUCKING, makeAudioTrack, makeClip, makePhotoClip, makeProject, type AudioTrack, type Project } from "../types";
import { CLIP_CURVE_VECTORS, CURVE_VECTORS, DUCK_VECTORS, END_FADE_VECTORS, ENVELOPE_VECTORS, FINE_OVERLAP_CURVE, FIT_VECTORS, INTERVAL_EXPECT, INTERVAL_TRACKS,
  OVERLAP_CURVE, type MixTrack } from "./audioMix.vectors";

const track = (id: string, m: MixTrack): AudioTrack => makeAudioTrack({ id, sourceDuration: 60, ...m });
function projectOf(target: MixTrack, others: MixTrack[], ducking: boolean): { p: Project; t: AudioTrack } {
  const t = track("target", target);
  return { p: makeProject({ ducking, audioTracks: [t, ...others.map((o, i) => track(`o${i}`, o))] }), t };
}
/** The piecewise-linear curve read at `time`. */
function interpolate(curve: { time: number; gain: number }[], time: number): number {
  for (let i = 1; i < curve.length; i++) {
    const a = curve[i - 1];
    const b = curve[i];
    if (time <= b.time) return a.gain + (b.gain - a.gain) * ((time - a.time) / (b.time - a.time));
  }
  return curve[curve.length - 1].gain;
}

describe("constants", () => {
  it("ducks to 0.3 over 0.3 s (the vectors assume it)", () => {
    expect(DUCKING).toEqual({ level: 0.3, ramp: 0.3 });
  });
});

describe("fitFades", () => {
  it.each(FIT_VECTORS)("$name", (v) => {
    const f = fitFades(v.fadeIn, v.fadeOut, v.length);
    expect(f.in).toBeCloseTo(v.in, 9);
    expect(f.out).toBeCloseTo(v.out, 9);
  });
  it("treats non-finite input as 0", () => {
    expect(fitFades(NaN, 1, 10)).toEqual({ in: 0, out: 1 });
    expect(fitFades(1, Infinity, 10)).toEqual({ in: 1, out: 0 });
    expect(fitFades(1, 1, NaN)).toEqual({ in: 0, out: 0 });
    expect(fitFades(1, 1, -3)).toEqual({ in: 0, out: 0 });
  });
});

describe("fadeEnvelope", () => {
  it.each(ENVELOPE_VECTORS)("$name", (v) => {
    expect(fadeEnvelope(v.local, v.length, v.fadeIn, v.fadeOut)).toBeCloseTo(v.expect, 9);
  });
  it("is 0 for non-finite input or no length", () => {
    expect(fadeEnvelope(NaN, 10, 1, 1)).toBe(0);
    expect(fadeEnvelope(1, NaN, 1, 1)).toBe(0);
    expect(fadeEnvelope(0, 0, 0, 0)).toBe(0);
    expect(fadeEnvelope(5, 10, NaN, NaN)).toBe(1);
  });
});

describe("voiceIntervals", () => {
  it("merges touching and overlapping voice tracks, sorted, ignoring other kinds", () => {
    expect(voiceIntervals(INTERVAL_TRACKS.map((m, i) => track(`t${i}`, m)))).toEqual(INTERVAL_EXPECT);
  });
  it("is empty without voices and skips broken tracks", () => {
    expect(voiceIntervals([])).toEqual([]);
    expect(voiceIntervals([makeAudioTrack({ id: "m", sourceDuration: 5 })])).toEqual([]);
    expect(voiceIntervals([makeAudioTrack({ id: "v", sourceDuration: 5, kind: "voice", start: NaN }),
      makeAudioTrack({ id: "w", sourceDuration: 5, kind: "voice", trimStart: 3, trimEnd: 3 })])).toEqual([]);
  });
  it("ignores a voice that is not audible (volume 0 or broken)", () => {
    expect(voiceIntervals([makeAudioTrack({ id: "v", sourceDuration: 5, kind: "voice", volume: 0 }),
      makeAudioTrack({ id: "w", sourceDuration: 5, kind: "voice", volume: NaN }),
      makeAudioTrack({ id: "x", sourceDuration: 2, kind: "voice", start: 7, volume: 0.01 })])).toEqual([[7, 9]]);
  });
});

describe("duckFactorAt", () => {
  it.each(DUCK_VECTORS)("$name", (v) => {
    expect(duckFactorAt(v.intervals, v.time)).toBeCloseTo(v.expect, 9);
  });
  it("is the identity at a non-finite time", () => {
    expect(duckFactorAt([[2, 4]], NaN)).toBe(1);
  });
});

describe("trackGainAt", () => {
  const { p, t } = projectOf(CURVE_VECTORS[0].track, CURVE_VECTORS[0].others, true);
  it("is 0 outside the track, including exactly at its end", () => {
    expect(trackGainAt(p, t, 0.5)).toBe(0);
    expect(trackGainAt(p, t, 11)).toBe(0);
    expect(trackGainAt(p, t, 12)).toBe(0);
    expect(trackGainAt(p, t, NaN)).toBe(0);
  });
  it("never treats a time inside the track as outside, whatever floating point does to the start", () => {
    const plain = makeAudioTrack({ id: "f", sourceDuration: 60, start: 0.086, trimEnd: 0.2 });
    const q = makeProject({ audioTracks: [plain] });
    expect(trackGainAt(q, plain, 0.086)).toBe(1);
    expect(trackGainAt(q, plain, 0.2859)).toBe(1);
    expect(trackGainAt(q, plain, 0.286)).toBe(0);
    expect(trackGainAt(q, plain, 0.0859)).toBe(0);
  });
  it("multiplies volume, fade and duck factor", () => {
    expect(trackGainAt(p, t, 2)).toBeCloseTo(0.4, 9);        // 0.8 * (1 / 2)
    expect(trackGainAt(p, t, 4)).toBeCloseTo(0.8, 9);
    expect(trackGainAt(p, t, 6)).toBeCloseTo(0.24, 9);       // 0.8 * 0.3
    expect(trackGainAt(p, t, 10.5)).toBeCloseTo(0.4, 9);     // 0.8 * (0.5 / 1)
  });
  it("ducks only music, and only when the project ducks", () => {
    expect(trackGainAt({ ...p, ducking: false }, t, 6)).toBeCloseTo(0.8, 9);
    const voice = p.audioTracks[1];
    expect(trackGainAt(p, voice, 6)).toBe(1);
    const sfx = track("s", { ...CURVE_VECTORS[0].track, kind: "sfx" });
    expect(trackGainAt({ ...p, audioTracks: [...p.audioTracks, sfx] }, sfx, 6)).toBeCloseTo(0.8, 9);
  });
  it("keeps a volume above 1 and treats a broken volume as silence", () => {
    const loud = makeAudioTrack({ id: "l", sourceDuration: 5, volume: 2 });
    expect(trackGainAt(makeProject({ audioTracks: [loud] }), loud, 1)).toBe(2);
    const bad = makeAudioTrack({ id: "b", sourceDuration: 5, volume: NaN });
    expect(trackGainAt(makeProject({ audioTracks: [bad] }), bad, 1)).toBe(0);
  });
});

describe("trackGainCurve", () => {
  it.each(CURVE_VECTORS)("$name", (v) => {
    const { p, t } = projectOf(v.track, v.others, v.ducking);
    const curve = trackGainCurve(p, t);
    expect(curve.map((b) => b.time)).toEqual(v.curve.map((b) => b.time));
    curve.forEach((b, i) => expect(b.gain).toBeCloseTo(v.curve[i].gain, 9));
  });
  it("adds a breakpoint every 0.05 s where a fade overlaps a duck ramp", () => {
    const { p, t } = projectOf(OVERLAP_CURVE.track, OVERLAP_CURVE.others, true);
    expect(trackGainCurve(p, t).map((b) => b.time)).toEqual(OVERLAP_CURVE.times);
  });
  it("uses a finer step for a short or loud fade under a ramp", () => {
    const { p, t } = projectOf(FINE_OVERLAP_CURVE.track, FINE_OVERLAP_CURVE.others, true);
    expect(trackGainCurve(p, t).map((b) => b.time)).toEqual(FINE_OVERLAP_CURVE.times);
  });
  it("never adds more than 400 points per overlap, at least 0.005 s apart", () => {
    const { p, t } = projectOf({ ...FINE_OVERLAP_CURVE.track, fadeOut: 0.0005 }, FINE_OVERLAP_CURVE.others, true);
    const times = trackGainCurve(p, t).map((b) => b.time);
    expect(times).toEqual([0, 2.7, 3, 5.8, 5.9995, 6]);       // the overlap (0.0005 s) is shorter than the smallest step
  });
  // The export plays these breakpoints: a wrong gain at the end would fade a plain track to silence.
  it("has the right gain at EVERY breakpoint, the last included, for 2000 millisecond starts", () => {
    const bad: string[] = [];
    for (let i = 0; i < 2000; i++) {
      const start = i / 1000;
      const length = 0.2 + (i % 7) * 0.1;
      for (const [fadeIn, fadeOut] of [[0, 0], [0, 0.1], [0.05, 0.1]]) {
        const t = makeAudioTrack({ id: "t", sourceDuration: 60, start, trimStart: 0.3, trimEnd: 0.3 + length, volume: 1.5, fadeIn, fadeOut });
        const curve = trackGainCurve(makeProject({ audioTracks: [t] }), t);
        const expected = [...(fadeIn > 0 ? [0] : []), 1.5, ...(fadeOut > 0 ? [1.5, 0] : [1.5])];
        const ok = curve.length === expected.length && curve.every((b, k) => Math.abs(b.gain - expected[k]) <= 1e-9)
          && curve[0].time === Math.round(start * 1e4) / 1e4 && Math.abs(curve[curve.length - 1].time - (start + length)) < 1e-4;
        if (!ok) bad.push(`${start}/${length}/${fadeIn}/${fadeOut}: ${JSON.stringify(curve)}`);
      }
    }
    expect(bad.slice(0, 3)).toEqual([]);
    expect(bad.length).toBe(0);
  });
  it("is empty for a track with no length", () => {
    const t = makeAudioTrack({ id: "z", sourceDuration: 5, trimStart: 2, trimEnd: 2 });
    expect(trackGainCurve(makeProject({ audioTracks: [t] }), t)).toEqual([]);
  });
  it("rounds times to 4 decimals without duplicates", () => {
    const t = makeAudioTrack({ id: "r", sourceDuration: 60, start: 0.123456, trimEnd: 3.00001, fadeIn: 0.00001, fadeOut: 1 / 3 });
    const curve = trackGainCurve(makeProject({ audioTracks: [t] }), t);
    expect(curve.map((b) => b.time)).toEqual([0.1235, 2.7901, 3.1235]);     // start (and the fade-in end, the same after rounding); 3.123466 − 0.333333; the end
    // at the start the LATER gain is kept (the end of the tiny fade-in), so there is no false 2.7 s ramp up from 0
    [1, 1, 0].forEach((g, i) => expect(curve[i].gain).toBeCloseTo(g, 6));
  });
  it("keeps the EARLIER gain when a tiny fade-out collapses into the end", () => {
    const t = makeAudioTrack({ id: "r", sourceDuration: 60, start: 1, trimEnd: 3, fadeOut: 0.00001 });
    expect(trackGainCurve(makeProject({ audioTracks: [t] }), t)).toEqual([{ time: 1, gain: 1 }, { time: 4, gain: 1 }]);
  });

  // The curve is what the export plays: it must agree with trackGainAt everywhere inside the track.
  const scenarios: { name: string; target: MixTrack; others: MixTrack[]; ducking: boolean; tolerance: number }[] = [
    { name: "fades only", ducking: false, tolerance: 1e-9,
      target: { start: 0.5, trimStart: 2, trimEnd: 9.5, volume: 1.7, kind: "music", fadeIn: 1.25, fadeOut: 2.5 }, others: [] },
    { name: "ducked, fades clear of the ramps", ducking: true, tolerance: 1e-9,
      target: CURVE_VECTORS[0].track, others: CURVE_VECTORS[0].others },
    { name: "ducked by voices close together, one reaching past the end", ducking: true, tolerance: 1e-9,
      target: { start: 1, trimStart: 0, trimEnd: 12, volume: 0.9, kind: "music", fadeIn: 0.5, fadeOut: 0 },
      others: [{ start: 2, trimStart: 0, trimEnd: 2, volume: 1, kind: "voice", fadeIn: 0, fadeOut: 0 },
        { start: 4.4, trimStart: 0, trimEnd: 1.6, volume: 1, kind: "voice", fadeIn: 0, fadeOut: 0 },
        { start: 6.1, trimStart: 0, trimEnd: 1, volume: 1, kind: "voice", fadeIn: 0, fadeOut: 0 },
        { start: 12.9, trimStart: 0, trimEnd: 5, volume: 1, kind: "voice", fadeIn: 0, fadeOut: 0 }] },
    { name: "a fade-in over a ramp down", ducking: true, tolerance: 0.01, target: OVERLAP_CURVE.track, others: OVERLAP_CURVE.others },
    { name: "a fade-out over a ramp up, boosted", ducking: true, tolerance: 0.01,
      target: { start: 0, trimStart: 0, trimEnd: 6, volume: 2, kind: "music", fadeIn: 0, fadeOut: 1.5 },
      others: [{ start: 3, trimStart: 0, trimEnd: 1.8, volume: 1, kind: "voice", fadeIn: 0, fadeOut: 0 }] },
    { name: "a 0.1 s fade-out at volume 2 under a ramp up", ducking: true, tolerance: 0.01,
      target: FINE_OVERLAP_CURVE.track, others: FINE_OVERLAP_CURVE.others },
    { name: "a 0.02 s fade-in at volume 2 under a ramp down", ducking: true, tolerance: 0.01,
      target: { start: 0.086, trimStart: 0, trimEnd: 4, volume: 2, kind: "music", fadeIn: 0.02, fadeOut: 0 },
      others: [{ start: 0.2, trimStart: 0, trimEnd: 1, volume: 1, kind: "voice", fadeIn: 0, fadeOut: 0 }] },
  ];
  it.each(scenarios)("matches trackGainAt at 200 sample times: $name", (s) => {
    const { p, t } = projectOf(s.target, s.others, s.ducking);
    const curve = trackGainCurve(p, t);
    const length = s.target.trimEnd - s.target.trimStart;
    expect(curve[0].time).toBeCloseTo(s.target.start, 4);
    expect(curve[curve.length - 1].time).toBeCloseTo(s.target.start + length, 4);
    for (let i = 1; i < curve.length; i++) expect(curve[i].time).toBeGreaterThan(curve[i - 1].time);
    for (let i = 0; i < 200; i++) {
      const time = s.target.start + (length * (i + 0.5)) / 200;
      expect(Math.abs(interpolate(curve, time) - trackGainAt(p, t, time))).toBeLessThanOrEqual(s.tolerance);
    }
    // the last breakpoint is the limit from inside (trackGainAt itself is 0 exactly at the end)
    const end = s.target.start + length;
    const duck = s.ducking && s.target.kind === "music" ? duckFactorAt(voiceIntervals(p.audioTracks), end) : 1;
    expect(curve[curve.length - 1].gain).toBeCloseTo(s.target.volume * (s.target.fadeOut > 0 ? 0 : 1) * duck, 9);
    // every other breakpoint and every segment's midpoint (dense where the step is fine)
    for (let i = 0; i < curve.length - 1; i++) {
      expect(Math.abs(curve[i].gain - trackGainAt(p, t, curve[i].time))).toBeLessThanOrEqual(s.tolerance);
      const mid = (curve[i].time + curve[i + 1].time) / 2;
      expect(Math.abs((curve[i].gain + curve[i + 1].gain) / 2 - trackGainAt(p, t, mid))).toBeLessThanOrEqual(s.tolerance);
    }
  });
});

describe("clip gains", () => {
  const clipOf = (v: (typeof CLIP_CURVE_VECTORS)[number]) =>
    makeClip({ id: "c", sourceDuration: 10, trimStart: v.trimStart, trimEnd: v.trimEnd, speed: v.speed, volume: v.volume, muted: v.muted, fadeIn: v.fadeIn, fadeOut: v.fadeOut });
  it.each(CLIP_CURVE_VECTORS)("clipGainCurve: $name", (v) => {
    const curve = clipGainCurve(clipOf(v));
    expect(curve.map((b) => b.time)).toEqual(v.curve.map((b) => b.time));
    curve.forEach((b, i) => expect(b.gain).toBeCloseTo(v.curve[i].gain, 9));
  });
  it("clipGainAt is (muted ? 0 : volume) × the fade envelope in output seconds", () => {
    const c = clipOf(CLIP_CURVE_VECTORS[0]);
    expect(clipGainAt(c, 0.5)).toBeCloseTo(0.75, 9);     // 1.5 * 0.5 / 1
    expect(clipGainAt(c, 1.5)).toBeCloseTo(1.5, 9);
    expect(clipGainAt(c, 3)).toBeCloseTo(0.75, 9);       // 1.5 * (4 - 3) / 2
    expect(clipGainAt(c, 5)).toBe(0);
    expect(clipGainAt(c, NaN)).toBe(0);
    expect(clipGainAt({ ...c, muted: true }, 1.5)).toBe(0);
    expect(clipGainAt({ ...c, volume: NaN }, 1.5)).toBe(0);
  });
  it("a photo is silent", () => {
    const photo = { ...makePhotoClip({ id: "ph", seconds: 3 }), muted: false };
    expect(clipGainAt(photo, 1)).toBe(0);
    expect(clipGainCurve(photo)).toEqual([{ time: 0, gain: 0 }, { time: 3, gain: 0 }]);
  });
  it("the clip curve matches clipGainAt between breakpoints", () => {
    const c = clipOf(CLIP_CURVE_VECTORS[0]);
    const curve = clipGainCurve(c);
    for (let i = 0; i <= 200; i++) {
      const at = (4 * i) / 200;
      expect(interpolate(curve, at)).toBeCloseTo(clipGainAt(c, at), 9);
    }
  });
});

describe("gainOnCurve", () => {
  const curve = [{ time: 1, gain: 0.1 }, { time: 3, gain: 0.3 }, { time: 4, gain: 0 }];
  it("reads the curve between breakpoints and is exact on them", () => {
    expect(gainOnCurve(curve, 2)).toBeCloseTo(0.2, 12);
    expect(gainOnCurve(curve, 1)).toBe(0.1);
    expect(gainOnCurve(curve, 3)).toBe(0.3);       // not 0.1 + (0.3 − 0.1), which is a hair above
    expect(gainOnCurve(curve, 3.5)).toBeCloseTo(0.15, 12);
  });
  it("is the first / last gain outside, and 0 for no curve or a non-finite time", () => {
    expect(gainOnCurve(curve, 0)).toBe(0.1);
    expect(gainOnCurve(curve, 9)).toBe(0);
    expect(gainOnCurve([], 1)).toBe(0);
    expect(gainOnCurve(curve, NaN)).toBe(0);
  });
});

describe("cutCurve", () => {
  const curve = [{ time: 1, gain: 0 }, { time: 3, gain: 0.8 }, { time: 10, gain: 0.8 }, { time: 11, gain: 0 }];
  it("leaves a curve inside the range as it is", () => {
    expect(cutCurve(curve, 0, 20)).toEqual(curve);
    expect(cutCurve(curve, 1, 11)).toEqual(curve);
  });
  it("cuts with an interpolated breakpoint at each cut", () => {
    const cut = cutCurve(curve, 2, 10.5);
    expect(cut.map((b) => b.time)).toEqual([2, 3, 10, 10.5]);
    [0.4, 0.8, 0.8, 0.4].forEach((g, i) => expect(cut[i].gain).toBeCloseTo(g, 12));
    expect(cutCurve(curve, 0, 5)).toEqual([{ time: 1, gain: 0 }, { time: 3, gain: 0.8 }, { time: 5, gain: 0.8 }]);
  });
  it("puts the cut on the 4-decimal time grid", () => {
    expect(cutCurve([{ time: 0, gain: 1 }, { time: 9, gain: 1 }], 0, 10 / 3)).toEqual([{ time: 0, gain: 1 }, { time: 3.3333, gain: 1 }]);
  });
  it("is empty when nothing of the curve is inside", () => {
    expect(cutCurve(curve, 11, 20)).toEqual([]);
    expect(cutCurve(curve, 12, 20)).toEqual([]);
    expect(cutCurve(curve, -5, 1)).toEqual([]);
    expect(cutCurve(curve, 5, 5)).toEqual([]);
    expect(cutCurve([], 0, 5)).toEqual([]);
    expect(cutCurve(curve, 0, NaN)).toEqual([]);
    expect(cutCurve(curve, 2, 2.00001)).toEqual([]);       // both ends round to the same time
  });
});

describe("withEndFade", () => {
  it.each(END_FADE_VECTORS)("$name", (v) => {
    const out = withEndFade(v.curve, v.endTime, v.seconds);
    expect(out.map((b) => b.time)).toEqual(v.expect.map((b) => b.time));
    out.forEach((b, i) => expect(b.gain).toBeCloseTo(v.expect[i].gain, 9));
  });
  it("returns the curve unchanged for a broken fade or fewer than two points", () => {
    const flat = [{ time: 0, gain: 1 }, { time: 4, gain: 1 }];
    expect(withEndFade(flat, 4, NaN)).toEqual(flat);
    expect(withEndFade(flat, NaN, 1)).toEqual(flat);
    expect(withEndFade(flat, 4, -1)).toEqual(flat);
    expect(withEndFade([{ time: 0, gain: 1 }], 0, 1)).toEqual([{ time: 0, gain: 1 }]);
  });
  it("stays within 0.01 of curve × ramp where the curve itself slopes inside the fade (extra breakpoints)", () => {
    // a duck ramp at volume 2 (2 → 0.6 over 7.2 … 7.5) inside the last second
    const curve = [{ time: 0, gain: 2 }, { time: 7.2, gain: 2 }, { time: 7.5, gain: 0.6 }, { time: 8, gain: 0.6 }];
    const out = withEndFade(curve, 8, 1);
    expect(out[out.length - 1]).toEqual({ time: 8, gain: 0 });
    for (let i = 1; i < out.length; i++) expect(out[i].time).toBeGreaterThan(out[i - 1].time);
    expect(out.filter((b) => b.time > 7.2 && b.time < 7.5).length).toBeGreaterThan(2);
    for (let i = 0; i <= 800; i++) {
      const time = i / 100;
      const want = interpolate(curve, time) * Math.min(1, 8 - time);
      expect(Math.abs((time === 0 ? out[0].gain : interpolate(out, time)) - want)).toBeLessThanOrEqual(0.01);
    }
  });
});

describe("restGain", () => {
  it("is the track's own volume (what an un-faded track plays at), never negative, 0 for a broken volume", () => {
    const at = (volume: number) => restGain(makeAudioTrack({ id: "r", sourceDuration: 5, volume, fadeIn: 2, fadeOut: 2 }));
    expect(at(0.8)).toBe(0.8);
    expect(at(2)).toBe(2);
    expect(at(0)).toBe(0);
    expect(at(-1)).toBe(0);
    expect(at(NaN)).toBe(0);
    expect(at(Infinity)).toBe(0);
  });
});

describe("exportTrackCurve", () => {
  const curveOf = (m: Partial<MixTrack>, total: number, others: MixTrack[] = [], ducking = false) => {
    const { p, t } = projectOf({ start: 0, trimStart: 0, trimEnd: 9, volume: 1, kind: "music", fadeIn: 0, fadeOut: 0, ...m }, others, ducking);
    return exportTrackCurve(p, t, total);
  };
  it("fades over the last second, at most (the old automatic fade)", () => {
    expect(END_FADE).toEqual({ seconds: 1, slack: 0.01 });
  });
  it("a track that ends before the video ends keeps its curve", () => {
    expect(curveOf({ trimEnd: 5 }, 8)).toEqual([{ time: 0, gain: 1 }, { time: 5, gain: 1 }]);
    expect(curveOf({ start: 1, trimEnd: 10, volume: 0.8, fadeIn: 2, fadeOut: 1 }, 20)).toEqual(CURVE_VECTORS[1].curve);
  });
  it("music cut by the end of the video is cut there and fades over its last second", () => {
    expect(curveOf({}, 8)).toEqual([{ time: 0, gain: 1 }, { time: 7, gain: 1 }, { time: 8, gain: 0 }]);
    expect(curveOf({ start: 7.5, volume: 0.5 }, 8)).toEqual([{ time: 7.5, gain: 0.5 }, { time: 8, gain: 0 }]);
  });
  it("music that ends with the video (within 0.01 s) fades too, as it always did", () => {
    expect(curveOf({ trimEnd: 8 }, 8)).toEqual([{ time: 0, gain: 1 }, { time: 7, gain: 1 }, { time: 8, gain: 0 }]);
    expect(curveOf({ trimEnd: 7.995 }, 8)).toEqual([{ time: 0, gain: 1 }, { time: 6.995, gain: 1 }, { time: 7.995, gain: 0 }]);
    expect(curveOf({ trimEnd: 7.9 }, 8)).toEqual([{ time: 0, gain: 1 }, { time: 7.9, gain: 1 }]);
  });
  it("a fade-out the video never reaches does not switch the safety fade off: a 60 s song with a 2 s fade-out on a 20 s video", () => {
    expect(curveOf({ trimEnd: 60, fadeOut: 2 }, 20)).toEqual([{ time: 0, gain: 1 }, { time: 19, gain: 1 }, { time: 20, gain: 0 }]);
  });
  it("music cut in the middle of its own fade-out still ends on silence: the two fades multiply", () => {
    const { p, t } = projectOf({ start: 0, trimStart: 0, trimEnd: 9, volume: 1, kind: "music", fadeIn: 0, fadeOut: 1 }, [], false);   // own fade over 8 … 9
    const curve = exportTrackCurve(p, t, 8.5);
    expect(curve[0]).toEqual({ time: 0, gain: 1 });
    expect(curve[curve.length - 1]).toEqual({ time: 8.5, gain: 0 });
    for (let i = 0; i < 850; i++) {
      const time = (i + 0.5) / 100;
      expect(Math.abs(interpolate(curve, time) - trackGainAt(p, t, time) * Math.min(1, 8.5 - time))).toBeLessThanOrEqual(0.01);
    }
  });
  it("music whose own fade-out ends with the video is already silent there: no extra fade", () => {
    expect(curveOf({ trimEnd: 8, fadeOut: 1 }, 8)).toEqual([{ time: 0, gain: 1 }, { time: 7, gain: 1 }, { time: 8, gain: 0 }]);
    expect(curveOf({ trimEnd: 8, fadeOut: 3 }, 8).map((b) => b.time)).toEqual([0, 5, 8]);
  });
  it("voice-overs and sound effects are cut without a fade", () => {
    expect(curveOf({ kind: "voice" }, 8)).toEqual([{ time: 0, gain: 1 }, { time: 8, gain: 1 }]);
    expect(curveOf({ kind: "sfx" }, 8)).toEqual([{ time: 0, gain: 1 }, { time: 8, gain: 1 }]);
  });
  it("silent music is left flat", () => {
    expect(curveOf({ volume: 0 }, 8)).toEqual([{ time: 0, gain: 0 }, { time: 8, gain: 0 }]);
  });
  it("is empty for a track outside the video", () => {
    expect(curveOf({ start: 8 }, 8)).toEqual([]);
    expect(curveOf({ start: 12 }, 8)).toEqual([]);
    expect(curveOf({ trimEnd: 0 }, 8)).toEqual([]);
    expect(curveOf({}, 0)).toEqual([]);
  });
  it("a track starting before 0 is cut at 0", () => {
    expect(curveOf({ start: -2, trimEnd: 5, kind: "sfx" }, 8)).toEqual([{ time: 0, gain: 1 }, { time: 3, gain: 1 }]);
  });
  it("ducked music cut by the end: ducking and the end fade multiply", () => {
    const voice: MixTrack = { start: 7.5, trimStart: 0, trimEnd: 1.5, volume: 1, kind: "voice", fadeIn: 0, fadeOut: 0 };
    const { p, t } = projectOf({ start: 0, trimStart: 0, trimEnd: 10, volume: 1, kind: "music", fadeIn: 0, fadeOut: 0 }, [voice], true);
    const curve = exportTrackCurve(p, t, 8);
    expect(curve[0]).toEqual({ time: 0, gain: 1 });
    expect(curve[curve.length - 1]).toEqual({ time: 8, gain: 0 });
    for (let i = 0; i < 800; i++) {
      const time = (i + 0.5) / 100;
      expect(Math.abs(interpolate(curve, time) - trackGainAt(p, t, time) * Math.min(1, 8 - time))).toBeLessThanOrEqual(0.01);
    }
  });
});
