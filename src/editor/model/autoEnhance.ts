import type { FrameStat } from "@/modules/clipy-video/frameStats";
import { ADJUST } from "./adjust";
import type { ClipAdjust } from "./types";

/**
 * Auto enhance: WHAT to set, from the plain numbers the phone read (`frameStats`). TypeScript only — no Swift twin, nothing
 * mirrored; it writes no look maths of its own: its answer is values of five ORDINARY Adjust sliders, which `setClipAdjust`
 * stores and the existing Adjust pipeline draws. A heuristic on gamma-encoded statistics (spec §3): every number below is
 * tunable without a build.
 */
export const AUTO_KEYS = ["exposure", "contrast", "saturation", "temperature", "tint"] as const;
export type AutoKey = (typeof AUTO_KEYS)[number];
export type AutoValues = Record<AutoKey, number>;
export interface LookSummary { p2: number; p50: number; p98: number; r: number; g: number; b: number; chroma: number }

export const AUTO = {
  /** The phone's histogram (FrameStats.swift `bins`) and the side frames are scaled to (its `defaultSide`). */
  bins: 64, maxSide: 256,
  /** At most five frames, one per half second of the trim. */
  mostFrames: 5, frameEvery: 0.5,
  /** A picture with nothing to see (a black or white card, a fade): left alone. */
  blank: 0.08,
  /** Exposure: the median luma towards mid-grey, 60 % of the way, on gamma values (Y′ ≈ linear^(1 / 2.2)). */
  mid: 0.45, midSlack: 0.05, exposureShare: 0.6, gamma: 2.2, darkest: 0.01,
  /** Contrast: the p2–p98 range towards 0.85, half the way; clipped at both ends → a touch less. */
  width: 0.85, widthEnough: 0.75, contrastShare: 0.5, narrowest: 0.2, clipped: 0.02, flatten: -0.08,
  /** Saturation: mean chroma towards 0.22, half the way; black and white (under 0.04) and 0.16 … 0.32 are left alone. */
  chroma: 0.22, chromaLow: 0.16, chromaHigh: 0.32, grey: 0.04, saturationShare: 0.5,
  /** Warmth / tint: a red − blue or green − magenta cast, as a share of the picture's sum, beyond a dead zone. */
  castSlack: 0.03, tintSlack: 0.025, warmthPerCast: 1.5, tintPerCast: 1.5,
  /** The GENTLE limits, in slider units (the slider shows ×100; every range is −1 … 1). */
  limits: {
    exposure: [-0.2, 0.3], contrast: [-0.1, 0.2], saturation: [-0.1, 0.2], temperature: [-0.15, 0.15], tint: [-0.1, 0.1],
  } as Record<AutoKey, readonly [number, number]>,
} as const;

/** What the line calls each key: the slider's own label, lower-cased (pinned to ADJUST_LABELS in the tests). */
export const AUTO_NAMES: Record<AutoKey, string> = { exposure: "exposure", contrast: "contrast", saturation: "saturation", temperature: "warmth", tint: "tint" };

const r2 = (v: number): number => Math.round(v * 100) / 100 + 0;
const r3 = (v: number): number => Math.round(v * 1000) / 1000 + 0;
const within = (v: number, [lo, hi]: readonly [number, number]): number => Math.min(hi, Math.max(lo, v));
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const ZERO: AutoValues = { exposure: 0, contrast: 0, saturation: 0, temperature: 0, tint: 0 };

/** The source seconds to look at: a photo one picture; a video up to five, at the middles of equal parts of its trim. */
export function autoTimes(kind: "video" | "photo", from: number, to: number): number[] {
  if (kind === "photo") return [0];
  const length = to - from;
  if (!(length > 0)) return [r3(Math.max(0, from))];
  const n = Math.max(1, Math.min(AUTO.mostFrames, Math.floor(length / AUTO.frameEvery)));
  return Array.from({ length: n }, (_, i) => r3(from + ((i + 0.5) * length) / n));
}

/** The value at share `q` of a normalised histogram, linear inside a bin, 0 … 1. */
export function percentile(hist: readonly number[], q: number): number {
  let below = 0;
  for (let i = 0; i < hist.length; i++) {
    const h = hist[i];
    if (h > 0 && below + h >= q) return (i + (q - below) / h) / hist.length;
    below += h;
  }
  return 1;
}

/** The frames as one: each histogram normalised and the frames averaged (each weighs the same); a malformed frame is skipped. */
export function summarize(frames: readonly FrameStat[]): LookSummary | null {
  const hist = new Array<number>(AUTO.bins).fill(0);
  let used = 0, r = 0, g = 0, b = 0, chroma = 0;
  for (const f of frames) {
    if (!isNum(f.pixels) || f.pixels <= 0 || !Array.isArray(f.histogram) || f.histogram.length !== AUTO.bins) continue;
    if (![f.r, f.g, f.b, f.saturation].every(isNum) || !f.histogram.every((n) => isNum(n) && n >= 0)) continue;
    const total = f.histogram.reduce((s, n) => s + n, 0);
    if (total <= 0) continue;
    for (let i = 0; i < AUTO.bins; i++) hist[i] += f.histogram[i] / total;
    used += 1; r += f.r; g += f.g; b += f.b; chroma += f.saturation;
  }
  if (used === 0) return null;
  for (let i = 0; i < AUTO.bins; i++) hist[i] /= used;
  return { p2: percentile(hist, 0.02), p50: percentile(hist, 0.5), p98: percentile(hist, 0.98), r: r / used, g: g / used, b: b / used, chroma: chroma / used };
}

