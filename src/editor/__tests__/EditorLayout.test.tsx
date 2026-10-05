import { act, fireEvent, render, screen } from "@testing-library/react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-05T10:00:00.000Z" }));
jest.mock("@/src/projects/pickMedia", () => ({ pickMedia: jest.fn(async () => null) }));
jest.mock("@/src/projects", () => ({ storage: { importMedia: jest.fn(), saveStill: jest.fn() } }));
jest.mock("expo-video-thumbnails", () => ({ getThumbnailAsync: jest.fn(async () => ({ uri: "file:///thumb.jpg" })) }));
jest.mock("@/src/projects/prefs", () => ({ prefs: { getRecentEmoji: jest.fn(async () => []), pushRecentEmoji: jest.fn(async () => {}) } }));
import { useEffect } from "react";
import { Dimensions, View } from "react-native";
import { addEffect, addTextOverlay } from "@/src/editor/model/ops";
import { makeAudioTrack, makeClip, makeOverlay, makeProject } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { useKeyboard } from "@/src/ui/keyboard";
import { panelHeight } from "@/src/ui/ToolPanel";
import { BAR_HEIGHT, STRIP } from "@/src/ui/ToolStrip";
import { EditorLayout } from "../components/EditorLayout";
import { EditorToolbar } from "../components/EditorToolbar";
import { MULTI_BAR_HEIGHT } from "../components/MultiSelectBar";
import { Timeline } from "../components/Timeline";
import { TransportRow } from "../components/TransportRow";
import { CLIP_AREA_HEIGHT, LANE_GAP, LANE_HEIGHT, laneModel } from "../timelineLayout";
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

const LANE = LANE_HEIGHT + LANE_GAP;
/** Two clips, a text and a sound: two lanes under the clips — what a strip (two lanes higher than the bar) rises over. */
const TWO_LANES = makeProject({ clips: [makeClip({ id: "a", sourceDuration: 4 }), makeClip({ id: "b", sourceDuration: 4 })],
  overlays: [makeOverlay({ id: "o1", text: "Hi", start: 0, end: 2 })], audioTracks: [makeAudioTrack({ id: "m", sourceDuration: 5 })] });
const CLIPS_ONLY = { ...TWO_LANES, overlays: [], audioTracks: [] };
const TIMELINE_HEIGHT = laneModel(TWO_LANES).height;

beforeEach(() => {
  mounts = 0;
  useKeyboard.setState({ height: 0 });
  closeStrip();
  st().reset();
  st().setProject(TWO_LANES);
});

test("the two set-ups: two lanes are exactly a strip's rise; clips only have none", () => {
  expect(TIMELINE_HEIGHT).toBe(CLIP_AREA_HEIGHT + STRIP.lift);
  expect(laneModel(CLIPS_ONLY).height).toBe(CLIP_AREA_HEIGHT);
});

