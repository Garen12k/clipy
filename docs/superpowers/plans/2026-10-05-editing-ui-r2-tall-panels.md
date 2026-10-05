# Editing UI, Round 2 — Tall Panels Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The big pickers (Text, Stickers, the sticker editor, Add audio, Templates, Captions, Caption style, Beats) open as an inline tall panel in place of the timeline and the toolbar, with the preview resized above it and kept in view while typing; the Effects picker and Trim become round-1 strips. Cover stays a sheet.

**Architecture:** A kit component `src/ui/ToolPanel.tsx` is a plain inline view (not a `Modal`) of explicit height (`panelHeight(size, windowHeight, typing)`) that registers its presence and size in a store. The open-tool store `src/editor/toolStrip.ts` is widened to hold a strip or a panel (same closer; `rekeyStrip`, a recording rule, `closeForExport`). The editor's column moves to `src/editor/components/EditorLayout.tsx`, which collapses the timeline's slot to height 0 (clipped, still mounted, not resized) while a panel shows. `EditorToolbar` opens every tool through the store and gives the bottom area the panel's explicit height. `src/ui/keyboard.ts` tracks the keyboard's height from `Keyboard` events; while a tool shows, the bottom area is padded by it. Each `XSheet` / `XPanel` keeps its name, props, test ids and labels and renders `<ToolPanel>` (or `<ToolStrip>`) instead of `<Sheet>`.

**Tech Stack:** Expo SDK 57, React Native 0.86 (`Keyboard`, `useWindowDimensions`, `ScrollView`, `FlatList`), TypeScript strict, Zustand 5, `react-native-safe-area-context`, Jest + RNTL v14. No model, schema or Swift change. No new package.

**Spec:** `docs/superpowers/specs/2026-10-05-editing-ui-r2-tall-panels-design.md` (binding; §2.2 the heights, §2.3 what moves, §2.4 the close rules, §2.5 the keyboard, §3.2 each tool, §3.3 the test expectations that change).

## Global Constraints

