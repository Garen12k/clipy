# Stabilize, Smooth slow motion: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A **Stabilize** tool (Off / Low / Medium / High) on a video clip or layer and a **Smooth slow motion** switch in the Speed tool for a slowed clip, each served by a copy of the clip made in the background the way Remove background makes its copies — while every project that exists loads, previews and exports exactly as before and nothing is ever measured, rendered or changed on its own.

**Architecture:** Schema v21 with TWO optional keys, `Clip.stabilize?: "low" | "medium" | "high"` and `Clip.smooth?: true`, resolved only by `steadyOf(clip)` (`src/editor/model/steady.ts`) into ONE copy per clip: `{ level 0–3, grid 0 / 60 / 120 }`. The copy keeps the source's timeline, so the preview and the export only swap the uri and `ExportSession.swift` is untouched. *Stabilize:* native `measureShake` (new `SteadyRender.swift`: Vision translational registration, frame against the frame before) returns numbers; `src/editor/model/steadyPath.ts` (pure TypeScript, **no Swift twin**) turns them into per-frame corrections; native `renderSteady` applies them with a fixed zoom. *Smooth slow motion:* the same `renderSteady` writes the copy on a uniform 60 / 120 grid in source time, the in-between frames cross-dissolved by time. `src/editor/steadyFiles.ts` + `steadyRenders.ts` are a sibling of the cut-out queue; the two share one turn (`src/editor/renderTurn.ts`, moved out of `cutoutRenders.ts`) and one native gate, so one heavy render runs at a time. Remove background and the two new tools exclude each other on a clip.

**Tech Stack:** Expo SDK 57, React Native 0.86, TypeScript strict, Zustand 5, `expo-video`, `expo-file-system`, `@expo/vector-icons` 15 (Ionicons), Jest (`jest-expo`) + RNTL 14.0.1; Swift 5.9 (Expo Modules API, AVFoundation, Vision, Core Image), deployment target iOS 16.4. **No new package, no new asset. One new native build.**

**Spec:** `docs/superpowers/specs/2026-10-10-stabilize-smooth-design.md` (binding; §3 the decisions, §4 schema and the proof, §5 the path maths and its vectors, §6 the native API, numbers and the verified-API table, §8 edge cases, §10 the unverified facts and their fallbacks).

## Global Constraints

- **iPhone only.** No Android or web configuration, files or code paths.
- **Expo Go must keep working, and so must the build installed today.** Everything native is reached through `modules/clipy-video/index.ts`. Both tools are gated by `isSteadyAvailable()` and say `STEADY_TOOLS` where the build is too old; nothing throws "undefined is not a function". `package.json`, `app.json`, `eas.json` and `assets/` are not edited.
- **Nothing existing changes.** A clip without `stabilize` / `smooth` goes through exactly the expressions it does today. Where an existing function is edited, the edit is a branch existing callers do not take. The PROOF tests of this plan (Tasks 1, 4, 11) are written once and never edited to make a change pass. **Unedited and green at every commit:** `cutout.test.ts`, `cutoutRenders.test.ts`, `exportCutouts.test.ts`, `useExport.test.ts`, `useExport.cutout.test.ts`, `cutoutPreview.test.tsx`, `CutoutSheet.test.tsx`, `toolbarContext.cutout.test.ts`, `timeline.stepped.proof.test.ts`, `timeline.smooth.export.test.ts`, `timeline.handles.test.ts`, `ClipFrame.test.tsx`, `LayerStack.test.tsx`, `PreviewTag.test.tsx`, `SpeedSheet.test.tsx`, `SpeedSheet.drag.test.tsx`.
- **Nothing happens on its own.** `stabilize` is written only by `setClipStabilize` from a tile tap, `smooth` only by `setClipSmooth` from the switch (and removed by `setClipCutout` when idle). A render never writes the project, never starts during a drag (the queue waits `STEADY_SETTLE_MS` after the project last moved) and never on load for a project that needs no copy.
- **An optional key is absent, never `undefined`, `null` or `false`, in anything stored.** Tests check with `"stabilize" in clip` / `"smooth" in clip`.
- **Only `src/editor/model/timeline.ts` reads a clip's speed or its curve's steps.** Whether a clip is slowed and how slow is `isSlowed` / `slowestSpeed` there; no other new code compares, multiplies or divides by `clip.speed`.
- **Never edited this batch:** `src/editor/components/PreviewPlayer.tsx`, `LayerVideo.tsx`, `CutoutFollower.tsx`, `src/editor/previewHandoff.ts`, `src/editor/timelineScroll.ts`, `src/editor/model/cutout.ts`, `src/editor/cutoutFiles.ts`, `src/export/exportCutouts.ts`, `src/editor/model/audioMix.ts`, `src/editor/soundRenders.ts`, `modules/clipy-video/ios/ExportSession.swift`, `ClipyCompositor.swift`, `MediaPrePass.swift`, `SpeedSpans.swift`, `CutoutRender.swift`, `Adjust.swift` and every other existing Swift file except `ClipyVideoModule.swift`, `EditorLayout.tsx`, `Timeline.tsx`, `src/ui/*`, `src/theme/*`, `src/editor/__tests__/looks.frozen.test.ts`, every existing `*.parity.test.ts`, the guard tests in `src/__tests__`, anything under `src/publish/` or `supabase/`. `timeline.ts` gains two functions (Task 1) and nothing else; `cutoutRenders.ts` changes only as Task 4 says.
- **Swift rules (there is no Swift toolchain here; the code is checked by reading):** (1) every `AVURLAsset` stays in a stored property for as long as its tracks and readers are used; (2) every failure is a staged message (`steady <stage>: …`) with `ExportSession.describe(error)` wherever an `Error` exists; (3) no name declared twice in one scope, no `static let x` beside `static func x(`; (4) inside an `async` function every call that has both a completion-handler and an `async` form is written with `await`, and no `await` sits inside an `autoreleasepool` closure; (5) no Apple symbol newer than iOS 16.4 (`VNTranslationalImageRegistrationRequest` and its targeted initialisers are 11.0; `VNTrackTranslationalImageRegistrationRequest` is 17.0 and is **not** used); (6) `promise.resolve` gets a typed `[String: Any]`; (7) no force unwrap, no `try!`, no `as!`; (8) output is written to `part-<name>` and moved; (9) every promise is settled exactly once; (10) an Objective-C exception cannot be caught: writer settings go through `canApply(outputSettings:forMediaType:)` and inputs / outputs through `canAdd` before they are used; (11) a Core Image filter goes through `Adjust.filtered`, and a nil result means the step is skipped.
- UI from `src/ui/` and `src/theme/theme.ts` only; **no hex literals**; **spacing from `theme.space` only** (`spacingScale.test.ts`: never add to its allow-table, never rely on its blind spots, so no apostrophe in JSX text and no `*` or `/` in a spacing value); icons are Ionicons outline names; rows have explicit heights (`STRIP.tiles`, `STRIP.slider`); no `flex: 1` for height.
- **Motion rules:** no new animation. No Reanimated, no timers that drive a view, no entering / exiting.
- **One user action = one undo step:** a tap is one `apply`.
- Never seed React state from an effect keyed on a gesture-driven value. Selectors over `useSteadyFiles` return a primitive or a stored entry, never `s.files`.
- RNTL v14: `render` / `fireEvent` / `rerender` are async: always `await`.
- A test that fails after your change because it names a **pinned count, id list, key list, sentence or schema number** listed in your task is updated as the task says. A test that fails for any other reason means a mistake in the change: fix the change.
- Tasks that run side by side share one working tree: a red suite that belongs to a file another task owns is not yours to fix. Never edit a file outside your task's list.
- Windows: PowerShell, no `&&`, `npx.cmd`. **Never run `expo lint`.** **No broad `sed`.** **Never `git stash`.** **`git add` explicit paths only, never `-A` / `.`.** **Do not start or stop a dev server** (one is serving this tree to the owner's phone). Before each commit: `npm run typecheck` and `npm test` green. Commit trailer exactly `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Task order

`(1 ∥ 2 ∥ 3 ∥ 4) → (5 ∥ 6) → 7 → (8 ∥ 9 ∥ 10 ∥ 11) → 12 → 13 → 14`

| Task | Title | Depends on | Parallel-safe with | Native? |
|---|---|---|---|---|
| 1 | Schema v21: `stabilize`, `smooth`, the two ops, `slowestSpeed` / `isSlowed`, the PROOF migration | — | 2, 3, 4 | no |
| 2 | The native wrapper and the build label (`index.ts`, `buildInfo.ts`) | — | 1, 3, 4 | no (JS side) |
| 3 | The camera path (`steadyPath.ts`) | — | 1, 2, 4 | no |
| 4 | The shared turn (`renderTurn.ts`; `cutoutRenders.ts` uses it) — PROOF | — | 1, 2, 3 | no |
| 5 | The steady model (`steady.ts`): what a clip needs, names, ranges, the covering copy | 1 | 6 | no |
| 6 | Swift: `SteadyRender.swift`, the module functions, the swift-reading test | 2 | 5 | **Swift** |
| 7 | The copies: `steadyFiles.ts`, `steadyRenders.ts`, mounted in the editor | 2, 3, 4, 5 | — | no |
| 8 | The preview: `ClipFrame`, `LayerStack`, the Preview tag | 7 | 9, 10, 11 | no |
| 9 | The Stabilize tool: `contextFor`, the strip, the toolbar; Remove background's refusal | 1, 7 | 8, 10, 11 | no |
| 10 | Smooth slow motion: the Slow motion tab of the Speed strip | 1, 7 | 8, 9, 11 | no |
| 11 | The export: `prepareSteady`, the request rewrite — PROOF | 7 | 8, 9, 10 | no |
| 12 | TypeScript review (independent), fixes | 1–11 | — | no |
| 13 | **Swift read-through review, then the ONE EAS build** | 1–12 | — | **the single native build** |
| 14 | Docs, full checks, device checklist | 1–13 | — | no |

**All Swift is in Task 6. Task 13 is the only build.** No task before 13 starts a build.

**What the owner can test before the new build:** after Tasks 9 and 10 both tools are on screen and say they need the latest build (Part A of the checklist, spec §12).

**Files and their one owner:** `types.ts`, `migrate.ts`, `ops.ts`, `timeline.ts` Task 1 · `modules/clipy-video/index.ts`, `buildInfo.ts` Task 2 (**the only writer of `index.ts`**) · `steadyPath.ts` Task 3 · `renderTurn.ts`, `cutoutRenders.ts` Task 4 · `steady.ts` Task 5 · `SteadyRender.swift`, `ClipyVideoModule.swift` Task 6 (**the only writer of `ClipyVideoModule.swift`**) · `steadyFiles.ts`, `steadyRenders.ts`, `app/editor/[id]/index.tsx` Task 7 · `ClipFrame.tsx`, `LayerStack.tsx`, `PreviewTag.tsx` Task 8 · `toolbarContext.ts`, `toolGroups.ts`, `toolStrip.ts`, `EditorToolbar.tsx`, `StabilizeSheet.tsx`, `CutoutSheet.tsx` Task 9 · `SpeedSheet.tsx`, `SmoothSlowSection.tsx` Task 10 · `exportSteady.ts`, `useExport.ts` Task 11.

**Pinned values that change, and who changes them:** schema number 20 → 21 (Task 1: `migrate.test.ts`, the thirteen `types.*.test.ts`, and any other assertion of the CURRENT schema number) · the build label and its mock (Task 2: `buildInfo.test.ts`) · the module's event list (Task 6: `cutoutRender.swift.test.ts` line 133 and `soundRender.swift.test.ts` line 187, the string `Events("onExportEvent", "onSoundEvent", "onCutoutEvent")`) · `TOOL_IDS` 55 → 56, the `CLIP` / `LAYER` lists of `toolbarContext.test.ts`, the label lists of `EditorToolbar.test.tsx` / `EditorToolbar.layers.test.tsx`, the icon map of `icons.test.ts` (Task 9).

---

### Task 1: Schema v21: `stabilize`, `smooth`, the two ops, `slowestSpeed` / `isSlowed`, the PROOF migration

**Depends on:** nothing. **Parallel-safe with:** 2, 3, 4.

**Files:** Create `src/editor/model/__tests__/types.steady.test.ts`, `src/editor/model/__tests__/timeline.slowed.test.ts`. Modify `src/editor/model/types.ts`, `src/editor/model/migrate.ts`, `src/editor/model/ops.ts` (two new ops; one branch in `setClipCutout`), `src/editor/model/timeline.ts` (two new exports, appended after `speedSpans`), `src/editor/model/__tests__/migrate.test.ts` (pinned number + append), and the pinned number in `types.audio.test.ts`, `types.clip.test.ts`, `types.cutout.test.ts`, `types.layers.test.ts`, `types.layers2.test.ts`, `types.look.test.ts`, `types.motion.test.ts`, `types.noise.test.ts`, `types.photo.test.ts`, `types.polish.test.ts`, `types.sound.test.ts`, `types.speed.test.ts`, `types.text.test.ts`.

**Do not touch:** every other existing op (`setClipReversed`, `setClipSpeed`, `setClipSpeedCurve` included); every existing line of `timeline.ts`; `timeline.stepped.proof.test.ts`; every component.

**Interfaces: Produces**

```ts
// src/editor/model/types.ts
export const SCHEMA_VERSION = 21 as const;
export const STABILIZE_IDS: readonly ["low", "medium", "high"];
export type StabilizeId = (typeof STABILIZE_IDS)[number];
export interface Clip { /* … */ stabilize?: StabilizeId; smooth?: true }
// src/editor/model/timeline.ts
export function slowestSpeed(c: Clip): number;   // the lowest speed of speedSpans(c); 1 when none is a number
export const isSlowed: (c: Clip) => boolean;     // a video with slowestSpeed(c) < 1
// src/editor/model/ops.ts
export function setClipStabilize(p: Project, id: string, level: StabilizeId | null): Project;   // same project when refused or unchanged
export function setClipSmooth(p: Project, id: string, on: boolean): Project;                    // same project when refused or unchanged
export function setClipCutout(p: Project, id: string, on: boolean): Project;                    // + refuses a clip with a strength or an ACTIVE smooth; removes an idle smooth key
```

- [ ] **Step 0: Baseline.** `npm run typecheck` and `npm test` are green on the untouched tree. If not, stop and report.
- [ ] **Step 1: Failing tests.**

Create `src/editor/model/__tests__/timeline.slowed.test.ts`:

```ts
import { isSlowed, slowestSpeed } from "../timeline";
import { makeClip, makePhotoClip, SPEED_CURVE_IDS, type Clip } from "../types";

const curved = (trimEnd: number): Clip => ({
  ...makeClip({ id: "c", sourceDuration: 8, trimEnd }),
  speed: 1, speedCurve: { id: SPEED_CURVE_IDS[0], steps: [{ from: 0, speed: 2 }, { from: 4, speed: 0.4 }, { from: 6, speed: 1.5 }] },
});

test("a constant-speed clip: its speed; slowed only under 1×", () => {
  expect(slowestSpeed(makeClip({ id: "a", sourceDuration: 8 }))).toBe(1);
  expect(isSlowed(makeClip({ id: "a", sourceDuration: 8 }))).toBe(false);
  expect(slowestSpeed(makeClip({ id: "a", sourceDuration: 8, speed: 0.5 }))).toBe(0.5);
  expect(isSlowed(makeClip({ id: "a", sourceDuration: 8, speed: 0.5 }))).toBe(true);
  expect(isSlowed(makeClip({ id: "a", sourceDuration: 8, speed: 0.99 }))).toBe(true);
  expect(isSlowed(makeClip({ id: "a", sourceDuration: 8, speed: 2 }))).toBe(false);
});

test("a curve: the slowest span INSIDE the trim decides", () => {
  expect(slowestSpeed(curved(8))).toBe(0.4);
  expect(isSlowed(curved(8))).toBe(true);
  expect(slowestSpeed(curved(3))).toBe(2);            // trimmed before the slow part
  expect(isSlowed(curved(3))).toBe(false);
});

test("total: a photo is never slowed, and a speed that is not a number counts as 1", () => {
  expect(isSlowed(makePhotoClip({ id: "p" }))).toBe(false);
  expect(slowestSpeed({ ...makeClip({ id: "a", sourceDuration: 8 }), speed: NaN })).toBe(1);
});
```

Create `src/editor/model/__tests__/types.steady.test.ts`:

```ts
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-10T10:00:00.000Z" }));
import { migrateProject } from "../migrate";
import { duplicateClip, setClipCutout, setClipSmooth, setClipSpeed, setClipStabilize, splitClipAt } from "../ops";
import { makeClip, makeLayer, makePhotoClip, makeProject, newLayer, SCHEMA_VERSION, STABILIZE_IDS, type Clip } from "../types";

const project = () => makeProject({
  clips: [makeClip({ id: "a", sourceDuration: 8 }), makeClip({ id: "slow", sourceDuration: 8, speed: 0.5 }), makePhotoClip({ id: "ph" }),
    makeClip({ id: "r", sourceDuration: 5, reversed: true, speed: 0.5 }), makeClip({ id: "cut", sourceDuration: 6, speed: 0.5, cutout: true })],
  layers: [makeLayer({ id: "L", sourceDuration: 6, speed: 0.5 })],
});
const item = (p: ReturnType<typeof project>, id: string): Clip => [...p.clips, ...p.layers].find((c) => c.id === id)!;

test("schema is v21; a new clip, photo and layer have neither key", () => {
  expect(SCHEMA_VERSION).toBe(21);
  expect(STABILIZE_IDS).toEqual(["low", "medium", "high"]);
  for (const c of [makeClip({ id: "x", sourceDuration: 3 }), makePhotoClip({ id: "y" }), makeLayer({ id: "z", sourceDuration: 3 })]) {
    expect("stabilize" in c).toBe(false);
    expect("smooth" in c).toBe(false);
  }
});

test("setClipStabilize writes a strength on a clip and a layer, changes it, and null leaves no key", () => {
  const p0 = project();
  for (const id of ["a", "L"]) {
    const on = setClipStabilize(p0, id, "medium");
    expect(item(on, id).stabilize).toBe("medium");
    expect(setClipStabilize(on, id, "medium")).toBe(on);
    expect(item(setClipStabilize(on, id, "high"), id).stabilize).toBe("high");
    const off = setClipStabilize(on, id, null);
    expect("stabilize" in item(off, id)).toBe(false);
    expect({ ...item(off, id) }).toEqual({ ...item(p0, id) });
    expect(setClipStabilize(off, id, null)).toBe(off);
  }
  expect(setClipStabilize(p0, "nope", "low")).toBe(p0);
  expect(setClipStabilize(p0, "a", "extreme" as never)).toBe(p0);
});

test("Stabilize is refused for a photo, a reversed clip and a clip with Remove background", () => {
  const p0 = project();
  for (const id of ["ph", "r", "cut"]) expect(setClipStabilize(p0, id, "low")).toBe(p0);
});

test("setClipSmooth: only on a slowed video that plays forwards and has no cut-out; off leaves no key", () => {
  const p0 = project();
  for (const id of ["a", "ph", "r", "cut"]) expect(setClipSmooth(p0, id, true)).toBe(p0);   // not slowed, a photo, reversed, cut out
  for (const id of ["slow", "L"]) {
    const on = setClipSmooth(p0, id, true);
    expect(item(on, id).smooth).toBe(true);
    expect(setClipSmooth(on, id, true)).toBe(on);
    const off = setClipSmooth(on, id, false);
    expect("smooth" in item(off, id)).toBe(false);
    expect({ ...item(off, id) }).toEqual({ ...item(p0, id) });
    expect(setClipSmooth(off, id, false)).toBe(off);
  }
});

test("a clip sped back up keeps the stored switch, and off is never refused", () => {
  const fast = setClipSpeed(setClipSmooth(project(), "slow", true), "slow", 1.5);
  expect(item(fast, "slow").smooth).toBe(true);
  expect("smooth" in item(setClipSmooth(fast, "slow", false), "slow")).toBe(false);
});

test("Remove background is refused beside a strength or an active Smooth slow motion, and takes an idle switch with it", () => {
  const steady = setClipStabilize(project(), "a", "low");
  expect(setClipCutout(steady, "a", true)).toBe(steady);
  const smooth = setClipSmooth(project(), "slow", true);
  expect(setClipCutout(smooth, "slow", true)).toBe(smooth);
  const idle = setClipSpeed(smooth, "slow", 1);                       // no longer slowed: the switch is idle
  const cut = setClipCutout(idle, "slow", true);
  expect(item(cut, "slow").cutout).toBe(true);
  expect("smooth" in item(cut, "slow")).toBe(false);
});

test("a layer made from a clip, a duplicate and both halves of a split keep the keys", () => {
  const on = setClipSmooth(setClipStabilize(project(), "slow", "high"), "slow", true);
  expect(newLayer(item(on, "slow"), 0)).toMatchObject({ stabilize: "high", smooth: true });
  const cut = splitClipAt(on, 9);                                     // "a" is 8 s long; "slow" starts at 8
  expect(cut.clips.filter((c) => c.stabilize === "high" && c.smooth === true)).toHaveLength(2);
  expect(duplicateClip(on, "slow").clips.filter((c) => c.stabilize === "high")).toHaveLength(2);
});

test("the sanity pass keeps a known strength and exactly true on a forward video without a cut-out, and removes everything else", () => {
  const withKeys = (id: string, keys: Record<string, unknown>, extra: Partial<Clip> = {}) => ({ ...makeClip({ id, sourceDuration: 4, ...extra }), ...keys }) as unknown as Clip;
  const p = migrateProject(makeProject({ clips: [
    withKeys("ok", { stabilize: "low", smooth: true }), withKeys("bad", { stabilize: "off", smooth: 1 }), withKeys("nil", { stabilize: null, smooth: false }),
    withKeys("rev", { stabilize: "high", smooth: true }, { reversed: true }), withKeys("cut", { stabilize: "high", smooth: true, cutout: true }),
    { ...makePhotoClip({ id: "ph" }), stabilize: "low", smooth: true } as unknown as Clip,
  ] }));
  const clip = (id: string) => p.clips.find((c) => c.id === id)!;
  expect(clip("ok")).toMatchObject({ stabilize: "low", smooth: true });
  for (const id of ["bad", "nil", "rev", "cut", "ph"]) { expect("stabilize" in clip(id)).toBe(false); expect("smooth" in clip(id)).toBe(false); }
  expect(clip("cut").cutout).toBe(true);                              // the older setting stays
  expect(migrateProject(p)).toEqual(p);
});
```

Append to `src/editor/model/__tests__/migrate.test.ts` (add to its imports whatever is missing of `setClipChroma`, `setClipCutout`, `setClipSpeed`, `setClipSpeedCurve`, `setPhotoMotion`, `setTrackSound` from `../ops`):

```ts
test("PROOF v20 → v21: the migration changes the number and nothing else — a cut-out, a smooth speed curve, a slowed clip, a green screen, a photo's Motion, a layer, a noise setting, music and beats are kept as stored, and nothing gains a stabilize or smooth key", () => {
  let now = makeProject({
    clips: [makeClip({ id: "a", sourceDuration: 8 }), makePhotoClip({ id: "ph", seconds: 4 }), makeClip({ id: "g", sourceDuration: 6 }), makeClip({ id: "s", sourceDuration: 6 }), makeClip({ id: "c", sourceDuration: 5 })],
    layers: [makeLayer({ id: "L", sourceDuration: 5, start: 1.5 })],
    audioTracks: [makeAudioTrack({ id: "v1", sourceDuration: 6, kind: "voice", start: 3 }), makeAudioTrack({ id: "m1", sourceDuration: 30, trimStart: 2.5, trimEnd: 10 })],
    ducking: true, beatMarkers: [1, 2.5, 9.75],
  });
  now = setTrackSound(now, "v1", { noise: 0.75 });
  now = setClipSpeedCurve(now, "a", "hero", true);                  // a smooth curve: 32 steps
  now = setClipChroma(now, "g", { color: "#00FF00", strength: 0.5 });
  now = setPhotoMotion(now, "ph", { id: "zoomIn", strength: 0.5 });
  now = setClipSpeed(now, "s", 0.5);                                // slowed, as old projects have it: frames repeat
  now = setClipCutout(now, "c", true);
  expect(now.clips[0].speedCurve?.steps).toHaveLength(32);
  expect(migrateProject(now)).toEqual(now);                         // the fixture is a clean v21 project
  const v20 = JSON.parse(JSON.stringify(now)) as { schemaVersion: number };
  v20.schemaVersion = 20;
  const frozen = JSON.stringify(v20);
  const p = migrateProject(v20);
  expect(JSON.stringify(v20)).toBe(frozen);                         // the stored object is not mutated
  expect({ ...p, schemaVersion: 20 }).toEqual(v20);                 // nothing but the number differs from the file
  expect(p.schemaVersion).toBe(21);
  for (const c of [...p.clips, ...p.layers]) { expect("stabilize" in c).toBe(false); expect("smooth" in c).toBe(false); }
  expect(p.clips[4].cutout).toBe(true);
  expect(p.clips[3].speed).toBe(0.5);
  expect(migrateProject(p)).toEqual(p);
});
```

- [ ] **Step 2: Run** `npx.cmd jest src/editor/model/__tests__/types.steady.test.ts src/editor/model/__tests__/timeline.slowed.test.ts src/editor/model/__tests__/migrate.test.ts` → the new tests FAIL (version 20, no ops, no `isSlowed`).
- [ ] **Step 3: Implement.**

`src/editor/model/timeline.ts`, directly after the closing brace of `speedSpans` (nothing above it changes):

```ts
/**
 * The slowest speed any stretch of the clip plays at inside its trim: its constant speed, or the lowest speed of its curve's spans.
 * Total: a speed that is not a number is not counted, and a clip without one that is plays at 1.
 */
export function slowestSpeed(c: Clip): number {
  let slowest = Infinity;
  for (const s of speedSpans(c)) if (Number.isFinite(s.speed) && s.speed < slowest) slowest = s.speed;
  return Number.isFinite(slowest) ? slowest : 1;
}
/** True when any stretch of a video plays below 1× (slow motion: where its frames are shown more than once). Never a photo. */
export const isSlowed = (c: Clip): boolean => c.kind !== "photo" && slowestSpeed(c) < 1 - 1e-9;
```

`src/editor/model/types.ts`:

1. `export const SCHEMA_VERSION = 21 as const;`
2. Directly above `export interface Clip {`:

```ts
/** Stabilize strengths, gentle … strong. What each one means (window, zoom) is `STEADY_LEVELS` in steady.ts. */
export const STABILIZE_IDS = ["low", "medium", "high"] as const;
export type StabilizeId = (typeof STABILIZE_IDS)[number];
```

3. In the `Clip` interface, after the `cutout?` line:

```ts
  stabilize?: StabilizeId;       // Stabilize: ABSENT = off (never null / undefined). Written only by `setClipStabilize`; read it through `steadyOf` (steady.ts)
  smooth?: true;                 // Smooth slow motion: ABSENT = off (never false / null / undefined). Written only by `setClipSmooth`; counts only while the clip is slowed (`steadyOf`)
```

`src/editor/model/migrate.ts`: add `STABILIZE_IDS` to the import from `./types`; in `normaliseClip`, directly after the line `if (cutout) base.cutout = true;`:

```ts
  // v21: Stabilize and Smooth slow motion are optional and ABSENT unless usable — a video that plays forwards and has no cut-out
  // (the older setting stays when a file holds both).
  const steadyOk = kind !== "photo" && !reversed && !cutout;
  const stabilize = steadyOk && (STABILIZE_IDS as readonly unknown[]).includes(c.stabilize) ? c.stabilize : undefined;
  const smooth = steadyOk && c.smooth === true;
  delete base.stabilize;
  delete base.smooth;
  if (stabilize) base.stabilize = stabilize;
  if (smooth) base.smooth = true;
```

In the doc comment of `normaliseCurrent` change `v2–v20 file to a safe v20 shape` to `v2–v21 file to a safe v21 shape` and append to its last sentence: `, and v20 → v21 adds nothing either: a clip's Stabilize strength and Smooth slow motion switch are optional, kept when usable and removed when not.` In `migrateProject` change the comment `v2 → v20` to `v2 → v21`.

`src/editor/model/ops.ts`: add `isSlowed` to the import from `./timeline` and `STABILIZE_IDS`, `type StabilizeId` to the import from `./types`. Replace the body of `setClipCutout` (its signature stays) and add the two ops directly after it:

```ts
/**
 * Remove background on or off for a main clip or a layer (photo or video). On writes `cutout: true`; off removes the key. Refused
 * (same project) for an unknown id, a reversed clip, a value that is already in place, and a clip that has a Stabilize strength or
 * an ACTIVE Smooth slow motion (one copy per clip: the two do not combine). A Smooth slow motion switch that is idle — the clip is
 * not slowed any more, so its switch is not on screen — is removed by the same tap.
 */
export function setClipCutout(p: Project, id: string, on: boolean): Project {
  return updateClip(p, id, (c) => {
    if (on) {
      if (c.cutout === true || c.reversed || c.stabilize !== undefined || (c.smooth === true && isSlowed(c))) return c;
      const next = { ...c, cutout: true as const };
      delete next.smooth;
      return next;
    }
    if (c.cutout === undefined) return c;
    const next = { ...c };
    delete next.cutout;
    return next;
  });
}

/**
 * Stabilize for a video clip or layer: a strength, or null for off (the key is removed). Refused (same project) for an unknown id
 * or strength, a photo, a reversed clip, a clip with Remove background, and a value that is already in place. Off is never refused.
 */
export function setClipStabilize(p: Project, id: string, level: StabilizeId | null): Project {
  if (level !== null && !(STABILIZE_IDS as readonly string[]).includes(level)) return p;
  return updateClip(p, id, (c) => {
    if (level === null) {
      if (c.stabilize === undefined) return c;
      const next = { ...c };
      delete next.stabilize;
      return next;
    }
    return isPhoto(c) || c.reversed || c.cutout === true || c.stabilize === level ? c : { ...c, stabilize: level };
  });
}

/**
 * Smooth slow motion on or off for a video clip or layer. On writes `smooth: true` and is refused (same project) for an unknown id,
 * a photo, a reversed clip, a clip with Remove background, a clip that is not slowed (`isSlowed`) and a value already in place.
 * Off removes the key and is never refused. Changing the speed afterwards never touches the key.
 */
export function setClipSmooth(p: Project, id: string, on: boolean): Project {
  return updateClip(p, id, (c) => {
    if (!on) {
      if (c.smooth === undefined) return c;
      const next = { ...c };
      delete next.smooth;
      return next;
    }
    return isPhoto(c) || c.reversed || c.cutout === true || c.smooth === true || !isSlowed(c) ? c : { ...c, smooth: true as const };
  });
}
```

**Pinned numbers.** In `migrate.test.ts` and the thirteen `types.*.test.ts` listed above, every assertion that the CURRENT schema is 20 (`expect(SCHEMA_VERSION).toBe(20)`, `expect(p.schemaVersion).toBe(20)`, a title "schema is v20") becomes 21. Find them with Grep (`toBe(20)`, `v20`) and edit each by hand; Grep the rest of `src/` for `schemaVersion).toBe(20)` and `SCHEMA_VERSION).toBe(20)` too. A fixture that is **given** an older number stays; in the older PROOF tests only the asserted number of the migrated output becomes 21 (their titles and fixtures untouched).

- [ ] **Step 4: Run** the three suites, then `npx.cmd jest src/editor/model` → PASS, with `types.cutout.test.ts` changed only in its schema number and `timeline.stepped.proof.test.ts` unedited. Then `npm run typecheck` and `npm test`.
- [ ] **Step 5: Commit.**

```
git add src/editor/model/types.ts src/editor/model/migrate.ts src/editor/model/ops.ts src/editor/model/timeline.ts src/editor/model/__tests__/types.steady.test.ts src/editor/model/__tests__/timeline.slowed.test.ts src/editor/model/__tests__/migrate.test.ts <each test file whose pinned number changed>
git commit -m "feat(model): schema v21 — a clip's optional Stabilize strength and Smooth slow motion switch, their two ops, isSlowed, PROOF migration" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The native wrapper and the build label

**Depends on:** nothing. **Parallel-safe with:** 1, 3, 4.

**Files:** Create `modules/clipy-video/__tests__/index.steady.test.ts`. Modify `modules/clipy-video/index.ts`, `src/lib/buildInfo.ts`, `src/lib/__tests__/buildInfo.test.ts`.

**Do not touch:** every existing line of `index.ts` except the `ClipyVideoNative` type (four members added at its end); `modules/clipy-video/__tests__/index.test.ts`; any Swift.

**Interfaces: Produces** (the shapes are binding: Task 6's Swift records are compared with them field by field)

```ts
// modules/clipy-video/index.ts
export interface ShakeRequest { jobId: string; sourceUri: string; from: number; to: number; minFrameGap: number; measureSide: number }
export interface ShakeResult { times: number[]; dx: number[]; dy: number[]; frames: number; failed: number }
export interface SteadyRequest { jobId: string; sourceUri: string; outputPath: string; from: number; to: number; maxSide: number; minFrameGap: number; grid: number; zoom: number; times: number[]; dx: number[]; dy: number[]; bitRate: number; blendFloor: number }
export interface SteadyResult { fileUri: string; seconds: number; frames: number }
export type SteadyEvent = { jobId: string; progress: number };
export const STEADY_CANCELLED = "E_STEADY_CANCELLED";
export function isSteadyAvailable(): boolean;
export function measureShake(req: ShakeRequest): Promise<ShakeResult>;
export function renderSteady(req: SteadyRequest): Promise<SteadyResult>;
export function cancelSteady(jobId: string): void;
export function addSteadyListener(cb: (e: SteadyEvent) => void): EventSubscription;
export function isSteadyCancelled(e: unknown): boolean;
// src/lib/buildInfo.ts
export const STEADY_TOOLS: string;   // NEEDS_LATEST_BUILD("Stabilize and Smooth slow motion")
```

- [ ] **Step 1: Failing tests.**

Create `modules/clipy-video/__tests__/index.steady.test.ts`:

```ts
jest.mock("expo-modules-core", () => {
  const actual = jest.requireActual("expo-modules-core");
  return { ...actual, requireOptionalNativeModule: jest.fn() };
});
import { requireOptionalNativeModule } from "expo-modules-core";
import { addSteadyListener, cancelSteady, isSteadyAvailable, isSteadyCancelled, measureShake, renderSteady, STEADY_CANCELLED, type ShakeRequest, type SteadyRequest } from "../index";

const link = (m: unknown) => jest.mocked(requireOptionalNativeModule).mockReturnValue(m as never);
const shake: ShakeRequest = { jobId: "j", sourceUri: "file:///a.mov", from: 2, to: 12, minFrameGap: 0.008, measureSide: 512 };
const steady: SteadyRequest = { jobId: "j", sourceUri: "file:///a.mov", outputPath: "file:///out.mov", from: 2, to: 12, maxSide: 1920, minFrameGap: 0.008, grid: 60, zoom: 1.1, times: [2], dx: [0], dy: [0], bitRate: 7000000, blendFloor: 0.02 };

beforeEach(() => jest.clearAllMocks());

test("the calls go to the module with the request as it is", async () => {
  const native = {
    measureShake: jest.fn(async () => ({ times: [2], dx: [0], dy: [0], frames: 1, failed: 0 })),
    renderSteady: jest.fn(async () => ({ fileUri: "file:///out.mov", seconds: 12, frames: 600 })),
    cancelSteady: jest.fn(), addListener: jest.fn(() => ({ remove: jest.fn() })),
  };
  link(native);
  expect(isSteadyAvailable()).toBe(true);
  expect(await measureShake(shake)).toEqual({ times: [2], dx: [0], dy: [0], frames: 1, failed: 0 });
  expect(native.measureShake).toHaveBeenCalledWith(shake);
  expect(await renderSteady(steady)).toEqual({ fileUri: "file:///out.mov", seconds: 12, frames: 600 });
  expect(native.renderSteady).toHaveBeenCalledWith(steady);
  cancelSteady("j");
  expect(native.cancelSteady).toHaveBeenCalledWith("j");
  const cb = jest.fn();
  addSteadyListener(cb);
  expect(native.addListener).toHaveBeenCalledWith("onSteadyEvent", cb);
});

test("Expo Go (no module) and an older build (no function): not available, and a call says so instead of crashing", () => {
  link(null);
  expect(isSteadyAvailable()).toBe(false);
  expect(() => renderSteady(steady)).toThrow(/not linked/);
  link({ hello: () => "x", renderCutout: jest.fn() });                 // the build of 2026-10-09
  expect(isSteadyAvailable()).toBe(false);
  expect(() => measureShake(shake)).toThrow("This build of the app cannot do that yet. Install the latest Clipy build.");
  expect(() => renderSteady(steady)).toThrow("This build of the app cannot do that yet. Install the latest Clipy build.");
  expect(() => cancelSteady("j")).toThrow("This build of the app cannot do that yet. Install the latest Clipy build.");
});

test("a cancelled render is told apart by its code", () => {
  expect(STEADY_CANCELLED).toBe("E_STEADY_CANCELLED");
  expect(isSteadyCancelled(Object.assign(new Error("Steady cancelled"), { code: "E_STEADY_CANCELLED" }))).toBe(true);
  expect(isSteadyCancelled(new Error("steady writer: boom"))).toBe(false);
  expect(isSteadyCancelled(null)).toBe(false);
});
```

In `src/lib/__tests__/buildInfo.test.ts`: add `isSteadyAvailable: jest.fn()` to the mock and to the import; give `set` a fifth argument `steady: boolean` that sets it; change the label test to

```ts
test("the label names what the installed app can do, newest ability first", () => {
  set(true, true, true, true, true);
  expect(buildLabel()).toBe("App build: stabilize and smooth");
  set(true, true, true, true, false);
  expect(buildLabel()).toBe("App build: beats and background");
  set(true, true, true, false, false);
  expect(buildLabel()).toBe("App build: noise, ramps and speech");
  set(true, true, false, false, false);
  expect(buildLabel()).toBe("App build: sound tools");
  set(true, false, false, false, false);
  expect(buildLabel()).toBe("App build: export only (older)");
  set(false, false, false, false, false);
  expect(buildLabel()).toBe("Expo Go (no video engine)");
});
```

and add to the sentences test (importing `STEADY_TOOLS`): `expect(STEADY_TOOLS).toBe("Stabilize and Smooth slow motion need the latest Clipy build. Install it from the newest build link.");`

- [ ] **Step 2: Run** `npx.cmd jest modules/clipy-video/__tests__/index.steady.test.ts src/lib/__tests__/buildInfo.test.ts` → FAIL.
- [ ] **Step 3: Implement.**

`modules/clipy-video/index.ts`, directly after the line `export const CUTOUT_CANCELLED = "E_CUTOUT_CANCELLED";` (the interfaces are written one field group per line and closed by a `}` on its own line: Task 6's test reads them that way):

```ts
/** One measuring for Stabilize: the source seconds to read, how close two measured frames may be, and the long side of the picture Vision is shown. */
export interface ShakeRequest {
  jobId: string; sourceUri: string; from: number; to: number;
  minFrameGap: number; measureSide: number;
}
/**
 * Per measured frame, in order: its source second and how far Vision says it must move to sit on the frame before it, as fractions
 * of the picture's width (`dx`) and height (`dy`), exactly as Vision reported them (`steadyShifts` in steadyPath.ts decides what
 * they mean). `failed` = frames Vision could not place (reported as 0, 0).
 */
