# Sound Tools (Extract audio, Voice, Sound quality, noise-reduction probe): Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** **Extract audio** (a video clip's sound becomes its own bar, the clip is muted), a **Voice** tool (None, Deep, High, Chipmunk, Robot, Echo, Hall, Telephone; Strength; Pitch), a **Sound** tool (four equaliser presets; Even out loudness) and a hidden **noise-reduction probe**, while every project that exists loads, previews and exports exactly as before and nothing is ever changed or rendered on its own.

**Architecture:** Schema v18 with ONE optional field, absent by default: `AudioTrack.sound`. `soundChain` (`src/editor/model/sound.ts`, TypeScript only) turns a setting into unit numbers; the native `renderSound` (new `SoundRender.swift`, `AVAudioEngine` offline rendering fed by `AVAssetReader`) renders the WHOLE source file through those numbers into `<project>/sound/<name>.m4a`, where the name is the setting (`soundFileName`). The copy has the source's timing, so the preview (`AudioPreview`) and the export (`useExport`) swap only the uri; `audioMix.ts` ↔ `AudioMix.swift` are untouched. `soundRenders.ts` renders what the project needs, one at a time, never during a slider drag. The only mirrored pair is `soundMath.ts` ↔ `SoundMath.swift` (loudness gain, soft clip). Extract audio is project data only: a new `sfx` track that points at the clip's own video file. Voice and Sound on a clip extract first. `contextFor` places the three tools.

**Tech Stack:** Expo SDK 57, React Native 0.86, TypeScript strict, Zustand 5, `expo-audio` (installed), `@expo/vector-icons` 15 (Ionicons), Jest (`jest-expo`) + RNTL 14.0.1; Swift 5.9 (Expo Modules API, AVFoundation / AVFAudio / AudioToolbox / CoreMedia), deployment target iOS 16.4. **No new package, no new asset. One new native build.**

**Spec:** `docs/superpowers/specs/2026-10-07-sound-tools-design.md` (binding; §3 the nine decisions, §4 schema and the proof, §5 the native API, §6 the tables, §7 the maths, §8 edge cases, §9 the probe).

## Global Constraints

