# More Transitions, Filters and Effects: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ten more transitions (21), twelve more filters (32) and eight more effects (20), in the three pickers that exist, with the controls that exist — while every look an existing project uses previews and exports exactly as before.

**Architecture:** Schema v16 with a migration that adds nothing (the number only stops an older build from silently repairing the new ids away). Effect and transition ids, labels and icons enter the registries in Task 1, with marked pass-through Swift cases so the one-case-per-id parity tests stay green; filter ids enter in Task 2 with their rows. A filter is one row of a new mirrored pair, `filterRecipes.ts` ↔ `FilterRecipes.swift`: Adjust values run through the **untouched** `adjustRecipe` / `Adjust.apply` in two stages, with one new primitive (split tone) between them; its preview recipe is computed from the same row. Effect maths is appended to `effectMath.ts` ↔ `EffectMath.swift`. Transition geometry gets its first TypeScript twin, `transitionMath.ts` ↔ `TransitionMath.swift`. The preview draws with plain views and `expo-linear-gradient` in `EffectLayer.tsx` and `TransitionLayer.tsx` (each measures the frame itself). The Swift renderers are small cases built only through guarded helpers.

**Tech Stack:** Expo SDK 57, React Native 0.86, TypeScript strict, Zustand 5, `expo-linear-gradient` (installed), `@expo/vector-icons` 15 (Ionicons), Jest (`jest-expo`) + RNTL 14.0.1; Swift / Core Image / Core Graphics in `modules/clipy-video/ios` (never compiled here). **No new package, no new asset.**

**Spec:** `docs/superpowers/specs/2026-10-06-more-looks-design.md` (binding; §3 schema and the frozen-look proof, §4 substitutions, §5 transitions, §6 filters, §7 effects, §8 export, §9 screens, §11 the unverified list).

## Global Constraints

