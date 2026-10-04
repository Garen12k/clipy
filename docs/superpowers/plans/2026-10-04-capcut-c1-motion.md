# CapCut Group C Round 1 — Animations and Keyframes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add In / Out / Combo animations to clips, In / Out / Loop animations to text and stickers, and keyframes (position, size, rotation, opacity) for clips, text and stickers — exact in the Expo Go preview, mirrored in the (uncompiled) Swift export.

**Architecture:** Schema v7 adds `animation` and `keyframes` to clips and overlays. One pure module, `src/editor/model/motion.ts` (mirrored by `Motion.swift`, guarded by a Jest parity test), resolves "where is this thing and how opaque is it at time t" from the base value (static or keyframed) plus animation deltas. The preview and the export both call it and nothing else computes motion. Edits made while keyframes exist are routed to the pin at the playhead by two ops (`editClipTransformAt`, `editOverlayAt`).

**Tech Stack:** Expo SDK 57, TypeScript strict, Zustand, react-native-gesture-handler, Jest + RNTL v14; Swift / Core Image / Core Animation (uncompiled).

**Spec:** `docs/superpowers/specs/2026-10-04-capcut-c1-motion-design.md` (binding; §4 holds every formula and constant — use them verbatim).

## Global Constraints

- **Nothing changes for untouched projects:** defaults are no animation and no keyframes; such a clip / overlay renders the same preview tree and takes the same export path as before.
- All motion numbers and formulas live in `src/editor/model/motion.ts` (and `Motion.swift`). Components, ops and the compositor call it; nobody re-derives a formula.
- Clip keyframe time is SOURCE time; every conversion between source time and clip-local output time goes through `src/editor/model/timeline.ts` (the only place that may use `speed` or `reversed` arithmetic).
- Placement still goes only through `clipLayout.ts`; `motion.ts` produces a `ClipTransform` that is passed to it.
- One undo step per gesture, slider drag (`beginTransaction` + `applyTransient`) or button (`apply`).
- No `scrollTo` or self-retriggering work in scroll-end handlers; `src/editor/timelineScroll.ts` unchanged; no change to scroll widths or paddings.
- Gestures: `.runOnJS(true)`; gesture state in a ref object, never a reassigned captured `let`.
- The preview's `VideoView` must never remount because of motion (stable tree; only styles change).
- Expo Go safe: no new dependencies; check installed typings / versioned docs before using an Expo or RN API.
- UI from `src/ui/` and `src/theme/theme.ts`; no hex literals in screens.
- Swift is never compiled here: verify by reading; list unverified APIs.
- Windows: PowerShell, no `&&`, `npx.cmd`. Before each commit: `npm run typecheck` and `npm test` green. `git add` explicit paths only. Commit trailer exactly `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- RNTL v14: `render` / `fireEvent` are async — always `await`.

## File Map

| File | Responsibility |
|---|---|
| `src/editor/model/types.ts`, `migrate.ts` | v7 fields, id lists, limits, sanity pass |
| `src/editor/effects.ts` | labels + icons for animation ids |
| `src/editor/model/motion.ts` ↔ `modules/clipy-video/ios/Motion.swift` | all motion maths |
| `src/editor/model/timeline.ts` | source ↔ output time for keyframes (reversed-aware) |
| `src/editor/model/ops.ts` | animation and keyframe ops, edit routing |
| `src/editor/components/{PreviewPlayer,ClipFrame,ClipGestures,OverlayLayer,OverlayText,StickerView,SelectionFrame}.tsx` | preview |
| `src/editor/components/{ClipAnimationSheet,OverlayAnimationSheet,KeyframeDots,EditorToolbar,ClipThumbStrip,OverlayPill,TransformSheet}.tsx`, `toolGroups.ts` | UI |
| `modules/clipy-video/index.ts`, `src/export/useExport.ts` | export request |
| `modules/clipy-video/ios/{Motion,ExportSession,ClipyCompositor,MediaPrePass}.swift`, `ios/Tests/` | Swift export |

---

### Task 1: Schema v7 and registries

**Files:** Modify `src/editor/model/types.ts`, `migrate.ts`, `src/editor/effects.ts`; tests `src/editor/model/__tests__/migrate.test.ts`, `types.motion.test.ts` (new), `src/editor/__tests__/effects.test.ts`.

**Interfaces (produced)** — exactly as spec §2 (`SCHEMA_VERSION 7`, `ANIM_IN_IDS`, `ANIM_COMBO_IDS`, `ANIM_LOOP_IDS`, `ANIM_LIMITS`, `AnimEdge`, `ClipAnimation`, `OverlayAnimation`, `NO_CLIP_ANIMATION`, `NO_OVERLAY_ANIMATION`, `Keyframe`, `KEYFRAME_LIMITS`; `Clip.animation`, `Clip.keyframes`; `TextOverlay` / `StickerOverlay` `.animation`, `.keyframes`), plus:
```ts
export function clampAnimEdge(e: unknown): AnimEdge | null                      // unknown id / non-object → null; duration clamped, non-finite → default
export function clampClipAnimation(a: unknown): ClipAnimation                    // combo set ⇒ in / out null
export function clampOverlayAnimation(a: unknown): OverlayAnimation
export function clampClipKeyframes(k: unknown): Keyframe[]                       // per spec §2 sanity rules, clip units
export function clampOverlayKeyframes(k: unknown): Keyframe[]                    // overlay units (x, y 0–1; OVERLAY_LIMITS.scale)
export function makeKeyframe(partial: Partial<Keyframe> & Pick<Keyframe, "t">): Keyframe   // test helper: x 0, y 0, scale 1, rotation 0, opacity 1
// effects.ts
export const ANIM_IN: Record<AnimInId, { label: string; icon: IoniconName }>;
export const ANIM_COMBO: Record<AnimComboId, { label: string; icon: IoniconName }>;
export const ANIM_LOOP: Record<AnimLoopId, { label: string; icon: IoniconName }>;
```
- Factories (`newVideoClip`, `newPhotoClip`, `makeClip`, `makeOverlay`, `makeSticker`) add fresh defaults (new object / array per item).
- Labels: Fade, Slide left, Slide right, Slide up, Slide down, Zoom in, Zoom out, Spin, Pop, Rise; combo: Slow zoom in, Slow zoom out, Pan left, Pan right, Sway, Pulse; loop: Wiggle, Pulse, Spin, Float, Blink, Shake. Icons verified in the Ionicons glyph map.
- Migration v6 → v7 + sanity pass per spec §2 (clips and all overlays).

- [ ] **Step 1: Failing tests** — clamp helpers (each rule in spec §2: unknown ids, duration bounds, combo exclusivity, keyframes non-finite / clamped / sorted / min-gap / max count), factories give fresh objects, v6 → v7 defaults, sanity repairs, idempotent, v1 chain reaches 7; registry lengths (10 / 6 / 6) and labels.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** (fix every literal the compiler flags through the factories). **Step 4:** `npm run typecheck`; `npm test`. **Step 5: Commit** `feat(model): schema v7 — animations and keyframes for clips and overlays`.

---

### Task 2: `motion.ts`

**Files:** Create `src/editor/model/motion.ts`, `__tests__/motion.test.ts`, `__tests__/motion.vectors.ts`; modify `src/editor/model/timeline.ts` (+ its test).

**Interfaces (produced):**
```ts
// timeline.ts — reversed-aware, the only place with speed arithmetic
export const sourceTimeAt = (c: Clip, offsetInClip: number): number            // = freezeSourceTime (alias kept for readability)
export function outputOffsetOf(c: Clip, sourceTime: number): number            // inverse of sourceTimeAt (may fall outside [0, clipDuration])

