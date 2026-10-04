/** Shared with the Swift mirror (Chroma.swift tests): keep expected values as plain numeric literals. */
export interface HsvVector { name: string; r: number; g: number; b: number; h: number; s: number; v: number }
export interface HexVector { name: string; hex: string; rgb: { r: number; g: number; b: number } | null }
export interface HueDistanceVector { a: number; b: number; d: number }
export interface AlphaVector { name: string; r: number; g: number; b: number; key: string; strength: number; alpha: number }

// rgbToHsv: max, min, delta = max - min; v = max; s = max == 0 ? 0 : delta / max;
// h = 0 when delta == 0; max == r: 60 (g - b) / delta; max == g: 60 ((b - r) / delta + 2); else 60 ((r - g) / delta + 4); h < 0 -> h + 360
export const HSV_VECTORS: HsvVector[] = [
  { name: "red", r: 1, g: 0, b: 0, h: 0, s: 1, v: 1 },           // 60 * 0
  { name: "yellow", r: 1, g: 1, b: 0, h: 60, s: 1, v: 1 },       // max is r: 60 * (1 - 0) / 1
  { name: "green", r: 0, g: 1, b: 0, h: 120, s: 1, v: 1 },       // 60 * (0 + 2)
  { name: "cyan", r: 0, g: 1, b: 1, h: 180, s: 1, v: 1 },        // max is g: 60 * ((1 - 0) / 1 + 2)
  { name: "blue", r: 0, g: 0, b: 1, h: 240, s: 1, v: 1 },        // 60 * (0 + 4)
  { name: "magenta", r: 1, g: 0, b: 1, h: 300, s: 1, v: 1 },     // max is r: 60 * (0 - 1) / 1 = -60 -> 300
  { name: "black", r: 0, g: 0, b: 0, h: 0, s: 0, v: 0 },         // max 0 -> s 0; delta 0 -> h 0
  { name: "white", r: 1, g: 1, b: 1, h: 0, s: 0, v: 1 },
  { name: "mid grey", r: 0.5, g: 0.5, b: 0.5, h: 0, s: 0, v: 0.5 },
  { name: "skin tone", r: 0.9, g: 0.7, b: 0.6, h: 20, s: 0.3333333333333333, v: 0.9 },   // delta 0.3: 60 * 0.1 / 0.3 = 20; 0.3 / 0.9
  { name: "yellow-green", r: 0.5, g: 1, b: 0, h: 90, s: 1, v: 1 },                       // 60 * ((0 - 0.5) / 1 + 2) = 60 * 1.5
  { name: "red towards magenta (wraps)", r: 1, g: 0, b: 0.25, h: 345, s: 1, v: 1 },      // 60 * (0 - 0.25) / 1 = -15 -> 345
  { name: "half-dark green", r: 0, g: 0.5, b: 0, h: 120, s: 1, v: 0.5 },
  // inputs are clamped to 0-1; a non-finite input counts as 0
  { name: "out of range -> red", r: 2, g: -1, b: 0, h: 0, s: 1, v: 1 },
  { name: "NaN / Infinity -> 0 (green)", r: NaN, g: 1, b: Infinity, h: 120, s: 1, v: 1 },
];

// hexToRgb: #RRGGBB (either case) -> components / 255; anything else -> null
export const HEX_VECTORS: HexVector[] = [
  { name: "green", hex: "#00FF00", rgb: { r: 0, g: 1, b: 0 } },
  { name: "blue", hex: "#0000FF", rgb: { r: 0, g: 0, b: 1 } },
  { name: "lower case", hex: "#ff8000", rgb: { r: 1, g: 0.5019607843137255, b: 0 } },   // 128 / 255
  { name: "mid grey", hex: "#808080", rgb: { r: 0.5019607843137255, g: 0.5019607843137255, b: 0.5019607843137255 } },
  { name: "short form", hex: "#0F0", rgb: null },
  { name: "no hash", hex: "00FF00", rgb: null },
  { name: "not hex digits", hex: "#GGGGGG", rgb: null },
  { name: "with alpha", hex: "#00FF00FF", rgb: null },
  { name: "empty", hex: "", rgb: null },
];

// hueDistance(a, b): d = |a - b| mod 360; d > 180 -> 360 - d
export const HUE_DISTANCE_VECTORS: HueDistanceVector[] = [
  { a: 350, b: 10, d: 20 },     // 340 -> 360 - 340
  { a: 10, b: 350, d: 20 },
  { a: 120, b: 120, d: 0 },
  { a: 0, b: 180, d: 180 },
  { a: 90, b: 120, d: 30 },
  { a: 240, b: 120, d: 120 },
  { a: 345, b: 0, d: 15 },      // 345 -> 360 - 345
];

