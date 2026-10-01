# Clipy Phase 3 — Filters, Speed, Transitions, Stickers, Auto-Captions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Per-clip speed and filters, transitions on cuts, emoji/shape stickers, and on-device auto-captions — all editable in Expo Go (filters/transitions approximated, captions native-only), rendered for real in the Swift export.

**Architecture:** Schema v3 adds `speed`/`filter`/`transitionOut` on clips and a `StickerOverlay` kind. All time↔source conversion goes through `outputToSource`/`sourceToOutput` so speed is handled in one place. An effects registry (`src/editor/effects.ts`) is the single list of filters/transitions/shapes, mirrored by `Effects.swift`. Sheets dispatch pure ops; the preview layers approximations (tint, fade-to-black, "Preview" tag); the export uses a custom `AVVideoCompositing` for filters/transitions, time scaling for speed, Core Animation for stickers, and a `Transcriber` (Speech framework) for captions.

**Tech Stack:** Expo SDK 57, Zustand, expo-video (`playbackRate`), react-native-svg, Jest + RNTL v14, Swift (AVFoundation, Core Image, Core Animation, Speech).

**Spec:** `docs/superpowers/specs/2026-10-01-phase-3-effects-design.md` (parents: Phase 1, Phase 2, project spec)

## Global Constraints

- Expo Go runs everything except captions (fallback card) and the real filter/transition rendering (approximated with a visible **"Preview"** tag whenever the clip under the playhead has a filter or the playhead is inside a transition window).
- Output duration = Σ `clipDuration(c)` with `clipDuration = (trimEnd − trimStart) / speed`. Transitions never change the timeline length. Only `timeline.ts` may multiply/divide by `speed`: `outputToSource(c, off) = trimStart + off·speed`, `sourceToOutput(c, s) = (s − trimStart)/speed`.
- Limits: `speed` 0.25–4 (clamped; output ≥ 0.1 s); transition `duration` 0.3–1.0 s capped at `0.5 × min(clipDuration(clip), clipDuration(next))`, `type none → duration 0`, last clip has no transition; sticker `scale` 0.2–5; caption lines ≤ 40 chars and ≤ 3 s, new line on pauses > 0.6 s.
- Registry ids (exact): filters `none, warm, cool, vivid, faded, mono, noir, vintage`; transitions `none, fade, dissolve, slide, zoom`; shapes `circle, square, roundedBox, arrow, star, speechBubble, heart`. Shape SVG paths use only absolute `M L C Q Z` commands in a 100×100 box and are copied verbatim into `Effects.swift`.
- Caption style default: `fontId "montserrat"`, `fontScale 0.045`, `color "#FFFFFF"`, `background { color "#000000", opacity 0.6 }`, `outline false`, `align "center"`, `x 0.5`, `y 0.86`.
- Stickers: emoji font size `0.12 × frameH × scale`; shape box `0.2 × frameH × scale` (square), rotation about the centre; same gestures/undo rules as text.
- Speech: on-device `SFSpeechRecognizer` (`requiresOnDeviceRecognition = true` when `supportsOnDeviceRecognition`), device locale, permission asked once; `transcribe(uri, trimStart, trimEnd)` returns `{ text, start, end }[]` in **source seconds**; cancellable.
- `schemaVersion: 3`; v1/v2 migrate on load; newer rejected with the existing message.
- Colors/spacing from `theme`; no One Piece content; `@/` alias; npm; keep `overrides`; `npm ci` must work; `npx expo-doctor` clean; RNTL v14 (`await render`, `await fireEvent.*`, `act()`); pristine test output; `git add` specific paths only; every commit ends with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Expo API drift: verify against `node_modules/<pkg>/build/*.d.ts` when code doesn't typecheck; keep behavior; document.

## File Structure

```
src/editor/model/types.ts                 + FilterId, TransitionType, ShapeId, StickerOverlay, Overlay, TextOverlay.kind "text"|"caption", Clip effect fields, makeSticker, SCHEMA_VERSION 3   (T1)
src/editor/model/migrate.ts               v1→v2→v3 chain; normalises effect fields                                                                                   (T1)
src/editor/effects.ts                     FILTERS / TRANSITIONS / SHAPES / CAPTION_STYLE / FILTER_IDS…                                                               (T1)
src/editor/model/timeline.ts              clipDuration(speed), outputToSource, sourceToOutput                                                                        (T2)
src/editor/model/ops.ts                   splitClipAt via outputToSource; + setClipSpeed/Filter/FilterForAll/Transition; delete/move clear last transition; sticker + caption ops   (T2–T5)
src/editor/timelineLayout.ts              thumbTimes speed-aware                                                                                                      (T2)
src/editor/usePreviewSync.ts              sourceToOutput                                                                                                              (T2)
src/editor/components/PreviewPlayer.tsx   outputToSource seek, playbackRate, FilterLayer/TransitionLayer/PreviewTag                                                   (T2, T7, T8)
src/editor/components/TrimHandles.tsx     drag delta × speed                                                                                                          (T2)
src/editor/model/captions.ts              mergeSegmentsIntoLines, linesToCaptions                                                                                     (T5)
src/editor/components/SpeedSheet.tsx, ClipThumbStrip.tsx (+badges), EditorToolbar.tsx (+Speed/Filter/Transition/Sticker/Captions)                                    (T6–T11)
src/editor/components/FilterSheet.tsx, FilterLayer.tsx, PreviewTag.tsx                                                                                               (T7)
src/editor/components/TransitionSheet.tsx, TransitionLayer.tsx, Timeline.tsx (+cut markers)                                                                          (T8)
scripts/gen-emoji.mjs, assets/emoji.json, src/editor/emoji.ts, src/projects/prefs.ts, StickerSheet.tsx, StickerView.tsx, OverlayLayer.tsx (+stickers), OverlayPill.tsx (+icon)   (T9)
src/editor/components/StickerPanel.tsx                                                                                                                               (T10)
modules/clipy-video/index.ts (+transcribe), src/editor/useCaptions.ts, CaptionsSheet.tsx, CaptionStyleSheet.tsx                                                      (T11)
modules/clipy-video/index.ts (+request fields), src/export/useExport.ts                                                                                               (T12)
modules/clipy-video/ios/Effects.swift, ClipyCompositor.swift, ExportSession.swift, Tests/                                                                             (T13)
modules/clipy-video/ios/Transcriber.swift, ClipyVideoModule.swift, app.json (speech/mic strings)                                                                     (T14)
README.md, AGENTS.md, spec status                                                                                                                                    (T15)
```

---

### Task 1: Schema v3, migration chain, effects registry (TDD)

**Files:**
- Modify: `src/editor/model/types.ts`, `src/editor/model/migrate.ts`
- Create: `src/editor/effects.ts`
- Test: `src/editor/model/__tests__/migrate.test.ts` (extend), `src/editor/__tests__/effects.test.ts`; update `src/projects/__tests__/storage.test.ts` (version 3)

**Interfaces:**
- Produces:
  ```ts
  SCHEMA_VERSION = 3
  FILTER_IDS = ["none","warm","cool","vivid","faded","mono","noir","vintage"]; type FilterId
  TRANSITION_TYPES = ["none","fade","dissolve","slide","zoom"]; type TransitionType
  SHAPE_IDS = ["circle","square","roundedBox","arrow","star","speechBubble","heart"]; type ShapeId
  SPEED_LIMITS = [0.25, 4]; TRANSITION_LIMITS = { min: 0.3, max: 1.0 }
  interface Clip { …; speed: number; filter: FilterId | null; transitionOut: { type: TransitionType; duration: number } }
  interface TextOverlay { kind: "text" | "caption"; … }
  interface StickerOverlay { id; kind: "sticker"; emoji: string | null; shape: ShapeId | null; color: string; x; y; scale; rotation; start; end }
  type Overlay = TextOverlay | StickerOverlay;  Project.overlays: Overlay[]
  isTextOverlay(o): o is TextOverlay; isSticker(o): o is StickerOverlay
  makeSticker(partial & {id}): StickerOverlay   // defaults: emoji "⭐", shape null, color "#F5C542", x .5, y .5, scale 1, rotation 0, start 0, end 3
  migrateProject(raw): Project  // v1→v2→v3
  // effects.ts
  FILTERS: Record<FilterId, { label; preview: { tint: string; tintOpacity: number; saturation: number; brightness: number } }>
  TRANSITIONS: Record<TransitionType, { label }>
  SHAPES: Record<ShapeId, { label; path: string }>      // 100×100 box, M/L/C/Q/Z only
  CAPTION_STYLE: Pick<TextOverlay, "fontId"|"fontScale"|"color"|"background"|"outline"|"align"|"x"|"y">
  ```

- [ ] **Step 1: Write the failing tests**

Append to `src/editor/model/__tests__/migrate.test.ts`:
```ts
import { FILTER_IDS } from "../types";
test("v2 → v3 normalises effect fields; v1 → v3 chains", () => {
  const v2 = { ...v1, schemaVersion: 2, overlays: [], audioTracks: [], clips: [{ ...v1.clips[0], muted: false, speed: 7, filter: "sepia", transitionOut: { type: "wipe", duration: 2 } }] };
  const p = migrateProject(v2);
  expect(p.schemaVersion).toBe(3);
  expect(p.clips[0]).toMatchObject({ speed: 1, filter: null, transitionOut: { type: "none", duration: 0 } });
  const fromV1 = migrateProject(v1);
  expect(fromV1.schemaVersion).toBe(3);
  expect(fromV1.clips[0]).toMatchObject({ muted: false, speed: 1, filter: null });
  expect(FILTER_IDS).toContain("none");
});
test("v3 overlays keep kind; a text overlay without kind gets kind text", () => {
  const v3 = { ...v1, schemaVersion: 2, audioTracks: [], clips: [{ ...v1.clips[0], muted: false }], overlays: [{ id: "o", text: "x", fontId: "bangers", fontScale: 0.07, color: "#fff", background: null, outline: true, align: "center", x: 0.5, y: 0.5, scale: 1, rotation: 0, start: 0, end: 1 }] };
  expect(migrateProject(v3).overlays[0]).toMatchObject({ kind: "text" });
});
```
(Existing tests: update `expect(p.schemaVersion).toBe(SCHEMA_VERSION)` cases — they still pass; the "rejects newer" test must use `schemaVersion: 4`; the "v2 passes through" test becomes "v3 passes through unchanged" with `makeProject()`.)

`src/editor/__tests__/effects.test.ts`:
```ts
import { CAPTION_STYLE, FILTERS, SHAPES, TRANSITIONS } from "../effects";
import { FILTER_IDS, SHAPE_IDS, TRANSITION_TYPES } from "../model/types";

test("registry covers every id with sane preview params", () => {
  expect(FILTER_IDS).toHaveLength(8);
  for (const id of FILTER_IDS) {
    const f = FILTERS[id];
    expect(f.label.length).toBeGreaterThan(0);
    expect(f.preview.tintOpacity).toBeGreaterThanOrEqual(0); expect(f.preview.tintOpacity).toBeLessThanOrEqual(0.5);
    expect(f.preview.saturation).toBeGreaterThanOrEqual(0); expect(f.preview.saturation).toBeLessThanOrEqual(2);
    expect(Math.abs(f.preview.brightness)).toBeLessThanOrEqual(0.3);
  }
  expect(FILTERS.none.preview).toEqual({ tint: "#000000", tintOpacity: 0, saturation: 1, brightness: 0 });
  expect(TRANSITION_TYPES).toHaveLength(5);
  for (const t of TRANSITION_TYPES) expect(TRANSITIONS[t].label.length).toBeGreaterThan(0);
});

test("shape paths use only absolute M/L/C/Q/Z commands in a 100×100 box", () => {
  expect(SHAPE_IDS).toHaveLength(7);
  for (const id of SHAPE_IDS) {
    const path = SHAPES[id].path;
    expect(path.startsWith("M")).toBe(true);
    expect(path.trim().endsWith("Z")).toBe(true);
    expect(path).toMatch(/^[MLCQZ0-9 .-]+$/);
    for (const n of path.match(/-?\d+(\.\d+)?/g) ?? []) { expect(Number(n)).toBeGreaterThanOrEqual(0); expect(Number(n)).toBeLessThanOrEqual(100); }
  }
});

test("caption style default", () => {
  expect(CAPTION_STYLE).toEqual({ fontId: "montserrat", fontScale: 0.045, color: "#FFFFFF", background: { color: "#000000", opacity: 0.6 }, outline: false, align: "center", x: 0.5, y: 0.86 });
});
```

- [ ] **Step 2: Run — expect FAIL** (`npm test -- migrate effects`).

- [ ] **Step 3: Update `src/editor/model/types.ts`**

Change `SCHEMA_VERSION = 3 as const` and add/replace:
```ts
export const FILTER_IDS = ["none", "warm", "cool", "vivid", "faded", "mono", "noir", "vintage"] as const;
export type FilterId = (typeof FILTER_IDS)[number];
export const TRANSITION_TYPES = ["none", "fade", "dissolve", "slide", "zoom"] as const;
export type TransitionType = (typeof TRANSITION_TYPES)[number];
export const SHAPE_IDS = ["circle", "square", "roundedBox", "arrow", "star", "speechBubble", "heart"] as const;
export type ShapeId = (typeof SHAPE_IDS)[number];
export const SPEED_LIMITS = [0.25, 4] as const;
export const TRANSITION_LIMITS = { min: 0.3, max: 1.0 };

export interface Clip {
  id: string; sourceUri: string; sourceDuration: number; width: number; height: number;
  trimStart: number; trimEnd: number;
  speed: number;                 // 0.25–4
  filter: FilterId | null;
  volume: number; muted: boolean;
  transitionOut: { type: TransitionType; duration: number };
}

export interface TextOverlay {
  id: string; kind: "text" | "caption"; text: string; fontId: FontId; fontScale: number; color: string;
  background: { color: string; opacity: number } | null; outline: boolean; align: Align;
  x: number; y: number; scale: number; rotation: number; start: number; end: number;
}
export interface StickerOverlay {
  id: string; kind: "sticker"; emoji: string | null; shape: ShapeId | null; color: string;
  x: number; y: number; scale: number; rotation: number; start: number; end: number;
}
export type Overlay = TextOverlay | StickerOverlay;
export const isTextOverlay = (o: Overlay): o is TextOverlay => o.kind === "text" || o.kind === "caption";
export const isSticker = (o: Overlay): o is StickerOverlay => o.kind === "sticker";

export interface Project { /* unchanged except */ overlays: Overlay[]; schemaVersion: typeof SCHEMA_VERSION; }

export function makeSticker(partial: Partial<StickerOverlay> & Pick<StickerOverlay, "id">): StickerOverlay {
  return { kind: "sticker", emoji: "⭐", shape: null, color: "#F5C542", x: 0.5, y: 0.5, scale: 1, rotation: 0, start: 0, end: 3, ...partial };
}
```
`makeClip` defaults: `speed: 1, filter: null, transitionOut: { type: "none", duration: 0 }` (already present; the types now allow real values). `makeOverlay` unchanged (`kind: "text"`).

