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
