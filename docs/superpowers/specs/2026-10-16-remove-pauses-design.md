# Remove pauses — cut the quiet out of a talking clip (design)

Date: 2026-10-16. Branch: `remove-pauses` (from `next-build`). Status: approved by the owner from a drawing; this spec fixes the details.
Plan: `docs/superpowers/plans/2026-10-16-remove-pauses.md`.

## 0. What the owner gets

1. Select a VIDEO clip on the main track → the bar's **Edit** group starts with **Remove pauses** (`pause-circle-outline`, drawn as the SF Symbol `waveform.badge.minus`).
2. It opens an inline strip (the kit `ToolStrip`, `STRIP` heights unchanged) titled **Remove pauses**, with the tick (`DoneButton`). Three rows of `STRIP.slider` (36 pt) each — exactly the strip's 108-pt body:
   - **Cut pauses longer than** — three compact chips **0.3 s** / **0.6 s** (default) / **1 s**;
   - **What counts as quiet** — **Silent** / **Quiet** (default) / **Noisy Room**;
   - the status line — "Listening…", "6 pauses found · 8.4 s shorter", "No pauses found", or one plain sentence — and, ONLY when at least one pause is found, the white main button (`PrimaryButton tone="plain" compact`) **Remove 6 Pauses** / **Remove 1 Pause**.
3. While the strip is open, the stretches that would go are SHADED on the selected clip in the timeline (plain views, no touches, nothing animated).
4. A chip re-computes at once from the outline already heard — no new listening. The chips' choice is remembered for the session (memory only).
5. **Remove**: the clip becomes several clips with the pauses gone — ONE undo step. The strip closes, then the message bar says **6 pauses removed** (or **1 pause removed**) with **Undo**.
6. A little sound (0.1 s of the file) is kept each side of a cut so words are not clipped. Text, stickers, captions, music, sounds, effects already inside the project, layers and beat markers do NOT move (as Cut to beats). Nothing is ever listened to or cut on load or by itself: listening starts when the owner opens the strip; cutting only on the tap.

Out of scope (this version): layers, photos, reversed clips, clips with a speed ramp, a clip whose sound is on its own bar (Extract audio, Voice / Sound on a clip), moving text or sounds with the cut, a cross-fade of the sound at the joins, a preview that plays without the pauses before Remove.

## 1. What exists (read on this branch)