- [ ] **Step 4: Rewrite `src/editor/model/migrate.ts` as a chain**

```ts
import { FILTER_IDS, SCHEMA_VERSION, SPEED_LIMITS, TRANSITION_TYPES, type Clip, type Overlay, type Project } from "./types";

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;
type Raw = Record<string, unknown> & { clips: unknown[] };

function v1to2(raw: Raw): Raw {
  const clips = (raw.clips as Clip[]).map((c) => ({ ...c, volume: typeof c.volume === "number" ? c.volume : 1, muted: false }));
  return { ...raw, clips, overlays: [], audioTracks: [], schemaVersion: 2 };
}

function v2to3(raw: Raw): Raw {
  const clips = (raw.clips as Clip[]).map((c) => {
    const speed = typeof c.speed === "number" && c.speed >= SPEED_LIMITS[0] && c.speed <= SPEED_LIMITS[1] ? c.speed : 1;
    const filter = (FILTER_IDS as readonly string[]).includes(c.filter as string) && c.filter !== "none" ? c.filter : null;
    const t = c.transitionOut;
    const transitionOut = t && (TRANSITION_TYPES as readonly string[]).includes(t.type) && t.type !== "none" && typeof t.duration === "number" && t.duration > 0
      ? { type: t.type, duration: t.duration } : { type: "none" as const, duration: 0 };
    return { ...c, speed, filter, transitionOut };
  });
  const overlays = ((raw.overlays as Overlay[] | undefined) ?? []).map((o) => (o.kind ? o : { ...o, kind: "text" as const }));
  return { ...raw, clips, overlays, audioTracks: (raw.audioTracks as unknown[] | undefined) ?? [], schemaVersion: 3 };
}

/** Upgrades any supported project file to the current schema. Throws readable errors for bad input. */
export function migrateProject(raw: unknown): Project {
  if (!isObj(raw) || typeof raw.id !== "string" || !Array.isArray(raw.clips)) throw new Error("Project file is missing required fields");
  let version = typeof raw.schemaVersion === "number" ? raw.schemaVersion : 0;
  if (version > SCHEMA_VERSION) throw new Error("This project was made with a newer version of Clipy. Update the app to open it.");
  if (version < 1) throw new Error("Project file is missing required fields");
  let cur = raw as Raw;
  if (version === 1) { cur = v1to2(cur); version = 2; }
  if (version === 2) { cur = v2to3(cur); version = 3; }
  return cur as unknown as Project;
}
```
Note: `v2to3` keeps `filter: "none"` as `null` (both mean "no filter"; `null` is canonical in the model, `"none"` only exists in the sheet UI/registry).

- [ ] **Step 5: Create `src/editor/effects.ts`**

```ts
import type { FilterId, ShapeId, TextOverlay, TransitionType } from "./model/types";

export interface FilterPreview { tint: string; tintOpacity: number; saturation: number; brightness: number }
/** Preview approximations only. The real Core Image recipes live in modules/clipy-video/ios/Effects.swift, keyed by the same ids. */
export const FILTERS: Record<FilterId, { label: string; preview: FilterPreview }> = {
  none:    { label: "None",    preview: { tint: "#000000", tintOpacity: 0,    saturation: 1,   brightness: 0 } },
  warm:    { label: "Warm",    preview: { tint: "#FF9A3C", tintOpacity: 0.14, saturation: 1.1, brightness: 0.02 } },
  cool:    { label: "Cool",    preview: { tint: "#3C8CFF", tintOpacity: 0.14, saturation: 1.0, brightness: 0 } },
  vivid:   { label: "Vivid",   preview: { tint: "#FF2D7A", tintOpacity: 0.06, saturation: 1.4, brightness: 0.03 } },
  faded:   { label: "Faded",   preview: { tint: "#FFFFFF", tintOpacity: 0.12, saturation: 0.7, brightness: 0.08 } },
  mono:    { label: "Mono",    preview: { tint: "#000000", tintOpacity: 0,    saturation: 0,   brightness: 0 } },
  noir:    { label: "Noir",    preview: { tint: "#000000", tintOpacity: 0.18, saturation: 0,   brightness: -0.08 } },
  vintage: { label: "Vintage", preview: { tint: "#C8A05A", tintOpacity: 0.22, saturation: 0.6, brightness: -0.03 } },
};

export const TRANSITIONS: Record<TransitionType, { label: string }> = {
  none: { label: "None" }, fade: { label: "Fade" }, dissolve: { label: "Dissolve" }, slide: { label: "Slide" }, zoom: { label: "Zoom" },
};

/** 100×100 box, absolute M/L/C/Q/Z only — copied verbatim into Effects.swift. */
export const SHAPES: Record<ShapeId, { label: string; path: string }> = {
  circle:       { label: "Circle",  path: "M50 0 C77.6 0 100 22.4 100 50 C100 77.6 77.6 100 50 100 C22.4 100 0 77.6 0 50 C0 22.4 22.4 0 50 0 Z" },
  square:       { label: "Square",  path: "M0 0 L100 0 L100 100 L0 100 Z" },
  roundedBox:   { label: "Box",     path: "M20 0 L80 0 C91 0 100 9 100 20 L100 80 C100 91 91 100 80 100 L20 100 C9 100 0 91 0 80 L0 20 C0 9 9 0 20 0 Z" },
  arrow:        { label: "Arrow",   path: "M0 35 L60 35 L60 10 L100 50 L60 90 L60 65 L0 65 Z" },
  star:         { label: "Star",    path: "M50 0 L61 35 L98 35 L68 57 L79 91 L50 70 L21 91 L32 57 L2 35 L39 35 Z" },
  speechBubble: { label: "Bubble",  path: "M10 0 L90 0 C95.5 0 100 4.5 100 10 L100 60 C100 65.5 95.5 70 90 70 L40 70 L20 90 L25 70 L10 70 C4.5 70 0 65.5 0 60 L0 10 C0 4.5 4.5 0 10 0 Z" },
  heart:        { label: "Heart",   path: "M50 90 C20 65 0 50 0 30 C0 13 13 0 28 0 C38 0 46 6 50 14 C54 6 62 0 72 0 C87 0 100 13 100 30 C100 50 80 65 50 90 Z" },
};

export const CAPTION_STYLE: Pick<TextOverlay, "fontId" | "fontScale" | "color" | "background" | "outline" | "align" | "x" | "y"> = {
  fontId: "montserrat", fontScale: 0.045, color: "#FFFFFF", background: { color: "#000000", opacity: 0.6 }, outline: false, align: "center", x: 0.5, y: 0.86,
};

export const STICKER_EMOJI_SCALE = 0.12;   // emoji font size = STICKER_EMOJI_SCALE × frameH × scale
export const STICKER_SHAPE_SCALE = 0.2;    // shape box      = STICKER_SHAPE_SCALE × frameH × scale
```

- [ ] **Step 6: Fix consumers that broke** — `storage.test.ts` schema expectations → 3; `src/projects/storage.ts` uses `SCHEMA_VERSION` already. Anything typed `TextOverlay[]` for `project.overlays` now fails typecheck: in `OverlayLayer.tsx`, `OverlayLane.tsx`, `TextPanel.tsx`, `OverlayPill.tsx`, `modules/clipy-video/index.ts` (`toExportOverlay`), `useExport.ts` — narrow with `isTextOverlay` for now (`overlays.filter(isTextOverlay)`) so stickers are simply not rendered/exported until Tasks 9/12 handle them. `updateOverlay`'s patch type stays `Partial<Omit<TextOverlay,…>>` but `normaliseOverlay` must accept the union: give it a generic `<O extends Overlay>(p, o: O): O` that clamps the shared fields and, when `isTextOverlay(o)`, `fontScale`.

- [ ] **Step 7: Run — expect PASS**; full `npm test`, `npm run typecheck`.
- [ ] **Step 8: Commit** — `feat: schema v3 with effect fields, sticker overlays and the effects registry`

---

### Task 2: Speed-aware timeline math (TDD)

**Files:**
- Modify: `src/editor/model/timeline.ts`, `src/editor/model/ops.ts` (`splitClipAt`), `src/editor/timelineLayout.ts` (`thumbTimes`), `src/editor/usePreviewSync.ts`, `src/editor/components/PreviewPlayer.tsx`, `src/editor/components/TrimHandles.tsx`
- Test: `src/editor/model/__tests__/timeline.speed.test.ts`; extend `trimMath.test.ts`, `usePreviewSync.test.ts`, `timelineLayout.test.ts`

**Interfaces:**
- Produces: `clipDuration(c) = (trimEnd − trimStart) / speed`, `outputToSource(c, offsetInClip)`, `sourceToOutput(c, sourceTime)` exported from `timeline.ts`; `clipAt` unchanged in meaning (`offsetInClip` in output seconds); `trimFromDrag(clip, edge, startValue, translationX, pps)` now multiplies the dragged delta by `clip.speed`; `thumbTimes` steps `interval × speed` in source seconds; `nextPlayheadFromPlayer` maps through `sourceToOutput`; `PreviewPlayer` seeks via `outputToSource` and sets `player.playbackRate = clip.speed`, `player.preservesPitch = true`.

- [ ] **Step 1: Write the failing tests**

`src/editor/model/__tests__/timeline.speed.test.ts`:
```ts
jest.mock("@/src/lib/id", () => ({ newId: jest.fn(() => "new-id") }));
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
import { makeClip, makeProject } from "../types";
import { clipAt, clipDuration, clipStartTimes, outputToSource, sourceToOutput, totalDuration } from "../timeline";
import { splitClipAt } from "../ops";

const a = makeClip({ id: "a", sourceDuration: 10, trimStart: 2, trimEnd: 6, speed: 2 });   // 2 s output
const b = makeClip({ id: "b", sourceDuration: 4, trimStart: 0, trimEnd: 4, speed: 0.5 });  // 8 s output
const p = makeProject({ clips: [a, b] });

test("durations and conversions honour speed", () => {
  expect(clipDuration(a)).toBe(2);
  expect(clipDuration(b)).toBe(8);
  expect(totalDuration(p)).toBe(10);
  expect(clipStartTimes(p)).toEqual([0, 2]);
  expect(outputToSource(a, 0.5)).toBe(3);
  expect(sourceToOutput(a, 5)).toBe(1.5);
  expect(outputToSource(b, 6)).toBe(3);
});

test("clipAt uses output seconds", () => {
  expect(clipAt(p, 1.5)).toEqual({ clip: a, index: 0, offsetInClip: 1.5 });
  expect(clipAt(p, 6)).toEqual({ clip: b, index: 1, offsetInClip: 4 });
});

test("splitClipAt cuts at the source time under speed and keeps speed on both halves", () => {
  const next = splitClipAt(p, 1); // 1 s into a → source 4
  expect(next.clips[0]).toMatchObject({ trimStart: 2, trimEnd: 4, speed: 2 });
  expect(next.clips[1]).toMatchObject({ id: "new-id", trimStart: 4, trimEnd: 6, speed: 2 });
});
```

Append to `src/editor/__tests__/trimMath.test.ts`:
```ts
test("drag deltas are output seconds, converted to source seconds by speed", () => {
  const fast = makeClip({ id: "f", sourceDuration: 10, trimStart: 2, trimEnd: 6, speed: 2 });
  expect(trimFromDrag(fast, "end", 6, 50, 100)).toEqual({ trimStart: 2, trimEnd: 7 }); // 0.5 s on screen = 1 s of source
});
```

Append to `src/editor/__tests__/usePreviewSync.test.ts`:
```ts
test("player time maps through speed", () => {
  const fast = makeClip({ id: "f", sourceDuration: 10, trimStart: 2, trimEnd: 6, speed: 2 });
  const pf = makeProject({ clips: [fast, makeClip({ id: "g", sourceDuration: 2 })] });
  expect(nextPlayheadFromPlayer(pf, clipAt(pf, 0)!, 5, [])).toEqual({ playhead: 1.5, ended: false });
  expect(nextPlayheadFromPlayer(pf, clipAt(pf, 0)!, 6, [])).toEqual({ playhead: 2, ended: false });
});
```

Append to `src/editor/__tests__/timelineLayout.test.ts`:
```ts
test("thumbTimes steps through source time faster for sped-up clips", () => {
  const fast = makeClip({ id: "f", sourceDuration: 10, trimStart: 2, trimEnd: 6, speed: 2 }); // 2 s on screen
  expect(thumbTimes(fast, 64)).toEqual([2, 4]); // one thumb per output second → every 2 s of source
});
```

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement**

`src/editor/model/timeline.ts` — replace `clipDuration` and add:
```ts
/** Output seconds this clip occupies on the timeline. The ONLY place speed scales durations. */
export const clipDuration = (c: Clip): number => (c.trimEnd - c.trimStart) / c.speed;
/** Source-file seconds for an offset (output seconds) into the clip. */
export const outputToSource = (c: Clip, offsetInClip: number): number => c.trimStart + offsetInClip * c.speed;
/** Output offset (seconds into the clip) for a source-file time. */
export const sourceToOutput = (c: Clip, sourceTime: number): number => (sourceTime - c.trimStart) / c.speed;
```
`ops.ts` `splitClipAt`: `const cut = outputToSource(clip, offsetInClip);` (import it). `MIN_CLIP_SECONDS` checks stay in output seconds for the split guard.

`timelineLayout.ts` `thumbTimes`: `for (let t = c.trimStart; t < c.trimEnd - 1e-9 && out.length < 500; t += interval * c.speed)`.

`usePreviewSync.ts`: `if (playerTime < hit.clip.trimEnd) return { playhead: starts[hit.index] + sourceToOutput(hit.clip, playerTime), ended: false };` (import `sourceToOutput`).

`TrimHandles.tsx` `trimFromDrag`: `const raw = snap(startValue + xToTime(translationX, pps) * clip.speed);`.

`PreviewPlayer.tsx`: `const sourceTime = outputToSource(hit.clip, hit.offsetInClip);` and, next to the volume lines, `player.playbackRate = hit.clip.speed; player.preservesPitch = true;` (verify both properties exist in `node_modules/expo-video/build/VideoPlayer.types.d.ts`; add `hit?.clip.speed` to the effect deps). Note: `timeUpdate` still reports source `currentTime`, which `nextPlayheadFromPlayer` now converts, so playback at 2× advances the playhead at 1 output second per 2 source seconds — correct.

- [ ] **Step 4: Run — expect PASS**; full suite (all Phase 1/2 timeline tests still pass at speed 1); typecheck.
- [ ] **Step 5: Commit** — `feat: speed-aware timeline math with a single source↔output conversion`

---

### Task 3: Clip effect ops — speed, filter, transition, clearing rules (TDD)

**Files:**
- Modify: `src/editor/model/ops.ts`
- Test: `src/editor/model/__tests__/ops.effects.test.ts`

