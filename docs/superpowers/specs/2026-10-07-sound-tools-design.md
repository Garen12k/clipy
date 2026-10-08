# Sound tools: Extract audio, Voice changer, Sound quality (and a noise-reduction test): design

**Date:** 2026-10-07
**Status:** Implemented 2026-10-08 (on-device confirmation by the owner pending); section 3a says what was built. Plan: `docs/superpowers/plans/2026-10-07-sound-tools.md`.
**Builds on:** CapCut group D (`2026-10-04-capcut-d-audio-design.md`: audio tracks, fades, ducking, `audioMix.ts` ↔ `AudioMix.swift`), the strips and panels (`2026-10-05-editing-ui-r1-toolbar-strips-design.md`, `2026-10-05-editing-ui-r2-tall-panels-design.md`), and the first working native build (main `024a0a0`, 7 October 2026). Schema v17 → **v18**. **New Swift** (one new native build). No new package, no new asset.

## What this round does and does not do

This round adds three sound tools and one test. **Extract audio** turns a video clip's sound into its own bar on the audio row and mutes the clip. **Voice** changes how a sound bar sounds: seven one-tap voices (Deep, High, Chipmunk, Robot, Echo, Hall, Telephone), a Strength slider and a separate Pitch slider. **Sound** (titled "Sound quality") has four equaliser presets and one switch, **Even out loudness**. Every effect is a stored setting on the sound bar; the original file is never changed, and the setting can be switched off or undone at any time. When a setting is picked the phone renders a changed copy of the sound once (a second or two for a short recording), and that copy is what the preview plays and what the export mixes. The round also builds a small **test** that tells us whether Apple's voice clean-up unit can run on a saved recording; it shows nothing to the user. It does **not** add a Reduce noise switch, vocal removal, AI voices or voice cloning. It does **not** apply effects to a clip's sound in place: Voice and Sound on a video clip first move the clip's sound to the audio row (the same step as Extract audio) and then work on that bar. Extract audio works in Expo Go and in the build installed today; Voice and Sound need the new native build and say so in one sentence where it is missing.

## 1. Goals and non-goals

**Goals**
1. The owner's four approved items, as worded, except where §11 lists a difference.
2. **Nothing existing changes.** A project saved before this round loads, previews and exports exactly as before; the migration changes only the schema number (§4.3 is the proof).
3. **Nothing changes on its own.** A sound setting is written only by a tap or a drag; a changed copy is rendered only for a setting the owner chose; no file the owner imported is ever modified or deleted.
4. **One native build.** All Swift lands, is read through by an independent reviewer, and is built once. Tuning a voice or an equaliser preset afterwards is a TypeScript change and needs **no** new build (§3, decision 1).
5. Every new native failure reports a stage and `ExportSession.describe(error)`.

**Non-goals:** a Reduce noise feature (only the probe, §9), effects on a clip's sound in place, effects that change a sound's length (rate stays 1), true LUFS loudness, per-band equaliser sliders, a waveform view, vocal removal, AI voices, voice cloning, Android, web.

## 2. Where things stand today (read 2026-10-07, `main` 024a0a0)

- **Audio tracks.** `Project.audioTracks: AudioTrack[]` (max 12; `kind` music / voice / sfx; `start`, `trimStart`, `trimEnd`, `volume` 0–2, `fadeIn`, `fadeOut`). Ops in `ops.ts`: `addAudioTrack`, `updateAudioTrackById`, `splitAudioTrackAt`, `duplicateAudioTrack`, `deleteAudioTrack`; every stored track goes through `cleanAudioTrack`, which spreads the track (an unknown field survives). `kind` decides the lane, the minimum length (0.5 s; sfx 0.1 s) and ducking: with ducking on, **music** dips while a **voice** track is audible; **sfx** neither ducks nor is ducked.
- **Preview.** `AudioPreview.tsx` mounts one `TrackPlayer` per track: an `expo-audio` player (`useAudioPlayer`, an `AVPlayer` on iOS: `node_modules/expo-audio/ios/AudioPlayer.swift`, `AudioUtils.createAVPlayer`) that loads `track.sourceUri` with `player.replace({ uri })` and already handles the file changing under it. A clip's own sound is played by the video player (`PreviewPlayer.tsx`, never edited).
- **Export.** `useExport` builds `ExportAudioTrack { sourceUri, start, trimStart, trimEnd, gain }` (`toExportAudioTrack`; gain from `audioMix.ts`). `ExportSession.swift` loads each one with `AVURLAsset(url:)` and `loadTracks(withMediaType: .audio).first`, inserts `[trimStart, trimEnd)` at `start`, and applies the gain ramps. A file with no audio track throws `No sound in audio file …` and fails the export. The same code would accept a **video** file as an audio track's source: it only asks the asset for its first audio track.
- **Native module.** `ClipyVideoModule.swift`: `exportTimeline`, `cancelExport`, `transcribe`, `cancelTranscribe`, event `onExportEvent`. `modules/clipy-video/index.ts` wraps them behind `requireOptionalNativeModule`; `isNativeAvailable()` is false in Expo Go. Captions and Export say "… need the native build" there.
- **Media files.** `storage.importMedia` / `importAudio` copy into `<project>/media/`. Nothing deletes a media file while the project exists (only `deleteProject` removes the folder), so a file referenced by two items stays as long as the project does. `duplicateProject` copies each item's file with `overwrite: true`, so two items sharing one file copy it twice to the same place: harmless.
- **Toolbar.** `contextFor` decides every bar; 51 tool ids. The audio bar is `audioSplit, audioVolume, audioFade, audioDuplicate, audioDelete, addAudio, ducking, beats`.
- **Loading.** `normaliseCurrent` spreads each stored audio track, then repairs `kind` and the fades. `migrateProject` refuses a file whose `schemaVersion` is above the app's.

## 3. The nine decisions

Each has the decision, the reason, and what it costs if it turns out wrong.

### 1. Core architecture

**Decision.** A sound setting is one optional field on an audio track, `AudioTrack.sound?: SoundSettings` (§4), absent by default. A native function renders `source file + effect numbers → one .m4a` with `AVAudioEngine` in offline manual rendering. The preview plays that file in place of the original for that track, and the export inserts it in place of the original.

Four choices inside this, each a change from the starting point in the brief:

- **The numbers live in TypeScript only; Swift receives numbers.** `soundChain(settings)` in `src/editor/model/sound.ts` turns a voice, a strength, a pitch and an equaliser preset into unit parameters (pitch in cents, delay time, feedback, wet mix, a reverb preset name, equaliser bands). The render request carries those numbers; Swift only sets them on the units. This is how gain curves already travel (`audioMix.ts` builds them, the export only draws ramps). There is **no mirrored preset table**: one tested place, and a voice can be re-tuned after the owner has heard it **without a new native build**. The only mirrored pair is the small sample maths Swift must run itself: `soundMath.ts` ↔ `SoundMath.swift` (loudness gain and the peak guard, §7).
- **The whole source file is rendered, not the trimmed part.** The changed copy has exactly the timing of the original, so it is a drop-in replacement: `trimStart` / `trimEnd` mean the same in both, and moving, trimming, splitting or duplicating a bar never renders again (both halves of a split share one file).
- **The file is named after what it is**, not a hash: `<source stem>-v1-<voice>-s<strength %>-p<pitch>-<eq>-l<0|1>.m4a` (`soundFileName`). Same source and same settings give the same name, so a file is rendered once and found again. `v1` is `SOUND_VERSION`: raise it when the tables change and old copies are no longer used.
- **Where the files live, and when they go.** `<project>/sound/`. Deleting the project deletes them. When a project is opened in the editor, files in that folder that no track needs are removed (`sweepSounds`); nothing is swept during a session, so Undo finds its file again. A duplicated project does not copy the folder; its copies are rendered on first open.

