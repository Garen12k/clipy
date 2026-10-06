# More Text Looks and Stickers: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Twelve more one-tap text looks, a background box with square or rounded corners and adjustable padding, the outline / shadow / spacing controls surfaced as named rows of the Text panel, thirteen more sticker shapes, and the emoji picker browsed by pack — with every existing text and sticker drawing exactly as before.

**Architecture:** Schema v15 adds two fields to `TextOverlay.style` (`boxPadding`, default 0.25; `boxCorner`, default `"rounded"`) and thirteen ids to `SHAPE_IDS`; the migration is the existing sanity pass and only adds the two defaults. The mirrored pair `overlayLayout.ts` ↔ `OverlayLayout.swift` turns the two fields into pixels (`padding`, new `boxRadius`); the preview (`OverlayText`) and the export (`ExportSession.overlayLayer`) read only that result. No op changes: `setTextStyle` / `setCaptionStyleForAll` already merge, round and clamp any style field. The twelve looks are entries appended to `TEXT_TEMPLATES`. `TextStyleSection.tsx` becomes five closed rows (Outline, Shadow, Background, Spacing and opacity, Glow) shared by the Text panel and Caption style. Shapes are path strings in `effects.ts` ↔ `Effects.swift` (absolute `M L C Q Z`, holes as counter-wound subpaths, no fill rule). Packs are one pure function over the existing emoji data.

**Tech Stack:** Expo SDK 57, React Native 0.86, TypeScript strict, Zustand 5, `react-native-svg` 15.15.4, `@expo/vector-icons` 15 (Ionicons), `@react-native-community/slider` 5.2 behind the kit `Slider`, Jest (`jest-expo`) + RNTL 14.0.1; Swift / CoreText / Core Animation in `modules/clipy-video/ios` (never compiled here). **No new package, no new font file.**

**Spec:** `docs/superpowers/specs/2026-10-06-text-looks-stickers-design.md` (binding; §3 model, §4 layout formulas, vectors and the proof, §5 preview and the layer cap, §6 export, §7 the twelve looks, §8 screens, §9 shape paths, §10 packs).

## Global Constraints