**Interfaces:**
- Consumes: `clipDuration`, `SPEED_LIMITS`, `TRANSITION_LIMITS`, `FilterId`, `TransitionType`, `MIN_CLIP_SECONDS`.
- Produces: `setClipSpeed(p, id, speed)`, `setClipFilter(p, id, filter: FilterId | null)`, `setFilterForAllClips(p, filter)`, `setTransition(p, id, t: { type; duration })`, `transitionCap(p, index): number` (max allowed duration for the cut after clip `index`, 0 when none), and updated `deleteClip`/`moveClip`/`splitClipAt`/`duplicateClip` per the rules below. All return the same reference on no-op.

Rules: speed clamped to 0.25–4 and additionally capped so `clipDuration ≥ 0.1`; setting speed re-caps the clip's own transition and the previous clip's transition. `setTransition`: `type none → duration 0`; otherwise `duration = clamp(duration, 0.3, transitionCap)`; if `transitionCap < 0.3` → no-op (toast is the UI's job); last clip → no-op. `deleteClip`/`moveClip`: afterwards the last clip's transition is cleared and every transition is re-capped against its new neighbour. `splitClipAt`: left half gets `transitionOut none`, right half keeps the original's. `duplicateClip`: the copy keeps the original's transition only if a clip follows it (it does — the original) — simpler: copy gets `none`.

- [ ] **Step 1: Write the failing tests**

`src/editor/model/__tests__/ops.effects.test.ts`:
```ts
jest.mock("@/src/lib/id", () => ({ newId: jest.fn(() => "new-id") }));
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
import { makeClip, makeProject } from "../types";
import { deleteClip, duplicateClip, moveClip, setClipFilter, setClipSpeed, setFilterForAllClips, setTransition, splitClipAt, transitionCap } from "../ops";

const a = makeClip({ id: "a", sourceDuration: 4 });   // 4 s
const b = makeClip({ id: "b", sourceDuration: 1 });   // 1 s
const c = makeClip({ id: "c", sourceDuration: 6 });   // 6 s
const p = makeProject({ clips: [a, b, c] });

test("setClipSpeed clamps and keeps output ≥ 0.1 s", () => {
  expect(setClipSpeed(p, "a", 9).clips[0].speed).toBe(4);
  expect(setClipSpeed(p, "a", 0.1).clips[0].speed).toBe(0.25);
  expect(setClipSpeed(p, "a", 1)).toBe(p);
  const tiny = makeProject({ clips: [makeClip({ id: "t", sourceDuration: 0.3 })] });
  expect(setClipSpeed(tiny, "t", 4).clips[0].speed).toBe(3);   // 0.3 / 3 = 0.1
});

test("filters", () => {
  expect(setClipFilter(p, "a", "warm").clips[0].filter).toBe("warm");
  expect(setClipFilter(p, "a", "none").clips[0].filter).toBeNull();
  expect(setClipFilter(p, "a", null)).toBe(p);
  expect(setFilterForAllClips(p, "mono").clips.map((x) => x.filter)).toEqual(["mono", "mono", "mono"]);
});

test("transitionCap and setTransition", () => {
  expect(transitionCap(p, 0)).toBe(0.5);   // min(4,1)/2
  expect(transitionCap(p, 1)).toBe(0.5);   // min(1,6)/2
  expect(transitionCap(p, 2)).toBe(0);     // last clip
  expect(setTransition(p, "a", { type: "fade", duration: 2 }).clips[0].transitionOut).toEqual({ type: "fade", duration: 0.5 });
  expect(setTransition(p, "a", { type: "fade", duration: 0.1 }).clips[0].transitionOut).toEqual({ type: "fade", duration: 0.3 });
  expect(setTransition(p, "a", { type: "none", duration: 0.7 }).clips[0].transitionOut).toEqual({ type: "none", duration: 0 });
  expect(setTransition(p, "c", { type: "fade", duration: 0.5 })).toBe(p);          // last clip
  const short = makeProject({ clips: [makeClip({ id: "s", sourceDuration: 0.4 }), a] });
  expect(setTransition(short, "s", { type: "fade", duration: 0.5 })).toBe(short);  // cap 0.2 < 0.3
});

test("speed changes re-cap transitions; delete/move clear the last clip's transition", () => {
  const withT = setTransition(setTransition(p, "a", { type: "dissolve", duration: 0.5 }), "b", { type: "fade", duration: 0.5 });
  const faster = setClipSpeed(withT, "b", 4); // b → 0.25 s → cap 0.125 < 0.3 → both neighbouring transitions cleared
  expect(faster.clips[0].transitionOut.type).toBe("none");
  expect(faster.clips[1].transitionOut.type).toBe("none");
  const noC = deleteClip(withT, "c");
  expect(noC.clips[1].transitionOut).toEqual({ type: "none", duration: 0 });   // b is now last
  const moved = moveClip(withT, "a", 2);                                        // a becomes last
  expect(moved.clips[2].transitionOut).toEqual({ type: "none", duration: 0 });
});

test("split and duplicate", () => {
  const withT = setTransition(p, "a", { type: "zoom", duration: 0.4 });
  const split = splitClipAt(withT, 2);
  expect(split.clips[0].transitionOut).toEqual({ type: "none", duration: 0 });
  expect(split.clips[1].transitionOut).toEqual({ type: "zoom", duration: 0.4 });
  expect(duplicateClip(withT, "a").clips[1].transitionOut).toEqual({ type: "none", duration: 0 });
});
```

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement** (append to `ops.ts`; import `SPEED_LIMITS`, `TRANSITION_LIMITS`, `FilterId`, `TransitionType`, `clipDuration`)

```ts
const NO_TRANSITION = { type: "none" as const, duration: 0 };
const r2 = (v: number) => Math.round(v * 100) / 100;

/** Max transition duration for the cut after clip `index`; 0 for the last clip. */
export function transitionCap(p: Project, index: number): number {
  const a = p.clips[index], b = p.clips[index + 1];
  if (!a || !b) return 0;
  return Math.min(TRANSITION_LIMITS.max, r2(0.5 * Math.min(clipDuration(a), clipDuration(b))));
}

/** Clears the last clip's transition and re-caps every other one against its neighbour; returns the same array if nothing changes. */
function normaliseTransitions(clips: Clip[]): Clip[] {
  let changed = false;
  const out = clips.map((c, i) => {
    const cap = transitionCap({ clips } as Project, i);
    let t = c.transitionOut;
    if (t.type !== "none" && (i === clips.length - 1 || cap < TRANSITION_LIMITS.min)) t = NO_TRANSITION;
    else if (t.type !== "none" && t.duration > cap) t = { type: t.type, duration: cap };
    if (t !== c.transitionOut) { changed = true; return { ...c, transitionOut: t }; }
    return c;
  });
  return changed ? out : clips;
}

export function setClipSpeed(p: Project, clipId: string, speed: number): Project {
  const i = p.clips.findIndex((c) => c.id === clipId);
  if (i < 0) return p;
  const c = p.clips[i];
  let s = clamp(speed, SPEED_LIMITS);
  const maxForMin = (c.trimEnd - c.trimStart) / MIN_CLIP_SECONDS;   // speed at which output hits 0.1 s
  s = r2(Math.min(s, maxForMin));
  if (s === c.speed) return p;
  const clips = p.clips.slice(); clips[i] = { ...c, speed: s };
  return touch(p, { clips: normaliseTransitions(clips) });
}

export function setClipFilter(p: Project, clipId: string, filter: FilterId | null): Project {
  const i = p.clips.findIndex((c) => c.id === clipId);
  if (i < 0) return p;
  const f = filter === "none" ? null : filter;
  if (f === p.clips[i].filter) return p;
  const clips = p.clips.slice(); clips[i] = { ...clips[i], filter: f };
  return touch(p, { clips });
}

export function setFilterForAllClips(p: Project, filter: FilterId | null): Project {
  const f = filter === "none" ? null : filter;
  if (p.clips.every((c) => c.filter === f)) return p;
  return touch(p, { clips: p.clips.map((c) => (c.filter === f ? c : { ...c, filter: f })) });
}

export function setTransition(p: Project, clipId: string, t: { type: TransitionType; duration: number }): Project {
  const i = p.clips.findIndex((c) => c.id === clipId);
  if (i < 0 || i === p.clips.length - 1) return p;
  let next: Clip["transitionOut"];
  if (t.type === "none") next = NO_TRANSITION;
  else {
    const cap = transitionCap(p, i);
    if (cap < TRANSITION_LIMITS.min) return p;
    next = { type: t.type, duration: r2(clamp(t.duration, [TRANSITION_LIMITS.min, cap])) };
  }
  const cur = p.clips[i].transitionOut;
  if (cur.type === next.type && cur.duration === next.duration) return p;
  const clips = p.clips.slice(); clips[i] = { ...clips[i], transitionOut: next };
  return touch(p, { clips });
}
```
Then update the existing ops: `deleteClip` → `touch(p, { clips: normaliseTransitions(p.clips.filter(...)) })`; `moveClip` → `normaliseTransitions(clips)` before `touch`; `splitClipAt` → `left = { ...clip, trimEnd: cut, transitionOut: NO_TRANSITION }`, `right` keeps `clip.transitionOut`; `duplicateClip` → `copy = { ...p.clips[i], id: newId(), transitionOut: NO_TRANSITION }`; `trimClip` → wrap the new clips array in `normaliseTransitions` too (trimming shortens a clip, which can lower the cap). `addClips` unchanged (new clips have `none`).

- [ ] **Step 4: Run — expect PASS**; full suite; typecheck.
- [ ] **Step 5: Commit** — `feat: add speed, filter and transition ops with capping and clearing rules`

---

### Task 4: Sticker ops and overlay-union plumbing (TDD)

**Files:**
- Modify: `src/editor/model/ops.ts`, `src/editor/components/OverlayLayer.tsx`, `OverlayLane.tsx`, `OverlayPill.tsx`, `TextPanel.tsx`, `SelectionFrame.tsx` (prop type → `Overlay`)
- Test: `src/editor/model/__tests__/ops.stickers.test.ts`

**Interfaces:**
- Produces: `addSticker(p, s: StickerOverlay)`, `updateSticker(p, id, patch: Partial<Omit<StickerOverlay,"id"|"kind">>)`; `updateOverlay` keeps its text patch type but tolerates sticker ids for the shared fields (x, y, scale, rotation, start, end) — implemented as `updateOverlayShared(p, id, patch: Partial<Pick<Overlay, "x"|"y"|"scale"|"rotation"|"start"|"end">>)` used by `SelectionFrame`, `OverlayPill` and the fine-tune fields; `moveOverlay`/`deleteOverlay`/`duplicateOverlay` operate on the union. `SelectionFrame` takes `overlay: Overlay` and calls `updateOverlayShared`.

- [ ] **Step 1: Write the failing tests**

`src/editor/model/__tests__/ops.stickers.test.ts`:
```ts
jest.mock("@/src/lib/id", () => ({ newId: jest.fn(() => "new-id") }));
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
import { makeClip, makeOverlay, makeProject, makeSticker } from "../types";
import { addSticker, duplicateOverlay, moveOverlay, updateOverlayShared, updateSticker } from "../ops";

const p = makeProject({ clips: [makeClip({ id: "a", sourceDuration: 10 })], overlays: [makeOverlay({ id: "t1" }), makeSticker({ id: "s1", start: 1, end: 3 })] });

test("addSticker appends; updateSticker patches sticker fields and clamps shared ones", () => {
  expect(addSticker(p, makeSticker({ id: "s2", emoji: "🔥" })).overlays.map((o) => o.id)).toEqual(["t1", "s1", "s2"]);
  const next = updateSticker(p, "s1", { emoji: null, shape: "heart", color: "#FF0000", scale: 9, x: 2 });
  expect(next.overlays[1]).toMatchObject({ emoji: null, shape: "heart", color: "#FF0000", scale: 5, x: 1 });
  expect(updateSticker(p, "t1", { color: "#000" })).toBe(p);   // not a sticker
});

test("shared updates, move and duplicate work for both kinds", () => {
  expect(updateOverlayShared(p, "s1", { rotation: 45 }).overlays[1]).toMatchObject({ rotation: 45 });
  expect(updateOverlayShared(p, "t1", { x: 0.2 }).overlays[0]).toMatchObject({ x: 0.2 });
  expect(moveOverlay(p, "s1", 5).overlays[1]).toMatchObject({ start: 5, end: 7 });
  const dup = duplicateOverlay(p, "s1");
  expect(dup.overlays[2]).toMatchObject({ kind: "sticker", id: "new-id" });
});
```

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement** (in `ops.ts`)

```ts
type SharedPatch = Partial<Pick<Overlay, "x" | "y" | "scale" | "rotation" | "start" | "end">>;

function normaliseOverlay<O extends Overlay>(p: Project, o: O): O {
  const total = totalDuration(p);
  let end = Math.min(o.end, total);
  let start = Math.max(0, Math.min(o.start, end));
  if (end - start < OVERLAY_LIMITS.minDuration) {
    if (start + OVERLAY_LIMITS.minDuration <= total) end = start + OVERLAY_LIMITS.minDuration;
    else { end = total; start = Math.max(0, total - OVERLAY_LIMITS.minDuration); }
  }
  const shared = { x: clamp(o.x, [0, 1]), y: clamp(o.y, [0, 1]), scale: clamp(o.scale, OVERLAY_LIMITS.scale), start: r3(start), end: r3(end) };
  return isTextOverlay(o) ? { ...o, ...shared, fontScale: clamp(o.fontScale, OVERLAY_LIMITS.fontScale) } : { ...o, ...shared };
}

function replaceOverlay(p: Project, i: number, next: Overlay): Project {
  if (JSON.stringify(next) === JSON.stringify(p.overlays[i])) return p;
  const overlays = p.overlays.slice(); overlays[i] = next;
  return touch(p, { overlays });
}

export function updateOverlay(p: Project, id: string, patch: Partial<Omit<TextOverlay, "id" | "kind">>): Project {
  const i = p.overlays.findIndex((o) => o.id === id);
  if (i < 0) return p;
  const cur = p.overlays[i];
  if (!isTextOverlay(cur)) return p;
  return replaceOverlay(p, i, normaliseOverlay(p, { ...cur, ...patch }));
}

export function updateOverlayShared(p: Project, id: string, patch: SharedPatch): Project {
  const i = p.overlays.findIndex((o) => o.id === id);
  if (i < 0) return p;
  return replaceOverlay(p, i, normaliseOverlay(p, { ...p.overlays[i], ...patch } as Overlay));
}

export function addSticker(p: Project, s: StickerOverlay): Project { return touch(p, { overlays: [...p.overlays, s] }); }

export function updateSticker(p: Project, id: string, patch: Partial<Omit<StickerOverlay, "id" | "kind">>): Project {
  const i = p.overlays.findIndex((o) => o.id === id);
  if (i < 0) return p;
  const cur = p.overlays[i];
  if (!isSticker(cur)) return p;
  return replaceOverlay(p, i, normaliseOverlay(p, { ...cur, ...patch }));
}
```
`moveOverlay` → use `updateOverlayShared`. `duplicateOverlay` → `normaliseOverlay(p, { ...src, id: newId(), x: src.x + 0.03, y: src.y + 0.03 } as Overlay)`. `addTextOverlay` unchanged. Components: `SelectionFrame` → `overlay: Overlay`, all gesture updates via `updateOverlayShared`; `TextPanel` fine-tune fields → `updateOverlayShared` for x/y/scale/rotation/start/end (text-only fields keep `updateOverlay`); `OverlayPill` (move/trim) → `updateOverlayShared`; `OverlayLayer`/`OverlayLane` keep filtering `isTextOverlay` until Task 9 adds the sticker renderer (write the filter so the sticker branch is a one-line addition).

- [ ] **Step 4: Run — expect PASS**; full suite; typecheck.
- [ ] **Step 5: Commit** — `feat: sticker overlay ops and shared overlay updates`

---

### Task 5: Captions model — line merging and caption ops (TDD)

**Files:**
- Create: `src/editor/model/captions.ts`
- Modify: `src/editor/model/ops.ts`
- Test: `src/editor/model/__tests__/captions.test.ts`

**Interfaces:**
- Produces:
  ```ts
  interface Segment { text: string; start: number; end: number }       // source seconds (from transcribe)
  interface Line { text: string; start: number; end: number }          // output seconds
  mergeSegmentsIntoLines(segments: Segment[], opts?: { maxChars?: 40; maxSeconds?: 3; pauseGap?: 0.6 }): Line[]   // segments already in OUTPUT seconds
  segmentsToOutput(clip: Clip, clipStart: number, segments: Segment[]): Segment[]   // source → output via sourceToOutput + clipStart; drops segments outside the trim
  linesToCaptions(lines: Line[], newId: () => string): TextOverlay[]   // kind "caption" + CAPTION_STYLE
  replaceCaptions(p, captions: TextOverlay[]): Project                 // removes all kind "caption", adds the new ones (one op)
  setCaptionStyleForAll(p, style: Partial<Pick<TextOverlay, "fontId"|"fontScale"|"color"|"background"|"outline"|"align"|"x"|"y">>): Project
  ```

- [ ] **Step 1: Write the failing tests**

`src/editor/model/__tests__/captions.test.ts`:
```ts
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
import { CAPTION_STYLE } from "@/src/editor/effects";
import { linesToCaptions, mergeSegmentsIntoLines, segmentsToOutput } from "../captions";
import { replaceCaptions, setCaptionStyleForAll } from "../ops";
import { makeClip, makeOverlay, makeProject } from "../types";

const w = (text: string, start: number, end: number) => ({ text, start, end });

test("merges words into lines by length, duration and pauses", () => {
  const words = [w("Hello", 0, 0.3), w("there", 0.35, 0.6), w("friends", 0.65, 1.0), w("this", 2.0, 2.2), w("is", 2.25, 2.4), w("Clipy", 2.45, 2.9)];
  expect(mergeSegmentsIntoLines(words)).toEqual([
    { text: "Hello there friends", start: 0, end: 1.0 },
    { text: "this is Clipy", start: 2.0, end: 2.9 },
  ]); // pause of 1.0 s > 0.6 splits
  const long = Array.from({ length: 12 }, (_, i) => w("word" + i, i * 0.2, i * 0.2 + 0.15)); // "word0 word1 …" > 40 chars
  const lines = mergeSegmentsIntoLines(long);
  expect(lines.length).toBeGreaterThan(1);
  for (const l of lines) expect(l.text.length).toBeLessThanOrEqual(40);
  const slow = [w("a", 0, 1), w("b", 1.1, 2), w("c", 2.1, 3.2), w("d", 3.3, 4)];
  expect(mergeSegmentsIntoLines(slow).map((l) => l.text)).toEqual(["a b", "c d"]); // 3 s limit
  expect(mergeSegmentsIntoLines([])).toEqual([]);
});

test("segmentsToOutput maps through the clip's trim, speed and start", () => {
  const clip = makeClip({ id: "a", sourceDuration: 10, trimStart: 2, trimEnd: 6, speed: 2 });
  expect(segmentsToOutput(clip, 5, [w("x", 3, 4), w("out", 7, 8), w("edge", 1, 2.5)])).toEqual([
    { text: "edge", start: 5, end: 5.25 },
    { text: "x", start: 5.5, end: 6 },
  ]); // "out" is past trimEnd; "edge" is clamped to the trim
});

test("linesToCaptions applies the caption style; replaceCaptions swaps only captions; style applies to all", () => {
  let n = 0;
  const caps = linesToCaptions([{ text: "hi", start: 0, end: 1 }], () => `c${++n}`);
  expect(caps[0]).toMatchObject({ id: "c1", kind: "caption", text: "hi", start: 0, end: 1, ...CAPTION_STYLE });
  const p = makeProject({ clips: [makeClip({ id: "a", sourceDuration: 10 })], overlays: [makeOverlay({ id: "t" }), makeOverlay({ id: "old", kind: "caption" })] });
  const next = replaceCaptions(p, caps);
  expect(next.overlays.map((o) => o.id)).toEqual(["t", "c1"]);
  const styled = setCaptionStyleForAll(next, { color: "#F5C542", y: 0.9 });
  expect(styled.overlays[1]).toMatchObject({ color: "#F5C542", y: 0.9 });
  expect(styled.overlays[0]).toMatchObject({ color: makeOverlay({ id: "t" }).color });
  expect(setCaptionStyleForAll(styled, { color: "#F5C542" })).toBe(styled);
});
```

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement `src/editor/model/captions.ts`**

```ts
import { CAPTION_STYLE } from "@/src/editor/effects";
import { sourceToOutput } from "./timeline";
import type { Clip, TextOverlay } from "./types";

export interface Segment { text: string; start: number; end: number }
export interface Line { text: string; start: number; end: number }
export interface MergeOptions { maxChars?: number; maxSeconds?: number; pauseGap?: number }

const r3 = (v: number) => Math.round(v * 1000) / 1000;

/** Groups timed words/phrases into caption lines: break on long pauses, line length, or line duration. Input and output are in the same time base. */
export function mergeSegmentsIntoLines(segments: Segment[], opts: MergeOptions = {}): Line[] {
  const maxChars = opts.maxChars ?? 40, maxSeconds = opts.maxSeconds ?? 3, pauseGap = opts.pauseGap ?? 0.6;
  const lines: Line[] = [];
  let cur: Line | null = null;
  for (const s of segments) {
    const text = s.text.trim();
    if (!text) continue;
    const breakHere = cur !== null && (s.start - cur.end > pauseGap || `${cur.text} ${text}`.length > maxChars || s.end - cur.start > maxSeconds);
    if (cur === null || breakHere) { if (cur) lines.push(cur); cur = { text, start: r3(s.start), end: r3(s.end) }; }
    else { cur.text = `${cur.text} ${text}`; cur.end = r3(Math.max(cur.end, s.end)); }
  }
  if (cur) lines.push(cur);
  return lines;
}

/** Converts source-time segments of one clip into output-time segments; drops segments outside the trim, clamps partial ones. */
export function segmentsToOutput(clip: Clip, clipStart: number, segments: Segment[]): Segment[] {
  const out: Segment[] = [];
  for (const s of segments) {
    const a = Math.max(s.start, clip.trimStart), b = Math.min(s.end, clip.trimEnd);
    if (b <= a) continue;
    out.push({ text: s.text, start: r3(clipStart + sourceToOutput(clip, a)), end: r3(clipStart + sourceToOutput(clip, b)) });
  }
  return out.sort((x, y) => x.start - y.start);
}

export function linesToCaptions(lines: Line[], newId: () => string): TextOverlay[] {
  return lines.map((l) => ({ id: newId(), kind: "caption", text: l.text, ...CAPTION_STYLE, scale: 1, rotation: 0, start: l.start, end: l.end }));
}
```
`ops.ts`:
```ts
export function replaceCaptions(p: Project, captions: TextOverlay[]): Project {
  const kept = p.overlays.filter((o) => o.kind !== "caption");
  if (kept.length === p.overlays.length && captions.length === 0) return p;
  return touch(p, { overlays: [...kept, ...captions.map((c) => normaliseOverlay(p, c))] });
}
export function setCaptionStyleForAll(p: Project, style: Partial<Pick<TextOverlay, "fontId" | "fontScale" | "color" | "background" | "outline" | "align" | "x" | "y">>): Project {
  let changed = false;
  const overlays = p.overlays.map((o) => {
    if (o.kind !== "caption") return o;
    const next = normaliseOverlay(p, { ...o, ...style });
    if (JSON.stringify(next) !== JSON.stringify(o)) { changed = true; return next; }
    return o;
  });
  return changed ? touch(p, { overlays }) : p;
}
```

- [ ] **Step 4: Run — expect PASS**; full suite; typecheck.
- [ ] **Step 5: Commit** — `feat: caption line merging and caption ops`

---

### Task 6: Speed sheet, strip badges, toolbar

**Files:**
- Create: `src/editor/components/SpeedSheet.tsx`
- Modify: `src/editor/components/ClipThumbStrip.tsx` (speed/filter badges), `src/editor/components/EditorToolbar.tsx`
- Test: `src/editor/__tests__/SpeedSheet.test.tsx`; extend `EditorToolbar.test.tsx`

**Interfaces:**
- Consumes: `setClipSpeed`, `SPEED_LIMITS`, `Sheet`, `Chip`, `Slider`, `NumField` not needed.
- Produces: `<SpeedSheet clipId visible onClose />`; `ClipThumbStrip` shows a `highlight` badge `"2×"` (formatted `${speed}×`, trailing zeros trimmed) when `speed !== 1` and a small `f` badge when `filter` is set (badge props derived from the clip); toolbar order `Split · Trim · Speed · Filter · Transition · Text · Sticker · Captions · Music · Volume · Ratio · Duplicate · Delete` — this task adds **Speed** only (others are added by their tasks, in that order).

- [ ] **Step 1: Write the failing tests**

`src/editor/__tests__/SpeedSheet.test.tsx`:
```tsx
import { fireEvent, render, screen } from "@testing-library/react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
jest.mock("@react-native-community/slider", () => { const { View } = require("react-native"); return ({ testID, onSlidingStart, onValueChange }: { testID?: string; onSlidingStart?: () => void; onValueChange?: (v: number) => void }) => <View testID={testID} onTouchStart={() => onSlidingStart?.()} onTouchMove={() => onValueChange?.(1.5)} />; });
import { makeClip, makeProject } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { SpeedSheet } from "../components/SpeedSheet";

beforeEach(() => { useEditorStore.getState().reset(); useEditorStore.getState().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 8 })] })); });

test("chips set the speed; the slider is one undo step", async () => {
  await render(<SpeedSheet clipId="a" visible onClose={() => {}} />);
  await fireEvent.press(screen.getByRole("button", { name: "2×" }));
  expect(useEditorStore.getState().project!.clips[0].speed).toBe(2);
  const slider = screen.getByTestId("speed-slider");
  await fireEvent(slider, "touchStart"); await fireEvent(slider, "touchMove");
  expect(useEditorStore.getState().project!.clips[0].speed).toBe(1.5);
  expect(useEditorStore.getState().past).toHaveLength(2);
  expect(screen.getByText("1.5×")).toBeTruthy();
});
```
Append to `EditorToolbar.test.tsx`: `Speed` disabled without selection, enabled after `select("a")`; and in `ClipThumbStrip` (new test file `ClipThumbStrip.badges.test.tsx`): render with `clip: makeClip({ id:"a", sourceDuration: 4, speed: 2, filter: "warm" })` → `getByText("2×")` and `getByText("f")` exist; with speed 1 and no filter → neither.

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement `SpeedSheet.tsx`**

```tsx
import Slider from "@react-native-community/slider";
import { View } from "react-native";
import { setClipSpeed } from "@/src/editor/model/ops";
import { SPEED_LIMITS } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { theme } from "@/src/theme/theme";
import { Chip } from "@/src/ui/Chip";
import { Sheet } from "@/src/ui/Sheet";
import { Body } from "@/src/ui/Text";

const PRESETS = [0.25, 0.5, 1, 1.5, 2, 4];
export const formatSpeed = (s: number) => `${Number(s.toFixed(2))}×`;

export function SpeedSheet({ clipId, visible, onClose }: { clipId: string | null; visible: boolean; onClose: () => void }) {
  const clip = useEditorStore((s) => s.project?.clips.find((c) => c.id === clipId) ?? null);
  const { apply, beginTransaction, applyTransient } = useEditorStore.getState();
  if (!clip) return null;
  return (
    <Sheet visible={visible} onClose={onClose} title="Speed">
      <Body muted>{formatSpeed(clip.speed)}</Body>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.space.sm }}>
        {PRESETS.map((s) => <Chip key={s} label={formatSpeed(s)} selected={clip.speed === s} onPress={() => apply((p) => setClipSpeed(p, clip.id, s))} />)}
      </View>
      <Slider testID="speed-slider" minimumValue={SPEED_LIMITS[0]} maximumValue={SPEED_LIMITS[1]} step={0.05} value={clip.speed}
        onSlidingStart={beginTransaction} onValueChange={(v) => applyTransient((p) => setClipSpeed(p, clip.id, v))}
        minimumTrackTintColor={theme.colors.accent} maximumTrackTintColor={theme.colors.surfaceAlt} thumbTintColor={theme.colors.highlight} />
      <Body muted style={{ fontSize: 12 }}>Audio keeps its pitch in the exported video.</Body>
    </Sheet>
  );
}
```
`ClipThumbStrip`: add two absolutely positioned badges at the bottom-left (`speed !== 1` → `formatSpeed(speed)` in `highlight` on `bg`, 10 px font; `filter` → `f` in `sea`); import `formatSpeed` from `SpeedSheet` (or move it to `src/lib/format.ts` — do that: `formatSpeed` lives in `format.ts`, re-exported nowhere else). Toolbar: `<ToolButton label="Speed" icon="speedometer" disabled={noSel} onPress={() => setSheet("speed")} />` after Trim; render `<SpeedSheet clipId={selectedId} visible={sheet === "speed"} onClose={() => setSheet(null)} />`.

- [ ] **Step 4: Run — expect PASS**; full suite; typecheck. Device: set 2× → strip halves, plays faster, total time updates; undo restores.
- [ ] **Step 5: Commit** — `feat: add per-clip speed with strip badges`

---

### Task 7: Filter sheet, FilterLayer, PreviewTag

**Files:**
- Create: `src/editor/components/FilterSheet.tsx`, `src/editor/components/FilterLayer.tsx`, `src/editor/components/PreviewTag.tsx`
- Modify: `src/editor/components/PreviewPlayer.tsx`, `src/editor/components/EditorToolbar.tsx`
- Test: `src/editor/__tests__/FilterSheet.test.tsx`, `src/editor/__tests__/FilterLayer.test.tsx`

**Interfaces:**
- Consumes: `FILTERS`, `FILTER_IDS`, `setClipFilter`, `setFilterForAllClips`, `getThumb` (for tiles), `clipAt`.
- Produces: `<FilterSheet clipId visible onClose />`, `<FilterLayer filter: FilterId | null />` (absolute full-frame; renders nothing for null/none), `<PreviewTag visible />` (chip "Preview" top-left), `isInTransitionWindow(p, playhead)` (pure, in `timeline.ts`: true when `|playhead − cutTime| ≤ d/2` for any cut with a transition) — used by Task 8's layer too. `PreviewPlayer` shows the tag when `hit.clip.filter` is set or `isInTransitionWindow`.

- [ ] **Step 1: Write the failing tests**

`src/editor/__tests__/FilterLayer.test.tsx`:
```tsx
import { render, screen } from "@testing-library/react-native";
import { FilterLayer } from "../components/FilterLayer";
import { FILTERS } from "@/src/editor/effects";

test("renders tint, desaturation and brightness layers from the registry", async () => {
  await render(<FilterLayer filter="vintage" />);
  const tint = screen.getByTestId("filter-tint");
  expect(tint).toHaveStyle({ backgroundColor: FILTERS.vintage.preview.tint, opacity: FILTERS.vintage.preview.tintOpacity });
  expect(screen.getByTestId("filter-desaturate")).toHaveStyle({ opacity: 1 - FILTERS.vintage.preview.saturation });
  expect(screen.getByTestId("filter-brightness")).toHaveStyle({ backgroundColor: "#000000", opacity: 0.03 });
});
test("renders nothing for none/null", async () => {
  await render(<FilterLayer filter={null} />);
  expect(screen.queryByTestId("filter-tint")).toBeNull();
});
```

`src/editor/__tests__/FilterSheet.test.tsx`:
```tsx
import { fireEvent, render, screen } from "@testing-library/react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
jest.mock("@/src/editor/components/thumbnails", () => ({ getThumb: jest.fn(async () => "file:///thumb.jpg") }));
import { makeClip, makeProject } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { FilterSheet } from "../components/FilterSheet";

beforeEach(() => { useEditorStore.getState().reset(); useEditorStore.getState().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 4 }), makeClip({ id: "b", sourceDuration: 4 })] })); });

test("tiles apply a filter to the clip; Apply to all applies to every clip", async () => {
  await render(<FilterSheet clipId="a" visible onClose={() => {}} />);
  await fireEvent.press(screen.getByRole("button", { name: "Warm" }));
  expect(useEditorStore.getState().project!.clips.map((c) => c.filter)).toEqual(["warm", null]);
  await fireEvent.press(screen.getByRole("button", { name: "Apply to all clips" }));
  expect(useEditorStore.getState().project!.clips.map((c) => c.filter)).toEqual(["warm", "warm"]);
  await fireEvent.press(screen.getByRole("button", { name: "None" }));
  expect(useEditorStore.getState().project!.clips[0].filter).toBeNull();
});
```

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement**

`timeline.ts` — add:
```ts
/** True when the playhead is inside the window of any transition (centred on its cut). */
export function isInTransitionWindow(p: Project, playhead: number): boolean {
  const starts = clipStartTimes(p);
  return p.clips.some((c, i) => {
    if (i === p.clips.length - 1 || c.transitionOut.type === "none") return false;
    const cut = starts[i] + clipDuration(c);
    return Math.abs(playhead - cut) <= c.transitionOut.duration / 2;
  });
}
```

`FilterLayer.tsx`:
```tsx
import { View } from "react-native";
import { FILTERS } from "@/src/editor/effects";
import type { FilterId } from "@/src/editor/model/types";

/** Preview-only approximation of a filter: tint, desaturation (grey) and brightness (black/white) layers. */
export function FilterLayer({ filter }: { filter: FilterId | null }) {
  if (!filter || filter === "none") return null;
  const f = FILTERS[filter].preview;
  const full = { position: "absolute" as const, inset: 0 };
  return (
    <View pointerEvents="none" style={full}>
      <View testID="filter-desaturate" style={{ ...full, backgroundColor: "#808080", opacity: Math.max(0, 1 - f.saturation) }} />
      <View testID="filter-tint" style={{ ...full, backgroundColor: f.tint, opacity: f.tintOpacity }} />
      <View testID="filter-brightness" style={{ ...full, backgroundColor: f.brightness >= 0 ? "#FFFFFF" : "#000000", opacity: Math.abs(f.brightness) }} />
    </View>
  );
}
```
(Saturation > 1 — "vivid" — can't be approximated by overlays; it renders the tint only, which the registry's small tintOpacity accounts for.)

`PreviewTag.tsx`: a `View` at top-left (`left: 8, top: 8`) with `Body` text "Preview", `surfaceAlt` background @ 0.8, `straw` border, radius `pill`; `visible` false → null; `testID="preview-tag"`.

`FilterSheet.tsx`: `Sheet` titled "Filter"; horizontal `ScrollView` of tiles: each tile is a `Pressable` (`accessibilityRole="button"`, `accessibilityLabel={label}`, `accessibilityState={{ selected }}`) 72×96 containing an `Image` of the clip's first thumb (`getThumb(clip.sourceUri, clip.trimStart)` loaded in a `useEffect` into state; a `surfaceAlt` box while loading) with `<FilterLayer filter={id} />` absolutely over it, and the label below; `None` tile first. Tap → `apply(setClipFilter(clip.id, id))`. Below: `<PrimaryButton title="Apply to all clips" onPress={() => apply(setFilterForAllClips(clip.filter))} />` (uses the clip's current filter; `accessibilityLabel` must equal the title — `PrimaryButton` already sets it).

