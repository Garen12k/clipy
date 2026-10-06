# Photo Motion and Collages: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A **Motion** tool for photos (None, Zoom in, Zoom out, Pan left / right / up / down, Corner zoom, a Strength slider, Apply to all photos) and a **Collage** tool (six layouts, pick the media, Border and Corner sliders, every cell an ordinary layer) — while every project that exists previews and exports exactly as before and nothing is ever re-laid on its own.

**Architecture:** Schema v17 with two **optional** clip fields, absent by default: `motion` (photos) and `collage` (layers); the migration adds nothing. Photo motion is TypeScript-only maths in `motion.ts` that eases with `smooth`, so it equals two keyframes: the preview resolves it in `resolveClipMotion`, the export request sends it as two pins from `toExportClip` — **no Swift changes at all**. Motion, a Combo and keyframes exclude each other on a photo (ops and `contextFor`); the Combo code path is not edited. A collage is n layers tagged with a group: `collage.ts` (pure, new) turns a layout, a border and the frame's shape into cell rectangles and writes only `transform`, `crop` and `mask` through `clipLayout`'s `coverFactor`; `collageOps.ts` (new) adds and re-lays them; the picker flow lives in `useClipMedia`. A strip (`PhotoMotionSheet`) and a compact panel (`CollageSheet`) open through `toolStrip.ts`; `contextFor` places both tools.

**Tech Stack:** Expo SDK 57, React Native 0.86, TypeScript strict, Zustand 5, `expo-image-picker` (installed), `@expo/vector-icons` 15 (Ionicons), Jest (`jest-expo`) + RNTL 14.0.1. **No new package, no new asset, no Swift.**

**Spec:** `docs/superpowers/specs/2026-10-06-photo-motion-collage-design.md` (binding; §4 schema and the proof, §5 Motion, §6 collages, §7 toolbar, §8 edge cases, §14 the decisions).

## Global Constraints

