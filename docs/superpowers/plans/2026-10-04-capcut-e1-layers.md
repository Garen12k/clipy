# CapCut Group E Round 1 — Layers, Opacity, Masks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Picture-in-picture layers (video or photo on top of the main video) with their own timeline bars, plus opacity and three masks for layers and main clips.

**Architecture:** Schema v11 adds `Project.layers` (a layer = a `Clip` with a project `start`) and `Clip.opacity` / `Clip.mask`. One lookup (`findItem`) lets every existing per-clip op and sheet work on a layer. The preview draws the layers visible at the playhead above the main clip, each video layer with its own `expo-video` player; the Swift compositor draws them after the main frame.

**Tech Stack:** Expo SDK 57 (expo-video), TypeScript strict, Zustand, react-native-gesture-handler, Jest + RNTL v14; Swift / AVFoundation / Core Image (uncompiled).

**Spec:** `docs/superpowers/specs/2026-10-04-capcut-e1-layers-design.md` (binding).

## Global Constraints

- **Projects without layers are unchanged:** defaults `opacity 1`, `mask "none"`, `layers []`; same preview tree, same export path.
- A layer is addressed by id exactly like a clip; code that needs "a clip by id" uses `findItem` — never `project.clips.find` (audit required).
- Placement and mask radius only through `clipLayout.ts` (and `ClipLayout.swift`); motion through `motion.ts`; timing through `timeline.ts`; gains through `audioMix.ts`.
- At most `LAYER_LIMITS.max` layers and `maxVideoAtOnce` overlapping video layers — enforced in the ops, never only in the UI.
- One undo step per gesture / drag / button. Selection stays exclusive (clip-or-layer / overlay / effect / audio).
- The main `VideoView` must not remount because of layers; layer players are created and released with their layer's visibility and every teardown call on a player is guarded (try / catch).
- No `scrollTo` or self-retriggering work in scroll-end handlers; `src/editor/timelineScroll.ts` unchanged; lanes change heights only.
- Gestures: `.runOnJS(true)`; gesture state in a ref object.
- Expo Go safe: no new dependencies; check installed typings before using an Expo / RN API.
- UI from `src/ui/` and `src/theme/theme.ts`; no hex literals in screens.
- Swift is never compiled here: verify by reading; list unverified APIs.
- Windows: PowerShell, no `&&`, `npx.cmd`. Never run `expo lint` or anything that edits package.json. Before each commit: `npm run typecheck` and `npm test` green. `git add` explicit paths only. Commit trailer exactly `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- RNTL v14: `render` / `fireEvent` are async — always `await`.

---

### Task 1: Schema v11

**Files:** Modify `src/editor/model/types.ts`, `migrate.ts`, `src/projects/storage.ts` (project literal); tests `migrate.test.ts`, `types.layers.test.ts` (new).

**Interfaces (produced)** — spec §2 verbatim: `SCHEMA_VERSION 11`, `MASK_IDS`, `MaskId`, `LAYER_LIMITS`, `MASK`, `Clip.opacity`, `Clip.mask`, `LayerClip`, `Project.layers`; plus `clampOpacity(v: unknown): number`, `newLayer(clip: Clip, start: number): LayerClip` (copies the clip, sets `start`, `transform.scale = LAYER_LIMITS.defaultScale` with x / y 0, no transition), `makeLayer(partial)` test helper. Factories default the new fields. Migration v10 → v11 + sanity pass per spec §2 (missing-file detection in `storage` must include layers' `sourceUri`).

- [ ] **Step 1: Failing tests** — clamps; factories (fresh objects); v10 → v11 defaults; sanity repairs (opacity, mask, layer start, transition forced none, duplicate ids, > max); idempotent; v1 chain reaches 11; storage's missing-source scan covers layers.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4:** `npm run typecheck`; `npm test`. **Step 5: Commit** `feat(model): schema v11 — layers, clip opacity and mask`.

---

### Task 2: Lookup, layer ops, mask geometry

**Files:** Modify `src/editor/model/ops.ts`, `timeline.ts`, `clipLayout.ts` (+ `__tests__/clipLayout.vectors.ts`), `motion.ts`; tests `ops.layers.test.ts` (new), `clipLayout.test.ts`, `motion.test.ts`.

**Interfaces (produced):**
```ts
// timeline.ts
export function findItem(p: Project, id: string): { clip: Clip; layer: boolean } | null
export function layerEnd(l: LayerClip): number
export function layersAt(p: Project, time: number): LayerClip[]            // start ≤ time < min(end, project end), list order
export function itemOffsetAt(p: Project, id: string, time: number): number | null   // main clip: its offset when clipAt(time) is that clip; layer: time − start when on screen
// clipLayout.ts
export function maskRadius(placed: { width: number; height: number }, mask: MaskId): number
// ops.ts
export function addLayer(p: Project, clip: Clip, start: number): Project              // via newLayer; refused at the limits
export function moveLayer(p: Project, id: string, newStart: number): Project
export function trimLayer(p: Project, id: string, trimStart: number, trimEnd: number, anchor: "start" | "end"): Project   // trimming the head keeps the tail's project time
export function deleteLayer(p: Project, id: string): Project
export function duplicateLayer(p: Project, id: string): Project                       // right after the original; if that breaks the overlap rule, refused
export function reorderLayer(p: Project, id: string, direction: "forward" | "back"): Project
export function setClipOpacity(p: Project, id: string, opacity: number): Project      // clips and layers
export function setClipMask(p: Project, id: string, mask: MaskId): Project
export function videoLayerOverlap(layers: LayerClip[]): number                         // the largest number of video layers on screen at once
```
- The shared `updateClip` helper (and every per-clip op built on it) resolves the id in `clips` first, then `layers`; ops that are main-track-only (`splitClipAt`, `insertFreezeFrame`, `moveClip`, `setTransition`, `setClipBackground`, `setBackgroundForAllClips`, "apply to all" ops, templates) ignore layers; `deleteClip` / `duplicateClip` given a layer id delegate to the layer ops; `replaceClipMedia` on a layer keeps `start`; any op that changes a layer's length (speed, curve, replace, trim) re-checks the overlap rule and is refused if it would break it.
- `resolveClipMotion` multiplies the result's opacity by `clip.opacity` (clamped 0–1); a default clip is unchanged (× 1).
- `maskRadius` per spec §3; vectors added to the shared file.

- [ ] **Step 1: Failing tests** — lookup and timing helpers (layer running past the project end, list order); each layer op (limits, overlap rule with photo layers not counted, identity returns, non-finite refused); per-clip ops on a layer id (transform, filter, adjust, animation, keyframe toggle, speed, volume, fades); refused main-track ops on a layer; opacity / mask ops; motion opacity product; mask radius vectors; one drag = one undo step.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4:** checks. **Step 5: Commit** `feat(model): layer lookup and ops, clip opacity and mask, mask geometry`.

---

### Task 3: Preview — layers, opacity, masks

**Files:** Modify `src/editor/components/ClipFrame.tsx`, `PreviewPlayer.tsx`; create `LayerStack.tsx`, `LayerVideo.tsx`; tests `ClipFrame.test.tsx`, `LayerStack.test.tsx`, `PreviewPlayer.test.tsx`.

**Behaviour**
- `ClipFrame`: the picture box gets `borderRadius: maskRadius(placed, clip.mask)` when the mask is not none (the box already has `overflow: hidden`), and the clip's static opacity joins the opacity it already supports (`resolveClipMotion` now includes it — pass the resolved opacity whenever it is below 1). A new prop `transparent?: boolean` (layers): no background element at all. Default clips render exactly today's tree and styles.
- `LayerStack({ frameW, frameH })`: reads `layersAt(project, playhead)` and renders, in order, one `ClipFrame` per layer (`transparent`), each wrapped in a `Pressable`-free container (`pointerEvents="none"`; selection taps are handled in Task 4); photo layers use an `Image`, video layers a `LayerVideo`. Mounted in `PreviewPlayer` directly above the main picture's layers (after `EffectOverlays`? — no: layers sit above the main clip's filter / adjust layers and BELOW timeline-effect overlays, the transition layer, text / stickers and the gestures layer). Each layer gets its own `FilterLayer` / `AdjustLayer` clipped to its picture box.
- `LayerVideo({ layer, offset })`: owns a `useVideoPlayer`; loads the layer's source; paused → `currentTime` = the layer's source time (only when it changed); playing → `play()` once and re-seek only when drift > 0.25 s; `playbackRate` from `rateAt`; volume / muted from `clipGainAt` and the `recording` flag; all written through "last applied" refs (no redundant native writes); unmount cleanup guarded. Reversed layers preview forwards (as clips do).
- The Preview tag also shows for a layer with a filter / adjust / reversed / speed curve at the playhead.

- [ ] **Step 1: Failing tests** — mask radius styles; opacity; transparent layers have no background node; draw order (main picture → layers in list order → effect overlays → text); a photo layer renders an image with its placement; a video layer seeks / plays / pauses with the playhead and makes no redundant writes; layers outside the playhead are unmounted; the main `VideoView` instance is unchanged when a layer appears / disappears; a project without layers renders the same tree as before.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4:** checks. **Step 5: Commit** `feat(preview): layers above the main clip; opacity and masks`.

---

### Task 4: Selecting and moving layers on the preview

**Files:** Modify `src/editor/components/ClipGestures.tsx`, `PreviewPlayer.tsx`, `LayerStack.tsx`; tests `ClipGestures.test.tsx`, `LayerStack.test.tsx`.

**Behaviour** — `ClipGestures` works on the selected item whether it is a main clip or a layer: it resolves the item with `findItem` and its offset with `itemOffsetAt(project, id, playhead)` (null → no gesture layer / no gold frame), and writes through the existing `editClipTransformAt`. Snapping for a layer: centre and right angles as today; the scale magnets (Fill 1 and Fit) stay. Tapping the preview: if the tap lands on a visible layer's picture box (topmost first; test against the placed, rotated box — a pure hit-test helper `layerHit(layers, point, frame)` in `clipLayout.ts` or a small model file, with tests) → select that layer; otherwise today's behaviour (toggle play / deselect). While a layer is selected, a tap on it does nothing more; a tap elsewhere deselects.

- [ ] **Step 1: Failing tests** — hit-test helper (rotation, order, outside); tap selects the topmost layer; tap outside deselects / toggles play as before; gestures on a selected layer write its transform (and a keyframe pin when it has keyframes) with one undo step; no gesture layer when the selected layer is not on screen at the playhead; main-clip behaviour unchanged.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4:** checks. **Step 5: Commit** `feat(preview): select, move, resize and rotate layers`.

---

### Task 5: Timeline — layers lane

**Files:** Create `src/editor/components/LayerLane.tsx`, `LayerBar.tsx`; modify `Timeline.tsx`, `timelineLayout.ts`, `src/theme/theme.ts` (`laneLayer`); tests alongside.

**Behaviour** — a layers lane appears (directly under the clip area, above the other lanes) only when the project has layers; the timeline height accounts for it (heights only). `LayerBar` per layer: left = `timeToX(start)`, width = `timeToX(clipDuration)`, label "Layer" + a photo / video icon, selected border; tap selects (`select(id)`; tapping the selected bar deselects); long-press drag → `moveLayer`; left / right handles → `trimLayer` with the matching anchor (drag distance converted with `sourceAfter` from `timeline.ts`, as `TrimHandles` does for clips); one undo step per drag; state in a ref; `.runOnJS(true)`; the selected bar is drawn on top (`zIndex`). Refused ops (overlap rule) simply do not move the bar; on drag end after a refusal show one toast "Only two video layers can play at the same time."

- [ ] **Step 1: Failing tests** — lane only with layers; heights; bar geometry; select / deselect; move and both trims call the right op with one undo step; refusal toast once; scroll content width / paddings unchanged; `timelineScroll.ts` untouched.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4:** checks. **Step 5: Commit** `feat(timeline): layers lane with movable, trimmable bars`.

---

### Task 6: Toolbar, sheets and the lookup audit

**Files:** Modify `src/editor/toolGroups.ts`, `src/editor/components/EditorToolbar.tsx`, `src/editor/useClipMedia.ts`; create `OpacitySheet.tsx`, `MaskSheet.tsx`; modify every component that resolves a clip by id (audit); tests alongside.

**Behaviour**
- ToolIds `overlay | opacity | mask | layerForward | layerBack`. Edit group = `split, trim, transform, animate, keyframe, crop, overlay, opacity, mask, replace, reverse, freeze, duplicate, delete, ratio`; `layerForward` / `layerBack` show in the Edit sub-row only when a layer is selected (appended).
- `overlay`: `pickMedia({ multiple: false })` → `storage.importMedia` → `apply(addLayer(clip, playhead))`, select it; refusal → toast ("You've reached the layer limit." / "Only two video layers can play at the same time."). Busy guard as in `useClipMedia`.
- Enable rules with a layer selected: per spec §5 (Split, Freeze, Ratio, Transition, Background disabled; the rest enabled; photo-layer rules as for photo clips). `Trim` for a layer opens the existing Trim sheet working on the layer through `trimLayer` (anchor "end").
- `OpacitySheet`: slider 0–1 ("Opacity 80 %"), one undo step per drag. `MaskSheet`: tiles None · Rounded · Circle (one `apply` each).
- **Audit:** grep `src/` and `app/` for `clips.find(`, `clips.some(`, `project.clips[` and `clipAt(` uses that resolve "the selected clip" (sheets: Filter, Adjust, Transform, Crop screen, Clip animation, Speed, Volume, Trim, Replace flow, keyframe tool, keyframe dots, Preview tag, Template sheet…) and move each to `findItem` / `itemOffsetAt` so it works for a layer id; list every occurrence in the report with what you did (converted / main-track only by design).

- [ ] **Step 1: Failing tests** — groups; overlay add (kind, start, selection, refusals, busy); enable / disable matrix for a layer vs clip vs photo layer; forward / back; opacity and mask sheets; each audited sheet works on a layer id (one test each: Filter, Adjust, Transform, Crop, Animation, Speed, Volume, Keyframe tool).
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement + audit.** **Step 4:** checks. **Step 5: Commit** `feat(editor): overlay tool, opacity and mask sheets; clip tools work on layers`.

---

### Task 7: Export — request

**Files:** Modify `modules/clipy-video/index.ts` (+ test), `src/export/useExport.ts` (+ test), `src/export/estimate.ts`.

**Behaviour** — `ExportClip` gains `opacity`, `mask`; `ExportRequest.layers: (ExportClip & { start: number })[]` — layers with missing files excluded; a layer starting at or after the exported duration is dropped; one running past the end is sent whole (Swift clips it) with its `start`; each carries everything `toExportClip` produces (transform, crop, look, motion in layer-local output time, speed spans, gain curve) with `transition` none and `background` black (ignored). `canExport4K` / size estimates unchanged by layers except that a 4K export needs every VIDEO layer to be 4K-capable too — no: layers are scaled down, so they do not gate 4K (state this in a comment and test it).

- [ ] **Step 1: Failing tests** — whole-object `toEqual` for a default clip (new fields) and a layer; order preserved; missing / late layers dropped; a keyframed, masked, half-opaque layer. **Step 2: Implement.** **Step 3:** checks. **Step 4: Commit** `feat(export): send layers, opacity and mask to the engine`.

---

### Task 8: Swift — layers in the composition and compositor

**Files:** Modify `modules/clipy-video/ios/ExportSession.swift`, `ClipyCompositor.swift`, `ClipLayout.swift`, `MediaPrePass.swift`, `ios/Tests/`; extend `src/editor/model/__tests__/clipLayout.parity.test.ts`.

**Behaviour** — spec §7. Records: `ExportClip.opacity` (default 1), `mask` (default "none"); `ExportLayer` (the clip fields + `start`) and `ExportRequest.layers` (default `[]`). `ClipLayout.maskRadius` mirrors the TS function (vectors in the Swift test table; parity test). Pre-pass: photo / reversed layers are prepared like clips. Composition: one extra video track per layer (inserted at `start`, clipped to the video's length, retimed with the same speed / span code as clips, no transition handles); the layer's sound on its own audio track with its gain curve. Each `ClipyInstruction` carries `layerSpecs` for the layers overlapping its range (their track ids added to `requiredSourceTrackIDs`); when a layer starts or ends inside a main instruction's range the range is split so every instruction has a constant set of layers. Compositor: after the main frame (single clip or transition blend) and BEFORE timeline effects, for each layer in order: its frame → placement with its (possibly animated) transform at its local time → its filter / adjust → mask (alpha mask from a rounded rectangle of `maskRadius` in the picture's local space, rotated with it; radius 0 skips) → opacity → source-over onto the result. Main clips also honour `mask` and `opacity` (opacity already exists via motion: multiply). No layers and default mask / opacity → today's code path untouched.

- [ ] **Step 1: Parity test (failing).** **Step 2: Implement + XCTests** for the pure parts (mask radius, instruction splitting by layer boundaries as a pure function). List every unverified API. **Step 3:** checks. **Step 4: Commit** `feat(ios): layers, masks and opacity in the export (uncompiled)`.

---

### Task 9: Docs and full checks

**Files:** `README.md`, `AGENTS.md` (only if a rule changed), the spec's Status line, `docs/superpowers/research/capcut-roadmap.md`.

- [ ] **Step 1** — README "Layers" section; first-build checklist additions (layers composited in the right order and place, mask edges, layer sound, two video layers at once exporting, a layer running past the end). Spec Status → `Implemented 2026-10-04 (Swift export unverified until an EAS build exists; on-device checklist pending)`. Roadmap group E: overlay / PiP, opacity, masks (3 shapes) → "Have".
- [ ] **Step 2** — `npm run typecheck`; `npm test`; `npx.cmd expo-doctor`; `npm ls --all | Select-String invalid` (empty).
- [ ] **Step 3: Commit** `docs: layers, opacity and masks (CapCut group E, round 1)`.

**Device checklist (user, Expo Go):** Edit → Overlay → pick a video (it appears small in the middle and as a bar on the timeline) → drag, pinch and twist it → Mask: Circle → Opacity 60 % → Animate: Pop → move and trim its bar → add a photo layer and Bring forward / Send back → play through → select a main clip and set its Mask to Rounded → undo everything → close and reopen the project.