`PreviewPlayer.tsx`: inside the aspect-frame `Pressable`, after `VideoView`: `<FilterLayer filter={hit?.clip.filter ?? null} />` then (Task 8 adds the transition layer here) then `<PreviewTag visible={!!hit?.clip.filter || isInTransitionWindow(project, playhead)} />` placed after the overlay layer so it draws on top.

Toolbar: `<ToolButton label="Filter" icon="color-filter" disabled={noSel} onPress={() => setSheet("filter")} />` after Speed; render `<FilterSheet clipId={selectedId} .../>`.

- [ ] **Step 4: Run — expect PASS**; full suite; typecheck. Device: Warm tints the preview + "Preview" tag; `f` badge on the strip; Apply to all.
- [ ] **Step 5: Commit** — `feat: add filters with preview approximation and a Preview tag`

---

### Task 8: Transition sheet, cut markers, TransitionLayer

**Files:**
- Create: `src/editor/components/TransitionSheet.tsx`, `src/editor/components/TransitionLayer.tsx`, `src/editor/components/CutMarker.tsx`
- Modify: `src/editor/components/Timeline.tsx`, `src/editor/components/PreviewPlayer.tsx`, `src/editor/components/EditorToolbar.tsx`, `src/editor/model/timeline.ts` (`transitionProgress`)
- Test: `src/editor/__tests__/TransitionSheet.test.tsx`, `src/editor/model/__tests__/transitionWindow.test.ts`