// chromaAlpha(r, g, b, key, strength): tol = 12 + 48 * strength; alpha = clamp((d - tol) / 10, 0, 1), d = hue distance pixel <-> key.
// Alpha 1 instead when: the key is not #RRGGBB, the key's saturation < 0.25, the pixel's saturation < 0.25 or its value < 0.2.
export const ALPHA_VECTORS: AlphaVector[] = [
  // the key colour itself: d = 0 -> (0 - tol) / 10 < 0 -> 0
  { name: "pure green, green key, strength 0", r: 0, g: 1, b: 0, key: "#00FF00", strength: 0, alpha: 0 },       // tol 12
  { name: "pure green, green key, strength 0.5", r: 0, g: 1, b: 0, key: "#00FF00", strength: 0.5, alpha: 0 },   // tol 36
  { name: "pure green, green key, strength 1", r: 0, g: 1, b: 0, key: "#00FF00", strength: 1, alpha: 0 },       // tol 60
  { name: "pure green, lower-case key", r: 0, g: 1, b: 0, key: "#00ff00", strength: 0.5, alpha: 0 },
  // a darker green is still green: hue 120, s 1, v 0.5 >= 0.2
  { name: "half-dark green", r: 0, g: 0.5, b: 0, key: "#00FF00", strength: 0, alpha: 0 },
  // yellow-green (0.5, 1, 0): hue 90, d = 30
  { name: "yellow-green hue 90, strength 0", r: 0.5, g: 1, b: 0, key: "#00FF00", strength: 0, alpha: 1 },        // (30 - 12) / 10 = 1.8 -> 1
  { name: "yellow-green hue 90, strength 0.25 (ramp)", r: 0.5, g: 1, b: 0, key: "#00FF00", strength: 0.25, alpha: 0.6 },   // tol 24: (30 - 24) / 10
  { name: "yellow-green hue 90, strength 0.5", r: 0.5, g: 1, b: 0, key: "#00FF00", strength: 0.5, alpha: 0 },    // tol 36: (30 - 36) / 10 < 0
  // yellow-green (0.75, 1, 0): hue 60 * ((0 - 0.75) + 2) = 75, d = 45
  { name: "yellow-green hue 75, strength 0.5 (ramp)", r: 0.75, g: 1, b: 0, key: "#00FF00", strength: 0.5, alpha: 0.9 },    // (45 - 36) / 10
  { name: "yellow-green hue 75, strength 1", r: 0.75, g: 1, b: 0, key: "#00FF00", strength: 1, alpha: 0 },       // tol 60
  // skin tone (0.9, 0.7, 0.6): hue 20, s 0.333, d = 100 -> (100 - 60) / 10 = 4 -> 1 even at full strength
  { name: "skin tone, strength 1", r: 0.9, g: 0.7, b: 0.6, key: "#00FF00", strength: 1, alpha: 1 },
  // never keyed: greys and whites (s < 0.25), darks (v < 0.2)
  { name: "mid grey", r: 0.5, g: 0.5, b: 0.5, key: "#00FF00", strength: 1, alpha: 1 },
  { name: "white", r: 1, g: 1, b: 1, key: "#00FF00", strength: 1, alpha: 1 },
  { name: "black", r: 0, g: 0, b: 0, key: "#00FF00", strength: 1, alpha: 1 },
  { name: "near-black green", r: 0, g: 0.1, b: 0, key: "#00FF00", strength: 1, alpha: 1 },             // s 1, v 0.1 < 0.2
  { name: "pale green", r: 0.8, g: 1, b: 0.8, key: "#00FF00", strength: 1, alpha: 1 },                 // s = 0.2 / 1 = 0.2 < 0.25
  // the blue key: hue 240
  { name: "pure blue, blue key", r: 0, g: 0, b: 1, key: "#0000FF", strength: 0.5, alpha: 0 },
  { name: "pure green, blue key", r: 0, g: 1, b: 0, key: "#0000FF", strength: 1, alpha: 1 },           // d = 120: (120 - 60) / 10 -> 1
  { name: "pure blue, green key", r: 0, g: 0, b: 1, key: "#00FF00", strength: 1, alpha: 1 },
  // the hue distance wraps: red key (hue 0), pixel (1, 0, 0.25) hue 345, d = 15
  { name: "wrap-around, strength 0 (ramp)", r: 1, g: 0, b: 0.25, key: "#FF0000", strength: 0, alpha: 0.3 },   // (15 - 12) / 10
  // strength is clamped to 0-1
  { name: "strength above 1 = 1", r: 0.75, g: 1, b: 0, key: "#00FF00", strength: 5, alpha: 0 },        // tol 60, d 45
  { name: "strength below 0 = 0", r: 0.5, g: 1, b: 0, key: "#00FF00", strength: -3, alpha: 1 },        // tol 12, d 30
  // a grey key (saturation < 0.25) keys nothing; neither does an invalid key
  { name: "grey key, pure green", r: 0, g: 1, b: 0, key: "#808080", strength: 1, alpha: 1 },
  { name: "grey key, the same grey", r: 0.5019607843137255, g: 0.5019607843137255, b: 0.5019607843137255, key: "#808080", strength: 1, alpha: 1 },
  { name: "white key, pure red", r: 1, g: 0, b: 0, key: "#FFFFFF", strength: 1, alpha: 1 },
  { name: "black key, pure red", r: 1, g: 0, b: 0, key: "#000000", strength: 1, alpha: 1 },            // hue 0 like red, but s 0
  { name: "invalid key", r: 0, g: 1, b: 0, key: "green", strength: 1, alpha: 1 },
  { name: "short key", r: 0, g: 1, b: 0, key: "#0F0", strength: 1, alpha: 1 },
];