export interface ShakeResult { times: number[]; dx: number[]; dy: number[]; frames: number; failed: number }
/**
 * One steadied and / or filled copy (the numbers are `STEADY` / `SMOOTH` in src/editor/model/steady.ts): the source range `from` …
 * `to` written to `outputPath`, a .mov with the source's timing and sound. `times` / `dx` / `dy`: the correction of each frame
 * (fractions of the picture; empty = none), `zoom` the fixed zoom. `grid`: 0 = the source's own frames; above 0 = that many frames
 * per source second, the ones in between blended.
 */
export interface SteadyRequest {
  jobId: string; sourceUri: string; outputPath: string; from: number; to: number;
  maxSide: number; minFrameGap: number; grid: number; zoom: number;
  times: number[]; dx: number[]; dy: number[];
  bitRate: number; blendFloor: number;
}
export interface SteadyResult { fileUri: string; seconds: number; frames: number }
export type SteadyEvent = { jobId: string; progress: number };
/** The code a cancelled measuring or steady render rejects with. */
export const STEADY_CANCELLED = "E_STEADY_CANCELLED";
```

At the end of the `ClipyVideoNative` type, after `cancelCutout(jobId: string): void;`:

```ts
  addListener(eventName: "onSteadyEvent", listener: (e: SteadyEvent) => void): EventSubscription;
  measureShake(req: ShakeRequest): Promise<ShakeResult>;
  renderSteady(req: SteadyRequest): Promise<SteadyResult>;
  cancelSteady(jobId: string): void;
```

At the end of the file:

```ts

/** The module for a call that came with the build of 2026-10-10: missing = not linked (Expo Go); present but without the function = an older build. */
function steadyNative(fn: "measureShake" | "renderSteady" | "cancelSteady"): ClipyVideoNative {
  const m = native();
  if (typeof m[fn] !== "function") throw new Error(NOT_IN_BUILD);
  return m;
}
/** Whether the linked native module can stabilize and smooth slow motion: false in Expo Go and in a build made before this. */
export function isSteadyAvailable(): boolean { return typeof optional()?.renderSteady === "function"; }
export function measureShake(req: ShakeRequest): Promise<ShakeResult> { return steadyNative("measureShake").measureShake(req); }
export function renderSteady(req: SteadyRequest): Promise<SteadyResult> { return steadyNative("renderSteady").renderSteady(req); }
export function cancelSteady(jobId: string): void { steadyNative("cancelSteady").cancelSteady(jobId); }
export function addSteadyListener(cb: (e: SteadyEvent) => void): EventSubscription { return native().addListener("onSteadyEvent", cb); }
/** True for the rejection of a measuring or a steady render that was cancelled (`cancelSteady`). */
export function isSteadyCancelled(e: unknown): boolean { return typeof e === "object" && e !== null && (e as { code?: unknown }).code === STEADY_CANCELLED; }
```

`src/lib/buildInfo.ts`: import `isSteadyAvailable` too; put `{ name: "stabilize and smooth", has: isSteadyAvailable },` as the FIRST row of `LEVELS`; at the end:

```ts

/** Said where Stabilize or Smooth slow motion is tapped in Expo Go or in a build from before them. */
export const STEADY_TOOLS = NEEDS_LATEST_BUILD("Stabilize and Smooth slow motion");
```

A suite elsewhere that mocks `@/modules/clipy-video` with a hand-written object AND calls `buildLabel()` now needs `isSteadyAvailable: jest.fn(() => false)` in that mock: add that one line where `npm test` names such a suite (nothing else in it changes).

- [ ] **Step 4: Run** the two suites and `npx.cmd jest modules/clipy-video` → PASS (`index.test.ts` unedited). Then `npm run typecheck` and `npm test`.
- [ ] **Step 5: Commit.**

```
git add modules/clipy-video/index.ts modules/clipy-video/__tests__/index.steady.test.ts src/lib/buildInfo.ts src/lib/__tests__/buildInfo.test.ts
git commit -m "feat(native-wrapper): measureShake and renderSteady behind presence checks; the build label knows \"stabilize and smooth\"" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The camera path (`steadyPath.ts`)

**Depends on:** nothing. **Parallel-safe with:** 1, 2, 4.

**Files:** Create `src/editor/model/steadyPath.ts`, `src/editor/model/__tests__/steadyPath.test.ts`.

**Do not touch:** anything else. The file has **no imports** (it is pure arithmetic; there is no Swift twin and there must never be one: the phone is sent the finished corrections).

**Interfaces: Produces**

```ts
export interface Shake { times: readonly number[]; dx: readonly number[]; dy: readonly number[] }
export interface PathRule { radius: number; zoom: number; cutShift: number; scaleX: number; scaleY: number }
export interface Shifts { times: number[]; dx: number[]; dy: number[] }
export function smoothPath(times: readonly number[], path: readonly number[], radius: number): number[];
export function steadyShifts(shake: Shake, rule: PathRule): Shifts;
```

- [ ] **Step 1: Failing tests.** Create `src/editor/model/__tests__/steadyPath.test.ts`:

```ts
import { smoothPath, steadyShifts, type PathRule, type Shake } from "../steadyPath";

const N = 21;
const times = Array.from({ length: N }, (_, i) => i / 10);
const zeros = (): number[] => new Array<number>(N).fill(0);
const RULE: PathRule = { radius: 0.5, zoom: 1.1, cutShift: 0.2, scaleX: 1, scaleY: 1 };
/** One jolt: the picture jumps 5 % at frame 10 and is back at frame 11. */
const jolt = (): Shake => { const dx = zeros(); dx[10] = 0.05; dx[11] = -0.05; return { times, dx, dy: zeros() }; };
const near = (got: number[], want: number[]) => { expect(got).toHaveLength(want.length); got.forEach((v, i) => expect(v).toBeCloseTo(want[i], 5)); };

test("a steady pan needs no correction at all (the window is centred and symmetric, also at the two ends)", () => {
  const pan: Shake = { times, dx: zeros().map(() => 0.01), dy: zeros().map(() => -0.004) };
  const out = steadyShifts(pan, RULE);
  expect(out.times).toEqual(times);
  near(out.dx, zeros());
  near(out.dy, zeros());
});

test("the spec's vector: one jolt is pulled back, its neighbours give a little", () => {
  const want = zeros();
  want[10] = 0.04; want[9] = want[11] = -0.008; want[8] = want[12] = -0.006; want[7] = want[13] = -0.004; want[6] = want[14] = -0.002;
  const out = steadyShifts(jolt(), RULE);
  near(out.dx, want);
  near(out.dy, zeros());
});

test("a correction never exceeds what the zoom hides: (zoom − 1) / 2 each way", () => {
  expect(steadyShifts(jolt(), { ...RULE, zoom: 1.05 }).dx[10]).toBeCloseTo(0.025, 5);
  expect(steadyShifts(jolt(), { ...RULE, zoom: 1 }).dx.every((v) => v === 0)).toBe(true);
  for (const v of steadyShifts(jolt(), { ...RULE, zoom: 1.02 }).dx) expect(Math.abs(v)).toBeLessThanOrEqual(0.01 + 1e-9);
});

test("scaleX / scaleY turn Vision's numbers: −1 flips a direction, another number rescales", () => {
  expect(steadyShifts(jolt(), { ...RULE, scaleX: -1 }).dx[10]).toBeCloseTo(-0.04, 5);
  expect(steadyShifts(jolt(), { ...RULE, scaleX: 0.5 }).dx[10]).toBeCloseTo(0.02, 5);
  const up: Shake = { times, dx: zeros(), dy: jolt().dx as number[] };
  expect(steadyShifts(up, { ...RULE, scaleY: -1 }).dy[10]).toBeCloseTo(-0.04, 5);
});

test("a step larger than cutShift on either axis is a cut, not shake: it moves nothing", () => {
  const dx = zeros(); dx[10] = 0.5;
  near(steadyShifts({ times, dx, dy: zeros() }, RULE).dx, zeros());
  const dy = zeros(); dy[10] = -0.3;
  const small = zeros(); small[10] = 0.05;                 // the same frame's other axis is dropped with it
  near(steadyShifts({ times, dx: small, dy }, RULE).dx, zeros());
});

test("a wider window pulls harder; radius 0 changes nothing", () => {
  const wide = steadyShifts(jolt(), { ...RULE, radius: 1, zoom: 1.5 }).dx[10];
  const narrow = steadyShifts(jolt(), { ...RULE, radius: 0.2, zoom: 1.5 }).dx[10];
  expect(wide).toBeGreaterThan(narrow);
  near(steadyShifts(jolt(), { ...RULE, radius: 0 }).dx, zeros());
});

test("total: nothing in, nothing out; numbers that are not numbers count as no movement; a time that does not move on is left out; no −0", () => {
  expect(steadyShifts({ times: [], dx: [], dy: [] }, RULE)).toEqual({ times: [], dx: [], dy: [] });
  expect(steadyShifts({ times: [1], dx: [0.3], dy: [0] }, RULE)).toEqual({ times: [1], dx: [0], dy: [0] });
  const odd = steadyShifts({ times: [0, 0.1, 0.1, NaN, 0.2], dx: [0, NaN, 0.01, 0.01, 0], dy: [0, 0, Infinity, 0, 0] }, RULE);
  expect(odd.times).toEqual([0, 0.1, 0.2]);
  for (const v of [...odd.dx, ...odd.dy]) { expect(Number.isFinite(v)).toBe(true); expect(Object.is(v, -0)).toBe(false); }
  expect(steadyShifts({ times, dx: [0.01], dy: [] }, RULE).times).toEqual([]);          // the shortest list decides
});

test("smoothPath by itself: the ends are the path, the middle is its weighted mean", () => {
  expect(smoothPath([], [], 1)).toEqual([]);
  const path = [0, 0, 1, 0, 0];
  const out = smoothPath([0, 1, 2, 3, 4], path, 2);
  expect(out[0]).toBe(0);
  expect(out[4]).toBe(0);
  expect(out[2]).toBeCloseTo(1 / 2, 9);                    // weights 0, 0.5, 1, 0.5, 0
  expect(out[1]).toBeCloseTo(0, 9);                        // r = 1 there: weights 0, 1, 0
});
```

- [ ] **Step 2: Run** `npx.cmd jest src/editor/model/__tests__/steadyPath.test.ts` → FAIL (module missing).
- [ ] **Step 3: Implement.** Create `src/editor/model/steadyPath.ts`:

```ts
// Stabilize: from what the phone measured to what each frame is moved by. Pure arithmetic, TypeScript only — the phone reports
// numbers (`measureShake`) and is sent the finished corrections (`renderSteady`); nothing here is mirrored in Swift, so a wrong
// guess about what Vision's numbers mean is put right in this file (and in `STEADY` in steady.ts), without a new build.

/** Per measured frame, in order: its source second and Vision's step for it — how far the frame must move to sit on the frame before it, as fractions of the picture. */
export interface Shake { times: readonly number[]; dx: readonly number[]; dy: readonly number[] }
/**
 * `radius`: seconds of path each side of a frame that its calm position is averaged over. `zoom`: the copy's fixed zoom — a
 * correction is never larger than what it hides. `cutShift`: a step larger than this (on either axis) is a cut or a failed
 * measurement, not shake. `scaleX` / `scaleY`: what one unit of Vision's step is as a correction — 1 as reported, −1 the other
 * way, another number for another unit.
 */
export interface PathRule { radius: number; zoom: number; cutShift: number; scaleX: number; scaleY: number }
/** Per frame: its source second and the fraction of the picture's width / height it is moved by. */
export interface Shifts { times: number[]; dx: number[]; dy: number[] }

const real = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/**
 * The calm version of a path: at each frame the mean of the path over the frames within `r` seconds of it, nearer ones counting
 * more (weight 1 − distance / r). `r` is `radius`, but never more than the frame's distance to the first or the last frame: the
 * window stays symmetric, so a path that moves steadily (a pan) is its own calm version everywhere, the two ends included.
 * `times` ascend; the shorter of the two lists decides the length.
 */
export function smoothPath(times: readonly number[], path: readonly number[], radius: number): number[] {
  const n = Math.min(times.length, path.length);
  const out: number[] = new Array<number>(n);
  if (n === 0) return [];
  const first = times[0], last = times[n - 1];
  let lo = 0;
  for (let i = 0; i < n; i++) {
    const r = Math.min(real(radius) ? radius : 0, times[i] - first, last - times[i]);
    if (!(r > 0)) { out[i] = path[i]; continue; }
    while (times[lo] < times[i] - r) lo++;                  // the window's start never moves back
    let sum = 0, weight = 0;
    for (let j = lo; j < n && times[j] <= times[i] + r; j++) {
      const w = Math.max(0, 1 - Math.abs(times[j] - times[i]) / r);
      sum += path[j] * w;
      weight += w;
    }
    out[i] = weight > 0 ? sum / weight : path[i];           // the frame itself always weighs 1
  }
  return out;
}

/**
 * The correction of every measured frame. The steps are added up into the path the picture took (a step that is a cut counts as no
 * movement, on both axes); the path is made calm (`smoothPath`); a frame is moved by path − calm path, turned by `scaleX` /
 * `scaleY`, never further than the zoom hides ((zoom − 1) / 2 of the picture each way), to five decimals. A frame whose time is
 * not a number, or not later than the frame before it, is left out. Total: any input gives finite numbers.
 */
export function steadyShifts(shake: Shake, rule: PathRule): Shifts {
  const n = Math.min(shake.times.length, shake.dx.length, shake.dy.length);
  const cut = real(rule.cutShift) && rule.cutShift > 0 ? rule.cutShift : Infinity;
  const times: number[] = [], x: number[] = [], y: number[] = [];
  let atX = 0, atY = 0;
  for (let i = 0; i < n; i++) {
    const t = shake.times[i], stepX = shake.dx[i], stepY = shake.dy[i];
    if (!real(t) || (times.length > 0 && t <= times[times.length - 1])) continue;
    if (real(stepX) && real(stepY) && Math.abs(stepX) <= cut && Math.abs(stepY) <= cut) { atX += stepX; atY += stepY; }
    times.push(t); x.push(atX); y.push(atY);
  }
  const limit = real(rule.zoom) ? Math.max(0, (rule.zoom - 1) / 2) : 0;
  const scaleX = real(rule.scaleX) ? rule.scaleX : 1, scaleY = real(rule.scaleY) ? rule.scaleY : 1;
  const calmX = smoothPath(times, x, rule.radius), calmY = smoothPath(times, y, rule.radius);
  const held = (v: number): number => Math.round(Math.min(limit, Math.max(-limit, v)) * 1e5) / 1e5 || 0;   // `|| 0`: never −0
  return { times, dx: x.map((at, i) => held(scaleX * (at - calmX[i]))), dy: y.map((at, i) => held(scaleY * (at - calmY[i]))) };
}
```

- [ ] **Step 4: Run** `npx.cmd jest src/editor/model/__tests__/steadyPath.test.ts` → PASS. Then `npm run typecheck` and `npm test`.
- [ ] **Step 5: Commit.**

```
git add src/editor/model/steadyPath.ts src/editor/model/__tests__/steadyPath.test.ts
git commit -m "feat(model): the camera path for Stabilize — measured steps into clamped per-frame corrections, TypeScript only" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: The shared turn (`renderTurn.ts`; `cutoutRenders.ts` uses it) — PROOF

**Depends on:** nothing. **Parallel-safe with:** 1, 2, 3.

**Files:** Create `src/editor/renderTurn.ts`, `src/editor/__tests__/renderTurn.test.ts`. Modify `src/editor/cutoutRenders.ts` (the `turn` variable and the body of `inTurn` only).

**Do not touch:** `src/editor/__tests__/cutoutRenders.test.ts` — it is this task's PROOF: it passes **unedited** before and after. Every other line of `cutoutRenders.ts` (`answered`, `cancel`, `ensureCutout`, the pump, the sweep, the hook).

**Interfaces: Produces**

```ts
// src/editor/renderTurn.ts
export interface TurnEntry { cancelled: boolean; giveUp: (() => void) | null }
export function takeTurn(entry: TurnEntry, run: () => Promise<void>, cancelledError: () => Error): Promise<void>;
```

- [ ] **Step 1: Failing test.** Create `src/editor/__tests__/renderTurn.test.ts`:

```ts
import { takeTurn, type TurnEntry } from "../renderTurn";

const entry = (): TurnEntry => ({ cancelled: false, giveUp: null });
const tick = async (n = 20) => { for (let i = 0; i < n; i++) await Promise.resolve(); };
const stopped = (kind: string) => () => Object.assign(new Error(`${kind} cancelled`), { code: kind });
/** A run that stays open until the test ends it. */
function open() {
  let end!: () => void, fail!: (e: unknown) => void;
  const started = jest.fn(() => new Promise<void>((res, rej) => { end = res; fail = rej; }));
  return { started, end: () => end(), fail: (e: unknown) => fail(e) };
}

test("one at a time, whoever asks: the second run starts only when the first is over", async () => {
  const a = open(), b = open();
  const first = takeTurn(entry(), a.started, stopped("cutout"));
  const second = takeTurn(entry(), b.started, stopped("steady"));
  await tick();
  expect(a.started).toHaveBeenCalledTimes(1);
  expect(b.started).not.toHaveBeenCalled();
  a.end();
  await first;
  await tick();
  expect(b.started).toHaveBeenCalledTimes(1);
  b.end();
  await second;
});

test("cancelled while it waits: it answers at once with ITS OWN error, never runs, and passes the turn on", async () => {
  const a = open(), b = open(), c = open();
  const first = takeTurn(entry(), a.started, stopped("cutout"));
  const waiting = entry();
  const second = takeTurn(waiting, b.started, stopped("steady"));
  const third = takeTurn(entry(), c.started, stopped("cutout"));
  await tick();
  waiting.cancelled = true;
  waiting.giveUp?.();
  await expect(second).rejects.toMatchObject({ code: "steady" });
  a.end();
  await first;
  await tick();
  expect(b.started).not.toHaveBeenCalled();
  expect(c.started).toHaveBeenCalledTimes(1);
  c.end();
  await third;
});

test("a run that fails, and one that throws before it returns, still give the turn on", async () => {
  const a = open(), c = open();
  const first = takeTurn(entry(), a.started, stopped("x"));
  const thrower = takeTurn(entry(), () => { throw new Error("boom"); }, stopped("x"));
  const last = takeTurn(entry(), c.started, stopped("x"));
  await tick();
  a.fail(new Error("first failed"));
  await expect(first).rejects.toThrow("first failed");
  await expect(thrower).rejects.toThrow("boom");
  await tick();
  expect(c.started).toHaveBeenCalledTimes(1);
  c.end();
  await last;
});

test("while its run is going, the entry's giveUp belongs to the run (the turn has let go of it)", async () => {
  const a = open();
  const e = entry();
  const first = takeTurn(e, a.started, stopped("x"));
  await tick();
  expect(e.giveUp).toBeNull();
  a.end();
  await first;
});
```

- [ ] **Step 2: Run** `npx.cmd jest src/editor/__tests__/renderTurn.test.ts` → FAIL (module missing). Run `npx.cmd jest src/editor/__tests__/cutoutRenders.test.ts` → PASS (the baseline of the PROOF).
- [ ] **Step 3: Implement.**

Create `src/editor/renderTurn.ts` (the body is `inTurn` of `cutoutRenders.ts`, moved; the one difference is that the error a cancelled wait answers with is the caller's):

```ts
/** What the turn needs of a render: whether it was cancelled, and where a cancel reaches it (`giveUp`, called by the render's own `cancel`). */
export interface TurnEntry { cancelled: boolean; giveUp: (() => void) | null }

/** Settles when the native call before this one is over (it only ever resolves): the turn is free when it has. */
let turn: Promise<void> = Promise.resolve();

/**
 * One heavy native render at a time, whoever asks and whatever it makes (a cut-out copy, a steadied or smoothed copy; the editor's
 * queues, the export): the phone runs one at a time anyway and a second call would WAIT there, with its deadline already running.
 * So `run` (the native call with its deadline) starts only when the call before it is over. A call that is cancelled while it
 * waits answers AT ONCE with `cancelledError()` — its own kind's cancel — and never reaches the phone. The turn is always given
 * on: `run` must always settle, a call that throws counts as over, and a call that was cancelled while waiting passes the turn on
 * the moment it gets it.
 */
export function takeTurn(entry: TurnEntry, run: () => Promise<void>, cancelledError: () => Error): Promise<void> {
  const before = turn;
  let over: () => void = () => {};
  turn = new Promise<void>((resolve) => { over = resolve; });
  return new Promise<void>((resolve, reject) => {
    let waiting = true;
    entry.giveUp = () => {
      if (!waiting) return;
      waiting = false;
      reject(cancelledError());
    };
    void before.then(() => {
      if (!waiting || entry.cancelled) {   // cancelled while it waited: nothing was started
        if (waiting) { waiting = false; reject(cancelledError()); }
        over();
        return;
      }
      waiting = false;
      entry.giveUp = null;
      let running: Promise<void>;
      try { running = run(); } catch (e) { reject(e); over(); return; }
      running.then(resolve, reject).then(over, over);
    });
  });
}
```

`src/editor/cutoutRenders.ts`: add `import { takeTurn } from "./renderTurn";` (after the `./cutoutFiles` import). Delete the two lines

```ts
/** Settles when the native call before this one is over (it only ever resolves): the turn is free when it has. */
let turn: Promise<void> = Promise.resolve();
```

and replace the whole `function inTurn(…) { … }` (its doc comment stays, with one sentence appended: `The turn itself is shared with every other heavy render (renderTurn.ts).`) by

```ts
const inTurn = (entry: Running, run: () => Promise<void>): Promise<void> => takeTurn(entry, run, cancelledError);
```

Nothing else in the file changes: `ensureCutout` still calls `inTurn(entry, …)`.

- [ ] **Step 4: Run** `npx.cmd jest src/editor/__tests__/renderTurn.test.ts src/editor/__tests__/cutoutRenders.test.ts src/export/__tests__/exportCutouts.test.ts src/export/__tests__/useExport.cutout.test.ts` → PASS, and `git diff --stat -- src/editor/__tests__/cutoutRenders.test.ts` is **empty**. Then `npm run typecheck` and `npm test`.
- [ ] **Step 5: Commit.**

```
git add src/editor/renderTurn.ts src/editor/__tests__/renderTurn.test.ts src/editor/cutoutRenders.ts
git commit -m "refactor(editor): the cut-out queue's turn moves to renderTurn.ts so every heavy render can share it (cut-out suite unedited)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The steady model: what a clip needs, names, ranges, the covering copy

**Depends on:** 1. **Parallel-safe with:** 6.

**Files:** Create `src/editor/model/steady.ts`, `src/editor/model/__tests__/steady.test.ts`.

**Do not touch:** `cutout.ts` (it is imported, not edited: `cutoutRange`, `cutoutSize`), `timeline.ts`, `types.ts`.

**Interfaces: Consumes** `cutoutRange`, `cutoutSize` (cutout.ts); `isSlowed`, `slowestSpeed`, `transitionHandles` (timeline.ts); `STABILIZE_IDS`, `StabilizeId`, `isPhoto`, `Clip`, `Project` (types.ts).

**Interfaces: Produces**

```ts
export const STEADY_VERSION = 1;
export const STEADY: { maxSeconds: 60; maxSide: 1920; minFrameGap: 0.008; measureSide: 512; bitsPerPixel: 0.12; blendFloor: 0.02; cutShift: 0.2; scaleX: 1; scaleY: 1; measureShare: 0.4 };
export const STEADY_LEVELS: Record<StabilizeId, { level: number; zoom: number; radius: number }>;
export const SMOOTH: { fullGrid: 60; slowGrid: 120; slowBelow: 0.5 };
export const STEADY_PREVIEW: { layerVideo: boolean; mainVideo: boolean };
export interface SteadySetting { level: number; grid: number }                 // level 0 = no Stabilize, 1–3 = low / medium / high; grid 0 = the source's frames, else frames per source second
export function steadyOf(c: Clip): SteadySetting | null;                       // null = this clip has no copy
export function levelRule(level: number): { zoom: number; radius: number } | null;
export type SteadyRefusal = "tooLong";
export function steadyRefusal(c: Clip): SteadyRefusal | null;
export function steadyFileName(sourceUri: string, setting: SteadySetting, from: number, to: number): string;
export function parseSteadyName(name: string): { stem: string; level: number; grid: number; from: number; to: number } | null;
export function coveringSteady(known: readonly string[], c: Clip, setting: SteadySetting): string | null;
export interface NeededSteady { name: string; sourceUri: string; level: number; grid: number; from: number; to: number; bitRate: number }
export function steadyNeed(c: Clip, known: readonly string[]): NeededSteady | null;
export function neededSteady(p: Project, missing: readonly string[], known: readonly string[]): NeededSteady[];
export function steadyBitRate(width: number, height: number, grid: number): number;
export function steadyBytes(c: Clip, setting: SteadySetting): number;
export function steadyDeadlineMs(n: Pick<NeededSteady, "from" | "to">): { measure: number; render: number };
```

- [ ] **Step 1: Failing tests.** Create `src/editor/model/__tests__/steady.test.ts`:

```ts
import { cutoutFileName } from "../cutout";
import { coveringSteady, levelRule, neededSteady, parseSteadyName, SMOOTH, STEADY, STEADY_LEVELS, STEADY_PREVIEW, STEADY_VERSION, steadyBitRate, steadyBytes, steadyDeadlineMs, steadyFileName, steadyNeed, steadyOf, steadyRefusal } from "../steady";
import { makeClip, makeLayer, makePhotoClip, makeProject, type Clip } from "../types";

const MEDIA = "file:///doc/projects/p1/media";
const clip = (extra: Partial<Clip> = {}): Clip => makeClip({ id: "a", sourceDuration: 30, sourceUri: `${MEDIA}/abc.mov`, trimStart: 4.2, trimEnd: 9.7, width: 1080, height: 1920, ...extra });

test("the numbers", () => {
  expect(STEADY_VERSION).toBe(1);
  expect(STEADY).toEqual({ maxSeconds: 60, maxSide: 1920, minFrameGap: 0.008, measureSide: 512, bitsPerPixel: 0.12, blendFloor: 0.02, cutShift: 0.2, scaleX: 1, scaleY: 1, measureShare: 0.4 });
  expect(STEADY_LEVELS).toEqual({ low: { level: 1, zoom: 1.05, radius: 0.25 }, medium: { level: 2, zoom: 1.1, radius: 0.5 }, high: { level: 3, zoom: 1.15, radius: 1 } });
  expect(SMOOTH).toEqual({ fullGrid: 60, slowGrid: 120, slowBelow: 0.5 });
  expect(STEADY_PREVIEW).toEqual({ layerVideo: true, mainVideo: true });
  expect(levelRule(2)).toEqual({ zoom: 1.1, radius: 0.5 });
  expect(levelRule(0)).toBeNull();
  expect(levelRule(7)).toBeNull();
});

test("steadyOf: one setting for both tools, and null for a clip that has no copy", () => {
  expect(steadyOf(clip())).toBeNull();
  expect(steadyOf(clip({ stabilize: "low" }))).toEqual({ level: 1, grid: 0 });
  expect(steadyOf(clip({ stabilize: "high", speed: 0.5 }))).toEqual({ level: 3, grid: 0 });             // slowed, but the switch is off
  expect(steadyOf(clip({ smooth: true, speed: 0.5 }))).toEqual({ level: 0, grid: 60 });
  expect(steadyOf(clip({ smooth: true, speed: 0.75 }))).toEqual({ level: 0, grid: 60 });
  expect(steadyOf(clip({ smooth: true, speed: 0.45 }))).toEqual({ level: 0, grid: 120 });
  expect(steadyOf(clip({ smooth: true, speed: 0.25, stabilize: "medium" }))).toEqual({ level: 2, grid: 120 });
  expect(steadyOf(clip({ smooth: true, speed: 1 }))).toBeNull();                                         // the switch is idle
  expect(steadyOf(clip({ smooth: true, speed: 2, stabilize: "low" }))).toEqual({ level: 1, grid: 0 });
  expect(steadyOf(clip({ stabilize: "low", reversed: true }))).toBeNull();
  expect(steadyOf(clip({ stabilize: "low", cutout: true }))).toBeNull();
  expect(steadyOf({ ...clip(), stabilize: "extreme" } as unknown as Clip)).toBeNull();
  expect(steadyOf({ ...makePhotoClip({ id: "p" }), stabilize: "low", smooth: true } as Clip)).toBeNull();
});

test("the spec's table: names hold the version, the strength, the grid and the range in milliseconds", () => {
  expect(steadyNeed(clip({ stabilize: "medium" }), [])).toEqual({ name: "abc-s1-2-0-2000-12000.mov", sourceUri: `${MEDIA}/abc.mov`, level: 2, grid: 0, from: 2, to: 12, bitRate: 7464960 });
  expect(steadyNeed(clip({ stabilize: "medium", smooth: true, speed: 0.5 }), [])?.name).toBe("abc-s1-2-60-2000-12000.mov");
  expect(steadyNeed(clip({ smooth: true, speed: 0.25 }), [])?.name).toBe("abc-s1-0-120-2000-12000.mov");
  expect(steadyNeed(clip({ smooth: true }), [])).toBeNull();
  expect(steadyNeed(clip(), [])).toBeNull();
  expect(steadyFileName(`${MEDIA}/abc.mov`, { level: 1, grid: 0 }, 12, 2)).toBe("abc-s1-1-0-2000-12000.mov");      // the two ends are written in order
});

test("a steady copy's stem is the cut-out copy's stem for the same file", () => {
  for (const uri of [`${MEDIA}/abc.mov`, `${MEDIA}/my clip (1).MOV`, `${MEDIA}/part-x.mp4`, `${MEDIA}/${"z".repeat(120)}.mov`]) {
    const stem = cutoutFileName(uri, true).replace(/-c1-photo\.png$/, "");
    expect(steadyFileName(uri, { level: 1, grid: 0 }, 0, 1)).toBe(`${stem}-s1-1-0-0-1000.mov`);
  }
});

test("parseSteadyName reads back exactly what steadyFileName writes, and nothing else", () => {
  expect(parseSteadyName("abc-s1-2-60-2000-12000.mov")).toEqual({ stem: "abc", level: 2, grid: 60, from: 2, to: 12 });
  for (const bad of ["part-abc-s1-2-60-2000-12000.mov", "abc-s2-2-60-2000-12000.mov", "abc-s1-0-0-2000-12000.mov", "abc-s1-4-0-2000-12000.mov", "abc-s1-2-060-2000-12000.mov",
    "abc-s1-2-60-12000-2000.mov", "abc-s1-2-60-2000-2000.mov", "abc-c1-2000-12000.mov", "abc-s1-2-60-2000-12000.mp4", ""]) expect(parseSteadyName(bad)).toBeNull();
});

test("a clip uses the smallest known copy of ITS setting that holds its trim and its transition handles", () => {
  const c = clip({ stabilize: "medium" });
  const own = "abc-s1-2-0-2000-12000.mov", whole = "abc-s1-2-0-0-30000.mov";
  expect(coveringSteady([whole, own], c, { level: 2, grid: 0 })).toBe(own);
  expect(coveringSteady([whole], c, { level: 2, grid: 0 })).toBe(whole);
  expect(coveringSteady(["abc-s1-3-0-2000-12000.mov", "abc-s1-2-60-2000-12000.mov", "xyz-s1-2-0-2000-12000.mov"], c, { level: 2, grid: 0 })).toBeNull();   // another strength, another grid, another file
  expect(steadyNeed(clip({ stabilize: "medium", trimStart: 5, trimEnd: 9 }), [own])?.name).toBe(own);                 // trimmed inwards: the same copy
  expect(steadyNeed(clip({ stabilize: "medium", trimStart: 2, trimEnd: 9 }), [own])?.name).toBe("abc-s1-2-0-0-11000.mov");   // the head handle (0.5 s at 1×) leaves the copy
  expect(steadyNeed(clip({ stabilize: "medium", speed: 4 }), [own])?.name).toBe(own);                                  // 2 s handles: 2.2 – 11.7, still inside
});

test("only a video over 60 seconds of trimmed source is refused; the project's needs leave out what cannot be served", () => {
  expect(steadyRefusal(clip({ stabilize: "low" }))).toBeNull();
  expect(steadyRefusal(makeClip({ id: "l", sourceDuration: 200, stabilize: "low" }))).toBe("tooLong");
  expect(steadyRefusal(makeClip({ id: "l", sourceDuration: 200, trimEnd: 60, stabilize: "low" }))).toBeNull();
  const p = makeProject({
    clips: [clip({ stabilize: "medium" }), clip({ id: "b", stabilize: "medium", trimStart: 5, trimEnd: 9 }), clip({ id: "c" }),
      makeClip({ id: "long", sourceDuration: 200, sourceUri: `${MEDIA}/long.mov`, stabilize: "low" }), makeClip({ id: "gone", sourceDuration: 8, sourceUri: `${MEDIA}/gone.mov`, stabilize: "low" })],
    layers: [makeLayer({ id: "L", sourceDuration: 6, sourceUri: `${MEDIA}/l.mov`, speed: 0.5, smooth: true })],
  });
  expect(neededSteady(p, [`${MEDIA}/gone.mov`], []).map((n) => n.name)).toEqual(["abc-s1-2-0-2000-12000.mov", "abc-s1-2-0-3000-11000.mov", "l-s1-0-60-0-6000.mov"]);
  expect(neededSteady(p, [`${MEDIA}/gone.mov`], ["abc-s1-2-0-2000-12000.mov"]).map((n) => n.name)).toEqual(["abc-s1-2-0-2000-12000.mov", "l-s1-0-60-0-6000.mov"]);
});

test("the bitrate grows with the grid; bytes and deadlines with the range", () => {
  expect(steadyBitRate(1080, 1920, 0)).toBe(7464960);
  expect(steadyBitRate(1080, 1920, 60)).toBe(10450944);
  expect(steadyBitRate(1080, 1920, 120)).toBe(14929920);
  expect(steadyBitRate(2160, 3840, 0)).toBe(7464960);                    // the copy is at most 1920 on its long side
  expect(steadyBitRate(64, 64, 0)).toBe(1000000);
  const c = clip({ trimStart: 0, trimEnd: 10 });                         // a 12-second copy
  expect(steadyBytes(c, { level: 2, grid: 0 })).toBe(11389440);
  expect(steadyBytes(c, { level: 0, grid: 60 })).toBe(15868416);
  expect(steadyBytes(c, { level: 2, grid: 120 })).toBe(22586880);
  expect(steadyDeadlineMs({ from: 2, to: 12 })).toEqual({ measure: 160000, render: 360000 });
  expect(steadyDeadlineMs({ from: 0, to: 64 })).toEqual({ measure: 700000, render: 1980000 });
});
```