/** A picture with nothing to see: (nearly) all black or all white. */
export const isBlank = (s: LookSummary): boolean => s.p98 < AUTO.blank || s.p2 > 1 - AUTO.blank;

/** What a look found: the five values, and `blank` for a picture Auto leaves ALONE (the clip keeps the values it has). */
export type AutoTarget = AutoValues & { blank?: true };
export const autoTarget = (s: LookSummary): AutoTarget => (isBlank(s) ? { ...autoTargets(s), blank: true } : autoTargets(s));
/** The values a target asks for on a clip whose values (before Auto) are `base`: a blank picture's are the base itself. */
export const targetOn = (t: AutoTarget, base: AutoValues): AutoValues => (t.blank ? base : t);

/** The five values Auto sets at 100 %, ABSOLUTE (the source picture is what the clip shows with a neutral adjust). */
export function autoTargets(s: LookSummary): AutoValues {
  const L = AUTO.limits;
  if (isBlank(s)) return { ...ZERO };
  const ev = Math.abs(s.p50 - AUTO.mid) <= AUTO.midSlack ? 0 : AUTO.gamma * Math.log2(AUTO.mid / Math.max(s.p50, AUTO.darkest)) * AUTO.exposureShare;
  const exposure = r2(within(ev / ADJUST.exposureEV, L.exposure));
  const gain = 2 ** ((ADJUST.exposureEV * exposure) / AUTO.gamma);
  const w = Math.min(1, s.p98 * gain) - s.p2 * gain;
  let contrast = 0;
  if (s.p2 <= AUTO.clipped && s.p98 >= 1 - AUTO.clipped) contrast = AUTO.flatten;
  else if (w < AUTO.widthEnough) contrast = within(((AUTO.width / Math.max(w, AUTO.narrowest) - 1) / ADJUST.contrast) * AUTO.contrastShare, L.contrast);
  const S = s.chroma;
  const saturation = S < AUTO.grey || (S >= AUTO.chromaLow && S <= AUTO.chromaHigh) ? 0
    : within(((AUTO.chroma / S - 1) * AUTO.saturationShare) / ADJUST.saturation, L.saturation);
  const sum = Math.max(0.05, s.r + s.g + s.b);
  const rb = (s.r - s.b) / sum;
  const gm = (s.g - (s.r + s.b) / 2) / sum;
  const temperature = Math.abs(rb) <= AUTO.castSlack ? 0 : within(-rb * AUTO.warmthPerCast, L.temperature);
  const tint = Math.abs(gm) <= AUTO.tintSlack ? 0 : within(gm * AUTO.tintPerCast, L.tint);
  return { exposure, contrast: r2(contrast), saturation: r2(saturation), temperature: r2(temperature), tint: r2(tint) };
}

/** The clip's own values of the five keys. */
export const valuesOf = (a: ClipAdjust): AutoValues => ({ exposure: a.exposure, contrast: a.contrast, saturation: a.saturation, temperature: a.temperature, tint: a.tint });

/** What Auto writes at `strength` (0 … 1): FROM the base towards the target, on the slider's step — 0 is exactly the base. */
export function autoValues(target: AutoValues, base: AutoValues, strength: number): AutoValues {
  const out = { ...ZERO };
  for (const k of AUTO_KEYS) out[k] = r2(base[k] + (target[k] - base[k]) * strength);
  return out;
}

const same = (a: AutoValues, b: AutoValues): boolean => AUTO_KEYS.every((k) => a[k] === b[k]);

/**
 * The strength at which `now` is exactly what Auto set: `hint` if it matches, else — from the highest of 100 % … 1 % that matches
 * and is not the base itself (so Undo of the tap is never read as "1 %") — the MIDDLE of that run of matching strengths (several
 * round to the same values: a 50 % drag is 49 … 51 %, and is read as 50 %; a tie goes up), else null — null too when the target
 * IS the base.
 */
export function autoStrengthOf(now: AutoValues, target: AutoValues, base: AutoValues, hint: number): number | null {
  if (same(target, base)) return null;
  if (same(now, autoValues(target, base, hint))) return hint;
  const matches = (pct: number): boolean => {
    const at = autoValues(target, base, pct / 100);
    return same(now, at) && !same(at, base);
  };
  for (let pct = 100; pct >= 1; pct--) {
    if (!matches(pct)) continue;
    let low = pct;
    while (low > 1 && matches(low - 1)) low--;
    return Math.ceil((pct + low) / 2) / 100;
  }
  return null;
}

const signed = (v: number): string => {
  const pct = Math.round(v * 100) + 0;
  return `${pct > 0 ? "+" : ""}${pct}`;
};
/** "Set exposure +12, contrast +8, …": the keys Auto changes (target ≠ base), with the values the clip has NOW, as the slider prints them. */
export function autoLine(now: AutoValues, target: AutoValues, base: AutoValues): string {
  return `Set ${AUTO_KEYS.filter((k) => target[k] !== base[k]).map((k) => `${AUTO_NAMES[k]} ${signed(now[k])}`).join(", ")}`;
}

export type AutoState = { kind: "set"; strength: number; line: string } | { kind: "good" };
/** What the strip shows for a clip Auto has looked at: its strength and line, "already looks good", or nothing (stale). */
export function autoState(now: AutoValues, target: AutoValues, base: AutoValues, hint: number): AutoState | null {
  if (same(target, base)) return same(now, base) ? { kind: "good" } : null;
  const strength = autoStrengthOf(now, target, base, hint);
  return strength === null ? null : { kind: "set", strength, line: autoLine(now, target, base) };
}
