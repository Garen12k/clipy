import { clampOpacity, type AnimComboId, type AnimInId, type AnimLoopId, type Clip, type ClipTransform, type Keyframe, type Overlay } from "./types";
import { clipDuration, hasSpeedCurve, outputOffsetOf, sourceTimeAt } from "./timeline";

/**
 * Where a clip / text / sticker is and how opaque it is at a time: keyframes plus animation presets (spec section 4).
 * Mirrored by Motion.swift: keep constants and formulas identical. Pure maths — no React, no store.
 * Clip offsets are fractions of the frame as in ClipTransform; overlay offsets are fractions of the frame (0–1); rotation in degrees.
 */
export interface MotionDelta { dx: number; dy: number; scale: number; rotation: number; opacity: number }
export const IDENTITY_DELTA: MotionDelta = { dx: 0, dy: 0, scale: 1, rotation: 0, opacity: 1 };

export const MOTION = { slideClip: 1, slideOverlay: 0.25, zoomFrom: 0.6, zoomOutFrom: 1.4, spinTurn: 180, spinFrom: 0.5,
  popPeak: 1.15, popPeakAt: 0.6, popFadeBy: 0.3, rise: 0.15, comboZoom: 0.15, panScale: 1.1, pan: 0.05, swayDeg: 3, swayCycles: 2, swayScale: 1.08,
  pulseAmp: 0.05, pulseHz: 1, wiggleDeg: 8, wiggleHz: 2, loopPulseAmp: 0.1, loopPulseHz: 1.5, loopSpinDegPerSec: 180,
  floatAmp: 0.015, floatHz: 0.8, blinkMin: 0.35, blinkHz: 1.5, shakeAmp: 0.008, shakeHz: 8 } as const;

const TAU = 2 * Math.PI;
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number): number => clamp(v, 0, 1);
const identity = (): MotionDelta => ({ ...IDENTITY_DELTA });

/** 1 − (1 − p)³, progress clamped to 0–1. */
export const easeOut = (p: number): number => { const q = 1 - clamp01(p); return 1 - q * q * q; };
/** u²(3 − 2u), progress clamped to 0–1. */
export const smooth = (u: number): number => { const v = clamp01(u); return v * v * (3 - 2 * v); };

/** In animation at progress `p` (0 → 1); the identity at p = 1. `distance` = how far a slide travels (MOTION.slideClip / slideOverlay). */
export function animInDelta(id: AnimInId, p: number, distance: number): MotionDelta {
  const d = identity();
  if (!Number.isFinite(p) || !Number.isFinite(distance)) return d;
  const raw = clamp01(p);
  const e = easeOut(raw);
  switch (id) {
    case "fade": d.opacity = e; break;
    case "slideLeft": d.dx = (1 - e) * distance; break;          // enters from the right, moving left
    case "slideRight": d.dx = (e - 1) * distance; break;         // = −(1 − e)·distance
    case "slideUp": d.dy = (1 - e) * distance; break;            // enters from below
    case "slideDown": d.dy = (e - 1) * distance; break;
    case "zoomIn": d.scale = MOTION.zoomFrom + (1 - MOTION.zoomFrom) * e; d.opacity = e; break;
    case "zoomOut": d.scale = MOTION.zoomOutFrom - (MOTION.zoomOutFrom - 1) * e; d.opacity = e; break;
    case "spin":
      d.rotation = MOTION.spinTurn * (e - 1);                    // = −spinTurn·(1 − e)
      d.scale = MOTION.spinFrom + (1 - MOTION.spinFrom) * e;
      d.opacity = e;
      break;
    case "pop":
      d.scale = raw < MOTION.popPeakAt
        ? MOTION.popPeak * raw / MOTION.popPeakAt
        : MOTION.popPeak - (MOTION.popPeak - 1) * ((raw - MOTION.popPeakAt) / (1 - MOTION.popPeakAt));
      d.opacity = Math.min(1, raw / MOTION.popFadeBy);
      break;
    case "rise": d.dy = MOTION.rise * (1 - e); d.opacity = e; break;   // `distance` is not applied
    default: break;
  }
  return d;
}

/** Out animation at progress `p` (0 → 1); the identity at p = 0. The In played backwards with dx, dy and rotation negated. */
export function animOutDelta(id: AnimInId, p: number, distance: number): MotionDelta {
  if (!Number.isFinite(p)) return identity();
  const d = animInDelta(id, 1 - clamp01(p), distance);
  return { dx: 0 - d.dx, dy: 0 - d.dy, scale: d.scale, rotation: 0 - d.rotation, opacity: d.opacity };
}

