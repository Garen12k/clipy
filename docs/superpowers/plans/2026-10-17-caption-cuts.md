# Captions follow cuts, and Remove filler words: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** (1) After Remove pauses, what is tied to the picture — texts, captions (and their words), stickers, effect bars, layers' starts, the cover — moves with the cut through ONE pure time map; sounds and beat markers do not move. (2) The Captions panel gains a **Filler words** row: "N found", the note, and the white **Remove N Filler Words**, which cuts every filler word's moment out of the video clip under it and out of its caption, in ONE undo step for all clips, said "N filler words removed" with Undo.

**Architecture:** A new pure module `src/editor/model/rippleCuts.ts` turns a clip's source cuts into project ranges removed (timeline.ts helpers only) and maps every timed thing through `t → t − removed before t`. `ops.ts` gains `removeCuts(p, list)` (all clips, all or nothing, ONE map built from the original project, ONE `touch`); `removePauses` becomes `removeCuts` of one clip with unchanged refusals. A new pure `src/editor/model/fillers.ts` finds fillers in the caption words and plans cuts with the pause piece rules (`fitCuts`, extracted from `findPauses`). The row (`FillerWordsRow.tsx`) sits first in `CaptionsSheet`'s scrolling body.

**Tech Stack:** Expo SDK 57, React Native (Fabric), TypeScript strict, zustand 5, Jest 29.7 (`jest-expo`) + RNTL 14. No native code, no new package, no `app.json` change, no schema bump, no `LEVELS` row. Works in Expo Go.

**Spec:** `docs/superpowers/specs/2026-10-17-caption-cuts-design.md` (binding: §2.1 the map, §2.2 what follows, §2.3 the op, §2.4 fillers, §2.5 the row, §2.9 the changed decisions, §4 the one test that may change, §7 the vectors).

## Global Constraints

- iPhone only. Read `AGENTS.md` first; it binds (Remove pauses, Messages, Toolbar / Panels, Casing, Text size, Palette, Spacing, Icons, Effects registry — only `timeline.ts` multiplies / divides by `speed` —, Beats).
- **Never edited to make a change pass:** every PROOF named in AGENTS.md (`toolGroups.groups.test.ts`'s PROOF, `defaultTree.proof.test.tsx`, `looks.frozen.test.ts`, `timeline.stepped.proof.test.ts`, `overlayFrames.proof.test.tsx`, `quickEdit.recipes.proof.test.ts`, `storage.load.proof.test.ts`, the PROOF blocks of `migrate.test.ts` / `useExport*.test.ts` / `beatDetect.slices.test.ts`), `pauses.test.ts`, `CaptionsSheet.test.tsx`, `RemovePausesSheet.test.tsx`, `beats*.test.ts`, `toolbarContext*.test.ts`.
- **Not edited:** any Swift file, `modules/clipy-video/*`, `timeline.ts`, `timelineScroll.ts`, `timelineLayout.ts`, `beats.ts`, `toolbarContext.ts`, `RemovePausesSheet.tsx`, `pauseFind.ts`, `store.ts`, the kit (`src/ui/*`), the export.
- **The one test that may be updated (spec §4):** `src/editor/model/__tests__/ops.removePauses.test.ts`, the test titled "the transition into the clip stays, re-capped against the first piece — dropped under TRANSITION_LIMITS.min; nothing else moves": the title's "nothing else moves" → "sounds and markers do not move", and its last line replaced exactly as Task 2 says. Nothing else in that file.
- RNTL v14: `render` / `renderHook` / `fireEvent` are async — always `await`.
- **Checks for every task:** `npm.cmd run typecheck`, then `npm.cmd test`. Record the baseline (suites / tests / snapshots for app and server) before Task 1; every task ends with no failure and the app suite count grown by exactly its new files.
- Windows: PowerShell, no `&&`, `npx.cmd` / `npm.cmd`. Never `git stash`. `git add` explicit paths only, never `-A`, never push. Commit trailer exactly `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Task order

`1 → 2 → 3 → 4 → 5`

| Task | Title | Files it owns |
|---|---|---|
| 1 | The time map + ripple of every timed thing | NEW `src/editor/model/rippleCuts.ts` (+ NEW test) |
| 2 | `removeCuts`; Remove pauses ripples | `src/editor/model/ops.ts`, the one line of `ops.removePauses.test.ts` (+ NEW `ops.removeCuts.test.ts`, NEW `RemovePausesSheet.ripple.test.tsx`) |
| 3 | Fillers finder | `src/editor/model/pauses.ts` (`fitCuts`), NEW `src/editor/model/fillers.ts`, NEW `src/editor/captionLanguage.ts` (+ NEW tests) |
| 4 | The Captions panel row + message | NEW `src/editor/components/FillerWordsRow.tsx`, `src/editor/components/CaptionsSheet.tsx` (+ NEW test) |
| 5 | Docs | `AGENTS.md`, `docs/next-build-phone-checklist.md` |

---

## Task 0 — Baseline

- [ ] `git branch --show-current` → `caption-cuts`; `git status --short` clean.
- [ ] `npm.cmd run typecheck` (no error) and `npm.cmd test`; write down app and server suites / tests / snapshots.

---

## Task 1 — The time map + ripple of every timed thing

**Files:**
- Create: `src/editor/model/rippleCuts.ts`
- Create: `src/editor/model/__tests__/rippleCuts.test.ts`

**Interfaces (exact):**

```ts
export type Removed = readonly [number, number];   // project seconds, a < b
export function removedOf(p: Project, clipId: string, cuts: readonly PauseCut[]): Removed[];
export function mergeRemoved(ranges: readonly Removed[]): [number, number][];
export function mapTime(ranges: readonly Removed[], t: number): number;   // ranges merged
export function inRemoved(ranges: readonly Removed[], t: number): boolean;   // strictly inside
export function rippleTimed(p: Project, removed: readonly Removed[], total: number): Pick<Project, "overlays" | "effects" | "layers" | "cover">;
```

- [ ] **Step 1: the failing test** — `src/editor/model/__tests__/rippleCuts.test.ts`:

```ts
import { clampCaptionWords, captionLength, makeClip, makeEffect, makeKeyframe, makeLayer, makeOverlay, makeProject, type TextOverlay } from "../types";
import { inRemoved, mapTime, mergeRemoved, removedOf, rippleTimed } from "../rippleCuts";

const RS = [[2, 3], [5, 7]] as const;

test("mergeRemoved: sorted, merged, empty and non-finite ranges dropped", () => {
  expect(mergeRemoved([[5, 7], [2, 3], [2.5, 4], [1, 1], [NaN, 2]])).toEqual([[2, 4], [5, 7]]);
  expect(mergeRemoved([[1, 2], [2, 3]])).toEqual([[1, 3]]);   // touching ranges are one
  expect(mergeRemoved([])).toEqual([]);
});

test("mapTime: identity before, a removed time collapses to its range's start, later times lose what was removed before them", () => {
  expect([1, 2, 2.5, 3, 4, 5, 6, 7, 8].map((t) => mapTime(RS, t))).toEqual([1, 2, 2, 2, 3, 4, 4, 4, 5]);
  expect(mapTime([], 3)).toBe(3);
});

test("mapTime is monotone (never decreasing)", () => {
  let last = -Infinity;
  for (let t = 0; t <= 10; t += 0.01) { const m = mapTime(RS, t); expect(m).toBeGreaterThanOrEqual(last - 1e-12); last = m; }
});

test("inRemoved: strictly inside only", () => {
  expect([2, 2.5, 3, 4, 6].map((t) => inRemoved(RS, t))).toEqual([false, true, false, false, true]);
});

test("removedOf: source cuts → project ranges through timeline.ts, clamped to the trim; [] for an unknown id", () => {
  const p = makeProject({ clips: [makeClip({ id: "a", sourceDuration: 4 }), makeClip({ id: "t", sourceDuration: 20, trimStart: 2, trimEnd: 12 })] });
  expect(removedOf(p, "t", [[4, 5], [8, 9.5]])).toEqual([[6, 7], [10, 11.5]]);
  expect(removedOf(p, "t", [[1, 3]])).toEqual([[4, 5]]);   // clamped to trimStart 2
  const fast = makeProject({ clips: [makeClip({ id: "a", sourceDuration: 4 }), makeClip({ id: "t", sourceDuration: 20, trimStart: 2, trimEnd: 12, speed: 2 })] });
  expect(removedOf(fast, "t", [[4, 6]])).toEqual([[5, 6]]);
  expect(removedOf(p, "nope", [[4, 5]])).toEqual([]);
});

const caption = (more: Partial<TextOverlay> = {}): TextOverlay => makeOverlay({ id: "c", kind: "caption", start: 5, end: 9, text: "so um we go", words: [
  { text: "so", start: 0, end: 0.4 }, { text: "um", start: 0.6, end: 0.9 }, { text: "we", start: 1.5, end: 1.8 }, { text: "go", start: 2.6, end: 3 }], ...more });

test("a caption: shortened, a word whose middle is cut is dropped, the others mapped, the text rebuilt and valid", () => {
  const p = makeProject({ overlays: [caption()] });
  const { overlays } = rippleTimed(p, [[6, 7]], 20);
  const c = overlays[0] as TextOverlay;
  expect([c.start, c.end, c.text]).toEqual([5, 8, "so um go"]);
  expect(c.words).toEqual([{ text: "so", start: 0, end: 0.4 }, { text: "um", start: 0.6, end: 0.9 }, { text: "go", start: 1.6, end: 2 }]);
  expect(clampCaptionWords(c.words, c.text, captionLength(c.start, c.end))).toEqual(c.words);   // the normaliser keeps them
});

test("a caption keeps its text byte for byte when no word is dropped; one with no words left, or under 0.2 s, is removed", () => {
  const spaced = caption({ text: "so  um we go" });   // two spaces: still valid words
  const kept = rippleTimed(makeProject({ overlays: [spaced] }), [[3, 4]], 20).overlays[0] as TextOverlay;
  expect([kept.start, kept.end, kept.text]).toEqual([4, 8, "so  um we go"]);
  expect(rippleTimed(makeProject({ overlays: [caption()] }), [[4, 9.5]], 20).overlays).toEqual([]);
  const one = makeOverlay({ id: "u", kind: "caption", start: 5, end: 6, text: "um", words: [{ text: "um", start: 0.2, end: 0.6 }] });
  expect(rippleTimed(makeProject({ overlays: [one] }), [[5.1, 5.7]], 20).overlays).toEqual([]);
});

test("a caption without words (its text was edited) is only shortened", () => {
  const c = makeOverlay({ id: "c", kind: "caption", start: 5, end: 9, text: "edited", words: [] });
  expect(rippleTimed(makeProject({ overlays: [c] }), [[6, 7]], 20).overlays[0]).toMatchObject({ start: 5, end: 8, text: "edited", words: [] });
});

test("texts and stickers: start / end mapped, pins re-based on the new start, the ones that collapse kept once; short ones removed", () => {
  const t = makeOverlay({ id: "t", start: 4, end: 10, keyframes: [makeKeyframe({ t: 1 }), makeKeyframe({ t: 2.5, x: 0.2 }), makeKeyframe({ t: 2.8, x: 0.3 }), makeKeyframe({ t: 4 })] });
  const q = rippleTimed(makeProject({ overlays: [t] }), [[6, 7]], 20).overlays[0];
  expect([q.start, q.end]).toEqual([4, 9]);
  expect(q.keyframes.map((k) => [k.t, k.x])).toEqual([[1, 0], [2, 0.2], [3, 0]]);   // 6.5 and 6.8 both land on 6 → the earlier pin stays
  const tiny = makeOverlay({ id: "s", start: 6.1, end: 6.9 });
  expect(rippleTimed(makeProject({ overlays: [tiny] }), [[6, 7]], 20).overlays).toEqual([]);
});

test("an overlay's end never passes the new total; the animation durations are kept", () => {
  const t = makeOverlay({ id: "t", start: 8, end: 10, animation: { in: { id: "fade", duration: 0.5 }, out: { id: "fade", duration: 0.5 }, loop: null } });
  const q = rippleTimed(makeProject({ overlays: [t] }), [[2, 3]], 8.9).overlays[0];
  expect([q.start, q.end]).toEqual([7, 8.9]);
  expect(q.animation).toEqual(t.animation);
});

test("effects mapped (short ones removed); layers' starts mapped (their length is their own); the cover's time mapped", () => {
  const p = makeProject({
    effects: [makeEffect({ id: "e1", start: 1, end: 2 }), makeEffect({ id: "e2", start: 4, end: 9 }), makeEffect({ id: "e3", start: 6.2, end: 6.8 })],
    layers: [makeLayer({ id: "L1", sourceDuration: 2, start: 1 }), makeLayer({ id: "L2", sourceDuration: 2, start: 6.5 }), makeLayer({ id: "L3", sourceDuration: 2, start: 8 })],
    cover: { time: 8, title: "" },
  });
  const r = rippleTimed(p, [[6, 7]], 20);
  expect(r.effects.map((e) => [e.id, e.start, e.end])).toEqual([["e1", 1, 2], ["e2", 4, 8]]);
  expect(r.effects[0]).toBe(p.effects[0]);
  expect(r.layers.map((l) => [l.id, l.start])).toEqual([["L1", 1], ["L2", 6], ["L3", 7]]);
  expect(r.layers[0]).toBe(p.layers[0]);
  expect(r.cover).toEqual({ time: 7, title: "" });
});

test("nothing after the first range: the same arrays and the same cover", () => {
  const p = makeProject({ overlays: [makeOverlay({ id: "o", start: 0, end: 2 })], effects: [makeEffect({ id: "e", start: 0, end: 1 })],
    layers: [makeLayer({ id: "L", sourceDuration: 1, start: 0 })], cover: { time: 1, title: "x" } });
  const r = rippleTimed(p, [[5, 6]], 20);
  expect(r.overlays).toBe(p.overlays); expect(r.effects).toBe(p.effects); expect(r.layers).toBe(p.layers); expect(r.cover).toBe(p.cover);
  expect(rippleTimed(p, [], 20).overlays).toBe(p.overlays);
});
```

- [ ] **Step 2:** `npx.cmd jest src/editor/model/__tests__/rippleCuts.test.ts` → FAILS (module missing).

- [ ] **Step 3: the module** — `src/editor/model/rippleCuts.ts`:

```ts
import type { PauseCut } from "./pauses";
import { clipStartTimes, sourceToOutput } from "./timeline";
import { captionLength, clampCaptionWords, clampOverlayKeyframes, EFFECT_LIMITS, OVERLAY_LIMITS, type Cover, type EffectItem, type LayerClip, type Overlay, type Project } from "./types";

/**
 * Cuts made inside main clips, and what follows them (spec §2.1–2.2). Pure TypeScript, no speed arithmetic (timeline.ts converts).
 * ONE map per operation: `t → t − removed time before t`; a time inside a removed range collapses to the range's start. What is tied
 * to the picture follows it — overlays (and their pins and caption words), effect bars, layers' starts, the cover; sounds and beat
 * markers are never passed here.
 */
export type Removed = readonly [number, number];

const EPS = 1e-9;
const r3 = (v: number): number => Math.round(v * 1000) / 1000;

/** A main clip's cuts (source seconds) as the project time they take away, each clamped to the trim; [] for an id that is not a main clip. */
export function removedOf(p: Project, clipId: string, cuts: readonly PauseCut[]): Removed[] {
  const i = p.clips.findIndex((c) => c.id === clipId);
  if (i < 0) return [];
  const clip = p.clips[i], start = clipStartTimes(p)[i];
  const out: Removed[] = [];
  for (const [a, b] of cuts) {
    const from = Math.max(a, clip.trimStart), to = Math.min(b, clip.trimEnd);
    if (!(to > from)) continue;
    out.push([start + sourceToOutput(clip, from), start + sourceToOutput(clip, to)]);
  }
  return out;
}

/** Finite, non-empty ranges, sorted, overlapping or touching ones merged. */
export function mergeRemoved(ranges: readonly Removed[]): [number, number][] {
  const sorted = ranges.filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b) && b > a).map(([a, b]): [number, number] => [a, b]).sort((x, y) => x[0] - y[0]);
  const out: [number, number][] = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (last && r[0] <= last[1] + EPS) last[1] = Math.max(last[1], r[1]);
    else out.push(r);
  }
  return out;
}