- **iPhone only.** No Android or web configuration, files or code paths.
- **Expo Go must keep working.** Everything shows in the preview without `modules/clipy-video` linked; **no new package and no new asset** (`package.json`, `app.json` and `assets/` are not edited).
- **Existing looks render exactly as before.** `src/editor/__tests__/looks.frozen.test.ts` (Task 1) is green at every commit and is **never edited** after Task 1 — not a literal, not a checksum. If it goes red you changed something that exists: undo it. New Swift is *inserted* where the task says (new `blend` cases between the Spin and the Blur branch; new effect cases after the Mosaic box branch; new helpers after the last existing one or in a new file), never interleaved.
- **Never edited this round:** `src/editor/model/adjust.ts`, `modules/clipy-video/ios/Adjust.swift`, `src/editor/components/FilterLayer.tsx`, `AdjustLayer.tsx`, `Effects.filterChain` / `Effects.apply`, `modules/clipy-video/index.ts`, `src/editor/model/ops.ts`, `src/editor/timelineScroll.ts`, `src/editor/components/Timeline.tsx`, `src/editor/components/PreviewPlayer.tsx` (the whole file — the layers measure themselves), `EditorLayout.tsx`, `src/editor/toolStrip.ts`, anything under `src/publish/` or `supabase/`.
- **A saved project is only changed by the migration, and the migration adds nothing:** `schemaVersion` 15 → 16. No stored value is rewritten.
- **Mirrored pairs stay identical at every commit** — the TypeScript and the Swift side change in the **same task**: `src/editor/effects.ts` ↔ `Effects.swift` (ids), `effectMath.ts` ↔ `EffectMath.swift` (constants, colours, functions, vectors), `filterRecipes.ts` ↔ `FilterRecipes.swift` (rows, steps, vectors), `transitionMath.ts` ↔ `TransitionMath.swift` (constants, functions, vectors).
- **Swift is never compiled here.** Verify by reading against Apple's documented filter names and keys and against `node_modules/expo-modules-core/ios`; list every unverified API or assumption in your report. **Every new Core Image filter is created through `Adjust.filtered` (filters with an input image) or a `generated` helper (generators)** — both return nil for an unknown filter or key; never `CIFilter(name: "…")` with a literal name outside such a helper, never `.applyingFilter(` in new code. Nil → the frame unchanged (a transition: a plain dissolve). Each new filter name goes on the unverified list.
- **Preview drawing is cheap:** what changes with the playhead is `opacity` and `transform` only; sizes change only when the frame is measured (one `onLayout`, state set only when the size differs). No Reanimated, no timers, no state per frame — the layers re-render when the store's playhead moves, as `TransitionLayer` and `EffectOverlays` do today. Nothing is animated on an ancestor of the preview or the timeline.
- UI from `src/ui/` and `src/theme/theme.ts` only; **no hex literals** outside the allow-listed content files (`src/__tests__/noHexLiterals.test.ts`: `effects.ts`, `types.ts`, `effectMath.ts`, `TransitionLayer.tsx` are listed; Task 1 lists the two new maths files; `EffectLayer.tsx`, the three sheets and `ToolStrip.tsx` are **not** listed and must hold none). **Spacing from `theme.space` only** (`spacingScale.test.ts`; never add to its allow-table; its two blind spots are never relied on). Sliders are the kit `Slider`; icons are Ionicons outline names; touch targets reach 44 pt.
- **Explicit heights:** strips never use `flex: 1` for height inside an auto-height parent.
- **One user action = one undo step** (unchanged code paths: a tap is one `apply`, a drag is `beginTransaction` + `applyTransient`).
- Standing rules: only `src/editor/model/timeline.ts` uses clip `speed`; the preview `VideoView` never remounts; tools open through `src/editor/toolStrip.ts`; never list a shared value in an effect dependency list.
- RNTL v14: `render` / `fireEvent` / `rerender` are async — always `await`. `getByRole("button", { name })` matches the accessibility label exactly. A layout is fired by hand: `await fireEvent(node, "layout", { nativeEvent: { layout: { x, y, width, height } } })`.
- A test that fails after your change because it names a **pinned count, id list, label list or schema number** listed in your task is updated as the task says. A test that fails for any other reason means a mistake in the change — fix the change.
- Tasks that run side by side share one working tree: a red suite that belongs to a file another task owns is not yours to fix — re-run when that task has landed; never edit a file outside your task's list.
- Windows: PowerShell, no `&&`, `npx.cmd`. **Never run `expo lint`.** **No broad `sed`** — use Grep and edit each hit by hand. **Never `git stash`.** **`git add` explicit paths only — never `-A` / `.`.** **Do not start or stop a dev server** (one is serving this tree to the user's phone). Before each commit: `npm run typecheck` and `npm test` green. Commit trailer exactly `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Task order

1 first. Then **2 ∥ 3 ∥ 4**. Then **5 ∥ 6 ∥ 7 ∥ 8 ∥ 9** (each once its own dependency has landed). Last: 10.

| Task | Title | Depends on | Parallel-safe with | Model tier |
|---|---|---|---|---|
| 1 | Schema v16; effect and transition ids, labels, icons; Swift id lists and pass-through cases; the frozen-look tests | — | — | standard |
| 2 | The twelve filters: ids, recipe pair, split tone, preview recipes, the `look` hook | 1 | 3, 4 | standard |
| 3 | Effect maths for the eight (mirrored, vectors), `effectPreview` / `effectShapes` | 1 | 2, 4 | standard |
| 4 | Transition maths for the ten (new mirrored pair, vectors), curtains | 1 | 2, 3 | standard |
| 5 | Preview: effects (`EffectLayer.tsx`) | 3 | 6, 7, 8, 9 | cheap |
| 6 | Preview: transitions (`TransitionLayer.tsx`); the tag truth table | 4 | 5, 7, 8, 9 | standard |
| 7 | Pickers: the longer rows open at the selected item | 2 | 5, 6, 8, 9 | standard |
| 8 | Swift renderers: the eight effects | 3 | 5, 6, 7, 9 | most capable |
| 9 | Swift blends: the ten transitions | 4 (and 2 landed: same file) | 5, 6, 7, 8 | most capable |
| 10 | Docs, README first-build checklist, full checks, device checklist | 1–9 | — | cheap |

**Files more than one task edits** (each its own lines only; never two tasks that may run side by side): `src/editor/model/types.ts` (1: schema, `TRANSITION_TYPES`, `EFFECT_IDS`; 2: `FILTER_IDS`) · `src/editor/effects.ts` (1: `TRANSITIONS`, `EFFECTS`; 2: `FILTERS`) · `modules/clipy-video/ios/Effects.swift` (1: two id lists; 2: `filterIds`) · `src/editor/__tests__/effects.test.ts` and `src/editor/model/__tests__/types.look.test.ts` (1: transition / effect counts; 2: filter count) · `modules/clipy-video/ios/ClipyCompositor.swift` (1: ten pass-through `blend` cases; 2: one `else if` in `look`; 9: the ten cases) · `modules/clipy-video/ios/EffectRenderer.swift` (1: eight pass-through cases; 8: the cases and helpers) · `modules/clipy-video/ios/Tests/EffectMathTests.swift` (1: one count; 3: vector tables; 8: renderer tests) · `src/editor/model/__tests__/effectMath.parity.test.ts` (3 only).

**Pinned values that change, and who changes them:** schema number 15 → 16 (Task 1: `migrate.test.ts` and the nine `types.*.test.ts`) · `TRANSITION_TYPES` 11 → 21 (1: `types.look.test.ts` line 9, `effects.test.ts` line 29) · `EFFECT_IDS` 12 → 20 (1: `types.look.test.ts` line 10, `effects.test.ts` lines 62 and 64, `EffectSheet.test.tsx` lines 20 and 23, `types.layers2.test.ts` line 9, `EffectMathTests.swift` line 154) · `FILTER_IDS` 20 → 32 (2: `types.look.test.ts` line 8, `effects.test.ts` line 20 and the test at lines 79–81) · scalar vector count 21 → 55 (3: `EffectMathTests.swift`) · the eleven chip labels (7: `TransitionSheet.test.tsx` line 26–31) · `allTypes` (9: `TransitionBlendTests.swift`).

**The pass-through marker.** Task 1 writes eighteen one-line Swift cases that end in the comment `// MORE-LOOKS-PLACEHOLDER`. Tasks 8 and 9 replace them; their tests fail while one is left in their file; Task 10 greps for the word.

---

### Task 1: Schema v16; effect and transition ids; Swift id lists and pass-through cases; the frozen-look tests

**Depends on:** nothing. **Parallel-safe with:** none.

**Files:** Create `src/editor/__tests__/looks.frozen.test.ts`. Modify `src/editor/model/types.ts`, `src/editor/model/migrate.ts` (comments only), `src/editor/effects.ts` (`TRANSITIONS`, `EFFECTS`), `modules/clipy-video/ios/Effects.swift` (`transitionTypes`, `effectIds`), `modules/clipy-video/ios/EffectRenderer.swift` (eight inserted lines), `modules/clipy-video/ios/ClipyCompositor.swift` (ten inserted lines in `blend`), `modules/clipy-video/ios/Tests/EffectMathTests.swift` (line 154), `src/__tests__/noHexLiterals.test.ts` (two entries in `ALLOW`), and the tests named under "Pinned values" below.

**Do not touch:** `FILTER_IDS`, `FILTERS`, `Effects.filterIds` (Task 2); `effectMath.ts` / `EffectMath.swift` (Task 3); every component; everything under "Never edited this round".

**Interfaces — Produces**

```ts
// src/editor/model/types.ts
export const SCHEMA_VERSION = 16 as const;
export const TRANSITION_TYPES = ["none", "fade", "dissolve", "slide", "zoom", "slideRight", "slideUp", "slideDown", "wipe", "spin", "blur",
  "cover", "reveal", "coverUp", "revealDown", "circleOpen", "circleClose", "wipeDiagonal", "wipeClock", "pixelate", "flashWhite"] as const;
export const EFFECT_IDS = ["glitch", "shake", "zoomPulse", "blur", "vhs", "lightLeak", "flash", "rgbSplit", "oldFilm", "glow", "blurBox", "mosaicBox",
  "filmBurn", "lensFlare", "dust", "heartbeat", "hueShift", "mirror", "softEdges", "strobe"] as const;
// src/editor/effects.ts — TRANSITIONS and EFFECTS gain a row per new id (labels / icons below)
```

- [ ] **Step 0: Baseline.** `npm test` is green on the untouched tree. If it is not, stop and report.
- [ ] **Step 1: The frozen-look tests — written first, green BEFORE any other change.**

Create `src/editor/__tests__/looks.frozen.test.ts`:

```ts
import { createHash } from "crypto";
import { readFileSync } from "fs";
import { join } from "path";
import { EFFECTS, FILTERS, TRANSITIONS } from "../effects";
import { EFFECT, EFFECT_COLORS, effectPreview } from "../model/effectMath";
import { EFFECT_IDS, FILTER_IDS, TRANSITION_TYPES } from "../model/types";

/**
 * What "nothing in an existing project changes" means, frozen on 2026-10-06 before the thirty new looks were added.
 * NEVER edit this file to make it pass: a red test here means an existing look was changed. New ids are appended after
 * the frozen ones; new Swift is inserted outside the frozen stretches (the checksums below).
 */
const ROOT = join(__dirname, "../../..");
const read = (file: string) => readFileSync(join(ROOT, file), "utf8").replace(/\r\n/g, "\n");
const sha = (text: string) => createHash("sha256").update(text).digest("hex");
/** `source` from `from` through the first `to` after it (both included; `to` left out when `keepEnd` is false). */
const stretch = (source: string, from: string, to: string, keepEnd = true): string => {
  const a = source.indexOf(from);
  if (a < 0) throw new Error(`"${from}" not found`);
  const b = source.indexOf(to, a + from.length);
  if (b < 0) throw new Error(`"${to}" not found`);
  return source.slice(a, keepEnd ? b + to.length : b);
};

const OLD_FILTERS: [string, string, string, number, number, number][] = [
  ["none", "None", "#000000", 0, 1, 0], ["warm", "Warm", "#FF9A3C", 0.14, 1.1, 0.02], ["cool", "Cool", "#3C8CFF", 0.14, 1, 0],
  ["vivid", "Vivid", "#FF2D7A", 0.06, 1.4, 0.03], ["faded", "Faded", "#FFFFFF", 0.12, 0.7, 0.08], ["mono", "Mono", "#000000", 0, 0, 0],
  ["noir", "Noir", "#000000", 0.18, 0, -0.08], ["vintage", "Vintage", "#C8A05A", 0.22, 0.6, -0.03], ["sunset", "Sunset", "#FF8A3C", 0.2, 1.2, 0],
  ["golden", "Golden", "#FFC857", 0.18, 1.05, 0.04], ["teal", "Teal", "#2EC4B6", 0.16, 1.1, 0], ["pastel", "Pastel", "#FFFFFF", 0.1, 0.8, 0.06],
  ["film", "Film", "#E8A86A", 0.12, 1.1, 0], ["chrome", "Chrome", "#000000", 0, 1.3, 0], ["instant", "Instant", "#F2D9A0", 0.14, 0.9, 0.04],
  ["process", "Process", "#3C8CFF", 0.1, 1.1, 0], ["tonal", "Tonal", "#000000", 0, 0, 0], ["sepia", "Sepia", "#C8A05A", 0.3, 0, 0],
  ["crisp", "Crisp", "#000000", 0, 1.05, 0], ["dream", "Dream", "#FFFFFF", 0.08, 1.1, 0.03],
];
const OLD_TRANSITIONS: [string, string][] = [["none", "None"], ["fade", "Fade"], ["dissolve", "Dissolve"], ["slide", "Slide left"], ["zoom", "Zoom"],
  ["slideRight", "Slide right"], ["slideUp", "Slide up"], ["slideDown", "Slide down"], ["wipe", "Wipe"], ["spin", "Spin"], ["blur", "Blur"]];
const OLD_EFFECTS: [string, string, string][] = [
  ["glitch", "Glitch", "git-compare-outline"], ["shake", "Shake", "phone-portrait-outline"], ["zoomPulse", "Zoom pulse", "expand-outline"],
  ["blur", "Blur", "water-outline"], ["vhs", "VHS", "videocam-outline"], ["lightLeak", "Light leak", "sunny-outline"], ["flash", "Flash", "flash-outline"],
  ["rgbSplit", "RGB split", "layers-outline"], ["oldFilm", "Old film", "film-outline"], ["glow", "Glow", "bulb-outline"],
  ["blurBox", "Blur box", "scan-outline"], ["mosaicBox", "Mosaic box", "grid-outline"],
];
const OLD_EFFECT = {
  ramp: 0.15, shakeAmp: 0.03, shakeFx: 9, shakeFy: 11, shakePhase: 1.3, shakeZoom: 0.06, pulseAmp: 0.12, pulseHz: 2,
  flashHz: 2, flashDecay: 4, leakOpacity: 0.35, leakHz: 0.5, vhsTint: 0.12, vhsShift: 0.004, filmTint: 0.3, filmFlicker: 0.12, filmFps: 12,
  glowLayer: 0.12, glowRadius: 0.02, glowIntensity: 0.8, blurRadius: 0.03, glitchHz: 8, glitchChance: 0.5, glitchShift: 0.08, glitchSplit: 0.01,
  glitchBandMin: 0.08, glitchBandMax: 0.2, rgbSplit: 0.008,
};
const NOTHING = { translateX: 0, translateY: 0, scale: 1, layers: [] };

test("the 20 filters, 11 transitions and 12 effects of before 2026-10-06 come first, in their order, with their labels, icons and preview recipes", () => {
  expect(FILTER_IDS.slice(0, 20)).toEqual(OLD_FILTERS.map((f) => f[0]));
  for (const [id, label, tint, tintOpacity, saturation, brightness] of OLD_FILTERS) {
    expect(FILTERS[id as keyof typeof FILTERS]).toEqual({ label, preview: { tint, tintOpacity, saturation, brightness } });
  }
  expect(TRANSITION_TYPES.slice(0, 11)).toEqual(OLD_TRANSITIONS.map((t) => t[0]));
  for (const [id, label] of OLD_TRANSITIONS) expect(TRANSITIONS[id as keyof typeof TRANSITIONS]).toEqual({ label });
  expect(EFFECT_IDS.slice(0, 12)).toEqual(OLD_EFFECTS.map((e) => e[0]));
  for (const [id, label, icon] of OLD_EFFECTS) expect(EFFECTS[id as keyof typeof EFFECTS]).toEqual({ label, icon });
});

test("the 28 effect constants and the 6 effect colours of before lead their tables, value for value", () => {
  expect(Object.entries(EFFECT).slice(0, 28)).toEqual(Object.entries(OLD_EFFECT));
  expect(Object.entries(EFFECT_COLORS).slice(0, 6)).toEqual(Object.entries({ flash: "#FFFFFF", lightLeak: "#FFB347", vhs: "#7A5CFF", oldFilm: "#C8A05A", flicker: "#000000", glow: "#FFFFFF" }));
});

test("the 12 old effects preview exactly as they did (t = 0.3 s of a 2 s effect at strength 0.8)", () => {
  // env = 1 (0.3 s is past the 0.15 s ramp). Computed from the formulas of the look round's spec, section 4.2.
  const at = (id: (typeof EFFECT_IDS)[number]) => effectPreview(id, 0.3, 2, 0.8);
  for (const id of ["glitch", "blur", "rgbSplit", "blurBox", "mosaicBox"] as const) expect(at(id)).toEqual(NOTHING);
  expect(at("flash")).toEqual(NOTHING);                                                   // 0.8 · max(0, 1 − 4·frac(0.6)) = 0
  expect(at("shake")).toEqual({ translateX: expect.closeTo(-0.02282535639108368, 12), translateY: expect.closeTo(-0.001040384407158269, 12), scale: expect.closeTo(1.048, 12), layers: [] });
  expect(at("zoomPulse")).toEqual({ ...NOTHING, scale: expect.closeTo(1.0868328157299976, 12) });      // 1 + 0.12·0.8·(0.5 − 0.5·cos(1.2π))
  expect(at("vhs").layers).toEqual([{ color: "#7A5CFF", opacity: expect.closeTo(0.096, 12) }]);        // 0.12 · 0.8
  expect(at("lightLeak").layers).toEqual([{ color: "#FFB347", opacity: expect.closeTo(0.2586099033699941, 12) }]);   // 0.35·0.8·(0.6 + 0.4·sin(0.3π))
  expect(at("oldFilm").layers).toEqual([{ color: "#C8A05A", opacity: expect.closeTo(0.24, 12) }, { color: "#000000", opacity: expect.closeTo(0.053589368503773584, 12) }]);
  expect(at("glow").layers).toEqual([{ color: "#FFFFFF", opacity: expect.closeTo(0.096, 12) }]);
});

test("the Swift that draws the existing looks is byte for byte what it was", () => {
  const effects = read("modules/clipy-video/ios/Effects.swift");
  const compositor = read("modules/clipy-video/ios/ClipyCompositor.swift");
  const renderer = read("modules/clipy-video/ios/EffectRenderer.swift");
  const math = read("modules/clipy-video/ios/EffectMath.swift");
  const blend = compositor.slice(compositor.indexOf("  static func blend("));
  expect({
    // the nineteen filter chains and how a chain is applied
    filterChains: sha(stretch(effects, "  static func filterChain(", "  /// 100×100 box", false)),
    // the filter block of `look`: chain, strength mix
    lookFilter: sha(stretch(compositor, "    let chain = Effects.filterChain(spec.filter)\n", "        : dissolve(from: img, to: filtered, progress: CGFloat(spec.filterIntensity)).cropped(to: img.extent)\n")),
    // fade, slide, zoom, slideRight, slideUp, slideDown, wipe, spin
    blendToSpin: sha(stretch(blend, "  static func blend(", "      return dissolve(from: spun, to: b, progress: p).cropped(to: rect)\n")),
    // blur, the default dissolve, and every helper after `blend` to the end of the file
    blendFromBlur: sha(blend.slice(blend.indexOf("    case \"blur\":"))),
    // the twelve effect cases
    effectCases: sha(stretch(renderer, "  static func apply(type:", "      return tiles.cropped(to: box).composited(over: image).cropped(to: rect)\n")),
    // regionRect, scaled, colorLayer, splitChannels, scanLines, number, generated
    effectHelpers: sha(stretch(renderer, "  /// A box given as fractions of the frame", "    return f.outputImage\n  }\n")),
    // frac, hash, envelope, shakeOffset, pulseScale, flashOpacity, leakAlpha, flickerAlpha, glitchSlice
    effectMath: sha(stretch(math, "  private static let tau = 2 * Double.pi", "      split: active ? EffectMath.glitchSplit * k : 0)\n  }\n")),
  }).toEqual({
    filterChains: "0282385060299221a75f9b32bacd7e82bcd8d67fc1f6c808aef4e53db83facb9",
    lookFilter: "8206bcd0eab60916964ce2f54bbce620b090cb221aff219ecef641595528338a",
    blendToSpin: "376c99799164b7b4ac39b0da0bb319f771ca9367212fe1d92a1b012f95a5233c",
    blendFromBlur: "deac533e53570a4f92fb67ce3a22d5dc9e2b8382e610474752ae5bedce8184b6",
    effectCases: "c1dbc5e21ecb8049276cae82a4236f1593665dd2beb6f7c37cf35d95ca8c8ce0",
    effectHelpers: "b5d1cef24eec7d99d02ff4399b250d97fa10a5ca7a6d2594937452f67fdac5d7",
    effectMath: "34c12745bd6e999e0f81abb40e377d522f07e65c84a8b55bda83491cee2b4ec6",
  });
});

test("the files this round never edits are untouched", () => {
  const files = ["src/editor/model/adjust.ts", "modules/clipy-video/ios/Adjust.swift", "src/editor/components/FilterLayer.tsx", "src/editor/components/AdjustLayer.tsx"];
  expect(Object.fromEntries(files.map((f) => [f, sha(read(f))]))).toEqual({
    "src/editor/model/adjust.ts": "0e729566a0bcb3e2ff7a5ae696db2d9394ba91ebb3968d4b91846f1bbefa1bf5",
    "modules/clipy-video/ios/Adjust.swift": "65782f10d7aa023e336fbc3fcdcf24dd1dd9ef865a8ce29dd3ea5c54e6b679ff",
    "src/editor/components/FilterLayer.tsx": "79069d3bb5816bfcce7da748dc38e3ba216cf267ae30c684b1f6a25f4be574be",
    "src/editor/components/AdjustLayer.tsx": "07276de7c73342c2abff33ef2b010fbb78bfd7bd613dc4f175054eebaf232075",
  });
});
```

Run `npx.cmd jest src/editor/__tests__/looks.frozen.test.ts` → **all five PASS on the untouched tree**. (The checksums were computed on commit `9e3ad34` with line endings normalised to `\n`. If one fails before you have changed anything, stop and report — do not recompute it.)

- [ ] **Step 2: Failing tests for the change.**

`src/editor/model/__tests__/types.look.test.ts` — line 7 `toBe(16)`, line 9 `toHaveLength(21)`, line 10 `toHaveLength(20)` (line 8, the filters, stays 20: Task 2), and append:

```ts
test("the ten transitions and eight effects of 2026-10-06 follow the old ones, in this order", () => {
  expect(TRANSITION_TYPES.slice(11)).toEqual(["cover", "reveal", "coverUp", "revealDown", "circleOpen", "circleClose", "wipeDiagonal", "wipeClock", "pixelate", "flashWhite"]);
  expect(EFFECT_IDS.slice(12)).toEqual(["filmBurn", "lensFlare", "dust", "heartbeat", "hueShift", "mirror", "softEdges", "strobe"]);
  expect(new Set(TRANSITION_TYPES).size).toBe(21);
  expect(new Set(EFFECT_IDS).size).toBe(20);
  // A new effect is an ordinary full-frame effect: no rectangle.
  for (const type of EFFECT_IDS.slice(12)) expect(makeEffect({ id: "e", type }).rect).toBeNull();
});
```

`src/editor/__tests__/effects.test.ts` — line 29 `toHaveLength(21)`; line 62 `toHaveLength(20)`; line 64 becomes

```ts
  expect(EFFECT_IDS.map((id) => EFFECTS[id].label)).toEqual(["Glitch", "Shake", "Zoom pulse", "Blur", "VHS", "Light leak", "Flash", "RGB split", "Old film", "Glow", "Blur box", "Mosaic box",
    "Film burn", "Lens flare", "Dust", "Heartbeat", "Hue shift", "Mirror", "Soft edges", "Strobe"]);
  expect(EFFECT_IDS.slice(12).map((id) => EFFECTS[id].icon)).toEqual(["flame-outline", "aperture-outline", "snow-outline", "fitness-outline", "color-palette-outline", "swap-horizontal-outline", "ellipse-outline", "flashlight-outline"]);
  expect(TRANSITION_TYPES.slice(11).map((t) => TRANSITIONS[t].label)).toEqual(["Cover left", "Reveal left", "Cover up", "Reveal down", "Circle open", "Circle close", "Diagonal wipe", "Clock wipe", "Pixelate", "White flash"]);
  // Under a 72-pt tile: at most two words, sentence case.
  for (const id of EFFECT_IDS) { expect(EFFECTS[id].label.split(" ").length).toBeLessThanOrEqual(2); expect(EFFECTS[id].icon.endsWith("-outline")).toBe(true); }
```

`src/editor/model/__tests__/migrate.test.ts` — append (add `makeEffect`, `makeClip`, `makeProject`, `EFFECT_IDS`, `FILTER_IDS`, `TRANSITION_TYPES` to the `../types` import if missing):

```ts
test("PROOF v15 → v16: the migration changes the number and nothing else — every filter, transition and effect a v15 project could hold is kept as stored", () => {
  // One clip per old filter (strengths differ), each cut with an old transition; one effect per old effect type.
  const oldFilters = FILTER_IDS.slice(0, 20), oldTransitions = TRANSITION_TYPES.slice(1, 11), oldEffects = EFFECT_IDS.slice(0, 12);
  const clips = oldFilters.map((f, i) => makeClip({ id: `c${i}`, sourceDuration: 4, filter: f === "none" ? null : f, filterIntensity: (i + 1) / 20,
    transitionOut: i < oldFilters.length - 1 ? { type: oldTransitions[i % oldTransitions.length], duration: 0.5 } : { type: "none", duration: 0 } }));
  const effects = oldEffects.map((type, i) => makeEffect({ id: `e${i}`, type, start: i, end: i + 1.5, intensity: 0.1 + i * 0.07 }));
  const now = makeProject({ clips, effects });
  expect(migrateProject(now)).toEqual(now);                       // the fixture is a clean v16 project
  const v15 = JSON.parse(JSON.stringify(now)) as { schemaVersion: number };
  v15.schemaVersion = 15;
  const frozen = JSON.stringify(v15);
  const p = migrateProject(v15);
  expect(JSON.stringify(v15)).toBe(frozen);                       // the stored object is not mutated
  expect({ ...p, schemaVersion: 15 }).toEqual(v15);               // nothing but the number differs from the file
  expect(p.schemaVersion).toBe(16);
  expect(migrateProject(p)).toEqual(p);
});

test("the new transition and effect ids survive the sanity pass; an id nobody knows is still repaired", () => {
  const p = migrateProject(makeProject({
    clips: [makeClip({ id: "a", sourceDuration: 4, transitionOut: { type: "wipeClock", duration: 0.6 } }), makeClip({ id: "b", sourceDuration: 4, transitionOut: { type: "flashWhite", duration: 0.4 } }),
      { ...makeClip({ id: "c", sourceDuration: 4 }), transitionOut: { type: "swirl", duration: 0.5 } } as unknown as Clip, makeClip({ id: "d", sourceDuration: 4 })],
    effects: [makeEffect({ id: "e1", type: "heartbeat" }), makeEffect({ id: "e2", type: "strobe" }), { ...makeEffect({ id: "e3" }), type: "sparkle" } as unknown as EffectItem],
  }));
  expect(p.clips.map((c) => c.transitionOut)).toEqual([{ type: "wipeClock", duration: 0.6 }, { type: "flashWhite", duration: 0.4 }, { type: "dissolve", duration: 0.5 }, { type: "none", duration: 0 }]);
  expect(p.effects.map((e) => e.type)).toEqual(["heartbeat", "strobe"]);
});
```

- [ ] **Step 3: Run** `npx.cmd jest src/editor/model/__tests__/types.look.test.ts src/editor/__tests__/effects.test.ts src/editor/model/__tests__/migrate.test.ts` → the edited and new tests FAIL.
- [ ] **Step 4: Implement.**

`src/editor/model/types.ts`: `SCHEMA_VERSION = 16`; `TRANSITION_TYPES` and `EFFECT_IDS` as in Produces (keep the existing comment `// "slide" keeps its id and is labelled "Slide left"`). Nothing else.

`src/editor/model/migrate.ts` — comments only: `Brings a v2–v16 file to a safe v16 shape`; append to that comment `, and v15 → v16 adds nothing (the number only keeps an older build from repairing the ids of 2026-10-06 away)`; `// v2 → v16 and the sanity pass are the same idempotent step …`.

`src/editor/effects.ts`:

```ts
export const TRANSITIONS: Record<TransitionType, { label: string }> = {
  /* …the three existing lines, unchanged… */
  cover: { label: "Cover left" }, reveal: { label: "Reveal left" }, coverUp: { label: "Cover up" }, revealDown: { label: "Reveal down" },
  circleOpen: { label: "Circle open" }, circleClose: { label: "Circle close" }, wipeDiagonal: { label: "Diagonal wipe" }, wipeClock: { label: "Clock wipe" },
  pixelate: { label: "Pixelate" }, flashWhite: { label: "White flash" },
};
// EFFECTS — after the mosaicBox line:
  filmBurn:  { label: "Film burn",  icon: "flame-outline" },
  lensFlare: { label: "Lens flare", icon: "aperture-outline" },
  dust:      { label: "Dust",       icon: "snow-outline" },
  heartbeat: { label: "Heartbeat",  icon: "fitness-outline" },
  hueShift:  { label: "Hue shift",  icon: "color-palette-outline" },
  mirror:    { label: "Mirror",     icon: "swap-horizontal-outline" },
  softEdges: { label: "Soft edges", icon: "ellipse-outline" },
  strobe:    { label: "Strobe",     icon: "flashlight-outline" },
```

`modules/clipy-video/ios/Effects.swift` — the two lists gain the same ids, in the same order (one line each, as today; `filterIds` is not touched).

`modules/clipy-video/ios/EffectRenderer.swift` — in `apply`, between the end of the `mosaicBox` branch and `default:` insert exactly:

```swift
    // The eight effects of 2026-10-06. A line marked PLACEHOLDER hands the frame back until its renderer lands.
    case "filmBurn": return image    // MORE-LOOKS-PLACEHOLDER
    case "lensFlare": return image    // MORE-LOOKS-PLACEHOLDER
    case "dust": return image    // MORE-LOOKS-PLACEHOLDER
    case "heartbeat": return image    // MORE-LOOKS-PLACEHOLDER
    case "hueShift": return image    // MORE-LOOKS-PLACEHOLDER
    case "mirror": return image    // MORE-LOOKS-PLACEHOLDER
    case "softEdges": return image    // MORE-LOOKS-PLACEHOLDER
    case "strobe": return image    // MORE-LOOKS-PLACEHOLDER
```

`modules/clipy-video/ios/ClipyCompositor.swift` — in `blend`, between the last line of the `spin` branch (`return dissolve(from: spun, to: b, progress: p).cropped(to: rect)`) and `case "blur":` insert exactly (**before** Blur: two existing tests read the text from `case "blur"` to `default:`):

```swift
    // The ten transitions of 2026-10-06. A line marked PLACEHOLDER dissolves until its blend lands.
    case "cover": return dissolve(from: a, to: b, progress: p).cropped(to: rect)    // MORE-LOOKS-PLACEHOLDER
    case "reveal": return dissolve(from: a, to: b, progress: p).cropped(to: rect)    // MORE-LOOKS-PLACEHOLDER
    case "coverUp": return dissolve(from: a, to: b, progress: p).cropped(to: rect)    // MORE-LOOKS-PLACEHOLDER
    case "revealDown": return dissolve(from: a, to: b, progress: p).cropped(to: rect)    // MORE-LOOKS-PLACEHOLDER
    case "circleOpen": return dissolve(from: a, to: b, progress: p).cropped(to: rect)    // MORE-LOOKS-PLACEHOLDER
    case "circleClose": return dissolve(from: a, to: b, progress: p).cropped(to: rect)    // MORE-LOOKS-PLACEHOLDER
    case "wipeDiagonal": return dissolve(from: a, to: b, progress: p).cropped(to: rect)    // MORE-LOOKS-PLACEHOLDER
    case "wipeClock": return dissolve(from: a, to: b, progress: p).cropped(to: rect)    // MORE-LOOKS-PLACEHOLDER
    case "pixelate": return dissolve(from: a, to: b, progress: p).cropped(to: rect)    // MORE-LOOKS-PLACEHOLDER
    case "flashWhite": return dissolve(from: a, to: b, progress: p).cropped(to: rect)    // MORE-LOOKS-PLACEHOLDER
```

`modules/clipy-video/ios/Tests/EffectMathTests.swift` line 154: `XCTAssertEqual(Effects.effectIds.count, 20)`.

`src/__tests__/noHexLiterals.test.ts` — add to `ALLOW`, after `"src/editor/model/adjust.ts"`: `"src/editor/model/filterRecipes.ts", "src/editor/model/transitionMath.ts",` (content colours burned into the video; the files arrive in Tasks 2 and 4).

**Pinned values (edit each by hand, found with Grep — only a `15` that stands for the schema version):**
- `migrate.test.ts`: `toBe(15)` at lines 115, 126, 159, 221, 254, 320, 370, 427, 513, 538; `schemaVersion: 15` at 360, 487, 503; the titles at 358 and 478 (`reaches v16`). The title at 516 keeps "v14 → v15" (that step is what it describes) and its body keeps `v14.schemaVersion = 14`.
- `types.audio.test.ts` (6, 7, 45), `types.clip.test.ts` (6), `types.layers.test.ts` (4), `types.layers2.test.ts` (4, 56), `types.motion.test.ts` (7, 8), `types.polish.test.ts` (3, 4, 9), `types.speed.test.ts` (9, 10), `types.text.test.ts` (6, 105). `describe("the box fields (schema v15)"` at `types.text.test.ts` 108 keeps its name.
- `types.layers2.test.ts` line 9: `expect(EFFECT_IDS.slice(10, 12)).toEqual(["blurBox", "mosaicBox"]);`
- `EffectSheet.test.tsx` line 20 title `is titled Effects and shows a tile for every effect`, line 23 `toHaveLength(20)`. `strips.r2.test.tsx` line 16: the words `the twelve tiles` → `its tiles` (its count already reads `EFFECT_IDS.length`).

- [ ] **Step 5:** `npm run typecheck`; `npm test` — green, **`looks.frozen.test.ts` still green and unedited**, `effectMath.parity.test.ts` (one case per effect id) and the `blend` case test in `effects.test.ts` green without an edit.
- [ ] **Step 6: Commit** — `git add` the files above by path; `feat(model): schema v16 — ten transition and eight effect ids, labels and icons; existing looks frozen by test`.

---

### Task 2: The twelve filters — ids, recipe pair, split tone, preview recipes, the `look` hook

**Depends on:** Task 1. **Parallel-safe with:** Tasks 3, 4.

**Files:** Create `src/editor/model/filterRecipes.ts`, `modules/clipy-video/ios/FilterRecipes.swift`, `src/editor/model/__tests__/filterRecipes.vectors.ts`, `src/editor/model/__tests__/filterRecipes.test.ts`, `src/editor/model/__tests__/filterRecipes.parity.test.ts`, `modules/clipy-video/ios/Tests/FilterRecipeTests.swift`. Modify `src/editor/model/types.ts` (`FILTER_IDS` only), `src/editor/effects.ts` (`FILTERS` + one import), `modules/clipy-video/ios/Effects.swift` (`filterIds` only), `modules/clipy-video/ios/ClipyCompositor.swift` (`look`: one `else if`), `src/editor/__tests__/effects.test.ts` (line 20 and the test at 79–81), `src/editor/model/__tests__/types.look.test.ts` (line 8).

**Do not touch:** `adjust.ts`, `Adjust.swift`, `Effects.filterChain`, `Effects.apply`, `FilterLayer.tsx`, `FilterSheet.tsx` (Task 7), `ClipyCompositor.blend` (Tasks 1, 9), everything under "Never edited this round".

**Interfaces — Consumes:** `adjustRecipe`, `type AdjustStep` (`adjust.ts`); `Adjust.steps`, `Adjust.apply`, `Adjust.filtered`, `AdjustValues`, `AdjustStep` (`Adjust.swift`); `ClipyCompositor.dissolve`; `LayerBackground.isHexColor`; `UIColor(hex:)`.

**Interfaces — Produces**

```ts
// src/editor/model/filterRecipes.ts
export const RECIPE_FILTER_IDS = ["kodak", "fuji", "matte", "bleach", "dusk", "moody", "tealOrange", "blush", "grit", "silver", "indigo", "drama"] as const;
export type RecipeFilterId = (typeof RECIPE_FILTER_IDS)[number];
export interface SplitTone { shadow: string; highlight: string; amount: number }       // #RRGGBB, #RRGGBB, 0…1
export interface FilterRecipe { adjust: Partial<ClipAdjust>; tone: SplitTone | null; veil: { color: string; opacity: number } }
export const FILTER_RECIPES: Record<RecipeFilterId, FilterRecipe>;
export const BEFORE_TONE: readonly AdjustKey[];                                        // the colour stage; every other key is the finishing stage
export type FilterStep = AdjustStep | ({ kind: "splitTone" } & SplitTone);
export const isRecipeFilter: (id: string | null | undefined) => id is RecipeFilterId;
export function filterStages(id: string | null | undefined): { before: ClipAdjust; tone: SplitTone | null; after: ClipAdjust } | null;
export function filterSteps(id: string | null | undefined): FilterStep[];              // [] for the 20 old ids, null and unknown ids
export const FILTER_PREVIEW: { fadeLift: 0.1 };
export function filterPreviewOf(id: RecipeFilterId): FilterPreview;
```

```swift
// FilterRecipes.swift
struct SplitTone: Equatable { let shadow: String; let highlight: String; let amount: Double }
struct FilterRecipe: Equatable { let adjust: AdjustValues; let tone: SplitTone? }
enum FilterStep: Equatable { case adjust(AdjustStep); case splitTone(shadow: String, highlight: String, amount: Double) }
enum FilterRecipes {
  static let ids: [String]
  static let recipes: [String: FilterRecipe]
  static func stages(_ id: String?) -> (before: AdjustValues, tone: SplitTone?, after: AdjustValues)?
  static func steps(_ id: String?) -> [FilterStep]
  static func apply(_ id: String?, to image: CIImage, time: Double) -> CIImage?      // nil = not a recipe filter
  static func splitTone(_ image: CIImage, tone: SplitTone) -> CIImage
}
```

- [ ] **Step 1: Failing tests.**

Create `src/editor/model/__tests__/filterRecipes.vectors.ts`:

```ts
import type { FilterStep, RecipeFilterId } from "../filterRecipes";

/**
 * What each recipe filter does, step by step — shared with the Swift mirror (the `filterVectors` table in
 * modules/clipy-video/ios/Tests/FilterRecipeTests.swift, compared line for line by filterRecipes.parity.test.ts).
 * Plain literals, computed by hand from the Adjust constants: temperature x = 6500 − 2500·v, tint y = 100·v, brightness 0.25·v,
 * contrast 1 + 0.5·v, saturation 1 + v, curve y0 = 0.25·fade, y1 = 0.25 + 0.15·shadows, y3 = 0.75 + 0.15·highlights,
 * sharpen 1.2·v, vignette 1.5·v (radius 1.5), grain 0.25·v.
 */
export interface FilterVector { id: RecipeFilterId; steps: FilterStep[] }

const TT = (x: number, y: number): FilterStep => ({ kind: "temperatureTint", neutral: [6500, 0], target: [x, y] });
const CC = (brightness: number, contrast: number, saturation: number): FilterStep => ({ kind: "colorControls", brightness, contrast, saturation });
const CURVE = (y0: number, y1: number, y3: number): FilterStep => ({ kind: "toneCurve", points: [[0, y0], [0.25, y1], [0.5, 0.5], [0.75, y3], [1, 1]] });
const TONE = (shadow: string, highlight: string, amount: number): FilterStep => ({ kind: "splitTone", shadow, highlight, amount });
const SHARP = (sharpness: number): FilterStep => ({ kind: "sharpen", sharpness });
const VIG = (intensity: number): FilterStep => ({ kind: "vignette", intensity, radius: 1.5 });
const GRAIN = (opacity: number): FilterStep => ({ kind: "grain", opacity });

export const FILTER_VECTORS: FilterVector[] = [
  // 6500 − 2500·0.2 = 6000 ; contrast 1 + 0.5·0.15 = 1.075, saturation 1.15 ; fade 0.25·0.08 = 0.02 ; grain 0.25·0.15 = 0.0375
  { id: "kodak", steps: [TT(6000, 0), CC(0, 1.075, 1.15), TONE("#27413A", "#FFC98A", 0.25), CURVE(0.02, 0.25, 0.75), GRAIN(0.0375)] },
  // 6500 + 2500·0.12 = 6800, tint 100·−0.15 = −15 ; 1.05, 1.1 ; fade 0.025
  { id: "fuji", steps: [TT(6800, -15), CC(0, 1.05, 1.1), TONE("#1F4A45", "#F2F5E6", 0.2), CURVE(0.025, 0.25, 0.75)] },
  // 6500 − 200 = 6300 ; 1 − 0.125 = 0.875, 0.8 ; fade 0.175 ; grain 0.075
  { id: "matte", steps: [TT(6300, 0), CC(0, 0.875, 0.8), CURVE(0.175, 0.25, 0.75), GRAIN(0.075)] },
  // brightness 0.25·−0.05 = −0.0125 ; 1.25, 0.45 ; sharpen 0.24 ; grain 0.05
  { id: "bleach", steps: [CC(-0.0125, 1.25, 0.45), SHARP(0.24), GRAIN(0.05)] },
  // 6500 − 375 = 6125, tint 30 ; −0.025, 1, 1.15 ; vignette 1.5·0.25 = 0.375
  { id: "dusk", steps: [TT(6125, 30), CC(-0.025, 1, 1.15), TONE("#3B2A6B", "#FF9E6B", 0.35), VIG(0.375)] },
  // 6500 + 875 = 7375 ; −0.03, 1.125, 0.7 ; fade 0.0375 ; vignette 0.525
  { id: "moody", steps: [TT(7375, 0), CC(-0.03, 1.125, 0.7), CURVE(0.0375, 0.25, 0.75), VIG(0.525)] },
  { id: "tealOrange", steps: [CC(0, 1.1, 1.1), TONE("#0E6E78", "#FF9A45", 0.5)] },
  // tint 25 ; 0.05, 0.9, 0.85 ; fade 0.075
  { id: "blush", steps: [TT(6500, 25), CC(0.05, 0.9, 0.85), TONE("#8A5A7A", "#FFE3EA", 0.25), CURVE(0.075, 0.25, 0.75)] },
  // 1.35, 0 ; shadows 0.25 − 0.06 = 0.19 ; sharpen 0.6 ; vignette 0.45 ; grain 0.15
  { id: "grit", steps: [CC(0, 1.35, 0), CURVE(0, 0.19, 0.75), SHARP(0.6), VIG(0.45), GRAIN(0.15)] },
  // 0.9, 0 ; fade 0.1125, highlights 0.75 − 0.03 = 0.72 ; grain 0.0375
  { id: "silver", steps: [CC(0, 0.9, 0), CURVE(0.1125, 0.25, 0.72), GRAIN(0.0375)] },
  { id: "indigo", steps: [CC(0, 1.075, 0), TONE("#10214F", "#DCE9FF", 0.8)] },
  // −0.0375, 1.25, 0.75 ; shadows 0.25 − 0.075 = 0.175 ; sharpen 0.24 ; vignette 0.9
  { id: "drama", steps: [CC(-0.0375, 1.25, 0.75), CURVE(0, 0.175, 0.75), SHARP(0.24), VIG(0.9)] },
];
```

Create `src/editor/model/__tests__/filterRecipes.test.ts`:

```ts
import { FILTERS } from "@/src/editor/effects";
import { adjustRecipe } from "../adjust";
import { BEFORE_TONE, FILTER_RECIPES, RECIPE_FILTER_IDS, filterPreviewOf, filterStages, filterSteps, isRecipeFilter, type FilterStep } from "../filterRecipes";
import { ADJUST_KEYS, ADJUST_RANGE, DEFAULT_ADJUST, FILTER_IDS, isHexColor } from "../types";
import { FILTER_VECTORS } from "./filterRecipes.vectors";

/** A step as its numbers and strings, in declaration order. */
const flat = (s: FilterStep): (number | string)[] => {
  switch (s.kind) {
    case "exposure": return [s.ev];
    case "temperatureTint": return [...s.neutral, ...s.target];
    case "colorControls": return [s.brightness, s.contrast, s.saturation];
    case "toneCurve": return s.points.flat();
    case "sharpen": return [s.sharpness];
    case "vignette": return [s.intensity, s.radius];
    case "grain": return [s.opacity];
    case "splitTone": return [s.shadow, s.highlight, s.amount];
  }
};

test("the twelve recipe filters are the twelve ids after the old twenty, with one-word labels", () => {
  expect(FILTER_IDS).toHaveLength(32);
  expect(FILTER_IDS.slice(20)).toEqual([...RECIPE_FILTER_IDS]);
  expect(Object.keys(FILTER_RECIPES)).toEqual([...RECIPE_FILTER_IDS]);
  expect(RECIPE_FILTER_IDS.map((id) => FILTERS[id].label)).toEqual(["Kodak", "Fuji", "Matte", "Bleach", "Dusk", "Moody", "Cinema", "Blush", "Grit", "Silver", "Indigo", "Drama"]);
  // A filter tile is 52 pt wide: one short word.
  for (const id of RECIPE_FILTER_IDS) { expect(FILTERS[id].label).toMatch(/^[A-Z][a-z]{2,6}$/); expect(isRecipeFilter(id)).toBe(true); }
  for (const id of FILTER_IDS.slice(0, 20)) expect(isRecipeFilter(id)).toBe(false);
  expect(new Set(FILTER_IDS.map((id) => FILTERS[id].label)).size).toBe(32);          // no label twice
});

test("every row is inside the Adjust ranges, its colours are #RRGGBB, its amount and veil are fractions", () => {
  for (const id of RECIPE_FILTER_IDS) {
    const r = FILTER_RECIPES[id];
    for (const [k, v] of Object.entries(r.adjust)) {
      expect(ADJUST_KEYS).toContain(k);
      const [lo, hi] = ADJUST_RANGE[k as keyof typeof ADJUST_RANGE];
      expect(v).toBeGreaterThanOrEqual(lo); expect(v).toBeLessThanOrEqual(hi); expect(v).not.toBe(0);
    }
    if (r.tone) { expect(isHexColor(r.tone.shadow)).toBe(true); expect(isHexColor(r.tone.highlight)).toBe(true); expect(r.tone.amount).toBeGreaterThan(0); expect(r.tone.amount).toBeLessThanOrEqual(1); }
    expect(isHexColor(r.veil.color)).toBe(true); expect(r.veil.opacity).toBeGreaterThanOrEqual(0); expect(r.veil.opacity).toBeLessThanOrEqual(0.5);
  }
  expect(RECIPE_FILTER_IDS.filter((id) => FILTER_RECIPES[id].tone)).toEqual(["kodak", "fuji", "dusk", "tealOrange", "blush", "indigo"]);   // six need the split tone, six do not
});

test.each(FILTER_VECTORS.map((v) => [v.id, v] as const))("steps: %s", (_id, v) => {
  const got = filterSteps(v.id);
  expect(got.map((s) => s.kind)).toEqual(v.steps.map((s) => s.kind));
  got.forEach((step, i) => {
    const want = flat(v.steps[i]);
    expect(flat(step)).toHaveLength(want.length);
    flat(step).forEach((n, j) => (typeof n === "number" ? expect(n).toBeCloseTo(want[j] as number, 9) : expect(n).toBe(want[j])));
  });
});

test("one vector per filter; the two stages are the untouched adjustRecipe; the tone sits between them", () => {
  expect(FILTER_VECTORS.map((v) => v.id)).toEqual([...RECIPE_FILTER_IDS]);
  expect(BEFORE_TONE).toEqual(["exposure", "temperature", "tint", "brightness", "contrast", "saturation"]);
  for (const id of RECIPE_FILTER_IDS) {
    const s = filterStages(id)!;
    expect({ ...DEFAULT_ADJUST, ...FILTER_RECIPES[id].adjust }).toEqual(Object.fromEntries(ADJUST_KEYS.map((k) => [k, BEFORE_TONE.includes(k) ? s.before[k] : s.after[k]])));
    for (const k of ADJUST_KEYS) expect(BEFORE_TONE.includes(k) ? s.after[k] : s.before[k]).toBe(0);
    const tone = s.tone ? [{ kind: "splitTone", ...s.tone }] : [];
    expect(filterSteps(id)).toEqual([...adjustRecipe(s.before), ...tone, ...adjustRecipe(s.after)]);
    // Colour first, finish last: nothing of the colour stage comes after the tone.
    const kinds = filterSteps(id).map((x) => x.kind), at = kinds.indexOf("splitTone");
    if (at >= 0) { expect(kinds.slice(at + 1).some((k) => ["exposure", "temperatureTint", "colorControls"].includes(k))).toBe(false); expect(kinds.slice(0, at).some((k) => ["toneCurve", "sharpen", "vignette", "grain"].includes(k))).toBe(false); }
  }
});

test("an old filter, None, null and an unknown id have no recipe steps (they are drawn as they always were)", () => {
  for (const id of [...FILTER_IDS.slice(0, 20), null, undefined, "sparkle"]) { expect(filterSteps(id)).toEqual([]); expect(filterStages(id)).toBeNull(); }
});

test("the preview recipe is computed from the row: the veil, 1 + saturation, 0.25·brightness + 0.1·fade", () => {
  // kodak: 1 + 0.15 ; 0.1·0.08 = 0.008        matte: 0.8 ; 0.1·0.7 = 0.07        bleach: 0.45 ; 0.25·−0.05 = −0.0125
  expect(filterPreviewOf("kodak")).toEqual({ tint: "#FFB45A", tintOpacity: 0.14, saturation: 1.15, brightness: 0.008 });
  expect(filterPreviewOf("matte")).toEqual({ tint: "#D9D2C5", tintOpacity: 0.18, saturation: 0.8, brightness: 0.07 });
  expect(filterPreviewOf("bleach")).toEqual({ tint: "#000000", tintOpacity: 0, saturation: 0.45, brightness: -0.0125 });
  // blush: 0.85 ; 0.25·0.2 + 0.1·0.3 = 0.08        silver: 0 ; 0.045        drama: 0.75 ; −0.0375
  expect(filterPreviewOf("blush")).toEqual({ tint: "#FFB3C7", tintOpacity: 0.18, saturation: 0.85, brightness: 0.08 });
  expect(filterPreviewOf("silver")).toEqual({ tint: "#C9CED6", tintOpacity: 0.14, saturation: 0, brightness: 0.045 });
  expect(filterPreviewOf("drama")).toEqual({ tint: "#000000", tintOpacity: 0.2, saturation: 0.75, brightness: -0.0375 });
  for (const id of RECIPE_FILTER_IDS) expect(FILTERS[id].preview).toEqual(filterPreviewOf(id));
  for (const id of ["grit", "silver", "indigo"] as const) expect(FILTERS[id].preview.saturation).toBe(0);      // the three black-and-whites
});
```

Create `src/editor/model/__tests__/filterRecipes.parity.test.ts`:

```ts
import { readFileSync } from "fs";
import { join } from "path";
import { BEFORE_TONE, FILTER_RECIPES, RECIPE_FILTER_IDS, type FilterStep } from "../filterRecipes";
import { ADJUST_KEYS, DEFAULT_ADJUST } from "../types";
import { FILTER_VECTORS } from "./filterRecipes.vectors";

const iosDir = join(__dirname, "../../../../modules/clipy-video/ios");
const read = (file: string) => readFileSync(join(iosDir, file), "utf8").replace(/\r\n/g, "\n");
const swift = read("FilterRecipes.swift");
const table = read("Tests/FilterRecipeTests.swift");
const compositor = read("ClipyCompositor.swift");
const code = (source: string) => source.replace(/\/\/[^\n]*/g, "");
const between = (source: string, from: string, to: string): string => {
  const start = source.indexOf(from);
  if (start < 0) throw new Error(`"${from}" not found`);
  const end = source.indexOf(to, start + from.length);
  return source.slice(start, end < 0 ? undefined : end);
};
const fmt = (n: number) => String(n);
const point = (p: readonly [number, number]) => `AdjustPoint(${fmt(p[0])}, ${fmt(p[1])})`;
/** One step as it is written in the Swift table. */
const swiftStep = (s: FilterStep): string => {
  switch (s.kind) {
    case "exposure": return `.adjust(.exposure(ev: ${fmt(s.ev)}))`;
    case "temperatureTint": return `.adjust(.temperatureTint(neutral: ${point(s.neutral)}, target: ${point(s.target)}))`;
    case "colorControls": return `.adjust(.colorControls(brightness: ${fmt(s.brightness)}, contrast: ${fmt(s.contrast)}, saturation: ${fmt(s.saturation)}))`;
    case "toneCurve": return `.adjust(.toneCurve(points: [${s.points.map(point).join(", ")}]))`;
    case "sharpen": return `.adjust(.sharpen(sharpness: ${fmt(s.sharpness)}))`;
    case "vignette": return `.adjust(.vignette(intensity: ${fmt(s.intensity)}, radius: ${fmt(s.radius)}))`;
    case "grain": return `.adjust(.grain(opacity: ${fmt(s.opacity)}))`;
    case "splitTone": return `.splitTone(shadow: "${s.shadow}", highlight: "${s.highlight}", amount: ${fmt(s.amount)})`;
  }
};

test("FilterRecipes.swift holds the same twelve rows, value for value, in the same order", () => {
  const ids = [...between(swift, "static let ids", "]").matchAll(/"(\w+)"/g)].map((m) => m[1]);
  expect(ids).toEqual([...RECIPE_FILTER_IDS]);
  expect([...swift.matchAll(/"(\w+)": FilterRecipe\(/g)].map((m) => m[1])).toEqual([...RECIPE_FILTER_IDS]);
  for (const id of RECIPE_FILTER_IDS) {
    const r = FILTER_RECIPES[id], a = { ...DEFAULT_ADJUST, ...r.adjust };
    const tone = r.tone ? `SplitTone(shadow: "${r.tone.shadow}", highlight: "${r.tone.highlight}", amount: ${fmt(r.tone.amount)})` : "nil";
    expect(swift).toContain(`    "${id}": FilterRecipe(adjust: AdjustValues(${ADJUST_KEYS.map((k) => `${k}: ${fmt(a[k])}`).join(", ")}), tone: ${tone}),`);
  }
});

test("the colour stage is the same six keys on both sides; both stages go through the untouched Adjust functions", () => {
  const stages = code(between(swift, "static func stages(", "\n  }\n"));
  expect([...stages.matchAll(/before\.(\w+) = a\.(\w+)/g)].map((m) => [m[1], m[2]])).toEqual(BEFORE_TONE.map((k) => [k, k]));
  expect([...stages.matchAll(/after\.(\w+) = a\.(\w+)/g)].map((m) => m[1])).toEqual(ADJUST_KEYS.filter((k) => !BEFORE_TONE.includes(k)));
  const apply = code(between(swift, "static func apply(", "\n  }\n"));
  const order = ["Adjust.apply(s.before", "splitTone(", "Adjust.apply(s.after"].map((s) => apply.indexOf(s));
  expect(order.every((i) => i >= 0)).toBe(true);
  expect([...order].sort((x, y) => x - y)).toEqual(order);
  const steps = code(between(swift, "static func steps(", "\n  }\n"));
  expect(steps).toContain("Adjust.steps(s.before)"); expect(steps).toContain("Adjust.steps(s.after)");
});

test("the split tone: brightness mapped onto the two colours, soft light over the frame, mixed by the amount — every filter through the guarded helper", () => {
  const body = code(between(swift, "static func splitTone(", "\n  }\n"));
  expect([...body.matchAll(/"(CI\w+)"/g)].map((m) => m[1])).toEqual(["CIFalseColor", "CISoftLightBlendMode"]);
  expect([...body.matchAll(/Adjust\.filtered\(/g)]).toHaveLength(2);
  expect(body).toContain("\"inputColor0\": CIColor(color: UIColor(hex: tone.shadow))");
  expect(body).toContain("\"inputColor1\": CIColor(color: UIColor(hex: tone.highlight))");
  expect(body).toContain("ClipyCompositor.dissolve(from: image");
  expect(body).toMatch(/else \{ return image \}/);
  // No filter is made any other way in the file.
  expect(code(swift)).not.toMatch(/CIFilter\(name:|applyingFilter\(/);
});

test("the compositor: the old chain block is as it was; a recipe filter takes the branch after it, with the same strength mix", () => {
  const look = between(compositor, "static func look(", "\n  }\n");
  const at = ["if !chain.isEmpty, spec.filterIntensity > 0 {", "} else if spec.filterIntensity > 0, let filtered = FilterRecipes.apply(spec.filter, to: img, time: time) {", "return spec.adjust.isNeutral ? out : Adjust.apply(spec.adjust, to: out, time: time)"].map((s) => look.indexOf(s));
  expect(at.every((i) => i >= 0)).toBe(true);
  expect([...at].sort((x, y) => x - y)).toEqual(at);
  expect([...look.matchAll(/dissolve\(from: img, to: filtered, progress: CGFloat\(spec\.filterIntensity\)\)\.cropped\(to: img\.extent\)/g)]).toHaveLength(2);
  expect([...compositor.matchAll(/FilterRecipes\.apply\(/g)]).toHaveLength(1);
});

describe("the Swift test table embeds every FILTER_VECTORS case", () => {
  it("has the same number of cases", () => expect([...table.matchAll(/FilterVector\(id: "/g)]).toHaveLength(FILTER_VECTORS.length));
  it.each(FILTER_VECTORS.map((v) => [v.id, v] as const))("%s", (_id, v) => {
    expect(table).toContain(`  FilterVector(id: "${v.id}", expect: [${v.steps.map(swiftStep).join(", ")}]),`);
  });
});
```

`src/editor/__tests__/effects.test.ts` — line 20 `toHaveLength(32)`; replace the test at lines 79–81 with:

```ts
test("every filter has its export recipe in exactly one place: the nineteen old ones a case in Effects.filterChain, the twelve of 2026-10-06 a row in FilterRecipes.swift", () => {
  const recipes = readFileSync(join(__dirname, "../../../modules/clipy-video/ios/FilterRecipes.swift"), "utf8");
  for (const id of FILTER_IDS.slice(1, 20)) { expect(swift).toContain(`case "${id}":`); expect(recipes).not.toContain(`"${id}": FilterRecipe(`); }
  for (const id of FILTER_IDS.slice(20)) { expect(recipes).toContain(`"${id}": FilterRecipe(`); expect(swift).not.toContain(`case "${id}":`); }
  expect(FILTER_IDS.slice(20)).toHaveLength(12);
});
```

`src/editor/model/__tests__/types.look.test.ts` line 8: `toHaveLength(32)`.

- [ ] **Step 2: Run** `npx.cmd jest src/editor/model/__tests__/filterRecipes src/editor/__tests__/effects.test.ts src/editor/model/__tests__/types.look.test.ts` → FAIL (no module, no ids).
- [ ] **Step 3: Implement.**

Create `src/editor/model/filterRecipes.ts`:

```ts
import type { FilterPreview } from "../effects";
import { adjustRecipe, type AdjustStep } from "./adjust";
import { ADJUST_KEYS, DEFAULT_ADJUST, type AdjustKey, type ClipAdjust } from "./types";

/**
 * The twelve filters of 2026-10-06. Mirrored by modules/clipy-video/ios/FilterRecipes.swift: keep the ids, the rows and the
 * stage rule identical (filterRecipes.parity.test.ts). A filter is one ROW: Adjust values (run through the untouched `adjustRecipe` /
 * `Adjust.apply`) and, for six of them, a split tone between the colour stage and the finishing stage. The 20 older filters are
 * not here — their Core Image chains stay in Effects.swift, their preview recipes in effects.ts.
 */
export const RECIPE_FILTER_IDS = ["kodak", "fuji", "matte", "bleach", "dusk", "moody", "tealOrange", "blush", "grit", "silver", "indigo", "drama"] as const;
export type RecipeFilterId = (typeof RECIPE_FILTER_IDS)[number];

/** Shadows take `shadow`, highlights `highlight` (#RRGGBB); `amount` 0…1 is how much of the toned picture is mixed in. */
export interface SplitTone { shadow: string; highlight: string; amount: number }
/** `adjust`: the non-zero Adjust values. `veil`: the one flat tint the Expo Go preview lays over the picture (preview only). */
export interface FilterRecipe { adjust: Partial<ClipAdjust>; tone: SplitTone | null; veil: { color: string; opacity: number } }

/** Content values (burned into the video), allow-listed in noHexLiterals.test.ts. */
export const FILTER_RECIPES: Record<RecipeFilterId, FilterRecipe> = {
  kodak:      { adjust: { temperature: 0.2, contrast: 0.15, saturation: 0.15, fade: 0.08, grain: 0.15 }, tone: { shadow: "#27413A", highlight: "#FFC98A", amount: 0.25 }, veil: { color: "#FFB45A", opacity: 0.14 } },
  fuji:       { adjust: { temperature: -0.12, tint: -0.15, contrast: 0.1, saturation: 0.1, fade: 0.1 }, tone: { shadow: "#1F4A45", highlight: "#F2F5E6", amount: 0.2 }, veil: { color: "#4FD1B5", opacity: 0.12 } },
  matte:      { adjust: { temperature: 0.08, contrast: -0.25, saturation: -0.2, fade: 0.7, grain: 0.3 }, tone: null, veil: { color: "#D9D2C5", opacity: 0.18 } },
  bleach:     { adjust: { brightness: -0.05, contrast: 0.5, saturation: -0.55, sharpen: 0.2, grain: 0.2 }, tone: null, veil: { color: "#000000", opacity: 0 } },
  dusk:       { adjust: { temperature: 0.15, tint: 0.3, brightness: -0.1, saturation: 0.15, vignette: 0.25 }, tone: { shadow: "#3B2A6B", highlight: "#FF9E6B", amount: 0.35 }, veil: { color: "#C96BD9", opacity: 0.18 } },
  moody:      { adjust: { temperature: -0.35, brightness: -0.12, contrast: 0.25, saturation: -0.3, fade: 0.15, vignette: 0.35 }, tone: null, veil: { color: "#2B4C7E", opacity: 0.2 } },
  tealOrange: { adjust: { contrast: 0.2, saturation: 0.1 }, tone: { shadow: "#0E6E78", highlight: "#FF9A45", amount: 0.5 }, veil: { color: "#1FA3A3", opacity: 0.12 } },
  blush:      { adjust: { tint: 0.25, brightness: 0.2, contrast: -0.2, saturation: -0.15, fade: 0.3 }, tone: { shadow: "#8A5A7A", highlight: "#FFE3EA", amount: 0.25 }, veil: { color: "#FFB3C7", opacity: 0.18 } },
  grit:       { adjust: { contrast: 0.7, saturation: -1, shadows: -0.4, sharpen: 0.5, vignette: 0.3, grain: 0.6 }, tone: null, veil: { color: "#000000", opacity: 0.12 } },
  silver:     { adjust: { contrast: -0.2, saturation: -1, highlights: -0.2, fade: 0.45, grain: 0.15 }, tone: null, veil: { color: "#C9CED6", opacity: 0.14 } },
  indigo:     { adjust: { contrast: 0.15, saturation: -1 }, tone: { shadow: "#10214F", highlight: "#DCE9FF", amount: 0.8 }, veil: { color: "#2A4B9B", opacity: 0.28 } },
  drama:      { adjust: { brightness: -0.15, contrast: 0.5, saturation: -0.25, shadows: -0.5, sharpen: 0.2, vignette: 0.6 }, tone: null, veil: { color: "#000000", opacity: 0.2 } },
};

/** The colour stage, run BEFORE the split tone; every other Adjust key (tone curve, sharpen, vignette, grain) is the finishing stage, run after it. */
export const BEFORE_TONE: readonly AdjustKey[] = ["exposure", "temperature", "tint", "brightness", "contrast", "saturation"];

export type FilterStep = AdjustStep | ({ kind: "splitTone" } & SplitTone);

export const isRecipeFilter = (id: string | null | undefined): id is RecipeFilterId => (RECIPE_FILTER_IDS as readonly unknown[]).includes(id);

/** The row as its two Adjust stages and the tone between them; null for any id that is not one of the twelve. */
export function filterStages(id: string | null | undefined): { before: ClipAdjust; tone: SplitTone | null; after: ClipAdjust } | null {
  if (!isRecipeFilter(id)) return null;
  const row = FILTER_RECIPES[id];
  const a: ClipAdjust = { ...DEFAULT_ADJUST, ...row.adjust };
  const before = { ...DEFAULT_ADJUST }, after = { ...DEFAULT_ADJUST };
  for (const k of ADJUST_KEYS) (BEFORE_TONE.includes(k) ? before : after)[k] = a[k];
  return { before, tone: row.tone, after };
}

/** The export recipe in order: colour stage, split tone, finishing stage. [] for an old filter, None, null or an unknown id. */
export function filterSteps(id: string | null | undefined): FilterStep[] {
  const s = filterStages(id);
  if (!s) return [];
  return [...adjustRecipe(s.before), ...(s.tone ? [{ kind: "splitTone" as const, ...s.tone }] : []), ...adjustRecipe(s.after)];
}

/** Preview only: how much a fade lifts the preview's brightness layer. */
export const FILTER_PREVIEW = { fadeLift: 0.1 } as const;
const r4 = (n: number) => Math.round(n * 1e4) / 1e4;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** What FilterLayer draws for a recipe filter, computed from its row: the veil, the row's saturation, and its brightness plus a little of its fade. */
export function filterPreviewOf(id: RecipeFilterId): FilterPreview {
  const row = FILTER_RECIPES[id];
  const a: ClipAdjust = { ...DEFAULT_ADJUST, ...row.adjust };
  return {
    tint: row.veil.color, tintOpacity: row.veil.opacity,
    saturation: clamp(r4(1 + a.saturation), 0, 2),
    brightness: clamp(r4(0.25 * a.brightness + FILTER_PREVIEW.fadeLift * a.fade), -0.3, 0.3),
  };
}
```

(`import type { FilterPreview }` is type-only, so `effects.ts` importing this file is not a runtime cycle. `0.25` is `ADJUST.brightness`; it is written out because the preview constant is this file's own, like `adjustPreview`'s `0.3`.)

`src/editor/model/types.ts` — `FILTER_IDS` gains, after `"dream"`: `"kodak", "fuji", "matte", "bleach", "dusk", "moody", "tealOrange", "blush", "grit", "silver", "indigo", "drama"` (a third line).

`src/editor/effects.ts` — add `import { filterPreviewOf } from "./model/filterRecipes";`, change the comment above `FILTERS` to `/** Preview approximations only. The first twenty have their Core Image recipes in modules/clipy-video/ios/Effects.swift; the twelve of 2026-10-06 are rows of model/filterRecipes.ts, and their preview is computed from the row. */`, and after the `dream` row add:

```ts
  kodak:      { label: "Kodak",  preview: filterPreviewOf("kodak") },
  fuji:       { label: "Fuji",   preview: filterPreviewOf("fuji") },
  matte:      { label: "Matte",  preview: filterPreviewOf("matte") },
  bleach:     { label: "Bleach", preview: filterPreviewOf("bleach") },
  dusk:       { label: "Dusk",   preview: filterPreviewOf("dusk") },
  moody:      { label: "Moody",  preview: filterPreviewOf("moody") },
  tealOrange: { label: "Cinema", preview: filterPreviewOf("tealOrange") },
  blush:      { label: "Blush",  preview: filterPreviewOf("blush") },
  grit:       { label: "Grit",   preview: filterPreviewOf("grit") },
  silver:     { label: "Silver", preview: filterPreviewOf("silver") },
  indigo:     { label: "Indigo", preview: filterPreviewOf("indigo") },
  drama:      { label: "Drama",  preview: filterPreviewOf("drama") },
```

`modules/clipy-video/ios/Effects.swift` — `filterIds` gains the twelve ids after `"dream"` (same line). **Nothing else in the file changes**: `filterChain` gets no case for them (an id without a chain is what sends `look` to the recipe branch), and `filterChain` / `apply` are inside the frozen stretch.

Create `modules/clipy-video/ios/FilterRecipes.swift`:

```swift
import CoreGraphics
import CoreImage
import Foundation
import UIKit

/// Shadows take `shadow`, highlights `highlight` (#RRGGBB); `amount` 0…1 is how much of the toned picture is mixed in.
struct SplitTone: Equatable {
  let shadow: String
  let highlight: String
  let amount: Double
}

/// One recipe filter: its Adjust values and, for six of the twelve, a split tone.
struct FilterRecipe: Equatable {
  let adjust: AdjustValues
  let tone: SplitTone?
}

/// Mirror of the `FilterStep` union in src/editor/model/filterRecipes.ts.
enum FilterStep: Equatable {
  case adjust(AdjustStep)
  case splitTone(shadow: String, highlight: String, amount: Double)
}

/// Mirror of src/editor/model/filterRecipes.ts — the ids, the rows and the stage rule must stay identical (checked by
/// src/editor/model/__tests__/filterRecipes.parity.test.ts). The 20 older filters are Core Image chains in
/// Effects.swift; these twelve are Adjust values run through `Adjust.apply` in two stages, with the split tone between.
enum FilterRecipes {
  static let ids = ["kodak", "fuji", "matte", "bleach", "dusk", "moody", "tealOrange", "blush", "grit", "silver", "indigo", "drama"]

  static let recipes: [String: FilterRecipe] = [
    "kodak": FilterRecipe(adjust: AdjustValues(brightness: 0, contrast: 0.15, saturation: 0.15, exposure: 0, temperature: 0.2, tint: 0, highlights: 0, shadows: 0, sharpen: 0, vignette: 0, fade: 0.08, grain: 0.15), tone: SplitTone(shadow: "#27413A", highlight: "#FFC98A", amount: 0.25)),
    "matte": FilterRecipe(adjust: AdjustValues(brightness: 0, contrast: -0.25, saturation: -0.2, exposure: 0, temperature: 0.08, tint: 0, highlights: 0, shadows: 0, sharpen: 0, vignette: 0, fade: 0.7, grain: 0.3), tone: nil),
    // …the other ten, in `ids` order (kodak, fuji, matte, …): one line each, every one of the twelve keys written out in
    // ADJUST_KEYS order (brightness, contrast, saturation, exposure, temperature, tint, highlights, shadows, sharpen,
    // vignette, fade, grain), numbers exactly as in FILTER_RECIPES — the parity test compares each line character for character.
  ]

  /// The row as its two Adjust stages and the tone between them (`BEFORE_TONE`: the colour stage runs first); nil for
  /// any id that is not one of the twelve.
  static func stages(_ id: String?) -> (before: AdjustValues, tone: SplitTone?, after: AdjustValues)? {
    guard let id, let row = recipes[id] else { return nil }
    let a = row.adjust.sanitized
    var before = AdjustValues.neutral
    before.exposure = a.exposure
    before.temperature = a.temperature
    before.tint = a.tint
    before.brightness = a.brightness
    before.contrast = a.contrast
    before.saturation = a.saturation
    var after = AdjustValues.neutral
    after.highlights = a.highlights
    after.shadows = a.shadows
    after.sharpen = a.sharpen
    after.vignette = a.vignette
    after.fade = a.fade
    after.grain = a.grain
    return (before, row.tone, after)
  }

  /// The export recipe in order: colour stage, split tone, finishing stage. Empty for an old filter, nil or an unknown id.
  static func steps(_ id: String?) -> [FilterStep] {
    guard let s = stages(id) else { return [] }
    var out: [FilterStep] = Adjust.steps(s.before).map { (step: AdjustStep) -> FilterStep in FilterStep.adjust(step) }
    if let t = s.tone { out.append(FilterStep.splitTone(shadow: t.shadow, highlight: t.highlight, amount: t.amount)) }
    out.append(contentsOf: Adjust.steps(s.after).map { (step: AdjustStep) -> FilterStep in FilterStep.adjust(step) })
    return out
  }

  /// The filter `id` on `image` (`time` = the frame's composition time, for the grain), cropped to the image's
  /// extent. Nil when `id` is not a recipe filter — the caller then leaves the picture as it is.
  static func apply(_ id: String?, to image: CIImage, time: Double) -> CIImage? {
    guard let s = stages(id) else { return nil }
    let extent = image.extent
    var out = Adjust.apply(s.before, to: image, time: time)
    if let tone = s.tone { out = splitTone(out, tone: tone).cropped(to: extent) }
    return Adjust.apply(s.after, to: out, time: time).cropped(to: extent)
  }

  /// The split tone: `CIFalseColor` maps the picture's brightness onto the two colours (dark → shadow, light →
  /// highlight); that is laid over the picture with `CISoftLightBlendMode`, and the result is mixed in by `amount`
  /// (1 = all of it, no mix). A colour that is not #RRGGBB, an amount of 0 or less, an image without a finite extent,
  /// or a filter / key Core Image does not know → `image` unchanged.
  static func splitTone(_ image: CIImage, tone: SplitTone) -> CIImage {
    let extent = image.extent
    guard tone.amount.isFinite, tone.amount > 0, !extent.isInfinite, !extent.isEmpty,
          LayerBackground.isHexColor(tone.shadow), LayerBackground.isHexColor(tone.highlight),
          let ramp = Adjust.filtered(image, "CIFalseColor", [
            "inputColor0": CIColor(color: UIColor(hex: tone.shadow)),
            "inputColor1": CIColor(color: UIColor(hex: tone.highlight)),
          ]),
          let toned = Adjust.filtered(ramp.cropped(to: extent), "CISoftLightBlendMode", [kCIInputBackgroundImageKey: image])
    else { return image }
    let k = CGFloat(min(1, tone.amount))
    let full = toned.cropped(to: extent)
    return k >= 1 ? full : ClipyCompositor.dissolve(from: image, to: full, progress: k).cropped(to: extent)
  }
}
```

`modules/clipy-video/ios/ClipyCompositor.swift`, `look` — the closing `}` of the existing `if !chain.isEmpty, spec.filterIntensity > 0 {` block becomes:

```swift
    } else if spec.filterIntensity > 0, let filtered = FilterRecipes.apply(spec.filter, to: img, time: time) {
      // One of the twelve recipe filters (FilterRecipes.swift): no chain, the same strength mix.
      out = spec.filterIntensity >= 1
        ? filtered
        : dissolve(from: img, to: filtered, progress: CGFloat(spec.filterIntensity)).cropped(to: img.extent)
    }
```

and `look`'s doc comment gains a last sentence: ` A filter with no chain that is one of `FilterRecipes.ids` is drawn by `FilterRecipes.apply` instead, with the same mix.` No other line of the function changes (the frozen test covers the block above the new branch).

Create `modules/clipy-video/ios/Tests/FilterRecipeTests.swift`:

```swift
import CoreGraphics
import CoreImage
import XCTest
@testable import ClipyVideo

/// One case of `FILTER_VECTORS` (src/editor/model/__tests__/filterRecipes.vectors.ts). The table below is checked
/// against the TS vectors by filterRecipes.parity.test.ts — keep the literals and the spacing identical.
struct FilterVector {
  let id: String
  let expect: [FilterStep]
}

let filterVectors: [FilterVector] = [
  FilterVector(id: "kodak", expect: [.adjust(.temperatureTint(neutral: AdjustPoint(6500, 0), target: AdjustPoint(6000, 0))), .adjust(.colorControls(brightness: 0, contrast: 1.075, saturation: 1.15)), .splitTone(shadow: "#27413A", highlight: "#FFC98A", amount: 0.25), .adjust(.toneCurve(points: [AdjustPoint(0, 0.02), AdjustPoint(0.25, 0.25), AdjustPoint(0.5, 0.5), AdjustPoint(0.75, 0.75), AdjustPoint(1, 1)])), .adjust(.grain(opacity: 0.0375))]),
  FilterVector(id: "bleach", expect: [.adjust(.colorControls(brightness: -0.0125, contrast: 1.25, saturation: 0.45)), .adjust(.sharpen(sharpness: 0.24)), .adjust(.grain(opacity: 0.05))]),
  // …the other ten, in the order of FILTER_VECTORS: one line each, in exactly the format the parity test builds.
]

final class FilterRecipeTests: XCTestCase {
  private let size = CGSize(width: 64, height: 36)
  private var rect: CGRect { CGRect(origin: .zero, size: size) }
  private let ctx = CIContext(options: [.workingColorSpace: NSNull()])
  private var grey: CIImage { CIImage(color: CIColor(red: 0.5, green: 0.5, blue: 0.5)).cropped(to: rect) }

  private func rgb(_ img: CIImage, _ x: CGFloat, _ y: CGFloat) -> (r: Double, g: Double, b: Double) {
    var px = [UInt8](repeating: 0, count: 4)
    ctx.render(img, toBitmap: &px, rowBytes: 4, bounds: CGRect(x: x, y: y, width: 1, height: 1), format: .RGBA8, colorSpace: nil)
    return (Double(px[0]) / 255, Double(px[1]) / 255, Double(px[2]) / 255)
  }

  /// A step as a name and its numbers / strings, so two steps can be compared with a tolerance.
  private func flat(_ step: FilterStep) -> (String, [Double], [String]) {
    switch step {
    case .splitTone(let shadow, let highlight, let amount): return ("splitTone", [amount], [shadow, highlight])
    case .adjust(let a):
      switch a {
      case .exposure(let ev): return ("exposure", [ev], [])
      case .temperatureTint(let n, let t): return ("temperatureTint", [n.x, n.y, t.x, t.y], [])
      case .colorControls(let b, let c, let s): return ("colorControls", [b, c, s], [])
      case .toneCurve(let points): return ("toneCurve", points.flatMap { (p: AdjustPoint) -> [Double] in [p.x, p.y] }, [])
      case .sharpen(let s): return ("sharpen", [s], [])
      case .vignette(let i, let r): return ("vignette", [i, r], [])
      case .grain(let o): return ("grain", [o], [])
      }
    }
  }

  func testStepsMatchTheVectors() {
    XCTAssertEqual(filterVectors.count, 12)
    XCTAssertEqual(filterVectors.map { (v: FilterVector) -> String in v.id }, FilterRecipes.ids)
    for v in filterVectors {
      let got = FilterRecipes.steps(v.id)
      XCTAssertEqual(got.count, v.expect.count, v.id)
      for (a, b) in zip(got, v.expect) {
        let x = flat(a), y = flat(b)
        XCTAssertEqual(x.0, y.0, v.id)
        XCTAssertEqual(x.2, y.2, v.id)
        XCTAssertEqual(x.1.count, y.1.count, v.id)
        for (m, n) in zip(x.1, y.1) { XCTAssertEqual(m, n, accuracy: 1e-9, "\(v.id) \(x.0)") }
      }
    }
  }

  /// The twelve ids are the last twelve filter ids; none of them has an old chain; an old filter has no recipe.
  func testEveryRecipeFilterIsAFilterIdWithoutAChain() {
    XCTAssertEqual(Effects.filterIds.count, 32)
    XCTAssertEqual(Array(Effects.filterIds.suffix(12)), FilterRecipes.ids)
    for id in FilterRecipes.ids {
      XCTAssertNotNil(FilterRecipes.recipes[id], id)
      XCTAssertTrue(Effects.filterChain(id).isEmpty, id)
    }
    for id in Effects.filterIds.prefix(20) { XCTAssertNil(FilterRecipes.apply(id, to: grey, time: 0), id) }
    XCTAssertNil(FilterRecipes.apply(nil, to: grey, time: 0))
    XCTAssertNil(FilterRecipes.apply("sparkle", to: grey, time: 0))
    XCTAssertTrue(FilterRecipes.steps("warm").isEmpty)
  }

  func testEveryRecipeKeepsTheFrameExtent() {
    for id in FilterRecipes.ids {
      XCTAssertEqual(FilterRecipes.apply(id, to: grey, time: 1.5)?.extent, rect, id)
    }
  }

  /// The three black-and-whites leave no colour on a strongly coloured frame (Indigo is toned afterwards: blue ≥ red).
  func testBlackAndWhiteRecipesDesaturate() {
    let orange = CIImage(color: CIColor(red: 0.9, green: 0.5, blue: 0.1)).cropped(to: rect)
    for id in ["grit", "silver"] {
      guard let out = FilterRecipes.apply(id, to: orange, time: 0) else { XCTFail(id); continue }
      let c = rgb(out, 32, 18)
      XCTAssertEqual(c.r, c.b, accuracy: 0.06, id)
    }
    if let out = FilterRecipes.apply("indigo", to: orange, time: 0) {
      let c = rgb(out, 32, 18)
      XCTAssertGreaterThanOrEqual(c.b, c.r - 0.02)
    } else { XCTFail("indigo") }
  }

  /// A split tone with nothing to do, or with a colour that is not #RRGGBB, hands the image back; a real one keeps the extent.
  func testSplitToneGuards() {
    let image = grey
    XCTAssertTrue(FilterRecipes.splitTone(image, tone: SplitTone(shadow: "#000000", highlight: "#FFFFFF", amount: 0)) === image)
    XCTAssertTrue(FilterRecipes.splitTone(image, tone: SplitTone(shadow: "teal", highlight: "#FFFFFF", amount: 0.5)) === image)
    XCTAssertTrue(FilterRecipes.splitTone(image, tone: SplitTone(shadow: "#000000", highlight: "#FFFFFF", amount: .nan)) === image)
    XCTAssertEqual(FilterRecipes.splitTone(image, tone: SplitTone(shadow: "#0E6E78", highlight: "#FF9A45", amount: 0.5)).extent, rect)
  }

  /// A recipe filter goes through `look` at its strength: 0 leaves the frame, and it never changes the extent.
  func testLookAppliesARecipeFilterAtItsStrength() {
    func spec(_ filter: String, _ strength: Double) -> LayerSpec {
      return LayerSpec(trackID: 1, fill: .identity, orient: .identity, crop: .full, transform: .identity, background: .black, filter: filter, filterIntensity: strength)
    }
    let image = grey
    XCTAssertTrue(ClipyCompositor.look(spec("moody", 0), on: image, time: 0) === image)
    XCTAssertEqual(ClipyCompositor.look(spec("moody", 1), on: image, time: 0).extent, rect)
    XCTAssertEqual(ClipyCompositor.look(spec("moody", 0.5), on: image, time: 0).extent, rect)
    // Moody darkens: brightness −0.03 and a cool white point on a mid-grey frame.
    XCTAssertLessThan(rgb(ClipyCompositor.look(spec("moody", 1), on: image, time: 0), 32, 18).r, 0.5)
  }
}
```

**Verify by reading** (and list what you could not verify): `CIFalseColor` (`inputImage`, `inputColor0`, `inputColor1`) and `CISoftLightBlendMode` (`inputImage`, `inputBackgroundImage`) in Apple's Core Image Filter Reference; that `AdjustValues`' members are `var` and `AdjustValues.neutral` / `.sanitized` exist (`Adjust.swift`); that `UIColor(hex:)` and `LayerBackground.isHexColor` are visible from a new file in the module; `LayerSpec.init`'s labels (the test above uses its defaults); that the pod's `source_files = "*.{h,m,mm,swift}"` takes a new file in `ios/` and `Tests/**/*.swift` a new test.

- [ ] **Step 4:** `npx.cmd jest src/editor/model src/editor/__tests__/effects.test.ts src/editor/__tests__/FilterLayer.test.tsx src/editor/__tests__/looks.frozen.test.ts src/__tests__` green — `adjust.parity.test.ts`, `adjust.test.ts`, `FilterLayer.test.tsx` and `looks.frozen.test.ts` **unedited**. `npm run typecheck`; `npm test`.
- [ ] **Step 5: Commit** — explicit paths; `feat(filters): twelve recipe filters — rows over the Adjust pipeline with a split tone, mirrored with vectors; preview computed from the row`.

---

### Task 3: Effect maths for the eight — mirrored, vectors, `effectPreview` / `effectShapes`

**Depends on:** Task 1. **Parallel-safe with:** Tasks 2, 4.

**Files:** Modify `src/editor/model/effectMath.ts`, `modules/clipy-video/ios/EffectMath.swift`, `src/editor/model/__tests__/effectMath.vectors.ts`, `src/editor/model/__tests__/effectMath.test.ts`, `src/editor/model/__tests__/effectMath.parity.test.ts`, `modules/clipy-video/ios/Tests/EffectMathTests.swift` (the vector tables, `value(_:)`, the count, one new test).

**Do not touch:** anything that exists in `effectMath.ts` / `EffectMath.swift` (only append: constants after `rgbSplit`, colours after `glow`, functions after the last one; the frozen test checks the rest), `EffectRenderer.swift` (Task 8), `EffectLayer.tsx` (Task 5), everything under "Never edited this round".

**Interfaces — Produces**

```ts
// src/editor/model/effectMath.ts — appended
export const EFFECT = { /* …the 28… */ beatHz: 1.25, beatAmp: 0.1, beatWidth: 0.2, beatGap: 0.28, beatSecond: 0.6, strobeHz: 2, strobeDuty: 0.4,
  burnMax: 0.6, burnHz: 0.4, burnDrift: 0.35, burnDriftHz: 0.15, burnRadius: 0.9, flareMax: 0.8, flareHz: 0.5, flareMargin: 0.2, flareY: 0.35, flareCore: 0.12, flareHalo: 0.4,
  edgeBlur: 0.02, edgeInner: 0.25, edgeOuter: 0.75, edgeVeil: 0.35, dustFps: 12, dustChance: 0.6, dustLines: 2, dustOpacity: 0.5, dustWidth: 0.003, dustSpeck: 0.02,
  hueHz: 0.25, mirrorFull: 0.5 };
export const EFFECT_COLORS = { /* …the 6… */ strobe: "#000000", filmBurn: "#FF5A1F", lensFlare: "#FFF1D0", softEdges: "#FFFFFF", dust: "#F2EBDD" };
export function heartbeatScale(t: number, d: number, k: number): number;
export function strobeOpacity(t: number, k: number): number;
export function burnOpacity(t: number, d: number, k: number): number;
export function burnCentreY(t: number): number;                 // fraction of the height, from the TOP
export function flareX(t: number): number;                      // fraction of the width
export function flareOpacity(t: number, d: number, k: number): number;
export function softEdgeAmount(t: number, d: number, k: number): number;
export function dustScratch(t: number, k: number, i: number): { on: boolean; x: number };
export function hueAngle(t: number, d: number, k: number): number;   // radians
export function mirrorMix(t: number, d: number, k: number): number;
export type EffectShape =
  | { kind: "burn"; color: string; opacity: number }
  | { kind: "flare"; color: string; opacity: number; x: number }
  | { kind: "edges"; color: string; opacity: number }
  | { kind: "scratch"; color: string; opacity: number; x: number };
export function effectShapes(type: EffectId, t: number, d: number, k: number): EffectShape[];
export function combinedEffectShapes(effects: EffectItem[], time: number): EffectShape[];
```

```swift
// EffectMath.swift — appended (same names; all `t:`, `d:`, `k:`, `i:` labelled)
struct DustScratch: Equatable { let on: Bool; let x: Double }
static func heartbeatScale(t: Double, d: Double, k: Double) -> Double
static func strobeOpacity(t: Double, k: Double) -> Double
static func burnOpacity(t: Double, d: Double, k: Double) -> Double
static func burnCentreY(t: Double) -> Double
static func flareX(t: Double) -> Double
static func flareOpacity(t: Double, d: Double, k: Double) -> Double
static func softEdgeAmount(t: Double, d: Double, k: Double) -> Double
static func dustScratch(t: Double, k: Double, i: Double) -> DustScratch
static func hueAngle(t: Double, d: Double, k: Double) -> Double
static func mirrorMix(t: Double, d: Double, k: Double) -> Double
```

- [ ] **Step 1: Failing tests.**

`src/editor/model/__tests__/effectMath.vectors.ts` — append:

```ts
// ---- The eight effects of 2026-10-06. `d` = 4 s so that env = 1 from 0.15 s to 3.85 s; at t = 0.075, env = 0.075 / 0.15 = 0.5. ----

// heartbeatScale = 1 + 0.1 k env beat(phase); phase = frac(1.25 t); beat = bump(phase / 0.2) + 0.6 bump((phase − 0.28) / 0.2); bump(x) = sin²(πx) in (0, 1)
export const HEARTBEAT_VECTORS: ScalarVector[] = [
  { name: "first beat, peak", args: [0.88, 4, 1], expect: 1.1 },                    // phase 0.1 → bump(0.5) = 1 → 1 + 0.1
  { name: "second beat, peak", args: [1.104, 4, 1], expect: 1.06 },                 // phase 0.38 → 0.6·bump(0.5) = 0.6 → 1 + 0.06
  { name: "rest", args: [1.36, 4, 1], expect: 1 },                                  // phase 0.7: past both beats
  { name: "half way up, half strength", args: [0.84, 4, 0.5], expect: 1.025 },      // phase 0.05 → bump(0.25) = sin²(45°) = 0.5 → 1 + 0.1·0.5·0.5
  // phase 0.09375 → bump(0.46875) = sin²(84.375°) = 0.990392640; env 0.5 → 1 + 0.1·0.5·0.990392640
  { name: "ramping in", args: [0.075, 4, 1], expect: 1.0495196320100808 },
];
// strobeOpacity = k while frac(2 t) < 0.4, else 0
export const STROBE_VECTORS: ScalarVector[] = [
  { name: "t = 0: dark", args: [0, 1], expect: 1 },                                  // frac 0
  { name: "t = 0.1: dark", args: [0.1, 1], expect: 1 },                              // frac 0.2
  { name: "t = 0.2: the dark part has just ended", args: [0.2, 1], expect: 0 },      // frac 0.4, not below 0.4
  { name: "t = 0.25: clear", args: [0.25, 1], expect: 0 },                           // frac 0.5
  { name: "second period, half strength", args: [0.6, 0.5], expect: 0.5 },           // frac(1.2) = 0.2
];
// burnOpacity = 0.6 k env (0.5 + 0.5 sin(2π 0.4 t))
export const BURN_VECTORS: ScalarVector[] = [
  { name: "peak", args: [0.625, 4, 1], expect: 0.6 },                                // sin(π/2) = 1 → 0.6·1
  { name: "trough", args: [1.875, 4, 1], expect: 0 },                                // sin(3π/2) = −1 → 0
  { name: "middle, half strength", args: [1.25, 4, 0.5], expect: 0.15 },             // sin(π) = 0 → 0.6·0.5·0.5
  { name: "ramping in", args: [0.075, 4, 1], expect: 0.1781071971878587 },           // 0.6·0.5·(0.5 + 0.5·sin(0.06π) = 0.5936906573)
];
// burnCentreY = 0.5 + 0.35 sin(2π 0.15 t)
export const BURN_Y_VECTORS: ScalarVector[] = [
  { name: "t = 0: the middle", args: [0], expect: 0.5 },
  { name: "t = 5: highest", args: [5], expect: 0.15 },                               // sin(1.5π) = −1 → 0.5 − 0.35
  { name: "t = 10: the middle again", args: [10], expect: 0.5 },                     // sin(3π) = 0
];
// flareX = −0.2 + 1.4 frac(0.5 t)
export const FLARE_X_VECTORS: ScalarVector[] = [
  { name: "start, off the left edge", args: [0], expect: -0.2 },
  { name: "quarter way", args: [0.5], expect: 0.15 },                                // −0.2 + 1.4·0.25
  { name: "the centre", args: [1], expect: 0.5 },                                    // −0.2 + 1.4·0.5
  { name: "three quarters", args: [1.5], expect: 0.85 },
  { name: "next sweep", args: [2], expect: -0.2 },                                   // frac(1) = 0
];
// flareOpacity = 0.8 k env
export const FLARE_OPACITY_VECTORS: ScalarVector[] = [
  { name: "full", args: [1, 4, 1], expect: 0.8 },
  { name: "ramping in, half strength", args: [0.075, 4, 0.5], expect: 0.2 },         // 0.8·0.5·0.5
];
// softEdgeAmount = k env
export const SOFT_EDGE_VECTORS: ScalarVector[] = [
  { name: "full envelope", args: [1, 4, 0.7], expect: 0.7 },
  { name: "ramping in", args: [0.075, 4, 1], expect: 0.5 },
];
// hueAngle = π k env sin(2π 0.25 t)
export const HUE_VECTORS: ScalarVector[] = [
  { name: "t = 1: half a turn", args: [1, 4, 1], expect: 3.141592653589793 },        // sin(π/2) = 1
  { name: "t = 2: back", args: [2, 4, 1], expect: 0 },                               // sin(π) = 0
  { name: "t = 1, half strength", args: [1, 4, 0.5], expect: 1.5707963267948966 },
  { name: "t = 3: the other way", args: [3, 4, 1], expect: -3.141592653589793 },     // sin(3π/2) = −1
  { name: "ramping in", args: [0.075, 4, 1], expect: 0.18462731218780318 },          // π·0.5·sin(0.0375π) = π·0.5·0.1175373975
];
// mirrorMix = min(1, k / 0.5) env
export const MIRROR_VECTORS: ScalarVector[] = [
  { name: "the default strength is a full mirror", args: [1, 4, 0.7], expect: 1 },
  { name: "strength 25 is half", args: [1, 4, 0.25], expect: 0.5 },
  { name: "ramping in", args: [0.075, 4, 1], expect: 0.5 },
];

export interface DustVector { name: string; t: number; k: number; i: number; on: boolean; x: number }
// n = floor(12 t); on = hash(7n + 13i + 1) < 0.6 k; x = hash(3n + 17i + 2)
export const DUST_VECTORS: DustVector[] = [
  // n = 3: hash(22) = 0.6609 ≥ 0.6 → off; x = hash(11)
  { name: "frame 3, line 0: off", t: 0.25, k: 1, i: 0, on: false, x: 0.8211895695640123 },
  // hash(35) = 0.5759 < 0.6 → on; x = hash(28)
  { name: "frame 3, line 1: on", t: 0.25, k: 1, i: 1, on: true, x: 0.16190568688034546 },
  // n = 12: hash(85) = 0.3764 < 0.6 → on; x = hash(38)
  { name: "frame 12, line 0: on", t: 1, k: 1, i: 0, on: true, x: 0.4702766282589437 },
  // hash(98) = 0.0558 → on; x = hash(55)
  { name: "frame 12, line 1: on", t: 1, k: 1, i: 1, on: true, x: 0.8728999602171825 },
  // the same line at strength 0.2: 0.3764 ≥ 0.12 → off (the place does not depend on the strength)
  { name: "frame 12, line 0, low strength: off", t: 1, k: 0.2, i: 0, on: false, x: 0.4702766282589437 },
  // n = 6: hash(43) = 0.2154 < 0.3 → on; x = hash(20)
  { name: "frame 6, line 0, half strength: on", t: 0.5, k: 0.5, i: 0, on: true, x: 0.760377313970821 },
];
```

`src/editor/model/__tests__/effectMath.test.ts` — add the new functions and vector lists to the two imports, and append:

```ts
describe("the eight effects of 2026-10-06", () => {
  test.each(HEARTBEAT_VECTORS)("heartbeat $name", (v) => expect(heartbeatScale(v.args[0], v.args[1], v.args[2])).toBeCloseTo(v.expect, P));
  test.each(STROBE_VECTORS)("strobe $name", (v) => expect(strobeOpacity(v.args[0], v.args[1])).toBeCloseTo(v.expect, P));
  test.each(BURN_VECTORS)("burn $name", (v) => expect(burnOpacity(v.args[0], v.args[1], v.args[2])).toBeCloseTo(v.expect, P));
  test.each(BURN_Y_VECTORS)("burn centre $name", (v) => expect(burnCentreY(v.args[0])).toBeCloseTo(v.expect, P));
  test.each(FLARE_X_VECTORS)("flare x $name", (v) => expect(flareX(v.args[0])).toBeCloseTo(v.expect, P));
  test.each(FLARE_OPACITY_VECTORS)("flare opacity $name", (v) => expect(flareOpacity(v.args[0], v.args[1], v.args[2])).toBeCloseTo(v.expect, P));
  test.each(SOFT_EDGE_VECTORS)("soft edges $name", (v) => expect(softEdgeAmount(v.args[0], v.args[1], v.args[2])).toBeCloseTo(v.expect, P));
  test.each(HUE_VECTORS)("hue $name", (v) => expect(hueAngle(v.args[0], v.args[1], v.args[2])).toBeCloseTo(v.expect, P));
  test.each(MIRROR_VECTORS)("mirror $name", (v) => expect(mirrorMix(v.args[0], v.args[1], v.args[2])).toBeCloseTo(v.expect, P));
  test.each(DUST_VECTORS)("dust $name", (v) => {
    const s = dustScratch(v.t, v.k, v.i);
    expect(s.on).toBe(v.on); expect(s.x).toBeCloseTo(v.x, P);
  });

  test("the heartbeat never shrinks the picture and is back to 1 between beats and outside the effect", () => {
    for (let t = 0; t <= 4; t += 0.013) { const s = heartbeatScale(t, 4, 1); expect(s).toBeGreaterThanOrEqual(1); expect(s).toBeLessThanOrEqual(1.1 + 1e-12); }
    expect(heartbeatScale(-1, 4, 1)).toBe(1); expect(heartbeatScale(5, 4, 1)).toBe(1);
  });
  test("the strobe is dark 40 % of the time, twice a second (under three flashes a second)", () => {
    let dark = 0; for (let i = 0; i < 1000; i++) if (strobeOpacity(i / 1000, 1) > 0) dark++;
    expect(dark).toBeGreaterThanOrEqual(399); expect(dark).toBeLessThanOrEqual(401);      // 400, give or take a sample that lands on an edge (2 × 0.7 is not exactly 1.4)
    expect(EFFECT.strobeHz).toBeLessThan(3);
  });
  test("the flare stays within one margin of the frame; the burn centre stays inside it; a scratch is inside the width", () => {
    for (let t = 0; t < 6; t += 0.07) {
      expect(flareX(t)).toBeGreaterThanOrEqual(-0.2); expect(flareX(t)).toBeLessThan(1.2);
      expect(burnCentreY(t)).toBeGreaterThanOrEqual(0.15 - 1e-12); expect(burnCentreY(t)).toBeLessThanOrEqual(0.85 + 1e-12);
      for (const i of [0, 1]) { const x = dustScratch(t, 1, i).x; expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThan(1); }
    }
  });

  test("effectPreview: heartbeat scales, strobe is one black layer, the other six leave the picture and its layers alone", () => {
    expect(effectPreview("heartbeat", 0.88, 4, 1)).toEqual({ translateX: 0, translateY: 0, scale: expect.closeTo(1.1, 9), layers: [] });
    expect(effectPreview("strobe", 0.1, 4, 0.8).layers).toEqual([{ color: EFFECT_COLORS.strobe, opacity: 0.8 }]);
    expect(effectPreview("strobe", 0.25, 4, 0.8)).toEqual(IDENTITY);
    for (const type of ["filmBurn", "lensFlare", "dust", "hueShift", "mirror", "softEdges"] as const) expect(effectPreview(type, 1, 4, 1)).toEqual(IDENTITY);
  });

  test("effectShapes: what the preview draws for the four that have a shape; nothing for the others", () => {
    expect(effectShapes("filmBurn", 0.625, 4, 1)).toEqual([{ kind: "burn", color: EFFECT_COLORS.filmBurn, opacity: expect.closeTo(0.6, 9) }]);
    expect(effectShapes("filmBurn", 1.875, 4, 1)).toEqual([]);                                   // opacity 0: omitted
    expect(effectShapes("lensFlare", 1, 4, 1)).toEqual([{ kind: "flare", color: EFFECT_COLORS.lensFlare, opacity: expect.closeTo(0.8, 9), x: expect.closeTo(0.5, 9) }]);
    expect(effectShapes("softEdges", 1, 4, 0.7)).toEqual([{ kind: "edges", color: EFFECT_COLORS.softEdges, opacity: expect.closeTo(0.245, 9) }]);   // 0.35 · 0.7
    // t = 1, k = 1: both lines on; opacity 0.5 · k · env = 0.5
    expect(effectShapes("dust", 1, 4, 1)).toEqual([
      { kind: "scratch", color: EFFECT_COLORS.dust, opacity: expect.closeTo(0.5, 9), x: expect.closeTo(0.4702766282589437, 9) },
      { kind: "scratch", color: EFFECT_COLORS.dust, opacity: expect.closeTo(0.5, 9), x: expect.closeTo(0.8728999602171825, 9) },
    ]);
    expect(effectShapes("dust", 0.25, 4, 1)).toHaveLength(1);                                    // only line 1 is on in frame 3
    for (const type of EFFECT_IDS) {
      if (["filmBurn", "lensFlare", "softEdges", "dust"].includes(type)) continue;
      expect(effectShapes(type, 1, 4, 1)).toEqual([]);
    }
    for (const type of EFFECT_IDS) for (const bad of [[-1, 4, 1], [5, 4, 1], [NaN, 4, 1], [1, Infinity, 1], [1, 4, NaN], [1, 4, 0]]) expect(effectShapes(type, bad[0], bad[1], bad[2])).toEqual([]);
  });

  test("combinedEffectShapes: the shapes of every active effect, in list order", () => {
    const burn = makeEffect({ id: "b", type: "filmBurn", start: 0, end: 4, intensity: 1 });
    const flare = makeEffect({ id: "f", type: "lensFlare", start: 0.5, end: 4.5, intensity: 1 });
    // 0.625: the burn is at its peak (0.6); the flare is 0.125 s old (env 0.125 / 0.15 → 0.8·0.8333 > 0).
    expect(combinedEffectShapes([burn, flare], 0.625).map((s) => s.kind)).toEqual(["burn", "flare"]);
    // 1.5: the burn is 0.6·(0.5 + 0.5·sin(1.2π)) = 0.6·(0.5 − 0.2939) = 0.1237; the flare is 1 s old.
    expect(combinedEffectShapes([burn, flare], 1.5).map((s) => s.kind)).toEqual(["burn", "flare"]);
    // 1.875: the burn is at its trough (0) and is left out.
    expect(combinedEffectShapes([burn, flare], 1.875).map((s) => s.kind)).toEqual(["flare"]);
    expect(combinedEffectShapes([burn, flare], 4.2).map((s) => s.kind)).toEqual(["flare"]);         // the burn has ended (end is exclusive)
    expect(combinedEffectShapes([], 1)).toEqual([]);
  });
});
```

`src/editor/model/__tests__/effectMath.parity.test.ts`:
- Import the ten new vector lists; extend `SCALARS` with `["heartbeatScale", HEARTBEAT_VECTORS], ["strobeOpacity", STROBE_VECTORS], ["burnOpacity", BURN_VECTORS], ["burnCentreY", BURN_Y_VECTORS], ["flareX", FLARE_X_VECTORS], ["flareOpacity", FLARE_OPACITY_VECTORS], ["softEdgeAmount", SOFT_EDGE_VECTORS], ["hueAngle", HUE_VECTORS], ["mirrorMix", MIRROR_VECTORS]` (the existing "same number of cases" and per-vector tests then cover them: 21 + 34 = 55 lines in the Swift table).
- Append:

```ts
test("EffectMath.swift mirrors the ten functions of 2026-10-06, under the same names", () => {
  for (const fn of ["heartbeatScale", "strobeOpacity", "burnOpacity", "burnCentreY", "flareX", "flareOpacity", "softEdgeAmount", "dustScratch", "hueAngle", "mirrorMix"]) {
    expect(swift).toMatch(new RegExp(`static func ${fn}\\(`));
  }
  expect(swift).toContain("struct DustScratch: Equatable {");
  // The scratch's two hash arguments are the same expressions on both sides.
  const dust = between(swift, "static func dustScratch(", "\n  }\n");
  expect(dust).toContain("hash(n * 7 + i * 13 + 1) < EffectMath.dustChance * k");
  expect(dust).toContain("hash(n * 3 + i * 17 + 2)");
  // sin² as a product, never pow (the same double arithmetic as `Math.sin(x) ** 2` is not guaranteed for pow).
  expect(between(swift, "static func bump(", "\n  }\n")).toMatch(/let s = sin\(Double\.pi \* x\)\s*\n\s*return s \* s/);
});

describe("the Swift test table embeds every DUST_VECTORS case", () => {
  it("has the same number of cases", () => expect([...table.matchAll(/EffectDustVector\(name: "/g)]).toHaveLength(DUST_VECTORS.length));
  it.each(DUST_VECTORS.map((v) => [v.name, v] as const))("%s", (_name, v) => {
    expect(table).toContain(`EffectDustVector(name: "${v.name}", t: ${fmt(v.t)}, k: ${fmt(v.k)}, i: ${fmt(v.i)}, on: ${v.on}, x: ${fmt(v.x)})`);
  });
});
```

- [ ] **Step 2: Run** `npx.cmd jest src/editor/model/__tests__/effectMath` → the new tests FAIL (after correcting the one test as told above).
- [ ] **Step 3: Implement both sides.**

`src/editor/model/effectMath.ts`:
- `EFFECT` gains, after `rgbSplit: 0.008,` and before `} as const;`, the thirty constants of Produces (in that order, on new lines). `EFFECT_COLORS` gains the five colours after `glow`.
- `bump` uses a product so both languages do the same arithmetic. After `glitchSlice` add:

```ts
/** A smooth bump: 0 at both ends, 1 in the middle of (0, 1); 0 outside it. */
function bump(x: number): number {
  if (!(x > 0 && x < 1)) return 0;
  const s = Math.sin(Math.PI * x);
  return s * s;
}

/** A heartbeat: two beats (the second weaker) and a rest, `beatHz` times a second. Never below 1. */
export function heartbeatScale(t: number, d: number, k: number): number {
  const phase = frac(EFFECT.beatHz * t);
  const beat = bump(phase / EFFECT.beatWidth) + EFFECT.beatSecond * bump((phase - EFFECT.beatGap) / EFFECT.beatWidth);
  return 1 + EFFECT.beatAmp * k * envelope(t, d) * beat;
}

/** A dark strobe: the black layer's opacity is k for the first `strobeDuty` of every period, 0 for the rest. */
export function strobeOpacity(t: number, k: number): number {
  return frac(EFFECT.strobeHz * t) < EFFECT.strobeDuty ? k : 0;
}

export function burnOpacity(t: number, d: number, k: number): number {
  return EFFECT.burnMax * k * envelope(t, d) * (0.5 + 0.5 * Math.sin(TAU * EFFECT.burnHz * t));
}

/** Where the burn's centre sits on the LEFT edge: a fraction of the height from the top. */
export function burnCentreY(t: number): number {
  return 0.5 + EFFECT.burnDrift * Math.sin(TAU * EFFECT.burnDriftHz * t);
}

/** The flare's centre as a fraction of the width: from one margin left of the frame to one margin right of it, `flareHz` sweeps a second. */
export function flareX(t: number): number {
  return -EFFECT.flareMargin + (1 + 2 * EFFECT.flareMargin) * frac(EFFECT.flareHz * t);
}

export function flareOpacity(t: number, d: number, k: number): number {
  return EFFECT.flareMax * k * envelope(t, d);
}

/** How soft the edges are, 0…1: × edgeBlur × the shorter side = the export's blur radius; × edgeVeil = the preview's veil. */
export function softEdgeAmount(t: number, d: number, k: number): number {
  return k * envelope(t, d);
}

/** Scratch line `i` (0 … dustLines − 1) in the film frame under `t`: whether it shows, and where (a fraction of the width). */
export function dustScratch(t: number, k: number, i: number): { on: boolean; x: number } {
  const n = Math.floor(EFFECT.dustFps * t);
  return { on: hash(n * 7 + i * 13 + 1) < EFFECT.dustChance * k, x: hash(n * 3 + i * 17 + 2) };
}

/** How far the colours are turned round the colour wheel, in radians: a slow swing of up to half a turn each way. */
export function hueAngle(t: number, d: number, k: number): number {
  return Math.PI * k * envelope(t, d) * Math.sin(TAU * EFFECT.hueHz * t);
}

/** How much of the mirrored frame shows: full from strength `mirrorFull` up, fading below it. */
export function mirrorMix(t: number, d: number, k: number): number {
  return Math.min(1, k / EFFECT.mirrorFull) * envelope(t, d);
}
```

- In `effectPreview`'s `switch`, **after** the existing last line (`case "blur": case "glitch": …`), add:

```ts
    case "heartbeat": out.scale = heartbeatScale(t, d, k); break;
    case "strobe": layer(EFFECT_COLORS.strobe, strobeOpacity(t, k)); break;
    case "filmBurn": case "lensFlare": case "softEdges": case "dust": break;   // drawn as shapes (`effectShapes`)
    case "hueShift": case "mirror": break;                                      // export only
```

- At the end of the file:

```ts
/** What the preview draws over the picture for the effects that are more than a flat layer. `x` is a fraction of the frame's width. */
export type EffectShape =
  | { kind: "burn"; color: string; opacity: number }                  // warm light from the left edge
  | { kind: "flare"; color: string; opacity: number; x: number }      // a soft vertical band of light centred at x
  | { kind: "edges"; color: string; opacity: number }                 // a pale veil on the four edges
  | { kind: "scratch"; color: string; opacity: number; x: number };   // a thin vertical line at x

/** The shapes of one effect at local time t; [] for an effect without one, for input that is not finite, and outside [0, d]. A shape with no opacity is left out. */
export function effectShapes(type: EffectId, t: number, d: number, k: number): EffectShape[] {
  if (!Number.isFinite(t) || !Number.isFinite(d) || !Number.isFinite(k) || !(d > 0) || t < 0 || t > d) return [];
  const out: EffectShape[] = [];
  switch (type) {
    case "filmBurn": { const opacity = burnOpacity(t, d, k); if (opacity > 0) out.push({ kind: "burn", color: EFFECT_COLORS.filmBurn, opacity }); break; }
    case "lensFlare": { const opacity = flareOpacity(t, d, k); if (opacity > 0) out.push({ kind: "flare", color: EFFECT_COLORS.lensFlare, opacity, x: flareX(t) }); break; }
    case "softEdges": { const opacity = EFFECT.edgeVeil * softEdgeAmount(t, d, k); if (opacity > 0) out.push({ kind: "edges", color: EFFECT_COLORS.softEdges, opacity }); break; }
    case "dust": {
      const opacity = EFFECT.dustOpacity * k * envelope(t, d);
      if (!(opacity > 0)) break;
      for (let i = 0; i < EFFECT.dustLines; i++) { const s = dustScratch(t, k, i); if (s.on) out.push({ kind: "scratch", color: EFFECT_COLORS.dust, opacity, x: s.x }); }
      break;
    }
    default: break;
  }
  return out;
}

/** The shapes of every effect covering project time `time`, in list order. */
export function combinedEffectShapes(effects: EffectItem[], time: number): EffectShape[] {
  return activeEffects(effects, time).flatMap(({ effect, t, d }) => effectShapes(effect.type, t, d, effect.intensity));
}
```

`modules/clipy-video/ios/EffectMath.swift`:
- Above `enum EffectMath`, after `GlitchSlice`: `/// `dustScratch`'s result: whether the line shows, and its place as a fraction of the width.` + `struct DustScratch: Equatable { let on: Bool; let x: Double }` (three lines, as the other structs are written).
- After `static let rgbSplit: Double = 0.008` the thirty constants, one per line, `static let beatHz: Double = 1.25` … `static let mirrorFull: Double = 0.5` (same names, same order, every one `: Double`; `dustLines` is `2`).
- After `static let glowColor = "#FFFFFF"`: `static let strobeColor = "#000000"`, `static let filmBurnColor = "#FF5A1F"`, `static let lensFlareColor = "#FFF1D0"`, `static let softEdgesColor = "#FFFFFF"`, `static let dustColor = "#F2EBDD"`.
- After `glitchSlice` (the last function), before the closing `}`:

```swift
  /// A smooth bump: 0 at both ends, 1 in the middle of (0, 1); 0 outside it.
  static func bump(_ x: Double) -> Double {
    if !(x > 0 && x < 1) { return 0 }
    let s = sin(Double.pi * x)
    return s * s
  }

  /// A heartbeat: two beats (the second weaker) and a rest, `beatHz` times a second. Never below 1.
  static func heartbeatScale(t: Double, d: Double, k: Double) -> Double {
    let phase = frac(EffectMath.beatHz * t)
    let beat = bump(phase / EffectMath.beatWidth) + EffectMath.beatSecond * bump((phase - EffectMath.beatGap) / EffectMath.beatWidth)
    return 1 + EffectMath.beatAmp * k * envelope(t: t, d: d) * beat
  }

  /// A dark strobe: the black layer's opacity is k for the first `strobeDuty` of every period, 0 for the rest.
  static func strobeOpacity(t: Double, k: Double) -> Double {
    return frac(EffectMath.strobeHz * t) < EffectMath.strobeDuty ? k : 0
  }

  static func burnOpacity(t: Double, d: Double, k: Double) -> Double {
    return EffectMath.burnMax * k * envelope(t: t, d: d) * (0.5 + 0.5 * sin(tau * EffectMath.burnHz * t))
  }

  /// Where the burn's centre sits on the LEFT edge: a fraction of the height from the TOP of the screen.
  static func burnCentreY(t: Double) -> Double {
    return 0.5 + EffectMath.burnDrift * sin(tau * EffectMath.burnDriftHz * t)
  }

  /// The flare's centre as a fraction of the width.
  static func flareX(t: Double) -> Double {
    return -EffectMath.flareMargin + (1 + 2 * EffectMath.flareMargin) * frac(EffectMath.flareHz * t)
  }

  static func flareOpacity(t: Double, d: Double, k: Double) -> Double {
    return EffectMath.flareMax * k * envelope(t: t, d: d)
  }

  /// How soft the edges are, 0…1 (× edgeBlur × the shorter side = the blur radius).
  static func softEdgeAmount(t: Double, d: Double, k: Double) -> Double {
    return k * envelope(t: t, d: d)
  }

  /// Scratch line `i` (0 … dustLines − 1) in the film frame under `t`.
  static func dustScratch(t: Double, k: Double, i: Double) -> DustScratch {
    let n = (EffectMath.dustFps * t).rounded(.down)
    return DustScratch(on: hash(n * 7 + i * 13 + 1) < EffectMath.dustChance * k, x: hash(n * 3 + i * 17 + 2))
  }

  /// How far the colours are turned round the colour wheel, in radians.
  static func hueAngle(t: Double, d: Double, k: Double) -> Double {
    return Double.pi * k * envelope(t: t, d: d) * sin(tau * EffectMath.hueHz * t)
  }

  /// How much of the mirrored frame shows: full from strength `mirrorFull` up, fading below it.
  static func mirrorMix(t: Double, d: Double, k: Double) -> Double {
    return min(1, k / EffectMath.mirrorFull) * envelope(t: t, d: d)
  }
```

(No constant shares a base name with a function — the existing parity test checks it. `bump` is a function on both sides and has no constant.)

`modules/clipy-video/ios/Tests/EffectMathTests.swift`:
- `effectScalarVectors` gains 34 lines after the `flickerAlpha` line, in the order of `SCALARS`, each in the existing format — e.g. `  EffectScalarVector(fn: "heartbeatScale", name: "first beat, peak", args: [0.88, 4, 1], expect: 1.1),` and `  EffectScalarVector(fn: "burnCentreY", name: "t = 5: highest", args: [5], expect: 0.15),` (numbers exactly as JavaScript prints the TS literal: `-0.2`, `1.0495196320100808`, `0`).
- After `effectGlitchVectors`:

```swift
struct EffectDustVector {
  let name: String
  let t: Double
  let k: Double
  let i: Double
  let on: Bool
  let x: Double
}

let effectDustVectors: [EffectDustVector] = [
  EffectDustVector(name: "frame 3, line 0: off", t: 0.25, k: 1, i: 0, on: false, x: 0.8211895695640123),
  // …the other five, as in DUST_VECTORS.
]
```

- `value(_:)` gains, before `default:`:

```swift
    case ("heartbeatScale", 3): return EffectMath.heartbeatScale(t: a[0], d: a[1], k: a[2])
    case ("strobeOpacity", 2): return EffectMath.strobeOpacity(t: a[0], k: a[1])
    case ("burnOpacity", 3): return EffectMath.burnOpacity(t: a[0], d: a[1], k: a[2])
    case ("burnCentreY", 1): return EffectMath.burnCentreY(t: a[0])
    case ("flareX", 1): return EffectMath.flareX(t: a[0])
    case ("flareOpacity", 3): return EffectMath.flareOpacity(t: a[0], d: a[1], k: a[2])
    case ("softEdgeAmount", 3): return EffectMath.softEdgeAmount(t: a[0], d: a[1], k: a[2])
    case ("hueAngle", 3): return EffectMath.hueAngle(t: a[0], d: a[1], k: a[2])
    case ("mirrorMix", 3): return EffectMath.mirrorMix(t: a[0], d: a[1], k: a[2])
```

- In `testScalarFunctionsMatchTheVectors`: `XCTAssertEqual(effectScalarVectors.count, 55)`. After `testGlitchSliceMatchesTheVectors` add:

```swift
  func testDustScratchMatchesTheVectors() {
    XCTAssertEqual(effectDustVectors.count, 6)
    for v in effectDustVectors {
      let s = EffectMath.dustScratch(t: v.t, k: v.k, i: v.i)
      XCTAssertEqual(s.on, v.on, v.name)
      XCTAssertEqual(s.x, v.x, accuracy: 1e-9, v.name)
    }
  }
```

- [ ] **Step 4:** `npx.cmd jest src/editor/model/__tests__/effectMath src/editor/__tests__/looks.frozen.test.ts src/editor/__tests__/EffectLayer.test.tsx` green — `looks.frozen.test.ts` and `EffectLayer.test.tsx` **unedited**; every existing test of `effectMath.test.ts` and `effectMath.parity.test.ts` passes with only the `SCALARS` addition. `npm run typecheck`; `npm test`.
- [ ] **Step 5: Commit** — explicit paths; `feat(effects): the maths of eight more effects — mirrored constants, functions and vectors; preview scale, layer and shapes`.

---

### Task 4: Transition maths for the ten — a new mirrored pair, vectors, curtains

**Depends on:** Task 1. **Parallel-safe with:** Tasks 2, 3.

**Files:** Create `src/editor/model/transitionMath.ts`, `modules/clipy-video/ios/TransitionMath.swift`, `src/editor/model/__tests__/transitionMath.vectors.ts`, `src/editor/model/__tests__/transitionMath.test.ts`, `src/editor/model/__tests__/transitionMath.parity.test.ts`, `modules/clipy-video/ios/Tests/TransitionMathTests.swift`.

**Do not touch:** `ClipyCompositor.swift` (Tasks 2, 9), `TransitionLayer.tsx` (Task 6), `timeline.ts` (`transitionProgress` is read, not changed), everything under "Never edited this round".

**Interfaces — Produces**

```ts
// src/editor/model/transitionMath.ts
export const TRANSITION = { pixelMax: 0.05 } as const;
export const TRANSITION_COLORS = { flash: "#FFFFFF", curtain: "#000000" } as const;
export const dip: (p: number) => number;
export interface SlideOffsets { ax: number; ay: number; bx: number; by: number; incomingOnTop: boolean }
export function slideOffsets(type: string, p: number): SlideOffsets | null;
export function irisRadius(type: string, p: number): number | null;
export const diagonalEdge: (p: number) => number;
export const clockAngle: (p: number) => number;
export const pixelSize: (p: number) => number;
// Preview only (no Swift twin):
export type TransitionCurtain =
  | { kind: "dip"; color: string; opacity: number }
  | { kind: "panel"; color: string; dx: number; dy: number }
  | { kind: "disc"; color: string; scale: number }
  | { kind: "ring"; color: string; scale: number }
  | { kind: "slant"; color: string; side: "before" | "after"; edge: number };
export function transitionCurtain(type: TransitionType, p: number): TransitionCurtain | null;
export function slantCurtain(edge: number, side: "before" | "after", w: number, h: number): { size: number; dx: number; dy: number; angle: number };
```

```swift
// TransitionMath.swift
struct SlideOffsets: Equatable { let ax: Double; let ay: Double; let bx: Double; let by: Double; let incomingOnTop: Bool }
enum TransitionMath {
  static let pixelMax: Double = 0.05
  static let flashColor = "#FFFFFF"
  static func dip(_ p: Double) -> Double
  static func slideOffsets(_ type: String, _ p: Double) -> SlideOffsets?
  static func irisRadius(_ type: String, _ p: Double) -> Double?
  static func diagonalEdge(_ p: Double) -> Double
  static func clockAngle(_ p: Double) -> Double
  static func pixelSize(_ p: Double) -> Double
}
```

- [ ] **Step 1: Failing tests.**

Create `src/editor/model/__tests__/transitionMath.vectors.ts`:

```ts
/**
 * Shared with the Swift mirror (the tables in modules/clipy-video/ios/Tests/TransitionMathTests.swift, compared line for line by
 * transitionMath.parity.test.ts). Plain literals. p = progress across the window. Offsets are fractions of the frame, y DOWN.
 */
export interface TransitionScalarVector { fn: "dip" | "diagonalEdge" | "clockAngle" | "pixelSize"; p: number; expect: number }
export const TRANSITION_SCALAR_VECTORS: TransitionScalarVector[] = [
  { fn: "dip", p: 0, expect: 0 },                         // 1 − |−1|
  { fn: "dip", p: 0.25, expect: 0.5 },                    // 1 − |−0.5|
  { fn: "dip", p: 0.5, expect: 1 },
  { fn: "dip", p: 0.75, expect: 0.5 },
  { fn: "dip", p: 1, expect: 0 },
  { fn: "diagonalEdge", p: 0.25, expect: 0.5 },           // 2p
  { fn: "diagonalEdge", p: 1, expect: 2 },
  { fn: "clockAngle", p: 0.25, expect: 1.5707963267948966 },   // a quarter turn: 3 o'clock
  { fn: "clockAngle", p: 0.5, expect: 3.141592653589793 },
  { fn: "clockAngle", p: 1, expect: 6.283185307179586 },
  { fn: "pixelSize", p: 0.25, expect: 0.025 },            // 0.05 · 0.5
  { fn: "pixelSize", p: 0.5, expect: 0.05 },
  { fn: "pixelSize", p: 1, expect: 0 },
];

export interface TransitionSlideVector { type: string; p: number; ax: number; ay: number; bx: number; by: number; incomingOnTop: boolean }
export const TRANSITION_SLIDE_VECTORS: TransitionSlideVector[] = [
  { type: "cover", p: 0.25, ax: 0, ay: 0, bx: 0.75, by: 0, incomingOnTop: true },          // the incoming frame is still three quarters to the right
  { type: "cover", p: 1, ax: 0, ay: 0, bx: 0, by: 0, incomingOnTop: true },
  { type: "reveal", p: 0.25, ax: -0.25, ay: 0, bx: 0, by: 0, incomingOnTop: false },       // the outgoing frame has left a quarter to the left
  { type: "reveal", p: 1, ax: -1, ay: 0, bx: 0, by: 0, incomingOnTop: false },
  { type: "coverUp", p: 0.25, ax: 0, ay: 0, bx: 0, by: 0.75, incomingOnTop: true },        // the incoming frame is still three quarters BELOW
  { type: "revealDown", p: 0.25, ax: 0, ay: 0.25, bx: 0, by: 0, incomingOnTop: false },    // the outgoing frame has moved a quarter DOWN
  { type: "revealDown", p: 1, ax: 0, ay: 1, bx: 0, by: 0, incomingOnTop: false },
];

export interface TransitionIrisVector { type: string; p: number; radius: number }
export const TRANSITION_IRIS_VECTORS: TransitionIrisVector[] = [
  { type: "circleOpen", p: 0.25, radius: 0.25 },
  { type: "circleOpen", p: 1, radius: 1 },
  { type: "circleClose", p: 0.25, radius: 0.75 },
  { type: "circleClose", p: 1, radius: 0 },
];
```

Create `src/editor/model/__tests__/transitionMath.test.ts`:

```ts
import { TRANSITION, TRANSITION_COLORS, clockAngle, diagonalEdge, dip, irisRadius, pixelSize, slantCurtain, slideOffsets, transitionCurtain } from "../transitionMath";
import { TRANSITION_TYPES } from "../types";
import { TRANSITION_IRIS_VECTORS, TRANSITION_SCALAR_VECTORS, TRANSITION_SLIDE_VECTORS } from "./transitionMath.vectors";

const FN = { dip, diagonalEdge, clockAngle, pixelSize };
const OLD = TRANSITION_TYPES.slice(1, 11);
const BLACK = TRANSITION_COLORS.curtain;

test.each(TRANSITION_SCALAR_VECTORS)("$fn($p)", (v) => expect(FN[v.fn](v.p)).toBeCloseTo(v.expect, 12));
test.each(TRANSITION_SLIDE_VECTORS)("slideOffsets $type at $p", (v) => {
  const { type, p, ...want } = v;
  expect(slideOffsets(type, p)).toEqual(want);
});
test.each(TRANSITION_IRIS_VECTORS)("irisRadius $type at $p", (v) => expect(irisRadius(v.type, v.p)).toBeCloseTo(v.radius, 12));

test("constants; a type without that geometry gives null", () => {
  expect(TRANSITION).toEqual({ pixelMax: 0.05 });
  expect(TRANSITION_COLORS).toEqual({ flash: "#FFFFFF", curtain: "#000000" });
  for (const type of ["fade", "wipe", "circleOpen", "nope"]) expect(slideOffsets(type, 0.5)).toBeNull();
  for (const type of ["fade", "cover", "nope"]) expect(irisRadius(type, 0.5)).toBeNull();
  // No −0 at the start of a reveal (a −0 is not equal to 0 for the tests, and prints oddly).
  expect(Object.is(slideOffsets("reveal", 0)!.ax, 0)).toBe(true);
});

test("every moving transition starts with only the outgoing frame in view and ends with only the incoming one", () => {
  for (const type of ["cover", "reveal", "coverUp", "revealDown"]) {
    const start = slideOffsets(type, 0)!, end = slideOffsets(type, 1)!;
    // In view = offset 0 on both axes; out of view = a whole frame away on one axis.
    expect([start.ax, start.ay]).toEqual([0, 0]);
    expect([end.bx, end.by]).toEqual([0, 0]);
    expect(Math.abs(start.bx) + Math.abs(start.by) === 1 || !start.incomingOnTop).toBe(true);    // a cover's incoming frame starts fully outside
    expect(Math.abs(end.ax) + Math.abs(end.ay) === 1 || end.incomingOnTop).toBe(true);           // a reveal's outgoing frame ends fully outside
  }
});

describe("transitionCurtain (preview only)", () => {
  test("the ten old types keep the black dip of before, to the number", () => {
    for (const type of OLD) for (const p of [0, 0.1, 0.25, 0.5, 0.738, 1]) {
      expect(transitionCurtain(type, p)).toEqual({ kind: "dip", color: "#000000", opacity: 1 - Math.abs(2 * p - 1) });
    }
    expect(transitionCurtain("none", 0.5)).toBeNull();
    expect(transitionCurtain("fade", NaN)).toBeNull();
  });
  test("clock wipe and pixelate are tag only: the same black dip; the white flash is a white dip", () => {
    expect(transitionCurtain("wipeClock", 0.25)).toEqual({ kind: "dip", color: BLACK, opacity: 0.5 });
    expect(transitionCurtain("pixelate", 0.5)).toEqual({ kind: "dip", color: BLACK, opacity: 1 });
    expect(transitionCurtain("flashWhite", 0.25)).toEqual({ kind: "dip", color: "#FFFFFF", opacity: 0.5 });
    expect(transitionCurtain("flashWhite", 0.5)).toEqual({ kind: "dip", color: "#FFFFFF", opacity: 1 });
  });
  test("cover / reveal: a black panel on the side of the clip that is not playing; the edge is at 1 − p of the width", () => {
    // Before the cut the incoming frame's place (x ≥ 0.75) is black: the panel starts at 0.75. After it the outgoing frame's (x < 0.25): the panel ends at 0.25.
    for (const type of ["cover", "reveal"] as const) {
      expect(transitionCurtain(type, 0.25)).toEqual({ kind: "panel", color: BLACK, dx: 0.75, dy: 0 });
      expect(transitionCurtain(type, 0.75)).toEqual({ kind: "panel", color: BLACK, dx: -0.75, dy: 0 });
      expect(transitionCurtain(type, 0.5)).toEqual({ kind: "panel", color: BLACK, dx: -0.5, dy: 0 });      // the cut belongs to the incoming clip
      expect(transitionCurtain(type, 0)).toEqual({ kind: "panel", color: BLACK, dx: 1, dy: 0 });            // nothing covered
      expect(transitionCurtain(type, 1)).toEqual({ kind: "panel", color: BLACK, dx: -1, dy: 0 });
    }
  });
  test("cover up: the edge rises from the bottom; reveal down: it falls from the top", () => {
    expect(transitionCurtain("coverUp", 0.25)).toEqual({ kind: "panel", color: BLACK, dx: 0, dy: 0.75 });     // y ≥ 0.75 is the incoming frame's
    expect(transitionCurtain("coverUp", 0.75)).toEqual({ kind: "panel", color: BLACK, dx: 0, dy: -0.75 });    // y < 0.25 is still the outgoing frame's
    expect(transitionCurtain("revealDown", 0.25)).toEqual({ kind: "panel", color: BLACK, dx: 0, dy: -0.75 }); // y < 0.25 already shows the incoming frame
    expect(transitionCurtain("revealDown", 0.75)).toEqual({ kind: "panel", color: BLACK, dx: 0, dy: 0.75 });  // y ≥ 0.75 is still the outgoing frame's
  });
  test("circles: a disc where the other clip is inside, a ring where it is outside; the radius is the export's", () => {
    expect(transitionCurtain("circleOpen", 0.25)).toEqual({ kind: "disc", color: BLACK, scale: 0.25 });
    expect(transitionCurtain("circleOpen", 0.75)).toEqual({ kind: "ring", color: BLACK, scale: 0.75 });
    expect(transitionCurtain("circleClose", 0.25)).toEqual({ kind: "ring", color: BLACK, scale: 0.75 });
    expect(transitionCurtain("circleClose", 0.75)).toEqual({ kind: "disc", color: BLACK, scale: 0.25 });
    for (const type of ["circleOpen", "circleClose"] as const) for (const p of [0.01, 0.3, 0.5, 0.9]) {
      const c = transitionCurtain(type, p)!;
      expect(c.kind === "disc" || c.kind === "ring").toBe(true);
      if (c.kind === "disc" || c.kind === "ring") expect(c.scale).toBeCloseTo(irisRadius(type, p)!, 12);
    }
  });
  test("diagonal wipe: the side before the edge is black before the cut, the side after it from the cut on", () => {
    expect(transitionCurtain("wipeDiagonal", 0.25)).toEqual({ kind: "slant", color: BLACK, side: "before", edge: 0.5 });
    expect(transitionCurtain("wipeDiagonal", 0.75)).toEqual({ kind: "slant", color: BLACK, side: "after", edge: 1.5 });
  });
  test("every type but None has a curtain at every progress; progress outside 0…1 is clamped", () => {
    for (const type of TRANSITION_TYPES.slice(1)) for (const p of [0, 0.2, 0.5, 0.8, 1]) expect(transitionCurtain(type, p)).not.toBeNull();
    expect(transitionCurtain("cover", -1)).toEqual(transitionCurtain("cover", 0));
    expect(transitionCurtain("cover", 2)).toEqual(transitionCurtain("cover", 1));
  });
});

describe("slantCurtain: the black square for one side of the diagonal edge, in pixels", () => {
  test("a 100 × 100 frame: diagonal 141.42, the edge at 45°", () => {
    // L = √20000 = 141.4214; normal (0.7071, 0.7071); D = 100·100 / L = 70.7107; size 2L = 282.8427.
    // edge 0.5, before: distance (0.5 − 1)·D = −35.3553; centre offset −35.3553 − 141.4214 = −176.7767 → dx = dy = −125.
    const a = slantCurtain(0.5, "before", 100, 100);
    expect(a.size).toBeCloseTo(282.842712474619, 9); expect(a.dx).toBeCloseTo(-125, 9); expect(a.dy).toBeCloseTo(-125, 9); expect(a.angle).toBeCloseTo(Math.PI / 4, 12);
    // edge 1.5, after: 35.3553 + 141.4214 = 176.7767 → dx = dy = 125.
    const b = slantCurtain(1.5, "after", 100, 100);
    expect(b.dx).toBeCloseTo(125, 9); expect(b.dy).toBeCloseTo(125, 9);
  });
  test("a 300 × 400 frame: diagonal 500, normal (0.8, 0.6), D = 240", () => {
    // edge 1 (the edge runs corner to corner through the centre), before: offset 0 − 500 → (−400, −300); angle atan2(0.6, 0.8).
    const a = slantCurtain(1, "before", 300, 400);
    expect(a).toEqual({ size: 1000, dx: expect.closeTo(-400, 9), dy: expect.closeTo(-300, 9), angle: expect.closeTo(0.6435011087932844, 12) });
    // edge 1.2, after: (1.2 − 1)·240 + 500 = 548 → (438.4, 328.8).
    const b = slantCurtain(1.2, "after", 300, 400);
    expect(b.dx).toBeCloseTo(438.4, 9); expect(b.dy).toBeCloseTo(328.8, 9);
  });
  test("at the two ends nothing, or everything, is on the 'before' side", () => {
    // edge 0: the 'before' square ends at the top-left corner — its nearest point to the frame centre is D away, towards the top-left.
    const start = slantCurtain(0, "before", 100, 100);
    expect(Math.hypot(start.dx, start.dy)).toBeCloseTo(70.71067811865476 + 141.4213562373095, 9);
    // edge 2: the 'after' square starts at the bottom-right corner.
    const end = slantCurtain(2, "after", 100, 100);
    expect(end.dx).toBeCloseTo(150, 9);
    expect(slantCurtain(1, "before", 0, 0)).toEqual({ size: 0, dx: 0, dy: 0, angle: 0 });           // not measured yet
  });
});
```

Create `src/editor/model/__tests__/transitionMath.parity.test.ts`:

```ts
import { readFileSync } from "fs";
import { join } from "path";
import { TRANSITION, TRANSITION_COLORS } from "../transitionMath";
import { TRANSITION_IRIS_VECTORS, TRANSITION_SCALAR_VECTORS, TRANSITION_SLIDE_VECTORS } from "./transitionMath.vectors";

const iosDir = join(__dirname, "../../../../modules/clipy-video/ios");
const read = (file: string) => readFileSync(join(iosDir, file), "utf8").replace(/\r\n/g, "\n");
const swift = read("TransitionMath.swift");
const table = read("Tests/TransitionMathTests.swift");
const code = (source: string) => source.replace(/\/\/[^\n]*/g, "");
const between = (source: string, from: string, to: string): string => {
  const start = source.indexOf(from);
  if (start < 0) throw new Error(`"${from}" not found`);
  const end = source.indexOf(to, start + from.length);
  return source.slice(start, end < 0 ? undefined : end);
};
const fmt = (n: number) => String(n);

test("TransitionMath.swift declares exactly the TRANSITION constants and the flash colour", () => {
  const constants = Object.fromEntries([...swift.matchAll(/static let (\w+): Double = (-?[0-9.]+)/g)].map((m) => [m[1], Number(m[2])]));
  expect(constants).toEqual({ ...TRANSITION });
  const colors = Object.fromEntries([...swift.matchAll(/static let (\w+)Color = "(#[0-9A-Fa-f]{6})"/g)].map((m) => [m[1], m[2]]));
  expect(colors).toEqual({ flash: TRANSITION_COLORS.flash });           // the curtain colour is the preview's alone
});

test("the same functions, the same expressions", () => {
  for (const fn of ["dip", "slideOffsets", "irisRadius", "diagonalEdge", "clockAngle", "pixelSize"]) expect(swift).toMatch(new RegExp(`static func ${fn}\\(`));
  const body = code(swift);
  expect(body).toContain("return 1 - abs(2 * p - 1)");
  expect(body).toContain("case \"cover\": return SlideOffsets(ax: 0, ay: 0, bx: 1 - p, by: 0, incomingOnTop: true)");
  expect(body).toContain("case \"reveal\": return SlideOffsets(ax: 0 - p, ay: 0, bx: 0, by: 0, incomingOnTop: false)");
  expect(body).toContain("case \"coverUp\": return SlideOffsets(ax: 0, ay: 0, bx: 0, by: 1 - p, incomingOnTop: true)");
  expect(body).toContain("case \"revealDown\": return SlideOffsets(ax: 0, ay: p, bx: 0, by: 0, incomingOnTop: false)");
  expect(body).toContain("case \"circleOpen\": return p");
  expect(body).toContain("case \"circleClose\": return 1 - p");
  expect(between(body, "static func diagonalEdge(", "\n  }\n")).toContain("return 2 * p");
  expect(between(body, "static func clockAngle(", "\n  }\n")).toContain("return tau * p");
  expect(between(body, "static func pixelSize(", "\n  }\n")).toContain("return TransitionMath.pixelMax * dip(p)");
  // Pure maths: no Core Image, no UIKit.
  expect(body).not.toMatch(/import (CoreImage|UIKit)|CIImage|CIFilter/);
});

describe("the Swift test tables embed every vector", () => {
  it("have the same number of cases", () => {
    expect([...table.matchAll(/TransitionScalarVector\(fn: "/g)]).toHaveLength(TRANSITION_SCALAR_VECTORS.length);
    expect([...table.matchAll(/TransitionSlideVector\(type: "/g)]).toHaveLength(TRANSITION_SLIDE_VECTORS.length);
    expect([...table.matchAll(/TransitionIrisVector\(type: "/g)]).toHaveLength(TRANSITION_IRIS_VECTORS.length);
  });
  it.each(TRANSITION_SCALAR_VECTORS.map((v) => [`${v.fn}(${v.p})`, v] as const))("%s", (_n, v) => {
    expect(table).toContain(`  TransitionScalarVector(fn: "${v.fn}", p: ${fmt(v.p)}, expect: ${fmt(v.expect)}),`);
  });
  it.each(TRANSITION_SLIDE_VECTORS.map((v) => [`${v.type} ${v.p}`, v] as const))("%s", (_n, v) => {
    expect(table).toContain(`  TransitionSlideVector(type: "${v.type}", p: ${fmt(v.p)}, ax: ${fmt(v.ax)}, ay: ${fmt(v.ay)}, bx: ${fmt(v.bx)}, by: ${fmt(v.by)}, incomingOnTop: ${v.incomingOnTop}),`);
  });
  it.each(TRANSITION_IRIS_VECTORS.map((v) => [`${v.type} ${v.p}`, v] as const))("%s", (_n, v) => {
    expect(table).toContain(`  TransitionIrisVector(type: "${v.type}", p: ${fmt(v.p)}, radius: ${fmt(v.radius)}),`);
  });
});
```

- [ ] **Step 2: Run** `npx.cmd jest src/editor/model/__tests__/transitionMath` → FAIL (no module).
- [ ] **Step 3: Implement both sides.**

Create `src/editor/model/transitionMath.ts`:

```ts
import type { TransitionType } from "./types";

/**
 * The geometry of the ten transitions of 2026-10-06. Mirrored by modules/clipy-video/ios/TransitionMath.swift: keep the constants
 * and the formulas identical (transitionMath.parity.test.ts). `p` = progress 0…1 across the window (`transitionProgress`; the
 * compositor's `progress`). Offsets are fractions of the frame in SCREEN coordinates: x to the right, y DOWN.
 * The eleven older transitions have no maths here: their blends are in ClipyCompositor.swift, and the preview dips to black.
 */
export const TRANSITION = { pixelMax: 0.05 } as const;
/** Content values, allow-listed in noHexLiterals.test.ts. `flash` is burned into the video; `curtain` stands for the clip the preview cannot show. */
export const TRANSITION_COLORS = { flash: "#FFFFFF", curtain: "#000000" } as const;

const TAU = 2 * Math.PI;

/** 0 at both ends of the window, 1 at the cut. */
export const dip = (p: number): number => 1 - Math.abs(2 * p - 1);

/** Where the outgoing frame (a) and the incoming frame (b) sit, and which one is drawn on top. */
export interface SlideOffsets { ax: number; ay: number; bx: number; by: number; incomingOnTop: boolean }
/** The four transitions in which one frame slides over or off the other, which stays still; null for any other type. */
export function slideOffsets(type: string, p: number): SlideOffsets | null {
  switch (type) {
    case "cover": return { ax: 0, ay: 0, bx: 1 - p, by: 0, incomingOnTop: true };            // in from the right
    case "reveal": return { ax: 0 - p, ay: 0, bx: 0, by: 0, incomingOnTop: false };          // off to the left
    case "coverUp": return { ax: 0, ay: 0, bx: 0, by: 1 - p, incomingOnTop: true };          // up from below
    case "revealDown": return { ax: 0, ay: p, bx: 0, by: 0, incomingOnTop: false };          // down and off
    default: return null;
  }
}

/** The circle's radius as a fraction of the frame's half-diagonal: inside it is the incoming frame (open) or the outgoing one (close). Null for any other type. */
export function irisRadius(type: string, p: number): number | null {
  switch (type) {
    case "circleOpen": return p;
    case "circleClose": return 1 - p;
    default: return null;
  }
}

/** The diagonal wipe: the incoming frame shows where u + v < this (u, v = fractions from the top-left corner). */
export const diagonalEdge = (p: number): number => 2 * p;
/** The clock wipe: radians swept clockwise from 12 o'clock; the incoming frame shows inside the sweep. */
export const clockAngle = (p: number): number => TAU * p;
/** Pixelate: the block's side as a fraction of the frame's shorter side. */
export const pixelSize = (p: number): number => TRANSITION.pixelMax * dip(p);

// ---- Preview only (no Swift twin) ----
// The preview shows ONE picture: the outgoing clip up to the cut (p < 0.5), the incoming clip from the cut on. So a transition is
// shown by what is laid over that picture. For the shaped ones the rule is "the other clip is black": before the cut the part the
// incoming frame would occupy is black, from the cut on the part the outgoing frame would still occupy — the boundary is the export's.

export type TransitionCurtain =
  | { kind: "dip"; color: string; opacity: number }                              // the whole frame, at an opacity
  | { kind: "panel"; color: string; dx: number; dy: number }                     // a full-frame panel moved by (dx, dy) frames
  | { kind: "disc"; color: string; scale: number }                               // a circle of the half-diagonal's radius × scale, centred
  | { kind: "ring"; color: string; scale: number }                               // everything OUTSIDE that circle
  | { kind: "slant"; color: string; side: "before" | "after"; edge: number };    // one side of the diagonal edge (`diagonalEdge`)

/** What the preview lays over the picture for `type` at progress `p` (clamped to 0…1); null for None and a progress that is not a number. */
export function transitionCurtain(type: TransitionType, p: number): TransitionCurtain | null {
  if (type === "none" || !Number.isFinite(p)) return null;
  const q = Math.min(1, Math.max(0, p));
  const color = TRANSITION_COLORS.curtain;
  const before = q < 0.5;                                  // the outgoing clip is the one playing
  switch (type) {
    // The incoming frame's place is x ≥ 1 − q (both for a cover and for a reveal: they differ in which picture moves).
    case "cover": case "reveal": return { kind: "panel", color, dx: before ? 1 - q : 0 - q, dy: 0 };
    // …is y ≥ 1 − q.
    case "coverUp": return { kind: "panel", color, dx: 0, dy: before ? 1 - q : 0 - q };
    // …is y < q.
    case "revealDown": return { kind: "panel", color, dx: 0, dy: before ? q - 1 : q };
    case "circleOpen": return { kind: before ? "disc" : "ring", color, scale: q };
    case "circleClose": return { kind: before ? "ring" : "disc", color, scale: 1 - q };
    case "wipeDiagonal": return { kind: "slant", color, side: before ? "before" : "after", edge: diagonalEdge(q) };
    case "flashWhite": return { kind: "dip", color: TRANSITION_COLORS.flash, opacity: dip(q) };
    // The eleven older types, and the two the preview cannot draw (clock wipe, pixelate): the dip to black.
    default: return { kind: "dip", color, opacity: dip(q) };
  }
}

/**
 * The black square that covers one side of the diagonal edge in a frame of w × h pixels: its side (twice the diagonal, so it
 * reaches every corner at any place), how far its centre is moved from the frame's centre, and its turn in radians (its own x axis
 * along the edge's normal, which points from the top-left to the bottom-right). "before" = the side nearer the top-left corner.
 */
export function slantCurtain(edge: number, side: "before" | "after", w: number, h: number): { size: number; dx: number; dy: number; angle: number } {
  const diagonal = Math.hypot(w, h);
  if (!(diagonal > 0)) return { size: 0, dx: 0, dy: 0, angle: 0 };
  const nx = h / diagonal, ny = w / diagonal;              // the edge's unit normal: the gradient of x / w + y / h
  const reach = (w * h) / diagonal;                        // pixels along the normal per unit of u + v
  const size = 2 * diagonal;
  const distance = (edge - 1) * reach;                     // the edge's distance from the frame's centre (u + v = 1 there)
  const offset = side === "before" ? distance - size / 2 : distance + size / 2;
  return { size, dx: nx * offset, dy: ny * offset, angle: Math.atan2(ny, nx) };
}
```

Create `modules/clipy-video/ios/TransitionMath.swift`:

```swift
import Foundation

/// `slideOffsets`' result: where the outgoing frame (a) and the incoming frame (b) sit — fractions of the frame in
/// SCREEN coordinates (x to the right, y DOWN; Core Image is y-up, so the drawing code negates y) — and which one is
/// drawn on top.
struct SlideOffsets: Equatable {
  let ax: Double
  let ay: Double
  let bx: Double
  let by: Double
  let incomingOnTop: Bool
}

/// Mirror of src/editor/model/transitionMath.ts — the constants and the formulas must stay identical (checked by
/// src/editor/model/__tests__/transitionMath.parity.test.ts). `p` = progress 0…1 across the transition window.
/// Pure maths: the images are built in TransitionMasks.swift.
enum TransitionMath {
  static let pixelMax: Double = 0.05

  /// Content value burned into the video (`TRANSITION_COLORS.flash`).
  static let flashColor = "#FFFFFF"

  private static let tau = 2 * Double.pi

  /// 0 at both ends of the window, 1 at the cut.
  static func dip(_ p: Double) -> Double {
    return 1 - abs(2 * p - 1)
  }

  /// The four transitions in which one frame slides over or off the other, which stays still; nil for any other type.
  static func slideOffsets(_ type: String, _ p: Double) -> SlideOffsets? {
    switch type {
    case "cover": return SlideOffsets(ax: 0, ay: 0, bx: 1 - p, by: 0, incomingOnTop: true)
    case "reveal": return SlideOffsets(ax: 0 - p, ay: 0, bx: 0, by: 0, incomingOnTop: false)
    case "coverUp": return SlideOffsets(ax: 0, ay: 0, bx: 0, by: 1 - p, incomingOnTop: true)
    case "revealDown": return SlideOffsets(ax: 0, ay: p, bx: 0, by: 0, incomingOnTop: false)
    default: return nil
    }
  }

  /// The circle's radius as a fraction of the frame's half-diagonal; nil for any other type.
  static func irisRadius(_ type: String, _ p: Double) -> Double? {
    switch type {
    case "circleOpen": return p
    case "circleClose": return 1 - p
    default: return nil
    }
  }

  /// The diagonal wipe: the incoming frame shows where u + v < this (u, v = fractions from the top-left corner).
  static func diagonalEdge(_ p: Double) -> Double {
    return 2 * p
  }

  /// The clock wipe: radians swept clockwise from 12 o'clock.
  static func clockAngle(_ p: Double) -> Double {
    return tau * p
  }

  /// Pixelate: the block's side as a fraction of the frame's shorter side.
  static func pixelSize(_ p: Double) -> Double {
    return TransitionMath.pixelMax * dip(p)
  }
}
```

Create `modules/clipy-video/ios/Tests/TransitionMathTests.swift`: three structs (`TransitionScalarVector { fn: String, p: Double, expect: Double }`, `TransitionSlideVector { type: String, p, ax, ay, bx, by: Double, incomingOnTop: Bool }`, `TransitionIrisVector { type: String, p: Double, radius: Double }`), three tables (`transitionScalarVectors`, `transitionSlideVectors`, `transitionIrisVectors`) whose lines are exactly the ones the parity test builds — e.g. `  TransitionScalarVector(fn: "dip", p: 0.25, expect: 0.5),`, `  TransitionSlideVector(type: "reveal", p: 0.25, ax: -0.25, ay: 0, bx: 0, by: 0, incomingOnTop: false),`, `  TransitionIrisVector(type: "circleClose", p: 0.25, radius: 0.75),` — and:

```swift
final class TransitionMathTests: XCTestCase {
  func testScalarFunctionsMatchTheVectors() {
    XCTAssertEqual(transitionScalarVectors.count, 13)
    for v in transitionScalarVectors {
      let got: Double
      switch v.fn {
      case "dip": got = TransitionMath.dip(v.p)
      case "diagonalEdge": got = TransitionMath.diagonalEdge(v.p)
      case "clockAngle": got = TransitionMath.clockAngle(v.p)
      case "pixelSize": got = TransitionMath.pixelSize(v.p)
      default: XCTFail(v.fn); continue
      }
      XCTAssertEqual(got, v.expect, accuracy: 1e-12, "\(v.fn)(\(v.p))")
    }
  }

  func testSlideOffsetsMatchTheVectors() {
    XCTAssertEqual(transitionSlideVectors.count, 7)
    for v in transitionSlideVectors {
      XCTAssertEqual(TransitionMath.slideOffsets(v.type, v.p), SlideOffsets(ax: v.ax, ay: v.ay, bx: v.bx, by: v.by, incomingOnTop: v.incomingOnTop), "\(v.type) at \(v.p)")
    }
    XCTAssertNil(TransitionMath.slideOffsets("fade", 0.5))
    XCTAssertNil(TransitionMath.slideOffsets("circleOpen", 0.5))
  }

  func testIrisRadiusMatchesTheVectors() {
    XCTAssertEqual(transitionIrisVectors.count, 4)
    for v in transitionIrisVectors {
      guard let r = TransitionMath.irisRadius(v.type, v.p) else { XCTFail(v.type); continue }
      XCTAssertEqual(r, v.radius, accuracy: 1e-12, "\(v.type) at \(v.p)")
    }
    XCTAssertNil(TransitionMath.irisRadius("cover", 0.5))
  }
}
```

(with `import XCTest` and `@testable import ClipyVideo` at the top, and the same header comment as the other vector test files).

- [ ] **Step 4:** `npx.cmd jest src/editor/model/__tests__/transitionMath src/__tests__` green. `npm run typecheck`; `npm test`.
- [ ] **Step 5: Commit** — explicit paths; `feat(transitions): the geometry of ten more transitions as a mirrored pair with vectors; preview curtains`.

---

### Task 5: Preview — effects (`EffectLayer.tsx`)

**Depends on:** Task 3. **Parallel-safe with:** Tasks 6, 7, 8, 9.

**Files:** Modify `src/editor/components/EffectLayer.tsx`, `src/editor/__tests__/EffectLayer.test.tsx` (append only).

**Do not touch:** `PreviewPlayer.tsx` (it renders `<EffectOverlays />` with no props — keep it that way), `effectMath.ts`, `AdjustLayer.tsx`, everything under "Never edited this round".

**Interfaces — Consumes:** `combinedEffectShapes`, `type EffectShape` (Task 3); `VIGNETTE_PREVIEW.strip` (`adjust.ts`, read only); `LinearGradient` from `expo-linear-gradient` (as `AdjustLayer.tsx` uses it). Heartbeat and Strobe need **no** code here: `useEffectTransform` and the existing layer loop already draw what `effectPreview` returns.

**Interfaces — Produces:** `EffectOverlays` unchanged in name and props (none); new test ids `effect-shape-<i>`.

- [ ] **Step 1: Failing tests.** Append to `src/editor/__tests__/EffectLayer.test.tsx` (add `fireEvent` to the RNTL import; `burnOpacity`, `flareOpacity`, `flareX`, `heartbeatScale`, `EFFECT` to the `effectMath` import; `StyleSheet` from `react-native`):

```tsx
describe("the eight effects of 2026-10-06 in the preview", () => {
  const layout = async (width: number) => { await fireEvent(screen.getByTestId("effect-overlays"), "layout", { nativeEvent: { layout: { x: 0, y: 0, width, height: H } } }); };
  const flat = (id: string) => StyleSheet.flatten(screen.getByTestId(id).props.style);

  test("heartbeat scales the picture by the export's number; strobe is a black layer that switches on and off", async () => {
    load([makeEffect({ id: "h", type: "heartbeat", start: 0, end: 4, intensity: 1 })], 0.88);
    const { result } = await renderHook(() => useEffectTransform(W, H));
    expect(result.current).toEqual({ transform: [{ translateX: 0 }, { translateY: 0 }, { scale: heartbeatScale(0.88, 4, 1) }] });
    expect(heartbeatScale(0.88, 4, 1)).toBeCloseTo(1.1, 9);
    load([makeEffect({ id: "s", type: "strobe", start: 0, end: 4, intensity: 0.8 })], 0.1);
    await render(<EffectOverlays />);
    expect(screen.getByTestId("effect-layer-0")).toHaveStyle({ backgroundColor: EFFECT_COLORS.strobe, opacity: 0.8 });
    await act(() => { useEditorStore.getState().seek(0.25); });      // the clear part of the period
    expect(screen.toJSON()).toBeNull();
  });

  test("film burn: a gradient from the left edge over 70 % of the width, in the burn colour, at the computed opacity", async () => {
    load([makeEffect({ id: "b", type: "filmBurn", start: 0, end: 4, intensity: 1 })], 0.625);
    await render(<EffectOverlays />);
    const burn = screen.getByTestId("effect-shape-0");
    expect(flat("effect-shape-0")).toMatchObject({ position: "absolute", left: 0, top: 0, bottom: 0, width: "70%", opacity: burnOpacity(0.625, 4, 1) });
    expect(burn.props.colors).toEqual([EFFECT_COLORS.filmBurn, `${EFFECT_COLORS.filmBurn}00`]);
    expect(screen.getByTestId("effect-overlays").props.pointerEvents).toBe("none");
  });

  test("lens flare: nothing until the frame is measured, then a band 40 % wide whose centre is at flareX — moved by transform only", async () => {
    load([makeEffect({ id: "f", type: "lensFlare", start: 0, end: 4, intensity: 1 })], 1);
    await render(<EffectOverlays />);
    expect(screen.queryByTestId("effect-shape-0")).toBeNull();
    await layout(W);
    // band 0.4 · 270 = 108; centre at flareX(1) · 270 = 135 → left edge 135 − 54 = 81
    const band = 0.4 * W;
    expect(band).toBeCloseTo(108, 9);
    expect(flat("effect-shape-0")).toMatchObject({ left: 0, width: band, opacity: flareOpacity(1, 4, 1), transform: [{ translateX: flareX(1) * W - band / 2 }] });
    expect(flareX(1) * W - band / 2).toBeCloseTo(81, 9);
    expect(screen.getByTestId("effect-shape-0").props.colors).toEqual([`${EFFECT_COLORS.lensFlare}00`, EFFECT_COLORS.lensFlare, `${EFFECT_COLORS.lensFlare}00`]);
    await act(() => { useEditorStore.getState().seek(1.5); });
    expect(flat("effect-shape-0")).toMatchObject({ left: 0, width: band, transform: [{ translateX: flareX(1.5) * W - band / 2 }] });      // only the transform moved
  });

  test("soft edges: four pale strips, one per edge, under one opacity", async () => {
    load([makeEffect({ id: "e", type: "softEdges", start: 0, end: 4, intensity: 0.7 })], 1);
    await render(<EffectOverlays />);
    expect(flat("effect-shape-0").opacity).toBeCloseTo(EFFECT.edgeVeil * 0.7, 9);
    for (const edge of ["top", "bottom", "left", "right"]) expect(screen.getByTestId(`effect-shape-0-${edge}`).props.colors).toEqual([EFFECT_COLORS.softEdges, `${EFFECT_COLORS.softEdges}00`]);
  });

  test("dust: thin lines at the export's places, once the frame is measured", async () => {
    load([makeEffect({ id: "d", type: "dust", start: 0, end: 4, intensity: 1 })], 1);
    await render(<EffectOverlays />);
    await layout(W);
    expect(flat("effect-shape-0")).toMatchObject({ left: 0, top: 0, bottom: 0, width: 2, backgroundColor: EFFECT_COLORS.dust, opacity: 0.5 });
    expect(flat("effect-shape-0").transform[0].translateX).toBeCloseTo(0.4702766282589437 * W, 6);
    expect(flat("effect-shape-1").transform[0].translateX).toBeCloseTo(0.8728999602171825 * W, 6);
    expect(screen.queryByTestId("effect-shape-2")).toBeNull();
  });

  test("hue shift and mirror draw nothing (tag only)", async () => {
    load([makeEffect({ id: "m", type: "mirror", start: 0, end: 4 }), makeEffect({ id: "u", type: "hueShift", start: 0, end: 4 })], 1);
    await render(<EffectOverlays />);
    expect(screen.toJSON()).toBeNull();
  });

  test("layers come first, shapes after them, in list order", async () => {
    load([makeEffect({ id: "b", type: "filmBurn", start: 0, end: 4, intensity: 1 }), makeEffect({ id: "g", type: "glow", start: 0, end: 4, intensity: 1 })], 0.625);
    await render(<EffectOverlays />);
    const ids = screen.getByTestId("effect-overlays").children.map((c) => (typeof c === "string" ? c : c.props.testID));
    expect(ids).toEqual(["effect-layer-0", "effect-shape-0"]);
  });
});
```

- [ ] **Step 2: Run** `npx.cmd jest src/editor/__tests__/EffectLayer.test.tsx` → the new tests FAIL; the eight existing ones pass.
- [ ] **Step 3: Implement** `src/editor/components/EffectLayer.tsx` — the two hooks at the top (`useEffectPreview`, `useEffectTransform`) are not changed. Replace the imports and `EffectOverlays` with:

```tsx
import { LinearGradient } from "expo-linear-gradient";
import { useMemo, useState } from "react";
import { View, type ViewStyle } from "react-native";
import { VIGNETTE_PREVIEW } from "@/src/editor/model/adjust";
import { combinedEffectPreview, combinedEffectShapes, type EffectPreview, type EffectShape } from "@/src/editor/model/effectMath";
import { useEditorStore } from "@/src/editor/store";

const full = { position: "absolute" as const, left: 0, top: 0, right: 0, bottom: 0 };
const abs = "absolute" as const;
/** How far the burn's light reaches across the frame, and how wide the flare's band is (fractions of the width); a scratch's width in points. */
const BURN_REACH = "70%";
const FLARE_BAND = 0.4;
const SCRATCH_WIDTH = 2;
/** Four edge strips, each coloured at its own edge and clear towards the middle (the vignette's geometry). */
const EDGE = VIGNETTE_PREVIEW.strip;
const STRIPS = [
  { edge: "top", style: { position: abs, left: 0, right: 0, top: 0, height: EDGE }, start: { x: 0.5, y: 0 }, end: { x: 0.5, y: 1 } },
  { edge: "bottom", style: { position: abs, left: 0, right: 0, bottom: 0, height: EDGE }, start: { x: 0.5, y: 1 }, end: { x: 0.5, y: 0 } },
  { edge: "left", style: { position: abs, top: 0, bottom: 0, left: 0, width: EDGE }, start: { x: 0, y: 0.5 }, end: { x: 1, y: 0.5 } },
  { edge: "right", style: { position: abs, top: 0, bottom: 0, right: 0, width: EDGE }, start: { x: 1, y: 0.5 }, end: { x: 0, y: 0.5 } },
];
/** The same colour, fully see-through (`#RRGGBB` → `#RRGGBB00`). */
const clear = (color: string) => `${color}00`;
```

then, after `useEffectTransform`:

```tsx
/** The shapes (burn, flare, soft edges, scratches) of the effects under the playhead. */
function useEffectShapes(): EffectShape[] {
  const effects = useEditorStore((s) => s.project?.effects);
  const playhead = useEditorStore((s) => s.playhead);
  return useMemo(() => (effects && effects.length > 0 ? combinedEffectShapes(effects, playhead) : []), [effects, playhead]);
}

/** One shape. `width` is the frame's measured width (0 until it is known: a shape placed in pixels waits for it). Only opacity and transform change with the playhead. */
function Shape({ shape: s, index, width }: { shape: EffectShape; index: number; width: number }) {
  const id = `effect-shape-${index}`;
  switch (s.kind) {
    case "burn":
      return <LinearGradient testID={id} colors={[s.color, clear(s.color)]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={{ position: abs, left: 0, top: 0, bottom: 0, width: BURN_REACH, opacity: s.opacity }} />;
    case "edges":
      return (
        <View testID={id} style={{ ...full, opacity: s.opacity }}>
          {STRIPS.map((strip) => <LinearGradient key={strip.edge} testID={`${id}-${strip.edge}`} colors={[s.color, clear(s.color)]} start={strip.start} end={strip.end} style={strip.style} />)}
        </View>
      );
    case "flare": {
      if (!(width > 0)) return null;
      const band = FLARE_BAND * width;
      return <LinearGradient testID={id} colors={[clear(s.color), s.color, clear(s.color)]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }}
        style={{ position: abs, left: 0, top: 0, bottom: 0, width: band, opacity: s.opacity, transform: [{ translateX: s.x * width - band / 2 }] }} />;
    }
    case "scratch":
      if (!(width > 0)) return null;
      return <View testID={id} style={{ position: abs, left: 0, top: 0, bottom: 0, width: SCRATCH_WIDTH, backgroundColor: s.color, opacity: s.opacity, transform: [{ translateX: s.x * width }] }} />;
  }
}

/**
 * What the effects under the playhead lay over the picture: the flat colour layers (flash, light leak, VHS, old film, glow, strobe)
 * and then the shapes (film burn, lens flare, soft edges, dust). It measures its own width — the preview player hands it nothing.
 */
export function EffectOverlays() {
  const p = useEffectPreview();
  const shapes = useEffectShapes();
  const [width, setWidth] = useState(0);
  const layers = p?.layers ?? [];
  if (layers.length === 0 && shapes.length === 0) return null;
  return (
    <View testID="effect-overlays" pointerEvents="none" style={full}
      onLayout={(e) => { const w = e.nativeEvent.layout.width; setWidth((was) => (was === w ? was : w)); }}>
      {layers.map((l, i) => <View key={`l${i}`} testID={`effect-layer-${i}`} style={{ ...full, backgroundColor: l.color, opacity: l.opacity }} />)}
      {shapes.map((s, i) => <Shape key={`s${i}`} shape={s} index={i} width={width} />)}
    </View>
  );
}
```

(The file holds no hex literal: every colour comes from `EFFECT_COLORS`. `left` / `top` / `bottom` / `width` are positions, not spacing: the spacing guard reads `padding` / `margin` / `gap`.)

- [ ] **Step 4:** `npx.cmd jest src/editor/__tests__/EffectLayer.test.tsx src/editor/__tests__/PreviewPlayer src/__tests__` green — the `PreviewPlayer` tests and the first eight tests of `EffectLayer.test.tsx` **unedited**. `npm run typecheck`; `npm test`.
- [ ] **Step 5: Commit** — `git add src/editor/components/EffectLayer.tsx src/editor/__tests__/EffectLayer.test.tsx`; `feat(preview): film burn, lens flare, soft edges and dust as shapes over the picture; heartbeat and strobe through the existing paths`.

---

### Task 6: Preview — transitions (`TransitionLayer.tsx`); the tag truth table

**Depends on:** Task 4. **Parallel-safe with:** Tasks 5, 7, 8, 9.

**Files:** Modify `src/editor/components/TransitionLayer.tsx`; create `src/editor/__tests__/TransitionLayer.test.tsx`; modify `src/editor/__tests__/PreviewTag.test.tsx` (append only).

**Do not touch:** `PreviewPlayer.tsx` (it renders `<TransitionLayer />` with no props), `PreviewTag.tsx` (no rule changes — the table below must pass against the code as it is), `transitionMath.ts`, `timeline.ts`, everything under "Never edited this round".

**Interfaces — Consumes:** `transitionCurtain`, `slantCurtain`, `type TransitionCurtain` (Task 4); `transitionProgress` (`timeline.ts`).

- [ ] **Step 1: Failing tests.** Create `src/editor/__tests__/TransitionLayer.test.tsx`:

```tsx
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import { makeClip, makeProject, TRANSITION_TYPES, type TransitionType } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { TransitionLayer } from "../components/TransitionLayer";

const W = 300, H = 400;                       // diagonal 500, half-diagonal 250
/** Two 4-s clips with a 1-s transition of `type`: the window is 3.5 … 4.5, the cut at 4. */
const load = (type: TransitionType, playhead: number) => {
  useEditorStore.getState().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 4, transitionOut: { type, duration: 1 } }), makeClip({ id: "b", sourceDuration: 4 })] }));
  useEditorStore.getState().seek(playhead);
};
const layout = async () => { await fireEvent(screen.getByTestId("transition-layer"), "layout", { nativeEvent: { layout: { x: 0, y: 0, width: W, height: H } } }); };
const flat = (id: string) => StyleSheet.flatten(screen.getByTestId(id).props.style);

