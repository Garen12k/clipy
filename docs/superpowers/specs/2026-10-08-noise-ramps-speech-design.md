# Reduce noise, smooth speed ramps, Read aloud: design

**Date:** 2026-10-08
**Status:** Implemented 2026-10-08 (on-device confirmation by the owner pending); §3a says what was built and §12 is the corrected checklist. Approved by the owner in chat ("yes"), with one correction found afterwards (the ramps, below). Plan: `docs/superpowers/plans/2026-10-08-noise-ramps-speech.md`.
**Builds on:** the sound tools (`2026-10-07-sound-tools-design.md`: `AudioTrack.sound`, `soundChain`, `SoundRender.swift`, `ensureSound`), the speed curves (`2026-10-04-capcut-c2-speed-curves-design.md`: `Clip.speedCurve`, `timeline.ts`, `SpeedSpans.swift`, `insertRetimed`), the strips and panels, and the build label (main `762ff53`). Schema v18 → **v19** (one optional field, for Reduce noise only). **New Swift** for two of the three features (one new native build). No new package, no new asset.

## What this batch does and does not do

This batch adds three things. **Reduce noise** is a switch with a Strength slider in the Sound tool of a sound bar: the phone runs Apple's own voice-isolation unit over the recording, which keeps the voice and pushes down wind, traffic, fans and room hum. It is one more stored setting on the bar; the original file is never changed and the switch can be turned off at any time. **Read aloud** is a row in the Text panel: it turns what was typed into speech with one of the voices installed on the iPhone and puts the result on the audio row as an ordinary sound bar that starts where the text starts. **Smooth speed ramps** need a correction to what was approved. The approval said "this adds Hero, Bullet, Flash in, Flash out, Montage and Jump cut as new tiles". Those six tiles **already exist**: they are today's Curve presets, and they change speed in eight sudden steps. So this batch does **not** add six tiles. It makes the same six **smooth**: a new **Smooth** switch in the Curve tab (on for every new pick) writes the same shape as 32 small pieces in which the speed slides from one value to the next instead of jumping, and the picture on each tile shows the shape that will be written. A clip that already has a stepped curve in a saved project is not touched: it plays and exports exactly as before until the owner taps a tile or the switch on it. The batch does **not** add true slow motion (slow parts still repeat frames), a wider speed range inside a ramp (it stays 0.25× to 4×), a free-hand curve editor, AI or cloned voices, reading captions aloud, or noise reduction on a clip's sound in place (as with Voice and Sound, a clip's sound is first moved to the audio row). Smooth ramps are TypeScript only and work with the app already installed; Reduce noise and Read aloud need the new native build and say so in one sentence where it is missing.

## 1. Goals and non-goals

**Goals**
1. The owner's three approved items, as worded, except where §11 lists a difference.
2. **Nothing existing changes.** A project saved before this batch loads, previews and exports exactly as before. Three proofs: the v18 → v19 migration changes only the number (§4.3); a stored stepped curve gives the same steps, length and export spans as today, pinned as literals (§6.4); a sound setting without noise gives the same chain and the same copy file name as today (§5.3).
3. **Nothing changes on its own.** A noise setting, a smooth curve and a speech bar are written only by a tap or a drag. No render and no synthesis starts on load.
4. **One native build.** All Swift lands, is read through by an independent reviewer, and is built once. The ramp numbers, the noise strength mapping and the speech pace mapping are TypeScript and can be tuned without another build.
5. Every new native failure reports a stage and `ExportSession.describe(error)`; a tool the installed build cannot run says `NEEDS_LATEST_BUILD(...)` and never throws "undefined is not a function".

**Non-goals:** optical-flow slow motion, speeds outside 0.25×–4×, custom curve points, new curve presets, noise reduction for music, a noise meter, reading captions or several texts at once, choosing a pitch for the spoken voice (the Voice tool does that on the bar afterwards), Personal Voice, downloading voices from inside the app, Android, web.

## 2. Where things stand today (read 2026-10-08, `main` 762ff53)

- **Speed curves.** `Clip.speedCurve: { id, steps } | null`; `steps` are `{ from, speed }` in source seconds, sorted; step *i* runs to step *i + 1*. `SPEED_CURVE_IDS` = montage, hero, bullet, jumpCut, flashIn, flashOut; `SPEED_CURVES[id].shape` holds eight speeds; `curveSteps` writes eight equal slices over the clip's trim. `SPEED_LIMITS` = 0.25–4; `SPEED_CURVE_LIMITS` = 8 slices, at most **64** stored steps, a step shorter than 0.01 source seconds is merged away (`clampSpeedCurve`). All speed maths is in `src/editor/model/timeline.ts`, and every function there works on **any number of steps** (`speedSpans`, `legs`, `walkToSource`, `walkToOutput`).
- **Preview of a curve.** `PreviewPlayer.tsx` (never edited) asks `rateAt` for the speed of the step under the playhead and writes `player.playbackRate` only when that speed differs from the one last written. The playhead follows the player's own time every 0.05 s (`timeUpdateEventInterval`), so the picture cannot drift; only the moment of a rate change is up to 0.05 s late. `preservesPitch` is on. Layers do the same in `LayerVideo.tsx`.
- **Export of a curve.** `toExportClip` sends `playbackSpans(clip)` (source seconds and speed per span, any count). `ExportSession.swift` inserts the clip's range once and retimes it piece by piece, last to first (`insertRetimed`, `scaleTimeRange`), from cut points built by `SpeedSpans.plan` and `retimeCuts`. Each cut is placed from the **start of the clip** (absolute sums, rounded once to 1/600 s), so rounding never adds up; the clip's two ends are fixed first, and a cut that does not land strictly after the previous one on the 1/600 s grid is dropped (its piece joins its neighbour). Nothing in Swift limits the number of spans. No audio time-pitch algorithm is set anywhere, so the export uses AVFoundation's default.
- **Sound tools.** As built in §3a of the sound-tools design. The Sound tool is a **strip** (one tile row, one 36-pt switch row). The noise probe ran on the owner's iPhone on 2026-10-08 and answered `{"ok":true,"stage":"render","detail":"frames 220500 outputRms 0.124… latency 0.0"}`: `kAudioUnitSubType_AUSoundIsolation` was instantiated with `AVAudioUnit.instantiate`, took the 44.1 kHz stereo float format on its first input and output bus (`SoundProbe.accepts`), and rendered five seconds offline through `SoundRender.process` as the only unit of the chain.
- **Text panel.** `TextPanel.tsx` is a regular `ToolPanel` with a scrolling body: the field, templates, fonts, the five look rows, size, colour, alignment, fine-tune, Duplicate / Delete. It serves captions too (`overlay.kind`).
- **Audio rows.** At most 12 tracks; kinds music / voice / sfx; a `voice` track ducks the music when ducking is on. Media files live in `<project>/media/` and are never deleted while the project exists; `duplicateProject` copies every track's file.
- **Build label.** `src/lib/buildInfo.ts`: `LEVELS` (newest first) and `NEEDS_LATEST_BUILD(what)`.

## 3. Decisions

Each has the decision, the reason, and what it costs if it turns out wrong.

### A. Smooth speed ramps

