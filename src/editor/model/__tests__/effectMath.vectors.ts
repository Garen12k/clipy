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
  // env(0.1, 2) = 0.1 / 0.15 = 2/3; cos(2pi * 2 * 0.1) = cos(72 deg) = (sqrt(5) - 1) / 4 = 0.3090169944;
  // 0.5 - 0.5 * 0.3090169944 = 0.3454915028; 0.12 * 2/3 = 0.08; 1 + 0.08 * 0.3454915028 = 1.027639320225
  { name: "ramping in at 0.1 s", args: [0.1, 2, 1], expect: 1.027639320225 },
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

// ---- The eight effects of 2026-10-06. `d` = 4 s so that env = 1 from 0.15 s to 3.85 s; at t = 0.075, env = 0.075 / 0.15 = 0.5. ----

// heartbeatScale = 1 + 0.1 k env beat(phase); phase = frac(1.25 t); beat = bump(phase / 0.2) + 0.6 bump((phase − 0.28) / 0.2); bump(x) = sin²(πx) in (0, 1)
export const HEARTBEAT_VECTORS: ScalarVector[] = [
  { name: "first beat, peak", args: [0.88, 4, 1], expect: 1.1 },                    // phase 0.1 → bump(0.5) = 1 → 1 + 0.1
  { name: "second beat, peak", args: [1.104, 4, 1], expect: 1.06 },                 // phase 0.38 → 0.6·bump(0.5) = 0.6 → 1 + 0.06
  { name: "rest", args: [1.36, 4, 1], expect: 1 },                                  // phase 0.7: past both beats
  { name: "half way up, half strength", args: [0.84, 4, 0.5], expect: 1.025 },      // phase 0.05 → bump(0.25) = sin²(45°) = 0.5 → 1 + 0.1·0.5·0.5
  // phase 0.09375 → bump(0.46875) = sin²(84.375°) = 0.990392640; env 0.5 → 1 + 0.1·0.5·0.990392640
  { name: "ramping in", args: [0.075, 4, 1], expect: 1.0495196320100808 },
];
// strobeOpacity = k while frac(2 t) < 0.4, else 0
export const STROBE_VECTORS: ScalarVector[] = [
  { name: "t = 0: dark", args: [0, 1], expect: 1 },                                  // frac 0
  { name: "t = 0.1: dark", args: [0.1, 1], expect: 1 },                              // frac 0.2
  { name: "t = 0.2: the dark part has just ended", args: [0.2, 1], expect: 0 },      // frac 0.4, not below 0.4
  { name: "t = 0.25: clear", args: [0.25, 1], expect: 0 },                           // frac 0.5
  { name: "second period, half strength", args: [0.6, 0.5], expect: 0.5 },           // frac(1.2) = 0.2
];
// burnOpacity = 0.6 k env (0.5 + 0.5 sin(2π 0.4 t))
export const BURN_VECTORS: ScalarVector[] = [
  { name: "peak", args: [0.625, 4, 1], expect: 0.6 },                                // sin(π/2) = 1 → 0.6·1
  { name: "trough", args: [1.875, 4, 1], expect: 0 },                                // sin(3π/2) = −1 → 0
  { name: "middle, half strength", args: [1.25, 4, 0.5], expect: 0.15 },             // sin(π) = 0 → 0.6·0.5·0.5
  { name: "ramping in", args: [0.075, 4, 1], expect: 0.1781071971878587 },           // 0.6·0.5·(0.5 + 0.5·sin(0.06π) = 0.5936906573)
];
// burnCentreY = 0.5 + 0.35 sin(2π 0.15 t)
export const BURN_Y_VECTORS: ScalarVector[] = [
  { name: "t = 0: the middle", args: [0], expect: 0.5 },
  { name: "t = 5: highest", args: [5], expect: 0.15 },                               // sin(1.5π) = −1 → 0.5 − 0.35
  { name: "t = 10: the middle again", args: [10], expect: 0.5 },                     // sin(3π) = 0
];
// flareX = −0.2 + 1.4 frac(0.5 t)
export const FLARE_X_VECTORS: ScalarVector[] = [
  { name: "start, off the left edge", args: [0], expect: -0.2 },
  { name: "quarter way", args: [0.5], expect: 0.15 },                                // −0.2 + 1.4·0.25
  { name: "the centre", args: [1], expect: 0.5 },                                    // −0.2 + 1.4·0.5
  { name: "three quarters", args: [1.5], expect: 0.85 },
  { name: "next sweep", args: [2], expect: -0.2 },                                   // frac(1) = 0
];
// flareOpacity = 0.8 k env
export const FLARE_OPACITY_VECTORS: ScalarVector[] = [
  { name: "full", args: [1, 4, 1], expect: 0.8 },
  { name: "ramping in, half strength", args: [0.075, 4, 0.5], expect: 0.2 },         // 0.8·0.5·0.5
];
// softEdgeAmount = k env
export const SOFT_EDGE_VECTORS: ScalarVector[] = [
  { name: "full envelope", args: [1, 4, 0.7], expect: 0.7 },
  { name: "ramping in", args: [0.075, 4, 1], expect: 0.5 },
];
// hueAngle = π k env sin(2π 0.25 t)
export const HUE_VECTORS: ScalarVector[] = [
  { name: "t = 1: half a turn", args: [1, 4, 1], expect: 3.141592653589793 },        // sin(π/2) = 1
  { name: "t = 2: back", args: [2, 4, 1], expect: 0 },                               // sin(π) = 0
  { name: "t = 1, half strength", args: [1, 4, 0.5], expect: 1.5707963267948966 },
  { name: "t = 3: the other way", args: [3, 4, 1], expect: -3.141592653589793 },     // sin(3π/2) = −1
  { name: "ramping in", args: [0.075, 4, 1], expect: 0.18462731218780318 },          // π·0.5·sin(0.0375π) = π·0.5·0.1175373975
];
// mirrorMix = min(1, k / 0.5) env
export const MIRROR_VECTORS: ScalarVector[] = [
  { name: "the default strength is a full mirror", args: [1, 4, 0.7], expect: 1 },
  { name: "strength 25 is half", args: [1, 4, 0.25], expect: 0.5 },
  { name: "ramping in", args: [0.075, 4, 1], expect: 0.5 },
];

