# CapCut group G — Polish (export options, cover, snapping, multi-select): design

**Date:** 2026-10-04
**Status:** Approved by the user 2026-10-04
**Builds on:** schema v12 (blend, green screen, region effects)

## 1. What the user gets

1. **Export options:** frame rate 24 / 30 / 60 and quality High / Smaller file beside the resolution choice, remembered per project.
2. **Cover:** pick the frame that represents the video, put a short title on it, save it to Photos; the drafts list shows it; Instagram uses that frame as the Reel's cover.
3. **Snapping:** bars on the timeline click onto the playhead, clip cuts, other bars' edges and beat markers while they are moved or trimmed.
4. **Multi-select:** select several main clips and delete, duplicate, filter, speed-change or change the volume of all of them in one step.

Preview: everything in this round is visible in Expo Go except the export itself (Swift, uncompiled).

Out of scope: cloud sync, CapCut-style full-edit templates, a snapping on / off switch, uploading a cover image to any platform, multi-select of layers / text / audio / effects.

## 2. Data model — schema v13

```ts
export const SCHEMA_VERSION = 13 as const;
export const EXPORT_FPS = [24, 30, 60] as const;
export type ExportFps = (typeof EXPORT_FPS)[number];
export const EXPORT_QUALITIES = ["high", "small"] as const;
export type ExportQuality = (typeof EXPORT_QUALITIES)[number];
export interface ExportSettings { fps: ExportFps; quality: ExportQuality }
export const DEFAULT_EXPORT_SETTINGS: ExportSettings = { fps: 30, quality: "high" };
export interface Cover { time: number; title: string }   // project seconds; title may be ""
export const COVER_LIMITS = { titleMax: 40 };
// Project gains:
exportSettings: ExportSettings;   // default { fps: 30, quality: "high" }
cover: Cover | null;              // default null = the first frame, no title
```

The resolution stays what it is today — screen state of the export screen (1080p each time it opens); only the two new choices are stored.

Migration v12 → v13 adds the defaults. Sanity pass (every load):

- `exportSettings`: an fps not in `EXPORT_FPS` → 30; a quality not in `EXPORT_QUALITIES` → "high"; not an object → the default.
- `cover`: not an object, or `time` not a finite number → `null`. Otherwise `time` is rounded to 3 decimals and clamped to `[0, project length]`; `title` is trimmed, cut to 40 whole characters (code points) and trimmed again (so a cut never leaves a trailing space); a title that is not a string → `""`.

Helpers in `src/editor/model/timeline.ts`:

- `coverTimeOf(p)` — the cover's project time **as read**: 0 without a cover, else the stored time clamped to `[0, totalDuration(p)]`. Clip edits never rewrite the stored cover; a time left beyond the end after clips are deleted is clamped here.
- `frameAt(p, time)` — `{ clip, sourceTime } | null`: the main clip and the source second shown at a project time (a photo: 0). The time is first clamped to `[0, total − LAST_FRAME_SLACK]` (`LAST_FRAME_SLACK = 0.05`) so the very end still gives a real frame.

## 3. Export options