/** `t` once the (merged) ranges are gone: identity before the first, a removed time → its range's start. Monotone. */
export function mapTime(ranges: readonly Removed[], t: number): number {
  let gone = 0;
  for (const [a, b] of ranges) {
    if (t <= a) break;
    if (t < b) return a - gone;
    gone += b - a;
  }
  return t - gone;
}

/** Strictly inside a removed range. */
export const inRemoved = (ranges: readonly Removed[], t: number): boolean => ranges.some(([a, b]) => t > a && t < b);

/** Each element through `f` (null = removed); the SAME array when nothing changed. */
function each<T>(list: readonly T[], f: (x: T) => T | null): T[] {
  let changed = false;
  const out: T[] = [];
  for (const x of list) { const y = f(x); if (y !== x) changed = true; if (y !== null) out.push(y); }
  return changed ? out : (list as T[]);
}

function rippleOverlay(o: Overlay, rs: readonly Removed[], total: number): Overlay | null {
  const start = r3(Math.min(mapTime(rs, o.start), total)), end = r3(Math.min(mapTime(rs, o.end), total));
  if (start === o.start && end === o.end) return o;
  if (end - start < OVERLAY_LIMITS.minDuration - EPS) return null;
  const at = (rel: number): number => r3(mapTime(rs, o.start + rel) - start);
  const keyframes = o.keyframes.length === 0 ? o.keyframes : clampOverlayKeyframes(o.keyframes.map((k) => ({ ...k, t: at(k.t) })));
  if (o.kind !== "caption" || o.words.length === 0) return { ...o, start, end, keyframes };
  // A word whose middle is cut is no longer heard: it goes. The rest keep their text, so the joined words stay the caption's text.
  const kept = o.words.filter((w) => !inRemoved(rs, o.start + (w.start + w.end) / 2));
  if (kept.length === 0) return null;
  const text = kept.length === o.words.length ? o.text : kept.map((w) => w.text).join(" ");
  const words = kept.map((w) => ({ text: w.text, start: at(w.start), end: at(w.end) }));
  return { ...o, start, end, keyframes, text, words: clampCaptionWords(words, text, captionLength(start, end)) };
}

function rippleEffect(e: EffectItem, rs: readonly Removed[], total: number): EffectItem | null {
  const start = r3(Math.min(mapTime(rs, e.start), total)), end = r3(Math.min(mapTime(rs, e.end), total));
  if (start === e.start && end === e.end) return e;
  return end - start < EFFECT_LIMITS.minDuration - EPS ? null : { ...e, start, end, rect: e.rect ? { ...e.rect } : null };
}

function rippleLayer(l: LayerClip, rs: readonly Removed[]): LayerClip {
  const start = r3(mapTime(rs, l.start));
  return start === l.start ? l : { ...l, start };
}

function rippleCover(c: Cover | null, rs: readonly Removed[], total: number): Cover | null {
  if (c === null || !Number.isFinite(c.time)) return c;
  const time = r3(Math.max(0, Math.min(mapTime(rs, c.time), total)));
  return time === c.time ? c : { ...c, time };
}

