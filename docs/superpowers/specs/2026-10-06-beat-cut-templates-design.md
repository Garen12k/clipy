# Auto beat cut and Quick edit: design

**Date:** 2026-10-06
**Status:** Approved by the owner in chat ("yes"). The code was built while the plan was written (the generation route had to be proved before it could be planned around) and kept by the controller; this document describes that code. Two reviews, the docs task and the owner's on-device check are pending. Plan: `docs/superpowers/plans/2026-10-06-beat-cut-templates.md`.
**Builds on:** beat markers and snapping (`2026-10-04-capcut-g-polish-design.md`: `Project.beatMarkers`, the Beats panel, `snap.ts`), the tall panels (`2026-10-05-editing-ui-r2-tall-panels-design.md`), the looks of 2026-10-06 (`2026-10-06-more-looks-design.md`, `2026-10-06-text-looks-stickers-design.md`), photo Motion (`2026-10-06-photo-motion-collage-design.md`, schema v17) and the home screen of `2026-10-06-ui-polish-r2-design.md`. **Schema stays v17. No Swift change, no new package, no change to `package.json`.** One new generated data file (`assets/music/beats.json`) and the script that writes it.

## 0. What Find beats can and cannot do in this build

**Find beats works for the built-in music, not for your own music files.** The app cannot read the raw sound of a music file while it runs in Expo Go: the only way the installed audio package (`expo-audio` 57.0.5) hands out sound samples is while a track is *playing* — in real time, at most at double speed, and silent when muted — so "listening" to a three-minute song would take a minute and a half of audible playback. That was checked in the installed package, not assumed (§12.1). So the beats of the built-in tracks are worked out once, on the development machine, and shipped with the app as a small data file. **Seven of the eight built-in tracks have their beats marked; "The Frigid Seas" has no steady beat** (it is an ambient piece — the detector's two halves disagree, 152 against 121 beats a minute) and ships without. For your own music (the Files tab, or a recording) the **Find beats** button is switched off and one sentence says why; the existing **Tap** button stays, as before. Reading your own files needs the real (native) build and a small piece of native code that is **not written in this round** — it is on the README's first-build list.

## 1. What the owner gets

**Auto beat cut** — two new buttons and a slider in the Beats panel (Audio, then Beats).

- **Find beats** places the beat markers of the music track for you. A **Fewer / More** slider chooses every fourth beat, every second beat (where it starts) or every beat.
- **Cut to beats** re-times the clips in one tap so that every cut lands on a beat marker. Clips keep their order; each is shortened from its end; nothing is deleted. One Undo brings every clip back.

**Quick edit** — a new button on the home screen, beside **New clip**. Pick one of six styles (Travel, Party, Calm, Cinematic, Retro, Vlog), pick your photos and videos, and the app opens a finished draft: built-in music, cuts on the beat, a transition, a filter, a title, and a slow motion on the photos. The draft is an ordinary project.

**Promises.**
1. **Nothing in an existing project changes unless you tap something.** Nothing is stored that was not stored before; the schema number does not change; opening a project, opening the Beats panel, moving or trimming music — none of them places a marker or moves a cut. Only the two buttons, the slider (after a Find) and Quick edit (which only ever makes a *new* project) write anything.
2. **Cut to beats is one undo step**, and a second tap that has nothing left to do is no step at all.
3. **Cancel anywhere in Quick edit leaves nothing behind**: no project exists until the media is picked, and a draft that cannot be finished is deleted again.
4. **No new native code**: the export sees shorter clips, markers it never reads, and a project made of things it already exports.

Out of scope: Find beats for the owner's own files (needs native code); beats for The Frigid Seas; tempo changes inside a track; lengthening clips; moving text, stickers, layers or sounds when clips get shorter (§5.4); looping the music under a long draft; choosing the ratio, the music or the title text inside Quick edit (all three are changed afterwards in the editor); new looks, transitions, fonts or tracks; any toolbar change.

## 2. Where things stand today (read 2026-10-06, `main` 90766dc)

- **Beat markers.** `Project.beatMarkers: number[]` — project seconds, sorted, to the millisecond, at least `BEAT_LIMITS.minGap` (0.05 s) apart, at most `BEAT_LIMITS.max` (300); `clampBeatMarkers` is the loader's rule. Ops: `addBeatMarker`, `removeBeatMarkerNear`, `clearBeatMarkers`. Shown by `BeatTicks`; bars and trim handles snap to them (`snap.ts`). The Beats panel is `BeatsSheet.tsx`, a compact `ToolPanel` (Tap, a count, Remove nearest, Clear all), reached from the audio bar (`contextFor`: `beats` when the project has clips).
- **Music.** `AudioTrack { id, sourceUri, title, sourceDuration, start, trimStart, trimEnd, volume, kind, fadeIn, fadeOut }` — it plays 1:1, so project time = `start + (file time − trimStart)`. **A track does not store which bundled song it is.** `AddAudioSheet` adds a bundled track with the manifest's `title` and `durationSec` as `title` and `sourceDuration`; a file of the owner's gets its **file name** (with extension) as its title and a measured length. Split pieces and copies keep both fields.
- **Bundled tracks.** Eight mp3 files in `assets/music` with `manifest.json`; `src/editor/music.ts` maps them (`BUNDLED_TRACKS`).
- **Trimming a main clip** (`trimClip`): only that clip changes; transitions are re-capped by `normaliseTransitions` (cap = half the shorter neighbour, at most 1 s; under 0.3 s the transition is removed); effects stranded past the new end are dropped (`fitEffects`). **Text, stickers, layers, sounds and markers do not move** — they are project-time items.
- **Speed.** Only `timeline.ts` does speed arithmetic: `clipDuration`, `sourceAfter` (a source time a given output time later).
- **Creating a project.** Home: **New clip** → the library → `AspectRatioSheet` (Auto preselected) → `storage.createProject(name, assets, ratio)` → the editor. `createProject` throws and removes its folder when nothing could be imported. `storage.importAudio` copies a file into a project and returns a track.
- **Editor templates.** `src/editor/templates.ts` + `applyTemplate`: eight *looks* (Clean, Retro, Hype, …) for clips that exist — filter, speed, transition, a title and a sticker. A different thing from Quick edit (§3).

## 3. The decisions in one table

| Question | Decision | Why |
|---|---|---|
| Can the app find beats itself in Expo Go? | **No** (§0, §12.1). | The only sample access is a real-time tap on a playing player. |
| Where do the bundled beats come from? | A dev-time script, `scripts/generate-beats.mjs`, decodes each mp3 with a decoder installed **outside the repo** and runs the detector; the result is committed as `assets/music/beats.json`. | Runs on this Windows machine with Node 22 only (proved: §12.2). |
| Where is the detector? | `src/editor/model/beatDetect.ts` — plain TypeScript, no imports, Jest-tested; the script loads the same file. | One implementation, tested where every other model file is. |
| Swift now? | **No.** Follow-up on the README's first-build list. | It could not be compiled or heard here, and the detector to mirror is new. |
| How does a track know its song? | **It is recognised** by title + exact length (`bundledTrackOf`). **No new stored field, schema stays 17.** | A stored id would need a one-way schema bump and would not help the music already in the owner's projects; recognition works for those too. Cost: §13. |
| What do the slider's stops mean? | Every 4th / every 2nd / every beat, counted from the **file's** first beat. Rest position: the middle. | Trimming the music never changes which beats are kept. |
| What does Find beats overwrite? | Only markers **inside the track's stretch** of the timeline; markers before or after it stay. | Hand-tapped markers elsewhere survive; a second run replaces the first cleanly. |
| Which clips does Cut to beats change? | Every main clip that has a cut after it — **not the last clip** — and only by shortening. | "Every cut lands on a beat"; the end of the video is not a cut. |
| Do text, stickers, layers, sounds move? | **No** — exactly like a trim by hand today. | Consistency with `trimClip`; the checklist says so. |
| Is Quick edit the editor's Templates? | No. In code it is **Quick edit** with **recipes** (`src/projects/quickEdit.ts`); on screen the six are called **styles**. The editor's **Templates** tool is untouched. | Two different things must not share a word. |
| Quick edit's ratio | **Auto** (the first item's shape), not asked. | One step fewer; Ratio is in the editor. |
| Sheet or route? | A **Sheet** on the home screen, like the aspect-ratio picker. | No new screen, no entry in `screenOptions.ts`; nothing to navigate back from. |