**While rendering.** The track plays its **original** sound until the copy is ready; the Voice panel / Sound strip shows the kit `Spinner` ("Preparing the sound"). Renders run one at a time. If the owner picks again before a render has finished, a render nobody needs any more is cancelled and only the newest setting is rendered. The queue never waits on the native side for ever: a cancelled render that has not said so within 4 seconds (`SOUND_CANCEL_GRACE_MS`) is left behind, and a render nobody cancelled that has not answered within 120 seconds (`SOUND_RENDER_DEADLINE_MS`, fixed: the manager does not know how long the file is) is told to stop and counts as failed (`sound render: no answer after 120 s`), for the editor and for a waiting export alike. Whatever the native side answers after that is ignored; a copy it still finishes is on disk and is found the next time it is needed.

**A slider drag.** Strength and Pitch write the setting on every frame (one undo step: `beginTransaction` + `applyTransient`, like every slider) but nothing is rendered during the drag: the sheet calls `holdSounds(trackId)` on slide start and `holdSounds(null)` on slide complete (and when it unmounts). One render per drag, on release, of the value the project holds at that moment. Only the dragged track plays its original during the drag; every other track keeps playing its copy.

**When rendering fails.** The stored setting is **kept** (removing it would change the project without a tap). The track keeps playing its original sound, one toast says "Could not prepare that sound. It plays as recorded." (once for everything that fails after a pick or after the project is opened, not once per copy), and the full native message (stage + `describe`) goes to `console.warn` for every copy. It is tried again when the setting changes or the project is opened again.

**Reason.** Non-destructive, undoable, and the existing mix (`audioMix.ts` ↔ `AudioMix.swift`) is untouched.

**If wrong.** (a) Whole-file rendering is slow for a long source: a ten-minute video's sound might take ten seconds or more (unmeasured; §10). The fix would be rendering a padded window around the trim, which costs a time offset in the preview and the export. (b) If offline rendering of one of the units does not work on the phone, that voice fails with a staged message and plays as recorded; nothing else is affected.

### 2. A video clip's own sound

**Decision: option (a).** Voice and Sound work on audio bars only. On a video clip's bar the two tools are still there; tapping one first does **Extract audio** for the owner (one undo step), selects the new sound bar, opens the tool on it, and a toast says "The sound of this clip is now its own bar." If the clip's sound is already on the audio row, the tool just selects that bar and opens.

**Reason.** The clip's sound is played by the video player, which cannot apply an effect; a second, parallel player per clip would have to follow the two-player hand-over and the speed code in `PreviewPlayer.tsx` / `previewHandoff.ts`, which are the most delicate code in the app and are not edited. After the automatic extract the promise "works on a video clip's own sound" is kept, and everything is one mechanism.

**What the owner sees.** Tap a clip → **Voice** → the clip's sound drops to the audio row as a bar named "Clip sound", the clip shows as muted, the Voice panel is open on the new bar. One Undo closes the voice pick, a second Undo puts the sound back in the clip.

**If wrong.** The owner may not want the sound detached (it no longer follows the clip when the clip is moved). The alternative is option (b) in a later round; nothing stored here blocks it.

### 3. Extract audio

**Decision.**
- **The new bar points at the video file itself.** No copy, no native work: `sourceUri` = the clip's `sourceUri`. Verified by reading both sides: the export's audio-track path opens any asset and takes its first audio track (`ExportSession.swift`, the `for audio in request.audioTracks` loop), which is exactly how it reads a clip's own sound; the preview's `expo-audio` player is an `AVPlayer`, which plays the sound of a video file. Not verified on the phone: §10 item 1.
- **Kind `sfx`.** No new kind (that would be a schema change). `sfx` is the one kind that neither ducks the music nor is ducked, so the mix after extracting is the mix before it, and its minimum length (0.1 s) equals a clip's. The bar sits on the sound-effects lane, titled "Clip sound".
- **Placement.** Same project time and source range as the clip: `start` = the clip's start on the timeline (a layer: its `start`), `trimStart` / `trimEnd` = the clip's, `volume`, `fadeIn`, `fadeOut` = the clip's. The clip is then `muted: true`. One `apply` = one undo step.
- **Speed.** A sound bar has no speed. A clip with a speed other than 1× or with a speed curve is **refused** with "Set the speed of this clip back to 1x first. Extracted sound plays at normal speed." (smallest honest behaviour; baking retimed sound natively is a later option). A reversed clip and a photo have no sound: the tool is not on their bar (`contextFor`, the same `sounds` rule as Volume).
- **Limit.** At 12 tracks: "You have reached the audio track limit."
- **No sound in the file.** JavaScript cannot tell. With the new build, `soundInfo(uri)` is asked first and a silent file is refused with "This clip has no sound." In Expo Go and in the build installed today the bar is made anyway and is silent. So that such a bar can never break an export, the export now **skips** an audio track whose file is a video without sound (it still fails for a non-video file without sound, as before).
- **Twice.** A clip whose sound is already on the audio row is not extracted again: the existing bar is selected and a toast says "The sound of this clip is already on the audio row." The rule (`extractedTrackOf`): the clip is **muted**, and there is a track on the same file whose source range overlaps the clip's; of several such tracks, the one that lines up with the clip on the timeline. A clip that is **not** muted still has its sound in it, so it is always extracted afresh, whatever bars are on its file: a duplicate that still has its sound gets a bar of its own even when the original is extracted, and a clip that was un-muted with Volume after extracting gets a second bar when Extract audio is tapped again.
- **Afterwards** the bar is an ordinary sound: move, trim, split, fade, duplicate, delete. It does not follow the clip (no audio bar does). Deleting the bar does not unmute the clip; the clip's Volume strip has the Mute switch.

**If wrong.** A second `AVPlayer` on a large 4K file may cost memory or start late in the preview (§10 item 1). The fallback is a native extract to a real `.m4a` in the next build; the stored track would simply point at the new file.

**Known small difference.** Across a transition the export overlaps the two clips' own sound (transition handles). An extracted bar covers the clip's body only, so the few tenths of a second of overlap are gone.

### 4. Speed and effects

A sound bar has no speed, so effects there have no speed interaction. Pitch changes pitch only: `AVAudioUnitTimePitch.rate` is always 1 and the copy is exactly as long as the source.

### 5. Presets

