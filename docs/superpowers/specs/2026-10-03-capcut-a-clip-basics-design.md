# Clipy — CapCut-style tools, Group A: Clip Basics — Design

**Date:** 2026-10-03
**Status:** Implemented 2026-10-03 (Swift export unverified until an EAS build exists; on-device checklist pending)
**Roadmap:** `docs/superpowers/research/capcut-roadmap.md` (order A → B → C → F → D → E → G)
**Parent specs:** the master design and the Phase 1–3 / UI-redesign specs (all still apply unless overridden here)

## 1. Goal

Add the clip tools people reach for right after split and trim: transform by gesture, rotate and flip, crop, a background behind the clip, photos as clips, adding clips to an existing project, replacing a clip, reverse, and freeze frame.

**Done when** (iPhone, Expo Go): select a clip and pinch / drag / twist it on the preview (it snaps to centre and to straight angles); Transform sheet buttons work (Rotate 90°, both flips, Fit, Fill, Reset); Crop screen cuts the clip with a preset; Background shows black / a colour / blur behind a clip that does not fill the frame; photos can be added and stretched from 0.5 s to 60 s; "+" adds media to an open project; Replace swaps a clip's media and keeps its edits; Reverse shows its badge and the "Preview" tag; Freeze inserts a 2-second still at the playhead; everything undoes, survives closing and reopening, and a v4 project opens unchanged. Jest green. Swift export extended and reviewed by reading.

## 2. Decisions (from brainstorming)

| Question | Decision |
|---|---|
| Transform UX | Gestures on the preview + a Transform sheet with buttons (no sliders) |
| Crop | A real crop tool: draggable box, grid, presets Free · 9:16 · 1:1 · 4:5 · 16:9 |
| Reverse | Added now; preview plays forwards with the "Preview" tag; export plays backwards |
| Photos | 3 s default, 0.5–60 s by dragging the end handles; speed and volume disabled |
| Freeze frame | Split at the playhead and insert a 2 s still of that frame (a photo clip) |
| Background | Per clip: black, colour, or blur; "Apply to all clips" |
| Extra from research | Replace clip (keeps edits); add media to an existing project |

## 3. Constraints

- **Existing projects look the same.** Today every clip fills the frame (cover). That is the default of the new model: `scale 1` means Fill.
- **One geometry module.** `src/editor/model/clipLayout.ts` computes where a clip sits in the frame; the preview, the gestures, Fit / Fill and the export all use it. `modules/clipy-video/ios/ClipLayout.swift` mirrors it exactly; a Jest test pins shared numeric vectors (the same pattern as `overlayLayout.ts` ↔ `OverlayLayout.swift`).
- **Preview honesty.** Transform, crop, flips, photos, freeze frames and colour backgrounds are exact in the preview. Blur background and Reverse are approximations and show the existing "Preview" tag.
- Clip gestures never steal a touch from a text or sticker overlay; overlays stay on top.
- One undo step per gesture (transaction), like trim and overlay drags.
- Expo Go safe: no new native code in the preview path. Photos use React Native's `Image`; freeze frames use `expo-video-thumbnails` (already installed). The Swift work is export-only and unverified until the first native build.
- Speed arithmetic still lives only in `timeline.ts`. Photos have `speed 1`, `muted true`, `reversed false`.
- Schema → `5`, with a v4 → v5 migration and the idempotent sanity pass on every load.
- UI from the kit and theme tokens only; no One Piece content; TDD; `git add` explicit paths; commit trailer unchanged.

## 4. Data Model (schema v5)

```ts
export const CLIP_KINDS = ["video", "photo"] as const;
export interface ClipTransform { scale: number; x: number; y: number; rotation: number; flipH: boolean; flipV: boolean }
export interface CropRect { x: number; y: number; w: number; h: number }          // fractions of the source picture, 0–1
export type ClipBackground = { type: "black" } | { type: "color"; color: string } | { type: "blur" };

export interface Clip {
  /* existing fields */
  kind: "video" | "photo";
  transform: ClipTransform;      // default { scale: 1, x: 0, y: 0, rotation: 0, flipH: false, flipV: false }
  crop: CropRect;                // default { x: 0, y: 0, w: 1, h: 1 }
  background: ClipBackground;    // default { type: "black" }
  reversed: boolean;             // default false
}
export const TRANSFORM_LIMITS = { scale: [0.2, 5] as const, offset: [-1, 1] as const };
export const CROP_MIN = 0.1;                       // smallest crop side, as a fraction of the source
export const PHOTO = { defaultSeconds: 3, minSeconds: 0.5, maxSeconds: 60, freezeSeconds: 2 };
```