- [ ] **Step 2: Run** `npx.cmd jest src/editor/model/__tests__/steady.test.ts` → FAIL (module missing).
- [ ] **Step 3: Implement.** Create `src/editor/model/steady.ts`:

```ts
import { cutoutRange, cutoutSize } from "./cutout";
import { isSlowed, slowestSpeed, transitionHandles } from "./timeline";
import { isPhoto, STABILIZE_IDS, type Clip, type Project, type StabilizeId } from "./types";

/**
 * Stabilize and Smooth slow motion: which copy a clip uses, what it is called and what it covers. One clip, one copy — steadied,
 * filled with in-between frames, or both. TypeScript only: the phone is handed these numbers. Raise STEADY_VERSION when a number
 * that changes the copy changes (a zoom, a window, a grid, the blend): copies rendered from the old numbers are then no longer used.
 */
export const STEADY_VERSION = 1;
/**
 * `maxSeconds`: the longest trimmed source range a clip may have. `maxSide`: the copy's long side, at most. `minFrameGap`: a source
 * frame closer than this to the last kept one is left out (30 and 60 a second stay whole; 240 becomes 120). `measureSide`: the long
 * side of the picture Vision is shown. `bitsPerPixel`: the bitrate, per pixel and frame at 30 a second. `blendFloor`: an in-between
 * frame this close (as a share of the gap) to a source frame IS that frame. `cutShift`: a measured step larger than this share of
 * the picture is a cut, not shake. `scaleX` / `scaleY`: what one unit of Vision's step is as a correction (1 as reported; −1 if a
 * steadied clip shakes MORE on that axis). `measureShare`: the part of the percent that measuring takes.
 */
export const STEADY = { maxSeconds: 60, maxSide: 1920, minFrameGap: 0.008, measureSide: 512, bitsPerPixel: 0.12, blendFloor: 0.02, cutShift: 0.2, scaleX: 1, scaleY: 1, measureShare: 0.4 } as const;
/** What a strength means: its number in a copy's name, the fixed zoom that hides the moving edges, and the seconds of path each side a frame's calm position is averaged over. */
export const STEADY_LEVELS: Record<StabilizeId, { level: number; zoom: number; radius: number }> = {
  low: { level: 1, zoom: 1.05, radius: 0.25 }, medium: { level: 2, zoom: 1.1, radius: 0.5 }, high: { level: 3, zoom: 1.15, radius: 1 },
};
/** Smooth slow motion: frames per SOURCE second of a copy — `fullGrid` when the clip's slowest stretch is `slowBelow` or faster, `slowGrid` when it is slower. */
export const SMOOTH = { fullGrid: 60, slowGrid: 120, slowBelow: 0.5 } as const;
/** Whether the preview shows a steady copy: off = that kind of clip plays its original and the Preview tag shows. */
export const STEADY_PREVIEW = { layerVideo: true, mainVideo: true };

const EPS = 1e-6;
const SAFE_STEM = "[A-Za-z0-9_-]+";
const WHOLE = "(0|[1-9][0-9]{0,15})";
const NAME = new RegExp(`^(${SAFE_STEM})-s${STEADY_VERSION}-([0-3])-(0|[1-9][0-9]{0,2})-${WHOLE}-${WHOLE}\\.mov$`);
const STEM_MAX = 80;
const num = (v: unknown, fallback: number): number => (typeof v === "number" && Number.isFinite(v) ? v : fallback);
/** FNV-1a over the text's UTF-16 units, as eight hex digits (the cut-out copies' check). */
function check(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return ("0000000" + (h >>> 0).toString(16)).slice(-8);
}
/** The source's file name without its extension as one safe path component — the rule of cutout.ts, so a file's copies of both kinds share a stem (`steady.test.ts` compares the two). */
function stemOf(uri: string): string {
  const file = String(uri).split("/").pop() ?? "";
  const raw = file.replace(/\.[A-Za-z0-9]+$/, "");
  const safe = raw.replace(/[^A-Za-z0-9_-]/g, "_").replace(/^part-/, "part_").slice(0, STEM_MAX);
  return safe === raw && safe !== "" ? safe : `${safe === "" ? "file" : safe}-${check(file)}`;
}
/** The source seconds a clip plays, straight from its trim (a copy holds source time; speed is timeline.ts's business). */
function sourceSpan(c: Pick<Clip, "trimStart" | "trimEnd" | "sourceDuration">): { start: number; end: number; length: number } {
  const length = num(c.sourceDuration, 0) > 0 ? c.sourceDuration : Infinity;
  const start = Math.min(Math.max(0, num(c.trimStart, 0)), length);
  const end = Math.min(Math.max(start, num(c.trimEnd, start)), length);
  return { start, end, length };
}

/** `level`: 0 = no Stabilize, 1–3 = low / medium / high. `grid`: 0 = the source's own frames, else frames per source second. Never both 0. */
export interface SteadySetting { level: number; grid: number }
/**
 * What copy a clip has: null for none. A video that plays forwards and has no Remove background, with a Stabilize strength and /
 * or a Smooth slow motion switch that counts — it counts only while the clip is slowed (`isSlowed`), and then the clip's slowest
 * stretch picks the grid. The ONE rule the queue, the preview, the strips and the export go by.
 */
export function steadyOf(c: Clip): SteadySetting | null {
  if (isPhoto(c) || c.reversed || c.cutout === true) return null;
  const level = c.stabilize !== undefined && (STABILIZE_IDS as readonly string[]).includes(c.stabilize) ? STEADY_LEVELS[c.stabilize].level : 0;
  const grid = c.smooth === true && isSlowed(c) ? (slowestSpeed(c) < SMOOTH.slowBelow - 1e-9 ? SMOOTH.slowGrid : SMOOTH.fullGrid) : 0;
  return level === 0 && grid === 0 ? null : { level, grid };
}
/** A strength's zoom and window by its number; null for 0 (no Stabilize) and for a number that is no strength. */
export function levelRule(level: number): { zoom: number; radius: number } | null {
  const found = STABILIZE_IDS.map((id) => STEADY_LEVELS[id]).find((l) => l.level === level);
  return found ? { zoom: found.zoom, radius: found.radius } : null;
}

/** Why a clip cannot have a copy although its setting is on: its trimmed source is longer than `maxSeconds`. */
export type SteadyRefusal = "tooLong";
export function steadyRefusal(c: Clip): SteadyRefusal | null {
  const { start, end } = sourceSpan(c);
  return end - start > STEADY.maxSeconds + EPS ? "tooLong" : null;
}

/** A copy's file name: `abc-s1-2-60-2000-12000.mov` — version, strength, grid, the range in milliseconds (written in order). */
export function steadyFileName(sourceUri: string, setting: SteadySetting, from: number, to: number): string {
  const ms = (seconds: number): number => Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.round(num(seconds, 0) * 1000)));
  const whole = (v: number): number => Math.max(0, Math.round(num(v, 0)));
  const a = ms(from), b = ms(to);
  return `${stemOf(sourceUri)}-s${STEADY_VERSION}-${whole(setting.level)}-${whole(setting.grid)}-${Math.min(a, b)}-${Math.max(a, b)}.mov`;
}
/** What a file name in the steady folder says, or null for anything that is not a finished copy of this version. */
export function parseSteadyName(name: string): { stem: string; level: number; grid: number; from: number; to: number } | null {
  const text = String(name);
  if (text.startsWith("part-")) return null;
  const found = NAME.exec(text);
  if (!found) return null;
  const level = Number(found[2]), grid = Number(found[3]), from = Number(found[4]), to = Number(found[5]);
  if ((level === 0 && grid === 0) || !Number.isSafeInteger(from) || !Number.isSafeInteger(to) || to <= from) return null;
  return { stem: found[1], level, grid, from: from / 1000, to: to / 1000 };
}

/**
 * The known copy this clip can use for `setting`: the SMALLEST copy of its file with exactly that strength and grid whose range
 * holds the clip's trim and the transition handle each side of it (`transitionHandles`; the file's own ends need nothing beyond
 * them) — the rule of the cut-out copies. Of two as long as each other, the earlier. null when there is none.
 */
export function coveringSteady(known: readonly string[], c: Clip, setting: SteadySetting): string | null {
  const stem = stemOf(c.sourceUri);
  const { start, end, length } = sourceSpan(c);
  const handles = transitionHandles(c);
  const first = Math.max(0, start - handles.head);
  const last = Math.min(length, end + handles.tail);
  let best: { name: string; from: number; length: number } | null = null;
  for (const name of known) {
    const copy = parseSteadyName(name);
    if (!copy || copy.stem !== stem || copy.level !== setting.level || copy.grid !== setting.grid || copy.from > first + EPS || copy.to < last - EPS) continue;
    const span = copy.to - copy.from;
    if (best === null || span < best.length || (span === best.length && copy.from < best.from)) best = { name, from: copy.from, length: span };
  }
  return best === null ? null : best.name;
}

/** The copy's video bits per second: by its pixels (at most `maxSide` on the long side), more for a denser grid (in-between frames cost little). */
export function steadyBitRate(width: number, height: number, grid: number): number {
  const size = cutoutSize(width, height, STEADY.maxSide);
  const base = Math.max(1000000, size.width * size.height * 30 * STEADY.bitsPerPixel);
  return Math.round(base * (grid >= SMOOTH.slowGrid ? 2 : grid > 0 ? 1.4 : 1));
}

/** One copy: its file name, the source it is rendered from, what it is and what it holds. */
export interface NeededSteady { name: string; sourceUri: string; level: number; grid: number; from: number; to: number; bitRate: number }
/** The copy a clip uses: a known one that covers it, else the one that would be rendered for it now (the cut-out's range: the trim plus the longest transition handle each side, on whole seconds). null for a clip without a copy. */
export function steadyNeed(c: Clip, known: readonly string[]): NeededSteady | null {
  const setting = steadyOf(c);
  if (setting === null) return null;
  const bitRate = steadyBitRate(c.width, c.height, setting.grid);
  const covering = coveringSteady(known, c, setting);
  const held = covering === null ? null : parseSteadyName(covering);
  if (covering !== null && held !== null) return { name: covering, sourceUri: c.sourceUri, ...setting, from: held.from, to: held.to, bitRate };
  const range = cutoutRange(c);
  return { name: steadyFileName(c.sourceUri, setting, range.from, range.to), sourceUri: c.sourceUri, ...setting, from: range.from, to: range.to, bitRate };
}
/** Every different copy the project needs, main clips first, then layers: for each clip that has a setting, whose file is there and that is not too long. */
export function neededSteady(p: Project, missing: readonly string[], known: readonly string[]): NeededSteady[] {
  const out: NeededSteady[] = [];
  for (const c of [...p.clips, ...p.layers]) {
    if (missing.includes(c.sourceUri) || steadyRefusal(c) !== null) continue;
    const need = steadyNeed(c, known);
    if (need !== null && !out.some((n) => n.name === need.name)) out.push(need);
  }
  return out;
}

/** About how many bytes a new copy of this clip with `setting` takes: the video bitrate plus the sound, over the copy's range. */
export function steadyBytes(c: Clip, setting: SteadySetting): number {
  const { from, to } = cutoutRange(c);
  return Math.round(((steadyBitRate(c.width, c.height, setting.grid) + 128000) * (to - from)) / 8);
}
/** The longest the two halves of one copy may take, each counted from the moment the phone is handed it: a minute plus ten times the range for measuring, a minute plus thirty times for writing. */
export function steadyDeadlineMs(n: Pick<NeededSteady, "from" | "to">): { measure: number; render: number } {
  const length = Math.max(0, num(n.to - n.from, 0));
  return { measure: 60000 + 10000 * length, render: 60000 + 30000 * length };
}
```

- [ ] **Step 4: Run** `npx.cmd jest src/editor/model/__tests__/steady.test.ts src/editor/model/__tests__/cutout.test.ts` → PASS (`cutout.test.ts` unedited). Then `npm run typecheck` and `npm test`.
- [ ] **Step 5: Commit.**

```
git add src/editor/model/steady.ts src/editor/model/__tests__/steady.test.ts
git commit -m "feat(model): the steady copies — one setting per clip for Stabilize and Smooth slow motion, names, the covering copy, sizes" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Swift: `SteadyRender.swift`, the module functions, the swift-reading test

**Depends on:** 2 (the wrapper's interfaces, which the test compares the records with). **Parallel-safe with:** 5. **No build in this task.**

**Files:** Create `modules/clipy-video/ios/SteadyRender.swift`, `src/editor/model/__tests__/steadyRender.swift.test.ts`. Modify `modules/clipy-video/ios/ClipyVideoModule.swift` (a job store after `lookupCutoutJob`; the `Events(…)` line; three functions after `cancelCutout`), and the one pinned string `Events("onExportEvent", "onSoundEvent", "onCutoutEvent")` → `Events("onExportEvent", "onSoundEvent", "onCutoutEvent", "onSteadyEvent")` in `src/editor/model/__tests__/cutoutRender.swift.test.ts` and `src/editor/model/__tests__/soundRender.swift.test.ts`.

**Do not touch:** `modules/clipy-video/index.ts`; `CutoutRender.swift` and every other existing Swift file; every existing function of `ClipyVideoModule.swift`.

**Interfaces: Consumes** (Swift, unedited): `ExportSession.fileURL(from:)`, `.time(_:)`, `.describe(_:)`, `.ciOrientTransform(preferredTransform:naturalSize:)`; `CutoutRender.context`, `.evenSize(width:height:maxSide:)`, `.partFile(for:)`, `.videoSpace()`, `.tag(_:)`, `.takeGate()`, `.leave()`; `Adjust.filtered(_:_:_:)`.

**Interfaces: Produces** native `measureShake(ShakeRequest) → { times, dx, dy, frames, failed }`, `renderSteady(SteadyRequest) → { fileUri, seconds, frames }`, `cancelSteady(jobId)`, event `onSteadyEvent { jobId, progress }` — the shapes of Task 2.

- [ ] **Step 1: Failing tests.** Create `src/editor/model/__tests__/steadyRender.swift.test.ts`:

```ts
import { readFileSync } from "fs";
import { join } from "path";

// There is no Swift compiler on this machine: these tests READ the Swift and pin what the app relies on.
const root = join(__dirname, "../../../..");
const iosDir = join(root, "modules/clipy-video/ios");
const read = (file: string) => readFileSync(join(iosDir, file), "utf8").replace(/\r\n/g, "\n");
const code = (source: string) => source.replace(/\/\/[^\n]*/g, "");
const swift = code(read("SteadyRender.swift"));
const moduleSwift = code(read("ClipyVideoModule.swift"));
const wrapper = readFileSync(join(root, "modules/clipy-video/index.ts"), "utf8").replace(/\r\n/g, "\n");
const between = (source: string, from: string, to: string): string => {
  const start = source.indexOf(from);
  if (start < 0) throw new Error(`"${from}" not found`);
  const end = source.indexOf(to, start + from.length);
  return source.slice(start, end < 0 ? undefined : end);
};
const fieldsOf = (record: string) => [...between(swift, `struct ${record}: Record {`, "\n}").matchAll(/@Field var (\w+)/g)].map((m) => m[1]).sort();
const sentOf = (name: string) => [...new Set([...between(wrapper, `export interface ${name} {`, "\n}").matchAll(/(\w+): /g)].map((m) => m[1]))].sort();
const measure = between(swift, "static func measure(", "\n  }\n");
const render = between(swift, "static func render(", "\n  }\n");

test("the two request records have exactly the fields the app sends", () => {
  expect(fieldsOf("ShakeRequest")).toEqual(sentOf("ShakeRequest"));
  expect(fieldsOf("ShakeRequest")).toEqual(["from", "jobId", "measureSide", "minFrameGap", "sourceUri", "to"]);
  expect(fieldsOf("SteadyRequest")).toEqual(sentOf("SteadyRequest"));
  expect(fieldsOf("SteadyRequest")).toEqual(["bitRate", "blendFloor", "dx", "dy", "from", "grid", "jobId", "maxSide", "minFrameGap", "outputPath", "sourceUri", "times", "to", "zoom"]);
  for (const list of ["times", "dx", "dy"]) expect(swift).toContain(`@Field var ${list}: [Double] = []`);
  expect(wrapper).toContain("export interface ShakeResult { times: number[]; dx: number[]; dy: number[]; frames: number; failed: number }");
  expect(measure).toContain('let answer: [String: Any] = ["times": times, "dx": dx, "dy": dy, "frames": times.count, "failed": failed]');
  expect(wrapper).toContain("export interface SteadyResult { fileUri: string; seconds: number; frames: number }");
  expect(render).toContain('let answer: [String: Any] = ["fileUri": outputURL.absoluteString, "seconds": span.end, "frames": written]');
});

test("the asset lives in the source for as long as its tracks and its readers are used", () => {
  const source = between(swift, "final class SteadySource", "\n}\n");
  expect(source).toContain("let asset: AVURLAsset");
  expect(source).toContain("try await asset.loadTracks(withMediaType: .video)");
  expect(measure).toContain("source: SteadySource");
  expect(measure).toContain("AVAssetReader(asset: source.asset)");
  expect(render).toContain("AVAssetReader(asset: source.asset)");
});

test("measuring: the frame is registered against the frame BEFORE it, with the iOS 11 request, and a failure is no movement", () => {
  expect(measure).toContain("VNTranslationalImageRegistrationRequest(targetedCVPixelBuffer: slots[slot], options: [:], completionHandler: nil)");
  expect(measure).toContain("try handler.perform([registration], on: slots[1 - slot])");
  expect(measure).toContain("Double(found.alignmentTransform.tx) / Double(size.width)");
  expect(measure).toContain("Double(found.alignmentTransform.ty) / Double(size.height)");
  expect(measure).toContain("guard !times.isEmpty else { return (0, 0, true) }");          // the first frame has nothing before it
  expect(measure.split("return (0, 0, false)").length - 1).toBe(3);                         // Vision threw, answered nothing, or a number that is not one
  expect(measure).not.toContain("await");                                                   // one synchronous loop
  expect(swift).not.toContain("VNTrackTranslationalImageRegistrationRequest");              // iOS 17
  expect(swift).not.toContain("VNHomographic");
});

test("writing: HEVC or H.264, only with settings the writer says it can apply, in a QuickTime file moved into place", () => {
  const settings = between(swift, "static func videoSettings(", "\n  }\n");
  expect(settings).toContain("let codecs: [AVVideoCodecType] = [.hevc, .h264]");
  expect(settings).toContain("writer.canApply(outputSettings: settings, forMediaType: .video)");
  expect(swift).toContain("try AVAssetWriter(outputURL: url, fileType: .mov)");
  expect(swift.split("guard writer.canAdd(").length - 1).toBe(2);                           // the picture, the sound
  expect(swift.split("guard reader.canAdd(").length - 1).toBe(2);                           // the picture, the sound
  expect(render).toContain("let partURL = CutoutRender.partFile(for: outputURL)");
  expect(render).toContain("try place(partURL, at: outputURL)");
  expect(render).toContain("try? FileManager.default.removeItem(at: partURL)");
});

test("the copy keeps the source's timeline and its sound", () => {
  expect(render).toContain("writer.startSession(atSourceTime: .zero)");
  expect(render).toContain("writer.endSession(atSourceTime: range.end)");
  expect(render).toContain("guard adaptor.append(out, withPresentationTime: pts) else");                       // a source frame at its own time
  expect(render).toContain("CMTime(seconds: span.start + Double(gridIndex) / grid, preferredTimescale: 6000)"); // a grid frame on the grid
  expect(render).toContain("AVAssetReaderTrackOutput(track: audio, outputSettings: nil)");
  expect(render).toContain("AVAssetWriterInput(mediaType: .audio, outputSettings: nil, sourceFormatHint: source.audioHint)");
  expect(render).toContain("guard writer.status == .writing else");
});

test("a frame is zoomed about its centre and moved by its correction; an in-between frame is a dissolve by time, or the nearer frame", () => {
  const placement = between(swift, "static func placement(", "\n  }\n");
  expect(placement).toContain("CGAffineTransform(translationX: -w / 2, y: -h / 2)");
  expect(placement).toContain("CGAffineTransform(scaleX: z, y: z)");
  expect(placement).toContain("CGAffineTransform(translationX: w / 2 + CGFloat(move.x) * w, y: h / 2 + CGFloat(move.y) * h)");
  expect(render).toContain(".clampedToExtent()");
  expect(render).toContain("weight = min(1, max(0, (at - a.time) / (b.time - a.time)))");
  expect(render).toContain('Adjust.filtered(first, "CIDissolveTransition", ["inputTargetImage": second, "inputTime": NSNumber(value: weight)])');
  const shift = between(swift, "static func shift(", "\n  }\n");
  expect(shift).toContain("abs(times[cursor + 1] - time) <= abs(times[cursor] - time)");   // the entry nearest the frame's time
});

test("one heavy render at a time on the phone: the cut-out's gate, taken while a cancel is still answered", () => {
  const enter = between(swift, "static func enter(", "\n  }\n");
  expect(enter).toContain("if job.isCancelled { throw SteadyError.cancelled }");
  expect(enter).toContain("if CutoutRender.takeGate() { return }");
  for (const fn of ['AsyncFunction("measureShake")', 'AsyncFunction("renderSteady")']) {
    const body = between(moduleSwift, fn, "\n    }\n");
    expect(body).toContain("try await SteadyRender.enter(job)");
    expect(body).toContain("defer { CutoutRender.leave() }");
    expect(body).toContain("defer { self?.dropSteadyJob(jobId, job) }");
    expect(body).toContain('promise.reject("E_STEADY_CANCELLED", "Steady cancelled")');
    expect(body).toContain('promise.reject("E_STEADY", SteadyRender.message(error))');
    expect(body.split("promise.resolve(").length - 1).toBe(1);
    expect(body).toContain('self?.sendEvent("onSteadyEvent", ["jobId": jobId, "progress": fraction])');
  }
});

test("the module knows the event and the cancel; a finished job is only dropped if it is still the stored one", () => {
  expect(moduleSwift).toContain('Events("onExportEvent", "onSoundEvent", "onCutoutEvent", "onSteadyEvent")');
  expect(between(moduleSwift, 'Function("cancelSteady")', "\n    }\n")).toContain("self.lookupSteadyJob(jobId)?.cancel()");
  expect(between(moduleSwift, "private func dropSteadyJob(", "\n  }\n")).toContain("if steadyJobs[id] === job { steadyJobs[id] = nil }");
  expect(wrapper).toContain('addListener("onSteadyEvent", cb)');
});

test("every failure names its stage, and nothing is forced", () => {
  for (const stage of ["steady output: ", "steady source: ", "steady reader: ", "steady measure: ", "steady writer: ", "steady sound: ", "steady render: "]) expect(swift).toContain(`"${stage}`);
  expect(swift).not.toMatch(/try!|as!|\w!\.|\w!\)/);
  expect(read("CutoutRender.swift")).toContain("static func takeGate() -> Bool");          // what this file borrows is still there, unedited
});
```

- [ ] **Step 2: Run** `npx.cmd jest src/editor/model/__tests__/steadyRender.swift.test.ts` → FAIL (no file).
- [ ] **Step 3: Implement.** Create `modules/clipy-video/ios/SteadyRender.swift`:

```swift
import AVFoundation
import CoreImage
import CoreMedia
import CoreVideo
import ExpoModulesCore
import Vision

/// One measuring for Stabilize (`ShakeRequest` in modules/clipy-video/index.ts): the source range `from` … `to` is
/// read once and every kept frame is compared with the frame before it.
struct ShakeRequest: Record {
  @Field var jobId: String = ""
  @Field var sourceUri: String = ""
  @Field var from: Double = 0
  @Field var to: Double = 0
  @Field var minFrameGap: Double = 0.008
  @Field var measureSide: Double = 512
}

/// One steadied and / or filled copy (`SteadyRequest` in modules/clipy-video/index.ts; the numbers are `STEADY` /
/// `SMOOTH` in src/editor/model/steady.ts). The source range goes to `outputPath`, a .mov with the source's timing
/// and its sound. `times` / `dx` / `dy`: each frame's correction (fractions of the picture), worked out by the app
/// (src/editor/model/steadyPath.ts). `grid`: 0 = the source's own frames; above 0 = that many frames per source
/// second, the ones in between blended.
struct SteadyRequest: Record {
  @Field var jobId: String = ""
  @Field var sourceUri: String = ""
  @Field var outputPath: String = ""
  @Field var from: Double = 0
  @Field var to: Double = 0
  @Field var maxSide: Double = 1920
  @Field var minFrameGap: Double = 0.008
  @Field var grid: Double = 0
  @Field var zoom: Double = 1
  @Field var times: [Double] = []
  @Field var dx: [Double] = []
  @Field var dy: [Double] = []
  @Field var bitRate: Double = 8_000_000
  @Field var blendFloor: Double = 0.02
}

enum SteadyError: Error, LocalizedError {
  case cancelled
  case failed(String)
  var errorDescription: String? {
    switch self {
    case .cancelled: return "Steady cancelled"
    case .failed(let text): return text
    }
  }
}

/// A measuring or a steady render while it runs: `cancel()` makes its loop stop at the next pass.
final class SteadyJob: @unchecked Sendable {
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

/// A video file opened for measuring or for a steady render. It HOLDS the asset: `AVAssetTrack.asset` is a weak
/// reference, so the tracks and the readers made from them are only usable while this object lives (the module
/// keeps it for the whole call).
final class SteadySource {
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

  static func open(_ uri: String) async throws -> SteadySource {
    guard let url = ExportSession.fileURL(from: uri) else { throw SteadyError.failed("steady source: not a file path") }
    let asset = AVURLAsset(url: url)
    do {
      guard let video = try await asset.loadTracks(withMediaType: .video).first else {
        throw SteadyError.failed("steady source: this file has no picture")
      }
      let (preferredTransform, naturalSize) = try await video.load(.preferredTransform, .naturalSize)
      let length = try await asset.load(.duration)
      let audio: AVAssetTrack? = try await asset.loadTracks(withMediaType: .audio).first
      // Only a description of SOUND is handed to the writer: an input given another media type's description stops the app.
      var audioHint: CMFormatDescription? = nil
      if let track = audio {
        let described: [CMFormatDescription] = try await track.load(.formatDescriptions)
        if let first = described.first, CMFormatDescriptionGetMediaType(first) == kCMMediaType_Audio {
          audioHint = first
        }
      }
      return SteadySource(asset: asset, video: video, audio: audio, audioHint: audioHint,
                          preferredTransform: preferredTransform, naturalSize: naturalSize,
                          seconds: length.seconds.isFinite ? length.seconds : 0)
    } catch let own as SteadyError {
      throw own
    } catch {
      throw SteadyError.failed("steady source: " + ExportSession.describe(error))
    }
  }
}

/// One corrected source frame held for blending: its source second and which of the two held buffers it is in.
struct SteadyFrame {
  let time: Double
  let slot: Int
}

/// Stabilize and Smooth slow motion, the native part. Nothing here decides a number: what Vision's steps mean, the
/// corrections, the zoom, the grid and the bitrate come from the app. `measure` reports how far each frame moved
/// against the frame before it; `render` writes the frames, moved and zoomed as told, on their own times or on a
/// uniform grid with blended frames in between. All the pixel work is Core Image's, Vision's and the encoder's.
enum SteadyRender {
  /// What a failure says to the app: a SteadyError's own staged text, anything else described in full.
  static func message(_ error: Error) -> String {
    if let own = error as? SteadyError, let text = own.errorDescription { return text }
    return "steady render: " + ExportSession.describe(error)
  }

  /// One heavy render at a time on this phone, cut-outs included: the cut-out's own gate. A second call waits here
  /// for its turn and still answers a cancel while it waits. Every return is paired with one `CutoutRender.leave()`.
  static func enter(_ job: SteadyJob) async throws {
    while true {
      if job.isCancelled { throw SteadyError.cancelled }
      if CutoutRender.takeGate() { return }
      try await Task.sleep(nanoseconds: 50_000_000)
    }
  }

  /// A BGRA pixel buffer Core Image can render into and Vision can read.
  static func bgraBuffer(width: Int, height: Int) throws -> CVPixelBuffer {
    let attrs: [String: Any] = [
      kCVPixelBufferCGImageCompatibilityKey as String: true,
      kCVPixelBufferCGBitmapContextCompatibilityKey as String: true,
      kCVPixelBufferIOSurfacePropertiesKey as String: [String: Any](),
    ]
    var made: CVPixelBuffer? = nil
    guard CVPixelBufferCreate(kCFAllocatorDefault, width, height, kCVPixelFormatType_32BGRA, attrs as CFDictionary, &made) == kCVReturnSuccess,
          let buffer = made else { throw SteadyError.failed("steady render: no picture buffer") }
    return buffer
  }

  /// A buffer from the writer's pool.
  static func poolBuffer(_ pool: CVPixelBufferPool) throws -> CVPixelBuffer {
    var made: CVPixelBuffer? = nil
    guard CVPixelBufferPoolCreatePixelBuffer(kCFAllocatorDefault, pool, &made) == kCVReturnSuccess, let out = made else {
      throw SteadyError.failed("steady writer: no picture buffer")
    }
    return out
  }

  /// The asked source seconds, inside the file.
  static func sourceSpan(from: Double, to: Double, seconds: Double) throws -> (start: Double, end: Double) {
    let start = max(0, min(from.isFinite ? from : 0, seconds))
    let end = min(seconds, to.isFinite && to > start ? to : seconds)
    guard end - start > 0 else { throw SteadyError.failed("steady source: nothing to render") }
    return (start, end)
  }

  /// The picture's size as it is shown (its rotation applied).
  static func shownSize(_ source: SteadySource) throws -> (width: Double, height: Double) {
    let shown = source.naturalSize.applying(source.preferredTransform)
    let width = Double(abs(shown.width))
    let height = Double(abs(shown.height))
    guard width.isFinite, height.isFinite, width >= 1, height >= 1 else {
      throw SteadyError.failed("steady source: this file has no picture")
    }
    return (width, height)
  }

  /// The reader's picture output: decoded 8-bit frames.
  static func pictureOutput(_ reader: AVAssetReader, source: SteadySource) throws -> AVAssetReaderTrackOutput {
    let pictures = AVAssetReaderTrackOutput(track: source.video, outputSettings: [
      kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange,
    ])
    pictures.alwaysCopiesSampleData = false
    guard reader.canAdd(pictures) else { throw SteadyError.failed("steady reader: this picture cannot be decoded") }
    reader.add(pictures)
    return pictures
  }

