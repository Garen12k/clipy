# Find beats in your own music, Remove background: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** **Find beats** works for any sound bar (a song from Files, a clip sound, a voice-over), by decoding the file natively and running the detector the bundled tracks were analysed with; and a **Remove background** switch on a photo, a video clip or a layer cuts the person out with Apple's people detection, as a rendered cut-out copy that the preview and the export swap in; while every project that exists loads, previews and exports exactly as before and nothing is ever analysed, rendered or changed on its own.

**Architecture:** *Beats:* new `BeatEnvelope.swift` decodes a file's sound to float PCM and returns the detector's first stage, the onset envelope (about 100 numbers a second): the one mirrored pair, `onsetEnvelope` ↔ `BeatEnvelope.swift`. `beatDetect.ts` is cut into resumable pieces (`coarsePeriod`, `finePeriodSlice`, `beatsFromPeriod`, `isSteady`) that compute what it computed; `src/editor/ownBeats.ts` runs them in slices, applies the generator's acceptance rule and remembers the answer for the session; `BeatsSheet.tsx` then calls the existing `placeBeats`. No schema change for beats. *Background:* schema v20 with ONE optional key, `Clip.cutout?: true`, read only through `activeCutout`. `src/editor/model/cutout.ts` (pure) names and ranges the copies; `cutoutRenders.ts` renders them one at a time through native `renderCutout` (new `CutoutRender.swift`: AVAssetReader → Vision person mask → Core Image → HEVC with alpha in a `.mov` that keeps the source's timing and sound; a photo → a PNG plus a still movie); `ClipFrame.tsx` / `LayerStack.tsx` show the copy; `useExport.ts` sends the copy's uri. `ExportSession.swift`, `ClipyCompositor.swift`, `MediaPrePass.swift`, `PreviewPlayer.tsx` and `LayerVideo.tsx` are not edited.

**Tech Stack:** Expo SDK 57, React Native 0.86, TypeScript strict, Zustand 5, `expo-video`, `expo-file-system`, `@expo/vector-icons` 15 (Ionicons), Jest (`jest-expo`) + RNTL 14.0.1; Swift 5.9 (Expo Modules API, AVFoundation, Vision, Core Image, VideoToolbox, ImageIO), deployment target iOS 16.4. **No new package, no new asset. One new native build.**

**Spec:** `docs/superpowers/specs/2026-10-09-beats-background-design.md` (binding; §3 the decisions, §4 schema and the proof, §5 beats API and numbers, §6 cut-out API, numbers and the verified-API table, §8 edge cases).

## Global Constraints

