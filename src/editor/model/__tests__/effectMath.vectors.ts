/** Shared with the Swift mirror (EffectMath.swift tests): keep expected values as plain numeric literals. */
export interface ScalarVector { name: string; args: number[]; expect: number }

// hash(n) = frac(sin(n * 12.9898) * 43758.5453)
export const HASH_VECTORS: ScalarVector[] = [
  { name: "hash(1)", args: [1], expect: 0.9216903898159217 },       // sin(12.9898) * 43758.5453 -> frac
  { name: "hash(7.5)", args: [7.5], expect: 0.9096731311619806 },   // sin(97.4235) * 43758.5453 -> frac
];

// envelope(t, d): r = min(0.15, d / 2); min(1, t / r, (d - t) / r)
export const ENVELOPE_VECTORS: ScalarVector[] = [
  { name: "start", args: [0, 2], expect: 0 },                        // 0 / 0.15
  { name: "half ramp in", args: [0.075, 2], expect: 0.5 },           // 0.075 / 0.15
  { name: "ramp end", args: [0.15, 2], expect: 1 },                  // 0.15 / 0.15
  { name: "middle", args: [1, 2], expect: 1 },                       // min(1, 6.67, 6.67)
  { name: "half ramp out", args: [1.925, 2], expect: 0.5 },          // (2 - 1.925) / 0.15
  { name: "end", args: [2, 2], expect: 0 },                          // 0 / 0.15
  { name: "short effect, half ramp in", args: [0.05, 0.2], expect: 0.5 },   // r = 0.1 -> 0.05 / 0.1
  { name: "short effect, peak", args: [0.1, 0.2], expect: 1 },              // 0.1 / 0.1
  { name: "short effect, ramp out", args: [0.15, 0.2], expect: 0.5 },       // (0.2 - 0.15) / 0.1
];

export interface ShakeVector { name: string; t: number; d: number; k: number; x: number; y: number; scale: number }
// x = 0.03 k env sin(2pi 9 t); y = 0.03 k env sin(2pi 11 t + 1.3); scale = 1 + 0.06 k; env = 1 for t in [0.15, d - 0.15]
export const SHAKE_VECTORS: ShakeVector[] = [
  // env(0.1, 2) = 0.1 / 0.15 = 0.6667 -> x = 0.015 * 0.6667 * sin(5.6549) = -0.00587785, y = 0.015 * 0.6667 * sin(6.9115 + 1.3)
  { name: "ramping in", t: 0.1, d: 2, k: 0.5, x: -0.005877852522924734, y: 0.009367668135426397, scale: 1.03 },
  // x = 0.015 * sin(4.5 pi) = 0.015; y = 0.015 * sin(5.5 pi + 1.3) = -0.00401248
  { name: "full envelope", t: 0.25, d: 2, k: 0.5, x: 0.015, y: -0.004012482429368836, scale: 1.03 },
  // x = 0.015 * sin(18 pi) = 0; y = 0.015 * sin(22 pi + 1.3) = 0.01445337
  { name: "one second in", t: 1, d: 2, k: 0.5, x: 0, y: 0.014453372781257844, scale: 1.03 },
];

// pulseScale(t, d, k) = 1 + 0.12 k env (0.5 - 0.5 cos(2pi 2 t))
export const PULSE_VECTORS: ScalarVector[] = [
  { name: "peak at 0.25 s", args: [0.25, 2, 1], expect: 1.12 },     // cos(pi) = -1 -> 1 + 0.12 * 1 * 1 * 1
];

// flashOpacity(t, k) = k max(0, 1 - 4 frac(2t))
export const FLASH_VECTORS: ScalarVector[] = [
  { name: "t = 0", args: [0, 1], expect: 1 },                         // 1 - 4 * 0
  { name: "t = 0.1", args: [0.1, 1], expect: 0.2 },                   // 1 - 4 * 0.2
  { name: "t = 0.25", args: [0.25, 1], expect: 0 },                   // 1 - 4 * 0.5 = -1 -> 0
  { name: "t = 0.5 (second flash)", args: [0.5, 1], expect: 1 },      // frac(1) = 0
  { name: "half intensity", args: [0.1, 0.5], expect: 0.1 },          // 0.5 * 0.2
];

// leakOpacity(t, d, k) = 0.35 k env (0.6 + 0.4 sin(2pi 0.5 t))
export const LEAK_VECTORS: ScalarVector[] = [
  { name: "t = 1, k = 1", args: [1, 2, 1], expect: 0.21 },            // 0.35 * 1 * (0.6 + 0.4 * sin(pi) = 0.6)
  { name: "t = 0.5, k = 0.5", args: [0.5, 2, 0.5], expect: 0.175 },   // 0.35 * 0.5 * (0.6 + 0.4 * sin(pi/2) = 1)
];

// filmFlicker(t, k) = 0.12 k hash(floor(12 t))
export const FLICKER_VECTORS: ScalarVector[] = [
  { name: "t = 0.25 (frame 3)", args: [0.25, 1], expect: 0.06698671062971698 },   // 0.12 * hash(3) = 0.12 * 0.5582225885809748
];

export interface GlitchVector { name: string; t: number; k: number; active: boolean; bandY: number; bandH: number; shift: number; split: number }
// n = floor(8 t); active = hash(n) < 0.5 k; bandH = 0.08 + 0.12 hash(n + 0.5); bandY = hash(n + 0.25) (1 - bandH);
// shift = (2 hash(n + 0.75) - 1) 0.08 k; split = 0.01 k
export const GLITCH_VECTORS: GlitchVector[] = [
  // n = 2: hash(2) = 0.0572 < 0.5 -> active; bandH = 0.08 + 0.12 * 0.45113 = 0.134136; bandY = 0.117175 * 0.865864 = 0.101458;
  // shift = (2 * 0.997413 - 1) * 0.08 = 0.079586
  { name: "active slice", t: 0.3, k: 1, active: true, bandY: 0.10145767707985968, bandH: 0.13413593816803768, shift: 0.07958605447551236, split: 0.01 },
  // n = 8: hash(8) = 0.329 >= 0.25 -> inactive; shift and split are 0; bandH = 0.08 + 0.12 * 0.31956 = 0.118347; bandY = 0.557895 * 0.881653 = 0.491870
  { name: "inactive slice", t: 1, k: 0.5, active: false, bandY: 0.49186976637340174, bandH: 0.11834738805497182, shift: 0, split: 0 },
];
