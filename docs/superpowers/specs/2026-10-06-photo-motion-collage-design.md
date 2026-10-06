# Photo motion and collages: design

**Date:** 2026-10-06
**Status:** Approved by the owner in chat ("yes"); not implemented. Plan: `docs/superpowers/plans/2026-10-06-photo-motion-collage.md`.
**Builds on:** CapCut group C1 (`2026-10-04-capcut-c1-motion-design.md`: clip animations, Combos, keyframes, `motion.ts` ↔ `Motion.swift`), group E1 (`2026-10-04-capcut-e1-layers-design.md`: layers, masks, the two-video rule), the strips and panels (`2026-10-05-editing-ui-r1-toolbar-strips-design.md`, `2026-10-05-editing-ui-r2-tall-panels-design.md`) and the looks round (`2026-10-06-more-looks-design.md`, schema v16). Schema v16 → **v17**. **No Swift change, no new package, no new asset.**

## 1. What the owner gets

**Photo motion.** Select a photo: a **Motion** tool is on its bar. It opens a strip with eight one-tap tiles — None, Zoom in, Zoom out, Pan left, Pan right, Pan up, Pan down, Corner zoom — a **Strength** slider (gentle to strong) and **Apply to all photos**.

**Collages.** A **Collage** button on the main bar opens a panel with six layouts — Side by side, Stacked, Big and two, Row of three, Grid of four, Inset (picture-in-picture). Tap a layout, pick that many photos or videos, and they land in the cells, each one filling its cell. **Border** and **Corner** sliders set the gap and the rounding. Every cell is an ordinary layer afterwards.

**Promises.**
1. **Nothing in an existing project changes.** No stored value is rewritten on load; the migration only changes the schema number (§4.3 is the proof). A photo that already has a Combo animation plays exactly as before: the code that plays Combos is not edited.
2. **Nothing changes on its own.** A new photo is still. A collage is only laid out when the owner taps a layout, drags Border or Corner, or taps Fit to frame. Changing the aspect ratio never moves a cell by itself.
3. **The preview shows both exactly** (no "Preview" tag): Motion is zoom and move, a collage is placement, crop and mask — all things the preview already draws with the export's own formulas.
4. **The export needs no new native code.** Motion travels to the export as two keyframes; a collage is layers with a transform, a crop and a mask. Both are paths the Swift export already has (§10).

Out of scope: animated crops (zooming *inside* a collage cell), a coloured collage background, free-form cell sizes, more than one video-pair per collage, new transitions between collages, any change to videos' animations, any Swift.

## 2. Where things stand today (read 2026-10-06, `main` 4d8cc84)

- **Combos.** `ANIM_COMBO_IDS = ["zoomInSlow", "zoomOutSlow", "panLeft", "panRight", "sway", "pulse"]`; `animComboDelta` in `motion.ts` ↔ `Motion.swift` (linear progress; zoom 0.15, pan 0.05 at scale 1.1). A Combo owns the whole clip: `clampClipAnimation` forces In and Out to null. Picked in the Animation strip's Combo tab (`ClipAnimationSheet.tsx`), for videos and photos alike.
- **Keyframes.** `Clip.keyframes` (source time; for a photo, seconds from its start). `sampleKeyframes` interpolates with `smooth(u) = u²(3 − 2u)` on both sides. The request builder `toExportClip` (`modules/clipy-video/index.ts`) already converts pins to clip-local output seconds; Swift's `Motion.resolveClip` samples them and then adds the Combo or In / Out.
- **Photos in the preview.** `PreviewPlayer` hands the clip under the playhead to `ClipFrame` with `clipFrameMotion(clip, offset)` → `resolveClipMotion`. While a photo plays, `usePhotoPlayback` moves the playhead every 50 ms (20 updates a second). Layers are drawn by `LayerStack` through the same `clipFrameMotion`.
- **Layers.** `Project.layers: LayerClip[]` (`Clip & { start }`), at most 8, at most 2 *video* layers on screen at once (`videoLayerOverlap`), drawn in list order. A layer's box is `placeClip(source, crop, transform, frame)`: the cropped picture, `coverFactor × scale` large, centred at `(0.5 + x, 0.5 + y)` of the frame. `Clip.mask` is `none | rounded | circle` — three fixed shapes (`rounded` = 0.12 × the box's shorter side); there is no stored radius. A layer has no background: what it does not cover shows what is beneath.
- **Picking.** `useClipMedia` (`addMedia`, `replaceMedia`, `addOverlay`) shares one lock and `pickMedia` (`expo-image-picker`, `selectionLimit: 20`). The Overlay tool refuses before importing, starts the layer at `newLayerStart` (the playhead, never closer than 2 s to the end) and selects it.
- **Loading.** `normaliseClip` spreads the stored clip (`{ ...c, … }`), so an unknown field survives a load; `migrateProject` refuses a file whose `schemaVersion` is above the app's.
- **Toolbar.** `contextFor` decides every bar. 49 tool ids; the main bar is `edit, audioMenu, textMenu, sticker, overlay, effect, filter, adjust, ratio, background, cover, templates`.