- **The default is exactly today's export.** 30 fps + High sends `fps: 30, bitrate: 0`, and with those values the Swift runs the code path it runs today: the frame duration is `CMTime(1, 30)` as before and **no file-length limit is set**. High never sets a limit at any frame rate. Only "Smaller file" uses the new, untested limit.
- `src/export/estimate.ts` owns the numbers: `exportBitrate(res, settings)` = `BITRATE_MBPS[res] × 1e6 × FPS_BITRATE_FACTOR[fps] × QUALITY_BITRATE_FACTOR[quality]`, rounded, in bits per second, with `FPS_BITRATE_FACTOR = { 24: 0.9, 30: 1, 60: 1.5 }` and `QUALITY_BITRATE_FACTOR = { high: 1, small: 0.6 }`. `estimateBytes(duration, res, settings)` = `duration × exportBitrate / 8`; the free-space check and the "Estimated size" line use it. So High shows today's estimate (times the frame-rate factor) and Smaller file shows the capped estimate (60 % of it). `requestBitrate(res, settings)` is what the request carries: `0` for High, `exportBitrate(res, settings)` for Smaller file.
- The request gains `fps` and `bitrate` (`requestBitrate`). Swift: the video composition's frame duration is `CMTime(1, fps)` (an fps outside 24 / 30 / 60 → 30).
- **Smaller file.** The engine exports with `AVAssetExportSession` (it needs the Core Animation tool for text and stickers, which an `AVAssetWriter` pipeline cannot use), and that class has no bitrate setting. The nearest control is `fileLengthLimit`: when `bitrate` is above 0 the engine sets it to `(bitrate + 256 000 audio) × seconds / 8` bytes, which makes the session lower its bitrate to fit. It is a ceiling, not a target: a video that is naturally smaller is unchanged. `bitrate` 0 → the property is never touched. One Swift constant (`ExportSession.limitsFileLength`) switches the limit off for Smaller file too, if the first build shows it misbehaving.
- Text / sticker motion is still sampled 30 times a second at every frame rate (Core Animation interpolates between samples).
- The settings are **not** undo steps (like post records): changing them in the export screen writes the project directly and survives undo / redo.

## 4. Cover

