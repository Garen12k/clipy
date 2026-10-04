# CapCut Group G — Polish (Export Options, Cover, Snapping, Multi-select) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Frame-rate and quality choices for the export, a cover (frame + title) per project that the drafts list and Instagram use, snapping for every timeline bar, and multi-select for main clips.

**Architecture:** Schema v13 adds `Project.exportSettings` and `Project.cover`. Bitrate maths lives in `src/export/estimate.ts` and is sent to the engine as a number; snap maths lives in one new pure module `src/editor/model/snap.ts` with a small gesture-side helper (`src/editor/snapping.ts`); multi-select is one store field plus a generic `forClips` op that folds the existing single-clip ops over a list. The Swift change is two lines of behaviour (frame duration, file-length limit).

**Tech Stack:** Expo SDK 57, TypeScript strict, Zustand, react-native-gesture-handler, `@react-native-community/slider`, `react-native-view-shot` (new, Task 5), `expo-media-library/legacy`, Jest + RNTL v14; Swift / AVFoundation (uncompiled); Supabase Edge Function code tested under Node.

**Spec:** `docs/superpowers/specs/2026-10-04-capcut-g-polish-design.md` (binding; §2 holds the schema, §3 the bitrate formula, §5 the snap rules and the edge table).

## Global Constraints

