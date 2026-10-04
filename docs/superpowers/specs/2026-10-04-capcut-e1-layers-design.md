# CapCut group E, round 1 — Picture-in-picture, opacity, masks: design

**Date:** 2026-10-04
**Status:** Approved by the user ("yes", two rounds: layers + opacity + masks first; blend modes, green screen and blur box second)
**Roadmap:** `docs/superpowers/research/capcut-roadmap.md`, group E
**Builds on:** schema v10

## 1. What the user gets

1. **Layers (picture-in-picture):** a video or photo placed on top of the main video for a stretch of time. A layer has its own bar on the timeline, is moved / resized / rotated with fingers on the preview, and can use the existing clip tools: Transform, Crop, Filter, Adjust, Animate, Keyframe, Speed, Volume, Replace, Duplicate, Delete.
2. **Opacity** on layers and on main clips.
3. **Masks** on layers and main clips: None, Rounded, Circle.

Round 2 (separate spec): blend modes, green screen, blur / mosaic box. Out of scope: background removal, star / heart masks, feathering, transitions between layers, splitting a layer.

Preview: exact (views, a second and third video player). Export: Swift, uncompiled.

## 2. Data model — schema v11

```ts
export const SCHEMA_VERSION = 11 as const;
export const MASK_IDS = ["none", "rounded", "circle"] as const;
export type MaskId = (typeof MASK_IDS)[number];
export const LAYER_LIMITS = { max: 8, maxVideoAtOnce: 2, defaultScale: 0.4, minDuration: 0.3 };
export const MASK = { roundedRadius: 0.12 };   // corner radius as a fraction of the picture box's shorter side

// Clip gains (main clips and layers):
opacity: number;   // 0–1, default 1
mask: MaskId;      // default "none"
/** A layer is a clip with a place on the project timeline. */
export interface LayerClip extends Clip { start: number }   // project seconds
// Project gains:
layers: LayerClip[];   // drawn in list order (later = on top)
```

A layer reuses every `Clip` field. Fixed for layers: `transitionOut` none, `background` ignored (a layer has no background — what it does not cover shows what is beneath). A new layer starts at `transform.scale = LAYER_LIMITS.defaultScale`, centred. Layer ids are unique across clips and layers.

Rules:
- At most `max` layers; at most `maxVideoAtOnce` **video** layers may overlap in time (photo layers are not counted). Ops that would break this are refused.
- Layers keep their project time when main clips change (same rule as overlays / audio). A layer may run past the project's end; the part beyond is never shown or exported.
- A layer's length is `clipDuration(layer)` (speed and curves apply); minimum `minDuration`.
- Migration v10 → v11: `opacity 1`, `mask "none"` on every clip, `layers []`. Sanity pass: opacity clamped (non-finite → 1), unknown mask → none, each layer run through the clip sanity rules plus finite `start ≥ 0`, forced no transition, duplicates of an id dropped, more than `max` dropped.

## 3. Shared geometry — `clipLayout.ts` ↔ `ClipLayout.swift`

`maskRadius(placed, mask)`: the corner radius of the placed picture box in pixels — `none → 0`, `rounded → MASK.roundedRadius × min(width, height)`, `circle → min(width, height) / 2` (a non-square picture becomes a stadium / pill; a square one a circle). The preview applies it as `borderRadius` with `overflow: hidden` on the picture box; the export masks the placed picture with a rounded rectangle of that radius (rotated with the picture).

Opacity: the final picture opacity = `clip.opacity ×` the motion opacity (keyframes / animations). For a main clip a see-through picture shows its own background; for a layer it shows what is beneath.

## 4. Model helpers and ops

```ts
/** Any clip or layer by id. */
export function findItem(p: Project, id: string): { clip: Clip; layer: boolean } | null
/** The item's local output offset at a project time, or null when it is not on screen then. */
export function itemOffsetAt(p: Project, id: string, time: number): number | null
export function layerEnd(l: LayerClip): number                       // start + clipDuration
export function layersAt(p: Project, time: number): LayerClip[]      // on screen at that time, in draw order
```
Every existing op that edits one clip by id (transform, crop, filter, adjust, animation, keyframes, speed, speed curve, volume, fades, replace, reverse) works on a layer too through one shared lookup; `opacity` and `mask` get their own ops. Timeline ops that only make sense on the main track (split, freeze, reorder, transitions, background, reverse stays allowed) are refused for layers. Layer ops: `addLayer`, `moveLayer(start)`, `trimLayer`, `deleteLayer`, `duplicateLayer`, `reorderLayer(up | down)`.

## 5. Screens

- **Edit group** gains `Overlay` (pick a photo or video → added as a layer at the playhead, selected), `Opacity` and `Mask`.
- **Selection:** a layer is selected like a clip (`selectedClipId` holds its id) by tapping it on the preview or its bar. With a layer selected the Edit tools that apply are enabled (Trim, Transform, Animate, Keyframe, Crop, Replace, Reverse, Duplicate, Delete, Opacity, Mask and `Bring forward` / `Send back`); Split, Freeze and Ratio are disabled; Effects-group tools Filter, Adjust and Speed apply; Transition and Background are disabled; Audio-group Volume applies.
- **Timeline:** one "layers" lane (only when the project has layers) showing a bar per layer (photo / video thumbnail tint, title "Layer"), movable by long-press drag and trimmable by its handles, like audio bars. Overlapping bars stack with the selected one on top.
- **Preview:** layers visible at the playhead are drawn above the main clip and below text / stickers, each placed by `placeClip` in the frame with its own motion, opacity and mask. A selected layer shows the gold frame and takes the pinch / drag / twist gestures; tapping a layer selects it (topmost first).
- **Opacity sheet:** one slider 0–100 %. **Mask sheet:** three tiles.

## 6. Preview playback

Each visible **video** layer has its own `expo-video` player (at most two exist at once), kept in step with the playhead by the same rules as the audio players: paused → seek to the layer's source time; playing → play, re-seek only when drift exceeds 0.25 s; rate from `rateAt`; volume from `clipGainAt`. Photo layers are images. Layers outside the playhead are not mounted.

## 7. Export

`ExportRequest.layers`: each an `ExportClip` plus `start`; `ExportClip` gains `opacity` and `mask`. Swift: each layer gets its own composition video track (and its sound goes on an audio track with its gain curve); the pre-pass prepares photo / reversed layers like clips; every instruction lists the layers overlapping its time range; the compositor draws the main frame as today, then each layer in order — placement (`ClipLayout.ciPlacement`), filter / adjust, mask (rounded-rectangle alpha mask of `maskRadius`), opacity — composited source-over; timeline effects (group B) then apply to the whole frame. A project without layers, masks or opacity takes today's path.

## 8. Testing

Model: migration, lookup, ops (limits, overlap rule, refused ops), geometry vectors + Swift parity. Components: layer rendering order, mask radius, opacity, gestures writing to a layer, lane bars, toolbar enable rules for a layer selection, sheets resolving a layer by id. Swift by reading + XCTests for the pure parts.

## 9. Risks

- Extra video players in Expo Go may hitch; the two-at-once limit bounds it.
- Many components look clips up with `project.clips.find`; each must use the shared lookup or it silently ignores layers — a repo-wide audit is part of the build.
- The compositor change is the largest uncompiled piece so far.
