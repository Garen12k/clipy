# CapCut group C, round 1 — Animations and keyframes: design

**Date:** 2026-10-04
**Status:** Implemented 2026-10-04 (Swift export unverified until an EAS build exists; on-device checklist pending)
**Roadmap:** `docs/superpowers/research/capcut-roadmap.md`, group C
**Builds on:** groups A and B (schema v6)

## 1. What the user gets

1. **Clip animations** — an In, an Out, or one Combo animation per clip, with a length slider for In / Out.
2. **Text and sticker animations** — In, Out and Loop.
3. **Keyframes** — pin a clip's (or a text's / sticker's) position, size, rotation and opacity at the playhead; the app moves smoothly between pins.

Round 2 (separate spec): speed curves. Out of scope: optical-flow slow motion, stabilise, motion tracking, per-keyframe easing choice, typewriter text.

Preview: everything here only moves, scales, rotates and fades views, so the Expo Go preview is **exact** (no Preview tag). Export: Swift, uncompiled until an EAS build exists.

## 2. Data model — schema v7

```ts
export const SCHEMA_VERSION = 7 as const;

export const ANIM_IN_IDS = ["fade", "slideLeft", "slideRight", "slideUp", "slideDown", "zoomIn", "zoomOut", "spin", "pop", "rise"] as const;
export type AnimInId = (typeof ANIM_IN_IDS)[number];          // Out animations use the same ids
export const ANIM_COMBO_IDS = ["zoomInSlow", "zoomOutSlow", "panLeft", "panRight", "sway", "pulse"] as const;   // clips only
export type AnimComboId = (typeof ANIM_COMBO_IDS)[number];
export const ANIM_LOOP_IDS = ["wiggle", "pulse", "spin", "float", "blink", "shake"] as const;                    // text / stickers only
export type AnimLoopId = (typeof ANIM_LOOP_IDS)[number];
export const ANIM_LIMITS = { minDuration: 0.1, maxDuration: 2, defaultDuration: 0.5 };

export interface AnimEdge { id: AnimInId; duration: number }
export interface ClipAnimation { in: AnimEdge | null; out: AnimEdge | null; combo: AnimComboId | null }      // combo set ⇒ in and out are null
export interface OverlayAnimation { in: AnimEdge | null; out: AnimEdge | null; loop: AnimLoopId | null }
export const NO_CLIP_ANIMATION: ClipAnimation;      // all null
export const NO_OVERLAY_ANIMATION: OverlayAnimation;

/** One pin. Clips: `t` is SOURCE time (seconds in the file; for a photo, seconds from its start) so a pin stays on its picture
 *  through trim, split and speed changes. Overlays: `t` is seconds from the overlay's start. */
export interface Keyframe { t: number; x: number; y: number; scale: number; rotation: number; opacity: number }
export const KEYFRAME_LIMITS = { minGap: 0.05, max: 50, opacity: [0, 1] as const };

// Clip gains:    animation: ClipAnimation;    keyframes: Keyframe[];   (sorted by t)
// Overlays gain: animation: OverlayAnimation; keyframes: Keyframe[];   (text, caption and sticker)
```

Clip keyframe `x, y, scale, rotation` use the same units and limits as `ClipTransform` (`TRANSFORM_LIMITS`); overlay keyframes use the overlay's units (`x`, `y` fractions of the frame 0–1, `scale` within `OVERLAY_LIMITS.scale`). Flips stay on the clip's static transform.

Migration v6 → v7 adds the defaults. Sanity pass (every load, idempotent): unknown animation ids → `null`; durations clamped to `ANIM_LIMITS`; combo set ⇒ in / out forced to null; keyframes — non-finite entries dropped, values clamped, sorted by `t`, entries closer than `minGap` to the previous one dropped, at most `max` kept.

## 3. Behaviour rules