- **iPhone only.** No Android or web configuration, files or code paths.
- **Expo Go must keep working, and so must the build installed today.** Everything native is reached through `modules/clipy-video/index.ts`. Find beats for own music is gated by `isBeatEnvelopeAvailable()`, Remove background by `isCutoutAvailable()`; both say `BEATS_BACKGROUND_TOOLS` where the build is too old and never throw "undefined is not a function". `package.json`, `app.json`, `eas.json` and `assets/` are not edited.
- **Nothing existing changes.** A bundled track, a clip without `cutout` and a project nobody taps go through exactly the expressions they do today. Where an existing function is edited, the edit is a branch existing callers do not take, or a split into pieces that compute the same. The PROOF tests of this plan (Tasks 1, 2) are written once and never edited to make a change pass. `beatDetect.test.ts`, `musicBeats.test.ts` and `assets/music/beats.json` are not edited.
- **Nothing happens on its own.** Markers are written only by `placeBeats` / `cutToBeats` from a tap or a slider drag; `cutout` only by `setClipCutout` from the switch. A render never writes the project.
- **An optional key is absent, never `undefined`, `null` or `false`, in anything stored.** Tests check with `"cutout" in clip`.
- **Never edited this batch:** `src/editor/components/PreviewPlayer.tsx`, `src/editor/components/LayerVideo.tsx`, `src/editor/previewHandoff.ts`, `src/editor/timelineScroll.ts`, `src/editor/model/timeline.ts`, `src/editor/model/audioMix.ts`, `src/editor/soundRenders.ts`, `src/editor/soundFiles.ts`, `src/editor/musicBeats.ts`, `scripts/generate-beats.mjs`, `assets/music/*`, `modules/clipy-video/ios/ExportSession.swift`, `ClipyCompositor.swift`, `MediaPrePass.swift`, `SoundRender.swift`, `SpeechRender.swift` and every other existing Swift file except `ClipyVideoModule.swift`, `EditorLayout.tsx`, `Timeline.tsx`, `src/ui/*`, `src/theme/*`, `src/editor/__tests__/looks.frozen.test.ts`, every existing `*.parity.test.ts`, the guard tests in `src/__tests__`, anything under `src/publish/` or `supabase/`.
- **Only `src/editor/model/beats.ts` turns beats into markers**, and outside tests `placeBeats` / `cutToBeats` are still called only by `BeatsSheet.tsx` and `src/projects/quickEdit.ts`.
- **Swift rules (there is no Swift toolchain here; the code is checked by reading):** (1) every `AVURLAsset` stays in a stored property or a local of the function that uses its tracks and readers, for as long as they are used; (2) every failure is a staged message (`beats <stage>: …`, `cutout <stage>: …`) with `ExportSession.describe(error)` wherever an `Error` exists; (3) no name declared twice in one scope, no `static let x` beside `static func x(`; (4) inside an `async` function every call that has both a completion-handler and an `async` form is written with `await`, and no `await` sits inside an `autoreleasepool` closure; (5) no Apple symbol newer than iOS 16.4 (this batch names none: `VNGeneratePersonSegmentationRequest` is 15.0, `hevcWithAlpha` and `kVTCompressionPropertyKey_TargetQualityForAlpha` 13.0, `UTType` 14.0); (6) `promise.resolve` gets a typed `[String: Any]`; (7) no force unwrap, no `try!`, no `as!`; (8) output is written to `part-<name>` and moved; (9) every promise is settled exactly once; (10) an Objective-C exception cannot be caught: writer settings go through `canApply(outputSettings:forMediaType:)` and inputs / outputs through `canAdd` before they are used.
- UI from `src/ui/` and `src/theme/theme.ts` only; **no hex literals**; **spacing from `theme.space` only** (`spacingScale.test.ts`: never add to its allow-table, never rely on its blind spots, so no apostrophe in JSX text and no `*` or `/` in a spacing value); icons are Ionicons outline names; rows have explicit heights.
- **Motion rules:** no new animation. No Reanimated, no timers that drive a view, no entering / exiting.
- **One user action = one undo step:** a tap is one `apply`, a drag is `beginTransaction` + `applyTransient`.
- Never seed React state from an effect keyed on a gesture-driven value. `useState` initial values and event handlers only (an effect keyed on `visible` may reset).
- RNTL v14: `render` / `fireEvent` / `rerender` are async: always `await`.
- A test that fails after your change because it names a **pinned count, id list, key list, sentence or schema number** listed in your task is updated as the task says. A test that fails for any other reason means a mistake in the change: fix the change.
- Tasks that run side by side share one working tree: a red suite that belongs to a file another task owns is not yours to fix. Never edit a file outside your task's list.
- Windows: PowerShell, no `&&`, `npx.cmd`. **Never run `expo lint`.** **No broad `sed`.** **Never `git stash`.** **`git add` explicit paths only, never `-A` / `.`.** **Do not start or stop a dev server** (one is serving this tree to the owner's phone). Before each commit: `npm run typecheck` and `npm test` green. Commit trailer exactly `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Task order

`(1 || 2 || 4) -> (3 || 5 || 7) -> (6 || 8 || 12) -> (9 || 10 || 11) -> 13 -> 14`

| Task | Feature | Title | Depends on | Parallel-safe with | Native? |
|---|---|---|---|---|---|
| 1 | background | Schema v20: `Clip.cutout`, `activeCutout`, `setClipCutout`, the PROOF migration | — | 2, 4 | no |
| 2 | beats | The detector in resumable pieces; `beatTrack` fallback; the PROOF | — | 1, 4 | no |
| 3 | background | The cut-out model (`cutout.ts`): names, ranges, the covering copy | 1 | 5, 7 | no |
| 4 | both | The native wrapper and the build label (`index.ts`, `buildInfo.ts`) | — | 1, 2 | no (JS side) |
| 5 | beats | Own beats: the range, the sliced analysis, the listener (`ownBeats.ts`) | 2, 4 | 3, 7 | no |
| 6 | beats | The Beats panel: Find beats for own music | 5 | 8, 12 | no |
| 7 | beats | Swift: `BeatEnvelope.swift`, the module functions, the parity test | 4 | 3, 5 | **Swift** |
| 8 | background | The copies: `cutoutFiles.ts`, `cutoutRenders.ts`, mounted in the editor | 3, 4 | 6, 12 | no |
| 9 | background | The preview: `ClipFrame`, `LayerStack`, the Preview tag | 8 | 10, 11 | no |
| 10 | background | The tool: `contextFor`, the strip, the toolbar | 1, 8 | 9, 11 | no |
| 11 | background | The export: `prepareCutouts`, the request rewrite | 8 | 9, 10 | no |
| 12 | background | Swift: `CutoutRender.swift`, the module functions | 7 (shares `ClipyVideoModule.swift`) | 6, 8 | **Swift** |
| 13 | both | **Swift read-through review, then the ONE EAS build** | 1–12 | — | **the single native build** |
| 14 | both | Docs, full checks, device checklist | 1–13 | — | no |

**All Swift is in Tasks 7 and 12. Task 13 is the only build.** No task before 13 starts a build. The tasks are written below in the order they run (1, 2, 4 · 3, 5, 7 · 6, 8, 12 · 9, 10, 11 · 13 · 14), not in number order.

**What the owner can test before the new build:** after Tasks 6 and 10 both tools are on screen and say they need the latest build (Part A of the checklist). Nothing else of this batch runs without the build.

**Files more than one task edits:** `modules/clipy-video/ios/ClipyVideoModule.swift`: Task 7, then Task 12. Everything else has one owner: `types.ts`, `migrate.ts`, `ops.ts` Task 1 · `beatDetect.ts`, `beats.ts` Task 2 · `cutout.ts` Task 3 · `index.ts`, `buildInfo.ts` Task 4 · `ownBeats.ts` Task 5 · `BeatsSheet.tsx` Task 6 · `BeatEnvelope.swift` Task 7 · `cutoutFiles.ts`, `cutoutRenders.ts`, `app/editor/[id]/index.tsx` Task 8 · `ClipFrame.tsx`, `CutoutFollower.tsx`, `LayerStack.tsx`, `PreviewTag.tsx` Task 9 · `toolbarContext.ts`, `toolGroups.ts`, `toolStrip.ts`, `EditorToolbar.tsx`, `CutoutSheet.tsx` Task 10 · `exportCutouts.ts`, `useExport.ts` Task 11 · `CutoutRender.swift` Task 12.

**Pinned values that change, and who changes them:** schema number 19 → 20 (Task 1: `migrate.test.ts` and the twelve `types.*.test.ts`) · the build label and its mock (Task 4: `buildInfo.test.ts`) · the "own music" sentence and the disabled button of `BeatsSheet.auto.test.tsx` (Task 6) · `TOOL_IDS` 54 → 55 and the `CLIP` / `LAYER` lists of `toolbarContext.test.ts` (Task 10) · the module's event list (Task 12: any swift-reading test that quotes `Events("onExportEvent", "onSoundEvent")`).

---

### Task 1: Schema v20: `Clip.cutout`, `activeCutout`, `setClipCutout`, the PROOF migration

**Depends on:** nothing. **Parallel-safe with:** 2, 4.

**Files:** Create `src/editor/model/__tests__/types.cutout.test.ts`. Modify `src/editor/model/types.ts`, `src/editor/model/migrate.ts`, `src/editor/model/ops.ts` (one new op), `src/editor/model/__tests__/migrate.test.ts` (pinned number + append), and the pinned number in `types.audio.test.ts`, `types.clip.test.ts`, `types.layers.test.ts`, `types.layers2.test.ts`, `types.look.test.ts`, `types.motion.test.ts`, `types.noise.test.ts`, `types.photo.test.ts`, `types.polish.test.ts`, `types.sound.test.ts`, `types.speed.test.ts`, `types.text.test.ts`.

**Do not touch:** `setClipReversed` and every other existing op, `timeline.ts`, every component.

**Interfaces: Produces**

```ts
// src/editor/model/types.ts
export const SCHEMA_VERSION = 20 as const;
export interface Clip { /* … */ cutout?: true }
export const activeCutout: (c: Clip) => boolean;              // cutout === true and not reversed
// src/editor/model/ops.ts
export function setClipCutout(p: Project, id: string, on: boolean): Project;   // main clip or layer; same project when refused or unchanged
```

- [ ] **Step 0: Baseline.** `npm run typecheck` and `npm test` are green on the untouched tree. If not, stop and report.
- [ ] **Step 1: Failing tests.**

Create `src/editor/model/__tests__/types.cutout.test.ts`:

```ts
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-09T10:00:00.000Z" }));
import { migrateProject } from "../migrate";
import { duplicateClip, setClipCutout, splitClipAt } from "../ops";
import { activeCutout, makeClip, makeLayer, makePhotoClip, makeProject, newLayer, SCHEMA_VERSION, type Clip } from "../types";

const project = () => makeProject({
  clips: [makeClip({ id: "a", sourceDuration: 8 }), makePhotoClip({ id: "ph" }), makeClip({ id: "r", sourceDuration: 5, reversed: true })],
  layers: [makeLayer({ id: "L", sourceDuration: 6 })],
});
const item = (p: ReturnType<typeof project>, id: string): Clip => [...p.clips, ...p.layers].find((c) => c.id === id)!;

test("schema is v20; a new clip, photo and layer have no cutout key", () => {
  expect(SCHEMA_VERSION).toBe(20);
  for (const c of [makeClip({ id: "x", sourceDuration: 3 }), makePhotoClip({ id: "y" }), makeLayer({ id: "z", sourceDuration: 3 })]) {
    expect("cutout" in c).toBe(false);
    expect(activeCutout(c)).toBe(false);
  }
});

test("setClipCutout switches it on for a clip, a photo and a layer, and off again leaves no key", () => {
  const p0 = project();
  for (const id of ["a", "ph", "L"]) {
    const on = setClipCutout(p0, id, true);
    expect(on).not.toBe(p0);
    expect(item(on, id).cutout).toBe(true);
    expect(activeCutout(item(on, id))).toBe(true);
    expect(setClipCutout(on, id, true)).toBe(on);                 // already on: the same project
    const off = setClipCutout(on, id, false);
    expect("cutout" in item(off, id)).toBe(false);
    expect({ ...item(off, id) }).toEqual({ ...item(p0, id) });    // back as it was
    expect(setClipCutout(off, id, false)).toBe(off);              // already off: the same project
  }
  expect(setClipCutout(p0, "nope", true)).toBe(p0);
});

test("a reversed clip is refused, and a clip reversed afterwards is not active", () => {
  const p0 = project();
  expect(setClipCutout(p0, "r", true)).toBe(p0);
  expect(activeCutout({ ...makeClip({ id: "x", sourceDuration: 3 }), cutout: true, reversed: true })).toBe(false);
});

test("a layer made from a clip, a duplicate and both halves of a split keep it", () => {
  const on = setClipCutout(project(), "a", true);
  expect(newLayer(item(on, "a"), 0).cutout).toBe(true);
  const cut = splitClipAt(on, 3);
  expect(cut.clips.slice(0, 2).map((c) => c.cutout)).toEqual([true, true]);
  const twice = duplicateClip(on, "a");
  expect(twice.clips.filter((c) => c.cutout === true)).toHaveLength(2);
});

test("the sanity pass keeps exactly true on a clip that plays forwards and removes everything else", () => {
  const withKey = (id: string, cutout: unknown, extra: Partial<Clip> = {}) => ({ ...makeClip({ id, sourceDuration: 4, ...extra }), cutout }) as unknown as Clip;
  const p = migrateProject(makeProject({ clips: [withKey("ok", true), withKey("no", false), withKey("one", 1), withKey("text", "true"), withKey("nil", null), withKey("rev", true, { reversed: true })] }));
  const clip = (id: string) => p.clips.find((c) => c.id === id)!;
  expect(clip("ok").cutout).toBe(true);
  for (const id of ["no", "one", "text", "nil", "rev"]) expect("cutout" in clip(id)).toBe(false);
  expect(migrateProject(p)).toEqual(p);
});
```

(`duplicateClip(p, id)` and `splitClipAt(p, projectTime)` exist in `ops.ts`; if the duplicate op has another name there, use the one `EditorToolbar.tsx`'s `duplicateSelected` calls for a main clip.)

Append to `src/editor/model/__tests__/migrate.test.ts` (add to its imports whatever is missing of `setClipChroma`, `setClipSpeedCurve`, `setPhotoMotion`, `setTrackSound` from `../ops`, `makeAudioTrack`, `makeClip`, `makeLayer`, `makePhotoClip`, `makeProject` from `../types`):

```ts
test("PROOF v19 → v20: the migration changes the number and nothing else — a noise setting, a smooth speed curve, a green screen, a photo's Motion, a layer, music and beats are kept as stored, and nothing gains a cutout key", () => {
  let now = makeProject({
    clips: [makeClip({ id: "a", sourceDuration: 8 }), makePhotoClip({ id: "ph", seconds: 4 }), makeClip({ id: "g", sourceDuration: 6 })],
    layers: [makeLayer({ id: "L", sourceDuration: 5, start: 1.5 })],
    audioTracks: [makeAudioTrack({ id: "v1", sourceDuration: 6, kind: "voice", start: 3 }), makeAudioTrack({ id: "m1", sourceDuration: 30, trimStart: 2.5, trimEnd: 10 })],
    ducking: true, beatMarkers: [1, 2.5, 9.75],
  });
  now = setTrackSound(now, "v1", { noise: 0.75 });
  now = setClipSpeedCurve(now, "a", "hero", true);                  // a smooth curve: 32 steps
  now = setClipChroma(now, "g", { color: "#00FF00", strength: 0.5 });
  now = setPhotoMotion(now, "ph", { id: "zoomIn", strength: 0.5 });
  expect(now.clips[0].speedCurve?.steps).toHaveLength(32);
  expect(migrateProject(now)).toEqual(now);                         // the fixture is a clean v20 project
  const v19 = JSON.parse(JSON.stringify(now)) as { schemaVersion: number };
  v19.schemaVersion = 19;
  const frozen = JSON.stringify(v19);
  const p = migrateProject(v19);
  expect(JSON.stringify(v19)).toBe(frozen);                         // the stored object is not mutated
  expect({ ...p, schemaVersion: 19 }).toEqual(v19);                 // nothing but the number differs from the file
  expect(p.schemaVersion).toBe(20);
  for (const c of [...p.clips, ...p.layers]) expect("cutout" in c).toBe(false);
  expect(p.audioTracks[0].sound?.noise).toBe(0.75);
  expect(migrateProject(p)).toEqual(p);
});
```

- [ ] **Step 2: Run** `npx.cmd jest src/editor/model/__tests__/types.cutout.test.ts src/editor/model/__tests__/migrate.test.ts` → the new tests FAIL (version 19, no `activeCutout`, no `setClipCutout`).
- [ ] **Step 3: Implement.**

`src/editor/model/types.ts`:

1. `export const SCHEMA_VERSION = 20 as const;`
2. In the `Clip` interface, after the `collage?` line, add:

```ts
  cutout?: true;                 // Remove background: ABSENT = off (never false / null / undefined). Written only by `setClipCutout`; read it through `activeCutout`
```

3. After `shownPhotoMotion`, add:

```ts
/**
 * Whether Remove background applies to a clip: the switch is on and the clip plays forwards (a reversed clip is exported from a
 * reversed copy that has no see-through background, so it shows as it is). The one rule the preview, the copies and the export go by.
 */
export const activeCutout = (c: Clip): boolean => c.cutout === true && !c.reversed;
```

`src/editor/model/migrate.ts`, in `normaliseClip`, directly after the line `if (collage) base.collage = collage;`:

```ts
  // v20: Remove background is optional and ABSENT unless it is exactly true on a clip that plays forwards.
  const cutout = c.cutout === true && !reversed;
  delete base.cutout;
  if (cutout) base.cutout = true;
```

In the doc comment of `normaliseCurrent` change `v2–v19 file to a safe v19 shape` to `v2–v20 file to a safe v20 shape` and append to its last sentence: `, and v19 → v20 adds nothing either: a clip's Remove background switch is optional, kept when it is exactly true and removed when not.` In `migrateProject` change the comment `v2 → v19` to `v2 → v20`.

`src/editor/model/ops.ts`, directly after `setClipChroma`:

```ts
/**
 * Remove background on or off for a main clip or a layer (photo or video). On writes `cutout: true`; off removes the key. Refused
 * (same project) for an unknown id, a reversed clip, and a value that is already in place.
 */
export function setClipCutout(p: Project, id: string, on: boolean): Project {
  return updateClip(p, id, (c) => {
    if (on) return c.cutout === true || c.reversed ? c : { ...c, cutout: true as const };
    if (c.cutout === undefined) return c;
    const next = { ...c };
    delete next.cutout;
    return next;
  });
}
```

(`updateClip` returns the same project when the function returns the clip it was given, and handles layers: `setClipChroma` relies on both.)

**Pinned numbers.** In `migrate.test.ts` and the twelve `types.*.test.ts` listed above, every assertion that the CURRENT schema is 19 (`expect(SCHEMA_VERSION).toBe(19)`, `expect(p.schemaVersion).toBe(19)`, a title "schema is v19") becomes 20. Find them with Grep (`toBe(19)`, `v19`) and edit each by hand. A fixture that is **given** an older number stays; in the older PROOF tests only the asserted number of the migrated output becomes 20 (their titles and fixtures untouched).

- [ ] **Step 4: Run** the two suites, then `npx.cmd jest src/editor/model` → PASS. Then `npm run typecheck` and `npm test`.
- [ ] **Step 5: Commit** — `git add` the files above (explicit paths); `feat(model): schema v20 — a clip's optional Remove background switch, activeCutout, setClipCutout, PROOF migration`.

---

### Task 2: The detector in resumable pieces; `beatTrack` fallback; the PROOF

**Depends on:** nothing. **Parallel-safe with:** 1, 4.

**Files:** Modify `src/editor/model/beatDetect.ts`, `src/editor/model/beats.ts` (`beatTrack` only). Create `src/editor/model/__tests__/beatDetect.slices.test.ts`, `src/editor/model/__tests__/beats.ownTrack.test.ts`.

**Do not touch:** `beatDetect.test.ts`, `beats.test.ts`, `musicBeats.ts`, `musicBeats.test.ts`, `scripts/generate-beats.mjs`, `assets/music/beats.json`; `onsetEnvelope`, `fft`, `at`, `bestPhase` and `BEAT_DETECT` in `beatDetect.ts` (their text is not edited). `beatDetect.ts` keeps **no imports** and only erasable TypeScript (no `enum`, no `namespace`, no parameter properties): the generator script loads it with Node's type stripping.

**Interfaces: Produces**

```ts
// src/editor/model/beatDetect.ts
export function coarsePeriod(env: Float64Array, rate: number): number;          // the autocorrelation peak (frames); 0 = too short or flat
export interface FineBest { period: number; score: number }
export const fineStart: (coarse: number) => FineBest;
export function finePeriodSlice(env: Float64Array, coarse: number, from: number, to: number, best: FineBest): FineBest;   // fine steps [from, to), clamped to −fineSteps … fineSteps
export function beatPeriod(env: Float64Array, rate: number): number;            // unchanged result
export function beatsFromPeriod(env: Float64Array, rate: number, period: number, seconds: number): BeatAnalysis | null;
export function detectBeats(samples: Float32Array, sampleRate: number): BeatAnalysis | null;   // unchanged result
export const BEAT_ACCEPT: { minConfidence: 1.5; halvesWithin: 0.001 };
export function isSteady(whole: BeatAnalysis | null, a: BeatAnalysis | null, b: BeatAnalysis | null): boolean;
// src/editor/model/beats.ts
export function beatTrack(p: Project, selectedAudioId: string | null): AudioTrack | null;      // + the selected bar of another kind when the project has no music
```

- [ ] **Step 1: Failing tests.**

Create `src/editor/model/__tests__/beatDetect.slices.test.ts`:

```ts
import { readFileSync } from "fs";
import { join } from "path";
import { BEAT_ACCEPT, BEAT_DETECT, beatPeriod, beatsFromPeriod, coarsePeriod, detectBeats, finePeriodSlice, fineStart, isSteady, onsetEnvelope, type BeatAnalysis } from "../beatDetect";

const RATE = 11025;
/** The click track of beatDetect.test.ts. */
function clicks(bpm: number, first: number, seconds: number, rate = RATE): Float32Array {
  const x = new Float32Array(Math.round(rate * seconds));
  for (let t = first; t < seconds; t += 60 / bpm) {
    const s = Math.round(t * rate);
    for (let i = 0; i < 300 && s + i < x.length; i++) x[s + i] += Math.sin(i * 0.9) * Math.exp(-i / 60);
  }
  return x;
}
function noise(seconds: number, rate = RATE): Float32Array {
  let s = 12345;
  return Float32Array.from({ length: Math.round(rate * seconds) }, () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return (s / 4294967296) * 2 - 1; });
}
/** The fine search, a few steps at a time, as the app runs it. */
function sliced(env: Float64Array, rate: number, size: number): number {
  const coarse = coarsePeriod(env, rate);
  if (coarse === 0) return 0;
  let best = fineStart(coarse);
  for (let s = -BEAT_DETECT.fineSteps; s <= BEAT_DETECT.fineSteps; s += size) best = finePeriodSlice(env, coarse, s, s + size, best);
  return best.period;
}

describe("PROOF: the pieces compute what the whole computed (never edited to make a change pass)", () => {
  test.each([[100, 0.2, 20], [128, 0.31, 30], [143.94, 0.1, 24], [87, 0.5, 40]])("%s bpm: the period in slices of 1, 4 and 50 is the period in one go", (bpm, first, seconds) => {
    const { env, rate } = onsetEnvelope(clicks(bpm, first, seconds), RATE);
    const whole = beatPeriod(env, rate);
    expect(whole).toBeGreaterThan(0);
    for (const size of [1, 4, 50, 601]) expect(sliced(env, rate, size)).toBe(whole);
  });

  test("detectBeats is beatsFromPeriod of the envelope, the period and the length", () => {
    const x = clicks(120, 0.25, 20);
    const { env, rate } = onsetEnvelope(x, RATE);
    expect(beatsFromPeriod(env, rate, beatPeriod(env, rate), x.length / RATE)).toEqual(detectBeats(x, RATE));
    expect(detectBeats(x, RATE)?.bpm).toBeCloseTo(120, 0);
  });

  test("nothing to measure gives nothing: a period of 0, silence, a rate of 0", () => {
    const { env, rate } = onsetEnvelope(clicks(120, 0.25, 20), RATE);
    expect(beatsFromPeriod(env, rate, 0, 20)).toBeNull();
    expect(beatsFromPeriod(new Float64Array(2000), 100, 50, 20)).toBeNull();
    expect(beatsFromPeriod(env, 0, 50, 20)).toBeNull();
    expect(coarsePeriod(new Float64Array(100), 100)).toBe(0);
  });

  test("a slice outside the search changes nothing, and a slice never looks past the search's ends", () => {
    const { env, rate } = onsetEnvelope(clicks(120, 0.25, 20), RATE);
    const coarse = coarsePeriod(env, rate);
    const start = fineStart(coarse);
    expect(finePeriodSlice(env, coarse, 400, 500, start)).toEqual(start);
    expect(finePeriodSlice(env, coarse, -900, 900, start).period).toBe(beatPeriod(env, rate));
  });
});

describe("the acceptance rule of the bundled tracks", () => {
  const beat = (bpm: number, confidence: number): BeatAnalysis => ({ bpm, first: 0.1, beats: [0.1, 0.6], confidence });

  test("the numbers are the generator's", () => {
    expect(BEAT_ACCEPT).toEqual({ minConfidence: 1.5, halvesWithin: 0.001 });
    const script = readFileSync(join(__dirname, "../../../../scripts/generate-beats.mjs"), "utf8");
    expect(script).toContain("const ACCEPT = { minConfidence: 1.5, halvesWithin: 0.001, durationWithin: 0.3 };");
  });

  test("steady: all three found, a clear pulse, and each half within a thousandth of the whole's tempo", () => {
    expect(isSteady(beat(120, 2), beat(120.1, 2), beat(119.9, 2))).toBe(true);
    expect(isSteady(beat(120, 2), beat(120.13, 2), beat(120, 2))).toBe(false);
    expect(isSteady(beat(120, 1.49), beat(120, 2), beat(120, 2))).toBe(false);
    expect(isSteady(beat(120, 1.5), beat(120, 1), beat(120, 1))).toBe(true);     // only the whole's confidence counts
    expect(isSteady(null, beat(120, 2), beat(120, 2))).toBe(false);
    expect(isSteady(beat(120, 2), null, beat(120, 2))).toBe(false);
    expect(isSteady(beat(120, 2), beat(120, 2), null)).toBe(false);
  });

  test("clicks are steady by the rule; noise is not", () => {
    const judge = (x: Float32Array) => {
      const half = Math.floor(x.length / 2);
      return isSteady(detectBeats(x, RATE), detectBeats(x.subarray(0, half), RATE), detectBeats(x.subarray(half), RATE));
    };
    expect(judge(clicks(120, 0.2, 60))).toBe(true);     // whole and halves all read 120.00 (worked out with the detector before this change)
    expect(judge(noise(40))).toBe(false);
  });
});
```

Create `src/editor/model/__tests__/beats.ownTrack.test.ts`:

```ts
import { beatTrack } from "../beats";
import { makeAudioTrack, makeClip, makeProject } from "../types";

const clips = [makeClip({ id: "a", sourceDuration: 10 })];
const voice = makeAudioTrack({ id: "voice", sourceDuration: 20, kind: "voice" });
const sfx = makeAudioTrack({ id: "clipSound", sourceDuration: 12, kind: "sfx", start: 2 });
const music = makeAudioTrack({ id: "song", sourceDuration: 90, start: 1 });

test("with music in the project nothing changed: the selected music, else the first music, whatever else is selected", () => {
  const p = makeProject({ clips, audioTracks: [voice, sfx, music] });
  expect(beatTrack(p, null)?.id).toBe("song");
  expect(beatTrack(p, "voice")?.id).toBe("song");
  expect(beatTrack(p, "clipSound")?.id).toBe("song");
  expect(beatTrack(p, "song")?.id).toBe("song");
});

test("without any music the SELECTED bar is listened to, whatever its kind; nothing selected is still nothing", () => {
  const p = makeProject({ clips, audioTracks: [voice, sfx] });
  expect(beatTrack(p, "voice")?.id).toBe("voice");
  expect(beatTrack(p, "clipSound")?.id).toBe("clipSound");
  expect(beatTrack(p, null)).toBeNull();
  expect(beatTrack(p, "gone")).toBeNull();
  expect(beatTrack(makeProject({ clips }), "voice")).toBeNull();
});
```

- [ ] **Step 2: Run** `npx.cmd jest src/editor/model/__tests__/beatDetect.slices.test.ts src/editor/model/__tests__/beats.ownTrack.test.ts` → FAIL (missing exports; the fallback).
- [ ] **Step 3: Implement.**

`src/editor/model/beatDetect.ts`: replace everything from the doc comment of `beatPeriod` ("The beat period in envelope frames…") to the end of the file with:

```ts
/**
 * The coarse beat period in envelope frames: the autocorrelation peak between `maxBpm` and `minBpm`, weighted towards `priorBpm`.
 * 0 when the envelope is too short or flat.
 */
export function coarsePeriod(env: Float64Array, rate: number): number {
  const lo = Math.max(2, Math.floor((60 * rate) / BEAT_DETECT.maxBpm)), hi = Math.ceil((60 * rate) / BEAT_DETECT.minBpm);
  if (env.length < hi * 4) return 0;
  let mean = 0;
  for (let i = 0; i < env.length; i++) mean += env[i];
  mean /= env.length;
  let coarse = 0, coarseScore = 0;
  for (let lag = lo; lag <= hi; lag++) {
    let acc = 0;
    for (let i = lag; i < env.length; i++) acc += (env[i] - mean) * (env[i - lag] - mean);
    acc /= env.length - lag;
    const octaves = Math.log2((60 * rate) / lag / BEAT_DETECT.priorBpm) / BEAT_DETECT.priorOctaves;
    const score = acc * Math.exp(-0.5 * octaves * octaves);
    if (score > coarseScore) { coarseScore = score; coarse = lag; }
  }
  return coarse;
}

/** The best period of the fine search so far, and the onset strength its best grid collects. */
export interface FineBest { period: number; score: number }
/** Where the fine search starts: the coarse period itself, beaten by the first step looked at. */
export const fineStart = (coarse: number): FineBest => ({ period: coarse, score: -1 });
/**
 * Steps `from` (inclusive) to `to` (exclusive) of the fine search around `coarse`, carrying the best so far: step `s` tries the
 * period `coarse * (1 + fineSpan * s / fineSteps)`. The whole search is the steps −fineSteps … fineSteps in rising order; a range
 * outside that is clamped, so the search can be run a few steps at a time (the app pauses between slices) with the same answer.
 */
export function finePeriodSlice(env: Float64Array, coarse: number, from: number, to: number, best: FineBest): FineBest {
  let period = best.period, score = best.score;
  const first = Math.max(from, -BEAT_DETECT.fineSteps), end = Math.min(to, BEAT_DETECT.fineSteps + 1);
  for (let s = first; s < end; s++) {
    const tried = coarse * (1 + (BEAT_DETECT.fineSpan * s) / BEAT_DETECT.fineSteps);
    const { mean: m } = bestPhase(env, tried);
    if (m > score) { score = m; period = tried; }
  }
  return { period, score };
}

/**
 * The beat period in envelope frames: the coarse period, then refined to the period whose best grid collects the most onset
 * strength. 0 when the envelope is too short or flat.
 */
export function beatPeriod(env: Float64Array, rate: number): number {
  const coarse = coarsePeriod(env, rate);
  if (coarse === 0) return 0;
  return finePeriodSlice(env, coarse, -BEAT_DETECT.fineSteps, BEAT_DETECT.fineSteps + 1, fineStart(coarse)).period;
}

const r3 = (v: number): number => Math.round(v * 1000) / 1000;

/** Tempo, first beat and every beat inside `seconds` for an envelope and its period; null without a period or without any onset. */
export function beatsFromPeriod(env: Float64Array, rate: number, period: number, seconds: number): BeatAnalysis | null {
  if (!(period > 0) || !(rate > 0)) return null;
  const { phase, mean } = bestPhase(env, period);
  let all = 0;
  for (let i = 0; i < env.length; i++) all += env[i];
  all /= env.length;
  if (!(all > 0)) return null;
  const step = period / rate, first = phase / rate;
  const beats: number[] = [];
  for (let k = 0; first + k * step < seconds; k++) beats.push(r3(first + k * step));
  return { bpm: Math.round((60 / step) * 100) / 100, first: r3(first), beats, confidence: Math.round((mean / all) * 100) / 100 };
}

/** Tempo, first beat and every beat of a mono signal; null when no steady pulse can be measured (too short, silent). */
export function detectBeats(samples: Float32Array, sampleRate: number): BeatAnalysis | null {
  if (!(sampleRate > 0) || samples.length < sampleRate * 4) return null;
  const { env, rate } = onsetEnvelope(samples, sampleRate);
  return beatsFromPeriod(env, rate, beatPeriod(env, rate), samples.length / sampleRate);
}

/**
 * When a track's beats are good enough to place (the rule scripts/generate-beats.mjs ships the bundled tracks by): a confidence of
 * at least `minConfidence`, and each half of the track alone gives a tempo within `halvesWithin` (a share) of the whole's.
 */
export const BEAT_ACCEPT = { minConfidence: 1.5, halvesWithin: 0.001 } as const;
/** The rule itself, for the whole track and its two halves. */
export function isSteady(whole: BeatAnalysis | null, a: BeatAnalysis | null, b: BeatAnalysis | null): boolean {
  if (!whole || !a || !b) return false;
  const within = whole.bpm * BEAT_ACCEPT.halvesWithin;
  return whole.confidence >= BEAT_ACCEPT.minConfidence && Math.abs(a.bpm - whole.bpm) <= within && Math.abs(b.bpm - whole.bpm) <= within;
}
```

(The fine loop is the old one: the same steps in the same order, the same `>` comparison, starting from the same `fine = coarse, fineScore = -1`.)

`src/editor/model/beats.ts`, `beatTrack`: replace its doc comment and its last line `return best;` so the function reads:

```ts
/**
 * The track Find beats listens to: the selected track when it is music, else the music track that starts first (list order on a
 * tie). A project WITHOUT any music: the selected bar, whatever its kind (a voice-over, a clip sound). null without one.
 */
export function beatTrack(p: Project, selectedAudioId: string | null): AudioTrack | null {
  const selected = selectedAudioId ? p.audioTracks.find((t) => t.id === selectedAudioId) : undefined;
  if (selected && selected.kind === "music") return selected;
  let best: AudioTrack | null = null;
  for (const t of p.audioTracks) if (t.kind === "music" && (best === null || t.start < best.start)) best = t;
  return best ?? selected ?? null;
}
```

- [ ] **Step 4: Run** the two new suites and `npx.cmd jest src/editor/model/__tests__/beatDetect.test.ts src/editor/model/__tests__/beats.test.ts src/editor/__tests__/musicBeats.test.ts src/editor/__tests__/BeatsSheet.auto.test.tsx` → PASS with those four files **unedited**. If `$env:TEMP\clipy-beats\node_modules\mpg123-decoder` exists, also run `node --experimental-strip-types scripts/generate-beats.mjs "$env:TEMP\clipy-beats"` and check `git diff --exit-code assets/music/beats.json` is empty (it is not installed on this machine today: then the equality tests above stand in, and say so in the commit message). Then `npm run typecheck` and `npm test`.
- [ ] **Step 5: Commit** — `refactor(model): the beat detector in resumable pieces with its acceptance rule (same results, pinned); Find beats listens to a selected bar when the project has no music`.

---

### Task 4: The native wrapper and the build label

**Depends on:** nothing. **Parallel-safe with:** 1, 2.

**Files:** Modify `modules/clipy-video/index.ts` (additions only), `modules/clipy-video/__tests__/index.test.ts` (append one `describe`), `src/lib/buildInfo.ts`, `src/lib/__tests__/buildInfo.test.ts`.

**Do not touch:** every existing export of `index.ts`, anything under `ios/`.

**Interfaces: Produces**

```ts
// modules/clipy-video/index.ts
export interface BeatEnvelopeRequest { jobId: string; sourceUri: string; from: number; to: number }
export interface BeatEnvelopeResult { env: number[]; rate: number; seconds: number; from: number }
export const BEATS_CANCELLED = "E_BEATS_CANCELLED";
export function isBeatEnvelopeAvailable(): boolean;
export function beatEnvelope(req: BeatEnvelopeRequest): Promise<BeatEnvelopeResult>;
export function cancelBeatEnvelope(jobId: string): void;
export function isBeatsCancelled(e: unknown): boolean;
export interface CutoutRequest { jobId: string; sourceUri: string; outputPath: string; kind: "video" | "photo"; from: number; to: number; maxSide: number; minFrameGap: number; minPerson: number; alphaQuality: number; bitsPerPixel: number; stillPath: string; stillSeconds: number }
export interface CutoutResult { fileUri: string; seconds: number; frames: number; person: number }
export type CutoutEvent = { jobId: string; progress: number };
export const CUTOUT_CANCELLED = "E_CUTOUT_CANCELLED";
export function isCutoutAvailable(): boolean;
export function renderCutout(req: CutoutRequest): Promise<CutoutResult>;
export function cancelCutout(jobId: string): void;
export function addCutoutListener(cb: (e: CutoutEvent) => void): EventSubscription;
export function isCutoutCancelled(e: unknown): boolean;
// src/lib/buildInfo.ts
export const BEATS_BACKGROUND_TOOLS: string;        // NEEDS_LATEST_BUILD("Beats in your own music and Remove background")
// buildLabel() → "App build: beats and background" when isCutoutAvailable()
```

- [ ] **Step 1: Failing tests.**

In `modules/clipy-video/__tests__/index.test.ts`: add `addCutoutListener, beatEnvelope, BEATS_CANCELLED, cancelBeatEnvelope, cancelCutout, CUTOUT_CANCELLED, isBeatEnvelopeAvailable, isBeatsCancelled, isCutoutAvailable, isCutoutCancelled, renderCutout` to the import from `../index`; append:

```ts
describe("beats and background API (the build of 2026-10-09)", () => {
  const beats = { jobId: "j", sourceUri: "file:///doc/projects/p1/media/song.m4a", from: 0, to: 180 };
  const cutout = { jobId: "c", sourceUri: "file:///doc/projects/p1/media/v.mov", outputPath: "file:///doc/projects/p1/cutout/v-c1-0-9000.mov", kind: "video" as const,
    from: 0, to: 9, maxSide: 1920, minFrameGap: 0.03, minPerson: 0.005, alphaQuality: 0.75, bitsPerPixel: 0.1, stillPath: "", stillSeconds: 0 };
  const old = { hello: () => "old", exportTimeline: jest.fn(), renderSound: jest.fn(), speakToFile: jest.fn(), noiseAvailable: jest.fn(() => true) };   // the build before this batch
  const latest = { ...old, beatEnvelope: jest.fn(), cancelBeatEnvelope: jest.fn(), renderCutout: jest.fn(), cancelCutout: jest.fn(), addListener: jest.fn() };

  it("isBeatEnvelopeAvailable / isCutoutAvailable: only when the linked module has the functions", () => {
    jest.mocked(requireOptionalNativeModule).mockReturnValue(latest as never);
    try {
      expect(isBeatEnvelopeAvailable()).toBe(true);
      expect(isCutoutAvailable()).toBe(true);
    } finally { jest.mocked(requireOptionalNativeModule).mockReset(); }
    for (const module of [null, old]) {
      jest.mocked(requireOptionalNativeModule).mockReturnValue(module as never);
      try {
        expect(isBeatEnvelopeAvailable()).toBe(false);
        expect(isCutoutAvailable()).toBe(false);
      } finally { jest.mocked(requireOptionalNativeModule).mockReset(); }
    }
  });

  it("the calls forward to the native module with the request as it is", async () => {
    const answer = { env: [0, 1.5, 0.25], rate: 100, seconds: 0.03, from: 0 };
    const made = { fileUri: cutout.outputPath, seconds: 9, frames: 270, person: 0.31 };
    const sub = { remove: jest.fn() };
    const native = { beatEnvelope: jest.fn(async () => answer), cancelBeatEnvelope: jest.fn(), renderCutout: jest.fn(async () => made), cancelCutout: jest.fn(), addListener: jest.fn(() => sub) };
    jest.mocked(requireOptionalNativeModule).mockReturnValue(native as never);
    try {
      await expect(beatEnvelope(beats)).resolves.toEqual(answer);
      expect(native.beatEnvelope).toHaveBeenCalledWith(beats);
      cancelBeatEnvelope("j");
      expect(native.cancelBeatEnvelope).toHaveBeenCalledWith("j");
      await expect(renderCutout(cutout)).resolves.toEqual(made);
      expect(native.renderCutout).toHaveBeenCalledWith(cutout);
      cancelCutout("c");
      expect(native.cancelCutout).toHaveBeenCalledWith("c");
      const cb = jest.fn();
      expect(addCutoutListener(cb)).toBe(sub);
      expect(native.addListener).toHaveBeenCalledWith("onCutoutEvent", cb);
    } finally { jest.mocked(requireOptionalNativeModule).mockReset(); }
  });

  it("without the module they throw the not-linked error; with an older build a plain sentence, never 'undefined is not a function'", () => {
    const calls = [() => beatEnvelope(beats), () => cancelBeatEnvelope("j"), () => renderCutout(cutout), () => cancelCutout("c")];
    jest.mocked(requireOptionalNativeModule).mockReturnValue(null);
    try { for (const call of calls) expect(call).toThrow(/not linked/); } finally { jest.mocked(requireOptionalNativeModule).mockReset(); }
    jest.mocked(requireOptionalNativeModule).mockReturnValue(old as never);
    try { for (const call of calls) expect(call).toThrow(/latest Clipy build/); } finally { jest.mocked(requireOptionalNativeModule).mockReset(); }
  });

  it("the cancel codes are recognised, and only they", () => {
    expect(BEATS_CANCELLED).toBe("E_BEATS_CANCELLED");
    expect(CUTOUT_CANCELLED).toBe("E_CUTOUT_CANCELLED");
    expect(isBeatsCancelled(Object.assign(new Error("Beats cancelled"), { code: "E_BEATS_CANCELLED" }))).toBe(true);
    expect(isBeatsCancelled(Object.assign(new Error("x"), { code: "E_BEATS" }))).toBe(false);
    expect(isBeatsCancelled(null)).toBe(false);
    expect(isCutoutCancelled(Object.assign(new Error("Cutout cancelled"), { code: "E_CUTOUT_CANCELLED" }))).toBe(true);
    expect(isCutoutCancelled(Object.assign(new Error("x"), { code: "E_CUTOUT" }))).toBe(false);
    expect(isCutoutCancelled(new Error("Cutout cancelled"))).toBe(false);
  });
});
```

Replace `src/lib/__tests__/buildInfo.test.ts` with (the mock gains one function, the label one row; these are the pinned values of this task):

```ts
jest.mock("@/modules/clipy-video", () => ({ isNativeAvailable: jest.fn(), isSoundAvailable: jest.fn(), isSpeechAvailable: jest.fn(), isCutoutAvailable: jest.fn() }));
import { isCutoutAvailable, isNativeAvailable, isSoundAvailable, isSpeechAvailable } from "@/modules/clipy-video";
import { BEATS_BACKGROUND_TOOLS, buildLabel, LATEST_TOOLS, NEEDS_LATEST_BUILD } from "../buildInfo";

const set = (native: boolean, sound: boolean, speech: boolean, cutout: boolean) => {
  (isNativeAvailable as jest.Mock).mockReturnValue(native); (isSoundAvailable as jest.Mock).mockReturnValue(sound);
  (isSpeechAvailable as jest.Mock).mockReturnValue(speech); (isCutoutAvailable as jest.Mock).mockReturnValue(cutout);
};

test("the label names what the installed app can do, newest ability first", () => {
  set(true, true, true, true);
  expect(buildLabel()).toBe("App build: beats and background");
  set(true, true, true, false);
  expect(buildLabel()).toBe("App build: noise, ramps and speech");
  set(true, true, false, false);
  expect(buildLabel()).toBe("App build: sound tools");
  set(true, false, false, false);
  expect(buildLabel()).toBe("App build: export only (older)");
  set(false, false, false, false);
  expect(buildLabel()).toBe("Expo Go (no video engine)");
});

test("a missing ability is said with what to do about it", () => {
  expect(NEEDS_LATEST_BUILD("Voice and sound effects")).toBe("Voice and sound effects need the latest Clipy build. Install it from the newest build link.");
  expect(LATEST_TOOLS).toBe("Reduce noise and Read aloud need the latest Clipy build. Install it from the newest build link.");
  expect(BEATS_BACKGROUND_TOOLS).toBe("Beats in your own music and Remove background need the latest Clipy build. Install it from the newest build link.");
});
```

- [ ] **Step 2: Run** `npx.cmd jest modules/clipy-video/__tests__/index.test.ts src/lib/__tests__/buildInfo.test.ts` → the new tests FAIL.
- [ ] **Step 3: Implement.**

`modules/clipy-video/index.ts`:

1. After the `SPEECH_CANCELLED` constant and before `SOUND_CANCELLED`, insert:

```ts
/** One Find beats for a file of the owner's: the seconds of the file to listen to (`to` at or before `from` = to the end). */
export interface BeatEnvelopeRequest { jobId: string; sourceUri: string; from: number; to: number }
/** The onset envelope of that stretch (`onsetEnvelope` in src/editor/model/beatDetect.ts): `rate` values a second, `seconds` of sound decoded, starting at `from` in the file. */
export interface BeatEnvelopeResult { env: number[]; rate: number; seconds: number; from: number }
/** The code a cancelled Find beats rejects with. */
export const BEATS_CANCELLED = "E_BEATS_CANCELLED";
/**
 * One cut-out copy (the numbers are `CUTOUT` in src/editor/model/cutout.ts). Video: the source range `from` … `to` is written to
 * `outputPath` (a .mov with a see-through background, the source's timing and sound). Photo: `outputPath` is a PNG and `stillPath`
 * a `stillSeconds` long movie of the same picture.
 */
export interface CutoutRequest {
  jobId: string; sourceUri: string; outputPath: string; kind: "video" | "photo"; from: number; to: number;
  maxSide: number; minFrameGap: number; minPerson: number; alphaQuality: number; bitsPerPixel: number; stillPath: string; stillSeconds: number;
}
/** `person` = the largest share of a measured frame the people mask covered (0 … 1). */
export interface CutoutResult { fileUri: string; seconds: number; frames: number; person: number }
export type CutoutEvent = { jobId: string; progress: number };
/** The code a cancelled cut-out render rejects with. */
export const CUTOUT_CANCELLED = "E_CUTOUT_CANCELLED";
```

2. In the `ClipyVideoNative` type, after `cancelSpeech(jobId: string): void;`, add:

```ts
  beatEnvelope(req: BeatEnvelopeRequest): Promise<BeatEnvelopeResult>;
  cancelBeatEnvelope(jobId: string): void;
  addListener(eventName: "onCutoutEvent", listener: (e: CutoutEvent) => void): EventSubscription;
  renderCutout(req: CutoutRequest): Promise<CutoutResult>;
  cancelCutout(jobId: string): void;
```

3. At the end of the file, append:

```ts

/** The module for a call that came with the build of 2026-10-09: missing = not linked (Expo Go); present but without the function = an older build. */
function batchNative(fn: "beatEnvelope" | "cancelBeatEnvelope" | "renderCutout" | "cancelCutout"): ClipyVideoNative {
  const m = native();
  if (typeof m[fn] !== "function") throw new Error(NOT_IN_BUILD);
  return m;
}
/** Whether the linked native module can listen to a file for its beats: false in Expo Go and in a build made before this. */
export function isBeatEnvelopeAvailable(): boolean { return typeof optional()?.beatEnvelope === "function"; }
export function beatEnvelope(req: BeatEnvelopeRequest): Promise<BeatEnvelopeResult> { return batchNative("beatEnvelope").beatEnvelope(req); }
export function cancelBeatEnvelope(jobId: string): void { batchNative("cancelBeatEnvelope").cancelBeatEnvelope(jobId); }
/** True for the rejection of a Find beats that was cancelled (`cancelBeatEnvelope`). */
export function isBeatsCancelled(e: unknown): boolean { return typeof e === "object" && e !== null && (e as { code?: unknown }).code === BEATS_CANCELLED; }
/** Whether the linked native module can remove a background: false in Expo Go and in a build made before this. */
export function isCutoutAvailable(): boolean { return typeof optional()?.renderCutout === "function"; }
export function renderCutout(req: CutoutRequest): Promise<CutoutResult> { return batchNative("renderCutout").renderCutout(req); }
export function cancelCutout(jobId: string): void { batchNative("cancelCutout").cancelCutout(jobId); }
export function addCutoutListener(cb: (e: CutoutEvent) => void): EventSubscription { return native().addListener("onCutoutEvent", cb); }
/** True for the rejection of a cut-out render that was cancelled (`cancelCutout`). */
export function isCutoutCancelled(e: unknown): boolean { return typeof e === "object" && e !== null && (e as { code?: unknown }).code === CUTOUT_CANCELLED; }
```

`src/lib/buildInfo.ts`: the import becomes `import { isCutoutAvailable, isNativeAvailable, isSoundAvailable, isSpeechAvailable } from "@/modules/clipy-video";`; `LEVELS` gains a first row `{ name: "beats and background", has: isCutoutAvailable },`; at the end of the file add:

```ts
/** Said where Find beats (for music of the owner's own) or Remove background is tapped in Expo Go or in a build from before them. */
export const BEATS_BACKGROUND_TOOLS = NEEDS_LATEST_BUILD("Beats in your own music and Remove background");
```

Then Grep for other tests that mock `@/modules/clipy-video` with a factory **and** render something that calls `buildLabel()` (the Accounts screen's test, if any): a factory without `isCutoutAvailable` would make `buildLabel()` call `undefined`. Add `isCutoutAvailable: jest.fn(() => false)` to each such mock (a pinned mock; name them in the commit message).

- [ ] **Step 4: Run** the two suites → PASS. Then `npm run typecheck` and `npm test`.
- [ ] **Step 5: Commit** — `feat(native-wrapper): beat envelope and cut-out calls behind presence checks; the build label knows "beats and background"`.

---

### Task 3: The cut-out model: names, ranges, the covering copy

**Depends on:** Task 1. **Parallel-safe with:** 5, 7.

**Files:** Create `src/editor/model/cutout.ts`, `src/editor/model/__tests__/cutout.test.ts`.

**Do not touch:** `types.ts`, `ops.ts`, `sound.ts`.

**Interfaces: Consumes** `activeCutout`, `isPhoto`, `Clip`, `Project` (types.ts). **Produces**

```ts
export const CUTOUT_VERSION = 1;
export const CUTOUT: { maxSeconds: 60; pad: 1; videoMaxSide: 1920; photoMaxSide: 2560; minFrameGap: 0.03; minPerson: 0.005; alphaQuality: 0.75; bitsPerPixel: 0.1; stillSeconds: 60; exportOpacity: 0.999 };
export const CUTOUT_PREVIEW: { layerVideo: boolean; mainVideo: boolean };
export function cutoutRange(c: Pick<Clip, "trimStart" | "trimEnd" | "sourceDuration">): { from: number; to: number };
export function cutoutFileName(sourceUri: string, photo: boolean, from?: number, to?: number): string;
export const cutoutStillName: (pngName: string) => string;
export function parseCutoutName(name: string): { stem: string; photo: boolean; from: number; to: number } | null;
export function coveringCopy(known: readonly string[], c: Clip): string | null;
export type CutoutRefusal = "reversed" | "tooLong";
export function cutoutRefusal(c: Clip): CutoutRefusal | null;
export interface NeededCutout { name: string; sourceUri: string; photo: boolean; from: number; to: number }
export function cutoutNeed(c: Clip, known: readonly string[]): NeededCutout;
export function neededCutouts(p: Project, missing: readonly string[], known: readonly string[]): NeededCutout[];
export function cutoutSize(width: number, height: number, maxSide: number): { width: number; height: number };
export function cutoutDeadlineMs(n: Pick<NeededCutout, "photo" | "from" | "to">): number;
export function cutoutBytes(c: Clip): number;
```

- [ ] **Step 1: Failing tests.** Create `src/editor/model/__tests__/cutout.test.ts`:

```ts
import { coveringCopy, CUTOUT, CUTOUT_PREVIEW, CUTOUT_VERSION, cutoutBytes, cutoutDeadlineMs, cutoutFileName, cutoutNeed, cutoutRange, cutoutRefusal, cutoutSize, cutoutStillName, neededCutouts, parseCutoutName } from "../cutout";
import { makeClip, makeLayer, makePhotoClip, makeProject, type Clip } from "../types";

const MEDIA = "file:///doc/projects/p1/media";
const video = (id: string, extra: Partial<Clip> = {}) => makeClip({ id, sourceDuration: 30, sourceUri: `${MEDIA}/abc.mov`, cutout: true, ...extra });
const photo = (id: string, extra: Partial<Clip> = {}) => makePhotoClip({ id, sourceUri: `${MEDIA}/p.jpg`, cutout: true, ...extra });

test("the constants", () => {
  expect(CUTOUT_VERSION).toBe(1);
  expect(CUTOUT).toEqual({ maxSeconds: 60, pad: 1, videoMaxSide: 1920, photoMaxSide: 2560, minFrameGap: 0.03, minPerson: 0.005, alphaQuality: 0.75, bitsPerPixel: 0.1, stillSeconds: 60, exportOpacity: 0.999 });
  expect(CUTOUT_PREVIEW).toEqual({ layerVideo: true, mainVideo: true });
});

test("cutoutRange: the trim plus a second each side, on whole seconds, inside the file", () => {
  expect(cutoutRange({ trimStart: 0, trimEnd: 30, sourceDuration: 30 })).toEqual({ from: 0, to: 30 });
  expect(cutoutRange({ trimStart: 4.2, trimEnd: 9.7, sourceDuration: 30 })).toEqual({ from: 3, to: 11 });
  expect(cutoutRange({ trimStart: 2.5, trimEnd: 9, sourceDuration: 30 })).toEqual({ from: 1, to: 10 });
  expect(cutoutRange({ trimStart: 0.4, trimEnd: 7.25, sourceDuration: 7.25 })).toEqual({ from: 0, to: 8 });
  expect(cutoutRange({ trimStart: 100, trimEnd: 160, sourceDuration: 600 })).toEqual({ from: 99, to: 161 });
});

test("names: the source's stem, the version and the range in milliseconds; a photo has a PNG and a still movie beside it", () => {
  expect(cutoutFileName(`${MEDIA}/abc.mov`, false, 3, 11)).toBe("abc-c1-3000-11000.mov");
  expect(cutoutFileName(`${MEDIA}/my clip (1).MOV`, false, 0, 30)).toBe("my_clip__1_-c1-0-30000.mov");
  expect(cutoutFileName(`${MEDIA}/p.jpg`, true)).toBe("p-c1-photo.png");
  expect(cutoutStillName("p-c1-photo.png")).toBe("p-c1-photo.mov");
  expect(parseCutoutName("abc-c1-3000-11000.mov")).toEqual({ stem: "abc", photo: false, from: 3, to: 11 });
  expect(parseCutoutName("a-b-c1-c1-0-500.mov")).toEqual({ stem: "a-b-c1", photo: false, from: 0, to: 0.5 });
  expect(parseCutoutName("p-c1-photo.png")).toEqual({ stem: "p", photo: true, from: 0, to: 0 });
  for (const other of ["p-c1-photo.mov", "part-abc-c1-3000-11000.mov", "abc-c2-3000-11000.mov", "abc-v1-deep-s50-p0-flat-l0.m4a", "abc-c1-x-y.mov", ""]) expect(parseCutoutName(other)).toBeNull();
});

test("coveringCopy: the smallest known copy of the same file that contains the clip's trim", () => {
  const known = ["abc-c1-3000-11000.mov", "abc-c1-0-30000.mov", "other-c1-0-30000.mov", "p-c1-photo.png"];
  expect(coveringCopy(known, video("a", { trimStart: 4.2, trimEnd: 9.7 }))).toBe("abc-c1-3000-11000.mov");
  expect(coveringCopy(known, video("a", { trimStart: 5, trimEnd: 9 }))).toBe("abc-c1-3000-11000.mov");       // trimmed inwards: the same copy
  expect(coveringCopy(known, video("a", { trimStart: 3, trimEnd: 11 }))).toBe("abc-c1-3000-11000.mov");      // exactly its ends
  expect(coveringCopy(known, video("a", { trimStart: 2.5, trimEnd: 9 }))).toBe("abc-c1-0-30000.mov");        // past the small one: the larger
  expect(coveringCopy(["abc-c1-3000-11000.mov"], video("a", { trimStart: 2.5, trimEnd: 9 }))).toBeNull();
  expect(coveringCopy(known, video("a", { sourceUri: `${MEDIA}/zzz.mov` }))).toBeNull();
  expect(coveringCopy(known, photo("ph"))).toBe("p-c1-photo.png");
  expect(coveringCopy([], photo("ph"))).toBeNull();
});

test("cutoutRefusal: a reversed clip, and a video whose trimmed source is over 60 seconds", () => {
  expect(cutoutRefusal(video("a"))).toBeNull();
  expect(cutoutRefusal(video("a", { reversed: true }))).toBe("reversed");
  const long = (trimEnd: number) => makeClip({ id: "l", sourceDuration: 600, trimStart: 100, trimEnd });
  expect(cutoutRefusal(long(160))).toBeNull();
  expect(cutoutRefusal(long(160.01))).toBe("tooLong");
  expect(cutoutRefusal(makeClip({ id: "f", sourceDuration: 240, speed: 4 }))).toBe("tooLong");     // source seconds count, not the timeline's
  expect(cutoutRefusal(photo("ph"))).toBeNull();
});

test("cutoutNeed: the covering copy when there is one, else the planned one", () => {
  const clip = video("a", { trimStart: 4.2, trimEnd: 9.7 });
  expect(cutoutNeed(clip, [])).toEqual({ name: "abc-c1-3000-11000.mov", sourceUri: `${MEDIA}/abc.mov`, photo: false, from: 3, to: 11 });
  expect(cutoutNeed(clip, ["abc-c1-0-30000.mov"])).toEqual({ name: "abc-c1-0-30000.mov", sourceUri: `${MEDIA}/abc.mov`, photo: false, from: 0, to: 30 });
  expect(cutoutNeed(photo("ph"), [])).toEqual({ name: "p-c1-photo.png", sourceUri: `${MEDIA}/p.jpg`, photo: true, from: 0, to: 0 });
});

test("neededCutouts: one entry per different copy, for clips and layers whose switch is on and can be served", () => {
  const p = makeProject({
    clips: [video("a", { trimStart: 4.2, trimEnd: 7 }), video("b", { trimStart: 7, trimEnd: 9.7 }), makeClip({ id: "plain", sourceDuration: 5 }), photo("ph"),
      video("rev", { reversed: true }), makeClip({ id: "long", sourceDuration: 600, cutout: true }), video("gone", { sourceUri: `${MEDIA}/gone.mov` })],
    layers: [{ ...makeLayer({ id: "L", sourceDuration: 12, sourceUri: `${MEDIA}/layer.mov` }), cutout: true as const }],
  });
  // The two halves of a split plan different copies until one exists …
  expect(neededCutouts(p, [`${MEDIA}/gone.mov`], []).map((n) => n.name)).toEqual(["abc-c1-3000-8000.mov", "abc-c1-6000-11000.mov", "p-c1-photo.png", "layer-c1-0-12000.mov"]);
  // … and share one that covers both.
  expect(neededCutouts(p, [`${MEDIA}/gone.mov`], ["abc-c1-3000-11000.mov"]).map((n) => n.name)).toEqual(["abc-c1-3000-11000.mov", "p-c1-photo.png", "layer-c1-0-12000.mov"]);
  expect(neededCutouts(makeProject({ clips: [makeClip({ id: "x", sourceDuration: 4 })] }), [], [])).toEqual([]);
});

test("cutoutSize: at most the cap on the long side, even numbers, the shape kept", () => {
  expect(cutoutSize(1080, 1920, 1920)).toEqual({ width: 1080, height: 1920 });
  expect(cutoutSize(2160, 3840, 1920)).toEqual({ width: 1080, height: 1920 });
  expect(cutoutSize(1920, 1080, 1920)).toEqual({ width: 1920, height: 1080 });
  expect(cutoutSize(4032, 3024, 2560)).toEqual({ width: 2560, height: 1920 });
  expect(cutoutSize(1179, 2556, 1920)).toEqual({ width: 886, height: 1920 });
  expect(cutoutSize(3, 5, 1920)).toEqual({ width: 2, height: 4 });
  expect(cutoutSize(NaN, 0, 1920)).toEqual({ width: 2, height: 2 });
});

test("the deadline grows with the range; the size estimate is about 9 MB per 10 seconds of 1080 × 1920", () => {
  expect(cutoutDeadlineMs({ photo: true, from: 0, to: 0 })).toBe(60000);
  expect(cutoutDeadlineMs({ photo: false, from: 3, to: 11 })).toBe(220000);
  expect(cutoutDeadlineMs({ photo: false, from: 0, to: 62 })).toBe(1300000);
  expect(cutoutBytes(makeClip({ id: "v", sourceDuration: 10, trimStart: 0, trimEnd: 10 }))).toBe(9491200);         // range 0 – 10
  expect(cutoutBytes(makeClip({ id: "v", sourceDuration: 600, trimStart: 100, trimEnd: 160 }))).toBe(58845440);    // range 99 – 161
  expect(cutoutBytes(photo("ph"))).toBe(5000000);
});
```

- [ ] **Step 2: Run** `npx.cmd jest src/editor/model/__tests__/cutout.test.ts` → FAIL (module missing).
- [ ] **Step 3: Implement.** Create `src/editor/model/cutout.ts`:

```ts
import { activeCutout, isPhoto, type Clip, type Project } from "./types";

/**
 * Remove background: which cut-out copy a clip uses, what it is called and what it covers. TypeScript only — the native render is
 * handed these numbers and writes one file. Raise CUTOUT_VERSION when a number that changes the copy changes (size, gap, quality):
 * copies rendered from the old numbers are then no longer used.
 */
export const CUTOUT_VERSION = 1;
/**
 * `maxSeconds`: the longest trimmed source range a video may have. `pad`: seconds rendered each side of the trim. `videoMaxSide` /
 * `photoMaxSide`: the copy's long side, at most. `minFrameGap`: a frame closer than this to the last kept one is left out (about
 * 30 a second). `minPerson`: the share of the picture the people mask must cover in at least one measured frame. `alphaQuality`:
 * the see-through layer's quality (0 … 1). `bitsPerPixel`: the colour bitrate, per pixel and frame at 30 a second. `stillSeconds`:
 * the length of a photo's still movie. `exportOpacity`: a main clip's opacity is capped at this in the export so the compositor
 * draws the clip's background behind the see-through picture.
 */
export const CUTOUT = { maxSeconds: 60, pad: 1, videoMaxSide: 1920, photoMaxSide: 2560, minFrameGap: 0.03, minPerson: 0.005, alphaQuality: 0.75, bitsPerPixel: 0.1, stillSeconds: 60, exportOpacity: 0.999 } as const;
/** Whether the preview shows a VIDEO's cut-out (a photo's always shows): off = that kind plays its original and the Preview tag shows. */
export const CUTOUT_PREVIEW = { layerVideo: true, mainVideo: true };

const EPS = 1e-6;
const stemOf = (uri: string): string => (uri.split("/").pop() ?? "").replace(/\.[A-Za-z0-9]+$/, "").replace(/[^A-Za-z0-9_-]/g, "_");

/** The source seconds a new copy of this clip would hold: its trim plus `pad` each side, on whole seconds, inside the file. */
export function cutoutRange(c: Pick<Clip, "trimStart" | "trimEnd" | "sourceDuration">): { from: number; to: number } {
  const from = Math.max(0, Math.floor(c.trimStart - CUTOUT.pad));
  const to = Math.max(from + 1, Math.min(Math.ceil(c.sourceDuration), Math.ceil(c.trimEnd + CUTOUT.pad)));
  return { from, to };
}
/** A copy's file name: `abc-c1-3000-11000.mov` (a video's range in milliseconds) or `p-c1-photo.png`. */
export function cutoutFileName(sourceUri: string, photo: boolean, from = 0, to = 0): string {
  const head = `${stemOf(String(sourceUri))}-c${CUTOUT_VERSION}`;
  return photo ? `${head}-photo.png` : `${head}-${Math.round(from * 1000)}-${Math.round(to * 1000)}.mov`;
}
/** The still movie written beside a photo's PNG (what the export plays). */
export const cutoutStillName = (pngName: string): string => pngName.replace(/\.png$/, ".mov");
/** What a file name in the cut-out folder says, or null for anything that is not a finished copy of this version (a part file, a photo's still movie, another version). */
export function parseCutoutName(name: string): { stem: string; photo: boolean; from: number; to: number } | null {
  const photo = new RegExp(`^(.+)-c${CUTOUT_VERSION}-photo\\.png$`).exec(name);
  if (photo) return photo[1].startsWith("part-") ? null : { stem: photo[1], photo: true, from: 0, to: 0 };
  const video = new RegExp(`^(.+)-c${CUTOUT_VERSION}-(\\d+)-(\\d+)\\.mov$`).exec(name);
  if (!video || video[1].startsWith("part-")) return null;
  return { stem: video[1], photo: false, from: Number(video[2]) / 1000, to: Number(video[3]) / 1000 };
}

/** The known copy this clip can use: a photo's own; for a video the SMALLEST copy of its file whose range contains the clip's trim. null when there is none. */
export function coveringCopy(known: readonly string[], c: Clip): string | null {
  if (isPhoto(c)) {
    const name = cutoutFileName(c.sourceUri, true);
    return known.includes(name) ? name : null;
  }
  const stem = stemOf(c.sourceUri);
  let best: { name: string; length: number } | null = null;
  for (const name of known) {
    const copy = parseCutoutName(name);
    if (!copy || copy.photo || copy.stem !== stem || copy.from > c.trimStart + EPS || copy.to < c.trimEnd - EPS) continue;
    if (best === null || copy.to - copy.from < best.length) best = { name, length: copy.to - copy.from };
  }
  return best === null ? null : best.name;
}

/** Why a clip cannot have its background removed: it plays backwards, or (a video) its trimmed source is longer than `maxSeconds`. */
export type CutoutRefusal = "reversed" | "tooLong";
export function cutoutRefusal(c: Clip): CutoutRefusal | null {
  if (c.reversed) return "reversed";
  return !isPhoto(c) && c.trimEnd - c.trimStart > CUTOUT.maxSeconds + EPS ? "tooLong" : null;
}

/** One copy: its file name, the source it is rendered from and what it holds. */
export interface NeededCutout { name: string; sourceUri: string; photo: boolean; from: number; to: number }
/** The copy a clip uses: a known one that covers it, else the one that would be rendered for it now. */
export function cutoutNeed(c: Clip, known: readonly string[]): NeededCutout {
  const photo = isPhoto(c);
  const covering = coveringCopy(known, c);
  const held = covering === null ? null : parseCutoutName(covering);
  if (covering !== null && held !== null) return { name: covering, sourceUri: c.sourceUri, photo, from: held.from, to: held.to };
  const range = photo ? { from: 0, to: 0 } : cutoutRange(c);
  return { name: cutoutFileName(c.sourceUri, photo, range.from, range.to), sourceUri: c.sourceUri, photo, from: range.from, to: range.to };
}
/**
 * Every different copy the project needs, main clips first, then layers: for each clip whose switch is on (`activeCutout`), whose
 * file is there and that can be served (`cutoutRefusal`). `known` = the copies that exist or are being rendered.
 */
export function neededCutouts(p: Project, missing: readonly string[], known: readonly string[]): NeededCutout[] {
  const out: NeededCutout[] = [];
  for (const c of [...p.clips, ...p.layers]) {
    if (!activeCutout(c) || missing.includes(c.sourceUri) || cutoutRefusal(c) !== null) continue;
    const need = cutoutNeed(c, known);
    if (!out.some((n) => n.name === need.name)) out.push(need);
  }
  return out;
}

/** The copy's pixel size for an upright picture: the long side at most `maxSide`, both sides even, at least 2 (the rule of `CutoutRender.evenSize`). */
export function cutoutSize(width: number, height: number, maxSide: number): { width: number; height: number } {
  const w = Number.isFinite(width) && width > 0 ? width : 2, h = Number.isFinite(height) && height > 0 ? height : 2;
  const k = Math.min(1, maxSide / Math.max(w, h));
  const even = (v: number): number => Math.max(2, Math.floor(Math.round(v * k) / 2) * 2);
  return { width: even(w), height: even(h) };
}
/** The longest one copy may take: a minute for a photo; a minute plus twenty times its length for a video. */
export function cutoutDeadlineMs(n: Pick<NeededCutout, "photo" | "from" | "to">): number {
  return n.photo ? 60000 : 60000 + 20000 * Math.max(0, n.to - n.from);
}
/** About how many bytes a new copy of this clip takes: the colour bitrate plus a fifth for the see-through layer plus the sound. A photo: 5 MB. */
export function cutoutBytes(c: Clip): number {
  if (isPhoto(c)) return 5000000;
  const { from, to } = cutoutRange(c);
  const size = cutoutSize(c.width, c.height, CUTOUT.videoMaxSide);
  const bits = Math.max(1000000, size.width * size.height * 30 * CUTOUT.bitsPerPixel) * 1.2 + 128000;
  return Math.round((bits * (to - from)) / 8);
}
```

- [ ] **Step 4: Run** `npx.cmd jest src/editor/model/__tests__/cutout.test.ts` → PASS. Then `npm run typecheck` and `npm test`.
- [ ] **Step 5: Commit** — `feat(model): the cut-out copies — names, ranges, the covering copy, refusals, sizes`.

---

### Task 5: Own beats: the range, the sliced analysis, the listener

**Depends on:** Tasks 2, 4. **Parallel-safe with:** 3, 7.

**Files:** Create `src/editor/ownBeats.ts`, `src/editor/__tests__/ownBeats.test.ts`.

**Do not touch:** `musicBeats.ts` (its `beatsOf` is called, not edited), `beats.ts`, `BeatsSheet.tsx` (Task 6).

**Interfaces: Consumes** `coarsePeriod`, `fineStart`, `finePeriodSlice`, `beatsFromPeriod`, `isSteady`, `BEAT_DETECT`, `BeatAnalysis` (Task 2); `beatEnvelope`, `cancelBeatEnvelope`, `isBeatsCancelled` (Task 4); `beatsOf`, `TrackBeats` (musicBeats.ts). **Produces**

```ts
export const BEAT_ANALYSIS: { maxSeconds: 600; minSeconds: 8; slice: 4 };
export const BEATS_DEADLINE_MS = 120000;
export const useOwnBeats: UseBoundStore<StoreApi<{ found: Record<string, TrackBeats | null> }>>;
type Listened = Pick<AudioTrack, "sourceUri" | "sourceDuration" | "trimStart" | "title" | "kind">;
export function beatRange(t: Pick<AudioTrack, "sourceDuration" | "trimStart">): { from: number; to: number };
export function beatKey(t: Pick<AudioTrack, "sourceUri" | "sourceDuration" | "trimStart">): string;
export type OwnFound = { status: "ok"; title: string; beats: readonly number[] } | { status: "unsteady"; title: string } | { status: "own"; title: string };
export function foundBeats(found: Record<string, TrackBeats | null>, t: Listened): OwnFound;
export function analyseEnvelope(env: Float64Array, rate: number, seconds: number, pause: () => Promise<void>, stopped: () => boolean): Promise<BeatAnalysis | null | "stopped">;
export type ListenAnswer = "ok" | "unsteady" | "short" | "stopped";
export function listenForBeats(t: Listened): Promise<ListenAnswer>;     // rejects with the native staged message
export function stopListening(): void;
export function forgetOwnBeats(): void;                                // tests
```

- [ ] **Step 1: Failing tests.** Create `src/editor/__tests__/ownBeats.test.ts`:

```ts
jest.mock("@/src/lib/id", () => ({ newId: jest.fn(() => "job-1") }));
jest.mock("@/modules/clipy-video", () => ({
  beatEnvelope: jest.fn(), cancelBeatEnvelope: jest.fn(),
  isBeatsCancelled: (e: unknown) => typeof e === "object" && e !== null && (e as { code?: string }).code === "E_BEATS_CANCELLED",
}));
import { beatEnvelope, cancelBeatEnvelope } from "@/modules/clipy-video";
import { beatPeriod, beatsFromPeriod, onsetEnvelope } from "@/src/editor/model/beatDetect";
import { makeAudioTrack } from "@/src/editor/model/types";
import { BUNDLED_TRACKS } from "@/src/editor/music";
import { analyseEnvelope, BEAT_ANALYSIS, beatKey, beatRange, BEATS_DEADLINE_MS, forgetOwnBeats, foundBeats, listenForBeats, stopListening, useOwnBeats } from "../ownBeats";

const RATE = 11025;
function clicks(bpm: number, first: number, seconds: number): Float32Array {
  const x = new Float32Array(Math.round(RATE * seconds));
  for (let t = first; t < seconds; t += 60 / bpm) {
    const s = Math.round(t * RATE);
    for (let i = 0; i < 300 && s + i < x.length; i++) x[s + i] += Math.sin(i * 0.9) * Math.exp(-i / 60);
  }
  return x;
}
function noise(seconds: number): Float32Array {
  let s = 12345;
  return Float32Array.from({ length: Math.round(RATE * seconds) }, () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return (s / 4294967296) * 2 - 1; });
}
const envOf = (x: Float32Array) => { const e = onsetEnvelope(x, RATE); return { env: e.env, rate: e.rate, seconds: x.length / RATE }; };
const now = () => Promise.resolve();
const never = () => false;
const native = jest.mocked(beatEnvelope);
const song = makeAudioTrack({ id: "s", title: "my song.m4a", sourceDuration: 60, sourceUri: "file:///doc/projects/p1/media/song.m4a" });

beforeEach(() => { jest.clearAllMocks(); forgetOwnBeats(); });

test("the limits", () => {
  expect(BEAT_ANALYSIS).toEqual({ maxSeconds: 600, minSeconds: 8, slice: 4 });
  expect(BEATS_DEADLINE_MS).toBe(120000);
});

test("beatRange: the whole file up to ten minutes; a longer one from the second its trim starts in, for ten minutes", () => {
  expect(beatRange({ sourceDuration: 180.4, trimStart: 20 })).toEqual({ from: 0, to: 180.4 });
  expect(beatRange({ sourceDuration: 600, trimStart: 500 })).toEqual({ from: 0, to: 600 });
  expect(beatRange({ sourceDuration: 3600, trimStart: 125.7 })).toEqual({ from: 125, to: 725 });
  expect(beatRange({ sourceDuration: 700, trimStart: 400 })).toEqual({ from: 400, to: 700 });
  expect(beatKey({ sourceUri: "file:///a.m4a", sourceDuration: 180.4, trimStart: 20 })).toBe("file:///a.m4a|0|180.4");
});

test("analyseEnvelope: steady clicks give the whole's beats, the same as the detector in one go", async () => {
  const { env, rate, seconds } = envOf(clicks(120, 0.2, 60));
  const pauses = jest.fn(now);
  const got = await analyseEnvelope(env, rate, seconds, pauses, never);
  expect(got).toEqual(beatsFromPeriod(env, rate, beatPeriod(env, rate), seconds));
  expect(got && got !== "stopped" ? got.bpm : 0).toBeCloseTo(120, 0);
  expect(pauses.mock.calls.length).toBeGreaterThanOrEqual(3 * 151);      // 601 steps in slices of 4, three times over
});

test("analyseEnvelope: noise is not steady; an envelope too short for a tempo is not either; a stop ends it", async () => {
  const n = envOf(noise(40));
  expect(await analyseEnvelope(n.env, n.rate, n.seconds, now, never)).toBeNull();
  expect(await analyseEnvelope(new Float64Array(200), 100, 2, now, never)).toBeNull();
  const c = envOf(clicks(120, 0.2, 60));
  let asked = 0;
  expect(await analyseEnvelope(c.env, c.rate, c.seconds, now, () => ++asked > 5)).toBe("stopped");
});

test("foundBeats: a bundled track is the bundled answer; an own track is own until listened to, then ok or unsteady", () => {
  const bundled = BUNDLED_TRACKS[0];
  const b = makeAudioTrack({ id: "b", title: bundled.title, sourceDuration: bundled.durationSec });
  expect(foundBeats({}, b).status).not.toBe("own");
  expect(foundBeats({}, song)).toEqual({ status: "own", title: "my song.m4a" });
  expect(foundBeats({ [beatKey(song)]: { bpm: 120, first: 0.2, confidence: 3, beats: [0.2, 0.7] } }, song)).toEqual({ status: "ok", title: "my song.m4a", beats: [0.2, 0.7] });
  expect(foundBeats({ [beatKey(song)]: null }, song)).toEqual({ status: "unsteady", title: "my song.m4a" });
  expect(foundBeats({ [beatKey(song)]: { bpm: 120, first: 0, confidence: 3, beats: [] } }, song)).toEqual({ status: "unsteady", title: "my song.m4a" });
});

test("listenForBeats: asks the phone for the track's range, analyses, and remembers the beats in FILE seconds", async () => {
  const { env, rate, seconds } = envOf(clicks(120, 0.2, 60));
  native.mockResolvedValueOnce({ env: Array.from(env), rate, seconds, from: 0 });
  await expect(listenForBeats(song)).resolves.toBe("ok");
  expect(native).toHaveBeenCalledWith({ jobId: "job-1", sourceUri: song.sourceUri, from: 0, to: 60 });
  const kept = useOwnBeats.getState().found[beatKey(song)];
  expect(kept?.bpm).toBeCloseTo(120, 0);
  expect(kept?.beats.length).toBeGreaterThan(100);
  expect(foundBeats(useOwnBeats.getState().found, song).status).toBe("ok");
});

test("listenForBeats: a long file is listened to from its trim, and the beats are moved to file seconds", async () => {
  const long = makeAudioTrack({ id: "l", title: "set.m4a", sourceDuration: 3600, trimStart: 125.7, trimEnd: 200, sourceUri: "file:///doc/projects/p1/media/set.m4a" });
  const { env, rate, seconds } = envOf(clicks(120, 0.2, 60));
  native.mockResolvedValueOnce({ env: Array.from(env), rate, seconds, from: 125 });
  await expect(listenForBeats(long)).resolves.toBe("ok");
  expect(native).toHaveBeenCalledWith({ jobId: "job-1", sourceUri: long.sourceUri, from: 125, to: 725 });
  const kept = useOwnBeats.getState().found[beatKey(long)];
  expect(kept && kept.beats[0]).toBeGreaterThanOrEqual(125);
  expect(kept && kept.first).toBeGreaterThanOrEqual(125);
});

test("listenForBeats: no steady beat and a sound under 8 seconds are remembered as none", async () => {
  const n = envOf(noise(40));
  native.mockResolvedValueOnce({ env: Array.from(n.env), rate: n.rate, seconds: n.seconds, from: 0 });
  await expect(listenForBeats(song)).resolves.toBe("unsteady");
  expect(useOwnBeats.getState().found[beatKey(song)]).toBeNull();
  forgetOwnBeats();
  native.mockResolvedValueOnce({ env: [0, 1, 0], rate: 100, seconds: 7.9, from: 0 });
  await expect(listenForBeats(song)).resolves.toBe("short");
  expect(useOwnBeats.getState().found[beatKey(song)]).toBeNull();
});

test("one at a time; a stop tells the phone, ends the wait at once and remembers nothing", async () => {
  let release: (v: never) => void = () => {};
  native.mockReturnValueOnce(new Promise((resolve) => { release = resolve; }));
  const first = listenForBeats(song);
  await Promise.resolve();
  await expect(listenForBeats(song)).resolves.toBe("stopped");       // busy: the second call does nothing
  expect(native).toHaveBeenCalledTimes(1);
  stopListening();
  await expect(first).resolves.toBe("stopped");
  expect(cancelBeatEnvelope).toHaveBeenCalledWith("job-1");
  expect(beatKey(song) in useOwnBeats.getState().found).toBe(false);
  release(undefined as never);                                       // a late native answer changes nothing
  await Promise.resolve();
  expect(beatKey(song) in useOwnBeats.getState().found).toBe(false);
  stopListening();                                                   // nothing running: nothing happens
  expect(cancelBeatEnvelope).toHaveBeenCalledTimes(1);
});

test("a native failure rejects with its message; a native cancel is a stop; the deadline stops a render that never answers", async () => {
  native.mockRejectedValueOnce(new Error("beats source: this file has no sound"));
  await expect(listenForBeats(song)).rejects.toThrow("beats source: this file has no sound");
  native.mockRejectedValueOnce(Object.assign(new Error("Beats cancelled"), { code: "E_BEATS_CANCELLED" }));
  await expect(listenForBeats(song)).resolves.toBe("stopped");
  jest.useFakeTimers();
  try {
    native.mockReturnValueOnce(new Promise(() => {}));
    const hung = listenForBeats(song);
    await Promise.resolve();
    jest.advanceTimersByTime(BEATS_DEADLINE_MS);
    await expect(hung).resolves.toBe("stopped");
    expect(cancelBeatEnvelope).toHaveBeenCalledWith("job-1");
  } finally { jest.useRealTimers(); }
});
```

- [ ] **Step 2: Run** `npx.cmd jest src/editor/__tests__/ownBeats.test.ts` → FAIL (module missing).
- [ ] **Step 3: Implement.** Create `src/editor/ownBeats.ts`:

```ts
import { create } from "zustand";
import { beatEnvelope, cancelBeatEnvelope, isBeatsCancelled, type BeatEnvelopeResult } from "@/modules/clipy-video";
import { BEAT_DETECT, beatsFromPeriod, coarsePeriod, finePeriodSlice, fineStart, isSteady, type BeatAnalysis } from "@/src/editor/model/beatDetect";
import type { AudioTrack } from "@/src/editor/model/types";
import { newId } from "@/src/lib/id";
import { beatsOf, type TrackBeats } from "./musicBeats";

/**
 * Find beats for a sound of the owner's own. The phone decodes the file and returns the onset envelope (the detector's first
 * stage); the tempo and the grid are found here with the detector's own pieces, a few steps at a time so the screen stays alive,
 * and accepted by the bundled tracks' rule. `maxSeconds`: the longest stretch listened to; `minSeconds`: under this there is
 * nothing to split in two; `slice`: fine steps between two pauses.
 */
export const BEAT_ANALYSIS = { maxSeconds: 600, minSeconds: 8, slice: 4 } as const;
/** A listening that has not answered by then is told to stop. */
export const BEATS_DEADLINE_MS = 120000;

/** What listening found, by `beatKey`: the beats (FILE seconds), or null for a sound without a steady beat. Remembered until the app closes; never saved. */
export const useOwnBeats = create<{ found: Record<string, TrackBeats | null> }>(() => ({ found: {} }));
const remember = (key: string, value: TrackBeats | null): void => useOwnBeats.setState((s) => ({ found: { ...s.found, [key]: value } }));

type Listened = Pick<AudioTrack, "sourceUri" | "sourceDuration" | "trimStart" | "title" | "kind">;
/** The seconds of the track's FILE that are listened to: all of it up to `maxSeconds`; a longer file from the second its trim starts in. */
export function beatRange(t: Pick<AudioTrack, "sourceDuration" | "trimStart">): { from: number; to: number } {
  if (t.sourceDuration <= BEAT_ANALYSIS.maxSeconds) return { from: 0, to: t.sourceDuration };
  const from = Math.max(0, Math.floor(t.trimStart));
  return { from, to: Math.min(t.sourceDuration, from + BEAT_ANALYSIS.maxSeconds) };
}
/** One listening's identity: the file and the stretch. A split piece or a copy of a short file shares it. */
export function beatKey(t: Pick<AudioTrack, "sourceUri" | "sourceDuration" | "trimStart">): string {
  const r = beatRange(t);
  return `${t.sourceUri}|${r.from}|${r.to}`;
}

/** What Find beats can do with a track: its beats; no steady beat; or `own` — not listened to yet. */
export type OwnFound = { status: "ok"; title: string; beats: readonly number[] } | { status: "unsteady"; title: string } | { status: "own"; title: string };
export function foundBeats(found: Record<string, TrackBeats | null>, t: Listened): OwnFound {
  const bundled = beatsOf(t);
  if (bundled.status !== "own") return bundled;
  const key = beatKey(t);
  if (!Object.prototype.hasOwnProperty.call(found, key)) return { status: "own", title: t.title };
  const hit = found[key];
  return hit && hit.beats.length > 0 ? { status: "ok", title: t.title, beats: hit.beats } : { status: "unsteady", title: t.title };
}

/** `beatPeriod`, `slice` fine steps at a time with a pause after each slice. null = stopped. */
async function periodOf(env: Float64Array, rate: number, pause: () => Promise<void>, stopped: () => boolean): Promise<number | null> {
  const coarse = coarsePeriod(env, rate);
  if (coarse === 0) return 0;
  let best = fineStart(coarse);
  for (let s = -BEAT_DETECT.fineSteps; s <= BEAT_DETECT.fineSteps; s += BEAT_ANALYSIS.slice) {
    best = finePeriodSlice(env, coarse, s, s + BEAT_ANALYSIS.slice, best);
    await pause();
    if (stopped()) return null;
  }
  return best.period;
}
/**
 * The beats of an envelope when they pass the bundled tracks' rule (`isSteady`: the whole, and each HALF of the envelope alone),
 * else null; "stopped" when `stopped()` turned true between two slices. Times are seconds from the envelope's start.
 */
export async function analyseEnvelope(env: Float64Array, rate: number, seconds: number, pause: () => Promise<void>, stopped: () => boolean): Promise<BeatAnalysis | null | "stopped"> {
  const half = Math.floor(env.length / 2);
  const parts: [Float64Array, number][] = [[env, seconds], [env.subarray(0, half), half / rate], [env.subarray(half), (env.length - half) / rate]];
  const found: (BeatAnalysis | null)[] = [];
  for (const [part, length] of parts) {
    const period = await periodOf(part, rate, pause, stopped);
    if (period === null) return "stopped";
    found.push(beatsFromPeriod(part, rate, period, length));
  }
  return isSteady(found[0], found[1], found[2]) ? found[0] : null;
}

const r3 = (v: number): number => Math.round(v * 1000) / 1000;
const pause = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));
type Run = { jobId: string; stopped: boolean; giveUp: (() => void) | null };
/** The one listening that is going on. */
let running: Run | null = null;

/** Ends the listening that is going on (the panel closed, the editor left, the deadline): the phone is told once, and the wait ends at once whatever it answers. */
export function stopListening(): void {
  const run = running;
  if (!run) return;
  run.stopped = true;
  running = null;
  try { cancelBeatEnvelope(run.jobId); } catch (e) { console.warn("beats cancel failed", e); }
  run.giveUp?.();
}

export type ListenAnswer = "ok" | "unsteady" | "short" | "stopped";
/**
 * Listens to a track's ORIGINAL file (a Voice / Sound copy has the same timing) and remembers what it finds: "ok" — beats, in file
 * seconds; "unsteady" — no clear, steady beat; "short" — under `minSeconds` of sound (both remembered as none); "stopped" — ended by
 * `stopListening`, or another listening was going on (nothing remembered). Rejects with the native staged message when the file
 * cannot be read. Writes nothing to the project.
 */
export async function listenForBeats(t: Listened): Promise<ListenAnswer> {
  if (running) return "stopped";
  const run: Run = { jobId: newId(), stopped: false, giveUp: null };
  running = run;
  const range = beatRange(t), key = beatKey(t);
  const deadline = setTimeout(() => { if (running === run) stopListening(); }, BEATS_DEADLINE_MS);
  try {
    const got = await new Promise<BeatEnvelopeResult>((resolve, reject) => {
      run.giveUp = () => reject(new Error("Beats stopped"));
      Promise.resolve().then(() => beatEnvelope({ jobId: run.jobId, sourceUri: t.sourceUri, from: range.from, to: range.to })).then(resolve, reject);
    });
    if (run.stopped) return "stopped";
    if (!(got.seconds >= BEAT_ANALYSIS.minSeconds)) { remember(key, null); return "short"; }
    const result = await analyseEnvelope(Float64Array.from(got.env), got.rate, got.seconds, pause, () => run.stopped);
    if (result === "stopped" || run.stopped) return "stopped";
    if (!result) { remember(key, null); return "unsteady"; }
    const from = Number.isFinite(got.from) ? got.from : range.from;
    remember(key, { bpm: result.bpm, first: r3(result.first + from), confidence: result.confidence, beats: result.beats.map((b) => r3(b + from)) });
    return "ok";
  } catch (e) {
    if (run.stopped || isBeatsCancelled(e)) return "stopped";
    throw e;
  } finally {
    clearTimeout(deadline);
    run.giveUp = null;
    if (running === run) running = null;
  }
}

/** Forgets everything listened to and ends a listening (tests). */
export function forgetOwnBeats(): void {
  stopListening();
  useOwnBeats.setState({ found: {} });
}
```

- [ ] **Step 4: Run** `npx.cmd jest src/editor/__tests__/ownBeats.test.ts` → PASS. Then `npm run typecheck` and `npm test`.
- [ ] **Step 5: Commit** — `feat(editor): own beats — the phone's envelope analysed in slices by the bundled tracks' rule, remembered for the session`.

---

### Task 7: Swift: `BeatEnvelope.swift`, the module functions, the parity test

**Depends on:** Task 4 (the shapes). **Parallel-safe with:** 3, 5.

**Files:** Create `modules/clipy-video/ios/BeatEnvelope.swift`, `src/editor/model/__tests__/beatEnvelope.parity.test.ts`. Modify `modules/clipy-video/ios/ClipyVideoModule.swift` (additions only).

**Do not touch:** every other Swift file, `index.ts` (Task 4 fixed the shapes), the podspec (AVFoundation is linked already), `beatDetect.ts`.

**Interfaces: Consumes** `ExportSession.describe`, `ExportSession.fileURL(from:)`, `ExportSession.time(_:)`; the shapes of Task 4; the formula of `onsetEnvelope`. **Produces** the native functions `beatEnvelope`, `cancelBeatEnvelope`.

- [ ] **Step 1: Failing tests.** Create `src/editor/model/__tests__/beatEnvelope.parity.test.ts`:

```ts
import { readFileSync } from "fs";
import { join } from "path";
import { BEAT_DETECT, onsetEnvelope } from "../beatDetect";

// There is no Swift compiler on this machine: these tests READ the Swift and pin what the app relies on.
const root = join(__dirname, "../../../..");
const iosDir = join(root, "modules/clipy-video/ios");
const read = (file: string) => readFileSync(join(iosDir, file), "utf8").replace(/\r\n/g, "\n");
const code = (source: string) => source.replace(/\/\/[^\n]*/g, "");
const swift = code(read("BeatEnvelope.swift"));
const moduleSwift = code(read("ClipyVideoModule.swift"));
const wrapper = readFileSync(join(root, "modules/clipy-video/index.ts"), "utf8");
const ts = readFileSync(join(root, "src/editor/model/beatDetect.ts"), "utf8");
const between = (source: string, from: string, to: string): string => {
  const start = source.indexOf(from);
  if (start < 0) throw new Error(`"${from}" not found`);
  const end = source.indexOf(to, start + from.length);
  return source.slice(start, end < 0 ? undefined : end);
};
const num = (name: string): number => {
  const m = new RegExp(`static let ${name}: Double = ([0-9._]+)`).exec(swift);
  if (!m) throw new Error(`${name} not found`);
  return Number(m[1].replace(/_/g, ""));
};

test("the three constants of the envelope are the detector's", () => {
  expect(num("envelopeRate")).toBe(BEAT_DETECT.envelopeRate);
  expect(num("windowSeconds")).toBe(BEAT_DETECT.windowSeconds);
  expect(num("compress")).toBe(BEAT_DETECT.compress);
  expect(num("decodeRate")).toBe(44100);                       // the rate the bundled tracks were analysed at
});

test("the hop, the window size, the Hann window and the flux are the TypeScript formulas", () => {
  const builder = between(swift, "final class EnvelopeBuilder", "\n}\n");
  // hop = max(1, round(rate / envelopeRate)); size = the next power of two at or above ceil(rate * windowSeconds)
  expect(ts).toContain("const hop = Math.max(1, Math.round(sampleRate / BEAT_DETECT.envelopeRate));");
  expect(builder).toContain("hop = max(1, Int((sampleRate / BeatEnvelope.envelopeRate).rounded()))");
  expect(ts).toContain("const size = nextPow2(Math.ceil(sampleRate * BEAT_DETECT.windowSeconds));");
  expect(builder).toContain("size = BeatEnvelope.nextPow2(Int((sampleRate * BeatEnvelope.windowSeconds).rounded(.up)))");
  expect(ts).toContain("hann[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (size - 1));");
  expect(builder).toContain("hann[i] = 0.5 - 0.5 * cos(2 * Double.pi * Double(i) / Double(size - 1))");
  expect(ts).toContain("cur[k] = Math.log(1 + BEAT_DETECT.compress * Math.hypot(re[k], im[k]) / size);");
  expect(builder).toContain("cur[k] = log(1 + BeatEnvelope.compress * hypot(re[k], im[k]) / Double(size))");
  expect(ts).toContain("env[f] = f === 0 ? 0 : flux;");
  expect(builder).toContain("env.append(env.isEmpty ? 0 : flux)");
  expect(ts).toContain("return { env, rate: sampleRate / hop };");
  expect(builder).toContain("var rate: Double { sampleRate / Double(hop) }");
});

test("the FFT is the same radix-2 transform, line for line where it counts", () => {
  const fft = between(swift, "static func fft(", "\n  }\n");
  expect(fft).toContain("let ang = -2 * Double.pi / Double(len)");
  expect(fft).toContain("let xr = re[b] * cr - im[b] * ci");
  expect(fft).toContain("let xi = re[b] * ci + im[b] * cr");
  expect(fft).toContain("let nr = cr * wr - ci * wi");
  expect(fft).toContain("ci = cr * wi + ci * wr");
  expect(ts).toContain("const xr = re[b] * cr - im[b] * ci, xi = re[b] * ci + im[b] * cr;");
  expect(ts).toContain("const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr;");
});

test("the worked vector of the spec (§5.2): what the TypeScript side gives for the sound the Swift side must give the same for", () => {
  const x = new Float32Array(800);
  for (let i = 400; i < 800; i++) x[i] = Math.sin((2 * Math.PI * 1000 * i) / 8000) * 0.5;
  const { env, rate } = onsetEnvelope(x, 8000);
  expect(rate).toBe(100);
  expect(Array.from(env).map((v) => Math.round(v * 1e6) / 1e6)).toEqual([0, 0, 0, 0, 0, 102.717898, 17.724067, 0.30335, 0.091661, 0]);
});

test("the request record has exactly the fields the app sends; the answer has the keys the wrapper declares", () => {
  const fields = [...between(swift, "struct BeatEnvelopeRequest: Record {", "\n}").matchAll(/@Field var (\w+)/g)].map((m) => m[1]);
  expect(fields.sort()).toEqual(["from", "jobId", "sourceUri", "to"]);
  expect(wrapper).toContain("export interface BeatEnvelopeRequest { jobId: string; sourceUri: string; from: number; to: number }");
  expect(swift).toContain('let answer: [String: Any] = ["env": builder.env, "rate": builder.rate, "seconds": Double(builder.count) / builder.sampleRate, "from": start]');
  expect(wrapper).toContain("export interface BeatEnvelopeResult { env: number[]; rate: number; seconds: number; from: number }");
});

test("the decoded sound is checked before it is read as floats, and the asset outlives its reader", () => {
  const decode = between(swift, "static func decode(", "\n  }\n");
  expect(decode).toContain("AVLinearPCMIsFloatKey: true");
  expect(decode).toContain("AVLinearPCMBitDepthKey: 32");
  expect(decode).toContain("AVSampleRateKey: BeatEnvelope.decodeRate");
  expect(decode).toContain("basic.mFormatID == kAudioFormatLinearPCM");
  expect(decode).toContain("basic.mBitsPerChannel == 32");
  expect(decode).toContain("(basic.mFormatFlags & kAudioFormatFlagIsFloat) != 0");
  expect(decode).toContain("reader.canAdd(output)");
  expect(decode).toContain("job.isCancelled");
  expect(decode).toContain("asset: AVURLAsset");                 // handed in by `run`, which holds it until decode returns
  const run = between(swift, "static func run(", "\n  }\n");
  expect(run).toContain("let asset = AVURLAsset(url: url)");
  expect(run).toContain("return try decode(asset: asset, track: track");
  expect(run).toContain("try await asset.loadTracks(withMediaType: .audio)");
  expect(run).toContain("try await asset.load(.duration)");
});

test("every failure has a beats stage; a cancel has its own code; the promise is answered once", () => {
  const thrown = [...swift.matchAll(/BeatError\.failed\("([^"]*)/g)].map((m) => m[1]);
  expect(thrown.length).toBeGreaterThanOrEqual(6);
  for (const text of thrown) expect(text).toMatch(/^beats (source|reader): /);
  expect(swift).toContain("ExportSession.describe(");
  const fn = between(moduleSwift, 'AsyncFunction("beatEnvelope")', "\n    }\n");
  expect(fn).toContain("self.storeBeatJob(jobId, job)");
  expect(fn).toContain("defer { self?.dropBeatJob(jobId) }");
  expect(fn.split("promise.resolve(").length - 1).toBe(1);
  expect(fn).toContain('promise.reject("E_BEATS_CANCELLED", "Beats cancelled")');
  expect(fn).toContain('promise.reject("E_BEATS", BeatEnvelope.message(error))');
  expect(moduleSwift).toContain('Function("cancelBeatEnvelope")');
  expect(wrapper).toContain('export const BEATS_CANCELLED = "E_BEATS_CANCELLED";');
});

test("no force unwrap, no try!, no as!; no type and no static name declared twice; nothing clashes with the other files", () => {
  expect(swift).not.toMatch(/[\w)\]]!(?!=)/);
  expect(swift).not.toMatch(/\b(try|as)!/);
  const types = [...swift.matchAll(/^(?:final class|struct|enum) (\w+)/gm)].map((m) => m[1]);
  expect(types.sort()).toEqual(["BeatEnvelope", "BeatEnvelopeRequest", "BeatError", "BeatJob", "EnvelopeBuilder"]);
  const others = ["ExportSession.swift", "ClipyVideoModule.swift", "MediaPrePass.swift", "Transcriber.swift", "AudioMix.swift", "SoundMath.swift", "SoundRender.swift", "SpeechRender.swift", "ClipyCompositor.swift"].map((f) => code(read(f))).join("\n");
  for (const t of types) expect(others).not.toMatch(new RegExp(`(?:class|struct|enum) ${t}\\b`));
  const body = between(swift, "enum BeatEnvelope {", "\n}\n");
  const values = [...body.matchAll(/static (?:let|var) (\w+)/g)].map((m) => m[1]);
  const funcs = [...body.matchAll(/static func (\w+)\(/g)].map((m) => m[1]);
  expect(values.filter((n) => funcs.includes(n))).toEqual([]);
  expect(new Set(values).size).toBe(values.length);
  expect(new Set(funcs).size).toBe(funcs.length);
  // Everything that was there is still there.
  for (const name of ["exportTimeline", "transcribe", "renderSound", "soundInfo", "probeNoiseReduction", "listVoices", "speakToFile"]) expect(moduleSwift).toContain(`AsyncFunction("${name}")`);
});
```

- [ ] **Step 2: Run** `npx.cmd jest src/editor/model/__tests__/beatEnvelope.parity.test.ts` → FAIL (no file).
- [ ] **Step 3: Implement.** Create `modules/clipy-video/ios/BeatEnvelope.swift`:

```swift
import AVFoundation
import ExpoModulesCore

/// One Find beats for a file of the owner's (`BeatEnvelopeRequest` in modules/clipy-video/index.ts): the seconds of the
/// file to listen to. `to` at or before `from` means to the end of the file.
struct BeatEnvelopeRequest: Record {
  @Field var jobId: String = ""
  @Field var sourceUri: String = ""
  @Field var from: Double = 0
  @Field var to: Double = 0
}

enum BeatError: Error, LocalizedError {
  case cancelled
  case failed(String)
  var errorDescription: String? {
    switch self {
    case .cancelled: return "Beats cancelled"
    case .failed(let text): return text
    }
  }
}

/// A listening while it runs: `cancel()` makes the decode loop stop at its next buffer.
final class BeatJob: @unchecked Sendable {
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

/// The onset envelope of a mono signal, one sample at a time — the mirror of `onsetEnvelope` in
/// src/editor/model/beatDetect.ts (keep the two identical: constants, formulas, vectors). It keeps only the last
/// `size` samples (a ring), so memory does not grow with the file; frame f is the window that ENDS at sample
/// (f + 1) * hop, zero before the start.
final class EnvelopeBuilder {
  let sampleRate: Double
  let hop: Int
  let size: Int
  private let hann: [Double]
  private var ring: [Double]
  private var at = 0                               // where the next sample goes = the oldest sample in the ring
  private var re: [Double]
  private var im: [Double]
  private var prev: [Double]
  private var cur: [Double]
  private(set) var env: [Double] = []
  private(set) var count = 0                       // samples taken

  /// Everything is worked out in locals first and stored last: no property of `self` is read before all are set.
  init(sampleRate: Double) {
    let hop = max(1, Int((sampleRate / BeatEnvelope.envelopeRate).rounded()))
    let size = BeatEnvelope.nextPow2(Int((sampleRate * BeatEnvelope.windowSeconds).rounded(.up)))
    var hann = [Double](repeating: 0, count: size)
    for i in 0..<size {
      hann[i] = 0.5 - 0.5 * cos(2 * Double.pi * Double(i) / Double(size - 1))
    }
    self.sampleRate = sampleRate
    self.hop = hop
    self.size = size
    self.hann = hann
    self.ring = [Double](repeating: 0, count: size)
    self.re = [Double](repeating: 0, count: size)
    self.im = [Double](repeating: 0, count: size)
    self.prev = [Double](repeating: 0, count: size / 2)
    self.cur = [Double](repeating: 0, count: size / 2)
  }

  /// Values per second of sound.
  var rate: Double { sampleRate / Double(hop) }

  func push(_ sample: Double) {
    ring[at] = sample
    at = (at + 1) % size
    count += 1
    if count % hop == 0 { frame() }
  }

  /// One value: the sum over frequency of the RISE in log-compressed magnitude since the previous frame.
  private func frame() {
    for i in 0..<size {
      re[i] = ring[(at + i) % size] * hann[i]
      im[i] = 0
    }
    BeatEnvelope.fft(&re, &im)
    var flux = 0.0
    for k in 0..<(size / 2) {
      cur[k] = log(1 + BeatEnvelope.compress * hypot(re[k], im[k]) / Double(size))
      let d = cur[k] - prev[k]
      if d > 0 { flux += d }
    }
    env.append(env.isEmpty ? 0 : flux)
    let last = prev
    prev = cur
    cur = last
  }
}

/// Find beats, the native part: the file's sound decoded to float PCM and turned into the onset envelope. Everything
/// that decides a tempo is TypeScript (src/editor/ownBeats.ts).
enum BeatEnvelope {
  /// Onset-envelope values per second (the hop is the sample rate / this, rounded).
  static let envelopeRate: Double = 100
  /// Analysis window in seconds (rounded up to a power of two samples).
  static let windowSeconds: Double = 0.023
  /// Log compression of the magnitudes before the difference.
  static let compress: Double = 1000
  /// The rate the sound is decoded at: the one the bundled tracks were analysed at.
  static let decodeRate: Double = 44_100
  /// Never listen to more than this many seconds, whatever the request says.
  static let longestSeconds: Double = 600

  /// What a failure says to the app: a BeatError's own staged text, anything else described in full.
  static func message(_ error: Error) -> String {
    if let own = error as? BeatError, let text = own.errorDescription { return text }
    return "beats reader: " + ExportSession.describe(error)
  }

  static func nextPow2(_ n: Int) -> Int {
    var p = 1
    while p < n { p *= 2 }
    return p
  }

  /// In-place radix-2 FFT of `re` / `im` (their length a power of two) — the transform of beatDetect.ts.
  static func fft(_ re: inout [Double], _ im: inout [Double]) {
    let n = re.count
    var j = 0
    var i = 1
    while i < n {
      var bit = n >> 1
      while j & bit != 0 {
        j ^= bit
        bit >>= 1
      }
      j ^= bit
      if i < j {
        re.swapAt(i, j)
        im.swapAt(i, j)
      }
      i += 1
    }
    var len = 2
    while len <= n {
      let ang = -2 * Double.pi / Double(len)
      let wr = cos(ang)
      let wi = sin(ang)
      var first = 0
      while first < n {
        var cr = 1.0
        var ci = 0.0
        for k in 0..<(len / 2) {
          let a = first + k
          let b = a + len / 2
          let xr = re[b] * cr - im[b] * ci
          let xi = re[b] * ci + im[b] * cr
          re[b] = re[a] - xr
          im[b] = im[a] - xi
          re[a] += xr
          im[a] += xi
          let nr = cr * wr - ci * wi
          ci = cr * wi + ci * wr
          cr = nr
        }
        first += len
      }
      len *= 2
    }
  }

  /// Opens the file, finds its first sound track and decodes the asked stretch. The asset is a local of this
  /// function, which does not return before `decode` has (a track's `asset` is a weak reference).
  static func run(_ request: BeatEnvelopeRequest, job: BeatJob) async throws -> [String: Any] {
    guard let url = ExportSession.fileURL(from: request.sourceUri) else { throw BeatError.failed("beats source: not a file path") }
    let asset = AVURLAsset(url: url)
    let tracks: [AVAssetTrack]
    let length: CMTime
    do {
      tracks = try await asset.loadTracks(withMediaType: .audio)
      length = try await asset.load(.duration)
    } catch {
      throw BeatError.failed("beats source: " + ExportSession.describe(error))
    }
    guard let track = tracks.first else { throw BeatError.failed("beats source: this file has no sound") }
    let total = length.seconds.isFinite ? length.seconds : 0
    let start = max(0, min(request.from.isFinite ? request.from : 0, total))
    let asked = request.to.isFinite && request.to > start ? request.to : total
    let end = min(total, asked, start + longestSeconds)
    guard end - start > 0 else { throw BeatError.failed("beats source: nothing to listen to") }
    return try decode(asset: asset, track: track, start: start, end: end, job: job)
  }

  /// Reads `start` … `end` of the track as 32-bit float PCM, averages the channels and builds the envelope. Each
  /// buffer says what it holds (rate, channels, float) and is refused when that is not what was asked for.
  static func decode(asset: AVURLAsset, track: AVAssetTrack, start: Double, end: Double, job: BeatJob) throws -> [String: Any] {
    let reader: AVAssetReader
    do {
      reader = try AVAssetReader(asset: asset)
    } catch {
      throw BeatError.failed("beats reader: " + ExportSession.describe(error))
    }
    let settings: [String: Any] = [
      AVFormatIDKey: kAudioFormatLinearPCM,
      AVSampleRateKey: BeatEnvelope.decodeRate,
      AVLinearPCMBitDepthKey: 32,
      AVLinearPCMIsFloatKey: true,
      AVLinearPCMIsBigEndianKey: false,
      AVLinearPCMIsNonInterleaved: false,
    ]
    let output = AVAssetReaderTrackOutput(track: track, outputSettings: settings)
    output.alwaysCopiesSampleData = false
    guard reader.canAdd(output) else { throw BeatError.failed("beats reader: this sound cannot be decoded") }
    reader.add(output)
    reader.timeRange = CMTimeRange(start: ExportSession.time(start), end: ExportSession.time(end))
    guard reader.startReading() else { throw BeatError.failed("beats reader: " + ExportSession.describe(reader.error)) }

    var made: EnvelopeBuilder? = nil
    var channels = 0
    var scratch: [Float] = []
    while let sample = output.copyNextSampleBuffer() {
      if job.isCancelled {
        reader.cancelReading()
        throw BeatError.cancelled
      }
      guard let format = CMSampleBufferGetFormatDescription(sample),
            let basic = CMAudioFormatDescriptionGetStreamBasicDescription(format)?.pointee,
            let block = CMSampleBufferGetDataBuffer(sample) else { continue }
      guard basic.mFormatID == kAudioFormatLinearPCM, basic.mBitsPerChannel == 32,
            (basic.mFormatFlags & kAudioFormatFlagIsFloat) != 0, basic.mSampleRate > 0, basic.mChannelsPerFrame > 0 else {
        reader.cancelReading()
        throw BeatError.failed("beats reader: unexpected sound format")
      }
      let builder: EnvelopeBuilder
      if let existing = made {
        guard existing.sampleRate == basic.mSampleRate, channels == Int(basic.mChannelsPerFrame) else {
          reader.cancelReading()
          throw BeatError.failed("beats reader: unexpected sound format")
        }
        builder = existing
      } else {
        builder = EnvelopeBuilder(sampleRate: basic.mSampleRate)
        channels = Int(basic.mChannelsPerFrame)
        made = builder
      }
      let floats = CMBlockBufferGetDataLength(block) / MemoryLayout<Float>.size
      if floats == 0 { continue }
      if scratch.count < floats { scratch = [Float](repeating: 0, count: floats) }
      let status: OSStatus = scratch.withUnsafeMutableBytes { (raw: UnsafeMutableRawBufferPointer) -> OSStatus in
        guard let base = raw.baseAddress else { return -1 }
        return CMBlockBufferCopyDataBytes(block, atOffset: 0, dataLength: floats * MemoryLayout<Float>.size, destination: base)
      }
      guard status == kCMBlockBufferNoErr else {
        reader.cancelReading()
        throw BeatError.failed("beats reader: could not read the sound (\(status))")
      }
      let frames = floats / channels
      for f in 0..<frames {
        var sum: Float = 0
        for c in 0..<channels { sum += scratch[f * channels + c] }
        builder.push(Double(sum) / Double(channels))
      }
    }
    guard reader.status == .completed else { throw BeatError.failed("beats reader: " + ExportSession.describe(reader.error)) }
    guard let builder = made, builder.count > 0 else { throw BeatError.failed("beats reader: no sound came out") }
    let answer: [String: Any] = ["env": builder.env, "rate": builder.rate, "seconds": Double(builder.count) / builder.sampleRate, "from": start]
    return answer
  }
}
```

`modules/clipy-video/ios/ClipyVideoModule.swift`:

1. After the `lookupSpeechJob` function add:

```swift

  private let beatLock = NSLock()
  private var beatJobs: [String: BeatJob] = [:]   // guarded by `beatLock`; one entry per listening that has not answered yet

  private func storeBeatJob(_ id: String, _ job: BeatJob) {
    beatLock.lock(); defer { beatLock.unlock() }
    beatJobs[id] = job
  }

  private func dropBeatJob(_ id: String) {
    beatLock.lock(); defer { beatLock.unlock() }
    beatJobs[id] = nil
  }

  private func lookupBeatJob(_ id: String) -> BeatJob? {
    beatLock.lock(); defer { beatLock.unlock() }
    return beatJobs[id]
  }
```

2. At the end of `definition()`, after the `cancelSpeech` function, add:

```swift

    // Find beats for a file of the owner's: decodes the asked stretch of the file's sound and resolves its onset
    // envelope `{ env, rate, seconds, from }` (see BeatEnvelope). Rejects "E_BEATS_CANCELLED" after
    // `cancelBeatEnvelope(jobId)`, else "E_BEATS" with a staged message. The work runs on a Swift concurrency
    // thread; the job is stored before it starts, and every way out of the `do` answers the promise exactly once.
    AsyncFunction("beatEnvelope") { (request: BeatEnvelopeRequest, promise: Promise) in
      let job = BeatJob()
      let jobId = request.jobId
      self.storeBeatJob(jobId, job)
      Task { [weak self] in
        defer { self?.dropBeatJob(jobId) }
        do {
          let answer: [String: Any] = try await BeatEnvelope.run(request, job: job)
          promise.resolve(answer)
        } catch BeatError.cancelled {
          promise.reject("E_BEATS_CANCELLED", "Beats cancelled")
        } catch {
          promise.reject("E_BEATS", BeatEnvelope.message(error))
        }
      }
    }

    // Stops that listening at its next buffer (it then rejects "E_BEATS_CANCELLED"). An unknown or finished job: nothing.
    Function("cancelBeatEnvelope") { (jobId: String) in
      self.lookupBeatJob(jobId)?.cancel()
    }
```

**Read it back against these points before committing:** `run` is `async` and uses only the `async` forms (`loadTracks(withMediaType:)`, `load(.duration)`) with `try await`; `decode` is synchronous and holds no `await`; the `AVURLAsset` is a local of `run`, which is still on the stack while `decode` reads (rule 1); in `decode` the names `reader`, `settings`, `output`, `made`, `channels`, `scratch`, `sample`, `format`, `basic`, `block`, `builder`, `existing`, `floats`, `status`, `frames`, `sum`, `answer` are each declared once per scope (`builder` is declared once inside the loop body and once after the loop: different scopes); every early exit inside the loop that throws cancels the reader first; `kAudioFormatLinearPCM` and `kAudioFormatFlagIsFloat` are `UInt32` values compared with `mFormatID` / masked with `mFormatFlags` (both `UInt32`); `mBitsPerChannel` and `mChannelsPerFrame` are `UInt32` (compared with integer literals, converted with `Int(…)`); `CMBlockBufferCopyDataBytes` returns `OSStatus`; `ExportSession.describe` takes an optional `Error` (`reader.error` is one); the answer dictionary is typed `[String: Any]` and holds a `[Double]`, two `Double`s and a `Double`; `request.from` and `request.to` are ordinary property names (`from` is not a reserved word); in the module, `jobId`, `job` and `answer` are local to their own closure.

- [ ] **Step 4: Run** `npx.cmd jest src/editor/model/__tests__/beatEnvelope.parity.test.ts src/editor/model/__tests__/soundRender.swift.test.ts src/editor/model/__tests__/speechRender.swift.test.ts` → PASS. Then `npm run typecheck` and `npm test`. **No build.**
- [ ] **Step 5: Commit** — `feat(native): find beats — a file's sound decoded into the detector's onset envelope, one mirrored stage`.

---

### Task 6: The Beats panel: Find beats for own music

**Depends on:** Task 5. **Parallel-safe with:** 8, 12.

**Files:** Modify `src/editor/components/BeatsSheet.tsx`, `src/editor/__tests__/BeatsSheet.auto.test.tsx` (three pinned expectations, named below). Create `src/editor/__tests__/BeatsSheet.own.test.tsx`.

**Do not touch:** `beats.ts`, `musicBeats.ts`, `ownBeats.ts`, `BeatsSheet.test.tsx`, `BeatsSheet.limit.test.tsx`, `toolbarContext.ts`, `EditorToolbar.tsx`.

**Interfaces: Consumes** `foundBeats`, `listenForBeats`, `stopListening`, `useOwnBeats` (Task 5); `isBeatEnvelopeAvailable` (Task 4); `BEATS_BACKGROUND_TOOLS` (Task 4); the kit `Spinner`. **Produces**

```ts
export function findHint(status: string, title: string, canListen?: boolean): string;   // canListen defaults to true
export const BEAT_MESSAGES: { tooShort: string; failed: string; ownNeedsBuild: string };
```

- [ ] **Step 1: Failing tests.** Create `src/editor/__tests__/BeatsSheet.own.test.tsx`:

```tsx
import { act, fireEvent, render, screen } from "@testing-library/react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-09T10:00:00.000Z" }));
jest.mock("@react-native-community/slider", () => { const { View } = require("react-native"); return ({ testID, disabled }: { testID?: string; disabled?: boolean }) => <View testID={testID} accessibilityState={{ disabled: !!disabled }} />; });
jest.mock("@/modules/clipy-video", () => ({ ...jest.requireActual("@/modules/clipy-video"), isBeatEnvelopeAvailable: jest.fn(() => true) }));
jest.mock("@/src/editor/ownBeats", () => ({ ...jest.requireActual("@/src/editor/ownBeats"), listenForBeats: jest.fn(), stopListening: jest.fn() }));
import { isBeatEnvelopeAvailable } from "@/modules/clipy-video";
import { makeAudioTrack, makeClip, makeProject, type Project } from "@/src/editor/model/types";
import { beatKey, listenForBeats, stopListening, useOwnBeats } from "@/src/editor/ownBeats";
import { useEditorStore } from "@/src/editor/store";
import { BEATS_BACKGROUND_TOOLS } from "@/src/lib/buildInfo";
import { useToast } from "@/src/ui/Toast";
import { BEAT_MESSAGES, BeatsSheet, findHint } from "../components/BeatsSheet";

const st = () => useEditorStore.getState();
const markers = () => st().project!.beatMarkers;
const btn = (name: string) => screen.getByRole("button", { name });
const listen = jest.mocked(listenForBeats);
const song = makeAudioTrack({ id: "own", title: "my song.m4a", sourceDuration: 20, sourceUri: "file:///doc/projects/p1/media/song.m4a" });
const BEATS = { bpm: 120, first: 0.5, confidence: 3, beats: [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4] };
const open = async (extra: Partial<Project> = {}) => {
  st().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 10 })], audioTracks: [song], ...extra }));
  await render(<BeatsSheet visible onClose={() => {}} />);
};
/** A listening that ends when the test says so, with what it found remembered first (as the real one does). */
const pending = () => {
  let end: (v: "ok" | "unsteady" | "short" | "stopped") => void = () => {};
  listen.mockReturnValueOnce(new Promise((resolve) => { end = resolve; }));
  return { finish: async (answer: "ok" | "unsteady" | "short" | "stopped", found?: typeof BEATS | null) => {
    await act(async () => {
      if (found !== undefined) useOwnBeats.setState({ found: { [beatKey(song)]: found } });
      end(answer);
      await Promise.resolve();
    });
  } };
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(isBeatEnvelopeAvailable).mockReturnValue(true);
  useOwnBeats.setState({ found: {} });
  useToast.getState().clear();
  st().reset();
});

test("the sentences", () => {
  expect(findHint("own", "my song.m4a")).toBe("Find beats listens to my song.m4a for a few seconds.");
  expect(findHint("own", "my song.m4a", false)).toBe("For your own music, Find beats needs the latest Clipy build. Until then, tap the beat with Tap.");
  expect(findHint("ok", "Party Sector", false)).toBe("Find beats marks the beats of Party Sector.");
  expect(BEAT_MESSAGES).toEqual({ tooShort: "This sound is too short to find a beat in.", failed: "Could not listen to this sound.",
    ownNeedsBuild: "For your own music, Find beats needs the latest Clipy build. Until then, tap the beat with Tap." });
});

test("own music: the button is on and the hint says it will listen; a tap listens, shows the spinner, then places the markers in one undo step", async () => {
  await open();
  expect(btn("Find beats")).toBeEnabled();
  expect(screen.getByText("Find beats listens to my song.m4a for a few seconds.")).toBeTruthy();
  const run = pending();
  await fireEvent.press(btn("Find beats"));
  expect(listen).toHaveBeenCalledWith(expect.objectContaining({ id: "own", sourceUri: song.sourceUri }));
  expect(screen.getByLabelText("Listening to the music")).toBeTruthy();
  expect(btn("Find beats")).toBeDisabled();
  expect(markers()).toEqual([]);
  await run.finish("ok", BEATS);
  expect(screen.queryByLabelText("Listening to the music")).toBeNull();
  expect(markers()).toEqual([0.5, 1.5, 2.5, 3.5]);            // every 2nd beat: the slider rests in the middle
  expect(st().past).toHaveLength(1);
  expect(screen.getByText("Find beats marks the beats of my song.m4a.")).toBeTruthy();
});

test("once listened to, Find beats is instant and the slider is on", async () => {
  useOwnBeats.setState({ found: { [beatKey(song)]: BEATS } });
  await open();
  expect(screen.getByTestId("beats-density").props.accessibilityState.disabled).toBe(false);
  await fireEvent.press(btn("Find beats"));
  expect(listen).not.toHaveBeenCalled();
  expect(markers()).toEqual([0.5, 1.5, 2.5, 3.5]);
});

test("no steady beat: nothing is placed and the hint says so; too short says so in a toast", async () => {
  await open();
  const first = pending();
  await fireEvent.press(btn("Find beats"));
  await first.finish("unsteady", null);
  expect(markers()).toEqual([]);
  expect(st().past).toHaveLength(0);
  expect(screen.getByText("my song.m4a has no steady beat. Tap the beat with Tap instead.")).toBeTruthy();
  expect(btn("Find beats")).toBeDisabled();
  useOwnBeats.setState({ found: {} });
  await act(async () => {});
  const second = pending();
  await fireEvent.press(btn("Find beats"));
  await second.finish("short", null);
  expect(useToast.getState().message).toBe(BEAT_MESSAGES.tooShort);
});

test("a file that cannot be listened to: one plain toast, nothing placed, the button is back", async () => {
  await open();
  listen.mockRejectedValueOnce(new Error("beats source: this file has no sound"));
  const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  try {
    await fireEvent.press(btn("Find beats"));
    await act(async () => { await Promise.resolve(); });
    expect(useToast.getState().message).toBe(BEAT_MESSAGES.failed);
    expect(markers()).toEqual([]);
    expect(btn("Find beats")).toBeEnabled();
  } finally { warn.mockRestore(); }
});

test("on a build without it: the hint says so, a tap says the sentence, and nothing is listened to", async () => {
  jest.mocked(isBeatEnvelopeAvailable).mockReturnValue(false);
  await open();
  expect(screen.getByText(BEAT_MESSAGES.ownNeedsBuild)).toBeTruthy();
  await fireEvent.press(btn("Find beats"));
  expect(useToast.getState().message).toBe(BEATS_BACKGROUND_TOOLS);
  expect(listen).not.toHaveBeenCalled();
  expect(markers()).toEqual([]);
});

test("closing the panel while it listens stops the listening, and an answer that still comes places nothing", async () => {
  st().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 10 })], audioTracks: [song] }));
  const view = await render(<BeatsSheet visible onClose={() => {}} />);
  const run = pending();
  await fireEvent.press(btn("Find beats"));
  await view.rerender(<BeatsSheet visible={false} onClose={() => {}} />);
  expect(stopListening).toHaveBeenCalled();
  await run.finish("ok", BEATS);
  expect(markers()).toEqual([]);
});

test("the track deleted while it listens: the answer is dropped", async () => {
  await open();
  const run = pending();
  await fireEvent.press(btn("Find beats"));
  await act(() => { st().apply((p) => ({ ...p, audioTracks: [] })); });
  await run.finish("ok", BEATS);
  expect(markers()).toEqual([]);
});
```

(`useToast.getState().message` is how the other sheet tests read the toast; if the store's field has another name, use the one `BeatsSheet.limit.test.tsx` reads.)

- [ ] **Step 2: Run** `npx.cmd jest src/editor/__tests__/BeatsSheet.own.test.tsx` → FAIL.
- [ ] **Step 3: Implement** in `src/editor/components/BeatsSheet.tsx`.

1. Imports: `useEffect, useRef, useState` from react; add

```tsx
import { isBeatEnvelopeAvailable } from "@/modules/clipy-video";
import type { TrackBeats } from "@/src/editor/musicBeats";
import { foundBeats, listenForBeats, stopListening, useOwnBeats } from "@/src/editor/ownBeats";
import { BEATS_BACKGROUND_TOOLS } from "@/src/lib/buildInfo";
import { Spinner } from "@/src/ui/Spinner";
```

and remove the import of `beatsOf` from `@/src/editor/musicBeats`.

2. Replace `findTarget` and `findHint` with:

```tsx
/** What Find beats would listen to, as one string (so the panel re-renders only when the answer changes): `status|track id`. */
const findTarget = (p: Project | null, selectedAudioId: string | null, found: Record<string, TrackBeats | null>): string => {
  const track = p ? beatTrack(p, selectedAudioId) : null;
  return track ? `${foundBeats(found, track).status}|${track.id}` : "none|";
};
/** Said for things only a listening can say. */
export const BEAT_MESSAGES = {
  tooShort: "This sound is too short to find a beat in.",
  failed: "Could not listen to this sound.",
  ownNeedsBuild: "For your own music, Find beats needs the latest Clipy build. Until then, tap the beat with Tap.",
} as const;
/** The one sentence under the Find beats row: what it will do, or why it cannot. `canListen`: the installed app can listen to a file of the owner's. */
export function findHint(status: string, title: string, canListen = true): string {
  if (status === "ok") return `Find beats marks the beats of ${title}.`;
  if (status === "unsteady") return `${title} has no steady beat. Tap the beat with Tap instead.`;
  if (status === "own") return canListen ? `Find beats listens to ${title} for a few seconds.` : BEAT_MESSAGES.ownNeedsBuild;
  return "Add music to find its beats.";
}
```

3. In the component, replace the line that reads `const [status, targetId, title] = …` with:

```tsx
  const found = useOwnBeats((s) => s.found);
  const [status, targetId] = useEditorStore((s) => findTarget(s.project, s.selectedAudioId, found)).split("|");
  const title = useEditorStore((s) => (s.project ? beatTrack(s.project, s.selectedAudioId)?.title ?? "" : ""));
  /** The phone is listening to a file (own music): the button is off and the hint's place shows the spinner. */
  const [busy, setBusy] = useState(false);
  /** Whether the panel is on screen, for an answer that arrives late. */
  const shown = useRef(visible);
```

and replace the existing `useEffect(() => { if (!visible) setFoundFor(null); }, [visible]);` with:

```tsx
  useEffect(() => {
    shown.current = visible;
    if (visible) return;
    setFoundFor(null);
    setBusy(false);
    stopListening();
  }, [visible]);
  useEffect(() => () => { shown.current = false; stopListening(); }, []);
```

4. Replace `placed`, `leftOut` and `find` with (they read the remembered beats beside the bundled ones):

```tsx
  /** The track and its beats when it has any (bundled, or listened to), else null. */
  const known = (p: Project, trackId: string) => {
    const track = p.audioTracks.find((t) => t.id === trackId);
    const got = track ? foundBeats(useOwnBeats.getState().found, track) : null;
    return track && got && got.status === "ok" ? { track, beats: got.beats } : null;
  };
  /** The track's markers at a density, or the same project when the track is gone or has no beats. */
  const placed = (p: Project, trackId: string, d: BeatDensity): Project => {
    const k = known(p, trackId);
    return k ? placeBeats(p, k.track.id, k.beats, BEAT_EVERY[d]) : p;
  };
  /** How many beats of the track do not fit under the marker limit at a density (0 when the track is gone or has no beats). */
  const leftOut = (p: Project, trackId: string, d: BeatDensity): number => {
    const k = known(p, trackId);
    return k ? beatsLeftOut(p, k.track.id, k.beats, BEAT_EVERY[d]) : 0;
  };
  const find = () => {
    const { project, selectedAudioId, apply } = useEditorStore.getState();
    const track = project ? beatTrack(project, selectedAudioId) : null;
    const k = project && track ? known(project, track.id) : null;
    if (!project || !track || !k) return;
    setFoundFor(track.id);
    const next = placed(project, track.id, density);
    // One toast at most per press: the limit first (with beats left out, "already in place" would not be true).
    const over = leftOut(project, track.id, density) > 0;
    if (next === project) {
      const here = beatTimesFor(track, k.beats, BEAT_EVERY[density], totalDuration(project));
      useToast.getState().show(over ? LEFT_OUT : here.length > 0 ? ALREADY_PLACED : NO_BEATS_HERE);
      return;
    }
    haptic("medium");
    apply(() => next);
    if (over) useToast.getState().show(LEFT_OUT);
  };
  /**
   * Find beats for a sound of the owner's own: the phone listens (a few seconds; the spinner shows), and when it has found a steady
   * beat the ordinary Find runs — for the same track, in the same project, while the panel is still open. Anything else places nothing.
   */
  const listen = async () => {
    const { project, selectedAudioId } = useEditorStore.getState();
    const track = project ? beatTrack(project, selectedAudioId) : null;
    if (!project || !track || busy) return;
    if (!isBeatEnvelopeAvailable()) { useToast.getState().show(BEATS_BACKGROUND_TOOLS); return; }
    setBusy(true);
    try {
      const answer = await listenForBeats(track);
      if (!shown.current) return;
      if (answer === "short") { useToast.getState().show(BEAT_MESSAGES.tooShort); return; }
      if (answer !== "ok") return;
      const now = useEditorStore.getState();
      if (now.project && now.project.id === project.id && beatTrack(now.project, now.selectedAudioId)?.id === track.id) find();
    } catch (e) {
      console.warn("find beats failed", e);
      if (shown.current) useToast.getState().show(BEAT_MESSAGES.failed);
    } finally {
      if (shown.current) setBusy(false);
    }
  };
```

5. In the JSX: the Find beats button becomes

```tsx
          <SecondaryButton compact title="Find beats" disabled={busy || (status !== "ok" && status !== "own")} onPress={status === "own" ? () => { void listen(); } : find} />
```

and the hint line `<Body muted style={[small, { textAlign: "center" }]}>{findHint(status, title)}</Body>` becomes a row of fixed height whose content is the spinner while the phone listens:

```tsx
        <View style={{ height: theme.size.controlCompact, alignItems: "center", justifyContent: "center" }}>
          {busy
            ? <Spinner label="Listening to the music" />
            : <Body muted style={[small, { textAlign: "center" }]}>{findHint(status, title, isBeatEnvelopeAvailable())}</Body>}
        </View>
```

The slider keeps `disabled={status !== "ok"}`. Update the component's doc comment: after "from the beats the bundled tracks ship with (`musicBeats.ts`)" add `, or — for any other sound — from what the phone finds by listening to the file (\`ownBeats.ts\`: a few seconds, a spinner, then the same placing)`.

**Pinned expectations in `BeatsSheet.auto.test.tsx`** (the three places that say own music cannot be searched; nothing else in that file changes):
- the `findHint("own", "")` line of "the sentences" test: the expected string becomes `"For your own music, Find beats needs the latest Clipy build. Until then, tap the beat with Tap."` and the call becomes `findHint("own", "", false)`;
- the test "music of the owner's own: Find beats is off and one sentence says why; nothing is placed": the button is now **enabled**; assert `expect(btn("Find beats")).toBeEnabled()`, the sentence above on screen (in Jest the native module is not linked, so `isBeatEnvelopeAvailable()` is false), and that a press shows `BEATS_BACKGROUND_TOOLS` and places nothing; retitle it "music of the owner's own on a build without the listener: the hint says so, a tap says the sentence, nothing is placed";
- the line `expect(btn("Find beats")).toBeDisabled();   // the first music track is the owner's own file` becomes `expect(btn("Find beats")).toBeEnabled();   // the first music track is the owner's own file: it can be listened to`. If that test then presses Find beats and expects nothing placed, it still holds (the press says the build sentence).

- [ ] **Step 4: Run** `npx.cmd jest src/editor/__tests__/BeatsSheet.own.test.tsx src/editor/__tests__/BeatsSheet.auto.test.tsx src/editor/__tests__/BeatsSheet.test.tsx src/editor/__tests__/BeatsSheet.limit.test.tsx src/__tests__` → PASS (`BeatsSheet.test.tsx` and `BeatsSheet.limit.test.tsx` unedited). Then `npm run typecheck` and `npm test`.
- [ ] **Step 5: Commit** — `feat(editor): Find beats listens to the owner's own music — a spinner, the bundled rule, the same placing`.

---

### Task 8: The copies: `cutoutFiles.ts`, `cutoutRenders.ts`, mounted in the editor

**Depends on:** Tasks 3, 4. **Parallel-safe with:** 6, 12.

**Files:** Create `src/editor/cutoutFiles.ts`, `src/editor/cutoutRenders.ts`, `src/editor/__tests__/cutoutRenders.test.ts`. Modify `app/editor/[id]/index.tsx` (one import, one line).

**Do not touch:** `soundRenders.ts`, `soundFiles.ts`, every component.

**Interfaces: Consumes** `cutout.ts` (Task 3); `renderCutout`, `cancelCutout`, `addCutoutListener`, `isCutoutAvailable`, `isCutoutCancelled`, `CUTOUT_CANCELLED` (Task 4); `BEATS_BACKGROUND_TOOLS`. **Produces**

```ts
// src/editor/cutoutFiles.ts
export type CutoutFile = { status: "ready"; uri: string } | { status: "busy"; progress: number } | { status: "failed"; message: string };
export const useCutoutFiles: UseBoundStore<StoreApi<{ files: Record<string, CutoutFile> }>>;
export function knownCopies(files: Record<string, CutoutFile>): string[];                     // ready or busy
export function cutoutFileOf(files: Record<string, CutoutFile>, clip: Clip): CutoutFile | undefined;
export function shownCutout(files: Record<string, CutoutFile>, clip: Clip): string | null;   // the copy's uri once ready
// src/editor/cutoutRenders.ts
export const cutoutDir: (projectId: string) => string;
export const CUTOUT_CANCEL_GRACE_MS = 4000;
export const CUTOUT_SETTLE_MS = 800;
export const CUTOUT_FAILED: string; export const CUTOUT_NO_PERSON: string;
export const isNoPerson: (message: string) => boolean;
export function ensureCutout(projectId: string, need: NeededCutout, onProgress?: (fraction: number) => void): Promise<string>;
export function syncCutouts(projectId: string, needed: NeededCutout[]): void;
export function retryCutout(name: string): void;
export function resetCutouts(): void;
export function openCutouts(projectId: string): Promise<void>;       // registers the copies on disk, sweeps the unused, lets renders start
export function useCutoutRenders(): void;
```

- [ ] **Step 1: Failing tests.** Create `src/editor/__tests__/cutoutRenders.test.ts`:

```ts
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-09T10:00:00.000Z" }));
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
  const cut: { listener: unknown } = { listener: null };
  return {
    __cut: cut,
    isCutoutAvailable: jest.fn(() => true), renderCutout: jest.fn(), cancelCutout: jest.fn(),
    addCutoutListener: jest.fn((cb: unknown) => { cut.listener = cb; return { remove() {} }; }),
    isNativeAvailable: jest.fn(() => true), isSoundAvailable: jest.fn(() => true), isSpeechAvailable: jest.fn(() => true),
    CUTOUT_CANCELLED: "E_CUTOUT_CANCELLED",
    isCutoutCancelled: (e: unknown) => typeof e === "object" && e !== null && (e as { code?: string }).code === "E_CUTOUT_CANCELLED",
  };
});
import { cancelCutout, isCutoutAvailable, renderCutout } from "@/modules/clipy-video";
import { cutoutNeed, neededCutouts } from "@/src/editor/model/cutout";
import { setClipCutout } from "@/src/editor/model/ops";
import { makeClip, makePhotoClip, makeProject } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { BEATS_BACKGROUND_TOOLS } from "@/src/lib/buildInfo";
import { newId } from "@/src/lib/id";
import { useToast } from "@/src/ui/Toast";
import { cutoutFileOf, knownCopies, shownCutout, useCutoutFiles } from "../cutoutFiles";
import { CUTOUT_CANCEL_GRACE_MS, CUTOUT_FAILED, CUTOUT_NO_PERSON, CUTOUT_SETTLE_MS, cutoutDir, ensureCutout, isNoPerson, openCutouts, resetCutouts, retryCutout, syncCutouts } from "../cutoutRenders";

const disk = (jest.requireMock("@/src/projects/expoFs") as { __files: Set<string> }).__files;
const native = (jest.requireMock("@/modules/clipy-video") as { __cut: { listener: null | ((e: { jobId: string; progress: number }) => void) } }).__cut;
const render = jest.mocked(renderCutout);
const MEDIA = "file:///doc/projects/p1/media";
const DIR = "file:///doc/projects/p1/cutout";
const clip = makeClip({ id: "a", sourceDuration: 30, sourceUri: `${MEDIA}/abc.mov`, trimStart: 4.2, trimEnd: 9.7, cutout: true });
const photo = makePhotoClip({ id: "ph", sourceUri: `${MEDIA}/p.jpg`, cutout: true });
const NAME = "abc-c1-3000-11000.mov", PNG = "p-c1-photo.png";
const files = () => useCutoutFiles.getState().files;
const st = () => useEditorStore.getState();
const tick = async (n = 12) => { for (let i = 0; i < n; i++) await Promise.resolve(); };
const made = (name: string) => ({ fileUri: `${DIR}/${name}`, seconds: 11, frames: 240, person: 0.3 });

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(isCutoutAvailable).mockReturnValue(true);
  let n = 0;
  jest.mocked(newId).mockImplementation(() => `job-${++n}`);
  disk.clear();
  resetCutouts();
  useToast.getState().clear();
  st().reset();
});

test("the store's helpers: ready and busy copies are known; a clip shows its copy only once it is ready", () => {
  expect(cutoutDir("p1")).toBe(DIR);
  expect(knownCopies({ a: { status: "ready", uri: "u" }, b: { status: "busy", progress: 0.2 }, c: { status: "failed", message: "x" } })).toEqual(["a", "b"]);
  expect(cutoutFileOf({}, clip)).toBeUndefined();
  expect(shownCutout({ [NAME]: { status: "busy", progress: 0.5 } }, clip)).toBeNull();
  expect(shownCutout({ [NAME]: { status: "ready", uri: `${DIR}/${NAME}` } }, clip)).toBe(`${DIR}/${NAME}`);
  expect(shownCutout({ "abc-c1-0-30000.mov": { status: "ready", uri: `${DIR}/abc-c1-0-30000.mov` } }, clip)).toBe(`${DIR}/abc-c1-0-30000.mov`);   // a larger copy covers it
  expect(shownCutout({ [NAME]: { status: "ready", uri: "u" } }, { ...clip, cutout: undefined })).toBeNull();                                         // the switch is off
  expect(shownCutout({ [NAME]: { status: "ready", uri: "u" } }, { ...clip, reversed: true })).toBeNull();
  expect(isNoPerson("cutout person: no person found")).toBe(true);
  expect(isNoPerson("cutout writer: x")).toBe(false);
});

test("ensureCutout: a copy on disk is returned without the phone; a missing one is rendered with the numbers of the model", async () => {
  disk.add(`${DIR}/${NAME}`);
  await expect(ensureCutout("p1", cutoutNeed(clip, []))).resolves.toBe(`${DIR}/${NAME}`);
  expect(render).not.toHaveBeenCalled();
  disk.clear();
  render.mockResolvedValueOnce(made(NAME));
  await expect(ensureCutout("p1", cutoutNeed(clip, []))).resolves.toBe(`${DIR}/${NAME}`);
  expect(render).toHaveBeenCalledWith({ jobId: "job-2", sourceUri: `${MEDIA}/abc.mov`, outputPath: `${DIR}/${NAME}`, kind: "video", from: 3, to: 11,
    maxSide: 1920, minFrameGap: 0.03, minPerson: 0.005, alphaQuality: 0.75, bitsPerPixel: 0.1, stillPath: "", stillSeconds: 0 });
});

test("ensureCutout for a photo: both files must be there, and the request names the still movie", async () => {
  disk.add(`${DIR}/${PNG}`);                                        // the PNG alone is not a finished copy
  render.mockResolvedValueOnce(made(PNG));
  await ensureCutout("p1", cutoutNeed(photo, []));
  expect(render).toHaveBeenCalledWith(expect.objectContaining({ kind: "photo", outputPath: `${DIR}/${PNG}`, stillPath: `${DIR}/p-c1-photo.mov`, stillSeconds: 60, maxSide: 2560, from: 0, to: 0 }));
  disk.add(`${DIR}/p-c1-photo.mov`);
  render.mockClear();
  await ensureCutout("p1", cutoutNeed(photo, []));
  expect(render).not.toHaveBeenCalled();
});

test("ensureCutout: two callers share one render; without the tool it says the build sentence; a failure carries the native message", async () => {
  let finish: (v: ReturnType<typeof made>) => void = () => {};
  render.mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
  const seen: number[] = [];
  const one = ensureCutout("p1", cutoutNeed(clip, []), (f) => seen.push(f));
  const two = ensureCutout("p1", cutoutNeed(clip, []));
  await tick();
  expect(render).toHaveBeenCalledTimes(1);
  native.listener?.({ jobId: "job-1", progress: 0.4 });
  finish(made(NAME));
  await expect(Promise.all([one, two])).resolves.toEqual([`${DIR}/${NAME}`, `${DIR}/${NAME}`]);
  expect(seen).toEqual([0.4]);
  jest.mocked(isCutoutAvailable).mockReturnValue(false);
  await expect(ensureCutout("p1", cutoutNeed(clip, []))).rejects.toThrow(BEATS_BACKGROUND_TOOLS);
  jest.mocked(isCutoutAvailable).mockReturnValue(true);
  render.mockRejectedValueOnce(new Error("cutout writer: boom"));
  await expect(ensureCutout("p1", cutoutNeed(clip, []))).rejects.toThrow("cutout writer: boom");
});

describe("the queue", () => {
  beforeEach(() => { jest.useFakeTimers(); });
  afterEach(() => { jest.useRealTimers(); });
  const openProject = async (clips = [clip]) => {
    st().setProject(makeProject({ clips }));
    await openCutouts("p1");
  };
  const needed = () => neededCutouts(st().project!, [], knownCopies(files()));

  test("nothing is rendered until the project has stood still; then one at a time, with progress, then ready", async () => {
    await openProject([clip, photo]);
    let finish: (v: ReturnType<typeof made>) => void = () => {};
    render.mockReturnValueOnce(new Promise((resolve) => { finish = resolve; })).mockResolvedValueOnce(made(PNG));
    syncCutouts("p1", needed());
    jest.advanceTimersByTime(CUTOUT_SETTLE_MS - 1);
    await tick();
    expect(render).not.toHaveBeenCalled();
    syncCutouts("p1", needed());                                    // the project moved again: the wait starts over
    jest.advanceTimersByTime(CUTOUT_SETTLE_MS - 1);
    await tick();
    expect(render).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    await tick();
    expect(render).toHaveBeenCalledTimes(1);
    expect(files()[NAME]).toEqual({ status: "busy", progress: 0 });
    native.listener?.({ jobId: "job-1", progress: 0.5 });
    expect(files()[NAME]).toEqual({ status: "busy", progress: 0.5 });
    finish(made(NAME));
    await tick(12);
    expect(files()[NAME]).toEqual({ status: "ready", uri: `${DIR}/${NAME}` });
    expect(render).toHaveBeenCalledTimes(2);                        // then the photo
    await tick(12);
    expect(files()[PNG]).toEqual({ status: "ready", uri: `${DIR}/${PNG}` });
  });

  test("a copy nobody needs any more is cancelled at once; the grace ends the wait when the phone does not answer", async () => {
    await openProject();
    render.mockReturnValueOnce(new Promise(() => {}));
    syncCutouts("p1", needed());
    jest.advanceTimersByTime(CUTOUT_SETTLE_MS);
    await tick();
    expect(files()[NAME]?.status).toBe("busy");
    syncCutouts("p1", []);                                          // the switch went off
    expect(cancelCutout).toHaveBeenCalledWith("job-1");
    jest.advanceTimersByTime(CUTOUT_CANCEL_GRACE_MS);
    await tick(12);
    expect(NAME in files()).toBe(false);
  });

  test("a failure is said once and stays failed until it is retried; no person has its own sentence", async () => {
    await openProject();
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    try {
      render.mockRejectedValueOnce(new Error("cutout person: no person found"));
      syncCutouts("p1", needed());
      jest.advanceTimersByTime(CUTOUT_SETTLE_MS);
      await tick(12);
      expect(files()[NAME]).toEqual({ status: "failed", message: "cutout person: no person found" });
      expect(useToast.getState().message).toBe(CUTOUT_NO_PERSON);
      syncCutouts("p1", needed());
      jest.advanceTimersByTime(CUTOUT_SETTLE_MS);
      await tick(12);
      expect(render).toHaveBeenCalledTimes(1);                      // not tried again by itself
      render.mockRejectedValueOnce(new Error("cutout writer: boom"));
      retryCutout(NAME);
      jest.advanceTimersByTime(CUTOUT_SETTLE_MS);
      await tick(12);
      expect(render).toHaveBeenCalledTimes(2);
      expect(useToast.getState().message).toBe(CUTOUT_FAILED);
    } finally { warn.mockRestore(); }
  });

  test("opening a project: copies on disk are ready at once, part files and copies no clip needs are removed, another project's files are left", async () => {
    for (const name of [NAME, "abc-c1-0-2000.mov", "part-abc-c1-5000-9000.mov", PNG, "p-c1-photo.mov", "zzz-c1-photo.png", "zzz-c1-photo.mov"]) disk.add(`${DIR}/${name}`);
    await openProject([clip, photo]);
    expect(files()).toEqual({ [NAME]: { status: "ready", uri: `${DIR}/${NAME}` }, [PNG]: { status: "ready", uri: `${DIR}/${PNG}` } });
    expect([...disk].sort()).toEqual([`${DIR}/${NAME}`, `${DIR}/${PNG}`, `${DIR}/p-c1-photo.mov`].sort());
    syncCutouts("p1", needed());
    jest.advanceTimersByTime(CUTOUT_SETTLE_MS);
    await tick(12);
    expect(render).not.toHaveBeenCalled();
  });

  test("leaving the editor cancels what runs and forgets everything", async () => {
    await openProject();
    render.mockReturnValueOnce(new Promise(() => {}));
    syncCutouts("p1", needed());
    jest.advanceTimersByTime(CUTOUT_SETTLE_MS);
    await tick();
    resetCutouts();
    expect(cancelCutout).toHaveBeenCalledWith("job-1");
    expect(files()).toEqual({});
  });

  test("switching the switch on and off writes only the project; the queue never writes it", async () => {
    await openProject([{ ...clip, cutout: undefined }]);
    const before = st().project!;
    render.mockResolvedValueOnce(made(NAME));
    st().apply((p) => setClipCutout(p, "a", true));
    const on = st().project!;
    syncCutouts("p1", needed());
    jest.advanceTimersByTime(CUTOUT_SETTLE_MS);
    await tick(12);
    expect(st().project).toBe(on);
    expect(before.clips[0].cutout).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run** `npx.cmd jest src/editor/__tests__/cutoutRenders.test.ts` → FAIL (modules missing).
- [ ] **Step 3: Implement.**

Create `src/editor/cutoutFiles.ts`:

```ts
import { create } from "zustand";
import { cutoutNeed, cutoutRefusal } from "./model/cutout";
import { activeCutout, type Clip } from "./model/types";

/** What is known of one cut-out copy, by its file name (`cutoutFileName`). Nothing known = no entry. */
export type CutoutFile = { status: "ready"; uri: string } | { status: "busy"; progress: number } | { status: "failed"; message: string };

/** The cut-out copies of the open project (transient: not saved, not undoable). Written only by cutoutRenders.ts. */
export const useCutoutFiles = create<{ files: Record<string, CutoutFile> }>(() => ({ files: {} }));

/** The copies that exist or are being rendered: what a clip may be served from (`coveringCopy`). A failed one is not among them. */
export function knownCopies(files: Record<string, CutoutFile>): string[] {
  return Object.keys(files).filter((name) => files[name].status !== "failed");
}
/** What is known of the copy a clip uses: undefined for a clip whose switch is off or that cannot be served, and for a copy nobody has asked for yet. */
export function cutoutFileOf(files: Record<string, CutoutFile>, clip: Clip): CutoutFile | undefined {
  if (!activeCutout(clip) || cutoutRefusal(clip) !== null) return undefined;
  return files[cutoutNeed(clip, knownCopies(files)).name];
}
/** The file the preview shows instead of the clip's own: its cut-out copy once that is ready, else null (the clip shows as it is). */
export function shownCutout(files: Record<string, CutoutFile>, clip: Clip): string | null {
  const entry = cutoutFileOf(files, clip);
  return entry !== undefined && entry.status === "ready" ? entry.uri : null;
}
```

Create `src/editor/cutoutRenders.ts`:

```ts
import { useEffect } from "react";
import { addCutoutListener, cancelCutout, CUTOUT_CANCELLED, isCutoutAvailable, isCutoutCancelled, renderCutout, type CutoutRequest } from "@/modules/clipy-video";
import { CUTOUT, cutoutDeadlineMs, cutoutStillName, neededCutouts, parseCutoutName, type NeededCutout } from "@/src/editor/model/cutout";
import { BEATS_BACKGROUND_TOOLS } from "@/src/lib/buildInfo";
import { newId } from "@/src/lib/id";
import { storage } from "@/src/projects";
import { expoFs } from "@/src/projects/expoFs";
import { useToast } from "@/src/ui/Toast";
import { knownCopies, useCutoutFiles, type CutoutFile } from "./cutoutFiles";
import { useEditorStore } from "./store";

/** Said once when a copy could not be rendered. The switch stays on; the clip shows as it was. */
export const CUTOUT_FAILED = "Could not remove the background. The clip shows as it was.";
/** Said instead when the phone found no person in the picture. */
export const CUTOUT_NO_PERSON = "No person was found in that clip. It shows as it was.";
/** Whether a failed render's message says that no person was found. */
export const isNoPerson = (message: string): boolean => message.includes("cutout person:");
/** Where a project's cut-out copies live. Deleted with the project; swept when it is opened. */
export const cutoutDir = (projectId: string): string => `${storage.projectDir(projectId)}/cutout`;
/** How long a render that was told to stop is given to say so (as for sounds): the queue never stands still behind it. */
export const CUTOUT_CANCEL_GRACE_MS = 4000;
/** How long what the project needs must stay the same before a render starts: a trim drag changes it on every frame. */
export const CUTOUT_SETTLE_MS = 800;

type Running = { jobId: string; promise: Promise<string>; listeners: Set<(fraction: number) => void>; cancelled: boolean; giveUp: (() => void) | null };
/** The renders that have not answered yet, by output path: a second caller for the same copy shares the first one's render. */
const inflight = new Map<string, Running>();
let listening = false;
function listen(): void {
  if (listening) return;
  listening = true;
  addCutoutListener((e) => { for (const r of inflight.values()) if (r.jobId === e.jobId) r.listeners.forEach((cb) => cb(e.progress)); });
}
function stopNative(jobId: string): void {
  try { cancelCutout(jobId); } catch (e) { console.warn("cutout cancel failed", e); }
}
function cancel(r: Running): void {
  r.cancelled = true;
  stopNative(r.jobId);
  r.giveUp?.();
}
const cancelledError = (): Error => Object.assign(new Error("Cutout cancelled"), { code: CUTOUT_CANCELLED });

/** Waits for one native render, but never for ever: the answer, or the grace after a cancel (as cancelled), or the deadline (as failed; the phone is told to stop). */
function answered(entry: Running, start: () => Promise<unknown>, deadlineMs: number): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let open = true;
    let grace: ReturnType<typeof setTimeout> | null = null;
    const settle = (end: () => void): void => {
      if (!open) return;
      open = false;
      clearTimeout(deadline);
      if (grace !== null) clearTimeout(grace);
      entry.giveUp = null;
      end();
    };
    const deadline = setTimeout(() => settle(() => {
      stopNative(entry.jobId);
      reject(new Error(`cutout render: no answer after ${Math.round(deadlineMs / 1000)} s`));
    }), deadlineMs);
    entry.giveUp = () => { if (grace === null) grace = setTimeout(() => settle(() => reject(cancelledError())), CUTOUT_CANCEL_GRACE_MS); };
    let native: Promise<unknown>;
    try { native = start(); } catch (e) { settle(() => reject(e)); return; }
    native.then(() => settle(resolve), (e: unknown) => settle(() => reject(e)));
  });
}

const requestFor = (need: NeededCutout, jobId: string, dir: string): CutoutRequest => ({
  jobId, sourceUri: need.sourceUri, outputPath: `${dir}/${need.name}`, kind: need.photo ? "photo" : "video", from: need.from, to: need.to,
  maxSide: need.photo ? CUTOUT.photoMaxSide : CUTOUT.videoMaxSide, minFrameGap: CUTOUT.minFrameGap, minPerson: CUTOUT.minPerson,
  alphaQuality: CUTOUT.alphaQuality, bitsPerPixel: CUTOUT.bitsPerPixel,
  stillPath: need.photo ? `${dir}/${cutoutStillName(need.name)}` : "", stillSeconds: need.photo ? CUTOUT.stillSeconds : 0,
});
/** A finished copy is on disk: a video's file; a photo's PNG AND its still movie. */
async function onDisk(dir: string, need: NeededCutout): Promise<boolean> {
  if (!(await expoFs.exists(`${dir}/${need.name}`))) return false;
  return !need.photo || expoFs.exists(`${dir}/${cutoutStillName(need.name)}`);
}

/**
 * The cut-out copy `need` names: its uri once it exists — found on disk, or rendered now (one render per copy however many ask).
 * Rejects with BEATS_BACKGROUND_TOOLS without the tool, with the native staged message when the render fails or does not answer in
 * time, and with the cancel code when it was cancelled. It always settles. Used by the editor (`syncCutouts`) and by the export.
 */
export function ensureCutout(projectId: string, need: NeededCutout, onProgress?: (fraction: number) => void): Promise<string> {
  const dir = cutoutDir(projectId);
  const path = `${dir}/${need.name}`;
  const running = inflight.get(path);
  if (running) {
    if (onProgress) running.listeners.add(onProgress);
    return running.promise;
  }
  const entry: Running = { jobId: newId(), promise: Promise.resolve(path), listeners: new Set(onProgress ? [onProgress] : []), cancelled: false, giveUp: null };
  const work = async (): Promise<string> => {
    if (await onDisk(dir, need)) return path;
    if (!isCutoutAvailable()) throw new Error(BEATS_BACKGROUND_TOOLS);
    listen();
    await expoFs.mkdir(dir);
    if (entry.cancelled) throw cancelledError();
    await answered(entry, () => renderCutout(requestFor(need, entry.jobId, dir)), cutoutDeadlineMs(need));
    return path;
  };
  entry.promise = work().finally(() => { inflight.delete(path); });
  inflight.set(path, entry);
  return entry.promise;
}

const setFile = (name: string, file: CutoutFile | null): void => useCutoutFiles.setState((s) => {
  const files = { ...s.files };
  if (file) files[name] = file; else delete files[name];
  return { files };
});

/** What the open project needs now (the newest call wins), whether its folder has been read, and whether the one-at-a-time loop runs. */
let wanted: { projectId: string; needed: NeededCutout[] } | null = null;
let opened: string | null = null;
let pumping = false;
let settle: ReturnType<typeof setTimeout> | null = null;
/** A failure has been said since the editor last told what it needs: an engine that fails every copy is said once. */
let toldFailure = false;

async function pump(): Promise<void> {
  if (pumping) return;
  pumping = true;
  try {
    for (;;) {
      const w = wanted;
      if (!w || opened !== w.projectId) return;
      const { files } = useCutoutFiles.getState();
      const next = w.needed.find((n) => files[n.name] === undefined);
      if (!next) return;
      setFile(next.name, { status: "busy", progress: 0 });
      /** The answer belongs to the project that asked: another project (or none) is open by now → drop it. */
      const stillOpen = (): boolean => wanted !== null && wanted.projectId === w.projectId;
      try {
        const uri = await ensureCutout(w.projectId, next, (fraction) => {
          if (stillOpen() && useCutoutFiles.getState().files[next.name]?.status === "busy") setFile(next.name, { status: "busy", progress: fraction });
        });
        if (stillOpen()) setFile(next.name, { status: "ready", uri });
      } catch (e) {
        if (!stillOpen()) continue;
        if (isCutoutCancelled(e)) { setFile(next.name, null); continue; }   // nobody needed it any more; if someone does again, it is rendered again
        const message = e instanceof Error ? e.message : String(e);
        console.warn("cutout render failed", message);
        setFile(next.name, { status: "failed", message });
        if (!toldFailure) useToast.getState().show(isNoPerson(message) ? CUTOUT_NO_PERSON : CUTOUT_FAILED);
        toldFailure = true;
      }
    }
  } finally { pumping = false; }
}
/** Starts the loop once what is needed has stood still for CUTOUT_SETTLE_MS. */
function kick(): void {
  if (settle !== null) clearTimeout(settle);
  settle = setTimeout(() => { settle = null; void pump(); }, CUTOUT_SETTLE_MS);
}

/**
 * The editor says what the open project needs: a running render of a copy nobody needs any more is cancelled at once, and whatever
 * is needed and not known yet is rendered, one at a time, once the project has stood still. Never touches the project.
 */
export function syncCutouts(projectId: string, needed: NeededCutout[]): void {
  wanted = { projectId, needed };
  toldFailure = false;
  const dir = cutoutDir(projectId);
  const keep = new Set(needed.map((n) => `${dir}/${n.name}`));
  for (const [path, r] of inflight) if (!keep.has(path)) cancel(r);
  kick();
}

/** The owner asks again for a copy that failed (the switch, off and on): it is forgotten, so the queue tries it once more. */
export function retryCutout(name: string): void {
  if (useCutoutFiles.getState().files[name]?.status !== "failed") return;
  setFile(name, null);
  toldFailure = false;
  kick();
}

/** The editor is left (or another project opens): every running render is cancelled and nothing is remembered. */
export function resetCutouts(): void {
  wanted = null;
  opened = null;
  toldFailure = false;
  if (settle !== null) { clearTimeout(settle); settle = null; }
  for (const r of inflight.values()) cancel(r);
  if (Object.keys(useCutoutFiles.getState().files).length > 0) useCutoutFiles.setState({ files: {} });
}

/**
 * A project is opened: the finished copies in its folder are known as ready, then the files no clip needs are removed — asked of
 * the OPEN project, with every copy on disk counted as known, so a clip keeps the copy that covers it; a `part-` file always goes;
 * a photo's still movie is judged by its PNG. Run once per open (there is no undo history then). Only then may renders start.
 * Without the tool (Expo Go, an older build) nothing is read and nothing is removed.
 */
export async function openCutouts(projectId: string): Promise<void> {
  if (!isCutoutAvailable()) { opened = projectId; return; }
  const dir = cutoutDir(projectId);
  const isOpen = (): boolean => { const s = useEditorStore.getState(); return !!s.project && s.project.id === projectId; };
  try {
    const names = await expoFs.list(dir);
    if (!isOpen()) return;
    const copies = names.filter((n) => { const p = parseCutoutName(n); return p !== null && (!p.photo || names.includes(cutoutStillName(n))); });
    const state = useEditorStore.getState();
    const needed = state.project ? neededCutouts(state.project, [], copies).map((n) => n.name) : copies;
    for (const name of names) {
      const judged = name.endsWith("-photo.mov") ? name.replace(/\.mov$/, ".png") : name;
      if (needed.includes(judged) && copies.includes(judged)) continue;
      if (!isOpen()) return;
      await expoFs.remove(`${dir}/${name}`);
    }
    if (!isOpen()) return;
    for (const name of copies) if (needed.includes(name) && useCutoutFiles.getState().files[name] === undefined) setFile(name, { status: "ready", uri: `${dir}/${name}` });
  } catch (e) { console.warn("cutout open failed", e); }
  if (isOpen()) { opened = projectId; kick(); }
}

/**
 * Mount once in the editor: keeps the open project's cut-out copies rendered. It reads only WHICH copies are needed (their names),
 * so an edit that changes no clip's switch, file or covered range does nothing here. Sets no React state and never writes the project.
 */
export function useCutoutRenders(): void {
  const projectId = useEditorStore((s) => s.project?.id ?? null);
  const known = useCutoutFiles((s) => knownCopies(s.files).join("|"));
  const names = useEditorStore((s) => (s.project ? neededCutouts(s.project, s.missingSourceUris, knownCopies(useCutoutFiles.getState().files)).map((n) => n.name).join("|") : ""));
  useEffect(() => {
    resetCutouts();
    if (projectId) void openCutouts(projectId);
    return resetCutouts;
  }, [projectId]);
  useEffect(() => {
    const s = useEditorStore.getState();
    if (!projectId || !s.project || !isCutoutAvailable()) return;
    syncCutouts(projectId, neededCutouts(s.project, s.missingSourceUris, knownCopies(useCutoutFiles.getState().files)));
  }, [projectId, names, known]);
}
```

`app/editor/[id]/index.tsx`: add `import { useCutoutRenders } from "@/src/editor/cutoutRenders";` beside the import of `useSoundRenders`, and the line `useCutoutRenders();` directly after `useSoundRenders();`. If a test of that screen replaces `@/src/editor/soundRenders` with a mock, give it `jest.mock("@/src/editor/cutoutRenders", () => ({ useCutoutRenders: jest.fn() }));` beside it (name the file in the commit message).

- [ ] **Step 4: Run** `npx.cmd jest src/editor/__tests__/cutoutRenders.test.ts src/editor/__tests__/soundRenders.test.ts` → PASS. Then `npm run typecheck` and `npm test`.
- [ ] **Step 5: Commit** — `feat(editor): cut-out copies — one render at a time once the project stands still, known copies, the sweep on open`.

---

### Task 12: Swift: `CutoutRender.swift`, the module functions

**Depends on:** Task 7 (both edit `ClipyVideoModule.swift`), Task 4 (the shapes). **Parallel-safe with:** 6, 8.

**Files:** Create `modules/clipy-video/ios/CutoutRender.swift`, `src/editor/model/__tests__/cutoutRender.swift.test.ts`. Modify `modules/clipy-video/ios/ClipyVideoModule.swift` (the event list and additions), `src/editor/model/__tests__/soundRender.swift.test.ts` (the one pinned event list).

**Do not touch:** every other Swift file (`ExportSession.swift`, `ClipyCompositor.swift` and `MediaPrePass.swift` are read, never edited), `index.ts`, the podspec (Vision, Core Image, VideoToolbox, ImageIO and UniformTypeIdentifiers are system frameworks that Swift links by `import`; if the build says otherwise that is Task 13's finding).

**Interfaces: Consumes** `ExportSession.describe`, `ExportSession.fileURL(from:)`, `ExportSession.time(_:)`, `ExportSession.ciOrientTransform(preferredTransform:naturalSize:)`; the shapes of Task 4. **Produces** the native functions `renderCutout`, `cancelCutout` and the event `onCutoutEvent`.

- [ ] **Step 1: Failing tests.** Create `src/editor/model/__tests__/cutoutRender.swift.test.ts`:

```ts
import { readFileSync } from "fs";
import { join } from "path";

// There is no Swift compiler on this machine: these tests READ the Swift and pin what the app relies on.
const root = join(__dirname, "../../../..");
const iosDir = join(root, "modules/clipy-video/ios");
const read = (file: string) => readFileSync(join(iosDir, file), "utf8").replace(/\r\n/g, "\n");
const code = (source: string) => source.replace(/\/\/[^\n]*/g, "");
const swift = code(read("CutoutRender.swift"));
const moduleSwift = code(read("ClipyVideoModule.swift"));
const wrapper = readFileSync(join(root, "modules/clipy-video/index.ts"), "utf8");
const between = (source: string, from: string, to: string): string => {
  const start = source.indexOf(from);
  if (start < 0) throw new Error(`"${from}" not found`);
  const end = source.indexOf(to, start + from.length);
  return source.slice(start, end < 0 ? undefined : end);
};
const video = between(swift, "static func renderVideo(", "\n  }\n");
const photo = between(swift, "static func renderPhoto(", "\n  }\n");

test("the request record has exactly the fields the app sends", () => {
  const fields = [...between(swift, "struct CutoutRequest: Record {", "\n}").matchAll(/@Field var (\w+)/g)].map((m) => m[1]);
  const sent = [...between(wrapper, "export interface CutoutRequest {", "\n}").matchAll(/(\w+): /g)].map((m) => m[1]);
  expect(fields.sort()).toEqual([...new Set(sent)].sort());
  expect(fields.sort()).toEqual(["alphaQuality", "bitsPerPixel", "from", "jobId", "kind", "maxSide", "minFrameGap", "minPerson", "outputPath", "sourceUri", "stillPath", "stillSeconds", "to"]);
  expect(wrapper).toContain("export interface CutoutResult { fileUri: string; seconds: number; frames: number; person: number }");
  expect(swift.split('let answer: [String: Any] = ["fileUri": outputURL.absoluteString, "seconds":').length - 1).toBe(2);   // the video's and the photo's
});

test("the asset lives in the source for as long as its tracks and its reader are used", () => {
  const source = between(swift, "final class CutoutSource", "\n}\n");
  expect(source).toContain("let asset: AVURLAsset");
  expect(source).toContain("let video: AVAssetTrack");
  expect(source).toContain("try await asset.loadTracks(withMediaType: .video)");
  expect(source).toContain("try await video.load(.preferredTransform, .naturalSize)");
  expect(source).toContain("try await asset.load(.duration)");
  expect(video).toContain("source: CutoutSource");
  expect(video).toContain("AVAssetReader(asset: source.asset)");
});

test("the copy is HEVC with alpha in a QuickTime file, only with settings the writer says it can apply", () => {
  const settings = between(swift, "static func videoSettings(", "\n  }\n");
  expect(settings).toContain("AVVideoCodecKey: AVVideoCodecType.hevcWithAlpha");
  expect(settings).toContain("kVTCompressionPropertyKey_TargetQualityForAlpha as String");
  expect(settings).toContain("writer.canApply(outputSettings: settings, forMediaType: .video)");
  expect(settings.indexOf("writer.canApply(")).toBeLessThan(settings.indexOf("return settings"));
  const make = between(swift, "static func makeWriter(", "\n  }\n");
  expect(make).toContain("AVAssetWriter(outputURL: url, fileType: .mov)");
  expect(make).toContain("kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA");
  expect(make).toContain("writer.canAdd(input)");
  expect(swift).not.toContain("AlphaChannelMode");                 // the default (premultiplied) is what Core Image writes
});

test("the copy keeps the source's timing: the session starts at zero and frames are appended at their own times", () => {
  expect(video).toContain("writer.startSession(atSourceTime: .zero)");
  expect(video).toContain("reader.timeRange = range");
  expect(video).toContain("withPresentationTime: pts");
  expect(video).toContain("at - lastKept >= gap");
  expect(video).not.toContain("endSession(");
});

test("people are found with Vision's person segmentation, one sequence handler for the whole clip, a one-channel mask", () => {
  expect(video).toContain("let segmentation = VNGeneratePersonSegmentationRequest()");
  expect(video).toContain("segmentation.qualityLevel = .balanced");
  expect(video).toContain("segmentation.outputPixelFormat = kCVPixelFormatType_OneComponent8");
  expect(video.split("VNSequenceRequestHandler()").length - 1).toBe(1);
  expect(photo).toContain("segmentation.qualityLevel = .accurate");
  expect(photo).toContain("VNImageRequestHandler(cgImage: image, options: [:])");
  const cut = between(swift, "static func cut(", "\n  }\n");
  expect(cut).toContain('"CIBlendWithMask"');
  expect(cut).toContain("CIImage(color: CIColor.clear)");
  const coverage = between(swift, "static func coverage(", "\n  }\n");
  expect(coverage).toContain("CVPixelBufferGetPixelFormatType(mask) == kCVPixelFormatType_OneComponent8");
});

test("the sound is copied as stored, and a sound that cannot be copied fails the render", () => {
  expect(video).toContain("AVAssetReaderTrackOutput(track: audio, outputSettings: nil)");
  expect(video).toContain("AVAssetWriterInput(mediaType: .audio, outputSettings: nil, sourceFormatHint: source.audioHint)");
  expect(video.split("cutout sound: this clip's sound cannot be copied").length - 1).toBe(2);
});

test("the loop is cancellable, never waits for one input alone, and no await sits inside an autoreleasepool", () => {
  expect(video).toContain("if job.isCancelled { throw CutoutError.cancelled }");
  expect(video).toContain("pictureInput.isReadyForMoreMediaData");
  expect(video).toContain("soundInput.isReadyForMoreMediaData");
  expect(video).toContain("try await Task.sleep(nanoseconds: 2_000_000)");
  expect(video).toContain("await writer.finishWriting()");
  const pools = swift.split("autoreleasepool {").slice(1);
  expect(pools).toHaveLength(1);
  for (const pool of pools) {
    const close = pool.indexOf("\n              }\n");                 // the closure's own closing brace (14 spaces)
    expect(close).toBeGreaterThan(0);
    expect(pool.slice(0, close)).not.toContain("await ");
  }
});

test("a part file is written and moved; every way out that is not success removes it", () => {
  expect(swift).toContain('appendingPathComponent("part-" + url.lastPathComponent)');
  const place = between(swift, "static func place(", "\n  }\n");
  expect(place).toContain("moveItem(at: partURL, to: outputURL)");
  expect(video).toContain("try place(partURL, at: outputURL)");
  expect(video).toContain("try? FileManager.default.removeItem(at: partURL)");
  expect(video).toContain("if writer.status == .writing { writer.cancelWriting() }");
  expect(photo.indexOf("try place(stillPart, at: stillURL)")).toBeLessThan(photo.indexOf("try place(pngPart, at: outputURL)"));   // the PNG last: its presence means ready
});

test("no person: measured on the mask, refused with its own stage", () => {
  expect(video).toContain("kept % CutoutRender.personEvery == 0");
  expect(video).toContain('throw CutoutError.failed("cutout person: no person found")');
  expect(photo).toContain('throw CutoutError.failed("cutout person: no person found")');
  expect(swift).toContain("static let personEvery = 15");
});

test("every failure has a cutout stage; a cancel has its own code; the promise is answered once", () => {
  const thrown = [...swift.matchAll(/CutoutError\.failed\("([^"]*)/g)].map((m) => m[1]);
  expect(thrown.length).toBeGreaterThanOrEqual(15);
  for (const text of thrown) expect(text).toMatch(/^cutout (output|source|reader|writer|sound|people|render|person): /);
  const fn = between(moduleSwift, 'AsyncFunction("renderCutout")', "\n    }\n");
  expect(fn).toContain("self.storeCutoutJob(jobId, job)");
  expect(fn).toContain("defer { self?.dropCutoutJob(jobId) }");
  expect(fn.split("promise.resolve(").length - 1).toBe(1);
  expect(fn).toContain('promise.reject("E_CUTOUT_CANCELLED", "Cutout cancelled")');
  expect(fn).toContain('promise.reject("E_CUTOUT", CutoutRender.message(error))');
  expect(fn).toContain('self?.sendEvent("onCutoutEvent", ["jobId": jobId, "progress": fraction])');
  expect(moduleSwift).toContain('Events("onExportEvent", "onSoundEvent", "onCutoutEvent")');
  expect(moduleSwift).toContain('Function("cancelCutout")');
  expect(wrapper).toContain('export const CUTOUT_CANCELLED = "E_CUTOUT_CANCELLED";');
  expect(wrapper).toContain('addListener("onCutoutEvent", cb)');
});

