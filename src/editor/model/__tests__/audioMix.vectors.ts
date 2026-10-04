/** Shared with the Swift mirror (AudioMix.swift tests): keep expected values as plain numeric literals. */

// fitFades(fadeIn, fadeOut, length): negative / non-finite -> 0; both scaled by length / (in + out) when they do not fit
export const FIT_VECTORS: { name: string; fadeIn: number; fadeOut: number; length: number; in: number; out: number }[] = [
  { name: "fits", fadeIn: 1, fadeOut: 2, length: 10, in: 1, out: 2 },
  { name: "exactly fills", fadeIn: 4, fadeOut: 6, length: 10, in: 4, out: 6 },
  { name: "uneven shrink", fadeIn: 3, fadeOut: 1, length: 2, in: 1.5, out: 0.5 },      // * 2 / 4
  { name: "even shrink", fadeIn: 5, fadeOut: 5, length: 4, in: 2, out: 2 },            // * 4 / 10
  { name: "negative fade", fadeIn: -1, fadeOut: 2, length: 10, in: 0, out: 2 },
  { name: "no length", fadeIn: 1, fadeOut: 1, length: 0, in: 0, out: 0 },
];

// fadeEnvelope(local, length, fadeIn, fadeOut) = min(1, local / in, (length - local) / out) with fitted fades; 0 outside [0, length]
export const ENVELOPE_VECTORS: { name: string; local: number; length: number; fadeIn: number; fadeOut: number; expect: number }[] = [
  // 10 s long, 2 s in, 4 s out
  { name: "start", local: 0, length: 10, fadeIn: 2, fadeOut: 4, expect: 0 },
  { name: "mid fade-in", local: 1, length: 10, fadeIn: 2, fadeOut: 4, expect: 0.5 },           // 1 / 2
  { name: "end of fade-in", local: 2, length: 10, fadeIn: 2, fadeOut: 4, expect: 1 },
  { name: "plateau", local: 5, length: 10, fadeIn: 2, fadeOut: 4, expect: 1 },
  { name: "start of fade-out", local: 6, length: 10, fadeIn: 2, fadeOut: 4, expect: 1 },       // (10 - 6) / 4
  { name: "mid fade-out", local: 8, length: 10, fadeIn: 2, fadeOut: 4, expect: 0.5 },          // (10 - 8) / 4
  { name: "end", local: 10, length: 10, fadeIn: 2, fadeOut: 4, expect: 0 },
  { name: "before", local: -0.5, length: 10, fadeIn: 2, fadeOut: 4, expect: 0 },
  { name: "after", local: 10.5, length: 10, fadeIn: 2, fadeOut: 4, expect: 0 },
  // too long: 3 + 1 over 2 s -> fitted to 1.5 + 0.5
  { name: "fitted, mid fade-in", local: 0.75, length: 2, fadeIn: 3, fadeOut: 1, expect: 0.5 },   // 0.75 / 1.5
  { name: "fitted, the peak", local: 1.5, length: 2, fadeIn: 3, fadeOut: 1, expect: 1 },
  { name: "fitted, mid fade-out", local: 1.75, length: 2, fadeIn: 3, fadeOut: 1, expect: 0.5 },  // (2 - 1.75) / 0.5
  // zero fades are ignored
  { name: "no fades, start", local: 0, length: 4, fadeIn: 0, fadeOut: 0, expect: 1 },
  { name: "no fades, middle", local: 2, length: 4, fadeIn: 0, fadeOut: 0, expect: 1 },
  { name: "no fades, end", local: 4, length: 4, fadeIn: 0, fadeOut: 0, expect: 1 },
  { name: "fade-in only, end", local: 4, length: 4, fadeIn: 1, fadeOut: 0, expect: 1 },
  { name: "fade-out only, start", local: 0, length: 4, fadeIn: 0, fadeOut: 1, expect: 1 },
];

export interface MixTrack { start: number; trimStart: number; trimEnd: number; volume: number; kind: "music" | "voice" | "sfx"; fadeIn: number; fadeOut: number }

