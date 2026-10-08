# Reduce noise, smooth speed ramps, Read aloud: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A **Reduce noise** switch with a **Strength** slider in the Sound tool (Apple's sound isolation unit, first in the existing render), a **Smooth** switch that turns the six existing speed-curve presets into gradual ramps (32 pieces instead of 8, no native change), and a **Read aloud** row in the Text panel that turns a text into a spoken sound bar with one of the iPhone's voices; while every project that exists loads, previews and exports exactly as before and nothing is ever changed, rendered or synthesised on its own.

**Architecture:** Schema v19 with ONE new optional key, absent by default: `SoundSettings.noise`. `soundChain` (TypeScript only) gains `noiseWet`, the number the native render sets on the isolation unit, which `SoundNoise.make` (Swift) builds exactly as the probe proved and `SoundRender.render` puts first in the chain; the copy's file name gains `-n<percent>` only when noise is on, so every existing copy keeps its name. Smooth ramps are TypeScript only: `smoothCurveSteps` (timeline.ts) writes 32 steps into the existing `Clip.speedCurve.steps`, `isSmoothCurve` reads the form from the step count, `setClipSpeedCurve` gains `smooth = false`; `curveSteps`, `clampSpeedCurve`, `SpeedSpans.swift` and `ExportSession.swift` are untouched. Read aloud is a pure model (`src/editor/model/speech.ts`: what is read, the pace, the file name, `placeSpeech`), a native `speakToFile` (new `SpeechRender.swift`: `AVSpeechSynthesizer.write` into a `.caf` in `<project>/media/`), a hook (`useReadAloud`) and a section of the Text panel; the result is an ordinary `voice` track.

**Tech Stack:** Expo SDK 57, React Native 0.86, TypeScript strict, Zustand 5, `expo-audio`, `expo-sqlite` (localStorage), `@expo/vector-icons` 15 (Ionicons), Jest (`jest-expo`) + RNTL 14.0.1; Swift 5.9 (Expo Modules API, AVFoundation / AVFAudio / AudioToolbox), deployment target iOS 16.4. **No new package, no new asset. One new native build.**

**Spec:** `docs/superpowers/specs/2026-10-08-noise-ramps-speech-design.md` (binding; §3 the decisions, §4 schema and the proof, §5 noise numbers and native, §6 ramp numbers and the proof, §7 speech API and the verified-API table, §8 edge cases).

## Global Constraints