test("no force unwrap, no try!, no as!; no type and no static name declared twice; nothing clashes; the export's Swift is not touched", () => {
  expect(swift).not.toMatch(/[\w)\]]!(?!=)/);
  expect(swift).not.toMatch(/\b(try|as)!/);
  const types = [...swift.matchAll(/^(?:final class|struct|enum) (\w+)/gm)].map((m) => m[1]);
  expect(types.sort()).toEqual(["CutoutError", "CutoutJob", "CutoutRender", "CutoutRequest", "CutoutSource"]);
  const others = ["ExportSession.swift", "ClipyVideoModule.swift", "MediaPrePass.swift", "Transcriber.swift", "AudioMix.swift", "SoundMath.swift", "SoundRender.swift", "SpeechRender.swift", "ClipyCompositor.swift", "BeatEnvelope.swift"].map((f) => code(read(f))).join("\n");
  for (const t of types) expect(others).not.toMatch(new RegExp(`(?:class|struct|enum) ${t}\\b`));
  const body = between(swift, "enum CutoutRender {", "\n}\n");
  const values = [...body.matchAll(/static (?:let|var) (\w+)/g)].map((m) => m[1]);
  const funcs = [...body.matchAll(/static func (\w+)\(/g)].map((m) => m[1]);
  expect(values.filter((n) => funcs.includes(n))).toEqual([]);
  expect(new Set(values).size).toBe(values.length);
  expect(new Set(funcs).size).toBe(funcs.length);
  for (const name of ["exportTimeline", "transcribe", "renderSound", "soundInfo", "probeNoiseReduction", "listVoices", "speakToFile", "beatEnvelope"]) expect(moduleSwift).toContain(`AsyncFunction("${name}")`);
  // The export knows nothing of cut-outs: it is handed another file.
  for (const file of ["ExportSession.swift", "ClipyCompositor.swift", "MediaPrePass.swift"]) expect(read(file)).not.toMatch(/cutout/i);
});
```

In `src/editor/model/__tests__/soundRender.swift.test.ts`, the one line `expect(moduleSwift).toContain('Events("onExportEvent", "onSoundEvent")');` becomes `expect(moduleSwift).toContain('Events("onExportEvent", "onSoundEvent", "onCutoutEvent")');` (the pinned event list of this task).

- [ ] **Step 2: Run** `npx.cmd jest src/editor/model/__tests__/cutoutRender.swift.test.ts` → FAIL (no file).
- [ ] **Step 3: Implement.** Create `modules/clipy-video/ios/CutoutRender.swift`:

```swift
import AVFoundation
import CoreImage
import CoreVideo
import ExpoModulesCore
import ImageIO
import UniformTypeIdentifiers
import VideoToolbox
import Vision