§6 has the tables and worked vectors; §7 the loudness maths. In short: Strength 0–1 (default 0.5) moves linearly between a gentle and a strong column; Pitch is −12…+12 semitones in whole steps with a tick at 0 and is **added** to the voice's own pitch (total clamped to ±2400 cents, the unit's range); the equaliser presets are band tables; Even out loudness is a gain measured inside the render, with nothing stored but the switch.

**Robot, honestly.** There is no vocoder. Robot is a 12 ms feedback delay (a comb filter: a metallic, monotone ring), a slight pitch drop and a little of Apple's "speech cosmic interference" distortion. It will sound metallic and synthetic, not like a film robot. Because the numbers are TypeScript, it can be tuned by ear after the build without another one.

### 6. Expo Go, and the build installed today

- `isSoundAvailable()` (the linked module has `renderSound`) is false in Expo Go **and** in the build from before this round.
- **Extract audio** works everywhere (it is project data only).
- **Voice** and **Sound** are on the bar everywhere. Without the engine, tapping either shows one toast, "Voice and sound effects need the new native build. Expo Go cannot run them.", and does nothing: no panel, no extract, no change.
- A project that already holds sound settings, opened where the engine is missing: nothing is rendered, every track plays its original file, and the settings stay stored (the loader keeps them; no op removes them).

### 7. Toolbar

- Three new tool ids (51 → 54): `extractAudio` ("Extract audio", `git-branch-outline`), `voice` ("Voice", `mic-outline`), `soundQuality` ("Sound", `stats-chart-outline`). All three glyphs are in the installed Ionicons map.
- **Sound bar:** `audioSplit, audioVolume, audioFade, voice, soundQuality, audioDuplicate, audioDelete, addAudio, ducking, beats`.
- **Clip bar and layer bar:** `extractAudio, voice, soundQuality` right after `volume`, under the same condition (`sounds`: a video that is not reversed).
- **Voice** is a compact **panel** (`ToolPanel`, `size="compact"`, body not scrolling): one row of eight tiles (`StripTiles`, 72 pt) and two slider rows (`StripSlider`, 36 pt each): Strength, Pitch. A strip has room for one slider only.
- **Sound** is a **strip** (`ToolStrip`, title "Sound quality"): one row of five tiles (None, Bass boost, Clear voice, Warm, Bright) and one 36-pt row with the label "Even out loudness" and a switch.
- New `PanelId` `voice`, new `StripId` `soundQuality`; both open through `toolStrip.ts` (select first, open second).

### 8. Export

**Decision.** For every exported audio track with a setting, `useExport` asks `ensureSound` for the copy before it builds the request: an existing file is used, a missing one is **rendered first**. The request then carries the copy's uri as that track's `sourceUri`; `start`, `trimStart`, `trimEnd` and the gain curve are exactly what they would be for the original, so volume, fades, ducking and the end fade apply afterwards as they always did. `audioMix.ts` and `AudioMix.swift` are not touched. While sounds are prepared the export shows the first 10 % of its progress (`SOUND_SHARE`); the video export fills the rest. If a copy cannot be rendered the export **stops** with "Could not prepare a sound for the export: …": it never silently exports a different sound from the one the owner chose.

**If wrong.** A project whose sound cannot be rendered cannot be exported until the setting is switched off. That is the honest failure; the message says which stage failed.

### 9. Testing

- **Pure TypeScript (Jest):** the clamp and the PROOF migration; `soundChain` at strength 0 / 0.5 / 1 for every voice, the pitch sum and its clamp, the band tables; `soundFileName`; `neededSounds`; `levelGainDb` and `softClip` vectors; the ops (`setTrackSound`, `extractClipAudio`, `extractRefusal`, `extractedTrackOf`); `contextFor`.
- **Jest tests that read the Swift source:** `soundMath.parity.test.ts` (constants and formulas of `SoundMath.swift`), `soundRender.swift.test.ts` (the request record's fields equal the TypeScript request's keys; the preset-name and filter-type maps hold exactly the names TypeScript may send; every failure string has a stage tag; the asset is held strongly; `scheduleBuffer` is called with `completionHandler: nil` from a synchronous function; no name is declared twice).
- **RNTL (native mocked):** the Voice panel, the Sound strip, the toolbar actions, the render manager, the preview swapping to the copy, the export preparing sounds.
- **Swift itself:** no XCTest (it runs nowhere). A **Swift read-through review** by an independent reviewer before the build, then **one EAS build**.
- **The owner's device checklist** (§12) for everything only ears can judge.

## 3a. As built (2026-10-08)

Everything below was checked against the committed code. Where it differs from the design above, this section is right.

**Commits (branch `sound-tools`, from `main` 024a0a0).**

| Task | Commit | What |
|---|---|---|
| 1 | 6fc88bf | schema 18, `SoundSettings`, `clampSound`, `VOICES` / `EQS`, PROOF migration |
| 2 | 624ba4d | `soundMath.ts`, `sound.ts` (tables, `soundChain`, `soundFileName`, `neededSounds`) |
| 3 | f14de54 | `setTrackSound`, `extractClipAudio`, `extractRefusal`, `extractedTrackOf` |
| 4 | 4fd431a | the wrapper's `renderSound`, `cancelSoundRender`, `soundInfo`, `probeNoiseReduction`, `isSoundAvailable` |
| 5 | 392c9c8 | `SoundMath.swift` and its parity test |
| 6 | 13e4268 | `SoundRender.swift`, the module functions, the probe, the silent-video skip in `ExportSession.swift` |
| 7 | ff41b07 | `soundFiles.ts`, `soundRenders.ts`, the preview plays the copy |
| 8 | 2ec446f | `useExtractAudio` |
| 9 | 50ab8e5 | the Voice panel |
| 10 | b4277e1 | the Sound strip and the dev-only noise probe |
| 11 | c551221 | toolbar: Extract audio, Voice, Sound |
| 12 | 25f3e6a | export: copies prepared first, the uri swapped |
| fix round 1 | c0e0ac7 | review of the TypeScript side (below) |

**Builds.** One EAS development build for the round: `10e9be42-3474-4350-8f7b-c0e2aef00a4c`, from commit `13e4268` (the commit that holds all the Swift). It FINISHED: the Swift compiled at the first attempt, so no second build was needed. Fix round 1 changed TypeScript only, so it needs no build. Nothing has been tried on the phone yet.

**Native changes.** Only `SoundMath.swift` (new), `SoundRender.swift` (new), `ClipyVideoModule.swift` and the one `guard` in the audio-track loop of `ExportSession.swift`. `AudioMix.swift`, `audioMix.ts`, `audioSync.ts`, `timeline.ts`, `PreviewPlayer.tsx`, `timelineScroll.ts`, `src/ui`, `src/theme` and the guard tests in `src/__tests__` are untouched.

**How it works, as built.**

