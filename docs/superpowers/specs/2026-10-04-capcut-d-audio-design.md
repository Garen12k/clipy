# CapCut group D — Audio: design

**Date:** 2026-10-04
**Status:** Implemented 2026-10-04 (Swift export unverified until an EAS build exists; on-device checklist pending)
**Roadmap:** `docs/superpowers/research/capcut-roadmap.md`, group D
**Builds on:** schema v9

## 1. What the user gets

1. **Several audio tracks** — music, voice-over and sound effects, each a bar on the timeline that can be moved, trimmed, duplicated and deleted.
2. **Fade in / fade out** on every audio track and on a clip's own sound.
3. **Voice-over recording** onto the timeline at the playhead.
4. **Ten built-in sound effects**, synthesized by a script in the repo (no licensed files).
5. **Auto ducking** — music dips while a voice-over plays.
6. **Beat markers** — tap along to drop markers on the timeline.

Out of scope: noise reduction, voice effects, text-to-speech, automatic beat detection, extracting a clip's audio, snapping to markers (group G).

Preview: several `expo-audio` players, one per track, kept near the playhead (they may drift by up to the existing 0.25 s tolerance); gains (volume, fades, ducking) are applied by setting each player's volume on every playhead tick. Export: exact, Swift (uncompiled).

## 2. Data model — schema v10

```ts
export const SCHEMA_VERSION = 10 as const;
export const AUDIO_KINDS = ["music", "voice", "sfx"] as const;
export type AudioKind = (typeof AUDIO_KINDS)[number];
export const AUDIO_LIMITS = { minDuration: 0.5 /* sfx: 0.1 */, volume: [0, 2] as const, maxTracks: 12, fade: [0, 5] as const, sfxMinDuration: 0.1 };
export const DUCKING = { level: 0.3, ramp: 0.3 };            // music gain while a voice track is audible; seconds to ramp down / up
export const BEAT_LIMITS = { max: 300, minGap: 0.05 };

// AudioTrack gains:
kind: AudioKind;        // default "music"
fadeIn: number;         // seconds, 0–5
fadeOut: number;        // seconds, 0–5; fadeIn + fadeOut ≤ the track's length (both scaled down proportionally otherwise)
// Clip gains (video clips' own sound):
fadeIn: number; fadeOut: number;   // seconds of OUTPUT time, same rule against the clip's length; photos always 0
// Project gains:
ducking: boolean;       // default false
beatMarkers: number[];  // project seconds, sorted, unique within minGap
```

Migration v9 → v10: existing tracks become `kind: "music"`, fades 0; clips fades 0; `ducking false`; `beatMarkers []`. Sanity pass: unknown kind → "music"; fades clamped; more than `maxTracks` → the first 12 kept; markers finite, ≥ 0, sorted, de-duplicated, capped.

Tracks may overlap in time (any kinds). Clip edits do not move audio tracks or markers (same rule as overlays).

## 3. Mixing maths — `src/editor/model/audioMix.ts` ↔ `modules/clipy-video/ios/AudioMix.swift`

```ts
/** 0…1 fade envelope at `local` seconds into something `length` seconds long. */
export function fadeEnvelope(local: number, length: number, fadeIn: number, fadeOut: number): number
/** Scaled fades so fadeIn + fadeOut ≤ length. */
export function fitFades(fadeIn: number, fadeOut: number, length: number): { in: number; out: number }
/** Intervals of project time during which any voice track is audible, merged, sorted. */
export function voiceIntervals(tracks: AudioTrack[]): [number, number][]
/** Music gain factor from ducking at a project time: 1 outside, DUCKING.level inside, linear ramps of DUCKING.ramp before / after each interval (ramps sit OUTSIDE the interval; overlapping ramps take the lower value). */
export function duckFactorAt(intervals: [number, number][], time: number): number
/** A track's total gain at a project time: volume × fade envelope × (ducking factor for music when the project ducks), 0 outside the track. */
export function trackGainAt(p: Project, t: AudioTrack, time: number): number
/** A clip's own-sound gain at an output offset: (muted ? 0 : volume) × fade envelope. */
export function clipGainAt(c: Clip, offsetInClip: number): number
/** Piecewise-linear gain curve for the export: breakpoints (time, gain) covering the track's life, from the same rules. */
export function trackGainCurve(p: Project, t: AudioTrack): { time: number; gain: number }[]
export function clipGainCurve(c: Clip): { time: number; gain: number }[]   // times are clip-local output seconds
```
`fadeEnvelope` is linear: `min(1, local / in, (length − local) / out)` with zero-length fades ignored. The Swift twin mirrors `fadeEnvelope`, `fitFades`, `voiceIntervals`, `duckFactorAt` and the curve builders; a Jest parity test compares constants and shared vectors.

