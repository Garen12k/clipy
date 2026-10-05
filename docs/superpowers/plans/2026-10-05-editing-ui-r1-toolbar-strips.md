# Editing UI, Round 1 — Contextual Toolbar and Tool Strips Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One bottom bar whose tools follow the selection (no group tabs, no greyed-out buttons), and seventeen quick tools that open as an inline strip in place of the bar instead of a modal sheet, with the preview and the timeline still usable.

**Architecture:** A pure module `src/editor/toolbarContext.ts` describes the bar (`contextFor(selection, project) → { bar, tools }`) and the selection's identity (`selectionKey`). A kit component `src/ui/ToolStrip.tsx` is a plain inline view (not a `Modal`) that registers its presence in a counter store; a small UI store `src/editor/toolStrip.ts` holds which strip is open and closes it when the selection key changes. `EditorToolbar` renders the bar from `contextFor`, hides it while a strip is present, and gives the bottom area an explicit height and a negative top margin so nothing above it moves. Each `XSheet` keeps its name, props, test ids and labels and renders `<ToolStrip>` instead of `<Sheet>`.

**Tech Stack:** Expo SDK 57, TypeScript strict, Zustand 5 (`useShallow` from `zustand/react/shallow`), `@react-native-community/slider`, `@expo/vector-icons`, Jest + RNTL v14. No model, schema or Swift change.

**Spec:** `docs/superpowers/specs/2026-10-05-editing-ui-r1-toolbar-strips-design.md` (binding; §2.2 the bars, §2.3 the leave-out rules and the three exceptions, §2.5 tool → bars, §3.2 the heights, §3.3 the close rules, §3.5 the layout of each strip).

## Global Constraints

- **iPhone only.** No Android or web configuration, files or code paths.
- **Expo Go must keep working.** Nothing in this round touches `modules/clipy-video`; no new native code.
- **New packages: none.**
- UI from `src/ui/` and `src/theme/theme.ts` only; **no hex literals** (`src/__tests__/noHexLiterals.test.ts`). Sizes in points are plain numbers and are fine.
- A clip-or-layer by id is resolved with `findItem` / `useItemClip` / `useIsLayer` — **never `project.clips.find`** (`selectedClipId` holds a main clip's or a layer's id). The index on the main track (`project.clips.findIndex`) is only used for "is there a following clip".
- **Only `src/editor/model/timeline.ts` multiplies / divides by `speed` or reads `speedCurve` steps.** Nothing in this round computes a length.
- **Never touch `src/editor/timelineScroll.ts`.** No scroll-end handlers, no `scrollTo` in scroll callbacks. `Timeline.tsx` is not edited in this round.
- Gestures (none are added; if one is): `.runOnJS(true)`, gesture state on a ref object.
- **The main preview `VideoView` never remounts or changes key, and `src/editor/components/PreviewPlayer.tsx` is not edited in this round.** The preview must not resize when a strip opens or closes.
- **A strip's content never uses `flex: 1` for height.** Every row has an explicit height (`STRIP.header`, `STRIP.tiles`, `STRIP.slider`); `flex: 1` is allowed only to share WIDTH inside a row whose height is explicit. (A past bug collapsed a sheet's content off-screen.)
- **One user action = one undo step; a no-change action leaves no history entry.** A tile / chip / switch = one `apply`; a slider drag = one `beginTransaction` then `applyTransient`. Opening, closing, selecting are never undo steps.
- Component names, props (`visible`, `onClose`, ids, `clipIds`), test ids, accessibility labels and visible texts of the converted sheets do not change unless a task lists the change.
- Windows: PowerShell, no `&&`, `npx.cmd`. **Never run `expo lint`** or anything else that rewrites package.json. **No broad `sed`.** **Never `git stash`.** **`git add` explicit paths only — never `-A` / `.`.** Do not start or stop a dev server. Before each commit: `npm run typecheck` and `npm test` green. Commit trailer exactly `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- RNTL v14: `render` / `fireEvent` are async — always `await`. Component tests live in `src/editor/__tests__/` (kit tests in `src/ui/__tests__/`). The default mocked Slider (`jest.setup.ts`) is a `View`: drive it with `fireEvent(slider, "slidingStart")` / `fireEvent(slider, "valueChange", v)`; a test file that mocks the slider itself keeps its own way (`touchStart` / `touchMove`). The safe-area mock gives zero insets, so the bottom padding is `theme.space.sm` = 8.

## Task order

1 first. Then 2. Then 3. Then **in parallel:** 4, 5, 6, 7 (no file in common — see each task's Files). Last: 8.

---

### Task 1: `toolbarContext` — the pure description of the bar

**Depends on:** nothing. **Parallel-safe with:** nothing else is ready yet.

**Files:** Create `src/editor/toolbarContext.ts`, `src/editor/__tests__/toolbarContext.test.ts`.

**Do not touch:** `src/editor/toolGroups.ts` and `src/editor/components/EditorToolbar.tsx` (Task 3 — the old `ToolId` in `toolGroups.ts` stays until then; the new `ToolId` lives in the new file).

**Interfaces — Consumes:** `findItem` (`src/editor/model/timeline.ts`: `findItem(p, id): { clip: Clip; layer: boolean } | null`), `isPhoto`, `Project` (`src/editor/model/types.ts`).

**Interfaces — Produces**

```ts
// src/editor/toolbarContext.ts
export const TOOL_IDS = [
  "edit", "audioMenu", "textMenu", "sticker", "overlay", "effect", "filter", "adjust", "ratio", "background", "cover", "templates",
  "split", "trim", "speed", "volume", "animate", "crop", "transform", "opacity", "mask", "blend", "chroma", "keyframe", "transition",
  "layerForward", "layerBack", "replace", "reverse", "freeze", "duplicate", "delete", "select",
  "overlayEdit", "overlayDuplicate", "overlayDelete", "text", "captions",
  "addAudio", "ducking", "beats", "audioVolume", "audioFade", "audioDuplicate", "audioDelete",
  "effectStrength", "effectDuplicate", "effectDelete",
] as const;                                   // 48 ids
export type ToolId = (typeof TOOL_IDS)[number];
export type BarId = "main" | "clip" | "layer" | "text" | "sticker" | "audio" | "effect";
export type Section = "audio" | "text" | null;
export type ToolbarSelection = { clipId: string | null; overlayId: string | null; effectId: string | null; audioId: string | null; section: Section };
export type ToolbarContext = { bar: BarId; tools: ToolId[] };
export function contextFor(sel: ToolbarSelection, p: Project): ToolbarContext
export type SelectionState = { selectedClipId: string | null; selectedOverlayId: string | null; selectedEffectId: string | null; selectedAudioId: string | null; multiSelect: string[] | null };
export function selectionKey(s: SelectionState): string
```

- [ ] **Step 1: Failing tests.** Create `src/editor/__tests__/toolbarContext.test.ts`:

```ts
import { makeAudioTrack, makeClip, makeEffect, makeLayer, makeOverlay, makePhotoClip, makeProject, makeSticker, type LayerClip } from "@/src/editor/model/types";
import { contextFor, selectionKey, TOOL_IDS, type ToolbarSelection } from "../toolbarContext";

const none: ToolbarSelection = { clipId: null, overlayId: null, effectId: null, audioId: null, section: null };
const photoLayer = (id: string): LayerClip => ({ ...makePhotoClip({ id }), start: 0 });
// a (video), p (photo), r (reversed video), z (video, last) on the main track; layers L (video), P (photo), R (reversed video).
const project = makeProject({
  clips: [makeClip({ id: "a", sourceDuration: 4 }), makePhotoClip({ id: "p" }), makeClip({ id: "r", sourceDuration: 4, reversed: true }), makeClip({ id: "z", sourceDuration: 4 })],
  layers: [makeLayer({ id: "L", sourceDuration: 2, start: 1 }), photoLayer("P"), { ...makeLayer({ id: "R", sourceDuration: 2, start: 5 }), reversed: true }],
  overlays: [makeOverlay({ id: "t" }), makeOverlay({ id: "c", kind: "caption" }), makeSticker({ id: "s" })],
  effects: [makeEffect({ id: "e" })],
  audioTracks: [makeAudioTrack({ id: "m", sourceDuration: 5 })],
});

const MAIN = ["edit", "audioMenu", "textMenu", "sticker", "overlay", "effect", "filter", "adjust", "ratio", "background", "cover", "templates"];
const CLIP = ["split", "trim", "speed", "volume", "animate", "filter", "adjust", "crop", "transform", "opacity", "mask", "chroma", "keyframe", "transition", "replace", "reverse", "freeze", "duplicate", "delete", "select"];
const LAYER = ["trim", "speed", "volume", "animate", "filter", "adjust", "crop", "transform", "opacity", "mask", "blend", "chroma", "keyframe", "layerForward", "layerBack", "replace", "reverse", "duplicate", "delete"];
const without = (list: string[], ...gone: string[]) => list.filter((t) => !gone.includes(t));

test("nothing selected: the main bar; an empty project keeps only what needs no clip", () => {
  expect(contextFor(none, project)).toEqual({ bar: "main", tools: MAIN });
  expect(contextFor(none, makeProject())).toEqual({ bar: "main", tools: ["audioMenu", "effect", "ratio"] });
});

test("a main clip: the clip bar in the spec's order", () => {
  expect(contextFor({ ...none, clipId: "a" }, project)).toEqual({ bar: "clip", tools: CLIP });
});

test("clip rules: a photo has no Speed / Volume / Reverse / Freeze; a reversed clip no Volume; the last clip no Transition; one clip no Select", () => {
  expect(contextFor({ ...none, clipId: "p" }, project).tools).toEqual(without(CLIP, "speed", "volume", "reverse", "freeze"));
  expect(contextFor({ ...none, clipId: "r" }, project).tools).toEqual(without(CLIP, "volume"));
  expect(contextFor({ ...none, clipId: "z" }, project).tools).toEqual(without(CLIP, "transition"));
  const one = makeProject({ clips: [makeClip({ id: "a", sourceDuration: 4 })] });
  expect(contextFor({ ...none, clipId: "a" }, one).tools).toEqual(without(CLIP, "transition", "select"));
});

test("a layer: the layer bar; a photo layer has no Speed / Volume / Reverse; a reversed layer no Volume", () => {
  expect(contextFor({ ...none, clipId: "L" }, project)).toEqual({ bar: "layer", tools: LAYER });
  expect(contextFor({ ...none, clipId: "P" }, project)).toEqual({ bar: "layer", tools: without(LAYER, "speed", "volume", "reverse") });
  expect(contextFor({ ...none, clipId: "R" }, project).tools).toEqual(without(LAYER, "volume"));
  for (const id of ["L", "P", "R"]) for (const t of ["split", "freeze", "transition", "select", "background", "ratio"]) expect(contextFor({ ...none, clipId: id }, project).tools).not.toContain(t);
});

test("a text, a caption and a sticker", () => {
  const OVERLAY = ["overlayEdit", "animate", "keyframe", "overlayDuplicate", "overlayDelete"];
  expect(contextFor({ ...none, overlayId: "t" }, project)).toEqual({ bar: "text", tools: OVERLAY });
  expect(contextFor({ ...none, overlayId: "c" }, project)).toEqual({ bar: "text", tools: ["overlayEdit", "captions", "overlayDuplicate", "overlayDelete"] });
  expect(contextFor({ ...none, overlayId: "s" }, project)).toEqual({ bar: "sticker", tools: OVERLAY });
});

test("a sound and an effect", () => {
  expect(contextFor({ ...none, audioId: "m" }, project)).toEqual({ bar: "audio", tools: ["audioVolume", "audioFade", "audioDuplicate", "audioDelete", "addAudio"] });
  expect(contextFor({ ...none, effectId: "e" }, project)).toEqual({ bar: "effect", tools: ["effectStrength", "effectDuplicate", "effectDelete"] });
});

test("sections open a bar without a selection; a selection wins over the section; Text needs clips", () => {
  expect(contextFor({ ...none, section: "audio" }, project)).toEqual({ bar: "audio", tools: ["addAudio", "ducking", "beats"] });
  expect(contextFor({ ...none, section: "text" }, project)).toEqual({ bar: "text", tools: ["text", "captions"] });
  expect(contextFor({ ...none, section: "audio" }, makeProject())).toEqual({ bar: "audio", tools: ["addAudio", "ducking", "beats"] });
  expect(contextFor({ ...none, section: "text" }, makeProject()).bar).toBe("main");
  expect(contextFor({ ...none, section: "audio", clipId: "a" }, project).bar).toBe("clip");
  expect(contextFor({ ...none, section: "text", audioId: "m" }, project).tools).toEqual(["audioVolume", "audioFade", "audioDuplicate", "audioDelete", "addAudio"]);
});

test("an id that no longer exists counts as no selection", () => {
  for (const sel of [{ clipId: "gone" }, { overlayId: "gone" }, { effectId: "gone" }, { audioId: "gone" }]) expect(contextFor({ ...none, ...sel }, project)).toEqual({ bar: "main", tools: MAIN });
});

test("every tool id is reachable, and no bar lists a tool twice", () => {
  const sels: ToolbarSelection[] = [none, { ...none, section: "audio" }, { ...none, section: "text" }, { ...none, clipId: "a" }, { ...none, clipId: "L" },
    { ...none, overlayId: "t" }, { ...none, overlayId: "c" }, { ...none, overlayId: "s" }, { ...none, audioId: "m" }, { ...none, effectId: "e" }];
  const seen = new Set<string>();
  for (const sel of sels) {
    const { tools } = contextFor(sel, project);
    expect(new Set(tools).size).toBe(tools.length);
    for (const t of tools) seen.add(t);
  }
  expect([...seen].sort()).toEqual([...TOOL_IDS].sort());
  expect(TOOL_IDS).toHaveLength(48);
});

test("selectionKey names what is selected; multi-select first", () => {
  const s = { selectedClipId: null, selectedOverlayId: null, selectedEffectId: null, selectedAudioId: null, multiSelect: null };
  expect(selectionKey(s)).toBe("none");
  expect(selectionKey({ ...s, selectedClipId: "a" })).toBe("clip:a");
  expect(selectionKey({ ...s, selectedOverlayId: "t" })).toBe("overlay:t");
  expect(selectionKey({ ...s, selectedEffectId: "e" })).toBe("effect:e");
  expect(selectionKey({ ...s, selectedAudioId: "m" })).toBe("audio:m");
  expect(selectionKey({ ...s, multiSelect: [] })).toBe("multi");
  expect(selectionKey({ ...s, multiSelect: ["a", "b"], selectedClipId: "a" })).toBe("multi");
});
```

- [ ] **Step 2: Run** `npx.cmd jest src/editor/__tests__/toolbarContext.test.ts` → FAIL (module not found).
- [ ] **Step 3: Implement** `src/editor/toolbarContext.ts` (the `TOOL_IDS` constant and the types exactly as in Produces, then):

```ts
import { findItem } from "./model/timeline";
import { isPhoto, type Project } from "./model/types";