- Effects live on an audio-row item only: `AudioTrack.sound`, optional, absent when off, written only by `setTrackSound`. A video clip has no setting. **Voice** or **Sound** on a clip first runs Extract audio (one undo step), selects the new bar and opens the tool on it ("The sound of this clip is now its own bar.").
- **Extract audio** works at normal speed only (refused with "Set the speed of this clip back to 1x first. Extracted sound plays at normal speed."), not on a reversed clip or a photo (the tools are not shown). The bar is named "Clip sound", sits on the sound-effects lane, and does not follow the clip afterwards. Deleting the bar leaves the clip muted. A clip counts as already extracted only while it is **muted** and a matching bar exists (with several matches, the one lined up with the clip); a duplicate that is not muted is extracted afresh.
- The toolbar button says **Sound**; its strip is titled **Sound quality**.
- **Robot** is a metallic comb with a light distortion, not a vocoder. **Even out loudness** is one overall gain from a gated level measurement of the dry source (`levelGainDb`: at most +18 dB, at most -6 dB; not LUFS, not a compressor), guarded by `softClip` on every output sample.
- While a copy is prepared the bar plays its original, with a spinner ("Preparing the sound"). During a Strength / Pitch drag only the dragged track plays its original (`holdSounds(trackId)`) and the copy is rendered once, on release. A failed render keeps the setting, plays the original and is said once per project open (`SOUND_FAILED`).
- Copies live in `<project>/sound/`, are named after the setting (`soundFileName`), and the ones no bar needs are swept when a project is opened. Export prepares missing copies first (`SOUND_SHARE`, the first 10 % of its progress) and stops with "Could not prepare a sound for the export: <reason>" if one cannot be rendered.
- In Expo Go, or on a build without the sound functions, Extract audio works; Voice and Sound show `SOUND_UNAVAILABLE` ("Voice and sound effects need the new native build. Expo Go cannot run them.") and change nothing.
- Native: `SoundRender.swift` is an offline `AVAudioEngine` (44.1 kHz, stereo, float) that reads the source streamed through `AVAssetReader` (any container, a video included), writes AAC to a `part-` file and moves it into place, renders one at a time, and answers a cancel with `E_SOUND_CANCELLED`. `SoundMath.swift` is the only mirrored pair of the round (with `soundMath.ts`); the preset numbers live in TypeScript and travel in the request. A JS-side safety net keeps the queue moving: a cancelled render is left behind after `SOUND_CANCEL_GRACE_MS` (4 s), and a render with no answer after `SOUND_RENDER_DEADLINE_MS` (120 s) counts as failed. `outdoorGeneral` is listed in `sound.ts` but left out of the Swift reverb table because it needs a newer iOS than the module's 16.4 target; no voice uses it.
- The noise probe (`noiseProbe.ts`): in a development build, the first time the Sound strip opens with the engine present, `probeNoiseReduction` runs Apple's voice clean-up unit on the file and logs one line, `[noise-probe] {...}`. It runs once per install (key `clipy.noiseProbe.v1`; raise the `v1` to run it again). In the worst case the unit raises inside Apple's code and the app closes once; the next start logs `[noise-probe] {"ok":false,"stage":"crash",...}` and does not run it again.

**Findings of the Swift read-through and their fixes.** The Swift could not be compiled here; it was read against `node_modules/expo-modules-core/ios` by its author (Task 6) and by an independent reviewer (Task 13), and the EAS build then compiled it.

- `AVAudioUnitReverbPreset.outdoorGeneral` is iOS 27 only, so naming it would not compile. Dropped from the Swift table.
- `promise.resolve([...])` with a mixed literal does not compile; the answers are built as `[String: Any]` first.
- Hardening added during the read: the engine status is a `switch` with `@unknown default`; a frame cap and a stall limit end the loop; the unit latency is clamped before `Int(...)`; buffers are checked for two channels and a sane frame count; the file's processing format is compared with the render format before the first write (a mismatch raises an Objective-C exception Swift cannot catch); each pass runs in `autoreleasepool`; one render at a time through a lock that still answers a cancel while waiting.
- Reviewer (Task 13): no compile blocker, verdict "build it". B1: the probe could stop the app through an Objective-C exception inside Apple's unit (not catchable from Swift); covered by the persisted once-per-install guard. C1: pitched voices may be late if `AVAudioUnitTimePitch` reports latency 0 (phone check 1 below).

**Fix round 1 (c0e0ac7), from the review of the TypeScript side.** I-1 the render queue is never hostage to the native side (the grace and the deadline above; the release of a drag renders the final value). I-2 a playing track is paused before its file is swapped (otherwise expo-audio resumes it after the editor paused). I-3 only a muted clip counts as already extracted. M-1 an Extract answer that arrives after the selection or the open tool changed is dropped. M-2 `holdSounds(trackId | null)`, so only the dragged track plays its original. M-3 "Pick a voice to set its strength." under the sliders. M-4 a failure is said once per project open. M-5 the probe is persisted and does not repeat after a crash.

**Deviations the tasks reported.**

