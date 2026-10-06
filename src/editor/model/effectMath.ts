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
  beatHz: 1.25, beatAmp: 0.1, beatWidth: 0.2, beatGap: 0.28, beatSecond: 0.6, strobeHz: 2, strobeDuty: 0.4,
  burnMax: 0.6, burnHz: 0.4, burnDrift: 0.35, burnDriftHz: 0.15, burnRadius: 0.9, flareMax: 0.8, flareHz: 0.5, flareMargin: 0.2, flareY: 0.35, flareCore: 0.12, flareHalo: 0.4,
  edgeBlur: 0.02, edgeInner: 0.25, edgeOuter: 0.75, edgeVeil: 0.35, dustFps: 12, dustChance: 0.6, dustLines: 2, dustOpacity: 0.5, dustWidth: 0.003, dustSpeck: 0.02,
  hueHz: 0.25, mirrorFull: 0.5,
} as const;

/** Content values (burned into the video), allow-listed in noHexLiterals.test.ts. */
export const EFFECT_COLORS = { flash: "#FFFFFF", lightLeak: "#FFB347", vhs: "#7A5CFF", oldFilm: "#C8A05A", flicker: "#000000", glow: "#FFFFFF",
  strobe: "#000000", filmBurn: "#FF5A1F", lensFlare: "#FFF1D0", softEdges: "#FFFFFF", dust: "#F2EBDD" } as const;

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

/** `v` kept inside lo … hi; `rest` when it is not a finite number. Every function below ends in it, so no NaN reaches a renderer. */
function within(v: number, lo: number, hi: number, rest: number): number {
  return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : rest;
}

/** `envelope`, and 0 for a time or a duration that is not finite. */
function calmEnvelope(t: number, d: number): number {
  return Number.isFinite(t) && Number.isFinite(d) ? envelope(t, d) : 0;
}

/** A smooth bump: 0 at both ends, 1 in the middle of (0, 1); 0 outside it. */
function bump(x: number): number {
  if (!(x > 0 && x < 1)) return 0;
  const s = Math.sin(Math.PI * x);
  return s * s;
}

/** A heartbeat: two beats (the second weaker) and a rest, `beatHz` times a second. Never below 1. */
export function heartbeatScale(t: number, d: number, k: number): number {
  const phase = frac(EFFECT.beatHz * t);
  const beat = bump(phase / EFFECT.beatWidth) + EFFECT.beatSecond * bump((phase - EFFECT.beatGap) / EFFECT.beatWidth);
  return within(1 + EFFECT.beatAmp * k * calmEnvelope(t, d) * beat, 1, 1 + EFFECT.beatAmp, 1);
}

/** A dark strobe: the black layer's opacity is k for the first `strobeDuty` of every period, 0 for the rest. */
export function strobeOpacity(t: number, k: number): number {
  return frac(EFFECT.strobeHz * t) < EFFECT.strobeDuty ? within(k, 0, 1, 0) : 0;
}

export function burnOpacity(t: number, d: number, k: number): number {
  return within(EFFECT.burnMax * k * calmEnvelope(t, d) * (0.5 + 0.5 * Math.sin(TAU * EFFECT.burnHz * t)), 0, EFFECT.burnMax, 0);
}

/** Where the burn's centre sits on the LEFT edge: a fraction of the height from the top. */
export function burnCentreY(t: number): number {
  return within(0.5 + EFFECT.burnDrift * Math.sin(TAU * EFFECT.burnDriftHz * t), 0.5 - EFFECT.burnDrift, 0.5 + EFFECT.burnDrift, 0.5);
}

/** The flare's centre as a fraction of the width: from one margin left of the frame to one margin right of it, `flareHz` sweeps a second. */
export function flareX(t: number): number {
  return within(-EFFECT.flareMargin + (1 + 2 * EFFECT.flareMargin) * frac(EFFECT.flareHz * t), -EFFECT.flareMargin, 1 + EFFECT.flareMargin, -EFFECT.flareMargin);
}

export function flareOpacity(t: number, d: number, k: number): number {
  return within(EFFECT.flareMax * k * calmEnvelope(t, d), 0, EFFECT.flareMax, 0);
}