/// One cut-out copy (`CutoutRequest` in modules/clipy-video/index.ts; the numbers are `CUTOUT` in
/// src/editor/model/cutout.ts). Video: the source range `from` … `to` goes to `outputPath`, a .mov with a see-through
/// background, the source's timing and its sound. Photo: `outputPath` is a PNG and `stillPath` a movie of the same
/// picture, `stillSeconds` long.
struct CutoutRequest: Record {
  @Field var jobId: String = ""
  @Field var sourceUri: String = ""
  @Field var outputPath: String = ""
  @Field var kind: String = "video"
  @Field var from: Double = 0
  @Field var to: Double = 0
  @Field var maxSide: Double = 1920
  @Field var minFrameGap: Double = 0.03
  @Field var minPerson: Double = 0.005
  @Field var alphaQuality: Double = 0.75
  @Field var bitsPerPixel: Double = 0.1
  @Field var stillPath: String = ""
  @Field var stillSeconds: Double = 60
}

enum CutoutError: Error, LocalizedError {
  case cancelled
  case failed(String)
  var errorDescription: String? {
    switch self {
    case .cancelled: return "Cutout cancelled"
    case .failed(let text): return text
    }
  }
}

/// A cut-out render while it runs: `cancel()` makes the loop stop at its next pass.
final class CutoutJob: @unchecked Sendable {
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

/// A video file opened for a cut-out. It HOLDS the asset: `AVAssetTrack.asset` is a weak reference, so the tracks
/// and the reader made from them are only usable while this object lives (the module keeps it for the whole render).
final class CutoutSource {
  let asset: AVURLAsset
  let video: AVAssetTrack
  let audio: AVAssetTrack?
  let audioHint: CMFormatDescription?
  let preferredTransform: CGAffineTransform
  let naturalSize: CGSize
  let seconds: Double

