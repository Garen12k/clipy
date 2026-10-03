# CapCut Group A — Clip Basics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add transform-by-gesture, rotate / flip, crop, clip background, photos as clips, adding media to an open project, replace, reverse and freeze frame to the Clipy editor, in the preview and in the export request, with the Swift export extended to match.

**Architecture:** Each clip gains `kind`, `transform`, `crop`, `background`, `reversed` (schema v5). One pure geometry module, `src/editor/model/clipLayout.ts`, mirrored by `ClipLayout.swift`, decides where a clip's picture sits in the frame; the preview (`ClipFrame`), the gestures, Fit / Fill and the export all call it. The preview renders video through the existing single `expo-video` player and photos through `Image`; a photo under the playhead is driven by a timer instead of the player. The Swift export adds a pre-pass (photo → short video, reversed clip → reversed copy) and places every frame in the compositor.

**Tech Stack:** Expo SDK 57, TypeScript strict, Zustand, react-native-gesture-handler 2.32, react-native-reanimated 4.5, expo-video, expo-image-picker, expo-video-thumbnails, Jest (jest-expo) + RNTL v14; Swift / AVFoundation / Core Image (uncompiled here).

**Spec:** `docs/superpowers/specs/2026-10-03-capcut-a-clip-basics-design.md` (binding).

## Global Constraints