**A1. A smooth curve is the same field with more steps; no native change, no schema change.**
A smooth curve is stored in the existing `Clip.speedCurve.steps`: 32 steps instead of 8 (`SMOOTH_PER_SLICE` = 4 pieces per slice). The speeds come from the preset's own eight numbers: each sits at the centre of its slice, a straight line joins neighbouring centres, and before the first and after the last centre the edge speed holds; each piece takes the line's value at its own centre (§6.1). Everything downstream is the machinery that exists: `timeline.ts` already walks any number of steps, the preview already follows `rateAt`, and the export already retimes span by span. **No Swift is written for ramps**, so smooth ramps work with the build installed today.
*Reason.* I read both sides for limits. TypeScript: 32 is under `maxSteps` (64); the only other rule is `minStep`, which makes a clip shorter than 0.32 source seconds unable to hold 32 steps (it is refused with the existing sentence, A4). Swift: `SpeedSpans.usable / fitted / plan` and `retimeCuts` loop over whatever they are given; cut times are absolute, so 32 pieces round no worse than 8; a piece too short for the 1/600 s grid is merged, not broken.
*If wrong.* (a) The preview writes a new rate up to 31 times per clip instead of 7. If the player stutters or the sound crackles in the **preview**, lower `SMOOTH_PER_SLICE` to 2 (16 steps): a TypeScript constant, no build. (b) The export's sound is time-stretched in 32 short stretches instead of 8. If that crackles in the **exported** video, the same constant is the first fix; the second is a native audio path for curved clips, which is a later round. Both are phone checks (§10).

**A2. Whether a stored curve is smooth is read from its length, not from a flag.** `isSmoothCurve(clip)` = more than 8 steps. No field is added, so an older copy of the app reads a smooth curve as what it is, a list of steps, and plays it identically.
*Reason.* The steps are the whole truth of the curve; a flag beside them could disagree with them. The app only ever stores exactly 8 (stepped) or exactly 32 (smooth): `presetCurve` refuses a curve that lost a step to the sanity rule.
*If wrong.* If a later round adds a stepped preset with more than 8 steps, the rule needs a flag then.

**A3. One switch, not six new tiles.** The Curve tab keeps its seven tiles (None and the six) and gains a 36-pt row under them, in the place the Normal tab's slider has: **Smooth** with a switch. The strip's height does not change. For a clip without a curve the switch starts **on**; for a clip with a curve it shows what that curve is (a clip from an old project: off). A tile writes the preset in the form the switch shows. Flipping the switch on a clip that has a curve rewrites that curve in the other form: one undo step. The tile pictures follow the switch: eight bars when off (as today), 32 thin bars when on, drawn from `curveProfile(id, smooth)`, the same numbers that are stored.
*Reason.* The owner asked for smooth ramps; the stepped ones are what old projects hold and what "Jump cut" literally is, so they stay reachable at the cost of one row.
*If wrong.* The switch is one more thing to understand. It can be removed later (always smooth for new picks) without touching stored data.

**A4. Old clips are untouched.** `curveSteps`, `clampSpeedCurve`, every function in `timeline.ts` and all of `SpeedSpans.swift` / `ExportSession.swift` keep their code. `setClipSpeedCurve` gains a fourth parameter `smooth` that defaults to `false`. Replacing a clip's media re-spreads its curve in the form it had. A clip too short for the chosen form is refused with the existing "This clip is too short for a speed curve." (stepped needs 0.08 source seconds, smooth 0.32).

**A5. The range stays 0.25×–4×.** The research note suggested wider ramps (0.1× to 10×). `clampSpeedCurve` clamps every stored speed to `SPEED_LIMITS`, the Normal slider and `cappedSpeed` share the constant, the preview's player and its pitch-keeping are untested outside that range, and below 0.25× the repeated frames become obvious. Widening it is its own round with its own phone checks.

**A6. What smoothing does to each preset (honest differences).** Smoothing is not free of side effects (§6.2 has the numbers): a single slow slice between fast ones becomes a V that no longer reaches the bottom (Montage dips to 0.75× instead of 0.5×; Hero and Bullet keep their slow middle because it is two slices wide), every smooth clip is **shorter** than its stepped twin except the two Flash presets (which barely change), and smooth **Jump cut** is a wave between 1× and 4×, not a jump.

### B. Reduce noise

**B1. One more unit, first in the existing render.** Reduce noise is `AudioTrack.sound.noise` (§4). `soundChain` turns it into one number, `noiseWet` (percent), which travels in the render request like every other number. In `SoundRender.swift` the isolation unit is made by `SoundNoise.make` and placed **first**: `player → isolation → [pitch] → [distortion] → [delay] → [reverb] → [equaliser] → mixer`. It is connected exactly as the probe proved: `AVAudioUnit.instantiate(with:options:)` (async, errors are thrown), the render format set on its first input and output bus (`SoundProbe.accepts`, a refusal is thrown), then `engine.attach` / `engine.connect(_, to:, format:)` in `SoundRender.process`, which is not changed.
*Reason for first.* The unit is trained on natural speech. After a pitch shift, an echo or a telephone filter it would be judging a sound it was never taught; before them it cleans the recording and the effects then work on a clean voice.
*If wrong.* If the unit misbehaves when other units follow it (the probe ran it alone), that render fails with a staged message and the bar plays as recorded; the fix would be a two-stage render through a temporary file.

**B2. Strength maps to the unit's wet/dry mix, on a curve.** Strength 0–1 (default 0.5) becomes `noiseWet = 100 − 50 · (1 − s)²` percent (§5.2): 50 % at the left (the noise is halved, −6 dB), 87.5 % in the middle (−18 dB), 100 % at the right (only the isolated voice).
*Reason.* The mix is a linear blend, so the noise that is left is `1 − wet`; equal slider steps should sound like equal steps, which a straight line in percent does not give (almost all of the audible change would sit in the last tenth).
*If wrong.* The curve is one TypeScript line; raise `SOUND_VERSION` only if it changes after the owner has copies they care about (a changed mapping changes what an existing file name means).

**B3. Loudness is still measured on the recording as it is.** With Even out loudness and Reduce noise both on, the level is measured on the dry source, as today, and the gain is applied after the chain.
*Reason.* Measuring after the unit needs a second pass through it, and the unit is the slow part.
*If wrong.* Noise louder than the −45 dB gate counts as sound, so a noisy recording with long pauses measures a little quieter than its voice really is and comes out up to about 3 dB louder than intended. The soft clip keeps it from distorting. The fix is measuring inside the render, in a later round.

**B4. The Sound tool becomes a compact panel.** A strip has room for one tile row and one 36-pt row; Reduce noise needs a switch, a slider and one line of text besides what is there. So "Sound quality" becomes a compact `ToolPanel` like Voice: tiles (72 pt), Even out loudness (36), **Reduce noise** with its line "Best on speech. Music can sound odd." (48), **Strength** (36): 192 of the 195 pt the body has. The id `soundQuality` moves from `StripId` to `PanelId`; the toolbar button, its place and its title do not change.
*If wrong.* While a panel is open the timeline is hidden (as with Voice). If the owner misses the timeline there, the alternative is two tabs inside the strip.