  init(asset: AVURLAsset, video: AVAssetTrack, audio: AVAssetTrack?, audioHint: CMFormatDescription?,
       preferredTransform: CGAffineTransform, naturalSize: CGSize, seconds: Double) {
    self.asset = asset
    self.video = video
    self.audio = audio
    self.audioHint = audioHint
    self.preferredTransform = preferredTransform
    self.naturalSize = naturalSize
    self.seconds = seconds
  }

  static func open(_ uri: String) async throws -> CutoutSource {
    guard let url = ExportSession.fileURL(from: uri) else { throw CutoutError.failed("cutout source: not a file path") }
    let asset = AVURLAsset(url: url)
    do {
      guard let video = try await asset.loadTracks(withMediaType: .video).first else {
        throw CutoutError.failed("cutout source: this file has no picture")
      }
      let (preferredTransform, naturalSize) = try await video.load(.preferredTransform, .naturalSize)
      let length = try await asset.load(.duration)
      let audio = try await asset.loadTracks(withMediaType: .audio).first
      var audioHint: CMFormatDescription? = nil
      if let audio {
        audioHint = try await audio.load(.formatDescriptions).first
      }
      return CutoutSource(asset: asset, video: video, audio: audio, audioHint: audioHint,
                          preferredTransform: preferredTransform, naturalSize: naturalSize,
                          seconds: length.seconds.isFinite ? length.seconds : 0)
    } catch let own as CutoutError {
      throw own
    } catch {
      throw CutoutError.failed("cutout source: " + ExportSession.describe(error))
    }
  }
}

/// Remove background, the native part: people found with Vision, cut out with Core Image, written as HEVC with
/// alpha. Nothing here decides a number: sizes, rates and thresholds come in the request.
enum CutoutRender {
  static let context = CIContext(options: [.cacheIntermediates: false])
  /// The mask's coverage is measured on the first kept frame and on every this-many-th after it.
  static let personEvery = 15

  /// What a failure says to the app: a CutoutError's own staged text, anything else described in full.
  static func message(_ error: Error) -> String {
    if let own = error as? CutoutError, let text = own.errorDescription { return text }
    return "cutout render: " + ExportSession.describe(error)
  }

  /// The copy's pixel size for an upright picture: the long side at most `maxSide`, both sides even, at least 2
  /// (`cutoutSize` in src/editor/model/cutout.ts).
  static func evenSize(width: Double, height: Double, maxSide: Double) -> (width: Int, height: Int) {
    let w = width.isFinite && width > 0 ? width : 2
    let h = height.isFinite && height > 0 ? height : 2
    let cap = maxSide.isFinite && maxSide >= 2 ? maxSide : 1920
    let k = min(1, cap / max(w, h))
    func even(_ v: Double) -> Int { max(2, Int((v * k).rounded()) / 2 * 2) }
    return (even(w), even(h))
  }

