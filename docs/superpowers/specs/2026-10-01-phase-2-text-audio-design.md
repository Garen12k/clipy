# Clipy Phase 2 — Text Overlays & Audio — Design

**Date:** 2026-10-01
**Status:** Approved in brainstorming, pending written-spec review
**Parent specs:** `2026-10-01-clip-editor-app-design.md`, `2026-10-01-phase-1-editor-core-design.md` (everything there still applies unless overridden here)

## 1. Goal

Add text overlays with a full style editor and direct manipulation on the preview, one music track (from the Files app or bundled public-domain tracks), and per-clip volume/mute. Everything except the final render works in Expo Go; the Swift export is extended to render text (Core Animation) and mix audio (`AVMutableAudioMix`).

**Done when** (on the iPhone in Expo Go): add a text overlay → move, pinch-resize, rotate it → change font, size, color, background, alignment, outline → set its start/end on the timeline → add a bundled song → move and trim it on the music lane → set its volume → lower one clip's volume and mute another → play through: text appears/disappears on time and music is in sync → close and reopen the project. Jest green. Swift export extended and reviewed by reading.

## 2. Constraints (in addition to the parents')

- Phase 2 UI and preview must run in Expo Go: text is rendered as React Native views over the video; music via `expo-audio`; no new native code outside `modules/clipy-video`.
- Preview and export must place text identically: positions are **fractions of the frame**, font size is a **fraction of frame height**; both engines use one shared layout formula (TS `overlayLayout.ts`, mirrored in `OverlayLayout.swift`) and the **same bundled TTF files**.
- Bundled music must be public domain (CC0). The agent fetches tracks only after the user approves the exact files; the user may also drop their own files into `assets/music/` with a `manifest.json` entry.
- Fonts: 8 Google Fonts under the OFL: Bangers (already present), Anton, Oswald, Montserrat, Pacifico, Permanent Marker, Lobster, Roboto. Loaded via the `expo-font` config plugin so the native side can use them by PostScript name.
- One music track per project in Phase 2 (the data model is an array for Phase 3+).
- All edits remain pure ops through the store; gestures use `beginTransaction`/`applyTransient`.
- Schema moves to `schemaVersion: 2` with a v1 → v2 migration on load.

## 3. Screens & Interactions

### 3.1 Editor toolbar
`Split · Trim · Ratio · Text · Music · Volume · Duplicate · Delete`. Split/Trim/Duplicate/Delete/Volume need a selected clip; Text and Music are always enabled.

### 3.2 Timeline lanes
Below the clip strip, two 28 px lanes sharing the clip strip's time scale (`pixelsPerSecond`) and scroll offset:
- **Text lane:** one `OverlayPill` per overlay: `highlight` outline when selected, text label ellipsized, left edge at `timeToX(start)`, width `timeToX(end − start)`. Tap → select overlay (`selectedOverlayId`), deselect clip. Drag the pill → move in time (`moveOverlay`, clamped to `[0, totalDuration]`, duration preserved). Drag its end handles → change `start`/`end` (min 0.2 s). Overlays may overlap in time; later ones render on top.
- **Music lane:** one `MusicBar` if an audio track exists: label = title, `sea` fill, speaker icon with volume %. Drag → change `start`; end handles → `trimStart`/`trimEnd` (min 0.5 s). Missing file → warning badge.
- `TIMELINE_HEIGHT` grows to 120 + 2×(28 + 4).

### 3.3 Preview overlays
`OverlayLayer` sits over the `VideoView` inside the aspect-ratio frame and renders every overlay whose `[start, end)` contains the playhead (while playing, driven by the same store playhead). Each overlay is an absolutely positioned `Text` styled by `overlayLayout`. The selected overlay gets a `SelectionFrame` (dashed `highlight` border, corner dots) with gestures:
- Pan → move (`x`, `y` fractions, clamped 0..1)
- Pinch → `scale` (0.2..5)
- Rotation → `rotation` degrees (snaps to 0/90/180/270 within 3°)
- Double-tap → opens the text panel with the text field focused
- Tap on empty preview area → deselect
All through a transaction per gesture (one undo step).