/** Combo (clips): `p` = linear progress through the clip, `seconds` = clip-local seconds. */
export function animComboDelta(id: AnimComboId, p: number, seconds: number): MotionDelta {
  const d = identity();
  if (!Number.isFinite(p) || !Number.isFinite(seconds)) return d;
  const q = clamp01(p);
  switch (id) {
    case "zoomInSlow": d.scale = 1 + MOTION.comboZoom * q; break;
    case "zoomOutSlow": d.scale = 1 + MOTION.comboZoom * (1 - q); break;
    case "panLeft": d.scale = MOTION.panScale; d.dx = MOTION.pan * (1 - 2 * q); break;
    case "panRight": d.scale = MOTION.panScale; d.dx = MOTION.pan * (2 * q - 1); break;   // = −pan·(1 − 2p)
    case "sway": d.scale = MOTION.swayScale; d.rotation = MOTION.swayDeg * Math.sin(TAU * MOTION.swayCycles * q); break;
    case "pulse": d.scale = 1 + MOTION.pulseAmp * (0.5 - 0.5 * Math.cos(TAU * MOTION.pulseHz * seconds)); break;
    default: break;
  }
  return d;
}

/** Loop (text / stickers): `seconds` since the overlay's start. */
export function animLoopDelta(id: AnimLoopId, seconds: number): MotionDelta {
  const d = identity();
  if (!Number.isFinite(seconds)) return d;
  const s = seconds;
  switch (id) {
    case "wiggle": d.rotation = MOTION.wiggleDeg * Math.sin(TAU * MOTION.wiggleHz * s); break;
    case "pulse": d.scale = 1 + MOTION.loopPulseAmp * Math.sin(TAU * MOTION.loopPulseHz * s); break;
    case "spin": d.rotation = MOTION.loopSpinDegPerSec * s; break;
    case "float": d.dy = MOTION.floatAmp * Math.sin(TAU * MOTION.floatHz * s); break;
    case "blink": d.opacity = MOTION.blinkMin + (1 - MOTION.blinkMin) * (0.5 + 0.5 * Math.cos(TAU * MOTION.blinkHz * s)); break;
    case "shake": d.dx = MOTION.shakeAmp * Math.sin(TAU * MOTION.shakeHz * s); break;
    default: break;
  }
  return d;
}

/** In / Out lengths that fit inside an item of `length` seconds: both shrink proportionally when `in + out > length`. */
export function edgeDurations(inDur: number, outDur: number, length: number): { in: number; out: number } {
  const a = Number.isFinite(inDur) && inDur > 0 ? inDur : 0;
  const b = Number.isFinite(outDur) && outDur > 0 ? outDur : 0;
  if (!(length > 0) || !Number.isFinite(length)) return { in: 0, out: 0 };
  if (a + b <= length) return { in: a, out: b };
  const k = length / (a + b);
  return { in: a * k, out: b * k };
}

export interface KeyValues { x: number; y: number; scale: number; rotation: number; opacity: number }
const valuesOf = (k: KeyValues): KeyValues => ({ x: k.x, y: k.y, scale: k.scale, rotation: k.rotation, opacity: k.opacity });

/**
 * Value at time `t` from pins sorted by `t`: holds before the first and after the last, `a + (b − a)·smooth(u)` in between
 * (rotation numerically — no shortest path). Empty → null. A non-finite `t` holds the first pin.
 */
export function sampleKeyframes(keyframes: Keyframe[], t: number): KeyValues | null {
  const n = keyframes.length;
  if (n === 0) return null;
  const first = keyframes[0];
  const last = keyframes[n - 1];
  if (n === 1 || !Number.isFinite(t) || t <= first.t) return valuesOf(first);
  if (t >= last.t) return valuesOf(last);
  let i = 1;
  while (i < n - 1 && keyframes[i].t <= t) i++;
  const a = keyframes[i - 1];
  const b = keyframes[i];
  const span = b.t - a.t;
  if (!(span > 0)) return valuesOf(b);
  const s = smooth((t - a.t) / span);
  const mix = (from: number, to: number): number => from + (to - from) * s;
  return { x: mix(a.x, b.x), y: mix(a.y, b.y), scale: mix(a.scale, b.scale), rotation: mix(a.rotation, b.rotation), opacity: mix(a.opacity, b.opacity) };
}

/** An animation delta layered on a base value: offsets and rotation add, scale and opacity multiply. Nothing is clamped here. */
export function combine(base: KeyValues, d: MotionDelta): KeyValues {
  return { x: base.x + d.dx, y: base.y + d.dy, scale: base.scale * d.scale, rotation: base.rotation + d.rotation, opacity: base.opacity * d.opacity };
}

/** Two deltas as one (same rule as `combine`). */
function compose(a: MotionDelta, b: MotionDelta): MotionDelta {
  return { dx: a.dx + b.dx, dy: a.dy + b.dy, scale: a.scale * b.scale, rotation: a.rotation + b.rotation, opacity: a.opacity * b.opacity };
}