/** Keeps the tools whose condition holds (a missing condition = always). */
const keep = (list: [ToolId, boolean?][]): ToolId[] => list.filter(([, ok]) => ok !== false).map(([id]) => id);

/**
 * Which bar the editor shows and which tools are on it, in order. Pure: the toolbar component only renders this.
 * A tool that cannot be used for the selection for a lasting reason is left out (never returned and greyed).
 * `sel.clipId` is a main clip's or a layer's id. An id that no longer exists counts as no selection.
 */
export function contextFor(sel: ToolbarSelection, p: Project): ToolbarContext {
  const hasClips = p.clips.length > 0;
  if (sel.effectId && p.effects.some((e) => e.id === sel.effectId)) return { bar: "effect", tools: ["effectStrength", "effectDuplicate", "effectDelete"] };
  if (sel.audioId && p.audioTracks.some((t) => t.id === sel.audioId)) return { bar: "audio", tools: ["audioVolume", "audioFade", "audioDuplicate", "audioDelete", "addAudio"] };
  const overlay = sel.overlayId ? p.overlays.find((o) => o.id === sel.overlayId) : undefined;
  if (overlay) {
    if (overlay.kind === "caption") return { bar: "text", tools: ["overlayEdit", "captions", "overlayDuplicate", "overlayDelete"] };
    return { bar: overlay.kind === "sticker" ? "sticker" : "text", tools: ["overlayEdit", "animate", "keyframe", "overlayDuplicate", "overlayDelete"] };
  }
  const item = sel.clipId ? findItem(p, sel.clipId) : null;
  if (item) {
    const video = !isPhoto(item.clip);
    const sounds = video && !item.clip.reversed;
    if (item.layer) {
      return { bar: "layer", tools: keep([["trim"], ["speed", video], ["volume", sounds], ["animate"], ["filter"], ["adjust"], ["crop"], ["transform"], ["opacity"], ["mask"],
        ["blend"], ["chroma"], ["keyframe"], ["layerForward"], ["layerBack"], ["replace"], ["reverse", video], ["duplicate"], ["delete"]]) };
    }
    const hasNext = p.clips.findIndex((c) => c.id === item.clip.id) < p.clips.length - 1;
    return { bar: "clip", tools: keep([["split"], ["trim"], ["speed", video], ["volume", sounds], ["animate"], ["filter"], ["adjust"], ["crop"], ["transform"], ["opacity"], ["mask"],
      ["chroma"], ["keyframe"], ["transition", hasNext], ["replace"], ["reverse", video], ["freeze", video], ["duplicate"], ["delete"], ["select", p.clips.length >= 2]]) };
  }
  if (sel.section === "audio") return { bar: "audio", tools: ["addAudio", "ducking", "beats"] };
  if (sel.section === "text" && hasClips) return { bar: "text", tools: ["text", "captions"] };
  return { bar: "main", tools: keep([["edit", hasClips], ["audioMenu"], ["textMenu", hasClips], ["sticker", hasClips], ["overlay", hasClips], ["effect"],
    ["filter", hasClips], ["adjust", hasClips], ["ratio"], ["background", hasClips], ["cover", hasClips], ["templates", hasClips]]) };
}

/** The identity of what is selected. A strip remembers it when it opens and closes when it changes. */
export function selectionKey(s: SelectionState): string {
  if (s.multiSelect !== null) return "multi";
  if (s.selectedEffectId) return `effect:${s.selectedEffectId}`;
  if (s.selectedAudioId) return `audio:${s.selectedAudioId}`;
  if (s.selectedOverlayId) return `overlay:${s.selectedOverlayId}`;
  if (s.selectedClipId) return `clip:${s.selectedClipId}`;
  return "none";
}
```

- [ ] **Step 4:** `npm run typecheck`; `npm test`.
- [ ] **Step 5: Commit** — `git add src/editor/toolbarContext.ts src/editor/__tests__/toolbarContext.test.ts`; `feat(editor): toolbarContext — the bar and its tools as a pure function of the selection`.

---

### Task 2: `ToolStrip` kit component, the strip store and host, pilot strip (Opacity)

**Depends on:** Task 1 (`selectionKey`). **Parallel-safe with:** none (Task 3 edits the same toolbar file next).

**Files:** Create `src/ui/ToolStrip.tsx`, `src/ui/__tests__/ToolStrip.test.tsx`, `src/editor/toolStrip.ts`, `src/editor/__tests__/toolStrip.test.tsx`; modify `src/ui/Chip.tsx`, `src/ui/__tests__/kit.test.tsx` (one new case), `src/editor/components/OpacitySheet.tsx`, `src/editor/components/EditorToolbar.tsx`, `src/editor/components/MultiSelectBar.tsx`, `src/editor/__tests__/MultiSelectBar.test.tsx` (new cases only), `src/editor/__tests__/EditorToolbar.layers.test.tsx` (one existing test, see Step 1).

**Do not touch:** `src/ui/Sheet.tsx`, every other `*Sheet.tsx`, `src/editor/toolGroups.ts`, `app/editor/[id]/index.tsx`, `PreviewPlayer.tsx`, `Timeline.tsx`, `timelineScroll.ts`.

**Interfaces — Consumes:** `selectionKey`, `SelectionState` (Task 1); `useEditorStore` (`src/editor/store.ts`).

**Interfaces — Produces**

```ts
// src/ui/ToolStrip.tsx
/** Heights in points. `height` = the bottom area while a strip shows (1 hairline + header + tiles + slider + 1 spare); `lift` = how far it rises over the timeline. */
export const STRIP = { header: 36, tiles: 76, slider: 36, height: 150, lift: 64 } as const;
/** The bottom area while the bar shows (one row of tool buttons), without the bottom safe-area padding. */
export const BAR_HEIGHT = 86;
/** How many strips are showing. A bar hides its buttons while this is above zero. */
export const useStripPresence: UseBoundStore<StoreApi<{ count: number }>>
type ToolStripProps = { visible: boolean; onClose: () => void; title: string; note?: React.ReactNode; action?: { label: string; onPress: () => void }; children: React.ReactNode };
export function ToolStrip(props: ToolStripProps): React.JSX.Element | null
/** One horizontally scrolling row (height STRIP.tiles). `lead` (tab chips, a switch) stays fixed at the left. */
export function StripTiles(props: { lead?: React.ReactNode; children: React.ReactNode }): React.JSX.Element
/** One slider row (height STRIP.slider): a muted label at the left, the slider (the child) fills the width, `trailing` at the right. */
export function StripSlider(props: { label: string; trailing?: React.ReactNode; children: React.ReactNode }): React.JSX.Element
/** A muted one-line note for the strip's header. */
export function StripNote(props: TextProps): React.JSX.Element

// src/ui/Chip.tsx — one new optional prop
compact?: boolean      // smaller padding and 12-pt text: tab chips and Reset inside a strip

// src/editor/toolStrip.ts
export type StripId = "filter" | "adjust" | "speed" | "volume" | "opacity" | "mask" | "blend" | "chroma" | "transform" | "background"
  | "clipAnimation" | "overlayAnimation" | "transition" | "ratio" | "audioFade" | "audioVolume" | "effectStrength";
export type OpenStrip = { id: StripId; key: string; clipIndex: number | null };   // key = selectionKey when it opened; clipIndex: Transition only
export const useToolStrip: UseBoundStore<StoreApi<{ open: OpenStrip | null }>>
export function openStrip(id: StripId, clipIndex?: number | null): void
export function closeStrip(): void
/** Call once in the bottom area's component: closes the open strip when the selection key is no longer the one it opened with, and on unmount. */
export function useStripCloser(): void

// src/editor/components/MultiSelectBar.tsx
export const MULTI_BAR_HEIGHT = 104;
```

**Behaviour**

- `ToolStrip`: `visible` false → `null`. Visible → `<View testID="tool-strip">` of explicit height `STRIP.header + STRIP.tiles + STRIP.slider` (148), background `theme.colors.surface`; a header row (height `STRIP.header`) with the title (`Title size={15}`, `accessibilityRole="header"`), the note in a width-`flex: 1` box, the optional action (same `Pressable` as `Sheet`'s: role button, label = `action.label`), and a round ✓ `Pressable` (`accessibilityRole="button"`, `accessibilityLabel="Done"`, 32 × 32, `theme.colors.accent`, Ionicons `checkmark` in `theme.colors.onAccent`); then the body box (height `STRIP.tiles + STRIP.slider`, `justifyContent: "center"`). No `Modal`, no scrim, no `KeyboardAvoidingView`, no gesture, no animation.
- While visible it counts itself in `useStripPresence` (`useLayoutEffect`: +1, cleanup −1), so the host hides its bar before the first paint.
- `openStrip(id, clipIndex = null)` stores `{ id, key: selectionKey(useEditorStore.getState()), clipIndex }`. `closeStrip()` sets `open: null` (no-op when already null).
- Old toolbar (this task only wires the pilot; Task 3 rewrites the file): `useStripCloser()` is called; the Opacity tool calls `openStrip("opacity")`; `OpacitySheet` gets `visible={strip?.id === "opacity"}` and `onClose={closeStrip}`; while `useStripPresence` is above zero the two rows (tools and tabs) are not rendered. No fixed heights and no lift yet (Task 3) — in this intermediate state the bottom area is 150 + padding while a strip shows.
- `MultiSelectBar`: its root view gets `testID="multi-select-bar"` and an explicit height: `MULTI_BAR_HEIGHT + pad` normally; while a strip is present, `STRIP.height + pad` with `marginTop: -(STRIP.height - MULTI_BAR_HEIGHT)` and the "N selected" line and the button row are not rendered. Its three sheets and its local `sheet` state are unchanged.

- [ ] **Step 1: Failing tests.**

Create `src/ui/__tests__/ToolStrip.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react-native";
import { Text } from "react-native";
import { BAR_HEIGHT, STRIP, StripNote, StripSlider, StripTiles, ToolStrip, useStripPresence } from "../ToolStrip";

test("the height budget: bar 86, strip 150 = 1 + 36 + 76 + 36 + 1, lifted by two lanes", () => {
  expect(BAR_HEIGHT).toBe(86);
  expect(STRIP).toEqual({ header: 36, tiles: 76, slider: 36, height: 150, lift: 64 });
  expect(STRIP.height).toBe(1 + STRIP.header + STRIP.tiles + STRIP.slider + 1);
  expect(STRIP.lift).toBe(STRIP.height - BAR_HEIGHT);
});

test("renders inline with an explicit height: a header title, the note, the content — and no scrim", async () => {
  await render(<ToolStrip visible onClose={() => {}} title="Opacity" note={<StripNote>Shows in the exported video</StripNote>}><Text>body</Text></ToolStrip>);
  expect(screen.getByTestId("tool-strip")).toHaveStyle({ height: 148 });
  expect(screen.getByRole("header", { name: "Opacity" })).toBeTruthy();
  expect(screen.getByText("Shows in the exported video")).toBeTruthy();
  expect(screen.getByText("body")).toBeTruthy();
  expect(screen.queryByLabelText("Close sheet")).toBeNull();        // the modal Sheet's scrim
});

test("Done closes; the action runs", async () => {
  const onClose = jest.fn(), onAction = jest.fn();
  await render(<ToolStrip visible onClose={onClose} title="Filter" action={{ label: "Apply to all", onPress: onAction }}><Text>body</Text></ToolStrip>);
  await fireEvent.press(screen.getByRole("button", { name: "Apply to all" }));
  expect(onAction).toHaveBeenCalledTimes(1);
  await fireEvent.press(screen.getByRole("button", { name: "Done" }));
  expect(onClose).toHaveBeenCalledTimes(1);
});

test("hidden: renders nothing and is not counted; visible: counted while mounted", async () => {
  const view = await render(<ToolStrip visible={false} onClose={() => {}} title="Filter"><Text>body</Text></ToolStrip>);
  expect(screen.queryByText("body")).toBeNull();
  expect(useStripPresence.getState().count).toBe(0);
  await view.rerender(<ToolStrip visible onClose={() => {}} title="Filter"><Text>body</Text></ToolStrip>);
  expect(useStripPresence.getState().count).toBe(1);
  await view.rerender(<ToolStrip visible={false} onClose={() => {}} title="Filter"><Text>body</Text></ToolStrip>);
  expect(useStripPresence.getState().count).toBe(0);
  await view.rerender(<ToolStrip visible onClose={() => {}} title="Filter"><Text>body</Text></ToolStrip>);
  await view.unmount();
  expect(useStripPresence.getState().count).toBe(0);
});

test("rows have explicit heights; the slider row shows its label and trailing", async () => {
  await render(
    <ToolStrip visible onClose={() => {}} title="Adjust">
      <StripTiles lead={<Text>tabs</Text>}><Text>tile</Text></StripTiles>
      <StripSlider label="Brightness +35" trailing={<Text>reset</Text>}><Text>slider</Text></StripSlider>
    </ToolStrip>,
  );
  expect(screen.getByTestId("strip-tiles")).toHaveStyle({ height: 76 });
  expect(screen.getByTestId("strip-slider")).toHaveStyle({ height: 36 });
  for (const t of ["tabs", "tile", "Brightness +35", "slider", "reset"]) expect(screen.getByText(t)).toBeTruthy();
});
```

Append to `src/ui/__tests__/kit.test.tsx` (it already imports `theme`; add `import { Chip } from "../Chip";`):

```tsx
test("Chip compact is smaller and keeps role, label and states", async () => {
  await render(<Chip compact label="Reset" selected={false} disabled onPress={() => {}} />);
  const chip = screen.getByRole("button", { name: "Reset" });
  expect(chip).toBeDisabled();
  expect(chip).toHaveStyle({ paddingVertical: theme.space.xs, paddingHorizontal: theme.space.md });
});
```

Create `src/editor/__tests__/toolStrip.test.tsx`:

```tsx
import { act, fireEvent, render, screen } from "@testing-library/react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-05T10:00:00.000Z" }));
import { deleteClip } from "@/src/editor/model/ops";
import { makeClip, makeLayer, makeOverlay, makeProject } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { OpacitySheet } from "../components/OpacitySheet";
import { closeStrip, openStrip, useStripCloser, useToolStrip } from "../toolStrip";

const st = () => useEditorStore.getState();
const open = () => useToolStrip.getState().open;
/** What the bottom area does: the closer, and the strip for the selected clip. */
function Host() {
  useStripCloser();
  const strip = useToolStrip((s) => s.open);
  const id = useEditorStore((s) => s.selectedClipId);
  return <OpacitySheet clipId={id} visible={strip?.id === "opacity"} onClose={closeStrip} />;
}

beforeEach(() => {
  closeStrip();
  st().reset();
  st().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 4 }), makeClip({ id: "b", sourceDuration: 4 })], layers: [makeLayer({ id: "L", sourceDuration: 2 })], overlays: [makeOverlay({ id: "t" })] }));
});