- `transform.scale`: 1 = the cropped picture just covers the frame (Fill). `x`, `y`: offset of the picture's centre from the frame's centre, as a fraction of the frame's width / height (0 = centred). `rotation`: degrees, clockwise, −180 < r ≤ 180. Flips apply to the picture before rotation.
- A photo clip has `sourceDuration = PHOTO.maxSeconds`, `trimStart = 0`, `trimEnd` = its length; its `width` / `height` are the image's pixels.
- Migration v4 → v5 adds the defaults above with `kind: "video"`. The sanity pass clamps every number to its limits, repairs an invalid crop to the full picture, an unknown background to black, and forces the photo rules.

## 5. Geometry (`clipLayout.ts` ↔ `ClipLayout.swift`)

```ts
export interface PlacedClip { width: number; height: number; centerX: number; centerY: number; rotation: number; flipH: boolean; flipV: boolean }
/** Size and position of the cropped picture inside a frame of frameW × frameH. */
export function placeClip(source: { width: number; height: number }, crop: CropRect, t: ClipTransform, frameW: number, frameH: number): PlacedClip
export function fillScale(): 1
/** The scale at which the whole (cropped, rotated) picture is visible inside the frame. */
export function fitScale(source, crop, rotation, frameW, frameH): number
export function coversFrame(placed: PlacedClip, frameW: number, frameH: number): boolean      // false → background is visible
export function snapTransform(t: ClipTransform, fit: number): ClipTransform                   // centre, 90° steps, Fit / Fill
```

- Cropped picture size = `source × crop.w / crop.h`. Its base size is the cover size for the frame (`max(frameW / cw, frameH / ch)`); for rotations within 1° of ±90° the picture's sides are swapped when computing cover and fit, so Fill and Fit mean the same after Rotate 90°.
- Snapping (applied while dragging): offsets within 0.02 of 0 snap to 0; rotation within 3° of a multiple of 90° snaps to it; scale within 3 % of 1 (Fill) or of `fitScale` snaps to it. A light haptic fires when a snap engages.

## 6. Screens & Interactions

### 6.1 Toolbar
- **Edit** group (now horizontally scrollable): `Split · Trim · Transform · Crop · Replace · Reverse · Freeze · Duplicate · Delete · Ratio`. All but Ratio need a selected clip; Reverse and Freeze are disabled for photos (freezing a photo would only duplicate it).
- **Effects** group gains `Background` (needs a selected clip).
- **Audio → Volume** and **Effects → Speed** are disabled for photo clips.

### 6.2 Transform
- With a clip selected and no overlay selected, the preview accepts: one-finger drag (move), pinch (scale), two-finger twist (rotate). A hairline gold frame outlines the clip's picture while it is selected. A tap still toggles play.
- Transform sheet: `Rotate 90°` (adds 90°, normalised), `Flip ↔`, `Flip ↕`, `Fit`, `Fill`, `Reset` (default transform; crop is left alone). Each is one undo step.

### 6.3 Crop
- Full-screen modal over the editor showing a still of the clip at the playhead (photo: the photo), unrotated and unflipped, with a crop box: four corner handles, drag inside to move, rule-of-thirds grid, dimmed outside. Presets `Free · 9:16 · 1:1 · 4:5 · 16:9` lock the box's shape. `Reset`, `Cancel`, `Done` (one undo step). The box cannot shrink below `CROP_MIN` or leave the picture.

### 6.4 Background
- Sheet with `Black`, the colour swatches (the same palette as text), and `Blur`; title action `Apply to all`. Blur in the preview is an enlarged, blurred still of the clip (`Image` `blurRadius`) with the "Preview" tag; the export blurs the live frame.