beforeEach(() => { useEditorStore.getState().reset(); });

test("the ten old types are drawn as before: one black view over the frame whose opacity peaks at the cut", async () => {
  for (const type of TRANSITION_TYPES.slice(1, 11)) {
    load(type, 3.75);                                               // progress 0.25
    const view = await render(<TransitionLayer />);
    const layer = screen.getByTestId("transition-layer");
    expect(layer.props.style).toEqual({ position: "absolute", inset: 0, backgroundColor: "#000000", opacity: 0.5 });
    expect(layer.props.pointerEvents).toBe("none");
    expect(layer.children).toHaveLength(0);
    await view.unmount();
  }
});

test("outside a window, and without a project, nothing is drawn", async () => {
  await render(<TransitionLayer />);
  expect(screen.toJSON()).toBeNull();
  await act(() => { load("cover", 2); });
  expect(screen.toJSON()).toBeNull();
});

test("white flash: the same single view, white", async () => {
  load("flashWhite", 4);
  await render(<TransitionLayer />);
  expect(screen.getByTestId("transition-layer").props.style).toEqual({ position: "absolute", inset: 0, backgroundColor: "#FFFFFF", opacity: 1 });
});

test("clock wipe and pixelate are tag only: the black dip", async () => {
  for (const type of ["wipeClock", "pixelate"] as const) {
    load(type, 4.25);
    const view = await render(<TransitionLayer />);
    expect(screen.getByTestId("transition-layer").props.style).toEqual({ position: "absolute", inset: 0, backgroundColor: "#000000", opacity: 0.5 });
    await view.unmount();
  }
});