- **iPhone only.** No Android or web configuration, files or code paths.
- **Expo Go must keep working.** Nothing here needs `modules/clipy-video` linked. `package.json`, `app.json` and `assets/` are not edited.
- **No Swift.** Nothing under `modules/clipy-video/ios/` is edited, and no test that reads Swift is edited (`motion.parity.test.ts`, `clipLayout.parity.test.ts`, `looks.frozen.test.ts`, every `*.swift.test.ts`). If one of them goes red you changed something mirrored: undo it. `MOTION` in `motion.ts` keeps exactly its keys and values (the photo constants are a separate object, `PHOTO_MOTION`).
- **Nothing existing changes.** A clip without `motion` and a layer without `collage` — every clip in every saved project — must go through exactly the expressions it does today. Where an existing function is edited, the edit is a branch that only a clip *with* the new field takes. Existing tests are not edited except the pinned values named in a task.
- **Nothing happens on its own.** No load, no ratio change, no trim re-lays a collage or sets a Motion. Only the ops this plan adds write the new fields, and only from a tap or a drag.
- **Optional fields are absent, never `undefined` or `null`:** remove the key (`delete next.motion`), do not assign `undefined`. Tests check with `"motion" in clip`.
- **Never edited this round:** `src/editor/components/PreviewPlayer.tsx`, `ClipFrame.tsx`, `LayerStack.tsx`, `LayerVideo.tsx`, `Timeline.tsx`, `EditorLayout.tsx`, `PreviewTag.tsx`, `src/editor/timelineScroll.ts`, `src/editor/model/clipLayout.ts`, `src/editor/model/timeline.ts`, `src/editor/effects.ts`, `src/ui/*` (the kit is used as it is), `src/theme/*`, anything under `src/publish/` or `supabase/`.
- **Only `src/editor/model/timeline.ts` uses a clip's `speed`.** A video is shortened with `sourceAfter`, a length is read with `clipDuration`.
- **Only `collage.ts` lays out cells, and it takes cover from `clipLayout.coverFactor`.** No other new code computes a cover or fit scale.
- UI from `src/ui/` and `src/theme/theme.ts` only; **no hex literals**; **spacing from `theme.space` only** (`spacingScale.test.ts` — never add to its allow-table, never rely on its blind spots: no apostrophe in JSX text, no `*` or `/` in a spacing value); sliders are the kit `Slider`; icons are Ionicons outline names; a strip's rows have explicit heights (`STRIP`), a panel's body too (no `flex: 1` for height).
- **Motion rules:** no new animation at all in this round — no Reanimated, no timers, no entering / exiting. The kit's own `EnterView` inside `ToolStrip` / `ToolPanel` is all there is.
- **One user action = one undo step:** a tap is one `apply`, a drag is `beginTransaction` + `applyTransient`, a picked collage is one `apply`.
- Tools open through `src/editor/toolStrip.ts` (select first, open second; `rekeyStrip` right after a tool changes the selection itself). The preview `VideoView` never remounts.
- RNTL v14: `render` / `fireEvent` / `rerender` are async — always `await`. `getByRole("button", { name })` matches the accessibility label exactly.
- A test that fails after your change because it names a **pinned count, id list, label list or schema number** listed in your task is updated as the task says. A test that fails for any other reason means a mistake in the change — fix the change.
- Tasks that run side by side share one working tree: a red suite that belongs to a file another task owns is not yours to fix — re-run when that task has landed; never edit a file outside your task's list.
- Windows: PowerShell, no `&&`, `npx.cmd`. **Never run `expo lint`.** **No broad `sed`** — use Grep and edit each hit by hand. **Never `git stash`.** **`git add` explicit paths only — never `-A` / `.`.** **Do not start or stop a dev server** (one is serving this tree to the owner's phone). Before each commit: `npm run typecheck` and `npm test` green. Commit trailer exactly `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Task order

1 first. Then **2 ∥ 3 ∥ 4**. Then **5** (after 4) **∥ 6** (after 3). Then **7** (after 5; 6 may still be running). Then 8 (after 6 and 7). Last: 9.

`1 -> (2 || 3 || 4) -> (5 || 6) -> 7 -> 8 -> 9`

| Task | Title | Depends on | Parallel-safe with | Model tier |
|---|---|---|---|---|
| 1 | Schema v17: the two optional fields, clamps, readers, registries, the PROOF migration | — | — | standard |
| 2 | Photo motion maths; the preview hook; the export's two pins | 1 | 3, 4, 5, 6 | most capable |
| 3 | Motion ops: set, apply to all, Motion ↔ Combo ↔ keyframes | 1 | 2, 4, 5 | standard |
| 4 | Collage geometry: cells, fill, in-place (`collage.ts`) | 1 | 2, 3, 6 | most capable |
| 5 | Collage ops: add, re-lay, re-fit after Replace (`collageOps.ts`) | 4 | 2, 3, 6 | standard |
| 6 | The Motion strip; the Combo tab for photos | 3 | 2, 4, 5, 7 | standard |
| 7 | The Collage panel; picking (`makeCollage`); Replace re-fits a cell | 5 | 2, 6 | standard |
| 8 | Toolbar: `contextFor`, tool ids, the two tools mounted | 6, 7 | — | standard |
| 9 | Docs, full checks, device checklist | 1–8 | — | cheap |

**Files more than one task edits:** none of the source files. (`types.ts` and `migrate.ts`: Task 1 only. `motion.ts`, `modules/clipy-video/index.ts`: Task 2 only. `ops.ts`: Task 3 only. `useClipMedia.ts`, `pickMedia.ts`: Task 7 only. `toolbarContext.ts`, `toolGroups.ts`, `toolStrip.ts`, `EditorToolbar.tsx`: Task 8 only.)

**Pinned values that change, and who changes them:** schema number 16 → 17 (Task 1: `migrate.test.ts` and nine `types.*.test.ts`) · `TOOL_IDS` 49 → 51, the main-bar id list and label list, the icon table (Task 8: `toolbarContext.test.ts`, `toolGroups.test.ts`, `icons.test.ts`, `EditorToolbar.test.tsx` line 31).

---

### Task 1: Schema v17 — the two optional fields, clamps, readers, registries, the PROOF migration

**Depends on:** nothing. **Parallel-safe with:** none.

**Files:** Create `src/editor/photoTools.ts`, `src/editor/model/__tests__/types.photo.test.ts`, `src/editor/__tests__/photoTools.test.ts`. Modify `src/editor/model/types.ts`, `src/editor/model/migrate.ts`, `src/editor/model/__tests__/migrate.test.ts` (pinned numbers + append) and the pinned number in `types.audio.test.ts`, `types.clip.test.ts`, `types.layers.test.ts`, `types.layers2.test.ts`, `types.look.test.ts`, `types.motion.test.ts`, `types.polish.test.ts`, `types.speed.test.ts`, `types.text.test.ts`.

**Do not touch:** `motion.ts`, `ops.ts`, every component, everything under "Never edited this round".

**Interfaces — Produces**

```ts
// src/editor/model/types.ts
export const SCHEMA_VERSION = 17 as const;
export const PHOTO_MOTION_IDS: readonly ["zoomIn", "zoomOut", "panLeft", "panRight", "panUp", "panDown", "zoomCorner"];
export type PhotoMotionId = (typeof PHOTO_MOTION_IDS)[number];
export interface PhotoMotion { id: PhotoMotionId; strength: number }
export const PHOTO_MOTION_LIMITS: { strength: readonly [0, 1]; defaultStrength: 0.5 };
export function clampPhotoMotion(v: unknown): PhotoMotion | null;
export const COMBO_AS_MOTION: Partial<Record<AnimComboId, PhotoMotionId>>;
export const activePhotoMotion: (c: Clip) => PhotoMotion | null;
export function shownPhotoMotion(c: Clip): PhotoMotion | null;
export const COLLAGE_LAYOUT_IDS: readonly ["sideBySide", "stacked", "bigTwo", "row3", "grid4", "inset"];
export type CollageLayoutId = (typeof COLLAGE_LAYOUT_IDS)[number];
export const COLLAGE_CELLS: Record<CollageLayoutId, number>;
export const COLLAGE_CORNERS: readonly [0, 1, 2];
export type CollageCorner = (typeof COLLAGE_CORNERS)[number];
export const CORNER_MASK: readonly MaskId[];                 // index = CollageCorner
export const COLLAGE_LIMITS: { border: readonly [0, 0.06]; borderStep: 0.005 };
export interface CollageCell { group: string; layout: CollageLayoutId; cell: number; border: number; corner: CollageCorner; aspect: number }
export function clampCollageCell(v: unknown): CollageCell | null;
export interface Clip { /* … */ motion?: PhotoMotion; collage?: CollageCell }
// src/editor/photoTools.ts
export const PHOTO_MOTIONS: Record<PhotoMotionId, { label: string; icon: IoniconName }>;
export const COLLAGE_LAYOUTS: Record<CollageLayoutId, { label: string }>;
export const CORNER_LABELS: readonly ["Square", "Rounded", "Round"];
```

- [ ] **Step 0: Baseline.** `npm run typecheck` and `npm test` are green on the untouched tree. If not, stop and report.
- [ ] **Step 1: Failing tests.**

Create `src/editor/model/__tests__/types.photo.test.ts`:

```ts
import {
  activePhotoMotion, clampCollageCell, clampPhotoMotion, COLLAGE_CELLS, COLLAGE_CORNERS, COLLAGE_LAYOUT_IDS, COLLAGE_LIMITS, COMBO_AS_MOTION, CORNER_MASK,
  makeClip, makeKeyframe, makeLayer, makePhotoClip, newLayer, newPhotoClip, newVideoClip, PHOTO_MOTION_IDS, PHOTO_MOTION_LIMITS, SCHEMA_VERSION, shownPhotoMotion,
  type Clip, type PhotoMotion,
} from "../types";

const zoom: PhotoMotion = { id: "zoomIn", strength: 0.8 };
const photo = (extra: Partial<Clip> = {}): Clip => ({ ...makePhotoClip({ id: "p" }), ...extra });

test("schema is v17; the motion ids, the layouts and their limits are as specified", () => {
  expect(SCHEMA_VERSION).toBe(17);
  expect(PHOTO_MOTION_IDS).toEqual(["zoomIn", "zoomOut", "panLeft", "panRight", "panUp", "panDown", "zoomCorner"]);
  expect(PHOTO_MOTION_LIMITS).toEqual({ strength: [0, 1], defaultStrength: 0.5 });
  expect(COLLAGE_LAYOUT_IDS).toEqual(["sideBySide", "stacked", "bigTwo", "row3", "grid4", "inset"]);
  expect(COLLAGE_CELLS).toEqual({ sideBySide: 2, stacked: 2, bigTwo: 3, row3: 3, grid4: 4, inset: 2 });
  expect(COLLAGE_CORNERS).toEqual([0, 1, 2]);
  expect(CORNER_MASK).toEqual(["none", "rounded", "circle"]);
  expect(COLLAGE_LIMITS).toEqual({ border: [0, 0.06], borderStep: 0.005 });
  expect(COMBO_AS_MOTION).toEqual({ zoomInSlow: "zoomIn", zoomOutSlow: "zoomOut", panLeft: "panLeft", panRight: "panRight" });
});

test("no factory writes the two new fields: a new clip has the shape it always had", () => {
  const made: object[] = [
    newVideoClip({ id: "v", sourceUri: "file:///v.mp4", sourceDuration: 4, width: 1080, height: 1920 }),
    newPhotoClip({ id: "p", sourceUri: "file:///p.jpg", width: 1080, height: 1920 }),
    makeClip({ id: "a", sourceDuration: 4 }), makePhotoClip({ id: "p" }), makeLayer({ id: "l", sourceDuration: 4 }), newLayer(makePhotoClip({ id: "p" }), 1),
  ];
  for (const c of made) { expect("motion" in c).toBe(false); expect("collage" in c).toBe(false); }
});

test("clampPhotoMotion: a known id with the strength clamped to 0–1 (not a number → 0.5); anything else → null", () => {
  expect(clampPhotoMotion({ id: "panUp", strength: 0.3 })).toEqual({ id: "panUp", strength: 0.3 });
  expect(clampPhotoMotion({ id: "panUp", strength: 4 })).toEqual({ id: "panUp", strength: 1 });
  expect(clampPhotoMotion({ id: "panUp", strength: -1 })).toEqual({ id: "panUp", strength: 0 });
  expect(clampPhotoMotion({ id: "panUp", strength: NaN })).toEqual({ id: "panUp", strength: 0.5 });
  expect(clampPhotoMotion({ id: "panUp" })).toEqual({ id: "panUp", strength: 0.5 });
  expect(clampPhotoMotion({ id: "panUp", strength: 0.3, extra: 1 })).toEqual({ id: "panUp", strength: 0.3 });   // unknown keys dropped
  for (const junk of [null, undefined, "zoomIn", 3, {}, { id: "sway", strength: 0.5 }, { id: "zoomInSlow" }]) expect(clampPhotoMotion(junk)).toBeNull();
});

test("clampCollageCell: a usable tag is kept (border clamped, an unknown corner → 0); anything else → null", () => {
  const tag = { group: "g1", layout: "grid4", cell: 3, border: 0.02, corner: 1, aspect: 0.5625 };
  expect(clampCollageCell(tag)).toEqual(tag);
  expect(clampCollageCell({ ...tag, border: 0.5 })).toEqual({ ...tag, border: 0.06 });
  expect(clampCollageCell({ ...tag, border: "x" })).toEqual({ ...tag, border: 0 });
  expect(clampCollageCell({ ...tag, corner: 7 })).toEqual({ ...tag, corner: 0 });
  expect(clampCollageCell({ ...tag, more: true })).toEqual(tag);
  for (const bad of [null, "g1", { ...tag, group: "" }, { ...tag, group: 3 }, { ...tag, layout: "spiral" }, { ...tag, cell: 4 }, { ...tag, cell: -1 }, { ...tag, cell: 1.5 },
    { ...tag, aspect: 0 }, { ...tag, aspect: NaN }, { ...tag, layout: "sideBySide", cell: 2 }]) expect(clampCollageCell(bad)).toBeNull();
});

test("activePhotoMotion: what plays — a photo's stored motion, unless a Combo or keyframes own the clip", () => {
  expect(activePhotoMotion(photo())).toBeNull();
  expect(activePhotoMotion(photo({ motion: zoom }))).toEqual(zoom);
  expect(activePhotoMotion(photo({ motion: zoom, animation: { in: { id: "fade", duration: 0.5 }, out: null, combo: null } }))).toEqual(zoom);   // In / Out stay
  expect(activePhotoMotion(photo({ motion: zoom, animation: { in: null, out: null, combo: "sway" } }))).toBeNull();
  expect(activePhotoMotion(photo({ motion: zoom, keyframes: [makeKeyframe({ t: 0 })] }))).toBeNull();
  expect(activePhotoMotion({ ...makeClip({ id: "v", sourceDuration: 4 }), motion: zoom })).toBeNull();                                           // never a video
});

test("shownPhotoMotion: what the tool rings — the active motion, else the twin of an old zoom / pan Combo at the default strength", () => {
  expect(shownPhotoMotion(photo())).toBeNull();
  expect(shownPhotoMotion(photo({ motion: zoom }))).toEqual(zoom);
  const combo = (id: "zoomInSlow" | "zoomOutSlow" | "panLeft" | "panRight" | "sway" | "pulse") => photo({ animation: { in: null, out: null, combo: id } });
  expect(shownPhotoMotion(combo("zoomInSlow"))).toEqual({ id: "zoomIn", strength: 0.5 });
  expect(shownPhotoMotion(combo("zoomOutSlow"))).toEqual({ id: "zoomOut", strength: 0.5 });
  expect(shownPhotoMotion(combo("panLeft"))).toEqual({ id: "panLeft", strength: 0.5 });
  expect(shownPhotoMotion(combo("panRight"))).toEqual({ id: "panRight", strength: 0.5 });
  expect(shownPhotoMotion(combo("sway"))).toBeNull();
  expect(shownPhotoMotion(combo("pulse"))).toBeNull();
  expect(shownPhotoMotion(makeClip({ id: "v", sourceDuration: 4, animation: { in: null, out: null, combo: "zoomInSlow" } }))).toBeNull();        // a video's Combo is not a Motion
});

test("newLayer copies a motion and a collage tag as its own objects", () => {
  const tag = { group: "g", layout: "sideBySide" as const, cell: 0, border: 0, corner: 0 as const, aspect: 0.5625 };
  const src = photo({ motion: zoom, collage: tag });
  const layer = newLayer(src, 2);
  expect(layer.motion).toEqual(zoom);
  expect(layer.motion).not.toBe(zoom);
  expect(layer.collage).toEqual(tag);
  expect(layer.collage).not.toBe(tag);
});
```

Create `src/editor/__tests__/photoTools.test.ts`:

```ts
import { COLLAGE_LAYOUT_IDS, PHOTO_MOTION_IDS } from "../model/types";
import { COLLAGE_LAYOUTS, CORNER_LABELS, PHOTO_MOTIONS } from "../photoTools";

const GLYPHS: Record<string, number> = require("@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/Ionicons.json");

test("the seven motions: labels in sentence case, icons that are Ionicons outline glyphs", () => {
  expect(PHOTO_MOTION_IDS.map((id) => PHOTO_MOTIONS[id].label)).toEqual(["Zoom in", "Zoom out", "Pan left", "Pan right", "Pan up", "Pan down", "Corner zoom"]);
  expect(PHOTO_MOTION_IDS.map((id) => PHOTO_MOTIONS[id].icon)).toEqual(["expand-outline", "contract-outline", "arrow-back-outline", "arrow-forward-outline", "arrow-up-outline", "arrow-down-outline", "scan-outline"]);
  for (const id of PHOTO_MOTION_IDS) expect(GLYPHS[PHOTO_MOTIONS[id].icon]).toBeDefined();
  expect(Object.keys(PHOTO_MOTIONS).sort()).toEqual([...PHOTO_MOTION_IDS].sort());
});

test("the six layouts and the three corners: short labels that fit under a 72-pt tile", () => {
  expect(COLLAGE_LAYOUT_IDS.map((id) => COLLAGE_LAYOUTS[id].label)).toEqual(["Side by side", "Stacked", "Big and two", "Row of three", "Grid of four", "Inset"]);
  for (const id of COLLAGE_LAYOUT_IDS) expect(COLLAGE_LAYOUTS[id].label.length).toBeLessThanOrEqual(12);
  for (const id of PHOTO_MOTION_IDS) expect(PHOTO_MOTIONS[id].label.length).toBeLessThanOrEqual(12);
  expect(CORNER_LABELS).toEqual(["Square", "Rounded", "Round"]);
});
```

Append to `src/editor/model/__tests__/migrate.test.ts` (add to its `../types` import whatever is missing of `ANIM_COMBO_IDS`, `makeClip`, `makeKeyframe`, `makeLayer`, `makePhotoClip`, `makeProject`, `type Clip`, `type LayerClip`):

```ts
test("PROOF v16 → v17: the migration changes the number and nothing else — photos, Combos, edges, keyframes, layers, crops and masks are kept as stored, and no clip gains a field", () => {
  // One photo per Combo (the four zoom / pan ones are what the Motion tool later shows as its own), one with In / Out, one with pins, a video with a Combo.
  const combos = ANIM_COMBO_IDS.map((combo, i) => makePhotoClip({ id: `p${i}`, seconds: 2 + i, animation: { in: null, out: null, combo } }));
  const edged = makePhotoClip({ id: "pe", animation: { in: { id: "fade", duration: 0.5 }, out: { id: "zoomOut", duration: 0.4 }, combo: null } });
  const pinned = makePhotoClip({ id: "pk", seconds: 4, keyframes: [makeKeyframe({ t: 0 }), makeKeyframe({ t: 3, scale: 1.4, x: 0.1 })] });
  const video = makeClip({ id: "v", sourceDuration: 5, animation: { in: null, out: null, combo: "sway" } });
  // Layers placed the way a collage would place them, made by hand in v16.
  const layers: LayerClip[] = [
    { ...makePhotoClip({ id: "l1", seconds: 3, transform: { scale: 0.5, x: -0.25, y: 0, rotation: 0, flipH: false, flipV: false }, crop: { x: 0.25, y: 0, w: 0.5, h: 1 }, mask: "rounded" }), start: 1 },
    makeLayer({ id: "l2", sourceDuration: 4, start: 2, mask: "circle", blend: "screen" }),
  ];
  const now = makeProject({ clips: [...combos, edged, pinned, video], layers });
  expect(migrateProject(now)).toEqual(now);                       // the fixture is a clean v17 project
  const v16 = JSON.parse(JSON.stringify(now)) as { schemaVersion: number };
  v16.schemaVersion = 16;
  const frozen = JSON.stringify(v16);
  const p = migrateProject(v16);
  expect(JSON.stringify(v16)).toBe(frozen);                       // the stored object is not mutated
  expect({ ...p, schemaVersion: 16 }).toEqual(v16);               // nothing but the number differs from the file
  expect(p.schemaVersion).toBe(17);
  // `toEqual` does not see a key that holds undefined: check that the keys themselves are absent.
  for (const c of [...p.clips, ...p.layers]) { expect("motion" in c).toBe(false); expect("collage" in c).toBe(false); }
  expect(migrateProject(p)).toEqual(p);
});

test("the sanity pass keeps a usable Motion and collage tag, and removes one that cannot be used", () => {
  const tag = { group: "g", layout: "grid4", cell: 3, border: 0.02, corner: 1, aspect: 0.5625 };
  const p = migrateProject(makeProject({
    clips: [
      { ...makePhotoClip({ id: "ok" }), motion: { id: "panUp", strength: 0.8 } },
      { ...makePhotoClip({ id: "wild" }), motion: { id: "panUp", strength: 7 } },
      { ...makePhotoClip({ id: "unknown" }), motion: { id: "spiral", strength: 0.5 } } as unknown as Clip,
      { ...makeClip({ id: "video", sourceDuration: 4 }), motion: { id: "zoomIn", strength: 0.5 } },
      { ...makePhotoClip({ id: "combo", animation: { in: null, out: null, combo: "sway" } }), motion: { id: "zoomIn", strength: 0.5 } },
      { ...makePhotoClip({ id: "main" }), collage: tag } as unknown as Clip,
    ],
    layers: [
      { ...makePhotoClip({ id: "cell" }), start: 0, collage: tag } as unknown as LayerClip,
      { ...makePhotoClip({ id: "bad" }), start: 0, collage: { ...tag, cell: 4 } } as unknown as LayerClip,
      { ...makePhotoClip({ id: "junk" }), start: 0, collage: { ...tag, layout: "spiral" } } as unknown as LayerClip,
    ],
  }));
  const clip = (id: string) => [...p.clips, ...p.layers].find((c) => c.id === id)!;
  expect(clip("ok").motion).toEqual({ id: "panUp", strength: 0.8 });
  expect(clip("wild").motion).toEqual({ id: "panUp", strength: 1 });
  for (const id of ["unknown", "video", "combo"]) expect("motion" in clip(id)).toBe(false);
  expect(clip("cell").collage).toEqual(tag);
  for (const id of ["main", "bad", "junk"]) expect("collage" in clip(id)).toBe(false);
  expect(migrateProject(p)).toEqual(p);
});
```

- [ ] **Step 2: Run** `npx.cmd jest src/editor/model/__tests__/types.photo.test.ts src/editor/__tests__/photoTools.test.ts src/editor/model/__tests__/migrate.test.ts` → the new tests FAIL (missing exports / version 16).
- [ ] **Step 3: Implement.**

`src/editor/model/types.ts`:

1. `export const SCHEMA_VERSION = 17 as const;`
2. After the line `export const NO_OVERLAY_ANIMATION …` insert:

```ts

/** A slow zoom or pan over a photo's whole length (the Motion tool). The maths is `photoMotionDelta` in motion.ts. */
export const PHOTO_MOTION_IDS = ["zoomIn", "zoomOut", "panLeft", "panRight", "panUp", "panDown", "zoomCorner"] as const;
export type PhotoMotionId = (typeof PHOTO_MOTION_IDS)[number];
/** `strength` 0–1, gentle … strong; 0.5 moves as far as the older zoom / pan Combos do. */
export interface PhotoMotion { id: PhotoMotionId; strength: number }
export const PHOTO_MOTION_LIMITS = { strength: [0, 1] as const, defaultStrength: 0.5 };
/** The Combos the Motion tool took over for photos, and the motion each one is shown as there. */
export const COMBO_AS_MOTION: Partial<Record<AnimComboId, PhotoMotionId>> = { zoomInSlow: "zoomIn", zoomOutSlow: "zoomOut", panLeft: "panLeft", panRight: "panRight" };

/** Collage layouts, in the panel's order; how many cells each has. The rectangles are `collageCells` in collage.ts. */
export const COLLAGE_LAYOUT_IDS = ["sideBySide", "stacked", "bigTwo", "row3", "grid4", "inset"] as const;
export type CollageLayoutId = (typeof COLLAGE_LAYOUT_IDS)[number];
export const COLLAGE_CELLS: Record<CollageLayoutId, number> = { sideBySide: 2, stacked: 2, bigTwo: 3, row3: 3, grid4: 4, inset: 2 };
/** Square, Rounded, Round — the three masks there are (`CORNER_MASK[corner]`). */
export const COLLAGE_CORNERS = [0, 1, 2] as const;
export type CollageCorner = (typeof COLLAGE_CORNERS)[number];
export const CORNER_MASK: readonly MaskId[] = ["none", "rounded", "circle"];
/** `border` is a fraction of the frame's SHORTER side. */
export const COLLAGE_LIMITS = { border: [0, 0.06] as const, borderStep: 0.005 };
/**
 * What makes a layer a collage cell: which collage (`group`), which layout and cell, and the border, corner and frame shape
 * (`aspect` = width / height) it was last laid out with. Only collage.ts / collageOps.ts write it.
 */
export interface CollageCell { group: string; layout: CollageLayoutId; cell: number; border: number; corner: CollageCorner; aspect: number }
```

3. In `interface Clip`, after the `chroma` line:

```ts
  motion?: PhotoMotion;          // photos only; ABSENT = still (never null / undefined). Read it through `activePhotoMotion` / `shownPhotoMotion`
  collage?: CollageCell;         // layers only; ABSENT = not a collage cell
```

4. After `export const isPhoto = …` insert:

```ts
/**
 * The Motion that PLAYS on a clip: a photo's stored motion, unless a Combo owns the clip or keyframes move it (the ops keep the three
 * apart; this is the rule the preview and the export both go by should a file hold two). Never a video.
 */
export const activePhotoMotion = (c: Clip): PhotoMotion | null =>
  (c.kind === "photo" && c.motion && c.animation.combo === null && c.keyframes.length === 0 ? c.motion : null);
/** What the Motion tool shows as selected: the motion that plays, else an older zoom / pan Combo as its twin at the default strength. */
export function shownPhotoMotion(c: Clip): PhotoMotion | null {
  const active = activePhotoMotion(c);
  if (active) return active;
  const twin = c.kind === "photo" && c.animation.combo !== null ? COMBO_AS_MOTION[c.animation.combo] : undefined;
  return twin ? { id: twin, strength: PHOTO_MOTION_LIMITS.defaultStrength } : null;
}
```

5. After `clampOverlayAnimation` insert:

```ts
/** A known motion with its strength clamped to 0–1 (not a number → the default); anything else → null. Unknown keys dropped. */
export function clampPhotoMotion(v: unknown): PhotoMotion | null {
  if (!isRec(v) || !(PHOTO_MOTION_IDS as readonly unknown[]).includes(v.id)) return null;
  const [lo, hi] = PHOTO_MOTION_LIMITS.strength;
  return { id: v.id as PhotoMotionId, strength: isNum(v.strength) ? clampNum(v.strength, lo, hi) : PHOTO_MOTION_LIMITS.defaultStrength };
}
/** A usable collage tag (border clamped, an unknown corner → square) or null: no group, an unknown layout, a cell outside it, no usable frame shape. */
export function clampCollageCell(v: unknown): CollageCell | null {
  if (!isRec(v) || typeof v.group !== "string" || v.group.length === 0 || !(COLLAGE_LAYOUT_IDS as readonly unknown[]).includes(v.layout)) return null;
  const layout = v.layout as CollageLayoutId;
  if (!isNum(v.cell) || !Number.isInteger(v.cell) || v.cell < 0 || v.cell >= COLLAGE_CELLS[layout]) return null;
  if (!isNum(v.aspect) || v.aspect <= 0) return null;
  const [lo, hi] = COLLAGE_LIMITS.border;
  return {
    group: v.group, layout, cell: v.cell, border: isNum(v.border) ? clampNum(v.border, lo, hi) : 0,
    corner: (COLLAGE_CORNERS as readonly unknown[]).includes(v.corner) ? (v.corner as CollageCorner) : 0, aspect: v.aspect,
  };
}
```

6. In `newLayer`, after the `chroma:` line of the returned object:

```ts
    ...(clip.motion ? { motion: { ...clip.motion } } : null),
    ...(clip.collage ? { collage: { ...clip.collage } } : null),
```

Nothing else in `types.ts` changes — no factory, no existing clamp.

`src/editor/model/migrate.ts`:

- add `clampCollageCell, clampPhotoMotion` to the value import from `./types`;
- in `normaliseClip`, replace the line that starts `const base = { ...c, speed, …` … `} as Clip;` by the same line followed by:

```ts
  // v17: both are optional and ABSENT unless usable. A Motion needs a photo that no Combo owns; a collage tag needs a layer.
  const motion = kind === "photo" && animation.combo === null ? clampPhotoMotion(c.motion) : null;
  const collage = isLayer ? clampCollageCell(c.collage) : null;
  delete base.motion;
  delete base.collage;
  if (motion) base.motion = motion;
  if (collage) base.collage = collage;
```

  (the `const base = …` line itself is not changed; `base` stays a `const`.)
- comments: `Brings a v2–v17 file to a safe v17 shape`; append to that comment `, and v16 → v17 adds nothing either: a photo's Motion and a layer's collage tag are optional, kept when usable and removed when not`; `// v2 → v17 and the sanity pass are the same idempotent step …`.

Create `src/editor/photoTools.ts`:

```ts
import type { CollageLayoutId, PhotoMotionId } from "./model/types";
import type { IoniconName } from "./toolGroups";

/** The Motion tool's tiles (None comes first and is not listed here). */
export const PHOTO_MOTIONS: Record<PhotoMotionId, { label: string; icon: IoniconName }> = {
  zoomIn:     { label: "Zoom in",     icon: "expand-outline" },
  zoomOut:    { label: "Zoom out",    icon: "contract-outline" },
  panLeft:    { label: "Pan left",    icon: "arrow-back-outline" },
  panRight:   { label: "Pan right",   icon: "arrow-forward-outline" },
  panUp:      { label: "Pan up",      icon: "arrow-up-outline" },
  panDown:    { label: "Pan down",    icon: "arrow-down-outline" },
  zoomCorner: { label: "Corner zoom", icon: "scan-outline" },
};
/** The Collage panel's tiles: each draws its own layout, so a label is all it needs. */
export const COLLAGE_LAYOUTS: Record<CollageLayoutId, { label: string }> = {
  sideBySide: { label: "Side by side" }, stacked: { label: "Stacked" }, bigTwo: { label: "Big and two" },
  row3: { label: "Row of three" }, grid4: { label: "Grid of four" }, inset: { label: "Inset" },
};
/** What the Corner slider says at each of its three stops (`CollageCorner`). */
export const CORNER_LABELS = ["Square", "Rounded", "Round"] as const;
```

**Pinned values (edit each by hand, found with Grep — only a `16` that stands for the schema version):**
- `migrate.test.ts`: `toBe(16)` at lines 115, 126, 159, 221, 254, 320, 370, 427, 513, 538, 581; `schemaVersion: 16` at 360, 487, 503; the titles at 358 and 478 (`reaches v17`). The title at 567 keeps "v15 → v16" (that step is what it describes) and its body keeps `v15.schemaVersion = 15`; the comments "a clean v16 project" at 529 and 574 become "a clean project of the current version".
- `types.audio.test.ts` (6, 7, 45), `types.clip.test.ts` (6), `types.layers.test.ts` (4), `types.layers2.test.ts` (4, 56), `types.look.test.ts` (7), `types.motion.test.ts` (7, 8), `types.polish.test.ts` (3, 4, 9), `types.speed.test.ts` (9, 10), `types.text.test.ts` (6, 105).
- Then Grep the whole repo (not `node_modules`) for `toBe(16)` and `schemaVersion: 16`: any other hit that means the schema is updated too and named in your report.

- [ ] **Step 4: Run** the three suites of Step 2, then `npm run typecheck` and `npm test` → all green.
- [ ] **Step 5: Commit** — `git add` the files listed under **Files**; message `feat(model): schema v17 — an optional photo Motion and collage tag, kept as stored (the migration adds nothing)`.

---

### Task 2: Photo motion maths; the preview hook; the export's two pins

**Depends on:** Task 1. **Parallel-safe with:** Tasks 3, 4, 5, 6.

**Files:** Create `src/editor/model/__tests__/photoMotion.test.ts`. Modify `src/editor/model/motion.ts`, `modules/clipy-video/index.ts` (one expression, one import), `modules/clipy-video/__tests__/index.test.ts` (append one test).

**Do not touch:** `MOTION` (its keys and values), every existing function body of `motion.ts` except the two edits below, `Motion.swift`, `motion.parity.test.ts`, `motion.vectors.ts`, `ops.ts`, `ClipFrame.tsx`.

**Interfaces — Consumes** (Task 1): `activePhotoMotion`, `PHOTO_MOTION_LIMITS`, `type PhotoMotionId`, `type Keyframe`.

**Interfaces — Produces**

```ts
// src/editor/model/motion.ts
export const PHOTO_MOTION: { readonly zoom: 0.15; readonly pan: 0.05; readonly gentle: 0.4; readonly strong: 1.6 };
/** How far a motion goes at a strength: gentle (0.4×) … strong (1.6×); 1× at 0.5. */
export const photoMotionAmount: (strength: number) => number;
/** `p` = LINEAR progress through the photo; the easing (`smooth`) is applied inside. */
export function photoMotionDelta(id: PhotoMotionId, strength: number, p: number): MotionDelta;
/** The motion as the export plays it: two pins, at 0 and at `length`; null without an active motion or a length. */
export function photoMotionPins(clip: Clip, length: number): Keyframe[] | null;
// resolveClipMotion and hasClipMotion now count an active photo motion.
```

- [ ] **Step 1: Failing tests.**

Create `src/editor/model/__tests__/photoMotion.test.ts`:

```ts
import { clipDuration } from "../timeline";
import { makeClip, makeKeyframe, makePhotoClip, PHOTO_MOTION_IDS, type Clip, type PhotoMotionId } from "../types";
import {
  IDENTITY_DELTA, MOTION, PHOTO_MOTION, animInDelta, combine, hasClipMotion, photoMotionAmount, photoMotionDelta, photoMotionPins, resolveClipMotion, sampleKeyframes,
} from "../motion";

/** id, strength, progress → scale, dx, dy. Hand-computed: k = 0.4 + 1.2·s, e = p²(3 − 2p), Z = 0.15·k, P = 0.05·k. */
const VECTORS: [PhotoMotionId, number, number, number, number, number][] = [
  ["zoomIn", 0.5, 0, 1, 0, 0], ["zoomIn", 0.5, 0.25, 1.0234375, 0, 0], ["zoomIn", 0.5, 0.5, 1.075, 0, 0], ["zoomIn", 0.5, 1, 1.15, 0, 0],   // e(0.25) = 0.15625
  ["zoomIn", 0, 1, 1.06, 0, 0], ["zoomIn", 1, 1, 1.24, 0, 0],                                                                                   // k = 0.4 / 1.6
  ["zoomOut", 0.5, 0, 1.15, 0, 0], ["zoomOut", 0.5, 0.25, 1.1265625, 0, 0], ["zoomOut", 0.5, 1, 1, 0, 0],
  ["panLeft", 0.5, 0, 1.1, 0.05, 0], ["panLeft", 0.5, 0.5, 1.1, 0, 0], ["panLeft", 0.5, 1, 1.1, -0.05, 0], ["panLeft", 1, 0, 1.16, 0.08, 0],
  ["panRight", 0.5, 0, 1.1, -0.05, 0], ["panRight", 0.5, 0.25, 1.1, -0.034375, 0], ["panRight", 0.5, 1, 1.1, 0.05, 0],                          // 0.05·(2·0.15625 − 1)
  ["panUp", 0.5, 0, 1.1, 0, 0.05], ["panUp", 0.5, 1, 1.1, 0, -0.05], ["panUp", 0, 0, 1.04, 0, 0.02],
  ["panDown", 0.5, 0, 1.1, 0, -0.05], ["panDown", 0.5, 1, 1.1, 0, 0.05], ["panDown", 1, 1, 1.16, 0, 0.08],
  ["zoomCorner", 0.5, 0, 1, 0, 0], ["zoomCorner", 0.5, 0.5, 1.075, 0.0375, 0.0375], ["zoomCorner", 0.5, 1, 1.15, 0.075, 0.075], ["zoomCorner", 1, 1, 1.24, 0.12, 0.12],
];
const photo = (id: PhotoMotionId, strength: number, extra: Partial<Clip> = {}): Clip => ({ ...makePhotoClip({ id: "p", seconds: 4 }), motion: { id, strength }, ...extra });

test("the photo constants are their own object: MOTION (mirrored in Motion.swift) has none of them", () => {
  expect(PHOTO_MOTION).toEqual({ zoom: 0.15, pan: 0.05, gentle: 0.4, strong: 1.6 });
  for (const key of Object.keys(PHOTO_MOTION)) expect(key in MOTION).toBe(false);
  // At the default strength a motion goes as far as the older Combos do.
  expect(PHOTO_MOTION.zoom).toBe(MOTION.comboZoom);
  expect(PHOTO_MOTION.pan).toBe(MOTION.pan);
  expect(1 + 2 * PHOTO_MOTION.pan).toBeCloseTo(MOTION.panScale, 12);
});

test("photoMotionAmount: 0.4 at gentle, exactly 1 in the middle, 1.6 at strong; clamped; not a number → the middle", () => {
  expect(photoMotionAmount(0)).toBeCloseTo(0.4, 12);
  expect(photoMotionAmount(0.5)).toBe(1);
  expect(photoMotionAmount(1)).toBeCloseTo(1.6, 12);
  expect(photoMotionAmount(-3)).toBeCloseTo(0.4, 12);
  expect(photoMotionAmount(9)).toBeCloseTo(1.6, 12);
  expect(photoMotionAmount(NaN)).toBe(1);
});

test.each(VECTORS)("photoMotionDelta(%s, strength %d, p %d)", (id, strength, p, scale, dx, dy) => {
  const d = photoMotionDelta(id, strength, p);
  expect(d.scale).toBeCloseTo(scale, 12);
  expect(d.dx).toBeCloseTo(dx, 12);
  expect(d.dy).toBeCloseTo(dy, 12);
  expect(d.rotation).toBe(0);
  expect(d.opacity).toBe(1);
});

test("photoMotionDelta is total: progress is clamped, a progress that is not a number moves nothing", () => {
  for (const id of PHOTO_MOTION_IDS) {
    expect(photoMotionDelta(id, 0.5, -2)).toEqual(photoMotionDelta(id, 0.5, 0));
    expect(photoMotionDelta(id, 0.5, 7)).toEqual(photoMotionDelta(id, 0.5, 1));
    expect(photoMotionDelta(id, 0.5, NaN)).toEqual(IDENTITY_DELTA);
  }
});

test("a photo at Fill never shows its background: the enlarged picture always covers the frame", () => {
  // The box is `scale` frames wide and its centre is `dx` from the frame's: it covers when scale / 2 − |dx| ≥ 1 / 2 (the same in y).
  for (const id of PHOTO_MOTION_IDS) for (const s of [0, 0.5, 1]) for (const p of [0, 0.1, 0.5, 0.9, 1]) {
    const d = photoMotionDelta(id, s, p);
    expect(d.scale / 2 - Math.abs(d.dx)).toBeGreaterThanOrEqual(0.5 - 1e-12);
    expect(d.scale / 2 - Math.abs(d.dy)).toBeGreaterThanOrEqual(0.5 - 1e-12);
  }
});

test("resolveClipMotion: a photo's motion at linear progress through the clip, on top of its own placement", () => {
  const c = photo("panLeft", 0.5, { transform: { scale: 1.2, x: 0.1, y: -0.2, rotation: 15, flipH: true, flipV: false } });
  const at = (t: number) => resolveClipMotion(c, t).transform;
  expect(at(0)).toEqual({ scale: expect.closeTo(1.32, 12), x: expect.closeTo(0.15, 12), y: -0.2, rotation: 15, flipH: true, flipV: false });   // 1.2·1.1, 0.1 + 0.05
  expect(at(2).x).toBeCloseTo(0.1, 12);                                                                                                          // half way: dx = 0
  expect(at(4).x).toBeCloseTo(0.05, 12);
  expect(at(1).x).toBeCloseTo(0.1 + 0.05 * (1 - 2 * 0.15625), 12);                                                                               // p = 0.25
  expect(resolveClipMotion(c, 2).opacity).toBe(1);
  expect(resolveClipMotion(c, NaN).transform).toEqual(c.transform);                                                                              // not a number: the base, no animation
});

test("resolveClipMotion: In / Out stay with a motion; a Combo or keyframes own the clip and the motion does not play", () => {
  const faded = photo("zoomIn", 0.5, { animation: { in: { id: "fade", duration: 1 }, out: null, combo: null } });
  expect(resolveClipMotion(faded, 0.5).opacity).toBeCloseTo(0.875, 12);                 // easeOut(0.5)
  expect(resolveClipMotion(faded, 4).transform.scale).toBeCloseTo(1.15, 12);
  const combo = photo("zoomIn", 0.5, { animation: { in: null, out: null, combo: "zoomOutSlow" } });
  expect(resolveClipMotion(combo, 4).transform.scale).toBe(1);                          // the Combo alone: 1 + 0.15·(1 − 1)
  const pinned = photo("zoomIn", 0.5, { keyframes: [makeKeyframe({ t: 0, scale: 2 })] });
  expect(resolveClipMotion(pinned, 4).transform.scale).toBe(2);
  expect(resolveClipMotion({ ...makeClip({ id: "v", sourceDuration: 4 }), motion: { id: "zoomIn", strength: 0.5 } }, 4).transform.scale).toBe(1);   // never a video
});

test("hasClipMotion: true for a photo whose motion plays, and only then", () => {
  expect(hasClipMotion(makePhotoClip({ id: "p" }))).toBe(false);
  expect(hasClipMotion(photo("zoomIn", 0.5))).toBe(true);
  expect(hasClipMotion({ ...makeClip({ id: "v", sourceDuration: 4 }), motion: { id: "zoomIn", strength: 0.5 } })).toBe(false);
});

test("photoMotionPins: two pins, at the start and the end, holding the placement combined with the motion there", () => {
  const c = photo("zoomCorner", 1, { transform: { scale: 1.5, x: 0.1, y: 0, rotation: 30, flipH: false, flipV: false } });
  expect(photoMotionPins(c, 4)).toEqual([
    { t: 0, x: 0.1, y: 0, scale: 1.5, rotation: 30, opacity: 1 },
    { t: 4, x: expect.closeTo(0.22, 12), y: expect.closeTo(0.12, 12), scale: expect.closeTo(1.86, 12), rotation: 30, opacity: 1 },   // 1.5·1.24, + 0.12
  ]);
  expect(photoMotionPins(makePhotoClip({ id: "p" }), 4)).toBeNull();
  expect(photoMotionPins(c, 0)).toBeNull();
  expect(photoMotionPins(c, NaN)).toBeNull();
  expect(photoMotionPins({ ...c, keyframes: [makeKeyframe({ t: 0 })] }, 4)).toBeNull();
});

test("PROOF the export's two pins play exactly what the preview shows, for every motion, at every time", () => {
  for (const id of PHOTO_MOTION_IDS) for (const strength of [0, 0.35, 1]) {
    const c = photo(id, strength, { transform: { scale: 1.3, x: 0.1, y: -0.2, rotation: 15, flipH: true, flipV: false } });
    const pins = photoMotionPins(c, clipDuration(c))!;
    expect(pins.map((k) => k.t)).toEqual([0, 4]);
    for (const t of [0, 0.4, 1, 2, 3.3, 4]) {
      const fromPins = sampleKeyframes(pins, t)!;      // Motion.swift samples pins with the same formula (parity-tested)
      const shown = resolveClipMotion(c, t).transform;
      expect(fromPins.x).toBeCloseTo(shown.x, 12);
      expect(fromPins.y).toBeCloseTo(shown.y, 12);
      expect(fromPins.scale).toBeCloseTo(shown.scale, 12);
      expect(fromPins.rotation).toBeCloseTo(shown.rotation, 12);
      expect(fromPins.opacity).toBe(1);
    }
  }
});

test("PROOF with an In animation too: the export combines its In delta with the pins, and that is the preview's value", () => {
  const c = photo("panUp", 0.8, { animation: { in: { id: "slideLeft", duration: 1 }, out: null, combo: null } });
  const pins = photoMotionPins(c, 4)!;
  for (const t of [0, 0.25, 0.5, 0.99]) {
    const exported = combine(sampleKeyframes(pins, t)!, animInDelta("slideLeft", t / 1, MOTION.slideClip));   // Motion.resolveClip: pins, then In / Out
    const shown = resolveClipMotion(c, t).transform;
    expect(exported.x).toBeCloseTo(shown.x, 12);
    expect(exported.y).toBeCloseTo(shown.y, 12);
    expect(exported.scale).toBeCloseTo(shown.scale, 12);
  }
});
```

Append inside `describe("toExportClip", …)` of `modules/clipy-video/__tests__/index.test.ts`:

```ts
  it("sends a photo's Motion as two pins, at its start and its end — nothing else in the request changes", () => {
    const still = makePhotoClip({ id: "p", seconds: 4 });
    const moving = { ...still, motion: { id: "zoomIn" as const, strength: 0.5 } };
    expect(toExportClip(still).keyframes).toEqual([]);
    expect(toExportClip(moving)).toEqual({ ...toExportClip(still), keyframes: [
      { t: 0, x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 },
      { t: 4, x: 0, y: 0, scale: expect.closeTo(1.15, 12), rotation: 0, opacity: 1 },
    ] });
    expect("motion" in toExportClip(moving)).toBe(false);          // the request has no such field: Swift is not asked anything new
    expect(toExportLayer({ ...moving, start: 2 }).keyframes).toHaveLength(2);
    // Keyframes win over a stored motion, as in the preview.
    const pinned = { ...moving, keyframes: [makeKeyframe({ t: 1, scale: 2 })] };
    expect(toExportClip(pinned).keyframes).toEqual([{ t: 1, x: 0, y: 0, scale: 2, rotation: 0, opacity: 1 }]);
  });
```

- [ ] **Step 2: Run** `npx.cmd jest src/editor/model/__tests__/photoMotion.test.ts modules/clipy-video/__tests__/index.test.ts` → FAIL.
- [ ] **Step 3: Implement.**

`src/editor/model/motion.ts`:

1. The type import gains `activePhotoMotion` (a value), `PHOTO_MOTION_LIMITS` (a value) and `type PhotoMotionId`:

```ts
import { activePhotoMotion, clampOpacity, PHOTO_MOTION_LIMITS, type AnimComboId, type AnimInId, type AnimLoopId, type Clip, type ClipTransform, type Keyframe, type Overlay, type PhotoMotionId } from "./types";
```

2. After `animLoopDelta` (before `edgeDurations`) insert:

```ts
// ---- Photo motion (the Motion tool) — TypeScript only. NOT mirrored in Motion.swift, and it must not be: every formula below is a
// straight line in e = smooth(p), which is exactly how two keyframes are interpolated, so the export is sent the motion as two pins
// (`photoMotionPins`, used by `toExportClip`). Changing the easing here breaks that equality; `photoMotion.test.ts` proves it.

/** `zoom` / `pan` at the default strength are the older Combos' amounts (`MOTION.comboZoom`, `MOTION.pan`); `gentle` … `strong` scale them. */
export const PHOTO_MOTION = { zoom: 0.15, pan: 0.05, gentle: 0.4, strong: 1.6 } as const;

/** How far a motion goes at a strength (0–1, clamped; not a number → the default): gentle (0.4×) … strong (1.6×), exactly 1× at 0.5. */
export const photoMotionAmount = (strength: number): number =>
  PHOTO_MOTION.gentle + (PHOTO_MOTION.strong - PHOTO_MOTION.gentle) * clamp01(Number.isFinite(strength) ? strength : PHOTO_MOTION_LIMITS.defaultStrength);

/**
 * A photo's motion at LINEAR progress `p` through the photo (clamped to 0–1; not a number → no movement). Offsets are fractions of the
 * frame (x right, y down). A pan is enlarged by twice its travel and a corner zoom moves by half of what it grew, so a photo that
 * fills the frame keeps covering it.
 */
export function photoMotionDelta(id: PhotoMotionId, strength: number, p: number): MotionDelta {
  const d = identity();
  if (!Number.isFinite(p)) return d;
  const k = photoMotionAmount(strength);
  const e = smooth(p);
  const zoom = PHOTO_MOTION.zoom * k;
  const pan = PHOTO_MOTION.pan * k;
  switch (id) {
    case "zoomIn": d.scale = 1 + zoom * e; break;
    case "zoomOut": d.scale = 1 + zoom * (1 - e); break;
    case "panLeft": d.scale = 1 + 2 * pan; d.dx = pan * (1 - 2 * e); break;      // starts to the right, moves left
    case "panRight": d.scale = 1 + 2 * pan; d.dx = pan * (2 * e - 1); break;
    case "panUp": d.scale = 1 + 2 * pan; d.dy = pan * (1 - 2 * e); break;        // starts lower, moves up
    case "panDown": d.scale = 1 + 2 * pan; d.dy = pan * (2 * e - 1); break;
    case "zoomCorner": d.scale = 1 + zoom * e; d.dx = (d.scale - 1) / 2; d.dy = (d.scale - 1) / 2; break;   // the top-left corner stays put
    default: break;
  }
  return d;
}

/**
 * The motion as the export plays it: two pins in clip-local seconds, at 0 and at `length`, each the photo's own placement combined
 * with the motion there. Null when no motion plays (`activePhotoMotion`) or there is no length. A photo runs at speed 1 from 0, so its
 * output time is its own time.
 */
export function photoMotionPins(clip: Clip, length: number): Keyframe[] | null {
  const m = activePhotoMotion(clip);
  if (!m || !Number.isFinite(length) || !(length > 0)) return null;
  const t = clip.transform;
  const base: KeyValues = { x: t.x, y: t.y, scale: t.scale, rotation: t.rotation, opacity: 1 };
  return [0, 1].map((p) => ({ t: p * length, ...combine(base, photoMotionDelta(m.id, m.strength, p)) }));
}
```

(`KeyValues`, `combine` and `compose` are declared further down as an interface and `function`s — both are hoisted, so the order is fine.)

3. In `resolveClipMotion`, replace

```ts
  if (finite) {
    delta = a.combo
      ? animComboDelta(a.combo, length > 0 ? local / length : 0, local)
      : edgeDelta(a.in, a.out, local, length, MOTION.slideClip);
  }
```

by

```ts
  if (finite) {
    delta = a.combo
      ? animComboDelta(a.combo, length > 0 ? local / length : 0, local)
      : edgeDelta(a.in, a.out, local, length, MOTION.slideClip);
    // A photo's Motion (never with a Combo or keyframes: `activePhotoMotion`). A clip without one skips this line's effect entirely.
    const m = activePhotoMotion(clip);
    if (m) delta = compose(delta, photoMotionDelta(m.id, m.strength, length > 0 ? local / length : 0));
  }
```

4. `hasClipMotion` becomes

```ts
export const hasClipMotion = (c: Clip): boolean =>
  c.animation.in !== null || c.animation.out !== null || c.animation.combo !== null || c.keyframes.length > 0 || activePhotoMotion(c) !== null;
```

`modules/clipy-video/index.ts`: import `photoMotionPins` beside `edgeDurations` (`import { edgeDurations, photoMotionPins } from "@/src/editor/model/motion";`) and in `toExportClip` replace `keyframes: outputKeyframes(c, length),` by

```ts
    // A photo's Motion travels as two pins (it eases the way pins are interpolated): the native side needs nothing new.
    keyframes: photoMotionPins(c, length) ?? outputKeyframes(c, length),
```

Nothing else in that file changes — no field is added to `ExportClip`.

- [ ] **Step 4: Run** the two suites, then `npx.cmd jest src/editor/model` (every model suite, `motion.parity.test.ts` and `motion.test.ts` included, must be green **unedited**), then `npm run typecheck` and `npm test`.
- [ ] **Step 5: Commit** — `feat(motion): photo motion — zoom, pan and corner zoom with a strength; the export gets it as two pins (no Swift)`.

---

### Task 3: Motion ops — set, apply to all, Motion ↔ Combo ↔ keyframes

**Depends on:** Task 1. **Parallel-safe with:** Tasks 2, 4, 5.

**Files:** Create `src/editor/model/__tests__/ops.photoMotion.test.ts`. Modify `src/editor/model/ops.ts` (two new exported ops, two helpers, one line changed in `setClipAnimation`, one in `setAnimationForAllClips`, the import).

**Do not touch:** any other op; `motion.ts`; the existing `ops.*.test.ts` files (they must stay green unedited).

**Interfaces — Consumes** (Task 1): `clampPhotoMotion`, `COMBO_AS_MOTION`, `type PhotoMotion`.

**Interfaces — Produces**

```ts
// src/editor/model/ops.ts
/** A photo's Motion (main clip or layer); `null` = None, which also clears an older zoom / pan Combo. Same project when refused or unchanged. */
export function setPhotoMotion(p: Project, clipId: string, motion: PhotoMotion | null): Project;
/** Every MAIN-track photo without keyframes gets the motion (None included). Same project when nothing changes. */
export function setMotionForAllPhotos(p: Project, motion: PhotoMotion | null): Project;
// setClipAnimation / setAnimationForAllClips: a clip that ends up with a Combo loses its `motion`.
```

- [ ] **Step 1: Failing tests.** Create `src/editor/model/__tests__/ops.photoMotion.test.ts`:

```ts
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
import { makeClip, makeKeyframe, makePhotoClip, makeProject, type Clip, type LayerClip, type PhotoMotion, type Project } from "../types";
import { setAnimationForAllClips, setClipAnimation, setMotionForAllPhotos, setPhotoMotion } from "../ops";

const zoom: PhotoMotion = { id: "zoomIn", strength: 0.5 };
const video = makeClip({ id: "v", sourceDuration: 4 });
const p1 = makePhotoClip({ id: "p1" });
const p2 = makePhotoClip({ id: "p2", animation: { in: { id: "fade", duration: 0.5 }, out: null, combo: null } });
const oldZoom = makePhotoClip({ id: "old", animation: { in: null, out: null, combo: "zoomInSlow" } });
const swaying = makePhotoClip({ id: "sway", animation: { in: null, out: null, combo: "sway" } });
const pinned = makePhotoClip({ id: "pin", keyframes: [makeKeyframe({ t: 0 }), makeKeyframe({ t: 2, scale: 1.5 })] });
const layer: LayerClip = { ...makePhotoClip({ id: "L" }), start: 1 };
const project = makeProject({ clips: [video, p1, p2, oldZoom, swaying, pinned], layers: [layer] });
const clip = (x: Project, id: string): Clip => [...x.clips, ...x.layers].find((c) => c.id === id)!;

test("setPhotoMotion writes the motion on a photo (strength to 2 decimals) and leaves every other clip the same object", () => {
  const next = setPhotoMotion(project, "p1", { id: "panUp", strength: 0.333 });
  expect(clip(next, "p1").motion).toEqual({ id: "panUp", strength: 0.33 });
  for (const id of ["v", "p2", "old", "sway", "pin"]) expect(clip(next, id)).toBe(clip(project, id));
  expect(next.layers).toBe(project.layers);
  expect(next.updatedAt).toBe("2026-10-01T10:00:00.000Z");
  // A layer too; the main track is then not touched.
  const onLayer = setPhotoMotion(project, "L", zoom);
  expect(clip(onLayer, "L").motion).toEqual(zoom);
  expect(onLayer.clips).toBe(project.clips);
});

test("setPhotoMotion keeps In / Out and clears a Combo: a Motion and a Combo never sit on one photo", () => {
  expect(clip(setPhotoMotion(project, "p2", zoom), "p2").animation).toEqual({ in: { id: "fade", duration: 0.5 }, out: null, combo: null });
  for (const id of ["old", "sway"]) {
    const next = clip(setPhotoMotion(project, id, zoom), id);
    expect(next.motion).toEqual(zoom);
    expect(next.animation).toEqual({ in: null, out: null, combo: null });
  }
});

test("setPhotoMotion(null) removes the key, and with it an older zoom / pan Combo — but not Sway or Pulse", () => {
  const moving = setPhotoMotion(project, "p1", zoom);
  const still = setPhotoMotion(moving, "p1", null);
  expect("motion" in clip(still, "p1")).toBe(false);
  expect(clip(still, "p1")).toEqual(p1);
  const cleared = clip(setPhotoMotion(project, "old", null), "old");
  expect(cleared.animation.combo).toBeNull();
  expect("motion" in cleared).toBe(false);
  expect(setPhotoMotion(project, "sway", null)).toBe(project);
  expect(setPhotoMotion(project, "p1", null)).toBe(project);        // already still: no undo step
});

test("setPhotoMotion refuses (same project): a video, a photo with keyframes, an unknown clip, an unknown motion, a strength that is not a number, no change", () => {
  expect(setPhotoMotion(project, "v", zoom)).toBe(project);
  expect(setPhotoMotion(project, "pin", zoom)).toBe(project);
  expect(setPhotoMotion(project, "gone", zoom)).toBe(project);
  expect(setPhotoMotion(project, "p1", { id: "spiral", strength: 0.5 } as unknown as PhotoMotion)).toBe(project);
  expect(setPhotoMotion(project, "p1", { id: "zoomIn", strength: NaN })).toBe(project);
  const moving = setPhotoMotion(project, "p1", zoom);
  expect(setPhotoMotion(moving, "p1", { id: "zoomIn", strength: 0.5 })).toBe(moving);
  expect(setPhotoMotion(moving, "p1", { id: "zoomIn", strength: 0.501 })).toBe(moving);   // the same after rounding
  // Out of range is clamped, not refused.
  expect(clip(setPhotoMotion(project, "p1", { id: "zoomIn", strength: 3 }), "p1").motion).toEqual({ id: "zoomIn", strength: 1 });
});

test("setMotionForAllPhotos: every main-track photo without keyframes, in one change; videos, pinned photos and layers are left alone", () => {
  const next = setMotionForAllPhotos(project, { id: "panLeft", strength: 0.8 });
  for (const id of ["p1", "p2", "old", "sway"]) expect(clip(next, id).motion).toEqual({ id: "panLeft", strength: 0.8 });
  expect(clip(next, "old").animation.combo).toBeNull();
  expect(clip(next, "p2").animation.in).toEqual({ id: "fade", duration: 0.5 });
  expect(clip(next, "v")).toBe(video);
  expect(clip(next, "pin")).toBe(pinned);
  expect(next.layers).toBe(project.layers);
  expect(setMotionForAllPhotos(next, { id: "panLeft", strength: 0.8 })).toBe(next);
  // None for all: the motions go, and so do the older zoom / pan Combos; Sway stays.
  const none = setMotionForAllPhotos(next, null);
  for (const id of ["p1", "p2", "old", "sway"]) expect("motion" in clip(none, id)).toBe(false);
  expect(clip(setMotionForAllPhotos(project, null), "old").animation.combo).toBeNull();
  expect(clip(setMotionForAllPhotos(project, null), "sway").animation.combo).toBe("sway");
  expect(setMotionForAllPhotos(project, { id: "spiral", strength: 0.5 } as unknown as PhotoMotion)).toBe(project);
  expect(setMotionForAllPhotos(makeProject({ clips: [video] }), zoom).clips[0]).toBe(video);
});

test("picking a Combo removes the Motion; In / Out do not; a clip without a Motion goes the way it always did", () => {
  const moving = setPhotoMotion(project, "p1", zoom);
  const combo = clip(setClipAnimation(moving, "p1", { combo: "pulse" }), "p1");
  expect(combo.animation.combo).toBe("pulse");
  expect("motion" in combo).toBe(false);
  expect(clip(setClipAnimation(moving, "p1", { in: { id: "fade", duration: 0.5 } }), "p1").motion).toEqual(zoom);
  expect(clip(setClipAnimation(moving, "p1", { combo: null }), "p1")).toBe(clip(moving, "p1"));   // no Combo before, none after
  // The whole project: a Combo for all removes every Motion; edges for all keep them.
  const everywhere = setAnimationForAllClips(moving, { in: null, out: null, combo: "sway" });
  expect("motion" in clip(everywhere, "p1")).toBe(false);
  expect(clip(setAnimationForAllClips(moving, { in: { id: "fade", duration: 0.5 }, out: null, combo: null }), "p1").motion).toEqual(zoom);
  // Untouched behaviour for a clip that never had a Motion.
  expect(clip(setClipAnimation(project, "v", { combo: "sway" }), "v")).toEqual({ ...video, animation: { in: null, out: null, combo: "sway" } });
});
```

- [ ] **Step 2: Run** `npx.cmd jest src/editor/model/__tests__/ops.photoMotion.test.ts` → FAIL.
- [ ] **Step 3: Implement** in `src/editor/model/ops.ts`.

1. Add to the `./types` import: `clampPhotoMotion`, `COMBO_AS_MOTION`, `type PhotoMotion`.

2. In `setClipAnimation`, the last two lines of the updater

```ts
    const clean = clampClipAnimation(next);
    return sameJson(clean, c.animation) ? c : { ...c, animation: clean };
```

become

```ts
    const clean = clampClipAnimation(next);
    return sameJson(clean, c.animation) ? c : comboOverMotion({ ...c, animation: clean });
```

3. In `setAnimationForAllClips`, the last line becomes

```ts
  return touch(p, { clips: p.clips.map((c) => (same(c) ? c : comboOverMotion({ ...c, animation: clampClipAnimation(a) }))) });
```

4. Right after `setAnimationForAllClips` insert:

```ts
/** A Combo owns the whole clip: a clip that now has one loses its photo Motion. A clip without a Motion is returned as it is. */
function comboOverMotion(c: Clip): Clip {
  if (c.animation.combo === null || c.motion === undefined) return c;
  const next = { ...c };
  delete next.motion;
  return next;
}

/**
 * `c` with the Motion (already clamped) or without one. A video and a photo with keyframes are returned as they are (keyframes move
 * the photo already). A Motion clears any Combo — the two never sit on one photo — and keeps In / Out. None removes the key, and with
 * it an older zoom / pan Combo (what the Motion tool shows as its own); Sway and Pulse stay. Same object when nothing changes.
 */
function withPhotoMotion(c: Clip, motion: PhotoMotion | null): Clip {
  if (!isPhoto(c) || c.keyframes.length > 0) return c;
  const combo = c.animation.combo;
  if (motion === null) {
    const twin = combo !== null && COMBO_AS_MOTION[combo] !== undefined;
    if (c.motion === undefined && !twin) return c;
    const next: Clip = { ...c, animation: twin ? { ...c.animation, combo: null } : c.animation };
    delete next.motion;
    return next;
  }
  const stored: PhotoMotion = { id: motion.id, strength: r2(motion.strength) };
  if (combo === null && sameJson(c.motion, stored)) return c;
  return { ...c, motion: stored, animation: combo === null ? c.animation : { ...c.animation, combo: null } };
}

/** `motion` as it may be stored: null for None; `undefined` when it cannot be used (an unknown id, a strength that is not a number). */
function usableMotion(motion: PhotoMotion | null): PhotoMotion | null | undefined {
  if (motion === null) return null;
  const clean = clampPhotoMotion(motion);
  return clean === null || !Number.isFinite(motion.strength) ? undefined : clean;
}

/**
 * A photo's Motion — a main clip's or a layer's. `null` = None. Same project (no undo step) for a video, a photo with keyframes, an
 * unknown clip, a motion that cannot be used, or no change.
 */
export function setPhotoMotion(p: Project, clipId: string, motion: PhotoMotion | null): Project {
  const clean = usableMotion(motion);
  return clean === undefined ? p : updateClip(p, clipId, (c) => withPhotoMotion(c, clean));
}

/** "Apply to all photos": every MAIN-track photo without keyframes gets the motion (None included). Layers are not touched. */
export function setMotionForAllPhotos(p: Project, motion: PhotoMotion | null): Project {
  const clean = usableMotion(motion);
  if (clean === undefined) return p;
  const clips = p.clips.map((c) => withPhotoMotion(c, clean));
  return clips.every((c, i) => c === p.clips[i]) ? p : touch(p, { clips });
}
```

(`r2`, `sameJson`, `updateClip`, `touch` and `isPhoto` are already in the file. A layer goes through `updateClip` → `putLayer`, which keeps the rest of the layer.)

- [ ] **Step 4: Run** the suite, then `npx.cmd jest src/editor/model/__tests__/ops` (every existing ops suite green **unedited**), `npm run typecheck`, `npm test`.
- [ ] **Step 5: Commit** — `feat(model): photo Motion ops — set, apply to all photos; a Motion and a Combo never share a photo`.

---

### Task 4: Collage geometry — cells, fill, in place (`collage.ts`)

**Depends on:** Task 1. **Parallel-safe with:** Tasks 2, 3, 6.

**Files:** Create `src/editor/model/collage.ts`, `src/editor/model/__tests__/collage.test.ts`.

**Do not touch:** `clipLayout.ts` (it is used, not edited), `types.ts`, `ops.ts`.

**Interfaces — Consumes:** `coverFactor`, `croppedSize`, `placeClip`, `type Size` from `clipLayout.ts`; `clampCrop`, `type Clip`, `type CollageCell`, `type CollageLayoutId`, `type CropRect` from `types.ts`.

**Interfaces — Produces**

```ts
// src/editor/model/collage.ts
export interface CellRect { x: number; y: number; w: number; h: number }          // fractions of the frame, top-left origin
export interface CellPlacement { crop: CropRect; scale: number; x: number; y: number }
export const COLLAGE: { readonly insetAt: 0.62; readonly insetSize: 0.34; readonly inPlace: 1e-5 };
/** The layout's cells for a frame of `aspect` (width / height) with `border` (a fraction of the shorter side) around and between them. Not rounded. */
export function collageCells(layout: CollageLayoutId, aspect: number, border: number): CellRect[];
/** The crop, scale and offset that make a picture fill a cell (6 decimals). */
export function cellPlacement(media: Size, cell: CellRect, aspect: number): CellPlacement;
/** `clip` placed in the tag's cell: transform scale / x / y, rotation 0, crop, and the tag itself. Flips, the mask and everything else are kept. */
export function placeInCell<T extends Clip>(clip: T, tag: CollageCell): T;
/** Whether a tagged layer still sits where its tag's layout put it (no keyframes, rotation 0, crop / scale / offset within COLLAGE.inPlace). */
export function isCellInPlace(clip: Clip): boolean;
```

- [ ] **Step 1: Failing tests.** Create `src/editor/model/__tests__/collage.test.ts`:

```ts
import { placeClip } from "../clipLayout";
import { COLLAGE, cellPlacement, collageCells, isCellInPlace, placeInCell, type CellRect } from "../collage";
import { clampCrop, clampTransform, COLLAGE_CELLS, COLLAGE_LAYOUT_IDS, DEFAULT_TRANSFORM, makeKeyframe, makePhotoClip, type CollageCell } from "../types";

const RATIOS = [9 / 16, 16 / 9, 1, 21 / 9, 9 / 21, 4 / 3, 3 / 4, 3 / 2, 2 / 3];
const PORTRAIT = { width: 1080, height: 1920 }, LANDSCAPE = { width: 1920, height: 1080 }, SQUARE = { width: 1000, height: 1000 }, PHOTO43 = { width: 4032, height: 3024 };
const close = (cells: CellRect[], want: number[][]) => {
  expect(cells).toHaveLength(want.length);
  cells.forEach((c, i) => { expect(c.x).toBeCloseTo(want[i][0], 9); expect(c.y).toBeCloseTo(want[i][1], 9); expect(c.w).toBeCloseTo(want[i][2], 9); expect(c.h).toBeCloseTo(want[i][3], 9); });
};

test("every layout has as many cells as COLLAGE_CELLS says; without a border they tile the frame (Inset aside)", () => {
  for (const id of COLLAGE_LAYOUT_IDS) for (const a of RATIOS) {
    const cells = collageCells(id, a, 0);
    expect(cells).toHaveLength(COLLAGE_CELLS[id]);
    if (id !== "inset") expect(cells.reduce((sum, c) => sum + c.w * c.h, 0)).toBeCloseTo(1, 9);
    for (const c of cells) { expect(c.x).toBeGreaterThanOrEqual(0); expect(c.y).toBeGreaterThanOrEqual(0); expect(c.x + c.w).toBeLessThanOrEqual(1 + 1e-9); expect(c.y + c.h).toBeLessThanOrEqual(1 + 1e-9); }
  }
});

test("the six layouts without a border", () => {
  close(collageCells("sideBySide", 9 / 16, 0), [[0, 0, 0.5, 1], [0.5, 0, 0.5, 1]]);
  close(collageCells("stacked", 9 / 16, 0), [[0, 0, 1, 0.5], [0, 0.5, 1, 0.5]]);
  close(collageCells("row3", 9 / 16, 0), [[0, 0, 1 / 3, 1], [1 / 3, 0, 1 / 3, 1], [2 / 3, 0, 1 / 3, 1]]);
  close(collageCells("grid4", 1, 0), [[0, 0, 0.5, 0.5], [0.5, 0, 0.5, 0.5], [0, 0.5, 0.5, 0.5], [0.5, 0.5, 0.5, 0.5]]);
  close(collageCells("inset", 9 / 16, 0), [[0, 0, 1, 1], [0.62, 0.62, 0.34, 0.34]]);
  expect(COLLAGE).toEqual({ insetAt: 0.62, insetSize: 0.34, inPlace: 1e-5 });
});

test("Big and two: the big cell is on top in a tall frame and on the left in a wide or square one", () => {
  close(collageCells("bigTwo", 9 / 16, 0), [[0, 0, 1, 0.5], [0, 0.5, 0.5, 0.5], [0.5, 0.5, 0.5, 0.5]]);
  close(collageCells("bigTwo", 16 / 9, 0), [[0, 0, 0.5, 1], [0.5, 0, 0.5, 0.5], [0.5, 0.5, 0.5, 0.5]]);
  close(collageCells("bigTwo", 1, 0), [[0, 0, 0.5, 1], [0.5, 0, 0.5, 0.5], [0.5, 0.5, 0.5, 0.5]]);
});

test("the border is a fraction of the SHORTER side: the same pixels at the edges and between cells, in both directions", () => {
  // 9:16, b = 0.04: gx = 0.04, gy = 0.04·9/16 = 0.0225 → x' = gx + x(1 − gx), w' = w(1 − gx) − gx.
  close(collageCells("sideBySide", 9 / 16, 0.04), [[0.04, 0.0225, 0.44, 0.955], [0.52, 0.0225, 0.44, 0.955]]);
  // 16:9: the other way round.
  close(collageCells("sideBySide", 16 / 9, 0.04), [[0.0225, 0.04, 0.46625, 0.92], [0.51125, 0.04, 0.46625, 0.92]]);
  close(collageCells("grid4", 1, 0.02), [[0.02, 0.02, 0.47, 0.47], [0.51, 0.02, 0.47, 0.47], [0.02, 0.51, 0.47, 0.47], [0.51, 0.51, 0.47, 0.47]]);
  close(collageCells("inset", 9 / 16, 0.06), [[0.06, 0.03375, 0.88, 0.9325], [0.6428, 0.632825, 0.2596, 0.294775]]);
  close(collageCells("stacked", 21 / 9, 0.06), [[0.06 * 9 / 21, 0.06, 1 - 0.12 * 9 / 21, 0.41], [0.06 * 9 / 21, 0.53, 1 - 0.12 * 9 / 21, 0.41]]);
  // In pixels of a 1080-wide 9:16 frame: left edge, middle gap and top edge are all 43.2.
  const [a, b] = collageCells("sideBySide", 9 / 16, 0.04);
  expect(a.x * 1080).toBeCloseTo(43.2, 6);
  expect((b.x - (a.x + a.w)) * 1080).toBeCloseTo(43.2, 6);
  expect(a.y * 1920).toBeCloseTo(43.2, 6);
});

test("collageCells is total: a frame shape that cannot be used counts as square, a border that is not a number as none", () => {
  for (const bad of [0, -1, NaN, Infinity]) close(collageCells("bigTwo", bad, 0), [[0, 0, 0.5, 1], [0.5, 0, 0.5, 0.5], [0.5, 0.5, 0.5, 0.5]]);
  close(collageCells("sideBySide", 1, NaN), [[0, 0, 0.5, 1], [0.5, 0, 0.5, 1]]);
  close(collageCells("sideBySide", 1, -0.5), [[0, 0, 0.5, 1], [0.5, 0, 0.5, 1]]);
});

test("cellPlacement: the picture is cropped to the cell's shape, centred, and scaled onto the cell", () => {
  const at = (media: { width: number; height: number }, layout: Parameters<typeof collageCells>[0], aspect: number, border: number, i: number) => cellPlacement(media, collageCells(layout, aspect, border)[i], aspect);
  expect(at(PORTRAIT, "sideBySide", 9 / 16, 0, 0)).toEqual({ crop: { x: 0.25, y: 0, w: 0.5, h: 1 }, scale: 0.5, x: -0.25, y: 0 });
  expect(at(LANDSCAPE, "sideBySide", 9 / 16, 0, 1)).toEqual({ crop: { x: 0.420898, y: 0, w: 0.158203, h: 1 }, scale: 0.5, x: 0.25, y: 0 });
  expect(at(LANDSCAPE, "stacked", 9 / 16, 0, 0)).toEqual({ crop: { x: 0.183594, y: 0, w: 0.632813, h: 1 }, scale: 0.5, x: 0, y: -0.25 });
  expect(at(PORTRAIT, "stacked", 9 / 16, 0, 1)).toEqual({ crop: { x: 0, y: 0.25, w: 1, h: 0.5 }, scale: 0.5, x: 0, y: 0.25 });
  expect(at(PHOTO43, "grid4", 1, 0.02, 3)).toEqual({ crop: { x: 0.125, y: 0, w: 0.75, h: 1 }, scale: 0.47, x: 0.245, y: 0.245 });
  expect(at(SQUARE, "row3", 16 / 9, 0, 1)).toEqual({ crop: { x: 0.203704, y: 0, w: 0.592593, h: 1 }, scale: 0.333333, x: 0, y: 0 });      // never −0
  expect(at(SQUARE, "row3", 16 / 9, 0, 0)).toEqual({ crop: { x: 0.203704, y: 0, w: 0.592593, h: 1 }, scale: 0.333333, x: -0.333333, y: 0 });
  expect(at(PORTRAIT, "inset", 9 / 16, 0, 0)).toEqual({ crop: { x: 0, y: 0, w: 1, h: 1 }, scale: 1, x: 0, y: 0 });
  expect(at(PORTRAIT, "inset", 9 / 16, 0, 1)).toEqual({ crop: { x: 0, y: 0, w: 1, h: 1 }, scale: 0.34, x: 0.29, y: 0.29 });
  expect(at(LANDSCAPE, "inset", 9 / 16, 0.06, 1)).toEqual({ crop: { x: 0.360675, y: 0, w: 0.27865, h: 1 }, scale: 0.2596, x: 0.2726, y: 0.280213 });
  expect(at(LANDSCAPE, "bigTwo", 16 / 9, 0, 0)).toEqual({ crop: { x: 0.25, y: 0, w: 0.5, h: 1 }, scale: 0.5, x: -0.25, y: 0 });
  expect(at(PORTRAIT, "bigTwo", 9 / 16, 0.04, 2)).toEqual({ crop: { x: 0.02815, y: 0, w: 0.9437, h: 1 }, scale: 0.44, x: 0.24, y: 0.244375 });
  expect(at(PORTRAIT, "sideBySide", 9 / 16, 0.04, 0)).toEqual({ crop: { x: 0.269634, y: 0, w: 0.460733, h: 1 }, scale: 0.44, x: -0.24, y: 0 });
  expect(at(PORTRAIT, "sideBySide", 1, 0, 0)).toEqual({ crop: { x: 0.055556, y: 0, w: 0.888889, h: 1 }, scale: 0.5, x: -0.25, y: 0 });
});

test("the crop limit: a picture more than ten times wider than its cell is fitted INSIDE the cell, never over a neighbour", () => {
  // A 16:9 video in a Row-of-three cell of a 9:16 frame with the widest border would need a crop of 0.086 wide: it gets 0.1.
  const cell = collageCells("row3", 9 / 16, 0.06)[0];
  const at = cellPlacement(LANDSCAPE, cell, 9 / 16);
  expect(at).toEqual({ crop: { x: 0.45, y: 0, w: 0.1, h: 1 }, scale: 0.253333, x: -0.313333, y: 0 });   // the tenth that is kept is the middle one
  const box = placeClip(LANDSCAPE, at.crop, { ...DEFAULT_TRANSFORM, scale: at.scale, x: at.x, y: at.y }, 1080, 1920);
  expect(box.width).toBeCloseTo(cell.w * 1080, 1);          // as wide as the cell …
  expect(box.height).toBeLessThan(cell.h * 1920);           // … and shorter: a gap above and below
});

test("PROOF for every layout, ratio, border and picture shape the placed box IS the cell (inside it at the crop limit), and what is stored survives the model's clamps", () => {
  for (const layout of COLLAGE_LAYOUT_IDS) for (const aspect of RATIOS) for (const border of [0, 0.005, 0.03, 0.06]) for (const media of [PORTRAIT, LANDSCAPE, SQUARE, PHOTO43]) {
    const frameW = 1080, frameH = 1080 / aspect;
    for (const cell of collageCells(layout, aspect, border)) {
      const at = cellPlacement(media, cell, aspect);
      const t = { ...DEFAULT_TRANSFORM, scale: at.scale, x: at.x, y: at.y };
      expect(clampCrop(at.crop)).toEqual(at.crop);
      expect(clampTransform(t)).toEqual(t);                 // scale ≥ 0.2, offsets inside ±1
      const box = placeClip(media, at.crop, t, frameW, frameH);
      const limited = at.crop.w === 0.1 || at.crop.h === 0.1;
      expect(box.centerX).toBeCloseTo((cell.x + cell.w / 2) * frameW, 2);
      expect(box.centerY).toBeCloseTo((cell.y + cell.h / 2) * frameH, 2);
      if (limited) { expect(box.width).toBeLessThanOrEqual(cell.w * frameW + 0.01); expect(box.height).toBeLessThanOrEqual(cell.h * frameH + 0.01); }
      else { expect(Math.abs(box.width - cell.w * frameW)).toBeLessThan(0.01); expect(Math.abs(box.height - cell.h * frameH)).toBeLessThan(0.01); }
    }
  }
});

test("cellPlacement is total: a picture without a size is treated as cell-shaped", () => {
  const cell = collageCells("sideBySide", 9 / 16, 0)[0];
  for (const bad of [{ width: 0, height: 100 }, { width: NaN, height: 100 }, { width: 100, height: -1 }]) expect(cellPlacement(bad, cell, 9 / 16)).toEqual({ crop: { x: 0, y: 0, w: 1, h: 1 }, scale: 0.5, x: -0.25, y: 0 });
});

describe("placeInCell / isCellInPlace", () => {
  const tag: CollageCell = { group: "g", layout: "sideBySide", cell: 0, border: 0, corner: 0, aspect: 9 / 16 };
  const base = { ...makePhotoClip({ id: "c", mask: "circle", transform: { scale: 2, x: 0.3, y: 0.3, rotation: 40, flipH: true, flipV: false } }), start: 3 };
  const placed = placeInCell(base, tag);

  test("placeInCell writes scale, offset, rotation 0, the crop and the tag — and keeps flips, the mask and everything else", () => {
    expect(placed).toEqual({ ...base, transform: { scale: 0.5, x: -0.25, y: 0, rotation: 0, flipH: true, flipV: false }, crop: { x: 0.25, y: 0, w: 0.5, h: 1 }, collage: tag });
    expect(placed.collage).not.toBe(tag);
    expect(base.transform.scale).toBe(2);                   // not mutated
  });

  test("in place: exactly what the layout gave, judged against the tag's own frame shape", () => {
    expect(isCellInPlace(placed)).toBe(true);
    expect(isCellInPlace({ ...placed, mask: "none", opacity: 0.4, filter: "warm" })).toBe(true);                                 // a look is not a move
    expect(isCellInPlace({ ...placed, transform: { ...placed.transform, flipV: true } })).toBe(true);                             // nor is a flip
    expect(isCellInPlace({ ...placed, transform: { ...placed.transform, x: placed.transform.x + 0.000004 } })).toBe(true);        // inside the tolerance
  });

  test("not in place: moved, resized, turned, re-cropped, keyframed, or no tag at all", () => {
    expect(isCellInPlace(base)).toBe(false);
    expect(isCellInPlace({ ...placed, transform: { ...placed.transform, x: -0.24 } })).toBe(false);
    expect(isCellInPlace({ ...placed, transform: { ...placed.transform, scale: 0.6 } })).toBe(false);
    expect(isCellInPlace({ ...placed, transform: { ...placed.transform, rotation: 90 } })).toBe(false);
    expect(isCellInPlace({ ...placed, crop: { x: 0.2, y: 0, w: 0.5, h: 1 } })).toBe(false);
    expect(isCellInPlace({ ...placed, keyframes: [makeKeyframe({ t: 0 })] })).toBe(false);
    expect(isCellInPlace({ ...placed, width: 1920, height: 1080 })).toBe(false);                                                  // another picture: its crop no longer fits
  });
});
```

- [ ] **Step 2: Run** `npx.cmd jest src/editor/model/__tests__/collage.test.ts` → FAIL (no module).
- [ ] **Step 3: Implement.** Create `src/editor/model/collage.ts`:

```ts
import { coverFactor, croppedSize, type Size } from "./clipLayout";
import { clampCrop, type Clip, type CollageCell, type CollageLayoutId, type CropRect } from "./types";

/**
 * Collage geometry (spec section 6). Pure maths, TypeScript only: a collage is ordinary layers, and all this file ever produces is a
 * layer's `transform`, `crop` and tag — what the preview and the export already draw. No Swift twin, and none is needed.
 * Cover comes from clipLayout (`coverFactor`): nothing here works out a cover or fit scale a second way.
 */
export interface CellRect { x: number; y: number; w: number; h: number }
export interface CellPlacement { crop: CropRect; scale: number; x: number; y: number }
/** Inset: where the small cell starts and how big it is (fractions of the frame, both directions). `inPlace`: how far a stored value may be from the layout's and still count as untouched. */
export const COLLAGE = { insetAt: 0.62, insetSize: 0.34, inPlace: 1e-5 } as const;

const HALF = 0.5;
const THIRD = 1 / 3;
const usable = (v: number): boolean => Number.isFinite(v) && v > 0;
/** 6 decimals, and never −0 (a test's `toEqual(0)` and a saved file both mean 0). */
const r6 = (v: number): number => Math.round(v * 1e6) / 1e6 + 0;
const cell = (x: number, y: number, w: number, h: number): CellRect => ({ x, y, w, h });

/** The layout's cells before the border. Big and two: the big cell on the left of a wide or square frame, on top of a tall one. */
function baseCells(layout: CollageLayoutId, aspect: number): CellRect[] {
  switch (layout) {
    case "sideBySide": return [cell(0, 0, HALF, 1), cell(HALF, 0, HALF, 1)];
    case "stacked": return [cell(0, 0, 1, HALF), cell(0, HALF, 1, HALF)];
    case "bigTwo": return aspect >= 1
      ? [cell(0, 0, HALF, 1), cell(HALF, 0, HALF, HALF), cell(HALF, HALF, HALF, HALF)]
      : [cell(0, 0, 1, HALF), cell(0, HALF, HALF, HALF), cell(HALF, HALF, HALF, HALF)];
    case "row3": return [cell(0, 0, THIRD, 1), cell(THIRD, 0, THIRD, 1), cell(2 * THIRD, 0, THIRD, 1)];
    case "grid4": return [cell(0, 0, HALF, HALF), cell(HALF, 0, HALF, HALF), cell(0, HALF, HALF, HALF), cell(HALF, HALF, HALF, HALF)];
    case "inset": return [cell(0, 0, 1, 1), cell(COLLAGE.insetAt, COLLAGE.insetAt, COLLAGE.insetSize, COLLAGE.insetSize)];
  }
}

/**
 * The layout's cells in a frame of `aspect` (width / height; unusable → square) with `border` — a fraction of the frame's SHORTER
 * side (not a number or below 0 → none) — at the frame's edges and between cells: the same pixels everywhere. Not rounded.
 */
export function collageCells(layout: CollageLayoutId, aspect: number, border: number): CellRect[] {
  const a = usable(aspect) ? aspect : 1;
  const b = Number.isFinite(border) ? Math.max(0, border) : 0;
  const gx = b * Math.min(1, 1 / a);
  const gy = b * Math.min(a, 1);
  return baseCells(layout, a).map((c) => cell(gx + c.x * (1 - gx), gy + c.y * (1 - gy), c.w * (1 - gx) - gx, c.h * (1 - gy) - gy));
}

/**
 * How a picture fills a cell: cropped (centred) to the cell's shape, then scaled so its box is the cell, centred on the cell.
 * `clampCrop` keeps at least a tenth of the picture; when that stops the crop, the picture is fitted INSIDE the cell. A picture
 * without a usable size counts as cell-shaped. Everything is rounded to 6 decimals.
 */
export function cellPlacement(media: Size, target: CellRect, aspect: number): CellPlacement {
  const a = usable(aspect) ? aspect : 1;
  const shape = (target.w * a) / target.h;                 // the cell's width / height in pixels (the frame is `a` wide, 1 high)
  const source: Size = usable(media.width) && usable(media.height) ? media : { width: shape, height: 1 };
  const s = source.width / source.height;
  const cw = s > shape ? shape / s : 1;
  const ch = s > shape ? 1 : s / shape;
  const size = clampCrop({ x: 0, y: 0, w: cw, h: ch });    // only its w / h: the crop limit; centred below, after the limit
  const crop: CropRect = { x: r6((1 - size.w) / 2), y: r6((1 - size.h) / 2), w: r6(size.w), h: r6(size.h) };
  const box = croppedSize(source, crop);
  const k = Math.min((target.w * a) / box.width, target.h / box.height);   // frame per picture, so the box is inside the cell
  return {
    crop,
    scale: r6(k / coverFactor(source, crop, 0, a, 1)),
    x: r6(target.x + target.w / 2 - 0.5),
    y: r6(target.y + target.h / 2 - 0.5),
  };
}

const placementOf = (clip: Clip, tag: CollageCell): CellPlacement =>
  cellPlacement({ width: clip.width, height: clip.height }, collageCells(tag.layout, tag.aspect, tag.border)[tag.cell], tag.aspect);

/** `clip` in the tag's cell: scale, offset and rotation 0 on its transform (flips kept), the crop, and its own copy of the tag. The mask and all else are kept. */
export function placeInCell<T extends Clip>(clip: T, tag: CollageCell): T {
  const at = placementOf(clip, tag);
  return { ...clip, transform: { ...clip.transform, scale: at.scale, x: at.x, y: at.y, rotation: 0 }, crop: at.crop, collage: { ...tag } };
}

/**
 * Whether a tagged layer still sits where its tag's layout put it: no keyframes, upright, and its crop, scale and offset within
 * `COLLAGE.inPlace` of the layout's — judged against the tag's OWN frame shape, so a collage stays "in place" after the project's
 * ratio changed. A cell the user moved, resized, turned or re-cropped is not, and the sliders then leave it alone.
 */
export function isCellInPlace(clip: Clip): boolean {
  const tag = clip.collage;
  if (!tag || clip.keyframes.length > 0 || clip.transform.rotation !== 0) return false;
  const at = placementOf(clip, tag);
  const near = (v: number, want: number): boolean => Math.abs(v - want) <= COLLAGE.inPlace;
  return near(clip.transform.scale, at.scale) && near(clip.transform.x, at.x) && near(clip.transform.y, at.y)
    && near(clip.crop.x, at.crop.x) && near(clip.crop.y, at.crop.y) && near(clip.crop.w, at.crop.w) && near(clip.crop.h, at.crop.h);
}
```

- [ ] **Step 4: Run** the suite, then `npx.cmd jest src/__tests__/noHexLiterals.test.ts`, `npm run typecheck`, `npm test`.
- [ ] **Step 5: Commit** — `feat(model): collage geometry — six layouts, a border in pixels of the shorter side, pictures that fill their cell through crop and scale`.

---

### Task 5: Collage ops — add, re-lay, re-fit after Replace (`collageOps.ts`)

**Depends on:** Task 4. **Parallel-safe with:** Tasks 2, 3, 6.

**Files:** Create `src/editor/model/collageOps.ts`, `src/editor/model/__tests__/collageOps.test.ts`.

**Do not touch:** `ops.ts` (Task 3 may be editing it — this task only *imports* `videoLayerOverlap` from it, and in its tests `replaceClipMedia` / `setClipTransform`), `collage.ts`, `types.ts`.

**Interfaces — Consumes:** `collageCells`-based `placeInCell`, `isCellInPlace` (Task 4); `videoLayerOverlap` (`ops.ts`, exists); `clipDuration`, `sourceAfter`, `totalDuration` (`timeline.ts`); `newLayer`, `frameAspect`, `COLLAGE_CELLS`, `COLLAGE_CORNERS`, `COLLAGE_LAYOUT_IDS`, `COLLAGE_LIMITS`, `CORNER_MASK`, `LAYER_LIMITS`, `PHOTO` (`types.ts`).

**Interfaces — Produces**

```ts
// src/editor/model/collageOps.ts
export type CollageRefusal = "empty" | "count" | "limit" | "videos" | "short" | "overlap";
/** How long a collage of these clips lasts when it starts at `start` (seconds, to the millisecond). */
export function collageLength(p: Project, clips: readonly Clip[], start: number): number;
/** Why these clips cannot become this collage at `start` (checked in the type's order), or null. Only the first `COLLAGE_CELLS[layout]` clips count. */
export function collageRefusal(p: Project, clips: readonly Clip[], layout: CollageLayoutId, start: number): CollageRefusal | null;
/** The first `COLLAGE_CELLS[layout]` clips as layers on top, in their cells, tagged with `group`. Same project when refused. */
export function addCollage(p: Project, clips: readonly Clip[], layout: CollageLayoutId, start: number, group: string): Project;
/** Re-lays the cells of `group` that are still in place, for the project's frame as it is now. Same project when nothing changes. */
export function relayCollage(p: Project, group: string, patch: Partial<Pick<CollageCell, "layout" | "border" | "corner">>): Project;
/** `after` = `replaceClipMedia(before, id, …)`: when the layer was a cell in place, its new picture is fitted to the cell. */
export function refitReplacedCell(before: Project, after: Project, id: string): Project;
/** A layer's collage tag, or null. */
export function collageOf(p: Project, id: string): CollageCell | null;
```

- [ ] **Step 1: Failing tests.** Create `src/editor/model/__tests__/collageOps.test.ts`:

```ts
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
import { addCollage, collageLength, collageOf, collageRefusal, refitReplacedCell, relayCollage } from "../collageOps";
import { replaceClipMedia, setClipTransform } from "../ops";
import { clipDuration } from "../timeline";
import { LAYER_LIMITS, makeClip, makeLayer, makePhotoClip, makeProject, type Clip, type LayerClip, type Project } from "../types";

const a = makeClip({ id: "a", sourceDuration: 6 });
const b = makeClip({ id: "b", sourceDuration: 4 });                    // the project is 10 s long, 9:16
const project = makeProject({ clips: [a, b] });
const photo = (id: string, width = 1080, height = 1920): Clip => makePhotoClip({ id, width, height });
const video = (id: string, seconds: number): Clip => makeClip({ id, sourceDuration: seconds });
const tag = (cell: number, extra: object = {}) => ({ group: "g", layout: "sideBySide", cell, border: 0, corner: 0, aspect: 9 / 16, ...extra });
/** x1 (portrait) and x2 (landscape) side by side from 2 s. */
const two = addCollage(project, [photo("x1"), photo("x2", 1920, 1080)], "sideBySide", 2, "g");
const cellOf = (p: Project, id: string): LayerClip => p.layers.find((l) => l.id === id)!;

test("addCollage: one layer per cell from the start, each filling its cell and tagged; only the layers change", () => {
  expect(two.layers.map((l) => l.id)).toEqual(["x1", "x2"]);
  expect(cellOf(two, "x1")).toEqual({ ...photo("x1"), start: 2, trimEnd: 3, transform: { scale: 0.5, x: -0.25, y: 0, rotation: 0, flipH: false, flipV: false }, crop: { x: 0.25, y: 0, w: 0.5, h: 1 }, collage: tag(0) });
  expect(cellOf(two, "x2")).toMatchObject({ start: 2, transform: { scale: 0.5, x: 0.25, y: 0 }, crop: { x: 0.420898, y: 0, w: 0.158203, h: 1 }, mask: "none", collage: tag(1) });
  expect(two.clips).toBe(project.clips);
  expect(two.effects).toBe(project.effects);
  expect(two.updatedAt).toBe("2026-10-01T10:00:00.000Z");
  // On top of the layers that were there, in cell order.
  const before = makeProject({ clips: [a, b], layers: [makeLayer({ id: "old", sourceDuration: 2, start: 0 })] });
  expect(addCollage(before, [photo("x1"), photo("x2")], "stacked", 2, "g").layers.map((l) => l.id)).toEqual(["old", "x1", "x2"]);
  // Whatever placement a picked clip carried is replaced by its cell's.
  const odd = { ...photo("x1"), mask: "circle" as const, crop: { x: 0, y: 0, w: 0.5, h: 0.5 }, transform: { scale: 3, x: 0.4, y: 0.4, rotation: 45, flipH: false, flipV: false } };
  expect(cellOf(addCollage(project, [odd, photo("x2")], "sideBySide", 2, "g"), "x1")).toEqual(cellOf(two, "x1"));
});

test("collageLength: the shortest video (3 s with photos only), cut to the time left, between 0.5 and 60 s, to the millisecond", () => {
  expect(collageLength(project, [photo("x"), photo("y")], 2)).toBe(3);
  expect(collageLength(project, [photo("x"), video("v", 5)], 2)).toBe(5);
  expect(collageLength(project, [video("v", 5), video("w", 2.5)], 2)).toBe(2.5);
  expect(collageLength(project, [photo("x"), photo("y")], 8.5)).toBe(1.5);        // 10 − 8.5 left
  expect(collageLength(project, [video("v", 5)], 8)).toBe(2);
  expect(collageLength(project, [photo("x")], 9.9)).toBe(0.5);                    // never under half a second
  expect(collageLength(project, [photo("x")], 12)).toBe(3);                       // past the end: nothing to cut to
  expect(collageLength(makeProject({ clips: [makeClip({ id: "long", sourceDuration: 200 })] }), [video("v", 90)], 0)).toBe(60);
  expect(collageLength(project, [video("v", 2.0004)], 0)).toBe(2);
});

test("every cell starts and ends together: photos take the length, a longer video is trimmed at its tail", () => {
  const next = addCollage(project, [video("v", 5), photo("x"), video("w", 2)], "row3", 1, "g");
  expect(next.layers.map((l) => [l.start, clipDuration(l)])).toEqual([[1, 2], [1, 2], [1, 2]]);
  expect(cellOf(next, "v")).toMatchObject({ trimStart: 0, trimEnd: 2, sourceDuration: 5 });
  expect(cellOf(next, "x").trimEnd).toBe(2);
});

test("collageRefusal, in this order: no clips, too few, no layer room, three videos, a video too short, a third video on screen", () => {
  const pair = [photo("x1"), photo("x2")];
  const full = makeProject({ clips: [a, b], layers: Array.from({ length: LAYER_LIMITS.max - 1 }, (_, i): LayerClip => ({ ...makePhotoClip({ id: `l${i}` }), start: 0 })) });
  const busy = makeProject({ clips: [a, b], layers: [makeLayer({ id: "o1", sourceDuration: 4, start: 1 }), makeLayer({ id: "o2", sourceDuration: 4, start: 1 })] });   // two videos, 1 – 5
  expect(collageRefusal(makeProject(), pair, "sideBySide", 0)).toBe("empty");
  expect(collageRefusal(project, pair, "sideBySide", NaN)).toBe("empty");
  expect(collageRefusal(project, [photo("x1")], "sideBySide", 0)).toBe("count");
  expect(collageRefusal(full, pair, "sideBySide", 0)).toBe("limit");
  expect(collageRefusal(project, [video("v1", 3), video("v2", 3), video("v3", 3)], "row3", 0)).toBe("videos");
  expect(collageRefusal(project, [video("v1", 0.2), photo("x")], "stacked", 0)).toBe("short");
  expect(collageRefusal(busy, [video("v1", 3), photo("x")], "stacked", 2)).toBe("overlap");
  expect(collageRefusal(busy, [video("v1", 3), photo("x")], "stacked", 5)).toBeNull();                    // after the two that were there
  expect(collageRefusal(busy, pair, "stacked", 2)).toBeNull();                                             // photos are never counted
  expect(collageRefusal(project, [photo("x1"), photo("x2"), photo("x3")], "sideBySide", 0)).toBeNull();    // more than needed: the first two count
  // addCollage refuses with the same project — no undo step.
  expect(addCollage(makeProject(), pair, "sideBySide", 0, "g").layers).toHaveLength(0);
  expect(addCollage(project, [photo("x1")], "sideBySide", 0, "g")).toBe(project);
  expect(addCollage(full, pair, "sideBySide", 0, "g")).toBe(full);
  expect(addCollage(busy, [video("v1", 3), photo("x")], "stacked", 2, "g")).toBe(busy);
  // An id that is taken, the same id twice, no group: refused too.
  expect(addCollage(project, [photo("a"), photo("x2")], "sideBySide", 0, "g")).toBe(project);
  expect(addCollage(project, [photo("x1"), photo("x1")], "sideBySide", 0, "g")).toBe(project);
  expect(addCollage(project, pair, "sideBySide", 0, "")).toBe(project);
  expect(addCollage(project, [photo("x1"), photo("x2"), photo("x3")], "sideBySide", 0, "g").layers.map((l) => l.id)).toEqual(["x1", "x2"]);
});

describe("relayCollage", () => {
  test("Border re-lays every cell and stores the border (clamped, 3 decimals); the main track is not touched", () => {
    const next = relayCollage(two, "g", { border: 0.04 });
    expect(cellOf(next, "x1")).toEqual({ ...cellOf(two, "x1"), transform: { ...cellOf(two, "x1").transform, scale: 0.44, x: -0.24 }, crop: { x: 0.269634, y: 0, w: 0.460733, h: 1 }, collage: tag(0, { border: 0.04 }) });
    expect(cellOf(next, "x2").collage).toEqual(tag(1, { border: 0.04 }));
    expect(cellOf(next, "x2").transform).toMatchObject({ scale: 0.44, x: 0.24, y: 0 });
    expect(next.clips).toBe(two.clips);
    expect(cellOf(relayCollage(two, "g", { border: 0.5 }), "x1").collage!.border).toBe(0.06);
    expect(cellOf(relayCollage(two, "g", { border: 0.0149999 }), "x1").collage!.border).toBe(0.015);
  });

  test("Corner writes the three masks; Border alone never touches a mask", () => {
    const round = relayCollage(two, "g", { corner: 2 });
    expect(round.layers.map((l) => l.mask)).toEqual(["circle", "circle"]);
    expect(round.layers.map((l) => l.collage!.corner)).toEqual([2, 2]);
    expect(relayCollage(round, "g", { corner: 1 }).layers.map((l) => l.mask)).toEqual(["rounded", "rounded"]);
    expect(relayCollage(round, "g", { corner: 0 }).layers.map((l) => l.mask)).toEqual(["none", "none"]);
    expect(relayCollage(round, "g", { border: 0.02 }).layers.map((l) => l.mask)).toEqual(["circle", "circle"]);
  });

  test("a layout with the same number of cells re-lays the cells into it; another number does nothing", () => {
    expect(cellOf(relayCollage(two, "g", { layout: "stacked" }), "x1")).toMatchObject({ transform: { scale: 0.5, x: 0, y: -0.25 }, crop: { x: 0, y: 0.25, w: 1, h: 0.5 }, collage: { layout: "stacked", cell: 0 } });
    expect(cellOf(relayCollage(two, "g", { layout: "inset" }), "x2")).toMatchObject({ transform: { scale: 0.34, x: 0.29, y: 0.29 }, collage: { layout: "inset", cell: 1 } });
    expect(relayCollage(two, "g", { layout: "grid4" })).toBe(two);
    expect(relayCollage(two, "g", { layout: "row3" })).toBe(two);
  });

  test("no change, another group or a value that cannot be used: the same project (no undo step)", () => {
    expect(relayCollage(two, "g", {})).toBe(two);
    expect(relayCollage(two, "g", { border: 0 })).toBe(two);
    expect(relayCollage(two, "g", { corner: 0 })).toBe(two);
    expect(relayCollage(two, "other", { border: 0.04 })).toBe(two);
    expect(relayCollage(two, "g", { border: NaN })).toBe(two);
    expect(relayCollage(two, "g", { corner: 5 as never })).toBe(two);
    expect(relayCollage(two, "g", { layout: "spiral" as never })).toBe(two);
  });

  test("a cell moved by hand is left exactly as it is, by every slider; the others still follow", () => {
    const moved = setClipTransform(two, "x1", { x: 0.1 });
    const next = relayCollage(moved, "g", { border: 0.04, corner: 1 });
    expect(cellOf(next, "x1")).toBe(cellOf(moved, "x1"));
    expect(cellOf(next, "x2")).toMatchObject({ mask: "rounded", transform: { scale: 0.44 }, collage: { border: 0.04, corner: 1 } });
  });

  test("after the project's shape changed the cells still count as in place, and a re-lay fits them to the new shape", () => {
    const square: Project = { ...two, aspectRatio: "1:1" };
    expect(square.layers).toBe(two.layers);                                 // changing the ratio moved nothing
    const next = relayCollage(square, "g", {});
    expect(cellOf(next, "x1")).toMatchObject({ transform: { scale: 0.5, x: -0.25, y: 0 }, crop: { x: 0.055556, y: 0, w: 0.888889, h: 1 }, collage: { aspect: 1 } });
    expect(relayCollage(next, "g", {})).toBe(next);
  });
});

test("refitReplacedCell: a new picture in a cell that was in place is fitted to the cell; a cell moved by hand, a plain layer and a refused swap are left as they are", () => {
  const media = { sourceUri: "file:///new.jpg", sourceDuration: 60, width: 1920, height: 1080, kind: "photo" as const };
  const swapped = replaceClipMedia(two, "x1", media);
  expect(cellOf(swapped, "x1").crop).toEqual({ x: 0.25, y: 0, w: 0.5, h: 1 });                  // the old picture's crop: the wrong shape for the new one
  const fitted = refitReplacedCell(two, swapped, "x1");
  expect(cellOf(fitted, "x1")).toMatchObject({ sourceUri: "file:///new.jpg", width: 1920, height: 1080, transform: { scale: 0.5, x: -0.25, y: 0 }, crop: { x: 0.420898, y: 0, w: 0.158203, h: 1 }, collage: tag(0) });
  expect(cellOf(fitted, "x2")).toBe(cellOf(two, "x2"));
  const moved = setClipTransform(two, "x1", { x: 0.1 });
  const movedSwap = replaceClipMedia(moved, "x1", media);
  expect(refitReplacedCell(moved, movedSwap, "x1")).toBe(movedSwap);
  expect(refitReplacedCell(two, two, "x1")).toBe(two);
  const plain = makeProject({ clips: [a, b], layers: [{ ...photo("l"), start: 0 }] });
  const plainSwap = replaceClipMedia(plain, "l", media);
  expect(refitReplacedCell(plain, plainSwap, "l")).toBe(plainSwap);
  expect(refitReplacedCell(two, swapped, "a")).toBe(swapped);
});

test("collageOf: a layer's tag, or null", () => {
  expect(collageOf(two, "x2")).toEqual(tag(1));
  expect(collageOf(two, "a")).toBeNull();
  expect(collageOf(two, "gone")).toBeNull();
});
```

- [ ] **Step 2: Run** `npx.cmd jest src/editor/model/__tests__/collageOps.test.ts` → FAIL (no module).
- [ ] **Step 3: Implement.** Create `src/editor/model/collageOps.ts`:

```ts
import { nowIso } from "@/src/lib/clock";
import { isCellInPlace, placeInCell } from "./collage";
import { videoLayerOverlap } from "./ops";
import { clipDuration, sourceAfter, totalDuration } from "./timeline";
import {
  clampNum, COLLAGE_CELLS, COLLAGE_CORNERS, COLLAGE_LAYOUT_IDS, COLLAGE_LIMITS, CORNER_MASK, DEFAULT_TRANSFORM, frameAspect, FULL_CROP, isPhoto, LAYER_LIMITS, newLayer, PHOTO,
  type Clip, type CollageCell, type CollageLayoutId, type LayerClip, type Project,
} from "./types";

// A collage is ordinary layers that carry a tag (`Clip.collage`). These are the only functions that write the tag; the geometry is
// collage.ts. They only ever change `layers` — like every layer op, so no main-track rule runs — and they never run on their own:
// each is called from a tap or a drag.

/** Why clips cannot become a collage, in the order the checks run. */
export type CollageRefusal = "empty" | "count" | "limit" | "videos" | "short" | "overlap";

const r3 = (v: number): number => Math.round(v * 1000) / 1000;
/** Only the layers change (the main track's rules have nothing to re-check). */
const stamp = (p: Project, layers: LayerClip[]): Project => ({ ...p, layers, updatedAt: nowIso() });

/**
 * How long a collage of `clips` lasts from `start`: the shortest video among them (the default photo length without one), cut to
 * what is left of the project after `start` (nothing to cut to at or past its end), kept between a photo's shortest and longest
 * length, to the millisecond.
 */
export function collageLength(p: Project, clips: readonly Clip[], start: number): number {
  const videos = clips.filter((c) => !isPhoto(c)).map((c) => clipDuration(c));
  const natural = videos.length > 0 ? Math.min(...videos) : PHOTO.defaultSeconds;
  const room = totalDuration(p) - start;
  return r3(clampNum(room > 0 ? Math.min(natural, room) : natural, PHOTO.minSeconds, PHOTO.maxSeconds));
}

/** The first cells' worth of `clips` as layers from `start`: timed together, placed in their cells (border 0, square), tagged. */
function collageLayers(p: Project, clips: readonly Clip[], layout: CollageLayoutId, start: number, group: string): LayerClip[] {
  const used = clips.slice(0, COLLAGE_CELLS[layout]);
  const aspect = frameAspect(p);
  const length = collageLength(p, used, start);
  return used.map((c, i) => {
    // A photo lasts the collage's length; a video longer than it is cut at its tail (by timeline.ts: no speed arithmetic here).
    const trimEnd = isPhoto(c) ? length : Math.min(c.trimEnd, sourceAfter(c, c.trimStart, length));
    const layer = newLayer({ ...c, trimStart: isPhoto(c) ? 0 : c.trimStart, trimEnd, transform: { ...DEFAULT_TRANSFORM }, crop: { ...FULL_CROP }, mask: "none" }, start);
    return placeInCell(layer, { group, layout, cell: i, border: 0, corner: 0, aspect });
  });
}

/**
 * Why the first `COLLAGE_CELLS[layout]` of `clips` cannot become this collage at `start`, or null: a project without main clips (or
 * a start that is not a number), too few clips, not enough free layers, more videos than may play at once, a video too short to be a
 * layer, or a video too many on screen together with the layers that are already there.
 */
export function collageRefusal(p: Project, clips: readonly Clip[], layout: CollageLayoutId, start: number): CollageRefusal | null {
  const n = COLLAGE_CELLS[layout];
  if (p.clips.length === 0 || !Number.isFinite(start)) return "empty";
  if (clips.length < n) return "count";
  if (p.layers.length + n > LAYER_LIMITS.max) return "limit";
  const videos = clips.slice(0, n).filter((c) => !isPhoto(c));
  if (videos.length > LAYER_LIMITS.maxVideoAtOnce) return "videos";
  if (videos.some((c) => clipDuration(c) < LAYER_LIMITS.minDuration - 1e-9)) return "short";
  if (videoLayerOverlap([...p.layers, ...collageLayers(p, clips, layout, start, "probe")]) > LAYER_LIMITS.maxVideoAtOnce) return "overlap";
  return null;
}

/**
 * Puts the first `COLLAGE_CELLS[layout]` of `clips` on top as layers from `start`, each filling its cell of the layout, all tagged
 * with `group`. Same project (no undo step) when `collageRefusal` refuses, `group` is empty, or an id is already used.
 */
export function addCollage(p: Project, clips: readonly Clip[], layout: CollageLayoutId, start: number, group: string): Project {
  if (group.length === 0 || collageRefusal(p, clips, layout, start) !== null) return p;
  const used = clips.slice(0, COLLAGE_CELLS[layout]);
  const taken = new Set([...p.clips, ...p.layers].map((c) => c.id));
  if (used.some((c) => taken.has(c.id)) || new Set(used.map((c) => c.id)).size !== used.length) return p;
  return stamp(p, [...p.layers, ...collageLayers(p, used, layout, start, group)]);
}

/**
 * The Border / Corner sliders, the layout tiles and "Fit to frame": every cell of `group` that is still in its place
 * (`isCellInPlace`) is laid out again with the patch, for the project's frame AS IT IS NOW. A cell the user moved is left exactly
 * as it is. A layout with another number of cells is not a re-lay and changes nothing. The mask is written only when the patch
 * names a corner. Same project when nothing changes or a value cannot be used.
 */
export function relayCollage(p: Project, group: string, patch: Partial<Pick<CollageCell, "layout" | "border" | "corner">>): Project {
  if (patch.layout !== undefined && !(COLLAGE_LAYOUT_IDS as readonly string[]).includes(patch.layout)) return p;
  if (patch.border !== undefined && !Number.isFinite(patch.border)) return p;
  if (patch.corner !== undefined && !(COLLAGE_CORNERS as readonly number[]).includes(patch.corner)) return p;
  const aspect = frameAspect(p);
  let changed = false;
  const layers = p.layers.map((l) => {
    const tag = l.collage;
    if (!tag || tag.group !== group || !isCellInPlace(l)) return l;
    const layout = patch.layout ?? tag.layout;
    if (COLLAGE_CELLS[layout] !== COLLAGE_CELLS[tag.layout]) return l;
    const border = patch.border === undefined ? tag.border : r3(clampNum(patch.border, COLLAGE_LIMITS.border[0], COLLAGE_LIMITS.border[1]));
    const corner = patch.corner ?? tag.corner;
    const placed = placeInCell(l, { ...tag, layout, border, corner, aspect });
    const next: LayerClip = patch.corner === undefined ? placed : { ...placed, mask: CORNER_MASK[corner] };
    if (JSON.stringify(next) === JSON.stringify(l)) return l;
    changed = true;
    return next;
  });
  return changed ? stamp(p, layers) : p;
}

/**
 * After Replace (`after` = `replaceClipMedia(before, id, …)`): when the layer was a collage cell in its place, the new picture is
 * fitted to that cell (its crop was the old picture's). Otherwise — a refused swap, a plain layer, a cell the user moved, a main
 * clip — `after` is returned as it is.
 */
export function refitReplacedCell(before: Project, after: Project, id: string): Project {
  if (after === before) return after;
  const was = before.layers.find((l) => l.id === id);
  const j = after.layers.findIndex((l) => l.id === id);
  if (!was || j < 0 || !was.collage || !isCellInPlace(was)) return after;
  const layers = after.layers.slice();
  layers[j] = placeInCell(after.layers[j], was.collage);
  return { ...after, layers };
}

/** The collage tag of the layer with this id; null for a main clip, a plain layer or no item. */
export const collageOf = (p: Project, id: string): CollageCell | null => p.layers.find((l) => l.id === id)?.collage ?? null;
```

- [ ] **Step 4: Run** the suite, then `npm run typecheck` and `npm test`.
- [ ] **Step 5: Commit** — `feat(model): collage ops — add a collage as tagged layers, re-lay the cells still in place, re-fit a replaced picture`.

---

### Task 6: The Motion strip; the Combo tab for photos

**Depends on:** Task 3 (the ops) and Task 1. **Parallel-safe with:** Tasks 2, 4, 5, 7.

**Files:** Create `src/editor/components/PhotoMotionSheet.tsx`, `src/editor/__tests__/PhotoMotionSheet.test.tsx`. Modify `src/editor/components/ClipAnimationSheet.tsx` (one import, three lines), `src/editor/__tests__/ClipAnimationSheet.test.tsx` (append; add `makePhotoClip` to its `types` import).

**Do not touch:** `AnimationTiles.tsx`, `EditorToolbar.tsx` (Task 8 mounts the strip), `toolStrip.ts`, `src/ui/*`.

**Interfaces — Consumes:** `setPhotoMotion`, `setMotionForAllPhotos` (Task 3); `shownPhotoMotion`, `COMBO_AS_MOTION`, `PHOTO_MOTION_IDS`, `PHOTO_MOTION_LIMITS`, `isPhoto` (Task 1); `PHOTO_MOTIONS` (Task 1, `photoTools.ts`); the kit's `ToolStrip`, `StripTiles`, `StripSlider`, `tilesStartXIn`, `Tile`, `TILE_WIDTH`, `Slider`.

**Interfaces — Produces**

```tsx
// src/editor/components/PhotoMotionSheet.tsx
export function PhotoMotionSheet(props: { clipId: string | null; visible: boolean; onClose: () => void }): React.ReactElement | null;
```

- [ ] **Step 1: Failing tests.** Create `src/editor/__tests__/PhotoMotionSheet.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
jest.mock("@react-native-community/slider", () => { const { View } = require("react-native"); return ({ testID, disabled, value, minimumValue, maximumValue, step, onSlidingStart, onValueChange }: { testID?: string; disabled?: boolean; value?: number; minimumValue?: number; maximumValue?: number; step?: number; onSlidingStart?: () => void; onValueChange?: (v: number) => void }) => <View testID={testID} {...{ disabled, value, minimumValue, maximumValue, step }} onTouchStart={() => onSlidingStart?.()} onTouchMove={(e: unknown) => onValueChange?.((e as { v?: number })?.v ?? 0.8)} />; });
import { makeClip, makePhotoClip, makeProject, PHOTO_MOTION_IDS, type Clip } from "@/src/editor/model/types";
import { PHOTO_MOTIONS } from "@/src/editor/photoTools";
import { useEditorStore } from "@/src/editor/store";
import { PhotoMotionSheet } from "../components/PhotoMotionSheet";

const st = () => useEditorStore.getState();
const clip = (id: string): Clip => [...st().project!.clips, ...st().project!.layers].find((c) => c.id === id)!;
const past = () => st().past.length;
const tile = (name: string) => screen.getByRole("button", { name });
const press = (name: string) => fireEvent.press(tile(name));
const slider = () => screen.getByTestId("motion-strength");
const open = (id: string) => render(<PhotoMotionSheet clipId={id} visible onClose={() => {}} />);

beforeEach(() => {
  st().reset();
  st().setProject(makeProject({
    clips: [makePhotoClip({ id: "p" }), makePhotoClip({ id: "q" }), makeClip({ id: "v", sourceDuration: 4 }), makePhotoClip({ id: "old", animation: { in: null, out: null, combo: "panLeft" } })],
    layers: [{ ...makePhotoClip({ id: "L" }), start: 0 }],
  }));
});

test("titled Motion: None is ringed, the seven motions follow in order, Strength is off at 50 %", async () => {
  await open("p");
  expect(screen.getByText("Motion")).toBeTruthy();
  const labels = screen.getAllByRole("button").map((b) => b.props.accessibilityLabel as string).filter((l) => l !== "Done" && l !== "Apply to all photos");
  expect(labels).toEqual(["None", "Zoom in", "Zoom out", "Pan left", "Pan right", "Pan up", "Pan down", "Corner zoom"]);
  expect(tile("None")).toBeSelected();
  for (const id of PHOTO_MOTION_IDS) expect(tile(PHOTO_MOTIONS[id].label)).not.toBeSelected();
  expect(slider().props).toMatchObject({ disabled: true, minimumValue: 0, maximumValue: 1, step: 0.05, value: 0.5 });
  expect(screen.getByText("Strength 50 %")).toBeTruthy();
});

test("a tile sets the motion in one undo step; the ringed tile again does nothing; None removes it", async () => {
  await open("p");
  await press("Zoom in");
  expect(clip("p").motion).toEqual({ id: "zoomIn", strength: 0.5 });
  expect(past()).toBe(1);
  expect(tile("Zoom in")).toBeSelected();
  expect(tile("None")).not.toBeSelected();
  expect(slider().props.disabled).toBe(false);
  await press("Zoom in");
  expect(past()).toBe(1);
  await press("None");
  expect("motion" in clip("p")).toBe(false);
  expect(past()).toBe(2);
  expect(clip("q")).toEqual(makePhotoClip({ id: "q" }));              // nothing else moved
});

test("Strength is one undo step per drag, and another tile keeps it", async () => {
  await open("p");
  await press("Pan up");
  const before = past();
  await fireEvent(slider(), "touchStart");
  await fireEvent(slider(), "touchMove", { v: 0.8 });
  await fireEvent(slider(), "touchMove", { v: 0.25 });
  expect(clip("p").motion).toEqual({ id: "panUp", strength: 0.25 });
  expect(past()).toBe(before + 1);
  expect(screen.getByText("Strength 25 %")).toBeTruthy();
  await press("Zoom out");
  expect(clip("p").motion).toEqual({ id: "zoomOut", strength: 0.25 });
});

test("a photo with an older zoom / pan Combo: its twin tile is ringed and tapping it changes nothing; a drag or another tile takes the Combo's place", async () => {
  await open("old");
  expect(tile("Pan left")).toBeSelected();
  expect(screen.getByText("Strength 50 %")).toBeTruthy();
  expect(slider().props.disabled).toBe(false);
  await press("Pan left");
  expect(past()).toBe(0);
  expect(clip("old").animation.combo).toBe("panLeft");                // still the Combo, exactly as it was
  await fireEvent(slider(), "touchStart");
  await fireEvent(slider(), "touchMove", { v: 0.8 });
  expect(clip("old")).toMatchObject({ motion: { id: "panLeft", strength: 0.8 }, animation: { combo: null } });
  expect(tile("Pan left")).toBeSelected();
});

test("None clears an older zoom / pan Combo too", async () => {
  await open("old");
  await press("None");
  expect(clip("old").animation.combo).toBeNull();
  expect("motion" in clip("old")).toBe(false);
  expect(tile("None")).toBeSelected();
});

test("Apply to all photos: every main-track photo gets the motion shown, in one undo step; videos and layers do not", async () => {
  await open("p");
  await press("Corner zoom");
  await press("Apply to all photos");
  for (const id of ["p", "q", "old"]) expect(clip(id).motion).toEqual({ id: "zoomCorner", strength: 0.5 });
  expect("motion" in clip("v")).toBe(false);
  expect("motion" in clip("L")).toBe(false);
  expect(past()).toBe(2);
});

test("a photo layer: the same tiles, no Apply to all photos", async () => {
  await open("L");
  expect(screen.queryByRole("button", { name: "Apply to all photos" })).toBeNull();
  await press("Pan down");
  expect(clip("L").motion).toEqual({ id: "panDown", strength: 0.5 });
});

test("renders nothing for a video, for no clip and while hidden", async () => {
  const view = await open("v");
  expect(screen.queryByText("Motion")).toBeNull();
  await view.rerender(<PhotoMotionSheet clipId={null} visible onClose={() => {}} />);
  expect(screen.queryByText("Motion")).toBeNull();
  await view.rerender(<PhotoMotionSheet clipId="p" visible={false} onClose={() => {}} />);
  expect(screen.queryByText("Motion")).toBeNull();
});
```

Append to `src/editor/__tests__/ClipAnimationSheet.test.tsx`:

```tsx
describe("a photo: zoom and pan live in the Motion tool", () => {
  const rowLabels = () => screen.getAllByRole("button").map((b) => b.props.accessibilityLabel as string).filter((l) => !["In", "Out", "Combo", "Done", "Apply to all clips"].includes(l));

  test("the Combo tab lists None, Sway and Pulse for a photo; a video still sees all six", async () => {
    useEditorStore.getState().setProject(makeProject({ clips: [makePhotoClip({ id: "p" }), makeClip({ id: "a", sourceDuration: 4 })] }));
    const view = await render(<ClipAnimationSheet clipId="p" visible onClose={() => {}} />);
    await press("Combo");
    expect(rowLabels()).toEqual(["None", "Sway", "Pulse"]);
    await view.rerender(<ClipAnimationSheet clipId="a" visible onClose={() => {}} />);
    expect(rowLabels()).toEqual(["None", ...ANIM_COMBO_IDS.map((id) => ANIM_COMBO[id].label)]);
  });

  test("a photo that already has a zoom / pan Combo keeps that tile, ringed, until it is removed", async () => {
    useEditorStore.getState().setProject(makeProject({ clips: [makePhotoClip({ id: "p", animation: { in: null, out: null, combo: "zoomOutSlow" } })] }));
    await render(<ClipAnimationSheet clipId="p" visible onClose={() => {}} />);
    await press("Combo");
    expect(rowLabels()).toEqual(["None", "Slow zoom out", "Sway", "Pulse"]);
    expect(tile("Slow zoom out")).toBeSelected();
    await press("None");
    expect(anim().combo).toBeNull();
    expect(rowLabels()).toEqual(["None", "Sway", "Pulse"]);
  });

  test("picking a Combo on a photo removes its Motion (one undo step)", async () => {
    useEditorStore.getState().setProject(makeProject({ clips: [{ ...makePhotoClip({ id: "p" }), motion: { id: "zoomIn", strength: 0.5 } }] }));
    await render(<ClipAnimationSheet clipId="p" visible onClose={() => {}} />);
    await press("Combo");
    await press("Sway");
    expect(anim().combo).toBe("sway");
    expect("motion" in useEditorStore.getState().project!.clips[0]).toBe(false);
    expect(past()).toBe(1);
  });
});
```

- [ ] **Step 2: Run** `npx.cmd jest src/editor/__tests__/PhotoMotionSheet.test.tsx src/editor/__tests__/ClipAnimationSheet.test.tsx` → the new tests FAIL.
- [ ] **Step 3: Implement.**

Create `src/editor/components/PhotoMotionSheet.tsx`:

```tsx
import { useMemo } from "react";
import { useWindowDimensions } from "react-native";
import { setMotionForAllPhotos, setPhotoMotion } from "@/src/editor/model/ops";
import { isPhoto, PHOTO_MOTION_IDS, PHOTO_MOTION_LIMITS, shownPhotoMotion, type PhotoMotionId } from "@/src/editor/model/types";
import { PHOTO_MOTIONS } from "@/src/editor/photoTools";
import { useEditorStore } from "@/src/editor/store";
import { useIsLayer, useItemClip } from "@/src/editor/useItem";
import { haptic } from "@/src/ui/haptics";
import { Slider } from "@/src/ui/Slider";
import { Tile, TILE_WIDTH } from "@/src/ui/Tile";
import { StripSlider, StripTiles, ToolStrip, tilesStartXIn } from "@/src/ui/ToolStrip";

/**
 * A photo's Motion: None or one of seven slow moves over its whole length, and how strong. What is ringed is `shownPhotoMotion` —
 * the motion that plays, or the twin of an older zoom / pan Combo (tapping that ringed tile leaves the Combo exactly as it is; a
 * Strength drag or another tile replaces it, in the op). A tile is one undo step, a Strength drag one, Apply to all photos one.
 */
export function PhotoMotionSheet({ clipId, visible, onClose }: { clipId: string | null; visible: boolean; onClose: () => void }) {
  const clip = useItemClip(clipId);
  const layer = useIsLayer(clipId);
  const { apply, beginTransaction, applyTransient } = useEditorStore.getState();
  const { width: windowW } = useWindowDimensions();
  const shown = clip && isPhoto(clip) ? shownPhotoMotion(clip) : null;
  // Where the row starts: the ringed tile in view (None is tile 0). Worked out when the strip opens (and for another photo) — NOT on
  // every pick: a ScrollView applies a changed contentOffset at once, and the row must not move under the finger.
  const startX = useMemo(
    () => tilesStartXIn(shown ? PHOTO_MOTION_IDS.indexOf(shown.id) + 1 : 0, TILE_WIDTH, PHOTO_MOTION_IDS.length + 1, windowW),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visible, clip?.id, windowW],
  );
  if (!clip || !isPhoto(clip)) return null;
  const strength = shown?.strength ?? PHOTO_MOTION_LIMITS.defaultStrength;

  const pick = (id: PhotoMotionId | null) => {
    if ((shown?.id ?? null) === id) return;   // already ringed: no buzz, no undo step (and an older Combo stays what it is)
    haptic("light");
    apply((p) => setPhotoMotion(p, clip.id, id === null ? null : { id, strength }));
  };

  return (
    <ToolStrip visible={visible} onClose={onClose} title="Motion"
      // "Apply to all photos" writes the main track's photos: it is not offered for a layer.
      action={layer ? undefined : { label: "Apply to all photos", onPress: () => { haptic("light"); apply((p) => setMotionForAllPhotos(p, shown)); } }}>
      <StripTiles initialX={startX}>
        <Tile label="None" icon="ban-outline" selected={shown === null} onPress={() => pick(null)} />
        {PHOTO_MOTION_IDS.map((id) => <Tile key={id} label={PHOTO_MOTIONS[id].label} icon={PHOTO_MOTIONS[id].icon} selected={shown?.id === id} onPress={() => pick(id)} />)}
      </StripTiles>
      <StripSlider label="Strength" value={`${Math.round(strength * 100)} %`}>
        <Slider
          testID="motion-strength"
          minimumValue={PHOTO_MOTION_LIMITS.strength[0]} maximumValue={PHOTO_MOTION_LIMITS.strength[1]} step={0.05}
          value={strength}
          disabled={!shown}
          detents={[PHOTO_MOTION_LIMITS.defaultStrength]}
          onSlidingStart={beginTransaction}
          onValueChange={(v) => { if (shown) applyTransient((p) => setPhotoMotion(p, clip.id, { id: shown.id, strength: v })); }}
        />
      </StripSlider>
    </ToolStrip>
  );
}
```

`src/editor/components/ClipAnimationSheet.tsx`:

- the `types` import gains `COMBO_AS_MOTION` and `isPhoto`;
- after `const edge = tab === "combo" ? null : anim[tab];` add

```tsx
  // A photo's zoom and pan live in the Motion tool: its Combo row leaves those four out — unless the photo still holds one (an older
  // project), so it can be seen here and removed.
  const comboIds = isPhoto(clip) ? ANIM_COMBO_IDS.filter((id) => COMBO_AS_MOTION[id] === undefined || id === anim.combo) : ANIM_COMBO_IDS;
```

- in the JSX, `animationStartX(ANIM_COMBO_IDS, anim.combo)` becomes `animationStartX(comboIds, anim.combo)` and `<AnimationTiles ids={ANIM_COMBO_IDS} registry={ANIM_COMBO} …` becomes `<AnimationTiles ids={comboIds} registry={ANIM_COMBO} …`. Nothing else changes (the ops already keep a Motion and a Combo apart).

- [ ] **Step 4: Run** the two suites, `npx.cmd jest src/__tests__` (the guards: no hex literal, spacing from the scale, the kit slider), `npm run typecheck`, `npm test`.
- [ ] **Step 5: Commit** — `feat(editor): the Motion strip for photos — eight tiles, Strength, Apply to all photos; the Combo tab leaves zoom and pan to it`.

---

### Task 7: The Collage panel; picking (`makeCollage`); Replace re-fits a cell

**Depends on:** Task 5. **Parallel-safe with:** Tasks 2, 6.

**Files:** Create `src/editor/components/CollageSheet.tsx`, `src/editor/__tests__/CollageSheet.test.tsx`. Modify `src/editor/useClipMedia.ts`, `src/projects/pickMedia.ts`, `src/editor/__tests__/useClipMedia.test.tsx` (append; imports), `src/projects/__tests__/pickMedia.test.ts` (append one test).

**Do not touch:** `EditorToolbar.tsx`, `toolbarContext.ts` (Task 8), `toolStrip.ts` (only `rekeyStrip` is imported from it), `src/projects/storage.ts`, `src/ui/*`.

**Interfaces — Consumes:** `addCollage`, `collageRefusal`, `relayCollage`, `refitReplacedCell`, `type CollageRefusal` (Task 5); `collageCells` (Task 4); `COLLAGE_CELLS`, `COLLAGE_LAYOUT_IDS`, `COLLAGE_LIMITS`, `frameAspect`, `newPhotoClip`, `newVideoClip`, `type CollageCorner`, `type CollageLayoutId` (Task 1); `COLLAGE_LAYOUTS`, `CORNER_LABELS` (Task 1); `rekeyStrip` (`toolStrip.ts`, exists); the kit's `ToolPanel`, `StripTiles`, `StripSlider`, `Tile`, `Slider`.

**Interfaces — Produces**

```ts
// src/projects/pickMedia.ts
export async function pickMedia(opts?: { multiple?: boolean; limit?: number }): Promise<PickedAsset[] | null>;   // `limit`: at most that many, in the order tapped
// src/editor/useClipMedia.ts — the hook's result gains:
makeCollage(layout: CollageLayoutId): Promise<void>;
// src/editor/components/CollageSheet.tsx
export function CollageSheet(props: { clipId: string | null; visible: boolean; onClose: () => void }): React.ReactElement;
```

- [ ] **Step 1: Failing tests.**

Append to `src/projects/__tests__/pickMedia.test.ts`:

```ts
test("a limit asks for at most that many items, in the order they are tapped; without one nothing changes", async () => {
  launch.mockResolvedValue({ canceled: true, assets: null });
  await pickMedia({ limit: 3 });
  expect(launch).toHaveBeenCalledWith(expect.objectContaining({ mediaTypes: ["images", "videos"], allowsMultipleSelection: true, selectionLimit: 3, orderedSelection: true, quality: 1 }));
  launch.mockClear();
  await pickMedia();
  expect(launch.mock.calls[0][0].selectionLimit).toBe(20);
  expect(launch.mock.calls[0][0].orderedSelection).toBeUndefined();
});
```

Append to `src/editor/__tests__/useClipMedia.test.tsx` (add `addCollage` from `@/src/editor/model/collageOps` and `type CollageLayoutId` from the `types` import):

```tsx
describe("makeCollage", () => {
  const state = () => useEditorStore.getState();
  const shot = (n: number) => ({ uri: `file:///p${n}.jpg`, kind: "photo", durationSec: 0, width: 1080, height: 1920 });
  const film = (n: number, seconds = 3) => ({ uri: `file:///v${n}.mov`, kind: "video", durationSec: seconds, width: 1920, height: 1080 });
  const run = async (layout: CollageLayoutId) => {
    const { result } = await renderHook(() => useClipMedia());
    await act(async () => { await result.current.makeCollage(layout); });
  };

  test("adds one layer per cell at the playhead captured at press time, in one undo step, and selects the first cell", async () => {
    state().seek(1);
    pick.mockImplementationOnce(async () => { state().seek(3); return [shot(1), shot(2)]; });
    importMedia.mockResolvedValueOnce({ clips: [makePhotoClip({ id: "n1" }), makePhotoClip({ id: "n2" })], failed: 0 });
    await run("sideBySide");
    expect(pick).toHaveBeenCalledWith({ limit: 2 });
    expect(state().project!.layers.map((l) => [l.id, l.start, l.collage?.cell, l.collage?.layout])).toEqual([["n1", 1, 0, "sideBySide"], ["n2", 1, 1, "sideBySide"]]);
    expect(new Set(state().project!.layers.map((l) => l.collage!.group)).size).toBe(1);
    expect(state().project!.layers[0].collage!.group.length).toBeGreaterThan(0);
    expect(state().past).toHaveLength(1);
    expect(state().selectedClipId).toBe("n1");
    expect(useToast.getState().message).toBeNull();
  });

  test("refused before the picker opens when the layout needs more layers than are free", async () => {
    state().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 4 })], layers: Array.from({ length: 6 }, (_, i) => ({ ...makePhotoClip({ id: `l${i}` }), start: 0 })) }));
    await run("grid4");
    expect(pick).not.toHaveBeenCalled();
    expect(useToast.getState().message).toBe("Not enough room: this layout adds 4 layers and there is room for 2.");
  });

  test("refused before anything is copied: too few picked, three videos, a third video on screen", async () => {
    pick.mockResolvedValueOnce([shot(1), shot(2)]);
    await run("row3");
    expect(useToast.getState().message).toBe("This layout needs 3 photos or videos — you picked 2.");
    pick.mockResolvedValueOnce([film(1), film(2), film(3)]);
    await run("row3");
    expect(useToast.getState().message).toBe("A collage can hold 2 videos at most. Pick photos for the other cells.");
    state().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 4 })], layers: [makeLayer({ id: "o1", sourceDuration: 3 }), makeLayer({ id: "o2", sourceDuration: 3 })] }));
    pick.mockResolvedValueOnce([film(1), shot(2)]);
    await run("stacked");
    expect(useToast.getState().message).toBe("Only two video layers can play at the same time.");
    expect(importMedia).not.toHaveBeenCalled();
    expect(state().past).toHaveLength(0);
  });

  test("a cancelled pick, a partly failed import and a project closed meanwhile add nothing", async () => {
    pick.mockResolvedValueOnce(null);
    await run("sideBySide");
    expect(useToast.getState().message).toBeNull();
    pick.mockResolvedValueOnce([shot(1), shot(2)]);
    importMedia.mockResolvedValueOnce({ clips: [makePhotoClip({ id: "n1" })], failed: 1 });
    await run("sideBySide");
    expect(useToast.getState().message).toBe("Couldn't add those items.");
    expect(state().project!.layers).toHaveLength(0);
    useToast.getState().clear();
    pick.mockResolvedValueOnce([shot(1), shot(2)]);
    importMedia.mockImplementationOnce(async () => { state().reset(); return { clips: [], failed: 2 }; });
    await run("sideBySide");
    expect(useToast.getState().message).toBeNull();
  });

  test("more picked than the layout has cells: only the first ones are imported and used", async () => {
    pick.mockResolvedValueOnce([shot(1), shot(2), shot(3)]);
    importMedia.mockResolvedValueOnce({ clips: [makePhotoClip({ id: "n1" }), makePhotoClip({ id: "n2" })], failed: 0 });
    await run("stacked");
    expect(importMedia).toHaveBeenCalledWith("p1", [shot(1), shot(2)]);
    expect(state().project!.layers.map((l) => l.id)).toEqual(["n1", "n2"]);
  });

  test("an empty project: nothing happens, the picker does not open", async () => {
    state().setProject(makeProject());
    await run("sideBySide");
    expect(pick).not.toHaveBeenCalled();
  });
});