  /// The file a render writes before it is moved into place.
  static func partURL(for url: URL) -> URL {
    return url.deletingLastPathComponent().appendingPathComponent("part-" + url.lastPathComponent)
  }

  /// Moves a finished part file into place; on failure the part file is removed.
  static func place(_ partURL: URL, at outputURL: URL) throws {
    do {
      try? FileManager.default.removeItem(at: outputURL)
      try FileManager.default.moveItem(at: partURL, to: outputURL)
    } catch {
      try? FileManager.default.removeItem(at: partURL)
      throw CutoutError.failed("cutout output: " + ExportSession.describe(error))
    }
  }

  /// A BGRA pixel buffer Core Image can render into and Vision and the writer can read.
  static func bgraBuffer(width: Int, height: Int) throws -> CVPixelBuffer {
    let attrs: [String: Any] = [
      kCVPixelBufferCGImageCompatibilityKey as String: true,
      kCVPixelBufferCGBitmapContextCompatibilityKey as String: true,
      kCVPixelBufferIOSurfacePropertiesKey as String: [String: Any](),
    ]
    var made: CVPixelBuffer? = nil
    guard CVPixelBufferCreate(kCFAllocatorDefault, width, height, kCVPixelFormatType_32BGRA, attrs as CFDictionary, &made) == kCVReturnSuccess,
          let buffer = made else { throw CutoutError.failed("cutout render: no picture buffer") }
    return buffer
  }

  /// The share of the picture a one-channel 8-bit mask covers (0 … 1), from every fourth pixel of every fourth row.
  /// A mask in another format cannot be read here and counts as covered (the render is not refused for it).
  static func coverage(of mask: CVPixelBuffer) -> Double {
    guard CVPixelBufferGetPixelFormatType(mask) == kCVPixelFormatType_OneComponent8 else { return 1 }
    CVPixelBufferLockBaseAddress(mask, .readOnly)
    defer { CVPixelBufferUnlockBaseAddress(mask, .readOnly) }
    guard let base = CVPixelBufferGetBaseAddress(mask) else { return 1 }
    let width = CVPixelBufferGetWidth(mask)
    let height = CVPixelBufferGetHeight(mask)
    let row = CVPixelBufferGetBytesPerRow(mask)
    let bytes = base.assumingMemoryBound(to: UInt8.self)
    var sum = 0
    var counted = 0
    var y = 0
    while y < height {
      var x = 0
      while x < width {
        sum += Int(bytes[y * row + x])
        counted += 1
        x += 4
      }
      y += 4
    }
    return counted > 0 ? Double(sum) / Double(counted) / 255 : 1
  }

  /// `picture` (filling `rect`) kept where the mask is white and see-through where it is black; the mask is
  /// stretched to the picture's size first.
  static func cut(_ picture: CIImage, mask: CVPixelBuffer, rect: CGRect) -> CIImage {
    let raw = CIImage(cvPixelBuffer: mask)
    guard raw.extent.width > 0, raw.extent.height > 0 else { return picture.cropped(to: rect) }
    let stretched = raw.transformed(by: CGAffineTransform(scaleX: rect.width / raw.extent.width, y: rect.height / raw.extent.height))
    return picture.applyingFilter("CIBlendWithMask", parameters: [
      "inputBackgroundImage": CIImage(color: CIColor.clear).cropped(to: rect),
      "inputMaskImage": stretched,
    ]).cropped(to: rect)
  }

  /// HEVC-with-alpha settings the writer says it can apply: with the see-through layer's quality when it takes that
  /// key, without it otherwise. (Settings a writer cannot apply raise an Objective-C exception when they are used,
  /// which Swift cannot catch: they are asked about first.)
  static func videoSettings(width: Int, height: Int, bitsPerPixel: Double, alphaQuality: Double, writer: AVAssetWriter) throws -> [String: Any] {
    let perPixel = bitsPerPixel.isFinite && bitsPerPixel > 0 ? bitsPerPixel : 0.1
    let bitRate = Int(max(1_000_000, Double(width * height) * 30 * perPixel))
    let quality = alphaQuality.isFinite ? min(1, max(0, alphaQuality)) : 0.75
    let plain: [String: Any] = [AVVideoAverageBitRateKey: bitRate]
    var fine: [String: Any] = plain
    fine[kVTCompressionPropertyKey_TargetQualityForAlpha as String] = quality
    let choices: [[String: Any]] = [fine, plain]
    for compression in choices {
      let settings: [String: Any] = [
        AVVideoCodecKey: AVVideoCodecType.hevcWithAlpha,
        AVVideoWidthKey: width,
        AVVideoHeightKey: height,
        AVVideoCompressionPropertiesKey: compression,
      ]
      if writer.canApply(outputSettings: settings, forMediaType: .video) {
        return settings
      }
    }
    throw CutoutError.failed("cutout writer: this iPhone cannot write video with a see-through background")
  }

  /// A QuickTime writer with one picture input that takes BGRA buffers. Not started.
  static func makeWriter(_ url: URL, width: Int, height: Int, request: CutoutRequest)
    throws -> (AVAssetWriter, AVAssetWriterInput, AVAssetWriterInputPixelBufferAdaptor) {
    try? FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
    try? FileManager.default.removeItem(at: url)
    let writer: AVAssetWriter
    do {
      writer = try AVAssetWriter(outputURL: url, fileType: .mov)
    } catch {
      throw CutoutError.failed("cutout writer: " + ExportSession.describe(error))
    }
    let settings = try videoSettings(width: width, height: height, bitsPerPixel: request.bitsPerPixel, alphaQuality: request.alphaQuality, writer: writer)
    let input = AVAssetWriterInput(mediaType: .video, outputSettings: settings)
    input.expectsMediaDataInRealTime = false
    let attributes: [String: Any] = [
      kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
      kCVPixelBufferWidthKey as String: width,
      kCVPixelBufferHeightKey as String: height,
      kCVPixelBufferIOSurfacePropertiesKey as String: [String: Any](),
    ]
    let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: input, sourcePixelBufferAttributes: attributes)
    guard writer.canAdd(input) else {
      throw CutoutError.failed("cutout writer: this iPhone cannot write video with a see-through background")
    }
    writer.add(input)
    return (writer, input, adaptor)
  }

  /// One frame: made upright at the copy's size, its people found, everything else made see-through, rendered into
  /// a buffer from the writer's pool. Returns that buffer and the mask (for the coverage check).
  static func cutFrame(_ frame: CVPixelBuffer, upright: CGAffineTransform, rect: CGRect, straight: CVPixelBuffer,
                       segmentation: VNGeneratePersonSegmentationRequest, sequence: VNSequenceRequestHandler,
                       pool: CVPixelBufferPool, space: CGColorSpace?) throws -> (picture: CVPixelBuffer, mask: CVPixelBuffer) {
    let placed = CIImage(cvPixelBuffer: frame).transformed(by: upright).cropped(to: rect)
    context.render(placed, to: straight, bounds: rect, colorSpace: space)
    do {
      try sequence.perform([segmentation], on: straight)
    } catch {
      throw CutoutError.failed("cutout people: " + ExportSession.describe(error))
    }
    guard let mask = segmentation.results?.first?.pixelBuffer else { throw CutoutError.failed("cutout people: no mask came back") }
    var made: CVPixelBuffer? = nil
    guard CVPixelBufferPoolCreatePixelBuffer(kCFAllocatorDefault, pool, &made) == kCVReturnSuccess, let out = made else {
      throw CutoutError.failed("cutout writer: no picture buffer")
    }
    let image = cut(CIImage(cvPixelBuffer: straight), mask: mask, rect: rect)
    context.render(image, to: out, bounds: rect, colorSpace: space)
    return (out, mask)
  }

  /// A video's cut-out copy. Frames of the asked range are read, cut and written at their OWN source times into a
  /// session that starts at zero, so the copy has the source's timeline (an empty stretch before its first frame);
  /// a frame closer than `minFrameGap` to the last kept one is left out. The source's sound packets are copied
  /// beside the picture as they are. The loop serves whichever input is ready and sleeps when neither is.
  static func renderVideo(_ request: CutoutRequest, source: CutoutSource, to outputURL: URL, job: CutoutJob,
                          progress: (Double) -> Void) async throws -> [String: Any] {
    let start = max(0, min(request.from.isFinite ? request.from : 0, source.seconds))
    let end = min(source.seconds, request.to.isFinite && request.to > start ? request.to : source.seconds)
    guard end - start > 0 else { throw CutoutError.failed("cutout source: nothing to render") }
    let range = CMTimeRange(start: ExportSession.time(start), end: ExportSession.time(end))

    let shown = source.naturalSize.applying(source.preferredTransform)
    let fullWidth = Double(abs(shown.width))
    let fullHeight = Double(abs(shown.height))
    let size = evenSize(width: fullWidth, height: fullHeight, maxSide: request.maxSide)
    let rect = CGRect(x: 0, y: 0, width: size.width, height: size.height)
    let scale = CGAffineTransform(scaleX: CGFloat(size.width) / CGFloat(max(1, fullWidth)), y: CGFloat(size.height) / CGFloat(max(1, fullHeight)))
    let upright = ExportSession.ciOrientTransform(preferredTransform: source.preferredTransform, naturalSize: source.naturalSize).concatenating(scale)

    let reader: AVAssetReader
    do {
      reader = try AVAssetReader(asset: source.asset)
    } catch {
      throw CutoutError.failed("cutout reader: " + ExportSession.describe(error))
    }
    let pictures = AVAssetReaderTrackOutput(track: source.video, outputSettings: [
      kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange,
    ])
    pictures.alwaysCopiesSampleData = false
    guard reader.canAdd(pictures) else { throw CutoutError.failed("cutout reader: this picture cannot be decoded") }
    reader.add(pictures)
    var sounds: AVAssetReaderTrackOutput? = nil
    if let audio = source.audio {
      let stored = AVAssetReaderTrackOutput(track: audio, outputSettings: nil)
      stored.alwaysCopiesSampleData = false
      guard reader.canAdd(stored) else { throw CutoutError.failed("cutout sound: this clip's sound cannot be copied") }
      reader.add(stored)
      sounds = stored
    }
    reader.timeRange = range

    let partURL = CutoutRender.partURL(for: outputURL)
    let (writer, pictureInput, adaptor) = try makeWriter(partURL, width: size.width, height: size.height, request: request)
    var soundInput: AVAssetWriterInput? = nil
    if sounds != nil {
      let input = AVAssetWriterInput(mediaType: .audio, outputSettings: nil, sourceFormatHint: source.audioHint)
      input.expectsMediaDataInRealTime = false
      guard writer.canAdd(input) else { throw CutoutError.failed("cutout sound: this clip's sound cannot be copied") }
      writer.add(input)
      soundInput = input
    }

    let segmentation = VNGeneratePersonSegmentationRequest()
    segmentation.qualityLevel = .balanced
    segmentation.outputPixelFormat = kCVPixelFormatType_OneComponent8
    let sequence = VNSequenceRequestHandler()
    let straight = try bgraBuffer(width: size.width, height: size.height)
    let space = CGColorSpace(name: CGColorSpace.sRGB)
    let gap = request.minFrameGap.isFinite && request.minFrameGap > 0 ? request.minFrameGap : 0
    let needed = request.minPerson.isFinite ? request.minPerson : 0

    guard reader.startReading() else { throw CutoutError.failed("cutout reader: " + ExportSession.describe(reader.error)) }
    guard writer.startWriting() else {
      reader.cancelReading()
      throw CutoutError.failed("cutout writer: " + ExportSession.describe(writer.error))
    }
    writer.startSession(atSourceTime: .zero)

    var kept = 0
    var lastKept = -Double.infinity
    var person = 0.0
    var picturesDone = false
    var soundsDone = soundInput == nil
    do {
      guard let pool = adaptor.pixelBufferPool else { throw CutoutError.failed("cutout writer: no picture buffer") }
      while !picturesDone || !soundsDone {
        if job.isCancelled { throw CutoutError.cancelled }
        guard writer.status == .writing else { throw CutoutError.failed("cutout writer: " + ExportSession.describe(writer.error)) }
        var worked = false
        if !picturesDone, pictureInput.isReadyForMoreMediaData {
          worked = true
          if let sample = pictures.copyNextSampleBuffer() {
            let pts = CMSampleBufferGetPresentationTimeStamp(sample)
            let at = pts.seconds
            if at.isFinite, at >= start - 0.0005, at - lastKept >= gap, let frame = CMSampleBufferGetImageBuffer(sample) {
              let measure = kept % CutoutRender.personEvery == 0
              let share: Double = try autoreleasepool { () throws -> Double in
                let done = try cutFrame(frame, upright: upright, rect: rect, straight: straight, segmentation: segmentation,
                                        sequence: sequence, pool: pool, space: space)
                guard adaptor.append(done.picture, withPresentationTime: pts) else {
                  throw CutoutError.failed("cutout writer: " + ExportSession.describe(writer.error))
                }
                return measure ? coverage(of: done.mask) : -1
              }
              if share > person { person = share }
              kept += 1
              lastKept = at
              progress(min(1, max(0, (at - start) / (end - start))))
            }
          } else {
            picturesDone = true
            pictureInput.markAsFinished()
          }
        }
        if !soundsDone, let soundInput, let sounds, soundInput.isReadyForMoreMediaData {
          worked = true
          if let packet = sounds.copyNextSampleBuffer() {
            guard soundInput.append(packet) else { throw CutoutError.failed("cutout sound: " + ExportSession.describe(writer.error)) }
          } else {
            soundsDone = true
            soundInput.markAsFinished()
          }
        }
        if !worked { try await Task.sleep(nanoseconds: 2_000_000) }
      }
      guard reader.status == .completed else { throw CutoutError.failed("cutout reader: " + ExportSession.describe(reader.error)) }
      guard kept > 0 else { throw CutoutError.failed("cutout render: no picture came out") }
      guard person >= needed else { throw CutoutError.failed("cutout person: no person found") }
      await writer.finishWriting()
      guard writer.status == .completed else { throw CutoutError.failed("cutout writer: " + ExportSession.describe(writer.error)) }
      try place(partURL, at: outputURL)
    } catch {
      reader.cancelReading()
      if writer.status == .writing { writer.cancelWriting() }
      try? FileManager.default.removeItem(at: partURL)
      throw error
    }
    progress(1)
    let answer: [String: Any] = ["fileUri": outputURL.absoluteString, "seconds": end, "frames": kept, "person": person]
    return answer
  }

  /// A photo's cut-out copy: decoded upright (EXIF applied) at the cap, its people found once at the best quality,
  /// then two files — a still movie with a see-through background (two frames, `stillSeconds` long: what the export
  /// plays) and, LAST, the PNG (what the preview draws; its presence is what "ready" means).
  static func renderPhoto(_ request: CutoutRequest, to outputURL: URL, job: CutoutJob) async throws -> [String: Any] {
    guard let url = ExportSession.fileURL(from: request.sourceUri) else { throw CutoutError.failed("cutout source: not a file path") }
    guard let stillURL = ExportSession.fileURL(from: request.stillPath) else { throw CutoutError.failed("cutout output: not a file path") }
    guard let imageSource = CGImageSourceCreateWithURL(url as CFURL, nil) else { throw CutoutError.failed("cutout source: this picture cannot be read") }
    let cap = request.maxSide.isFinite && request.maxSide >= 2 ? Int(request.maxSide) : 2560
    let options: [CFString: Any] = [
      kCGImageSourceCreateThumbnailFromImageAlways: true,
      kCGImageSourceCreateThumbnailWithTransform: true,
      kCGImageSourceShouldCacheImmediately: true,
      kCGImageSourceThumbnailMaxPixelSize: cap,
    ]
    guard let image = CGImageSourceCreateThumbnailAtIndex(imageSource, 0, options as CFDictionary) else {
      throw CutoutError.failed("cutout source: this picture cannot be read")
    }
    if job.isCancelled { throw CutoutError.cancelled }

    let segmentation = VNGeneratePersonSegmentationRequest()
    segmentation.qualityLevel = .accurate
    segmentation.outputPixelFormat = kCVPixelFormatType_OneComponent8
    do {
      try VNImageRequestHandler(cgImage: image, options: [:]).perform([segmentation])
    } catch {
      throw CutoutError.failed("cutout people: " + ExportSession.describe(error))
    }
    guard let mask = segmentation.results?.first?.pixelBuffer else { throw CutoutError.failed("cutout people: no mask came back") }
    let person = coverage(of: mask)
    let needed = request.minPerson.isFinite ? request.minPerson : 0
    guard person >= needed else { throw CutoutError.failed("cutout person: no person found") }
    if job.isCancelled { throw CutoutError.cancelled }

    let full = CGRect(x: 0, y: 0, width: image.width, height: image.height)
    let cutImage = cut(CIImage(cgImage: image), mask: mask, rect: full)
    let space = CGColorSpace(name: CGColorSpace.sRGB)

    // 1. The still movie.
    let size = evenSize(width: Double(image.width), height: Double(image.height), maxSide: request.maxSide)
    let rect = CGRect(x: 0, y: 0, width: size.width, height: size.height)
    let fitted = cutImage.transformed(by: CGAffineTransform(scaleX: CGFloat(size.width) / CGFloat(max(1, image.width)),
                                                            y: CGFloat(size.height) / CGFloat(max(1, image.height)))).cropped(to: rect)
    let still = try bgraBuffer(width: size.width, height: size.height)
    context.render(fitted, to: still, bounds: rect, colorSpace: space)
    let seconds = request.stillSeconds.isFinite && request.stillSeconds >= 1 ? request.stillSeconds : 60
    let total = ExportSession.time(seconds)
    let stillPart = partURL(for: stillURL)
    let (writer, input, adaptor) = try makeWriter(stillPart, width: size.width, height: size.height, request: request)
    do {
      guard writer.startWriting() else { throw CutoutError.failed("cutout writer: " + ExportSession.describe(writer.error)) }
      writer.startSession(atSourceTime: .zero)
      let times: [CMTime] = [.zero, total - CMTime(value: 1, timescale: 30)]
      for time in times {
        while !input.isReadyForMoreMediaData {
          if job.isCancelled { throw CutoutError.cancelled }
          guard writer.status == .writing else { throw CutoutError.failed("cutout writer: " + ExportSession.describe(writer.error)) }
          try await Task.sleep(nanoseconds: 2_000_000)
        }
        guard adaptor.append(still, withPresentationTime: time) else {
          throw CutoutError.failed("cutout writer: " + ExportSession.describe(writer.error))
        }
      }
      input.markAsFinished()
      writer.endSession(atSourceTime: total)
      await writer.finishWriting()
      guard writer.status == .completed else { throw CutoutError.failed("cutout writer: " + ExportSession.describe(writer.error)) }
      try place(stillPart, at: stillURL)
    } catch {
      if writer.status == .writing { writer.cancelWriting() }
      try? FileManager.default.removeItem(at: stillPart)
      throw error
    }

    // 2. The PNG, last.
    guard let png = context.createCGImage(cutImage, from: full, format: .RGBA8, colorSpace: space) else {
      throw CutoutError.failed("cutout output: the picture could not be made")
    }
    let pngPart = partURL(for: outputURL)
    try? FileManager.default.removeItem(at: pngPart)
    guard let destination = CGImageDestinationCreateWithURL(pngPart as CFURL, UTType.png.identifier as CFString, 1, nil) else {
      throw CutoutError.failed("cutout output: the picture could not be written")
    }
    CGImageDestinationAddImage(destination, png, nil)
    guard CGImageDestinationFinalize(destination) else {
      try? FileManager.default.removeItem(at: pngPart)
      throw CutoutError.failed("cutout output: the picture could not be written")
    }
    try place(pngPart, at: outputURL)
    let answer: [String: Any] = ["fileUri": outputURL.absoluteString, "seconds": seconds, "frames": 1, "person": person]
    return answer
  }
}
```

`modules/clipy-video/ios/ClipyVideoModule.swift`:

1. `Events("onExportEvent", "onSoundEvent")` becomes `Events("onExportEvent", "onSoundEvent", "onCutoutEvent")`.
2. After the `lookupBeatJob` function add:

```swift

  private let cutoutLock = NSLock()
  private var cutoutJobs: [String: CutoutJob] = [:]   // guarded by `cutoutLock`; one entry per render that has not answered yet

  private func storeCutoutJob(_ id: String, _ job: CutoutJob) {
    cutoutLock.lock(); defer { cutoutLock.unlock() }
    cutoutJobs[id] = job
  }

  private func dropCutoutJob(_ id: String) {
    cutoutLock.lock(); defer { cutoutLock.unlock() }
    cutoutJobs[id] = nil
  }

  private func lookupCutoutJob(_ id: String) -> CutoutJob? {
    cutoutLock.lock(); defer { cutoutLock.unlock() }
    return cutoutJobs[id]
  }
```

3. At the end of `definition()`, after the `cancelBeatEnvelope` function, add:

```swift

    // Remove background: renders the cut-out copy the request names (see CutoutRender). Resolves
    // `{ fileUri, seconds, frames, person }`; progress arrives as `onCutoutEvent { jobId, progress }`. Rejects
    // "E_CUTOUT_CANCELLED" after `cancelCutout(jobId)`, else "E_CUTOUT" with a staged message. The work runs on a
    // Swift concurrency thread; the job is stored before it starts, and every way out of the `do` answers the
    // promise exactly once. The source (and so its asset) lives until the render has returned.
    AsyncFunction("renderCutout") { (request: CutoutRequest, promise: Promise) in
      let job = CutoutJob()
      let jobId = request.jobId
      self.storeCutoutJob(jobId, job)
      Task { [weak self] in
        defer { self?.dropCutoutJob(jobId) }
        do {
          guard let outputURL = ExportSession.fileURL(from: request.outputPath) else { throw CutoutError.failed("cutout output: not a file path") }
          let answer: [String: Any]
          if request.kind == "photo" {
            answer = try await CutoutRender.renderPhoto(request, to: outputURL, job: job)
          } else {
            let source = try await CutoutSource.open(request.sourceUri)
            var lastSent = -1.0
            answer = try await CutoutRender.renderVideo(request, source: source, to: outputURL, job: job, progress: { (fraction: Double) -> Void in
              guard fraction - lastSent >= 0.02 else { return }   // at most ~50 events a render
              lastSent = fraction
              self?.sendEvent("onCutoutEvent", ["jobId": jobId, "progress": fraction])
            })
          }
          promise.resolve(answer)
        } catch CutoutError.cancelled {
          promise.reject("E_CUTOUT_CANCELLED", "Cutout cancelled")
        } catch {
          promise.reject("E_CUTOUT", CutoutRender.message(error))
        }
      }
    }

    // Stops that render at its next pass (it then rejects "E_CUTOUT_CANCELLED"). An unknown or finished job: nothing.
    Function("cancelCutout") { (jobId: String) in
      self.lookupCutoutJob(jobId)?.cancel()
    }
```

**Read it back against these points before committing:** (1) *assets* — `CutoutSource` stores the `AVURLAsset`; the module's `source` is alive until `renderVideo` returns; the reader is made from `source.asset`. (2) *async* — `open`, `renderVideo` and `renderPhoto` are `async`; they use `loadTracks(withMediaType:)`, `load(…)`, `Task.sleep` and `finishWriting()` only with `await`; no `await` is inside the `autoreleasepool` closure; `copyNextSampleBuffer()`, `startReading()`, `startWriting()`, `append` are the synchronous calls they have always been. (3) *names* — in `renderVideo`: `start`, `end`, `range`, `shown`, `fullWidth`, `fullHeight`, `size`, `rect`, `scale`, `upright`, `reader`, `pictures`, `sounds`, `stored`, `partURL`, `writer`, `pictureInput`, `adaptor`, `soundInput`, `input`, `segmentation`, `sequence`, `straight`, `space`, `gap`, `needed`, `kept`, `lastKept`, `person`, `picturesDone`, `soundsDone`, `pool`, `worked`, `sample`, `pts`, `at`, `frame`, `measure`, `share`, `done`, `packet`, `answer` are each declared once per scope (`if let soundInput, let sounds` shadows the two outer optionals inside its own block, which Swift 5.7 allows; `let partURL = CutoutRender.partURL(for:)` names the static function with its type so the local does not hide it on that line). In `renderPhoto`: `url`, `stillURL`, `imageSource`, `cap`, `options`, `image`, `segmentation`, `mask`, `person`, `needed`, `full`, `cutImage`, `space`, `size`, `rect`, `fitted`, `still`, `seconds`, `total`, `stillPart`, `writer`, `input`, `adaptor`, `times`, `time`, `png`, `pngPart`, `destination`, `answer`; there `partURL(for:)` is called as a function and no local is named `partURL`. (4) *types* — `evenSize` returns a labelled tuple of `Int`s (`size.width` / `size.height` are `Int`: `CGRect(x:y:width:height:)` has an `Int` form; `CGFloat(size.width)` where a `CGFloat` is needed); `image.width` is an `Int`; `pts.seconds` a `Double`; `total - CMTime(value: 1, timescale: 30)` is the `CMTime` subtraction `MediaPrePass` already uses; `segmentation.results` is `[VNPixelBufferObservation]?` and `.pixelBuffer` a `CVPixelBuffer`; `adaptor.pixelBufferPool` is optional; `CGColorSpace(name:)` is optional and is passed as the optional `colorSpace:`; `kVTCompressionPropertyKey_TargetQualityForAlpha` is a `CFString` cast `as String`; `UTType.png.identifier as CFString`. (5) *availability* — `VNGeneratePersonSegmentationRequest` 15.0, `hevcWithAlpha` 13.0, the alpha-quality key 13.0, `UTType` 14.0, the `async` `load` API 15.0: all at or below 16.4, so no `#available`. (6) *exactly once* — in the module every path of the `do` ends in the one `promise.resolve` or in one of the two `catch` blocks; `defer` drops the job on all of them. (7) *part files* — the video's part file is removed in the one `catch`; the photo's still part in its `catch`, the PNG part on a failed finalize and inside `place`; if the PNG fails after the still movie was placed, the still movie stays (a later render overwrites it; the copy is not "ready" without its PNG). (8) *exceptions* — the picture input's settings come from `videoSettings` (asked with `canApply`), every input and output is asked with `canAdd` before `add`.

- [ ] **Step 4: Run** `npx.cmd jest src/editor/model/__tests__/cutoutRender.swift.test.ts src/editor/model/__tests__/beatEnvelope.parity.test.ts src/editor/model/__tests__/soundRender.swift.test.ts src/editor/model/__tests__/speechRender.swift.test.ts src/editor/model/__tests__/layersExport.swift.test.ts src/editor/__tests__/looks.frozen.test.ts` → PASS. Then `npm run typecheck` and `npm test`. **No build.**
- [ ] **Step 5: Commit** — `feat(native): remove background — people cut out with Vision into HEVC with alpha that keeps the source's timing and sound; a photo into a PNG and a still movie`.

---

### Task 9: The preview: `ClipFrame`, `LayerStack`, the Preview tag

**Depends on:** Task 8. **Parallel-safe with:** 10, 11.

**Files:** Create `src/editor/components/CutoutFollower.tsx`, `src/editor/__tests__/cutoutPreview.test.tsx`. Modify `src/editor/components/ClipFrame.tsx`, `src/editor/components/LayerStack.tsx`, `src/editor/components/PreviewTag.tsx`.

**Do not touch:** `PreviewPlayer.tsx`, `LayerVideo.tsx` (it is used as it is), `previewHandoff.ts`, `EditorLayout.tsx`, `needsPreviewTag` (its code is not edited), `ClipFrame.test.tsx`, `LayerStack.test.tsx`, `PreviewTag.test.tsx`.

**Interfaces: Consumes** `shownCutout`, `useCutoutFiles` (Task 8); `CUTOUT_PREVIEW` (Task 3); `activeCutout` (Task 1); `LayerVideo` (exists). **Produces**

```ts
// src/editor/components/CutoutFollower.tsx
export function CutoutFollower({ clip, uri }: { clip: Clip; uri: string }): JSX.Element;   // a silent LayerVideo playing the copy in step with the playhead
// src/editor/components/PreviewTag.tsx
export function cutoutNeedsTag(p: Project, playhead: number, files: Record<string, CutoutFile>): boolean;
```

