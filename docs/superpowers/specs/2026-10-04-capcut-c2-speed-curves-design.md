# CapCut group C, round 2 — Speed curves: design

**Date:** 2026-10-04
**Status:** Implemented 2026-10-04 (Swift export unverified until an EAS build exists; on-device checklist pending)
**Builds on:** schema v7 (group C round 1)

## 1. What the user gets

The Speed sheet gains two tabs: **Normal** (today's constant slider) and **Curve** with six presets — Montage, Hero, Bullet, Jump cut, Flash in, Flash out — plus None. A curve makes the clip speed up and slow down as it plays. Out of scope: custom curve points, smooth (optical-flow) slow motion, pitch correction.

## 2. Model — a curve is a list of constant-speed steps

AVFoundation retimes a range at one constant rate, and the preview player has one playback rate at a time, so a curve is stored and played as **steps**: each step is a span of source time played at one speed. This makes the preview and the export use the same maths.

```ts
export const SCHEMA_VERSION = 8 as const;
export const SPEED_CURVE_IDS = ["montage", "hero", "bullet", "jumpCut", "flashIn", "flashOut"] as const;
export type SpeedCurveId = (typeof SPEED_CURVE_IDS)[number];
/** `from` = source seconds where this step starts; it runs to the next step's `from`. Sorted by `from`. */
export interface SpeedStep { from: number; speed: number }
export interface SpeedCurve { id: SpeedCurveId; steps: SpeedStep[] }
// Clip gains: speedCurve: SpeedCurve | null   (default null; photos always null)
```

Preset shapes (`src/editor/effects.ts`, `SPEED_CURVES[id] = { label, shape }`): eight speeds for eight equal slices of the clip's trimmed source range at the moment the preset is applied.

| id | label | shape |
|---|---|---|
| montage | Montage | 2.5, 2.5, 0.5, 2.5, 2.5, 0.5, 2.5, 2.5 |
| hero | Hero | 1, 2, 3, 0.5, 0.5, 3, 2, 1 |
| bullet | Bullet | 3.5, 3.5, 3.5, 0.3, 0.3, 3.5, 3.5, 3.5 |
| jumpCut | Jump cut | 1, 4, 1, 4, 1, 4, 1, 4 |
| flashIn | Flash in | 4, 3, 2, 1.5, 1, 1, 1, 1 |
| flashOut | Flash out | 1, 1, 1, 1, 1.5, 2, 3, 4 |

Rules:
- Applying a preset writes eight steps across `[trimStart, trimEnd]` (absolute source times) and sets `speed` to 1. Setting a constant speed clears the curve. The two are exclusive.
- Steps are absolute source times, so **trim** and **split** keep the steps as they are (each half keeps the part of the curve that covers it); source time before the first step uses the first step's speed, after the last step the last step's speed.
- **Replace** re-applies the same preset across the new clip's range. **Freeze**: the still has no curve. **Reverse**: allowed; the steps stay on their pictures and play in mirrored order. Photos refuse curves.
- Step speeds are clamped to `SPEED_LIMITS` (0.25–4); at most 64 steps; a step shorter than 0.01 s of source is dropped by the sanity pass.

As built:
- A preset is refused (with a message) when the clip is too short for it. Choosing None always works; on a very short piece it lowers the constant speed so the clip keeps the minimum length.
- In the preview, a reversed curved clip uses the forward step speeds (the preview plays reversed clips forwards).
- Replace re-spreads the preset over the new clip, so the clip's length can change.

Migration v7 → v8 adds `speedCurve: null`. Sanity pass: unknown id → null; non-finite / out-of-range steps repaired or dropped; unsorted steps sorted; an empty step list → null; a photo → null; a curve forces `speed` to 1.

## 3. Time maths — `src/editor/model/timeline.ts` only

Every function that converts between source time and output time becomes curve-aware; nothing else in the app may use `speed` or the steps directly.

```ts
/** The clip's source range cut into constant-speed spans in SOURCE order: one span for a constant-speed clip. */
export function speedSpans(c: Clip): { from: number; to: number; speed: number }[]
export const clipDuration: (c: Clip) => number                       // Σ (to − from) / speed
export function outputToSource(c: Clip, offsetInClip: number): number // forward playback
export function sourceToOutput(c: Clip, sourceTime: number): number
export const freezeSourceTime / sourceTimeAt: (c, offset) => number  // reversed-aware
export function outputOffsetOf(c: Clip, sourceTime: number): number   // reversed-aware inverse
export function splitSourceRanges(c, offset)                           // unchanged contract
/** Playback rate at an output offset (the speed of the span being shown). */
export function rateAt(c: Clip, offsetInClip: number): number
/** Spans in PLAYBACK order as (source seconds, speed) — reversed clips list them back to front. For the export. */
export function playbackSpans(c: Clip): { duration: number; speed: number }[]
```
Outside `[trimStart, trimEnd]` (transition handles, keyframes beyond the trim) the mapping continues linearly with the edge span's speed. For a clip without a curve every function returns exactly what it returns today (bit-identical).

## 4. Screens

- **Speed sheet**: `Chip` tabs Normal · Curve. Normal = today's slider (disabled look when a curve is active; moving it clears the curve). Curve = tiles None + six presets, each with a small eight-bar sparkline of its shape; the selected tile has the ring; one undo step per pick. Under the tiles: "Clip length 4.2 s" (the new output duration).
- The clip strip's speed badge shows the curve's label instead of "2×".
- **Preview**: the player's playback rate follows `rateAt` as the playhead crosses steps; scrubbing maps through the curve. The "Preview" tag shows on a curved clip (rate changes can hitch and the clip's sound changes pitch in steps).
- Speed and Curve are disabled for photos, as Speed is today.

## 5. Export

`ExportClip` gains `speedSpans: { duration: number; speed: number }[]` (`playbackSpans`; empty for a constant-speed clip, which keeps using `speed`). Swift: after a clip's source range is inserted into the composition, each span is retimed with `scaleTimeRange` (video and the clip's audio alike), working from the last span to the first so earlier ranges do not shift; transition handles use the nearest edge span's speed. `MediaPrePass.rewrite` carries the field (a prepared reversed copy or photo runs in playback order, which is exactly the order `speedSpans` is in). A clip with no spans takes today's path.

## 6. Testing

`timeline.ts`: hand-computed vectors for every function on a curved clip (forward, reversed, trimmed after applying, split), inverse properties (`sourceToOutput(outputToSource(x)) ≈ x`), and bit-identical results for constant-speed clips against the old formulas. Ops, migration, sheet, badge, preview rate changes, export request. Swift by reading + XCTests for the span arithmetic.

## 7. Risks

- Everything that touched `clipDuration` / source ↔ output keeps working only if it goes through `timeline.ts`; a repo-wide audit for stray `speed` arithmetic is part of the build.
- Preview rate switches may hitch on a real phone; the tag signals it.
