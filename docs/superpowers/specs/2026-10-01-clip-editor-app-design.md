# Clip Editor & Social Publisher â€” Design

**Date:** 2026-10-01
**Status:** Approved in brainstorming, pending written-spec review

## 1. Goal

Clipy is an iPhone app (CapCut-style) for editing short video clips and posting them to social media.

- **Platform:** iPhone only.
- **Audience:** personal use first; designed so it can later ship publicly on the App Store.
- **Social targets:** YouTube Shorts, TikTok, Instagram Reels, Facebook (Pages), X â€” plus the iOS share sheet as a universal fallback from day one.

## 2. Constraints

- Developer machine is **Windows** â€” no Mac. All iOS builds go through **Expo EAS Build** (cloud). Testing happens on a physical iPhone via an EAS development build.
- Requires a paid **Apple Developer account** ($99/year) for device installs via EAS and later App Store release.
- Direct posting to TikTok / Instagram / Facebook needs a client secret that cannot live in the app â†’ a small backend is required in phase 4.
- Each social platform has its own app-review process before posting on behalf of other users. In personal/developer mode we post only to the owner's own accounts.

## 3. Tech Stack

| Layer | Choice |
|---|---|
| App framework | React Native via **Expo** (TypeScript), dev client + EAS Build |
| Navigation | Expo Router |
| State | Zustand store holding the current project + undo/redo history |
| Storage | `expo-file-system` â€” one JSON file per project; imported media copied into app storage |
| Media picking | `expo-image-picker` / `expo-media-library` |
| Video engine | Custom **Expo native module in Swift** wrapping **AVFoundation** (AVMutableComposition, AVVideoComposition, Core Image filters, AVAssetExportSession / AVAssetWriter) |
| Auto-captions | Apple **Speech** framework (on-device `SFSpeechRecognizer`), inside the same Swift module |
| Sharing | iOS share sheet (`expo-sharing` / native `UIActivityViewController`) |
| Backend (phase 4) | Supabase (Edge Functions) for OAuth codeâ†’token exchange and token refresh |
| Tests | Jest (TypeScript logic, runs on Windows); XCTest for Swift module (runs in EAS cloud build) |

## 4. Architecture

```
iPhone App (Expo / RN, TypeScript)
â”œâ”€â”€ Screens (UI)          Projects Â· Editor Â· Export Â· Accounts
â”œâ”€â”€ Project Store         timeline JSON, persistence, undo/redo
â”œâ”€â”€ Native Video Module   Swift/AVFoundation: thumbnails, preview, export, transcribe
â””â”€â”€ Publish Module        share sheet + one adapter per platform
        â”‚ (phase 4)
        â–¼
Supabase backend          holds platform client secrets, exchanges/refreshes OAuth tokens
```

**Core principle:** the edit is a declarative **timeline description** (JSON). Source media is never modified. The Swift module consumes the timeline to (a) build a live preview player and (b) render the final `.mp4`.

**Boundaries:**
- TypeScript never touches pixels; Swift never touches UI state.
- Native module interface (the only bridge):
  - `getThumbnails(uri, count, size) â†’ string[]` (image URIs)
  - `getMediaInfo(uri) â†’ { duration, width, height, hasAudio }`
  - `PreviewView` native component, prop `timeline` + `currentTime`, events `onTimeUpdate`, `onEnd`
  - `exportTimeline(timeline, { resolution, fps }) â†’ jobId`; events `onExportProgress(jobId, 0..1)`, `onExportDone(jobId, fileUri)`, `onExportError(jobId, message)`; `cancelExport(jobId)`
  - `transcribe(uri, locale) â†’ [{ text, start, end }]`
- Publishing interface, one adapter per platform:
  - `PublishAdapter { id; connect(); disconnect(); isConnected(); publish({ fileUri, title, caption, privacy }) â†’ { postUrl? } ; limits: { maxDurationSec, maxFileSizeMB, aspectRatios } }`

## 5. Screens

1. **Projects** â€” grid of saved projects (thumbnail, name, duration, last edited); "New Project" opens multi-select camera-roll picker. Long-press to rename / duplicate / delete.
2. **Editor**
   - Top bar: back, undo, redo, Export.
   - Preview (native `PreviewView`) with play/pause and scrubber.
   - Timeline: horizontally scrolling, pinch-to-zoom; lanes for video clips, overlays (text/sticker/caption), and audio. Playhead fixed at center.
   - Bottom toolbar: Split Â· Trim Â· Speed Â· Filter Â· Text Â· Sticker Â· Music Â· Captions Â· Ratio Â· Transition Â· Volume Â· Delete.