// voiceIntervals(tracks): each voice track's [start, start + trimEnd - trimStart], merged when they touch or overlap, sorted
export const INTERVAL_TRACKS: MixTrack[] = [
  { start: 12, trimStart: 0, trimEnd: 1, volume: 1, kind: "voice", fadeIn: 0, fadeOut: 0 },   // 12 … 13
  { start: 4, trimStart: 1, trimEnd: 4, volume: 1, kind: "voice", fadeIn: 0, fadeOut: 0 },    // 4 … 7, overlaps 2 … 5
  { start: 0, trimStart: 0, trimEnd: 20, volume: 1, kind: "music", fadeIn: 0, fadeOut: 0 },   // not a voice
  { start: 2, trimStart: 0, trimEnd: 3, volume: 1, kind: "voice", fadeIn: 0, fadeOut: 0 },    // 2 … 5
  { start: 7, trimStart: 0, trimEnd: 1, volume: 1, kind: "voice", fadeIn: 0, fadeOut: 0 },    // 7 … 8, touches 4 … 7
  { start: 9, trimStart: 0, trimEnd: 1, volume: 1, kind: "sfx", fadeIn: 0, fadeOut: 0 },      // not a voice
];
export const INTERVAL_EXPECT: [number, number][] = [[2, 8], [12, 13]];

// duckFactorAt(intervals, time) with level 0.3, ramp 0.3: down over [start - 0.3, start], up over [end, end + 0.3]
export const DUCK_VECTORS: { name: string; intervals: [number, number][]; time: number; expect: number }[] = [
  { name: "well before", intervals: [[2, 4]], time: 1, expect: 1 },
  { name: "ramp down starts", intervals: [[2, 4]], time: 1.7, expect: 1 },
  { name: "half way down", intervals: [[2, 4]], time: 1.85, expect: 0.65 },          // 0.3 + 0.7 * 0.15 / 0.3
  { name: "interval start", intervals: [[2, 4]], time: 2, expect: 0.3 },
  { name: "inside", intervals: [[2, 4]], time: 3, expect: 0.3 },
  { name: "interval end", intervals: [[2, 4]], time: 4, expect: 0.3 },
  { name: "half way up", intervals: [[2, 4]], time: 4.15, expect: 0.65 },            // 0.3 + 0.7 * 0.15 / 0.3
  { name: "ramp up ends", intervals: [[2, 4]], time: 4.3, expect: 1 },
  { name: "well after", intervals: [[2, 4]], time: 5, expect: 1 },
  { name: "no intervals", intervals: [], time: 3, expect: 1 },
  // two intervals 0.4 s apart (< 2 * ramp): the up ramp from 4 and the down ramp to 4.4 overlap; the lower one wins
  { name: "close pair, up ramp wins", intervals: [[2, 4], [4.4, 6]], time: 4.1, expect: 0.5333333333333333 },     // min(0.3 + 0.7 * 0.1 / 0.3, 0.3 + 0.7 * 0.3 / 0.3 = 1)
  { name: "close pair, the crossing", intervals: [[2, 4], [4.4, 6]], time: 4.2, expect: 0.7666666666666666 },     // both 0.3 + 0.7 * 0.2 / 0.3
  { name: "close pair, down ramp wins", intervals: [[2, 4], [4.4, 6]], time: 4.3, expect: 0.5333333333333333 },   // min(1, 0.3 + 0.7 * 0.1 / 0.3)
];

