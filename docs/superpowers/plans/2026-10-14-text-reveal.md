# Text reveal animations (Typewriter, Word by word): Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A text's In animation can be **Typewriter** (letters appear one by one in reading order) or **Word by word** (whole words in turn), over the existing Length. The whole text is laid out from the first frame and the part not yet revealed is invisible in EVERY pass (fill, outline, shadow, glow), in the preview and in the exported file alike. Captions, stickers and Out are unchanged.

**Architecture:** A reveal is two more ids an In edge may hold, for a `kind: "text"` only (`ANIM_REVEAL_IDS`; `ANIM_IN_IDS` stays the frozen ten; no schema bump). ONE pure TypeScript file, `src/editor/model/textReveal.ts`, decides everything: the units (code-point ranges, UTF-16 offsets, a joined-script word is one unit), the steps (`revealPlan`, at most `REVEAL.maxSteps`), the cut at a time (preview) and the plan sent to the export (`exportReveal`). The preview draws every text layer as the shown prefix plus ONE see-through nested span. The export is SENT the plan as its own optional key `reveal: { cuts, from }` (with `animIn: null`) and, in `overlayLayer`, copies each text layer once per step with the hidden range in a clear fill and stroke, shown by `addVisibility` during its step — the caption highlight's own mechanism. An older build ignores the key: the text appears whole.

**Tech Stack:** Expo SDK 57, React Native 0.86.3 (Fabric), TypeScript strict, zustand 5, Jest 29.7 (`jest-expo`) + RNTL 14; Swift (Expo Modules API, Core Animation / Core Text), compiled only on EAS — **no Swift toolchain here**. No new package, no `app.json` change, no schema bump.

**Spec:** `docs/superpowers/specs/2026-10-14-text-reveal-design.md` (binding: §1 representation, §2 the plan, §3 the units, §4 the preview, §5 the export, §6 old builds, §7 the screen, §8 captions / Out).

## Global Constraints