**What must hold (spec B3):** the main `VideoView` is `children` of `ClipFrame` and stays at the same place in the tree — only the STYLE of the view around it changes (opacity 0 while a main video's cut-out shows), and the follower is a sibling added AFTER it. Nothing is animated. No state is set from an effect.

- [ ] **Step 1: Failing tests.** Create `src/editor/__tests__/cutoutPreview.test.tsx`:

```tsx
jest.mock("@/src/editor/components/thumbnails", () => ({ getThumb: jest.fn(async () => "file:///thumb.jpg") }));
jest.mock("@/src/editor/components/LayerVideo", () => {
  const { View } = require("react-native");
  return { LayerVideo: ({ layer, offset }: { layer: { id: string; sourceUri: string; muted: boolean }; offset: number }) =>
    <View testID={`layer-video-${layer.id}`} accessibilityLabel={`${layer.sourceUri}|${layer.muted ? "muted" : "sound"}|${offset}`} /> };
});
import { act, render, screen } from "@testing-library/react-native";
import { StyleSheet, Text } from "react-native";
import { useCutoutFiles, type CutoutFile } from "@/src/editor/cutoutFiles";
import { CUTOUT_PREVIEW } from "@/src/editor/model/cutout";
import { makeClip, makeLayer, makePhotoClip, makeProject } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { ClipFrame } from "../components/ClipFrame";
import { CutoutFollower } from "../components/CutoutFollower";
import { LayerStack } from "../components/LayerStack";
import { cutoutNeedsTag, PreviewTag } from "../components/PreviewTag";

const W = 1080, H = 1920;
const MEDIA = "file:///doc/projects/p1/media", DIR = "file:///doc/projects/p1/cutout";
const style = (id: string) => StyleSheet.flatten(screen.getByTestId(id).props.style);
const ready = (name: string): Record<string, CutoutFile> => ({ [name]: { status: "ready", uri: `${DIR}/${name}` } });
const video = makeClip({ id: "a", sourceDuration: 8, sourceUri: `${MEDIA}/abc.mov`, cutout: true, background: { type: "color", color: "#112233" } });
const photo = makePhotoClip({ id: "ph", sourceUri: `${MEDIA}/p.jpg`, cutout: true });
const layer = { ...makeLayer({ id: "L", sourceDuration: 6, sourceUri: `${MEDIA}/layer.mov` }), cutout: true as const };
const VIDEO = "abc-c1-0-8000.mov", PHOTO = "p-c1-photo.png", LAYER = "layer-c1-0-6000.mov";
const st = () => useEditorStore.getState();

beforeEach(() => {
  useCutoutFiles.setState({ files: {} });
  st().reset();
  CUTOUT_PREVIEW.layerVideo = true;
  CUTOUT_PREVIEW.mainVideo = true;
});

describe("ClipFrame", () => {
  test("a clip whose copy is not ready is drawn exactly as before: no background, the picture visible, no second player", async () => {
    await render(<ClipFrame clip={video} frameW={W} frameH={H}><Text>video</Text></ClipFrame>);
    expect(screen.queryByTestId("clip-background")).toBeNull();
    expect(screen.queryByTestId("clip-cutout")).toBeNull();
    expect(style("clip-content").opacity).toBeUndefined();
    await act(() => { useCutoutFiles.setState({ files: { [VIDEO]: { status: "busy", progress: 0.4 } } }); });
    expect(screen.queryByTestId("clip-cutout")).toBeNull();
  });

  test("a main video with a ready copy: its own picture is hidden (not removed), the copy plays in its place, the background is drawn", async () => {
    st().setProject(makeProject({ clips: [video] }));
    useCutoutFiles.setState({ files: ready(VIDEO) });
    await render(<ClipFrame clip={video} frameW={W} frameH={H}><Text>video</Text></ClipFrame>);
    expect(screen.getByText("video")).toBeTruthy();                           // still mounted: the player keeps the sound and the clock
    expect(style("clip-content").opacity).toBe(0);
    expect(style("clip-background").backgroundColor).toBe("#112233");
    const box = style("clip-cutout"), own = style("clip-content");
    expect([box.left, box.top, box.width, box.height]).toEqual([own.left, own.top, own.width, own.height]);
    expect(screen.getByTestId("layer-video-a").props.accessibilityLabel).toBe(`${DIR}/${VIDEO}|muted|0`);
  });

  test("with the main-video preview switched off the clip is drawn as before", async () => {
    CUTOUT_PREVIEW.mainVideo = false;
    useCutoutFiles.setState({ files: ready(VIDEO) });
    await render(<ClipFrame clip={video} frameW={W} frameH={H}><Text>video</Text></ClipFrame>);
    expect(screen.queryByTestId("clip-cutout")).toBeNull();
    expect(style("clip-content").opacity).toBeUndefined();
  });

  test("a photo with a ready copy draws the PNG; on the main track its background is drawn, on a layer there is none", async () => {
    useCutoutFiles.setState({ files: ready(PHOTO) });
    const main = await render(<ClipFrame clip={photo} frameW={W} frameH={H} />);
    expect(screen.getByTestId("clip-photo").props.source).toEqual({ uri: `${DIR}/${PHOTO}` });
    expect(screen.getByTestId("clip-background")).toBeTruthy();
    expect(screen.queryByTestId("clip-cutout")).toBeNull();
    main.unmount();
    await render(<ClipFrame clip={photo} frameW={W} frameH={H} transparent />);
    expect(screen.getByTestId("clip-photo").props.source).toEqual({ uri: `${DIR}/${PHOTO}` });
    expect(screen.queryByTestId("clip-background")).toBeNull();
  });

  test("a photo whose switch is off, or whose copy is not ready, draws its own file", async () => {
    await render(<ClipFrame clip={photo} frameW={W} frameH={H} />);
    expect(screen.getByTestId("clip-photo").props.source).toEqual({ uri: `${MEDIA}/p.jpg` });
  });

  test("a layer's video gets no second player here (its own plays the copy)", async () => {
    useCutoutFiles.setState({ files: ready(LAYER) });
    await render(<ClipFrame clip={layer} frameW={W} frameH={H} transparent><Text>video</Text></ClipFrame>);
    expect(screen.queryByTestId("clip-cutout")).toBeNull();
    expect(style("clip-content").opacity).toBeUndefined();
  });
});

test("CutoutFollower: a silent player on the copy, at the clip's offset under the playhead", async () => {
  st().setProject(makeProject({ clips: [makeClip({ id: "first", sourceDuration: 3 }), video] }));
  await act(() => { st().seek(4.5); });
  await render(<CutoutFollower clip={video} uri={`${DIR}/${VIDEO}`} />);
  expect(screen.getByTestId("layer-video-a").props.accessibilityLabel).toBe(`${DIR}/${VIDEO}|muted|1.5`);
  await act(() => { st().seek(1); });                                         // another clip is under the playhead: it stands at the start
  expect(screen.getByTestId("layer-video-a").props.accessibilityLabel).toBe(`${DIR}/${VIDEO}|muted|0`);
});

describe("LayerStack", () => {
  const open = async () => {
    st().setProject(makeProject({ clips: [makeClip({ id: "main", sourceDuration: 10 })], layers: [layer] }));
    await render(<LayerStack frameW={W} frameH={H} />);
  };

  test("a layer plays its own file until the copy is ready, then the copy (with the copy's sound)", async () => {
    await open();
    expect(screen.getByTestId("layer-video-L").props.accessibilityLabel).toBe(`${MEDIA}/layer.mov|sound|0`);
    await act(() => { useCutoutFiles.setState({ files: ready(LAYER) }); });
    expect(screen.getByTestId("layer-video-L").props.accessibilityLabel).toBe(`${DIR}/${LAYER}|sound|0`);
  });

  test("with the layer-video preview switched off it keeps its own file", async () => {
    CUTOUT_PREVIEW.layerVideo = false;
    useCutoutFiles.setState({ files: ready(LAYER) });
    await open();
    expect(screen.getByTestId("layer-video-L").props.accessibilityLabel).toBe(`${MEDIA}/layer.mov|sound|0`);
  });
});

describe("the Preview tag", () => {
  const p = makeProject({ clips: [video], layers: [layer] });
  const both = { ...ready(VIDEO), ...ready(LAYER) };

  test("no cut-out on screen: no tag from here", () => {
    expect(cutoutNeedsTag(makeProject({ clips: [makeClip({ id: "x", sourceDuration: 5 })] }), 1, {})).toBe(false);
  });

  test("a copy that is not ready, failed or cannot be made: the preview shows the clip as it was, so the tag shows", () => {
    expect(cutoutNeedsTag(p, 1, {})).toBe(true);
    expect(cutoutNeedsTag(p, 1, ready(VIDEO))).toBe(true);                   // the layer's is missing
    expect(cutoutNeedsTag(p, 1, { ...both, [LAYER]: { status: "failed", message: "x" } })).toBe(true);
    expect(cutoutNeedsTag(p, 1, both)).toBe(false);
  });

  test("the switches and a blur background", () => {
    CUTOUT_PREVIEW.mainVideo = false;
    expect(cutoutNeedsTag(p, 1, both)).toBe(true);
    CUTOUT_PREVIEW.mainVideo = true;
    CUTOUT_PREVIEW.layerVideo = false;
    expect(cutoutNeedsTag(p, 1, both)).toBe(true);
    CUTOUT_PREVIEW.layerVideo = true;
    const blurred = makeProject({ clips: [{ ...video, background: { type: "blur" } }] });
    expect(cutoutNeedsTag(blurred, 1, ready(VIDEO))).toBe(true);            // the export blurs the cut-out picture: not what the preview shows
    const photoMain = makeProject({ clips: [photo] });
    expect(cutoutNeedsTag(photoMain, 1, ready(PHOTO))).toBe(false);
  });

  test("the component shows the tag for a pending cut-out even when nothing else asks for it, and hides it once the copy is there", async () => {
    st().setProject(p);
    await render(<PreviewTag visible={false} />);
    expect(screen.getByTestId("preview-tag")).toBeTruthy();
    await act(() => { useCutoutFiles.setState({ files: both }); });
    expect(screen.queryByTestId("preview-tag")).toBeNull();
  });
});
```

- [ ] **Step 2: Run** `npx.cmd jest src/editor/__tests__/cutoutPreview.test.tsx` → FAIL.
- [ ] **Step 3: Implement.**

Create `src/editor/components/CutoutFollower.tsx`:

```tsx
import { useMemo } from "react";
import { clipAt } from "@/src/editor/model/timeline";
import type { Clip, LayerClip } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { LayerVideo } from "./LayerVideo";

/**
 * A main video clip's cut-out in the preview. The preview's own players load the clip's file and are not told otherwise, so the
 * copy gets a player of its own: a `LayerVideo` (the layers' player, unchanged) handed the clip with the copy's uri and no sound,
 * at the clip's offset under the playhead. The main player underneath keeps the sound and keeps driving the playhead; this one only
 * follows. Mounted by `ClipFrame` only while the copy is ready and the clip is on screen.
 */
export function CutoutFollower({ clip, uri }: { clip: Clip; uri: string }) {
  const offset = useEditorStore((s) => {
    const hit = s.project ? clipAt(s.project, s.playhead) : null;
    return hit && hit.clip.id === clip.id ? hit.offsetInClip : 0;
  });
  const follower = useMemo<LayerClip>(() => ({ ...clip, sourceUri: uri, muted: true, start: 0 }), [clip, uri]);
  return <LayerVideo layer={follower} offset={offset} />;
}
```

`src/editor/components/ClipFrame.tsx`:

1. Add the imports:

```tsx
import { shownCutout, useCutoutFiles } from "@/src/editor/cutoutFiles";
import { CUTOUT_PREVIEW } from "@/src/editor/model/cutout";
```

2. In `ClipFrame`, replace the two lines

```tsx
  // A see-through picture shows the clip's own background behind it, as the export does; so do a mask's cut-off corners.
  const showBackground = !transparent && backgroundShows(clip, placed, opacity, frameW, frameH);
```

with

```tsx
  // Remove background: the clip's cut-out copy once it is ready (null = the clip is drawn as it is).
  const cutUri = shownCutout(useCutoutFiles((s) => s.files), clip);
  const photo = isPhoto(clip);
  // A MAIN video cannot be handed another file (the preview's players load the clip's own): its picture is hidden — it keeps
  // playing, with the sound — and a silent player showing the copy is laid in its place. A layer's own player plays the copy.
  const follower = !transparent && !photo && cutUri !== null && CUTOUT_PREVIEW.mainVideo;
  // A see-through picture shows the clip's own background behind it, as the export does; so do a mask's cut-off corners, and so
  // does a cut-out on the main track (always: what was the picture's background is see-through now).
  const cutOut = !transparent && cutUri !== null && (photo || follower);
  const showBackground = !transparent && (cutOut || backgroundShows(clip, placed, opacity, frameW, frameH));
  // Loaded only when it is shown: suites that never show a cut-out do not load a video player for it.
  const Follower = follower ? (require("./CutoutFollower") as typeof import("./CutoutFollower")).CutoutFollower : null;
```

3. The `clip-content` view and the photo become (the wrapper's place and its child are unchanged; only its style gains the opacity, and the photo its source):

```tsx
        <View testID="clip-content" style={{ position: "absolute", left: -clip.crop.x * contentW, top: -clip.crop.y * contentH, width: contentW, height: contentH, ...(follower ? { opacity: 0 } : null) }}>
          {photo
            ? <Image testID="clip-photo" source={{ uri: cutUri ?? clip.sourceUri }} resizeMode="stretch" style={{ width: "100%", height: "100%" }} />
            : children}
        </View>
        {Follower && cutUri !== null ? (
          <View testID="clip-cutout" style={{ position: "absolute", left: -clip.crop.x * contentW, top: -clip.crop.y * contentH, width: contentW, height: contentH }}>
            <Follower clip={clip} uri={cutUri} />
          </View>
        ) : null}
        {overlayChildren}
```

4. Extend the component's doc comment: `Remove background (\`cutout.ts\`): a photo draws its PNG copy once that is ready; a main video's own picture is then hidden by opacity (never unmounted) under a silent second player showing the copy (\`CutoutFollower\`), and a main clip's background is always drawn behind a cut-out.`

`src/editor/components/LayerStack.tsx`:

1. Add the imports `import { shownCutout, useCutoutFiles } from "@/src/editor/cutoutFiles";` and `import { CUTOUT_PREVIEW } from "@/src/editor/model/cutout";`.
2. Beside the other store reads (before the early `return null`): `const files = useCutoutFiles((s) => s.files);`
3. Inside the `layers.map`, after `const motion = …`:

```tsx
        // Remove background: once the copy is ready the layer's one player plays it instead (the copy has the layer's timing and sound).
        const cut = CUTOUT_PREVIEW.layerVideo && !isPhoto(layer) ? shownCutout(files, layer) : null;
        const played = cut !== null ? { ...layer, sourceUri: cut } : layer;
```

and the player line becomes `{!isPhoto(layer) && !missing.includes(layer.sourceUri) && <LayerVideo layer={played} offset={offset} />}` (`ClipFrame` is still handed `layer`: it finds a photo's PNG itself).

`src/editor/components/PreviewTag.tsx`:

1. Add the imports:

```tsx
import { shownCutout, useCutoutFiles, type CutoutFile } from "@/src/editor/cutoutFiles";
import { CUTOUT_PREVIEW } from "@/src/editor/model/cutout";
import { activeCutout, isPhoto, type Clip } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
```

(`Project` is already imported there as a type; merge the import lines.)

2. Before `PreviewTag`, add:

```tsx
/**
 * Whether Remove background makes the preview differ from the export at the playhead: a clip or layer on screen has the switch on
 * and the preview does not show its cut-out as the export will — the copy is not ready (or cannot be made), that kind of video
 * preview is switched off (`CUTOUT_PREVIEW`), or a main clip's background is Blur (the export blurs the cut-out picture).
 */
export function cutoutNeedsTag(p: Project, playhead: number, files: Record<string, CutoutFile>): boolean {
  const asExported = (c: Clip, main: boolean): boolean => {
    if (!activeCutout(c)) return true;
    if (shownCutout(files, c) === null) return false;
    if (main && c.background.type === "blur") return false;
    if (isPhoto(c)) return true;
    return main ? CUTOUT_PREVIEW.mainVideo : CUTOUT_PREVIEW.layerVideo;
  };
  const hit = clipAt(p, playhead);
  return (!!hit && !asExported(hit.clip, true)) || layersAt(p, playhead).some((l) => !asExported(l, false));
}
```

3. `PreviewTag` begins with (hooks first, then the old early return with one more condition):

```tsx
export function PreviewTag({ visible }: { visible: boolean }) {
  const files = useCutoutFiles((s) => s.files);
  const cut = useEditorStore((s) => !!s.project && cutoutNeedsTag(s.project, s.playhead, files));
  if (!visible && !cut) return null;
```

The rest of the component is unchanged.

- [ ] **Step 4: Run** `npx.cmd jest src/editor/__tests__/cutoutPreview.test.tsx src/editor/__tests__/ClipFrame.test.tsx src/editor/__tests__/LayerStack.test.tsx src/editor/__tests__/PreviewTag.test.tsx src/__tests__` and every suite that renders `PreviewPlayer` (Grep for `PreviewPlayer` under `src/editor/__tests__`) → PASS with the three existing suites **unedited**. Then `git diff --stat main -- src/editor/components/PreviewPlayer.tsx src/editor/components/LayerVideo.tsx` is empty; `npm run typecheck` and `npm test`.
- [ ] **Step 5: Commit** — `feat(editor): the preview shows cut-outs — a layer's player plays the copy, a photo draws its PNG, a main video gets a silent follower over its background`.

---

### Task 10: The tool: `contextFor`, the strip, the toolbar

**Depends on:** Tasks 1, 8. **Parallel-safe with:** 9, 11.

**Files:** Create `src/editor/components/CutoutSheet.tsx`, `src/editor/__tests__/CutoutSheet.test.tsx`, `src/editor/__tests__/toolbarContext.cutout.test.ts`. Modify `src/editor/toolbarContext.ts`, `src/editor/toolGroups.ts`, `src/editor/toolStrip.ts`, `src/editor/components/EditorToolbar.tsx`, `src/editor/__tests__/toolbarContext.test.ts` (the pinned lists and count).

**Do not touch:** `EditorLayout.tsx`, `src/ui/*`, `ChromaSheet.tsx`, `ops.ts`.

**Interfaces: Consumes** `setClipCutout` (Task 1); `cutoutRefusal`, `cutoutBytes`, `cutoutNeed` (Task 3); `cutoutFileOf`, `knownCopies`, `useCutoutFiles`, `retryCutout`, `isNoPerson` (Task 8); `isCutoutAvailable`, `BEATS_BACKGROUND_TOOLS` (Task 4). **Produces**

```ts
// toolbarContext.ts: TOOL_IDS gains "cutout" (after "chroma"); toolStrip.ts: StripId gains "cutout"
export const CUTOUT_TOO_LONG: string;
export function cutoutStatus(on: boolean, refusal: CutoutRefusal | null, file: CutoutFile | undefined, bytes: number): string;
export function CutoutSheet(props: { clipId: string | null; visible: boolean; onClose: () => void }): JSX.Element | null;
```

- [ ] **Step 1: Failing tests.**

Create `src/editor/__tests__/toolbarContext.cutout.test.ts`:

```ts
import { contextFor, TOOL_IDS, type ToolbarSelection } from "../toolbarContext";
import { TOOL_META } from "../toolGroups";
import { makeClip, makeLayer, makePhotoClip, makeProject } from "../model/types";

const sel = (clipId: string): ToolbarSelection => ({ clipId, overlayId: null, effectId: null, audioId: null, section: null });
const p = makeProject({
  clips: [makeClip({ id: "v", sourceDuration: 5 }), makePhotoClip({ id: "ph" }), makeClip({ id: "rev", sourceDuration: 5, reversed: true }), makeClip({ id: "cut", sourceDuration: 5, cutout: true })],
  layers: [makeLayer({ id: "L", sourceDuration: 5 }), { ...makeLayer({ id: "Lrev", sourceDuration: 5 }), reversed: true }, { ...makeLayer({ id: "Lcut", sourceDuration: 5 }), cutout: true as const }],
});
const tools = (id: string) => contextFor(sel(id), p).tools;

test("Cut out is a tool with an outline icon, right after Green screen", () => {
  expect(TOOL_IDS).toContain("cutout");
  expect(TOOL_META.cutout).toEqual({ label: "Cut out", icon: "body-outline" });
  for (const id of ["v", "ph", "L"]) {
    const list = tools(id);
    expect(list[list.indexOf("chroma") + 1]).toBe("cutout");
  }
});

test("a reversed clip or layer has no Cut out; a clip or layer with the switch on has no Reverse", () => {
  expect(tools("rev")).not.toContain("cutout");
  expect(tools("Lrev")).not.toContain("cutout");
  expect(tools("rev")).toContain("reverse");
  expect(tools("cut")).toContain("cutout");
  expect(tools("cut")).not.toContain("reverse");
  expect(tools("Lcut")).not.toContain("reverse");
  expect(tools("v")).toContain("reverse");
});

test("no other bar has it", () => {
  const none: ToolbarSelection = { clipId: null, overlayId: null, effectId: null, audioId: null, section: null };
  expect(contextFor(none, p).tools).not.toContain("cutout");
  expect(contextFor({ ...none, section: "audio" }, p).tools).not.toContain("cutout");
});
```

Create `src/editor/__tests__/CutoutSheet.test.tsx`:

```tsx
import { act, fireEvent, render, screen } from "@testing-library/react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-09T10:00:00.000Z" }));
jest.mock("@/modules/clipy-video", () => ({ ...jest.requireActual("@/modules/clipy-video"), isCutoutAvailable: jest.fn(() => true) }));
jest.mock("@/src/editor/cutoutRenders", () => ({ retryCutout: jest.fn(), isNoPerson: (m: string) => m.includes("cutout person:") }));
import { isCutoutAvailable } from "@/modules/clipy-video";
import { retryCutout } from "@/src/editor/cutoutRenders";
import { useCutoutFiles } from "@/src/editor/cutoutFiles";
import { makeClip, makeLayer, makeProject } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { BEATS_BACKGROUND_TOOLS } from "@/src/lib/buildInfo";
import { useToast } from "@/src/ui/Toast";
import { CUTOUT_TOO_LONG, CutoutSheet, cutoutStatus } from "../components/CutoutSheet";

const st = () => useEditorStore.getState();
const sw = () => screen.getByLabelText("Remove background");
const item = (id: string) => [...st().project!.clips, ...st().project!.layers].find((c) => c.id === id)!;
const NAME = "a-c1-0-8000.mov";
const open = async (id = "a") => {
  st().setProject(makeProject({
    clips: [makeClip({ id: "a", sourceDuration: 8 }), makeClip({ id: "long", sourceDuration: 200 })],
    layers: [makeLayer({ id: "L", sourceDuration: 6 })],
  }));
  await act(() => { st().select(id); });
  await render(<CutoutSheet clipId={id} visible onClose={() => {}} />);
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(isCutoutAvailable).mockReturnValue(true);
  useCutoutFiles.setState({ files: {} });
  useToast.getState().clear();
  st().reset();
});

test("cutoutStatus: what the strip's status row says", () => {
  expect(cutoutStatus(false, null, undefined, 9491200)).toBe("People only. The copy takes about 9 MB.");
  expect(cutoutStatus(false, null, undefined, 1000)).toBe("People only. The copy takes about 1 MB.");
  expect(cutoutStatus(false, "tooLong", undefined, 0)).toBe(CUTOUT_TOO_LONG);
  expect(cutoutStatus(true, "tooLong", undefined, 0)).toBe(CUTOUT_TOO_LONG);
  expect(cutoutStatus(true, null, undefined, 0)).toBe("Waiting to start.");
  expect(cutoutStatus(true, null, { status: "busy", progress: 0.417 }, 0)).toBe("Preparing the cut-out: 42 %");
  expect(cutoutStatus(true, null, { status: "ready", uri: "u" }, 0)).toBe("Ready.");
  expect(cutoutStatus(true, null, { status: "failed", message: "cutout person: no person found" }, 0)).toBe("No person was found in this clip.");
  expect(cutoutStatus(true, null, { status: "failed", message: "cutout writer: boom" }, 0)).toBe("Could not remove the background. Switch it off and on to try again.");
  expect(CUTOUT_TOO_LONG).toBe("Remove background works on clips up to 60 seconds. Trim or split this clip first.");
});

test("the strip: a title, the switch off, and what it will take", async () => {
  await open();
  expect(screen.getByRole("header", { name: "Remove background" })).toBeTruthy();
  expect(sw().props.value).toBe(false);
  expect(screen.getByText("People only. The copy takes about 8 MB.")).toBeTruthy();
});

test("switching it on writes the switch in one undo step and asks for the copy again; off removes the key in one more", async () => {
  await open();
  await fireEvent(sw(), "valueChange", true);
  expect(item("a").cutout).toBe(true);
  expect(st().past).toHaveLength(1);
  expect(retryCutout).toHaveBeenCalledWith(NAME);
  expect(sw().props.value).toBe(true);
  expect(screen.getByText("Waiting to start.")).toBeTruthy();
  await act(() => { useCutoutFiles.setState({ files: { [NAME]: { status: "busy", progress: 0.5 } } }); });
  expect(screen.getByText("Preparing the cut-out: 50 %")).toBeTruthy();
  expect(screen.getByLabelText("Preparing the cut-out")).toBeTruthy();       // the spinner
  await act(() => { useCutoutFiles.setState({ files: { [NAME]: { status: "ready", uri: "u" } } }); });
  expect(screen.getByText("Ready.")).toBeTruthy();
  expect(screen.queryByLabelText("Preparing the cut-out")).toBeNull();
  await fireEvent(sw(), "valueChange", false);
  expect("cutout" in item("a")).toBe(false);
  expect(st().past).toHaveLength(2);
});

test("a layer takes it too", async () => {
  await open("L");
  await fireEvent(sw(), "valueChange", true);
  expect(item("L").cutout).toBe(true);
});

test("on a build without it the switch says the sentence and nothing changes", async () => {
  jest.mocked(isCutoutAvailable).mockReturnValue(false);
  await open();
  await fireEvent(sw(), "valueChange", true);
  expect(useToast.getState().message).toBe(BEATS_BACKGROUND_TOOLS);
  expect("cutout" in item("a")).toBe(false);
  expect(st().past).toHaveLength(0);
  expect(retryCutout).not.toHaveBeenCalled();
});

test("a clip over 60 seconds is refused with its sentence", async () => {
  await open("long");
  expect(screen.getByText(CUTOUT_TOO_LONG)).toBeTruthy();
  await fireEvent(sw(), "valueChange", true);
  expect(useToast.getState().message).toBe(CUTOUT_TOO_LONG);
  expect("cutout" in item("long")).toBe(false);
});

test("nothing is rendered for a clip that is gone", async () => {
  st().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 8 })] }));
  await render(<CutoutSheet clipId="nope" visible onClose={() => {}} />);
  expect(screen.queryByLabelText("Remove background")).toBeNull();
});
```

- [ ] **Step 2: Run** `npx.cmd jest src/editor/__tests__/toolbarContext.cutout.test.ts src/editor/__tests__/CutoutSheet.test.tsx` → FAIL.
- [ ] **Step 3: Implement.**

`src/editor/toolbarContext.ts`:

1. In `TOOL_IDS`, `"chroma",` becomes `"chroma", "cutout",`.
2. In `contextFor`, in the layer's list: `["blend"], ["chroma"], ["keyframe", pins]` becomes `["blend"], ["chroma"], ["cutout", !item.clip.reversed], ["keyframe", pins]`, and `["reverse", video]` becomes `["reverse", video && item.clip.cutout !== true]`. In the clip's list: `["mask"], ["chroma"], ["keyframe", pins]` becomes `["mask"], ["chroma"], ["cutout", !item.clip.reversed], ["keyframe", pins]`, and `["reverse", video]` becomes `["reverse", video && item.clip.cutout !== true]`.
3. Append to the doc comment of `contextFor`: `Cut out (Remove background) is on a clip's and a layer's bar unless it plays backwards (a reversed clip is exported from a copy without a see-through background); Reverse is left out for a clip whose Remove background is on, for the same reason.`

`src/editor/toolGroups.ts`: after the `chroma` row add `cutout: { label: "Cut out", icon: "body-outline" },`.

`src/editor/toolStrip.ts`: in `StripId`, `"chroma"` becomes `"chroma" | "cutout"`.

Create `src/editor/components/CutoutSheet.tsx`:

```tsx
import { Switch, View } from "react-native";
import { isCutoutAvailable } from "@/modules/clipy-video";
import { cutoutFileOf, knownCopies, useCutoutFiles, type CutoutFile } from "@/src/editor/cutoutFiles";
import { isNoPerson, retryCutout } from "@/src/editor/cutoutRenders";
import { cutoutBytes, cutoutNeed, cutoutRefusal, type CutoutRefusal } from "@/src/editor/model/cutout";
import { setClipCutout } from "@/src/editor/model/ops";
import { useEditorStore } from "@/src/editor/store";
import { useItemClip } from "@/src/editor/useItem";
import { BEATS_BACKGROUND_TOOLS } from "@/src/lib/buildInfo";
import { theme } from "@/src/theme/theme";
import { haptic } from "@/src/ui/haptics";
import { Spinner } from "@/src/ui/Spinner";
import { Body } from "@/src/ui/Text";
import { useToast } from "@/src/ui/Toast";
import { STRIP, StripNote, StripTiles, ToolStrip } from "@/src/ui/ToolStrip";

/** Said where the switch is tapped on a video whose trimmed source is over the limit, and in the strip for such a clip. */
export const CUTOUT_TOO_LONG = "Remove background works on clips up to 60 seconds. Trim or split this clip first.";
const HINT = "The phone finds the person and hides everything else.";
const PREPARING = "Preparing the cut-out";

/** The strip's one status line: what the copy will take, how far it is, that it is ready, or why it is not. */
export function cutoutStatus(on: boolean, refusal: CutoutRefusal | null, file: CutoutFile | undefined, bytes: number): string {
  if (refusal === "tooLong") return CUTOUT_TOO_LONG;
  if (!on) return `People only. The copy takes about ${Math.max(1, Math.round(bytes / 1000000))} MB.`;
  if (file === undefined) return "Waiting to start.";
  if (file.status === "busy") return `${PREPARING}: ${Math.round(file.progress * 100)} %`;
  if (file.status === "ready") return "Ready.";
  return isNoPerson(file.message) ? "No person was found in this clip." : "Could not remove the background. Switch it off and on to try again.";
}

/**
 * The selected clip's or layer's Remove background: one switch and one status line. Switching on is one undo step and only writes
 * the switch — the cut-out copy is prepared by the queue (`cutoutRenders.ts`), and the clip shows as it was until the copy is
 * ready. The original file is never changed; switching off brings the clip back at once.
 */
export function CutoutSheet({ clipId, visible, onClose }: { clipId: string | null; visible: boolean; onClose: () => void }) {
  const clip = useItemClip(clipId);
  const apply = useEditorStore((s) => s.apply);
  const files = useCutoutFiles((s) => s.files);
  if (!clip) return null;
  const on = clip.cutout === true;
  const refusal = cutoutRefusal(clip);
  const file = cutoutFileOf(files, clip);
  const busy = on && file !== undefined && file.status === "busy";
  const toggle = (next: boolean) => {
    if (!next) { apply((p) => setClipCutout(p, clip.id, false)); return; }
    if (!isCutoutAvailable()) { useToast.getState().show(BEATS_BACKGROUND_TOOLS); return; }
    if (refusal === "tooLong") { useToast.getState().show(CUTOUT_TOO_LONG); return; }
    if (refusal !== null) return;
    haptic("light");
    // A copy that failed before is asked for again by this tap.
    retryCutout(cutoutNeed(clip, knownCopies(files)).name);
    apply((p) => setClipCutout(p, clip.id, true));
  };

  return (
    <ToolStrip visible={visible} onClose={onClose} title="Remove background" note={<StripNote>Edges are not perfect</StripNote>}>
      <StripTiles lead={<Switch accessibilityLabel="Remove background" value={on} onValueChange={toggle} trackColor={{ true: theme.colors.accent }} />}>
        <View style={{ height: STRIP.tiles, justifyContent: "center", paddingHorizontal: theme.space.md }}>
          <Body muted style={{ fontSize: theme.type.small }}>{HINT}</Body>
        </View>
      </StripTiles>
      <View testID="cutout-status" style={{ height: STRIP.slider, flexDirection: "row", alignItems: "center", gap: theme.space.sm, paddingHorizontal: theme.space.gutter }}>
        {busy ? <Spinner label={PREPARING} /> : null}
        <Body muted numberOfLines={2} style={{ flex: 1, fontSize: theme.type.small }}>{cutoutStatus(on, refusal, file, cutoutBytes(clip))}</Body>
      </View>
    </ToolStrip>
  );
}
```

(`flex: 1` here is the text's WIDTH inside a row of explicit height; no height is left to flex.)

`src/editor/components/EditorToolbar.tsx`: add `import { CutoutSheet } from "./CutoutSheet";` beside the import of `ChromaSheet`; in `ACTIONS`, after the `chroma` row, add `cutout: { onPress: () => openStrip("cutout") },`; after the line that mounts `ChromaSheet`, add `<CutoutSheet clipId={selectedId} visible={strip?.id === "cutout"} onClose={closeStrip} />`.

**Pinned lists and counts.** In `src/editor/__tests__/toolbarContext.test.ts`: in the constants `CLIP` and `LAYER`, `"chroma",` becomes `"chroma", "cutout",`; `expect(TOOL_IDS).toHaveLength(54)` becomes `55`. Where a test of that file builds the expected bar of a **reversed** clip or layer from `CLIP` / `LAYER`, wrap it with the file's own `without(…, "cutout")`. Then Grep `src/` for other tests that list a clip's or a layer's whole bar or every `StripId` (search `"chroma"` under `__tests__`): add `"cutout"` right after it there too, and name each file in the commit message.

- [ ] **Step 4: Run** `npx.cmd jest src/editor/__tests__/toolbarContext.cutout.test.ts src/editor/__tests__/toolbarContext.test.ts src/editor/__tests__/CutoutSheet.test.tsx src/editor/__tests__/EditorToolbar.test.tsx src/editor/__tests__/EditorToolbar.layers.test.tsx src/__tests__` → PASS (the guards: no hex literal, spacing from the scale, outline icons). Then `npm run typecheck` and `npm test`.
- [ ] **Step 5: Commit** — `feat(editor): Cut out — the Remove background switch on a clip's and a layer's bar, with its status line`.

---

### Task 11: The export: `prepareCutouts`, the request rewrite

**Depends on:** Task 8. **Parallel-safe with:** 9, 10.

**Files:** Create `src/export/exportCutouts.ts`, `src/export/__tests__/exportCutouts.test.ts`, `src/export/__tests__/useExport.cutout.test.ts`. Modify `src/export/useExport.ts`, `src/export/__tests__/useExport.test.ts` (two mock lines, named below).

**Do not touch:** `modules/clipy-video/index.ts` (`toExportClip` / `toExportLayer` are not edited: the rewrite happens after them), `exportSounds.ts`, `estimate.ts`, anything under `ios/`.

**Interfaces: Consumes** `ensureCutout`, `cutoutDir`, `isNoPerson` (Task 8); `cutoutNeed`, `cutoutRefusal`, `cutoutStillName`, `parseCutoutName`, `CUTOUT` (Task 3); `activeCutout` (Task 1); `isCutoutAvailable` (Task 4). **Produces**

```ts
export const CUTOUT_SHARE = 0.3;
export const CUTOUT_EXPORT: { tooLong: string; noPerson: string };
export function prepareCutouts(projectId: string, items: readonly Clip[], onProgress: (fraction: number) => void, stopped?: () => boolean): Promise<Map<string, string>>;   // clip id → the copy's uri
export function withCutout<T extends ExportClip>(sent: T, clip: Clip, uri: string | undefined, main: boolean): T;
```

- [ ] **Step 1: Failing tests.**

Create `src/export/__tests__/exportCutouts.test.ts`:

```ts
jest.mock("@/src/editor/cutoutRenders", () => ({
  cutoutDir: (id: string) => `file:///doc/projects/${id}/cutout`,
  ensureCutout: jest.fn(),
  isNoPerson: (m: string) => m.includes("cutout person:"),
}));
jest.mock("@/src/projects/expoFs", () => ({ expoFs: { list: jest.fn(async () => []) } }));
import { toExportClip, toExportLayer } from "@/modules/clipy-video";
import { ensureCutout } from "@/src/editor/cutoutRenders";
import { makeClip, makeLayer, makePhotoClip } from "@/src/editor/model/types";
import { expoFs } from "@/src/projects/expoFs";
import { CUTOUT_EXPORT, CUTOUT_SHARE, prepareCutouts, withCutout } from "../exportCutouts";

const MEDIA = "file:///doc/projects/p1/media", DIR = "file:///doc/projects/p1/cutout";
const ensure = jest.mocked(ensureCutout);
const video = makeClip({ id: "a", sourceDuration: 30, sourceUri: `${MEDIA}/abc.mov`, trimStart: 4.2, trimEnd: 9.7, cutout: true });
const half = makeClip({ id: "b", sourceDuration: 30, sourceUri: `${MEDIA}/abc.mov`, trimStart: 9.7, trimEnd: 10.5, cutout: true });
const photo = makePhotoClip({ id: "ph", sourceUri: `${MEDIA}/p.jpg`, seconds: 4, cutout: true });
const plain = makeClip({ id: "plain", sourceDuration: 5 });

beforeEach(() => {
  jest.clearAllMocks();
  ensure.mockImplementation(async (_p, need) => `${DIR}/${need.name}`);
  jest.mocked(expoFs.list).mockResolvedValue([]);
});

test("the share of the export's progress, and the sentences", () => {
  expect(CUTOUT_SHARE).toBe(0.3);
  expect(CUTOUT_EXPORT).toEqual({
    tooLong: "A clip with Remove background is longer than 60 seconds. Shorten it, or switch Remove background off.",
    noPerson: "Remove background found no person in a clip. Switch it off for that clip.",
  });
});

test("prepareCutouts: nothing for clips without the switch; one copy per clip with it, in order, with progress", async () => {
  await expect(prepareCutouts("p1", [plain], () => {})).resolves.toEqual(new Map());
  expect(ensure).not.toHaveBeenCalled();
  const seen: number[] = [];
  const out = await prepareCutouts("p1", [plain, video, photo], (f) => seen.push(f));
  expect([...out]).toEqual([["a", `${DIR}/abc-c1-3000-11000.mov`], ["ph", `${DIR}/p-c1-photo.png`]]);
  expect(ensure.mock.calls.map((c) => c[1].name)).toEqual(["abc-c1-3000-11000.mov", "p-c1-photo.png"]);
  expect(seen).toEqual([0.5, 1]);
});

test("prepareCutouts: a copy on disk that covers a clip is used, and a copy made for one clip serves the next", async () => {
  jest.mocked(expoFs.list).mockResolvedValueOnce(["abc-c1-0-30000.mov", "part-abc-c1-3000-11000.mov", "notes.txt"]);
  const out = await prepareCutouts("p1", [video, half], () => {});
  expect(ensure.mock.calls.map((c) => c[1].name)).toEqual(["abc-c1-0-30000.mov", "abc-c1-0-30000.mov"]);
  expect(out.get("b")).toBe(`${DIR}/abc-c1-0-30000.mov`);
  jest.clearAllMocks();
  ensure.mockImplementation(async (_p, need) => `${DIR}/${need.name}`);
  const wide = makeClip({ id: "w", sourceDuration: 30, sourceUri: `${MEDIA}/abc.mov`, trimStart: 4, trimEnd: 12, cutout: true });
  await prepareCutouts("p1", [wide, video], () => {});
  expect(ensure.mock.calls.map((c) => c[1].name)).toEqual(["abc-c1-3000-13000.mov", "abc-c1-3000-13000.mov"]);     // the second clip is inside the first one's copy
});

test("prepareCutouts: a clip over the limit, no person, and any other failure stop the export with a plain reason", async () => {
  const long = makeClip({ id: "l", sourceDuration: 300, cutout: true });
  await expect(prepareCutouts("p1", [video, long], () => {})).rejects.toThrow(CUTOUT_EXPORT.tooLong);
  expect(ensure).not.toHaveBeenCalled();
  ensure.mockRejectedValueOnce(new Error("cutout person: no person found"));
  await expect(prepareCutouts("p1", [video], () => {})).rejects.toThrow(CUTOUT_EXPORT.noPerson);
  ensure.mockRejectedValueOnce(new Error("cutout writer: boom"));
  await expect(prepareCutouts("p1", [video], () => {})).rejects.toThrow("Could not remove a background for the export: cutout writer: boom");
});

test("prepareCutouts: once stopped it asks for nothing more and reports nothing more", async () => {
  let stop = false;
  const seen: number[] = [];
  ensure.mockImplementationOnce(async (_p, need) => { stop = true; return `${DIR}/${need.name}`; });
  const out = await prepareCutouts("p1", [video, photo], (f) => seen.push(f), () => stop);
  expect(ensure).toHaveBeenCalledTimes(1);
  expect(out.size).toBe(1);
  expect(seen).toEqual([]);
});

describe("withCutout: what the export is sent", () => {
  const COPY = `${DIR}/abc-c1-3000-11000.mov`;

  test("no copy, or the switch off: the clip is sent as it is (the same object)", () => {
    const sent = toExportClip(video);
    expect(withCutout(sent, video, undefined, true)).toBe(sent);
    const off = toExportClip(plain);
    expect(withCutout(off, plain, COPY, true)).toBe(off);
  });

  test("a main video: the copy's file, everything else the same, the opacity just under 1 so its background is drawn", () => {
    const sent = toExportClip(video);
    expect(withCutout(sent, video, COPY, true)).toEqual({ ...sent, sourceUri: COPY, opacity: 0.999 });
    const faded = toExportClip({ ...video, opacity: 0.4 });
    expect(withCutout(faded, { ...video, opacity: 0.4 }, COPY, true).opacity).toBe(0.4);
  });

  test("a layer: the copy's file and nothing else", () => {
    const layer = { ...makeLayer({ id: "L", sourceDuration: 30, sourceUri: `${MEDIA}/abc.mov`, trimStart: 4.2, trimEnd: 9.7, start: 2 }), cutout: true as const };
    const sent = toExportLayer(layer);
    expect(withCutout(sent, layer, COPY, false)).toEqual({ ...sent, sourceUri: COPY });
  });

  test("a photo is sent as a video clip playing its still movie for the photo's length", () => {
    const sent = toExportClip(photo);
    const out = withCutout(sent, photo, `${DIR}/p-c1-photo.png`, true);
    expect(out).toEqual({ ...sent, kind: "video", sourceUri: `${DIR}/p-c1-photo.mov`, trimStart: 0, trimEnd: 4, speed: 1, reversed: false, muted: true, speedSpans: [], opacity: 0.999 });
    expect(out.keyframes).toBe(sent.keyframes);                 // a Motion's pins travel with it
  });
});
```

Create `src/export/__tests__/useExport.cutout.test.ts`:

```ts
import { act, renderHook } from "@testing-library/react-native";
jest.mock("@/modules/clipy-video", () => ({
  isNativeAvailable: () => true,
  exportTimeline: jest.fn(async () => "job1"),
  addExportListener: jest.fn(() => ({ remove() {} })),
  cancelExport: jest.fn(),
  toExportOverlay: jest.requireActual("@/modules/clipy-video").toExportOverlay,
  toExportClip: jest.requireActual("@/modules/clipy-video").toExportClip,
  toExportEffect: jest.requireActual("@/modules/clipy-video").toExportEffect,
  toExportLayer: jest.requireActual("@/modules/clipy-video").toExportLayer,
  toExportAudioTrack: jest.requireActual("@/modules/clipy-video").toExportAudioTrack,
  isSoundAvailable: jest.fn(() => true),
  isCutoutAvailable: jest.fn(() => true),
}));
jest.mock("@/src/editor/soundRenders", () => ({ ensureSound: jest.fn(async (_p: string, uri: string) => `${uri}.copy`) }));
jest.mock("@/src/editor/cutoutRenders", () => ({
  cutoutDir: (id: string) => `file:///doc/projects/${id}/cutout`,
  ensureCutout: jest.fn(async (_p: string, need: { name: string }) => `file:///doc/projects/p1/cutout/${need.name}`),
  isNoPerson: (m: string) => m.includes("cutout person:"),
}));
jest.mock("@/src/projects/expoFs", () => ({
  expoFs: { cacheDir: "file:///cache/", freeBytes: async () => 1e12, mkdir: async () => {}, list: async () => [] },
}));
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-09T10:00:00.000Z" }));
import { addExportListener, exportTimeline, isCutoutAvailable, toExportClip, toExportLayer } from "@/modules/clipy-video";
import { ensureCutout } from "@/src/editor/cutoutRenders";
import { makeClip, makeLayer, makeProject } from "@/src/editor/model/types";
import { CUTOUT_EXPORT } from "../exportCutouts";
import { useExport } from "../useExport";

const DIR = "file:///doc/projects/p1/cutout";
const main = makeClip({ id: "a", sourceDuration: 8, sourceUri: "file:///media/a.mp4", cutout: true });
const other = makeClip({ id: "b", sourceDuration: 6 });
const layer = { ...makeLayer({ id: "L", sourceDuration: 5, sourceUri: "file:///media/l.mp4", start: 1 }), cutout: true as const };
const project = makeProject({ id: "p1", clips: [main, other], layers: [layer] });
const sent = () => jest.mocked(exportTimeline).mock.calls[0][0];

beforeEach(() => { jest.clearAllMocks(); jest.mocked(isCutoutAvailable).mockReturnValue(true); });

test("clips and layers with Remove background are exported from their copies; the others as they are", async () => {
  const { result } = await renderHook(() => useExport(project, []));
  await act(async () => { await result.current.start(1080); });
  expect(jest.mocked(ensureCutout).mock.calls.map((c) => c[1].name)).toEqual(["a-c1-0-8000.mov", "l-c1-0-5000.mov"]);
  expect(sent().clips).toEqual([{ ...toExportClip(main), sourceUri: `${DIR}/a-c1-0-8000.mov`, opacity: 0.999 }, toExportClip(other)]);
  expect(sent().layers).toEqual([{ ...toExportLayer(layer), sourceUri: `${DIR}/l-c1-0-5000.mov` }]);
});

test("preparing the copies takes the first 30 % of the progress, the video export the rest", async () => {
  let progress: ((f: number) => void) | undefined;
  let finish: (uri: string) => void = () => {};
  jest.mocked(ensureCutout).mockImplementationOnce((_p, need, onProgress) => new Promise<string>((resolve) => { progress = onProgress; finish = () => resolve(`${DIR}/${need.name}`); }));
  const { result } = await renderHook(() => useExport(project, []));
  let started: Promise<void> = Promise.resolve();
  await act(async () => { started = result.current.start(1080); await new Promise((r) => setTimeout(r, 0)); });
  await act(async () => { progress?.(0.5); });
  expect(result.current.state).toMatchObject({ status: "exporting", progress: 0.3 * 0.25 });   // half of the first of two copies
  await act(async () => { finish(""); await started; });
  const emit = jest.mocked(addExportListener).mock.calls[0][0];
  await act(async () => { emit({ jobId: "job1", type: "progress", progress: 0.5 }); });
  expect(result.current.state.progress).toBeCloseTo(0.3 + 0.7 * 0.5, 9);
});

test("a copy that cannot be made stops the export with its reason; Cancel while preparing goes idle and never exports", async () => {
  jest.mocked(ensureCutout).mockRejectedValueOnce(new Error("cutout person: no person found"));
  const first = await renderHook(() => useExport(project, []));
  await act(async () => { await first.result.current.start(1080); });
  expect(first.result.current.state).toEqual({ status: "error", progress: 0, message: CUTOUT_EXPORT.noPerson });
  expect(exportTimeline).not.toHaveBeenCalled();
  jest.clearAllMocks();
  let finish: () => void = () => {};
  jest.mocked(ensureCutout).mockImplementationOnce((_p, need) => new Promise<string>((resolve) => { finish = () => resolve(`${DIR}/${need.name}`); }));
  const second = await renderHook(() => useExport(project, []));
  let started: Promise<void> = Promise.resolve();
  await act(async () => { started = second.result.current.start(1080); await new Promise((r) => setTimeout(r, 0)); });
  await act(async () => { second.result.current.cancel(); });
  expect(second.result.current.state).toEqual({ status: "idle", progress: 0 });
  await act(async () => { finish(); await started; });
  expect(exportTimeline).not.toHaveBeenCalled();
});

test("on a build without the tool nothing is prepared and the clips go out as they are", async () => {
  jest.mocked(isCutoutAvailable).mockReturnValue(false);
  const { result } = await renderHook(() => useExport(project, []));
  await act(async () => { await result.current.start(1080); });
  expect(ensureCutout).not.toHaveBeenCalled();
  expect(sent().clips).toEqual([toExportClip(main), toExportClip(other)]);
});

test("a project without the switch asks for nothing, and its progress is the export's own", async () => {
  const { result } = await renderHook(() => useExport(makeProject({ id: "p1", clips: [other] }), []));
  await act(async () => { await result.current.start(1080); });
  expect(ensureCutout).not.toHaveBeenCalled();
  const emit = jest.mocked(addExportListener).mock.calls[0][0];
  await act(async () => { emit({ jobId: "job1", type: "progress", progress: 0.5 }); });
  expect(result.current.state.progress).toBe(0.5);
});
```

- [ ] **Step 2: Run** `npx.cmd jest src/export/__tests__/exportCutouts.test.ts src/export/__tests__/useExport.cutout.test.ts` → FAIL.
- [ ] **Step 3: Implement.**

Create `src/export/exportCutouts.ts`:

```ts
import type { ExportClip } from "@/modules/clipy-video";
import { cutoutDir, ensureCutout, isNoPerson } from "@/src/editor/cutoutRenders";
import { CUTOUT, cutoutNeed, cutoutRefusal, cutoutStillName, parseCutoutName } from "@/src/editor/model/cutout";
import { activeCutout, isPhoto, type Clip } from "@/src/editor/model/types";
import { expoFs } from "@/src/projects/expoFs";

/** The share of the export's progress that preparing the cut-out copies takes (only when a clip has Remove background on). */
export const CUTOUT_SHARE = 0.3;
/** Why an export with Remove background cannot go out. */
export const CUTOUT_EXPORT = {
  tooLong: "A clip with Remove background is longer than 60 seconds. Shorten it, or switch Remove background off.",
  noPerson: "Remove background found no person in a clip. Switch it off for that clip.",
} as const;

/**
 * The cut-out copies of the clips and layers that have Remove background on: clip id → the copy's uri. A copy that exists (and
 * covers the clip) is used; a missing one is rendered first, one after the other. `onProgress` runs 0 → 1 across them. A copy that
 * cannot be made stops the export — it never goes out with a background the owner switched off. `stopped` (Cancel) is asked before
 * each copy and after it: once it answers true no further copy is asked for and nothing more is reported.
 */
export async function prepareCutouts(projectId: string, items: readonly Clip[], onProgress: (fraction: number) => void, stopped: () => boolean = () => false): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const cut = items.filter(activeCutout);
  if (cut.length === 0) return out;
  if (cut.some((c) => cutoutRefusal(c) === "tooLong")) throw new Error(CUTOUT_EXPORT.tooLong);
  let known: string[] = [];
  try { known = (await expoFs.list(cutoutDir(projectId))).filter((name) => parseCutoutName(name) !== null); } catch { known = []; }
  for (let i = 0; i < cut.length; i++) {
    if (stopped()) return out;
    const need = cutoutNeed(cut[i], known);
    try {
      out.set(cut[i].id, await ensureCutout(projectId, need, (f) => { if (!stopped()) onProgress((i + f) / cut.length); }));
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      throw new Error(isNoPerson(message) ? CUTOUT_EXPORT.noPerson : `Could not remove a background for the export: ${message}`);
    }
    if (!known.includes(need.name)) known = [...known, need.name];
    if (stopped()) return out;
    onProgress((i + 1) / cut.length);
  }
  return out;
}

/**
 * A clip or layer as the export is sent it when its cut-out copy is `uri` (undefined, or the switch off: `sent` itself).
 * A video: the copy's file — it has the source's timing and sound, so nothing else changes. A photo: a VIDEO clip playing the
 * still movie beside the PNG for the photo's length (what the export's own photo step would have produced, with the see-through
 * background it cannot keep). A MAIN clip: the opacity is capped just under 1, which makes the compositor draw the clip's
 * background behind the see-through picture (its rule for any picture that is not fully opaque).
 */
export function withCutout<T extends ExportClip>(sent: T, clip: Clip, uri: string | undefined, main: boolean): T {
  if (uri === undefined || !activeCutout(clip)) return sent;
  const opacity = main ? Math.min(sent.opacity, CUTOUT.exportOpacity) : sent.opacity;
  if (!isPhoto(clip)) return { ...sent, sourceUri: uri, opacity };
  const seconds = Math.min(sent.trimEnd - sent.trimStart, CUTOUT.stillSeconds);
  return { ...sent, kind: "video", sourceUri: cutoutStillName(uri), trimStart: 0, trimEnd: seconds, speed: 1, reversed: false, muted: true, speedSpans: [], opacity };
}
```

`src/export/useExport.ts`:

1. Imports: add `isCutoutAvailable` to the import from `@/modules/clipy-video`; add `import { CUTOUT_SHARE, prepareCutouts, withCutout } from "./exportCutouts";`.
2. Directly after the block that ends `if (run.stopped) return;\n      }` (the sounds) and before `const audioTracks = …`, insert:

```ts
      // A clip or layer with Remove background is exported from its cut-out copy: same timing, same sound, another file. A copy
      // that is missing is rendered first. Without the tool (a build from before it) nothing can have been switched on there:
      // the clips go out as they are.
      const layersOut = exportableLayers(project, missingSourceUris, total);
      const cutouts = new Map<string, string>();
      if (isCutoutAvailable() && [...clips, ...layersOut].some((c) => c.cutout === true)) {
        const run = { stopped: false };
        preparing.current = run;
        const before = share.current;
        share.current = before + CUTOUT_SHARE;
        try {
          const made = await prepareCutouts(project.id, [...clips, ...layersOut], (f) => setState((s) => (!run.stopped && s.status === "exporting" ? { ...s, progress: before + f * CUTOUT_SHARE } : s)), () => run.stopped);
          made.forEach((uri, id) => cutouts.set(id, uri));
        } catch (e) {
          if (run.stopped) return;   // cancelled meanwhile: there is nothing to say
          throw e;
        } finally { if (preparing.current === run) preparing.current = null; }
        if (run.stopped) return;
      }