test("openStrip remembers the selection it opened with; closeStrip clears it", () => {
  st().select("a");
  openStrip("opacity");
  expect(open()).toEqual({ id: "opacity", key: "clip:a", clipIndex: null });
  openStrip("transition", 0);
  expect(open()).toEqual({ id: "transition", key: "clip:a", clipIndex: 0 });
  closeStrip();
  expect(open()).toBeNull();
  st().select(null);
  openStrip("ratio");
  expect(open()?.key).toBe("none");
});

test("the strip shows inline for the selected clip and Done closes it", async () => {
  st().select("a");
  await render(<Host />);
  expect(screen.queryByTestId("tool-strip")).toBeNull();
  await act(() => { openStrip("opacity"); });
  expect(screen.getByRole("header", { name: "Opacity" })).toBeTruthy();
  expect(screen.queryByLabelText("Close sheet")).toBeNull();
  await fireEvent.press(screen.getByRole("button", { name: "Done" }));
  expect(open()).toBeNull();
  expect(screen.queryByTestId("tool-strip")).toBeNull();
});

test("it stays open through value changes, seeking and an undo that keeps the item", async () => {
  st().select("a");
  await render(<Host />);
  await act(() => { openStrip("opacity"); });
  await fireEvent(screen.getByTestId("opacity-slider"), "slidingStart");
  await fireEvent(screen.getByTestId("opacity-slider"), "valueChange", 0.4);
  await act(() => { st().seek(2); st().setPlaying(true); });
  expect(screen.getByText("Opacity 40 %")).toBeTruthy();
  expect(st().past).toHaveLength(1);
  await act(() => { st().undo(); });
  expect(screen.getByText("Opacity 100 %")).toBeTruthy();
  expect(open()?.id).toBe("opacity");
});

test("it closes when another item is selected, when the selection is cleared, and when the item is deleted", async () => {
  await render(<Host />);
  for (const change of [() => st().select("b"), () => st().select("L"), () => st().selectOverlay("t"), () => st().select(null), () => st().apply((p) => deleteClip(p, "a"))]) {
    await act(() => { st().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 4 }), makeClip({ id: "b", sourceDuration: 4 })], layers: [makeLayer({ id: "L", sourceDuration: 2 })], overlays: [makeOverlay({ id: "t" })] })); st().select("a"); openStrip("opacity"); });
    expect(open()?.id).toBe("opacity");
    await act(() => { change(); });
    expect(open()).toBeNull();
    expect(screen.queryByTestId("tool-strip")).toBeNull();
  }
});

test("it closes when multi-select is entered and when the host unmounts", async () => {
  st().select("a");
  const view = await render(<Host />);
  await act(() => { openStrip("opacity"); });
  await act(() => { st().enterMultiSelect(); });
  expect(open()).toBeNull();
  await act(() => { st().exitMultiSelect(); st().select("a"); openStrip("opacity"); });
  expect(open()?.id).toBe("opacity");
  await view.unmount();
  expect(open()).toBeNull();
});

