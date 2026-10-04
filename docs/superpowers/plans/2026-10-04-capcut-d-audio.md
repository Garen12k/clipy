# CapCut Group D — Audio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Several audio tracks (music, voice-over, sound effects) with fades, voice-over recording, ten synthesized sound effects, auto ducking and beat markers.

**Architecture:** Schema v10 extends `AudioTrack` (kind, fades), `Clip` (fades), and `Project` (ducking, beat markers). One pure module, `src/editor/model/audioMix.ts` (mirrored by `AudioMix.swift`), computes every gain; the preview sets player volumes from it each tick and the export receives ready-made gain curves. The timeline shows one lane per audio kind in use.

**Tech Stack:** Expo SDK 57 (`expo-audio` players and recorder, `expo-document-picker`, `expo-asset`), TypeScript strict, Zustand, Jest + RNTL v14; Swift / AVFoundation (uncompiled).

**Spec:** `docs/superpowers/specs/2026-10-04-capcut-d-audio-design.md` (binding).

## Global Constraints

- **Existing projects sound the same:** a v9 project's single track becomes a `music` track with no fades; ducking off; the export of such a project is unchanged apart from the request's shape.
- All gain maths lives in `src/editor/model/audioMix.ts` (and `AudioMix.swift`); components and the export call it.
- Clip timing still only through `src/editor/model/timeline.ts`.
- One undo step per drag / button. Selection is exclusive across clip / overlay / effect / audio.
- No `scrollTo` or self-retriggering work in scroll-end handlers; `src/editor/timelineScroll.ts` unchanged; lanes change heights only, never scroll widths or paddings.
- Gestures: `.runOnJS(true)`; gesture state in a ref object.
- Audio players: never call a method on a released player (wrap unmount-time calls in try / catch as `AudioPreview` does today); no per-tick re-seek unless drift exceeds the tolerance; no effect that re-triggers itself.
- The audio session must always be restored after recording (success, error, unmount).
- Expo Go safe: no new dependencies; before using any `expo-audio` API read the installed typings in `node_modules/expo-audio` or the v57 docs — do not trust memory.
- UI from `src/ui/` and `src/theme/theme.ts`; no hex literals in screens.
- Swift is never compiled here: verify by reading; list unverified APIs.
- Windows: PowerShell, no `&&`, `npx.cmd`. Before each commit: `npm run typecheck` and `npm test` green. `git add` explicit paths only. Commit trailer exactly `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- RNTL v14: `render` / `fireEvent` are async — always `await`.

---

### Task 1: Schema v10

**Files:** Modify `src/editor/model/types.ts`, `migrate.ts`, `src/projects/storage.ts` (audio import builds tracks), tests `migrate.test.ts`, `types.audio.test.ts` (new).

**Interfaces (produced)** — spec §2 verbatim (`SCHEMA_VERSION 10`, `AUDIO_KINDS`, `AudioKind`, extended `AUDIO_LIMITS`, `DUCKING`, `BEAT_LIMITS`, `AudioTrack.kind / fadeIn / fadeOut`, `Clip.fadeIn / fadeOut`, `Project.ducking / beatMarkers`), plus `clampBeatMarkers(v: unknown): number[]`, `clampFade(v: unknown): number`, `minAudioDuration(kind: AudioKind): number` (sfx → `sfxMinDuration`, else `minDuration`). Factories (`makeAudioTrack`, `newVideoClip`, `makeProject`, real-code builders) add defaults. Migration v9 → v10 + sanity pass per spec §2.

- [ ] **Step 1: Failing tests** — clamps; factories; v9 → v10 (existing track → music, fades 0); sanity repairs (unknown kind, fades, > 12 tracks, markers unsorted / duplicate / non-finite / > max); photos' fades forced 0; idempotent; v1 chain reaches 10.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4:** `npm run typecheck`; `npm test`. **Step 5: Commit** `feat(model): schema v10 — audio kinds, fades, ducking, beat markers`.

---

### Task 2: `audioMix.ts`

**Files:** Create `src/editor/model/audioMix.ts`, `__tests__/audioMix.test.ts`, `__tests__/audioMix.vectors.ts`; modify `src/editor/model/audioSync.ts` only if a helper belongs there.

**Interfaces (produced)** — spec §3 verbatim. Details: `fitFades` — negative / non-finite → 0; if `in + out > length` scale both by `length / (in + out)`. `fadeEnvelope` — 0 outside `[0, length]`; `min(1, in > 0 ? local / in : 1, out > 0 ? (length − local) / out : 1)` with fitted fades. `voiceIntervals` — each voice track's `[start, trackEnd]`, merged when they touch or overlap. `duckFactorAt` — inside an interval → `level`; within `ramp` before a start: linear 1 → level; within `ramp` after an end: linear level → 1; else 1; minimum over all intervals. `trackGainAt` — 0 outside the track; `volume × fadeEnvelope(time − start, length, …) × (p.ducking && t.kind === "music" ? duckFactorAt(...) : 1)`. `trackGainCurve` — breakpoints at the track's start and end, the ends of its fade-in and start of its fade-out, and (for ducked music) every ramp start / end that falls inside the track; each breakpoint's gain = `trackGainAt` at that time (evaluate just inside the track at its two ends); sorted, de-duplicated by time; the curve is piecewise linear and must equal `trackGainAt` at every breakpoint and at the midpoint of every segment (tested). `clipGainCurve` likewise in clip-local output seconds using `clipDuration`.

- [ ] **Step 1: Vectors** — plain numeric literals with the arithmetic in comments: envelopes (start, mid fade-in, plateau, mid fade-out, end; fitted fades when too long; zero fades); merged intervals; duck factor at each ramp point and for two close intervals whose ramps overlap; a gain curve for a ducked music track with fades; a clip curve at speed 2.
- [ ] **Step 2: Failing tests** — every vector; curve property test (curve interpolation equals `trackGainAt` at 200 sample times across three scenarios, tolerance 1e-9); non-finite inputs → 0 / identity.
- [ ] **Step 3: Implement.** **Step 4:** checks. **Step 5: Commit** `feat(model): audio mix maths — fades, ducking, gain curves`.

---

### Task 3: Ops and selection

**Files:** Modify `src/editor/model/ops.ts`, `src/editor/store.ts`, `src/editor/toolGroups.ts`; tests `ops.audio.test.ts` (new), `store.audio.test.ts` (new), `toolGroups.test.ts`.

**Interfaces (produced):**
```ts
export function addAudioTrack(p: Project, track: AudioTrack): Project                       // refused (same project) at maxTracks
export function updateAudioTrackById(p: Project, id: string, patch: Partial<Pick<AudioTrack, "start" | "trimStart" | "trimEnd" | "volume" | "fadeIn" | "fadeOut">>): Project
export function moveAudioTrack(p: Project, id: string, newStart: number): Project
export function deleteAudioTrack(p: Project, id: string): Project
export function duplicateAudioTrack(p: Project, id: string): Project                        // placed right after the original
export function setClipFade(p: Project, clipId: string, patch: { fadeIn?: number; fadeOut?: number }): Project   // photos refused
export function setDucking(p: Project, on: boolean): Project
export function addBeatMarker(p: Project, time: number): Project                            // refused within minGap of an existing one or at max
export function removeBeatMarkerNear(p: Project, time: number): Project
export function clearBeatMarkers(p: Project): Project
// store
selectedAudioId: string | null; selectAudio(id: string | null): void;
```
- The existing single-track ops (`setAudioTrack`, `updateAudioTrack`, `removeAudioTrack`) stay working for their current callers until Task 7 replaces those callers: `setAudioTrack` now ADDS (delegates to `addAudioTrack`), `updateAudioTrack` / `removeAudioTrack` act on the first track; mark them deprecated in a comment.
- Trim rules as today's `updateAudioTrack` (per-kind minimum via `minAudioDuration`); fades clamped to `AUDIO_LIMITS.fade` (the fit to the length happens in `audioMix`, storage keeps the user's values).
- `splitClipAt`: left keeps the clip's `fadeIn`, right keeps `fadeOut`; duplicate copies both; freeze still has 0; replace keeps them (photo → 0).
- Store: `selectAudio` clears the other selections and vice versa; selection dropped when the track disappears. `ToolId` gains `addAudio | ducking | beats | audioVolume | audioFade | audioDuplicate | audioDelete`; Audio group = `addAudio, volume, ducking, beats`; `music` id is renamed to `addAudio` everywhere (keep the sheet working: a placeholder mapping is fine until Task 7); `groupForSelection` gains `audioId` → "audio".

- [ ] **Step 1: Failing tests** — each op and rule; identity returns; non-finite refused; limits; selection exclusivity in all directions; one drag = one undo step; split / duplicate / freeze / replace fade rules.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4:** checks. **Step 5: Commit** `feat(model): multi-track audio ops, clip fades, ducking, beat markers; audio selection`.

---

### Task 4: Synthesized sound effects

**Files:** Create `scripts/generate-sfx.mjs`, `assets/sfx/*.wav` (ten), `assets/sfx/manifest.json`, `assets/sfx/README.md`, `src/editor/sfx.ts`, `src/editor/__tests__/sfx.test.ts`.

**Behaviour** — `node scripts/generate-sfx.mjs` writes ten mono 44.1 kHz 16-bit PCM WAV files and the manifest (`{ id, label, file, durationSec }`), deterministically (a seeded LCG for noise; running it twice gives byte-identical files). Sounds (keep each ≤ 1.6 s, peak ≤ −3 dBFS, 5 ms fade in / out to avoid clicks): `whoosh` (filtered noise swelling and falling, 0.6 s), `swoosh` (shorter, rising pitch band, 0.35 s), `pop` (sine 400 → 100 Hz, 0.12 s), `click` (2 ms noise burst + 1.5 kHz ping, 0.05 s → pad to 0.1 s), `ding` (two sines 1320 / 1980 Hz with exponential decay, 0.9 s), `beep` (880 Hz square-ish, 0.2 s), `riser` (sine sweep 200 → 2000 Hz with rising volume, 1.5 s), `drop` (sine sweep 800 → 60 Hz, 0.7 s), `tick` (short 3 kHz blip, 0.1 s), `chime` (three notes C6 E6 G6 staggered 80 ms, decaying, 1.2 s). `src/editor/sfx.ts`: `SFX_IDS`, `SFX: Record<SfxId, { label; durationSec; file: number }>` with one static `require` per file (Metro needs static requires). README says the files are generated by the script and are free to use.

- [ ] **Step 1: Failing tests** — ten ids; every file exists; RIFF / WAVE header, PCM, mono, 44100 Hz, 16 bit; data length matches the manifest duration within 1 ms; peak amplitude ≤ 0.71 of full scale and > 0.1; the manifest and `SFX` agree; re-running the generator in a temp dir reproduces the committed bytes (test runs the script with an output-dir argument).
- [ ] **Step 2: Run** → FAIL. **Step 3: Write the script, generate, register.** **Step 4:** checks; `npx.cmd expo-doctor`. **Step 5: Commit** `feat(audio): ten synthesized sound effects`.

---

### Task 5: Preview — multi-track players and gains

**Files:** Modify `src/editor/components/AudioPreview.tsx`, `PreviewPlayer.tsx` (video volume from `clipGainAt`), `src/editor/store.ts` (a transient `recording: boolean` flag with `setRecording`), tests `AudioPreview.test.tsx`, `PreviewPlayer.test.tsx`.

**Behaviour** — `AudioPreview` maps `project.audioTracks` to `<TrackPlayer key={track.id} track={track} />` (invisible). Each `TrackPlayer` owns one `useAudioPlayer`, loads / replaces its file, and each tick: target source time via `songTimeAt`; outside the track or not playing → paused (seek while paused, as today); playing → re-seek only when drift > tolerance; `player.volume = recording ? 0 : Math.min(1, trackGainAt(project, track, playhead))` written only when the value changed by more than 0.01 (or reaches 0 / 1). Missing files are skipped. Unmount cleanup wrapped in try / catch as today. `PreviewPlayer`: the video's volume uses `clipGainAt(clip, offset)` (capped at 1, 0 when muted or recording) through the existing "skip redundant writes" refs — fades must not cause seeks or pause / play churn. The audio mode set-up stays in `AudioPreview`.

- [ ] **Step 1: Failing tests** — two tracks → two players with their own files; volumes at given playheads (fade-in midpoint, ducked music under a voice track, outside the track → paused); volume writes are throttled; recording flag mutes all; removing a track unmounts its player without throwing; PreviewPlayer video volume follows the clip fade and makes no extra `currentTime` writes; a project with one un-faded music track behaves exactly as before (same calls).
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4:** checks. **Step 5: Commit** `feat(preview): one player per audio track with fades and ducking`.

---

### Task 6: Timeline — audio lanes and beat ticks

**Files:** Modify `src/editor/timelineLayout.ts`, `src/editor/components/Timeline.tsx`, `MusicLane.tsx` → generalise to `AudioLane.tsx`, `MusicBar.tsx` → `AudioBar.tsx`; create `BeatTicks.tsx`; `src/theme/theme.ts` (lane colours for voice / sfx); tests alongside.

**Behaviour** — `audioLaneKinds(project)`: the kinds that have at least one track, in the order music, voice, sfx; the timeline renders one `AudioLane` per such kind (a project with no audio keeps ONE empty music lane so today's layout is unchanged). `timelineHeight(laneCount)` replaces the constant for consumers (overlay lane, effects lane, audio lanes, playhead line); only heights change. `AudioBar` per track: position / width from `start` and length via `timeToX`, label (title), kind colour, selected border; tap selects (`selectAudio`; tapping the selected one deselects); long-press drag moves (`moveAudioTrack`), handles trim (`updateAudioTrackById`), one undo step per drag, state in a ref object, `.runOnJS(true)` — port `MusicBar`'s existing gestures per track id. Overlapping bars of one kind draw later tracks on top at 85 % opacity. `BeatTicks`: small non-interactive ticks at each marker along the top of the clip area (`pointerEvents="none"`, absolute, no layout effect).

- [ ] **Step 1: Failing tests** — lane kinds and heights for 0 / 1 / 3 kinds; bars per track at the right x / width; select / deselect; drag and trim write the right op with one undo step; a second drag starts from the new position; ticks at marker times; the scroll content's width and paddings unchanged with three lanes; `timelineScroll.ts` untouched.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4:** checks. **Step 5: Commit** `feat(timeline): audio lanes per kind, selectable audio bars, beat ticks`.

---

### Task 7: Add-audio sheet, track tools, fades, ducking

**Files:** Modify `src/editor/components/MusicSheet.tsx` → `AddAudioSheet.tsx`, `EditorToolbar.tsx`, `VolumeSheet.tsx`; create `AudioFadeSheet.tsx`, `AudioVolumeSheet.tsx`; modify `src/projects/storage.ts` (`importAudio` accepts a kind and a bundled-module source); tests alongside.

**Behaviour** — spec §5 (everything except Record and Beats). `AddAudioSheet` tabs Music · Files · Effects (Record tab added in Task 8): Music / Files as today but adding a `music` track at the playhead through `addAudioTrack` (refusal at the track limit → close the sheet, then toast "You've reached the audio track limit."); Effects: ten rows (label, duration, a play / stop preview button using one shared preview player, "Add") → copies the bundled file into the project (`Asset.fromModule` → `importAudio`) and adds an `sfx` track at the playhead. Toolbar: `addAudio` opens the sheet; `ducking` is a toggle (active state from `project.ducking`, one `apply`, light haptic; disabled look when there is no voice track is NOT applied — it is a preference); with an audio track selected the Audio sub-row shows `Volume` (`AudioVolumeSheet`: slider 0–200 %), `Fade` (`AudioFadeSheet`: Fade in / Fade out sliders 0–5 s, each capped at half the track's length), `Duplicate`, `Delete`; the clip `VolumeSheet` gains the same two fade sliders for the clip (hidden for photos). The old track controls inside the music sheet (volume / trim fields / remove) move to the selected-track tools; the sheet only adds.

- [ ] **Step 1: Failing tests** — each tab's add path (kind, start at the playhead, one undo step, limit refusal); effects preview button; toolbar tools and the selected-track sub-row; sliders one undo step per drag and the half-length cap; ducking toggle; clip fades in the Volume sheet (hidden for photos).
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4:** checks. **Step 5: Commit** `feat(editor): add-audio sheet with sound effects; track volume, fades, ducking`.

---

### Task 8: Voice-over recording and beat markers

**Files:** Create `src/editor/useVoiceRecorder.ts`, `src/editor/components/RecordTab.tsx`, `BeatsSheet.tsx`; modify `AddAudioSheet.tsx`, `EditorToolbar.tsx`, `app.json` (microphone text); tests alongside (the `expo-audio` recorder mocked).

**Behaviour**
- `useVoiceRecorder()` → `{ state: "idle" | "starting" | "recording" | "saving"; elapsed: number; start(): Promise<void>; stop(): Promise<void>; cancel(): Promise<void> }`, built on the `expo-audio` recording API as documented for SDK 57 (read the installed typings: permission request, audio mode with recording allowed, recorder prepare / record / stop, the result URI). `start`: request permission (denied → toast "Microphone access is needed to record."; state idle); remember the playhead as the recording's start; set the store's `recording` flag (mutes preview sound); allow recording in the audio mode; start the recorder; start playback. `stop`: stop the recorder and playback; clear the flag; restore the audio mode (`mixWithOthers`, plays in silent mode, recording off); recordings shorter than `AUDIO_LIMITS.minDuration` are discarded with a toast; otherwise copy the file into the project (`importAudio`, kind voice, title "Voice-over") and `apply(addAudioTrack)` at the remembered start, select it. Playback reaching the end of the project stops the recording. Any error or unmount while recording restores the mode and clears the flag (try / finally).
- `RecordTab`: big round record / stop button (kit components, theme colours), elapsed time, hint text "Plays your video while you talk. Other sound is muted while recording."
- `BeatsSheet` (tool `beats`): "Tap" button → `apply(addBeatMarker(playhead))` with a light haptic (works while playing — the sheet reads the playhead at press time), marker count, "Remove nearest" (`removeBeatMarkerNear(playhead)`), "Clear all".
- `app.json`: `NSMicrophoneUsageDescription` → "Clipy uses the microphone to record voice-overs and to make captions from speech."

- [ ] **Step 1: Failing tests** — recorder hook: permission denied; happy path (mode set, flag set, track added at the start playhead with the recorder's duration, mode restored, flag cleared, selected); too short → discarded; error while recording → restored; unmount → restored; project end stops it. Record tab states. Beats sheet: tap adds at the current playhead, refusal within the gap is silent, remove nearest, clear.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4:** checks; `npx.cmd expo-doctor`. **Step 5: Commit** `feat(audio): voice-over recording and beat markers`.

---

### Task 9: Export — request and Swift mixing

**Files:** Modify `modules/clipy-video/index.ts` (+ test), `src/export/useExport.ts` (+ test), `src/export/estimate.ts` if it reads the single track; `modules/clipy-video/ios/ExportSession.swift`, `MediaPrePass.swift` (rewrite carries the clip's gain); create `modules/clipy-video/ios/AudioMix.swift`, `ios/Tests/AudioMixTests.swift`, `src/editor/model/__tests__/audioMix.parity.test.ts`.

**Behaviour** — spec §7. Request: `audioTracks: ExportAudioTrack[]` (missing files excluded; each clipped to the exported duration; `gain` = `trackGainCurve` restricted to the kept range, times in composition seconds) and per clip `gain` (`clipGainCurve`, clip-local output seconds; a muted clip sends a flat 0 curve). The old `audio` field is removed from TS and Swift together. Swift: for each request track add a composition audio track, insert the trimmed source range at `start`, and apply `setVolumeRamp` between consecutive breakpoints (a flat segment uses `setVolume`); clip audio: replace the single volume entry with ramps from the clip's curve mapped to composition time (`bodyStart + time`), for both the constant-speed and the curved (`speedSpans`) paths. Remove the old automatic 1 s music fade-out unless the last breakpoint's gain is > 0 at the composition's end AND the track has no fade-out — in that case keep it (spec §7). `AudioMix.swift` mirrors the pure functions for XCTests; the Jest parity test compares `DUCKING` constants and the shared vectors' numbers with the Swift test table.

- [ ] **Step 1: Failing Jest tests** — request for: one plain music track (flat curve), fades, ducked music + voice, a track running past the end (clipped), a muted clip, a clip with fades at speed 2; parity test. **Step 2: Implement** (list unverified APIs). **Step 3:** checks. **Step 4: Commit** `feat(export): multi-track audio with gain curves (uncompiled)`.

---

### Task 10: Docs and full checks

**Files:** `README.md`, `AGENTS.md`, the spec's Status line, `docs/superpowers/research/capcut-roadmap.md`, `assets/music/README.md` if it mentions the single track.

- [ ] **Step 1** — README "Audio" section; first-build checklist additions (voice-over sync in the export, fades and ducking ramps, several tracks mixing without clipping, the microphone prompt text). AGENTS.md: `- Audio mix maths: keep src/editor/model/audioMix.ts ↔ modules/clipy-video/ios/AudioMix.swift identical; sound effects in assets/sfx are generated by scripts/generate-sfx.mjs (re-run it rather than editing the files).` Spec Status → `Implemented 2026-10-04 (Swift export unverified until an EAS build exists; on-device checklist pending)`. Roadmap group D rows.
- [ ] **Step 2** — `npm run typecheck`; `npm test`; `npx.cmd expo-doctor`; `npm ls --all | Select-String invalid` (empty).
- [ ] **Step 3: Commit** `docs: audio (CapCut group D)`.

**Device checklist (user, Expo Go):** Audio → Add audio → Effects: preview and add a whoosh and a ding; move and trim their bars → Record: allow the microphone, record five seconds while the video plays, stop (a voice bar appears) → add a music file from Files → switch Ducking on and play (music dips under your voice) → select the music bar → Fade: 2 s in and out → select a clip → Volume: clip fades → Beats: tap along for a few beats → undo everything → close and reopen the project.