test("a shaped curtain draws nothing until the frame is measured, then one view; only its transform follows the playhead", async () => {
  load("cover", 3.75);
  await render(<TransitionLayer />);
  expect(screen.getByTestId("transition-layer").props.pointerEvents).toBe("none");
  expect(screen.queryByTestId("transition-shape")).toBeNull();
  await layout();
  // progress 0.25, before the cut: the panel starts at 0.75 of the width → 225
  expect(flat("transition-shape")).toMatchObject({ position: "absolute", left: 0, top: 0, right: 0, bottom: 0, backgroundColor: "#000000", transform: [{ translateX: 225 }, { translateY: 0 }] });
  await act(() => { useEditorStore.getState().seek(4.25); });       // progress 0.75, after the cut: the panel ends at 0.25 → −225
  expect(flat("transition-shape")).toMatchObject({ left: 0, top: 0, right: 0, bottom: 0, transform: [{ translateX: -225 }, { translateY: 0 }] });
});

test("cover up and reveal down move the panel along y", async () => {
  load("coverUp", 3.75);
  await render(<TransitionLayer />);
  await layout();
  expect(flat("transition-shape").transform).toEqual([{ translateX: 0 }, { translateY: 300 }]);          // 0.75 · 400
  await act(() => { load("revealDown", 3.75); });
  expect(flat("transition-shape").transform).toEqual([{ translateX: 0 }, { translateY: -300 }]);
});