- Task 1: the existing PROOF v16 -> v17 test asserted the current schema number of the migrated output; it is now 18 (title and fixture untouched). The pinned 17 became 18 in `migrate.test.ts` and ten `types.*.test.ts`.
- Task 2: `sound.ts` is hardened for input `clampSound` never lets through (NaN strength, an id that is a property of `Object.prototype`); results for valid settings are as designed. Two sources whose names differ only in characters outside `A-Z a-z 0-9 _ -` would share a copy name (media files have generated ids, so this should not occur).
- Task 3: `extractedTrackOf` overlaps with a 1 ms tolerance (stored trims are rounded to 3 decimals, a split clip's are not); the new bar can sit up to 0.5 ms off the clip.
- Task 4: a module that is linked but lacks a sound function (an old build) throws "This build of the app has no sound tools yet..." instead of a raw TypeError.
- Task 6: see the findings above.
- Task 7: a render cancelled before it reached the native side never starts; `uri` is in the volume and sync effect dependency lists of `AudioPreview`; while a slider is held the original plays; a failed setting picked again in the same session is not retried.
- Task 8: the hook selects the new bar and says "already" itself.
- Task 9: the hold is taken before `beginTransaction` and let go on hide / other track / track gone / unmount; without the engine the panel says so and changes nothing.
- Task 10: the probe call is wrapped in `try`; taps are gated on the engine.
- Task 11: Voice / Sound on an already extracted clip find the bar with `extractedTrackOf` and say nothing; the tool opens only if the new bar is still the selection. Pinned lists changed in `toolbarContext.test.ts` (51 -> 54 tool ids), `icons.test.ts`, `EditorToolbar.test.tsx`, `EditorToolbar.layers.test.tsx`.
- Task 12: Cancel during the preparation stops the export but not the native render already running (it finishes for the editor's copy); a project with no sound setting takes literally the old path (PROOF tests pinned against the old code).
- Fix round 1: the I-2 pause applies only to a player this component started (one existing expectation changed: "the copy becomes ready while playing" now starts with `pause`); `extractedTrackOf` prefers the bar lined up with the clip; the "Pick a voice" line sits in the 36-pt row under the sliders; the probe key carries a version; `soundRenders.test.ts` restores the toast store between tests.
- Files outside the plan: `src/editor/noiseProbe.ts` (the probe moved out of the strip), `soundFiles.ts` gained `soundFileOf`.

**What no test checks (section 10, item by item).**

1. An extracted bar on a large video: the second player's start, sync and memory. In the preview it can sit up to a quarter of a second off the picture; the export is exact.
2. How each voice sounds, Robot above all; whether Strength feels even.
3. Pitched voices against the picture: if `AVAudioUnitTimePitch` reports no latency, a pitched copy is late by a few hundredths of a second.
4. Render time for a 10-second recording, a 3-minute song and a long video's sound. The 120 s deadline is a guess, and the 4 s grace needs the native cancel to answer promptly.
5. Even out loudness against the bundled music; the soft clip with Bass boost.
6. AAC priming: a gapless start and no click at the end; and the preview's source swap (a short dropout, no restart from zero, no drift).
7. The probe's answer, and whether the app survives it.
8. Also unverified: a second render of one output path while a cancelled first one is still writing its `part-` file (a Swift-side per-output guard would close it); nothing at all has run on a phone yet.

## 4. Data model: schema v18

```ts
export const SCHEMA_VERSION = 18 as const;

export const VOICE_IDS = ["deep", "high", "chipmunk", "robot", "echo", "hall", "telephone"] as const;
export type VoiceId = (typeof VOICE_IDS)[number];
export const EQ_IDS = ["bassBoost", "clearVoice", "warm", "bright"] as const;
export type EqId = (typeof EQ_IDS)[number];
/** voice: null = none. strength 0–1 (2 decimals). pitch: whole semitones −12…12. eq: null = none. level: Even out loudness. */
export interface SoundSettings { voice: VoiceId | null; strength: number; pitch: number; eq: EqId | null; level: boolean }
export const SOUND_LIMITS = { strength: [0, 1] as const, defaultStrength: 0.5, pitch: [-12, 12] as const };
export const NO_SOUND: SoundSettings = { voice: null, strength: 0.5, pitch: 0, eq: null, level: false };

export interface AudioTrack {
  /* …everything of v17, unchanged… */
  sound?: SoundSettings;   // ABSENT = the sound as recorded (never null / undefined, never a neutral object)
}
```

### 4.1 Rules

- `sound` is **optional and absent by default**. No factory writes it (`makeAudioTrack`, `importAudio`, the recorder, `extractClipAudio`).
- A **neutral** setting (no voice, pitch 0, no equaliser, level off) is never stored: `clampSound` returns `null` for it and the key is removed. So "has a setting" is `"sound" in track`.
- Only `setTrackSound` (ops.ts) writes it. `splitAudioTrackAt` and `duplicateAudioTrack` spread the track, so both pieces / the copy keep the setting.
- A clip has **no** sound-settings field (decision 2).

### 4.2 The sanity pass (every load)

`clampSound(v)`: not an object → null. `voice`: a known id, else null. `strength`: a finite number clamped to 0–1 and rounded to 2 decimals, else 0.5. `pitch`: a finite number rounded to a whole step and clamped to −12…12, else 0. `eq`: a known id, else null. `level`: `true` only when it is exactly `true`. Unknown keys dropped. Neutral → null. In `normaliseCurrent` the track's key is deleted and written back only when the clamp returns a value.

### 4.3 The migration, and its proof

v17 → v18 adds nothing. PROOF test (in `migrate.test.ts`, never edited to pass): a v17 project with music, a voice-over and a sound effect (trimmed, faded, split pieces, volume above 1), ducking on, beat markers, muted and faded clips and a layer migrates to **itself with only the number changed**; the stored object is not mutated; no track has a `sound` key; a second pass changes nothing. The bump is one-way on the owner's phone, as every bump is.

## 5. Native API

All in `modules/clipy-video` (`index.ts` wraps; Swift in `ios/SoundMath.swift`, `ios/SoundRender.swift`, registered in `ClipyVideoModule.swift`).

```ts
export interface SoundBand { type: "parametric" | "lowShelf" | "highShelf" | "highPass" | "lowPass"; frequency: number; gain: number; bandwidth: number }
export interface SoundChain {
  pitchCents: number;                                   // 0 = no pitch unit
  distortionPreset: string; distortionWet: number; distortionPreGain: number;   // "" or wet 0 = no distortion unit
  delayTime: number; delayFeedback: number; delayWet: number; delayLowPass: number;   // wet 0 = no delay unit
  reverbPreset: string; reverbWet: number;              // "" or wet 0 = no reverb unit
  bands: SoundBand[];                                   // [] = no equaliser unit
  level: boolean;                                       // Even out loudness
}
export interface SoundRenderRequest extends SoundChain { jobId: string; sourceUri: string; outputPath: string }
export interface SoundRenderResult { fileUri: string; seconds: number; gainDb: number }

isSoundAvailable(): boolean
renderSound(req: SoundRenderRequest): Promise<SoundRenderResult>     // rejects code "E_SOUND_CANCELLED" or "E_SOUND"
cancelSoundRender(jobId: string): void
addSoundListener(cb: (e: { jobId: string; progress: number }) => void): EventSubscription   // event "onSoundEvent"
soundInfo(uri: string): Promise<{ hasSound: boolean; seconds: number }>
probeNoiseReduction(uri: string): Promise<{ ok: boolean; stage: string; detail: string }>    // §9
```

**Error strings** (every one starts with a stage): `sound open: …`, `sound reader: …`, `sound engine: …`, `sound output: …`, `sound render: …`, `sound info: …`; the tail is `ExportSession.describe(error)` wherever an `Error` exists. Cancel rejects with `Sound cancelled`.

**How a render runs (Swift).**
1. `SoundSource.open(uri)`: an `AVURLAsset` (held strongly for the whole render: a track's `asset` is weak), its first audio track and its duration (`loadTracks(withMediaType:)`, `load(.duration)`).
2. If `level`: one decode pass measures the level (§7) and gives a gain.
3. Decode with `AVAssetReader` + `AVAssetReaderAudioMixOutput` to 44.1 kHz stereo 32-bit float (works for audio **and** video files; `AVAudioFile` cannot be relied on to open a `.mov`).
4. An `AVAudioEngine` graph `AVAudioPlayerNode → [AVAudioUnitTimePitch] → [AVAudioUnitDistortion] → [AVAudioUnitDelay] → [AVAudioUnitReverb] → [AVAudioUnitEQ] → mainMixerNode`, only the needed units attached, `enableManualRenderingMode(.offline, format:, maximumFrameCount: 4096)`, `engine.start()`, `player.play()`.
5. A **synchronous** loop: decoded buffers are scheduled on the player (`scheduleBuffer(_:completionHandler: nil)`, never the async overload), `renderOffline` pulls 4096 frames at a time, the units' reported latency is dropped from the start and rendered on at the end so the copy lines up with the source, each sample is multiplied by the level gain and passed through `SoundMath.softClip`, and the result is written with `AVAudioFile(forWriting:settings:commonFormat:interleaved:)` as AAC `.m4a` (192 kbit/s). The file is written under a `part-` name and moved into place when complete.
6. The cancel flag is checked every loop turn.

**Apple APIs relied on** (pages fetched 2026-10-07 from developer.apple.com/documentation; "✔" = the fact used was on the page):

| API | Fact used | Verified |
|---|---|---|
| `AVAudioEngine.enableManualRenderingMode(_:format:maximumFrameCount:)` | iOS 11+; throws; engine must be stopped; PCM format | ✔ |
| `AVAudioEngine.renderOffline(_:to:)` | throws; returns `.success / .insufficientDataFromInputNode / .cannotDoInCurrentContext / .error`; `frameLength` = frames rendered | ✔ |
| "Performing offline audio processing" (article) | the player → effect → mixer loop this design copies; offline is "usually much faster than real time" | ✔ |
| `AVAudioUnitTimePitch.pitch` | cents, −2400…2400, default 0; `rate` separate | ✔ |
| `AVAudioUnitReverb` | `loadFactoryPreset(_:)`, `wetDryMix`; presets `smallRoom … largeHall, plate, cathedral, …` (14) | ✔ names; `wetDryMix` 0–100 **unverified** (stated only as typical) |
| `AVAudioUnitDelay` | `delayTime` 0–2 s; `feedback` −100…100 %; `lowPassCutoff` 10 Hz…sampleRate/2, default 15000; `wetDryMix` | ✔ (wet range 0–100 **unverified**) |
| `AVAudioUnitDistortion` | `loadFactoryPreset(_:)`, `preGain` (dB), `wetDryMix`; 22 presets incl. `speechCosmicInterference` | ✔ names; ranges **unverified** |
| `AVAudioUnitEQ` | `init(numberOfBands:)`, `bands`, `globalGain` | ✔ |
| `AVAudioUnitEQFilterParameters` | `filterType`, `frequency` (Hz), `bandwidth` (octaves), `gain` (dB), `bypass` | ✔ members; **default of `bypass` unverified** (the page gives none; the code always sets `bypass = false`) |
| `AVAudioUnitEQFilterType` | `parametric, lowPass, highPass, lowShelf, highShelf, …` (11) | ✔ |
| `AVAudioFile.init(forWriting:settings:commonFormat:interleaved:)` | file type from the extension; overwrites | ✔; that AAC in `.m4a` is written correctly from float buffers is **unverified** (common practice) |
| `AVAssetReaderAudioMixOutput.init(audioTracks:audioSettings:)` | LPCM settings with sample rate and channel count | ✔ (that it up-mixes mono to 2 channels is **unverified**; the code reads the channel count from each buffer and handles 1 or more) |
| `AVAudioPlayerNode.scheduleBuffer` | "if there are previous commands, the new one plays immediately following the last one"; usable in manual rendering | ✔ |
| `AVAudioNode.latency` | seconds | ✔ exists; that `AVAudioUnitTimePitch` reports a **correct** latency is **unverified** (§10 item 3) |
| `CMSampleBufferGetDataBuffer`, `CMBlockBufferCopyDataBytes` | copy decoded PCM | not fetched this session (**unverified**, long-standing Core Media API) |
| `AVAudioUnit.instantiate(with:options:)` | async throws; iOS 9+ | ✔ |
| `kAudioUnitSubType_AUSoundIsolation` | iOS 16.0+ | ✔ availability only; the page has no description. Whether it runs offline is what §9 tests |
| `AVURLAsset.loadTracks(withMediaType:)`, `load(.duration)` | already used by the export | in use today |
| `AVPlayer` playing a video file's sound (expo-audio) | preview of an extracted bar | read in `node_modules/expo-audio/ios`; **unverified on the phone** |

**Loudness measurement.** There is no public API for integrated loudness (LUFS). This design uses a gated RMS match (§7). That is a deliberate simplification, said to the owner in the checklist.

## 6. The preset tables (`src/editor/model/sound.ts`, TypeScript only)

`s` = strength 0…1. A value written `a → b` is `a + (b − a)·s`, rounded to 3 decimals (pitch to a whole cent).

### 6.1 Voices

| Voice | Tile icon | Units and values (`s = 0 → 1`) | at 0 | at 0.5 | at 1 |
|---|---|---|---|---|---|
| None | `ban-outline` | nothing | | | |
| Deep | `arrow-down-outline` | pitch −200 → −700 cents | −200 | −450 | −700 |
| High | `arrow-up-outline` | pitch +200 → +600 | 200 | 400 | 600 |
| Chipmunk | `paw-outline` | pitch +700 → +1200 | 700 | 950 | 1200 |
| Robot | `hardware-chip-outline` | pitch −100 → −300; delay 0.012 s, feedback 55 → 85 %, wet 35 → 70 %, low-pass 8000 Hz; distortion `speechCosmicInterference`, wet 8 → 30 %, pre-gain −6 dB | −100 / 55 / 35 / 8 | −200 / 70 / 52.5 / 19 | −300 / 85 / 70 / 30 |
| Echo | `repeat-outline` | delay 0.22 → 0.38 s, feedback 25 → 55 %, wet 20 → 50 %, low-pass 6000 Hz | 0.22 / 25 / 20 | 0.3 / 40 / 35 | 0.38 / 55 / 50 |
| Hall | `business-outline` | reverb `largeHall`, wet 15 → 60 % | 15 | 37.5 | 60 |
| Telephone | `call-outline` | bands: high-pass 200 → 500 Hz; low-pass 5000 → 2600 Hz; parametric 1800 Hz, +2 → +8 dB, 1 octave | 200 / 5000 / +2 | 350 / 3800 / +5 | 500 / 2600 / +8 |

**Pitch slider.** `pitchCents = clamp(voicePitch + pitch × 100, −2400, 2400)`. Vectors: Deep at 0.5 with Pitch +2 → −250; Chipmunk at 1 with Pitch +12 → 2400; no voice with Pitch −3 → −300; Deep at 1 with Pitch −12 → −1900.

### 6.2 Equaliser (band tables; `bandwidth` in octaves, the unit `AVAudioUnitEQ` uses; a shelf and a pass filter ignore it)

| Preset | Tile icon | Bands (type, frequency Hz, gain dB, bandwidth) |
|---|---|---|
| None | `ban-outline` | none |
| Bass boost | `pulse-outline` | lowShelf 110, +6, 1 · parametric 250, −1.5, 1 |
| Clear voice | `chatbubble-outline` | highPass 90, 0, 1 · parametric 300, −3, 1 · parametric 3200, +4, 1.2 · highShelf 9000, +2, 1 |
| Warm | `flame-outline` | lowShelf 200, +3, 1 · parametric 3500, −2, 1.5 · highShelf 8000, −3, 1 |
| Bright | `sunny-outline` | parametric 3000, +2, 1 · highShelf 6500, +5, 1 |

A voice's own bands (Telephone) come first, the equaliser's after them, in one equaliser unit.

### 6.3 The file name

`soundFileName("file:///…/media/abc.mov", { voice: "deep", strength: 0.5, pitch: -3, eq: "warm", level: true })` = `abc-v1-deep-s50-pm3-warm-l1.m4a`. No voice: `plain` and `s0` (strength does not matter then). No equaliser: `flat`. Pitch +2: `p2`; −3: `pm3`.

## 7. Loudness and the peak guard (`soundMath.ts` ↔ `SoundMath.swift`)

Constants (identical on both sides): target −18 dB RMS, gate −45 dB, most boost +18 dB, most cut −6 dB, block 0.4 s; soft clip knee 0.9, ceiling 0.98.

- **Measure** (Swift, on the **source** file): the mono mix `(L + R) / 2` in blocks of 0.4 s, each block's mean square.
- **`levelGainDb(blocks)`**: keep finite blocks above the gate (`10^(−45/10)`); none → 0 dB. `measured = 10·log10(mean of the kept blocks)`; gain = `clamp(−18 − measured, −6, +18)`.
  Vectors: `[]` → 0 · `[1e-6, 1e-7]` (all under the gate) → 0 · `[0.001, 0.001]` → 12 · `[0.001, 1e-6, 0.001]` → 12 (the silent block is ignored) · `[0.01, 0.02, 0.03]` → −1.0103 · `[0.25]` → −6 · `[1e-4]` → 18 · `[10^(−18/10)]` → 0.
- **`softClip(x)`** (always on, so an equaliser boost can never clip either): `|x| ≤ 0.9` → `x`; above, `sign(x)·(0.9 + 0.08·tanh((|x| − 0.9) / 0.08))`. Never above 0.98.
  Vectors: 0.5 → 0.5 · 0.9 → 0.9 · 0.95 → 0.944368 · 1 → 0.967863 · 2 → 0.98 · −1 → −0.967863 · NaN → 0.
- The gain is measured over the **whole file** before the effects, once per render. Nothing is stored but the switch. It is a level match, not a compressor: a recording that is quiet in one half and loud in the other stays uneven.

## 8. Edge cases

| Case | Behaviour |
|---|---|
| Extract on a photo / reversed clip | tool not on the bar |
| Extract on a clip at 2× or with a curve | refused with the speed sentence; nothing changes |
| Extract at 12 tracks | refused with the limit sentence |
| Extract twice | the existing bar is selected; toast; no second bar |
| Extract on a duplicate that is not muted (its original is extracted) | a bar of its own; the duplicate is muted; no "already" toast |
| Extract on a clip that was un-muted after extracting | extracted afresh: a second bar |
| Extract on a muted clip | allowed when no bar holds its sound: the bar gets the clip's volume; the clip stays muted (still one undo step). With a bar on its file and range it counts as already extracted |
| Something else is selected, or a tool is opened, while the file is asked whether it has sound | the answer is dropped: no bar, no selection change, no toast |
| Extract, then Undo | the bar is gone and the clip is un-muted, in one step |
| Clip deleted after extracting | the bar stays and still plays (the file is kept as long as the project) |
| Split / duplicate a bar with a setting | both keep the setting and share one rendered file |
| Trim / move a bar with a setting | no new render |
| Strength drag | one undo step, one render on release (the final value); only the dragged track plays its original meanwhile |
| Strength with no voice | slider disabled; a muted line under the sliders says "Pick a voice to set its strength." |
| Pitch back to 0 with nothing else set | the `sound` key is removed (the bar is as recorded again) |
| The tool closes mid-drag | `holdSounds(false)` on unmount |
| Source file missing | not rendered; the track is silent as today (`missingSourceUris`) |
| Render fails | setting kept; original plays; one toast (however many copies fail at once); retried on a new setting or next open |
| The native side never answers | after 120 s the copy counts as failed; a cancelled render is left behind after 4 s; the next render starts |
| A copy becomes ready while the track is playing | the player is paused, the file swapped, and playback started again at the playhead (a pause in between leaves it paused) |
| Rendered file deleted (by iOS, or a restored backup) | found missing on open or at export and rendered again |
| Voice-over being recorded | tools cannot be opened (`openStrip` already refuses) |
| A track above 1.0 volume | unchanged: the gain curve applies to the copy as to the original |
| A silent video as an audio bar at export | skipped, the export goes on |
| Expo Go / the build from before this round | §3 decision 6 |
| A v18 project on an older build | refused by the loader's existing "newer version" message |

## 9. The noise-reduction probe (test only)

`probeNoiseReduction(uri)` never throws; it resolves `{ ok, stage, detail }`:
1. `find`: `AudioComponentFindNext` for `kAudioUnitType_Effect / kAudioUnitSubType_AUSoundIsolation / kAudioUnitManufacturer_Apple`. Not found → `ok: false`.
2. `instantiate`: `try await AVAudioUnit.instantiate(with:options:)` (errors come back as errors; the plain initialiser could raise instead).
3. `render`: the first 5 seconds of the file go through `player → unit → mixer` with the same offline loop as a real render. `detail` reports the frames rendered, the output level (RMS) and the unit's latency.

It is called from **one dev-only place** (`src/editor/noiseProbe.ts`): when the Sound strip opens in a development session (`__DEV__`) with the engine present, and the result is written to the dev-server log as `[noise-probe] {...}`. No button, no text on screen. If the app closes at that moment, that is a result too (the unit raised inside Apple's code), and it must not repeat: the probe runs **once per install**. Before the native call `started` is stored (the synchronous `localStorage` of `expo-sqlite`, key `clipy.noiseProbe.v1`); after it the answer. On every later app start the strip's first opening only logs, once: `[noise-probe] (stored) {...}` when an answer is stored, or `[noise-probe] {"ok":false,"stage":"crash","detail":"the previous probe did not return"}` when only `started` is, and the probe is not run again. Storage that cannot be read or written: the probe is not run at all. To ask a later build again, raise the `v1` in the key.

**What follows.** `ok: true` with an output that is not silence → next round adds a **Reduce noise** switch to the Sound strip (one more unit in the same chain). Otherwise the alternatives are: (1) a gentle fixed clean-up from units that are known to work: a high-pass at 90 Hz plus a noise gate written in `SoundMath` (helps hum and hiss between words, not noise under speech); (2) recording voice-overs with the system's Voice Isolation microphone mode, which the user switches on in Control Centre (capture only); (3) a bundled open-source denoiser (RNNoise-class), which is a much larger native piece of work.

## 10. What can only be judged on the phone

1. An extracted bar: does the second player start in time and stay in sync on a large video; memory.
2. How each voice sounds, Robot above all; whether Strength feels even from left to right.
3. Whether a pitched voice lines up with the picture (the latency compensation).
4. Render time: a 10-second voice-over, a 3-minute song, the sound of a long video.
5. Whether Even out loudness lands at a level that sits well with the bundled music; whether the soft clip is audible on loud music with Bass boost.
6. AAC written by `AVAudioFile`: gapless at the start, no click at the end.
7. The probe's answer.

## 11. Differences from the approved wording

- "Works on … a video clip's own sound": through an automatic Extract audio (decision 2), not in place.
- "The clip's sound becomes its own bar on the audio row": it is on the **sound-effects lane**, named "Clip sound".
- Extract audio is refused for a clip that is not at normal speed.
- The toolbar button for Sound quality is labelled **Sound**; its strip is titled "Sound quality".
- "Even out loudness … brings a quiet recording up": it can also turn a very loud one down (by at most 6 dB); it is a level match, not LUFS.
- "A moment to prepare (a second or two for a short recording)": a long source takes longer because the whole file is rendered.
- While a copy is being prepared the bar plays its **original** sound.

## 12. The owner's device checklist

The full text is at the end of this section (it is also the last section of the plan, `docs/superpowers/plans/2026-10-07-sound-tools.md`): Part A can be done today in Expo Go or the installed app (Extract audio); Part B after the new build is installed from its link.

Four things to know while going through it (they are how it is built, not faults):

- **An extracted bar does not follow its clip.** Move, trim or split the clip and the bar stays where it was, as long as it was. Move or trim the bar by hand to match.
- **Deleting the bar leaves the clip muted.** The sound does not come back by itself: select the clip, open Volume and switch Mute off.
- **In the preview, the sound of an extracted bar can sit up to a quarter of a second off the picture** (lips and voice not quite together). That is the preview only; the exported video is exact.
- **The first time the Sound strip is opened in the test build, a one-off check of the noise tool from Apple runs in the background.** Nothing shows on screen. In the worst case it could close the app once; open it again and carry on. It will not repeat.

### The checklist, in full

In one line: **Part A works today** (Expo Go, or the app you already installed). **Part B needs the new app**, which you install once from the link I send. (The build for it, EAS 10e9be42-3474-4350-8f7b-c0e2aef00a4c, finished and the Swift compiled; nothing has been tried on a phone yet.)

### Part A: Extract audio (today)

Start with `npx expo start --go --port 8090` and open the app on the iPhone, or open the installed app. Use a project you made **before** this update that has a video with sound and, if you have one, some music.

**Nothing changed**

1. Open the old project and play it. It looks and sounds exactly as before. Tell me if anything is different.

**Extract audio**

2. Tap a **video** clip. In the row of tools, right after **Volume**, there are three new buttons: **Extract audio**, **Voice**, **Sound**. Tap a **photo**: none of the three. That is right. Tell me if a name is cut off.
3. Tap the video clip, then **Extract audio**. A new bar named **Clip sound** appears on the sound-effects row under the clip, exactly as long as the clip, and it is now selected. Play: the video sounds the same as before.
4. Tap the clip, then **Volume**: the **Mute** switch is on. That is how you can tell the clip's own sound is off and the bar is what you hear.
5. Drag the **Clip sound** bar a little to the right and play: the sound now comes late. Press **Undo**: it is back in place.
6. Try **Split**, **Fade** and **Volume** on the bar: they work as for any sound.
7. Tap the clip again and tap **Extract audio** a second time: no second bar is made. The first one is selected and a message says the sound is already on the audio row.
8. Press **Undo** until the bar is gone: the clip's Mute switch is off again and the video sounds as before. Extracting was one single Undo.
9. Give a clip a **Speed** of 2x, then tap **Extract audio**: a message tells you to set the speed back to 1x first, and nothing changes.
10. Tap **Reverse** on a clip: the three sound buttons are gone for that clip (a reversed clip has no sound). Tap Reverse again to bring them back.
11. Delete the **Clip sound** bar: the clip stays muted. To hear it again, tap the clip, **Volume**, and switch **Mute** off.
12. In Expo Go, or in the app you installed before today: tap **Voice** or **Sound**. A message says these need the new native build. Nothing else happens. That is right.

**Tell me**

13. With an extracted bar under a long video: does the sound start on time when you press play in the middle, and does it stay in step with the picture?

### Part B: Voice, Sound and the noise test (after installing the new app)

Install the new app from the link. Open a project and record a short **voice-over** (Audio, Add audio, Record), about ten seconds of talking.

**Voice**

14. Tap the voice-over bar. The row of tools now has **Voice** and **Sound** after **Fade**. Tap **Voice**: you see **None, Deep, High, Chipmunk, Robot, Echo, Hall, Telephone**, a **Strength** slider (greyed out) and a **Pitch** slider at 0.
15. Tap **Deep**. A small spinner shows at the top for a moment. While it spins you still hear your normal voice; when it stops, play: your voice is deeper. Tell me how long the spinner took.
16. Try each of the others. For each, tell me in a word or two how it sounds and whether it is too weak, too strong or about right. **Robot** is the one I most need your ears for: it should sound metallic and artificial; it will not sound like a film robot.
17. With **Echo** selected, drag **Strength** from left to right and let go. While you drag you hear the normal voice; a moment after you let go you hear the new echo. Gentle at the left, strong at the right.
18. Tap **None**, then drag **Pitch** to **+3**: the voice is a little higher, with no other effect. Drag it to **−3**: a little lower. You feel a small tick at 0.
19. Pick **Deep** and also set **Pitch** to **+2**: slightly less deep than Deep alone. The two add up.
20. Press **Undo** a few times: each tap of a tile and each drag of a slider is one step back.
21. Tap **None** and set Pitch to **0**: the bar is your original recording again. Your recording was never changed.
22. With **Deep** on, **Split** the bar in the middle: both halves are still deep, straight away, with no spinner.
23. With a voice on, watch a part where you can see lips or a clap: is the changed sound still in step with the picture? Tell me if it is early or late.

**Voice on a video**

24. Tap a **video** clip, then **Voice**. A message says the sound of this clip is now its own bar; the bar appears and the Voice panel is open on it. Tap **Chipmunk**: the video's sound is high. Press **Undo** twice: first the voice goes, then the sound is back inside the clip.

**Sound**

25. Tap the voice-over bar, then **Sound**. The strip is titled **Sound quality**: **None, Bass boost, Clear voice, Warm, Bright**, and a switch **Even out loudness**.
26. Tap each preset and play. Tell me which ones you can clearly hear and whether any is unpleasant.
27. Record a second voice-over **very quietly** (hold the phone far away). Tap it, **Sound**, and switch on **Even out loudness**. After the spinner it should be about as loud as your normal recording. Switch it off: quiet again.
28. Put a bundled music track under both recordings and play: with **Even out loudness** on, do the voice and the music sit well together? Too loud, too quiet, or right?
29. Put **Bass boost** on a loud music track: does it distort or crackle? It should not.

**Export**

30. Export the project. The progress starts with a short "sounds" part and then the video. In the exported video every voice and sound setting is there, exactly as in the editor, and fades and volume still work on those bars.
31. Close the app completely, open the project again and play: the effects are still there (there may be no spinner at all, because the changed sounds are kept).

**The noise test (you do nothing special)**

32. The first time you opened **Sound** on a recording in the new app, the phone quietly tried Apple's voice clean-up on it and wrote the result to my log. Just tell me you have done step 25, and tell me if the app **closed by itself** at that moment. I will read the answer and tell you whether a **Reduce noise** switch is possible next round.

**Tell me**

33. A three-minute song with **Hall**: how long does the spinner take?
34. Would you rather hear the previous effect while a new one is being prepared, instead of the original? And would you like the voice tools to work on a clip without moving its sound to the audio row? Both are possible later; I left them out to keep this round safe.