### 6.5 Photos, Add, Replace
- The media picker (`pickMedia`) accepts videos and photos. Used by New clip, by the **"+" tile** at the end of the clip strip (adds to the open project, appended after the last clip), and by **Replace**.
- A photo's strip shows the photo repeated as thumbnails; its end handle changes `trimEnd` within 0.5–60 s; its start handle is hidden.
- **Replace**: pick one item; the clip keeps its id, filter, transform, crop, background, transition and volume. Its trim is reset to the new media's full length capped at the old output length; switching to a photo applies the photo rules; switching to a video clears nothing else. One undo step; the old media file stays until the project is deleted (undo must work).

### 6.6 Reverse
- Toggles `reversed`. The strip shows a "◀" badge; the preview plays forwards and shows the "Preview" tag while the playhead is on that clip; captions and overlays are unaffected (they are in output time).

### 6.7 Freeze frame
- At the playhead inside a video clip: capture a full-quality still of that source frame (`expo-video-thumbnails`, `quality: 1`), save it in the project's media folder, split the clip at the playhead, and insert a photo clip of `PHOTO.freezeSeconds` between the halves, inheriting the clip's filter, transform, crop and background. One undo step. If the capture fails, a toast "Couldn't capture that frame" and nothing changes.

## 7. Modules

- `src/editor/model/types.ts`, `migrate.ts` — schema v5.
- `src/editor/model/clipLayout.ts` (+ tests, shared vectors) — §5.
- `src/editor/model/ops.ts` — `setClipTransform`, `resetClipTransform`, `rotateClip90`, `flipClip`, `fitClip`, `fillClip`, `setClipCrop`, `setClipBackground`, `setBackgroundForAllClips`, `setClipReversed`, `replaceClipMedia`, `insertFreezeFrame`, photo-aware `trimClip` / `splitClipAt` / `setClipSpeed` (no-op for photos).
- `src/projects/pickMedia.ts` (replaces `pickVideos.ts`), `storage.ts` — `importMedia(projectId, assets)`, `saveStill(projectId, tempUri)`.
- `src/editor/components/` — `ClipFrame` (renders the placed, cropped video or photo with its background), `ClipGestures`, `TransformSheet`, `CropScreen`, `BackgroundSheet`, `AddClipTile`; `PreviewPlayer`, `ClipThumbStrip`, `TrimHandles`, `EditorToolbar`, `toolGroups.ts` updated.
- `modules/clipy-video/index.ts` — `ExportClip` gains `kind`, `sourceWidth`, `sourceHeight`, `transform`, `crop`, `background`, `reversed`.
- `modules/clipy-video/ios/` — `ClipLayout.swift`; a **pre-pass** that turns each photo into a short video file and each reversed clip into a reversed copy (reader → writer, in chunks) in the temp folder, cleaned up after export; `ClipyCompositor` places each frame with the layout, draws the colour or blurred background, then applies the filter and transitions as today.

## 8. Error Handling

- An unreadable picked item is skipped with the existing "N of M added" toast; a missing photo file is reported like a missing video.
- Replace with nothing picked, or with an unreadable file: nothing changes.
- Gestures clamp to `TRANSFORM_LIMITS`; a degenerate crop cannot be produced.
- Export: a photo or reversed pre-pass failure aborts the export with a readable message and removes temp files; cancelling during the pre-pass cancels cleanly.
- Loading a v5 file with out-of-range values repairs them; a newer schema is rejected with the existing message.

## 9. Testing

- **Jest:** `clipLayout` (fill, fit, 90° swap, flips, offsets, `coversFrame`, snapping, limits) with the shared vectors also asserted against literals copied into the Swift file's comments; every new op incl. undo and photo rules; migration v4 → v5 and the sanity pass; `pickMedia` mapping (photo vs video, duration units); storage import of photos and stills; toolbar enable / disable rules; each sheet and the crop screen (box maths as pure functions); preview renders photo vs video, the gold frame, the Preview tag for blur and reverse; export-request mapping.
- **Swift:** unit tests for `ClipLayout` vectors and the pre-pass planning (which clips need it), written but uncompiled.
- **Manual (device):** the "Done when" walkthrough.

## 10. Out of Scope

Auto reframe; keyframed transforms (Group C); picture-in-picture (Group E); crop of a playing video with live preview inside the crop screen; image backgrounds or patterns; per-clip opacity; animated photo effects (Ken Burns — Group C); extract audio (Group D).