**Interfaces:**
- Consumes: `setTransition`, `transitionCap`, `TRANSITIONS`, `TRANSITION_TYPES`, `TRANSITION_LIMITS`, `isInTransitionWindow`.
- Produces: `transitionProgress(p, playhead): { index: number; progress: number } | null` (progress 0→1 across the window; `timeline.ts`), `<TransitionSheet clipIndex visible onClose />` (the cut after `clipIndex`), `<TransitionLayer />` (black overlay, opacity = `1 − |2·progress − 1|`), `<CutMarker index />` (diamond at the cut, tap → opens the sheet for that index via a callback prop on `Timeline`: `onCutPress?(index)`), toolbar **Transition** (disabled when no selection OR the selected clip is last).

- [ ] **Step 1: Write the failing tests**

`src/editor/model/__tests__/transitionWindow.test.ts`:
```ts
import { makeClip, makeProject } from "../types";
import { isInTransitionWindow, transitionProgress } from "../timeline";
const p = makeProject({ clips: [makeClip({ id: "a", sourceDuration: 4, transitionOut: { type: "fade", duration: 1 } }), makeClip({ id: "b", sourceDuration: 4 })] });
test("window is centred on the cut", () => {
  expect(isInTransitionWindow(p, 3.4)).toBe(false);
  expect(isInTransitionWindow(p, 3.6)).toBe(true);
  expect(isInTransitionWindow(p, 4.5)).toBe(true);
  expect(isInTransitionWindow(p, 4.6)).toBe(false);
  expect(transitionProgress(p, 3.5)).toEqual({ index: 0, progress: 0 });
  expect(transitionProgress(p, 4)).toEqual({ index: 0, progress: 0.5 });
  expect(transitionProgress(p, 4.5)).toEqual({ index: 0, progress: 1 });
  expect(transitionProgress(p, 1)).toBeNull();
});
```

`src/editor/__tests__/TransitionSheet.test.tsx`:
```tsx
import { fireEvent, render, screen } from "@testing-library/react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
jest.mock("@react-native-community/slider", () => { const { View } = require("react-native"); return ({ testID, onSlidingStart, onValueChange }: { testID?: string; onSlidingStart?: () => void; onValueChange?: (v: number) => void }) => <View testID={testID} onTouchStart={() => onSlidingStart?.()} onTouchMove={() => onValueChange?.(0.8)} />; });
import { makeClip, makeProject } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { TransitionSheet } from "../components/TransitionSheet";

beforeEach(() => { useEditorStore.getState().reset(); useEditorStore.getState().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 4 }), makeClip({ id: "b", sourceDuration: 4 })] })); });

test("chips set the type with a default duration; the slider adjusts within the cap", async () => {
  await render(<TransitionSheet clipIndex={0} visible onClose={() => {}} />);
  await fireEvent.press(screen.getByRole("button", { name: "Dissolve" }));
  expect(useEditorStore.getState().project!.clips[0].transitionOut).toEqual({ type: "dissolve", duration: 0.5 });
  const slider = screen.getByTestId("transition-slider");
  await fireEvent(slider, "touchStart"); await fireEvent(slider, "touchMove");
  expect(useEditorStore.getState().project!.clips[0].transitionOut.duration).toBe(0.8);
  await fireEvent.press(screen.getByRole("button", { name: "None" }));
  expect(useEditorStore.getState().project!.clips[0].transitionOut).toEqual({ type: "none", duration: 0 });
});

test("last clip shows the no-next-clip message", async () => {
  await render(<TransitionSheet clipIndex={1} visible onClose={() => {}} />);
  expect(screen.getByText("No clip after this one")).toBeTruthy();
});
```

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement**

`timeline.ts`:
```ts
export function transitionProgress(p: Project, playhead: number): { index: number; progress: number } | null {
  const starts = clipStartTimes(p);
  for (let i = 0; i < p.clips.length - 1; i++) {
    const t = p.clips[i].transitionOut;
    if (t.type === "none") continue;
    const cut = starts[i] + clipDuration(p.clips[i]);
    const a = cut - t.duration / 2;
    if (playhead >= a && playhead <= cut + t.duration / 2) return { index: i, progress: Math.round(((playhead - a) / t.duration) * 1000) / 1000 };
  }
  return null;
}
```
(`isInTransitionWindow` from Task 7 can now be `transitionProgress(p, t) !== null`.)

`TransitionSheet.tsx`: `Sheet` "Transition"; derives `clip = project.clips[clipIndex]`, `cap = transitionCap(project, clipIndex)`; if `clipIndex >= clips.length − 1` → `<Body muted>No clip after this one</Body>`; else chips for `TRANSITION_TYPES` (labels from `TRANSITIONS`), tap → `apply(setTransition(clip.id, { type, duration: type === "none" ? 0 : Math.min(0.5, cap) }))`; a `Slider` (`testID="transition-slider"`, min `TRANSITION_LIMITS.min`, max `cap`, step 0.05, disabled when `type === "none"` or `cap < 0.3`) with `beginTransaction`/`applyTransient(setTransition(clip.id, { type: current.type, duration: v }))`; label `${duration.toFixed(2)} s`; a `Body muted` note when `cap < TRANSITION_LIMITS.min`: "Clips are too short for a transition here".

`TransitionLayer.tsx`: reads `project`/`playhead`; `const tp = project ? transitionProgress(project, playhead) : null; if (!tp) return null;` → `<View pointerEvents="none" testID="transition-layer" style={{ position: "absolute", inset: 0, backgroundColor: "#000000", opacity: 1 - Math.abs(2 * tp.progress - 1) }} />`.

`CutMarker.tsx`: 12×12 rotated square (`highlight`) centred on the cut: `position: "absolute", left: timeToX(cutTime, pps) − 6, top: (CLIP_AREA_HEIGHT − 12)/2`, wrapped in a `Pressable` (`accessibilityLabel="Transition after clip N"`) calling `onPress`. `Timeline` renders one per clip `i < clips.length − 1` with `transitionOut.type !== "none"`, inside the clip row (after the strips, so it draws on top), and accepts `onCutPress?: (index: number) => void`.

`PreviewPlayer.tsx`: add `<TransitionLayer />` after `FilterLayer`. Toolbar: `<ToolButton label="Transition" icon="swap-horizontal" disabled={noSel || selectedIndex === clips.length − 1} onPress={() => setSheet("transition")} />` after Filter; `TransitionSheet clipIndex={selectedIndex}`; the editor screen passes `onCutPress={(i) => { select(clips[i].id); openTransitionSheet(i) }}` — expose this by lifting `sheet` state for the transition only: add prop `transitionFor: number | null` + `onTransitionChange` to `EditorToolbar` mirroring the text-panel pattern.

- [ ] **Step 4: Run — expect PASS**; full suite; typecheck. Device: set Fade on cut 1 → diamond marker, fade-to-black while playing across the cut, "Preview" tag inside the window.
- [ ] **Step 5: Commit** — `feat: add transitions with cut markers and a fade preview`

---

### Task 9: Emoji data, Sticker sheet, sticker rendering

**Files:**
- Create: `scripts/gen-emoji.mjs`, `assets/emoji.json`, `src/editor/emoji.ts`, `src/projects/prefs.ts`, `src/editor/components/StickerSheet.tsx`, `src/editor/components/StickerView.tsx`
- Modify: `src/editor/components/OverlayLayer.tsx` (render stickers), `src/editor/components/OverlayPill.tsx` (icon label), `src/editor/components/EditorToolbar.tsx` (+Sticker), `package.json` (devDependency `unicode-emoji-json`, script `gen:emoji`)
- Test: `src/editor/__tests__/emoji.test.ts`, `src/editor/__tests__/StickerSheet.test.tsx`, `src/editor/__tests__/StickerView.test.tsx`

**Interfaces:**
- Produces: `EMOJI: { char: string; name: string; keywords: string[] }[]` (from `assets/emoji.json`), `searchEmoji(query, limit = 60)`; `prefs.getRecentEmoji(): Promise<string[]>`, `prefs.pushRecentEmoji(char)` (max 24, `prefs.json` in the document dir via `expoFs`); `<StickerSheet visible onClose onAdded(id) />`; `<StickerView sticker frameW frameH />` (emoji → `Text` with `fontSize = STICKER_EMOJI_SCALE × frameH × scale`; shape → `Svg` 100×100 viewBox scaled to `STICKER_SHAPE_SCALE × frameH × scale`, `Path d={SHAPES[shape].path} fill={color}`), centred at `(x·frameW, y·frameH)` with rotation like `OverlayText`; `OverlayLayer` renders `StickerView` for `kind === "sticker"` with the same `Pressable` + `SelectionFrame`; `OverlayPill` shows the emoji / shape label for stickers.