test("a strip opened with nothing selected closes when something is selected", async () => {
  await render(<Host />);
  await act(() => { openStrip("ratio"); });
  expect(open()?.key).toBe("none");
  await act(() => { st().select("a"); });
  expect(open()).toBeNull();
});
```

Append to `src/editor/__tests__/MultiSelectBar.test.tsx` (add `ToolStrip` and `MULTI_BAR_HEIGHT` / `STRIP` imports and `Text` from react-native):

```tsx
test("the bar has an explicit height; while a strip shows it hides its buttons and lifts by the difference", async () => {
  st().enterMultiSelect(); st().toggleMultiSelect("a");
  const view = await render(<><MultiSelectBar /><ToolStrip visible={false} onClose={() => {}} title="X"><Text>x</Text></ToolStrip></>);
  expect(MULTI_BAR_HEIGHT).toBe(104);
  expect(screen.getByTestId("multi-select-bar")).toHaveStyle({ height: 104 + 8, marginTop: 0 });
  expect(header("1 selected")).toBeTruthy();
  await view.rerender(<><MultiSelectBar /><ToolStrip visible onClose={() => {}} title="X"><Text>x</Text></ToolStrip></>);
  expect(screen.getByTestId("multi-select-bar")).toHaveStyle({ height: STRIP.height + 8, marginTop: -(STRIP.height - 104) });
  expect(screen.queryByRole("header", { name: "1 selected" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Select all" })).toBeNull();
});
```

`src/editor/__tests__/EditorToolbar.layers.test.tsx` — in the existing test "Opacity, Mask and Trim open their sheets on the selected layer": after the three opacity assertions add

```tsx
  expect(screen.getByTestId("tool-strip")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Mask" })).toBeNull();     // the bar is hidden while the strip shows
  await fireEvent.press(btn("Done"));
```

(then the existing `press(btn("Mask"))` continues). Nothing else in that file changes in this task.

- [ ] **Step 2: Run** `npx.cmd jest src/ui src/editor/__tests__/toolStrip.test.tsx src/editor/__tests__/MultiSelectBar.test.tsx src/editor/__tests__/EditorToolbar.layers.test.tsx` → FAIL.
- [ ] **Step 3: Implement.**

`src/ui/ToolStrip.tsx`:

```tsx
import { Ionicons } from "@expo/vector-icons";
import { useLayoutEffect } from "react";
import { Pressable, ScrollView, View, type TextProps } from "react-native";
import { create } from "zustand";
import { theme } from "@/src/theme/theme";
import { Body, Title } from "./Text";

export const STRIP = { header: 36, tiles: 76, slider: 36, height: 150, lift: 64 } as const;
export const BAR_HEIGHT = 86;
export const useStripPresence = create<{ count: number }>(() => ({ count: 0 }));

const DONE_SIZE = 32;
const LABEL_WIDTH = 124;

type Props = { visible: boolean; onClose: () => void; title: string; note?: React.ReactNode; action?: { label: string; onPress: () => void }; children: React.ReactNode };

/**
 * An inline tool panel that takes the toolbar's place — NOT a Modal: no scrim, the preview and the timeline stay usable.
 * Every row has an explicit height; `flex: 1` only ever shares width inside such a row (never height).
 */
export function ToolStrip({ visible, onClose, title, note, action, children }: Props) {
  // Counted before paint, so the bar that hosts the strip is hidden in the same frame the strip appears.
  useLayoutEffect(() => {
    if (!visible) return;
    useStripPresence.setState((s) => ({ count: s.count + 1 }));
    return () => useStripPresence.setState((s) => ({ count: s.count - 1 }));
  }, [visible]);
  if (!visible) return null;
  return (
    <View testID="tool-strip" style={{ height: STRIP.header + STRIP.tiles + STRIP.slider, backgroundColor: theme.colors.surface }}>
      <View style={{ height: STRIP.header, flexDirection: "row", alignItems: "center", gap: theme.space.md, paddingHorizontal: theme.space.lg }}>
        <Title size={15} accessibilityRole="header">{title}</Title>
        <View style={{ flex: 1, height: STRIP.header, justifyContent: "center" }}>{note}</View>
        {action ? (
          <Pressable accessibilityRole="button" accessibilityLabel={action.label} onPress={action.onPress} hitSlop={8}>
            <Body weight="semi" style={{ color: theme.colors.accent, fontSize: 12 }}>{action.label}</Body>
          </Pressable>
        ) : null}
        <Pressable accessibilityRole="button" accessibilityLabel="Done" onPress={onClose} hitSlop={8}
          style={{ width: DONE_SIZE, height: DONE_SIZE, borderRadius: theme.radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.accent }}>
          <Ionicons name="checkmark" size={20} color={theme.colors.onAccent} />
        </Pressable>
      </View>
      <View style={{ height: STRIP.tiles + STRIP.slider, justifyContent: "center" }}>{children}</View>
    </View>
  );
}

export function StripTiles({ lead, children }: { lead?: React.ReactNode; children: React.ReactNode }) {
  return (
    <View testID="strip-tiles" style={{ height: STRIP.tiles, flexDirection: "row", alignItems: "center" }}>
      {lead ? <View style={{ flexDirection: "row", alignItems: "center", gap: theme.space.xs, paddingLeft: theme.space.lg }}>{lead}</View> : null}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={{ flex: 1, height: STRIP.tiles }}
        contentContainerStyle={{ alignItems: "center", gap: theme.space.sm, paddingHorizontal: theme.space.lg }}>
        {children}
      </ScrollView>
    </View>
  );
}

export function StripSlider({ label, trailing, children }: { label: string; trailing?: React.ReactNode; children: React.ReactNode }) {
  return (
    <View testID="strip-slider" style={{ height: STRIP.slider, flexDirection: "row", alignItems: "center", gap: theme.space.md, paddingHorizontal: theme.space.lg }}>
      <Body muted numberOfLines={1} style={{ fontSize: 12, width: LABEL_WIDTH }}>{label}</Body>
      <View style={{ flex: 1, height: STRIP.slider, justifyContent: "center" }}>{children}</View>
      {trailing}
    </View>
  );
}

export function StripNote({ style, ...rest }: TextProps) {
  return <Body muted numberOfLines={1} {...rest} style={[{ fontSize: 11 }, style]} />;
}
```

(Two strips in one test share the `strip-tiles` / `strip-slider` ids: use `getAllByTestId` there.)

`src/ui/Chip.tsx`: add `compact?: boolean` to `Props`; `paddingVertical: compact ? theme.space.xs : theme.space.sm`, `paddingHorizontal: compact ? theme.space.md : theme.space.lg`; the label's `fontSize: compact ? 12 : undefined`. Nothing else.

`src/editor/toolStrip.ts`:

```ts
import { useEffect } from "react";
import { create } from "zustand";
import { useEditorStore } from "./store";
import { selectionKey } from "./toolbarContext";

export type StripId = "filter" | "adjust" | "speed" | "volume" | "opacity" | "mask" | "blend" | "chroma" | "transform" | "background"
  | "clipAnimation" | "overlayAnimation" | "transition" | "ratio" | "audioFade" | "audioVolume" | "effectStrength";
export type OpenStrip = { id: StripId; key: string; clipIndex: number | null };

/** Which tool strip is open (null = none). Transient UI state: not saved, not undoable. */
export const useToolStrip = create<{ open: OpenStrip | null }>(() => ({ open: null }));

export function openStrip(id: StripId, clipIndex: number | null = null): void {
  useToolStrip.setState({ open: { id, key: selectionKey(useEditorStore.getState()), clipIndex } });
}
export function closeStrip(): void {
  if (useToolStrip.getState().open !== null) useToolStrip.setState({ open: null });
}

export function useStripCloser(): void {
  const key = useEditorStore(selectionKey);
  const open = useToolStrip((s) => s.open);
  useEffect(() => { if (open && open.key !== key) closeStrip(); }, [key, open]);
  useEffect(() => closeStrip, []);
}
```

`OpacitySheet.tsx` — the body becomes:

```tsx
    <ToolStrip visible={visible} onClose={onClose} title="Opacity">
      <StripSlider label={`Opacity ${Math.round(clip.opacity * 100)} %`}>
        <Slider testID="opacity-slider" /* the same props as today */ />
      </StripSlider>
    </ToolStrip>
```

(imports: `ToolStrip`, `StripSlider` from `@/src/ui/ToolStrip`; drop `Sheet` and `Body`.)

`EditorToolbar.tsx` (minimal): import `closeStrip`, `openStrip`, `useStripCloser`, `useToolStrip` and `useStripPresence`; after the other hooks `useStripCloser(); const strip = useToolStrip((s) => s.open); const stripShown = useStripPresence((s) => s.count > 0);` (before the `if (multi) return` line); remove `"opacity"` from the local `sheet` union; `opacity.onPress = () => openStrip("opacity")`; wrap the `Animated.View` row and the tab row in `{stripShown ? null : (<>…</>)}`; `<OpacitySheet clipId={selectedId} visible={strip?.id === "opacity"} onClose={closeStrip} />`.

`MultiSelectBar.tsx`: `export const MULTI_BAR_HEIGHT = 104;` · `const stripShown = useStripPresence((s) => s.count > 0);` (with the other hooks, before the early return) · `const pad = Math.max(insets.bottom, theme.space.sm);` · root: `testID="multi-select-bar"`, style adds `height: (stripShown ? STRIP.height : MULTI_BAR_HEIGHT) + pad, marginTop: stripShown ? -(STRIP.height - MULTI_BAR_HEIGHT) : 0` and `paddingBottom: pad` · the header `Body` and the `ScrollView` render only when `!stripShown`. The three sheets stay as they are.

- [ ] **Step 4:** `npm run typecheck`; `npm test` (the existing `LayerSheets.test.tsx` OpacitySheet cases must pass unedited).
- [ ] **Step 5: Commit** — `git add` the files above; `feat(ui): ToolStrip — an inline tool panel; strip store and closer; Opacity is the first strip`.

---

### Task 3: The contextual toolbar

**Depends on:** Tasks 1, 2. **Parallel-safe with:** none.

**Files:** Modify `src/editor/components/EditorToolbar.tsx` (rewrite), `src/editor/toolGroups.ts` (rewrite), `src/editor/components/TransportRow.tsx`, `app/editor/[id]/index.tsx`; tests: rewrite `src/editor/__tests__/EditorToolbar.test.tsx`, `src/editor/__tests__/EditorToolbar.layers.test.tsx`, `src/editor/__tests__/toolGroups.test.ts`; modify `src/editor/__tests__/CropScreen.test.tsx` (the one test that renders the toolbar), `src/editor/__tests__/TransportRow.test.tsx` (one new case).

**Do not touch:** every `*Sheet.tsx` / `*Panel.tsx` / `CropScreen.tsx` (they are opened exactly as today), `MultiSelectBar.tsx`, `src/ui/*`, `toolbarContext.ts`, `toolStrip.ts`, `store.ts`, `PreviewPlayer.tsx`, `Timeline.tsx`, `timelineScroll.ts`.

**Interfaces — Consumes:** `contextFor`, `selectionKey`, `TOOL_IDS`, `ToolId`, `BarId`, `Section` (Task 1); `openStrip`, `closeStrip`, `useToolStrip`, `useStripCloser`, `StripId` (Task 2); `useStripPresence`, `STRIP`, `BAR_HEIGHT` (Task 2); `clipAt(p, time): { clip; index; offsetInClip } | null`, `findItem`, `itemOffsetAt` (`timeline.ts`); the ops the old toolbar already imports plus `duplicateOverlay`; `useShallow` from `zustand/react/shallow`.

**Interfaces — Produces**

```ts
// src/editor/toolGroups.ts — the whole file
export type IoniconName = keyof typeof Ionicons.glyphMap;
export const TOOL_META: Record<ToolId, { label: string; icon: IoniconName }>
// (TOOL_GROUPS, ToolGroupId, groupForSelection and the old ToolId are deleted. `IoniconName` keeps its three importers.)

// src/editor/components/EditorToolbar.tsx
type PanelFor = { id: string; kind: "text" | "sticker" } | null;
type Props = { panelFor: PanelFor; onPanelChange: (next: PanelFor) => void };     // transitionFor / onTransitionChange are gone
export function EditorToolbar(props: Props): React.JSX.Element
// root view testID "editor-toolbar"; the bar row testID "toolbar-row"; the back arrow's accessibilityLabel "Back to main tools"
```

**`TOOL_META`** (label, icon):

| id | label | icon | id | label | icon |
|---|---|---|---|---|---|
| edit | Edit | film-outline | audioMenu | Audio | musical-notes |
| textMenu | Text | text | sticker | Stickers | happy |
| overlay | Overlay | layers | effect | Effects | flash |
| filter | Filter | color-filter | adjust | Adjust | options |
| ratio | Ratio | phone-portrait | background | Background | color-palette |
| cover | Cover | image-outline | templates | Templates | color-wand |
| split | Split | cut | trim | Trim | crop |
| speed | Speed | speedometer | volume | Volume | volume-high |
| animate | Animate | play-forward-outline | crop | Crop | crop |
| transform | Transform | resize | opacity | Opacity | contrast |
| mask | Mask | ellipse-outline | blend | Blend | layers-outline |
| chroma | Green screen | leaf-outline | keyframe | Keyframe | diamond-outline |
| transition | Transition | swap-horizontal | layerForward | Forward | arrow-up |
| layerBack | Back | arrow-down | replace | Replace | sync |
| reverse | Reverse | play-back | freeze | Freeze | snow |
| duplicate | Duplicate | copy | delete | Delete | trash |
| select | Select | checkmark-done | overlayEdit | Edit | create-outline |
| overlayDuplicate | Duplicate | copy | overlayDelete | Delete | trash |
| text | Add text | add-circle-outline | captions | Captions | chatbox-ellipses |
| addAudio | Add audio | add-circle-outline | ducking | Ducking | volume-low |
| beats | Beats | pulse | audioVolume | Volume | volume-medium |
| audioFade | Fade | trending-up | audioDuplicate | Duplicate | copy |
| audioDelete | Delete | trash | effectStrength | Strength | speedometer |
| effectDuplicate | Duplicate | copy | effectDelete | Delete | trash |

(Changed labels: `sticker` "Sticker" → "Stickers", `effect` "Effect" → "Effects", `text` "Text" → "Add text". Everything else is today's.)

**Behaviour**

- Hooks (all before any early return): the four selected ids; `overlayKind`; `[section, setSection] = useState<Section>(null)`; `[sheet, setSheet] = useState<"trim" | "addAudio" | "sticker" | "captions" | "templates" | "crop" | "effect" | "beats" | "cover" | null>(null)` (the sheets that stay modal); `const key = useEditorStore(selectionKey)`; `useEffect(() => { setSection(null); }, [key])`; `const bar = useEditorStore((s) => (s.project ? contextFor(selOf(s, section), s.project).bar : "main"))`; `const tools = useEditorStore(useShallow((s) => (s.project ? contextFor(selOf(s, section), s.project).tools : [])))` with `selOf = (s, section) => ({ clipId: s.selectedClipId, overlayId: s.selectedOverlayId, effectId: s.selectedEffectId, audioId: s.selectedAudioId, section })`; `strip`, `stripShown`, `useStripCloser()`; `selectedIndex`, `reversed`, `ducking`, `multi`, `pin`, `useClipMedia()`, `useFreezeFrame()` as today. **The toolbar never subscribes to the playhead directly** (only through `pin`, a primitive).
- `pin` no longer depends on a group: with an overlay selected it is that overlay's (a caption or the playhead outside `[start, end]` → `"off"`); otherwise the selected clip's or layer's through `findItem` + `itemOffsetAt` (today's Edit branch).
- Back arrow: `const s = useEditorStore.getState(); s.select(null); s.selectOverlay(null); s.selectEffect(null); s.selectAudio(null); setSection(null);`.
- `onPlayheadClip(then)`: `const { project, playhead, select } = useEditorStore.getState(); const hit = project ? clipAt(project, playhead) : null; if (!hit) return; select(hit.clip.id); then();` — select first, open second.
- Actions per tool (`ACTIONS: Record<ToolId, { onPress: () => void; disabled?: boolean; active?: boolean; icon?: IoniconName }>`; label and icon come from `TOOL_META`, `icon` here overrides):

| tool | onPress | disabled (momentary) / active |
|---|---|---|
| edit | `onPlayheadClip(() => {})` | |
| audioMenu / textMenu | `setSection("audio")` / `setSection("text")` | |
| sticker, effect, cover, templates, trim, crop, captions, addAudio, beats | `setSheet(...)` with today's id | |
| overlay | `void addOverlay()` | disabled: `mediaBusy` |
| filter, adjust | `bar === "main" ? onPlayheadClip(() => openStrip(id)) : openStrip(id)` | |
| background | `onPlayheadClip(() => openStrip("background"))` | |
| ratio | `openStrip("ratio")` | |
| speed, volume, transform, opacity, mask, blend, chroma | `openStrip(id)` | |
| animate | `openStrip(bar === "clip" \|\| bar === "layer" ? "clipAnimation" : "overlayAnimation")` | |
| keyframe | today's `toggleKeyframe` (overlay selected → `toggleOverlayKeyframe`, else the clip branch) | disabled: `pin === "off"`; active + icon `diamond`: `pin === "remove"` |
| transition | `openStrip("transition", selectedIndex)` | |
| split, reverse, freeze, duplicate, delete, select, replace, layerForward, layerBack, ducking | exactly today's handlers | replace disabled: `mediaBusy`; freeze disabled: `freezeBusy`; reverse active: `reversed`; ducking active: `ducking` |
| overlayEdit | `onPanelChange({ id: selectedOverlayId, kind: overlayKind === "sticker" ? "sticker" : "text" })` | |
| overlayDuplicate | `haptic("light"); apply((p) => duplicateOverlay(p, id));` then select the copy (the overlay right after the original in the list — the panels' own code) | |
| overlayDelete | `haptic("medium"); apply((p) => deleteOverlay(p, id));` (the store clears the selection) | |
| text | today's `addText` | |
| audioVolume, audioFade, effectStrength | `openStrip(id)` | |
| audioDuplicate, audioDelete, effectDuplicate, effectDelete | exactly today's handlers | |

  No other `disabled` exists: `noSel`, `layerSel`, `photoSel`, `hasClips`, `clipCount`, `canAnimate`, `motionOverlayKind`, `motionOverlayId`, `group` and the three `SELECTED_*_TOOLS` constants are deleted.
- Render: `if (multi) return <MultiSelectBar />;` (after the hooks). Else

```tsx
const pad = Math.max(insets.bottom, theme.space.sm);
<View testID="editor-toolbar" style={{ backgroundColor: theme.colors.surface, borderTopWidth: 1, borderTopColor: theme.colors.hairline, paddingBottom: pad,
  height: (stripShown ? STRIP.height : BAR_HEIGHT) + pad, marginTop: stripShown ? -STRIP.lift : 0 }}>
  {stripShown ? null : (
    <View testID="toolbar-row" style={{ height: BAR_HEIGHT - 1, flexDirection: "row", alignItems: "center" }}>
      {bar === "main" ? null : <IconButton name="chevron-back" accessibilityLabel="Back to main tools" onPress={back} />}
      <ScrollView key={bar} horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }}>
        {tools.map((id) => <ToolButton key={id} label={TOOL_META[id].label} icon={ACTIONS[id].icon ?? TOOL_META[id].icon} disabled={ACTIONS[id].disabled} active={ACTIONS[id].active} onPress={ACTIONS[id].onPress} />)}
      </ScrollView>
    </View>
  )}
  {/* the nine modal sheets + CropScreen + TextPanel + StickerPanel exactly as today (local `sheet` state / panelFor) */}
  {/* the seventeen strip components, each: visible={strip?.id === "<id>"} onClose={closeStrip} with today's id props */}
  <TransitionSheet clipIndex={strip?.clipIndex ?? 0} visible={strip?.id === "transition"} onClose={closeStrip} />
</View>
```

  The root must stay the component's outermost view (a direct child of the screen): the lift relies on it being a later sibling of the timeline inside the same parent. Strip id → component: filter `FilterSheet`, adjust `AdjustSheet`, speed `SpeedSheet`, volume `VolumeSheet`, opacity `OpacitySheet`, mask `MaskSheet`, blend `BlendSheet`, chroma `ChromaSheet`, transform `TransformSheet`, background `BackgroundSheet`, clipAnimation `ClipAnimationSheet` (all `clipId={selectedId}`), overlayAnimation `OverlayAnimationSheet overlayId={selectedOverlayId}`, ratio `RatioSheet`, audioFade `AudioFadeSheet target={selectedAudioId ? { type: "track", id: selectedAudioId } : null}`, audioVolume `AudioVolumeSheet trackId={selectedAudioId}`, effectStrength `EffectStrengthSheet effectId={selectedEffectId}`. Sixteen of them are still modal `Sheet`s after this task: they open and close through the store and the bar stays visible under their scrim, as today (the bar hides only when a `ToolStrip` is really showing).
- `TransportRow.tsx`: delete the `ratioOpen` state, the `RatioSheet` element and its import; the pill's `onPress` is `() => openStrip("ratio")`.
- `app/editor/[id]/index.tsx`: delete the `transitionFor` state; `onCutPress={(index) => { const clip = project?.clips[index]; if (!clip) return; useEditorStore.getState().select(clip.id); openStrip("transition", index); }}`; `<EditorToolbar panelFor={panelFor} onPanelChange={setPanelFor} />`; `onExport` calls `closeStrip()` first. Nothing else in the file changes (the order of the children stays: top bar, preview slot, transport row, timeline slot, toolbar, toast host).

- [ ] **Step 1: Failing tests.**

`src/editor/__tests__/toolGroups.test.ts` — replace the whole file:

```ts
import { TOOL_IDS } from "../toolbarContext";
import { TOOL_META } from "../toolGroups";

test("every tool id has a label and an icon, and nothing else is listed", () => {
  expect(Object.keys(TOOL_META).sort()).toEqual([...TOOL_IDS].sort());
  for (const id of TOOL_IDS) { expect(TOOL_META[id].label.length).toBeGreaterThan(0); expect(TOOL_META[id].icon.length).toBeGreaterThan(0); }
});

test("the labels the bars show", () => {
  const label = (ids: readonly string[]) => ids.map((id) => TOOL_META[id as keyof typeof TOOL_META].label);
  expect(label(["edit", "audioMenu", "textMenu", "sticker", "overlay", "effect", "filter", "adjust", "ratio", "background", "cover", "templates"]))
    .toEqual(["Edit", "Audio", "Text", "Stickers", "Overlay", "Effects", "Filter", "Adjust", "Ratio", "Background", "Cover", "Templates"]);
  expect(label(["text", "captions", "addAudio", "ducking", "beats", "layerForward", "layerBack", "chroma"])).toEqual(["Add text", "Captions", "Add audio", "Ducking", "Beats", "Forward", "Back", "Green screen"]);
});
```

`src/editor/__tests__/EditorToolbar.test.tsx` — keep the file's `jest.mock` lines and imports (add `closeStrip`, `useToolStrip` from `../toolStrip`, `BAR_HEIGHT`, `STRIP` from `@/src/ui/ToolStrip`); replace the helpers and add these tests:

```tsx
const renderBar = () => render(<EditorToolbar panelFor={null} onPanelChange={() => {}} />);
const st = () => useEditorStore.getState();
const btn = (name: string) => screen.getByRole("button", { name });
const gone = (name: string) => expect(screen.queryByRole("button", { name })).toBeNull();
/** Every button on screen, in order (with nothing open: the back arrow, then the bar's tools). */
const row = () => screen.getAllByRole("button").map((b) => b.props.accessibilityLabel as string);
/** Closes whatever tool is open: a strip's ✓ or a modal sheet's scrim. */
const closeTool = async () => { await fireEvent.press(screen.queryByRole("button", { name: "Done" }) ?? screen.getByLabelText("Close sheet")); };
const BACK = "Back to main tools";
const MAIN = ["Edit", "Audio", "Text", "Stickers", "Overlay", "Effects", "Filter", "Adjust", "Ratio", "Background", "Cover", "Templates"];
const CLIP = ["Split", "Trim", "Speed", "Volume", "Animate", "Filter", "Adjust", "Crop", "Transform", "Opacity", "Mask", "Green screen", "Keyframe", "Transition", "Replace", "Reverse", "Freeze", "Duplicate", "Delete", "Select"];

beforeEach(() => {
  closeStrip();
  st().reset();
  st().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 4 }), makeClip({ id: "b", sourceDuration: 4 })] }));
});