  /// How far every kept frame of the range moved against the kept frame before it, as Vision reports it: the
  /// transform that aligns THIS frame (the request's targeted image) with the frame before (the handler's image),
  /// its `tx` / `ty` divided by the measured picture's width / height. The first frame reports 0, 0. A frame Vision
  /// cannot place reports 0, 0 and is counted in `failed`: it never fails the measuring. One synchronous loop.
  static func measure(_ request: ShakeRequest, source: SteadySource, job: SteadyJob, progress: (Double) -> Void) throws -> [String: Any] {
    let span = try sourceSpan(from: request.from, to: request.to, seconds: source.seconds)
    let full = try shownSize(source)
    let side = request.measureSide.isFinite && request.measureSide >= 64 ? request.measureSide : 512
    let size = CutoutRender.evenSize(width: full.width, height: full.height, maxSide: side)
    let rect = CGRect(x: 0, y: 0, width: size.width, height: size.height)
    let scale = CGAffineTransform(scaleX: CGFloat(size.width) / CGFloat(full.width), y: CGFloat(size.height) / CGFloat(full.height))
    let upright = ExportSession.ciOrientTransform(preferredTransform: source.preferredTransform, naturalSize: source.naturalSize).concatenating(scale)

    let reader: AVAssetReader
    do {
      reader = try AVAssetReader(asset: source.asset)
    } catch {
      throw SteadyError.failed("steady reader: " + ExportSession.describe(error))
    }
    let pictures = try pictureOutput(reader, source: source)
    reader.timeRange = CMTimeRange(start: ExportSession.time(span.start), end: ExportSession.time(span.end))

    let slots: [CVPixelBuffer] = [try bgraBuffer(width: size.width, height: size.height), try bgraBuffer(width: size.width, height: size.height)]
    let space = CutoutRender.videoSpace()
    let handler = VNSequenceRequestHandler()
    let gap = request.minFrameGap.isFinite && request.minFrameGap > 0 ? request.minFrameGap : 0
    var times: [Double] = []
    var dx: [Double] = []
    var dy: [Double] = []
    var failed = 0
    var slot = 0
    var lastKept = -Double.infinity

    if job.isCancelled { throw SteadyError.cancelled }
    guard reader.startReading() else { throw SteadyError.failed("steady reader: " + ExportSession.describe(reader.error)) }
    while let sample = pictures.copyNextSampleBuffer() {
      if job.isCancelled {
        reader.cancelReading()
        throw SteadyError.cancelled
      }
      let at = CMSampleBufferGetPresentationTimeStamp(sample).seconds
      guard at.isFinite, at >= span.start - 0.0005, at > lastKept, at - lastKept >= gap, let frame = CMSampleBufferGetImageBuffer(sample) else { continue }
      let step: (x: Double, y: Double, ok: Bool) = autoreleasepool { () -> (x: Double, y: Double, ok: Bool) in
        let placed = CIImage(cvPixelBuffer: frame).transformed(by: upright).cropped(to: rect)
        CutoutRender.context.render(placed, to: slots[slot], bounds: rect, colorSpace: space)
        guard !times.isEmpty else { return (0, 0, true) }
        let registration = VNTranslationalImageRegistrationRequest(targetedCVPixelBuffer: slots[slot], options: [:], completionHandler: nil)
        do {
          try handler.perform([registration], on: slots[1 - slot])
        } catch {
          return (0, 0, false)
        }
        guard let found = registration.results?.first else { return (0, 0, false) }
        let x = Double(found.alignmentTransform.tx) / Double(size.width)
        let y = Double(found.alignmentTransform.ty) / Double(size.height)
        guard x.isFinite, y.isFinite else { return (0, 0, false) }
        return (x, y, true)
      }
      if !step.ok { failed += 1 }
      times.append(at)
      dx.append(step.x)
      dy.append(step.y)
      slot = 1 - slot
      lastKept = at
      progress(min(1, max(0, (at - span.start) / (span.end - span.start))))
    }
    guard reader.status == .completed else { throw SteadyError.failed("steady reader: " + ExportSession.describe(reader.error)) }
    guard !times.isEmpty else { throw SteadyError.failed("steady measure: no picture came out") }
    progress(1)
    let answer: [String: Any] = ["times": times, "dx": dx, "dy": dy, "frames": times.count, "failed": failed]
    return answer
  }

  /// Settings the writer says it can apply: HEVC, else H.264. (Settings a writer cannot apply raise an Objective-C
  /// exception when they are used, which Swift cannot catch: they are asked about first.)
  static func videoSettings(width: Int, height: Int, bitRate: Double, writer: AVAssetWriter) throws -> [String: Any] {
    let rate = Int(min(100_000_000, max(1_000_000, bitRate.isFinite ? bitRate : 8_000_000)))
    let compression: [String: Any] = [AVVideoAverageBitRateKey: rate]
    let codecs: [AVVideoCodecType] = [.hevc, .h264]
    for codec in codecs {
      let settings: [String: Any] = [
        AVVideoCodecKey: codec,
        AVVideoWidthKey: width,
        AVVideoHeightKey: height,
        AVVideoCompressionPropertiesKey: compression,
      ]
      if writer.canApply(outputSettings: settings, forMediaType: .video) {
        return settings
      }
    }
    throw SteadyError.failed("steady writer: this iPhone cannot write this video")
  }

  /// A QuickTime writer with one picture input that takes BGRA buffers. Not started.
  static func makeWriter(_ url: URL, width: Int, height: Int, bitRate: Double)
    throws -> (AVAssetWriter, AVAssetWriterInput, AVAssetWriterInputPixelBufferAdaptor) {
    try? FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
    try? FileManager.default.removeItem(at: url)
    let writer: AVAssetWriter
    do {
      writer = try AVAssetWriter(outputURL: url, fileType: .mov)
    } catch {
      throw SteadyError.failed("steady writer: " + ExportSession.describe(error))
    }
    let settings = try videoSettings(width: width, height: height, bitRate: bitRate, writer: writer)
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
      throw SteadyError.failed("steady writer: this iPhone cannot write this video")
    }
    writer.add(input)
    return (writer, input, adaptor)
  }

  /// Moves a finished part file into place; on failure the part file is removed.
  static func place(_ partURL: URL, at outputURL: URL) throws {
    do {
      try? FileManager.default.removeItem(at: outputURL)
      try FileManager.default.moveItem(at: partURL, to: outputURL)
    } catch {
      try? FileManager.default.removeItem(at: partURL)
      throw SteadyError.failed("steady output: " + ExportSession.describe(error))
    }
  }

  /// The correction for a frame at `time`: the entry whose time is nearest, found by walking on from `cursor`
  /// (frames come in order, so the walk never goes back). No entries → no correction.
  static func shift(at time: Double, times: [Double], dx: [Double], dy: [Double], cursor: inout Int) -> (x: Double, y: Double) {
    let count = min(times.count, min(dx.count, dy.count))
    guard count > 0 else { return (0, 0) }
    if cursor < 0 { cursor = 0 }
    if cursor >= count { cursor = count - 1 }
    while cursor + 1 < count, abs(times[cursor + 1] - time) <= abs(times[cursor] - time) { cursor += 1 }
    let x = dx[cursor]
    let y = dy[cursor]
    return (x.isFinite ? x : 0, y.isFinite ? y : 0)
  }

  /// Where a frame goes in the copy: made upright at the copy's size (`upright`), scaled about the copy's centre by
  /// `zoom` (1 … 2), then moved by `move` (fractions of the copy's width and height, in Core Image's coordinates —
  /// the coordinates Vision's steps were reported in).
  static func placement(upright: CGAffineTransform, width: Int, height: Int, zoom: Double, move: (x: Double, y: Double)) -> CGAffineTransform {
    let w = CGFloat(width)
    let h = CGFloat(height)
    let z = CGFloat(zoom.isFinite ? min(2, max(1, zoom)) : 1)
    return upright
      .concatenating(CGAffineTransform(translationX: -w / 2, y: -h / 2))
      .concatenating(CGAffineTransform(scaleX: z, y: z))
      .concatenating(CGAffineTransform(translationX: w / 2 + CGFloat(move.x) * w, y: h / 2 + CGFloat(move.y) * h))
  }

  /// A steady copy. Frames of the asked range are read, placed (`placement`) and written into a session that starts
  /// at zero and ends at the range's end, so the copy has the source's timeline. Without a grid every kept frame is
  /// written at its OWN source time. With a grid a frame is written at `start + k / grid` for every k inside the
  /// range: the kept frame before that moment (`held`) dissolved into the one after it (`ahead`) by time; before the
  /// first frame and after the last, that frame itself. The source's sound packets are copied beside the picture as
  /// they are. The loop serves whichever input is ready and sleeps when neither is.
  static func render(_ request: SteadyRequest, source: SteadySource, to outputURL: URL, job: SteadyJob,
                     progress: (Double) -> Void) async throws -> [String: Any] {
    let span = try sourceSpan(from: request.from, to: request.to, seconds: source.seconds)
    let range = CMTimeRange(start: ExportSession.time(span.start), end: ExportSession.time(span.end))
    let full = try shownSize(source)
    let size = CutoutRender.evenSize(width: full.width, height: full.height, maxSide: request.maxSide)
    let rect = CGRect(x: 0, y: 0, width: size.width, height: size.height)
    let scale = CGAffineTransform(scaleX: CGFloat(size.width) / CGFloat(full.width), y: CGFloat(size.height) / CGFloat(full.height))
    let upright = ExportSession.ciOrientTransform(preferredTransform: source.preferredTransform, naturalSize: source.naturalSize).concatenating(scale)
    let times: [Double] = request.times
    let dx: [Double] = request.dx
    let dy: [Double] = request.dy
    let grid: Double = request.grid.isFinite && request.grid >= 1 ? min(240, request.grid.rounded()) : 0
    let near: Double = request.blendFloor.isFinite ? min(0.49, max(0, request.blendFloor)) : 0.02
    let gap: Double = request.minFrameGap.isFinite && request.minFrameGap > 0 ? request.minFrameGap : 0
    let zoom: Double = request.zoom

    let reader: AVAssetReader
    do {
      reader = try AVAssetReader(asset: source.asset)
    } catch {
      throw SteadyError.failed("steady reader: " + ExportSession.describe(error))
    }
    let pictures = try pictureOutput(reader, source: source)
    var sounds: AVAssetReaderTrackOutput? = nil
    if let audio = source.audio {
      let stored = AVAssetReaderTrackOutput(track: audio, outputSettings: nil)
      stored.alwaysCopiesSampleData = false
      guard reader.canAdd(stored) else { throw SteadyError.failed("steady sound: this clip's sound cannot be copied") }
      reader.add(stored)
      sounds = stored
    }
    reader.timeRange = range

    let slots: [CVPixelBuffer] = [try bgraBuffer(width: size.width, height: size.height), try bgraBuffer(width: size.width, height: size.height)]
    let space = CutoutRender.videoSpace()
    let partURL = CutoutRender.partFile(for: outputURL)
    let (writer, pictureInput, adaptor) = try makeWriter(partURL, width: size.width, height: size.height, bitRate: request.bitRate)
    var soundInput: AVAssetWriterInput? = nil
    if sounds != nil {
      let input = AVAssetWriterInput(mediaType: .audio, outputSettings: nil, sourceFormatHint: source.audioHint)
      input.expectsMediaDataInRealTime = false
      guard writer.canAdd(input) else { throw SteadyError.failed("steady sound: this clip's sound cannot be copied") }
      writer.add(input)
      soundInput = input
    }

    var cursor = 0
    var kept = 0                                   // source frames used
    var written = 0                                // frames in the copy
    var lastKept = -Double.infinity
    var held: SteadyFrame? = nil                   // grid only: the kept frame at or before the next grid moment
    var ahead: SteadyFrame? = nil                  // grid only: the kept frame after `held`
    var sourceDone = false
    var gridIndex = 0
    var picturesDone = false
    var soundsDone = soundInput == nil
    do {
      if job.isCancelled { throw SteadyError.cancelled }
      guard reader.startReading() else { throw SteadyError.failed("steady reader: " + ExportSession.describe(reader.error)) }
      guard writer.startWriting() else { throw SteadyError.failed("steady writer: " + ExportSession.describe(writer.error)) }
      writer.startSession(atSourceTime: .zero)
      guard let pool = adaptor.pixelBufferPool else { throw SteadyError.failed("steady writer: no picture buffer") }
      while !picturesDone || !soundsDone {
        if job.isCancelled { throw SteadyError.cancelled }
        guard writer.status == .writing else { throw SteadyError.failed("steady writer: " + ExportSession.describe(writer.error)) }
        var worked = false
        if !picturesDone, pictureInput.isReadyForMoreMediaData {
          worked = true
          if grid == 0 || (ahead == nil && !sourceDone) {
            // The next source frame: written at once (no grid), or held for the grid frames around it.
            if let sample = pictures.copyNextSampleBuffer() {
              let pts = CMSampleBufferGetPresentationTimeStamp(sample)
              let at = pts.seconds
              if at.isFinite, at >= span.start - 0.0005, at > lastKept, at - lastKept >= gap, let frame = CMSampleBufferGetImageBuffer(sample) {
                let move = shift(at: at, times: times, dx: dx, dy: dy, cursor: &cursor)
                let spot = placement(upright: upright, width: size.width, height: size.height, zoom: zoom, move: move)
                if grid == 0 {
                  try autoreleasepool { () throws -> Void in
                    // The edge pixels are repeated outwards first, so a rounding sliver at the rim is never black.
                    let placed = CIImage(cvPixelBuffer: frame).clampedToExtent().transformed(by: spot).cropped(to: rect)
                    let out = try poolBuffer(pool)
                    CutoutRender.context.render(placed, to: out, bounds: rect, colorSpace: space)
                    CutoutRender.tag(out)
                    guard adaptor.append(out, withPresentationTime: pts) else {
                      throw SteadyError.failed("steady writer: " + ExportSession.describe(writer.error))
                    }
                  }
                  written += 1
                  progress(min(1, max(0, (at - span.start) / (span.end - span.start))))
                } else {
                  var into = 0
                  if let before = held { into = 1 - before.slot }
                  autoreleasepool {
                    let placed = CIImage(cvPixelBuffer: frame).clampedToExtent().transformed(by: spot).cropped(to: rect)
                    CutoutRender.context.render(placed, to: slots[into], bounds: rect, colorSpace: space)
                  }
                  let made = SteadyFrame(time: at, slot: into)
                  if held == nil { held = made } else { ahead = made }
                }
                kept += 1
                lastKept = at
              }
            } else {
              sourceDone = true
              if grid == 0 {
                picturesDone = true
                pictureInput.markAsFinished()
              }
            }
          } else if let a = held {
            // One grid frame — or one step on to the next pair of source frames.
            let at = span.start + Double(gridIndex) / grid
            if at >= span.end - 0.0005 {
              picturesDone = true
              pictureInput.markAsFinished()
            } else if let b = ahead, at >= b.time {
              held = b
              ahead = nil
            } else {
              var weight = 0.0
              if let b = ahead, b.time > a.time { weight = min(1, max(0, (at - a.time) / (b.time - a.time))) }
              let stamp = CMTime(seconds: span.start + Double(gridIndex) / grid, preferredTimescale: 6000)
              try autoreleasepool { () throws -> Void in
                // The held buffers are read back as what they were written as (they carry no colour tag of their own).
                let first = CIImage(cvPixelBuffer: slots[a.slot], options: [CIImageOption.colorSpace: space])
                var image = first
                if let b = ahead, weight > near {
                  let second = CIImage(cvPixelBuffer: slots[b.slot], options: [CIImageOption.colorSpace: space])
                  if weight >= 1 - near {
                    image = second
                  } else if let mixed = Adjust.filtered(first, "CIDissolveTransition", ["inputTargetImage": second, "inputTime": NSNumber(value: weight)]) {
                    image = mixed.cropped(to: rect)
                  } else if weight >= 0.5 {
                    image = second                 // no dissolve on this iPhone: the nearer frame
                  }
                }
                let out = try poolBuffer(pool)
                CutoutRender.context.render(image, to: out, bounds: rect, colorSpace: space)
                CutoutRender.tag(out)
                guard adaptor.append(out, withPresentationTime: stamp) else {
                  throw SteadyError.failed("steady writer: " + ExportSession.describe(writer.error))
                }
              }
              written += 1
              gridIndex += 1
              progress(min(1, max(0, (at - span.start) / (span.end - span.start))))
            }
          } else {
            // A grid, the source is at its end and no frame was kept: nothing to write.
            picturesDone = true
            pictureInput.markAsFinished()
          }
        }
        if !soundsDone, let soundInput, let sounds, soundInput.isReadyForMoreMediaData {
          worked = true
          if let packet = sounds.copyNextSampleBuffer() {
            // A buffer without samples is a marker, not sound: nothing to copy.
            if CMSampleBufferGetNumSamples(packet) > 0 {
              guard soundInput.append(packet) else { throw SteadyError.failed("steady sound: " + ExportSession.describe(writer.error)) }
            }
          } else {
            soundsDone = true
            soundInput.markAsFinished()
          }
        }
        if !worked { try await Task.sleep(nanoseconds: 2_000_000) }
      }
      // With a grid the picture can be finished before the reader has handed out its last frame (the range's end is
      // reached first): the reader is then still reading, which is not a failure.
      guard reader.status == .completed || (grid > 0 && reader.status == .reading) else {
        throw SteadyError.failed("steady reader: " + ExportSession.describe(reader.error))
      }
      guard kept > 0, written > 0 else { throw SteadyError.failed("steady render: no picture came out") }
      if job.isCancelled { throw SteadyError.cancelled }
      // The last append can fail the writer after the loop's own check: never end a session on a writer that is not writing.
      guard writer.status == .writing else { throw SteadyError.failed("steady writer: " + ExportSession.describe(writer.error)) }
      if reader.status == .reading { reader.cancelReading() }
      writer.endSession(atSourceTime: range.end)
      await writer.finishWriting()
      guard writer.status == .completed else { throw SteadyError.failed("steady writer: " + ExportSession.describe(writer.error)) }
      try place(partURL, at: outputURL)
    } catch {
      if reader.status == .reading { reader.cancelReading() }
      if writer.status == .writing { writer.cancelWriting() }
      try? FileManager.default.removeItem(at: partURL)
      throw error
    }
    progress(1)
    let answer: [String: Any] = ["fileUri": outputURL.absoluteString, "seconds": span.end, "frames": written]
    return answer
  }
}
```

`modules/clipy-video/ios/ClipyVideoModule.swift`:

1. Directly after the closing brace of `lookupCutoutJob`:

```swift

  private let steadyLock = NSLock()
  private var steadyJobs: [String: SteadyJob] = [:]   // guarded by `steadyLock`; one entry per measuring or render that has not answered yet

  private func storeSteadyJob(_ id: String, _ job: SteadyJob) {
    steadyLock.lock(); defer { steadyLock.unlock() }
    steadyJobs[id] = job
  }

  /// Removes `job` — only if it is still the one stored under `id`: a copy's measuring and its render share an id,
  /// and the render may be stored before the measuring's task has let go.
  private func dropSteadyJob(_ id: String, _ job: SteadyJob) {
    steadyLock.lock(); defer { steadyLock.unlock() }
    if steadyJobs[id] === job { steadyJobs[id] = nil }
  }

  private func lookupSteadyJob(_ id: String) -> SteadyJob? {
    steadyLock.lock(); defer { steadyLock.unlock() }
    return steadyJobs[id]
  }
```

2. `Events("onExportEvent", "onSoundEvent", "onCutoutEvent")` → `Events("onExportEvent", "onSoundEvent", "onCutoutEvent", "onSteadyEvent")`.

3. Directly after the closing brace of `Function("cancelCutout") { … }`, inside `definition()`:

```swift

    // Stabilize, first half: how far each frame of the asked range moved against the frame before it (see
    // SteadyRender.measure). Resolves `{ times, dx, dy, frames, failed }`; progress arrives as
    // `onSteadyEvent { jobId, progress }`. Rejects "E_STEADY_CANCELLED" after `cancelSteady(jobId)`, else "E_STEADY"
    // with a staged message. The work runs on a Swift concurrency thread; the job is stored before it starts, and
    // every way out of the `do` answers the promise exactly once. One heavy render at a time, cut-outs included: a
    // second one waits in `enter` (and still answers a cancel there); the gate is given back on every way out after
    // it was taken. The source (and so its asset) lives until the measuring has returned.
    AsyncFunction("measureShake") { (request: ShakeRequest, promise: Promise) in
      let job = SteadyJob()
      let jobId = request.jobId
      self.storeSteadyJob(jobId, job)
      Task { [weak self] in
        defer { self?.dropSteadyJob(jobId, job) }
        do {
          try await SteadyRender.enter(job)
          defer { CutoutRender.leave() }
          let source = try await SteadySource.open(request.sourceUri)
          var lastSent = -1.0
          let answer: [String: Any] = try SteadyRender.measure(request, source: source, job: job, progress: { (fraction: Double) -> Void in
            guard fraction - lastSent >= 0.02 else { return }   // at most ~50 events a measuring
            lastSent = fraction
            self?.sendEvent("onSteadyEvent", ["jobId": jobId, "progress": fraction])
          })
          promise.resolve(answer)
        } catch SteadyError.cancelled {
          promise.reject("E_STEADY_CANCELLED", "Steady cancelled")
        } catch {
          promise.reject("E_STEADY", SteadyRender.message(error))
        }
      }
    }

    // Stabilize, second half, and Smooth slow motion: writes the copy the request names (see SteadyRender.render).
    // Resolves `{ fileUri, seconds, frames }`; progress, rejections, the gate and the job store as for `measureShake`.
    AsyncFunction("renderSteady") { (request: SteadyRequest, promise: Promise) in
      let job = SteadyJob()
      let jobId = request.jobId
      self.storeSteadyJob(jobId, job)
      Task { [weak self] in
        defer { self?.dropSteadyJob(jobId, job) }
        do {
          guard let outputURL = ExportSession.fileURL(from: request.outputPath) else { throw SteadyError.failed("steady output: not a file path") }
          try await SteadyRender.enter(job)
          defer { CutoutRender.leave() }
          let source = try await SteadySource.open(request.sourceUri)
          var lastSent = -1.0
          let answer: [String: Any] = try await SteadyRender.render(request, source: source, to: outputURL, job: job, progress: { (fraction: Double) -> Void in
            guard fraction - lastSent >= 0.02 else { return }   // at most ~50 events a render
            lastSent = fraction
            self?.sendEvent("onSteadyEvent", ["jobId": jobId, "progress": fraction])
          })
          promise.resolve(answer)
        } catch SteadyError.cancelled {
          promise.reject("E_STEADY_CANCELLED", "Steady cancelled")
        } catch {
          promise.reject("E_STEADY", SteadyRender.message(error))
        }
      }
    }

    // Stops the measuring or the render stored under that id at its next pass (it then rejects
    // "E_STEADY_CANCELLED"). An unknown or finished job: nothing.
    Function("cancelSteady") { (jobId: String) in
      self.lookupSteadyJob(jobId)?.cancel()
    }
```

In `cutoutRender.swift.test.ts` (line 133) and `soundRender.swift.test.ts` (line 187) change the pinned `Events(…)` string as the Files line says. Nothing else in those two suites changes.

- [ ] **Step 4: Run** `npx.cmd jest src/editor/model/__tests__/steadyRender.swift.test.ts src/editor/model/__tests__/cutoutRender.swift.test.ts src/editor/model/__tests__/soundRender.swift.test.ts src/editor/model/__tests__/speechRender.swift.test.ts src/editor/model/__tests__/beatEnvelope.parity.test.ts src/editor/model/__tests__/layersExport.swift.test.ts src/editor/__tests__/looks.frozen.test.ts` → PASS. `git diff --stat main -- modules/clipy-video/ios` shows only `ClipyVideoModule.swift` and `SteadyRender.swift`. Then `npm run typecheck` and `npm test`. **No build.**
- [ ] **Step 5: Commit.**

```
git add modules/clipy-video/ios/SteadyRender.swift modules/clipy-video/ios/ClipyVideoModule.swift src/editor/model/__tests__/steadyRender.swift.test.ts src/editor/model/__tests__/cutoutRender.swift.test.ts src/editor/model/__tests__/soundRender.swift.test.ts
git commit -m "feat(native): stabilize and smooth slow motion — frame-to-frame registration reported as numbers, and a copy written moved, zoomed and filled on a grid" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: The copies: `steadyFiles.ts`, `steadyRenders.ts`, mounted in the editor

**Depends on:** 2, 3, 4, 5. **Parallel-safe with:** nothing (it is a wave of its own; Task 6 may still be running — they share no file).

**Files:** Create `src/editor/steadyFiles.ts`, `src/editor/steadyRenders.ts`, `src/editor/__tests__/steadyRenders.test.ts`. Modify `app/editor/[id]/index.tsx` (one import, one hook call directly after `useCutoutRenders();`).

**Do not touch:** `cutoutFiles.ts`, `cutoutRenders.ts`, `renderTurn.ts`, `steady.ts`, `steadyPath.ts`, `modules/clipy-video/index.ts`.

**Interfaces: Consumes** `measureShake`, `renderSteady`, `cancelSteady`, `addSteadyListener`, `isSteadyAvailable`, `isSteadyCancelled`, `STEADY_CANCELLED`, `ShakeResult` (Task 2); `steadyShifts`, `Shifts` (Task 3); `takeTurn` (Task 4); `STEADY`, `levelRule`, `steadyOf`, `steadyRefusal`, `coveringSteady`, `steadyNeed`, `neededSteady`, `parseSteadyName`, `steadyDeadlineMs`, `NeededSteady` (Task 5); `STEADY_TOOLS` (Task 2).

**Interfaces: Produces**

```ts
// src/editor/steadyFiles.ts
export type SteadyFile = { status: "ready"; uri: string } | { status: "busy"; progress: number } | { status: "failed"; message: string };
export const useSteadyFiles: UseBoundStore<StoreApi<{ files: Record<string, SteadyFile> }>>;
export function knownSteady(files: Record<string, SteadyFile>): string[];
export function steadyNeedOf(files: Record<string, SteadyFile>, clip: Clip): NeededSteady | null;        // null = the clip has no copy
export function steadyNeeded(p: Project, missing: readonly string[], files: Record<string, SteadyFile>): NeededSteady[];
export function steadyFileOf(files: Record<string, SteadyFile>, clip: Clip): SteadyFile | undefined;
export function shownSteady(files: Record<string, SteadyFile>, clip: Clip): string | null;              // the ready copy's uri, else null
export function steadyPercent(files: Record<string, SteadyFile>, clip: Clip): number | null;
// src/editor/steadyRenders.ts
export const STABILIZE_FAILED: string; export const SMOOTH_FAILED: string;
export const STEADY_CANCEL_GRACE_MS = 4000; export const STEADY_SETTLE_MS = 800;
export const steadyDir: (projectId: string) => string;                                                  // <project>/steady
export function ensureSteady(projectId: string, need: NeededSteady, onProgress?: (fraction: number) => void): Promise<string>;
export function syncSteady(projectId: string, needed: NeededSteady[]): void;
export function retrySteady(name: string): void;
export function resetSteady(): void;
export function forgetShakes(): void;
export function openSteady(projectId: string): Promise<void>;
export function useSteadyRenders(): void;
```

- [ ] **Step 1: Failing tests.** Create `src/editor/__tests__/steadyRenders.test.ts`:

```ts
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-10T10:00:00.000Z" }));
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
  const box: { listener: unknown } = { listener: null };
  return {
    __box: box,
    isSteadyAvailable: jest.fn(() => true), measureShake: jest.fn(), renderSteady: jest.fn(), cancelSteady: jest.fn(),
    addSteadyListener: jest.fn((cb: unknown) => { box.listener = cb; return { remove() {} }; }),
    STEADY_CANCELLED: "E_STEADY_CANCELLED",
    isSteadyCancelled: (e: unknown) => typeof e === "object" && e !== null && (e as { code?: string }).code === "E_STEADY_CANCELLED",
  };
});
import { act, renderHook } from "@testing-library/react-native";
import { cancelSteady, isSteadyAvailable, measureShake, renderSteady } from "@/modules/clipy-video";
import { setClipStabilize } from "@/src/editor/model/ops";
import { steadyNeed } from "@/src/editor/model/steady";
import { steadyShifts } from "@/src/editor/model/steadyPath";
import { makeClip, makeProject, type Clip } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { STEADY_TOOLS } from "@/src/lib/buildInfo";
import { newId } from "@/src/lib/id";
import { useToast } from "@/src/ui/Toast";
import { takeTurn } from "../renderTurn";
import { knownSteady, shownSteady, steadyFileOf, steadyNeeded, steadyNeedOf, steadyPercent, useSteadyFiles } from "../steadyFiles";
import { ensureSteady, forgetShakes, openSteady, resetSteady, retrySteady, SMOOTH_FAILED, STABILIZE_FAILED, STEADY_SETTLE_MS, steadyDir, syncSteady, useSteadyRenders } from "../steadyRenders";

const disk = (jest.requireMock("@/src/projects/expoFs") as { __files: Set<string> }).__files;
const native = (jest.requireMock("@/modules/clipy-video") as { __box: { listener: null | ((e: { jobId: string; progress: number }) => void) } }).__box;
const measure = jest.mocked(measureShake), render = jest.mocked(renderSteady);
const MEDIA = "file:///doc/projects/p1/media", DIR = "file:///doc/projects/p1/steady";
const base = (extra: Partial<Clip> = {}): Clip => makeClip({ id: "a", sourceDuration: 30, sourceUri: `${MEDIA}/abc.mov`, trimStart: 4.2, trimEnd: 9.7, width: 1080, height: 1920, ...extra });
const steadied = base({ stabilize: "medium" });
const slowed = base({ speed: 0.25, smooth: true });
const NAME = "abc-s1-2-0-2000-12000.mov", SLOW = "abc-s1-0-120-2000-12000.mov";
const SHAKE = { times: [2, 2.1, 2.2, 2.3, 2.4], dx: [0, 0.01, -0.02, 0.01, 0], dy: [0, 0, 0.004, 0, 0], frames: 5, failed: 0 };
const files = () => useSteadyFiles.getState().files;
const st = () => useEditorStore.getState();
const tick = async (n = 200) => { for (let i = 0; i < n; i++) await Promise.resolve(); };
const made = (name: string) => ({ fileUri: `${DIR}/${name}`, seconds: 12, frames: 300 });
const cancelled = () => Object.assign(new Error("Steady cancelled"), { code: "E_STEADY_CANCELLED" });
/** A native call that stays open until the test settles it. */
function pending<T>(mock: jest.Mock, value: T) {
  let ok!: () => void, fail!: (e: unknown) => void;
  mock.mockImplementationOnce(() => new Promise<T>((res, rej) => { ok = () => res(value); fail = rej; }));
  return { ok: () => ok(), fail: (e: unknown) => fail(e) };
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  measure.mockReset(); render.mockReset();
  jest.mocked(isSteadyAvailable).mockReturnValue(true);
  let n = 0;
  jest.mocked(newId).mockImplementation(() => `job-${++n}`);
  disk.clear();
  resetSteady();
  forgetShakes();
  useToast.getState().clear();
  st().reset();
});
afterEach(() => { jest.useRealTimers(); });

test("the store's helpers: a clip shows its copy only once it is ready, and a clip without a setting has none", () => {
  expect(steadyDir("p1")).toBe(DIR);
  expect(knownSteady({ a: { status: "ready", uri: "u" }, b: { status: "busy", progress: 0.2 }, c: { status: "failed", message: "x" } })).toEqual(["a", "b"]);
  expect(steadyNeedOf({}, base())).toBeNull();
  expect(steadyFileOf({ [NAME]: { status: "ready", uri: "u" } }, base())).toBeUndefined();
  expect(shownSteady({ [NAME]: { status: "busy", progress: 0.5 } }, steadied)).toBeNull();
  expect(steadyPercent({ [NAME]: { status: "busy", progress: 0.417 } }, steadied)).toBe(42);
  expect(shownSteady({ [NAME]: { status: "ready", uri: `${DIR}/${NAME}` } }, steadied)).toBe(`${DIR}/${NAME}`);
  expect(shownSteady({ [NAME]: { status: "ready", uri: `${DIR}/${NAME}` } }, slowed)).toBeNull();          // another setting: another copy
  expect(shownSteady({ [NAME]: { status: "ready", uri: `${DIR}/${NAME}` } }, base({ stabilize: "medium", cutout: true }))).toBeNull();
  const whole = "abc-s1-2-0-0-30000.mov";
  expect(steadyNeedOf({ [whole]: { status: "ready", uri: "u" }, [NAME]: { status: "busy", progress: 0 } }, steadied)?.name).toBe(whole);   // a ready copy comes first
  const p = makeProject({ clips: [steadied, base({ id: "b" }), { ...slowed, id: "c" }] });
  expect(steadyNeeded(p, [], {}).map((n) => n.name)).toEqual([NAME, SLOW]);
  expect(steadyNeeded(p, [`${MEDIA}/abc.mov`], {})).toEqual([]);
});

test("Stabilize: the phone measures, the app works out the corrections, the phone writes — under one job, with one percent", async () => {
  const m = pending(measure, SHAKE), r = pending(render, made(NAME));
  const seen: number[] = [];
  const done = ensureSteady("p1", steadyNeed(steadied, [])!, (f) => seen.push(f));
  await tick();
  expect(measure).toHaveBeenCalledWith({ jobId: "job-1", sourceUri: `${MEDIA}/abc.mov`, from: 2, to: 12, minFrameGap: 0.008, measureSide: 512 });
  expect(render).not.toHaveBeenCalled();
  native.listener?.({ jobId: "job-1", progress: 0.5 });
  m.ok();
  await tick();
  expect(render).toHaveBeenCalledWith({
    jobId: "job-1", sourceUri: `${MEDIA}/abc.mov`, outputPath: `${DIR}/${NAME}`, from: 2, to: 12, maxSide: 1920, minFrameGap: 0.008, grid: 0, zoom: 1.1,
    ...steadyShifts(SHAKE, { radius: 0.5, zoom: 1.1, cutShift: 0.2, scaleX: 1, scaleY: 1 }), bitRate: 7464960, blendFloor: 0.02,
  });
  native.listener?.({ jobId: "job-1", progress: 0.5 });
  native.listener?.({ jobId: "someone-else", progress: 0.9 });
  r.ok();
  await expect(done).resolves.toBe(`${DIR}/${NAME}`);
  expect(seen).toEqual([0.2, 0.7]);                                   // 40 % measuring, 60 % writing
});

test("Smooth slow motion alone: nothing is measured, the grid is sent, the percent is the phone's own", async () => {
  const r = pending(render, made(SLOW));
  const seen: number[] = [];
  const done = ensureSteady("p1", steadyNeed(slowed, [])!, (f) => seen.push(f));
  await tick();
  expect(measure).not.toHaveBeenCalled();
  expect(render.mock.calls[0][0]).toMatchObject({ grid: 120, zoom: 1, times: [], dx: [], dy: [], bitRate: 14929920, outputPath: `${DIR}/${SLOW}` });
  native.listener?.({ jobId: "job-1", progress: 0.5 });
  r.ok();
  await done;
  expect(seen).toEqual([0.5]);
});

test("what was measured is remembered for the session: another strength of the same range only writes", async () => {
  measure.mockResolvedValue(SHAKE);
  render.mockImplementation(async (req) => made(req.outputPath.split("/").pop()!));
  await ensureSteady("p1", steadyNeed(steadied, [])!);
  await ensureSteady("p1", steadyNeed(base({ stabilize: "high" }), [])!);
  expect(measure).toHaveBeenCalledTimes(1);
  expect(render.mock.calls.map((c) => c[0].zoom)).toEqual([1.1, 1.15]);
  await ensureSteady("p1", steadyNeed(base({ stabilize: "high", trimStart: 14, trimEnd: 20 }), [])!);       // another range: measured
  expect(measure).toHaveBeenCalledTimes(2);
});

test("a copy on disk needs no phone; a build without the tool says so; two callers share one render", async () => {
  disk.add(`${DIR}/${NAME}`);
  await expect(ensureSteady("p1", steadyNeed(steadied, [])!)).resolves.toBe(`${DIR}/${NAME}`);
  expect(measure).not.toHaveBeenCalled();
  disk.clear();
  jest.mocked(isSteadyAvailable).mockReturnValue(false);
  await expect(ensureSteady("p1", steadyNeed(steadied, [])!)).rejects.toThrow(STEADY_TOOLS);
  jest.mocked(isSteadyAvailable).mockReturnValue(true);
  const r = pending(render, made(SLOW));
  const one = ensureSteady("p1", steadyNeed(slowed, [])!), two = ensureSteady("p1", steadyNeed(slowed, [])!);
  await tick();
  r.ok();
  expect(await one).toBe(await two);
  expect(render).toHaveBeenCalledTimes(1);
});

test("one heavy render at a time with every other kind: it waits its turn, its deadline has not started, and a cancel while waiting never reaches the phone", async () => {
  let free!: () => void;
  const other = takeTurn({ cancelled: false, giveUp: null }, () => new Promise<void>((res) => { free = res; }), () => new Error("x"));
  const waiting = ensureSteady("p1", steadyNeed(slowed, [])!);
  await tick();
  jest.advanceTimersByTime(3600000);                                  // an hour behind a cut-out: no deadline runs while it waits
  await tick();
  expect(render).not.toHaveBeenCalled();
  syncSteady("p1", []);                                               // nobody needs it any more
  await expect(waiting).rejects.toMatchObject({ code: "E_STEADY_CANCELLED" });
  free();
  await other;
  await tick();
  expect(render).not.toHaveBeenCalled();
});

test("a phone that does not answer is given up on, by stage, and told to stop", async () => {
  measure.mockImplementationOnce(() => new Promise(() => {}));
  const done = ensureSteady("p1", steadyNeed(steadied, [])!);
  const seen = expect(done).rejects.toThrow("steady measure: no answer after 160 s");
  await tick();
  jest.advanceTimersByTime(160000);
  await seen;
  expect(cancelSteady).toHaveBeenCalledWith("job-1");
  forgetShakes();
  measure.mockResolvedValueOnce(SHAKE);
  render.mockImplementationOnce(() => new Promise(() => {}));
  const again = ensureSteady("p1", steadyNeed(steadied, [])!);
  const late = expect(again).rejects.toThrow("steady render: no answer after 360 s");
  await tick();
  jest.advanceTimersByTime(360000);
  await late;
});

test("the queue: nothing starts until the project has stood still; then busy, a percent, ready", async () => {
  st().setProject(makeProject({ id: "p1", clips: [slowed] }));
  await openSteady("p1");
  const r = pending(render, made(SLOW));
  syncSteady("p1", steadyNeeded(st().project!, [], files()));
  jest.advanceTimersByTime(STEADY_SETTLE_MS - 1);
  await tick();
  expect(render).not.toHaveBeenCalled();
  jest.advanceTimersByTime(1);
  await tick();
  expect(files()[SLOW]).toEqual({ status: "busy", progress: 0 });
  native.listener?.({ jobId: "job-1", progress: 0.417 });
  expect(files()[SLOW]).toEqual({ status: "busy", progress: 0.42 });
  native.listener?.({ jobId: "job-1", progress: 0.2 });               // never backwards
  expect(files()[SLOW]).toEqual({ status: "busy", progress: 0.42 });
  r.ok();
  await tick();
  expect(files()[SLOW]).toEqual({ status: "ready", uri: `${DIR}/${SLOW}` });
});

test("a copy nobody needs any more is cancelled at once and forgotten; a failed one is said once, by what it was for, and can be asked for again", async () => {
  st().setProject(makeProject({ id: "p1", clips: [slowed] }));
  await openSteady("p1");
  const r = pending(render, made(SLOW));
  syncSteady("p1", steadyNeeded(st().project!, [], files()));
  jest.advanceTimersByTime(STEADY_SETTLE_MS);
  await tick();
  syncSteady("p1", []);
  expect(cancelSteady).toHaveBeenCalledWith("job-1");
  r.fail(cancelled());
  await tick();
  expect(files()[SLOW]).toBeUndefined();
  expect(useToast.getState().message ?? null).toBeNull();

  render.mockRejectedValueOnce(new Error("steady writer: boom"));
  syncSteady("p1", steadyNeeded(st().project!, [], files()));
  jest.advanceTimersByTime(STEADY_SETTLE_MS);
  await tick();
  expect(files()[SLOW]).toEqual({ status: "failed", message: "steady writer: boom" });
  expect(useToast.getState().message).toBe(SMOOTH_FAILED);
  expect(STABILIZE_FAILED).toBe("Could not stabilize the clip. It shows as it was.");
  expect(SMOOTH_FAILED).toBe("Could not smooth the slow motion. The clip shows as it was.");
  render.mockResolvedValueOnce(made(SLOW));
  retrySteady(SLOW);
  jest.advanceTimersByTime(STEADY_SETTLE_MS);
  await tick();
  expect(files()[SLOW]).toEqual({ status: "ready", uri: `${DIR}/${SLOW}` });
});

test("opening a project: finished copies that are needed are known as ready; part files, other versions and copies nobody needs are removed", async () => {
  for (const name of [NAME, "abc-s1-3-0-2000-12000.mov", `part-${NAME}`, "abc-s0-2-0-2000-12000.mov", "notes.txt"]) disk.add(`${DIR}/${name}`);
  disk.add(`${MEDIA}/abc.mov`);
  st().setProject(makeProject({ id: "p1", clips: [steadied] }));
  await openSteady("p1");
  expect([...disk].sort()).toEqual([`${MEDIA}/abc.mov`, `${DIR}/${NAME}`].sort());
  expect(files()).toEqual({ [NAME]: { status: "ready", uri: `${DIR}/${NAME}` } });
  expect(measure).not.toHaveBeenCalled();
});

test("without the tool nothing is read, removed or rendered", async () => {
  jest.mocked(isSteadyAvailable).mockReturnValue(false);
  disk.add(`${DIR}/old.mov`);
  st().setProject(makeProject({ id: "p1", clips: [steadied] }));
  const { unmount } = await renderHook(() => useSteadyRenders());
  await act(async () => { jest.advanceTimersByTime(5000); await tick(); });
  expect(disk.has(`${DIR}/old.mov`)).toBe(true);
  expect(measure).not.toHaveBeenCalled();
  await unmount();
});

test("the hook: a tap that switches Stabilize on renders its copy once the project has stood still; a project without settings costs one look at the folder", async () => {
  measure.mockResolvedValue(SHAKE);
  render.mockImplementation(async (req) => made(req.outputPath.split("/").pop()!));
  st().setProject(makeProject({ id: "p1", clips: [base()] }));
  const { unmount } = await renderHook(() => useSteadyRenders());
  await act(async () => { jest.advanceTimersByTime(5000); await tick(); });
  expect(measure).not.toHaveBeenCalled();
  expect(jest.getTimerCount()).toBe(0);
  await act(async () => { st().apply((p) => setClipStabilize(p, "a", "medium")); await tick(); });
  expect(measure).not.toHaveBeenCalled();                             // not before it has stood still
  await act(async () => { jest.advanceTimersByTime(STEADY_SETTLE_MS); await tick(); });
  expect(files()[NAME]).toEqual({ status: "ready", uri: `${DIR}/${NAME}` });
  expect(JSON.stringify(st().project)).not.toContain("steady/");      // a render never writes the project
  await unmount();
  expect(files()).toEqual({});
});
```