- iPhone only. Read `AGENTS.md` first; it binds (Motion, Text size, Icons, Casing, Palette, Native code lines).
- **Never edited to make a change pass:** `looks.frozen.test.ts`, the PROOF blocks of `migrate.test.ts` and `useExport*.test.ts` (the overlay JSON at `useExport.test.ts:355` must stay byte for byte — a text without a reveal has NO `reveal` key), `overlayLayout.test.ts` / `overlayLayout.vectors.ts` PROOFs, `src/ui/__tests__/defaultTree.proof.test.tsx`, `timeline.stepped.proof.test.ts`, `cutoutRenders.test.ts`, `motion.parity.test.ts`, `motion.test.ts`, `types.motion.test.ts`, `effects.test.ts`.
- **Not edited:** `Motion.swift`, `OverlayMotion.swift`, `OverlayLayout.swift` / `overlayLayout.ts`, `CaptionWords.swift`, `MediaPrePass.swift`, `ClipyCompositor.swift`, `ExportBackground.swift`, `ANIM_IN_IDS`, `ANIM_IN`, `app.json`, `package.json`, the store's `apply` / `undo` / `redo`.
- **Tests that may be updated, and only as stated:** `src/editor/model/__tests__/textExport.swift.test.ts` (Task 3: the reveal block joins the guard lists; the `allowsGroupOpacity` count 5 → 6), `src/__tests__/textScale.guard.test.ts` (Task 2: `OverlayText.tsx` 6 → 7 in `FIXED_EDITOR`), `src/lib/__tests__/buildInfo.test.ts` (Task 3: the new top row), `src/ui/__tests__/sfSymbols.map.test.ts` (Task 4: two names in `USED`, counts 125 → 127 and 119 → 121, `ANIM_REVEAL` in the tables test).
- Swift: insert only where a task says, copy the module's idioms (explicit closure types, `guard … else { return [] }`, `[Double]` record arrays as in `SteadyRender.swift:35-37`), nothing newer than iOS 16.4. Every Swift change gets a source-reading pin.
- RNTL v14: `render` / `renderHook` / `fireEvent` are async — always `await`.
- **Checks for every task:** `npm.cmd run typecheck`, then `npm.cmd test`. Baseline on this branch (2026-10-14, 8d644d2): typecheck clean; app **428 suites (`npx jest --listTests`) / 6461 tests**, all pass; server **21 suites / 591 tests**. Every task ends with no failure and the app suite count grown by exactly its new files.
- Windows: PowerShell, no `&&`, `npx.cmd` / `npm.cmd`. Never `git stash`. `git add` explicit paths only. Commit trailer exactly `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Task order

`1 → (2 ∥ 3) → 4 → 5 → 6`

| Task | Title | Depends on | Files it owns |
|---|---|---|---|
| 1 | The model: reveal ids, clamps, op, motion guard, `textReveal.ts` | — | `src/editor/model/{types,ops,migrate,motion,textReveal}.ts`, `AnimationTiles.tsx`, one helper in `OverlayAnimationSheet.tsx` |
| 2 | The preview | 1 | `OverlayText.tsx`, `OverlayLayer.tsx`, `textScale.guard.test.ts` |
| 3 | The export: request, Swift, pins, build row | 1 | `modules/clipy-video/**`, `src/lib/buildInfo.ts` (+ tests) |
| 4 | The screen: two tiles, the gate, icons | 1, 3 | `effects.ts`, `OverlayAnimationSheet.tsx`, `sfSymbols.ts` (+ tests) |
| 5 | Independent review, incl. a Swift compile-style read | 1–4 | fixes only |
| 6 | Docs: AGENTS.md line, phone checklist | 5 | `AGENTS.md`, `docs/*.md` |

Tasks 2 and 3 touch disjoint files and may run in parallel after Task 1.

---

## Task 1 — The model

**Files**
- Modify: `src/editor/model/types.ts` (`:144-156` ids and types, `:342-346` `clampOverlayAnimation`)
- Modify: `src/editor/model/ops.ts` (`:78` `copyEdge`, `:1272-1276` `edgesOk`, `:1358-1374` `setOverlayAnimation` / `patchedOverlayAnimation`)
- Modify: `src/editor/model/migrate.ts` (`:26-30` `withMotion`)
- Modify: `src/editor/model/motion.ts` (`:190-201` `edgeDelta`)
- Create: `src/editor/model/textReveal.ts`
- Modify: `src/editor/components/AnimationTiles.tsx` (`:25, :28` — widen the edge type), `src/editor/components/OverlayAnimationSheet.tsx` (the slider's patch only — keeps it compiling)
- Test: create `src/editor/model/__tests__/textReveal.test.ts`, `src/editor/model/__tests__/ops.reveal.test.ts`

**Interfaces**
- Consumes: `edgeDurations(inDur, outDur, length)` (`motion.ts:150`), `clampAnimEdge` (`types.ts:330`), `ANIM_LIMITS`.
- Produces (types.ts): `ANIM_REVEAL_IDS = ["typewriter", "wordByWord"] as const`; `type RevealId`; `isRevealId(id: unknown): id is RevealId`; `interface TextInEdge { id: AnimInId | RevealId; duration: number }`; `OverlayAnimation.in: TextInEdge | null`; `clampTextInEdge(e: unknown, reveal: boolean): TextInEdge | null`; `clampOverlayAnimation(a: unknown, reveal = false): OverlayAnimation`.
- Produces (textReveal.ts): `REVEAL = { stepsPerSecond: 30, maxSteps: 30 }`; `revealUnits(text: string, id: RevealId): number[]`; `interface RevealStep { cut: number; from: number }`; `revealPlan(text: string, id: RevealId, duration: number): RevealStep[]`; `hasReveal(o: Overlay): o is TextOverlay`; `revealDuration(o: TextOverlay): number`; `revealCut(o: TextOverlay, time: number): number | null`; `exportReveal(o: Overlay): { cuts: number[]; from: number[] } | null`.

- [ ] **Step 1: Write the failing tests**

`src/editor/model/__tests__/textReveal.test.ts`:

```ts
import { exportReveal, hasReveal, REVEAL, revealCut, revealDuration, revealPlan, revealUnits } from "../textReveal";
import { makeOverlay, makeSticker, type OverlayAnimation, type TextOverlay } from "../types";

const anim = (inEdge: OverlayAnimation["in"], out: OverlayAnimation["out"] = null): OverlayAnimation => ({ in: inEdge, out, loop: null });
const typing = (p: Partial<TextOverlay> = {}) =>
  makeOverlay({ id: "t", text: "Hello world", start: 1, end: 5, animation: anim({ id: "typewriter", duration: 0.5 }), ...p });

describe("revealUnits: where the shown part ends after each unit (UTF-16), in reading order", () => {
  // [text, Typewriter, Word by word] — computed from the rule in the spec §3 and checked by hand.
  const V: [string, number[], number[]][] = [
    ["Hi you", [1, 3, 4, 5, 6], [3, 6]],                                                  // a space belongs to the unit before it
    ["  Hi\nyou ", [3, 5, 6, 7, 9], [5, 9]],                                              // leading space in every prefix; a newline is space
    ["été", [2, 3, 5], [5]],                                                  // combining accents stay on their letter
    ["\u{1F468}‍\u{1F469}‍\u{1F467}!", [8, 9], [9]],                            // a ZWJ family is one character
    ["\u{1F1EB}\u{1F1F7}\u{1F1E9}\u{1F1EA}\u{1F1EE}", [4, 8, 10], [10]],                  // flags are pairs; a lone indicator is one
    ["\u{1F44D}\u{1F3FD} ok", [5, 6, 7], [5, 7]],                                         // a skin tone stays on its emoji
    ["1️⃣", [3], [3]],                                                          // keycap
    ["سَلام دنیا", [6, 10], [6, 10]],        // Arabic with tashkeel: whole words in both
    ["می‌خواهم بروم", [9, 13], [9, 13]],   // Persian: a ZWNJ is inside the word
    ["שָׁלוֹם", [3, 4, 6, 7], [7]],                    // Hebrew: letter by letter, its points glued
    ["Hi سلام you", [1, 3, 8, 9, 10, 11], [3, 8, 11]],                // mixed: logical order; the Arabic word is one unit
    ["नमस्ते दुनिया", [7, 13], [7, 13]],   // Devanagari: whole words
    ["你好世界", [1, 2, 3, 4], [1, 2, 3, 4]],                             // CJK: each character is a word
    ["日本 go", [1, 3, 4, 5], [1, 3, 5]],
    ["fi", [1, 2], [2]],
    ["   ", [], []],
    ["", [], []],
  ];
  test.each(V)("%j", (text, typewriter, words) => {
    expect(revealUnits(text, "typewriter")).toEqual(typewriter);
    expect(revealUnits(text, "wordByWord")).toEqual(words);
  });
  test("every list ends at the text's length and strictly increases; a cut never splits a surrogate pair", () => {
    for (const [text] of V) for (const id of ["typewriter", "wordByWord"] as const) {
      const cuts = revealUnits(text, id);
      if (cuts.length > 0) expect(cuts[cuts.length - 1]).toBe(text.length);
      cuts.forEach((c, k) => { if (k > 0) expect(c).toBeGreaterThan(cuts[k - 1]); });
      for (const c of cuts) if (c < text.length) expect(text.charCodeAt(c) >= 0xdc00 && text.charCodeAt(c) <= 0xdfff).toBe(false);
    }
  });
});

describe("revealPlan", () => {
  test("one step per unit while the duration allows 30 a second; the first at 0, the last the whole text", () => {
    const p = revealPlan("Hello world", "typewriter", 0.5);
    expect(p.map((s) => s.cut)).toEqual([1, 2, 3, 4, 6, 7, 8, 9, 10, 11]);
    p.forEach((s, j) => expect(s.from).toBeCloseTo(0.05 * j, 12));
  });
  test("a short duration groups units: never more than duration × 30 steps", () => {
    const p = revealPlan("Hello world", "typewriter", 0.2);
    expect(p.map((s) => s.cut)).toEqual([2, 4, 6, 8, 10, 11]);
    expect(revealPlan("Hello world", "typewriter", 0.15)).toHaveLength(5);   // ceil(0.15 × 30 = 4.5) = 5 steps for 10 units
  });
  test("never more than REVEAL.maxSteps", () => {
    const p = revealPlan("x".repeat(100), "typewriter", 2);
    expect(p).toHaveLength(REVEAL.maxSteps);
    expect(p[0]).toEqual({ cut: 4, from: 0 });
    expect(p[p.length - 1].cut).toBe(100);
  });
  test("Word by word", () => {
    expect(revealPlan("Hello world", "wordByWord", 0.5)).toEqual([{ cut: 6, from: 0 }, { cut: 11, from: 0.25 }]);
  });
  test("nothing visible, no length, or not a number: no plan", () => {
    expect(revealPlan("   ", "typewriter", 1)).toEqual([]);
    expect(revealPlan("Hi", "typewriter", 0)).toEqual([]);
    expect(revealPlan("Hi", "typewriter", Number.NaN)).toEqual([]);
    expect(revealPlan("Hi", "typewriter", 0.01)).toEqual([{ cut: 2, from: 0 }]);   // one step: drawn whole
  });
});

describe("a text's reveal at a time", () => {
  test("hasReveal: a text whose In is a reveal id — never a caption or a sticker", () => {
    expect(hasReveal(typing())).toBe(true);
    expect(hasReveal(typing({ animation: anim({ id: "fade", duration: 0.5 }) }))).toBe(false);
    expect(hasReveal(typing({ kind: "caption" }))).toBe(false);
    expect(hasReveal(makeSticker({ id: "s" }))).toBe(false);
  });
  test("the duration is the In's as the export receives it (scaled with the Out to fit the life)", () => {
    expect(revealDuration(typing())).toBe(0.5);
    expect(revealDuration(typing({ end: 1.6, animation: anim({ id: "typewriter", duration: 0.5 }, { id: "fade", duration: 0.5 }) }))).toBeCloseTo(0.3, 12);
  });
  test("the cut of the step the time is in; null once the whole text shows (drawn exactly as without a reveal)", () => {
    const o = typing();
    expect(revealCut(o, 1)).toBe(1);        // the first letter on the text's first frame
    expect(revealCut(o, 1.07)).toBe(2);
    expect(revealCut(o, 1.27)).toBe(7);     // "Hello " + "w"
    expect(revealCut(o, 1.47)).toBeNull();  // the last step
    expect(revealCut(o, 3)).toBeNull();
    expect(revealCut(o, 0.5)).toBe(1);      // before the start: the first step (the layer never draws it)
  });
  test("no reveal, one step, or a caption: null", () => {
    expect(revealCut(typing({ animation: anim({ id: "pop", duration: 0.5 }) }), 1.1)).toBeNull();
    expect(revealCut(typing({ text: "Hi", animation: anim({ id: "wordByWord", duration: 0.5 }) }), 1.1)).toBeNull();
    expect(revealCut(typing({ kind: "caption" }), 1.1)).toBeNull();
  });
  test("exportReveal: the plan as two lists, or null when there is nothing to reveal", () => {
    expect(exportReveal(typing({ text: "Hi you", animation: anim({ id: "wordByWord", duration: 0.5 }) }))).toEqual({ cuts: [3, 6], from: [0, 0.25] });
    expect(exportReveal(typing({ animation: anim({ id: "fade", duration: 0.5 }) }))).toBeNull();
    expect(exportReveal(typing({ text: "Hi", animation: anim({ id: "wordByWord", duration: 0.5 }) }))).toBeNull();
    expect(exportReveal(makeSticker({ id: "s" }))).toBeNull();
  });
});
```

`src/editor/model/__tests__/ops.reveal.test.ts`:

```ts
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
import { migrateProject } from "../migrate";
import { resolveOverlayMotion } from "../motion";
import { setOverlayAnimation } from "../ops";
import { ANIM_IN_IDS, ANIM_LIMITS, ANIM_REVEAL_IDS, clampOverlayAnimation, isRevealId, makeClip, makeOverlay, makeProject, makeSticker, type Project } from "../types";

const base = makeProject({ clips: [makeClip({ id: "a", sourceDuration: 8 })],
  overlays: [makeOverlay({ id: "t" }), makeSticker({ id: "s" }), makeOverlay({ id: "c", kind: "caption" })] });
const ov = (p: Project, id: string) => p.overlays.find((o) => o.id === id)!;
const tw = { id: "typewriter" as const, duration: 0.5 };

test("the reveal ids are their own list; the ten In ids are untouched", () => {
  expect(ANIM_REVEAL_IDS).toEqual(["typewriter", "wordByWord"]);
  expect(ANIM_IN_IDS).toHaveLength(10);
  expect(isRevealId("typewriter")).toBe(true);
  expect(isRevealId("fade")).toBe(false);
  expect(isRevealId(undefined)).toBe(false);
});

test("setOverlayAnimation: a text's In may be a reveal (duration clamped); one op, one project", () => {
  const p = setOverlayAnimation(base, "t", { in: { id: "wordByWord", duration: 9 } });
  expect(ov(p, "t").animation).toEqual({ in: { id: "wordByWord", duration: ANIM_LIMITS.maxDuration }, out: null, loop: null });
  expect(ov(setOverlayAnimation(p, "t", { in: { id: "pop", duration: 0.4 } }), "t").animation.in).toEqual({ id: "pop", duration: 0.4 });   // exclusive: it replaces
});

test("refused: a reveal on a sticker, a caption or an Out; a reveal with a duration that is not a number", () => {
  expect(setOverlayAnimation(base, "s", { in: tw })).toBe(base);
  expect(setOverlayAnimation(base, "c", { in: tw })).toBe(base);
  expect(setOverlayAnimation(base, "t", { out: tw as never })).toBe(base);
  expect(setOverlayAnimation(base, "t", { in: { id: "typewriter", duration: Number.NaN } })).toBe(base);
});

test("the sanity pass keeps a text's reveal and drops it anywhere else", () => {
  expect(clampOverlayAnimation({ in: tw, out: null, loop: null }, true).in).toEqual(tw);
  expect(clampOverlayAnimation({ in: tw, out: null, loop: null }).in).toBeNull();
  expect(clampOverlayAnimation({ in: null, out: tw, loop: null }, true).out).toBeNull();
  const raw = JSON.parse(JSON.stringify({ ...base, overlays: [
    { ...ov(base, "t"), animation: { in: tw, out: null, loop: "wiggle" } },
    { ...ov(base, "s"), animation: { in: tw, out: null, loop: null } },
    { ...ov(base, "c"), animation: { in: tw, out: null, loop: null } },
  ] }));
  const m = migrateProject(raw);
  expect(ov(m, "t").animation).toEqual({ in: tw, out: null, loop: "wiggle" });
  expect(ov(m, "s").animation.in).toBeNull();
  expect(ov(m, "c").animation.in).toBeNull();
});

test("a reveal moves nothing: the whole-text motion is the identity during it", () => {
  const o = makeOverlay({ id: "t", x: 0.3, y: 0.6, start: 1, end: 4, animation: { in: tw, out: null, loop: null } });
  expect(resolveOverlayMotion(o, 1.1)).toEqual({ x: 0.3, y: 0.6, scale: 1, rotation: 0, opacity: 1 });
});
```

- [ ] **Step 2: Run them and see them fail** — `npx.cmd jest src/editor/model/__tests__/textReveal.test.ts src/editor/model/__tests__/ops.reveal.test.ts` → FAIL (module `../textReveal` not found; `ANIM_REVEAL_IDS` not exported).

- [ ] **Step 3: types.ts.** After `ANIM_LIMITS` (`:150`) add, and change `OverlayAnimation`:

```ts
/** Text reveals: a TEXT's In may also be one of these (never an Out, a clip, a sticker or a caption). The timing is model/textReveal.ts. */
export const ANIM_REVEAL_IDS = ["typewriter", "wordByWord"] as const;
export type RevealId = (typeof ANIM_REVEAL_IDS)[number];
export const isRevealId = (id: unknown): id is RevealId => (ANIM_REVEAL_IDS as readonly unknown[]).includes(id);
```

```ts
export interface AnimEdge { id: AnimInId; duration: number }
/** A text's / sticker's In: a whole-text animation, or (a text only — the clamp and `setOverlayAnimation` see to it) a reveal. */
export interface TextInEdge { id: AnimInId | RevealId; duration: number }
export interface ClipAnimation { in: AnimEdge | null; out: AnimEdge | null; combo: AnimComboId | null }      // combo set ⇒ in and out are null
export interface OverlayAnimation { in: TextInEdge | null; out: AnimEdge | null; loop: AnimLoopId | null }
```

Replace `clampOverlayAnimation` (`:342-346`) with:

```ts
/** A text's In (`reveal` true: the overlay is a `kind: "text"`) may be a reveal, its duration clamped like any edge; otherwise as `clampAnimEdge`. */
export function clampTextInEdge(e: unknown, reveal: boolean): TextInEdge | null {
  if (!reveal || !isRec(e) || !isRevealId(e.id)) return clampAnimEdge(e);
  const duration = isNum(e.duration) ? clampNum(e.duration, ANIM_LIMITS.minDuration, ANIM_LIMITS.maxDuration) : ANIM_LIMITS.defaultDuration;
  return { id: e.id, duration };
}
/** `reveal`: the overlay is a text, so its In may keep a reveal id. An Out never does. */
export function clampOverlayAnimation(a: unknown, reveal = false): OverlayAnimation {
  if (!isRec(a)) return { ...NO_OVERLAY_ANIMATION };
  const loop = (ANIM_LOOP_IDS as readonly unknown[]).includes(a.loop) ? (a.loop as AnimLoopId) : null;
  return { in: clampTextInEdge(a.in, reveal), out: clampAnimEdge(a.out), loop };
}
```

- [ ] **Step 4: migrate.ts** `withMotion` (`:29`): `animation: clampOverlayAnimation(o.animation, o.kind === "text")`. Nothing else in migrate.ts changes.

- [ ] **Step 5: ops.ts.** Import `isRevealId` and `type TextInEdge`. `:78` becomes generic (a split clip / copied overlay keeps its edge's own type):

```ts
const copyEdge = <E extends { duration: number }>(e: E | null): E | null => (e ? { ...e } : null);
```

`edgesOk` (`:1274-1276`):

```ts
/** A patch's edges are usable: each is absent, null, or a known id with a finite duration. `reveal`: a text's In may be a reveal id. */
function edgesOk(patch: { in?: TextInEdge | null; out?: AnimEdge | null }, reveal = false): boolean {
  return EDGES.every((k) => {
    const e = patch[k];
    if (e == null) return true;
    return Number.isFinite(e.duration) && (clampAnimEdge(e) !== null || (k === "in" && reveal && isRevealId(e.id)));
  });
}
```

`setOverlayAnimation` / `patchedOverlayAnimation` (`:1358-1374`): pass `cur.kind === "text"` as `reveal` to `patchedOverlayAnimation(cur.animation, patch, reveal)`, which calls `edgesOk(patch, reveal)` and returns `clampOverlayAnimation(next, reveal)`. `setClipAnimation`'s call of `edgesOk` is unchanged (its default `false`).

- [ ] **Step 6: motion.ts** `edgeDelta` (`:190-201`): import `isRevealId, type RevealId` from `./types`, widen `type Edge = { id: AnimInId | RevealId; duration: number } | null;`, and guard both calls:

```ts
  // A reveal (Typewriter / Word by word) moves nothing: textReveal.ts decides what shows. The export is never sent one as an edge,
  // and Motion.swift's `animInDelta` answers the identity for an id it does not know — the pair stays identical in meaning.
  if (inEdge && !isRevealId(inEdge.id) && e.in > 0 && local < e.in) d = compose(d, animInDelta(inEdge.id, local / e.in, distance));
  if (outEdge && !isRevealId(outEdge.id) && e.out > 0 && local > length - e.out) d = compose(d, animOutDelta(outEdge.id, (local - (length - e.out)) / e.out, distance));