## 3. The decisions in one table

| Question | Decision | Why |
|---|---|---|
| How does Motion relate to the Combos? | A **separate stored field** `Clip.motion`, photos only. Motion and a Combo never sit on one photo: picking a Motion clears the Combo, picking a Combo clears the Motion (both in the ops). The Motion tool **shows** an old zoom / pan Combo as its twin tile (§5.4). The Combo tab hides the four zoom / pan Combos for photos unless the photo holds one. | The Combo code path is not touched, so "plays exactly as before" is true by construction; and Motion can keep In / Out animations, which a Combo cannot. |
| Does Swift change? | **No.** | Motion eases with `smooth` — the keyframe interpolation — so it *is* two pins, and the request builder sends it as two pins (§5.6). A collage only writes `transform`, `crop`, `mask`, `start`, `trimEnd`. |
| How is a collage stored? | As ordinary **layers**, each tagged `collage: { group, layout, cell, border, corner, aspect }` (§6.5). | The owner approved "each cell is still a normal layer". The tag lets Border / Corner find the cells again. |
| Corner | A **three-stop** slider: Square, Rounded, Round = the three masks that exist. | A continuous radius needs a new stored number *and* new Swift in the mask path of every export. |
| Does the schema bump? | **Yes, v17.** Two optional fields; absent = none; the migration adds nothing. | An older build would otherwise open a v17 project, show the photos still and export a different video without a word. |

## 4. Data model — schema v17

```ts
export const SCHEMA_VERSION = 17 as const;

export const PHOTO_MOTION_IDS = ["zoomIn", "zoomOut", "panLeft", "panRight", "panUp", "panDown", "zoomCorner"] as const;
export interface PhotoMotion { id: PhotoMotionId; strength: number }          // strength 0–1, 2 decimals
export const PHOTO_MOTION_LIMITS = { strength: [0, 1] as const, defaultStrength: 0.5 };

export const COLLAGE_LAYOUT_IDS = ["sideBySide", "stacked", "bigTwo", "row3", "grid4", "inset"] as const;
export const COLLAGE_CELLS = { sideBySide: 2, stacked: 2, bigTwo: 3, row3: 3, grid4: 4, inset: 2 };
export type CollageCorner = 0 | 1 | 2;                                         // Square, Rounded, Round
export const CORNER_MASK: readonly MaskId[] = ["none", "rounded", "circle"];
export const COLLAGE_LIMITS = { border: [0, 0.06] as const, borderStep: 0.005 };
export interface CollageCell { group: string; layout: CollageLayoutId; cell: number; border: number; corner: CollageCorner; aspect: number }

export interface Clip {
  /* …everything of v16, unchanged… */
  motion?: PhotoMotion;    // photos only; ABSENT = still
  collage?: CollageCell;   // layers only; ABSENT = not a collage cell
}
```

### 4.1 Rules

- Both fields are **optional and absent by default**. No factory (`newVideoClip`, `newPhotoClip`, `makeClip`, `newLayer`) writes them, so every existing clip object, fixture and saved file is the same shape as before.
- `motion` is read only through two functions in `types.ts`:
  - `activePhotoMotion(clip)` — what **plays**: the stored motion of a photo that has no Combo and no keyframes; else null.
  - `shownPhotoMotion(clip)` — what the Motion tool **rings**: the active motion, else the twin of an old zoom / pan Combo at the default strength (`COMBO_AS_MOTION = { zoomInSlow: "zoomIn", zoomOutSlow: "zoomOut", panLeft: "panLeft", panRight: "panRight" }`), else null.
- `collage.border` is a fraction of the frame's **shorter** side; `collage.aspect` is the frame's width / height the cell was last laid out for; `collage.cell` is the index in the layout.

### 4.2 The sanity pass (`normaliseClip`, every load)

