# CapCut Group B — Look Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add filter strength and 12 new filters, an Adjust tool with twelve sliders, ten timeline effects and six new transitions to the Clipy editor — approximated in the Expo Go preview, real in the (uncompiled) Swift export.

**Architecture:** Schema v6 adds `filterIntensity` and `adjust` to each clip and `effects[]` to the project. Two new pure modules hold all the numbers — `adjust.ts` (slider value → Core Image parameters and preview layers) and `effectMath.ts` (deterministic time functions for effects) — each mirrored by a Swift twin and guarded by a Jest parity test, like `clipLayout.ts`. The preview draws coloured layers and view transforms over the existing `ClipFrame`; the Swift compositor applies filter → adjust per clip frame, blends transitions, then applies effects to the finished frame.

**Tech Stack:** Expo SDK 57, TypeScript strict, Zustand, `@react-native-community/slider`, `expo-linear-gradient`, react-native-gesture-handler, Jest + RNTL v14; Swift / Core Image (uncompiled).

**Spec:** `docs/superpowers/specs/2026-10-03-capcut-b-look-design.md` (binding; §4 holds every constant — use them verbatim).

## Global Constraints

- **Nothing changes for untouched projects:** defaults are `filterIntensity 1`, every adjust key `0`, `effects []`; a clip with defaults renders the same preview tree and takes the same export path as before.
- All look numbers live in `src/editor/model/adjust.ts` and `src/editor/model/effectMath.ts` (and their Swift twins). Components and the compositor call them; nobody re-derives a constant.
- Keep `src/editor/effects.ts` ↔ `Effects.swift` identical in ids (the existing parity test in `src/editor/__tests__/effects.test.ts` must stay green and be extended).
- Preview is approximate: the "Preview" tag shows whenever a filter, a non-zero adjust value, an effect at the playhead, a transition window, a reversed clip or a visible blur background applies.
- One undo step per slider drag (`beginTransaction` on slide start + `applyTransient`) and per button (`apply`).
- No `scrollTo` or self-retriggering work in scroll-end handlers; `src/editor/timelineScroll.ts` unchanged; adding a lane changes heights only, never scroll widths or paddings.
- Gesture callbacks: `.runOnJS(true)`; never rely on reassigning a captured `let` between callbacks (the worklets Babel plugin copies captures) — keep gesture state in a ref object.
- Expo Go safe: no new dependencies; check installed typings / versioned docs before using an Expo or RN API.
- UI from `src/ui/` and `src/theme/theme.ts`; no hex literals in screens (`src/__tests__/noHexLiterals.test.ts`); look colours (tints) are user-content values and live in the model / registry files, which the guard must allow explicitly.
- Speed arithmetic only in `timeline.ts`; only `clipLayout.ts` computes placement.
- Swift is never compiled here: verify by reading against Apple's documented Core Image filter names and keys; an unknown filter must degrade to "no change" (as `Effects.apply` already does), never crash.
- Windows: PowerShell, no `&&`, `npx.cmd`. Before each commit: `npm run typecheck` and `npm test` green. `git add` explicit paths only. Commit trailer exactly `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- RNTL v14: `render` / `fireEvent` are async — always `await`.

## File Map

| File | Responsibility |
|---|---|
| `src/editor/model/types.ts`, `migrate.ts` | v6 fields, id lists, limits, sanity pass |
| `src/editor/effects.ts`, `modules/clipy-video/ios/Effects.swift` | filter / transition / effect registries (labels, preview params, Core Image chains) |
| `src/editor/model/adjust.ts` ↔ `ios/Adjust.swift` | adjust constants, recipe, preview layers |
| `src/editor/model/effectMath.ts` ↔ `ios/EffectMath.swift` | effect time functions, preview params |
| `src/editor/model/ops.ts`, `src/editor/store.ts`, `toolGroups.ts` | ops, effect selection |
| `src/editor/components/{FilterLayer,AdjustLayer,EffectLayer,PreviewTag,PreviewPlayer}.tsx` | preview |
| `src/editor/components/{FilterSheet,AdjustSheet,EffectSheet,EffectStrengthSheet,EffectLane,EffectPill,EditorToolbar,Timeline}.tsx`, `timelineLayout.ts` | UI |
| `modules/clipy-video/index.ts`, `src/export/useExport.ts` | export request |
| `modules/clipy-video/ios/{ExportSession,ClipyCompositor}.swift`, `ios/Tests/` | Swift export |

---

### Task 1: Schema v6 and registries

**Files:** Modify `src/editor/model/types.ts`, `migrate.ts`, `src/editor/effects.ts`, `modules/clipy-video/ios/Effects.swift`; tests `src/editor/model/__tests__/migrate.test.ts`, `types.look.test.ts` (new), `src/editor/__tests__/effects.test.ts`, `TransitionSheet.test.tsx`.

**Interfaces (produced)** — exactly as spec §3: `SCHEMA_VERSION 6`, the extended `FILTER_IDS` (20) and `TRANSITION_TYPES` (11), `ADJUST_KEYS`, `AdjustKey`, `ClipAdjust`, `ADJUST_RANGE`, `DEFAULT_ADJUST`, `EFFECT_IDS`, `EffectId`, `EffectItem`, `EFFECT_LIMITS`; `Clip.filterIntensity`, `Clip.adjust`; `Project.effects`; plus:
```ts
export function clampAdjust(a: Partial<ClipAdjust> | undefined): ClipAdjust     // every key present, in range, non-finite → 0
export function isNeutralAdjust(a: ClipAdjust): boolean
export function makeEffect(partial: Partial<EffectItem> & Pick<EffectItem, "id">): EffectItem   // test helper: type "shake", start 0, end 2, intensity 0.7
// effects.ts
export const EFFECTS: Record<EffectId, { label: string; icon: IoniconName; previewExact: false }>;
```
- `newVideoClip` / `newPhotoClip` / `makeClip` / `makeProject` gain the defaults (fresh `adjust` object per clip).
- `effects.ts`: `FILTERS` gains the 12 new entries (label + preview tint params within the existing test's bounds); `TRANSITIONS` gains labels (`slide` → "Slide left", `slideRight` "Slide right", `slideUp` "Slide up", `slideDown` "Slide down", `wipe` "Wipe", `spin` "Spin", `blur` "Blur"); `EFFECTS` labels: Glitch, Shake, Zoom pulse, Blur, VHS, Light leak, Flash, RGB split, Old film, Glow (icons from the Ionicons glyph map — verify each name exists).
- `Effects.swift`: `filterIds`, `transitionTypes` updated; new `static let effectIds`; `filterChain` gains the 12 recipes from spec §5 (Core Image names and keys verified by reading Apple's filter reference; keep the existing style).
- Migration v5 → v6 + sanity pass per spec §3.

- [ ] **Step 1: Failing tests** — `types.look.test.ts`: `clampAdjust` (missing keys → 0, out of range clamped per `ADJUST_RANGE`, NaN → 0, unknown keys dropped), `isNeutralAdjust`, factories carry fresh defaults (two clips do not share one `adjust` object). `migrate.test.ts`: v5 → v6 adds defaults; sanity repairs (unknown filter → null, unknown transition → dissolve keeping duration, intensity 7 → 1, NaN → 1, adjust repaired, effect with unknown type dropped, effect shorter than 0.2 s stretched to 0.2, negative start → 0); idempotent; v1 chain reaches 6. `effects.test.ts`: lengths 20 / 11 / 10, every id has a label, Swift `filterIds` / `transitionTypes` / `effectIds` equal the TS lists, and every non-"none" filter id has a `case "<id>":` in `filterChain`. `TransitionSheet.test.tsx`: eleven chips.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4:** `npm run typecheck`; `npm test`. **Step 5: Commit** `feat(model): schema v6 — filter strength, adjust, effects; new filters and transitions`.

---

### Task 2: `adjust.ts`

**Files:** Create `src/editor/model/adjust.ts`, `src/editor/model/__tests__/adjust.test.ts`, `src/editor/model/__tests__/adjust.vectors.ts`; modify `src/__tests__/noHexLiterals.test.ts` only if `adjust.ts` falls inside its scan (allow-list it: look colours are content values).

**Interfaces (produced):**
```ts
export const ADJUST = { brightness: 0.25, contrast: 0.5, saturation: 1, exposureEV: 1.5, neutral: 6500, temperature: 2500, tint: 100,
  curve: 0.15, fadeLift: 0.25, sharpen: 1.2, vignetteIntensity: 1.5, vignetteRadius: 1.5, grainOpacity: 0.25 } as const;