**B5. Stored as `noise?: number`; schema 19.** The strength is the stored value; absent means off (§4). This is the only stored change of the batch and it gets a schema bump, although it is one optional key inside an existing optional record.
*Reason.* A copy of the app from before this batch runs `clampSound`, which drops keys it does not know. It would open a project, silently lose the noise setting, and save the project without it. Refusing to open ("made by a newer version") is the honest behaviour, and the bump is what gives it. Smooth ramps and Read aloud store nothing new and would not need a bump.
*Cost.* The bump is one-way on the owner's phone, as every bump is: once a project has been opened with this batch, an older copy of the app refuses it.

**B6. Gating.** Two questions, asked of the native module: does the build have the function (`isNoiseBuild()`: `noiseAvailable` exists), and does this iPhone have the unit (`isNoiseAvailable()`: it answers true). The switch does nothing and says why when either is no: `NEEDS_LATEST_BUILD("Reduce noise and Read aloud")`, or "This iPhone cannot reduce noise." `ensureSound` refuses a noise setting the same way **before** asking the native side, because a build from before this batch would ignore the unknown request field, render without the unit and leave a wrongly named copy on disk.

**B7. Time.** How much slower a render is with the unit is unknown (§10). The manager's fixed deadline stays 120 s for a setting without noise and is **600 s** for one with (`SOUND_NOISE_DEADLINE_MS`); the cancel grace stays 4 s. The export waits on the same call.

**B8. The probe stays.** `noiseProbe.ts` and `probeNoiseReduction` are left as they are. The probe has had its one run on the owner's phone and will not run again; removing it would touch five test files and three source files for no behaviour. `SoundNoise` reuses `SoundProbe.accepts`. Removing the probe is a clean-up for a later round.

### C. Read aloud

**C1. A row in the Text panel.** The Text panel's body scrolls, so a new section fits its height rules. Right under the text field (and the template row) there is a row **Read aloud** with a chevron, closed at first like the look rows. Open, it shows: a row of language chips, a row of voice chips, a **Speed** slider, the **Read aloud** button, and one muted line. It is shown for a text only, not for a caption. It is not a toolbar tool, so `contextFor`, `toolStrip.ts` and `EditorToolbar.tsx` are not touched.