```

3. In the `exportTimeline({ … })` call: `clips: clips.map(toExportClip),` becomes `clips: clips.map((c) => withCutout(toExportClip(c), c, cutouts.get(c.id), true)),` and the `layers:` line becomes `layers: layersOut.map((l) => withCutout(toExportLayer(l), l, cutouts.get(l.id), false)),` (its comment stays).
4. In the doc comments of `share` and `preparing`, "preparing changed sounds" becomes "preparing changed sounds and cut-out copies".

**Pinned mocks in `src/export/__tests__/useExport.test.ts`** (so the existing suite loads the new imports; nothing else in that file changes): in its `jest.mock("@/modules/clipy-video", …)` factory add the line `isCutoutAvailable: jest.fn(() => false),`; beside its `jest.mock("@/src/editor/soundRenders", …)` add `jest.mock("@/src/editor/cutoutRenders", () => ({ cutoutDir: () => "", ensureCutout: jest.fn(), isNoPerson: () => false }));`.

- [ ] **Step 4: Run** `npx.cmd jest src/export` → PASS (the PINNED request literal of `useExport.test.ts` is unchanged: no clip there has the switch). Then `npm run typecheck` and `npm test`.
- [ ] **Step 5: Commit** — `feat(export): clips and layers with Remove background go out from their cut-out copies, prepared first; a photo as its still movie`.

---

### Task 13: Swift read-through review, then the ONE EAS build

**Depends on:** Tasks 1–12 merged and green. **This is the single native build of the batch.**

**Files:** Modify only what the review finds, in `modules/clipy-video/ios/BeatEnvelope.swift`, `CutoutRender.swift`, `ClipyVideoModule.swift` and, if a pinned string changes, `beatEnvelope.parity.test.ts` / `cutoutRender.swift.test.ts`.

**Do not touch:** anything else in `src/`; every other Swift file; `eas.json`; `app.json`.

- [ ] **Step 1: The review.** Dispatch an **independent reviewer** (a fresh agent that did not write Task 7 or 12; give it the files, not a verdict): `modules/clipy-video/ios/BeatEnvelope.swift`, `CutoutRender.swift`, `ClipyVideoModule.swift`, `git diff main -- modules/clipy-video/ios`, `MediaPrePass.swift` and `SoundRender.swift` (code of the same kind that compiled), spec §5 and §6, and `node_modules/expo-modules-core/ios` to read the `Record`, `Promise`, `AsyncFunction`, `Function`, `Events` declarations against. It answers each of these, with the line where it is not a clean yes:
  1. **Diff scope.** Does `git diff --stat main -- modules/clipy-video/ios` show only `ClipyVideoModule.swift` and the two new files? Is every existing function of the module byte-for-byte unchanged apart from the `Events(…)` line?
  2. **Redeclarations.** Is any `let` / `var` / `func` / type name declared twice in one scope, or a `static let` beside a `static func` of the same name (`BeatEnvelope`: `envelopeRate`, `windowSeconds`, `compress`, `decodeRate`, `longestSeconds` / `message`, `nextPow2`, `fft`, `run`, `decode`; `CutoutRender`: `context`, `personEvery` / `message`, `evenSize`, `partURL`, `place`, `bgraBuffer`, `coverage`, `cut`, `videoSettings`, `makeWriter`, `cutFrame`, `renderVideo`, `renderPhoto`)? Does any new type name (`BeatEnvelopeRequest`, `BeatError`, `BeatJob`, `EnvelopeBuilder`, `BeatEnvelope`, `CutoutRequest`, `CutoutError`, `CutoutJob`, `CutoutSource`, `CutoutRender`) exist elsewhere in the module? In `renderVideo`, does the local `partURL` collide with the static function `partURL(for:)` (it is called once, qualified, on the line that declares the local)? Inside the two new `AsyncFunction` closures, do `job`, `jobId`, `outputURL`, `answer`, `source`, `lastSent` clash with anything?
  3. **Initialisers.** In `EnvelopeBuilder.init`, is every stored property assigned exactly once and none read through `self` before all are set (the locals `hop`, `size`, `hann` shadow the properties on purpose)? In `CutoutSource.init`?
  4. **Sync / async.** Are `loadTracks(withMediaType:)`, `load(…)`, `Task.sleep`, `finishWriting()` used only with `await` inside `async` functions? Is `BeatEnvelope.decode` free of `await`? Is there an `await` inside the `autoreleasepool` closure (there must not be)? Does a closure passed as `progress` escape (it must not: the parameter is not `@escaping`)?
  5. **Availability (iOS 16.4).** For every Apple symbol the diff adds, what is its availability? Expected at or below 16.4: `VNGeneratePersonSegmentationRequest`, its `qualityLevel` / `outputPixelFormat` / `results` (15.0); `VNSequenceRequestHandler.perform(_:on:)` (11.0); `VNImageRequestHandler(cgImage:options:)`; `AVVideoCodecType.hevcWithAlpha` (13.0); `kVTCompressionPropertyKey_TargetQualityForAlpha` (13.0); `AVAssetWriter.canApply(outputSettings:forMediaType:)`; `AVAssetWriterInput(mediaType:outputSettings:sourceFormatHint:)`; `AVAssetWriterInputPixelBufferAdaptor.pixelBufferPool`; `UTType.png` (14.0); `CIContext.render(_:to:bounds:colorSpace:)`, `createCGImage(_:from:format:colorSpace:)`; `CMAudioFormatDescriptionGetStreamBasicDescription`, `CMBlockBufferCopyDataBytes`; the `async` `load` API (15.0). Is anything newer named?
  6. **Types.** `evenSize` returns `(width: Int, height: Int)` and every use treats them as `Int`; `Int((v * k).rounded()) / 2 * 2` is integer arithmetic; `CGRect(x: 0, y: 0, width: size.width, height: size.height)` with `Int`s; `rect.width / raw.extent.width` are `CGFloat`s; `kVTCompressionPropertyKey_TargetQualityForAlpha as String`; `[String: Any]` everywhere a dictionary is handed to AVFoundation, Core Video or `promise.resolve`; `basic.mFormatFlags & kAudioFormatFlagIsFloat` (both `UInt32`); `OSStatus` against `kCMBlockBufferNoErr`; `CVReturn` against `kCVReturnSuccess`; `pts.seconds` a `Double`; `total - CMTime(value: 1, timescale: 30)`; the tuple returned by `makeWriter` and `cutFrame` and how it is taken apart; `let share: Double = try autoreleasepool { () throws -> Double in … }`.
  7. **Optionals.** `segmentation.results?.first?.pixelBuffer`, `adaptor.pixelBufferPool`, `CGColorSpace(name:)`, `CVPixelBufferGetBaseAddress`, `CGImageSourceCreateWithURL`, `CGImageSourceCreateThumbnailAtIndex`, `CGImageDestinationCreateWithURL`, `context.createCGImage`, `CMSampleBufferGetImageBuffer`, `CMSampleBufferGetFormatDescription`, `CMSampleBufferGetDataBuffer`, `tracks.first`, `ExportSession.fileURL(from:)`, `reader.error` / `writer.error` into `ExportSession.describe(_: Error?)`. No force unwrap anywhere?
  8. **Lifetimes.** What keeps the `AVURLAsset` alive while `BeatEnvelope.decode` reads (the local of `run`, which awaits nothing after calling `decode` and returns its result)? While `renderVideo` reads (`CutoutSource.asset`; who holds the source — the module's `let source` in the Task — until when)? Is the `straight` buffer overwritten before the Core Image render that reads it has run (both renders of a frame are synchronous and happen before the next frame's)?
  9. **Exactly once, and locks.** In each new `AsyncFunction`: can the promise be settled twice or never (trace: a bad output path; a cancel before the first buffer; a cancel in the loop; a reader failure; a writer failure; no person; success)? Is the job removed from its dictionary on every path? Are `BeatJob` / `CutoutJob` flags read and written only under their lock?
  10. **The writer loop.** Can the loop of `renderVideo` spin without sleeping, or wait for ever (both inputs not ready while the writer has failed → the `status` guard; the reader failing mid-way → `copyNextSampleBuffer` returns nil and the status guard after the loop)? Is `markAsFinished` called exactly once per input before `finishWriting`? Is every throwing path inside the `do` covered by the one `catch` that cancels the reader, cancels the writer and removes the part file? Before the `do`: if `startWriting` fails, is the reader cancelled and nothing left on disk?
  11. **Exceptions that cannot be caught.** Is every `AVAssetWriterInput` for the picture made only from settings that passed `canApply`? Is every `add` preceded by `canAdd`? Is `append` only called while `isReadyForMoreMediaData` (the picture: yes, by the loop / the wait; the sound: yes)? Is `startSession` called once, after `startWriting`? Is `endSession` called only in the photo path, before `finishWriting`?
  12. **The mirrored stage.** Compare `EnvelopeBuilder` and `BeatEnvelope.fft` with `onsetEnvelope` and `fft` in `src/editor/model/beatDetect.ts` line by line: the hop, the size, the Hann window, which sample is the oldest in the ring when a frame is computed (`ring[(at + i) % size]` with `at` already advanced), the bit-reversal loop, the butterfly, the flux, frame 0 = 0. Work the first two frames of the spec's §5.2 vector by hand if in doubt.
  13. **Errors.** Does every failure path produce `beats <stage>: …` / `cutout <stage>: …`, with `ExportSession.describe` where an `Error` exists?
  14. **Expo Modules API.** Do `Events("onExportEvent", "onSoundEvent", "onCutoutEvent")`, the two `AsyncFunction` closures `(request: …Request, promise: Promise)` and the two `Function` closures `(jobId: String)` match what `expo-modules-core` declares, the way `renderSound` / `cancelSoundRender` already do? Are `from` and `to` acceptable `@Field` names for a `Record`?
  15. **Imports and linking.** `AVFoundation`, `ExpoModulesCore` in `BeatEnvelope.swift`; `AVFoundation`, `CoreImage`, `CoreVideo`, `ExpoModulesCore`, `ImageIO`, `UniformTypeIdentifiers`, `VideoToolbox`, `Vision` in `CutoutRender.swift`. Does the podspec need a `frameworks` entry for Vision or VideoToolbox (it lists `Speech`; Swift modules link automatically, as AudioToolbox did for the sound tools)? If in doubt, add them to the podspec's list — the one change outside the three Swift files this task may make — and say so.
- [ ] **Step 2: Fix** every finding in the Swift (and a pinned string in the two swift-reading tests when a line they quote changed). Re-run `npx.cmd jest src/editor/model/__tests__/beatEnvelope.parity.test.ts src/editor/model/__tests__/cutoutRender.swift.test.ts src/editor/model/__tests__/soundRender.swift.test.ts src/editor/model/__tests__/speechRender.swift.test.ts src/editor/model/__tests__/layersExport.swift.test.ts src/editor/__tests__/looks.frozen.test.ts`, then `npm run typecheck` and `npm test`. If anything was changed: commit — `fix(native): beats and background — findings of the Swift read-through`. If the reviewer found a design problem (not a slip), stop and report instead of building.
- [ ] **Step 3: The build.** Only now, once: `npx.cmd eas-cli build --profile development --platform ios --non-interactive --no-wait --json`. Note the build id and URL from the JSON. Check it with `npx.cmd eas-cli build:view <id> --json` until it is `FINISHED` or `ERRORED` (about 6–10 minutes; do not start a second build while one is running).
- [ ] **Step 4: If it errored,** read the Xcode log (`npx.cmd eas-cli build:view <id>` gives the log URL), fix exactly what the compiler names, re-run the six suites and the full checks, commit — `fix(native): <what the compiler said>` — and build again. Every extra build is reported with its reason. **No other change rides along.**
- [ ] **Step 5: Hand over.** Give the owner the install link and Part B of the device checklist (spec §12), with one sentence first: after installing, **Accounts** must read "App build: beats and background"; if it does not, the install did not happen. Nothing is committed in this step.

---

### Task 14: Docs, full checks, device checklist

**Depends on:** Tasks 1–13.

**Files:** Modify `README.md`, `AGENTS.md`, `docs/superpowers/specs/2026-10-09-beats-background-design.md`; any file the sweep below names.

**Do not touch:** behaviour. A failing test means a mistake here.

- [ ] **Step 1: Sweep** with the Grep tool (not `sed`) and fix what is found:
  - `git diff --stat main -- modules/clipy-video/ios` shows only `ClipyVideoModule.swift`, `BeatEnvelope.swift` (new) and `CutoutRender.swift` (new); `git diff main -- modules/clipy-video/ios/ExportSession.swift modules/clipy-video/ios/ClipyCompositor.swift modules/clipy-video/ios/MediaPrePass.swift modules/clipy-video/ios/SoundRender.swift` is **empty**.
  - `git diff --stat main -- src/editor/components/PreviewPlayer.tsx src/editor/components/LayerVideo.tsx src/editor/previewHandoff.ts src/editor/timelineScroll.ts src/editor/model/timeline.ts src/editor/model/audioMix.ts src/editor/soundRenders.ts src/editor/soundFiles.ts src/editor/musicBeats.ts scripts assets src/ui src/theme` is **empty**.
  - `git diff --stat main -- src/__tests__` is **empty** (no guard's allow-list grew); `looks.frozen.test.ts`, `beatDetect.test.ts`, `musicBeats.test.ts`, `beats.test.ts`, `ClipFrame.test.tsx`, `LayerStack.test.tsx`, `PreviewTag.test.tsx` and every existing `*.parity.test.ts` are unchanged.
  - `.cutout =`, `cutout: true`, `cutout: false`, `cutout: null` in `src/` outside tests: only `setClipCutout` (ops.ts) and the sanity pass (migrate.ts) write the key. `.cutout` READ outside `types.ts` (`activeCutout`), `ops.ts`, `migrate.ts`, `toolbarContext.ts`, `CutoutSheet.tsx` (the switch's value) and `useExport.ts` (the quick "any?" test): none — everything else asks `activeCutout`.
  - `placeBeats(` / `cutToBeats(` called outside `BeatsSheet.tsx`, `quickEdit.ts`, `beats.ts` and tests: none.
  - `renderCutout(` called outside `cutoutRenders.ts` and tests: none. `beatEnvelope(` called outside `ownBeats.ts` and tests: none. `ensureCutout(` outside `cutoutRenders.ts`, `exportCutouts.ts` and tests: none.
  - `CUTOUT_VERSION` is 1; `beatDetect.ts` has no `import` line.
  - Comments that still say "v19" for the current schema: corrected (not historical test titles).
- [ ] **Step 2: Docs.**
  - `README.md`, section **Audio**, the Beats bullet: Find beats also works for a song from Files, a clip sound or a recording — the phone listens for a few seconds (a spinner), then places the markers; a sound without a clear, steady beat is said to have none; with music in the project it listens to the music; needs the latest build (the built-in tracks do not).
  - `README.md`, the clip / layer tools: a bullet **Cut out (Remove background)** — a switch on a photo, a video clip or a layer; the phone finds the person and prepares a cut-out copy (a photo at once, a video roughly as long as the clip, with a percent); on a layer the person stands over what is beneath, on the main track over the clip's background colour; people only; up to 60 seconds of clip; not for reversed clips; the original is never changed; copies live in the project's `cutout` folder and unused ones are removed when the project is opened; needs the latest build.
  - `README.md`, **First native build — things to check**: add the items of spec §10 as one numbered item, "Beats and background", with the ten sub-points.
  - `AGENTS.md` "This repo":
    - in the **Beats** bullet, replace "the app never runs it" with "the app never runs its first stage" and append: ``Own music: a track that is not bundled is listened to by the phone — `BeatEnvelope.swift` decodes the file and returns the onset envelope, the ONE mirrored stage (`onsetEnvelope` in beatDetect.ts ↔ `EnvelopeBuilder` / `BeatEnvelope.fft`: constants, formulas, the vector of `beatEnvelope.parity.test.ts`); the tempo and the grid stay TypeScript, run in slices by `src/editor/ownBeats.ts` (`coarsePeriod` → `finePeriodSlice` → `beatsFromPeriod`, accepted by `isSteady` with `BEAT_ACCEPT` — the generator's numbers, never two rules). `beatPeriod` / `detectBeats` are compositions of those pieces and must keep giving what they gave (the PROOF block of `beatDetect.slices.test.ts` is never edited to pass). What listening finds is remembered in `useOwnBeats` for the session only — never stored, never written to the project; the markers are still written only by `placeBeats`, from the tap. `beatTrack` listens to a selected non-music bar only when the project has no music. Gate with `isBeatEnvelopeAvailable()`; say `BEATS_BACKGROUND_TOOLS`.``
    - a new bullet after **Sound tools**: ``- Remove background: a clip's `cutout` (schema 20) is optional and ABSENT when off (never false / null / undefined); only `setClipCutout` writes it and everything reads `activeCutout` (on, and not reversed). What a clip is served from is a cut-out COPY in `<project>/cutout/`: `src/editor/model/cutout.ts` names and ranges it (TypeScript only: `cutoutRange` = the trim plus a second each side on whole seconds; a clip uses the smallest known copy that covers its trim, `coveringCopy`; raise `CUTOUT_VERSION` when a number that changes the copy changes) and `cutoutRenders.ts` renders it — one at a time, only after the project has stood still for `CUTOUT_SETTLE_MS`, cancel grace and a deadline that grows with the range, never writing the project; `openCutouts` registers the copies on disk and sweeps the unused when a project is opened. `CutoutRender.swift`: a video's copy is HEVC with alpha in a .mov whose session starts at ZERO with frames at their own source times (so the copy has the source's timeline and trim / speed / curves / keyframes apply unchanged), upright, with the source's sound packets copied; a photo's is a PNG plus a still movie (written first; the PNG's presence means ready); `CutoutSource` holds the `AVURLAsset`; settings go through `canApply`, inputs through `canAdd`; every failure is `cutout <stage>: ` + `ExportSession.describe`; no person is `cutout person:`. The export's Swift knows nothing of it: `prepareCutouts` + `withCutout` (src/export/exportCutouts.ts) send the copy's uri, a photo as a video clip on its still movie, and a MAIN clip with its opacity capped at `CUTOUT.exportOpacity` so the compositor draws the clip's background — never add a cut-out branch to `ExportSession.swift`, `ClipyCompositor.swift` or `MediaPrePass.swift` without a spec. The preview: `LayerStack` hands `LayerVideo` the copy's uri; `ClipFrame` draws a photo's PNG and, for a main video, hides the main picture by opacity (never unmounts it) under a silent `CutoutFollower`; `CUTOUT_PREVIEW` switches the two video previews off (the Preview tag then shows: `cutoutNeedsTag`). Gate with `isCutoutAvailable()`; say `BEATS_BACKGROUND_TOOLS`.``
    - in the **Toolbar** bullet's list of strips nothing changes in wording; add after it: ``Cut out (`cutout`) is a strip; it is not on a reversed clip's bar, and Reverse is not on the bar of a clip whose Remove background is on.``
  - Spec: Status → `Implemented <date> (on-device confirmation by the owner pending)`; add a section **3a. As built** after §3: the commit of each task, the build id(s) and how many builds it took and why, every finding of the Swift read-through and its fix, every deviation the tasks reported (values that changed, tests whose expectations changed — file and title, files outside the plan), and what no test checks (§10 item by item).
- [ ] **Step 3: Full checks.** `npm run typecheck`; `npm test`; `npx.cmd expo-doctor`; `git status --short` shows nothing unexpected; `git diff --stat main` shows **no change** under `ios/`, `android/`, `supabase/`, `src/publish/`, `src/theme/`, `src/ui/`, `package.json`, `app.json`, `eas.json`, `assets/`, `scripts/`.
- [ ] **Step 4: Commit** — `git add` the files changed (explicit paths); `docs: find beats in your own music and remove background as built, README, AGENTS, device checklist`.

---

## Pairwise: what each task hands the next, and what may run side by side

| Pair | Shared file or interface | Producer hands over | Consumer relies on | Side by side? |
|---|---|---|---|---|
| 1 ∥ 2 ∥ 4 | — | 1: `types.ts`, `migrate.ts`, `ops.ts` · 2: `beatDetect.ts`, `beats.ts` · 4: `index.ts`, `buildInfo.ts` | none reads another's new export | **yes** — 2 must not touch `types.ts`; 1 must not touch `beats.ts`; neither touches `index.ts` |
| 1 → 3 | `types.ts` | `Clip.cutout?`, `activeCutout` | `neededCutouts`, the test fixtures (`cutout: true`) | no (3 after 1) |
| 2, 4 → 5 | `beatDetect.ts`, `index.ts` | the pieces and `isSteady`; `beatEnvelope`, `cancelBeatEnvelope`, `isBeatsCancelled` | `ownBeats.ts` | no (5 after both) |
| 4 → 7 | the shapes of `beatEnvelope` | fixed by this plan (Task 4's interfaces = the Swift of Task 7); the parity test compares them | 7 must not edit `index.ts` | no (7 after 4, so the wrapper lines the test quotes exist) |
| 3 ∥ 5 ∥ 7 | — | 3: `cutout.ts` · 5: `ownBeats.ts` · 7: `BeatEnvelope.swift`, the module, one test | nothing in common | **yes** |
| 5 → 6 | `ownBeats.ts` | `foundBeats`, `listenForBeats`, `stopListening`, `useOwnBeats` | `BeatsSheet.tsx` | no (6 after 5) |
| 3, 4 → 8 | `cutout.ts`, `index.ts`, `buildInfo.ts` | the model; `renderCutout`, `cancelCutout`, `addCutoutListener`, `isCutoutAvailable`, `isCutoutCancelled`; `BEATS_BACKGROUND_TOOLS` | `cutoutFiles.ts`, `cutoutRenders.ts` | no (8 after both) |
| 7 → 12 | `ClipyVideoModule.swift` | the module with the beat functions | adds the cut-out functions after `cancelBeatEnvelope`, the job store after `lookupBeatJob`, one more event name | no (12 after 7) |
| 4 ∥ 12 | the shapes of `renderCutout` | fixed by this plan; `cutoutRender.swift.test.ts` compares the record's fields with the wrapper's interface | 12 must not edit `index.ts` | by the order above 4 lands first |
| 6 ∥ 8 ∥ 12 | — | 6: `BeatsSheet.tsx` and its tests · 8: the two cut-out stores, the editor screen · 12: Swift | nothing in common | **yes** |
| 8 → 9 | `cutoutFiles.ts` | `shownCutout`, `useCutoutFiles`, `CutoutFile` | `ClipFrame.tsx`, `LayerStack.tsx`, `PreviewTag.tsx` | no (9 after 8) |
| 1, 8 → 10 | `ops.ts`, `cutoutFiles.ts`, `cutoutRenders.ts` | `setClipCutout`; `cutoutFileOf`, `knownCopies`, `retryCutout`, `isNoPerson` | `CutoutSheet.tsx`; `contextFor` reads `clip.cutout` / `clip.reversed` | no (10 after both) |
| 8 → 11 | `cutoutRenders.ts` | `ensureCutout`, `cutoutDir`, `isNoPerson` | `exportCutouts.ts`, `useExport.ts` | no (11 after 8) |
| 9 ∥ 10 ∥ 11 | — | 9: preview components · 10: toolbar files and the strip · 11: export files | nothing in common (9 and 10 both READ `cutoutFiles.ts`) | **yes** |
| 7, 12 → 13 | the three Swift files | the complete Swift | the review and the one build | no (13 after everything) |
| 1–13 → 14 | docs | — | — | no (last) |

**The two features share only:** `index.ts` / `buildInfo.ts` (Task 4, done first for both), `ClipyVideoModule.swift` (Task 7 then Task 12), the review and the build (Task 13), the docs (Task 14). Beats (Tasks 2, 5, 6, 7) never read a cut-out file and Remove background (Tasks 1, 3, 8–12) never reads a beat.

**Parallel order, with what each may not touch**

1. **Tasks 1, 2, 4** together. 1: only `types.ts`, `migrate.ts`, `ops.ts` and the tests it names. 2: only `beatDetect.ts`, `beats.ts` and its two new tests. 4: only `index.ts`, `index.test.ts`, `buildInfo.ts`, `buildInfo.test.ts` (and a mock line in a test that needs `isCutoutAvailable`).
2. **Tasks 3, 5, 7** together. 3: its two new files. 5: its two new files. 7: `BeatEnvelope.swift`, `ClipyVideoModule.swift`, `beatEnvelope.parity.test.ts`. None starts a build.
3. **Tasks 6, 8, 12** together. 6: `BeatsSheet.tsx`, its new test, three expectations in `BeatsSheet.auto.test.tsx`. 8: `cutoutFiles.ts`, `cutoutRenders.ts`, their test, two lines in `app/editor/[id]/index.tsx`. 12: `CutoutRender.swift`, `ClipyVideoModule.swift`, `cutoutRender.swift.test.ts`, one line in `soundRender.swift.test.ts`. None starts a build.
4. **Tasks 9, 10, 11** together. 9: `ClipFrame.tsx`, `CutoutFollower.tsx`, `LayerStack.tsx`, `PreviewTag.tsx`, its test. 10: `toolbarContext.ts`, `toolGroups.ts`, `toolStrip.ts`, `EditorToolbar.tsx`, `CutoutSheet.tsx`, their tests. 11: `exportCutouts.ts`, `useExport.ts`, their tests.
5. **Task 13** alone: the review, the fixes, **the one build**.
6. **Task 14** alone.

---

## Device checklist (owner)

The checklist is §12 of the spec, in the owner's words. In one line: **Part A works with the app you already have** (both tools are on screen and say they need the new app; nothing else changed). **Part B needs the new app**, installed once from the link sent after the build; the first thing to look at is **Accounts**, which must read "App build: beats and background". The four answers that decide whether a second build is needed are items 16, 20, 24 and 25 (is the person over the video beneath / the colour, or over black, in the preview and in the export).