## 4. Finding beats

### 4.1 The detector (`beatDetect.ts`)

Input: one mono signal (`Float32Array`) and its sample rate. One constant tempo per track is assumed.

```
BEAT_DETECT = { envelopeRate: 100, windowSeconds: 0.023, minBpm: 70, maxBpm: 180, priorBpm: 120, priorOctaves: 1,
                fineSpan: 0.03, fineSteps: 300, compress: 1000 }
```

1. **Onset envelope** (`onsetEnvelope`). Hop = `round(rate / 100)` samples; window = the next power of two at or above `0.023 × rate` (1024 at 44.1 kHz), Hann-weighted. Frame `i` is the window that **ends** at sample `(i + 1) × hop`. Per frame: a radix-2 FFT, magnitude `log(1 + 1000 × |X| / size)` per bin, and the envelope is the **sum of the rises** against the previous frame (spectral flux); frame 0 is 0.
2. **Coarse tempo** (`beatPeriod`). The autocorrelation of the mean-removed envelope at every whole lag between 180 and 70 beats a minute, each weighted by `exp(−½ (log2(bpm / 120) / 1)²)`. The best lag wins. Between a tempo and its half or double, the one nearer 120 wins — which is what the Fewer / More slider is for.
3. **Fine tempo.** 601 periods within ±3 % of the coarse one; for each, the best phase (steps of half a frame) and the mean envelope on that grid (linear between frames). The period whose best grid collects the most wins. This is what keeps the last beat of a 96-second track within a few milliseconds.
4. **Result** (`detectBeats`): `bpm` (2 decimals), `first` (seconds to the first beat, 3 decimals), `beats` (every `first + k × 60 / bpm` inside the file, 3 decimals) and `confidence` = mean envelope on the beats ÷ mean envelope everywhere. `null` for less than 4 s, silence, or a sample rate of 0.