- **When a clip has keyframes**, its position / size / rotation come from the keyframes (the static `x, y, scale, rotation` are ignored; flips still apply); opacity comes from the keyframes (1 without). Between two pins the value is `a + (b − a)·smooth(u)` with `smooth(u) = u²(3 − 2u)`; before the first pin and after the last the value holds. Rotation interpolates numerically (no shortest-path wrapping), so a pin at 350° after 0° makes almost a full turn.
- **Editing with keyframes present** (preview gestures, Fit / Fill / Reset, overlay drag / pinch / rotate): the change is written to the pin at the playhead — updating a pin within `minGap`, otherwise adding one that starts from the current interpolated value. Without keyframes, edits change the static values as today.
- **Keyframe button** (diamond): adds a pin at the playhead from the current value; when the playhead is on a pin, removes it. Removing the last pin copies its position / size / rotation back to the static values (opacity is dropped).
- **Rotate 90°** adds 90° to the static rotation and to every pin.
- **Animations** layer on top of the base (static or keyframed) value: `x += dx`, `y += dy`, `scale ×= s`, `rotation += r`, `opacity ×= o`.
  - In runs over the first `duration` seconds of the clip / overlay, Out over the last; when `in + out` exceeds the item's length both are scaled down proportionally.
  - Combo (clips) runs over the whole clip. Loop (overlays) runs for the overlay's whole life, in seconds since its start, and also during In / Out.
