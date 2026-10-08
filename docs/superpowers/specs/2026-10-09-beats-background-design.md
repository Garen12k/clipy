# Find beats in your own music, Remove background: design

**Date:** 2026-10-09
**Status:** Implemented 2026-10-09 (on-device confirmation by the owner pending); as built: section 3a. Plan: `docs/superpowers/plans/2026-10-09-beats-background.md`.
**Builds on:** auto beat cut (`2026-10-06-beat-cut-templates-design.md`: `beatDetect.ts`, `beats.ts`, `musicBeats.ts`, `BeatsSheet.tsx`), the sound tools (`2026-10-07-sound-tools-design.md`: a stored setting, a rendered copy, a one-at-a-time manager), layers / masks / green screen (`ClipFrame`, `LayerStack`, `ClipyCompositor.swift`), the build label (`src/lib/buildInfo.ts`). Branch `beats-background` from `main` 9ac3073. Schema v19 → **v20** (one optional field, for Remove background only). **New Swift** for both features, in two new files (one new native build). No new package, no new asset.

## What this batch does and does not do

This batch adds two things. **Find beats in your own music**: the Find beats button of the Beats panel, which today only knows the eight built-in tracks, also works for a song added from Files, an extracted clip sound, a voice-over or a Read aloud bar. The phone decodes the file and measures where sounds start (new Swift, a few seconds); the tempo and the beats are then found by the detector the built-in tracks were analysed with (TypeScript, unchanged in what it computes), and the markers are placed by the code that places them today. A track without a clear, steady beat is said to have none, by the same rule that left The Frigid Seas without beats. **Remove background**: a switch on a photo, a video clip or an overlay layer. The phone finds the person with Apple's own people detection and prepares a **cut-out copy** in the project's folder: for a video a movie with a see-through background (HEVC with alpha) that keeps the clip's sound and timing, for a photo a PNG. The original is never changed; the preview and the export only swap the file. The batch does **not** cut out anything but people (no pets, no objects), does not improve edges by hand, does not work on a clip longer than 60 seconds or on a reversed clip, does not follow a changing tempo, does not write beats into the project on its own, and does not analyse or cut out anything when a project is merely opened and nothing is missing. Three things in the approved wording are delivered with a difference; §11 lists them. The largest: whether the **preview** can show a see-through video at all is decided by the video player the app already uses, and can only be seen on the phone (§10 item 1); if it cannot, video cut-outs are shown in the export only and the preview says so with its Preview tag, while photo cut-outs still preview.

## 1. Goals and non-goals

**Goals**
1. The owner's two approved items, as worded, except where §11 lists a difference.
2. **Nothing existing changes.** A project saved before this batch loads, previews and exports exactly as before: the v19 → v20 migration changes only the number (PROOF, §4.3); a bundled track's beats still come from `beats.json` at once; the detector gives the same tempo and beats for the same signal (the existing `beatDetect.test.ts` and `musicBeats.test.ts` are not edited); `ExportSession.swift`, `ClipyCompositor.swift` and `MediaPrePass.swift` have **no diff**.
3. **Nothing changes on its own.** Markers are written only by a tap on Find beats or a drag of Fewer / More; `cutout` only by the switch. A cut-out copy is rendered only for a clip whose switch is on.
4. **One native build.** All Swift is in two new files plus registration lines in the module; it is read through by an independent reviewer and built once. Every number that may need tuning (analysis length, acceptance rule, cut-out size, frame rate, quality, person threshold, the 60 seconds) is TypeScript and travels in the request.
5. Every native failure reports a stage and `ExportSession.describe(error)`; a tool the installed build cannot run says so in one sentence and never throws "undefined is not a function".

**Non-goals:** tempo changes inside a song, downbeats / bars, beat detection for Apple Music songs, cutting out animals or things, a brush to fix edges, replacing the background with a picture in one step (put the cut-out on a layer above it), cut-outs of reversed clips, cut-outs longer than 60 seconds, a cut-out of only part of the time, Android, web.

## 2. Where things stand today (read 2026-10-08, `main` 9ac3073)

- **Beats.** `beatDetect.ts` (no imports, erasable TypeScript) has three stages: `onsetEnvelope(samples, rate)` (a 23 ms Hann window, radix-2 FFT, log-compressed spectral flux, about 100 values a second), `beatPeriod(env, rate)` (autocorrelation over 70–180 bpm weighted towards 120, then 601 fine steps of `bestPhase`), and the grid. `scripts/generate-beats.mjs` decodes the eight bundled mp3 files at 44 100 Hz, runs `detectBeats` on the whole and on each half, and ships a track's beats only when the confidence is at least 1.5 and both halves give a tempo within 0.1 % of the whole's. The app never runs the detector. `beatsOf(track)` answers `ok` / `unsteady` / `own`; for `own` the button is off and the panel says "Find beats works with the built-in music for now…". `beatTrack` picks the selected track when it is music, else the first music track.
- **Rendered copies.** A sound setting's copy is named after the source and the setting, lives in `<project>/sound/`, is rendered one at a time by `soundRenders.ts` (cancel grace 4 s, a deadline), is swapped in by uri in the preview and the export, and orphan copies are swept when the project is opened.
- **Preview.** `PreviewPlayer.tsx` (never edited) reads the project from the store and loads `hit.clip.sourceUri` into its two players; it draws the clip through `ClipFrame`, which it hands only the clip and the frame size. `ClipFrame` draws the clip's background only when the picture leaves the frame uncovered, is see-through or masked (`backgroundShows`). A layer is a `ClipFrame transparent` holding a photo `Image` or a `LayerVideo` (its own player, loaded from `layer.sourceUri`, re-loaded when that changes). expo-video's `VideoView` sets its player view's background to clear (`node_modules/expo-video/ios/VideoView.swift`, line 56).
- **Export.** `ExportSession.load` takes the video and the sound from `clip.sourceUri`. A photo is first turned into an opaque H.264 movie and a reversed clip into an opaque reversed copy (`MediaPrePass`): both lose any transparency. `ClipyCompositor` asks for 8-bit BGRA source frames, draws a layer over the running frame with `picture.composited(over:)`, and draws a main clip's background only for a picture that is placed, see-through, masked or keyed; a default clip takes the `usesFill` shortcut over black.
- **Build label.** `LEVELS` (newest first) and `NEEDS_LATEST_BUILD(what)`; the installed build is "noise, ramps and speech".

## 3. Decisions

Each has the decision, the reason, and what it costs if it turns out wrong.

### A. Find beats

