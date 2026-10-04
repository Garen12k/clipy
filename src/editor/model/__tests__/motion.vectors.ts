/** Shared with the Swift mirror (Motion.swift tests): keep expected values as plain numeric literals. */
export interface DeltaVector { name: string; id: string; p: number; distance: number; dx: number; dy: number; scale: number; rotation: number; opacity: number }

// animInDelta(id, p, distance = 1) with e = easeOut(p) = 1 - (1 - p)^3: e(0) = 0, e(0.5) = 1 - 0.125 = 0.875, e(1) = 1
export const IN_VECTORS: DeltaVector[] = [
  // fade: opacity e
  { name: "fade p=0", id: "fade", p: 0, distance: 1, dx: 0, dy: 0, scale: 1, rotation: 0, opacity: 0 },
  { name: "fade p=0.5", id: "fade", p: 0.5, distance: 1, dx: 0, dy: 0, scale: 1, rotation: 0, opacity: 0.875 },
  { name: "fade p=1", id: "fade", p: 1, distance: 1, dx: 0, dy: 0, scale: 1, rotation: 0, opacity: 1 },
  // slideLeft: dx = (1 - e) * distance -> 1, 0.125, 0
  { name: "slideLeft p=0", id: "slideLeft", p: 0, distance: 1, dx: 1, dy: 0, scale: 1, rotation: 0, opacity: 1 },
  { name: "slideLeft p=0.5", id: "slideLeft", p: 0.5, distance: 1, dx: 0.125, dy: 0, scale: 1, rotation: 0, opacity: 1 },
  { name: "slideLeft p=1", id: "slideLeft", p: 1, distance: 1, dx: 0, dy: 0, scale: 1, rotation: 0, opacity: 1 },
  // slideRight: dx = -(1 - e) * distance
  { name: "slideRight p=0", id: "slideRight", p: 0, distance: 1, dx: -1, dy: 0, scale: 1, rotation: 0, opacity: 1 },
  { name: "slideRight p=0.5", id: "slideRight", p: 0.5, distance: 1, dx: -0.125, dy: 0, scale: 1, rotation: 0, opacity: 1 },
  { name: "slideRight p=1", id: "slideRight", p: 1, distance: 1, dx: 0, dy: 0, scale: 1, rotation: 0, opacity: 1 },
  // slideUp: dy = (1 - e) * distance
  { name: "slideUp p=0", id: "slideUp", p: 0, distance: 1, dx: 0, dy: 1, scale: 1, rotation: 0, opacity: 1 },
  { name: "slideUp p=0.5", id: "slideUp", p: 0.5, distance: 1, dx: 0, dy: 0.125, scale: 1, rotation: 0, opacity: 1 },
  { name: "slideUp p=1", id: "slideUp", p: 1, distance: 1, dx: 0, dy: 0, scale: 1, rotation: 0, opacity: 1 },
  // slideDown: dy = -(1 - e) * distance
  { name: "slideDown p=0", id: "slideDown", p: 0, distance: 1, dx: 0, dy: -1, scale: 1, rotation: 0, opacity: 1 },
  { name: "slideDown p=0.5", id: "slideDown", p: 0.5, distance: 1, dx: 0, dy: -0.125, scale: 1, rotation: 0, opacity: 1 },
  { name: "slideDown p=1", id: "slideDown", p: 1, distance: 1, dx: 0, dy: 0, scale: 1, rotation: 0, opacity: 1 },
  // zoomIn: scale = 0.6 + 0.4 e -> 0.6, 0.6 + 0.35 = 0.95, 1; opacity e
  { name: "zoomIn p=0", id: "zoomIn", p: 0, distance: 1, dx: 0, dy: 0, scale: 0.6, rotation: 0, opacity: 0 },
  { name: "zoomIn p=0.5", id: "zoomIn", p: 0.5, distance: 1, dx: 0, dy: 0, scale: 0.95, rotation: 0, opacity: 0.875 },
  { name: "zoomIn p=1", id: "zoomIn", p: 1, distance: 1, dx: 0, dy: 0, scale: 1, rotation: 0, opacity: 1 },
  // zoomOut: scale = 1.4 - 0.4 e -> 1.4, 1.4 - 0.35 = 1.05, 1; opacity e
  { name: "zoomOut p=0", id: "zoomOut", p: 0, distance: 1, dx: 0, dy: 0, scale: 1.4, rotation: 0, opacity: 0 },
  { name: "zoomOut p=0.5", id: "zoomOut", p: 0.5, distance: 1, dx: 0, dy: 0, scale: 1.05, rotation: 0, opacity: 0.875 },
  { name: "zoomOut p=1", id: "zoomOut", p: 1, distance: 1, dx: 0, dy: 0, scale: 1, rotation: 0, opacity: 1 },
  // spin: rotation = -180 (1 - e) -> -180, -22.5, 0; scale = 0.5 + 0.5 e -> 0.5, 0.9375, 1; opacity e
  { name: "spin p=0", id: "spin", p: 0, distance: 1, dx: 0, dy: 0, scale: 0.5, rotation: -180, opacity: 0 },
  { name: "spin p=0.5", id: "spin", p: 0.5, distance: 1, dx: 0, dy: 0, scale: 0.9375, rotation: -22.5, opacity: 0.875 },
  { name: "spin p=1", id: "spin", p: 1, distance: 1, dx: 0, dy: 0, scale: 1, rotation: 0, opacity: 1 },
  // pop (raw p): scale = p < 0.6 ? 1.15 p / 0.6 : 1.15 - 0.15 (p - 0.6) / 0.4; opacity = min(1, p / 0.3)
  { name: "pop p=0", id: "pop", p: 0, distance: 1, dx: 0, dy: 0, scale: 0, rotation: 0, opacity: 0 },
  { name: "pop p=0.3", id: "pop", p: 0.3, distance: 1, dx: 0, dy: 0, scale: 0.575, rotation: 0, opacity: 1 },                 // 1.15 * 0.5; 0.3 / 0.3
  { name: "pop p=0.5", id: "pop", p: 0.5, distance: 1, dx: 0, dy: 0, scale: 0.9583333333333334, rotation: 0, opacity: 1 },   // 1.15 * 0.5 / 0.6 = 1.15 * 5 / 6
  { name: "pop p=0.6", id: "pop", p: 0.6, distance: 1, dx: 0, dy: 0, scale: 1.15, rotation: 0, opacity: 1 },                  // the peak
  { name: "pop p=0.8", id: "pop", p: 0.8, distance: 1, dx: 0, dy: 0, scale: 1.075, rotation: 0, opacity: 1 },                 // 1.15 - 0.15 * 0.5
  { name: "pop p=1", id: "pop", p: 1, distance: 1, dx: 0, dy: 0, scale: 1, rotation: 0, opacity: 1 },                         // 1.15 - 0.15
  // rise: dy = 0.15 (1 - e) -> 0.15, 0.01875, 0 (distance not applied); opacity e
  { name: "rise p=0", id: "rise", p: 0, distance: 1, dx: 0, dy: 0.15, scale: 1, rotation: 0, opacity: 0 },
  { name: "rise p=0.5", id: "rise", p: 0.5, distance: 1, dx: 0, dy: 0.01875, scale: 1, rotation: 0, opacity: 0.875 },
  { name: "rise p=1", id: "rise", p: 1, distance: 1, dx: 0, dy: 0, scale: 1, rotation: 0, opacity: 1 },
  // distance scales slides only: slideLeft at 0.25 -> 0.125 * 0.25; rise ignores it
  { name: "slideLeft p=0.5 overlay distance", id: "slideLeft", p: 0.5, distance: 0.25, dx: 0.03125, dy: 0, scale: 1, rotation: 0, opacity: 1 },
  { name: "rise p=0 overlay distance", id: "rise", p: 0, distance: 0.25, dx: 0, dy: 0.15, scale: 1, rotation: 0, opacity: 0 },
];