### 4.2 The generated data (`assets/music/beats.json`)

```json
{
  "version": 1,
  "tracks": {
    "party-sector": {"bpm":120,"first":0.28,"confidence":5.17,"beats":[0.28,0.78,1.28]},
    "frigid-seas": null
  }
}
```

One entry per manifest track, in the manifest's order, one track per line; `beats` are seconds into the **file**; `null` = no steady beat. The script ships a track's beats only when all hold: the decoded length is within 0.3 s of the manifest's (else the script fails), `confidence ≥ 1.5`, each half of the track alone gives a tempo within 0.5 % of the whole, and the beat count is within 1.5 of `length × bpm / 60`.

What a real run on this machine gave (2026-10-06, deterministic — two runs were byte-identical):

| Track | Length | bpm | Halves | First beat | Beats | Confidence | Shipped |
|---|---|---|---|---|---|---|---|
| Party Sector | 96.05 s | 120 | 120 / 120 | 0.28 s | 192 | 5.17 | yes |
| Funked Up | 66.27 s | 87 | 87.01 / 86.99 | 0.105 s | 96 | 6.61 | yes |
| Happy Adventure | 46.80 s | 123.04 | 123.04 / 123.06 | 0.04 s | 96 | 8 | yes |
| Bossa Nova | 59.61 s | 86 | 86 / 86 | 0.26 s | 86 | 9.99 | yes |
| The Frigid Seas | 69.88 s | 152.96 | 151.7 / 121.08 | — | — | 1.06 | **no** |
| Piano | 32.05 s | 120 | 120 / 119.99 | 0.03 s | 65 | 2.09 | yes |
| The Field of Dreams | 84.64 s | 143.94 | 143.92 / 143.97 | 0.03 s | 203 | 4.54 | yes |
| Mandatory Overtime | 40.91 s | 94 | 94 / 93.99 | 0.03 s | 65 | 7.51 | yes |

### 4.3 Recognising a bundled track (`src/editor/musicBeats.ts`)

`bundledTrackOf(track)`: the bundled song whose manifest `title` equals `track.title` and whose `durationSec` equals `track.sourceDuration` exactly, for a `music` track; otherwise null. `beatsOf(track)` → `{ status: "ok", title, beats }`, `{ status: "unsteady", title }` (bundled, no beats) or `{ status: "own" }`. A file of the owner's cannot match by accident: its title carries the file's extension and its length is measured to many decimals.

### 4.4 From the file to the timeline (`src/editor/model/beats.ts`)

```
BEAT_EVERY = [4, 2, 1]          the slider's stops 0 / 1 / 2 (Fewer … More);  DEFAULT_BEAT_DENSITY = 1

beatTimesFor(track, sourceBeats, every, total):
  for beat i at file time b:   keep when  i mod every = 0   and   trimStart ≤ b < trimEnd
  project time = round3(start + (b − trimStart)),  kept when 0 ≤ time ≤ total

placeBeats(project, trackId, sourceBeats, every):
  stretch = [track.start, min(track end, project end)]
  markers = clampBeatMarkers( markers outside the stretch  +  beatTimesFor(...) )
```

Vectors (beats 0.25, 0.75, … 3.75 — 120 bpm): a 4-s track at 0 → the beats as they are · the track at `start 2`, `trimStart 1`, `trimEnd 3` → 2.25, 2.75, 3.25, 3.75 · every 2nd → 0.25, 1.25, 2.25, 3.25 · every 4th → 0.25, 2.25 · every 2nd with `trimStart 1` → 0.25, 1.25, 2.25 (file beats 1.25, 2.25, 3.25: the same beats) · beats 0 … 3.5 on a track at `start 2` with markers 0.7, 2.2, 4.1, 6, 8.3 already there, every 2nd → 0.7, 2, 3, 4, 5, 8.3.

**Which track.** `beatTrack(project, selectedAudioId)`: the selected track when it is music; otherwise the music track that starts first. Never a voice-over or a sound effect.

**Afterwards the markers are plain project data.** Moving, trimming, splitting or deleting the music does not move them; they are where the beats *were*. Tap **Find beats** again to re-place them. The stored limit applies: at most 300 markers (every beat of the longest track is 203).

### 4.5 The panel (`BeatsSheet.tsx`, now a regular `ToolPanel`; the body scrolls on a small phone)

Title **Beat markers** (unchanged). Top to bottom:

1. **Tap** — the panel's one PrimaryButton, unchanged.
2. The count line — "3 markers", unchanged.
3. A row 44 pt tall: **Find beats** · **Cut to beats** (compact SecondaryButtons).
4. A row 44 pt tall: "Fewer" · the kit `Slider` (0 – 2, step 1, a tick in the middle, accessibility label "How many beats") · "More".
5. One hint line, always there — what Find beats will do or why it is off:
   - "Find beats marks the beats of Party Sector."
   - "The Frigid Seas has no steady beat. Tap the beat with Tap instead."
   - "Find beats works with the built-in music for now. For your own music, tap the beat with Tap."
   - "Add music to find its beats."