**A1. Native computes the first stage only; the rest stays TypeScript.** New `BeatEnvelope.swift` decodes the file's first sound track to 32-bit float PCM at 44 100 Hz (the rate the bundled tracks were analysed at), averages the channels and computes the onset envelope. It returns `{ env: number[], rate, seconds, from }`: about 100 numbers per second of music, 30 000 for five minutes. TypeScript then runs the existing tempo and grid stages on it.
*Reason.* Raw samples are too heavy for the bridge (five minutes at 44.1 kHz are 13 million numbers) and their FFTs are too slow for the JavaScript engine (30 000 transforms of 1 024 points). The envelope is small, and it is the one stage with no tuning in it: a window, an FFT, a sum. So the mirrored pair is one function (`onsetEnvelope` ↔ `BeatEnvelope.swift`: three constants, one formula), and everything that decides a tempo stays in one language.
*If wrong.* (a) If the Swift envelope differs from the TypeScript one (a slip in the FFT), tempos are wrong or nothing is steady: the parity test pins the constants and the formula lines, and §6.2 has a worked vector to compare by hand; the fix needs a build. (b) The TypeScript stages cost about 0.35 s for a five-minute song in Node; the phone's engine has no compiler, so expect 5–15 s there. They run in slices of four fine steps with a pause between slices, so the screen stays alive; if it still stutters, the slice size is one TypeScript constant.

**A2. The detector is cut into slices without changing what it computes.** `beatPeriod` becomes `coarsePeriod` plus `finePeriodSlice` (the same loop, resumable), and the tail of `detectBeats` becomes `beatsFromPeriod`. `beatPeriod` and `detectBeats` are now compositions of these and return what they returned (the existing tests are not edited; a new test compares the sliced result with the unsliced one). The acceptance rule moves into the file as `BEAT_ACCEPT` and `isSteady`, with the generator's numbers; a test reads the script and checks the numbers are the same.
*If wrong.* If `beats.json` would no longer regenerate byte for byte, the refactor changed the maths: the task re-runs the generator where the decoder is installed and otherwise relies on the equality tests.

**A3. The halves are halves of the envelope.** The generator splits the samples; the app splits the envelope (native sends one). The two differ only in the first few values of the second half. On three synthetic tracks (30 s, 180 s, 300 s at 128 bpm) both ways gave the same tempos to two decimals.
*If wrong.* A track at the edge of the 0.1 % rule could be accepted by one and refused by the other. The owner then sees "no steady beat" for a track that has one (or the reverse); `BEAT_ACCEPT.halvesWithin` is TypeScript.

**A4. Results are remembered for the session, not stored.** `useOwnBeats` keeps `{ bpm, first, confidence, beats } | null` per `sourceUri|from|to` in memory. Nothing is written to the project folder and nothing to the project until the owner taps: the tap then calls `placeBeats` exactly as for a bundled track. No schema change.
*Reason.* A result is needed only at the tap and while the Fewer / More slider is dragged afterwards. A file cache would need a name scheme, a sweep and a version number to save a few seconds once per app start.
*If wrong.* After the app restarts, Find beats listens again (the same few seconds).

**A5. Which track, and how much of it.** Any audio bar qualifies: music, a voice-over, a clip sound on the audio row (its file is the video), a Read aloud `.caf`. A bar with a Voice / Sound setting is analysed from its **original** file (the copy has the same timing). `beatTrack` gains one fallback: when the project has **no** music track, the selected bar of another kind is listened to. A file up to 600 s is analysed whole; a longer one from the second the bar's trim starts in, for 600 s (`beatRange`). Under 8 s there is nothing to split in two: "too short".
*Reason for the fallback only.* With a voice-over selected and music in the project, Find beats means the music today; that must not change.
*If wrong.* Finding beats in a clip sound while the project also has music is not possible; the owner removes or mutes nothing, they select the music instead. A later round can add a picker.

**A6. One analysis at a time, cancellable, no progress bar.** A second tap while busy is ignored. Closing the panel, leaving the editor or 120 s without an answer (`BEATS_DEADLINE_MS`) cancel it. The panel shows the kit spinner in the hint's fixed slot ("Listening to the music"). An answer for a project or track that is gone is dropped.

### B. Remove background

**B1. A cut-out copy, not segmentation inside the export.** The setting is `Clip.cutout?: true` (absent when off). A native render writes a copy; the preview and the export swap the uri.
*The alternative* was to segment every frame inside the export compositor, with no copy and no wait: far less storage, but nothing to show in the preview, a much slower export, and a change in the middle of `ClipyCompositor`. The owner was promised the preview, so the copy it is.
*If wrong.* Storage (§6.5) and a wait per clip. If the preview cannot show transparency (B3), video copies still serve the export.

**B2. The formats.** A video's copy is a QuickTime movie, HEVC with alpha (`AVVideoCodecType.hevcWithAlpha`), upright (the source's rotation is applied to the pixels, so the copy needs no transform), at most 1 920 on its long side, at most about 30 frames a second, with the source's own sound packets copied beside it. Only the rendered range holds frames, **at their source times**: the writer's session starts at 0, so the movie has an empty stretch before the first frame and the copy's timeline is the source's. Trim, speed, speed curves, split and keyframes therefore apply to the copy exactly as to the original. A photo's copy is a PNG (the preview) and beside it a 60-second two-frame movie with alpha of the same picture (the export).
*Reason for the photo's movie.* The export turns photos into opaque movies (`MediaPrePass`), which would lose the transparency. Sending the photo as an ordinary video clip that plays the still movie is what the pre-pass itself would have produced, and needs no change there.
*If wrong.* If the encoder refuses HEVC with alpha at these settings, the render fails with `cutout writer: …` and the clip shows as it was.

**B3. The preview.** Layers: `LayerStack` hands `LayerVideo` the layer with the copy's uri once the copy is ready (the layer's one player plays the copy, with its sound). Photos, main or layer: `ClipFrame` draws the PNG, and for a main clip always draws the clip's background behind it. A **main video clip** cannot be given another file (`PreviewPlayer.tsx` reads `clip.sourceUri` and is never edited), so `ClipFrame` hides the main player's picture (opacity 0 on the box it sits in; it keeps playing, keeps the sound and keeps driving the playhead) and mounts a silent `LayerVideo` beside it that plays the copy in step with the playhead, over the clip's background.
*Unknown.* Whether expo-video's view shows the copy's transparency. Apple says "The video in AVPlayerLayer will be displayed with a transparent background and composed with the rest of the layers and views" (WWDC 2019, session 506), and expo-video sets the player view's background to clear; but its view is an `AVPlayerViewController`, which nobody has seen with such a file here.
*If wrong.* Two TypeScript switches, `CUTOUT_PREVIEW.layerVideo` and `CUTOUT_PREVIEW.mainVideo`: off, that kind of clip plays its original in the preview and the Preview tag shows. No build is needed for that. A main video clip's follower player is a third (with two video layers, a fifth) player at once; if the phone struggles, `mainVideo` goes off alone.

**B4. The export, without touching the export's Swift.** Before `exportTimeline`, `prepareCutouts` makes sure every needed copy exists (rendering a missing one first, with progress), and the request is rewritten in TypeScript: a video clip or layer is sent with the copy's uri (picture and sound both come from the copy); a photo is sent as a video clip playing the still movie; a **main** clip is also sent with its opacity capped at 0.999.
*Reason for 0.999.* The compositor draws a main clip's background only behind a picture it knows to be see-through; a default clip takes a shortcut over black. A picture that is not fully opaque is one of its existing see-through cases, so 0.999 makes it place the picture over the clip's background. The price is one tenth of a percent of the background mixed into the person (less than one step of 255) and one more Core Image step per frame. The honest alternative is a `cutout` flag through `ExportClip`, `ExportLayer`, `MediaPrePass.rewrite` and `LayerSpec`: five edits in three long-lived Swift files that cannot be compiled here.
*Unknown.* That a source frame of an HEVC-with-alpha track reaches the custom compositor with its alpha when 32BGRA is asked for. Apple's session shows a custom compositor writing alpha, not reading it.
*If wrong.* The exported person stands on black. That needs a second build (a matte file beside the picture, mixed in the compositor).