// animOutDelta(id, p, distance) = animInDelta(id, 1 - p, distance) with dx, dy and rotation negated
export const OUT_VECTORS: DeltaVector[] = [
  { name: "slideLeft out p=0", id: "slideLeft", p: 0, distance: 1, dx: 0, dy: 0, scale: 1, rotation: 0, opacity: 1 },
  { name: "slideLeft out p=0.5", id: "slideLeft", p: 0.5, distance: 1, dx: -0.125, dy: 0, scale: 1, rotation: 0, opacity: 1 },   // -(in at 0.5)
  { name: "slideLeft out p=1", id: "slideLeft", p: 1, distance: 1, dx: -1, dy: 0, scale: 1, rotation: 0, opacity: 1 },           // -(in at 0)
  { name: "spin out p=0", id: "spin", p: 0, distance: 1, dx: 0, dy: 0, scale: 1, rotation: 0, opacity: 1 },
  { name: "spin out p=0.5", id: "spin", p: 0.5, distance: 1, dx: 0, dy: 0, scale: 0.9375, rotation: 22.5, opacity: 0.875 },
  { name: "spin out p=1", id: "spin", p: 1, distance: 1, dx: 0, dy: 0, scale: 0.5, rotation: 180, opacity: 0 },
];

export interface ComboVector { name: string; id: string; p: number; seconds: number; dx: number; dy: number; scale: number; rotation: number; opacity: number }
// animComboDelta(id, p, seconds)
export const COMBO_VECTORS: ComboVector[] = [
  { name: "zoomInSlow", id: "zoomInSlow", p: 0.25, seconds: 0.5, dx: 0, dy: 0, scale: 1.0375, rotation: 0, opacity: 1 },    // 1 + 0.15 * 0.25
  { name: "zoomOutSlow", id: "zoomOutSlow", p: 0.25, seconds: 0.5, dx: 0, dy: 0, scale: 1.1125, rotation: 0, opacity: 1 },  // 1 + 0.15 * 0.75
  { name: "panLeft", id: "panLeft", p: 0.25, seconds: 0.5, dx: 0.025, dy: 0, scale: 1.1, rotation: 0, opacity: 1 },         // 0.05 * (1 - 0.5)
  { name: "panRight", id: "panRight", p: 0.25, seconds: 0.5, dx: -0.025, dy: 0, scale: 1.1, rotation: 0, opacity: 1 },
  { name: "sway", id: "sway", p: 0.25, seconds: 0.5, dx: 0, dy: 0, scale: 1.08, rotation: 0, opacity: 1 },                  // 3 * sin(2pi * 2 * 0.25 = pi) = 0
  { name: "sway at an eighth", id: "sway", p: 0.125, seconds: 0.25, dx: 0, dy: 0, scale: 1.08, rotation: 3, opacity: 1 },   // 3 * sin(pi / 2)
  { name: "pulse", id: "pulse", p: 0.25, seconds: 0.5, dx: 0, dy: 0, scale: 1.05, rotation: 0, opacity: 1 },                // 1 + 0.05 * (0.5 - 0.5 cos(pi)) = 1 + 0.05
];