```

No other line of motion.ts changes (`MOTION`, `animInDelta`, the vectors are the mirrored pair's).

- [ ] **Step 7: Create `src/editor/model/textReveal.ts`** (exactly this):

```ts
import { edgeDurations } from "./motion";
import { isRevealId, type Overlay, type RevealId, type TextOverlay } from "./types";

/**
 * Text reveals (Typewriter / Word by word): which part of a text shows at a time. TypeScript ONLY — the export is sent the result
 * (`exportReveal`), never the rule, so nothing here is mirrored in Swift. Offsets are UTF-16 (a JS string's, and NSAttributedString's).
 * The shown part is always a PREFIX in logical (reading) order; the rest is laid out but invisible (spec section 3).
 * `stepsPerSecond` / `maxSteps` bound how many states a reveal has: the export draws one set of layers per state. Tuning them needs no build.
 */
export const REVEAL = { stepsPerSecond: 30, maxSteps: 30 } as const;

type Range = readonly [number, number];
const within = (p: number, ranges: readonly Range[]): boolean => ranges.some(([lo, hi]) => p >= lo && p <= hi);
/** White space: never a unit; the next character begins a new word. */
const SPACE: readonly Range[] = [[0x09, 0x0d], [0x20, 0x20], [0x85, 0x85], [0xa0, 0xa0], [0x1680, 0x1680], [0x2000, 0x200a], [0x2028, 0x2029], [0x202f, 0x202f], [0x205f, 0x205f], [0x3000, 0x3000]];
/** Invisible marks (soft hyphen, ALM, Mongolian VS, ZWSP, ZWNJ, LRM / RLM, embeddings, word joiner…, isolates, BOM): glued to what is before. */
const INVISIBLE: readonly Range[] = [[0xad, 0xad], [0x61c, 0x61c], [0x180e, 0x180e], [0x200b, 0x200c], [0x200e, 0x200f], [0x202a, 0x202e], [0x2060, 0x2064], [0x2066, 0x2069], [0xfeff, 0xfeff]];
/** The zero-width joiner: glued, and so is the code point after it. */
const JOINER = 0x200d;
/** Combining marks and emoji modifiers: glued to the character before (accents, Hebrew points, tashkeel, keycap, variation selectors, skin tones, tags). */
const MARK: readonly Range[] = [
  [0x0300, 0x036f], [0x0483, 0x0489], [0x0591, 0x05c7], [0x0610, 0x061a], [0x064b, 0x065f], [0x0670, 0x0670], [0x06d6, 0x06dc], [0x06df, 0x06e4],
  [0x06e7, 0x06e8], [0x06ea, 0x06ed], [0x08d3, 0x08ff], [0x1ab0, 0x1aff], [0x1dc0, 0x1dff], [0x20d0, 0x20ff], [0x3099, 0x309a], [0xfe00, 0xfe0f],
  [0xfe20, 0xfe2f], [0x1f3fb, 0x1f3ff], [0xe0020, 0xe007f], [0xe0100, 0xe01ef],
];
/** Regional indicators: two make a flag. */
const REGIONAL: readonly Range[] = [[0x1f1e6, 0x1f1ff]];
/**
 * Scripts whose letters change shape with their neighbours (Arabic incl. Persian / Urdu, Syriac, Thaana, NKo, Mandaic, the Indic blocks,
 * Thai, Lao, Tibetan, Myanmar, Khmer, Mongolian, conjoining Hangul jamo, Balinese and neighbours, Arabic presentation forms): Typewriter
 * reveals a word holding one of them WHOLE, so a colour boundary never falls inside a joined word.
 */
const JOINED: readonly Range[] = [
  [0x0600, 0x08ff], [0x0900, 0x0dff], [0x0e00, 0x0eff], [0x0f00, 0x0fff], [0x1000, 0x109f], [0x1100, 0x11ff], [0x1780, 0x18af],
  [0x1b00, 0x1b7f], [0xa960, 0xa97f], [0xa980, 0xa9ff], [0xaa60, 0xaa7f], [0xd7b0, 0xd7ff], [0xfb50, 0xfdff], [0xfe70, 0xfefe],
];
/** CJK (radicals, punctuation, kana, bopomofo, ideographs, compatibility ideographs, fullwidth forms): each character is its own word. */
const CJK: readonly Range[] = [
  [0x2e80, 0x2fdf], [0x3001, 0x30ff], [0x3100, 0x312f], [0x31a0, 0x31ff], [0x3400, 0x4dbf], [0x4e00, 0x9fff], [0xf900, 0xfaff], [0xff00, 0xffef], [0x20000, 0x3134f],
];

interface Cluster { start: number; joined: boolean; cjk: boolean; spaced: boolean; regional: number }

/** What the eye calls one character each, with where it starts and whether white space came before it. */
function clustersOf(text: string): Cluster[] {
  const out: Cluster[] = [];
  let spaced = false;
  let glued = false;
  for (let i = 0; i < text.length;) {
    const p = text.codePointAt(i) ?? 0;
    const at = i;
    i += p > 0xffff ? 2 : 1;
    const cur = out.length > 0 ? out[out.length - 1] : null;
    if (within(p, SPACE)) { spaced = true; glued = false; continue; }
    if (glued) { glued = p === JOINER; continue; }
    if (p === JOINER) { glued = cur !== null && !spaced; continue; }
    if (within(p, INVISIBLE) || within(p, MARK)) continue;
    const regional = within(p, REGIONAL);
    if (regional && cur !== null && !spaced && cur.regional === 1) { cur.regional = 2; continue; }
    out.push({ start: at, joined: within(p, JOINED), cjk: within(p, CJK), spaced: spaced || cur === null, regional: regional ? 1 : 0 });
    spaced = false;
  }
  return out;
}

/** Where the shown part ends after each unit, ascending; the last is `text.length`. `[]` when nothing would be seen. */
export function revealUnits(text: string, id: RevealId): number[] {
  const s = typeof text === "string" ? text : "";
  const words: Cluster[][] = [];
  clustersOf(s).forEach((c, k, all) => {
    const prev = k > 0 ? all[k - 1] : null;
    if (prev === null || c.spaced || c.cjk || prev.cjk) words.push([c]); else words[words.length - 1].push(c);
  });
  const starts: number[] = [];
  for (const w of words) {
    if (id === "wordByWord" || w.some((c) => c.joined)) starts.push(w[0].start);
    else for (const c of w) starts.push(c.start);
  }
  return starts.map((_, k) => (k + 1 < starts.length ? starts[k + 1] : s.length));
}

export interface RevealStep { cut: number; from: number }
/**
 * The states of a reveal lasting `duration` seconds: step j (1 … m) shows the text before `cut` from `from` seconds after the text's
 * start. The first starts at 0, the last is the whole text and holds to the end. `m` = the units, at most `duration × stepsPerSecond`
 * and `maxSteps` (units are then shown several at a time). Fewer than two steps = no reveal (the caller draws the text whole).
 */
export function revealPlan(text: string, id: RevealId, duration: number): RevealStep[] {
  const cuts = revealUnits(text, id);
  const n = cuts.length;
  if (n === 0 || !Number.isFinite(duration) || !(duration > 0)) return [];
  const m = Math.max(1, Math.min(n, REVEAL.maxSteps, Math.ceil(duration * REVEAL.stepsPerSecond - 1e-9)));
  const steps: RevealStep[] = [];
  for (let j = 1; j <= m; j++) steps.push({ cut: cuts[Math.ceil((j * n) / m) - 1], from: (duration * (j - 1)) / m });
  return steps;
}