- [ ] **Step 1: Generate the emoji data** — `npm i -D unicode-emoji-json`; `scripts/gen-emoji.mjs`:
```js
import { readFileSync, writeFileSync } from "node:fs";
const data = JSON.parse(readFileSync("node_modules/unicode-emoji-json/data-by-emoji.json", "utf8"));
const out = Object.entries(data)
  .filter(([, v]) => !v.skin_tone_support || true)
  .map(([char, v]) => ({ char, name: v.name, keywords: Array.from(new Set([v.group, v.slug.replace(/_/g, " "), ...v.name.split(/\s+/)])).map((k) => k.toLowerCase()) }));
writeFileSync("assets/emoji.json", JSON.stringify(out));
console.log(`wrote ${out.length} emoji`);
```
Add `"gen:emoji": "node scripts/gen-emoji.mjs"` to `package.json` scripts; run it; commit `assets/emoji.json` (≈ 1,900 entries, ~250 KB). Verify the licence of `unicode-emoji-json` (MIT) in its `package.json` and note it in the README.

- [ ] **Step 2: Write the failing tests**

`src/editor/__tests__/emoji.test.ts`:
```ts
import { EMOJI, searchEmoji } from "../emoji";
test("emoji data loads and is searchable", () => {
  expect(EMOJI.length).toBeGreaterThan(1000);
  expect(EMOJI.every((e) => e.char && e.name && e.keywords.length > 0)).toBe(true);
  expect(searchEmoji("fire").some((e) => e.char === "🔥")).toBe(true);
  expect(searchEmoji("").length).toBe(60);
  expect(searchEmoji("zzzzqqq")).toEqual([]);
});
```
`src/editor/__tests__/StickerView.test.tsx`:
```tsx
import { render, screen } from "@testing-library/react-native";
import { makeSticker } from "@/src/editor/model/types";
import { StickerView } from "../components/StickerView";
test("emoji stickers size from the frame; shapes render the registry path", async () => {
  await render(<StickerView sticker={makeSticker({ id: "s", emoji: "🔥", x: 0.5, y: 0.5, scale: 2 })} frameW={200} frameH={400} />);
  expect(screen.getByText("🔥")).toHaveStyle({ fontSize: 96 }); // 0.12 × 400 × 2
  expect(screen.getByTestId("sticker-s")).toHaveStyle({ left: 100, top: 200 });
  await render(<StickerView sticker={makeSticker({ id: "h", emoji: null, shape: "heart", color: "#FF0000" })} frameW={200} frameH={400} />);
  expect(screen.getByTestId("sticker-shape-h").props.fill).toBe("#FF0000");
});
```
`src/editor/__tests__/StickerSheet.test.tsx`:
```tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
jest.mock("@/src/lib/id", () => ({ newId: () => "st1" }));
jest.mock("@/src/projects/prefs", () => ({ prefs: { getRecentEmoji: jest.fn(async () => ["🎉"]), pushRecentEmoji: jest.fn(async () => {}) } }));
import { makeClip, makeProject } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { StickerSheet } from "../components/StickerSheet";

beforeEach(() => { useEditorStore.getState().reset(); useEditorStore.getState().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 10 })] })); useEditorStore.getState().seek(2); });

test("picking an emoji adds a selected sticker at the playhead and records it as recent", async () => {
  const onAdded = jest.fn();
  await render(<StickerSheet visible onClose={() => {}} onAdded={onAdded} />);
  expect(await screen.findByText("🎉")).toBeTruthy();   // recents row
  await fireEvent.changeText(screen.getByLabelText("Search emoji"), "fire");
  await fireEvent.press(await screen.findByLabelText("Emoji fire"));
  const ov = useEditorStore.getState().project!.overlays[0];
  expect(ov).toMatchObject({ kind: "sticker", emoji: "🔥", start: 2, end: 5 });
  expect(useEditorStore.getState().selectedOverlayId).toBe("st1");
  expect(onAdded).toHaveBeenCalledWith("st1");
});

test("shapes tab adds a shape sticker with the chosen color", async () => {
  await render(<StickerSheet visible onClose={() => {}} onAdded={() => {}} />);
  await fireEvent.press(screen.getByRole("button", { name: "Shapes" }));
  await fireEvent.press(screen.getByLabelText("Color #2E86AB"));
  await fireEvent.press(screen.getByRole("button", { name: "Heart" }));
  expect(useEditorStore.getState().project!.overlays[0]).toMatchObject({ kind: "sticker", emoji: null, shape: "heart", color: "#2E86AB" });
});
```

- [ ] **Step 3: Run — expect FAIL.**

- [ ] **Step 4: Implement**

`src/editor/emoji.ts`:
```ts
import data from "../../assets/emoji.json";
export interface EmojiEntry { char: string; name: string; keywords: string[] }
export const EMOJI: EmojiEntry[] = data as EmojiEntry[];
export function searchEmoji(query: string, limit = 60): EmojiEntry[] {
  const q = query.trim().toLowerCase();
  const list = q ? EMOJI.filter((e) => e.name.toLowerCase().includes(q) || e.keywords.some((k) => k.includes(q))) : EMOJI;
  return list.slice(0, limit);
}
```
`src/projects/prefs.ts` (uses `expoFs`; tolerant of a missing/corrupt file):
```ts
import { expoFs } from "./expoFs";
const PATH = () => `${expoFs.documentDir}prefs.json`;
type Prefs = { recentEmoji: string[] };
async function read(): Promise<Prefs> { try { return { recentEmoji: [], ...(JSON.parse(await expoFs.readText(PATH())) as Partial<Prefs>) }; } catch { return { recentEmoji: [] }; } }
export const prefs = {
  getRecentEmoji: async () => (await read()).recentEmoji,
  pushRecentEmoji: async (char: string) => { const p = await read(); p.recentEmoji = [char, ...p.recentEmoji.filter((c) => c !== char)].slice(0, 24); await expoFs.writeText(PATH(), JSON.stringify(p)); },
};
```
`StickerView.tsx`:
```tsx
import { Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { SHAPES, STICKER_EMOJI_SCALE, STICKER_SHAPE_SCALE } from "@/src/editor/effects";
import type { StickerOverlay } from "@/src/editor/model/types";

/** One sticker centred on (x·frameW, y·frameH), rotated about its centre. Sizes mirror Effects.swift. */
export function StickerView({ sticker: s, frameW, frameH, children }: { sticker: StickerOverlay; frameW: number; frameH: number; children?: React.ReactNode }) {
  const box = s.shape ? STICKER_SHAPE_SCALE * frameH * s.scale : 0;
  const fontSize = STICKER_EMOJI_SCALE * frameH * s.scale;
  return (
    <View testID={`sticker-${s.id}`} pointerEvents="box-none"
      style={{ position: "absolute", left: s.x * frameW, top: s.y * frameH, width: 0, height: 0, alignItems: "center", justifyContent: "center", transform: [{ rotate: `${s.rotation}deg` }] }}>
      <View style={{ position: "absolute" }}>
        {s.shape ? (
          <Svg width={box} height={box} viewBox="0 0 100 100"><Path testID={`sticker-shape-${s.id}`} d={SHAPES[s.shape].path} fill={s.color} /></Svg>
        ) : (
          <Text style={{ fontSize, lineHeight: fontSize * 1.2 }}>{s.emoji ?? "?"}</Text>
        )}
        {children}
      </View>
    </View>
  );
}
```
`OverlayLayer.tsx`: for each visible overlay, `isSticker(o) ? <StickerView …>{pressable}{frame}</StickerView> : <OverlayText …>…</OverlayText>` (the `Pressable` label: `Sticker ${o.emoji ?? o.shape}`). `OverlayPill`: label = `isSticker(o) ? (o.emoji ?? SHAPES[o.shape!].label) : o.text`.

`StickerSheet.tsx`: `Sheet` "Sticker" (height 60 %); tabs **Emoji** / **Shapes** (Chips). Emoji tab: `TextInput` (`accessibilityLabel="Search emoji"`), a **Recent** row (from `prefs.getRecentEmoji()` loaded on mount), then a `FlatList` grid (`numColumns={8}`) of `searchEmoji(query)` as `Pressable`s (`accessibilityLabel={`Emoji ${e.name}`}`, 36 px text). Picking: `const id = newId(); apply((p) => addSticker(p, { ...makeSticker({ id, emoji: e.char }), ...defaultOverlayRange(p, playhead) })); selectOverlay(id); prefs.pushRecentEmoji(e.char); onAdded(id); onClose();`. Shapes tab: `ColorRow` (from Task 7 of Phase 2) bound to local `color` state (default `theme.colors.highlight`), then a grid of shape tiles (`Pressable` with `accessibilityRole="button"`, `accessibilityLabel={SHAPES[id].label}`, a 48 px `Svg` preview in `color`); picking adds `makeSticker({ id, emoji: null, shape, color })` the same way. Toolbar: `<ToolButton label="Sticker" icon="happy" disabled={!hasClips} onPress={() => setSheet("sticker")} />` after Text; `StickerSheet onAdded={(id) => onStickerPanelChange?.(id)}` — Task 10 wires the panel; for now `onAdded` just selects.

- [ ] **Step 5: Run — expect PASS**; full suite; typecheck; `npx expo-doctor`. Device: add 🔥 and a heart; drag/pinch/rotate; pills on the lane.
- [ ] **Step 6: Commit** — `feat: add emoji and shape stickers`

---

### Task 10: Sticker panel (double-tap editing)

**Files:**
- Create: `src/editor/components/StickerPanel.tsx`
- Modify: `src/editor/components/EditorToolbar.tsx`, `app/editor/[id]/index.tsx`, `src/editor/components/PreviewPlayer.tsx` (route double-tap by kind)
- Test: `src/editor/__tests__/StickerPanel.test.tsx`

**Interfaces:**
- Consumes: `updateSticker`, `updateOverlayShared`, `deleteOverlay`, `duplicateOverlay`, `ColorRow`, `NumField`, `Slider`.
- Produces: `<StickerPanel overlayId visible onClose onRetarget />`; the editor screen keeps ONE `panelFor: { id: string; kind: "text" | "sticker" } | null` state; `PreviewPlayer.onOpenTextPanel` becomes `onOpenPanel(overlayId)` and the screen looks up the kind to decide which panel opens. Toolbar props become `panelFor` / `onPanelChange`.

- [ ] **Step 1: Write the failing test**

`src/editor/__tests__/StickerPanel.test.tsx`:
```tsx
import { fireEvent, render, screen } from "@testing-library/react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
jest.mock("@/src/lib/id", () => ({ newId: () => "dup" }));
jest.mock("@react-native-community/slider", () => { const { View } = require("react-native"); return ({ testID, onSlidingStart, onValueChange }: { testID?: string; onSlidingStart?: () => void; onValueChange?: (v: number) => void }) => <View testID={testID} onTouchStart={() => onSlidingStart?.()} onTouchMove={() => onValueChange?.(2)} />; });
import { makeClip, makeProject, makeSticker } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { StickerPanel } from "../components/StickerPanel";

beforeEach(() => { useEditorStore.getState().reset(); useEditorStore.getState().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 10 })], overlays: [makeSticker({ id: "s1", emoji: null, shape: "star", start: 1, end: 4 })] })); useEditorStore.getState().selectOverlay("s1"); });
const st = () => useEditorStore.getState().project!.overlays.find((o) => o.id === "s1")!;

test("color (shapes only), size slider, fine-tune, duplicate", async () => {
  const onRetarget = jest.fn();
  await render(<StickerPanel overlayId="s1" visible onClose={() => {}} onRetarget={onRetarget} />);
  await fireEvent.press(screen.getByLabelText("Color #C8102E"));
  expect(st()).toMatchObject({ color: "#C8102E" });
  const slider = screen.getByTestId("sticker-size-slider");
  await fireEvent(slider, "touchStart"); await fireEvent(slider, "touchMove");
  expect(st()).toMatchObject({ scale: 2 });
  await fireEvent.press(screen.getByText("Fine-tune"));
  await fireEvent.changeText(screen.getByLabelText("Rotation °"), "90");
  await fireEvent(screen.getByLabelText("Rotation °"), "blur");
  expect(st()).toMatchObject({ rotation: 90 });
  await fireEvent.press(screen.getByRole("button", { name: "Duplicate" }));
  expect(useEditorStore.getState().project!.overlays).toHaveLength(2);
  expect(onRetarget).toHaveBeenCalledWith("dup");
});
test("emoji stickers hide the color row", async () => {
  useEditorStore.getState().apply((p) => ({ ...p, overlays: [makeSticker({ id: "s1", emoji: "🔥", start: 1, end: 4 })] }));
  await render(<StickerPanel overlayId="s1" visible onClose={() => {}} />);
  expect(screen.queryByLabelText("Color #C8102E")).toBeNull();
});
```

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement `StickerPanel.tsx`** — `Sheet` "Sticker" (height 50 %): if `sticker.shape` → `ColorRow value={sticker.color} onChange={(color) => apply(updateSticker(id, { color }))}`; size `Slider` (`testID="sticker-size-slider"`, 0.2–5, `beginTransaction`/`applyTransient(updateOverlayShared(id, { scale: v }))`) with label `${Math.round(scale*100)}%`; collapsible **Fine-tune** with `NumField`s X % / Y % / Scale / Rotation ° / Start s / End s via `updateOverlayShared`; row `Duplicate` (apply `duplicateOverlay`, select + `onRetarget` the copy at `indexOf(id)+1`) · `Delete` (apply `deleteOverlay`, `onClose`). Editor screen: `panelFor` state; `PreviewPlayer onOpenPanel={(id) => setPanelFor({ id, kind: overlayKind(id) === "sticker" ? "sticker" : "text" })}`; toolbar renders `TextPanel` when `panelFor?.kind === "text"` and `StickerPanel` when `"sticker"`; `StickerSheet onAdded={(id) => onPanelChange({ id, kind: "sticker" })}` is NOT done (per spec the sheet closes and the sticker is selected; double-tap opens the panel).

- [ ] **Step 4: Run — expect PASS**; full suite; typecheck. Device: double-tap a sticker → panel; recolor a shape; resize; rotate 90 via fine-tune.
- [ ] **Step 5: Commit** — `feat: add the sticker panel`

---

### Task 11: Captions — native wrapper, hook, sheets (Expo Go fallback)

**Files:**
- Modify: `modules/clipy-video/index.ts`, `modules/clipy-video/__tests__/index.test.ts`, `src/editor/components/EditorToolbar.tsx`
- Create: `src/editor/useCaptions.ts`, `src/editor/components/CaptionsSheet.tsx`, `src/editor/components/CaptionStyleSheet.tsx`
- Test: `src/editor/__tests__/useCaptions.test.ts`, `src/editor/__tests__/CaptionsSheet.test.tsx`