export interface LoopVector { name: string; id: string; seconds: number; dx: number; dy: number; scale: number; rotation: number; opacity: number }
// animLoopDelta(id, s) at s = 0.1
export const LOOP_VECTORS: LoopVector[] = [
  { name: "wiggle", id: "wiggle", seconds: 0.1, dx: 0, dy: 0, scale: 1, rotation: 7.608452130361228, opacity: 1 },    // 8 * sin(0.4 pi = 72 deg) = 8 * 0.9510565163
  { name: "pulse", id: "pulse", seconds: 0.1, dx: 0, dy: 0, scale: 1.0809016994374947, rotation: 0, opacity: 1 },     // 1 + 0.1 * sin(0.3 pi = 54 deg) = 1 + 0.1 * 0.8090169944
  { name: "spin", id: "spin", seconds: 0.1, dx: 0, dy: 0, scale: 1, rotation: 18, opacity: 1 },                       // 180 * 0.1
  { name: "float", id: "float", seconds: 0.1, dx: 0, dy: 0.007226305111525729, scale: 1, rotation: 0, opacity: 1 },   // 0.015 * sin(0.16 pi = 28.8 deg) = 0.015 * 0.4817536741
  // 0.35 + 0.65 * (0.5 + 0.5 cos(0.3 pi)) = 0.35 + 0.65 * (0.5 + 0.5 * 0.5877852523) = 0.35 + 0.65 * 0.7938926261
  { name: "blink", id: "blink", seconds: 0.1, dx: 0, dy: 0, scale: 1, rotation: 0, opacity: 0.8660302069950538 },
  { name: "shake", id: "shake", seconds: 0.1, dx: -0.007608452130361228, dy: 0, scale: 1, rotation: 0, opacity: 1 },  // 0.008 * sin(1.6 pi) = -0.008 * 0.9510565163
];