test("Replace on a collage cell that is in its place fits the new picture to the cell, in the same undo step", async () => {
  const base = makeProject({ clips: [makeClip({ id: "a", sourceDuration: 10 })] });
  useEditorStore.getState().setProject(addCollage(base, [makePhotoClip({ id: "x1" }), makePhotoClip({ id: "x2" })], "sideBySide", 0, "g"));
  pick.mockResolvedValueOnce([{ uri: "file:///wide.jpg", kind: "photo", durationSec: 0, width: 1920, height: 1080 }]);
  importMedia.mockResolvedValueOnce({ clips: [makePhotoClip({ id: "tmp", width: 1920, height: 1080 })], failed: 0 });
  const { result } = await renderHook(() => useClipMedia());
  await act(async () => { await result.current.replaceMedia("x1"); });
  const s = useEditorStore.getState();
  expect(s.project!.layers[0]).toMatchObject({ id: "x1", width: 1920, height: 1080, crop: { x: 0.420898, y: 0, w: 0.158203, h: 1 }, transform: { scale: 0.5, x: -0.25, y: 0 } });
  expect(s.project!.layers[1].crop).toEqual({ x: 0.25, y: 0, w: 0.5, h: 1 });
  expect(s.past).toHaveLength(1);
});
```

Create `src/editor/__tests__/CollageSheet.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
jest.mock("@/src/projects/pickMedia", () => ({ pickMedia: jest.fn() }));
jest.mock("@/src/projects", () => ({ storage: { importMedia: jest.fn() } }));
jest.mock("@react-native-community/slider", () => { const { View } = require("react-native"); return ({ testID, disabled, value, minimumValue, maximumValue, step, onSlidingStart, onValueChange }: { testID?: string; disabled?: boolean; value?: number; minimumValue?: number; maximumValue?: number; step?: number; onSlidingStart?: () => void; onValueChange?: (v: number) => void }) => <View testID={testID} {...{ disabled, value, minimumValue, maximumValue, step }} onTouchStart={() => onSlidingStart?.()} onTouchMove={(e: unknown) => onValueChange?.((e as { v?: number })?.v ?? 0.8)} />; });
import { addCollage } from "@/src/editor/model/collageOps";
import { makeClip, makePhotoClip, makeProject, type Project } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { storage } from "@/src/projects";
import { pickMedia } from "@/src/projects/pickMedia";
import { useToast } from "@/src/ui/Toast";
import { CollageSheet } from "../components/CollageSheet";