**Interfaces:**
- Produces:
  ```ts
  // modules/clipy-video/index.ts
  interface TranscriptSegment { text: string; start: number; end: number }   // source seconds
  transcribe(uri: string, trimStart: number, trimEnd: number): Promise<TranscriptSegment[]>
  cancelTranscribe(): void
  // src/editor/useCaptions.ts
  useCaptions(): { state: { status: "idle" | "unavailable" | "running" | "done" | "error"; clipIndex: number; clipCount: number; message?: string; skipped: string[] }, run(): Promise<void>, cancel(): void, reset(): void }
  ```
  `run()` iterates present clips in order, calls `transcribe`, converts with `segmentsToOutput`, merges all lines with `mergeSegmentsIntoLines`, and applies ONE `replaceCaptions`; clips with no segments go to `skipped`; cancel → nothing applied. `<CaptionsSheet visible onClose />` shows the fallback card / confirm-replace / progress / result; `<CaptionStyleSheet visible onClose />` edits `CAPTION_STYLE` fields and applies `setCaptionStyleForAll`.

- [ ] **Step 1: Write the failing tests**

Add to `modules/clipy-video/__tests__/index.test.ts` (extend the native stub with `transcribe: jest.fn(async () => [{ text: "hi", start: 0, end: 1 }])`, `cancelTranscribe: jest.fn()`):
```ts
it("transcribe forwards the trim range and returns segments", async () => {
  await expect(transcribe("file:///a.mov", 1, 3)).resolves.toEqual([{ text: "hi", start: 0, end: 1 }]);
  expect(native.transcribe).toHaveBeenCalledWith("file:///a.mov", 1, 3);
  cancelTranscribe(); expect(native.cancelTranscribe).toHaveBeenCalled();
});
```
`src/editor/__tests__/useCaptions.test.ts`:
```ts
import { act, renderHook, waitFor } from "@testing-library/react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
jest.mock("@/src/lib/id", () => { let n = 0; return { newId: () => `c${++n}` }; });
jest.mock("@/modules/clipy-video", () => ({
  isNativeAvailable: () => true,
  transcribe: jest.fn(async (uri: string) => (uri.includes("a") ? [{ text: "Hello", start: 0, end: 0.5 }, { text: "world", start: 0.6, end: 1 }] : [])),
  cancelTranscribe: jest.fn(),
}));
import { makeClip, makeProject } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { useCaptions } from "../useCaptions";

beforeEach(() => { useEditorStore.getState().reset(); useEditorStore.getState().setProject(makeProject({ clips: [makeClip({ id: "a", sourceUri: "file:///a.mov", sourceDuration: 2 }), makeClip({ id: "b", sourceUri: "file:///b.mov", sourceDuration: 2 })] })); });

test("transcribes every clip, merges lines, applies captions once, reports skipped clips", async () => {
  const { result } = await renderHook(() => useCaptions());
  await act(() => result.current.run());
  await waitFor(() => expect(result.current.state.status).toBe("done"));
  const caps = useEditorStore.getState().project!.overlays;
  expect(caps).toHaveLength(1);
  expect(caps[0]).toMatchObject({ kind: "caption", text: "Hello world", start: 0, end: 1 });
  expect(result.current.state.skipped).toEqual(["b"]);
  expect(useEditorStore.getState().past).toHaveLength(1);
});
```
`src/editor/__tests__/CaptionsSheet.test.tsx`:
```tsx
import { render, screen } from "@testing-library/react-native";
jest.mock("@/modules/clipy-video", () => ({ isNativeAvailable: () => false, transcribe: jest.fn(), cancelTranscribe: jest.fn() }));
import { makeClip, makeProject } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { CaptionsSheet } from "../components/CaptionsSheet";
test("shows the fallback card in Expo Go", async () => {
  useEditorStore.getState().reset(); useEditorStore.getState().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 2 })] }));
  await render(<CaptionsSheet visible onClose={() => {}} />);
  expect(screen.getByText("Captions need the native build")).toBeTruthy();
});
```

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement**

`modules/clipy-video/index.ts`: add `TranscriptSegment`, `transcribe(uri, trimStart, trimEnd)` and `cancelTranscribe()` to `ClipyVideoNative` and the exports (same lazy `native()` pattern).

`src/editor/useCaptions.ts`:
```ts
import { useCallback, useRef, useState } from "react";
import { cancelTranscribe, isNativeAvailable, transcribe } from "@/modules/clipy-video";
import { linesToCaptions, mergeSegmentsIntoLines, segmentsToOutput, type Segment } from "@/src/editor/model/captions";
import { replaceCaptions } from "@/src/editor/model/ops";
import { clipStartTimes } from "@/src/editor/model/timeline";
import { useEditorStore } from "@/src/editor/store";
import { newId } from "@/src/lib/id";

export type CaptionsState = { status: "idle" | "unavailable" | "running" | "done" | "error"; clipIndex: number; clipCount: number; message?: string; skipped: string[] };

export function useCaptions() {
  const [state, setState] = useState<CaptionsState>({ status: isNativeAvailable() ? "idle" : "unavailable", clipIndex: 0, clipCount: 0, skipped: [] });
  const cancelled = useRef(false);

  const run = useCallback(async () => {
    const s = useEditorStore.getState();
    const p = s.project;
    if (!p || !isNativeAvailable()) return;
    cancelled.current = false;
    const clips = p.clips.filter((c) => !s.missingSourceUris.includes(c.sourceUri));
    const starts = clipStartTimes(p);
    setState({ status: "running", clipIndex: 0, clipCount: clips.length, skipped: [] });
    const all: Segment[] = []; const skipped: string[] = [];
    try {
      for (let i = 0; i < clips.length; i++) {
        if (cancelled.current) { setState((st) => ({ ...st, status: "idle" })); return; }
        setState((st) => ({ ...st, clipIndex: i }));
        const c = clips[i];
        const segs = await transcribe(c.sourceUri, c.trimStart, c.trimEnd);
        if (segs.length === 0) skipped.push(c.id);
        all.push(...segmentsToOutput(c, starts[p.clips.indexOf(c)], segs));
      }
      if (cancelled.current) { setState((st) => ({ ...st, status: "idle" })); return; }
      const lines = mergeSegmentsIntoLines(all.sort((a, b) => a.start - b.start));
      useEditorStore.getState().apply((proj) => replaceCaptions(proj, linesToCaptions(lines, newId)));
      setState({ status: "done", clipIndex: clips.length, clipCount: clips.length, skipped });
    } catch (e) {
      setState({ status: "error", clipIndex: 0, clipCount: clips.length, message: e instanceof Error ? e.message : String(e), skipped });
    }
  }, []);

  const cancel = useCallback(() => { cancelled.current = true; cancelTranscribe(); }, []);
  const reset = useCallback(() => setState({ status: isNativeAvailable() ? "idle" : "unavailable", clipIndex: 0, clipCount: 0, skipped: [] }), []);
  return { state, run, cancel, reset };
}
```
`CaptionsSheet.tsx`: `Sheet` "Captions". `unavailable` → card "Captions need the native build" + `Body muted` "Transcription runs on your iPhone with Apple's speech recognizer, which Expo Go can't load." `idle` → if any `kind: "caption"` overlay exists: "Replace existing captions?" with **Replace** (runs) / **Cancel**; else **Transcribe** button + note "Uses on-device speech recognition. Clips: N". `running` → `Transcribing clip ${clipIndex+1} of ${clipCount}…` + progress bar + **Cancel**. `done` → "Added captions." (+ "No speech found in: clip 2, clip 3" when `skipped` non-empty, by index) + **Style captions** (opens `CaptionStyleSheet`) + **Done**. `error` → message + **Try again**. `CaptionStyleSheet`: `FontStrip`, size `Slider` (0.02–0.1), `ColorRow`, background toggle + color + opacity, `NumField` Y % — each change `apply(setCaptionStyleForAll(patch))`. Toolbar: `<ToolButton label="Captions" icon="chatbox-ellipses" disabled={!hasClips} onPress={() => setSheet("captions")} />` after Sticker.

- [ ] **Step 4: Run — expect PASS**; full suite; typecheck. Device (Expo Go): Captions → fallback card.
- [ ] **Step 5: Commit** — `feat: add auto-captions flow with on-device transcription contract and Expo Go fallback`

---

### Task 12: Export request — speed, filters, transitions, stickers, captions (TypeScript)

**Files:**
- Modify: `modules/clipy-video/index.ts`, `src/export/useExport.ts`, `src/export/estimate.ts`
- Test: update `src/export/__tests__/useExport.test.ts`, `modules/clipy-video/__tests__/index.test.ts`, `src/export/__tests__/estimate.test.ts`