test("circle open: a black disc before the cut, a black ring after it — one fixed-size view each, scaled", async () => {
  load("circleOpen", 3.75);
  await render(<TransitionLayer />);
  await layout();
  // The disc: radius 250 about the centre (150, 200) → left −100, top −50, side 500.
  expect(flat("transition-shape")).toMatchObject({ left: -100, top: -50, width: 500, height: 500, borderRadius: 250, backgroundColor: "#000000", transform: [{ scale: 0.25 }] });
  await act(() => { useEditorStore.getState().seek(4.25); });
  // The ring: a clear circle of radius 250 inside a 250-thick black border → side 1000, left −350, top −300.
  const ring = flat("transition-shape");
  expect(ring).toMatchObject({ left: -350, top: -300, width: 1000, height: 1000, borderRadius: 500, borderWidth: 250, borderColor: "#000000", transform: [{ scale: 0.75 }] });
  expect(ring.backgroundColor).toBeUndefined();
});

test("circle close is the other way round", async () => {
  load("circleClose", 3.75);
  await render(<TransitionLayer />);
  await layout();
  expect(flat("transition-shape")).toMatchObject({ borderWidth: 250, transform: [{ scale: 0.75 }] });
  await act(() => { useEditorStore.getState().seek(4.25); });
  expect(flat("transition-shape")).toMatchObject({ borderRadius: 250, backgroundColor: "#000000", transform: [{ scale: 0.25 }] });
});