6. A second hint line only while Cut to beats is off: "Cut to beats needs beat markers." / "Cut to beats needs at least two clips."
7. A row 44 pt tall: **Remove nearest** · **Clear all**, unchanged.

Behaviour:
- **Find beats** is enabled only for status `ok`. One tap = one undo step. A tap that changes nothing is no step and shows "The beat markers are already in place."
- **The slider** before any Find only sets what the next Find does. After a Find — until the panel is closed — dragging it re-places that track's markers at each stop; the whole drag is one undo step (`beginTransaction` + `applyTransient`). It is disabled when Find beats is.
- **Cut to beats**: §5. Toast after a cut: "Clips cut to the beat. Undo brings them back." Nothing to do: "Every cut is already on a beat." and no undo step.
- Nothing is animated; no new strip, panel id or toolbar tool. The panel grows from compact (240 pt) to regular (46 % of the screen, 300 – 430 pt).

## 5. Cut to beats (`cutToBeats` in `src/editor/model/beats.ts`)

### 5.1 The rule

```
BEAT_CUT = { minClip: 0.5, reach: 0.001 }

t = 0
for each main clip, in order (the last clip only when lastToo — Quick edit):
  d = clipDuration(clip)
  m = the LATEST marker with   t + 0.5 − reach  ≤  m  ≤  t + d + reach
  if there is one and  t + d − m > reach:   shorten the clip to  m − t
  t = t + clipDuration(the clip as it is now)
```

- A clip is shortened **at the end it plays last**: a photo's length becomes `m − t` (to the millisecond); a video's source tail moves to `sourceAfter(clip, trimStart, m − t)`; a reversed video's source head to `sourceAfter(clip, trimEnd, −(m − t))`. No speed arithmetic outside `timeline.ts`; a speed curve keeps its steps.
- A clip with **no marker in reach** — shorter than the gap to the next marker, shorter than half a second, or past the last marker — is left exactly as it is, and the next clip is measured from where it really ends.
- A clip **already ending on a marker** (within a millisecond) is left exactly as it is (same object).
- **Never lengthened, never removed, never reordered. Never shorter than 0.5 s.**
- The same project is returned (no undo step) when no clip changes: no markers, no clips, every cut already on a beat.

### 5.2 Worked vectors

| # | Markers | Clips (length) | Result | Cuts at |
|---|---|---|---|---|
| V1 | 1, 2, … 8 | photo 3 · video 2.6 · photo 3 · video 4 | 3 · **2** · 3 · 4 (the last is not touched) | 3, 5, 8 |
| V2 | 0.8, 1.7, 4.4 | video 10 s at 2× (5 s) · photo 3 | **4.4** (source end 8.8) · 3 | 4.4 |
| V3 | 1, 2 | photo 0.8 · photo 3 · photo 3 | 0.8 (no beat in reach) · **1.2** · 3 | 0.8, 2 |
| V4 | 4 | reversed video, source 1 – 7 · photo 3 | source **3** – 7 (4 s) · 3 | 4 |
| V5 | 0.3, 3.2 | photo 3 · photo 3 | unchanged (0.3 is under the minimum, 3.2 is past the clip) | 3 |
| V5b | 0.5 | photo 3 · photo 3 | **0.5** · 3 | 0.5 |
| V6 | 3 | video 8 s on a curve (2× for 4 s, then 1×; 6 s) · photo 3 | **3** (source end 5) · 3 | 3 |
| V7 | 2, 4, 6 | photo 2.5 · photo 2.5 | 2 · 2.5; with `lastToo`: 2 · **2** | 2 (and the end at 4) |

### 5.3 What happens to the things on a shortened clip

| Thing | What happens |
|---|---|
| Transitions | Re-capped as after any trim (`normaliseTransitions`): at most half the shorter neighbour; under 0.3 s it is removed. A clip cut to 0.5 s loses its transition. |
| Speed, speed curve, reverse | Kept. The length is output time; the trim is worked out by `timeline.ts`. |
| Keyframes | Kept as stored (source time), as after a trim by hand: a pin beyond the new end no longer shows. |
| Photo Motion, Combo | Plays over the new, shorter length. |
| In / Out animations, clip fades | Kept; they are fitted to the length where they are played, as today. |
| Filter, adjust, crop, mask, volume | Untouched. |

### 5.4 What does **not** move

Text, stickers, captions, layers and collages, sounds (the music too), the cover and the beat markers stay at their project times — exactly what a trim by hand does today. After a cut the video is shorter, so something placed late may now sit over a different clip or past the end. An **effect** left wholly past the new end is dropped (the rule of every clip edit) and comes back with Undo. The checklist tells the owner in plain words.

### 5.5 When the button is off

No markers → off, "Cut to beats needs beat markers." One clip → off, "Cut to beats needs at least two clips." (`beatCutState`).

## 6. Quick edit

### 6.1 The six recipes (`QUICK_RECIPES` in `src/projects/quickEdit.ts`)

A recipe is data. `every` = which beats become markers; `hold` = marker steps per photo; `videoHold` = the most steps a video keeps. Seconds are from the shipped beats.