### 3.4 Text panel (`TextPanel`, bottom sheet, 55 % height, replaces the toolbar while open)
Sections, top to bottom:
1. `TextInput` (multiline, auto-focus on create), Done button disabled while empty.
2. Font strip: horizontal chips, each rendered in its own font.
3. Size slider (`fontScale` 0.02–0.25, shown as %).
4. Color row: 8 palette swatches (`text`, `highlight`, `accent`, `sea`, `straw`, `#000000`, `#FFFFFF`, `#00E5A0`) + "Custom" → hex input.
5. Background: toggle; when on: color swatches + opacity slider (0.2–1).
6. Alignment segmented control (left/center/right); Outline toggle (2 px, auto-contrast black/white).
7. **Fine-tune** (collapsed by default): numeric X %, Y %, Scale, Rotation °, Start s, End s.
8. Row: Duplicate · Delete.
Every control calls `apply(updateOverlay(id, patch))` (sliders use a transaction while dragging).

### 3.5 Music sheet (`MusicSheet`)
Tabs **Bundled** / **My files**.
- Bundled: list from `assets/music/manifest.json` (title, duration, license, file). Each row: play/stop preview (expo-audio), **Use**.
- My files: button → `expo-document-picker` (`audio/*`, copy to cache) → **Use**.
- **Use** copies the file into `projects/<id>/media/` and `apply(setAudioTrack(...))` (replaces an existing track; undoable). Files > 50 MB → confirm first.
- When a track exists the sheet opens on a **Current track** view: title, volume slider (0–2), start-in-video, trim start/end numeric fields, **Remove**.

### 3.6 Volume sheet (`VolumeSheet`, for the selected clip)
Slider 0–200 % (`setClipVolume`), Mute switch (`setClipMuted`). Live: the video player's `volume`/`muted` follow the clip under the playhead.

### 3.7 Export
Request gains `overlays`, `audioTrack`, per-clip `volume`/`muted`. Swift renders text with `CATextLayer`s inside an `AVVideoCompositionCoreAnimationTool`, mixes audio with `AVMutableAudioMix` (clip volumes, mute = 0, music volume, 1 s linear fade-out if the music reaches the end of the video). Expo Go still shows the fallback card.

## 4. Data Model (schema v2)

```ts
type FontId = "bangers" | "anton" | "oswald" | "montserrat" | "pacifico" | "permanentMarker" | "lobster" | "roboto";
type Align = "left" | "center" | "right";

interface TextOverlay {
  id: string; kind: "text";
  text: string;
  fontId: FontId;
  fontScale: number;      // font size / frame height, 0.02–0.25
  color: string;          // #RRGGBB
  background: { color: string; opacity: number } | null;
  outline: boolean;
  align: Align;
  x: number; y: number;   // centre, fractions of frame width/height, 0–1
  scale: number;          // 0.2–5 (multiplies fontScale at render)
  rotation: number;       // degrees
  start: number; end: number; // output-timeline seconds, end − start ≥ 0.2
}

interface AudioTrack {
  id: string; sourceUri: string; title: string;
  sourceDuration: number;
  start: number;          // position on the output timeline
  trimStart: number; trimEnd: number; // seconds into the source
  volume: number;         // 0–2
}

interface Clip { /* Phase 1 fields */ volume: number /* 0–2 */; muted: boolean; }

interface Project { /* ... */ overlays: TextOverlay[]; audioTracks: AudioTrack[]; schemaVersion: 2; }
```

Migration v1 → v2 (`migrate.ts`): add `muted: false` to clips; ensure `overlays`/`audioTracks` arrays; set `schemaVersion: 2`. Unknown higher versions throw "This project was made with a newer version of Clipy."

Defaults for a new overlay: `text: "Your text"`, `fontId: "bangers"`, `fontScale: 0.07`, `color: theme.colors.text`, `background: null`, `outline: true`, `align: "center"`, `x: 0.5`, `y: 0.5`, `scale: 1`, `rotation: 0`, `start: playhead`, `end: min(playhead + 3, totalDuration)`; if that leaves less than 0.2 s, `start = max(0, totalDuration − 3)` and `end = totalDuration`. The Text tool is disabled while the project has no clips.

## 5. Modules

