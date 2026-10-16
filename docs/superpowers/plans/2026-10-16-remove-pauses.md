# Remove pauses: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A selected video clip's bar gains **Remove pauses**: an inline strip listens to the clip's own sound (the existing native `soundPeaks`), shows how many pauses it would cut and shades them on the clip; chips change the minimum pause (0.3 / 0.6 / 1 s) and what counts as quiet (Silent / Quiet / Noisy Room) at once; **Remove N Pauses** splits the clip into the pieces with sound in ONE undo step, said "N pauses removed" with Undo.

**Architecture:** The maths is pure TypeScript (`src/editor/model/pauses.ts`: `pausePlan`, `assemblePauseOutline`, `findPauses`). The listening is added to `src/editor/soundPeaks.ts` (still the only caller of `soundPeaks`), whose native calls now share ONE turn with an urgent lane for pauses; outlines are kept in memory for the session. The cut is `removePauses` in `ops.ts`, built on the split rules. The strip (`RemovePausesSheet.tsx`) reads `usePauseListening` (`src/editor/pauseFind.ts`) and writes the shades to `usePauses` (`src/editor/pausesState.ts`), which `ClipThumbStrip` draws through `pauseShades` (`timelineMarks.ts`).

**Tech Stack:** Expo SDK 57, React Native (Fabric), TypeScript strict, zustand 5, Jest 29.7 (`jest-expo`) + RNTL 14. No native code, no new package, no `app.json` change, no schema bump, no `LEVELS` row.

**Spec:** `docs/superpowers/specs/2026-10-16-remove-pauses-design.md` (binding: §2.2 the turn, §2.3 numbers, §2.4 which clips, §2.5 the maths, §2.6 the op, §2.7 the strip, §2.8 the shading, §4 the tests that may change).

## Global Constraints