**C2. The voices are the iPhone's.** `listVoices()` returns `AVSpeechSynthesisVoice.speechVoices()` (id, name, language code, the language's name in the phone's language, quality) and the phone's current language code. Novelty and Personal voices are left out where the system can tell (iOS 17 and later). The chips show the languages (the phone's own first), then the voices of the chosen language, best quality first, marked "Enhanced" / "Premium". The last voice and speed are remembered on the phone (`clipy.readAloud.v1`, the same synchronous storage the welcome flag uses), not in the project.

**C3. Speed is a pace, mapped in two halves around Apple's default.** The slider is 0–1 with a tick at 0.5 ("Normal"). TypeScript sends `rate = 0.35 + 0.3 · pace` (0.35 … 0.5 … 0.65). Swift places that number between Apple's own constants: below 0.5 between `AVSpeechUtteranceMinimumSpeechRate` and `AVSpeechUtteranceDefaultSpeechRate`, above between the default and `AVSpeechUtteranceMaximumSpeechRate`. So 0.5 is always the system's normal pace whatever the constants' values are.
*If wrong.* If the two ends are too timid or too extreme, the two numbers 0.35 and 0.65 are TypeScript.

**C4. What is made.** One `.caf` file in `<project>/media/`, named `speech-<text id>-<new id>.caf`, holding the speech in the voice's own PCM format; then one audio track: kind `voice` (it is speech: it sits on the voice-over lane and ducks the music when ducking is on), title = the first 24 characters of what was read, `start` = the text's start, whole file, volume 1. One `apply` = one undo step. The text stays selected and the panel stays open; a toast says "The voice is on the audio row, under the text."

**C5. A second tap replaces.** The bars made from a text are recognised by their file name (`speech-<text id>-`). Tapping Read aloud again for the same text removes them and puts **one** new bar where the earliest of them started, keeping that bar's volume, fades and Voice / Sound setting; trims start afresh (the new speech has a new length). One undo step. If the owner had deleted the bar, a new one is made at the text's start.
*Reason.* The natural second tap is "same text, other voice or speed". A second bar on top of the first would play both at once.
*If wrong.* An owner who wants two readings of one text duplicates the text first (the copy has its own id) or duplicates the bar after. No field links text and bar, so nothing is stored for this.

**C6. What is read.** `speakableText`: emoji, variation selectors and joiners are removed (the system would otherwise say their names), white space is collapsed. Nothing left → "There is nothing to read in this text." More than 1000 characters → "This text is too long to read aloud." At 12 tracks with no bar to replace → "You have reached the audio track limit." All three are said before anything native runs.

**C7. Busy, stop, late answers.** While the phone is synthesising, the button's place shows the spinner ("Preparing the voice") and **Stop**; the preview is paused first. Stop, closing the panel, or 90 seconds without an answer (`SPEECH_DEADLINE_MS`) cancel the synthesis; the half-written file is removed. An answer that arrives after the project or the text is gone is dropped and its file removed. Nothing is written to the project in any of these cases.

**C8. Files left behind.** An undone or replaced reading leaves its `.caf` in `media/`, exactly like every other media file today (nothing is deleted while the project exists; Redo finds it again). They are small: about 2.6 MB per minute at the usual 22 kHz mono 16-bit.

**C9. Native shape.** `SpeechJob` (in new `SpeechRender.swift`) owns the `AVSpeechSynthesizer` for the whole job (the system does not keep it alive), calls `write(_:toBufferCallback:)` on the main queue, creates the `AVAudioFile` from the **first** buffer's format and checks that the file's processing format is exactly that format before the first write (a mismatch would stop the app, as the sound render learnt), and ends on the first of: an empty buffer (the end marker), three seconds without a buffer after some arrived, twenty seconds with none, or a cancel. The file is written as `part-…` and moved into place.

### D. Build label and gating

`LEVELS` gains a first row `{ name: "noise, ramps and speech", has: isSpeechAvailable }` (`isSpeechAvailable()` = the module has `speakToFile`). Both new native tools say `NEEDS_LATEST_BUILD("Reduce noise and Read aloud")` on an older build and in Expo Go.

## 3a. As built (2026-10-08)

Everything below was checked against the committed code. Where it differs from the design above or below, this section is right.

**Commits (branch `noise-ramps-speech`, from `main` 762ff53).**

| Task | Commit | What |
|---|---|---|
| 4 | 0670d38 | the wrapper: `isNoiseBuild`, `isNoiseAvailable`, `isSpeechAvailable`, `listVoices`, `speakToFile`, `cancelSpeech`, `isSpeechCancelled`; `LEVELS` row "noise, ramps and speech"; `LATEST_TOOLS` |
| 1 | 1932c1d | schema 19, `SoundSettings.noise?`, `NOISE_LIMITS`, `clampSound`, PROOF migration |
| 2 | f3d6c74 | `SMOOTH_PER_SLICE`, `smoothSpeedAt`, `curveProfile`, `smoothCurveSteps`, `isSmoothCurve` (39 lines added to `timeline.ts`, none changed); `setClipSpeedCurve(…, smooth = false)`; the stepped PROOF |
| 5 | 5dfcbdc | `noiseWet` in `soundChain`, the `-n<percent>` name, the Swift record's `noiseWet` field |
| 3 | 775a8c9 | `speech.ts`: `speakableText`, `speechRate`, `speechFileName`, `speechTracksOf`, `speechRefusal`, `placeSpeech`, the voice lists |
| 10 | 5a0741b | the Smooth switch and the 32-bar pictures in `SpeedSheet.tsx` |
| 6 | 6ba6a6c | Swift: `SoundNoise`, `SoundRender.render(…, lead:)`, `noiseAvailable` |
| 8 | 9f8379d | `noiseRefusal`, `SOUND_NOISE_DEADLINE_MS`, the refusal in `ensureSound` |
| 11 | 948254a | `speechPrefs.ts`, `useReadAloud.ts` |
| 9 | 0b0a1a6 | the Sound tool as a compact panel with Reduce noise and Strength; `soundQuality` is a `PanelId` |
| 12 | ab46d8e | `ReadAloudSection.tsx`, mounted in `TextPanel.tsx` for texts |
| 7 | f27a4ba | Swift: `SpeechRender.swift`, `listVoices` / `speakToFile` / `cancelSpeech` in the module |
| 13 | ea17b3f | the Swift read-through's one fix (below) |
| review | 6652c87 | TypeScript fixes from the batch review (below) and the export pin for smooth clips |
| 14 | this commit | README, AGENTS, this section, the checklist |

Tests at the end: app 4856 (292 suites), server 464 (15 suites), typecheck clean.

**Builds.** One EAS build was started, from ea17b3f, after the read-through. It was still running when this section was written: its id and its result are not recorded here, and nothing in this section has been confirmed by a compiler or a phone. The review commit after it (6652c87) is TypeScript only, so the build's Swift is the Swift of this branch.

**The Swift read-through (Task 13).** Verdict: no compile blocker found, build it. One finding was fixed before the build: a reading was called finished after 3 seconds without a buffer, which could cut a slow voice short; `SpeechRender.idleSeconds` is now **8** (ea17b3f). One finding was left as optional: the isolation unit's mix is set but not read back, so a unit that ignores the value is found only by ear (§10 item 4). The unknowns the read-through could not settle are the phone checks of §10.

**The batch review (6652c87).** Five changes, each test-first:
- A smooth pick that does not fit while the stepped form would: the strip **stays open** and says "This clip is too short for a smooth curve. Switch Smooth off." (several clips: "These clips are too short for a smooth curve. Switch Smooth off."). Switching Smooth on for a stepped clip too short for it says "This clip is too short for a smooth curve." and also leaves the strip open. A clip too short for either form keeps the old behaviour: the strip closes, "This clip is too short for a speed curve." This replaces what A4 and the §8 row say.
- Closing the Read aloud row while the phone is speaking ends the reading first (before, the reading carried on unseen and a bar appeared later).
- After a reading that replaced a bar the toast is "The voice was replaced on the audio row." (the new bar sits where the old one stood, which need not be under the text); a first reading keeps "The voice is on the audio row, under the text."
- When the list of voices cannot be read the row says "Could not read the list of voices. Close and open this row to try again."
- `timeline.smooth.export.test.ts`: what `toExportClip` sends for a smooth clip, as literals worked out apart from the app's code (Hero on 8 s: 32 spans of 0.25 s, 6.584331 s; reversed; trimmed inside a piece; the 0.32 s minimum; a layer).

**Smooth ramps, as built.**
- The six presets are unchanged; the Curve tab has a **Smooth** switch in a 36-pt row under the tiles. For a clip without a curve it starts on (local state); for a clip with a curve it is **read from the clip on every render** (`isSmoothCurve`), so it is still true after an Undo. The design seeded it once.
- With several clips selected the switch changes the **form only**: each clip keeps its own preset and a clip without a curve gets none. The design would have written the shown clip's preset to all of them.
- A smooth curve is `Clip.speedCurve.steps` with 32 steps, recognised by its step count. No Swift, no schema change: it previews in Expo Go and exports with the build installed before this batch.
- The stepped proof lives in its own file, `timeline.stepped.proof.test.ts` (§6.4 names `timeline.smooth.test.ts`, which holds a copy of the block). It imports nothing the batch added, was seen green before `timeline.ts` was touched and is byte-identical after. It is the file that is never edited to make a change pass.
- `smoothSpeedAt` answers 1 for a shape without speeds (one guard beyond §6.1). The numbers of §6.2 were recomputed twice by scripts that do not use the app's code, and match.
- A clip under 0.32 source seconds cannot take the smooth form (0.32 exactly can); the stepped form needs 0.08.

**Reduce noise, as built.**
- `sound.noise` is the strength, 0–1 in hundredths, **absent when off**; `noise: 0` is ON at the lightest (50 %, name `-n0`). `noiseWet(s) = 100 − 50·(1 − s)²`, three decimals; a strength that is not a number gives the plain chain and the plain name.
- Swift: `SoundNoise.make(wet:format:)` runs in the module's `Task` (the batch's one `await`), and the unit is handed to the unchanged synchronous render as `lead: [AVAudioNode] = []` (a default, so a render without noise passes an empty array and takes the same path as before). A strength that is not finite is refused (`sound noise: the strength is not a number`) rather than rendered at 100 %. `process`, `measure`, `units(for:)` and `SoundProbe` have no diff; loudness is measured on the dry source.
- `noiseRefusal()` asks the build, then the phone; `ensureSound` asks it before `mkdir` or any native call, and a copy already on disk is returned without asking. Whether a setting has noise is asked of the chain (`soundChain(sound).noiseWet > 0`), like the copy's name.
- The panel: tiles 72, Even out loudness 36, Reduce noise 48 (with "Best on speech. Music can sound odd."), Strength 36. The spinner moved to the header slot, as in Voice. Without the sound engine the Reduce noise switch says the sound-engine sentence once, like the tiles; with the engine but an older build it says `LATEST_TOOLS` on every tap. In Expo Go the Sound button itself says the engine sentence and the panel does not open.

**Read aloud, as built.**
- `speakableText` drops emoji, pictographs, arrows (U+2190–21FF) and geometric shapes (U+25A0–25FF) by code-point range; variation selectors, the keycap mark and tag characters go without a gap. A zero-width joiner **between two letters stays** (the design removed every joiner, which would have cut Arabic, Persian and Indic words in two); a non-joiner is ordinary text. A text of only spaces and unheard marks is "".
- File names: `speech-<overlay id>-<new id>.caf`, with any character outside letters, digits and "-" escaped so two ids never share a name. Where one text's id begins another's, a file belongs to the longer one.
- `placeSpeech` refuses through `speechRefusal` (so a text edited to nothing or past 1000 characters during the reading changes nothing) and writes the kept sound setting with `setTrackSound`. The replaced reading's file is kept: Undo needs it. Nothing ever trims those files; they go with the project.
- `useReadAloud`: Stop, closing the row, another text in the panel, and leaving end the reading **at once** on the app's side, whether or not the phone answers; the phone is told once. An answer after that, for another project, for a text that is gone, or for words that changed is dropped and its file removed. Words changed during a reading: "The text changed, so nothing was read. Tap Read aloud again." The deadline is 90 s.
- Swift (`SpeechRender.swift`): empty text is refused natively as well; silence is counted in 0.25-second looks, not read from the clock (an app suspended mid-speech does not come back to a "finished" reading); a reading ends on the empty buffer after sound, or after **8 s** of looks without a buffer; it fails after 20 s with no sound at all, or past 1800 s of speech (`speech render: the speech did not stop`); a buffer in a format the file cannot take is a clean failure; the job is kept one second past its end so the synthesizer is not released inside its own callback. Neither the audio session nor `usesApplicationAudioSession` is touched.