- **iPhone only.** No Android or web configuration, files or code paths.
- **Expo Go must keep working, and so must the build installed today.** Everything native is reached through `modules/clipy-video/index.ts`. Reduce noise is gated by `isNoiseBuild()` / `isNoiseAvailable()`, Read aloud by `isSpeechAvailable()`; both say `LATEST_TOOLS` (`NEEDS_LATEST_BUILD("Reduce noise and Read aloud")`) where the build is too old and never throw "undefined is not a function". `package.json`, `app.json`, `eas.json` and `assets/` are not edited.
- **Nothing existing changes.** A track without `noise`, a clip with a stepped curve and a text nobody reads aloud go through exactly the expressions they do today. Where an existing function is edited, the edit is a branch or a defaulted parameter that existing callers do not take. The PROOF tests of this plan (Tasks 1, 2, 5) are written once and never edited to make a change pass.
- **Nothing happens on its own.** `noise` is written only by `setTrackSound`, a curve only by `setClipSpeedCurve`, a speech bar only by `placeSpeech`, and only from a tap or a drag. No render and no synthesis on load.
- **An optional key is absent, never `undefined`, `null` or a neutral value, in anything stored.** Tests check with `"noise" in sound`.
- **Never edited this batch:** `src/editor/components/PreviewPlayer.tsx`, `src/editor/components/LayerVideo.tsx`, `src/editor/previewHandoff.ts`, `src/editor/timelineScroll.ts`, `src/editor/model/audioMix.ts`, `src/editor/model/audioSync.ts`, `modules/clipy-video/ios/AudioMix.swift`, `modules/clipy-video/ios/SpeedSpans.swift`, `modules/clipy-video/ios/ExportSession.swift`, `modules/clipy-video/ios/SoundMath.swift`, `src/editor/noiseProbe.ts`, `src/editor/toolbarContext.ts`, `src/editor/components/EditorToolbar.tsx`, `EditorLayout.tsx`, `Timeline.tsx`, `src/ui/*`, `src/theme/*`, `src/editor/__tests__/looks.frozen.test.ts`, every existing `*.parity.test.ts`, the guard tests in `src/__tests__`, anything under `src/publish/` or `supabase/`.
- **Only `src/editor/model/timeline.ts` multiplies or divides by a clip's `speed` or reads a curve's steps.** The UI asks `isSmoothCurve` / `curveProfile`.
- **Swift rules (there is no Swift toolchain here; the code is checked by reading):** (1) every `AVURLAsset` stays in a stored property while its tracks are used; (2) every failure is a staged message (`sound <stage>: …`, `speech <stage>: …`) with `ExportSession.describe(error)` wherever an `Error` exists; (3) no name declared twice in one scope, no `static let x` beside `static func x(`; (4) the render loop stays synchronous (`scheduleBuffer(_:completionHandler: nil)`), and the one `await` of this batch (`AVAudioUnit.instantiate`) is in an `async` function called from the module's `Task`; (5) every Apple symbol newer than iOS 16.4 sits inside `if #available`; this batch names exactly one such symbol (`voiceTraits`, iOS 17); (6) `promise.resolve` gets a typed `[String: Any]`; (7) no force unwrap, no `try!`, no `as!`.
- UI from `src/ui/` and `src/theme/theme.ts` only; **no hex literals**; **spacing from `theme.space` only** (`spacingScale.test.ts`: never add to its allow-table, never rely on its blind spots, so no apostrophe in JSX text and no `*` or `/` in a spacing value); sliders are the kit `Slider`; icons are Ionicons outline names; rows have explicit heights.
- **Motion rules:** no new animation. No Reanimated, no timers that drive a view, no entering / exiting.
- **One user action = one undo step:** a tap is one `apply`, a drag is `beginTransaction` + `applyTransient`. A Strength drag renders once, on release (`holdSounds`).
- Never seed React state from an effect keyed on a gesture-driven value. `useState` initial values and event handlers only.
- RNTL v14: `render` / `fireEvent` / `rerender` are async: always `await`.
- A test that fails after your change because it names a **pinned count, id list, key list, type list or schema number** listed in your task is updated as the task says. A test that fails for any other reason means a mistake in the change: fix the change.
- Tasks that run side by side share one working tree: a red suite that belongs to a file another task owns is not yours to fix. Never edit a file outside your task's list.
- Windows: PowerShell, no `&&`, `npx.cmd`. **Never run `expo lint`.** **No broad `sed`.** **Never `git stash`.** **`git add` explicit paths only, never `-A` / `.`.** **Do not start or stop a dev server** (one is serving this tree to the owner's phone). Before each commit: `npm run typecheck` and `npm test` green. Commit trailer exactly `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Task order

`(1 || 2 || 3 || 4) -> (5 || 10 || 11) -> (6 || 8 || 12) -> (7 || 9) -> 13 -> 14`

| Task | Feature | Title | Depends on | Parallel-safe with | Native? |
|---|---|---|---|---|---|
| 1 | noise | Schema v19: `SoundSettings.noise`, clamp, the PROOF migration | — | 2, 3, 4 | no |
| 2 | ramps | Smooth ramps: the maths and the op (`timeline.ts`, `ops.ts`), the PROOF | — | 1, 3, 4 | no |
| 3 | speech | Read aloud: the model (`speech.ts`) | — | 1, 2, 4 | no |
| 4 | all | The native wrapper and the build label (`index.ts`, `buildInfo.ts`) | — | 1, 2, 3 | no (JS side) |
| 5 | noise | Noise maths: `noiseWet`, the chain, the file name; the request field | 1, 4 | 10, 11 | **Swift (one line)** |
| 6 | noise | Swift: the isolation unit in the render | 5 | 8, 12 | **Swift** |
| 7 | speech | Swift: `SpeechRender.swift`, the module functions | 6 (shares `ClipyVideoModule.swift`) | 9 | **Swift** |
| 8 | noise | The render manager: the gate and the deadline | 4, 5 | 6, 12 | no |
| 9 | noise | The Sound panel: Reduce noise and Strength | 1, 8 | 7 | no |
| 10 | ramps | The Speed strip: the Smooth switch and the curve pictures | 2 | 5, 11 | no |
| 11 | speech | Read aloud: preferences and the flow (`useReadAloud`) | 3, 4 | 5, 10 | no |
| 12 | speech | Read aloud in the Text panel | 11 | 6, 8 | no |
| 13 | all | **Swift read-through review, then the ONE EAS build** | 1–12 | — | **the single native build** |
| 14 | all | Docs, full checks, device checklist | 1–13 | — | no |

**All Swift is in Tasks 5 (one `@Field` line), 6 and 7. Task 13 is the only build.** No task before 13 starts a build.

**What the owner can test before the new build:** Tasks 2 and 10 give **smooth ramps** complete, in the preview and in an export with the app installed today. After Tasks 9 and 12 the Reduce noise switch and the Read aloud row are on screen and say they need the latest build.

**Files more than one task edits:** `modules/clipy-video/ios/SoundRender.swift`: Task 5 (one line), then Task 6. `modules/clipy-video/ios/ClipyVideoModule.swift`: Task 6, then Task 7. `modules/clipy-video/__tests__/index.test.ts`: Task 4, then Task 5 (one key in one literal). `src/editor/model/__tests__/soundRender.swift.test.ts`: Task 6 only. Everything else has one owner: `types.ts`, `migrate.ts` Task 1 · `timeline.ts`, `ops.ts` Task 2 · `speech.ts` Task 3 · `index.ts`, `buildInfo.ts` Task 4 · `sound.ts` Task 5 · `soundRenders.ts` Task 8 · `SoundQualitySheet.tsx`, `toolStrip.ts` Task 9 · `SpeedSheet.tsx` Task 10 · `speechPrefs.ts`, `useReadAloud.ts` Task 11 · `ReadAloudSection.tsx`, `TextPanel.tsx` Task 12.

**Pinned values that change, and who changes them:** schema number 18 → 19 (Task 1: `migrate.test.ts`, `types.sound.test.ts` and the ten other `types.*.test.ts`) · the build label and its mock (Task 4: `buildInfo.test.ts`) · the full chain literal `NEUTRAL` and one request literal gain `noiseWet: 0` (Task 5: `sound.test.ts`, `index.test.ts`) · the Swift type list and the module's function list (Task 6: `soundRender.swift.test.ts`) · what a curve tile writes for a clip without a curve, and the bars of a tile (Task 10: `SpeedSheet.test.tsx`).

---

### Task 1: Schema v19: `SoundSettings.noise`, clamp, the PROOF migration

**Depends on:** nothing. **Parallel-safe with:** 2, 3, 4.

**Files:** Create `src/editor/model/__tests__/types.noise.test.ts`. Modify `src/editor/model/types.ts`, `src/editor/model/migrate.ts` (the number's comments only), `src/editor/model/__tests__/migrate.test.ts` (pinned number + append), and the pinned number in `types.sound.test.ts`, `types.audio.test.ts`, `types.clip.test.ts`, `types.layers.test.ts`, `types.layers2.test.ts`, `types.look.test.ts`, `types.motion.test.ts`, `types.photo.test.ts`, `types.polish.test.ts`, `types.speed.test.ts`, `types.text.test.ts`.

**Do not touch:** `ops.ts` (`setTrackSound` already merges and clamps a patch), `sound.ts`, every component. `soundMath.test.ts` has a `toBe(18)` that is a decibel value, not the schema: leave it.

**Interfaces: Produces**

```ts
// src/editor/model/types.ts
export const SCHEMA_VERSION = 19 as const;
export const NOISE_LIMITS: { strength: readonly [0, 1]; defaultStrength: 0.5 };
export interface SoundSettings { voice: VoiceId | null; strength: number; pitch: number; eq: EqId | null; level: boolean; noise?: number }
export const isNeutralSound: (s: SoundSettings) => boolean;      // now also false when `noise` is there
export function clampSound(v: unknown): SoundSettings | null;    // keeps a finite `noise`, clamped 0–1, 2 decimals
// setTrackSound(p, id, { noise: 0.5 }) switches it on; setTrackSound(p, id, { noise: undefined }) removes the key (existing code).
```

- [ ] **Step 0: Baseline.** `npm run typecheck` and `npm test` are green on the untouched tree. If not, stop and report.
- [ ] **Step 1: Failing tests.**

Create `src/editor/model/__tests__/types.noise.test.ts`:

```ts
import { setTrackSound } from "../ops";
import { clampSound, isNeutralSound, makeAudioTrack, makeProject, NO_SOUND, NOISE_LIMITS, SCHEMA_VERSION, type SoundSettings } from "../types";

test("schema is v19; the noise strength runs 0–1 and starts in the middle; the sound as recorded has no noise key", () => {
  expect(SCHEMA_VERSION).toBe(19);
  expect(NOISE_LIMITS).toEqual({ strength: [0, 1], defaultStrength: 0.5 });
  expect("noise" in NO_SOUND).toBe(false);
  expect("sound" in makeAudioTrack({ id: "m", sourceDuration: 5 })).toBe(false);
});

test("a noise strength alone is a setting", () => {
  expect(isNeutralSound(NO_SOUND)).toBe(true);
  expect(isNeutralSound({ ...NO_SOUND, noise: 0.5 })).toBe(false);
  expect(isNeutralSound({ ...NO_SOUND, noise: 0 })).toBe(false);          // on at the lightest strength is still on
});

test("clampSound: a usable strength is kept in range, to 2 decimals; anything else leaves no key", () => {
  const base = { voice: "deep", strength: 0.8, pitch: -3, eq: "warm", level: true };
  expect(clampSound({ ...base, noise: 0.5 })).toEqual({ ...base, noise: 0.5 });
  expect(clampSound({ ...base, noise: 7 })).toEqual({ ...base, noise: 1 });
  expect(clampSound({ ...base, noise: -1 })).toEqual({ ...base, noise: 0 });
  expect(clampSound({ ...base, noise: 0.333 })).toEqual({ ...base, noise: 0.33 });
  for (const junk of [undefined, null, "0.5", true, NaN, Infinity, {}]) {
    const s = clampSound({ ...base, noise: junk });
    expect(s).toEqual(base);
    expect(s !== null && "noise" in s).toBe(false);                        // absent, not undefined
  }
  expect(clampSound({ noise: 0.5 })).toEqual({ ...NO_SOUND, noise: 0.5 });
  expect(clampSound({ noise: "x" })).toBeNull();                           // nothing else set: as recorded
  const once = clampSound({ ...base, noise: 0.333 });
  expect(clampSound(once)).toEqual(once);                                  // idempotent
  expect(clampSound(base)).toEqual(base);                                  // a v18 setting is what it was
  expect("noise" in (clampSound(base) as SoundSettings)).toBe(false);
});

test("setTrackSound switches noise on, changes its strength and takes the key away again (the op is unchanged)", () => {
  const p0 = makeProject({ audioTracks: [makeAudioTrack({ id: "v", sourceDuration: 5, kind: "voice" })] });
  const p1 = setTrackSound(p0, "v", { noise: NOISE_LIMITS.defaultStrength });
  expect(p1.audioTracks[0].sound).toEqual({ ...NO_SOUND, noise: 0.5 });
  const p2 = setTrackSound(p1, "v", { noise: 0.9 });
  expect(p2.audioTracks[0].sound?.noise).toBe(0.9);
  expect(setTrackSound(p2, "v", { noise: 0.9 })).toBe(p2);                 // nothing changes: same project
  const p3 = setTrackSound(p2, "v", { noise: undefined });
  expect("sound" in p3.audioTracks[0]).toBe(false);                        // nothing else was set: as recorded again
  const withVoice = setTrackSound(setTrackSound(p0, "v", { voice: "deep" }), "v", { noise: 0.25 });
  const off = setTrackSound(withVoice, "v", { noise: undefined });
  expect(off.audioTracks[0].sound).toEqual({ ...NO_SOUND, voice: "deep" });
  expect("noise" in (off.audioTracks[0].sound as SoundSettings)).toBe(false);
  expect(setTrackSound(withVoice, "v", { eq: "warm" }).audioTracks[0].sound?.noise).toBe(0.25);   // another tool keeps it
});
```

Append to `src/editor/model/__tests__/migrate.test.ts` (add to its imports whatever is missing of `setClipSpeedCurve` from `../ops`, `makeAudioTrack`, `makeClip`, `makeProject`, `type AudioTrack` from `../types`):

```ts
test("PROOF v18 → v19: the migration changes the number and nothing else — sound settings, a stepped speed curve, music, a split piece, ducking and beats are kept as stored, and no setting gains a noise key", () => {
  const base = makeProject({
    clips: [makeClip({ id: "a", sourceDuration: 8 }), makeClip({ id: "b", sourceDuration: 6, muted: true })],
    audioTracks: [
      { ...makeAudioTrack({ id: "v1", sourceDuration: 6, kind: "voice", start: 3, title: "Voice-over" }), sound: { voice: "deep", strength: 0.8, pitch: -3, eq: null, level: false } },
      { ...makeAudioTrack({ id: "s1", sourceDuration: 4, kind: "sfx", start: 1.5, title: "Clip sound" }), sound: { voice: null, strength: 0.5, pitch: 0, eq: "warm", level: true } },
      makeAudioTrack({ id: "m1", sourceDuration: 30, trimStart: 2.5, trimEnd: 10, volume: 1.6, fadeIn: 1, fadeOut: 2 }),
      makeAudioTrack({ id: "m2", sourceDuration: 30, trimStart: 10, trimEnd: 21.125, start: 7.5 }),
    ] as AudioTrack[],
    ducking: true, beatMarkers: [1, 2.5, 9.75],
  });
  const now = setClipSpeedCurve(base, "a", "hero");                 // today's stepped preset: eight steps
  expect(now.clips[0].speedCurve?.steps).toHaveLength(8);
  expect(migrateProject(now)).toEqual(now);                         // the fixture is a clean v19 project
  const v18 = JSON.parse(JSON.stringify(now)) as { schemaVersion: number };
  v18.schemaVersion = 18;
  const frozen = JSON.stringify(v18);
  const p = migrateProject(v18);
  expect(JSON.stringify(v18)).toBe(frozen);                         // the stored object is not mutated
  expect({ ...p, schemaVersion: 18 }).toEqual(v18);                 // nothing but the number differs from the file
  expect(p.schemaVersion).toBe(19);
  for (const t of p.audioTracks) if (t.sound) expect("noise" in t.sound).toBe(false);
  expect(p.clips[0].speedCurve).toEqual({ id: "hero", steps: [1, 2, 3, 0.5, 0.5, 3, 2, 1].map((speed, i) => ({ from: i, speed })) });
  expect(migrateProject(p)).toEqual(p);
});

test("the sanity pass keeps a usable noise strength and removes one that cannot be used", () => {
  const withSound = (id: string, sound: unknown) => ({ ...makeAudioTrack({ id, sourceDuration: 5 }), sound }) as unknown as AudioTrack;
  const p = migrateProject(makeProject({ audioTracks: [
    withSound("ok", { voice: null, strength: 0.5, pitch: 0, eq: null, level: false, noise: 0.75 }),
    withSound("wild", { voice: "echo", strength: 0.5, pitch: 0, eq: null, level: false, noise: 9 }),
    withSound("junk", { voice: "echo", strength: 0.5, pitch: 0, eq: null, level: false, noise: "loud" }),
    withSound("only-junk", { voice: null, strength: 0.5, pitch: 0, eq: null, level: false, noise: null }),
  ] }));
  const track = (id: string) => p.audioTracks.find((t) => t.id === id)!;
  expect(track("ok").sound).toEqual({ voice: null, strength: 0.5, pitch: 0, eq: null, level: false, noise: 0.75 });
  expect(track("wild").sound?.noise).toBe(1);
  expect("noise" in track("junk").sound!).toBe(false);
  expect("sound" in track("only-junk")).toBe(false);
  expect(migrateProject(p)).toEqual(p);
});
```

- [ ] **Step 2: Run** `npx.cmd jest src/editor/model/__tests__/types.noise.test.ts src/editor/model/__tests__/migrate.test.ts` → the new tests FAIL (version 18, no `NOISE_LIMITS`, the key dropped).
- [ ] **Step 3: Implement.**

`src/editor/model/types.ts`:

1. `export const SCHEMA_VERSION = 19 as const;`
2. Replace the `SoundSettings` interface and `isNeutralSound`, and add `NOISE_LIMITS` after `SOUND_LIMITS`:

```ts
/**
 * How an audio track is changed before it is mixed. `voice` null = none; `strength` 0–1, gentle … strong; `pitch` whole semitones
 * (added to the voice's own); `eq` null = none; `level` = Even out loudness; `noise` = Reduce noise, ABSENT when off, else its
 * strength 0–1. The file is never changed: a copy is rendered from these.
 */
export interface SoundSettings { voice: VoiceId | null; strength: number; pitch: number; eq: EqId | null; level: boolean; noise?: number }
export const SOUND_LIMITS = { strength: [0, 1] as const, defaultStrength: 0.5, pitch: [-12, 12] as const };
/** Reduce noise: its strength (light … strong) and where the slider starts when the switch is turned on. */
export const NOISE_LIMITS = { strength: [0, 1] as const, defaultStrength: 0.5 };
```

```ts
export const isNeutralSound = (s: SoundSettings): boolean => s.voice === null && s.pitch === 0 && s.eq === null && !s.level && s.noise === undefined;
```

(`NO_SOUND` is not edited: it has no `noise` key.)

3. In `clampSound`, replace the last line `return isNeutralSound(s) ? null : s;` with:

```ts
  // v19: Reduce noise is optional and ABSENT unless it is a usable number.
  if (isNum(v.noise)) s.noise = Math.round(clampNum(v.noise, NOISE_LIMITS.strength[0], NOISE_LIMITS.strength[1]) * 100) / 100;
  return isNeutralSound(s) ? null : s;
```

and extend its doc comment's list with `` `noise` only when it is a number (clamped, 2 decimals) ``. In the `AudioTrack` interface nothing changes.

`src/editor/model/migrate.ts`: no code changes (`normaliseCurrent` already runs `clampSound` and writes the key back only when usable). In the doc comment of `normaliseCurrent` change `v2–v18 file to a safe v18 shape` to `v2–v19 file to a safe v19 shape` and append to its last sentence: `, and v18 → v19 adds nothing either: a sound setting's noise strength is optional, kept when usable and removed when not.` In `migrateProject` change the comment `v2 → v18` to `v2 → v19`.

**Pinned numbers.** In `migrate.test.ts`, `types.sound.test.ts` and the ten `types.*.test.ts` listed above, every assertion that the CURRENT schema is 18 (`expect(SCHEMA_VERSION).toBe(18)`, `expect(p.schemaVersion).toBe(18)`, a title "schema is v18") becomes 19. Find them with Grep (`toBe(18)`, `v18`) and edit each by hand. A fixture that is **given** an older number (`schemaVersion = 17`, the PROOF v17 → v18 test's `v17`) stays; in that older PROOF test only the asserted number of the migrated output becomes 19 (its title and fixture untouched).

- [ ] **Step 4: Run** the two suites, then `npx.cmd jest src/editor/model` → PASS. Then `npm run typecheck` and `npm test`.
- [ ] **Step 5: Commit** — `git add` the files above (explicit paths); `feat(model): schema v19 — a sound setting's optional noise strength, clamp, PROOF migration`.

---

### Task 2: Smooth ramps: the maths and the op, the PROOF

**Depends on:** nothing. **Parallel-safe with:** 1, 3, 4.

**Files:** Modify `src/editor/model/timeline.ts` (additions only), `src/editor/model/ops.ts` (`setClipSpeedCurve`, `presetCurve`, one line in the replace-media op). Create `src/editor/model/__tests__/timeline.smooth.test.ts`, `src/editor/model/__tests__/ops.smoothCurve.test.ts`.

**Do not touch:** `types.ts` (Task 1 owns it; `clampSpeedCurve` and `SPEED_CURVE_LIMITS` stay as they are), `src/editor/effects.ts` (the shapes), `curveSteps` and every existing function of `timeline.ts`, every existing speed test, anything under `modules/`.

**Interfaces: Consumes** `SPEED_CURVES` (effects.ts), `SPEED_CURVE_LIMITS`, `SPEED_LIMITS`, `clampNum`, `clampSpeedCurve` (exist). **Produces**

```ts
// src/editor/model/timeline.ts
export const SMOOTH_PER_SLICE = 4;                                             // pieces per slice: 8 × 4 = 32 steps
export function smoothSpeedAt(shape: readonly number[], u: number): number;    // u = 0…1 along the clip
export function curveProfile(id: SpeedCurveId, smooth: boolean): number[];     // 8 speeds (the shape) or 32 (4 decimals), clamped
export function smoothCurveSteps(id: SpeedCurveId, trimStart: number, trimEnd: number): SpeedStep[];
export const isSmoothCurve: (c: Pick<Clip, "speedCurve">) => boolean;          // more steps than a stepped preset has
// src/editor/model/ops.ts
export function setClipSpeedCurve(p: Project, clipId: string, id: SpeedCurveId | null, smooth?: boolean): Project;   // smooth defaults to false
```

- [ ] **Step 1: Failing tests.**

Create `src/editor/model/__tests__/timeline.smooth.test.ts`:

```ts
import { setClipSpeedCurve } from "../ops";
import { clipDuration, curveProfile, curveSteps, isSmoothCurve, outputToSource, playbackSpans, rateAt, SMOOTH_PER_SLICE, smoothCurveSteps, smoothSpeedAt, sourceToOutput } from "../timeline";
import { clampSpeedCurve, makeClip, makeProject, SPEED_CURVE_IDS, SPEED_CURVE_LIMITS, type Clip, type SpeedCurveId } from "../types";

const STEPPED: Record<SpeedCurveId, number[]> = {
  montage: [2.5, 2.5, 0.5, 2.5, 2.5, 0.5, 2.5, 2.5], hero: [1, 2, 3, 0.5, 0.5, 3, 2, 1], bullet: [3.5, 3.5, 3.5, 0.3, 0.3, 3.5, 3.5, 3.5],
  jumpCut: [1, 4, 1, 4, 1, 4, 1, 4], flashIn: [4, 3, 2, 1.5, 1, 1, 1, 1], flashOut: [1, 1, 1, 1, 1.5, 2, 3, 4],
};
const STEPPED_LENGTH: Record<SpeedCurveId, number> = { montage: 6.4, hero: 7.666667, bullet: 8.380952, jumpCut: 5, flashIn: 5.75, flashOut: 5.75 };
const SMOOTH: Record<SpeedCurveId, number[]> = {
  montage: [2.5, 2.5, 2.5, 2.5, 2.5, 2.5, 2.25, 1.75, 1.25, 0.75, 0.75, 1.25, 1.75, 2.25, 2.5, 2.5, 2.5, 2.5, 2.25, 1.75, 1.25, 0.75, 0.75, 1.25, 1.75, 2.25, 2.5, 2.5, 2.5, 2.5, 2.5, 2.5],
  hero: [1, 1, 1.125, 1.375, 1.625, 1.875, 2.125, 2.375, 2.625, 2.875, 2.6875, 2.0625, 1.4375, 0.8125, 0.5, 0.5, 0.5, 0.5, 0.8125, 1.4375, 2.0625, 2.6875, 2.875, 2.625, 2.375, 2.125, 1.875, 1.625, 1.375, 1.125, 1, 1],
  bullet: [3.5, 3.5, 3.5, 3.5, 3.5, 3.5, 3.5, 3.5, 3.5, 3.5, 3.1, 2.3, 1.5, 0.7, 0.3, 0.3, 0.3, 0.3, 0.7, 1.5, 2.3, 3.1, 3.5, 3.5, 3.5, 3.5, 3.5, 3.5, 3.5, 3.5, 3.5, 3.5],
  jumpCut: [1, 1, 1.375, 2.125, 2.875, 3.625, 3.625, 2.875, 2.125, 1.375, 1.375, 2.125, 2.875, 3.625, 3.625, 2.875, 2.125, 1.375, 1.375, 2.125, 2.875, 3.625, 3.625, 2.875, 2.125, 1.375, 1.375, 2.125, 2.875, 3.625, 4, 4],
  flashIn: [4, 4, 3.875, 3.625, 3.375, 3.125, 2.875, 2.625, 2.375, 2.125, 1.9375, 1.8125, 1.6875, 1.5625, 1.4375, 1.3125, 1.1875, 1.0625, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  flashOut: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1.0625, 1.1875, 1.3125, 1.4375, 1.5625, 1.6875, 1.8125, 1.9375, 2.125, 2.375, 2.625, 2.875, 3.125, 3.375, 3.625, 3.875, 4, 4],
};
const SMOOTH_LENGTH: Record<SpeedCurveId, number> = { montage: 4.749206, hero: 6.584331, bullet: 6.188205, jumpCut: 3.812711, flashIn: 5.702982, flashOut: 5.702982 };
const eight = (extra: Partial<Clip> = {}) => makeClip({ id: "a", sourceDuration: 8, ...extra });

describe("PROOF: a stepped curve is exactly what it was before smooth ramps (literals; never edited to make a change pass)", () => {
  test.each(SPEED_CURVE_IDS)("%s: the same eight steps, the same length, the same export spans", (id) => {
    const steps = curveSteps(id, 0, 8);
    expect(steps).toEqual(STEPPED[id].map((speed, i) => ({ from: i, speed })));
    const clip = eight({ speedCurve: { id, steps } });
    expect(clipDuration(clip)).toBeCloseTo(STEPPED_LENGTH[id], 6);
    expect(playbackSpans(clip)).toEqual(STEPPED[id].map((speed) => ({ duration: 1, speed })));
    expect(clampSpeedCurve(clip.speedCurve, clip)).toEqual(clip.speedCurve);          // what is stored reloads as stored
    expect(isSmoothCurve(clip)).toBe(false);
  });

  test("the op without its new argument writes the stepped preset, as every caller before this batch did", () => {
    const p = makeProject({ clips: [eight()] });
    for (const id of SPEED_CURVE_IDS) {
      const c = setClipSpeedCurve(p, "a", id).clips[0];
      expect(c.speedCurve).toEqual({ id, steps: STEPPED[id].map((speed, i) => ({ from: i, speed })) });
      expect(c.speed).toBe(1);
    }
  });

  test("a trimmed, stepped clip: the steps stay on their source times and the walk is the old one", () => {
    const clip = eight({ trimStart: 2, trimEnd: 6, speedCurve: { id: "hero", steps: curveSteps("hero", 0, 8) } });
    expect(clipDuration(clip)).toBeCloseTo(1 / 3 + 1 / 0.5 + 1 / 0.5 + 1 / 3, 9);     // slices 2…5
    expect(outputToSource(clip, 0)).toBe(2);
    expect(outputToSource(eight({ speedCurve: { id: "hero", steps: curveSteps("hero", 0, 8) } }), 2)).toBeCloseTo(3.083333, 6);
  });
});

describe("the smooth sampling", () => {
  test("32 pieces: under the stored-step limit", () => {
    expect(SMOOTH_PER_SLICE).toBe(4);
    expect(SPEED_CURVE_LIMITS.slices * SMOOTH_PER_SLICE).toBeLessThanOrEqual(SPEED_CURVE_LIMITS.maxSteps);
  });

  test("smoothSpeedAt: the slice speeds sit at the slice centres, a straight line joins them, the edges hold", () => {
    const hero = STEPPED.hero;
    expect(smoothSpeedAt(hero, 0)).toBe(1);
    expect(smoothSpeedAt(hero, 0.0625)).toBe(1);            // the first centre
    expect(smoothSpeedAt(hero, 0.125)).toBe(1.5);           // half way to the second (2)
    expect(smoothSpeedAt(hero, 0.1875)).toBe(2);            // the second centre
    expect(smoothSpeedAt(hero, 0.5)).toBe(0.5);             // between the two slow slices
    expect(smoothSpeedAt(hero, 0.9375)).toBe(1);            // the last centre
    expect(smoothSpeedAt(hero, 1)).toBe(1);
    expect(smoothSpeedAt(hero, -3)).toBe(1);
    expect(smoothSpeedAt(hero, 7)).toBe(1);
  });

  test.each(SPEED_CURVE_IDS)("%s: the profile, the steps and the length are the specified ones", (id) => {
    expect(curveProfile(id, false)).toEqual(STEPPED[id]);
    expect(curveProfile(id, true)).toEqual(SMOOTH[id]);
    const steps = smoothCurveSteps(id, 0, 8);
    expect(steps).toEqual(SMOOTH[id].map((speed, j) => ({ from: j * 0.25, speed })));
    const clip = eight({ speedCurve: { id, steps } });
    expect(clipDuration(clip)).toBeCloseTo(SMOOTH_LENGTH[id], 6);
    expect(playbackSpans(clip)).toHaveLength(32);
    expect(clampSpeedCurve(clip.speedCurve, clip)).toEqual(clip.speedCurve);          // nothing merged, nothing clamped
    expect(isSmoothCurve(clip)).toBe(true);
    // No jump between two neighbouring pieces is as large as the stepped preset's largest.
    const jumps = (v: number[]) => Math.max(...v.slice(1).map((s, i) => Math.abs(s - v[i])));
    expect(jumps(SMOOTH[id])).toBeLessThan(jumps(STEPPED[id]));
  });

  test("the steps are spread over the trim they are given", () => {
    const steps = smoothCurveSteps("hero", 2, 6);
    expect(steps).toHaveLength(32);
    expect(steps[0].from).toBe(2);
    expect(steps[31].from).toBeCloseTo(5.875, 9);
    expect(steps.map((s) => s.speed)).toEqual(SMOOTH.hero);
  });

  test("the existing walk handles 32 steps: source and output times agree both ways, and the rate is the piece's", () => {
    const clip = eight({ speedCurve: { id: "hero", steps: smoothCurveSteps("hero", 0, 8) } });
    expect(outputToSource(clip, 2)).toBeCloseTo(3.262616, 6);
    for (const offset of [0, 0.3, 1.7, 3.1, 5.9, clipDuration(clip)]) expect(sourceToOutput(clip, outputToSource(clip, offset))).toBeCloseTo(offset, 9);
    expect(rateAt(clip, 0)).toBe(1);
    expect(rateAt(clip, clipDuration(clip) / 2)).toBe(0.5);
    const reversed = { ...clip, reversed: true };
    expect(playbackSpans(reversed).map((s) => s.speed)).toEqual([...SMOOTH.hero].reverse());
    expect(clipDuration(reversed)).toBeCloseTo(SMOOTH_LENGTH.hero, 6);
  });

  test("isSmoothCurve: no curve and a stepped curve are not smooth", () => {
    expect(isSmoothCurve(eight())).toBe(false);
    expect(isSmoothCurve(eight({ speedCurve: { id: "hero", steps: curveSteps("hero", 0, 8) } }))).toBe(false);
  });
});
```

Create `src/editor/model/__tests__/ops.smoothCurve.test.ts`:

```ts
import { setClipSpeedCurve, splitClipAt } from "../ops";
import { clipDuration, curveSteps, isSmoothCurve, smoothCurveSteps } from "../timeline";
import { makeClip, makeLayer, makePhotoClip, makeProject, MIN_CLIP_SECONDS } from "../types";

const project = () => makeProject({ clips: [makeClip({ id: "a", sourceDuration: 8 }), makeClip({ id: "s", sourceDuration: 0.2 }), makePhotoClip({ id: "ph" })], layers: [makeLayer({ id: "L", sourceDuration: 6, start: 0 })] });
const clip = (p: ReturnType<typeof project>, id: string) => p.clips.find((c) => c.id === id)!;

test("smooth writes 32 steps over the clip's trim and sets the speed to 1: one new project", () => {
  const p0 = project();
  const p1 = setClipSpeedCurve(p0, "a", "bullet", true);
  expect(p1).not.toBe(p0);
  expect(clip(p1, "a").speedCurve).toEqual({ id: "bullet", steps: smoothCurveSteps("bullet", 0, 8) });
  expect(clip(p1, "a").speed).toBe(1);
  expect(isSmoothCurve(clip(p1, "a"))).toBe(true);
  expect(setClipSpeedCurve(p1, "a", "bullet", true)).toBe(p1);          // the same form again: nothing changes
});

test("the same preset in the other form is a change, both ways", () => {
  const smooth = setClipSpeedCurve(project(), "a", "hero", true);
  const stepped = setClipSpeedCurve(smooth, "a", "hero", false);
  expect(stepped).not.toBe(smooth);
  expect(clip(stepped, "a").speedCurve).toEqual({ id: "hero", steps: curveSteps("hero", 0, 8) });
  expect(isSmoothCurve(clip(setClipSpeedCurve(stepped, "a", "hero", true), "a"))).toBe(true);
});

test("a clip too short for 32 steps is refused in the smooth form and still takes the stepped one", () => {
  const p0 = project();                                                 // "s": 0.2 source seconds; 32 steps need 0.32
  expect(setClipSpeedCurve(p0, "s", "flashOut", true)).toBe(p0);
  const stepped = setClipSpeedCurve(p0, "s", "flashOut", false);
  expect(clip(stepped, "s").speedCurve?.steps).toHaveLength(8);
  expect(clipDuration(clip(stepped, "s"))).toBeGreaterThanOrEqual(MIN_CLIP_SECONDS - 1e-9);
});

test("photos never take a curve; None clears a smooth curve; a layer takes one", () => {
  const p0 = project();
  expect(setClipSpeedCurve(p0, "ph", "hero", true)).toBe(p0);
  const smooth = setClipSpeedCurve(p0, "a", "hero", true);
  expect(clip(setClipSpeedCurve(smooth, "a", null), "a").speedCurve).toBeNull();
  expect(clip(setClipSpeedCurve(smooth, "a", null, true), "a").speedCurve).toBeNull();
  const layered = setClipSpeedCurve(p0, "L", "flashIn", true);
  expect(layered.layers[0].speedCurve?.steps).toHaveLength(32);
});

test("a split keeps the whole smooth curve on both halves, and together they last as long as the clip did", () => {
  const smooth = setClipSpeedCurve(project(), "a", "hero", true);
  const whole = clipDuration(clip(smooth, "a"));
  const cut = splitClipAt(smooth, whole / 3);                           // "a" is the first clip: project time = its own offset
  const [left, right] = cut.clips;
  expect(isSmoothCurve(left)).toBe(true);
  expect(isSmoothCurve(right)).toBe(true);
  expect(clipDuration(left) + clipDuration(right)).toBeCloseTo(whole, 9);
});
```

(`splitClipAt(p, outputTime)` cuts the main clip under a project time; `MIN_CLIP_SECONDS` (0.1), `makeLayer` and `makePhotoClip` are exports of `types.ts` today.)

- [ ] **Step 2: Run** `npx.cmd jest src/editor/model/__tests__/timeline.smooth.test.ts src/editor/model/__tests__/ops.smoothCurve.test.ts` → FAIL (missing exports).
- [ ] **Step 3: Implement.**

`src/editor/model/timeline.ts` — directly after the `curveSteps` function insert (nothing else in the file changes):

```ts

/** Smooth ramps: every one of a preset's slices is cut into this many pieces (8 × 4 = 32 steps, under SPEED_CURVE_LIMITS.maxSteps). */
export const SMOOTH_PER_SLICE = 4;
const r4 = (v: number): number => Math.round(v * 1e4) / 1e4;
/**
 * A preset's speed at position `u` (0 … 1 along the clip) when it is smooth: each slice's speed sits at the slice's centre, a
 * straight line joins neighbouring centres, and before the first / after the last centre the edge speed holds.
 */
export function smoothSpeedAt(shape: readonly number[], u: number): number {
  const last = shape.length - 1;
  const x = u * shape.length - 0.5;
  if (!(x > 0)) return shape[0];
  if (x >= last) return shape[last];
  const i = Math.floor(x);
  return shape[i] + (shape[i + 1] - shape[i]) * (x - i);
}
/**
 * The speeds of a preset's pieces in source order, clamped to SPEED_LIMITS: its eight slice speeds, or — smooth — 32, each the
 * smooth speed at its piece's centre (4 decimals). What a tile draws and what a pick stores are both this list.
 */
export function curveProfile(id: SpeedCurveId, smooth: boolean): number[] {
  const shape = SPEED_CURVES[id].shape.slice(0, SPEED_CURVE_LIMITS.slices).map((speed) => clampNum(speed, SPEED_LIMITS[0], SPEED_LIMITS[1]));
  if (!smooth) return shape;
  const pieces = shape.length * SMOOTH_PER_SLICE;
  return Array.from({ length: pieces }, (_, j) => r4(smoothSpeedAt(shape, (j + 0.5) / pieces)));
}
/** The smooth form of a preset: equal pieces of [trimStart, trimEnd] with the speeds of `curveProfile(id, true)`. */
export function smoothCurveSteps(id: SpeedCurveId, trimStart: number, trimEnd: number): SpeedStep[] {
  const speeds = curveProfile(id, true);
  const piece = (trimEnd - trimStart) / speeds.length;
  return speeds.map((speed, j) => ({ from: trimStart + j * piece, speed }));
}
/** True when the clip's curve is a smooth ramp: it holds more steps than a stepped preset has (the app stores exactly 8 or exactly 32). */
export const isSmoothCurve = (c: Pick<Clip, "speedCurve">): boolean => !!c.speedCurve && c.speedCurve.steps.length > SPEED_CURVE_LIMITS.slices;
```

`src/editor/model/ops.ts`:

1. Add `isSmoothCurve, smoothCurveSteps` to the `./timeline` import.
2. `setClipSpeedCurve`: the signature becomes `export function setClipSpeedCurve(p: Project, clipId: string, id: SpeedCurveId | null, smooth = false): Project {`, the one line `const speedCurve = presetCurve(c, id, c.trimStart, c.trimEnd);` becomes `const speedCurve = presetCurve(c, id, c.trimStart, c.trimEnd, smooth);`, and its doc comment gains: `` `smooth` writes the preset as a gradual ramp (`smoothCurveSteps`, 32 steps) instead of eight steps; it needs a longer clip (32 steps of at least `minStep`). ``
3. Replace `presetCurve` with:

```ts
/**
 * The preset's steps across [trimStart, trimEnd] — eight, or 32 when `smooth` — through the sanity rule so what is stored reloads
 * unchanged. Null when the range is too short to hold every step (the sanity rule merges steps under `minStep`): a collapsed curve
 * is never stored.
 */
function presetCurve(c: Pick<Clip, "kind">, id: SpeedCurveId, trimStart: number, trimEnd: number, smooth = false): SpeedCurve | null {
  const steps = smooth ? smoothCurveSteps(id, trimStart, trimEnd) : curveSteps(id, trimStart, trimEnd);
  const curve = clampSpeedCurve({ id, steps }, c);
  return curve && curve.steps.length >= steps.length ? curve : null;
}
```

(For the stepped form `steps.length` is 8 = `SPEED_CURVE_LIMITS.slices`, the number the old line compared with.)

4. In the replace-media op, the line `const speedCurve = old.speedCurve ? presetCurve(base, old.speedCurve.id, 0, trimEnd) : null;` becomes `const speedCurve = old.speedCurve ? presetCurve(base, old.speedCurve.id, 0, trimEnd, isSmoothCurve(old)) : null;`.

- [ ] **Step 4: Run** the two suites, then `npx.cmd jest src/editor/model src/editor/__tests__/SpeedSheet.test.tsx modules/clipy-video` → PASS with every existing test unedited (the UI still calls the op without the new argument). Then `npm run typecheck` and `npm test`.
- [ ] **Step 5: Commit** — `feat(model): smooth speed ramps — the six presets as 32 gradual steps in the existing curve field; stepped curves pinned unchanged`.

---

### Task 3: Read aloud: the model

**Depends on:** nothing. **Parallel-safe with:** 1, 2, 4.

**Files:** Create `src/editor/model/speech.ts`, `src/editor/model/__tests__/speech.test.ts`.

**Do not touch:** `ops.ts` (its `addAudioTrack` / `deleteAudioTrack` are called, not edited), `types.ts`.

**Interfaces: Consumes** `addAudioTrack`, `deleteAudioTrack` (ops.ts, exist); `AUDIO_LIMITS`, `isTextOverlay`, `AudioTrack`, `Project` (types.ts). **Produces**

```ts
export const SPEECH_LIMITS: { maxChars: 1000; titleChars: 24; pace: readonly [0, 1]; defaultPace: 0.5; rate: readonly [0.35, 0.65] };
export function speakableText(text: string): string;                      // no emoji, single spaces, trimmed
export function speechRate(pace: number): number;                         // 0.35 … 0.5 … 0.65, 3 decimals
export function speechFileName(overlayId: string, stamp: string): string; // speech-<overlay>-<stamp>.caf
export function speechTracksOf(p: Project, overlayId: string): AudioTrack[];
export type SpeechRefusal = "notText" | "noText" | "tooLong" | "limit";
export function speechRefusal(p: Project, overlayId: string): SpeechRefusal | null;
export function placeSpeech(p: Project, overlayId: string, made: { id: string; sourceUri: string; seconds: number }): Project;
export interface VoiceRow { id: string; name: string; language: string; languageName: string; quality: number }
export function languagesOf(voices: readonly VoiceRow[], current: string): { code: string; name: string }[];
export function voicesOf(voices: readonly VoiceRow[], language: string): VoiceRow[];
export function voiceLabel(v: VoiceRow): string;
export function pickVoice(voices: readonly VoiceRow[], current: string, wantedId: string | null): VoiceRow | null;
export function paceLabel(pace: number): string;
```

- [ ] **Step 1: Failing tests.** Create `src/editor/model/__tests__/speech.test.ts`:

```ts
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-08T10:00:00.000Z" }));
import { setTrackSound } from "../ops";
import { languagesOf, paceLabel, pickVoice, placeSpeech, speakableText, SPEECH_LIMITS, speechFileName, speechRate, speechRefusal, speechTracksOf, voiceLabel, voicesOf, type VoiceRow } from "../speech";
import { makeAudioTrack, makeClip, makeOverlay, makeProject, type Overlay } from "../types";

const MEDIA = "file:///doc/projects/p1/media";
const text = (id: string, words: string, start = 2): Overlay => makeOverlay({ id, text: words, start, end: start + 3 });
const base = (overlays: Overlay[] = [text("o1", "Hello there")]) => makeProject({ clips: [makeClip({ id: "a", sourceDuration: 20 })], overlays });
const made = (n: number, seconds = 2.5) => ({ id: `t${n}`, sourceUri: `${MEDIA}/${speechFileName("o1", `s${n}`)}`, seconds });

test("the limits", () => {
  expect(SPEECH_LIMITS).toEqual({ maxChars: 1000, titleChars: 24, pace: [0, 1], defaultPace: 0.5, rate: [0.35, 0.65] });
});

test("speakableText: emoji, joiners and variation selectors go; white space becomes single spaces", () => {
  expect(speakableText("  Hello   there \n friend ")).toBe("Hello there friend");
  expect(speakableText("Summer \u{1F31E}\u{1F334} vibes ❤️")).toBe("Summer vibes");
  expect(speakableText("\u{1F468}‍\u{1F469}‍\u{1F467}")).toBe("");                // a family emoji: three faces and two joiners
  expect(speakableText("\u{1F1EC}\u{1F1F7} 1️⃣")).toBe("1");                      // a flag; a keycap keeps its digit
  expect(speakableText("   ")).toBe("");
  expect(speakableText("Καλημέρα κόσμε")).toBe("Καλημέρα κόσμε");
  expect(speakableText("price: 5 € — ok?")).toBe("price: 5 € — ok?");
});

test("speechRate: 0.35 at the slow end, the system's normal pace in the middle, 0.65 at the fast end", () => {
  expect([0, 0.25, 0.5, 0.75, 1].map(speechRate)).toEqual([0.35, 0.425, 0.5, 0.575, 0.65]);
  expect(speechRate(-3)).toBe(0.35);
  expect(speechRate(9)).toBe(0.65);
  expect(speechRate(NaN)).toBe(0.5);
  expect(["Slower", "Normal", "Faster"]).toEqual([paceLabel(0.2), paceLabel(0.5), paceLabel(0.8)]);
});

test("the file is named after the text it was read from, safely", () => {
  expect(speechFileName("o1", "s1")).toBe("speech-o1-s1.caf");
  expect(speechFileName("3f2a-11", "9c0d-22")).toBe("speech-3f2a-11-9c0d-22.caf");
  expect(speechFileName("../x y", "a/b")).toMatch(/^speech-[A-Za-z0-9_-]+\.caf$/);
});

test("speechRefusal: not a text, nothing to read, too long, or no room for one more track", () => {
  const caption = { ...text("c1", "spoken words"), kind: "caption" } as Overlay;
  const p = base([text("o1", "Hello"), text("e", "\u{1F600} "), text("long", "a".repeat(1001)), text("edge", "a".repeat(1000)), caption]);
  expect(speechRefusal(p, "o1")).toBeNull();
  expect(speechRefusal(p, "nope")).toBe("notText");
  expect(speechRefusal(p, "c1")).toBe("notText");
  expect(speechRefusal(p, "e")).toBe("noText");
  expect(speechRefusal(p, "long")).toBe("tooLong");
  expect(speechRefusal(p, "edge")).toBeNull();
  const full = { ...p, audioTracks: Array.from({ length: 12 }, (_, i) => makeAudioTrack({ id: `m${i}`, sourceDuration: 5 })) };
  expect(speechRefusal(full, "o1")).toBe("limit");
  // A reading of this text is already there: the new one takes its place, so the limit does not stand in the way.
  const replacing = { ...full, audioTracks: [...full.audioTracks.slice(1), makeAudioTrack({ id: "old", sourceDuration: 2, sourceUri: `${MEDIA}/speech-o1-s0.caf` })] };
  expect(speechRefusal(replacing, "o1")).toBeNull();
});

test("placeSpeech: one voice track at the text's start, the whole file, titled with the first words", () => {
  const p0 = base([text("o1", "Hello there, this is a rather long sentence", 2)]);
  const p1 = placeSpeech(p0, "o1", made(1));
  expect(p1.audioTracks).toEqual([{ id: "t1", sourceUri: `${MEDIA}/speech-o1-s1.caf`, title: "Hello there, this is a r", sourceDuration: 2.5, start: 2, trimStart: 0, trimEnd: 2.5, volume: 1, kind: "voice", fadeIn: 0, fadeOut: 0 }]);
  expect("sound" in p1.audioTracks[0]).toBe(false);
  expect(speechTracksOf(p1, "o1").map((t) => t.id)).toEqual(["t1"]);
  expect(speechTracksOf(p1, "o2")).toEqual([]);
});

test("placeSpeech again for the same text REPLACES: one bar where the earliest one was, keeping its volume, fades and sound setting", () => {
  let p = placeSpeech(base(), "o1", made(1));
  p = { ...p, audioTracks: p.audioTracks.map((t) => ({ ...t, start: 5, volume: 1.4, fadeIn: 0.5, trimStart: 0.3 })) };
  p = setTrackSound(p, "t1", { voice: "deep" });
  const later = makeAudioTrack({ id: "piece", sourceDuration: 2.5, sourceUri: `${MEDIA}/speech-o1-s1.caf`, start: 9, kind: "voice" });   // a duplicate of the reading
  const music = makeAudioTrack({ id: "m", sourceDuration: 30 });
  p = { ...p, audioTracks: [...p.audioTracks, later, music] };
  const next = placeSpeech(p, "o1", made(2, 3.2));
  expect(next.audioTracks.map((t) => t.id)).toEqual(["m", "t2"]);
  const bar = next.audioTracks[1];
  expect(bar).toMatchObject({ sourceUri: `${MEDIA}/speech-o1-s2.caf`, start: 5, volume: 1.4, fadeIn: 0.5, fadeOut: 0, trimStart: 0, trimEnd: 3.2, sourceDuration: 3.2, kind: "voice" });
  expect(bar.sound).toEqual({ voice: "deep", strength: 0.5, pitch: 0, eq: null, level: false });
});

test("placeSpeech changes nothing for a text that is gone, a caption, a length that is not one, or a full project", () => {
  const p0 = base();
  expect(placeSpeech(p0, "nope", made(1))).toBe(p0);
  expect(placeSpeech(p0, "o1", made(1, 0))).toBe(p0);
  expect(placeSpeech(p0, "o1", made(1, NaN))).toBe(p0);
  const full = { ...p0, audioTracks: Array.from({ length: 12 }, (_, i) => makeAudioTrack({ id: `m${i}`, sourceDuration: 5 })) };
  expect(placeSpeech(full, "o1", made(1))).toBe(full);
});

const VOICES: VoiceRow[] = [
  { id: "en.samantha", name: "Samantha", language: "en-US", languageName: "English (United States)", quality: 1 },
  { id: "en.ava", name: "Ava", language: "en-US", languageName: "English (United States)", quality: 3 },
  { id: "en.daniel", name: "Daniel", language: "en-GB", languageName: "English (United Kingdom)", quality: 2 },
  { id: "el.melina", name: "Melina", language: "el-GR", languageName: "Greek (Greece)", quality: 1 },
];

test("languages: the phone's own first, then by name; voices: best quality first, then by name", () => {
  expect(languagesOf(VOICES, "el-GR").map((l) => l.code)).toEqual(["el-GR", "en-GB", "en-US"]);
  expect(languagesOf(VOICES, "fr-FR").map((l) => l.code)).toEqual(["en-GB", "en-US", "el-GR"]);
  expect(languagesOf(VOICES, "en-US")[0]).toEqual({ code: "en-US", name: "English (United States)" });
  expect(voicesOf(VOICES, "en-US").map((v) => v.id)).toEqual(["en.ava", "en.samantha"]);
  expect(voicesOf(VOICES, "xx")).toEqual([]);
  expect(VOICES.map(voiceLabel)).toEqual(["Samantha", "Ava · Premium", "Daniel · Enhanced", "Melina"]);
  expect(voiceLabel({ ...VOICES[0], quality: 9 })).toBe("Samantha");
});

test("pickVoice: the remembered voice if it is still installed, else the best of the phone's language, else of its base language, else the first", () => {
  expect(pickVoice(VOICES, "el-GR", "en.daniel")?.id).toBe("en.daniel");
  expect(pickVoice(VOICES, "en-US", "gone")?.id).toBe("en.ava");
  expect(pickVoice(VOICES, "en-AU", null)?.id).toBe("en.daniel");          // no en-AU voice: another English one, the first by language name
  expect(pickVoice(VOICES, "fr-FR", null)?.id).toBe("en.daniel");          // nothing French: the first row of the first language shown
  expect(pickVoice([], "en-US", null)).toBeNull();
});
```

- [ ] **Step 2: Run** `npx.cmd jest src/editor/model/__tests__/speech.test.ts` → FAIL (module missing).
- [ ] **Step 3: Implement.** Create `src/editor/model/speech.ts`:

```ts
import { addAudioTrack, deleteAudioTrack } from "./ops";
import { AUDIO_LIMITS, isTextOverlay, type AudioTrack, type Project } from "./types";

/**
 * Read aloud: what is read, how fast, where the spoken file lives and how its bar is placed. TypeScript only — the native side
 * receives a text, a voice id and a rate, and writes one file. Nothing here is stored in the project but an ordinary audio track.
 */
export const SPEECH_LIMITS = { maxChars: 1000, titleChars: 24, pace: [0, 1] as const, defaultPace: 0.5, rate: [0.35, 0.65] as const };

/** Code points the system would read by name (emoji, pictographs) or that only glue them together: left out of what is read. */
const NOT_READ: readonly (readonly [number, number])[] = [
  [0x1f000, 0x1faff], [0x2600, 0x27bf], [0x2b00, 0x2bff], [0x2300, 0x23ff],   // emoji and pictographs
  [0xfe00, 0xfe0f], [0x200d, 0x200d], [0x20e3, 0x20e3], [0xe0020, 0xe007f],   // variation selectors, the joiner, the keycap, tags
];
/** The text as it is spoken: no emoji, single spaces, trimmed. Empty = nothing to read. (Code-point ranges: no `\p{…}` on purpose.) */
export function speakableText(text: string): string {
  let out = "";
  for (const ch of Array.from(String(text))) {
    const point = ch.codePointAt(0) ?? 0;
    out += NOT_READ.some(([lo, hi]) => point >= lo && point <= hi) ? " " : ch;
  }
  return out.replace(/\s+/g, " ").trim();
}

const unit = (v: number): number => Math.min(1, Math.max(0, v));
/** The rate sent to the native side for a pace 0 … 1: 0.5 is the system's normal pace (the native side maps it around Apple's default). */
export function speechRate(pace: number): number {
  const p = Number.isFinite(pace) ? unit(pace) : SPEECH_LIMITS.defaultPace;
  return Math.round((SPEECH_LIMITS.rate[0] + (SPEECH_LIMITS.rate[1] - SPEECH_LIMITS.rate[0]) * p) * 1000) / 1000;
}
export const paceLabel = (pace: number): string => (pace < 0.45 ? "Slower" : pace > 0.55 ? "Faster" : "Normal");

const namePart = (s: string): string => String(s).replace(/[^A-Za-z0-9_-]/g, "_");
const prefixOf = (overlayId: string): string => `speech-${namePart(overlayId)}-`;
/** The file one reading of a text is written to (in the project's media folder): the text's id, then a new id per reading. */
export const speechFileName = (overlayId: string, stamp: string): string => `${prefixOf(overlayId)}${namePart(stamp)}.caf`;
/** The audio tracks that were read from this text: recognised by their file's name, so nothing extra is stored. */
export function speechTracksOf(p: Project, overlayId: string): AudioTrack[] {
  const prefix = prefixOf(overlayId);
  return p.audioTracks.filter((t) => (t.sourceUri.split("/").pop() ?? "").startsWith(prefix));
}

const textOf = (p: Project, overlayId: string): string | null => {
  const o = p.overlays.find((x) => x.id === overlayId);
  return o && isTextOverlay(o) && o.kind === "text" ? o.text : null;
};
/** Why this text cannot be read aloud: it is not a text (gone, a caption, a sticker), has nothing to read, is too long, or the project has every track it may have and no earlier reading to replace. */
export type SpeechRefusal = "notText" | "noText" | "tooLong" | "limit";
export function speechRefusal(p: Project, overlayId: string): SpeechRefusal | null {
  const raw = textOf(p, overlayId);
  if (raw === null) return "notText";
  const spoken = speakableText(raw);
  if (spoken.length === 0) return "noText";
  if (spoken.length > SPEECH_LIMITS.maxChars) return "tooLong";
  if (speechTracksOf(p, overlayId).length === 0 && p.audioTracks.length >= AUDIO_LIMITS.maxTracks) return "limit";
  return null;
}

/**
 * Puts a finished reading on the audio row: ONE voice track for the text. A first reading starts where the text starts. A later one
 * replaces every bar read from the same text and sits where the earliest of them started, with that bar's volume, fades and sound
 * setting (trims start afresh: the new speech has its own length). Same project when the text is gone or not a text, the length is
 * not a positive number, or the track cannot be added. One project out = one undo step.
 */
export function placeSpeech(p: Project, overlayId: string, made: { id: string; sourceUri: string; seconds: number }): Project {
  const raw = textOf(p, overlayId);
  const overlay = p.overlays.find((x) => x.id === overlayId);
  if (raw === null || !overlay || !Number.isFinite(made.seconds) || made.seconds <= 0) return p;
  const old = speechTracksOf(p, overlayId);
  const first = old.length > 0 ? old.reduce((a, b) => (b.start < a.start ? b : a)) : null;
  let cleared = p;
  for (const t of old) cleared = deleteAudioTrack(cleared, t.id);
  const track: AudioTrack = {
    id: made.id, sourceUri: made.sourceUri, title: speakableText(raw).slice(0, SPEECH_LIMITS.titleChars), sourceDuration: made.seconds,
    start: first ? first.start : overlay.start, trimStart: 0, trimEnd: made.seconds, volume: first ? first.volume : 1, kind: "voice",
    fadeIn: first ? first.fadeIn : 0, fadeOut: first ? first.fadeOut : 0,
  };
  if (first?.sound) track.sound = { ...first.sound };
  const next = addAudioTrack(cleared, track);
  return next === cleared ? p : next;
}

/** One installed voice as the native side lists it. `quality`: Apple's raw value (1 default, 2 enhanced, 3 premium). */
export interface VoiceRow { id: string; name: string; language: string; languageName: string; quality: number }
/** The languages that have a voice: the phone's own first, the rest by name. */
export function languagesOf(voices: readonly VoiceRow[], current: string): { code: string; name: string }[] {
  const seen = new Map<string, string>();
  for (const v of voices) if (!seen.has(v.language)) seen.set(v.language, v.languageName);
  return Array.from(seen, ([code, name]) => ({ code, name }))
    .sort((a, b) => Number(b.code === current) - Number(a.code === current) || a.name.localeCompare(b.name) || a.code.localeCompare(b.code));
}
/** The voices of one language: best quality first, then by name. */
export function voicesOf(voices: readonly VoiceRow[], language: string): VoiceRow[] {
  return voices.filter((v) => v.language === language).sort((a, b) => b.quality - a.quality || a.name.localeCompare(b.name));
}
const QUALITY: Record<number, string> = { 2: "Enhanced", 3: "Premium" };
export const voiceLabel = (v: VoiceRow): string => (QUALITY[v.quality] ? `${v.name} · ${QUALITY[v.quality]}` : v.name);
/** The voice to start with: the remembered one if it is still installed, else the best of the phone's language, else of a language with the same base ("en"), else the first voice shown. */
export function pickVoice(voices: readonly VoiceRow[], current: string, wantedId: string | null): VoiceRow | null {
  const wanted = voices.find((v) => v.id === wantedId);
  if (wanted) return wanted;
  const own = voicesOf(voices, current)[0];
  if (own) return own;
  const languages = languagesOf(voices, current);
  const baseOf = (code: string): string => code.split("-")[0];
  const related = languages.find((l) => baseOf(l.code) === baseOf(current)) ?? languages[0];
  return related ? voicesOf(voices, related.code)[0] ?? null : null;
}
```

(Check with Grep that `makeOverlay` in `types.ts` makes a `kind: "text"` overlay with `start` / `end`, as the Text panel's tests use it; and that an imported `ops.ts` in a model test needs the `@/src/lib/clock` mock the test file has, as `ops.sound.test.ts` does.)

- [ ] **Step 4: Run** the suite → PASS. Then `npm run typecheck` and `npm test`.
- [ ] **Step 5: Commit** — `feat(model): read aloud — what is read, the pace, the file name, one replaceable voice bar per text`.

---

### Task 4: The native wrapper and the build label

**Depends on:** nothing. **Parallel-safe with:** 1, 2, 3.

**Files:** Modify `modules/clipy-video/index.ts` (additions only), `modules/clipy-video/__tests__/index.test.ts` (append one `describe`), `src/lib/buildInfo.ts`, `src/lib/__tests__/buildInfo.test.ts`.

**Do not touch:** every existing export of `index.ts`, anything under `ios/`.

**Interfaces: Produces**

```ts
// modules/clipy-video/index.ts
export interface SpeechVoice { id: string; name: string; language: string; languageName: string; quality: number }
export interface SpeechVoices { current: string; voices: SpeechVoice[] }
export interface SpeechRequest { jobId: string; text: string; voiceId: string; rate: number; outputPath: string }
export interface SpeechResult { fileUri: string; seconds: number }
export const SPEECH_CANCELLED = "E_READ_ALOUD_CANCELLED";
export function isSpeechAvailable(): boolean;       // the module has `speakToFile`
export function isNoiseBuild(): boolean;            // the module has `noiseAvailable`
export function isNoiseAvailable(): boolean;        // … and it answers true; never throws
export function listVoices(): Promise<SpeechVoices>;
export function speakToFile(req: SpeechRequest): Promise<SpeechResult>;
export function cancelSpeech(jobId: string): void;
export function isSpeechCancelled(e: unknown): boolean;
// src/lib/buildInfo.ts
export const LATEST_TOOLS: string;                  // NEEDS_LATEST_BUILD("Reduce noise and Read aloud")
// buildLabel() → "App build: noise, ramps and speech" when isSpeechAvailable()
```

- [ ] **Step 1: Failing tests.**

In `modules/clipy-video/__tests__/index.test.ts` (its top mock is not edited: every test below hands the wrapper its own module, because the tests before it reset the shared mock): add `cancelSpeech, isNoiseAvailable, isNoiseBuild, isSpeechAvailable, isSpeechCancelled, listVoices, speakToFile, SPEECH_CANCELLED` to the import from `../index`; append:

```ts
describe("noise and speech API (the build of 2026-10-08)", () => {
  const speech = { jobId: "j", text: "Hello", voiceId: "en.samantha", rate: 0.5, outputPath: "file:///doc/projects/p1/media/speech-o1-s1.caf" };
  const old = { hello: () => "old", exportTimeline: jest.fn(), renderSound: jest.fn() };   // the build with the sound tools, before this batch

  const latest = { ...old, noiseAvailable: jest.fn(() => true), listVoices: jest.fn(), speakToFile: jest.fn(), cancelSpeech: jest.fn() };

  it("isSpeechAvailable / isNoiseBuild: only when the linked module has the functions", () => {
    jest.mocked(requireOptionalNativeModule).mockReturnValue(latest as never);
    try {
      expect(isSpeechAvailable()).toBe(true);
      expect(isNoiseBuild()).toBe(true);
      expect(isNoiseAvailable()).toBe(true);
    } finally { jest.mocked(requireOptionalNativeModule).mockReset(); }
    for (const module of [null, old]) {
      jest.mocked(requireOptionalNativeModule).mockReturnValue(module as never);
      try {
        expect(isSpeechAvailable()).toBe(false);
        expect(isNoiseBuild()).toBe(false);
        expect(isNoiseAvailable()).toBe(false);
      } finally { jest.mocked(requireOptionalNativeModule).mockReset(); }
    }
  });

  it("isNoiseAvailable asks the phone, and a native side that answers no or throws counts as no", () => {
    jest.mocked(requireOptionalNativeModule).mockReturnValueOnce({ noiseAvailable: () => true } as never);
    expect(isNoiseAvailable()).toBe(true);
    jest.mocked(requireOptionalNativeModule).mockReturnValueOnce({ noiseAvailable: () => false } as never);
    expect(isNoiseAvailable()).toBe(false);
    jest.mocked(requireOptionalNativeModule).mockReturnValueOnce({ noiseAvailable: () => { throw new Error("boom"); } } as never);
    expect(isNoiseAvailable()).toBe(false);
  });

  it("listVoices, speakToFile and cancelSpeech forward to the native module", async () => {
    const native = { listVoices: jest.fn(async () => ({ current: "el-GR", voices: [{ id: "v", name: "Melina", language: "el-GR", languageName: "Greek (Greece)", quality: 1 }] })),
      speakToFile: jest.fn(async () => ({ fileUri: speech.outputPath, seconds: 1.5 })), cancelSpeech: jest.fn() };
    jest.mocked(requireOptionalNativeModule).mockReturnValue(native as never);
    try {
      await expect(listVoices()).resolves.toEqual({ current: "el-GR", voices: [{ id: "v", name: "Melina", language: "el-GR", languageName: "Greek (Greece)", quality: 1 }] });
      await expect(speakToFile(speech)).resolves.toEqual({ fileUri: speech.outputPath, seconds: 1.5 });
      expect(native.speakToFile).toHaveBeenCalledWith(speech);
      cancelSpeech("j");
      expect(native.cancelSpeech).toHaveBeenCalledWith("j");
    } finally { jest.mocked(requireOptionalNativeModule).mockReset(); }
  });

  it("without the module they throw the not-linked error; with an older build a plain sentence, never 'undefined is not a function'", () => {
    const calls = [() => listVoices(), () => speakToFile(speech), () => cancelSpeech("j")];
    jest.mocked(requireOptionalNativeModule).mockReturnValue(null);
    try { for (const call of calls) expect(call).toThrow(/not linked/); } finally { jest.mocked(requireOptionalNativeModule).mockReset(); }
    jest.mocked(requireOptionalNativeModule).mockReturnValue(old as never);
    try { for (const call of calls) expect(call).toThrow(/latest Clipy build/); } finally { jest.mocked(requireOptionalNativeModule).mockReset(); }
  });

  it("isSpeechCancelled recognises the native cancel code only", () => {
    expect(SPEECH_CANCELLED).toBe("E_READ_ALOUD_CANCELLED");
    expect(isSpeechCancelled(Object.assign(new Error("Speech cancelled"), { code: "E_READ_ALOUD_CANCELLED" }))).toBe(true);
    expect(isSpeechCancelled(Object.assign(new Error("x"), { code: "E_READ_ALOUD" }))).toBe(false);
    expect(isSpeechCancelled(new Error("Speech cancelled"))).toBe(false);
    expect(isSpeechCancelled(null)).toBe(false);
  });
});
```

Replace `src/lib/__tests__/buildInfo.test.ts` with (the mock gains one function, the label one row; these are the pinned values of this task):

```ts
jest.mock("@/modules/clipy-video", () => ({ isNativeAvailable: jest.fn(), isSoundAvailable: jest.fn(), isSpeechAvailable: jest.fn() }));
import { isNativeAvailable, isSoundAvailable, isSpeechAvailable } from "@/modules/clipy-video";
import { buildLabel, LATEST_TOOLS, NEEDS_LATEST_BUILD } from "../buildInfo";

const set = (native: boolean, sound: boolean, speech: boolean) => {
  (isNativeAvailable as jest.Mock).mockReturnValue(native); (isSoundAvailable as jest.Mock).mockReturnValue(sound); (isSpeechAvailable as jest.Mock).mockReturnValue(speech);
};

test("the label names what the installed app can do, newest ability first", () => {
  set(true, true, true);
  expect(buildLabel()).toBe("App build: noise, ramps and speech");
  set(true, true, false);
  expect(buildLabel()).toBe("App build: sound tools");
  set(true, false, false);
  expect(buildLabel()).toBe("App build: export only (older)");
  set(false, false, false);
  expect(buildLabel()).toBe("Expo Go (no video engine)");
});

test("a missing ability is said with what to do about it", () => {
  expect(NEEDS_LATEST_BUILD("Voice and sound effects")).toBe("Voice and sound effects need the latest Clipy build. Install it from the newest build link.");
  expect(LATEST_TOOLS).toBe("Reduce noise and Read aloud need the latest Clipy build. Install it from the newest build link.");
});
```

- [ ] **Step 2: Run** `npx.cmd jest modules/clipy-video/__tests__/index.test.ts src/lib/__tests__/buildInfo.test.ts` → the new tests FAIL.
- [ ] **Step 3: Implement.**

`modules/clipy-video/index.ts`:

1. After the `NoiseProbe` interface and before `SOUND_CANCELLED`, insert:

```ts
/** One installed voice. `languageName` is the language in the phone's own language; `quality` is Apple's raw value (1 default, 2 enhanced, 3 premium). */
export interface SpeechVoice { id: string; name: string; language: string; languageName: string; quality: number }
/** `current` = the phone's language code (BCP 47), to start the picker on. */
export interface SpeechVoices { current: string; voices: SpeechVoice[] }
/** One Read aloud: the text as it is spoken, the voice, the rate (0 … 1, 0.5 = the system's normal pace) and the file to write. */
export interface SpeechRequest { jobId: string; text: string; voiceId: string; rate: number; outputPath: string }
export interface SpeechResult { fileUri: string; seconds: number }
/** The code a cancelled Read aloud rejects with. */
export const SPEECH_CANCELLED = "E_READ_ALOUD_CANCELLED";
```

2. In the `ClipyVideoNative` type, after `probeNoiseReduction(…)`, add:

```ts
  noiseAvailable(): boolean;
  listVoices(): Promise<SpeechVoices>;
  speakToFile(req: SpeechRequest): Promise<SpeechResult>;
  cancelSpeech(jobId: string): void;
```

3. At the end of the file, append:

```ts

const NOT_IN_BUILD = "This build of the app cannot do that yet. Install the latest Clipy build.";
/** The module for a call that came with the build of 2026-10-08: missing = not linked (Expo Go); present but without the function = an older build. */
function latestNative(fn: "listVoices" | "speakToFile" | "cancelSpeech"): ClipyVideoNative {
  const m = native();
  if (typeof m[fn] !== "function") throw new Error(NOT_IN_BUILD);
  return m;
}
/** Whether the linked native module can read a text aloud: false in Expo Go and in a build made before Read aloud. */
export function isSpeechAvailable(): boolean { return typeof optional()?.speakToFile === "function"; }
/** Whether the linked native module knows Reduce noise at all (a build made before it would ignore the request's noise number). */
export function isNoiseBuild(): boolean { return typeof optional()?.noiseAvailable === "function"; }
/** Whether Reduce noise can run: the build knows it AND this iPhone has Apple's sound isolation unit. Never throws. */
export function isNoiseAvailable(): boolean {
  try {
    const m = optional();
    return !!m && typeof m.noiseAvailable === "function" && m.noiseAvailable() === true;
  } catch { return false; }
}
export function listVoices(): Promise<SpeechVoices> { return latestNative("listVoices").listVoices(); }
export function speakToFile(req: SpeechRequest): Promise<SpeechResult> { return latestNative("speakToFile").speakToFile(req); }
export function cancelSpeech(jobId: string): void { latestNative("cancelSpeech").cancelSpeech(jobId); }
/** True for the rejection of a Read aloud that was cancelled (`cancelSpeech`). */
export function isSpeechCancelled(e: unknown): boolean { return typeof e === "object" && e !== null && (e as { code?: unknown }).code === SPEECH_CANCELLED; }
```

`src/lib/buildInfo.ts`: the import becomes `import { isNativeAvailable, isSoundAvailable, isSpeechAvailable } from "@/modules/clipy-video";`; `LEVELS` gains a first row `{ name: "noise, ramps and speech", has: isSpeechAvailable },`; at the end of the file add:

```ts
/** Said where Reduce noise or Read aloud is tapped in Expo Go or in a build from before them. */
export const LATEST_TOOLS = NEEDS_LATEST_BUILD("Reduce noise and Read aloud");
```

Then Grep for other tests that mock `@/modules/clipy-video` **and** import `buildInfo` or something that calls `buildLabel()` (the Accounts screen's test, if any): a factory mock without `isSpeechAvailable` would make `buildLabel()` call `undefined`. Add `isSpeechAvailable: jest.fn(() => false)` to each such mock (a pinned mock; name them in the commit message).

- [ ] **Step 4: Run** the two suites → PASS. Then `npm run typecheck` and `npm test`.
- [ ] **Step 5: Commit** — `feat(native-wrapper): noise and speech calls behind presence checks; the build label knows "noise, ramps and speech"`.

---

### Task 5: Noise maths: `noiseWet`, the chain, the file name; the request field

**Depends on:** Tasks 1, 4. **Parallel-safe with:** 10, 11.

**Files:** Modify `src/editor/model/sound.ts`, `src/editor/model/__tests__/sound.test.ts` (the pinned `NEUTRAL` literal + append), `modules/clipy-video/ios/SoundRender.swift` (**one line**: the record field), `modules/clipy-video/__tests__/index.test.ts` (one key in the `request` literal of its "sound API" block).

**Do not touch:** `SOUND_VERSION` (it stays 1: no existing chain changes), `soundMath.ts`, the rest of `SoundRender.swift` (Task 6), `soundRenders.ts` (Task 8).

**Interfaces: Consumes** `SoundSettings.noise` (Task 1). **Produces**

```ts
export interface SoundChain { /* …everything of today… */ noiseWet: number }   // 0 = no isolation unit; else its wet/dry mix in percent
export function noiseWet(strength: number): number;                             // 100 − 50·(1 − s)², 3 decimals
// soundFileName(...) ends "-n<strength %>.m4a" when the setting has noise, and is unchanged when it has not
```
Swift: `SoundRenderRequest` gains `@Field var noiseWet: Double = 0`.

- [ ] **Step 1: Failing tests.**

In `src/editor/model/__tests__/sound.test.ts`, the pinned literal `NEUTRAL` gains `noiseWet: 0` at its end (the one edit to existing lines of that file). Add `noiseWet` to the import from `../sound`, and append:

```ts
describe("Reduce noise", () => {
  test("noiseWet: 50 % at the lightest, 87.5 % in the middle, everything at the strongest", () => {
    expect([0, 0.25, 0.5, 0.75, 1].map(noiseWet)).toEqual([50, 71.875, 87.5, 96.875, 100]);
    expect(noiseWet(-2)).toBe(50);
    expect(noiseWet(7)).toBe(100);
    expect(noiseWet(NaN)).toBe(50);
  });

  test("the chain carries the mix only when the setting has noise, and nothing else moves", () => {
    expect(soundChain(set({})).noiseWet).toBe(0);
    expect(soundChain(set({ noise: 0.5 }))).toEqual({ ...NEUTRAL, noiseWet: 87.5 });
    expect(soundChain(set({ noise: 0 }))).toEqual({ ...NEUTRAL, noiseWet: 50 });
    expect(soundChain(set({ voice: "deep", strength: 0.5, noise: 1 }))).toEqual({ ...NEUTRAL, pitchCents: -450, noiseWet: 100 });
    expect(soundChain({ ...set({}), noise: "loud" as unknown as number }).noiseWet).toBe(0);   // not a number: off
  });

  test("the copy of a noise setting has its own name; two strengths are two copies", () => {
    const src = "file:///doc/projects/p1/media/abc.m4a";
    expect(soundFileName(src, set({ noise: 0.5 }))).toBe("abc-v1-plain-s0-p0-flat-l0-n50.m4a");
    expect(soundFileName(src, set({ noise: 0 }))).toBe("abc-v1-plain-s0-p0-flat-l0-n0.m4a");
    expect(soundFileName(src, { voice: "deep", strength: 0.5, pitch: -3, eq: "warm", level: true, noise: 0.75 })).toBe("abc-v1-deep-s50-pm3-warm-l1-n75.m4a");
    expect(soundFileName(src, set({ noise: 0.5 }))).not.toBe(soundFileName(src, set({ noise: 0.6 })));
  });

  test("PROOF: a setting without noise keeps the name and the numbers it had (copies on disk are found again; SOUND_VERSION stays 1)", () => {
    const src = "file:///doc/projects/p1/media/abc.mov";
    expect(SOUND_VERSION).toBe(1);
    expect(soundFileName(src, { voice: "deep", strength: 0.5, pitch: -3, eq: "warm", level: true })).toBe("abc-v1-deep-s50-pm3-warm-l1.m4a");
    expect(soundFileName(src, { voice: null, strength: 0.5, pitch: 2, eq: null, level: false })).toBe("abc-v1-plain-s0-p2-flat-l0.m4a");
    expect(soundFileName(src, { voice: "robot", strength: 1, pitch: 0, eq: "bright", level: false })).toBe("abc-v1-robot-s100-p0-bright-l0.m4a");
    const { noiseWet: mix, ...rest } = soundChain({ voice: "robot", strength: 1, pitch: 0, eq: null, level: false });
    expect(mix).toBe(0);
    expect(rest).toEqual({ pitchCents: -300, distortionPreset: "speechCosmicInterference", distortionWet: 30, distortionPreGain: -6, delayTime: 0.012, delayFeedback: 85, delayWet: 70,
      delayLowPass: 8000, reverbPreset: "", reverbWet: 0, bands: [], level: false });
  });

  test("neededSounds: a noise setting needs a copy like any other", () => {
    const p = makeProject({ audioTracks: [{ ...makeAudioTrack({ id: "v", sourceDuration: 5 }), sound: set({ noise: 0.5 }) }] });
    expect(neededSounds(p).map((n) => n.name)).toEqual(["v-v1-plain-s0-p0-flat-l0-n50.m4a"]);
  });
});
```

(`set`, `NEUTRAL` are the file's own helpers; add `SOUND_VERSION`, `neededSounds`, `makeAudioTrack`, `makeProject` to its imports if they are not there. If `set` is typed so that `noise` is not accepted, widen its parameter to `Partial<SoundSettings>`.)

In `modules/clipy-video/__tests__/index.test.ts`, the `request` literal of the "sound API" block gains `noiseWet: 0` (it must stay a whole `SoundRenderRequest`).

- [ ] **Step 2: Run** `npx.cmd jest src/editor/model/__tests__/sound.test.ts src/editor/model/__tests__/soundRender.swift.test.ts` → the new tests FAIL; after Step 3's TypeScript half the swift-reading test "the request record has exactly the fields the app sends" fails on `noiseWet` until the Swift line is in.
- [ ] **Step 3: Implement.**

`src/editor/model/sound.ts`:

1. `SoundChain` gains a last member, and its comment one sentence:

```ts
  level: boolean;
  /** Reduce noise: the isolation unit's wet / dry mix in percent, first in the chain. 0 = no unit. */
  noiseWet: number;
```

2. After `pitchOf` add:

```ts
/** The noise strength of a setting, or null when Reduce noise is off (no key, or not a number). */
const noiseOf = (s: SoundSettings): number | null => (typeof s.noise === "number" && Number.isFinite(s.noise) ? clamp(s.noise, 0, 1) : null);
/**
 * Reduce noise, strength 0 … 1 → the unit's wet / dry mix in percent. The mix is a straight blend, so what is left of the noise is
 * `1 − wet`: 50 % (−6 dB) at the lightest, 87.5 % (−18 dB) in the middle, 100 % (the isolated voice alone) at the strongest —
 * a curve, so equal slider steps sound like equal steps.
 */
export function noiseWet(strength: number): number {
  const k = Number.isFinite(strength) ? clamp(strength, 0, 1) : 0;
  return Math.round((100 - 50 * (1 - k) * (1 - k)) * 1000) / 1000;
}
```

3. In `soundChain`, add `const noise = noiseOf(s);` beside the other reads and a last member of the returned object: `noiseWet: noise === null ? 0 : noiseWet(noise),`.
4. `soundFileName`: the return becomes

```ts
  const noise = noiseOf(s);
  // The noise part is there only when Reduce noise is on: a setting without it keeps the name it always had.
  const tail = noise === null ? "" : `-n${Math.round(noise * 100)}`;
  return `${stemOf(String(sourceUri))}-v${SOUND_VERSION}-${voice ?? "plain"}-s${strength}-${pitch}-${eqOf(s) ?? "flat"}-l${s.level === true ? 1 : 0}${tail}.m4a`;
```

and its doc comment gains: `With Reduce noise on the name ends -n<strength %>: abc-v1-plain-s0-p0-flat-l0-n50.m4a.`

`modules/clipy-video/ios/SoundRender.swift`: in `struct SoundRenderRequest: Record`, after `@Field var level: Bool = false` add exactly:

```swift
  @Field var noiseWet: Double = 0                  // Reduce noise: the isolation unit's wet/dry mix in percent; 0 = no unit
```

Then Grep the tests for other whole `SoundChain` / `SoundRenderRequest` literals (`reverbWet: 0`) and add `noiseWet: 0` to each that the type checker names (pinned key lists).

- [ ] **Step 4: Run** `npx.cmd jest src/editor/model modules/clipy-video src/editor/__tests__/soundRenders.test.ts src/export` → PASS. Then `npm run typecheck` and `npm test`.
- [ ] **Step 5: Commit** — `feat(sound): reduce noise as one more number of the chain; copies without it keep their names`.

---

### Task 6: Swift: the isolation unit in the render

**Depends on:** Task 5. **Parallel-safe with:** 8, 12.

**Files:** Modify `modules/clipy-video/ios/SoundRender.swift`, `modules/clipy-video/ios/ClipyVideoModule.swift`, `src/editor/model/__tests__/soundRender.swift.test.ts` (the pinned type list, one pinned line if it quotes the changed one, + append).

**Do not touch:** `SoundRender.process`, `SoundRender.measure`, `SoundProbe` (its `accepts` is called), `SoundMath.swift`, `ExportSession.swift`, `index.ts`.

**Interfaces: Consumes** `SoundRenderRequest.noiseWet` (Task 5), `SoundProbe.accepts`, `SoundRender.bounded`, `ExportSession.describe`. **Produces** `enum SoundNoise { static func component() -> AudioComponentDescription; static func isOnThisPhone() -> Bool; static func make(wet: Double, format: AVAudioFormat) async throws -> AVAudioUnit }`; `SoundRender.render(_:source:lead:to:job:progress:)`; the native function `noiseAvailable() -> Bool`.

- [ ] **Step 1: Failing tests.** In `soundRender.swift.test.ts`: the pinned type list in "no type and no static name is declared twice" gains `"SoundNoise"` (keep it sorted: after `"SoundJob"`), and the loop `for (const owner of ["SoundRender", "SoundProbe"])` gains `"SoundNoise"`. Append:

```ts
describe("Reduce noise (SoundNoise)", () => {
  const noise = between(render, "enum SoundNoise {", "\n}\n");
  const renderSoundFn = between(moduleSwift, 'AsyncFunction("renderSound")', "\n    }\n");

  test("the unit is made the way the probe proved: found, instantiated with await, given the format before the engine sees it", () => {
    expect(noise).toContain("kAudioUnitType_Effect");
    expect(noise).toContain("kAudioUnitSubType_AUSoundIsolation");
    expect(noise).toContain("kAudioUnitManufacturer_Apple");
    expect(noise).toContain("AudioComponentFindNext(nil, &wanted)");
    const make = between(noise, "static func make(", "\n  }\n");
    expect(make).toMatch(/static func make\(wet: Double, format: AVAudioFormat\) async throws -> AVAudioUnit/);
    expect(make).toContain("try await AVAudioUnit.instantiate(with: component(), options: [])");
    expect(make).toContain("try SoundProbe.accepts(unit, format: format)");
    expect(make.indexOf("AVAudioUnit.instantiate")).toBeLessThan(make.indexOf("SoundProbe.accepts"));
    expect(make.indexOf("SoundProbe.accepts")).toBeLessThan(make.indexOf("kAUSoundIsolationParam_WetDryMixPercent"));
  });

  test("the strength is set through the parameter tree, else through AudioUnitSetParameter, and a failure is said — never a render at another strength", () => {
    const make = between(noise, "static func make(", "\n  }\n");
    expect(make).toContain("parameter(withAddress: AUParameterAddress(kAUSoundIsolationParam_WetDryMixPercent))");
    expect(make).toContain("AudioUnitSetParameter(unit.audioUnit, kAUSoundIsolationParam_WetDryMixPercent, kAudioUnitScope_Global, 0,");
    expect(make).toContain('throw SoundError.failed("sound noise: the strength could not be set (\\(status))")');
    expect(make).toContain("SoundRender.bounded(wet, 0, 100)");
  });

  test("every failure of the unit has the noise stage", () => {
    const thrown = [...noise.matchAll(/SoundError\.failed\("([^"]*)/g)].map((m) => m[1]);
    expect(thrown.length).toBeGreaterThanOrEqual(4);
    for (const text of thrown) expect(text.startsWith("sound noise: ")).toBe(true);
    expect((noise.match(/ExportSession\.describe\(error\)/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  test("nothing newer than iOS 16.4 is named: no high-quality sound type, no availability check needed", () => {
    expect(noise).not.toContain("HighQuality");
    expect(noise).not.toContain("kAUSoundIsolationParam_SoundToIsolate");
    expect(noise).not.toContain("#available");
  });

  test("the render puts the unit FIRST, before the request's own units, and a request without noise makes none", () => {
    expect(renderFn).toMatch(/static func render\(_ request: SoundRenderRequest, source: SoundSource, lead: \[AVAudioNode\], to outputURL: URL, job: SoundJob,/);
    expect(renderFn).toContain("let chain: [AVAudioNode] = lead + units(for: request)");
    expect(renderSoundFn).toContain("if request.noiseWet.isFinite, request.noiseWet > 0 {");
    expect(renderSoundFn).toContain("try await SoundNoise.make(wet: request.noiseWet, format: noiseFormat)");
    expect(renderSoundFn).toContain("try SoundRender.render(request, source: source, lead: lead, to: outputURL, job: job, progress:");
    expect(renderSoundFn.indexOf("SoundNoise.make")).toBeLessThan(renderSoundFn.indexOf("SoundRender.render("));
    // The loop itself is the one the probe ran: untouched, synchronous.
    expect(processFn).not.toContain("await");
    expect(renderFn).not.toContain("await");
  });

  test("the module says whether this iPhone has the unit", () => {
    expect(moduleSwift).toContain('Function("noiseAvailable")');
    expect(moduleSwift).toContain("SoundNoise.isOnThisPhone()");
    expect(wrapper).toContain("m.noiseAvailable() === true");
  });
});
```

If an existing test of this file quotes the line `let chain: [AVAudioNode] = units(for: request)` or the old `render(` signature, that quoted string is a pinned value: update it to the new line. Nothing else in the existing tests changes.

- [ ] **Step 2: Run** `npx.cmd jest src/editor/model/__tests__/soundRender.swift.test.ts` → the new tests FAIL.
- [ ] **Step 3: Implement.**

`modules/clipy-video/ios/SoundRender.swift`:

1. `SoundRender.render`: the signature becomes

```swift
  static func render(_ request: SoundRenderRequest, source: SoundSource, lead: [AVAudioNode], to outputURL: URL, job: SoundJob,
                     progress: (Double) -> Void) throws -> (seconds: Double, gainDb: Double) {
```

and inside it the line `let chain: [AVAudioNode] = units(for: request)` becomes

```swift
    // `lead` = units that go before the request's own (Reduce noise: the isolation unit, made by the caller because making it is async).
    let chain: [AVAudioNode] = lead + units(for: request)
```

Extend the doc comment above `render` with: `/// `lead` are units placed first in the chain, in order.`

2. Between the closing brace of `enum SoundRender` and the comment above `enum SoundProbe`, insert:

```swift
/// Reduce noise: Apple's sound isolation unit, FIRST in a render's chain (it is trained on natural speech, so it
/// must hear the recording before pitch, echo or filters change it). Made exactly as the probe proved on the phone
/// (`SoundProbe`): instantiated with `AVAudioUnit.instantiate` (a failure is an error, not a crash), then given the
/// render format on its first input and output bus BEFORE the engine connects it (a refusal is an error too).
enum SoundNoise {
  static func component() -> AudioComponentDescription {
    return AudioComponentDescription(componentType: kAudioUnitType_Effect, componentSubType: kAudioUnitSubType_AUSoundIsolation,
                                     componentManufacturer: kAudioUnitManufacturer_Apple, componentFlags: 0, componentFlagsMask: 0)
  }

  /// Whether this iPhone has the unit at all.
  static func isOnThisPhone() -> Bool {
    var wanted = component()
    return AudioComponentFindNext(nil, &wanted) != nil
  }

  /// The unit, ready for the engine: `wet` percent of the isolated voice (0 … 100), the render format taken.
  /// Throws `sound noise: …`. It never returns a unit whose strength is not the one asked for.
  static func make(wet: Double, format: AVAudioFormat) async throws -> AVAudioUnit {
    guard isOnThisPhone() else { throw SoundError.failed("sound noise: the sound isolation unit is not on this iPhone") }
    let unit: AVAudioUnit
    do { unit = try await AVAudioUnit.instantiate(with: component(), options: []) }
    catch { throw SoundError.failed("sound noise: " + ExportSession.describe(error)) }
    do { try SoundProbe.accepts(unit, format: format) }
    catch { throw SoundError.failed("sound noise: " + ExportSession.describe(error)) }
    let percent = Float(SoundRender.bounded(wet.isFinite ? wet : 100, 0, 100))
    if let tree = unit.auAudioUnit.parameterTree,
       let mix = tree.parameter(withAddress: AUParameterAddress(kAUSoundIsolationParam_WetDryMixPercent)) {
      mix.value = percent
      return unit
    }
    // No parameter tree, or no such parameter in it: the older way of setting the same number.
    let status: OSStatus = AudioUnitSetParameter(unit.audioUnit, kAUSoundIsolationParam_WetDryMixPercent, kAudioUnitScope_Global, 0, percent, 0)
    guard status == noErr else { throw SoundError.failed("sound noise: the strength could not be set (\(status))") }
    return unit
  }
}

```

`modules/clipy-video/ios/ClipyVideoModule.swift`:

1. In `AsyncFunction("renderSound")`, replace the two lines

```swift
          let source = try await SoundSource.open(request.sourceUri)
          var lastSent = -1.0
```

with

```swift
          let source = try await SoundSource.open(request.sourceUri)
          // Reduce noise: the isolation unit goes first. Making it is the one async step, so it is made here and
          // handed to the synchronous render. No noise in the request → no unit, and the render is the old one.
          var lead: [AVAudioNode] = []
          if request.noiseWet.isFinite, request.noiseWet > 0 {
            guard let noiseFormat = AVAudioFormat(standardFormatWithSampleRate: SoundRender.sampleRate, channels: 2) else { throw SoundError.failed("sound engine: no audio format") }
            let isolation = try await SoundNoise.make(wet: request.noiseWet, format: noiseFormat)
            lead.append(isolation)
          }
          var lastSent = -1.0
```

and the call `try SoundRender.render(request, source: source, to: outputURL, job: job, progress: {` becomes `try SoundRender.render(request, source: source, lead: lead, to: outputURL, job: job, progress: {`.

2. After the `Function("cancelSoundRender")` block add:

```swift

    // Whether this iPhone has Apple's sound isolation unit. Its presence also tells the app that this build knows
    // the request's `noiseWet` (a build without this function would ignore the number and render without the unit).
    Function("noiseAvailable") { () -> Bool in
      return SoundNoise.isOnThisPhone()
    }
```

**Read it back against these points before committing** (there is no compiler here): `wanted` is a `var` because `AudioComponentFindNext` takes it `inout`; `component()` is a `static func` and no `static let component` exists; `percent` is a `Float` (`AUValue` and `AudioUnitParameterValue` are both `Float`); `lead` is declared once in the `do` block and `isolation` / `noiseFormat` are new names in that scope (the closure below already uses `source`, `lastSent`, `result`, `answer`); the `await` is inside the module's `Task`, not inside `render` / `process`; `import AudioToolbox` is already the first line of `SoundRender.swift` (the module file needs none: it names no AudioToolbox symbol).

- [ ] **Step 4: Run** `npx.cmd jest src/editor/model/__tests__/soundRender.swift.test.ts src/editor/model/__tests__/soundMath.parity.test.ts src/editor/__tests__/looks.frozen.test.ts` → PASS. Then `npm run typecheck` and `npm test`. **No build.**
- [ ] **Step 5: Commit** — `feat(native): reduce noise — the sound isolation unit first in the render, made as the probe proved`.

---

### Task 7: Swift: `SpeechRender.swift`, the module functions

**Depends on:** Task 6 (both edit `ClipyVideoModule.swift`). **Parallel-safe with:** 9.

**Files:** Create `modules/clipy-video/ios/SpeechRender.swift`, `src/editor/model/__tests__/speechRender.swift.test.ts`. Modify `modules/clipy-video/ios/ClipyVideoModule.swift`.

**Do not touch:** every other Swift file, `index.ts` (Task 4 fixed the shapes), the podspec (AVFoundation is linked already).

**Interfaces: Consumes** `ExportSession.describe`, `ExportSession.fileURL(from:)`; the shapes of Task 4. **Produces** the native functions `listVoices`, `speakToFile`, `cancelSpeech`.

- [ ] **Step 1: Failing tests.** Create `src/editor/model/__tests__/speechRender.swift.test.ts`:

```ts
import { readFileSync } from "fs";
import { join } from "path";

// There is no Swift compiler on this machine: these tests READ the Swift and pin what the app relies on.
const root = join(__dirname, "../../../..");
const iosDir = join(root, "modules/clipy-video/ios");
const read = (file: string) => readFileSync(join(iosDir, file), "utf8").replace(/\r\n/g, "\n");
const code = (source: string) => source.replace(/\/\/[^\n]*/g, "");
const speech = code(read("SpeechRender.swift"));
const moduleSwift = code(read("ClipyVideoModule.swift"));
const wrapper = readFileSync(join(root, "modules/clipy-video/index.ts"), "utf8");
const between = (source: string, from: string, to: string): string => {
  const start = source.indexOf(from);
  if (start < 0) throw new Error(`"${from}" not found`);
  const end = source.indexOf(to, start + from.length);
  return source.slice(start, end < 0 ? undefined : end);
};
const job = between(speech, "final class SpeechJob", "\n}\n");

test("the request record has exactly the fields the app sends", () => {
  const fields = [...between(speech, "struct SpeechRequest: Record {", "\n}").matchAll(/@Field var (\w+)/g)].map((m) => m[1]);
  expect(fields.sort()).toEqual(["jobId", "outputPath", "rate", "text", "voiceId"]);
  expect(wrapper).toContain("export interface SpeechRequest { jobId: string; text: string; voiceId: string; rate: number; outputPath: string }");
  expect(wrapper).toContain("export interface SpeechResult { fileUri: string; seconds: number }");
});

test("the synthesizer lives as long as the job, and the job as long as the module holds it", () => {
  expect(job).toMatch(/private let synthesizer = AVSpeechSynthesizer\(\)/);
  expect(moduleSwift).toContain("private var speechJobs: [String: SpeechJob] = [:]");
  expect(moduleSwift).toContain("self.storeSpeechJob(jobId, job)");
  expect(moduleSwift).toContain("self?.dropSpeechJob(jobId)");
});

test("the speech is asked for on the main queue, with the buffer callback named", () => {
  const start = between(job, "func start(", "\n  }\n");
  expect(start).toContain("DispatchQueue.main.async {");
  expect(start).toContain("self.synthesizer.write(utterance, toBufferCallback: { [weak self] (buffer: AVAudioBuffer) -> Void in");
  expect(start).toContain("AVSpeechSynthesisVoice(identifier: voiceId)");
  expect(start).toContain("utterance.rate = SpeechRender.rate(rate)");
  expect(speech).not.toContain("toMarkerCallback");
});

test("the file is made from the FIRST buffer's own format, and no buffer of another format is ever written", () => {
  const take = between(job, "private func take(", "\n  }\n");
  expect(take).toContain("AVAudioFile(forWriting: partURL, settings: pcm.format.settings, commonFormat: pcm.format.commonFormat, interleaved: pcm.format.isInterleaved)");
  expect(take).toContain("SpeechRender.same(made.processingFormat, pcm.format)");
  expect(take).toContain("SpeechRender.same(known, pcm.format)");
  expect(take.indexOf("SpeechRender.same(made.processingFormat, pcm.format)")).toBeLessThan(take.indexOf("try made.write(from: pcm)"));
  expect(take).toContain("pcm.frameLength == 0");
  expect(speech).not.toMatch(/\.close\(\)/);                     // AVAudioFile.close() is iOS 18
});

test("a job always ends, and exactly once: the end marker, silence after sound, nothing at all, or a cancel", () => {
  expect(speech).toContain("static let idleSeconds: Double = 3");
  expect(speech).toContain("static let startSeconds: Double = 20");
  const watch = between(job, "private func watch(", "\n  }\n");
  expect(watch).toContain("DispatchQueue.main.asyncAfter(deadline: .now() + SpeechRender.tick)");
  expect(watch).toContain("SpeechRender.idleSeconds");
  expect(watch).toContain("SpeechRender.startSeconds");
  const end = between(job, "private func end(", "\n  }\n");
  expect(end).toMatch(/if finished \{\s*lock\.unlock\(\)\s*return\s*\}/);
  expect(end).toContain("finished = true");
  expect(end).toContain("file = nil");
  expect(end.indexOf("file = nil")).toBeLessThan(end.indexOf("moveItem(at: partURL, to: outputURL)"));
  expect(end).toContain("removeItem(at: partURL)");
  expect(job).toContain("synthesizer.stopSpeaking(at: .immediate)");
});

test("every failure has a speech stage; a cancel has its own code", () => {
  const thrown = [...speech.matchAll(/SpeechError\.failed\("([^"]*)/g)].map((m) => m[1]);
  expect(thrown.length).toBeGreaterThanOrEqual(4);
  for (const text of thrown) expect(text).toMatch(/^speech (output|voice|render): /);
  expect(speech).toContain('"speech output: " + ExportSession.describe(error)');
  expect(moduleSwift).toContain('promise.reject("E_READ_ALOUD_CANCELLED", "Speech cancelled")');
  expect(moduleSwift).toContain('promise.reject("E_READ_ALOUD", SpeechRender.message(error))');
  expect(wrapper).toContain('export const SPEECH_CANCELLED = "E_READ_ALOUD_CANCELLED";');
});

test("the rate is placed around Apple's own constants, whatever their values", () => {
  const rate = between(speech, "static func rate(", "\n  }\n");
  for (const name of ["AVSpeechUtteranceMinimumSpeechRate", "AVSpeechUtteranceDefaultSpeechRate", "AVSpeechUtteranceMaximumSpeechRate"]) expect(rate).toContain(name);
  expect(rate).toContain("r <= 0.5 ? low + (mid - low) * (r / 0.5) : mid + (high - mid) * ((r - 0.5) / 0.5)");
});

test("the voice list names nothing newer than iOS 16.4 outside an availability check, and no quality case at all", () => {
  const voices = between(speech, "static func voices(", "\n  }\n");
  expect(voices).toContain("AVSpeechSynthesisVoice.speechVoices()");
  expect(voices).toContain("if #available(iOS 17.0, *) {");
  expect(voices.indexOf("if #available(iOS 17.0, *) {")).toBeLessThan(voices.indexOf("voiceTraits"));
  expect(speech.split("voiceTraits").length - 1).toBe(2);         // both uses are in that block
  expect(voices).toContain("voice.quality.rawValue");
  expect(speech).not.toMatch(/\.premium|\.enhanced/);
  for (const key of ["id", "name", "language", "languageName", "quality"]) expect(voices).toContain(`"${key}":`);
  expect(wrapper).toContain("export interface SpeechVoice { id: string; name: string; language: string; languageName: string; quality: number }");
});

test("no force unwrap, no try!, no as!; no type and no static name declared twice; nothing clashes with the other files", () => {
  expect(speech).not.toMatch(/[\w)\]]!(?!=)/);
  expect(speech).not.toMatch(/\b(try|as)!/);
  const types = [...speech.matchAll(/^(?:final class|struct|enum) (\w+)/gm)].map((m) => m[1]);
  expect(types.sort()).toEqual(["SpeechError", "SpeechJob", "SpeechRender", "SpeechRequest"]);
  const others = ["ExportSession.swift", "ClipyVideoModule.swift", "MediaPrePass.swift", "Transcriber.swift", "AudioMix.swift", "SoundMath.swift", "SoundRender.swift"].map((f) => code(read(f))).join("\n");
  for (const t of types) expect(others).not.toMatch(new RegExp(`(?:class|struct|enum) ${t}\\b`));
  const body = between(speech, "enum SpeechRender {", "\n}\n");
  const values = [...body.matchAll(/static (?:let|var) (\w+)/g)].map((m) => m[1]);
  const funcs = [...body.matchAll(/static func (\w+)\(/g)].map((m) => m[1]);
  expect(values.filter((n) => funcs.includes(n))).toEqual([]);
  expect(new Set(values).size).toBe(values.length);
  expect(new Set(funcs).size).toBe(funcs.length);
});

test("the module registers the three functions and answers with the shapes the wrapper declares", () => {
  expect(moduleSwift).toContain('AsyncFunction("listVoices")');
  expect(moduleSwift).toContain('AsyncFunction("speakToFile")');
  expect(moduleSwift).toContain('Function("cancelSpeech")');
  expect(moduleSwift).toContain('let answer: [String: Any] = ["current": AVSpeechSynthesisVoice.currentLanguageCode(), "voices": SpeechRender.voices()]');
  expect(moduleSwift).toContain('let answer: [String: Any] = ["fileUri": outputURL.absoluteString, "seconds": seconds]');
  for (const fn of ["listVoices", "speakToFile", "cancelSpeech"]) expect(wrapper).toContain(`latestNative("${fn}").${fn}(`);
  // Everything that was there is still there.
  for (const name of ["exportTimeline", "transcribe", "renderSound", "soundInfo", "probeNoiseReduction"]) expect(moduleSwift).toContain(`AsyncFunction("${name}")`);
});
```

- [ ] **Step 2: Run** `npx.cmd jest src/editor/model/__tests__/speechRender.swift.test.ts` → FAIL (no file).
- [ ] **Step 3: Implement.** Create `modules/clipy-video/ios/SpeechRender.swift`:

```swift
import AVFoundation
import ExpoModulesCore

/// One Read aloud (`SpeechRequest` in modules/clipy-video/index.ts). `rate` is 0 … 1 with 0.5 = the system's normal
/// pace (`speechRate` in src/editor/model/speech.ts); `text` is already cleaned by the app.
struct SpeechRequest: Record {
  @Field var jobId: String = ""
  @Field var text: String = ""
  @Field var voiceId: String = ""
  @Field var rate: Double = 0.5
  @Field var outputPath: String = ""
}

enum SpeechError: Error, LocalizedError {
  case cancelled
  case failed(String)
  var errorDescription: String? {
    switch self {
    case .cancelled: return "Speech cancelled"
    case .failed(let text): return text
    }
  }
}

/// Pure helpers of Read aloud.
enum SpeechRender {
  /// How often a running job is looked at.
  static let tick: Double = 0.25
  /// Sound has come and then nothing for this long: the speech is over (the empty end buffer never came).
  static let idleSeconds: Double = 3
  /// Nothing at all for this long: this voice gives no sound here.
  static let startSeconds: Double = 20

  /// What a failure says to the app: a SpeechError's own staged text, anything else described in full.
  static func message(_ error: Error) -> String {
    if let own = error as? SpeechError, let text = own.errorDescription { return text }
    return "speech render: " + ExportSession.describe(error)
  }

  /// The app's 0 … 1 (0.5 = normal) placed around Apple's own constants: below the middle between the slowest and
  /// the default rate, above it between the default and the fastest. Not a number → the default.
  static func rate(_ normal: Double) -> Float {
    let r = normal.isFinite ? min(1, max(0, normal)) : 0.5
    let low = Double(AVSpeechUtteranceMinimumSpeechRate)
    let mid = Double(AVSpeechUtteranceDefaultSpeechRate)
    let high = Double(AVSpeechUtteranceMaximumSpeechRate)
    let value = r <= 0.5 ? low + (mid - low) * (r / 0.5) : mid + (high - mid) * ((r - 0.5) / 0.5)
    return Float(value)
  }

  /// Two formats a file can take one after the other without converting.
  static func same(_ a: AVAudioFormat, _ b: AVAudioFormat) -> Bool {
    return a.channelCount == b.channelCount && a.sampleRate == b.sampleRate && a.commonFormat == b.commonFormat && a.isInterleaved == b.isInterleaved
  }

  /// The voices installed on this iPhone: id, name, language code, the language's name in the phone's language and
  /// Apple's quality number (1 default, 2 enhanced, 3 premium — sent raw, no case is named). Novelty and personal
  /// voices are left out where the system can tell (iOS 17 and later).
  static func voices() -> [[String: Any]] {
    var out: [[String: Any]] = []
    for voice in AVSpeechSynthesisVoice.speechVoices() {
      if #available(iOS 17.0, *) {
        if voice.voiceTraits.contains(.isNoveltyVoice) || voice.voiceTraits.contains(.isPersonalVoice) { continue }
      }
      let languageName: String = Locale.current.localizedString(forIdentifier: voice.language) ?? voice.language
      let row: [String: Any] = ["id": voice.identifier, "name": voice.name, "language": voice.language, "languageName": languageName, "quality": voice.quality.rawValue]
      out.append(row)
    }
    return out
  }
}

/// One Read aloud while it runs. It OWNS the synthesizer (the system does not keep one alive), takes the buffers the
/// synthesizer hands over on whatever thread it uses, writes them to `part-<name>` in the file's own PCM format,
/// and ends exactly once: on the empty end buffer, on silence after sound, on no sound at all, or on a cancel.
/// On success the part file is moved into place; on anything else it is removed.
final class SpeechJob: @unchecked Sendable {
  private let lock = NSLock()
  private let synthesizer = AVSpeechSynthesizer()
  private let outputURL: URL
  private let partURL: URL
  private let done: (Result<Double, Error>) -> Void
  private var file: AVAudioFile?                   // guarded by `lock`, like everything below
  private var format: AVAudioFormat?
  private var frames: Int = 0
  private var started = Date()
  private var lastBuffer = Date()
  private var stopped = false
  private var finished = false

  init(outputURL: URL, done: @escaping (Result<Double, Error>) -> Void) {
    self.outputURL = outputURL
    self.partURL = outputURL.deletingLastPathComponent().appendingPathComponent("part-" + outputURL.lastPathComponent)
    self.done = done
  }

  /// Starts the speech. Answers through `done`, once.
  func start(text: String, voiceId: String, rate: Double) {
    guard let voice = AVSpeechSynthesisVoice(identifier: voiceId) else {
      end(.failure(SpeechError.failed("speech voice: this voice is not on the iPhone any more")))
      return
    }
    let utterance = AVSpeechUtterance(string: text)
    utterance.voice = voice
    utterance.rate = SpeechRender.rate(rate)
    try? FileManager.default.createDirectory(at: partURL.deletingLastPathComponent(), withIntermediateDirectories: true)
    try? FileManager.default.removeItem(at: partURL)
    lock.lock()
    started = Date()
    lastBuffer = Date()
    lock.unlock()
    DispatchQueue.main.async {
      // Weak: the synthesizer keeps this closure and the job keeps the synthesizer. The module holds the job until it has answered.
      self.synthesizer.write(utterance, toBufferCallback: { [weak self] (buffer: AVAudioBuffer) -> Void in
        self?.take(buffer)
      })
      self.watch()
    }
  }

  /// Stops the speech; the job then answers as cancelled (at once if a buffer comes, else at the next look).
  func cancel() {
    lock.lock()
    stopped = true
    lock.unlock()
    DispatchQueue.main.async {
      _ = self.synthesizer.stopSpeaking(at: .immediate)
    }
  }

  private var seconds: Double {                    // call with `lock` held
    guard let known = format, known.sampleRate > 0 else { return 0 }
    return Double(frames) / known.sampleRate
  }

  /// One buffer from the synthesizer. An empty one is the end.
  private func take(_ buffer: AVAudioBuffer) {
    var outcome: Result<Double, Error>? = nil
    autoreleasepool { () -> Void in
      lock.lock()
      defer { lock.unlock() }
      if finished { return }
      if stopped {
        outcome = .failure(SpeechError.cancelled)
        return
      }
      guard let pcm = buffer as? AVAudioPCMBuffer else { return }
      if pcm.frameLength == 0 {
        if frames > 0 {
          outcome = .success(seconds)
        } else {
          outcome = .failure(SpeechError.failed("speech render: no sound came out"))
        }
        return
      }
      lastBuffer = Date()
      do {
        if let current = file, let known = format {
          // Writing a buffer of another format than the file's own does not throw, it stops the app: checked first.
          guard SpeechRender.same(known, pcm.format) else {
            outcome = .failure(SpeechError.failed("speech output: this voice gives a sound the file cannot take"))
            return
          }
          try current.write(from: pcm)
        } else {
          let made = try AVAudioFile(forWriting: partURL, settings: pcm.format.settings, commonFormat: pcm.format.commonFormat, interleaved: pcm.format.isInterleaved)
          guard SpeechRender.same(made.processingFormat, pcm.format) else {
            outcome = .failure(SpeechError.failed("speech output: this voice gives a sound the file cannot take"))
            return
          }
          try made.write(from: pcm)
          file = made
          format = pcm.format
        }
        frames += Int(pcm.frameLength)
      } catch {
        outcome = .failure(SpeechError.failed("speech output: " + ExportSession.describe(error)))
      }
    }
    if let outcome { end(outcome) }
  }

  /// Looks at the job every `tick` until it has ended, so it ends even when the synthesizer goes quiet.
  private func watch() {
    DispatchQueue.main.asyncAfter(deadline: .now() + SpeechRender.tick) {
      var outcome: Result<Double, Error>? = nil
      self.lock.lock()
      let over = self.finished
      if !over {
        let now = Date()
        if self.stopped {
          outcome = .failure(SpeechError.cancelled)
        } else if self.frames > 0, now.timeIntervalSince(self.lastBuffer) > SpeechRender.idleSeconds {
          outcome = .success(self.seconds)
        } else if self.frames == 0, now.timeIntervalSince(self.started) > SpeechRender.startSeconds {
          outcome = .failure(SpeechError.failed("speech render: no sound came out"))
        }
      }
      self.lock.unlock()
      if over { return }
      if let outcome { self.end(outcome) } else { self.watch() }
    }
  }

  /// The one way out. Releasing the file finishes it, before it is moved.
  private func end(_ outcome: Result<Double, Error>) {
    lock.lock()
    if finished {
      lock.unlock()
      return
    }
    finished = true
    autoreleasepool { () -> Void in
      file = nil
    }
    lock.unlock()
    switch outcome {
    case .success(let length):
      do {
        try? FileManager.default.removeItem(at: outputURL)
        try FileManager.default.moveItem(at: partURL, to: outputURL)
        done(.success(length))
      } catch {
        try? FileManager.default.removeItem(at: partURL)
        done(.failure(SpeechError.failed("speech output: " + ExportSession.describe(error))))
      }
    case .failure(let error):
      try? FileManager.default.removeItem(at: partURL)
      done(.failure(error))
    }
  }
}
```

`modules/clipy-video/ios/ClipyVideoModule.swift`:

1. After the `lookupSoundJob` function add:

```swift

  private let speechLock = NSLock()
  private var speechJobs: [String: SpeechJob] = [:]   // guarded by `speechLock`; a job is held here until it has answered

  private func storeSpeechJob(_ id: String, _ job: SpeechJob) {
    speechLock.lock(); defer { speechLock.unlock() }
    speechJobs[id] = job
  }

  private func dropSpeechJob(_ id: String) {
    speechLock.lock(); defer { speechLock.unlock() }
    speechJobs[id] = nil
  }

  private func lookupSpeechJob(_ id: String) -> SpeechJob? {
    speechLock.lock(); defer { speechLock.unlock() }
    return speechJobs[id]
  }
```

2. At the end of `definition()`, after the `probeNoiseReduction` block, add:

```swift

    // The voices installed on this iPhone and the phone's own language code (see SpeechRender.voices).
    AsyncFunction("listVoices") { (promise: Promise) in
      let answer: [String: Any] = ["current": AVSpeechSynthesisVoice.currentLanguageCode(), "voices": SpeechRender.voices()]
      promise.resolve(answer)
    }

    // Read aloud: speaks `text` with the voice into `outputPath` (the voice's own PCM, a .caf). Resolves
    // `{ fileUri, seconds }`. Rejects "E_READ_ALOUD_CANCELLED" after `cancelSpeech(jobId)`, else "E_READ_ALOUD" with
    // a staged message. The job is stored before it starts, so a cancel that comes at once finds it; the job answers
    // exactly once (SpeechJob.end).
    AsyncFunction("speakToFile") { (request: SpeechRequest, promise: Promise) in
      guard let outputURL = ExportSession.fileURL(from: request.outputPath) else {
        promise.reject("E_READ_ALOUD", "speech output: not a file path")
        return
      }
      let jobId = request.jobId
      let job = SpeechJob(outputURL: outputURL, done: { [weak self] (outcome: Result<Double, Error>) -> Void in
        self?.dropSpeechJob(jobId)
        switch outcome {
        case .success(let seconds):
          let answer: [String: Any] = ["fileUri": outputURL.absoluteString, "seconds": seconds]
          promise.resolve(answer)
        case .failure(let error):
          if let own = error as? SpeechError, case .cancelled = own {
            promise.reject("E_READ_ALOUD_CANCELLED", "Speech cancelled")
          } else {
            promise.reject("E_READ_ALOUD", SpeechRender.message(error))
          }
        }
      })
      self.storeSpeechJob(jobId, job)
      job.start(text: request.text, voiceId: request.voiceId, rate: request.rate)
    }

    // Stops that Read aloud (it then rejects "E_READ_ALOUD_CANCELLED"). An unknown or finished job: nothing.
    Function("cancelSpeech") { (jobId: String) in
      self.lookupSpeechJob(jobId)?.cancel()
    }
```

**Read it back against these points before committing:** `SpeechJob` holds no `AVURLAsset` (rule 1 does not apply) but holds the synthesizer; in `take` the names `current`, `known`, `made`, `pcm`, `outcome` are each declared once per scope (`known` appears in `take` and in the `seconds` getter: different scopes); `defer { lock.unlock() }` is inside the `autoreleasepool` closure, so every `return` there unlocks and `end(outcome)` runs after the lock is free; `end` never calls `done` while holding the lock; `watch` reads `over` under the lock and returns after unlocking; the `write(_:toBufferCallback:)` call sits in a non-async closure (no async overload can be chosen) and names its label, so the three-argument overload cannot be meant; `voiceTraits` appears only inside `if #available(iOS 17.0, *)`; `quality.rawValue` is an `Int`; both `promise.resolve` calls get a typed `[String: Any]`; in the module, `if let own = error as? SpeechError, case .cancelled = own` (not a bare `if case` on an `Error`); `jobId`, `job`, `outputURL`, `answer` do not clash with names of the neighbouring closures (each `AsyncFunction` closure is its own scope).

- [ ] **Step 4: Run** `npx.cmd jest src/editor/model/__tests__/speechRender.swift.test.ts src/editor/model/__tests__/soundRender.swift.test.ts` → PASS. Then `npm run typecheck` and `npm test`. **No build.**
- [ ] **Step 5: Commit** — `feat(native): read aloud — AVSpeechSynthesizer into a file, one job that always answers once`.

---

### Task 8: The render manager: the gate and the deadline

**Depends on:** Tasks 4, 5. **Parallel-safe with:** 6, 12.

**Files:** Modify `src/editor/soundRenders.ts`, `src/editor/__tests__/soundRenders.test.ts` (two functions added to its `@/modules/clipy-video` mock; tests appended).

**Do not touch:** `soundFiles.ts`, `AudioPreview.tsx`, `src/export/*` (the export calls `ensureSound` and gets the same behaviour), the existing tests of `soundRenders.test.ts`.

**Interfaces: Consumes** `isNoiseBuild`, `isNoiseAvailable` (Task 4); `LATEST_TOOLS` (Task 4); `soundChain(...).noiseWet`, the noise file name (Task 5). **Produces**

```ts
export const SOUND_NOISE_DEADLINE_MS = 600000;
export const NOISE_NOT_ON_PHONE = "This iPhone cannot reduce noise.";
export function noiseRefusal(): string | null;        // null = Reduce noise can run; else the sentence to say
// ensureSound(...) rejects with that sentence for a setting with noise where it cannot run, before any native call,
// and gives a render with noise SOUND_NOISE_DEADLINE_MS instead of SOUND_RENDER_DEADLINE_MS.
```

- [ ] **Step 1: Failing tests.** In `soundRenders.test.ts`: add `isNoiseBuild: jest.fn(() => true), isNoiseAvailable: jest.fn(() => true),` to the mock factory of `@/modules/clipy-video`; add `isNoiseAvailable, isNoiseBuild` to the import from it and `noiseRefusal, NOISE_NOT_ON_PHONE, SOUND_NOISE_DEADLINE_MS` to the import from `../soundRenders`; append (the helpers `disk`, `render`, `SRC`, `DIR`, `deep` are the file's own; `pass` below is this block's own, so the block does not depend on another describe's timers):

```ts
describe("Reduce noise in the manager", () => {
  const noisy: SoundSettings = { ...NO_SOUND, noise: 0.5 };
  const COPY = `${DIR}/v-v1-plain-s0-p0-flat-l0-n50.m4a`;
  const pass = async (ms: number) => { await act(async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); jest.advanceTimersByTime(ms); for (let i = 0; i < 8; i++) await Promise.resolve(); }); };

  beforeEach(() => {
    disk.clear();
    resetSounds();
    render.mockReset();
    jest.mocked(cancelSoundRender).mockClear();
    jest.mocked(isSoundAvailable).mockReturnValue(true);
    jest.mocked(isNoiseBuild).mockReturnValue(true);
    jest.mocked(isNoiseAvailable).mockReturnValue(true);
    jest.mocked(newId).mockReturnValue("job-n");
  });
  afterEach(() => { jest.useRealTimers(); });

  test("noiseRefusal: the build first, then the phone", () => {
    expect(noiseRefusal()).toBeNull();
    jest.mocked(isNoiseAvailable).mockReturnValue(false);
    expect(noiseRefusal()).toBe(NOISE_NOT_ON_PHONE);
    jest.mocked(isNoiseBuild).mockReturnValue(false);
    expect(noiseRefusal()).toBe("Reduce noise and Read aloud need the latest Clipy build. Install it from the newest build link.");
  });

  test("a noise setting is rendered with the mix in the request and under its own name", async () => {
    render.mockResolvedValue({ fileUri: COPY, seconds: 5, gainDb: 0 });
    await expect(ensureSound("p1", SRC, noisy)).resolves.toBe(COPY);
    expect(render).toHaveBeenCalledWith({ ...soundChain(noisy), jobId: "job-n", sourceUri: SRC, outputPath: COPY });
    expect(render.mock.calls[0][0].noiseWet).toBe(87.5);
  });

  test("on a build or a phone without it the native side is never asked: an older build would render without the unit under this name", async () => {
    jest.mocked(isNoiseBuild).mockReturnValue(false);
    jest.mocked(isNoiseAvailable).mockReturnValue(false);
    await expect(ensureSound("p1", SRC, noisy)).rejects.toThrow(/latest Clipy build/);
    jest.mocked(isNoiseBuild).mockReturnValue(true);
    await expect(ensureSound("p1", SRC, noisy)).rejects.toThrow(NOISE_NOT_ON_PHONE);
    expect(render).not.toHaveBeenCalled();
    // A setting without noise does not ask the question at all.
    render.mockResolvedValue({ fileUri: "x", seconds: 5, gainDb: 0 });
    await expect(ensureSound("p1", SRC, deep)).resolves.toMatch(/-deep-/);
    expect(render).toHaveBeenCalledTimes(1);
  });

  test("a copy that is already on disk is used without asking anything", async () => {
    disk.add(COPY);
    jest.mocked(isNoiseAvailable).mockReturnValue(false);
    await expect(ensureSound("p1", SRC, noisy)).resolves.toBe(COPY);
    expect(render).not.toHaveBeenCalled();
  });

  test("a render with noise has ten minutes; one without keeps its two", async () => {
    expect(SOUND_NOISE_DEADLINE_MS).toBe(600000);
    jest.useFakeTimers();
    render.mockReturnValue(new Promise(() => {}));                       // the native side never answers
    const slow = ensureSound("p1", SRC, noisy);
    const outcome = jest.fn();
    slow.then(outcome, outcome);
    await pass(SOUND_RENDER_DEADLINE_MS + 1000);
    expect(outcome).not.toHaveBeenCalled();                              // still waiting after the plain deadline
    expect(cancelSoundRender).not.toHaveBeenCalled();
    await pass(SOUND_NOISE_DEADLINE_MS);
    expect(outcome).toHaveBeenCalledTimes(1);
    expect((outcome.mock.calls[0][0] as Error).message).toBe("sound render: no answer after 600 s");
    expect(cancelSoundRender).toHaveBeenCalledWith("job-n");
  });
});
```

- [ ] **Step 2: Run** `npx.cmd jest src/editor/__tests__/soundRenders.test.ts` → the new tests FAIL.
- [ ] **Step 3: Implement** in `src/editor/soundRenders.ts`:

1. Imports: `import { LATEST_TOOLS, NEEDS_LATEST_BUILD } from "@/src/lib/buildInfo";` (replacing the `NEEDS_LATEST_BUILD` import) and add `isNoiseAvailable, isNoiseBuild` to the import from `@/modules/clipy-video`.
2. After `SOUND_RENDER_DEADLINE_MS` add:

```ts
/**
 * The longest one copy WITH Reduce noise may take. Apple's isolation unit is the slow part of such a render and how slow is not
 * known before the phone has been asked, so it gets ten minutes instead of two.
 */
export const SOUND_NOISE_DEADLINE_MS = 600000;
/** Said where Reduce noise is tapped on an iPhone that does not have Apple's unit (the build is new enough). */
export const NOISE_NOT_ON_PHONE = "This iPhone cannot reduce noise.";
/** Why Reduce noise cannot run here, or null when it can: the build is too old (it would ignore the noise number), or the phone lacks the unit. */
export function noiseRefusal(): string | null {
  if (!isNoiseBuild()) return LATEST_TOOLS;
  return isNoiseAvailable() ? null : NOISE_NOT_ON_PHONE;
}
const hasNoise = (sound: SoundSettings): boolean => typeof sound.noise === "number";
```

3. `answered` takes the deadline: its signature becomes `function answered(entry: Running, start: () => Promise<unknown>, deadlineMs: number): Promise<void> {`, and inside it the two uses of `SOUND_RENDER_DEADLINE_MS` become `deadlineMs` (the message: `` `sound render: no answer after ${deadlineMs / 1000} s` ``). In its doc comment, `at `SOUND_RENDER_DEADLINE_MS`` becomes `at `deadlineMs` (`SOUND_RENDER_DEADLINE_MS`, or `SOUND_NOISE_DEADLINE_MS` for a copy with Reduce noise)`.
4. In `ensureSound`'s `work`, after the line `if (!isSoundAvailable()) throw new Error(SOUND_UNAVAILABLE);` add:

```ts
    // Reduce noise where it cannot run: refused HERE. A build from before it would drop the request's noise number, render
    // without the unit and leave a copy with this name on disk.
    if (hasNoise(sound)) { const why = noiseRefusal(); if (why) throw new Error(why); }
```

and the `await answered(…)` line becomes

```ts
    await answered(entry, () => renderSound({ ...soundChain(sound), jobId: entry.jobId, sourceUri, outputPath: path }), hasNoise(sound) ? SOUND_NOISE_DEADLINE_MS : SOUND_RENDER_DEADLINE_MS);
```

- [ ] **Step 4: Run** the suite (every existing test unedited and green: a setting without noise takes the old path and the old deadline), then `npx.cmd jest src/editor src/export`. Then `npm run typecheck` and `npm test`.
- [ ] **Step 5: Commit** — `feat(editor): the render manager refuses a noise setting where it cannot run and gives it ten minutes`.

---

### Task 9: The Sound panel: Reduce noise and Strength

**Depends on:** Tasks 1, 8. **Parallel-safe with:** 7.

**Files:** Modify `src/editor/components/SoundQualitySheet.tsx`, `src/editor/toolStrip.ts` (the two type unions only), `src/editor/__tests__/SoundQualitySheet.test.tsx` (the mock of `@/modules/clipy-video` gains two functions, a slider mock is added, tests appended).

**Do not touch:** `EditorToolbar.tsx` (it mounts `SoundQualitySheet` by the same id and props), `toolbarContext.ts`, `noiseProbe.ts` (its call stays), `VoiceSheet.tsx`, `src/ui/*`.

**Interfaces: Consumes** `setTrackSound`, `NOISE_LIMITS` (Task 1); `noiseRefusal`, `holdSounds`, `SOUND_UNAVAILABLE` (Task 8 / existing); `isPreparing`, `useSoundFiles` (exist). **Produces** `SoundQualitySheet` with the same props, now a compact panel; `PanelId` includes `"soundQuality"`, `StripId` does not.

- [ ] **Step 1: Failing tests.** In `SoundQualitySheet.test.tsx`:

- the mock of `@/modules/clipy-video` becomes `({ isSoundAvailable: jest.fn(() => true), isNoiseBuild: jest.fn(() => true), isNoiseAvailable: jest.fn(() => true), probeNoiseReduction: jest.fn(async () => ({ ok: true, stage: "render", detail: "frames 220500 outputRms 0.05 latency 0" })) })`;
- add, beside the other `jest.mock` lines, the slider mock of `VoiceSheet.test.tsx` (copy that one line verbatim);
- add `isNoiseAvailable, isNoiseBuild` to the import from `@/modules/clipy-video`, `NOISE_NOT_ON_PHONE` to the import from `@/src/editor/soundRenders`, and `import { PANEL } from "@/src/ui/ToolPanel";`;
- in `beforeEach` add `jest.mocked(isNoiseBuild).mockReturnValue(true); jest.mocked(isNoiseAvailable).mockReturnValue(true);` and make the store reset `useSoundFiles.setState({ files: {}, hold: false, holdTrack: null });`;
- append:

```ts
describe("Reduce noise", () => {
  const noise = () => screen.getByLabelText("Reduce noise");
  const strength = () => screen.getByTestId("noise-strength");
  const drag = async (to: number) => {
    await fireEvent(strength(), "touchStart");
    await fireEvent(strength(), "touchMove", { v: to });
  };

  test("the tool is a compact panel now: every row has its height and they fit the body", async () => {
    await open();
    expect(screen.getByTestId("tool-panel")).toBeTruthy();
    expect(screen.queryByTestId("tool-strip")).toBeNull();
    expect(screen.getByTestId("strip-tiles")).toHaveStyle({ height: STRIP.tiles });
    expect(screen.getByTestId("sound-level-row")).toHaveStyle({ height: STRIP.slider });
    expect(screen.getByTestId("sound-noise-row")).toHaveStyle({ height: STRIP.slider + theme.space.md });
    expect(screen.getByTestId("strip-slider")).toHaveStyle({ height: STRIP.slider });
    expect(STRIP.tiles + STRIP.slider + STRIP.slider + theme.space.md + STRIP.slider).toBeLessThanOrEqual(PANEL.compact - 1 - PANEL.header);
    expect(screen.getByText("Best on speech. Music can sound odd.")).toBeTruthy();
  });

  test("off at first: the switch is off and Strength is greyed out at 50 %", async () => {
    await open();
    expect(noise().props.value).toBe(false);
    expect(strength().props).toMatchObject({ disabled: true, minimumValue: 0, maximumValue: 1, step: 0.05, value: 0.5 });
    expect(screen.getByText("Strength 50 %")).toBeTruthy();
  });

  test("the switch is one undo step each way; on starts in the middle; off leaves the bar as recorded", async () => {
    await open();
    await fireEvent(noise(), "valueChange", true);
    expect(track().sound).toEqual({ voice: null, strength: 0.5, pitch: 0, eq: null, level: false, noise: 0.5 });
    expect(past()).toBe(1);
    expect(noise().props.value).toBe(true);
    expect(strength().props.disabled).toBe(false);
    await fireEvent(noise(), "valueChange", false);
    expect("sound" in track()).toBe(false);
    expect(past()).toBe(2);
  });

  test("it keeps a preset and Even out loudness, and they keep it", async () => {
    await open();
    await press("Warm");
    await fireEvent(noise(), "valueChange", true);
    await fireEvent(level(), "valueChange", true);
    expect(track().sound).toEqual({ voice: null, strength: 0.5, pitch: 0, eq: "warm", level: true, noise: 0.5 });
    await fireEvent(noise(), "valueChange", false);
    expect(track().sound).toEqual({ voice: null, strength: 0.5, pitch: 0, eq: "warm", level: true });
  });

  test("a Strength drag is one undo step and holds the renders for this track until it is let go", async () => {
    await open();
    await fireEvent(noise(), "valueChange", true);
    const before = past();
    await drag(0.8);
    expect(useSoundFiles.getState()).toMatchObject({ hold: true, holdTrack: "v" });
    await fireEvent(strength(), "touchMove", { v: 0.9 });
    expect(track().sound?.noise).toBe(0.9);
    expect(past()).toBe(before + 1);
    await fireEvent(strength(), "touchEnd");
    expect(useSoundFiles.getState()).toMatchObject({ hold: false, holdTrack: null });
    expect(screen.getByText("Strength 90 %")).toBeTruthy();
  });

  test("with the switch off a drag does nothing", async () => {
    await open();
    await drag(0.8);
    expect("sound" in track()).toBe(false);
    expect(past()).toBe(0);
    expect(useSoundFiles.getState().hold).toBe(false);
  });

  test("the hold is let go when the panel is hidden mid-drag", async () => {
    const view = await open();
    await fireEvent(noise(), "valueChange", true);
    await drag(0.8);
    await view.rerender(<SoundQualitySheet trackId="v" visible={false} onClose={() => {}} />);
    expect(useSoundFiles.getState()).toMatchObject({ hold: false, holdTrack: null });
  });

  test("on a build without it the switch does not move and the sentence is said; the presets still work", async () => {
    jest.mocked(isNoiseBuild).mockReturnValue(false);
    jest.mocked(isNoiseAvailable).mockReturnValue(false);
    await open();
    await fireEvent(noise(), "valueChange", true);
    expect("sound" in track()).toBe(false);
    expect(past()).toBe(0);
    expect(useToast.getState().message).toBe("Reduce noise and Read aloud need the latest Clipy build. Install it from the newest build link.");
    await press("Warm");
    expect(track().sound?.eq).toBe("warm");
  });

  test("on an iPhone without the unit it says so", async () => {
    jest.mocked(isNoiseAvailable).mockReturnValue(false);
    await open();
    await fireEvent(noise(), "valueChange", true);
    expect(past()).toBe(0);
    expect(useToast.getState().message).toBe(NOISE_NOT_ON_PHONE);
  });

  test("a noise setting that is already stored can always be switched off, whatever the build", async () => {
    st().apply((p) => setTrackSound(p, "v", { noise: 0.75 }));
    jest.mocked(isNoiseBuild).mockReturnValue(false);
    jest.mocked(isNoiseAvailable).mockReturnValue(false);
    await open();
    expect(noise().props.value).toBe(true);
    await fireEvent(noise(), "valueChange", false);
    expect("sound" in track()).toBe(false);
  });
});
```

(add `setTrackSound` from `@/src/editor/model/ops` to the imports). The existing tests of the file stay as they are: the tiles, the level row and its height, the spinner label, the probe and the "nothing is drawn" tests name things that are still there. If one of them looks a container up by `tool-strip`, that test id is a pinned name: it becomes `tool-panel`.

- [ ] **Step 2: Run** `npx.cmd jest src/editor/__tests__/SoundQualitySheet.test.tsx` → the new tests FAIL.
- [ ] **Step 3: Implement.**

`src/editor/toolStrip.ts`: remove `| "soundQuality"` from `StripId` and add it to `PanelId` (`… | "cover" | "voice" | "soundQuality"`). Nothing else.

Replace `src/editor/components/SoundQualitySheet.tsx` with:

```tsx
import { useEffect, useRef } from "react";
import { Switch, View } from "react-native";
import { isSoundAvailable } from "@/modules/clipy-video";
import { setTrackSound } from "@/src/editor/model/ops";
import { EQ_IDS, NO_SOUND, NOISE_LIMITS, type EqId, type Project } from "@/src/editor/model/types";
import { runNoiseProbe } from "@/src/editor/noiseProbe";
import { isPreparing, useSoundFiles } from "@/src/editor/soundFiles";
import { holdSounds, noiseRefusal, SOUND_UNAVAILABLE } from "@/src/editor/soundRenders";
import { EQS } from "@/src/editor/soundTools";
import { useEditorStore } from "@/src/editor/store";
import { theme } from "@/src/theme/theme";
import { haptic } from "@/src/ui/haptics";
import { Slider } from "@/src/ui/Slider";
import { Spinner } from "@/src/ui/Spinner";
import { Body } from "@/src/ui/Text";
import { Tile } from "@/src/ui/Tile";
import { useToast } from "@/src/ui/Toast";
import { PANEL, ToolPanel } from "@/src/ui/ToolPanel";
import { STRIP, StripNote, StripSlider, StripTiles } from "@/src/ui/ToolStrip";

/** What the line under Reduce noise says: where it works and where it does not. */
export const NOISE_HINT = "Best on speech. Music can sound odd.";
/** The Reduce noise row: the switch row's height and one more step of the scale, for its second line. */
const NOISE_ROW = STRIP.slider + theme.space.md;
const SWITCH_ROW = { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: theme.space.gutter } as const;

/**
 * The Sound panel of a sound bar ("Sound quality"): None or one of four equaliser presets, Even out loudness, and Reduce noise with
 * its Strength. All are stored on the track (`setTrackSound`); the changed copy is rendered by soundRenders.ts — never during a
 * Strength drag: the slider holds the renders in this track's name from slide start to slide complete (and the hold is let go when
 * the panel is hidden, or its track goes, mid-drag). A tile is one undo step, a switch one, a drag one.
 * Without the engine (Expo Go, an older build) a tap changes nothing and the reason is said once; Reduce noise has its own reason
 * (`noiseRefusal`) and says it on every tap. Rows have explicit heights (72 + 36 + 48 + 36 of the 195 the body has); the body does not scroll.
 */
export function SoundQualitySheet({ trackId, visible, onClose }: { trackId: string | null; visible: boolean; onClose: () => void }) {
  const track = useEditorStore((s) => s.project?.audioTracks.find((t) => t.id === trackId) ?? null);
  const { apply, beginTransaction, applyTransient } = useEditorStore.getState();
  const busy = useSoundFiles((s) => isPreparing(s.files, track));
  const told = useRef(false);
  const sourceUri = track?.sourceUri ?? null;
  const here = !!track;
  // The noise-reduction test (noiseProbe.ts): a development session only, once per install, to the dev log; never on screen.
  useEffect(() => { if (visible && sourceUri) runNoiseProbe(sourceUri); }, [visible, sourceUri]);
  // Whether the Strength slider holds the renders right now (a ref: nothing is drawn from it).
  const held = useRef(false);
  const release = () => { if (!held.current) return; held.current = false; holdSounds(null); };
  // The slider can go while it is held (the panel is hidden, the selection changed, the track was removed, the editor is left):
  // slide complete never comes then, and the renders must not stay held.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => release, [visible, trackId, here]);
  if (!track) return null;
  const sound = track.sound ?? NO_SOUND;
  const noiseOn = typeof sound.noise === "number";
  const noise = sound.noise ?? NOISE_LIMITS.defaultStrength;

  /** One tap = one undo step; nothing at all without the engine. */
  const write = (op: (p: Project) => Project, buzz: boolean) => {
    if (!isSoundAvailable()) {
      if (!told.current) useToast.getState().show(SOUND_UNAVAILABLE);
      told.current = true;
      return;
    }
    if (buzz) haptic("light");
    apply(op);
  };
  const pick = (eq: EqId | null) => {
    if (sound.eq === eq) return;   // already ringed: no buzz, no undo step
    write((p) => setTrackSound(p, track.id, { eq }), true);
  };
  /** Off always works (the key is taken away). On needs the build and the phone to have the unit. */
  const setNoise = (on: boolean) => {
    if (!on) { apply((p) => setTrackSound(p, track.id, { noise: undefined })); return; }
    if (!isSoundAvailable()) { useToast.getState().show(SOUND_UNAVAILABLE); return; }
    const why = noiseRefusal();
    if (why) { useToast.getState().show(why); return; }
    apply((p) => setTrackSound(p, track.id, { noise: NOISE_LIMITS.defaultStrength }));
  };
  // The hold comes first: the manager must not see a drag's first value as a setting to render.
  const start = () => { if (!noiseOn) return; holdSounds(track.id); held.current = true; beginTransaction(); };
  const change = (v: number) => { if (held.current) applyTransient((p) => setTrackSound(p, track.id, { noise: v })); };

  return (
    <ToolPanel visible={visible} onClose={onClose} title="Sound quality" size="compact" scroll={false}>
      {/* A fixed slot over the header's free middle: the spinner shows in it while the copy is rendered, and nothing moves. */}
      <View testID="sound-busy-slot" pointerEvents="none" style={{ position: "absolute", top: -PANEL.header, left: 0, right: 0, height: PANEL.header, alignItems: "center", justifyContent: "center" }}>
        {busy ? <Spinner label="Preparing the sound" /> : null}
      </View>
      {/* The kit's rows bring their own gutter: the panel's is taken back so they line up with every strip. */}
      <View style={{ marginHorizontal: -theme.space.gutter }}>
        <StripTiles>
          <Tile label="None" icon="ban-outline" selected={sound.eq === null} onPress={() => pick(null)} />
          {EQ_IDS.map((id) => <Tile key={id} label={EQS[id].label} icon={EQS[id].icon} selected={sound.eq === id} onPress={() => pick(id)} />)}
        </StripTiles>
        <View testID="sound-level-row" style={{ ...SWITCH_ROW, height: STRIP.slider }}>
          <Body style={{ fontSize: theme.type.small }}>Even out loudness</Body>
          <Switch accessibilityLabel="Even out loudness" value={sound.level} onValueChange={(on) => write((p) => setTrackSound(p, track.id, { level: on }), false)} trackColor={{ true: theme.colors.accent }} />
        </View>
        <View testID="sound-noise-row" style={{ ...SWITCH_ROW, height: NOISE_ROW }}>
          <View style={{ flex: 1, height: NOISE_ROW, justifyContent: "center" }}>
            <Body style={{ fontSize: theme.type.small }}>Reduce noise</Body>
            <StripNote>{NOISE_HINT}</StripNote>
          </View>
          <Switch accessibilityLabel="Reduce noise" value={noiseOn} onValueChange={setNoise} trackColor={{ true: theme.colors.accent }} />
        </View>
        <StripSlider label="Strength" value={`${Math.round(noise * 100)} %`}>
          <Slider
            testID="noise-strength"
            minimumValue={NOISE_LIMITS.strength[0]} maximumValue={NOISE_LIMITS.strength[1]} step={0.05}
            value={noise}
            disabled={!noiseOn}
            detents={[NOISE_LIMITS.defaultStrength]}
            onSlidingStart={start}
            onValueChange={change}
            onSlidingComplete={release}
          />
        </StripSlider>
      </View>
    </ToolPanel>
  );
}
```

Notes for the implementer: `flex: 1` in the noise row shares the row's **width** (the row has an explicit height), as the kit's own rows do. The spinner moved from the strip's header note to the fixed slot the Voice panel uses. If the existing test "the spinner shows while this track's copy is being rendered" finds the spinner by its label, it stays green; if it asserts the strip header's `note`, its lookup is a pinned name (now `sound-busy-slot`). Then Grep `src/editor/__tests__` for `soundQuality` beside `tool-strip` / `STRIP.height` (the toolbar's layout tests): a test that lists the **strips** by id and includes `soundQuality` moves that id to its panel list (pinned id list); report any such edit.

- [ ] **Step 4: Run** `npx.cmd jest src/editor/__tests__/SoundQualitySheet.test.tsx src/editor/__tests__/EditorToolbar.sound.test.tsx src/editor/__tests__/VoiceSheet.test.tsx src/__tests__` → PASS. Then `npm run typecheck` and `npm test`.
- [ ] **Step 5: Commit** — `feat(editor): Reduce noise and its Strength in the Sound tool, now a compact panel`.

---

### Task 10: The Speed strip: the Smooth switch and the curve pictures

**Depends on:** Task 2. **Parallel-safe with:** 5, 11.

**Files:** Modify `src/editor/components/SpeedSheet.tsx`, `src/editor/__tests__/SpeedSheet.test.tsx` (pinned expectations named below + append).

**Do not touch:** `timeline.ts`, `ops.ts`, `src/ui/*`, `SpeedSheet.drag.test.tsx`, `toolStrip.ts`.

**Interfaces: Consumes** `setClipSpeedCurve(p, id, preset, smooth)`, `isSmoothCurve`, `curveProfile` (Task 2). **Produces** the same `SpeedSheet` props; a `Smooth` switch (`accessibilityLabel="Smooth"`, row `testID="speed-smooth-row"`).

- [ ] **Step 1: Failing tests.** In `SpeedSheet.test.tsx` add `curveProfile, isSmoothCurve, smoothCurveSteps` to the import from `@/src/editor/model/timeline`, and append:

```ts
describe("Smooth", () => {
  const smooth = () => screen.getByLabelText("Smooth");
  const setSmooth = (on: boolean) => fireEvent(smooth(), "valueChange", on);

  test("the Curve tab has a Smooth row of the slider row's height; the Normal tab has none", async () => {
    await render(<SpeedSheet clipId="a" visible onClose={() => {}} />);
    expect(screen.queryByLabelText("Smooth")).toBeNull();
    await press("Curve");
    expect(flat("speed-smooth-row").height).toBe(36);
    expect(flat("speed-smooth-row").paddingHorizontal).toBe(theme.space.gutter);
    expect(screen.queryByTestId("speed-slider")).toBeNull();
  });

  test("on for a clip without a curve: a tile writes the smooth form, in one undo step", async () => {
    await render(<SpeedSheet clipId="a" visible onClose={() => {}} />);
    await press("Curve");
    expect(smooth().props.value).toBe(true);
    await press("Hero");
    expect(clip().speedCurve).toEqual({ id: "hero", steps: smoothCurveSteps("hero", 0, 8) });
    expect(isSmoothCurve(clip())).toBe(true);
    expect(past()).toBe(1);
  });

  test("a clip from an old project: its stepped curve is shown as it is — the switch is off, and opening the strip changes nothing", async () => {
    useEditorStore.getState().setProject(makeProject({ clips: [{ ...makeClip({ id: "a", sourceDuration: 8 }), speedCurve: { id: "bullet", steps: curveSteps("bullet", 0, 8) } }] }));
    const stored = clip();
    await render(<SpeedSheet clipId="a" visible onClose={() => {}} />);
    expect(tile("Bullet")).toBeSelected();
    expect(smooth().props.value).toBe(false);
    expect(clip()).toBe(stored);
    expect(past()).toBe(0);
    // Its tile again, in the form it has: still nothing.
    await press("Bullet");
    expect(clip()).toBe(stored);
  });

  test("the switch rewrites the clip's curve in the other form: one undo step each way, the same preset", async () => {
    useEditorStore.getState().apply((p) => setClipSpeedCurve(p, "a", "hero"));
    await render(<SpeedSheet clipId="a" visible onClose={() => {}} />);
    const before = past();
    await setSmooth(true);
    expect(clip().speedCurve).toEqual({ id: "hero", steps: smoothCurveSteps("hero", 0, 8) });
    expect(past()).toBe(before + 1);
    expect(tile("Hero")).toBeSelected();
    await setSmooth(false);
    expect(clip().speedCurve).toEqual({ id: "hero", steps: curveSteps("hero", 0, 8) });
    expect(past()).toBe(before + 2);
    await act(() => { useEditorStore.getState().undo(); });
    expect(isSmoothCurve(clip())).toBe(true);
  });

  test("with no curve the switch only chooses the form of the next pick: no undo step", async () => {
    await render(<SpeedSheet clipId="a" visible onClose={() => {}} />);
    await press("Curve");
    await setSmooth(false);
    expect(past()).toBe(0);
    expect(clip().speedCurve).toBeNull();
    await press("Montage");
    expect(clip().speedCurve).toEqual({ id: "montage", steps: curveSteps("montage", 0, 8) });
  });

  test("the pictures follow the switch: 32 thin bars from the stored numbers when on, the eight bars of before when off", async () => {
    await render(<SpeedSheet clipId="a" visible onClose={() => {}} />);
    await press("Curve");
    const h = flat("curve-spark-hero").height as number;
    for (const id of SPEED_CURVE_IDS) {
      curveProfile(id, true).forEach((speed, i) => expect(flat(`curve-bar-${id}-${i}`).height).toBeCloseTo((speed / 4) * h, 10));
      expect(screen.queryByTestId(`curve-bar-${id}-32`)).toBeNull();
    }
    expect(flat("curve-bar-hero-0").width).toBe(1);
    await setSmooth(false);
    for (const id of SPEED_CURVE_IDS) {
      SPEED_CURVES[id].shape.forEach((speed, i) => expect(flat(`curve-bar-${id}-${i}`).height).toBeCloseTo((speed / 4) * h, 10));
      expect(screen.queryByTestId(`curve-bar-${id}-8`)).toBeNull();
    }
    expect(flat("curve-bar-hero-0").width).toBe(3);
    expect(screen.getByTestId("curve-flat-none")).toBeTruthy();
  });

  test("a clip too short for the smooth form is refused like any curve that does not fit; the stepped form still goes on", async () => {
    useEditorStore.getState().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 8 }), makeClip({ id: "t", sourceDuration: 0.25 })] }));
    const onClose = jest.fn();
    await render(<SpeedSheet clipId="t" visible onClose={onClose} />);
    await press("Curve");
    await press("Flash out");
    expect(clip(1).speedCurve).toBeNull();
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(useToast.getState().message).toBe("This clip is too short for a speed curve.");
  });

  test("the limit is said while Smooth is on, in the header", async () => {
    await render(<SpeedSheet clipId="a" visible onClose={() => {}} />);
    await press("Curve");
    expect(screen.getByText("Slow parts can look choppy.")).toBeTruthy();
    await setSmooth(false);
    expect(screen.queryByText("Slow parts can look choppy.")).toBeNull();
  });

  test("several clips: a tile writes the form the switch shows to every clip that can take it", async () => {
    useEditorStore.getState().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 8 }), makeClip({ id: "b", sourceDuration: 6 }), makeClip({ id: "t", sourceDuration: 0.25 })] }));
    await render(<SpeedSheet clipId="a" clipIds={["a", "b", "t"]} visible onClose={() => {}} />);
    await press("Curve");
    await press("Hero");
    expect(isSmoothCurve(clip(0))).toBe(true);
    expect(isSmoothCurve(clip(1))).toBe(true);
    expect(clip(2).speedCurve).toBeNull();                      // too short for 32 steps: skipped silently
    expect(past()).toBe(1);
  });
});
```

**Pinned expectations that change** (existing tests of this file; edit only what is named):
- "a pick sets the curve in one undo step with a light haptic and the ring; None clears it": the line that expects the eight speeds `[1, 2, 3, 0.5, 0.5, 3, 2, 1]` now expects `curveProfile("hero", true)` (a new pick is smooth).
- "each preset draws eight bars, speed / 4 of the sparkline's height; None draws a flat line": add one line after `await press("Curve");`: `await fireEvent(screen.getByLabelText("Smooth"), "valueChange", false);` (it tests the stepped pictures).
- Any other existing test that presses a preset tile on a clip **without** a curve and then compares the stored steps, or a clip length computed from them, with the stepped form (look under "length label" and "clipIds (multi-select)"): the expected value becomes the smooth form (`smoothCurveSteps(…)`, or the length the test computes from `clipDuration` of the store's clip). A test whose clip already has a stepped curve before the strip opens needs no change: the switch starts off for it. Report every test edited, by title.

- [ ] **Step 2: Run** `npx.cmd jest src/editor/__tests__/SpeedSheet.test.tsx` → the new tests FAIL.
- [ ] **Step 3: Implement** in `src/editor/components/SpeedSheet.tsx`:

1. Imports: `import { Switch, View } from "react-native";`; `import { clipDuration, curveProfile, isSmoothCurve } from "@/src/editor/model/timeline";`; add `Body` (`import { Body } from "@/src/ui/Text";`) and `STRIP` to the `ToolStrip` import. The `SPEED_CURVES` import stays (labels).
2. Replace the sparkline constants and the two components with:

```tsx
/** The sparkline inside a curve tile's box (points). */
const SPARK_HEIGHT = 24;
const BAR_WIDTH = 3;
const BAR_GAP = 1;
/** A smooth ramp's picture: 32 bars side by side, so the shape reads as one outline. */
const THIN_BAR = 1;
/** The width eight bars take, so the flat line of "None" is as wide as a preset's sparkline. */
const SPARK_WIDTH = 8 * BAR_WIDTH + 7 * BAR_GAP;
const FLAT_LINE = 2;
/** 1×: the slider ticks lightly when a drag reaches or passes it. */
const REST = [1] as const;
const SMOOTH_HINT = "Slow parts can look choppy.";

/**
 * A preset's speeds as bars (height = speed / the top speed, of the sparkline's height): eight bars with gaps for the stepped form,
 * one thin bar per piece for the smooth one — the numbers a pick would store (`curveProfile`). "None" (no speeds) is a flat line.
 */
function Sparkline({ id, speeds, color }: { id: string; speeds: readonly number[] | null; color: string }) {
  if (!speeds) {
    return (
      <View testID={`curve-spark-${id}`} style={{ height: SPARK_HEIGHT, justifyContent: "center" }}>
        <View testID={`curve-flat-${id}`} style={{ width: SPARK_WIDTH, height: FLAT_LINE, borderRadius: FLAT_LINE / 2, backgroundColor: color }} />
      </View>
    );
  }
  const thin = speeds.length > 8;
  return (
    <View testID={`curve-spark-${id}`} style={{ height: SPARK_HEIGHT, flexDirection: "row", alignItems: "flex-end", gap: thin ? 0 : BAR_GAP }}>
      {speeds.map((speed, i) => (
        <View key={i} testID={`curve-bar-${id}-${i}`} style={{ width: thin ? THIN_BAR : BAR_WIDTH, height: (speed / SPEED_LIMITS[1]) * SPARK_HEIGHT, borderRadius: thin ? 0 : BAR_WIDTH / 2, backgroundColor: color }} />
      ))}
    </View>
  );
}
function CurveTile({ id, label, speeds, selected, onPress }: { id: string; label: string; speeds: readonly number[] | null; selected: boolean; onPress: () => void }) {
  return (
    <Tile label={label} selected={selected} onPress={onPress} boxTestID={`curve-tile-${id}`}>
      <Sparkline id={id} speeds={speeds} color={selected ? theme.colors.accent : theme.colors.textMuted} />
    </Tile>
  );
}
```

(`gap: BAR_GAP` is the form the file has today, and a `gap` of 0 is not a raw spacing number for `spacingScale.test.ts`.)

3. In `SpeedBody`, after the `tab` state add:

```tsx
  // The form a tile writes. A clip that has a curve shows the form its curve has (a clip from an old project: stepped); a clip
  // without one starts smooth. Seeded once per opening (this body is mounted per opening and per clip), then only by the switch.
  const [smooth, setSmooth] = useState(curveId ? isSmoothCurve(clip) : true);
```

4. Replace `pickCurve` with:

```tsx
  const pickCurve = (id: SpeedCurveId | null, form: boolean = smooth) => {
    const project = useEditorStore.getState().project;
    if (!project) return;
    // Picking the active preset again is not skipped: the op re-spreads it over the clip's current trim.
    const next = write(project, (p, cid) => setClipSpeedCurve(p, cid, id, form));
    if (next === project) {
      // The same project for the tile that is already selected, in the form it already has: nothing to change — silently.
      if (id === curveId && (id === null || form === isSmoothCurve(clip))) return;
      // Otherwise the op refused: the preset would leave the clip shorter than a clip may be, or the clip cannot hold the form's
      // steps (a layer: or it would break the layer rules).
      // (For a multi-selection: no selected clip could take it. Clips that can are changed; the others are skipped silently.)
      // The strip closes first, so the bar and the message show.
      onClose(); useToast.getState().show(clipIds ? "These clips are too short for a speed curve." : layer ? LAYER_REFUSED : "This clip is too short for a speed curve."); return;
    }
    haptic("light");
    apply(() => next);
  };
  /** The switch: the form of the next pick — and, for a clip that has a curve, that curve rewritten in the other form (one undo step). */
  const toggleSmooth = (on: boolean) => {
    setSmooth(on);
    if (curveId) pickCurve(curveId, on);
  };
```

5. The header note gains the hint, and the Curve tab its row and its pictures. The `note` prop becomes:

```tsx
      note={<>
        {warn ? null : <StripNote>Clip length {clipDuration(clip).toFixed(1)} s</StripNote>}
        {tab === "normal" ? <StripNote lines={warn ? 2 : 1}>{curveId ? "A curve is active — moving this slider removes it." : "Audio keeps its pitch in the exported video."}</StripNote> : null}
        {tab === "curve" && smooth ? <StripNote>{SMOOTH_HINT}</StripNote> : null}
      </>}>
```

the six preset tiles become

```tsx
            {SPEED_CURVE_IDS.map((id) => <CurveTile key={id} id={id} label={SPEED_CURVES[id].label} speeds={curveProfile(id, smooth)} selected={curveId === id} onPress={() => pickCurve(id)} />)}
```

(the None tile: `speeds={null}`), and the last child of the strip, `{tab === "normal" ? (<StripSlider …>…</StripSlider>) : null}`, gets the Curve tab's row in place of `null`:

```tsx
      ) : (
        <View testID="speed-smooth-row" style={{ height: STRIP.slider, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: theme.space.gutter }}>
          <Body style={{ fontSize: theme.type.small }}>Smooth</Body>
          <Switch accessibilityLabel="Smooth" value={smooth} onValueChange={toggleSmooth} trackColor={{ true: theme.colors.accent }} />
        </View>
      )}
```

6. The doc comment of `SpeedSheet` gains: `The Curve tab's Smooth switch chooses the form a preset is written in — a gradual ramp (32 steps) or the eight steps of before; a stored curve is never rewritten by opening the strip.`

- [ ] **Step 4: Run** `npx.cmd jest src/editor/__tests__/SpeedSheet.test.tsx src/editor/__tests__/SpeedSheet.drag.test.tsx src/editor/__tests__/strips.layout.test.tsx src/__tests__` → PASS. Then `npm run typecheck` and `npm test`.
- [ ] **Step 5: Commit** — `feat(editor): smooth speed ramps — a Smooth switch in the Curve tab, pictures drawn from what is stored`.

---

### Task 11: Read aloud: preferences and the flow

**Depends on:** Tasks 3, 4. **Parallel-safe with:** 5, 10.

**Files:** Create `src/editor/speechPrefs.ts`, `src/editor/useReadAloud.ts`, `src/editor/__tests__/speechPrefs.test.ts`, `src/editor/__tests__/useReadAloud.test.ts`.

**Do not touch:** `speech.ts`, `index.ts`, `TextPanel.tsx` (Task 12), `storage.ts`.

**Interfaces: Consumes** `speakableText`, `speechRate`, `speechFileName`, `speechRefusal`, `placeSpeech`, `SPEECH_LIMITS` (Task 3); `isSpeechAvailable`, `speakToFile`, `cancelSpeech`, `isSpeechCancelled` (Task 4); `LATEST_TOOLS` (Task 4); `storage.projectDir`, `expoFs` (exist). **Produces**

```ts
// src/editor/speechPrefs.ts
export const SPEECH_PREFS_KEY = "clipy.readAloud.v1";
export interface SpeechPrefs { voiceId: string | null; pace: number }
export function loadSpeechPrefs(): SpeechPrefs;
export function saveSpeechPrefs(prefs: SpeechPrefs): void;
// src/editor/useReadAloud.ts
export const READ_ALOUD: { unavailable: string; notText: string; noText: string; tooLong: string; limit: string; noVoice: string; failed: string; done: string };
export const SPEECH_DEADLINE_MS = 90000;
export function useReadAloud(): { read: (overlayId: string, voiceId: string | null, pace: number) => Promise<boolean>; stop: () => void; busy: boolean };
```

- [ ] **Step 1: Failing tests.**

Create `src/editor/__tests__/speechPrefs.test.ts`:

```ts
import { loadSpeechPrefs, saveSpeechPrefs, SPEECH_PREFS_KEY } from "../speechPrefs";

beforeEach(() => { localStorage.removeItem(SPEECH_PREFS_KEY); });

test("nothing stored: no voice yet, the normal pace", () => {
  expect(SPEECH_PREFS_KEY).toBe("clipy.readAloud.v1");
  expect(loadSpeechPrefs()).toEqual({ voiceId: null, pace: 0.5 });
});

test("what is saved is read back, with the pace kept in range", () => {
  saveSpeechPrefs({ voiceId: "en.ava", pace: 0.8 });
  expect(loadSpeechPrefs()).toEqual({ voiceId: "en.ava", pace: 0.8 });
  saveSpeechPrefs({ voiceId: "en.ava", pace: 7 });
  expect(loadSpeechPrefs()).toEqual({ voiceId: "en.ava", pace: 1 });
});

test("junk in storage counts as nothing stored", () => {
  for (const junk of ["", "{", "[]", "null", '{"voiceId":5,"pace":"fast"}']) {
    localStorage.setItem(SPEECH_PREFS_KEY, junk);
    expect(loadSpeechPrefs()).toEqual({ voiceId: null, pace: 0.5 });
  }
});
```

Create `src/editor/__tests__/useReadAloud.test.ts`:

```ts
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-08T10:00:00.000Z" }));
jest.mock("@/src/lib/id", () => ({ newId: jest.fn() }));
jest.mock("@/src/ui/haptics", () => ({ haptic: jest.fn() }));
jest.mock("@/src/projects", () => ({ storage: { projectDir: (id: string) => `file:///doc/projects/${id}` } }));
jest.mock("@/src/projects/expoFs", () => ({ expoFs: { mkdir: jest.fn(async () => {}), remove: jest.fn(async () => {}) } }));
jest.mock("@/modules/clipy-video", () => ({
  isSpeechAvailable: jest.fn(() => true), speakToFile: jest.fn(), cancelSpeech: jest.fn(), isNativeAvailable: jest.fn(() => true), isSoundAvailable: jest.fn(() => true),
  isSpeechCancelled: (e: unknown) => typeof e === "object" && e !== null && (e as { code?: string }).code === "E_READ_ALOUD_CANCELLED",
}));
import { act, renderHook } from "@testing-library/react-native";
import { cancelSpeech, isSpeechAvailable, speakToFile } from "@/modules/clipy-video";
import { makeAudioTrack, makeClip, makeOverlay, makeProject } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { newId } from "@/src/lib/id";
import { expoFs } from "@/src/projects/expoFs";
import { useToast } from "@/src/ui/Toast";
import { READ_ALOUD, SPEECH_DEADLINE_MS, useReadAloud } from "../useReadAloud";

const st = () => useEditorStore.getState();
const tracks = () => st().project!.audioTracks;
const said = () => useToast.getState().message;
const speak = jest.mocked(speakToFile);
const MEDIA = "file:///doc/projects/p1/media";
/** Lets the awaits inside `read` (the folder, the phone's answer, the clean-up) run. */
const settle = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
let ids = 0;

beforeEach(() => {
  jest.clearAllMocks();
  ids = 0;
  jest.mocked(newId).mockImplementation(() => `id${++ids}`);
  jest.mocked(isSpeechAvailable).mockReturnValue(true);
  useToast.setState({ message: null, stamp: 0 });
  st().reset();
  st().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 20 })], overlays: [makeOverlay({ id: "o1", text: "Hello  \u{1F600} there", start: 2, end: 5 }), makeOverlay({ id: "empty", text: "\u{1F600}", start: 0, end: 2 })] }));
  st().selectOverlay("o1");
});
afterEach(() => { jest.useRealTimers(); });

test("a reading: the cleaned text, the voice, the rate and a new file in the media folder go to the phone; one voice bar comes back, in one undo step", async () => {
  speak.mockResolvedValue({ fileUri: `${MEDIA}/speech-o1-id1.caf`, seconds: 1.8 });
  const { result } = await renderHook(() => useReadAloud());
  st().setPlaying(true);
  let ok = false;
  await act(async () => { ok = await result.current.read("o1", "en.ava", 0.75); });
  expect(ok).toBe(true);
  expect(expoFs.mkdir).toHaveBeenCalledWith(MEDIA);
  expect(speak).toHaveBeenCalledWith({ jobId: "id2", text: "Hello there", voiceId: "en.ava", rate: 0.575, outputPath: `${MEDIA}/speech-o1-id1.caf` });
  expect(tracks()).toEqual([{ id: "id3", sourceUri: `${MEDIA}/speech-o1-id1.caf`, title: "Hello there", sourceDuration: 1.8, start: 2, trimStart: 0, trimEnd: 1.8, volume: 1, kind: "voice", fadeIn: 0, fadeOut: 0 }]);
  expect(st().past).toHaveLength(1);
  expect(st().isPlaying).toBe(false);                         // the preview was paused first
  expect(st().selectedOverlayId).toBe("o1");                  // the text stays selected: the panel stays open
  expect(said()).toBe(READ_ALOUD.done);
  expect(result.current.busy).toBe(false);
});

test("a second reading of the same text replaces the first bar; Undo brings it back", async () => {
  speak.mockResolvedValueOnce({ fileUri: "x", seconds: 1.8 }).mockResolvedValueOnce({ fileUri: "y", seconds: 2.4 });
  const { result } = await renderHook(() => useReadAloud());
  await act(async () => { await result.current.read("o1", "en.ava", 0.5); });
  await act(async () => { await result.current.read("o1", "en.daniel", 0.5); });
  expect(tracks()).toHaveLength(1);
  expect(tracks()[0]).toMatchObject({ sourceUri: `${MEDIA}/speech-o1-id4.caf`, sourceDuration: 2.4, start: 2 });
  expect(st().past).toHaveLength(2);
  await act(async () => { st().undo(); });
  expect(tracks()[0].sourceUri).toBe(`${MEDIA}/speech-o1-id1.caf`);
});

test("refusals are said before anything native runs", async () => {
  const { result } = await renderHook(() => useReadAloud());
  await act(async () => { expect(await result.current.read("empty", "en.ava", 0.5)).toBe(false); });
  expect(said()).toBe(READ_ALOUD.noText);
  await act(async () => { expect(await result.current.read("o1", null, 0.5)).toBe(false); });
  expect(said()).toBe(READ_ALOUD.noVoice);
  st().apply((p) => ({ ...p, audioTracks: Array.from({ length: 12 }, (_, i) => makeAudioTrack({ id: `m${i}`, sourceDuration: 5 })) }));
  await act(async () => { expect(await result.current.read("o1", "en.ava", 0.5)).toBe(false); });
  expect(said()).toBe(READ_ALOUD.limit);
  jest.mocked(isSpeechAvailable).mockReturnValue(false);
  await act(async () => { expect(await result.current.read("o1", "en.ava", 0.5)).toBe(false); });
  expect(said()).toBe("Reduce noise and Read aloud need the latest Clipy build. Install it from the newest build link.");
  expect(speak).not.toHaveBeenCalled();
  expect(READ_ALOUD.tooLong).toBe("This text is too long to read aloud.");
});

test("while it is busy a second tap is ignored, and Stop cancels: no bar, the file is removed, nothing is said", async () => {
  let reject: (e: unknown) => void = () => {};
  speak.mockReturnValue(new Promise((_, r) => { reject = r; }));
  const { result } = await renderHook(() => useReadAloud());
  let first: Promise<boolean> = Promise.resolve(true);
  await act(async () => { first = result.current.read("o1", "en.ava", 0.5); await settle(); });
  expect(result.current.busy).toBe(true);
  await act(async () => { expect(await result.current.read("o1", "en.ava", 0.5)).toBe(false); });
  expect(speak).toHaveBeenCalledTimes(1);
  act(() => { result.current.stop(); });
  expect(cancelSpeech).toHaveBeenCalledWith("id2");
  await act(async () => { reject(Object.assign(new Error("Speech cancelled"), { code: "E_READ_ALOUD_CANCELLED" })); expect(await first).toBe(false); });
  expect(tracks()).toEqual([]);
  expect(expoFs.remove).toHaveBeenCalledWith(`${MEDIA}/speech-o1-id1.caf`);
  expect(said()).toBeNull();
  expect(result.current.busy).toBe(false);
});

test("a failure is said once in plain words, the reason goes to the log, and nothing changes", async () => {
  const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  speak.mockRejectedValue(Object.assign(new Error("speech render: no sound came out"), { code: "E_READ_ALOUD" }));
  const { result } = await renderHook(() => useReadAloud());
  await act(async () => { expect(await result.current.read("o1", "en.ava", 0.5)).toBe(false); });
  expect(said()).toBe(READ_ALOUD.failed);
  expect(warn).toHaveBeenCalledWith("read aloud failed", "speech render: no sound came out");
  expect(tracks()).toEqual([]);
  expect(st().past).toHaveLength(0);
  warn.mockRestore();
});

test("the phone never answers: after the deadline it is told to stop and the reading counts as failed", async () => {
  const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  jest.useFakeTimers();
  speak.mockReturnValue(new Promise(() => {}));
  const { result } = await renderHook(() => useReadAloud());
  let outcome: boolean | null = null;
  await act(async () => { void result.current.read("o1", "en.ava", 0.5).then((v) => { outcome = v; }); await settle(); });
  await act(async () => { jest.advanceTimersByTime(SPEECH_DEADLINE_MS + 1); await settle(); });
  expect(SPEECH_DEADLINE_MS).toBe(90000);
  expect(outcome).toBe(false);
  expect(cancelSpeech).toHaveBeenCalledWith("id2");
  expect(said()).toBe(READ_ALOUD.failed);
  warn.mockRestore();
});

test("an answer for a text that is gone meanwhile is dropped: no bar, the file removed, nothing said", async () => {
  let resolve: (v: { fileUri: string; seconds: number }) => void = () => {};
  speak.mockReturnValue(new Promise((r) => { resolve = r; }));
  const { result } = await renderHook(() => useReadAloud());
  let pending: Promise<boolean> = Promise.resolve(true);
  await act(async () => { pending = result.current.read("o1", "en.ava", 0.5); await settle(); });
  await act(async () => { st().apply((p) => ({ ...p, overlays: p.overlays.filter((o) => o.id !== "o1") })); });
  await act(async () => { resolve({ fileUri: "x", seconds: 2 }); expect(await pending).toBe(false); });
  expect(tracks()).toEqual([]);
  expect(expoFs.remove).toHaveBeenCalledWith(`${MEDIA}/speech-o1-id1.caf`);
  expect(said()).toBeNull();
});

test("leaving while it is busy cancels the reading", async () => {
  speak.mockReturnValue(new Promise(() => {}));
  const { result, unmount } = await renderHook(() => useReadAloud());
  await act(async () => { void result.current.read("o1", "en.ava", 0.5); await settle(); });
  await unmount();
  expect(cancelSpeech).toHaveBeenCalledWith("id2");
});
```

(Confirm with Grep the store's names used here: `setPlaying`, `isPlaying`, `selectOverlay`, `selectedOverlayId`, `past`, `undo`, `reset`, `setProject`; use the real names if one differs.)

- [ ] **Step 2: Run** `npx.cmd jest src/editor/__tests__/speechPrefs.test.ts src/editor/__tests__/useReadAloud.test.ts` → FAIL (modules missing).
- [ ] **Step 3: Implement.**

Create `src/editor/speechPrefs.ts`:

```ts
import "expo-sqlite/localStorage/install";
import { SPEECH_LIMITS } from "./model/speech";

/** Where the last Read aloud voice and speed are kept, in the same synchronous localStorage as `src/auth/welcomeSeen.ts`. A preference of this phone, not project data. Nothing outside this file reads or writes it. */
export const SPEECH_PREFS_KEY = "clipy.readAloud.v1";
export interface SpeechPrefs { voiceId: string | null; pace: number }
const NONE: SpeechPrefs = { voiceId: null, pace: SPEECH_LIMITS.defaultPace };

/** The remembered voice and pace; nothing stored, junk, or storage that fails → no voice yet and the normal pace. */
export function loadSpeechPrefs(): SpeechPrefs {
  try {
    const raw = localStorage.getItem(SPEECH_PREFS_KEY);
    const v: unknown = raw ? JSON.parse(raw) : null;
    if (typeof v !== "object" || v === null || Array.isArray(v)) return { ...NONE };
    const { voiceId, pace } = v as { voiceId?: unknown; pace?: unknown };
    if (typeof voiceId !== "string" && voiceId !== null) return { ...NONE };
    if (typeof pace !== "number" || !Number.isFinite(pace)) return { ...NONE };
    return { voiceId: voiceId ?? null, pace: Math.min(SPEECH_LIMITS.pace[1], Math.max(SPEECH_LIMITS.pace[0], pace)) };
  } catch { return { ...NONE }; }
}
export function saveSpeechPrefs(prefs: SpeechPrefs): void {
  try { localStorage.setItem(SPEECH_PREFS_KEY, JSON.stringify({ voiceId: prefs.voiceId, pace: prefs.pace })); } catch { /* not stored: the next opening starts from the defaults */ }
}
```

Create `src/editor/useReadAloud.ts`:

```ts
import { useCallback, useEffect, useRef, useState } from "react";
import { cancelSpeech, isSpeechAvailable, isSpeechCancelled, speakToFile } from "@/modules/clipy-video";
import { LATEST_TOOLS } from "@/src/lib/buildInfo";
import { newId } from "@/src/lib/id";
import { storage } from "@/src/projects";
import { expoFs } from "@/src/projects/expoFs";
import { haptic } from "@/src/ui/haptics";
import { useToast } from "@/src/ui/Toast";
import { placeSpeech, speakableText, speechFileName, speechRate, speechRefusal } from "./model/speech";
import { isTextOverlay } from "./model/types";
import { useEditorStore } from "./store";

/** What the owner is told. */
export const READ_ALOUD = {
  unavailable: LATEST_TOOLS,
  notText: "Only a text can be read aloud.",
  noText: "There is nothing to read in this text.",
  tooLong: "This text is too long to read aloud.",
  limit: "You have reached the audio track limit.",
  noVoice: "Pick a voice first.",
  failed: "Could not read this text aloud.",
  done: "The voice is on the audio row, under the text.",
} as const;
/** The longest one reading may take. After that the phone is told to stop and the reading counts as failed. */
export const SPEECH_DEADLINE_MS = 90000;

/**
 * Read aloud. `read(overlayId, voiceId, pace)` has the phone speak the text into a new file in the project's media folder and puts
 * ONE voice bar on the audio row for it (`placeSpeech`: a later reading of the same text replaces the earlier bar) — one undo step.
 * It answers false after saying why not (a refusal is said before anything native runs). The text stays selected. `busy` while the
 * phone is speaking; a second `read` is ignored meanwhile; `stop()` — and leaving — cancel it. A cancelled or failed reading, and
 * an answer for a text or a project that is gone, change nothing and leave no file behind.
 */
export function useReadAloud(): { read: (overlayId: string, voiceId: string | null, pace: number) => Promise<boolean>; stop: () => void; busy: boolean } {
  const [busy, setBusy] = useState(false);
  const job = useRef<string | null>(null);
  const stop = useCallback(() => {
    const id = job.current;
    if (!id) return;
    try { cancelSpeech(id); } catch (e) { console.warn("read aloud cancel failed", e); }
  }, []);
  useEffect(() => stop, [stop]);

  const read = useCallback(async (overlayId: string, voiceId: string | null, pace: number): Promise<boolean> => {
    if (job.current) return false;
    const say = (message: string) => useToast.getState().show(message);
    if (!isSpeechAvailable()) { say(READ_ALOUD.unavailable); return false; }
    const first = useEditorStore.getState().project;
    if (!first) return false;
    const why = speechRefusal(first, overlayId);
    if (why) { say(READ_ALOUD[why]); return false; }
    if (!voiceId) { say(READ_ALOUD.noVoice); return false; }
    const overlay = first.overlays.find((o) => o.id === overlayId);
    if (!overlay || !isTextOverlay(overlay)) return false;
    const projectId = first.id;
    const dir = `${storage.projectDir(projectId)}/media`;
    const path = `${dir}/${speechFileName(overlayId, newId())}`;
    const jobId = newId();
    job.current = jobId;
    setBusy(true);
    useEditorStore.getState().setPlaying(false);
    let timer: ReturnType<typeof setTimeout> | null = null;
    const forget = () => expoFs.remove(path).catch(() => {});
    try {
      await expoFs.mkdir(dir);
      const late = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`speech render: no answer after ${SPEECH_DEADLINE_MS / 1000} s`)), SPEECH_DEADLINE_MS);
      });
      const made = await Promise.race([speakToFile({ jobId, text: speakableText(overlay.text), voiceId, rate: speechRate(pace), outputPath: path }), late]);
      // The project as it is NOW (the speech took a moment): another project, or the text gone, and the answer is dropped.
      const now = useEditorStore.getState().project;
      const placed = now && now.id === projectId ? placeSpeech(now, overlayId, { id: newId(), sourceUri: path, seconds: made.seconds }) : null;
      if (!now || !placed || placed === now) { await forget(); return false; }
      haptic("light");
      useEditorStore.getState().apply(() => placed);
      say(READ_ALOUD.done);
      return true;
    } catch (e) {
      await forget();
      if (isSpeechCancelled(e)) return false;
      console.warn("read aloud failed", e instanceof Error ? e.message : String(e));
      stop();   // a reading that never answered is told to stop; one that failed has no job left, and this does nothing
      say(READ_ALOUD.failed);
      return false;
    } finally {
      if (timer !== null) clearTimeout(timer);
      job.current = null;
      setBusy(false);
    }
  }, [stop]);
  return { read, stop, busy };
}
```

(The track's `sourceUri` is the path the app chose, the same form `importAudio` stores; the native `fileUri` is not used.)

- [ ] **Step 4: Run** the two suites → PASS. Then `npm run typecheck` and `npm test`.
- [ ] **Step 5: Commit** — `feat(editor): read aloud — the flow from a text to one voice bar, with stop, deadline and remembered voice`.

---

### Task 12: Read aloud in the Text panel

**Depends on:** Task 11. **Parallel-safe with:** 6, 8.

**Files:** Create `src/editor/components/ReadAloudSection.tsx`, `src/editor/__tests__/ReadAloudSection.test.tsx`. Modify `src/editor/components/TextPanel.tsx` (one import, one line).

**Do not touch:** `TextStyleSection.tsx`, `toolStrip.ts`, `toolbarContext.ts`, `EditorToolbar.tsx`, `src/ui/*`, the existing Text panel tests.

**Interfaces: Consumes** `useReadAloud`, `READ_ALOUD` (Task 11); `loadSpeechPrefs`, `saveSpeechPrefs` (Task 11); `languagesOf`, `voicesOf`, `voiceLabel`, `pickVoice`, `paceLabel`, `SPEECH_LIMITS` (Task 3); `isSpeechAvailable`, `listVoices`, `SpeechVoices` (Task 4). **Produces** `export function ReadAloudSection(props: { overlayId: string }): JSX.Element`.

- [ ] **Step 1: Failing tests.** Create `src/editor/__tests__/ReadAloudSection.test.tsx`:

```tsx
import { act, fireEvent, render, screen } from "@testing-library/react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-08T10:00:00.000Z" }));
jest.mock("@/src/lib/id", () => ({ newId: jest.fn() }));
jest.mock("@/src/ui/haptics", () => ({ haptic: jest.fn() }));
jest.mock("@/src/projects", () => ({ storage: { projectDir: (id: string) => `file:///doc/projects/${id}` } }));
jest.mock("@/src/projects/expoFs", () => ({ expoFs: { mkdir: jest.fn(async () => {}), remove: jest.fn(async () => {}) } }));
jest.mock("@react-native-community/slider", () => { const { View } = require("react-native"); return ({ testID, value, onValueChange, onSlidingComplete }: { testID?: string; value?: number; onValueChange?: (v: number) => void; onSlidingComplete?: (v: number) => void }) => <View testID={testID} {...{ value }} onTouchMove={() => onValueChange?.(0.8)} onTouchEnd={() => onSlidingComplete?.(0.8)} />; });
jest.mock("@/modules/clipy-video", () => ({
  isSpeechAvailable: jest.fn(() => true), listVoices: jest.fn(), speakToFile: jest.fn(), cancelSpeech: jest.fn(), isNativeAvailable: jest.fn(() => true), isSoundAvailable: jest.fn(() => true),
  isSpeechCancelled: (e: unknown) => typeof e === "object" && e !== null && (e as { code?: string }).code === "E_READ_ALOUD_CANCELLED",
}));
import { cancelSpeech, isSpeechAvailable, listVoices, speakToFile } from "@/modules/clipy-video";
import { makeClip, makeOverlay, makeProject } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { newId } from "@/src/lib/id";
import { theme } from "@/src/theme/theme";
import { useToast } from "@/src/ui/Toast";
import { ReadAloudSection } from "../components/ReadAloudSection";
import { loadSpeechPrefs, SPEECH_PREFS_KEY } from "../speechPrefs";

const VOICES = { current: "en-US", voices: [
  { id: "en.samantha", name: "Samantha", language: "en-US", languageName: "English (United States)", quality: 1 },
  { id: "en.ava", name: "Ava", language: "en-US", languageName: "English (United States)", quality: 3 },
  { id: "el.melina", name: "Melina", language: "el-GR", languageName: "Greek (Greece)", quality: 1 },
] };
const st = () => useEditorStore.getState();
const row = () => screen.getByRole("button", { name: "Read aloud options" });
const chip = (name: string) => screen.getByRole("button", { name });
const flush = async () => { for (let i = 0; i < 4; i++) await act(async () => { await Promise.resolve(); }); };
const openSection = async () => { await render(<ReadAloudSection overlayId="o1" />); await fireEvent.press(row()); await flush(); };
let ids = 0;

beforeEach(() => {
  jest.clearAllMocks();
  ids = 0;
  jest.mocked(newId).mockImplementation(() => `id${++ids}`);
  jest.mocked(isSpeechAvailable).mockReturnValue(true);
  jest.mocked(listVoices).mockResolvedValue(VOICES);
  localStorage.removeItem(SPEECH_PREFS_KEY);
  useToast.setState({ message: null, stamp: 0 });
  st().reset();
  st().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 20 })], overlays: [makeOverlay({ id: "o1", text: "Hello there", start: 2, end: 5 })] }));
});

test("closed at first: one row of touch height, nothing asked of the phone", async () => {
  await render(<ReadAloudSection overlayId="o1" />);
  expect(screen.getByTestId("read-aloud-row")).toHaveStyle({ height: theme.size.touch });
  expect(row().props.accessibilityState).toMatchObject({ expanded: false });
  expect(screen.queryByTestId("read-aloud-speed")).toBeNull();
  expect(listVoices).not.toHaveBeenCalled();
});

test("opened: the languages (the phone's first), the voices of that language (best first, ringed), Speed at Normal, the button", async () => {
  await openSection();
  expect(listVoices).toHaveBeenCalledTimes(1);
  expect(chip("English (United States)")).toBeSelected();
  expect(chip("Greek (Greece)")).not.toBeSelected();
  expect(chip("Ava · Premium")).toBeSelected();
  expect(chip("Samantha")).not.toBeSelected();
  expect(screen.queryByRole("button", { name: "Melina" })).toBeNull();
  expect(screen.getByTestId("read-aloud-speed").props.value).toBe(0.5);
  expect(screen.getByText("Speed Normal")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Read aloud" })).toBeTruthy();
  expect(screen.getByTestId("read-aloud-languages")).toHaveStyle({ height: theme.size.touch });
  expect(screen.getByTestId("read-aloud-voices")).toHaveStyle({ height: theme.size.touch });
});

test("another language shows its voices and picks its best; the choice and the speed are remembered on the phone, not in the project", async () => {
  await openSection();
  await fireEvent.press(chip("Greek (Greece)"));
  expect(chip("Melina")).toBeSelected();
  await fireEvent(screen.getByTestId("read-aloud-speed"), "touchMove");
  await fireEvent(screen.getByTestId("read-aloud-speed"), "touchEnd");
  expect(screen.getByText("Speed Faster")).toBeTruthy();
  expect(loadSpeechPrefs()).toEqual({ voiceId: "el.melina", pace: 0.8 });
  expect(st().past).toHaveLength(0);
});

test("the remembered voice is the one ringed at the next opening", async () => {
  localStorage.setItem(SPEECH_PREFS_KEY, JSON.stringify({ voiceId: "el.melina", pace: 0.3 }));
  await openSection();
  expect(chip("Greek (Greece)")).toBeSelected();
  expect(chip("Melina")).toBeSelected();
  expect(screen.getByTestId("read-aloud-speed").props.value).toBe(0.3);
  expect(screen.getByText("Speed Slower")).toBeTruthy();
});

test("Read aloud: the chosen voice and speed go to the phone, one voice bar lands at the text's start", async () => {
  jest.mocked(speakToFile).mockResolvedValue({ fileUri: "x", seconds: 1.5 });
  await openSection();
  await fireEvent.press(chip("Samantha"));
  await fireEvent.press(screen.getByRole("button", { name: "Read aloud" }));
  await flush();
  expect(speakToFile).toHaveBeenCalledWith(expect.objectContaining({ text: "Hello there", voiceId: "en.samantha", rate: 0.5 }));
  expect(st().project!.audioTracks).toHaveLength(1);
  expect(st().project!.audioTracks[0]).toMatchObject({ kind: "voice", start: 2, sourceDuration: 1.5, title: "Hello there" });
  expect(st().past).toHaveLength(1);
});

test("while the phone is speaking: a spinner and Stop in the button's place; Stop cancels", async () => {
  jest.mocked(speakToFile).mockReturnValue(new Promise(() => {}));
  await openSection();
  await fireEvent.press(screen.getByRole("button", { name: "Read aloud" }));
  await flush();
  expect(screen.getByLabelText("Preparing the voice")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Read aloud" })).toBeNull();
  await fireEvent.press(screen.getByRole("button", { name: "Stop" }));
  expect(cancelSpeech).toHaveBeenCalledTimes(1);
});

test("no voices on the phone: it says so and offers no button", async () => {
  jest.mocked(listVoices).mockResolvedValue({ current: "en-US", voices: [] });
  await openSection();
  expect(screen.getByText("No voices are installed on this iPhone.")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Read aloud" })).toBeNull();
});

test("the list cannot be read: it says so, and the row can be closed and opened to try again", async () => {
  jest.mocked(listVoices).mockRejectedValueOnce(new Error("boom"));
  await openSection();
  expect(screen.getByText("Could not read the list of voices.")).toBeTruthy();
  await fireEvent.press(row());
  await fireEvent.press(row());
  await flush();
  expect(chip("Ava · Premium")).toBeTruthy();
});

test("in Expo Go or an older build the row stays closed and says what is needed", async () => {
  jest.mocked(isSpeechAvailable).mockReturnValue(false);
  await render(<ReadAloudSection overlayId="o1" />);
  await fireEvent.press(row());
  await flush();
  expect(screen.queryByTestId("read-aloud-speed")).toBeNull();
  expect(listVoices).not.toHaveBeenCalled();
  expect(useToast.getState().message).toBe("Reduce noise and Read aloud need the latest Clipy build. Install it from the newest build link.");
});
```

Append to `src/editor/__tests__/TextPanel.test.tsx` (nothing existing is edited; add the mock line at the top with the other mocks):

```tsx
jest.mock("@/modules/clipy-video", () => ({ isSpeechAvailable: jest.fn(() => false), listVoices: jest.fn(), speakToFile: jest.fn(), cancelSpeech: jest.fn(), isSpeechCancelled: () => false, isNativeAvailable: jest.fn(() => false), isSoundAvailable: jest.fn(() => false) }));
```

```tsx
test("a text has the Read aloud row under its field; a caption has none", async () => {
  const view = await render(<TextPanel overlayId="o1" visible onClose={() => {}} />);
  expect(screen.getByRole("button", { name: "Read aloud options" })).toBeTruthy();
  await act(async () => { useEditorStore.getState().apply((x) => ({ ...x, overlays: x.overlays.map((o) => (o.id === "o1" ? ({ ...o, kind: "caption" } as typeof o) : o)) })); });
  await view.rerender(<TextPanel overlayId="o1" visible onClose={() => {}} />);
  expect(screen.queryByRole("button", { name: "Read aloud options" })).toBeNull();
});
```

(If `TextPanel.test.tsx` already mocks `@/modules/clipy-video`, add the missing functions to that mock in place of a second `jest.mock`. If the other two Text panel suites, `TextPanel.sections.test.tsx` and `TextPanel.style.test.tsx`, fail to load the native wrapper once the panel imports the section, give them the same mock line: a mock added, nothing else.)

- [ ] **Step 2: Run** `npx.cmd jest src/editor/__tests__/ReadAloudSection.test.tsx src/editor/__tests__/TextPanel.test.tsx` → FAIL.
- [ ] **Step 3: Implement.** Create `src/editor/components/ReadAloudSection.tsx`:

```tsx
import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { ScrollView, View } from "react-native";
import { isSpeechAvailable, listVoices, type SpeechVoices } from "@/modules/clipy-video";
import { languagesOf, paceLabel, pickVoice, SPEECH_LIMITS, voiceLabel, voicesOf } from "@/src/editor/model/speech";
import { loadSpeechPrefs, saveSpeechPrefs } from "@/src/editor/speechPrefs";
import { READ_ALOUD, useReadAloud } from "@/src/editor/useReadAloud";
import { theme } from "@/src/theme/theme";
import { Chip } from "@/src/ui/Chip";
import { PressableScale } from "@/src/ui/PressableScale";
import { QuietButton } from "@/src/ui/QuietButton";
import { SecondaryButton } from "@/src/ui/SecondaryButton";
import { Slider } from "@/src/ui/Slider";
import { Spinner } from "@/src/ui/Spinner";
import { Body, ValueLabel } from "@/src/ui/Text";
import { useToast } from "@/src/ui/Toast";

const ROW = { height: theme.size.touch, flexDirection: "row", alignItems: "center", gap: theme.space.md } as const;
/** The row's name takes the rest of the row's width (the row has an explicit height: this `flex` is a width). */
const NAME = { flex: 1, height: theme.size.touch, flexDirection: "row", alignItems: "center", gap: theme.space.sm } as const;
const CHIPS = { alignItems: "center", gap: theme.space.sm } as const;
/** The normal pace: the slider ticks lightly when a drag reaches or passes it. */
const REST = [SPEECH_LIMITS.defaultPace] as const;
export const NO_VOICES = "No voices are installed on this iPhone.";
export const VOICES_FAILED = "Could not read the list of voices.";
export const VOICES_HINT = "These are the voices installed on this iPhone. More can be added in the iPhone Settings, under Accessibility.";

