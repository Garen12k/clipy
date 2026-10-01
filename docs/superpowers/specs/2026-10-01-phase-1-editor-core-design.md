# Clipy Phase 1 — Editor Core & Share — Design

**Date:** 2026-10-01
**Status:** Implemented 2026-10-01 (Swift export unverified until an EAS build exists)
**Parent spec:** `2026-10-01-clip-editor-app-design.md` (sections 4–6 apply unchanged unless overridden here)

## 1. Goal

A polished, usable clip editor: create projects from camera-roll videos, arrange and trim clips on a timeline, preview the edit on the phone, choose an aspect ratio, export to `.mp4`, and share via the iOS share sheet.

**Done when** (on the iPhone in Expo Go): import 3 clips → split one → trim one → reorder → change ratio → scrub and play preview → close and reopen the project → the Export screen shows the "needs the native build" fallback. Jest suite green. Swift export code written and reviewed (runs only once an EAS build exists).

## 2. Constraints

- Everything in this phase except export must work in **Expo Go** (no custom native code). Export is implemented in Swift now (user's choice, option B) but is untestable until an Apple Developer account exists; the UI must degrade gracefully.
- iPhone only. Portrait only.
- No copyrighted One Piece artwork, names of characters, or logos anywhere in the app. The theme is *inspired by*, using original elements only.
- All editing logic is pure TypeScript with Jest tests. Screens never mutate project data directly.

## 3. Visual Design — "Shanks-inspired, accents only"

| Token | Value | Use |
|---|---|---|
| `bg` | `#0B0B0D` | screen background (black cloak) |
| `surface` | `#17171B` | cards, toolbar, sheets |
| `surfaceAlt` | `#222228` | pressed/hover, timeline track |
| `accent` | `#C8102E` | primary buttons (New Project, Export), active icons (red hair) |
| `accentPressed` | `#9E0C24` | pressed state |
| `highlight` | `#F5C542` | selection outline, trim handles, playhead (sunny yellow) |
| `straw` | `#D9B36A` | card borders, subtle dividers |
| `sea` | `#2E86AB` | links, secondary selection |
| `text` | `#F4F4F5` | primary text |
| `textMuted` | `#9A9AA3` | secondary text, disabled |
| `danger` | `#FF4D4F` | destructive actions |

- **Fonts:** `Bangers` (Google Fonts, OFL) for screen titles, section headings and primary button labels; system font (SF) for everything else. Loaded with `expo-font` / `@expo-google-fonts/bangers`.
- **Mark:** an original "three slashes" motif (three short diagonal strokes, red on dark) drawn as an SVG component. Used on the splash screen, the empty Projects state, and inside the Export button.
- **Spacing scale:** 4, 8, 12, 16, 24, 32. **Radius:** 12 (cards/buttons), 8 (chips), 999 (pills).
- **Motion:** 150–200 ms ease-out for presses and sheet transitions; no decorative animation.
- **Wallpaper slot:** `theme.ts` exposes `projectsWallpaper: ImageSource | null` (default `null`). If the user later adds an image they own, it renders dimmed (30 %) behind the Projects grid. Nothing ships in the repo.
- All theme values live in `src/theme/theme.ts`; components never hard-code colors.

## 4. Screens & Navigation (Expo Router)

```
app/_layout.tsx            fonts loaded, dark theme, Stack
app/index.tsx              Projects
app/editor/[id]/index.tsx  Editor
app/editor/[id]/export.tsx Export (modal presentation)
```

### 4.1 Projects (`/`)
- Header: "Clipy" in Bangers; small three-slashes mark.
- 2-column grid of `ProjectCard`: thumbnail (first clip, aspect-fitted), name, duration `m:ss`, relative time ("2h ago"). `straw` 1 px border, radius 12.
- Sticky bottom `PrimaryButton` **New Project** (accent). Tap → `expo-image-picker` multi-select, videos only → create project named "Project N" → navigate to Editor.
- Long-press card → action sheet: Rename (prompt), Duplicate, Delete (confirm).
- Empty state: mark + "No projects yet" (Bangers) + "Tap New Project to start" (muted).
- Project whose JSON can't be parsed: card shows "Can't open" badge; tapping offers Delete.

### 4.2 Editor (`/editor/[id]`)
- Top bar: back chevron, project name (tap to rename), undo, redo (dimmed when unavailable), **Export** (accent pill).
- Preview (`PreviewPlayer`): fills ~50 % height; a frame with the project's aspect ratio centered; 9:16 fills height, 1:1 and 16:9 letterboxed on `surface`. Tap to play/pause; overlay shows `current / total` time (`m:ss.t`).
- Timeline (`Timeline`): horizontal `FlatList`-free custom scroll view of `ClipThumbStrip`s (thumbnails every N seconds generated with `expo-video-thumbnails`), 64 px tall, playhead fixed at horizontal center (`highlight` 2 px line). Dragging the strip scrubs; pinch changes `pixelsPerSecond` (range 20–200). Tap clip → selected (`highlight` outline). Selected clip shows trim handles at both ends (drag to trim; snaps to 0.1 s). Long-press → drag to reorder (uses `react-native-reanimated` + `react-native-gesture-handler`, both in Expo Go).
- Toolbar (`EditorToolbar`): horizontal scroll of `ToolButton` (icon + label): **Split · Trim · Ratio · Duplicate · Delete**. Split/Trim/Duplicate/Delete dimmed without a selection. Trim toggles handle-drag mode hint (handles already visible; the button focuses the numeric trim sheet with start/end fields). Ratio opens a bottom sheet with 9:16 / 1:1 / 16:9 chips.
- Missing-media clip: strip shows warning badge; preview skips it.

### 4.3 Export (`/editor/[id]/export`, modal)
- Resolution chips: 720p / 1080p / 4K (4K disabled with hint if no source clip is ≥ 2160 px on its long edge). Estimated size shown (duration × bitrate table: 720p 5 Mbps, 1080p 10 Mbps, 4K 35 Mbps).
- Primary button **Export** (accent, with mark). While exporting: progress bar (`highlight`), percent, **Cancel**.
- On success: preview thumbnail + **Save to Photos** (`expo-media-library`), **Share…** (`expo-sharing`), **Done**.
- On failure: message from native + **Try again**.
- **Native unavailable** (Expo Go): same layout; the button area is replaced by a card: "Export needs the native build" + one-line explanation + muted text "Everything else in Clipy works in Expo Go." No crash, no stack trace.

## 5. Data Model (Phase 1 subset of the parent spec)

```ts
interface Project {
  id: string; name: string; createdAt: string; updatedAt: string;
  aspectRatio: "9:16" | "1:1" | "16:9";
  clips: Clip[];
  overlays: [];            // reserved for Phase 2
  audioTracks: [];         // reserved for Phase 2
  schemaVersion: 1;
}
interface Clip {
  id: string;
  sourceUri: string;       // file inside projects/<id>/media/
  sourceDuration: number;  // seconds
  width: number; height: number;
  trimStart: number; trimEnd: number;   // seconds, 0 ≤ start < end ≤ sourceDuration
  speed: 1;                // fixed in Phase 1
  filter: null; volume: 1; transitionOut: { type: "none"; duration: 0 };
}
```

Storage layout: `${documentDirectory}projects/<id>/project.json`, `media/<clipId>.<ext>`, `thumb.jpg`. Writes are atomic (write `project.json.tmp`, then move). Autosave debounced 500 ms after the last edit. Load tolerates unknown fields (forward compatibility) and rejects wrong `schemaVersion` with a readable error.

## 6. Modules

```
src/
  theme/theme.ts                 tokens, fonts, wallpaper slot
  theme/Mark.tsx                 three-slashes SVG
  ui/                            PrimaryButton, ToolButton, Sheet, Chip, Toast, ConfirmDialog
  editor/model/types.ts          Project, Clip, AspectRatio
  editor/model/ops.ts            pure edit functions (below)
  editor/model/timeline.ts       timeline math (below)
  editor/store.ts                Zustand store + undo/redo + autosave hook
  editor/components/PreviewPlayer.tsx
  editor/components/Timeline.tsx, ClipThumbStrip.tsx, TrimHandles.tsx
  editor/components/EditorToolbar.tsx, RatioSheet.tsx, TrimSheet.tsx
  projects/storage.ts            create/load/save/list/delete/duplicate, media copy, thumbnails
  projects/ProjectCard.tsx
  export/estimate.ts             size estimate, 4K eligibility
  export/useExport.ts            drives native export, progress, cancel, Expo Go detection
modules/clipy-video/index.ts     + exportTimeline / cancelExport / events
modules/clipy-video/ios/         ClipyVideoModule.swift, ExportSession.swift
```

### 6.1 Pure edit functions (`ops.ts`) — all return a new `Project`
- `addClips(p, clips: Clip[]): Project`
- `splitClipAt(p, outputTime): Project` — no-op if the time is at/within 0.1 s of a clip boundary
- `trimClip(p, clipId, trimStart, trimEnd): Project` — clamps to `[0, sourceDuration]`, enforces `end − start ≥ 0.1`
- `moveClip(p, clipId, toIndex): Project`
- `deleteClip(p, clipId): Project`
- `duplicateClip(p, clipId): Project` — inserts the copy right after the original with a new id
- `setAspectRatio(p, ratio): Project`
- `renameProject(p, name): Project`
Every op sets `updatedAt`.

### 6.2 Timeline math (`timeline.ts`)
- `clipDuration(c) = c.trimEnd − c.trimStart`
- `totalDuration(p)`
- `clipAt(p, outputTime) → { clip, index, offsetInClip } | null`
- `clipStartTimes(p) → number[]`
- `timeToX(t, pps)`, `xToTime(x, pps)`

### 6.3 Store (`store.ts`)
State: `project`, `selectedClipId`, `playhead`, `isPlaying`, `pixelsPerSecond`, `past[]`, `future[]`, `dirty`.
Actions: `load(id)`, `apply(op)` (pushes to `past`, clears `future`, marks dirty), `undo()`, `redo()`, `select(id|null)`, `seek(t)`, `setPlaying(b)`, `setZoom(pps)`. Max 50 history entries. A `useAutosave()` hook saves 500 ms after `dirty` becomes true.

### 6.4 Preview (`PreviewPlayer`)
- Owns one `expo-video` `VideoPlayer`. Derives `{clip, offsetInClip}` from `playhead` via `clipAt`.
- When the clip under the playhead changes → `player.replace(clip.sourceUri)` then `seekTo(offsetInClip)`. While playing, listens to `timeUpdate`; when `currentTime ≥ clip.trimEnd` → advance playhead to the next clip's start (or stop at the end). While paused, scrubbing seeks the player.
- Crop: the player view is scaled with `contentFit: "cover"` inside an aspect-ratio frame so all three ratios preview correctly.
- Expected limitation (documented in UI as nothing — it's a preview): up to ~100 ms gap on clip switches.

### 6.5 Native export contract (`modules/clipy-video`)
TS:
```ts
exportTimeline(project: Project, opts: { resolution: 720 | 1080 | 2160; outputPath: string }): Promise<string /*jobId*/>
cancelExport(jobId: string): void
addExportListener(cb: (e: { jobId: string } & ({ type: "progress"; progress: number } | { type: "done"; fileUri: string } | { type: "error"; message: string } | { type: "cancelled" })) => Subscription
isNativeAvailable(): boolean      // false in Expo Go
```
Swift (`ExportSession.swift`): builds `AVMutableComposition` (video + audio tracks per clip, trimmed), an `AVMutableVideoComposition` with a per-clip transform that scales-and-crops (aspect fill) into the target render size (9:16 → 1080×1920 at 1080p, etc.), exports via `AVAssetExportSession` with presets by resolution, polls `progress` every 250 ms and emits events, supports `cancelExport()`. Unknown/unsupported source → error event with a readable message. Partial output deleted on error/cancel.

### 6.6 Storage (`projects/storage.ts`)
- `createProject(name, pickedAssets) → Project` — copies each asset into `media/`, reads duration/size via `expo-video-thumbnails` + asset info, generates `thumb.jpg` from the first clip at 0.5 s.
- `listProjects() → ProjectSummary[]` (id, name, duration, updatedAt, thumbUri, broken: boolean)
- `loadProject(id)`, `saveProject(p)` (atomic), `deleteProject(id)`, `duplicateProject(id)`, `renameProject`.

## 7. Error Handling

- **Import:** per-asset try/catch; failures counted and reported in one toast; iCloud assets fetched with `expo-media-library` download + indeterminate progress. Photos permission denied → inline explanation + "Open Settings".
- **Missing media:** `loadProject` checks each `sourceUri` exists; missing clips are flagged (`missing: true` in store only, not persisted) → warning badge, skipped by preview and export.
- **Export:** free space check (`expo-file-system` `getFreeDiskStorageAsync`) must exceed 2× the estimate; failure/cancel removes the partial file; native messages shown verbatim; in Expo Go `isNativeAvailable()` gates the whole flow.
- **Persistence:** atomic writes; corrupt files surface as "Can't open" cards; never crash the list.
- **Undo** replaces confirmation dialogs for all clip edits; only project deletion confirms.

## 8. Testing

- **Jest (unit):** every op in 6.1 including boundaries (split at 0, at end, within 0.1 s of a cut; trim clamping; move to same index; delete last clip), all of 6.2, store undo/redo/history cap, autosave debounce (fake timers), storage save/load round-trip and corrupt-file handling (mock `expo-file-system`), export estimate + 4K eligibility, `isNativeAvailable()` false path.
- **Jest (component, `@testing-library/react-native`):** EditorToolbar dimming without selection; Export screen shows the fallback card when native is unavailable; RatioSheet selection calls `setAspectRatio`.
- **Device checklist (Expo Go):** the "Done when" list in section 1, plus: kill the app mid-edit and reopen → last state restored; delete a source video from Photos → project still opens.
- **Swift:** `ExportSessionTests` exports two bundled 2 s clips at 720p and asserts duration ≈ 4 s, 720×1280 for 9:16, audio track present. Runs on EAS only; documented as deferred.

## 9. Out of Scope (Phase 1)

Text, stickers, captions, music, volume, speed, filters, transitions (Phase 2–3); direct social posting (Phase 4); native preview; landscape; iPad.