- **Clip opacity** fades the picture over the clip's own background (black / colour / blur) — in preview and export alike.
- Split: both halves keep all pins (they are in source time); the left half keeps In, the right half keeps Out; a Combo stays on both. Duplicate copies everything (no shared arrays). Replace keeps animations and clears keyframes. Freeze: the still gets no animation and no keyframes. Reverse keeps pins (they stay on their pictures).
- **Changed during the build:** splitting a keyframed photo re-bases the right half's pins so the motion continues; trimming a text / sticker's start keeps the value in effect at the new start; rotation written by gestures is not wrapped, so whole turns can be keyframed.
- A transition window shows each clip with its own motion evaluated at its own local time (clamped to the clip's range).

## 4. Shared maths — `src/editor/model/motion.ts` ↔ `modules/clipy-video/ios/Motion.swift`

```ts
export interface MotionDelta { dx: number; dy: number; scale: number; rotation: number; opacity: number }   // identity: 0, 0, 1, 0, 1
export const MOTION = { slideClip: 1, slideOverlay: 0.25, zoomFrom: 0.6, zoomOutFrom: 1.4, spinTurn: 180, spinFrom: 0.5,
  popPeak: 1.15, popPeakAt: 0.6, popFadeBy: 0.3, rise: 0.15, comboZoom: 0.15, panScale: 1.1, pan: 0.05, swayDeg: 3, swayCycles: 2, swayScale: 1.08,
  pulseAmp: 0.05, pulseHz: 1, wiggleDeg: 8, wiggleHz: 2, loopPulseAmp: 0.1, loopPulseHz: 1.5, loopSpinDegPerSec: 180,
  floatAmp: 0.015, floatHz: 0.8, blinkMin: 0.35, blinkHz: 1.5, shakeAmp: 0.008, shakeHz: 8 } as const;
```

- `easeOut(p) = 1 − (1 − p)³`; `smooth(u) = u²(3 − 2u)`; all progress values clamped to 0–1.
- **In** `animInDelta(id, p, distance)` with `e = easeOut(p)` (identity at p = 1):
  - `fade`: opacity `e`
  - `slideLeft`: `dx = (1 − e)·distance` (enters from the right, moving left); `slideRight`: `dx = −(1 − e)·distance`; `slideUp`: `dy = (1 − e)·distance` (enters from below); `slideDown`: `dy = −(1 − e)·distance`
  - `zoomIn`: scale `zoomFrom + (1 − zoomFrom)·e`, opacity `e`; `zoomOut`: scale `zoomOutFrom − (zoomOutFrom − 1)·e`, opacity `e`
  - `spin`: rotation `−spinTurn·(1 − e)`, scale `spinFrom + (1 − spinFrom)·e`, opacity `e`
  - `pop` (uses raw `p`): scale `p < popPeakAt ? popPeak·p/popPeakAt : popPeak − (popPeak − 1)·(p − popPeakAt)/(1 − popPeakAt)`, opacity `min(1, p/popFadeBy)`
  - `rise`: `dy = MOTION.rise·(1 − e)`, opacity `e` (`distance` is not applied)
- **Out** `animOutDelta(id, p, distance)` (identity at p = 0): take `d = animInDelta(id, 1 − p, distance)` and negate `dx`, `dy` and `rotation` (so `slideLeft` exits to the left, `slideUp` exits upward).
- **Combo** `animComboDelta(id, p, seconds)` (`p` = linear progress through the clip, `seconds` = clip-local seconds):
  - `zoomInSlow`: scale `1 + comboZoom·p`; `zoomOutSlow`: scale `1 + comboZoom·(1 − p)`
  - `panLeft`: scale `panScale`, `dx = pan·(1 − 2p)`; `panRight`: scale `panScale`, `dx = −pan·(1 − 2p)`
  - `sway`: scale `swayScale`, rotation `swayDeg·sin(2π·swayCycles·p)`
  - `pulse`: scale `1 + pulseAmp·(0.5 − 0.5·cos(2π·pulseHz·seconds))`
- **Loop** `animLoopDelta(id, seconds)`:
  - `wiggle`: rotation `wiggleDeg·sin(2π·wiggleHz·s)`; `pulse`: scale `1 + loopPulseAmp·sin(2π·loopPulseHz·s)`; `spin`: rotation `loopSpinDegPerSec·s`
  - `float`: `dy = floatAmp·sin(2π·floatHz·s)`; `blink`: opacity `blinkMin + (1 − blinkMin)·(0.5 + 0.5·cos(2π·blinkHz·s))`; `shake`: `dx = shakeAmp·sin(2π·shakeHz·s)`
- `edgeDurations(inDur, outDur, length)` → scaled `{ in, out }` (proportional shrink when `in + out > length`).
- `sampleKeyframes(keyframes, t)` → `{ x, y, scale, rotation, opacity } | null` (null when empty).
- `resolveClipMotion(clip, offsetInClip)` → `{ transform: ClipTransform; opacity: number }`: base (keyframes sampled at the clip's source time for that offset — via `timeline.ts` — or the static transform) combined with In / Out or Combo, `distance = slideClip`. The result is NOT clamped to `TRANSFORM_LIMITS` (animations may leave the frame).
- `resolveOverlayMotion(overlay, time)` → `{ x, y, scale, rotation, opacity }` with `distance = slideOverlay`.

The Swift twin holds the same constants and functions; a Jest parity test compares constants, ids and shared vectors.

## 5. Screens

- **Edit group** gains `Animate` and `Keyframe` (after `Transform`); **Text** and **Stickers** groups gain `Animate` and `Keyframe` (enabled with a selected text / sticker; captions excluded).
- **Clip animation sheet** ("Animation"): tabs In · Out · Combo; a grid of tiles (None + the ids); a "Length" slider (0.1–2.0 s) under In / Out; picking a Combo clears In / Out and vice versa; "Apply to all clips" copies the whole animation.
- **Overlay animation sheet**: tabs In · Out · Loop; same layout.
- **Keyframe tool**: shows a filled diamond when the playhead is on a pin (tap = remove), an outline diamond otherwise (tap = add). Disabled without a selection.
- **Timeline**: the selected clip's strip shows a small diamond at each pin inside the trimmed range; a selected text / sticker pill shows its pins too. Tapping a diamond moves the playhead to it.
- The gold selection frame follows the base (static / keyframed) placement, not the animated one, so handles stay put while an animation plays.

## 6. Export

`ExportClip` gains `animation` (`in` / `out` as `{ id, duration } | null`, `combo` as `string | null`), `keyframes` (converted to **clip-local output seconds**, only those needed to reproduce the motion inside the trimmed range plus one on each side), and `outputDuration`. `ExportOverlay` gains `animation` and `keyframes`. Swift:

- `Motion.swift` mirrors §4.
- Compositor: each `LayerSpec` knows its clip's composition start and length; per frame it resolves the motion at `clamp(compositionTime − start, 0, length)` and places the picture with the resolved transform; opacity multiplies the picture's alpha before it is laid over the background. A clip with no animation and no keyframes takes exactly today's path.
- Overlays (Core Animation layers): when an overlay has an animation or keyframes, its position, transform (scale + rotation) and opacity are driven by `CAKeyframeAnimation`s sampled from `Motion.resolveOverlay` at 30 samples per second over its life; otherwise today's static layer + visibility animation.

## 7. Testing

Model: migration, sanity pass, ops (routing of edits to pins, split / duplicate / replace rules, identity returns, undo steps). `motion.ts`: formulas with hand-computed vectors, end-point identities (In at p = 1, Out at p = 0), parity with Swift. Components: sheets, keyframe tool states, diamonds, preview transforms / opacity, gestures writing pins. Swift: XCTests for `Motion` (uncompiled).

## 8. Risks

- Per-frame re-render of the preview already happens on every playhead tick; motion adds cheap arithmetic only.
- More uncompiled Swift; the Core Animation sampling is the least certain part and is isolated in one function.
- Preview layering: a faded clip shows its background; this must match the export (same rule on both sides).