export type AdjustStep =
  | { kind: "exposure"; ev: number }
  | { kind: "temperatureTint"; neutral: [number, number]; target: [number, number] }
  | { kind: "colorControls"; brightness: number; contrast: number; saturation: number }
  | { kind: "toneCurve"; points: [number, number][] }       // five points
  | { kind: "sharpen"; sharpness: number }
  | { kind: "vignette"; intensity: number; radius: number }
  | { kind: "grain"; opacity: number };
/** Export recipe in order; neutral steps are omitted; a neutral adjust gives []. */
export function adjustRecipe(a: ClipAdjust): AdjustStep[]
export interface PreviewLayer { key: string; color: string; opacity: number }
/** Preview approximation (spec §4.1): flat colour layers, omitted when opacity is 0. */
export function adjustPreview(a: ClipAdjust): { layers: PreviewLayer[]; vignette: number }
export const adjustNeedsTag = (a: ClipAdjust) => !isNeutralAdjust(a);
```
Formulas and colours: spec §4.1, verbatim. Tone-curve y values clamped to 0–1.

- [ ] **Step 1: Vectors** — `ADJUST_VECTORS: { name; adjust: ClipAdjust; recipe: AdjustStep[] }[]` with plain numeric literals and the arithmetic in comments: neutral → `[]`; each key alone at +1 (and −1 for two-sided keys); all keys at 0.5; a mixed case with temperature 0.4 + tint −0.5 (one combined step).
- [ ] **Step 2: Failing tests** — every vector (`toEqual` with `toBeCloseTo` on numbers); step order; neutral steps omitted; `adjustPreview`: brightness 1 → white 0.25, brightness −1 + exposure −1 → black 0.5 (capped), temperature ±1 colours and 0.25, tint ±1, saturation −1 → grey 0.55, saturation +1 → no layer, fade 1 → 0.25, vignette 0.5 → 0.3, neutral → `{ layers: [], vignette: 0 }`.
- [ ] **Step 3: Implement.** **Step 4:** checks. **Step 5: Commit** `feat(model): adjust recipe and preview mapping`.

---

### Task 3: `effectMath.ts`

**Files:** Create `src/editor/model/effectMath.ts`, `__tests__/effectMath.test.ts`, `__tests__/effectMath.vectors.ts`.

**Interfaces (produced):**
```ts
export const EFFECT = { ramp: 0.15, shakeAmp: 0.03, shakeFx: 9, shakeFy: 11, shakePhase: 1.3, shakeZoom: 0.06, pulseAmp: 0.12, pulseHz: 2,
  flashHz: 2, flashDecay: 4, leakOpacity: 0.35, leakHz: 0.5, vhsTint: 0.12, vhsShift: 0.004, filmTint: 0.3, filmFlicker: 0.12, filmFps: 12,
  glowLayer: 0.12, glowRadius: 0.02, glowIntensity: 0.8, blurRadius: 0.03, glitchHz: 8, glitchChance: 0.5, glitchShift: 0.08, glitchSplit: 0.01,
  glitchBandMin: 0.08, glitchBandMax: 0.2, rgbSplit: 0.008 } as const;
