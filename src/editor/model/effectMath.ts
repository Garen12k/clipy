import type { EffectId, EffectItem } from "./types";

/**
 * Deterministic time functions behind the timeline effects (spec 4.2). Mirrored by EffectMath.swift:
 * keep constants and formulas identical. `t` = seconds since the effect's start, `d` = its duration, `k` = intensity.
 */
export const EFFECT = {
  ramp: 0.15, shakeAmp: 0.03, shakeFx: 9, shakeFy: 11, shakePhase: 1.3, shakeZoom: 0.06, pulseAmp: 0.12, pulseHz: 2,
  flashHz: 2, flashDecay: 4, leakOpacity: 0.35, leakHz: 0.5, vhsTint: 0.12, vhsShift: 0.004, filmTint: 0.3, filmFlicker: 0.12, filmFps: 12,
  glowLayer: 0.12, glowRadius: 0.02, glowIntensity: 0.8, blurRadius: 0.03, glitchHz: 8, glitchChance: 0.5, glitchShift: 0.08, glitchSplit: 0.01,
  glitchBandMin: 0.08, glitchBandMax: 0.2, rgbSplit: 0.008,
} as const;

/** Content values (burned into the video), allow-listed in noHexLiterals.test.ts. */
export const EFFECT_COLORS = { flash: "#FFFFFF", lightLeak: "#FFB347", vhs: "#7A5CFF", oldFilm: "#C8A05A", flicker: "#000000", glow: "#FFFFFF" } as const;

const TAU = 2 * Math.PI;
const frac = (x: number): number => x - Math.floor(x);

/** Pseudo-random value in [0, 1), identical on every platform that has a double `sin`. */
export function hash(n: number): number {
  return frac(Math.sin(n * 12.9898) * 43758.5453);
}

/** 0→1 over the first `ramp` seconds, 1→0 over the last; each ramp is at most d/2. 0 outside [0, d]. */
export function envelope(t: number, d: number): number {
  if (!(d > 0) || !(t >= 0) || !(t <= d)) return 0;
  const r = Math.min(EFFECT.ramp, d / 2);
  return Math.min(1, t / r, (d - t) / r);
}

export function shakeOffset(t: number, d: number, k: number): { x: number; y: number; scale: number } {
  const a = EFFECT.shakeAmp * k * envelope(t, d);
  return {
    x: a * Math.sin(TAU * EFFECT.shakeFx * t),
    y: a * Math.sin(TAU * EFFECT.shakeFy * t + EFFECT.shakePhase),
    scale: 1 + EFFECT.shakeZoom * k,
  };
}

export function pulseScale(t: number, d: number, k: number): number {
  return 1 + EFFECT.pulseAmp * k * envelope(t, d) * (0.5 - 0.5 * Math.cos(TAU * EFFECT.pulseHz * t));
}

export function flashOpacity(t: number, k: number): number {
  return k * Math.max(0, 1 - EFFECT.flashDecay * frac(EFFECT.flashHz * t));
}

export function leakOpacity(t: number, d: number, k: number): number {
  return EFFECT.leakOpacity * k * envelope(t, d) * (0.6 + 0.4 * Math.sin(TAU * EFFECT.leakHz * t));
}

export function filmFlicker(t: number, k: number): number {
  return EFFECT.filmFlicker * k * hash(Math.floor(EFFECT.filmFps * t));
}

/** One glitch slice (1/glitchHz s). bandY is the band's top as a fraction of the height; shift is a signed fraction of the width. */
export function glitchSlice(t: number, k: number): { active: boolean; bandY: number; bandH: number; shift: number; split: number } {
  const n = Math.floor(t * EFFECT.glitchHz);
  const active = hash(n) < EFFECT.glitchChance * k;
  const bandH = EFFECT.glitchBandMin + (EFFECT.glitchBandMax - EFFECT.glitchBandMin) * hash(n + 0.5);
  const bandY = hash(n + 0.25) * (1 - bandH);
  return {
    active, bandY, bandH,
    shift: active ? (hash(n + 0.75) * 2 - 1) * EFFECT.glitchShift * k : 0,
    split: active ? EFFECT.glitchSplit * k : 0,
  };
}

export interface EffectPreview { translateX: number; translateY: number; scale: number; layers: { color: string; opacity: number }[] }

const identity = (): EffectPreview => ({ translateX: 0, translateY: 0, scale: 1, layers: [] });

/** What the Expo Go preview can show for one effect at local time t (fractions of the frame for translate). */
export function effectPreview(type: EffectId, t: number, d: number, k: number): EffectPreview {
  const out = identity();
  if (!Number.isFinite(t) || !Number.isFinite(d) || !Number.isFinite(k) || !(d > 0) || t < 0 || t > d) return out;
  const env = envelope(t, d);
  const layer = (color: string, opacity: number) => { if (opacity > 0) out.layers.push({ color, opacity }); };
  switch (type) {
    case "shake": {
      const o = shakeOffset(t, d, k);
      out.translateX = o.x; out.translateY = o.y; out.scale = o.scale;
      break;
    }
    case "zoomPulse": out.scale = pulseScale(t, d, k); break;
    case "flash": layer(EFFECT_COLORS.flash, flashOpacity(t, k)); break;
    case "lightLeak": layer(EFFECT_COLORS.lightLeak, leakOpacity(t, d, k)); break;
    case "vhs": layer(EFFECT_COLORS.vhs, EFFECT.vhsTint * k * env); break;
    case "oldFilm":
      layer(EFFECT_COLORS.oldFilm, EFFECT.filmTint * k * env);
      layer(EFFECT_COLORS.flicker, filmFlicker(t, k));
      break;
    case "glow": layer(EFFECT_COLORS.glow, EFFECT.glowLayer * k * env); break;
    case "blur": case "glitch": case "rgbSplit": case "blurBox": case "mosaicBox": break;   // export only (the box itself is drawn by the preview, not here)
  }
  return out;
}

/** Effects covering project time `time` (start inclusive, end exclusive), in list order, with their local time. */
export function activeEffects(effects: EffectItem[], time: number): { effect: EffectItem; t: number; d: number }[] {
  if (!Number.isFinite(time)) return [];
  const out: { effect: EffectItem; t: number; d: number }[] = [];
  for (const effect of effects) {
    if (time >= effect.start && time < effect.end) out.push({ effect, t: time - effect.start, d: effect.end - effect.start });
  }
  return out;
}

/** Combined preview for all active effects: translations add, scales multiply, layers concatenate. */
export function combinedEffectPreview(effects: EffectItem[], time: number): EffectPreview {
  const out = identity();
  for (const { effect, t, d } of activeEffects(effects, time)) {
    const p = effectPreview(effect.type, t, d, effect.intensity);
    out.translateX += p.translateX; out.translateY += p.translateY; out.scale *= p.scale; out.layers.push(...p.layers);
  }
  return out;
}