test("diagonal wipe: a black square of twice the diagonal, turned to the edge and moved along its normal", async () => {
  load("wipeDiagonal", 4);                                           // progress 0.5: the edge runs corner to corner; the cut → the 'after' side
  await render(<TransitionLayer />);
  await layout();
  const s = flat("transition-shape");
  // size 1000 about the centre → left −350, top −300; offset 0 + 500 along (0.8, 0.6) → (400, 300); turn atan2(0.6, 0.8)
  expect(s).toMatchObject({ left: -350, top: -300, width: 1000, height: 1000, backgroundColor: "#000000" });
  expect(s.transform[0].translateX).toBeCloseTo(400, 6);
  expect(s.transform[1].translateY).toBeCloseTo(300, 6);
  expect(s.transform[2]).toEqual({ rotate: `${Math.atan2(0.6, 0.8)}rad` });
});

test("the same size reported again sets no state (no re-render loop)", async () => {
  load("cover", 3.75);
  await render(<TransitionLayer />);
  await layout();
  const before = flat("transition-shape");
  await layout();
  expect(flat("transition-shape")).toEqual(before);
});
```

Append to `src/editor/__tests__/PreviewTag.test.tsx` (add `EFFECT_IDS`, `FILTER_IDS`, `TRANSITION_TYPES` to the `types` import):

```ts
describe("the tag's truth table for every look in the registries (the rule is unchanged: any filter, any effect, any transition)", () => {
  const cut = (type: (typeof TRANSITION_TYPES)[number]) => makeProject({ clips: [makeClip({ id: "a", sourceDuration: 4, transitionOut: { type, duration: 1 } }), makeClip({ id: "b", sourceDuration: 4 })] });
  test.each(FILTER_IDS.filter((id) => id !== "none"))("filter %s: tag at any strength above 0, none at 0", (id) => {
    expect(needsPreviewTag(one({ filter: id }), 1)).toBe(true);
    expect(needsPreviewTag(one({ filter: id, filterIntensity: 0.01 }), 1)).toBe(true);
    expect(needsPreviewTag(one({ filter: id, filterIntensity: 0 }), 1)).toBe(false);
  });
  test.each([...EFFECT_IDS])("effect %s: tag while it covers the playhead — also the ones the preview draws exactly, and the ones it cannot draw", (type) => {
    const p = makeProject({ clips: [makeClip({ id: "a", sourceDuration: 4 })], effects: [makeEffect({ id: "e", type, start: 1, end: 2 })] });
    expect([needsPreviewTag(p, 0.99), needsPreviewTag(p, 1), needsPreviewTag(p, 1.99), needsPreviewTag(p, 2)]).toEqual([false, true, true, false]);
  });
  test.each(TRANSITION_TYPES.filter((t) => t !== "none"))("transition %s: tag inside its window only", (type) => {
    expect([needsPreviewTag(cut(type), 3.4), needsPreviewTag(cut(type), 3.6), needsPreviewTag(cut(type), 4), needsPreviewTag(cut(type), 4.5), needsPreviewTag(cut(type), 4.6)]).toEqual([false, true, true, true, false]);
  });
  test("None never needs the tag; the counts are the registries'", () => {
    expect(needsPreviewTag(cut("none"), 4)).toBe(false);
    expect(needsPreviewTag(one({ filter: null }), 1)).toBe(false);
    expect(EFFECT_IDS).toHaveLength(20);
    expect(TRANSITION_TYPES).toHaveLength(21);
  });
});
```

- [ ] **Step 2: Run** `npx.cmd jest src/editor/__tests__/TransitionLayer.test.tsx src/editor/__tests__/PreviewTag.test.tsx` → the `TransitionLayer` tests for the shaped curtains and the white flash FAIL; the first two and the whole tag table PASS (the tag rule needs no change — if a row of the table fails, stop and report: do not edit `PreviewTag.tsx`).
- [ ] **Step 3: Implement** `src/editor/components/TransitionLayer.tsx` (the whole file):

```tsx
import { useState } from "react";
import { View } from "react-native";
import { transitionProgress } from "@/src/editor/model/timeline";
import { slantCurtain, transitionCurtain, type TransitionCurtain } from "@/src/editor/model/transitionMath";
import { useEditorStore } from "@/src/editor/store";

const fill = { position: "absolute" as const, left: 0, top: 0, right: 0, bottom: 0 };
type Shaped = Exclude<TransitionCurtain, { kind: "dip" }>;

/** One shaped curtain in a frame of w × h points: a single view of a fixed size; only its transform follows the playhead. */
function Shape({ curtain: c, w, h }: { curtain: Shaped; w: number; h: number }) {
  const radius = Math.hypot(w, h) / 2;             // the frame's half-diagonal: a circle of this radius reaches the corners
  switch (c.kind) {
    case "panel":
      return <View testID="transition-shape" style={{ ...fill, backgroundColor: c.color, transform: [{ translateX: c.dx * w }, { translateY: c.dy * h }] }} />;
    case "disc":
      return <View testID="transition-shape" style={{ position: "absolute", left: w / 2 - radius, top: h / 2 - radius, width: 2 * radius, height: 2 * radius, borderRadius: radius, backgroundColor: c.color, transform: [{ scale: c.scale }] }} />;
    case "ring":
      // A clear circle of `radius` inside a border one radius thick: scaled by s, the hole has the radius s × radius and the border still reaches past the corners (s ≥ 0.5).
      return <View testID="transition-shape" style={{ position: "absolute", left: w / 2 - 2 * radius, top: h / 2 - 2 * radius, width: 4 * radius, height: 4 * radius, borderRadius: 2 * radius, borderWidth: radius, borderColor: c.color, transform: [{ scale: c.scale }] }} />;
    case "slant": {
      const g = slantCurtain(c.edge, c.side, w, h);
      return <View testID="transition-shape" style={{ position: "absolute", left: w / 2 - g.size / 2, top: h / 2 - g.size / 2, width: g.size, height: g.size, backgroundColor: c.color,
        transform: [{ translateX: g.dx }, { translateY: g.dy }, { rotate: `${g.angle}rad` }] }} />;
    }
  }
}

/**
 * What a transition lays over the preview's one picture across its window (`transitionCurtain`): a dip to black — every older type,
 * and the two the preview cannot draw —, a dip to white, or a black shape standing for the clip that is not playing.
 * It measures the frame itself (the preview player hands it nothing); a shape waits for that.
 */
export function TransitionLayer() {
  const project = useEditorStore((s) => s.project);
  const playhead = useEditorStore((s) => s.playhead);
  const [frame, setFrame] = useState({ w: 0, h: 0 });
  const tp = project ? transitionProgress(project, playhead) : null;
  if (!project || !tp) return null;
  const curtain = transitionCurtain(project.clips[tp.index].transitionOut.type, tp.progress);
  if (!curtain) return null;
  if (curtain.kind === "dip") {
    // The element every transition had before 2026-10-06, unchanged.
    return <View pointerEvents="none" testID="transition-layer" style={{ position: "absolute", inset: 0, backgroundColor: curtain.color, opacity: curtain.opacity }} />;
  }
  return (
    <View pointerEvents="none" testID="transition-layer" style={fill}
      onLayout={(e) => { const { width: w, height: h } = e.nativeEvent.layout; setFrame((was) => (was.w === w && was.h === h ? was : { w, h })); }}>
      {frame.w > 0 && frame.h > 0 ? <Shape curtain={curtain} w={frame.w} h={frame.h} /> : null}
    </View>
  );
}
```

(The file's one hex literal is gone — the colours now come from `transitionMath.ts`; its line in the hex guard's allow-list may stay.)

- [ ] **Step 4:** `npx.cmd jest src/editor/__tests__/TransitionLayer.test.tsx src/editor/__tests__/PreviewTag.test.tsx src/editor/__tests__/PreviewPlayer src/__tests__` green — the `PreviewPlayer` tests **unedited** (their order lists name `transition-layer`, which is still there). `npm run typecheck`; `npm test`.
- [ ] **Step 5: Commit** — `git add src/editor/components/TransitionLayer.tsx src/editor/__tests__/TransitionLayer.test.tsx src/editor/__tests__/PreviewTag.test.tsx`; `feat(preview): shaped curtains for six transitions, a white dip for the flash; the tag's truth table for every look`.

---

### Task 7: Pickers — the longer rows open at the selected item