describe("bars", () => {
  const full = () => st().setProject(makeProject({
    clips: [makeClip({ id: "a", sourceDuration: 4 }), makeClip({ id: "b", sourceDuration: 4 })],
    overlays: [makeOverlay({ id: "t1", start: 1, end: 3 }), makeSticker({ id: "s1", start: 1, end: 3 }), makeOverlay({ id: "c1", kind: "caption", start: 1, end: 3 })],
    effects: [makeEffect({ id: "e1", type: "glow", start: 1, end: 3 })],
    audioTracks: [makeAudioTrack({ id: "m1", sourceDuration: 5 })],
  }));

  test("nothing selected: the main bar, no tabs, no back arrow", async () => {
    await renderBar();
    expect(row()).toEqual(MAIN);
    expect(screen.queryAllByRole("tab")).toHaveLength(0);
  });

  test("the bar follows the selection", async () => {
    full();
    await renderBar();
    await act(() => { st().select("a"); });
    expect(row()).toEqual([BACK, ...CLIP]);
    await act(() => { st().selectOverlay("t1"); });
    expect(row()).toEqual([BACK, "Edit", "Animate", "Keyframe", "Duplicate", "Delete"]);
    await act(() => { st().selectOverlay("c1"); });
    expect(row()).toEqual([BACK, "Edit", "Captions", "Duplicate", "Delete"]);
    await act(() => { st().selectOverlay("s1"); });
    expect(row()).toEqual([BACK, "Edit", "Animate", "Keyframe", "Duplicate", "Delete"]);
    await act(() => { st().selectAudio("m1"); });
    expect(row()).toEqual([BACK, "Volume", "Fade", "Duplicate", "Delete", "Add audio"]);
    await act(() => { st().selectEffect("e1"); });
    expect(row()).toEqual([BACK, "Strength", "Duplicate", "Delete"]);
    await act(() => { st().selectEffect(null); });
    expect(row()).toEqual(MAIN);
  });

  test("the back arrow clears the selection and shows the main bar", async () => {
    full();
    await renderBar();
    for (const pick of [() => st().select("a"), () => st().selectOverlay("t1"), () => st().selectAudio("m1"), () => st().selectEffect("e1")]) {
      await act(() => { pick(); });
      await fireEvent.press(btn(BACK));
      expect(st()).toMatchObject({ selectedClipId: null, selectedOverlayId: null, selectedEffectId: null, selectedAudioId: null });
      expect(row()).toEqual(MAIN);
    }
    expect(st().past).toHaveLength(0);
  });

  test("no button is rendered disabled, except Keyframe off its item", async () => {
    full();
    await renderBar();
    const disabled = () => screen.getAllByRole("button").filter((b) => b.props.accessibilityState?.disabled).map((b) => b.props.accessibilityLabel);
    expect(disabled()).toEqual([]);
    await act(() => { st().select("a"); st().seek(1); });
    expect(disabled()).toEqual([]);
    await act(() => { st().seek(6); });                 // the playhead is on b
    expect(disabled()).toEqual(["Keyframe"]);
    await act(() => { st().selectOverlay("t1"); st().seek(2); });
    expect(disabled()).toEqual([]);
    await act(() => { st().selectAudio("m1"); });
    expect(disabled()).toEqual([]);
  });

  test("tools that do not apply are not there: a photo, the last clip, one clip, an empty project", async () => {
    st().setProject(makeProject({ clips: [makePhotoClip({ id: "p" }), makeClip({ id: "z", sourceDuration: 4 })] }));
    await renderBar();
    await act(() => { st().select("p"); });
    for (const l of ["Speed", "Volume", "Reverse", "Freeze"]) gone(l);
    expect(btn("Transition")).toBeEnabled();
    await act(() => { st().select("z"); });
    gone("Transition");
    expect(btn("Speed")).toBeEnabled();
    await act(() => { st().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 4 })] })); st().select("a"); });
    gone("Select");
    await act(() => { st().setProject(makeProject()); });
    expect(row()).toEqual(["Audio", "Effects", "Ratio"]);
  });

  test("the bottom area has an explicit height and does not lift while the bar shows", async () => {
    await renderBar();
    expect(screen.getByTestId("editor-toolbar")).toHaveStyle({ height: BAR_HEIGHT + 8, marginTop: 0 });
    await act(() => { st().select("a"); });
    expect(screen.getByTestId("editor-toolbar")).toHaveStyle({ height: BAR_HEIGHT + 8, marginTop: 0 });
  });
});

describe("main bar entries", () => {
  test("Edit selects the clip under the playhead without seeking or an undo step", async () => {
    await renderBar();
    await act(() => { st().seek(5); });
    await fireEvent.press(btn("Edit"));
    expect(st()).toMatchObject({ selectedClipId: "b", playhead: 5 });
    expect(st().past).toHaveLength(0);
    expect(row()[1]).toBe("Split");
  });

  test("Audio opens the audio bar without a selection: Add audio, Ducking, Beats; back returns", async () => {
    await renderBar();
    await fireEvent.press(btn("Audio"));
    expect(row()).toEqual([BACK, "Add audio", "Ducking", "Beats"]);
    await fireEvent.press(btn("Ducking"));
    expect(st().project?.ducking).toBe(true);
    expect(btn("Ducking")).toBeSelected();
    await fireEvent.press(btn("Beats"));
    expect(screen.getByRole("header", { name: "Beat markers" })).toBeTruthy();
    await closeTool();
    await fireEvent.press(btn(BACK));
    expect(row()).toEqual(MAIN);
  });

  test("Text opens the text bar without a selection; Add text adds, selects and asks for the panel", async () => {
    const onPanelChange = jest.fn();
    await render(<EditorToolbar panelFor={null} onPanelChange={onPanelChange} />);
    await fireEvent.press(btn("Text"));
    expect(row()).toEqual([BACK, "Add text", "Captions"]);
    await fireEvent.press(btn("Add text"));
    const added = st().project!.overlays[0];
    expect(st().selectedOverlayId).toBe(added.id);
    expect(onPanelChange).toHaveBeenCalledWith({ id: added.id, kind: "text" });
    expect(row()).toEqual([BACK, "Edit", "Animate", "Keyframe", "Duplicate", "Delete"]);
  });

  test("a section is left when something is selected, and does not come back", async () => {
    await renderBar();
    await fireEvent.press(btn("Audio"));
    await act(() => { st().select("a"); });
    expect(row()[1]).toBe("Split");
    await act(() => { st().select(null); });
    expect(row()).toEqual(MAIN);
  });

  test("Filter, Adjust and Background act on the clip under the playhead: it is selected, then the tool opens on it", async () => {
    for (const [tool, probe] of [["Filter", "Warm"], ["Adjust", "Brightness"], ["Background", "Blur"]] as const) {
      await act(() => { closeStrip(); st().select(null); st().seek(5); });
      const view = await renderBar();
      await fireEvent.press(btn(tool));
      expect(st().selectedClipId).toBe("b");
      expect(useToolStrip.getState().open).toMatchObject({ id: tool.toLowerCase(), key: "clip:b" });
      expect(btn(probe)).toBeTruthy();
      await view.unmount();
    }
  });

  test("Stickers, Effects, Cover and Templates open today's sheets; Ratio opens the ratio tool", async () => {
    await renderBar();
    await fireEvent.press(btn("Effects"));
    expect(screen.getByRole("header", { name: "Effects" })).toBeTruthy();
    await closeTool();
    await fireEvent.press(btn("Cover"));
    expect(screen.getByRole("header", { name: "Cover" })).toBeTruthy();
    await closeTool();
    await fireEvent.press(btn("Templates"));
    expect(btn("Random template")).toBeTruthy();
    await closeTool();
    await fireEvent.press(btn("Ratio"));
    expect(useToolStrip.getState().open).toMatchObject({ id: "ratio", key: "none" });
    await fireEvent.press(btn("1:1"));
    expect(st().project?.aspectRatio).toBe("1:1");
    expect(useToolStrip.getState().open).toBeNull();
  });
});

describe("text and sticker bars", () => {
  const withOverlays = () => st().setProject(makeProject({
    clips: [makeClip({ id: "a", sourceDuration: 4 })],
    overlays: [makeOverlay({ id: "t1", start: 1, end: 3 }), makeSticker({ id: "s1", start: 1, end: 3 }), makeOverlay({ id: "c1", kind: "caption", start: 1, end: 3 })],
  }));

  test("Edit asks for the text panel (a text, a caption) or the sticker panel (a sticker)", async () => {
    withOverlays();
    const onPanelChange = jest.fn();
    await render(<EditorToolbar panelFor={null} onPanelChange={onPanelChange} />);
    for (const [id, kind] of [["t1", "text"], ["c1", "text"], ["s1", "sticker"]] as const) {
      await act(() => { st().selectOverlay(id); });
      await fireEvent.press(btn("Edit"));
      expect(onPanelChange).toHaveBeenLastCalledWith({ id, kind });
    }
  });

  test("Duplicate copies the overlay in one undo step and selects the copy; Delete removes it and the main bar shows", async () => {
    withOverlays();
    await renderBar();
    await act(() => { st().selectOverlay("t1"); });
    await fireEvent.press(btn("Duplicate"));
    const list = st().project!.overlays;
    expect(list).toHaveLength(4);
    expect(st().selectedOverlayId).toBe(list[1].id);
    expect(st().past).toHaveLength(1);
    await fireEvent.press(btn("Delete"));
    expect(st().project!.overlays).toHaveLength(3);
    expect(st().past).toHaveLength(2);
    expect(st().selectedOverlayId).toBeNull();
    expect(row()).toEqual(MAIN);
  });

  test("Animate opens the overlay animation for a text and the clip animation for a clip", async () => {
    withOverlays();
    await renderBar();
    await act(() => { st().selectOverlay("t1"); });
    await fireEvent.press(btn("Animate"));
    expect(useToolStrip.getState().open?.id).toBe("overlayAnimation");
    expect(btn("Loop")).toBeTruthy();
    await closeTool();
    await act(() => { st().select("a"); });
    await fireEvent.press(btn("Animate"));
    expect(useToolStrip.getState().open?.id).toBe("clipAnimation");
    expect(btn("Combo")).toBeTruthy();
  });
});

describe("strips and the bar", () => {
  test("while a strip shows the bar is hidden and the bottom area is taller and lifted; Done brings the bar back", async () => {
    await renderBar();
    await act(() => { st().select("a"); });
    await fireEvent.press(btn("Opacity"));
    expect(screen.getByRole("header", { name: "Opacity" })).toBeTruthy();
    expect(screen.queryByTestId("toolbar-row")).toBeNull();
    gone("Split"); gone(BACK);
    expect(screen.getByTestId("editor-toolbar")).toHaveStyle({ height: STRIP.height + 8, marginTop: -STRIP.lift });
    await fireEvent.press(btn("Done"));
    expect(row()).toEqual([BACK, ...CLIP]);
    expect(screen.getByTestId("editor-toolbar")).toHaveStyle({ height: BAR_HEIGHT + 8, marginTop: 0 });
    expect(st().past).toHaveLength(0);
  });

  test("selecting another clip, clearing the selection or deleting the item closes the strip", async () => {
    await renderBar();
    for (const change of [() => st().select("b"), () => st().select(null), () => st().apply((p) => deleteClip(p, "a"))]) {
      await act(() => { st().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 4 }), makeClip({ id: "b", sourceDuration: 4 })] })); st().select("a"); });
      await fireEvent.press(btn("Opacity"));
      expect(screen.getByTestId("tool-strip")).toBeTruthy();
      await act(() => { change(); });
      expect(screen.queryByTestId("tool-strip")).toBeNull();
      expect(screen.getByTestId("toolbar-row")).toBeTruthy();
    }
  });

  test("Transition on the clip bar opens for the selected clip's cut", async () => {
    await renderBar();
    await act(() => { st().select("a"); });
    await fireEvent.press(btn("Transition"));
    expect(useToolStrip.getState().open).toEqual({ id: "transition", key: "clip:a", clipIndex: 0 });
    expect(btn("Dissolve")).toBeTruthy();
  });
});