- **iPhone only.** No Android or web configuration, files or code paths.
- **Expo Go must keep working, and so must the build installed today.** Everything native is reached through `modules/clipy-video/index.ts`; Voice and Sound are gated by `isSoundAvailable()` (false in Expo Go **and** in a build without `renderSound`). `package.json`, `app.json`, `eas.json` and `assets/` are not edited.
- **Nothing existing changes.** A track without `sound` (every track in every saved project) must go through exactly the expressions it does today. Where an existing function is edited, the edit is a branch only a track **with** the field takes. Existing tests are not edited except the pinned values named in a task.
- **Nothing happens on its own.** Only `setTrackSound` writes `sound`, only `extractClipAudio` extracts, and only from a tap or a drag. A render never changes the project. No file in `<project>/media/` is ever written, moved or deleted by this round.
- **The optional field is absent, never `undefined`, `null` or a neutral object:** remove the key (`delete next.sound`). Tests check with `"sound" in track`.
- **Never edited this round:** `src/editor/components/PreviewPlayer.tsx`, `src/editor/previewHandoff.ts`, `src/editor/timelineScroll.ts`, `src/editor/model/timeline.ts`, `src/editor/model/audioMix.ts`, `src/editor/model/audioSync.ts`, `modules/clipy-video/ios/AudioMix.swift`, `Timeline.tsx`, `EditorLayout.tsx`, `src/ui/*` (the kit is used as it is), `src/theme/*`, `src/editor/__tests__/looks.frozen.test.ts`, every existing `*.parity.test.ts` / `*.swift.test.ts`, anything under `src/publish/` or `supabase/`.
- **Only `src/editor/model/timeline.ts` multiplies or divides by a clip's `speed`.** This round only compares it (`speed !== 1`) and calls `hasSpeedCurve` / `clipStartTimes`.
- **Swift rules (there is no Swift toolchain here; the code is checked by reading):** (1) keep every `AVURLAsset` in a stored property for as long as its tracks are used (`AVAssetTrack.asset` is weak); (2) every failure path throws `SoundError.failed("sound <stage>: …")` and uses `ExportSession.describe(error)` wherever an `Error` exists; (3) no name declared twice in one scope, and no `static let x` beside `static func x(`; (4) the render loop is a **synchronous** function and calls `scheduleBuffer(_:completionHandler: nil)`: in an `async` function the same call would pick the async overload and wait for ever; (5) explicit closure parameter types where a closure is passed to a generic or overloaded function.
- UI from `src/ui/` and `src/theme/theme.ts` only; **no hex literals**; **spacing from `theme.space` only** (`spacingScale.test.ts`: never add to its allow-table, never rely on its blind spots, so no apostrophe in JSX text and no `*` or `/` in a spacing value); sliders are the kit `Slider`; icons are Ionicons outline names; a strip's rows have explicit heights (`STRIP`), a panel's body too (no `flex: 1` for height).
- **Motion rules:** no new animation at all. No Reanimated, no timers, no entering / exiting. The kit's `EnterView` inside `ToolStrip` / `ToolPanel` is all there is.
- **One user action = one undo step:** a tap is one `apply`, a drag is `beginTransaction` + `applyTransient`. A drag renders once, on release (`holdSounds`).
- Tools open through `src/editor/toolStrip.ts` (select first, open second). The preview `VideoView` never remounts.
- RNTL v14: `render` / `fireEvent` / `rerender` are async: always `await`. `getByRole("button", { name })` matches the accessibility label exactly.
- A test that fails after your change because it names a **pinned count, id list, label list or schema number** listed in your task is updated as the task says. A test that fails for any other reason means a mistake in the change: fix the change.
- Tasks that run side by side share one working tree: a red suite that belongs to a file another task owns is not yours to fix. Re-run when that task has landed; never edit a file outside your task's list.
- Windows: PowerShell, no `&&`, `npx.cmd`. **Never run `expo lint`.** **No broad `sed`**: use Grep and edit each hit by hand. **Never `git stash`.** **`git add` explicit paths only, never `-A` / `.`.** **Do not start or stop a dev server** (one is serving this tree to the owner's phone). Before each commit: `npm run typecheck` and `npm test` green. Commit trailer exactly `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Task order

`1 -> (2 || 3 || 5) -> (4 || 6) -> (7 || 8) -> (9 || 10 || 12) -> 11 -> 13 -> 14`

| Task | Title | Depends on | Parallel-safe with | Native? | Model tier |
|---|---|---|---|---|---|
| 1 | Schema v18: `AudioTrack.sound`, ids, clamp, registries, the PROOF migration | — | — | no | standard |
| 2 | Sound maths and the preset tables (`soundMath.ts`, `sound.ts`) | 1 | 3, 5 | no | most capable |
| 3 | Ops: `setTrackSound`, `extractClipAudio`, refusals | 1 | 2, 5 | no | standard |
| 4 | The native wrapper (`index.ts`): render, cancel, info, probe | 2 | 6, 3 | no (JS side) | standard |
| 5 | Swift: `SoundMath.swift` and its parity test | 1 (reads spec §7) | 2, 3 | **Swift** | standard |
| 6 | Swift: `SoundRender.swift`, the module functions, the silent-video skip | 5 | 4, 7, 8 | **Swift** | most capable |
| 7 | The render manager; the preview plays the copy | 4 | 6, 8 | no | most capable |
| 8 | Extract audio: the flow (`useExtractAudio`) | 3, 4 | 6, 7 | no | standard |
| 9 | The Voice panel | 3, 7 | 10, 12 | no | standard |
| 10 | The Sound strip and the dev-only probe call | 3, 7 | 9, 12 | no | standard |
| 11 | Toolbar: `contextFor`, tool ids, the tools mounted, the actions | 8, 9, 10 | 12 | no | standard |
| 12 | Export: copies prepared first, the uri swapped | 7 | 9, 10, 11 | no | standard |
| 13 | **Swift read-through review, then the ONE EAS build** | 1–12 | — | **the single native build** | most capable (review) |
| 14 | Docs, full checks, device checklist | 1–13 | — | no | cheap |

**All Swift is in Tasks 5 and 6. Task 13 is the only build.** No task before 13 starts a build.

**What the owner can test before the new build** (Expo Go, or the app installed today): Tasks 1, 3, 8 and 11 together give **Extract audio** complete (bar, mute, undo, refusals). It needs nothing native. Voice and Sound show their "need the new native build" toast there. Everything in Tasks 4–7, 9, 10 and 12 needs the build from Task 13 to be heard.

**Files more than one task edits:** `modules/clipy-video/index.ts`: Task 4 only. `ops.ts`: Task 3 only. `types.ts`, `migrate.ts`: Task 1 only. `ClipyVideoModule.swift`, `ExportSession.swift`: Task 6 only. `AudioPreview.tsx`, `app/editor/[id]/index.tsx`: Task 7 only. `toolbarContext.ts`, `toolGroups.ts`, `toolStrip.ts`, `EditorToolbar.tsx`: Task 11 only. `useExport.ts`: Task 12 only.

**Pinned values that change, and who changes them:** schema number 17 → 18 (Task 1: `migrate.test.ts` and ten `types.*.test.ts`) · `TOOL_IDS` 51 → 54, the clip / layer / sound id lists and label lists, the icon table (Task 11: `toolbarContext.test.ts`, `icons.test.ts`, `EditorToolbar.test.tsx`, `EditorToolbar.layers.test.tsx`).

---

### Task 1: Schema v18: `AudioTrack.sound`, ids, clamp, registries, the PROOF migration

**Depends on:** nothing. **Parallel-safe with:** none.

**Files:** Create `src/editor/soundTools.ts`, `src/editor/model/__tests__/types.sound.test.ts`, `src/editor/__tests__/soundTools.test.ts`. Modify `src/editor/model/types.ts`, `src/editor/model/migrate.ts`, `src/editor/model/__tests__/migrate.test.ts` (pinned number + append) and the pinned number in `types.audio.test.ts`, `types.clip.test.ts`, `types.layers.test.ts`, `types.layers2.test.ts`, `types.look.test.ts`, `types.motion.test.ts`, `types.photo.test.ts`, `types.polish.test.ts`, `types.speed.test.ts`, `types.text.test.ts`.

**Do not touch:** `ops.ts`, every component, everything under "Never edited this round".

**Interfaces: Produces**

```ts
// src/editor/model/types.ts
export const SCHEMA_VERSION = 18 as const;
export const VOICE_IDS: readonly ["deep", "high", "chipmunk", "robot", "echo", "hall", "telephone"];
export type VoiceId = (typeof VOICE_IDS)[number];
export const EQ_IDS: readonly ["bassBoost", "clearVoice", "warm", "bright"];
export type EqId = (typeof EQ_IDS)[number];
export interface SoundSettings { voice: VoiceId | null; strength: number; pitch: number; eq: EqId | null; level: boolean }
export const SOUND_LIMITS: { strength: readonly [0, 1]; defaultStrength: 0.5; pitch: readonly [-12, 12] };
export const NO_SOUND: SoundSettings;                       // { voice: null, strength: 0.5, pitch: 0, eq: null, level: false }
export const isNeutralSound: (s: SoundSettings) => boolean;
export function clampSound(v: unknown): SoundSettings | null;   // null = neutral or unusable
export interface AudioTrack { /* … */ sound?: SoundSettings }
// src/editor/soundTools.ts
export const VOICES: Record<VoiceId, { label: string; icon: IoniconName }>;
export const EQS: Record<EqId, { label: string; icon: IoniconName }>;
```

- [ ] **Step 0: Baseline.** `npm run typecheck` and `npm test` are green on the untouched tree. If not, stop and report.
- [ ] **Step 1: Failing tests.**

Create `src/editor/model/__tests__/types.sound.test.ts`:

```ts
import { clampSound, EQ_IDS, isNeutralSound, makeAudioTrack, NO_SOUND, SCHEMA_VERSION, SOUND_LIMITS, VOICE_IDS, type SoundSettings } from "../types";

test("schema is v18; the voices, the equaliser presets and their limits are as specified", () => {
  expect(SCHEMA_VERSION).toBe(18);
  expect(VOICE_IDS).toEqual(["deep", "high", "chipmunk", "robot", "echo", "hall", "telephone"]);
  expect(EQ_IDS).toEqual(["bassBoost", "clearVoice", "warm", "bright"]);
  expect(SOUND_LIMITS).toEqual({ strength: [0, 1], defaultStrength: 0.5, pitch: [-12, 12] });
  expect(NO_SOUND).toEqual({ voice: null, strength: 0.5, pitch: 0, eq: null, level: false });
});

test("no factory writes the field: a new track has the shape it always had", () => {
  expect("sound" in makeAudioTrack({ id: "m", sourceDuration: 5 })).toBe(false);
});

test("isNeutralSound: no voice, no pitch, no equaliser, level off (the strength does not count)", () => {
  expect(isNeutralSound(NO_SOUND)).toBe(true);
  expect(isNeutralSound({ ...NO_SOUND, strength: 0.9 })).toBe(true);
  for (const s of [{ voice: "deep" }, { pitch: 1 }, { pitch: -1 }, { eq: "warm" }, { level: true }] as Partial<SoundSettings>[]) expect(isNeutralSound({ ...NO_SOUND, ...s })).toBe(false);
});

test("clampSound: a usable setting is kept with every value in range; a neutral or unusable one is null", () => {
  const full = { voice: "robot", strength: 0.8, pitch: -3, eq: "warm", level: true };
  expect(clampSound(full)).toEqual(full);
  expect(clampSound({ ...full, extra: 1 })).toEqual(full);                                   // unknown keys dropped
  expect(clampSound({ ...full, strength: 4 })).toEqual({ ...full, strength: 1 });
  expect(clampSound({ ...full, strength: -1 })).toEqual({ ...full, strength: 0 });
  expect(clampSound({ ...full, strength: NaN })).toEqual({ ...full, strength: 0.5 });
  expect(clampSound({ ...full, strength: 0.333 })).toEqual({ ...full, strength: 0.33 });     // 2 decimals
  expect(clampSound({ ...full, pitch: 40 })).toEqual({ ...full, pitch: 12 });
  expect(clampSound({ ...full, pitch: -40 })).toEqual({ ...full, pitch: -12 });
  expect(clampSound({ ...full, pitch: 2.6 })).toEqual({ ...full, pitch: 3 });                // whole steps
  expect(clampSound({ ...full, pitch: "x" })).toEqual({ ...full, pitch: 0 });
  expect(clampSound({ ...full, voice: "alien" })).toEqual({ ...full, voice: null });
  expect(clampSound({ ...full, eq: "loud" })).toEqual({ ...full, eq: null });
  expect(clampSound({ ...full, level: "yes" })).toEqual({ ...full, level: false });
  expect(clampSound({ voice: "deep" })).toEqual({ voice: "deep", strength: 0.5, pitch: 0, eq: null, level: false });
  expect(clampSound({ pitch: -0.2 })).toBeNull();                                            // rounds to 0: neutral
  for (const junk of [null, undefined, "deep", 3, [], {}, NO_SOUND, { voice: "alien", eq: "loud" }, { strength: 1 }]) expect(clampSound(junk)).toBeNull();
  const once = clampSound({ ...full, strength: 0.333, pitch: 2.6 });
  expect(clampSound(once)).toEqual(once);                                                    // idempotent
});
```

Create `src/editor/__tests__/soundTools.test.ts`:

```ts
import { EQ_IDS, VOICE_IDS } from "../model/types";
import { EQS, VOICES } from "../soundTools";

const GLYPHS: Record<string, number> = require("@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/Ionicons.json");

test("the seven voices: labels in sentence case, icons that are Ionicons outline glyphs", () => {
  expect(VOICE_IDS.map((id) => VOICES[id].label)).toEqual(["Deep", "High", "Chipmunk", "Robot", "Echo", "Hall", "Telephone"]);
  expect(VOICE_IDS.map((id) => VOICES[id].icon)).toEqual(["arrow-down-outline", "arrow-up-outline", "paw-outline", "hardware-chip-outline", "repeat-outline", "business-outline", "call-outline"]);
  expect(Object.keys(VOICES).sort()).toEqual([...VOICE_IDS].sort());
});

test("the four equaliser presets", () => {
  expect(EQ_IDS.map((id) => EQS[id].label)).toEqual(["Bass boost", "Clear voice", "Warm", "Bright"]);
  expect(EQ_IDS.map((id) => EQS[id].icon)).toEqual(["pulse-outline", "chatbubble-outline", "flame-outline", "sunny-outline"]);
  expect(Object.keys(EQS).sort()).toEqual([...EQ_IDS].sort());
});

test("every icon exists and every label fits under a 72-pt tile", () => {
  for (const row of [...Object.values(VOICES), ...Object.values(EQS)]) {
    expect(row.icon).toMatch(/-outline$/);
    expect(GLYPHS[row.icon]).toBeDefined();
    expect(row.label.length).toBeLessThanOrEqual(12);
  }
});
```

Append to `src/editor/model/__tests__/migrate.test.ts` (add to its `../types` import whatever is missing of `makeAudioTrack`, `makeClip`, `makeLayer`, `makeProject`, `type AudioTrack`):

```ts
test("PROOF v17 → v18: the migration changes the number and nothing else — music, voice-overs, sound effects, trims, fades, ducking, beats and muted clips are kept as stored, and no track gains a field", () => {
  const now = makeProject({
    clips: [makeClip({ id: "a", sourceDuration: 8, muted: true, volume: 1.4, fadeIn: 0.5 }), makeClip({ id: "b", sourceDuration: 6, fadeOut: 1 })],
    layers: [makeLayer({ id: "L", sourceDuration: 4, start: 2, volume: 0.5 })],
    audioTracks: [
      makeAudioTrack({ id: "m1", sourceDuration: 30, trimStart: 2.5, trimEnd: 10, start: 0, volume: 1.6, fadeIn: 1, fadeOut: 2 }),
      makeAudioTrack({ id: "m2", sourceDuration: 30, trimStart: 10, trimEnd: 21.125, start: 7.5, fadeOut: 2 }),          // the second piece of a split
      makeAudioTrack({ id: "v1", sourceDuration: 6, kind: "voice", start: 3, title: "Voice-over" }),
      makeAudioTrack({ id: "s1", sourceDuration: 1, kind: "sfx", start: 4.25, trimEnd: 0.4, volume: 0 }),
    ],
    ducking: true, beatMarkers: [1, 2.5, 9.75],
  });
  expect(migrateProject(now)).toEqual(now);                       // the fixture is a clean v18 project
  const v17 = JSON.parse(JSON.stringify(now)) as { schemaVersion: number };
  v17.schemaVersion = 17;
  const frozen = JSON.stringify(v17);
  const p = migrateProject(v17);
  expect(JSON.stringify(v17)).toBe(frozen);                       // the stored object is not mutated
  expect({ ...p, schemaVersion: 17 }).toEqual(v17);               // nothing but the number differs from the file
  expect(p.schemaVersion).toBe(18);
  // `toEqual` does not see a key that holds undefined: check that the key itself is absent.
  for (const t of p.audioTracks) expect("sound" in t).toBe(false);
  expect(migrateProject(p)).toEqual(p);
});

test("the sanity pass keeps a usable sound setting and removes one that cannot be used", () => {
  const withSound = (id: string, sound: unknown) => ({ ...makeAudioTrack({ id, sourceDuration: 5 }), sound }) as unknown as AudioTrack;
  const p = migrateProject(makeProject({ audioTracks: [
    withSound("ok", { voice: "deep", strength: 0.8, pitch: 2, eq: "warm", level: true }),
    withSound("wild", { voice: "echo", strength: 7, pitch: 99, eq: null, level: false }),
    withSound("unknown", { voice: "alien", strength: 0.5, pitch: 0, eq: "loud", level: false }),
    withSound("neutral", { voice: null, strength: 0.5, pitch: 0, eq: null, level: false }),
    withSound("junk", "deep"),
    withSound("nothing", null),
  ] }));
  const track = (id: string) => p.audioTracks.find((t) => t.id === id)!;
  expect(track("ok").sound).toEqual({ voice: "deep", strength: 0.8, pitch: 2, eq: "warm", level: true });
  expect(track("wild").sound).toEqual({ voice: "echo", strength: 1, pitch: 12, eq: null, level: false });
  for (const id of ["unknown", "neutral", "junk", "nothing"]) expect("sound" in track(id)).toBe(false);
  expect(migrateProject(p)).toEqual(p);
});
```

- [ ] **Step 2: Run** `npx.cmd jest src/editor/model/__tests__/types.sound.test.ts src/editor/__tests__/soundTools.test.ts src/editor/model/__tests__/migrate.test.ts` → the new tests FAIL (missing exports / version 17).
- [ ] **Step 3: Implement.**

`src/editor/model/types.ts`:

1. `export const SCHEMA_VERSION = 18 as const;`
2. After the line `export const CLIP_VOLUME = [0, 2] as const;` insert:

```ts

/** The voices of the Voice tool, in the panel's order. The numbers behind each are `VOICE_TABLE` in sound.ts. */
export const VOICE_IDS = ["deep", "high", "chipmunk", "robot", "echo", "hall", "telephone"] as const;
export type VoiceId = (typeof VOICE_IDS)[number];
/** The equaliser presets of the Sound tool, in the strip's order (`EQ_TABLE` in sound.ts). */
export const EQ_IDS = ["bassBoost", "clearVoice", "warm", "bright"] as const;
export type EqId = (typeof EQ_IDS)[number];
/**
 * How an audio track is changed before it is mixed. `voice` null = none; `strength` 0–1, gentle … strong; `pitch` whole semitones
 * (added to the voice's own); `eq` null = none; `level` = Even out loudness. The file is never changed: a copy is rendered from these.
 */
export interface SoundSettings { voice: VoiceId | null; strength: number; pitch: number; eq: EqId | null; level: boolean }
export const SOUND_LIMITS = { strength: [0, 1] as const, defaultStrength: 0.5, pitch: [-12, 12] as const };
/** The sound as recorded. Never stored: a track without changes has NO `sound` key. */
export const NO_SOUND: SoundSettings = { voice: null, strength: SOUND_LIMITS.defaultStrength, pitch: 0, eq: null, level: false };
export const isNeutralSound = (s: SoundSettings): boolean => s.voice === null && s.pitch === 0 && s.eq === null && !s.level;
```

3. In `interface AudioTrack`, after the `fadeOut` line:

```ts
  sound?: SoundSettings;   // ABSENT = as recorded (never null / undefined / neutral). Written only by `setTrackSound`
```

4. After `export const clampFade = …` insert:

```ts
/**
 * A usable sound setting with every value in range (strength 2 decimals, not a number → the default; pitch a whole step, not a
 * number → 0; unknown ids → none; `level` only when exactly true), or null when it is not an object or changes nothing. Idempotent.
 */
export function clampSound(v: unknown): SoundSettings | null {
  if (!isRec(v) || Array.isArray(v)) return null;
  const [sLo, sHi] = SOUND_LIMITS.strength, [pLo, pHi] = SOUND_LIMITS.pitch;
  const s: SoundSettings = {
    voice: (VOICE_IDS as readonly unknown[]).includes(v.voice) ? (v.voice as VoiceId) : null,
    strength: isNum(v.strength) ? Math.round(clampNum(v.strength, sLo, sHi) * 100) / 100 : SOUND_LIMITS.defaultStrength,
    pitch: isNum(v.pitch) ? clampNum(Math.round(v.pitch), pLo, pHi) + 0 : 0,   // + 0: a rounded −0 is stored as 0
    eq: (EQ_IDS as readonly unknown[]).includes(v.eq) ? (v.eq as EqId) : null,
    level: v.level === true,
  };
  return isNeutralSound(s) ? null : s;
}
```

(`isRec` and `isNum` are `const` arrow functions declared further up the file than this insert point? They are declared at about line 281, **above** `clampFade` at about line 475: confirm with Grep before saving. If `clampFade` were above them the insert would still work, because the call happens at run time, not at module load.)

`src/editor/model/migrate.ts`: add `clampSound` to the `./types` import, and replace the `audioTracks` expression in `normaliseCurrent` with:

```ts
  const audioTracks = (Array.isArray(raw.audioTracks) ? raw.audioTracks : []).filter((a): a is Record<string, unknown> => isObj(a) && !Array.isArray(a)).slice(0, AUDIO_LIMITS.maxTracks).map((a): AudioTrack => {
    const track: AudioTrack = {
      ...(a as unknown as AudioTrack),
      kind: (AUDIO_KINDS as readonly unknown[]).includes(a.kind) ? (a.kind as AudioKind) : "music",
      fadeIn: clampFade(a.fadeIn), fadeOut: clampFade(a.fadeOut),
    };
    // v18: optional and ABSENT unless usable.
    const sound = clampSound(a.sound);
    delete track.sound;
    if (sound) track.sound = sound;
    return track;
  });
```

In the doc comment of `normaliseCurrent` change `v2–v17 file to a safe v17 shape` to `v2–v18 file to a safe v18 shape` and append to its last sentence: `, and v17 → v18 adds nothing either: an audio track's sound setting is optional, kept when usable and removed when not.` In `migrateProject` change the comment `v2 → v17` to `v2 → v18`.

Create `src/editor/soundTools.ts`:

```ts
import type { EqId, VoiceId } from "./model/types";
import type { IoniconName } from "./toolGroups";

/** What each voice tile shows. The numbers behind a voice are in model/sound.ts. */
export const VOICES: Record<VoiceId, { label: string; icon: IoniconName }> = {
  deep: { label: "Deep", icon: "arrow-down-outline" },
  high: { label: "High", icon: "arrow-up-outline" },
  chipmunk: { label: "Chipmunk", icon: "paw-outline" },
  robot: { label: "Robot", icon: "hardware-chip-outline" },
  echo: { label: "Echo", icon: "repeat-outline" },
  hall: { label: "Hall", icon: "business-outline" },
  telephone: { label: "Telephone", icon: "call-outline" },
};

/** What each equaliser tile shows. */
export const EQS: Record<EqId, { label: string; icon: IoniconName }> = {
  bassBoost: { label: "Bass boost", icon: "pulse-outline" },
  clearVoice: { label: "Clear voice", icon: "chatbubble-outline" },
  warm: { label: "Warm", icon: "flame-outline" },
  bright: { label: "Bright", icon: "sunny-outline" },
};
```

**Pinned numbers.** In `migrate.test.ts` and the ten `types.*.test.ts` listed above, every assertion that the CURRENT schema is 17 (`expect(SCHEMA_VERSION).toBe(17)`, `expect(p.schemaVersion).toBe(17)`, a test title "schema is v17") becomes 18. Find them with Grep (`toBe(17)`, `v17`) and edit each by hand. A fixture that is **given** an older number (`schemaVersion = 16`, `schemaVersion: 16`) stays as it is: that is the point of those tests.

- [ ] **Step 4: Run** the three suites → PASS. Then `npm run typecheck` and `npm test`.
- [ ] **Step 5: Commit** — `git add` the files above (explicit paths); `feat(model): schema v18 — an audio track's optional sound setting, clamp, registries, PROOF migration`.

---

### Task 2: Sound maths and the preset tables

**Depends on:** Task 1. **Parallel-safe with:** 3, 5.

**Files:** Create `src/editor/model/soundMath.ts`, `src/editor/model/sound.ts`, `src/editor/model/__tests__/soundMath.vectors.ts`, `src/editor/model/__tests__/soundMath.test.ts`, `src/editor/model/__tests__/sound.test.ts`.

**Do not touch:** `types.ts`, `ops.ts`, `modules/`.

**Interfaces: Consumes** `SoundSettings`, `VoiceId`, `EqId`, `Project`, `AudioTrack` (Task 1). **Produces**

```ts
// src/editor/model/soundMath.ts  (twin: modules/clipy-video/ios/SoundMath.swift, Task 5)
export const LEVEL: { targetDb: -18; gateDb: -45; maxBoostDb: 18; maxCutDb: 6; blockSeconds: 0.4 };
export const SOFT_CLIP: { knee: 0.9; ceiling: 0.98 };
export const dbToGain: (db: number) => number;
export function levelGainDb(blocks: readonly number[]): number;
export function softClip(x: number): number;
// src/editor/model/sound.ts  (TypeScript only: no Swift twin)
export const SOUND_VERSION = 1;
export const BAND_TYPES: readonly ["parametric", "lowShelf", "highShelf", "highPass", "lowPass"];
export type BandType = (typeof BAND_TYPES)[number];
export const REVERB_PRESETS: readonly string[];        // the 14 names Swift accepts
export const DISTORTION_PRESETS: readonly string[];    // the 22 names Swift accepts
export interface SoundBand { type: BandType; frequency: number; gain: number; bandwidth: number }
export interface SoundChain { pitchCents: number; distortionPreset: string; distortionWet: number; distortionPreGain: number; delayTime: number; delayFeedback: number; delayWet: number; delayLowPass: number; reverbPreset: string; reverbWet: number; bands: SoundBand[]; level: boolean }
export const PITCH_CENTS_LIMIT = 2400;
export function soundChain(s: SoundSettings): SoundChain;
export function soundFileName(sourceUri: string, s: SoundSettings): string;
export interface NeededSound { name: string; sourceUri: string; sound: SoundSettings }
export function neededSounds(p: Project, missing?: readonly string[]): NeededSound[];
```

- [ ] **Step 1: Failing tests.**

Create `src/editor/model/__tests__/soundMath.vectors.ts`:

```ts
/** Shared by soundMath.test.ts and soundMath.parity.test.ts. `blocks` are mean squares of 0.4 s blocks. */
export const LEVEL_VECTORS: { blocks: number[]; db: number }[] = [
  { blocks: [], db: 0 },
  { blocks: [1e-6, 1e-7], db: 0 },                 // everything under the gate
  { blocks: [0.001, 0.001], db: 12 },
  { blocks: [0.001, 1e-6, 0.001], db: 12 },        // a silent block is ignored
  { blocks: [0.01, 0.02, 0.03], db: -1.0103 },
  { blocks: [0.25], db: -6 },                      // never cut by more than 6 dB
  { blocks: [1e-4], db: 18 },                      // never boosted by more than 18 dB
  { blocks: [0.001, NaN, Infinity], db: 12 },      // not a number: ignored
];
export const CLIP_VECTORS: { x: number; y: number }[] = [
  { x: 0, y: 0 }, { x: 0.5, y: 0.5 }, { x: -0.3, y: -0.3 }, { x: 0.9, y: 0.9 },
  { x: 0.95, y: 0.944368 }, { x: 1, y: 0.967863 }, { x: 1.5, y: 0.98 }, { x: 2, y: 0.98 }, { x: -1, y: -0.967863 },
];
```

Create `src/editor/model/__tests__/soundMath.test.ts`:

```ts
import { dbToGain, LEVEL, levelGainDb, SOFT_CLIP, softClip } from "../soundMath";
import { CLIP_VECTORS, LEVEL_VECTORS } from "./soundMath.vectors";

test("the constants", () => {
  expect(LEVEL).toEqual({ targetDb: -18, gateDb: -45, maxBoostDb: 18, maxCutDb: 6, blockSeconds: 0.4 });
  expect(SOFT_CLIP).toEqual({ knee: 0.9, ceiling: 0.98 });
});

test("dbToGain: 0 dB is 1, 6 dB about 2, not a number is 1", () => {
  expect(dbToGain(0)).toBe(1);
  expect(dbToGain(6)).toBeCloseTo(1.995262, 5);
  expect(dbToGain(-6)).toBeCloseTo(0.501187, 5);
  expect(dbToGain(18)).toBeCloseTo(7.943282, 5);
  expect(dbToGain(NaN)).toBe(1);
});

test("levelGainDb: the gain that brings the gated level to the target, inside −6 … +18 dB", () => {
  for (const v of LEVEL_VECTORS) expect(levelGainDb(v.blocks)).toBeCloseTo(v.db, 3);
  expect(levelGainDb([Math.pow(10, -18 / 10)])).toBeCloseTo(0, 9);   // already at the target
});

test("softClip: unchanged up to the knee, never above the ceiling, odd", () => {
  for (const v of CLIP_VECTORS) expect(softClip(v.x)).toBeCloseTo(v.y, 5);
  for (const x of [0.91, 1, 3, 100]) { expect(softClip(x)).toBeLessThanOrEqual(SOFT_CLIP.ceiling); expect(softClip(-x)).toBe(-softClip(x)); }
  expect(softClip(0.9)).toBe(0.9);
  expect(softClip(NaN)).toBe(0);
  // Continuous at the knee: no step.
  expect(softClip(0.9000001) - 0.9).toBeLessThan(1e-6);
});
```

Create `src/editor/model/__tests__/sound.test.ts`:

```ts
import { makeAudioTrack, makeProject, NO_SOUND, VOICE_IDS, type SoundSettings } from "../types";
import { BAND_TYPES, DISTORTION_PRESETS, neededSounds, PITCH_CENTS_LIMIT, REVERB_PRESETS, SOUND_VERSION, soundChain, soundFileName } from "../sound";

const set = (patch: Partial<SoundSettings>): SoundSettings => ({ ...NO_SOUND, ...patch });
const voice = (id: SoundSettings["voice"], strength: number) => soundChain(set({ voice: id, strength }));
const NEUTRAL = { pitchCents: 0, distortionPreset: "", distortionWet: 0, distortionPreGain: -6, delayTime: 0, delayFeedback: 0, delayWet: 0, delayLowPass: 15000, reverbPreset: "", reverbWet: 0, bands: [], level: false };

test("no setting is a chain that does nothing", () => {
  expect(soundChain(NO_SOUND)).toEqual(NEUTRAL);
  expect(soundChain(set({ strength: 1 }))).toEqual(NEUTRAL);        // strength alone does nothing
  expect(soundChain(set({ level: true }))).toEqual({ ...NEUTRAL, level: true });
});

test("Deep, High, Chipmunk are pitch only, at strength 0 / 0.5 / 1", () => {
  expect([0, 0.5, 1].map((s) => voice("deep", s).pitchCents)).toEqual([-200, -450, -700]);
  expect([0, 0.5, 1].map((s) => voice("high", s).pitchCents)).toEqual([200, 400, 600]);
  expect([0, 0.5, 1].map((s) => voice("chipmunk", s).pitchCents)).toEqual([700, 950, 1200]);
  for (const id of ["deep", "high", "chipmunk"] as const) expect({ ...voice(id, 0.5), pitchCents: 0 }).toEqual(NEUTRAL);
});

test("Robot: a 12 ms feedback delay, a slight pitch drop and a little distortion", () => {
  expect(voice("robot", 0)).toEqual({ ...NEUTRAL, pitchCents: -100, delayTime: 0.012, delayFeedback: 55, delayWet: 35, delayLowPass: 8000, distortionPreset: "speechCosmicInterference", distortionWet: 8, distortionPreGain: -6 });
  expect(voice("robot", 0.5)).toEqual({ ...NEUTRAL, pitchCents: -200, delayTime: 0.012, delayFeedback: 70, delayWet: 52.5, delayLowPass: 8000, distortionPreset: "speechCosmicInterference", distortionWet: 19, distortionPreGain: -6 });
  expect(voice("robot", 1)).toEqual({ ...NEUTRAL, pitchCents: -300, delayTime: 0.012, delayFeedback: 85, delayWet: 70, delayLowPass: 8000, distortionPreset: "speechCosmicInterference", distortionWet: 30, distortionPreGain: -6 });
});

test("Echo and Hall", () => {
  expect(voice("echo", 0)).toEqual({ ...NEUTRAL, delayTime: 0.22, delayFeedback: 25, delayWet: 20, delayLowPass: 6000 });
  expect(voice("echo", 0.5)).toEqual({ ...NEUTRAL, delayTime: 0.3, delayFeedback: 40, delayWet: 35, delayLowPass: 6000 });
  expect(voice("echo", 1)).toEqual({ ...NEUTRAL, delayTime: 0.38, delayFeedback: 55, delayWet: 50, delayLowPass: 6000 });
  expect([0, 0.5, 1].map((s) => voice("hall", s))).toEqual([15, 37.5, 60].map((reverbWet) => ({ ...NEUTRAL, reverbPreset: "largeHall", reverbWet })));
});

test("Telephone is three bands that close in with the strength", () => {
  const bands = (s: number) => voice("telephone", s).bands;
  expect(bands(0)).toEqual([{ type: "highPass", frequency: 200, gain: 0, bandwidth: 1 }, { type: "lowPass", frequency: 5000, gain: 0, bandwidth: 1 }, { type: "parametric", frequency: 1800, gain: 2, bandwidth: 1 }]);
  expect(bands(0.5)).toEqual([{ type: "highPass", frequency: 350, gain: 0, bandwidth: 1 }, { type: "lowPass", frequency: 3800, gain: 0, bandwidth: 1 }, { type: "parametric", frequency: 1800, gain: 5, bandwidth: 1 }]);
  expect(bands(1)).toEqual([{ type: "highPass", frequency: 500, gain: 0, bandwidth: 1 }, { type: "lowPass", frequency: 2600, gain: 0, bandwidth: 1 }, { type: "parametric", frequency: 1800, gain: 8, bandwidth: 1 }]);
  expect({ ...voice("telephone", 0.5), bands: [] }).toEqual(NEUTRAL);
});

test("the Pitch slider adds whole semitones to the voice's own pitch, inside the unit's range", () => {
  expect(soundChain(set({ pitch: -3 })).pitchCents).toBe(-300);
  expect(soundChain(set({ voice: "deep", strength: 0.5, pitch: 2 })).pitchCents).toBe(-250);
  expect(soundChain(set({ voice: "chipmunk", strength: 1, pitch: 12 })).pitchCents).toBe(PITCH_CENTS_LIMIT);
  expect(soundChain(set({ voice: "deep", strength: 1, pitch: -12 })).pitchCents).toBe(-1900);
  expect(PITCH_CENTS_LIMIT).toBe(2400);
});

test("the equaliser presets are band tables; a voice's own bands come first", () => {
  expect(soundChain(set({ eq: "bassBoost" })).bands).toEqual([{ type: "lowShelf", frequency: 110, gain: 6, bandwidth: 1 }, { type: "parametric", frequency: 250, gain: -1.5, bandwidth: 1 }]);
  expect(soundChain(set({ eq: "clearVoice" })).bands).toEqual([{ type: "highPass", frequency: 90, gain: 0, bandwidth: 1 }, { type: "parametric", frequency: 300, gain: -3, bandwidth: 1 },
    { type: "parametric", frequency: 3200, gain: 4, bandwidth: 1.2 }, { type: "highShelf", frequency: 9000, gain: 2, bandwidth: 1 }]);
  expect(soundChain(set({ eq: "warm" })).bands).toEqual([{ type: "lowShelf", frequency: 200, gain: 3, bandwidth: 1 }, { type: "parametric", frequency: 3500, gain: -2, bandwidth: 1.5 }, { type: "highShelf", frequency: 8000, gain: -3, bandwidth: 1 }]);
  expect(soundChain(set({ eq: "bright" })).bands).toEqual([{ type: "parametric", frequency: 3000, gain: 2, bandwidth: 1 }, { type: "highShelf", frequency: 6500, gain: 5, bandwidth: 1 }]);
  const both = soundChain(set({ voice: "telephone", strength: 0.5, eq: "warm" })).bands;
  expect(both.map((b) => b.type)).toEqual(["highPass", "lowPass", "parametric", "lowShelf", "parametric", "highShelf"]);
  // A fresh array every time: a caller may not change the table through it.
  expect(soundChain(set({ eq: "warm" })).bands).not.toBe(soundChain(set({ eq: "warm" })).bands);
});

test("everything a chain may name is a name the native side knows; every number is finite", () => {
  expect(BAND_TYPES).toEqual(["parametric", "lowShelf", "highShelf", "highPass", "lowPass"]);
  expect(REVERB_PRESETS).toHaveLength(14);
  expect(DISTORTION_PRESETS).toHaveLength(22);
  for (const id of VOICE_IDS) for (const s of [0, 0.25, 0.5, 1]) {
    const c = voice(id, s);
    expect(c.reverbPreset === "" || REVERB_PRESETS.includes(c.reverbPreset)).toBe(true);
    expect(c.distortionPreset === "" || DISTORTION_PRESETS.includes(c.distortionPreset)).toBe(true);
    for (const b of c.bands) { expect(BAND_TYPES).toContain(b.type); expect([b.frequency, b.gain, b.bandwidth].every(Number.isFinite)).toBe(true); }
    for (const n of [c.pitchCents, c.distortionWet, c.distortionPreGain, c.delayTime, c.delayFeedback, c.delayWet, c.delayLowPass, c.reverbWet]) expect(Number.isFinite(n)).toBe(true);
    expect(c.delayTime).toBeLessThanOrEqual(2);
  }
});

test("soundFileName: the source's name and the setting, nothing else", () => {
  expect(SOUND_VERSION).toBe(1);
  expect(soundFileName("file:///doc/projects/p1/media/abc.mov", { voice: "deep", strength: 0.5, pitch: -3, eq: "warm", level: true })).toBe("abc-v1-deep-s50-pm3-warm-l1.m4a");
  expect(soundFileName("file:///x/abc.m4a", set({ pitch: 2 }))).toBe("abc-v1-plain-s0-p2-flat-l0.m4a");
  expect(soundFileName("file:///x/abc.m4a", set({ pitch: 2, strength: 0.9 }))).toBe("abc-v1-plain-s0-p2-flat-l0.m4a");   // strength without a voice does not count
  expect(soundFileName("file:///x/my song (1).mp3", set({ level: true }))).toBe("my_song__1_-v1-plain-s0-p0-flat-l1.m4a");
  expect(soundFileName("file:///x/abc.m4a", set({ voice: "echo", strength: 0.33 }))).toBe("abc-v1-echo-s33-p0-flat-l0.m4a");
  expect(soundFileName("file:///x/a.m4a", set({ voice: "echo" }))).not.toBe(soundFileName("file:///x/b.m4a", set({ voice: "echo" })));
});

test("neededSounds: one entry per different copy the project plays; none for a track as recorded or a missing file", () => {
  const deep = set({ voice: "deep" });
  const p = makeProject({ audioTracks: [
    makeAudioTrack({ id: "plain", sourceDuration: 5 }),
    { ...makeAudioTrack({ id: "a", sourceDuration: 5, sourceUri: "file:///m/v.m4a" }), sound: deep },
    { ...makeAudioTrack({ id: "b", sourceDuration: 5, sourceUri: "file:///m/v.m4a", start: 5 }), sound: deep },        // the other half of a split: the same copy
    { ...makeAudioTrack({ id: "c", sourceDuration: 5, sourceUri: "file:///m/v.m4a" }), sound: set({ voice: "high" }) },
    { ...makeAudioTrack({ id: "gone", sourceDuration: 5, sourceUri: "file:///m/gone.m4a" }), sound: deep },
  ] });
  expect(neededSounds(p, ["file:///m/gone.m4a"])).toEqual([
    { name: "v-v1-deep-s50-p0-flat-l0.m4a", sourceUri: "file:///m/v.m4a", sound: deep },
    { name: "v-v1-high-s50-p0-flat-l0.m4a", sourceUri: "file:///m/v.m4a", sound: set({ voice: "high" }) },
  ]);
  expect(neededSounds(p).map((n) => n.name)).toContain("gone-v1-deep-s50-p0-flat-l0.m4a");
  expect(neededSounds(makeProject())).toEqual([]);
});
```

- [ ] **Step 2: Run** `npx.cmd jest src/editor/model/__tests__/soundMath.test.ts src/editor/model/__tests__/sound.test.ts` → FAIL (modules missing).
- [ ] **Step 3: Implement.**

Create `src/editor/model/soundMath.ts`:

```ts
/**
 * The sample maths of a sound render. Twin: modules/clipy-video/ios/SoundMath.swift — keep the constants and formulas identical
 * (guarded by __tests__/soundMath.parity.test.ts). The app never runs this on samples; it is here so the numbers are tested.
 */
/** Even out loudness: the RMS level a sound is brought to, the level under which a block counts as silence, and how far the gain may go. */
export const LEVEL = { targetDb: -18, gateDb: -45, maxBoostDb: 18, maxCutDb: 6, blockSeconds: 0.4 } as const;
/** The peak guard: samples up to `knee` pass unchanged, louder ones bend towards `ceiling` and never pass it. */
export const SOFT_CLIP = { knee: 0.9, ceiling: 0.98 } as const;

export const dbToGain = (db: number): number => (Number.isFinite(db) ? Math.pow(10, db / 20) : 1);

/**
 * The gain in dB that brings a sound to LEVEL.targetDb. `blocks` = the mean square of each LEVEL.blockSeconds of the mono mix.
 * Blocks that are not a number or not above the gate are left out; none left → 0 (silence is not boosted).
 */
export function levelGainDb(blocks: readonly number[]): number {
  const gate = Math.pow(10, LEVEL.gateDb / 10);
  let sum = 0, count = 0;
  for (const b of blocks) if (Number.isFinite(b) && b > gate) { sum += b; count += 1; }
  if (count === 0) return 0;
  const measured = 10 * Math.log10(sum / count);
  return Math.min(LEVEL.maxBoostDb, Math.max(-LEVEL.maxCutDb, LEVEL.targetDb - measured));
}

/** One sample through the peak guard. Not a number → 0. */
export function softClip(x: number): number {
  if (!Number.isFinite(x)) return 0;
  const a = Math.abs(x);
  if (a <= SOFT_CLIP.knee) return x;
  const room = SOFT_CLIP.ceiling - SOFT_CLIP.knee;
  const y = SOFT_CLIP.knee + room * Math.tanh((a - SOFT_CLIP.knee) / room);
  return x < 0 ? -y : y;
}
```

Create `src/editor/model/sound.ts`:

```ts
import type { EqId, Project, SoundSettings, VoiceId } from "./types";

/**
 * What a sound setting MEANS, as numbers for the native units. TypeScript only: the render request carries these numbers and the
 * Swift side only sets them (SoundRender.swift), so a voice is tuned here, without a native build. Raise SOUND_VERSION when a
 * table changes: copies rendered from the old numbers are then no longer used.
 */
export const SOUND_VERSION = 1;

/** The equaliser filter kinds a chain may name (`SoundRender.filterTypes` has exactly these keys). */
export const BAND_TYPES = ["parametric", "lowShelf", "highShelf", "highPass", "lowPass"] as const;
export type BandType = (typeof BAND_TYPES)[number];
/** AVAudioUnitReverbPreset case names (`SoundRender.reverbPresets` has exactly these keys). */
export const REVERB_PRESETS: readonly string[] = ["smallRoom", "mediumRoom", "largeRoom", "mediumHall", "largeHall", "plate", "mediumChamber", "largeChamber",
  "cathedral", "largeRoom2", "mediumHall2", "mediumHall3", "largeHall2", "outdoorGeneral"];
/** AVAudioUnitDistortionPreset case names (`SoundRender.distortionPresets` has exactly these keys). */
export const DISTORTION_PRESETS: readonly string[] = ["drumsBitBrush", "drumsBufferBeats", "drumsLoFi", "multiBrokenSpeaker", "multiCellphoneConcert", "multiDecimated1", "multiDecimated2",
  "multiDecimated3", "multiDecimated4", "multiDistortedFunk", "multiDistortedCubed", "multiDistortedSquared", "multiEcho1", "multiEcho2", "multiEchoTight1", "multiEchoTight2",
  "multiEverythingIsBroken", "speechAlienChatter", "speechCosmicInterference", "speechGoldenPi", "speechRadioTower", "speechWaves"];

/** One equaliser band: Hz, dB, octaves (a shelf and a pass filter ignore the bandwidth). */
export interface SoundBand { type: BandType; frequency: number; gain: number; bandwidth: number }
/**
 * The units of one render and their values. A unit is left out when its switch is off: pitch 0, a wet mix of 0 or an empty preset
 * name, no bands. `level` = Even out loudness (measured inside the render).
 */
export interface SoundChain {
  pitchCents: number;
  distortionPreset: string; distortionWet: number; distortionPreGain: number;
  delayTime: number; delayFeedback: number; delayWet: number; delayLowPass: number;
  reverbPreset: string; reverbWet: number;
  bands: SoundBand[];
  level: boolean;
}
/** AVAudioUnitTimePitch.pitch runs −2400 … 2400 cents. */
export const PITCH_CENTS_LIMIT = 2400;

/** `[at strength 0, at strength 1]`; in between is a straight line. */
type Range = readonly [number, number];
interface VoiceRow {
  pitch: Range;                                                                          // cents
  distortion?: { preset: string; wet: Range; preGain: number };                          // %, dB
  delay?: { time: Range; feedback: Range; wet: Range; lowPass: number };                 // s, %, %, Hz
  reverb?: { preset: string; wet: Range };                                               // %
  bands?: readonly { type: BandType; frequency: Range; gain: Range; bandwidth: number }[];
}
const STILL: Range = [0, 0];
export const VOICE_TABLE: Record<VoiceId, VoiceRow> = {
  deep: { pitch: [-200, -700] },
  high: { pitch: [200, 600] },
  chipmunk: { pitch: [700, 1200] },
  // No vocoder: a 12 ms feedback delay rings like metal, with a slight drop in pitch and a little of Apple's speech distortion.
  robot: { pitch: [-100, -300], delay: { time: [0.012, 0.012], feedback: [55, 85], wet: [35, 70], lowPass: 8000 }, distortion: { preset: "speechCosmicInterference", wet: [8, 30], preGain: -6 } },
  echo: { pitch: STILL, delay: { time: [0.22, 0.38], feedback: [25, 55], wet: [20, 50], lowPass: 6000 } },
  hall: { pitch: STILL, reverb: { preset: "largeHall", wet: [15, 60] } },
  telephone: { pitch: STILL, bands: [
    { type: "highPass", frequency: [200, 500], gain: STILL, bandwidth: 1 },
    { type: "lowPass", frequency: [5000, 2600], gain: STILL, bandwidth: 1 },
    { type: "parametric", frequency: [1800, 1800], gain: [2, 8], bandwidth: 1 },
  ] },
};
export const EQ_TABLE: Record<EqId, readonly SoundBand[]> = {
  bassBoost: [{ type: "lowShelf", frequency: 110, gain: 6, bandwidth: 1 }, { type: "parametric", frequency: 250, gain: -1.5, bandwidth: 1 }],
  clearVoice: [{ type: "highPass", frequency: 90, gain: 0, bandwidth: 1 }, { type: "parametric", frequency: 300, gain: -3, bandwidth: 1 },
    { type: "parametric", frequency: 3200, gain: 4, bandwidth: 1.2 }, { type: "highShelf", frequency: 9000, gain: 2, bandwidth: 1 }],
  warm: [{ type: "lowShelf", frequency: 200, gain: 3, bandwidth: 1 }, { type: "parametric", frequency: 3500, gain: -2, bandwidth: 1.5 }, { type: "highShelf", frequency: 8000, gain: -3, bandwidth: 1 }],
  bright: [{ type: "parametric", frequency: 3000, gain: 2, bandwidth: 1 }, { type: "highShelf", frequency: 6500, gain: 5, bandwidth: 1 }],
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
/** The value of a range at strength `s`, to 3 decimals. */
const at = (r: Range, s: number): number => Math.round((r[0] + (r[1] - r[0]) * s) * 1000) / 1000;

/** The units and numbers of a setting. A setting that changes nothing gives a chain that switches every unit off. */
export function soundChain(s: SoundSettings): SoundChain {
  const row = s.voice ? VOICE_TABLE[s.voice] : null;
  const k = clamp(Number.isFinite(s.strength) ? s.strength : 0, 0, 1);
  const pitch = Number.isFinite(s.pitch) ? Math.round(s.pitch) : 0;
  const voiceBands: SoundBand[] = (row?.bands ?? []).map((b) => ({ type: b.type, frequency: at(b.frequency, k), gain: at(b.gain, k), bandwidth: b.bandwidth }));
  const eqBands: SoundBand[] = (s.eq ? EQ_TABLE[s.eq] : []).map((b) => ({ ...b }));
  return {
    pitchCents: clamp(Math.round(row ? at(row.pitch, k) : 0) + pitch * 100, -PITCH_CENTS_LIMIT, PITCH_CENTS_LIMIT) + 0,
    distortionPreset: row?.distortion?.preset ?? "", distortionWet: row?.distortion ? at(row.distortion.wet, k) : 0, distortionPreGain: row?.distortion?.preGain ?? -6,
    delayTime: row?.delay ? at(row.delay.time, k) : 0, delayFeedback: row?.delay ? at(row.delay.feedback, k) : 0, delayWet: row?.delay ? at(row.delay.wet, k) : 0, delayLowPass: row?.delay?.lowPass ?? 15000,
    reverbPreset: row?.reverb?.preset ?? "", reverbWet: row?.reverb ? at(row.reverb.wet, k) : 0,
    bands: [...voiceBands, ...eqBands],
    level: s.level === true,
  };
}

const stemOf = (uri: string): string => (uri.split("/").pop() ?? "").replace(/\.[A-Za-z0-9]+$/, "").replace(/[^A-Za-z0-9_-]/g, "_");
/**
 * The file a setting's copy of a source is kept in: the source's name and the setting, so the same pair is rendered once and found
 * again. Without a voice the strength does not count. Example: `abc-v1-deep-s50-pm3-warm-l1.m4a`.
 */
export function soundFileName(sourceUri: string, s: SoundSettings): string {
  const strength = s.voice ? Math.round(s.strength * 100) : 0;
  const pitch = `p${s.pitch < 0 ? "m" : ""}${Math.abs(Math.round(s.pitch))}`;
  return `${stemOf(sourceUri)}-v${SOUND_VERSION}-${s.voice ?? "plain"}-s${strength}-${pitch}-${s.eq ?? "flat"}-l${s.level ? 1 : 0}.m4a`;
}

/** One copy the project plays: its file name, the source it is rendered from and the setting. */
export interface NeededSound { name: string; sourceUri: string; sound: SoundSettings }
/** Every different copy the project's tracks need, in track order. A track as recorded needs none; a track whose file is missing is left out. */
export function neededSounds(p: Project, missing: readonly string[] = []): NeededSound[] {
  const out: NeededSound[] = [];
  for (const t of p.audioTracks) {
    if (!t.sound || missing.includes(t.sourceUri)) continue;
    const name = soundFileName(t.sourceUri, t.sound);
    if (!out.some((n) => n.name === name)) out.push({ name, sourceUri: t.sourceUri, sound: t.sound });
  }
  return out;
}
```

- [ ] **Step 4: Run** the two suites → PASS. Then `npm run typecheck` and `npm test`.
- [ ] **Step 5: Commit** — `feat(model): sound maths and the voice / equaliser tables (TypeScript only)`.

---

### Task 3: Ops: `setTrackSound`, `extractClipAudio`, refusals

**Depends on:** Task 1. **Parallel-safe with:** 2, 5.

**Files:** Modify `src/editor/model/ops.ts`. Create `src/editor/model/__tests__/ops.sound.test.ts`.

**Do not touch:** `types.ts`, `timeline.ts`, `audioMix.ts`, every component.

**Interfaces: Consumes** `clampSound`, `NO_SOUND`, `SoundSettings` (Task 1); `findItem`, `hasSpeedCurve`, `clipStartTimes` (timeline.ts, exist); `addAudioTrack`, `setClipMuted` (ops.ts, exist). **Produces**

```ts
export const EXTRACT_TITLE = "Clip sound";
export function setTrackSound(p: Project, trackId: string, patch: Partial<SoundSettings>): Project;
export type ExtractRefusal = "noSound" | "speed" | "limit";
export function extractRefusal(p: Project, clipId: string): ExtractRefusal | null;
export function extractedTrackOf(p: Project, clipId: string): AudioTrack | null;
export function extractClipAudio(p: Project, clipId: string, trackId: string): Project;
```

- [ ] **Step 1: Failing tests.** Create `src/editor/model/__tests__/ops.sound.test.ts`:

```ts
jest.mock("@/src/lib/id", () => ({ newId: jest.fn(() => "new-id") }));
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-07T10:00:00.000Z" }));
import { AUDIO_LIMITS, makeAudioTrack, makeClip, makeLayer, makePhotoClip, makeProject, type Project } from "../types";
import { curveSteps } from "../timeline";
import { duplicateAudioTrack, extractClipAudio, extractedTrackOf, extractRefusal, EXTRACT_TITLE, setTrackSound, splitAudioTrackAt } from "../ops";

const track = (p: Project, id: string) => p.audioTracks.find((t) => t.id === id)!;
const base = makeProject({
  clips: [makeClip({ id: "a", sourceDuration: 10, trimStart: 1, trimEnd: 5 }), makeClip({ id: "b", sourceDuration: 8, trimStart: 2, trimEnd: 6, volume: 1.5, fadeIn: 0.5, fadeOut: 1 }), makePhotoClip({ id: "ph" })],
  layers: [makeLayer({ id: "L", sourceDuration: 6, start: 3, trimStart: 1, trimEnd: 4 })],
  audioTracks: [makeAudioTrack({ id: "m", sourceDuration: 30 })],
});

describe("setTrackSound", () => {
  test("writes the field; a patch is merged into what is there; an unknown track is refused", () => {
    const one = setTrackSound(base, "m", { voice: "deep" });
    expect(track(one, "m").sound).toEqual({ voice: "deep", strength: 0.5, pitch: 0, eq: null, level: false });
    expect(one.updatedAt).toBe("2026-10-07T10:00:00.000Z");
    const two = setTrackSound(one, "m", { strength: 0.8, eq: "warm" });
    expect(track(two, "m").sound).toEqual({ voice: "deep", strength: 0.8, pitch: 0, eq: "warm", level: false });
    expect(setTrackSound(base, "nope", { voice: "deep" })).toBe(base);
    expect(base.audioTracks[0]).not.toHaveProperty("sound");               // the input is not mutated
  });

  test("values are clamped; a patch that changes nothing returns the same project", () => {
    const p = setTrackSound(base, "m", { voice: "echo", strength: 7, pitch: 40 });
    expect(track(p, "m").sound).toEqual({ voice: "echo", strength: 1, pitch: 12, eq: null, level: false });
    expect(setTrackSound(p, "m", { strength: 1 })).toBe(p);
    expect(setTrackSound(base, "m", { strength: 0.9 })).toBe(base);        // strength alone on a track as recorded: still as recorded
    expect(setTrackSound(base, "m", { pitch: NaN })).toBe(base);
  });

  test("back to nothing removes the key (never a neutral object, never undefined)", () => {
    const on = setTrackSound(base, "m", { pitch: 3 });
    const off = setTrackSound(on, "m", { pitch: 0 });
    expect("sound" in track(off, "m")).toBe(false);
    const level = setTrackSound(setTrackSound(base, "m", { level: true }), "m", { level: false });
    expect("sound" in track(level, "m")).toBe(false);
    const none = setTrackSound(setTrackSound(base, "m", { voice: "hall", strength: 0.9 }), "m", { voice: null });
    expect("sound" in track(none, "m")).toBe(false);
  });

  test("a split and a duplicate keep the setting on both", () => {
    const on = setTrackSound(base, "m", { voice: "hall" });
    const cut = splitAudioTrackAt(on, "m", 10, "m2");
    expect(track(cut, "m").sound).toEqual(track(on, "m").sound);
    expect(track(cut, "m2").sound).toEqual(track(on, "m").sound);
    const copy = duplicateAudioTrack(on, "m");
    expect(track(copy, "new-id").sound).toEqual(track(on, "m").sound);
  });
});

describe("extractClipAudio", () => {
  test("a main clip: a sound-effect bar on the same file, at the clip's place and range, with its volume and fades; the clip is muted", () => {
    const p = extractClipAudio(base, "b", "x");
    expect(track(p, "x")).toEqual({ id: "x", sourceUri: "file:///media/b.mp4", title: EXTRACT_TITLE, sourceDuration: 8, start: 4, trimStart: 2, trimEnd: 6, volume: 1.5, kind: "sfx", fadeIn: 0.5, fadeOut: 1 });
    expect("sound" in track(p, "x")).toBe(false);
    expect(p.clips[1].muted).toBe(true);
    expect(p.clips[0]).toBe(base.clips[0]);                                // nothing else is touched
    expect(p.audioTracks[0]).toBe(base.audioTracks[0]);
    expect(base.clips[1].muted).toBe(false);
  });

  test("the first clip starts at 0; a layer at its own start", () => {
    expect(track(extractClipAudio(base, "a", "x"), "x")).toMatchObject({ start: 0, trimStart: 1, trimEnd: 5 });
    const p = extractClipAudio(base, "L", "x");
    expect(track(p, "x")).toMatchObject({ sourceUri: "file:///media/L.mp4", start: 3, trimStart: 1, trimEnd: 4, kind: "sfx" });
    expect(p.layers[0].muted).toBe(true);
    expect(p.clips).toBe(base.clips);
  });

  test("an already muted clip is still extracted (it stays muted)", () => {
    const muted = { ...base, clips: [{ ...base.clips[0], muted: true }, base.clips[1], base.clips[2]] };
    const p = extractClipAudio(muted, "a", "x");
    expect(track(p, "x")).toMatchObject({ start: 0, volume: 1 });
    expect(p.clips[0].muted).toBe(true);
  });

  test("refusals: a photo, a reversed clip, a clip that is not at normal speed, the track limit, an id in use, an unknown clip", () => {
    expect(extractRefusal(base, "ph")).toBe("noSound");
    expect(extractRefusal(base, "nope")).toBe("noSound");
    const reversed = { ...base, clips: [{ ...base.clips[0], reversed: true }, base.clips[1], base.clips[2]] };
    expect(extractRefusal(reversed, "a")).toBe("noSound");
    const fast = { ...base, clips: [{ ...base.clips[0], speed: 2 }, base.clips[1], base.clips[2]] };
    expect(extractRefusal(fast, "a")).toBe("speed");
    const curved = { ...base, clips: [{ ...base.clips[0], speedCurve: { id: "hero" as const, steps: curveSteps("hero", 1, 5) } }, base.clips[1], base.clips[2]] };
    expect(extractRefusal(curved, "a")).toBe("speed");
    const full = { ...base, audioTracks: Array.from({ length: AUDIO_LIMITS.maxTracks }, (_, i) => makeAudioTrack({ id: `t${i}`, sourceDuration: 5 })) };
    expect(extractRefusal(full, "a")).toBe("limit");
    expect(extractRefusal(base, "a")).toBeNull();
    for (const [p, id] of [[base, "ph"], [reversed, "a"], [fast, "a"], [curved, "a"], [full, "a"], [base, "nope"]] as const) expect(extractClipAudio(p, id, "x")).toBe(p);
    expect(extractClipAudio(base, "a", "m")).toBe(base);                   // the id is a track's already
  });

  test("twice: the bar that holds the clip's sound is found, and a second one is not made", () => {
    const once = extractClipAudio(base, "a", "x");
    expect(extractedTrackOf(base, "a")).toBeNull();
    expect(extractedTrackOf(once, "a")?.id).toBe("x");
    expect(extractClipAudio(once, "a", "y")).toBe(once);
    // Another clip of the same file whose range does not overlap is its own sound.
    const twoPieces = { ...once, clips: [once.clips[0], { ...once.clips[1], sourceUri: once.clips[0].sourceUri, trimStart: 5, trimEnd: 9 }, once.clips[2]] };
    expect(extractedTrackOf(twoPieces, "b")).toBeNull();
    expect(extractedTrackOf(once, "ph")).toBeNull();
  });
});
```

- [ ] **Step 2: Run** `npx.cmd jest src/editor/model/__tests__/ops.sound.test.ts` → FAIL (missing exports).
- [ ] **Step 3: Implement** in `src/editor/model/ops.ts`.

1. In the `./timeline` import on line 3 add `clipStartTimes` and `hasSpeedCurve`. In the `./types` import add `clampSound`, `NO_SOUND` and `type SoundSettings`.
2. After `splitAudioTrackAt` (before the doc comment of `setClipFade`) insert:

```ts
/**
 * Changes how the track `id` sounds (the Voice and Sound tools): the patch is merged into its setting — or into none — and clamped
 * (`clampSound`). A setting that changes nothing REMOVES the key: a track as recorded has no `sound`. Same project for an unknown
 * track and when nothing changes. Nothing is rendered here; the editor renders the copy the setting needs (soundRenders.ts).
 */
export function setTrackSound(p: Project, trackId: string, patch: Partial<SoundSettings>): Project {
  const i = p.audioTracks.findIndex((t) => t.id === trackId);
  if (i < 0) return p;
  const cur = p.audioTracks[i];
  const sound = clampSound({ ...(cur.sound ?? NO_SOUND), ...patch });
  if (sameJson(sound, cur.sound ?? null)) return p;
  const next: AudioTrack = { ...cur };
  delete next.sound;
  if (sound) next.sound = sound;
  const audioTracks = p.audioTracks.slice(); audioTracks[i] = next;
  return touch(p, { audioTracks });
}

/** The title of a bar made by Extract audio. */
export const EXTRACT_TITLE = "Clip sound";
/** Why a clip's sound cannot be put on the audio row: it has none (a photo, a reversed clip, no such clip), it is not at normal speed (a sound bar has no speed), or the project has every track it may have. */
export type ExtractRefusal = "noSound" | "speed" | "limit";
export function extractRefusal(p: Project, clipId: string): ExtractRefusal | null {
  const item = findItem(p, clipId);
  if (!item || isPhoto(item.clip) || item.clip.reversed) return "noSound";
  if (item.clip.speed !== 1 || hasSpeedCurve(item.clip)) return "speed";
  if (p.audioTracks.length >= AUDIO_LIMITS.maxTracks) return "limit";
  return null;
}
/** The audio track that already holds this clip's sound: one on the clip's own file whose source range overlaps the clip's. Null when there is none. */
export function extractedTrackOf(p: Project, clipId: string): AudioTrack | null {
  const item = findItem(p, clipId);
  if (!item || isPhoto(item.clip)) return null;
  const c = item.clip;
  return p.audioTracks.find((t) => t.sourceUri === c.sourceUri && t.trimStart < c.trimEnd && c.trimStart < t.trimEnd) ?? null;
}
/**
 * Extract audio: the clip's (or layer's) own sound becomes an audio track `trackId` — a sound effect (the one kind that neither ducks
 * the music nor is ducked, so the mix stays what it was) on the clip's OWN file, at the clip's place on the timeline, with its source
 * range, volume and fades — and the clip is muted. One project out: one undo step. Refused (same project) where `extractRefusal`
 * says so, when the sound is already on the audio row (`extractedTrackOf`) and when `trackId` is taken.
 */
export function extractClipAudio(p: Project, clipId: string, trackId: string): Project {
  if (extractRefusal(p, clipId) !== null || extractedTrackOf(p, clipId) !== null) return p;
  const item = findItem(p, clipId);
  if (!item) return p;
  const c = item.clip;
  const start = item.layer ? (c as LayerClip).start : clipStartTimes(p)[p.clips.findIndex((x) => x.id === c.id)];
  const added = addAudioTrack(p, { id: trackId, sourceUri: c.sourceUri, title: EXTRACT_TITLE, sourceDuration: c.sourceDuration, start, trimStart: c.trimStart, trimEnd: c.trimEnd,
    volume: c.volume, kind: "sfx", fadeIn: c.fadeIn, fadeOut: c.fadeOut });
  if (added === p) return p;
  return setClipMuted(added, clipId, true);   // an already muted clip: unchanged, and `added` is still one project out
}
```

`sameJson`, `touch`, `findItem`, `isPhoto`, `AUDIO_LIMITS` and `LayerClip` are already in scope in `ops.ts` (`sameJson` is a `const` declared further down the file; it is only called at run time, which is fine).

- [ ] **Step 4: Run** the suite → PASS; `npx.cmd jest src/editor/model/__tests__/ops.audio.test.ts` still passes unedited. Then `npm run typecheck` and `npm test`.
- [ ] **Step 5: Commit** — `feat(model): setTrackSound and Extract audio (a clip's sound as its own bar, the clip muted)`.

---

### Task 4: The native wrapper (`index.ts`)

**Depends on:** Task 2. **Parallel-safe with:** 3, 6.

**Files:** Modify `modules/clipy-video/index.ts`, `modules/clipy-video/__tests__/index.test.ts` (append; and add the new functions to its `expo-modules-core` mock's `native` object).

**Do not touch:** every `to*` export builder in `index.ts`, anything under `ios/`.

**Interfaces: Consumes** `SoundChain` (Task 2). **Produces**

```ts
export interface SoundRenderRequest extends SoundChain { jobId: string; sourceUri: string; outputPath: string }
export interface SoundRenderResult { fileUri: string; seconds: number; gainDb: number }
export type SoundEvent = { jobId: string; progress: number };
export interface SoundInfo { hasSound: boolean; seconds: number }
export interface NoiseProbe { ok: boolean; stage: string; detail: string }
export const SOUND_CANCELLED = "E_SOUND_CANCELLED";
export function isSoundAvailable(): boolean;
export function renderSound(req: SoundRenderRequest): Promise<SoundRenderResult>;
export function cancelSoundRender(jobId: string): void;
export function addSoundListener(cb: (e: SoundEvent) => void): EventSubscription;
export function soundInfo(uri: string): Promise<SoundInfo>;
export function probeNoiseReduction(uri: string): Promise<NoiseProbe>;
export function isSoundCancelled(e: unknown): boolean;
```

- [ ] **Step 1: Failing tests.** In `modules/clipy-video/__tests__/index.test.ts`, add to the `native` object of the top mock: `renderSound: jest.fn(async () => ({ fileUri: "file:///out.m4a", seconds: 3, gainDb: 0 })), cancelSoundRender: jest.fn(), soundInfo: jest.fn(async () => ({ hasSound: true, seconds: 3 })), probeNoiseReduction: jest.fn(async () => ({ ok: true, stage: "render", detail: "frames 1" })),` and add the new names to the `../index` import. Append:

```ts
describe("sound API", () => {
  const request = { jobId: "j", sourceUri: "file:///m/a.m4a", outputPath: "file:///s/a.m4a", pitchCents: -300, distortionPreset: "", distortionWet: 0, distortionPreGain: -6,
    delayTime: 0, delayFeedback: 0, delayWet: 0, delayLowPass: 15000, reverbPreset: "", reverbWet: 0, bands: [], level: false };

  it("isSoundAvailable: only when the linked module has the render function (not in Expo Go, not in a build from before it)", () => {
    expect(isSoundAvailable()).toBe(true);
    jest.mocked(requireOptionalNativeModule).mockReturnValueOnce(null);
    expect(isSoundAvailable()).toBe(false);
    jest.mocked(requireOptionalNativeModule).mockReturnValueOnce({ hello: () => "old build", exportTimeline: jest.fn() } as never);
    expect(isSoundAvailable()).toBe(false);
  });

  it("renderSound, cancelSoundRender, soundInfo and probeNoiseReduction forward to the native module", async () => {
    const native = { renderSound: jest.fn(async () => ({ fileUri: "file:///s/a.m4a", seconds: 2, gainDb: 3 })), cancelSoundRender: jest.fn(),
      soundInfo: jest.fn(async () => ({ hasSound: false, seconds: 9 })), probeNoiseReduction: jest.fn(async () => ({ ok: false, stage: "find", detail: "none" })) };
    jest.mocked(requireOptionalNativeModule).mockReturnValue(native as never);
    try {
      await expect(renderSound(request)).resolves.toEqual({ fileUri: "file:///s/a.m4a", seconds: 2, gainDb: 3 });
      expect(native.renderSound).toHaveBeenCalledWith(request);
      cancelSoundRender("j");
      expect(native.cancelSoundRender).toHaveBeenCalledWith("j");
      await expect(soundInfo("file:///m/a.mov")).resolves.toEqual({ hasSound: false, seconds: 9 });
      await expect(probeNoiseReduction("file:///m/a.m4a")).resolves.toEqual({ ok: false, stage: "find", detail: "none" });
    } finally { jest.mocked(requireOptionalNativeModule).mockReset(); }
  });

  it("addSoundListener listens to onSoundEvent", () => {
    const addListener = jest.fn(() => ({ remove: jest.fn() }));
    jest.mocked(requireOptionalNativeModule).mockReturnValueOnce({ addListener } as never);
    const cb = jest.fn();
    addSoundListener(cb);
    expect(addListener).toHaveBeenCalledWith("onSoundEvent", cb);
  });

  it("the sound functions throw the not-linked error without the module", () => {
    jest.mocked(requireOptionalNativeModule).mockReturnValue(null);
    try {
      expect(() => renderSound(request)).toThrow(/not linked/);
      expect(() => cancelSoundRender("j")).toThrow(/not linked/);
      expect(() => soundInfo("x")).toThrow(/not linked/);
    } finally { jest.mocked(requireOptionalNativeModule).mockReset(); }
  });

  it("isSoundCancelled recognises the native cancel code only", () => {
    expect(SOUND_CANCELLED).toBe("E_SOUND_CANCELLED");
    expect(isSoundCancelled(Object.assign(new Error("Sound cancelled"), { code: "E_SOUND_CANCELLED" }))).toBe(true);
    expect(isSoundCancelled(Object.assign(new Error("x"), { code: "E_SOUND" }))).toBe(false);
    expect(isSoundCancelled(new Error("Sound cancelled"))).toBe(false);
    expect(isSoundCancelled(null)).toBe(false);
  });
});
```

(`mockReset()` on `requireOptionalNativeModule` removes the top mock's implementation for the tests that follow in this file. This block is appended at the END of the file so nothing follows it. If a later task appends after it, re-install the implementation first.)

- [ ] **Step 2: Run** `npx.cmd jest modules/clipy-video/__tests__/index.test.ts` → FAIL.
- [ ] **Step 3: Implement** in `modules/clipy-video/index.ts`.

1. Add the import `import type { SoundChain } from "@/src/editor/model/sound";`.
2. After `export interface TranscriptSegment …` insert:

```ts
/** One render: the units' numbers (`soundChain` in src/editor/model/sound.ts), the file to read and the file to write. `jobId` is the caller's, so a render can be cancelled before it answers. */
export interface SoundRenderRequest extends SoundChain { jobId: string; sourceUri: string; outputPath: string }
/** `seconds` = the length of the copy (the source's); `gainDb` = what Even out loudness applied (0 when it is off). */
export interface SoundRenderResult { fileUri: string; seconds: number; gainDb: number }
export type SoundEvent = { jobId: string; progress: number };
export interface SoundInfo { hasSound: boolean; seconds: number }
/** The answer of the noise-reduction test: whether Apple's sound isolation unit rendered a saved recording, the stage it reached and what it reported. */
export interface NoiseProbe { ok: boolean; stage: string; detail: string }
/** The code a cancelled render rejects with. */
export const SOUND_CANCELLED = "E_SOUND_CANCELLED";
```

3. Extend the `ClipyVideoNative` type: change the `addListener` line and add four members:

```ts
  addListener(eventName: "onExportEvent", listener: (e: ExportEvent) => void): EventSubscription;
  addListener(eventName: "onSoundEvent", listener: (e: SoundEvent) => void): EventSubscription;
  renderSound(req: SoundRenderRequest): Promise<SoundRenderResult>;
  cancelSoundRender(jobId: string): void;
  soundInfo(uri: string): Promise<SoundInfo>;
  probeNoiseReduction(uri: string): Promise<NoiseProbe>;
```

4. At the end of the file append:

```ts
/** Whether the linked native module can render sound: false in Expo Go and in a build made before the sound tools. */
export function isSoundAvailable(): boolean { return typeof optional()?.renderSound === "function"; }
export function renderSound(req: SoundRenderRequest): Promise<SoundRenderResult> { return native().renderSound(req); }
export function cancelSoundRender(jobId: string): void { native().cancelSoundRender(jobId); }
export function addSoundListener(cb: (e: SoundEvent) => void): EventSubscription { return native().addListener("onSoundEvent", cb); }
export function soundInfo(uri: string): Promise<SoundInfo> { return native().soundInfo(uri); }
export function probeNoiseReduction(uri: string): Promise<NoiseProbe> { return native().probeNoiseReduction(uri); }
/** True for the rejection of a render that was cancelled (`cancelSoundRender`). */
export function isSoundCancelled(e: unknown): boolean { return typeof e === "object" && e !== null && (e as { code?: unknown }).code === SOUND_CANCELLED; }
```

- [ ] **Step 4: Run** the suite → PASS. Then `npm run typecheck` and `npm test`.
- [ ] **Step 5: Commit** — `feat(native): the wrapper's sound functions — render, cancel, info, the noise probe`.

---

### Task 5: Swift: `SoundMath.swift` and its parity test

**Depends on:** Task 1 (and spec §7; it does not import Task 2's file, the parity test does, so **land after Task 2 or keep the parity test red until it has**). **Parallel-safe with:** 2, 3.

**Files:** Create `modules/clipy-video/ios/SoundMath.swift`, `src/editor/model/__tests__/soundMath.parity.test.ts`.

**Do not touch:** every other Swift file.

**Interfaces: Produces** (Swift) `enum SoundMath { static let levelTargetDb, levelGateDb, levelMaxBoostDb, levelMaxCutDb, levelBlockSeconds, clipKnee, clipCeiling: Double; static func dbToGain(_ db: Double) -> Double; static func levelGainDb(_ blocks: [Double]) -> Double; static func softClip(_ x: Double) -> Double }`.

- [ ] **Step 1: Failing test.** Create `src/editor/model/__tests__/soundMath.parity.test.ts`:

```ts
import { readFileSync } from "fs";
import { join } from "path";
import { LEVEL, SOFT_CLIP } from "../soundMath";

const swift = readFileSync(join(__dirname, "../../../../modules/clipy-video/ios/SoundMath.swift"), "utf8").replace(/\r\n/g, "\n");
/** Swift source without its comments, so a name in a comment never satisfies a check. */
const code = swift.replace(/\/\/[^\n]*/g, "");
const fnBody = (name: string) => {
  const start = code.indexOf(`static func ${name}(`);
  if (start < 0) throw new Error(`${name} not found`);
  return code.slice(start, code.indexOf("\n  }\n", start));
};

test("SoundMath.swift declares the constants of soundMath.ts with the same values", () => {
  const constants = Object.fromEntries([...code.matchAll(/static let (\w+): Double = (-?[0-9.]+)/g)].map((m) => [m[1], Number(m[2])]));
  expect(constants).toEqual({
    levelTargetDb: LEVEL.targetDb, levelGateDb: LEVEL.gateDb, levelMaxBoostDb: LEVEL.maxBoostDb, levelMaxCutDb: LEVEL.maxCutDb, levelBlockSeconds: LEVEL.blockSeconds,
    clipKnee: SOFT_CLIP.knee, clipCeiling: SOFT_CLIP.ceiling,
  });
  // Every `static let` is one of those.
  expect([...code.matchAll(/static let (\w+)/g)].map((m) => m[1]).sort()).toEqual(Object.keys(constants).sort());
});

test("it mirrors the three functions, and is pure", () => {
  expect(code).toContain("static func dbToGain(_ db: Double) -> Double {");
  expect(code).toContain("static func levelGainDb(_ blocks: [Double]) -> Double {");
  expect(code).toContain("static func softClip(_ x: Double) -> Double {");
  // Swift rejects `static let x` next to `static func x(...)`.
  const values = [...code.matchAll(/static (?:let|var) (\w+)/g)].map((m) => m[1]);
  const funcs = [...code.matchAll(/static func (\w+)\(/g)].map((m) => m[1]);
  expect(values.filter((n) => funcs.includes(n))).toEqual([]);
  expect(new Set(funcs).size).toBe(funcs.length);
  expect(code).not.toMatch(/import (AVFoundation|AVFAudio|CoreMedia)/);
  expect(code).toContain("import Foundation");
});

test("the formulas are the ones of soundMath.ts", () => {
  expect(fnBody("dbToGain")).toContain("db.isFinite ? pow(10, db / 20) : 1");
  const level = fnBody("levelGainDb");
  expect(level).toContain("let gate = pow(10, levelGateDb / 10)");
  expect(level).toContain("for b in blocks where b.isFinite && b > gate {");
  expect(level).toContain("guard count > 0 else { return 0 }");
  expect(level).toContain("let measured = 10 * log10(sum / count)");
  expect(level).toContain("return min(levelMaxBoostDb, max(-levelMaxCutDb, levelTargetDb - measured))");
  const clip = fnBody("softClip");
  expect(clip).toContain("guard x.isFinite else { return 0 }");
  expect(clip).toContain("if a <= clipKnee { return x }");
  expect(clip).toContain("let room = clipCeiling - clipKnee");
  expect(clip).toContain("let y = clipKnee + room * tanh((a - clipKnee) / room)");
  expect(clip).toContain("return x < 0 ? -y : y");
});
```

- [ ] **Step 2: Run** `npx.cmd jest src/editor/model/__tests__/soundMath.parity.test.ts` → FAIL (file missing).
- [ ] **Step 3: Implement.** Create `modules/clipy-video/ios/SoundMath.swift`:

```swift
import Foundation

/// The sample maths of a sound render, mirroring src/editor/model/soundMath.ts: keep the constants and formulas identical
/// (guarded by src/editor/model/__tests__/soundMath.parity.test.ts). Pure — no AVFoundation.
enum SoundMath {
  /// `LEVEL.targetDb`: the RMS level Even out loudness brings a sound to.
  static let levelTargetDb: Double = -18
  /// `LEVEL.gateDb`: a block at or under this level counts as silence and is not measured.
  static let levelGateDb: Double = -45
  /// `LEVEL.maxBoostDb` / `LEVEL.maxCutDb`: how far the gain may go, up and down.
  static let levelMaxBoostDb: Double = 18
  static let levelMaxCutDb: Double = 6
  /// `LEVEL.blockSeconds`: the length of one measured block.
  static let levelBlockSeconds: Double = 0.4
  /// `SOFT_CLIP`: samples up to the knee pass unchanged; louder ones bend towards the ceiling and never pass it.
  static let clipKnee: Double = 0.9
  static let clipCeiling: Double = 0.98

  /// Decibels as a factor; not a number → 1.
  static func dbToGain(_ db: Double) -> Double {
    return db.isFinite ? pow(10, db / 20) : 1
  }

  /// The gain in dB that brings a sound to `levelTargetDb`. `blocks` = the mean square of each block of the mono mix.
  /// Blocks that are not a number or not above the gate are left out; none left → 0 (silence is not boosted).
  static func levelGainDb(_ blocks: [Double]) -> Double {
    let gate = pow(10, levelGateDb / 10)
    var sum = 0.0
    var count = 0.0
    for b in blocks where b.isFinite && b > gate {
      sum += b
      count += 1
    }
    guard count > 0 else { return 0 }
    let measured = 10 * log10(sum / count)
    return min(levelMaxBoostDb, max(-levelMaxCutDb, levelTargetDb - measured))
  }

  /// One sample through the peak guard. Not a number → 0.
  static func softClip(_ x: Double) -> Double {
    guard x.isFinite else { return 0 }
    let a = abs(x)
    if a <= clipKnee { return x }
    let room = clipCeiling - clipKnee
    let y = clipKnee + room * tanh((a - clipKnee) / room)
    return x < 0 ? -y : y
  }
}
```

- [ ] **Step 4: Run** the parity suite → PASS (it needs `soundMath.ts` from Task 2). Then `npm run typecheck` and `npm test`.
- [ ] **Step 5: Commit** — `feat(native): SoundMath.swift, the twin of soundMath.ts (loudness gain, soft clip)`.

---

### Task 6: Swift: `SoundRender.swift`, the module functions, the silent-video skip

**Depends on:** Task 5. **Parallel-safe with:** 4, 7, 8 (it shares no file with them; the request's field names are fixed by this plan).

**Files:** Create `modules/clipy-video/ios/SoundRender.swift`, `src/editor/model/__tests__/soundRender.swift.test.ts`. Modify `modules/clipy-video/ios/ClipyVideoModule.swift`, `modules/clipy-video/ios/ExportSession.swift` (one `guard` in the audio-track loop only).

**Do not touch:** `AudioMix.swift`, every other Swift file, the frozen stretches named in `looks.frozen.test.ts`, `index.ts`.

**Interfaces: Consumes** `SoundMath` (Task 5), `ExportSession.describe`, `ExportSession.fileURL(from:)`. **Produces** the native functions `renderSound`, `cancelSoundRender`, `soundInfo`, `probeNoiseReduction` and the event `onSoundEvent`, with exactly the shapes of Task 4.

- [ ] **Step 1: Failing test.** Create `src/editor/model/__tests__/soundRender.swift.test.ts`:

```ts
import { readFileSync } from "fs";
import { join } from "path";
import { BAND_TYPES, DISTORTION_PRESETS, REVERB_PRESETS, soundChain } from "../sound";
import { NO_SOUND } from "../types";

const iosDir = join(__dirname, "../../../../modules/clipy-video/ios");
const read = (file: string) => readFileSync(join(iosDir, file), "utf8").replace(/\r\n/g, "\n");
const code = (source: string) => source.replace(/\/\/[^\n]*/g, "");
const render = code(read("SoundRender.swift"));
const moduleSwift = code(read("ClipyVideoModule.swift"));
const session = code(read("ExportSession.swift"));
const between = (source: string, from: string, to: string): string => {
  const start = source.indexOf(from);
  if (start < 0) throw new Error(`"${from}" not found`);
  const end = source.indexOf(to, start + from.length);
  return source.slice(start, end < 0 ? undefined : end);
};
const fields = (name: string) => [...between(render, `struct ${name}: Record {`, "\n}").matchAll(/@Field var (\w+)/g)].map((m) => m[1]);
const keysOf = (name: string) => [...between(render, `static let ${name}:`, "\n  ]").matchAll(/"(\w+)": \./g)].map((m) => m[1]);

test("the request record has exactly the fields the app sends, and a band exactly a band's", () => {
  const sent = Object.keys({ ...soundChain(NO_SOUND), jobId: "", sourceUri: "", outputPath: "" }).sort();
  expect(fields("SoundRenderRequest").sort()).toEqual(sent);
  expect(fields("SoundBand").sort()).toEqual(["bandwidth", "frequency", "gain", "type"]);
});

test("every name the app may send is a key of the Swift tables, and the tables hold nothing else", () => {
  expect(keysOf("reverbPresets").sort()).toEqual([...REVERB_PRESETS].sort());
  expect(keysOf("distortionPresets").sort()).toEqual([...DISTORTION_PRESETS].sort());
  expect(keysOf("filterTypes").sort()).toEqual([...BAND_TYPES].sort());
  // Each key maps to the case of the same name.
  for (const table of ["reverbPresets", "distortionPresets", "filterTypes"]) for (const m of between(render, `static let ${table}:`, "\n  ]").matchAll(/"(\w+)": \.(\w+)/g)) expect(m[2]).toBe(m[1]);
});

test("the source asset is held strongly for as long as its track is used", () => {
  const source = between(render, "final class SoundSource {", "\n}");
  expect(source).toContain("let asset: AVURLAsset");
  expect(source).toContain("let track: AVAssetTrack");
  expect(render).not.toMatch(/weak var asset|unowned/);
});

test("the render loop is synchronous and schedules with the completion-handler overload", () => {
  const process = between(render, "static func process(", "\n  }\n");
  expect(process.slice(0, process.indexOf("{"))).not.toContain("async");
  const calls = [...render.matchAll(/\.scheduleBuffer\(([^)]*)\)/g)].map((m) => m[1]);
  expect(calls.length).toBeGreaterThanOrEqual(2);
  for (const c of calls) expect(c).toMatch(/, completionHandler: nil$/);
  expect(render).not.toMatch(/await [\w.]*scheduleBuffer/);
  expect(between(render, "static func render(", "\n  }\n").split("{")[0]).not.toContain("async");
  expect(process).toContain("if job.isCancelled { throw SoundError.cancelled }");
  expect(process).toContain("try engine.enableManualRenderingMode(.offline, format: format, maximumFrameCount: maxFrames)");
  expect(process).toContain("SoundMath.softClip(");
});

test("every failure names its stage, and an Error is always described", () => {
  const messages = [...render.matchAll(/SoundError\.failed\("([^"]*)"/g)].map((m) => m[1]);
  expect(messages.length).toBeGreaterThanOrEqual(10);
  for (const m of messages) expect(m).toMatch(/^sound (open|reader|engine|output|render): /);
  // A `catch` that rethrows as a SoundError carries the description of what it caught.
  for (const m of render.matchAll(/catch \{ throw SoundError\.failed\(([^\n]*)\) \}/g)) expect(m[1]).toContain("ExportSession.describe(");
  expect(render).not.toContain("localizedDescription");
});

test("no type and no static name is declared twice", () => {
  const types = [...render.matchAll(/^(?:final class|struct|enum) (\w+)/gm)].map((m) => m[1]);
  expect(types.sort()).toEqual(["SoundBand", "SoundError", "SoundJob", "SoundProbe", "SoundReader", "SoundRender", "SoundRenderRequest", "SoundSource"]);
  const others = ["ExportSession.swift", "ClipyVideoModule.swift", "MediaPrePass.swift", "Transcriber.swift", "AudioMix.swift", "SoundMath.swift"].map((f) => code(read(f))).join("\n");
  for (const t of types) expect(others).not.toMatch(new RegExp(`(?:class|struct|enum) ${t}\\b`));
  for (const owner of ["SoundRender", "SoundProbe"]) {
    const body = between(render, `enum ${owner} {`, "\n}\n");
    const values = [...body.matchAll(/static (?:let|var) (\w+)/g)].map((m) => m[1]);
    const funcs = [...body.matchAll(/static func (\w+)\(/g)].map((m) => m[1]);
    expect(values.filter((n) => funcs.includes(n))).toEqual([]);
    expect(new Set(values).size).toBe(values.length);
    expect(new Set(funcs).size).toBe(funcs.length);
  }
});

test("the module registers the four functions and the event", () => {
  expect(moduleSwift).toContain('Events("onExportEvent", "onSoundEvent")');
  for (const name of ["renderSound", "soundInfo", "probeNoiseReduction"]) expect(moduleSwift).toContain(`AsyncFunction("${name}")`);
  expect(moduleSwift).toContain('Function("cancelSoundRender")');
  expect(moduleSwift).toContain('promise.reject("E_SOUND_CANCELLED", "Sound cancelled")');
  expect(moduleSwift).toContain('promise.reject("E_SOUND", SoundRender.message(error))');
  expect(moduleSwift).toContain('"sound info: " + ExportSession.describe(error)');
  // The export functions are still there.
  for (const name of ["exportTimeline", "transcribe"]) expect(moduleSwift).toContain(`AsyncFunction("${name}")`);
});

test("the export skips a video without sound that sits on the audio row, and still fails for any other file without sound", () => {
  const loop = between(session, "for audio in request.audioTracks {", "mixParams.append(params)");
  expect(loop).toContain("let pictures = (try? await audioAsset.loadTracks(withMediaType: .video)) ?? []");
  expect(loop).toContain("if !pictures.isEmpty { continue }");
  expect(loop).toContain('throw ExportError.sessionFailed("No sound in audio file \\(audio.sourceUri)")');
  expect(loop).toContain("sourceAssets.append(audioAsset)");
});
```

- [ ] **Step 2: Run** `npx.cmd jest src/editor/model/__tests__/soundRender.swift.test.ts` → FAIL (file missing).
- [ ] **Step 3: Implement.**

Create `modules/clipy-video/ios/SoundRender.swift`:

```swift
import AudioToolbox
import AVFoundation
import ExpoModulesCore

/// One equaliser band of a render request (`SoundBand` in src/editor/model/sound.ts): Hz, dB, octaves.
struct SoundBand: Record {
  @Field var type: String = "parametric"
  @Field var frequency: Double = 1000
  @Field var gain: Double = 0
  @Field var bandwidth: Double = 1
}

/// One render (`SoundRenderRequest` in modules/clipy-video/index.ts). The numbers come ready-made from the app
/// (`soundChain`): this side only sets them on the units. A unit is left out when its switch is off: pitch 0, a
/// wet mix of 0 or an unknown preset name, no bands.
struct SoundRenderRequest: Record {
  @Field var jobId: String = ""
  @Field var sourceUri: String = ""
  @Field var outputPath: String = ""
  @Field var pitchCents: Double = 0
  @Field var distortionPreset: String = ""
  @Field var distortionWet: Double = 0
  @Field var distortionPreGain: Double = -6
  @Field var delayTime: Double = 0
  @Field var delayFeedback: Double = 0
  @Field var delayWet: Double = 0
  @Field var delayLowPass: Double = 15000
  @Field var reverbPreset: String = ""
  @Field var reverbWet: Double = 0
  @Field var bands: [SoundBand] = []
  @Field var level: Bool = false
}

enum SoundError: Error, LocalizedError {
  case cancelled
  case failed(String)
  var errorDescription: String? {
    switch self {
    case .cancelled: return "Sound cancelled"
    case .failed(let text): return text
    }
  }
}

/// The cancel flag of one render. `cancel()` comes from the JS thread, the render loop reads it on its own thread.
final class SoundJob: @unchecked Sendable {
  private let lock = NSLock()
  private var stopped = false                      // guarded by `lock`

  func cancel() {
    lock.lock()
    stopped = true
    lock.unlock()
  }

  var isCancelled: Bool {
    lock.lock()
    defer { lock.unlock() }
    return stopped
  }
}

/// A started reader and its one output.
struct SoundReader {
  let reader: AVAssetReader
  let output: AVAssetReaderAudioMixOutput
}

/// The file a render reads: the asset, its first audio track and its length. The asset is a stored property on
/// purpose — `AVAssetTrack.asset` is weak, and the track is only usable while the asset lives.
final class SoundSource {
  let asset: AVURLAsset
  let track: AVAssetTrack
  let seconds: Double

  init(asset: AVURLAsset, track: AVAssetTrack, seconds: Double) {
    self.asset = asset
    self.track = track
    self.seconds = seconds
  }

  /// Opens an audio OR a video file and takes its first audio track (what the export takes too).
  static func open(_ uri: String) async throws -> SoundSource {
    guard let url = ExportSession.fileURL(from: uri) else { throw SoundError.failed("sound open: not a file: \(uri)") }
    let asset = AVURLAsset(url: url)
    let found: [AVAssetTrack]
    do { found = try await asset.loadTracks(withMediaType: .audio) }
    catch { throw SoundError.failed("sound open: " + ExportSession.describe(error)) }
    guard let track = found.first else { throw SoundError.failed("sound open: no sound in this file") }
    let length: CMTime
    do { length = try await asset.load(.duration) }
    catch { throw SoundError.failed("sound open: " + ExportSession.describe(error)) }
    let seconds = length.seconds
    guard seconds.isFinite, seconds > 0 else { throw SoundError.failed("sound open: the file has no length") }
    return SoundSource(asset: asset, track: track, seconds: seconds)
  }

  /// A reader that decodes the track to 44.1 kHz stereo 32-bit float, interleaved. `limit` = only the first seconds.
  func startReader(limit: Double?) throws -> SoundReader {
    let reader: AVAssetReader
    do { reader = try AVAssetReader(asset: asset) }
    catch { throw SoundError.failed("sound reader: " + ExportSession.describe(error)) }
    let output = AVAssetReaderAudioMixOutput(audioTracks: [track], audioSettings: SoundRender.pcmSettings)
    output.alwaysCopiesSampleData = false
    guard reader.canAdd(output) else { throw SoundError.failed("sound reader: the sound of this file cannot be read") }
    reader.add(output)
    if let limit, limit.isFinite, limit > 0 {
      reader.timeRange = CMTimeRange(start: .zero, duration: CMTime(seconds: limit, preferredTimescale: 600))
    }
    guard reader.startReading() else { throw SoundError.failed("sound reader: " + ExportSession.describe(reader.error)) }
    return SoundReader(reader: reader, output: output)
  }
}

/// Renders a source through the units a request names into an AAC file as long as the source, with AVAudioEngine in
/// offline manual rendering. Everything here is SYNCHRONOUS on purpose: in an async function `scheduleBuffer` would
/// resolve to its async overload, which waits for the buffer to be played — and nothing plays until the loop renders.
enum SoundRender {
  static let sampleRate: Double = 44_100
  static let maxFrames: AVAudioFrameCount = 4096
  static let bitRate: Int = 192_000
  /// How the reader hands the sound over (the engine's own format is the deinterleaved twin of this).
  static let pcmSettings: [String: Any] = [
    AVFormatIDKey: kAudioFormatLinearPCM, AVSampleRateKey: sampleRate, AVNumberOfChannelsKey: 2,
    AVLinearPCMBitDepthKey: 32, AVLinearPCMIsFloatKey: true, AVLinearPCMIsBigEndianKey: false, AVLinearPCMIsNonInterleaved: false,
  ]
  /// `REVERB_PRESETS` in src/editor/model/sound.ts: every AVAudioUnitReverbPreset by its case name.
  static let reverbPresets: [String: AVAudioUnitReverbPreset] = [
    "smallRoom": .smallRoom, "mediumRoom": .mediumRoom, "largeRoom": .largeRoom, "mediumHall": .mediumHall, "largeHall": .largeHall,
    "plate": .plate, "mediumChamber": .mediumChamber, "largeChamber": .largeChamber, "cathedral": .cathedral, "largeRoom2": .largeRoom2,
    "mediumHall2": .mediumHall2, "mediumHall3": .mediumHall3, "largeHall2": .largeHall2, "outdoorGeneral": .outdoorGeneral,
  ]
  /// `DISTORTION_PRESETS` in src/editor/model/sound.ts: every AVAudioUnitDistortionPreset by its case name.
  static let distortionPresets: [String: AVAudioUnitDistortionPreset] = [
    "drumsBitBrush": .drumsBitBrush, "drumsBufferBeats": .drumsBufferBeats, "drumsLoFi": .drumsLoFi,
    "multiBrokenSpeaker": .multiBrokenSpeaker, "multiCellphoneConcert": .multiCellphoneConcert, "multiDecimated1": .multiDecimated1,
    "multiDecimated2": .multiDecimated2, "multiDecimated3": .multiDecimated3, "multiDecimated4": .multiDecimated4,
    "multiDistortedFunk": .multiDistortedFunk, "multiDistortedCubed": .multiDistortedCubed, "multiDistortedSquared": .multiDistortedSquared,
    "multiEcho1": .multiEcho1, "multiEcho2": .multiEcho2, "multiEchoTight1": .multiEchoTight1, "multiEchoTight2": .multiEchoTight2,
    "multiEverythingIsBroken": .multiEverythingIsBroken, "speechAlienChatter": .speechAlienChatter,
    "speechCosmicInterference": .speechCosmicInterference, "speechGoldenPi": .speechGoldenPi, "speechRadioTower": .speechRadioTower,
    "speechWaves": .speechWaves,
  ]
  /// `BAND_TYPES` in src/editor/model/sound.ts.
  static let filterTypes: [String: AVAudioUnitEQFilterType] = [
    "parametric": .parametric, "lowShelf": .lowShelf, "highShelf": .highShelf, "highPass": .highPass, "lowPass": .lowPass,
  ]

  /// What a failure says to the app: a SoundError's own staged text, anything else described in full.
  static func message(_ error: Error) -> String {
    if let own = error as? SoundError, let text = own.errorDescription { return text }
    return "sound render: " + ExportSession.describe(error)
  }

  static func bounded(_ value: Double, _ low: Double, _ high: Double) -> Double {
    return min(high, max(low, value))
  }

  /// One decoded sample buffer (interleaved 32-bit float, one or more channels) as a stereo engine buffer. Nil when
  /// it is not what the reader was asked for.
  static func pcmBuffer(from sample: CMSampleBuffer, format: AVAudioFormat) -> AVAudioPCMBuffer? {
    let frames = CMSampleBufferGetNumSamples(sample)
    guard frames > 0,
          let description = CMSampleBufferGetFormatDescription(sample),
          let stream = CMAudioFormatDescriptionGetStreamBasicDescription(description),
          let block = CMSampleBufferGetDataBuffer(sample),
          let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: AVAudioFrameCount(frames)),
          let channels = buffer.floatChannelData else { return nil }
    let width = Int(stream.pointee.mChannelsPerFrame)
    let isFloat = stream.pointee.mFormatFlags & kAudioFormatFlagIsFloat != 0
    let count = frames * width
    let byteCount = count * MemoryLayout<Float>.size
    guard width >= 1, isFloat, stream.pointee.mBitsPerChannel == 32, CMBlockBufferGetDataLength(block) >= byteCount else { return nil }
    var interleaved = [Float](repeating: 0, count: count)
    let status: OSStatus = interleaved.withUnsafeMutableBytes { (raw: UnsafeMutableRawBufferPointer) -> OSStatus in
      guard let base = raw.baseAddress else { return -1 }
      return CMBlockBufferCopyDataBytes(block, atOffset: 0, dataLength: byteCount, destination: base)
    }
    guard status == kCMBlockBufferNoErr else { return nil }
    let right = width > 1 ? 1 : 0                  // a mono source plays on both sides
    for i in 0..<frames {
      channels[0][i] = interleaved[i * width]
      channels[1][i] = interleaved[i * width + right]
    }
    buffer.frameLength = AVAudioFrameCount(frames)
    return buffer
  }

  /// `frames` of silence (a source whose sound starts later than its file does).
  static func silence(frames: Int, format: AVAudioFormat) -> AVAudioPCMBuffer? {
    guard frames > 0,
          let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: AVAudioFrameCount(frames)),
          let channels = buffer.floatChannelData else { return nil }
    for i in 0..<frames {
      channels[0][i] = 0
      channels[1][i] = 0
    }
    buffer.frameLength = AVAudioFrameCount(frames)
    return buffer
  }

  /// The units a request switches on, in signal order: pitch, distortion, delay, reverb, equaliser.
  static func units(for request: SoundRenderRequest) -> [AVAudioNode] {
    var nodes: [AVAudioNode] = []
    if request.pitchCents.isFinite, abs(request.pitchCents) >= 1 {
      let pitch = AVAudioUnitTimePitch()
      pitch.pitch = Float(bounded(request.pitchCents, -2400, 2400))
      pitch.rate = 1                               // the copy is exactly as long as the source
      nodes.append(pitch)
    }
    if let preset = distortionPresets[request.distortionPreset], request.distortionWet > 0 {
      let distortion = AVAudioUnitDistortion()
      distortion.loadFactoryPreset(preset)
      distortion.preGain = Float(bounded(request.distortionPreGain.isFinite ? request.distortionPreGain : -6, -80, 20))
      distortion.wetDryMix = Float(bounded(request.distortionWet, 0, 100))
      nodes.append(distortion)
    }
    if request.delayWet > 0, request.delayTime > 0 {
      let delay = AVAudioUnitDelay()
      delay.delayTime = bounded(request.delayTime, 0, 2)
      delay.feedback = Float(bounded(request.delayFeedback.isFinite ? request.delayFeedback : 0, -100, 100))
      delay.lowPassCutoff = Float(bounded(request.delayLowPass.isFinite ? request.delayLowPass : 15000, 10, sampleRate / 2))
      delay.wetDryMix = Float(bounded(request.delayWet, 0, 100))
      nodes.append(delay)
    }
    if let preset = reverbPresets[request.reverbPreset], request.reverbWet > 0 {
      let reverb = AVAudioUnitReverb()
      reverb.loadFactoryPreset(preset)
      reverb.wetDryMix = Float(bounded(request.reverbWet, 0, 100))
      nodes.append(reverb)
    }
    let usable: [SoundBand] = request.bands.filter { (b: SoundBand) -> Bool in
      filterTypes[b.type] != nil && b.frequency.isFinite && b.gain.isFinite && b.bandwidth.isFinite
    }
    if !usable.isEmpty {
      let equaliser = AVAudioUnitEQ(numberOfBands: usable.count)
      for (index, wanted) in usable.enumerated() {
        let band = equaliser.bands[index]
        band.filterType = filterTypes[wanted.type] ?? .parametric
        band.frequency = Float(bounded(wanted.frequency, 20, 20_000))
        band.gain = Float(bounded(wanted.gain, -24, 24))
        band.bandwidth = Float(bounded(wanted.bandwidth, 0.05, 5))
        band.bypass = false                        // set every time: the default is not documented
      }
      nodes.append(equaliser)
    }
    return nodes
  }

  /// Even out loudness: one pass over the source, the mean square of each block of the mono mix, and the gain (dB)
  /// `SoundMath.levelGainDb` gives for them.
  static func measure(_ source: SoundSource, format: AVAudioFormat, job: SoundJob, progress: (Double) -> Void) throws -> Double {
    let reading = try source.startReader(limit: nil)
    defer { if reading.reader.status == .reading { reading.reader.cancelReading() } }
    let blockFrames = max(1, Int(sampleRate * SoundMath.levelBlockSeconds))
    let expected = max(1, source.seconds * sampleRate)
    var blocks: [Double] = []
    var sum = 0.0
    var inBlock = 0
    var seen = 0
    while let sample = reading.output.copyNextSampleBuffer() {
      if job.isCancelled { throw SoundError.cancelled }
      guard let decoded = pcmBuffer(from: sample, format: format), let channels = decoded.floatChannelData else { continue }
      let frames = Int(decoded.frameLength)
      for i in 0..<frames {
        let mono = (Double(channels[0][i]) + Double(channels[1][i])) * 0.5
        sum += mono * mono
        inBlock += 1
        if inBlock == blockFrames {
          blocks.append(sum / Double(inBlock))
          sum = 0
          inBlock = 0
        }
      }
      seen += frames
      progress(min(1, Double(seen) / expected))
    }
    if reading.reader.status == .failed { throw SoundError.failed("sound reader: " + ExportSession.describe(reading.reader.error)) }
    if inBlock > blockFrames / 4 { blocks.append(sum / Double(inBlock)) }   // a last block of at least 0.1 s counts
    return SoundMath.levelGainDb(blocks)
  }

  /// The loop: decoded buffers are scheduled on a player, the engine is pulled `maxFrames` at a time through `units`,
  /// and every rendered buffer — its samples times `gain`, through the peak guard — is handed to `sink`. The units'
  /// latency is dropped from the start and rendered on at the end, so what `sink` gets lines up with the source and
  /// is exactly as long. Returns the frames handed over.
  static func process(_ source: SoundSource, units: [AVAudioNode], format: AVAudioFormat, limit: Double?, gain: Double, job: SoundJob,
                      progress: (Double) -> Void, sink: (AVAudioPCMBuffer) throws -> Void) throws -> Int {
    let reading = try source.startReader(limit: limit)
    defer { if reading.reader.status == .reading { reading.reader.cancelReading() } }
    let engine = AVAudioEngine()
    let player = AVAudioPlayerNode()
    engine.attach(player)
    var previous: AVAudioNode = player
    for unit in units {
      engine.attach(unit)
      engine.connect(previous, to: unit, format: format)
      previous = unit
    }
    engine.connect(previous, to: engine.mainMixerNode, format: format)
    do {
      try engine.enableManualRenderingMode(.offline, format: format, maximumFrameCount: maxFrames)
      try engine.start()
    } catch { throw SoundError.failed("sound engine: " + ExportSession.describe(error)) }
    defer {
      player.stop()
      engine.stop()
    }
    guard let engineBuffer = AVAudioPCMBuffer(pcmFormat: engine.manualRenderingFormat, frameCapacity: engine.manualRenderingMaximumFrameCount),
          let shaped = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: maxFrames) else { throw SoundError.failed("sound engine: no render buffer") }
    guard engine.manualRenderingFormat.channelCount == 2 else { throw SoundError.failed("sound engine: the engine is not rendering stereo") }

    var latencySeconds = 0.0
    for unit in units { latencySeconds += unit.latency }
    let latencyFrames = latencySeconds.isFinite ? max(0, Int((latencySeconds * sampleRate).rounded())) : 0
    var skipFrames = latencyFrames
    let expected = max(1, (limit ?? source.seconds) * sampleRate)
    let ahead = Int(maxFrames) * 4
    var scheduledFrames = 0
    var pulledFrames = 0
    var writtenFrames = 0
    var ended = false
    var isFirstSample = true
    var stalls = 0

    while true {
      if job.isCancelled { throw SoundError.cancelled }
      // Keep the player well ahead of the engine, so a render call never runs dry before the source has ended.
      while !ended && scheduledFrames - pulledFrames < ahead {
        guard let sample = reading.output.copyNextSampleBuffer() else {
          ended = true
          if reading.reader.status == .failed { throw SoundError.failed("sound reader: " + ExportSession.describe(reading.reader.error)) }
          break
        }
        if isFirstSample {
          isFirstSample = false
          let lead = CMSampleBufferGetPresentationTimeStamp(sample).seconds
          if lead.isFinite, lead > 0.001, lead < 600, let quiet = silence(frames: Int((lead * sampleRate).rounded()), format: format) {
            player.scheduleBuffer(quiet, completionHandler: nil)
            scheduledFrames += Int(quiet.frameLength)
          }
        }
        guard let decoded = pcmBuffer(from: sample, format: format) else { continue }
        player.scheduleBuffer(decoded, completionHandler: nil)
        scheduledFrames += Int(decoded.frameLength)
      }
      if !player.isPlaying { player.play() }

      let want = ended ? min(Int(maxFrames), scheduledFrames + latencyFrames - pulledFrames) : Int(maxFrames)
      if want <= 0 { break }
      let status: AVAudioEngineManualRenderingStatus
      do { status = try engine.renderOffline(AVAudioFrameCount(want), to: engineBuffer) }
      catch { throw SoundError.failed("sound render: " + ExportSession.describe(error)) }
      if status == .error { throw SoundError.failed("sound render: the engine reported an error") }
      let got = status == .success ? Int(engineBuffer.frameLength) : 0
      if got == 0 {
        stalls += 1
        if stalls > 200 { throw SoundError.failed("sound render: the engine stopped giving sound") }
        continue
      }
      stalls = 0
      pulledFrames += got

      let drop = min(got, skipFrames)
      skipFrames -= drop
      let keep = min(got - drop, scheduledFrames - writtenFrames)
      if keep > 0, let rendered = engineBuffer.floatChannelData, let target = shaped.floatChannelData {
        for channel in 0..<2 {
          let fromChannel = rendered[channel]
          let intoChannel = target[channel]
          for i in 0..<keep {
            intoChannel[i] = Float(SoundMath.softClip(Double(fromChannel[drop + i]) * gain))
          }
        }
        shaped.frameLength = AVAudioFrameCount(keep)
        try sink(shaped)
        writtenFrames += keep
      }
      progress(min(1, Double(pulledFrames) / expected))
    }
    return writtenFrames
  }

  /// One whole render: measure (if asked), process, write AAC under a `part-` name, move it into place. On any
  /// failure or cancel the partial file is removed and nothing is left at `outputURL` that was not there before.
  static func render(_ request: SoundRenderRequest, source: SoundSource, to outputURL: URL, job: SoundJob,
                     progress: (Double) -> Void) throws -> (seconds: Double, gainDb: Double) {
    guard let format = AVAudioFormat(standardFormatWithSampleRate: sampleRate, channels: 2) else { throw SoundError.failed("sound engine: no audio format") }
    let measureShare = request.level ? 0.3 : 0.0
    var gainDb = 0.0
    if request.level {
      gainDb = try measure(source, format: format, job: job, progress: { (fraction: Double) -> Void in progress(fraction * measureShare) })
    }
    let folder = outputURL.deletingLastPathComponent()
    let partURL = folder.appendingPathComponent("part-" + outputURL.lastPathComponent)
    try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
    try? FileManager.default.removeItem(at: partURL)
    var finished = false
    defer { if !finished { try? FileManager.default.removeItem(at: partURL) } }

    let settings: [String: Any] = [AVFormatIDKey: kAudioFormatMPEG4AAC, AVSampleRateKey: sampleRate, AVNumberOfChannelsKey: 2, AVEncoderBitRateKey: bitRate]
    var file: AVAudioFile?
    do { file = try AVAudioFile(forWriting: partURL, settings: settings, commonFormat: .pcmFormatFloat32, interleaved: false) }
    catch { throw SoundError.failed("sound output: " + ExportSession.describe(error)) }
    let frames = try process(source, units: units(for: request), format: format, limit: nil, gain: SoundMath.dbToGain(gainDb), job: job,
                             progress: { (fraction: Double) -> Void in progress(measureShare + fraction * (1 - measureShare)) },
                             sink: { (buffer: AVAudioPCMBuffer) throws -> Void in
                               do { try file?.write(from: buffer) }
                               catch { throw SoundError.failed("sound output: " + ExportSession.describe(error)) }
                             })
    file = nil                                     // releasing the file finishes it: it must be closed before it is moved
    guard frames > 0 else { throw SoundError.failed("sound render: there was nothing to render") }
    try? FileManager.default.removeItem(at: outputURL)
    do { try FileManager.default.moveItem(at: partURL, to: outputURL) }
    catch { throw SoundError.failed("sound output: " + ExportSession.describe(error)) }
    finished = true
    return (seconds: Double(frames) / sampleRate, gainDb: gainDb)
  }
}

/// The noise-reduction TEST (no user feature): can Apple's sound isolation unit render a saved recording offline?
/// Never throws; the answer is `{ ok, stage, detail }`.
enum SoundProbe {
  static let probeSeconds: Double = 5

  static func report(_ ok: Bool, _ stage: String, _ detail: String) -> [String: Any] {
    return ["ok": ok, "stage": stage, "detail": detail]
  }

  static func run(_ uri: String) async -> [String: Any] {
    var description = AudioComponentDescription(componentType: kAudioUnitType_Effect, componentSubType: kAudioUnitSubType_AUSoundIsolation,
                                                componentManufacturer: kAudioUnitManufacturer_Apple, componentFlags: 0, componentFlagsMask: 0)
    guard AudioComponentFindNext(nil, &description) != nil else { return report(false, "find", "the sound isolation unit is not on this iPhone") }
    let source: SoundSource
    do { source = try await SoundSource.open(uri) }
    catch { return report(false, "open", SoundRender.message(error)) }
    let unit: AVAudioUnit
    do { unit = try await AVAudioUnit.instantiate(with: description, options: []) }
    catch { return report(false, "instantiate", ExportSession.describe(error)) }
    do {
      let detail = try through(unit, source: source)
      return report(true, "render", detail)
    } catch { return report(false, "render", SoundRender.message(error)) }
  }

  /// The first seconds of the source through the unit, with the render loop of a real render. Synchronous.
  static func through(_ unit: AVAudioUnit, source: SoundSource) throws -> String {
    guard let format = AVAudioFormat(standardFormatWithSampleRate: SoundRender.sampleRate, channels: 2) else { throw SoundError.failed("sound engine: no audio format") }
    var sum = 0.0
    var count = 0
    let frames = try SoundRender.process(source, units: [unit], format: format, limit: probeSeconds, gain: 1, job: SoundJob(),
                                         progress: { (_: Double) -> Void in },
                                         sink: { (buffer: AVAudioPCMBuffer) throws -> Void in
                                           guard let data = buffer.floatChannelData else { return }
                                           for i in 0..<Int(buffer.frameLength) {
                                             let value = Double(data[0][i])
                                             sum += value * value
                                             count += 1
                                           }
                                         })
    let rms = count > 0 ? (sum / Double(count)).squareRoot() : 0
    return "frames \(frames) outputRms \(rms) latency \(unit.latency)"
  }
}
```

`modules/clipy-video/ios/ClipyVideoModule.swift`:

1. After the `clearTranscriber` function insert:

```swift

  private let soundLock = NSLock()
  private var soundJobs: [String: SoundJob] = [:]   // guarded by `soundLock`; one entry per render that has not answered yet

  private func storeSoundJob(_ id: String, _ job: SoundJob) {
    soundLock.lock(); defer { soundLock.unlock() }
    soundJobs[id] = job
  }

  private func dropSoundJob(_ id: String) {
    soundLock.lock(); defer { soundLock.unlock() }
    soundJobs[id] = nil
  }

  private func lookupSoundJob(_ id: String) -> SoundJob? {
    soundLock.lock(); defer { soundLock.unlock() }
    return soundJobs[id]
  }
```

2. Replace `Events("onExportEvent")` with `Events("onExportEvent", "onSoundEvent")`.
3. After the `Function("cancelTranscribe")` block (still inside `definition()`), insert:

```swift

    // Renders the source through the request's units into `outputPath` (see SoundRender). Resolves
    // `{ fileUri, seconds, gainDb }`; progress arrives as `onSoundEvent { jobId, progress }`. Rejects
    // "E_SOUND_CANCELLED" after `cancelSoundRender(jobId)`, else "E_SOUND" with a staged message.
    AsyncFunction("renderSound") { (request: SoundRenderRequest, promise: Promise) in
      let job = SoundJob()
      let jobId = request.jobId
      self.storeSoundJob(jobId, job)
      Task { [weak self] in
        defer { self?.dropSoundJob(jobId) }
        do {
          guard let outputURL = ExportSession.fileURL(from: request.outputPath) else { throw SoundError.failed("sound output: not a file path") }
          let source = try await SoundSource.open(request.sourceUri)
          var lastSent = -1.0
          let result = try SoundRender.render(request, source: source, to: outputURL, job: job, progress: { (fraction: Double) -> Void in
            guard fraction - lastSent >= 0.02 else { return }   // at most ~50 events a render
            lastSent = fraction
            self?.sendEvent("onSoundEvent", ["jobId": jobId, "progress": fraction])
          })
          promise.resolve(["fileUri": outputURL.absoluteString, "seconds": result.seconds, "gainDb": result.gainDb])
        } catch SoundError.cancelled {
          promise.reject("E_SOUND_CANCELLED", "Sound cancelled")
        } catch {
          promise.reject("E_SOUND", SoundRender.message(error))
        }
      }
    }

    Function("cancelSoundRender") { (jobId: String) in
      self.lookupSoundJob(jobId)?.cancel()
    }

    // Whether the file has a sound track at all (a silent screen recording has none), and how long the file is.
    AsyncFunction("soundInfo") { (uri: String, promise: Promise) in
      Task {
        guard let url = ExportSession.fileURL(from: uri) else {
          promise.reject("E_URI", "Invalid file")
          return
        }
        let asset = AVURLAsset(url: url)
        do {
          let found = try await asset.loadTracks(withMediaType: .audio)
          let length = try await asset.load(.duration)
          promise.resolve(["hasSound": !found.isEmpty, "seconds": length.seconds.isFinite ? length.seconds : 0])
        } catch {
          promise.reject("E_SOUND", "sound info: " + ExportSession.describe(error))
        }
      }
    }

    // The noise-reduction test (dev only; see SoundProbe). Always resolves.
    AsyncFunction("probeNoiseReduction") { (uri: String, promise: Promise) in
      Task {
        let answer = await SoundProbe.run(uri)
        promise.resolve(answer)
      }
    }
```

`modules/clipy-video/ios/ExportSession.swift`, in the `for audio in request.audioTracks {` loop, replace the one line

```swift
      guard let srcAudio = try await audioAsset.loadTracks(withMediaType: .audio).first else { throw ExportError.sessionFailed("No sound in audio file \(audio.sourceUri)") }
```

with

```swift
      guard let srcAudio = try await audioAsset.loadTracks(withMediaType: .audio).first else {
        // A clip's sound put on the audio row (Extract audio) whose video turns out to have no sound: there is nothing
        // to mix, and that is not a failure. Any other file without sound still fails the export, as it always did.
        let pictures = (try? await audioAsset.loadTracks(withMediaType: .video)) ?? []
        if !pictures.isEmpty { continue }
        throw ExportError.sessionFailed("No sound in audio file \(audio.sourceUri)")
      }
```

and update that loop's leading comment: after "A track that cannot be used fails the export, as a bad music file always did" add "(except a video file without sound, which is skipped)". `sourceAssets.append(audioAsset)` stays on the line above the guard, unchanged.

- [ ] **Step 4: Self-check by reading** (there is no compiler here). Read the three Swift files top to bottom once more against this list and fix anything found:
  - every `let` / `var` name is declared once per scope (`process`: `reading, engine, player, previous, engineBuffer, shaped, latencySeconds, latencyFrames, skipFrames, expected, ahead, scheduledFrames, pulledFrames, writtenFrames, ended, isFirstSample, stalls` and, inside the loop, `sample, lead, quiet, decoded, want, status, got, drop, keep, rendered, target, fromChannel, intoChannel`);
  - no closure parameter or local is named `source`, `format`, `job`, `progress` or `sink` inside a function that takes a parameter of that name;
  - `SoundRender` has no `static func` sharing a name with a `static let`;
  - nothing in `process`, `measure`, `render` or `through` is `async` or uses `await`;
  - `SoundSource` is the only owner of the asset and every caller keeps the `SoundSource` in a local for the whole call;
  - every `catch` that rethrows uses `ExportSession.describe(error)`.
- [ ] **Step 5: Run** the swift-reading suite → PASS; `npx.cmd jest src/editor/model/__tests__/audioMix.parity.test.ts src/editor/__tests__/looks.frozen.test.ts` still pass unedited (if `looks.frozen` goes red, the `ExportSession.swift` edit landed inside a frozen stretch: it must not, the audio loop is outside them). Then `npm run typecheck` and `npm test`.
- [ ] **Step 6: Commit** — `feat(native): SoundRender — offline voice, equaliser and loudness renders; soundInfo; the noise probe; a silent video on the audio row no longer fails an export`. **Do not start a build.**

---

### Task 7: The render manager; the preview plays the copy

**Depends on:** Task 4. **Parallel-safe with:** 6, 8.

**Files:** Create `src/editor/soundFiles.ts`, `src/editor/soundRenders.ts`, `src/editor/__tests__/soundRenders.test.ts`. Modify `src/editor/components/AudioPreview.tsx`, `src/editor/__tests__/AudioPreview.test.tsx` (append only), `app/editor/[id]/index.tsx`.

**Do not touch:** `audioSync.ts`, `audioMix.ts`, `previewVolume.ts`, `PreviewPlayer.tsx`, the existing tests of `AudioPreview.test.tsx`.

**Interfaces: Consumes** `renderSound`, `cancelSoundRender`, `addSoundListener`, `isSoundAvailable`, `isSoundCancelled` (Task 4); `soundChain`, `soundFileName`, `neededSounds`, `NeededSound` (Task 2). **Produces**

```ts
// src/editor/soundFiles.ts  (light: zustand and the model only, so AudioPreview can import it)
export type SoundFile = { status: "ready"; uri: string } | { status: "busy" } | { status: "failed"; message: string };
export const useSoundFiles: UseBoundStore<StoreApi<{ files: Record<string, SoundFile>; hold: boolean }>>;   // files by file name
export function playUri(files: Record<string, SoundFile>, track: AudioTrack): string;
export function isPreparing(files: Record<string, SoundFile>, track: AudioTrack | null): boolean;
// src/editor/soundRenders.ts
export const SOUND_UNAVAILABLE: string;
export const SOUND_FAILED: string;
export const soundDir: (projectId: string) => string;
export function ensureSound(projectId: string, sourceUri: string, sound: SoundSettings, onProgress?: (fraction: number) => void): Promise<string>;
export function syncSounds(projectId: string, needed: NeededSound[]): void;
export function holdSounds(on: boolean): void;
export function sweepSounds(projectId: string): Promise<void>;
export function resetSounds(): void;
export function useSoundRenders(): void;
```

- [ ] **Step 1: Failing tests.** Create `src/editor/__tests__/soundRenders.test.ts`:

```ts
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-07T10:00:00.000Z" }));
jest.mock("@/src/lib/id", () => ({ newId: jest.fn() }));
jest.mock("@/src/projects", () => ({ storage: { projectDir: (id: string) => `file:///doc/projects/${id}` } }));
jest.mock("@/src/projects/expoFs", () => {
  const files = new Set<string>();
  return { __files: files, expoFs: {
    exists: jest.fn(async (p: string) => files.has(p)), mkdir: jest.fn(async () => {}),
    list: jest.fn(async (dir: string) => [...files].filter((f) => f.startsWith(`${dir}/`)).map((f) => f.slice(dir.length + 1))),
    remove: jest.fn(async (p: string) => { files.delete(p); }),
  } };
});
jest.mock("@/modules/clipy-video", () => {
  // The manager subscribes once for the module's lifetime: the listener is kept here, where clearAllMocks does not reach.
  const sound = { listener: null as null | ((e: { jobId: string; progress: number }) => void) };
  return {
    __sound: sound,
    isSoundAvailable: jest.fn(() => true), renderSound: jest.fn(), cancelSoundRender: jest.fn(),
    addSoundListener: jest.fn((cb: (e: { jobId: string; progress: number }) => void) => { sound.listener = cb; return { remove() {} }; }),
    isSoundCancelled: (e: unknown) => typeof e === "object" && e !== null && (e as { code?: string }).code === "E_SOUND_CANCELLED",
  };
});
import { act, renderHook } from "@testing-library/react-native";
import { cancelSoundRender, isSoundAvailable, renderSound } from "@/modules/clipy-video";
import { newId } from "@/src/lib/id";
import { setTrackSound } from "@/src/editor/model/ops";
import { neededSounds, soundChain } from "@/src/editor/model/sound";
import { makeAudioTrack, makeClip, makeProject, NO_SOUND, type SoundSettings } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { useToast } from "@/src/ui/Toast";
import { isPreparing, playUri, useSoundFiles } from "../soundFiles";
import { ensureSound, holdSounds, resetSounds, SOUND_FAILED, SOUND_UNAVAILABLE, soundDir, sweepSounds, syncSounds, useSoundRenders } from "../soundRenders";

const disk = (jest.requireMock("@/src/projects/expoFs") as { __files: Set<string> }).__files;
const native = (jest.requireMock("@/modules/clipy-video") as { __sound: { listener: null | ((e: { jobId: string; progress: number }) => void) } }).__sound;
const render = jest.mocked(renderSound);
const deep: SoundSettings = { ...NO_SOUND, voice: "deep" };
const high: SoundSettings = { ...NO_SOUND, voice: "high" };
const SRC = "file:///doc/projects/p1/media/v.m4a";
const DIR = "file:///doc/projects/p1/sound";
const DEEP = "v-v1-deep-s50-p0-flat-l0.m4a", HIGH = "v-v1-high-s50-p0-flat-l0.m4a";
const st = () => useEditorStore.getState();
const files = () => useSoundFiles.getState().files;
const flush = async () => { for (let i = 0; i < 8; i++) await act(async () => { await Promise.resolve(); }); };
/** A render that stays open until the test settles it. */
function pending() {
  let ok!: () => void, fail!: (e: unknown) => void;
  render.mockImplementationOnce(() => new Promise((res, rej) => { ok = () => res({ fileUri: "x", seconds: 1, gainDb: 0 }); fail = rej; }));
  return { ok: () => ok(), fail: (e: unknown) => fail(e) };
}
const project = (sound?: SoundSettings) => makeProject({ id: "p1", clips: [makeClip({ id: "a", sourceDuration: 20 })],
  audioTracks: [{ ...makeAudioTrack({ id: "v", sourceDuration: 5, sourceUri: SRC, kind: "voice" }), ...(sound ? { sound } : null) }] });

beforeEach(() => {
  jest.clearAllMocks();
  // Job ids count from 1 in every test.
  let n = 0;
  jest.mocked(newId).mockImplementation(() => `job${++n}`);
  jest.mocked(isSoundAvailable).mockReturnValue(true);
  render.mockReset();
  render.mockImplementation(async () => ({ fileUri: "x", seconds: 1, gainDb: 0 }));
  disk.clear();
  resetSounds();
  st().reset();
  useToast.getState().clear();
});

test("soundDir is the project's own folder", () => expect(soundDir("p1")).toBe(DIR));

describe("ensureSound", () => {
  test("renders the copy once: the chain's numbers, the source and the named file; a second caller shares the render", async () => {
    const open = pending();
    const a = ensureSound("p1", SRC, deep);
    const b = ensureSound("p1", SRC, deep);
    await flush();
    expect(render).toHaveBeenCalledTimes(1);
    expect(render).toHaveBeenCalledWith({ ...soundChain(deep), jobId: "job1", sourceUri: SRC, outputPath: `${DIR}/${DEEP}` });
    open.ok();
    await expect(a).resolves.toBe(`${DIR}/${DEEP}`);
    await expect(b).resolves.toBe(`${DIR}/${DEEP}`);
  });

  test("a file that is there is used as it is", async () => {
    disk.add(`${DIR}/${DEEP}`);
    await expect(ensureSound("p1", SRC, deep)).resolves.toBe(`${DIR}/${DEEP}`);
    expect(render).not.toHaveBeenCalled();
  });

  test("without the engine it fails with the plain sentence, and nothing is rendered", async () => {
    jest.mocked(isSoundAvailable).mockReturnValue(false);
    await expect(ensureSound("p1", SRC, deep)).rejects.toThrow(SOUND_UNAVAILABLE);
    expect(render).not.toHaveBeenCalled();
  });

  test("progress events of its job reach its listener", async () => {
    const open = pending();
    const seen: number[] = [];
    const done = ensureSound("p1", SRC, deep, (f) => seen.push(f));
    await flush();
    native.listener!({ jobId: "job1", progress: 0.4 });
    native.listener!({ jobId: "other", progress: 0.9 });
    expect(seen).toEqual([0.4]);
    open.ok();
    await done;
  });
});

describe("syncSounds", () => {
  test("renders what is needed, one at a time, and marks each ready", async () => {
    const first = pending();
    syncSounds("p1", [{ name: DEEP, sourceUri: SRC, sound: deep }, { name: HIGH, sourceUri: SRC, sound: high }]);
    await flush();
    expect(files()[DEEP]).toEqual({ status: "busy" });
    expect(files()[HIGH]).toBeUndefined();
    expect(render).toHaveBeenCalledTimes(1);
    first.ok();
    await flush();
    expect(files()[DEEP]).toEqual({ status: "ready", uri: `${DIR}/${DEEP}` });
    expect(files()[HIGH]).toEqual({ status: "ready", uri: `${DIR}/${HIGH}` });
    expect(render).toHaveBeenCalledTimes(2);
  });

  test("a newer pick cancels a render nobody needs any more, and only the newest is rendered", async () => {
    const first = pending();
    syncSounds("p1", [{ name: DEEP, sourceUri: SRC, sound: deep }]);
    await flush();
    syncSounds("p1", [{ name: HIGH, sourceUri: SRC, sound: high }]);
    expect(cancelSoundRender).toHaveBeenCalledWith("job1");
    first.fail(Object.assign(new Error("Sound cancelled"), { code: "E_SOUND_CANCELLED" }));
    await flush();
    expect(files()[DEEP]).toBeUndefined();
    expect(files()[HIGH]).toEqual({ status: "ready", uri: `${DIR}/${HIGH}` });
    expect(useToast.getState().message).toBeNull();
  });

  test("a failure: marked failed, said once, and not tried again for the same setting", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    render.mockRejectedValueOnce(Object.assign(new Error("sound engine: boom"), { code: "E_SOUND" }));
    syncSounds("p1", [{ name: DEEP, sourceUri: SRC, sound: deep }]);
    await flush();
    expect(files()[DEEP]).toEqual({ status: "failed", message: "sound engine: boom" });
    expect(useToast.getState().message).toBe(SOUND_FAILED);
    expect(warn).toHaveBeenCalledWith("sound render failed", "sound engine: boom");
    syncSounds("p1", [{ name: DEEP, sourceUri: SRC, sound: deep }]);
    await flush();
    expect(render).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  test("nothing is rendered while a slider is held; releasing it renders what is needed then", async () => {
    holdSounds(true);
    syncSounds("p1", [{ name: DEEP, sourceUri: SRC, sound: deep }]);
    syncSounds("p1", [{ name: HIGH, sourceUri: SRC, sound: high }]);
    await flush();
    expect(render).not.toHaveBeenCalled();
    holdSounds(false);
    await flush();
    expect(render).toHaveBeenCalledTimes(1);
    expect(files()[HIGH]).toEqual({ status: "ready", uri: `${DIR}/${HIGH}` });
    expect(files()[DEEP]).toBeUndefined();
  });
});

test("playUri and isPreparing: the copy only once it is ready; everything else is the original", () => {
  const plain = makeAudioTrack({ id: "v", sourceDuration: 5, sourceUri: SRC });
  const changed = { ...plain, sound: deep };
  expect(playUri({}, plain)).toBe(SRC);
  expect(playUri({}, changed)).toBe(SRC);
  expect(playUri({ [DEEP]: { status: "busy" } }, changed)).toBe(SRC);
  expect(playUri({ [DEEP]: { status: "failed", message: "x" } }, changed)).toBe(SRC);
  expect(playUri({ [DEEP]: { status: "ready", uri: `${DIR}/${DEEP}` } }, changed)).toBe(`${DIR}/${DEEP}`);
  expect(playUri({ [DEEP]: { status: "ready", uri: `${DIR}/${DEEP}` } }, plain)).toBe(SRC);
  expect(isPreparing({ [DEEP]: { status: "busy" } }, changed)).toBe(true);
  expect(isPreparing({ [DEEP]: { status: "busy" } }, plain)).toBe(false);
  expect(isPreparing({}, changed)).toBe(false);
  expect(isPreparing({}, null)).toBe(false);
});

test("sweepSounds removes copies no track needs (and leftover part files), never one that is needed now", async () => {
  disk.add(`${DIR}/${DEEP}`); disk.add(`${DIR}/${HIGH}`); disk.add(`${DIR}/part-${HIGH}`); disk.add(`${DIR}/part-${DEEP}`);
  disk.add("file:///doc/projects/p1/media/v.m4a");
  st().setProject(project(deep));
  await sweepSounds("p1");
  expect([...disk].sort()).toEqual(["file:///doc/projects/p1/media/v.m4a", `${DIR}/${DEEP}`, `${DIR}/part-${DEEP}`].sort());
});

describe("useSoundRenders", () => {
  test("renders the copies the open project needs, and again when a setting changes — but not for an edit that changes no setting", async () => {
    st().setProject(project(deep));
    await renderHook(() => useSoundRenders());
    await flush();
    expect(render).toHaveBeenCalledTimes(1);
    expect(files()[DEEP]?.status).toBe("ready");
    await act(async () => { st().apply((p) => ({ ...p, name: "Renamed" })); });
    await flush();
    expect(render).toHaveBeenCalledTimes(1);
    await act(async () => { st().apply((p) => setTrackSound(p, "v", { voice: "high" })); });
    await flush();
    expect(render).toHaveBeenCalledTimes(2);
    expect(files()[HIGH]?.status).toBe("ready");
  });

  test("a project without settings renders nothing; without the engine nothing is rendered either and the settings stay", async () => {
    st().setProject(project());
    const first = await renderHook(() => useSoundRenders());
    await flush();
    expect(render).not.toHaveBeenCalled();
    await first.unmount();
    jest.mocked(isSoundAvailable).mockReturnValue(false);
    st().setProject(project(deep));
    await renderHook(() => useSoundRenders());
    await flush();
    expect(render).not.toHaveBeenCalled();
    expect(st().project!.audioTracks[0].sound).toEqual(deep);
    expect(neededSounds(st().project!)).toHaveLength(1);
  });

  test("a missing source is not rendered; leaving the editor forgets every file and cancels what is running", async () => {
    st().setProject(project(deep), [SRC]);
    const hook = await renderHook(() => useSoundRenders());
    await flush();
    expect(render).not.toHaveBeenCalled();
    const open = pending();
    await act(async () => { st().setProject(project(deep)); });
    await flush();
    expect(files()[DEEP]).toEqual({ status: "busy" });
    await hook.unmount();
    expect(cancelSoundRender).toHaveBeenCalledWith(expect.stringMatching(/^job/));
    expect(files()).toEqual({});
    open.fail(Object.assign(new Error("Sound cancelled"), { code: "E_SOUND_CANCELLED" }));
    await flush();
    expect(files()).toEqual({});
  });
});
```

Append to `src/editor/__tests__/AudioPreview.test.tsx` (add `import { useSoundFiles } from "@/src/editor/soundFiles";` and `import { setTrackSound } from "@/src/editor/model/ops";` to its imports; `setTrackSound` joins the existing `ops` import):

```ts
describe("a track with a sound setting", () => {
  const COPY = "file:///doc/projects/p1/sound/v-v1-deep-s50-p0-flat-l0.m4a";
  afterEach(async () => { await act(async () => { useSoundFiles.setState({ files: {}, hold: false }); }); });

  test("plays its original until the copy is ready, then the copy; back to the original when the setting goes", async () => {
    load([makeAudioTrack({ id: "v", sourceDuration: 10, kind: "voice" })]);
    await render(<AudioPreview />);
    const p = playerOf("v");
    await act(async () => { st().apply((x) => setTrackSound(x, "v", { voice: "deep" })); });
    expect(p.uri).toBe(uriOf("v"));                                            // not ready: still the original
    clear();
    await act(async () => { useSoundFiles.setState({ files: { "v-v1-deep-s50-p0-flat-l0.m4a": { status: "ready", uri: COPY } } }); });
    expect(p.calls.filter((c) => c[0] === "replace")).toEqual([["replace", COPY]]);
    clear();
    await act(async () => { st().apply((x) => setTrackSound(x, "v", { voice: null })); });
    expect(p.calls.filter((c) => c[0] === "replace")).toEqual([["replace", uriOf("v")]]);
  });

  test("a track without a setting never loads anything but its own file, whatever copies exist", async () => {
    load([makeAudioTrack({ id: "v", sourceDuration: 10, kind: "voice" })]);
    await render(<AudioPreview />);
    clear();
    await act(async () => { useSoundFiles.setState({ files: { "v-v1-deep-s50-p0-flat-l0.m4a": { status: "ready", uri: COPY } } }); });
    expect(playerOf("v").calls.filter((c) => c[0] === "replace")).toEqual([]);
  });
});
```

(The first test loads the track from `uriOf("v")` = `file:///media/v.m4a`, whose stem is `v`: the copy's name is `v-v1-deep-s50-p0-flat-l0.m4a`.)

- [ ] **Step 2: Run** `npx.cmd jest src/editor/__tests__/soundRenders.test.ts src/editor/__tests__/AudioPreview.test.tsx` → the new tests FAIL.
- [ ] **Step 3: Implement.**

Create `src/editor/soundFiles.ts`:

```ts
import { create } from "zustand";
import { soundFileName } from "./model/sound";
import type { AudioTrack } from "./model/types";

/** What is known of one rendered copy, by its file name (`soundFileName`). Nothing known = no entry. */
export type SoundFile = { status: "ready"; uri: string } | { status: "busy" } | { status: "failed"; message: string };

/**
 * The copies of the open project (transient: not saved, not undoable), and `hold`: a Strength or Pitch slider is being dragged,
 * so nothing is rendered until it is let go. Written only by soundRenders.ts.
 */
export const useSoundFiles = create<{ files: Record<string, SoundFile>; hold: boolean }>(() => ({ files: {}, hold: false }));

const entryOf = (files: Record<string, SoundFile>, track: AudioTrack): SoundFile | undefined =>
  (track.sound ? files[soundFileName(track.sourceUri, track.sound)] : undefined);

/** The file a track's preview player loads: its changed copy once that is ready, otherwise its own file. */
export function playUri(files: Record<string, SoundFile>, track: AudioTrack): string {
  const entry = entryOf(files, track);
  return entry?.status === "ready" ? entry.uri : track.sourceUri;
}
/** Whether the copy this track needs is being rendered right now. */
export function isPreparing(files: Record<string, SoundFile>, track: AudioTrack | null): boolean {
  return !!track && entryOf(files, track)?.status === "busy";
}
```

Create `src/editor/soundRenders.ts`:

```ts
import { useEffect } from "react";
import { addSoundListener, cancelSoundRender, isSoundAvailable, isSoundCancelled, renderSound } from "@/modules/clipy-video";
import { neededSounds, soundChain, soundFileName, type NeededSound } from "@/src/editor/model/sound";
import type { SoundSettings } from "@/src/editor/model/types";
import { newId } from "@/src/lib/id";
import { storage } from "@/src/projects";
import { expoFs } from "@/src/projects/expoFs";
import { useToast } from "@/src/ui/Toast";
import { useSoundFiles, type SoundFile } from "./soundFiles";
import { useEditorStore } from "./store";

/** Said where Voice or Sound is tapped without the engine (Expo Go, or a build from before the sound tools). */
export const SOUND_UNAVAILABLE = "Voice and sound effects need the new native build. Expo Go cannot run them.";
/** Said once when a copy could not be rendered. The setting stays; the track plays its original. */
export const SOUND_FAILED = "Could not prepare that sound. It plays as recorded.";
/** Where a project's rendered copies live. Deleted with the project; swept when it is opened (`sweepSounds`). */
export const soundDir = (projectId: string): string => `${storage.projectDir(projectId)}/sound`;

type Running = { jobId: string; promise: Promise<string>; listeners: Set<(fraction: number) => void> };
/** The renders that have not answered yet, by output path: a second caller for the same copy shares the first one's render. */
const inflight = new Map<string, Running>();
let listening = false;
function listen(): void {
  if (listening) return;
  listening = true;
  addSoundListener((e) => { for (const r of inflight.values()) if (r.jobId === e.jobId) r.listeners.forEach((cb) => cb(e.progress)); });
}

/**
 * The copy of `sourceUri` changed by `sound`: its uri once it exists — found on disk, or rendered now (one render per copy however
 * many ask). Rejects with SOUND_UNAVAILABLE without the engine, with the native staged message when the render fails, and with the
 * cancel code when it was cancelled (`isSoundCancelled`). Used by the editor (`syncSounds`) and by the export.
 */
export function ensureSound(projectId: string, sourceUri: string, sound: SoundSettings, onProgress?: (fraction: number) => void): Promise<string> {
  const dir = soundDir(projectId);
  const path = `${dir}/${soundFileName(sourceUri, sound)}`;
  const running = inflight.get(path);
  if (running) {
    if (onProgress) running.listeners.add(onProgress);
    return running.promise;
  }
  const entry: Running = { jobId: newId(), promise: Promise.resolve(path), listeners: new Set(onProgress ? [onProgress] : []) };
  const work = async (): Promise<string> => {
    if (await expoFs.exists(path)) return path;
    if (!isSoundAvailable()) throw new Error(SOUND_UNAVAILABLE);
    listen();
    await expoFs.mkdir(dir);
    await renderSound({ ...soundChain(sound), jobId: entry.jobId, sourceUri, outputPath: path });
    return path;
  };
  entry.promise = work().finally(() => { inflight.delete(path); });
  inflight.set(path, entry);
  return entry.promise;
}

const setFile = (name: string, file: SoundFile | null): void => useSoundFiles.setState((s) => {
  const files = { ...s.files };
  if (file) files[name] = file; else delete files[name];
  return { files };
});

/** What the open project needs now (the newest call wins), and whether the one-at-a-time loop is running. */
let wanted: { projectId: string; needed: NeededSound[] } | null = null;
let pumping = false;

async function pump(): Promise<void> {
  if (pumping) return;
  pumping = true;
  try {
    for (;;) {
      const w = wanted;
      const { files, hold } = useSoundFiles.getState();
      if (!w || hold) return;
      const next = w.needed.find((n) => files[n.name] === undefined);
      if (!next) return;
      setFile(next.name, { status: "busy" });
      /** The answer belongs to the project that asked: another project (or none) is open by now → drop it. */
      const stillOpen = () => wanted !== null && wanted.projectId === w.projectId;
      try {
        const uri = await ensureSound(w.projectId, next.sourceUri, next.sound);
        if (stillOpen()) setFile(next.name, { status: "ready", uri });
      } catch (e) {
        if (!stillOpen()) continue;
        if (isSoundCancelled(e)) { setFile(next.name, null); continue; }   // nobody needed it any more; if someone does again, it is rendered again
        const message = e instanceof Error ? e.message : String(e);
        console.warn("sound render failed", message);
        setFile(next.name, { status: "failed", message });
        useToast.getState().show(SOUND_FAILED);
      }
    }
  } finally { pumping = false; }
}

/**
 * The editor says what the open project needs: a running render of a copy nobody needs any more is cancelled, and whatever is
 * needed and not known yet is rendered, one at a time (nothing while a slider is held: `holdSounds`). Never touches the project.
 */
export function syncSounds(projectId: string, needed: NeededSound[]): void {
  wanted = { projectId, needed };
  const dir = soundDir(projectId);
  const keep = new Set(needed.map((n) => `${dir}/${n.name}`));
  for (const [path, r] of inflight) if (!keep.has(path)) cancelSoundRender(r.jobId);
  void pump();
}

/** A Strength / Pitch drag begins (true) or ends (false): no render in between, one on release. */
export function holdSounds(on: boolean): void {
  if (useSoundFiles.getState().hold === on) return;
  useSoundFiles.setState({ hold: on });
  if (!on) void pump();
}

/** The editor is left (or another project opens): every running render is cancelled and nothing is remembered. */
export function resetSounds(): void {
  wanted = null;
  for (const r of inflight.values()) cancelSoundRender(r.jobId);
  useSoundFiles.setState({ files: {}, hold: false });
}

/**
 * Removes the copies in the project's sound folder that no track needs — asked of the OPEN project at the moment each file is about
 * to go, so a copy that became needed meanwhile stays; a `part-` file is judged by the copy it is part of. Run once when a project
 * is opened (there is no undo history then). Never touches a media file.
 */
export async function sweepSounds(projectId: string): Promise<void> {
  const dir = soundDir(projectId);
  const neededNow = (name: string): boolean => {
    const s = useEditorStore.getState();
    if (!s.project || s.project.id !== projectId) return true;   // not the open project any more: leave everything
    return neededSounds(s.project).some((n) => n.name === name.replace(/^part-/, ""));
  };
  try {
    for (const name of await expoFs.list(dir)) if (!neededNow(name)) await expoFs.remove(`${dir}/${name}`);
  } catch (e) { console.warn("sound sweep failed", e); }
}

/**
 * Mount once in the editor: keeps the open project's copies rendered. It reads only WHICH copies are needed (their names), so an
 * edit that changes no sound setting does nothing here; during a slider drag the names change on every frame but `hold` keeps
 * anything from being rendered. Sets no React state and never writes the project.
 */
export function useSoundRenders(): void {
  const projectId = useEditorStore((s) => s.project?.id ?? null);
  const names = useEditorStore((s) => (s.project ? neededSounds(s.project, s.missingSourceUris).map((n) => n.name).join("|") : ""));
  useEffect(() => {
    resetSounds();
    if (projectId) void sweepSounds(projectId);
    return resetSounds;
  }, [projectId]);
  useEffect(() => {
    const s = useEditorStore.getState();
    if (!projectId || !s.project || !isSoundAvailable()) return;
    syncSounds(projectId, neededSounds(s.project, s.missingSourceUris));
  }, [projectId, names]);
}
```

`src/editor/components/AudioPreview.tsx`:

1. Add `import { playUri, useSoundFiles } from "@/src/editor/soundFiles";`.
2. In `TrackPlayer`, after the `isMissing` line add:

```ts
  // The file to play: the track's changed copy once it is rendered (Voice / Sound), otherwise its own file. A string, so this
  // re-renders only when the file really changes.
  const uri = useSoundFiles((s) => playUri(s.files, track));
```

3. In the load effect replace the three `track.sourceUri` by `uri` and its dependency list `[track.sourceUri, isMissing, player]` by `[uri, isMissing, player]`:

```ts
    if (loadedUri.current !== uri) {
      player.replace({ uri });
      loadedUri.current = uri; appliedVolume.current = null; started.current = false; rolling.current = null; lastSeek.current = null;
    }
  }, [uri, isMissing, player]);
```

Nothing else in the file changes (`isMissing` still asks about `track.sourceUri`: the copy is rendered from it). The copy has the source's timing, so `audioSyncStep`'s source times are right for both files.

`app/editor/[id]/index.tsx`: add `import { useSoundRenders } from "@/src/editor/soundRenders";` and, right after the `useAutosave(save);` line, `useSoundRenders();`.

- [ ] **Step 4: Run** the two suites → PASS (every existing `AudioPreview` test unedited and green). Then `npm run typecheck` and `npm test`.
- [ ] **Step 5: Commit** — `feat(editor): changed copies of a sound are rendered when a setting needs them, and the preview plays them`.

---

### Task 8: Extract audio: the flow

**Depends on:** Tasks 3, 4. **Parallel-safe with:** 6, 7.

**Files:** Create `src/editor/useExtractAudio.ts`, `src/editor/__tests__/useExtractAudio.test.ts`.

**Do not touch:** `ops.ts`, `EditorToolbar.tsx` (Task 11 wires it).

**Interfaces: Consumes** `extractClipAudio`, `extractRefusal`, `extractedTrackOf` (Task 3); `isSoundAvailable`, `soundInfo` (Task 4). **Produces**

```ts
export const EXTRACT_MESSAGES: { noSound: string; speed: string; limit: string; silent: string; already: string; moved: string };
export type Extracted = { trackId: string; made: boolean };
export function useExtractAudio(): { extract: (clipId: string) => Promise<Extracted | null>; busy: boolean };
```

- [ ] **Step 1: Failing tests.** Create `src/editor/__tests__/useExtractAudio.test.ts`:

```ts
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-07T10:00:00.000Z" }));
jest.mock("@/src/lib/id", () => ({ newId: jest.fn(() => "new-track") }));
jest.mock("@/src/ui/haptics", () => ({ haptic: jest.fn() }));
jest.mock("@/modules/clipy-video", () => ({ isSoundAvailable: jest.fn(() => false), soundInfo: jest.fn(async () => ({ hasSound: true, seconds: 5 })) }));
import { act, renderHook } from "@testing-library/react-native";
import { isSoundAvailable, soundInfo } from "@/modules/clipy-video";
import { AUDIO_LIMITS, makeAudioTrack, makeClip, makePhotoClip, makeProject } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { useToast } from "@/src/ui/Toast";
import { EXTRACT_MESSAGES, useExtractAudio, type Extracted } from "../useExtractAudio";

const st = () => useEditorStore.getState();
const toast = () => useToast.getState().message;
const run = async (clipId: string) => {
  const hook = await renderHook(() => useExtractAudio());
  let out: Extracted | null = null;
  await act(async () => { out = await hook.result.current.extract(clipId); });
  return out as Extracted | null;
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(isSoundAvailable).mockReturnValue(false);
  jest.mocked(soundInfo).mockResolvedValue({ hasSound: true, seconds: 5 });
  useToast.getState().clear();
  st().reset();
  st().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 6 }), makeClip({ id: "fast", sourceDuration: 6, speed: 2 }), makePhotoClip({ id: "ph" })] }));
});

test("one tap: the bar is there, the clip is muted, and it is one undo step (works without the engine)", async () => {
  expect(await run("a")).toEqual({ trackId: "new-track", made: true });
  expect(st().project!.audioTracks.map((t) => [t.id, t.kind, t.sourceUri])).toEqual([["new-track", "sfx", "file:///media/a.mp4"]]);
  expect(st().project!.clips[0].muted).toBe(true);
  expect(st().past).toHaveLength(1);
  expect(soundInfo).not.toHaveBeenCalled();
  expect(toast()).toBeNull();
  st().undo();
  expect(st().project!.audioTracks).toEqual([]);
  expect(st().project!.clips[0].muted).toBe(false);
});

test("a second time: the bar that is there is returned, nothing is added", async () => {
  await run("a");
  expect(await run("a")).toEqual({ trackId: "new-track", made: false });
  expect(st().project!.audioTracks).toHaveLength(1);
  expect(st().past).toHaveLength(1);
});

test("refusals say why and change nothing", async () => {
  expect(await run("fast")).toBeNull();
  expect(toast()).toBe(EXTRACT_MESSAGES.speed);
  expect(await run("ph")).toBeNull();
  expect(toast()).toBe(EXTRACT_MESSAGES.noSound);
  st().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 6 })], audioTracks: Array.from({ length: AUDIO_LIMITS.maxTracks }, (_, i) => makeAudioTrack({ id: `t${i}`, sourceDuration: 5 })) }));
  expect(await run("a")).toBeNull();
  expect(toast()).toBe(EXTRACT_MESSAGES.limit);
  expect(st().past).toHaveLength(0);
});

test("with the engine the file is asked first: a video without sound is refused; a failed question does not stop the extract", async () => {
  jest.mocked(isSoundAvailable).mockReturnValue(true);
  jest.mocked(soundInfo).mockResolvedValueOnce({ hasSound: false, seconds: 6 });
  expect(await run("a")).toBeNull();
  expect(soundInfo).toHaveBeenCalledWith("file:///media/a.mp4");
  expect(toast()).toBe(EXTRACT_MESSAGES.silent);
  expect(st().project!.audioTracks).toEqual([]);
  jest.mocked(soundInfo).mockRejectedValueOnce(new Error("sound info: boom"));
  expect(await run("a")).toEqual({ trackId: "new-track", made: true });
});

test("the messages are plain sentences", () => {
  expect(EXTRACT_MESSAGES).toEqual({
    noSound: "This clip has no sound to extract.",
    speed: "Set the speed of this clip back to 1x first. Extracted sound plays at normal speed.",
    limit: "You have reached the audio track limit.",
    silent: "This clip has no sound.",
    already: "The sound of this clip is already on the audio row.",
    moved: "The sound of this clip is now its own bar.",
  });
});
```

- [ ] **Step 2: Run** `npx.cmd jest src/editor/__tests__/useExtractAudio.test.ts` → FAIL.
- [ ] **Step 3: Implement.** Create `src/editor/useExtractAudio.ts`:

```ts
import { useCallback, useRef, useState } from "react";
import { isSoundAvailable, soundInfo } from "@/modules/clipy-video";
import { newId } from "@/src/lib/id";
import { haptic } from "@/src/ui/haptics";
import { useToast } from "@/src/ui/Toast";
import { extractClipAudio, extractedTrackOf, extractRefusal } from "./model/ops";
import { findItem } from "./model/timeline";
import { useEditorStore } from "./store";

/** What the owner is told. `already` and `moved` are shown by the toolbar (it knows which tool was tapped). */
export const EXTRACT_MESSAGES = {
  noSound: "This clip has no sound to extract.",
  speed: "Set the speed of this clip back to 1x first. Extracted sound plays at normal speed.",
  limit: "You have reached the audio track limit.",
  silent: "This clip has no sound.",
  already: "The sound of this clip is already on the audio row.",
  moved: "The sound of this clip is now its own bar.",
} as const;

/** The audio track that holds the clip's sound, and whether this call made it (false: it was there already). */
export type Extracted = { trackId: string; made: boolean };

/**
 * Extract audio. `extract(clipId)` puts the clip's sound on the audio row (one undo step) and answers with its track — or with the
 * track that already holds it, changing nothing — or null after saying why not. Where the engine is linked the file is asked first
 * whether it has sound at all; where it is not (Expo Go) the bar is made without asking. `busy` while that question is open.
 */
export function useExtractAudio(): { extract: (clipId: string) => Promise<Extracted | null>; busy: boolean } {
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const extract = useCallback(async (clipId: string): Promise<Extracted | null> => {
    if (lock.current) return null;
    const say = (message: string) => useToast.getState().show(message);
    const first = useEditorStore.getState().project;
    if (!first) return null;
    const existing = extractedTrackOf(first, clipId);
    if (existing) return { trackId: existing.id, made: false };
    const why = extractRefusal(first, clipId);
    if (why) { say(EXTRACT_MESSAGES[why]); return null; }
    const item = findItem(first, clipId);
    if (!item) return null;
    if (isSoundAvailable()) {
      lock.current = true;
      setBusy(true);
      try {
        const info = await soundInfo(item.clip.sourceUri);
        if (!info.hasSound) { say(EXTRACT_MESSAGES.silent); return null; }
      } catch {
        // The file could not be asked: go on. A bar without sound is harmless (the export skips it).
      } finally {
        lock.current = false;
        setBusy(false);
      }
    }
    // The project as it is NOW (the question above took a moment).
    const now = useEditorStore.getState().project;
    if (!now) return null;
    const trackId = newId();
    const next = extractClipAudio(now, clipId, trackId);
    if (next === now) return null;
    haptic("light");
    useEditorStore.getState().apply(() => next);
    return { trackId, made: true };
  }, []);
  return { extract, busy };
}
```

- [ ] **Step 4: Run** the suite → PASS. Then `npm run typecheck` and `npm test`.
- [ ] **Step 5: Commit** — `feat(editor): the Extract audio flow (asks the file first where the engine is linked)`.

---

### Task 9: The Voice panel

**Depends on:** Tasks 3, 7. **Parallel-safe with:** 10, 12.

**Files:** Create `src/editor/components/VoiceSheet.tsx`, `src/editor/__tests__/VoiceSheet.test.tsx`.

**Do not touch:** `EditorToolbar.tsx`, `toolStrip.ts` (Task 11), `src/ui/*`.

**Interfaces: Consumes** `setTrackSound` (Task 3); `VOICES` (Task 1); `holdSounds` (Task 7); `isPreparing`, `useSoundFiles` (Task 7). **Produces** `export function VoiceSheet(props: { trackId: string | null; visible: boolean; onClose: () => void }): JSX.Element | null`.

- [ ] **Step 1: Failing tests.** Create `src/editor/__tests__/VoiceSheet.test.tsx`:

```tsx
import { act, fireEvent, render, screen } from "@testing-library/react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-07T10:00:00.000Z" }));
jest.mock("@/src/ui/haptics", () => ({ haptic: jest.fn() }));
jest.mock("@/src/editor/soundRenders", () => ({ holdSounds: jest.fn() }));
jest.mock("@react-native-community/slider", () => { const { View } = require("react-native"); return ({ testID, disabled, value, minimumValue, maximumValue, step, onSlidingStart, onValueChange, onSlidingComplete }: { testID?: string; disabled?: boolean; value?: number; minimumValue?: number; maximumValue?: number; step?: number; onSlidingStart?: () => void; onValueChange?: (v: number) => void; onSlidingComplete?: () => void }) => <View testID={testID} {...{ disabled, value, minimumValue, maximumValue, step }} onTouchStart={() => onSlidingStart?.()} onTouchMove={(e: unknown) => onValueChange?.((e as { v?: number })?.v ?? 0.8)} onTouchEnd={() => onSlidingComplete?.()} />; });
import { holdSounds } from "@/src/editor/soundRenders";
import { useSoundFiles } from "@/src/editor/soundFiles";
import { makeAudioTrack, makeClip, makeProject, VOICE_IDS } from "@/src/editor/model/types";
import { VOICES } from "@/src/editor/soundTools";
import { useEditorStore } from "@/src/editor/store";
import { VoiceSheet } from "../components/VoiceSheet";

const st = () => useEditorStore.getState();
const track = () => st().project!.audioTracks[0];
const past = () => st().past.length;
const tile = (name: string) => screen.getByRole("button", { name });
const press = (name: string) => fireEvent.press(tile(name));
const strength = () => screen.getByTestId("voice-strength");
const pitch = () => screen.getByTestId("voice-pitch");
const open = () => render(<VoiceSheet trackId="v" visible onClose={() => {}} />);

beforeEach(() => {
  jest.clearAllMocks();
  useSoundFiles.setState({ files: {}, hold: false });
  st().reset();
  st().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 10 })], audioTracks: [makeAudioTrack({ id: "v", sourceDuration: 5, kind: "voice" })] }));
});

test("titled Voice: None is ringed, the seven voices follow in order, Strength is off at 50 %, Pitch is at 0", async () => {
  await open();
  expect(screen.getByText("Voice")).toBeTruthy();
  const labels = screen.getAllByRole("button").map((b) => b.props.accessibilityLabel as string).filter((l) => l !== "Done");
  expect(labels).toEqual(["None", "Deep", "High", "Chipmunk", "Robot", "Echo", "Hall", "Telephone"]);
  expect(tile("None")).toBeSelected();
  for (const id of VOICE_IDS) expect(tile(VOICES[id].label)).not.toBeSelected();
  expect(strength().props).toMatchObject({ disabled: true, minimumValue: 0, maximumValue: 1, step: 0.05, value: 0.5 });
  expect(pitch().props).toMatchObject({ minimumValue: -12, maximumValue: 12, step: 1, value: 0 });
  expect(screen.getByText("Strength 50 %")).toBeTruthy();
  expect(screen.getByText("Pitch 0")).toBeTruthy();
  expect(screen.queryByLabelText("Preparing the sound")).toBeNull();
});

test("a tile sets the voice in one undo step; the ringed tile again does nothing; None takes it away again", async () => {
  await open();
  await press("Deep");
  expect(track().sound).toEqual({ voice: "deep", strength: 0.5, pitch: 0, eq: null, level: false });
  expect(past()).toBe(1);
  expect(tile("Deep")).toBeSelected();
  expect(strength().props.disabled).toBe(false);
  await press("Deep");
  expect(past()).toBe(1);
  await press("Echo");
  expect(track().sound?.voice).toBe("echo");
  expect(past()).toBe(2);
  await press("None");
  expect("sound" in track()).toBe(false);
  expect(past()).toBe(3);
});

test("a Strength drag is one undo step, and nothing is rendered until it is let go", async () => {
  await open();
  await press("Robot");
  await fireEvent(strength(), "touchStart");
  expect(holdSounds).toHaveBeenLastCalledWith(true);
  await fireEvent(strength(), "touchMove", { v: 0.8 });
  await fireEvent(strength(), "touchMove", { v: 0.25 });
  expect(track().sound).toMatchObject({ voice: "robot", strength: 0.25 });
  expect(jest.mocked(holdSounds).mock.calls.filter(([on]) => on === false)).toHaveLength(0);
  await fireEvent(strength(), "touchEnd");
  expect(holdSounds).toHaveBeenLastCalledWith(false);
  expect(past()).toBe(2);                                                    // the tile, the drag
  expect(screen.getByText("Strength 25 %")).toBeTruthy();
});

test("Pitch works on its own, without a voice, in whole steps; back at 0 the track is as recorded", async () => {
  await open();
  await fireEvent(pitch(), "touchStart");
  await fireEvent(pitch(), "touchMove", { v: 3 });
  await fireEvent(pitch(), "touchEnd");
  expect(track().sound).toEqual({ voice: null, strength: 0.5, pitch: 3, eq: null, level: false });
  expect(screen.getByText("Pitch +3")).toBeTruthy();
  expect(past()).toBe(1);
  await fireEvent(pitch(), "touchStart");
  await fireEvent(pitch(), "touchMove", { v: -2 });
  expect(screen.getByText("Pitch -2")).toBeTruthy();
  await fireEvent(pitch(), "touchMove", { v: 0 });
  await fireEvent(pitch(), "touchEnd");
  expect("sound" in track()).toBe(false);
});

test("the spinner shows while this track's copy is being rendered; closing mid-drag lets the hold go", async () => {
  const view = await open();
  await press("Deep");
  await fireEvent(screen.getByTestId("voice-strength"), "touchStart");
  await act(async () => { useSoundFiles.setState({ files: { "v-v1-deep-s50-p0-flat-l0.m4a": { status: "busy" } } }); });
  await view.rerender(<VoiceSheet trackId="v" visible onClose={() => {}} />);
  expect(screen.getByLabelText("Preparing the sound")).toBeTruthy();
  jest.mocked(holdSounds).mockClear();
  await view.unmount();
  expect(holdSounds).toHaveBeenCalledWith(false);
});

test("nothing for a track that is not there", async () => {
  await render(<VoiceSheet trackId="nope" visible onClose={() => {}} />);
  expect(screen.queryByText("Voice")).toBeNull();
});
```

- [ ] **Step 2: Run** `npx.cmd jest src/editor/__tests__/VoiceSheet.test.tsx` → FAIL.
- [ ] **Step 3: Implement.** Create `src/editor/components/VoiceSheet.tsx`:

```tsx
import { useEffect, useMemo } from "react";
import { useWindowDimensions, View } from "react-native";
import { setTrackSound } from "@/src/editor/model/ops";
import { NO_SOUND, SOUND_LIMITS, VOICE_IDS, type VoiceId } from "@/src/editor/model/types";
import { isPreparing, useSoundFiles } from "@/src/editor/soundFiles";
import { holdSounds } from "@/src/editor/soundRenders";
import { VOICES } from "@/src/editor/soundTools";
import { useEditorStore } from "@/src/editor/store";
import { theme } from "@/src/theme/theme";
import { haptic } from "@/src/ui/haptics";
import { Slider } from "@/src/ui/Slider";
import { Spinner } from "@/src/ui/Spinner";
import { Tile, TILE_WIDTH } from "@/src/ui/Tile";
import { PANEL, ToolPanel } from "@/src/ui/ToolPanel";
import { StripSlider, StripTiles, tilesStartXIn } from "@/src/ui/ToolStrip";

/** Pitch 0: the slider ticks lightly when a drag reaches or passes it. */
const REST = [0] as const;

/**
 * The Voice panel of a sound bar: None or one of seven voices, how strong, and a Pitch of its own (added to the voice's). The setting
 * is stored on the track (`setTrackSound`); the changed copy is rendered by soundRenders.ts — never during a drag: a slider holds
 * the renders from slide start to slide complete (and when the panel goes mid-drag). A tile is one undo step, a drag one.
 * Rows have explicit heights; the body does not scroll.
 */
export function VoiceSheet({ trackId, visible, onClose }: { trackId: string | null; visible: boolean; onClose: () => void }) {
  const track = useEditorStore((s) => s.project?.audioTracks.find((t) => t.id === trackId) ?? null);
  const { apply, beginTransaction, applyTransient } = useEditorStore.getState();
  const { width: windowW } = useWindowDimensions();
  const busy = useSoundFiles((s) => isPreparing(s.files, track));
  const sound = track?.sound ?? NO_SOUND;
  // Where the row starts: the ringed tile in view (None is tile 0). Worked out when the panel opens (and for another track) — NOT
  // on every pick: a ScrollView applies a changed contentOffset at once, and the row must not move under the finger.
  const startX = useMemo(
    () => tilesStartXIn(sound.voice ? VOICE_IDS.indexOf(sound.voice) + 1 : 0, TILE_WIDTH, VOICE_IDS.length + 1, windowW),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visible, track?.id, windowW],
  );
  // The panel can go while a slider is held (the selection changed): renders must not stay held.
  useEffect(() => () => holdSounds(false), []);
  if (!track) return null;

  const pick = (voice: VoiceId | null) => {
    if (sound.voice === voice) return;   // already ringed: no buzz, no undo step
    haptic("light");
    apply((p) => setTrackSound(p, track.id, { voice }));
  };
  const start = () => { beginTransaction(); holdSounds(true); };
  const end = () => holdSounds(false);

  return (
    <ToolPanel visible={visible} onClose={onClose} title="Voice" size="compact" scroll={false}>
      {/* A fixed slot over the header's free middle: the spinner shows in it while the copy is rendered, and nothing moves. */}
      <View testID="voice-busy-slot" pointerEvents="none" style={{ position: "absolute", top: -PANEL.header, left: 0, right: 0, height: PANEL.header, alignItems: "center", justifyContent: "center" }}>
        {busy ? <Spinner label="Preparing the sound" /> : null}
      </View>
      {/* The kit's rows bring their own gutter: the panel's is taken back so they line up with every strip. */}
      <View style={{ marginHorizontal: -theme.space.gutter }}>
        <StripTiles initialX={startX}>
          <Tile label="None" icon="ban-outline" selected={sound.voice === null} onPress={() => pick(null)} />
          {VOICE_IDS.map((id) => <Tile key={id} label={VOICES[id].label} icon={VOICES[id].icon} selected={sound.voice === id} onPress={() => pick(id)} />)}
        </StripTiles>
        <StripSlider label="Strength" value={`${Math.round(sound.strength * 100)} %`}>
          <Slider
            testID="voice-strength"
            minimumValue={SOUND_LIMITS.strength[0]} maximumValue={SOUND_LIMITS.strength[1]} step={0.05}
            value={sound.strength}
            disabled={sound.voice === null}
            detents={[SOUND_LIMITS.defaultStrength]}
            onSlidingStart={start}
            onValueChange={(v) => { if (sound.voice !== null) applyTransient((p) => setTrackSound(p, track.id, { strength: v })); }}
            onSlidingComplete={end}
          />
        </StripSlider>
        <StripSlider label="Pitch" value={`${sound.pitch > 0 ? "+" : ""}${sound.pitch}`}>
          <Slider
            testID="voice-pitch"
            minimumValue={SOUND_LIMITS.pitch[0]} maximumValue={SOUND_LIMITS.pitch[1]} step={1}
            value={sound.pitch}
            detents={REST}
            onSlidingStart={start}
            onValueChange={(v) => applyTransient((p) => setTrackSound(p, track.id, { pitch: v }))}
            onSlidingComplete={end}
          />
        </StripSlider>
      </View>
    </ToolPanel>
  );
}
```

(`marginHorizontal: -theme.space.gutter` is the token `CollageSheet.tsx` already uses in the same way; if `spacingScale.test.ts` flags this file, compare with how that file passes and do the same. Do not add to the guard's allow-table.)

- [ ] **Step 4: Run** the suite, then `npx.cmd jest src/__tests__` (the guards) → PASS. Then `npm run typecheck` and `npm test`.
- [ ] **Step 5: Commit** — `feat(editor): the Voice panel — seven voices, Strength, Pitch`.

---

### Task 10: The Sound strip and the dev-only probe call

**Depends on:** Tasks 3, 7 (and Task 4 for `probeNoiseReduction`). **Parallel-safe with:** 9, 12.

**Files:** Create `src/editor/components/SoundQualitySheet.tsx`, `src/editor/__tests__/SoundQualitySheet.test.tsx`.

**Do not touch:** `EditorToolbar.tsx`, `toolStrip.ts`, `src/ui/*`.

**Interfaces: Consumes** `setTrackSound` (Task 3); `EQS` (Task 1); `isPreparing`, `useSoundFiles` (Task 7); `isSoundAvailable`, `probeNoiseReduction` (Task 4). **Produces** `export function SoundQualitySheet(props: { trackId: string | null; visible: boolean; onClose: () => void }): JSX.Element | null` and `export function resetNoiseProbe(): void` (tests only).

- [ ] **Step 1: Failing tests.** Create `src/editor/__tests__/SoundQualitySheet.test.tsx`:

```tsx
import { act, fireEvent, render, screen } from "@testing-library/react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-07T10:00:00.000Z" }));
jest.mock("@/src/ui/haptics", () => ({ haptic: jest.fn() }));
jest.mock("@/modules/clipy-video", () => ({ isSoundAvailable: jest.fn(() => true), probeNoiseReduction: jest.fn(async () => ({ ok: true, stage: "render", detail: "frames 220500 outputRms 0.05 latency 0" })) }));
import { isSoundAvailable, probeNoiseReduction } from "@/modules/clipy-video";
import { useSoundFiles } from "@/src/editor/soundFiles";
import { EQ_IDS, makeAudioTrack, makeClip, makeProject } from "@/src/editor/model/types";
import { EQS } from "@/src/editor/soundTools";
import { useEditorStore } from "@/src/editor/store";
import { resetNoiseProbe, SoundQualitySheet } from "../components/SoundQualitySheet";

const st = () => useEditorStore.getState();
const track = () => st().project!.audioTracks[0];
const past = () => st().past.length;
const tile = (name: string) => screen.getByRole("button", { name });
const press = (name: string) => fireEvent.press(tile(name));
const level = () => screen.getByLabelText("Even out loudness");
const open = () => render(<SoundQualitySheet trackId="v" visible onClose={() => {}} />);
const flush = async () => { for (let i = 0; i < 4; i++) await act(async () => { await Promise.resolve(); }); };

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(isSoundAvailable).mockReturnValue(true);
  resetNoiseProbe();
  useSoundFiles.setState({ files: {}, hold: false });
  st().reset();
  st().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 10 })], audioTracks: [makeAudioTrack({ id: "v", sourceDuration: 5, kind: "voice" })] }));
});

test("titled Sound quality: None is ringed, the four presets follow, the switch is off", async () => {
  await open();
  expect(screen.getByText("Sound quality")).toBeTruthy();
  const labels = screen.getAllByRole("button").map((b) => b.props.accessibilityLabel as string).filter((l) => l !== "Done");
  expect(labels).toEqual(["None", "Bass boost", "Clear voice", "Warm", "Bright"]);
  expect(tile("None")).toBeSelected();
  for (const id of EQ_IDS) expect(tile(EQS[id].label)).not.toBeSelected();
  expect(screen.getByText("Even out loudness")).toBeTruthy();
  expect(level().props.value).toBe(false);
});

test("a preset is one undo step; the ringed one again does nothing; None takes it away", async () => {
  await open();
  await press("Warm");
  expect(track().sound).toEqual({ voice: null, strength: 0.5, pitch: 0, eq: "warm", level: false });
  expect(past()).toBe(1);
  expect(tile("Warm")).toBeSelected();
  await press("Warm");
  expect(past()).toBe(1);
  await press("None");
  expect("sound" in track()).toBe(false);
  expect(past()).toBe(2);
});

test("Even out loudness is one switch, one undo step each way, and keeps a preset that is set", async () => {
  await open();
  await press("Bright");
  await fireEvent(level(), "valueChange", true);
  expect(track().sound).toEqual({ voice: null, strength: 0.5, pitch: 0, eq: "bright", level: true });
  expect(level().props.value).toBe(true);
  expect(past()).toBe(2);
  await fireEvent(level(), "valueChange", false);
  expect(track().sound).toEqual({ voice: null, strength: 0.5, pitch: 0, eq: "bright", level: false });
  expect(past()).toBe(3);
});

test("the spinner shows while this track's copy is being rendered", async () => {
  const view = await open();
  await press("Warm");
  expect(screen.queryByLabelText("Preparing the sound")).toBeNull();
  await act(async () => { useSoundFiles.setState({ files: { "v-v1-plain-s0-p0-warm-l0.m4a": { status: "busy" } } }); });
  await view.rerender(<SoundQualitySheet trackId="v" visible onClose={() => {}} />);
  expect(screen.getByLabelText("Preparing the sound")).toBeTruthy();
});

test("the noise test: once per app start, when the strip opens in a dev session with the engine, to the log only", async () => {
  const log = jest.spyOn(console, "log").mockImplementation(() => {});
  const first = await open();
  await flush();
  expect(probeNoiseReduction).toHaveBeenCalledTimes(1);
  expect(probeNoiseReduction).toHaveBeenCalledWith("file:///media/v.m4a");
  expect(log).toHaveBeenCalledWith("[noise-probe]", JSON.stringify({ ok: true, stage: "render", detail: "frames 220500 outputRms 0.05 latency 0" }));
  expect(screen.queryByText(/noise/i)).toBeNull();                        // nothing on screen
  await first.unmount();
  await open();
  await flush();
  expect(probeNoiseReduction).toHaveBeenCalledTimes(1);                   // not again
  expect("sound" in track()).toBe(false);                                 // and it changed nothing
  log.mockRestore();
});

test("the noise test is not run without the engine, nor while the strip is closed; a failing test is logged, not thrown", async () => {
  jest.mocked(isSoundAvailable).mockReturnValue(false);
  await open();
  await flush();
  expect(probeNoiseReduction).not.toHaveBeenCalled();
  jest.mocked(isSoundAvailable).mockReturnValue(true);
  await render(<SoundQualitySheet trackId="v" visible={false} onClose={() => {}} />);
  await flush();
  expect(probeNoiseReduction).not.toHaveBeenCalled();
  const log = jest.spyOn(console, "log").mockImplementation(() => {});
  jest.mocked(probeNoiseReduction).mockRejectedValueOnce(new Error("boom"));
  await open();
  await flush();
  expect(log).toHaveBeenCalledWith("[noise-probe]", JSON.stringify({ ok: false, stage: "call", detail: "boom" }));
  log.mockRestore();
});
```

- [ ] **Step 2: Run** `npx.cmd jest src/editor/__tests__/SoundQualitySheet.test.tsx` → FAIL.
- [ ] **Step 3: Implement.** Create `src/editor/components/SoundQualitySheet.tsx`:

```tsx
import { useEffect } from "react";
import { Switch, View } from "react-native";
import { isSoundAvailable, probeNoiseReduction } from "@/modules/clipy-video";
import { setTrackSound } from "@/src/editor/model/ops";
import { EQ_IDS, NO_SOUND, type EqId } from "@/src/editor/model/types";
import { isPreparing, useSoundFiles } from "@/src/editor/soundFiles";
import { EQS } from "@/src/editor/soundTools";
import { useEditorStore } from "@/src/editor/store";
import { theme } from "@/src/theme/theme";
import { haptic } from "@/src/ui/haptics";
import { Spinner } from "@/src/ui/Spinner";
import { Body } from "@/src/ui/Text";
import { Tile } from "@/src/ui/Tile";
import { STRIP, StripTiles, ToolStrip } from "@/src/ui/ToolStrip";

/** The noise-reduction test has run in this app session. */
let probed = false;
/** Tests only. */
export function resetNoiseProbe(): void { probed = false; }
/**
 * The noise-reduction TEST (spec §9): asks the engine once per app start whether Apple's sound isolation unit can render this
 * recording, and writes the answer to the dev-server log. A development session only; nothing on screen, nothing stored.
 */
function runNoiseProbe(uri: string): void {
  if (probed || !__DEV__ || !isSoundAvailable()) return;
  probed = true;
  probeNoiseReduction(uri)
    .then((answer) => console.log("[noise-probe]", JSON.stringify(answer)))
    .catch((e: unknown) => console.log("[noise-probe]", JSON.stringify({ ok: false, stage: "call", detail: e instanceof Error ? e.message : String(e) })));
}

/**
 * The Sound strip of a sound bar ("Sound quality"): None or one of four equaliser presets, and Even out loudness. Both are stored on
 * the track (`setTrackSound`); the changed copy is rendered by soundRenders.ts. A tile is one undo step, the switch one.
 */
export function SoundQualitySheet({ trackId, visible, onClose }: { trackId: string | null; visible: boolean; onClose: () => void }) {
  const track = useEditorStore((s) => s.project?.audioTracks.find((t) => t.id === trackId) ?? null);
  const apply = useEditorStore((s) => s.apply);
  const busy = useSoundFiles((s) => isPreparing(s.files, track));
  const sourceUri = track?.sourceUri ?? null;
  useEffect(() => { if (visible && sourceUri) runNoiseProbe(sourceUri); }, [visible, sourceUri]);
  if (!track) return null;
  const sound = track.sound ?? NO_SOUND;

  const pick = (eq: EqId | null) => {
    if (sound.eq === eq) return;   // already ringed: no buzz, no undo step
    haptic("light");
    apply((p) => setTrackSound(p, track.id, { eq }));
  };

  return (
    <ToolStrip visible={visible} onClose={onClose} title="Sound quality" note={busy ? <Spinner label="Preparing the sound" /> : undefined}>
      <StripTiles>
        <Tile label="None" icon="ban-outline" selected={sound.eq === null} onPress={() => pick(null)} />
        {EQ_IDS.map((id) => <Tile key={id} label={EQS[id].label} icon={EQS[id].icon} selected={sound.eq === id} onPress={() => pick(id)} />)}
      </StripTiles>
      <View testID="sound-level-row" style={{ height: STRIP.slider, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: theme.space.gutter }}>
        <Body style={{ fontSize: theme.type.small }}>Even out loudness</Body>
        <Switch accessibilityLabel="Even out loudness" value={sound.level} onValueChange={(on) => apply((p) => setTrackSound(p, track.id, { level: on }))} trackColor={{ true: theme.colors.accent }} />
      </View>
    </ToolStrip>
  );
}
```

(`__DEV__` is true under Jest. The effect is keyed on `visible` and the file, neither of which a gesture drives, and it sets no state.)

- [ ] **Step 4: Run** the suite, then `npx.cmd jest src/__tests__` → PASS. Then `npm run typecheck` and `npm test`.
- [ ] **Step 5: Commit** — `feat(editor): the Sound strip — equaliser presets, Even out loudness; the noise-reduction test in the dev log`.

---

### Task 11: Toolbar: `contextFor`, tool ids, the tools mounted, the actions

**Depends on:** Tasks 8, 9, 10. **Parallel-safe with:** 12.

**Files:** Modify `src/editor/toolbarContext.ts`, `src/editor/toolGroups.ts`, `src/editor/toolStrip.ts`, `src/editor/components/EditorToolbar.tsx`, `src/editor/__tests__/toolbarContext.test.ts`, `src/editor/__tests__/icons.test.ts`, `src/editor/__tests__/EditorToolbar.test.tsx`, `src/editor/__tests__/EditorToolbar.layers.test.tsx` (pinned lists only). Create `src/editor/__tests__/EditorToolbar.sound.test.tsx`.

**Do not touch:** the sheets (Tasks 9, 10), `useExtractAudio.ts`, `EditorLayout.tsx`.

**Interfaces: Consumes** `useExtractAudio`, `EXTRACT_MESSAGES` (Task 8); `VoiceSheet` (Task 9); `SoundQualitySheet` (Task 10); `SOUND_UNAVAILABLE` (Task 7); `isSoundAvailable` (Task 4). **Produces** tool ids `extractAudio`, `voice`, `soundQuality`; `PanelId` `voice`; `StripId` `soundQuality`.

- [ ] **Step 1: Failing tests.**

`src/editor/__tests__/toolbarContext.test.ts`: the pinned lists become

```ts
const CLIP = ["split", "trim", "select", "speed", "volume", "extractAudio", "voice", "soundQuality", "animate", "filter", "adjust", "background", "templates", "crop", "transform", "opacity", "mask", "chroma", "keyframe", "transition", "replace", "reverse", "freeze", "duplicate", "delete"];
const SOUND = ["audioSplit", "audioVolume", "audioFade", "voice", "soundQuality", "audioDuplicate", "audioDelete", "addAudio", "ducking", "beats"];
const LAYER = ["trim", "speed", "volume", "extractAudio", "voice", "soundQuality", "animate", "filter", "adjust", "crop", "transform", "opacity", "mask", "blend", "chroma", "keyframe", "layerForward", "layerBack", "replace", "reverse", "duplicate", "delete"];
```

the literal in "Beats needs clips" becomes `["audioSplit", "audioVolume", "audioFade", "voice", "soundQuality", "audioDuplicate", "audioDelete", "addAudio", "ducking"]`, `expect(TOOL_IDS).toHaveLength(51)` becomes `54`, and append:

```ts
test("the sound tools: on a sound's bar, and on a video's bar exactly where Volume is — never on a photo or a reversed clip", () => {
  const three = ["extractAudio", "voice", "soundQuality"];
  const of = (p: Project, id: string) => contextFor({ ...none, clipId: id }, p).tools;
  const p = makeProject({
    clips: [makeClip({ id: "v", sourceDuration: 4 }), makeClip({ id: "r", sourceDuration: 4, reversed: true }), makePhotoClip({ id: "ph" }), makeClip({ id: "fast", sourceDuration: 4, speed: 2 })],
    layers: [makeLayer({ id: "Lv", sourceDuration: 4 }), { ...makePhotoClip({ id: "Lp" }), start: 0 }],
    audioTracks: [makeAudioTrack({ id: "m", sourceDuration: 5 })],
  });
  for (const id of ["v", "fast", "Lv"]) { expect(of(p, id)).toEqual(expect.arrayContaining(three)); expect(of(p, id).indexOf("extractAudio")).toBe(of(p, id).indexOf("volume") + 1); }
  for (const id of ["r", "ph", "Lp"]) for (const t of [...three, "volume"]) expect(of(p, id)).not.toContain(t);
  const sound = contextFor({ ...none, audioId: "m" }, p).tools;
  expect(sound).toEqual(expect.arrayContaining(["voice", "soundQuality"]));
  expect(sound).not.toContain("extractAudio");
  expect(contextFor({ ...none, section: "audio" }, p).tools).toEqual(["addAudio", "ducking", "beats"]);   // no sound selected: no sound tools
});
```

(add to that file's imports whatever is missing of `makeLayer`, `makePhotoClip`, `type Project`.)

`src/editor/__tests__/icons.test.ts`: in "the icon of each tool" add the line `extractAudio: "git-branch-outline", voice: "mic-outline", soundQuality: "stats-chart-outline",` to the expected object.

`src/editor/__tests__/EditorToolbar.test.tsx`: the label lists become

```ts
const CLIP = ["Split", "Trim", "Select", "Speed", "Volume", "Extract audio", "Voice", "Sound", "Animate", "Filter", "Adjust", "Background", "Templates", "Crop", "Transform", "Opacity", "Mask", "Green screen", "Keyframe", "Transition", "Replace", "Reverse", "Freeze", "Duplicate", "Delete"];
const SOUND = ["Split", "Volume", "Fade", "Voice", "Sound", "Duplicate", "Delete", "Add audio", "Ducking", "Beats"];
```

`src/editor/__tests__/EditorToolbar.layers.test.tsx`: `const LAYER = ["Trim", "Speed", "Volume", "Extract audio", "Voice", "Sound", "Animate", "Filter", "Adjust", "Crop", "Transform", "Opacity", "Mask", "Blend", "Green screen", "Keyframe", "Forward", "Back", "Replace", "Reverse", "Duplicate", "Delete"];`

Create `src/editor/__tests__/EditorToolbar.sound.test.tsx`:

```tsx
import { act, fireEvent, render, screen } from "@testing-library/react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-07T10:00:00.000Z" }));
jest.mock("@/src/lib/id", () => ({ newId: jest.fn(() => "new-track") }));
jest.mock("@/src/ui/haptics", () => ({ haptic: jest.fn() }));
jest.mock("@/modules/clipy-video", () => ({
  ...jest.requireActual("@/modules/clipy-video"),
  isSoundAvailable: jest.fn(() => true), soundInfo: jest.fn(async () => ({ hasSound: true, seconds: 4 })),
  probeNoiseReduction: jest.fn(async () => ({ ok: false, stage: "find", detail: "test" })),
}));
import { isSoundAvailable } from "@/modules/clipy-video";
import { setTrackSound } from "@/src/editor/model/ops";
import { makeAudioTrack, makeClip, makeProject } from "@/src/editor/model/types";
import { SOUND_UNAVAILABLE } from "@/src/editor/soundRenders";
import { useEditorStore } from "@/src/editor/store";
import { closeStrip, useToolStrip } from "@/src/editor/toolStrip";
import { EXTRACT_MESSAGES } from "@/src/editor/useExtractAudio";
import { useToast } from "@/src/ui/Toast";
import { EditorToolbar } from "../components/EditorToolbar";

const st = () => useEditorStore.getState();
const btn = (name: string) => screen.getByRole("button", { name });
const tap = async (name: string) => { await fireEvent.press(btn(name)); for (let i = 0; i < 6; i++) await act(async () => { await Promise.resolve(); }); };
const toast = () => useToast.getState().message;
const openTool = () => useToolStrip.getState().open?.id ?? null;

let log: jest.SpyInstance;
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(isSoundAvailable).mockReturnValue(true);
  log = jest.spyOn(console, "log").mockImplementation(() => {});   // the noise test writes there when the Sound strip opens
  closeStrip();
  useToast.getState().clear();
  st().reset();
  st().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 4 }), makeClip({ id: "b", sourceDuration: 4 })], audioTracks: [makeAudioTrack({ id: "m", sourceDuration: 9, kind: "voice" })] }));
});
afterEach(() => log.mockRestore());

test("Extract audio on a clip: the new bar is selected, the clip is muted, one undo step, no tool opens", async () => {
  st().select("a");
  await render(<EditorToolbar />);
  await tap("Extract audio");
  expect(st().selectedAudioId).toBe("new-track");
  expect(st().project!.clips[0].muted).toBe(true);
  expect(st().past).toHaveLength(1);
  expect(openTool()).toBeNull();
  expect(toast()).toBeNull();
});

test("Extract audio again on the same clip: the bar that is there is selected and it says so", async () => {
  st().select("a");
  await render(<EditorToolbar />);
  await tap("Extract audio");
  await act(async () => { st().select("a"); });
  await tap("Extract audio");
  expect(st().project!.audioTracks).toHaveLength(2);
  expect(st().selectedAudioId).toBe("new-track");
  expect(toast()).toBe(EXTRACT_MESSAGES.already);
  expect(st().past).toHaveLength(1);
});

test("Voice on a sound bar opens the Voice panel on that bar", async () => {
  st().selectAudio("m");
  await render(<EditorToolbar />);
  await tap("Voice");
  expect(useToolStrip.getState().open).toEqual({ id: "voice", key: "audio:m" });
  expect(screen.getByRole("button", { name: "Chipmunk" })).toBeTruthy();
  await tap("Deep");
  expect(st().project!.audioTracks[0].sound?.voice).toBe("deep");
});

test("Sound on a sound bar opens the Sound strip on that bar", async () => {
  st().selectAudio("m");
  await render(<EditorToolbar />);
  await tap("Sound");
  expect(useToolStrip.getState().open).toEqual({ id: "soundQuality", key: "audio:m" });
  expect(screen.getByText("Sound quality")).toBeTruthy();
});

test("Voice on a clip: the clip's sound is put on the audio row first (one undo step), selected, the panel opens on it, and it says so", async () => {
  st().select("b");
  await render(<EditorToolbar />);
  await tap("Voice");
  expect(st().project!.audioTracks.map((t) => t.id)).toEqual(["m", "new-track"]);
  expect(st().project!.audioTracks[1]).toMatchObject({ kind: "sfx", start: 4, sourceUri: "file:///media/b.mp4" });
  expect(st().project!.clips[1].muted).toBe(true);
  expect(st().past).toHaveLength(1);
  expect(st().selectedAudioId).toBe("new-track");
  expect(useToolStrip.getState().open).toEqual({ id: "voice", key: "audio:new-track" });
  expect(toast()).toBe(EXTRACT_MESSAGES.moved);
});

test("Sound on a clip whose sound is already on the audio row: that bar is selected and the strip opens, nothing is added, nothing is said", async () => {
  st().select("a");
  await render(<EditorToolbar />);
  await tap("Extract audio");
  await act(async () => { st().select("a"); });
  await tap("Sound");
  expect(st().project!.audioTracks).toHaveLength(2);
  expect(st().past).toHaveLength(1);
  expect(useToolStrip.getState().open).toEqual({ id: "soundQuality", key: "audio:new-track" });
  expect(toast()).toBeNull();
});

test("without the engine Voice and Sound say so and change nothing — on a clip and on a sound bar; Extract audio still works", async () => {
  jest.mocked(isSoundAvailable).mockReturnValue(false);
  st().select("a");
  await render(<EditorToolbar />);
  for (const name of ["Voice", "Sound"]) {
    await tap(name);
    expect(toast()).toBe(SOUND_UNAVAILABLE);
    expect(openTool()).toBeNull();
    expect(st().project!.audioTracks).toHaveLength(1);
    expect(st().past).toHaveLength(0);
    useToast.getState().clear();
  }
  await act(async () => { st().selectAudio("m"); });
  await tap("Voice");
  expect(toast()).toBe(SOUND_UNAVAILABLE);
  expect(openTool()).toBeNull();
  await act(async () => { st().select("a"); });
  await tap("Extract audio");
  expect(st().project!.audioTracks).toHaveLength(2);
});

test("a stored setting stays stored where the engine is missing", async () => {
  await act(async () => { st().apply((p) => setTrackSound(p, "m", { voice: "deep" })); });
  jest.mocked(isSoundAvailable).mockReturnValue(false);
  st().selectAudio("m");
  await render(<EditorToolbar />);
  await tap("Voice");
  expect(st().project!.audioTracks[0].sound).toEqual({ voice: "deep", strength: 0.5, pitch: 0, eq: null, level: false });
});
```

- [ ] **Step 2: Run** `npx.cmd jest src/editor/__tests__/toolbarContext.test.ts src/editor/__tests__/toolGroups.test.ts src/editor/__tests__/icons.test.ts src/editor/__tests__/EditorToolbar.test.tsx src/editor/__tests__/EditorToolbar.layers.test.tsx src/editor/__tests__/EditorToolbar.sound.test.tsx` → FAIL.
- [ ] **Step 3: Implement.**

`src/editor/toolbarContext.ts`:

1. `TOOL_IDS`: the audio line becomes `"addAudio", "ducking", "beats", "audioSplit", "audioVolume", "audioFade", "audioDuplicate", "audioDelete", "extractAudio", "voice", "soundQuality",`.
2. In `contextFor`, the audio bar's list becomes `keep([["audioSplit"], ["audioVolume"], ["audioFade"], ["voice"], ["soundQuality"], ["audioDuplicate"], ["audioDelete"], ["addAudio"], ["ducking"], ["beats", hasClips]])`.
3. In the layer list and in the clip list, right after `["volume", sounds]` insert `["extractAudio", sounds], ["voice", sounds], ["soundQuality", sounds],`.
4. Extend the doc comment of `contextFor` with: `Extract audio, Voice and Sound are on a video's bar exactly where Volume is (a clip that has sound); Voice and Sound are also on a sound's bar. On a clip the last two first put the clip's sound on the audio row (EditorToolbar).`

`src/editor/toolGroups.ts`: in the "Audio." block of `TOOL_META` add

```ts
  extractAudio: { label: "Extract audio", icon: "git-branch-outline" },
  voice: { label: "Voice", icon: "mic-outline" },
  soundQuality: { label: "Sound", icon: "stats-chart-outline" },
```

`src/editor/toolStrip.ts`: add `| "soundQuality"` to `StripId` and `| "voice"` to `PanelId`.

`src/editor/components/EditorToolbar.tsx`:

1. Imports: `import { isSoundAvailable } from "@/modules/clipy-video";`, `import { SOUND_UNAVAILABLE } from "@/src/editor/soundRenders";`, `import { EXTRACT_MESSAGES, useExtractAudio } from "@/src/editor/useExtractAudio";`, `import { SoundQualitySheet } from "./SoundQualitySheet";`, `import { VoiceSheet } from "./VoiceSheet";`.
2. After the `useFreezeFrame()` line: `const { extract, busy: extractBusy } = useExtractAudio();`
3. Before the `ACTIONS` table insert:

```ts
  /** Extract audio: the clip's sound becomes a bar (or is found on the audio row), and that bar is selected. */
  const extractSelected = () => {
    if (!selectedId) return;
    void extract(selectedId).then((r) => {
      if (!r) return;
      useEditorStore.getState().selectAudio(r.trackId);
      if (!r.made) useToast.getState().show(EXTRACT_MESSAGES.already);
    });
  };
  /**
   * Voice / Sound. On a sound's bar the tool opens. On a clip's bar the clip's sound is put on the audio row first (or found there):
   * select that bar first, open second, so the tool's key is the bar. Without the sound engine (Expo Go, an older build) it says so
   * and nothing changes — not even the extract.
   */
  const openSoundTool = (id: "voice" | "soundQuality") => {
    if (!isSoundAvailable()) { useToast.getState().show(SOUND_UNAVAILABLE); return; }
    if (bar === "audio") { openStrip(id); return; }
    if (!selectedId) return;
    void extract(selectedId).then((r) => {
      if (!r) return;
      useEditorStore.getState().selectAudio(r.trackId);
      openStrip(id);
      if (r.made) useToast.getState().show(EXTRACT_MESSAGES.moved);
    });
  };
```

4. In `ACTIONS`, after the `audioDelete` line:

```ts
    extractAudio: { disabled: extractBusy, onPress: extractSelected },
    voice: { disabled: extractBusy, onPress: () => openSoundTool("voice") },
    soundQuality: { disabled: extractBusy, onPress: () => openSoundTool("soundQuality") },
```

5. After the `<AudioFadeSheet … />` line mount:

```tsx
      {/* Voice (a compact panel) and Sound (a strip) edit the selected sound bar; on a clip the toolbar selects the clip's extracted bar first. */}
      <VoiceSheet trackId={selectedAudioId} visible={strip?.id === "voice"} onClose={closeStrip} />
      <SoundQualitySheet trackId={selectedAudioId} visible={strip?.id === "soundQuality"} onClose={closeStrip} />
```

6. In the component's doc comment, the list of momentary disabled buttons gains "Extract audio / Voice / Sound while a clip's file is asked whether it has sound".

- [ ] **Step 4: Run** the six suites, then `npm run typecheck` and `npm test`. A suite outside your list that fails **only** because a clip's, a layer's or a sound's bar has more buttons (a pinned list or count) is updated to the new list and named in your report; anything else is a mistake in the change.
- [ ] **Step 5: Commit** — `feat(editor): Extract audio, Voice and Sound on the toolbar (a clip's sound is put on the audio row first)`.

---

### Task 12: Export: copies prepared first, the uri swapped

**Depends on:** Task 7. **Parallel-safe with:** 9, 10, 11.

**Files:** Create `src/export/exportSounds.ts`, `src/export/__tests__/exportSounds.test.ts`. Modify `src/export/useExport.ts`, `src/export/__tests__/useExport.test.ts` (one mock added, tests appended).

**Do not touch:** `estimate.ts`, `modules/clipy-video/index.ts`, `audioMix.ts`, `ExportScreenBody.tsx`.

**Interfaces: Consumes** `ensureSound` (Task 7). **Produces**

```ts
// src/export/exportSounds.ts
export const SOUND_SHARE = 0.1;
export function prepareSounds(projectId: string, tracks: readonly AudioTrack[], onProgress: (fraction: number) => void): Promise<Map<string, string>>;   // track id → the copy's uri
```

- [ ] **Step 1: Failing tests.** Create `src/export/__tests__/exportSounds.test.ts`:

```ts
jest.mock("@/src/editor/soundRenders", () => ({ ensureSound: jest.fn() }));
import { ensureSound } from "@/src/editor/soundRenders";
import { makeAudioTrack, NO_SOUND, type SoundSettings } from "@/src/editor/model/types";
import { prepareSounds, SOUND_SHARE } from "../exportSounds";

const deep: SoundSettings = { ...NO_SOUND, voice: "deep" };
const plain = makeAudioTrack({ id: "m", sourceDuration: 9 });
const a = { ...makeAudioTrack({ id: "a", sourceDuration: 5, sourceUri: "file:///m/a.m4a" }), sound: deep };
const b = { ...makeAudioTrack({ id: "b", sourceDuration: 5, sourceUri: "file:///m/b.m4a" }), sound: { ...deep, level: true } };

beforeEach(() => jest.clearAllMocks());

test("the share of the export's progress the sounds take", () => expect(SOUND_SHARE).toBe(0.1));

test("no track with a setting: nothing is asked, nothing is reported", async () => {
  const progress = jest.fn();
  expect(await prepareSounds("p1", [plain], progress)).toEqual(new Map());
  expect(ensureSound).not.toHaveBeenCalled();
  expect(progress).not.toHaveBeenCalled();
});

test("each track with a setting gets its copy, in order, and the progress runs from 0 to 1 across them", async () => {
  jest.mocked(ensureSound).mockImplementation(async (_p, uri, _s, onProgress) => { onProgress?.(0.5); return `${uri}.copy`; });
  const seen: number[] = [];
  const out = await prepareSounds("p1", [plain, a, b], (f) => seen.push(f));
  expect([...out]).toEqual([["a", "file:///m/a.m4a.copy"], ["b", "file:///m/b.m4a.copy"]]);
  expect(jest.mocked(ensureSound).mock.calls.map((c) => [c[0], c[1], c[2]])).toEqual([["p1", "file:///m/a.m4a", deep], ["p1", "file:///m/b.m4a", { ...deep, level: true }]]);
  expect(seen).toEqual([0.25, 0.5, 0.75, 1]);
});

test("a copy that cannot be rendered stops everything with a sentence that carries the reason", async () => {
  jest.mocked(ensureSound).mockRejectedValueOnce(new Error("sound engine: boom"));
  await expect(prepareSounds("p1", [a, b], () => {})).rejects.toThrow("Could not prepare a sound for the export: sound engine: boom");
  expect(ensureSound).toHaveBeenCalledTimes(1);
});
```

In `src/export/__tests__/useExport.test.ts`: add next to the other mocks `jest.mock("@/src/editor/soundRenders", () => ({ ensureSound: jest.fn(async (_p: string, uri: string) => `${uri}.copy`) }));`, add `import { ensureSound } from "@/src/editor/soundRenders";` and `addExportListener` to the `@/modules/clipy-video` import, and append:

```ts
describe("sound settings", () => {
  const voiced = { ...makeAudioTrack({ id: "v", sourceUri: "file:///media/v.m4a", sourceDuration: 6, kind: "voice" as const, start: 1, trimStart: 0.5, trimEnd: 4, volume: 1.2, fadeIn: 0.5 }),
    sound: { voice: "deep" as const, strength: 0.5, pitch: 0, eq: null, level: false } };
  const withSound = makeProject({ id: "p1", clips: [b], audioTracks: [makeAudioTrack({ id: "m", sourceUri: "file:///media/m.m4a", sourceDuration: 9 }), voiced] });
  const sent = () => jest.mocked(exportTimeline).mock.calls[0][0];

  test("a track with a setting is exported from its copy, with the range and the gain it would have had", async () => {
    const { sound: _setting, ...asRecorded } = voiced;
    const plainProject = { ...withSound, audioTracks: [withSound.audioTracks[0], asRecorded] };
    const first = await renderHook(() => useExport(plainProject, []));
    await act(async () => { await first.result.current.start(1080); });
    const before = sent().audioTracks;
    jest.clearAllMocks();
    const { result } = await renderHook(() => useExport(withSound, []));
    await act(async () => { await result.current.start(1080); });
    expect(ensureSound).toHaveBeenCalledTimes(1);
    expect(jest.mocked(ensureSound).mock.calls[0].slice(0, 3)).toEqual(["p1", "file:///media/v.m4a", voiced.sound]);
    expect(sent().audioTracks).toEqual([before[0], { ...before[1], sourceUri: "file:///media/v.m4a.copy" }]);
  });

  test("a project without settings asks for nothing and its progress is the export's own", async () => {
    const { result } = await renderHook(() => useExport(project, []));
    await act(async () => { await result.current.start(1080); });
    expect(ensureSound).not.toHaveBeenCalled();
    const emit = jest.mocked(addExportListener).mock.calls[0][0];
    await act(async () => { emit({ jobId: "job1", type: "progress", progress: 0.5 }); });
    expect(result.current.state.progress).toBe(0.5);
  });

  test("with a setting the sounds take the first tenth of the progress", async () => {
    const { result } = await renderHook(() => useExport(withSound, []));
    await act(async () => { await result.current.start(1080); });
    const emit = jest.mocked(addExportListener).mock.calls[0][0];
    await act(async () => { emit({ jobId: "job1", type: "progress", progress: 0.5 }); });
    expect(result.current.state.progress).toBeCloseTo(0.55, 9);
  });

  test("a copy that cannot be rendered stops the export with the reason; nothing is sent", async () => {
    jest.mocked(ensureSound).mockRejectedValueOnce(new Error("sound engine: boom"));
    const { result } = await renderHook(() => useExport(withSound, []));
    await act(async () => { await result.current.start(1080); });
    expect(result.current.state).toEqual({ status: "error", progress: 0, message: "Could not prepare a sound for the export: sound engine: boom" });
    expect(exportTimeline).not.toHaveBeenCalled();
  });

  test("a track with a setting that lies wholly after the video is not rendered", async () => {
    const late = { ...withSound, audioTracks: [{ ...voiced, start: 99 }] };
    const { result } = await renderHook(() => useExport(late, []));
    await act(async () => { await result.current.start(1080); });
    expect(ensureSound).not.toHaveBeenCalled();
    expect(sent().audioTracks).toEqual([]);
  });
});
```

(The mock of `@/modules/clipy-video` at the top of that file keeps `addExportListener` as a `jest.fn`: `mock.calls[0][0]` is the listener the hook registered.)

- [ ] **Step 2: Run** `npx.cmd jest src/export/__tests__/exportSounds.test.ts src/export/__tests__/useExport.test.ts` → the new tests FAIL.
- [ ] **Step 3: Implement.**

Create `src/export/exportSounds.ts`:

```ts
import type { AudioTrack } from "@/src/editor/model/types";
import { ensureSound } from "@/src/editor/soundRenders";

/** The share of the export's progress that preparing the sounds takes (only when a track has a sound setting). */
export const SOUND_SHARE = 0.1;

/**
 * The changed copies of the tracks that have a sound setting: track id → the copy's uri. A copy that exists is used; a missing one
 * is rendered first, one after the other. `onProgress` runs 0 → 1 across them. A copy that cannot be rendered stops the export —
 * it never goes out with a different sound from the one that was chosen.
 */
export async function prepareSounds(projectId: string, tracks: readonly AudioTrack[], onProgress: (fraction: number) => void): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const changed = tracks.filter((t) => t.sound);
  for (let i = 0; i < changed.length; i++) {
    const t = changed[i];
    if (!t.sound) continue;
    try {
      out.set(t.id, await ensureSound(projectId, t.sourceUri, t.sound, (f) => onProgress((i + f) / changed.length)));
    } catch (e) {
      throw new Error(`Could not prepare a sound for the export: ${e instanceof Error ? e.message : String(e)}`);
    }
    onProgress((i + 1) / changed.length);
  }
  return out;
}
```

`src/export/useExport.ts`:

1. Add `import { prepareSounds, SOUND_SHARE } from "./exportSounds";`.
2. After the `jobId` ref add:

```ts
  /** The part of the progress taken before the video export starts (preparing changed sounds): 0 for a project without any. */
  const share = useRef(0);
```

3. In the listener, the progress line becomes

```ts
      if (e.type === "progress") setState((s) => ({ ...s, progress: share.current + (1 - share.current) * e.progress }));
```

4. In `start`, right after `jobId.current = null;` add `share.current = 0;`, and replace the two lines that build `mixed` and `audioTracks` with:

```ts
      const mixed: Project = { ...project, audioTracks: exportableAudio(project, missingSourceUris) };
      // A track with a sound setting (Voice / Sound) is exported from its changed copy: same range, same gain curve, another file.
      // Only tracks that are inside the video are prepared; a copy that is missing is rendered first.
      const inside = mixed.audioTracks.filter((t) => toExportAudioTrack(mixed, t, total) !== null);
      share.current = inside.some((t) => t.sound) ? SOUND_SHARE : 0;
      const copies = await prepareSounds(project.id, inside, (f) => setState((s) => (s.status === "exporting" ? { ...s, progress: f * SOUND_SHARE } : s)));
      const audioTracks = mixed.audioTracks.flatMap((t): ExportAudioTrack[] => {
        const sent = toExportAudioTrack(mixed, t, total);
        return sent ? [{ ...sent, sourceUri: copies.get(t.id) ?? sent.sourceUri }] : [];
      });
```

(the existing two-line comment above `mixed` stays). Nothing else in the file changes: the `catch` at the end of `start` already turns the thrown sentence into the error state.

- [ ] **Step 4: Run** the two suites → PASS (every existing `useExport` test unedited and green). Then `npm run typecheck` and `npm test`.
- [ ] **Step 5: Commit** — `feat(export): a track with a sound setting is exported from its changed copy (rendered first when missing)`.

---

### Task 13: Swift read-through review, then the ONE EAS build

**Depends on:** Tasks 1–12 merged and green. **This is the single native build of the round.**

**Files:** Modify only what the review finds, in `modules/clipy-video/ios/SoundMath.swift`, `SoundRender.swift`, `ClipyVideoModule.swift`, `ExportSession.swift` (the audio-track loop) and, if a pinned string changes, `soundRender.swift.test.ts` / `soundMath.parity.test.ts`.

**Do not touch:** anything in `src/` that is not one of those two tests; `eas.json`; `app.json`.

- [ ] **Step 1: The review.** Dispatch an **independent reviewer** (a fresh agent that did not write Task 5 or 6; give it the files, not a verdict): `modules/clipy-video/ios/SoundMath.swift`, `SoundRender.swift`, `ClipyVideoModule.swift`, the audio-track loop of `ExportSession.swift`, `git diff main -- modules/clipy-video/ios`, spec §5, and `node_modules/expo-modules-core/ios` to read the `Record`, `Promise`, `AsyncFunction`, `Function` and `Events` declarations against. It answers each of these, with the line where it is not a clean yes:
  1. **Redeclarations.** Is any `let` / `var` / `func` / type name declared twice in one scope, or a `static let` beside a `static func` of the same name? Does any new type name exist elsewhere in the module?
  2. **Sync / async.** Is every `scheduleBuffer` call inside a non-`async` function, with `completionHandler: nil`? Is there any `await` inside `process`, `measure`, `render`, `through`? Is `AVAudioUnit.instantiate(with:options:)` called with `try await` inside an `async` function?
  3. **Weak assets.** For every `AVAssetTrack` used: which strong reference keeps its `AVURLAsset` alive, and until when? (`SoundSource.asset`; in `soundInfo`, the local `asset` to the end of the closure.)
  4. **Optionals.** Every failable call (`AVAudioFormat(standardFormatWithSampleRate:channels:)`, `AVAudioPCMBuffer(pcmFormat:frameCapacity:)`, `floatChannelData`, `CMSampleBufferGetFormatDescription`, `CMAudioFormatDescriptionGetStreamBasicDescription`, `CMSampleBufferGetDataBuffer`, `copyNextSampleBuffer`) unwrapped before use? No force unwrap anywhere?
  5. **Types.** `AVAudioFrameCount` (UInt32) against `Int` in every arithmetic line; `Float` against `Double`; `delayTime` is a `TimeInterval`; the dictionaries typed `[String: Any]`; the three name tables typed with the right enum; `kAudioFormatLinearPCM` / `kAudioFormatMPEG4AAC` as dictionary values.
  6. **Closures.** Does any closure capture a non-escaping closure parameter and then escape? (`progress` and `sink` are only passed down as non-escaping arguments.) Is the mutation of `lastSent`, `file`, `sum`, `count` inside a non-escaping closure only?
  7. **Errors.** Does every failure path produce `sound <stage>: …` with `ExportSession.describe` where an `Error` exists? Does `catch SoundError.cancelled` come before the general `catch`? Is the `part-` file removed on every exit that is not success?
  8. **The loop.** Can it run for ever (source ends, engine stalls, cancel)? Is the copy exactly as long as what was scheduled? What happens for a source of 0 frames?
  9. **Expo Modules API.** Do `AsyncFunction(…) { (request: SoundRenderRequest, promise: Promise) in … }` and the `Record` with a `[SoundBand]` field match what `expo-modules-core` in `node_modules` declares, the same way `exportTimeline` / `ExportRequest` / `[ExportGainPoint]` already do?
  10. **Imports.** `AudioToolbox`, `AVFoundation`, `ExpoModulesCore` in `SoundRender.swift`; `Foundation` only in `SoundMath.swift`. Does anything need a framework the podspec must list (it lists `Speech` only; `AVFoundation` and `AudioToolbox` are linked automatically, as `AVFoundation` already is)?
- [ ] **Step 2: Fix** every finding in the Swift (and a pinned string in the two swift-reading tests when a line they quote changed). Re-run `npx.cmd jest src/editor/model/__tests__/soundRender.swift.test.ts src/editor/model/__tests__/soundMath.parity.test.ts src/editor/model/__tests__/audioMix.parity.test.ts src/editor/__tests__/looks.frozen.test.ts`, then `npm run typecheck` and `npm test`. If anything was changed: commit — `fix(native): sound render — findings of the Swift read-through`. If the reviewer found a design problem (not a slip), stop and report instead of building.
- [ ] **Step 3: The build.** Only now, once: `npx.cmd eas-cli build --profile development --platform ios --non-interactive --no-wait --json`. Note the build id and URL from the JSON. Check it with `npx.cmd eas-cli build:view <id> --json` until it is `FINISHED` or `ERRORED` (about 6–10 minutes; do not start a second build while one is running).
- [ ] **Step 4: If it errored,** read the Xcode log (`npx.cmd eas-cli build:view <id>` gives the log URL), fix exactly what the compiler names, re-run the four suites and the full checks, commit — `fix(native): <what the compiler said>` — and build again. Every extra build is reported with its reason. **No other change rides along.**
- [ ] **Step 5: Hand over.** Give the owner the install link and Part B of the device checklist (below). Nothing is committed in this step.

---

### Task 14: Docs, full checks, device checklist

**Depends on:** Tasks 1–13.

**Files:** Modify `README.md`, `AGENTS.md`, `docs/superpowers/specs/2026-10-07-sound-tools-design.md`; any file the sweep below names.

**Do not touch:** behaviour. A failing test means a mistake here.

- [ ] **Step 1: Sweep** with the Grep tool (not `sed`) and fix what is found:
  - `git diff --stat main -- modules/clipy-video/ios` shows only `SoundMath.swift`, `SoundRender.swift` (new), `ClipyVideoModule.swift` and `ExportSession.swift`; `git diff main -- modules/clipy-video/ios/AudioMix.swift` is empty.
  - `git diff --stat main -- src/editor/model/audioMix.ts src/editor/model/audioSync.ts src/editor/model/timeline.ts src/editor/previewHandoff.ts src/editor/timelineScroll.ts src/editor/components/PreviewPlayer.tsx src/ui src/theme` is **empty**.
  - `git diff --stat main -- src/__tests__` is **empty** (no guard's allow-list grew); `git diff --stat main -- src/editor/__tests__/looks.frozen.test.ts` is empty; no existing `*.parity.test.ts` / `*.swift.test.ts` changed.
  - `sound: undefined`, `sound: null` in `src/` outside tests: none. `.sound =` outside `ops.ts` (`setTrackSound`) and `migrate.ts`: none.
  - `renderSound(` called outside `soundRenders.ts` (`ensureSound`) and tests: none. `soundChain(` called outside `soundRenders.ts` and tests: none.
  - `extractClipAudio(` called outside `useExtractAudio.ts` and tests: none.
  - Comments that still say "v17" for the current schema, or "51" tools: corrected (not historical test titles).
- [ ] **Step 2: Docs.**
  - `README.md`, section **Audio**: add three bullets. **Extract audio** — select a video clip, **Extract audio**: its sound becomes a bar named "Clip sound" on the sound-effects lane and the clip is muted; the bar is an ordinary sound (move, trim, split, fade, delete) and no longer follows the clip; not for a clip that is sped up, slowed down or reversed; one Undo puts it back. **Voice** — on a sound bar: None, Deep, High, Chipmunk, Robot, Echo, Hall, Telephone; **Strength**; **Pitch** (−12 to +12, on its own or added to a voice); on a video clip the same button first moves the clip's sound to the audio row. **Sound** — equaliser presets None, Bass boost, Clear voice, Warm, Bright, and **Even out loudness** (a level match, not a compressor). Then one paragraph: the original file is never changed; picking an effect renders a changed copy once (the whole file, so a long one takes longer), kept in the project's `sound` folder and removed when no bar needs it; the bar plays its original until the copy is ready; these two tools need the native build.
  - `README.md`, the toolbar line for **A sound** (about line 220): `Split, Volume, Fade, Voice, Sound, Duplicate, Delete, Add audio, Ducking, Beats`; add `Extract audio, Voice, Sound` to the clip tools list where Volume is named.
  - `README.md`, **First native build — things to check**: add the items of spec §10 as one numbered item, "Sound tools", with the seven sub-points.
  - `AGENTS.md` "This repo": after the **Audio mix maths** bullet add ``- Sound tools: an audio track's `sound` setting is optional and ABSENT when the sound is as recorded (never null / undefined / neutral); only `setTrackSound` writes it and only `extractClipAudio` extracts (a clip has no sound setting: Voice / Sound on a clip extract first, in EditorToolbar). What a setting MEANS is `soundChain` in `src/editor/model/sound.ts` — TypeScript only, sent as numbers in the render request; never mirror the tables in Swift, and raise `SOUND_VERSION` when they change. The one mirrored pair is `src/editor/model/soundMath.ts` ↔ `modules/clipy-video/ios/SoundMath.swift` (constants and formulas). A changed copy is the WHOLE source rendered to `<project>/sound/<soundFileName>` and has the source's timing: the preview (`playUri`) and the export (`prepareSounds`) swap only the uri, so audioMix.ts / AudioMix.swift are untouched. Renders start only in `ensureSound` (soundRenders.ts): never during a slider drag (`holdSounds`), never for a project change that is not a sound setting, and a render never writes the project. In `SoundRender.swift` the loop is synchronous (`scheduleBuffer(_:completionHandler: nil)`), `SoundSource` holds the asset, and every failure is `sound <stage>: ` + `ExportSession.describe`. Gate the tools with `isSoundAvailable()`, not `isNativeAvailable()`.``
  - Spec: Status → `Implemented <date> (on-device confirmation by the owner pending)`; add a section **3a. As built** after §3: the commit of each task, the build id(s) and how many builds it took and why, every finding of the Swift read-through and its fix, every deviation the tasks reported (values that changed, tests whose expectations changed — file and what, files outside the plan), and what no test checks (§10 item by item).
- [ ] **Step 3: Full checks.** `npm run typecheck`; `npm test`; `npx.cmd expo-doctor`; `git status --short` shows nothing unexpected; `git diff --stat main` shows **no change** under `ios/`, `android/`, `supabase/`, `src/publish/`, `src/theme/`, `src/ui/`, `package.json`, `app.json`, `eas.json`, `assets/`.
- [ ] **Step 4: Commit** — `git add` the files changed (explicit paths); `docs: sound tools as built, README, AGENTS, device checklist`.

---

## Pairwise: what each task hands the next, and what may run side by side

| Pair | Shared file or interface | Producer hands over | Consumer relies on | Side by side? |
|---|---|---|---|---|
| 1 → 2 | `types.ts` | `SoundSettings`, `VoiceId`, `EqId`, `AudioTrack.sound?` | reads only; creates `sound.ts`, `soundMath.ts` | no (2 after 1) |
| 1 → 3 | `types.ts` | `clampSound`, `NO_SOUND` | reads only; edits `ops.ts` | no (3 after 1) |
| 1 → 9, 10 | `soundTools.ts` | `VOICES`, `EQS` | reads only | no |
| 2 ∥ 3 | — | 2: `soundChain`, `soundFileName`, `neededSounds` · 3: `setTrackSound`, `extractClipAudio` | neither reads the other | **yes** — 2 must not touch `ops.ts`; 3 must not touch `sound.ts` |
| 2 → 5 | `soundMath.ts` (read by the parity test) | `LEVEL`, `SOFT_CLIP` | `soundMath.parity.test.ts` imports them | 5's Swift may be written beside 2; its **test** is green only after 2 |
| 2 → 4 | `sound.ts` | `SoundChain` | `SoundRenderRequest extends SoundChain` | no (4 after 2) |
| 3 ∥ 5 | — | — | nothing in common | **yes** |
| 4 ∥ 6 | the request's field names | fixed by this plan (Task 4's interface = Task 6's record); `soundRender.swift.test.ts` (Task 6) compares the record with `soundChain`'s keys | 6 must not edit `index.ts`; 4 must not edit `ios/` | **yes** |
| 5 → 6 | `SoundMath.swift` | `SoundMath.dbToGain`, `levelGainDb`, `softClip`, `levelBlockSeconds` | called by `SoundRender` | no (6 after 5) |
| 4 → 7 | `index.ts` | `renderSound`, `cancelSoundRender`, `addSoundListener`, `isSoundAvailable`, `isSoundCancelled` | `soundRenders.ts` | no (7 after 4) |
| 3, 4 → 8 | `ops.ts`, `index.ts` | `extractClipAudio`, `extractRefusal`, `extractedTrackOf`; `soundInfo`, `isSoundAvailable` | `useExtractAudio.ts` | no (8 after both) |
| 6 ∥ 7, 6 ∥ 8 | — | — | 6 is Swift and one swift-reading test; 7 and 8 are TypeScript | **yes** |
| 7 ∥ 8 | — | 7: `soundFiles.ts`, `soundRenders.ts`, `AudioPreview.tsx`, the editor screen · 8: `useExtractAudio.ts` | nothing in common | **yes** |
| 3, 7 → 9 | `ops.ts`, `soundFiles.ts`, `soundRenders.ts` | `setTrackSound`; `isPreparing`, `useSoundFiles`; `holdSounds` | `VoiceSheet.tsx` | no (9 after both) |
| 3, 7 → 10 | same, plus `index.ts` | `setTrackSound`; `isPreparing`; `probeNoiseReduction`, `isSoundAvailable` | `SoundQualitySheet.tsx` | no (10 after both) |
| 9 ∥ 10 | — | 9: `VoiceSheet` · 10: `SoundQualitySheet` | nothing in common; neither touches `EditorToolbar.tsx` | **yes** |
| 7 → 12 | `soundRenders.ts` | `ensureSound(projectId, sourceUri, sound, onProgress?)` | `exportSounds.ts` | no (12 after 7) |
| 12 ∥ 9, 10, 11 | — | 12: `useExport.ts`, `exportSounds.ts` | nothing in common | **yes** |
| 8, 9, 10 → 11 | `EditorToolbar.tsx`, `toolStrip.ts`, `toolbarContext.ts`, `toolGroups.ts` | `useExtractAudio()`, `EXTRACT_MESSAGES`; `VoiceSheet({ trackId, visible, onClose })`; `SoundQualitySheet({ trackId, visible, onClose })`; `SOUND_UNAVAILABLE` | 11 adds the ids, the buttons, the actions and the mounts | no (11 after all three, alone on those files) |
| 5, 6 → 13 | the four Swift files | the complete Swift | the review and the one build | no (13 after everything) |
| 1–13 → 14 | docs | — | — | no (last) |

**Until Task 11 lands** none of the three tools can be reached in the app: the ops, the manager and the sheets exist and are tested on their own. That is intended: no commit leaves a button without its tool.

**Parallel order, with what each may not touch**

1. **Task 1** alone.
2. **Tasks 2, 3, 5** together. 2: only its five new files. 3: only `ops.ts` and its test. 5: only `SoundMath.swift` and its parity test (red until 2 has landed).
3. **Tasks 4 and 6** together. 4: only `index.ts` and `index.test.ts`. 6: only `SoundRender.swift`, `ClipyVideoModule.swift`, the one guard in `ExportSession.swift`, and its swift-reading test. Neither starts a build.
4. **Tasks 7 and 8** together (6 may still be running). 7: `soundFiles.ts`, `soundRenders.ts`, `AudioPreview.tsx`, `app/editor/[id]/index.tsx`, their tests. 8: `useExtractAudio.ts` and its test.
5. **Tasks 9, 10 and 12** together. 9: `VoiceSheet.tsx` and its test. 10: `SoundQualitySheet.tsx` and its test. 12: `exportSounds.ts`, `useExport.ts`, their tests. None touches `EditorToolbar.tsx`, `toolStrip.ts`, `toolbarContext.ts`, `toolGroups.ts`.
6. **Task 11** alone on the toolbar files (12 may still be running).
7. **Task 13** alone: the review, the fixes, **the one build**.
8. **Task 14** alone.

---

## Device checklist (owner)

In one line: **Part A works today** (Expo Go, or the app you already installed). **Part B needs the new app**, which you install once from the link I send after the build.

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