- `motion`: kept when the clip is a photo, has no Combo and `clampPhotoMotion` accepts it (known id; strength clamped to 0–1, non-finite → 0.5). Otherwise the key is removed.
- `collage`: kept on a layer when `clampCollageCell` accepts it (non-empty group, known layout, `cell` an integer inside the layout, `aspect` finite and above 0; border clamped; unknown corner → 0). Otherwise the key is removed. A main clip never has one.

### 4.3 The migration, and its proof

v16 → v17 is the existing sanity pass and **adds nothing**: a v16 file has neither key, and neither is written. Proof test (in `migrate.test.ts`, never edited to pass): a v16 project with photos that hold every one of the six Combos, In / Out edges and keyframes, and layers with crops, masks and transforms migrates to **itself with only the number changed**; the stored object is not mutated; no clip has a `motion` or `collage` key; a second pass changes nothing.

## 5. Photo motion

### 5.1 Ids, labels, icons

| id | Tile label | Icon (Ionicons, verified in the glyph map) | What moves |
|---|---|---|---|
| — | None | `ban-outline` | nothing |
| `zoomIn` | Zoom in | `expand-outline` | grows from 1 |
| `zoomOut` | Zoom out | `contract-outline` | shrinks to 1 |
| `panLeft` | Pan left | `arrow-back-outline` | slightly enlarged, slides left |
| `panRight` | Pan right | `arrow-forward-outline` | slides right |
| `panUp` | Pan up | `arrow-up-outline` | slides up |
| `panDown` | Pan down | `arrow-down-outline` | slides down |
| `zoomCorner` | Corner zoom | `scan-outline` | grows towards the **top-left** corner |

The approved name "Zoom to corner" is 14 characters and would be cut off under a 72-pt tile at 11 pt; the tile says **Corner zoom**. The toolbar button is **Motion**, icon `move-outline`.

### 5.2 Maths — `motion.ts`, TypeScript only

`q` = linear progress through the photo (0 → 1), `e = smooth(q)`, `s` = strength (0–1).

```
PHOTO_MOTION = { zoom: 0.15, pan: 0.05, gentle: 0.4, strong: 1.6 }
k(s) = gentle + (strong − gentle)·clamp01(s)            k(0) = 0.4   k(0.5) = 1   k(1) = 1.6
Z = zoom·k    P = pan·k

zoomIn      scale = 1 + Z·e
zoomOut     scale = 1 + Z·(1 − e)
panLeft     scale = 1 + 2P     dx = P·(1 − 2e)
panRight    scale = 1 + 2P     dx = P·(2e − 1)
panUp       scale = 1 + 2P     dy = P·(1 − 2e)
panDown     scale = 1 + 2P     dy = P·(2e − 1)
zoomCorner  scale = 1 + Z·e    dx = dy = (scale − 1) / 2
```

`dx`, `dy` are fractions of the frame (x right, y down), added to the photo's own offset; `scale` multiplies its own scale — the rule of every other animation (`combine`). At strength 0.5 the amounts are the old Combos' (zoom 0.15; pan 0.05 at scale 1.1); only the easing differs (§5.3).

**No background shows.** For a photo at Fill (scale 1, centred) the enlarged box always covers the frame: a pan's box is `(1 + 2P)` wide and moves `±P`; a corner zoom shifts the box by half of what it grew.

Worked vectors (strength, q → delta; all checked with Node):

| Motion | s | q | scale | dx | dy |
|---|---|---|---|---|---|
| zoomIn | 0.5 | 0 / 0.25 / 0.5 / 1 | 1 / 1.0234375 / 1.075 / 1.15 | 0 | 0 |
| zoomIn | 0 / 1 | 1 | 1.06 / 1.24 | 0 | 0 |
| zoomOut | 0.5 | 0 / 0.25 / 1 | 1.15 / 1.1265625 / 1 | 0 | 0 |
| panLeft | 0.5 | 0 / 0.5 / 1 | 1.1 | 0.05 / 0 / −0.05 | 0 |
| panLeft | 1 | 0 | 1.16 | 0.08 | 0 |
| panRight | 0.5 | 0 / 0.25 / 1 | 1.1 | −0.05 / −0.034375 / 0.05 | 0 |
| panUp | 0.5 | 0 / 1 | 1.1 | 0 | 0.05 / −0.05 |
| panUp | 0 | 0 | 1.04 | 0 | 0.02 |
| panDown | 0.5 | 0 / 1 | 1.1 | 0 | −0.05 / 0.05 |
| zoomCorner | 0.5 | 0 / 0.5 / 1 | 1 / 1.075 / 1.15 | 0 / 0.0375 / 0.075 | = dx |
| zoomCorner | 1 | 1 | 1.24 | 0.12 | 0.12 |