| Style | Icon | Music (usable length) | Marker step | Photo | Video at most | Transition | Filter (strength) | Title · text look · height | Photo motion (strength) |
|---|---|---|---|---|---|---|---|---|---|
| **Travel** | `airplane-outline` | The Field of Dreams, 144 bpm (84.6 s) | every 2nd: 0.83 s | 3 steps: 2.50 s | 5: 4.17 s | Slide left 0.4 s | Golden (0.7) | "Our trip" · Clean title · 0.2 | Zoom in, Pan left, Zoom out, Pan right (0.5) |
| **Party** | `balloon-outline` | Party Sector, 120 bpm (95.8 s) | every beat: 0.50 s | 2: 1.00 s | 4: 2.00 s | Flash white 0.3 s | Vivid (0.8) | "Party time" · Bold pop · 0.5 | Zoom in, Zoom out (0.8) |
| **Calm** | `leaf-outline` | Bossa Nova, 86 bpm (59.3 s) | every 2nd: 1.40 s | 2: 2.79 s | 4: 5.58 s | Dissolve 0.8 s | Pastel (0.7) | "Quiet moments" · Elegant · 0.5 | Zoom in, Zoom out (0.3) |
| **Cinematic** | `film-outline` | Piano, 120 bpm (**32.0 s**) | every 2nd: 1.00 s | 3: 3.00 s | 5: 5.00 s | Fade 0.8 s | Teal & orange (0.8) | "A short film" · Cinema · 0.5 | Zoom in (0.4) |
| **Retro** | `radio-outline` | Funked Up, 87 bpm (66.2 s) | every 2nd: 1.38 s | 2: 2.76 s | 3: 4.14 s | Wipe 0.4 s | Vintage (0.9) | "Good old days" · Retro · 0.2 | Pan left, Pan right (0.5) |
| **Vlog** | `videocam-outline` | Happy Adventure, 123 bpm (46.8 s) | every 2nd: 0.98 s | 3: 2.93 s | 6: 5.85 s | none | Crisp (0.6) | "My day" · Headline · 0.15 | Zoom in, Zoom out (0.4) |

Ids: filters `golden`, `vivid`, `pastel`, `tealOrange`, `vintage`, `crisp`; transitions `slide`, `flashWhite`, `dissolve`, `fade`, `wipe`, `none`; text templates `cleanTitle`, `boldPop`, `elegant`, `cinema`, `retro`, `headline`; tracks `field-of-dreams`, `party-sector`, `bossa-nova`, `jrpg2-piano`, `funked-up`, `happy-adventure` — all existing, all checked by a test. Six different tracks, each with shipped beats. Photos that fit under the music: about 33, 95, 21, **10**, 24, 16.

### 6.2 The builder — `buildQuickEdit({ recipe, project, music, beats, titleId })`, pure

`project` holds the picked clips in picked order and nothing else; `music` is the recipe's track as copied into the project; `beats` its file beats (`[]` = none known). `step` = `beats[every] − beats[0]`.

1. **Target lengths.** Every photo: `hold × step + 0.05` s. Every video longer than `videoHold × step + 0.05` s is trimmed to that at its tail. Shorter videos keep their length. (The 0.05 s is slack that step 3 removes.)
2. **Music from its first beat.** The track is added at project 0 with `trimStart = beats[0]`, so the video starts on a beat.
3. **Markers, then the cut.** `placeBeats` (every `every`-th beat), then `cutToBeats(…, lastToo = true)`: every clip, the last one too, ends on a marker.
4. **Music to the video's end.** `trimEnd = min(file length, beats[0] + video length)`, fade-out 1 s; markers past the end are dropped.
5. **The look.** The transition on every cut (capped by the ops as usual); the filter and its strength on every clip; the motions in turn on the photos; one title at x 0.5 over the first 3 s (never past the end), given the recipe's text template.

Only existing ops are used (`trimClip`, `addAudioTrack`, `placeBeats`, `cutToBeats`, `updateAudioTrackById`, `setTransition`, `setFilterForAllClips`, `setPhotoMotion`, `addTextOverlay`, `applyTextTemplate`). The result reloads unchanged (`migrateProject(draft)` equals `draft`).

**Worked example** (a recipe with a marker every 0.5 s, photos 4 steps, videos at most 6; music with its first beat at 0.25 s): photo · 10-s video · photo · 1.3-s video · photo → lengths **2 · 3 · 2 · 1 · 2**, total 10 s, cuts at 2, 5, 7, 8 and the end at 10 all on markers; music `trimStart 0.25`, `trimEnd 10.25`, `fadeOut 1`; markers 0, 0.5, … 10; motions zoomIn · — · panLeft · — · zoomIn; one title 0 – 3 s.

### 6.3 The flow, screen by screen