```
src/editor/model/types.ts            + TextOverlay, AudioTrack, FontId, Align; Clip.muted; schemaVersion 2
src/editor/model/migrate.ts          migrateProject(raw) → Project (v1→v2)
src/editor/model/ops.ts              + overlay/audio/volume ops (below)
src/editor/model/overlayLayout.ts    layoutOverlay(o, frameW, frameH) → { left, top, fontSize, transform, width? }
src/editor/model/audioSync.ts        songTimeAt(track, playhead) → number | null ; isAudible(track, playhead)
src/editor/fonts.ts                  FONTS registry { id, label, file, postScriptName, family }
src/editor/store.ts                  + selectedOverlayId, selectOverlay(id|null); select(clip) clears overlay selection and vice versa
src/editor/components/OverlayLayer.tsx, SelectionFrame.tsx, TextPanel.tsx, ColorRow.tsx, FontStrip.tsx
src/editor/components/OverlayLane.tsx, OverlayPill.tsx, MusicLane.tsx, MusicBar.tsx
src/editor/components/AudioPreview.tsx   expo-audio player synced to the store
src/editor/components/MusicSheet.tsx, VolumeSheet.tsx
src/projects/storage.ts              + importAudio(projectId, uri, title) → AudioTrack-ready fields; missing-media check covers audio
assets/music/manifest.json + files   bundled tracks (CC0)
assets/fonts/*.ttf                   7 new fonts (Bangers via @expo-google-fonts stays)
modules/clipy-video/index.ts         ExportRequest + overlays/audioTrack/volume/muted
modules/clipy-video/ios/OverlayLayout.swift, ExportSession.swift (+text layers, audio mix)
```

### 5.1 Ops (pure, return the same reference on no-op, stamp `updatedAt`)
- `addTextOverlay(p, overlay)`, `updateOverlay(p, id, patch)` (validates ranges, clamps x/y/scale/fontScale, `end − start ≥ 0.2`, `end ≤ totalDuration`), `moveOverlay(p, id, newStart)` (keeps duration, clamps), `deleteOverlay(p, id)`, `duplicateOverlay(p, id)` (offset x/y by +0.03, new id)
- `setAudioTrack(p, track)` (replaces `audioTracks` with `[track]`), `updateAudioTrack(p, patch)` (clamps trims to source, `trimEnd − trimStart ≥ 0.5`, `start ≥ 0`), `removeAudioTrack(p)`
- `setClipVolume(p, clipId, v)` (0–2), `setClipMuted(p, clipId, b)`
- `deleteClip`/`splitClipAt` etc. unchanged; overlays keep their output-timeline times (they are independent of clips).

### 5.2 Layout formula (`overlayLayout.ts`, mirrored in Swift)
```
fontSize   = fontScale * scale * frameH
left       = x * frameW ; top = y * frameH     // centre point
transform  = translate(-50%,-50%) rotate(rotation)
padding    = background ? 0.25 * fontSize : 0
outline    = 2 px (preview) ; stroke width 2 * (frameH / 1920) px (export)
maxWidth   = 0.9 * frameW (wrap)
```
A unit test pins `layoutOverlay` outputs for 3 ratios × 2 frame sizes; the Swift mirror is reviewed against those numbers.

### 5.3 Audio sync (`audioSync.ts`)
`songTimeAt(track, t) = t < track.start || t ≥ track.start + (trimEnd − trimStart) ? null : trimStart + (t − track.start)`. `AudioPreview` seeks/plays/pauses by this; when `null`, it pauses.

## 6. Error Handling

- Music import: unsupported/unreadable → toast "Couldn't add that audio file", nothing added; > 50 MB → confirm; missing on reopen → badge on the music lane, skipped by preview/export (tracked in `missingSourceUris` like clips).
- Text: Done disabled when empty; failed font load → system font in preview, Helvetica in export (`fonts.ts` fallback), no crash.
- Migration: v1 upgraded on first save; unknown newer version → readable error card.
- Audio preview: play failure → badge + silent range; never blocks video playback.
- Export: native messages shown verbatim (unchanged).

## 7. Testing

- **Jest unit:** all 5.1 ops incl. clamps/no-ops; `migrateProject` (v1 fixture → v2, idempotent on v2, rejects v3); `layoutOverlay` pinned numbers; `audioSync` cases (before, inside, after, trimmed); `fonts.ts` registry completeness (8 ids, files exist); storage `importAudio` + missing audio detection.
- **Jest component:** TextPanel controls dispatch the right ops; FontStrip renders 8 chips; MusicSheet lists manifest tracks and calls the picker (mocked); VolumeSheet; toolbar new buttons enabled/disabled rules; OverlayLane pill selection.
- **Device checklist:** the "Done when" list in §1, plus: undo a drag of an overlay in one step; overlay stays in place across ratio changes (fractions); music keeps sync after scrubbing.
- **Swift:** `ExportSessionTests` adds one text overlay + a generated 2 s sine-wave audio file; asserts audio track present and duration unchanged. EAS only.

## 8. Out of Scope

Captions/auto-captions, stickers, filters, speed, transitions (Phase 3); multiple audio tracks; text animations; voice-over recording; direct posting (Phase 4).