- **iPhone only.** No Android or web configuration, files or code paths.
- **Expo Go must keep working:** the native module `modules/clipy-video` is absent there; nothing in this round may require it outside the export itself. `react-native-view-shot` is in Expo Go (SDK 57 docs); its use still fails gracefully.
- **Projects without these features are unchanged:** defaults `exportSettings { fps: 30, quality: "standard" }`, `cover null`; same preview tree. (The export of a default project now carries a file-length limit — spec §3 — and nothing else differs.)
- UI from `src/ui/` and `src/theme/theme.ts` only; **no hex literals** in screens (`src/__tests__/noHexLiterals.test.ts`).
- A clip or layer by id is resolved with `findItem` / `itemOffsetAt` — never `project.clips.find` (multi-select deliberately works on main clips only and says so through `mainClipIds`).
- **Only `src/editor/model/timeline.ts` multiplies / divides by `speed` or reads `speedCurve` steps.** New code gets lengths and source times from `clipDuration`, `clipStartTimes`, `layerEnd`, `sourceAfter`, `frameAt`.
- **Never touch `src/editor/timelineScroll.ts`.** No `scrollTo` and no new work in scroll-end handlers; timeline additions are out of the flow and change neither the scroll width nor the paddings.
- Gestures: `.runOnJS(true)`; gesture state in a ref object (never captured variables or React state).
- The main preview `VideoView` never remounts because of anything in this round.
- One undo step per gesture / drag / button. Export settings are not undo steps.
- Swift is never compiled here: verify by reading against `node_modules/expo-modules-core/ios` and Apple's documented API; list every unverified API in the report.
- New packages only with `npx.cmd expo install <name>` after checking the SDK 57 docs (https://docs.expo.dev/versions/v57.0.0/). This round adds exactly one: `react-native-view-shot` (Task 5).
- Windows: PowerShell, no `&&`, `npx.cmd`. Never run `expo lint` or anything else that rewrites package.json. No broad `sed`. Never `git stash`. `git add` explicit paths only — never `-A` / `.`. Before each commit: `npm run typecheck` and `npm test` green. Commit trailer exactly `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- RNTL v14: `render` / `fireEvent` are async — always `await`. Component tests live in `src/editor/__tests__/` (not beside the component). The mocked Slider is driven with `fireEvent(slider, "slidingStart")` / `fireEvent(slider, "valueChange", v)`; mocked gestures through `element.props.gesture.handlers.onStart / onUpdate / onEnd / onFinalize` inside `act`.

## Task order

Task 1 first. Then **in parallel:** 2, 4, 6, 7. After 2: 3 and 5 (parallel). After 5 and 7: 8. Last: 9.

---

### Task 1: Schema v13 and cover-time helpers

**Depends on:** nothing.

**Files:** Modify `src/editor/model/types.ts`, `src/editor/model/migrate.ts`, `src/editor/model/timeline.ts`, `src/projects/storage.ts` (the project literal in `createProject` only); create `src/editor/model/__tests__/types.polish.test.ts`, `src/editor/model/__tests__/timeline.cover.test.ts`; modify `src/editor/model/__tests__/migrate.test.ts` and every test that pins the schema number (`grep -rn "toBe(12)\|schemaVersion: 12\|is v12" src` — 20 places in `migrate.test.ts` and the `types.*.test.ts` files: change the number to 13, nothing else).

**Do not touch:** `src/editor/model/ops.ts`, `src/editor/store.ts` (Task 2).

**Interfaces — Produces**

```ts
// types.ts — spec §2 verbatim, plus:
export function clampExportSettings(v: unknown): ExportSettings   // always a fresh object
export function clampCoverTitle(v: unknown): string               // not a string → ""; trim → first 40 code points → trim
export function clampCover(v: unknown, total: number): Cover | null
// Project gains `exportSettings: ExportSettings; cover: Cover | null`; makeProject defaults them ({ ...DEFAULT_EXPORT_SETTINGS }, null)

// timeline.ts
export const LAST_FRAME_SLACK = 0.05;
export function coverTimeOf(p: Project): number
export function frameAt(p: Project, time: number): { clip: Clip; sourceTime: number } | null
```

- [ ] **Step 1: Failing tests.** Create `src/editor/model/__tests__/types.polish.test.ts`:

```ts
import { clampCover, clampCoverTitle, clampExportSettings, COVER_LIMITS, DEFAULT_EXPORT_SETTINGS, EXPORT_FPS, EXPORT_QUALITIES, makeProject, SCHEMA_VERSION } from "../types";

test("schema is v13 and a new project has the polish defaults", () => {
  expect(SCHEMA_VERSION).toBe(13);
  expect(EXPORT_FPS).toEqual([24, 30, 60]);
  expect(EXPORT_QUALITIES).toEqual(["standard", "high"]);
  expect(COVER_LIMITS.titleMax).toBe(40);
  const p = makeProject();
  expect(p).toMatchObject({ schemaVersion: 13, exportSettings: { fps: 30, quality: "standard" }, cover: null });
  expect(p.exportSettings).not.toBe(DEFAULT_EXPORT_SETTINGS);   // its own object
});

test("clampExportSettings keeps known values and repairs the rest", () => {
  expect(clampExportSettings({ fps: 60, quality: "high" })).toEqual({ fps: 60, quality: "high" });
  expect(clampExportSettings({ fps: 24, quality: "ultra", extra: 1 })).toEqual({ fps: 24, quality: "standard" });
  expect(clampExportSettings({ fps: 25, quality: "high" })).toEqual({ fps: 30, quality: "high" });
  expect(clampExportSettings({ fps: "60" })).toEqual({ fps: 30, quality: "standard" });
  for (const junk of [null, undefined, 7, "x", []]) expect(clampExportSettings(junk)).toEqual({ fps: 30, quality: "standard" });
});

test("clampCoverTitle trims, cuts to 40 whole characters and never ends with a space", () => {
  expect(clampCoverTitle("  Beach day  ")).toBe("Beach day");
  expect(clampCoverTitle("a".repeat(45))).toBe("a".repeat(40));
  // 39 letters + a space + "z" = 41 characters: the cut keeps 39 letters + the space, the second trim drops the space.
  expect(clampCoverTitle("b".repeat(39) + " z")).toBe("b".repeat(39));
  // An emoji is one character (two UTF-16 units): 41 waves → 40 waves, none cut in half.
  expect(Array.from(clampCoverTitle("🌊".repeat(41)))).toHaveLength(40);
  for (const junk of [42, null, undefined, {}]) expect(clampCoverTitle(junk)).toBe("");
});

test("clampCover: a finite time inside the project, a clean title, or null", () => {
  expect(clampCover({ time: 2.5, title: " Hi " }, 7)).toEqual({ time: 2.5, title: "Hi" });
  expect(clampCover({ time: 99, title: "" }, 7)).toEqual({ time: 7, title: "" });
  expect(clampCover({ time: -1, title: "x" }, 7)).toEqual({ time: 0, title: "x" });
  expect(clampCover({ time: 1.23456, title: "x" }, 7)).toEqual({ time: 1.235, title: "x" });   // 1234.56 ms → 1235 ms
  expect(clampCover({ time: 3, title: 5 }, 7)).toEqual({ time: 3, title: "" });
  expect(clampCover({ time: 3, title: "x" }, 0)).toEqual({ time: 0, title: "x" });              // empty project
  for (const junk of [null, undefined, "first", 3, [], { title: "x" }, { time: NaN, title: "x" }, { time: Infinity, title: "x" }, { time: "3", title: "x" }])
    expect(clampCover(junk, 7)).toBeNull();
});

test("clampCover is idempotent, also when rounding lands past the end", () => {
  // 6.99996 rounds to 7.000, which is past a 6.9999 s project → clamped to 6.9999; a second pass rounds and clamps to the same.
  const once = clampCover({ time: 6.99996, title: "b".repeat(39) + " z" }, 6.9999);
  expect(once).toEqual({ time: 6.9999, title: "b".repeat(39) });
  expect(clampCover(once, 6.9999)).toEqual(once);
});
```

Create `src/editor/model/__tests__/timeline.cover.test.ts`:

```ts
import { coverTimeOf, frameAt, LAST_FRAME_SLACK } from "../timeline";
import { makeClip, makePhotoClip, makeProject, type Cover } from "../types";

const a = makeClip({ id: "a", sourceDuration: 4 });              // timeline 0–4
const b = makeClip({ id: "b", sourceDuration: 6, speed: 2 });    // 6 / 2 = 3 s → timeline 4–7
const p = (cover: Cover | null = null) => makeProject({ clips: [a, b], cover });

test("coverTimeOf: 0 without a cover, else the time clamped to the project as it is now", () => {
  expect(coverTimeOf(p())).toBe(0);
  expect(coverTimeOf(p({ time: 5, title: "" }))).toBe(5);
  expect(coverTimeOf(p({ time: 99, title: "" }))).toBe(7);    // beyond the end (clips were deleted) → the end, 4 + 3
  expect(coverTimeOf(p({ time: -2, title: "" }))).toBe(0);
  expect(coverTimeOf(p({ time: NaN, title: "" }))).toBe(0);
  expect(coverTimeOf(makeProject({ cover: { time: 3, title: "" } }))).toBe(0);   // no clips
});

test("frameAt gives the clip and the source second shown at a project time", () => {
  expect(LAST_FRAME_SLACK).toBe(0.05);
  expect(frameAt(p(), 2)).toEqual({ clip: a, sourceTime: 2 });
  expect(frameAt(p(), 5)).toEqual({ clip: b, sourceTime: 2 });     // 1 s into b at 2× → source 0 + 1 × 2
  expect(frameAt(p(), -1)).toEqual({ clip: a, sourceTime: 0 });
  // The end is pulled back by the slack: 7 − 0.05 = 6.95 → 2.95 s into b → source 2.95 × 2 = 5.9
  const end = frameAt(p(), 7)!;
  expect(end.clip).toBe(b);
  expect(end.sourceTime).toBeCloseTo(5.9, 9);
  expect(frameAt(p(), Infinity)).toEqual({ clip: a, sourceTime: 0 });   // not finite → the start
  expect(frameAt(makeProject(), 1)).toBeNull();
});

test("frameAt: a reversed clip is read backwards, a photo is always its one picture", () => {
  const rb = { ...b, reversed: true };
  expect(frameAt(makeProject({ clips: [a, rb] }), 5)).toEqual({ clip: rb, sourceTime: 4 });   // trimEnd 6 − 1 × 2
  const ph = makePhotoClip({ id: "ph", seconds: 3 });
  expect(frameAt(makeProject({ clips: [ph, a] }), 1)).toEqual({ clip: ph, sourceTime: 0 });
});
```

Append to `src/editor/model/__tests__/migrate.test.ts`:

```ts
test("v12 → v13 adds export settings and no cover; the sanity pass repairs both; idempotent", () => {
  const clips = [makeClip({ id: "a", sourceDuration: 4 }), makeClip({ id: "b", sourceDuration: 6, speed: 2 })];   // 4 + 6 / 2 = 7 s
  const v12 = { ...makeProject({ clips }), schemaVersion: 12 } as Record<string, unknown>;
  delete v12.exportSettings; delete v12.cover;
  expect(migrateProject(v12)).toMatchObject({ schemaVersion: 13, exportSettings: { fps: 30, quality: "standard" }, cover: null });

  const bad = migrateProject({ ...makeProject({ clips }), exportSettings: { fps: 25, quality: "high" }, cover: { time: 99, title: "  " + "t".repeat(50) } });
  expect(bad.exportSettings).toEqual({ fps: 30, quality: "high" });
  expect(bad.cover).toEqual({ time: 7, title: "t".repeat(40) });
  expect(migrateProject(JSON.parse(JSON.stringify(bad)))).toEqual(bad);

  expect(migrateProject({ ...makeProject({ clips }), cover: { time: NaN, title: "x" } }).cover).toBeNull();
  expect(migrateProject({ ...makeProject({ clips }), cover: "first" }).cover).toBeNull();
  expect(migrateProject({ ...makeProject(), cover: { time: 3, title: "x" } }).cover).toEqual({ time: 0, title: "x" });   // no clips → 0
});
```

Also: extend the existing "v1 chain" test with `expect(p).toMatchObject({ exportSettings: { fps: 30, quality: "standard" }, cover: null })`.

- [ ] **Step 2: Run** `npx.cmd jest src/editor/model` → FAIL (missing exports, schema 12).
- [ ] **Step 3: Implement.**

`types.ts` (constants and types from spec §2 next to the other registries; the three clamps beside `clampEffectRect` — they use the file's `isRec` / `isNum` / `clampNum`):

```ts
export function clampExportSettings(v: unknown): ExportSettings {
  const r = isRec(v) ? v : {};
  return {
    fps: (EXPORT_FPS as readonly unknown[]).includes(r.fps) ? (r.fps as ExportFps) : DEFAULT_EXPORT_SETTINGS.fps,
    quality: (EXPORT_QUALITIES as readonly unknown[]).includes(r.quality) ? (r.quality as ExportQuality) : DEFAULT_EXPORT_SETTINGS.quality,
  };
}
export const clampCoverTitle = (v: unknown): string =>
  (typeof v === "string" ? Array.from(v.trim()).slice(0, COVER_LIMITS.titleMax).join("").trim() : "");
/** `total` = the project's length in seconds. Round first, then clamp (that order makes it idempotent). */
export function clampCover(v: unknown, total: number): Cover | null {
  if (!isRec(v) || !isNum(v.time)) return null;
  return { time: clampNum(Math.round(v.time * 1000) / 1000, 0, isNum(total) ? Math.max(0, total) : 0), title: clampCoverTitle(v.title) };
}
```

`makeProject`: add `exportSettings: { ...DEFAULT_EXPORT_SETTINGS }, cover: null` before `...partial`.

`migrate.ts` — in `normaliseCurrent`'s return add `exportSettings: clampExportSettings(raw.exportSettings), cover: clampCover(raw.cover, clips.reduce((s, c) => s + clipDuration(c), 0))` (import `clipDuration` from `./timeline`; `clips` is the already-normalised list). Update the doc comment ("v2–v13 … export settings are known values, the cover is inside the project or null") and the `// v2 → v12` comment.

`timeline.ts` (after `clipAt`):

```ts
/** The cover's project time as read: 0 without a cover, else the stored time clamped to the project as it is now. */
export function coverTimeOf(p: Project): number {
  if (!p.cover || !Number.isFinite(p.cover.time)) return 0;
  return Math.max(0, Math.min(p.cover.time, totalDuration(p)));
}
/** How far before the project's end the last frame is read (a thumbnail at exactly the end of a file can fail). */
export const LAST_FRAME_SLACK = 0.05;
/** The main clip and the SOURCE second shown at a project time (a photo: 0); null for an empty project. */
export function frameAt(p: Project, time: number): { clip: Clip; sourceTime: number } | null {
  const last = Math.max(0, totalDuration(p) - LAST_FRAME_SLACK);
  const hit = clipAt(p, Number.isFinite(time) ? Math.max(0, Math.min(time, last)) : 0);
  if (!hit) return null;
  return { clip: hit.clip, sourceTime: hit.clip.kind === "photo" ? 0 : sourceTimeAt(hit.clip, hit.offsetInClip) };
}
```

`storage.ts` `createProject`: add `exportSettings: { ...DEFAULT_EXPORT_SETTINGS }, cover: null` to the literal (import the constant).

- [ ] **Step 4:** `npm run typecheck`; `npm test` (fix any other project literal the type checker reports — report each).
- [ ] **Step 5: Commit** — `git add` the files above; `feat(model): schema v13 — export settings and cover`.

---

### Task 2: Ops and store — cover, multi-clip ops, multi-select, export settings

**Depends on:** Task 1.

**Files:** Modify `src/editor/model/ops.ts`, `src/editor/store.ts`; create `src/editor/model/__tests__/ops.polish.test.ts`, `src/editor/__tests__/store.polish.test.ts`.

**Do not touch:** `types.ts`, `timeline.ts`, any component.

**Interfaces — Consumes:** `clampCover`, `clampExportSettings`, `ExportSettings`, `Cover` (Task 1); the existing `touch`, `normaliseTransitions`, `copyClipAnimation`, `copyPins`, `copyCurve`, `copyChroma`, `NO_TRANSITION` inside `ops.ts`.

**Interfaces — Produces**

```ts
// ops.ts
export function setCover(p: Project, cover: Cover | null): Project
export function mainClipIds(p: Project, ids: readonly string[]): string[]            // the ids that are MAIN clips, timeline order, no repeats
export function forClips(p: Project, ids: readonly string[], op: (p: Project, id: string) => Project): Project
export function deleteClips(p: Project, ids: readonly string[]): Project
export function duplicateClips(p: Project, ids: readonly string[]): Project
// store.ts
multiSelect: string[] | null;
enterMultiSelect: () => void;
toggleMultiSelect: (id: string) => void;
selectAllClips: () => void;
exitMultiSelect: () => void;
setExportSettings: (s: ExportSettings) => void;
```

- [ ] **Step 1: Failing tests.** Create `src/editor/model/__tests__/ops.polish.test.ts`:

```ts
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-04T10:00:00.000Z" }));
let mockN = 0;
jest.mock("@/src/lib/id", () => ({ newId: () => `n${++mockN}` }));
import { deleteClips, duplicateClips, forClips, mainClipIds, setClipSpeed, setClipVolume, setCover } from "../ops";
import { coverTimeOf, totalDuration } from "../timeline";
import { makeClip, makeEffect, makeLayer, makePhotoClip, makeProject } from "../types";

const a = makeClip({ id: "a", sourceDuration: 4, transitionOut: { type: "fade", duration: 0.5 } });   // 0–4
const b = makeClip({ id: "b", sourceDuration: 6 });                                                    // 4–10
const c = makePhotoClip({ id: "c", seconds: 5 });                                                      // 10–15
const l = makeLayer({ id: "l", sourceDuration: 2, start: 1 });
const p = makeProject({ clips: [a, b, c], layers: [l], effects: [makeEffect({ id: "e", start: 12, end: 14 })], cover: { time: 12, title: "T" } });
beforeEach(() => { mockN = 0; });

test("mainClipIds keeps main clips only, in timeline order, once each", () => {
  expect(mainClipIds(p, ["c", "zz", "a", "a", "l"])).toEqual(["a", "c"]);
  expect(mainClipIds(p, [])).toEqual([]);
});

test("deleteClips removes every given main clip in one step and applies the main-track rules once", () => {
  const next = deleteClips(p, ["b", "c"]);
  expect(next.clips.map((x) => x.id)).toEqual(["a"]);
  expect(next.clips[0].transitionOut).toEqual({ type: "none", duration: 0 });   // a is now the last clip
  expect(next.effects).toEqual([]);                 // the effect started at 12 s; the project is now 4 s long
  expect(next.layers).toBe(p.layers);               // layers are never touched
  expect(next.cover).toEqual({ time: 12, title: "T" });   // stored as it was …
  expect(coverTimeOf(next)).toBe(4);                      // … and clamped when read
  expect(next.updatedAt).toBe("2026-10-04T10:00:00.000Z");
});

test("deleteClips: nothing to delete → the same project; deleting every clip is allowed, as the single Delete allows it", () => {
  expect(deleteClips(p, [])).toBe(p);
  expect(deleteClips(p, ["zz", "l"])).toBe(p);      // unknown id, layer id
  expect(deleteClips(p, ["a", "b", "c"]).clips).toEqual([]);
});

test("duplicateClips puts each copy right after its original, with its own nested objects and no transition", () => {
  const next = duplicateClips(p, ["c", "a"]);
  expect(next.clips.map((x) => x.id)).toEqual(["a", "n1", "b", "c", "n2"]);   // ids are taken in timeline order
  expect(next.clips[1]).toEqual({ ...a, id: "n1", transitionOut: { type: "none", duration: 0 } });
  expect(next.clips[1].transform).not.toBe(a.transform);
  expect(next.clips[1].adjust).not.toBe(a.adjust);
  expect(next.clips[0]).toBe(a);                    // originals untouched (a keeps its fade)
  expect(totalDuration(next)).toBe(24);             // 15 + 4 (copy of a) + 5 (copy of c)
  expect(duplicateClips(p, ["l", "zz"])).toBe(p);
  expect(duplicateClips(p, [])).toBe(p);
});

test("forClips folds a single-clip op over the main clips: one project out, the op's own rules per clip", () => {
  const quiet = forClips(p, ["a", "b", "c", "l"], (q, id) => setClipVolume(q, id, 0.5));
  expect(quiet.clips.map((x) => x.volume)).toEqual([0.5, 0.5, 1]);   // the photo is skipped by setClipVolume itself
  expect(quiet.clips[2]).toBe(c);
  expect(quiet.layers[0]).toBe(l);                                   // a layer id is not a main clip
  expect(forClips(p, ["c"], (q, id) => setClipVolume(q, id, 0.5))).toBe(p);   // nothing changed → same project
  const fast = forClips(p, ["a", "b"], (q, id) => setClipSpeed(q, id, 2));
  expect(totalDuration(fast)).toBe(10);                              // 4 / 2 + 6 / 2 + 5
  expect(fast.clips[0].transitionOut).toEqual({ type: "fade", duration: 0.5 });   // cap = min(1, 0.5 × min(2, 3)) = 0.75 ≥ 0.5
});

test("setCover clamps through clampCover; null clears; unchanged or invalid → the same project", () => {
  const base = makeProject({ clips: [a, b, c] });
  expect(setCover(base, { time: 3.14159, title: "  Hello  " }).cover).toEqual({ time: 3.142, title: "Hello" });
  expect(setCover(base, { time: 99, title: "" }).cover).toEqual({ time: 15, title: "" });   // 4 + 6 + 5
  expect(setCover(base, { time: NaN, title: "x" })).toBe(base);
  expect(setCover(base, null)).toBe(base);
  expect(setCover(p, null).cover).toBeNull();
  expect(setCover(p, { time: 12, title: "T" })).toBe(p);
  expect(setCover(p, { time: 12.0004, title: " T " })).toBe(p);     // rounds and trims to what is stored
});
```

Create `src/editor/__tests__/store.polish.test.ts`:

```ts
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-04T10:00:00.000Z" }));
import { deleteClips, setAspectRatio } from "@/src/editor/model/ops";
import { makeAudioTrack, makeClip, makeEffect, makeLayer, makeOverlay, makeProject } from "@/src/editor/model/types";
import { useEditorStore } from "../store";

const st = () => useEditorStore.getState();
const p = makeProject({
  clips: [makeClip({ id: "a", sourceDuration: 4 }), makeClip({ id: "b", sourceDuration: 4 }), makeClip({ id: "c", sourceDuration: 4 })],
  layers: [makeLayer({ id: "l", sourceDuration: 2 })], overlays: [makeOverlay({ id: "o" })],
  effects: [makeEffect({ id: "e" })], audioTracks: [makeAudioTrack({ id: "m", sourceDuration: 5 })],
});
beforeEach(() => { st().reset(); st().setProject(p); });

test("not in the mode by default; entering seeds it with the selected MAIN clip and clears every selection", () => {
  expect(st().multiSelect).toBeNull();
  st().select("b"); st().enterMultiSelect();
  expect(st()).toMatchObject({ multiSelect: ["b"], selectedClipId: null, selectedOverlayId: null, selectedEffectId: null, selectedAudioId: null });
  st().exitMultiSelect();
  expect(st().multiSelect).toBeNull();
  st().select("l"); st().enterMultiSelect();       // a layer is not multi-selectable
  expect(st()).toMatchObject({ multiSelect: [], selectedClipId: null });
});

test("toggle adds and removes main clips only; select all takes them in timeline order", () => {
  st().toggleMultiSelect("a");
  expect(st().multiSelect).toBeNull();             // not in the mode: nothing happens
  st().enterMultiSelect();
  st().toggleMultiSelect("c"); st().toggleMultiSelect("a");
  expect(st().multiSelect).toEqual(["c", "a"]);
  st().toggleMultiSelect("c");
  expect(st().multiSelect).toEqual(["a"]);
  st().toggleMultiSelect("l"); st().toggleMultiSelect("zz");
  expect(st().multiSelect).toEqual(["a"]);
  st().selectAllClips();
  expect(st().multiSelect).toEqual(["a", "b", "c"]);
});

test("a change that removes selected clips drops them; when none is left the mode ends; one undo step", () => {
  st().enterMultiSelect(); st().selectAllClips();
  const before = st().multiSelect;
  st().apply((x) => setAspectRatio(x, "1:1"));
  expect(st().multiSelect).toBe(before);           // nothing removed → the same array
  st().apply((x) => deleteClips(x, ["b"]));
  expect(st().multiSelect).toEqual(["a", "c"]);
  st().apply((x) => deleteClips(x, ["a", "c"]));
  expect(st().multiSelect).toBeNull();
  expect(st().past).toHaveLength(3);
  st().undo();
  expect(st().project?.clips.map((x) => x.id)).toEqual(["a", "c"]);
  expect(st().multiSelect).toBeNull();             // undo does not bring the mode back
});

test("selecting anything else leaves the mode; deselecting does not; reset clears it", () => {
  for (const pick of [() => st().select("a"), () => st().selectOverlay("o"), () => st().selectEffect("e"), () => st().selectAudio("m")]) {
    st().enterMultiSelect();
    pick();
    expect(st().multiSelect).toBeNull();
  }
  st().enterMultiSelect();
  st().select(null); st().selectOverlay(null);
  expect(st().multiSelect).toEqual([]);
  st().reset();
  expect(st().multiSelect).toBeNull();
});

test("setExportSettings writes the project without an undo step and survives undo / redo", () => {
  st().setExportSettings({ fps: 60, quality: "high" });
  expect(st().project?.exportSettings).toEqual({ fps: 60, quality: "high" });
  expect(st().past).toHaveLength(0);
  expect(st().dirty).toBe(true);
  st().apply((x) => setAspectRatio(x, "1:1"));
  st().setExportSettings({ fps: 24, quality: "high" });
  st().undo();
  expect(st().project).toMatchObject({ aspectRatio: "9:16", exportSettings: { fps: 24, quality: "high" } });
  st().redo();
  expect(st().project).toMatchObject({ aspectRatio: "1:1", exportSettings: { fps: 24, quality: "high" } });
});

test("setExportSettings: unchanged or junk that clamps to what is stored does nothing", () => {
  st().setExportSettings({ fps: 30, quality: "standard" });
  st().setExportSettings({ fps: 25, quality: "ultra" } as never);   // clamps to 30 / standard = stored
  expect(st().dirty).toBe(false);
  expect(st().project).toBe(p);
});
```

- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**

`ops.ts` — extract the copy made by `duplicateClip` into `const copyOfClip = (src: Clip): Clip => ({ ...src, id: newId(), transitionOut: NO_TRANSITION, transform: { ...src.transform }, … })` (the exact object `duplicateClip` builds today) and use it in both. Then, next to `duplicateClip`:

```ts
/** The ids that are MAIN clips (layers and unknown ids are left out), in timeline order, once each. */
export function mainClipIds(p: Project, ids: readonly string[]): string[] {
  const want = new Set(ids);
  return p.clips.filter((c) => want.has(c.id)).map((c) => c.id);
}
/** One single-clip op run on every given main clip. One project comes out, so one `apply` is one undo step; the same project when nothing changes. */
export function forClips(p: Project, ids: readonly string[], op: (p: Project, id: string) => Project): Project {
  return mainClipIds(p, ids).reduce(op, p);
}
/** Multi-select Delete. Deleting every clip is allowed, as `deleteClip` allows it. */
export function deleteClips(p: Project, ids: readonly string[]): Project {
  const gone = new Set(mainClipIds(p, ids));
  if (gone.size === 0) return p;
  return touch(p, { clips: normaliseTransitions(p.clips.filter((c) => !gone.has(c.id))) });
}
/** Multi-select Duplicate: each copy right after its original (the copy `duplicateClip` makes). */
export function duplicateClips(p: Project, ids: readonly string[]): Project {
  const want = new Set(mainClipIds(p, ids));
  if (want.size === 0) return p;
  return touch(p, { clips: p.clips.flatMap((c) => (want.has(c.id) ? [c, copyOfClip(c)] : [c])) });
}
/** The cover (through `clampCover` against the project's length) or null for none. Same project when nothing changes or the time is not finite. */
export function setCover(p: Project, cover: Cover | null): Project {
  if (cover === null) return p.cover === null ? p : touch(p, { cover: null });
  const next = clampCover(cover, totalDuration(p));
  if (!next) return p;
  return p.cover && p.cover.time === next.time && p.cover.title === next.title ? p : touch(p, { cover: next });
}
```

`store.ts`:
- State + `initial`: `multiSelect: null`.
- `afterChange` also returns `multiSelect`: `const kept = s.multiSelect?.filter((id) => next.clips.some((c) => c.id === id)) ?? null;` → `null` when `s.multiSelect` is null or (`kept.length === 0` and `s.multiSelect.length > 0`); `s.multiSelect` itself when nothing was dropped (same array); else `kept`.
- `select` / `selectOverlay` / `selectEffect` / `selectAudio`: the non-null branch also sets `multiSelect: null`.
- `enterMultiSelect`: `const s = get(); if (!s.project) return; const seed = s.selectedClipId && s.project.clips.some((c) => c.id === s.selectedClipId) ? [s.selectedClipId] : []; set({ multiSelect: seed, selectedClipId: null, selectedOverlayId: null, selectedEffectId: null, selectedAudioId: null });`
- `toggleMultiSelect(id)`: no-op when `multiSelect` is null or the id is not in `project.clips`; else remove it if present, append it if not.
- `selectAllClips`: no-op outside the mode; else `project.clips.map((c) => c.id)`. `exitMultiSelect`: `set({ multiSelect: null })`.
- `setExportSettings(v)`: `const next = clampExportSettings(v)`; no-op without a project or when `fps` and `quality` equal the stored ones; else `set({ project: { ...s.project, exportSettings: next }, dirty: true })` (no history — like `addPostRecord`).
- Replace `withPosts` by `withLive(p, live: Project)`: carries `posts` **and** `exportSettings` from the live project onto a restored snapshot (same object when both are already identical); `undo` / `redo` call `withLive(prev, s.project)`.

- [ ] **Step 4:** `npm run typecheck`; `npm test` (the existing `store.posts.test.ts` must stay green unchanged).
- [ ] **Step 5: Commit** `feat(model): cover and multi-clip ops; multi-select and export settings in the store`.

---

### Task 3: Export options — estimate, screen, request

**Depends on:** Tasks 1, 2 (`setExportSettings` store action).

**Files:** Modify `src/export/estimate.ts`, `src/export/ExportScreenBody.tsx`, `src/export/useExport.ts`, `modules/clipy-video/index.ts`; tests `src/export/__tests__/estimate.test.ts`, `ExportScreenBody.test.tsx`, `useExport.test.ts`.

**Do not touch:** `app/editor/[id]/export.tsx` (Task 6 edits it; `start` is passed through unchanged), `modules/clipy-video/ios/*` (Task 4).

**Interfaces — Produces**

```ts
// estimate.ts
export const FPS_BITRATE_FACTOR: Record<ExportFps, number> = { 24: 0.9, 30: 1, 60: 1.5 };
export const QUALITY_BITRATE_FACTOR: Record<ExportQuality, number> = { standard: 1, high: 1.5 };
export const QUALITY_LABELS: Record<ExportQuality, string> = { standard: "Standard", high: "High" };
export const exportBitrate = (res: Resolution, s: ExportSettings = DEFAULT_EXPORT_SETTINGS): number   // video bits per second, rounded
export const estimateBytes = (durationSec: number, res: Resolution, s: ExportSettings = DEFAULT_EXPORT_SETTINGS): number
// modules/clipy-video/index.ts — ExportRequest gains:
fps: ExportFps;      // frames per second of the exported video
bitrate: number;     // video bits per second the export may use (0 = no limit)
// useExport.ts
start: (resolution: Resolution, settings?: ExportSettings) => Promise<void>   // settings default: project.exportSettings
// ExportScreenBody.tsx — prop type becomes:
start: (r: Resolution, s: ExportSettings) => void
```

- [ ] **Step 1: Failing tests.** Append to `estimate.test.ts` (merge the import into the file's existing one):

```ts
import { exportBitrate, FPS_BITRATE_FACTOR, QUALITY_BITRATE_FACTOR } from "../estimate";

test("exportBitrate = resolution bitrate × fps factor × quality factor, in bits per second", () => {
  expect(FPS_BITRATE_FACTOR).toEqual({ 24: 0.9, 30: 1, 60: 1.5 });
  expect(QUALITY_BITRATE_FACTOR).toEqual({ standard: 1, high: 1.5 });
  expect(exportBitrate(1080)).toBe(10_000_000);                                    // the default: 30 fps, standard
  expect(exportBitrate(1080, { fps: 30, quality: "high" })).toBe(15_000_000);      // 10 × 1.5
  expect(exportBitrate(1080, { fps: 60, quality: "high" })).toBe(22_500_000);      // 10 × 1.5 × 1.5
  expect(exportBitrate(720, { fps: 24, quality: "standard" })).toBe(4_500_000);    // 5 × 0.9
  expect(exportBitrate(2160, { fps: 60, quality: "standard" })).toBe(52_500_000);  // 35 × 1.5
});

test("estimateBytes follows the settings; without them it is what it always was", () => {
  expect(estimateBytes(60, 1080)).toBe(75_000_000);                                    // 60 × 10e6 / 8
  expect(estimateBytes(8, 1080, { fps: 60, quality: "high" })).toBe(22_500_000);       // 8 × 22.5e6 / 8
  expect(estimateBytes(30, 720, { fps: 24, quality: "standard" })).toBe(16_875_000);   // 30 × 4.5e6 / 8
});
```

`ExportScreenBody.test.tsx` — new cases (the existing ones stay; the existing `expect(start).toHaveBeenCalledWith(720)` becomes `toHaveBeenCalledWith(720, { fps: 30, quality: "standard" })`):
1. *idle shows the three rows with the project's choices selected:* project with `exportSettings: { fps: 24, quality: "high" }` → `getByRole("button", { name: "24 fps" })` and `"High"` are selected (`toBeSelected()`), `"30 fps"`, `"60 fps"`, `"Standard"` are not; text `Estimated size: 51 MB` (30 s × 13.5 Mbps / 8 = 50.6 MB).
2. *picking a frame rate and a quality updates the estimate, is remembered and is what Export starts with:* put the project in the store (`useEditorStore.getState().setProject(project)`), render with a 30 s default project → `Estimated size: 38 MB` (37.5) → press `60 fps`, `High` → `Estimated size: 84 MB` (30 × 22.5 / 8 = 84.4) → `useEditorStore.getState().project?.exportSettings` equals `{ fps: 60, quality: "high" }` and `past` has length 0 → press `Export` → `start` called with `(1080, { fps: 60, quality: "high" })`.
3. *the rows are also shown (and work) when native is unavailable* (status `"unavailable"`): the chips render; no Export button.
4. *the finish line is unchanged:* `1080p · 0:30`.

`useExport.test.ts` — new cases: (a) `start(1080)` on a project with `exportSettings { fps: 60, quality: "high" }` sends `fps: 60, bitrate: 22_500_000`; (b) `start(720, { fps: 24, quality: "standard" })` sends `fps: 24, bitrate: 4_500_000` whatever the project holds; (c) the free-space check uses the settings: `freeBytes` just under `2 × estimateBytes(total, 1080, high60)` → the "Not enough free space" error. Update the whole-request `toEqual` at the top of the file with `fps: 30, bitrate: 10_000_000`.

- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
  - `estimate.ts`: the constants above; `exportBitrate = (res, s = DEFAULT_EXPORT_SETTINGS) => Math.round(BITRATE_MBPS[res] * 1e6 * FPS_BITRATE_FACTOR[s.fps] * QUALITY_BITRATE_FACTOR[s.quality])`; `estimateBytes = (d, res, s = DEFAULT_EXPORT_SETTINGS) => (d * exportBitrate(res, s)) / 8`.
  - `index.ts`: the two `ExportRequest` fields (import `ExportFps`).
  - `useExport.ts`: `start = useCallback(async (resolution: Resolution, settings: ExportSettings = project?.exportSettings ?? DEFAULT_EXPORT_SETTINGS) => …`; `need = estimateBytes(total, resolution, settings) * 2`; the request gets `fps: settings.fps, bitrate: exportBitrate(resolution, settings)`.
  - `ExportScreenBody.tsx`: `const [settings, setSettings] = useState<ExportSettings>(project.exportSettings)`; `const change = (patch: Partial<ExportSettings>) => { const next = { ...settings, ...patch }; setSettings(next); useEditorStore.getState().setExportSettings(next); }`. Inside the existing idle / unavailable block, after the resolution row and its 4K note: `<Body muted>Frame rate</Body>` + a chip row over `EXPORT_FPS` (label `` `${f} fps` ``, `selected={settings.fps === f}`, `onPress={() => change({ fps: f })}`); `<Body muted>Quality</Body>` + a chip row over `EXPORT_QUALITIES` (label `QUALITY_LABELS[q]`); the estimate line becomes `formatBytes(estimateBytes(duration, res, settings))`; Export calls `start(res, settings)`. Same `Chip`, `theme.space` gaps as the resolution row.
- [ ] **Step 4:** `npm run typecheck`; `npm test`. **Step 5: Commit** `feat(export): frame rate and quality choices, remembered per project`.

---

### Task 4: Swift — frame rate and file-length limit

**Depends on:** Task 1 (constants). The request field names are fixed above (`fps`, `bitrate`); Task 3 need not be merged.

**Files:** Modify `modules/clipy-video/ios/ExportSession.swift`, `modules/clipy-video/ios/Tests/ExportSessionTests.swift`, `src/editor/model/__tests__/overlayMotion.swift.test.ts` (one pinned line); create `src/export/__tests__/exportSettings.swift.test.ts`.

**Do not touch:** every other Swift file; `OverlayMotion.fps` stays `Double(ExportSession.frameRate)` (30 samples a second at every export rate); `MediaPrePass`'s 30 fps photo writer stays.

**Interfaces — Produces (Swift)**

```swift
// ExportRequest
@Field var fps: Int = 30                          // 24 | 30 | 60 (anything else → 30)
@Field var bitrate: Double = 0                    // video bits per second the file may use; 0 = no limit
// ExportSession
static let frameRate: Int32 = 30                  // unchanged: the default rate and the overlay-motion sampling rate
static let frameRates: [Int32] = [24, 30, 60]     // = EXPORT_FPS in src/editor/model/types.ts
static func frameRate(for fps: Int) -> Int32
static let audioAllowance: Double = 256_000       // bits per second added to the limit for the sound track
static let limitsFileLength = true                // the one switch: false → never set a limit
static func fileLengthLimit(bitrate: Double, seconds: Double) -> Int64?
```

- [ ] **Step 1: Parity test (failing).** Create `src/export/__tests__/exportSettings.swift.test.ts`:

```ts
import { readFileSync } from "fs";
import { join } from "path";
import { DEFAULT_EXPORT_SETTINGS, EXPORT_FPS } from "@/src/editor/model/types";

/** The Swift is never compiled here: these checks pin the export-option pieces that must stay in step with the TypeScript. */
const session = readFileSync(join(__dirname, "../../../modules/clipy-video/ios/ExportSession.swift"), "utf8").replace(/\r\n/g, "\n");
const code = session.replace(/\/\/[^\n]*/g, "");   // without comments, so a name in a comment never satisfies a check

test("the engine knows exactly the frame rates the app offers, and the same default", () => {
  const list = /static let frameRates: \[Int32\] = \[([^\]]*)\]/.exec(code);
  expect(list?.[1].split(",").map((s) => Number(s.trim()))).toEqual([...EXPORT_FPS]);
  expect(code).toMatch(new RegExp(`static let frameRate: Int32 = ${DEFAULT_EXPORT_SETTINGS.fps}\\n`));
  expect(code).toMatch(new RegExp(`@Field var fps: Int = ${DEFAULT_EXPORT_SETTINGS.fps}\\b`));
  expect(code).toMatch(/@Field var bitrate: Double = 0\b/);
});

test("the request's frame rate drives the composition; the bitrate becomes a file-length limit behind one switch", () => {
  expect(code).toContain("let fps = Self.frameRate(for: request.fps)");
  expect(code).toContain("videoComposition.frameDuration = CMTime(value: 1, timescale: fps)");
  expect(code).not.toContain("videoComposition.frameDuration = CMTime(value: 1, timescale: ExportSession.frameRate)");
  expect(code).toContain("static let limitsFileLength = true");
  expect(code).toContain("static let audioAllowance: Double = 256_000");
  expect(code).toContain("let seconds = CMTimeGetSeconds(composition.duration)");
  expect(code).toContain("if let limit = Self.fileLengthLimit(bitrate: request.bitrate, seconds: seconds) { session.fileLengthLimit = limit }");
});
```

In `overlayMotion.swift.test.ts` replace the pinned `videoComposition.frameDuration = CMTime(value: 1, timescale: ExportSession.frameRate)` expectation by `CMTime(value: 1, timescale: fps)`; the `frameRate` constant, `holdFrame` and `OverlayMotion.fps` expectations stay.

- [ ] **Step 2: Implement.**

```swift
/// The frame rates a request may ask for (`EXPORT_FPS` in src/editor/model/types.ts); anything else exports at `frameRate`.
static let frameRates: [Int32] = [24, 30, 60]
static func frameRate(for fps: Int) -> Int32 {
  let rate = Int32(clamping: fps)
  return frameRates.contains(rate) ? rate : frameRate
}
/// Bits per second allowed for the sound on top of the video bitrate when the file length is limited.
static let audioAllowance: Double = 256_000
/// `AVAssetExportSession` has no bitrate setting; `fileLengthLimit` is the nearest control. Set to false to export without it.
static let limitsFileLength = true
/// Bytes the exported file may take: (video bitrate + audio allowance) × seconds / 8, rounded up. Nil = no limit.
static func fileLengthLimit(bitrate: Double, seconds: Double) -> Int64? {
  guard limitsFileLength, bitrate.isFinite, seconds.isFinite, bitrate > 0, seconds > 0 else { return nil }
  return Int64(((bitrate + audioAllowance) * seconds / 8).rounded(.up))
}
```

In `start(_:)`: `let fps = Self.frameRate(for: request.fps)` beside `renderSize`; `videoComposition.frameDuration = CMTime(value: 1, timescale: fps)`; right after `session.shouldOptimizeForNetworkUse = true`, on two lines exactly as the parity test pins them: `let seconds = CMTimeGetSeconds(composition.duration)` and `if let limit = Self.fileLengthLimit(bitrate: request.bitrate, seconds: seconds) { session.fileLengthLimit = limit }`. The existing `static let frameRate: Int32 = 30` line keeps no trailing comment (two tests match it up to the line end). `holdFrame` stays `1 / ExportSession.frameRate` (it is a source-edge length, not the output rate). Update the `frameRate` doc comment (default rate; hold frame; overlay sampling) and the two record fields with comments.

XCTests in `ExportSessionTests.swift`: `frameRate(for:)` → 24, 30, 60 map to themselves, 25 / 0 / -1 / 1000 → 30; `fileLengthLimit(bitrate: 10_000_000, seconds: 8)` = 10 256 000 bytes ((10 000 000 + 256 000) × 8 / 8); `bitrate: 0`, `seconds: 0`, `.nan`, `.infinity` → nil; `ExportRequest()` defaults `fps == 30`, `bitrate == 0`.

Verify by reading: `fileLengthLimit` is `var fileLengthLimit: Int64` on `AVAssetExportSession`; `Int32(clamping:)`; `@Field` with `Int` / `Double` defaults against `node_modules/expo-modules-core/ios` (Records). List in the report: unverified APIs (`fileLengthLimit` behaviour with a custom compositor and an animation tool).

- [ ] **Step 3:** `npm run typecheck`; `npm test`. **Step 4: Commit** `feat(ios): export frame rate and file-length limit from the request (uncompiled)`.

---

### Task 5: Cover — sheet, tool, Save to Photos, drafts list

**Depends on:** Tasks 1, 2 (`setCover`, `coverTimeOf`, `frameAt`).

**Files:** Create `src/editor/coverFrame.ts`, `src/editor/components/CoverFrame.tsx`, `src/editor/components/CoverSheet.tsx`, `src/editor/__tests__/CoverSheet.test.tsx`, `src/editor/__tests__/coverFrame.test.ts`; modify `src/editor/components/thumbnails.ts` (+ `src/editor/__tests__/thumbnails.test.ts`), `src/editor/toolGroups.ts` (+ `toolGroups.test.ts`), `src/editor/components/EditorToolbar.tsx` (+ `EditorToolbar.test.tsx`), `src/projects/storage.ts` (+ `src/projects/__tests__/storage.test.ts`), `src/projects/ProjectCard.tsx` (+ `ProjectCard.test.tsx`), `src/editor/useLoadProject.ts` (+ `useLoadProject.test.tsx`), `jest.setup.ts`, `package.json` / `package-lock.json` (only through `npx.cmd expo install react-native-view-shot`).

**Do not touch:** `Timeline.tsx` and the bar components (Task 7), `src/publish/*` and `app/*` (Task 6), `store.ts`, `ops.ts`.

**Interfaces — Produces**

```ts
// thumbnails.ts
export function getStill(uri: string, timeSec: number): Promise<string>   // full quality (1), exact millisecond, memoized per uri + ms
// coverFrame.ts
export async function frameUriAt(p: Project, time: number, exact = false): Promise<string | null>
// CoverFrame.tsx — the picture + title exactly as the cover looks (also the view that is captured)
export function CoverFrame(props: { uri: string | null; title: string; width: number; height: number }): React.JSX.Element
// CoverSheet.tsx
export function CoverSheet(props: { visible: boolean; onClose: () => void }): React.JSX.Element | null
// storage.ts
writeCover(p: Project): Promise<void>
interface ProjectSummary { …; coverTitle: string }
// toolGroups.ts: ToolId gains "cover"; Edit tools end with `…, "delete", "ratio", "cover"`
```

- [ ] **Step 1: Install.** Read https://docs.expo.dev/versions/v57.0.0/sdk/captureRef/ (it says "Included in Expo Go"), then `npx.cmd expo install react-native-view-shot` (expected version 5.1.0 per `node_modules/expo/bundledNativeModules.json`). Read the installed typings for `captureRef`'s options before writing code. No config plugin, no `app.json` change.
- [ ] **Step 2: Failing tests.** First add two harmless defaults to `jest.setup.ts` (every suite that mounts `EditorToolbar` now imports them through `CoverSheet`): `jest.mock("react-native-view-shot", () => ({ captureRef: jest.fn(async () => "file:///tmp/capture.jpg") }));` and `jest.mock("expo-media-library/legacy", () => ({ requestPermissionsAsync: jest.fn(async () => ({ granted: true })), saveToLibraryAsync: jest.fn(async () => {}) }));` — a suite's own `jest.mock` of the same module still wins.

`coverFrame.test.ts` (mock `./components/thumbnails`: `getThumb` → `"thumb:" + uri + "@" + t`, `getStill` → `"still:" + uri + "@" + t`): with clips `a` (4 s) and `b` (`sourceDuration` 6, `speed` 2): `frameUriAt(p, 5)` → `getThumb` called with (`b.sourceUri`, 2); `frameUriAt(p, 5, true)` → `getStill` with the same; a photo clip → its `sourceUri`, no helper call; an empty project → null; a rejecting helper → null (no throw).

`thumbnails.test.ts`: `getStill` asks `expo-video-thumbnails` for `{ time: 2340, quality: 1 }` at 2.34 s; a second call for the same uri + ms reuses the promise; a failure is not cached.

`CoverSheet.test.tsx` — mocks: `@/src/editor/coverFrame` (`frameUriAt: jest.fn(async (_p, t, exact) => `file:///f-${t}-${exact ? "still" : "thumb"}.jpg`)`), `react-native-view-shot` (`captureRef: jest.fn(async () => "file:///tmp/cover.jpg")`), `expo-media-library/legacy` (`requestPermissionsAsync` → `{ granted: true }`, `saveToLibraryAsync`), clock. Project: clips `a` 4 s + `b` 6 s (total 10), `aspectRatio "9:16"`. Cases:
1. *opens on the first frame with an empty title when there is no cover:* slider `cover-time` has `value` 0 and `maximumValue` 10; the field `getByLabelText("Cover title")` is empty; counter `0 / 40`; `frameUriAt` was called with time 0.
2. *opens on the stored cover (clamped):* project with `cover: { time: 99, title: "Trip" }` → slider value 10, field shows `Trip`, `getByTestId("cover-title")` shows `Trip`.
3. *moving the slider changes the frame, not the project:* `fireEvent(slider, "valueChange", 5)` → `frameUriAt` called with (project, 5, false); `fireEvent(slider, "slidingComplete", 5)` → called with (project, 5, true); `past` length 0.
4. *typing a title shows it on the frame; the field is limited to 40:* `fireEvent.changeText(field, "Beach day")` → `cover-title` text `Beach day`, counter `9 / 40`; the field has `maxLength` 40; with an empty title there is no `cover-title` node.
5. *Done saves time and title as one undo step and closes:* slider to 5, title `"  Beach day "` → press `Done` → `project.cover` equals `{ time: 5, title: "Beach day" }`, `past` length 1, `onClose` called once.
6. *Done with nothing changed adds no undo step* (still closes).
7. *Reset clears the cover (one undo step) and the draft:* project with a cover → press `Reset` → `project.cover` null, slider 0, field empty; pressing Reset again adds no step.
8. *closing without Done discards the draft:* change both, press the `Close sheet` backdrop → project unchanged.
9. *Save to Photos captures the frame view and saves it:* press `Save to Photos` → `captureRef` called once, its second argument `{ format: "jpg", quality: 0.92, result: "tmpfile", width: 1080, height: 1920 }`; `saveToLibraryAsync("file:///tmp/cover.jpg")`; text `Saved to Photos` appears.
10. *permission refused / capture throws:* `requestPermissionsAsync` → `{ granted: false }` → text `Allow Photos access in Settings to save.`, no save; `captureRef` rejecting → text `Couldn't save the cover.`; the sheet stays usable.
11. *renders nothing for an empty project.*

`EditorToolbar.test.tsx`: `Cover` is in the Edit row, enabled with no selection, disabled for an empty project; pressing it shows the header `Cover`. `toolGroups.test.ts`: the Edit list ends with `"delete", "ratio", "cover"`.

`storage.test.ts` (memoryFs; the `thumbnail` fake of the file's `setup()`): project `id1` with clips `a` (video, 4 s) and `b` (video, 6 s), `cover: { time: 5, title: "Trip" }`:
- `writeCover(p)` calls `thumbnail(b.sourceUri, 1000)` (5 − 4 = 1 s into b) and creates `…/projects/id1/cover-5000.jpg`; a pre-existing `cover-2000.jpg` in that folder is removed; `thumb.jpg` and `project.json` are untouched.
- called again → `thumbnail` not called a second time (the file exists).
- a photo at the cover time → the photo file is copied to `cover-<ms>.jpg`, `thumbnail` not called.
- `cover: null` → every `cover-*.jpg` of the project is removed, `thumb.jpg` kept.
- `cover.time` 99 on the 10 s project → file `cover-10000.jpg`, `thumbnail(b.sourceUri, 5950)` (frame at 10 − 0.05 → 5.95 s into b).
- `thumbnail` rejecting → one `console.warn`, no throw, no file.
- `listProjects()` → `thumbUri` is the cover file when the project has a cover and the file exists, `coverTitle: "Trip"`; with the file missing → `thumb.jpg`; without a cover → `thumb.jpg` and `coverTitle: ""`; a broken project → `coverTitle: ""`.
- `duplicateProject` copies the cover file to the copy's folder.

`ProjectCard.test.tsx`: with `coverTitle: "Trip"` the text `Trip` is shown (`testID="project-cover-title"`); with `""` there is no such node (add `coverTitle: ""` to the file's `summary`, and to every other `ProjectSummary` literal the type checker reports, e.g. in `ProjectsScreen.test.tsx`).

`useLoadProject.test.tsx` (add `writeCover: jest.fn(async () => {})` to the storage mock): unmounting calls `storage.writeCover` with the project also when nothing is dirty (and still does not call `saveProject` then); when dirty, `saveProject` resolves before `writeCover` is called; `lastFlush` resolves after both; a rejecting `writeCover` only warns.

- [ ] **Step 3: Run** → FAIL. **Step 4: Implement.**
  - `thumbnails.ts`: `getStill` — a second `Map` keyed `` `${uri}|${ms}` `` with `ms = Math.max(0, Math.round(timeSec * 1000))`, `VideoThumbnails.getThumbnailAsync(uri, { time: ms, quality: 1 })`, failures evicted (as `getThumb`).
  - `coverFrame.ts`: `const f = frameAt(p, time); if (!f) return null; if (f.clip.kind === "photo") return f.clip.sourceUri; try { return await (exact ? getStill : getThumb)(f.clip.sourceUri, f.sourceTime); } catch { return null; }`.
  - `CoverFrame.tsx`: a `View` (`width`, `height`, `overflow: "hidden"`, `backgroundColor: theme.colors.surfaceAlt`) holding the `Image` (`resizeMode="cover"`, absolute fill) when `uri`, and — only when `title.trim()` is not empty — an `expo-linear-gradient` `LinearGradient` (`colors={["transparent", theme.colors.scrimStrong]}`, absolute, bottom, left / right 0, `paddingTop: height * 0.12`, `paddingBottom: height * 0.06`, `paddingHorizontal: width * 0.06`) with `<Text testID="cover-title" numberOfLines={2} style={{ fontFamily: theme.fonts.title, color: theme.colors.text, fontSize: height * 0.07, textAlign: "center" }}>`. It forwards a `ref` to the outer `View` (`collapsable={false}`, `testID="cover-frame"`) — React 19: `ref` is a normal prop.
  - `CoverSheet.tsx`: `Sheet` (`title="Cover"`, `avoidKeyboard`); `project` from the store; `null` when there is no project or no clips. Draft state `time` / `title` / `uri` / `note`, re-seeded in an effect on `visible` becoming true (`coverTimeOf(project)`, `project.cover?.title ?? ""`). Frame box: height 240, width `240 * aspectRatioValue(project.aspectRatio)` capped at the window width minus the sheet's padding (scale both), centred. An effect on `time` loads `frameUriAt(project, time)` with an `alive` guard; `onSlidingComplete` loads the exact still. `Slider testID="cover-time"` 0 … `totalDuration(project)`, step 0.1, theme tints as the other sheets. `TextInput accessibilityLabel="Cover title"` (`maxLength={COVER_LIMITS.titleMax}`, placeholder `Add a title`, the field style `TextPanel` uses, `placeholderTextColor={theme.colors.textMuted}`) + `Body muted` counter `` `${Array.from(title).length} / 40` ``. Buttons: `PrimaryButton title="Done"` → `apply((p) => setCover(p, { time, title }))`, `onClose()`; `SecondaryButton title="Save to Photos"`; `SecondaryButton title="Reset"` → `apply((p) => setCover(p, null))`, draft back to 0 / "". Save: `requestPermissionsAsync(true)` and `saveToLibraryAsync` from `expo-media-library/legacy` (the non-legacy one throws in SDK 57 — see `app/editor/[id]/export.tsx`), `captureRef(frameRef, { format: "jpg", quality: 0.92, result: "tmpfile", width: 1080, height: Math.round(1080 / aspectRatioValue(project.aspectRatio)) })`, all in one `try`; the outcome goes to `note` (a `Body muted` line — toasts are hidden under a Modal). A busy ref blocks a second press.
  - `toolGroups.ts` / `EditorToolbar.tsx`: ToolId `cover`; `cover: { label: "Cover", icon: "image-outline", disabled: !hasClips, onPress: () => setSheet("cover") }`; add `"cover"` to the `sheet` union; mount `<CoverSheet visible={sheet === "cover"} onClose={() => setSheet(null)} />`.
  - `storage.ts`: `const coverPath = (id: string, time: number) => `${projectDir(id)}/cover-${Math.round(time * 1000)}.jpg``. `writeCover(p)`: list the project folder; `want = p.cover ? coverPath(p.id, coverTimeOf(p)) : null`; when `want` and it does not exist → `frameAt(p, coverTimeOf(p))` → photo: `fs.copy(source, want)`; video: `fs.copy(await deps.thumbnail(uri, Math.round(sourceTime * 1000)), want)`; then remove every other `cover-*.jpg` name in the folder (only after a successful write, or when `want` is null); the whole body in `try / catch` → `console.warn("cover failed", e)`. Add it to the returned object. `listProjects`: `const cover = p.cover ? coverPath(id, coverTimeOf(p)) : null`; `thumbUri: cover && (await fs.exists(cover)) ? cover : (await fs.exists(thumbPath(id))) ? thumbPath(id) : null`; `coverTitle: p.cover?.title ?? ""` (broken: `""`). `duplicateProject`: copy every `cover-*.jpg`.
  - `ProjectCard.tsx`: when `summary.coverTitle` — `<Title testID="project-cover-title" size={15} numberOfLines={2} style={{ position: "absolute", left: theme.space.sm, right: theme.space.sm, bottom: 56, textAlign: "center" }}>` above the name gradient.
  - `useLoadProject.ts` cleanup: `const p = s.project; if (p) setLastFlush((s.dirty ? storage.saveProject(p) : Promise.resolve()).then(() => storage.writeCover(p)).catch((e: unknown) => console.warn("flush save failed", e)));` then `s.reset()`.
- [ ] **Step 5:** `npm run typecheck`; `npm test`; `npx.cmd expo-doctor`. **Step 6: Commit** (explicit paths incl. `package.json`, `package-lock.json`) `feat(editor): cover — frame, title, Save to Photos, drafts list`.

---

### Task 6: Cover time when posting (Instagram)

**Depends on:** Task 1 (`coverTimeOf`).

**Files:** Modify `app/editor/[id]/export.tsx`, `app/post.tsx`, `src/publish/postParams.ts`, `src/publish/adapters/types.ts`, `src/publish/adapters/instagram.ts`, `src/publish/usePostForm.ts`, `src/publish/components/PostScreenBody.tsx`, `supabase/functions/_shared/platforms/instagram.ts`; tests `src/publish/__tests__/postParams.test.ts`, `adapters.test.ts`, `PostScreen.test.tsx`, `src/export/__tests__/ExportRoute.test.tsx`, `supabase/functions/_shared/__tests__/instagram.test.ts`.

**Do not touch:** `src/export/ExportScreenBody.tsx`, `useExport.ts`, `estimate.ts` (Task 3); the other four adapters on both sides; `src/publish/api.ts` (the offset travels inside the existing `options`).

**Interfaces — Produces**

```ts
// postParams.ts
export interface PostTarget { video: VideoInfo; projectId: string | null; title: string | null; coverMs: number | null }
// adapters/types.ts — ClientAdapter gains:
/** Per-post options that carry the project's cover frame (milliseconds into the video); only platforms that accept a frame offset define it. */
coverOptions?(coverMs: number): Record<string, unknown>;
// adapters/instagram.ts
coverOptions: (coverMs) => ({ thumbOffsetMs: coverMs })
// usePostForm.ts — new last parameter
usePostForm(video, platforms, title, rows, refresh, coverMs: number | null = null)
// server: PrepareInput.options.thumbOffsetMs (number, ms) → Graph parameter thumb_offset (string of whole ms)
```

- [ ] **Step 1: Failing tests.**
  - `postParams.test.ts`: `coverMs: "2500"` with `durationSec: "21"` → `coverMs: 2500`; absent → `null` (update the existing whole-object expectations with `coverMs: null`); `"-1"`, `"abc"`, `"2.5"`, `"21001"` (past 21 s × 1000) → `null`, the rest of the target still valid; `"0"` → `0`; `"21000"` → `21000`.
  - `adapters.test.ts`: `instagram.coverOptions!(2500)` equals `{ thumbOffsetMs: 2500 }`; `youtube`, `tiktok`, `facebook`, `x` have no `coverOptions`.
  - `PostScreen.test.tsx`: with `target.coverMs = 2500` and Instagram + YouTube connected, pressing Post calls `api.prepare` for instagram with `options` containing `thumbOffsetMs: 2500` and for youtube with its options unchanged (no such key); with `coverMs: null` neither has it; a Retry sends it again.
  - `ExportRoute.test.tsx`: a project with `cover: { time: 5, title: "" }` → `router.push` params include `coverMs: "5000"`; a cover time past the exported length (missing last clip) is clamped to it; no cover → no `coverMs` key.
  - `instagram.test.ts` (server): `prepare` with `{ ...INPUT, options: { thumbOffsetMs: 2500 } }` → the container form equals the existing one plus `thumb_offset: "2500"`; `2499.6` → `"2500"`; `0` → `"0"`; for `-1`, `NaN`, `"2500"`, `21001` (INPUT lasts 21 s), and no option at all → the form has no `thumb_offset` key (the existing exact-form test stays unchanged and green).
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.**
  - `export.tsx` `onPost`: `const total = exportDuration(project, missingSourceUris);` and `...(project.cover ? { coverMs: String(Math.round(Math.min(coverTimeOf(project), total) * 1000)) } : {})` in `params`.
  - `post.tsx`: `coverMs?: string` in the params type and in the `useMemo` dependency list.
  - `postParams.ts`: `const c = Number(one(params.coverMs) ?? NaN); const coverMs = Number.isInteger(c) && c >= 0 && c <= durationSec * 1000 ? c : null;` — returned in the target. (A deep link can set it; it is only ever a frame offset inside the video's own length.)
  - `usePostForm.ts`: `jobFor = (v) => ({ platform: v.status.id, caption, options: coverMs !== null && v.adapter?.coverOptions ? { ...v.options, ...v.adapter.coverOptions(coverMs) } : v.options })`. `PostScreenBody.tsx`: destructure `coverMs` from `target`, pass it as the sixth argument.
  - Server `instagram.ts`: `const thumbOffset = (input: PrepareInput): string | null => { const v = input.options.thumbOffsetMs; return typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= input.durationSec * 1000 ? String(Math.round(v)) : null; };` and in `prepare`: `const offset = thumbOffset(input);` → `params: { media_type: "REELS", upload_type: "resumable", caption: cutCaption(input.caption), share_to_feed: "true", ...(offset !== null ? { thumb_offset: offset } : {}) }`. Comment with the reference page (`…/reference/ig-user/media/` — `thumb_offset`: milliseconds, default 0). Web-standard APIs only, `.ts` import extensions.
- [ ] **Step 4:** `npm run typecheck`; `npm test` (app and server suites). **Step 5: Commit** `feat(publish): send the cover frame to Instagram as the Reel's thumbnail offset`.

---

### Task 7: Snapping — maths and timeline gestures

**Depends on:** Task 1 (green baseline only; uses no new schema).

**Files:** Create `src/editor/model/snap.ts`, `src/editor/model/__tests__/snap.test.ts`, `src/editor/snapping.ts`, `src/editor/__tests__/snapping.test.ts`, `src/editor/components/SnapGuide.tsx`, `src/editor/__tests__/SnapGuide.test.tsx`; modify `src/editor/components/OverlayPill.tsx`, `AudioBar.tsx`, `LayerBar.tsx`, `EffectPill.tsx`, `TrimHandles.tsx`, `Timeline.tsx` (one import + one element); tests `OverlayPill.test.tsx`, `AudioLane.test.tsx`, `LayerLane.test.tsx`, `EffectLane.test.tsx`, `TrimHandles.test.tsx`, `Timeline.test.tsx`.

**Do not touch:** `src/editor/timelineScroll.ts`, the scroll handlers in `Timeline.tsx`, `store.ts`, `ops.ts`, `toolGroups.ts`, `EditorToolbar.tsx`.

**Interfaces — Produces**

```ts
// model/snap.ts
export const SNAP_POINTS = 8;
export const snapThreshold = (pps: number): number          // SNAP_POINTS / pps, seconds
export function snapTargets(p: Project, playhead: number, excludeId: string | null = null): number[]
export function clipSnapTargets(p: Project, playhead: number): number[]
export function snapTime(t: number, targets: readonly number[], threshold: number): { time: number; target: number | null }
export function snapMove(start: number, duration: number, targets: readonly number[], threshold: number): { start: number; target: number | null }
// snapping.ts
export const useSnapGuide: UseBoundStore<StoreApi<{ time: number | null }>>   // the guide line's project time
export interface Snapper {
  begin(excludeId: string | null, mainClip?: boolean): void;   // reads project, playhead and zoom from the editor store once
  time(t: number): number;                                      // an edge: the snapped time (or t)
  move(start: number, duration: number): number;                // a moved bar: the snapped start (or start)
  snapped(): boolean;                                           // the last call landed on a target
  end(): void;                                                  // clears the guide and the entered-snap memory
}
export function createSnapper(): Snapper
// SnapGuide.tsx
export function SnapGuide(props: { left: number; height: number }): React.JSX.Element | null
```

- [ ] **Step 1: Failing model test.** Create `src/editor/model/__tests__/snap.test.ts`:

```ts
import { clipSnapTargets, SNAP_POINTS, snapMove, snapTargets, snapThreshold, snapTime } from "../snap";
import { makeAudioTrack, makeClip, makeEffect, makeLayer, makeOverlay, makeProject, makeSticker } from "../types";

// Main track: a 0–4, b 4–7 (6 s of source at 2×). Text o 1–2.5. Sticker s 6–6.5. Music m 0.5–9.5 (past the end).
// Layer l 3–5. Effect e 5.5–6.5. Beats at 2 and 6. Playhead 3.3.
const p = makeProject({
  clips: [makeClip({ id: "a", sourceDuration: 4 }), makeClip({ id: "b", sourceDuration: 6, speed: 2 })],
  overlays: [makeOverlay({ id: "o", start: 1, end: 2.5 }), makeSticker({ id: "s", start: 6, end: 6.5 })],
  audioTracks: [makeAudioTrack({ id: "m", sourceDuration: 9, start: 0.5 })],
  layers: [makeLayer({ id: "l", sourceDuration: 2, start: 3 })],
  effects: [makeEffect({ id: "e", start: 5.5, end: 6.5 })],
  beatMarkers: [2, 6],
});
const ALL = [0, 0.5, 1, 2, 2.5, 3, 3.3, 4, 5, 5.5, 6, 6.5, 7, 9.5];

test("the threshold is 8 points at the timeline's zoom", () => {
  expect(SNAP_POINTS).toBe(8);
  expect(snapThreshold(80)).toBe(0.1);     // 8 / 80
  expect(snapThreshold(20)).toBe(0.4);     // 8 / 20
});

test("snapTargets: every edge on the timeline, sorted, each time once", () => {
  // 0 · m start 0.5 · o start 1 · beat 2 · o end 2.5 · l start 3 · playhead 3.3 · cut 4 · l end 5 (3 + 2) · e start 5.5 ·
  // beat 6 = s start 6 (once) · e end 6.5 = s end 6.5 (once) · project end 7 (4 + 6 / 2) · m end 9.5 (0.5 + 9)
  expect(snapTargets(p, 3.3)).toEqual(ALL);
});

test("snapTargets leaves out the dragged item's own edges, whatever kind it is", () => {
  expect(snapTargets(p, 3.3, "o")).toEqual([0, 0.5, 2, 3, 3.3, 4, 5, 5.5, 6, 6.5, 7, 9.5]);
  expect(snapTargets(p, 3.3, "m")).toEqual([0, 1, 2, 2.5, 3, 3.3, 4, 5, 5.5, 6, 6.5, 7]);
  expect(snapTargets(p, 3.3, "l")).toEqual([0, 0.5, 1, 2, 2.5, 3.3, 4, 5.5, 6, 6.5, 7, 9.5]);
  expect(snapTargets(p, 3.3, "e")).toEqual([0, 0.5, 1, 2, 2.5, 3, 3.3, 4, 5, 6, 6.5, 7, 9.5]);   // 6.5 stays: the sticker ends there too
  expect(snapTargets(p, 3.3, "zz")).toEqual(ALL);
});

test("snapTargets: a playhead that is not a number is left out; an empty project has only 0", () => {
  expect(snapTargets(p, NaN)).toEqual(ALL.filter((t) => t !== 3.3));
  expect(snapTargets(makeProject(), 0)).toEqual([0]);
});

test("clipSnapTargets: the playhead and the beat markers only", () => {
  expect(clipSnapTargets(p, 3.3)).toEqual([2, 3.3, 6]);
  expect(clipSnapTargets(p, 6)).toEqual([2, 6]);
  expect(clipSnapTargets(makeProject(), NaN)).toEqual([]);
});

test("snapTime: the nearest target within the threshold, else the time itself", () => {
  expect(snapTime(3.95, ALL, 0.1)).toEqual({ time: 4, target: 4 });       // 0.05 from the cut
  expect(snapTime(3.8, ALL, 0.1)).toEqual({ time: 3.8, target: null });   // 0.2 from 4, 0.5 from 3.3
  expect(snapTime(6.2, ALL, 0.5)).toEqual({ time: 6, target: 6 });        // 0.2 from 6 beats 0.3 from 6.5
  expect(snapTime(3, [2, 4], 1)).toEqual({ time: 2, target: 2 });         // exactly 1 from both: inclusive, the earlier wins
  expect(snapTime(-0.05, ALL, 0.1)).toEqual({ time: 0, target: 0 });
  expect(snapTime(5, [], 1)).toEqual({ time: 5, target: null });
  expect(snapTime(NaN, ALL, 1)).toEqual({ time: NaN, target: null });
  expect(snapTime(4.05, ALL, 0)).toEqual({ time: 4.05, target: null });   // no reach
});

test("snapMove tries both edges of the bar; the nearer snap wins, a tie goes to the start", () => {
  // Start 2.95 is 0.05 from 3; the end 2.95 + 1.35 = 4.3 is 0.3 from 4 → the start snaps.
  expect(snapMove(2.95, 1.35, ALL, 0.15)).toEqual({ start: 3, target: 3 });
  // Start 2.9 is 0.1 from 3; the end 2.9 + 1.05 = 3.95 is 0.05 from 4 → the end snaps: start = 4 − 1.05.
  const end = snapMove(2.9, 1.05, ALL, 0.15);
  expect(end.target).toBe(4);
  expect(end.start).toBeCloseTo(2.95, 9);
  // Both edges exactly 0.25 away (start 1.75 → 2, end 4.25 → 4): the start edge wins → start 2.
  expect(snapMove(1.75, 2.5, [2, 4], 0.5)).toEqual({ start: 2, target: 2 });
  // Nothing near: 1.4 is 0.4 from 1, the end 1.7 is 0.3 from 2.
  expect(snapMove(1.4, 0.3, ALL, 0.05)).toEqual({ start: 1.4, target: null });
});
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement `snap.ts`:**

```ts
import { trackEnd } from "./audioSync";
import { clipStartTimes, layerEnd, totalDuration } from "./timeline";
import type { Project } from "./types";

// Snapping maths: project seconds in, project seconds out. No pixels except `snapThreshold`, no speed arithmetic (timeline.ts gives the times).

/** How close (points on screen) an edge must come to a target to snap. */
export const SNAP_POINTS = 8;
export const snapThreshold = (pps: number): number => SNAP_POINTS / pps;

const sortedUnique = (times: number[]): number[] => {
  const out: number[] = [];
  for (const t of times.filter((x) => Number.isFinite(x) && x >= 0).sort((a, b) => a - b)) if (out.length === 0 || t - out[out.length - 1] > 1e-9) out.push(t);
  return out;
};

/** Every time a dragged bar may snap to; the bar being dragged (`excludeId`) does not offer its own edges. */
export function snapTargets(p: Project, playhead: number, excludeId: string | null = null): number[] {
  const keep = <T extends { id: string }>(items: T[]) => items.filter((x) => x.id !== excludeId);
  return sortedUnique([
    0, totalDuration(p), playhead, ...clipStartTimes(p),
    ...keep(p.overlays).flatMap((o) => [o.start, o.end]),
    ...keep(p.audioTracks).flatMap((t) => [t.start, trackEnd(t)]),
    ...keep(p.layers).flatMap((l) => [l.start, layerEnd(l)]),
    ...keep(p.effects).flatMap((e) => [e.start, e.end]),
    ...p.beatMarkers,
  ]);
}
/** What a main clip's trimmed edge snaps to: the playhead and the beat markers. */
export const clipSnapTargets = (p: Project, playhead: number): number[] => sortedUnique([playhead, ...p.beatMarkers]);

export function snapTime(t: number, targets: readonly number[], threshold: number): { time: number; target: number | null } {
  let best: number | null = null;
  if (Number.isFinite(t) && threshold > 0) for (const x of targets) {
    const d = Math.abs(x - t);
    if (d <= threshold && (best === null || d < Math.abs(best - t))) best = x;   // strict `<`: on a tie the earlier target stays
  }
  return best === null ? { time: t, target: null } : { time: best, target: best };
}
export function snapMove(start: number, duration: number, targets: readonly number[], threshold: number): { start: number; target: number | null } {
  const a = snapTime(start, targets, threshold), b = snapTime(start + duration, targets, threshold);
  if (a.target !== null && (b.target === null || Math.abs(a.target - start) <= Math.abs(b.target - (start + duration)))) return { start: a.target, target: a.target };
  return b.target !== null ? { start: b.target - duration, target: b.target } : { start, target: null };
}
```

- [ ] **Step 4: Failing gesture-side tests.**

`snapping.test.ts` (store with the project above, `seek(3.3)`, `setZoom(80)` → threshold 0.1; `expo-haptics` is mocked in `jest.setup.ts`):
1. `begin("o")`, `time(3.95)` → 4, `useSnapGuide.getState().time` 4, `Haptics.impactAsync` called once; `time(3.97)` → 4, still once (held); `time(3.6)` → 3.6, guide null, still once (leaving is silent); `time(3.96)` → 4, twice (entered again); `snapped()` true; `end()` → guide null, `snapped()` false.
2. Moving from one target straight onto another (`time(3.95)` then `time(3.25)` → 3.3) buzzes twice.
3. `move(2.9, 1.05)` → ≈ 2.95 with the guide at 4.
4. `begin(null, true)` uses `clipSnapTargets`: `time(3.95)` → 3.95 (a cut is not a target for a main-clip trim), `time(2.04)` → 2.
5. Targets are read at `begin`: a seek afterwards does not change them. Without `begin` (or with no project) every call returns its input and nothing buzzes.

`SnapGuide.test.tsx`: nothing rendered while the guide time is null; with `useSnapGuide.setState({ time: 4 })` at zoom 60 → `getByTestId("snap-guide")` has style `left: left + 240 − 0.5`, `width: 1`, `height`, `backgroundColor: theme.colors.accent` and `pointerEvents="none"`.

Bars (each file: project above unless said; zoom 80; drive `props.gesture.handlers`; every case also asserts `past` has length 1 after the gesture and the guide is null after `onFinalize`):
- `OverlayPill.test.tsx` — *move snaps the nearer edge:* pill `o` (1–2.5), `onUpdate({ translationX: 1.46 * 80 })` (start 2.46, end 3.96 → 0.04 from the cut at 4) → start 2.5, end 4; guide 4; one haptic. *start handle:* `translationX: 0.95 * 80` → start 1.95 → snaps to the beat at 2. *end handle:* `translationX: 0.76 * 80` → end 3.26 → the playhead 3.3. *its own edges are not targets:* a move by `0.03 * 80` stays at 1.03 (no target within 0.1 once 1 and 2.5 are excluded… 0.5 and 2 are 0.53 / 0.97 away).
- `EffectLane.test.tsx` — move, start handle and end handle of `e` (5.5–6.5) snap to the beat at 6 / the sticker edge / the project end 7 in the same way (pick offsets ≤ 0.05 s from the target).
- `AudioLane.test.tsx` — *move:* `m` (start 0.5, length 9) moved by `0.46 * 80` → start 0.96 → snaps to 1. *end handle:* `translationX: -2.46 * 80` → end 7.04 → 7 → `trimEnd` 6.5. *start handle moves the bar's END* (the start stays): `translationX: 2.46 * 80` → the end would be 9.5 − 2.46 = 7.04 → snaps to 7 → `trimStart` 2.5, `start` still 0.5.
- `LayerLane.test.tsx` — *move:* `l` (3–5) moved by `-0.96 * 80` → start 2.04 → 2 (the beat). *end handle:* `translationX: 0.46 * 80` → end 5.46 → 5.5 → `trimEnd` 2.5 needs a longer source: use `makeLayer({ id: "l", sourceDuration: 4, trimEnd: 2, start: 3 })`. *start handle:* `translationX: 0.27 * 80` → start 3.27 → 3.3 (playhead) → `trimStart` ≈ 0.3 (`toBeCloseTo`), the bar's end still 5. The refusal toast behaviour is unchanged (existing tests stay green).
- `TrimHandles.test.tsx` — project: one clip `a` (`sourceDuration` 8, so 0–8), `beatMarkers: [5.37]`, playhead 2, zoom 80. *end handle snaps the clip's end to the beat, unrounded:* `translationX: -2.6 * 80` → end 5.4 → 0.03 from 5.37 → `trimEnd` 5.37 (not 5.4). *end handle away from targets keeps today's 0.1 s rounding:* `translationX: -1.26 * 80` → `trimEnd` 6.7. *start handle snaps the clip's END* (the track ripples): `translationX: 2.6 * 80` → the end would be 8 − 2.6 = 5.4 → 5.37 → `trimStart` 2.63. *cuts and other bars are not targets* for a main-clip trim.
- `Timeline.test.tsx` — the guide element is mounted inside `timeline-scroll` when a guide time is set; the scroll content's width / paddings and the `ScrollView`'s handlers are as before.

Existing tests in these files whose drags now land within 8 pt of a target: read each, and either move the test's playhead / offsets out of reach or (when the old expectation was really about snapping-free maths) keep the value by using an offset that does not snap. List every changed expectation in the report.

- [ ] **Step 5: Run** → FAIL. **Step 6: Implement.**

`snapping.ts`:

```ts
import { create } from "zustand";
import { clipSnapTargets, snapMove, snapTargets, snapThreshold, snapTime } from "./model/snap";
import { useEditorStore } from "./store";
import { haptic } from "@/src/ui/haptics";

/** The project time of the snap guide line (null = hidden). Transient: not saved, not undoable. */
export const useSnapGuide = create<{ time: number | null }>(() => ({ time: null }));

export function createSnapper(): Snapper {
  let targets: number[] = [], threshold = 0, last: number | null = null;
  const landed = (target: number | null) => {
    if (target !== null && target !== last) haptic("light");            // entering a snap; holding it or leaving it is silent
    if (target !== last) useSnapGuide.setState({ time: target });
    last = target;
  };
  return {
    begin(excludeId, mainClip = false) {
      const s = useEditorStore.getState();
      targets = !s.project ? [] : mainClip ? clipSnapTargets(s.project, s.playhead) : snapTargets(s.project, s.playhead, excludeId);
      threshold = snapThreshold(s.pixelsPerSecond); last = null;
    },
    time(t) { const r = snapTime(t, targets, threshold); landed(r.target); return r.time; },
    move(start, duration) { const r = snapMove(start, duration, targets, threshold); landed(r.target); return r.start; },
    snapped: () => last !== null,
    end() { targets = []; last = null; if (useSnapGuide.getState().time !== null) useSnapGuide.setState({ time: null }); },
  };
}
```

`SnapGuide.tsx`: reads `useSnapGuide((s) => s.time)` and `pixelsPerSecond`; null → `null`; else `<View testID="snap-guide" pointerEvents="none" style={{ position: "absolute", left: left + timeToX(time, pps) - 0.5, top: 0, width: 1, height, backgroundColor: theme.colors.accent }} />`. `Timeline.tsx`: `<SnapGuide left={pad} height={height} />` as the LAST child of the `ScrollView` (after `<EffectLane />`) — absolute, so the content size does not change. Nothing else in that file changes.

Every bar: `const snapper = useRef(createSnapper()).current;` — `onStart` calls the existing `snap()` then `snapper.begin(id)`; every gesture gets `.onFinalize(() => snapper.end())` before `.runOnJS(true)`. Per spec §5's table:
- `OverlayPill` — the drag ref also keeps `end`; move: `moveOverlay(p, o.id, snapper.move(start0 + dx, end0 - start0))`; left: `{ start: snapper.time(start0 + dx) }`; right: `{ end: snapper.time(end0 + dx) }` (`dx = xToTime(e.translationX, pps)`).
- `EffectPill` — the same with `moveEffect` / `updateEffect`.
- `AudioBar` — `len0 = trimEnd0 - trimStart0`, `end0 = start0 + len0`; move: `moveAudioTrack(p, id, snapper.move(start0 + dx, len0))`; right: `trimEnd: trimEnd0 + (snapper.time(end0 + dx) - end0)`; left (the end moves the other way): `trimStart: trimStart0 + (end0 - snapper.time(end0 - dx))`.
- `LayerBar` — `dragRef` also keeps `end` (`layerEnd(cur)` at `snap()`); move: `start = Math.max(0, snapper.move(dragRef.current.start + dx, clipDuration(cur)))`; handles: convert the snapped edge back into the drag distance and hand THAT to the unchanged `layerTrimFromDrag` — left: `tx = (snapper.time(start0 + dx) - start0) * pps`; right: `tx = (snapper.time(end0 + dx) - end0) * pps`. The refusal check keeps using the finger's real `e.translationX`.
- `TrimHandles` — `Handle` keeps `{ value, end }` in its ref (`end` = the clip's end on the timeline at `onStart`: `clipStartTimes(project)[index] + clipDuration(clip)`, both from `timeline.ts`); `snapper.begin(null, true)`. End handle: `tx = (snapper.time(end0 + dx) - end0) * pps`; start handle: `tx = (end0 - snapper.time(end0 - dx)) * pps`; then `trimFromDrag(c, edge, startRef.current.value, tx, pps, snapper.snapped())`. `trimFromDrag` gains a last parameter `exact = false`: when true the 0.1 s rounding (`snap`) is skipped for the dragged value (the minimum-length bounds are unchanged). No `speed` anywhere: `sourceAfter` already converts the output delta.

- [ ] **Step 7:** `npm run typecheck`; `npm test`; confirm `git diff --stat` shows no change to `src/editor/timelineScroll.ts`. **Step 8: Commit** `feat(timeline): snapping for bars and clip trims, with a guide line and a haptic`.

---

### Task 8: Multi-select UI

**Depends on:** Task 2 (store, ops), Task 5 (`toolGroups.ts` / `EditorToolbar.tsx` — edit on top of its changes), Task 7 (`Timeline.tsx` — edit on top of its change).

**Files:** Create `src/editor/components/MultiSelectBar.tsx`, `src/editor/__tests__/MultiSelectBar.test.tsx`; modify `src/editor/toolGroups.ts`, `src/editor/components/EditorToolbar.tsx`, `Timeline.tsx`, `FilterSheet.tsx`, `SpeedSheet.tsx`, `VolumeSheet.tsx`; tests `toolGroups.test.ts`, `EditorToolbar.test.tsx`, `Timeline.test.tsx`, `FilterSheet.test.tsx`, `SpeedSheet.test.tsx`, `VolumeSheet.test.tsx`.

**Do not touch:** `store.ts`, `ops.ts`, the bar components, `timelineScroll.ts`, `PreviewPlayer.tsx`.

**Interfaces — Consumes:** `multiSelect`, `enterMultiSelect`, `toggleMultiSelect`, `selectAllClips`, `exitMultiSelect` (store); `deleteClips`, `duplicateClips`, `forClips`, `mainClipIds` (ops). **Produces:**

```ts
// toolGroups.ts: ToolId gains "select"; Edit tools: `…, "duplicate", "delete", "select", "ratio", "cover"`
// The three sheets gain one optional prop:
clipIds?: string[]   // multi-select: every change is written to all of these main clips; `clipId` is the clip whose values are shown
// MultiSelectBar.tsx
export function MultiSelectBar(): React.JSX.Element | null
```

**Behaviour**
- `select` tool: `{ label: "Select", icon: "checkmark-done", disabled: clipCount < 2, onPress: () => { haptic("light"); useEditorStore.getState().enterMultiSelect(); } }`.
- `EditorToolbar`: `const multi = useEditorStore((s) => s.multiSelect !== null);` — after all hooks, `if (multi) return <MultiSelectBar />;` (the toolbar component stays mounted, so its group and sheet state survive the mode).
- `MultiSelectBar`: same outer container as the toolbar (surface, hairline, bottom inset). A header line `Body weight="semi"`: `` `${n} selected` `` (`accessibilityRole="header"`). One row of `ToolButton`s: `Delete` (trash), `Duplicate` (copy), `Filter` (color-filter), `Speed` (speedometer), `Volume` (volume-high), `Select all` (albums-outline), `Done` (checkmark). `ids = mainClipIds(project, multiSelect)` (timeline order). Enabled rules: Delete / Duplicate / Filter need `n ≥ 1`; Speed and Volume need at least one selected VIDEO clip; Select all and Done always.
  - Delete: `haptic("medium"); apply((p) => deleteClips(p, ids))` (the store then ends the mode). Duplicate: `haptic("light"); apply((p) => duplicateClips(p, ids))`.
  - Filter / Speed / Volume: local `sheet` state; `<FilterSheet clipId={ids[0] ?? null} clipIds={ids} … />`, and for Speed / Volume `clipId` = the first selected video clip.
  - Select all → `selectAllClips()`; Done → `exitMultiSelect()`.
- Sheets in `clipIds` mode (title `Filter · 3 clips`, `Speed · 3 clips`, `Volume · 3 clips`):
  - `FilterSheet`: tile → `apply((p) => forClips(p, clipIds, (q, id) => setClipFilter(q, id, f)))`; slider → `applyTransient` with `forClips(… setClipFilterIntensity …)` after one `beginTransaction`; the "Apply to all clips" action is not offered.
  - `SpeedSheet`: preset chip and slider → `forClips(… setClipSpeed …)`; a curve tile → `forClips(… setClipSpeedCurve …)`; when the result is the same project and the tile is not the shown clip's current one → close + toast "These clips are too short for a speed curve." (photos and too-short clips are skipped by the single ops; the others change). The "Clip length" line shows the shown clip only.
  - `VolumeSheet`: slider and Mute through `forClips`; the fade sliders are hidden (lengths differ per clip).
  - Without `clipIds` every sheet behaves exactly as today (existing tests unchanged).
- `Timeline.tsx`: `const multi = useEditorStore((s) => s.multiSelect);` — in the mode a strip's `selected` is `multi.includes(clip.id)` and its `onPress` is `() => useEditorStore.getState().toggleMultiSelect(clip.id)` (no seek, no `select`); outside the mode exactly today's props. `renderStripExtras` needs no change (no clip is selected in the mode, so no trim / reorder handles show).

- [ ] **Step 1: Failing tests.**
  - `toolGroups.test.ts`: the Edit list.
  - `EditorToolbar.test.tsx`: *Select is disabled with one clip, enabled with two; pressing it replaces the toolbar:* press `Select` → `getByRole("header", { name: "0 selected" })`, no `tab` roles on screen, buttons `Delete`, `Duplicate`, `Filter`, `Speed`, `Volume`, `Select all`, `Done` present; press `Done` → the tabs are back and the Edit group is still the open one. *Entering with clip a selected* → `1 selected`.
  - `MultiSelectBar.test.tsx` (project: video `a` 4 s, video `b` 6 s, photo `c`; store in the mode):
    1. *nothing selected:* Delete, Duplicate, Filter, Speed, Volume disabled; Select all and Done enabled.
    2. *Select all → `3 selected`.* *Delete:* with `a` and `c` selected press Delete → clips `["b"]`, `past` length 1, `multiSelect` null (the mode is over), one medium haptic.
    3. *Duplicate:* `a` + `b` selected → 5 clips in the order a, copy, b, copy, c; `past` 1; still `2 selected`.
    4. *only the photo selected:* Speed and Volume disabled, Filter enabled.
    5. *Filter:* `a` + `c` → press Filter → header `Filter · 2 clips` → press tile `Warm` → both clips have `filter: "warm"`, `b` untouched, `past` 1; slider `filter-strength` `slidingStart` + `valueChange` 0.5, 0.4 → both at 0.4, `past` 2; no `Apply to all clips` button.
    6. *Speed:* `a` + `b` + `c` → press Speed → chip `2×` → `a` and `b` at speed 2, photo `c` unchanged, `past` 1.
    7. *Volume:* `a` + `b` → slider `volume-slider` to 0.5 → both 0.5 in one undo step; Mute switch on → both muted (second step); no fade sliders in the sheet.
    8. *Done → `multiSelect` null.*
  - `FilterSheet.test.tsx` / `SpeedSheet.test.tsx` / `VolumeSheet.test.tsx`: one `clipIds` case each rendered directly (two ids, one of them a layer id → the layer is skipped), plus one asserting the single-clip title and the "Apply to all clips" action are unchanged without `clipIds`.
  - `Timeline.test.tsx`: in the mode, pressing `Clip a` then `Clip b` → `multiSelect` `["a", "b"]`, `selectedClipId` null, the playhead did not move, both strips have `accessibilityState.selected`; pressing `Clip a` again → `["b"]`; outside the mode a press selects and seeks as before.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4:** `npm run typecheck`; `npm test`. **Step 5: Commit** `feat(editor): multi-select for clips — delete, duplicate, filter, speed, volume`.

---

### Task 9: Docs and full checks

**Depends on:** Tasks 1–8.

**Files:** `README.md`, `AGENTS.md`, the spec's Status line and a new "As built" list in it, `docs/superpowers/research/capcut-roadmap.md`.

- [ ] **Step 1** —
  - README: a new "Polish" section after "Layers" (Export options: what frame rate and quality do, that quality is a file-size ceiling; Cover: the tool, Save to Photos, the drafts list, Instagram only; Snapping: what snaps to what; Multi-select: how to enter and leave). "Posting" section: one line — the cover frame is sent to Instagram as the Reel's thumbnail; the other platforms pick their own.
  - README "First native build — things to check", new items: **Frame rate** (a 24 and a 60 fps export report that rate and play smoothly; text animations still move); **Quality / file size** (Standard and High exports play to the END, High is larger than Standard, neither is far above the estimate — if an export is cut short or fails, set `ExportSession.limitsFileLength` to false); **60 fps export time** on a long project; **Cover on Instagram** (the Reel's cover is the chosen frame — `thumb_offset` is in milliseconds).
  - AGENTS.md "This repo": `- Export options: keep EXPORT_FPS (src/editor/model/types.ts) ↔ ExportSession.frameRates identical; the bitrate is computed only in src/export/estimate.ts and sent in the request.` and `- Snapping: only src/editor/model/snap.ts computes snap targets and snapped times; bars use createSnapper (src/editor/snapping.ts).`
  - Spec: Status → `Implemented 2026-10-04 (Swift export unverified until an EAS build exists; on-device checklist pending)`; add an **As built** list under §7 with every deviation the task reports recorded (existing tests changed for snapping, anything the installed `react-native-view-shot` typings forced, etc.).
  - Roadmap group G: "Frame-rate and quality choice" → Have; "Cover / thumbnail editor" → Have; "Timeline snapping, multi-select" → Have (multi-select: main clips).
- [ ] **Step 2** — `npm run typecheck`; `npm test`; `npx.cmd expo-doctor`; `npm ls --all | Select-String invalid` (empty); `git status --short` shows nothing unexpected (in particular no change under `ios/`, `android/`, `src/editor/timelineScroll.ts`).
- [ ] **Step 3: Commit** `docs: export options, cover, snapping, multi-select (CapCut group G)`.

**Device checklist (user, Expo Go)** — start with `npx expo start --go --port 8090`, open the app on the iPhone, open a project with at least three clips, one text and one song.

1. Tap **Export**. You should see three rows: Resolution, Frame rate, Quality. Tap **60 fps** and **High** — the estimated size grows. Close the export sheet, open it again: 60 fps and High are still chosen.
2. In the editor open **Edit** and scroll the tool row to the end. Tap **Cover**.
3. Drag the slider — the picture changes. Type a title — it appears on the picture. Tap **Save to Photos** and allow access: the picture with the title is in the Photos app.
4. Tap **Done**. Go back to the list of projects: the card shows the cover picture and the title.
5. Open the project again, tap **Cover**, tap **Reset**: the card goes back to the first frame.
6. Tap the text bar on the timeline, hold it and drag it slowly towards the white playhead line: it clicks onto it with a small buzz and a thin gold line shows. Try the same against the edge between two clips and the end of the song.
7. Pull the text bar's left and right handles near the playhead: the edge clicks onto it.
8. Add two beat marks (Audio → Beats), tap a clip and pull its right trim handle near a beat mark: it clicks onto it.
9. Open **Edit** → **Select**. Tap two clips: the bar says "2 selected". Tap **Filter** → pick one: both clips get it. Tap **Volume** → drag: both change. Tap **Duplicate**: each gets a copy next to it. Tap **Delete**: the selected clips go and the normal toolbar comes back.
10. Tap undo until everything is back; close and reopen the project — the frame rate, quality and cover are remembered.