export interface CurveVector { name: string; ducking: boolean; track: MixTrack; others: MixTrack[]; curve: { time: number; gain: number }[] }
// trackGainCurve(project, track): project seconds; gain = volume * fade envelope * duck factor
export const CURVE_VECTORS: CurveVector[] = [
  // music 1 … 11 at volume 0.8, 2 s in, 1 s out; a voice over 5 … 7 -> ramps 4.7 … 5 and 7 … 7.3; ducked gain 0.8 * 0.3 = 0.24
  { name: "ducked music with fades", ducking: true,
    track: { start: 1, trimStart: 0, trimEnd: 10, volume: 0.8, kind: "music", fadeIn: 2, fadeOut: 1 },
    others: [{ start: 5, trimStart: 0, trimEnd: 2, volume: 1, kind: "voice", fadeIn: 0, fadeOut: 0 }],
    curve: [{ time: 1, gain: 0 }, { time: 3, gain: 0.8 }, { time: 4.7, gain: 0.8 }, { time: 5, gain: 0.24 }, { time: 7, gain: 0.24 },
      { time: 7.3, gain: 0.8 }, { time: 10, gain: 0.8 }, { time: 11, gain: 0 }] },
  // the same project with ducking off: fades only
  { name: "ducking off", ducking: false,
    track: { start: 1, trimStart: 0, trimEnd: 10, volume: 0.8, kind: "music", fadeIn: 2, fadeOut: 1 },
    others: [{ start: 5, trimStart: 0, trimEnd: 2, volume: 1, kind: "voice", fadeIn: 0, fadeOut: 0 }],
    curve: [{ time: 1, gain: 0 }, { time: 3, gain: 0.8 }, { time: 10, gain: 0.8 }, { time: 11, gain: 0 }] },
  // no fades, boosted: flat, and the last breakpoint is the plateau (the limit from inside)
  { name: "no fades, volume above 1", ducking: false,
    track: { start: 2, trimStart: 3, trimEnd: 8, volume: 1.5, kind: "sfx", fadeIn: 0, fadeOut: 0 },
    others: [],
    curve: [{ time: 2, gain: 1.5 }, { time: 7, gain: 1.5 }] },
  // voices over 2 … 4 and 4.4 … 6: the two ramps cross at (4 + 4.4) / 2 = 4.2 -> 0.3 + 0.7 * 0.2 / 0.3. Every ramp boundary is a
  // breakpoint, so 4.4 - 0.3 = 4.1 and 4 + 0.3 = 4.3 are there too (on the lower ramp: 0.3 + 0.7 * 0.1 / 0.3)
  { name: "two voices close together", ducking: true,
    track: { start: 0, trimStart: 0, trimEnd: 10, volume: 1, kind: "music", fadeIn: 0, fadeOut: 0 },
    others: [{ start: 2, trimStart: 0, trimEnd: 2, volume: 1, kind: "voice", fadeIn: 0, fadeOut: 0 },
      { start: 4.4, trimStart: 0, trimEnd: 1.6, volume: 1, kind: "voice", fadeIn: 0, fadeOut: 0 }],
    curve: [{ time: 0, gain: 1 }, { time: 1.7, gain: 1 }, { time: 2, gain: 0.3 }, { time: 4, gain: 0.3 }, { time: 4.1, gain: 0.5333333333333333 },
      { time: 4.2, gain: 0.7666666666666666 }, { time: 4.3, gain: 0.5333333333333333 }, { time: 4.4, gain: 0.3 }, { time: 6, gain: 0.3 }, { time: 6.3, gain: 1 }, { time: 10, gain: 1 }] },
  // times that binary floating point cannot hold exactly (0.086 + 0.2 - 0.086 is a hair above 0.2): the end keeps the plateau
  { name: "non-representable start, no fades", ducking: false,
    track: { start: 0.086, trimStart: 0, trimEnd: 0.2, volume: 1, kind: "music", fadeIn: 0, fadeOut: 0 },
    others: [],
    curve: [{ time: 0.086, gain: 1 }, { time: 0.286, gain: 1 }] },
  // the same track with a 0.1 s fade-out: 0.286 - 0.1 = 0.186, ending at exactly 0
  { name: "non-representable start, fade-out", ducking: false,
    track: { start: 0.086, trimStart: 0, trimEnd: 0.2, volume: 1, kind: "music", fadeIn: 0, fadeOut: 0.1 },
    others: [],
    curve: [{ time: 0.086, gain: 1 }, { time: 0.186, gain: 1 }, { time: 0.286, gain: 0 }] },
  // a silent voice (volume 0) is not audible, so it does not duck
  { name: "silent voice does not duck", ducking: true,
    track: { start: 0, trimStart: 0, trimEnd: 10, volume: 1, kind: "music", fadeIn: 0, fadeOut: 0 },
    others: [{ start: 2, trimStart: 0, trimEnd: 2, volume: 0, kind: "voice", fadeIn: 0, fadeOut: 0 }],
    curve: [{ time: 0, gain: 1 }, { time: 10, gain: 1 }] },
  // a voice track is never ducked, and the music under a voice that starts before it begins already ducked
  { name: "music starting under a voice", ducking: true,
    track: { start: 3, trimStart: 0, trimEnd: 4, volume: 1, kind: "music", fadeIn: 0, fadeOut: 0 },
    others: [{ start: 0, trimStart: 0, trimEnd: 5, volume: 1, kind: "voice", fadeIn: 0, fadeOut: 0 }],
    curve: [{ time: 3, gain: 0.3 }, { time: 5, gain: 0.3 }, { time: 5.3, gain: 1 }, { time: 7, gain: 1 }] },
];