/** A text (never a caption or a sticker) whose In is a reveal. */
export const hasReveal = (o: Overlay): o is TextOverlay => o.kind === "text" && o.animation.in !== null && isRevealId(o.animation.in.id);
/** The reveal's length as the export receives it: the In scaled with the Out to fit the text's life (`edgeDurations`). */
export const revealDuration = (o: TextOverlay): number =>
  edgeDurations(o.animation.in?.duration ?? 0, o.animation.out?.duration ?? 0, o.end - o.start).in;

function planOf(o: Overlay): RevealStep[] {
  if (!hasReveal(o)) return [];
  const id = o.animation.in?.id;
  return id !== undefined && isRevealId(id) ? revealPlan(o.text, id, revealDuration(o)) : [];
}

/** The preview: where the shown part ends at project time `time` — null = draw the whole text (no reveal, one step, or the last step reached). */
export function revealCut(o: TextOverlay, time: number): number | null {
  const plan = planOf(o);
  if (plan.length < 2) return null;
  const local = Number.isFinite(time) ? Math.max(0, time - o.start) : 0;
  let cut = plan[0].cut;
  for (const s of plan) { if (s.from <= local) cut = s.cut; else break; }
  return cut >= o.text.length ? null : cut;
}

/** The export: the plan as the request's `reveal` key, or null (no key) when the text has no reveal of two steps or more. */
export function exportReveal(o: Overlay): { cuts: number[]; from: number[] } | null {
  const plan = planOf(o);
  return plan.length < 2 ? null : { cuts: plan.map((s) => s.cut), from: plan.map((s) => s.from) };
}
```

- [ ] **Step 8: Keep the screen compiling (no behaviour change).** `AnimationTiles.tsx:25, 28`: the edge parameter types become `{ duration: number } | null` (drop the `AnimEdge` import if unused). In `OverlayAnimationSheet.tsx`, replace the slider's `onChange` with a patch built per tab, and add above the component:

```ts
/** The Length slider's patch: the open tab's edge with a new length; null while that edge is None. */
function lengthPatch(a: OverlayAnimation, tab: "in" | "out", v: number): Partial<OverlayAnimation> | null {
  if (tab === "in") return a.in ? { in: { id: a.in.id, duration: v } } : null;
  return a.out ? { out: { id: a.out.id, duration: v } } : null;
}
```

```tsx
onChange={(v) => { const patch = lengthPatch(anim, tab, v); if (patch) applyTransient((p) => setOverlayAnimation(p, overlay.id, patch)); }} />
```

(import `type OverlayAnimation`, `isRevealId`, `type RevealId`). Until Task 4 the In row cannot set a reveal, so keep its tiles typed on the ten: `selected={edge === null || isRevealId(edge.id) ? null : edge.id}` on the In / Out `AnimationTiles`, and `animationStartX<AnimInId | RevealId>(ANIM_IN_IDS, a[tab]?.id ?? null)` in the `useMemo`. If `typecheck` names any other line, the fix is a type widening only — never a behaviour change; list it in the commit message.

- [ ] **Step 9: Run** the two new files → PASS; then `npm.cmd run typecheck`, `npm.cmd test` → all pass, app suites +2.

- [ ] **Step 10: Commit** `feat(text-reveal): the model — reveal ids for a text's In, the plan in textReveal.ts` with `git add` of the files above.

---

## Task 2 — The preview

