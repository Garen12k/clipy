# CapCut Group C Round 2 — Speed Curves Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add six speed-curve presets to clips, stored and played as constant-speed steps, with the preview following the steps and the (uncompiled) Swift export retiming each step.

**Architecture:** Schema v8 adds `Clip.speedCurve` (absolute source-time steps). `src/editor/model/timeline.ts` — already the only place allowed to do speed arithmetic — becomes curve-aware; every other module keeps calling its functions and needs no curve knowledge. The export receives the steps in playback order and retimes them one by one.

**Tech Stack:** Expo SDK 57, TypeScript strict, Zustand, expo-video, Jest + RNTL v14; Swift / AVFoundation (uncompiled).

**Spec:** `docs/superpowers/specs/2026-10-04-capcut-c2-speed-curves-design.md` (binding).

## Global Constraints

- **Constant-speed clips are untouched:** with `speedCurve: null` every `timeline.ts` function returns bit-identical results to today, the preview tree is the same and the export path is the same.
- Only `src/editor/model/timeline.ts` may read `clip.speed` or `clip.speedCurve.steps` for arithmetic. Everything else calls its functions.
- A curve and a constant speed are exclusive: a curve forces `speed` 1; setting a speed clears the curve. Photos never have a curve.
- One undo step per button / slider drag.
- No `scrollTo` or self-retriggering work in scroll-end handlers; `src/editor/timelineScroll.ts` unchanged.
- The preview's `VideoView` must not remount; no effect may re-trigger itself (rate changes must not cause a seek loop).
- Expo Go safe: no new dependencies; check installed typings before using an Expo / RN API.
- UI from `src/ui/` and `src/theme/theme.ts`; no hex literals in screens.
- Swift is never compiled here: verify by reading; list unverified APIs.
- Windows: PowerShell, no `&&`, `npx.cmd`. Before each commit: `npm run typecheck` and `npm test` green. `git add` explicit paths only. Commit trailer exactly `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- RNTL v14: `render` / `fireEvent` are async — always `await`.

---

### Task 1: Schema v8 and curve-aware time maths

**Files:** Modify `src/editor/model/types.ts`, `migrate.ts`, `src/editor/effects.ts`, `src/editor/model/timeline.ts`; tests `migrate.test.ts`, `types.speed.test.ts` (new), `timeline.curve.test.ts` (new), `effects.test.ts`.

**Interfaces (produced)** — spec §2 and §3 verbatim: `SCHEMA_VERSION 8`, `SPEED_CURVE_IDS`, `SpeedCurveId`, `SpeedStep`, `SpeedCurve`, `Clip.speedCurve`, `SPEED_CURVE_LIMITS = { slices: 8, maxSteps: 64, minStep: 0.01 }`, `clampSpeedCurve(v: unknown, clip: { kind }): SpeedCurve | null`; `SPEED_CURVES: Record<SpeedCurveId, { label: string; shape: readonly number[] }>` (the table in spec §2); in `timeline.ts`: `speedSpans`, curve-aware `clipDuration`, `outputToSource`, `sourceToOutput`, `freezeSourceTime` / `sourceTimeAt`, `outputOffsetOf`, `splitSourceRanges`, plus `rateAt`, `playbackSpans`, and
```ts
/** Eight equal slices of [trimStart, trimEnd] with the preset's speeds (clamped to SPEED_LIMITS). */
export function curveSteps(id: SpeedCurveId, trimStart: number, trimEnd: number): SpeedStep[]
```
- `speedSpans(c)`: without a curve → `[{ from: trimStart, to: trimEnd, speed: c.speed }]`; with a curve → the steps intersected with `[trimStart, trimEnd]` (first step's speed before its `from`, last step's speed to the end), zero-length spans omitted.
- Constant-speed clips must keep the EXACT old expressions (`(trimEnd − trimStart) / speed`, `trimStart + offset × speed`, …) — branch on `speedCurve` being null so results are bit-identical.
- Outside the trimmed range the mapping extends linearly with the edge span's speed (both directions).
- Factories default `speedCurve: null`; migration v7 → v8 + sanity pass per spec §2.

- [ ] **Step 1: Failing tests** — `timeline.curve.test.ts` with hand-computed numbers (arithmetic in comments): an 8 s clip (trim 0–8) with `hero` → spans, `clipDuration` = Σ 1/s per 1 s slice = 1 + 0.5 + 0.3333333333 + 2 + 2 + 0.3333333333 + 0.5 + 1; `outputToSource` / `sourceToOutput` at span boundaries and mid-span; inverse property at 50 offsets; reversed clip (`sourceTimeAt`, `outputOffsetOf`, `playbackSpans` back to front); a curve applied then trimmed to 2–7 (steps kept, spans clipped); offsets before 0 and beyond the end (linear extension); `rateAt` at each span and exactly on a boundary (the later span); `splitSourceRanges` on a curved clip; **bit-identity**: for 20 constant-speed clips (speeds 0.25–4, trims, reversed) each function equals the old formula with `toBe`. `types.speed.test.ts`: `clampSpeedCurve` rules; `curveSteps` values. `migrate.test.ts`: v7 → v8 default, repairs, photo → null, curve forces speed 1, idempotent. `effects.test.ts`: six presets, eight speeds each within 0.25–4.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4:** `npm run typecheck`; `npm test`. **Step 5: Commit** `feat(model): schema v8 — speed curves as constant-speed steps; curve-aware timeline maths`.

---

### Task 2: Ops and the speed audit

**Files:** Modify `src/editor/model/ops.ts`, and any file the audit finds; tests `src/editor/model/__tests__/ops.speedCurve.test.ts` (new) + touched tests.

**Interfaces (produced):**
```ts
export function setClipSpeedCurve(p: Project, clipId: string, id: SpeedCurveId | null): Project   // id → steps across the current trim, speed 1; null → clears (speed stays 1); photos refused
```
- `setClipSpeed` clears the curve. `splitClipAt`: both halves keep the curve (fresh copies of the steps). `duplicateClip`: deep copy. `replaceClipMedia`: when the clip had a curve, re-apply the same preset across the new range (photo → null). `insertFreezeFrame`: the still has none. `applyTemplate` (sets a speed) clears the curve via `setClipSpeed`. `setClipReversed` keeps it. Transitions are re-normalised after a curve change (the duration changes) the way `setClipSpeed` does it today.
- **Audit:** grep the whole repo (`src/`, `modules/clipy-video/index.ts`, `app/`) for `.speed`, `speed:` and `SPEED_` uses outside `timeline.ts` / `types.ts` / tests; every arithmetic or duration use must go through `timeline.ts` (e.g. `replaceClipMedia`'s `prevOut × speed`, caption time mapping, the speed badge, the Speed sheet's "length" label, `PreviewPlayer`'s playback rate — list each occurrence in the report with what you did: converted / display-only / left for Task 3). Do not change `PreviewPlayer.tsx` or `SpeedSheet.tsx` here (Task 3) — list them.

- [ ] **Step 1: Failing tests** — each rule above; identity returns; `not.toBe` copy assertions; durations after applying a curve; transition caps re-normalised; a keyframed clip keeps its pins on their pictures after a curve is applied (pin source times unchanged; `outputOffsetOf` moves).
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement + audit.** **Step 4:** checks. **Step 5: Commit** `feat(model): speed-curve ops; all speed arithmetic through timeline.ts`.

---

### Task 3: Speed sheet, badge and preview rate

**Files:** Modify `src/editor/components/SpeedSheet.tsx`, `ClipThumbStrip.tsx` (badge), `PreviewPlayer.tsx`, `PreviewTag.tsx`; tests alongside.

**Behaviour**
- `SpeedSheet`: `Chip` tabs Normal · Curve (initial tab = Curve when the clip has a curve). Normal: today's slider; it shows the clip's `speed`; moving it calls `setClipSpeed` (which clears the curve). Curve: tiles None + six presets (`SPEED_CURVES[id].label`) each with an eight-bar sparkline (bar height ∝ speed / 4, theme colours), selected ring, light haptic, one `apply(setClipSpeedCurve)` per pick (re-picking the selected one is a no-op). Under either tab: "Clip length 4.2 s" from `clipDuration`.
- Badge on the strip: the curve's label when a curve is set, else today's speed badge.
- `PreviewPlayer`: wherever the player's `playbackRate` is set from `clip.speed`, use `rateAt(clip, offsetInClip)`; the rate is re-applied when the playhead crosses into another step during playback (compare with the last applied value in the existing "skip redundant writes" refs — no extra seeks, no effect loop). Source time for seeking comes from `timeline.ts` as today.
- `needsPreviewTag`: true for a clip with a curve.

- [ ] **Step 1: Failing tests** — sheet tabs, tile picks (one undo step, ring, no-op re-pick), slider clears the curve, length label; badge; PreviewPlayer: on a curved clip the rate equals the step's speed at three playheads and changes when a `timeUpdate` crosses a boundary, with no additional `currentTime` writes; constant-speed clip behaves exactly as before; tag.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4:** checks. **Step 5: Commit** `feat(editor): speed curve presets in the Speed sheet; preview follows the steps`.

---

### Task 4: Export — request and Swift retiming

**Files:** Modify `modules/clipy-video/index.ts` (+ test), `modules/clipy-video/ios/ExportSession.swift`, `MediaPrePass.swift`, `ios/Tests/`; create `modules/clipy-video/ios/SpeedSpans.swift`, `ios/Tests/SpeedSpansTests.swift`.

**Behaviour**
- Request: `ExportClip.speedSpans: { duration: number; speed: number }[]` = `playbackSpans(clip)` when the clip has a curve, else `[]`; `speed` stays as sent today (1 for a curved clip).
- `SpeedSpans.swift` (pure, testable): given the spans, the head / tail handle lengths (source seconds added before / after the clip's range for transitions) → the list of `(sourceStart, sourceDuration, speed)` ranges relative to the inserted range's start, with the first span extended by the head handle and the last by the tail handle; and the output duration `Σ duration / speed`.
- `ExportSession`: for a clip with spans, after inserting its source range (handles included) into the video track and its audio track, retime each range with `scaleTimeRange(_:toDuration:)` from the LAST range to the FIRST (so earlier ranges do not move), for video and audio alike; every later computation that used `outDur = clampedTrim / speed` uses the span-based output duration. A clip without spans takes exactly today's code.
- `MediaPrePass.rewrite` carries `speedSpans` (prepared files run in playback order, matching the spans); its field-list guard test updated.
- XCTests for the pure span arithmetic (durations, handle extension, order).

- [ ] **Step 1: Failing Jest tests** — `toExportClip` for a curved clip (forward and reversed: spans back to front), constant clip → `[]`; the MediaPrePass field-list test including `speedSpans`. **Step 2: Implement** (list unverified APIs; state exactly how composition time ranges are computed after retiming). **Step 3:** checks. **Step 4: Commit** `feat(export): speed-curve spans retimed per step (uncompiled)`.

---

### Task 5: Docs and full checks

**Files:** `README.md`, `AGENTS.md`, the spec's Status line, `docs/superpowers/research/capcut-roadmap.md`.

- [ ] **Step 1** — README: "Speed curves" paragraph in the Motion section; first-build checklist items: curved clips' length and audio after retiming, transitions next to a curved clip. AGENTS.md: extend the existing speed rule to "only `src/editor/model/timeline.ts` may use clip `speed` or `speedCurve` steps". Spec Status → `Implemented 2026-10-04 (Swift export unverified until an EAS build exists; on-device checklist pending)`. Roadmap: speed curves → "Have (6 presets)".
- [ ] **Step 2** — `npm run typecheck`; `npm test`; `npx.cmd expo-doctor`; `npm ls --all | Select-String invalid` (empty).
- [ ] **Step 3: Commit** `docs: speed curves (CapCut group C, round 2)`.

**Device checklist (user, Expo Go):** select a video clip → Effects → Speed → Curve → Hero → play (fast, slow, fast) → the clip's length on the timeline changes → try Jump cut and Flash in → switch back to Normal and drag the slider (the curve clears) → split a curved clip and play both halves → undo everything.