// edgeDurations(inDur, outDur, length): scale both by length / (in + out) when they do not fit
export const EDGE_VECTORS: { name: string; inDur: number; outDur: number; length: number; in: number; out: number }[] = [
  { name: "too long for the item", inDur: 0.5, outDur: 0.5, length: 0.6, in: 0.3, out: 0.3 },     // 0.5 * 0.6 / 1
  { name: "fits", inDur: 0.5, outDur: 0.25, length: 3, in: 0.5, out: 0.25 },
  { name: "uneven shrink", inDur: 1, outDur: 3, length: 2, in: 0.5, out: 1.5 },                   // * 2 / 4
];

export interface KeyVector { name: string; t: number; x: number; y: number; scale: number; rotation: number; opacity: number }
export const KEY_PINS = [
  { t: 1, x: 0, y: 0.2, scale: 1, rotation: 0, opacity: 1 },
  { t: 3, x: 0.4, y: -0.2, scale: 2, rotation: 90, opacity: 0.5 },
];
// sampleKeyframes(KEY_PINS, t): u = (t - 1) / 2, s = smooth(u) = u^2 (3 - 2u), value = a + (b - a) s
export const KEY_VECTORS: KeyVector[] = [
  { name: "midpoint", t: 2, x: 0.2, y: 0, scale: 1.5, rotation: 45, opacity: 0.75 },                             // u = 0.5 -> s = 0.25 * 2 = 0.5
  { name: "quarter", t: 1.5, x: 0.0625, y: 0.1375, scale: 1.15625, rotation: 14.0625, opacity: 0.921875 },       // u = 0.25 -> s = 0.0625 * 2.5 = 0.15625
  { name: "before the first", t: 0, x: 0, y: 0.2, scale: 1, rotation: 0, opacity: 1 },
  { name: "after the last", t: 5, x: 0.4, y: -0.2, scale: 2, rotation: 90, opacity: 0.5 },
];

// outputOffsetOf(clip, sourceTime) — clip trimmed to 1…9 s at speed 2
export const OFFSET_VECTORS: { name: string; trimStart: number; trimEnd: number; speed: number; reversed: boolean; sourceTime: number; expect: number }[] = [
  { name: "forward, speed 2", trimStart: 1, trimEnd: 9, speed: 2, reversed: false, sourceTime: 3, expect: 1 },   // (3 - 1) / 2
  { name: "reversed, speed 2", trimStart: 1, trimEnd: 9, speed: 2, reversed: true, sourceTime: 3, expect: 3 },   // (9 - 3) / 2
];