**Depends on:** Task 2 (the filter ids; the effect and transition ids are Task 1's). **Parallel-safe with:** Tasks 5, 6, 8, 9.

**Files:** Modify `src/ui/ToolStrip.tsx` (one new exported function), `src/editor/components/FilterSheet.tsx`, `src/editor/components/TransitionSheet.tsx`, `src/ui/__tests__/ToolStrip.test.tsx` (append), `src/editor/__tests__/FilterSheet.test.tsx` (append), `src/editor/__tests__/TransitionSheet.test.tsx` (lines 26–31 + append), `src/editor/__tests__/EffectSheet.test.tsx` (append).

**Do not touch:** `EffectSheet.tsx` (it lists `EFFECT_IDS` and needs no change), `StripTiles` and `tilesStartX` themselves, `Chip.tsx`, `Tile.tsx`, `EffectStrengthSheet.tsx`, `EffectPill.tsx`, `src/editor/toolStrip.ts`, everything under "Never edited this round".

**Why (read in `node_modules/react-native/React/Fabric/Mounting/ComponentViews/ScrollView/RCTScrollViewComponentView.mm`, lines 404–405):** `contentOffset` — what `StripTiles`' `initialX` sets — is applied on **every** change of the prop and is **not** clamped to the content. So (a) a start that follows the selection would move the row under the finger on every pick: it is worked out **once per opening**; (b) a start past the row's end would open on empty space: it is clamped.

**Interfaces — Produces**

```ts
// src/ui/ToolStrip.tsx
/** `tilesStartX`, never past the row's end: `count` tiles of `tileWidth` in a row as wide as `viewportWidth` (a strip is as wide as the window). */
export const tilesStartXIn: (index: number, tileWidth: number, count: number, viewportWidth: number) => number;
```

- [ ] **Step 1: Failing tests.**

Append to `src/ui/__tests__/ToolStrip.test.tsx` (import `tilesStartXIn`, `tilesStartX`):

```ts
test("tilesStartXIn: the selected tile in view, but never past the row's end", () => {
  // 32 tiles of 52 with gaps of 8 and a 16 gutter each side: 32·52 + 31·8 + 32 = 1944 wide. In a 375 window the last start is 1569.
  expect(tilesStartXIn(0, 52, 32, 375)).toBe(0);
  expect(tilesStartXIn(5, 52, 32, 375)).toBe(tilesStartX(5, 52));         // 5·60 − 52 = 248: unchanged
  expect(tilesStartXIn(20, 52, 32, 375)).toBe(1148);                       // 20·60 − 52
  expect(tilesStartXIn(31, 52, 32, 375)).toBe(1569);                       // 31·60 − 52 = 1808 → clamped to 1944 − 375
  // A row that fits the window never scrolls: 3·72 + 2·8 + 32 = 264 < 375.
  expect(tilesStartXIn(2, 72, 3, 375)).toBe(0);
});
```

Append to `src/editor/__tests__/FilterSheet.test.tsx` (add `FILTER_IDS` to the `types` import, `FILTERS` from `@/src/editor/effects`, `Dimensions` from `react-native`):

```tsx
type Inst = ReturnType<typeof screen.getByTestId>;
const findScroll = (n: Inst): Inst | null => { if (n.props.contentOffset !== undefined) return n; for (const c of n.children) { if (typeof c === "string") continue; const f = findScroll(c as Inst); if (f) return f; } return null; };
const startX = () => findScroll(screen.getByTestId("strip-tiles"))!.props.contentOffset.x as number;
/** As the kit computes it: 32 tiles of 52, gaps of 8, a 16 gutter each side. */
const rowEnd = () => 32 * 52 + 31 * 8 + 32 - Dimensions.get("window").width;

test("32 tiles: the twenty old filters first, in their order, then the twelve new ones; one thumbnail request for all of them", async () => {
  const { getThumb } = jest.requireMock("@/src/editor/components/thumbnails") as { getThumb: jest.Mock };
  getThumb.mockClear();
  await render(<FilterSheet clipId="a" visible onClose={() => {}} />);
  const labels = screen.getAllByRole("button").map((b) => b.props.accessibilityLabel).filter((l) => l !== "Done" && l !== "Apply to all clips");
  expect(labels).toEqual(FILTER_IDS.map((id) => FILTERS[id].label));
  expect(labels).toHaveLength(32);
  expect(labels.slice(0, 20)).toEqual(["None", "Warm", "Cool", "Vivid", "Faded", "Mono", "Noir", "Vintage", "Sunset", "Golden", "Teal", "Pastel", "Film", "Chrome", "Instant", "Process", "Tonal", "Sepia", "Crisp", "Dream"]);
  expect(getThumb).toHaveBeenCalledTimes(1);
});

test("a new filter is picked like an old one and keeps the strength", async () => {
  await render(<FilterSheet clipId="a" visible onClose={() => {}} />);
  await fireEvent.press(screen.getByRole("button", { name: "Cinema" }));
  expect(useEditorStore.getState().project!.clips[0]).toMatchObject({ filter: "tealOrange", filterIntensity: 1 });
  expect(screen.getByTestId("filter-strength").props.accessibilityState.disabled).toBe(false);
  expect(useEditorStore.getState().past).toHaveLength(1);
});

test("the row opens with the selected filter in view — worked out once per opening, never past the row's end", async () => {
  useEditorStore.getState().apply((p) => ({ ...p, clips: p.clips.map((c) => (c.id === "a" ? { ...c, filter: "kodak" as const } : c)) }));
  const view = await render(<FilterSheet clipId="a" visible onClose={() => {}} />);
  expect(startX()).toBe(Math.min(20 * 60 - 52, rowEnd()));             // Kodak is tile 20
  // Picking another filter does not move the row under the finger.
  await fireEvent.press(screen.getByRole("button", { name: "Warm" }));
  expect(startX()).toBe(Math.min(20 * 60 - 52, rowEnd()));
  // Closed and opened again: now it starts at Warm (tile 1 → 1·60 − 52 = 8).
  await view.rerender(<FilterSheet clipId="a" visible={false} onClose={() => {}} />);
  await view.rerender(<FilterSheet clipId="a" visible onClose={() => {}} />);
  expect(startX()).toBe(8);
  // The last filter: clamped to the row's end. Another clip (no filter): the start of the row.
  await fireEvent.press(screen.getByRole("button", { name: "Drama" }));
  await view.rerender(<FilterSheet clipId="a" visible={false} onClose={() => {}} />);
  await view.rerender(<FilterSheet clipId="a" visible onClose={() => {}} />);
  expect(startX()).toBe(Math.min(31 * 60 - 52, rowEnd()));
  await view.rerender(<FilterSheet clipId="b" visible onClose={() => {}} />);
  expect(startX()).toBe(0);
});
```

`src/editor/__tests__/TransitionSheet.test.tsx` — replace the test at lines 26–31 and append (add `fireEvent`'s `act` if needed, `TRANSITION_TYPES`, `TRANSITIONS`, `Dimensions`, `theme`):

```tsx
test("shows twenty-one chips: the eleven old ones first, in their order, then the ten new ones", async () => {
  await render(<TransitionSheet clipIndex={0} visible onClose={() => {}} />);
  const labels = screen.getAllByRole("button").map((b) => b.props.accessibilityLabel).filter((l) => l !== "Done");
  expect(labels).toEqual(["None", "Fade", "Dissolve", "Slide left", "Zoom", "Slide right", "Slide up", "Slide down", "Wipe", "Spin", "Blur",
    "Cover left", "Reveal left", "Cover up", "Reveal down", "Circle open", "Circle close", "Diagonal wipe", "Clock wipe", "Pixelate", "White flash"]);
  expect(labels).toEqual(TRANSITION_TYPES.map((t) => TRANSITIONS[t].label));
});

test("a new transition is set with the default duration and the slider keeps working", async () => {
  await render(<TransitionSheet clipIndex={0} visible onClose={() => {}} />);
  await fireEvent.press(screen.getByRole("button", { name: "Clock wipe" }));
  expect(useEditorStore.getState().project!.clips[0].transitionOut).toEqual({ type: "wipeClock", duration: 0.5 });
  const slider = screen.getByTestId("transition-slider");
  await fireEvent(slider, "touchStart"); await fireEvent(slider, "touchMove");
  expect(useEditorStore.getState().project!.clips[0].transitionOut).toEqual({ type: "wipeClock", duration: 0.8 });
  expect(useEditorStore.getState().past).toHaveLength(2);
});

describe("the row opens with the selected chip in view (chips have different widths, so their places are measured)", () => {
  type Inst = ReturnType<typeof screen.getByTestId>;
  const findScroll = (n: Inst): Inst | null => { if (n.props.contentOffset !== undefined) return n; for (const c of n.children) { if (typeof c === "string") continue; const f = findScroll(c as Inst); if (f) return f; } return null; };
  const startX = () => findScroll(screen.getByTestId("strip-tiles"))!.props.contentOffset.x as number;
  /** Every chip reports a place: chip i at 16 + 100·i, 92 wide → the row ends at 16 + 100·20 + 92 + 16 = 2124. */
  const measure = async () => { for (const [i, type] of TRANSITION_TYPES.entries()) await fireEvent(screen.getByTestId(`transition-chip-${type}`), "layout", { nativeEvent: { layout: { x: 16 + 100 * i, y: 0, width: 92, height: 72 } } }); };
  const set = (type: (typeof TRANSITION_TYPES)[number]) => useEditorStore.getState().apply((p) => ({ ...p, clips: p.clips.map((c, i) => (i === 0 ? { ...c, transitionOut: { type, duration: 0.5 } } : c)) }));
  const rowEnd = () => 2124 - Dimensions.get("window").width;

  test("it starts at 0 and moves once, when the chips have been measured: the selected chip, one tile from the left", async () => {
    set("cover");                                                       // chip 11 → x = 1116
    await render(<TransitionSheet clipIndex={0} visible onClose={() => {}} />);
    expect(startX()).toBe(0);
    await measure();
    expect(startX()).toBe(Math.min(1116 - theme.size.toolColumn, rowEnd()));
    // A pick afterwards, and a chip reporting again, do not move the row.
    await fireEvent.press(screen.getByRole("button", { name: "Fade" }));
    await measure();
    expect(startX()).toBe(Math.min(1116 - theme.size.toolColumn, rowEnd()));
  });

  test("the last chips are clamped to the row's end; None and the first chips stay at the start", async () => {
    set("flashWhite");                                                  // chip 20 → 2016 − 72 = 1944, past the end
    const view = await render(<TransitionSheet clipIndex={0} visible onClose={() => {}} />);
    await measure();
    expect(startX()).toBe(Math.max(0, rowEnd()));
    await view.unmount();
    useEditorStore.getState().undo();                                   // back to None
    await render(<TransitionSheet clipIndex={0} visible onClose={() => {}} />);
    await measure();
    expect(startX()).toBe(0);
  });

  test("every opening measures afresh", async () => {
    set("cover");
    const view = await render(<TransitionSheet clipIndex={0} visible onClose={() => {}} />);
    await measure();
    await fireEvent.press(screen.getByRole("button", { name: "Zoom" }));   // chip 4 → 416 − 72 = 344
    await view.rerender(<TransitionSheet clipIndex={0} visible={false} onClose={() => {}} />);
    await view.rerender(<TransitionSheet clipIndex={0} visible onClose={() => {}} />);
    expect(startX()).toBe(0);
    await measure();
    expect(startX()).toBe(Math.min(344, rowEnd()));
  });

  test("a chip keeps its full-height touch area: its wrapper is as high as the row", async () => {
    await render(<TransitionSheet clipIndex={0} visible onClose={() => {}} />);
    expect(screen.getByTestId("transition-chip-fade")).toHaveStyle({ height: 72, justifyContent: "center" });
  });
});
```

Append to `src/editor/__tests__/EffectSheet.test.tsx`, inside `describe("EffectSheet", …)`:

```tsx
  test("twenty tiles: the twelve old effects first, in their order, then the eight new ones; a new one is added like an old one", async () => {
    state().seek(1);
    await render(<EffectSheet visible onClose={() => {}} />);
    const labels = screen.getAllByRole("button").map((b) => b.props.accessibilityLabel).filter((l) => l !== "Done");
    expect(labels).toEqual(["Glitch", "Shake", "Zoom pulse", "Blur", "VHS", "Light leak", "Flash", "RGB split", "Old film", "Glow", "Blur box", "Mosaic box",
      "Film burn", "Lens flare", "Dust", "Heartbeat", "Hue shift", "Mirror", "Soft edges", "Strobe"]);
    await fireEvent.press(screen.getByRole("button", { name: "Heartbeat" }));
    expect(state().project!.effects).toEqual([{ id: "new", type: "heartbeat", start: 1, end: 3, intensity: 0.7, rect: null }]);
    expect(state().selectedEffectId).toBe("new");
  });
```

- [ ] **Step 2: Run** `npx.cmd jest src/ui/__tests__/ToolStrip.test.tsx src/editor/__tests__/FilterSheet.test.tsx src/editor/__tests__/TransitionSheet.test.tsx src/editor/__tests__/EffectSheet.test.tsx` → the start-of-row tests FAIL; the counts, labels and the `EffectSheet` test PASS already.
- [ ] **Step 3: Implement.**

`src/ui/ToolStrip.tsx` — directly under `tilesStartX`:

```ts
/** `tilesStartX`, never past the row's end: `count` tiles of `tileWidth` (the row's gaps and its two gutters included) in a row as wide as `viewportWidth` — a strip is as wide as the window. React Native does not clamp a ScrollView's contentOffset. */
export const tilesStartXIn = (index: number, tileWidth: number, count: number, viewportWidth: number): number =>
  Math.min(tilesStartX(index, tileWidth), Math.max(0, count * tileWidth + (count - 1) * theme.space.sm + 2 * theme.space.gutter - viewportWidth));
```

`src/editor/components/FilterSheet.tsx`:
- Imports: `useEffect, useMemo, useState` from `react`; `Image, useWindowDimensions, View` from `react-native`; `StripSlider, StripTiles, ToolStrip, tilesStartXIn` from the kit.
- After the `useEffect` that loads the thumbnail and **before** `if (!clip) return null;`:

```tsx
  const { width: windowW } = useWindowDimensions();
  // Where the row starts: the selected tile in view. Worked out when the strip opens (and for another clip) — NOT on every pick: a
  // ScrollView applies a changed contentOffset at once, and the row must not move under the finger.
  const startX = useMemo(
    () => tilesStartXIn(Math.max(0, FILTER_IDS.indexOf(clip?.filter ?? "none")), TILE_W, FILTER_IDS.length, windowW),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visible, clip?.id, windowW],
  );
```

- `<StripTiles>` → `<StripTiles initialX={startX}>`. Nothing else in the file changes (the tile, the thumbnail, the strength row, the action are as they are).

`src/editor/components/TransitionSheet.tsx`:
- Imports: `useRef, useState` from `react`; `useWindowDimensions, View, type LayoutChangeEvent` from `react-native`; `type TransitionType` from the types; `STRIP` joins the `ToolStrip` import.
- Above `TransitionSheet` add:

```tsx
/**
 * The chips' row. It lives inside the strip, so it is mounted afresh at every opening (`ToolStrip` renders nothing while closed) —
 * its measurements and the row's start begin again each time. Chips have different widths: each one's wrapper reports its place, and
 * ONCE — when the chip that was selected at opening and the last chip are both known — the row is started at that chip, one tile
 * from the left, never past the row's end (React Native does not clamp a ScrollView's contentOffset). Later picks never move the row.
 */
function TransitionChips({ current, onPick }: { current: TransitionType; onPick: (type: TransitionType) => void }) {
  const { width: windowW } = useWindowDimensions();
  const spots = useRef(new Map<TransitionType, { x: number; width: number }>()).current;
  const placed = useRef(false);
  const chosenAtOpening = useRef(current).current;
  const [startX, setStartX] = useState(0);
  const last = TRANSITION_TYPES[TRANSITION_TYPES.length - 1];
  const onChipLayout = (type: TransitionType) => (e: LayoutChangeEvent) => {
    const { x, width } = e.nativeEvent.layout;
    spots.set(type, { x, width });
    const chosen = spots.get(chosenAtOpening), end = spots.get(last);
    if (placed.current || !chosen || !end) return;
    placed.current = true;
    const rowEnd = end.x + end.width + theme.space.gutter - windowW;      // the content ends one gutter after the last chip
    setStartX(Math.max(0, Math.min(chosen.x - theme.size.toolColumn, rowEnd)));
  };
  return (
    <StripTiles initialX={startX}>
      {TRANSITION_TYPES.map((type) => (
        // As high as the row, so the chip's touch slop stays inside its parent (a chip is 36 pt, its target 44).
        <View key={type} testID={`transition-chip-${type}`} onLayout={onChipLayout(type)} style={{ height: STRIP.tiles, justifyContent: "center" }}>
          <Chip label={TRANSITIONS[type].label} selected={current === type} onPress={() => onPick(type)} />
        </View>
      ))}
    </StripTiles>
  );
}
```

- In `TransitionSheet`, the `<StripTiles>…</StripTiles>` block becomes:

```tsx
      <TransitionChips key={clip.id} current={current.type}
        onPick={(type) => { if (current.type !== type) haptic("light"); apply((p) => setTransition(p, clip.id, { type, duration: type === "none" ? 0 : Math.min(0.5, cap) })); }} />
```

  (the handler is the one the chips had, word for word). The slider row and both early returns are not touched.

- [ ] **Step 4:** `npx.cmd jest src/ui/__tests__ src/editor/__tests__/FilterSheet.test.tsx src/editor/__tests__/TransitionSheet.test.tsx src/editor/__tests__/EffectSheet.test.tsx src/editor/__tests__/strips src/editor/__tests__/EditorToolbar src/__tests__` green — `strips.tiles.test.tsx`, `strips.layout.test.tsx`, `strips.pickers.test.tsx`, `strips.r2.test.tsx` **unedited** (one `strip-tiles` row each, still). `npm run typecheck`; `npm test`.
- [ ] **Step 5: Commit** — explicit paths; `feat(pickers): 32 filters, 20 effects, 21 transitions — the filter and transition rows open at the selected item and never past their end`.

---

### Task 8: Swift renderers — the eight effects

**Depends on:** Task 3. **Parallel-safe with:** Tasks 5, 6, 7, 9.

**Files:** Modify `modules/clipy-video/ios/EffectRenderer.swift` (the eight placeholder lines → eight cases; three constants; three helpers appended), `modules/clipy-video/ios/Tests/EffectMathTests.swift` (append tests inside the class); create `src/editor/model/__tests__/effectRenderer.swift.test.ts`.

**Do not touch:** the twelve existing cases and the existing helpers of `EffectRenderer.swift` (the frozen test checks them), `EffectMath.swift` (Task 3), `ClipyCompositor.swift` (Tasks 2, 9) — you only **call** `ClipyCompositor.blurred` and `ClipyCompositor.dissolve` —, `Adjust.swift`, everything under "Never edited this round".

**Interfaces — Consumes:** the ten `EffectMath` functions and the new constants / colours (Task 3); the private helpers `scaled`, `colorLayer`, `number`, `generated` of `EffectRenderer`; `Adjust.filtered`, `Adjust.grainOffset(time:)`; `ClipyCompositor.blurred(_:radius:rect:)`, `ClipyCompositor.dissolve(from:to:progress:)`; `UIColor(hex:)`.

- [ ] **Step 1: Failing test.** Create `src/editor/model/__tests__/effectRenderer.swift.test.ts`:

```ts
import { readFileSync } from "fs";
import { join } from "path";
import { EFFECT_IDS } from "../types";

/**
 * The native export is never compiled here, so these checks read the Swift source: each of the eight effects of 2026-10-06 has a
 * real case driven by its EffectMath function, every Core Image filter is made through a guarded helper, and no placeholder is left.
 */
const iosDir = join(__dirname, "../../../../modules/clipy-video/ios");
const read = (file: string) => readFileSync(join(iosDir, file), "utf8").replace(/\r\n/g, "\n");
const code = (source: string) => source.replace(/\/\/[^\n]*/g, "");
const between = (source: string, from: string, to: string): string => {
  const start = source.indexOf(from);
  if (start < 0) throw new Error(`"${from}" not found`);
  const end = source.indexOf(to, start + from.length);
  return source.slice(start, end < 0 ? undefined : end);
};
const renderer = read("EffectRenderer.swift");
const apply = code(between(renderer, "static func apply(", "\n  }\n"));
/** One effect's branch: from its `case` up to the next one (or `default:`). */
const branch = (id: string) => { const from = apply.indexOf(`case "${id}":`); const next = apply.slice(from + 1).search(/\n    (case "|default:)/); return apply.slice(from, from + 1 + next); };

test("no placeholder is left, and the eight new cases come after the twelve old ones", () => {
  expect(renderer).not.toContain("MORE-LOOKS-PLACEHOLDER");
  expect([...apply.matchAll(/case "(\w+)":/g)].map((m) => m[1])).toEqual([...["shake", "zoomPulse", "flash", "lightLeak", "vhs", "oldFilm", "glow", "blur", "glitch", "rgbSplit", "blurBox", "mosaicBox"], ...EFFECT_IDS.slice(12)]);
});

test.each([
  ["heartbeat", ["EffectMath.heartbeatScale(t: t, d: d, k: k)", "scaled(image, by:"]],
  ["strobe", ["EffectMath.strobeOpacity(t: t, k: k)", "colorLayer(EffectMath.strobeColor"]],
  ["filmBurn", ["EffectMath.burnOpacity(t: t, d: d, k: k)", "EffectMath.burnCentreY(t: t)", "EffectMath.burnRadius * w", "light(EffectMath.filmBurnColor"]],
  ["lensFlare", ["EffectMath.flareOpacity(t: t, d: d, k: k)", "EffectMath.flareX(t: t) * w", "EffectMath.flareY", "EffectMath.flareHalo * shorter", "EffectMath.flareCore * shorter"]],
  ["dust", ["EffectMath.dustScratch(t: t, k: k, i: Double(i))", "EffectMath.dustLines", "EffectMath.dustWidth * w", "EffectMath.dustOpacity * amount", "specks(over:"]],
  ["hueShift", ["EffectMath.hueAngle(t: t, d: d, k: k)", "\"CIHueAdjust\"", "\"inputAngle\""]],
  ["mirror", ["EffectMath.mirrorMix(t: t, d: d, k: k)", "ClipyCompositor.dissolve(from: frame, to: mirrored"]],
  ["softEdges", ["EffectMath.softEdgeAmount(t: t, d: d, k: k)", "EffectMath.edgeBlur", "ClipyCompositor.blurred(frame", "softMask(", "\"CIBlendWithMask\""]],
] as [string, string[]][])("%s is driven by its maths", (id, parts) => {
  const b = branch(id);
  for (const part of parts) expect(b).toContain(part);
});

test("screen-up maths, y-up image: the burn's and the flare's centre flip the fraction from the top", () => {
  expect(branch("filmBurn")).toContain("h * (1 - EffectMath.burnCentreY(t: t))");
  expect(branch("lensFlare")).toContain("h * (1 - EffectMath.flareY)");
  expect((branch("lensFlare").match(/light\(/g) ?? [])).toHaveLength(2);       // the halo, then the core
});

test("every Core Image filter in the file is made through a guarded helper", () => {
  const all = code(renderer);
  // A literal filter name only ever appears as the name argument of Adjust.filtered(…, "CI…", or of generated("CI…".
  const names = [...all.matchAll(/"(CI[A-Z]\w+)"/g)].map((m) => m.index!);
  for (const at of names) expect(all.slice(Math.max(0, at - 160), at)).toMatch(/(Adjust\.filtered\([^"]*|generated\()$/);
  expect(all).not.toMatch(/applyingFilter\(/);
  expect([...all.matchAll(/CIFilter\(name:/g)]).toHaveLength(1);                // inside `generated` only
  // The three new helpers, each once, each falling back to the image it was given.
  for (const fn of ["light", "softMask", "specks"]) expect([...all.matchAll(new RegExp(`private static func ${fn}\\(`, "g"))]).toHaveLength(1);
  expect(between(all, "private static func light(", "\n  }\n")).toMatch(/"CIRadialGradient"[\s\S]*"CIScreenBlendMode"[\s\S]*else \{ return image \}/);
  expect(between(all, "private static func specks(", "\n  }\n")).toMatch(/"CIRandomGenerator"[\s\S]*"CIColorMatrix"[\s\S]*else \{ return image \}/);
  expect(between(all, "private static func softMask(", "\n  }\n")).toContain("\"CIRadialGradient\"");
});

test("the XCTests of the eight exist", () => {
  const tests = read("Tests/EffectMathTests.swift");
  for (const name of ["testHeartbeatAndStrobe", "testFilmBurnLightsTheLeftEdge", "testLensFlareLightsItsPlace", "testHueShiftTurnsColourAndLeavesGrey", "testMirrorCopiesTheLeftHalfOntoTheRight", "testSoftEdgesKeepTheCentreAndTheExtent", "testDustDrawsItsScratchWhereTheMathsSays"]) expect(tests).toContain(`func ${name}()`);
});
```

- [ ] **Step 2: Run** `npx.cmd jest src/editor/model/__tests__/effectRenderer.swift.test.ts` → FAIL (placeholders).
- [ ] **Step 3: Implement** in `modules/clipy-video/ios/EffectRenderer.swift`.

Constants — after `mosaicBoxMinBlock`:

```swift
  /// The lens flare's halo is this share of its core's strength (export only).
  static let flareHaloAlpha: Double = 0.5
```

The eight cases — **replace** the comment and the eight placeholder lines (keep them after the `mosaicBox` branch, before `default:`):

```swift
    // ---- The eight effects of 2026-10-06 (the maths is EffectMath's; every filter goes through a guarded helper). ----
    case "filmBurn":
      // Warm light swelling in from the LEFT edge. `burnCentreY` is a fraction from the TOP of the screen; Core
      // Image is y-up, so the centre is at height × (1 − y).
      let centre = CGPoint(x: 0, y: h * (1 - EffectMath.burnCentreY(t: t)))
      return light(EffectMath.filmBurnColor, alpha: EffectMath.burnOpacity(t: t, d: d, k: k), centre: centre, radius: EffectMath.burnRadius * w, over: image, rect: rect)
    case "lensFlare":
      // A bright spot with a wide soft halo, sweeping left → right at a fixed height (`flareY` from the top).
      let alpha = EffectMath.flareOpacity(t: t, d: d, k: k)
      let centre = CGPoint(x: EffectMath.flareX(t: t) * w, y: h * (1 - EffectMath.flareY))
      let halo = light(EffectMath.lensFlareColor, alpha: alpha * flareHaloAlpha, centre: centre, radius: EffectMath.flareHalo * shorter, over: image, rect: rect)
      return light(EffectMath.lensFlareColor, alpha: alpha, centre: centre, radius: EffectMath.flareCore * shorter, over: halo, rect: rect)
    case "dust":
      // Thin light scratches at the places the preview draws them, then a fine white grain.
      let amount = k * env
      guard amount > 0 else { return image }
      var out = image.cropped(to: rect)
      let lineWidth = max(1, (EffectMath.dustWidth * w).rounded())
      let line = CIColor(color: UIColor(hex: EffectMath.dustColor).withAlphaComponent(CGFloat(min(1, EffectMath.dustOpacity * amount))))
      for i in 0..<Int(EffectMath.dustLines) {
        let s = EffectMath.dustScratch(t: t, k: k, i: Double(i))
        guard s.on else { continue }
        let strip = CGRect(x: (s.x * w).rounded(), y: 0, width: lineWidth, height: h).intersection(rect)
        if strip.isNull || strip.isEmpty { continue }
        out = CIImage(color: line).cropped(to: strip).composited(over: out).cropped(to: rect)
      }
      return specks(over: out, amount: amount, time: t, rect: rect)
    case "heartbeat":
      return scaled(image, by: EffectMath.heartbeatScale(t: t, d: d, k: k), dx: 0, dy: 0, rect: rect)
    case "hueShift":
      let angle = EffectMath.hueAngle(t: t, d: d, k: k)
      guard angle.isFinite, angle != 0,
            let turned = Adjust.filtered(image.cropped(to: rect), "CIHueAdjust", ["inputAngle": number(angle)])
      else { return image }
      return turned.cropped(to: rect)
    case "mirror":
      // The left half turned over about the frame's vertical centre line (x → width − x) and laid over the right half.
      let mix = EffectMath.mirrorMix(t: t, d: d, k: k)
      guard mix > 0 else { return image }
      let frame = image.cropped(to: rect)
      let flipped = frame.cropped(to: CGRect(x: 0, y: 0, width: w / 2, height: h))
        .transformed(by: CGAffineTransform(a: -1, b: 0, c: 0, d: 1, tx: CGFloat(w), ty: 0))
      let mirrored = flipped.composited(over: frame).cropped(to: rect)
      return mix >= 1 ? mirrored : ClipyCompositor.dissolve(from: frame, to: mirrored, progress: CGFloat(mix)).cropped(to: rect)
    case "softEdges":
      // The whole frame blurred, then the sharp frame kept in the middle by a round mask (white = sharp).
      let radius = EffectMath.edgeBlur * EffectMath.softEdgeAmount(t: t, d: d, k: k) * shorter
      guard radius.isFinite, radius > 0 else { return image }
      let frame = image.cropped(to: rect)
      let soft = ClipyCompositor.blurred(frame, radius: CGFloat(radius), rect: rect)
      guard let mask = softMask(shorter: shorter, rect: rect),
            let out = Adjust.filtered(frame, "CIBlendWithMask", [kCIInputBackgroundImageKey: soft, "inputMaskImage": mask])
      else { return image }
      return out.cropped(to: rect)
    case "strobe":
      return colorLayer(EffectMath.strobeColor, opacity: EffectMath.strobeOpacity(t: t, k: k), over: image, rect: rect)
```

Helpers — after `generated`, before the enum's closing `}`:

```swift
  /// A soft round light: the colour `hex` at `alpha` in the centre, fading to nothing at `radius` pixels
  /// (`CIRadialGradient`), screened over `image` (`CIScreenBlendMode`: it can only brighten). Nothing to draw, or a
  /// filter / key Core Image does not know → `image` unchanged.
  private static func light(_ hex: String, alpha: Double, centre: CGPoint, radius: Double, over image: CIImage, rect: CGRect) -> CIImage {
    guard alpha.isFinite, alpha > 0, radius.isFinite, radius > 0, centre.x.isFinite, centre.y.isFinite else { return image }
    let color = UIColor(hex: hex)
    guard let glow = generated("CIRadialGradient", [
            "inputCenter": CIVector(x: centre.x, y: centre.y),
            "inputRadius0": number(0),
            "inputRadius1": number(radius),
            "inputColor0": CIColor(color: color.withAlphaComponent(CGFloat(min(1, alpha)))),
            "inputColor1": CIColor(color: color.withAlphaComponent(0)),
          ]),
          let lit = Adjust.filtered(glow.cropped(to: rect), "CIScreenBlendMode", [kCIInputBackgroundImageKey: image.cropped(to: rect)])
    else { return image }
    return lit.cropped(to: rect)
  }

  /// The soft-edges mask: white (sharp) within `edgeInner` × the shorter side of the frame's centre, black (blurred)
  /// from `edgeOuter` × the shorter side outwards. Nil when the generator is missing.
  private static func softMask(shorter: Double, rect: CGRect) -> CIImage? {
    return generated("CIRadialGradient", [
      "inputCenter": CIVector(x: rect.midX, y: rect.midY),
      "inputRadius0": number(EffectMath.edgeInner * shorter),
      "inputRadius1": number(EffectMath.edgeOuter * shorter),
      "inputColor0": CIColor.white,
      "inputColor1": CIColor.black,
    ])?.cropped(to: rect)
  }

  /// A fine white grain over `image` (Apple's "scratchy analog film" recipe): `CIRandomGenerator` noise, moved every
  /// frame, through `CIColorMatrix` — every colour channel takes the noise's green, and the alpha is a small multiple
  /// of it (`dustSpeck` × amount), so only a faint sprinkle is left — composited over the frame. Anything missing →
  /// `image` unchanged.
  private static func specks(over image: CIImage, amount: Double, time: Double, rect: CGRect) -> CIImage {
    guard amount.isFinite, amount > 0, let noise = generated("CIRandomGenerator", [:]) else { return image }
    let offset = Adjust.grainOffset(time: time)
    let field = noise.transformed(by: CGAffineTransform(translationX: offset.x, y: offset.y)).cropped(to: rect)
    let alpha = CGFloat(min(1, EffectMath.dustSpeck * amount))
    guard let white = Adjust.filtered(field, "CIColorMatrix", [
            "inputRVector": CIVector(x: 0, y: 1, z: 0, w: 0),
            "inputGVector": CIVector(x: 0, y: 1, z: 0, w: 0),
            "inputBVector": CIVector(x: 0, y: 1, z: 0, w: 0),
            "inputAVector": CIVector(x: 0, y: alpha, z: 0, w: 0),
            "inputBiasVector": CIVector(x: 0, y: 0, z: 0, w: 0),
          ])
    else { return image }
    return white.cropped(to: rect).composited(over: image).cropped(to: rect)
  }
```

(`w`, `h`, `shorter`, `env`, `rect` are the locals `apply` already has; `k > 0`, finite input and `0 ≤ t ≤ d` are guaranteed by its first `guard`. `generated(_:_:)` takes an empty dictionary: `params.keys.allSatisfy` is then true.)

`modules/clipy-video/ios/Tests/EffectMathTests.swift` — append inside the class:

```swift
  // ---- The eight effects of 2026-10-06 ----

  /// Strobe: black while frac(2t) < 0.4 (grey 0.5 under a black layer at k = 1 → 0), the frame itself otherwise.
  /// Heartbeat on a solid frame leaves it solid (clamped edges).
  func testHeartbeatAndStrobe() {
    let image = grey
    XCTAssertEqual(rgb(EffectRenderer.apply(type: "strobe", image: image, t: 0.1, d: 4, k: 1, size: size), 32, 18).r, 0, accuracy: 0.02)
    XCTAssertEqual(rgb(EffectRenderer.apply(type: "strobe", image: image, t: 0.1, d: 4, k: 0.5, size: size), 32, 18).r, 0.25, accuracy: 0.03)
    XCTAssertTrue(EffectRenderer.apply(type: "strobe", image: image, t: 0.25, d: 4, k: 1, size: size) === image)
    let beat = EffectRenderer.apply(type: "heartbeat", image: image, t: 0.88, d: 4, k: 1, size: size)
    XCTAssertEqual(beat.extent, rect)
    for (x, y) in [(32, 18), (0, 0), (63, 35)] as [(CGFloat, CGFloat)] { XCTAssertEqual(rgb(beat, x, y).r, 0.5, accuracy: 0.03) }
    XCTAssertTrue(EffectRenderer.apply(type: "heartbeat", image: image, t: 1.36, d: 4, k: 1, size: size) === image)     // between beats: scale 1
  }

  /// Film burn at its peak (t = 0.625, opacity 0.6; centre at burnCentreY(0.625) of the height): the left edge is
  /// lit and warm (red rises more than blue), the right edge — beyond the 0.9 × width radius — is as it was.
  func testFilmBurnLightsTheLeftEdge() {
    let out = EffectRenderer.apply(type: "filmBurn", image: grey, t: 0.625, d: 4, k: 1, size: size)
    XCTAssertEqual(out.extent, rect)
    let y = CGFloat((36 * (1 - EffectMath.burnCentreY(t: 0.625))).rounded(.down))
    let left = rgb(out, 0, min(35, max(0, y)))
    XCTAssertGreaterThan(left.r, 0.6)
    XCTAssertGreaterThan(left.r, left.b)
    XCTAssertEqual(rgb(out, 63, 18).r, 0.5, accuracy: 0.03)
    XCTAssertTrue(EffectRenderer.apply(type: "filmBurn", image: grey, t: 1.875, d: 4, k: 1, size: size).extent == rect)      // opacity 0: the frame
  }

  /// Lens flare at t = 1: its centre is the middle of the width, 0.35 of the height from the top (y-up: 0.65 × 36 =
  /// 23.4). That point is brighter than the frame; a far corner is not.
  func testLensFlareLightsItsPlace() {
    let out = EffectRenderer.apply(type: "lensFlare", image: grey, t: 1, d: 4, k: 1, size: size)
    XCTAssertEqual(out.extent, rect)
    XCTAssertGreaterThan(rgb(out, 32, 23).r, 0.7)
    XCTAssertEqual(rgb(out, 0, 0).r, 0.5, accuracy: 0.05)
    XCTAssertEqual(rgb(out, 63, 0).r, 0.5, accuracy: 0.05)
  }

  /// Hue shift at t = 1, k = 1 is half a turn: red is no longer red. Grey has no hue and stays grey.
  func testHueShiftTurnsColourAndLeavesGrey() {
    let red = CIImage(color: CIColor(red: 1, green: 0, blue: 0)).cropped(to: rect)
    let turned = rgb(EffectRenderer.apply(type: "hueShift", image: red, t: 1, d: 4, k: 1, size: size), 32, 18)
    XCTAssertLessThan(turned.r, 0.5)
    let same = rgb(EffectRenderer.apply(type: "hueShift", image: grey, t: 1, d: 4, k: 1, size: size), 32, 18)
    XCTAssertEqual(same.r, 0.5, accuracy: 0.03)
    XCTAssertEqual(same.b, 0.5, accuracy: 0.03)
    XCTAssertTrue(EffectRenderer.apply(type: "hueShift", image: grey, t: 2, d: 4, k: 1, size: size).extent == rect)
  }

  /// Mirror: a frame whose left half is white and right half black becomes white from edge to edge at full
  /// strength; at strength 0.25 (mix 0.5) the right half is half way.
  func testMirrorCopiesTheLeftHalfOntoTheRight() {
    let white = CIImage(color: CIColor(red: 1, green: 1, blue: 1)).cropped(to: CGRect(x: 0, y: 0, width: 32, height: 36))
    let image = white.composited(over: CIImage(color: CIColor.black).cropped(to: rect)).cropped(to: rect)
    let full = EffectRenderer.apply(type: "mirror", image: image, t: 1, d: 4, k: 0.7, size: size)
    XCTAssertEqual(full.extent, rect)
    XCTAssertEqual(rgb(full, 60, 18).r, 1, accuracy: 0.02)
    XCTAssertEqual(rgb(full, 4, 18).r, 1, accuracy: 0.02)
    let half = EffectRenderer.apply(type: "mirror", image: image, t: 1, d: 4, k: 0.25, size: size)
    XCTAssertEqual(rgb(half, 60, 18).r, 0.5, accuracy: 0.05)
    XCTAssertEqual(rgb(half, 4, 18).r, 1, accuracy: 0.02)
  }

  /// Soft edges: a solid frame stays solid (a blur of a clamped solid is the solid) and keeps its extent; on a frame
  /// with a hard vertical edge near the right border, that edge is softened (a pixel on its dark side has picked up
  /// light), while the same kind of edge through the centre stays sharp.
  func testSoftEdgesKeepTheCentreAndTheExtent() {
    let big = CGSize(width: 400, height: 400), frame = CGRect(origin: .zero, size: big)      // shorter 400: sharp within 100 px of the centre, blurred from 300 px
    let solid = CIImage(color: CIColor(red: 0.5, green: 0.5, blue: 0.5)).cropped(to: frame)
    let out = EffectRenderer.apply(type: "softEdges", image: solid, t: 1, d: 4, k: 1, size: big)
    XCTAssertEqual(out.extent, frame)
    XCTAssertEqual(rgb(out, 200, 200).r, 0.5, accuracy: 0.03)
    func edged(at x: CGFloat) -> CIImage {
      let white = CIImage(color: CIColor(red: 1, green: 1, blue: 1)).cropped(to: CGRect(x: 0, y: 0, width: x, height: 400))
      return white.composited(over: CIImage(color: CIColor.black).cropped(to: frame)).cropped(to: frame)
    }
    // Blur radius 0.02 × 400 = 8 px. Centre edge at x = 200 (distance 0 from the centre: fully sharp).
    let centre = EffectRenderer.apply(type: "softEdges", image: edged(at: 200), t: 1, d: 4, k: 1, size: big)
    XCTAssertEqual(rgb(centre, 203, 200).r, 0, accuracy: 0.03)
    // Border edge at x = 390, read in a corner (distance from the centre ≈ 269 → mostly blurred).
    let border = EffectRenderer.apply(type: "softEdges", image: edged(at: 390), t: 1, d: 4, k: 1, size: big)
    XCTAssertGreaterThan(rgb(border, 393, 390).r, 0.05)
  }

  /// Dust at t = 1, k = 1: line 0 is on at x = 0.4702766 of the width. On a 1000 px wide grey frame the scratch is
  /// 3 px wide at x = 470 and half-covers the grey with #F2EBDD (0.5·0.5 + 0.5·0.949 ≈ 0.72); away from it the
  /// frame is grey but for the faint grain.
  func testDustDrawsItsScratchWhereTheMathsSays() {
    let wide = CGSize(width: 1000, height: 20), frame = CGRect(origin: .zero, size: wide)
    let image = CIImage(color: CIColor(red: 0.5, green: 0.5, blue: 0.5)).cropped(to: frame)
    let out = EffectRenderer.apply(type: "dust", image: image, t: 1, d: 4, k: 1, size: wide)
    XCTAssertEqual(out.extent, frame)
    XCTAssertEqual(rgb(out, 471, 10).r, 0.72, accuracy: 0.06)
    XCTAssertEqual(rgb(out, 100, 10).r, 0.5, accuracy: 0.06)
    XCTAssertTrue(EffectMath.dustScratch(t: 1, k: 1, i: 0).on)
  }
```

**Verify by reading** (and list what you could not verify): `CIRadialGradient` (`inputCenter`, `inputRadius0`, `inputRadius1`, `inputColor0`, `inputColor1`), `CIScreenBlendMode`, `CIHueAdjust` (`inputAngle`, radians), `CIBlendWithMask` (`inputBackgroundImage`, `inputMaskImage`; the existing `ClipyCompositor.rounded` uses the same keys), `CIRandomGenerator` (no input keys), `CIColorMatrix` (`inputAVector`) in Apple's Core Image Filter Reference; that `scaled`, `colorLayer`, `number`, `generated` have the signatures used; that `Adjust.grainOffset(time:)` is not private; that `CGAffineTransform(a:b:c:d:tx:ty:)` with `a: -1, tx: width` maps x to width − x; that the existing XCTests `testEveryEffectKeepsTheFrameExtent` and `testNoOpInputsReturnTheImageItself` hold for the eight new ids by reading each case (extent kept; `k = 0`, bad input and out-of-range times are stopped by `apply`'s first guard).

- [ ] **Step 4:** `npx.cmd jest src/editor/model/__tests__/effectRenderer.swift.test.ts src/editor/model/__tests__/effectMath.parity.test.ts src/editor/__tests__/looks.frozen.test.ts` green — `effectMath.parity.test.ts` and `looks.frozen.test.ts` **unedited**. `npm run typecheck`; `npm test`.
- [ ] **Step 5: Commit** — explicit paths; `feat(export): the eight new effects in Swift — light, scratches, hue, mirror, soft edges, heartbeat, strobe (uncompiled)`.

---

### Task 9: Swift blends — the ten transitions

**Depends on:** Task 4 (and Task 2 landed: it also edits `ClipyCompositor.swift`). **Parallel-safe with:** Tasks 5, 6, 7, 8.

**Files:** Create `modules/clipy-video/ios/TransitionMasks.swift`, `src/editor/model/__tests__/transitionBlend.swift.test.ts`. Modify `modules/clipy-video/ios/ClipyCompositor.swift` (the ten placeholder lines of `blend` → ten cases; `blend`'s doc comment), `modules/clipy-video/ios/Tests/TransitionBlendTests.swift` (the `allTypes` line + appended tests).

**Do not touch:** the nine existing `blend` cases, `default:`, `blurTransitionRadius`, `push`, `blurred`, `dissolve`, `look`, everything else in `ClipyCompositor.swift` (the frozen test checks the stretches before and after your ten lines); `TransitionMath.swift` (Task 4); `EffectRenderer.swift` (Task 8); everything under "Never edited this round".

**Interfaces — Consumes:** `TransitionMath.dip` / `slideOffsets` / `irisRadius` / `diagonalEdge` / `clockAngle` / `pixelSize` / `flashColor` (Task 4); `ClipyCompositor.dissolve`; `Adjust.filtered`; `UIColor(hex:)`.

**Interfaces — Produces**

```swift
// TransitionMasks.swift
enum TransitionBlend {
  static let sectorMaskMaxSide: CGFloat = 512
  static func halfDiagonal(_ size: CGSize) -> CGFloat
  static func slid(_ type: String, from a: CIImage, to b: CIImage, progress p: CGFloat, size: CGSize) -> CIImage?
  static func masked(_ inside: CIImage, over outside: CIImage, mask: CIImage?, rect: CGRect) -> CIImage?
  static func discMask(radius: CGFloat, size: CGSize) -> CIImage?
  static func diagonalMask(edge: Double, size: CGSize) -> CIImage?
  static func sectorMask(angle: Double, size: CGSize) -> CIImage?
  static func pixelated(_ image: CIImage, block: CGFloat, rect: CGRect) -> CIImage
  static func flashed(_ image: CIImage, amount: CGFloat, rect: CGRect) -> CIImage
}
```

- [ ] **Step 1: Failing test.** Create `src/editor/model/__tests__/transitionBlend.swift.test.ts`:

```ts
import { readFileSync } from "fs";
import { join } from "path";
import { TRANSITION_TYPES } from "../types";

/** The native export is never compiled here: these checks read the Swift source of the ten transitions of 2026-10-06. */
const iosDir = join(__dirname, "../../../../modules/clipy-video/ios");
const read = (file: string) => readFileSync(join(iosDir, file), "utf8").replace(/\r\n/g, "\n");
const code = (source: string) => source.replace(/\/\/[^\n]*/g, "");
const between = (source: string, from: string, to: string): string => {
  const start = source.indexOf(from);
  if (start < 0) throw new Error(`"${from}" not found`);
  const end = source.indexOf(to, start + from.length);
  return source.slice(start, end < 0 ? undefined : end);
};
const compositor = read("ClipyCompositor.swift");
const masks = code(read("TransitionMasks.swift"));
const start = compositor.indexOf("static func blend(");
const blend = code(compositor.slice(start, compositor.indexOf("static func ", start + 1)));
const NEW = TRANSITION_TYPES.slice(11);
const branch = (id: string) => { const from = blend.indexOf(`case "${id}":`); const next = blend.slice(from + 1).search(/\n    (case "|default:)/); return blend.slice(from, from + 1 + next); };
const FALLBACK = "?? dissolve(from: a, to: b, progress: p).cropped(to: rect)";

test("no placeholder is left; the ten new cases sit between Spin and Blur, in the registry's order", () => {
  expect(compositor).not.toContain("MORE-LOOKS-PLACEHOLDER");
  expect([...blend.matchAll(/case "(\w+)":/g)].map((m) => m[1])).toEqual(["fade", "slide", "zoom", "slideRight", "slideUp", "slideDown", "wipe", "spin", ...NEW, "blur"]);
});

test.each(["cover", "reveal", "coverUp", "revealDown"])("%s: the frames moved by TransitionMath.slideOffsets, with a dissolve if that fails", (id) => {
  expect(branch(id)).toContain(`TransitionBlend.slid(type, from: a, to: b, progress: p, size: size) ${FALLBACK}`);
});

test("the circles: the incoming frame inside an opening circle, the outgoing frame inside a closing one", () => {
  for (const id of ["circleOpen", "circleClose"]) {
    expect(branch(id)).toContain("TransitionMath.irisRadius(type, Double(p))");
    expect(branch(id)).toContain("TransitionBlend.halfDiagonal(size)");
    expect(branch(id)).toContain("TransitionBlend.discMask(radius:");
    expect(branch(id)).toContain(FALLBACK);
  }
  expect(branch("circleOpen")).toContain("TransitionBlend.masked(b, over: a,");
  expect(branch("circleClose")).toContain("TransitionBlend.masked(a, over: b,");
});

test("the wipes: the incoming frame where the mask is white", () => {
  expect(branch("wipeDiagonal")).toContain(`TransitionBlend.masked(b, over: a, mask: TransitionBlend.diagonalMask(edge: TransitionMath.diagonalEdge(Double(p)), size: size), rect: rect) ${FALLBACK}`);
  expect(branch("wipeClock")).toContain(`TransitionBlend.masked(b, over: a, mask: TransitionBlend.sectorMask(angle: TransitionMath.clockAngle(Double(p)), size: size), rect: rect) ${FALLBACK}`);
});

test("pixelate: both frames in blocks of the same size, cross-dissolved; white flash: white over whichever frame is playing", () => {
  const px = branch("pixelate");
  expect(px).toContain("TransitionMath.pixelSize(Double(p))");
  expect((px.match(/TransitionBlend\.pixelated\(/g) ?? [])).toHaveLength(2);
  expect(px).toContain("dissolve(from:");
  const flash = branch("flashWhite");
  expect(flash).toContain("TransitionMath.dip(Double(p))");
  expect(flash).toContain("TransitionBlend.flashed(p < 0.5 ? a : b,");
});

test("TransitionMasks.swift: screen-down maths drawn y-up, every filter through a guarded helper", () => {
  const slid = between(masks, "static func slid(", "\n  }\n");
  expect(slid).toContain("TransitionMath.slideOffsets(type, Double(p))");
  expect((slid.match(/y: -CGFloat\(o\.[ab]y\) \* size\.height/g) ?? [])).toHaveLength(2);       // y down on screen → negated
  expect(slid).toContain("o.incomingOnTop ? incoming.composited(over: outgoing) : outgoing.composited(over: incoming)");
  expect(between(masks, "static func masked(", "\n  }\n")).toContain("Adjust.filtered(inside.cropped(to: rect), \"CIBlendWithMask\"");
  expect(between(masks, "static func discMask(", "\n  }\n")).toContain("generator(\"CIRadialGradient\"");
  expect(between(masks, "static func pixelated(", "\n  }\n")).toContain("\"CIPixellate\"");
  // The sector is drawn with Core Graphics, starting at 12 o'clock (+π/2 in a y-up bitmap) and running clockwise.
  const sector = between(masks, "static func sectorMask(", "\n  }\n");
  expect(sector).toContain("startAngle: .pi / 2, endAngle: .pi / 2 - CGFloat(angle), clockwise: true");
  expect(sector).toContain("sectorMaskMaxSide");
  // The diagonal: the half-plane's normal in Core Image space is (h, −w) / diagonal.
  expect(between(masks, "static func diagonalMask(", "\n  }\n")).toMatch(/atan2\(-w, h\)/);
  expect(masks).not.toMatch(/applyingFilter\(/);
  expect([...masks.matchAll(/CIFilter\(name:/g)]).toHaveLength(1);                               // inside `generator` only
});

test("the XCTests cover every type", () => {
  const tests = read("Tests/TransitionBlendTests.swift");
  for (const t of TRANSITION_TYPES.slice(1)) expect(between(tests, "private let allTypes", "\n")).toContain(`"${t}"`);
  for (const name of ["testMoreTypesStartWithTheOutgoingAndEndWithTheIncomingFrame", "testCoverAndRevealDirections", "testCirclesOpenFromAndCloseToTheCentre", "testDiagonalWipeStartsAtTheTopLeftOfTheScreen", "testClockWipeSweepsClockwiseFromTwelve", "testWhiteFlashPeaksWhiteAtTheCut", "testPixelateMixesSolidFrames", "testMaskHelpersGuardTheirInput"]) expect(tests).toContain(`func ${name}()`);
});
```

- [ ] **Step 2: Run** `npx.cmd jest src/editor/model/__tests__/transitionBlend.swift.test.ts` → FAIL.
- [ ] **Step 3: Implement.**

Create `modules/clipy-video/ios/TransitionMasks.swift`:

```swift
import CoreGraphics
import CoreImage
import Foundation
import UIKit

/// The images behind the ten transitions of 2026-10-06 (`ClipyCompositor.blend` calls these; the numbers are
/// `TransitionMath`'s). Core Image is y-up: screen-down fractions are negated here. Every Core Image filter is made
/// through `Adjust.filtered` or `generator`, which return nil for a filter or key Core Image does not know — the
/// caller then falls back to a plain dissolve.
enum TransitionBlend {
  /// Longest side, in pixels, of the clock wipe's drawn mask (it is scaled up to the frame; the edge is soft).
  static let sectorMaskMaxSide: CGFloat = 512

  /// Half the frame's diagonal: a circle of this radius about the centre reaches the corners.
  static func halfDiagonal(_ size: CGSize) -> CGFloat {
    return (size.width * size.width + size.height * size.height).squareRoot() / 2
  }

  /// cover / reveal / coverUp / revealDown: each frame moved by its `TransitionMath.slideOffsets` and the one named
  /// on top drawn over the other. Nil for any other type.
  static func slid(_ type: String, from a: CIImage, to b: CIImage, progress p: CGFloat, size: CGSize) -> CIImage? {
    guard let o = TransitionMath.slideOffsets(type, Double(p)) else { return nil }
    let rect = CGRect(origin: .zero, size: size)
    let outgoing = a.cropped(to: rect).transformed(by: CGAffineTransform(translationX: CGFloat(o.ax) * size.width, y: -CGFloat(o.ay) * size.height))
    let incoming = b.cropped(to: rect).transformed(by: CGAffineTransform(translationX: CGFloat(o.bx) * size.width, y: -CGFloat(o.by) * size.height))
    return (o.incomingOnTop ? incoming.composited(over: outgoing) : outgoing.composited(over: incoming)).cropped(to: rect)
  }

  /// `inside` where `mask` is white, `outside` where it is black (`CIBlendWithMask`). Nil without a mask or filter.
  static func masked(_ inside: CIImage, over outside: CIImage, mask: CIImage?, rect: CGRect) -> CIImage? {
    guard let mask else { return nil }
    return Adjust.filtered(inside.cropped(to: rect), "CIBlendWithMask", [
      kCIInputBackgroundImageKey: outside.cropped(to: rect),
      "inputMaskImage": mask.cropped(to: rect),
    ])?.cropped(to: rect)
  }

  /// A white disc of `radius` pixels about the frame's centre on black, its edge one pixel soft
  /// (`CIRadialGradient`: white up to `radius`, black from `radius + 1`). A radius of 0 or less is all black.
  static func discMask(radius: CGFloat, size: CGSize) -> CIImage? {
    let rect = CGRect(origin: .zero, size: size)
    guard radius.isFinite, !rect.isEmpty, !rect.isInfinite else { return nil }
    if radius <= 0 { return CIImage(color: CIColor.black).cropped(to: rect) }
    return generator("CIRadialGradient", [
      "inputCenter": CIVector(x: rect.midX, y: rect.midY),
      "inputRadius0": NSNumber(value: Double(radius)),
      "inputRadius1": NSNumber(value: Double(radius) + 1),
      "inputColor0": CIColor.white,
      "inputColor1": CIColor.black,
    ])?.cropped(to: rect)
  }

  /// The diagonal wipe's mask: white where u + v < `edge` (u, v = fractions from the TOP-left corner of the screen),
  /// black elsewhere. In Core Image space (y-up) that is x/w − y/h < edge − 1: a half-plane whose normal is
  /// (h, −w) / diagonal. It is built from a white square of twice the diagonal lying on the near side of the line —
  /// local x from −side to 0 — turned to the normal and moved to the line's point nearest the frame's centre.
  static func diagonalMask(edge: Double, size: CGSize) -> CIImage? {
    let rect = CGRect(origin: .zero, size: size)
    let w = Double(size.width), h = Double(size.height)
    guard edge.isFinite, w.isFinite, h.isFinite, w > 0, h > 0 else { return nil }
    let black = CIImage(color: CIColor.black).cropped(to: rect)
    if edge <= 0 { return black }
    if edge >= 2 { return CIImage(color: CIColor.white).cropped(to: rect) }
    let diagonal = (w * w + h * h).squareRoot()
    let nx = h / diagonal, ny = -w / diagonal
    let distance = (edge - 1) * (w * h / diagonal)             // the line's distance from the centre, along the normal
    let side = CGFloat(2 * diagonal)
    let place = CGAffineTransform(rotationAngle: CGFloat(atan2(-w, h)))
      .concatenating(CGAffineTransform(translationX: CGFloat(w / 2 + nx * distance), y: CGFloat(h / 2 + ny * distance)))
    let plane = CIImage(color: CIColor.white).cropped(to: CGRect(x: -side, y: -side / 2, width: side, height: side)).transformed(by: place)
    return plane.composited(over: black).cropped(to: rect)
  }

  /// The clock wipe's mask: a white pie sector on black, from 12 o'clock clockwise through `angle` radians, drawn
  /// with Core Graphics into a small grey bitmap (longest side ≤ `sectorMaskMaxSide`) and scaled up to the frame.
  /// The bitmap is y-up like Core Image: 12 o'clock is +π/2 and a clockwise sweep ON SCREEN runs towards smaller
  /// angles. Nil when the bitmap cannot be made.
  static func sectorMask(angle: Double, size: CGSize) -> CIImage? {
    let rect = CGRect(origin: .zero, size: size)
    guard angle.isFinite, size.width.isFinite, size.height.isFinite, size.width > 0, size.height > 0 else { return nil }
    if angle <= 0 { return CIImage(color: CIColor.black).cropped(to: rect) }
    if angle >= 2 * Double.pi { return CIImage(color: CIColor.white).cropped(to: rect) }
    let scale = min(1, sectorMaskMaxSide / max(size.width, size.height))
    let w = Int((size.width * scale).rounded(.up)), h = Int((size.height * scale).rounded(.up))
    guard w > 0, h > 0,
          let ctx = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: 0,
                              space: CGColorSpaceCreateDeviceGray(), bitmapInfo: CGImageAlphaInfo.none.rawValue)
    else { return nil }
    ctx.setFillColor(gray: 0, alpha: 1)
    ctx.fill(CGRect(x: 0, y: 0, width: w, height: h))
    ctx.setFillColor(gray: 1, alpha: 1)
    let centre = CGPoint(x: CGFloat(w) / 2, y: CGFloat(h) / 2)
    ctx.move(to: centre)
    ctx.addArc(center: centre, radius: CGFloat(w + h), startAngle: .pi / 2, endAngle: .pi / 2 - CGFloat(angle), clockwise: true)
    ctx.closePath()
    ctx.fillPath()
    guard let drawn = ctx.makeImage() else { return nil }
    return CIImage(cgImage: drawn)
      .transformed(by: CGAffineTransform(scaleX: size.width / CGFloat(w), y: size.height / CGFloat(h)))
      .cropped(to: rect)
  }

  /// `image` in square blocks of `block` pixels (`CIPixellate`, the grid from the frame's corner; clamped first so
  /// no block reads beyond the frame). A block of 1 pixel or less, or a missing filter → `image` untouched.
  static func pixelated(_ image: CIImage, block: CGFloat, rect: CGRect) -> CIImage {
    guard block.isFinite, block > 1,
          let tiles = Adjust.filtered(image.cropped(to: rect).clampedToExtent(), "CIPixellate", [
            "inputScale": NSNumber(value: Double(block)),
            "inputCenter": CIVector(x: rect.minX, y: rect.minY),
          ])
    else { return image }
    return tiles.cropped(to: rect)
  }

  /// White (`TransitionMath.flashColor`) laid over `image` at `amount` (0…1). 0 or less → `image` untouched.
  static func flashed(_ image: CIImage, amount: CGFloat, rect: CGRect) -> CIImage {
    guard amount.isFinite, amount > 0 else { return image }
    let white = CIColor(color: UIColor(hex: TransitionMath.flashColor).withAlphaComponent(min(1, amount)))
    return CIImage(color: white).cropped(to: rect).composited(over: image.cropped(to: rect)).cropped(to: rect)
  }

  /// A Core Image generator's output (no input image). Nil when Core Image has no such filter or the filter does
  /// not declare one of the keys — `setValue(_:forKey:)` is never called with a key the filter does not list.
  private static func generator(_ name: String, _ params: [String: Any]) -> CIImage? {
    guard let f = CIFilter(name: name) else { return nil }
    let keys = f.inputKeys
    guard params.keys.allSatisfy({ keys.contains($0) }) else { return nil }
    for (key, value) in params { f.setValue(value, forKey: key) }
    return f.outputImage
  }
}
```

`modules/clipy-video/ios/ClipyCompositor.swift`, `blend` — **replace** the comment and the ten placeholder lines (they stay between the `spin` branch and `case "blur":`):

```swift
    // ---- The ten transitions of 2026-10-06 (numbers: TransitionMath; images: TransitionBlend). If a mask or a filter
    // cannot be made, the transition is a plain dissolve. ----
    case "cover":
      // The incoming frame slides in from the right over the outgoing one, which stays still.
      return TransitionBlend.slid(type, from: a, to: b, progress: p, size: size) ?? dissolve(from: a, to: b, progress: p).cropped(to: rect)
    case "reveal":
      // The outgoing frame slides off to the left; the incoming one is still beneath it.
      return TransitionBlend.slid(type, from: a, to: b, progress: p, size: size) ?? dissolve(from: a, to: b, progress: p).cropped(to: rect)
    case "coverUp":
      // The incoming frame rises from below the screen over the still outgoing frame.
      return TransitionBlend.slid(type, from: a, to: b, progress: p, size: size) ?? dissolve(from: a, to: b, progress: p).cropped(to: rect)
    case "revealDown":
      // The outgoing frame drops off the bottom of the screen; the incoming one is still beneath it.
      return TransitionBlend.slid(type, from: a, to: b, progress: p, size: size) ?? dissolve(from: a, to: b, progress: p).cropped(to: rect)
    case "circleOpen":
      // The incoming frame shows inside a circle growing from the centre to the corners.
      let r = CGFloat(TransitionMath.irisRadius(type, Double(p)) ?? 0) * TransitionBlend.halfDiagonal(size)
      return TransitionBlend.masked(b, over: a, mask: TransitionBlend.discMask(radius: r, size: size), rect: rect) ?? dissolve(from: a, to: b, progress: p).cropped(to: rect)
    case "circleClose":
      // The outgoing frame stays inside a circle shrinking from the corners to the centre.
      let r = CGFloat(TransitionMath.irisRadius(type, Double(p)) ?? 0) * TransitionBlend.halfDiagonal(size)
      return TransitionBlend.masked(a, over: b, mask: TransitionBlend.discMask(radius: r, size: size), rect: rect) ?? dissolve(from: a, to: b, progress: p).cropped(to: rect)
    case "wipeDiagonal":
      // A slanted hard edge from the top-left corner of the screen to the bottom-right one.
      return TransitionBlend.masked(b, over: a, mask: TransitionBlend.diagonalMask(edge: TransitionMath.diagonalEdge(Double(p)), size: size), rect: rect) ?? dissolve(from: a, to: b, progress: p).cropped(to: rect)
    case "wipeClock":
      // A clock hand sweeps once round from 12 o'clock; the incoming frame shows behind it.
      return TransitionBlend.masked(b, over: a, mask: TransitionBlend.sectorMask(angle: TransitionMath.clockAngle(Double(p)), size: size), rect: rect) ?? dissolve(from: a, to: b, progress: p).cropped(to: rect)
    case "pixelate":
      // Both frames break into the same blocks — none at either end, largest at the cut — and cross-dissolve.
      let block = CGFloat(TransitionMath.pixelSize(Double(p))) * min(size.width, size.height)
      return dissolve(from: TransitionBlend.pixelated(a, block: block, rect: rect), to: TransitionBlend.pixelated(b, block: block, rect: rect), progress: p).cropped(to: rect)
    case "flashWhite":
      // To white over the first half, back from white over the second — the white dip the preview shows.
      return TransitionBlend.flashed(p < 0.5 ? a : b, amount: CGFloat(TransitionMath.dip(Double(p))), rect: rect)
```

`blend`'s doc comment gains: ` The ten of 2026-10-06 take their numbers from `TransitionMath` and their images from `TransitionBlend`.`

`modules/clipy-video/ios/Tests/TransitionBlendTests.swift`:
- Line 17: `allTypes` gains the ten ids at its end. Under it add `private let moreTypes = ["cover", "reveal", "coverUp", "revealDown", "circleOpen", "circleClose", "wipeDiagonal", "wipeClock", "pixelate", "flashWhite"]`.
- Append inside the class (frame 64 × 36, a = red, b = blue; Core Image y-up — high y is the TOP of the screen):

```swift
  // ---- The ten transitions of 2026-10-06 ----

  func testMoreTypesStartWithTheOutgoingAndEndWithTheIncomingFrame() {
    let points: [(CGFloat, CGFloat)] = [(32, 18), (1, 1), (62, 34)]
    for type in moreTypes {
      let start = blend(type, 0), end = blend(type, 1)
      XCTAssertEqual(start.extent, rect, type)
      XCTAssertEqual(end.extent, rect, type)
      for (x, y) in points {
        assertOutgoing(start, x, y, "\(type) at 0, (\(x), \(y))")
        assertIncoming(end, x, y, "\(type) at 1, (\(x), \(y))")
      }
    }
  }

  /// A quarter of the way: the edge between the two frames is at three quarters of the width (cover, reveal), a
  /// quarter up from the bottom of the screen (cover up), a quarter down from the top (reveal down).
  func testCoverAndRevealDirections() {
    let p: CGFloat = 0.25
    for type in ["cover", "reveal"] {
      assertIncoming(blend(type, p), 60, 18, "\(type): right edge")
      assertOutgoing(blend(type, p), 4, 18, "\(type): left edge")
      assertOutgoing(blend(type, p), 44, 18, "\(type): just left of x = 48")
      assertIncoming(blend(type, p), 51, 18, "\(type): just right of x = 48")
    }
    // coverUp: the incoming frame has risen a quarter from the BOTTOM of the screen = low y in Core Image (y < 9).
    assertIncoming(blend("coverUp", p), 32, 2, "coverUp: bottom")
    assertOutgoing(blend("coverUp", p), 32, 33, "coverUp: top")
    // revealDown: the outgoing frame has dropped a quarter; the incoming one shows at the TOP = high y (y ≥ 27).
    assertIncoming(blend("revealDown", p), 32, 33, "revealDown: top")
    assertOutgoing(blend("revealDown", p), 32, 2, "revealDown: bottom")
  }

  /// Half way the circle's radius is half of the half-diagonal (18.4 px): the centre is inside it, the corners are not.
  func testCirclesOpenFromAndCloseToTheCentre() {
    let open = blend("circleOpen", 0.5), close = blend("circleClose", 0.5)
    assertIncoming(open, 32, 18, "open: centre")
    assertOutgoing(open, 1, 1, "open: corner")
    assertOutgoing(open, 62, 34, "open: corner")
    assertOutgoing(close, 32, 18, "close: centre")
    assertIncoming(close, 1, 1, "close: corner")
    assertIncoming(close, 62, 34, "close: corner")
    XCTAssertEqual(TransitionBlend.halfDiagonal(size), 36.715, accuracy: 0.01)          // √(64² + 36²) / 2
  }

  /// Half way the edge runs corner to corner. The TOP-left of the screen (low x, high y) is the incoming frame, the
  /// bottom-right the outgoing one. A quarter of the way, only the top-left quarter-triangle has turned.
  func testDiagonalWipeStartsAtTheTopLeftOfTheScreen() {
    let half = blend("wipeDiagonal", 0.5)
    assertIncoming(half, 4, 30, "top-left")
    assertOutgoing(half, 60, 4, "bottom-right")
    let quarter = blend("wipeDiagonal", 0.25)
    assertIncoming(quarter, 2, 33, "the top-left corner")
    assertOutgoing(quarter, 32, 18, "the centre")
    assertOutgoing(quarter, 4, 4, "bottom-left")
  }

  /// A quarter of the way the hand is at 3 o'clock: the upper-right quarter of the screen (high x, high y) has
  /// turned; the lower-right and the upper-left have not. Three quarters: only the upper-left is left.
  func testClockWipeSweepsClockwiseFromTwelve() {
    let quarter = blend("wipeClock", 0.25)
    assertIncoming(quarter, 50, 30, "upper right")
    assertOutgoing(quarter, 50, 5, "lower right")
    assertOutgoing(quarter, 14, 30, "upper left")
    let three = blend("wipeClock", 0.75)
    assertIncoming(three, 50, 5, "lower right")
    assertIncoming(three, 14, 5, "lower left")
    assertOutgoing(three, 14, 30, "upper left")
  }

  /// At the cut the frame is white; a quarter of the way it is the outgoing (red) frame half-covered with white.
  func testWhiteFlashPeaksWhiteAtTheCut() {
    let peak = redBlue(blend("flashWhite", 0.5), 32, 18)
    XCTAssertEqual(peak.r, 1, accuracy: 0.02)
    XCTAssertEqual(peak.b, 1, accuracy: 0.02)
    let early = redBlue(blend("flashWhite", 0.25), 32, 18)
    XCTAssertEqual(early.r, 1, accuracy: 0.02)
    XCTAssertEqual(early.b, 0.5, accuracy: 0.05)
    let late = redBlue(blend("flashWhite", 0.75), 32, 18)
    XCTAssertEqual(late.r, 0.5, accuracy: 0.05)
    XCTAssertEqual(late.b, 1, accuracy: 0.02)
  }

  /// Solid frames stay solid in blocks, so Pixelate is a plain mix at any progress, opaque to the corners.
  func testPixelateMixesSolidFrames() {
    for p in [0.25, 0.5, 0.75] as [CGFloat] {
      for (x, y) in [(32, 18), (0, 0), (63, 35)] as [(CGFloat, CGFloat)] {
        let c = redBlue(blend("pixelate", p), x, y)
        XCTAssertEqual(c.r, Double(1 - p), accuracy: 0.05, "pixelate at \(p), (\(x), \(y))")
        XCTAssertEqual(c.b, Double(p), accuracy: 0.05, "pixelate at \(p), (\(x), \(y))")
      }
    }
    let image = a
    XCTAssertTrue(TransitionBlend.pixelated(image, block: 1, rect: rect) === image)
    XCTAssertTrue(TransitionBlend.pixelated(image, block: .nan, rect: rect) === image)
  }

  func testMaskHelpersGuardTheirInput() {
    XCTAssertNil(TransitionBlend.masked(a, over: b, mask: nil, rect: rect))
    XCTAssertNil(TransitionBlend.slid("fade", from: a, to: b, progress: 0.5, size: size))
    XCTAssertNil(TransitionBlend.discMask(radius: .nan, size: size))
    XCTAssertNil(TransitionBlend.diagonalMask(edge: .nan, size: size))
    XCTAssertNil(TransitionBlend.sectorMask(angle: .nan, size: size))
    XCTAssertNil(TransitionBlend.sectorMask(angle: 1, size: CGSize(width: 0, height: 36)))
    XCTAssertEqual(TransitionBlend.discMask(radius: 0, size: size)?.extent, rect)
    XCTAssertEqual(TransitionBlend.diagonalMask(edge: 1, size: size)?.extent, rect)
    XCTAssertEqual(TransitionBlend.sectorMask(angle: 1, size: size)?.extent, rect)
    let image = a
    XCTAssertTrue(TransitionBlend.flashed(image, amount: 0, rect: rect) === image)
  }
```

**Verify by reading** (and list what you could not verify): `CIRadialGradient`, `CIBlendWithMask`, `CIPixellate` (`inputScale`, `inputCenter`) keys; that `CIBlendWithMask` shows the **input** image where the mask is white; `CGContext.addArc(center:radius:startAngle:endAngle:clockwise:)` — in an unflipped bitmap context `clockwise: true` draws clockwise as seen with y up; that a grey bitmap wrapped by `CIImage(cgImage:)` is upright in Core Image space (the existing `drawnRoundedShape` relies on the same); the rotation's sign in `diagonalMask` by working the three points of `testDiagonalWipeStartsAtTheTopLeftOfTheScreen` through the transform by hand (write the arithmetic in your report); that `blend`'s `a` and `b` are frame-sized; that the two existing tests which read the text from `case "blur"` to `default:` (`effectMath.parity.test.ts`) still see only the Blur branch.

- [ ] **Step 4:** `npx.cmd jest src/editor/model/__tests__/transitionBlend.swift.test.ts src/editor/__tests__/effects.test.ts src/editor/model/__tests__/effectMath.parity.test.ts src/editor/__tests__/looks.frozen.test.ts` green — the last three **unedited**. `npm run typecheck`; `npm test`.
- [ ] **Step 5: Commit** — explicit paths; `feat(export): the ten new transitions in Swift — slides, circle, diagonal and clock masks, pixelate, white flash (uncompiled)`.

---

### Task 10: Docs, README first-build checklist, full checks

**Depends on:** Tasks 1–9.

**Files:** Modify `README.md`, `AGENTS.md`, `docs/superpowers/specs/2026-10-06-more-looks-design.md`, `docs/superpowers/research/capcut-roadmap.md`; any file the sweep below names.

**Do not touch:** behaviour. A failing test means a mistake here. Never: everything under "Never edited this round".

- [ ] **Step 1: Sweep** with the Grep tool (not `sed`) and fix what is found:
  - `MORE-LOOKS-PLACEHOLDER` anywhere in `modules/` or `src/`: none.
  - `applyingFilter(` or `CIFilter(name: "` in `FilterRecipes.swift`, `TransitionMasks.swift`, and in the lines this round added to `EffectRenderer.swift`: none.
  - `git diff main -- src/editor/__tests__/looks.frozen.test.ts` shows the file **added once and never changed** (`git log --oneline -- src/editor/__tests__/looks.frozen.test.ts` has exactly one commit).
  - Comments that still say "eleven" / "ten" for the transitions, "twelve" / "ten" for the effects, "19" / "twenty" for the filters, or "v15" for the current schema: corrected (not the frozen test, not the historical test titles).
  - `src/__tests__/spacingScale.test.ts`, `outlineIcons.test.ts`, `kitSlider.test.ts`: `git diff --stat main -- src/__tests__` shows only `noHexLiterals.test.ts` (Task 1's two entries).
- [ ] **Step 2: Docs.**
  - `README.md`, section **Look**: Filters — "31 filters plus None" and the twelve new names (Kodak, Fuji, Matte, Bleach, Dusk, Moody, Cinema, Blush, Grit, Silver, Indigo, Drama). Effects — "twenty", adding Film burn, Lens flare, Dust, Heartbeat, Hue shift, Mirror, Soft edges, Strobe (and Blur box, Mosaic box if the list still says ten). Transitions — "twenty-one chips", adding Cover left, Reveal left, Cover up, Reveal down, Circle open, Circle close, Diagonal wipe, Clock wipe, Pixelate, White flash. Say that the filter and transition rows open at the item in use. In **Preview vs export** replace the two bullets with the three groups of the spec's tables: *shown as in the export* (Heartbeat, Strobe, White flash), *shown roughly* (the twelve new filters as a tint; Film burn, Lens flare, Soft edges, Dust; Cover / Reveal in four directions, the two circles and the diagonal wipe as a moving black edge — the two clips are never seen together), *not shown until a real build* (Hue shift, Mirror; Clock wipe and Pixelate show as the dip to black), keeping what the bullets say about the older looks.
  - `README.md`, **First native build — things to check**: add a group "More looks items" (continue the numbering), one line per item — Filters: (a) each of the twelve changes the picture, and **Strength** 0–100 mixes it in; (b) **Cinema, Kodak, Fuji, Dusk, Blush, Indigo** (split tone): shadows and highlights take their two colours — not a flat wash, not nothing; (c) **Grit, Silver, Indigo** are black-and-white; (d) warm / cool direction of Kodak, Fuji, Moody (the same question as item 1); (e) an **old** filter on an old project looks as before. Effects: (f) **Film burn** glows from the left edge and drifts; (g) **Lens flare** is a spot that crosses left to right every two seconds; (h) **Dust**: scratches where the preview shows them, grain visible but faint; (i) **Heartbeat** and **Strobe** match the preview's timing; (j) **Hue shift** turns colours and leaves greys; (k) **Mirror** has no seam on the centre line, and fades below Strength 50; (l) **Soft edges**: centre sharp, edges blurred, no dark rim; speed at 4K. Transitions: (m) **Cover left / Reveal left / Cover up / Reveal down** directions; (n) **Circle open / close**: a clean round edge, reaching the corners at the end; (o) **Diagonal wipe** starts at the top-left; (p) **Clock wipe** starts at 12 and runs clockwise; edge quality at 4K (the mask is drawn at 512 px); (q) **Pixelate**: no jump at the first and last frame; (r) **White flash** is white, not grey, at the cut.
  - `AGENTS.md` "This repo": in the **Look maths** bullet append ``Filter recipes: keep `src/editor/model/filterRecipes.ts` ↔ `modules/clipy-video/ios/FilterRecipes.swift` identical (rows, stage rule, vectors) — the twelve filters after Dream are rows over the untouched Adjust pipeline; the twenty older ones stay as chains in `Effects.filterChain`.`` Add after it: ``- Transition maths: keep `src/editor/model/transitionMath.ts` ↔ `modules/clipy-video/ios/TransitionMath.swift` identical (constants, formulas, vectors); the images are built only in `TransitionMasks.swift`. The preview shows one clip at a time: a transition is drawn by `TransitionLayer` from `transitionCurtain` (it and `EffectOverlays` measure the frame themselves — `PreviewPlayer.tsx` hands them nothing).`` and ``- Existing looks are frozen: `src/editor/__tests__/looks.frozen.test.ts` holds the old registries as literals and the old Swift as checksums — never edit it to pass; append ids, insert Swift outside the frozen stretches. Every new Core Image filter goes through `Adjust.filtered` or a `generated` / `generator` helper (nil → no change).``
  - `docs/superpowers/research/capcut-roadmap.md`: the filters row notes "32 with None"; the effects and transitions rows "20" and "21".
  - Spec: Status → `Implemented 2026-10-06 (Swift export unverified until an EAS build exists; on-device confirmation by the user pending)`; add a section **3a. As built** after §3: the commit of each task, every deviation the tasks reported (values that changed, tests whose expectations changed — file and what, files outside the plan), and what no test checks (the device checklist below; how the twelve filters and the curtains look; every item of §11).
- [ ] **Step 3: Full checks.** `npm run typecheck`; `npm test`; `npx.cmd expo-doctor`; `git status --short` shows nothing unexpected; `git diff --stat main` shows **no change** under `ios/`, `android/`, `supabase/`, `src/publish/`, `package.json`, `app.json`, `assets/`, `src/theme/`, and none in `src/editor/timelineScroll.ts`, `src/editor/toolStrip.ts`, `src/editor/components/Timeline.tsx`, `PreviewPlayer.tsx`, `EditorLayout.tsx`, `FilterLayer.tsx`, `AdjustLayer.tsx`, `EffectSheet.tsx`, `src/editor/model/ops.ts`, `adjust.ts`, `modules/clipy-video/index.ts`, `modules/clipy-video/ios/Adjust.swift`; under `src/ui/` only `ToolStrip.tsx` and its test.
- [ ] **Step 4: Commit** — `git add` the files changed (explicit paths); `docs: more transitions, filters and effects as built, README, AGENTS, first-build checklist`.

**Device checklist (user, Expo Go)** — start with `npx expo start --go --port 8090` and open the app on the iPhone. Use a project you made **before** this update that has a filter, an effect and a transition in it (if you have none, any project with two clips will do for steps 3–16).

What to expect on the phone, in one line each: **Heartbeat, Strobe and White flash look like the final video.** **The twelve filters, Film burn, Lens flare, Soft edges, Dust, and the Cover / Reveal / Circle / Diagonal transitions are rough sketches** of the final video. **Hue shift, Mirror, Clock wipe and Pixelate cannot be shown on the phone at all** — you only see the small "Preview" tag (and, for the two transitions, the usual dip to black). All of them are in the exported video, which needs the real build.

1. **Nothing changed.** Open the old project and play it. The filters, effects and transitions you already had look exactly as they did. Tell me if anything looks different.
2. Tap a clip, then **Filter**: the filter you had is still selected, and the row now opens with it in view.
3. **New filters.** In the Filter row swipe left past **Dream**: there are twelve new ones — **Kodak, Fuji, Matte, Bleach, Dusk, Moody, Cinema, Blush, Grit, Silver, Indigo, Drama**. Tap each. On the phone each only tints the picture a little (Grit, Silver and Indigo turn it grey); the small "Preview" tag shows. Tell me if any name is cut off under its tile.
4. Tap **Drama** (the last one), close the strip with ✓, and open **Filter** again: the row should open at its far end with Drama visible, and no empty space after it.
5. Drag **Strength** down and up: the tint gets weaker and stronger. Tap another filter: the row must **not** jump sideways.
6. Tap **None** to remove the filter.
7. **New effects.** Tap **Effects** and swipe left past **Mosaic box**: **Film burn, Lens flare, Dust, Heartbeat, Hue shift, Mirror, Soft edges, Strobe**. Add **Heartbeat** and play: the picture beats twice and rests, again and again.
8. Add **Strobe** somewhere else and play: the picture goes dark twice a second. (If flashing pictures bother you, skip this one and tell me.)
9. Add **Film burn**: an orange glow comes and goes from the left edge. Add **Lens flare**: a soft band of light crosses from left to right every two seconds. Add **Soft edges**: the edges go a little pale. Add **Dust**: thin light lines flicker. These four are sketches; tell me if one looks plainly wrong.
10. Add **Hue shift** and **Mirror**: on the phone **nothing changes** except the "Preview" tag. That is expected.
11. Tap one of the new effect bars on the timeline, then **Strength**: drag it. Heartbeat beats harder, Strobe gets darker.
12. **New transitions.** Tap the mark between two clips (or a clip, then **Transition**). Swipe the row left past **Blur**: **Cover left, Reveal left, Cover up, Reveal down, Circle open, Circle close, Diagonal wipe, Clock wipe, Pixelate, White flash**.
13. Tap **White flash**, move the playhead to just before the cut and play: the picture flashes to white at the cut. This one is like the final video.
14. Tap **Cover left** and play across the cut: a black area slides in from the right, and after the cut the new clip has a black area on its left that slides away. The black stands for the clip the phone cannot show at the same time. **Reveal left** looks the same on the phone. Try **Cover up**, **Reveal down**, **Circle open**, **Circle close** and **Diagonal wipe** the same way. Tell me if you would rather have the plain dip to black for these on the phone.
15. Tap **Clock wipe**, then **Pixelate**: both just dip to black on the phone. That is expected.
16. With **White flash** selected, close the strip and open **Transition** again: the row opens at its far end with White flash visible. Drag the time slider: it still works. Press **Undo** a few times: each press takes back one step.
17. Close the project and open it again: the new filter, effects and transitions are still there.
18. Only once you have the real build (not Expo Go): export a short video that uses **Cinema**, **Indigo**, **Film burn**, **Mirror**, **Hue shift**, **Circle open**, **Clock wipe** and **Pixelate**, and watch it. Tell me which ones look good and which look wrong — these have never run before.