/** What is tied to the picture, after `removed` (project ranges of the ORIGINAL project, any order) is taken out; `total` is the new length. */
export function rippleTimed(p: Project, removed: readonly Removed[], total: number): Pick<Project, "overlays" | "effects" | "layers" | "cover"> {
  const rs = mergeRemoved(removed);
  if (rs.length === 0) return { overlays: p.overlays, effects: p.effects, layers: p.layers, cover: p.cover };
  return {
    overlays: each(p.overlays, (o) => rippleOverlay(o, rs, total)),
    effects: each(p.effects, (e) => rippleEffect(e, rs, total)),
    layers: each(p.layers, (l) => rippleLayer(l, rs)),
    cover: rippleCover(p.cover, rs, total),
  };
}
```

- [ ] **Step 4:** the test passes; `npm.cmd run typecheck`; `npm.cmd test` (app suites +1).
- [ ] **Step 5: commit** — `git add src/editor/model/rippleCuts.ts src/editor/model/__tests__/rippleCuts.test.ts`; message `feat(editor): one time map for cuts — what is tied to the picture follows, sound does not`.

---

## Task 2 — `removeCuts`; Remove pauses ripples

**Files:**
- Modify: `src/editor/model/ops.ts`
- Modify (one test, one line + title, spec §4): `src/editor/model/__tests__/ops.removePauses.test.ts`
- Create: `src/editor/model/__tests__/ops.removeCuts.test.ts`
- Create: `src/editor/__tests__/RemovePausesSheet.ripple.test.tsx`

**Interfaces (exact):**

```ts
export type ClipCuts = { clipId: string; cuts: readonly PauseCut[] };
export function canCutClip(p: Project, clip: Clip): boolean;
export function removeCuts(p: Project, list: readonly ClipCuts[]): Project;
export function removePauses(p: Project, clipId: string, cuts: readonly PauseCut[]): Project;   // unchanged signature
```

- [ ] **Step 1: the failing tests** — `src/editor/model/__tests__/ops.removeCuts.test.ts`:

```ts
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-17T10:00:00.000Z" }));
jest.mock("@/src/lib/id", () => { let n = 0; return { newId: () => `piece-${++n}` }; });
import { canCutClip, extractClipAudio, removeCuts, removePauses } from "../ops";
import { totalDuration } from "../timeline";
import { makeAudioTrack, makeClip, makeEffect, makeLayer, makeOverlay, makePhotoClip, makeProject, type Project, type TextOverlay } from "../types";
import { contextFor } from "../../toolbarContext";

// a 0–4 · t 4–14 (trim 2 … 12) · u 14–20 · z 20–24
const base = (): Project => makeProject({
  clips: [makeClip({ id: "a", sourceDuration: 4 }), makeClip({ id: "t", sourceDuration: 20, trimStart: 2, trimEnd: 12 }),
    makeClip({ id: "u", sourceDuration: 6 }), makeClip({ id: "z", sourceDuration: 4 })],
  overlays: [makeOverlay({ id: "before", start: 1, end: 3 }), makeOverlay({ id: "over", start: 9, end: 11 }), makeOverlay({ id: "later", start: 21, end: 23 }),
    makeOverlay({ id: "cap", kind: "caption", start: 15, end: 18, text: "hi there you", words: [{ text: "hi", start: 0, end: 0.4 }, { text: "there", start: 1, end: 1.4 }, { text: "you", start: 2, end: 2.5 }] })],
  audioTracks: [makeAudioTrack({ id: "m", sourceDuration: 30 })], beatMarkers: [5, 10, 15],
  effects: [makeEffect({ id: "e", start: 12, end: 16 })], layers: [makeLayer({ id: "L", sourceDuration: 2, start: 22 })], cover: { time: 21, title: "" },
});
const times = (p: Project) => p.overlays.map((o) => [o.id, o.start, o.end]);

test("Remove pauses moves what is over and after the clip; sounds and markers stay", () => {
  const p = base();
  const q = removePauses(p, "t", [[4, 5], [8, 9.5]]);   // project 6 … 7 and 10 … 11.5 go: 2.5 s
  expect(totalDuration(p) - totalDuration(q)).toBeCloseTo(2.5, 9);
  expect(times(q)).toEqual([["before", 1, 3], ["over", 8, 9], ["later", 18.5, 20.5], ["cap", 12.5, 15.5]]);
  expect(q.overlays[0]).toBe(p.overlays[0]);
  expect(q.effects.map((e) => [e.start, e.end])).toEqual([[9.5, 13.5]]);
  expect(q.layers[0].start).toBe(19.5);
  expect(q.cover).toEqual({ time: 18.5, title: "" });
  expect(q.audioTracks).toBe(p.audioTracks);
  expect(q.beatMarkers).toBe(p.beatMarkers);
});

test("two clips at once: ONE map from the original — equal to cutting them one by one, last first or first first", () => {
  const p = base();
  // t's cut removes project 6 … 7, u's 15 … 16. The caption starts exactly at 15 (not inside: → 14); its "hi" (middle 15.2) goes.
  const both = removeCuts(p, [{ clipId: "t", cuts: [[4, 5]] }, { clipId: "u", cuts: [[1, 2]] }]);
  expect(times(both)).toEqual([["before", 1, 3], ["over", 8, 10], ["later", 19, 21], ["cap", 14, 16]]);
  expect(both.overlays[3]).toMatchObject({ text: "there you", words: [{ text: "there", start: 0, end: 0.4 }, { text: "you", start: 1, end: 1.5 }] });
  const lastFirst = removePauses(removePauses(p, "u", [[1, 2]]), "t", [[4, 5]]);
  const firstFirst = removePauses(removePauses(p, "t", [[4, 5]]), "u", [[1, 2]]);
  for (const q of [lastFirst, firstFirst]) {
    expect(q.overlays).toEqual(both.overlays);
    expect(q.effects).toEqual(both.effects);
    expect(q.layers.map((l) => l.start)).toEqual(both.layers.map((l) => l.start));
    expect(q.cover).toEqual(both.cover);
  }
});

test("a caption word inside a cut goes with it, and the caption's text follows", () => {
  const q = removeCuts(base(), [{ clipId: "u", cuts: [[1.9, 2.5]] }]);   // project 15.9 … 16.5: "there" (16 … 16.4) goes
  const cap = q.overlays.find((o) => o.id === "cap") as TextOverlay;
  expect([cap.start, cap.end, cap.text]).toEqual([15, 17.4, "hi you"]);
  expect(cap.words).toEqual([{ text: "hi", start: 0, end: 0.4 }, { text: "you", start: 1.4, end: 1.9 }]);
});

test("all or nothing: one refused clip, the same clip twice, or an empty list → the same project", () => {
  const p = base();
  expect(removeCuts(p, [])).toBe(p);
  expect(removeCuts(p, [{ clipId: "t", cuts: [[4, 5]] }, { clipId: "nope", cuts: [[1, 2]] }])).toBe(p);
  expect(removeCuts(p, [{ clipId: "t", cuts: [[4, 5]] }, { clipId: "t", cuts: [[8, 9]] }])).toBe(p);
  expect(removeCuts(p, [{ clipId: "t", cuts: [[4, 5]] }, { clipId: "u", cuts: [[0, 6]] }])).toBe(p);   // no piece left in u
});

test("refused when the moved layers would put more video layers on screen at once than allowed (and than before)", () => {
  const p = { ...base(), layers: [makeLayer({ id: "L1", sourceDuration: 3, start: 3 }), makeLayer({ id: "L2", sourceDuration: 3, start: 3.5 }), makeLayer({ id: "L3", sourceDuration: 3, start: 9 })] };
  expect(removePauses(p, "t", [[2.5, 9.5]])).toBe(p);   // project 4.5 … 11.5 goes: L3 would land at 4.5, under L1 and L2
  expect(removePauses(p, "t", [[10, 11]]).layers.map((l) => l.start)).toEqual([3, 3.5, 9]);   // 12 … 13 goes: no layer after it
});

test("canCutClip agrees with the bar's Remove pauses on every kind of clip", () => {
  const p = makeProject({ clips: [makeClip({ id: "v", sourceDuration: 8 }), makePhotoClip({ id: "ph" }), makeClip({ id: "r", sourceDuration: 5, reversed: true }),
    makeClip({ id: "fast", sourceDuration: 8, speed: 2 }), makeClip({ id: "ramp", sourceDuration: 8, speedCurve: { id: "montage", steps: [{ from: 0, to: 8, speed: 1 }] } as never }),
    makeClip({ id: "x", sourceDuration: 8 })] });
  const q = extractClipAudio(p, "x", "bar");
  for (const id of ["v", "ph", "r", "fast", "ramp", "x"]) {
    const clip = q.clips.find((c) => c.id === id)!;
    expect(canCutClip(q, clip)).toBe(contextFor({ clipId: id, overlayId: null, effectId: null, audioId: null, section: null }, q).tools.includes("pauses"));
  }
  expect(canCutClip(q, makeLayer({ id: "L", sourceDuration: 2 }))).toBe(false);
});
```

- [ ] **Step 2:** `npx.cmd jest src/editor/model/__tests__/ops.removeCuts.test.ts` → FAILS (`removeCuts` / `canCutClip` missing).

- [ ] **Step 3: ops.ts** — add the import `import { removedOf, rippleTimed, type Removed } from "./rippleCuts";` and replace the whole `removePauses` (its doc comment and body) by:

```ts
/** One main clip's cuts: SOURCE seconds, in order, inside the trim (`findPauses`, `fillerPlan`). */
export type ClipCuts = { clipId: string; cuts: readonly PauseCut[] };

/**
 * A clip `removeCuts` may cut: a MAIN clip that is a video, plays forwards at a constant speed and still holds its sound (an
 * extracted bar would play on uncut). The bar's Remove pauses (`contextFor`) asks the same, in its own words.
 */