**Interfaces:**
- Produces (TS ↔ Swift contract; Task 13 mirrors it exactly):
  ```ts
  interface ExportClip { sourceUri; trimStart; trimEnd; volume; muted; speed: number; filter: string | null; transition: { type: string; duration: number } }
  interface ExportOverlay { kind: "text" | "caption" | "sticker"; text: string; fontPostScriptName: string; fontScale: number; color: string; backgroundColor: string | null; backgroundOpacity: number; outline: boolean; align: Align; emoji: string | null; shape: string | null; x; y; scale; rotation; start; end }
  toExportOverlay(o: Overlay): ExportOverlay      // stickers: text "", fontPostScriptName "", fontScale 0, align "center", outline false, backgroundColor null, backgroundOpacity 0
  ```
  `estimateBytes` uses `totalDuration` (already speed-aware via `clipDuration`). Transitions on dropped (missing) clips are cleared in the request (`exportableClips` re-normalises the last clip's transition to none).

- [ ] **Step 1: Update the tests**: in `useExport.test.ts` give clip `a` `speed: 2, filter: "warm", transitionOut: { type: "fade", duration: 0.5 }` and add a sticker overlay; assert the request contains `clips: [expect.objectContaining({ speed: 2, filter: "warm", transition: { type: "fade", duration: 0.5 } }), …]` and `overlays` containing `expect.objectContaining({ kind: "sticker", emoji: "⭐", shape: null })` and the text overlay with `kind: "text"`. In the missing-clip test assert the last exported clip has `transition: { type: "none", duration: 0 }`. In `index.test.ts` update the request literal (`speed: 1, filter: null, transition: {type:"none",duration:0}`; overlay fields incl. `kind/emoji/shape`).

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement** — `index.ts`: extend the interfaces; `toExportOverlay`:
```ts
export function toExportOverlay(o: Overlay): ExportOverlay {
  const shared = { x: o.x, y: o.y, scale: o.scale, rotation: o.rotation, start: o.start, end: o.end };
  if (isSticker(o)) return { kind: "sticker", text: "", fontPostScriptName: "", fontScale: 0, color: o.color, backgroundColor: null, backgroundOpacity: 0, outline: false, align: "center", emoji: o.emoji, shape: o.shape, ...shared };
  return { kind: o.kind, text: o.text, fontPostScriptName: FONTS[o.fontId].postScriptName, fontScale: o.fontScale, color: o.color,
    backgroundColor: o.background?.color ?? null, backgroundOpacity: o.background?.opacity ?? 0, outline: o.outline, align: o.align, emoji: null, shape: null, ...shared };
}
```
`useExport.start`: clips map adds `speed: c.speed, filter: c.filter, transition: c.transitionOut`; after filtering missing clips, set the last clip's `transition` to `{ type: "none", duration: 0 }` and re-cap others via `transitionCap` on a temporary project (`{ ...project, clips }`) — reuse `normaliseTransitions` by exporting it from `ops.ts` as `normaliseTransitionsForClips`. Overlays: `project.overlays.filter((o) => o.end > o.start).map(toExportOverlay)` (stickers included).

- [ ] **Step 4: Run — expect PASS**; full suite; typecheck.
- [ ] **Step 5: Commit** — `feat: carry speed, filters, transitions and stickers in the export request`

---

### Task 13: Swift — Effects registry mirror, custom compositor, speed, stickers (compiled on EAS only)

**Files:**
- Create: `modules/clipy-video/ios/Effects.swift`, `modules/clipy-video/ios/ClipyCompositor.swift`, `modules/clipy-video/ios/SVGPath.swift`
- Modify: `modules/clipy-video/ios/ExportSession.swift`, `modules/clipy-video/ios/Tests/ExportSessionTests.swift`

**Interfaces:**
- Consumes: Task 12 request shape (field names exact).
- Produces: `ExportClip` gains `speed`, `filter: String?`, `transition: ExportTransition { type, duration }`; `ExportOverlay` gains `kind`, `emoji: String?`, `shape: String?`; `Effects.filterChain(id) -> [(name: String, params: [String: Any])]`, `Effects.shapePath(id) -> String?` (verbatim TS paths), `SVGPath.cgPath(from:) -> CGPath` (M/L/C/Q/Z absolute parser), `ClipyInstruction: NSObject, AVVideoCompositionInstructionProtocol` (timeRange, `layers: [LayerSpec]` where `LayerSpec { trackID, transform, filter }`, `transition: (type, progressRange)?`), `ClipyCompositor: NSObject, AVVideoCompositing` (Core Image rendering with `CIContext`, aspect-fill via the per-layer transform, filter chain, blend per transition type and progress).

No compiler here: verify against `node_modules/expo-modules-core/ios` for Records only; AVFoundation/Core Image by knowledge; keep Phase 1/2 behaviour (progress, cancel, HighestQuality, cleanup, text layers, audio mix).

- [ ] **Step 1: `Effects.swift`**
```swift
import CoreImage
import Foundation

/// Mirror of src/editor/effects.ts — ids and shape paths must stay identical.
enum Effects {
  static let filterIds = ["none", "warm", "cool", "vivid", "faded", "mono", "noir", "vintage"]
  static let transitionTypes = ["none", "fade", "dissolve", "slide", "zoom"]

  /// Core Image recipe per filter id (applied in order). Unknown ids → empty chain (no filter).
  static func filterChain(_ id: String?) -> [(name: String, params: [String: Any])] {
    switch id {
    case "warm":    return [("CITemperatureAndTint", ["inputNeutral": CIVector(x: 6500, y: 0), "inputTargetNeutral": CIVector(x: 7100, y: 0)]), ("CIColorControls", ["inputSaturation": 1.1])]
    case "cool":    return [("CITemperatureAndTint", ["inputNeutral": CIVector(x: 6500, y: 0), "inputTargetNeutral": CIVector(x: 5900, y: 0)])]
    case "vivid":   return [("CIColorControls", ["inputSaturation": 1.4, "inputContrast": 1.1])]
    case "faded":   return [("CIColorControls", ["inputSaturation": 0.7, "inputBrightness": 0.08, "inputContrast": 0.9])]
    case "mono":    return [("CIPhotoEffectMono", [:])]
    case "noir":    return [("CIPhotoEffectNoir", [:])]
    case "vintage": return [("CISepiaTone", ["inputIntensity": 0.5]), ("CIVignette", ["inputIntensity": 1.0, "inputRadius": 1.5])]
    default:        return []
    }
  }

  static func apply(_ chain: [(name: String, params: [String: Any])], to image: CIImage) -> CIImage {
    var out = image
    for step in chain {
      guard let f = CIFilter(name: step.name) else { continue }
      f.setValue(out, forKey: kCIInputImageKey)
      for (k, v) in step.params { f.setValue(v, forKey: k) }
      out = f.outputImage ?? out
    }
    return out.cropped(to: image.extent)
  }

  static let shapePaths: [String: String] = [
    "circle":       "M50 0 C77.6 0 100 22.4 100 50 C100 77.6 77.6 100 50 100 C22.4 100 0 77.6 0 50 C0 22.4 22.4 0 50 0 Z",
    "square":       "M0 0 L100 0 L100 100 L0 100 Z",
    "roundedBox":   "M20 0 L80 0 C91 0 100 9 100 20 L100 80 C100 91 91 100 80 100 L20 100 C9 100 0 91 0 80 L0 20 C0 9 9 0 20 0 Z",
    "arrow":        "M0 35 L60 35 L60 10 L100 50 L60 90 L60 65 L0 65 Z",
    "star":         "M50 0 L61 35 L98 35 L68 57 L79 91 L50 70 L21 91 L32 57 L2 35 L39 35 Z",
    "speechBubble": "M10 0 L90 0 C95.5 0 100 4.5 100 10 L100 60 C100 65.5 95.5 70 90 70 L40 70 L20 90 L25 70 L10 70 C4.5 70 0 65.5 0 60 L0 10 C0 4.5 4.5 0 10 0 Z",
    "heart":        "M50 90 C20 65 0 50 0 30 C0 13 13 0 28 0 C38 0 46 6 50 14 C54 6 62 0 72 0 C87 0 100 13 100 30 C100 50 80 65 50 90 Z",
  ]
  static let stickerEmojiScale: CGFloat = 0.12
  static let stickerShapeScale: CGFloat = 0.2
}
```

- [ ] **Step 2: `SVGPath.swift`** — tokenizer over `M L C Q Z` + numbers; builds a `CGMutablePath` (`move`, `addLine`, `addCurve(to:control1:control2:)`, `addQuadCurve(to:control:)`, `closeSubpath`); returns nil on any other command. Include a `static func test()` comment listing the expected point counts for `square` (4 points) for the XCTest.

- [ ] **Step 3: Records + composition changes in `ExportSession.swift`**
```swift
struct ExportTransition: Record { @Field var type: String = "none"; @Field var duration: Double = 0 }
// ExportClip: + @Field var speed: Double = 1; @Field var filter: String? ; @Field var transition: ExportTransition = ExportTransition()
// ExportOverlay: + @Field var kind: String = "text"; @Field var emoji: String? ; @Field var shape: String?
```
Composition (replace the single-video-track build): use two video tracks `trackA`/`trackB`, alternating per clip. For clip *i* with output duration `outDur = (trimEnd − trimStart)/speed`, insert its source range at `cursor` on its track, then `track.scaleTimeRange(CMTimeRange(start: cursor, duration: srcDur), toDuration: outDur)` (also for its audio on the matching audio track — add `audioA`/`audioB`). Transition handles: if `clip.transition.type != none` with `d`, the outgoing clip's inserted source range is extended by `d/2·speed` past `trimEnd` (clamped to the source duration) and the incoming clip's by `d/2·speed` before `trimStart` (clamped to 0), and the incoming clip starts at `cursor − d/2` so the two overlap on different tracks; when the source has no handle material, the clip is still placed with the overlap but its range is clamped and the compositor holds the edge frame (it samples the nearest available frame). Instructions: build `ClipyInstruction`s for each distinct time range: plain ranges carry one `LayerSpec` (trackID, aspect-fill transform, filter id); overlap ranges carry two specs plus `transition: (type, duration)` and the window's start so the compositor computes `progress = (t − windowStart)/duration`. `videoComposition.customVideoCompositorClass = ClipyCompositor.self`; keep `animationTool` for text/sticker layers; keep the audio mix (per-clip volumes now at the scaled output times).

Stickers in `buildOverlayLayers`: `kind == "sticker"` → if `emoji`: a `CATextLayer` with `string = emoji`, `font = UIFont.systemFont(ofSize: size)` where `size = Effects.stickerEmojiScale × renderSize.height × scale`, frame sized by measuring the attributed string with CoreText (same helper as text); if `shape`: a `CAShapeLayer` with `path = SVGPath.cgPath(from: Effects.shapePaths[shape])` scaled by `box/100` where `box = Effects.stickerShapeScale × renderSize.height × scale`, `fillColor = UIColor(hex: color).cgColor`; both centred/rotated/visibility-animated exactly like text containers (shapes: flip the path vertically inside the container since CA's y is up — `CGAffineTransform(scaleX: 1, y: −1)` + translate by `box`).

- [ ] **Step 4: `ClipyCompositor.swift`**
```swift
import AVFoundation
import CoreImage

final class LayerSpec { let trackID: CMPersistentTrackID; let transform: CGAffineTransform; let filter: String?; init(...) }
final class ClipyInstruction: NSObject, AVVideoCompositionInstructionProtocol {
  let timeRange: CMTimeRange; let enablePostProcessing = true; let containsTweening = true
  let requiredSourceTrackIDs: [NSValue]?; let passthroughTrackID = kCMPersistentTrackID_Invalid
  let layers: [LayerSpec]; let transition: (type: String, start: CMTime, duration: CMTime)?
  init(timeRange: CMTimeRange, layers: [LayerSpec], transition: (String, CMTime, CMTime)?) { … requiredSourceTrackIDs = layers.map { NSNumber(value: $0.trackID) } … }
}
final class ClipyCompositor: NSObject, AVVideoCompositing {
  private let ctx = CIContext(options: [.cacheIntermediates: false])
  var sourcePixelBufferAttributes: [String: Any]? { [kCVPixelBufferPixelFormatTypeKey as String: [kCVPixelFormatType_32BGRA]] }
  var requiredPixelBufferAttributesForRenderContext: [String: Any] { [kCVPixelBufferPixelFormatTypeKey as String: [kCVPixelFormatType_32BGRA]] }
  func renderContextChanged(_ newRenderContext: AVVideoCompositionRenderContext) {}
  func startRequest(_ req: AVAsynchronousVideoCompositionRequest) {
    guard let inst = req.videoCompositionInstruction as? ClipyInstruction, let out = req.renderContext.newPixelBuffer() else { req.finish(with: NSError(domain: "Clipy", code: 1)); return }
    let size = req.renderContext.size
    func frame(_ spec: LayerSpec) -> CIImage? {
      guard let pb = req.sourceFrame(byTrackID: spec.trackID) else { return nil }
      var img = CIImage(cvPixelBuffer: pb).transformed(by: spec.transform).cropped(to: CGRect(origin: .zero, size: size))
      img = Effects.apply(Effects.filterChain(spec.filter), to: img)
      return img
    }
    var result = CIImage(color: .black).cropped(to: CGRect(origin: .zero, size: size))
    if let t = inst.transition, inst.layers.count == 2, let a = frame(inst.layers[0]), let b = frame(inst.layers[1]) {
      let p = CGFloat(max(0, min(1, CMTimeSubtract(req.compositionTime, t.start).seconds / t.duration.seconds)))
      result = ClipyCompositor.blend(type: t.type, from: a, to: b, progress: p, size: size)
    } else if let a = inst.layers.first.flatMap(frame) { result = a }
    ctx.render(result, to: out)
    req.finish(withComposedVideoFrame: out)
  }
  static func blend(type: String, from a: CIImage, to b: CIImage, progress p: CGFloat, size: CGSize) -> CIImage {
    switch type {
    case "fade":      // to black then from black
      let k = p < 0.5 ? 1 - p * 2 : (p - 0.5) * 2
      let src = p < 0.5 ? a : b
      return src.applyingFilter("CIColorMatrix", parameters: ["inputRVector": CIVector(x: k, y: 0, z: 0, w: 0), "inputGVector": CIVector(x: 0, y: k, z: 0, w: 0), "inputBVector": CIVector(x: 0, y: 0, z: k, w: 0)])
    case "slide":
      let dx = (1 - p) * size.width
      return b.transformed(by: CGAffineTransform(translationX: dx, y: 0)).composited(over: a.transformed(by: CGAffineTransform(translationX: dx - size.width, y: 0)))
    case "zoom":
      let s = 1 + 0.2 * p
      let scaled = a.transformed(by: CGAffineTransform(translationX: -size.width * (s - 1) / 2, y: -size.height * (s - 1) / 2).scaledBy(x: s, y: s))
      return b.applyingFilter("CIColorMatrix", parameters: ["inputAVector": CIVector(x: 0, y: 0, z: 0, w: p)]).composited(over: scaled)
    default:          // dissolve
      return b.applyingFilter("CIColorMatrix", parameters: ["inputAVector": CIVector(x: 0, y: 0, z: 0, w: p)]).composited(over: a)
    }
  }
}
```
(Alpha-fade via `CIColorMatrix` `inputAVector` requires premultiplied handling — simpler: use `CIDissolveTransition` with `inputTime: p` for dissolve, and for zoom apply the dissolve between `scaled` and `b`. Prefer `CIDissolveTransition` where available; keep the matrix approach only for fade-to-black.)

- [ ] **Step 5: Tests** — in `ExportSessionTests.swift`: `testSVGPathParsesShapes` (every `Effects.shapePaths` value parses; `square` has 4 points via `CGPath.applyWithBlock` counting `moveToPoint/addLineToPoint`), and `testExportsWithEffects`: two clips (2 s each), first at `speed: 2` with `filter: "warm"` and `transition: dissolve 0.5`, overlays: one text, one emoji sticker, one heart shape; asserts `done` and duration ≈ 3 s (1 + 2) ± 0.2.

- [ ] **Step 6: Verify** — typecheck/tests unchanged; autolinking lists the module; re-read all Swift twice; list unconfirmed APIs in the report. Commit — `feat: Swift export with speed, Core Image filters, transitions and stickers`

---

### Task 14: Swift — Transcriber (Speech framework) + module functions + permissions

**Files:**
- Create: `modules/clipy-video/ios/Transcriber.swift`
- Modify: `modules/clipy-video/ios/ClipyVideoModule.swift`, `app.json` (`ios.infoPlist`: `NSSpeechRecognitionUsageDescription: "Clipy turns speech in your clips into captions."`, `NSMicrophoneUsageDescription: "Required by iOS speech recognition; Clipy never records audio."`)

**Interfaces:**
- Produces: `AsyncFunction("transcribe") { (uri: String, trimStart: Double, trimEnd: Double, promise: Promise) }` → resolves `[[String: Any]]` of `{ text, start, end }` (source seconds), rejects with readable messages (`"Speech recognition permission denied"`, `"Speech recognition is not available for this language on this device"`, native errors); `Function("cancelTranscribe")`.

- [ ] **Step 1: `Transcriber.swift`**
```swift
import AVFoundation
import Speech

/// One-shot on-device transcription of a file's audio within [trimStart, trimEnd]. Results are word/phrase segments in source seconds.
final class Transcriber {
  private var task: SFSpeechRecognitionTask?
  private let recognizer = SFSpeechRecognizer(locale: Locale.current) ?? SFSpeechRecognizer()

  static func requestAuthorization() async -> SFSpeechRecognizerAuthorizationStatus {
    await withCheckedContinuation { c in SFSpeechRecognizer.requestAuthorization { c.resume(returning: $0) } }
  }

  func transcribe(url: URL, trimStart: Double, trimEnd: Double) async throws -> [[String: Any]] {
    guard let recognizer, recognizer.isAvailable else { throw NSError(domain: "Clipy", code: 2, userInfo: [NSLocalizedDescriptionKey: "Speech recognition is not available for this language on this device"]) }
    let request = SFSpeechURLRecognitionRequest(url: url)
    request.shouldReportPartialResults = false
    if recognizer.supportsOnDeviceRecognition { request.requiresOnDeviceRecognition = true }
    request.addsPunctuation = true
    return try await withCheckedThrowingContinuation { cont in
      var finished = false
      task = recognizer.recognitionTask(with: request) { result, error in
        if finished { return }
        if let error { finished = true; cont.resume(throwing: error); return }
        guard let result, result.isFinal else { return }
        finished = true
        let segs = result.bestTranscription.segments
          .filter { $0.timestamp + $0.duration > trimStart && $0.timestamp < trimEnd }
          .map { ["text": $0.substring, "start": max($0.timestamp, trimStart), "end": min($0.timestamp + $0.duration, trimEnd)] as [String: Any] }
        cont.resume(returning: segs)
      }
    }
  }

  func cancel() { task?.cancel(); task = nil }
}
```
Note: `SFSpeechURLRecognitionRequest` transcribes the whole file; trimming is applied to the segments (documented). Files longer than ~1 minute may be rejected by on-device recognition on older devices — the module surfaces the native error.

- [ ] **Step 2: Module** — in `ClipyVideoModule.swift` add `private var transcriber: Transcriber?`, `AsyncFunction("transcribe") { (uri: String, trimStart: Double, trimEnd: Double, promise: Promise) in Task { let status = await Transcriber.requestAuthorization(); guard status == .authorized else { promise.reject("E_SPEECH_DENIED", "Speech recognition permission denied"); return }; guard let url = ExportSession.fileURL(from: uri) else { promise.reject("E_URI", "Invalid file"); return }; let t = Transcriber(); self.transcriber = t; do { promise.resolve(try await t.transcribe(url: url, trimStart: trimStart, trimEnd: trimEnd)) } catch { promise.reject("E_SPEECH", error.localizedDescription) }; self.transcriber = nil } }` and `Function("cancelTranscribe") { self.transcriber?.cancel() }`. Verify `promise.reject(code, message)` signature in `node_modules/expo-modules-core/ios/Core/Promise.swift`. `app.json` strings as above; `npx expo-doctor`.

- [ ] **Step 3: Verify** — typecheck/tests unchanged; expo-doctor; re-read Swift. Commit — `feat: on-device transcription via the Speech framework`

---

### Task 15: Docs, spec status, device checklist

**Files:**
- Modify: `README.md` (Phase 3 features; emoji data licence; "Preview" tag explanation; captions need the native build), `AGENTS.md` (one line: keep `src/editor/effects.ts` and `modules/clipy-video/ios/Effects.swift` identical — ids and shape paths), spec Status → `Implemented 2026-10-01 (Swift export/transcription unverified until an EAS build exists; on-device checklist pending)`.

- [ ] **Step 1:** Edit the docs. **Step 2:** `npm run typecheck`, `npm test`, `npx expo-doctor`, `npm ls --all | Select-String invalid` (empty). **Step 3 (USER): Device checklist** — the spec §1 "Done when" list, plus Phase 1/2 checks under a 2× clip. **Step 4:** Commit — `docs: Phase 3 README, agents notes and spec status`

---

## Phase 3 Done When

- [ ] Jest, typecheck, expo-doctor clean.
- [ ] Device checklist passes (Expo Go).
- [ ] Swift export + transcriber written and reviewed by reading; XCTests updated.