- `soundPeaks({ jobId, uri, from, to, count })` → `{ peaks, from, to }` (`modules/clipy-video/index.ts:259-261, 405-409`; `SoundPeaks.swift`): opens ANY file with `AVURLAsset`, takes its FIRST audio track (`loadTracks(withMediaType: .audio)`, `SoundPeaks.swift:150-156`), so a video file works; fails `peaks source: this file has no sound` when there is none; clamps `from` / `to` to the file and `count` to 16 … 2000; each value is the largest |sample| of the mono mix in its slice, as a Double 0 … 1 (full precision — `SoundPeaks.swift:263-270`); cancel = `E_PEAKS_CANCELLED`. Gate: `isPeaksAvailable()` — the "icons and light" build, already a row of `LEVELS`.
- `src/editor/soundPeaks.ts` is the only caller (AGENTS.md, Waveforms). One native call at a time (`running`, `answered`: `PEAKS_DEADLINE_MS` 30 s, `PEAKS_CANCEL_GRACE_MS` 2 s, a late answer dropped); the waveform loop (`pump`) asks only while the editor stands still (`idle`); `syncPeaks` cancels a running call for a file no bar draws; `resetPeaks` (leaving the editor) cancels and bumps `epoch`.
- `peaksPlan` / `assemblePeaks` / `Peaks` (`src/editor/model/peaks.ts`): one outline per FILE at 50 slices a second, stored as BYTES (`byte()`: 0 … 255, linear) and cached on disk as hex.
- `splitClipAt` (`src/editor/model/ops.ts:39-69`), the split rules this tool follows: the LEFT half keeps the id, the animation's In, the sound's fade in, `fadeOut: 0` and gets `transitionOut: NO_TRANSITION`; the RIGHT half gets a new id, the Out, the fade out, `fadeIn: 0`, keeps the clip's `transitionOut`, gets its own copies of `adjust` / `chroma`; a Combo stays on both; every keyframe pin stays on both (pins are in SOURCE time); everything else (`filter`, `volume`, `muted`, `transform`, `crop`, `background`, `opacity`, `mask`, `blend`, `cutout`, `stabilize`, `smooth`) by the spread. Then `normaliseTransitions` re-caps every cut (`ops.ts:569-581`) and `touch` drops effects stranded past the end (`fitEffects`).
- `cutToBeats` (`src/editor/model/beats.ts:115-131`): the model of a one-step multi-clip edit: pure, same project when nothing changes, text / layers / sounds / markers stay at their project times.
- `timeline.ts`: `clipDuration`, `sourceToOutput`, `sourceAfter`, `spanTooShort`, `hasSpeedCurve` — the only code that multiplies / divides by `speed` (AGENTS.md, Effects registry line).
- Cut-out and steady copies are found by COVERING, not by name (`coveringCopy`, `cutout.ts:112`; `coveringSteady`, `steady.ts:121`): a piece whose trim lies inside the original clip's trim (+ its transition handles) is served by the copy the clip already had — ready, or busy (`knownCopies`). Verified: the copies keep the source's timeline, so a piece needs no new render.
- `extractedTrackOf(p, clipId)` (`ops.ts:465-480`): the bar that already holds a muted clip's sound.
- `contextFor` (`toolbarContext.ts`), `TOOL_META` / `GROUP_OF` (`toolGroups.ts`), `StripId` (`toolStrip.ts`), the strips mounted at the end of `EditorToolbar.tsx` (`:440-465`), the handlers map (`:330-372`).
- `ToolStrip` (`src/ui/ToolStrip.tsx`): header 44 + body 108 (`STRIP.tiles` 72 + `STRIP.slider` 36); `StripSlider`'s label column is 124 pt.
- Kit `Chip` (`compact`: 28 pt, 12-pt semibold label, `fit` by default — the app's own words), `PrimaryButton` (`compact`: 36 pt; `tone="plain"`: test id `main-button`).
- The message bar: `useToast.getState().show(message, { kind: "done", undo: true })`; it goes when a tool opens or closes, so "close first, say second".
- `ClipThumbStrip.tsx`: the clip's box (`borderWidth: 2`, `overflow: "hidden"`), badges on `scrimStrong`.
- `NEEDS_LATEST_BUILD(what)` (`src/lib/buildInfo.ts`).

## 2. Decisions

### 2.1 No new native code, no `LEVELS` row
The outline is the existing native `soundPeaks` on the clip's ORIGINAL `sourceUri`, over its trimmed source range `[trimStart, trimEnd]`. A Voice / Sound copy is never listened to (there is none on a clip: a clip with a sound setting has its sound on its own bar, which is refused, §2.4). Gate: `isPeaksAvailable()`. Without it (Expo Go, an older build) the strip opens, the status line says `PAUSES_TOOLS` = `NEEDS_LATEST_BUILD("Remove pauses and sound outlines")` ("Remove pauses and sound outlines need the latest Clipy build. Install it from the newest build link."), nothing is asked of the phone, and there is no Remove button.

### 2.2 The listening — in `soundPeaks.ts`, sharing its one call at a time
- `soundPeaks.ts` stays the ONLY caller of `soundPeaks` / `cancelSoundPeaks`. Every native call — a waveform's or a pause's — now goes through ONE turn (`takeTurn(urgent)` / `giveTurn()`): never two calls at once. A pauses call is URGENT: among the calls WAITING for the turn it goes first; it never cancels or interrupts a waveform call that already runs (the longest such call reads 200 s of sound). Pauses calls do NOT wait for the editor to stand still (the owner asked); the waveform loop still does.
- `listenForPauses({ uri, from, to })` → `{ status: "ready", outline } | { status: "failed", reason } | { status: "stopped" }`. One listening at a time: a second ask for the same source joins the first; an ask for another source stops the first. `stopPauses()` stops it (cancel + grace, as today) and a late answer is dropped. The strip calls `stopPauses()` when it closes (the tick, another selection — the strip closer —, Export, a Remove) and `resetPeaks()` (leaving the editor, another project) stops it too. `syncPeaks` cancels only a WAVEFORM call for a file no bar draws, never a pauses call.
- Each call has the existing `PEAKS_DEADLINE_MS` (30 s; one call reads at most 20 s of sound here) and `PEAKS_CANCEL_GRACE_MS`. As today, a call given up after its grace may still be running natively when the next one starts; this is the existing waveform behaviour, not new.
- Failures: `"build"` (no function), `"tooLong"` (over `PAUSES.longest`), `"noSound"` (the phone's `this file has no sound`), `"failed"` (anything else, logged as `pauses failed <message>`). A failure is NOT remembered: opening the strip again listens again.

### 2.3 Density, length limit and memory
- `PAUSES.perSecond` **100** slices a second (10 ms — a syllable is 100–300 ms, a pause worth cutting ≥ 300 ms, so a cut edge is placed to 10 ms), in consecutive calls of at most `PAUSES.perCall` **2000** slices (20 s of sound each), at most `PAUSES.calls` **30** calls.
- `PAUSES.longest` **600** source seconds (10 minutes) of trimmed clip: a longer clip is not listened to; the line says "Remove pauses works on clips up to 10 minutes. Trim or split this clip first." (Stabilize's wording.) 600 s = 60 000 slices = 30 calls; a 3-minute talk is 9 calls.
- The outline is remembered FOR THE SESSION in memory only, by `pauseKey` = `uri|from|to|perSecond`, at most `PAUSES.remember` **8** outlines (the oldest goes; 60 000 floats = 240 KB at most each). Never in the project, never in undo, never on disk. Why not cached like the waveforms: (1) the waveform cache stores BYTES (linear 0 … 255): its smallest step is −48 dB of full scale, too coarse for a −45 dB line under a quiet recording's loudest moment — pauses need the floats; (2) it is one clip's TRIM at 100 a second, not a file at 50 — a new file per trim would need its own name scheme and sweep; (3) listening is quick (seconds) and happens only on a tap, so the saving is small.

### 2.4 Which clips
- The tool is on the bar (`contextFor`) for a MAIN clip that is a video (`!isPhoto`), not reversed, has NO speed curve (`!hasSpeedCurve`), and whose sound is NOT on its own bar (`extractedTrackOf(p, id) === null`) — each a lasting reason, so the tool is left out, never greyed (AGENTS.md, Toolbar). Not on a layer's bar, a photo's, a reversed clip's, a ramped clip's.
- Why: a layer's pieces would need their own starts (later); a photo has no sound; a reversed clip plays its source backwards (the cuts would need mirroring); a ramp makes "0.6 s" mean different source lengths along the clip and `removePauses` would have to split a curve; a clip whose sound was extracted would be cut while its sound bar plays on — out of sync.
- A constant speed is fine: the chips' seconds and the minimum piece are OUTPUT seconds (what is heard and what the timeline shows), turned into source seconds ONLY through `sourceAfter` (timeline.ts) in `pauseOptions`; the shading and the "shorter" figure go through `sourceToOutput`. Nothing new multiplies or divides by `speed`.
- A muted (not extracted) clip may be cut: the file's sound is what is listened to.
- Cut-out (Remove background), Stabilize and Smooth slow motion stay on every piece; every piece is served by the copy the clip already had (§1, covering). Only if that copy had failed (no copy known) would each piece ask for its own — accepted.

### 2.5 The maths — `src/editor/model/pauses.ts` (TypeScript only, pure, imports only TYPES from `./peaks`)
Constants (`PAUSES`): `perSecond` 100, `perCall` 2000, `fewest` 16, `calls` 30, `longest` 600, `remember` 8, `pad` 0.1, `minCut` 0.05, `minPiece` 0.3, `blip` 0.02, `floor` 0.001, `maxCuts` 60.
Choices: `PAUSE_GAPS` short 0.3 / medium 0.6 / long 1 (output seconds); `PAUSE_QUIET` silent −45 / quiet −35 / noisy −25 dB; defaults medium + quiet.

`pausePlan(from, to)` → the calls (as `peaksPlan`, over the clip's range): `null` when the range is not a positive finite span or longer than `longest`; else `max(fewest, round(span × perSecond))` slices in `ceil(total / perCall)` consecutive calls, the last ending exactly at `to`.

`assemblePauseOutline(plan, answers)` → `{ from, to, levels: Float32Array }` or null (answers that are not the plan's): every slice looked up at ITS OWN TIME in the stretch the phone says it read (`assemblePeaks`'s rule), a value outside it or not a number is 0, values clamped 0 … 1, NOT quantised.

`findPauses(outline, { minGap, minPiece, pad, quietDb })` (all seconds of SOURCE) → `{ cuts: [from, to][], silent }`:
1. `top` = the loudest slice. `top < floor` (−60 dB of full scale) → `{ cuts: [], silent: true }` ("This clip is silent."). Never cut a whole clip.
2. The quiet line = `max(floor, top × 10^(quietDb / 20))`: relative to the clip's OWN loudest moment, so a quietly recorded voice works as a loud one does. Silent −45 dB: only near-digital silence (a phone mic in a quiet room sits around 40–50 dB under speech peaks); Quiet −35 dB (default): room tone and breaths under normal speech; Noisy room −25 dB: a hum, traffic or a café under the voice — 10 dB steps, each chip clearly different. The value per slice is a PEAK, not an average, so noise reads higher than its loudness; that is why the lines are lower than a loudness meter's habits. A slice is quiet when its value is under the line (a value that is not a number is 0).
3. Blips: a loud run of at most `blip` (0.02 s — two slices) with quiet on BOTH sides counts as quiet (a click, a tap of the mic).
4. A quiet run at least `minGap` long is a PAUSE (the chip's words: "Cut pauses longer than 0.6 s" — a 0.7-s silence is cut). Its cut is the run less `pad` on each side that touches sound; a run that starts at the clip's start or ends at its end is cut to that edge (no pad there: leading and trailing silence goes). A cut shorter than `minCut` after padding is dropped. Inner edges are rounded to the millisecond; the clip's own edges are kept exactly.
5. Pieces: walking left to right, a cut is kept only if the piece of sound before it (since the last kept cut, or the clip's start) is at least `minPiece` — or empty (a leading cut); otherwise it is dropped and that piece joins the next. Then while the LAST piece is shorter than `minPiece` (and not empty), the last kept cut is dropped. So no piece is shorter than `minPiece` (0.3 s heard, three times `MIN_CLIP_SECONDS`) unless the clip itself is, and never a second of sound is removed to merge.
6. At most `maxCuts` (60): if more, the 60 LONGEST cuts are kept (ties: the earlier), in time order. Dropping a cut only lengthens pieces, so step 5 still holds.
Vectors pinned in `src/editor/model/__tests__/pauses.test.ts` (§7).

### 2.6 The op — `removePauses(p, clipId, cuts)` in `ops.ts`
Pure; `p` itself (no undo step) when: the id is not a main clip; a photo, reversed or ramped clip; no cut or more than `maxCuts`; a cut not finite, empty, out of order, overlapping or outside the trim (1 µs slack); no piece left; any piece `spanTooShort(clip, a, b, MIN_CLIP_SECONDS)`. Else the clip is replaced IN PLACE by its kept ranges, split semantics (§1):
- the FIRST piece keeps the clip's id (so the selection stays on it), the In, the fade in; the LAST piece gets the Out, the fade out and the clip's `transitionOut`; every piece but the last `transitionOut: none`, every piece but the first `fadeIn: 0`, every piece but the last `fadeOut: 0`; middle pieces neither In nor Out; a Combo on every piece; every keyframe pin copied to every piece (source time); own copies of `adjust`, `chroma`, `transform`, `crop`, `background`; new ids by `newId()`. One kept range (only leading / trailing quiet cut) = the clip trimmed, keeping everything.
- The transition INTO the clip (the previous clip's `transitionOut`) stays and is re-capped against the first piece by `normaliseTransitions` — and dropped, as after any trim, when half the first piece is under `TRANSITION_LIMITS.min` (0.3 s); between new pieces there is none.
- `touch` drops effects stranded past the new end (`fitEffects`), as every clip edit does. Overlays, layers, audio tracks and beat markers are untouched.

### 2.7 The strip — `RemovePausesSheet.tsx`
- `StripId` gains `"pauses"`; `EditorToolbar` opens it (`openStrip("pauses")`) and mounts it with the other strips. `TOOL_IDS` gains `"pauses"` (after `"stabilize"`); `TOOL_META.pauses = { label: "Remove pauses", icon: "pause-circle-outline" }`; `contextFor` lists it right after Stabilize, so with `GROUP_OF.pauses = "edit"` it is the FIRST tool of the Edit group (deliberate: Basics is full at eight; Edit is where cutting tools live — Freeze, Reverse, Replace).
- Layout (in the 108-pt body; no layout number changes): each choice row is `STRIP.slider` high — a label column `PAUSE_LABEL_WIDTH` 88 pt (`Body`, `theme.type.micro`, muted, two lines at most, no `fit`), then the three compact chips with `theme.space.xs` between them in a horizontal `ScrollView` (on a 375-pt phone the row fits — about 324 of 327 pt for the second row; at a larger text size it scrolls instead of clipping). The third row: the status line (`Body` small, muted, `flex: 1`, one line while the button shows, two lines without it, NO `fit` — a sentence) and the compact white button.
- Chip labels are title style (Casing): **0.3 s**, **0.6 s**, **1 s**, **Silent**, **Quiet**, **Noisy Room** (the drawing's "Noisy room" written by the casing rule); VoiceOver labels "Longer than 0.3 seconds" … and the quiet ones as written.
- Status (first that applies): `PAUSES_TOOLS` (no function) → "The file of this clip is missing." → "Remove pauses works on clips up to 10 minutes. Trim or split this clip first." → "Listening…" → "This clip has no sound." → "Could not listen to this clip. Close and open Remove pauses to try again." → "This clip is silent." → "No pauses found" → "6 pauses found · 8.4 s shorter" / "1 pause found · 0.6 s shorter" (the output seconds removed, one decimal).
- The button exists only with at least one cut, and only for the outline of the clip's CURRENT trim (`outline.from === trimStart && outline.to === trimEnd`; a trim made meanwhile listens again). Title `Remove ${n} Pauses` / "Remove 1 Pause".
- The tap: `removePauses` on the store's project → same project ⇒ "Nothing was removed." (`kind: "problem"`), no step; else `haptic("medium")`, `apply(() => next)` (ONE step), `onClose()` (closes the strip), then `show("6 pauses removed" | "1 pause removed", { kind: "done", undo: true })`.
- The choice is `usePauses.choice` (`src/editor/pauseFind.ts`, a zustand store in memory): the session's, never the project's.

### 2.8 The shading — `pauseShades` in `timelineMarks.ts`
`pauseShades(clip, cuts, pps)` → `{ x, width }[]` in points from the clip's left edge: each cut through `sourceToOutput` and `timeToX`, clipped to the clip, at least `PAUSE_SHADE.thinnest` 2 pt wide, at most `PAUSE_SHADE.most` 60 (= `maxCuts`). The strip writes `usePauses.shades = { clipId, cuts }` while it is open with cuts and clears it when it closes; `ClipThumbStrip` reads ONE selector (`shades.clipId === clip.id ? shades.cuts : null`, a stored array — every other clip renders nothing new) and draws each shade as a plain `View` (`testID="pause-shade"`, `pointerEvents="none"`, absolute, full height, `theme.colors.scrimStrong`), after the thumbnails and before the badges, inside the clip's box (left = x − its 2-pt border). Nothing animated, nothing over the trim handles' touches (no touches at all).

### 2.9 Icon
`pause-circle-outline` (Ionicons, new to the app) → `waveform.badge.minus` (SF Symbols 3.0 — inside 4.2), the mirror of Extract audio's `waveform.badge.plus`; unique in the clip context. `USED` in `sfSymbols.map.test.ts` gains the name.

## 3. Files

| File | Change |
|---|---|
| NEW `src/editor/model/pauses.ts` | `PAUSES`, `PAUSE_GAPS`, `PAUSE_QUIET`, `pausePlan`, `assemblePauseOutline`, `findPauses` |
| `src/editor/model/ops.ts` | `removePauses` |
| `src/editor/soundPeaks.ts` | the turn; `listenForPauses`, `stopPauses`, `heardPauses`, `pauseKey`; `resetPeaks` stops pauses |
| NEW `src/editor/pauseFind.ts` | `usePauses` store, `pauseOptions`, `pauseSaving`, `usePauseListening` |
| NEW `src/editor/components/RemovePausesSheet.tsx` | the strip, `PAUSE_WORDS`, `pauseStatus` |
| `src/editor/timelineMarks.ts` | `PAUSE_SHADE`, `pauseShades` |
| `src/editor/components/ClipThumbStrip.tsx` | the shades |
| `src/editor/toolbarContext.ts`, `toolGroups.ts`, `toolStrip.ts`, `components/EditorToolbar.tsx` | the tool |
| `src/ui/sfSymbols.ts` | one row |
| `src/lib/buildInfo.ts` | `PAUSES_TOOLS` |
| `AGENTS.md`, `docs/next-build-phone-checklist.md` | the line; part M |

Not touched: `SoundPeaks.swift` and every Swift file, `peaks.ts`, `peaksFiles.ts`, `BarWave.tsx`, `timeline.ts`, `timelineScroll.ts`, `timelineLayout.ts`, `ToolStrip.tsx`, the kit, the export, `app.json`.

## 4. Tests that may change, and only as stated
- `src/editor/__tests__/toolbarContext.test.ts`: the `CLIP` list gains `"pauses"` after `"stabilize"`; the photo / reversed expectations add `"pauses"` to `without(...)`.
- `src/editor/__tests__/toolGroups.groups.test.ts` and `src/editor/__tests__/EditorToolbar.test.tsx`: a video clip's `Edit` list starts with `"Remove pauses"`. The PROOF test in `toolGroups.groups.test.ts` is NOT edited.
- `src/ui/__tests__/sfSymbols.map.test.ts`: `"pause-circle-outline"` in `USED` (sorted), the count in its comment +1.
Never edited: every PROOF named in AGENTS.md, `defaultTree.proof.test.tsx`, `looks.frozen.test.ts`, `timeline.stepped.proof.test.ts`.

## 5. Guards respected
Casing (chips and button title style; strip title, labels and lines sentence style), Text size (no `fit`, no `allowFontScaling`, no fixed text added; the status line is a sentence), Palette (only `theme.colors` / `theme.elevation`; shades `scrimStrong`), Spacing (`theme.space` only; `PAUSE_LABEL_WIDTH` is a width), Motion (nothing animated; the strip's own `EnterView` only), Icons (through the kit `Icon`), Messages (one undo step, said after `apply`, after the close), Toolbar (presentation only in `toolGroups`), Snapping (untouched), timeline.ts speed rule (§2.4).

## 6. Unverified until a phone (the checklist, part M)
That the three lines suit real recordings (a phone mic indoors, outdoors, with music under the voice); whether 0.1 s of pad is enough for soft word endings ("…s", "…f"); clicks at the joins (the pieces join with hard cuts — no cross-fade); how long a 10-minute clip takes to listen to; the 375-pt fit of the second row; the shading's visibility over dark and light thumbnails.

## 7. Test vectors (pinned in `pauses.test.ts`)
Outlines at 100 a second built from `[seconds, level]` segments; options `{ minGap: 0.6, minPiece: 0.3, pad: 0.1, quietDb: -35 }` unless said.
- speech 1 s @0.5, silence 1 s @0.001, speech 1 s @0.5 (0 … 3) → `[[1.1, 1.9]]`.
- range 5 … 8: silence 0.8 @0.0005, speech 1.4 @0.4, silence 0.8 @0.0005 → `[[5, 5.7], [7.3, 8]]` (edges exact, no pad at the clip's edges).
- speech 1, silence 0.5, speech 1 → `[]`; with `minGap: 0.3` → `[[1.1, 1.4]]`.
- a 0.02-s blip inside 0.4 + 0.4 s of silence → one pause `[[1.1, 1.72]]`; a 0.03-s one → two short runs → `[]`.
- background 0.02 under speech 0.5: −45 → `[]`, −35 → `[]`, −25 → `[[1.1, 1.9]]`.
- everything @0.0005 → `{ cuts: [], silent: true }`; NaN everywhere → silent; NaN inside a silence → still one pause.
- speech 1, silence 1, speech 0.05, silence 1, speech 1 → `[[1.1, 1.9]]` (the 0.25-s piece joins the next).
- speech 1, silence 1, speech 0.15 → `[]` (the last piece would be 0.25 s).
- 70 pauses (10 of 0.7 s, 60 of 1.0 s, between 0.5-s speech) → 60 cuts, each 0.8 s, in time order.
- bad options (a NaN) or an empty outline → `{ cuts: [], silent: false }`.
- `pausePlan(0, 3)` → one call of 300; `(10, 40)` → `[10, 25] 1500`, `[25, 40] 1500`; `(0, 0.1)` → one call of 16; `(0, 600)` → 30 calls of 2000; `(0, 600.5)`, `(3, 3)`, `(NaN, 1)` → null.