// A reversed clip at speed 2 trimmed to 1…9 s (4 s of output). TS only — Swift has no source-time maths: its pins arrive
// already converted. outputOffsetOf(pin.t) = (9 - t) / 2 -> 7 -> 1 and 3 -> 3, so the exported pins are exactly KEY_PINS.
export const REVERSED_CLIP = {
  trimStart: 1, trimEnd: 9, speed: 2, reversed: true, sourceDuration: 10,
  sourcePins: [
    { t: 3, x: 0.4, y: -0.2, scale: 2, rotation: 90, opacity: 0.5 },   // shown at output 3
    { t: 7, x: 0, y: 0.2, scale: 1, rotation: 0, opacity: 1 },         // shown at output 1
  ],
  offsets: [3, 1],        // outputOffsetOf of each source pin, in sourcePins order
  at: 1.5, x: 0.0625,     // source 9 - 1.5 * 2 = 6: u = (6 - 3) / 4 = 0.75, s = 0.84375 -> 0.4 - 0.4 * 0.84375
};

export interface ResolveClipVector {
  name: string;
  base: { x: number; y: number; scale: number; rotation: number; opacity: number };
  keyframes: { t: number; x: number; y: number; scale: number; rotation: number; opacity: number }[];   // output-local seconds
  animIn: { id: string; duration: number } | null; animOut: { id: string; duration: number } | null; animCombo: string | null;
  local: number; length: number;
  x: number; y: number; scale: number; rotation: number; opacity: number;
}
// Motion.resolveClip (Swift) / resolveClipMotion (TS): base (pins, else the static values) + In / Out or Combo. Edge
// durations are the already-scaled ones the request carries.
export const RESOLVE_CLIP_VECTORS: ResolveClipVector[] = [
  // REVERSED_CLIP as exported (pins = KEY_PINS) with a 3 s zoomIn, at 1.5 s: base = the "quarter" key vector;
  // In p = 0.5 -> scale * 0.95, opacity * 0.875 -> 1.15625 * 0.95 = 1.0984375, 0.921875 * 0.875 = 0.806640625
  { name: "pins + In (the reversed clip as exported)", base: { x: 0.9, y: 0.9, scale: 3, rotation: 10, opacity: 1 }, keyframes: KEY_PINS,
    animIn: { id: "zoomIn", duration: 3 }, animOut: null, animCombo: null, local: 1.5, length: 4,
    x: 0.0625, y: 0.1375, scale: 1.0984375, rotation: 14.0625, opacity: 0.806640625 },
  // static base, 0.5 s into a 1 s slideLeft: dx = 0.125 * slideClip
  { name: "static + In", base: { x: 0.1, y: -0.3, scale: 2, rotation: 90, opacity: 1 }, keyframes: [],
    animIn: { id: "slideLeft", duration: 1 }, animOut: { id: "fade", duration: 2 }, animCombo: null, local: 0.5, length: 10,
    x: 0.225, y: -0.3, scale: 2, rotation: 90, opacity: 1 },
  // the same clip 1 s into its 2 s fade Out: Out p = 0.5 = In at 0.5 -> opacity 0.875
  { name: "static + Out", base: { x: 0.1, y: -0.3, scale: 2, rotation: 90, opacity: 1 }, keyframes: [],
    animIn: { id: "slideLeft", duration: 1 }, animOut: { id: "fade", duration: 2 }, animCombo: null, local: 9, length: 10,
    x: 0.1, y: -0.3, scale: 2, rotation: 90, opacity: 0.875 },
  // a Combo wins over In / Out: zoomInSlow a quarter through an 8 s clip -> scale 1 + 0.15 * 0.25
  { name: "Combo", base: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 }, keyframes: [],
    animIn: { id: "fade", duration: 2 }, animOut: { id: "fade", duration: 2 }, animCombo: "zoomInSlow", local: 2, length: 8,
    x: 0, y: 0, scale: 1.0375, rotation: 0, opacity: 1 },
];