/** How soft the edges are, 0…1: × edgeBlur × the shorter side = the export's blur radius; × edgeVeil = the preview's veil. */
export function softEdgeAmount(t: number, d: number, k: number): number {
  return within(k * calmEnvelope(t, d), 0, 1, 0);
}

/** Scratch line `i` (0 … dustLines − 1) in the film frame under `t`: whether it shows, and where (a fraction of the width). */
export function dustScratch(t: number, k: number, i: number): { on: boolean; x: number } {
  const n = Math.floor(EFFECT.dustFps * t);
  return { on: hash(n * 7 + i * 13 + 1) < EFFECT.dustChance * k, x: within(hash(n * 3 + i * 17 + 2), 0, 1, 0) };
}

/** How far the colours are turned round the colour wheel, in radians: a slow swing of up to half a turn each way. */
export function hueAngle(t: number, d: number, k: number): number {
  return within(Math.PI * k * calmEnvelope(t, d) * Math.sin(TAU * EFFECT.hueHz * t), -Math.PI, Math.PI, 0);
}

/** How much of the mirrored frame shows: full from strength `mirrorFull` up, fading below it. */
export function mirrorMix(t: number, d: number, k: number): number {
  return within(within(k / EFFECT.mirrorFull, 0, 1, 0) * calmEnvelope(t, d), 0, 1, 0);
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
    case "heartbeat": out.scale = heartbeatScale(t, d, k); break;
    case "strobe": layer(EFFECT_COLORS.strobe, strobeOpacity(t, k)); break;
    case "filmBurn": case "lensFlare": case "softEdges": case "dust": break;   // drawn as shapes (`effectShapes`)
    case "hueShift": case "mirror": break;                                      // export only
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

/** What the preview draws over the picture for the effects that are more than a flat layer. `x` is a fraction of the frame's width. */
export type EffectShape =
  | { kind: "burn"; color: string; opacity: number }                  // warm light from the left edge
  | { kind: "flare"; color: string; opacity: number; x: number }      // a soft vertical band of light centred at x
  | { kind: "edges"; color: string; opacity: number }                 // a pale veil on the four edges
  | { kind: "scratch"; color: string; opacity: number; x: number };   // a thin vertical line at x

/** The shapes of one effect at local time t; [] for an effect without one, for input that is not finite, and outside [0, d]. A shape with no opacity is left out. */
export function effectShapes(type: EffectId, t: number, d: number, k: number): EffectShape[] {
  if (!Number.isFinite(t) || !Number.isFinite(d) || !Number.isFinite(k) || !(d > 0) || t < 0 || t > d) return [];
  const out: EffectShape[] = [];
  switch (type) {
    case "filmBurn": { const opacity = burnOpacity(t, d, k); if (opacity > 0) out.push({ kind: "burn", color: EFFECT_COLORS.filmBurn, opacity }); break; }
    case "lensFlare": { const opacity = flareOpacity(t, d, k); if (opacity > 0) out.push({ kind: "flare", color: EFFECT_COLORS.lensFlare, opacity, x: flareX(t) }); break; }
    case "softEdges": { const opacity = EFFECT.edgeVeil * softEdgeAmount(t, d, k); if (opacity > 0) out.push({ kind: "edges", color: EFFECT_COLORS.softEdges, opacity }); break; }
    case "dust": {
      const opacity = within(EFFECT.dustOpacity * k * envelope(t, d), 0, EFFECT.dustOpacity, 0);
      if (!(opacity > 0)) break;
      for (let i = 0; i < EFFECT.dustLines; i++) { const s = dustScratch(t, k, i); if (s.on) out.push({ kind: "scratch", color: EFFECT_COLORS.dust, opacity, x: s.x }); }
      break;
    }
    default: break;
  }
  return out;
}

/** The shapes of every effect covering project time `time`, in list order. */
export function combinedEffectShapes(effects: EffectItem[], time: number): EffectShape[] {
  return activeEffects(effects, time).flatMap(({ effect, t, d }) => effectShapes(effect.type, t, d, effect.intensity));
}