**Files**
- Modify: `src/editor/components/OverlayText.tsx` (`:9-11` props doc, `:38-56` the layers' children)
- Modify: `src/editor/components/OverlayLayer.tsx` (`:42` the `time` line)
- Modify: `src/__tests__/textScale.guard.test.ts` (`:30` `OverlayText.tsx` 6 → 7)
- Test: modify `src/editor/__tests__/OverlayText.test.tsx` (append one `describe`)

**Interfaces**
- Consumes: `revealCut(o, time)`, `hasReveal(o)` (Task 1).
- Produces: `OverlayText`'s `time` prop now also drives a text's reveal; no new prop.

- [ ] **Step 1: Failing tests** — append to `src/editor/__tests__/OverlayText.test.tsx`:

```tsx
describe("text reveal", () => {
  const UNREVEALED = { color: "transparent", textShadowColor: "transparent" };
  const typing = (p: Partial<TextOverlay> = {}) =>
    text({ text: "Hello world", start: 1, end: 5, animation: { in: { id: "typewriter", duration: 0.5 }, out: null, loop: null }, ...p });
  const fill = () => screen.getByText("Hello world");

  test("the fill is the shown part, then ONE see-through span holding the rest; its own style is the plain one", async () => {
    await show(typing(), { time: 1.07 });
    const kids = fill().props.children as unknown[];
    expect(kids).toHaveLength(2);
    expect(kids[0]).toBe("He");
    expect(flat(within(fill()).getByText("llo world"))).toEqual(UNREVEALED);
    expect(flat(fill())).toEqual({ fontFamily: FAMILY, fontSize: 40, lineHeight: 48, color: WHITE, textAlign: "center" });
  });

  test("every under-layer (glow, shadow, outline) hides the same part, so no ghost of a hidden letter shows", async () => {
    await show(typing({ outline: true, style: style({ glow: GLOW, shadow: SHADOW }) }), { time: 1.27 });
    for (const id of layerIds) {
      const layer = screen.getByTestId(id, hidden);
      expect((layer.props.children as unknown[])[0]).toBe("Hello w");
      expect(flat(within(layer).getByText("orld", hidden))).toEqual(UNREVEALED);
    }
  });

  test("an outline riding on the fill: the hidden span's shadow colour replaces the halo's", async () => {
    await show(typing({ outline: true }), { time: 1.07 });
    expect(flat(fill()).textShadowRadius).toBeGreaterThan(0);
    expect(flat(within(fill()).getByText("llo world")).textShadowColor).toBe("transparent");
  });

  test("the last step, no time, the frame copy and a whole-text In draw the plain string", async () => {
    const view = await show(typing(), { time: 1.47 });
    expect(fill().props.children).toBe("Hello world");
    await view.rerender(<OverlayText overlay={typing()} frameW={W} frameH={H} />);
    expect(fill().props.children).toBe("Hello world");
    await view.rerender(<OverlayText overlay={typing({ animation: { in: { id: "pop", duration: 0.5 }, out: null, loop: null } })} frameW={W} frameH={H} time={1.07} />);
    expect(fill().props.children).toBe("Hello world");
    await view.rerender(<OverlayText overlay={typing()} frameW={W} frameH={H} frameOnly time={1.07} />);
    expect(screen.getByText("Hello world", hidden).props.children).toBe("Hello world");
  });

  test("in the overlay layer: the playhead drives it", async () => {
    useEditorStore.getState().reset();
    useEditorStore.getState().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 10 })], overlays: [typing()] }));
    useEditorStore.getState().seek(1.07);
    await render(<OverlayLayer frameW={W} frameH={H} onOpenPanel={() => {}} />);
    expect((fill().props.children as unknown[])[0]).toBe("He");
  });
});
```

- [ ] **Step 2: Run** `npx.cmd jest src/editor/__tests__/OverlayText.test.tsx` → the new block FAILS (children are the plain string).

- [ ] **Step 3: OverlayText.tsx.** Import `revealCut` from `@/src/editor/model/textReveal`. Props doc: "`time`: the project time, for a caption's word highlight and a text's reveal (left out = none)". After `const plain = …` (`:39`):

```tsx
  // A text revealing itself (Typewriter / Word by word): every layer draws the whole string — the shown part, then the rest in a
  // see-through span — so the wrapping and the box are final from the first frame. Captions never reveal (`revealCut` is null for them).
  const cut = frameOnly || time === undefined ? null : revealCut(o, time);
  const drawn = revealed(plain, cut);
```

In the glow, shadow and outline `KitText`s replace `{plain}` with `{drawn}`; the fill becomes `{spans ?? drawn}`; the `frameOnly` copy keeps `{plain}`. Below `wordSpans` add:

```tsx
/** What a reveal hides is laid out but never seen: no fill, and no glow, shadow or outline halo (a nested span's shadow colour replaces its parent's). */
const UNREVEALED = { color: "transparent", textShadowColor: "transparent" } as const;
/** A layer's string while a text reveals itself: the shown part, then the rest see-through. `cut` null: the whole string, as without a reveal. */
function revealed(text: string, cut: number | null): React.ReactNode {
  if (cut === null) return text;
  return [text.slice(0, cut), <KitText scale="fixed" key="unrevealed" style={UNREVEALED}>{text.slice(cut)}</KitText>];
}
```

Update the header comment's "Every layer draws the same string (`plain`)" to "the same string (`plain`, or `drawn` while a text reveals itself)".

- [ ] **Step 4: OverlayLayer.tsx** `:42`:

```ts
        const time = (o.kind === "caption" && o.words.length > 0 && o.highlightColor) || hasReveal(o) ? playhead : undefined;
```

(import `hasReveal` from `@/src/editor/model/textReveal`).

- [ ] **Step 5: textScale.guard.test.ts** `:30`: `"src/editor/components/OverlayText.tsx": 7` (the see-through span — on the video, so fixed).

- [ ] **Step 6: Run** the file → PASS; `npm.cmd run typecheck`; `npm.cmd test` → all pass (no new suite).

- [ ] **Step 7: Commit** `feat(text-reveal): the preview draws the shown part and a see-through rest in every layer`.

---

## Task 3 — The export: request, Swift, pins, build row

**Files**
- Modify: `modules/clipy-video/index.ts` (`:16-17` types, `:39-48` `ExportOverlay`, `:143-170` `overlayMotion` / `toExportOverlay`, `:288` area: re-export)
- Create: `modules/clipy-video/reveal.ts`
- Create: `modules/clipy-video/ios/TextReveal.swift`, `modules/clipy-video/ios/Tests/TextRevealTests.swift`
- Modify: `modules/clipy-video/ios/ExportSession.swift` (after `:92` the record; `:234` the field; after `:739` the block)
- Modify: `modules/clipy-video/ios/ClipyVideoModule.swift` (after `:646`, before the closing `}` of `definition()`)
- Modify: `src/lib/buildInfo.ts` (`:1-2` imports, `:10-19` `LEVELS`, after `:45` `REVEAL_TOOLS`)
- Test: create `src/editor/model/__tests__/textReveal.swift.test.ts`; modify `modules/clipy-video/__tests__/index.test.ts` (append), `src/editor/model/__tests__/textExport.swift.test.ts` (`:106-127`), `src/lib/__tests__/buildInfo.test.ts`

**Interfaces**
- Consumes: `exportReveal(o)` (Task 1); `ExportSession.overlayLayer`'s local `key(_:)` (`:656`), `textCopy(_:)` (`:691-700`), `addVisibility(_:start:end:opacity:)` (`:779-790`).
- Produces (TS): `interface ExportReveal { cuts: number[]; from: number[] }`; `ExportOverlay.reveal?: ExportReveal`; `isTextRevealBuild(): boolean`, `revealNeedsBuild(): boolean` (`modules/clipy-video/reveal.ts`, re-exported by index.ts); `REVEAL_TOOLS: string`.
- Produces (Swift): `struct ExportReveal: Record { cuts: [Double]; from: [Double] }`; `ExportOverlay.reveal: ExportReveal?`; `enum TextReveal { static func steps(cuts: [Double], from: [Double], length: Int, life: Double) -> [(cut: Int, from: Double, to: Double)] }`; `Function("textReveal") { () -> Bool }`.

- [ ] **Step 1: Failing tests.** Append to `modules/clipy-video/__tests__/index.test.ts` (inside or after `describe("toExportOverlay"`; it already imports `makeOverlay`):

```ts
describe("toExportOverlay: a text's reveal", () => {
  const revealing = (id: "typewriter" | "wordByWord", text = "Hi you") =>
    makeOverlay({ id: "o", text, start: 0, end: 3, animation: { in: { id, duration: 0.5 }, out: { id: "fade", duration: 0.5 }, loop: null } });
  test("travels as its own key with NO In, so an older build shows the text whole", () => {
    const e = toExportOverlay(revealing("wordByWord"));
    expect(e.animIn).toBeNull();
    expect(e.animOut).toEqual({ id: "fade", duration: 0.5 });
    expect(e.reveal).toEqual({ cuts: [3, 6], from: [0, 0.25] });
  });
  test("every other text, a one-step reveal and a sticker have no `reveal` key at all", () => {
    expect("reveal" in toExportOverlay(makeOverlay({ id: "p" }))).toBe(false);
    expect("reveal" in toExportOverlay(makeOverlay({ id: "q", animation: { in: { id: "pop", duration: 0.5 }, out: null, loop: null } }))).toBe(false);
    const one = toExportOverlay(revealing("wordByWord", "Hi"));
    expect("reveal" in one).toBe(false);
    expect(one.animIn).toBeNull();
    expect("reveal" in toExportOverlay(makeSticker({ id: "s" }))).toBe(false);
  });
});
```

`src/editor/model/__tests__/textReveal.swift.test.ts`:

```ts
import { readFileSync } from "fs";
import { join } from "path";

/** The reveal in the export is never compiled here: these checks read the Swift source (spec section 5). */
const root = join(__dirname, "../../../..");
const iosDir = join(root, "modules/clipy-video/ios");
const read = (file: string) => readFileSync(join(iosDir, file), "utf8").replace(/\r\n/g, "\n");
const code = (source: string) => source.replace(/\/\/[^\n]*/g, "");
const between = (source: string, from: string, to: string): string => {
  const start = source.indexOf(from);
  if (start < 0) throw new Error(`"${from}" not found`);
  const end = source.indexOf(to, start + from.length);
  return source.slice(start, end < 0 ? undefined : end);
};
const session = code(read("ExportSession.swift"));
const reveal = code(read("TextReveal.swift"));
const layer = between(session, "static func overlayLayer(", "\n  }\n");
const block = between(layer, 'if o.kind == "text", let reveal = o.reveal {', "\n    }\n");

test("TextReveal.swift is pure: Foundation only, no layers, the one function", () => {
  expect([...read("TextReveal.swift").matchAll(/^import (\w+)/gm)].map((m) => m[1])).toEqual(["Foundation"]);
  expect(reveal).not.toMatch(/CALayer|CATextLayer|UIKit|ExportOverlay|NSAttributedString/);
  expect(reveal).toContain("static func steps(cuts: [Double], from: [Double], length: Int, life: Double) -> [(cut: Int, from: Double, to: Double)]");
  for (const line of [
    "guard cuts.count >= 2, cuts.count == from.count, length > 0, life.isFinite, life > 0 else { return [] }",
    "guard c.isFinite, c == c.rounded(), c > Double(lastCut), c <= Double(length) else { return [] }",
    "guard t.isFinite, t > lastFrom, t < life else { return [] }",
    "if i == 0 && t != 0 { return [] }",
    "guard lastCut == length else { return [] }",
    "for i in 0..<(out.count - 1) { out[i].to = out[i + 1].from }",
  ]) expect(reveal).toContain(line);
});

test("the request: ExportReveal is two Double lists, and ExportOverlay carries it as an optional", () => {
  const record = between(session, "struct ExportReveal: Record {", "\n}");
  expect([...record.matchAll(/@Field var (\w+): \[Double\] = \[\]/g)].map((m) => m[1])).toEqual(["cuts", "from"]);
  expect(between(session, "struct ExportOverlay: Record {", "\n}")).toMatch(/@Field var reveal: ExportReveal\?/);
});

test("the block: after the shadow, before the caption highlight; a text only; checked by TextReveal", () => {
  expect(layer.indexOf("if let shadow = l.shadow")).toBeLessThan(layer.indexOf("let reveal = o.reveal"));
  expect(layer.indexOf("let reveal = o.reveal")).toBeLessThan(layer.indexOf('if o.kind == "caption"'));
  expect(block).toContain("let steps = TextReveal.steps(cuts: reveal.cuts, from: reveal.from, length: (o.text as NSString).length, life: o.end - o.start)");
  expect(block).toContain("if steps.count >= 2 {");
  expect(block.split("container.allowsGroupOpacity = true")).toHaveLength(2);
});

test("every text layer (glow, shadow, fill) is copied per step but the last, its hidden range clear in fill AND stroke", () => {
  for (const line of [
    "let passes: [CATextLayer] = (container.sublayers ?? []).compactMap { (layer: CALayer) -> CATextLayer? in layer as? CATextLayer }",
    "let clear = UIColor.clear.cgColor",
    "for i in 0..<(steps.count - 1) {",
    "guard let full = pass.string as? NSAttributedString else { continue }",
    "let part = NSMutableAttributedString(attributedString: full)",
    "let rest = NSRange(location: step.cut, length: part.length - step.cut)",
    "part.addAttribute(key(kCTForegroundColorAttributeName), value: clear, range: rest)",
    "part.addAttribute(key(kCTStrokeColorAttributeName), value: clear, range: rest)",
    "let shown = textCopy(part)",
    "shown.shadowColor = pass.shadowColor", "shown.shadowOpacity = pass.shadowOpacity",
    "shown.shadowRadius = pass.shadowRadius", "shown.shadowOffset = pass.shadowOffset",
    "container.addSublayer(shown)",
    "addVisibility(shown, start: o.start + step.from, end: o.start + step.to, opacity: Double(pass.opacity))",
    "let last = steps[steps.count - 1]",
    "for pass in passes { addVisibility(pass, start: o.start + last.from, end: o.end, opacity: Double(pass.opacity)) }",
  ]) expect(block).toContain(line);
  // Copies are made only by the one helper; nothing is removed or re-ordered.
  expect(layer.match(/CATextLayer\(\)/g)).toHaveLength(1);
  expect(block).not.toMatch(/removeFromSuperlayer|insertSublayer|\.mask/);
});

test("the build: a marker function the app asks for, and its wrapper", () => {
  const moduleSwift = code(read("ClipyVideoModule.swift"));
  expect(between(moduleSwift, 'Function("textReveal") { () -> Bool in', "\n    }\n")).toContain("return true");
  const wrapper = readFileSync(join(root, "modules/clipy-video/reveal.ts"), "utf8");
  expect(wrapper).toContain('export function isTextRevealBuild(): boolean { return typeof optional()?.textReveal === "function"; }');
  expect(readFileSync(join(root, "modules/clipy-video/index.ts"), "utf8")).toContain('export * from "./reveal";');
});

test("the XCTests exist", () => {
  const tests = read("Tests/TextRevealTests.swift");
  for (const name of ["testStepsEndWhereTheNextBegins", "testAnythingOddIsNoReveal", "testWithoutARevealTheLayersAreTheOldOnes", "testOneCopyPerLayerPerStepButTheLast", "testTheHiddenRangeIsClear", "testACaptionIgnoresTheKey"]) {
    expect(tests).toContain(`func ${name}()`);
  }
});
```

- [ ] **Step 2: Run** both → FAIL.

- [ ] **Step 3: `modules/clipy-video/reveal.ts`** (kept apart, like `background.ts`, so a test that mocks `@/modules/clipy-video` still gets these absent-safe functions):

```ts
import { requireOptionalNativeModule } from "expo-modules-core";

/**
 * The "text reveal" build (2026-10-14): the export draws a text's reveal (Typewriter / Word by word — the request's `reveal` key). An
 * older build ignores that key, and the app sends no In with it, so the text simply appears whole. Nothing here throws.
 */
type RevealNative = { textReveal?: () => boolean };
function optional(): RevealNative | null {
  try { return requireOptionalNativeModule<RevealNative>("ClipyVideo"); } catch { return null; }
}
/** Whether the installed app is the "text reveal" build or a newer one. */
export function isTextRevealBuild(): boolean { return typeof optional()?.textReveal === "function"; }
/**
 * Whether picking a reveal must be refused: the native engine is installed but older than reveals. In Expo Go (no engine at all) the
 * reveal is preview-only and allowed — Expo Go cannot export.
 */
export function revealNeedsBuild(): boolean { return optional() !== null && !isTextRevealBuild(); }
```

- [ ] **Step 4: index.ts.** Add `export * from "./reveal";` beside `export * from "./background";` (`:293`). Import `exportReveal` from `@/src/editor/model/textReveal` and `isRevealId` from types. Add the interface and the optional key:

```ts
/** A text's reveal as the export draws it (`exportReveal`): step i shows the text before UTF-16 offset `cuts[i]` from `from[i]` seconds after the text's start; the last step is the whole text. */
export interface ExportReveal { cuts: number[]; from: number[] }
```

In `ExportOverlay` after `highlightColor`: `reveal?: ExportReveal;    // a revealing text only; ABSENT otherwise (an older build ignores it and shows the text whole)`.

`overlayMotion` (`:143-147`):

```ts
function overlayMotion(o: Overlay): Pick<ExportOverlay, "animIn" | "animOut" | "animLoop" | "keyframes"> {
  const edges = edgeDurations(o.animation.in?.duration ?? 0, o.animation.out?.duration ?? 0, o.end - o.start);
  // A reveal is sent as its own key (`reveal`), never as an In: an older build then draws the text whole instead of an unknown animation.
  const inEdge = o.animation.in;
  const animIn = inEdge && !isRevealId(inEdge.id) ? toEdge({ id: inEdge.id, duration: inEdge.duration }, edges.in) : null;
  return { animIn, animOut: toEdge(o.animation.out, edges.out), animLoop: o.animation.loop, keyframes: o.keyframes.map(copyKeyframe) };
}
```

In `toExportOverlay`'s text return, LAST (after `highlightColor`): `...revealKey(o),` with

```ts
/** The `reveal` key only when there is a reveal: every other request is byte for byte what it was (the PROOF in useExport.test.ts). */
const revealKey = (o: Overlay): { reveal?: ExportReveal } => { const reveal = exportReveal(o); return reveal ? { reveal } : {}; };
```

Add `textReveal(): boolean;` to `ClipyVideoNative` (`:255-283`) beside `blurAndCuts(): boolean;`.

- [ ] **Step 5: `modules/clipy-video/ios/TextReveal.swift`** (exactly):

```swift
import Foundation

/// The steps of a text's reveal (Typewriter / Word by word) in the export, as the request carries them. Pure: no
/// layers. Where each step ends and when it begins are the app's (`revealPlan` in src/editor/model/textReveal.ts —
/// TypeScript only, NOT mirrored here); this only checks the numbers and gives every step its end.
enum TextReveal {
  /// `cuts[i]` (UTF-16 offsets into the text: the text before it is shown) and `from[i]` (seconds since the text's
  /// start) as steps `(cut, from, to)`: `to` is the next step's `from`, the last step's is `life`.
  /// Empty — the text is then drawn whole, as before — unless: at least two steps, as many cuts as times, every cut a
  /// whole number strictly increasing within 1 … `length` with the last exactly `length`, every time finite, strictly
  /// increasing from exactly 0 and below `life`, and `life` finite and above 0.
  static func steps(cuts: [Double], from: [Double], length: Int, life: Double) -> [(cut: Int, from: Double, to: Double)] {
    guard cuts.count >= 2, cuts.count == from.count, length > 0, life.isFinite, life > 0 else { return [] }
    var out: [(cut: Int, from: Double, to: Double)] = []
    var lastCut = 0
    var lastFrom: Double = -1
    for i in 0..<cuts.count {
      let c = cuts[i]
      let t = from[i]
      guard c.isFinite, c == c.rounded(), c > Double(lastCut), c <= Double(length) else { return [] }
      guard t.isFinite, t > lastFrom, t < life else { return [] }
      if i == 0 && t != 0 { return [] }
      lastCut = Int(c)
      lastFrom = t
      out.append((cut: lastCut, from: t, to: life))
    }
    guard lastCut == length else { return [] }
    for i in 0..<(out.count - 1) { out[i].to = out[i + 1].from }
    return out
  }
}
```

- [ ] **Step 6: ExportSession.swift.** After `struct ExportAnimEdge` (`:89-92`):

```swift
/// A text's reveal (Typewriter / Word by word), worked out by the app (`exportReveal` in src/editor/model/textReveal.ts):
/// step i shows the text before UTF-16 offset `cuts[i]` from `from[i]` seconds after the text's start; the last step is
/// the whole text. Whole numbers travel as JS numbers, hence `[Double]`; `TextReveal.steps` checks them.
struct ExportReveal: Record {
  @Field var cuts: [Double] = []
  @Field var from: [Double] = []
}
```

In `ExportOverlay`, after `highlightColor` (`:234`):

```swift
  @Field var reveal: ExportReveal?                 // a revealing text only (Typewriter / Word by word); absent → nil
```

In `overlayLayer`, between the shadow block's closing `}` (`:739`) and the word-highlight comment (`:741`), insert:

```swift

    // Reveal (Typewriter / Word by word — a text only; the app sends no In with it): every text layer above (glow,
    // shadow, fill, bottom to top) is copied once for each step but the last, with the characters not yet revealed in
    // a clear fill AND stroke, and the copy is shown only during its step; the layers themselves show the whole text
    // from the last step to the end. A clear glyph draws nothing, so it casts no layer shadow either. The box is the
    // container's: there from the first frame. Numbers that do not check out (`TextReveal.steps` empty) → the text is
    // drawn whole, as before. The copies are direct sublayers, so `addMotion` keeps them sharp like the fill.
    if o.kind == "text", let reveal = o.reveal {
      let steps = TextReveal.steps(cuts: reveal.cuts, from: reveal.from, length: (o.text as NSString).length, life: o.end - o.start)
      if steps.count >= 2 {
        container.allowsGroupOpacity = true
        let passes: [CATextLayer] = (container.sublayers ?? []).compactMap { (layer: CALayer) -> CATextLayer? in layer as? CATextLayer }
        let clear = UIColor.clear.cgColor
        for i in 0..<(steps.count - 1) {
          let step = steps[i]
          for pass in passes {
            guard let full = pass.string as? NSAttributedString else { continue }
            let part = NSMutableAttributedString(attributedString: full)
            let rest = NSRange(location: step.cut, length: part.length - step.cut)
            part.addAttribute(key(kCTForegroundColorAttributeName), value: clear, range: rest)
            part.addAttribute(key(kCTStrokeColorAttributeName), value: clear, range: rest)
            let shown = textCopy(part)
            shown.shadowColor = pass.shadowColor
            shown.shadowOpacity = pass.shadowOpacity
            shown.shadowRadius = pass.shadowRadius
            shown.shadowOffset = pass.shadowOffset
            container.addSublayer(shown)
            addVisibility(shown, start: o.start + step.from, end: o.start + step.to, opacity: Double(pass.opacity))
          }
        }
        let last = steps[steps.count - 1]
        for pass in passes { addVisibility(pass, start: o.start + last.from, end: o.end, opacity: Double(pass.opacity)) }
      }
    }
```

Nothing else in the file changes (the function's doc comment may gain one clause: "a text's reveal is copies of those layers, one set per step").

- [ ] **Step 7: ClipyVideoModule.swift**, after `Function("endBackgroundExport") { … }` (`:644-646`), inside `definition()`:

```swift

    // The build of 2026-10-14 ("text reveal"): the export draws a text's `reveal` (Typewriter / Word by word, see
    // TextReveal and `ExportSession.overlayLayer`). A build without this function ignores the key and shows the text
    // whole. The app asks whether the function is THERE.
    Function("textReveal") { () -> Bool in
      return true
    }
```

- [ ] **Step 8: `modules/clipy-video/ios/Tests/TextRevealTests.swift`** (exactly):

```swift
import CoreText
import Foundation
import QuartzCore
import UIKit
import XCTest
@testable import ClipyVideo

/// A text's reveal in the export: the checked steps, and one copy of each text layer per step but the last, shown only
/// during its step, with the characters not yet revealed clear in fill and stroke.
final class TextRevealTests: XCTestCase {
  private let size = CGSize(width: 1080, height: 1920)
  private let colorKey = NSAttributedString.Key(rawValue: kCTForegroundColorAttributeName as String)

  func testStepsEndWhereTheNextBegins() {
    let s = TextReveal.steps(cuts: [3, 6], from: [0, 0.25], length: 6, life: 3)
    XCTAssertEqual(s.count, 2)
    XCTAssertEqual(s[0].cut, 3); XCTAssertEqual(s[0].from, 0); XCTAssertEqual(s[0].to, 0.25)
    XCTAssertEqual(s[1].cut, 6); XCTAssertEqual(s[1].from, 0.25); XCTAssertEqual(s[1].to, 3)
  }

  func testAnythingOddIsNoReveal() {
    XCTAssertTrue(TextReveal.steps(cuts: [6], from: [0], length: 6, life: 3).isEmpty)                     // one step
    XCTAssertTrue(TextReveal.steps(cuts: [3, 6], from: [0], length: 6, life: 3).isEmpty)                  // counts differ
    XCTAssertTrue(TextReveal.steps(cuts: [3, 5], from: [0, 0.25], length: 6, life: 3).isEmpty)            // not the whole text at the end
    XCTAssertTrue(TextReveal.steps(cuts: [3, 3, 6], from: [0, 0.1, 0.2], length: 6, life: 3).isEmpty)     // not increasing
    XCTAssertTrue(TextReveal.steps(cuts: [0, 6], from: [0, 0.25], length: 6, life: 3).isEmpty)            // an empty first step
    XCTAssertTrue(TextReveal.steps(cuts: [2.5, 6], from: [0, 0.25], length: 6, life: 3).isEmpty)          // not a whole number
    XCTAssertTrue(TextReveal.steps(cuts: [3, 6], from: [0.1, 0.25], length: 6, life: 3).isEmpty)          // does not start at 0
    XCTAssertTrue(TextReveal.steps(cuts: [3, 6], from: [0, 0], length: 6, life: 3).isEmpty)               // times not increasing
    XCTAssertTrue(TextReveal.steps(cuts: [3, 6], from: [0, 3], length: 6, life: 3).isEmpty)               // past the life
    XCTAssertTrue(TextReveal.steps(cuts: [3, 6], from: [0, .nan], length: 6, life: 3).isEmpty)
    XCTAssertTrue(TextReveal.steps(cuts: [3, 6], from: [0, 0.25], length: 6, life: .infinity).isEmpty)
  }

  /// "Hi you" from 1 s to 4 s, outlined; Word by word: "Hi " from 1 s, the whole text from 1.25 s.
  private func text(reveal: Bool, glow: Bool = false, shadow: Bool = false, kind: String = "text") -> ExportOverlay {
    var o = ExportOverlay()
    o.kind = kind; o.text = "Hi you"; o.start = 1; o.end = 4; o.fontScale = 0.07; o.outline = true
    var style = ExportTextStyle()
    if glow { style.glowColor = "#FF0000"; style.glowSize = 0.5 }
    if shadow { style.shadowColor = "#0000FF"; style.shadowOpacity = 0.6; style.shadowDistance = 0.1; style.shadowBlur = 0.25 }
    o.style = style
    if reveal { var r = ExportReveal(); r.cuts = [3, 6]; r.from = [0, 0.25]; o.reveal = r }
    return o
  }

  func testWithoutARevealTheLayersAreTheOldOnes() {
    XCTAssertEqual(ExportSession.overlayLayer(text(reveal: false), renderSize: size).sublayers?.count, 1)
    XCTAssertEqual(ExportSession.overlayLayer(text(reveal: false, glow: true, shadow: true), renderSize: size).sublayers?.count, 3)
  }

  func testOneCopyPerLayerPerStepButTheLast() {
    let layer = ExportSession.overlayLayer(text(reveal: true, glow: true, shadow: true), renderSize: size)
    let subs = layer.sublayers ?? []
    XCTAssertEqual(subs.count, 6)
    XCTAssertTrue(layer.allowsGroupOpacity)
    for copy in subs[3...] {                                    // step 1's glow, shadow and fill copies: 1 s … 1.25 s
      let anim = copy.animation(forKey: "visible") as? CABasicAnimation
      XCTAssertEqual(anim?.beginTime ?? -1, 1, accuracy: 1e-9)
      XCTAssertEqual(anim?.duration ?? -1, 0.25, accuracy: 1e-9)
      XCTAssertEqual(copy.opacity, 0)
      XCTAssertEqual(copy.frame, subs[2].frame)
    }
    for whole in subs[..<3] {                                   // the three layers: the whole text from 1.25 s to the end
      let anim = whole.animation(forKey: "visible") as? CABasicAnimation
      XCTAssertEqual(anim?.beginTime ?? -1, 1.25, accuracy: 1e-9)
      XCTAssertEqual(anim?.duration ?? -1, 2.75, accuracy: 1e-9)
    }
    // The shadow copy keeps the shadow's strength and its layer shadow.
    XCTAssertEqual(((subs[4].animation(forKey: "visible") as? CABasicAnimation)?.fromValue as? Double) ?? -1, 0.6, accuracy: 1e-6)
    XCTAssertEqual(subs[4].shadowRadius, subs[1].shadowRadius)
    XCTAssertEqual(subs[4].shadowOffset, subs[1].shadowOffset)
    XCTAssertEqual(subs[3].shadowOpacity, 1)
  }

  func testTheHiddenRangeIsClear() {
    let layer = ExportSession.overlayLayer(text(reveal: true), renderSize: size)
    let copy = (layer.sublayers ?? [])[1] as? CATextLayer
    let string = copy?.string as? NSAttributedString
    XCTAssertEqual(string?.string, "Hi you")                    // the whole text is laid out
    let shown = string?.attribute(colorKey, at: 0, effectiveRange: nil)
    let hidden = string?.attribute(colorKey, at: 4, effectiveRange: nil)
    XCTAssertEqual((shown as! CGColor).alpha, 1)
    XCTAssertEqual((hidden as! CGColor).alpha, 0)
    let strokeKey = NSAttributedString.Key(rawValue: kCTStrokeColorAttributeName as String)
    XCTAssertEqual((string?.attribute(strokeKey, at: 4, effectiveRange: nil) as! CGColor).alpha, 0)
  }

  func testACaptionIgnoresTheKey() {
    XCTAssertEqual(ExportSession.overlayLayer(text(reveal: true, kind: "caption"), renderSize: size).sublayers?.count, 1)
  }
}
```

- [ ] **Step 9: textExport.swift.test.ts** (`:106-127`): add `'if o.kind == "text", let reveal = o.reveal'` as a FOURTH entry of both guard lists (the default-path test and the group-opacity test — the reveal block holds exactly one `allowsGroupOpacity = true`), rename "three guards" → "four guards" in their titles / comments, and `session.split("allowsGroupOpacity")).toHaveLength(6)`. No other assertion changes.

- [ ] **Step 10: buildInfo.ts.** `import { isTextRevealBuild } from "@/modules/clipy-video/reveal";`; top row of `LEVELS`: `{ name: "text reveal", title: "Text reveal", has: isTextRevealBuild },`; after `STEADY_TOOLS`:

```ts
/** Said where Typewriter or Word by word is picked in a build from before them (`revealNeedsBuild`); Expo Go shows them in the preview. */
export const REVEAL_TOOLS = NEEDS_LATEST_BUILD("Typewriter and Word by word");
```

`src/lib/__tests__/buildInfo.test.ts`: add `jest.mock("@/modules/clipy-video/reveal", () => ({ isTextRevealBuild: jest.fn() }));`, a 9th `set` parameter `reveal = false` mocking it, `set(true, true, true, true, true, true, true, true, true)` → `"App build: text reveal"` / `"Text reveal"` at the top of the first two tests, `["text reveal", "Text reveal", "isTextRevealBuild"]` as the first row of the rows test (renamed "the top row is the text-reveal build"), and `expect(REVEAL_TOOLS).toBe("Typewriter and Word by word need the latest Clipy build. Install it from the newest build link.")`. Every existing expectation stays.

- [ ] **Step 11: Run** the new pins, `index.test.ts`, `textExport.swift.test.ts`, `buildInfo.test.ts` → PASS; `npm.cmd run typecheck`; `npm.cmd test` → all pass (the PROOF in `useExport.test.ts` untouched and green), app suites +1.

- [ ] **Step 12: Compile-style self-read** of the three Swift files against Task 5 Step 2's list before committing.

- [ ] **Step 13: Commit** `feat(text-reveal): the export draws a reveal as per-step copies; the "text reveal" build row`.

---

## Task 4 — The screen: two tiles, the gate, icons

**Files**
- Modify: `src/editor/effects.ts` (after `ANIM_IN`, `:76-87`)
- Modify: `src/editor/components/OverlayAnimationSheet.tsx`
- Modify: `src/ui/sfSymbols.ts` (the "Effects and looping animations" group, `:141`)
- Test: modify `src/editor/__tests__/OverlayAnimationSheet.test.tsx` (append), create `src/editor/__tests__/OverlayAnimationSheet.reveal.test.tsx`, modify `src/ui/__tests__/sfSymbols.map.test.ts`

**Interfaces**
- Consumes: `ANIM_REVEAL_IDS`, `isRevealId`, `RevealId` (Task 1); `revealNeedsBuild()` (`@/modules/clipy-video/reveal`), `REVEAL_TOOLS` (Task 3); `useToast` (`src/ui/Toast.tsx`).
- Produces: `ANIM_REVEAL: Record<RevealId, { label: string; icon: IoniconName }>`.

- [ ] **Step 1: Failing tests.** Append to `OverlayAnimationSheet.test.tsx`:

```tsx
test("a text's In row ends with Typewriter and Word by word; a pick is one undo step and keeps the Length", async () => {
  await render(<OverlayAnimationSheet overlayId="t1" visible onClose={() => {}} />);
  expect(tile("Typewriter")).toBeTruthy();
  expect(tile("Word by word")).toBeTruthy();
  const before = past();
  await press("Typewriter");
  expect(anim("t1").in).toEqual({ id: "typewriter", duration: 0.5 });
  expect(past()).toBe(before + 1);
  expect(tile("Typewriter")).toBeSelected();
  expect(slider().props).toMatchObject({ disabled: false });
  await press("Word by word");
  expect(anim("t1").in).toEqual({ id: "wordByWord", duration: 0.5 });
  await press("Pop");
  expect(anim("t1").in).toEqual({ id: "pop", duration: 0.5 });     // one In at a time
});

test("never on a text's Out row, nor anywhere for a sticker", async () => {
  const view = await render(<OverlayAnimationSheet overlayId="t1" visible onClose={() => {}} />);
  await press("Out");
  expect(screen.queryByRole("button", { name: "Typewriter" })).toBeNull();
  await view.rerender(<OverlayAnimationSheet overlayId="s1" visible onClose={() => {}} />);
  await press("In");
  expect(screen.queryByRole("button", { name: "Typewriter" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Word by word" })).toBeNull();
});

test("the Length slider changes a reveal's length like any In", async () => {
  useEditorStore.getState().apply((p) => setOverlayAnimation(p, "t1", { in: { id: "typewriter", duration: 0.5 } }));
  await render(<OverlayAnimationSheet overlayId="t1" visible onClose={() => {}} />);
  await fireEvent(slider(), "touchStart");
  await fireEvent(slider(), "touchMove", { v: 1.2 });
  expect(anim("t1").in).toEqual({ id: "typewriter", duration: 1.2 });
});
```

`src/editor/__tests__/OverlayAnimationSheet.reveal.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
jest.mock("@/modules/clipy-video/reveal", () => ({ revealNeedsBuild: jest.fn(() => true), isTextRevealBuild: jest.fn(() => false) }));
import { makeClip, makeOverlay, makeProject } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { REVEAL_TOOLS } from "@/src/lib/buildInfo";
import { useToast } from "@/src/ui/Toast";
import { OverlayAnimationSheet } from "../components/OverlayAnimationSheet";

beforeEach(() => {
  useEditorStore.getState().reset();
  useToast.getState().clear();
  useEditorStore.getState().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 8 })], overlays: [makeOverlay({ id: "t1" })] }));
});

test("an installed build from before reveals: the tile says so and changes nothing", async () => {
  await render(<OverlayAnimationSheet overlayId="t1" visible onClose={() => {}} />);
  const before = useEditorStore.getState().past.length;
  await fireEvent.press(screen.getByRole("button", { name: "Typewriter" }));
  expect(useToast.getState().message).toBe(REVEAL_TOOLS);
  expect(useEditorStore.getState().project!.overlays[0].animation.in).toBeNull();
  expect(useEditorStore.getState().past.length).toBe(before);
  await fireEvent.press(screen.getByRole("button", { name: "Pop" }));   // the whole-text animations are not gated
  expect(useEditorStore.getState().project!.overlays[0].animation.in).toEqual({ id: "pop", duration: 0.5 });
});
```

(In the first file the module is not mocked: under Jest there is no native module, which is Expo Go — allowed.)

`sfSymbols.map.test.ts`: add `"keypad-outline"` (after `"information-circle-outline"`) and `"reader-outline"` (after `"radio-outline"`) to `USED`; `toHaveLength(125)` → `127`; `Object.keys(table)).toHaveLength(119)` → `121`; import `ANIM_REVEAL` and add it to the `tables` list after `ANIM_LOOP`.

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: effects.ts** after `ANIM_IN` (import `type RevealId`):

```ts
/** Text reveals (a text's In only): the letters or the words appear in turn. What shows when is model/textReveal.ts. */
export const ANIM_REVEAL: Record<RevealId, { label: string; icon: IoniconName }> = {
  typewriter: { label: "Typewriter",   icon: "keypad-outline" },
  wordByWord: { label: "Word by word", icon: "reader-outline" },
};
```

- [ ] **Step 4: sfSymbols.ts**, in the "Effects and looping animations" group: `"keypad-outline": "keyboard",` and `"reader-outline": "text.alignleft",` (both SF Symbols 1.0; the version test reads them).

- [ ] **Step 5: OverlayAnimationSheet.tsx.** Imports: `ANIM_REVEAL`; `ANIM_REVEAL_IDS, isRevealId, type RevealId, type OverlayAnimation`; `revealNeedsBuild` from `@/modules/clipy-video/reveal`; `REVEAL_TOOLS` from `@/src/lib/buildInfo`; `useToast` from `@/src/ui/Toast`. Module level:

```ts
/** A text's In row: the ten whole-text animations, then Typewriter and Word by word (texts only, In only — spec section 7). */
const TEXT_IN_IDS: readonly (AnimInId | RevealId)[] = [...ANIM_IN_IDS, ...ANIM_REVEAL_IDS];
const TEXT_IN = { ...ANIM_IN, ...ANIM_REVEAL };
```

In the component: `const inIds: readonly (AnimInId | RevealId)[] = overlay.kind === "text" ? TEXT_IN_IDS : ANIM_IN_IDS;` (computed after the caption / null return; in the `useMemo`, use `overlay.kind === "text" && tab === "in" ? TEXT_IN_IDS : ANIM_IN_IDS` for `animationStartX`). Replace `pickEdge` with:

```ts
  const pickIn = (id: AnimInId | RevealId | null) => {
    if ((anim.in?.id ?? null) === id) return;
    if (id !== null && isRevealId(id) && revealNeedsBuild()) { useToast.getState().show(REVEAL_TOOLS); return; }
    haptic("light");
    const edge = id === null ? null : { id, duration: edgeDuration(anim.in) };
    apply((p) => setOverlayAnimation(p, overlay.id, { in: edge }));
  };
  const pickOut = (id: AnimInId | null) => {
    if ((anim.out?.id ?? null) === id) return;
    haptic("light");
    const edge = id === null ? null : { id, duration: edgeDuration(anim.out) };
    apply((p) => setOverlayAnimation(p, overlay.id, { out: edge }));
  };
```

and the row:

```tsx
        {tab === "loop"
          ? <AnimationTiles ids={ANIM_LOOP_IDS} registry={ANIM_LOOP} selected={anim.loop} onPick={pickLoop} />
          : tab === "in"
            ? <AnimationTiles ids={inIds} registry={TEXT_IN} selected={anim.in?.id ?? null} onPick={pickIn} />
            : <AnimationTiles ids={ANIM_IN_IDS} registry={ANIM_IN} selected={anim.out?.id ?? null} onPick={pickOut} />}
```

The slider keeps Task 1's `lengthPatch`. Update the component's doc: "… In may also be Typewriter or Word by word for a text".

- [ ] **Step 6: Run** the three files → PASS; `npm.cmd run typecheck`; `npm.cmd test` → all pass (casing, outline-icon, sfSymbols and kit guards included), app suites +1.

- [ ] **Step 7: Commit** `feat(text-reveal): Typewriter and Word by word in a text's In row`.

---

## Task 5 — Independent review (a reviewer who wrote none of Tasks 1–4)

**Files:** fixes only, each in the file it concerns, each with a test or a pin.

- [ ] **Step 1: The spec against the code.** Walk spec §1–§9 and confirm each decision is what was built: no schema bump; `ANIM_IN_IDS` / `ANIM_IN` / `Motion.swift` untouched (`git diff next-build -- modules/clipy-video/ios/Motion.swift src/editor/model/__tests__/motion*.ts` empty); captions, stickers and Out refuse; the PROOF JSON in `useExport.test.ts` byte-identical (`git diff next-build -- src/export/__tests__/useExport.test.ts` empty); `reveal` key absent unless a plan ≥ 2 steps.

- [ ] **Step 2: Swift compile-style read, line by line** (no toolchain: read against `node_modules/expo-modules-core/ios` and the module). For each new / changed line of `TextReveal.swift`, `ExportSession.swift`, `ClipyVideoModule.swift`, `Tests/TextRevealTests.swift` write OK or the fix:
  - Records: `@Field var cuts: [Double] = []` — same shape as `SteadyRender.swift:35-37`; `@Field var reveal: ExportReveal?` — same as `ExportOverlay.animIn: ExportAnimEdge?` (`:226`); a record is decoded by `Record.update(withDict:)` / `update(withObject:)` (`expo-modules-core/ios/Core/Records/Record.swift:111-140`), which sets only declared fields — an older build ignores `reveal`.
  - `Function("textReveal") { () -> Bool in return true }` — identical in shape to `Function("blurAndCuts")` (`ClipyVideoModule.swift:581-583`; `ios/Core/Functions/SyncFunctionDefinition.swift`), inside `definition()` and before its closing brace.
  - Types: `pass.string` is `Any?` → `as? NSAttributedString`; `NSMutableAttributedString` passed where `textCopy(_ string: NSAttributedString)` expects its superclass; `pass.opacity` is `Float` → `Double(pass.opacity)`; `shadowColor` `CGColor?`, `shadowOpacity` `Float`, `shadowRadius` `CGFloat`, `shadowOffset` `CGSize` assigned like for like; `key(_:)` and `textCopy(_:)` are the function's local funcs declared ABOVE the block (`:656`, `:691`); `addVisibility` is called unqualified from the static func as the caption block does (`:752`); `kCTStrokeColorAttributeName` needs `CoreText` (imported, `:2`); `(o.text as NSString).length` is `Int`.
  - Tuples: `[(cut: Int, from: Double, to: Double)]` — `out[i].to = …` mutates an element of a `var` array (legal); `steps[i].cut` / `.from` / `.to` labels match the declaration.
  - Ranges: `0..<(steps.count - 1)` and `0..<(out.count - 1)` are reached only with a count ≥ 2 (no empty or negative range trap); `NSRange(location: step.cut, length: part.length - step.cut)` has length ≥ 1 for every non-last step (cuts strictly increase to `length`, and every pass's string is `o.text`).
  - The XCTests: `@testable import ClipyVideo`, `var o = ExportOverlay()` then field writes (as `TextBoxTests.swift:13-20`), `subs[3...]` / `subs[..<3]` slices of `[CALayer]`, `as! CGColor` from `Any?` (a warning at most, never an error), `XCTAssertEqual` with `accuracy:` on `Double` / `CGFloat`.
  - Nothing newer than iOS 16.4; no new import in `ExportSession.swift`.
- [ ] **Step 3: Behaviour read of the export block.** Confirm: the copies are made from the passes BEFORE the passes' own `addVisibility` zeroes their opacity; each step's copies stack glow → shadow → fill; no two steps overlap in time; the originals' window starts exactly where the last copy's ends; `addMotion` (called later, `:758`) iterates `layer.sublayers` and so reaches the copies; a caption never enters the block.
- [ ] **Step 4: Preview / export agreement.** For "Hello world", 0.5 s, start 1: `revealCut` at 1.00 / 1.07 / 1.27 / 1.47 and the Swift windows from `exportReveal`'s numbers name the same cut (write the table in the review notes).
- [ ] **Step 5: Run** `npm.cmd run typecheck`, `npm.cmd test`; record suite / test counts against the baseline. Commit fixes as `fix(text-reveal): <what>`; if none, no commit.

---

## Task 6 — Docs

**Files**
- Modify: `AGENTS.md` (one new line after the "Motion maths" line)
- Create: `docs/text-reveal-phone-checklist.md`
- Modify: `docs/next-build-phone-checklist.md` (a new part G pointing to it)

- [ ] **Step 1: AGENTS.md** — after the "Motion maths" bullet, add exactly:

```
- Text reveal (Typewriter / Word by word): a TEXT's In may be `typewriter` / `wordByWord` (`ANIM_REVEAL_IDS`; `ANIM_IN_IDS` stays the ten; no schema bump — `clampOverlayAnimation(a, reveal)` keeps it only for `kind: "text"`, never an Out, a sticker or a caption; `setOverlayAnimation` refuses the rest). What shows when is ONLY `src/editor/model/textReveal.ts` (TypeScript, NOT mirrored: `revealUnits` — code-point ranges, UTF-16 cuts, a logical prefix, a word in a joined script (Arabic, Indic, Thai …) is one unit, CJK a character per word; `revealPlan` — at most `REVEAL.maxSteps`, `stepsPerSecond`; `revealCut` for the preview, `exportReveal` for the request). The preview: every layer of `OverlayText` draws the shown part plus ONE see-through `KitText` (`color` and `textShadowColor` transparent). The export is SENT the plan as the optional key `reveal: { cuts, from }` with `animIn: null` (absent for every other text — the PROOF JSON is unchanged) and draws it in `overlayLayer`'s fourth guarded block: each text layer copied per step but the last, the hidden range clear in fill AND stroke, shown by `addVisibility` (`TextReveal.steps` checks the numbers; pins in `textReveal.swift.test.ts`). The box is full size from the first frame. Built by the "text reveal" build (`isTextRevealBuild`, `modules/clipy-video/reveal.ts`); an older build ignores the key and shows the text whole; picking a reveal on an older INSTALLED build says `REVEAL_TOOLS` (`revealNeedsBuild`), while Expo Go allows it (preview only — Expo Go cannot export).
```

Also extend the Redesign / UI lines? No — nothing else changes.

- [ ] **Step 2: `docs/text-reveal-phone-checklist.md`** — plain words for the owner; for each check "Right looks like / Wrong looks like", and for every one: play it in the editor AND export it, then watch the exported file in Photos beside the editor:
  1. Build row says "Text reveal".
  2. Typewriter on a one-line white text, default font, 0.5 s, then 2 s.
  3. Word by word on the same.
  4. Every font of the Text panel, one text each (look for a letter that jumps or a word that moves when the next letter appears).
  5. Outline + shadow + glow + background box together, both modes — no faint outline or glow of letters not yet shown; the box is full size from the start.
  6. A see-through text (opacity) and a coloured text.
  7. Two lines (a long sentence that wraps), centred, then left and right aligned — no line jumps or re-wraps while typing.
  8. Emoji: a family, a flag, a thumbs-up with a skin tone — each appears whole.
  9. Arabic or Persian with vowel marks, right-aligned: words appear right to left, each word whole and joined; Hebrew letter by letter.
  10. A text with Typewriter AND an Out (Fade) AND a Loop (Wiggle).
  11. A short text (1 s) with a 2-s Typewriter: it finishes in time.
  12. Export at 60 fps and at 4K a long two-line text with glow and shadow and a 2-s Typewriter: the export finishes (watch for a crash) — the worst case.
  13. Undo after picking Typewriter; leave and reopen the project; Save a Copy and Open Project File: the reveal is still there.
  14. Captions: the Animation tool does not offer it (captions never had one).
- [ ] **Step 3: next-build checklist** — append "## G. Text reveal" with one paragraph: "Do the checks in `text-reveal-phone-checklist.md`; checks 5, 7 and 12 are the ones that matter most."
- [ ] **Step 4: Run** `npm.cmd test` (docs only — must stay green). Commit `docs: text reveal — AGENTS.md line, phone checklist`.