- [ ] **Step 2: Run** `npx.cmd jest src/editor/__tests__/steadyRenders.test.ts` → FAIL (modules missing).
- [ ] **Step 3: Implement.**

Create `src/editor/steadyFiles.ts`:

```ts
import { create } from "zustand";
import { coveringSteady, steadyNeed, steadyOf, steadyRefusal, type NeededSteady } from "./model/steady";
import type { Clip, Project } from "./model/types";

/**
 * What is known of one steady copy (Stabilize and / or Smooth slow motion), by its file name (`steadyFileName`). Nothing known = no
 * entry. A busy copy's `progress` is 0 … 1 in whole percent: it is written at most a hundred times per render.
 */
export type SteadyFile = { status: "ready"; uri: string } | { status: "busy"; progress: number } | { status: "failed"; message: string };

/**
 * The steady copies of the open project (transient: not saved, not undoable). Written only by steadyRenders.ts. Read it with a
 * selector that returns a primitive or a stored entry (`shownSteady`, `steadyPercent`, `steadyFileOf`) — never `s.files` itself,
 * which is a new object on every percent.
 */
export const useSteadyFiles = create<{ files: Record<string, SteadyFile> }>(() => ({ files: {} }));

/** The copies that exist or are being rendered: what a clip may be served from. A failed one is not among them. */
export function knownSteady(files: Record<string, SteadyFile>): string[] {
  return Object.keys(files).filter((name) => files[name].status !== "failed");
}
/** Whether the clip has a copy and can be served (not too long). */
const served = (clip: Clip): boolean => steadyOf(clip) !== null && steadyRefusal(clip) === null;

/**
 * The copy a clip uses NOW — asked every time, never remembered; null for a clip without a setting. A READY copy that covers the
 * clip comes first, so a clip that shows its copy is never moved to a smaller one that is still being rendered for another clip;
 * only without one is it the smallest known copy (a busy one included), else the copy that would be rendered for it. The queue,
 * the preview, the strips and the export all ask here, so they agree on the name.
 */
export function steadyNeedOf(files: Record<string, SteadyFile>, clip: Clip): NeededSteady | null {
  const setting = steadyOf(clip);
  if (setting === null) return null;
  const held = coveringSteady(Object.keys(files).filter((name) => files[name].status === "ready"), clip, setting);
  return steadyNeed(clip, held === null ? knownSteady(files) : [held]);
}
/** Every different copy the project needs, main clips first, then layers: a clip without a setting, whose file is missing or that is too long needs none. */
export function steadyNeeded(p: Project, missing: readonly string[], files: Record<string, SteadyFile>): NeededSteady[] {
  const out: NeededSteady[] = [];
  for (const c of [...p.clips, ...p.layers]) {
    if (!served(c) || missing.includes(c.sourceUri)) continue;
    const need = steadyNeedOf(files, c);
    if (need !== null && !out.some((n) => n.name === need.name)) out.push(need);
  }
  return out;
}
/** What is known of the copy a clip uses: undefined for a clip without a copy, and for a copy nobody has asked for yet. */
export function steadyFileOf(files: Record<string, SteadyFile>, clip: Clip): SteadyFile | undefined {
  const need = served(clip) ? steadyNeedOf(files, clip) : null;
  return need === null ? undefined : files[need.name];
}
/** The file the preview shows instead of the clip's own: its steady copy once that is ready, else null (the clip shows as it is). */
export function shownSteady(files: Record<string, SteadyFile>, clip: Clip): string | null {
  const entry = steadyFileOf(files, clip);
  return entry !== undefined && entry.status === "ready" ? entry.uri : null;
}
/** How far the clip's copy is, 0 … 100 in whole percent, while it is being rendered; null at every other time. */
export function steadyPercent(files: Record<string, SteadyFile>, clip: Clip): number | null {
  const entry = steadyFileOf(files, clip);
  return entry !== undefined && entry.status === "busy" ? Math.round(entry.progress * 100) : null;
}
```

Create `src/editor/steadyRenders.ts` (the cut-out queue's rules, line for line where they are the same; what differs is `ensureSteady`: two native calls inside one turn, with the app's own arithmetic between them):

```ts
import { useEffect } from "react";
import { addSteadyListener, cancelSteady, isSteadyAvailable, isSteadyCancelled, measureShake, renderSteady, STEADY_CANCELLED, type ShakeResult } from "@/modules/clipy-video";
import { levelRule, neededSteady, parseSteadyName, STEADY, steadyDeadlineMs, type NeededSteady } from "@/src/editor/model/steady";
import { steadyShifts, type Shifts } from "@/src/editor/model/steadyPath";
import type { Project } from "@/src/editor/model/types";
import { STEADY_TOOLS } from "@/src/lib/buildInfo";
import { newId } from "@/src/lib/id";
import { storage } from "@/src/projects";
import { expoFs } from "@/src/projects/expoFs";
import { useToast } from "@/src/ui/Toast";
import { takeTurn } from "./renderTurn";
import { steadyNeeded, useSteadyFiles, type SteadyFile } from "./steadyFiles";
import { useEditorStore } from "./store";

/** Said once when a copy could not be made. The setting stays; the clip shows as it was. Which one is said goes by what the copy was for. */
export const STABILIZE_FAILED = "Could not stabilize the clip. It shows as it was.";
export const SMOOTH_FAILED = "Could not smooth the slow motion. The clip shows as it was.";
/** Where a project's steady copies live. Deleted with the project; swept when it is opened (`openSteady`). */
export const steadyDir = (projectId: string): string => `${storage.projectDir(projectId)}/steady`;
/** How long a call that was told to stop is given to say so; after that the wait ends as a cancelled render's does. */
export const STEADY_CANCEL_GRACE_MS = 4000;
/** How long what the project needs must stay the same before a render starts: a trim or speed drag changes it again and again. */
export const STEADY_SETTLE_MS = 800;

type Running = {
  jobId: string; promise: Promise<string>; listeners: Set<(fraction: number) => void>; cancelled: boolean;
  /** What a cancel does to the wait: while the render waits for its turn, ends the wait at once; while the phone is awaited, starts the grace. */
  giveUp: (() => void) | null;
  /** Whether this copy has a measuring half (Stabilize), and which half the phone is in: its fractions are fitted into one percent. */
  staged: boolean; writing: boolean;
};
/** The renders that have not answered yet, by output path: a second caller for the same copy shares the first one's render. */
const inflight = new Map<string, Running>();
/** The phone's fraction of the half it is in, as the copy's own: measuring is the first `measureShare`, writing the rest. */
const overall = (r: Running, fraction: number): number =>
  (!r.staged ? fraction : r.writing ? STEADY.measureShare + fraction * (1 - STEADY.measureShare) : fraction * STEADY.measureShare);
let listening = false;
/** Subscribes once, and only from a render that is about to start: never on a build that does not know the event. */
function listen(): void {
  if (listening) return;
  listening = true;
  addSteadyListener((e) => { for (const r of inflight.values()) if (r.jobId === e.jobId) { const f = overall(r, e.progress); r.listeners.forEach((cb) => cb(f)); } });
}
/** A native side that cannot be told (no module) must not break the caller. */
function stopNative(jobId: string): void {
  try { cancelSteady(jobId); } catch (e) { console.warn("steady cancel failed", e); }
}
function cancel(r: Running): void {
  if (r.cancelled) return;
  r.cancelled = true;
  stopNative(r.jobId);
  r.giveUp?.();
}
const cancelledError = (): Error => Object.assign(new Error("Steady cancelled"), { code: STEADY_CANCELLED });

/**
 * Waits for one native call, but never for ever: it ends with the answer, or `STEADY_CANCEL_GRACE_MS` after the render was
 * cancelled (as a cancelled one), or at `deadlineMs` (as a failed one; the phone is told to stop), whichever comes first. Whatever
 * the phone answers after that is dropped here.
 */
function answered<T>(entry: Running, start: () => Promise<T>, deadlineMs: number, stage: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
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
      reject(new Error(`steady ${stage}: no answer after ${Math.round(deadlineMs / 1000)} s`));
    }), deadlineMs);
    entry.giveUp = () => { if (grace === null) grace = setTimeout(() => settle(() => reject(cancelledError())), STEADY_CANCEL_GRACE_MS); };
    let native: Promise<T>;
    try { native = start(); } catch (e) { settle(() => reject(e)); return; }
    native.then((value) => settle(() => resolve(value)), (e: unknown) => settle(() => reject(e)));
  });
}

/** What the phone measured, by source file and range: another strength, or Smooth slow motion switched on afterwards, writes a new copy without measuring again. For the session only; a handful at most. */
const shakes = new Map<string, ShakeResult>();
const SHAKES_KEPT = 6;
const shakeKey = (need: NeededSteady): string => `${need.sourceUri}|${need.from}|${need.to}`;
export function forgetShakes(): void { shakes.clear(); }
const NO_SHIFTS: Shifts = { times: [], dx: [], dy: [] };

/** One copy's native work, inside its turn: measure (unless remembered), work out the corrections, write. */
async function make(entry: Running, need: NeededSteady, dir: string): Promise<void> {
  const deadline = steadyDeadlineMs(need);
  const rule = levelRule(need.level);
  let shifts = NO_SHIFTS;
  if (rule !== null) {
    let shake = shakes.get(shakeKey(need));
    if (shake === undefined) {
      const request = { jobId: entry.jobId, sourceUri: need.sourceUri, from: need.from, to: need.to, minFrameGap: STEADY.minFrameGap, measureSide: STEADY.measureSide };
      shake = await answered(entry, () => measureShake(request), deadline.measure, "measure");
      if (shakes.size >= SHAKES_KEPT) { const oldest = shakes.keys().next().value; if (oldest !== undefined) shakes.delete(oldest); }
      shakes.set(shakeKey(need), shake);
      // Phone check 4 (spec §10): the size of Vision's numbers, in the dev server's log.
      console.log("steady shake", { frames: shake.frames, failed: shake.failed, largest: Math.max(0, ...shake.dx.map(Math.abs), ...shake.dy.map(Math.abs)) });
    }
    if (entry.cancelled) throw cancelledError();
    shifts = steadyShifts(shake, { radius: rule.radius, zoom: rule.zoom, cutShift: STEADY.cutShift, scaleX: STEADY.scaleX, scaleY: STEADY.scaleY });
  }
  entry.writing = true;
  const request = {
    jobId: entry.jobId, sourceUri: need.sourceUri, outputPath: `${dir}/${need.name}`, from: need.from, to: need.to, maxSide: STEADY.maxSide,
    minFrameGap: STEADY.minFrameGap, grid: need.grid, zoom: rule === null ? 1 : rule.zoom, times: shifts.times, dx: shifts.dx, dy: shifts.dy,
    bitRate: need.bitRate, blendFloor: STEADY.blendFloor,
  };
  await answered(entry, () => renderSteady(request), deadline.render, "render");
}

/**
 * The steady copy `need` names: its uri once it exists — found on disk, or made now (one render per copy however many ask).
 * Rejects with STEADY_TOOLS without the tool, with the staged message when the phone fails or does not answer in time, and with
 * the cancel code when it was cancelled (`isSteadyCancelled`). It always settles. Heavy native renders of every kind take turns
 * (`takeTurn`): a deadline counts from the moment the phone is handed the call. `onProgress` gets one fraction for the whole copy.
 * `need` comes from `steadyNeedOf` / `steadyNeeded`. Used by the editor (`syncSteady`) and by the export.
 */
export function ensureSteady(projectId: string, need: NeededSteady, onProgress?: (fraction: number) => void): Promise<string> {
  const dir = steadyDir(projectId);
  const path = `${dir}/${need.name}`;
  const running = inflight.get(path);
  if (running) {
    if (onProgress) running.listeners.add(onProgress);
    return running.promise;
  }
  const entry: Running = { jobId: newId(), promise: Promise.resolve(path), listeners: new Set(onProgress ? [onProgress] : []), cancelled: false, giveUp: null, staged: levelRule(need.level) !== null, writing: false };
  const work = async (): Promise<string> => {
    if (await expoFs.exists(path)) return path;
    if (!isSteadyAvailable()) throw new Error(STEADY_TOOLS);
    listen();
    await expoFs.mkdir(dir);
    if (entry.cancelled) throw cancelledError();
    await takeTurn(entry, () => make(entry, need, dir), cancelledError);
    return path;
  };
  entry.promise = work().finally(() => { inflight.delete(path); });
  inflight.set(path, entry);
  return entry.promise;
}

const setFile = (name: string, file: SteadyFile | null): void => useSteadyFiles.setState((s) => {
  const files = { ...s.files };
  if (file) files[name] = file; else delete files[name];
  return { files };
});
/** A fraction as whole percent (0 … 1 in steps of 0.01), or null for a number that is not one. */
const wholePercent = (fraction: number): number | null =>
  (typeof fraction === "number" && Number.isFinite(fraction) ? Math.round(Math.min(1, Math.max(0, fraction)) * 100) / 100 : null);
const namesOf = (needed: readonly NeededSteady[]): string => needed.map((n) => n.name).join("|");

/** What the open project needs now (the newest call wins), and the project whose folder has been read: only its copies are rendered. */
let wanted: { projectId: string; needed: NeededSteady[] } | null = null;
let opened: string | null = null;
let pumping = false;
let settle: ReturnType<typeof setTimeout> | null = null;
/** Counts the times the editor was left or a project opened: an answer from before belongs to nobody. */
let epoch = 0;
/** A failure has been said since what is needed last changed: a phone that fails every copy is said once. */
let toldFailure = false;

async function pump(): Promise<void> {
  if (pumping) return;
  pumping = true;
  try {
    for (;;) {
      const w = wanted;
      // Not while the project is still moving, and not before its folder has been read.
      if (!w || settle !== null || opened !== w.projectId) return;
      const { files } = useSteadyFiles.getState();
      const next = w.needed.find((n) => files[n.name] === undefined);
      if (!next) return;
      setFile(next.name, { status: "busy", progress: 0 });
      const run = epoch;
      const stillOpen = (): boolean => epoch === run && wanted !== null && wanted.projectId === w.projectId;
      try {
        const uri = await ensureSteady(w.projectId, next, (fraction) => {
          const now = useSteadyFiles.getState().files[next.name];
          const progress = wholePercent(fraction);
          // One write per whole percent, never backwards.
          if (!stillOpen() || now === undefined || now.status !== "busy" || progress === null || progress <= now.progress) return;
          setFile(next.name, { status: "busy", progress });
        });
        if (stillOpen()) setFile(next.name, { status: "ready", uri });
      } catch (e) {
        if (!stillOpen()) continue;
        if (isSteadyCancelled(e)) { setFile(next.name, null); continue; }   // nobody needed it any more
        const message = e instanceof Error ? e.message : String(e);
        console.warn("steady render failed", message);
        setFile(next.name, { status: "failed", message });
        if (!toldFailure) useToast.getState().show(next.level > 0 ? STABILIZE_FAILED : SMOOTH_FAILED);
        toldFailure = true;
      }
    }
  } finally { pumping = false; }
}
/** Starts the loop once what is needed has stood still for STEADY_SETTLE_MS; called again before that, the wait starts over. No timer when nothing waits to be rendered, or before the project's folder has been read. */
function kick(): void {
  if (settle !== null) { clearTimeout(settle); settle = null; }
  const w = wanted;
  if (!w || opened !== w.projectId) return;
  const { files } = useSteadyFiles.getState();
  if (!w.needed.some((n) => files[n.name] === undefined)) return;
  settle = setTimeout(() => { settle = null; void pump(); }, STEADY_SETTLE_MS);
}

/**
 * The editor says what the open project needs: a running render of a copy nobody needs any more is cancelled at once, and whatever
 * is needed and not known yet is rendered, one at a time, once the project has stood still. A failed copy that is not needed any
 * more is forgotten, so needing it again tries it again; one that is still needed stays failed. Never touches the project.
 */
export function syncSteady(projectId: string, needed: NeededSteady[]): void {
  if (!wanted || wanted.projectId !== projectId || namesOf(wanted.needed) !== namesOf(needed)) toldFailure = false;
  wanted = { projectId, needed };
  const dir = steadyDir(projectId);
  const keep = new Set(needed.map((n) => `${dir}/${n.name}`));
  for (const [path, r] of inflight) if (!keep.has(path)) cancel(r);
  const { files } = useSteadyFiles.getState();
  const gone = Object.keys(files).filter((name) => files[name].status === "failed" && !needed.some((n) => n.name === name));
  if (gone.length > 0) useSteadyFiles.setState((s) => {
    const left = { ...s.files };
    for (const name of gone) delete left[name];
    return { files: left };
  });
  kick();
}

/** The owner asks again for a copy that failed and is still needed: it is forgotten, so the queue tries it once more. */
export function retrySteady(name: string): void {
  const entry = useSteadyFiles.getState().files[name];
  if (entry === undefined || entry.status !== "failed") return;
  setFile(name, null);
  toldFailure = false;
  kick();
}

/** The editor is left (or another project opens): every running render is cancelled and nothing is remembered (what was measured stays for the session). */
export function resetSteady(): void {
  epoch += 1;
  wanted = null;
  opened = null;
  toldFailure = false;
  if (settle !== null) { clearTimeout(settle); settle = null; }
  for (const r of inflight.values()) cancel(r);
  if (Object.keys(useSteadyFiles.getState().files).length > 0) useSteadyFiles.setState({ files: {} });
}

/**
 * A project is opened: the files in its steady folder that no clip needs are removed, and the finished copies that are needed are
 * known as ready. Needed is asked of the OPEN project at the moment each file is about to go, with every finished copy still in the
 * folder counted as known. A `part-` file always goes, and so does anything that is not a copy of this version. Run once per open
 * (there is no undo history then). Only after it may renders start. Never touches a media file or another folder. Without the
 * tool nothing is read, nothing is removed and nothing is ever rendered.
 */
export async function openSteady(projectId: string): Promise<void> {
  if (!isSteadyAvailable()) return;
  const run = epoch;
  const dir = steadyDir(projectId);
  const open = (): Project | null => {
    const s = useEditorStore.getState();
    return epoch === run && s.project && s.project.id === projectId ? s.project : null;
  };
  try {
    const names = await expoFs.list(dir);
    const left = new Set(names.filter((n) => parseSteadyName(n) !== null));
    const neededNow = (): Set<string> | null => {
      const p = open();
      return p ? new Set(neededSteady(p, [], [...left]).map((n) => n.name)) : null;
    };
    for (const name of names) {
      const needed = neededNow();
      if (needed === null) return;
      if (left.has(name) && needed.has(name)) continue;
      left.delete(name);
      await expoFs.remove(`${dir}/${name}`);
    }
    const needed = neededNow();
    if (needed === null) return;
    for (const name of left) if (needed.has(name) && useSteadyFiles.getState().files[name] === undefined) setFile(name, { status: "ready", uri: `${dir}/${name}` });
  } catch (e) { console.warn("steady open failed", e); }
  if (open()) { opened = projectId; kick(); }
}

/**
 * Mount once in the editor, beside `useCutoutRenders`: keeps the open project's steady copies rendered. It listens to the two
 * stores outside React and tells the manager only when WHICH copies are needed has changed; any other edit only makes a copy that
 * has not started wait on (0.8 s after the LAST change of the project, so nothing starts in the middle of a drag). A project
 * without a setting costs one look at its folder when it opens and nothing after that. Sets no React state and never writes the
 * project. Without the tool nothing happens.
 */
export function useSteadyRenders(): void {
  const projectId = useEditorStore((s) => s.project?.id ?? null);
  useEffect(() => {
    resetSteady();
    if (!projectId || !isSteadyAvailable()) return resetSteady;
    void openSteady(projectId);
    let seen: { project: Project | null; missing: readonly string[]; files: Record<string, SteadyFile> } | null = null;
    let told = "";
    const tell = (): void => {
      try {
        const s = useEditorStore.getState();
        const { files } = useSteadyFiles.getState();
        if (seen !== null && seen.project === s.project && seen.missing === s.missingSourceUris && seen.files === files) return;
        const moved = seen === null || seen.project !== s.project;
        seen = { project: s.project, missing: s.missingSourceUris, files };
        if (!s.project || s.project.id !== projectId) return;
        const needed = steadyNeeded(s.project, s.missingSourceUris, files);
        const names = namesOf(needed);
        if (names === told) { if (moved) kick(); return; }
        told = names;   // before the manager is told: what it writes comes back here
        syncSteady(projectId, needed);
      } catch (e) { console.warn("steady sync failed", e); }   // a store's listener must never break the edit that called it
    };
    const offProject = useEditorStore.subscribe(tell);
    const offFiles = useSteadyFiles.subscribe(tell);
    tell();
    return () => { offProject(); offFiles(); resetSteady(); };
  }, [projectId]);
}
```

`app/editor/[id]/index.tsx`: add `import { useSteadyRenders } from "@/src/editor/steadyRenders";` beside the `useCutoutRenders` import, and `useSteadyRenders();` on the line after `useCutoutRenders();`.

- [ ] **Step 4: Run** `npx.cmd jest src/editor/__tests__/steadyRenders.test.ts src/editor/__tests__/cutoutRenders.test.ts src/editor/__tests__/renderTurn.test.ts` → PASS (`cutoutRenders.test.ts` unedited). Then `npm run typecheck` and `npm test`.
- [ ] **Step 5: Commit.**

```
git add src/editor/steadyFiles.ts src/editor/steadyRenders.ts src/editor/__tests__/steadyRenders.test.ts "app/editor/[id]/index.tsx"
git commit -m "feat(editor): steady copies — measure, corrections, write inside one shared turn; one at a time once the project stands still; the sweep on open" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: The preview: `ClipFrame`, `LayerStack`, the Preview tag

**Depends on:** 7. **Parallel-safe with:** 9, 10, 11.

**Files:** Create `src/editor/__tests__/steadyPreview.test.tsx`. Modify `src/editor/components/ClipFrame.tsx`, `src/editor/components/LayerStack.tsx`, `src/editor/components/PreviewTag.tsx`.

**Do not touch:** `PreviewPlayer.tsx`, `LayerVideo.tsx`, `CutoutFollower.tsx` (it is given a uri and needs no change), `ClipFrame.test.tsx`, `LayerStack.test.tsx`, `PreviewTag.test.tsx`, `cutoutPreview.test.tsx` (all four pass unedited: with no steady copy ready every tree and style is what it was).

**Interfaces: Consumes** `shownSteady`, `useSteadyFiles`, `SteadyFile` (Task 7); `STEADY_PREVIEW`, `steadyOf` (Task 5).

**Interfaces: Produces** `export function steadyNeedsTag(p: Project, playhead: number, files: Record<string, SteadyFile>): boolean` (PreviewTag.tsx).

- [ ] **Step 1: Failing tests.** Create `src/editor/__tests__/steadyPreview.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-10T10:00:00.000Z" }));
jest.mock("../components/LayerVideo", () => {
  const { View } = jest.requireActual("react-native");
  return { LayerVideo: ({ layer }: { layer: { id: string; sourceUri: string; muted: boolean } }) => <View testID={`player-${layer.id}`} accessibilityLabel={`${layer.sourceUri}|${layer.muted ? "silent" : "sound"}`} /> };
});
jest.mock("../components/thumbnails", () => ({ getThumb: jest.fn(async () => "file:///thumb.jpg") }));
import { Text } from "react-native";
import { STEADY_PREVIEW } from "@/src/editor/model/steady";
import { makeClip, makeLayer, makeProject } from "@/src/editor/model/types";
import { useSteadyFiles } from "@/src/editor/steadyFiles";
import { useEditorStore } from "@/src/editor/store";
import { ClipFrame } from "../components/ClipFrame";
import { LayerStack } from "../components/LayerStack";
import { steadyNeedsTag } from "../components/PreviewTag";

const DIR = "file:///doc/projects/p1/steady";
const main = makeClip({ id: "a", sourceDuration: 8, sourceUri: "file:///media/a.mp4", stabilize: "medium" });
const NAME = "a-s1-2-0-0-8000.mov";
const layer = makeLayer({ id: "L", sourceDuration: 6, sourceUri: "file:///media/l.mp4", speed: 0.5, smooth: true });
const LNAME = "l-s1-0-60-0-6000.mov";
const ready = (name: string) => ({ [name]: { status: "ready" as const, uri: `${DIR}/${name}` } });
const st = () => useEditorStore.getState();
const flat = (id: string) => { const s = screen.getByTestId(id).props.style; return Array.isArray(s) ? Object.assign({}, ...s) : s; };

beforeEach(() => { useSteadyFiles.setState({ files: {} }); st().reset(); STEADY_PREVIEW.mainVideo = true; STEADY_PREVIEW.layerVideo = true; });

test("a main clip without a ready copy is drawn exactly as before: no follower, no forced background", async () => {
  st().setProject(makeProject({ id: "p1", clips: [main] }));
  useSteadyFiles.setState({ files: { [NAME]: { status: "busy", progress: 0.5 } } });
  await render(<ClipFrame clip={main} frameW={300} frameH={533}><Text>own picture</Text></ClipFrame>);
  expect(screen.queryByTestId("clip-steady")).toBeNull();
  expect(screen.queryByTestId("clip-cutout")).toBeNull();
  expect(screen.getByText("own picture")).toBeTruthy();
});

test("a main clip with a ready copy: a silent follower plays the copy OVER the clip's own picture, which stays visible underneath", async () => {
  st().setProject(makeProject({ id: "p1", clips: [main] }));
  useSteadyFiles.setState({ files: ready(NAME) });
  await render(<ClipFrame clip={main} frameW={300} frameH={533}><Text>own picture</Text></ClipFrame>);
  expect(screen.getByTestId("clip-steady")).toBeTruthy();
  expect(screen.getByTestId("player-a").props.accessibilityLabel).toBe(`${DIR}/${NAME}|silent`);
  expect(flat("clip-content").opacity).toBeUndefined();                // not hidden: an opaque copy covers it, and it shows until the copy has loaded
  expect(screen.queryByTestId("clip-background")).toBeNull();          // a steady copy is not see-through
});

test("with the main preview switched off the clip plays its own file", async () => {
  STEADY_PREVIEW.mainVideo = false;
  st().setProject(makeProject({ id: "p1", clips: [main] }));
  useSteadyFiles.setState({ files: ready(NAME) });
  await render(<ClipFrame clip={main} frameW={300} frameH={533}><Text>own picture</Text></ClipFrame>);
  expect(screen.queryByTestId("clip-steady")).toBeNull();
});

test("a layer's one player is handed the copy once it is ready, with its sound", async () => {
  st().setProject(makeProject({ id: "p1", clips: [makeClip({ id: "m", sourceDuration: 20 })], layers: [layer] }));
  const view = await render(<LayerStack frameW={300} frameH={533} />);
  expect(screen.getByTestId("player-L").props.accessibilityLabel).toBe("file:///media/l.mp4|sound");
  useSteadyFiles.setState({ files: ready(LNAME) });
  await view.rerender(<LayerStack frameW={300} frameH={533} />);
  expect(screen.getByTestId("player-L").props.accessibilityLabel).toBe(`${DIR}/${LNAME}|sound`);
});