// motion.ts
export interface MotionDelta { dx: number; dy: number; scale: number; rotation: number; opacity: number }
export const IDENTITY_DELTA: MotionDelta;
export const MOTION = { /* spec §4, verbatim */ } as const;
export const easeOut: (p: number) => number;
export const smooth: (u: number) => number;
export function animInDelta(id: AnimInId, p: number, distance: number): MotionDelta
export function animOutDelta(id: AnimInId, p: number, distance: number): MotionDelta
export function animComboDelta(id: AnimComboId, p: number, seconds: number): MotionDelta
export function animLoopDelta(id: AnimLoopId, seconds: number): MotionDelta
export function edgeDurations(inDur: number, outDur: number, length: number): { in: number; out: number }
export interface KeyValues { x: number; y: number; scale: number; rotation: number; opacity: number }
export function sampleKeyframes(keyframes: Keyframe[], t: number): KeyValues | null
export function combine(base: KeyValues, d: MotionDelta): KeyValues
/** Base values of a clip at an output offset: keyframes (sampled at the source time) or the static transform with opacity 1. */
export function clipBaseAt(clip: Clip, offsetInClip: number): KeyValues
export function resolveClipMotion(clip: Clip, offsetInClip: number): { transform: ClipTransform; opacity: number }
export function overlayBaseAt(o: Overlay, time: number): KeyValues
export function resolveOverlayMotion(o: Overlay, time: number): KeyValues
export const hasClipMotion = (c: Clip) => boolean      // any animation or keyframe
export const hasOverlayMotion = (o: Overlay) => boolean
```
Formulas: spec §4 verbatim. Reversed clips: keyframes are sampled at `sourceTimeAt(clip, offset)`; because source time runs backwards there, sample by sorting on `t` as always (the sampler is time-order agnostic: it finds the two pins around `t`). `resolveClipMotion` clamps `offsetInClip` to `[0, clipDuration]`, keeps the static flips, and clamps opacity to 0–1; In / Out progress = elapsed / scaled duration. Non-finite inputs → identity / base.

- [ ] **Step 1: Vectors** — `MOTION_VECTORS` with plain numeric literals and the arithmetic in comments: every In id at p = 0, 0.5, 1 (distance 1); `pop` at 0.3, 0.6, 0.8; Out for `slideLeft`, `spin` at p = 0, 0.5, 1; every Combo at p = 0.25 (seconds 0.5); every Loop at s = 0.1; `edgeDurations(0.5, 0.5, 0.6)`; `sampleKeyframes` between two pins at the midpoint and quarter, before the first, after the last; `outputOffsetOf` for a forward clip at speed 2 and a reversed clip.
- [ ] **Step 2: Failing tests** — every vector (`toBeCloseTo(…, 9)`); In at p = 1 and Out at p = 0 are identity for every id; Out mirrors In with negated dx / dy / rotation; `combine`; `clipBaseAt` with and without keyframes; `resolveClipMotion` — default clip returns the clip's own transform values and opacity 1, In + keyframes compose, Combo ignores In / Out, offset clamped, trimmed clip (keyframe before `trimStart` still shapes the interpolation), speed 2, reversed; `resolveOverlayMotion` with In + Loop; `timeline` inverse property (`outputOffsetOf(c, sourceTimeAt(c, x)) ≈ x`).
- [ ] **Step 3: Implement.** **Step 4:** checks. **Step 5: Commit** `feat(model): motion maths — animation deltas, keyframe sampling, resolve`.

---

### Task 3: Ops

**Files:** Modify `src/editor/model/ops.ts`; create `src/editor/model/__tests__/ops.motion.test.ts`.

**Interfaces (produced):**
```ts
export function setClipAnimation(p: Project, clipId: string, patch: Partial<ClipAnimation>): Project     // setting combo clears in / out; setting in or out clears combo; durations clamped
export function setAnimationForAllClips(p: Project, a: ClipAnimation): Project                            // fresh copy per clip
export function setOverlayAnimation(p: Project, overlayId: string, patch: Partial<OverlayAnimation>): Project   // text and stickers; captions refused (unchanged)
export function clipKeyframeAt(clip: Clip, offsetInClip: number): Keyframe | null                         // the pin within KEYFRAME_LIMITS.minGap of that moment (compared in source time)
export function toggleClipKeyframe(p: Project, clipId: string, offsetInClip: number): Project            // add from clipBaseAt, or remove; removing the last pin copies x / y / scale / rotation to the static transform
export function editClipTransformAt(p: Project, clipId: string, offsetInClip: number, patch: Partial<Pick<ClipTransform, "x" | "y" | "scale" | "rotation">> & { opacity?: number }): Project
  // no keyframes → setClipTransform (opacity ignored); keyframes → upsert the pin at that moment, starting from clipBaseAt, clamped