export function canCutClip(p: Project, clip: Clip): boolean {
  return p.clips.some((c) => c.id === clip.id) && !isPhoto(clip) && !clip.reversed && !hasSpeedCurve(clip) && extractedTrackOf(p, clip.id) === null;
}

/**
 * The pieces of a clip's trim that lie BETWEEN `cuts`, by the split rules (`splitClipAt`): the first piece keeps the id, the In and
 * the fade in; the last gets the Out, the fade out and the clip's transition; no transition between pieces; a Combo and every pin
 * on each piece; own copies of what a piece may change alone. One piece (only the edges cut) is the clip trimmed. Null when refused:
 * not a clip `canCutClip` accepts, no cut or more than `PAUSES.maxCuts`, a cut out of order / empty / outside the trim, no piece
 * left, or a piece under MIN_CLIP_SECONDS.
 */
function piecesOf(p: Project, clipId: string, cuts: readonly PauseCut[]): Clip[] | null {
  const index = p.clips.findIndex((c) => c.id === clipId);
  if (index < 0 || cuts.length === 0 || cuts.length > PAUSES.maxCuts) return null;
  const clip = p.clips[index];
  if (!canCutClip(p, clip)) return null;
  const E = 1e-6;
  const ranges: [number, number][] = [];
  let at = clip.trimStart;
  for (const [a, b] of cuts) {
    if (!Number.isFinite(a) || !Number.isFinite(b) || !(b > a) || a < at - E || b > clip.trimEnd + E) return null;
    if (a - at > E) ranges.push([at, a]);
    at = Math.min(b, clip.trimEnd);
  }
  if (clip.trimEnd - at > E) ranges.push([at, clip.trimEnd]);
  if (ranges.length === 0 || ranges.some(([a, b]) => spanTooShort(clip, a, b, MIN_CLIP_SECONDS))) return null;
  const last = ranges.length - 1, a = clip.animation;
  return ranges.map(([from, to], i): Clip => {
    const first = i === 0, end = i === last;
    return { ...clip, id: first ? clip.id : newId(), trimStart: from, trimEnd: to,
      transitionOut: end ? clip.transitionOut : NO_TRANSITION,
      animation: { in: first ? copyEdge(a.in) : null, out: end ? copyEdge(a.out) : null, combo: a.combo },
      fadeIn: first ? clip.fadeIn : 0, fadeOut: end ? clip.fadeOut : 0,
      keyframes: copyPins(clip.keyframes), adjust: { ...clip.adjust }, chroma: copyChroma(clip.chroma),
      transform: { ...clip.transform }, crop: { ...clip.crop }, background: { ...clip.background } };
  });
}

/**
 * Cuts in several main clips as ONE change (Remove pauses: one clip; Remove filler words: every clip with a filler). All or nothing:
 * any clip refused (`piecesOf`), a clip named twice, or an empty list → the same project. What is tied to the picture follows
 * (`rippleTimed`: overlays and their words, effects, layers' starts, the cover) through ONE map built from THIS project's clip
 * starts; sounds and beat markers do not move. Refused too when the moved layers would put more video layers on screen at once than
 * `LAYER_LIMITS.maxVideoAtOnce` and than before.
 */
export function removeCuts(p: Project, list: readonly ClipCuts[]): Project {
  if (list.length === 0) return p;
  const made = new Map<string, Clip[]>();
  const removed: Removed[] = [];
  for (const { clipId, cuts } of list) {
    if (made.has(clipId)) return p;
    const pieces = piecesOf(p, clipId, cuts);
    if (!pieces) return p;
    made.set(clipId, pieces);
    removed.push(...removedOf(p, clipId, cuts));
  }
  const clips = normaliseTransitions(p.clips.flatMap((c) => made.get(c.id) ?? [c]));
  const timed = rippleTimed(p, removed, totalDuration({ ...p, clips }));
  if (timed.layers !== p.layers && videoLayerOverlap(timed.layers) > Math.max(LAYER_LIMITS.maxVideoAtOnce, videoLayerOverlap(p.layers))) return p;
  return touch(p, { clips, ...timed });
}

/** Remove pauses: `removeCuts` of one clip — the same refusals, the same pieces and ids, and now what is over the picture follows. */
export function removePauses(p: Project, clipId: string, cuts: readonly PauseCut[]): Project {
  return removeCuts(p, [{ clipId, cuts }]);
}
```

(`extractedTrackOf`, `videoLayerOverlap` are function declarations further down the file — hoisted; `LAYER_LIMITS`, `totalDuration`, `isPhoto`, `hasSpeedCurve`, `spanTooShort`, `NO_TRANSITION` are already imported / defined.)

- [ ] **Step 4: the one test update** — in `ops.removePauses.test.ts`, the test "the transition into the clip stays, re-capped against the first piece — dropped under TRANSITION_LIMITS.min; nothing else moves": the title's `nothing else moves` → `sounds and markers do not move`, and its last line

```ts
  expect(q.overlays).toBe(p.overlays); expect(q.layers).toBe(p.layers); expect(q.audioTracks).toBe(p.audioTracks); expect(q.beatMarkers).toBe(p.beatMarkers);
```

becomes (the cut removes project 4.8 … 13.5: the overlay at 9–11 is inside it, the layer at 10 moves to its start):

```ts
  expect(q.overlays).toEqual([]); expect(q.layers.map((l) => l.start)).toEqual([4.8]); expect(q.effects).toBe(p.effects);
  expect(q.audioTracks).toBe(p.audioTracks); expect(q.beatMarkers).toBe(p.beatMarkers);
```

- [ ] **Step 5: the store test** — `src/editor/__tests__/RemovePausesSheet.ripple.test.tsx` (the harness of `RemovePausesSheet.test.tsx`; that file is not edited):

```tsx
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-17T10:00:00.000Z" }));
jest.mock("@/modules/clipy-video", () => ({ ...jest.requireActual("@/modules/clipy-video"), isPeaksAvailable: jest.fn(() => true) }));
jest.mock("@/src/editor/soundPeaks", () => ({ listenForPauses: jest.fn(), stopPauses: jest.fn(), heardPauses: jest.fn(() => null) }));
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { makeAudioTrack, makeClip, makeOverlay, makeProject, type TextOverlay } from "@/src/editor/model/types";
import { listenForPauses, type PauseListening } from "@/src/editor/soundPeaks";
import { useEditorStore } from "@/src/editor/store";
import { useToast } from "@/src/ui/Toast";
import { RemovePausesSheet } from "../components/RemovePausesSheet";
import { usePauses } from "../pausesState";
import { DEFAULT_PAUSE_CHOICE } from "../model/pauses";

const st = () => useEditorStore.getState();
/** Speech 1 s, silence 1 s, speech 1 s, silence 0.5 s, speech 1 s over the clip's trim 0 … 4.5 (one pause at 0.6 s: 1.1 … 1.9). */
function talk(): Float32Array { const l = new Float32Array(450).fill(0.5); l.fill(0.001, 100, 200); l.fill(0.001, 300, 350); return l; }
let finish: (r: PauseListening) => void = () => {};
const caption = makeOverlay({ id: "c", kind: "caption", start: 0, end: 4, text: "one two three", words: [
  { text: "one", start: 0, end: 0.9 }, { text: "two", start: 2, end: 2.9 }, { text: "three", start: 3.1, end: 3.9 }] });
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(listenForPauses).mockImplementation(() => new Promise((r) => { finish = r; }));
  usePauses.setState({ choice: DEFAULT_PAUSE_CHOICE, shades: null });
  useToast.getState().clear();
  st().reset();
  st().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 4.5 }), makeClip({ id: "b", sourceDuration: 3 })],
    overlays: [caption, makeOverlay({ id: "t", start: 5, end: 6 })], audioTracks: [makeAudioTrack({ id: "m", sourceDuration: 30 })], beatMarkers: [5] }));
});

test("Remove: the caption and the text over the later clip move with the picture; music and markers stay; ONE undo brings all back", async () => {
  const before = st().project!;
  await render(<RemovePausesSheet clipId="a" visible onClose={() => {}} />);
  await act(async () => { finish({ status: "ready", outline: { from: 0, to: 4.5, levels: talk() } }); });
  await fireEvent.press(screen.getByRole("button", { name: "Remove 1 Pause" }));
  const p = st().project!;
  const cap = p.overlays.find((o) => o.id === "c") as TextOverlay;
  expect([cap.start, cap.end, cap.text]).toEqual([0, 3.2, "one two three"]);
  expect(cap.words).toEqual([{ text: "one", start: 0, end: 0.9 }, { text: "two", start: 1.2, end: 2.1 }, { text: "three", start: 2.3, end: 3.1 }]);
  expect(p.overlays.find((o) => o.id === "t")).toMatchObject({ start: 4.2, end: 5.2 });
  expect(p.audioTracks).toBe(before.audioTracks);
  expect(p.beatMarkers).toBe(before.beatMarkers);
  expect(useToast.getState()).toMatchObject({ message: "1 pause removed", kind: "done", undo: true });
  st().undo();
  expect(st().project).toBe(before);
});
```

- [ ] **Step 6:** both new tests pass, `ops.removePauses.test.ts` and `RemovePausesSheet.test.tsx` pass; `npm.cmd run typecheck`; `npm.cmd test` (app suites +2).
- [ ] **Step 7: commit** — `git add src/editor/model/ops.ts src/editor/model/__tests__/ops.removePauses.test.ts src/editor/model/__tests__/ops.removeCuts.test.ts src/editor/__tests__/RemovePausesSheet.ripple.test.tsx`; message `feat(editor): removeCuts — cuts in several clips as one change; Remove pauses keeps captions and text in step`.

---

## Task 3 — Fillers finder

**Files:**
- Modify: `src/editor/model/pauses.ts` (extract `fitCuts`; `findPauses` answers exactly as before)
- Create: `src/editor/model/fillers.ts`
- Create: `src/editor/captionLanguage.ts`
- Create: `src/editor/model/__tests__/fillers.test.ts`
- Create: `src/editor/__tests__/captionLanguage.test.ts`

**Interfaces (exact):**

```ts
// pauses.ts
export function fitCuts<C extends readonly [number, number]>(found: readonly C[], from: number, to: number, minPiece: number): C[];
// fillers.ts
export const FILLER: { pad: 0.04 };
export function isFiller(word: string, before: string | null): boolean;
export type FillerPlan = { found: number; removable: number; cannot: number; cuts: ClipCuts[] };
export const NO_FILLERS: FillerPlan;
export function fillerPlan(p: Project): FillerPlan;
// captionLanguage.ts
export function phoneLanguage(): string | null;
export function fillersSpoken(): boolean;
```

- [ ] **Step 1: `fitCuts`** — in `pauses.ts`, replace the tail of `findPauses` (from the comment `// No piece of sound under \`minPiece\`` to the end of the function) with `return { cuts: fitCuts(found, o.from, o.to, opt.minPiece), silent: false };` and add, after `findPauses`:

```ts
/**
 * The piece rules, shared by Remove pauses and Remove filler words: no piece of sound under `minPiece` (source seconds) — the cut
 * after a short piece is dropped (it joins the next), then the last cut while the tail is short — and at most `PAUSES.maxCuts` (the
 * longest kept, in order). Answers the SAME cut objects, in order, between `from` and `to`.
 */
export function fitCuts<C extends readonly [number, number]>(found: readonly C[], from: number, to: number, minPiece: number): C[] {
  const kept: C[] = [];
  let start = from;
  for (const c of found) {
    const piece = c[0] - start;
    if (piece <= EPS || piece >= minPiece - EPS) { kept.push(c); start = c[1]; }
  }
  while (kept.length > 0) {
    const tail = to - kept[kept.length - 1][1];
    if (tail <= EPS || tail >= minPiece - EPS) break;
    kept.pop();
  }
  if (kept.length <= PAUSES.maxCuts) return kept;
  return kept.map((c, i) => ({ c, i }))
    .sort((x, y) => (y.c[1] - y.c[0]) - (x.c[1] - x.c[0]) || x.i - y.i)
    .slice(0, PAUSES.maxCuts)
    .sort((x, y) => x.i - y.i)
    .map((x) => x.c);
}
```

Run `npx.cmd jest src/editor/model/__tests__/pauses.test.ts` → unchanged and green (it is never edited).

- [ ] **Step 2: the failing tests** — `src/editor/model/__tests__/fillers.test.ts`:

```ts
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-17T10:00:00.000Z" }));
import { extractClipAudio, removeCuts } from "../ops";
import { FILLER, fillerPlan, isFiller } from "../fillers";
import { makeClip, makeOverlay, makePhotoClip, makeProject, type CaptionWord, type Clip, type Project, type TextOverlay } from "../types";

const cap = (id: string, start: number, end: number, words: CaptionWord[]): TextOverlay =>
  makeOverlay({ id, kind: "caption", start, end, text: words.map((w) => w.text).join(" "), words });
const W = (text: string, start: number, end: number): CaptionWord => ({ text, start, end });
const sentence = () => cap("c", 1, 4, [W("so", 0, 0.3), W("um", 0.5, 0.8), W("we", 1, 1.3), W("uh", 1.4, 1.6), W("go", 2, 2.4)]);
const one = (overlays: TextOverlay[], clips: Clip[] = [makeClip({ id: "a", sourceDuration: 10 })]): Project => makeProject({ clips, overlays });

test("the table: um, uh, uhm, erm, hm, mm and their long forms, any case, punctuation stripped; never er, ah, or a word that contains one", () => {
  for (const w of ["um", "Um,", "UMM", "uh", "uhh.", "uhm", "erm…", "hm", "hmm?", "“mm”", "mmm", "(uh)", "um-"]) expect(isFiller(w, null)).toBe(true);
  for (const w of ["er", "ah", "oh", "umbrella", "hum", "uhuh", "ümm", "m", "like", "so", ""]) expect(isFiller(w, null)).toBe(false);
  expect(isFiller("mm", "5")).toBe(false);    // "5 mm"
  expect(isFiller("mm", "10,")).toBe(false);
  expect(isFiller("mm", "okay")).toBe(true);
  expect(FILLER.pad).toBe(0.04);
});

test("the vector: padded cuts that never reach a neighbour word, in source seconds", () => {
  const plan = fillerPlan(one([sentence()]));
  expect(plan).toEqual({ found: 2, removable: 2, cannot: 0, cuts: [{ clipId: "a", cuts: [[1.46, 1.84], [2.36, 2.64]] }] });
});

test("removed: the fillers are gone from the caption, every other word stays, timed with the picture", () => {
  const p = one([sentence()]);
  const q = removeCuts(p, fillerPlan(p).cuts);
  const c = q.overlays[0] as TextOverlay;
  expect([c.start, c.end, c.text]).toEqual([1, 3.34, "so we go"]);
  expect(c.words).toEqual([W("so", 0, 0.3), W("we", 0.62, 0.92), W("go", 1.34, 1.74)]);
  expect(q.clips.map((k) => [k.trimStart, k.trimEnd])).toEqual([[0, 1.46], [1.84, 2.36], [2.64, 10]]);
});

test("neighbouring fillers merge into one cut; a gap longer than two pads is not cut", () => {
  const close = fillerPlan(one([cap("c", 0, 3, [W("so", 0, 0.5), W("um", 1, 1.2), W("uh", 1.25, 1.45), W("go", 2, 2.5)])]));
  expect(close).toMatchObject({ found: 2, removable: 2, cuts: [{ clipId: "a", cuts: [[0.96, 1.49]] }] });
  const apart = fillerPlan(one([cap("c", 0, 3, [W("so", 0, 0.5), W("um", 1, 1.2), W("uh", 1.8, 2), W("go", 2.5, 3)])]));
  expect(apart.cuts[0].cuts).toEqual([[0.96, 1.24], [1.76, 2.04]]);
});

test("the pad never crosses a neighbour word, nor the clip's edges", () => {
  const tight = fillerPlan(one([cap("c", 0, 3, [W("so", 0, 0.98), W("um", 1, 1.2), W("go", 1.21, 2)])]));
  expect(tight.cuts[0].cuts).toEqual([[0.98, 1.21]]);
});

test("can't be cut: over a photo, a reversed clip, a clip whose sound is on its own bar, or across two clips; counted, never cut", () => {
  const clips = [makeClip({ id: "a", sourceDuration: 3 }), makePhotoClip({ id: "ph", seconds: 3 }), makeClip({ id: "r", sourceDuration: 3, reversed: true }), makeClip({ id: "x", sourceDuration: 3 })];
  const p = extractClipAudio(one([
    cap("c1", 0.5, 2.5, [W("so", 0, 0.4), W("um", 1, 1.3), W("go", 1.6, 2)]),        // over a: cuttable
    cap("c2", 2.6, 3.6, [W("uh", 0.2, 0.6)]),                                          // 2.8 … 3.2: across a | ph
    cap("c3", 4, 5, [W("um", 0.2, 0.5)]),                                              // over the photo
    cap("c4", 7, 8, [W("um", 0.2, 0.5)]),                                              // over the reversed clip
    cap("c5", 10, 11, [W("hmm", 0.2, 0.5)]),                                           // over x, whose sound is extracted
  ], clips), "x", "bar");
  const plan = fillerPlan(p);
  expect([plan.found, plan.removable, plan.cannot]).toEqual([5, 1, 4]);
  expect(plan.cuts.map((c) => c.clipId)).toEqual(["a"]);
});

test("the piece rules of pauses: no piece under 0.3 s heard — a filler right after the clip's start or before its end that would leave one is not cut", () => {
  const p = one([cap("c", 0, 3, [W("um", 0.2, 0.4), W("go", 1, 2.9)])], [makeClip({ id: "a", sourceDuration: 3 })]);
  expect(fillerPlan(p)).toMatchObject({ found: 1, removable: 0, cannot: 1, cuts: [] });
  const edge = one([cap("c", 0, 3, [W("um", 0, 0.2), W("go", 1, 2.9)])], [makeClip({ id: "a", sourceDuration: 3 })]);
  expect(fillerPlan(edge).cuts).toEqual([{ clipId: "a", cuts: [[0, 0.24]] }]);   // a cut at the very start leaves no short piece
});

test("a caption that was only a filler goes; a duplicated caption counts each moment once", () => {
  const p = one([sentence(), cap("solo", 6, 7, [W("Um.", 0.2, 0.5)]), { ...sentence(), id: "copy" }]);
  const plan = fillerPlan(p);
  expect([plan.found, plan.removable]).toEqual([3, 3]);
  const q = removeCuts(p, plan.cuts);
  expect(q.overlays.map((o) => o.id)).toEqual(["c", "copy"]);
  expect(q.overlays.map((o) => (o as TextOverlay).text)).toEqual(["so we go", "so we go"]);
});

test("nothing to find: no captions, captions without words, texts, or no filler", () => {
  for (const p of [one([]), one([makeOverlay({ id: "t", text: "um" })]), one([makeOverlay({ id: "c", kind: "caption", text: "um", words: [] })]),
    one([cap("c", 0, 2, [W("hello", 0, 0.5), W("there", 0.6, 1)])])]) expect(fillerPlan(p)).toEqual({ found: 0, removable: 0, cannot: 0, cuts: [] });
});

test("several clips: one ClipCuts per clip, in clip order, and removeCuts applies them as one step", () => {
  const p = one([cap("c1", 0.5, 2.5, [W("so", 0, 0.4), W("um", 1, 1.3), W("go", 1.6, 2)]), cap("c2", 4.5, 6.5, [W("so", 0, 0.4), W("uh", 1, 1.3), W("go", 1.6, 2)])],
    [makeClip({ id: "a", sourceDuration: 3 }), makeClip({ id: "b", sourceDuration: 4 })]);
  const plan = fillerPlan(p);
  expect(plan.cuts.map((c) => c.clipId)).toEqual(["a", "b"]);
  const q = removeCuts(p, plan.cuts);
  expect(q.overlays.map((o) => (o as TextOverlay).text)).toEqual(["so go", "so go"]);
  expect(q.overlays[1].start).toBeCloseTo(4.5 - 0.38, 9);   // b's caption moved left by a's cut (1.46 … 1.84)
});
```