test("the Preview tag: shown while a clip on screen has a setting whose copy the preview is not showing", () => {
  const p = makeProject({ id: "p1", clips: [main], layers: [{ ...layer, start: 0 }] });
  expect(steadyNeedsTag(makeProject({ clips: [makeClip({ id: "x", sourceDuration: 5 })] }), 1, {})).toBe(false);
  expect(steadyNeedsTag(p, 1, {})).toBe(true);
  expect(steadyNeedsTag(p, 1, ready(NAME))).toBe(true);                // the layer's copy is still missing
  expect(steadyNeedsTag(p, 1, { ...ready(NAME), ...ready(LNAME) })).toBe(false);
  STEADY_PREVIEW.mainVideo = false;
  expect(steadyNeedsTag(p, 1, { ...ready(NAME), ...ready(LNAME) })).toBe(true);
});
```

- [ ] **Step 2: Run** `npx.cmd jest src/editor/__tests__/steadyPreview.test.tsx` → FAIL.
- [ ] **Step 3: Implement.**

`src/editor/components/ClipFrame.tsx`. Add the imports `import { STEADY_PREVIEW } from "@/src/editor/model/steady";` and `import { shownSteady, useSteadyFiles } from "@/src/editor/steadyFiles";`. Append to the component's doc comment: `Stabilize / Smooth slow motion (steady.ts): a main video's steady copy, once ready, plays in the same follower laid OVER the clip's own picture (the copy is opaque, so the picture underneath is not hidden and shows until the copy has loaded); nothing else changes.` Then replace the block from `const cutUri = …` through `const Follower = …` by:

```tsx
  const cutUri = useCutoutFiles((s) => shownCutout(s.files, clip));
  // Stabilize / Smooth slow motion: the clip's steady copy once it is ready (null for a clip without one — and for a clip with a
  // cut-out: the two never share a clip). The selector returns the uri itself.
  const steadyUri = useSteadyFiles((s) => shownSteady(s.files, clip));
  const photo = isPhoto(clip);
  // A MAIN video cannot be handed another file (the preview's players load the clip's own): a silent player showing the copy is
  // laid in its place. Under a cut-out the clip's own picture is hidden (it keeps playing, with the sound); under a steady copy it
  // is not — the copy covers it. A layer's own player plays the copy.
  const cutFollower = !transparent && !photo && cutUri !== null && CUTOUT_PREVIEW.mainVideo;
  const steadyFollower = !transparent && !photo && cutUri === null && steadyUri !== null && STEADY_PREVIEW.mainVideo;
  const follower = cutFollower || steadyFollower;
  const copyUri = cutFollower ? cutUri : steadyFollower ? steadyUri : null;
  // A see-through picture shows the clip's own background behind it, as the export does; so do a mask's cut-off corners, and so
  // does a cut-out on the main track (always: what was the picture's background is see-through now).
  const cutOut = !transparent && cutUri !== null && (photo || cutFollower);
  const showBackground = !transparent && (cutOut || backgroundShows(clip, placed, opacity, frameW, frameH));
  // Loaded only when it is shown: suites that never show a copy do not load a video player for it.
  const Follower = follower ? (require("./CutoutFollower") as typeof import("./CutoutFollower")).CutoutFollower : null;
```

In the JSX: on the `clip-content` view change `...(follower ? { opacity: 0 } : null)` to `...(cutFollower ? { opacity: 0 } : null)`; and replace the `{Follower && cutUri !== null ? ( … ) : null}` block by

```tsx
        {Follower && copyUri !== null ? (
          <View testID={cutFollower ? "clip-cutout" : "clip-steady"} style={{ position: "absolute", left: -clip.crop.x * contentW, top: -clip.crop.y * contentH, width: contentW, height: contentH }}>
            <Follower clip={clip} uri={copyUri} />
          </View>
        ) : null}
```

(The photo `Image` line keeps `cutUri ?? clip.sourceUri`: a photo has no steady copy.)

`src/editor/components/LayerStack.tsx`. Add the imports `import { STEADY_PREVIEW } from "@/src/editor/model/steady";` and `import { shownSteady, useSteadyFiles } from "@/src/editor/steadyFiles";`. Replace the body of `LayerPicture` by:

```tsx
  const cut = useCutoutFiles((s) => (CUTOUT_PREVIEW.layerVideo ? shownCutout(s.files, layer) : null));
  // Stabilize / Smooth slow motion: the layer's steady copy, the same way (a layer has one or the other, never both).
  const steady = useSteadyFiles((s) => (STEADY_PREVIEW.layerVideo ? shownSteady(s.files, layer) : null));
  const shown = cut ?? steady;
  const played = useMemo(() => (shown !== null ? { ...layer, sourceUri: shown } : layer), [layer, shown]);
  return <LayerVideo layer={played} offset={offset} />;
```

`src/editor/components/PreviewTag.tsx`. Add the imports `import { STEADY_PREVIEW, steadyOf } from "@/src/editor/model/steady";` and `import { shownSteady, useSteadyFiles, type SteadyFile } from "@/src/editor/steadyFiles";`. After `cutoutTagNow`:

```tsx
/**
 * Whether Stabilize / Smooth slow motion makes the preview differ from the export at the playhead: a clip or layer on screen has a
 * setting and the preview is not showing its copy — it is not ready (or cannot be made), or that kind of preview is switched off
 * (`STEADY_PREVIEW`).
 */
export function steadyNeedsTag(p: Project, playhead: number, files: Record<string, SteadyFile>): boolean {
  const asExported = (c: Clip, main: boolean): boolean =>
    steadyOf(c) === null || (shownSteady(files, c) !== null && (main ? STEADY_PREVIEW.mainVideo : STEADY_PREVIEW.layerVideo));
  const hit = clipAt(p, playhead);
  return (!!hit && !asExported(hit.clip, true)) || layersAt(p, playhead).some((l) => !asExported(l, false));
}
/** `steadyNeedsTag` for what the two stores hold right now. */
const steadyTagNow = (): boolean => {
  const s = useEditorStore.getState();
  return !!s.project && steadyNeedsTag(s.project, s.playhead, useSteadyFiles.getState().files);
};
```

In `PreviewTag`, after the `cutThen` line add `const steadyNow = useEditorStore(steadyTagNow);` and `const steadyThen = useSteadyFiles(steadyTagNow);`, and change the early return to `if (!visible && !cutNow && !cutThen && !steadyNow && !steadyThen) return null;`. Append to its doc comment: `The same for a clip whose steady copy the preview is not showing (steadyNeedsTag).`

- [ ] **Step 4: Run** `npx.cmd jest src/editor/__tests__/steadyPreview.test.tsx src/editor/__tests__/cutoutPreview.test.tsx src/editor/__tests__/ClipFrame.test.tsx src/editor/__tests__/LayerStack.test.tsx src/editor/__tests__/PreviewTag.test.tsx src/__tests__` and every suite that renders `PreviewPlayer` (Grep for `PreviewPlayer` under `src/editor/__tests__`) → PASS with the four existing suites **unedited**. `git diff --stat main -- src/editor/components/PreviewPlayer.tsx src/editor/components/LayerVideo.tsx src/editor/components/CutoutFollower.tsx` is empty. Then `npm run typecheck` and `npm test`.
- [ ] **Step 5: Commit.**

```
git add src/editor/components/ClipFrame.tsx src/editor/components/LayerStack.tsx src/editor/components/PreviewTag.tsx src/editor/__tests__/steadyPreview.test.tsx
git commit -m "feat(editor): the preview shows steady copies — a layer's player plays the copy, a main video gets the silent follower over its own picture" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: The Stabilize tool: `contextFor`, the strip, the toolbar; Remove background's refusal

**Depends on:** 1, 7. **Parallel-safe with:** 8, 10, 11.

**Files:** Create `src/editor/components/StabilizeSheet.tsx`, `src/editor/__tests__/StabilizeSheet.test.tsx`, `src/editor/__tests__/toolbarContext.stabilize.test.ts`. Modify `src/editor/toolbarContext.ts`, `src/editor/toolGroups.ts`, `src/editor/toolStrip.ts` (`"stabilize"` joins `StripId`, after `"cutout"`), `src/editor/components/EditorToolbar.tsx` (one import, one handler row after `cutout:`, one element after `<CutoutSheet … />`), `src/editor/components/CutoutSheet.tsx` (one refusal), and the pinned lists: `toolbarContext.test.ts` (`CLIP` and `LAYER` gain `"stabilize"` directly after `"cutout"`; `toHaveLength(55)` → `56`), `EditorToolbar.test.tsx` and `EditorToolbar.layers.test.tsx` (the label lists gain `"Stabilize"` directly after `"Cut out"`), `icons.test.ts` (the map gains `stabilize: "hand-left-outline"`).

**Do not touch:** `SpeedSheet.tsx`, the preview components, `steadyFiles.ts`, `steadyRenders.ts`, `CutoutSheet.test.tsx` and `toolbarContext.cutout.test.ts` (both pass unedited).

**Interfaces: Consumes** `setClipStabilize` (Task 1); `isSteadyAvailable`, `STEADY_TOOLS` (Task 2); `steadyOf`, `steadyRefusal`, `steadyBytes`, `SteadyRefusal` (Task 5); `steadyFileOf`, `steadyNeedOf`, `useSteadyFiles`, `SteadyFile`, `retrySteady` (Task 7).

**Interfaces: Produces**

```ts
// src/editor/components/StabilizeSheet.tsx
export const STABILIZE_TOO_LONG: string; export const STABILIZE_WITH_CUTOUT: string; export const STEADY_FILE_MISSING: string;
export function stabilizeStatus(on: boolean, more: { cutout: boolean; refusal: SteadyRefusal | null; file: SteadyFile | undefined; bytes: number; blocked?: "build" | "missing" | null }): string;
export function StabilizeSheet(props: { clipId: string | null; visible: boolean; onClose: () => void }): JSX.Element | null;
// src/editor/components/CutoutSheet.tsx
export const CUTOUT_WITH_STEADY: string;
```

- [ ] **Step 1: Failing tests.**

Create `src/editor/__tests__/toolbarContext.stabilize.test.ts`:

```ts
import { makeClip, makeLayer, makePhotoClip, makeProject } from "@/src/editor/model/types";
import { contextFor, TOOL_IDS, type ToolbarSelection } from "../toolbarContext";
import { TOOL_META } from "../toolGroups";

const sel = (clipId: string): ToolbarSelection => ({ clipId, overlayId: null, effectId: null, audioId: null, section: null });
const p = makeProject({
  clips: [makeClip({ id: "a", sourceDuration: 8 }), makePhotoClip({ id: "ph" }), makeClip({ id: "r", sourceDuration: 5, reversed: true }),
    makeClip({ id: "s", sourceDuration: 8, stabilize: "low" }), makeClip({ id: "sm", sourceDuration: 8, speed: 0.5, smooth: true }),
    makeClip({ id: "idle", sourceDuration: 8, smooth: true }), makeClip({ id: "cut", sourceDuration: 8, cutout: true })],
  layers: [makeLayer({ id: "L", sourceDuration: 6 }), makeLayer({ id: "LS", sourceDuration: 6, stabilize: "high", start: 7 })],
});
const tools = (id: string) => contextFor(sel(id), p).tools;

test("Stabilize is a tool with an outline icon, directly after Cut out", () => {
  expect(TOOL_IDS).toContain("stabilize");
  expect(TOOL_IDS.indexOf("stabilize")).toBe(TOOL_IDS.indexOf("cutout") + 1);
  expect(TOOL_META.stabilize).toEqual({ label: "Stabilize", icon: "hand-left-outline" });
  for (const id of ["a", "L"]) expect(tools(id).indexOf("stabilize")).toBe(tools(id).indexOf("cutout") + 1);
});

test("on a video that plays forwards, main or layer; never on a photo or a reversed clip", () => {
  for (const id of ["a", "L", "s", "cut"]) expect(tools(id)).toContain("stabilize");     // with Remove background on it is there, and says why it cannot
  for (const id of ["ph", "r"]) expect(tools(id)).not.toContain("stabilize");
});

test("Reverse is left out while the clip has a steady copy — and only then", () => {
  for (const id of ["s", "sm", "LS"]) expect(tools(id)).not.toContain("reverse");
  for (const id of ["a", "L", "idle"]) expect(tools(id)).toContain("reverse");           // an idle Smooth slow motion switch hides nothing
  expect(tools("cut")).not.toContain("reverse");                                         // as before
});
```

Create `src/editor/__tests__/StabilizeSheet.test.tsx`:

```tsx
import { act, fireEvent, render, screen } from "@testing-library/react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-10T10:00:00.000Z" }));
jest.mock("@/modules/clipy-video", () => ({ ...jest.requireActual("@/modules/clipy-video"), isSteadyAvailable: jest.fn(() => true), isCutoutAvailable: jest.fn(() => true) }));
jest.mock("@/src/editor/steadyRenders", () => ({ retrySteady: jest.fn() }));
jest.mock("@/src/editor/cutoutRenders", () => ({ retryCutout: jest.fn(), isNoPerson: (m: string) => m.includes("cutout person:") }));
import { isSteadyAvailable } from "@/modules/clipy-video";
import { makeClip, makeLayer, makeProject } from "@/src/editor/model/types";
import { useSteadyFiles } from "@/src/editor/steadyFiles";
import { retrySteady } from "@/src/editor/steadyRenders";
import { useEditorStore } from "@/src/editor/store";
import { STEADY_TOOLS } from "@/src/lib/buildInfo";
import { useToast } from "@/src/ui/Toast";
import { CUTOUT_WITH_STEADY, CutoutSheet } from "../components/CutoutSheet";
import { STABILIZE_TOO_LONG, STABILIZE_WITH_CUTOUT, STEADY_FILE_MISSING, StabilizeSheet, stabilizeStatus } from "../components/StabilizeSheet";

const st = () => useEditorStore.getState();
const item = (id: string) => [...st().project!.clips, ...st().project!.layers].find((c) => c.id === id)!;
const tile = (name: string) => screen.getByRole("button", { name });
const press = (name: string) => fireEvent.press(tile(name));
const NAME = "a-s1-2-0-0-8000.mov";
const open = async (id = "a") => {
  st().setProject(makeProject({
    clips: [makeClip({ id: "a", sourceDuration: 8, width: 1080, height: 1920 }), makeClip({ id: "long", sourceDuration: 200 }), makeClip({ id: "cut", sourceDuration: 8, cutout: true })],
    layers: [makeLayer({ id: "L", sourceDuration: 6 })],
  }));
  await act(() => { st().select(id); });
  await render(<StabilizeSheet clipId={id} visible onClose={() => {}} />);
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(isSteadyAvailable).mockReturnValue(true);
  useSteadyFiles.setState({ files: {} });
  useToast.getState().clear();
  st().reset();
});

test("stabilizeStatus: what the strip's status row says", () => {
  const more = { cutout: false, refusal: null, file: undefined, bytes: 7592960 };
  expect(stabilizeStatus(false, more)).toBe("Takes out the shake. The copy takes about 8 MB.");
  expect(stabilizeStatus(false, { ...more, bytes: 10 })).toBe("Takes out the shake. The copy takes about 1 MB.");
  expect(stabilizeStatus(true, more)).toBe("Waiting to start.");
  expect(stabilizeStatus(true, { ...more, blocked: "build" })).toBe(STEADY_TOOLS);
  expect(stabilizeStatus(true, { ...more, blocked: "missing" })).toBe(STEADY_FILE_MISSING);
  expect(stabilizeStatus(true, { ...more, file: { status: "busy", progress: 0.417 } })).toBe("Steadying the clip: 42 %");
  expect(stabilizeStatus(true, { ...more, file: { status: "ready", uri: "u" } })).toBe("Ready.");
  expect(stabilizeStatus(true, { ...more, file: { status: "failed", message: "steady writer: boom" } })).toBe("Could not stabilize this clip. Tap the strength again to try again.");
  expect(stabilizeStatus(true, { ...more, refusal: "tooLong" })).toBe(STABILIZE_TOO_LONG);
  expect(stabilizeStatus(false, { ...more, cutout: true })).toBe(STABILIZE_WITH_CUTOUT);
  expect(STABILIZE_TOO_LONG).toBe("Stabilize works on clips up to 60 seconds. Trim or split this clip first.");
  expect(STABILIZE_WITH_CUTOUT).toBe("Stabilize does not work together with Remove background. Switch Remove background off for this clip first.");
});

test("four tiles; a pick is one undo step and only writes the strength; Off brings the clip back", async () => {
  await open();
  expect(screen.getByText("Stabilize")).toBeTruthy();
  expect(tile("Off")).toBeSelected();
  await press("Medium");
  expect(item("a").stabilize).toBe("medium");
  expect(st().past).toHaveLength(1);
  expect(tile("Medium")).toBeSelected();
  expect(screen.getByText("Waiting to start.")).toBeTruthy();
  await press("High");
  expect(item("a").stabilize).toBe("high");
  await press("Off");
  expect("stabilize" in item("a")).toBe(false);
  expect(st().past).toHaveLength(3);
  await press("Off");
  expect(st().past).toHaveLength(3);                                   // already off: nothing
});

test("the status row follows the clip's copy", async () => {
  await open();
  await press("Medium");
  await act(() => { useSteadyFiles.setState({ files: { [NAME]: { status: "busy", progress: 0.5 } } }); });
  expect(screen.getByText("Steadying the clip: 50 %")).toBeTruthy();
  await act(() => { useSteadyFiles.setState({ files: { [NAME]: { status: "ready", uri: "u" } } }); });
  expect(screen.getByText("Ready.")).toBeTruthy();
});

test("picking the strength a failed copy was for asks for it again and writes nothing", async () => {
  await open();
  await press("Medium");
  await act(() => { useSteadyFiles.setState({ files: { [NAME]: { status: "failed", message: "steady writer: boom" } } }); });
  await press("Medium");
  expect(retrySteady).toHaveBeenLastCalledWith(NAME);
  expect(st().past).toHaveLength(1);
});

test("an older build, a clip over 60 seconds and a clip with Remove background each say why, and store nothing", async () => {
  jest.mocked(isSteadyAvailable).mockReturnValue(false);
  await open();
  await press("Low");
  expect(useToast.getState().message).toBe(STEADY_TOOLS);
  expect("stabilize" in item("a")).toBe(false);
  screen.unmount();
  jest.mocked(isSteadyAvailable).mockReturnValue(true);
  await open("long");
  await press("Low");
  expect(useToast.getState().message).toBe(STABILIZE_TOO_LONG);
  expect(screen.getByText(STABILIZE_TOO_LONG)).toBeTruthy();
  screen.unmount();
  await open("cut");
  await press("Low");
  expect(useToast.getState().message).toBe(STABILIZE_WITH_CUTOUT);
  expect(st().past).toHaveLength(0);
});

test("a layer takes a strength too", async () => {
  await open("L");
  await press("Low");
  expect(item("L").stabilize).toBe("low");
});

test("Remove background says why it cannot be switched on for a clip with a strength", async () => {
  st().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 8, stabilize: "low" })] }));
  await act(() => { st().select("a"); });
  await render(<CutoutSheet clipId="a" visible onClose={() => {}} />);
  await act(() => { fireEvent(screen.getByLabelText("Remove background"), "valueChange", true); });
  expect(useToast.getState().message).toBe(CUTOUT_WITH_STEADY);
  expect(CUTOUT_WITH_STEADY).toBe("Remove background does not work together with Stabilize or Smooth slow motion. Switch those off for this clip first.");
  expect("cutout" in item("a")).toBe(false);
});
```

- [ ] **Step 2: Run** `npx.cmd jest src/editor/__tests__/toolbarContext.stabilize.test.ts src/editor/__tests__/StabilizeSheet.test.tsx` → FAIL.
- [ ] **Step 3: Implement.**

`src/editor/toolbarContext.ts`: add `import { steadyOf } from "./model/steady";`. In `TOOL_IDS` write `"chroma", "cutout", "stabilize", "keyframe"`. In BOTH bars of `contextFor` (layer and clip) put `["stabilize", video && !item.clip.reversed],` directly after `["cutout", !item.clip.reversed],` and change the reverse entry to `["reverse", video && item.clip.cutout !== true && steadyOf(item.clip) === null],`. Append to the doc comment of `contextFor`: `Stabilize is on a video's bar unless it plays backwards; Reverse is also left out for a clip that has a steady copy (steadyOf: a Stabilize strength, or Smooth slow motion while it is slowed).`

`src/editor/toolGroups.ts`, after the `cutout` row: `  stabilize: { label: "Stabilize", icon: "hand-left-outline" },`

`src/editor/toolStrip.ts`: in `StripId`, `| "cutout"` becomes `| "cutout" | "stabilize"`.

`src/editor/components/EditorToolbar.tsx`: `import { StabilizeSheet } from "./StabilizeSheet";`; after the `cutout:` handler row `    stabilize: { onPress: () => openStrip("stabilize") },`; after the `<CutoutSheet … />` element `      <StabilizeSheet clipId={selectedId} visible={strip?.id === "stabilize"} onClose={closeStrip} />`.

`src/editor/components/CutoutSheet.tsx`: add `import { steadyOf } from "@/src/editor/model/steady";`; after `CUTOUT_FILE_MISSING`:

```ts
/** Said where the switch is tapped on a clip that has a Stabilize strength or an active Smooth slow motion: one copy per clip. */
export const CUTOUT_WITH_STEADY = "Remove background does not work together with Stabilize or Smooth slow motion. Switch those off for this clip first.";
```

and in `toggle`, directly after the `isCutoutAvailable()` line: `    if (steadyOf(clip) !== null) { useToast.getState().show(CUTOUT_WITH_STEADY); return; }`

Create `src/editor/components/StabilizeSheet.tsx`:

```tsx
import { useMemo } from "react";
import { View } from "react-native";
import { isSteadyAvailable } from "@/modules/clipy-video";
import { setClipStabilize } from "@/src/editor/model/ops";
import { STEADY_LEVELS, steadyBytes, steadyOf, steadyRefusal, type SteadyRefusal } from "@/src/editor/model/steady";
import { STABILIZE_IDS, type Clip, type StabilizeId } from "@/src/editor/model/types";
import { steadyFileOf, steadyNeedOf, useSteadyFiles, type SteadyFile } from "@/src/editor/steadyFiles";
import { retrySteady } from "@/src/editor/steadyRenders";
import { useEditorStore } from "@/src/editor/store";
import { useItemClip } from "@/src/editor/useItem";
import { STEADY_TOOLS } from "@/src/lib/buildInfo";
import { theme } from "@/src/theme/theme";
import { haptic } from "@/src/ui/haptics";
import { Spinner } from "@/src/ui/Spinner";
import { Body } from "@/src/ui/Text";
import { Tile, TILE_WIDTH } from "@/src/ui/Tile";
import { useToast } from "@/src/ui/Toast";
import { STRIP, StripNote, StripTiles, ToolStrip, tilesStartX } from "@/src/ui/ToolStrip";

/** Said where a strength is tapped on a video whose trimmed source is over the limit, and in the strip for such a clip. */
export const STABILIZE_TOO_LONG = "Stabilize works on clips up to 60 seconds. Trim or split this clip first.";
/** Said where a strength is tapped on a clip whose Remove background is on, and in the strip for such a clip: one copy per clip. */
export const STABILIZE_WITH_CUTOUT = "Stabilize does not work together with Remove background. Switch Remove background off for this clip first.";
/** Said in the strip for a clip with a setting whose own file is gone: its copy is never made. */
export const STEADY_FILE_MISSING = "The file of this clip is missing.";
const STEADYING = "Steadying the clip";
const LABELS: Record<StabilizeId, string> = { low: "Low", medium: "Medium", high: "High" };
/** The three bars inside a strength tile (points): as many filled as the strength. */
const BAR_WIDTH = 4;
const BAR_HEIGHTS = [8, 14, 20] as const;

/**
 * The strip's one status line: what the copy will take, how far it is, that it is ready, or why it is not. `blocked`: why a copy
 * nobody has asked for yet never will be (this build has no tool for it, or the clip's file is missing).
 */
export function stabilizeStatus(on: boolean, more: { cutout: boolean; refusal: SteadyRefusal | null; file: SteadyFile | undefined; bytes: number; blocked?: "build" | "missing" | null }): string {
  if (more.cutout) return STABILIZE_WITH_CUTOUT;
  if (more.refusal === "tooLong") return STABILIZE_TOO_LONG;
  if (!on) return `Takes out the shake. The copy takes about ${Number.isFinite(more.bytes) ? Math.max(1, Math.round(more.bytes / 1000000)) : 1} MB.`;
  const file = more.file;
  if (file === undefined) return more.blocked === "build" ? STEADY_TOOLS : more.blocked === "missing" ? STEADY_FILE_MISSING : "Waiting to start.";
  if (file.status === "busy") return `${STEADYING}: ${Number.isFinite(file.progress) ? Math.min(100, Math.max(0, Math.round(file.progress * 100))) : 0} %`;
  if (file.status === "ready") return "Ready.";
  return "Could not stabilize this clip. Tap the strength again to try again.";
}

/** The status row (height STRIP.slider): the one place that follows the clip's copy; its selector returns the stored entry, so a percent re-renders this row and nothing else. */
function StabilizeStatus({ clip }: { clip: Clip }) {
  const file = useSteadyFiles((s) => steadyFileOf(s.files, clip));
  const missing = useEditorStore((s) => s.missingSourceUris.includes(clip.sourceUri));
  const on = clip.stabilize !== undefined;
  const blocked = !isSteadyAvailable() ? "build" : missing ? "missing" : null;
  // Off: what a Medium copy of this clip would take (with the grid its Smooth slow motion already asks for, if any).
  const bytes = steadyBytes(clip, { level: STEADY_LEVELS.medium.level, grid: steadyOf(clip)?.grid ?? 0 });
  return (
    <View testID="stabilize-status" style={{ height: STRIP.slider, flexDirection: "row", alignItems: "center", gap: theme.space.sm, paddingHorizontal: theme.space.gutter }}>
      {on && file !== undefined && file.status === "busy" ? <Spinner label={STEADYING} /> : null}
      <Body muted numberOfLines={2} style={{ flex: 1, fontSize: theme.type.small }}>{stabilizeStatus(on, { cutout: clip.cutout === true, refusal: steadyRefusal(clip), file, bytes, blocked })}</Body>
    </View>
  );
}

function Bars({ filled, color }: { filled: number; color: string }) {
  return (
    <View style={{ height: BAR_HEIGHTS[2], flexDirection: "row", alignItems: "flex-end", gap: theme.space.xs }}>
      {BAR_HEIGHTS.map((height, i) => <View key={height} style={{ width: BAR_WIDTH, height, borderRadius: theme.radius.tile, backgroundColor: i < filled ? color : theme.colors.hairline }} />)}
    </View>
  );
}

/**
 * The selected video clip's or layer's Stabilize: Off / Low / Medium / High and one status line. A pick is one undo step and only
 * writes the strength — the steadied copy is prepared by the queue (`steadyRenders.ts`), and the clip shows as it was until the
 * copy is ready. The original file is never changed; Off brings the clip back at once and is never refused. Picking the strength
 * the clip already has asks again for a copy that failed.
 */
export function StabilizeSheet({ clipId, visible, onClose }: { clipId: string | null; visible: boolean; onClose: () => void }) {
  const clip = useItemClip(clipId);
  const apply = useEditorStore((s) => s.apply);
  const current: StabilizeId | null = clip?.stabilize ?? null;
  // Where the row starts: the selected tile in view, worked out when the strip opens — not on every pick.
  const startX = useMemo(
    () => tilesStartX(current === null ? 0 : STABILIZE_IDS.indexOf(current) + 1, TILE_WIDTH),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visible, clip?.id],
  );
  if (!clip) return null;
  const again = (level: StabilizeId) => {
    const need = steadyNeedOf(useSteadyFiles.getState().files, { ...clip, stabilize: level });
    if (need !== null) retrySteady(need.name);
  };
  const pick = (level: StabilizeId | null) => {
    if (level === current) { if (level !== null) again(level); return; }
    if (level === null) { apply((p) => setClipStabilize(p, clip.id, null)); return; }
    if (!isSteadyAvailable()) { useToast.getState().show(STEADY_TOOLS); return; }
    if (clip.cutout === true) { useToast.getState().show(STABILIZE_WITH_CUTOUT); return; }
    if (steadyRefusal(clip) === "tooLong") { useToast.getState().show(STABILIZE_TOO_LONG); return; }
    haptic("light");
    again(level);
    apply((p) => setClipStabilize(p, clip.id, level));
  };

  return (
    <ToolStrip visible={visible} onClose={onClose} title="Stabilize" note={<StripNote>Zooms in a little</StripNote>}>
      <StripTiles initialX={startX}>
        <Tile label="Off" icon="close-circle-outline" selected={current === null} onPress={() => pick(null)} boxTestID="stabilize-tile-off" />
        {STABILIZE_IDS.map((id) => (
          <Tile key={id} label={LABELS[id]} selected={current === id} onPress={() => pick(id)} boxTestID={`stabilize-tile-${id}`}>
            <Bars filled={STEADY_LEVELS[id].level} color={current === id ? theme.colors.accent : theme.colors.textMuted} />
          </Tile>
        ))}
      </StripTiles>
      <StabilizeStatus clip={clip} />
    </ToolStrip>
  );
}
```

Update the pinned lists named in **Files** (each is one inserted item or one number).

- [ ] **Step 4: Run** `npx.cmd jest src/editor/__tests__/toolbarContext.stabilize.test.ts src/editor/__tests__/toolbarContext.test.ts src/editor/__tests__/toolbarContext.cutout.test.ts src/editor/__tests__/StabilizeSheet.test.tsx src/editor/__tests__/CutoutSheet.test.tsx src/editor/__tests__/EditorToolbar.test.tsx src/editor/__tests__/EditorToolbar.layers.test.tsx src/editor/__tests__/icons.test.ts src/__tests__` → PASS (the guards: no hex literal, spacing from the scale, outline icons). Then `npm run typecheck` and `npm test`.
- [ ] **Step 5: Commit.**

```
git add src/editor/toolbarContext.ts src/editor/toolGroups.ts src/editor/toolStrip.ts src/editor/components/EditorToolbar.tsx src/editor/components/StabilizeSheet.tsx src/editor/components/CutoutSheet.tsx src/editor/__tests__/StabilizeSheet.test.tsx src/editor/__tests__/toolbarContext.stabilize.test.ts src/editor/__tests__/toolbarContext.test.ts src/editor/__tests__/EditorToolbar.test.tsx src/editor/__tests__/EditorToolbar.layers.test.tsx src/editor/__tests__/icons.test.ts
git commit -m "feat(editor): Stabilize — Off / Low / Medium / High on a video clip's and layer's bar, with its status line; Remove background says why it cannot join it" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Smooth slow motion: the Slow motion tab of the Speed strip

**Depends on:** 1, 7. **Parallel-safe with:** 8, 9, 11.

**Files:** Create `src/editor/components/SmoothSlowSection.tsx`, `src/editor/__tests__/SmoothSlow.test.tsx`. Modify `src/editor/components/SpeedSheet.tsx`.

**Do not touch:** `SpeedSheet.test.tsx`, `SpeedSheet.drag.test.tsx` (both pass unedited: for a clip that is not slowed nothing on screen changes, and for a slowed one a chip is added and nothing else); the Curve tab's **Smooth** switch, its label, `SMOOTH_HINT` and `SMOOTH_REFUSED`; `timeline.ts`; `ops.ts`.

**Interfaces: Consumes** `isSlowed` (Task 1); `setClipSmooth` (Task 1); `isSteadyAvailable`, `STEADY_TOOLS` (Task 2); `steadyOf`, `steadyRefusal`, `steadyBytes`, `SMOOTH`, `SteadyRefusal` (Task 5); `steadyFileOf`, `steadyNeedOf`, `useSteadyFiles`, `SteadyFile`, `retrySteady` (Task 7).

**Interfaces: Produces**

```ts
// src/editor/components/SmoothSlowSection.tsx
export const SMOOTH_TOO_LONG: string; export const SMOOTH_WITH_CUTOUT: string;
export function smoothStatus(on: boolean, more: { cutout: boolean; refusal: SteadyRefusal | null; file: SteadyFile | undefined; bytes: number; blocked?: "build" | "missing" | null }): string;
export function SmoothSwitch(props: { clip: Clip }): JSX.Element;   // the Slow motion tab's tiles row: the switch and its name
export function SmoothStatus(props: { clip: Clip }): JSX.Element;   // its bottom row (height STRIP.slider)
```

- [ ] **Step 1: Failing tests.** Create `src/editor/__tests__/SmoothSlow.test.tsx`:

```tsx
import { act, fireEvent, render, screen } from "@testing-library/react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-10T10:00:00.000Z" }));
jest.mock("@/modules/clipy-video", () => ({ ...jest.requireActual("@/modules/clipy-video"), isSteadyAvailable: jest.fn(() => true) }));
jest.mock("@/src/editor/steadyRenders", () => ({ retrySteady: jest.fn() }));
import { isSteadyAvailable } from "@/modules/clipy-video";
import { setClipSpeed } from "@/src/editor/model/ops";
import { makeClip, makeLayer, makeProject } from "@/src/editor/model/types";
import { useSteadyFiles } from "@/src/editor/steadyFiles";
import { retrySteady } from "@/src/editor/steadyRenders";
import { useEditorStore } from "@/src/editor/store";
import { STEADY_TOOLS } from "@/src/lib/buildInfo";
import { useToast } from "@/src/ui/Toast";
import { SMOOTH_TOO_LONG, SMOOTH_WITH_CUTOUT, smoothStatus } from "../components/SmoothSlowSection";
import { SpeedSheet } from "../components/SpeedSheet";

const st = () => useEditorStore.getState();
const item = (id: string) => [...st().project!.clips, ...st().project!.layers].find((c) => c.id === id)!;
const chip = (name: string) => screen.queryByRole("button", { name });
const sw = () => screen.getByLabelText("Smooth slow motion");
const flip = (on: boolean) => act(() => { fireEvent(sw(), "valueChange", on); });
const NAME = "slow-s1-0-60-0-8000.mov";
const open = async (id: string, clipIds?: string[]) => {
  st().setProject(makeProject({
    clips: [makeClip({ id: "a", sourceDuration: 8 }), makeClip({ id: "slow", sourceDuration: 8, speed: 0.5, width: 1080, height: 1920 }),
      makeClip({ id: "long", sourceDuration: 200, speed: 0.5 }), makeClip({ id: "cut", sourceDuration: 8, speed: 0.5, cutout: true })],
    layers: [makeLayer({ id: "L", sourceDuration: 6, speed: 0.25 })],
  }));
  await act(() => { st().select(id); });
  await render(<SpeedSheet clipId={id} clipIds={clipIds} visible onClose={() => {}} />);
};
const openTab = async (id: string) => { await open(id); await act(() => { fireEvent.press(chip("Slow motion")!); }); };

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(isSteadyAvailable).mockReturnValue(true);
  useSteadyFiles.setState({ files: {} });
  useToast.getState().clear();
  st().reset();
});