(`smooth(0.25) = 0.15625`, `smooth(0.5) = 0.5`.)

### 5.3 Why it eases, and why that needs no Swift

Every formula above is **a straight line in `e`**. A value that runs `a + (b − a)·smooth(q)` between two times is exactly what a pair of keyframes gives — `sampleKeyframes` on both sides. So a Motion over a photo `L` seconds long equals two pins, at 0 and at `L`, holding the photo's own placement combined with the delta at `q = 0` and at `q = 1`. `photoMotionPins(clip, length)` builds them; `toExportClip` sends them in `keyframes` (§5.6). The cost: the movement starts and ends softly instead of running at constant speed (the old Combos are linear). A constant-speed Motion would need `Motion.swift` to learn it.

### 5.4 Motion, Combos and keyframes — never two at once

- **Motion ↔ Combo.** `setPhotoMotion(p, id, motion)` (non-null) writes `motion` and sets `animation.combo` to null. `setClipAnimation` / `setAnimationForAllClips` remove `motion` from a clip whose resulting animation has a Combo. A clip without `motion` — every clip that exists today — goes through exactly the code it always did.
- **An old zoom / pan Combo on a photo** keeps playing through `animComboDelta`, untouched. The Motion tool rings its twin tile and shows Strength 50 %. Tapping the ringed tile does nothing. Tapping **None** clears that Combo. Tapping another tile, or dragging Strength, writes a Motion (and clears the Combo) — the owner's action, and the only moment the easing changes.
- **The Combo tab for a photo** lists None, Sway, Pulse — and, only when the photo holds one, that zoom / pan Combo, so it stays visible and removable. Videos see all six, as today.
- **Motion ↔ keyframes.** A photo with keyframes has no Motion tool; a photo with a Motion has no Keyframe tool (`contextFor`). `setPhotoMotion` refuses a photo with keyframes. Should both ever be stored (a hand-edited file), the keyframes win in the preview and in the export alike (`activePhotoMotion`).
- **In / Out stay.** A photo may fade in and zoom: Motion is combined with the In / Out delta.
- **Collage cells** have no Motion tool: a zoom would grow the cell over its neighbours (§14.9).

### 5.5 The strip (`PhotoMotionSheet.tsx`, a `ToolStrip`)

Header: **Motion**, the action **Apply to all photos** (not for a layer), ✓. Row 1 (`STRIP.tiles`): None + seven tiles; opens with the ringed tile in view (`tilesStartXIn`, worked out once per opening). Row 2 (`STRIP.slider`): **Strength**, 0–100 % in steps of 5, a tick at 50; disabled while None.

- A tile tap is one undo step; picking a Motion keeps the strength shown.
- A Strength drag is one undo step (`beginTransaction` + `applyTransient`); the stored strength is rounded to 2 decimals.
- **Apply to all photos** gives every photo on the **main track** that has no keyframes the Motion shown (None included): one undo step. Layers are not touched (as "Apply to all clips").

### 5.6 Preview and export

- **Preview.** `resolveClipMotion` combines `photoMotionDelta` with the In / Out delta when `activePhotoMotion(clip)` is set; `hasClipMotion` is true for such a clip, so `clipFrameMotion` hands `ClipFrame` the transform. Nothing else changes: `PreviewPlayer.tsx`, `ClipFrame.tsx` and `LayerStack.tsx` are not edited. While playing, a photo updates 20 times a second (the existing photo tick) — the positions are exact, the playback is a little less fluid than the exported 30 / 60 fps.
- **Export.** `toExportClip`: `keyframes: photoMotionPins(c, length) ?? outputKeyframes(c, length)`. The two pins' times are 0 and the photo's length (a photo runs at speed 1 from 0, so output time is its own time — no speed arithmetic). Swift then does what it does for any keyframed clip. A test proves `sampleKeyframes(pins, t)` + the In / Out delta equals `resolveClipMotion(clip, t)` at a spread of times.
- A photo split in two (`splitClipAt`) carries the Motion on both halves, and each half plays the whole Motion — as a Combo does today.

## 6. Collages

### 6.1 Layouts

Cells as fractions of the frame `[x, y, w, h]`, top-left origin, before the border. `F` = `frameAspect(project)`.