describe("a strip only ever covers lanes", () => {
  test("clips only: nothing to rise over — the bottom area is a strip high, not lifted, so the preview's slot gives the height; nothing remounts", async () => {
    st().setProject(CLIPS_ONLY);
    await render(ui());
    const probe = screen.getByTestId("probe"), slot = screen.getByTestId("slot-preview"), scroll = screen.getByTestId("timeline-scroll");
    expect(screen.getByTestId("timeline-root")).toHaveStyle({ height: CLIP_AREA_HEIGHT });
    await act(() => { st().select("a"); });
    await fireEvent.press(btn("Opacity"));
    expect(screen.getByTestId("tool-strip")).toBeTruthy();
    expect(screen.getByTestId("editor-toolbar")).toHaveStyle({ height: STRIP.height + 8, marginTop: 0 });
    expect(screen.getByTestId("timeline-root")).toHaveStyle({ height: CLIP_AREA_HEIGHT });
    expect(screen.getByTestId("slot-timeline")).not.toHaveStyle({ height: 0 });
    expect(screen.getByTestId("slot-preview")).toBe(slot);
    expect(slot).toHaveStyle({ flex: 1 });
    expect(screen.getByTestId("timeline-scroll")).toBe(scroll);
    await fireEvent.press(btn("Done"));
    expect(screen.getByTestId("editor-toolbar")).toHaveStyle({ height: BAR_HEIGHT + 8, marginTop: 0 });
    expect(screen.getByTestId("probe")).toBe(probe);
    expect(mounts).toBe(1);
  });

  test("the lift follows the lanes while the strip is open: one lane, then two, then back (undo) — capped at the strip's rise", async () => {
    st().setProject(CLIPS_ONLY);
    await render(ui());
    const probe = screen.getByTestId("probe"), scroll = screen.getByTestId("timeline-scroll");
    await fireEvent.press(btn("Ratio"));          // a strip that belongs to no item: it stays open through the edits below
    expect(screen.getByTestId("tool-strip")).toBeTruthy();
    expect(screen.getByTestId("editor-toolbar")).toHaveStyle({ height: STRIP.height + 8, marginTop: 0 });
    await act(() => { st().apply((p) => addEffect(p, "shake", 1, "e1")); });
    expect(screen.getByTestId("timeline-root")).toHaveStyle({ height: CLIP_AREA_HEIGHT + LANE });
    expect(screen.getByTestId("editor-toolbar")).toHaveStyle({ height: STRIP.height + 8, marginTop: -LANE });
    await act(() => { st().apply((p) => addTextOverlay(p, makeOverlay({ id: "o9", text: "Hi", start: 0, end: 2 }))); });
    expect(screen.getByTestId("timeline-root")).toHaveStyle({ height: CLIP_AREA_HEIGHT + 2 * LANE });
    expect(screen.getByTestId("editor-toolbar")).toHaveStyle({ height: STRIP.height + 8, marginTop: -STRIP.lift });
    await act(() => { st().undo(); });
    expect(screen.getByTestId("editor-toolbar")).toHaveStyle({ height: STRIP.height + 8, marginTop: -LANE });
    await act(() => { st().undo(); });
    expect(screen.getByTestId("editor-toolbar")).toHaveStyle({ height: STRIP.height + 8, marginTop: 0 });
    await act(() => { st().redo(); st().redo(); });
    expect(screen.getByTestId("editor-toolbar")).toHaveStyle({ height: STRIP.height + 8, marginTop: -STRIP.lift });
    expect(screen.getByTestId("timeline-scroll")).toBe(scroll);
    expect(screen.getByTestId("probe")).toBe(probe);
    expect(mounts).toBe(1);
  });

  test("more than two lanes: the lift stays the strip's rise", async () => {
    st().setProject({ ...TWO_LANES, audioTracks: [...TWO_LANES.audioTracks, makeAudioTrack({ id: "v", kind: "voice", sourceDuration: 5 })] });
    await render(ui());
    await act(() => { st().select("a"); });
    await fireEvent.press(btn("Opacity"));
    expect(screen.getByTestId("timeline-root")).toHaveStyle({ height: CLIP_AREA_HEIGHT + 3 * LANE });
    expect(screen.getByTestId("editor-toolbar")).toHaveStyle({ height: STRIP.height + 8, marginTop: -STRIP.lift });
  });

  test("clips only, with the keyboard (Trim): the strip sits on the keyboard, unlifted, the timeline's slot is collapsed — as with lanes", async () => {
    st().setProject(CLIPS_ONLY);
    await render(ui());
    const probe = screen.getByTestId("probe"), scroll = screen.getByTestId("timeline-scroll");
    await act(() => { st().select("a"); });
    await fireEvent.press(btn("Trim"));
    expect(screen.getByTestId("editor-toolbar")).toHaveStyle({ height: STRIP.height + 8, marginTop: 0 });
    await act(() => { useKeyboard.setState({ height: 260 }); });
    expect(screen.getByTestId("editor-toolbar")).toHaveStyle({ height: STRIP.height + 260, paddingBottom: 260, marginTop: 0 });
    expect(screen.getByTestId("slot-timeline", hidden)).toHaveStyle({ height: 0, overflow: "hidden" });
    expect(screen.getByTestId("timeline-root", hidden)).toHaveStyle({ height: CLIP_AREA_HEIGHT });
    await act(() => { useKeyboard.setState({ height: 0 }); });
    expect(screen.getByTestId("editor-toolbar")).toHaveStyle({ height: STRIP.height + 8, marginTop: 0 });
    expect(screen.getByTestId("timeline-scroll")).toBe(scroll);
    expect(screen.getByTestId("probe")).toBe(probe);
    expect(mounts).toBe(1);
  });

  test("a panel is unaffected by the lanes: clips only, the timeline's slot collapses and the timeline keeps its own height", async () => {
    st().setProject(CLIPS_ONLY);
    await render(ui());
    const scroll = screen.getByTestId("timeline-scroll");
    await fireEvent.press(btn("Stickers"));
    expect(screen.getByTestId("editor-toolbar")).toHaveStyle({ height: panelHeight("regular", H) + 8, marginTop: 0 });
    expect(screen.getByTestId("slot-timeline", hidden)).toHaveStyle({ height: 0, overflow: "hidden" });
    expect(screen.getByTestId("timeline-root", hidden)).toHaveStyle({ height: CLIP_AREA_HEIGHT });
    expect(screen.getByTestId("timeline-scroll", hidden)).toBe(scroll);
  });

  test("the multi-select bar's rise is capped by the lanes too: none with clips only, one lane's worth with one lane, its own rise with two", async () => {
    st().setProject(CLIPS_ONLY);
    await render(ui());
    const probe = screen.getByTestId("probe");
    await act(() => { st().select("a"); st().enterMultiSelect(); });
    await fireEvent.press(btn("Filter"));
    expect(screen.getByTestId("tool-strip")).toBeTruthy();
    expect(screen.getByTestId("multi-select-bar")).toHaveStyle({ height: STRIP.height + 8, marginTop: 0 });
    await act(() => { st().apply((p) => addEffect(p, "shake", 1, "e1")); });
    expect(screen.getByTestId("multi-select-bar")).toHaveStyle({ height: STRIP.height + 8, marginTop: -LANE });
    await act(() => { st().apply((p) => addTextOverlay(p, makeOverlay({ id: "o9", text: "Hi", start: 0, end: 2 }))); });
    expect(screen.getByTestId("multi-select-bar")).toHaveStyle({ height: STRIP.height + 8, marginTop: -(STRIP.height - MULTI_BAR_HEIGHT) });
    expect(screen.getByTestId("probe")).toBe(probe);
    expect(mounts).toBe(1);
  });
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

test("a strip does not hide the timeline: it lifts over it as in round 1 — and the preview does not remount through it, nor through multi-select", async () => {
  await render(ui());
  const probe = screen.getByTestId("probe");
  const slot = screen.getByTestId("slot-preview");
  await act(() => { st().select("a"); });
  await fireEvent.press(btn("Opacity"));
  expect(screen.getByTestId("tool-strip")).toBeTruthy();
  expect(screen.getByTestId("timeline-root")).toBeTruthy();
  expect(screen.getByTestId("slot-timeline")).not.toHaveStyle({ height: 0 });
  expect(screen.getByTestId("editor-toolbar")).toHaveStyle({ height: STRIP.height + 8, marginTop: -STRIP.lift });
  expect(screen.getByTestId("probe")).toBe(probe);
  await fireEvent.press(btn("Done"));
  expect(screen.queryByTestId("tool-strip")).toBeNull();
  expect(screen.getByTestId("editor-toolbar")).toHaveStyle({ height: BAR_HEIGHT + 8, marginTop: 0 });
  expect(screen.getByTestId("probe")).toBe(probe);
  // The multi-select bar takes the toolbar's place: the preview's slot is still the same view.
  await act(() => { st().enterMultiSelect(); });
  expect(screen.getByTestId("multi-select-bar")).toBeTruthy();
  expect(screen.getByTestId("probe")).toBe(probe);
  await act(() => { st().exitMultiSelect(); });
  expect(screen.getByTestId("probe")).toBe(probe);
  expect(screen.getByTestId("slot-preview")).toBe(slot);
  expect(mounts).toBe(1);
});

test("a panel closes when the selection changes, and the timeline is back", async () => {
  await render(ui());
  await fireEvent.press(btn("Audio"));
  await fireEvent.press(btn("Beats"));
  await act(() => { st().select("a"); });
  expect(screen.queryByTestId("tool-panel")).toBeNull();
  expect(screen.getByTestId("timeline-root")).toBeTruthy();
});

test("the keyboard alone moves nothing: it only counts while a tool shows", async () => {
  await render(ui());
  await act(() => { useKeyboard.setState({ height: 336 }); });
  expect(screen.getByTestId("editor-toolbar")).toHaveStyle({ height: BAR_HEIGHT + 8, paddingBottom: 8, marginTop: 0 });
  expect(screen.getByTestId("slot-timeline")).not.toHaveStyle({ height: 0 });
});

test("a panel with the keyboard: typing height, padded by the keyboard, so the panel sits on it and the preview gets the rest — without remounting", async () => {
  await render(ui());
  const probe = screen.getByTestId("probe");
  const slot = screen.getByTestId("slot-preview");
  await fireEvent.press(btn("Stickers"));
  expect(screen.getByTestId("editor-toolbar")).toHaveStyle({ height: panelHeight("regular", H) + 8, paddingBottom: 8 });
  await act(() => { useKeyboard.setState({ height: 336 }); });
  expect(screen.getByTestId("editor-toolbar")).toHaveStyle({ height: panelHeight("regular", H, true) + 336, paddingBottom: 336, marginTop: 0 });
  expect(screen.getByTestId("tool-panel")).toHaveStyle({ height: panelHeight("regular", H, true) - 1 });
  expect(btn("Play")).toBeTruthy();
  expect(screen.getByTestId("probe")).toBe(probe);
  await act(() => { useKeyboard.setState({ height: 382 }); });          // another keyboard: the padding follows it
  expect(screen.getByTestId("editor-toolbar")).toHaveStyle({ height: panelHeight("regular", H, true) + 382, paddingBottom: 382 });
  await act(() => { useKeyboard.setState({ height: 0 }); });            // the keyboard was dismissed: the panel stays, at its size
  expect(screen.getByRole("header", { name: "Sticker" })).toBeTruthy();
  expect(screen.getByTestId("editor-toolbar")).toHaveStyle({ height: panelHeight("regular", H) + 8, paddingBottom: 8 });
  expect(screen.getByTestId("probe")).toBe(probe);
  expect(screen.getByTestId("slot-preview")).toBe(slot);
  expect(slot).toHaveStyle({ flex: 1 });
  expect(mounts).toBe(1);
});

test("a strip with the keyboard sits on the keyboard, is not lifted, and the timeline gives its place — still mounted, and the preview too", async () => {
  await render(ui());
  const probe = screen.getByTestId("probe");
  const scroll = screen.getByTestId("timeline-scroll");
  await act(() => { st().select("a"); });
  await fireEvent.press(btn("Opacity"));
  await act(() => { useKeyboard.setState({ height: 260 }); });
  expect(screen.getByTestId("editor-toolbar")).toHaveStyle({ height: STRIP.height + 260, paddingBottom: 260, marginTop: 0 });
  expect(screen.getByTestId("slot-timeline", hidden)).toHaveStyle({ height: 0, overflow: "hidden" });
  expect(screen.getByTestId("timeline-scroll", hidden)).toBe(scroll);
  expect(screen.getByTestId("probe")).toBe(probe);
  await act(() => { useKeyboard.setState({ height: 0 }); });
  expect(screen.getByTestId("editor-toolbar")).toHaveStyle({ height: STRIP.height + 8, marginTop: -STRIP.lift });
  expect(screen.getByTestId("slot-timeline")).not.toHaveStyle({ height: 0 });
  expect(screen.getByTestId("timeline-scroll")).toBe(scroll);
  expect(screen.getByTestId("probe")).toBe(probe);
  expect(mounts).toBe(1);
});

test("a keyboard that is not the tool's (the rename prompt) while a multi-select strip shows: the timeline stays, under the lifted bar", async () => {
  await render(ui());
  await act(() => { st().select("a"); st().enterMultiSelect(); });
  await fireEvent.press(btn("Filter"));
  expect(screen.getByTestId("tool-strip")).toBeTruthy();
  const lifted = { height: STRIP.height + 8, marginTop: -(STRIP.height - MULTI_BAR_HEIGHT) };
  expect(screen.getByTestId("multi-select-bar")).toHaveStyle(lifted);
  await act(() => { useKeyboard.setState({ height: 336 }); });
  expect(screen.getByTestId("multi-select-bar")).toHaveStyle(lifted);
  expect(screen.getByTestId("slot-timeline")).not.toHaveStyle({ height: 0 });
  expect(screen.getByTestId("slot-timeline").props.pointerEvents).toBe("auto");
  expect(screen.getByTestId("timeline-root")).toBeTruthy();
});

test("a keyboard lower than the safe area (a hardware keyboard's bar) never shrinks the bottom padding under a tool", async () => {
  await render(ui());
  await fireEvent.press(btn("Stickers"));
  await act(() => { useKeyboard.setState({ height: 5 }); });
  expect(screen.getByTestId("editor-toolbar")).toHaveStyle({ height: panelHeight("regular", H, true) + 8, paddingBottom: 8 });
  await act(() => { useKeyboard.setState({ height: 0 }); closeStrip(); st().select("a"); });
  await fireEvent.press(btn("Opacity"));
  await act(() => { useKeyboard.setState({ height: 5 }); });
  expect(screen.getByTestId("editor-toolbar")).toHaveStyle({ height: STRIP.height + 8, paddingBottom: 8, marginTop: 0 });
});

test("leaving the editor with the keyboard up leaves no height behind for the next visit", async () => {
  const view = await render(ui());
  await act(() => { useKeyboard.setState({ height: 336 }); });
  await view.unmount();
  expect(useKeyboard.getState().height).toBe(0);
});