test("smoothStatus: what the tab's status row says", () => {
  const more = { cutout: false, refusal: null, file: undefined, bytes: 10578944 };
  expect(smoothStatus(false, more)).toBe("Fills the gaps between frames with blended ones. The copy takes about 11 MB.");
  expect(smoothStatus(true, more)).toBe("Waiting to start.");
  expect(smoothStatus(true, { ...more, blocked: "build" })).toBe(STEADY_TOOLS);
  expect(smoothStatus(true, { ...more, file: { status: "busy", progress: 0.417 } })).toBe("Smoothing the slow motion: 42 %");
  expect(smoothStatus(true, { ...more, file: { status: "ready", uri: "u" } })).toBe("Ready.");
  expect(smoothStatus(true, { ...more, file: { status: "failed", message: "steady writer: boom" } })).toBe("Could not smooth the slow motion. Switch it off and on to try again.");
  expect(smoothStatus(true, { ...more, refusal: "tooLong" })).toBe(SMOOTH_TOO_LONG);
  expect(smoothStatus(false, { ...more, cutout: true })).toBe(SMOOTH_WITH_CUTOUT);
  expect(SMOOTH_TOO_LONG).toBe("Smooth slow motion works on clips up to 60 seconds. Trim or split this clip first.");
  expect(SMOOTH_WITH_CUTOUT).toBe("Smooth slow motion does not work together with Remove background. Switch Remove background off for this clip first.");
});

test("the Slow motion tab is there only while the clip is slowed, and never for several clips at once", async () => {
  await open("a");
  expect(chip("Normal")).toBeTruthy();
  expect(chip("Curve")).toBeTruthy();
  expect(chip("Slow motion")).toBeNull();
  await act(() => { st().apply((p) => setClipSpeed(p, "a", 0.5)); });
  expect(chip("Slow motion")).toBeTruthy();
  await act(() => { st().apply((p) => setClipSpeed(p, "a", 1)); });
  expect(chip("Slow motion")).toBeNull();
  screen.unmount();
  await open("slow", ["slow", "long"]);
  expect(chip("Slow motion")).toBeNull();
});

test("the tab holds one switch and one status line; switching on is one undo step and only writes the switch", async () => {
  await openTab("slow");
  expect(chip("Slow motion")).toBeSelected();
  expect(screen.getByText("Smooth slow motion")).toBeTruthy();
  expect(screen.getByText("Fills the gaps between frames with blended ones. The copy takes about 11 MB.")).toBeTruthy();
  expect(screen.queryByTestId("speed-slider")).toBeNull();
  await flip(true);
  expect(item("slow").smooth).toBe(true);
  expect(item("slow").speed).toBe(0.5);
  expect(st().past).toHaveLength(1);
  expect(screen.getByText("Waiting to start.")).toBeTruthy();
  await act(() => { useSteadyFiles.setState({ files: { [NAME]: { status: "busy", progress: 0.5 } } }); });
  expect(screen.getByText("Smoothing the slow motion: 50 %")).toBeTruthy();
  await flip(false);
  expect("smooth" in item("slow")).toBe(false);
  expect(st().past).toHaveLength(2);
});

test("switching on asks again for a copy that failed before", async () => {
  await openTab("slow");
  await flip(true);
  expect(retrySteady).toHaveBeenCalledWith(NAME);
});

test("a clip that stops being slowed while its tab is open falls back to Normal", async () => {
  await openTab("slow");
  await act(() => { st().apply((p) => setClipSpeed(p, "slow", 1)); });
  expect(chip("Slow motion")).toBeNull();
  expect(chip("Normal")).toBeSelected();
  expect(screen.getByTestId("speed-slider")).toBeTruthy();
});

test("an older build, a clip over 60 seconds and a clip with Remove background each say why, and the switch stays off", async () => {
  jest.mocked(isSteadyAvailable).mockReturnValue(false);
  await openTab("slow");
  await flip(true);
  expect(useToast.getState().message).toBe(STEADY_TOOLS);
  expect("smooth" in item("slow")).toBe(false);
  screen.unmount();
  jest.mocked(isSteadyAvailable).mockReturnValue(true);
  await openTab("long");
  await flip(true);
  expect(useToast.getState().message).toBe(SMOOTH_TOO_LONG);
  screen.unmount();
  await openTab("cut");
  await flip(true);
  expect(useToast.getState().message).toBe(SMOOTH_WITH_CUTOUT);
  expect(st().past).toHaveLength(0);
});

test("a slowed layer has the tab too", async () => {
  await openTab("L");
  await flip(true);
  expect(item("L").smooth).toBe(true);
});

test("the Curve tab's own Smooth switch is still there, under its own name", async () => {
  await open("slow");
  await act(() => { fireEvent.press(chip("Curve")!); });
  expect(screen.getByLabelText("Smooth")).toBeTruthy();
  expect(screen.queryByLabelText("Smooth slow motion")).toBeNull();
});
```

- [ ] **Step 2: Run** `npx.cmd jest src/editor/__tests__/SmoothSlow.test.tsx` → FAIL.
- [ ] **Step 3: Implement.**

Create `src/editor/components/SmoothSlowSection.tsx`:

```tsx
import { Switch, View } from "react-native";
import { isSteadyAvailable } from "@/modules/clipy-video";
import { setClipSmooth } from "@/src/editor/model/ops";
import { SMOOTH, steadyBytes, steadyOf, steadyRefusal, type SteadyRefusal } from "@/src/editor/model/steady";
import type { Clip } from "@/src/editor/model/types";
import { steadyFileOf, steadyNeedOf, useSteadyFiles, type SteadyFile } from "@/src/editor/steadyFiles";
import { retrySteady } from "@/src/editor/steadyRenders";
import { useEditorStore } from "@/src/editor/store";
import { STEADY_TOOLS } from "@/src/lib/buildInfo";
import { theme } from "@/src/theme/theme";
import { haptic } from "@/src/ui/haptics";
import { Spinner } from "@/src/ui/Spinner";
import { Body } from "@/src/ui/Text";
import { useToast } from "@/src/ui/Toast";
import { STRIP } from "@/src/ui/ToolStrip";

/** Said where the switch is tapped on a video whose trimmed source is over the limit, and in the tab for such a clip. */
export const SMOOTH_TOO_LONG = "Smooth slow motion works on clips up to 60 seconds. Trim or split this clip first.";
/** Said where the switch is tapped on a clip whose Remove background is on, and in the tab for such a clip: one copy per clip. */
export const SMOOTH_WITH_CUTOUT = "Smooth slow motion does not work together with Remove background. Switch Remove background off for this clip first.";
const NAME = "Smooth slow motion";
const SMOOTHING = "Smoothing the slow motion";
const FILE_MISSING = "The file of this clip is missing.";

/** The tab's one status line: what the copy will take, how far it is, that it is ready, or why it is not (`blocked` as in the Stabilize strip). */
export function smoothStatus(on: boolean, more: { cutout: boolean; refusal: SteadyRefusal | null; file: SteadyFile | undefined; bytes: number; blocked?: "build" | "missing" | null }): string {
  if (more.cutout) return SMOOTH_WITH_CUTOUT;
  if (more.refusal === "tooLong") return SMOOTH_TOO_LONG;
  if (!on) return `Fills the gaps between frames with blended ones. The copy takes about ${Number.isFinite(more.bytes) ? Math.max(1, Math.round(more.bytes / 1000000)) : 1} MB.`;
  const file = more.file;
  if (file === undefined) return more.blocked === "build" ? STEADY_TOOLS : more.blocked === "missing" ? FILE_MISSING : "Waiting to start.";
  if (file.status === "busy") return `${SMOOTHING}: ${Number.isFinite(file.progress) ? Math.min(100, Math.max(0, Math.round(file.progress * 100))) : 0} %`;
  if (file.status === "ready") return "Ready.";
  return "Could not smooth the slow motion. Switch it off and on to try again.";
}

/** The clip as it would be with the switch on: what its copy would be called and take. */
const withSmooth = (clip: Clip): Clip => ({ ...clip, smooth: true });

/**
 * The Slow motion tab's tiles row (it sits inside the Speed strip's `StripTiles`): the switch and its name. Switching on is one
 * undo step and only writes the switch — the copy with the in-between frames is prepared by the queue (`steadyRenders.ts`) and the
 * clip plays as it did until the copy is ready. Off is never refused. This is NOT the Curve tab's Smooth switch (that one chooses
 * how the speed changes); this one is about the picture while the clip is slow.
 */
export function SmoothSwitch({ clip }: { clip: Clip }) {
  const apply = useEditorStore((s) => s.apply);
  const on = clip.smooth === true;
  const toggle = (next: boolean) => {
    if (next === on) return;
    if (!next) { apply((p) => setClipSmooth(p, clip.id, false)); return; }
    if (!isSteadyAvailable()) { useToast.getState().show(STEADY_TOOLS); return; }
    if (clip.cutout === true) { useToast.getState().show(SMOOTH_WITH_CUTOUT); return; }
    if (steadyRefusal(clip) === "tooLong") { useToast.getState().show(SMOOTH_TOO_LONG); return; }
    haptic("light");
    // A copy that failed before is asked for again by this tap.
    const need = steadyNeedOf(useSteadyFiles.getState().files, withSmooth(clip));
    if (need !== null) retrySteady(need.name);
    apply((p) => setClipSmooth(p, clip.id, true));
  };
  return (
    <View testID="smooth-slow-switch" style={{ height: STRIP.tiles, flexDirection: "row", alignItems: "center", gap: theme.space.md }}>
      <Switch accessibilityLabel={NAME} value={on} onValueChange={toggle} trackColor={{ true: theme.colors.accent }} />
      <Body numberOfLines={1} style={{ fontSize: theme.type.small }}>{NAME}</Body>
    </View>
  );
}

/** The tab's bottom row (height STRIP.slider): the one place that follows the clip's copy; a percent re-renders this row and nothing else. */
export function SmoothStatus({ clip }: { clip: Clip }) {
  const file = useSteadyFiles((s) => steadyFileOf(s.files, clip));
  const missing = useEditorStore((s) => s.missingSourceUris.includes(clip.sourceUri));
  const on = clip.smooth === true;
  const blocked = !isSteadyAvailable() ? "build" : missing ? "missing" : null;
  const bytes = steadyBytes(clip, steadyOf(withSmooth(clip)) ?? { level: 0, grid: SMOOTH.fullGrid });
  return (
    <View testID="smooth-slow-status" style={{ height: STRIP.slider, flexDirection: "row", alignItems: "center", gap: theme.space.sm, paddingHorizontal: theme.space.gutter }}>
      {on && file !== undefined && file.status === "busy" ? <Spinner label={SMOOTHING} /> : null}
      <Body muted numberOfLines={2} style={{ flex: 1, fontSize: theme.type.small }}>{smoothStatus(on, { cutout: clip.cutout === true, refusal: steadyRefusal(clip), file, bytes, blocked })}</Body>
    </View>
  );
}
```

`src/editor/components/SpeedSheet.tsx` — six edits, nothing else:

1. Imports: `isSlowed` joins the import from `@/src/editor/model/timeline`; add `import { SmoothStatus, SmoothSwitch } from "./SmoothSlowSection";`.
2. `type Tab = "normal" | "curve";` → `type Tab = "normal" | "curve" | "slow";` (`TABS` is not changed: the third chip is drawn on its own, only while it applies).
3. In `SpeedBody`, directly after the `const [dragging, setDragging] = useState(false);` line:

```tsx
  // Slow motion: a third tab, there only while the clip is slowed (any stretch under 1×) and one clip is shown. A clip that stops
  // being slowed while its tab is open (an undo, a pick on another tab cannot do it) falls back to Normal.
  const slowTab = !clipIds && isSlowed(clip);
  const shown: Tab = tab === "slow" && !slowTab ? "normal" : tab;
```

4. `const warn = tab === "normal" && curveId !== null;` → `const warn = shown === "normal" && curveId !== null;` and the `startX` memo becomes

```tsx
  const startX = useMemo(
    () => (shown === "normal" ? tilesStartX(PRESETS.findIndex((s) => !curveId && clip.speed === s), PRESET_WIDTH) : shown === "curve" ? tilesStartX(curveId ? SPEED_CURVE_IDS.indexOf(curveId) + 1 : 0, TILE_WIDTH) : 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [shown],
  );
```

5. In the `note`: the two `tab === "normal"` / `tab === "curve"` conditions read `shown` instead of `tab` (the texts are untouched).
6. The strip's two rows become:

```tsx
      <StripTiles key={shown} initialX={startX} lead={<>
        {TABS.map((t) => <Chip compact key={t.id} label={t.label} selected={shown === t.id} onPress={() => setTab(t.id)} />)}
        {slowTab ? <Chip compact key="slow" label="Slow motion" selected={shown === "slow"} onPress={() => setTab("slow")} /> : null}
      </>}>
        {shown === "normal" ? (
          PRESETS.map((s) => <Chip key={s} still={dragging} label={formatSpeed(s)} selected={!curveId && clip.speed === s} onPress={() => pickSpeed(s)} />)
        ) : shown === "curve" ? (
          <>
            <CurveTile id="none" label="None" speeds={null} thin={false} selected={curveId === null} onPress={() => pickCurve(null)} />
            {SPEED_CURVE_IDS.map((id) => <CurveTile key={id} id={id} label={SPEED_CURVES[id].label} speeds={profiles[id] ?? null} thin={smooth} selected={curveId === id} onPress={() => pickCurve(id)} />)}
          </>
        ) : (
          <SmoothSwitch clip={clip} />
        )}
      </StripTiles>
      {shown === "normal" ? (
        <StripSlider label={curveId ? "Speed" : "Current speed:"} value={curveId ? undefined : formatSpeed(clip.speed)}>
          {/* With a curve the clip's constant speed is 1, so the slider rests at 1× (muted); setClipSpeed clears the curve. */}
          <Slider testID="speed-slider" minimumValue={SPEED_LIMITS[0]} maximumValue={SPEED_LIMITS[1]} step={0.05} value={clip.speed}
            onSlidingStart={() => { setDragging(true); beginTransaction(); }} onValueChange={(v) => applyTransient((p) => write(p, (q, cid) => setClipSpeed(q, cid, v)))}
            onSlidingComplete={() => setDragging(false)}
            minimumTrackTintColor={sliderTint} thumbTintColor={sliderTint} detents={REST} />
        </StripSlider>
      ) : shown === "curve" ? (
        <View testID="speed-smooth-row" style={{ height: STRIP.slider, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: theme.space.gutter }}>
          <Body style={{ fontSize: theme.type.small }}>Smooth</Body>
          <Switch accessibilityLabel="Smooth" value={smooth} onValueChange={toggleSmooth} trackColor={{ true: theme.colors.accent }} />
        </View>
      ) : (
        <SmoothStatus clip={clip} />
      )}
```

(The `StripSlider` and the `speed-smooth-row` elements are the two that are there today, character for character; only the condition around them changes.) Append to the doc comment of `SpeedSheet`: `A third tab, Slow motion, is there while one slowed clip is shown: its switch (Smooth slow motion, SmoothSlowSection.tsx) is about the picture, not about the curve's form.`

- [ ] **Step 4: Run** `npx.cmd jest src/editor/__tests__/SmoothSlow.test.tsx src/editor/__tests__/SpeedSheet.test.tsx src/editor/__tests__/SpeedSheet.drag.test.tsx src/editor/__tests__/strips.layout.test.tsx src/__tests__` → PASS with the two SpeedSheet suites **unedited**. Then `npm run typecheck` and `npm test`.
- [ ] **Step 5: Commit.**

```
git add src/editor/components/SmoothSlowSection.tsx src/editor/components/SpeedSheet.tsx src/editor/__tests__/SmoothSlow.test.tsx
git commit -m "feat(editor): Smooth slow motion — a Slow motion tab in the Speed strip while the clip is slowed, with its switch and status line" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: The export: `prepareSteady`, the request rewrite — PROOF

**Depends on:** 7. **Parallel-safe with:** 8, 9, 10.

**Files:** Create `src/export/exportSteady.ts`, `src/export/__tests__/exportSteady.test.ts`, `src/export/__tests__/useExport.steady.test.ts`. Modify `src/export/useExport.ts`.

**Do not touch:** `exportCutouts.ts`, `exportSounds.ts`, `estimate.ts`, `modules/clipy-video/index.ts` (`toExportClip` is not edited: the export is sent another `sourceUri` and nothing else), `useExport.test.ts`, `useExport.cutout.test.ts`, `exportCutouts.test.ts` (all three pass **unedited** — neither mocks `isSteadyAvailable`, which is why `useExport.ts` asks the project first and the module second).

**Interfaces: Consumes** `ensureSteady`, `steadyDir` (Task 7); `steadyNeedOf`, `useSteadyFiles`, `SteadyFile` (Task 7); `steadyOf`, `steadyRefusal`, `steadyBytes`, `parseSteadyName` (Task 5); `isSteadyAvailable`, `isSteadyCancelled`, `ExportClip` (Task 2).

**Interfaces: Produces**

```ts
// src/export/exportSteady.ts
export const STEADY_SHARE = 0.3;
export const STEADY_EXPORT: { tooLong: string };
export function steadyBytesToMake(projectId: string, items: readonly Clip[]): Promise<number>;
export function prepareSteady(projectId: string, items: readonly Clip[], onProgress: (fraction: number) => void, stopped?: () => boolean): Promise<Map<string, string>>;   // clip id → the copy's uri
export function withSteady<T extends ExportClip>(sent: T, clip: Clip, uri: string | undefined): T;
```

- [ ] **Step 1: Failing tests.**

Create `src/export/__tests__/exportSteady.test.ts`:

```ts
jest.mock("@/modules/clipy-video", () => ({
  toExportClip: jest.requireActual("@/modules/clipy-video").toExportClip,
  isSteadyCancelled: (e: unknown) => typeof e === "object" && e !== null && (e as { code?: string }).code === "E_STEADY_CANCELLED",
}));
jest.mock("@/src/editor/steadyRenders", () => ({
  steadyDir: (id: string) => `file:///doc/projects/${id}/steady`,
  ensureSteady: jest.fn(async (_p: string, need: { name: string }) => `file:///doc/projects/p1/steady/${need.name}`),
}));
jest.mock("@/src/projects/expoFs", () => ({ expoFs: { list: jest.fn(async () => []) } }));
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-10T10:00:00.000Z" }));
import { toExportClip } from "@/modules/clipy-video";
import { steadyBytes } from "@/src/editor/model/steady";
import { makeClip, makeLayer } from "@/src/editor/model/types";
import { useSteadyFiles } from "@/src/editor/steadyFiles";
import { ensureSteady } from "@/src/editor/steadyRenders";
import { expoFs } from "@/src/projects/expoFs";
import { prepareSteady, STEADY_EXPORT, STEADY_SHARE, steadyBytesToMake, withSteady } from "../exportSteady";

const DIR = "file:///doc/projects/p1/steady";
const a = makeClip({ id: "a", sourceDuration: 8, sourceUri: "file:///media/a.mp4", width: 1080, height: 1920, stabilize: "medium" });
const b = makeClip({ id: "b", sourceDuration: 6, sourceUri: "file:///media/b.mp4" });
const slow = makeLayer({ id: "L", sourceDuration: 5, sourceUri: "file:///media/l.mp4", speed: 0.25, smooth: true, start: 1 });
const A = "a-s1-2-0-0-8000.mov", L = "l-s1-0-120-0-5000.mov";
const cancelled = () => Object.assign(new Error("Steady cancelled"), { code: "E_STEADY_CANCELLED" });

beforeEach(() => { jest.clearAllMocks(); useSteadyFiles.setState({ files: {} }); jest.mocked(expoFs.list).mockResolvedValue([]); });

test("the copies of the clips that have a setting, by clip id, with progress across them that never runs back", async () => {
  const seen: number[] = [];
  jest.mocked(ensureSteady).mockImplementationOnce(async (_p, need, onProgress) => { onProgress?.(0.5); onProgress?.(0.2); return `${DIR}/${need.name}`; });
  const out = await prepareSteady("p1", [a, b, slow], (f) => seen.push(f));
  expect([...out]).toEqual([["a", `${DIR}/${A}`], ["L", `${DIR}/${L}`]]);
  expect(jest.mocked(ensureSteady).mock.calls.map((c) => c[1].name)).toEqual([A, L]);
  expect(seen).toEqual([0.25, 0.5, 1]);
  expect(STEADY_SHARE).toBe(0.3);
});

test("nothing to prepare: nothing is read and nothing is asked for", async () => {
  expect((await prepareSteady("p1", [b], () => {})).size).toBe(0);
  expect(await steadyBytesToMake("p1", [b])).toBe(0);
  expect(expoFs.list).not.toHaveBeenCalled();
  expect(ensureSteady).not.toHaveBeenCalled();
});

test("a copy on disk is used by name; a clip over 60 seconds stops the export with its reason", async () => {
  jest.mocked(expoFs.list).mockResolvedValue(["a-s1-2-0-0-8000.mov"]);
  await prepareSteady("p1", [{ ...a, trimStart: 2, trimEnd: 6 }], () => {});
  expect(jest.mocked(ensureSteady).mock.calls[0][1].name).toBe(A);                       // the copy that covers it, not a new one
  const long = makeClip({ id: "x", sourceDuration: 200, stabilize: "low" });
  await expect(prepareSteady("p1", [long], () => {})).rejects.toThrow(STEADY_EXPORT.tooLong);
  expect(STEADY_EXPORT.tooLong).toBe("A clip with Stabilize or Smooth slow motion is longer than 60 seconds. Shorten it, or switch them off.");
});

test("a render stopped under the export is asked for again; one that fails stops the export with what the phone said; Cancel says nothing", async () => {
  jest.mocked(ensureSteady).mockRejectedValueOnce(cancelled());
  expect((await prepareSteady("p1", [a], () => {})).get("a")).toBe(`${DIR}/${A}`);
  expect(ensureSteady).toHaveBeenCalledTimes(2);
  jest.mocked(ensureSteady).mockRejectedValue(cancelled());
  await expect(prepareSteady("p1", [a], () => {})).rejects.toThrow("Could not prepare a clip for the export: its copy was stopped before it was finished. Export again.");
  jest.mocked(ensureSteady).mockReset();
  jest.mocked(ensureSteady).mockRejectedValueOnce(new Error("steady writer: boom"));
  await expect(prepareSteady("p1", [a], () => {})).rejects.toThrow("Could not prepare a clip for the export: steady writer: boom");
  let stop = false;
  jest.mocked(ensureSteady).mockImplementationOnce(async () => { stop = true; throw new Error("late"); });
  expect((await prepareSteady("p1", [a], () => {}, () => stop)).size).toBe(0);
});

test("the room the copies still to be made take; a copy that is ready costs nothing more", async () => {
  expect(await steadyBytesToMake("p1", [a, b, slow])).toBe(steadyBytes(a, { level: 2, grid: 0 }) + steadyBytes(slow, { level: 0, grid: 120 }));
  jest.mocked(expoFs.list).mockResolvedValue([A]);
  expect(await steadyBytesToMake("p1", [a, b, slow])).toBe(steadyBytes(slow, { level: 0, grid: 120 }));
});

test("withSteady swaps the file and nothing else; a clip without a copy is sent as it is", () => {
  const sent = toExportClip(a);
  expect(withSteady(sent, a, `${DIR}/${A}`)).toEqual({ ...sent, sourceUri: `${DIR}/${A}` });
  expect(withSteady(sent, a, undefined)).toBe(sent);
  const plain = toExportClip(b);
  expect(withSteady(plain, b, `${DIR}/x.mov`)).toBe(plain);
});
```

Create `src/export/__tests__/useExport.steady.test.ts`:

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
  isCutoutCancelled: jest.requireActual("@/modules/clipy-video").isCutoutCancelled,
  isSteadyAvailable: jest.fn(() => true),
  isSteadyCancelled: jest.requireActual("@/modules/clipy-video").isSteadyCancelled,
}));
jest.mock("@/src/editor/soundRenders", () => ({ ensureSound: jest.fn(async (_p: string, uri: string) => `${uri}.copy`) }));
jest.mock("@/src/editor/cutoutRenders", () => ({
  cutoutDir: (id: string) => `file:///doc/projects/${id}/cutout`,
  ensureCutout: jest.fn(async (_p: string, need: { name: string }) => `file:///doc/projects/p1/cutout/${need.name}`),
  isNoPerson: (m: string) => m.includes("cutout person:"),
}));
jest.mock("@/src/editor/steadyRenders", () => ({
  steadyDir: (id: string) => `file:///doc/projects/${id}/steady`,
  ensureSteady: jest.fn(async (_p: string, need: { name: string }) => `file:///doc/projects/p1/steady/${need.name}`),
}));
jest.mock("@/src/projects/expoFs", () => ({
  expoFs: { cacheDir: "file:///cache/", freeBytes: jest.fn(async () => 1e12), mkdir: async () => {}, list: jest.fn(async () => []) },
}));
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-10T10:00:00.000Z" }));
import { addExportListener, exportTimeline, isSteadyAvailable, toExportClip, toExportLayer } from "@/modules/clipy-video";
import { ensureCutout } from "@/src/editor/cutoutRenders";
import { steadyBytes } from "@/src/editor/model/steady";
import { DEFAULT_EXPORT_SETTINGS, makeClip, makeLayer, makeProject } from "@/src/editor/model/types";
import { useCutoutFiles } from "@/src/editor/cutoutFiles";
import { useSteadyFiles } from "@/src/editor/steadyFiles";
import { ensureSteady } from "@/src/editor/steadyRenders";
import { expoFs } from "@/src/projects/expoFs";
import { estimateBytes } from "../estimate";
import { useExport } from "../useExport";

const DIR = "file:///doc/projects/p1/steady";
const steady = makeClip({ id: "a", sourceDuration: 8, sourceUri: "file:///media/a.mp4", width: 1080, height: 1920, stabilize: "medium" });
const plain = makeClip({ id: "b", sourceDuration: 6, sourceUri: "file:///media/b.mp4" });
const oldSlow = makeClip({ id: "s", sourceDuration: 6, sourceUri: "file:///media/s.mp4", speed: 0.5 });                // slowed, no switch: as every old project
const cut = makeClip({ id: "c", sourceDuration: 6, sourceUri: "file:///media/c.mp4", cutout: true });
const layer = makeLayer({ id: "L", sourceDuration: 5, sourceUri: "file:///media/l.mp4", speed: 0.25, smooth: true, start: 1 });
const sent = () => jest.mocked(exportTimeline).mock.calls[0][0];

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(isSteadyAvailable).mockReturnValue(true);
  jest.mocked(expoFs.freeBytes).mockResolvedValue(1e12);
  useSteadyFiles.setState({ files: {} });
  useCutoutFiles.setState({ files: {} });
});

describe("PROOF: a project without the two settings is exported exactly as before (never edited to make a change pass)", () => {
  test("no new call is made, and every clip and layer is what toExportClip / toExportLayer gives", async () => {
    const project = makeProject({ id: "p1", clips: [plain, oldSlow], layers: [makeLayer({ id: "K", sourceDuration: 5, sourceUri: "file:///media/k.mp4", speed: 0.5, start: 1 })] });
    const { result } = await renderHook(() => useExport(project, []));
    await act(async () => { await result.current.start(1080); });
    expect(isSteadyAvailable).not.toHaveBeenCalled();
    expect(ensureSteady).not.toHaveBeenCalled();
    expect(expoFs.list).not.toHaveBeenCalled();
    expect(sent().clips).toEqual(project.clips.map((c) => toExportClip(c)));
    expect(sent().layers).toEqual(project.layers.map((l) => toExportLayer(l)));
    expect(sent().clips[1].sourceUri).toBe("file:///media/s.mp4");
    expect(result.current.state.status).toBe("exporting");
  });

  test("a project with only Remove background is exported as the cut-out batch left it", async () => {
    const project = makeProject({ id: "p1", clips: [cut, plain] });
    const { result } = await renderHook(() => useExport(project, []));
    await act(async () => { await result.current.start(1080); });
    expect(isSteadyAvailable).not.toHaveBeenCalled();
    expect(ensureSteady).not.toHaveBeenCalled();
    expect(sent().clips).toEqual([{ ...toExportClip(cut), sourceUri: "file:///doc/projects/p1/cutout/c-c1-0-6000.mov", opacity: 0.999 }, toExportClip(plain)]);
  });
});

test("clips and layers with a setting are exported from their copies — another file, nothing else; the others as they are", async () => {
  const project = makeProject({ id: "p1", clips: [steady, plain, cut], layers: [layer] });
  const { result } = await renderHook(() => useExport(project, []));
  await act(async () => { await result.current.start(1080); });
  expect(jest.mocked(ensureSteady).mock.calls.map((c) => c[1].name)).toEqual(["a-s1-2-0-0-8000.mov", "l-s1-0-120-0-5000.mov"]);
  expect(jest.mocked(ensureCutout).mock.calls.map((c) => c[1].name)).toEqual(["c-c1-0-6000.mov"]);
  expect(sent().clips[0]).toEqual({ ...toExportClip(steady), sourceUri: `${DIR}/a-s1-2-0-0-8000.mov` });
  expect(sent().clips[1]).toEqual(toExportClip(plain));
  expect(sent().clips[2]).toMatchObject({ sourceUri: "file:///doc/projects/p1/cutout/c-c1-0-6000.mov", opacity: 0.999 });
  expect(sent().layers).toEqual([{ ...toExportLayer(layer), sourceUri: `${DIR}/l-s1-0-120-0-5000.mov` }]);
  expect(sent().layers[0].speed).toBe(0.25);                            // the export's own retiming is untouched
});

test("preparing the copies takes 30 % of the progress, before the video export's share", async () => {
  let progress: ((f: number) => void) | undefined;
  let finish: () => void = () => {};
  jest.mocked(ensureSteady).mockImplementationOnce((_p, need, onProgress) => new Promise<string>((resolve) => { progress = onProgress; finish = () => resolve(`${DIR}/${need.name}`); }));
  const project = makeProject({ id: "p1", clips: [steady, plain] });
  const { result } = await renderHook(() => useExport(project, []));
  let started: Promise<void> = Promise.resolve();
  await act(async () => { started = result.current.start(1080); await new Promise((r) => setTimeout(r, 0)); });
  await act(async () => { progress?.(0.5); });
  expect(result.current.state).toMatchObject({ status: "exporting", progress: 0.15 });
  await act(async () => { finish(); await started; });
  const emit = jest.mocked(addExportListener).mock.calls[0][0];
  await act(async () => { emit({ jobId: "job1", type: "progress", progress: 0.5 }); });
  expect(result.current.state.progress).toBeCloseTo(0.3 + 0.7 * 0.5, 9);
});

test("the copies still to be made are counted in the free-space check; on a build without the tool the clips go out as they are", async () => {
  const project = makeProject({ id: "p1", clips: [steady] });
  const video = estimateBytes(8, 1080, DEFAULT_EXPORT_SETTINGS) * 2;
  jest.mocked(expoFs.freeBytes).mockResolvedValue(video + steadyBytes(steady, { level: 2, grid: 0 }) - 1);
  const { result } = await renderHook(() => useExport(project, []));
  await act(async () => { await result.current.start(1080); });
  expect(result.current.state).toMatchObject({ status: "error", message: "Not enough free space on this iPhone for the export." });
  jest.mocked(expoFs.freeBytes).mockResolvedValue(1e12);
  jest.mocked(isSteadyAvailable).mockReturnValue(false);
  await act(async () => { await result.current.start(1080); });
  expect(ensureSteady).not.toHaveBeenCalled();
  expect(sent().clips).toEqual([toExportClip(steady)]);
});