| id | Label | Cells | Rectangles |
|---|---|---|---|
| `sideBySide` | Side by side | 2 | `[0,0,½,1]` `[½,0,½,1]` |
| `stacked` | Stacked | 2 | `[0,0,1,½]` `[0,½,1,½]` |
| `bigTwo` | Big and two | 3 | `F ≥ 1`: `[0,0,½,1]` `[½,0,½,½]` `[½,½,½,½]` (big on the left) · `F < 1`: `[0,0,1,½]` `[0,½,½,½]` `[½,½,½,½]` (big on top) |
| `row3` | Row of three | 3 | `[0,0,⅓,1]` `[⅓,0,⅓,1]` `[⅔,0,⅓,1]` |
| `grid4` | Grid of four | 4 | `[0,0,½,½]` `[½,0,½,½]` `[0,½,½,½]` `[½,½,½,½]` |
| `inset` | Inset | 2 | `[0,0,1,1]` and `[0.62,0.62,0.34,0.34]` (the small one bottom-right, on top) |

Cells are filled in the order the photos were picked; a later cell is drawn above an earlier one. The toolbar button is **Collage**, icon `grid-outline`.

### 6.2 Border

`b` = `collage.border`, 0 … 0.06 of the frame's shorter side, in steps of 0.005; default **0**. The gap is the same number of pixels in both directions and the same at the frame's edge as between cells:

```
gx = b·min(1, 1/F)      gy = b·min(F, 1)
x' = gx + x·(1 − gx)    w' = w·(1 − gx) − gx        (the same for y, h with gy)
```

Vectors: `sideBySide`, 9:16, b 0.04 → `[0.04, 0.0225, 0.44, 0.955]` `[0.52, 0.0225, 0.44, 0.955]` · `sideBySide`, 16:9, b 0.04 → `[0.0225, 0.04, 0.46625, 0.92]` `[0.51125, 0.04, 0.46625, 0.92]` · `grid4`, 1:1, b 0.02 → `[0.02,0.02,0.47,0.47]` `[0.51,0.02,0.47,0.47]` `[0.02,0.51,0.47,0.47]` `[0.51,0.51,0.47,0.47]` · `inset`, 9:16, b 0.06 → `[0.06, 0.03375, 0.88, 0.9325]` `[0.6428, 0.632825, 0.2596, 0.294775]` · `stacked`, 21:9, b 0.06 → `[0.025714…, 0.06, 0.948571…, 0.41]` `[0.025714…, 0.53, 0.948571…, 0.41]`.

**What shows in the gap is the main video underneath** — a layer has no background (§14.4).

### 6.3 "Each one fills its cell" — only stored fields are written

For a picture `W × H` and a cell `[x, y, w, h]` in a frame of aspect `F` (`collage.ts`, pure TypeScript):

```
target = (w·F) / h                       the cell's shape in pixels
S      = W / H
crop   = S > target ? { w: target/S, h: 1 } : { w: 1, h: S/target },  each side at least CROP_MIN (clampCrop),  then centred,  6 decimals
box    = the cropped picture;  k = min(w·F / box.width, h / box.height)          (frame units: F wide, 1 high)
scale  = k / coverFactor(picture, crop, 0, F, 1)                                  6 decimals
x, y   = (cell centre) − 0.5                                                      6 decimals
```

- The crop makes the picture's box the cell's shape; then `placeClip` — the one place a box is computed — puts it exactly on the cell. When the crop is exact, `scale = min(w, h)`.
- `coverFactor` comes from `clipLayout.ts`; nothing here computes cover or fit a second way.
- **Limit:** `clampCrop` keeps at least a tenth of a picture (`CROP_MIN`). A picture more than ten times wider (or taller) than its cell — a 16:9 video in a Row-of-three cell of a 9:16 frame with a border — cannot be cropped that far; it is then fitted *inside* the cell (never over a neighbour) and leaves a thin gap above and below.
- The smallest cell side at the largest border is 0.2533 (Row of three, 9:16), above the transform's minimum scale of 0.2.