// Breakpoint times only: a 1 s fade-in (0 … 1) overlapping the ramp down (0.5 … 0.8) to a voice at 0.8 … 3 — the product of the two
// is quadratic there, so the curve gets extra breakpoints across the overlap: every min(0.05, 0.9 * sqrt(0.04 * 1 * 0.3 / (0.7 * 1)) = 0.118) s
export const OVERLAP_CURVE = {
  track: { start: 0, trimStart: 0, trimEnd: 10, volume: 1, kind: "music", fadeIn: 1, fadeOut: 0 } as MixTrack,
  others: [{ start: 0.8, trimStart: 0, trimEnd: 2.2, volume: 1, kind: "voice", fadeIn: 0, fadeOut: 0 }] as MixTrack[],
  times: [0, 0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 1, 3, 3.3, 10],
};
// A short, loud fade needs a finer step: volume 2, a 0.1 s fade-out (5.9 … 6) under the ramp up (5.8 … 6.1) from a voice at 3 … 5.8:
// step = 0.9 * sqrt(0.04 * 0.1 * 0.3 / (0.7 * 2)) = 0.9 * 0.029277… = 0.0263493… -> 5.9 + 0.0263493 k for k = 1, 2, 3 (rounded to 4 decimals)
export const FINE_OVERLAP_CURVE = {
  track: { start: 0, trimStart: 0, trimEnd: 6, volume: 2, kind: "music", fadeIn: 0, fadeOut: 0.1 } as MixTrack,
  others: [{ start: 3, trimStart: 0, trimEnd: 2.8, volume: 1, kind: "voice", fadeIn: 0, fadeOut: 0 }] as MixTrack[],
  times: [0, 2.7, 3, 5.8, 5.9, 5.9263, 5.9527, 5.979, 6],
};

export interface ClipCurveVector { name: string; trimStart: number; trimEnd: number; speed: number; volume: number; muted: boolean; fadeIn: number; fadeOut: number; curve: { time: number; gain: number }[] }
// clipGainCurve(clip): clip-local OUTPUT seconds; length = (trimEnd - trimStart) / speed
export const CLIP_CURVE_VECTORS: ClipCurveVector[] = [
  // 1 … 9 s at speed 2 -> 4 s of output; 1 s in, 2 s out, volume 1.5
  { name: "speed 2 with fades", trimStart: 1, trimEnd: 9, speed: 2, volume: 1.5, muted: false, fadeIn: 1, fadeOut: 2,
    curve: [{ time: 0, gain: 0 }, { time: 1, gain: 1.5 }, { time: 2, gain: 1.5 }, { time: 4, gain: 0 }] },
  { name: "no fades", trimStart: 0, trimEnd: 6, speed: 1, volume: 0.5, muted: false, fadeIn: 0, fadeOut: 0,
    curve: [{ time: 0, gain: 0.5 }, { time: 6, gain: 0.5 }] },
  { name: "muted", trimStart: 1, trimEnd: 9, speed: 2, volume: 1.5, muted: true, fadeIn: 1, fadeOut: 2,
    curve: [{ time: 0, gain: 0 }, { time: 4, gain: 0 }] },
  // fades too long for the clip: 3 + 1 over 2 s -> 1.5 + 0.5, one peak
  { name: "fitted fades", trimStart: 0, trimEnd: 2, speed: 1, volume: 1, muted: false, fadeIn: 3, fadeOut: 1,
    curve: [{ time: 0, gain: 0 }, { time: 1.5, gain: 1 }, { time: 2, gain: 0 }] },
];
