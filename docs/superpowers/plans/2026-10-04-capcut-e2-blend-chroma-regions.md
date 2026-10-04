# CapCut Group E Round 2 — Blend Modes, Green Screen, Blur / Mosaic Box Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Blend modes for layers, a hue-based green screen for layers and clips, and blur / mosaic boxes placed on the picture — export-only looks, with honest previews (tag; a frosted rectangle for boxes).

**Architecture:** Schema v12 adds `Clip.blend`, `Clip.chroma` and `EffectItem.rect` (two new effect ids reuse the whole effects lane machinery). One pure module `chroma.ts` (mirrored by `Chroma.swift`) defines the keying function. The preview only draws the region rectangle and the tag; the Swift compositor does the real work.

**Tech Stack:** Expo SDK 57, TypeScript strict, Zustand, react-native-gesture-handler, Jest + RNTL v14; Swift / Core Image (uncompiled).

**Spec:** `docs/superpowers/specs/2026-10-04-capcut-e2-blend-chroma-regions-design.md` (binding; §2 and §3 hold every constant and formula).

## Global Constraints

- **Projects without these features are unchanged:** defaults `blend "normal"`, `chroma null`, `rect null`; same preview tree, same export path.
- `src/editor/effects.ts` ↔ `Effects.swift` ids identical; `effectMath.ts` ↔ `EffectMath.swift` / `EffectRenderer` cases stay in parity (existing parity tests must stay green in EVERY task).
- Keying maths only in `src/editor/model/chroma.ts` (and `Chroma.swift`).
- A clip or layer by id is resolved with `findItem` / `itemOffsetAt`, never `project.clips.find`.
- One undo step per gesture / drag / button.
- No `scrollTo` or self-retriggering work in scroll-end handlers; `src/editor/timelineScroll.ts` unchanged.
- Gestures: `.runOnJS(true)`; gesture state in a ref object.
- Expo Go safe: no new dependencies; check installed typings before using an Expo / RN API.
- UI from `src/ui/` and `src/theme/theme.ts`; no hex literals in screens (key colours live in the model file, allow-listed).
- Swift is never compiled here: verify by reading; list unverified APIs.
- Windows: PowerShell, no `&&`, `npx.cmd`. Never run `expo lint` or anything that edits package.json. Before each commit: `npm run typecheck` and `npm test` green. `git add` explicit paths only. Commit trailer exactly `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- RNTL v14: `render` / `fireEvent` are async — always `await`.

---

### Task 1: Schema v12 and registries

**Files:** Modify `src/editor/model/types.ts`, `migrate.ts`, `src/editor/effects.ts`, `src/editor/model/effectMath.ts` (preview identity for the two new ids), `modules/clipy-video/ios/Effects.swift` (`effectIds`), `modules/clipy-video/ios/EffectRenderer.swift` (two pass-through `case`s so the parity tests stay green until Task 6); tests `migrate.test.ts`, `types.layers2.test.ts` (new), `effects.test.ts`, existing parity tests.

**Interfaces (produced)** — spec §2 verbatim, plus `clampChroma(v: unknown): ChromaKey | null`, `clampEffectRect(v: unknown): EffectRect` (inside 0–1, sides ≥ `REGION_LIMITS.min`, invalid → the default rect), `BLENDS: Record<BlendId, { label: string }>` (Normal, Screen, Multiply, Overlay, Lighten, Darken) and `EFFECTS` entries for `blurBox` ("Blur box") and `mosaicBox` ("Mosaic box") with icons from the glyph map. Factories default the new fields (`makeEffect` gives a rect for region types). Migration v11 → v12 + sanity pass per spec §2.

- [ ] **Step 1: Failing tests** — clamps; factories; v11 → v12 defaults; sanity repairs (blend on a main clip forced normal; bad chroma colour → null; region without rect → default; rect on a non-region removed; rect clamped); idempotent; v1 chain reaches 12; registry counts (6 blends, 12 effects); Swift `effectIds` equals the TS list and `EffectRenderer` has a `case` per id (existing parity tests extended, still green).
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4:** `npm run typecheck`; `npm test`. **Step 5: Commit** `feat(model): schema v12 — blend, green screen, region effects`.

---

### Task 2: `chroma.ts` and ops

**Files:** Create `src/editor/model/chroma.ts`, `__tests__/chroma.test.ts`, `__tests__/chroma.vectors.ts`; modify `src/editor/model/ops.ts`, `src/__tests__/noHexLiterals.test.ts` (allow-list if needed); tests `ops.e2.test.ts` (new).

**Interfaces (produced):**
```ts
// chroma.ts
export function rgbToHsv(r: number, g: number, b: number): { h: number; s: number; v: number }   // h in degrees [0, 360)
export function hexToRgb(hex: string): { r: number; g: number; b: number } | null                 // 0…1
export function hueDistance(a: number, b: number): number                                         // 0…180
export function chromaAlpha(r: number, g: number, b: number, key: string, strength: number): number
// ops.ts
export function setClipBlend(p: Project, id: string, blend: BlendId): Project        // layers only; a main clip id → same project
export function setClipChroma(p: Project, id: string, chroma: ChromaKey | null): Project   // clips and layers; clamped; strength rounded to 2 decimals
export function setEffectRect(p: Project, effectId: string, rect: EffectRect): Project     // region effects only; clamped
```
- `addEffect` gives a region effect the default rect; `duplicateEffect` copies the rect (fresh object); `duplicateClip` / `duplicateLayer` / split / freeze copy `blend` and `chroma` (fresh objects; a freeze still keeps chroma, blend normal); `replaceClipMedia` keeps them.
- Formula: spec §3 verbatim.

- [ ] **Step 1: Vectors** (plain literals, arithmetic in comments): pure green with the green key at strengths 0, 0.5, 1 → 0; a yellow-green on the ramp; a skin tone → 1; mid grey → 1; white → 1; near-black green → 1; pure blue with the blue key → 0; pure green with the blue key → 1; any pixel with a grey key → 1; `rgbToHsv` for the six primaries / secondaries; `hueDistance(350, 10) = 20`.
- [ ] **Step 2: Failing tests** — every vector; ops (kind rules, clamps, identity returns, copies via `not.toBe`, one slider drag = one undo step).
- [ ] **Step 3: Implement.** **Step 4:** checks. **Step 5: Commit** `feat(model): green-screen maths; blend, chroma and region-rect ops`.

---

### Task 3: Preview — region box and tag

**Files:** Create `src/editor/components/RegionBox.tsx`; modify `PreviewPlayer.tsx`, `PreviewTag.tsx`; tests `RegionBox.test.tsx`, `PreviewTag.test.tsx`, `PreviewPlayer.test.tsx`.

**Behaviour**
- `RegionBoxes({ frameW, frameH })`: for every region effect covering the playhead draw a frosted rectangle at its rect (`theme.colors.scrim`-style translucent fill + a hairline border; mosaic boxes additionally draw a coarse checker of 4 × N translucent squares so the two kinds look different), `pointerEvents="none"`, above the picture and layers and below text / stickers.
- For the SELECTED region effect (when the playhead is inside it): a gold outline, drag to move, pinch to resize both sides proportionally, and two corner handles (top-left and bottom-right, 44 pt hit areas) that resize freely; every update goes through `setEffectRect` with `beginTransaction` + `applyTransient`, state in a ref, `.runOnJS(true)`. Pure helper functions for the rect maths (`moveRect`, `resizeRectCorner`, `scaleRect`) live in the model (`src/editor/model/regionRect.ts`) with tests; rect clamping stays in the op.
- The clip / layer gesture layer must not also react: while a region effect is selected no clip is selected (selection is exclusive), so `ClipGestures` is already off — verify.
- `needsPreviewTag`: true for a non-normal blend on a layer at the playhead, a chroma key on the main clip or a layer at the playhead, or a region effect covering the playhead.

- [ ] **Step 1: Failing tests** — rect helpers (move clamps, corner resize, proportional scale, minimum); boxes render at the right pixels for effects covering the playhead only; selected box has handles and writes the rect with one undo step per gesture; not drawn / no handles outside its time; tag conditions; a project without regions renders the same tree as before.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4:** checks. **Step 5: Commit** `feat(preview): blur / mosaic box placement; tag for blend and green screen`.

---

### Task 4: Blend and Green screen sheets, toolbar

**Files:** Create `src/editor/components/BlendSheet.tsx`, `ChromaSheet.tsx`; modify `src/editor/toolGroups.ts`, `EditorToolbar.tsx`; tests alongside.

**Behaviour** — ToolIds `blend | chroma`; Edit group: insert after `mask` (`…, opacity, mask, blend, chroma, …`). `blend`: enabled only when the selected item is a layer; `BlendSheet` — six tiles (label + a small two-square swatch drawn with theme colours), selected ring, one `apply(setClipBlend)` per pick (re-pick = no-op), note text "Shows in the exported video". `chroma` ("Green screen"): enabled for a selected clip or layer (photo or video); `ChromaSheet` — switch (on → `{ color: CHROMA_PRESETS[0], strength: CHROMA.defaultStrength }`, off → null), colour chips for the two presets ("Green", "Blue") followed by the existing `ColorRow` palette, Strength slider 0–1 ("Strength 50 %", begin + transient), and the same note. Both sheets resolve their item with the shared `useItem` lookup and render null when it disappears. The Effects sheet needs no change beyond the two new registry entries appearing as tiles (verify with a test that tapping "Blur box" adds a region effect with the default rect).

- [ ] **Step 1: Failing tests** — groups; enable matrix (no selection, main clip, layer, photo layer) for the two tools; blend picks (one undo step, ring, refused for a main clip id); chroma switch / colour / slider (one undo step per drag); notes shown; effects sheet adds region effects.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4:** checks. **Step 5: Commit** `feat(editor): blend and green-screen sheets; blur / mosaic box tiles`.

---

### Task 5: Export request

**Files:** Modify `modules/clipy-video/index.ts` (+ test), `src/export/useExport.ts` (+ test).

**Behaviour** — `ExportClip.blend` (always "normal" for main clips), `ExportClip.chroma` (`{ color, strength } | null`, fresh copy); `ExportEffect.rect` (`{ x, y, w, h } | null`, fresh copy; null for non-region effects). Whole-object tests.

- [ ] **Step 1: Failing tests.** **Step 2: Implement.** **Step 3:** checks. **Step 4: Commit** `feat(export): send blend, green screen and effect rectangles to the engine`.

---

### Task 6: Swift — chroma, blend, region effects

**Files:** Create `modules/clipy-video/ios/Chroma.swift`, `ios/Tests/ChromaTests.swift`, `src/editor/model/__tests__/chroma.parity.test.ts`; modify `ExportSession.swift` (records, specs), `ClipyCompositor.swift`, `EffectRenderer.swift`, `MediaPrePass.swift` (rewrite carries the new clip fields), existing parity tests as needed.

**Behaviour** — spec §4 and §6. Records: `ExportClip.blend` (default "normal"), `chroma` (optional nested record), `ExportEffect.rect` (optional nested record). `Chroma.swift`: constants named as `CHROMA`; `rgbToHsv`, `hueDistance`, `alpha(r:g:b:key:strength:)` mirroring the TS; `cubeData(key:strength:)` → `Data` of `cube³` premultiplied RGBA Float32 entries in the order `CIColorCube` expects (blue outermost, then green, then red innermost — verify the documented layout and state it), cached per (key, strength rounded to 2 decimals) in a small dictionary; `apply(to:key:strength:)` using `CIColorCube` (`inputCubeDimension`, `inputCubeData`) built with `CIFilter(name:)` + nil-guard. Compositor: in the placed-picture chain (shared by clips and layers) the green screen runs after the look and before the mask; a main clip with a chroma key draws its background behind (as a masked clip does). Overlay compositing: Normal → source-over as today; other modes → the matching Core Image blend filter with the layer picture as `inputImage` and the running frame as `inputBackgroundImage`, cropped to the frame, then the existing opacity mix between the running frame and that result; pixels outside the layer's picture must stay the running frame (Core Image blend modes return the background where the input is transparent — verify per mode from the documented behaviour; if unsure, mask the blended result to the picture's alpha before mixing). `EffectRenderer`: `blurBox` — crop the frame to the box (top-left fractions → Core Image rect, one helper), clamp, `CIGaussianBlur` radius `0.06 × k × shorter side`, crop back to the box, composite over the frame; `mosaicBox` — `CIPixellate` (`inputScale` = `max(4, 0.08 × k × shorter side)`, `inputCenter` = the box origin) on the clamped crop, crop to the box, composite; a nil / invalid rect → image unchanged. Defaults (normal, no chroma, no region effects) take today's path.

- [ ] **Step 1: Parity test (failing)** — `CHROMA` constants equal; vectors' numbers in the Swift test table; the `EffectRenderer` cases for the two ids are no longer pass-throughs (source-reading). **Step 2: Implement + XCTests** (alpha vectors, cube size and one entry, rect conversion). List unverified APIs. **Step 3:** checks. **Step 4: Commit** `feat(ios): green screen, layer blend modes, blur / mosaic boxes (uncompiled)`.

---

### Task 7: Docs and full checks

**Files:** `README.md`, `AGENTS.md`, the spec's Status line, `docs/superpowers/research/capcut-roadmap.md`.

- [ ] **Step 1** — README: extend the "Layers" section (Blend, Green screen, Blur / Mosaic box; what the preview shows); first-build checklist additions (each blend mode; green screen on a real green-screen clip incl. edge quality; blur and mosaic boxes land where the preview rectangle was). AGENTS.md: `- Green-screen maths: keep src/editor/model/chroma.ts ↔ modules/clipy-video/ios/Chroma.swift identical (constants and vectors).` Spec Status → `Implemented 2026-10-04 (Swift export unverified until an EAS build exists; on-device checklist pending)`. Roadmap group E: blend modes, chroma key, mosaic / blur region → "Have (export only)".
- [ ] **Step 2** — `npm run typecheck`; `npm test`; `npx.cmd expo-doctor`; `npm ls --all | Select-String invalid` (empty).
- [ ] **Step 3: Commit** `docs: blend modes, green screen, blur / mosaic boxes (CapCut group E, round 2)`.

**Device checklist (user, Expo Go):** select a layer → Blend → Screen (the "Preview" tag appears; the picture does not change — that is expected) → Green screen: switch on, Green, drag Strength → Effects → Blur box: a frosted rectangle appears; drag it, pinch it, pull a corner; move and trim its pill on the timeline → add a Mosaic box → undo everything.