- iPhone only. Read `AGENTS.md` first; it binds (Toolbar, Waveforms, Messages, Casing, Icons, Text size, Palette, Spacing, Motion, Snapping, Effects registry — only `timeline.ts` multiplies / divides by `speed`).
- **Never edited to make a change pass:** every PROOF named in AGENTS.md (the PROOF test of `toolGroups.groups.test.ts`, `defaultTree.proof.test.tsx`, `looks.frozen.test.ts`, `timeline.stepped.proof.test.ts`, `overlayFrames.proof.test.tsx`, the PROOF blocks of `migrate.test.ts` / `useExport*.test.ts`), `soundPeaks.test.ts`, `peaks.test.ts`.
- **Not edited:** any Swift file, `modules/clipy-video/index.ts`, `src/editor/model/peaks.ts`, `src/editor/peaksFiles.ts`, `BarWave.tsx`, `timeline.ts`, `timelineScroll.ts`, `timelineLayout.ts`, `src/ui/ToolStrip.tsx` and the rest of the kit, `store.ts`, the export.
- **Tests that may be updated, and only as stated (spec §4):** `toolbarContext.test.ts` (`CLIP` gains `"pauses"` after `"stabilize"`; the photo and reversed lines add `"pauses"` to `without(...)`), `toolGroups.groups.test.ts` and `EditorToolbar.test.tsx` (a video clip's `Edit` list starts with `"Remove pauses"`), `sfSymbols.map.test.ts` (`"pause-circle-outline"` in `USED`, the count in its comment +1).
- RNTL v14: `render` / `renderHook` / `fireEvent` are async — always `await`.
- **Checks for every task:** `npm.cmd run typecheck`, then `npm.cmd test`. Record the baseline (suites / tests / snapshots for app and server) before Task 1; every task ends with no failure and the app suite count grown by exactly its new files.
- Windows: PowerShell, no `&&`, `npx.cmd` / `npm.cmd`. Never `git stash`. `git add` explicit paths only, never `-A`, never push. Commit trailer exactly `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Task order

`1 → 2 → 3 → 4 → 5`

| Task | Title | Files it owns |
|---|---|---|
| 1 | The pure maths + vectors | NEW `src/editor/model/pauses.ts` (+ test) |
| 2 | The op | `src/editor/model/ops.ts` (+ NEW test) |
| 3 | The listening + session memory | `src/editor/soundPeaks.ts`, NEW `src/editor/pausesState.ts`, NEW `src/editor/pauseFind.ts` (+ NEW tests) |
| 4 | Strip, toolbar, shading, message, icon | NEW `RemovePausesSheet.tsx`, `EditorToolbar.tsx`, `toolbarContext.ts`, `toolGroups.ts`, `toolStrip.ts`, `timelineMarks.ts`, `ClipThumbStrip.tsx`, `sfSymbols.ts`, `buildInfo.ts` (+ NEW tests, the four stated test updates) |
| 5 | Docs | `AGENTS.md`, `docs/next-build-phone-checklist.md` |

---

## Task 1 — The pure maths + vectors

**Files:**
- Create: `src/editor/model/pauses.ts`
- Create: `src/editor/model/__tests__/pauses.test.ts`

**Interfaces (exact):**

```ts
export const PAUSES: { perSecond: 100; perCall: 2000; fewest: 16; calls: 30; longest: 600; remember: 8; pad: 0.1; minCut: 0.05; minPiece: 0.3; blip: 0.02; floor: 0.001; maxCuts: 60 };
export type PauseGapId = "short" | "medium" | "long";
export type PauseQuietId = "silent" | "quiet" | "noisy";
export const PAUSE_GAPS: readonly { id: PauseGapId; label: string; spoken: string; seconds: number }[];
export const PAUSE_QUIET: readonly { id: PauseQuietId; label: string; db: number }[];
export type PauseChoice = { gap: PauseGapId; quiet: PauseQuietId };
export const DEFAULT_PAUSE_CHOICE: PauseChoice;   // { gap: "medium", quiet: "quiet" }
export type PauseCut = readonly [number, number];
export type PauseOutline = { from: number; to: number; levels: Float32Array };
export type PauseOptions = { minGap: number; minPiece: number; pad: number; quietDb: number };   // SOURCE seconds; dB
export type PauseFind = { cuts: PauseCut[]; silent: boolean };
export function pausePlan(from: number, to: number): PeaksCall[] | null;
export function assemblePauseOutline(plan: readonly PeaksCall[], answers: readonly PeaksAnswer[]): PauseOutline | null;
export function findPauses(o: PauseOutline, opt: PauseOptions): PauseFind;
```

- [ ] **Step 1: Write the failing test** `src/editor/model/__tests__/pauses.test.ts`

```ts
import { assemblePauseOutline, DEFAULT_PAUSE_CHOICE, findPauses, PAUSE_GAPS, PAUSE_QUIET, PAUSES, pausePlan, type PauseOptions, type PauseOutline } from "../pauses";

/** An outline at 100 slices a second from `[seconds, level]` segments, starting at `from`. */
function outline(from: number, segments: [number, number][]): PauseOutline {
  const n = Math.round(segments.reduce((s, [d]) => s + d, 0) * PAUSES.perSecond);
  const levels = new Float32Array(n);
  let at = 0;
  for (const [d, level] of segments) { const k = Math.round(d * PAUSES.perSecond); levels.fill(level, at, at + k); at += k; }
  return { from, to: from + n / PAUSES.perSecond, levels };
}
const OPT: PauseOptions = { minGap: 0.6, minPiece: 0.3, pad: 0.1, quietDb: -35 };
const cuts = (o: PauseOutline, opt: Partial<PauseOptions> = {}) => findPauses(o, { ...OPT, ...opt }).cuts;

describe("the numbers and the choices", () => {
  test("the constants of the spec", () => {
    expect(PAUSES).toEqual({ perSecond: 100, perCall: 2000, fewest: 16, calls: 30, longest: 600, remember: 8, pad: 0.1, minCut: 0.05, minPiece: 0.3, blip: 0.02, floor: 0.001, maxCuts: 60 });
    expect(PAUSE_GAPS.map((g) => [g.id, g.label, g.seconds])).toEqual([["short", "0.3 s", 0.3], ["medium", "0.6 s", 0.6], ["long", "1 s", 1]]);
    expect(PAUSE_GAPS.map((g) => g.spoken)).toEqual(["Longer than 0.3 seconds", "Longer than 0.6 seconds", "Longer than 1 second"]);
    expect(PAUSE_QUIET.map((q) => [q.id, q.label, q.db])).toEqual([["silent", "Silent", -45], ["quiet", "Quiet", -35], ["noisy", "Noisy Room", -25]]);
    expect(DEFAULT_PAUSE_CHOICE).toEqual({ gap: "medium", quiet: "quiet" });
  });
});

describe("pausePlan", () => {
  test("consecutive calls of at most 2000 slices over the clip's range, the last ending exactly at its end", () => {
    expect(pausePlan(0, 3)).toEqual([{ from: 0, to: 3, count: 300 }]);
    expect(pausePlan(10, 40)).toEqual([{ from: 10, to: 25, count: 1500 }, { from: 25, to: 40, count: 1500 }]);
    expect(pausePlan(0, 0.1)).toEqual([{ from: 0, to: 0.1, count: 16 }]);
    const ten = pausePlan(0, 600)!;
    expect(ten).toHaveLength(30);
    expect(ten.every((c) => c.count === 2000)).toBe(true);
    expect(ten[29].to).toBe(600);
  });
  test("nothing for a range that is too long, empty or not a number", () => {
    for (const [a, b] of [[0, 600.5], [3, 3], [4, 3], [NaN, 1], [0, Infinity]]) expect(pausePlan(a, b)).toBeNull();
  });
});

describe("assemblePauseOutline", () => {
  test("floats, unquantised, each slice at its own time in the stretch the phone read; outside it or not a number = 0", () => {
    const plan = pausePlan(0, 0.2)!;   // one call of 20
    const peaks = Array.from({ length: 20 }, (_, i) => (i === 3 ? 0.0004 : i === 4 ? NaN : 0.5));
    const o = assemblePauseOutline(plan, [{ from: 0, to: 0.2, peaks }])!;
    expect(o.from).toBe(0); expect(o.to).toBe(0.2); expect(o.levels).toHaveLength(20);
    expect(o.levels[3]).toBeCloseTo(0.0004, 7);   // a byte would have made it 0
    expect(o.levels[4]).toBe(0);
    const short = assemblePauseOutline(plan, [{ from: 0, to: 0.1, peaks: Array(10).fill(0.5) }])!;   // the file ends early
    expect(short.levels[15]).toBe(0);
  });
  test("null for answers that are not the plan's", () => {
    const plan = pausePlan(10, 40)!;
    expect(assemblePauseOutline(plan, [{ from: 10, to: 25, peaks: [0.1] }])).toBeNull();
    expect(assemblePauseOutline(plan, [{ from: 10, to: 25, peaks: [] }, { from: 25, to: 40, peaks: [0.1] }])).toBeNull();
    expect(assemblePauseOutline([], [])).toBeNull();
  });
});

describe("findPauses — the vectors", () => {
  test("a pause between two words is cut less 0.1 s of sound each side", () => {
    expect(cuts(outline(0, [[1, 0.5], [1, 0.001], [1, 0.5]]))).toEqual([[1.1, 1.9]]);
  });
  test("leading and trailing quiet is cut to the clip's exact edges", () => {
    expect(cuts(outline(5, [[0.8, 0.0005], [1.4, 0.4], [0.8, 0.0005]]))).toEqual([[5, 5.7], [7.3, 8]]);
  });
  test("the chip: a pause at least as long as it is cut", () => {
    const o = outline(0, [[1, 0.5], [0.5, 0.001], [1, 0.5]]);
    expect(cuts(o)).toEqual([]);
    expect(cuts(o, { minGap: 0.3 })).toEqual([[1.1, 1.4]]);
  });
  test("a click of 0.02 s inside a pause is bridged; 0.03 s is sound", () => {
    expect(cuts(outline(0, [[1, 0.5], [0.4, 0.001], [0.02, 0.5], [0.4, 0.001], [1, 0.5]]))).toEqual([[1.1, 1.72]]);
    expect(cuts(outline(0, [[1, 0.5], [0.4, 0.001], [0.03, 0.5], [0.4, 0.001], [1, 0.5]]))).toEqual([]);
  });
  test("what counts as quiet: room noise 28 dB under the voice is a pause only for Noisy Room", () => {
    const o = outline(0, [[1, 0.5], [1, 0.02], [1, 0.5]]);
    expect(cuts(o, { quietDb: -45 })).toEqual([]);
    expect(cuts(o, { quietDb: -35 })).toEqual([]);
    expect(cuts(o, { quietDb: -25 })).toEqual([[1.1, 1.9]]);
  });
  test("a silent clip is never cut", () => {
    expect(findPauses(outline(0, [[3, 0.0005]]), OPT)).toEqual({ cuts: [], silent: true });
    expect(findPauses(outline(0, [[3, NaN]]), OPT)).toEqual({ cuts: [], silent: true });
    expect(cuts(outline(0, [[1, 0.5], [0.5, 0.001], [0.5, NaN], [1, 0.5]]))).toEqual([[1.1, 1.9]]);
  });
  test("no piece shorter than minPiece: a cut is dropped, never sound", () => {
    expect(cuts(outline(0, [[1, 0.5], [1, 0.001], [0.05, 0.5], [1, 0.001], [1, 0.5]]))).toEqual([[1.1, 1.9]]);
    expect(cuts(outline(0, [[1, 0.5], [1, 0.001], [0.15, 0.5]]))).toEqual([]);
  });
  test("at most 60 cuts: the longest, in time order", () => {
    const segs: [number, number][] = [[0.5, 0.5]];
    for (let i = 0; i < 70; i++) segs.push([i % 7 === 0 ? 0.7 : 1, 0.001], [0.5, 0.5]);
    const got = cuts(outline(0, segs));
    expect(got).toHaveLength(60);
    for (const [a, b] of got) expect(b - a).toBeCloseTo(0.8, 6);
    for (let i = 1; i < got.length; i++) expect(got[i][0]).toBeGreaterThan(got[i - 1][1]);
  });
  test("bad options or an empty outline: nothing", () => {
    expect(findPauses(outline(0, [[1, 0.5], [1, 0.001], [1, 0.5]]), { ...OPT, minGap: NaN })).toEqual({ cuts: [], silent: false });
    expect(findPauses({ from: 0, to: 1, levels: new Float32Array(0) }, OPT)).toEqual({ cuts: [], silent: false });
  });
});
```

(70 gaps with `i % 7 === 0` → exactly 10 of 0.7 s and 60 of 1 s.)

- [ ] **Step 2: Run it — expect FAIL** (`Cannot find module '../pauses'`): `npx.cmd jest src/editor/model/__tests__/pauses.test.ts`

- [ ] **Step 3: Implement** `src/editor/model/pauses.ts`

```ts
import type { PeaksAnswer, PeaksCall } from "./peaks";

/**
 * Remove pauses: where a talking clip is quiet, and what to cut. Pure TypeScript — no React, no store, no phone, nothing mirrored
 * in Swift (the phone only answers `soundPeaks` with numbers). Times are SOURCE seconds of the clip's file; the caller turns the
 * chips' output seconds into source seconds through timeline.ts (`pauseOptions`), never here.
 */
export const PAUSES = {
  /** Slices a second: 10 ms — a pause's edge is placed to a hundredth of a second. */
  perSecond: 100,
  /** The most values one native answer holds (`SoundPeaks.most`), the fewest (`SoundPeaks.fewest`), the most calls (30 × 20 s). */
  perCall: 2000, fewest: 16, calls: 30,
  /** The longest trimmed clip listened to, in source seconds (ten minutes = 60 000 slices). */
  longest: 600,
  /** Outlines kept in memory for the session (the oldest goes first). */
  remember: 8,
  /** Sound kept each side of a cut that touches sound; a cut shorter than `minCut` after it is not made. */
  pad: 0.1, minCut: 0.05,
  /** No piece of sound shorter than this, in OUTPUT seconds (the caller converts it). */
  minPiece: 0.3,
  /** A loud run this short with quiet on both sides is a click, not a word. */
  blip: 0.02,
  /** −60 dB of full scale: the quiet line is never lower, and a clip whose loudest moment is lower is silent. */
  floor: 0.001,
  /** The most cuts one Remove makes (the longest are kept). */
  maxCuts: 60,
} as const;

export type PauseGapId = "short" | "medium" | "long";
export type PauseQuietId = "silent" | "quiet" | "noisy";
/** "Cut pauses longer than": OUTPUT seconds. */
export const PAUSE_GAPS: readonly { id: PauseGapId; label: string; spoken: string; seconds: number }[] = [
  { id: "short", label: "0.3 s", spoken: "Longer than 0.3 seconds", seconds: 0.3 },
  { id: "medium", label: "0.6 s", spoken: "Longer than 0.6 seconds", seconds: 0.6 },
  { id: "long", label: "1 s", spoken: "Longer than 1 second", seconds: 1 },
];
/** "What counts as quiet": dB under the clip's own loudest slice. */
export const PAUSE_QUIET: readonly { id: PauseQuietId; label: string; db: number }[] = [
  { id: "silent", label: "Silent", db: -45 },
  { id: "quiet", label: "Quiet", db: -35 },
  { id: "noisy", label: "Noisy Room", db: -25 },
];
export type PauseChoice = { gap: PauseGapId; quiet: PauseQuietId };
export const DEFAULT_PAUSE_CHOICE: PauseChoice = { gap: "medium", quiet: "quiet" };

export type PauseCut = readonly [number, number];
/** A clip's sound over `from` … `to`: `levels[i]` (0 … 1, a float) is the loudest moment of the i-th of `levels.length` equal slices. */
export type PauseOutline = { from: number; to: number; levels: Float32Array };
export type PauseOptions = { minGap: number; minPiece: number; pad: number; quietDb: number };
export type PauseFind = { cuts: PauseCut[]; silent: boolean };

const known = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const EPS = 1e-6;
const ms = (v: number): number => Math.round(v * 1000) / 1000;

/** The native calls a clip's range costs (as `peaksPlan`, over `from` … `to`), or null: not a positive span, or over `PAUSES.longest`. */
export function pausePlan(from: number, to: number): PeaksCall[] | null {
  if (!known(from) || !known(to) || !(to > from) || to - from > PAUSES.longest + 1e-9) return null;
  const span = to - from;
  const total = Math.max(PAUSES.fewest, Math.round(span * PAUSES.perSecond));
  const calls = Math.ceil(total / PAUSES.perCall);
  const edge = (i: number): number => Math.round((i * total) / calls);
  const out: PeaksCall[] = [];
  for (let i = 0; i < calls; i++) out.push({ from: from + (edge(i) / total) * span, to: i === calls - 1 ? to : from + (edge(i + 1) / total) * span, count: edge(i + 1) - edge(i) });
  return out;
}

/** The answers as one outline of floats (never bytes), or null when they are not the plan's. `assemblePeaks`' lookup rule. */
export function assemblePauseOutline(plan: readonly PeaksCall[], answers: readonly PeaksAnswer[]): PauseOutline | null {
  if (!plan.length || answers.length !== plan.length) return null;
  const levels = new Float32Array(plan.reduce((n, c) => n + c.count, 0));
  let at = 0;
  for (let i = 0; i < plan.length; i++) {
    const call = plan[i], a = answers[i];
    if (!a || !Array.isArray(a.peaks) || a.peaks.length === 0 || !known(a.from) || !known(a.to)) return null;
    const n = a.peaks.length, read = a.to - a.from;
    for (let j = 0; j < call.count; j++, at++) {
      const t = call.from + ((j + 0.5) * (call.to - call.from)) / call.count;
      const k = read > 0 ? Math.floor(((t - a.from) / read) * n) : -1;
      const v = k >= 0 && k < n ? a.peaks[k] : 0;
      levels[at] = known(v) ? Math.min(1, Math.max(0, v)) : 0;
    }
  }
  return { from: plan[0].from, to: plan[plan.length - 1].to, levels };
}

/** The pauses of an outline (spec §2.5): what to cut, in time order, or that the clip is silent. Never throws. */
export function findPauses(o: PauseOutline, opt: PauseOptions): PauseFind {
  const n = o.levels?.length ?? 0, span = o.to - o.from;
  if (n === 0 || !(span > 0) || ![o.from, o.to, opt.minGap, opt.minPiece, opt.pad, opt.quietDb].every(known)) return { cuts: [], silent: false };
  const level = (i: number): number => { const v = o.levels[i]; return known(v) && v > 0 ? v : 0; };
  let top = 0;
  for (let i = 0; i < n; i++) if (level(i) > top) top = level(i);
  if (top < PAUSES.floor) return { cuts: [], silent: true };
  const line = Math.max(PAUSES.floor, top * Math.pow(10, opt.quietDb / 20));
  const quiet = new Uint8Array(n);
  for (let i = 0; i < n; i++) quiet[i] = level(i) < line ? 1 : 0;
  // A click: a loud run of at most `blip` with quiet on both sides.
  const blip = Math.floor(PAUSES.blip / (span / n) + 1e-9);
  for (let i = 0; i < n;) {
    if (quiet[i]) { i++; continue; }
    let j = i;
    while (j < n && !quiet[j]) j++;
    if (i > 0 && j < n && j - i <= blip) quiet.fill(1, i, j);
    i = j;
  }
  // Quiet runs → cuts: less `pad` where they touch sound, to the clip's exact edge where they reach it.
  const at = (k: number): number => o.from + (k / n) * span;
  const found: [number, number][] = [];
  for (let i = 0; i < n;) {
    if (!quiet[i]) { i++; continue; }
    let j = i;
    while (j < n && quiet[j]) j++;
    const a = i === 0 ? o.from : at(i), b = j === n ? o.to : at(j);
    if (b - a >= opt.minGap - EPS) {
      const from = i === 0 ? o.from : ms(a + opt.pad), to = j === n ? o.to : ms(b - opt.pad);
      if (to - from >= PAUSES.minCut - EPS) found.push([from, to]);
    }
    i = j;
  }
  // No piece of sound under `minPiece`: drop the cut after a short piece (it joins the next), then the last cut while the tail is short.
  const kept: [number, number][] = [];
  let start = o.from;
  for (const c of found) {
    const piece = c[0] - start;
    if (piece <= EPS || piece >= opt.minPiece - EPS) { kept.push(c); start = c[1]; }
  }
  while (kept.length > 0) {
    const tail = o.to - kept[kept.length - 1][1];
    if (tail <= EPS || tail >= opt.minPiece - EPS) break;
    kept.pop();
  }
  if (kept.length <= PAUSES.maxCuts) return { cuts: kept, silent: false };
  const longest = kept.map((c, i) => ({ c, i }))
    .sort((x, y) => (y.c[1] - y.c[0]) - (x.c[1] - x.c[0]) || x.i - y.i)
    .slice(0, PAUSES.maxCuts)
    .sort((x, y) => x.i - y.i);
  return { cuts: longest.map((x) => x.c), silent: false };
}
```

Note on the tail loop: `kept.pop()` only after the walk, so the piece before the popped cut joins the tail — never shorter than before.

- [ ] **Step 4: Run it — expect PASS.** If a vector misses by a float hair, fix the CODE (rounding with `ms`), never the vector.
- [ ] **Step 5: Checks** `npm.cmd run typecheck`, `npm.cmd test` (app suites +1).
- [ ] **Step 6: Commit** `git add src/editor/model/pauses.ts src/editor/model/__tests__/pauses.test.ts` → `feat(editor): Remove pauses — the pure maths and its vectors`.

---

## Task 2 — The op `removePauses`

**Files:**
- Modify: `src/editor/model/ops.ts` (imports; one function after `splitClipAt`)
- Create: `src/editor/model/__tests__/ops.removePauses.test.ts`

**Interface:** `export function removePauses(p: Project, clipId: string, cuts: readonly PauseCut[]): Project`

- [ ] **Step 1: Write the failing test**

```ts
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-16T10:00:00.000Z" }));
jest.mock("@/src/lib/id", () => { let n = 0; return { newId: () => `piece-${++n}` }; });
import { removePauses } from "../ops";
import { clipDuration, totalDuration } from "../timeline";
import { makeAudioTrack, makeClip, makeEffect, makeKeyframe, makeLayer, makeOverlay, makePhotoClip, makeProject, type Clip, type Project } from "../types";

const fade = { type: "fade" as const, duration: 0.5 };
const talk = (more: Partial<Clip> = {}): Clip => makeClip({ id: "t", sourceDuration: 20, trimStart: 2, trimEnd: 12, fadeIn: 1, fadeOut: 2,
  animation: { in: { id: "fade", duration: 0.5 }, out: { id: "zoomOut", duration: 0.5 }, combo: null }, transitionOut: fade,
  keyframes: [makeKeyframe({ t: 3 })], ...more });
const project = (c: Clip = talk()): Project => makeProject({
  clips: [makeClip({ id: "a", sourceDuration: 4, transitionOut: fade }), c, makeClip({ id: "z", sourceDuration: 4 })],
  overlays: [makeOverlay({ id: "o", start: 9, end: 11 })], audioTracks: [makeAudioTrack({ id: "m", sourceDuration: 30 })],
  layers: [makeLayer({ id: "L", sourceDuration: 2, start: 10 })], effects: [makeEffect({ id: "e", start: 1, end: 2 })],
});
const ids = (p: Project) => p.clips.map((c) => c.id);

test("the clip becomes its pieces of sound, in place; the first keeps the id", () => {
  const p = project();
  const q = removePauses(p, "t", [[4, 5], [8, 9.5]]);
  expect(ids(q)).toEqual(["a", "t", "piece-1", "piece-2", "z"]);
  expect(q.clips.slice(1, 4).map((c) => [c.trimStart, c.trimEnd])).toEqual([[2, 4], [5, 8], [9.5, 12]]);
  expect(totalDuration(p) - totalDuration(q)).toBeCloseTo(2.5, 9);
});

test("the split rules: In and fade in on the first, Out, fade out and transition on the last, nothing between; pins on every piece", () => {
  const [first, mid, last] = removePauses(project(), "t", [[4, 5], [8, 9.5]]).clips.slice(1, 4);
  expect([first.animation.in?.id, mid.animation.in, last.animation.in]).toEqual(["fade", null, null]);
  expect([first.animation.out, mid.animation.out, last.animation.out?.id]).toEqual([null, null, "zoomOut"]);
  expect([first.fadeIn, mid.fadeIn, last.fadeIn]).toEqual([1, 0, 0]);
  expect([first.fadeOut, mid.fadeOut, last.fadeOut]).toEqual([0, 0, 2]);
  expect([first.transitionOut.type, mid.transitionOut.type, last.transitionOut]).toEqual(["none", "none", fade]);
  for (const c of [first, mid, last]) expect(c.keyframes).toEqual([makeKeyframe({ t: 3 })]);
  expect(mid.adjust).not.toBe(first.adjust);
});

test("the transition into the clip stays, re-capped against the first piece — dropped under TRANSITION_LIMITS.min; nothing else moves", () => {
  const p = project();
  const q = removePauses(p, "t", [[2.8, 11.5]]);
  expect(q.clips[0].transitionOut).toEqual({ type: "fade", duration: 0.4 });    // capped by the 0.8-s first piece
  expect(removePauses(p, "t", [[2.5, 11.5]]).clips[0].transitionOut.type).toBe("none");   // 0.25 s would be under the 0.3-s minimum
  expect(q.overlays).toBe(p.overlays); expect(q.layers).toBe(p.layers); expect(q.audioTracks).toBe(p.audioTracks); expect(q.beatMarkers).toBe(p.beatMarkers);
});

test("leading and trailing cuts: one piece = the clip trimmed, keeping everything", () => {
  const q = removePauses(project(), "t", [[2, 3], [11, 12]]);
  const t = q.clips[1];
  expect(ids(q)).toEqual(["a", "t", "z"]);
  expect([t.trimStart, t.trimEnd, t.fadeIn, t.fadeOut, t.transitionOut, t.animation.in?.id, t.animation.out?.id]).toEqual([3, 11, 1, 2, fade, "fade", "zoomOut"]);
});

test("a constant speed: pieces keep it, and their lengths are timeline.ts's", () => {
  const q = removePauses(project(talk({ speed: 2 })), "t", [[4, 6]]);
  expect(q.clips.slice(1, 3).map(clipDuration)).toEqual([1, 3]);
});

test("refused (the same project): not a main clip, a photo, reversed, ramped, bad cuts, a piece too short, too many", () => {
  const p = project();
  for (const [id, c] of [["L", [[0.5, 1]]], ["nope", [[4, 5]]], ["t", []], ["t", [[5, 4]]], ["t", [[4, 6], [5, 7]]], ["t", [[1, 3]]], ["t", [[11, 13]]], ["t", [[NaN, 5]]],
    ["t", [[2, 12]]], ["t", [[4, 5], [5.05, 6]]]] as const) expect(removePauses(p, id, c as never)).toBe(p);
  const many = Array.from({ length: 61 }, (_, i) => [2.1 + i * 0.15, 2.15 + i * 0.15] as const);
  expect(removePauses(p, "t", many)).toBe(p);
  for (const c of [makePhotoClip({ id: "t" }), talk({ reversed: true }), talk({ speedCurve: { id: "montage", steps: [{ from: 2, to: 12, speed: 1 }] } as never })]) {
    const q = project(c);
    expect(removePauses(q, "t", [[4, 5]])).toBe(q);
  }
});
```

(The speed curve literal is cast because only `hasSpeedCurve` — a non-empty step list — matters here; `"montage"` is one of `SPEED_CURVE_IDS`; the edge ids are `ANIM_IN_IDS`.)

- [ ] **Step 2: Run — expect FAIL** (`removePauses is not a function`).
- [ ] **Step 3: Implement** in `ops.ts` — add `hasSpeedCurve` is already imported; add `import { PAUSES, type PauseCut } from "./pauses";` and after `splitClipAt`:

```ts
/**
 * Remove pauses: the main video clip `clipId` replaced, in place, by the pieces of its trim that lie BETWEEN `cuts` (source seconds,
 * in order, inside the trim — `findPauses`). The split rules (`splitClipAt`): the first piece keeps the id, the In and the fade in; the
 * last gets the Out, the fade out and the clip's transition; no transition between pieces; a Combo and every pin on each piece; own
 * copies of what a piece may change alone. One piece (only the edges cut) is the clip trimmed. Text, stickers, sounds, layers and
 * markers do not move. Same project when refused: not a main clip, a photo, reversed or ramped, no cut or more than `PAUSES.maxCuts`,
 * a cut out of order / empty / outside the trim, no piece left, or a piece under MIN_CLIP_SECONDS.
 */
export function removePauses(p: Project, clipId: string, cuts: readonly PauseCut[]): Project {
  const index = p.clips.findIndex((c) => c.id === clipId);
  if (index < 0 || cuts.length === 0 || cuts.length > PAUSES.maxCuts) return p;
  const clip = p.clips[index];
  if (isPhoto(clip) || clip.reversed || hasSpeedCurve(clip)) return p;
  const E = 1e-6;
  const ranges: [number, number][] = [];
  let at = clip.trimStart;
  for (const [a, b] of cuts) {
    if (!Number.isFinite(a) || !Number.isFinite(b) || !(b > a) || a < at - E || b > clip.trimEnd + E) return p;
    if (a - at > E) ranges.push([at, a]);
    at = Math.min(b, clip.trimEnd);
  }
  if (clip.trimEnd - at > E) ranges.push([at, clip.trimEnd]);
  if (ranges.length === 0 || ranges.some(([a, b]) => spanTooShort(clip, a, b, MIN_CLIP_SECONDS))) return p;
  const last = ranges.length - 1, a = clip.animation;
  const pieces = ranges.map(([from, to], i): Clip => {
    const first = i === 0, end = i === last;
    return { ...clip, id: first ? clip.id : newId(), trimStart: from, trimEnd: to,
      transitionOut: end ? clip.transitionOut : NO_TRANSITION,
      animation: { in: first ? copyEdge(a.in) : null, out: end ? copyEdge(a.out) : null, combo: a.combo },
      fadeIn: first ? clip.fadeIn : 0, fadeOut: end ? clip.fadeOut : 0,
      keyframes: copyPins(clip.keyframes), adjust: { ...clip.adjust }, chroma: copyChroma(clip.chroma),
      transform: { ...clip.transform }, crop: { ...clip.crop }, background: { ...clip.background } };
  });
  return touch(p, { clips: normaliseTransitions([...p.clips.slice(0, index), ...pieces, ...p.clips.slice(index + 1)]) });
}
```

(`spanTooShort` and `hasSpeedCurve` come from the existing `./timeline` import — add `spanTooShort` if missing; it is already there. `NO_TRANSITION`, `copyEdge`, `copyPins`, `copyChroma` are module consts used at call time.)

- [ ] **Step 4: Run — PASS.** `[4, 5], [5.05, 6]` is refused because the 0.05-s piece is under `MIN_CLIP_SECONDS`.
- [ ] **Step 5: Checks**, then **commit** `git add src/editor/model/ops.ts src/editor/model/__tests__/ops.removePauses.test.ts` → `feat(editor): removePauses — the clip split at its pauses in one step`.

---

## Task 3 — The listening in `soundPeaks.ts` + session memory

**Files:**
- Modify: `src/editor/soundPeaks.ts`
- Create: `src/editor/pausesState.ts`, `src/editor/pauseFind.ts`
- Create: `src/editor/__tests__/soundPeaks.pauses.test.ts`, `src/editor/__tests__/pauseFind.test.tsx`

**Interfaces:**

```ts
// soundPeaks.ts (added)
export type PauseSource = { uri: string; from: number; to: number };
export type PauseFailure = "build" | "tooLong" | "noSound" | "failed";
export type PauseListening = { status: "ready"; outline: PauseOutline } | { status: "failed"; reason: PauseFailure } | { status: "stopped" };
export const pauseKey: (s: PauseSource) => string;
export function heardPauses(s: PauseSource): PauseOutline | null;
export function listenForPauses(s: PauseSource): Promise<PauseListening>;
export function stopPauses(): void;
// pausesState.ts
export const usePauses: UseBoundStore<StoreApi<{ choice: PauseChoice; shades: { clipId: string; cuts: PauseCut[] } | null }>>;
// pauseFind.ts
export type PauseState = { status: "listening" } | { status: "ready"; outline: PauseOutline } | { status: "failed"; reason: PauseFailure };
export function pauseOptions(clip: Clip, choice: PauseChoice): PauseOptions;
export function pauseSaving(clip: Clip, cuts: readonly PauseCut[]): number;
export function usePauseListening(source: PauseSource | null): PauseState | null;
```

- [ ] **Step 1: Write the failing tests.**

`src/editor/__tests__/soundPeaks.pauses.test.ts` — the SAME `jest.mock` block as the top of `soundPeaks.test.ts` (clock, id → `job-n`, `@/src/projects`, `@/src/projects/expoFs`, `@/modules/clipy-video` with `isPeaksAvailable` / `soundPeaks` / `cancelSoundPeaks` / `PEAKS_CANCELLED` / `isPeaksCancelled`), the same `calls` / `answer` / `flush` / `settle` helpers and `beforeEach` / `afterEach`, then:

```ts
import { heardPauses, listenForPauses, pauseKey, PEAKS_CANCEL_GRACE_MS, PEAKS_DEADLINE_MS, peaksSources, resetPeaks, stopPauses, syncPeaks } from "../soundPeaks";
/** A file of its own for every test: what was heard is remembered for the session (the module's memory outlives a test). */
let CLIP = "", n = 0;
beforeEach(() => { CLIP = `file:///doc/projects/p1/media/talk-${++n}.mov`; });

test("listens over the clip's trim in calls of 20 s, one at a time, without waiting for the editor to stand still", async () => {
  const done = listenForPauses({ uri: CLIP, from: 2, to: 32 });
  await flush();
  expect(calls.map((c) => [c.req.uri, c.req.from, c.req.to, c.req.count])).toEqual([[CLIP, 2, 17, 1500]]);
  answer(calls[0], 0.5); await flush();
  expect(calls[1].req).toMatchObject({ uri: CLIP, from: 17, to: 32, count: 1500 });
  answer(calls[1], 0.5);
  const r = await done;
  expect(r.status).toBe("ready");
  if (r.status === "ready") { expect(r.outline.levels).toHaveLength(3000); expect([r.outline.from, r.outline.to]).toEqual([2, 32]); }
});

test("remembered for the session by uri, range and density: asked again, nothing is asked of the phone", async () => {
  const first = listenForPauses({ uri: CLIP, from: 0, to: 3 }); await flush(); answer(calls[0]); await first;
  expect(heardPauses({ uri: CLIP, from: 0, to: 3 })).not.toBeNull();
  expect(pauseKey({ uri: CLIP, from: 0, to: 3 })).toBe(`${CLIP}|0|3|100`);
  expect((await listenForPauses({ uri: CLIP, from: 0, to: 3 })).status).toBe("ready");
  expect(calls).toHaveLength(1);
  void listenForPauses({ uri: CLIP, from: 0, to: 4 }); await flush();
  expect(calls).toHaveLength(2);   // another trim is another outline
});

test("never two native calls: a pauses call waits for the waveform call that runs, then goes before the waveform calls that wait", async () => {
  syncPeaks("p1", peaksSources(useEditorStore.getState().project!, []));
  await settle();
  expect(calls).toHaveLength(1);                                  // the song's first call runs
  const done = listenForPauses({ uri: CLIP, from: 0, to: 3 }); await flush();
  expect(calls).toHaveLength(1);
  answer(calls[0]); await flush();
  expect(calls[1].req.uri).toBe(CLIP);
  answer(calls[1]); await done; await settle();
  expect(calls[2].req.uri).not.toBe(CLIP);                         // the waveforms go on
});

test("syncPeaks never cancels a pauses call; stopPauses does, and its answer is dropped", async () => {
  const done = listenForPauses({ uri: CLIP, from: 0, to: 3 }); await flush();
  syncPeaks("p1", []);
  expect(cancelSoundPeaks).not.toHaveBeenCalled();
  stopPauses();
  expect(cancelSoundPeaks).toHaveBeenCalledWith(calls[0].req.jobId);
  answer(calls[0]);
  expect(await done).toEqual({ status: "stopped" });
  expect(heardPauses({ uri: CLIP, from: 0, to: 3 })).toBeNull();
});

test("one listening at a time: the same source joins, another stops the first", async () => {
  const a = listenForPauses({ uri: CLIP, from: 0, to: 3 }), b = listenForPauses({ uri: CLIP, from: 0, to: 3 });
  await flush();
  expect(calls).toHaveLength(1);
  const c = listenForPauses({ uri: CLIP, from: 1, to: 3 });
  calls[0].reject(Object.assign(new Error("Peaks cancelled"), { code: "E_PEAKS_CANCELLED" }));
  expect(await a).toEqual({ status: "stopped" }); expect(await b).toEqual({ status: "stopped" });
  await flush();
  expect(calls[1].req).toMatchObject({ from: 1, to: 3 });
  answer(calls[1]); expect((await c).status).toBe("ready");
});

test("leaving the editor (resetPeaks) stops a listening", async () => {
  const done = listenForPauses({ uri: CLIP, from: 0, to: 3 }); await flush();
  resetPeaks();
  expect(cancelSoundPeaks).toHaveBeenCalled();
  await jest.advanceTimersByTimeAsync(PEAKS_CANCEL_GRACE_MS);
  expect(await done).toEqual({ status: "stopped" });
});

test("failures: no sound, anything else, a deadline — none remembered; no function and too long ask nothing", async () => {
  let done = listenForPauses({ uri: CLIP, from: 0, to: 3 }); await flush();
  calls[0].reject(new Error("peaks source: this file has no sound"));
  expect(await done).toEqual({ status: "failed", reason: "noSound" });
  done = listenForPauses({ uri: CLIP, from: 0, to: 3 }); await flush();
  calls[1].reject(new Error("peaks reader: boom"));
  expect(await done).toEqual({ status: "failed", reason: "failed" });
  done = listenForPauses({ uri: CLIP, from: 0, to: 3 }); await flush();
  await jest.advanceTimersByTimeAsync(PEAKS_DEADLINE_MS);
  expect(await done).toEqual({ status: "failed", reason: "failed" });
  expect(await listenForPauses({ uri: CLIP, from: 0, to: 601 })).toEqual({ status: "failed", reason: "tooLong" });
  jest.mocked(isPeaksAvailable).mockReturnValue(false);
  expect(await listenForPauses({ uri: CLIP, from: 0, to: 3 })).toEqual({ status: "failed", reason: "build" });
  expect(calls).toHaveLength(3);
});
```

Remembered outlines outlive a test (module memory): hence a fresh `CLIP` per test. The `calls` / mocks / `beforeEach` / `afterEach` are copied from `soundPeaks.test.ts`, whose `afterEach` (`resetPeaks` + grace) also ends any listening.

`src/editor/__tests__/pauseFind.test.tsx`:

```ts
jest.mock("@/src/editor/soundPeaks", () => ({ listenForPauses: jest.fn(), stopPauses: jest.fn(), heardPauses: jest.fn(() => null) }));
import { act, renderHook } from "@testing-library/react-native";
import { heardPauses, listenForPauses, stopPauses, type PauseListening } from "@/src/editor/soundPeaks";
import { makeClip } from "@/src/editor/model/types";
import { pauseOptions, pauseSaving, usePauseListening } from "../pauseFind";
import { usePauses } from "../pausesState";

const outline = { from: 0, to: 3, levels: new Float32Array(300) };
let finish: (r: PauseListening) => void = () => {};
beforeEach(() => { jest.clearAllMocks(); jest.mocked(listenForPauses).mockImplementation(() => new Promise((r) => { finish = r; })); });

test("the chips' OUTPUT seconds become source seconds through timeline.ts; the pad is the file's", () => {
  const clip = makeClip({ id: "c", sourceDuration: 20, speed: 2 });
  expect(pauseOptions(clip, { gap: "medium", quiet: "noisy" })).toEqual({ minGap: 1.2, minPiece: 0.6, pad: 0.1, quietDb: -25 });
  expect(pauseSaving(clip, [[2, 4], [6, 7]])).toBeCloseTo(1.5, 9);
});

test("the session's choice starts at 0.6 s and Quiet, and no shades", () => {
  expect(usePauses.getState()).toMatchObject({ choice: { gap: "medium", quiet: "quiet" }, shades: null });
});

test("no source: nothing; a source: listening, then ready; unmounting stops it", async () => {
  const { result, rerender, unmount } = await renderHook(({ s }) => usePauseListening(s), { initialProps: { s: null as { uri: string; from: number; to: number } | null } });
  expect(result.current).toBeNull(); expect(listenForPauses).not.toHaveBeenCalled();
  await rerender({ s: { uri: "u", from: 0, to: 3 } });
  expect(result.current).toEqual({ status: "listening" });
  await act(async () => { finish({ status: "ready", outline }); });
  expect(result.current).toEqual({ status: "ready", outline });
  await unmount();
  expect(stopPauses).toHaveBeenCalled();
});

test("an outline already heard is ready at once; a stop while still shown reads as a failure", async () => {
  jest.mocked(heardPauses).mockImplementation((s) => (s.uri === "u" ? outline : null));
  const { result } = await renderHook(() => usePauseListening({ uri: "u", from: 0, to: 3 }));
  expect(result.current).toEqual({ status: "ready", outline });
  const other = await renderHook(() => usePauseListening({ uri: "v", from: 0, to: 3 }));
  await act(async () => { finish({ status: "stopped" }); });
  expect(other.result.current).toEqual({ status: "failed", reason: "failed" });
});
```

- [ ] **Step 2: Run both — expect FAIL.**

- [ ] **Step 3: Implement.**

`src/editor/pausesState.ts`:

```ts
import { create } from "zustand";
import { DEFAULT_PAUSE_CHOICE, type PauseChoice, type PauseCut } from "./model/pauses";

/**
 * Remove pauses, in memory for the session: the chips' choice, and the cuts the open strip would make (`shades`, null when it is closed
 * or finds none) — read by the selected clip in the timeline. Never in the project, never in undo, never on disk. Written only by
 * RemovePausesSheet.tsx.
 */
export const usePauses = create<{ choice: PauseChoice; shades: { clipId: string; cuts: PauseCut[] } | null }>(() => ({ choice: DEFAULT_PAUSE_CHOICE, shades: null }));
```

`src/editor/soundPeaks.ts` — the changes, in this order:

1. Imports: add `isPeaksCancelled` to the `@/modules/clipy-video` import; `import { assemblePauseOutline, PAUSES, pausePlan, type PauseOutline } from "./model/pauses";`.
2. Extend the header comment: "Remove pauses listens here too (`listenForPauses`): one native call at a time for both — the turn below."
3. `running` gains its kind: `let running: { jobId: string; uri: string; kind: CallKind; giveUp: () => void } | null = null;` with `type CallKind = "wave" | "pauses";`. `answered(uri, call)` becomes `answered(uri, call, kind)` and writes `kind` into `running`.
4. The turn, after `cancelRunning`:

```ts
/**
 * Every native call — a waveform's or a pause's — holds ONE turn while it runs, so the phone never reads two at once. A pauses call
 * (asked by the owner's tap) goes before every WAITING waveform call; nothing interrupts a call that runs.
 */
let turnHeld = false;
const turnQueue: { urgent: boolean; go: () => void }[] = [];
function takeTurn(urgent: boolean): Promise<void> {
  if (!turnHeld) { turnHeld = true; return Promise.resolve(); }
  return new Promise<void>((go) => { turnQueue.push({ urgent, go }); });
}
function giveTurn(): void {
  const i = turnQueue.findIndex((w) => w.urgent);
  const next = i >= 0 ? turnQueue.splice(i, 1)[0] : turnQueue.shift();
  if (next) next.go(); else turnHeld = false;
}
/** One native call in its turn; `still` is asked again once the turn comes (the caller may have been left meanwhile). */
async function asked(uri: string, call: PeaksCall, kind: CallKind, still: () => boolean): Promise<SoundPeaksResult> {
  await takeTurn(kind === "pauses");
  try {
    if (!still()) throw cancelledError();
    return await answered(uri, call, kind);
  } finally { giveTurn(); }
}
```

5. `pump`: `answers.push(await answered(next.uri, call));` → `answers.push(await asked(next.uri, call, "wave", stillWanted));`.
6. `syncPeaks`: `if (running !== null && running.kind === "wave" && !sources.some((s) => s.uri === running?.uri)) cancelRunning();`.
7. `resetPeaks`: add `stopPauses();` as its first line (it cancels a pauses call; the rest cancels a waveform call as before).
8. The pauses part, at the end of the file before `keyOf`:

```ts
/** Remove pauses: one clip's sound over its trim. */
export type PauseSource = { uri: string; from: number; to: number };
export type PauseFailure = "build" | "tooLong" | "noSound" | "failed";
export type PauseListening = { status: "ready"; outline: PauseOutline } | { status: "failed"; reason: PauseFailure } | { status: "stopped" };
/** The outlines heard this session — floats, by file, range and density. In memory only (spec §2.3): never on disk, never in the project or undo. */
const heard = new Map<string, PauseOutline>();
export const pauseKey = (s: PauseSource): string => `${s.uri}|${s.from}|${s.to}|${PAUSES.perSecond}`;
export const heardPauses = (s: PauseSource): PauseOutline | null => heard.get(pauseKey(s)) ?? null;
/** The listening that runs (one at a time), and the count that `stopPauses` raises: an answer from before belongs to nobody. */
let listening: { key: string; run: number; done: Promise<PauseListening> } | null = null;
let pausesRun = 0;

/**
 * Listens to a clip's ORIGINAL file over its trim (`pausePlan`: calls of 20 s), one native call at a time and ahead of the waiting
 * waveform calls — not waiting for the editor to stand still: the owner asked. A second ask for the same source joins the first; another
 * source stops it. Each call has PEAKS_DEADLINE_MS. Only a ready outline is remembered.
 */
export function listenForPauses(s: PauseSource): Promise<PauseListening> {
  if (!isPeaksAvailable()) return Promise.resolve({ status: "failed", reason: "build" });
  const key = pauseKey(s);
  const known = heard.get(key);
  if (known) return Promise.resolve({ status: "ready", outline: known });
  if (listening !== null && listening.key === key && listening.run === pausesRun) return listening.done;
  stopPauses();
  const plan = pausePlan(s.from, s.to);
  if (!plan) return Promise.resolve({ status: "failed", reason: "tooLong" });
  const run = pausesRun;
  const still = (): boolean => run === pausesRun;
  const done = (async (): Promise<PauseListening> => {
    try {
      const answers: SoundPeaksResult[] = [];
      for (const call of plan) {
        if (!still()) return { status: "stopped" };
        answers.push(await asked(s.uri, call, "pauses", still));
      }
      if (!still()) return { status: "stopped" };
      const outline = assemblePauseOutline(plan, answers);
      if (!outline) throw new Error("pauses: the answers do not fit the clip");
      heard.set(key, outline);
      while (heard.size > PAUSES.remember) heard.delete(heard.keys().next().value as string);
      return { status: "ready", outline };
    } catch (e) {
      if (!still() || isPeaksCancelled(e)) return { status: "stopped" };
      const text = e instanceof Error ? e.message : String(e);
      console.warn("pauses failed", text);
      return { status: "failed", reason: text.includes("has no sound") ? "noSound" : "failed" };
    } finally {
      if (listening !== null && listening.run === run) listening = null;
    }
  })();
  listening = { key, run, done };
  return done;
}

/** Stops the listening (the strip closed, another clip, the editor left): its call is cancelled, a late answer dropped. */
export function stopPauses(): void {
  pausesRun += 1;
  listening = null;
  if (running !== null && running.kind === "pauses") cancelRunning();
}
```

`src/editor/pauseFind.ts`:

```ts
import { useEffect, useState } from "react";
import { PAUSE_GAPS, PAUSE_QUIET, PAUSES, type PauseChoice, type PauseCut, type PauseOptions, type PauseOutline } from "./model/pauses";
import { sourceAfter, sourceToOutput } from "./model/timeline";
import type { Clip } from "./model/types";
import { heardPauses, listenForPauses, stopPauses, type PauseFailure, type PauseSource } from "./soundPeaks";

export type PauseState = { status: "listening" } | { status: "ready"; outline: PauseOutline } | { status: "failed"; reason: PauseFailure };

/** The chips as `findPauses` options: OUTPUT seconds turned into source seconds by timeline.ts (`sourceAfter`) — never a speed here. */
export function pauseOptions(clip: Clip, choice: PauseChoice): PauseOptions {
  const source = (seconds: number): number => sourceAfter(clip, clip.trimStart, seconds) - clip.trimStart;
  const gap = PAUSE_GAPS.find((g) => g.id === choice.gap) ?? PAUSE_GAPS[1];
  const quiet = PAUSE_QUIET.find((q) => q.id === choice.quiet) ?? PAUSE_QUIET[1];
  return { minGap: source(gap.seconds), minPiece: source(PAUSES.minPiece), pad: PAUSES.pad, quietDb: quiet.db };
}

/** How much shorter the clip plays without `cuts`, in output seconds (timeline.ts's mapping). */
export const pauseSaving = (clip: Clip, cuts: readonly PauseCut[]): number => cuts.reduce((s, [a, b]) => s + sourceToOutput(clip, b) - sourceToOutput(clip, a), 0);

/** Listens to `source` while it is given (the open strip's clip); null without one. Stops on a change and on unmount. */
export function usePauseListening(source: PauseSource | null): PauseState | null {
  const key = source === null ? null : `${source.uri}|${source.from}|${source.to}`;
  const [state, setState] = useState<{ key: string; value: PauseState } | null>(null);
  useEffect(() => {
    if (source === null || key === null) return;
    const known = heardPauses(source);
    if (known) { setState({ key, value: { status: "ready", outline: known } }); return; }
    let alive = true;
    setState({ key, value: { status: "listening" } });
    void listenForPauses(source).then((r) => {
      if (!alive) return;
      setState({ key, value: r.status === "stopped" ? { status: "failed", reason: "failed" } : r });
    });
    return () => { alive = false; stopPauses(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  if (key === null) return null;
  if (state === null || state.key !== key) {
    const known = source === null ? null : heardPauses(source);
    return known ? { status: "ready", outline: known } : { status: "listening" };
  }
  return state.value;
}
```

- [ ] **Step 4: Run both new suites — PASS; run `soundPeaks.test.ts` UNEDITED — PASS** (the turn is invisible to one caller).
- [ ] **Step 5: Checks**, **commit** `git add src/editor/soundPeaks.ts src/editor/pausesState.ts src/editor/pauseFind.ts src/editor/__tests__/soundPeaks.pauses.test.ts src/editor/__tests__/pauseFind.test.tsx` → `feat(editor): listen for pauses — one native turn shared with the waveforms, outlines for the session`.

---

## Task 4 — Strip, toolbar, timeline shading, message, icon

**Files:**
- Create: `src/editor/components/RemovePausesSheet.tsx`, `src/editor/__tests__/RemovePausesSheet.test.tsx`, `src/editor/__tests__/toolbarContext.pauses.test.ts`, `src/editor/__tests__/pauseShades.test.tsx`
- Modify: `src/editor/toolbarContext.ts`, `src/editor/toolGroups.ts`, `src/editor/toolStrip.ts`, `src/editor/components/EditorToolbar.tsx`, `src/editor/timelineMarks.ts`, `src/editor/components/ClipThumbStrip.tsx`, `src/ui/sfSymbols.ts`, `src/lib/buildInfo.ts`
- Update as stated: `toolbarContext.test.ts`, `toolGroups.groups.test.ts`, `EditorToolbar.test.tsx`, `sfSymbols.map.test.ts`

- [ ] **Step 1: Write the failing tests.**

`src/editor/__tests__/toolbarContext.pauses.test.ts`:

```ts
import { extractClipAudio } from "@/src/editor/model/ops";
import { makeClip, makeLayer, makePhotoClip, makeProject } from "@/src/editor/model/types";
import { contextFor, TOOL_IDS, type ToolbarSelection } from "../toolbarContext";
import { groupOf, TOOL_META } from "../toolGroups";

const sel = (clipId: string): ToolbarSelection => ({ clipId, overlayId: null, effectId: null, audioId: null, section: null });
const p = makeProject({
  clips: [makeClip({ id: "a", sourceDuration: 8 }), makePhotoClip({ id: "ph" }), makeClip({ id: "r", sourceDuration: 5, reversed: true }),
    makeClip({ id: "fast", sourceDuration: 8, speed: 2 }), makeClip({ id: "ramp", sourceDuration: 8, speed: 1, speedCurve: { id: "montage", steps: [{ from: 0, to: 8, speed: 1 }] } as never }),
    makeClip({ id: "x", sourceDuration: 8 })],
  layers: [makeLayer({ id: "L", sourceDuration: 6 })],
});
const tools = (q: typeof p, id: string) => contextFor(sel(id), q).tools;

test("Remove pauses: a tool after Stabilize, in the Edit group, with its own icon", () => {
  expect(TOOL_IDS).toContain("pauses");
  expect(TOOL_META.pauses).toEqual({ label: "Remove pauses", icon: "pause-circle-outline" });
  expect(groupOf("pauses")).toBe("edit");
  expect(tools(p, "a").indexOf("pauses")).toBe(tools(p, "a").indexOf("stabilize") + 1);
});

test("on a main video clip at a constant speed only — never a photo, a reversed or ramped clip, a layer, or a clip whose sound is on its own bar", () => {
  for (const id of ["a", "fast", "x"]) expect(tools(p, id)).toContain("pauses");
  for (const id of ["ph", "r", "ramp", "L"]) expect(tools(p, id)).not.toContain("pauses");
  const extracted = extractClipAudio(p, "x", "bar");
  expect(tools(extracted, "x")).not.toContain("pauses");
});
```

`src/editor/__tests__/pauseShades.test.tsx`:

```ts
jest.mock("expo-video-thumbnails", () => ({ getThumbnailAsync: jest.fn(async () => ({ uri: "file:///thumb.jpg" })) }));
import { act, render, screen } from "@testing-library/react-native";
import { makeClip } from "@/src/editor/model/types";
import { ClipThumbStrip } from "../components/ClipThumbStrip";
import { usePauses } from "../pausesState";
import { PAUSE_SHADE, pauseShades } from "../timelineMarks";

const clip = makeClip({ id: "c", sourceDuration: 20, trimStart: 2, trimEnd: 8, speed: 2 });   // 3 s on the timeline

test("pauseShades: each cut through sourceToOutput × zoom, clipped, at least 2 pt, at most 60", () => {
  expect(pauseShades(clip, [[3, 4]], 60)).toEqual([{ x: 30, width: 30 }]);
  expect(pauseShades(clip, [[7.99, 8]], 60)).toEqual([{ x: 178, width: 2 }]);
  expect(pauseShades(clip, [[1, 3]], 60)).toEqual([{ x: 0, width: 30 }]);
  expect(pauseShades(clip, Array.from({ length: 70 }, (_, i) => [2 + i * 0.08, 2.04 + i * 0.08] as const), 60)).toHaveLength(PAUSE_SHADE.most);
  expect(pauseShades(clip, [[3, 4]], 0)).toEqual([]);
});

test("only the clip the open strip is about shows its shades; no touches; gone when cleared", async () => {
  await render(<><ClipThumbStrip clip={clip} pixelsPerSecond={60} selected missing={false} onPress={() => {}} />
    <ClipThumbStrip clip={{ ...clip, id: "d" }} pixelsPerSecond={60} selected={false} missing={false} onPress={() => {}} /></>);
  expect(screen.queryAllByTestId("pause-shade")).toHaveLength(0);
  await act(() => { usePauses.setState({ shades: { clipId: "c", cuts: [[3, 4], [5, 6]] } }); });
  const shades = screen.getAllByTestId("pause-shade");
  expect(shades).toHaveLength(2);
  expect(shades[0].props.pointerEvents).toBe("none");
  await act(() => { usePauses.setState({ shades: null }); });
  expect(screen.queryAllByTestId("pause-shade")).toHaveLength(0);
});
```

`src/editor/__tests__/RemovePausesSheet.test.tsx`:

```ts
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-16T10:00:00.000Z" }));
jest.mock("@/modules/clipy-video", () => ({ ...jest.requireActual("@/modules/clipy-video"), isPeaksAvailable: jest.fn(() => true) }));
jest.mock("@/src/editor/soundPeaks", () => ({ listenForPauses: jest.fn(), stopPauses: jest.fn(), heardPauses: jest.fn(() => null) }));
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { isPeaksAvailable } from "@/modules/clipy-video";
import { makeClip, makeLayer, makeProject } from "@/src/editor/model/types";
import { listenForPauses, type PauseListening } from "@/src/editor/soundPeaks";
import { useEditorStore } from "@/src/editor/store";
import { PAUSES_TOOLS } from "@/src/lib/buildInfo";
import { useToast } from "@/src/ui/Toast";
import { PAUSE_WORDS, pauseStatus, RemovePausesSheet } from "../components/RemovePausesSheet";
import { usePauses } from "../pausesState";
import { DEFAULT_PAUSE_CHOICE, PAUSES } from "../model/pauses";

const st = () => useEditorStore.getState();
/** Speech 1 s, silence 1 s, speech 1 s, silence 0.5 s, speech 1 s over the clip's trim 0 … 4.5. */
function talk(): Float32Array {
  const l = new Float32Array(450).fill(0.5);
  l.fill(0.001, 100, 200); l.fill(0.001, 300, 350);
  return l;
}
let finish: (r: PauseListening) => void = () => {};
const onClose = jest.fn();
const open = async (id = "a") => {
  await render(<RemovePausesSheet clipId={id} visible onClose={onClose} />);
};
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(isPeaksAvailable).mockReturnValue(true);
  jest.mocked(listenForPauses).mockImplementation(() => new Promise((r) => { finish = r; }));
  usePauses.setState({ choice: DEFAULT_PAUSE_CHOICE, shades: null });
  useToast.getState().clear();
  st().reset();
  st().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 4.5 }), makeClip({ id: "b", sourceDuration: 3 })], layers: [makeLayer({ id: "L", sourceDuration: 2 })] }));
});
const heard = async () => { await act(async () => { finish({ status: "ready", outline: { from: 0, to: 4.5, levels: talk() } }); }); };

