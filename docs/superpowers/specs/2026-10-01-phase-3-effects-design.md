# Clipy Phase 3 — Filters, Speed, Transitions, Stickers, Auto-Captions — Design

**Date:** 2026-10-01
**Status:** Approved in brainstorming, pending written-spec review
**Parent specs:** `2026-10-01-clip-editor-app-design.md`, `2026-10-01-phase-1-editor-core-design.md`, `2026-10-01-phase-2-text-audio-design.md` (all still apply unless overridden here)

## 1. Goal

Add per-clip speed, color filters, transitions between clips, emoji/shape stickers, and automatic captions. Everything is editable in Expo Go; filters and transitions are **approximated** in the preview and rendered for real in the Swift export; captions need the native build (Apple's on-device Speech framework) and show the "needs the native build" card in Expo Go.

**Done when** (iPhone, Expo Go): set 2× on a clip (strip shrinks, playback faster, total duration updates) → apply a filter (tinted preview + "Preview" tag) → add a fade transition on a cut (fade-to-black at the cut) → add an emoji sticker and a shape sticker (move/pinch/rotate, timed on the lane) → open Captions (fallback card) → close and reopen the project (everything persists; a v2 project migrates). Jest green. Swift export extended (speed, filters, transitions, stickers, captions) and `transcribe` implemented, reviewed by reading.

## 2. Constraints (in addition to the parents')

- Preview approximations are explicit: a **"Preview"** tag is shown on the preview frame whenever the clip under the playhead has a filter or the playhead is inside a transition window. Speed, stickers, captions and all timing are exact in both engines.
- **Timeline length is not changed by transitions.** Output duration = Σ `clipDuration(c)` where `clipDuration = (trimEnd − trimStart) / speed`. Transitions overlap the *ends* of the two clips inside the export only.
- All time ↔ source conversions go through `outputToSource(clip, offsetInClip)` and `sourceToOutput(clip, sourceTime)` in `timeline.ts`. No other code divides or multiplies by `speed`.
- One **effects registry** (`src/editor/effects.ts`) lists filters, transitions and shapes; `modules/clipy-video/ios/Effects.swift` mirrors the ids, transition rules and shape paths; a Jest test pins the id lists and the SVG path strings so drift is caught.
- Stickers are overlays (same lane, gestures, timing, undo rules as text). Captions are text overlays with `kind: "caption"`.
- Speech recognition is on-device (`SFSpeechRecognizer`, `requiresOnDeviceRecognition = true` when supported), locale = device locale, permission requested once, cancellable. Cloud transcription is out of scope but the `transcribe` output shape is the contract it will reuse.
- Schema → `3`; v2 → v3 migration on load; newer versions rejected with the existing readable error.
- Speed range 0.25–4 (clamped); transition duration 0.3–1.0 s, capped at half the shorter adjacent clip's output duration; caption lines ≤ 40 characters and ≤ 3 s.
- Colors/spacing from `theme`; no One Piece content; Expo Go safe; TDD; `git add` specific paths; commit trailer unchanged.

## 3. Screens & Interactions

### 3.1 Toolbar
`Split · Trim · Speed · Filter · Transition · Text · Sticker · Captions · Music · Volume · Ratio · Duplicate · Delete`. Needs a selected clip: Split, Trim, Speed, Filter, Transition, Volume, Duplicate, Delete. Needs ≥ 1 clip: Text, Sticker, Captions. Always: Music, Ratio.

### 3.2 Speed sheet
Chips `0.25× · 0.5× · 1× · 1.5× · 2× · 4×` + a slider 0.25–4 (step 0.05) with the current value label. Applies `setClipSpeed(clipId, speed)` (slider via transaction). The clip strip shows a `2×`-style badge when speed ≠ 1 and its width follows `clipDuration`. Preview uses `player.playbackRate = speed` (and `preservesPitch = true`).

### 3.3 Filter sheet
Horizontal row of 8 tiles (`None, Warm, Cool, Vivid, Faded, Mono, Noir, Vintage`): each tile is the clip's first thumbnail with the filter's preview approximation layered on top, label below; the selected one is outlined. Tap → `setClipFilter(clipId, id)`. Button **Apply to all clips** → `setFilterForAllClips(id)`. Strips with a filter show a small `f` badge.

### 3.4 Transition sheet
Opened from the toolbar for the cut after the selected clip, or by tapping the cut marker between two strips. Chips `None · Fade · Dissolve · Slide · Zoom`; duration slider 0.3–1.0 s (max = min(1.0, half the shorter neighbour)). Applies `setTransition(clipId, { type, duration })` (slider via transaction). A diamond marker (`highlight`) is drawn centred on the cut when `type ≠ none`. The last clip's cut has no marker and the sheet is disabled for it ("No clip after this one").

### 3.5 Sticker sheet
Tabs **Emoji** / **Shapes**. Emoji: search field + grid (source: a bundled JSON list of emoji with keywords, ~1,800 entries, generated once from Unicode data and committed); a "Recent" row at the top, stored in an app-level `prefs.json` in the document directory (max 24 entries). Shapes: `circle, square, roundedBox, arrow, star, speechBubble, heart` tiles + a colour row. Picking inserts a sticker centred (`x 0.5, y 0.5`, `scale 1`) with `defaultOverlayRange`, selects it, closes the sheet. Double-tap on a selected sticker opens the **Sticker panel**: colour row (shapes only), size slider, Fine-tune (same fields as text), Duplicate · Delete.

### 3.6 Captions
Toolbar **Captions** → if native unavailable: card "Captions need the native build". Otherwise: if caption overlays exist → confirm "Replace existing captions?". Then a progress sheet "Transcribing clip 1 of 3…" with Cancel; per clip `transcribe(sourceUri, trimStart, trimEnd)` (native does the trimming by audio time range); segments are mapped to output time via `sourceToOutput`, merged into lines (≤ 40 chars, ≤ 3 s, split on pauses > 0.6 s), and added in ONE `apply` as `kind: "caption"` overlays with the **caption style** (`fontId: "montserrat"`, `fontScale: 0.045`, `color: #FFFFFF`, `background: { color: #000000, opacity: 0.6 }`, `outline: false`, `align: "center"`, `x: 0.5`, `y: 0.86`). A **Caption style** sheet (from the Captions button when captions exist) edits that preset and applies it to all captions. "No speech found" clips are skipped with a toast listing them.

### 3.7 Preview
- Filter: `FilterLayer` — a full-frame view over the video with `backgroundColor = tint @ tintOpacity`, plus a desaturation approximation (a grey overlay at `1 − saturation` opacity, `mixBlendMode` unavailable in RN → approximate with the grey layer) and brightness via a black/white layer. Rendered only for the clip under the playhead.
- Transition: `TransitionLayer` — black overlay whose opacity ramps 0→1→0 across `[cutTime − d/2, cutTime + d/2]`.
- "Preview" tag: top-left chip when either layer is active.
- Speed: `player.playbackRate`. Stickers: emoji via `Text`, shapes via `react-native-svg` `Path`. Captions: text overlays.

### 3.8 Export
Request gains per clip `speed`, `filter`, `transitionOut`; overlays gain `kind`, `emoji`, `shape`. Swift: `scaleTimeRange` for speed. Filters and transitions are rendered by a custom compositor: `videoComposition.customVideoCompositorClass = ClipyCompositor.self`, with a custom `AVVideoCompositionInstruction` type carrying, per time range, the source track id(s), the aspect-fill transform(s), the clip's filter id and, inside a transition window, the second track plus the transition type and progress. `ClipyCompositor` renders each frame with Core Image (filter chain, then the transition blend: fade = mix with black, dissolve = cross-fade, slide = incoming frame translated in from the right, zoom = outgoing scaled 1→1.2 while cross-fading) into the output pixel buffer. Transition windows use **two** composition video tracks (A/B alternating). The window is centred on the cut: `[cut − d/2, cut + d/2]`. The outgoing clip is extended by `d/2` past its `trimEnd` and the incoming clip by `d/2` before its `trimStart`, using source material outside the trims when it exists (the "handles"); where the source has no more material, the last/first frame is held (`AVVideoComposition` instruction with the frame repeated). The timeline length therefore stays Σ `clipDuration`, matching the preview's fade centred on the cut. The Core Animation tool (text/sticker layers) stays on top as in Phase 2. Text/sticker layers stay on the Core Animation tool. Emoji: `CATextLayer` with the system font (Apple Color Emoji renders automatically). Shapes: `CAShapeLayer` from the shared SVG path (parsed by a tiny path-command parser in Swift: M/L/C/Q/Z absolute commands only — the registry paths use only those).

## 4. Data Model (schema v3)

```ts
type FilterId = "none" | "warm" | "cool" | "vivid" | "faded" | "mono" | "noir" | "vintage";
type TransitionType = "none" | "fade" | "dissolve" | "slide" | "zoom";
type ShapeId = "circle" | "square" | "roundedBox" | "arrow" | "star" | "speechBubble" | "heart";

interface Clip { /* Phase 2 fields */ speed: number /* 0.25–4 */; filter: FilterId | null; transitionOut: { type: TransitionType; duration: number } }

interface TextOverlay { kind: "text" | "caption"; /* Phase 2 fields */ }
interface StickerOverlay { id; kind: "sticker"; emoji: string | null; shape: ShapeId | null; color: string; x; y; scale; rotation; start; end }
type Overlay = TextOverlay | StickerOverlay;

interface Project { /* ... */ overlays: Overlay[]; schemaVersion: 3 }
```
`makeSticker(partial)` factory; sticker base size: emoji font size `0.12 × frameH × scale`; shape box `0.2 × frameH × scale` square. Migration v2 → v3: `speed: 1`, `filter: null`, `transitionOut: { type: "none", duration: 0 }` normalised on every clip; overlays keep `kind: "text"`.

## 5. Modules

```
src/editor/model/types.ts            + FilterId, TransitionType, ShapeId, StickerOverlay, Overlay union, makeSticker, schemaVersion 3
src/editor/model/migrate.ts          + v2 → v3
src/editor/model/timeline.ts         clipDuration uses speed; outputToSource / sourceToOutput; clipAt returns offset in OUTPUT seconds (unchanged meaning)
src/editor/model/ops.ts              + setClipSpeed, setClipFilter, setFilterForAllClips, setTransition, addSticker, updateSticker, setCaptionStyleForAll, replaceCaptions; splitClipAt/trimClip/moveClip/deleteClip updated for speed + transition clearing
src/editor/model/captions.ts         mergeSegmentsIntoLines(segments, { maxChars: 40, maxSeconds: 3, pauseGap: 0.6 }) → lines; segmentsToOverlays(lines, clip, style)
src/editor/effects.ts                FILTERS (preview params + CI recipe listed for documentation), TRANSITIONS, SHAPES (SVG paths), CAPTION_STYLE default
assets/emoji.json                    [{ char, name, keywords[] }] generated once (script in scripts/gen-emoji.ts from unicode-emoji-json, committed output)
src/editor/components/SpeedSheet.tsx, FilterSheet.tsx, TransitionSheet.tsx, StickerSheet.tsx, StickerPanel.tsx, CaptionsSheet.tsx, CaptionStyleSheet.tsx
src/editor/components/FilterLayer.tsx, TransitionLayer.tsx, PreviewTag.tsx, StickerView.tsx (emoji Text / Svg Path)
src/editor/components/ClipThumbStrip.tsx   + speed and filter badges; Timeline.tsx + cut markers
src/editor/components/PreviewPlayer.tsx    + playbackRate, FilterLayer/TransitionLayer, speed-aware seek via outputToSource
src/editor/components/OverlayLayer.tsx     renders StickerView for kind "sticker"
src/editor/useCaptions.ts            drives transcribe per clip with progress + cancel
modules/clipy-video/index.ts         + transcribe(uri, trimStart, trimEnd): Promise<Segment[]>, cancelTranscribe(); request fields
modules/clipy-video/ios/Effects.swift, ClipyCompositor.swift, Transcriber.swift, ExportSession.swift (+speed/filters/transitions/stickers), ClipyVideoModule.swift (+transcribe)
app.json                             NSSpeechRecognitionUsageDescription + NSMicrophoneUsageDescription (Speech framework requires it even for files)
```

### 5.1 Ops (pure)
- `setClipSpeed(p, id, speed)` clamps 0.25–4; output duration must stay ≥ 0.1 s.
- `setClipFilter(p, id, filter | null)`, `setFilterForAllClips(p, filter | null)`.
- `setTransition(p, id, { type, duration })`: `duration` clamped to `[0.3, min(1, 0.5 × min(dur(clip), dur(next)))]`; `type none` → `duration 0`; last clip → no-op.
- `deleteClip`/`moveClip`: after the change, any clip whose `transitionOut` now targets a different neighbour keeps it (transitions belong to the cut after the clip); the **last** clip's transition is cleared.
- `splitClipAt` under speed: the cut maps through `outputToSource`; the left half keeps the transition `none`, the right half inherits the original's `transitionOut`; both keep `speed`/`filter`.
- `trimClip` unchanged in meaning (source seconds).
- `addSticker(p, sticker)`, `updateSticker(p, id, patch)` (shares `normaliseOverlay` timing/clamps; sticker `scale` 0.2–5), `deleteOverlay`/`duplicateOverlay`/`moveOverlay` work on the union.
- `replaceCaptions(p, captions: TextOverlay[])`: removes all `kind: "caption"` overlays and adds the new ones in one op. `setCaptionStyleForAll(p, style)` patches every caption's style fields.

### 5.2 Timeline math
```
clipDuration(c)          = (c.trimEnd − c.trimStart) / c.speed
outputToSource(c, off)   = c.trimStart + off × c.speed
sourceToOutput(c, s)     = (s − c.trimStart) / c.speed
```
Pinned tests at speeds 0.5, 1, 2 for `clipAt`, `clipStartTimes`, `splitClipAt`, `thumbTimes` (thumbnails sample source times `trimStart + k·interval·speed`), trim handles (`trimFromDrag` operates in source seconds; the strip width uses `clipDuration`).

### 5.3 Preview / export contract additions
```ts
transcribe(uri: string, trimStart: number, trimEnd: number): Promise<{ text: string; start: number; end: number }[]>  // source seconds
cancelTranscribe(): void
// ExportRequest clips: + speed, filter (string|null), transition: { type, duration }
// ExportRequest overlays: + kind ("text"|"caption"|"sticker"), emoji (string|null), shape (string|null)  (text fields nullable for stickers)
```
`Effects.swift` holds: filter id → CI chain (`warm`: CITemperatureAndTint +600, CIColorControls saturation 1.1; `cool`: −600; `vivid`: saturation 1.4, contrast 1.1; `faded`: saturation 0.7, brightness 0.08, contrast 0.9; `mono`: CIPhotoEffectMono; `noir`: CIPhotoEffectNoir; `vintage`: CISepiaTone 0.5 + CIVignette 1.0), transition rules (fade = to black; dissolve = cross-fade; slide = incoming from the right; zoom = outgoing scales 1→1.2 while cross-fading), and the shape SVG paths verbatim from `effects.ts`.

## 6. Error Handling

- Speed/transition/filter values are clamped by ops; unknown ids from corrupted files are treated as `none`/`null` on load (migration normalises).
- Deleting/moving clips clears a last-clip transition; changing speed re-caps the transition duration if needed.
- Captions: permission denied → explanation + Settings; no speech in a clip → toast listing those clips; native error → message; cancel → nothing added; Expo Go → fallback card.
- Stickers: unrenderable emoji → the glyph box iOS shows; shapes always render.
- Export: per-clip CI failures fall back to the unfiltered frame with a log warning; transition on a missing clip is skipped.

## 7. Testing

- **Jest unit:** 5.2 math (pinned), all 5.1 ops incl. clearing/capping rules and split-under-speed, `captions.ts` merging (long words, pauses, limits, empty), migration v2→v3 (+ idempotent, rejects v4), effects registry consistency (8 filters, 5 transitions, 7 shapes, non-empty paths using only M/L/C/Q/Z, preview params in range), emoji JSON loads and has ≥ 1000 entries with keywords.
- **Jest component:** each sheet dispatches the right op; Captions fallback card when native is unavailable; `PreviewTag` visibility rules; strip badges; cut marker presence.
- **Device checklist:** §1 "Done when" list + re-run of the Phase 1/2 checklists under a 2× clip (split, trim, overlays stay put).
- **Swift:** export test adds a 2× clip, a `warm` filter, a `dissolve`, an emoji sticker and a `heart` shape; asserts success and duration = Σ sped-up lengths ± 0.2 s. `Transcriber` is covered by the device checklist after the first EAS build (no bundled speech sample).

## 8. Out of Scope

Cloud transcription (reuses the `transcribe` contract later); keyframe animation; custom LUT filters; image stickers from the camera roll; direct posting (Phase 4).