3. **Export** â€” resolution (720p / 1080p / 4K, capped at source max), progress bar + cancel, then actions: Save to Photos Â· Share Â· Post toâ€¦ (phase 4).
4. **Accounts** (phase 4) â€” connect/disconnect each platform, shows connected account name.

## 6. Data Model

```ts
type AspectRatio = "9:16" | "1:1" | "16:9";

interface Project {
  id: string;
  name: string;
  createdAt: string;   // ISO
  updatedAt: string;
  aspectRatio: AspectRatio;
  clips: Clip[];               // played in order
  overlays: Overlay[];
  audioTracks: AudioTrack[];
  schemaVersion: 1;
}

interface Clip {
  id: string;
  sourceUri: string;     // file in app storage
  sourceDuration: number; // seconds
  trimStart: number;     // seconds into source
  trimEnd: number;
  speed: number;         // 0.25 â€“ 4
  filter: FilterId | null;
  volume: number;        // 0 â€“ 1 (original audio)
  transitionOut: { type: "none" | "fade" | "slide" | "zoom"; duration: number };
}

interface Overlay {
  id: string;
  kind: "text" | "sticker" | "caption";
  start: number;         // seconds on the output timeline
  end: number;
  x: number; y: number;  // normalized 0â€“1 center position
  scale: number; rotation: number;
  text?: string; font?: string; color?: string; background?: string | null;
  stickerId?: string;
}

interface AudioTrack {
  id: string;
  sourceUri: string;
  start: number;         // position on output timeline
  trimStart: number; trimEnd: number;
  volume: number;
}
```

- Clip output duration = `(trimEnd - trimStart) / speed`.
- Timeline operations are pure functions in TypeScript (`splitClip`, `trimClip`, `moveClip`, `setSpeed`, `addOverlay`, â€¦) returning a new `Project` â€” this is what undo/redo snapshots and what Jest tests cover.
- Undo/redo: in-memory stack of the last 50 project states.
- Persistence: one `projects/<id>/project.json` + `projects/<id>/media/` per project. Writes are atomic (write temp file, then rename). Autosave on every change (debounced 500 ms).
- Auto-captions: `transcribe` per clip â†’ mapped to output-timeline times â†’ inserted as `caption` overlays (editable like text).

## 7. Phases

| Phase | Scope | Done when |
|---|---|---|
| **0. Setup** | Expo project, EAS dev build on iPhone, empty native module, Jest | App installs on iPhone and calls a native "hello" function |
| **1. Editor core + share** | Projects list, import, timeline UI, split/trim/reorder/delete, aspect ratio, preview, export 720p/1080p/4K, Save to Photos, share sheet | Can make a multi-clip vertical edit and post it via share sheet to any app |
| **2. Text & audio** | Text overlays (fonts/colors/position/timing), music import (Files app + bundled tracks), clip volume, mute | Exported video shows timed text and mixed music |
| **3. Effects** | Filters (Core Image presets), speed 0.25Ã—â€“4Ã—, transitions, stickers/emoji, auto-captions | All effects appear correctly in preview and export |
| **4. Direct posting** | Supabase backend; adapters in order: YouTube â†’ TikTok â†’ Instagram + Facebook (Meta Graph API) â†’ X | Can post an exported video directly to each connected account |

Each phase gets its own implementation plan.

## 8. Error Handling

- **Import:** unreadable/unsupported files skipped with a message; others still import. iCloud-only assets downloaded with progress.
- **Export:** progress + cancel; pre-check free disk space; on failure delete the partial file, leave the project untouched, show the error.
- **Persistence:** atomic writes; on launch, a corrupted project file is reported and skipped rather than crashing the list.
- **Permissions:** Photos, microphone, speech recognition â€” on denial, explain why and offer a link to Settings.
- **Publishing:** retry on failure; keep exported file until a post succeeds; expired tokens trigger reconnect; validate against adapter `limits` before uploading; show platform error text verbatim.

## 9. Testing

- **Jest (Windows, no device):** all timeline operations, duration math, overlay timing after split/speed changes, undo/redo, project save/load/migration, publish-adapter request building (with mocked fetch).
- **XCTest (EAS cloud build):** export a known timeline from bundled sample clips; assert output duration, resolution, audio track presence.
- **Manual device checklist per phase** (e.g. phase 1: import 3 clips, split one, reorder, set 9:16, export 1080p, verify in Photos, share to another app).

## 10. Out of Scope (for now)

- Android, web, desktop.
- Cloud sync of projects between devices.
- Scheduled posting, analytics, multi-user accounts.
- App Store submission and each platform's public app review (done after phase 4, when going public).