Derivations (check before running): `close` — um 1–1.2: lo max(0.96, 0.5)=0.96, hi min(1.24, 1.25)=1.24; uh 1.25–1.45: lo max(1.21, 1.2)=1.21, hi min(1.49, 2)=1.49 → overlap → [0.96, 1.49]. `apart` — um hi min(1.24, 1.8)=1.24; uh lo max(1.76, 1.2)=1.76, hi min(2.04, 2.5)=2.04 → two cuts, the piece between them 0.52 s (≥ 0.3, so `fitCuts` keeps both). `tight` — lo min(1, max(0.96, 0.98))=0.98, hi max(1.2, min(1.24, 1.21))=1.21. Piece rule — [0.16, 0.44]: the first piece 0 … 0.16 is under 0.3 → dropped; `edge` — [0, 0.24] (lo clamped to the clip's start), then 0.24 … 3 is long → kept. Several clips — a's cut [1.46, 1.84] (0.38 s), b's word "uh" at 5.5–5.8 → b's cut; c2 4.5 → 4.12.

`src/editor/__tests__/captionLanguage.test.ts`:

```ts
import { fillersSpoken, phoneLanguage } from "../captionLanguage";

const spy = (locale: unknown) => jest.spyOn(Intl, "DateTimeFormat").mockImplementation((() => ({ resolvedOptions: () => ({ locale }) })) as never);
afterEach(() => jest.restoreAllMocks());

test("the phone's language from Intl: the first part, lower case", () => {
  spy("en-GB"); expect(phoneLanguage()).toBe("en"); expect(fillersSpoken()).toBe(true);
  spy("de_DE"); expect(phoneLanguage()).toBe("de"); expect(fillersSpoken()).toBe(false);
  spy("ZH-Hans"); expect(phoneLanguage()).toBe("zh");
});

test("a language that cannot be read counts as English (Hermes always answers)", () => {
  spy(undefined); expect(phoneLanguage()).toBeNull(); expect(fillersSpoken()).toBe(true);
  jest.spyOn(Intl, "DateTimeFormat").mockImplementation(() => { throw new Error("no Intl"); });
  expect(phoneLanguage()).toBeNull(); expect(fillersSpoken()).toBe(true);
});
```

- [ ] **Step 3:** run both → FAIL (modules missing).

- [ ] **Step 4: `src/editor/captionLanguage.ts`**:

```ts
/**
 * The phone's language, for Remove filler words — the only file that asks. Captions store no language: they were recognised in the
 * phone's (`SFSpeechRecognizer(locale: Locale.current)`), and the filler table is English ("um" is a common German word). Hermes reads
 * the same setting through Intl. A language that cannot be read counts as English.
 */
export function phoneLanguage(): string | null {
  try {
    const locale: unknown = Intl.DateTimeFormat().resolvedOptions().locale;
    if (typeof locale !== "string") return null;
    const first = locale.split(/[-_]/)[0]?.toLowerCase() ?? "";
    return /^[a-z]{2,3}$/.test(first) ? first : null;
  } catch {
    return null;
  }
}

/** True when filler words are looked for: the phone speaks English (or does not say). */
export const fillersSpoken = (): boolean => { const l = phoneLanguage(); return l === null || l === "en"; };
```

- [ ] **Step 5: `src/editor/model/fillers.ts`**:

```ts
import { canCutClip, removeCuts, type ClipCuts } from "./ops";
import { fitCuts, PAUSES } from "./pauses";
import { clipDuration, clipStartTimes, outputToSource, sourceAfter } from "./timeline";
import type { Project } from "./types";

/**
 * Remove filler words (spec §2.4): which caption words are hesitations, and the cuts that take their moments out of the video
 * clips under them. Pure TypeScript — no listening, no phone: only the caption words already in the project. The words themselves
 * leave their captions through the cut (`rippleTimed` drops a word whose middle is cut), never by id.
 */
export const FILLER = {
  /** OUTPUT seconds of room each side of a filler's recorded edges — never into a neighbour word. */
  pad: 0.04,
} as const;

/** English hesitations: um, uh, uhm, erm, hm, mm and their long forms. Never "er" (German "he"), "ah" / "oh" (they carry meaning). */
const FORMS = /^(?:u+m+|u+h+|u+h+m+|e+r+m+|h+m+|m{2,})$/;
const MARKS = "\\s.,!?;:…\"'“”‘’()\\[\\]\\-–—";
const EDGES = new RegExp(`^[${MARKS}]+|[${MARKS}]+$`, "g");
const bare = (w: string): string => w.toLowerCase().replace(EDGES, "");

/** A filler word (case and leading / trailing punctuation ignored); "mm" right after a number is the unit, not a filler. */
export function isFiller(word: string, before: string | null): boolean {
  const w = bare(word);
  if (!FORMS.test(w)) return false;
  return !(/^m+$/.test(w) && before !== null && /\d$/.test(bare(before)));
}

/** `found` filler moments; `removable` of them cut by `cuts` (one entry per clip, in clip order); `cannot` = the rest. */
export type FillerPlan = { found: number; removable: number; cannot: number; cuts: ClipCuts[] };
export const NO_FILLERS: FillerPlan = { found: 0, removable: 0, cannot: 0, cuts: [] };

const EPS = 1e-6;
const ms = (v: number): number => Math.round(v * 1000) / 1000;
type Moment = { text: string; start: number; end: number };
type Planned = { cut: [number, number]; words: number };

/** Every filler of every caption with words, and the cuts that remove the ones that can be cut. Never throws. */
export function fillerPlan(p: Project): FillerPlan {
  // Every caption word at its project time, once per moment (a duplicated caption's words are the same moments).
  const seen = new Set<string>();
  const words: Moment[] = [];
  for (const o of p.overlays) {
    if (o.kind !== "caption") continue;
    for (const w of o.words) {
      const m = { text: w.text, start: ms(o.start + w.start), end: ms(o.start + w.end) };
      const key = `${m.start}|${m.end}|${bare(m.text)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      words.push(m);
    }
  }
  words.sort((a, b) => a.start - b.start || a.end - b.end);
  const starts = clipStartTimes(p);
  const perClip = new Map<number, Planned[]>();
  let found = 0;
  words.forEach((w, i) => {
    if (!isFiller(w.text, i > 0 ? words[i - 1].text : null)) return;
    found++;
    const j = p.clips.findIndex((c, k) => starts[k] - EPS <= w.start && w.end <= starts[k] + clipDuration(c) + EPS);
    if (j < 0 || !canCutClip(p, p.clips[j])) return;
    const clip = p.clips[j], s = starts[j], d = clipDuration(clip);
    const prev = i > 0 ? words[i - 1].end : -Infinity, next = i < words.length - 1 ? words[i + 1].start : Infinity;
    const lo = Math.max(s, Math.min(w.start, Math.max(w.start - FILLER.pad, prev)));
    const hi = Math.min(s + d, Math.max(w.end, Math.min(w.end + FILLER.pad, next)));
    const a = Math.max(clip.trimStart, ms(outputToSource(clip, lo - s))), b = Math.min(clip.trimEnd, ms(outputToSource(clip, hi - s)));
    const list = perClip.get(j) ?? [];
    list.push({ cut: [a, b], words: 1 });
    perClip.set(j, list);
  });
  const cuts: ClipCuts[] = [];
  let removable = 0;
  for (const [j, list] of [...perClip.entries()].sort((x, y) => x[0] - y[0])) {
    const clip = p.clips[j];
    list.sort((x, y) => x.cut[0] - y.cut[0]);
    const merged: Planned[] = [];
    for (const e of list) {
      const last = merged[merged.length - 1];
      if (last && e.cut[0] <= last.cut[1] + EPS) { last.cut[1] = Math.max(last.cut[1], e.cut[1]); last.words += e.words; }
      else merged.push({ cut: [e.cut[0], e.cut[1]], words: e.words });
    }
    const long = merged.filter((e) => e.cut[1] - e.cut[0] >= PAUSES.minCut - EPS);
    const minPiece = sourceAfter(clip, clip.trimStart, PAUSES.minPiece) - clip.trimStart;
    const kept = fitCuts(long.map((e) => e.cut), clip.trimStart, clip.trimEnd, minPiece);
    // The op is the oracle: a clip it would still refuse alone (no piece left, the layers' limit) cuts nothing.
    if (kept.length === 0 || removeCuts(p, [{ clipId: clip.id, cuts: kept }]) === p) continue;
    const keep = new Set(kept);
    removable += long.reduce((n, e) => n + (keep.has(e.cut) ? e.words : 0), 0);
    cuts.push({ clipId: clip.id, cuts: kept });
  }
  return { found, removable, cannot: found - removable, cuts };
}
```

- [ ] **Step 6:** the tests pass; `pauses.test.ts` green unchanged; `npm.cmd run typecheck`; `npm.cmd test` (app suites +2).
- [ ] **Step 7: commit** — `git add src/editor/model/pauses.ts src/editor/model/fillers.ts src/editor/captionLanguage.ts src/editor/model/__tests__/fillers.test.ts src/editor/__tests__/captionLanguage.test.ts`; message `feat(editor): find filler words in captions and plan their cuts with the pause piece rules`.

---

## Task 4 — The Captions panel row + message

**Files:**
- Create: `src/editor/components/FillerWordsRow.tsx`
- Modify: `src/editor/components/CaptionsSheet.tsx`
- Create: `src/editor/__tests__/CaptionsSheet.fillers.test.tsx`

**Interfaces (exact):**

```ts
export const FILLER_WORDS: { title: "Filler words"; none: "None found"; note: "um, uh, erm, hmm — cut from the video and the captions"; englishOnly: "Filler words are found in English captions only."; notRemoved: "Nothing was removed." };
export const FILLER_CHANGED: "The captions have changed. Nothing was removed.";
export const fillersFound: (n: number) => string;     // "None found" | "N found"
export const fillersCannot: (n: number) => string;    // "1 is over a part that can't be cut." | "N are over parts that can't be cut."
export const fillerButton: (n: number) => string;     // "Remove 1 Filler Word" | "Remove N Filler Words"
export const fillersRemoved: (n: number) => string;   // "1 filler word removed" | "N filler words removed"
export function FillerWordsRow(props: { plan: FillerPlan; english: boolean; onRemove: () => void }): JSX.Element;
```

- [ ] **Step 1: the failing test** — `src/editor/__tests__/CaptionsSheet.fillers.test.tsx`:

```tsx
import { act, fireEvent, render, screen } from "@testing-library/react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-17T10:00:00.000Z" }));
let mockEnglish = true;
jest.mock("@/src/editor/captionLanguage", () => ({ fillersSpoken: () => mockEnglish }));
jest.mock("@/modules/clipy-video", () => ({ isNativeAvailable: () => true, transcribe: jest.fn(), cancelTranscribe: jest.fn() }));
import { makeClip, makeOverlay, makePhotoClip, makeProject, type CaptionWord, type Clip, type TextOverlay } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { theme } from "@/src/theme/theme";
import { useToast } from "@/src/ui/Toast";
import { CaptionsSheet } from "../components/CaptionsSheet";
import { FILLER_CHANGED, FILLER_WORDS } from "../components/FillerWordsRow";