**Existing tests whose expectations changed** (each because of a rule this batch changed on purpose):
- The pinned schema number 18 → 19 in `migrate.test.ts` and the `types.*` tests (Task 1).
- `sound.test.ts`: the `NEUTRAL` chain literal gained `noiseWet: 0`; `index.test.ts`: the request literal gained it (Task 5).
- `soundRender.swift.test.ts`: the pinned type list gained `SoundNoise`, the pinned stage list gained `noise` (Task 6).
- `SoundQualitySheet.test.tsx`: "the noise test: once per app start…" and "the noise test took the app down last time…" asserted that no text holds the word "noise"; they now assert the only one is the switch's name (Task 9).
- `SpeedSheet.test.tsx`: "a pick sets the curve in one undo step…" (the stored speeds are the smooth profile), "each preset draws eight bars…" (switches Smooth off first), "shows the clip's output length…" (7.7 s → 6.6 s) (Task 10); "a clip too short for the smooth form…" and "the switch on a stepped clip too short for the smooth form…" (the strip stays open, the new sentences) (review).
- `LayerSheets.test.tsx`: "Speed: re-picking the current speed is silent; a refused curve gets the layer message" switches Smooth off first (Task 10; a file outside the plan's list).
- `ReadAloudSection.test.tsx`: "the list cannot be read…" expects the sentence with its hint (review).

No guard test in `src/__tests__` changed, `looks.frozen.test.ts` and every `*.parity.test.ts` are untouched, and `git diff main` is empty for `SpeedSpans.swift`, `ExportSession.swift`, `AudioMix.swift`, `SoundMath.swift`, `PreviewPlayer.tsx`, `LayerVideo.tsx`, `timelineScroll.ts`, `audioMix.ts`, `toolbarContext.ts`, `EditorToolbar.tsx`, `src/ui`, `src/theme`, `package.json`, `app.json`, `eas.json` and `assets/`.

**What no test checks (§10, item by item).** The tests read the Swift as text and run the TypeScript; none of them hears or sees anything.
1. Smooth ramps in the preview: evenness, and the sound across 31 rate changes. Tests pin only the numbers the player is given.
2. Smooth ramps in the export: the spans sent are pinned; what `scaleTimeRange` and the default time-pitch algorithm make of 32 short pieces is not, nor a clip whose pieces are shorter than a frame, nor export start-up with many smooth clips.
3. Whether the shapes feel right.
4. Reduce noise: that the unit cleans, that the mix set before the engine starts is honoured (both ends of Strength), that it works with other units after it and over a whole file, and how long it takes.
5. Reduce noise with Even out loudness: the level of the result.
6. Read aloud: that the synthesizer sends an empty end buffer, each voice's buffer format, that Enhanced / Premium voices work, that Stop stops the synthesizer, and whether tapping Read aloud dips or stops other apps' audio.
7. A `.caf` through the sound render (Voice, Reduce noise on a spoken bar).
8. A `.caf` in the preview player and in the export.
Also unseen: the look of the compact Sound panel and of the 32-bar tiles, the Switch thumb returning after a refused tap, and Arabic read by an Arabic voice.

## 4. Data model: schema v19

```ts
export const SCHEMA_VERSION = 19 as const;
export const NOISE_LIMITS = { strength: [0, 1] as const, defaultStrength: 0.5 };
export interface SoundSettings {
  voice: VoiceId | null; strength: number; pitch: number; eq: EqId | null; level: boolean;   // v18, unchanged
  noise?: number;   // Reduce noise: ABSENT = off; present = on at this strength, 0–1 (2 decimals)
}
```

### 4.1 Rules
- `noise` is optional and **absent** when the switch is off (never `null`, never `undefined` in a stored object). `NO_SOUND` has no `noise` key.
- A setting whose only change is `noise` is a setting: `isNeutralSound` is false when the key is there.
- Only `setTrackSound` writes it (unchanged code: the patch is merged and clamped). Switching off is the patch `{ noise: undefined }`, which the clamp turns into "no key".
- `Clip.speedCurve` is unchanged in type and clamp. A smooth curve is 32 steps in the same field.
- Read aloud stores nothing new: an ordinary `AudioTrack`.

### 4.2 The sanity pass
`clampSound`: as v18, then `noise` is kept only when it is a finite number, clamped to 0–1 and rounded to 2 decimals; anything else (a string, `true`, `null`) is dropped. Idempotent.

### 4.3 The migration, and its proof
v18 → v19 adds nothing. PROOF test (appended to `migrate.test.ts`, never edited to pass): a v18 project with sound settings on two tracks (a voice with strength and pitch; an equaliser with level), a stepped speed curve on a clip, music, a split piece, ducking and beats migrates to **itself with only the number changed**; the stored object is not mutated; no track's `sound` has a `noise` key; the curve's steps are the stored ones; a second pass changes nothing.

## 5. Reduce noise: numbers and native API

### 5.1 The request
`SoundChain` gains `noiseWet: number` (0 = no isolation unit). `SoundRenderRequest` (TypeScript and the Swift record) gains the same field; the swift-reading test compares the two key lists.

### 5.2 Strength → mix
`noiseWet(s) = round3(100 − 50 · (1 − s)²)`, `s` clamped to 0–1.

| Strength | 0 | 0.25 | 0.5 | 0.75 | 1 |
|---|---|---|---|---|---|
| `noiseWet` (%) | 50 | 71.875 | 87.5 | 96.875 | 100 |
| noise left | −6 dB | −11 dB | −18 dB | −30 dB | none |

### 5.3 The file name
With noise the copy's name gets `-n<strength %>` before the extension: `abc-v1-plain-s0-p0-flat-l0-n50.m4a`, `abc-v1-deep-s50-pm3-warm-l1-n75.m4a`. **Without noise the name is exactly today's** (`abc-v1-deep-s50-pm3-warm-l1.m4a`), so every copy on disk is found again and `SOUND_VERSION` stays 1. PROOF test: the names and the chains (apart from the new `noiseWet: 0`) of the old vectors are unchanged.

### 5.4 Native
```ts
isNoiseBuild(): boolean                    // the module has `noiseAvailable`
isNoiseAvailable(): boolean                // … and it answers true (this iPhone has the unit); never throws
```
Swift (`SoundRender.swift`): `enum SoundNoise { static func component() -> AudioComponentDescription; static func isOnThisPhone() -> Bool; static func make(wet: Double, format: AVAudioFormat) async throws -> AVAudioUnit }`; `SoundRender.render` gains `lead: [AVAudioNode]` (the units that go before the request's own). The module: `Function("noiseAvailable")`, and `renderSound` makes the unit (it is the only async step) before calling the synchronous render.

**Setting the mix.** First through the unit's parameter tree, `auAudioUnit.parameterTree?.parameter(withAddress: AUParameterAddress(kAUSoundIsolationParam_WetDryMixPercent))?.value`; if the tree has no such parameter, through `AudioUnitSetParameter(unit.audioUnit, kAUSoundIsolationParam_WetDryMixPercent, kAudioUnitScope_Global, 0, …, 0)`; if that reports an error the render fails with `sound noise: the strength could not be set (<status>)`. It never renders at a strength the owner did not choose. `kAUSoundIsolationParam_SoundToIsolate` is left at its default.

**Error strings:** `sound noise: the sound isolation unit is not on this iPhone`, `sound noise: <describe>` (instantiate, or the format refused), `sound noise: the strength could not be set (<status>)`; every other failure is the existing `sound <stage>: …`.

**What cannot be caught.** An Objective-C exception raised inside the engine cannot be caught in Swift. The design therefore does only what the probe did on the phone (same instantiate, same `accepts`, same `process`), with two differences that the probe did not cover: other units may follow the isolation unit, and the whole file is rendered instead of five seconds. Both are phone checks.

## 6. Smooth ramps: numbers

### 6.1 The sampling
`shape` = the preset's eight speeds, each clamped to 0.25–4. For a position `u` (0–1 along the clip's trim): `x = 8u − 0.5`; `x ≤ 0` → `shape[0]`; `x ≥ 7` → `shape[7]`; otherwise `shape[i] + (shape[i+1] − shape[i]) · (x − i)` with `i = floor(x)` (`smoothSpeedAt`). Piece `j` of 32 has the speed at its own centre, `u = (j + 0.5) / 32`, rounded to 4 decimals (`curveProfile(id, true)`); its `from` is `trimStart + j · (trimEnd − trimStart) / 32` (`smoothCurveSteps`). Between two centres the four pieces sit at 1/8, 3/8, 5/8 and 7/8 of the way, so a jump of the stepped preset becomes five equal smaller ones. The first two and the last two pieces hold the edge speed.

### 6.2 The six profiles and their lengths
Speeds of the 32 pieces, and the output length of an **8-second** clip (trim 0–8): stepped = Σ 1 / speed over 8 slices; smooth = Σ 0.25 / speed over 32 pieces.

| Preset | Smooth profile (32 speeds) | Stepped length | Smooth length | Slowest / fastest (smooth) |
|---|---|---|---|---|
| Montage | 2.5 ×6, 2.25, 1.75, 1.25, 0.75, 0.75, 1.25, 1.75, 2.25, 2.5 ×4, 2.25, 1.75, 1.25, 0.75, 0.75, 1.25, 1.75, 2.25, 2.5 ×6 | 6.4 s | 4.749206 s | 0.75 / 2.5 |
| Hero | 1, 1, 1.125, 1.375, 1.625, 1.875, 2.125, 2.375, 2.625, 2.875, 2.6875, 2.0625, 1.4375, 0.8125, 0.5 ×4, 0.8125, 1.4375, 2.0625, 2.6875, 2.875, 2.625, 2.375, 2.125, 1.875, 1.625, 1.375, 1.125, 1, 1 | 7.666667 s | 6.584331 s | 0.5 / 2.875 |
| Bullet | 3.5 ×10, 3.1, 2.3, 1.5, 0.7, 0.3 ×4, 0.7, 1.5, 2.3, 3.1, 3.5 ×10 | 8.380952 s | 6.188205 s | 0.3 / 3.5 |
| Jump cut | 1, 1, then a wave between 1.375 and 3.625, ending 4, 4 (the exact list is under the table) | 5 s | 3.812711 s | 1 / 4 |
| Flash in | 4, 4, 3.875, 3.625, 3.375, 3.125, 2.875, 2.625, 2.375, 2.125, 1.9375, 1.8125, 1.6875, 1.5625, 1.4375, 1.3125, 1.1875, 1.0625, 1 ×14 | 5.75 s | 5.702982 s | 1 / 4 |
| Flash out | Flash in, back to front | 5.75 s | 5.702982 s | 1 / 4 |

The exact Jump cut list: `1, 1, 1.375, 2.125, 2.875, 3.625, 3.625, 2.875, 2.125, 1.375, 1.375, 2.125, 2.875, 3.625, 3.625, 2.875, 2.125, 1.375, 1.375, 2.125, 2.875, 3.625, 3.625, 2.875, 2.125, 1.375, 1.375, 2.125, 2.875, 3.625, 4, 4`.

The largest jump between two neighbouring pieces: Montage 0.5, Hero 0.625, Bullet 0.8, Jump cut 0.75, Flash 0.25 (stepped: 2, 2.5, 3.2, 3, 1).

One more vector: Hero on the 8-second clip at output second 2.0 shows source second 3.083333 stepped and 3.262616 smooth.

### 6.3 Pieces against frames
A piece is 1/32 of the clip's source range: 0.25 s for an 8-second clip, 31 ms (about one frame at 30 fps) for a 1-second clip, 10 ms at the 0.32 s minimum. In the export a piece shorter than a frame only decides when the neighbouring frames show; a piece shorter than 1/600 s after retiming joins its neighbour. Because cuts are placed from the clip's start, the clip's total length is exact whatever the pieces round to. In the preview a rate is held for at least one 0.05 s tick, so a clip whose pieces play for less than that skips rates; the picture still follows the player's own time.

### 6.4 The proof that stepped curves did not change
PROOF test (new file `timeline.smooth.test.ts`, its PROOF block never edited to pass): for each of the six presets, `curveSteps(id, 0, 8)` equals a literal list (eight `{ from: 0, 1, … 7 }` with the shape's speeds, Bullet's 0.3 kept); `clipDuration` of an 8-second clip holding those steps equals the literal stepped length above; `playbackSpans` has 8 entries; `setClipSpeedCurve(p, id, preset)` **without** the fourth argument stores exactly those steps; `clampSpeedCurve` of the stored curve returns it unchanged; `isSmoothCurve` is false. `git diff main -- modules/clipy-video/ios/SpeedSpans.swift modules/clipy-video/ios/ExportSession.swift` is empty at the end of the batch.

## 7. Read aloud: native API and numbers

```ts
export interface SpeechVoice { id: string; name: string; language: string; languageName: string; quality: number }   // quality: Apple's raw value, 1 default, 2 enhanced, 3 premium
export interface SpeechVoices { current: string; voices: SpeechVoice[] }
export interface SpeechRequest { jobId: string; text: string; voiceId: string; rate: number; outputPath: string }   // rate 0–1, 0.5 = the system's normal pace
export interface SpeechResult { fileUri: string; seconds: number }

isSpeechAvailable(): boolean
listVoices(): Promise<SpeechVoices>
speakToFile(req: SpeechRequest): Promise<SpeechResult>     // rejects code "E_READ_ALOUD_CANCELLED" or "E_READ_ALOUD"
cancelSpeech(jobId: string): void
isSpeechCancelled(e: unknown): boolean
```

**Pace → rate.** `speechRate(pace) = round3(0.35 + 0.3 · pace)`: 0 → 0.35, 0.25 → 0.425, 0.5 → 0.5, 0.75 → 0.575, 1 → 0.65. Swift (`SpeechRender.rate`): `r ≤ 0.5` → `min + (default − min) · r / 0.5`; else `default + (max − default) · (r − 0.5) / 0.5`; a value that is not a number counts as 0.5.

**Error strings:** `speech output: not a file path`, `speech voice: this voice is not on the iPhone any more`, `speech output: this voice gives a sound the file cannot take`, `speech output: <describe>`, `speech render: no sound came out`; cancel rejects with `Speech cancelled`.

**Apple APIs relied on** (pages fetched 2026-10-08 from developer.apple.com/tutorials/data/documentation/…; "✔" = the fact used was on the page):

| API | Fact used | Verified |
|---|---|---|
| `AVSpeechSynthesizer.write(_:toBufferCallback:)` | iOS 13.0+; "Call this method to receive audio buffers to store or further process synthesized speech" | ✔ declaration and availability. **Unverified:** that the last callback carries an empty buffer; which thread the callback runs on; whether it may be called off the main thread (the code calls it on main); whether it touches the app's audio session or disturbs a playing preview (the flow pauses the preview first) |
| `AVSpeechSynthesizer.BufferCallback` | `(AVAudioBuffer) -> Void` | ✔ |
| `AVSpeechSynthesizer` (overview) | "The system doesn't automatically retain the speech synthesizer, so you need to manually retain it until speech concludes." | ✔ |
| `stopSpeaking(at:)` | `-> Bool` | ✔ declaration. **Unverified:** that it stops a `write` in progress (the job also stops listening, so a cancel answers either way) |
| `usesApplicationAudioSession` | iOS 13.0+; setting it `false` makes the system use its own session | ✔; default value **not documented**; not set by this design |
| `AVSpeechSynthesisVoice.speechVoices()`, `identifier`, `name`, `language` (BCP 47), `quality`, `init?(identifier:)`, `currentLanguageCode()` | list and fields | ✔ |
| `AVSpeechSynthesisVoiceQuality` | cases `default`, `enhanced`, `premium` | ✔ names. The page gives one availability for the whole enum; `premium` is believed to be newer than the enum, so the Swift names **no case** and sends `quality.rawValue` (**raw values 1 / 2 / 3 unverified**; an unknown number shows no mark) |
| `AVSpeechSynthesisVoice.voiceTraits`, `Traits.isNoveltyVoice`, `.isPersonalVoice` | iOS 17.0+ | ✔; used only inside `if #available(iOS 17.0, *)` |
| `AVSpeechUtterance.rate` | within `AVSpeechUtteranceMinimumSpeechRate … MaximumSpeechRate`, default `AVSpeechUtteranceDefaultSpeechRate`; set before the utterance is enqueued | ✔; the constants' numeric values are **not on the page** (the mapping does not depend on them) |
| `AVAudioFile.init(forWriting:settings:commonFormat:interleaved:)` | used by the sound render already | in use today. **Unverified:** that every voice's buffers are a PCM format a `.caf` takes (checked at run time, a clean failure otherwise), and that all buffers of one utterance share one format (checked per buffer) |
| `kAUSoundIsolationParam_WetDryMixPercent` | `var … : AudioUnitParameterID { get }`, iOS 16.0+ | ✔ declaration and availability. **Unverified:** its range (assumed 0–100), its default, and that a value set before the engine starts is honoured in offline rendering |
| `kAUSoundIsolationParam_SoundToIsolate` | iOS 16.0+ | ✔ exists; not used |
| `AUParameterTree.parameter(withAddress:)` | `-> AUParameter?`, iOS 9.0+ | ✔ |
| `AudioUnitSetParameter`, `AVAudioUnit.audioUnit`, `AUParameter.value` | the fallback and the setter | not fetched this session (**unverified**, long-standing API) |
| `kAudioUnitSubType_AUSoundIsolation` offline in the engine | instantiates, takes 44.1 kHz stereo float, renders, latency 0 | ✔ **on the owner's phone** (the probe, 2026-10-08), five seconds, alone in the chain |
| `AVMutableCompositionTrack.scaleTimeRange` with 32 pieces; the export's default time-pitch algorithm | sound quality of a smooth ramp | **unverified** (phone check) |
| Hermes and `\p{…}` in a regular expression | not relied on: `speakableText` uses code-point ranges | by design |

## 8. Edge cases

| Case | Behaviour |
|---|---|
| A clip from an old project with a stepped curve | Curve tab opens with its tile ringed and Smooth **off**; nothing is rewritten |
| Smooth switched on for that clip | the same preset is written as 32 steps over the clip's current trim: one undo step; the clip's length changes (§6.2) |
| A tile tapped with Smooth on, clip shorter than 0.32 source seconds | refused: the strip closes, "This clip is too short for a speed curve." |
| The ringed tile tapped again, same form, same trim | nothing (no undo step, no haptic) |
| Several clips selected | the switch starts from the shown clip; a tile writes every clip that can take the form, the others are skipped silently, as today |
| Trim / split / duplicate / replace media of a smooth clip | as for any curve: steps are source times; a split keeps the whole curve on both halves; Replace re-spreads the preset in the same form |
| Keyframes, animations, beat cut, extract audio on a smooth clip | unchanged rules: they go through `timeline.ts`; Extract audio still refuses a curved clip |
| Reduce noise on, then off | the `noise` key is removed; with nothing else set the bar is as recorded again |
| Strength drag | one undo step, one render on release; only that track plays its original meanwhile (`holdSounds`) |
| Strength with the switch off | slider disabled |
| Reduce noise on music | allowed; the line under the switch says what to expect |
| Reduce noise on a build without it / a phone without the unit | the switch does not move; one sentence says why |
| A project that holds a noise setting, opened on such a build | not rendered: the copy counts as failed ("Could not prepare that sound. It plays as recorded."), the setting stays |
| The unit refuses the format, cannot be made, or the strength cannot be set | the render fails with `sound noise: …`; the original plays |
| A noise render takes longer than 600 s | told to stop; counts as failed |
| Export with a noise setting | the copy is prepared first, as for every setting; a failure stops the export with its reason |
| Read aloud on a caption | the row is not shown |
| Text of only emoji or spaces | "There is nothing to read in this text." |
| Text over 1000 characters | "This text is too long to read aloud." |
| 12 tracks and no earlier reading of this text | "You have reached the audio track limit." |
| No voice installed for any language | the row says "No voices are installed on this iPhone." and has no button |
| The remembered voice was removed from the phone | the best voice of the phone's language is chosen instead |
| A text in a language the chosen voice does not speak | the system reads it as best it can; if nothing comes out: "Could not read this text aloud." |
| Read aloud tapped twice quickly | the second tap is ignored while the first is busy |
| Stop, or the panel closed while busy | cancelled; no bar; the partial file is removed |
| The text is edited after reading | the bar keeps the old words until Read aloud is tapped again |
| The text is deleted | its bar stays (an ordinary sound) |
| The text is duplicated | the copy has its own id: its first reading makes its own bar |
| Undo after a reading / a replacement | one step: the bar is gone / the earlier bar is back |
| Expo Go or an older build | the Read aloud row says the tool needs the latest build and stays closed |

## 9. On an older build and in Expo Go

- **Smooth ramps:** work everywhere the editor runs (preview in Expo Go; preview and export with the build installed today).
- **Reduce noise:** the panel shows the switch; tapping it says "Reduce noise and Read aloud need the latest Clipy build. Install it from the newest build link." and changes nothing. Equaliser and Even out loudness behave as before.
- **Read aloud:** the row is there; tapping it says the same sentence and it stays closed.
- **Accounts screen:** reads "App build: sound tools" until the new build is installed, then "App build: noise, ramps and speech".

## 10. What can only be judged on the phone

1. Smooth ramps in the **preview**: does the picture move evenly, does the sound crackle at the 32 rate changes?
2. Smooth ramps in the **exported** video: the same two questions, and whether the sound keeps its pitch. Bullet's 0.3× middle is where repeated frames show most.
3. Whether the new shapes feel right: Montage's dips no longer reach the bottom; Jump cut is a wave.
4. Reduce noise: does it clean a noisy voice-over; is Strength audible from left to right (if both ends sound the same, the mix was not taken: §7 table); how long a 10-second, a 1-minute and a 5-minute recording take; does it work together with a Voice and an equaliser.
5. Reduce noise with Even out loudness: too loud on a noisy recording?
6. Read aloud: does a bar appear, play to its end, and sit under the text; how long the spinner takes; does the preview stay usable; do Enhanced / Premium voices work; does Stop stop.
7. A reading with Voice (Deep) or Reduce noise on its bar: the `.caf` goes through the same render as any sound.
8. A spoken bar in an exported video.

## 11. Differences from the approved wording

- **Ramps:** not six new tiles. The six existing presets gain a **Smooth** switch (on for new picks); stepped presets stay available with the switch off. Old clips keep their stepped curve until the owner changes them.
- **Ramps:** "the smooth, popular ones": smooth Jump cut is a wave, not a jump; smooth Montage dips to 0.75× instead of 0.5×; smooth clips are shorter than stepped ones (§6.2).
- **Ramps:** "a small curve picture": 32 thin bars, drawn from the stored numbers; not a drawn line.
- **Reduce noise:** "in the Sound strip": the Sound tool is now a panel (the timeline is hidden while it is open, as with Voice).
- **Reduce noise:** "works on … extracted clip sound": yes, through the same automatic Extract audio as Voice and Sound.
- **Read aloud:** "a Read aloud button": a row that opens to the voice, the speed and the button.
- **Read aloud:** a second tap for the same text **replaces** its bar.
- **Read aloud:** emoji are not read; a text over 1000 characters is refused.
- **Label:** "ramps" is in the build's name although smooth ramps do not need the build.

## 12. The owner's device checklist

Corrected to the code as built. **Part A works with the app you already have** (the one whose Accounts screen reads "App build: sound tools"). **Part B needs the new app**, installed once from the link I send.

### Part A: with the app you have now

Open the installed app. (Expo Go also shows the smooth ramps and the Read aloud row, but the **Sound** panel does not open in Expo Go and nothing can be exported there, so use the installed app.) Use a project from **before** this update in which a clip has a Speed **Curve** (Hero, for example), and add a second, ordinary clip of about eight seconds.

**Nothing changed**

1. Play the old project. The clip with the curve looks and sounds exactly as before, and the project is as long as before. Tell me if anything is different.
2. Tap that clip, **Speed**, **Curve**. Its tile is ringed, the new **Smooth** switch is **off**, and the small pictures are eight bars, as before. Close without touching anything: nothing changed.

**Smooth ramps**

3. Tap the ordinary clip, **Speed**, **Curve**. **Smooth** is **on** and the pictures are soft shapes made of thin bars. A line at the top says slow parts can look choppy.
4. Tap **Hero** and play. The clip speeds up, slows down in the middle and speeds up again, gradually, with no sudden jumps. Is the sound clean, or does it crackle?
5. Switch **Smooth** off: the same clip now changes speed in steps and gets a little longer. Switch it on again. Each flip is one **Undo**.
6. Try **Bullet**, **Montage**, **Jump cut**, **Flash in** and **Flash out** with Smooth on. Does each feel right? Jump cut is now a wave between slow and fast, not a jump: tell me if you want it to stay stepped.
7. In Bullet's slow middle the picture can look a little choppy. That is the known limit. Tell me if it is worse than you expected.
8. **Split** a smooth clip in the middle: both halves play as before the split.
9. Cut a clip down to a tiny sliver (a quarter of a second) and tap a Curve tile with Smooth on: a message says the clip is too short for a smooth curve and to switch Smooth off, and the strip stays open. Switch Smooth off and tap the tile again: it works.
10. Export the project. In the exported video the smooth clip matches what you saw, and its sound is clean. Tell me if the sound crackles or its pitch changes.

**The Sound panel's new look**

11. Tap a voice-over, **Sound**. It now opens as a taller panel (the timeline is hidden while it is open): the presets, **Even out loudness**, **Reduce noise** and **Strength**. The presets and Even out loudness work as before.
12. Tap the **Reduce noise** switch: a message says it needs the latest build, the switch stays off, and nothing changes. That is right.

**Read aloud, not yet**

13. Tap a text and open the Text panel. Under the templates there is a **Read aloud** row. Tap it: the same message, and the row stays closed. That is right.
14. Open **Accounts**: it still reads "App build: sound tools".

### Part B: after installing the new app

Install the new app from the link. **Accounts** now reads "App build: noise, ramps and speech".

**Reduce noise**

15. Record a voice-over of about ten seconds somewhere noisy (a fan, a running tap, an open window). Tap it, **Sound**, and switch **Reduce noise** on. A spinner shows; while it spins you hear the recording as it was. Tell me how long it took.
16. Play: the voice is still there and the noise is clearly lower. Switch it off: the noise is back. Your recording was never changed.
17. Drag **Strength** to the far left and let go, listen; then to the far right, listen. Left should leave some noise, right almost none. **Tell me if both ends sound the same.**
18. At full strength, does the voice sound natural, or thin and watery?
19. With Reduce noise on, also pick **Voice**, **Deep** on the same bar: a deep voice without the noise.
20. Switch **Even out loudness** on as well: is the result too loud?
21. Put Reduce noise on a **music** track: it will sound odd. That is expected; the line under the switch says so.
22. Tap a **video** clip with noisy sound, **Sound**: its sound moves to the audio row (as before) and Reduce noise works on it.
23. Try a recording of about a minute, and one of several minutes: how long do the spinners take?
24. Export: the cleaned sound is in the video.

**Read aloud**

25. Add a text, type a sentence, and tap the **Read aloud** row. It opens: languages, voices, **Speed**, and a **Read aloud** button.
26. Pick a voice and tap **Read aloud**. After a moment a message says the voice is on the audio row; a bar with the first words of your text sits on the voice row, starting where the text starts. Play: you hear your sentence. Tell me how long the wait was.
27. Pick another voice, or move **Speed**, and tap **Read aloud** again: a message says the voice was replaced, and there is still **one** bar. One **Undo** brings the earlier one back.
28. Move the bar somewhere else, then tap **Read aloud** once more: the new bar sits where you moved the old one.
29. Trim the bar and give it **Voice**, **Echo**: it behaves like any sound.
30. Try each kind of voice you have (ordinary, Enhanced, Premium). Tell me if any voice gives no bar or no sound.
31. Type an Arabic sentence, pick an Arabic voice, and tap Read aloud: the whole sentence is read, with the words as written.
32. Type only an emoji and tap Read aloud: a message says there is nothing to read.
33. Type a long paragraph, tap Read aloud, and tap **Stop** while the spinner shows: no bar is made, and you can start again at once.
34. Start a reading and close the Read aloud row while the spinner shows: no bar appears afterwards.
35. Play music in another app (Music, Spotify), come back and tap Read aloud: does the other app's music dip or stop?
36. Export: the spoken bar is in the video.

**Tell me**

37. Which voices sound good enough to use?
38. Was the video still playing normally after a reading, with sound?