type Loaded = { state: "none" } | { state: "loading" } | { state: "failed" } | { state: "ready"; list: SpeechVoices };

/**
 * Read aloud, a row of the Text panel (texts only): closed at first, like the look rows. Open, it lists the languages and voices
 * installed on the iPhone, a Speed, and the button that turns the text into a voice bar (`useReadAloud`). The voice and the speed
 * are a preference of this phone (speechPrefs.ts), never project data: choosing them is no undo step. The list is asked of the phone
 * when the row is opened, never before. Without the build that can speak, the row stays closed and says what is needed.
 * Every row has an explicit height; nothing here animates.
 */
export function ReadAloudSection({ overlayId }: { overlayId: string }) {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState<Loaded>({ state: "none" });
  const [prefs, setPrefs] = useState(loadSpeechPrefs);
  const [language, setLanguage] = useState<string | null>(null);
  const { read, stop, busy } = useReadAloud();

  const load = () => {
    setLoaded({ state: "loading" });
    let asked: Promise<SpeechVoices>;
    try { asked = listVoices(); } catch { setLoaded({ state: "failed" }); return; }
    asked.then((list) => {
      const voice = pickVoice(list.voices, list.current, prefs.voiceId);
      setLoaded({ state: "ready", list });
      setLanguage(voice ? voice.language : null);
      if (voice && voice.id !== prefs.voiceId) setPrefs((p) => ({ ...p, voiceId: voice.id }));
    }, () => setLoaded({ state: "failed" }));
  };
  const toggle = () => {
    if (open) { setOpen(false); return; }
    if (!isSpeechAvailable()) { useToast.getState().show(READ_ALOUD.unavailable); return; }
    setOpen(true);
    if (loaded.state === "none" || loaded.state === "failed") load();
  };
  /** A choice is remembered at once (a preference, not an edit). */
  const remember = (next: { voiceId: string | null; pace: number }) => { setPrefs(next); saveSpeechPrefs(next); };
  const pickLanguage = (code: string, list: SpeechVoices) => {
    setLanguage(code);
    const best = voicesOf(list.voices, code)[0];
    if (best) remember({ ...prefs, voiceId: best.id });
  };

  const list = loaded.state === "ready" ? loaded.list : null;
  const voices = list && language ? voicesOf(list.voices, language) : [];

  return (
    <View testID="read-aloud">
      <View testID="read-aloud-row" style={ROW}>
        <PressableScale accessibilityRole="button" accessibilityLabel="Read aloud options" accessibilityState={{ expanded: open }} onPress={toggle} style={NAME}>
          <Body weight="semi">Read aloud</Body>
          <Ionicons name={open ? "chevron-up-outline" : "chevron-down-outline"} size={theme.size.icon.md} color={theme.colors.textMuted} />
        </PressableScale>
      </View>
      {open ? (
        <View style={{ gap: theme.space.md, paddingBottom: theme.space.md }}>
          {loaded.state === "loading" ? <View style={ROW}><Spinner label="Loading voices" /></View> : null}
          {loaded.state === "failed" ? <Body muted>{VOICES_FAILED}</Body> : null}
          {list && list.voices.length === 0 ? <Body muted>{NO_VOICES}</Body> : null}
          {list && list.voices.length > 0 ? (
            <>
              <ScrollView testID="read-aloud-languages" horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={{ height: theme.size.touch }} contentContainerStyle={CHIPS}>
                {languagesOf(list.voices, list.current).map((l) => <Chip key={l.code} label={l.name} selected={l.code === language} onPress={() => pickLanguage(l.code, list)} />)}
              </ScrollView>
              <ScrollView testID="read-aloud-voices" horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={{ height: theme.size.touch }} contentContainerStyle={CHIPS}>
                {voices.map((v) => <Chip key={v.id} label={voiceLabel(v)} selected={v.id === prefs.voiceId} onPress={() => remember({ ...prefs, voiceId: v.id })} />)}
              </ScrollView>
              <View>
                <ValueLabel label="Speed" value={paceLabel(prefs.pace)} />
                <Slider testID="read-aloud-speed" minimumValue={SPEECH_LIMITS.pace[0]} maximumValue={SPEECH_LIMITS.pace[1]} step={0.05} value={prefs.pace} detents={REST}
                  onValueChange={(v) => setPrefs((p) => ({ ...p, pace: v }))} onSlidingComplete={(v) => remember({ ...prefs, pace: v })} />
              </View>
              <View style={ROW}>
                {busy ? (
                  <>
                    <Spinner label="Preparing the voice" />
                    <QuietButton compact title="Stop" onPress={stop} />
                  </>
                ) : (
                  <SecondaryButton title="Read aloud" onPress={() => { void read(overlayId, prefs.voiceId, prefs.pace); }} />
                )}
              </View>
              <Body muted style={{ fontSize: theme.type.micro }}>{VOICES_HINT}</Body>
            </>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
```

Notes for the implementer: confirm with Read that the kit `Slider` passes `onSlidingComplete`'s value through (it wraps the community slider; `TextStyleSection` uses `onSlidingComplete={write}` with a value), that `theme.size.icon.md` and `theme.size.touch` exist (both are used by `TextStyleSection.tsx`), and that `Spinner`'s `label` is its accessibility label (the test finds it with `getByLabelText`). `pickLanguage` reads `prefs` from the render it was made in: it is called from a tap, never from an effect. No apostrophe appears in any JSX text here (the spacing guard's blind spot).

`src/editor/components/TextPanel.tsx`: add `import { ReadAloudSection } from "./ReadAloudSection";` and, directly after the `TemplateStrip` line, the line:

```tsx
      {/* Read aloud is for texts only: a caption is already somebody speaking. */}
      {overlay.kind === "text" && <ReadAloudSection overlayId={id} />}
```

- [ ] **Step 4: Run** `npx.cmd jest src/editor/__tests__/ReadAloudSection.test.tsx src/editor/__tests__/TextPanel.test.tsx src/editor/__tests__/TextPanel.sections.test.tsx src/editor/__tests__/TextPanel.style.test.tsx src/__tests__` → PASS (the guard tests included: no hex, spacing from the scale, outline icons). Then `npm run typecheck` and `npm test`.
- [ ] **Step 5: Commit** — `feat(editor): Read aloud in the Text panel — language, voice, speed, one button`.

---

### Task 13: Swift read-through review, then the ONE EAS build

**Depends on:** Tasks 1–12 merged and green. **This is the single native build of the batch.**

**Files:** Modify only what the review finds, in `modules/clipy-video/ios/SoundRender.swift` (the `SoundNoise` enum, the `render` signature, the request field), `SpeechRender.swift`, `ClipyVideoModule.swift` and, if a pinned string changes, `soundRender.swift.test.ts` / `speechRender.swift.test.ts`.

**Do not touch:** anything else in `src/`; `SpeedSpans.swift`, `ExportSession.swift`, `AudioMix.swift`, `SoundMath.swift`; `eas.json`; `app.json`.

- [ ] **Step 1: The review.** Dispatch an **independent reviewer** (a fresh agent that did not write Task 6 or 7; give it the files, not a verdict): `modules/clipy-video/ios/SoundRender.swift`, `SpeechRender.swift`, `ClipyVideoModule.swift`, `git diff main -- modules/clipy-video/ios`, spec §5.4 and §7, and `node_modules/expo-modules-core/ios` to read the `Record`, `Promise`, `AsyncFunction`, `Function` declarations against. It answers each of these, with the line where it is not a clean yes:
  1. **Diff scope.** Does `git diff --stat main -- modules/clipy-video/ios` show only `SoundRender.swift`, `ClipyVideoModule.swift` and the new `SpeechRender.swift`? Is `SoundRender.process` byte-for-byte unchanged?
  2. **Redeclarations.** Is any `let` / `var` / `func` / type name declared twice in one scope, or a `static let` beside a `static func` of the same name (`SoundNoise.component`, `SpeechRender.rate / same / voices / message`)? Does any new type name (`SoundNoise`, `SpeechRequest`, `SpeechError`, `SpeechRender`, `SpeechJob`) exist elsewhere in the module? Inside the `renderSound` closure, do `lead`, `noiseFormat`, `isolation` clash with `source`, `lastSent`, `result`, `answer`, `outputURL`, `job`, `jobId`?
  3. **Sync / async.** Is `AVAudioUnit.instantiate(with:options:)` called with `try await` inside an `async` function (`SoundNoise.make`), and `make` itself awaited inside the module's `Task`? Is there still no `await` in `render` / `process` / `measure`? Is `synthesizer.write(_:toBufferCallback:)` called from a non-async closure with its label named?
  4. **Availability (iOS 16.4).** For every Apple symbol the diff adds, what is its availability? Expected: `kAUSoundIsolationParam_WetDryMixPercent` 16.0, `AUParameterTree.parameter(withAddress:)` 9.0, `AudioUnitSetParameter` (long-standing), `AVAudioUnit.audioUnit`, `AVSpeechSynthesizer.write(_:toBufferCallback:)` 13.0, `AVSpeechSynthesisVoice.speechVoices() / identifier / name / language / quality / init(identifier:) / currentLanguageCode()`, `AVSpeechUtterance*SpeechRate`, `Locale.localizedString(forIdentifier:)`; `voiceTraits` and `.isNoveltyVoice` / `.isPersonalVoice` are 17.0 and must be inside `if #available(iOS 17.0, *)`. Is any quality case (`.premium`, `.enhanced`) or `kAUSoundIsolationSoundType_…` named anywhere? (It must not be.)
  5. **Types.** `AudioUnitParameterID` (UInt32) into `AUParameterAddress(…)`; `percent` a `Float` for both `AUParameter.value` and `AudioUnitSetParameter`; `OSStatus` compared with `noErr`; `voice.quality.rawValue` an `Int` inside `[String: Any]`; `Result<Double, Error>`; `SpeechRender.rate` returns `Float` and `AVSpeechUtterance.rate` is a `Float`; `pcm.format.settings` a `[String: Any]`.
  6. **Optionals.** `unit.auAudioUnit.parameterTree` is optional; `AVSpeechSynthesisVoice(identifier:)` is failable; `buffer as? AVAudioPCMBuffer`; `Locale.current.localizedString(forIdentifier:)` returns an optional. No force unwrap anywhere?
  7. **Locks and exactly-once.** In `SpeechJob`: is every read and write of `file`, `format`, `frames`, `started`, `lastBuffer`, `stopped`, `finished` under `lock`? Can `end` be entered with the lock held (it must not be: `NSLock` is not recursive)? Can `done` be called twice, or never (trace: empty buffer; idle after sound; no sound for 20 s; cancel before the first buffer; cancel after; a write error; an unknown voice)? Is the job removed from `speechJobs` on every path?
  8. **Lifetimes.** What keeps the `AVSpeechSynthesizer` alive until the last buffer (the job's stored property; the job is held by `speechJobs` and by the closures)? Is there a retain cycle that outlives the job (`done` captures `self` weakly; the `write` callback captures the job weakly; the `watch` closures hold it until it has ended)? Is the `AVAudioFile` released before the part file is moved?
  9. **Errors.** Does every failure path produce `sound noise: …` / `speech <stage>: …` with `ExportSession.describe` where an `Error` exists? Is the part file removed on every exit that is not success? Does a noise failure leave the old behaviour for a request without noise untouched?
  10. **Expo Modules API.** Do `AsyncFunction("listVoices") { (promise: Promise) in … }`, `AsyncFunction("speakToFile") { (request: SpeechRequest, promise: Promise) in … }` and `Function("noiseAvailable") { () -> Bool in … }` match what `expo-modules-core` in `node_modules` declares, the way `soundInfo` / `renderSound` / `hello` already do?
  11. **Imports.** `AVFoundation`, `ExpoModulesCore` in `SpeechRender.swift`; does `SoundRender.swift` already import `AudioToolbox` (the constants live there)? Does anything need a framework the podspec must list (it lists `Speech` only; `AVFoundation` and `AudioToolbox` are linked automatically, as the probe's build showed)?
- [ ] **Step 2: Fix** every finding in the Swift (and a pinned string in the two swift-reading tests when a line they quote changed). Re-run `npx.cmd jest src/editor/model/__tests__/soundRender.swift.test.ts src/editor/model/__tests__/speechRender.swift.test.ts src/editor/model/__tests__/soundMath.parity.test.ts src/editor/__tests__/looks.frozen.test.ts`, then `npm run typecheck` and `npm test`. If anything was changed: commit — `fix(native): noise and speech — findings of the Swift read-through`. If the reviewer found a design problem (not a slip), stop and report instead of building.
- [ ] **Step 3: The build.** Only now, once: `npx.cmd eas-cli build --profile development --platform ios --non-interactive --no-wait --json`. Note the build id and URL from the JSON. Check it with `npx.cmd eas-cli build:view <id> --json` until it is `FINISHED` or `ERRORED` (about 6–10 minutes; do not start a second build while one is running).
- [ ] **Step 4: If it errored,** read the Xcode log (`npx.cmd eas-cli build:view <id>` gives the log URL), fix exactly what the compiler names, re-run the four suites and the full checks, commit — `fix(native): <what the compiler said>` — and build again. Every extra build is reported with its reason. **No other change rides along.**
- [ ] **Step 5: Hand over.** Give the owner the install link and Part B of the device checklist (below). Nothing is committed in this step.

---

### Task 14: Docs, full checks, device checklist

**Depends on:** Tasks 1–13.

**Files:** Modify `README.md`, `AGENTS.md`, `docs/superpowers/specs/2026-10-08-noise-ramps-speech-design.md`; any file the sweep below names.

**Do not touch:** behaviour. A failing test means a mistake here.

- [ ] **Step 1: Sweep** with the Grep tool (not `sed`) and fix what is found:
  - `git diff --stat main -- modules/clipy-video/ios` shows only `SoundRender.swift`, `ClipyVideoModule.swift` and `SpeechRender.swift` (new); `git diff main -- modules/clipy-video/ios/SpeedSpans.swift modules/clipy-video/ios/ExportSession.swift modules/clipy-video/ios/AudioMix.swift modules/clipy-video/ios/SoundMath.swift` is **empty**.
  - `git diff --stat main -- src/editor/components/PreviewPlayer.tsx src/editor/components/LayerVideo.tsx src/editor/previewHandoff.ts src/editor/timelineScroll.ts src/editor/model/audioMix.ts src/editor/model/audioSync.ts src/editor/noiseProbe.ts src/editor/toolbarContext.ts src/editor/components/EditorToolbar.tsx src/ui src/theme` is **empty**.
  - `git diff --stat main -- src/__tests__` is **empty** (no guard's allow-list grew); `git diff --stat main -- src/editor/__tests__/looks.frozen.test.ts` is empty; no existing `*.parity.test.ts` changed.
  - In `git diff main -- src/editor/model/timeline.ts` every changed line is an added line (nothing existing was edited).
  - `noise: null`, `noise: undefined` in `src/` outside tests: only the one patch in `SoundQualitySheet.tsx` (`{ noise: undefined }`, which `setTrackSound` turns into "no key"). `.noise =` outside `types.ts` (`clampSound`): none.
  - `smoothCurveSteps(` called outside `timeline.ts`, `ops.ts` and tests: none. `.speedCurve.steps` read outside `timeline.ts`, `types.ts`, `ops.ts` (`copyCurve`) and tests: none new.
  - `speakToFile(` called outside `useReadAloud.ts` and tests: none. `placeSpeech(` called outside `useReadAloud.ts` and tests: none. `listVoices(` outside `ReadAloudSection.tsx` and tests: none.
  - `SOUND_VERSION` is still 1.
  - Comments that still say "v18" for the current schema: corrected (not historical test titles).
- [ ] **Step 2: Docs.**
  - `README.md`, section **Audio**: add two bullets. **Reduce noise** — on a sound bar, **Sound**: a switch and a **Strength** slider; Apple's voice isolation keeps the voice and lowers background noise; best on speech, odd on music; the original file is never changed; needs the latest build. **Read aloud** — in the Text panel, the **Read aloud** row: pick a language, a voice installed on the iPhone and a speed; the speech becomes a bar on the voice row that starts where the text starts; tapping again for the same text replaces the bar; emoji are not read; needs the latest build. Change the Sound tool's description from "strip" to "panel".
  - `README.md`, the **Speed** paragraph: the Curve tab's **Smooth** switch (on for new picks) writes a preset as a gradual ramp of 32 pieces; off writes the eight steps of before; old clips keep what they have; slow parts repeat frames.
  - `README.md`, **First native build — things to check**: add the items of spec §10 as one numbered item, "Noise, ramps and speech", with the eight sub-points.
  - `AGENTS.md` "This repo":
    - in the **Sound tools** bullet, after the sentence that ends "`outdoorGeneral` … no voice uses it).", add: ``Reduce noise is one more key of that setting, `sound.noise` (schema 19: its strength 0–1, ABSENT when off; switched off with the patch `{ noise: undefined }`). `soundChain` turns it into `noiseWet` (`noiseWet()` in sound.ts, TypeScript only) and the copy's name ends `-n<percent>` ONLY when noise is on — a setting without noise keeps its old name, so `SOUND_VERSION` did not change. Natively the isolation unit is made by `SoundNoise.make` (async, in the module's Task: `AVAudioUnit.instantiate`, then `SoundProbe.accepts`, then the mix) and goes FIRST in the chain through `SoundRender.render(…, lead:)`; `process` is untouched. Gate it with `noiseRefusal()` (soundRenders.ts: the build, then the phone), which `ensureSound` also asks before a render, and give such a render `SOUND_NOISE_DEADLINE_MS`. The Sound tool is a compact ToolPanel now (`soundQuality` is a `PanelId`).``
    - in the **Effects registry** bullet, after "or use `speedCurve` steps.", add: ``A smooth ramp is the same field with 32 steps (`smoothCurveSteps`, `SMOOTH_PER_SLICE`); whether a stored curve is smooth is `isSmoothCurve` (its step count), never a stored flag; `setClipSpeedCurve(…, smooth = false)` and `curveSteps` keep the stepped form exactly as it was (the PROOF block of `timeline.smooth.test.ts` is never edited to pass); there is no Swift for ramps — `SpeedSpans.swift` / `insertRetimed` take any number of spans.``
    - a new bullet after **Sound tools**: ``- Read aloud: the row in the Text panel (`ReadAloudSection.tsx`, texts only) → `useReadAloud` → native `speakToFile` (`SpeechRender.swift`: `SpeechJob` owns the `AVSpeechSynthesizer`, writes the voice's own PCM to `part-<name>.caf` from the FIRST buffer's format, ends exactly once, every failure is `speech <stage>: `) → `placeSpeech` (`src/editor/model/speech.ts`), which is the only code that makes a speech bar. Nothing is stored for it: a bar read from a text is recognised by its file name `speech-<overlay id>-…` (`speechTracksOf`), and a second reading REPLACES it. The voice and the speed are a phone preference (`speechPrefs.ts`, `clipy.readAloud.v1`), never project data. What is read is `speakableText` (code-point ranges, no `\p{…}`). Gate with `isSpeechAvailable()`; say `LATEST_TOOLS`. No Apple symbol newer than iOS 16.4 outside `if #available` (`voiceTraits` is 17; no quality case is named — the raw value is sent).``
    - in the **Toolbar** / **Panels** bullets: the list of tall tools gains "Sound quality"; the strips no longer include it.
  - Spec: Status → `Implemented <date> (on-device confirmation by the owner pending)`; add a section **3a. As built** after §3: the commit of each task, the build id(s) and how many builds it took and why, every finding of the Swift read-through and its fix, every deviation the tasks reported (values that changed, tests whose expectations changed — file and title, files outside the plan), and what no test checks (§10 item by item).
- [ ] **Step 3: Full checks.** `npm run typecheck`; `npm test`; `npx.cmd expo-doctor`; `git status --short` shows nothing unexpected; `git diff --stat main` shows **no change** under `ios/`, `android/`, `supabase/`, `src/publish/`, `src/theme/`, `src/ui/`, `package.json`, `app.json`, `eas.json`, `assets/`.
- [ ] **Step 4: Commit** — `git add` the files changed (explicit paths); `docs: reduce noise, smooth ramps and read aloud as built, README, AGENTS, device checklist`.

---

## Pairwise: what each task hands the next, and what may run side by side

| Pair | Shared file or interface | Producer hands over | Consumer relies on | Side by side? |
|---|---|---|---|---|
| 1 ∥ 2 ∥ 3 ∥ 4 | — | 1: `types.ts`, `migrate.ts` · 2: `timeline.ts`, `ops.ts` · 3: `speech.ts` · 4: `index.ts`, `buildInfo.ts` | none reads another's new export (3 calls ops that exist today) | **yes** — 2 must not touch `types.ts`; 1 and 3 must not touch `ops.ts` |
| 1 → 5 | `types.ts` | `SoundSettings.noise?` | `noiseOf`, the file name | no (5 after 1) |
| 4 → 5 | `index.test.ts` | the test file with Task 4's block | one key in the `request` literal | no (5 after 4) |
| 5 → 6 | `SoundRender.swift` | `@Field var noiseWet` | `request.noiseWet` in the module | no (6 after 5) |
| 6 → 7 | `ClipyVideoModule.swift` | the module with `noiseAvailable` and the changed `renderSound` | adds the speech functions after `probeNoiseReduction` | no (7 after 6) |
| 4 ∥ 6, 4 ∥ 7 | the shapes of the native calls | fixed by this plan (Task 4's interfaces = the Swift of 6 and 7); the swift-reading tests compare them | 6 and 7 must not edit `index.ts`; 4 must not edit `ios/` | yes in principle; by the order above 4 lands first |
| 4, 5 → 8 | `index.ts`, `sound.ts` | `isNoiseBuild`, `isNoiseAvailable`, `LATEST_TOOLS`; `noiseWet` in the chain, the `-n` name | `noiseRefusal`, the deadline | no (8 after both) |
| 6 ∥ 8 | — | 6: Swift and one swift-reading test · 8: `soundRenders.ts` and its test | nothing in common | **yes** |
| 1, 8 → 9 | `types.ts`, `soundRenders.ts` | `NOISE_LIMITS`, the `noise` patch; `noiseRefusal`, `holdSounds` | `SoundQualitySheet.tsx` | no (9 after both) |
| 7 ∥ 9 | — | 7: Swift · 9: the panel, `toolStrip.ts` | nothing in common | **yes** |
| 2 → 10 | `timeline.ts`, `ops.ts` | `curveProfile`, `isSmoothCurve`, `setClipSpeedCurve(…, smooth)` | `SpeedSheet.tsx` | no (10 after 2) |
| 5 ∥ 10 ∥ 11 | — | 5: `sound.ts`, one Swift line, two test literals · 10: `SpeedSheet.tsx` · 11: `speechPrefs.ts`, `useReadAloud.ts` | nothing in common | **yes** |
| 3, 4 → 11 | `speech.ts`, `index.ts`, `buildInfo.ts` | the model; `speakToFile`, `cancelSpeech`, `isSpeechAvailable`, `isSpeechCancelled`; `LATEST_TOOLS` | `useReadAloud.ts` | no (11 after both) |
| 11 → 12 | `useReadAloud.ts`, `speechPrefs.ts` | `useReadAloud()`, `READ_ALOUD`; `loadSpeechPrefs`, `saveSpeechPrefs` | `ReadAloudSection.tsx` | no (12 after 11) |
| 12 ∥ 6, 12 ∥ 8 | — | 12: `ReadAloudSection.tsx`, `TextPanel.tsx` | nothing in common | **yes** |
| 5, 6, 7 → 13 | the three Swift files | the complete Swift | the review and the one build | no (13 after everything) |
| 1–13 → 14 | docs | — | — | no (last) |

**The three features share only:** `index.ts` / `buildInfo.ts` (Task 4, done first for all three), `ClipyVideoModule.swift` (Task 6 then Task 7), the review and the build (Task 13), the docs (Task 14). Ramps (Tasks 2, 10) share nothing with the other two and can be shipped to the phone on their own.

**Parallel order, with what each may not touch**

1. **Tasks 1, 2, 3, 4** together. 1: only `types.ts`, `migrate.ts` and the tests it names. 2: only `timeline.ts`, `ops.ts` and its two new tests. 3: only its two new files. 4: only `index.ts`, `index.test.ts`, `buildInfo.ts`, `buildInfo.test.ts` (and a mock line in a test that needs `isSpeechAvailable`).
2. **Tasks 5, 10, 11** together. 5: `sound.ts`, `sound.test.ts`, the one `@Field` line, one key in `index.test.ts`. 10: `SpeedSheet.tsx` and its test. 11: `speechPrefs.ts`, `useReadAloud.ts` and their tests.
3. **Tasks 6, 8, 12** together. 6: `SoundRender.swift`, `ClipyVideoModule.swift`, `soundRender.swift.test.ts`. 8: `soundRenders.ts` and its test. 12: `ReadAloudSection.tsx`, `TextPanel.tsx`, their tests. None starts a build.
4. **Tasks 7 and 9** together. 7: `SpeechRender.swift`, `ClipyVideoModule.swift`, `speechRender.swift.test.ts`. 9: `SoundQualitySheet.tsx`, `toolStrip.ts`, the sheet's test.
5. **Task 13** alone: the review, the fixes, **the one build**.
6. **Task 14** alone.

---

## Device checklist (owner)

In one line: **Part A works with the app you already have** (smooth ramps, and the new switches saying they need the new app). **Part B needs the new app**, installed once from the link I send after the build.

### Part A: smooth ramps (today)

Open the installed app (or Expo Go with `npx expo start --go --port 8090`). Use a project from **before** this update in which a clip has a Speed **Curve** (Hero, for example), and a second, ordinary clip of about eight seconds.

**Nothing changed**

1. Play the old project. The clip with the curve looks and sounds exactly as before, and the project is as long as before. Tell me if anything is different.
2. Tap that clip, **Speed**, **Curve**. Its tile is ringed and the new **Smooth** switch is **off**. The small pictures on the tiles are eight bars, as before. Close the strip without touching anything: nothing changed.

**Smooth**

3. Tap the ordinary clip, **Speed**, **Curve**. The **Smooth** switch is **on** and the pictures are now soft shapes made of thin bars. A line at the top says slow parts can look choppy.
4. Tap **Hero** and play. The clip speeds up, slows down in the middle and speeds up again, gradually, without sudden jumps. Listen to the sound: is it clean, or does it crackle?
5. Switch **Smooth** off. The same clip now changes speed in steps, like the old one, and its length changes a little. Switch it on again. Each flip of the switch is one **Undo**.
6. Try **Bullet**, **Montage**, **Jump cut**, **Flash in** and **Flash out** with Smooth on. For each: does it feel right? Jump cut is now a wave between slow and fast, not a jump; tell me if you want it to stay stepped.
7. In Bullet's slow middle the picture can look a little choppy (the phone repeats frames). That is the known limit. Tell me if it is worse than you expected.
8. **Split** a smooth clip in the middle: both halves play as before the split.
9. Export the project (this works in the installed app, not in Expo Go). In the exported video the smooth clip matches the preview, and its sound is clean. Tell me if the sound crackles or its pitch changes.

**The two tools that need the new app**

10. Tap a voice-over, **Sound**. It now opens as a taller panel, with **Even out loudness**, **Reduce noise** and **Strength**. Tap the **Reduce noise** switch: a message says it needs the latest build, and nothing changes. The presets and Even out loudness work as before.
11. Tap a text, open the Text panel, and tap the **Read aloud** row under the text field: the same message. That is right.
12. Open **Accounts**: it still reads "App build: sound tools".

### Part B: Reduce noise and Read aloud (after installing the new app)

Install the new app from the link. **Accounts** now reads "App build: noise, ramps and speech".

**Reduce noise**

13. Record a voice-over of about ten seconds somewhere noisy (a fan, a tap running, a window open to the street). Tap it, **Sound**, and switch **Reduce noise** on. A spinner shows; while it spins you hear the recording as it was. Tell me how long it took.
14. Play: the voice is still there and the noise is clearly lower. Switch it off: the noise is back. Your recording was never changed.
15. Drag **Strength** to the far left and let go, listen; then to the far right, listen. Left should leave some noise, right almost none. Tell me if both ends sound the same.
16. At full strength, does the voice sound natural, or thin and watery?
17. With Reduce noise on, also pick **Voice**, **Deep** on the same bar: you get a deep voice without the noise.
18. Switch **Even out loudness** on as well: is the result too loud?
19. Put Reduce noise on a **music** track: it will sound odd. That is expected; the line under the switch says so.
20. Tap a **video** clip with a noisy sound, **Sound**: its sound moves to the audio row (as before) and Reduce noise works on it.
21. Try a recording of about a minute, and one of several minutes: how long do the spinners take?
22. Export: the cleaned sound is in the video.

**Read aloud**

23. Add a text, type a sentence, and tap the **Read aloud** row under the text field. It opens: languages, voices, **Speed**, and a **Read aloud** button.
24. Pick a voice and tap **Read aloud**. After a moment a message says the voice is on the audio row; a bar with the first words of your text sits on the voice row, starting where the text starts. Play: you hear your sentence.
25. Pick another voice, or move **Speed**, and tap **Read aloud** again: the bar is **replaced**, not doubled. One **Undo** brings the earlier one back.
26. Move the bar, trim it, give it **Voice**, **Echo**: it behaves like any sound.
27. Try a second language you have a voice for, with a text in that language.
28. Type only an emoji and tap Read aloud: a message says there is nothing to read.
29. Type a long paragraph, tap Read aloud, and tap **Stop** while the spinner shows: no bar is made.
30. Export: the spoken bar is in the video.

**Tell me**

31. Which voices sound good enough to use? Did any voice give no sound at all?
32. Was the video still playing normally after a reading, with sound?