test("a copy that cannot be made stops the export with its reason", async () => {
  jest.mocked(ensureSteady).mockRejectedValueOnce(new Error("steady writer: boom"));
  const { result } = await renderHook(() => useExport(makeProject({ id: "p1", clips: [steady] }), []));
  await act(async () => { await result.current.start(1080); });
  expect(result.current.state).toMatchObject({ status: "error", message: "Could not prepare a clip for the export: steady writer: boom" });
  expect(exportTimeline).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run** `npx.cmd jest src/export/__tests__/exportSteady.test.ts src/export/__tests__/useExport.steady.test.ts` → FAIL.
- [ ] **Step 3: Implement.**

Create `src/export/exportSteady.ts`:

```ts
import { isSteadyCancelled, type ExportClip } from "@/modules/clipy-video";
import { parseSteadyName, steadyBytes, steadyOf, steadyRefusal } from "@/src/editor/model/steady";
import type { Clip } from "@/src/editor/model/types";
import { steadyNeedOf, useSteadyFiles, type SteadyFile } from "@/src/editor/steadyFiles";
import { ensureSteady, steadyDir } from "@/src/editor/steadyRenders";
import { expoFs } from "@/src/projects/expoFs";

/** The share of the export's progress that preparing the steady copies takes (only when a clip has Stabilize or an active Smooth slow motion). */
export const STEADY_SHARE = 0.3;
/** Why an export with such a clip cannot go out. */
export const STEADY_EXPORT = {
  tooLong: "A clip with Stabilize or Smooth slow motion is longer than 60 seconds. Shorten it, or switch them off.",
} as const;
/** How often one clip's copy is asked for before the export gives up (the editor may stop a render it no longer needs under the export). */
const STEADY_ASKS = 3;
const FAILED = "Could not prepare a clip for the export: ";
const STOPPED = `${FAILED}its copy was stopped before it was finished. Export again.`;

/** The finished copies in a project's steady folder, by name; a folder that cannot be read counts as empty. */
async function finishedCopies(dir: string): Promise<string[]> {
  try { return (await expoFs.list(dir)).filter((name) => parseSteadyName(name) !== null); } catch { return []; }
}
/** The clips that have a copy (`steadyOf`): a clip without a setting, a photo, a reversed or cut-out clip has none. */
const withCopy = (items: readonly Clip[]): Clip[] => items.filter((c) => steadyOf(c) !== null);

/**
 * About how many bytes the copies that `prepareSteady` would still have to MAKE for these clips take (`steadyBytes` each): the
 * export asks for that much free space on top of the video's. A copy that is on disk or ready costs nothing more; a copy counted
 * for one clip serves the next. 0 — and nothing is read — when no clip has a copy.
 */
export async function steadyBytesToMake(projectId: string, items: readonly Clip[]): Promise<number> {
  const made = withCopy(items).filter((c) => steadyRefusal(c) === null);
  if (made.length === 0) return 0;
  const dir = steadyDir(projectId);
  const files: Record<string, SteadyFile> = {};
  for (const name of await finishedCopies(dir)) files[name] = { status: "ready", uri: `${dir}/${name}` };
  Object.assign(files, useSteadyFiles.getState().files);
  let bytes = 0;
  for (const clip of made) {
    const need = steadyNeedOf(files, clip);
    if (need === null) continue;
    const known = files[need.name];
    if (known !== undefined && known.status === "ready") continue;
    bytes += steadyBytes(clip, need);
    files[need.name] = { status: "ready", uri: `${dir}/${need.name}` };
  }
  return bytes;
}

/**
 * The steady copies of the clips and layers that have a setting: clip id → the copy's uri. A copy that exists (and covers the
 * clip) is used; a missing one is made first, one after the other. `onProgress` runs 0 → 1 across them and never back. A copy that
 * cannot be made stops the export — it never goes out shaky or choppy where the owner asked otherwise. `stopped` (Cancel) is asked
 * before each copy and after it. WHICH copy a clip uses is the editor's answer (`steadyNeedOf` over its store, read again for every
 * clip, plus the finished copies in the folder and the ones made here), so the export and the editor name the same copies.
 */
export async function prepareSteady(projectId: string, items: readonly Clip[], onProgress: (fraction: number) => void, stopped: () => boolean = () => false): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const made = withCopy(items);
  if (made.length === 0) return out;
  if (made.some((c) => steadyRefusal(c) === "tooLong")) throw new Error(STEADY_EXPORT.tooLong);
  const dir = steadyDir(projectId);
  let finished: string[] = await finishedCopies(dir);
  const filesNow = (): Record<string, SteadyFile> => {
    const files: Record<string, SteadyFile> = {};
    for (const name of finished) files[name] = { status: "ready", uri: `${dir}/${name}` };
    return { ...files, ...useSteadyFiles.getState().files };
  };
  let top = 0;
  const report = (fraction: number): void => {
    if (stopped() || !(fraction > top)) return;
    top = fraction;
    onProgress(fraction);
  };
  for (let i = 0; i < made.length; i++) {
    for (let ask = 1; ; ask++) {
      if (stopped()) return out;
      const need = steadyNeedOf(filesNow(), made[i]);
      if (need === null) break;
      try {
        out.set(made[i].id, await ensureSteady(projectId, need, (f) => report((i + f) / made.length)));
        if (!finished.includes(need.name)) finished = [...finished, need.name];
        break;
      } catch (e) {
        if (stopped()) return out;   // cancelled meanwhile: there is nothing to say
        if (isSteadyCancelled(e)) {
          if (ask < STEADY_ASKS) continue;
          throw new Error(STOPPED);
        }
        throw new Error(`${FAILED}${e instanceof Error ? e.message : String(e)}`);
      }
    }
    if (stopped()) return out;
    report((i + 1) / made.length);
  }
  return out;
}

/**
 * A clip or layer as the export is sent it when its steady copy is `uri` (undefined, or a clip without a copy: `sent` itself): the
 * copy's file and nothing else. The copy's timeline is the source's — its frames sit at source seconds — so the trim, the speed, the
 * speed spans, the pins and the gain mean in the copy exactly what they meant in the source, and it carries the source's sound. The
 * export stretches it as it stretched the original; a Smooth slow motion copy simply has a frame for every moment it is asked for.
 */
export function withSteady<T extends ExportClip>(sent: T, clip: Clip, uri: string | undefined): T {
  return uri === undefined || steadyOf(clip) === null ? sent : { ...sent, sourceUri: uri };
}
```

`src/export/useExport.ts`:

1. Imports: `isSteadyAvailable` joins the import from `@/modules/clipy-video`; `type Clip`, `type LayerClip` join the import from `@/src/editor/model/types`; add `import { steadyOf } from "@/src/editor/model/steady";` and `import { prepareSteady, STEADY_SHARE, steadyBytesToMake, withSteady } from "./exportSteady";`.
2. Directly after the `const cutting = …` line:

```ts
      /** Whether a clip or layer goes out from a steady copy. The project is asked FIRST: one without the two settings makes no new call at all. */
      const steadying = [...clips, ...layersOut].some((c) => steadyOf(c) !== null) && isSteadyAvailable();
```

3. In the `const need = …` line append ` + (steadying ? await steadyBytesToMake(project.id, [...clips, ...layersOut]) : 0)` before the semicolon.
4. Directly after the closing brace of the `if (cutting) { … }` block:

```ts
      // A clip or layer with Stabilize or an active Smooth slow motion is exported from its steady copy: same timing, same sound,
      // another file. A copy that is missing is made first.
      const steadies = new Map<string, string>();
      if (steadying) {
        const run = { stopped: false };
        preparing.current = run;
        const before = share.current;
        share.current = before + STEADY_SHARE;
        try {
          const made = await prepareSteady(project.id, [...clips, ...layersOut], (f) => setState((s) => (!run.stopped && s.status === "exporting" ? { ...s, progress: before + f * STEADY_SHARE } : s)), () => run.stopped);
          made.forEach((uri, id) => steadies.set(id, uri));
        } catch (e) {
          if (run.stopped) return;   // cancelled meanwhile: there is nothing to say
          throw e;
        } finally { if (preparing.current === run) preparing.current = null; }
        if (run.stopped) return;
      }
      /** With no copy of either kind both are the plain conversions, called exactly as before. */
      const noCopies = cutouts.size === 0 && steadies.size === 0;
      const sendClip = (c: Clip) => withSteady(withCutout(toExportClip(c), c, cutouts.get(c.id), true), c, steadies.get(c.id));
      const sendLayer = (l: LayerClip) => withSteady(withCutout(toExportLayer(l), l, cutouts.get(l.id), false), l, steadies.get(l.id));
```

5. In the `exportTimeline({ … })` call the two lines become `clips: noCopies ? clips.map(toExportClip) : clips.map(sendClip),` and `layers: noCopies ? layersOut.map(toExportLayer) : layersOut.map(sendLayer),` (the comment between them stays).

- [ ] **Step 4: Run** `npx.cmd jest src/export` → PASS, with `useExport.test.ts` (its PINNED request literal), `useExport.cutout.test.ts` and `exportCutouts.test.ts` **unedited**. Then `npm run typecheck` and `npm test`.
- [ ] **Step 5: Commit.**

```
git add src/export/exportSteady.ts src/export/useExport.ts src/export/__tests__/exportSteady.test.ts src/export/__tests__/useExport.steady.test.ts
git commit -m "feat(export): clips and layers with Stabilize or Smooth slow motion go out from their steady copies, prepared first; a project without them is sent as before (PROOF)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: TypeScript review (independent), fixes

**Depends on:** Tasks 1–11 merged and green.

**Files:** Modify only what the review finds, in the files Tasks 1–5 and 7–11 created or modified, and their tests.

**Do not touch:** any Swift; a PROOF test or an "unedited" suite of Global Constraints (a finding that seems to need one is a design problem: stop and report).

- [ ] **Step 1: The review.** Dispatch an **independent reviewer** (a fresh agent that wrote none of Tasks 1–11; give it the diff and the spec, not a verdict): `git diff main -- src app modules/clipy-video/index.ts`, spec §3–§8. It answers each of these, with file and line where it is not a clean yes:
  1. **Nothing existing changes.** Is `git diff --stat main --` **empty** for `src/editor/model/cutout.ts`, `src/editor/cutoutFiles.ts`, `src/export/exportCutouts.ts`, `PreviewPlayer.tsx`, `LayerVideo.tsx`, `CutoutFollower.tsx`, `timelineScroll.ts`, `src/ui`, `src/theme`, `src/__tests__`, and for every suite Global Constraints lists as unedited? Is the diff of `cutoutRenders.ts` exactly the import, the two deleted lines and the one-line `inTurn`? Is the diff of `timeline.ts` only the two appended exports?
  2. **A clip without the keys.** Trace a v20 clip (no `stabilize`, no `smooth`; once at 1×, once at 0.5×, once with a cut-out) through `steadyOf`, `useSteadyRenders` (`tell`), `ClipFrame`, `LayerPicture`, `steadyNeedsTag`, `contextFor` and `useExport.start`: does any branch differ from `main`? Is any new module function called (`isSteadyAvailable` in `useExport.ts` must come after `some(steadyOf)`)?
  3. **Writers and readers.** Outside tests: is `stabilize` written only in `setClipStabilize` and `migrate.ts`, `smooth` only in `setClipSmooth`, `setClipCutout` (the removal) and `migrate.ts`? Does anything other than `steady.ts`, `ops.ts`, `migrate.ts`, `StabilizeSheet.tsx` (the selected tile, the status row's `on`) and `SmoothSlowSection.tsx` (the switch's value) read `.stabilize` / `.smooth`? Everything else must ask `steadyOf`.
  4. **Speed.** Does any new file compare, multiply or divide by `clip.speed`, or read `speedCurve`? (Only `timeline.ts` may; `steady.ts` asks `isSlowed` / `slowestSpeed`.)
  5. **The exclusion.** Can any sequence of taps (strength, switch, Remove background, speed up and down, reverse through multi-select, undo / redo, Replace with a photo) leave a clip for which BOTH `activeCutout` and `steadyOf(clip) !== null` hold? Can it leave the owner unable to switch something off (a switch that is stored but not on screen and blocks another tool)?
  6. **The queue.** Compare `steadyRenders.ts` with `cutoutRenders.ts` function by function: is every rule kept (settle, cancel at once, grace, deadline from the turn, `epoch`, the one toast, the sweep asking the OPEN project before each removal)? In `make`: can a cancel between the measuring and the writing be lost (`entry.cancelled` is checked before `renderSteady` is called; `giveUp` is null in between)? Can `takeTurn` be left held (`make` always settles: both `answered` calls do)? Is `entry.writing` set before the render's first event can arrive?
  7. **One percent.** Does the busy entry's progress ever run backwards between the two halves (0.4 × the measuring's last fraction ≤ 0.4 ≤ 0.4 + 0.6 × the writing's first)? With a remembered measuring, does it start at 40?
  8. **The path.** Check `steadyShifts` against spec §5 by hand for the jolt vector. Is `lo` in `smoothPath` monotone when the window shrinks near the end? Is every output finite for any input? Is the length of `times` / `dx` / `dy` always equal?
  9. **Names.** For 20 file names (uuid, spaces, a 120-character name, `part-x`, two names that differ only in case) is `steadyFileName` → `parseSteadyName` a round trip, and is the stem the cut-out's? Can a steady name be mistaken for a cut-out name or the reverse (different folders; `-s1-` against `-c1-`)?
  10. **The preview.** With a ready steady copy on a main clip: is the clip's own picture still mounted at the same place in the tree (the `VideoView` never remounts), not hidden, with the follower above it? With `STEADY_PREVIEW.mainVideo` off: is the tree what `main` draws? Do the selectors return a string or null (never `s.files`)?
  11. **The strips.** Explicit heights only (`STRIP.tiles`, `STRIP.slider`); no `flex: 1` for height; no hex literal; spacing from `theme.space` only and no `*` or `/` in a spacing value; no apostrophe in JSX text; no new animation; one `apply` per tap; nothing rendered or stored on an older build. In `SpeedSheet.tsx`: are the two existing rows' elements unchanged character for character? Does the lead's extra chip change the row's `initialX` under a finger (the memo is keyed to `shown`)?
  12. **The export.** Are `sendClip` / `sendLayer` equal to the old expressions when `steadies` is empty and `cutouts` is not? Do the three shares add up to at most 0.7 (sound 0.1, cut-outs 0.3, steady 0.3)? Does Cancel during `prepareSteady` leave the screen idle?
  13. **Sentences.** Every sentence the owner can see, against spec §3 U3 and §8, word for word.
  14. **Test gaps.** What does no test check that could break silently (list them for spec §3a)?
- [ ] **Step 2: Fix** every finding that is a slip (code and its test). Re-run the suites of the task the file belongs to, then `npm run typecheck` and `npm test`. A finding that is a design problem (the spec is wrong or contradicts itself): stop and report, do not improvise.
- [ ] **Step 3: Commit** (only if something changed), one commit per finding or one for all:

```
git add <each changed file, by explicit path>
git commit -m "fix(editor): stabilize and smooth — findings of the TypeScript review" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Swift read-through review, then the ONE EAS build

**Depends on:** Tasks 1–12 merged and green. **This is the single native build of the batch.**

**Files:** Modify only what the review finds, in `modules/clipy-video/ios/SteadyRender.swift`, `ClipyVideoModule.swift` and, if a pinned string changes, `steadyRender.swift.test.ts`.

**Do not touch:** anything else in `src/`; every other Swift file; `eas.json`; `app.json`.

- [ ] **Step 1: The review.** Dispatch an **independent reviewer** (a fresh agent that did not write Task 6; give it the files, not a verdict): `modules/clipy-video/ios/SteadyRender.swift`, `ClipyVideoModule.swift`, `git diff main -- modules/clipy-video/ios`, `CutoutRender.swift` and `MediaPrePass.swift` (code of the same kind that compiled), `Adjust.swift` (`filtered`), spec §6, and `node_modules/expo-modules-core/ios` to read the `Record`, `Field`, `Promise`, `AsyncFunction`, `Function`, `Events` declarations against. It answers each of these, with the line where it is not a clean yes:
  1. **Diff scope.** Does `git diff --stat main -- modules/clipy-video/ios` show only `ClipyVideoModule.swift` and `SteadyRender.swift` (new)? Is every existing function of the module byte-for-byte unchanged apart from the `Events(…)` line?
  2. **Redeclarations and shadowing.** Is any `let` / `var` / `func` / type name declared twice in one scope, or a `static let` beside a `static func` of the same name (`SteadyRender`: `message`, `enter`, `bgraBuffer`, `poolBuffer`, `sourceSpan`, `shownSize`, `pictureOutput`, `measure`, `videoSettings`, `makeWriter`, `place`, `shift`, `placement`, `render`)? Does any local shadow a function it is initialised from (`let span = try sourceSpan(…)` — `span` is not a function; `let pictures = try pictureOutput(…)`; `let move = shift(…)`; `let spot = placement(…)`; `let near`; `let grid`; `let gap`; `let zoom`)? Does any new type name (`ShakeRequest`, `SteadyRequest`, `SteadyError`, `SteadyJob`, `SteadySource`, `SteadyFrame`, `SteadyRender`) exist elsewhere in the module or in an imported framework? Inside the two new `AsyncFunction` closures, does `job` / `jobId` / `source` / `answer` / `lastSent` collide with anything captured?
  3. **Initialisers.** In `SteadySource.init`, is every stored property assigned exactly once? Is `SteadyFrame`'s memberwise initialiser used with both labels?
  4. **Sync / async.** Are `loadTracks(withMediaType:)`, `load(…)`, `Task.sleep`, `finishWriting()` used only with `await` inside `async` functions? Is `SteadyRender.measure` free of `await` and called without it? Is there an `await` inside any `autoreleasepool` closure (there must not be)? Does a closure passed as `progress` escape (it must not: the parameter is not `@escaping`)? Do the closures passed to `autoreleasepool` that mutate nothing but read `times.isEmpty`, `slot`, `held`, `ahead` compile as non-escaping captures of `var`s?
  5. **Availability (iOS 16.4).** For every Apple symbol the file names: `VNTranslationalImageRegistrationRequest` (11.0), `init(targetedCVPixelBuffer:options:completionHandler:)` (11.0), `results: [VNImageTranslationAlignmentObservation]?` (typed since the iOS 15 SDK), `alignmentTransform` (11.0), `VNSequenceRequestHandler.perform(_:on:)` with a `CVPixelBuffer` (11.0), `AVVideoCodecType.hevc` (11.0), `AVAssetWriter.canApply(outputSettings:forMediaType:)`, `AVAssetWriterInput(mediaType:outputSettings:sourceFormatHint:)`, `AVAssetWriterInputPixelBufferAdaptor.pixelBufferPool`, `CIImage.clampedToExtent()`, `CIContext.render(_:to:bounds:colorSpace:)`, `CMTime(seconds:preferredTimescale:)`, the `async` `load` API (15.0). Is anything newer named (`VNTrackTranslationalImageRegistrationRequest` and the Swift-only Vision API of iOS 18 must not appear)?
  6. **Types.** `options: [:]` where `[VNImageOption: Any]` is expected; `registration.results?.first` is a `VNImageTranslationAlignmentObservation` (if the SDK types `results` as `[VNObservation]?` for this class, add `as? VNImageTranslationAlignmentObservation` — the one place a cast may be needed; an always-succeeding cast is a warning, not an error); `found.alignmentTransform.tx` is a `CGFloat`; `CutoutRender.evenSize` returns `(width: Int, height: Int)`; the labelled tuples returned from `sourceSpan`, `shownSize`, `shift` and the `autoreleasepool` closure of `measure`, and how each is taken apart; `let slots: [CVPixelBuffer] = [try …, try …]`; `AVVideoCodecKey: codec` with `codec: AVVideoCodecType` (as `CutoutRender` passes `AVVideoCodecType.hevcWithAlpha`); `[CIImageOption.colorSpace: space]`; `NSNumber(value: weight)` with a `Double`; `min(240, request.grid.rounded())`; `Double(gridIndex) / grid`; `steadyJobs[id] === job` (an optional class reference against a class reference); `[String: Any]` everywhere a dictionary is handed to AVFoundation, Core Video or `promise.resolve`; `["times": times, "dx": dx, "dy": dy, …]` with `[Double]` values.
  7. **The record.** Does `expo-modules-core` convert a JavaScript array of numbers into a `@Field var times: [Double] = []` (read `Field`, `Record` and the array's dynamic type in `node_modules/expo-modules-core/ios`; `ExportRequest` already has fields that are arrays of records, and `ExportClip.gain` / `speedSpans` are arrays)? Are `from` and `to` acceptable `@Field` names (the cut-out's record uses them)?
  8. **Optionals.** `registration.results?.first`, `adaptor.pixelBufferPool`, `CMSampleBufferGetImageBuffer`, `ExportSession.fileURL(from:)`, `reader.error` / `writer.error` into `ExportSession.describe(_: Error?)`, `held` / `ahead`, `source.audio`, `Adjust.filtered(…)`. No force unwrap anywhere?
  9. **Lifetimes.** What keeps the `AVURLAsset` alive while `measure` and `render` read (the module's `let source` in the Task, until the call has returned)? Are the two held buffers of `render` overwritten while a Core Image render that reads them is still pending (every `context.render` is synchronous; a new source frame is rendered into the slot `held` does NOT use, and only when `ahead` is nil)? In `measure`, is the buffer of the frame before (`slots[1 - slot]`) intact when Vision reads it?
  10. **Exactly once, the gate, the job store.** In each new `AsyncFunction`: can the promise be settled twice or never (trace: a bad output path; a cancel while waiting at the gate; a cancel in the loop; a reader failure; a writer failure; no frame; success)? Is `CutoutRender.leave()` reached on every path after `enter` returned, and never without it (the `defer` sits directly after the `try await enter`)? Is the job removed on every path — and can the measuring's `dropSteadyJob` remove the RENDER's job stored under the same id (it must not: the identity check)?
  11. **The loops.** `measure`: does it end (the reader returns nil), and is the reader cancelled on a cancel? `render`: can a pass do nothing and not sleep? Walk the grid branch: (a) the first frame held, no frame ahead, source not done → reads; (b) both held → writes grid frames until one reaches `b.time`, then moves on without writing; (c) source done, one frame held → writes it until the range's end; (d) source done and nothing held → finishes, and the function throws "no picture came out"; (e) the range's end reached while the reader still has frames → the picture is finished, the reader is cancelled before the session ends, the status guard accepts `.reading`. Is `markAsFinished` called exactly once per input before `finishWriting`? Can two grid frames get the same time, or a time not later than the one before (times are `start + k / grid` with a growing `k`)? Is every throwing path inside the `do` covered by the one `catch` that cancels the reader, cancels the writer and removes the part file?
  12. **Exceptions that cannot be caught.** Is the picture input made only from settings that passed `canApply`? Is every `add` preceded by `canAdd`? Is `append` only called while `isReadyForMoreMediaData`? Is `startSession` called once, after `startWriting`? Is `endSession` called only on a writer whose status is `.writing`? Is `setValue(_:forKey:)` reached only through `Adjust.filtered` (which checks the filter's keys)?
  13. **The geometry.** In `placement`: is the order "upright → centre to the origin → scale → back and move" what `concatenating` gives (the receiver is applied first)? With zoom 1.1 and a move of ±0.05 of the width, does the placed picture still cover the whole `rect`? Is `clampedToExtent()` applied before the transform and the crop after?
  14. **Errors.** Does every failure path produce `steady <stage>: …`, with `ExportSession.describe` where an `Error` exists? Does `SteadyRender.message` pass a `SteadyError` through untouched?
  15. **Expo Modules API.** Do `Events("onExportEvent", "onSoundEvent", "onCutoutEvent", "onSteadyEvent")`, the two `AsyncFunction` closures `(request: …Request, promise: Promise)` and the `Function` closure `(jobId: String)` match what `expo-modules-core` declares, the way `renderCutout` / `cancelCutout` already do?
  16. **Imports and linking.** `AVFoundation`, `CoreImage`, `CoreMedia`, `CoreVideo`, `ExpoModulesCore`, `Vision` (already linked for the cut-out). Does the podspec need anything new? (It should not.)
- [ ] **Step 2: Fix** every finding in the Swift (and a pinned string in `steadyRender.swift.test.ts` when a line it quotes changed). Re-run `npx.cmd jest src/editor/model/__tests__/steadyRender.swift.test.ts src/editor/model/__tests__/cutoutRender.swift.test.ts src/editor/model/__tests__/soundRender.swift.test.ts src/editor/model/__tests__/speechRender.swift.test.ts src/editor/model/__tests__/beatEnvelope.parity.test.ts src/editor/model/__tests__/layersExport.swift.test.ts src/editor/__tests__/looks.frozen.test.ts`, then `npm run typecheck` and `npm test`. If anything was changed, commit:

```
git add modules/clipy-video/ios/SteadyRender.swift modules/clipy-video/ios/ClipyVideoModule.swift src/editor/model/__tests__/steadyRender.swift.test.ts
git commit -m "fix(native): stabilize and smooth — findings of the Swift read-through" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

If the reviewer found a design problem (not a slip), stop and report instead of building.
- [ ] **Step 3: The build.** Only now, once: `npx.cmd eas-cli build --profile development --platform ios --non-interactive --no-wait --json`. Note the build id and URL from the JSON. Check it with `npx.cmd eas-cli build:view <id> --json` until it is `FINISHED` or `ERRORED` (about 6–10 minutes; do not start a second build while one is running).
- [ ] **Step 4: If it errored,** read the Xcode log (`npx.cmd eas-cli build:view <id>` gives the log URL), fix exactly what the compiler names, re-run the seven suites and the full checks, commit — `fix(native): <what the compiler said>` with the trailer and explicit paths — and build again. Every extra build is reported with its reason. **No other change rides along.**
- [ ] **Step 5: Hand over.** Give the owner the install link and Part B of the device checklist (spec §12), with one sentence first: after installing, **Accounts** must read "App build: stabilize and smooth"; if it does not, the install did not happen. Say which answers decide what happens next: 8 (calmer / the same / shakier, and on which axis — a TypeScript number, no build), 13 and 18 (the export; only "the preview is smooth and the export is not" needs a second build). Nothing is committed in this step.

---

### Task 14: Docs, full checks, device checklist

**Depends on:** Tasks 1–13.

**Files:** Modify `README.md`, `AGENTS.md`, `docs/superpowers/specs/2026-10-10-stabilize-smooth-design.md`; any file the sweep below names.

**Do not touch:** behaviour. A failing test means a mistake here.

- [ ] **Step 1: Sweep** with the Grep tool (not `sed`) and fix what is found:
  - `git diff --stat main -- modules/clipy-video/ios` shows only `ClipyVideoModule.swift` and `SteadyRender.swift` (new); `git diff main -- modules/clipy-video/ios/ExportSession.swift modules/clipy-video/ios/ClipyCompositor.swift modules/clipy-video/ios/MediaPrePass.swift modules/clipy-video/ios/SpeedSpans.swift modules/clipy-video/ios/CutoutRender.swift modules/clipy-video/ios/Adjust.swift` is **empty**.
  - `git diff --stat main -- src/editor/components/PreviewPlayer.tsx src/editor/components/LayerVideo.tsx src/editor/components/CutoutFollower.tsx src/editor/previewHandoff.ts src/editor/timelineScroll.ts src/editor/model/cutout.ts src/editor/cutoutFiles.ts src/export/exportCutouts.ts src/editor/model/audioMix.ts src/editor/soundRenders.ts scripts assets src/ui src/theme src/__tests__` is **empty**; every suite Global Constraints lists as unedited is unchanged (`git diff --stat main --` on each).
  - `.stabilize =`, `stabilize:`, `.smooth =`, `smooth: true` in `src/` outside tests: only the two ops, `setClipCutout`'s removal and the sanity pass write the keys (`{ ...clip, stabilize: level }` / `{ ...clip, smooth: true }` in the two components build a clip to ASK about, never to store).
  - `measureShake(` / `renderSteady(` called outside `steadyRenders.ts` and tests: none. `ensureSteady(` outside `steadyRenders.ts`, `exportSteady.ts` and tests: none. `takeTurn(` outside `renderTurn.ts`, `cutoutRenders.ts`, `steadyRenders.ts` and tests: none.
  - `clip.speed`, `.speedCurve`, `speedSpans(` in the files this batch created: none (they ask `isSlowed` / `slowestSpeed`).
  - `STEADY_VERSION` is 1; `steadyPath.ts` has no `import` line.
  - Comments that still say "v20" for the current schema: corrected (not historical test titles).
- [ ] **Step 2: Docs.**
  - `README.md`, the clip / layer tools: a bullet **Stabilize** — Off / Low / Medium / High on a video clip or layer; the phone measures the shake and prepares a steadied copy with a percent (zoomed in 5 / 10 / 15 %); up / down / left / right only; up to 60 seconds of clip; not for reversed clips or together with Remove background; the original is never changed; needs the latest build. And a bullet under Speed: **Slow motion** tab, **Smooth slow motion** — for a clip slowed under 1×, a copy with blended in-between frames (60 or 120 a second) so the slow motion does not stutter, in the preview and the export; soft on fast movement; the same limits.
  - `README.md`, **First native build — things to check**: add the items of spec §10 as one numbered item, "Stabilize and smooth", with the eleven sub-points and each one's fallback.
  - `AGENTS.md` "This repo": a new bullet directly after the Remove background bullet (if that bullet is missing, after **Sound tools**):

    ``- Stabilize / Smooth slow motion: a clip's `stabilize` (`"low" | "medium" | "high"`) and `smooth` (`true`) (schema 21) are optional and ABSENT when off; only `setClipStabilize` / `setClipSmooth` write them and everything reads `steadyOf(clip)` (`src/editor/model/steady.ts`: null, or ONE copy `{ level, grid }` for a video that plays forwards and has no cut-out — `smooth` counts only while the clip is slowed, `isSlowed` / `slowestSpeed` in timeline.ts, which also pick the grid: 60 frames per source second, 120 under 0.5×). Remove background and these two never share a clip (the ops refuse; the sanity pass keeps the cut-out). The copy lives in `<project>/steady/`, is named `<stem>-s<version>-<level>-<grid>-<from>-<to>.mov` on the cut-out's range (`cutoutRange`) and keeps the source's timeline, so the preview and the export swap only the uri — `ExportSession.swift` is untouched. `steadyRenders.ts` is the cut-out queue's sibling (settle, cancel, grace, deadline, sweep on open) and shares its turn: `takeTurn` (`src/editor/renderTurn.ts`) and natively `CutoutRender.takeGate()` — one heavy render at a time across cut-outs and steady copies. Stabilize is two native calls inside one turn: `measureShake` (`SteadyRender.measure`: `VNTranslationalImageRegistrationRequest`, this frame targeted, the frame before in the handler — iOS 11; never the iOS 17 tracking request) reports numbers, `steadyShifts` (`src/editor/model/steadyPath.ts`, TypeScript only, no imports — NEVER mirror it in Swift) turns them into clamped per-frame corrections, `renderSteady` applies them with the strength's fixed zoom and, with a grid, writes blended in-between frames (`CIDissolveTransition` through `Adjust.filtered`). What Vision's numbers mean (`STEADY.scaleX` / `scaleY`), the windows and zooms (`STEADY_LEVELS`), the grids (`SMOOTH`) and the bitrate are TypeScript and travel in the request; raise `STEADY_VERSION` when a number that changes the copy changes. What was measured is remembered for the session (`shakes`), never stored. The preview shows a main clip's copy in the `CutoutFollower` laid OVER its own (still visible) picture, a layer's in its own player; `STEADY_PREVIEW` switches either off. Gate with `isSteadyAvailable()`; say `STEADY_TOOLS`. The Speed strip's third tab (Slow motion, `SmoothSlowSection.tsx`) is there only for one slowed clip; its switch is "Smooth slow motion" — the Curve tab's "Smooth" is the ramp's form and is a different thing.``

    and in the **Toolbar** bullet, after the Cut out sentence: ``Stabilize (`stabilize`) is a strip on a video's bar, not on a reversed clip's; Reverse is not on the bar of a clip that has a steady copy (`steadyOf`).``
  - Spec: Status → `Implemented <date> (on-device confirmation by the owner pending)`; add a section **3a. As built** after §3: the commit of each task, the build id(s) and how many builds it took and why, every finding of the two reviews and its fix, every deviation the tasks reported (values that changed, tests whose expectations changed — file and title, files outside the plan), and what no test checks (§10 item by item).
- [ ] **Step 3: Full checks.** `npm run typecheck`; `npm test`; `npx.cmd expo-doctor`; `git status --short` shows nothing unexpected; `git diff --stat main` shows **no change** under `ios/`, `android/`, `supabase/`, `src/publish/`, `src/theme/`, `src/ui/`, `package.json`, `app.json`, `eas.json`, `assets/`, `scripts/`.
- [ ] **Step 4: Commit.**

```
git add README.md AGENTS.md docs/superpowers/specs/2026-10-10-stabilize-smooth-design.md <any file the sweep changed, by explicit path>
git commit -m "docs: stabilize and smooth slow motion as built, README, AGENTS, device checklist" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Pairwise: what each task hands the next, and what may run side by side

| Pair | Shared file or interface | Producer hands over | Consumer relies on | Side by side? |
|---|---|---|---|---|
| 1 ∥ 2 ∥ 3 ∥ 4 | — | 1: `types.ts`, `migrate.ts`, `ops.ts`, `timeline.ts` · 2: `index.ts`, `buildInfo.ts` · 3: `steadyPath.ts` · 4: `renderTurn.ts`, `cutoutRenders.ts` | none reads another's new export | **yes** |
| 1 → 5 | `types.ts`, `timeline.ts` | `Clip.stabilize?` / `smooth?`, `STABILIZE_IDS`, `isSlowed`, `slowestSpeed` | `steadyOf`, the fixtures | no (5 after 1) |
| 2 → 6 | the shapes of `measureShake` / `renderSteady` | fixed by this plan (Task 2's interfaces = Task 6's records); `steadyRender.swift.test.ts` compares them | 6 must not edit `index.ts` | no (6 after 2, so the wrapper lines the test reads exist) |
| 5 ∥ 6 | — | 5: `steady.ts` · 6: Swift, three swift-reading tests | nothing in common | **yes** |
| 2, 3, 4, 5 → 7 | `index.ts`, `steadyPath.ts`, `renderTurn.ts`, `steady.ts`, `buildInfo.ts` | the native calls; `steadyShifts`; `takeTurn`; the model; `STEADY_TOOLS` | `steadyFiles.ts`, `steadyRenders.ts` | no (7 after all four) |
| 6 ∥ 7 | — | 6: Swift · 7: the two stores, the editor screen | nothing in common | **yes** if 6 is still running |
| 7 → 8 | `steadyFiles.ts` | `shownSteady`, `useSteadyFiles`, `SteadyFile` | `ClipFrame.tsx`, `LayerStack.tsx`, `PreviewTag.tsx` | no (8 after 7) |
| 1, 7 → 9 | `ops.ts`, `steadyFiles.ts`, `steadyRenders.ts` | `setClipStabilize`; `steadyFileOf`, `steadyNeedOf`, `retrySteady` | `StabilizeSheet.tsx`; `contextFor` asks `steadyOf` | no (9 after both) |
| 1, 7 → 10 | the same | `setClipSmooth`, `isSlowed`; the same store functions | `SmoothSlowSection.tsx`, `SpeedSheet.tsx` | no (10 after both) |
| 7 → 11 | `steadyRenders.ts` | `ensureSteady`, `steadyDir` | `exportSteady.ts`, `useExport.ts` | no (11 after 7) |
| 8 ∥ 9 ∥ 10 ∥ 11 | — | 8: three preview components · 9: toolbar files, `StabilizeSheet.tsx`, `CutoutSheet.tsx` · 10: `SpeedSheet.tsx`, `SmoothSlowSection.tsx` · 11: export files | nothing in common (all four READ `steadyFiles.ts` / `steady.ts`) | **yes** |
| 1–11 → 12 | the TypeScript | — | the review | no |
| 6, 12 → 13 | the Swift | the complete Swift | the review and the one build | no |
| 1–13 → 14 | docs | — | — | no (last) |

**Parallel order, with what each may not touch**

1. **Tasks 1, 2, 3, 4** together. 1: only `types.ts`, `migrate.ts`, `ops.ts`, `timeline.ts` and the tests it names. 2: only `index.ts`, `index.steady.test.ts`, `buildInfo.ts`, `buildInfo.test.ts` (and one mock line where a suite calls `buildLabel()`). 3: its two new files. 4: `renderTurn.ts`, its test, `cutoutRenders.ts`. None touches a component.
2. **Tasks 5, 6** together. 5: its two new files. 6: `SteadyRender.swift`, `ClipyVideoModule.swift`, `steadyRender.swift.test.ts`, one string in each of `cutoutRender.swift.test.ts` and `soundRender.swift.test.ts`. Neither starts a build; neither edits `index.ts`.
3. **Task 7** alone (Task 6 may still be finishing): `steadyFiles.ts`, `steadyRenders.ts`, their test, two lines in `app/editor/[id]/index.tsx`.
4. **Tasks 8, 9, 10, 11** together. 8: `ClipFrame.tsx`, `LayerStack.tsx`, `PreviewTag.tsx`, its test. 9: `toolbarContext.ts`, `toolGroups.ts`, `toolStrip.ts`, `EditorToolbar.tsx`, `StabilizeSheet.tsx`, `CutoutSheet.tsx`, their tests and the four pinned lists. 10: `SpeedSheet.tsx`, `SmoothSlowSection.tsx`, its test. 11: `exportSteady.ts`, `useExport.ts`, their tests. **9 does not open `SpeedSheet.tsx`; 10 does not open `EditorToolbar.tsx` or `toolbarContext.ts`.**
5. **Task 12** alone: the TypeScript review and its fixes.
6. **Task 13** alone: the Swift review, the fixes, **the one build**.
7. **Task 14** alone.

---

## Device checklist (owner)

The checklist is §12 of the spec, in the owner's words. In one line: **Part A works with the app you already have** (both tools are on screen and say they need the new app; nothing else changed). **Part B needs the new app**, installed once from the link sent after the build; the first thing to look at is **Accounts**, which must read "App build: stabilize and smooth". The answers that decide what happens next are items 8 (is a stabilised clip calmer, the same or shakier, and on which axis: a number in TypeScript, no build), and 13, 17 and 18 (is the slow motion smoother in the preview and in the exported file: only "smooth in the preview, not in the export" needs a second build).