export function overlayKeyframeAt(o: Overlay, time: number): Keyframe | null
export function toggleOverlayKeyframe(p: Project, overlayId: string, time: number): Project
export function editOverlayAt(p: Project, overlayId: string, time: number, patch: Partial<Pick<Keyframe, "x" | "y" | "scale" | "rotation" | "opacity">>): Project
  // no keyframes → the existing shared-update op on x / y / scale / rotation; keyframes → upsert the pin at (time − start)
```
- Existing ops: `rotateClip90` adds 90° to every pin too; `fitClip` / `fillClip` / `resetClipTransform` route through `editClipTransformAt` when given an offset (add an optional `offsetInClip?: number` parameter; without it or without keyframes they behave as today); `splitClipAt` — left keeps `in`, right keeps `out`, combo on both, keyframes copied (fresh arrays); `duplicateClip` / `duplicateOverlay` deep-copy; `replaceClipMedia` clears keyframes and keeps the animation; `insertFreezeFrame` — the still has no animation and no keyframes; `applyTemplate` leaves both alone. Captions (`kind: "caption"`) never get animation or keyframes.
- `max` pins: adding beyond `KEYFRAME_LIMITS.max` returns the project unchanged. Every op returns the same project object when nothing changes; non-finite input → unchanged.

- [ ] **Step 1: Failing tests** — one per rule above; edit routing in both modes; toggle add → values equal the interpolated base; toggle on a pin removes; last-pin removal restores static; split / duplicate / replace / freeze rules with `not.toBe` copy assertions; one gesture (`beginTransaction` + several `applyTransient(editClipTransformAt)`) = one undo step and one pin.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4:** checks. **Step 5: Commit** `feat(model): animation and keyframe ops; edits route to the pin at the playhead`.

---

### Task 4: Preview — clip motion

**Files:** Modify `src/editor/components/PreviewPlayer.tsx`, `ClipFrame.tsx`, `ClipGestures.tsx`, `TransformSheet.tsx`; tests `ClipFrame.test.tsx`, `PreviewPlayer.test.tsx`, `ClipGestures.test.tsx`, `TransformSheet.test.tsx`.

**Behaviour**
- `PreviewPlayer` computes `resolveClipMotion(hit.clip, hit.offsetInClip)` when `hasClipMotion(clip)` and passes `transform` + `opacity` to `ClipFrame`; otherwise passes nothing (today's props). `ClipFrame` gains optional `transform?: ClipTransform` (overrides `clip.transform` for placement) and `opacity?: number` (applied to the picture box only — the background stays opaque; blur / colour backgrounds render whenever the picture does not cover the frame OR opacity < 1). No conditional wrappers, no `key` changes: the `VideoView` must not remount when motion starts, ends or changes.
- `ClipGestures`: the session's snapshot is `clipBaseAt(clip, offsetInClip)` and updates go through `editClipTransformAt(p, clipId, offsetInClip, …)` (offset read from the store at gesture start and kept for the gesture); the gold frame is placed from the base values (not the animated ones); snapping uses the base. Without keyframes the behaviour is identical to today.
- `TransformSheet`: Fit / Fill / Reset pass the playhead's offset so they edit the pin when keyframes exist.

- [ ] **Step 1: Failing tests** — ClipFrame: transform override changes placement; opacity on the picture box only; background shown when opacity < 1 on a covering clip; default props → same tree as before. PreviewPlayer: a clip with a fade In shows opacity 0 at its start and 1 after the In; a keyframed clip moves between pins; a default project passes no overrides; the `VideoView` host instance is the same before and after motion becomes active. ClipGestures: with keyframes a drag upserts one pin at the playhead (one undo step) and leaves the static transform alone; without keyframes unchanged behaviour. TransformSheet routing.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4:** checks. **Step 5: Commit** `feat(preview): clip animations and keyframed motion`.

---

### Task 5: Preview — overlay motion

**Files:** Modify `src/editor/components/OverlayLayer.tsx`, `OverlayText.tsx`, `StickerView.tsx`, `SelectionFrame.tsx`; tests alongside (`OverlayLayer.test.tsx`, `StickerView.test.tsx`, a new `OverlayMotion.test.tsx`).

**Behaviour**
- For an overlay with `hasOverlayMotion`, `OverlayLayer` resolves `resolveOverlayMotion(o, playhead)` and renders the overlay with those `x, y, scale, rotation` and `opacity` (pass an overridden overlay object or explicit props — read `OverlayText` / `StickerView` to choose the smaller change); without motion nothing changes.
- The selection frame and its drag / pinch / rotate gestures act on the base values (`overlayBaseAt`) and write through `editOverlayAt(p, id, playhead, …)`; with no keyframes this is the existing update path. The frame is drawn at the base placement.
- Hit-testing: an overlay faded to opacity 0 by an In animation is still tappable (its Pressable stays).

- [ ] **Step 1: Failing tests** — text with slide-up In at its start is offset by `slideOverlay` of the frame height and reaches its place after the In; Loop pulse changes scale over time; keyframed sticker interpolates; opacity applied; drag with keyframes upserts a pin (one undo step) and without keyframes updates x / y as before; untouched overlays render exactly as before (existing tests unchanged).
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4:** checks. **Step 5: Commit** `feat(preview): text and sticker animations and keyframes`.

---

### Task 6: Animation sheets and keyframe tool

**Files:** Create `src/editor/components/{ClipAnimationSheet,OverlayAnimationSheet,AnimationTiles}.tsx`; modify `src/editor/toolGroups.ts`, `EditorToolbar.tsx`; tests `ClipAnimationSheet.test.tsx`, `OverlayAnimationSheet.test.tsx`, `EditorToolbar.test.tsx`, `toolGroups.test.ts`.

**Behaviour**
- `ToolId` gains `animate | keyframe`. Groups: Edit = `split, trim, transform, animate, keyframe, crop, replace, reverse, freeze, duplicate, delete, ratio`; Text = `text, captions, animate, keyframe`; Stickers = `sticker, animate, keyframe`.
- `animate`: in Edit opens `ClipAnimationSheet` for the selected clip; in Text / Stickers opens `OverlayAnimationSheet` for the selected text / sticker (disabled for captions and with no selection).
- `keyframe`: label "Keyframe"; icon outline diamond, filled when `clipKeyframeAt` / `overlayKeyframeAt` finds a pin at the playhead (`accessibilityState.selected`); press → `apply(toggleClipKeyframe | toggleOverlayKeyframe)` with a light haptic; disabled with no matching selection, or when the playhead is not on the selected clip / outside the overlay's range.
- `AnimationTiles`: shared grid of `ToolButton`-style tiles (None + ids, icon + label, selected ring).
- `ClipAnimationSheet` (kit `Sheet`, title "Animation", action "Apply to all clips"): three `Chip` tabs In · Out · Combo; tiles for the tab; under In / Out a "Length" `Slider` (0.1–2.0, step 0.05, disabled when that edge is None; one undo step per drag); picking a Combo clears In / Out and the reverse (the op does it; the UI reflects it).
- `OverlayAnimationSheet`: tabs In · Out · Loop; same layout; no "Apply to all".

- [ ] **Step 1: Failing tests** — groups; tool enable / disable rules incl. captions and playhead-off-clip; keyframe press adds then removes (icon state flips, one undo step each); sheets: picking tiles calls the right op, tab exclusivity reflected, slider one undo step, Apply to all copies a fresh animation to every clip.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4:** checks. **Step 5: Commit** `feat(editor): animation sheets and keyframe tool`.

---

### Task 7: Keyframe dots on the timeline

**Files:** Create `src/editor/components/KeyframeDots.tsx`; modify `ClipThumbStrip.tsx`, `OverlayPill.tsx`; tests `KeyframeDots.test.tsx`, strip / pill tests.

**Behaviour** — `KeyframeDots({ times, width, pps, onPress })` renders a small rotated-square "diamond" (theme accent, 8 pt, 24 pt hit slop) at `timeToX(t, pps)` for each time inside `[0, width]`. The selected clip's strip shows its pins at `outputOffsetOf(clip, k.t)` (only those inside the clip's output range); a selected text / sticker pill shows its pins at `k.t`. Pressing a dot seeks the playhead to that moment (`seek`), nothing else. Dots are `position: absolute` inside the strip / pill — no layout or scroll-geometry change; unselected items show none.

- [ ] **Step 1: Failing tests** — positions, range filtering, reversed clip positions, press seeks to clip start + offset, no dots when unselected or without pins, strip / pill width unchanged.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4:** checks. **Step 5: Commit** `feat(timeline): keyframe dots on the selected clip and overlay`.

---

### Task 8: Export request

**Files:** Modify `modules/clipy-video/index.ts`, `modules/clipy-video/__tests__/index.test.ts`, `src/export/useExport.ts` (+ test).

**Interfaces (produced):**
```ts
export interface ExportAnimEdge { id: string; duration: number }
export interface ExportKeyframe { t: number; x: number; y: number; scale: number; rotation: number; opacity: number }
export interface ExportClip { /* existing */ animIn: ExportAnimEdge | null; animOut: ExportAnimEdge | null; animCombo: string | null; keyframes: ExportKeyframe[]; outputDuration: number }
export interface ExportOverlay { /* existing */ animIn: ExportAnimEdge | null; animOut: ExportAnimEdge | null; animLoop: string | null; keyframes: ExportKeyframe[] }
```
- Clip keyframes are converted to clip-local OUTPUT seconds with `outputOffsetOf`, sorted ascending by that time (a reversed clip's pins come out in reversed order), and trimmed to the pins inside `[0, outputDuration]` plus the nearest one on each side. `animIn` / `animOut` durations are sent already scaled by `edgeDurations`. `outputDuration = clipDuration(clip)`.
- Overlay keyframes are sent as stored (seconds from the overlay's start); overlay edge durations scaled the same way against the overlay's length.

- [ ] **Step 1: Failing tests** — whole-object `toEqual` for a default clip / overlay (new fields at defaults); a keyframed clip at speed 2; a reversed keyframed clip; trimming keeps one pin outside each side; scaled edge durations; fresh copies.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4:** checks. **Step 5: Commit** `feat(export): send animations and keyframes to the engine`.

---

### Task 9: Swift — `Motion.swift` and clip motion in the compositor

**Files:** Create `modules/clipy-video/ios/Motion.swift`, `ios/Tests/MotionTests.swift`, `src/editor/model/__tests__/motion.parity.test.ts`; modify `ExportSession.swift` (records, `LayerSpec` data), `ClipyCompositor.swift`, `MediaPrePass.swift` (the clip rewrite must carry the new fields).

**Behaviour**
- Records: `ExportClip.animIn` / `animOut` (optional nested record `{ id, duration }`), `animCombo` (optional string), `keyframes` (array of a `ExportKeyframe` record), `outputDuration`; the same four motion fields on `ExportOverlay` (`animLoop` instead of `animCombo`) — decoded here, overlays rendered in Task 10.
- `Motion.swift`: constants named as `MOTION`, `easeOut`, `smooth`, `animInDelta`, `animOutDelta`, `animComboDelta`, `animLoopDelta`, `sampleKeyframes`, `combine`, and `resolveClip(base:keyframes:animIn:animOut:animCombo:local:length:)` / `resolveOverlay(...)` mirroring the TS (keyframes here are already in output-local seconds, so no source-time conversion and no speed arithmetic in Swift). Unknown ids → identity.
- `LayerSpec` gains `motion` (the clip's animation + keyframes), `clipStart` (composition seconds where the clip's own range starts, excluding transition handles) and `clipLength`. Per frame: `local = clamp(compositionTime − clipStart, 0, clipLength)`; when the clip has motion, the resolved transform replaces `spec.transform` for `ClipLayout.ciPlacement` (the `usesFill` shortcut applies only when the clip has no motion) and the resolved opacity multiplies the picture's alpha (`CIColorMatrix` A-vector) before it is composited over the background; the background is drawn when the picture does not cover the frame or opacity < 1.
- A clip with no motion takes exactly today's path.
- Parity test (Jest): constants equal `MOTION`; id lists (a `case "<id>"` per In / Combo / Loop id inside the matching Swift function body); `MOTION_VECTORS` numbers present in the Swift test table.

- [ ] **Step 1: Parity test (failing).** **Step 2: Implement + XCTests** (list unverified APIs). **Step 3:** checks. **Step 4: Commit** `feat(ios): motion maths and clip animations / keyframes in the compositor (uncompiled)`.

---

### Task 10: Swift — overlay animations

**Files:** Modify `modules/clipy-video/ios/ExportSession.swift` (overlay layer building); create `ios/OverlayMotion.swift`, `ios/Tests/OverlayMotionTests.swift`.

**Behaviour**
- `OverlayMotion.samples(overlay:fps:) → [(time: Double, values: KeyValues)]`: pure; samples `Motion.resolveOverlay` every `1/30` s from the overlay's start to its end inclusive (at least two samples).
- For an overlay with an animation or keyframes, replace the static placement + `addVisibility` with `CAKeyframeAnimation`s on the overlay's container layer for `position` (frame fractions → render pixels, in the layer tree's coordinate system — read how the existing code positions and flips the layer), `transform` (scale then rotation about the layer's anchor, matching the on-screen clockwise convention the existing static rotation uses) and `opacity` (0 outside `[start, end)`, the sampled opacity inside), each with `keyTimes` normalised over the overlay's life, `calculationMode = .linear`, `beginTime = max(start, AVCoreAnimationBeginTimeAtZero)`, `duration = end − start`, `isRemovedOnCompletion = false`, `fillMode` such that the layer is hidden before and after (as `addVisibility` does today). Overlays without motion keep today's code path untouched.
- XCTests for the sampler (count, first / last time, values equal `Motion.resolveOverlay`).

- [ ] **Step 1: Implement** (reading-verified; list every Core Animation API you could not verify). **Step 2:** `npm run typecheck`; `npm test`. **Step 3: Commit** `feat(ios): text and sticker animations via sampled Core Animation keyframes (uncompiled)`.

---

### Task 11: Docs and full checks

**Files:** `README.md`, `AGENTS.md`, the spec's Status line, `docs/superpowers/research/capcut-roadmap.md`.

- [ ] **Step 1** — README "Motion" section (clip animations, text / sticker animations, keyframes; exact in the preview; export uncompiled) and add to the "First native build — things to check" list: overlay animation timing and direction, clip opacity over backgrounds, rotation direction of spin. AGENTS.md: `- Motion maths: keep src/editor/model/motion.ts ↔ modules/clipy-video/ios/Motion.swift identical (constants, ids and vectors); nothing else computes animation or keyframe values.` Spec Status → `Implemented 2026-10-04 (Swift export unverified until an EAS build exists; on-device checklist pending)`. Roadmap group C: clip animations, text and sticker animations, keyframes → "Have".
- [ ] **Step 2** — `npm run typecheck`; `npm test`; `npx.cmd expo-doctor`; `npm ls --all | Select-String invalid` (empty).
- [ ] **Step 3: Commit** `docs: animations and keyframes (CapCut group C, round 1)`.

**Device checklist (user, Expo Go):** select a clip → Animate → In: Slide left, Out: Fade, drag Length → play; Combo: Slow zoom in → play. Keyframe: tap the diamond at the start, move the playhead, pinch / drag the clip (a second diamond appears), play; tap a diamond on the strip; remove one. Add a text → Animate → In: Pop, Loop: Wiggle → play; keyframe the text across the screen. Undo everything; close and reopen the project.