**B5. The rendered range and the 60 seconds.** The limit is on the clip's **trimmed source range**: `trimEnd − trimStart ≤ 60 s`. The copy covers that range plus two seconds each side, on whole seconds (`cutoutRange`). Two seconds is the longest transition handle: the export reads up to half a transition (0.5 s of output) times the clip's edge speed (up to 4×) of source before `trimStart` and after `trimEnd` (`transitionHandles` / `TRANSITION_HANDLE_MAX` in timeline.ts, the numbers of `ExportSession`'s `head` / `tail`). Which copy a clip uses is looked up, not computed: the smallest known copy of its file whose range holds the clip's trim AND its handle each side (0.5 s of source at 1×, 2 s at 4×; nothing beyond the file's own ends) (`coveringCopy`), else the planned one. So at ordinary speed a trim up to about 1.5 s outwards stays on the copy. A split leaves both halves on the old copy; a trim outwards (or a higher speed) that takes a handle past the copy renders a new one. A copy that only contained the trim would be empty where a transition into the clip begins: the transition would start late and jump.
*Reason.* Rendering whole files would make later trims free but a 10-minute file would take 10 minutes for a 5-second clip. Naming copies by the exact trim would re-render on every trim, even inwards.
*If wrong.* Trimming a clip outwards one second at a time renders a new copy each time (each up to the whole range again). The old ones stay until the project is next opened.

**B6. One render at a time, started when the project has stood still.** `cutoutRenders.ts` is its own queue (the sound queue is untouched; the two use different hardware). A needed copy is rendered once what is needed has not changed for 0.8 s (`CUTOUT_SETTLE_MS`), so a trim drag does not start a render per frame. A copy nobody needs any more is cancelled at once. Deadline: 60 s plus 20 times the range's length (a 64-second range may take 22 minutes); cancel grace 4 s. Progress arrives as events. A render never writes the project.

**B7. Failures.** The setting stays; the clip shows and plays as it was; one toast says so ("Could not remove the background. The clip shows as it was."), and the strip offers the switch again (switching it off and on retries). "No person": the render measures how much of the picture the mask covers (first frame and every 15th); if no measured frame reaches 0.5 %, it fails with `cutout person: no person found` and the toast is "No person was found in that clip. It shows as it was." An export with a copy that cannot be made stops with its reason, as with sounds: it never goes out with a background the owner switched off.
*If wrong.* The no-person answer comes only at the end of a video's render. A pre-scan of a few frames would be quicker but would refuse a clip the person walks into late.

**B8. Where the switch lives.** A new tool **Cut out** (`cutout`, icon `body-outline`) on a clip's and a layer's bar, after Green screen; not on a reversed clip. It opens a strip titled **Remove background** (header note "Edges are not perfect"): the switch with one line beside it ("The phone finds the person and hides everything else."), and a 36-pt status row: "People only. The copy takes about N MB." while off, then "Waiting to start.", the spinner with "Preparing the cut-out: 42 %", "Ready.", or why it failed. Reverse is left off the bar of a clip whose switch is on.

**B9. Sound.** The copy carries the source's first sound track, copied packet for packet (no re-encoding), over the same range. If the writer cannot take that sound the render fails with `cutout sound: …` rather than produce a silent copy.

**B10. Schema 20.** One optional key, `Clip.cutout`, kept only when it is exactly `true`. An older copy of the app would drop the key in its sanity pass and save the project without it, so the number is raised; as always that is one-way on the owner's phone.

### C. Build label and gating

`LEVELS` gains a first row `{ name: "beats and background", has: isCutoutAvailable }`. Both tools say `BEATS_BACKGROUND_TOOLS` = "Beats in your own music and Remove background need the latest Clipy build. Install it from the newest build link." on an older build and in Expo Go.

## 3a. As built

Branch `beats-background`, from `main` 9ac3073; spec and plan `10ffd30`. App tests 5087, server tests 464, typecheck clean.

**Commits, by task.**

| Task | Commit | What |
|---|---|---|
| 1 | `ba0d87d` | schema v20, `Clip.cutout?`, `activeCutout`, `setClipCutout`, the v19 to v20 PROOF |
| 2 | `0188019` | the detector in resumable pieces (`coarsePeriod`, `finePeriodSlice`, `beatsFromPeriod`), `BEAT_ACCEPT` / `isSteady`, the `beatTrack` fallback; the pinned PROOF |
| 3 | `4919e86` | `cutout.ts`: names, ranges, `coveringCopy`, refusals (codes), sizes |
| 4 | `5b0244a` | the wrapper in `modules/clipy-video/index.ts`, the `LEVELS` row "beats and background", `BEATS_BACKGROUND_TOOLS` |
| 5 | `a9bb705` | `ownBeats.ts`: range, session cache, sliced analysis, the one listener |
| 6 | `352271b` | Find beats for own music in `BeatsSheet.tsx` |
| 7 | `88c450a` | `BeatEnvelope.swift`, the module functions, `beatEnvelope.parity.test.ts` |
| 8 | `9d290cb` | `cutoutFiles.ts`, `cutoutRenders.ts` (queue, deadline, sweep) |
| 9 | `5ef07cd` | preview: `CutoutFollower`, `ClipFrame`, `LayerStack`, `PreviewTag` |
| 10 | `8075ef3` | the Cut out tool, `CutoutSheet` strip, `contextFor` |
| 11 | `b8726af` | export: `exportCutouts.ts`, `useExport.ts` |
| 12 | `c542e74` | `CutoutRender.swift`, `renderCutout` / `cancelCutout`, `onCutoutEvent` |
| 13 | `053b808`, `ad820dc`, `50eb293`, `78f1202` | the Swift guard, then the fix wave (below) |

**Builds.** One: EAS build `c3b4ef28-2941-4d26-bf9b-50f1460e287e`, started at `053b808` after the Swift read-through, finished. It was one build because both features add native code in two new files and nothing else, and the read-through found no compile error. The three fix-wave commits after it are TypeScript only, so they reach the phone from the dev server. A second build is needed only if the phone checks on transparency (section 10, items 1 and 2) fail in the compositor, or a Swift finding below turns out to matter.

**Swift read-through (no toolchain).** No compile error found. Findings:
- H1, the native gate stays taken if a blocking call (`copyNextSampleBuffer`, `perform`, `finishWriting`) never returns: parked; the JS deadline frees the queue, but later renders would time out until the app restarts.
- H2, `endSession` on a writer that has stopped writing: fixed in `053b808` (a `writer.status == .writing` guard before `endSession` / `finishWriting`).
- W1, waiting at the native gate ate the JS deadline: fixed in TypeScript (`inTurn`, below).
- W2, two native renders of one path: not a collision (the second waits at the gate until the first has removed or placed its part file); at most one wasted render. Parked.
- W3, "No person" is known only after the whole video is rendered: kept; expect the delay.
- W4, beats up to one packet (about 23 ms) late for a file over 10 minutes: negligible, kept.
- C1, C2 (cosmetic: the `evenSize` fallback differs from `cutoutSize`; `seconds` in a video's result is the range's end): kept.

**TypeScript review and the fix wave.**
- I1 (`ad820dc`): a transition into or out of a cut-out clip could read source the copy does not hold. `CUTOUT.pad` is now 2 (was 1); `coveringCopy` requires head and tail room (`transitionHandles` and `TRANSITION_HANDLE_MAX` = 2 in `timeline.ts`, the only place a handle meets a speed); a freshly planned copy always satisfies its own rule at every speed. The longest copy is 64 s (was 62), its deadline 1340 s (about 22 min), about 61 MB for 60 seconds. `CUTOUT_VERSION` stays 1 (never shipped).
- M5 / W1 (`50eb293`): `inTurn` in `cutoutRenders.ts`, one queue around the native call shared by the editor and the export; a deadline starts when the call's turn comes.
- `78f1202`: M1 the strip says why a copy cannot start (`CUTOUT_FILE_MISSING`, or `BEATS_BACKGROUND_TOOLS`); M2 a photo shows no percent; M3 the Beats hint keeps to two lines; M6 the export's free-space check counts the copies still to be made (`cutoutBytesToMake`).
- Left on purpose: M4 (the preview can move between two READY copies: one reload), M8 (a resting finger mid-trim can start a render), M9 (a one-load background flash on a cut-out main clip), part of M10 (test gaps: the Cut out button press, the follower's real sync).

**Deviations the tasks reported.**
- Values: `CUTOUT.pad` 1 to 2; `BEAT_MESSAGES` has a fourth key, `gaveUp` (shown in the hint's row when a listening hits its 120 s deadline); `ListenAnswer` has `"unavailable"`; `BEATS_BREATH_MS` = 8 (the slices hand the thread back at least every 8 ms); a refusal is a code (`"reversed"` | `"tooLong"`), the sentences live in `CutoutSheet.tsx` and `exportCutouts.ts`.
- Names: a source file name that is not already safe gets an 8-hex FNV-1a of the whole name appended; `parseCutoutName` is strict (canonical numbers, `to > from`, a safe stem); of two covering copies of equal length the earlier `from` wins.
- Native: `BeatEnvelope.swift` reads with `AVAssetReaderAudioMixOutput` (SoundRender's pattern; a 5.1 file is downmixed by AVFoundation) and its FFT works on pointer buffers (the development build is unoptimised); `CutoutRender.swift` blends with `CIBlendWithRedMask` (Vision's mask is one channel), ends its session with `endSession(atSourceTime: range.end)`, writes BT.709, has its own native gate (`enter` / `leave`), and a nil filter or output throws.
- Manager: ready copies are asked before busy ones (`cutoutNeedOf`, `cutoutsNeeded`, `cutoutPercent`); the hook subscribes to the stores outside React; no timer when nothing waits; progress in whole percent; a failed copy nobody needs is forgotten (so off and on retries); without the tool `openCutouts` does not set `opened`.
- Beats: a second call for the same stretch joins the first; what is remembered is not listened to again; a malformed native answer rejects; the native call is made at once.
- Export: names come from the editor's store; a stopped render is asked for again up to 3 times; progress never runs back; a photo keeps its speed and spans; a main clip's non-finite opacity becomes 0.999; the gate in `useExport.ts` is `some(activeCutout)`.
- Preview: selectors return the uri or a boolean (never `s.files`); `LayerStack` has a private `LayerPicture`.
- Toolbar: the switch row of `CutoutSheet` is its own `View` of height `STRIP.tiles`, not `StripTiles`.
- Tests whose expectations changed: the pinned schema number 19 to 20 in `migrate.test.ts` (including the outputs asserted by older PROOFs) and in `types.audio`, `types.clip`, `types.layers`, `types.layers2`, `types.look`, `types.motion`, `types.noise`, `types.photo`, `types.polish`, `types.sound`, `types.speed`, `types.text`; three expectations in `BeatsSheet.auto.test.tsx` (own music is no longer off); the pinned tool lists in `toolbarContext.test.ts`, `EditorToolbar.test.tsx`, `EditorToolbar.layers.test.tsx` and `icons.test.ts` (one more "Cut out"); the pinned event list in `soundRender.swift.test.ts` (`onCutoutEvent`); two mock lines in `useExport.test.ts`; in `cutout.test.ts` and `cutoutRenders.test.ts` the numbers of the 1-second pad (the rule's own tests). No PROOF, frozen or guard test was edited to pass.
- Files outside the plan: `src/editor/model/timeline.ts` (`transitionHandles`, `TRANSITION_HANDLE_MAX`; new test `timeline.handles.test.ts`) in the fix wave, and `BeatsSheet.tsx` / `CutoutSheet.tsx` for the minor findings.
- Not done: `assets/music/beats.json` was not regenerated (no decoder on the machine; the detector's results are pinned by the PROOF instead).

**What no test checks (section 10, item by item).**
1. Transparency in the preview: whether `VideoView` draws the copy's alpha (a layer over the video beneath, a main follower over the background). Fallback: `CUTOUT_PREVIEW`.
2. Transparency in the export: whether the compositor receives the alpha, and whether it is premultiplied (a dark rim). Fallback: a second build.
3. Time: how long 5, 20 and 60 seconds take in a development build, heat, whether the phone stays usable; the 120 s listening deadline for a long song.
4. Edges: hair, fast movement, a second person, a person entering late; HEVC alpha edge quality (`alphaQuality`).
5. The main clip's follower: sync with the sound (up to 0.25 s off), the blink when the copy first appears or the playhead enters the clip, stutter with several players.
6. Colours: HDR sources are read as 8-bit and tagged BT.709.
7. Sound of a cut-out clip: packets copied from a range that starts mid-file (a click, or a refusal `cutout sound:`); picture and sound in step with the empty stretch before the first frame.
8. Storage: the strip's size against the real folder.
9. Find beats: the time for a three-minute song, markers on the beat by ear, the spinner staying alive, the first buffer's position for a range that starts mid-file.
10. No steady beat: said for speech and ambient music, not for ordinary pop.

Also unverified: that both Swift files compiled (the EAS build answered), that HEVC with alpha is accepted from 32BGRA buffers through the adaptor, that a one-channel Vision mask works with the red blend, and that a pool buffer is fully rewritten on each frame.

## 4. Data model: schema v20

```ts
export const SCHEMA_VERSION = 20 as const;
export interface Clip { /* v19, unchanged */ cutout?: true }   // Remove background: ABSENT = off (never false / null / undefined)
export const activeCutout = (c: Clip): boolean => c.cutout === true && !c.reversed;
```

### 4.1 Rules
- `cutout` is optional and **absent** when off. Only `setClipCutout(p, id, on)` writes it; everything else reads `activeCutout`.
- `setClipCutout` refuses (same project) a reversed clip, an unknown id, and a value that is already in place. Main clips and layers, photos and videos.
- Duplicate, split, a new layer from a clip and Replace keep the key (they copy the clip). A freeze frame is a new photo without it.
- A clip that is reversed afterwards (multi-select) keeps the stored key but `activeCutout` is false: it shows its background until it is turned forwards again.
- Beats store nothing new: markers are `Project.beatMarkers`, as today.

### 4.2 The sanity pass
`normaliseClip`: `cutout` is kept only when it is exactly `true` and the clip is not reversed; anything else (`false`, `1`, `"true"`, `null`) leaves no key. Idempotent.

### 4.3 The migration, and its proof
v19 → v20 adds nothing. PROOF test (appended to `migrate.test.ts`, never edited to pass): a v19 project with a noise setting on a track, a smooth speed curve, a green screen on a clip, a photo with a Motion, a layer, music and beat markers migrates to **itself with only the number changed**; the stored object is not mutated; no clip or layer has a `cutout` key; a second pass changes nothing.

## 5. Find beats: native API and numbers

```ts
export interface BeatEnvelopeRequest { jobId: string; sourceUri: string; from: number; to: number }   // seconds in the file; to ≤ from = to the end
export interface BeatEnvelopeResult { env: number[]; rate: number; seconds: number; from: number }    // rate = values per second; seconds = sound decoded; from = where it really began
export const BEATS_CANCELLED = "E_BEATS_CANCELLED";
isBeatEnvelopeAvailable(): boolean                                   // the module has `beatEnvelope`
beatEnvelope(req: BeatEnvelopeRequest): Promise<BeatEnvelopeResult>  // rejects "E_BEATS_CANCELLED" or "E_BEATS"
cancelBeatEnvelope(jobId: string): void
isBeatsCancelled(e: unknown): boolean
```

**Error strings:** `beats source: not a file path`, `beats source: this file has no sound`, `beats source: nothing to listen to`, `beats source: <describe>`, `beats reader: <describe>`, `beats reader: this sound cannot be decoded`, `beats reader: unexpected sound format`, `beats reader: could not read the sound (<status>)`, `beats reader: no sound came out`; cancel rejects with `Beats cancelled`.

### 5.1 The mirrored stage
`onsetEnvelope` (beatDetect.ts) ↔ `BeatEnvelope.swift`: `envelopeRate` 100, `windowSeconds` 0.023, `compress` 1000; `hop = max(1, round(rate / 100))`; `size` = the next power of two at or above `ceil(rate × 0.023)`; Hann `0.5 − 0.5·cos(2πi / (size − 1))`; frame *f* is the window that ends at sample `(f + 1)·hop`, zero before the start; `cur[k] = log(1 + 1000·|X[k]| / size)` for `k < size / 2`; the value is the sum of the rises `cur[k] − prev[k] > 0`, and 0 for frame 0; the answer's rate is `rate / hop`. Swift streams: it keeps the last `size` samples in a ring and computes a frame every `hop` samples, so memory does not grow with the file.

| Sample rate | hop | size | envelope rate |
|---|---|---|---|
| 44 100 | 441 | 1 024 | 100 |
| 48 000 | 480 | 2 048 | 100 |
| 22 050 | 221 | 512 | 99.773756 |
| 8 000 | 80 | 256 | 100 |

### 5.2 A worked vector
800 samples at 8 000 Hz: 400 zeros, then `0.5·sin(2π·1000·i / 8000)` for `i` = 400 … 799. hop 80, size 256, ten values: `0, 0, 0, 0, 0, 102.717898, 17.724067, 0.30335, 0.091661, 0` (six decimals; computed with `onsetEnvelope`, pinned in `beatEnvelope.parity.test.ts`).

### 5.3 The TypeScript stages
`BEAT_ANALYSIS = { maxSeconds: 600, minSeconds: 8, slice: 4 }`. `beatRange(track)`: `[0, sourceDuration]` when the file is at most 600 s, else `[floor(trimStart), min(sourceDuration, floor(trimStart) + 600)]`. `analyseEnvelope(env, rate, seconds, pause, stopped)`: the period of the whole, of the first half and of the second half (`env.subarray`), each as `coarsePeriod` then `finePeriodSlice` four steps at a time with `await pause()` between; then `beatsFromPeriod` for the three and `isSteady(whole, a, b)`: all three exist, `whole.confidence ≥ 1.5`, and each half's bpm is within `0.001 × whole.bpm`. Steady → the whole's beats, each plus `from` (file seconds, 3 decimals). Otherwise `null`. Time in Node for a 300-second envelope: 161 ms per period, about 0.35 s in all.

## 6. Remove background: native API and numbers

```ts
export interface CutoutRequest {
  jobId: string; sourceUri: string; outputPath: string; kind: "video" | "photo";
  from: number; to: number;            // video: the source range to render (seconds); photo: 0, 0
  maxSide: number; minFrameGap: number; minPerson: number; alphaQuality: number; bitsPerPixel: number;
  stillPath: string; stillSeconds: number;   // photo: the movie written beside the PNG, and its length; video: "", 0
}
export interface CutoutResult { fileUri: string; seconds: number; frames: number; person: number }   // person = the largest share of a measured frame the mask covered
export type CutoutEvent = { jobId: string; progress: number };
export const CUTOUT_CANCELLED = "E_CUTOUT_CANCELLED";
isCutoutAvailable(): boolean                          // the module has `renderCutout`
renderCutout(req: CutoutRequest): Promise<CutoutResult>   // rejects "E_CUTOUT_CANCELLED" or "E_CUTOUT"
cancelCutout(jobId: string): void
addCutoutListener(cb: (e: CutoutEvent) => void): EventSubscription
isCutoutCancelled(e: unknown): boolean
```

**Error strings:** `cutout output: not a file path`, `cutout output: the picture could not be made`, `cutout output: the picture could not be written`, `cutout output: <describe>`, `cutout source: not a file path`, `cutout source: this file has no picture`, `cutout source: this picture cannot be read`, `cutout source: nothing to render`, `cutout source: <describe>`, `cutout reader: this picture cannot be decoded`, `cutout reader: <describe>`, `cutout writer: this iPhone cannot write video with a see-through background`, `cutout writer: no picture buffer`, `cutout writer: <describe>`, `cutout sound: this clip's sound cannot be copied`, `cutout sound: <describe>`, `cutout people: <describe>` (Vision), `cutout people: no mask came back`, `cutout render: no picture buffer`, `cutout render: no picture came out`, `cutout render: <describe>` (anything unforeseen), `cutout person: no person found`; cancel rejects with `Cutout cancelled`. The app adds `cutout render: no answer after <n> s` when the deadline passes.

### 6.1 The constants (TypeScript, `src/editor/model/cutout.ts`)
`CUTOUT_VERSION = 1`. `CUTOUT = { maxSeconds: 60, pad: 2, videoMaxSide: 1920, photoMaxSide: 2560, minFrameGap: 0.03, minPerson: 0.005, alphaQuality: 0.75, bitsPerPixel: 0.1, stillSeconds: 60, exportOpacity: 0.999 }`. `CUTOUT_PREVIEW = { layerVideo: true, mainVideo: true }`. Raise `CUTOUT_VERSION` when a number that changes the copy changes (size, gap, quality).

### 6.2 Names and ranges
`cutoutRange(clip)`: `from = max(0, floor(trimStart − 2))`, `to = min(ceil(sourceDuration), ceil(trimEnd + 2))`. A known copy covers a clip when `copy.from ≤ max(0, trimStart − head)` and `copy.to ≥ min(sourceDuration, trimEnd + tail)`, with `head` / `tail` = 0.5 × the clip's first / last speed. Video copy: `<stem>-c1-<from ms>-<to ms>.mov`; photo copy: `<stem>-c1-photo.png` with `<stem>-c1-photo.mov` beside it. `<stem>` is the source's file name without its extension, as for sound copies. Folder: `<project>/cutout/`; a render writes `part-<name>` and moves it.

| Clip (file `abc.mov`, 30 s) | Range | Name |
|---|---|---|
| trim 0 – 30 | 0 – 30 | `abc-c1-0-30000.mov` |
| trim 4.2 – 9.7 | 2 – 12 | `abc-c1-2000-12000.mov` |
| then trimmed to 5 – 9 | still inside 2 – 12 | the same copy |
| then trimmed to 2.5 – 9 | handle from 2.0: still inside | the same copy |
| then trimmed to 2 – 9 | handle from 1.5: 0 – 11 | `abc-c1-0-11000.mov` (new) |
| the first clip at 4× (handles 2 s: 2.2 – 11.7) | still inside 2 – 12 | the same copy |
| a split at 7 (4.2 – 7 and 7 – 9.7) | both inside 2 – 12 | the same copy for both |
| a photo `p.jpg` | — | `p-c1-photo.png` |

### 6.3 Frames
A frame is kept when it starts at or after the range's start and at least `minFrameGap` (0.03 s) after the last kept frame: a 30 fps source keeps every frame (0.0333 apart), 60 fps every second one, 50 fps every second one (25 a second), 240 fps every eighth. Kept frames are written at their own source times.

### 6.4 Size
`scale = min(1, maxSide / max(width, height))` of the upright picture; each side is rounded to the nearest whole number and then down to an even one, at least 2: 1080 × 1920 stays; 2160 × 3840 → 1080 × 1920; 1920 × 1080 stays; 4032 × 3024 (a photo, cap 2560) → 2560 × 1920.

### 6.5 Storage and time (estimates, not measured)
Colour bitrate `max(1 000 000, width × height × 30 × 0.1)` bits a second: 6.2 Mbit/s for 1080 × 1920, plus the alpha layer (fixed quality 0.75, guessed at 10–25 % more) and the sound. About **9 MB per 10 seconds of copy** (a copy is up to 4 seconds longer than its clip: a 10-second clip takes about 13 MB), about **61 MB for a 60-second clip** (a 64-second copy); a photo's two files about 3–8 MB. `cutoutBytes(clip)` gives the strip its "about N MB". Time per frame is unknown (Apple publishes none for people segmentation); the owner was told "roughly as long as the clip itself, maybe more". Deadline `60 000 + 20 000 × (to − from)` ms.

### 6.6 What the render does (Swift, `CutoutRender.swift`)
Video: `AVAssetReader` over the range (picture decoded to 8-bit 4:2:0, sound as stored) → per kept frame: upright and scaled with Core Image into a BGRA buffer → `VNGeneratePersonSegmentationRequest` (`.balanced`, one-channel 8-bit mask) through one `VNSequenceRequestHandler` for the whole clip → the mask scaled to the frame → `CIBlendWithMask` over clear → rendered into a buffer from the writer's pool (BGRA, premultiplied) → appended at the frame's time. Sound packets are appended as they come. The loop alternates between the two inputs and sleeps 2 ms when neither is ready, so neither can starve the other. Photo: ImageIO decodes upright at the cap → one `VNImageRequestHandler` at `.accurate` → the same blend → the still movie first, the PNG last (the PNG's presence is what "ready" means).

**Apple APIs relied on** (pages fetched 2026-10-08 from developer.apple.com/tutorials/data/documentation/… and the WWDC session page; "✔" = the fact used was on the page):

| API | Fact used | Verified |
|---|---|---|
| `AVVideoCodecType.hevcWithAlpha` | iOS 13.0+; "The HEVC video codec that supports an alpha channel." | ✔ |
| Encoding (WWDC 2019, session 506) | "use the video codec type HEVC with Alpha"; "Encoding is supported on all of those devices … that have an HEVC encoder"; premultiplied alpha is "the default"; "The bitrate parameter you specify only applies to the base layer" | ✔ transcript. **Unverified:** that `AVAssetWriterInput` takes 32BGRA buffers for this codec through a pixel buffer adaptor, and that a `.mov` with an empty stretch before its first frame plays and composes normally |
| `kVTCompressionPropertyKey_TargetQualityForAlpha` | iOS 13.0+; 0.0 … 1.0; "Only HEVC with Alpha encoders support this parameter." | ✔. **Unverified:** that `AVVideoCompressionPropertiesKey` accepts it (the code asks `canApply(outputSettings:forMediaType:)` first and falls back to settings without it) |
| `kVTCompressionPropertyKey_AlphaChannelMode` | not used (the default, premultiplied, is what Core Image writes) | by design |
| `AVAssetWriter.startSession(atSourceTime:)` | "If the earliest sample for an input has a timestamp later than the start time, the system inserts an empty edit to preserve synchronization" | ✔ |
| Playback (session 506) | "The video in AVPlayerLayer will be displayed with a transparent background and composed with the rest of the layers and views." | ✔ transcript. **Unverified:** through expo-video's `AVPlayerViewController` (phone check 1) |
| Custom compositors and alpha | the session shows one **writing** alpha | **Unverified:** that source frames of an alpha track arrive with alpha in 32BGRA (phone check 2) |
| `VNGeneratePersonSegmentationRequest` | iOS 15.0+; `qualityLevel`, `outputPixelFormat: OSType`, `results: [VNPixelBufferObservation]?` | ✔ |
| `VNGeneratePersonSegmentationRequest.QualityLevel` | cases `accurate`, `balanced`, `fast` | ✔ names. **Unverified:** the mask's size at each level, the default output format (the code sets `kCVPixelFormatType_OneComponent8` and checks the format of what comes back), time per frame |
| `VNSequenceRequestHandler.perform(_:on: CVPixelBuffer)` | iOS 11.0+, throws | ✔. **Unverified:** that one handler across frames steadies the mask over time |
| `VNImageRequestHandler(cgImage:options:)`, `perform(_:)` | photo path | not fetched (**unverified**, long-standing) |
| `CIBlendWithMask`, `CIContext.render(_:to:bounds:colorSpace:)`, `createCGImage(_:from:)` | the blend and the two renders | not fetched (**unverified**; the compositor already uses `CIBlendWithMask` and `render(_:to:)`) |
| `AVAssetReaderTrackOutput(track:outputSettings: nil)` + `AVAssetWriterInput(mediaType: .audio, outputSettings: nil, sourceFormatHint:)` | sound copied as stored | not fetched (**unverified**; the render fails cleanly when `canAdd` says no) |
| `AVAssetReaderTrackOutput` with linear PCM settings and a sample rate | beats: decoded float sound at 44 100 Hz | not fetched (**unverified**; the code reads the rate, the channel count and the float flag from each buffer's own description and refuses anything else) |
| `CGImageDestination` with `UTType.png` (iOS 14.0+) | the photo's PNG | not fetched (**unverified**) |
| HDR sources (iPhone Dolby Vision) through Core Image into 8-bit BGRA | colours of the copy against the original | **unverified** (phone check 6) |

## 7. The app side

- **`src/editor/model/cutout.ts`** (pure): the constants, `cutoutRange`, `cutoutFileName`, `cutoutStillName`, `parseCutoutName`, `coveringCopy`, `cutoutNeed` (the copy a clip uses: a known one that covers it, else the planned one), `cutoutRefusal` (`"reversed" | "tooLong" | null`), `neededCutouts(project, missing, known)`, `cutoutSize`, `cutoutDeadlineMs`, `cutoutBytes`.
- **`src/editor/cutoutFiles.ts`**: `useCutoutFiles` (`files` by name: ready with its uri, busy with a progress, failed with a message), `knownCopies` (ready or busy), `cutoutFileOf`, `shownCutout(files, clip)` (the uri to show, or null).
- **`src/editor/cutoutRenders.ts`**: `cutoutDir`, `ensureCutout`, `syncCutouts`, `retryCutout`, `resetCutouts`, `openCutouts`, `useCutoutRenders` (mounted once in the editor screen, beside `useSoundRenders`). On opening a project `openCutouts` registers the copies on disk as ready and removes the files no clip needs; only then may renders start.
- **`src/export/exportCutouts.ts`**: `prepareCutouts` and `withCutout` (the request rewrite of B4); `useExport.ts` calls them after the sounds.
- **Preview:** `ClipFrame.tsx` (the PNG, the forced background, the main clip's follower), `LayerStack.tsx` (the uri for `LayerVideo`), `PreviewTag.tsx` (the tag also shows while a cut-out on screen is not what the export will be).
- **Tool:** `contextFor` (`cutout` after `chroma`; not on a reversed clip; `reverse` not on a clip with the switch on), `toolGroups.ts`, `toolStrip.ts` (`"cutout"` is a `StripId`), `EditorToolbar.tsx`, `CutoutSheet.tsx`.
- **Beats:** `beatDetect.ts` (A2), `beats.ts` (`beatTrack`), `src/editor/ownBeats.ts` (`useOwnBeats`, `beatRange`, `beatKey`, `foundBeats`, `analyseEnvelope`, `listenForBeats`, `stopListening`), `BeatsSheet.tsx`.

## 8. Edge cases

| Case | Behaviour |
|---|---|
| A bundled track | exactly as today: `beats.json`, at once, no native call |
| Own music, new build | the hint reads "Find beats listens to <title> for a few seconds."; a tap shows the spinner, then the markers appear (one undo step) |
| Own music, older build or Expo Go | the hint reads "For your own music, Find beats needs the latest Clipy build. Until then, tap the beat with Tap."; a tap says `BEATS_BACKGROUND_TOOLS`; nothing changes |
| No clear beat (speech, ambient, a tempo that drifts) | "<title> has no steady beat. Tap the beat with Tap instead."; no marker is placed; remembered for the session |
| A sound under 8 s | toast "This sound is too short to find a beat in."; remembered as no beat |
| A file over 10 minutes | the 600 s from where the bar's trim starts are listened to; beats exist only there |
| A bar with a Voice / Sound / Reduce noise setting | its original file is listened to |
| A clip sound on the audio row (the file is a video) | its sound track is decoded like any other |
| A file with no sound track, or one the phone cannot decode | toast "Could not listen to this sound."; the staged message goes to the log |
| Find tapped twice / while busy | the second tap is ignored (the button is off while busy) |
| The panel closed, the editor left, 120 s without an answer | the analysis is cancelled; nothing is placed |
| The track deleted or undone away while listening | the answer is dropped |
| Fewer / More after a Find for own music | re-places from the remembered beats, as for a bundled track |
| The project has music and a voice-over is selected | the music is listened to, as today |
| The project has no music and a voice-over or clip sound is selected | that bar is listened to |
| Remove background on, new build | the strip shows the spinner and a percent; the clip shows as it was until the copy is ready, with the Preview tag |
| Switched off | the key is removed; the clip is as it was; the copy stays on disk until the project is next opened (Undo finds it) |
| Undo / Redo of the switch | instant when the copy exists |
| A clip longer than 60 s (trimmed source) | the switch does not move: "Remove background works on clips up to 60 seconds. Trim or split this clip first." |
| A clip with the switch on is trimmed past 60 s | the key stays; no copy is made; the strip says the same sentence; the clip shows as it was; an export stops with that reason |
| A reversed clip | the Cut out tool is not on its bar |
| A clip with the switch on | Reverse is not on its bar |
| No person in the picture | fails at the end of the render: "No person was found in that clip. It shows as it was." |
| The render fails for another reason | "Could not remove the background. The clip shows as it was."; the strip: "Could not remove the background. Switch it off and on to try again." (switching on asks for the copy again) |
| A trim drag | no render starts until the project has stood still for 0.8 s |
| A trim outwards past the copy | a new copy is rendered; the clip shows as it was meanwhile |
| Split, duplicate | the same copy serves both pieces |
| Replace media | the key stays; a copy of the new file is rendered |
| Speed, a speed curve, keyframes, an animation, a mask, opacity | apply to the copy as to the original (it has the source's timing and shape) |
| A filter or Adjust on a cut-out layer | applied to the person only (the layer's own look), in the preview's approximation as today |
| A filter on a cut-out main clip | applied to the whole frame, the background colour included |
| Green screen on a cut-out | keyed after the cut-out, export only, as today |
| Blend on a cut-out layer | the person's shape is blended; export only, as today |
| Background: Blur on a cut-out main clip | the export blurs the cut-out picture (a blurred figure on black); the Preview tag shows. Use a colour |
| A photo with Motion | unchanged: the pins travel with the clip, the picture is the still movie |
| A collage cell | allowed; it is a layer |
| The 8-layer and 2-video-layer limits | unchanged. A main video cut-out's follower player is not counted |
| The copy has no sound it could carry | the render fails (`cutout sound: …`) |
| Export while a copy is missing | it is rendered first (its share of the progress bar is 30 %); Cancel stops the waiting |
| Export on a build without the tool | cannot happen for a setting made there; a project carried over is exported with its originals |
| Expo Go or an older build | the Cut out tool is on the bar; the switch does not move and says `BEATS_BACKGROUND_TOOLS` |
| A project duplicated | the copies are not duplicated; they are rendered again when the duplicate is opened |
| A project deleted | its `cutout` folder goes with it |

## 9. On an older build and in Expo Go

- **Find beats:** bundled tracks as today. For other music the button is on and says the sentence; nothing is placed.
- **Remove background:** the tool and the strip are on screen; the switch says the sentence and stays off. Nothing is stored.
- **Accounts screen:** reads "App build: noise, ramps and speech" until the new build is installed, then "App build: beats and background".
- **A v20 project** opens in this JavaScript on the older build (the JavaScript comes from the dev server); the build's age only decides what the two tools can do.

## 10. What can only be judged on the phone

1. **Transparency in the preview.** Does a cut-out video layer show the video beneath it, or a black box? The same for a main clip over its background colour.
2. **Transparency in the export.** Does the exported video show the person over the layer beneath / the background colour, or over black?
3. **Time.** How long a 5-second, a 20-second and a 60-second clip take to prepare; whether the phone stays usable meanwhile; whether it gets hot.
4. **Edges.** Hair, fast movement, a second person, a person entering late.
5. **A main video clip's follower:** is the picture in step with the sound; does the person appear late after a cut; does playback stutter with two video layers as well.
6. **Colours:** does the person look the same with the switch on and off, especially on video shot in HDR.
7. **Sound of a cut-out layer** in the preview and the export: the same as before, no click at the start.
8. **Storage:** the size the strip says against the real folder.
9. **Find beats:** how long a three-minute song takes; whether the markers sit on the beat by ear; whether the screen stays alive while it listens; a song from Files, a clip sound, a voice-over.
10. **No steady beat:** is it said for speech and ambient music, and not said for ordinary pop.

## 11. Differences from the approved wording

- **"The result is seen in the PREVIEW":** for photos, yes. For video it depends on phone check 1; if the player cannot show transparency, video cut-outs are export-only with the Preview tag (two TypeScript switches, no build).
- **"On a main clip: the person appears over the clip's background colour":** in the preview by a second, silent player laid over the hidden main picture; it can appear a moment late after a cut. With **Blur** as the background the result is a blurred figure on black, not the blurred scene.
- **"A Remove background switch":** the toolbar button is labelled **Cut out**; the strip and its switch are called Remove background.
- **"about 60 seconds per clip":** 60 seconds of the clip's trimmed source (a 4× clip of 60 source seconds is 15 seconds on the timeline).
- **"Switch it off and the clip is back as it was":** yes. Not said in the approval: a **reversed** clip cannot have its background removed, and a clip with it removed cannot be reversed.
- **"Cut-out copies … are cleaned up when no longer used":** when the project is next opened, not at once (Undo needs them).
- **"works for any music the owner adds … extracted audio, or a recording":** yes; but with music in the project, Find beats listens to the music even when another bar is selected.
- **"the phone listens to the track for a few seconds":** a few seconds for a short song; a five-minute song may take 10–20 seconds (unmeasured).
- **"it says so instead of placing wrong markers":** by the bundled tracks' rule. A steady song at the edge of the rule can be refused; the Tap button still works.
- **"with a progress indicator":** a spinner and a percent in the strip; no bar on the timeline.

## 12. The owner's device checklist

**Part A works with the app you already have** (Accounts reads "App build: noise, ramps and speech"). **Part B needs the new app**, installed once from the link I send.

### Part A: with the app you have now

1. Open a project from before this update and play it. Everything looks and sounds as before. Tell me if anything is different.
2. Tap the audio row, **Beats**. With a built-in song in the project, **Find beats** works as before, at once.
3. Add a song of your own from Files (or select a voice-over in a project without music) and open **Beats**. The line under the slider says Find beats needs the latest build for your own music. Tap **Find beats**: a message says the same, and no marker appears. That is right.
4. Tap a video clip. On its bar, after **Green screen**, there is **Cut out**. Tap it: a strip **Remove background** opens with a switch. Tap the switch: a message says it needs the latest build, and the switch stays off. That is right.
5. Do the same on an overlay layer and on a photo: the same message.
6. Tap a clip you have reversed: **Cut out** is not on its bar. That is right.
7. Open **Accounts**: it still reads "App build: noise, ramps and speech".

### Part B: after installing the new app

Install the new app from the link. **Accounts** now reads "App build: beats and background". If it does not, the install did not happen: tell me.

**Find beats in your own music**

8. Add a song from Files with a clear beat. **Beats**, **Find beats**: a spinner shows ("Listening"), then markers appear. Tell me how long it took and how long the song is.
9. Play: are the markers on the beat? Drag **Fewer / More**: the markers thin out and fill in at once.
10. Tap **Cut to beats** with a few clips in the project: the cuts land on the markers, as with the built-in music. One **Undo** brings the clips back.
11. Try a recording of someone talking: a line says it has no steady beat, and no markers appear.
12. In a project without music, extract a clip's sound, select that bar and tap **Find beats**: it listens to that sound.
13. Start Find beats on a long song and close the panel while it listens: nothing appears afterwards, and the app carries on normally.
14. Was the screen still responding while it listened?

**Remove background, the main use: a person over another video**

15. Put a video on the main track. Add a video of a person as an **Overlay**, about ten seconds long. Tap the overlay, **Cut out**, and switch **Remove background** on. A spinner and a percent show. Tell me how long it took.
16. When it says **Ready**: in the preview, do you see the person with the main video behind them, **or a black box around the person**? This is the most important answer of the whole list.
17. Play: does the person move in step with their own sound? Any stutter?
18. Switch it off: the overlay is the full video again. Switch it on: it is cut out again at once (no waiting).
19. Trim the overlay shorter, split it, change its speed: the cut-out stays, with no new waiting.
20. Export. In the exported video: is the person over the main video, **or over black**? Tell me.
21. Look at the edges: hair, hands, quick movement. Good enough to use?

**Remove background on a photo**

22. Add a photo of a person as an overlay and switch Remove background on: a moment later the person is cut out. Export and check.
23. Put a photo of a person on the main track, give it a colour with **Background**, and switch Remove background on: the person stands on that colour, in the preview and in the export.

**Remove background on a main video clip**

24. Do the same with a video on the main track: after the wait, the person plays over the background colour. Does the person appear a moment late when playback reaches the clip? Is the picture in step with the sound?
25. Export and check: the person on the colour, not on black.

**Limits and failures**

26. Try a clip longer than a minute: a message says to trim or split it first.
27. Try a clip with nobody in it (a landscape): after the wait a message says no person was found, and the clip is as it was.
28. Try a clip of about 30 seconds and one of about 60: how long did each take? Did the phone get hot? Could you keep editing meanwhile?
29. A clip shot in HDR (the ordinary iPhone camera): does the person's colour look the same with the switch on and off?
30. Close the project and open it again: the cut-outs are still there, without waiting.

**Tell me**

31. For each of 16, 20, 24 and 25: what you saw.
32. Whether a minute per clip is enough.