## 4. Sound effects

`scripts/generate-sfx.mjs` synthesizes ten short mono 44.1 kHz 16-bit WAV files into `assets/sfx/` (deterministic: fixed formulas, no randomness beyond a seeded noise generator) with a manifest: whoosh, swoosh, pop, click, ding, beep, riser, drop, tick, chime. They are committed; the script is the record of how they were made. `src/editor/sfx.ts` maps ids to `require`d files, labels and durations (like `music.ts`).

## 5. Screens

- **Audio group tools**: `music` becomes **Add audio** (sheet with tabs Music · Files · Effects · Record), plus `volume` (clip sound), `ducking` toggle and `beats`. With an audio track selected the sub-row shows `Volume`, `Fade`, `Duplicate`, `Delete` for that track.
- **Add audio sheet**: Music (bundled list — still empty — as today) and Files (document picker, as today) add a `music` track at the playhead; Effects lists the ten sounds with a preview-play button and adds an `sfx` track at the playhead; Record shows a big record button, an elapsed timer and a level-free "Recording…" state — pressing it starts playback from the playhead with the project's sound muted, pressing again stops, saves the file into the project and adds a `voice` track starting where recording began. Microphone permission is requested on first use; denial shows a message.
- **Timeline**: one audio lane per kind that has tracks (music, voice, sfx — up to three lanes; a kind with no tracks takes no height). Bars are selectable; long-press drag moves, the two handles trim (existing `MusicBar` behaviour, per track). Beat markers are small ticks along the top of the clip area.
- **Fade sheet** (track or clip): two sliders 0–5 s (capped at half the length each in the UI), one undo step per drag. The clip's fade lives in the existing Volume sheet.
- **Beats sheet**: a large "Tap" button that adds a marker at the playhead (works while playing), "Clear all", and a count.
- Selection: the store gains `selectedAudioId`, exclusive with clip / overlay / effect selection.

## 6. Preview

`AudioPreview` renders one invisible player component per audio track (keyed by track id); each loads its file, follows the playhead with the existing drift rule, and sets its volume to `min(1, trackGainAt(...))` every tick. The video player's volume follows `clipGainAt`. While recording, every audio player and the video are muted and the audio mode allows recording; it is restored afterwards.

## 7. Export

`ExportRequest.audio` (single) is replaced by `audioTracks: { sourceUri, start, trimStart, trimEnd, gain: { time, gain }[] }[]` — the gain curve already includes volume, fades and ducking, so Swift only draws ramps; each clip gains `gain: { time, gain }[]` (clip-local output seconds). Swift: one composition audio track per request track, `setVolumeRamp(fromStartVolume:toEndVolume:timeRange:)` between consecutive breakpoints; clip audio gets the same from the clip's curve mapped to composition time. `AudioMix.swift` exists for parity and for XCTests of the same curves. The existing end-of-video music fade-out stays as a final safety ramp only when the track runs to the end with no fade-out of its own.

**As built.** The gain curves are computed in TypeScript (`audioMix.ts`), including the end-of-video safety fade for music; Swift only draws ramps. Fades stored on a track are clamped to half its length when it is trimmed. A voice track at volume 0 does not duck. A bad audio file fails the export (as a bad music file did).

## 8. Testing

Model: migration, ops, selection. `audioMix.ts`: hand-computed vectors (fade edges, fitted fades, merged intervals, duck ramps, curves) + Swift parity. Sound effects: files exist, valid WAV headers, durations match the manifest. Components: lanes, bars, sheets, recorder hook with the `expo-audio` recorder mocked, preview players' volumes at given playheads. Swift: by reading + XCTests.

## 9. Risks

- Several players in Expo Go can drift or hitch; the tolerance rule limits re-seeks.
- Recording changes the audio session; it must always be restored (also on error / unmount).
- More uncompiled Swift in the audio path.
- The microphone permission text in `app.json` must be updated (it currently says the app never records).