- **iPhone only.** No Android or web configuration, files or code paths.
- **Expo Go must keep working.** Everything shows in the preview without `modules/clipy-video` linked; **no new package** (`package.json` and `app.json` are not edited); no new font file.
- **Existing overlays render exactly as before.** A text, caption or sticker stored by schema v14 loads to the same draw parameters: the proof tests of Task 1 (model) and Task 2 (`layoutOverlay` against a frozen v14 copy) must stay green in every later task and are never edited to make something pass. `src/editor/__tests__/OverlayText.test.tsx` passes **unedited**.
- **A saved project is only changed by the additive migration:** two defaults added to each text style, the schema number. No existing value is rewritten; no existing field changes name, range, default or meaning.
- **Mirrored pairs stay identical at every commit:** `src/editor/model/overlayLayout.ts` ↔ `modules/clipy-video/ios/OverlayLayout.swift` (constants, formulas, vectors) and `src/editor/effects.ts` ↔ `modules/clipy-video/ios/Effects.swift` (shape ids and paths, verbatim). Nothing else turns a style number into pixels; nothing else holds a shape path.
- **Swift is never compiled here.** Verify by reading against `node_modules/expo-modules-core/ios`; list every unverified API or assumption in your report.
- UI from `src/ui/` and `src/theme/theme.ts` only; **no hex literals** outside the allow-listed content files (`src/__tests__/noHexLiterals.test.ts` — `textTemplates.ts`, `effects.ts`, `types.ts`, `ColorRow.tsx`, `TextPanel.tsx`, `CaptionStyleSheet.tsx`, `OverlayText.tsx` are listed; `TextStyleSection.tsx`, `StickerSheet.tsx` and `emoji.ts` are **not** and must hold none). **Spacing from `theme.space` only** (`src/__tests__/spacingScale.test.ts`; never add to its allow-table; its two blind spots — an apostrophe in JSX text hides the rest of its line, a value with `*` or `/` is skipped whole — are never relied on). Sliders are the kit `Slider` only (`kitSlider.test.ts`); icons are Ionicons outline names; touch targets reach 44 pt.
- **Explicit heights:** strips and panels never use `flex: 1` for height inside an auto-height parent (the sticker panel collapsed off-screen once because of that). `flex: 1` along a row of explicit height is a width, and is allowed where this plan says so.
- **One user action = one undo step:** a slider drag is `beginTransaction` + `applyTransient`; a tap, switch or chip is one `apply`. The typing-undo logic in `TextPanel.tsx` (`typing`, `type`) is not touched.
- **Motion rules** (round 1): no `entering` / `exiting` / layout animation, nothing animated on an ancestor of the preview or the timeline, nothing that starts from a value prop; the only animated pressable is `PressableScale`. This round adds no animation.
- Standing rules: read items through `findItem` / `useItem` where a file already does; only `src/editor/model/timeline.ts` uses clip `speed`; **never touch `src/editor/timelineScroll.ts`**; the preview `VideoView` never remounts (`PreviewPlayer.tsx` and `EditorLayout.tsx` are not edited); tools open through `src/editor/toolStrip.ts`, which is not edited.
- **Never edit:** `src/editor/timelineScroll.ts`, `src/editor/components/Timeline.tsx`, `src/editor/components/PreviewPlayer.tsx`, `src/editor/toolStrip.ts`, anything under `src/publish/` or `supabase/`.
- RNTL v14: `render` / `fireEvent` / `rerender` are async — always `await`. `getByText` joins nested text (a `ValueLabel` is one text). `getByRole("button", { name })` matches the accessibility label exactly. The mocked Slider is a `View` driven by `touchStart` / `touchMove` / `touchEnd` (the helper `drag` at the top of `TextPanel.style.test.tsx`).
- A test that fails after your change because it names a **pinned count, key list or the removed "Style" button** listed in your task is updated as the task says. A test that fails for any other reason means a mistake in the change — fix the change. No existing expectation about a label, role or test id is edited beyond what a task lists.
- Tasks that run side by side share one working tree: a red suite that belongs to a file another task owns is not yours to fix — re-run when that task has landed; never edit a file outside your task's list.
- Windows: PowerShell, no `&&`, `npx.cmd`. **Never run `expo lint`.** **No broad `sed`** — use Grep and edit each hit by hand. **Never `git stash`.** **`git add` explicit paths only — never `-A` / `.`.** **Do not start or stop a dev server** (one is serving this tree to the user's phone). Before each commit: `npm run typecheck` and `npm test` green. Commit trailer exactly `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Task order

1 first. Then **2 ∥ 3 ∥ 5 ∥ 6 ∥ 7**. Then **4** (after 2) and **8** (after 2 and 6), side by side. Last: 9.

| Task | Title | Depends on | Parallel-safe with | Model tier |
|---|---|---|---|---|
| 1 | Schema v15: the box fields, clamps, migration, the unchanged-project proof | — | — | standard |
| 2 | Layout pair: `padding`, `boxRadius`, vectors, the draw-parameter proof (TS + Swift) | 1 | 3, 5, 6, 7 | standard |
| 3 | The twelve new looks; op tests for the box fields | 1 | 2, 5, 6, 7, 4, 8 | cheap |
| 4 | Preview: the box in `OverlayText`, the layer cap | 2 | 3, 5, 6, 7, 8 | cheap |
| 5 | Text panel and Caption style: the five rows | 1 | 2, 3, 4, 6, 7, 8 | standard |
| 6 | Thirteen shapes: registry, paths, Swift table, Shapes tab | 1 | 2, 3, 4, 5, 7 | standard |
| 7 | Emoji packs and the Emoji tab | — (run after 1 for a quiet tree) | 2, 3, 4, 5, 6, 8 | standard |
| 8 | Export: request fields, the box corner in Swift, XCTests, source-reading tests | 2, 6 | 3, 4, 5, 7 | most capable |
| 9 | Docs, README first-build checklist, full checks, device checklist | 1–8 | — | cheap |

**Files more than one task edits** (each its own lines only): `src/editor/model/types.ts` (1: the style; 6: the `SHAPE_IDS` line) · `src/editor/model/__tests__/migrate.test.ts` (1; 6 appends one test) · `src/editor/model/__tests__/overlayLayout.test.ts` (1: two lines; 2: the rest) · `src/editor/__tests__/textTemplates.test.ts` (1: one line; 3: the lists) · `modules/clipy-video/ios/ExportSession.swift` (2: two record fields; 8: `overlayLayer`) · `modules/clipy-video/__tests__/index.test.ts` (1: one input literal; 8: expectations). No source file is edited by two tasks that may run side by side.

**Pinned values that change, and who changes them:** schema number 14 → 15 (Task 1) · `DEFAULT_TEXT_STYLE` literal in two tests (1) · style key list (1) · three whole `layoutOverlay` results + the `ExportTextStyle` record list (2) · template ids / labels 12 → 24, tile count (3) · `SHAPE_IDS` 7 → 20 (6) · three whole request style objects (8).

---

### Task 1: Schema v15 — the box fields, clamps, migration, the unchanged-project proof

**Depends on:** nothing. **Parallel-safe with:** none.

**Files:** Modify `src/editor/model/types.ts`, `src/editor/model/migrate.ts` (comments only), `src/editor/model/__tests__/types.text.test.ts`, `src/editor/model/__tests__/migrate.test.ts`, the eight other `src/editor/model/__tests__/types.*.test.ts` files (schema number only), `src/editor/model/__tests__/overlayLayout.test.ts` (lines 89 and 122 only), `src/editor/__tests__/textTemplates.test.ts` (line 11 only), `modules/clipy-video/__tests__/index.test.ts` (the input literal at line 298 only).

**Do not touch:** `overlayLayout.ts` (Task 2), `ops.ts`, `textTemplates.ts` (Task 3), `SHAPE_IDS` (Task 6), every component, `modules/clipy-video/index.ts` and `ios/` (Tasks 2, 8), `src/editor/timelineScroll.ts`, `Timeline.tsx`, `PreviewPlayer.tsx`, `src/editor/toolStrip.ts`, `src/publish/`, `supabase/`.

**Interfaces — Consumes:** `clampNum`, the private `isRec` / `isNum` in `types.ts`; `migrateProject` (`migrate.ts`: `withTextStyle` already sends every text / caption style through `clampTextStyle`).

**Interfaces — Produces**

```ts
// src/editor/model/types.ts
export const SCHEMA_VERSION = 15 as const;
export const BOX_CORNERS = ["rounded", "square"] as const;
export type BoxCorner = (typeof BOX_CORNERS)[number];
export interface TextStyle {
  opacity: number; letterSpacing: number; lineSpacing: number; outlineColor: string | null; outlineWidth: number;
  shadow: TextShadow | null; glow: TextGlow | null;
  boxPadding: number;     // 0…0.6 of the font size between the text and the edge of its background box; default 0.25 (every box before v15)
  boxCorner: BoxCorner;   // default "rounded" (every box before v15)
}
export const DEFAULT_TEXT_STYLE: TextStyle;   // { …the seven v14 defaults, boxPadding: 0.25, boxCorner: "rounded" } — in that key order
export const TEXT_STYLE_LIMITS: { …the eight v14 ranges; boxPadding: readonly [0, 0.6] };
export function clampTextStyle(v: unknown): TextStyle;   // now also: boxPadding clamped (non-finite → 0.25), boxCorner one of BOX_CORNERS (else "rounded")
```

- [ ] **Step 1: Failing tests.**

`src/editor/model/__tests__/types.text.test.ts` — add `BOX_CORNERS` and `TEXT_STYLE_LIMITS` to the `../types` import (if missing), change line 6 to `test("schema is v15", () => expect(SCHEMA_VERSION).toBe(15));`, line 105 to `test("makeProject is v15", () => expect(makeProject().schemaVersion).toBe(15));`, and line 9 to

```ts
  expect(DEFAULT_TEXT_STYLE).toEqual({ opacity: 1, letterSpacing: 0, lineSpacing: 1, outlineColor: null, outlineWidth: 1, shadow: null, glow: null, boxPadding: 0.25, boxCorner: "rounded" });
```

and append:

```ts
describe("the box fields (schema v15)", () => {
  test("ids, limits and defaults: the defaults are the box every text had before", () => {
    expect(BOX_CORNERS).toEqual(["rounded", "square"]);
    expect(TEXT_STYLE_LIMITS.boxPadding).toEqual([0, 0.6]);
    expect(DEFAULT_TEXT_STYLE).toMatchObject({ boxPadding: 0.25, boxCorner: "rounded" });
    expect(Object.keys(DEFAULT_TEXT_STYLE)).toEqual(["opacity", "letterSpacing", "lineSpacing", "outlineColor", "outlineWidth", "shadow", "glow", "boxPadding", "boxCorner"]);
  });
  test("a style stored without them gets the defaults; every other value is kept as it is", () => {
    const v14 = { opacity: 0.8, letterSpacing: 0.1, lineSpacing: 1.5, outlineColor: "#FF2D7A", outlineWidth: 2.2, shadow: { color: "#000000", opacity: 0.6, distance: 0.06, blur: 0.1 }, glow: { color: "#FFFFFF", size: 0.25 } };
    expect(clampTextStyle(v14)).toEqual({ ...v14, boxPadding: 0.25, boxCorner: "rounded" });
  });
  test("padding is clamped to 0–0.6; anything that is not a finite number → 0.25", () => {
    expect(clampTextStyle({ boxPadding: 0 }).boxPadding).toBe(0);
    expect(clampTextStyle({ boxPadding: 0.6 }).boxPadding).toBe(0.6);
    expect(clampTextStyle({ boxPadding: 9 }).boxPadding).toBe(0.6);
    expect(clampTextStyle({ boxPadding: -1 }).boxPadding).toBe(0);
    for (const bad of [NaN, Infinity, "0.4", null, undefined]) expect(clampTextStyle({ boxPadding: bad }).boxPadding).toBe(0.25);
  });
  test("corner: the two ids are kept; anything else → rounded", () => {
    expect(clampTextStyle({ boxCorner: "square" }).boxCorner).toBe("square");
    expect(clampTextStyle({ boxCorner: "rounded" }).boxCorner).toBe("rounded");
    for (const bad of ["pill", "", 0, null, undefined, ["square"]]) expect(clampTextStyle({ boxCorner: bad }).boxCorner).toBe("rounded");
  });
  test("idempotent; a new text and a new caption carry their own fresh copy", () => {
    const once = clampTextStyle({ boxPadding: 0.456, boxCorner: "square", extra: 1 });
    expect(once).toMatchObject({ boxPadding: 0.456, boxCorner: "square" });   // the sanity pass clamps; it does not round
    expect(clampTextStyle(once)).toEqual(once);
    expect(makeOverlay({ id: "a" }).style).toEqual(DEFAULT_TEXT_STYLE);
    expect(makeOverlay({ id: "a" }).style).not.toBe(DEFAULT_TEXT_STYLE);
  });
});
```

`src/editor/model/__tests__/migrate.test.ts` — append (add `makeKeyframe`, `makeSticker`, `makeClip`, `makeOverlay`, `makeProject`, `DEFAULT_TEXT_STYLE` to the import if any is missing):

```ts
test("PROOF v14 → v15: the migration only ADDS the two box defaults to texts and captions — every stored value stays, stickers are untouched", () => {
  const now = makeProject({ clips: [makeClip({ id: "a", sourceDuration: 8 })], overlays: [
    makeOverlay({ id: "t1", text: "Plain", start: 0, end: 3 }),
    makeOverlay({ id: "t2", text: "Styled", start: 1, end: 4, fontId: "anton", color: "#FFE14D", outline: true, background: { color: "#112233", opacity: 0.4 }, rotation: 12, scale: 1.4,
      animation: { in: { id: "pop", duration: 0.4 }, out: null, loop: "pulse" },
      keyframes: [makeKeyframe({ t: 0, x: 0.2, y: 0.3 }), makeKeyframe({ t: 1, x: 0.6, y: 0.7, scale: 2 })],
      style: { ...DEFAULT_TEXT_STYLE, opacity: 0.8, letterSpacing: 0.1, lineSpacing: 1.5, outlineColor: "#FF2D7A", outlineWidth: 2.2,
        shadow: { color: "#000000", opacity: 0.6, distance: 0.06, blur: 0.1 }, glow: { color: "#FFFFFF", size: 0.25 } } }),
    makeOverlay({ id: "c1", kind: "caption", text: "Hello there", start: 2, end: 4, outline: false, background: { color: "#000000", opacity: 0.6 },
      words: [{ text: "Hello", start: 0, end: 1 }, { text: "there", start: 1, end: 2 }], highlightColor: "#FFE14D" }),
    makeSticker({ id: "s1", emoji: "🔥", start: 0, end: 2 }),
    makeSticker({ id: "s2", emoji: null, shape: "heart", color: "#C8102E", start: 0, end: 2 }),
  ] });
  expect(migrateProject(now)).toEqual(now);                       // the fixture is a clean v15 project
  // The same project as schema 14 stored it: no box fields, the old number.
  const v14 = JSON.parse(JSON.stringify(now)) as { schemaVersion: number; overlays: { kind: string; style?: Record<string, unknown> }[] };
  v14.schemaVersion = 14;
  for (const o of v14.overlays) if (o.style) { delete o.style.boxPadding; delete o.style.boxCorner; }
  const frozen = JSON.stringify(v14);
  const p = migrateProject(v14);
  expect(JSON.stringify(v14)).toBe(frozen);                       // the stored object is not mutated
  expect(p).toEqual(now);                                         // nothing but the number and the two defaults differs from the file
  expect(p.schemaVersion).toBe(15);
  p.overlays.forEach((o, i) => {
    if (o.kind === "sticker") { expect(o).toEqual(v14.overlays[i]); expect(o).not.toHaveProperty("style"); return; }
    const { boxPadding, boxCorner, ...stored } = o.style;
    expect(stored).toEqual(v14.overlays[i].style);                // the seven v14 fields, value for value
    expect([boxPadding, boxCorner]).toEqual([0.25, "rounded"]);
  });
  expect(migrateProject(p)).toEqual(p);
});

test("sanity pass: a bad box padding or corner is repaired, on texts and on captions", () => {
  const bad = makeProject({ overlays: [
    { ...makeOverlay({ id: "t" }), style: { ...DEFAULT_TEXT_STYLE, boxPadding: 7, boxCorner: "pill" } } as unknown as Overlay,
    { ...makeOverlay({ id: "c", kind: "caption", text: "x", start: 0, end: 1 }), style: { ...DEFAULT_TEXT_STYLE, boxPadding: "wide", boxCorner: "square" } } as unknown as Overlay,
  ] });
  const p = migrateProject(bad);
  expect((p.overlays[0] as TextOverlay).style).toMatchObject({ boxPadding: 0.6, boxCorner: "rounded" });
  expect((p.overlays[1] as TextOverlay).style).toMatchObject({ boxPadding: 0.25, boxCorner: "square" });
  expect(migrateProject(p)).toEqual(p);
});
```

- [ ] **Step 2: Run** `npx.cmd jest src/editor/model/__tests__/types.text.test.ts src/editor/model/__tests__/migrate.test.ts` → the new tests FAIL (no box fields; schema 14).
- [ ] **Step 3: Implement.**

`src/editor/model/types.ts`:
- `export const SCHEMA_VERSION = 15 as const;`
- Directly above `export interface TextStyle`:

```ts
/** The corners of a text's background box. */
export const BOX_CORNERS = ["rounded", "square"] as const;
export type BoxCorner = (typeof BOX_CORNERS)[number];
```

- In `TextStyle`, after `glow`:

```ts
  boxPadding: number;           // 0…0.6 of the font size between the text and the edge of its background box; default 0.25 (every box before v15)
  boxCorner: BoxCorner;         // default "rounded" (every box before v15)
```

- `DEFAULT_TEXT_STYLE` gains `, boxPadding: 0.25, boxCorner: "rounded"` at the end; `TEXT_STYLE_LIMITS` gains `, boxPadding: [0, 0.6]` at the end.
- In `clampTextStyle`'s returned object, after `glow: …,`:

```ts
    boxPadding: num(s.boxPadding, DEFAULT_TEXT_STYLE.boxPadding, L.boxPadding),
    boxCorner: (BOX_CORNERS as readonly unknown[]).includes(s.boxCorner) ? (s.boxCorner as BoxCorner) : DEFAULT_TEXT_STYLE.boxCorner,
```

  and its doc comment gains: `The box fields: padding clamped, corner one of BOX_CORNERS (else the default) — a style stored before v15 gets the box it always had.`

`src/editor/model/migrate.ts` — comments only: `Brings a v2–v15 file to a safe v15 shape`; append to that comment `, text styles get the two box fields (v14 → v15: the defaults reproduce the box every text had).`; `// v2 → v15 and the sanity pass are the same idempotent step …`.

**Pinned values (edit each by hand, found with Grep — only a `14` that stands for the schema version):**
- `migrate.test.ts`: `toBe(14)` at lines 115, 126, 159, 221, 254, 320, 370, 427, 513; `schemaVersion: 14` at 360, 487, 503; the titles at 358 and 478 (`reaches v15`). The title at 499 keeps "v13 → v14" (that step is what it describes).
- `types.audio.test.ts` (6, 7, 45), `types.clip.test.ts` (6), `types.layers.test.ts` (4), `types.layers2.test.ts` (4, 56), `types.look.test.ts` (7), `types.motion.test.ts` (7, 8), `types.polish.test.ts` (3, 4, 9), `types.speed.test.ts` (9, 10).
- `overlayLayout.test.ts` line 89: the same nine-key literal as above. Line 122: the full style literal becomes `style: { ...DEFAULT_TEXT_STYLE, opacity: 0.8, letterSpacing: 0.1, lineSpacing: 1.5, outlineWidth: 2, shadow: { ...DEFAULT_SHADOW }, glow: { ...DEFAULT_GLOW } } });` (it must type-check; its expectations are Task 2's).
- `textTemplates.test.ts` line 11: `expect(Object.keys(s).sort()).toEqual(["boxCorner", "boxPadding", "glow", "letterSpacing", "lineSpacing", "opacity", "outlineColor", "outlineWidth", "shadow"]);`
- `modules/clipy-video/__tests__/index.test.ts` line 298: add `boxPadding: 0.25, boxCorner: "rounded" as const` to the input `style` object so it is a whole `TextStyle` (the expectation below it is not touched: `toExportStyle` does not send the fields until Task 8).

- [ ] **Step 4:** `npm run typecheck` (any other "missing boxPadding / boxCorner" error is a whole-`TextStyle` literal in a test: spread `DEFAULT_TEXT_STYLE` into it and name the file in your report; in non-test code there must be none — stop and report if there is). `npm test`: a test that compares a WHOLE style with a seven-key literal gains `boxPadding: 0.25, boxCorner: "rounded"` (name it in your report); anything else red is a mistake in the change. Then everything green; `OverlayText.test.tsx`, `ops.text.test.ts`, `textTemplates.test.ts` (but line 11) pass unedited.
- [ ] **Step 5: Commit** — `git add` the files above by path; `feat(model): schema v15 — background box padding and corner in the text style; the migration only adds the defaults`.

---

### Task 2: Layout pair — `padding`, `boxRadius`, vectors, the draw-parameter proof

**Depends on:** Task 1. **Parallel-safe with:** Tasks 3, 5, 6, 7.

**Files:** Modify `src/editor/model/overlayLayout.ts`, `modules/clipy-video/ios/OverlayLayout.swift`, `modules/clipy-video/ios/ExportSession.swift` (two fields in `struct ExportTextStyle` only), `src/editor/model/__tests__/overlayLayout.test.ts`, `modules/clipy-video/ios/Tests/OverlayLayoutTests.swift`; create `src/editor/model/__tests__/overlayLayout.vectors.ts`.

**Do not touch:** `ExportSession.overlayLayer` and everything else in `ExportSession.swift` (Task 8), `modules/clipy-video/index.ts` (Task 8), `OverlayText.tsx` (Task 4), `contrastFor` and every other formula of the pair, `types.ts`, `src/editor/timelineScroll.ts`, `Timeline.tsx`, `PreviewPlayer.tsx`, `src/editor/toolStrip.ts`, `src/publish/`, `supabase/`.

**Interfaces — Consumes:** `TextStyle.boxPadding` / `boxCorner` (Task 1); `OverlayLayoutResult(` is built in exactly one place (`OverlayLayout.layout`) — confirm with Grep before adding a member.

**Interfaces — Produces**

```ts
// src/editor/model/overlayLayout.ts
export const BOX_RADIUS_FACTOR = 0.5;      // a rounded corner = half of the DEFAULT padding (BACKGROUND_PAD_FACTOR × fontSize)
export interface OverlayLayout { /* …as today… */ padding: number; boxRadius: number /* px; 0 = square corners, or no box */ }
export function layoutOverlay(o: TextOverlay, frameW: number, frameH: number): OverlayLayout;
//   padding:   o.background ? r(o.style.boxPadding * fontSize) : 0
//   boxRadius: !o.background || o.style.boxCorner === "square" ? 0 : r(BACKGROUND_PAD_FACTOR * fontSize) * BOX_RADIUS_FACTOR
// src/editor/model/__tests__/overlayLayout.vectors.ts
export interface BoxVector { name: string; fontScale: number; scale: number; background: boolean; boxPadding: number; boxCorner: BoxCorner; frame: [number, number]; expect: { fontSize: number; padding: number; boxRadius: number } }
export const BOX_VECTORS: BoxVector[];     // eight
```

```swift
// OverlayLayout.swift
struct OverlayLayoutResult { /* …as today… */ let boxRadius: CGFloat }      // the LAST member
enum OverlayLayout { static let boxRadiusFactor: CGFloat = 0.5 }
// ExportSession.swift — struct ExportTextStyle, after glowSize
@Field var boxPadding: Double = 0.25
@Field var boxCorner: String = "rounded"
```

- [ ] **Step 1: Failing tests.**

Create `src/editor/model/__tests__/overlayLayout.vectors.ts`:

```ts
import type { BoxCorner } from "../types";

/**
 * The background box of a text: shared with the Swift mirror (the `boxVectors` table in modules/clipy-video/ios/Tests/OverlayLayoutTests.swift,
 * which overlayLayout.test.ts compares line for line). Expected values are plain literals, computed by hand.
 */
export interface BoxVector { name: string; fontScale: number; scale: number; background: boolean; boxPadding: number; boxCorner: BoxCorner; frame: [number, number];
  expect: { fontSize: number; padding: number; boxRadius: number } }

export const BOX_VECTORS: BoxVector[] = [
  // fontSize 0.1 × 1.5 × 1920 = 288; padding 0.25 × 288 = 72; radius 72 × 0.5 = 36 — the numbers every box had before the box fields
  { name: "the old box", fontScale: 0.1, scale: 1.5, background: true, boxPadding: 0.25, boxCorner: "rounded", frame: [1080, 1920], expect: { fontSize: 288, padding: 72, boxRadius: 36 } },
  // 0.1 × 1.5 × 533 = 79.95; 0.25 × 79.95 = 19.9875; × 0.5 = 9.99375
  { name: "the old box in a small preview", fontScale: 0.1, scale: 1.5, background: true, boxPadding: 0.25, boxCorner: "rounded", frame: [300, 533], expect: { fontSize: 79.95, padding: 19.9875, boxRadius: 9.99375 } },
  // 0.07 × 1920 = 134.4; padding 0.5 × 134.4 = 67.2; square → 0
  { name: "wide and square", fontScale: 0.07, scale: 1, background: true, boxPadding: 0.5, boxCorner: "square", frame: [1080, 1920], expect: { fontSize: 134.4, padding: 67.2, boxRadius: 0 } },
  // padding 0.1 × 134.4 = 13.44; the corner does not follow it: 0.25 × 134.4 × 0.5 = 16.8
  { name: "tight, still rounded", fontScale: 0.07, scale: 1, background: true, boxPadding: 0.1, boxCorner: "rounded", frame: [1080, 1920], expect: { fontSize: 134.4, padding: 13.44, boxRadius: 16.8 } },
  { name: "no padding keeps the round corner", fontScale: 0.07, scale: 1, background: true, boxPadding: 0, boxCorner: "rounded", frame: [1080, 1920], expect: { fontSize: 134.4, padding: 0, boxRadius: 16.8 } },
  // 0.6 × 134.4 = 80.64
  { name: "the widest", fontScale: 0.07, scale: 1, background: true, boxPadding: 0.6, boxCorner: "rounded", frame: [1080, 1920], expect: { fontSize: 134.4, padding: 80.64, boxRadius: 16.8 } },
  { name: "no background, no box", fontScale: 0.07, scale: 1, background: false, boxPadding: 0.5, boxCorner: "rounded", frame: [1080, 1920], expect: { fontSize: 134.4, padding: 0, boxRadius: 0 } },
  // 0.05 × 2 × 1080 = 108; 0.3 × 108 = 32.4; 0.25 × 108 × 0.5 = 13.5
  { name: "a square frame", fontScale: 0.05, scale: 2, background: true, boxPadding: 0.3, boxCorner: "rounded", frame: [1080, 1080], expect: { fontSize: 108, padding: 32.4, boxRadius: 13.5 } },
];
```

`src/editor/model/__tests__/overlayLayout.test.ts`:
- Imports: add `makeClip`, `makeProject`, `type TextOverlay` to `../types`; `BOX_RADIUS_FACTOR` to the named `../overlayLayout` import; and `import { migrateProject } from "../migrate";`, `import { CAPTION_PRESET_IDS, CAPTION_PRESETS, TEXT_TEMPLATES } from "@/src/editor/textTemplates";`, `import { BOX_VECTORS } from "./overlayLayout.vectors";`.
- In `"OverlayLayout.swift has the same constants"` append: `expect(swiftConstant("boxRadiusFactor")).toBe(BOX_RADIUS_FACTOR); expect(BOX_RADIUS_FACTOR).toBe(0.5); expect(BACKGROUND_PAD_FACTOR).toBe(DEFAULT_TEXT_STYLE.boxPadding);   // the default padding IS the old constant`.
- In the `pairs` table add:

```ts
    ["padding: o.background ? r(o.style.boxPadding * fontSize) : 0", "padding: o.backgroundColor == nil ? 0 : CGFloat(o.style.boxPadding) * fontSize"],
    ["boxRadius: !o.background || o.style.boxCorner === \"square\" ? 0 : r(BACKGROUND_PAD_FACTOR * fontSize) * BOX_RADIUS_FACTOR", "boxRadius: o.backgroundColor == nil || o.style.boxCorner == \"square\" ? 0 : backgroundPadFactor * fontSize * boxRadiusFactor"],
```

- In the record test, `record("ExportTextStyle")` ends with two more entries: `["boxPadding", "Double", "0.25"], ["boxCorner", "String", "\"rounded\""],`.
- The three whole results gain the new field: line 96 `…, lineHeight: 95.94, boxRadius: 9.99375, ...NEUTRAL }`; line 97 `…, lineHeight: 345.6, boxRadius: 36, ...NEUTRAL }`; the styled text (line 124) `padding: 0, boxRadius: 0, rotation: 0,`.
- Append:

```ts
test.each(BOX_VECTORS.map((v) => [v.name, v] as const))("the box: %s", (_name, v) => {
  const o = makeOverlay({ id: "b", fontScale: v.fontScale, scale: v.scale, background: v.background ? { color: "#000000", opacity: 0.5 } : null,
    style: { ...DEFAULT_TEXT_STYLE, boxPadding: v.boxPadding, boxCorner: v.boxCorner } });
  expect(layoutOverlay(o, v.frame[0], v.frame[1])).toMatchObject(v.expect);
});

test("OverlayLayoutTests.swift carries the same box vectors, line for line", () => {
  const table = read(join(IOS, "Tests/OverlayLayoutTests.swift"));
  expect(table.match(/BoxVector\(name:/g)).toHaveLength(BOX_VECTORS.length);
  for (const v of BOX_VECTORS) {
    expect(table).toContain(`  BoxVector(name: "${v.name}", fontScale: ${v.fontScale}, scale: ${v.scale}, background: ${v.background}, boxPadding: ${v.boxPadding}, boxCorner: "${v.boxCorner}", `
      + `frame: CGSize(width: ${v.frame[0]}, height: ${v.frame[1]}), fontSize: ${v.expect.fontSize}, padding: ${v.expect.padding}, boxRadius: ${v.expect.boxRadius}),`);
  }
});

/** `layoutOverlay` exactly as it was in schema v14 (copied on 2026-10-06, before the box fields). NEVER edit: it is what "as before" means. */
function layoutV14(o: TextOverlay, frameW: number, frameH: number) {
  const fontSize = r4(o.fontScale * o.scale * frameH);
  const shadow = o.style.shadow, glow = o.style.glow;
  const offset = shadow ? r4(shadow.distance * fontSize * 0.7071) : 0;
  return {
    centerX: r4(o.x * frameW), centerY: r4(o.y * frameH), fontSize,
    maxWidth: r4(0.9 * frameW),
    padding: o.background ? r4(0.25 * fontSize) : 0,
    rotation: o.rotation,
    letterSpacing: r4(o.style.letterSpacing * fontSize),
    lineHeight: r4(1.2 * fontSize * o.style.lineSpacing),
    outlineWidth: r4((2 / 450) * frameH * o.style.outlineWidth),
    outlineColor: o.style.outlineColor ?? overlayLayout.contrastFor(o.color),
    shadow: shadow ? { color: shadow.color, opacity: shadow.opacity, dx: offset, dy: offset, blur: r4(shadow.blur * fontSize) } : null,
    glow: glow ? { color: glow.color, radius: r4(glow.size * fontSize) } : null,
    opacity: o.style.opacity,
  };
}
/** The twelve text templates that existed in schema v14 (later ones never were in a v14 file). */
const V14_TEMPLATES = ["cleanTitle", "boldPop", "neon", "subtitleBar", "comic", "retro", "handwritten", "elegant", "shadowed", "outlineOnly", "stickerLabel", "softGlow"] as const;

test("PROOF: a text or caption from a v14 file draws with exactly the numbers it had (every old look × three backgrounds × four frames)", () => {
  const looks = [...V14_TEMPLATES.map((id) => TEXT_TEMPLATES[id].patch), ...CAPTION_PRESET_IDS.map((id) => CAPTION_PRESETS[id].patch)];
  const overlays = looks.flatMap((look, i) => [look.background, { color: "#112233", opacity: 0.4 }, null].map((background, j) =>
    makeOverlay({ id: `o${i}-${j}`, text: "Hello", start: 0, end: 2, fontId: look.fontId, color: look.color, outline: look.outline,
      background: background ? { ...background } : null, style: look.style, x: 0.3, y: 0.7, scale: 1.3, rotation: 15 })));
  const now = makeProject({ clips: [makeClip({ id: "a", sourceDuration: 5 })], overlays });
  const v14 = JSON.parse(JSON.stringify(now)) as { schemaVersion: number; overlays: { style: Record<string, unknown> }[] };
  v14.schemaVersion = 14;
  for (const o of v14.overlays) { delete o.style.boxPadding; delete o.style.boxCorner; }
  const loaded = migrateProject(v14).overlays as TextOverlay[];
  expect(loaded).toHaveLength(54);                                        // (12 + 6) × 3
  for (const [w, h] of [[300, 533], [1080, 1920], [1080, 1080], [393, 698.6667]]) {
    loaded.forEach((o, i) => {
      const before = layoutV14(v14.overlays[i] as unknown as TextOverlay, w, h);     // the overlay exactly as the v14 file holds it
      const { boxRadius, ...rest } = layoutOverlay(o, w, h);
      expect(rest).toEqual(before);                                       // every number the preview and the export drew from
      expect(boxRadius).toBe(before.padding / 2);                         // what both drew as the corner: `padding / 2`
    });
  }
});
```

- [ ] **Step 2: Run** `npx.cmd jest src/editor/model/__tests__/overlayLayout.test.ts` → the new and the three edited tests FAIL. (With `boxRadius` still missing the PROOF fails on `toBe(undefined)` only: its `rest` half is already green — check that; if `rest` differs **before** you change anything, stop and report.)
- [ ] **Step 3: Implement both sides.**

`src/editor/model/overlayLayout.ts`:
- In `OverlayLayout`, after `padding: number;` in the first line's list, add a line `boxRadius: number;              // px: the background box's corner radius (0 = square corners, or no box)`.
- After `BACKGROUND_PAD_FACTOR`:

```ts
/** A rounded box corner = half of the DEFAULT padding (not of the chosen one): it is the corner every box had before the padding became adjustable. */
export const BOX_RADIUS_FACTOR = 0.5;
```

- In `layoutOverlay`, replace the `padding:` line and add the next one directly under it:

```ts
    padding: o.background ? r(o.style.boxPadding * fontSize) : 0,
    boxRadius: !o.background || o.style.boxCorner === "square" ? 0 : r(BACKGROUND_PAD_FACTOR * fontSize) * BOX_RADIUS_FACTOR,
```

  (not wrapped in `r(…)` again: `r(0.25 × fontSize) × 0.5` is bit-for-bit the old `padding / 2`.) The doc comment's last sentence becomes: `The neutral style (× 1, × 0, the default box padding and corner) gives exactly the numbers from before styles existed.`

`modules/clipy-video/ios/OverlayLayout.swift`:
- `OverlayLayoutResult` gains `let boxRadius: CGFloat` as its **last** member.
- After `backgroundPadFactor`:

```swift
  /// A rounded box corner = half of the DEFAULT padding (BOX_RADIUS_FACTOR): the corner every box had before the padding became adjustable.
  static let boxRadiusFactor: CGFloat = 0.5
```

  (nothing after the number on that line — the parity test reads it.)
- In `layout`: `padding: o.backgroundColor == nil ? 0 : CGFloat(o.style.boxPadding) * fontSize,` and, as the last argument after `opacity: CGFloat(o.style.opacity),`: `boxRadius: o.backgroundColor == nil || o.style.boxCorner == "square" ? 0 : backgroundPadFactor * fontSize * boxRadiusFactor)`.
- The reference comment above `enum OverlayLayout` gains `, boxRadius 36` after `padding 72`.

`modules/clipy-video/ios/ExportSession.swift` — in `struct ExportTextStyle`, after the `glowSize` line, exactly:

```swift
  @Field var boxPadding: Double = 0.25             // fraction of the font size between the text and the edge of its background box
  @Field var boxCorner: String = "rounded"         // rounded | square (anything else draws rounded)
```

Read `node_modules/expo-modules-core/ios` for `Record` / `@Field` with a `String` default (the neighbouring `ExportOverlay.align` is one) and say in your report what you read.

`modules/clipy-video/ios/Tests/OverlayLayoutTests.swift` — above the class:

```swift
/// One case of `BOX_VECTORS` (src/editor/model/__tests__/overlayLayout.vectors.ts). overlayLayout.test.ts compares this table
/// with the TS vectors line for line — keep the literals and the spacing identical.
struct BoxVector {
  let name: String
  let fontScale: Double
  let scale: Double
  let background: Bool
  let boxPadding: Double
  let boxCorner: String
  let frame: CGSize
  let fontSize: CGFloat
  let padding: CGFloat
  let boxRadius: CGFloat
}

let boxVectors: [BoxVector] = [
  BoxVector(name: "the old box", fontScale: 0.1, scale: 1.5, background: true, boxPadding: 0.25, boxCorner: "rounded", frame: CGSize(width: 1080, height: 1920), fontSize: 288, padding: 72, boxRadius: 36),
  BoxVector(name: "the old box in a small preview", fontScale: 0.1, scale: 1.5, background: true, boxPadding: 0.25, boxCorner: "rounded", frame: CGSize(width: 300, height: 533), fontSize: 79.95, padding: 19.9875, boxRadius: 9.99375),
  BoxVector(name: "wide and square", fontScale: 0.07, scale: 1, background: true, boxPadding: 0.5, boxCorner: "square", frame: CGSize(width: 1080, height: 1920), fontSize: 134.4, padding: 67.2, boxRadius: 0),
  BoxVector(name: "tight, still rounded", fontScale: 0.07, scale: 1, background: true, boxPadding: 0.1, boxCorner: "rounded", frame: CGSize(width: 1080, height: 1920), fontSize: 134.4, padding: 13.44, boxRadius: 16.8),
  BoxVector(name: "no padding keeps the round corner", fontScale: 0.07, scale: 1, background: true, boxPadding: 0, boxCorner: "rounded", frame: CGSize(width: 1080, height: 1920), fontSize: 134.4, padding: 0, boxRadius: 16.8),
  BoxVector(name: "the widest", fontScale: 0.07, scale: 1, background: true, boxPadding: 0.6, boxCorner: "rounded", frame: CGSize(width: 1080, height: 1920), fontSize: 134.4, padding: 80.64, boxRadius: 16.8),
  BoxVector(name: "no background, no box", fontScale: 0.07, scale: 1, background: false, boxPadding: 0.5, boxCorner: "rounded", frame: CGSize(width: 1080, height: 1920), fontSize: 134.4, padding: 0, boxRadius: 0),
  BoxVector(name: "a square frame", fontScale: 0.05, scale: 2, background: true, boxPadding: 0.3, boxCorner: "rounded", frame: CGSize(width: 1080, height: 1080), fontSize: 108, padding: 32.4, boxRadius: 13.5),
]
```

and inside the class:

```swift
  func testBoxVectors() {
    for v in boxVectors {
      var o = ExportOverlay()
      o.fontScale = v.fontScale; o.scale = v.scale
      o.backgroundColor = v.background ? "#000000" : nil; o.backgroundOpacity = 0.5
      var style = ExportTextStyle(); style.boxPadding = v.boxPadding; style.boxCorner = v.boxCorner
      o.style = style
      let l = OverlayLayout.layout(o, frame: v.frame)
      XCTAssertEqual(l.fontSize, v.fontSize, accuracy: accuracy, v.name)
      XCTAssertEqual(l.padding, v.padding, accuracy: accuracy, v.name)
      XCTAssertEqual(l.boxRadius, v.boxRadius, accuracy: accuracy, v.name)
    }
  }
```

Also: in `testNeutralStyleGivesTheNumbersFromBeforeStyles` add `XCTAssertEqual(l.boxRadius, 36, accuracy: accuracy)` and `XCTAssertEqual(l.boxRadius, l.padding / 2)   // exactly the corner the export drew before`; in `testRecordDefaultsAreTheNeutralStyle` add `XCTAssertEqual(o.style.boxPadding, 0.25)` and `XCTAssertEqual(o.style.boxCorner, "rounded")`; in `testStyledText` add `XCTAssertEqual(l.boxRadius, 0)`.

- [ ] **Step 4:** `npx.cmd jest src/editor/model` green (the PROOF included); `npm run typecheck`; `npm test`. `OverlayText.test.tsx` and `textExport.swift.test.ts` pass unedited.
- [ ] **Step 5: Commit** — `git add src/editor/model/overlayLayout.ts src/editor/model/__tests__/overlayLayout.test.ts src/editor/model/__tests__/overlayLayout.vectors.ts modules/clipy-video/ios/OverlayLayout.swift modules/clipy-video/ios/ExportSession.swift modules/clipy-video/ios/Tests/OverlayLayoutTests.swift`; `feat(text): box padding and corner radius in the mirrored overlay layout; a v14 text keeps its numbers (proof test)`.

---

### Task 3: The twelve new looks; op tests for the box fields

**Depends on:** Task 1. **Parallel-safe with:** Tasks 2, 4, 5, 6, 7, 8.

**Files:** Modify `src/editor/textTemplates.ts`, `src/editor/__tests__/textTemplates.test.ts`, `src/editor/__tests__/TemplateStrip.test.tsx` (first test: title and count), `src/editor/model/__tests__/ops.text.test.ts` (append).

**Do not touch:** `src/editor/model/ops.ts` (no op changes — if an op test below fails, stop and report instead of editing an op), the first twelve templates and the six caption presets (not a character), `TemplateStrip.tsx`, `TextPanel.tsx` (Task 5), `fonts.ts`, `assets/`, `src/editor/timelineScroll.ts`, `Timeline.tsx`, `PreviewPlayer.tsx`, `src/editor/toolStrip.ts`, `src/publish/`, `supabase/`.

**Interfaces — Consumes:** `TextTemplatePatch`, the private `style(over)` helper in `textTemplates.ts` (it spreads `DEFAULT_TEXT_STYLE`, so every existing template already carries the default box); `setTextStyle`, `setCaptionStyleForAll`, `applyTextTemplate`, `duplicateOverlay` (`ops.ts`, unchanged).

**Interfaces — Produces**

```ts
// src/editor/textTemplates.ts
export const TEXT_TEMPLATE_IDS = ["cleanTitle", "boldPop", "neon", "subtitleBar", "comic", "retro", "handwritten", "elegant", "shadowed", "outlineOnly", "stickerLabel", "softGlow",
  "headline", "neonOutline", "softShadow", "note", "titleBar", "stamp", "bubblegum", "cinema", "gold", "chalk", "pop3d", "watermark"] as const;
// TEXT_TEMPLATES: 24 entries in that order. CAPTION_PRESET_IDS / CAPTION_PRESETS unchanged.
```

- [ ] **Step 1: Failing tests.**

`src/editor/__tests__/textTemplates.test.ts` — replace the test `"the twelve of the spec, in order, each with a label"` with:

```ts
  test("twenty-four, in order: the first twelve as they were, then the twelve of 2026-10-06", () => {
    expect(TEXT_TEMPLATE_IDS).toEqual(["cleanTitle", "boldPop", "neon", "subtitleBar", "comic", "retro", "handwritten", "elegant", "shadowed", "outlineOnly", "stickerLabel", "softGlow",
      "headline", "neonOutline", "softShadow", "note", "titleBar", "stamp", "bubblegum", "cinema", "gold", "chalk", "pop3d", "watermark"]);
    expect(Object.keys(TEXT_TEMPLATES)).toEqual([...TEXT_TEMPLATE_IDS]);
    expect(TEXT_TEMPLATE_IDS.map((id) => TEXT_TEMPLATES[id].label)).toEqual(
      ["Clean title", "Bold pop", "Neon", "Subtitle bar", "Comic", "Retro", "Handwritten", "Elegant", "Shadowed", "Outline only", "Sticker label", "Soft glow",
        "Headline", "Neon outline", "Soft shadow", "Sticky note", "Title bar", "Stamp", "Bubblegum", "Cinema", "Gold", "Chalkboard", "3D pop", "Watermark"]);
    expect(new Set(TEXT_TEMPLATE_IDS.map((id) => TEXT_TEMPLATES[id].label)).size).toBe(24);
  });
```

and add inside `describe("text templates", …)` (in `expectStyleInLimits` also add, after the existing range line, `expect(within(s.boxPadding, L.boxPadding)).toBe(true); expect(["rounded", "square"]).toContain(s.boxCorner);`):

```ts
  test("the first twelve keep the box every text had: default padding, round corners", () => {
    for (const id of TEXT_TEMPLATE_IDS.slice(0, 12)) expect(TEXT_TEMPLATES[id].patch.style).toMatchObject({ boxPadding: 0.25, boxCorner: "rounded" });
    for (const id of CAPTION_PRESET_IDS) expect(CAPTION_PRESETS[id].patch.style).toMatchObject({ boxPadding: 0.25, boxCorner: "rounded" });
  });
  test("the twelve new looks, value for value", () => {
    const t = TEXT_TEMPLATES, base = DEFAULT_TEXT_STYLE;
    expect(t.headline.patch).toEqual({ fontId: "anton", color: "#FFFFFF", background: { color: "#E10600", opacity: 1 }, outline: false,
      style: { ...base, letterSpacing: 0.04, boxPadding: 0.35, boxCorner: "square" } });
    expect(t.neonOutline.patch).toEqual({ fontId: "poppins", color: "#0B0B14", background: null, outline: true,
      style: { ...base, letterSpacing: 0.06, outlineColor: "#39FF14", outlineWidth: 2.4, glow: { color: "#39FF14", size: 0.35 } } });
    expect(t.softShadow.patch).toEqual({ fontId: "fredoka", color: "#FFF8E7", background: null, outline: false,
      style: { ...base, shadow: { color: "#3A1F5D", opacity: 0.7, distance: 0.05, blur: 0.45 } } });
    expect(t.note.patch).toEqual({ fontId: "permanentMarker", color: "#1B1B1F", background: { color: "#FFF27A", opacity: 1 }, outline: false,
      style: { ...base, lineSpacing: 1.1, boxPadding: 0.5, boxCorner: "square" } });
    expect(t.titleBar.patch).toEqual({ fontId: "oswald", color: "#FFFFFF", background: { color: "#0A1B33", opacity: 0.85 }, outline: false,
      style: { ...base, letterSpacing: 0.06, boxPadding: 0.15, boxCorner: "square" } });
    expect(t.stamp.patch).toEqual({ fontId: "bebasNeue", color: "#D7263D", background: { color: "#FFF4E0", opacity: 1 }, outline: true,
      style: { ...base, letterSpacing: 0.12, outlineColor: "#D7263D", outlineWidth: 0.8, boxPadding: 0.2 } });
    expect(t.bubblegum.patch).toEqual({ fontId: "lobster", color: "#FFFFFF", background: null, outline: true,
      style: { ...base, outlineColor: "#FF4FA3", outlineWidth: 2.5, shadow: { color: "#B0005A", opacity: 1, distance: 0.07, blur: 0 } } });
    expect(t.cinema.patch).toEqual({ fontId: "montserrat", color: "#FFFFFF", background: null, outline: false,
      style: { ...base, opacity: 0.9, letterSpacing: 0.3, lineSpacing: 1.4 } });
    expect(t.gold.patch).toEqual({ fontId: "dancingScript", color: "#F5C542", background: null, outline: false,
      style: { ...base, shadow: { color: "#5A3A00", opacity: 0.9, distance: 0.04, blur: 0.08 }, glow: { color: "#FFE9A8", size: 0.2 } } });
    expect(t.chalk.patch).toEqual({ fontId: "caveat", color: "#F4F4F5", background: { color: "#1E3B2F", opacity: 0.95 }, outline: false,
      style: { ...base, letterSpacing: 0.03, boxPadding: 0.4 } });
    expect(t.pop3d.patch).toEqual({ fontId: "righteous", color: "#FFFFFF", background: null, outline: true,
      style: { ...base, outlineColor: "#6C2BD9", outlineWidth: 2, shadow: { color: "#00E5A0", opacity: 1, distance: 0.12, blur: 0 } } });
    expect(t.watermark.patch).toEqual({ fontId: "poppins", color: "#FFFFFF", background: null, outline: false,
      style: { ...base, opacity: 0.55, letterSpacing: 0.15, lineSpacing: 1.3 } });
  });
  test("the new looks use what the first twelve did not: the box fields, three unused fonts; none carries an animation", () => {
    const fresh = TEXT_TEMPLATE_IDS.slice(12).map((id) => TEXT_TEMPLATES[id].patch);
    expect(fresh.filter((p) => p.style.boxPadding !== 0.25 || p.style.boxCorner !== "rounded")).toHaveLength(5);
    const oldFonts = new Set(TEXT_TEMPLATE_IDS.slice(0, 12).map((id) => TEXT_TEMPLATES[id].patch.fontId));
    expect(fresh.map((p) => p.fontId).filter((f) => !oldFonts.has(f))).toEqual(["permanentMarker", "lobster", "dancingScript"]);
    expect(fresh.every((p) => p.animation === undefined)).toBe(true);
  });
```

(add `DEFAULT_TEXT_STYLE` to the file's `../model/types` import). The existing `test.each` ("is a complete, valid patch"), "every template looks different" and "the looks named in the design" run over all 24 unedited.

`src/editor/__tests__/TemplateStrip.test.tsx` — first test: title `"twenty-four template tiles, each 72 pt wide with its label and an \"Aa\" sample in the template's look"`, and `toBeGreaterThanOrEqual(12)` → `toBeGreaterThanOrEqual(24)`. Append to it: `expect(screen.getByRole("button", { name: "Sticky note" })).toBeTruthy(); expect(screen.getByTestId("overlay-glow-tile-neonOutline", { includeHiddenElements: true })).toHaveStyle({ color: "#39FF14" });`.

`src/editor/model/__tests__/ops.text.test.ts` — append (the block brings its own fixture and `styleOf`; it uses none of the file's helpers):

```ts
describe("the box fields go through the existing ops (no op changed for them)", () => {
  const base = makeProject({ clips: [makeClip({ id: "a", sourceDuration: 10 })], overlays: [
    makeOverlay({ id: "t", text: "Hi", start: 0, end: 3, background: { color: "#000000", opacity: 0.6 } }),
    makeOverlay({ id: "c1", kind: "caption", text: "one", start: 0, end: 1 }), makeOverlay({ id: "c2", kind: "caption", text: "two", start: 1, end: 2 }),
    makeSticker({ id: "s", start: 0, end: 3 }),
  ] });
  const styleOf = (p: Project, id: string) => (p.overlays.find((o) => o.id === id) as TextOverlay).style;

  test("setTextStyle: padding is stored with two decimals and clamped; the corner is one of the two ids; the rest of the style stays", () => {
    const a = setTextStyle(base, "t", { boxPadding: 0.456, boxCorner: "square" });
    expect(styleOf(a, "t")).toEqual({ ...DEFAULT_TEXT_STYLE, boxPadding: 0.46, boxCorner: "square" });
    expect(styleOf(setTextStyle(a, "t", { boxPadding: 9 }), "t").boxPadding).toBe(0.6);
    expect(styleOf(setTextStyle(a, "t", { boxPadding: -3 }), "t").boxPadding).toBe(0);
    expect(styleOf(setTextStyle(a, "t", { boxCorner: "pill" as never }), "t").boxCorner).toBe("rounded");
    expect((a.overlays[0] as TextOverlay).background).toEqual({ color: "#000000", opacity: 0.6 });      // the box itself is not the style's
  });
  test("setTextStyle: the same project when nothing changes; refused for a sticker", () => {
    expect(setTextStyle(base, "t", { boxPadding: 0.25, boxCorner: "rounded" })).toBe(base);
    expect(setTextStyle(base, "t", { boxPadding: 0.2501 })).toBe(base);                                 // rounds to the stored 0.25
    expect(setTextStyle(base, "s", { boxCorner: "square" })).toBe(base);
    expect(setTextStyle(base, "t", { boxPadding: undefined })).toBe(base);
  });
  test("setCaptionStyleForAll writes every caption and leaves texts alone; same project when nothing changes", () => {
    const a = setCaptionStyleForAll(base, { style: { boxPadding: 0.1, boxCorner: "square" } });
    expect([styleOf(a, "c1"), styleOf(a, "c2")].map((s) => [s.boxPadding, s.boxCorner])).toEqual([[0.1, "square"], [0.1, "square"]]);
    expect(styleOf(a, "t")).toEqual(DEFAULT_TEXT_STYLE);
    expect(setCaptionStyleForAll(a, { style: { boxCorner: "square" } })).toBe(a);
  });
  test("duplicateOverlay copies the box fields into the copy's own style", () => {
    const a = duplicateOverlay(setTextStyle(base, "t", { boxPadding: 0.5, boxCorner: "square" }), "t");
    const [src, copy] = a.overlays as TextOverlay[];
    expect(copy.style).toEqual(src.style);
    expect(copy.style).not.toBe(src.style);
  });
  test("applyTextTemplate replaces the whole look, the box fields included: a new look sets them, an old look resets them", () => {
    const note = applyTextTemplate(base, "t", "note");
    expect(styleOf(note, "t")).toEqual(TEXT_TEMPLATES.note.patch.style);
    expect((note.overlays[0] as TextOverlay).background).toEqual({ color: "#FFF27A", opacity: 1 });
    const back = applyTextTemplate(note, "t", "subtitleBar");
    expect(styleOf(back, "t")).toMatchObject({ boxPadding: 0.25, boxCorner: "rounded" });
    expect(applyTextTemplate(note, "t", "note")).toBe(note);
  });
});
```

(make sure `duplicateOverlay`, `setCaptionStyleForAll`, `applyTextTemplate`, `setTextStyle`, `makeSticker`, `makeClip`, `DEFAULT_TEXT_STYLE`, `type Project`, `type TextOverlay` are imported in that file.)

- [ ] **Step 2: Run** `npx.cmd jest src/editor/__tests__/textTemplates.test.ts src/editor/__tests__/TemplateStrip.test.tsx src/editor/model/__tests__/ops.text.test.ts` → the template tests FAIL (twelve ids); in the ops block only `applyTextTemplate … "note"` fails (no such template), **the other four must already PASS** — the ops are generic. If one of those four fails, stop and report.
- [ ] **Step 3: Implement** — `src/editor/textTemplates.ts`: the file's first comment says `(twenty-four)`; `TEXT_TEMPLATE_IDS` as in Produces; append to `TEXT_TEMPLATES`, after `softGlow`, exactly:

```ts
  // ---- 2026-10-06: twelve more. They use the box fields (padding, corner) and the fonts the first twelve left out. ----
  // Heavy white letters on a solid red block with square corners: a news headline.
  headline: { label: "Headline", patch: { fontId: "anton", color: "#FFFFFF", background: { color: "#E10600", opacity: 1 }, outline: false,
    style: style({ letterSpacing: 0.04, boxPadding: 0.35, boxCorner: "square" }) } },
  // Near-black letters traced with an electric green line that glows.
  neonOutline: { label: "Neon outline", patch: { fontId: "poppins", color: "#0B0B14", background: null, outline: true,
    style: style({ letterSpacing: 0.06, outlineColor: "#39FF14", outlineWidth: 2.4, glow: { color: "#39FF14", size: 0.35 } }) } },
  // Rounded cream letters floating on a wide, soft violet shadow.
  softShadow: { label: "Soft shadow", patch: { fontId: "fredoka", color: "#FFF8E7", background: null, outline: false,
    style: style({ shadow: { color: "#3A1F5D", opacity: 0.7, distance: 0.05, blur: 0.45 } }) } },
  // Dark marker handwriting on a square yellow sticky note with wide margins.
  note: { label: "Sticky note", patch: { fontId: "permanentMarker", color: "#1B1B1F", background: { color: "#FFF27A", opacity: 1 }, outline: false,
    style: style({ lineSpacing: 1.1, boxPadding: 0.5, boxCorner: "square" }) } },
  // Condensed white text on a tight, square, dark-blue strip: a TV name strap.
  titleBar: { label: "Title bar", patch: { fontId: "oswald", color: "#FFFFFF", background: { color: "#0A1B33", opacity: 0.85 }, outline: false,
    style: style({ letterSpacing: 0.06, boxPadding: 0.15, boxCorner: "square" }) } },
  // Wide-spaced red capitals, inked thicker by an outline of their own colour, on a cream label: a rubber stamp.
  stamp: { label: "Stamp", patch: { fontId: "bebasNeue", color: "#D7263D", background: { color: "#FFF4E0", opacity: 1 }, outline: true,
    style: style({ letterSpacing: 0.12, outlineColor: "#D7263D", outlineWidth: 0.8, boxPadding: 0.2 }) } },
  // White script with a thick pink edge and a hard, darker pink drop.
  bubblegum: { label: "Bubblegum", patch: { fontId: "lobster", color: "#FFFFFF", background: null, outline: true,
    style: style({ outlineColor: "#FF4FA3", outlineWidth: 2.5, shadow: { color: "#B0005A", opacity: 1, distance: 0.07, blur: 0 } }) } },
  // Thin white letters spaced very far apart, a little see-through: film credits.
  cinema: { label: "Cinema", patch: { fontId: "montserrat", color: "#FFFFFF", background: null, outline: false,
    style: style({ opacity: 0.9, letterSpacing: 0.3, lineSpacing: 1.4 }) } },
  // Golden flowing script with a warm glow and a small brown shadow.
  gold: { label: "Gold", patch: { fontId: "dancingScript", color: "#F5C542", background: null, outline: false,
    style: style({ shadow: { color: "#5A3A00", opacity: 0.9, distance: 0.04, blur: 0.08 }, glow: { color: "#FFE9A8", size: 0.2 } }) } },
  // Chalk-white handwriting on a dark green board with round corners.
  chalk: { label: "Chalkboard", patch: { fontId: "caveat", color: "#F4F4F5", background: { color: "#1E3B2F", opacity: 0.95 }, outline: false,
    style: style({ letterSpacing: 0.03, boxPadding: 0.4 }) } },
  // White letters, a purple edge and a hard mint-green copy behind: a two-colour 3D look.
  pop3d: { label: "3D pop", patch: { fontId: "righteous", color: "#FFFFFF", background: null, outline: true,
    style: style({ outlineColor: "#6C2BD9", outlineWidth: 2, shadow: { color: "#00E5A0", opacity: 1, distance: 0.12, blur: 0 } }) } },
  // Half see-through white, widely spaced: a watermark that sits quietly on the picture.
  watermark: { label: "Watermark", patch: { fontId: "poppins", color: "#FFFFFF", background: null, outline: false,
    style: style({ opacity: 0.55, letterSpacing: 0.15, lineSpacing: 1.3 }) } },
```

- [ ] **Step 4:** `npm run typecheck`; `npm test` (`TextPanel.style.test.tsx`, `ops.templates.test.ts`, `store.templates.test.ts` pass unedited — "Neon" still names one button: role names match exactly).
- [ ] **Step 5: Commit** — `git add src/editor/textTemplates.ts src/editor/__tests__/textTemplates.test.ts src/editor/__tests__/TemplateStrip.test.tsx src/editor/model/__tests__/ops.text.test.ts`; `feat(text): twelve more one-tap looks; the box fields go through the existing style ops`.

---

### Task 4: Preview — the box in `OverlayText`, the layer cap

**Depends on:** Task 2. **Parallel-safe with:** Tasks 3, 5, 6, 7, 8.

**Files:** Modify `src/editor/components/OverlayText.tsx`; create `src/editor/__tests__/OverlayText.box.test.tsx`.

**Do not touch:** `src/editor/__tests__/OverlayText.test.tsx` (it must pass **unedited** — that is part of the proof), `OverlayLayer.tsx`, `SelectionFrame.tsx`, `TemplateStrip.tsx`, `StickerView.tsx`, `overlayLayout.ts`, `src/editor/timelineScroll.ts`, `Timeline.tsx`, `PreviewPlayer.tsx`, `src/editor/toolStrip.ts`, `src/publish/`, `supabase/`.

**Interfaces — Consumes:** `layoutOverlay(o, frameW, frameH).padding / .boxRadius` (Task 2).

**Interfaces — Produces:** `OverlayText` — same props. Two new test ids: the padded body `overlay-body-<id>` (`overlay-base-body-<id>` on the `frameOnly` copy) and the background `overlay-box-<id>`. No new layer, no new prop.

- [ ] **Step 1: Failing tests** — create `src/editor/__tests__/OverlayText.box.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import { DEFAULT_TEXT_STYLE, makeOverlay, type TextOverlay, type TextStyle } from "@/src/editor/model/types";
import { CAPTION_PRESET_IDS, CAPTION_PRESETS, TEXT_TEMPLATE_IDS, TEXT_TEMPLATES } from "@/src/editor/textTemplates";
import { OverlayText } from "../components/OverlayText";

// Frame 200 × 400, fontScale 0.1 → font 40 px: default padding 0.25 × 40 = 10 px, round corner 10 × 0.5 = 5 px.
const W = 200, H = 400;
const hidden = { includeHiddenElements: true };
const flat = (el: { props: { style?: unknown } }) => (StyleSheet.flatten(el.props.style as object) ?? {}) as Record<string, number | string>;
const boxed = (style: Partial<TextStyle> = {}, p: Partial<TextOverlay> = {}) => makeOverlay({ id: "t", text: "Hello", fontScale: 0.1, color: "#FFFFFF", outline: false, start: 0, end: 5,
  background: { color: "#112233", opacity: 0.4 }, style: { ...DEFAULT_TEXT_STYLE, ...style }, ...p });
type Json = { type: string; children?: (Json | string)[] | null };
const countTexts = (n: Json | string | null): number => n === null || typeof n === "string" ? 0 : (n.type === "Text" ? 1 : 0) + (n.children ?? []).reduce((sum: number, c) => sum + countTexts(c), 0);
const show = (o: TextOverlay, frameOnly = false) => render(<OverlayText overlay={o} frameW={W} frameH={H} frameOnly={frameOnly} />);

test("the default box is the box from before: padding a quarter of the font size, corners half of that", async () => {
  await show(boxed());
  expect(flat(screen.getByTestId("overlay-body-t"))).toMatchObject({ padding: 10, borderRadius: 5, maxWidth: 180 });
  expect(flat(screen.getByTestId("overlay-box-t", hidden))).toMatchObject({ backgroundColor: "#112233", opacity: 0.4, borderRadius: 5 });
});

test("square corners; a wider and a zero padding; the round corner does not follow the padding", async () => {
  const a = await show(boxed({ boxCorner: "square", boxPadding: 0.5 }));
  expect(flat(screen.getByTestId("overlay-body-t"))).toMatchObject({ padding: 20, borderRadius: 0 });
  expect(flat(screen.getByTestId("overlay-box-t", hidden))).toMatchObject({ borderRadius: 0 });
  await a.rerender(<OverlayText overlay={boxed({ boxPadding: 0 })} frameW={W} frameH={H} />);
  expect(flat(screen.getByTestId("overlay-body-t"))).toMatchObject({ padding: 0, borderRadius: 5 });
  await a.rerender(<OverlayText overlay={boxed({ boxPadding: 0.6 })} frameW={W} frameH={H} />);
  expect(flat(screen.getByTestId("overlay-body-t"))).toMatchObject({ padding: 24, borderRadius: 5 });
});

test("no background: no box and no padding, whatever the style says", async () => {
  await show(boxed({ boxPadding: 0.5, boxCorner: "square" }, { background: null }));
  expect(screen.queryByTestId("overlay-box-t", hidden)).toBeNull();
  expect(flat(screen.getByTestId("overlay-body-t"))).toMatchObject({ padding: 0, borderRadius: 0 });
});

test("the under-layers move with the padding: each starts `room` px outside the fill and pads the same back in", async () => {
  // Shadow: offset 0.1 × 40 × 0.7071 = 2.8284 px, blur 0.25 × 40 = 10 px → room = ceil(12.8284) = 13 px. Padding 0.5 × 40 = 20 px → inset 20 − 13 = 7.
  const shadow = { color: "#0000FF", opacity: 0.6, distance: 0.1, blur: 0.25 };
  const a = await show(boxed({ boxPadding: 0.5, shadow }));
  expect(flat(screen.getByTestId("overlay-shadow-t", hidden))).toMatchObject({ left: 7, top: 7, right: 7, bottom: 7, padding: 13 });
  await a.rerender(<OverlayText overlay={boxed({ boxPadding: 0, shadow })} frameW={W} frameH={H} />);
  expect(flat(screen.getByTestId("overlay-shadow-t", hidden))).toMatchObject({ left: -13, top: -13, right: -13, bottom: -13, padding: 13 });
});

test("the unseen frame copy measures the same box, so the selection frame follows the padding and the corner", async () => {
  await show(boxed({ boxPadding: 0.5, boxCorner: "square" }), true);
  expect(flat(screen.getByTestId("overlay-base-body-t"))).toMatchObject({ padding: 20, borderRadius: 0, maxWidth: 180 });
  expect(screen.queryByTestId("overlay-box-t", hidden)).toBeNull();          // the copy draws nothing
});

test("letter spacing and line height are the same on every layer, the frame copy included: all wrap alike", async () => {
  const style = { letterSpacing: 0.1, lineSpacing: 1.5, shadow: { color: "#0000FF", opacity: 0.6, distance: 0.1, blur: 0.25 }, glow: { color: "#FF0000", size: 0.5 } };
  const a = await show(boxed(style, { outline: true }));
  const metrics = (el: { props: { style?: unknown } }) => { const s = flat(el); return [s.fontFamily, s.fontSize, s.lineHeight, s.letterSpacing, s.textAlign]; };
  const want = ["Bangers_400Regular", 40, 72, 4, "center"];                   // line height 1.2 × 40 × 1.5; letter spacing 0.1 × 40
  for (const id of ["overlay-glow-t", "overlay-shadow-t", "overlay-outline-t"]) expect(metrics(screen.getByTestId(id, hidden))).toEqual(want);
  expect(metrics(screen.getByText("Hello"))).toEqual(want);
  await a.rerender(<OverlayText overlay={boxed(style, { outline: true })} frameW={W} frameH={H} frameOnly />);
  expect(metrics(screen.getByText("Hello", hidden))).toEqual(want);
});

test("THE CAP: glow + shadow + outline + fill is four text layers, and the thickest, blurriest values add none", async () => {
  await show(boxed({ outlineWidth: 3, shadow: { color: "#000000", opacity: 1, distance: 0.3, blur: 0.5 }, glow: { color: "#FFFFFF", size: 0.6 } }, { outline: true }));
  expect(countTexts(screen.toJSON() as Json | null)).toBe(4);
  expect(screen.getAllByTestId("overlay-box-t", hidden)).toHaveLength(1);
});

test.each([...TEXT_TEMPLATE_IDS.map((id) => [id, TEXT_TEMPLATES[id].patch] as const), ...CAPTION_PRESET_IDS.map((id) => [id, CAPTION_PRESETS[id].patch] as const)])(
  "%s draws at most four text layers and at most one box", async (_id, look) => {
    await show(makeOverlay({ id: "t", text: "Aa", fontId: look.fontId, color: look.color, background: look.background, outline: look.outline, style: look.style }));
    expect(countTexts(screen.toJSON() as Json | null)).toBeLessThanOrEqual(4);
    expect(screen.queryAllByTestId("overlay-box-t", hidden)).toHaveLength(look.background ? 1 : 0);
  });
```

- [ ] **Step 2: Run** `npx.cmd jest src/editor/__tests__/OverlayText.box.test.tsx` → FAIL (no such test ids; the corner still follows the padding).
- [ ] **Step 3: Implement** — `src/editor/components/OverlayText.tsx`, three edits in the returned tree and nothing else:
  - the padded `View`: `<View testID={frameOnly ? `overlay-base-body-${o.id}` : `overlay-body-${o.id}`} style={{ position: "absolute", maxWidth: l.maxWidth, padding: l.padding, borderRadius: l.boxRadius }}>`;
  - the background `View`: add `testID={`overlay-box-${o.id}`}` and `borderRadius: l.boxRadius` in place of `l.padding / 2`;
  - in the doc comment, add: `The box's padding and corner radius come from the layout (style.boxPadding / boxCorner); with the default style they are the old 0.25 × font and padding / 2.`
  No `l.padding / 2` is left in the file. No new layer; `room`, `inset`, `under`, `metrics` are untouched.
- [ ] **Step 4:** `npx.cmd jest src/editor/__tests__/OverlayText` — the new file green **and `OverlayText.test.tsx` green without an edit** (if it is red, the change is wrong). `npm run typecheck`; `npm test`. `git diff --stat -- src/editor/__tests__/OverlayText.test.tsx` prints nothing.
- [ ] **Step 5: Commit** — `git add src/editor/components/OverlayText.tsx src/editor/__tests__/OverlayText.box.test.tsx`; `feat(preview): the text box takes its padding and corner from the layout; at most four text layers per text`.

---

### Task 5: Text panel and Caption style — the five rows

**Depends on:** Task 1. **Parallel-safe with:** Tasks 2, 3, 4, 6, 7, 8.

**Files:** Modify `src/editor/components/TextStyleSection.tsx` (rewritten), `src/editor/components/TextPanel.tsx`, `src/editor/components/CaptionStyleSheet.tsx`, `src/editor/__tests__/TextStyleSection.test.tsx`, `src/editor/__tests__/TextPanel.style.test.tsx`, `src/editor/__tests__/CaptionStyleSheet.test.tsx`; create `src/editor/__tests__/TextPanel.sections.test.tsx`.

**Do not touch:** the typing-undo logic in `TextPanel.tsx` (`typing`, `type`, and its comment), `placement` / Fine-tune / Duplicate / Delete, `ColorRow.tsx`, `FontStrip.tsx`, `TemplateStrip.tsx`, `src/ui/` (nothing is added to the kit), `ops.ts`, `OverlayText.tsx` (Task 4), `src/editor/timelineScroll.ts`, `Timeline.tsx`, `PreviewPlayer.tsx`, `src/editor/toolStrip.ts`, `src/publish/`, `supabase/`.

**Interfaces — Consumes:** `setTextStyle(p, id, patch: Partial<TextStyle>)`, `updateOverlay(p, id, patch)`, `setCaptionStyleForAll(p, patch: CaptionStylePatch)` (`ops.ts`); `BOX_CORNERS`, `BoxCorner`, `TEXT_STYLE_LIMITS.boxPadding`, `DEFAULT_SHADOW`, `DEFAULT_GLOW` (`types.ts`); kit `Slider`, `Chip` (`{ label, selected, onPress }`), `PressableScale`, `Body` (`weight="semi"`), `ValueLabel` (`{ label, value }` — one text); `ColorRow` (`{ value, onChange }`), `CONTENT_BLACK` (`ColorRow.tsx`); Ionicons `chevron-down-outline` / `chevron-up-outline`; `theme.size.touch` (44), `theme.size.icon.md`, `theme.space`.

**Interfaces — Produces**

```ts
// src/editor/components/TextStyleSection.tsx — `CollapsibleTextStyle` is REMOVED (its two users are this task's)
export type TextBox = { color: string; opacity: number };
export const BOX_OPACITY_RANGE: readonly [0.2, 1];
export const NEW_BOX: TextBox;                       // { color: CONTENT_BLACK, opacity: 0.6 } — what Background switched on gives
export function TextStyleSection(props: {
  style: TextStyle; outline: boolean; background: TextBox | null;
  onBegin: () => void;                               // a slider drag starts: the owner opens one undo step
  onPatch: (patch: Partial<TextStyle>) => void;      // one undo step: a switch, a colour, a chip
  onPatchTransient: (patch: Partial<TextStyle>) => void;
  onOutline: (on: boolean) => void;
  onBackground: (box: TextBox | null) => void;       // one undo step: the switch, the box colour
  onBackgroundTransient: (box: TextBox) => void;     // while the box opacity slider is dragged
  boxOpacityTestID: string;                          // "opacity-slider" (Text panel) / "caption-opacity-slider" (Caption style) — their names since before
}): React.JSX.Element;
```

Accessibility names: the four switches keep `"Outline"`, `"Shadow"`, `"Background"`, `"Glow"`; the row buttons are `"Outline options"`, `"Shadow options"`, `"Background options"`, `"Glow options"`, `"Spacing and opacity"`. Test ids: `style-sections`; the open bodies `style-outline`, `style-shadow`, `style-box`, `style-spacing`, `style-glow`; kept: `style-opacity-slider`, `style-letter-spacing-slider`, `style-line-spacing-slider`, `style-outline-color`, `style-outline-width-slider`, `style-shadow-color`, `style-shadow-opacity-slider`, `style-shadow-distance-slider`, `style-shadow-blur-slider`, `style-glow-color`, `style-glow-size-slider`; new: `style-box-color`, `style-box-padding-slider`.

**Behaviour (spec §8.1).** Every row is 44 pt. All five are **closed when the component mounts**, whatever is switched on. A row that is on (and "Spacing and opacity", always) shows a chevron and opens / closes on a tap of its name; a row that is off is a disabled button with no chevron. Turning a switch **on opens** its row, **off closes** it. Nothing animates.

- [ ] **Step 1: Failing tests.**

Create `src/editor/__tests__/TextPanel.sections.test.tsx`:

```tsx
import { act, fireEvent, render, screen, within } from "@testing-library/react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
jest.mock("@react-native-community/slider", () => { const { View } = require("react-native"); return ({ testID, onSlidingStart, onValueChange, onSlidingComplete }: { testID?: string; onSlidingStart?: () => void; onValueChange?: (v: number) => void; onSlidingComplete?: (v: number) => void }) => <View testID={testID} onTouchStart={() => onSlidingStart?.()} onTouchMove={(v: number) => onValueChange?.(v)} onTouchEnd={(v: number) => onSlidingComplete?.(v)} />; });
import { DEFAULT_SHADOW, DEFAULT_TEXT_STYLE, isTextOverlay, makeClip, makeOverlay, makeProject, type TextOverlay } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { theme } from "@/src/theme/theme";
import { TextPanel } from "../components/TextPanel";

// A text as schema v14 left it after the migration: outline on (the default), a black box, the default style.
const p = makeProject({ clips: [makeClip({ id: "a", sourceDuration: 10 })], overlays: [makeOverlay({ id: "o1", text: "Hi", start: 1, end: 4, background: { color: "#000000", opacity: 0.6 } })] });
beforeEach(() => { useEditorStore.getState().reset(); useEditorStore.getState().setProject(p); });
const ov = (): TextOverlay => { const o = useEditorStore.getState().project!.overlays[0]; if (!isTextOverlay(o)) throw new Error("expected a text"); return o; };
const past = () => useEditorStore.getState().past.length;
const show = () => render(<TextPanel overlayId="o1" visible onClose={() => {}} />);
const tap = (name: string) => fireEvent.press(screen.getByRole("button", { name }));
async function drag(testID: string, values: number[]) {
  const slider = screen.getByTestId(testID);
  await fireEvent(slider, "touchStart");
  for (const v of values) await fireEvent(slider, "touchMove", v);
  await fireEvent(slider, "touchEnd", values[values.length - 1]);
}
const BODIES = ["style-outline", "style-shadow", "style-box", "style-spacing", "style-glow"];

test("five rows, all closed when the panel opens: four switches, no controls, no Style button", async () => {
  await show();
  for (const name of ["Outline", "Shadow", "Background", "Glow"]) expect(screen.getByLabelText(name)).toBeTruthy();
  expect(screen.getByLabelText("Outline").props.value).toBe(true);
  expect(screen.getByLabelText("Shadow").props.value).toBe(false);
  for (const id of BODIES) expect(screen.queryByTestId(id)).toBeNull();
  expect(screen.queryByRole("button", { name: "Style" })).toBeNull();
  for (const name of ["Outline options", "Background options", "Spacing and opacity"]) {
    expect(screen.getByRole("button", { name })).toHaveStyle({ height: theme.size.touch });
    expect(screen.getByRole("button", { name }).props.accessibilityState).toMatchObject({ expanded: false });
  }
  expect(screen.getByRole("button", { name: "Shadow options" })).toBeDisabled();       // off: nothing to open
  expect(screen.getByRole("button", { name: "Glow options" })).toBeDisabled();
  expect(screen.getAllByLabelText("Color #F5C542")).toHaveLength(1);                      // only the text colour row is drawn
});

test("a row opens from its name and closes again; the others stay as they are", async () => {
  await show();
  await tap("Outline options");
  expect(screen.getByTestId("style-outline-width-slider")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Outline options" }).props.accessibilityState).toMatchObject({ expanded: true });
  await tap("Spacing and opacity");
  for (const id of ["style-opacity-slider", "style-letter-spacing-slider", "style-line-spacing-slider"]) expect(screen.getByTestId(id)).toBeTruthy();
  expect(screen.getByTestId("style-outline")).toBeTruthy();
  await tap("Outline options");
  expect(screen.queryByTestId("style-outline")).toBeNull();
  expect(screen.getByTestId("style-spacing")).toBeTruthy();
  expect(past()).toBe(0);                                                                // opening and closing is not an edit
});

test("switching a row on opens it (one undo step); off closes it", async () => {
  await show();
  await fireEvent(screen.getByLabelText("Shadow"), "valueChange", true);
  expect(ov().style.shadow).toEqual(DEFAULT_SHADOW);
  expect(past()).toBe(1);
  expect(screen.getByTestId("style-shadow-blur-slider")).toBeTruthy();
  await fireEvent(screen.getByLabelText("Shadow"), "valueChange", false);
  expect(screen.queryByTestId("style-shadow")).toBeNull();
  expect(past()).toBe(2);
  await fireEvent(screen.getByLabelText("Outline"), "valueChange", false);
  expect(ov().outline).toBe(false);
  expect(screen.getByRole("button", { name: "Outline options" })).toBeDisabled();
});

test("Background: an old text shows Rounded; Square is ONE undo step and undo brings Rounded back", async () => {
  await show();
  await tap("Background options");
  expect(screen.getByRole("button", { name: "Rounded" })).toBeSelected();
  expect(screen.getByRole("button", { name: "Square" })).not.toBeSelected();
  expect(screen.getByText("Padding 25")).toBeTruthy();
  expect(screen.getByText("Box opacity 60 %")).toBeTruthy();
  await tap("Square");
  expect(ov().style).toEqual({ ...DEFAULT_TEXT_STYLE, boxCorner: "square" });
  expect(past()).toBe(1);
  expect(screen.getByRole("button", { name: "Square" })).toBeSelected();
  await act(() => { useEditorStore.getState().undo(); });
  expect(ov().style).toEqual(DEFAULT_TEXT_STYLE);
  await tap("Rounded");                                                                   // already rounded: nothing changes, no undo step
  expect(past()).toBe(0);
});

test("a Padding drag is ONE undo step, stored with two decimals and clamped to 0–60", async () => {
  await show();
  await tap("Background options");
  await drag("style-box-padding-slider", [0.3, 0.4, 0.456]);
  expect(ov().style.boxPadding).toBe(0.46);
  expect(past()).toBe(1);
  expect(screen.getByText("Padding 46")).toBeTruthy();
  await drag("style-box-padding-slider", [0.5, 9]);
  expect(ov().style.boxPadding).toBe(0.6);
  expect(past()).toBe(2);
  await act(() => { useEditorStore.getState().undo(); useEditorStore.getState().undo(); });
  expect(ov().style.boxPadding).toBe(0.25);
});

test("the box opacity slider keeps its test id and is one undo step; a box colour keeps the opacity", async () => {
  await show();
  await tap("Background options");
  await drag("opacity-slider", [0.3, 0.5, 0.9]);
  expect(ov().background).toEqual({ color: "#000000", opacity: 0.9 });
  expect(past()).toBe(1);
  expect(screen.getByText("Box opacity 90 %")).toBeTruthy();
  await fireEvent.press(within(screen.getByTestId("style-box-color")).getByLabelText("Color #F5C542"));
  expect(ov().background).toEqual({ color: "#F5C542", opacity: 0.9 });
  expect(past()).toBe(2);
  expect(ov().color).toBe("#F4F4F5");                                                    // the text's own colour was not touched
});

test("Background off removes the box and closes the row; the style keeps its padding and corner for the next time", async () => {
  await show();
  await tap("Background options");
  await tap("Square");
  await fireEvent(screen.getByLabelText("Background"), "valueChange", false);
  expect(ov().background).toBeNull();
  expect(ov().style.boxCorner).toBe("square");
  expect(screen.queryByTestId("style-box")).toBeNull();
  await fireEvent(screen.getByLabelText("Background"), "valueChange", true);
  expect(ov().background).toEqual({ color: "#000000", opacity: 0.6 });
  expect(screen.getByRole("button", { name: "Square" })).toBeSelected();
});

test("a caption gets the same rows (no looks row); the panel is still one vertical scroll without scroll handlers", async () => {
  useEditorStore.getState().setProject({ ...p, overlays: [makeOverlay({ id: "o1", kind: "caption", text: "Cap", start: 1, end: 4, background: { color: "#000000", opacity: 0.6 } })] });
  await show();
  expect(screen.queryByTestId("template-strip")).toBeNull();
  await tap("Background options");
  await tap("Square");
  expect(ov().style.boxCorner).toBe("square");
  const scroll = screen.getByTestId("text-panel-scroll");
  expect(scroll.props.horizontal).toBeFalsy();
  expect(Object.keys(scroll.props).filter((k) => /^on.*Scroll/.test(k))).toEqual([]);
});
```

`src/editor/__tests__/TextStyleSection.test.tsx` — edits:
1. Imports: `import { TextStyleSection, type TextBox } from "../components/TextStyleSection";` (no `CollapsibleTextStyle`).
2. Replace the mocks-and-`show` block (the lines from `const onBegin = jest.fn()…` to the end of `show`) with:

```tsx
const onBegin = jest.fn(), onPatch = jest.fn(), onPatchTransient = jest.fn(), onOutline = jest.fn(), onBackground = jest.fn(), onBackgroundTransient = jest.fn();
beforeEach(() => { for (const f of [onBegin, onPatch, onPatchTransient, onOutline, onBackground, onBackgroundTransient]) f.mockClear(); });
const section = (style: Partial<TextStyle> = {}, outline = false, background: TextBox | null = null) => (
  <TextStyleSection style={{ ...DEFAULT_TEXT_STYLE, ...style }} outline={outline} background={background} boxOpacityTestID="opacity-slider"
    onBegin={onBegin} onPatch={onPatch} onPatchTransient={onPatchTransient} onOutline={onOutline} onBackground={onBackground} onBackgroundTransient={onBackgroundTransient} />
);
/** Every row that can be opened, opened (a row that is off is a disabled button: pressing it does nothing). */
const openAll = async () => { for (const b of screen.getAllByRole("button", { name: / options$|^Spacing and opacity$/ })) await fireEvent.press(b); };
const show = async (style: Partial<TextStyle> = {}, outline = false, background: TextBox | null = null) => { const view = await render(section(style, outline, background)); await openAll(); return view; };
```

3. The two `view.rerender(<TextStyleSection … />)` calls become `view.rerender(section({ shadow: { ...DEFAULT_SHADOW } }))` and `view.rerender(section({ glow: { ...DEFAULT_GLOW } }))`.
4. Replace the last two tests (`"the collapsible block is closed until its row is pressed"`, `"the Style toggle has hit slop"`) with:

```tsx
test("every row is closed until asked for; Spacing and opacity opens and closes from its row", async () => {
  await render(section({ shadow: { ...DEFAULT_SHADOW } }, true, { color: "#000000", opacity: 0.6 }));
  for (const id of ["style-outline", "style-shadow", "style-box", "style-spacing", "style-glow"]) expect(screen.queryByTestId(id)).toBeNull();
  await fireEvent.press(screen.getByRole("button", { name: "Spacing and opacity" }));
  expect(screen.getByTestId("style-opacity-slider")).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: "Spacing and opacity" }));
  expect(screen.queryByTestId("style-opacity-slider")).toBeNull();
});

test("the Outline and Background switches report to their own callbacks; a new box is black at 60 %", async () => {
  await show();
  await fireEvent(screen.getByLabelText("Outline"), "valueChange", true);
  expect(onOutline).toHaveBeenLastCalledWith(true);
  await fireEvent(screen.getByLabelText("Background"), "valueChange", true);
  expect(onBackground).toHaveBeenLastCalledWith({ color: "#000000", opacity: 0.6 });
  expect(onPatch).not.toHaveBeenCalled();
});

test("the box controls: corner chips patch the style, padding drags transiently, the opacity drag sends the whole box", async () => {
  await show({ boxPadding: 0.3 }, false, { color: "#2E86AB", opacity: 0.8 });
  expect(screen.getByText("Padding 30")).toBeTruthy();
  expect(screen.getByText("Box opacity 80 %")).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: "Square" }));
  expect(onPatch).toHaveBeenLastCalledWith({ boxCorner: "square" });
  await drag("style-box-padding-slider", [0.4, 0.5]);
  expect(onPatchTransient).toHaveBeenLastCalledWith({ boxPadding: 0.5 });
  await drag("opacity-slider", [0.5]);
  expect(onBackgroundTransient).toHaveBeenLastCalledWith({ color: "#2E86AB", opacity: 0.5 });
  expect(onBegin).toHaveBeenCalledTimes(2);
  await fireEvent.press(within(screen.getByTestId("style-box-color")).getByLabelText("Color #C8102E"));
  expect(onBackground).toHaveBeenLastCalledWith({ color: "#C8102E", opacity: 0.8 });
  for (const id of ["style-box-padding-slider", "opacity-slider"]) expect(screen.getByTestId(id).props.step).toBe(0.01);
  await fireEvent(screen.getByLabelText("Background"), "valueChange", false);      // off: reported, and the row closes
  expect(onBackground).toHaveBeenLastCalledWith(null);
});
```

Every other test in that file stays as written (they now run with every row open).

`src/editor/__tests__/TextPanel.style.test.tsx` — three edits: (a) the `open` helper becomes `const open = async () => { await render(<TextPanel overlayId="o1" visible onClose={() => {}} />); for (const b of screen.getAllByRole("button", { name: / options$|^Spacing and opacity$/ })) await fireEvent.press(b); };`; (b) the first test becomes

```tsx
test("the style rows are closed until asked for", async () => {
  await render(<TextPanel overlayId="o1" visible onClose={() => {}} />);
  expect(screen.queryByTestId("style-opacity-slider")).toBeNull();
  await fireEvent.press(screen.getByRole("button", { name: "Spacing and opacity" }));
  expect(screen.getByTestId("style-opacity-slider")).toBeTruthy();
});
```

(c) in `"a caption has no template strip (templates are for texts)"`: `{ name: "Style" }` → `{ name: "Spacing and opacity" }`.

`src/editor/__tests__/CaptionStyleSheet.test.tsx` — three edits: (a) in the test that drags `"caption-opacity-slider"` (line 39), add directly before the drag `await fireEvent.press(screen.getByRole("button", { name: "Background options" }));`; (b) and (c) the two `{ name: "Style" }` (lines 91 and 160) → `{ name: "Spacing and opacity" }`.

- [ ] **Step 2: Run** `npx.cmd jest src/editor/__tests__/TextPanel.sections.test.tsx src/editor/__tests__/TextStyleSection.test.tsx src/editor/__tests__/TextPanel.style.test.tsx src/editor/__tests__/CaptionStyleSheet.test.tsx` → FAIL.
- [ ] **Step 3: Implement.**

`src/editor/components/TextStyleSection.tsx` (whole file):

```tsx
import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Switch, View } from "react-native";
import { BOX_CORNERS, DEFAULT_GLOW, DEFAULT_SHADOW, TEXT_STYLE_LIMITS, type BoxCorner, type TextStyle } from "@/src/editor/model/types";
import { theme } from "@/src/theme/theme";
import { Chip } from "@/src/ui/Chip";
import { PressableScale } from "@/src/ui/PressableScale";
import { Slider } from "@/src/ui/Slider";
import { Body, ValueLabel } from "@/src/ui/Text";
import { ColorRow, CONTENT_BLACK } from "./ColorRow";

/** A text's background box as the overlay stores it (`TextOverlay.background`). */
export type TextBox = { color: string; opacity: number };

type Props = {
  style: TextStyle;
  /** The text's outline and box live beside the style, on the overlay. */
  outline: boolean;
  background: TextBox | null;
  /** Called when a slider drag starts (the owner opens one undo step). */
  onBegin: () => void;
  /** One undo step: a switch, a colour, a chip. */
  onPatch: (patch: Partial<TextStyle>) => void;
  /** While a slider is dragged, after `onBegin`. */
  onPatchTransient: (patch: Partial<TextStyle>) => void;
  onOutline: (on: boolean) => void;
  /** One undo step: the Background switch, the box colour. */
  onBackground: (box: TextBox | null) => void;
  /** While the box opacity slider is dragged, after `onBegin`. */
  onBackgroundTransient: (box: TextBox) => void;
  /** The box opacity slider's test id: each panel keeps the name its slider always had. */
  boxOpacityTestID: string;
};

type RowId = "outline" | "shadow" | "box" | "spacing" | "glow";
const L = TEXT_STYLE_LIMITS;
/** How see-through a box may get: below 20 % it no longer reads as a box. */
export const BOX_OPACITY_RANGE = [0.2, 1] as const;
/** The box a text gets when Background is switched on. */
export const NEW_BOX: TextBox = { color: CONTENT_BLACK, opacity: 0.6 };
const CORNER_LABEL: Record<BoxCorner, string> = { rounded: "Rounded", square: "Square" };
const ROW = { height: theme.size.touch, flexDirection: "row", alignItems: "center", gap: theme.space.md } as const;
/** The row's name takes the rest of the row's width (the row has an explicit height: this `flex` is a width). */
const NAME = { flex: 1, height: theme.size.touch, flexDirection: "row", alignItems: "center", gap: theme.space.sm } as const;
const BODY = { gap: theme.space.md, paddingBottom: theme.space.md } as const;
const pct = (v: number) => `${Math.round(v * 100)}`;

/**
 * The look of a text beyond font and colour, as five rows: Outline, Shadow, Background, Spacing and opacity, Glow. Presentational — the
 * Text panel writes one overlay, the Caption style panel writes every caption. Every row starts closed, so the panel opens short.
 * A row that is on (Spacing and opacity always) opens and closes from its name; turning a row on opens it, off closes it.
 * A nested value (shadow, glow, the box) is always sent whole. Nothing here animates.
 */
export function TextStyleSection({ style, outline, background, onBegin, onPatch, onPatchTransient, onOutline, onBackground, onBackgroundTransient, boxOpacityTestID }: Props) {
  const [open, setOpen] = useState<Partial<Record<RowId, boolean>>>({});
  const { shadow, glow } = style;
  const set = (id: RowId, to: boolean) => setOpen((o) => ({ ...o, [id]: to }));

  /** `on`: the row's switch, or null for a row without one. */
  const row = (id: RowId, title: string, on: boolean | null, onChange?: (on: boolean) => void) => (
    <View style={ROW}>
      <PressableScale accessibilityRole="button" accessibilityLabel={on === null ? title : `${title} options`} disabled={on === false}
        accessibilityState={{ expanded: !!open[id], disabled: on === false }} onPress={() => set(id, !open[id])} style={NAME}>
        <Body weight="semi">{title}</Body>
        {on === false ? null : <Ionicons name={open[id] ? "chevron-up-outline" : "chevron-down-outline"} size={theme.size.icon.md} color={theme.colors.textMuted} />}
      </PressableScale>
      {on === null ? null : <Switch accessibilityLabel={title} value={on} onValueChange={(to) => { set(id, to); onChange?.(to); }} trackColor={{ true: theme.colors.accent }} />}
    </View>
  );
  const slider = (testID: string, label: string, shown: string, range: readonly [number, number], value: number, write: (v: number) => void) => (
    <View>
      <ValueLabel label={label} value={shown} />
      <Slider testID={testID} minimumValue={range[0]} maximumValue={range[1]} step={0.01} value={value} onSlidingStart={onBegin} onValueChange={write} onSlidingComplete={write} />
    </View>
  );
  const styled = (toPatch: (v: number) => Partial<TextStyle>) => (v: number) => onPatchTransient(toPatch(v));

  return (
    <View testID="style-sections">
      {row("outline", "Outline", outline, onOutline)}
      {open.outline && outline && (
        <View testID="style-outline" style={BODY}>
          <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: theme.space.sm }}>
            <Chip label="Auto" selected={style.outlineColor === null} onPress={() => onPatch({ outlineColor: null })} />
            <View testID="style-outline-color"><ColorRow value={style.outlineColor ?? ""} onChange={(outlineColor) => onPatch({ outlineColor })} /></View>
          </View>
          {slider("style-outline-width-slider", "Thickness", `${style.outlineWidth.toFixed(2)}×`, L.outlineWidth, style.outlineWidth, styled((v) => ({ outlineWidth: v })))}
        </View>
      )}

      {row("shadow", "Shadow", !!shadow, (on) => onPatch({ shadow: on ? { ...DEFAULT_SHADOW } : null }))}
      {open.shadow && shadow && (
        <View testID="style-shadow" style={BODY}>
          <View testID="style-shadow-color"><ColorRow value={shadow.color} onChange={(color) => onPatch({ shadow: { ...shadow, color } })} /></View>
          {slider("style-shadow-opacity-slider", "Shadow opacity", `${pct(shadow.opacity)} %`, L.shadowOpacity, shadow.opacity, styled((v) => ({ shadow: { ...shadow, opacity: v } })))}
          {slider("style-shadow-distance-slider", "Distance", pct(shadow.distance), L.shadowDistance, shadow.distance, styled((v) => ({ shadow: { ...shadow, distance: v } })))}
          {slider("style-shadow-blur-slider", "Blur", pct(shadow.blur), L.shadowBlur, shadow.blur, styled((v) => ({ shadow: { ...shadow, blur: v } })))}
        </View>
      )}

      {row("box", "Background", !!background, (on) => onBackground(on ? { ...NEW_BOX } : null))}
      {open.box && background && (
        <View testID="style-box" style={BODY}>
          <View testID="style-box-color"><ColorRow value={background.color} onChange={(color) => onBackground({ color, opacity: background.opacity })} /></View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: theme.space.sm }}>
            {BOX_CORNERS.map((c) => <Chip key={c} label={CORNER_LABEL[c]} selected={style.boxCorner === c} onPress={() => onPatch({ boxCorner: c })} />)}
          </View>
          {slider("style-box-padding-slider", "Padding", pct(style.boxPadding), L.boxPadding, style.boxPadding, styled((v) => ({ boxPadding: v })))}
          {slider(boxOpacityTestID, "Box opacity", `${pct(background.opacity)} %`, BOX_OPACITY_RANGE, background.opacity, (v) => onBackgroundTransient({ color: background.color, opacity: v }))}
        </View>
      )}

      {row("spacing", "Spacing and opacity", null)}
      {open.spacing && (
        <View testID="style-spacing" style={BODY}>
          {slider("style-opacity-slider", "Opacity", `${pct(style.opacity)} %`, L.opacity, style.opacity, styled((v) => ({ opacity: v })))}
          {slider("style-letter-spacing-slider", "Letter spacing", pct(style.letterSpacing), L.letterSpacing, style.letterSpacing, styled((v) => ({ letterSpacing: v })))}
          {slider("style-line-spacing-slider", "Line spacing", `${style.lineSpacing.toFixed(2)}×`, L.lineSpacing, style.lineSpacing, styled((v) => ({ lineSpacing: v })))}
        </View>
      )}

      {row("glow", "Glow", !!glow, (on) => onPatch({ glow: on ? { ...DEFAULT_GLOW } : null }))}
      {open.glow && glow && (
        <View testID="style-glow" style={BODY}>
          <View testID="style-glow-color"><ColorRow value={glow.color} onChange={(color) => onPatch({ glow: { ...glow, color } })} /></View>
          {slider("style-glow-size-slider", "Size", pct(glow.size), L.glowSize, glow.size, styled((v) => ({ glow: { ...glow, size: v } })))}
        </View>
      )}
    </View>
  );
}
```

`src/editor/components/TextPanel.tsx`:
- Imports: drop `Switch` from `react-native` and `CONTENT_BLACK` from `./ColorRow`; `import { TextStyleSection } from "./TextStyleSection";` replaces the `CollapsibleTextStyle` import. (`Pressable` stays: Fine-tune uses it.)
- Replace the `slider` helper (the one keyed `"fontScale" | "opacity"`) with:

```tsx
  const sizeSlider = { onSlidingStart: () => beginTransaction(), onValueChange: (v: number) => applyTransient((x) => updateOverlay(x, id, { fontScale: v })) };
```

  and use `{...sizeSlider}` on the Size slider.
- In the JSX: delete the Background row with its colour row and opacity slider, the Outline row, and `<CollapsibleTextStyle … />`. Directly after the Align chips put:

```tsx
      <TextStyleSection style={overlay.style} outline={overlay.outline} background={overlay.background} boxOpacityTestID="opacity-slider"
        onBegin={beginTransaction} onPatch={patchStyle} onPatchTransient={patchStyleTransient}
        onOutline={(outline) => patch({ outline })} onBackground={(background) => patch({ background })}
        onBackgroundTransient={(background) => applyTransient((x) => updateOverlay(x, id, { background }))} />
```

  Resulting order: text field · looks row · font row · Size · colour · Align · the rows · Fine-tune · Duplicate / Delete. Lines 28–47 (the typing logic) are not touched.

`src/editor/components/CaptionStyleSheet.tsx`:
- Imports: `TextStyleSection` in place of `CollapsibleTextStyle`; drop `CONTENT_BLACK` (and `Switch` only if "Highlight spoken word" no longer needs it — it does: keep it).
- Delete `opacityPatch`, the Background row with its colour row and slider, and the Outline row. Replace `<CollapsibleTextStyle … />` with:

```tsx
        <TextStyleSection style={textStyle} outline={style.outline} background={style.background} boxOpacityTestID="caption-opacity-slider"
          onBegin={begin} onPatch={(sp: Partial<TextStyle>) => patch({ style: sp })} onPatchTransient={(sp: Partial<TextStyle>) => patchTransient({ style: sp })}
          onOutline={(outline) => patch({ outline })} onBackground={(background) => patch({ background })}
          onBackgroundTransient={(background) => patchTransient({ background })} />
```

  (the `Y %` field stays directly above it). The "no captions" draft keeps working: `patch` / `patchTransient` already route through `write`.

- [ ] **Step 4:** `npx.cmd jest src/editor/__tests__` green; `npx.cmd jest src/__tests__` green (spacing, hex, kit-slider guards — no allow-table edit). `npm run typecheck`; `npm test`. `TextPanel.test.tsx`, `panels.text.test.tsx`, `panels.pickers.test.tsx` and `useLoadProject.emptyText.test.tsx` pass **unedited**; if one fails, the change is wrong (most likely something is drawn before its row is opened).
- [ ] **Step 5: Commit** — `git add src/editor/components/TextStyleSection.tsx src/editor/components/TextPanel.tsx src/editor/components/CaptionStyleSheet.tsx src/editor/__tests__/TextStyleSection.test.tsx src/editor/__tests__/TextPanel.style.test.tsx src/editor/__tests__/CaptionStyleSheet.test.tsx src/editor/__tests__/TextPanel.sections.test.tsx`; `feat(editor): Outline, Shadow, Background, Spacing and Glow as their own rows; box corner and padding controls`.

---

### Task 6: Thirteen shapes — registry, paths, Swift table, Shapes tab

**Depends on:** Task 1 (it edits `types.ts` first). **Parallel-safe with:** Tasks 2, 3, 4, 5, 7.

**Files:** Modify `src/editor/model/types.ts` (the `SHAPE_IDS` line only), `src/editor/effects.ts` (`SHAPES` and its comment only), `modules/clipy-video/ios/Effects.swift` (`shapePaths` and its comment only), `src/editor/__tests__/effects.test.ts`, `src/editor/model/__tests__/migrate.test.ts` (append one test); create `src/editor/__tests__/StickerSheet.shapes.test.tsx`.

**Do not touch:** `StickerSheet.tsx` (it maps `SHAPE_IDS` already — and Task 7 owns the file), `StickerView.tsx`, `SVGPath.swift`, `ExportSession.swift`, the seven existing paths (not a character), `STICKER_SHAPE_SCALE`, `src/editor/timelineScroll.ts`, `Timeline.tsx`, `PreviewPlayer.tsx`, `src/editor/toolStrip.ts`, `src/publish/`, `supabase/`.

**Interfaces — Consumes:** `SVGPath.cgPath(from:)` — absolute `M L C Q Z` only, several subpaths allowed, anything else → nil (read `modules/clipy-video/ios/SVGPath.swift`); the Shapes tab draws `<Path d={SHAPES[id].path} fill={color} />` in a `0 0 100 100` box and labels each tile `SHAPES[id].label`.

**Interfaces — Produces**

```ts
// src/editor/model/types.ts
export const SHAPE_IDS = ["circle", "square", "roundedBox", "arrow", "star", "speechBubble", "heart",
  "arrowCurved", "arrowDouble", "bubbleRound", "bubbleSquare", "bubbleThought", "badgeSeal", "badgeRibbon", "banner",
  "sparkle", "burst", "frameRounded", "ring", "brackets"] as const;
// src/editor/effects.ts — SHAPES: Record<ShapeId, { label: string; path: string }>, 20 entries; Effects.swift shapePaths: the same 20, verbatim
```

**Path rules** (both sides fill non-zero and set no fill rule): every subpath is drawn **clockwise**; a hole is an inner subpath drawn **counter-clockwise** (`frameRounded`, `ring`); same-direction subpaths that overlap form a union (`badgeRibbon`); every number is inside 0–100.

- [ ] **Step 1: Failing tests.**

`src/editor/__tests__/effects.test.ts` — line 34: `expect(SHAPE_IDS).toHaveLength(20);`. Add `type ShapeId` to the `../model/types` import and append:

```ts
/** Each subpath's signed area over its end points (shoelace): above 0 = clockwise in the y-down SVG box, below 0 = counter-clockwise. */
function turns(d: string): number[] {
  return d.split("M").filter((s) => s.trim().length > 0).map((sub) => {
    const t = sub.replace(/([LCQZ])/g, " $1 ").trim().split(/\s+/);
    const pts: [number, number][] = [[Number(t[0]), Number(t[1])]];
    for (let k = 2; k < t.length && t[k] !== "Z";) {
      const skip = t[k] === "L" ? 0 : t[k] === "Q" ? 2 : 4;        // the control points that come before the end point
      pts.push([Number(t[k + 1 + skip]), Number(t[k + 2 + skip])]);
      k += 3 + skip;
    }
    return pts.reduce((a, [x, y], j) => { const [nx, ny] = pts[(j + 1) % pts.length]; return a + x * ny - nx * y; }, 0) / 2;
  });
}
/** The subpaths (by index) that are holes. */
// One subpath: a move, then segments that each name their command (L: one point, Q: two, C: three), then Z.
const SUBPATH = /^M[\d.]+ [\d.]+(?: (?:L[\d.]+ [\d.]+|Q[\d.]+(?: [\d.]+){3}|C[\d.]+(?: [\d.]+){5}))+ Z$/;
const HOLES: Partial<Record<ShapeId, number[]>> = { frameRounded: [1], ring: [1] };

test("twenty shapes: the first seven as they were, then the thirteen of 2026-10-06, each with its own short label", () => {
  expect(SHAPE_IDS).toEqual(["circle", "square", "roundedBox", "arrow", "star", "speechBubble", "heart",
    "arrowCurved", "arrowDouble", "bubbleRound", "bubbleSquare", "bubbleThought", "badgeSeal", "badgeRibbon", "banner", "sparkle", "burst", "frameRounded", "ring", "brackets"]);
  expect(Object.keys(SHAPES)).toEqual([...SHAPE_IDS]);
  expect(SHAPE_IDS.map((id) => SHAPES[id].label)).toEqual(["Circle", "Square", "Box", "Arrow", "Star", "Bubble", "Heart",
    "Curved", "Two-way", "Round", "Sharp", "Thought", "Seal", "Award", "Banner", "Sparkle", "Burst", "Frame", "Ring", "Corners"]);
  expect(SHAPES.circle.path).toBe("M50 0 C77.6 0 100 22.4 100 50 C100 77.6 77.6 100 50 100 C22.4 100 0 77.6 0 50 C0 22.4 22.4 0 50 0 Z");   // an old one, untouched
  expect(SHAPES.heart.path).toBe("M50 90 C20 65 0 50 0 30 C0 13 13 0 28 0 C38 0 46 6 50 14 C54 6 62 0 72 0 C87 0 100 13 100 30 C100 50 80 65 50 90 Z");
});

test("every segment names its command (the Swift parser and `turns` both rely on it) and every subpath is closed", () => {
  for (const id of SHAPE_IDS) {
    const subs = SHAPES[id].path.split("M").filter((s) => s.trim().length > 0);
    for (const sub of subs) {
      expect(sub.trim().endsWith("Z")).toBe(true);
      expect(`M${sub}`.trim()).toMatch(SUBPATH);
    }
  }
});

test("subpath directions: everything clockwise, the declared holes counter-clockwise — a hole is a hole under non-zero AND even-odd", () => {
  for (const id of SHAPE_IDS) {
    turns(SHAPES[id].path).forEach((area, i) => {
      const hole = HOLES[id]?.includes(i) ?? false;
      expect([id, i, hole ? area < 0 : area > 0]).toEqual([id, i, true]);
    });
  }
  expect(Object.fromEntries(SHAPE_IDS.map((id) => [id, turns(SHAPES[id].path).length] as const).filter(([, n]) => n !== 1)))
    .toEqual({ bubbleThought: 3, badgeRibbon: 3, frameRounded: 2, ring: 2, brackets: 4 });
  expect(turns(SHAPES.ring.path)).toEqual([5000, -2592]);                 // by hand, over the four ends of the arcs (a square on its corner): 2 × 50² outside, −2 × 36² inside
  expect(turns(SHAPES.brackets.path)).toEqual([500, 500, 500, 500]);      // each corner: 30 × 10 + 10 × 20
});
```

(the existing tests "shape paths use only absolute M/L/C/Q/Z commands in a 100×100 box" and "Effects.swift mirrors the TS registry" run over all 20 unedited.)

`src/editor/model/__tests__/migrate.test.ts` — append:

```ts
test("the thirteen new shapes are known shapes: a sticker with one loads as it is; an unknown shape still falls back or is dropped", () => {
  const fresh = ["arrowCurved", "arrowDouble", "bubbleRound", "bubbleSquare", "bubbleThought", "badgeSeal", "badgeRibbon", "banner", "sparkle", "burst", "frameRounded", "ring", "brackets"] as const;
  const p = makeProject({ overlays: [...fresh.map((shape) => makeSticker({ id: shape, emoji: null, shape })), { ...makeSticker({ id: "x", emoji: null }), shape: "blob" } as unknown as Overlay] });
  const loaded = migrateProject(p);
  expect(loaded.overlays.map((o) => (o as { shape: string | null }).shape)).toEqual([...fresh]);
  expect(migrateProject(loaded)).toEqual(loaded);
});
```

Create `src/editor/__tests__/StickerSheet.shapes.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
jest.mock("@/src/lib/id", () => ({ newId: () => "st1" }));
jest.mock("@/src/projects/prefs", () => ({ prefs: { getRecentEmoji: jest.fn(async () => []), pushRecentEmoji: jest.fn(async () => {}) } }));
import { Dimensions } from "react-native";
import { SHAPES } from "@/src/editor/effects";
import { makeClip, makeProject, makeSticker, SHAPE_IDS } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { PANEL, panelHeight } from "@/src/ui/ToolPanel";
import { StickerSheet } from "../components/StickerSheet";
import { StickerView } from "../components/StickerView";

beforeEach(() => { useEditorStore.getState().reset(); useEditorStore.getState().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 10 })] })); useEditorStore.getState().seek(2); });

test("the Shapes tab offers all twenty shapes in the registry's order, inside the scroll at its explicit height", async () => {
  await render(<StickerSheet visible onClose={() => {}} onAdded={() => {}} />);
  await fireEvent.press(screen.getByRole("button", { name: "Shapes" }));
  for (const id of SHAPE_IDS) expect(screen.getByRole("button", { name: SHAPES[id].label })).toBeTruthy();
  expect(SHAPE_IDS).toHaveLength(20);
  expect(screen.getByTestId("shape-list")).toHaveStyle({ height: panelHeight("regular", Dimensions.get("window").height) - 1 - PANEL.header - PANEL.lead });
});

test.each([["Ring", "ring"], ["Thought", "bubbleThought"], ["Corners", "brackets"], ["Two-way", "arrowDouble"]] as const)(
  "tapping %s adds that shape as a selected sticker at the playhead, in the chosen colour — one undo step", async (label, shape) => {
    const onAdded = jest.fn();
    await render(<StickerSheet visible onClose={() => {}} onAdded={onAdded} />);
    await fireEvent.press(screen.getByRole("button", { name: "Shapes" }));
    await fireEvent.press(screen.getByLabelText("Color #2E86AB"));
    await fireEvent.press(screen.getByRole("button", { name: label }));
    expect(useEditorStore.getState().project!.overlays).toHaveLength(1);
    expect(useEditorStore.getState().project!.overlays[0]).toMatchObject({ kind: "sticker", emoji: null, shape, color: "#2E86AB", start: 2, end: 5, scale: 1, rotation: 0 });
    expect(useEditorStore.getState().past).toHaveLength(1);
    expect(onAdded).toHaveBeenCalledWith("st1");
  });

test("the preview draws a compound shape as ONE path with no fill rule: the counter-wound inner subpath is the hole", async () => {
  await render(<StickerView sticker={makeSticker({ id: "r", emoji: null, shape: "ring", color: "#FF0000", scale: 2 })} frameW={200} frameH={400} />);
  const path = screen.getByTestId("sticker-shape-r");
  expect(path.props.d).toBe(SHAPES.ring.path);
  expect(path.props.fill).toBe("#FF0000");
  expect(path.props.fillRule).toBeUndefined();
});
```

- [ ] **Step 2: Run** `npx.cmd jest src/editor/__tests__/effects.test.ts src/editor/__tests__/StickerSheet.shapes.test.tsx src/editor/model/__tests__/migrate.test.ts` → FAIL (seven shapes).
- [ ] **Step 3: Implement** — copy these strings exactly (they were checked by script: command subset, 0–100, directions).

`src/editor/model/types.ts`: the `SHAPE_IDS` line as in Produces.

`src/editor/effects.ts` — the comment above `SHAPES` becomes `/** 100×100 box, absolute M/L/C/Q/Z only (no arcs: the Swift parser has none) — copied verbatim into Effects.swift. Every subpath is clockwise; a hole is an inner subpath drawn counter-clockwise (neither side sets a fill rule). */`; after `heart` add:

```ts
  arrowCurved:   { label: "Curved",  path: "M8 92 C8 52 30 30 62 30 L62 12 L96 42 L62 72 L62 54 C44 54 32 68 32 92 Z" },
  arrowDouble:   { label: "Two-way", path: "M0 50 L28 18 L28 38 L72 38 L72 18 L100 50 L72 82 L72 62 L28 62 L28 82 Z" },
  bubbleRound:   { label: "Round",   path: "M50 2 C77.6 2 100 19.9 100 42 C100 64.1 77.6 82 50 82 C46 82 42 81.6 38 80.9 L16 98 L22 75 C8.5 67.5 0 55.5 0 42 C0 19.9 22.4 2 50 2 Z" },
  bubbleSquare:  { label: "Sharp",   path: "M0 0 L100 0 L100 70 L45 70 L22 96 L26 70 L0 70 Z" },
  bubbleThought: { label: "Thought", path: "M26 66 C11 66 2 56 2 45 C2 35 9 27 19 25 C21 12 33 4 46 6 C54 0 68 0 76 8 C89 8 98 18 98 30 C98 37 95 43 90 47 C91 58 82 66 71 66 Z M24 72 C28.4 72 32 75.6 32 80 C32 84.4 28.4 88 24 88 C19.6 88 16 84.4 16 80 C16 75.6 19.6 72 24 72 Z M9 88 C11.8 88 14 90.2 14 93 C14 95.8 11.8 98 9 98 C6.2 98 4 95.8 4 93 C4 90.2 6.2 88 9 88 Z" },
  badgeSeal:     { label: "Seal",    path: "M50 0 L56.9 6.5 L65.5 2.4 L70 10.8 L79.4 9.5 L81.1 18.9 L90.5 20.6 L89.2 30 L97.6 34.5 L93.5 43.1 L100 50 L93.5 56.9 L97.6 65.5 L89.2 70 L90.5 79.4 L81.1 81.1 L79.4 90.5 L70 89.2 L65.5 97.6 L56.9 93.5 L50 100 L43.1 93.5 L34.5 97.6 L30 89.2 L20.6 90.5 L18.9 81.1 L9.5 79.4 L10.8 70 L2.4 65.5 L6.5 56.9 L0 50 L6.5 43.1 L2.4 34.5 L10.8 30 L9.5 20.6 L18.9 18.9 L20.6 9.5 L30 10.8 L34.5 2.4 L43.1 6.5 Z" },
  badgeRibbon:   { label: "Award",   path: "M50 0 C69.9 0 86 16.1 86 36 C86 55.9 69.9 72 50 72 C30.1 72 14 55.9 14 36 C14 16.1 30.1 0 50 0 Z M24 60 L44 70 L32 100 L26 86 L10 90 Z M76 60 L90 90 L74 86 L68 100 L56 70 Z" },
  banner:        { label: "Banner",  path: "M0 28 L100 28 L88 50 L100 72 L0 72 L12 50 Z" },
  sparkle:       { label: "Sparkle", path: "M50 0 Q56 44 100 50 Q56 56 50 100 Q44 56 0 50 Q44 44 50 0 Z" },
  burst:         { label: "Burst",   path: "M50 0 L57.8 21 L75 6.7 L71.2 28.8 L93.3 25 L79 42.2 L100 50 L79 57.8 L93.3 75 L71.2 71.2 L75 93.3 L57.8 79 L50 100 L42.2 79 L25 93.3 L28.8 71.2 L6.7 75 L21 57.8 L0 50 L21 42.2 L6.7 25 L28.8 28.8 L25 6.7 L42.2 21 Z" },
  frameRounded:  { label: "Frame",   path: "M16 0 L84 0 C92.8 0 100 7.2 100 16 L100 84 C100 92.8 92.8 100 84 100 L16 100 C7.2 100 0 92.8 0 84 L0 16 C0 7.2 7.2 0 16 0 Z M18 12 C14.7 12 12 14.7 12 18 L12 82 C12 85.3 14.7 88 18 88 L82 88 C85.3 88 88 85.3 88 82 L88 18 C88 14.7 85.3 12 82 12 Z" },
  ring:          { label: "Ring",    path: "M50 0 C77.6 0 100 22.4 100 50 C100 77.6 77.6 100 50 100 C22.4 100 0 77.6 0 50 C0 22.4 22.4 0 50 0 Z M50 14 C30.1 14 14 30.1 14 50 C14 69.9 30.1 86 50 86 C69.9 86 86 69.9 86 50 C86 30.1 69.9 14 50 14 Z" },
  brackets:      { label: "Corners", path: "M0 0 L30 0 L30 10 L10 10 L10 30 L0 30 Z M70 0 L100 0 L100 30 L90 30 L90 10 L70 10 Z M100 70 L100 100 L70 100 L70 90 L90 90 L90 70 Z M0 70 L10 70 L10 90 L30 90 L30 100 L0 100 Z" },
```

`modules/clipy-video/ios/Effects.swift` — the comment above `shapePaths` becomes `/// 100×100 box, y-down (SVG) coordinates, absolute M/L/C/Q/Z only — copied verbatim from SHAPES in effects.ts. Every subpath is clockwise; a hole is an inner subpath drawn counter-clockwise (the shape layer keeps its default non-zero fill).`; inside the dictionary, after the `"heart"` line, add thirteen lines `    "<id>": "<path>",` with the **same ids and the same path strings** as above, in the same order (copy the strings from `effects.ts`; the parity test compares them character for character).

- [ ] **Step 4:** `npx.cmd jest src/editor/__tests__/effects.test.ts src/editor/__tests__/StickerSheet` green (`StickerSheet.test.tsx` unedited — "Heart" still names one button). `npm run typecheck`; `npm test`. Read `SVGPath.swift` once more against one compound path (`ring`) and say in your report that `M` after `Z` starts a new subpath there.
- [ ] **Step 5: Commit** — `git add src/editor/model/types.ts src/editor/effects.ts modules/clipy-video/ios/Effects.swift src/editor/__tests__/effects.test.ts src/editor/model/__tests__/migrate.test.ts src/editor/__tests__/StickerSheet.shapes.test.tsx`; `feat(stickers): thirteen more shapes — arrows, speech bubbles, badges, stars and frames (TS and Swift tables)`.

---

### Task 7: Emoji packs and the Emoji tab

**Depends on:** nothing in this plan (run it after Task 1 so the tree is green). **Parallel-safe with:** Tasks 2, 3, 4, 5, 6, 8.

**Files:** Modify `src/editor/emoji.ts`, `src/editor/components/StickerSheet.tsx`, `src/editor/__tests__/emoji.test.ts`; create `src/editor/__tests__/StickerSheet.packs.test.tsx`.

**Do not touch:** `assets/emoji.json`, `scripts/gen-emoji.mjs`, `searchEmoji` (signature and behaviour), `src/projects/prefs.ts`, the Shapes tab's JSX, `src/ui/ToolPanel.tsx`, `src/editor/__tests__/StickerSheet.test.tsx` (it must pass **unedited**: the grid's height is still `bodyHeight − 52`), `src/editor/timelineScroll.ts`, `Timeline.tsx`, `PreviewPlayer.tsx`, `src/editor/toolStrip.ts`, `src/publish/`, `supabase/`.

**Interfaces — Consumes:** `EMOJI: EmojiEntry[]` (1 914 entries in Unicode order; `keywords[0]` is the Unicode group in lower case: `"smileys & emotion"`, `"people & body"`, `"animals & nature"`, `"food & drink"`, `"travel & places"`, `"activities"`, `"objects"`, `"symbols"`, `"flags"`); `ToolPanel`'s `lead` (a 44-pt row, `flexDirection: "row"`, `alignItems: "center"`, `gap: sm`, hidden while the keyboard is up) and `PANEL.lead`; kit `Chip` (`compact`, `accessibilityLabel`); `FlatList` with `numColumns` (its `initialNumToRender` counts **rows** — `node_modules/react-native/Libraries/Lists/FlatList.js`).

**Interfaces — Produces**

```ts
// src/editor/emoji.ts
export const EMOJI_PACK_IDS = ["faces", "hands", "hearts", "food", "travel", "symbols", "more"] as const;
export type EmojiPackId = (typeof EMOJI_PACK_IDS)[number];
export const EMOJI_PACKS: Record<EmojiPackId, { label: string }>;           // Faces, Hands, Hearts, Food, Travel, Symbols, More
/** The entry NAMES where a pack starts or ends inside its Unicode group. */
export const PACK_ANCHORS: { heartsFrom: "love letter"; heartsTo: "kiss mark"; handsTo: "flexed biceps" };
export function groupEmoji(list: readonly EmojiEntry[]): Record<EmojiPackId, EmojiEntry[]>;   // pure; every entry in exactly one pack, order kept
export const EMOJI_BY_PACK: Record<EmojiPackId, EmojiEntry[]>;              // groupEmoji(EMOJI), built once
// src/editor/components/StickerSheet.tsx — same props. New: test id "emoji-packs"; pack chips named "<Label> pack".
```

- [ ] **Step 1: Failing tests.**

`src/editor/__tests__/emoji.test.ts` — change the import to `import { EMOJI, EMOJI_BY_PACK, EMOJI_PACK_IDS, EMOJI_PACKS, groupEmoji, PACK_ANCHORS, searchEmoji, type EmojiEntry } from "../emoji";` and append:

```ts
test("seven packs with their labels, in the chips' order", () => {
  expect(EMOJI_PACK_IDS).toEqual(["faces", "hands", "hearts", "food", "travel", "symbols", "more"]);
  expect(EMOJI_PACK_IDS.map((id) => EMOJI_PACKS[id].label)).toEqual(["Faces", "Hands", "Hearts", "Food", "Travel", "Symbols", "More"]);
  expect(PACK_ANCHORS).toEqual({ heartsFrom: "love letter", heartsTo: "kiss mark", handsTo: "flexed biceps" });
});

test("the bundled emoji: every one is in exactly one pack, in the data's order; the sizes (they move only when the data is regenerated)", () => {
  expect(Object.fromEntries(EMOJI_PACK_IDS.map((id) => [id, EMOJI_BY_PACK[id].length]))).toEqual({ faces: 131, hands: 44, hearts: 26, food: 131, travel: 219, symbols: 238, more: 1125 });
  const all = EMOJI_PACK_IDS.flatMap((id) => EMOJI_BY_PACK[id]);
  expect(all).toHaveLength(EMOJI.length);                                  // 131 + 44 + 26 + 131 + 219 + 238 + 1125 = 1914
  expect(new Set(all.map((e) => e.char)).size).toBe(EMOJI.length);
  for (const id of EMOJI_PACK_IDS) { const at = EMOJI_BY_PACK[id].map((e) => EMOJI.indexOf(e)); expect(at).toEqual([...at].sort((a, b) => a - b)); }
  const ends = (id: (typeof EMOJI_PACK_IDS)[number]) => [EMOJI_BY_PACK[id][0].name, EMOJI_BY_PACK[id][EMOJI_BY_PACK[id].length - 1].name];
  expect(ends("faces")).toEqual(["grinning face", "speak-no-evil monkey"]);
  expect(ends("hearts")).toEqual(["love letter", "kiss mark"]);
  expect(ends("hands")).toEqual(["waving hand", "flexed biceps"]);
  expect(ends("symbols")[0]).toBe("hundred points");
  expect(EMOJI_BY_PACK.food.every((e) => e.keywords[0] === "food & drink")).toBe(true);
  expect(EMOJI_BY_PACK.travel.every((e) => e.keywords[0] === "travel & places")).toBe(true);
  expect(new Set(EMOJI_BY_PACK.more.map((e) => e.keywords[0]))).toEqual(new Set(["people & body", "animals & nature", "activities", "objects", "flags"]));
  expect(EMOJI_BY_PACK.hearts.some((e) => e.name === "red heart")).toBe(true);
  expect(EMOJI_BY_PACK.hands.some((e) => e.name === "thumbs up")).toBe(true);
});

test("groupEmoji is a pure walk over any list: groups by keywords[0], cuts Hearts and Hands out by the anchor names", () => {
  const e = (name: string, group: string): EmojiEntry => ({ char: name, name, keywords: [group] });
  const list = [e("grin", "smileys & emotion"), e("love letter", "smileys & emotion"), e("red heart", "smileys & emotion"), e("kiss mark", "smileys & emotion"), e("zzz", "smileys & emotion"),
    e("waving hand", "people & body"), e("flexed biceps", "people & body"), e("ear", "people & body"),
    e("dog", "animals & nature"), e("pizza", "food & drink"), e("car", "travel & places"), e("ball", "activities"), e("lamp", "objects"), e("warning", "symbols"), e("flag", "flags"), e("odd", "something new")];
  const frozen = JSON.stringify(list);
  const names = (xs: EmojiEntry[]) => xs.map((x) => x.name);
  const g = groupEmoji(list);
  expect(JSON.stringify(list)).toBe(frozen);
  expect(names(g.faces)).toEqual(["grin"]);
  expect(names(g.hearts)).toEqual(["love letter", "red heart", "kiss mark"]);
  expect(names(g.symbols)).toEqual(["zzz", "warning"]);
  expect(names(g.hands)).toEqual(["waving hand", "flexed biceps"]);
  expect(names(g.food)).toEqual(["pizza"]);
  expect(names(g.travel)).toEqual(["car"]);
  expect(names(g.more)).toEqual(["ear", "dog", "ball", "lamp", "flag", "odd"]);        // an unknown group lands in More, never lost
  expect(groupEmoji([])).toEqual({ faces: [], hands: [], hearts: [], food: [], travel: [], symbols: [], more: [] });
  // Without the anchors nothing is lost either: the whole group stays in its first pack (the size test above is what notices).
  expect(names(groupEmoji([e("grin", "smileys & emotion"), e("red heart", "smileys & emotion")]).faces)).toEqual(["grin", "red heart"]);
});

test("search is unchanged: it still looks through every emoji, whatever its pack", () => {
  expect(searchEmoji("pizza").some((x) => x.name === "pizza")).toBe(true);
  expect(searchEmoji("flag").length).toBe(60);
  expect(searchEmoji("").length).toBe(60);
});
```

Create `src/editor/__tests__/StickerSheet.packs.test.tsx`:

```tsx
import { act, fireEvent, render, screen } from "@testing-library/react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
jest.mock("@/src/lib/id", () => ({ newId: () => "st1" }));
jest.mock("@/src/projects/prefs", () => ({ prefs: { getRecentEmoji: jest.fn(async () => ["🎉"]), pushRecentEmoji: jest.fn(async () => {}) } }));
import { Dimensions } from "react-native";
import { EMOJI_BY_PACK, EMOJI_PACK_IDS, EMOJI_PACKS } from "@/src/editor/emoji";
import { makeClip, makeProject } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { useKeyboard } from "@/src/ui/keyboard";
import { PANEL, panelHeight } from "@/src/ui/ToolPanel";
import { StickerSheet } from "../components/StickerSheet";

beforeEach(() => { useEditorStore.getState().reset(); useEditorStore.getState().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 10 })] })); useEditorStore.getState().seek(2); });
afterEach(() => { useKeyboard.setState({ height: 0 }); });
const show = () => render(<StickerSheet visible onClose={() => {}} onAdded={() => {}} />);
const grid = () => screen.getByTestId("emoji-grid");
const chip = (id: (typeof EMOJI_PACK_IDS)[number]) => screen.getByRole("button", { name: `${EMOJI_PACKS[id].label} pack` });
const H = Dimensions.get("window").height;

test("the Emoji tab opens on Faces with the seven pack chips in the lead row, after the two tabs; Recently used is on top", async () => {
  await show();
  expect(await screen.findByLabelText("Recent 🎉")).toBeTruthy();
  for (const id of EMOJI_PACK_IDS) { expect(chip(id)).toBeTruthy(); expect(screen.getByText(EMOJI_PACKS[id].label)).toBeTruthy(); }
  expect(chip("faces")).toBeSelected();
  expect(chip("hearts")).not.toBeSelected();
  expect(grid().props.data).toBe(EMOJI_BY_PACK.faces);
  const packs = screen.getByTestId("emoji-packs");
  expect(packs.props.horizontal).toBe(true);
  expect(packs).toHaveStyle({ height: PANEL.lead });                                    // an explicit height; its flex is the row's spare width
  expect(Object.keys(packs.props).filter((k) => /^on.*Scroll/.test(k))).toEqual([]);
  expect(chip("faces")).toHaveStyle({ height: 28 });                                    // compact chips: they read as packs, not as tabs
});

test("a pack chip swaps the grid's emoji; the grid keeps its explicit height and Recently used stays", async () => {
  await show();
  await screen.findByLabelText("Recent 🎉");
  await fireEvent.press(chip("hearts"));
  expect(chip("hearts")).toBeSelected();
  expect(chip("faces")).not.toBeSelected();
  expect(grid().props.data).toBe(EMOJI_BY_PACK.hearts);
  expect(screen.getByLabelText("Emoji red heart")).toBeTruthy();
  expect(screen.queryByLabelText("Emoji grinning face")).toBeNull();
  expect(screen.getByLabelText("Recent 🎉")).toBeTruthy();
  expect(grid()).toHaveStyle({ height: panelHeight("regular", H) - 1 - PANEL.header - PANEL.lead - 52 });
});

test("picking from a pack adds the sticker, exactly as picking from a search does", async () => {
  await show();
  await fireEvent.press(chip("food"));
  await fireEvent.press(screen.getByLabelText("Emoji grapes"));
  expect(useEditorStore.getState().project!.overlays[0]).toMatchObject({ kind: "sticker", emoji: "🍇", shape: null, start: 2, end: 5 });
  expect(useEditorStore.getState().past).toHaveLength(1);
});

test("the More pack hands the list all its emoji but mounts only the first rows", async () => {
  await show();
  await fireEvent.press(chip("more"));
  expect(grid().props.data).toHaveLength(1125);
  expect(grid().props.numColumns).toBe(8);
  expect(grid().props.initialNumToRender).toBe(9);
  const mounted = screen.getAllByLabelText(/^Emoji /).length;
  expect(mounted).toBeGreaterThan(0);
  expect(mounted).toBeLessThanOrEqual(9 * 8);
});

test("search looks through every emoji whatever the pack; no pack is selected meanwhile; a pack chip clears the search", async () => {
  await show();
  await fireEvent.press(chip("hearts"));
  await fireEvent.changeText(screen.getByLabelText("Search emoji"), "pizza");
  expect(screen.getByLabelText("Emoji pizza")).toBeTruthy();                             // a Food emoji, found from Hearts
  for (const id of EMOJI_PACK_IDS) expect(chip(id)).not.toBeSelected();
  expect(screen.queryByLabelText("Recent 🎉")).toBeNull();
  await fireEvent.changeText(screen.getByLabelText("Search emoji"), "");
  expect(chip("hearts")).toBeSelected();                                                  // back in the pack it was in
  expect(grid().props.data).toBe(EMOJI_BY_PACK.hearts);
  await fireEvent.changeText(screen.getByLabelText("Search emoji"), "pizza");
  await fireEvent.press(chip("travel"));
  expect(screen.getByLabelText("Search emoji").props.value).toBe("");
  expect(grid().props.data).toBe(EMOJI_BY_PACK.travel);
});

test("with the keyboard up the lead row (tabs and packs) is gone and Recently used hides; the pack is still the one shown", async () => {
  await show();
  await fireEvent.press(chip("hands"));
  await act(() => { useKeyboard.setState({ height: 336 }); });
  expect(screen.queryByTestId("emoji-packs")).toBeNull();
  expect(screen.queryByLabelText("Recent 🎉")).toBeNull();
  expect(grid().props.data).toBe(EMOJI_BY_PACK.hands);
  expect(grid()).toHaveStyle({ height: panelHeight("regular", H, true) - 1 - PANEL.header - 52 });
  await act(() => { useKeyboard.setState({ height: 0 }); });
  expect(chip("hands")).toBeSelected();
});

test("the Shapes tab has no pack chips; coming back to Emoji keeps the pack", async () => {
  await show();
  await fireEvent.press(chip("symbols"));
  await fireEvent.press(screen.getByRole("button", { name: "Shapes" }));
  expect(screen.queryByTestId("emoji-packs")).toBeNull();
  await fireEvent.press(screen.getByRole("button", { name: "Emoji" }));
  expect(chip("symbols")).toBeSelected();
});
```

(`grid().props.data` is read the way `StickerSheet.test.tsx` already reads it; the list hands the array on unchanged, so `toBe` holds. If identity turns out not to survive the list, compare `.length` and the first and last entry instead, and say so in your report — do not copy the array in the component to make it pass.)

- [ ] **Step 2: Run** `npx.cmd jest src/editor/__tests__/emoji.test.ts src/editor/__tests__/StickerSheet.packs.test.tsx` → FAIL (no packs).
- [ ] **Step 3: Implement.**

`src/editor/emoji.ts` — append (nothing above changes):

```ts
/** The sticker packs, in the chips' order. `more` holds everything that fits none of the six. */
export const EMOJI_PACK_IDS = ["faces", "hands", "hearts", "food", "travel", "symbols", "more"] as const;
export type EmojiPackId = (typeof EMOJI_PACK_IDS)[number];
export const EMOJI_PACKS: Record<EmojiPackId, { label: string }> = {
  faces: { label: "Faces" }, hands: { label: "Hands" }, hearts: { label: "Hearts" }, food: { label: "Food" },
  travel: { label: "Travel" }, symbols: { label: "Symbols" }, more: { label: "More" },
};
/**
 * The data is in Unicode order, so a subgroup is one unbroken run inside its group. Hearts and Hands are such runs, marked by the
 * NAMES of their first / last entries: Hearts is "love letter" … "kiss mark" inside "smileys & emotion" (what comes before is Faces,
 * what comes after is Symbols); Hands is the start of "people & body" through "flexed biceps" (the rest goes to More).
 */
export const PACK_ANCHORS = { heartsFrom: "love letter", heartsTo: "kiss mark", handsTo: "flexed biceps" } as const;
/** Whole Unicode groups (an entry's `keywords[0]`) that are a pack by themselves. Any other group goes to More. */
const GROUP_PACK: Record<string, EmojiPackId> = { "food & drink": "food", "travel & places": "travel", symbols: "symbols" };

/** Every entry of `list` in exactly one pack, in the list's order. Pure: one walk, nothing is changed or dropped. */
export function groupEmoji(list: readonly EmojiEntry[]): Record<EmojiPackId, EmojiEntry[]> {
  const out: Record<EmojiPackId, EmojiEntry[]> = { faces: [], hands: [], hearts: [], food: [], travel: [], symbols: [], more: [] };
  let smiley: EmojiPackId = "faces", body: EmojiPackId = "hands";
  for (const e of list) {
    const group = e.keywords[0];
    if (group === "smileys & emotion") {
      if (e.name === PACK_ANCHORS.heartsFrom) smiley = "hearts";
      out[smiley].push(e);
      if (e.name === PACK_ANCHORS.heartsTo) smiley = "symbols";
    } else if (group === "people & body") {
      out[body].push(e);
      if (e.name === PACK_ANCHORS.handsTo) body = "more";
    } else out[GROUP_PACK[group] ?? "more"].push(e);
  }
  return out;
}
/** The bundled emoji by pack, grouped once. */
export const EMOJI_BY_PACK = groupEmoji(EMOJI);
```

`src/editor/components/StickerSheet.tsx`:
- Imports: `StyleSheet` joins the `react-native` import; `import { EMOJI_BY_PACK, EMOJI_PACK_IDS, EMOJI_PACKS, searchEmoji, type EmojiEntry, type EmojiPackId } from "@/src/editor/emoji";`; `import { PANEL, ToolPanel } from "@/src/ui/ToolPanel";`.
- Below `SEARCH_ROW`: `/** Rows of eight the grid mounts first (the tallest panel shows eight); the rest is virtualised. */` `const FIRST_ROWS = 9;`
- State and data: add `const [pack, setPack] = useState<EmojiPackId>("faces");`; replace `const results = searchEmoji(query);` with

```tsx
  const searching = query.trim().length > 0;
  // A search looks through every emoji; without one the grid shows the chosen pack, all of it.
  const results = searching ? searchEmoji(query) : EMOJI_BY_PACK[pack];
```

- The `lead`:

```tsx
      lead={<>
        <Chip label="Emoji" selected={tab === "emoji"} onPress={() => setTab("emoji")} />
        <Chip label="Shapes" selected={tab === "shapes"} onPress={() => setTab("shapes")} />
        {tab === "emoji" ? (<>
          <View style={{ width: StyleSheet.hairlineWidth, height: theme.size.icon.md, backgroundColor: theme.colors.hairline }} />
          {/* The lead row has an explicit height: this `flex` is the row's spare WIDTH. The chips scroll sideways inside it. */}
          <ScrollView testID="emoji-packs" horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled"
            style={{ flex: 1, height: PANEL.lead }} contentContainerStyle={{ alignItems: "center", gap: theme.space.sm }}>
            {EMOJI_PACK_IDS.map((id) => (
              <Chip key={id} compact label={EMOJI_PACKS[id].label} accessibilityLabel={`${EMOJI_PACKS[id].label} pack`} selected={!searching && pack === id}
                onPress={() => { setQuery(""); setPack(id); }} />
            ))}
          </ScrollView>
        </>) : null}
      </>}
```

- The `FlatList`: add `key={searching ? "search" : pack}` (a pack starts at its top: the list is remounted, never scrolled from code), `initialNumToRender={FIRST_ROWS}` and `windowSize={7}`; `data={results}`; everything else on it — the test id, the explicit `height: bodyHeight - SEARCH_ROW`, `numColumns={8}`, the keyboard props, the Recently used header and its `!query && !typing` rule, `renderItem` — stays as it is.
- The Shapes branch is not touched.

- [ ] **Step 4:** `npx.cmd jest src/editor/__tests__/StickerSheet src/editor/__tests__/emoji.test.ts` green — **`StickerSheet.test.tsx` unedited**. `npx.cmd jest src/__tests__` green (no hex literal, no raw spacing in `StickerSheet.tsx`). `npm run typecheck`; `npm test`.
- [ ] **Step 5: Commit** — `git add src/editor/emoji.ts src/editor/components/StickerSheet.tsx src/editor/__tests__/emoji.test.ts src/editor/__tests__/StickerSheet.packs.test.tsx`; `feat(stickers): emoji packs — Faces, Hands, Hearts, Food, Travel, Symbols and More; a pack shows all of its emoji`.

---

### Task 8: Export — request fields, the box corner in Swift, XCTests, source-reading tests

**Depends on:** Tasks 2 and 6. **Parallel-safe with:** Tasks 3, 4, 5, 7.

**Files:** Modify `modules/clipy-video/index.ts`, `modules/clipy-video/__tests__/index.test.ts`, `modules/clipy-video/ios/ExportSession.swift` (`overlayLayer` and its doc comment only), `modules/clipy-video/ios/Tests/ExportSessionTests.swift` (append one test); create `modules/clipy-video/ios/Tests/TextBoxTests.swift`, `src/editor/model/__tests__/textBoxExport.swift.test.ts`.

**Do not touch:** `OverlayLayout.swift`, the `ExportTextStyle` record (Task 2 — already has the fields), `Effects.swift` (Task 6), `SVGPath.swift`, `stickerLayer`, `addMotion`, `addVisibility`, `CaptionWords.swift`, the glow / shadow / word-highlight blocks of `overlayLayer` (the existing `textExport.swift.test.ts` must pass **unedited**), `src/editor/timelineScroll.ts`, `Timeline.tsx`, `PreviewPlayer.tsx`, `src/editor/toolStrip.ts`, `src/publish/`, `supabase/`.

**Interfaces — Consumes:** `OverlayLayoutResult.padding` / `.boxRadius`, `ExportTextStyle.boxPadding` / `.boxCorner` (Task 2); `Effects.shapePaths` with 20 entries (Task 6); `TextStyle.boxPadding` / `boxCorner`, `BoxCorner` (Task 1).

**Interfaces — Produces**

```ts
// modules/clipy-video/index.ts
export interface ExportTextStyle {
  opacity: number; letterSpacing: number; lineSpacing: number; outlineColor: string | null; outlineWidth: number;
  shadowColor: string | null; shadowOpacity: number; shadowDistance: number; shadowBlur: number;
  glowColor: string | null; glowSize: number;
  boxPadding: number; boxCorner: BoxCorner;      // the background box: padding as a fraction of the font size; "rounded" | "square"
}
```

```swift
// ExportSession.overlayLayer — the one changed line
container.cornerRadius = l.boxRadius
```

- [ ] **Step 1: Failing Jest tests.**

`modules/clipy-video/__tests__/index.test.ts`:
- The two neutral style literals (line 56 and `const neutral` at line 265) gain `, boxPadding: 0.25, boxCorner: "rounded"`.
- In `"maps a styled text, whole: shadow and glow flattened"`: the input `style` (line 298) gets `boxPadding: 0.4, boxCorner: "square" as const` (in place of the defaults Task 1 put there) and the expected `style` (line 307) ends with `, boxPadding: 0.4, boxCorner: "square" }`.
- Append inside the same `describe`:

```ts
  it("the box fields travel with every text and caption; a sticker sends the defaults", () => {
    const text = toExportOverlay(makeOverlay({ id: "o", background: { color: "#112233", opacity: 0.4 }, style: { ...makeOverlay({ id: "x" }).style, boxPadding: 0.5, boxCorner: "square" } }));
    expect(text).toMatchObject({ backgroundColor: "#112233", backgroundOpacity: 0.4, style: { boxPadding: 0.5, boxCorner: "square" } });
    const caption = toExportOverlay(makeOverlay({ id: "c", kind: "caption", text: "Hi", start: 0, end: 1, style: { ...makeOverlay({ id: "x" }).style, boxPadding: 0.1 } }));
    expect(caption.style).toMatchObject({ boxPadding: 0.1, boxCorner: "rounded" });
    expect(toExportOverlay(makeSticker({ id: "s", emoji: null, shape: "ring" }))).toMatchObject({ shape: "ring", style: { boxPadding: 0.25, boxCorner: "rounded" } });
    expect(Object.keys(text.style)).toEqual(["opacity", "letterSpacing", "lineSpacing", "outlineColor", "outlineWidth", "shadowColor", "shadowOpacity", "shadowDistance", "shadowBlur", "glowColor", "glowSize", "boxPadding", "boxCorner"]);
  });
```

Create `src/editor/model/__tests__/textBoxExport.swift.test.ts`:

```ts
import { readFileSync } from "fs";
import { join } from "path";
import { SHAPES } from "@/src/editor/effects";
import { SHAPE_IDS } from "../types";

/**
 * The native export is never compiled here, so these checks read the Swift source: the text's box takes its padding and its corner
 * from OverlayLayout and from nowhere else, the default box is the old box, and sticker shapes are filled with no fill rule (a
 * counter-wound subpath is then a hole on both sides).
 */
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
const layer = between(session, "static func overlayLayer(", "\n  }\n");

test("the box: its padding and its corner radius come from the layout", () => {
  expect(layer).toContain("let pad = l.padding");
  expect(layer).toContain("container.cornerRadius = l.boxRadius");
  expect(layer.match(/cornerRadius/g)).toHaveLength(1);
  expect(layer).not.toContain("pad / 2");
  // The padded box and the wrapping width both follow the same padding, as in the preview (a border-box of maxWidth).
  expect(layer).toContain("let wrapWidth = max(1, l.maxWidth - 2 * pad)");
  expect(layer).toContain("container.bounds = CGRect(x: 0, y: 0, width: w + 2 * pad, height: h + 2 * pad)");
  expect(layer).toContain("layer.frame = CGRect(x: pad, y: pad, width: w, height: h)");
});

test("only OverlayLayout turns the box fields into pixels: the layer code never reads them or a box constant", () => {
  expect(layer).not.toMatch(/boxPadding|boxCorner|backgroundPadFactor|boxRadiusFactor/);
  const layout = code(read("OverlayLayout.swift"));
  expect(layout).toContain("CGFloat(o.style.boxPadding) * fontSize");
  expect(layout).toContain("o.style.boxCorner == \"square\"");
});

test("the box is still drawn only when the text has a background, in one guarded block", () => {
  const box = between(layer, "if let bg = o.backgroundColor {", "\n    }\n");
  expect(box).toContain("container.backgroundColor = UIColor(hex: bg).withAlphaComponent(CGFloat(o.backgroundOpacity)).cgColor");
  expect(box).toContain("container.cornerRadius = l.boxRadius");
});

test("sticker shapes: neither side sets a fill rule, so a counter-wound inner subpath is a hole in the preview and in the export", () => {
  const sticker = between(session, "static func stickerLayer(", "\n  }\n");
  expect(sticker).toContain("let shapeLayer = CAShapeLayer()");
  expect(sticker).not.toMatch(/fillRule|evenOdd/);
  for (const file of ["StickerView.tsx", "StickerSheet.tsx"]) expect(readFileSync(join(root, "src/editor/components", file), "utf8")).not.toMatch(/fillRule|evenodd/i);
  // The parser both sides' paths are written for: absolute M L C Q Z, nothing else.
  expect(code(read("SVGPath.swift"))).toContain("ch == \"M\" || ch == \"L\" || ch == \"C\" || ch == \"Q\" || ch == \"Z\"");
  for (const id of SHAPE_IDS) expect(SHAPES[id].path).toMatch(/^[MLCQZ0-9 .]+$/);
});

test("the XCTests exist: the box layer and the holes", () => {
  const box = read("Tests/TextBoxTests.swift");
  expect(box).toContain("@testable import ClipyVideo");
  for (const name of ["testTheDefaultBoxIsTheBoxFromBefore", "testSquareCorners", "testPaddingGrowsTheBoxAroundTheSameText", "testNoBackgroundNoBox"]) expect(box).toContain(`func ${name}()`);
  const exportTests = read("Tests/ExportSessionTests.swift");
  expect(exportTests).toContain("func testCompoundShapesKeepTheirHoles()");
  expect(exportTests).toContain(`XCTAssertEqual(Effects.shapePaths.count, ${SHAPE_IDS.length})`);
});
```

- [ ] **Step 2: Run** `npx.cmd jest modules/clipy-video src/editor/model/__tests__/textBoxExport.swift.test.ts` → FAIL.
- [ ] **Step 3: Implement.**

`modules/clipy-video/index.ts`: add `type BoxCorner` to the `types` import; `ExportTextStyle` as in Produces (update its comment: `…; the box fields are the background box's padding and corner`); `toExportStyle` ends with `, boxPadding: s.boxPadding, boxCorner: s.boxCorner,`. Nothing else (a sticker already sends `toExportStyle(DEFAULT_TEXT_STYLE)`).

`modules/clipy-video/ios/ExportSession.swift`, in `overlayLayer`: `container.cornerRadius = pad / 2` → `container.cornerRadius = l.boxRadius`. In the function's doc comment add one sentence: `The background box: its padding (`l.padding`) and its corner radius (`l.boxRadius`) are the layout's — the default style gives the box every text had (a quarter of the font size, corners half of that).` No other line of the function changes.

Create `modules/clipy-video/ios/Tests/TextBoxTests.swift`:

```swift
import CoreGraphics
import QuartzCore
import XCTest
@testable import ClipyVideo

/// The background box of an exported text. Frame 1080 × 1920, fontScale 0.07 → font 134.4 px:
/// default padding 0.25 × 134.4 = 33.6, round corner 33.6 × 0.5 = 16.8 (src/editor/model/__tests__/overlayLayout.vectors.ts).
final class TextBoxTests: XCTestCase {
  private let size = CGSize(width: 1080, height: 1920)
  private let accuracy: CGFloat = 0.0001

  /// A fresh record each time: `@Field` storage is a reference, so a copied record would share its values.
  private func boxed(padding: Double = 0.25, corner: String = "rounded", background: Bool = true) -> ExportOverlay {
    var o = ExportOverlay()
    o.text = "Hello"; o.start = 0; o.end = 2; o.fontScale = 0.07; o.outline = false
    if background { o.backgroundColor = "#000000"; o.backgroundOpacity = 0.6 }
    var style = ExportTextStyle(); style.boxPadding = padding; style.boxCorner = corner
    o.style = style
    return o
  }

  func testTheDefaultBoxIsTheBoxFromBefore() {
    var plain = ExportOverlay()                          // nothing set on the style: what an old request, or an old project, gives
    plain.text = "Hello"; plain.start = 0; plain.end = 2; plain.fontScale = 0.07; plain.outline = false
    plain.backgroundColor = "#000000"; plain.backgroundOpacity = 0.6
    let layer = ExportSession.overlayLayer(plain, renderSize: size)
    let pad: CGFloat = 33.6
    XCTAssertEqual(layer.cornerRadius, pad / 2, accuracy: accuracy)
    XCTAssertEqual(layer.sublayers?.count, 1)                              // the fill, as always
    XCTAssertEqual(layer.sublayers?.first?.frame.origin.x ?? 0, pad, accuracy: accuracy)
    XCTAssertEqual(layer.sublayers?.first?.frame.origin.y ?? 0, pad, accuracy: accuracy)
    let same = ExportSession.overlayLayer(boxed(), renderSize: size)
    XCTAssertEqual(same.cornerRadius, layer.cornerRadius)
    XCTAssertEqual(same.bounds, layer.bounds)
  }

  func testSquareCorners() {
    let layer = ExportSession.overlayLayer(boxed(corner: "square"), renderSize: size)
    XCTAssertEqual(layer.cornerRadius, 0)
    XCTAssertNotNil(layer.backgroundColor)
    XCTAssertEqual(ExportSession.overlayLayer(boxed(corner: "pill"), renderSize: size).cornerRadius, 16.8, accuracy: accuracy)   // unknown → rounded
  }

  func testPaddingGrowsTheBoxAroundTheSameText() {
    let tight = ExportSession.overlayLayer(boxed(padding: 0), renderSize: size)
    let wide = ExportSession.overlayLayer(boxed(padding: 0.5), renderSize: size)
    // "Hello" is one line in both, so only the padding differs: 2 × 0.5 × 134.4 = 134.4 each way.
    XCTAssertEqual(wide.bounds.width - tight.bounds.width, 134.4, accuracy: accuracy)
    XCTAssertEqual(wide.bounds.height - tight.bounds.height, 134.4, accuracy: accuracy)
    XCTAssertEqual(tight.sublayers?.first?.frame.origin.x ?? -1, 0, accuracy: accuracy)
    XCTAssertEqual(wide.sublayers?.first?.frame.origin.x ?? -1, 67.2, accuracy: accuracy)
    XCTAssertEqual(wide.cornerRadius, 16.8, accuracy: accuracy)            // the round corner does not follow the padding
    XCTAssertEqual(tight.cornerRadius, 16.8, accuracy: accuracy)
    XCTAssertEqual(wide.position, tight.position)                          // the box grows about the text's centre
  }

  func testNoBackgroundNoBox() {
    let layer = ExportSession.overlayLayer(boxed(padding: 0.5, corner: "square", background: false), renderSize: size)
    XCTAssertNil(layer.backgroundColor)
    XCTAssertEqual(layer.cornerRadius, 0)
    XCTAssertEqual(layer.sublayers?.first?.frame.origin.x ?? -1, 0, accuracy: accuracy)
  }
}
```

`modules/clipy-video/ios/Tests/ExportSessionTests.swift` — append inside the class, after `testSVGPathParsesShapes`:

```swift
  /// Frames and rings are one compound path: the inner subpath is wound the other way, so it is a hole under the
  /// shape layer's default non-zero rule — also after the export's vertical flip. Points are in the 100 × 100 box.
  func testCompoundShapesKeepTheirHoles() throws {
    XCTAssertEqual(Effects.shapePaths.count, 20)
    let ring = try XCTUnwrap(SVGPath.cgPath(from: try XCTUnwrap(Effects.shapePaths["ring"])))
    XCTAssertTrue(ring.contains(CGPoint(x: 7, y: 50), using: .winding))        // in the band (x 0…14)
    XCTAssertFalse(ring.contains(CGPoint(x: 50, y: 50), using: .winding))      // the hole
    let frame = try XCTUnwrap(SVGPath.cgPath(from: try XCTUnwrap(Effects.shapePaths["frameRounded"])))
    XCTAssertTrue(frame.contains(CGPoint(x: 6, y: 50), using: .winding))
    XCTAssertFalse(frame.contains(CGPoint(x: 50, y: 50), using: .winding))
    // As `stickerLayer` places it: scaled to a 200-px box and flipped to y-up.
    var flip = CGAffineTransform(a: 2, b: 0, c: 0, d: -2, tx: 0, ty: 200)
    let placed = try XCTUnwrap(ring.copy(using: &flip))
    XCTAssertTrue(placed.contains(CGPoint(x: 14, y: 100), using: .winding))
    XCTAssertFalse(placed.contains(CGPoint(x: 100, y: 100), using: .winding))
    // Subpaths wound the same way that overlap are a union, not a hole: the award's left tail under its disc.
    let award = try XCTUnwrap(SVGPath.cgPath(from: try XCTUnwrap(Effects.shapePaths["badgeRibbon"])))
    XCTAssertTrue(award.contains(CGPoint(x: 34, y: 66), using: .winding))
    // Separate subpaths that do not touch: the thought bubble's two dots.
    let thought = try XCTUnwrap(SVGPath.cgPath(from: try XCTUnwrap(Effects.shapePaths["bubbleThought"])))
    XCTAssertTrue(thought.contains(CGPoint(x: 24, y: 80), using: .winding))
    XCTAssertTrue(thought.contains(CGPoint(x: 9, y: 93), using: .winding))
    XCTAssertFalse(thought.contains(CGPoint(x: 40, y: 80), using: .winding))
  }
```

**Verify by reading** (and list in your report what you could not verify): `CGPath.contains(_:using:transform:)` and `CGPathFillRule.winding`; `CALayer.cornerRadius` rounding a `backgroundColor` without `masksToBounds`; `Record` decoding a missing key to the `@Field` default; that `OverlayLayoutResult` has `boxRadius` and `overlayLayer` reads `l.padding` once into `pad`; that nothing else in `ExportSession.swift` builds a text box.

- [ ] **Step 4:** `npx.cmd jest modules/clipy-video src/editor/model` green — `textExport.swift.test.ts`, `overlayLayout.test.ts`, `layersExport.swift.test.ts`, `overlayMotion.swift.test.ts` **unedited**. `npm run typecheck`; `npm test`.
- [ ] **Step 5: Commit** — `git add modules/clipy-video/index.ts modules/clipy-video/__tests__/index.test.ts modules/clipy-video/ios/ExportSession.swift modules/clipy-video/ios/Tests/TextBoxTests.swift modules/clipy-video/ios/Tests/ExportSessionTests.swift src/editor/model/__tests__/textBoxExport.swift.test.ts`; `feat(export): the text box's padding and corner in the request and the layer; hole and box XCTests (uncompiled)`.

---

### Task 9: Docs, README first-build checklist, full checks

**Depends on:** Tasks 1–8.

**Files:** Modify `README.md`, `AGENTS.md`, `docs/superpowers/specs/2026-10-06-text-looks-stickers-design.md`, `docs/superpowers/research/capcut-roadmap.md`; any file the sweep below names.

**Do not touch:** behaviour. A failing test means a mistake here. Never: `src/editor/timelineScroll.ts`, `Timeline.tsx`, `PreviewPlayer.tsx`, `src/editor/toolStrip.ts`, `src/publish/`, `supabase/`.

- [ ] **Step 1: Sweep** with the Grep tool (not `sed`) and fix what is found:
  - `CollapsibleTextStyle` and `"Style"` as a button name in `src`: none.
  - `l.padding / 2` in `src`, `pad / 2` in `modules/clipy-video/ios/ExportSession.swift`: none.
  - `boxPadding` / `boxCorner` outside `types.ts`, `overlayLayout.ts`, `textTemplates.ts`, `TextStyleSection.tsx`, `modules/clipy-video/index.ts`, `OverlayLayout.swift`, the `ExportTextStyle` record and tests: none (nothing else turns them into pixels).
  - `fillRule` anywhere in `src` or `modules/clipy-video/ios`: none.
  - Comments that still say "twelve" for the text templates, "seven" for the shapes, "v14" for the current schema, or "Style block": corrected.
  - `src/__tests__/spacingScale.test.ts`, `outlineIcons.test.ts`, `kitSlider.test.ts`, `noHexLiterals.test.ts`: `git diff --stat main -- src/__tests__` prints nothing (no guard or allow-table was edited).
- [ ] **Step 2: Docs.**
  - `README.md`, section **Text and captions**: Templates — "twenty-four one-tap looks" and the twelve new names (Headline, Neon outline, Soft shadow, Sticky note, Title bar, Stamp, Bubblegum, Cinema, Gold, Chalkboard, 3D pop, Watermark). Replace the "Style" bullet with **Outline, Shadow, Background, Spacing and opacity, Glow** — five rows in the Text panel and in Caption style, closed until tapped; a row that is switched on opens from its name, and switching one on opens it. Background: colour, **Rounded / Square**, **Padding**, **Box opacity**. Caption style: "the same five rows". Add a short **Stickers** paragraph (or extend the existing sticker lines in "Phase 3 features"): twenty shapes (the thirteen new ones by name), and the emoji picker's packs — Faces, Hands, Hearts, Food, Travel, Symbols, More — with Recently used on top and search across all of them. In **Preview vs export** add: the box's padding and corners are the same numbers on both sides; the outline is still a soft halo in the preview and a hard line in the export, most visible on Neon outline, Stamp and Bubblegum.
  - `README.md`, **First native build — things to check**: add a group "Text looks and stickers items" (continue the numbering): (a) **Background box** — padding and corner match the preview for a default box, a square one and a wide one (Sticky note, Title bar, Headline), at 1080p and 4K; (b) **Old projects** — a text with a background made before this update exports with the same box as before; (c) **Wrapping with a wide box** — a long text with Padding at its maximum breaks its lines where the preview does; (d) **Outline looks** — Neon outline, Stamp and Bubblegum: compare the line's thickness with the preview's halo; (e) **Frames and rings** — Frame and Ring export with a see-through middle; Corners shows four separate brackets; (f) **Thought bubble and Award** — the two dots and the two tails are there; (g) **Every new shape** appears, right way up, in its colour.
  - `AGENTS.md` "This repo": in the **Fonts and music** bullet (the one naming `overlayLayout.ts` ↔ `OverlayLayout.swift`) append: ``A text's background box is part of that pair too: `style.boxPadding` / `style.boxCorner` become `padding` / `boxRadius` only there (the default style must keep giving the box every text had — the PROOF tests in `overlayLayout.test.ts` and `migrate.test.ts` are never edited to pass).`` In the **Effects registry** bullet append: ``Shape paths are absolute `M L C Q Z` in a 0–100 box, every subpath clockwise and a hole a counter-clockwise inner subpath — neither side sets a fill rule (`effects.test.ts`).`` Add after the **Panels** bullet: ``- Text look rows: Outline / Shadow / Background / Spacing and opacity / Glow are the five rows of `src/editor/components/TextStyleSection.tsx`, shared by the Text panel and Caption style; every row starts closed. Emoji packs are grouped only by `groupEmoji` in `src/editor/emoji.ts` (by Unicode group and three anchor names); the pack chips live in the sticker panel's lead row and the grid keeps its explicit height.``
  - `docs/superpowers/research/capcut-roadmap.md`: the "Stickers: emoji + shapes" row notes "20 shapes, emoji packs"; the "Sticker library / GIFs / custom stickers" row and "curved text still missing" stay as they are.
  - Spec: Status → `Implemented 2026-10-06 (Swift export unverified until an EAS build exists; on-device checklist pending)`; add a section **3a. As built** after §3: the commit of each task, every deviation the tasks reported (values that changed, tests whose expectations changed — file and what, files outside the plan), what was left as it was, and what no test checks (the device checklist below; how the paths look; every item of §6.3).
- [ ] **Step 3: Full checks.** `npm run typecheck`; `npm test`; `npx.cmd expo-doctor`; `git status --short` shows nothing unexpected; `git diff --stat main` shows **no change** under `ios/`, `android/`, `supabase/`, `src/publish/`, `package.json`, `app.json`, `assets/`, `src/ui/`, `src/theme/`, `src/__tests__/`, and none in `src/editor/timelineScroll.ts`, `src/editor/toolStrip.ts`, `src/editor/components/Timeline.tsx`, `PreviewPlayer.tsx`, `EditorLayout.tsx`, `src/editor/model/ops.ts`, `src/editor/__tests__/OverlayText.test.tsx`, `src/editor/__tests__/StickerSheet.test.tsx`.
- [ ] **Step 4: Commit** — `git add` the files changed (explicit paths); `docs: more text looks and stickers as built, README, AGENTS, first-build checklist`.

**Device checklist (user, Expo Go)** — start with `npx expo start --go --port 8090` and open the app on the iPhone. Use a project you made **before** this update that has at least one text with a background and one sticker (if you have none, any project will do for steps 3–14).

1. **Nothing changed.** Open the old project. Every text, caption and sticker looks exactly as it did: same size, same place, same box behind the text. Tell me if anything looks different.
2. Play it: texts and stickers still appear, move and animate as before. Drag one, pinch it, turn it: all as before.
3. **New looks.** Tap **Text**, add a text, put the keyboard away (drag the panel down a little). In the row of looks, swipe left: after the twelve you know there are twelve new ones. Tap **Headline**, **Sticky note**, **Neon outline**, **Stamp**, **Gold** and **Watermark** one after another. Each should look clearly different. Tell me any that looks wrong or ugly.
4. Tap an **old** look again (for example **Subtitle bar**): it looks as it always did.
5. **The five rows.** Scroll down in the Text panel. You see **Outline**, **Shadow**, **Background**, **Spacing and opacity** and **Glow**, each on its own line, all closed. (The old "Style" line is gone.)
6. Tap the word **Outline** (its switch is on): the colour and **Thickness** appear. Drag Thickness: the edge of the letters gets thicker. Tap **Outline** again: the controls fold away.
7. Switch **Shadow** on: its controls open by themselves. Pick a colour, drag **Distance** and **Blur**. Then press **Undo** once: only the last drag is undone, not all of it.
8. Switch **Background** on. Tap **Square**: the box gets sharp corners. Tap **Rounded**: round again. Drag **Padding** to both ends: the box gets tighter and wider around the words, and the dotted selection frame follows it. Drag **Box opacity**: the box gets more see-through. The corner size does not change with Padding (it is always the size a normal box has): with Padding at the very left and Rounded on, look at a very short word such as "I" and tell me if the box looks strange.
9. Tap **Spacing and opacity**: drag **Letter spacing** and **Line spacing** (type a second line first to see the line spacing).
10. Close the panel, close the project, open it again: the text looks the same as when you left it.
11. **Shapes.** Tap **Stickers**, then **Shapes**. There are twenty now (four per row; scroll the list). Add **Ring**, **Frame** and **Corners** over the video: you must see the **video through the middle**. Add **Thought** (a cloud with two small dots), **Award** (a disc with two ribbon tails), **Curved**, **Two-way**, **Seal**, **Burst**, **Sparkle**, **Banner**, **Round** and **Sharp**. Tell me any shape that looks crooked or odd — a photo helps.
12. **Sticker packs.** Tap **Stickers** again. Next to **Emoji** and **Shapes** there are small buttons: **Faces**, **Hands**, **Hearts**, **Food**, **Travel**, **Symbols**, **More** (swipe that row sideways to see them all). Tap each: the emoji below change, and you can scroll through the whole pack. **Recently used** stays at the top.
13. Tap the search box and type "pizza": it is found even though you were in another pack; the small buttons hide while the keyboard is up. Clear the box and put the keyboard away: you are back in the pack you were in.
14. Tell me if the row of pack buttons is too cramped next to Emoji / Shapes, and whether **More** is a good name for "everything else".
15. Only once you have the real build (not Expo Go): export a clip that has a **Sticky note** text, a **Neon outline** text, a text with a **square, wide** box, a **Ring** and a **Thought** sticker, and compare the video with the preview. The box and the shapes should match; the outline will be a sharper line than in the preview — tell me if it is too thick or too thin.