Vectors (picture → `crop`, `scale`, `x`, `y`): portrait 1080×1920 in `sideBySide[0]`, 9:16, b 0 → `{0.25, 0, 0.5, 1}`, 0.5, −0.25, 0 · landscape 1920×1080 in `sideBySide[1]`, 9:16 → `{0.420898, 0, 0.158203, 1}`, 0.5, 0.25, 0 · landscape in `stacked[0]`, 9:16 → `{0.183594, 0, 0.632813, 1}`, 0.5, 0, −0.25 · portrait in `stacked[1]`, 9:16 → `{0, 0.25, 1, 0.5}`, 0.5, 0, 0.25 · 4032×3024 in `grid4[3]`, 1:1, b 0.02 → `{0.125, 0, 0.75, 1}`, 0.47, 0.245, 0.245 · square in `row3[1]`, 16:9 → `{0.203704, 0, 0.592593, 1}`, 0.333333, 0, 0 · portrait in `inset[1]`, 9:16 → full crop, 0.34, 0.29, 0.29 · landscape in `inset[1]`, 9:16, b 0.06 → `{0.360675, 0, 0.27865, 1}`, 0.2596, 0.2726, 0.280213 · portrait in `bigTwo[2]`, 9:16, b 0.04 → `{0.02815, 0, 0.9437, 1}`, 0.44, 0.24, 0.244375 · the limit: landscape in `row3[0]`, 9:16, b 0.06 → `{0.45, 0, 0.1, 1}`, 0.253333, −0.313333, 0 (box 274 × 1539 px in a 274 × 1790 cell at 1080 wide).

### 6.4 Making a collage (`useClipMedia.makeCollage`)