- **iPhone only.** No Android or web configuration, files or code paths.
- **Expo Go must keep working.** Nothing in this round touches `modules/clipy-video`; no new native code. Voice-over recording (`useVoiceRecorder`, `RecordTab`) and the Add audio preview player (`useAudioPlayer` in `AddAudioSheet`) keep their lifecycle: the preview stops when the panel is hidden exactly as when the sheet was hidden; the recorder's hook is not edited.
- **New packages: none.**
- UI from `src/ui/` and `src/theme/theme.ts` only; **no hex literals** (`src/__tests__/noHexLiterals.test.ts`). Sizes in points are plain numbers and are fine.
- A clip-or-layer by id is resolved with `findItem` / `useItemClip` / `useIsLayer` — **never `project.clips.find`**.
- **Only `src/editor/model/timeline.ts` multiplies / divides by `speed` or reads `speedCurve` steps.** Nothing in this round computes a length.
- **`src/editor/timelineScroll.ts` and `src/editor/components/Timeline.tsx` are not edited.** No scroll-end handlers, no `scrollTo` in scroll callbacks. **The timeline keeps its scroll position and zoom across a panel opening and closing:** it stays mounted and none of its views changes its frame (its slot is collapsed and clipped, spec §2.3).
- **The main preview `VideoView` never remounts or changes key, and `src/editor/components/PreviewPlayer.tsx` is not edited.** The preview resizes when a panel opens or closes; it does not resize for a strip (unless the keyboard is up).
- **Explicit heights only.** A panel, its header, its lead and its body have numeric heights; a strip's rows too. `flex: 1` is allowed only to share WIDTH inside a row whose height is explicit — never for height inside an auto-height parent. (A past device bug collapsed a sheet's content off-screen.)
- **Panels scroll vertically; strips never do.** A panel's body has no scroll handlers (`onScroll…` props).
- **One user action = one undo step; a no-change action leaves no history entry.** Opening, closing, selecting are never undo steps.
- Component names, props (`visible`, `onClose`, ids), test ids, accessibility labels and visible texts of the converted sheets do not change unless a task lists the change.
- Gestures (none are added; if one is): `.runOnJS(true)`, gesture state on a ref object.
- Windows: PowerShell, no `&&`, `npx.cmd`. **Never run `expo lint`** or anything else that rewrites package.json. **No broad `sed`.** **Never `git stash`.** **`git add` explicit paths only — never `-A` / `.`.** Do not start or stop a dev server (one is serving this working tree to the user's phone). Before each commit: `npm run typecheck` and `npm test` green. Commit trailer exactly `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- RNTL v14: `render` / `fireEvent` are async — always `await`. Queries skip elements hidden from accessibility (`accessibilityElementsHidden`, `importantForAccessibility="no-hide-descendants"`); pass `{ includeHiddenElements: true }` to reach them. Component tests live in `src/editor/__tests__/` (kit tests in `src/ui/__tests__/`). The default mocked Slider (`jest.setup.ts`) is a `View`. The safe-area mock gives zero insets, so the bottom padding is `theme.space.sm` = 8. The window height in tests is `Dimensions.get("window").height`.

## Task order

1 first. Then 2. Then **in parallel:** 3, 4, 5, 6 (no file in common — see each task's Files). Last: 7.

| Task | Title | Model tier |
|---|---|---|
| 1 | `ToolPanel`, the store for strips and panels, `EditorLayout`, toolbar wiring, pilot panel (Beats) | most capable |
| 2 | Keyboard: tracking, typing height, host padding; pilot with a text field (Stickers) | most capable |
| 3 | Text panel and sticker editor | standard |
| 4 | Add audio | standard |
| 5 | Templates, Captions, Caption style | standard |
| 6 | Strips: the Effects picker and Trim | cheap |
| 7 | Cover stays a sheet (pinned), cleanup, docs, full checks | standard |

---

### Task 1: `ToolPanel`, the store for strips and panels, `EditorLayout`, toolbar wiring, pilot panel (Beats)

**Depends on:** nothing. **Parallel-safe with:** none.

**Files:** Create `src/ui/ToolPanel.tsx`, `src/ui/__tests__/ToolPanel.test.tsx`, `src/editor/components/EditorLayout.tsx`, `src/editor/__tests__/EditorLayout.test.tsx`, `src/editor/__tests__/PreviewPlayer.resize.test.tsx`; modify `src/editor/toolStrip.ts`, `src/editor/components/EditorToolbar.tsx`, `app/editor/[id]/index.tsx`, `src/editor/components/BeatsSheet.tsx`; tests: `src/editor/__tests__/toolStrip.test.tsx`, `EditorToolbar.test.tsx`, `EditorToolbar.layers.test.tsx`, `CropScreen.test.tsx`, `BeatsSheet.test.tsx`.

**Do not touch:** `src/ui/Sheet.tsx`, `src/ui/ToolStrip.tsx`, every other `*Sheet.tsx` / `*Panel.tsx` (they stay sheets, opened through the store), `MultiSelectBar.tsx`, `TransportRow.tsx`, `toolbarContext.ts`, `store.ts`, `PreviewPlayer.tsx`, `Timeline.tsx`, `timelineScroll.ts`, `timelineLayout.ts`.

**Interfaces — Consumes:** `selectionKey` (`src/editor/toolbarContext.ts`); `useEditorStore` (`recording`, `setPlaying`, `multiSelect`, `exitMultiSelect`, `selectOverlay`); `STRIP`, `BAR_HEIGHT`, `useStripPresence` (`src/ui/ToolStrip.tsx`); `deleteOverlay`, `isTextOverlay`.

**Interfaces — Produces**

```ts
// src/ui/ToolPanel.tsx
export const PANEL = { header: 44, lead: 44, compact: 240, regularShare: 0.46, regularMin: 300, regularMax: 430, typingShare: 0.22, typingMin: 148, typingMax: 200 } as const;
export type PanelSize = "regular" | "compact";
/** The bottom area's height while a panel shows, without the bottom padding: 1 hairline + header + lead + body. `typing` = the keyboard is up. */
export function panelHeight(size: PanelSize, windowHeight: number, typing?: boolean): number
/** How many panels are showing, and the size of the one that is. The editor hides the bar and the timeline while count > 0. */
export const usePanelPresence: UseBoundStore<StoreApi<{ count: number; size: PanelSize }>>
type ToolPanelProps = { visible: boolean; onClose: () => void; title: string; size?: PanelSize; action?: { label: string; onPress: () => void };
  lead?: React.ReactNode; scroll?: boolean; bodyTestID?: string; children: React.ReactNode | ((bodyHeight: number) => React.ReactNode) };
export function ToolPanel(props: ToolPanelProps): React.JSX.Element | null

// src/editor/toolStrip.ts
export type StripId = "filter" | "adjust" | "speed" | "volume" | "opacity" | "mask" | "blend" | "chroma" | "transform" | "background"
  | "clipAnimation" | "overlayAnimation" | "transition" | "ratio" | "audioFade" | "audioVolume" | "effectStrength" | "effect" | "trim";
export type PanelId = "beats" | "templates" | "captions" | "addAudio" | "sticker" | "text" | "stickerEdit";
export type OpenToolId = StripId | PanelId;
export type OpenStrip = { id: OpenToolId; key: string };
export const useToolStrip: UseBoundStore<StoreApi<{ open: OpenStrip | null }>>
export function openStrip(id: OpenToolId): void      // a strip or a panel; nothing while a voice-over is being recorded
export function closeStrip(): void
export function rekeyStrip(): void                   // the open tool now belongs to the current selection
export function closeForExport(): boolean            // true: closed, go on. false: a voice-over is being recorded — playback was paused instead
export function useStripCloser(): void

// src/editor/components/EditorLayout.tsx
type EditorLayoutProps = { top: React.ReactNode; preview: React.ReactNode; transport: React.ReactNode; timeline: React.ReactNode; toolbar: React.ReactNode };
export function EditorLayout(props: EditorLayoutProps): React.JSX.Element

// src/editor/components/EditorToolbar.tsx — the props are gone
export function EditorToolbar(): React.JSX.Element
```

**Behaviour**

- `panelHeight`: typing → `clamp(round(windowHeight × 0.22), 148, 200)`; else compact → 240; else `clamp(round(windowHeight × 0.46), 300, 430)`. (`typing` is wired in Task 2; in this task `ToolPanel` always passes `false`.)
- `ToolPanel`: `visible` false → `null`. Visible → `<View testID="tool-panel">` of height `panelHeight − 1` (the host draws the hairline), background `theme.colors.surface`: a header row (height 44: `Title size={16}` with `accessibilityRole="header"`, a width-`flex: 1` spacer, the optional action, the round ✓ — the same two `Pressable`s as `ToolStrip`'s); the optional lead row (`testID="tool-panel-lead"`, height 44, a row with `gap: theme.space.sm`, `paddingHorizontal: theme.space.lg`); the body, height `panelHeight − 1 − 44 − (lead ? 44 : 0)`: by default a `ScrollView` (`testID={bodyTestID ?? "tool-panel-body"}`, `style={{ height }}`, `keyboardShouldPersistTaps="handled"`, `keyboardDismissMode="on-drag"`, `contentContainerStyle={{ paddingHorizontal: theme.space.lg, paddingVertical: theme.space.md }}`) whose one child is a `View` (`collapsable={false}`, `style={{ gap: theme.space.lg }}`) holding the children; with `scroll={false}` a plain `View` of the same height and test id (`paddingHorizontal: theme.space.lg`). A function child is called with the body height. No `Modal`, no scrim, no gesture, no animation, no `onScroll…` prop.
- While visible it counts itself in `usePanelPresence` (`useLayoutEffect`: `count + 1` and its `size`; cleanup `count − 1`).
- Store: as in Produces. `openStrip` returns at once while `useEditorStore.getState().recording`; else leaves multi-select first (as today) and stores `{ id, key }`. `rekeyStrip` rewrites the open tool's key to the current `selectionKey` (nothing when none is open or the key is the same). `closeForExport`: recording → `setPlaying(false)` and `false`; else `closeStrip()` and `true`. The closer reads the open tool from the store inside its effect (a tool may have re-keyed itself in the same commit) and does not close while `recording`; it re-runs when `recording` changes.
- `EditorLayout`: a fragment — `top`; `<View testID="slot-preview" style={{ flex: 1 }}>`; `transport`; `<View testID="slot-timeline">`; `toolbar`. While a panel is present the timeline slot gets `style={{ height: 0, overflow: "hidden" }}`, `pointerEvents="none"`, `accessibilityElementsHidden`, `importantForAccessibility="no-hide-descendants"`; otherwise no style, `pointerEvents="auto"`, `accessibilityElementsHidden={false}`, `importantForAccessibility="auto"`. It must stay a fragment: the toolbar has to remain a direct child of the screen, after the timeline (round 1's lift).
- `EditorToolbar`: no props. Every tool but Cover and Crop opens through the store; `panelFor` is gone (the Text panel and the sticker editor read `selectedOverlayId`). While a panel is present the bar's row is not rendered and the root's height is `panelHeight(size, windowHeight) + pad`, `marginTop: 0`. Closing the text panel — however — removes a text left empty.
- `BeatsSheet` renders a compact `ToolPanel`.

- [ ] **Step 1: Failing tests.**

Create `src/ui/__tests__/ToolPanel.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react-native";
import { Dimensions, Text } from "react-native";
import { PANEL, panelHeight, ToolPanel, usePanelPresence } from "../ToolPanel";

const H = Dimensions.get("window").height;

test("panelHeight: regular is 46 % of the window between 300 and 430, compact is 240, typing is 22 % between 148 and 200", () => {
  expect(PANEL).toMatchObject({ header: 44, lead: 44, compact: 240 });
  for (const [h, regular, typing] of [[667, 307, 148], [812, 374, 179], [852, 392, 187], [932, 429, 200], [956, 430, 200], [500, 300, 148]]) {
    expect(panelHeight("regular", h)).toBe(regular);
    expect(panelHeight("regular", h, true)).toBe(typing);
    expect(panelHeight("compact", h, true)).toBe(typing);
    expect(panelHeight("compact", h)).toBe(240);
  }
});

test("renders inline with explicit heights: a header title, a scrolling body — and no scrim", async () => {
  await render(<ToolPanel visible onClose={() => {}} title="Templates"><Text>body</Text></ToolPanel>);
  const height = panelHeight("regular", H) - 1;
  expect(screen.getByTestId("tool-panel")).toHaveStyle({ height });
  expect(screen.getByRole("header", { name: "Templates" })).toBeTruthy();
  const body = screen.getByTestId("tool-panel-body");
  expect(body).toHaveStyle({ height: height - PANEL.header });
  expect(body.props.horizontal).toBeFalsy();
  expect(Object.keys(body.props).filter((k) => /^on.*Scroll/.test(k))).toEqual([]);
  expect(screen.getByText("body")).toBeTruthy();
  expect(screen.queryByLabelText("Close sheet")).toBeNull();        // the modal Sheet's scrim
  expect(screen.queryByTestId("tool-panel-lead")).toBeNull();
});

test("Done closes; the action runs", async () => {
  const onClose = jest.fn(), onAction = jest.fn();
  await render(<ToolPanel visible onClose={onClose} title="Text" action={{ label: "Apply to all", onPress: onAction }}><Text>body</Text></ToolPanel>);
  await fireEvent.press(screen.getByRole("button", { name: "Apply to all" }));
  expect(onAction).toHaveBeenCalledTimes(1);
  await fireEvent.press(screen.getByRole("button", { name: "Done" }));
  expect(onClose).toHaveBeenCalledTimes(1);
});

test("compact is 240; a lead row is 44 and the body gives it up; the body test id can be named", async () => {
  await render(<ToolPanel visible onClose={() => {}} title="Sticker" size="compact" lead={<Text>tabs</Text>} bodyTestID="my-scroll"><Text>body</Text></ToolPanel>);
  expect(screen.getByTestId("tool-panel")).toHaveStyle({ height: 239 });
  expect(screen.getByTestId("tool-panel-lead")).toHaveStyle({ height: 44 });
  expect(screen.getByText("tabs")).toBeTruthy();
  expect(screen.getByTestId("my-scroll")).toHaveStyle({ height: 239 - 44 - 44 });
});

test("scroll={false}: a plain body of explicit height, and a function child is told that height", async () => {
  const child = jest.fn((h: number) => <Text>{`h=${h}`}</Text>);
  await render(<ToolPanel visible onClose={() => {}} title="Sticker" scroll={false}>{child}</ToolPanel>);
  const bodyH = panelHeight("regular", H) - 1 - PANEL.header;
  expect(child).toHaveBeenCalledWith(bodyH);
  expect(screen.getByText(`h=${bodyH}`)).toBeTruthy();
  const body = screen.getByTestId("tool-panel-body");
  expect(body).toHaveStyle({ height: bodyH });
  expect(body.props.contentContainerStyle).toBeUndefined();          // not a ScrollView
});

test("hidden: renders nothing and is not counted; visible: counted with its size while mounted", async () => {
  const view = await render(<ToolPanel visible={false} onClose={() => {}} title="Beats" size="compact"><Text>body</Text></ToolPanel>);
  expect(screen.queryByText("body")).toBeNull();
  expect(usePanelPresence.getState().count).toBe(0);
  await view.rerender(<ToolPanel visible onClose={() => {}} title="Beats" size="compact"><Text>body</Text></ToolPanel>);
  expect(usePanelPresence.getState()).toEqual({ count: 1, size: "compact" });
  await view.rerender(<ToolPanel visible={false} onClose={() => {}} title="Beats" size="compact"><Text>body</Text></ToolPanel>);
  expect(usePanelPresence.getState().count).toBe(0);
  await view.rerender(<ToolPanel visible onClose={() => {}} title="Beats"><Text>body</Text></ToolPanel>);
  expect(usePanelPresence.getState()).toEqual({ count: 1, size: "regular" });
  await view.unmount();
  expect(usePanelPresence.getState().count).toBe(0);
});
```

`src/editor/__tests__/toolStrip.test.tsx` — replace `<EditorToolbar panelFor={null} onPanelChange={() => {}} />` by `<EditorToolbar />` in the last test; add `rekeyStrip, closeForExport` to the `../toolStrip` import and `makeEffect` is not needed; append:

```tsx
test("a panel is opened and closed through the same store, keyed on the selection", () => {
  st().select("a");
  openStrip("templates");
  expect(open()).toEqual({ id: "templates", key: "clip:a" });
  st().select(null);
  openStrip("beats");
  expect(open()).toEqual({ id: "beats", key: "none" });
});

test("rekeyStrip moves the open tool to the current selection, so the closer leaves it alone", async () => {
  st().selectOverlay("t");
  await render(<Host />);
  await act(() => { openStrip("text"); });
  await act(() => { st().select("a"); rekeyStrip(); });
  expect(open()).toEqual({ id: "text", key: "clip:a" });
  await act(() => { closeStrip(); rekeyStrip(); });                     // nothing open: nothing to re-key
  expect(open()).toBeNull();
});

test("while a voice-over is being recorded nothing closes or replaces the open tool; it closes once recording has ended", async () => {
  await render(<Host />);
  await act(() => { openStrip("addAudio"); st().setRecording(true); });
  await act(() => { st().select("a"); });
  expect(open()).toEqual({ id: "addAudio", key: "none" });
  await act(() => { openStrip("ratio"); });
  expect(open()?.id).toBe("addAudio");
  await act(() => { st().setRecording(false); });
  expect(open()).toBeNull();
});

test("closeForExport closes the tool; while recording it pauses playback instead and says no", () => {
  st().select("a");
  openStrip("opacity");
  expect(closeForExport()).toBe(true);
  expect(open()).toBeNull();
  openStrip("addAudio");
  st().setRecording(true); st().setPlaying(true);
  expect(closeForExport()).toBe(false);
  expect(open()?.id).toBe("addAudio");
  expect(st().isPlaying).toBe(false);
  st().setRecording(false);
});

test("adding selects the new item: the Effects picker adds, selects and closes — the effect's bar shows and nothing reopens", async () => {
  await render(<EditorToolbar />);
  await fireEvent.press(screen.getByRole("button", { name: "Effects" }));
  expect(open()).toEqual({ id: "effect", key: "none" });
  await fireEvent.press(screen.getByRole("button", { name: "Glow" }));
  expect(st().selectedEffectId).toBe(st().project!.effects[0].id);
  expect(open()).toBeNull();
  expect(screen.getByRole("button", { name: "Strength" })).toBeTruthy();
});

test("Add text selects the new text first and opens the panel second, so its own selection change does not close it", async () => {
  await render(<EditorToolbar />);
  await fireEvent.press(screen.getByRole("button", { name: "Text" }));
  await fireEvent.press(screen.getByRole("button", { name: "Add text" }));
  const id = st().selectedOverlayId!;
  await act(async () => {});                                            // the closer's effect has run
  expect(open()).toEqual({ id: "text", key: `overlay:${id}` });
  // Duplicate inside the panel selects the copy and re-keys: still open, now on the copy.
  // (While the text panel is still a modal sheet the bar under it has a Duplicate too: the panel's is the last one.)
  await fireEvent.press(screen.getAllByRole("button", { name: "Duplicate" }).at(-1)!);
  const copy = st().selectedOverlayId!;
  expect(copy).not.toBe(id);
  expect(open()).toEqual({ id: "text", key: `overlay:${copy}` });
});
```

(The first `beforeEach` of that file already calls `closeStrip()`; add `st().setRecording(false);` to it.)

Create `src/editor/__tests__/EditorLayout.test.tsx`:

```tsx
import { act, fireEvent, render, screen } from "@testing-library/react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-05T10:00:00.000Z" }));
jest.mock("@/src/projects/pickMedia", () => ({ pickMedia: jest.fn(async () => null) }));
jest.mock("@/src/projects", () => ({ storage: { importMedia: jest.fn(), saveStill: jest.fn() } }));
jest.mock("expo-video-thumbnails", () => ({ getThumbnailAsync: jest.fn(async () => ({ uri: "file:///thumb.jpg" })) }));
import { useEffect } from "react";
import { Dimensions, View } from "react-native";
import { makeClip, makeProject } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { panelHeight } from "@/src/ui/ToolPanel";
import { BAR_HEIGHT, STRIP } from "@/src/ui/ToolStrip";
import { EditorLayout } from "../components/EditorLayout";
import { EditorToolbar } from "../components/EditorToolbar";
import { Timeline } from "../components/Timeline";
import { TransportRow } from "../components/TransportRow";
import { TIMELINE_HEIGHT } from "../timelineLayout";
import { closeStrip } from "../toolStrip";

const st = () => useEditorStore.getState();
const H = Dimensions.get("window").height;
const btn = (name: string) => screen.getByRole("button", { name });
const hidden = { includeHiddenElements: true } as const;
let mounts = 0;
function Probe() {
  useEffect(() => { mounts++; }, []);
  return <View testID="probe" />;
}
const ui = () => <EditorLayout top={null} preview={<Probe />} transport={<TransportRow />} timeline={<Timeline />} toolbar={<EditorToolbar />} />;

beforeEach(() => {
  mounts = 0;
  closeStrip();
  st().reset();
  st().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 4 }), makeClip({ id: "b", sourceDuration: 4 })] }));
});

test("with the bar: preview, transport, timeline and toolbar are all there", async () => {
  await render(ui());
  expect(screen.getByTestId("slot-preview")).toHaveStyle({ flex: 1 });
  expect(screen.getByTestId("timeline-root")).toHaveStyle({ height: TIMELINE_HEIGHT });
  expect(screen.getByTestId("slot-timeline")).not.toHaveStyle({ height: 0 });
  expect(screen.getByTestId("editor-toolbar")).toHaveStyle({ height: BAR_HEIGHT + 8, marginTop: 0 });
  expect(btn("Play")).toBeTruthy();
});

test("a panel hides the timeline and the bar without unmounting or resizing the timeline; Done brings both back; the preview never remounts", async () => {
  st().setZoom(120);
  await render(ui());
  const probe = screen.getByTestId("probe");
  const root = screen.getByTestId("timeline-root");
  const scroll = screen.getByTestId("timeline-scroll");
  await fireEvent.press(btn("Audio"));
  await fireEvent.press(btn("Beats"));
  // The panel is there, with an explicit height and no lift; the bar's row is not rendered.
  expect(screen.getByTestId("tool-panel")).toBeTruthy();
  expect(screen.getByRole("header", { name: "Beat markers" })).toBeTruthy();
  expect(screen.queryByTestId("toolbar-row")).toBeNull();
  expect(screen.getByTestId("editor-toolbar")).toHaveStyle({ height: panelHeight("compact", H) + 8, marginTop: 0 });
  // The timeline is not shown — hidden from accessibility and from touches, its slot collapsed and clipped …
  expect(screen.queryByTestId("timeline-root")).toBeNull();
  expect(screen.queryByTestId("slot-timeline")).toBeNull();
  const slot = screen.getByTestId("slot-timeline", hidden);
  expect(slot).toHaveStyle({ height: 0, overflow: "hidden" });
  expect(slot.props.pointerEvents).toBe("none");
  // … but still mounted, the same views at the same height (its scroll view keeps its offset).
  expect(screen.getByTestId("timeline-root", hidden)).toBe(root);
  expect(screen.getByTestId("timeline-root", hidden)).toHaveStyle({ height: TIMELINE_HEIGHT });
  expect(screen.getByTestId("timeline-scroll", hidden)).toBe(scroll);
  // The transport row stays, and works.
  await fireEvent.press(btn("Play"));
  expect(st().isPlaying).toBe(true);
  expect(screen.getByTestId("probe")).toBe(probe);
  await fireEvent.press(btn("Done"));
  expect(screen.queryByTestId("tool-panel")).toBeNull();
  expect(screen.getByTestId("timeline-root")).toBe(root);
  expect(screen.getByTestId("timeline-scroll")).toBe(scroll);
  expect(screen.getByTestId("slot-timeline")).not.toHaveStyle({ height: 0 });
  expect(screen.getByTestId("toolbar-row")).toBeTruthy();
  expect(screen.getByTestId("editor-toolbar")).toHaveStyle({ height: BAR_HEIGHT + 8 });
  expect(st().pixelsPerSecond).toBe(120);
  expect(screen.getByTestId("probe")).toBe(probe);
  expect(mounts).toBe(1);
});

test("a strip does not hide the timeline: it lifts over it as in round 1", async () => {
  await render(ui());
  await act(() => { st().select("a"); });
  await fireEvent.press(btn("Opacity"));
  expect(screen.getByTestId("tool-strip")).toBeTruthy();
  expect(screen.getByTestId("timeline-root")).toBeTruthy();
  expect(screen.getByTestId("slot-timeline")).not.toHaveStyle({ height: 0 });
  expect(screen.getByTestId("editor-toolbar")).toHaveStyle({ height: STRIP.height + 8, marginTop: -STRIP.lift });
});

test("a panel closes when the selection changes, and the timeline is back", async () => {
  await render(ui());
  await fireEvent.press(btn("Audio"));
  await fireEvent.press(btn("Beats"));
  await act(() => { st().select("a"); });
  expect(screen.queryByTestId("tool-panel")).toBeNull();
  expect(screen.getByTestId("timeline-root")).toBeTruthy();
});
```

Create `src/editor/__tests__/PreviewPlayer.resize.test.tsx` (the component is NOT edited; this pins what the layout relies on):

```tsx
import { fireEvent, render, screen } from "@testing-library/react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-05T10:00:00.000Z" }));
jest.mock("@/src/editor/components/thumbnails", () => ({ getThumb: jest.fn(async () => "file:///thumb.jpg") }));
let mockVideoMounts = 0;
jest.mock("expo-video", () => {
  const { View } = require("react-native");
  const { useEffect, useState } = require("react");
  const make = () => ({ playing: false, loop: false, muted: false, volume: 1, currentTime: 0, playbackRate: 1, timeUpdateEventInterval: 0, audioMixingMode: "auto", preservesPitch: true,
    play: jest.fn(), pause: jest.fn(), replaceAsync: jest.fn(async () => {}), addListener: jest.fn(() => ({ remove: () => {} })) });
  const VideoView = (props: object) => { useEffect(() => { mockVideoMounts++; }, []); return <View {...props} />; };
  return { useVideoPlayer: (_source: unknown, setup?: (p: unknown) => void) => useState(() => { const p = make(); setup?.(p); return p; })[0], VideoView };
});
import { makeClip, makeOverlay, makeProject } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { PreviewPlayer } from "../components/PreviewPlayer";

const layout = (width: number, height: number) => fireEvent(screen.getByLabelText("Preview"), "layout", { nativeEvent: { layout: { width, height } } });

test("a resize of the preview keeps the one VideoView mounted and lays the overlays out at the new size", async () => {
  mockVideoMounts = 0;
  useEditorStore.getState().reset();
  useEditorStore.getState().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 4 })], overlays: [makeOverlay({ id: "t", text: "Hi", start: 0, end: 3 })] }));
  await render(<PreviewPlayer />);
  await layout(270, 480);
  const video = screen.getByTestId("preview-video");
  expect(screen.getByText("Hi")).toBeTruthy();
  await layout(135, 240);          // a tall panel opened: the frame is half the size
  expect(screen.getByTestId("preview-video")).toBe(video);
  await layout(270, 480);          // and closed again
  expect(screen.getByTestId("preview-video")).toBe(video);
  expect(screen.getByText("Hi")).toBeTruthy();
  expect(mockVideoMounts).toBe(1);
});
```

(If this fake lacks something `PreviewPlayer` reads, copy the missing field from the fake at the top of `PreviewPlayer.test.tsx`. If the test still fails after that, STOP and report: it would mean the preview does not survive a resize.)

`src/editor/__tests__/BeatsSheet.test.tsx` — append:

```tsx
test("it is a panel: inline, no scrim, compact, Done closes", async () => {
  const onClose = jest.fn();
  await render(<BeatsSheet visible onClose={onClose} />);
  expect(screen.getByTestId("tool-panel")).toHaveStyle({ height: 239 });
  expect(screen.queryByLabelText("Close sheet")).toBeNull();
  await fireEvent.press(btn("Done"));
  expect(onClose).toHaveBeenCalledTimes(1);
});
```

`src/editor/__tests__/EditorToolbar.test.tsx`, `EditorToolbar.layers.test.tsx`, `CropScreen.test.tsx` — use the Grep tool for `panelFor` and edit each hit by hand: `<EditorToolbar panelFor={null} onPanelChange={…} />` → `<EditorToolbar />`. Then, in `EditorToolbar.test.tsx`, replace three cases:

```tsx
  test("Text opens the text bar without a selection; Add text adds, selects and opens the text panel on it", async () => {
    await renderBar();
    await fireEvent.press(btn("Text"));
    expect(row()).toEqual([BACK, "Add text", "Captions"]);
    await fireEvent.press(btn("Add text"));
    const added = st().project!.overlays[0];
    expect(st().selectedOverlayId).toBe(added.id);
    expect(useToolStrip.getState().open).toEqual({ id: "text", key: `overlay:${added.id}` });
    await act(() => { closeStrip(); });
    expect(row()).toEqual([BACK, ...TEXT]);
  });

  test("Add text with a text or a caption selected is one tap: it adds another, selects it and opens the text panel on it", async () => {
    st().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 4 })], overlays: [makeOverlay({ id: "t1", start: 1, end: 3 }), makeOverlay({ id: "c1", kind: "caption", start: 1, end: 3 })] }));
    await renderBar();
    for (const [from, count] of [["t1", 3], ["c1", 4]] as const) {
      await act(() => { st().selectOverlay(from); });
      await fireEvent.press(btn("Add text"));
      expect(st().project!.overlays).toHaveLength(count);
      const added = st().project!.overlays.find((o) => o.id === st().selectedOverlayId)!;
      expect(added).toMatchObject({ kind: "text", text: "Your text" });
      expect(useToolStrip.getState().open).toEqual({ id: "text", key: `overlay:${added.id}` });
      await act(() => { closeStrip(); });
    }
    expect(st().past).toHaveLength(2);
  });
```

```tsx
  test("Edit opens the text panel (a text, a caption) or the sticker editor (a sticker) on the selected overlay", async () => {
    withOverlays();
    await renderBar();
    for (const [id, tool] of [["t1", "text"], ["c1", "text"], ["s1", "stickerEdit"]] as const) {
      await act(() => { st().selectOverlay(id); });
      await fireEvent.press(btn("Edit"));
      expect(useToolStrip.getState().open).toEqual({ id: tool, key: `overlay:${id}` });
      await act(() => { closeStrip(); });
    }
  });

  test("closing the text panel removes a text left empty — by its own close and when the selection moves away", async () => {
    for (const leave of [() => closeStrip(), () => st().selectOverlay("s1")]) {
      withOverlays();
      const view = await renderBar();
      await act(() => { st().selectOverlay("t1"); });
      await fireEvent.press(btn("Edit"));
      await act(() => { st().apply((p) => ops.updateOverlay(p, "t1", { text: "  " })); });
      await act(() => { leave(); });
      expect(st().project!.overlays.map((o) => o.id)).toEqual(["s1", "c1"]);
      expect(useToolStrip.getState().open).toBeNull();
      await view.unmount();
    }
  });
```

- [ ] **Step 2: Run** `npx.cmd jest src/ui/__tests__/ToolPanel.test.tsx src/editor/__tests__/toolStrip.test.tsx src/editor/__tests__/EditorLayout.test.tsx src/editor/__tests__/BeatsSheet.test.tsx src/editor/__tests__/EditorToolbar.test.tsx src/editor/__tests__/PreviewPlayer.resize.test.tsx` → FAIL (modules / exports missing), except `PreviewPlayer.resize` which must already PASS.
- [ ] **Step 3: Implement.**

`src/ui/ToolPanel.tsx`:

```tsx
import { Ionicons } from "@expo/vector-icons";
import { useLayoutEffect } from "react";
import { Pressable, ScrollView, useWindowDimensions, View } from "react-native";
import { create } from "zustand";
import { theme } from "@/src/theme/theme";
import { Body, Title } from "./Text";

/** Heights in points. `compact` and the regular / typing rules give the bottom area's height while a panel shows (see `panelHeight`). */
export const PANEL = { header: 44, lead: 44, compact: 240, regularShare: 0.46, regularMin: 300, regularMax: 430, typingShare: 0.22, typingMin: 148, typingMax: 200 } as const;
export type PanelSize = "regular" | "compact";
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
/** The bottom area's height while a panel shows, without the bottom padding: 1 hairline + header + lead + body. `typing` = the keyboard is up. */
export function panelHeight(size: PanelSize, windowHeight: number, typing = false): number {
  if (typing) return clamp(Math.round(windowHeight * PANEL.typingShare), PANEL.typingMin, PANEL.typingMax);
  if (size === "compact") return PANEL.compact;
  return clamp(Math.round(windowHeight * PANEL.regularShare), PANEL.regularMin, PANEL.regularMax);
}
/** How many panels are showing, and the size of the one that is. The editor hides the bar and the timeline while count > 0. */
export const usePanelPresence = create<{ count: number; size: PanelSize }>(() => ({ count: 0, size: "regular" }));

const DONE_SIZE = 32;

type Props = { visible: boolean; onClose: () => void; title: string; size?: PanelSize; action?: { label: string; onPress: () => void };
  lead?: React.ReactNode; scroll?: boolean; bodyTestID?: string; children: React.ReactNode | ((bodyHeight: number) => React.ReactNode) };

/**
 * A tall inline tool panel that takes the place of the timeline and the toolbar — NOT a Modal: no scrim, the preview above it stays
 * usable. Every part has an explicit height (never `flex: 1` for height); the body scrolls vertically when its content is taller.
 * The bar that hosts it owns the top hairline and the bottom padding (safe area or keyboard).
 */
export function ToolPanel({ visible, onClose, title, size = "regular", action, lead, scroll = true, bodyTestID, children }: Props) {
  const { height: windowH } = useWindowDimensions();
  // Counted before paint, so the host hides its bar and the timeline in the same frame the panel appears.
  useLayoutEffect(() => {
    if (!visible) return;
    usePanelPresence.setState((s) => ({ count: s.count + 1, size }));
    return () => usePanelPresence.setState((s) => ({ ...s, count: s.count - 1 }));
  }, [visible, size]);
  if (!visible) return null;
  const typing = false;   // Task 2: the keyboard
  const height = panelHeight(size, windowH, typing) - 1;
  const showLead = !!lead && !typing;
  const bodyH = height - PANEL.header - (showLead ? PANEL.lead : 0);
  const content = typeof children === "function" ? children(bodyH) : children;
  return (
    <View testID="tool-panel" style={{ height, backgroundColor: theme.colors.surface }}>
      <View style={{ height: PANEL.header, flexDirection: "row", alignItems: "center", gap: theme.space.md, paddingHorizontal: theme.space.lg }}>
        <Title size={16} accessibilityRole="header">{title}</Title>
        <View style={{ flex: 1, height: PANEL.header }} />
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
      {showLead ? <View testID="tool-panel-lead" style={{ height: PANEL.lead, flexDirection: "row", alignItems: "center", gap: theme.space.sm, paddingHorizontal: theme.space.lg }}>{lead}</View> : null}
      {scroll ? (
        <ScrollView testID={bodyTestID ?? "tool-panel-body"} style={{ height: bodyH }} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag"
          contentContainerStyle={{ paddingHorizontal: theme.space.lg, paddingVertical: theme.space.md }}>
          <View collapsable={false} style={{ gap: theme.space.lg }}>{content}</View>
        </ScrollView>
      ) : (
        <View testID={bodyTestID ?? "tool-panel-body"} style={{ height: bodyH, paddingHorizontal: theme.space.lg }}>{content}</View>
      )}
    </View>
  );
}
```

`src/editor/toolStrip.ts` (whole file):

```ts
import { useEffect } from "react";
import { create } from "zustand";
import { useEditorStore } from "./store";
import { selectionKey } from "./toolbarContext";

export type StripId = "filter" | "adjust" | "speed" | "volume" | "opacity" | "mask" | "blend" | "chroma" | "transform" | "background"
  | "clipAnimation" | "overlayAnimation" | "transition" | "ratio" | "audioFade" | "audioVolume" | "effectStrength" | "effect" | "trim";
export type PanelId = "beats" | "templates" | "captions" | "addAudio" | "sticker" | "text" | "stickerEdit";
export type OpenToolId = StripId | PanelId;
/** `key` = the selection key when it opened. Nothing else is remembered: a tool reads its item from the selection on every render. */
export type OpenStrip = { id: OpenToolId; key: string };

/** Which tool — a strip or a tall panel — is open (null = none). One at a time. Transient UI state: not saved, not undoable. */
export const useToolStrip = create<{ open: OpenStrip | null }>(() => ({ open: null }));

/** A voice-over is being recorded: the Add audio panel must not be taken away from under the recorder (it stops, saves and closes itself). */
const recording = () => useEditorStore.getState().recording;

/**
 * Opens a strip or a panel. It leaves multi-select first (its bar has no place for one). A tool that is about an item is opened
 * AFTER that item is selected, so its key is that item — Add text selects the new text, then opens the text panel.
 */
export function openStrip(id: OpenToolId): void {
  if (recording()) return;
  if (useEditorStore.getState().multiSelect !== null) useEditorStore.getState().exitMultiSelect();
  useToolStrip.setState({ open: { id, key: selectionKey(useEditorStore.getState()) } });
}
export function closeStrip(): void {
  if (useToolStrip.getState().open !== null) useToolStrip.setState({ open: null });
}
/** The open tool now belongs to the current selection: called right after a tool itself changed the selection and stays open (Duplicate in the text panel). */
export function rekeyStrip(): void {
  const open = useToolStrip.getState().open;
  const key = selectionKey(useEditorStore.getState());
  if (open && open.key !== key) useToolStrip.setState({ open: { ...open, key } });
}
/** Export: closes the open tool and says go. While a voice-over is recorded it pauses playback instead (the recorder then stops and saves) and says no. */
export function closeForExport(): boolean {
  if (recording()) { useEditorStore.getState().setPlaying(false); return false; }
  closeStrip();
  return true;
}

/**
 * Call once in the bottom area's component: closes the open tool when the selection key is no longer the one it opened with
 * (another item, none, the item deleted or undone away, multi-select), when the Transition strip's clip has no cut after it any
 * more, and on unmount (the editor is left). It waits while a voice-over is being recorded.
 * The open tool is read from the store inside the effect: a tool may have re-keyed itself in the same commit.
 */
export function useStripCloser(): void {
  const key = useEditorStore(selectionKey);
  const open = useToolStrip((s) => s.open);
  const busy = useEditorStore((s) => s.recording);
  const noCut = useEditorStore((s) => { const i = s.project?.clips.findIndex((c) => c.id === s.selectedClipId) ?? -1; return i < 0 || i >= (s.project?.clips.length ?? 0) - 1; });
  useEffect(() => {
    const now = useToolStrip.getState().open;
    if (now && !busy && (now.key !== key || (now.id === "transition" && noCut))) closeStrip();
  }, [key, open, noCut, busy]);
  useEffect(() => closeStrip, []);
}
```

`src/editor/components/EditorLayout.tsx`:

```tsx
import { View } from "react-native";
import { usePanelPresence } from "@/src/ui/ToolPanel";

type Props = { top: React.ReactNode; preview: React.ReactNode; transport: React.ReactNode; timeline: React.ReactNode; toolbar: React.ReactNode };

/**
 * The editor's column: top bar, preview (takes what is left), transport row, timeline, bottom area.
 * While a tall panel shows, the timeline's slot is collapsed to height 0 and clipped — the timeline inside stays mounted with its own
 * explicit height, so none of its views changes its frame and its scroll view keeps its offset — and it is hidden from touches and
 * from accessibility. A fragment on purpose: the bottom area must stay a direct child of the screen, after the timeline.
 */
export function EditorLayout({ top, preview, transport, timeline, toolbar }: Props) {
  const collapsed = usePanelPresence((s) => s.count > 0);
  return (
    <>
      {top}
      <View testID="slot-preview" style={{ flex: 1 }}>{preview}</View>
      {transport}
      <View testID="slot-timeline" pointerEvents={collapsed ? "none" : "auto"} accessibilityElementsHidden={collapsed}
        importantForAccessibility={collapsed ? "no-hide-descendants" : "auto"} style={collapsed ? { height: 0, overflow: "hidden" } : undefined}>
        {timeline}
      </View>
      {toolbar}
    </>
  );
}
```

`app/editor/[id]/index.tsx` — remove `useState` and the `panelFor` state; import `EditorLayout`, `closeForExport` (instead of `closeStrip`) and keep `openStrip`; the returned screen becomes:

```tsx
    <Screen>
      <EditorLayout
        top={<EditorTopBar onExport={() => { if (!closeForExport()) return; useEditorStore.getState().setPlaying(false); router.push(`/editor/${id}/export`); }} />}
        preview={<>
          <PreviewPlayer onOpenPanel={(overlayId) => {
            // A double-tap on a text or a sticker: select it first, open second, so the panel's key is that overlay.
            const s = useEditorStore.getState();
            const overlay = s.project?.overlays.find((o) => o.id === overlayId);
            s.selectOverlay(overlayId);
            openStrip(overlay?.kind === "sticker" ? "stickerEdit" : "text");
          }} />
          <AudioPreview />
        </>}
        transport={<TransportRow />}
        timeline={<Timeline renderStripExtras={/* unchanged */} onCutPress={/* unchanged */} />}
        toolbar={<EditorToolbar />}
      />
      <ToastHost />
    </Screen>
```

(The `View` import goes if nothing else uses it. `renderStripExtras` and `onCutPress` keep their bodies exactly.)

`src/editor/components/EditorToolbar.tsx` — edits (nothing else changes):

1. Signature `export function EditorToolbar()`; delete `PanelFor`, `Props`, `textPanelFor`, `stickerPanelFor`, `closeText`. Imports: add `useRef`, `useWindowDimensions` (react-native), `rekeyStrip` (`toolStrip`), `panelHeight, usePanelPresence` (`@/src/ui/ToolPanel`).
2. `const [sheet, setSheet] = useState<"crop" | "cover" | null>(null);` with the comment "The two tools that are still modal (Cover is a sheet, Crop a full screen); every other tool lives in the tool store."
3. After `stripShown`: 

```tsx
  const panelSize = usePanelPresence((s) => (s.count > 0 ? s.size : null));
  const { height: windowH } = useWindowDimensions();
  const toolShown = stripShown || panelSize !== null;
  // The text panel closing — by ✓, by the closer or by Export — removes a text left empty (as closing the sheet did).
  const textOpenFor = strip?.id === "text" ? selectedOverlayId : null;
  const lastText = useRef<string | null>(null);
  useEffect(() => {
    const was = lastText.current;
    lastText.current = textOpenFor;
    if (!was || was === textOpenFor) return;
    const overlay = useEditorStore.getState().project?.overlays.find((o) => o.id === was);
    if (overlay && isTextOverlay(overlay) && overlay.text.trim().length === 0) apply((x) => deleteOverlay(x, was));
  }, [textOpenFor, apply]);
```

   (Both must sit above `if (multi) return <MultiSelectBar />;`, with the other hooks.)
4. `addText`: its last line `onPanelChange({ id, kind: "text" })` becomes `openStrip("text");` (after `selectOverlay(id)` — select first, open second).
5. `ACTIONS`: `sticker` → `openStrip("sticker")`; `effect` → `openStrip("effect")`; `templates` → `openStrip("templates")`; `trim` → `openStrip("trim")`; `captions` → `openStrip("captions")`; `addAudio` → `openStrip("addAudio")`; `beats` → `openStrip("beats")`; `overlayEdit` → `{ onPress: () => { if (selectedOverlayId) openStrip(overlayKind === "sticker" ? "stickerEdit" : "text"); } }`. `cover` and `crop` keep `setSheet`.
6. The root view and the row:

```tsx
  const pad = Math.max(insets.bottom, theme.space.sm);
  const area = panelSize ? panelHeight(panelSize, windowH) : stripShown ? STRIP.height : BAR_HEIGHT;

  return (
    <View testID="editor-toolbar" style={{ backgroundColor: theme.colors.surface, borderTopWidth: 1, borderTopColor: theme.colors.hairline, paddingBottom: pad,
      height: area + pad, marginTop: stripShown ? -STRIP.lift : 0 }}>
      {toolShown ? null : ( /* the toolbar-row, unchanged */ )}
```

7. The tools that were opened with `sheet === …` (all but Cover and Crop):

```tsx
      <CoverSheet visible={sheet === "cover"} onClose={() => setSheet(null)} />
      <CropScreen clipId={selectedId} visible={sheet === "crop"} onClose={() => setSheet(null)} />
      {/* Opened and closed through the tool store, like the strips. */}
      <TrimSheet clipId={selectedId} visible={strip?.id === "trim"} onClose={closeStrip} />
      <TemplateSheet clipId={selectedId} visible={strip?.id === "templates"} onClose={closeStrip} />
      <EffectSheet visible={strip?.id === "effect"} onClose={closeStrip} />
      <AddAudioSheet visible={strip?.id === "addAudio"} onClose={closeStrip} />
      <BeatsSheet visible={strip?.id === "beats"} onClose={closeStrip} />
      <StickerSheet visible={strip?.id === "sticker"} onClose={closeStrip} onAdded={() => {}} />
      <CaptionsSheet visible={strip?.id === "captions"} onClose={closeStrip} />
      {/* The text panel and the sticker editor edit the selected overlay; Duplicate selects the copy, then re-keys the panel onto it. */}
      <TextPanel overlayId={selectedOverlayId} visible={strip?.id === "text"} onClose={closeStrip} onRetarget={rekeyStrip} />
      <StickerPanel overlayId={selectedOverlayId} visible={strip?.id === "stickerEdit"} onClose={closeStrip} onRetarget={rekeyStrip} />
```

8. The header comment: add one sentence — "A tall panel (`ToolPanel`) takes the bar's place too, at its own explicit height and without a lift: the editor's layout hides the timeline then."

`src/editor/components/BeatsSheet.tsx` — `import { ToolPanel } from "@/src/ui/ToolPanel";` instead of `Sheet`; `<ToolPanel visible={visible} onClose={onClose} title="Beat markers" size="compact">` around the same three children. In the header comment "the sheet does not re-render" → "the panel does not re-render".

- [ ] **Step 4:** `npm run typecheck`; `npm test` (every suite; the toolbar suites must pass with only the edits listed in Step 1 — they close tools with `closeTool`, which presses Done or the scrim).
- [ ] **Step 5: Commit** — `git add src/ui/ToolPanel.tsx src/ui/__tests__/ToolPanel.test.tsx src/editor/toolStrip.ts src/editor/components/EditorLayout.tsx src/editor/components/EditorToolbar.tsx src/editor/components/BeatsSheet.tsx "app/editor/[id]/index.tsx" src/editor/__tests__/toolStrip.test.tsx src/editor/__tests__/EditorLayout.test.tsx src/editor/__tests__/PreviewPlayer.resize.test.tsx src/editor/__tests__/BeatsSheet.test.tsx src/editor/__tests__/EditorToolbar.test.tsx src/editor/__tests__/EditorToolbar.layers.test.tsx src/editor/__tests__/CropScreen.test.tsx`; `feat(editor): tall panels — ToolPanel, one store for strips and panels, the editor layout hides the timeline; Beats is the first panel`.

---

### Task 2: Keyboard — tracking, typing height, host padding; pilot with a text field (Stickers)

**Depends on:** Task 1. **Parallel-safe with:** none (it edits `ToolPanel.tsx`, `EditorLayout.tsx`, `EditorToolbar.tsx`).

**Files:** Create `src/ui/keyboard.ts`, `src/ui/__tests__/keyboard.test.tsx`; modify `src/ui/ToolPanel.tsx`, `src/ui/__tests__/ToolPanel.test.tsx`, `src/editor/components/EditorLayout.tsx`, `src/editor/__tests__/EditorLayout.test.tsx`, `src/editor/components/EditorToolbar.tsx`, `src/editor/components/StickerSheet.tsx`, `src/editor/__tests__/StickerSheet.test.tsx`.

**Do not touch:** `src/ui/Sheet.tsx` (its `KeyboardAvoidingView` stays for Cover and the post options), `src/ui/ToolStrip.tsx`, `MultiSelectBar.tsx`, `toolStrip.ts`, every other `*Sheet.tsx` / `*Panel.tsx`, `ColorRow.tsx`, `PreviewPlayer.tsx`, `Timeline.tsx`, `timelineScroll.ts`. No `KeyboardAvoidingView` in the editor.

**Before writing code** (AGENTS.md — do not trust memory): read https://reactnative.dev/docs/0.86/keyboard and `node_modules/react-native/Libraries/Components/Keyboard/Keyboard.d.ts`. What this task relies on, as read when the plan was written: `Keyboard.addListener(eventType, listener): EventSubscription` (`.remove()`), `Keyboard.dismiss()`, `Keyboard.metrics(): { screenX, screenY, width, height } | undefined`; events `keyboardWillShow` / `keyboardWillHide` (iOS has all six); `KeyboardEvent.endCoordinates.height`. `ScrollView`'s `keyboardDismissMode: "none" | "interactive" | "on-drag"`; `TextInput.State.currentlyFocusedInput(): HostInstance`; `HostInstance.measureLayout(relativeTo, onSuccess, onFail?)`. If any differs, STOP and report.

**Interfaces — Consumes:** `ToolPanel`, `panelHeight`, `usePanelPresence` (Task 1); `useStripPresence`, `STRIP` (round 1); `openStrip`, `closeStrip`, `useStripCloser`, `useToolStrip` (Task 1).

**Interfaces — Produces**

```ts
// src/ui/keyboard.ts
/** The on-screen keyboard's height in points, as iOS last announced it (0 = hidden). */
export const useKeyboard: UseBoundStore<StoreApi<{ height: number }>>
/** Call once, in the editor's layout: keeps `useKeyboard` in step with keyboardWillShow / keyboardWillHide while mounted. */
export function useKeyboardTracking(): void
```

**Behaviour**

- `useKeyboardTracking`: on mount sets `Keyboard.metrics()?.height ?? 0`; `keyboardWillShow` → `e.endCoordinates.height`; `keyboardWillHide` → 0; on unmount removes both listeners and sets 0. It writes only when the value changes.
- The keyboard counts only while a tool shows. Tests drive it with `useKeyboard.setState({ height })`.
- `ToolPanel`: `typing = keyboard height > 0`. Typing → the height is `panelHeight(size, windowH, true) − 1` and the lead is not rendered. When typing begins (and when the body height changes while typing) a scrolling panel measures the focused field against its own content view and scrolls it to the top of the body. When the panel stops being visible it calls `Keyboard.dismiss()`.
- `EditorLayout`: calls `useKeyboardTracking()`; the timeline slot collapses while a panel shows **or** a strip shows with the keyboard up.
- `EditorToolbar`: while a tool shows and the keyboard is up, the bottom padding is the keyboard's height (not the safe-area padding), a panel takes its typing height and a strip is not lifted.
- `StickerSheet`: a regular `ToolPanel` with `scroll={false}`; lead = the Emoji / Shapes chips. Emoji: a search row of height 52 and the grid (`FlatList`) of height `bodyHeight − 52`, with the recents as its `ListHeaderComponent`, `keyboardShouldPersistTaps="handled"`, `keyboardDismissMode="on-drag"`. Shapes: a `ScrollView` of height `bodyHeight`. Adding still does `apply`, `selectOverlay`, `prefs.pushRecentEmoji` (emoji), `onAdded(id)`, `onClose()` in that order.

- [ ] **Step 1: Failing tests.**

Create `src/ui/__tests__/keyboard.test.tsx`:

```tsx
import { act, render } from "@testing-library/react-native";
import { Keyboard } from "react-native";
import { useKeyboard, useKeyboardTracking } from "../keyboard";

function Tracker() { useKeyboardTracking(); return null; }

test("follows keyboardWillShow / keyboardWillHide while mounted, and forgets the keyboard on unmount", async () => {
  const listeners: Record<string, (e: unknown) => void> = {};
  const remove = jest.fn();
  const add = jest.spyOn(Keyboard, "addListener").mockImplementation(((name: string, fn: (e: unknown) => void) => { listeners[name] = fn; return { remove }; }) as never);
  const metrics = jest.spyOn(Keyboard, "metrics").mockReturnValue(undefined);
  const view = await render(<Tracker />);
  expect(useKeyboard.getState().height).toBe(0);
  expect(Object.keys(listeners).sort()).toEqual(["keyboardWillHide", "keyboardWillShow"]);
  await act(() => { listeners.keyboardWillShow({ endCoordinates: { screenX: 0, screenY: 516, width: 390, height: 336 } }); });
  expect(useKeyboard.getState().height).toBe(336);
  await act(() => { listeners.keyboardWillShow({ endCoordinates: { screenX: 0, screenY: 470, width: 390, height: 382 } }); });   // the emoji keyboard is taller
  expect(useKeyboard.getState().height).toBe(382);
  await act(() => { listeners.keyboardWillHide({ endCoordinates: { screenX: 0, screenY: 852, width: 390, height: 0 } }); });
  expect(useKeyboard.getState().height).toBe(0);
  await act(() => { listeners.keyboardWillShow({ endCoordinates: { screenX: 0, screenY: 516, width: 390, height: 336 } }); });
  await view.unmount();
  expect(remove).toHaveBeenCalledTimes(2);
  expect(useKeyboard.getState().height).toBe(0);
  add.mockRestore(); metrics.mockRestore();
});

test("starts from a keyboard that is already up", async () => {
  const add = jest.spyOn(Keyboard, "addListener").mockImplementation((() => ({ remove: () => {} })) as never);
  const metrics = jest.spyOn(Keyboard, "metrics").mockReturnValue({ screenX: 0, screenY: 516, width: 390, height: 336 });
  const view = await render(<Tracker />);
  expect(useKeyboard.getState().height).toBe(336);
  await view.unmount();
  add.mockRestore(); metrics.mockRestore();
});
```

Append to `src/ui/__tests__/ToolPanel.test.tsx` (add `act` to the RNTL import, `Keyboard, TextInput` to the react-native import, `import { useKeyboard } from "../keyboard";`, and `afterEach(() => { useKeyboard.setState({ height: 0 }); });`):

```tsx
test("with the keyboard up the panel takes its typing height and drops the lead; it comes back when the keyboard goes", async () => {
  await render(<ToolPanel visible onClose={() => {}} title="Sticker" lead={<Text>tabs</Text>}><Text>body</Text></ToolPanel>);
  await act(() => { useKeyboard.setState({ height: 336 }); });
  const typing = panelHeight("regular", H, true) - 1;
  expect(screen.getByTestId("tool-panel")).toHaveStyle({ height: typing });
  expect(screen.queryByTestId("tool-panel-lead")).toBeNull();
  expect(screen.getByTestId("tool-panel-body")).toHaveStyle({ height: typing - PANEL.header });
  expect(screen.getByText("body")).toBeTruthy();                       // still open
  await act(() => { useKeyboard.setState({ height: 0 }); });
  expect(screen.getByTestId("tool-panel")).toHaveStyle({ height: panelHeight("regular", H) - 1 });
  expect(screen.getByTestId("tool-panel-lead")).toBeTruthy();
});

test("when the keyboard comes up a scrolling panel measures the focused field to bring it into view", async () => {
  const measureLayout = jest.fn();
  const focused = jest.spyOn(TextInput.State, "currentlyFocusedInput").mockReturnValue({ measureLayout } as never);
  await render(<ToolPanel visible onClose={() => {}} title="Text"><TextInput accessibilityLabel="field" /></ToolPanel>);
  expect(measureLayout).not.toHaveBeenCalled();
  await act(() => { useKeyboard.setState({ height: 336 }); });
  expect(measureLayout).toHaveBeenCalledTimes(1);
  focused.mockRestore();
});

test("hiding the panel dismisses the keyboard", async () => {
  const dismiss = jest.spyOn(Keyboard, "dismiss").mockImplementation(() => {});
  const view = await render(<ToolPanel visible onClose={() => {}} title="Text"><Text>body</Text></ToolPanel>);
  expect(dismiss).not.toHaveBeenCalled();
  await view.rerender(<ToolPanel visible={false} onClose={() => {}} title="Text"><Text>body</Text></ToolPanel>);
  expect(dismiss).toHaveBeenCalledTimes(1);
  dismiss.mockRestore();
});
```

Append to `src/editor/__tests__/EditorLayout.test.tsx` (add `import { useKeyboard } from "@/src/ui/keyboard";` and `useKeyboard.setState({ height: 0 });` to `beforeEach`; add `jest.mock("@/src/projects/prefs", () => ({ prefs: { getRecentEmoji: jest.fn(async () => []), pushRecentEmoji: jest.fn(async () => {}) } }));` with the other mocks):

```tsx
test("the keyboard alone moves nothing: it only counts while a tool shows", async () => {
  await render(ui());
  await act(() => { useKeyboard.setState({ height: 336 }); });
  expect(screen.getByTestId("editor-toolbar")).toHaveStyle({ height: BAR_HEIGHT + 8, paddingBottom: 8, marginTop: 0 });
  expect(screen.getByTestId("slot-timeline")).not.toHaveStyle({ height: 0 });
});

test("a panel with the keyboard: typing height, padded by the keyboard, so the panel sits on it and the preview gets the rest", async () => {
  await render(ui());
  await fireEvent.press(btn("Stickers"));
  expect(screen.getByTestId("editor-toolbar")).toHaveStyle({ height: panelHeight("regular", H) + 8, paddingBottom: 8 });
  await act(() => { useKeyboard.setState({ height: 336 }); });
  expect(screen.getByTestId("editor-toolbar")).toHaveStyle({ height: panelHeight("regular", H, true) + 336, paddingBottom: 336, marginTop: 0 });
  expect(screen.getByTestId("tool-panel")).toHaveStyle({ height: panelHeight("regular", H, true) - 1 });
  expect(btn("Play")).toBeTruthy();
  await act(() => { useKeyboard.setState({ height: 0 }); });            // the keyboard was dismissed: the panel stays, at its size
  expect(screen.getByRole("header", { name: "Sticker" })).toBeTruthy();
  expect(screen.getByTestId("editor-toolbar")).toHaveStyle({ height: panelHeight("regular", H) + 8, paddingBottom: 8 });
});

test("a strip with the keyboard sits on the keyboard, is not lifted, and the timeline gives its place", async () => {
  await render(ui());
  await act(() => { st().select("a"); });
  await fireEvent.press(btn("Opacity"));
  await act(() => { useKeyboard.setState({ height: 260 }); });
  expect(screen.getByTestId("editor-toolbar")).toHaveStyle({ height: STRIP.height + 260, paddingBottom: 260, marginTop: 0 });
  expect(screen.getByTestId("slot-timeline", hidden)).toHaveStyle({ height: 0, overflow: "hidden" });
  await act(() => { useKeyboard.setState({ height: 0 }); });
  expect(screen.getByTestId("editor-toolbar")).toHaveStyle({ height: STRIP.height + 8, marginTop: -STRIP.lift });
  expect(screen.getByTestId("slot-timeline")).not.toHaveStyle({ height: 0 });
});
```

Append to `src/editor/__tests__/StickerSheet.test.tsx` (add `act` to the RNTL import; `import { Dimensions } from "react-native";`, `import { useKeyboard } from "@/src/ui/keyboard";`, `import { PANEL, panelHeight } from "@/src/ui/ToolPanel";`, `import { closeStrip, openStrip, useStripCloser, useToolStrip } from "../toolStrip";`; `afterEach(() => { useKeyboard.setState({ height: 0 }); closeStrip(); });`):

```tsx
const H = Dimensions.get("window").height;

test("it is a panel: inline, no scrim, tabs in the lead, the grid at an explicit height, Done closes", async () => {
  const onClose = jest.fn();
  await render(<StickerSheet visible onClose={onClose} onAdded={() => {}} />);
  expect(screen.getByRole("header", { name: "Sticker" })).toBeTruthy();
  expect(screen.getByTestId("tool-panel")).toHaveStyle({ height: panelHeight("regular", H) - 1 });
  expect(screen.queryByLabelText("Close sheet")).toBeNull();
  const bodyH = panelHeight("regular", H) - 1 - PANEL.header - PANEL.lead;
  expect(screen.getByTestId("emoji-grid")).toHaveStyle({ height: bodyH - 52 });
  await fireEvent.press(screen.getByRole("button", { name: "Done" }));
  expect(onClose).toHaveBeenCalledTimes(1);
});

test("searching with the keyboard up: the tabs give their place, the search field and the grid stay", async () => {
  await render(<StickerSheet visible onClose={() => {}} onAdded={() => {}} />);
  await act(() => { useKeyboard.setState({ height: 336 }); });
  expect(screen.queryByRole("button", { name: "Shapes" })).toBeNull();
  expect(screen.getByLabelText("Search emoji")).toBeTruthy();
  expect(screen.getByTestId("emoji-grid")).toHaveStyle({ height: panelHeight("regular", H, true) - 1 - PANEL.header - 52 });
  expect(screen.getByTestId("emoji-grid").props.keyboardShouldPersistTaps).toBe("handled");
});

test("adding selects the new sticker and closes the panel in one go: the closer has nothing left to close", async () => {
  function Host() {
    useStripCloser();
    const open = useToolStrip((s) => s.open);
    return <StickerSheet visible={open?.id === "sticker"} onClose={closeStrip} onAdded={() => {}} />;
  }
  await render(<Host />);
  await act(() => { openStrip("sticker"); });
  await fireEvent.changeText(screen.getByLabelText("Search emoji"), "fire");
  await fireEvent.press(await screen.findByLabelText("Emoji fire"));
  expect(useEditorStore.getState().selectedOverlayId).toBe("st1");
  expect(useToolStrip.getState().open).toBeNull();
  expect(screen.queryByTestId("tool-panel")).toBeNull();
});
```

- [ ] **Step 2: Run** `npx.cmd jest src/ui src/editor/__tests__/EditorLayout.test.tsx src/editor/__tests__/StickerSheet.test.tsx` → FAIL.
- [ ] **Step 3: Implement.**

`src/ui/keyboard.ts`:

```ts
import { useEffect } from "react";
import { Keyboard, type KeyboardEvent } from "react-native";
import { create } from "zustand";

/** The on-screen keyboard's height in points, as iOS last announced it (0 = hidden). */
export const useKeyboard = create<{ height: number }>(() => ({ height: 0 }));

const set = (height: number) => { if (useKeyboard.getState().height !== height) useKeyboard.setState({ height }); };

/**
 * Call once, in the editor's layout. iOS posts keyboardWillShow when the keyboard appears and again whenever its frame changes
 * (another keyboard, the suggestions bar), and keyboardWillHide when it leaves: the layout changes as the keyboard starts to move.
 */
export function useKeyboardTracking(): void {
  useEffect(() => {
    set(Keyboard.metrics()?.height ?? 0);
    const show = Keyboard.addListener("keyboardWillShow", (e: KeyboardEvent) => set(e.endCoordinates.height));
    const hide = Keyboard.addListener("keyboardWillHide", () => set(0));
    return () => { show.remove(); hide.remove(); set(0); };
  }, []);
}
```

`src/ui/ToolPanel.tsx` — imports gain `useEffect, useRef`, `Keyboard, TextInput`, and `useKeyboard` from `./keyboard`. Above the early return (hooks first):

```tsx
  const typing = useKeyboard((s) => s.height > 0);
  const scrollRef = useRef<ScrollView>(null);
  const contentRef = useRef<View>(null);
  const height = panelHeight(size, windowH, typing) - 1;
  const showLead = !!lead && !typing;
  const bodyH = height - PANEL.header - (showLead ? PANEL.lead : 0);
  // The keyboard came up (the panel is now short): bring the focused field to the top of the body. An effect, never a scroll callback.
  useEffect(() => {
    if (!visible || !typing || !scroll) return;
    const input = TextInput.State.currentlyFocusedInput();
    const content = contentRef.current;
    if (!input || !content) return;
    input.measureLayout(content, (_x, y) => scrollRef.current?.scrollTo({ y: Math.max(0, y), animated: false }), () => {});
  }, [visible, typing, scroll, bodyH]);
  // Closing the panel puts the keyboard away.
  useEffect(() => {
    if (!visible) return;
    return () => Keyboard.dismiss();
  }, [visible]);
```

(delete the `const typing = false` line and the three lines it fed, now computed above; `Keyboard.dismiss()` also runs when a visible panel unmounts — harmless, in tests too), and give the body its refs: `<ScrollView ref={scrollRef} …>` and `<View ref={contentRef} collapsable={false} …>`. Update the component's comment: "While the keyboard is up the panel takes its typing height and does not render its lead; the host pads the bottom by the keyboard."

`src/editor/components/EditorLayout.tsx`:

```tsx
import { useKeyboard, useKeyboardTracking } from "@/src/ui/keyboard";
import { useStripPresence } from "@/src/ui/ToolStrip";
…
  useKeyboardTracking();
  const panel = usePanelPresence((s) => s.count > 0);
  const strip = useStripPresence((s) => s.count > 0);
  const keyboardUp = useKeyboard((s) => s.height > 0);
  // A panel always takes the timeline's place; a strip does while it has the keyboard (which would cover most of the timeline anyway).
  const collapsed = panel || (strip && keyboardUp);
```

and extend the comment accordingly.

`src/editor/components/EditorToolbar.tsx` — `import { useKeyboard } from "@/src/ui/keyboard";`, next to `toolShown`: `const keyboard = useKeyboard((s) => s.height);` and replace the three layout lines of Task 1:

```tsx
  // The keyboard only counts while a tool shows: the tool then sits on it, at its typing height, and nothing is lifted.
  const typing = toolShown && keyboard > 0;
  const pad = typing ? keyboard : Math.max(insets.bottom, theme.space.sm);
  const area = panelSize ? panelHeight(panelSize, windowH, typing) : stripShown ? STRIP.height : BAR_HEIGHT;
  …
      height: area + pad, marginTop: stripShown && !typing ? -STRIP.lift : 0 }}>
```

`src/editor/components/StickerSheet.tsx` — `ToolPanel` instead of `Sheet`; `const SEARCH_ROW = 52;`; the return becomes:

```tsx
    <ToolPanel visible={visible} onClose={onClose} title="Sticker" scroll={false}
      lead={<>
        <Chip label="Emoji" selected={tab === "emoji"} onPress={() => setTab("emoji")} />
        <Chip label="Shapes" selected={tab === "shapes"} onPress={() => setTab("shapes")} />
      </>}>
      {(bodyHeight) => tab === "emoji" ? (
        <View style={{ height: bodyHeight }}>
          <View style={{ height: SEARCH_ROW, justifyContent: "center" }}>
            <TextInput accessibilityLabel="Search emoji" … (unchanged props and style) />
          </View>
          <FlatList testID="emoji-grid" style={{ height: bodyHeight - SEARCH_ROW }} data={results} keyExtractor={(e) => e.char} numColumns={8}
            keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag"
            ListHeaderComponent={recent.length > 0 && !query ? ( /* the recents row, unchanged, plus marginBottom: theme.space.sm */ ) : null}
            renderItem={/* unchanged */} />
        </View>
      ) : (
        <ScrollView style={{ height: bodyHeight }} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={{ gap: theme.space.md, paddingVertical: theme.space.md }}>
          {/* ColorRow and the shape tiles, unchanged */}
        </ScrollView>
      )}
    </ToolPanel>
```

Delete the comment about the sheet's maximum height. `addEmoji` / `addShape` are not edited.

- [ ] **Step 4:** `npm run typecheck`; `npm test`.
- [ ] **Step 5: Commit** — `git add src/ui/keyboard.ts src/ui/__tests__/keyboard.test.tsx src/ui/ToolPanel.tsx src/ui/__tests__/ToolPanel.test.tsx src/editor/components/EditorLayout.tsx src/editor/__tests__/EditorLayout.test.tsx src/editor/components/EditorToolbar.tsx src/editor/components/StickerSheet.tsx src/editor/__tests__/StickerSheet.test.tsx`; `feat(editor): panels and strips sit on the keyboard and the preview stays in view; Stickers is a panel`.

---

### Task 3: Text panel and sticker editor

**Depends on:** Tasks 1, 2. **Parallel-safe with:** Tasks 4, 5, 6.

**Files:** Modify `src/editor/components/TextPanel.tsx`, `src/editor/components/StickerPanel.tsx`, `src/editor/__tests__/TextPanel.test.tsx` (one case replaced); create `src/editor/__tests__/panels.text.test.tsx`.

**Do not touch:** `EditorToolbar.tsx`, `app/editor/[id]/index.tsx`, `toolStrip.ts`, `src/ui/*`, `ColorRow.tsx`, `FontStrip.tsx`, `TemplateStrip.tsx`, `TextStyleSection.tsx`, `StickerSheet.tsx`, `CaptionStyleSheet.tsx`, and every other existing test file — `TextPanel.style.test.tsx`, `TextStyleSection.test.tsx`, `StickerPanel.test.tsx`, `OverlayMotion.test.tsx`, `EditorToolbar*.test.tsx` must pass unedited (if one fails, stop and report).

**Interfaces — Consumes:** `ToolPanel` (`title`, `size`, `bodyTestID`). The host already passes `overlayId={selectedOverlayId}`, `onClose={closeStrip}`, `onRetarget={rekeyStrip}` and removes a text left empty when the panel closes (Task 1). **Produces:** nothing new — `TextPanel` and `StickerPanel` keep their props `{ overlayId, visible, onClose, onRetarget? }`.

**Behaviour**

- `TextPanel`: `<ToolPanel visible={visible} onClose={onClose} title="Text" bodyTestID="text-panel-scroll">`; its own `ScrollView` goes (the panel's body is the scroll and carries the test id). Order of the content: **the text field first**, then the template strip (texts only), then everything as today. The body's `PrimaryButton` "Done" is removed (the header ✓ is the one Done). Duplicate and Delete are unchanged (`selectOverlay(dup.id); onRetarget?.(dup.id)` — select first; Delete: `apply`, `onClose()`).
- Typing: one undo step per focus, as today — and if the history got shorter since that step began (the user pressed Undo, now reachable while typing), the next keystroke begins a new step.
- `StickerPanel`: `<ToolPanel visible={visible} onClose={onClose} title="Sticker" size="compact">`; its own `ScrollView` goes.

- [ ] **Step 1: Failing tests.**

`src/editor/__tests__/TextPanel.test.tsx` — replace the case "Done is disabled while the text is empty" by:

```tsx
test("there is one Done — the panel's ✓ — and it closes even while the text is empty (the host removes an empty text)", async () => {
  const onClose = jest.fn();
  await render(<TextPanel overlayId="o1" visible onClose={onClose} />);
  await fireEvent.changeText(screen.getByLabelText("Overlay text"), "");
  expect(screen.getAllByRole("button", { name: "Done" })).toHaveLength(1);
  await fireEvent.press(screen.getByRole("button", { name: "Done" }));
  expect(onClose).toHaveBeenCalledTimes(1);
});
```

Create `src/editor/__tests__/panels.text.test.tsx`:

```tsx
import { act, fireEvent, render, screen } from "@testing-library/react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-05T10:00:00.000Z" }));
import { Dimensions } from "react-native";
import { isTextOverlay, makeClip, makeOverlay, makeProject, makeSticker } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { useKeyboard } from "@/src/ui/keyboard";
import { PANEL, panelHeight } from "@/src/ui/ToolPanel";
import { StickerPanel } from "../components/StickerPanel";
import { TextPanel } from "../components/TextPanel";

const st = () => useEditorStore.getState();
const H = Dimensions.get("window").height;
const text = () => { const o = st().project!.overlays.find((x) => x.id === "o1")!; return isTextOverlay(o) ? o.text : ""; };

beforeEach(() => {
  st().reset();
  st().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 10 })], overlays: [makeOverlay({ id: "o1", text: "Hi", start: 1, end: 4 }), makeSticker({ id: "s1", start: 1, end: 4 })] }));
});
afterEach(() => { useKeyboard.setState({ height: 0 }); });

test("the text panel is a regular panel: inline, no scrim, one vertical scroll that keeps its test id", async () => {
  await render(<TextPanel overlayId="o1" visible onClose={() => {}} />);
  expect(screen.getByRole("header", { name: "Text" })).toBeTruthy();
  expect(screen.getByTestId("tool-panel")).toHaveStyle({ height: panelHeight("regular", H) - 1 });
  expect(screen.queryByLabelText("Close sheet")).toBeNull();
  expect(screen.getByTestId("text-panel-scroll")).toHaveStyle({ height: panelHeight("regular", H) - 1 - PANEL.header });
});

test("the text field comes first in the body, so it is in view at the typing height", async () => {
  await render(<TextPanel overlayId="o1" visible onClose={() => {}} />);
  const field = screen.getByLabelText("Overlay text");
  expect(field.parent?.children[0]).toBe(field);                       // first child of the body's content view: nothing above it
  await act(() => { useKeyboard.setState({ height: 336 }); });
  expect(screen.getByTestId("tool-panel")).toHaveStyle({ height: panelHeight("regular", H, true) - 1 });
  expect(screen.getByLabelText("Overlay text")).toBeTruthy();
});

test("typing is one undo step per focus; typing after an Undo is a new step", async () => {
  await render(<TextPanel overlayId="o1" visible onClose={() => {}} />);
  const field = screen.getByLabelText("Overlay text");
  await fireEvent(field, "focus");
  await fireEvent.changeText(field, "Hi t");
  await fireEvent.changeText(field, "Hi there");
  expect(st().past).toHaveLength(1);
  await act(() => { st().undo(); });
  expect(text()).toBe("Hi");
  expect(st().past).toHaveLength(0);
  await fireEvent.changeText(field, "Hi you");
  expect(st().past).toHaveLength(1);
  await act(() => { st().undo(); });
  expect(text()).toBe("Hi");
});

test("the sticker editor is a compact panel: inline, no scrim, Done closes", async () => {
  const onClose = jest.fn();
  await render(<StickerPanel overlayId="s1" visible onClose={onClose} />);
  expect(screen.getByRole("header", { name: "Sticker" })).toBeTruthy();
  expect(screen.getByTestId("tool-panel")).toHaveStyle({ height: 239 });
  expect(screen.queryByLabelText("Close sheet")).toBeNull();
  expect(screen.getByTestId("sticker-size-slider")).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: "Done" }));
  expect(onClose).toHaveBeenCalledTimes(1);
});
```

(`field.parent` is the field's host parent — the body's content view. If RNTL's tree puts another host view in between, keep the intent — nothing is rendered above the text field in the body — and adjust only that line.)

- [ ] **Step 2: Run** `npx.cmd jest src/editor/__tests__/panels.text.test.tsx src/editor/__tests__/TextPanel.test.tsx` → FAIL.
- [ ] **Step 3: Implement.**

`TextPanel.tsx`: imports — `useRef` added, `ScrollView` and `PrimaryButton` and `Sheet` removed, `ToolPanel` added. Before the early `return null` (hooks first):

```tsx
  // How long the history was right after this typing's undo step began (see `type`).
  const typedFrom = useRef(0);
```

after `patch` / `patchShared`:

```tsx
  // Typing is one undo step per focus. Undo is reachable while the panel is open: if the history got shorter since that step began,
  // the step is gone, and the next keystroke begins a new one instead of being written into the step before it.
  const beginTyping = () => { beginTransaction(); typedFrom.current = useEditorStore.getState().past.length; };
  const type = (t: string) => {
    if (useEditorStore.getState().past.length < typedFrom.current) beginTyping();
    applyTransient((x) => updateOverlay(x, id, { text: t }));
  };
```

and the return:

```tsx
    <ToolPanel visible={visible} onClose={onClose} title="Text" bodyTestID="text-panel-scroll">
      <TextInput accessibilityLabel="Overlay text" multiline autoFocus value={overlay.text} onFocus={beginTyping} onChangeText={type}
        style={{ ...field, minHeight: 64, textAlignVertical: "top" }} placeholder="Your text" placeholderTextColor={theme.colors.textMuted} />
      {/* Templates are for texts only (`applyTextTemplate` refuses captions, which have their own presets). */}
      {overlay.kind === "text" && <TemplateStrip tiles={TEXT_TEMPLATE_TILES} onPick={(templateId) => apply((x) => applyTextTemplate(x, id, templateId))} />}
      {/* FontStrip … the Duplicate / Delete row: unchanged, in today's order */}
    </ToolPanel>
```

`StickerPanel.tsx`: `ToolPanel` instead of `Sheet`, `ScrollView` import removed; `<ToolPanel visible={visible} onClose={onClose} title="Sticker" size="compact">` around the same children.

- [ ] **Step 4:** `npm run typecheck`; `npm test`.
- [ ] **Step 5: Commit** — `git add src/editor/components/TextPanel.tsx src/editor/components/StickerPanel.tsx src/editor/__tests__/TextPanel.test.tsx src/editor/__tests__/panels.text.test.tsx`; `feat(editor): the text panel and the sticker editor are tall panels`.

---

### Task 4: Add audio

**Depends on:** Tasks 1, 2. **Parallel-safe with:** Tasks 3, 5, 6.

**Files:** Modify `src/editor/components/AddAudioSheet.tsx`, `src/editor/components/RecordTab.tsx` (comments only), `src/editor/__tests__/AddAudioSheet.test.tsx`.

**Do not touch:** `src/editor/useVoiceRecorder.ts`, `src/editor/audioMode.ts`, `AudioPreview.tsx`, `EditorToolbar.tsx`, `toolStrip.ts`, `src/ui/*`, `jest.setup.ts`, `RecordTab.test.tsx`, `useVoiceRecorder.test.tsx`, `EditorToolbar*.test.tsx` (they must pass unedited).

**Interfaces — Consumes:** `ToolPanel` (`lead`); the store's recording rule (Task 1): the closer waits and `openStrip` does nothing while `useEditorStore.getState().recording`. **Produces:** nothing new — `AddAudioSheet` keeps `{ visible, onClose }`.

**Behaviour**

- `<ToolPanel visible={visible} onClose={close} title="Add audio" lead={the four tab chips}>` — `close` is today's guarded close (mid-recording: stop and save first; the tab then closes the panel through `closeNow`). The tab bodies go straight into the panel's scrolling body; the two inner `ScrollView`s become plain `View`s with `gap: theme.space.sm`.
- The preview player and its timer are not edited: `useAudioPlayer(null)` at component level, `stopPreview()` when `visible` turns false, on a tab change and on close; the unmount cleanup as today.
- Every "close first, then the toast" order stays (the reason is now "the panel is taller than the toast's place", not the Modal) — only the comments change.

- [ ] **Step 1: Failing tests.** In `src/editor/__tests__/AddAudioSheet.test.tsx`:

  - the three `await fireEvent.press(screen.getByLabelText("Close sheet"));` become `await fireEvent.press(btn("Done"));` (cases "…stops the preview when the sheet closes", "the preview player is left alone while nothing is previewing", "closing the sheet while recording stops and saves, then closes");
  - add `import { closeStrip, openStrip, useStripCloser, useToolStrip } from "../toolStrip";`, `closeStrip();` in `beforeEach`, and append:

```tsx
test("it is a panel: inline, no scrim, the four tabs in the lead", async () => {
  await render(<AddAudioSheet visible onClose={() => {}} />);
  expect(screen.getByTestId("tool-panel")).toBeTruthy();
  expect(screen.getByTestId("tool-panel-lead")).toBeTruthy();
  expect(screen.queryByLabelText("Close sheet")).toBeNull();
  for (const l of ["Music", "Files", "Effects", "Record"]) expect(btn(l)).toBeTruthy();
});

test("hidden by its host (the closer, Export) it stops the preview, as when the sheet was hidden", async () => {
  const view = await render(<AddAudioSheet visible onClose={() => {}} />);
  await fireEvent.press(btn("Effects"));
  await fireEvent.press(btn("Play Whoosh"));
  mockPlayer.pause.mockClear();
  await view.rerender(<AddAudioSheet visible={false} onClose={() => {}} />);
  expect(mockPlayer.pause).toHaveBeenCalled();
});

test("as a panel: a selection change while recording does not take it away; stopping saves, selects the voice-over and closes it", async () => {
  function Host() {
    useStripCloser();
    const open = useToolStrip((s) => s.open);
    return <AddAudioSheet visible={open?.id === "addAudio"} onClose={closeStrip} />;
  }
  await render(<Host />);
  await act(() => { openStrip("addAudio"); });
  await fireEvent.press(btn("Record"));
  await fireEvent.press(btn("Start recording"));
  await waitFor(() => expect(btn("Stop recording")).toBeEnabled());
  mockRecorder.currentTime = 2.5;
  await act(() => { useEditorStore.getState().select("a"); });
  expect(useToolStrip.getState().open?.id).toBe("addAudio");
  expect(useEditorStore.getState().recording).toBe(true);
  await act(() => { openStrip("ratio"); });
  expect(useToolStrip.getState().open?.id).toBe("addAudio");
  await fireEvent.press(btn("Stop recording"));
  await waitFor(() => expect(useToolStrip.getState().open).toBeNull());
  expect(tracks()).toHaveLength(1);
  expect(useEditorStore.getState().selectedAudioId).toBe(tracks()[0].id);
  expect(useEditorStore.getState().recording).toBe(false);
});

test("adding a bundled track selects it and closes the panel; the closer has nothing left to do", async () => {
  function Host() {
    useStripCloser();
    const open = useToolStrip((s) => s.open);
    return <AddAudioSheet visible={open?.id === "addAudio"} onClose={closeStrip} />;
  }
  await render(<Host />);
  await act(() => { openStrip("addAudio"); });
  await fireEvent.press(btn("Use Sunny Loop"));
  await waitFor(() => expect(tracks()).toHaveLength(1));
  await waitFor(() => expect(useToolStrip.getState().open).toBeNull());
  expect(useEditorStore.getState().selectedAudioId).toBe(tracks()[0].id);
});
```

- [ ] **Step 2: Run** `npx.cmd jest src/editor/__tests__/AddAudioSheet.test.tsx` → FAIL.
- [ ] **Step 3: Implement.** `AddAudioSheet.tsx`: `ToolPanel` instead of `Sheet`; `ScrollView` import removed. The return:

```tsx
    <ToolPanel visible={visible} onClose={close} title="Add audio"
      lead={TABS.map((t) => <Chip key={t.id} label={t.label} selected={tab === t.id} onPress={() => { if (t.id === tab || recordGuard.current?.()) return; stopPreview(); setTab(t.id); }} />)}>
      {tab === "music" && (BUNDLED_TRACKS.length === 0 ? (
        <Body muted>No bundled tracks yet — use Files.</Body>
      ) : (
        <View style={{ gap: theme.space.sm }}>{BUNDLED_TRACKS.map((t) => row({ /* unchanged */ }))}</View>
      ))}
      {tab === "files" && <PrimaryButton title="Choose a file" disabled={busy} onPress={pickFile} />}
      {tab === "effects" && <View style={{ gap: theme.space.sm }}>{SFX_IDS.map((id) => row({ /* unchanged */ }))}</View>}
      {tab === "record" && <RecordTab onDone={closeNow} closeGuard={recordGuard} />}
    </ToolPanel>
```

Comments: every "sheet" → "panel"; "The sheet is a native Modal and would cover the toast: close first." → "Close first: the toast shows where the panel was."; the header comment gains "While a voice-over is recorded the tool store leaves this panel alone (`src/editor/toolStrip.ts`)". `RecordTab.tsx`: "The Add audio sheet's Record tab" → "panel's"; "when the sheet should close" → "panel". No code change in `RecordTab.tsx`.

- [ ] **Step 4:** `npm run typecheck`; `npm test`.
- [ ] **Step 5: Commit** — `git add src/editor/components/AddAudioSheet.tsx src/editor/components/RecordTab.tsx src/editor/__tests__/AddAudioSheet.test.tsx`; `feat(editor): Add audio is a tall panel; recording keeps it open`.

---

### Task 5: Templates, Captions, Caption style

**Depends on:** Tasks 1, 2. **Parallel-safe with:** Tasks 3, 4, 6.

**Files:** Modify `src/editor/components/TemplateSheet.tsx`, `src/editor/components/CaptionsSheet.tsx`, `src/editor/components/CaptionStyleSheet.tsx`, `src/editor/__tests__/CaptionsSheet.test.tsx` (one line); create `src/editor/__tests__/panels.pickers.test.tsx`.

**Do not touch:** `src/editor/useCaptions.ts`, `src/editor/templates.ts`, `TemplateStrip.tsx`, `TextStyleSection.tsx`, `ColorRow.tsx`, `FontStrip.tsx`, `EditorToolbar.tsx`, `toolStrip.ts`, `src/ui/*`, and `TemplateSheet.test.tsx`, `CaptionStyleSheet.test.tsx`, `store.templates.test.ts`, `useCaptions.test.ts`, `EditorToolbar*.test.tsx` (they must pass unedited).

**Interfaces — Consumes:** `ToolPanel` (`lead`, `size`, `bodyTestID`); `rekeyStrip` (Task 1). **Produces:** nothing new — the three components keep their props.

**Behaviour**

- `TemplateSheet`: `<ToolPanel visible={visible} onClose={onClose} title="Templates" lead={the two scope chips}>`; the tiles (wrapping) and the "Applied …" line in the scrolling body. A re-roll undoes the previous template **only if the project is still the one this panel left** (the user may have pressed Undo, or edited, in between — both reachable now); the selected ring, the "Applied …" line and `pickRandomTemplate`'s exclusion follow the same condition.
- `CaptionStyleSheet`: `<ToolPanel visible={visible} onClose={onClose} title="Caption style" bodyTestID="caption-style-scroll">`; its own `ScrollView` goes.
- `CaptionsSheet`: `<ToolPanel visible={visible && !styling} onClose={close} title="Captions" size="compact">` and, beside it (not inside), `<CaptionStyleSheet visible={visible && styling} onClose={() => setStyling(false)} />` — one panel at a time; ✓ on Caption style returns to Captions. The "done" card's `SecondaryButton title="Done"` is removed (the header ✓ runs the same `close`). When `visible` turns false by any way (the closer, Export) a running transcription is cancelled, the state reset and `styling` cleared. Transcribe / Replace / Try again first deselect a selected caption and re-key the panel, then run.

- [ ] **Step 1: Failing tests.**

`src/editor/__tests__/CaptionsSheet.test.tsx` — in "closing the sheet mid-run cancels the transcription": `await fireEvent.press(screen.getAllByLabelText("Close sheet")[0]);` → `await fireEvent.press(screen.getByRole("button", { name: "Done" }));`.

Create `src/editor/__tests__/panels.pickers.test.tsx`:

```tsx
import { act, fireEvent, render, screen } from "@testing-library/react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-05T10:00:00.000Z" }));
let mockNative = false;
jest.mock("@/modules/clipy-video", () => ({ isNativeAvailable: () => mockNative, transcribe: jest.fn(), cancelTranscribe: jest.fn() }));
import { cancelTranscribe, transcribe } from "@/modules/clipy-video";
import { Dimensions } from "react-native";
import { renameProject } from "@/src/editor/model/ops";
import { makeClip, makeOverlay, makeProject } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { PANEL, panelHeight } from "@/src/ui/ToolPanel";
import { CaptionsSheet } from "../components/CaptionsSheet";
import { CaptionStyleSheet } from "../components/CaptionStyleSheet";
import { TemplateSheet } from "../components/TemplateSheet";
import { closeStrip, openStrip, useStripCloser, useToolStrip } from "../toolStrip";

const st = () => useEditorStore.getState();
const H = Dimensions.get("window").height;
const btn = (name: string) => screen.getByRole("button", { name });

beforeEach(() => {
  jest.clearAllMocks(); mockNative = false;
  closeStrip();
  st().reset();
  st().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 4 }), makeClip({ id: "b", sourceDuration: 4 })], overlays: [makeOverlay({ id: "c1", kind: "caption", start: 0, end: 1 })] }));
});

describe("Templates", () => {
  test("is a regular panel: inline, no scrim, the scope chips in the lead, Done closes", async () => {
    const onClose = jest.fn();
    await render(<TemplateSheet clipId="a" visible onClose={onClose} />);
    expect(screen.getByRole("header", { name: "Templates" })).toBeTruthy();
    expect(screen.getByTestId("tool-panel")).toHaveStyle({ height: panelHeight("regular", H) - 1 });
    expect(screen.getByTestId("tool-panel-body")).toHaveStyle({ height: panelHeight("regular", H) - 1 - PANEL.header - PANEL.lead });
    expect(screen.queryByLabelText("Close sheet")).toBeNull();
    expect(btn("This clip")).toBeSelected();
    await fireEvent.press(btn("Done"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test("a re-roll replaces the previous template in one undo step, as before", async () => {
    await render(<TemplateSheet clipId="a" visible onClose={() => {}} />);
    await fireEvent.press(btn("Template Retro"));
    await fireEvent.press(btn("Template Neon"));
    expect(st().past).toHaveLength(1);
    expect(screen.getByText("Applied Neon · tap Undo to revert")).toBeTruthy();
  });

  test("after the user's own Undo a re-roll does not undo anything else, and the panel no longer claims a template is applied", async () => {
    st().apply((p) => renameProject(p, "Renamed"));                      // an earlier edit: one step
    await render(<TemplateSheet clipId="a" visible onClose={() => {}} />);
    await fireEvent.press(btn("Template Retro"));
    expect(st().past).toHaveLength(2);
    await act(() => { st().undo(); });                                   // the transport row's Undo, reachable with the panel open
    expect(screen.queryByText(/Applied Retro/)).toBeNull();
    expect(btn("Template Retro")).not.toBeSelected();
    await fireEvent.press(btn("Template Neon"));
    expect(st().past).toHaveLength(2);
    expect(st().project!.name).toBe("Renamed");
    expect(screen.getByText("Applied Neon · tap Undo to revert")).toBeTruthy();
  });
});

describe("Caption style", () => {
  test("is a regular panel whose body is the one vertical scroll with its test id", async () => {
    await render(<CaptionStyleSheet visible onClose={() => {}} />);
    expect(screen.getByRole("header", { name: "Caption style" })).toBeTruthy();
    expect(screen.getByTestId("caption-style-scroll")).toHaveStyle({ height: panelHeight("regular", H) - 1 - PANEL.header });
    expect(screen.queryByLabelText("Close sheet")).toBeNull();
  });
});

describe("Captions", () => {
  test("is a compact panel; Style captions takes its place and Done there returns to it", async () => {
    await render(<CaptionsSheet visible onClose={() => {}} />);
    expect(screen.getByRole("header", { name: "Captions" })).toBeTruthy();
    expect(screen.getByTestId("tool-panel")).toHaveStyle({ height: 239 });
    expect(screen.queryByLabelText("Close sheet")).toBeNull();
    await fireEvent.press(btn("Style captions"));
    expect(screen.getAllByTestId("tool-panel")).toHaveLength(1);         // one panel at a time
    expect(screen.getByRole("header", { name: "Caption style" })).toBeTruthy();
    expect(screen.queryByRole("header", { name: "Captions" })).toBeNull();
    await fireEvent.press(btn("Done"));
    expect(screen.getByRole("header", { name: "Captions" })).toBeTruthy();
    expect(screen.queryByRole("header", { name: "Caption style" })).toBeNull();
  });

  test("hidden by its host while styling, it opens on Captions the next time", async () => {
    const view = await render(<CaptionsSheet visible onClose={() => {}} />);
    await fireEvent.press(btn("Style captions"));
    await view.rerender(<CaptionsSheet visible={false} onClose={() => {}} />);
    expect(screen.queryByTestId("tool-panel")).toBeNull();
    await view.rerender(<CaptionsSheet visible onClose={() => {}} />);
    expect(screen.getByRole("header", { name: "Captions" })).toBeTruthy();
  });

  test("hidden by its host mid-run, the transcription is cancelled and nothing lands", async () => {
    mockNative = true;
    st().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 2 })] }));
    let finish!: () => void;
    jest.mocked(transcribe).mockImplementation(() => new Promise((res) => { finish = () => res([{ text: "late", start: 0, end: 1 }]); }));
    const view = await render(<CaptionsSheet visible onClose={() => {}} />);
    const pressed = fireEvent.press(screen.getByText("Transcribe"));
    await new Promise((r) => setImmediate(r));
    expect(screen.getByText(/Transcribing clip 1 of 1/)).toBeTruthy();
    await view.rerender(<CaptionsSheet visible={false} onClose={() => {}} />);
    expect(cancelTranscribe).toHaveBeenCalledTimes(1);
    await act(async () => { finish(); await pressed; });
    expect(st().project!.overlays).toEqual([]);
  });

  test("Replace with a caption selected: it is deselected and the panel re-keyed first, so replacing the captions does not close the panel", async () => {
    mockNative = true;
    jest.mocked(transcribe).mockResolvedValue([{ text: "hello there", start: 0, end: 1 }]);
    function Host() {
      useStripCloser();
      const open = useToolStrip((s) => s.open);
      return <CaptionsSheet visible={open?.id === "captions"} onClose={closeStrip} />;
    }
    await render(<Host />);
    await act(() => { st().selectOverlay("c1"); openStrip("captions"); });
    expect(useToolStrip.getState().open).toEqual({ id: "captions", key: "overlay:c1" });
    await fireEvent.press(screen.getByText("Replace"));
    expect(st().selectedOverlayId).toBeNull();
    expect(useToolStrip.getState().open).toEqual({ id: "captions", key: "none" });
    expect(st().project!.overlays.some((o) => o.id === "c1")).toBe(false);
    expect(screen.getByText("Added captions.")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Done" })).toHaveLength(1);   // the header's ✓ only
  });
});
```

- [ ] **Step 2: Run** `npx.cmd jest src/editor/__tests__/panels.pickers.test.tsx src/editor/__tests__/CaptionsSheet.test.tsx` → FAIL.
- [ ] **Step 3: Implement.**

`TemplateSheet.tsx`: `ToolPanel` instead of `Sheet`; `useRef` and `type Project` (`@/src/editor/model/types`) imported. New state / derived values:

```tsx
  const project = useEditorStore((s) => s.project);
  // The project as this panel's last template left it. Undo and the preview are reachable while the panel is open: a re-roll may
  // only undo that template while nothing else has happened since.
  const applied = useRef<Project | null>(null);
  const current = lastId !== null && project === applied.current ? lastId : null;
  const use = (t: Template) => {
    haptic("light");
    if (current !== null) undo();
    apply((p) => applyTemplate(p, t, effective, clipId));
    applied.current = useEditorStore.getState().project;
    setLastId(t.id);
  };
```

In the render use `current` wherever `lastId` was read (`pickRandomTemplate(current)`, `selected = current === id`, the "Applied …" line). The return: `<ToolPanel visible={visible} onClose={onClose} title="Templates" lead={<> the two Chips </>}>`, then the wrapping tiles view and the "Applied …" line as its children. Comment "within one open sheet" → "panel".

`CaptionStyleSheet.tsx`: `ToolPanel` instead of `Sheet`, `ScrollView` import removed; `<ToolPanel visible={visible} onClose={onClose} title="Caption style" bodyTestID="caption-style-scroll">` around the children of the old `ScrollView`. Comments "the sheet's owner" → "the panel's owner".

`CaptionsSheet.tsx`: `ToolPanel` instead of `Sheet`; `useEffect` imported; `rekeyStrip` from `@/src/editor/toolStrip`.

```tsx
  // Closing mid-run cancels it, so captions never land after the panel is gone.
  const close = () => { if (state.status === "running") cancel(); reset(); onClose(); };
  // Hidden by the host (another selection, Export): the same clean-up, and the next opening starts on Captions.
  useEffect(() => {
    if (visible) return;
    if (state.status === "running") cancel();
    reset();
    setStyling(false);
  }, [visible]);
  // The captions are about to be replaced: a selected one would vanish and close this panel with it. Deselect it and re-key first.
  const start = () => {
    const s = useEditorStore.getState();
    if (s.selectedOverlayId && s.project?.overlays.find((o) => o.id === s.selectedOverlayId)?.kind === "caption") { s.selectOverlay(null); rekeyStrip(); }
    return run();
  };
```

Every `onPress={run}` becomes `onPress={start}` (Replace, Transcribe, Try again). The return is a fragment:

```tsx
    <>
      <ToolPanel visible={visible && !styling} onClose={close} title="Captions" size="compact">
        {/* the state cards, unchanged — minus the "done" card's <SecondaryButton title="Done" …/> */}
      </ToolPanel>
      <CaptionStyleSheet visible={visible && styling} onClose={() => setStyling(false)} />
    </>
```

(The outer `<View style={{ gap: theme.space.lg }}>` around the cards goes: the panel's body already spaces its children.) Comment "three uppercase buttons don't fit one row in a 327 pt sheet" → "panel".

- [ ] **Step 4:** `npm run typecheck`; `npm test`.
- [ ] **Step 5: Commit** — `git add src/editor/components/TemplateSheet.tsx src/editor/components/CaptionsSheet.tsx src/editor/components/CaptionStyleSheet.tsx src/editor/__tests__/CaptionsSheet.test.tsx src/editor/__tests__/panels.pickers.test.tsx`; `feat(editor): Templates, Captions and Caption style are tall panels`.

---

### Task 6: Strips — the Effects picker and Trim

**Depends on:** Tasks 1, 2. **Parallel-safe with:** Tasks 3, 4, 5.

**Files:** Modify `src/editor/components/EffectSheet.tsx`, `src/editor/components/TrimSheet.tsx`; create `src/editor/__tests__/strips.r2.test.tsx`.

**Do not touch:** `EffectStrengthSheet.tsx`, `src/ui/*`, `EditorToolbar.tsx`, `toolStrip.ts`, `src/editor/model/*`, and `EffectSheet.test.tsx`, `TrimSheet.test.tsx`, `LayerSheets.test.tsx`, `EditorToolbar*.test.tsx` (they must pass unedited).

**Interfaces — Consumes:** `ToolStrip`, `StripTiles`, `StripNote`, `STRIP` (`src/ui/ToolStrip.tsx`); the host opens them with `strip?.id === "effect"` / `"trim"` and pads the strip by the keyboard (Tasks 1, 2). **Produces:** nothing new.

**Behaviour**

- `EffectSheet`: `<ToolStrip visible={visible} onClose={onClose} title="Effects">` with one `<StripTiles>` row of the twelve `ToolButton`s. `add` is not edited (one tile per opening; a refusal closes first, then the toast; an add selects the effect, then closes).
- `TrimSheet`: `<ToolStrip visible={visible} onClose={onClose} title="Trim" note={<StripNote lines={2}>…the helper line…</StripNote>}>` and one row of explicit height `STRIP.tiles`: the field(s) sharing the width (`flex: 1` — width only, the row's height is explicit) and the compact Apply button. No `autoFocus`. `submit` is not edited (Apply closes first, then a refusal toast).

- [ ] **Step 1: Failing tests.** Create `src/editor/__tests__/strips.r2.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react-native";
jest.mock("@/src/lib/id", () => ({ newId: () => "new" }));
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-05T10:00:00.000Z" }));
import { EFFECT_IDS, makeClip, makePhotoClip, makeProject } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { STRIP } from "@/src/ui/ToolStrip";
import { EffectSheet } from "../components/EffectSheet";
import { TrimSheet } from "../components/TrimSheet";

const st = () => useEditorStore.getState();
beforeEach(() => {
  st().reset();
  st().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 4 }), makePhotoClip({ id: "p", seconds: 3 })] }));
});

test("the Effects picker is a strip: inline, no scrim, the twelve tiles in one sideways row, Done closes", async () => {
  const onClose = jest.fn();
  await render(<EffectSheet visible onClose={onClose} />);
  expect(screen.getByTestId("tool-strip")).toBeTruthy();
  expect(screen.queryByTestId("tool-panel")).toBeNull();
  expect(screen.queryByLabelText("Close sheet")).toBeNull();
  expect(screen.getByTestId("strip-tiles")).toHaveStyle({ height: STRIP.tiles });
  expect(screen.getAllByRole("button")).toHaveLength(EFFECT_IDS.length + 1);     // the tiles and Done
  await fireEvent.press(screen.getByRole("button", { name: "Done" }));
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(st().project!.effects).toEqual([]);
});

test("Trim is a strip: the helper line in the header, the fields and Apply in one row of explicit height", async () => {
  const onClose = jest.fn();
  await render(<TrimSheet clipId="a" visible onClose={onClose} />);
  expect(screen.getByTestId("tool-strip")).toBeTruthy();
  expect(screen.queryByLabelText("Close sheet")).toBeNull();
  expect(screen.getByRole("header", { name: "Trim" })).toBeTruthy();
  expect(screen.getByText("Seconds into the original clip (0 – 4.0)")).toHaveProp("numberOfLines", 2);
  expect(screen.getByTestId("trim-row")).toHaveStyle({ height: STRIP.tiles, flexDirection: "row" });
  expect(screen.getByLabelText("Trim start").props.autoFocus).toBeFalsy();
  await fireEvent.changeText(screen.getByLabelText("Trim end"), "2.5");
  await fireEvent.press(screen.getByRole("button", { name: "Apply" }));
  expect(st().project!.clips[0].trimEnd).toBe(2.5);
  expect(st().past).toHaveLength(1);
  expect(onClose).toHaveBeenCalledTimes(1);
});

test("Trim for a photo: one Length field in the same row; Done closes without trimming", async () => {
  const onClose = jest.fn();
  await render(<TrimSheet clipId="p" visible onClose={onClose} />);
  expect(screen.getByText("How long the photo stays on screen (0.5 – 60 s)")).toHaveProp("numberOfLines", 2);
  expect(screen.getByTestId("trim-row")).toHaveStyle({ height: STRIP.tiles });
  expect(screen.getByLabelText("Length")).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: "Done" }));
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(st().past).toHaveLength(0);
});
```

- [ ] **Step 2: Run** `npx.cmd jest src/editor/__tests__/strips.r2.test.tsx` → FAIL.
- [ ] **Step 3: Implement.**

`EffectSheet.tsx`: imports — `View` and `Sheet` removed, `StripTiles, ToolStrip` from `@/src/ui/ToolStrip`. The return:

```tsx
    <ToolStrip visible={visible} onClose={onClose} title="Effects">
      <StripTiles>
        {EFFECT_IDS.map((id) => <ToolButton key={id} label={EFFECTS[id].label} icon={EFFECTS[id].icon} onPress={() => add(id)} />)}
      </StripTiles>
    </ToolStrip>
```

Comments: "closes the sheet" → "closes the strip"; "The sheet is a native Modal and would cover the toast: close first." → "Close first: the toast shows where the strip was."

`TrimSheet.tsx`: imports — `Sheet` and `Body` removed, `STRIP, StripNote, ToolStrip` added. One row constant and the two returns:

```tsx
const row = { height: STRIP.tiles, flexDirection: "row", alignItems: "center", gap: theme.space.md, paddingHorizontal: theme.space.lg } as const;
…
  if (isPhoto(clip)) {
    return (
      <ToolStrip visible={visible} onClose={onClose} title="Trim" note={<StripNote lines={2}>How long the photo stays on screen (0.5 – 60 s)</StripNote>}>
        <View testID="trim-row" style={row}>
          <TextInput accessibilityLabel="Length" keyboardType="decimal-pad" value={end} onChangeText={setEnd} style={field} />
          <PrimaryButton compact title="Apply" onPress={() => submit(0, Number(end) || 0)} />
        </View>
      </ToolStrip>
    );
  }
  return (
    <ToolStrip visible={visible} onClose={onClose} title="Trim" note={<StripNote lines={2}>{`Seconds into the original clip (0 – ${clip.sourceDuration.toFixed(1)})`}</StripNote>}>
      <View testID="trim-row" style={row}>
        <TextInput accessibilityLabel="Trim start" keyboardType="decimal-pad" value={start} onChangeText={setStart} style={field} />
        <TextInput accessibilityLabel="Trim end" keyboardType="decimal-pad" value={end} onChangeText={setEnd} style={field} />
        <PrimaryButton compact title="Apply" onPress={() => submit(Number(start) || 0, Number(end) || 0)} />
      </View>
    </ToolStrip>
  );
```

(`field` keeps `flex: 1`: it shares the row's WIDTH; the row's height is explicit.) Comment "The toast lives under this sheet's Modal, so the sheet closes first." → "The strip closes first; the toast shows where it was."

- [ ] **Step 4:** `npm run typecheck`; `npm test`.
- [ ] **Step 5: Commit** — `git add src/editor/components/EffectSheet.tsx src/editor/components/TrimSheet.tsx src/editor/__tests__/strips.r2.test.tsx`; `feat(editor): the Effects picker and Trim are strips`.

---

### Task 7: Cover stays a sheet (pinned), cleanup, docs and full checks

**Depends on:** Tasks 1–6.

**Files:** Modify `src/editor/__tests__/CoverSheet.test.tsx` (one new case), `src/editor/__tests__/EditorToolbar.test.tsx` and `EditorToolbar.layers.test.tsx` (comments / test titles only), `README.md`, `AGENTS.md`, `docs/superpowers/specs/2026-10-05-editing-ui-r2-tall-panels-design.md`; any file the sweep below names.

**Do not touch:** behaviour. `src/ui/Sheet.tsx` and `CoverSheet.tsx` are not edited. A failing test means a mistake here.

- [ ] **Step 1: Pin the Cover decision.** Append to `src/editor/__tests__/CoverSheet.test.tsx` (it already imports `render`, `screen`; reuse the file's own project set-up in `beforeEach`):

```tsx
test("Cover is still a modal sheet in round 2: a scrim, no inline panel", async () => {
  await render(<CoverSheet visible onClose={() => {}} />);
  expect(screen.getByRole("header", { name: "Cover" })).toBeTruthy();
  expect(screen.getByLabelText("Close sheet")).toBeTruthy();
  expect(screen.queryByTestId("tool-panel")).toBeNull();
  expect(screen.queryByTestId("tool-strip")).toBeNull();
});
```

- [ ] **Step 2: Sweep** with the Grep tool (not `sed`) over `src` and `app`, and fix what is found:
  - `panelFor`, `onPanelChange`, `closeText`, `textPanelFor`, `stickerPanelFor` — none may remain.
  - `<Sheet` must list exactly: `src/editor/components/CoverSheet.tsx`, `src/projects/ProjectActionsSheet.tsx`, `src/publish/components/PostOptionsSheet.tsx` (and `src/ui/__tests__/Sheet.test.tsx`). `import { Sheet }` in any other editor component is a leftover: remove it.
  - Comments in the ten converted files and in `EditorToolbar.tsx`, `jest.setup.ts`, `toolStrip.ts` that still say "sheet" for something that is now a panel or a strip, or "native Modal … cover the toast": corrected to what the code does.
  - Toolbar tests: titles and comments that say "opens the … sheet" for a converted tool → "panel" / "strip"; the `closeTool` helper stays (Cover is still modal) with its comment "a strip's or a panel's ✓, or the Cover sheet's scrim".
  - `KeyboardAvoidingView` appears only in `src/ui/Sheet.tsx` and `src/publish/components/PostScreenBody.tsx`.
- [ ] **Step 3: Docs.**
  - `README.md` "Editing tools": replace the last sentence of the **Strips** paragraph ("The bigger pickers … are still full sheets.") by: the Effects list and Trim are strips too; then a paragraph **Panels.** — Text, Stickers, the sticker editor, Add audio, Templates, Captions, Caption style and Beats open as a tall panel at the bottom: nothing dims, the timeline and the row of tools give it their place, the video stays above it (smaller for the big panels) and keeps playing, play / undo / redo stay usable; the round ✓ closes it, and so does selecting something else; when you type, the panel sits on the keyboard and the video stays in view — drag the panel's content down to put the keyboard away; while a voice-over is recorded the panel stays until the recording is stopped. Cover is still a pop-up sheet and Crop a full screen. In "Text and captions", "Audio" and "Polish": replace each "sheet" for a converted tool by "panel" (or "strip" for Trim and the Effects list).
  - `AGENTS.md` "This repo", after the Toolbar bullet: `- Panels: the big pickers are ToolPanels (src/ui/ToolPanel.tsx — inline, never a Modal; explicit heights from panelHeight; the body scrolls, strips never do). One tool is open at a time — strip or panel — in src/editor/toolStrip.ts (select first, open second; rekeyStrip after a tool changes the selection itself; nothing closes it while a voice-over is recorded). src/editor/components/EditorLayout.tsx hides the timeline by collapsing its slot (never unmount or resize the Timeline, never edit timelineScroll.ts for it); the preview resizes and PreviewPlayer must not remount its VideoView. The keyboard is src/ui/keyboard.ts (Keyboard events, explicit padding) — no KeyboardAvoidingView in the editor. Cover is the editor's only Sheet.`
  - Spec: Status → `Implemented 2026-10-05 (on-device checklist pending)`; add a section **3a. As built** after §3 with every deviation the tasks reported (changed heights, a test that had to change beyond §3.3, anything a panel could not keep, what was not checked by a test and is on the checklist).
- [ ] **Step 4: Full checks.** `npm run typecheck`; `npm test`; `npx.cmd expo-doctor`; `git status --short` shows nothing unexpected; `git diff --stat main` shows no change under `ios/`, `android/`, `modules/`, `src/editor/model/`, `src/editor/timelineScroll.ts`, `src/editor/components/Timeline.tsx`, `src/editor/components/PreviewPlayer.tsx`, `src/editor/useVoiceRecorder.ts`, `src/editor/useCaptions.ts`, `src/editor/store.ts`, `src/ui/Sheet.tsx`, `src/editor/components/CoverSheet.tsx`, `package.json`.
- [ ] **Step 5: Commit** — `git add` the files changed (explicit paths); `docs: editing UI round 2 — tall panels as built, README, AGENTS; Cover pinned as the last editor sheet`.

**Device checklist (user, Expo Go)** — start with `npx expo start --go --port 8090`, open the app on the iPhone, open a project with at least three clips, one text, one sticker and one song.

1. Tap an empty part of the video so nothing is selected. Tap **Audio**, then **Beats**. A panel opens at the bottom: **the screen does not go dark**, the timeline and the row of tools are gone, and the play / undo row is still there above the panel. The video is still showing (it may be a bit bigger).
2. Press **play** and tap **Tap** a few times in time with the video. Tap the round **✓**: the timeline is back **at the same place and the same zoom**, and the white marks are on it.
3. Slide the timeline to the middle of the video and pinch it wider. Tap **Templates**. The video gets **smaller but keeps its shape, stays centred and keeps playing** if it was playing — it must not go black or restart. Tap a template, then another: the look changes. Tap **✓**: the timeline is where you left it, same zoom.
4. Tap **Text**, then **Add text**. The panel opens and the keyboard comes up: the panel sits **just above the keyboard** and you can **still see the video** with your text on it. Type a few words: they appear on the video.
5. Drag the panel's content down a little: the keyboard goes away, **the panel stays open** and gets taller. Scroll it: font, size, colour, style. Drag the text on the video with your finger: it moves.
6. With the text panel open, tap **undo** in the row above it: the typing is undone. Type again, tap **✓**, then undo once: only the new typing goes.
7. Open the text panel again, delete all the letters: **Duplicate** greys out. Tap **✓**: the empty text is gone from the video. Add another text, empty it and leave the editor with the back arrow, then come back: no empty text is there.
8. Tap **Stickers**. Tap the search box and type "fire": the keyboard is up, the panel is above it, the video is visible. (With the keyboard up the list of recent emoji is not shown; it comes back when the keyboard is away.) Tap an emoji: the panel closes and the sticker is on the video, selected, with its own tools at the bottom.
9. With the sticker selected tap **Edit**: a shorter panel opens. Drag **Size**: the sticker changes on the video. Tap **Duplicate**: the panel stays open, now on the copy.
10. Tap **Audio**, **Add audio**. Play a sound in **Effects** while the video is playing: you hear both together (that is expected). Tap **Add**: the panel closes and the sound is on the timeline, selected.
11. **Add audio** again, **Record**, press the red button, say something for a few seconds. While it records tap a text on the video, the **9:16** pill and **Export**: the panel must stay (the pill does nothing; **Export** stops the recording and saves it but does not open the export screen). While it says "Saving..." the panel still stays and nothing else opens. Press stop if it is still recording: when it has saved, the panel closes and the voice-over is on the timeline, selected. Record again and leave with the back arrow: nothing is saved and the sound works normally when you come back.
12. Tap **Text**, **Captions**: a short panel that says captions need the full app. Tap **Style captions**: the style panel takes its place; the sample caption stays in view at the top while you scroll the controls; change a colour; tap **✓**: you are back on Captions; tap **✓** again.
13. Tap a clip, then **Trim**. A small strip opens with two number boxes. Tap a box: the keyboard comes up, the strip is right above it and the video is still visible (the timeline is hidden while the keyboard is up). Change the end number and tap **Apply**: the clip is shorter. Open **Trim** again, tap a box, then **undo** in the row above: the numbers change to match the clip.
14. With nothing selected tap **Effects**: a small strip with the effects in one row that slides sideways. Tap one: it is added and its tools show.
15. Open **Stickers**, then tap a text on the video: the panel closes by itself and the text's tools show. Open **Templates**, then tap **Export**: the export screen opens; come back — no panel is open.
16. **Cover** still opens as the old pop-up sheet (the screen dims) — that is expected. Panels have no slide-in animation; they just appear, and the video changes size in one jump.
17. On the smallest iPhone you have: in step 4, check that some of the video is still visible above the panel while typing.