export interface DustVector { name: string; t: number; k: number; i: number; on: boolean; x: number }
// n = floor(12 t); on = hash(7n + 13i + 1) < 0.6 k; x = hash(3n + 17i + 2)
export const DUST_VECTORS: DustVector[] = [
  // n = 3: hash(22) = 0.6609 ≥ 0.6 → off; x = hash(11)
  { name: "frame 3, line 0: off", t: 0.25, k: 1, i: 0, on: false, x: 0.8211895695640123 },
  // hash(35) = 0.5759 < 0.6 → on; x = hash(28)
  { name: "frame 3, line 1: on", t: 0.25, k: 1, i: 1, on: true, x: 0.16190568688034546 },
  // n = 12: hash(85) = 0.3764 < 0.6 → on; x = hash(38)
  { name: "frame 12, line 0: on", t: 1, k: 1, i: 0, on: true, x: 0.4702766282589437 },
  // hash(98) = 0.0558 → on; x = hash(55)
  { name: "frame 12, line 1: on", t: 1, k: 1, i: 1, on: true, x: 0.8728999602171825 },
  // the same line at strength 0.2: 0.3764 ≥ 0.12 → off (the place does not depend on the strength)
  { name: "frame 12, line 0, low strength: off", t: 1, k: 0.2, i: 0, on: false, x: 0.4702766282589437 },
  // n = 6: hash(43) = 0.2154 < 0.3 → on; x = hash(20)
  { name: "frame 6, line 0, half strength: on", t: 0.5, k: 0.5, i: 0, on: true, x: 0.760377313970821 },
];