const pick = pickMedia as jest.Mock;
const importMedia = storage.importMedia as jest.Mock;
const st = () => useEditorStore.getState();
const layers = () => st().project!.layers;
const past = () => st().past.length;
const tile = (name: string) => screen.getByRole("button", { name });
const tiles = () => screen.getAllByRole("button").map((b) => b.props.accessibilityLabel as string).filter((l) => l !== "Done" && l !== "Fit to frame");
const border = () => screen.getByTestId("collage-border");
const corner = () => screen.getByTestId("collage-corner");
const base = makeProject({ clips: [makeClip({ id: "a", sourceDuration: 10 })] });
const photos = (...ids: string[]) => ids.map((id) => makePhotoClip({ id }));
const two: Project = addCollage(base, photos("x1", "x2"), "sideBySide", 0, "g");
const three: Project = addCollage(base, photos("y1", "y2", "y3"), "row3", 0, "g3");
const open = (id: string | null) => render(<CollageSheet clipId={id} visible onClose={() => {}} />);

beforeEach(() => { jest.clearAllMocks(); useToast.getState().clear(); st().reset(); st().setProject(base); });

test("nothing made yet: the six layouts, none ringed, both sliders off at 0 % and Square", async () => {
  await open(null);
  expect(screen.getByText("Collage")).toBeTruthy();
  expect(tiles()).toEqual(["Side by side", "Stacked", "Big and two", "Row of three", "Grid of four", "Inset"]);
  for (const name of tiles()) expect(tile(name)).not.toBeSelected();
  expect(border().props).toMatchObject({ disabled: true, minimumValue: 0, maximumValue: 0.06, step: 0.005, value: 0 });
  expect(corner().props).toMatchObject({ disabled: true, minimumValue: 0, maximumValue: 2, step: 1, value: 0 });
  expect(screen.getByText("Border 0 %")).toBeTruthy();
  expect(screen.getByText("Corner Square")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Fit to frame" })).toBeNull();
  for (const id of ["sideBySide", "stacked", "bigTwo", "row3", "grid4", "inset"]) expect(screen.getByTestId(`collage-diagram-${id}`)).toBeTruthy();
});

test("tapping a layout opens the picker for that many items and lands them in the cells", async () => {
  pick.mockResolvedValueOnce([{ uri: "file:///1.jpg", kind: "photo", durationSec: 0, width: 1080, height: 1920 }, { uri: "file:///2.jpg", kind: "photo", durationSec: 0, width: 1080, height: 1920 }]);
  importMedia.mockResolvedValueOnce({ clips: photos("n1", "n2"), failed: 0 });
  await open(null);
  await fireEvent.press(tile("Stacked"));
  await waitFor(() => expect(layers()).toHaveLength(2));
  expect(pick).toHaveBeenCalledWith({ limit: 2 });
  expect(layers().map((l) => l.collage!.layout)).toEqual(["stacked", "stacked"]);
  expect(st().selectedClipId).toBe("n1");
  expect(past()).toBe(1);
});

test("a cell selected: only the layouts with as many cells, the current one ringed; another one re-lays the collage in one undo step", async () => {
  st().setProject(two);
  const view = await open("x1");
  expect(tiles()).toEqual(["Side by side", "Stacked", "Inset"]);
  expect(tile("Side by side")).toBeSelected();
  await fireEvent.press(tile("Side by side"));
  expect(past()).toBe(0);
  await fireEvent.press(tile("Stacked"));
  expect(layers().map((l) => l.collage!.layout)).toEqual(["stacked", "stacked"]);
  expect(tile("Stacked")).toBeSelected();
  expect(past()).toBe(1);
  expect(pick).not.toHaveBeenCalled();
  st().setProject(three);
  await view.rerender(<CollageSheet clipId="y2" visible onClose={() => {}} />);
  expect(tiles()).toEqual(["Big and two", "Row of three"]);
  expect(tile("Row of three")).toBeSelected();
});

test("Border: one undo step per drag, every cell follows, the label shows per cent", async () => {
  st().setProject(two);
  await open("x2");
  expect(border().props.disabled).toBe(false);
  await fireEvent(border(), "touchStart");
  await fireEvent(border(), "touchMove", { v: 0.02 });
  await fireEvent(border(), "touchMove", { v: 0.04 });
  expect(layers().map((l) => l.collage!.border)).toEqual([0.04, 0.04]);
  expect(layers()[0].transform).toMatchObject({ scale: 0.44, x: -0.24 });
  expect(screen.getByText("Border 4 %")).toBeTruthy();
  expect(past()).toBe(1);
});

test("Corner: three stops that write the masks", async () => {
  st().setProject(two);
  await open("x1");
  await fireEvent(corner(), "touchStart");
  await fireEvent(corner(), "touchMove", { v: 1 });
  expect(layers().map((l) => l.mask)).toEqual(["rounded", "rounded"]);
  expect(screen.getByText("Corner Rounded")).toBeTruthy();
  await fireEvent(corner(), "touchMove", { v: 2 });
  expect(layers().map((l) => l.mask)).toEqual(["circle", "circle"]);
  expect(screen.getByText("Corner Round")).toBeTruthy();
  expect(past()).toBe(1);
});

test("Fit to frame shows only after the frame's shape changed, and one tap re-lays the cells for it", async () => {
  st().setProject({ ...two, aspectRatio: "1:1" });
  await open("x1");
  await fireEvent.press(screen.getByRole("button", { name: "Fit to frame" }));
  expect(layers().map((l) => l.collage!.aspect)).toEqual([1, 1]);
  expect(layers()[0].crop).toEqual({ x: 0.055556, y: 0, w: 0.888889, h: 1 });
  expect(screen.queryByRole("button", { name: "Fit to frame" })).toBeNull();
  expect(past()).toBe(1);
});

test("renders nothing while hidden", async () => {
  await render(<CollageSheet clipId={null} visible={false} onClose={() => {}} />);
  expect(screen.queryByText("Collage")).toBeNull();
});
```

- [ ] **Step 2: Run** `npx.cmd jest src/editor/__tests__/CollageSheet.test.tsx src/editor/__tests__/useClipMedia.test.tsx src/projects/__tests__/pickMedia.test.ts` → the new tests FAIL.
- [ ] **Step 3: Implement.**

`src/projects/pickMedia.ts` — the signature and the options (nothing else):

```ts
/** Opens the camera roll for photos and videos. Returns null if cancelled or denied. `limit`: at most that many, returned in the order they were tapped (a collage's cells). */
export async function pickMedia(opts: { multiple?: boolean; limit?: number } = {}): Promise<PickedAsset[] | null> {
```

```ts
    ...(multiple
      ? { allowsMultipleSelection: true, selectionLimit: opts.limit ?? 20, ...(opts.limit ? { orderedSelection: true } : null) }
      : { allowsMultipleSelection: false }),
```

(`selectionLimit` and `orderedSelection` are in `node_modules/expo-image-picker/build/ImagePicker.types.d.ts` of the installed SDK 57 package — read them there before editing; do not answer from memory.)

`src/editor/useClipMedia.ts`:

1. Imports: add `addCollage, collageRefusal, refitReplacedCell, type CollageRefusal` from `@/src/editor/model/collageOps`; `COLLAGE_CELLS, newPhotoClip, type CollageLayoutId` to the `types` import; `rekeyStrip` from `@/src/editor/toolStrip`.

2. After `addLayerRefusal` add:

```ts
const ADD_FAILED = "Couldn't add those items.";
/** What the user is told when a collage is refused. `picked` = how many items were chosen, `free` = how many layers are left. */
function collageMessage(why: CollageRefusal, layout: CollageLayoutId, picked: number, free: number): string {
  const n = COLLAGE_CELLS[layout];
  switch (why) {
    case "count": return `This layout needs ${n} photos or videos — you picked ${picked}.`;
    case "limit": return `Not enough room: this layout adds ${n} layers and there is room for ${free}.`;
    case "videos": return `A collage can hold ${LAYER_LIMITS.maxVideoAtOnce} videos at most. Pick photos for the other cells.`;
    case "short": return TOO_SHORT;
    case "overlap": return LAYER_OVERLAP;
    default: return ADD_FAILED;
  }
}
```

3. The hook's return type gains `makeCollage(layout: CollageLayoutId): Promise<void>`, and its doc comment the sentence `A collage is n picked items placed in a layout's cells, the first one selected.`

4. In `replaceMedia`, the line `apply((p) => replaceClipMedia(p, clipId, media));` becomes

```ts
    // A collage cell that is in its place gets the new picture fitted to the cell, in the same undo step.
    apply((p) => refitReplacedCell(p, replaceClipMedia(p, clipId, media), clipId));
```

5. After `addOverlay` add, and return it (`return { addMedia, replaceMedia, addOverlay, makeCollage, busy };`):

```ts
  /**
   * The Collage tool: n picked photos / videos become the layout's cells, as layers starting at the playhead (as it was when the
   * layout was tapped; see `newLayerStart`). Refused with a toast before the picker (no layer room) or before anything is copied
   * (too few, too many videos, a third video on screen); a failed import adds nothing. One undo step; the first cell is selected and
   * the open panel is re-keyed onto it, so it stays open on the new collage.
   */
  const makeCollage = (layout: CollageLayoutId) => withLock(async () => {
    const pressed = useEditorStore.getState();
    const projectId = pressed.project?.id;
    if (!pressed.project || !projectId || pressed.project.clips.length === 0) return;
    const n = COLLAGE_CELLS[layout];
    const free = LAYER_LIMITS.max - pressed.project.layers.length;
    const tell = (why: CollageRefusal, picked: number) => useToast.getState().show(collageMessage(why, layout, picked, free));
    if (free < n) { tell("limit", 0); return; }
    const start = newLayerStart(pressed.project, pressed.playhead);
    const assets = await pickMedia({ limit: n });
    if (!assets || assets.length === 0) return;
    const picked = assets.slice(0, n);
    const before = useEditorStore.getState().project;
    if (before?.id !== projectId) return;
    // Refuse before importing, so nothing that cannot be used is copied into the project (placeholder clips for the check). A video
    // with no duration is left to importMedia, which rejects it.
    if (picked.every((a) => a.kind === "photo" || a.durationSec > 0)) {
      const probes = picked.map((a) => (a.kind === "photo"
        ? newPhotoClip({ id: newId(), sourceUri: a.uri, width: a.width, height: a.height })
        : newVideoClip({ id: newId(), sourceUri: a.uri, width: a.width, height: a.height, sourceDuration: a.durationSec })));
      const why = collageRefusal(before, probes, layout, start);
      if (why) { tell(why, picked.length); return; }
    } else if (picked.length < n) { tell("count", picked.length); return; }
    const { clips } = await storage.importMedia(projectId, picked);
    const { project, apply, select } = useEditorStore.getState();
    if (project?.id !== projectId || project.clips.length === 0) return;   // the project was closed (or emptied) meanwhile: say nothing
    if (clips.length < n) { useToast.getState().show(ADD_FAILED); return; }
    // Still checked after import: the imported durations are the authoritative ones, and layers may have changed meanwhile.
    const next = addCollage(project, clips, layout, start, newId());
    if (next === project) { tell(collageRefusal(project, clips, layout, start) ?? "empty", clips.length); return; }
    apply(() => next);
    select(clips[0].id);
    rekeyStrip();
  }, ADD_FAILED);
```

(The two existing `"Couldn't add those items."` literals in `addMedia` stay as they are.)

Create `src/editor/components/CollageSheet.tsx`:

```tsx
import { View } from "react-native";
import { collageCells } from "@/src/editor/model/collage";
import { relayCollage } from "@/src/editor/model/collageOps";
import { COLLAGE_CELLS, COLLAGE_LAYOUT_IDS, COLLAGE_LIMITS, frameAspect, type CollageCorner, type CollageLayoutId } from "@/src/editor/model/types";
import { COLLAGE_LAYOUTS, CORNER_LABELS } from "@/src/editor/photoTools";
import { useEditorStore } from "@/src/editor/store";
import { useClipMedia } from "@/src/editor/useClipMedia";
import { useItemClip } from "@/src/editor/useItem";
import { theme } from "@/src/theme/theme";
import { haptic } from "@/src/ui/haptics";
import { Slider } from "@/src/ui/Slider";
import { Tile } from "@/src/ui/Tile";
import { ToolPanel } from "@/src/ui/ToolPanel";
import { StripSlider, StripTiles } from "@/src/ui/ToolStrip";

/** The square a tile draws its layout in (points), and the border it is drawn with so the cells read as separate. */
const DIAGRAM = 26;
const DIAGRAM_BORDER = 0.06;
/** How far the frame's shape may be from the one a collage was laid out for before "Fit to frame" is offered. */
const SAME_SHAPE = 1e-6;

/** A layout drawn small, from the same cells the collage is made of. The inset's small cell is drawn lighter so it shows on the big one. */
function LayoutDiagram({ layout, selected }: { layout: CollageLayoutId; selected: boolean }) {
  return (
    <View testID={`collage-diagram-${layout}`} style={{ width: DIAGRAM, height: DIAGRAM }}>
      {collageCells(layout, 1, DIAGRAM_BORDER).map((c, i) => (
        <View key={i} style={{ position: "absolute", left: c.x * DIAGRAM, top: c.y * DIAGRAM, width: c.w * DIAGRAM, height: c.h * DIAGRAM,
          backgroundColor: layout === "inset" && i === 1 ? theme.colors.text : selected ? theme.colors.accent : theme.colors.textMuted }} />
      ))}
    </View>
  );
}

/**
 * The Collage panel. With nothing selected (opened from the main bar) a tile makes a collage: it opens the picker for that layout's
 * number of cells. With a collage cell selected the panel edits that collage: the tiles are the layouts it can turn into, Border
 * and Corner re-lay its cells (one undo step per drag), and "Fit to frame" appears when the frame's shape has changed since.
 * Only cells still in their place follow (`relayCollage`). Rows have explicit heights; the body does not scroll.
 */
export function CollageSheet({ clipId, visible, onClose }: { clipId: string | null; visible: boolean; onClose: () => void }) {
  const clip = useItemClip(clipId);
  const aspect = useEditorStore((s) => (s.project ? frameAspect(s.project) : 1));
  const { apply, beginTransaction, applyTransient } = useEditorStore.getState();
  const { makeCollage, busy } = useClipMedia();
  const tag = clip?.collage ?? null;
  const layouts = tag ? COLLAGE_LAYOUT_IDS.filter((id) => COLLAGE_CELLS[id] === COLLAGE_CELLS[tag.layout]) : COLLAGE_LAYOUT_IDS;
  const stale = tag !== null && Math.abs(tag.aspect - aspect) > SAME_SHAPE;

  const pick = (id: CollageLayoutId) => {
    if (!tag) { if (!busy) void makeCollage(id); return; }
    if (tag.layout === id) return;   // already this layout: no buzz, no undo step
    haptic("light");
    apply((p) => relayCollage(p, tag.group, { layout: id }));
  };

  return (
    <ToolPanel visible={visible} onClose={onClose} title="Collage" size="compact" scroll={false}
      action={tag && stale ? { label: "Fit to frame", onPress: () => { haptic("light"); apply((p) => relayCollage(p, tag.group, {})); } } : undefined}>
      {/* The kit's rows bring their own gutter: the panel's is taken back so they line up with every strip. */}
      <View style={{ marginHorizontal: -theme.space.gutter }}>
        <StripTiles>
          {layouts.map((id) => {
            const selected = tag?.layout === id;
            return (
              <Tile key={id} label={COLLAGE_LAYOUTS[id].label} selected={selected} onPress={() => pick(id)}>
                <LayoutDiagram layout={id} selected={selected} />
              </Tile>
            );
          })}
        </StripTiles>
        <StripSlider label="Border" value={`${Math.round((tag?.border ?? 0) * 1000) / 10} %`}>
          <Slider
            testID="collage-border"
            minimumValue={COLLAGE_LIMITS.border[0]} maximumValue={COLLAGE_LIMITS.border[1]} step={COLLAGE_LIMITS.borderStep}
            value={tag?.border ?? 0}
            disabled={!tag}
            onSlidingStart={beginTransaction}
            onValueChange={(v) => { if (tag) applyTransient((p) => relayCollage(p, tag.group, { border: v })); }}
          />
        </StripSlider>
        <StripSlider label="Corner" value={CORNER_LABELS[tag?.corner ?? 0]}>
          <Slider
            testID="collage-corner"
            minimumValue={0} maximumValue={2} step={1}
            value={tag?.corner ?? 0}
            disabled={!tag}
            onSlidingStart={beginTransaction}
            onValueChange={(v) => { if (tag) applyTransient((p) => relayCollage(p, tag.group, { corner: Math.min(2, Math.max(0, Math.round(v))) as CollageCorner })); }}
          />
        </StripSlider>
      </View>
    </ToolPanel>
  );
}
```

Heights: the compact panel is 240 − 1 hairline − 44 header = 195 pt of body; the three rows are 72 + 36 + 36 = 144 (`STRIP.tiles`, `STRIP.slider` — set by the kit rows themselves). No `flex: 1`.

- [ ] **Step 4: Run** the three suites, `npx.cmd jest src/__tests__` (guards), `npm run typecheck`, `npm test`.
- [ ] **Step 5: Commit** — `feat(editor): the Collage panel — six layouts, pick the media, Border and Corner; Replace re-fits a cell`.

---

### Task 8: Toolbar — `contextFor`, tool ids, the two tools mounted

**Depends on:** Tasks 6 and 7. **Parallel-safe with:** none.

**Files:** Modify `src/editor/toolbarContext.ts`, `src/editor/toolGroups.ts`, `src/editor/toolStrip.ts` (two type unions), `src/editor/components/EditorToolbar.tsx`, `src/editor/__tests__/toolbarContext.test.ts`, `src/editor/__tests__/toolGroups.test.ts`, `src/editor/__tests__/icons.test.ts`, `src/editor/__tests__/EditorToolbar.test.tsx` (line 31 + append).

**Do not touch:** `EditorLayout.tsx`, `PreviewPlayer.tsx`, the sheets of Tasks 6 and 7, `useStripCloser` and the functions of `toolStrip.ts`.

**Interfaces — Consumes:** `PhotoMotionSheet` (Task 6), `CollageSheet` (Task 7), `activePhotoMotion` (Task 1).

**Interfaces — Produces**

```ts
// toolbarContext.ts — TOOL_IDS gains "collage" and "motion" (51 ids)
// toolGroups.ts — TOOL_META.collage = { label: "Collage", icon: "grid-outline" }, TOOL_META.motion = { label: "Motion", icon: "move-outline" }
// toolStrip.ts — StripId gains "photoMotion"; PanelId gains "collage"
```

- [ ] **Step 1: Failing tests.**

`src/editor/__tests__/toolbarContext.test.ts`:

- line 15: `const MAIN = ["edit", "audioMenu", "textMenu", "sticker", "overlay", "collage", "effect", "filter", "adjust", "ratio", "background", "cover", "templates"];`
- after the `without` helper add `const withMotion = (list: string[]) => list.flatMap((t) => (t === "animate" ? ["animate", "motion"] : [t]));`
- line 37 (the photo `p`): `expect(contextFor({ ...none, clipId: "p" }, project).tools).toEqual(withMotion(without(CLIP, "speed", "volume", "reverse", "freeze")));`
- line 46 (the photo layer `P`): `… tools: withMotion(without(LAYER, "speed", "volume", "reverse")) });`
- in "every tool id is reachable": add `{ ...none, clipId: "p" }` to `sels`; the last line becomes `expect(TOOL_IDS).toHaveLength(51);`
- add `makeKeyframe` and `type Clip` to the `types` import, and append:

```ts
describe("Motion and Collage", () => {
  const tagged = (id: string): LayerClip => ({ ...makePhotoClip({ id }), start: 0, collage: { group: "g", layout: "sideBySide", cell: 0, border: 0, corner: 0, aspect: 0.5625 } });
  const tools = (clip: Clip, layer = false) => contextFor({ ...none, clipId: clip.id }, makeProject({ clips: layer ? [makeClip({ id: "a", sourceDuration: 4 })] : [clip, makeClip({ id: "z", sourceDuration: 4 })], layers: layer ? [{ ...clip, start: 0 }] : [] })).tools;

  test("Collage is on the main bar right after Overlay, and needs a clip like Overlay", () => {
    const { tools: main } = contextFor(none, project);
    expect(main.slice(main.indexOf("overlay"), main.indexOf("overlay") + 3)).toEqual(["overlay", "collage", "effect"]);
    expect(contextFor(none, makeProject()).tools).not.toContain("collage");
  });

  test("Motion follows Animate for a photo — main clip or layer — and is never there for a video", () => {
    for (const layer of [false, true]) {
      const list = tools(makePhotoClip({ id: "p" }), layer);
      expect(list.slice(list.indexOf("animate"), list.indexOf("animate") + 3)).toEqual(["animate", "motion", "filter"]);
      expect(tools(makeClip({ id: "v", sourceDuration: 4 }), layer)).not.toContain("motion");
    }
  });

  test("one way of moving a photo at a time: keyframes hide Motion, a Motion hides Keyframe", () => {
    const pinned = makePhotoClip({ id: "p", keyframes: [makeKeyframe({ t: 0 })] });
    expect(tools(pinned)).not.toContain("motion");
    expect(tools(pinned)).toContain("keyframe");
    const moving: Clip = { ...makePhotoClip({ id: "p" }), motion: { id: "zoomIn", strength: 0.5 } };
    expect(tools(moving)).toContain("motion");
    expect(tools(moving)).not.toContain("keyframe");
    expect(tools(moving, true)).not.toContain("keyframe");
    // An older Combo is not a stored Motion: both tools are there.
    const old = makePhotoClip({ id: "p", animation: { in: null, out: null, combo: "zoomInSlow" } });
    expect(tools(old)).toEqual(expect.arrayContaining(["motion", "keyframe"]));
  });

  test("a collage cell: Collage comes first on its bar, and it has no Motion (it would grow over its neighbours)", () => {
    const list = contextFor({ ...none, clipId: "c" }, makeProject({ clips: [makeClip({ id: "a", sourceDuration: 4 })], layers: [tagged("c")] })).tools;
    expect(list[0]).toBe("collage");
    expect(list[1]).toBe("trim");
    expect(list).not.toContain("motion");
    expect(contextFor({ ...none, clipId: "P" }, project).tools).not.toContain("collage");      // a plain layer
    expect(contextFor({ ...none, clipId: "a" }, project).tools).not.toContain("collage");      // a main clip
  });
});
```

`src/editor/__tests__/toolGroups.test.ts` — the two lines of the first `label(…)` become

```ts
  expect(label(["edit", "audioMenu", "textMenu", "sticker", "overlay", "collage", "effect", "filter", "adjust", "ratio", "background", "cover", "templates"]))
    .toEqual(["Edit", "Audio", "Text", "Stickers", "Overlay", "Collage", "Effects", "Filter", "Adjust", "Ratio", "Background", "Cover", "Templates"]);
  expect(TOOL_META.motion.label).toBe("Motion");
```

`src/editor/__tests__/icons.test.ts` — in the table of "the icon of each tool" add `collage: "grid-outline", motion: "move-outline",` and after the two `not.toBe` lines add

```ts
  // Motion sits next to Animate and Transform on a photo's bar; Collage next to Overlay.
  expect(new Set([TOOL_META.motion.icon, TOOL_META.animate.icon, TOOL_META.transform.icon, TOOL_META.keyframe.icon]).size).toBe(4);
  expect(TOOL_META.collage.icon).not.toBe(TOOL_META.overlay.icon);
```

`src/editor/__tests__/EditorToolbar.test.tsx` — line 31: `const MAIN = ["Edit", "Audio", "Text", "Stickers", "Overlay", "Collage", "Effects", "Filter", "Adjust", "Ratio", "Background", "Cover", "Templates"];` and append:

```tsx
describe("Motion and Collage on the bar", () => {
  test("a photo has Motion: it opens the Motion strip, and a tile there is one undo step", async () => {
    st().setProject(makeProject({ clips: [makePhotoClip({ id: "p" }), makeClip({ id: "a", sourceDuration: 4 })] }));
    await renderBar();
    await act(() => { st().select("p"); });
    await fireEvent.press(btn("Motion"));
    expect(useToolStrip.getState().open).toEqual({ id: "photoMotion", key: "clip:p" });
    expect(screen.getByText("Apply to all photos")).toBeTruthy();
    await fireEvent.press(btn("Zoom in"));
    expect(st().project!.clips[0].motion).toEqual({ id: "zoomIn", strength: 0.5 });
    expect(st().past).toHaveLength(1);
    await closeTool();
    gone("Keyframe");                       // a photo with a Motion: one way of moving at a time
    await act(() => { st().select("a"); });
    gone("Motion");
  });

  test("Collage on the main bar opens the panel with the six layouts and nothing selected", async () => {
    await renderBar();
    await fireEvent.press(btn("Collage"));
    expect(useToolStrip.getState().open).toEqual({ id: "collage", key: "none" });
    expect(btn("Grid of four")).toBeTruthy();
    expect(st().selectedClipId).toBeNull();
    await closeTool();
    expect(row()).toEqual(MAIN);
  });

  test("a collage cell has Collage first on its bar; it opens the panel on that collage", async () => {
    const cell = { ...makePhotoClip({ id: "c" }), start: 0, transform: { scale: 0.5, x: -0.25, y: 0, rotation: 0, flipH: false, flipV: false }, crop: { x: 0.25, y: 0, w: 0.5, h: 1 },
      collage: { group: "g", layout: "sideBySide" as const, cell: 0, border: 0, corner: 0 as const, aspect: 0.5625 } };
    st().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 4 })], layers: [cell] }));
    await renderBar();
    await act(() => { st().select("c"); });
    expect(row().slice(0, 3)).toEqual([BACK, "Collage", "Trim"]);
    gone("Motion");
    await fireEvent.press(btn("Collage"));
    expect(btn("Side by side")).toBeSelected();
    expect(screen.queryByRole("button", { name: "Grid of four" })).toBeNull();
  });
});
```

- [ ] **Step 2: Run** `npx.cmd jest src/editor/__tests__/toolbarContext.test.ts src/editor/__tests__/toolGroups.test.ts src/editor/__tests__/icons.test.ts src/editor/__tests__/EditorToolbar.test.tsx` → FAIL.
- [ ] **Step 3: Implement.**

`src/editor/toolbarContext.ts`:

- `TOOL_IDS`: `"templates",` → `"templates", "collage",` on the first line and `"animate",` → `"animate", "motion",` on the second;
- the import becomes `import { activePhotoMotion, isPhoto, type Project } from "./model/types";`
- the clip branch:

```ts
  if (item) {
    const photo = isPhoto(item.clip);
    const video = !photo;
    const sounds = video && !item.clip.reversed;
    // Motion is a photo's own tool. Not with keyframes (they move it already), and not on a collage cell (it would grow over its neighbours).
    const motion = photo && item.clip.keyframes.length === 0 && !item.clip.collage;
    // One way of moving a photo at a time: no Keyframe while a Motion plays on it.
    const pins = activePhotoMotion(item.clip) === null;
    if (item.layer) {
      return { bar: "layer", tools: keep([["collage", !!item.clip.collage], ["trim"], ["speed", video], ["volume", sounds], ["animate"], ["motion", motion], ["filter"], ["adjust"], ["crop"], ["transform"], ["opacity"], ["mask"],
        ["blend"], ["chroma"], ["keyframe", pins], ["layerForward"], ["layerBack"], ["replace"], ["reverse", video], ["duplicate"], ["delete"]]) };
    }
    const hasNext = p.clips.findIndex((c) => c.id === item.clip.id) < p.clips.length - 1;
    return { bar: "clip", tools: keep([["split"], ["trim"], ["select", p.clips.length >= 2], ["speed", video], ["volume", sounds], ["animate"], ["motion", motion], ["filter"], ["adjust"], ["background"], ["templates"],
      ["crop"], ["transform"], ["opacity"], ["mask"], ["chroma"], ["keyframe", pins], ["transition", hasNext], ["replace"], ["reverse", video], ["freeze", video], ["duplicate"], ["delete"]]) };
  }
```

- the main bar: `["overlay", hasClips], ["collage", hasClips], ["effect"],`
- in the doc comment above `contextFor` add: `Motion (a photo without keyframes that is not a collage cell) and Keyframe (not while a photo's Motion plays) leave each other out for good, not for the moment.`

`src/editor/toolGroups.ts` — after the `overlay` line: `collage: { label: "Collage", icon: "grid-outline" },`; after the `animate` line: `motion: { label: "Motion", icon: "move-outline" },`.

`src/editor/toolStrip.ts` — `StripId` gains `| "photoMotion"` and `PanelId` gains `| "collage"`. Nothing else in the file changes.

`src/editor/components/EditorToolbar.tsx`:

- imports: `import { CollageSheet } from "./CollageSheet";` and `import { PhotoMotionSheet } from "./PhotoMotionSheet";` (alphabetical with the others);
- `ACTIONS`: after `overlay` add `collage: { disabled: mediaBusy, onPress: () => openStrip("collage") },` and after `animate` add `motion: { onPress: () => openStrip("photoMotion") },`
- mounts: after the `<StickerPanel …/>` line add

```tsx
      {/* Collage: a layout tile makes one (it selects the first cell and re-keys the panel onto it); with a cell selected it edits that collage. */}
      <CollageSheet clipId={selectedId} visible={strip?.id === "collage"} onClose={closeStrip} />
```

  and after the `<ClipAnimationSheet …/>` line add

```tsx
      <PhotoMotionSheet clipId={selectedId} visible={strip?.id === "photoMotion"} onClose={closeStrip} />
```

- in the component's doc comment, the list of momentary disabled buttons gains "Collage during a pick".

- [ ] **Step 4: Run** the four suites, then `npm run typecheck` and `npm test`. A suite outside your list that fails **only** because the main bar has one more button or a photo's bar one more tool (a pinned list or count) is updated to the new list and named in your report; anything else is a mistake in the change.
- [ ] **Step 5: Commit** — `feat(editor): Motion on a photo's bar and Collage on the main bar and on a cell's`.

---

### Task 9: Docs, full checks, device checklist

**Depends on:** Tasks 1–8.

**Files:** Modify `README.md`, `AGENTS.md`, `docs/superpowers/specs/2026-10-06-photo-motion-collage-design.md`, `docs/superpowers/research/capcut-roadmap.md` (if it has a row for photo motion or collages); any file the sweep below names.

**Do not touch:** behaviour. A failing test means a mistake here.

- [ ] **Step 1: Sweep** with the Grep tool (not `sed`) and fix what is found:
  - `git diff --stat main -- modules/clipy-video/ios` is **empty**; `git diff --stat main -- modules/clipy-video` shows only `index.ts` and `__tests__/index.test.ts`.
  - `git diff --stat main -- src/editor/model/__tests__` shows no change to `motion.parity.test.ts`, `motion.vectors.ts`, `motion.test.ts`, `clipLayout.*`, any `*.swift.test.ts`; `git diff --stat main -- src/editor/__tests__/looks.frozen.test.ts` is empty.
  - `git diff --stat main -- src/__tests__` is **empty** (no guard's allow-list grew).
  - `motion: undefined`, `collage: undefined`, `motion: null`, `collage: null` in `src/` outside tests: none.
  - `.motion` read outside `types.ts` (`activePhotoMotion` / `shownPhotoMotion`), `ops.ts` (`withPhotoMotion`, `comboOverMotion`), `migrate.ts`: none in components, `motion.ts` or `index.ts`.
  - `collageCells(` / `cellPlacement(` called outside `collage.ts`, `CollageSheet.tsx` (the tile drawing) and tests: none.
  - Comments that still say "v16" for the current schema, or "49" tools: corrected (not historical test titles).
- [ ] **Step 2: Docs.**
  - `README.md`, section **Motion**: add a bullet **Photo motion** — select a photo, **Motion**: None, Zoom in, Zoom out, Pan left / right / up / down, Corner zoom; **Strength**; **Apply to all photos**; it starts and ends softly; a photo has either a Motion, a Combo or keyframes; an old "Slow zoom" or "Pan" Combo on a photo shows as its Motion tile and keeps playing as before. In the Combo sentence note that for photos the Combo list is Sway and Pulse.
  - `README.md`, section **Layers**: add a bullet **Collage** — the six layouts; pick that many photos or videos (at most 2 videos); every cell is a layer; **Border**, **Corner** (Square / Rounded / Round), the layout tiles of an existing collage, **Fit to frame** after a ratio change; a cell moved by hand is left alone by the sliders; the main video shows in the gaps and its sound plays.
  - `README.md`, **First native build — things to check**: add one line — "Photo motion and collages added no native code: a Motion is exported as two keyframes on the photo, a collage as layers with a crop and a mask. Check once that a photo with a Motion moves in the export the way it does in the editor, and that a four-cell collage with a border and Rounded corners looks like the preview."
  - `AGENTS.md` "This repo": after the **Motion maths** bullet add ``- Photo motion: a photo's `Clip.motion` is optional and ABSENT when still (never null / undefined); read it only through `activePhotoMotion` / `shownPhotoMotion` (types.ts). Its maths is `photoMotionDelta` / `photoMotionPins` in motion.ts — TypeScript only, eased with `smooth` so `toExportClip` sends it as two keyframes; never add it to `MOTION` or to Motion.swift. A Motion, a Combo and keyframes never share a photo (`setPhotoMotion`, `setClipAnimation`, `contextFor`).`` and after the **Clip placement** bullet add ``- Collages: a collage is ordinary layers tagged `Clip.collage` (group, layout, cell, border, corner, aspect). Only `src/editor/model/collage.ts` lays out cells (cover through `coverFactor`) and only `collageOps.ts` writes the tag; there is no Swift twin — the export reads transform / crop / mask. A re-lay touches only cells still in place (`isCellInPlace`) and only from a tap or a drag: never on load, never on a ratio change.``
  - Spec: Status → `Implemented <date> (on-device confirmation by the owner pending; export unverified until an EAS build exists)`; add a section **3a. As built** after §3: the commit of each task, every deviation the tasks reported (values that changed, tests whose expectations changed — file and what, files outside the plan), and what no test checks (the device checklist; §12 item by item).
- [ ] **Step 3: Full checks.** `npm run typecheck`; `npm test`; `npx.cmd expo-doctor`; `git status --short` shows nothing unexpected; `git diff --stat main` shows **no change** under `ios/`, `android/`, `supabase/`, `src/publish/`, `src/theme/`, `src/ui/`, `modules/clipy-video/ios/`, `package.json`, `app.json`, `assets/`, and none in `timelineScroll.ts`, `timeline.ts`, `clipLayout.ts`, `effects.ts`, `Timeline.tsx`, `PreviewPlayer.tsx`, `ClipFrame.tsx`, `LayerStack.tsx`, `EditorLayout.tsx`, `PreviewTag.tsx`.
- [ ] **Step 4: Commit** — `git add` the files changed (explicit paths); `docs: photo motion and collages as built, README, AGENTS, device checklist`.

---

## Pairwise: what each task hands the next, and what may run side by side

| Pair | Shared file or interface | Producer hands over | Consumer relies on | Side by side? |
|---|---|---|---|---|
| 1 → 2 | `types.ts` | `activePhotoMotion`, `PHOTO_MOTION_LIMITS`, `PhotoMotionId`, `Clip.motion?` | reads only; edits `motion.ts`, `index.ts` | no (2 after 1) |
| 1 → 3 | `types.ts` | `clampPhotoMotion`, `COMBO_AS_MOTION`, `PhotoMotion` | reads only; edits `ops.ts` | no (3 after 1) |
| 1 → 4 | `types.ts` | `CollageCell`, `CollageLayoutId`, `clampCrop` (exists) | reads only; creates `collage.ts` | no (4 after 1) |
| 1 → 6, 7 | `photoTools.ts` | `PHOTO_MOTIONS`, `COLLAGE_LAYOUTS`, `CORNER_LABELS` | reads only | no |
| 2 ∥ 3 | — | 2: `photoMotionDelta`, the preview hook, the pins · 3: `setPhotoMotion`, `setMotionForAllPhotos` | neither reads the other (the strip writes the store; the preview reads the stored field) | **yes** — 2 must not touch `ops.ts`; 3 must not touch `motion.ts`, `modules/` |
| 2 ∥ 4, 3 ∥ 4 | — | — | nothing in common | **yes** — 4 creates two new files only |
| 4 → 5 | `collage.ts` | `placeInCell<T extends Clip>(clip, tag): T`, `isCellInPlace(clip): boolean` | calls them; creates `collageOps.ts` | no (5 after 4) |
| 3 ∥ 5 | `ops.ts` | 3 edits it · 5 only **imports** `videoLayerOverlap` (exists on `main`) and, in tests, `replaceClipMedia` / `setClipTransform` (exist) | 5 must not edit `ops.ts` | **yes** |
| 3 → 6 | `ops.ts` | `setPhotoMotion(p, id, motion \| null)`, `setMotionForAllPhotos(p, motion \| null)`, a Combo removing a Motion | the strip and the Combo-tab test | no (6 after 3) |
| 5 → 7 | `collageOps.ts` | `addCollage`, `collageRefusal`, `relayCollage`, `refitReplacedCell`, `CollageRefusal` | the hook and the panel | no (7 after 5) |
| 5 ∥ 6 | — | — | nothing in common | **yes** — 6: `PhotoMotionSheet.tsx`, `ClipAnimationSheet.tsx` and their tests only |
| 6 ∥ 7 | — | 6: `PhotoMotionSheet` · 7: `CollageSheet`, `makeCollage`, `pickMedia({ limit })` | nothing in common | **yes** — 7: `CollageSheet.tsx`, `useClipMedia.ts`, `pickMedia.ts` and their tests only; neither touches `EditorToolbar.tsx` |
| 2 ∥ 5, 6, 7 | — | — | 2's files are read by nobody else | **yes** |
| 6, 7 → 8 | `EditorToolbar.tsx`, `toolStrip.ts` | `PhotoMotionSheet({ clipId, visible, onClose })`, `CollageSheet({ clipId, visible, onClose })`; the hook calls `rekeyStrip()` after selecting the first cell | 8 adds the ids `photoMotion` / `collage`, the buttons and the mounts | no (8 after both, alone) |
| 1–8 → 9 | docs | — | — | no (last) |

**Until Task 8 lands** neither tool can be reached in the app: the sheets exist and are tested on their own. That is intended — no commit leaves a button without its tool.

---

## Device checklist (owner, Expo Go)

Start with `npx expo start --go --port 8090` and open the app on the iPhone. Use a project you made **before** this update that has at least one photo in it. If one of its photos has a "Slow zoom" or "Pan" animation, even better.

In one line: **what you see on the phone is what the final video will show** for both new tools — no "Preview" tag. While a photo plays on the phone the movement is a little less fluid than in the final video.

**Nothing changed**

1. Open the old project and play it. Every photo and clip looks exactly as before — nothing moves that did not move, nothing is resized. Tell me if anything looks different.

**Photo motion**

2. Tap a **photo**. In the row of tools, after **Animate**, there is a new **Motion** button. Tap a **video**: no Motion button. That is right.
3. Tap the photo, then **Motion**. You see **None, Zoom in, Zoom out, Pan left, Pan right, Pan up, Pan down, Corner zoom**; None is highlighted and the **Strength** slider is greyed out. Tell me if a name is cut off.
4. Tap **Zoom in**, move the white line to the start of the photo and press play: the photo slowly grows. It starts and ends softly.
5. Try each of the others the same way. **Pan** moves the photo sideways or up and down (it is slightly enlarged so no black edge shows). **Corner zoom** grows towards the top-left corner. Tell me if any goes the wrong way or shows a black edge.
6. Drag **Strength** left and right and play again: gentle at the left, strong at the right. You feel a small tick in the middle.
7. Tap **Apply to all photos**: every photo on the main row now has the same motion. Videos are not touched. Press **Undo** once: they are all back as they were.
8. Tap **None**: the photo is still again.
9. With a motion on the photo, close the strip (✓): the **Keyframe** button is gone for this photo. Set Motion to None and it is back. (A photo moves either by Motion or by keyframes, not both.)
10. Tap the photo, **Animate**, **Combo**: for a photo you now see only **None, Sway, Pulse** — zoom and pan moved to Motion. For a video, all six are still there.
11. If an old photo of yours had a "Slow zoom" or "Pan": tap it, then **Motion** — the matching tile is highlighted, and it plays exactly as before. It only changes if you drag Strength or tap another tile.
12. Give a photo a **Fade** in (Animate, In) and a **Zoom in** Motion: it fades in *and* zooms.

**Collages**

13. Tap away so nothing is selected. On the main row, after **Overlay**, there is a new **Collage** button. Tap it: a panel with **Side by side, Stacked, Big and two, Row of three, Grid of four, Inset**, and two greyed-out sliders.
14. Move the white line to where the collage should start (do this before step 13 next time). Tap **Side by side** and pick **two photos**. They appear next to each other, each filling its half. Tell me if a face is cut badly — the middle of each picture is what is kept.
15. The panel is still open. Drag **Border**: a gap opens between the pictures and around them. **In the gap you see your main video** — that is how it works; there is no coloured border.
16. Drag **Corner**: three positions — **Square, Rounded, Round**.
17. The panel now shows only **Side by side, Stacked, Inset**. Tap **Stacked**, then **Inset**: the same two pictures re-arrange. Tap ✓.
18. On the timeline there are two new bars on the layers row. Tap one: its tools start with **Collage** (it opens the same panel again). Everything else works as for any overlay: **Trim**, **Replace**, **Filter**, drag the bar, **Delete**.
19. Tap a cell and **Replace** it with a different picture: it fills the same cell.
20. Drag one cell with your finger in the preview to move it. Now open **Collage** and drag **Border**: the cell you moved **stays where you put it**; the other one follows the slider. That is on purpose.
21. Make a **Grid of four** with four photos, then a **Row of three** with one video and two photos. The collage lasts as long as the video (3 seconds with photos only), and is cut short if the project ends sooner.
22. Try to pick **three videos** for a Row of three: a message says a collage holds at most 2 videos, and nothing is added. Pick only **two** items for a three-cell layout: a message says it needs 3.
23. Press **Undo** after making a collage: all its cells go at once.
24. The **sound** of the main video keeps playing under a collage. If you do not want it, tap that clip and lower **Volume**.
25. Change **Ratio** (for example 9:16 to 1:1) with a collage on screen: the cells do **not** move by themselves and may no longer line up. Tap a cell, **Collage**, then **Fit to frame** (top right of the panel): they line up for the new shape.
26. Close the project and open it again: motions and collages are still there, and Border / Corner still work on the collage.

**Tell me**

27. Is four pictures plus the main video smooth enough on your phone while playing?
28. Would you rather have the collage's Corner as a smooth slider, a coloured border instead of seeing the video, or Motion at an even speed instead of the soft start and stop? Each of those needs the real (native) build to be changed, so I left them out for now.