type Edge = { id: AnimInId; duration: number } | null;
/** In + Out delta at `local` seconds into an item of `length` seconds. After scaling the two windows never overlap. */
function edgeDelta(inEdge: Edge, outEdge: Edge, local: number, length: number, distance: number): MotionDelta {
  const e = edgeDurations(inEdge ? inEdge.duration : 0, outEdge ? outEdge.duration : 0, length);
  let d = identity();
  if (inEdge && e.in > 0 && local < e.in) d = compose(d, animInDelta(inEdge.id, local / e.in, distance));
  if (outEdge && e.out > 0 && local > length - e.out) d = compose(d, animOutDelta(outEdge.id, (local - (length - e.out)) / e.out, distance));
  return d;
}
const lengthOf = (seconds: number): number => (Number.isFinite(seconds) && seconds > 0 ? seconds : 0);

/**
 * Base values of a clip at an output offset: keyframes (sampled at the source time) or the static transform with opacity 1.
 * On a speed curve source and output time are only piecewise proportional, so the pins are moved to output-local time (ascending —
 * a reversed clip reverses them) and sampled at the offset: exactly what the export does with the pins it is sent.
 */
export function clipBaseAt(clip: Clip, offsetInClip: number): KeyValues {
  const keyed = hasSpeedCurve(clip)
    ? sampleKeyframes(clip.keyframes.map((k) => ({ ...k, t: outputOffsetOf(clip, k.t) })).sort((a, b) => a.t - b.t), offsetInClip)
    : sampleKeyframes(clip.keyframes, sourceTimeAt(clip, offsetInClip));
  if (keyed) return keyed;
  const t = clip.transform;
  return { x: t.x, y: t.y, scale: t.scale, rotation: t.rotation, opacity: 1 };
}

/**
 * A clip's placement and opacity at `offsetInClip` (output seconds, clamped to the clip): base + In / Out, or + Combo.
 * Flips come from the static transform; the transform is NOT clamped to TRANSFORM_LIMITS; the motion opacity is clamped to 0–1 and
 * multiplied by the clip's own `opacity` (0–1; a default clip: × 1).
 * A non-finite offset gives the base at the clip's start with no animation.
 */
export function resolveClipMotion(clip: Clip, offsetInClip: number): { transform: ClipTransform; opacity: number } {
  const length = lengthOf(clipDuration(clip));
  const finite = Number.isFinite(offsetInClip);
  const local = finite ? clamp(offsetInClip, 0, length) : 0;
  const base = clipBaseAt(clip, local);
  const a = clip.animation;
  let delta = identity();
  if (finite) {
    delta = a.combo
      ? animComboDelta(a.combo, length > 0 ? local / length : 0, local)
      : edgeDelta(a.in, a.out, local, length, MOTION.slideClip);
  }
  const v = combine(base, delta);
  return { transform: { ...clip.transform, x: v.x, y: v.y, scale: v.scale, rotation: v.rotation }, opacity: clamp01(v.opacity) * clampOpacity(clip.opacity) };
}

/** Base values of a text / sticker at project time `time`: its keyframes (at `time − start`) or its own placement with opacity 1. */
export function overlayBaseAt(o: Overlay, time: number): KeyValues {
  return sampleKeyframes(o.keyframes, time - o.start) ?? { x: o.x, y: o.y, scale: o.scale, rotation: o.rotation, opacity: 1 };
}

/**
 * A text's / sticker's placement and opacity at project time `time` (clamped to its life): base + In / Out + Loop.
 * Opacity is clamped to 0–1. A non-finite time gives the base with no animation.
 */
export function resolveOverlayMotion(o: Overlay, time: number): KeyValues {
  const base = overlayBaseAt(o, time);
  if (!Number.isFinite(time)) return { ...base, opacity: clamp01(base.opacity) };
  const length = lengthOf(o.end - o.start);
  const local = clamp(time - o.start, 0, length);
  const a = o.animation;
  let delta = edgeDelta(a.in, a.out, local, length, MOTION.slideOverlay);
  if (a.loop) delta = compose(delta, animLoopDelta(a.loop, local));
  const v = combine(base, delta);
  return { ...v, opacity: clamp01(v.opacity) };
}

/** Any animation or keyframe (a clip without takes exactly the old preview / export path). */
export const hasClipMotion = (c: Clip): boolean =>
  c.animation.in !== null || c.animation.out !== null || c.animation.combo !== null || c.keyframes.length > 0;
export const hasOverlayMotion = (o: Overlay): boolean =>
  o.animation.in !== null || o.animation.out !== null || o.animation.loop !== null || o.keyframes.length > 0;