- **Entry point:** a `Cover` tool at the end of the Edit group; needs no selection; disabled for an empty project.
- **Cover sheet:** a preview of the chosen frame in the project's aspect ratio with the title drawn over it; a time slider over the whole project (0 … length, step 0.1 s); a title field (max 40 characters, counter "12 / 40"); **Done** (saves time + title as one undo step and closes), **Save to Photos**, **Reset** (back to no cover: first frame, no title — one undo step). Closing the sheet any other way discards the draft.
- **Frame:** `frameAt` → a photo shows the image itself; a video uses the thumbnail helper (`getThumb`, half-second buckets) while the slider moves and a full-quality still (`getStill`) once it rests. A missing file shows an empty box.
- **Title style (fixed):** UI title font (`theme.fonts.title`), `theme.colors.text`, centred, at most two lines, font size 7 % of the preview's height, sitting at the bottom over a transparent → `theme.colors.scrimStrong` gradient. No title → no gradient.
- **Save to Photos:** `react-native-view-shot` `captureRef` of the preview view (JPEG, 1080 px wide) → `expo-media-library/legacy` `saveToLibraryAsync`, asking for add-only permission first. The package is included in Expo Go for SDK 57 and installs with `npx expo install react-native-view-shot` (checked in the v57 docs). Any failure (permission refused, capture failed, module missing) shows one line in the sheet and nothing else happens.
- **Drafts list:** when the editor closes, the cover frame is written to `projects/<id>/cover-<ms>.jpg` (older cover files of that project removed; no cover → none kept). The list shows that file when the project has a cover (else today's `thumb.jpg`) and draws the cover title on the card above the name.
- **Posting:** the cover time (milliseconds, clamped to the exported length) travels to the Post screen as a route parameter and is sent only to **Instagram**, as `thumb_offset` on the Reels container (`options.thumbOffsetMs`). The other four adapters cannot take a frame offset in the flow Clipy uses (TikTok's `video_cover_timestamp_ms` belongs to Direct Post; Clipy uses the inbox upload — YouTube needs an image upload — Facebook Reels and X have no documented offset), so they get nothing. A post from "Post a video" on the home screen has no project and sends no offset.

## 5. Snapping — `src/editor/model/snap.ts`

Pure functions, project seconds:

- `snapTargets(p, playhead, excludeId)` → sorted, de-duplicated times: 0, the project's end, the playhead, every main clip boundary, and the start and end of every overlay, audio track, layer and effect — except the item whose id is `excludeId` (the bar being dragged) — plus the beat markers.
- `clipSnapTargets(p, playhead)` → the playhead and the beat markers only (main-clip trims).
- `snapTime(t, targets, threshold)` → `{ time, target }`: the nearest target within `threshold` (inclusive; a tie goes to the earlier one) or `{ time: t, target: null }`.
- `snapMove(start, duration, targets, threshold)` → `{ start, target }`: both edges are tried, the nearer snap wins (a tie goes to the start edge).
- `snapThreshold(pps)` = `SNAP_POINTS / pps` with `SNAP_POINTS = 8`.

Applied to moving and trimming text / sticker pills, audio bars, layer bars and effect pills, and to trimming main clips. Which edge snaps is always the edge that moves on screen:

| Gesture | Edge that snaps |
|---|---|
| move (any bar) | start or end, whichever is nearer a target |
| pill / effect start handle, layer start handle | the bar's start |
| pill / effect / layer end handle | the bar's end |
| audio start handle (the bar's start stays; its end moves) | the bar's end |
| audio end handle | the bar's end |
| main clip, either trim handle (the track ripples) | the clip's end on the timeline |

One light haptic when a snap is entered (not while it is held, not when it is left); a thin gold vertical line across the timeline at the snapped time while the gesture is active. Always on. Targets are read once when the gesture starts. A main-clip trim that snaps is not rounded to 0.1 s (today's handle rounding would pull it off the target); an unsnapped one rounds as today.

## 6. Multi-select (main clips)

- Store: `multiSelect: string[] | null` (null = not in the mode), with `enterMultiSelect`, `toggleMultiSelect(id)`, `selectAllClips`, `exitMultiSelect`.
- **Entering:** a `Select` tool in the Edit group, enabled when the project has two or more clips. Entering clears every selection; if a main clip was selected it becomes the first selected clip.
- **In the mode:** tapping a clip on the timeline toggles it (gold border, no seek); the toolbar is replaced by an action bar — "N selected", Delete, Duplicate, Filter, Speed, Volume, Select all, Done.
- **Leaving:** Done; selecting anything else (a text, an audio bar, an effect, a layer); leaving the editor; and any project change after which none of the selected clips exists (ids that disappear are dropped from the list; an empty list ends the mode — so Delete ends it).
- **Ops, one undo step each:** `deleteClips(p, ids)` and `duplicateClips(p, ids)` (each copy right after its original, same rules as the single op); Filter / Speed / Volume open the existing sheets with a `clipIds` list: the sheet shows the first selected clip's values and writes every change to all selected clips through `forClips(p, ids, op)` inside one `apply` / one slider transaction. Photos are skipped by Speed and Volume exactly as the single ops skip them.
- Deleting every clip is allowed, because the single Delete allows it (an empty project is a supported state).

## 7. Screens

- **Export screen:** three chip rows — Resolution (as today), Frame rate (`24 fps`, `30 fps`, `60 fps`), Quality (`High`, `Smaller file`) — then the estimated size.
- **Edit tools:** `…, duplicate, delete, select, ratio, cover`.
- **Timeline:** the snap guide line; clips toggle in select mode.
- **Drafts list card:** cover frame and cover title.

## 8. Testing

Model: migration and sanity pass, `coverTimeOf` / `frameAt`, `snap.ts` (hand-computed vectors), the multi-clip ops, store rules. Export: bitrate table, request fields, Swift constants by source-reading parity test + XCTests for the two pure helpers. Components: export chips, cover sheet, storage cover file, card, each bar's snapping gesture (one haptic per snap, guide on / off, one undo step), action bar and the three sheets in `clipIds` mode. Server: Instagram `thumb_offset`.

## 9. Risks

- `fileLengthLimit` is the only bitrate lever on `AVAssetExportSession` and is unverified here: it may be approximate or misbehave. It is used only by "Smaller file"; the default (High) export never sets it, so the default path is today's. First-build check; `limitsFileLength` is the off switch.
- A 60 fps export doubles the compositor's work; sources are still mostly 30 fps (frames repeat).
- The saved cover image is a screen capture scaled to 1080 px wide, not a render of the export engine: filters, effects, layers and text overlays of the project are not on it.
- `thumb_offset` is documented by Meta in milliseconds; never sent live yet.
- Snap targets are fixed at gesture start; a bar pushed against a limit (time 0, the project's end) can show the guide while the op has clamped it short of the target.