1. **Home.** Beside the gold **New clip** there is an outlined **Quick edit** (a SecondaryButton on a pill of `elevation.bar`, so it reads over the cards). New clip stays the screen's one PrimaryButton.
2. **The sheet "Quick edit".** Six tiles in two rows (kit `Tile`: icon over label, the selected one ringed), Travel preselected each time; one line: "Music: The Field of Dreams. Pick a style, then your photos and videos. You get a finished draft that you can change afterwards."; the button **Choose photos and videos**. Swiping the sheet down or tapping outside: nothing happens.
3. **The library** opens once the sheet is gone (350 ms, the wait every sheet-then-system-screen pair here uses): photos and videos, up to **30**, in the order tapped. Cancel: nothing happens.
4. **Making.** The two buttons give way to a pill with a spinner and "Making your quick edit". Neither button can be pressed meanwhile.
5. **The editor** opens on the draft, named "Project N" like any new project. Ratio: Auto.

`makeQuickEdit(deps, name, assets, recipeId)` (`src/projects/quickEditFlow.ts`): `createProject` (media copied, ratio Auto) → the bundled track copied in (`importAudio`) → `buildQuickEdit` → `saveProject`. **If anything after `createProject` fails, the project is deleted** and the home screen shows "Couldn't make the quick edit". If nothing could be imported, `createProject` itself throws and removes its folder ("Couldn't import any of the selected items."). If some items could not be read, the draft is made from the rest and the usual toast counts them.

### 6.4 Edge cases

| Case | What happens |
|---|---|
| One photo | One clip of `hold` steps ending on a beat, music, title (no longer than the clip), no transition. |
| One short video (under half a second plus a step) | Kept as it is; music under it with a fade; the title is cut to its length. |
| 30 items | All used. Where the music is shorter than the video (Cinematic after about 10 photos, Vlog after 16, Calm after 21) the clip the music ends under is cut on its last beat, the clips after it keep their target length (plus the 0.05 s), and the rest plays without music. Not looped — the owner adds music again in the editor. |
| Only photos | Every one gets a motion in turn. |
| Only videos | No motion; long ones are cut to `videoHold` steps, short ones to the latest beat they reach, very short ones are left. |
| Video shorter than the song | The music is trimmed to the video's end with a 1-s fade-out. (In the export the existing safety fade is multiplied on top — a slightly steeper fade, §12.) |
| A transition longer than a clip allows | Capped or left out by `setTransition` / `normaliseTransitions`, as everywhere. |
| First item is landscape | The frame is landscape (Auto), as for New clip. Portrait photos after it are filled, as today. |
| Cancel in the sheet or in the library | No project, no file. |
| Import fails for some / for all / for the music | The rest is used / nothing is made / the half-made project is deleted. |
| The app is killed while a draft is made | A plain project with the picked media (no music, no cuts) may be left — an ordinary, usable project. |
| A recipe's track has no beats (data regenerated without it) | The draft is still made: own lengths, no markers, the look applied. A test stops this from shipping. |
| New clip pressed while a draft is made | Not possible: both buttons are replaced by the spinner, and the two flows share their guards. |

## 7. What is stored

Nothing new. `beatMarkers`, clip trims, an ordinary music track, an ordinary text overlay, `transitionOut`, `filter`, `motion` — all fields of schema 17, written by the ops that already write them. **`SCHEMA_VERSION` stays 17; `migrate.ts` and `types.ts` are not edited.** A build from before this round opens a project made by this one.

## 8. Files

New: `src/editor/model/beatDetect.ts` · `src/editor/model/beats.ts` · `src/editor/musicBeats.ts` · `scripts/generate-beats.mjs` · `assets/music/beats.json` (generated) · `src/projects/quickEdit.ts` · `src/projects/quickEditFlow.ts` · `src/projects/QuickEditSheet.tsx` · their tests.
Edited: `src/editor/components/BeatsSheet.tsx` · `src/projects/useProjects.ts` · `app/index.tsx` · `src/editor/__tests__/BeatsSheet.test.tsx` (two pinned values) · `src/editor/__tests__/EditorLayout.test.tsx` (one pinned panel size) · `assets/music/README.md`, `README.md`, `AGENTS.md`.
Not edited: `types.ts`, `migrate.ts`, `ops.ts`, `timeline.ts`, `snap.ts`, `toolbarContext.ts`, `toolStrip.ts`, `EditorToolbar.tsx`, `AddAudioSheet.tsx`, `music.ts`, `storage.ts`, `pickMedia.ts`, `screenOptions.ts`, the kit, the theme, anything under `modules/`, `package.json`.

## 9. Preview behaviour and cost

- Find beats and the slider replace the project's marker list (at most 300 numbers); `BeatTicks` redraws. Cut to beats is one pass over the clips.
- `beats.json` is about 6 KB in the bundle.
- The detector is never run in the app.
- Home: one more button and one more Sheet (mounted hidden, like the other two).

## 10. Export

No request field is added and nothing under `modules/` is edited. The export never reads beat markers. A Quick edit draft is clips, one music track, one text, transitions, filters and photo Motions — all existing export paths.

## 11. Testing