- **Existing projects look the same:** `transform.scale = 1` means the cropped picture covers the frame (today's behaviour); defaults are scale 1, offsets 0, rotation 0, no flips, full crop, black background, not reversed, `kind: "video"`.
- **One geometry module.** Only `clipLayout.ts` (and its Swift mirror) computes clip placement. No component or op re-derives cover / fit maths.
- Speed arithmetic stays in `timeline.ts` only. Photos: `speed 1`, `muted true`, `reversed false`, `trimStart 0`, `sourceDuration = PHOTO.maxSeconds`.
- Preview exactness: transform, crop, flips, photos, colour background are exact; blur background and Reverse show the existing "Preview" tag.
- Clip gestures never take a touch that lands on a text / sticker overlay; overlays render above the clip.
- One undo step per gesture or button (`beginTransaction` + `applyTransient`, or one `apply`).
- A device-only lesson from this repo: **never call `scrollTo` (or any state-setting that re-triggers itself) from a scroll-end handler** — see `src/editor/timelineScroll.ts`. Do not change that module's behaviour.
- Expo Go safe: no new runtime dependencies unless a task says so; nothing new may require native code in the preview path. Before using any Expo / Reanimated / gesture-handler API, check the versioned docs or installed typings (`AGENTS.md`).
- UI from `src/ui/` and `src/theme/theme.ts` only; `src/__tests__/noHexLiterals.test.ts` stays green (user-content colours live in the files already on its allowlist).
- Keep `src/editor/effects.ts` ↔ `Effects.swift` and `overlayLayout.ts` ↔ `OverlayLayout.swift` untouched and identical.
- Windows: PowerShell tool, no `&&` (use `;`), `npx.cmd`. Checks before each commit: `npm run typecheck` and the task's tests; before finishing a task: `npm test`.
- `git add` explicit paths only. Every commit message ends with exactly `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- RNTL v14: `render` / `fireEvent` are async — always `await`.

## File Map

| File | Responsibility |
|---|---|
| `src/editor/model/types.ts`, `migrate.ts` | schema v5 fields, limits, defaults, migration + sanity pass |
| `src/editor/model/clipLayout.ts` | placement, fit, coverage, snapping |
| `src/editor/model/cropBox.ts` | crop-box drag / preset maths (pure) |
| `src/editor/model/ops.ts` | new clip ops, photo rules |
| `src/projects/pickMedia.ts`, `storage.ts` | pick videos + photos, import into a project, save stills |
| `src/editor/components/ClipFrame.tsx` | background + placed, cropped picture (video or photo) |
| `src/editor/components/ClipGestures.tsx` | pinch / drag / rotate on the selected clip |
| `src/editor/components/{TransformSheet,BackgroundSheet,CropScreen,AddClipTile}.tsx` | new UI |
| `src/editor/usePhotoPlayback.ts`, `useFreezeFrame.ts`, `useClipMedia.ts` | photo timing, still capture, add / replace flows |
| `src/editor/toolGroups.ts`, `components/EditorToolbar.tsx`, `ClipThumbStrip.tsx`, `TrimHandles.tsx`, `Timeline.tsx`, `PreviewPlayer.tsx` | wiring |
| `modules/clipy-video/index.ts`, `src/export/{useExport,estimate}.ts` | export request |
| `modules/clipy-video/ios/{ClipLayout,MediaPrePass}.swift`, `ExportSession.swift`, `ClipyCompositor.swift`, `Tests/` | Swift export |

---

### Task 1: Schema v5 — clip fields, limits, migration

**Files:** Modify `src/editor/model/types.ts`, `migrate.ts`, `src/projects/storage.ts` (clip literals), every test helper that builds a `Clip`. Tests: `src/editor/model/__tests__/migrate.test.ts` (extend), `src/editor/model/__tests__/types.clip.test.ts` (new).

**Interfaces (produced):**
```ts
export const SCHEMA_VERSION = 5 as const;
export const CLIP_KINDS = ["video", "photo"] as const;
export type ClipKind = (typeof CLIP_KINDS)[number];
export interface ClipTransform { scale: number; x: number; y: number; rotation: number; flipH: boolean; flipV: boolean }
export interface CropRect { x: number; y: number; w: number; h: number }
export type ClipBackground = { type: "black" } | { type: "color"; color: string } | { type: "blur" };
export const DEFAULT_TRANSFORM: ClipTransform;   // { scale: 1, x: 0, y: 0, rotation: 0, flipH: false, flipV: false }
export const FULL_CROP: CropRect;                // { x: 0, y: 0, w: 1, h: 1 }
export const BLACK_BACKGROUND: ClipBackground;   // { type: "black" }
export const TRANSFORM_LIMITS = { scale: [0.2, 5] as const, offset: [-1, 1] as const };
export const CROP_MIN = 0.1;
export const PHOTO = { defaultSeconds: 3, minSeconds: 0.5, maxSeconds: 60, freezeSeconds: 2 };
export interface Clip { /* existing */ kind: ClipKind; transform: ClipTransform; crop: CropRect; background: ClipBackground; reversed: boolean }
export const isPhoto = (c: Clip) => c.kind === "photo";
export function normaliseRotation(deg: number): number          // into (−180, 180]
export function clampTransform(t: ClipTransform): ClipTransform // limits + normalised rotation; non-finite → default value
export function clampCrop(c: CropRect): CropRect                // inside 0–1, sides ≥ CROP_MIN; invalid → FULL_CROP
// makeClip(...) gains the defaults; a helper makePhotoClip({ id, seconds? }) builds a valid photo clip for tests.
```

**Behaviour**
- Migration v4 → v5 adds the defaults; the sanity pass (renamed/extended `normaliseCurrent`) runs on every load: unknown `kind` → `"video"`; `clampTransform`; `clampCrop`; background — `color` must be a `#RRGGBB` string else black, unknown type → black; `reversed` boolean else false; photos forced to `speed 1`, `muted true`, `reversed false`, `trimStart 0`, `sourceDuration PHOTO.maxSeconds`, `trimEnd` clamped to `[PHOTO.minSeconds, PHOTO.maxSeconds]`. v1–v4 files still load; a newer schema is rejected with the existing message; the pass is idempotent.

- [ ] **Step 1: Failing tests** — `types.clip.test.ts`: `normaliseRotation` (0, 180 → 180, −180 → 180, 270 → −90, 720 → 0, 450 → 90); `clampTransform` (scale 0 → 0.2, 99 → 5, offsets ±3 → ±1, NaN fields → defaults, rotation normalised); `clampCrop` (negative / >1 / too small / NaN → repaired or `FULL_CROP`; a crop touching the right edge stays inside); `makeClip` defaults; `makePhotoClip` satisfies the photo rules. `migrate.test.ts`: a v4 project gains the defaults and `schemaVersion 5`; a v5 file with `kind: "gif"`, scale 99, crop `{x:0.9,y:0,w:0.5,h:1}`, background `{type:"color",color:"red"}`, a photo with `speed 2` / `trimEnd 500` is repaired exactly as listed; running the migration twice gives an equal result; v1 → v5 chain still works.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** Fix every `Clip` literal the compiler flags (`storage.ts` `createProject` and others) by building clips through one shared default (`makeClip`-like factory for real code: `newVideoClip({...})` in `types.ts`).
- [ ] **Step 4: Verify** — `npm run typecheck`; `npm test`. **Step 5: Commit**

```powershell
git add src/editor/model src/projects src/editor/__tests__ src/export
git commit -m "feat(model): schema v5 — clip kind, transform, crop, background, reversed"
```
(Stage only the files you changed; list them explicitly.)

---

### Task 2: Geometry — `clipLayout.ts`

**Files:** Create `src/editor/model/clipLayout.ts`, `src/editor/model/__tests__/clipLayout.test.ts`, `src/editor/model/__tests__/clipLayout.vectors.ts` (shared vectors, also copied into the Swift mirror in Task 12).

**Implement exactly:**
```ts
import type { ClipTransform, CropRect } from "./types";

export interface Size { width: number; height: number }
export interface PlacedClip { width: number; height: number; centerX: number; centerY: number; rotation: number; flipH: boolean; flipV: boolean }
export const SNAP = { offset: 0.02, rotationDeg: 3, scale: 0.03 };

/** True when the picture is turned on its side (within 1° of ±90°), so its width and height swap for cover / fit. */
export const isQuarterTurn = (rotation: number) => Math.abs((((rotation % 180) + 180) % 180) - 90) < 1;

/** Pixel size of the cropped picture before any scaling. */
export const croppedSize = (source: Size, crop: CropRect): Size => ({ width: source.width * crop.w, height: source.height * crop.h });

/** The cropped picture's bounding box as it sits in the frame (sides swapped on a quarter turn). */
function turned(source: Size, crop: CropRect, rotation: number): Size {
  const c = croppedSize(source, crop);
  return isQuarterTurn(rotation) ? { width: c.height, height: c.width } : c;
}
/** Pixels of frame per pixel of picture at scale 1 (the picture just covers the frame). */
export function coverFactor(source: Size, crop: CropRect, rotation: number, frameW: number, frameH: number): number {
  const b = turned(source, crop, rotation);
  return Math.max(frameW / b.width, frameH / b.height);
}
/** The transform scale at which the whole picture is visible (≤ 1). */
export function fitScale(source: Size, crop: CropRect, rotation: number, frameW: number, frameH: number): number {
  const b = turned(source, crop, rotation);
  return Math.min(frameW / b.width, frameH / b.height) / coverFactor(source, crop, rotation, frameW, frameH);
}
export function placeClip(source: Size, crop: CropRect, t: ClipTransform, frameW: number, frameH: number): PlacedClip {
  const c = croppedSize(source, crop), k = coverFactor(source, crop, t.rotation, frameW, frameH) * t.scale;
  return { width: c.width * k, height: c.height * k, centerX: frameW / 2 + t.x * frameW, centerY: frameH / 2 + t.y * frameH, rotation: t.rotation, flipH: t.flipH, flipV: t.flipV };
}
/** Whether the picture hides the whole frame (only decidable cheaply for upright / quarter-turned pictures; anything else shows background). */
export function coversFrame(p: PlacedClip, frameW: number, frameH: number): boolean {
  const r = (((p.rotation % 90) + 90) % 90);
  if (Math.min(r, 90 - r) > 0.5) return false;
  const q = isQuarterTurn(p.rotation), w = q ? p.height : p.width, h = q ? p.width : p.height, e = 0.5;
  return p.centerX - w / 2 <= e && p.centerX + w / 2 >= frameW - e && p.centerY - h / 2 <= e && p.centerY + h / 2 >= frameH - e;
}
/** Gentle magnets while dragging: centre, straight angles, Fill (1) and Fit. `snapped` lists what engaged (for one haptic). */
export function snapTransform(t: ClipTransform, fit: number): { transform: ClipTransform; snapped: Array<"x" | "y" | "rotation" | "scale"> } {
  const snapped: Array<"x" | "y" | "rotation" | "scale"> = [];
  let { x, y, rotation, scale } = t;
  if (x !== 0 && Math.abs(x) <= SNAP.offset) { x = 0; snapped.push("x"); }
  if (y !== 0 && Math.abs(y) <= SNAP.offset) { y = 0; snapped.push("y"); }
  const nearest = Math.round(rotation / 90) * 90;
  if (rotation !== nearest && Math.abs(rotation - nearest) <= SNAP.rotationDeg) { rotation = nearest; snapped.push("rotation"); }
  for (const target of [1, fit]) if (scale !== target && Math.abs(scale - target) <= SNAP.scale * target) { scale = target; snapped.push("scale"); break; }
  return { transform: { ...t, x, y, rotation, scale }, snapped };
}
```

- [ ] **Step 1: Shared vectors** — `clipLayout.vectors.ts` exports `PLACE_VECTORS: Array<{ name; source; crop; transform; frame: [w, h]; expect: PlacedClip }>` with at least: 1080×1920 source in a 1080×1920 frame (identity); 1920×1080 source in 1080×1920 (cover → width 3413.33…, height 1920); the same at `scale = fitScale` (width 1080, height 607.5); a 90° turn of the landscape source (covers exactly); crop `{x:0.25,y:0,w:0.5,h:1}` of a landscape source; offsets `x 0.1, y −0.2`; flips carried through; a 1:1 frame. Compute each expected value by hand in comments.
- [ ] **Step 2: Failing tests** — every vector with `toBeCloseTo(…, 3)`; `fitScale` for portrait-in-portrait (1), landscape-in-portrait (0.31640625), quarter-turned landscape (1); `coversFrame` true for defaults, false at fit scale, false for any offset at scale 1, true at scale 2 with a small offset, false at 45°; `snapTransform` for each magnet, nothing engaged when already exact, both scale targets, and no snap outside the thresholds; `isQuarterTurn` for 90, −90, 270, 89.5, 45, 0, 180.
- [ ] **Step 3: Run** → FAIL. **Step 4: Implement** the code above verbatim. **Step 5: Verify + commit**

```powershell
git add src/editor/model/clipLayout.ts src/editor/model/__tests__/clipLayout.test.ts src/editor/model/__tests__/clipLayout.vectors.ts
git commit -m "feat(model): clip placement geometry — cover, fit, coverage, snapping"
```

---

### Task 3: Ops — transform, crop, background, reverse, photo rules

**Files:** Modify `src/editor/model/ops.ts`; create `src/editor/model/__tests__/ops.clipBasics.test.ts`.

**Interfaces (produced):**
```ts
export function setClipTransform(p: Project, clipId: string, patch: Partial<ClipTransform>): Project      // clamped
export function resetClipTransform(p: Project, clipId: string): Project
export function rotateClip90(p: Project, clipId: string): Project                                         // +90°, normalised; offsets kept
export function flipClip(p: Project, clipId: string, axis: "h" | "v"): Project
export function fitClip(p: Project, clipId: string): Project      // scale = fitScale for the project's frame, offsets 0
export function fillClip(p: Project, clipId: string): Project     // scale 1, offsets 0
export function setClipCrop(p: Project, clipId: string, crop: CropRect): Project                          // clamped
export function setClipBackground(p: Project, clipId: string, bg: ClipBackground): Project
export function setBackgroundForAllClips(p: Project, bg: ClipBackground): Project
export function setClipReversed(p: Project, clipId: string, reversed: boolean): Project                   // no-op for photos
export function frameSize(p: Project): { width: number; height: number }                                  // 1080-wide reference frame for the project's aspect ratio
```
- Photo rules in existing ops: `trimClip` on a photo keeps `trimStart 0` and clamps `trimEnd` to `[PHOTO.minSeconds, PHOTO.maxSeconds]`; `setClipSpeed`, `setClipVolume`, `setClipMuted` are no-ops for photos; `splitClipAt` on a photo yields two photos whose lengths sum to the original (both `trimStart 0`); `duplicateClip` copies every new field. Every op returns the same project object when nothing changes.

- [ ] **Step 1: Failing tests** — one test per op and rule above, plus: unknown clip id → unchanged; `fitClip` on a landscape clip in 9:16 gives scale 0.31640625 and after `rotateClip90` + `fitClip` gives 1; `setBackgroundForAllClips` changes every clip and is one object change; store-level test that one gesture (`beginTransaction` + several `applyTransient(setClipTransform)`) is one undo step.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** (use `clipLayout.fitScale`; follow the file's `touch` pattern). **Step 4: Verify + commit**

```powershell
git add src/editor/model/ops.ts src/editor/model/__tests__/ops.clipBasics.test.ts
git commit -m "feat(model): clip transform, crop, background and reverse ops; photo rules"
```

---

### Task 4: Media — pick photos and videos, import into a project, stills

**Files:** Create `src/projects/pickMedia.ts` (replacing `pickVideos.ts`; update importers), tests `src/projects/__tests__/pickMedia.test.ts`; modify `src/projects/storage.ts` (+ tests), `src/projects/useProjects.ts`.

**Interfaces (produced):**
```ts
export interface PickedAsset { uri: string; kind: "video" | "photo"; durationSec: number; width: number; height: number; fileName?: string }
export function pickMedia(opts?: { multiple?: boolean }): Promise<PickedAsset[] | null>      // videos + images; null when cancelled / denied
// storage
importMedia(projectId: string, assets: PickedAsset[]): Promise<{ clips: Clip[]; failed: number }>   // copies files into the project's media folder, returns ready clips (photos per the photo rules, default length PHOTO.defaultSeconds)
saveStill(projectId: string, tempUri: string): Promise<{ uri: string }>                              // copies a captured frame into media/ as <id>.jpg
```
- `createProject` uses `importMedia` internally (photos allowed in a new project; the thumbnail of a photo-first project is the photo itself).
- Picker options: `mediaTypes: ["images", "videos"]`, multi-select up to 20 (or single for Replace), `quality: 1`; confirm names in the v57 expo-image-picker docs / typings; `duration` is milliseconds; an image has no duration.
- Width / height of a photo come from the asset; if either is missing or 0 the item counts as failed.

- [ ] **Step 1: Failing tests** — `pickMedia`: permission denied → null + toast; cancelled → null; a video + a photo map to the right `kind`, seconds and sizes; `multiple: false` asks for one item. `storage`: `importMedia` copies each file under `projects/<id>/media/` with its extension, builds a video clip (full trim) and a photo clip (`trimEnd 3`, `sourceDuration 60`, muted, speed 1), counts an unreadable item as failed; `saveStill` returns a `.jpg` path inside the project; `createProject` with a photo first writes a thumbnail without calling the video thumbnailer.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Verify + commit**

```powershell
git add src/projects
git commit -m "feat(projects): pick photos and videos; import media and stills into a project"
```

---

### Task 5: Preview — `ClipFrame`, photo clips, photo playback

**Files:** Create `src/editor/components/ClipFrame.tsx`, `src/editor/usePhotoPlayback.ts`, tests `src/editor/__tests__/{ClipFrame.test.tsx,usePhotoPlayback.test.ts}`; modify `src/editor/components/PreviewPlayer.tsx` (+ its test), `PreviewTag` conditions.

**Behaviour**
- `ClipFrame({ clip, frameW, frameH, children })` renders, clipped to the frame: the background (black `View`; colour `View`; blur = an `Image` of the clip's still — the photo itself, or `getThumb(clip.sourceUri, clip.trimStart)` — stretched to cover, `blurRadius` 24, only when `!coversFrame(...)`); then the picture box positioned from `placeClip(...)` (absolute, `width`/`height`, centred at `centerX`/`centerY`, `transform: [{ rotate }, { scaleX: flipH ? -1 : 1 }, { scaleY: flipV ? -1 : 1 }]`), with `overflow: "hidden"`; inside it the content sized and offset so that only the crop rectangle shows (content width = box width / crop.w, left = −crop.x × that; same vertically). For a video the content is `children` (the single `VideoView`, `contentFit="fill"`); for a photo it is an `Image`.
- `PreviewPlayer`: the clip under the playhead decides what is shown. For a photo: pause the video player, render `ClipFrame` with the photo, and while `isPlaying` advance the playhead with `usePhotoPlayback` (a timer that seeks `playhead + elapsed` every 50 ms until the photo's end, then continues into the next clip or stops at the end of the project). For a video: as today, the `VideoView` inside `ClipFrame`. The player must never be left playing under a photo.
- `usePhotoPlayback(active: boolean)`: pure timing in a hook; uses `Date.now()` deltas (not tick counts) so a slow JS thread does not slow the photo; cleans its timer on unmount / when inactive.
- The "Preview" tag shows when: the clip has a filter (existing), the playhead is in a transition window (existing), the clip's background is blur and visible, or the clip is reversed.

- [ ] **Step 1: Failing tests** — `ClipFrame`: default clip → picture box equals the frame; a landscape clip at fit scale → box 1080×607.5-proportional and a background view present; colour background uses the clip's colour; blur shows an `Image` with `blurRadius`; crop offsets the inner content by the expected fractions; flips map to negative scales; rotation style present. `usePhotoPlayback` with fake timers: advances the playhead by real elapsed time; stops at the photo's end and moves to the next clip; stops playing at the project's end; inactive → no timer (`jest.getTimerCount() === 0`). `PreviewPlayer`: a photo under the playhead renders an `Image` and pauses the player; play on a photo advances the playhead without calling `player.play`; the tag appears for a reversed clip and for a visible blur background.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Verify + commit**

```powershell
git add src/editor/components/ClipFrame.tsx src/editor/usePhotoPlayback.ts src/editor/components/PreviewPlayer.tsx src/editor/components/PreviewTag.tsx src/editor/__tests__
git commit -m "feat(preview): place clips with transform, crop and background; photo clips and photo playback"
```

---

### Task 6: Gestures on the preview

**Files:** Create `src/editor/components/ClipGestures.tsx`, `src/editor/model/clipGesture.ts` (pure maths), tests `src/editor/model/__tests__/clipGesture.test.ts`, `src/editor/__tests__/ClipGestures.test.tsx`; modify `PreviewPlayer.tsx`.

**Interfaces (produced):**
```ts
// clipGesture.ts — pure
export function applyDrag(start: ClipTransform, dxPx: number, dyPx: number, frameW: number, frameH: number): ClipTransform
export function applyPinch(start: ClipTransform, scaleFactor: number): ClipTransform
export function applyTwist(start: ClipTransform, radians: number): ClipTransform
```
**Behaviour**
- Active only when a clip is selected, no overlay is selected and the clip under the playhead is the selected clip. Pan (1 finger), Pinch and Rotation gestures run simultaneously (`Gesture.Simultaneous`), each with `.runOnJS(true)`; on start: snapshot the clip's transform and `beginTransaction()`; on update: compose from the snapshot (drag + pinch + twist), `clampTransform`, `snapTransform(…, fit)`, `applyTransient(setClipTransform(...))`; a light `haptic` once each time a new magnet engages. A tap (no movement) still toggles play / deselects an overlay as today.
- The overlay layer stays above and keeps its own gestures; a touch on an overlay must not move the clip (verify the gesture ordering in the gesture-handler docs: the overlay detectors are children rendered on top; if needed use `requireExternalGestureToFail` / `blocksExternalGesture` per the docs).
- A hairline `theme.colors.accent` frame is drawn around the placed picture while it is selected.

- [ ] **Step 1: Failing tests** — `clipGesture`: drag of half the frame width → `x + 0.5`; pinch ×2 → scale ×2 (clamped at 5); twist of π/2 → +90° normalised; composition order does not depend on which gesture updates first. Component: selecting a clip shows the frame; no frame when an overlay is selected or the selected clip is not under the playhead.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Verify + commit**

```powershell
git add src/editor/components/ClipGestures.tsx src/editor/model/clipGesture.ts src/editor/components/PreviewPlayer.tsx src/editor/model/__tests__/clipGesture.test.ts src/editor/__tests__/ClipGestures.test.tsx
git commit -m "feat(preview): pinch, drag and twist the selected clip with snapping"
```

---

### Task 7: Toolbar, Transform sheet, Background sheet, Reverse

**Files:** Modify `src/editor/toolGroups.ts`, `src/editor/components/EditorToolbar.tsx`, `ClipThumbStrip.tsx`; create `src/editor/components/{TransformSheet,BackgroundSheet}.tsx`; tests `src/editor/__tests__/{toolGroups.test.ts,EditorToolbar.test.tsx,TransformSheet.test.tsx,BackgroundSheet.test.tsx,ClipThumbStrip.badges.test.tsx}`.

**Behaviour**
- `TOOL_GROUPS`: Edit = `split, trim, transform, crop, replace, reverse, freeze, duplicate, delete, ratio`; Effects = `filter, speed, transition, templates, background`; others unchanged. `ToolId` gains `transform | crop | replace | reverse | freeze | background`. The sub-row becomes a horizontal `ScrollView` (no scroll-end handlers) so ten tools fit.
- Enable rules: all new tools need a selected clip; `reverse`, `freeze`, `speed`, `volume` are disabled when the selected clip is a photo; `crop`, `replace`, `freeze` are wired in Tasks 8–10 — in this task they exist, disabled with `accessibilityState.disabled`, until their task wires them (keep the labels `Crop`, `Replace`, `Freeze`).
- `TransformSheet` (kit `Sheet`, title "Transform"): six `ToolButton`s — `Rotate 90°`, `Flip horizontal`, `Flip vertical`, `Fit`, `Fill`, `Reset` — each one `apply` with a light haptic.
- `BackgroundSheet` (title "Background", action "Apply to all"): `Black`, the `ColorRow` palette, `Blur`; the selected option carries `theme.ring`; "Apply to all" calls `setBackgroundForAllClips` with the current clip's choice.
- `Reverse` toggles `setClipReversed`; the tool shows `active` when the clip is reversed; the strip shows a "◀" badge next to the speed / filter badges; photos show a small photo icon badge.

- [ ] **Step 1: Failing tests** — groups list; every new tool's enable / disable rule incl. the photo cases; Transform buttons call the right op (assert resulting transform) and are one undo step each; Background selection, ring, Apply to all; Reverse toggles and the badge renders; existing toolbar tests updated only where the group contents changed.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Verify + commit**

```powershell
git add src/editor/toolGroups.ts src/editor/components src/editor/__tests__
git commit -m "feat(editor): Transform and Background sheets, Reverse, new Edit tools"
```

---

### Task 8: Crop screen

**Files:** Create `src/editor/model/cropBox.ts` (+ `__tests__/cropBox.test.ts`), `src/editor/components/CropScreen.tsx` (+ `src/editor/__tests__/CropScreen.test.tsx`); modify `EditorToolbar.tsx`.

**Interfaces (produced):**
```ts
export const CROP_PRESETS = [{ id: "free", label: "Free", ratio: null }, { id: "9:16", label: "9:16", ratio: 9 / 16 }, { id: "1:1", label: "1:1", ratio: 1 }, { id: "4:5", label: "4:5", ratio: 4 / 5 }, { id: "16:9", label: "16:9", ratio: 16 / 9 }] as const;
export function moveBox(crop: CropRect, dx: number, dy: number): CropRect                                   // fractions; stays inside 0–1
export function dragCorner(crop: CropRect, corner: "tl" | "tr" | "bl" | "br", dx: number, dy: number, ratio: number | null, sourceAspect: number): CropRect
export function applyPreset(crop: CropRect, ratio: number | null, sourceAspect: number): CropRect           // largest box of that shape centred on the current box, inside the picture
```
(`ratio` is width / height of the cropped picture in pixels; `sourceAspect` = source width / height. Sides never go below `CROP_MIN`; a locked ratio is preserved when a corner hits an edge.)

**Behaviour** — a `Modal` (full screen, `Screen` background): a still of the clip (photo, or `getThumb(uri, source time at the playhead)`) drawn `contain`, unrotated and unflipped; over it the crop box with four corner handles (44 pt hit targets), a rule-of-thirds grid and a dim outside; pan inside the box moves it, pan on a corner resizes it (`.runOnJS(true)`, working state local to the screen); preset `Chip`s; `Reset` (full picture), `Cancel`, `Done` → one `apply(setClipCrop)`. Opening always starts from the clip's current crop.

- [ ] **Step 1: Failing tests** — `cropBox`: move clamps at each edge; each corner resizes the right sides; minimum size; ratio lock for 1:1 on a 16:9 source (w × sourceAspect / h = 1); a corner pushed past an edge keeps the ratio; `applyPreset` gives the largest centred box for each preset on portrait and landscape sources; `null` leaves the box. Screen: shows presets and buttons; Done applies the working crop as one undo step; Cancel changes nothing; Reset → `FULL_CROP`; the Crop tool opens it and is disabled without a selection.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Verify + commit**

```powershell
git add src/editor/model/cropBox.ts src/editor/model/__tests__/cropBox.test.ts src/editor/components/CropScreen.tsx src/editor/components/EditorToolbar.tsx src/editor/__tests__/CropScreen.test.tsx
git commit -m "feat(editor): crop screen with draggable box and shape presets"
```

---

### Task 9: Timeline — photos, "+" tile, Add and Replace

**Files:** Create `src/editor/components/AddClipTile.tsx`, `src/editor/useClipMedia.ts`; modify `Timeline.tsx`, `ClipThumbStrip.tsx`, `TrimHandles.tsx`, `EditorToolbar.tsx`, `src/editor/model/ops.ts` (`replaceClipMedia`), tests alongside.

**Interfaces (produced):**
```ts
export function replaceClipMedia(p: Project, clipId: string, media: Pick<Clip, "sourceUri" | "sourceDuration" | "width" | "height" | "kind">): Project
// useClipMedia.ts
export function useClipMedia(): { addMedia(): Promise<void>; replaceMedia(clipId: string): Promise<void>; busy: boolean }
```
**Behaviour**
- `ClipThumbStrip`: a photo clip shows the photo itself in every thumbnail slot (no `getThumb` call) and the photo badge.
- `TrimHandles`: for a photo only the end handle is shown; dragging it changes `trimEnd` within `[PHOTO.minSeconds, PHOTO.maxSeconds]`.
- `AddClipTile`: a 64-pt square "+" tile (`accessibilityLabel "Add clips"`) rendered after the last clip inside the clip row; pressing calls `addMedia()` → `pickMedia()` → `storage.importMedia(project.id, assets)` → one `apply(addClips)`; toast "N of M added" when some failed; `busy` shows an `ActivityIndicator` in the tile. The tile must not change the timeline's width maths for scrubbing (the scrollable range still ends at the last clip's end; the tile sits in the trailing padding).
- `replaceClipMedia`: keeps id, filter, transform, crop, background, transition, volume / muted (photo rules applied when the new media is a photo; when switching photo → video: `muted false`, volume 1); `trimStart 0`, `trimEnd = min(new source length, the clip's previous output duration × speed)` (photo: previous output duration clamped to the photo limits); `reversed` kept for videos; transitions re-normalised.
- `Replace` tool: `replaceMedia(selectedId)` → `pickMedia({ multiple: false })` → `importMedia` → one `apply(replaceClipMedia)`; cancelled or failed pick changes nothing (toast on failure).

- [ ] **Step 1: Failing tests** — strip (photo slots, badge, no thumbnail call), handles (photo: one handle, clamps), tile (press → clips appended, one undo step, busy state, partial-failure toast), `replaceClipMedia` (each rule above, both directions), Replace tool wiring, and a Timeline test that the scroll content's scrubbable width is unchanged by the tile.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Verify + commit**

```powershell
git add src/editor src/projects
git commit -m "feat(timeline): photo clips, add-clips tile and Replace"
```
(Stage explicit paths.)

---

### Task 10: Freeze frame

**Files:** Create `src/editor/useFreezeFrame.ts`; modify `src/editor/model/ops.ts` (`insertFreezeFrame`), `EditorToolbar.tsx`; tests alongside.

**Interfaces (produced):**
```ts
export function insertFreezeFrame(p: Project, outputTime: number, still: { id: string; sourceUri: string; width: number; height: number }): Project
export function useFreezeFrame(): { freeze(): Promise<void>; busy: boolean }
```
**Behaviour**
- `insertFreezeFrame`: only inside a video clip, and not within `MIN_CLIP_SECONDS` of either end (otherwise the project is returned unchanged); splits the clip at `outputTime` (reusing `splitClipAt`'s rules) and inserts a photo clip of `PHOTO.freezeSeconds` between the halves that copies the clip's filter, transform, crop and background; no transition on the left half's cut into the still; transitions re-normalised; later overlays and music are NOT shifted (same rule as other length-changing ops in this file — check how `splitClipAt` / `trimClip` treat overlays and follow it).
- `useFreezeFrame.freeze()`: resolves the clip and source time at the playhead (`outputToSource`), captures with `VideoThumbnails.getThumbnailAsync(uri, { time: ms, quality: 1 })`, `storage.saveStill(...)`, then one `apply(insertFreezeFrame)`, selects the new still and seeks to its start; failure → toast "Couldn't capture that frame"; `busy` disables the tool.

- [ ] **Step 1: Failing tests** — op: lengths (left + 2 s + right), inherited fields, edges refused, photo / missing clip refused, one object change; hook: happy path (capture args in ms, still saved, one undo step, selection + playhead), capture failure toast and unchanged project; toolbar: Freeze disabled for photos and without selection.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Verify + commit**

```powershell
git add src/editor
git commit -m "feat(editor): freeze frame — insert a still at the playhead"
```
(Stage explicit paths.)

---

### Task 11: Export request

**Files:** Modify `modules/clipy-video/index.ts`, `modules/clipy-video/__tests__/index.test.ts`, `src/export/useExport.ts`, `src/export/estimate.ts`, `src/export/__tests__/*`.

**Interfaces (produced):**
```ts
export interface ExportClip {
  /* existing */ kind: "video" | "photo"; sourceWidth: number; sourceHeight: number;
  transform: { scale: number; x: number; y: number; rotation: number; flipH: boolean; flipV: boolean };
  crop: { x: number; y: number; w: number; h: number };
  background: { type: "black" | "color" | "blur"; color: string | null };
  reversed: boolean;
}
export function toExportClip(c: Clip): ExportClip
```
- `useExport` maps clips through `toExportClip`; `canExport4K` considers video clips only; `estimateBytes` unchanged in formula (duration-based) — photos count by their output duration.

- [ ] **Step 1: Failing tests** — `toExportClip` for a default video, a transformed / cropped / colour-background clip, a blur-background clip (`color: null`), a reversed clip and a photo; the export request built from a project containing a photo, a reversed clip and a freeze frame carries them in order with transitions normalised.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Verify + commit**

```powershell
git add modules/clipy-video/index.ts modules/clipy-video/__tests__/index.test.ts src/export
git commit -m "feat(export): send clip kind, transform, crop, background and reverse to the engine"
```

---

### Task 12: Swift — `ClipLayout` and compositor placement

**Files:** Create `modules/clipy-video/ios/ClipLayout.swift`, `modules/clipy-video/ios/Tests/ClipLayoutTests.swift`; modify `ExportSession.swift` (records + `LayerSpec` data), `ClipyCompositor.swift`; add a Jest parity test `src/editor/model/__tests__/clipLayout.parity.test.ts`.

**Behaviour** (no Swift toolchain here — verify by reading against `node_modules/expo-modules-core/ios` and Apple's AVFoundation / Core Image docs; follow the style of `OverlayLayout.swift` / `Effects.swift`):
- `ExportClip` record gains the fields of Task 11 (nested records for transform / crop / background).
- `ClipLayout.swift` mirrors `clipLayout.ts` function for function (`isQuarterTurn`, `croppedSize`, `coverFactor`, `fitScale`, `placeClip`, `coversFrame`) with the same constants; the `PLACE_VECTORS` cases are embedded as a Swift test table.
- `ClipyCompositor`: for each source frame — orient it with the track's preferred transform (as today), crop to the crop rectangle, flip, scale to the placed size, rotate about its centre, translate to the placed centre (mind Core Image's bottom-left origin vs the top-left origin of the layout: convert once, in one helper); composite over the background: black, the colour, or — when the background is blur and the picture does not cover the frame — the same frame scaled to cover and blurred (`CIGaussianBlur`, radius = 4 % of the frame's shorter side, clamped extent before blurring so edges are not transparent); then apply the filter and transitions exactly as today. A clip with the default transform and full crop must produce the same pixels as before this change.
- Parity test (Jest): reads `ClipLayout.swift` as text and asserts each constant (`SNAP` is TS-only; check the quarter-turn tolerance `1`, coverage epsilon `0.5`) and each `PLACE_VECTORS` expected number appears in the Swift test table (formatted with the same precision helper).

- [ ] **Step 1: Parity test (failing).** **Step 2: Implement the Swift.** **Step 3: Verify** — `npm run typecheck`; `npm test`. In the report, list every API you could not verify by reading. **Step 4: Commit**

```powershell
git add modules/clipy-video/ios src/editor/model/__tests__/clipLayout.parity.test.ts
git commit -m "feat(ios): place clips with transform, crop and background in the compositor (uncompiled)"
```

---

### Task 13: Swift — pre-pass for photos and reversed clips

**Files:** Create `modules/clipy-video/ios/MediaPrePass.swift`, `modules/clipy-video/ios/Tests/MediaPrePassTests.swift`; modify `ExportSession.swift`.

**Behaviour**
- Before building the composition, `MediaPrePass.plan(clips)` lists what needs preparing: each photo clip → a video file of its output duration (H.264, the photo's pixel size capped at the export's long side, 30 fps, written with `AVAssetWriter` + pixel-buffer adaptor from one `CGImage`; two frames suffice if the writer and composition handle a long last frame — otherwise write frames at 1 fps; choose the approach the AVFoundation docs support and say which); each reversed clip → a reversed copy of its trimmed range (read with `AVAssetReader` in chunks of at most 2 seconds from the end backwards, append frames with ascending presentation times to an `AVAssetWriter`; audio of a reversed clip is dropped — the clip exports silent; say so in the README).
- Prepared files live in a per-export temp folder and are deleted when the export finishes, fails or is cancelled. The prepared file replaces the clip's source for the rest of the pipeline with `trimStart 0`, `trimEnd` = its duration, and `reversed false`; speed, filter, transform, crop, background and transitions still apply afterwards.
- Progress: the pre-pass takes the first 20 % of the reported progress when any clip needs it. Cancel stops it promptly. A failure throws an `ExportError` with a readable message ("Couldn't prepare a photo for export." / "Couldn't reverse a clip for export.").
- Pure, testable planning code is separated from the AVFoundation work; Swift tests cover the planner.

- [ ] **Step 1: Implement** (reading-verified). **Step 2: Docs** — `README.md`: reversed clips export without sound; photos and reverse need the native build to appear in the exported video. **Step 3: Verify** — `npm run typecheck`; `npm test`. **Step 4: Commit**

```powershell
git add modules/clipy-video/ios README.md
git commit -m "feat(ios): pre-pass turns photos and reversed clips into video before composing (uncompiled)"
```

---

### Task 14: Docs, spec status, full checks

**Files:** `README.md`, `AGENTS.md`, the spec's Status line, `docs/superpowers/research/capcut-roadmap.md` (mark Group A items).

- [ ] **Step 1** — README: new "Clip tools" list (transform, crop, background, photos, add, replace, reverse, freeze) with what is exact vs approximate in the preview. AGENTS.md: add `- Clip placement: keep src/editor/model/clipLayout.ts and modules/clipy-video/ios/ClipLayout.swift identical (constants and vectors); no other code computes cover / fit.` Spec Status → `Implemented 2026-10-03 (Swift export unverified until an EAS build exists; on-device checklist pending)`. Roadmap: mark the Group A rows "Have" except Auto reframe and Extract audio.
- [ ] **Step 2: Full verification** — `npm run typecheck`; `npm test`; `npx.cmd expo-doctor`; `npm ls --all | Select-String invalid` (empty).
- [ ] **Step 3: Commit**

```powershell
git add README.md AGENTS.md docs/superpowers
git commit -m "docs: clip basics (CapCut group A)"
```

**Device checklist (user, Expo Go):** select a clip → pinch / drag / twist on the preview (snaps at centre, straight angles, Fit and Fill) → Transform buttons → Crop with 1:1 → Background colour then Blur ("Preview" tag) → "+" adds a photo and a video → stretch the photo → Replace a clip → Reverse (badge + tag) → Freeze at the playhead → play through photo and video clips → undo everything → close and reopen the project.