const st = () => useEditorStore.getState();
const W = (text: string, start: number, end: number): CaptionWord => ({ text, start, end });
const cap = (words: CaptionWord[], id = "c", start = 1, end = 4): TextOverlay => makeOverlay({ id, kind: "caption", start, end, text: words.map((w) => w.text).join(" "), words });
const SENTENCE = [W("so", 0, 0.3), W("um", 0.5, 0.8), W("we", 1, 1.3), W("uh", 1.4, 1.6), W("go", 2, 2.4)];
const load = (overlays: TextOverlay[], clips: Clip[] = [makeClip({ id: "a", sourceDuration: 10 })]) => {
  st().reset(); st().setProject(makeProject({ clips, overlays }));
};
const onClose = jest.fn();
const open = async () => { await render(<CaptionsSheet visible onClose={onClose} />); };
beforeEach(() => { jest.clearAllMocks(); mockEnglish = true; useToast.getState().clear(); });

test("the drawing: first in the body, the count, the note, the white button — and Replace turns grey so one white button is in view", async () => {
  load([cap(SENTENCE)]); await open();
  expect(screen.getByTestId("filler-words")).toBeTruthy();
  for (const t of [FILLER_WORDS.title, "2 found", FILLER_WORDS.note]) expect(screen.getByText(t)).toBeTruthy();
  expect(screen.getAllByTestId("main-button")).toHaveLength(1);
  expect(screen.getByTestId("main-button")).toHaveAccessibleName("Remove 2 Filler Words");
  expect(screen.getByRole("button", { name: "Replace" })).not.toHaveStyle({ backgroundColor: theme.plain.fill });
});

test("Remove: one step for the clip and the caption, the panel closes, then the message with Undo; Undo brings both back", async () => {
  load([cap(SENTENCE)]); await open();
  const before = st().project!;
  await fireEvent.press(screen.getByRole("button", { name: "Remove 2 Filler Words" }));
  const p = st().project!;
  expect(p.clips).toHaveLength(3);
  expect((p.overlays[0] as TextOverlay).text).toBe("so we go");
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(useToast.getState()).toMatchObject({ message: "2 filler words removed", kind: "done", undo: true });
  st().undo();
  expect(st().project).toBe(before);
});

test("one filler: singular words", async () => {
  load([cap([W("um", 0.5, 0.8), W("okay", 1, 1.5)])]); await open();
  expect(screen.getByText("1 found")).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: "Remove 1 Filler Word" }));
  expect(useToast.getState().message).toBe("1 filler word removed");
});

test("none found: the row stays, no button, Replace is the white one as before", async () => {
  load([cap([W("so", 0, 0.3), W("we", 1, 1.3)])]); await open();
  expect(screen.getByText(FILLER_WORDS.none)).toBeTruthy();
  expect(screen.getByTestId("main-button")).toHaveAccessibleName("Replace");
});

test("can't be cut: counted and said, no button", async () => {
  load([cap([W("so", 0, 0.3), W("um", 0.5, 0.8), W("go", 1, 1.5)], "c", 3.5, 5.5)], [makeClip({ id: "a", sourceDuration: 3 }), makePhotoClip({ id: "ph", seconds: 3 })]);
  await open();
  expect(screen.getByText("1 found")).toBeTruthy();
  expect(screen.getByText("1 is over a part that can't be cut.")).toBeTruthy();
  expect(screen.queryByRole("button", { name: /Filler Word/ })).toBeNull();
});

test("not English: the one sentence, no count, no button", async () => {
  mockEnglish = false;
  load([cap(SENTENCE)]); await open();
  expect(screen.getByText(FILLER_WORDS.englishOnly)).toBeTruthy();
  expect(screen.queryByText("2 found")).toBeNull();
  expect(screen.queryByRole("button", { name: /Filler Word/ })).toBeNull();
});

test("no row when the captions have no word timings (the existing panel, unchanged)", async () => {
  load([makeOverlay({ id: "c", kind: "caption", start: 0, end: 1, text: "um", words: [] })]); await open();
  expect(screen.queryByTestId("filler-words")).toBeNull();
});

test("a stale tap: the panel closes, says the captions changed, and nothing changes", async () => {
  load([cap(SENTENCE)]); await open();
  const press = screen.getByRole("button", { name: "Remove 2 Filler Words" }).props.onPress as () => void;
  const changed = makeProject({ clips: [makeClip({ id: "a", sourceDuration: 10 })], overlays: [cap([W("so", 0, 0.3), W("um", 0.5, 0.8), W("we", 1, 1.3)])] });
  // The store changes and the captured handler (the old plan) is called before a new render could replace it.
  act(() => { useEditorStore.setState({ project: changed }); });
  act(() => press());
  expect(st().project).toBe(changed);
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(useToast.getState()).toMatchObject({ message: FILLER_CHANGED, kind: "problem" });
  expect(useToast.getState().undo).toBeFalsy();
});
```

- [ ] **Step 2:** run it → FAIL.

- [ ] **Step 3: `src/editor/components/FillerWordsRow.tsx`**:

```tsx
import { View } from "react-native";
import type { FillerPlan } from "@/src/editor/model/fillers";
import { theme } from "@/src/theme/theme";
import { PrimaryButton } from "@/src/ui/PrimaryButton";
import { Body } from "@/src/ui/Text";

/** Every sentence of the row (spec §2.5–2.6). */
export const FILLER_WORDS = {
  title: "Filler words",
  none: "None found",
  note: "um, uh, erm, hmm — cut from the video and the captions",
  englishOnly: "Filler words are found in English captions only.",
  /** The same sentence as Remove pauses' `PAUSE_WORDS.notRemoved` (not imported: the strip's module pulls in the native wrappers). */
  notRemoved: "Nothing was removed.",
} as const;
/** Said when Remove is tapped on a plan the project no longer gives. */
export const FILLER_CHANGED = "The captions have changed. Nothing was removed.";
export const fillersFound = (n: number): string => (n === 0 ? FILLER_WORDS.none : `${n} found`);
export const fillersCannot = (n: number): string => (n === 1 ? "1 is over a part that can't be cut." : `${n} are over parts that can't be cut.`);
export const fillerButton = (n: number): string => (n === 1 ? "Remove 1 Filler Word" : `Remove ${n} Filler Words`);
export const fillersRemoved = (n: number): string => (n === 1 ? "1 filler word removed" : `${n} filler words removed`);

/** The Captions panel's first row: what was found, what it does, and — when something can be cut — the white main button. */
export function FillerWordsRow({ plan, english, onRemove }: { plan: FillerPlan; english: boolean; onRemove: () => void }) {
  return (
    <View testID="filler-words" style={{ gap: theme.space.sm }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: theme.space.md }}>
        <Body style={{ flex: 1 }}>{FILLER_WORDS.title}</Body>
        {english ? <Body muted>{fillersFound(plan.found)}</Body> : null}
      </View>
      <Body muted style={{ fontSize: theme.type.small }}>{english ? FILLER_WORDS.note : FILLER_WORDS.englishOnly}</Body>
      {english && plan.cannot > 0 ? <Body muted style={{ fontSize: theme.type.small }}>{fillersCannot(plan.cannot)}</Body> : null}
      {english && plan.removable > 0 ? <PrimaryButton compact tone="plain" title={fillerButton(plan.removable)} onPress={onRemove} /> : null}
    </View>
  );
}
```

(`Body` takes `muted` and a style — as `RemovePausesSheet.tsx` uses it.)

- [ ] **Step 4: `CaptionsSheet.tsx`** — imports: `useMemo` added to the `react` import; and

```tsx
import { fillersSpoken } from "@/src/editor/captionLanguage";
import { fillerPlan, NO_FILLERS } from "@/src/editor/model/fillers";
import { removeCuts } from "@/src/editor/model/ops";
import { haptic } from "@/src/ui/haptics";
import { useToast } from "@/src/ui/Toast";
import { FILLER_CHANGED, FILLER_WORDS, FillerWordsRow, fillersRemoved } from "./FillerWordsRow";
```

after `const [styling, setStyling] = useState(false);`:

```tsx
  // Filler words: only over captions that carry word timings (without them nothing can be found), never while transcribing or after a failure.
  const timed = useEditorStore((s) => s.project?.overlays.some((o) => o.kind === "caption" && o.words.length > 0) ?? false);
  const english = useMemo(() => fillersSpoken(), []);
  const plan = useMemo(() => (project && timed && english ? fillerPlan(project) : NO_FILLERS), [project, timed, english]);
  const showFillers = timed && state.status !== "running" && state.status !== "error";
  const offering = showFillers && english && plan.removable > 0;   // its button is the white one; Replace is then grey
  const removeFillers = () => {
    const { project: now, apply } = useEditorStore.getState();
    if (!now) return;
    const again = fillerPlan(now);   // asked again at the tap: the cuts shown must be the cuts the project gives
    if (again.removable === 0 || JSON.stringify(again.cuts) !== JSON.stringify(plan.cuts)) {
      close();                                                                         // close first …
      useToast.getState().show(FILLER_CHANGED, { kind: "problem" });                   // … say second
      return;
    }
    const next = removeCuts(now, again.cuts);
    if (next === now) { useToast.getState().show(FILLER_WORDS.notRemoved, { kind: "problem" }); return; }
    haptic("medium");
    apply(() => next);
    close();                                                                           // close first …
    useToast.getState().show(fillersRemoved(again.removable), { kind: "done", undo: true });   // … say second
  };