describe("Select (multi-select)", () => {
  test("pressing Select replaces the toolbar with the action bar; Done brings the main bar back", async () => {
    await renderBar();
    await act(() => { st().select("a"); });
    await fireEvent.press(btn("Select"));
    expect(st()).toMatchObject({ multiSelect: ["a"], selectedClipId: null });
    expect(screen.getByRole("header", { name: "1 selected" })).toBeTruthy();
    expect(screen.queryByTestId("editor-toolbar")).toBeNull();
    for (const l of ["Delete", "Duplicate", "Filter", "Speed", "Volume", "Select all", "Done"]) expect(btn(l)).toBeTruthy();
    gone("Split");
    await fireEvent.press(btn("Done"));
    expect(st().multiSelect).toBeNull();
    expect(row()).toEqual(MAIN);
  });

  test("entering multi-select closes an open strip", async () => {
    await renderBar();
    await act(() => { st().select("a"); });
    await fireEvent.press(btn("Opacity"));
    await act(() => { st().enterMultiSelect(); });
    expect(useToolStrip.getState().open).toBeNull();
    expect(screen.getByRole("header", { name: "1 selected" })).toBeTruthy();   // the mode starts with the selected clip chosen
  });
});
```

(import `deleteClip` from `@/src/editor/model/ops`.)

**Migrating the existing cases of `EditorToolbar.test.tsx`** (every one is either kept with the edits below, or deleted because a test above replaces it — do not leave a case that presses a tab):

| Existing case(s) | What to do |
|---|---|
| "clip tools are disabled without a selection; Ratio is always enabled"; "five group tabs…"; "selecting a clip keeps Effects/Audio…"; "selecting a sticker overlay shows Stickers…"; "Edit group lists the new tools"; "Transform, Reverse, Crop, Replace and Freeze need a selection…" (keep only its last assertion in a new case "Freeze is enabled for a selected video clip"); "Freeze is disabled without a selection"; "Background needs a selection"; "Speed is disabled without a selection…"; "Adjust is disabled without a selection…" (keep its "opens the sheet" half with a clip selected); "Cover closes the Edit row…" (replaced by the main-bar tests); "Animate and Keyframe › sit after Transform…", "› both are disabled without a selection in every group", "› the tools follow the group…"; "Select › Select is disabled with one clip…"; "Select › pressing Select…"; "Effects › selecting an effect jumps to Effects and shows exactly…", "› a second effect can be added while one is selected", "› selecting a clip instead restores the normal Effects tools…"; "Audio › the Audio group lists…", "› selecting a track jumps to Audio and shows exactly…" | **Delete** (covered by `describe("bars")`, `"main bar entries"`, `"Select"` above and by `toolbarContext.test.ts`) |
| "Text is disabled for an empty project"; "Cover is disabled for an empty project" | Replace both by the empty-project assertion in "tools that do not apply are not there" (already above) — delete |
| "Templates is enabled without a selection…" | Keep; remove `openGroup` |
| "Text adds an overlay at the playhead and selects it" | Keep; press `Text` then `Add text` |
| "a photo selection disables Reverse, Freeze, Speed and Volume but keeps Transform and Background" | Rewrite: with the photo selected `gone("Reverse")`, `gone("Freeze")`, `gone("Speed")`, `gone("Volume")`, `btn("Transform")` enabled (Background is a main-bar tool: drop that half) |
| "a reversed clip disables Volume" | Rewrite: `gone("Volume")` |
| "Volume is enabled after selecting a clip" | Keep; remove `openGroup` |
| "Transform and Background open their sheets" | Keep the Transform half (select `a`, press Transform, `Rotate 90°` shows) |
| Everything in `describe("Replace")`; "pressing Freeze runs the freeze capture…"; "Reverse toggles the clip and shows active…"; "Split cuts at the playhead; Duplicate and Delete act on the selection" | Keep; only the render call changes (`renderBar()`); any `toBeDisabled()` on a no-selection bar becomes `gone(...)` |
| `describe("Effects on the timeline")`: "Effect is enabled whenever a project is open…", "adding from the sheet selects the effect…", "Strength opens…", "Duplicate copies the effect…", "Delete removes the effect…" | Keep; the tool's label is `Effects`; remove `openGroup` and the `subRow` helper (after adding, `row()` is `[BACK, "Strength", "Duplicate", "Delete"]`; after Delete it is `MAIN`) |
| `describe("Audio tools")`: "Beats opens…", "Ducking toggles…" | Keep; reach them with `press(btn("Audio"))` instead of `openGroup("Audio")` |
| "with a track selected, Add audio opens the sheet without deselecting"; "Duplicate copies the track…"; "Duplicate at the track limit…"; "Delete removes the track…" | Keep; remove `openGroup`; after Delete `row()` is `MAIN` |
| "Volume opens the selected track's volume sheet, Fade its fade sheet" | Keep; insert `await closeTool();` between the Volume part and `press(btn("Fade"))` |
| `describe("Animate and Keyframe")`: "Edit: a selected clip enables Animate; Keyframe also needs the playhead on that clip", "Edit: Keyframe adds a pin…", "Edit: Animate opens the clip animation sheet", "Text: a selected text enables both inside its range…", "Text: Keyframe toggles a pin on the text and Animate opens the overlay sheet", "Stickers: a selected sticker enables both…" | Keep; delete the `getByRole("tab", …)` lines; "a caption selection disables both" becomes `gone("Animate"); gone("Keyframe")` |
| "Select › entering with clip a selected starts with it chosen" | Keep |

Rule for every kept case: between two presses of bar tools that each open something, call `await closeTool();`.

**`EditorToolbar.layers.test.tsx`** — same helpers (`renderBar` without the transition props, `gone`, `closeTool`, `BACK`); replace the `EDIT` constant by

```tsx
const LAYER = ["Trim", "Speed", "Volume", "Animate", "Filter", "Adjust", "Crop", "Transform", "Opacity", "Mask", "Blend", "Green screen", "Keyframe", "Forward", "Back", "Replace", "Reverse", "Duplicate", "Delete"];
```

| Existing case | What to do |
|---|---|
| "Edit lists Overlay, Opacity and Mask; Forward / Back only show for a selected layer" | Rewrite: nothing selected → `gone("Forward")`; clip `a` selected → `gone("Forward")`, `gone("Back")`, `gone("Blend")`; layer `L` selected → `row()` equals `[BACK, ...LAYER]` |
| "no selection: Opacity and Mask are disabled, Overlay is enabled; an empty project disables Overlay" | Rewrite: no selection → `gone("Opacity")`, `gone("Mask")`, `btn("Overlay")` enabled; empty project → `gone("Overlay")` |
| "a main clip selection keeps every rule and enables Opacity and Mask" | Rewrite: `a` selected → every label of the clip bar is enabled except possibly Keyframe (seek to 1 first, then all are enabled) |
| "a video layer selection: … Split, Freeze, Ratio, Transition and Background are disabled" | Rewrite: `L` selected → `gone` for Split, Freeze, Ratio, Transition, Background, Select; the rest of `LAYER` enabled (seek to 1.5 so Keyframe is on) |
| "a photo layer selection follows the photo rules: no Reverse, Speed or Volume" | Rewrite with `gone` |
| "a reversed layer shows Reverse active and disables Volume" | `btn("Reverse")` selected; `gone("Volume")` |
| "Blend is enabled only for a layer; Green screen for any clip or layer" | Rewrite: none → both gone; `a` → `gone("Blend")`, Green screen enabled; `L`, `P` → both enabled |
| "Opacity, Mask and Trim open their sheets on the selected layer"; "Blend and Green screen open their sheets on the selected layer" | Keep; `await closeTool();` between tools (replaces the `press(btn("Done"))` Task 2 added) |
| the Forward / Back, Keyframe, Delete / Duplicate, the three Duplicate-refusal cases, "Overlay picks one item…" | Keep; remove `openGroup`; "Overlay picks…" starts with nothing selected |

`CropScreen.test.tsx` — "the Crop tool is disabled without a selection and opens the screen for a video or a photo": render `<EditorToolbar panelFor={null} onPanelChange={() => {}} />`; the first assertion becomes `expect(screen.queryByRole("button", { name: "Crop" })).toBeNull();`; the rest is unchanged. Rename the case "the Crop tool is not on the main bar and opens the screen for a video or a photo".

`TransportRow.test.tsx` — add (import `closeStrip`, `useToolStrip` from `../toolStrip`):

```tsx
test("the ratio pill opens the ratio strip", async () => {
  await render(<TransportRow />);
  await fireEvent.press(screen.getByRole("button", { name: "Aspect ratio" }));
  expect(useToolStrip.getState().open).toMatchObject({ id: "ratio" });
  expect(screen.queryByRole("button", { name: "1:1" })).toBeNull();     // the row no longer owns a sheet
  closeStrip();
});
```

- [ ] **Step 2: Run** `npx.cmd jest src/editor/__tests__/EditorToolbar src/editor/__tests__/toolGroups.test.ts src/editor/__tests__/CropScreen.test.tsx src/editor/__tests__/TransportRow.test.tsx` → FAIL.
- [ ] **Step 3: Implement** as described under Produces and Behaviour. `toolGroups.ts` becomes `IoniconName` + `TOOL_META` (import `type { ToolId } from "./toolbarContext"`). Confirm with Grep that nothing imports `TOOL_GROUPS`, `groupForSelection`, `ToolGroupId` or `ToolId` from `toolGroups` any more.
- [ ] **Step 4:** `npm run typecheck`; `npm test`. Confirm `git diff --stat` shows no change to `PreviewPlayer.tsx`, `Timeline.tsx`, `timelineScroll.ts`, `store.ts` or any `*Sheet.tsx`.
- [ ] **Step 5: Commit** — `git add` the nine files above (explicit paths; quote `"app/editor/[id]/index.tsx"`); `feat(editor): contextual toolbar — one bar that follows the selection, with a back arrow`.

---

### Task 4: Slider strips — Volume, Fade, a sound's Volume, Strength

**Depends on:** Tasks 2, 3. **Parallel-safe with:** Tasks 5, 6, 7.

**Files:** Modify `src/editor/components/VolumeSheet.tsx`, `AudioFadeSheet.tsx`, `AudioVolumeSheet.tsx`, `EffectStrengthSheet.tsx`; create `src/editor/__tests__/strips.sliders.test.tsx`.

**Do not touch:** any other component, `EditorToolbar.tsx`, `MultiSelectBar.tsx`, `src/ui/*`, and every existing test file — `VolumeSheet.test.tsx`, `AudioTrackSheets.test.tsx`, `EffectSheet.test.tsx`, `LayerSheets.test.tsx`, `MultiSelectBar.test.tsx`, `EditorToolbar*.test.tsx` must pass **unedited** (if one fails, fix the component; if it truly asserts something the strip cannot keep, stop and report it).

**Interfaces — Consumes:** `ToolStrip`, `StripSlider`, `StripNote` (Task 2). **Produces:** no signature changes. `FadeSliders` (exported from `AudioFadeSheet.tsx`, used by `VolumeSheet.tsx`) keeps its props and now renders two `StripSlider` rows.

**Layout (spec §3.5, pattern c)**

- `EffectStrengthSheet`: `<ToolStrip title="Strength">` · `<StripSlider label={`Strength ${Math.round(effect.intensity * 100)}`}>` + the slider `effect-strength`.
- `AudioVolumeSheet`: title "Volume", `note={<StripNote>Above 100% only applies in the exported video.</StripNote>}` · `<StripSlider label={`Volume ${Math.round(track.volume * 100)} %`}>` + `audio-volume`.
- `FadeSliders`: each of the two becomes `<StripSlider key={key} label={`${label} ${value.toFixed(1)} s`}>` + its slider (`fade-in` / `fade-out`, same props); the fragment of two stays.
- `AudioFadeSheet`: title "Fade" · `<FadeSliders … />`.
- `VolumeSheet`: title as today (`Volume` / `` `Volume · ${count} clips` ``), the same note · `<StripSlider label={`${Math.round(clip.volume * 100)}%`} trailing={<View style={{ flexDirection: "row", alignItems: "center", gap: theme.space.sm }}><Body style={{ fontSize: 12 }}>Mute</Body><Switch accessibilityLabel="Mute" … /></View>}>` + `volume-slider` · then `FadeSliders` under today's condition (`!isPhoto(clip) && !clipIds`). Three rows of 36 = 108 ≤ the body's 112.
- The sliders keep every prop (ids, ranges, steps, tints, `onSlidingStart={beginTransaction}`, `onValueChange` → `applyTransient`). Remove the `Sheet` import from all four files.

- [ ] **Step 1: Failing tests.** Create `src/editor/__tests__/strips.sliders.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-05T10:00:00.000Z" }));
import { makeAudioTrack, makeClip, makeEffect, makePhotoClip, makeProject } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { AudioFadeSheet } from "../components/AudioFadeSheet";
import { AudioVolumeSheet } from "../components/AudioVolumeSheet";
import { EffectStrengthSheet } from "../components/EffectStrengthSheet";
import { VolumeSheet } from "../components/VolumeSheet";

const st = () => useEditorStore.getState();
beforeEach(() => {
  st().reset();
  st().setProject(makeProject({
    clips: [makeClip({ id: "a", sourceDuration: 4 }), makeClip({ id: "b", sourceDuration: 6 }), makePhotoClip({ id: "p" })],
    effects: [makeEffect({ id: "e", type: "glow", start: 1, end: 3 })],
    audioTracks: [makeAudioTrack({ id: "m", sourceDuration: 5 })],
  }));
});
/** A strip, not a modal sheet: inline, no scrim, ✓ closes. */
const expectStrip = async (title: string, onClose: jest.Mock) => {
  expect(screen.getByTestId("tool-strip")).toBeTruthy();
  expect(screen.getByRole("header", { name: title })).toBeTruthy();
  expect(screen.queryByLabelText("Close sheet")).toBeNull();
  await fireEvent.press(screen.getByRole("button", { name: "Done" }));
  expect(onClose).toHaveBeenCalledTimes(1);
};

test("Strength is a strip with one slider row", async () => {
  const onClose = jest.fn();
  await render(<EffectStrengthSheet effectId="e" visible onClose={onClose} />);
  expect(screen.getAllByTestId("strip-slider")).toHaveLength(1);
  await fireEvent(screen.getByTestId("effect-strength"), "slidingStart");
  await fireEvent(screen.getByTestId("effect-strength"), "valueChange", 0.35);
  expect(screen.getByText("Strength 35")).toBeTruthy();
  expect(st().past).toHaveLength(1);
  await expectStrip("Strength", onClose);
});

test("a sound's Volume is a strip with the export note in its header", async () => {
  const onClose = jest.fn();
  await render(<AudioVolumeSheet trackId="m" visible onClose={onClose} />);
  expect(screen.getByText("Above 100% only applies in the exported video.")).toBeTruthy();
  expect(screen.getAllByTestId("strip-slider")).toHaveLength(1);
  await expectStrip("Volume", onClose);
});

test("Fade is a strip with two slider rows; a drag is one undo step", async () => {
  const onClose = jest.fn();
  await render(<AudioFadeSheet target={{ type: "track", id: "m" }} visible onClose={onClose} />);
  expect(screen.getAllByTestId("strip-slider")).toHaveLength(2);
  await fireEvent(screen.getByTestId("fade-in"), "slidingStart");
  await fireEvent(screen.getByTestId("fade-in"), "valueChange", 1);
  await fireEvent(screen.getByTestId("fade-in"), "valueChange", 1.5);
  expect(screen.getByText("Fade in 1.5 s")).toBeTruthy();
  expect(st().past).toHaveLength(1);
  await expectStrip("Fade", onClose);
});

test("a clip's Volume: three rows for a video (volume with Mute, fade in, fade out), one for a photo and in clipIds mode", async () => {
  const onClose = jest.fn();
  const view = await render(<VolumeSheet clipId="a" visible onClose={onClose} />);
  expect(screen.getAllByTestId("strip-slider")).toHaveLength(3);
  expect(screen.getByLabelText("Mute")).toBeTruthy();
  expect(screen.getByText("Above 100% only applies in the exported video.")).toBeTruthy();
  await expectStrip("Volume", onClose);
  await view.rerender(<VolumeSheet clipId="p" visible onClose={onClose} />);
  expect(screen.getAllByTestId("strip-slider")).toHaveLength(1);
  await view.rerender(<VolumeSheet clipId="a" clipIds={["a", "b"]} visible onClose={onClose} />);
  expect(screen.getByRole("header", { name: "Volume · 2 clips" })).toBeTruthy();
  expect(screen.getAllByTestId("strip-slider")).toHaveLength(1);
});