export const EFFECT_COLORS = { flash: "#FFFFFF", lightLeak: "#FFB347", vhs: "#7A5CFF", oldFilm: "#C8A05A", flicker: "#000000", glow: "#FFFFFF" } as const;
export function hash(n: number): number                       // frac(sin(n·12.9898)·43758.5453), always in [0, 1)
export function envelope(t: number, d: number): number        // 0…1
export function shakeOffset(t: number, d: number, k: number): { x: number; y: number; scale: number }
export function pulseScale(t: number, d: number, k: number): number
export function flashOpacity(t: number, k: number): number
export function leakOpacity(t: number, d: number, k: number): number
export function filmFlicker(t: number, k: number): number
export function glitchSlice(t: number, k: number): { active: boolean; bandY: number; bandH: number; shift: number; split: number }
export interface EffectPreview { translateX: number; translateY: number; scale: number; layers: { color: string; opacity: number }[] }
/** What the Expo Go preview can show for one effect at local time t (fractions of the frame for translate). */
export function effectPreview(type: EffectId, t: number, d: number, k: number): EffectPreview
/** Effects covering project time `time`, in list order, with their local time. */
export function activeEffects(effects: EffectItem[], time: number): { effect: EffectItem; t: number; d: number }[]
/** Combined preview for all active effects: translations add, scales multiply, layers concatenate. */
export function combinedEffectPreview(effects: EffectItem[], time: number): EffectPreview
```
Formulas: spec §4.2, verbatim. An effect covers `start ≤ time < end`. Out-of-range or non-finite inputs give the identity (`translate 0, scale 1, no layers`).

- [ ] **Step 1: Vectors** — `EFFECT_VECTORS` with hand-computed literals: `hash(1)`, `hash(7.5)`; `envelope` at t = 0, 0.075, 0.15, mid, d − 0.075, d, and for d = 0.2 (ramps of 0.1); `shakeOffset` at three times; `pulseScale` at 0.25 s; `flashOpacity` at 0, 0.1, 0.25, 0.5; `leakOpacity`; `filmFlicker`; `glitchSlice` at two slices.
- [ ] **Step 2: Failing tests** — every vector; `hash` stays in [0, 1) for 1000 inputs; envelope symmetric; preview identity for blur / glitch / rgbSplit (no layers, no transform); `activeEffects` boundaries (start inclusive, end exclusive) and order; `combinedEffectPreview` with shake + flash.
- [ ] **Step 3: Implement.** **Step 4:** checks. **Step 5: Commit** `feat(model): deterministic effect maths and preview params`.

---

### Task 4: Ops and selection

**Files:** Modify `src/editor/model/ops.ts`, `src/editor/store.ts`, `src/editor/toolGroups.ts`; tests `src/editor/model/__tests__/ops.look.test.ts` (new), `src/editor/__tests__/store.effects.test.ts` (new), `toolGroups.test.ts`.

**Interfaces (produced):**
```ts
export function setClipFilterIntensity(p: Project, clipId: string, intensity: number): Project      // clamped 0–1
export function setFilterForAllClips(p: Project, filter: FilterId | null, intensity?: number): Project   // existing op; now also copies the strength when given
export function setClipAdjust(p: Project, clipId: string, patch: Partial<ClipAdjust>): Project      // clamped per key
export function resetClipAdjust(p: Project, clipId: string): Project
export function setAdjustForAllClips(p: Project, adjust: ClipAdjust): Project                        // fresh copy per clip
export function addEffect(p: Project, type: EffectId, playhead: number, id?: string): Project        // [playhead, playhead + defaultDuration] clamped to the project's end; unchanged when the project has no clips or the room left is < minDuration
export function updateEffect(p: Project, id: string, patch: Partial<Pick<EffectItem, "start" | "end" | "intensity">>): Project   // start ≥ 0, end ≤ total duration, end − start ≥ minDuration (the edge being dragged yields), intensity 0–1
export function moveEffect(p: Project, id: string, newStart: number): Project                        // keeps its length; clamped inside the project
export function deleteEffect(p: Project, id: string): Project
export function duplicateEffect(p: Project, id: string): Project                                     // placed right after the original when it fits, else same range
// store
selectedEffectId: string | null; selectEffect(id: string | null): void;
```
- Follow `updateOverlayShared` / `moveOverlay` for the range rules. Every op returns the same project object when nothing changes.
- `duplicateClip`, `splitClipAt`, `insertFreezeFrame`, `replaceClipMedia` keep `filterIntensity` and copy `adjust` (no shared object between two clips; the freeze still copies both).
- `applyTemplate` sets `filterIntensity 1` when it sets a filter.
- Store: `selectEffect(id)` clears clip and overlay selection; `select` / `selectOverlay` clear the effect selection; the "selection still exists" check after `apply` / undo covers effects too.
- `ToolId` gains `adjust | effect | effectStrength | effectDuplicate | effectDelete`; Effects group tools = `filter, adjust, effect, speed, transition, templates, background`; `groupForSelection` gains an `effectId` field in its `sel` argument → `"effects"`.

- [ ] **Step 1: Failing tests** — one per op and rule above (clamps, identity returns, range rules at both edges, unknown ids); deep-copy assertions (`not.toBe`) for `adjust` after duplicate / split / freeze; store selection exclusivity, selection cleared when the effect is deleted or undone away; one slider drag = one undo step; `groupForSelection` cases (existing ones unchanged).
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4:** checks. **Step 5: Commit** `feat(model): filter strength, adjust and effect ops; effect selection`.

---

### Task 5: Preview layers

**Files:** Modify `src/editor/components/FilterLayer.tsx`, `PreviewTag.tsx`, `PreviewPlayer.tsx`; create `AdjustLayer.tsx`, `EffectLayer.tsx`; tests `FilterLayer.test.tsx`, `AdjustLayer.test.tsx`, `EffectLayer.test.tsx`, `PreviewTag.test.tsx`, `PreviewPlayer.test.tsx`.

**Behaviour**
- `FilterLayer({ filter, intensity = 1 })`: every layer's opacity × `intensity`; intensity 0 renders nothing. Existing callers (filter sheet tiles) keep working without the prop.
- `AdjustLayer({ adjust })`: renders `adjustPreview(adjust).layers` as absolute full-frame views (`pointerEvents="none"`, `testID="adjust-<key>"`) and, when `vignette > 0`, an edge vignette built from four `expo-linear-gradient` strips (black → transparent) with overall opacity `vignette` (check the installed typings for `LinearGradient` props). Nothing rendered for a neutral adjust.
- `EffectLayer`: two parts driven by `combinedEffectPreview(project.effects, playhead)` — `useEffectTransform()` returns the style (`transform: [{ translateX: tx × frameW }, { translateY: ty × frameH }, { scale }]`) applied to the view that wraps `ClipFrame` (the frame container clips with `overflow: "hidden"`), and `<EffectOverlays />` renders the colour layers above the picture and below text / stickers. With no active effect the wrapper style is `undefined` and nothing is rendered (same tree as before).
- Layer order in the preview frame: `ClipFrame` (inside the effect transform) → `FilterLayer` (with the clip's intensity) → `AdjustLayer` → `EffectOverlays` → `TransitionLayer` → overlays (text / stickers) → gestures / tag as today.
- `needsPreviewTag`: also true when `adjustNeedsTag(clip.adjust)` or `activeEffects(project.effects, playhead).length > 0`.

- [ ] **Step 1: Failing tests** — FilterLayer opacities at intensity 0.5 and 0; AdjustLayer layers for the `adjustPreview` cases, vignette present / absent, nothing for neutral; EffectLayer: shake at a known time gives the expected pixel translation, flash renders a white layer with the expected opacity, no effect → no transform and no layers; tag conditions; PreviewPlayer renders the layers in the stated order and an untouched project renders no adjust / effect nodes.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4:** checks. **Step 5: Commit** `feat(preview): filter strength, adjust layers and effect preview`.

---

### Task 6: Filter strength and Adjust sheets

**Files:** Modify `src/editor/components/FilterSheet.tsx`, `EditorToolbar.tsx`; create `AdjustSheet.tsx`; tests `FilterSheet.test.tsx`, `AdjustSheet.test.tsx`, `EditorToolbar.test.tsx`.

**Behaviour**
- Filter sheet: under the tiles a `Slider` (`testID="filter-strength"`, 0–1, step 0.01) with a label "Strength 80" (rounded percent); disabled when the filter is None; `onSlidingStart={beginTransaction}`, `onValueChange` → `applyTransient(setClipFilterIntensity)`; picking a filter keeps the current strength; "Apply to all clips" passes filter and strength.
- Adjust sheet (kit `Sheet`, title "Adjust", action "Apply to all"): a horizontal row of twelve `Chip`s (labels: Brightness, Contrast, Saturation, Exposure, Warmth, Tint, Highlights, Shadows, Sharpen, Vignette, Fade, Grain; a chip shows a dot / "•" suffix when its value is non-zero); one `Slider` (`testID="adjust-slider"`) for the selected key using `ADJUST_RANGE[key]` (step 0.01), value label as −100…100 or 0…100; a `Reset` secondary button (all keys → 0, one `apply`, disabled when neutral); slider drags are one undo step; "Apply to all" → `setAdjustForAllClips(clip.adjust)` with a light haptic. Slider theming as in `TransitionSheet`.
- Toolbar: `adjust` tool (icon verified in the glyph map) enabled with a selected clip (video or photo); opens the sheet.

- [ ] **Step 1: Failing tests** — strength slider present, disabled for None, a drag changes `filterIntensity` and is one undo step, apply-to-all copies both; Adjust: chips, selecting a key changes the slider's range, a drag sets that key only, dot shows, Reset zeroes and is one step, Apply to all; toolbar enable rule.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4:** checks. **Step 5: Commit** `feat(editor): filter strength slider and Adjust sheet`.

---

### Task 7: Effects on the timeline

**Files:** Create `src/editor/components/{EffectSheet,EffectStrengthSheet,EffectLane,EffectPill}.tsx`; modify `Timeline.tsx`, `src/editor/timelineLayout.ts`, `EditorToolbar.tsx`, `src/theme/theme.ts` (a `laneEffect` colour token); tests alongside (`EffectSheet.test.tsx`, `EffectLane.test.tsx`, `EditorToolbar.test.tsx`, `timelineLayout.test.ts`, `Timeline.test.tsx`).

**Behaviour**
- `timelineLayout.ts`: three lanes — `laneTop(index: 0 | 1 | 2)`, `TIMELINE_HEIGHT = CLIP_AREA_HEIGHT + 3 × (LANE_HEIGHT + LANE_GAP)`; check every consumer of `TIMELINE_HEIGHT` / `laneTop` (music lane, overlay lane) and keep their positions; the effects lane is the third.
- `EffectLane` / `EffectPill`: modelled on `OverlayLane` / `OverlayPill` (read both first): pill at `timeToX(start)`, width from its length, label = `EFFECTS[type].label`, `theme.colors.laneEffect`, selected border; long-press drag moves (`moveEffect`), two handles trim (`updateEffect`), one undo step per drag, gesture state in a ref object, `.runOnJS(true)`; tap selects (`selectEffect`).
- `EffectSheet` (title "Effects"): ten tiles (icon + label, 2 rows or a horizontal scroll); tap → `apply(addEffect(type, playhead, id))`, select the new effect, close the sheet, light haptic; when the op returns the same project show a toast "Add a clip first." (no clips) or "No room for an effect here." and keep the sheet open.
- Toolbar: `effect` tool always enabled when a project is open. When an effect is selected the sub-row shows `Strength` (opens `EffectStrengthSheet`: one slider 0–100, one undo step per drag), `Duplicate`, `Delete` (one `apply` each; delete clears the selection) — follow how the sub-row already swaps for a selected text / sticker overlay.
- The lane must not affect scroll geometry: same content width and paddings; heights only.

- [ ] **Step 1: Failing tests** — layout constants and `laneTop(2)`; lane renders a pill per effect at the right x / width; tap selects; sheet adds at the playhead, clamps at the project's end, toasts on refusal; strength slider one undo step; duplicate / delete; sub-row swap; Timeline height uses three lanes and the scroll content's paddings are unchanged.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4:** checks. **Step 5: Commit** `feat(editor): effects sheet and timeline lane`.

---

### Task 8: Export request

**Files:** Modify `modules/clipy-video/index.ts`, `modules/clipy-video/__tests__/index.test.ts`, `src/export/useExport.ts`, `src/export/__tests__/useExport.test.ts`.

**Interfaces (produced):**
```ts
export interface ExportClip { /* existing */ filterIntensity: number; adjust: ClipAdjust }
export interface ExportEffect { type: string; start: number; end: number; intensity: number }
export interface ExportRequest { /* existing */ effects: ExportEffect[] }
export function toExportEffect(e: EffectItem): ExportEffect
```
`toExportClip` adds the two fields (fresh `adjust` copy); `useExport` adds `effects` (clipped to the exported duration; effects entirely outside are dropped).

- [ ] **Step 1: Failing tests** — whole-object `toEqual` for a default clip and an adjusted clip; fresh copies; request with two effects in order, one clipped at the end, one dropped.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4:** checks. **Step 5: Commit** `feat(export): send filter strength, adjust and effects to the engine`.

---

### Task 9: Swift — adjust, filter strength, clip-frame order

**Files:** Create `modules/clipy-video/ios/Adjust.swift`, `ios/Tests/AdjustTests.swift`, `src/editor/model/__tests__/adjust.parity.test.ts`; modify `ExportSession.swift` (records, `LayerSpec` data), `ClipyCompositor.swift`.

**Behaviour**
- Records: `ExportClip.filterIntensity` (default 1), `adjust` (nested record, twelve `Double` fields default 0); `ExportRequest.effects` (array of a new `ExportEffect` record — decoded here, rendered in Task 11).
- `Adjust.swift`: the `ADJUST` constants (same names) and `Adjust.steps(_:) → [(name: String, params: [String: Any])]` mirroring `adjustRecipe` step for step and in the same order; grain = `CIRandomGenerator` → monochrome (`CIColorControls` saturation 0) → alpha scaled to the opacity (`CIColorMatrix` A vector) → `CISourceOverCompositing` over the frame, cropped to the frame, translated by a per-frame offset so the noise changes each frame (pass the frame's time).
- Compositor, per clip frame: placement + background (unchanged) → filter chain; when `filterIntensity < 1` mix `original → filtered` with `CIDissolveTransition` (`inputTime = intensity`); intensity 0 or no filter skips the chain → adjust steps (skipped when neutral). A clip with defaults takes exactly today's code path.
- Parity test (Jest): constants in `Adjust.swift` equal `ADJUST`; the step order (filter names in order of appearance) matches; the `ADJUST_VECTORS` expected numbers appear in the Swift test table.

- [ ] **Step 1: Parity test (failing).** **Step 2: Implement** (list every API you could not verify by reading). **Step 3:** `npm run typecheck`; `npm test`. **Step 4: Commit** `feat(ios): adjust chain and filter strength in the compositor (uncompiled)`.

---

### Task 10: Swift — new transitions

**Files:** Modify `modules/clipy-video/ios/ClipyCompositor.swift` (`blend`), `ios/Tests/` (blend tests file — add `TransitionBlendTests.swift` if none exists); extend `src/editor/__tests__/effects.test.ts`.

**Behaviour** (spec §5): `slideRight` (incoming enters from the left), `slideUp` (incoming enters from the bottom and moves up — mind Core Image's y-up), `slideDown`; `wipe` (incoming cropped to a rectangle growing left → right over the outgoing; no movement); `spin` (outgoing rotated 0 → 90° clockwise on screen about the centre and scaled 1 → 0.6, dissolved into the incoming); `blur` (radius up to 4 % of the shorter side: outgoing blurs up while p < 0.5, incoming blurs down after; clamped extents; cross-dissolve). Unknown types still dissolve. At p = 0 every type shows only the outgoing frame; at p = 1 only the incoming.

- [ ] **Step 1: Failing Jest test** — every non-"none" `TRANSITION_TYPES` id except `dissolve` has a `case "<id>"` in `blend`. **Step 2: Implement + XCTests** (extent and end-point checks). **Step 3:** checks. **Step 4: Commit** `feat(ios): slide directions, wipe, spin and blur transitions (uncompiled)`.

---

### Task 11: Swift — effects

**Files:** Create `modules/clipy-video/ios/EffectMath.swift`, `ios/EffectRenderer.swift`, `ios/Tests/EffectMathTests.swift`, `src/editor/model/__tests__/effectMath.parity.test.ts`; modify `ExportSession.swift`, `ClipyCompositor.swift`.

**Behaviour**
- `EffectMath.swift`: the `EFFECT` constants (same names) and the scalar functions of `effectMath.ts` (`hash`, `envelope`, `shakeOffset`, `pulseScale`, `flashOpacity`, `leakOpacity`, `filmFlicker`, `glitchSlice`), mirrored expression for expression (mind `frac` for negative numbers: `x − floor(x)`).
- `ClipyInstruction` carries the effects overlapping its time range (project time = composition time). After the frame is composed (single clip or transition blend) the compositor applies each active effect in order through `EffectRenderer.apply(type:image:t:d:k:size:) → CIImage`, always cropped back to the frame: shake / zoomPulse (affine about the centre, clamped extent so no transparent edge), flash / lightLeak (constant colour composited with the computed alpha), vhs (tint + R/B channel offset + scan lines from `CIStripesGenerator` at low alpha), oldFilm (`CISepiaTone` + `CIVignette` + flicker + grain), glow (`CIBloom`), blur (`CIGaussianBlur`, clamped), glitch (band crop shifted horizontally + channel split), rgbSplit (channels separated with `CIColorMatrix`, offset, recombined with `CIAdditionCompositing`). Unknown type → image unchanged.
- No active effect → today's path untouched.
- Parity test (Jest): constants equal `EFFECT`; `effectIds` handled (a `case "<id>"` per id in `EffectRenderer`); `EFFECT_VECTORS` numbers appear in the Swift test table.

- [ ] **Step 1: Parity test (failing).** **Step 2: Implement** (list unverified APIs). **Step 3:** checks. **Step 4: Commit** `feat(ios): timeline effects in the compositor (uncompiled)`.

---

### Task 12: Docs and full checks

**Files:** `README.md`, `AGENTS.md`, the spec's Status line, `docs/superpowers/research/capcut-roadmap.md`.

- [ ] **Step 1** — README "Look" section (filter strength, Adjust, effects, transitions; what the preview shows vs export only). AGENTS.md: add `- Look maths: keep src/editor/model/adjust.ts ↔ modules/clipy-video/ios/Adjust.swift and src/editor/model/effectMath.ts ↔ EffectMath.swift identical (constants and vectors).` Spec Status → `Implemented 2026-10-03 (Swift export unverified until an EAS build exists; on-device checklist pending)`. Roadmap group B: filters, Adjust, effects, transitions rows → "Have"; HSL / LUT and body effects unchanged.
- [ ] **Step 2** — `npm run typecheck`; `npm test`; `npx.cmd expo-doctor`; `npm ls --all | Select-String invalid` (empty).
- [ ] **Step 3: Commit** `docs: look tools (CapCut group B)`.

**Device checklist (user, Expo Go):** pick a filter → drag Strength → Adjust: Brightness, Warmth, Vignette, then Reset → Effects: add Shake and Flash, move and trim the pills, change Strength, delete one → Transition: pick Wipe → play through → undo everything → close and reopen the project → the timeline still scrubs smoothly with the third lane.