```

(`close` is defined above it in the file today; keep `removeFillers` after `close`.) In the `ToolPanel`, the FIRST child becomes

```tsx
        {showFillers ? <FillerWordsRow plan={plan} english={english} onRemove={removeFillers} /> : null}
```

and in the idle-with-captions branch the `Replace` line becomes

```tsx
            {offering
              ? <SecondaryButton compact title="Replace" onPress={start} />
              : <PrimaryButton tone="plain" compact title="Replace" onPress={start} />}
```

Nothing else in the file changes (`CaptionsSheet.test.tsx`'s captions have no words: it sees no row and is unchanged and green).

- [ ] **Step 5:** the new test and `CaptionsSheet.test.tsx` pass; the guards (`casing.guard`, `noHexLiterals`, `spacingScale`, `textScale.guard`, `systemFont.guard`, `palette.guard`, `outlineIcons`) pass with no table edited; `npm.cmd run typecheck`; `npm.cmd test` (app suites +1).
- [ ] **Step 6: commit** — `git add src/editor/components/FillerWordsRow.tsx src/editor/components/CaptionsSheet.tsx src/editor/__tests__/CaptionsSheet.fillers.test.tsx`; message `feat(editor): Remove filler words in the Captions panel — one step, said with Undo`.

---

## Task 5 — Docs

**Files:** `AGENTS.md`, `docs/next-build-phone-checklist.md`.

- [ ] **AGENTS.md, the Remove pauses line:** replace `pins and a Combo on every piece; text, stickers, sounds, layers and markers do not move.` with (one line in the file):

  ```text
  pins and a Combo on every piece — through `removeCuts` (ops.ts: several clips as ONE change, all or nothing; `canCutClip` is what it accepts), and what is tied to the picture FOLLOWS the cut through ONE time map built from the project before the cut (`src/editor/model/rippleCuts.ts`, pure: `removedOf` turns source cuts into project ranges through timeline.ts, `mapTime` = t − removed time before t, a removed time collapsing to its range's start; `rippleTimed`): texts, captions, stickers (start / end, pins re-based), a caption's words (a word whose middle is cut goes, the text is rebuilt from the words left; a caption with no word left, an overlay or an effect under 0.2 s is removed), effect bars, layers' STARTS (their length is their own), the cover's time; sounds (music, voice, sound effects, speech bars) and beat markers (the music's beats) do NOT move; refused when the moved layers would put more video layers on screen at once than allowed and than before. Cut to beats does not ripple.
  ```

- [ ] **AGENTS.md, the Messages line:** `Paste style, Remove pauses)` → `Paste style, Remove pauses, Remove filler words)`.

- [ ] **AGENTS.md, a new line right after the Remove pauses line:**

  ```text
  - Filler words: the FIRST row of the Captions panel (`FillerWordsRow.tsx`, in `CaptionsSheet`'s scrolling body; only when a caption HAS word timings, never while transcribing or after a failure): "Filler words" · "N found" / "None found", the note "um, uh, erm, hmm — cut from the video and the captions", "N are over parts that can't be cut." when some cannot be, and the white `Remove N Filler Words` ("Remove 1 Filler Word") — while it shows, Replace is the grey button (one white in view). What a filler is and where to cut is `fillerPlan` in `src/editor/model/fillers.ts` (pure, no listening, no native call: only the caption words in the project): ENGLISH only — `u+m+ u+h+ u+h+m+ e+r+m+ h+m+ m{2,}`, case and edge punctuation ignored, "mm" after a number is not one, never "er" / "ah" / "oh" / "like" — and only when the phone speaks English (`fillersSpoken`, `src/editor/captionLanguage.ts`, the only file that asks — Intl; unreadable = English; else the row says "Filler words are found in English captions only."); a duplicated caption's words are one moment; each cut is the word ± `FILLER.pad` 0.04 s heard, never into a neighbour word, only for a word WHOLLY inside one main clip `canCutClip` accepts (else "can't be cut"), touching cuts merged, then the pause rules (`PAUSES.minCut`, `fitCuts` — extracted from `findPauses`, the same answers — with `PAUSES.minPiece` heard through `sourceAfter`) and the op itself as the oracle. The word leaves its caption through the ripple, never by id. At the tap the plan is computed AGAIN on the store's project; other cuts → the panel closes and says `FILLER_CHANGED` ("The captions have changed. Nothing was removed.", a problem, no Undo); else ONE `apply` of `removeCuts` for every clip, the panel closes, "N filler words removed" with Undo. Only a phone can show (`docs/next-build-phone-checklist.md` part N): whether Apple's recogniser writes "um" / "uh" at all, the pad on real speech, clicks at the joins.
  ```

- [ ] **Checklist:** item 54 becomes

```md
### 54. Text follows
With a text over the talking clip (after the first pause), and captions made, Remove pauses.
- **Right looks like:** the text and the captions still appear with the same words as before; a later clip's text stays on its
  picture; the music has NOT moved.
- **Wrong looks like:** captions that run ahead of the words, a caption missing a word that is still heard.
```

  and a new part after part M:

```md
## N. Filler words

Film yourself saying, with a few hesitations: "So, um, today we, uh, make pancakes. Hmm, first the eggs." Make captions.

### 61. Does the phone write them?
Open Captions.
- **Right looks like:** "Filler words · 3 found", the note, and a white "Remove 3 Filler Words"; Replace is now grey.
- **Wrong looks like:** "None found" although you said "um" — Apple's recogniser may leave hesitations out. Write down which of
  um / uh / hmm appear in the captions at all.

### 62. Remove and Undo
Tap Remove 3 Filler Words. Play it.
- **Right looks like:** the panel closes, "3 filler words removed" with Undo; the hesitations are gone from the video AND the
  captions; the words around them are whole; the captions still match the voice. Undo brings everything back in one tap.
- **Wrong looks like:** a clipped neighbour word ("…oday"), a click at a join, a caption still showing "um". Write down which.

### 63. A filler that can't be cut
Reverse one clip (or put a photo between), with a filler over it.
- **Right looks like:** "1 is over a part that can't be cut." and that one is not counted on the button.

### 64. Another language
Set the iPhone to German (Settings → General → Language & Region), open the project.
- **Right looks like:** "Filler words are found in English captions only." and no button. Set it back.

### 65. Large text
Settings → Accessibility → Larger Text at the largest standard size; open Captions on a 375-pt phone (SE / mini).
- **Right looks like:** the row and the button read fully; the panel scrolls to Replace.
```

- [ ] `npm.cmd run typecheck`; `npm.cmd test` (no change in counts).
- [ ] **Commit** — `git add AGENTS.md docs/next-build-phone-checklist.md`; message `docs: captions follow cuts, Remove filler words — AGENTS.md lines, phone checklist part N`.

---

## Self-review (done when writing this plan)

- **Spec coverage:** §2.1 map → Task 1; §2.2 table row by row → Task 1 tests (overlays, pins, words, effects, layers, cover, identity, removal) + Task 2 (sounds and markers `toBe`); §2.3 op, all-or-nothing, layers' limit, `canCutClip` agreement → Task 2; §2.4 table, language, pad, clip rule, merging, piece rules, oracle, duplicates → Task 3; §2.5 row, one white button, stale tap, message → Task 4; §2.8 docs → Task 5; §4 the one test edit → Task 2 Step 4.
- **Composition:** the map is built once from the ORIGINAL project (`removeCuts`), and Task 2 proves it equals cutting clip by clip in both orders.
- **The normaliser:** Task 1 asserts `clampCaptionWords` returns the rebuilt words unchanged; spec §2.2 has the argument.
- **Speed arithmetic** only in timeline.ts: rippleCuts uses `sourceToOutput` / `clipStartTimes`, fillers `outputToSource` / `sourceAfter` / `clipDuration`.
- **Vectors re-derived** by hand for every expected number in Tasks 1–4 (the derivations of Task 3 are written beside its tests; Task 2's are in its comments).
- **Not touched:** Swift, the kit, `RemovePausesSheet.tsx` (its saving and shading read only the clip), `beats.ts` (Cut to beats does not ripple), every PROOF.
- **Types:** `removeCuts(p, list: readonly ClipCuts[])`, `fitCuts<C>` returns the same objects (Task 3 relies on identity through `Set`), `FillerPlan.cuts: ClipCuts[]`.