test("the drawing: title, two rows of chips with the defaults picked, Listening…, no button yet", async () => {
  await open();
  expect(screen.getByText("Remove pauses")).toBeTruthy();
  expect(screen.getByText("Cut pauses longer than")).toBeTruthy();
  expect(screen.getByText("What counts as quiet")).toBeTruthy();
  for (const l of ["0.3 s", "0.6 s", "1 s", "Silent", "Quiet", "Noisy Room"]) expect(screen.getByText(l)).toBeTruthy();
  expect(screen.getByRole("button", { name: "Longer than 0.6 seconds" }).props.accessibilityState.selected).toBe(true);
  expect(screen.getByRole("button", { name: "Quiet" }).props.accessibilityState.selected).toBe(true);
  expect(screen.getByText(PAUSE_WORDS.listening)).toBeTruthy();
  expect(screen.queryByTestId("main-button")).toBeNull();
  expect(listenForPauses).toHaveBeenCalledWith({ uri: "file:///media/a.mp4", from: 0, to: 4.5 });
});

test("found: the line, the white button, the shades; a chip re-computes at once without listening again", async () => {
  await open(); await heard();
  expect(screen.getByText("1 pause found · 0.8 s shorter")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Remove 1 Pause" })).toBeTruthy();
  expect(usePauses.getState().shades).toEqual({ clipId: "a", cuts: [[1.1, 1.9]] });
  await fireEvent.press(screen.getByRole("button", { name: "Longer than 0.3 seconds" }));
  expect(screen.getByText("2 pauses found · 1.1 s shorter")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Remove 2 Pauses" })).toBeTruthy();
  expect(listenForPauses).toHaveBeenCalledTimes(1);
  expect(usePauses.getState().choice).toEqual({ gap: "short", quiet: "quiet" });
});

test("Remove: ONE undo step, the strip closes, then the message with Undo", async () => {
  await open(); await heard();
  await fireEvent.press(screen.getByRole("button", { name: "Longer than 0.3 seconds" }));
  await fireEvent.press(screen.getByRole("button", { name: "Remove 2 Pauses" }));
  expect(st().past).toHaveLength(1);
  expect(st().project!.clips.map((c) => [c.trimStart, c.trimEnd])).toEqual([[0, 1.1], [1.9, 3.1], [3.4, 4.5], [0, 3]]);
  expect(st().project!.clips[0].id).toBe("a");
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(useToast.getState()).toMatchObject({ message: "2 pauses removed", kind: "done", undo: true });
});

test("closing clears the shades", async () => {
  const r = await render(<RemovePausesSheet clipId="a" visible onClose={onClose} />);
  await heard();
  expect(usePauses.getState().shades).not.toBeNull();
  await r.rerender(<RemovePausesSheet clipId="a" visible={false} onClose={onClose} />);
  expect(usePauses.getState().shades).toBeNull();
});

test("without the function: the sentence, nothing asked, no button", async () => {
  jest.mocked(isPeaksAvailable).mockReturnValue(false);
  await open();
  expect(screen.getByText(PAUSES_TOOLS)).toBeTruthy();
  expect(PAUSES_TOOLS).toBe("Remove pauses and sound outlines need the latest Clipy build. Install it from the newest build link.");
  expect(listenForPauses).not.toHaveBeenCalled();
  expect(screen.queryByTestId("main-button")).toBeNull();
});

test("a layer's id draws nothing", async () => {
  await open("L");
  expect(screen.queryByText("Remove pauses")).toBeNull();
});

test("pauseStatus: every line", () => {
  const base = { build: false, missing: false, state: null, found: null, saving: 0 } as const;
  expect(pauseStatus({ ...base, build: true })).toBe(PAUSES_TOOLS);
  expect(pauseStatus({ ...base, missing: true })).toBe("The file of this clip is missing.");
  expect(pauseStatus(base)).toBe("Listening…");
  expect(pauseStatus({ ...base, state: { status: "failed", reason: "tooLong" } })).toBe("Remove pauses works on clips up to 10 minutes. Trim or split this clip first.");
  expect(pauseStatus({ ...base, state: { status: "failed", reason: "noSound" } })).toBe("This clip has no sound.");
  expect(pauseStatus({ ...base, state: { status: "failed", reason: "failed" } })).toBe("Could not listen to this clip. Close and open Remove pauses to try again.");
  const ready = { status: "ready", outline: { from: 0, to: 1, levels: new Float32Array(100) } } as const;
  expect(pauseStatus({ ...base, state: ready, found: { cuts: [], silent: true } })).toBe("This clip is silent.");
  expect(pauseStatus({ ...base, state: ready, found: { cuts: [], silent: false } })).toBe("No pauses found");
  expect(pauseStatus({ ...base, state: ready, found: { cuts: Array(6).fill([0, 1]), silent: false }, saving: 8.44 })).toBe("6 pauses found · 8.4 s shorter");
  expect(PAUSES.maxCuts).toBe(60);
});
```

(Expected cuts: run 1.0–2.0 → [1.1, 1.9]; with 0.3 s also run 3.0–3.5 → [3.1, 3.4]; saved 0.8 + 0.3 = 1.1 s.)

- [ ] **Step 2: Run — FAIL.**

- [ ] **Step 3: Implement.**

`src/lib/buildInfo.ts` — after `STEADY_TOOLS`:

```ts
/** Said in the Remove pauses strip in Expo Go or in a build from before `soundPeaks` (the "icons and light" build). */
export const PAUSES_TOOLS = NEEDS_LATEST_BUILD("Remove pauses and sound outlines");
```

`src/editor/toolStrip.ts`: `StripId` gains `| "pauses"`.

`src/editor/toolbarContext.ts`: `TOOL_IDS` gains `"pauses"` right after `"stabilize"`; import `hasSpeedCurve` from `./model/timeline` and `extractedTrackOf` from `./model/ops`; in the main-clip branch:

```ts
    // Remove pauses: a main video clip at a constant speed, played forwards, whose sound is still in it (an extracted bar would play on uncut).
    const pausable = video && !item.clip.reversed && !hasSpeedCurve(item.clip) && extractedTrackOf(p, item.clip.id) === null;
```

and in the clip list `["stabilize", video && !item.clip.reversed], ["pauses", pausable], ["keyframe", pins],`. Add one sentence to the doc comment: "Remove pauses is on a MAIN video clip that plays forwards at a constant speed and still holds its sound (never a layer)."

`src/editor/toolGroups.ts`: `TOOL_META` gains `pauses: { label: "Remove pauses", icon: "pause-circle-outline" },` after `stabilize`; `GROUP_OF` gains `pauses: "edit"` (first of the edit entries).

`src/ui/sfSymbols.ts`: in the editor's tool section, `"pause-circle-outline": "waveform.badge.minus",   // Remove pauses: the mirror of Extract audio's waveform.badge.plus`.

`src/editor/timelineMarks.ts` — import `sourceToOutput` beside `clipDuration`; at the end:

```ts
/** The stretches the open Remove pauses strip would cut, shaded on its clip: never thinner than `thinnest`, never more than `most` (= PAUSES.maxCuts). */
export const PAUSE_SHADE = { most: 60, thinnest: 2 } as const;
/** Each cut (source seconds) as x … x + width in points from the clip's left edge, through timeline.ts's mapping; clipped to the clip. */
export function pauseShades(clip: Clip, cuts: readonly (readonly [number, number])[], pps: number): { x: number; width: number }[] {
  if (!(Number.isFinite(pps) && pps > 0)) return [];
  const whole = timeToX(clipDuration(clip), pps);
  const out: { x: number; width: number }[] = [];
  for (const [a, b] of cuts) {
    if (out.length >= PAUSE_SHADE.most) break;
    if (!(Number.isFinite(a) && Number.isFinite(b) && b > a)) continue;
    const x0 = Math.max(0, timeToX(sourceToOutput(clip, a), pps)), x1 = Math.min(whole, timeToX(sourceToOutput(clip, b), pps));
    if (!(x1 > x0)) continue;
    const width = Math.max(PAUSE_SHADE.thinnest, x1 - x0);
    out.push({ x: Math.max(0, Math.min(x0, whole - width)), width });
  }
  return out;
}
```

(The vector `[[7.99, 8]]` at speed 2, 60 pt/s: x0 = 179.7, x1 = 180 → width 2, x = 178. `[[1, 3]]` → x0 clamped 0, x1 = 30.)

`src/editor/components/ClipThumbStrip.tsx`: import `usePauses` from `../pausesState` and `pauseShades` from `../timelineMarks`; in the body:

```ts
  // The open Remove pauses strip's cuts on THIS clip (a stored array, or null: every other clip renders nothing new).
  const cuts = usePauses((s) => (s.shades !== null && s.shades.clipId === clip.id ? s.shades.cuts : null));
  const shades = cuts === null ? NO_SHADES : pauseShades(clip, cuts, pixelsPerSecond);
```

with module consts `const NO_SHADES: { x: number; width: number }[] = [];` and `/** The clip box's border: an absolute child is placed inside it. */ const CLIP_BORDER = 2;`, and right after the thumbnails' `map`:

```tsx
      {/* Remove pauses: what would be cut, shaded. Plain views, no touches, nothing animated. */}
      {shades.map((s, i) => (
        <View key={i} testID="pause-shade" pointerEvents="none"
          style={{ position: "absolute", top: 0, bottom: 0, left: Math.max(0, s.x - CLIP_BORDER), width: s.width, backgroundColor: theme.colors.scrimStrong }} />
      ))}
```

`src/editor/components/RemovePausesSheet.tsx`:

```tsx
import { useEffect, useMemo } from "react";
import { ScrollView, View } from "react-native";
import { isPeaksAvailable } from "@/modules/clipy-video";
import { removePauses } from "@/src/editor/model/ops";
import { findPauses, PAUSE_GAPS, PAUSE_QUIET, type PauseChoice, type PauseCut, type PauseFind } from "@/src/editor/model/pauses";
import { pauseOptions, pauseSaving, usePauseListening, type PauseState } from "@/src/editor/pauseFind";
import { usePauses } from "@/src/editor/pausesState";
import { useEditorStore } from "@/src/editor/store";
import { useItemClip } from "@/src/editor/useItem";
import { PAUSES_TOOLS } from "@/src/lib/buildInfo";
import { theme } from "@/src/theme/theme";
import { Chip } from "@/src/ui/Chip";
import { haptic } from "@/src/ui/haptics";
import { PrimaryButton } from "@/src/ui/PrimaryButton";
import { Body } from "@/src/ui/Text";
import { useToast } from "@/src/ui/Toast";
import { STRIP, ToolStrip } from "@/src/ui/ToolStrip";

/** Every sentence of the strip (spec §2.7). */
export const PAUSE_WORDS = {
  listening: "Listening…",
  missing: "The file of this clip is missing.",
  tooLong: "Remove pauses works on clips up to 10 minutes. Trim or split this clip first.",
  noSound: "This clip has no sound.",
  failed: "Could not listen to this clip. Close and open Remove pauses to try again.",
  silent: "This clip is silent.",
  none: "No pauses found",
  notRemoved: "Nothing was removed.",
} as const;
export const foundLine = (n: number, seconds: number): string => `${n === 1 ? "1 pause" : `${n} pauses`} found · ${seconds.toFixed(1)} s shorter`;
export const removeTitle = (n: number): string => (n === 1 ? "Remove 1 Pause" : `Remove ${n} Pauses`);
export const removedMessage = (n: number): string => (n === 1 ? "1 pause removed" : `${n} pauses removed`);
/** A choice row's label column: two lines of the smallest text, so both rows' chips fit a 375-pt phone. */
export const PAUSE_LABEL_WIDTH = 88;
const NO_CUTS: PauseCut[] = [];

/** The status line: the first that applies. */
export function pauseStatus(a: { build: boolean; missing: boolean; state: PauseState | null; found: PauseFind | null; saving: number }): string {
  if (a.build) return PAUSES_TOOLS;
  if (a.missing) return PAUSE_WORDS.missing;
  const s = a.state;
  if (s === null || s.status === "listening") return PAUSE_WORDS.listening;
  if (s.status === "failed") return s.reason === "build" ? PAUSES_TOOLS : s.reason === "tooLong" ? PAUSE_WORDS.tooLong : s.reason === "noSound" ? PAUSE_WORDS.noSound : PAUSE_WORDS.failed;
  if (a.found === null) return PAUSE_WORDS.listening;
  if (a.found.silent) return PAUSE_WORDS.silent;
  return a.found.cuts.length === 0 ? PAUSE_WORDS.none : foundLine(a.found.cuts.length, a.saving);
}

/** One row of the strip (STRIP.slider high): the label, then the chips (they scroll rather than clip at a large text size). */
function ChoiceRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ height: STRIP.slider, flexDirection: "row", alignItems: "center", gap: theme.space.md, paddingLeft: theme.space.gutter }}>
      <Body muted numberOfLines={2} style={{ width: PAUSE_LABEL_WIDTH, fontSize: theme.type.micro }}>{label}</Body>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1, height: STRIP.slider }}
        contentContainerStyle={{ alignItems: "center", gap: theme.space.xs, paddingRight: theme.space.gutter }}>
        {children}
      </ScrollView>
    </View>
  );
}

/**
 * Remove pauses on the selected MAIN video clip: it listens to the clip's own sound when it opens (`usePauseListening`; nothing on
 * load), the chips re-compute from what was heard at once, the cuts are shaded on the clip (`usePauses.shades`), and Remove applies
 * `removePauses` as ONE step — then the strip closes and the message bar says it, with Undo.
 */
export function RemovePausesSheet({ clipId, visible, onClose }: { clipId: string | null; visible: boolean; onClose: () => void }) {
  const clip = useItemClip(clipId);
  const main = useEditorStore((s) => clipId !== null && !!s.project?.clips.some((c) => c.id === clipId));
  const uri = clip?.sourceUri ?? null, from = clip?.trimStart ?? 0, to = clip?.trimEnd ?? 0, speed = clip?.speed ?? 1;
  const missing = useEditorStore((s) => uri !== null && s.missingSourceUris.includes(uri));
  const choice = usePauses((s) => s.choice);
  const build = !isPeaksAvailable();
  const source = useMemo(() => (visible && main && uri !== null && !missing && !build ? { uri, from, to } : null), [visible, main, uri, from, to, missing, build]);
  const state = usePauseListening(source);
  const found = useMemo(() => {
    if (!clip || state?.status !== "ready" || state.outline.from !== clip.trimStart || state.outline.to !== clip.trimEnd) return null;
    return findPauses(state.outline, pauseOptions(clip, choice));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, choice, from, to, speed]);
  const cuts = found?.cuts ?? NO_CUTS;
  useEffect(() => {
    if (!visible || clipId === null || cuts.length === 0) return;
    usePauses.setState({ shades: { clipId, cuts } });
    return () => usePauses.setState({ shades: null });
  }, [visible, clipId, cuts]);
  if (!clip || !main) return null;
  const n = cuts.length;
  const pick = (patch: Partial<PauseChoice>) => usePauses.setState((s) => ({ choice: { ...s.choice, ...patch } }));
  const remove = () => {
    const { project, apply } = useEditorStore.getState();
    if (!project || n === 0) return;
    const next = removePauses(project, clip.id, cuts);
    if (next === project) { useToast.getState().show(PAUSE_WORDS.notRemoved, { kind: "problem" }); return; }
    haptic("medium");
    apply(() => next);
    onClose();                                                                       // close first …
    useToast.getState().show(removedMessage(n), { kind: "done", undo: true });       // … say second
  };
  return (
    <ToolStrip visible={visible} onClose={onClose} title="Remove pauses">
      <ChoiceRow label="Cut pauses longer than">
        {PAUSE_GAPS.map((g) => <Chip compact key={g.id} label={g.label} accessibilityLabel={g.spoken} selected={choice.gap === g.id} onPress={() => pick({ gap: g.id })} />)}
      </ChoiceRow>
      <ChoiceRow label="What counts as quiet">
        {PAUSE_QUIET.map((q) => <Chip compact key={q.id} label={q.label} selected={choice.quiet === q.id} onPress={() => pick({ quiet: q.id })} />)}
      </ChoiceRow>
      <View testID="pauses-status" style={{ height: STRIP.slider, flexDirection: "row", alignItems: "center", gap: theme.space.md, paddingHorizontal: theme.space.gutter }}>
        <Body muted numberOfLines={n > 0 ? 1 : 2} style={{ flex: 1, fontSize: theme.type.small }}>
          {pauseStatus({ build, missing, state, found, saving: found ? pauseSaving(clip, cuts) : 0 })}
        </Body>
        {n > 0 ? <PrimaryButton compact tone="plain" title={removeTitle(n)} onPress={remove} /> : null}
      </View>
    </ToolStrip>
  );
}
```

`src/editor/components/EditorToolbar.tsx`: import `RemovePausesSheet`; `ACTIONS` gains `pauses: { onPress: () => openStrip("pauses") },` after `stabilize`; mount `<RemovePausesSheet clipId={selectedId} visible={strip?.id === "pauses"} onClose={closeStrip} />` after `StabilizeSheet`.

The four stated test updates (spec §4): `toolbarContext.test.ts` `CLIP` → `…, "stabilize", "pauses", "keyframe", …`, its photo line `without(CLIP, …, "stabilize", "pauses", …)`, its reversed line `without(CLIP, …, "stabilize", "pauses")`; `toolGroups.groups.test.ts` and `EditorToolbar.test.tsx` `Edit: ["Remove pauses", "Keyframe", "Transition", "Replace", "Reverse", "Freeze", "Duplicate"]` (and the same for any other main video clip listed there — `cut`, `s`, `sm`, `z`); `sfSymbols.map.test.ts` `"pause-circle-outline"` between `"paw-outline"` and `"person-circle-outline"`, comment count +1.

- [ ] **Step 4: Run the new suites and the four updated ones — PASS.** `EditorToolbar` now imports `soundPeaks.ts` (through `RemovePausesSheet` → `pauseFind.ts`; before, only the editor route did): run every suite that renders the toolbar (`EditorToolbar*.test.tsx`, `toolbar.glass.test.tsx`, the editor-route suites). If one fails on that import under its own mocks, do NOT edit the suite — make `pauseFind.ts` reach `soundPeaks.ts` lazily (`require("./soundPeaks")` inside `usePauseListening`, typed by `import type`) and say so in the commit. Then the guards: `casing.guard`, `textScale.guard`, `spacingScale`, `noHexLiterals`, `palette.guard`, `systemFont.guard`, `outlineIcons`, `sfSymbols.map`, `toolGroups.groups` (its PROOF unedited), `defaultTree.proof` — all PASS unedited.
- [ ] **Step 5: Checks**, **commit** the files above explicitly → `feat(editor): Remove pauses — the strip, the tool, the shading and the message`.

---

## Task 5 — Docs

**Files:** `AGENTS.md`, `docs/next-build-phone-checklist.md`

- [ ] **Step 1: `AGENTS.md`** — in the Messages line, the list "(today: Cut to Beats, a clip's sound made its own bar by Voice / Sound, Read aloud placed or replaced, Paste style)" becomes "(today: Cut to Beats, a clip's sound made its own bar by Voice / Sound, Read aloud placed or replaced, Paste style, Remove pauses)". Add after the Waveforms line:

> - Remove pauses: the clip bar's tool `pauses` (the FIRST of the Edit group; `contextFor`: a MAIN video clip, not reversed, no speed curve, its sound not on its own bar — `extractedTrackOf`; never a layer or a photo) opens the strip `RemovePausesSheet.tsx`: "Cut pauses longer than" 0.3 s / 0.6 s / 1 s and "What counts as quiet" Silent / Quiet / Noisy Room (compact chips; the choice is `usePauses` in `src/editor/pausesState.ts`, memory for the session), the status line and — only when a pause is found — the white `Remove N Pauses`. The sound is the existing native `soundPeaks` on the clip's ORIGINAL file over its trim — no Swift, no `LEVELS` row, gate `isPeaksAvailable()` (else `PAUSES_TOOLS`): `listenForPauses` / `stopPauses` live in `src/editor/soundPeaks.ts`, still the only caller, and every native call there holds ONE turn (`takeTurn` / `giveTurn`: a pauses call goes before the WAITING waveform calls, never interrupts one that runs, and does not wait for `idle`); `PAUSES.perSecond` 100 in calls of 2000, at most 30, `PAUSES.longest` 600 s; the FLOATS are remembered for the session by `pauseKey` (at most 8) — never on disk (the waveform cache's bytes are too coarse for −45 dB), never in the project or undo; closing the strip, another selection and leaving the editor stop it and a late answer is dropped. What is cut is `findPauses` in `src/editor/model/pauses.ts` (TypeScript only, pure, type imports only; vectors in `pauses.test.ts`): a quiet line `max(0.001, top × 10^(dB / 20))` under the clip's own loudest slice (−45 / −35 / −25 dB), clicks of 0.02 s bridged, a quiet run at least the chip's length is a pause, cut less 0.1 s of the file on each side that touches sound (none at the clip's edges), cuts under 0.05 s dropped, no piece under 0.3 s heard (a cut is dropped, never sound), at most 60 (the longest); the chips' seconds are OUTPUT seconds, turned into source only by `sourceAfter` (`pauseOptions`, `src/editor/pauseFind.ts`). Only `removePauses(p, clipId, cuts)` (ops.ts) cuts, by the split rules — the first piece keeps the id, the In and the fade in, the last the Out, the fade out and the transition, none between pieces, pins and a Combo on every piece; text, stickers, sounds, layers and markers do not move; ONE `apply`, then the strip closes, then "N pauses removed" with Undo. While the strip is open the cuts are shaded on the clip (`pauseShades` in timelineMarks.ts: at most 60 plain views on `scrimStrong` inside `ClipThumbStrip`, no touches, nothing animated). Nothing is listened to or cut on load or by itself. Cut-out and steady copies cover the pieces (they keep the source's timeline). Only a phone can show (`docs/next-build-phone-checklist.md` part M): the three lines on real recordings, the pad on soft word endings, clicks at the joins (hard cuts, no cross-fade), the 375-pt fit of the second row.

- [ ] **Step 2: `docs/next-build-phone-checklist.md`** — append after part L:

```markdown
## M. Remove pauses

Use a video of yourself talking, with a few pauses of about a second (film one: "One … two … three", waiting between words).

### 51. The strip
Select the clip → Edit → Remove pauses.
- **Right looks like:** "Listening…" for a moment, then for example "3 pauses found · 2.4 s shorter" and a white "Remove 3 Pauses".
  On the clip in the timeline the pauses are darker stripes.
- **Wrong looks like:** "Listening…" that never ends, stripes on another clip, or stripes over the words.

### 52. The chips
Tap 0.3 s, then 1 s; then Silent, then Noisy Room.
- **Right looks like:** the number and the stripes change AT ONCE (no "Listening…" again); 0.3 s finds more, 1 s fewer.

### 53. Remove and Undo
Tap Remove. Play the clip.
- **Right looks like:** the strip closes, "3 pauses removed" with Undo; the clip is now several clips that play without the
  pauses; no word is cut off at its start or end. Undo brings the one clip back.
- **Wrong looks like:** a clipped word ("…ree" for "three"), a click at a join, text that moved, or Undo needing several taps.
  Write down which.

### 54. Text stays
With a text over the talking clip, Remove pauses.
- **Right looks like:** the text stays where it was in time (it now sits over later words — that is expected, as Cut to beats).

### 55. A clip with music only
A clip whose sound is a song with no gaps.
- **Right looks like:** "No pauses found" at Quiet. At Noisy Room perhaps a few — write down what you see.

### 56. A long clip
A talking clip of several minutes.
- **Right looks like:** "Listening…" for a few seconds (write down about how long), then the line. Over 10 minutes: "Remove
  pauses works on clips up to 10 minutes. Trim or split this clip first."

### 57. Close while listening
Open Remove pauses on a long clip and tap the tick at once; open it on another clip.
- **Right looks like:** nothing stuck; the second clip is listened to; no stripes left on the first.
```

- [ ] **Step 3: Checks**, **commit** `git add AGENTS.md docs/next-build-phone-checklist.md` → `docs: Remove pauses — AGENTS.md line, phone checklist part M`.

---

## Self-review (done when writing this plan)

- Spec coverage: §2.1 gate → Task 4 (`PAUSES_TOOLS`, strip test); §2.2 turn / stop / late answer → Task 3 tests; §2.3 numbers → Task 1 constants test, memory → Task 3; §2.4 which clips → Task 4 `toolbarContext.pauses.test.ts`, op refusals → Task 2; §2.5 vectors → Task 1; §2.6 op → Task 2; §2.7 strip, words, message order → Task 4; §2.8 shading → Task 4; §2.9 icon → Task 4; docs → Task 5.
- Types used across tasks: `PauseCut`, `PauseOutline`, `PauseOptions`, `PauseFind`, `PauseChoice` (Task 1) — `PauseSource`, `PauseFailure`, `PauseListening` (Task 3, `soundPeaks.ts`) — `PauseState` (Task 3, `pauseFind.ts`) — all consumed by Task 4 with the same names.
- No placeholders; every test names its expected values; literals checked against `types.ts` (`ANIM_IN_IDS`, `SPEED_CURVE_IDS`, `TRANSITION_LIMITS.min` 0.3) and `Toast.tsx` (`message` / `kind` / `undo` / `clear`).