1. **Tap a layout** (n cells). Refused at once, with a toast, when fewer than n of the 8 layers are free.
2. The start is fixed now: `newLayerStart(project, playhead)` — the playhead, never closer than 2 s to the end (the Overlay tool's rule).
3. **The picker opens** for photos and videos, limited to n items, in the order tapped. Cancel = nothing happens.
4. **Refused before anything is copied**, with a toast: fewer than n picked; more than 2 videos; a video shorter than 0.3 s; a third video layer would be on screen with layers that already exist.
5. The files are imported. If any fails, nothing is added.
6. **One undo step** adds n layers, each: `start`; a common length (below); the cell's crop, scale and offset; rotation 0; mask none; the tag with border 0, corner 0 and the frame's aspect. The first cell is selected and the panel stays open on it.

**Length.** `natural` = the shortest picked video, or 3 s (`PHOTO.defaultSeconds`) with photos only. `room` = the project's end − start. Length = `clamp(min(natural, room), 0.5, 60)`, to the millisecond. Photos take it as their length; a video longer than it is trimmed to it at its tail (`sourceAfter`, so no speed arithmetic outside `timeline.ts`). All cells start and end together.

**The rest of the timeline** is not touched: the main track keeps playing underneath — hidden behind the cells at border 0 and square corners, visible in the gaps and round corners otherwise — and its sound keeps playing.

### 6.5 Afterwards: the panel edits the collage a cell belongs to

A layer with a tag shows **Collage** first on its bar; it opens the same panel on that collage (`collage.group`).

- **Layout tiles:** only the layouts with the same number of cells; the current one is ringed; tapping another re-lays the cells into it (Side by side ↔ Stacked ↔ Inset; Big and two ↔ Row of three). One undo step.
- **Border:** 0–6 %, one undo step per drag. **Corner:** Square / Rounded / Round, one undo step per drag; it writes the cells' `mask`.
- **Fit to frame** appears in the header only when the frame's shape is no longer the one the collage was laid out for (the owner changed Ratio): one tap re-lays the cells for the new shape. Dragging Border or Corner does the same.

**Only cells still in their place are re-laid** (`isCellInPlace`): a cell whose stored crop, scale and offset are still what the layout gave it (within 0.00001, judged against the tag's own `aspect`), with rotation 0 and no keyframes. A cell the owner moved, resized, re-cropped or turned by hand is left exactly as it is, by every slider, for good. Its mask is only written when Corner is dragged. Flips and filters do not count as moving.

- **Replace** on a cell that is in its place re-fits the new picture to the cell in the same undo step (`refitReplacedCell`); on a cell moved by hand it behaves as today.
- **Duplicate** on a cell copies the tag: the copy starts where the original ends, in the same cell — a second picture for that cell.
- **Delete / trim / move in time / filter / opacity / blend** behave as for any layer; the remaining cells keep their places.

### 6.6 The panel (`CollageSheet.tsx`, a compact `ToolPanel`, 240 pt, `scroll={false}`)

Header 44: **Collage**, (Fit to frame), ✓. Body, explicit heights: the tile row (`STRIP.tiles`, 72) with a small drawing of each layout, then two slider rows (`STRIP.slider`, 36 each). Before a collage exists (opened from the main bar) all six tiles show, none ringed, and both sliders are disabled at 0 % and Square. The panel takes the timeline's place like every tall panel; the preview stays.

## 7. Toolbar (`contextFor`)

- **Main bar:** `edit, audioMenu, textMenu, sticker, overlay, **collage**, effect, …` — after Overlay; needs a clip, like Overlay.
- **Clip bar and layer bar:** `…, animate, **motion**, filter, …` — only for a photo that has no keyframes and is not a collage cell.
- **Layer bar:** `**collage**, trim, …` — first, only for a layer with a tag.
- **Keyframe** is left out for a photo that has a stored Motion.
- 51 tool ids. `StripId` gains `photoMotion`, `PanelId` gains `collage`.

## 8. Edge cases

| Case | What happens |
|---|---|
| Motion tool on a video | Not on the bar. A photo replaced by a video keeps a stale `motion` until the next load; nothing reads it (`activePhotoMotion` is photos only). |
| A photo with keyframes | No Motion tool; Apply to all photos skips it. |
| A photo with Sway or Pulse | Motion shows None; picking a Motion replaces the Combo. |
| Fewer picked than cells | Toast "This layout needs 3 photos or videos — you picked 2." Nothing is copied or added. |
| More picked than cells | The picker's limit prevents it; if more arrive, the first n are used. |
| More than 2 videos picked | Toast "A collage can hold 2 videos at most. Pick photos for the other cells." Nothing is copied. |
| Layer limit partly used | Refused before the picker: "Not enough room: this layout adds 4 layers and there is room for 3." |
| Two video layers already on screen there | Toast "Only two video layers can play at the same time." |
| Near the end of the timeline | Starts at most 2 s before the end and is cut to the time that is left (at least 0.5 s). |
| An empty project | No Collage button (a layer needs a main clip). |
| Undo | One step per tap, per drag, per collage, per Replace. |
| The project is closed while picking | Nothing is added, no toast. |
| A partly failed import | "Couldn't add those items."; nothing added. Files already copied stay in the project folder unused (as after any failed add). |
| The ratio is changed | Cells keep what they store (the collage no longer tiles the new shape) until Fit to frame, Border or Corner. |
| A cell is deleted | The others stay; the hole shows the main video. |

## 9. Preview behaviour and cost

- Motion: one more multiplication per rendered frame of a photo; the render rate is the existing one (playhead ticks).
- Collage: up to four more `ClipFrame`s in `LayerStack`, each a photo `Image` or a `LayerVideo` (its own player — at most two, the existing rule) plus the main `VideoView`. No new view type, no animation, nothing on an ancestor of the preview or the timeline.
- Border / Corner drags replace the project on every slider step, as every other slider does.
- No "Preview" tag is added by either feature (`needsPreviewTag` is not edited). It still shows for its existing reasons — a filter on a cell, a blur background behind a masked main clip.

## 10. Export

- **No request field is added and no Swift file is edited.** `modules/clipy-video/index.ts` changes one expression (§5.6).
- A collage cell is a layer with a transform, a crop and a mask: `toExportLayer` sends it as it sends any layer today.

## 11. Testing

- **Model:** schema 17; the PROOF migration; the two clamps; the sanity pass keeps valid tags and removes invalid ones; `activePhotoMotion` / `shownPhotoMotion` truth tables.
- **Maths:** every Motion at the vectors of §5.2; non-finite input; the pins-equal-the-preview proof; `collageCells` and `cellPlacement` at the vectors of §6.2–§6.3; for every layout × nine ratios × three borders × four picture shapes the placed box equals the cell (except at the crop limit, where it is inside); results survive `clampCrop` / `clampTransform` unchanged.
- **Ops:** Motion ↔ Combo ↔ keyframes exclusivity; untouched clips keep their identity; `addCollage` and every refusal; `relayCollage` (border, corner, layout, new aspect, a hand-moved cell skipped, no-op returns the same project); `refitReplacedCell`.
- **Components (RNTL v14, async):** the Motion strip (tiles, ring, legacy twin, Strength, Apply to all, undo counts); the Combo tab for photos; the Collage panel in both modes; `makeCollage` with the picker and the import mocked (every refusal, the order of checks, one undo step, selection, the panel re-keyed).
- **Toolbar:** `contextFor` lists, the icon and label tables, 51 ids, the bar rendering both tools.
- **Guards stay as they are:** `noHexLiterals`, `spacingScale` (no new allow-table line), `kitSlider`, `outlineIcons`, `looks.frozen`. `motion.parity.test.ts` is not edited: `MOTION` and `Motion.swift` do not change.

## 12. Unverified without a native build

1. Photos with pins in the export — the existing keyframe path, which has never run on a device. Motion adds nothing to it.
2. Layers with a crop and a mask at scales down to 0.25, four at once, in the export (existing layer path).
3. Whether the iOS picker honours `selectionLimit` and `orderedSelection` as documented (Expo Go can show this).
4. How smooth four layers plus the main video are in Expo Go on the owner's phone, and how a Motion reads at 20 updates a second.
5. Tile labels and the strip header ("Motion · Apply to all photos · ✓") fitting a 375-pt screen.

## 13. Risks

- **Motion eases; the old Combos do not.** A photo converted from an old Combo by dragging Strength moves slightly differently afterwards.
- **A collage shows the main video in its gaps** and lets its sound through. The checklist says so in plain words.
- **Corner has three stops**, not a smooth range; Round on a tall cell is a pill.
- **Rounded** is 12 % of each cell's shorter side, so a big cell is rounder in pixels than a small one.
- **A project saved by this version cannot be opened by an older build** (schema 17) — the point of the bump.
- **The "in its place" rule is invisible:** a cell nudged by a hair no longer follows Border. The checklist names it.

## 14. Decisions made while writing (the owner did not approve these explicitly)

1. **Motion is a separate field, exclusive with Combos and with keyframes** (§5.4).
2. **Motion eases in and out** so the export needs no new native code (§5.3).
3. **"Zoom to corner" is labelled "Corner zoom" and goes to the top-left corner** — one fixed corner.
4. **A collage sits over the main video**; gaps and round corners show it, and its sound plays (§6.4). A coloured border is not possible without new native code.
5. **Border is also the margin at the frame's edge**, not only the gap between cells; its default is 0.
6. **Corner is three stops** (§3).
7. **Fewer photos than cells is refused** rather than leaving cells empty or switching layout.
8. **A collage lasts as long as its shortest video (else 3 s), cut to the time left; longer videos are trimmed to it.**
9. **No Motion tool on a collage cell.**
10. **Border / Corner leave a hand-moved cell alone**, and **changing Ratio never re-lays a collage by itself** (Fit to frame does).
11. **Layout tiles on an existing collage switch between layouts with the same number of cells** — a small addition.
12. **Big and two** puts the big cell on the left in a wide frame and on top in a tall one.
13. **Apply to all photos** covers the main track only, and skips photos with keyframes.
14. **Verified, and where:** the fifteen icon names in `@expo/vector-icons`' Ionicons glyph map; `selectionLimit` / `orderedSelection` in `node_modules/expo-image-picker/build/ImagePicker.types.d.ts`; `ExportSession.motionKeyframes` / `Motion.resolveClip` (pins first, then Combo or In / Out); every vector of §5.2, §6.2 and §6.3 with a throw-away Node script (not committed).

## 15. Device checklist (owner, Expo Go)

The full step-by-step list (28 steps) is at the end of the plan. In short, on the iPhone, with a project made before this update that has a photo in it:

1. **Nothing changed.** Open the old project and play it: every photo and clip looks exactly as before.
2. **Motion.** Tap a photo: there is a **Motion** button after Animate (a video has none). Tap each tile and play — the photo slowly zooms or slides, starting and ending softly, with no black edge. Drag **Strength**. **Apply to all photos** gives every photo the same motion; one **Undo** takes it back.
3. **One at a time.** With a Motion on a photo its **Keyframe** button is gone; in **Animate → Combo** a photo now offers only Sway and Pulse. An old "Slow zoom" or "Pan" on a photo is shown as its Motion tile and plays as before.
4. **Collage.** With nothing selected tap **Collage** (after Overlay), tap a layout, pick that many photos or videos: they fill the cells. Drag **Border** — the gap shows your main video, not a colour — and **Corner** (Square / Rounded / Round). The other layouts with the same number of pictures re-arrange them.
5. **Still layers.** Each cell is a bar on the layers row: trim it, replace it (the new picture fills the same cell), delete it. A cell you move with your finger is then left alone by Border and Corner.
6. **Limits.** Three videos, or too few pictures, give a message and add nothing. The main video's sound keeps playing under a collage.
7. **Ratio.** Changing the ratio does not move a collage; **Fit to frame** in the Collage panel does.
8. **Say what you would change:** a smooth Corner slider, a coloured border, or Motion at an even speed each need the real (native) build.