- **Detector** (`beatDetect.test.ts`): synthetic click tracks at 75 – 150 bpm with known first beats (tempo within 0.25 bpm, first beat within 15 ms), the half-tempo rule (174 → 87), the grid's shape, another sample rate, noise (confidence under 1.5), silence and short input (null).
- **Data** (`musicBeats.test.ts`): one entry per manifest track in order; every shipped track's grid is steady, inside the file, with `beats ≈ length × bpm / 60`; exactly The Frigid Seas ships without; recognition of bundled tracks (also split pieces) and non-recognition of files, recordings, effects.
- **Model** (`beats.test.ts`): the vectors of §4.4 and §5.2; the promises (cuts on markers, only shorter, same ids and order, idempotent, nothing else moves, effects fitted, transitions re-capped, input not mutated); `beatCutState`; `beatTrack`.
- **Panel** (`BeatsSheet.auto.test.tsx`, RNTL v14 async): each hint; opening places nothing; Find (through the track's placement, one undo step, second press); the slider before and after a Find (one undo step per drag) and after re-opening; the selected track; Cut to beats (already on the beat, a real cut, undo); the disabled states. The existing `BeatsSheet.test.tsx` keeps passing with two pinned values changed (panel height 239 → 429, and the compact-fit arithmetic removed).
- **Quick edit** (`quickEdit.test.ts`): the recipes against the registries and the glyph map; the pacing table; the worked example of §6.2 field by field; every edge case of §6.4 that the builder decides; each shipped recipe with the shipped beats (every cut and the end on a marker, the result reloads unchanged). `quickEditFlow.test.ts` on the in-memory file system: a draft end to end, a partly failed import, and no project left behind in each failure. `quickEditHome.test.tsx`: the button, the sheet, the order sheet → library → draft, the spinner, cancel, the three toasts.
- **Guards stay as they are:** `noHexLiterals`, `spacingScale` (no new allow-table line), `kitSlider`, `outlineIcons`, `looks.frozen`, the screen-options test (no new route). The tests were written together with the code, not before it (the plan says which ones were ever seen red).

## 12. Evidence, and what is unverified without a native build

1. **No sample access without real-time playback** — read in the installed packages: `node_modules/expo-audio/build/AudioModule.types.d.ts` (`AudioSample`: "provided in real-time when audio sampling is enabled on an `AudioPlayer`"; `AudioStream` is the microphone only), `node_modules/expo-audio/ios/AudioTapProcessor.m` (an `MTAudioProcessingTap` created with `kMTAudioProcessingTapCreationFlag_PostEffects` on the playing `AVPlayerItem`'s audio mix — it is fed only while the item renders, after the volume), `node_modules/expo-audio/ios/AudioModule.swift` line 219 (`min(rate, 2.0)`), and https://docs.expo.dev/versions/v57.0.0/sdk/audio/ (no decode API; rate 0.0 – 2.0 on iOS). `expo-file-system` gives a file's bytes, but turning mp3 / m4a bytes into samples needs a decoder the app does not have.
2. **The generation route runs here**: `npm.cmd install --prefix "$env:TEMP\clipy-beats" mpg123-decoder@1.0.3` (a WebAssembly mp3 decoder, installed outside the repo) and `node --experimental-strip-types scripts/generate-beats.mjs "$env:TEMP\clipy-beats"` on Node 22.14 produced the table of §4.2 twice, byte-identical.
3. **Unverified: whether the phone plays a file from the same zero as the decoder.** mp3 files carry a short encoder delay (tens of milliseconds) that players may or may not skip. If iOS and the script's decoder differ, every marker is early or late by the same small amount — the owner's ears are the test (checklist 6). The fix would be one constant in the script and a re-run.
4. **Unverified: whether the beats *feel* right musically** — the detector finds a steady pulse; whether the "first" beat is the bar's downbeat and whether a track reads at its tempo or at half or double is taste. The slider covers half and quarter; nothing covers double.
5. **Unverified in the export:** nothing new. A Quick edit draft's music has a 1-s stored fade-out *and* gets the export's own 1-s safety fade when it plays to the end — the two multiply (the last second fades a little faster than in the preview).
6. **Unverified on a 375-pt phone:** the two buttons side by side on the home screen (about 325 pt estimated), the three button pairs in the panel, the hint lines' wrapping, the panel's scroll on a short screen.

## 13. Risks

- **Recognition by title and length.** If a bundled track's title or length is ever edited in `manifest.json`, music added before that is no longer recognised: Find beats says it works with the built-in music only. Nothing breaks; the AGENTS rule forbids the edit.
- **Cut to beats does not move text, stickers, layers or sounds.** After a cut, something the owner placed on a clip may sit over the neighbour. It is what a trim does today, Undo restores everything, and the checklist names it — but it is the likeliest surprise of this round.
- **A transition can disappear** when a clip is cut very short (under 0.6 s).
- **Find beats replaces hand-tapped markers inside the music's stretch**, and so does the slider after a Find.
- **Cinematic's music is 32 seconds**; Vlog's 47.
- **The titles are in English and fixed** ("Our trip", …): the owner edits or deletes the text.
- **One track of eight has no beats**, against "the eight built-in tracks would come with their beats already marked".

## 14. Decisions made while writing (the owner did not approve these explicitly)

1. **The Frigid Seas ships without beats**; Find beats says so for it.
2. **No stored song id; a bundled track is recognised by title and length; schema stays 17.**
3. **No Swift this round.**
4. **Fewer / More = every 4th / 2nd / every beat, resting in the middle (every 2nd).**
5. **The slider re-places markers only after a Find in the same opening of the panel; before that it only sets the next Find.**
6. **Find beats replaces markers inside the music's stretch and keeps the others.**
7. **Find beats listens to the selected music track, else the one that starts first.**
8. **Cut to beats leaves the last clip alone** (Quick edit does cut it, so a draft ends on a beat).
9. **A cut clip is never shorter than half a second; each cut goes to the latest beat the clip reaches.**
10. **Text, stickers, layers and sounds do not move on a cut.**
11. **The Beats panel becomes a regular (taller) panel.**
12. **Quick edit's six are called "styles" on screen**, not templates.
13. **Quick edit does not ask for the ratio (Auto) and takes up to 30 items.**
14. **The recipes' tracks, pacing, filters, transitions, titles and motions** (§6.1) — all picked from what exists, unheard and unseen.
15. **The music is not looped under a long draft.**
16. **The draft is named "Project N".**
17. **A failed draft is deleted; a draft interrupted by killing the app may leave a plain project.**

## 15. Device checklist (owner, Expo Go)

Start with `npx expo start --go --port 8090` and open the app on the iPhone.

In one line: **Find beats works with the built-in music only for now** (not with your own files, and not with "The Frigid Seas", which has no steady beat). Everything else here works fully in Expo Go.

**Nothing changed**

1. Open a project you made before this update and play it. Nothing is different: no new markers, no clip is shorter. Tell me if anything changed.

**Find beats**

2. In a project with a few clips, tap **Audio**, **Add audio**, **Music**, and use **Party Sector**. Tap **Audio**, then **Beats**. The panel is taller than before and has two new buttons and a slider. Under them it says "Find beats marks the beats of Party Sector."
3. Nothing has been marked yet — opening the panel does nothing by itself.
4. Tap **Find beats**. Small gold ticks appear along the timeline, and the count goes up.
5. Drag the **Fewer / More** slider: left = fewer ticks (every fourth beat), middle = every second beat, right = every beat. You feel a small tick in the middle.
6. Close the panel and press play. **Do the ticks sit on the beat of the music?** Tell me if they feel early or late — that is the one thing I could not check without your phone.
7. Press **Undo**: the ticks from the slider go back one step; again: the ticks are gone.
8. Drag the music bar to the side. The ticks **stay where they were** — they do not follow the music. Open **Beats** and tap **Find beats** again to put them back on the beat.
9. Add **The Frigid Seas** to another project and open **Beats**: Find beats is greyed out and it says the track has no steady beat. Add one of **your own** music files (Files): it says Find beats works with the built-in music for now. **Tap** still works for both.

**Cut to beats**

10. Use a project with at least three clips and Party Sector, and tap **Find beats** with the slider in the middle.
11. Look at where the clips meet on the timeline, then tap **Cut to beats**. Each clip gets a little shorter so that every place where two clips meet sits on a tick. A message says "Clips cut to the beat. Undo brings them back."
12. Play it: the picture changes on the beat.
13. Nothing was deleted, the order is the same, and the **last** clip was not touched.
14. Press **Undo once**: every clip is back to its old length.
15. Tap **Cut to beats** twice in a row: the second time it says "Every cut is already on a beat."
16. **Know this:** text, stickers, overlays and sounds do **not** move when the clips get shorter — the same as when you trim a clip by hand. If you had a text sitting on the third clip, check where it is now. A transition on a clip that became very short (about half a second) is removed. Undo brings all of it back.
17. With no ticks at all, **Cut to beats** is greyed out and says it needs beat markers.

**Quick edit**

18. Go to the home screen. Next to **New clip** there is a new **Quick edit** button. Tell me if the two buttons fit side by side.
19. Tap it: a sheet with **Travel, Party, Calm, Cinematic, Retro, Vlog**. Travel is highlighted and the line below names its music. Tap another one: the music named changes.
20. Swipe the sheet down. Nothing happened and no project was made.
21. Tap **Quick edit**, pick **Party**, tap **Choose photos and videos**, and pick about eight photos and one or two videos — the order you tap them is the order in the video. Tap Add.
22. You see "Making your quick edit" for a moment, then the editor opens.
23. Press play: music, a cut on every other beat, a flash between clips, bright colours, "Party time" at the start, and the photos slowly zoom.
24. It is a normal project: tap the title and change the words, tap a clip and change its filter, tap the music and swap it. Everything can be undone or changed.
25. Try **Calm** with only photos, and **Vlog** with only videos (long videos are cut to about six seconds each; you can make them longer again with Trim).
26. Try **Cinematic** with 15 photos: its music is only 32 seconds long, so the last photos play without music. That is known — add music again by hand if you want it.
27. Start a Quick edit and press **Cancel** in the photo library: nothing was made.
28. A wide (landscape) first photo gives a wide video, as with New clip; change it with **Ratio**.

**Tell me**

29. Which of the six styles feel right, and which have the wrong music, speed or colours? They are easy to change — each one is a short list of settings.
30. Do you want Cut to beats to also move text and stickers along with the clips, and Quick edit to ask for the shape (9:16, 1:1, …) before it starts?