test("hidden strips render nothing", async () => {
  await render(<><VolumeSheet clipId="a" visible={false} onClose={() => {}} /><AudioFadeSheet target={{ type: "track", id: "m" }} visible={false} onClose={() => {}} /></>);
  expect(screen.queryByTestId("tool-strip")).toBeNull();
  expect(screen.queryByTestId("volume-slider")).toBeNull();
});
```

- [ ] **Step 2: Run** `npx.cmd jest src/editor/__tests__/strips.sliders.test.tsx` → FAIL. **Step 3: Implement.**
- [ ] **Step 4:** `npm run typecheck`; `npm test`; `git diff --stat` lists only this task's five files.
- [ ] **Step 5: Commit** — `git add` the five files; `feat(editor): volume, fade and strength open as strips`.

---

### Task 5: Tile strips — Mask, Blend, Background, Ratio, Transition, Transform

**Depends on:** Tasks 2, 3. **Parallel-safe with:** Tasks 4, 6, 7.

**Files:** Modify `src/editor/components/MaskSheet.tsx`, `BlendSheet.tsx`, `BackgroundSheet.tsx`, `RatioSheet.tsx`, `TransitionSheet.tsx`, `TransformSheet.tsx`; create `src/editor/__tests__/strips.tiles.test.tsx`.

**Do not touch:** `ColorRow.tsx` (Task 7 edits it; `BackgroundSheet` keeps importing `PALETTE` and `CONTENT_BLACK` from it, which do not change), any other component, `EditorToolbar.tsx`, `TransportRow.tsx`, `app/editor/[id]/index.tsx`, `src/ui/*`, and every existing test file — `LayerSheets.test.tsx`, `BlendChromaSheets.test.tsx`, `BackgroundSheet.test.tsx`, `RatioSheet.test.tsx`, `TransitionSheet.test.tsx`, `TransformSheet.test.tsx`, `EditorToolbar*.test.tsx`, `TransportRow.test.tsx` must pass **unedited**.

**Interfaces — Consumes:** `ToolStrip`, `StripTiles`, `StripSlider`, `StripNote` (Task 2). **Produces:** no signature changes.

**Layout (spec §3.5, pattern a)** — in every file the wrapping `flexWrap` view becomes `<StripTiles>` (one row, scrolls sideways) and `<Sheet>` becomes `<ToolStrip>`; ops, haptics and the "already selected → nothing" guards are untouched.

- `MaskSheet`: constants `TILE_WIDTH = 68`, `TILE_BOX = 44`, `SHAPE = { width: 26, height: 26 }`, `LABEL_SIZE = 11` (the shape's radius stays `maskRadius(SHAPE, id)`; a tile is 4 + 44 + 4 + ~14 + 4 = 70 ≤ 76). Test ids `mask-tile-*`, `mask-shape-*` stay.
- `BlendSheet`: `TILE_WIDTH = 68`, `TILE_BOX = 44`, `SQUARE = 18`, `OVERLAP = 8`, `LABEL_SIZE = 11`; `note={<StripNote>Shows in the exported video</StripNote>}` (the body line is removed).
- `BackgroundSheet`: `action` as today; `note={<StripNote>Shown around a clip that does not fill the frame.</StripNote>}`; the swatches (Black, the palette, Blur — same `Pressable`s, same labels, same ring styles) as the children of `<StripTiles>`. The lookup stays as it is (Background is a main-track tool).
- `RatioSheet`: title "Aspect ratio"; `note={<StripNote numberOfLines={2}>9:16 for TikTok, Reels and Shorts. 1:1 for feeds. 16:9 for YouTube.</StripNote>}`; the chips in `<StripTiles>`; a pick still calls `onClose()`.
- `TransitionSheet`: the last-clip branch → `<ToolStrip visible={visible} onClose={onClose} title="Transition"><Body muted style={{ paddingHorizontal: theme.space.lg }}>No clip after this one</Body></ToolStrip>`. The normal branch: `note={cap < TRANSITION_LIMITS.min ? <StripNote>Clips are too short for a transition here</StripNote> : undefined}`; the eleven chips in `<StripTiles>`; `<StripSlider label={`${current.duration.toFixed(2)} s`}>` + `transition-slider` (same props).
- `TransformSheet`: the six `ToolButton`s in `<StripTiles>` (a `ToolButton` is 74 tall ≤ 76).
- Remove the `Sheet` import from all six files.

- [ ] **Step 1: Failing tests.** Create `src/editor/__tests__/strips.tiles.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-05T10:00:00.000Z" }));
import { makeClip, makeLayer, makeProject } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { BackgroundSheet } from "../components/BackgroundSheet";
import { BlendSheet } from "../components/BlendSheet";
import { MaskSheet } from "../components/MaskSheet";
import { RatioSheet } from "../components/RatioSheet";
import { TransformSheet } from "../components/TransformSheet";
import { TransitionSheet } from "../components/TransitionSheet";

const st = () => useEditorStore.getState();
beforeEach(() => {
  st().reset();
  st().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 4, width: 1920, height: 1080 }), makeClip({ id: "b", sourceDuration: 4 })], layers: [makeLayer({ id: "L", sourceDuration: 2 })] }));
});
const expectStrip = async (title: string, onClose: jest.Mock) => {
  expect(screen.getByTestId("tool-strip")).toBeTruthy();
  expect(screen.getByRole("header", { name: title })).toBeTruthy();
  expect(screen.queryByLabelText("Close sheet")).toBeNull();
  expect(screen.getAllByTestId("strip-tiles")).toHaveLength(1);       // one row: nothing wraps
  await fireEvent.press(screen.getByRole("button", { name: "Done" }));
  expect(onClose).toHaveBeenCalledTimes(1);
};
const cases: [string, (onClose: () => void) => React.JSX.Element, string][] = [
  ["Mask", (c) => <MaskSheet clipId="a" visible onClose={c} />, "Circle"],
  ["Blend", (c) => <BlendSheet clipId="L" visible onClose={c} />, "Multiply"],
  ["Background", (c) => <BackgroundSheet clipId="a" visible onClose={c} />, "Blur"],
  ["Aspect ratio", (c) => <RatioSheet visible onClose={c} />, "1:1"],
  ["Transition", (c) => <TransitionSheet clipIndex={0} visible onClose={c} />, "Dissolve"],
  ["Transform", (c) => <TransformSheet clipId="a" visible onClose={c} />, "Rotate 90°"],
];

test.each(cases)("%s is a strip with one scrolling row", async (title, make, probe) => {
  const onClose = jest.fn();
  await render(make(onClose));
  expect(screen.getByRole("button", { name: probe })).toBeTruthy();
  await expectStrip(title, onClose);
});

test("the notes sit in the strip's header", async () => {
  const view = await render(<BlendSheet clipId="L" visible onClose={() => {}} />);
  expect(screen.getByText("Shows in the exported video")).toBeTruthy();
  await view.rerender(<BackgroundSheet clipId="a" visible onClose={() => {}} />);
  expect(screen.getByText("Shown around a clip that does not fill the frame.")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Apply to all" })).toBeTruthy();
  await view.rerender(<RatioSheet visible onClose={() => {}} />);
  expect(screen.getByText("9:16 for TikTok, Reels and Shorts. 1:1 for feeds. 16:9 for YouTube.")).toBeTruthy();
});

test("Transition: chips over one slider row; the last clip shows its message in a strip", async () => {
  const view = await render(<TransitionSheet clipIndex={0} visible onClose={() => {}} />);
  expect(screen.getAllByTestId("strip-slider")).toHaveLength(1);
  await fireEvent.press(screen.getByRole("button", { name: "Fade" }));
  expect(st().project!.clips[0].transitionOut).toEqual({ type: "fade", duration: 0.5 });
  expect(screen.getByText("0.50 s")).toBeTruthy();
  expect(st().past).toHaveLength(1);
  await view.rerender(<TransitionSheet clipIndex={1} visible onClose={() => {}} />);
  expect(screen.getByTestId("tool-strip")).toBeTruthy();
  expect(screen.getByText("No clip after this one")).toBeTruthy();
});

test("a pick is one undo step and a re-pick is none; a ratio pick closes", async () => {
  const onClose = jest.fn();
  const view = await render(<MaskSheet clipId="a" visible onClose={() => {}} />);
  await fireEvent.press(screen.getByRole("button", { name: "Circle" }));
  await fireEvent.press(screen.getByRole("button", { name: "Circle" }));
  expect(st().past).toHaveLength(1);
  await view.rerender(<RatioSheet visible onClose={onClose} />);
  await fireEvent.press(screen.getByRole("button", { name: "1:1" }));
  expect(st().project?.aspectRatio).toBe("1:1");
  expect(onClose).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.**
- [ ] **Step 4:** `npm run typecheck`; `npm test`; `git diff --stat` lists only this task's seven files.
- [ ] **Step 5: Commit** — `git add` the seven files; `feat(editor): mask, blend, background, ratio, transition and transform open as strips`.

---

### Task 6: Picker strips with tabs — Filter, Speed, clip Animation, overlay Animation

**Depends on:** Tasks 2, 3. **Parallel-safe with:** Tasks 4, 5, 7.

**Files:** Modify `src/editor/components/FilterSheet.tsx`, `SpeedSheet.tsx`, `ClipAnimationSheet.tsx`, `OverlayAnimationSheet.tsx`, `AnimationTiles.tsx`; create `src/editor/__tests__/strips.pickers.test.tsx`.

**Do not touch:** `MultiSelectBar.tsx`, `EditorToolbar.tsx`, `src/ui/*`, `src/editor/model/*` (in particular no `speed` maths here: `clipDuration` and `formatSpeed` are called as today), and every existing test file — `FilterSheet.test.tsx`, `sheetStyle.test.tsx`, `SpeedSheet.test.tsx`, `ClipAnimationSheet.test.tsx`, `OverlayAnimationSheet.test.tsx`, `LayerSheets.test.tsx`, `MultiSelectBar.test.tsx`, `EditorToolbar*.test.tsx` must pass **unedited**.

**Interfaces — Consumes:** `ToolStrip`, `StripTiles`, `StripSlider`, `StripNote` (Task 2); `Chip`'s `compact` prop (Task 2). **Produces:**

```ts
// AnimationTiles.tsx — same exports, same props
export function AnimationTiles<T extends string>(props: TilesProps<T>): React.JSX.Element   // now a fragment of tiles (no wrapping grid view): the caller puts it in <StripTiles>
export function AnimationLength(props: { edge: AnimEdge | null; onStart: () => void; onChange: (duration: number) => void }): React.JSX.Element   // now one <StripSlider label={`Length ${…} s`}>
```

**Layout (spec §3.5, pattern a with tabs and a slider)**

- `FilterSheet`: `TILE_W = 52`, `TILE_H = 52`, label `fontSize: 11` (a tile is 52 + 4 + ~14 = 70 ≤ 76); the tiles in `<StripTiles>` (the inner `ScrollView` is removed); `<StripSlider label={`Strength ${Math.round(clip.filterIntensity * 100)}`}>` + `filter-strength`; title and `action` exactly as today (hidden for a layer and in `clipIds` mode).
- `SpeedSheet`: `if (!clip || !visible) return null; return <SpeedBody key={clip.id} … />` and `SpeedBody` renders the `<ToolStrip visible onClose={onClose} title={…}>` itself (it owns the tab state the note depends on; it is still mounted only while open, so it still opens on the tab the clip's speed lives on).
  - `note`: `<><StripNote>Clip length {clipDuration(clip).toFixed(1)} s</StripNote>{tab === "normal" ? <StripNote>{curveId ? "A curve is active — moving this slider removes it." : "Audio keeps its pitch in the exported video."}</StripNote> : null}</>`.
  - `<StripTiles lead={TABS.map((t) => <Chip compact key={t.id} label={t.label} selected={tab === t.id} onPress={() => setTab(t.id)} />)}>` · Normal: the six preset chips (regular `Chip`s, same labels and `selected` rule) · Curve: the `CurveTile`s (unchanged: 70 tall).
  - Normal only: `<StripSlider label={`Current speed: ${formatSpeed(clip.speed)}`}>` + `speed-slider` (same props, same tint rule). Curve: no slider row.
  - `pickCurve` / `pickSpeed` are unchanged, including "close, then toast" on a refusal (the comments that say the sheet is a Modal are corrected: the strip closes so the bar and the message show).
- `AnimationTiles`: returns `<>…</>` (the `None` tile and one per id); `AnimationLength`: `<StripSlider label={`Length ${edgeDuration(edge).toFixed(2)} s`}>` + `animation-slider` (same props).
- `ClipAnimationSheet` / `OverlayAnimationSheet`: `<ToolStrip … title="Animation" action={…as today}>` · `<StripTiles lead={TABS.map(… <Chip compact …/>)}>` + the `AnimationTiles` of the tab · `AnimationLength` only on In / Out (as today). The tab state stays in the sheet component.
- Remove the `Sheet` import from the four sheet files.

- [ ] **Step 1: Failing tests.** Create `src/editor/__tests__/strips.pickers.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-05T10:00:00.000Z" }));
jest.mock("@/src/editor/components/thumbnails", () => ({ getThumb: jest.fn(async () => "file:///thumb.jpg") }));
import { makeClip, makeLayer, makeOverlay, makeProject } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { ClipAnimationSheet } from "../components/ClipAnimationSheet";
import { FilterSheet } from "../components/FilterSheet";
import { OverlayAnimationSheet } from "../components/OverlayAnimationSheet";
import { SpeedSheet } from "../components/SpeedSheet";

const st = () => useEditorStore.getState();
const btn = (name: string) => screen.getByRole("button", { name });
beforeEach(() => {
  st().reset();
  st().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 8 }), makeClip({ id: "b", sourceDuration: 8 })], layers: [makeLayer({ id: "L", sourceDuration: 2 })], overlays: [makeOverlay({ id: "t", start: 0, end: 3 })] }));
});
const expectStrip = async (title: string, onClose: jest.Mock) => {
  expect(screen.getByTestId("tool-strip")).toBeTruthy();
  expect(screen.getByRole("header", { name: title })).toBeTruthy();
  expect(screen.queryByLabelText("Close sheet")).toBeNull();
  expect(screen.getAllByTestId("strip-tiles")).toHaveLength(1);
  await fireEvent.press(btn("Done"));
  expect(onClose).toHaveBeenCalledTimes(1);
};

test("Filter: one row of tiles over the strength row; Apply to all clips is the strip's action", async () => {
  const onClose = jest.fn();
  await render(<FilterSheet clipId="a" visible onClose={onClose} />);
  expect(screen.getAllByTestId("strip-slider")).toHaveLength(1);
  await fireEvent.press(btn("Warm"));
  await fireEvent.press(btn("Apply to all clips"));
  expect(st().project!.clips.map((c) => c.filter)).toEqual(["warm", "warm"]);
  expect(st().past).toHaveLength(2);
  await expectStrip("Filter", onClose);
});

test("Filter in clipIds mode and on a layer has no action", async () => {
  const view = await render(<FilterSheet clipId="a" clipIds={["a", "b"]} visible onClose={() => {}} />);
  expect(screen.getByRole("header", { name: "Filter · 2 clips" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Apply to all clips" })).toBeNull();
  await view.rerender(<FilterSheet clipId="L" visible onClose={() => {}} />);
  expect(screen.queryByRole("button", { name: "Apply to all clips" })).toBeNull();
});

test("Speed: tabs at the left of the row; Normal has the slider row, Curve has none; the length and the note sit in the header", async () => {
  const onClose = jest.fn();
  await render(<SpeedSheet clipId="a" visible onClose={onClose} />);
  expect(btn("Normal")).toBeSelected();
  expect(screen.getAllByTestId("strip-slider")).toHaveLength(1);
  expect(screen.getByText("Clip length 8.0 s")).toBeTruthy();
  expect(screen.getByText("Audio keeps its pitch in the exported video.")).toBeTruthy();
  expect(screen.getByText("Current speed: 1×")).toBeTruthy();
  await fireEvent.press(btn("2×"));
  expect(screen.getByText("Clip length 4.0 s")).toBeTruthy();
  expect(screen.getByText("Current speed: 2×")).toBeTruthy();
  await fireEvent.press(btn("Curve"));
  expect(screen.queryByTestId("strip-slider")).toBeNull();
  expect(screen.queryByText("Audio keeps its pitch in the exported video.")).toBeNull();
  expect(screen.getByText("Clip length 4.0 s")).toBeTruthy();
  expect(btn("Hero")).toBeTruthy();
  await expectStrip("Speed", onClose);
});

test("Speed renders nothing while hidden and opens on Curve for a clip with a curve", async () => {
  const view = await render(<SpeedSheet clipId="a" visible={false} onClose={() => {}} />);
  expect(screen.queryByTestId("tool-strip")).toBeNull();
  await view.rerender(<SpeedSheet clipId="a" visible onClose={() => {}} />);
  await fireEvent.press(btn("Curve"));
  await fireEvent.press(btn("Hero"));
  await view.rerender(<SpeedSheet clipId="a" visible={false} onClose={() => {}} />);
  await view.rerender(<SpeedSheet clipId="a" visible onClose={() => {}} />);
  expect(btn("Curve")).toBeSelected();
});

test("clip Animation: In / Out / Combo tabs, tiles in one row, the length row only for In and Out", async () => {
  const onClose = jest.fn();
  await render(<ClipAnimationSheet clipId="a" visible onClose={onClose} />);
  for (const t of ["In", "Out", "Combo"]) expect(btn(t)).toBeTruthy();
  expect(screen.getAllByTestId("strip-slider")).toHaveLength(1);
  expect(screen.getByText("Length 0.50 s")).toBeTruthy();
  await fireEvent.press(btn("Combo"));
  expect(screen.queryByTestId("strip-slider")).toBeNull();
  expect(btn("Apply to all clips")).toBeTruthy();
  await expectStrip("Animation", onClose);
});

test("overlay Animation: In / Out / Loop tabs; no action", async () => {
  const onClose = jest.fn();
  await render(<OverlayAnimationSheet overlayId="t" visible onClose={onClose} />);
  for (const t of ["In", "Out", "Loop"]) expect(btn(t)).toBeTruthy();
  await fireEvent.press(btn("Loop"));
  expect(screen.queryByTestId("strip-slider")).toBeNull();
  expect(screen.queryByRole("button", { name: "Apply to all clips" })).toBeNull();
  await expectStrip("Animation", onClose);
});
```

(`formatSpeed(1)` is `1×` and `formatSpeed(2)` is `2×` — the chips' labels in the existing tests.)

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.**
- [ ] **Step 4:** `npm run typecheck`; `npm test`; `git diff --stat` lists only this task's six files.
- [ ] **Step 5: Commit** — `git add` the six files; `feat(editor): filter, speed and animation open as strips`.

---

### Task 7: Parameter strips — Adjust, Green screen

**Depends on:** Tasks 2, 3. **Parallel-safe with:** Tasks 4, 5, 6.

**Files:** Modify `src/editor/components/AdjustSheet.tsx`, `ChromaSheet.tsx`, `ColorRow.tsx`; create `src/editor/__tests__/strips.params.test.tsx`.

**Do not touch:** `BackgroundSheet.tsx`, `TextPanel.tsx`, `StickerPanel.tsx`, `StickerSheet.tsx`, `CaptionStyleSheet.tsx`, `TextStyleSection.tsx` (they use `ColorRow` without the new prop and must look exactly as today), `src/editor/model/chroma.ts`, `src/ui/*`, and every existing test file — `AdjustSheet.test.tsx`, `BlendChromaSheets.test.tsx`, `LayerSheets.test.tsx`, `EditorToolbar*.test.tsx` must pass **unedited**.

**Interfaces — Consumes:** `ToolStrip`, `StripTiles`, `StripSlider`, `StripNote` (Task 2); `Chip`'s `compact` prop. **Produces:**

```ts
// ColorRow.tsx — one new optional prop; `PALETTE`, `CONTENT_BLACK`, `DEFAULT_STICKER_COLOR` unchanged
export function ColorRow(props: { value: string; onChange: (hex: string) => void; compact?: boolean }): React.JSX.Element
// compact: the eight swatches in one row that does not wrap, and no "Custom color" field (a keyboard would cover a bottom strip)
```

**Layout (spec §3.5, pattern b)**

- `AdjustSheet`: `<ToolStrip title="Adjust" action={…as today}>` · the twelve chips in `<StripTiles>` (regular `Chip`s — label with the dot, `accessibilityLabel`, `selected`, `onPress` as today; the inner `ScrollView` is removed) · `<StripSlider label={`${ADJUST_LABELS[key]} ${lo < 0 && pct > 0 ? "+" : ""}${pct}`} trailing={<Chip compact label="Reset" selected={false} disabled={neutral} onPress={() => { haptic("light"); apply((p) => resetClipAdjust(p, clip.id)); }} />}>` + `adjust-slider`. The `SecondaryButton` import goes.
- `ChromaSheet`: `<ToolStrip title="Green screen" note={on && !isKeyable(color) ? <StripNote numberOfLines={2}>This colour is too grey to remove. Pick a stronger colour.</StripNote> : <StripNote>Shows in the exported video</StripNote>}>` · `<StripTiles lead={<Switch accessibilityLabel="Green screen" value={on} onValueChange={toggle} trackColor={{ true: theme.colors.accent }} />}>` with, inside one `<View pointerEvents={on ? "auto" : "none"} style={{ flexDirection: "row", alignItems: "center", gap: theme.space.sm, opacity: on ? 1 : 0.4 }}>`: the two preset chips (as today) and `<ColorRow compact value={color} onChange={pickColor} />` · `<StripSlider label={`Strength ${Math.round(strength * 100)} %`}>` + `chroma-strength` (same props, `disabled={!on}`). The "Remove a colour" line goes (the title and the switch say it).
- Remove the `Sheet` import from both sheet files.

- [ ] **Step 1: Failing tests.** Create `src/editor/__tests__/strips.params.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-05T10:00:00.000Z" }));
import { makeClip, makeLayer, makeProject } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { AdjustSheet } from "../components/AdjustSheet";
import { ChromaSheet } from "../components/ChromaSheet";
import { ColorRow } from "../components/ColorRow";

const st = () => useEditorStore.getState();
const btn = (name: string) => screen.getByRole("button", { name });
beforeEach(() => {
  st().reset();
  st().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 4 }), makeClip({ id: "b", sourceDuration: 4 })], layers: [makeLayer({ id: "L", sourceDuration: 2 })] }));
});
const expectStrip = async (title: string, onClose: jest.Mock) => {
  expect(screen.getByTestId("tool-strip")).toBeTruthy();
  expect(screen.getByRole("header", { name: title })).toBeTruthy();
  expect(screen.queryByLabelText("Close sheet")).toBeNull();
  expect(screen.getAllByTestId("strip-tiles")).toHaveLength(1);
  expect(screen.getAllByTestId("strip-slider")).toHaveLength(1);
  await fireEvent.press(btn("Done"));
  expect(onClose).toHaveBeenCalledTimes(1);
};

test("Adjust: twelve parameters in one row, ONE slider for the selected one, Reset beside it", async () => {
  const onClose = jest.fn();
  await render(<AdjustSheet clipId="a" visible onClose={onClose} />);
  expect(btn("Brightness")).toBeSelected();
  expect(btn("Reset")).toBeDisabled();
  await fireEvent(screen.getByTestId("adjust-slider"), "slidingStart");
  await fireEvent(screen.getByTestId("adjust-slider"), "valueChange", 0.35);
  expect(screen.getByText("Brightness +35")).toBeTruthy();
  expect(st().past).toHaveLength(1);
  await fireEvent.press(btn("Grain"));
  expect(screen.getByText("Grain 0")).toBeTruthy();
  await fireEvent.press(btn("Reset"));
  expect(st().project!.clips[0].adjust.brightness).toBe(0);
  expect(st().past).toHaveLength(2);
  expect(btn("Apply to all")).toBeTruthy();
  await expectStrip("Adjust", onClose);
});

test("Adjust on a layer has no action", async () => {
  await render(<AdjustSheet clipId="L" visible onClose={() => {}} />);
  expect(screen.queryByRole("button", { name: "Apply to all" })).toBeNull();
});

test("Green screen: the switch, the colours in one row and the strength row; the note is in the header", async () => {
  const onClose = jest.fn();
  await render(<ChromaSheet clipId="L" visible onClose={onClose} />);
  const sw = () => screen.getByLabelText("Green screen");
  expect(screen.getByText("Shows in the exported video")).toBeTruthy();
  expect(screen.queryByLabelText("Custom color")).toBeNull();          // no keyboard in a strip
  await fireEvent(sw(), "valueChange", true);
  await fireEvent.press(screen.getByLabelText("Color #C8102E"));
  expect(st().project!.layers[0].chroma).toEqual({ color: "#C8102E", strength: 0.5 });
  await fireEvent.press(screen.getByLabelText("Color #FFFFFF"));          // white has no saturation: not keyable
  expect(screen.getByText("This colour is too grey to remove. Pick a stronger colour.")).toBeTruthy();
  expect(screen.queryByText("Shows in the exported video")).toBeNull();
  expect(st().past).toHaveLength(3);
  await expectStrip("Green screen", onClose);
});

test("ColorRow: the custom field stays by default and goes in compact", async () => {
  const view = await render(<ColorRow value="#FFFFFF" onChange={() => {}} />);
  expect(screen.getByLabelText("Custom color")).toBeTruthy();
  await view.rerender(<ColorRow compact value="#FFFFFF" onChange={() => {}} />);
  expect(screen.queryByLabelText("Custom color")).toBeNull();
  expect(screen.getByLabelText("Color #00E5A0")).toBeTruthy();
});
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** (`ColorRow`: `compact` → the container has no `flexWrap` and the `TextInput` is not rendered; nothing else changes).
- [ ] **Step 4:** `npm run typecheck`; `npm test`; `git diff --stat` lists only this task's four files.
- [ ] **Step 5: Commit** — `git add` the four files; `feat(editor): adjust and green screen open as strips`.

---

### Task 8: Cleanup, docs and full checks

**Depends on:** Tasks 1–7.

**Files:** Modify `src/ui/ToolButton.tsx`, `src/ui/__tests__/kit.test.tsx`, `src/editor/__tests__/EditorToolbar.test.tsx` and `EditorToolbar.layers.test.tsx` (comments / helper only), `README.md`, `AGENTS.md`, `docs/superpowers/specs/2026-10-05-editing-ui-r1-toolbar-strips-design.md`; any file the sweep below names.

**Do not touch:** behaviour. This task removes dead code and writes docs; a failing test means a mistake here.

- [ ] **Step 1: Dead code.**
  - `ToolButton`: the `role` prop (only the group tabs used `"tab"`) is removed — `accessibilityRole="button"`; delete the kit test "ToolButton exposes tab role and selected state when asked" and add one line to an existing ToolButton test: an `active` button `toBeSelected()`.
  - Sweep with the Grep tool (not `sed`) over `src` and `app`, and fix what is found: `TOOL_GROUPS`, `groupForSelection`, `ToolGroupId`, `openGroup`, `role="tab"`, `getByRole("tab"`, `transitionFor`, `onTransitionChange`, `SELECTED_EFFECT_TOOLS`, `SELECTED_AUDIO_TOOLS`, `SELECTED_LAYER_TOOLS`, `noSel`, `layerSel`, `photoSel`, `canAnimate`, `motionOverlay` — none may remain. In the seventeen converted files: no `import { Sheet }`, and comments that still say "sheet's Modal" / "the tool is disabled for …" / "group" are corrected to what the code now does (`BlendSheet`'s header comment, `SpeedSheet`'s refusal comments, `MultiSelectBar`'s header comment, `jest.setup.ts` comments that mention the toolbar's groups if any).
  - `src/ui/Sheet.tsx` stays (eleven editor components and two outside the editor still use it). A Grep for `<Sheet` in `src/editor/components` must list exactly: AddAudioSheet, BeatsSheet, CaptionStyleSheet, CaptionsSheet, CoverSheet, EffectSheet, StickerPanel, StickerSheet, TemplateSheet, TextPanel, TrimSheet (×2).
  - Toolbar tests: `closeTool` stays (Trim, Beats, Cover are still modal); delete any leftover commented-out case.
- [ ] **Step 2: Docs.**
  - `README.md` "Design": replace "a five-group editor toolbar (Edit, Text, Stickers, Effects, Audio)" by one sentence on the contextual bar and the strips. Add a section **"Editing tools"** before "Clip tools": the bar follows the selection (the table of spec §2.2 in short form), the back arrow, "tools that do not apply are not shown", strips (what they are, ✓, they close when you select something else, which tools are strips and which are still sheets). In "Look", "Text and captions", "Audio", "Layers": replace each "is in the **X** group of the toolbar" line by where the tools are now (select a clip; main bar → Text; main bar → Audio; select a layer).
  - `AGENTS.md` "This repo": `- Toolbar: only src/editor/toolbarContext.ts decides which bar and which tools show (contextFor); EditorToolbar renders it and never greys a tool out for a lasting reason (the momentary exceptions are listed in the round-1 spec). Quick tools are ToolStrips (src/ui/ToolStrip.tsx — inline, explicit row heights, never flex: 1 for height); the open strip lives in src/editor/toolStrip.ts and closes when selectionKey changes. The bottom area must stay a direct child of the editor screen (it lifts over the timeline by a negative margin).`
  - Spec: Status → `Implemented 2026-10-05 (on-device checklist pending)`; add an **As built** list after §4 with every deviation the task reports recorded (changed heights, a test that had to change, anything a strip could not keep).
- [ ] **Step 3: Full checks.** `npm run typecheck`; `npm test`; `npx.cmd expo-doctor`; `git status --short` shows nothing unexpected; `git diff --stat main` shows no change under `ios/`, `android/`, `modules/`, `src/editor/model/`, `src/editor/timelineScroll.ts`, `src/editor/components/PreviewPlayer.tsx`, `src/editor/components/Timeline.tsx`, `src/editor/store.ts`, `package.json`.
- [ ] **Step 4: Commit** — `git add` the files changed (explicit paths); `docs: editing UI round 1 — contextual toolbar and tool strips; remove the group leftovers`.

**Device checklist (user, Expo Go)** — start with `npx expo start --go --port 8090`, open the app on the iPhone, open a project with at least three clips (one of them a photo), one text, one sticker and one song.

1. Tap an empty part of the video so nothing is selected. At the bottom there is **one row** of buttons (Edit, Audio, Text, Stickers, …) and no tabs under it. The video is bigger than before.
2. Tap a clip on the timeline. The row changes to that clip's tools (Split, Trim, Speed, …) with a **back arrow** at the left. No button is greyed out, except Keyframe when the white line is not on that clip.
3. Tap the photo clip: **Speed**, **Volume**, **Reverse** and **Freeze** are not there. Tap the last clip: **Transition** is not there.
4. Tap the back arrow: the first row is back and nothing is selected.
5. Tap a clip, then **Opacity**. A small panel replaces the row — **the screen does not go dark and the video does not change size**. Drag the slider: the video changes. Press **play** while the panel is open, and slide the timeline: both still work. Tap the round **✓**: the clip's tools are back. Tap undo once: the opacity goes back in one step.
6. Open **Filter**, then tap a **different clip** on the timeline: the panel closes by itself and the row shows the new clip's tools.
7. Try **Adjust** (tap Brightness, Contrast, … and drag the one slider; **Reset** is at the right), **Speed** (Normal / Curve at the left), **Animate** (In / Out / Combo at the left), **Volume**, **Mask**, **Green screen**, **Transform**. In each, check that no text is cut off at the top or bottom of the panel and the tiles slide sideways.
8. With nothing selected tap **Filter**: the clip under the white line becomes selected and the filter panel opens for it. Same for **Adjust** and **Background**.
9. With nothing selected tap **Audio**: you get Add audio, Ducking, Beats and a back arrow. Tap the song on the timeline: Volume, Fade, Duplicate, Delete, Add audio. Open **Fade** — the panel covers the bottom two rows of the timeline; that is expected.
10. With nothing selected tap **Text** → **Add text**, type something, close the text sheet. With the text selected the row shows Edit, Animate, Keyframe, Duplicate, Delete. Tap the sticker: the same five.
11. Tap the small **9:16** pill next to the play button: the ratio panel opens at the bottom; pick 1:1 and it closes.
12. Tap the mark between two clips that have a transition: the transition panel opens for that cut.
13. Tap a clip → **Select** (at the end of the row), choose two clips, tap **Filter**, pick one, tap **✓**, then **Done**: both clips have the filter and the normal row is back.
14. Text, Stickers, Add audio, Templates, Cover, Captions, Trim and Crop still open as the big sheets they were — that is round 2.
