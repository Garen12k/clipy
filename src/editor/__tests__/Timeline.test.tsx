import { Dimensions, StyleSheet } from "react-native";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
jest.mock("@/src/projects/pickMedia", () => ({ pickMedia: jest.fn(async () => null) }));
import { addEffect, addTextOverlay, deleteOverlay } from "@/src/editor/model/ops";
import { makeAudioTrack, makeClip, makeEffect, makeLayer, makeOverlay, makePhotoClip, makeProject } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { pickMedia } from "@/src/projects/pickMedia";
import { Timeline } from "../components/Timeline";
import { useSnapGuide } from "../snapping";
import { CLIP_AREA_HEIGHT, LANE_GAP, LANE_HEIGHT, laneModel, stripWidth } from "../timelineLayout";

const p = makeProject({ clips: [makeClip({ id: "a", sourceDuration: 10 })] });
const LANE = LANE_HEIGHT + LANE_GAP;
const text = (id = "o1") => makeOverlay({ id, text: "Hi", start: 1, end: 3 });
const laneIds = () => screen.queryAllByTestId(/-lane$/).map((l) => l.props.testID);
beforeEach(() => { useEditorStore.getState().reset(); useEditorStore.getState().setProject(p); });

test("timeline content container stacks the clip row and lanes vertically", async () => {
  useEditorStore.getState().setProject({ ...p, overlays: [text()], audioTracks: [makeAudioTrack({ id: "m", sourceDuration: 5 })] });
  await render(<Timeline />);
  const scrollView = screen.getByTestId("timeline-scroll");
  expect(scrollView.props.contentContainerStyle).toMatchObject({ flexDirection: "column" });
  expect(screen.getByTestId("overlay-lane")).toBeTruthy();
  expect(screen.getByTestId("music-lane")).toBeTruthy();
});

test("the effects lane is the last lane and only adds height: paddings and width stand-ins are unchanged", async () => {
  const q = makeProject({ clips: [makeClip({ id: "a", sourceDuration: 10 })], overlays: [text()], audioTracks: [makeAudioTrack({ id: "m", sourceDuration: 5 })], effects: [makeEffect({ id: "e1", start: 2, end: 5 })] });
  useEditorStore.getState().setProject(q);
  await render(<Timeline />);
  const scroll = screen.getByTestId("timeline-scroll");
  expect(laneIds()).toEqual(["overlay-lane", "music-lane", "effect-lane"]);
  const height = laneModel(q).height;
  expect(height).toBe(CLIP_AREA_HEIGHT + 3 * LANE);
  // Exactly the same container style as before, with the taller height: no width, no extra padding.
  expect(scroll.props.contentContainerStyle).toEqual({ paddingHorizontal: Dimensions.get("window").width / 2, height, flexDirection: "column" });
  const lane = StyleSheet.flatten(screen.getByTestId("effect-lane").props.style);
  expect(lane).toEqual(StyleSheet.flatten(screen.getByTestId("overlay-lane").props.style));
  expect(lane).toEqual({ position: "relative", height: LANE_HEIGHT, marginTop: LANE_GAP });
  // The pill is out of the flow, so it cannot widen the scroll content.
  expect(StyleSheet.flatten(within(scroll).getByTestId("effect-pill-e1").props.style).position).toBe("absolute");
  // The scroll handlers are the same five, none added.
  expect(Object.keys(scroll.props).filter((k) => /^on.*Scroll|^onScroll/.test(k)).sort()).toEqual(["onMomentumScrollBegin", "onMomentumScrollEnd", "onScroll", "onScrollBeginDrag", "onScrollEndDrag"]);
});

const SCROLL_HANDLERS = ["onMomentumScrollBegin", "onMomentumScrollEnd", "onScroll", "onScrollBeginDrag", "onScrollEndDrag"];
const scrollHandlers = (scroll: { props: object }) => Object.keys(scroll.props).filter((k) => /^on.*Scroll|^onScroll/.test(k)).sort();

test("three audio kinds give three audio lanes between the overlay and effects lanes; only heights change", async () => {
  const kinds = ["sfx", "voice", "music", "music"] as const;
  const q = makeProject({ clips: [makeClip({ id: "a", sourceDuration: 10 })], overlays: [text()], effects: [makeEffect({ id: "e1", start: 2, end: 5 })], beatMarkers: [1, 2],
    audioTracks: kinds.map((kind, i) => makeAudioTrack({ id: `t${i}`, kind, sourceDuration: 5, start: i })) });
  useEditorStore.getState().setProject(q);
  await render(<Timeline />);
  const scroll = screen.getByTestId("timeline-scroll");
  expect(laneIds()).toEqual(["overlay-lane", "music-lane", "voice-lane", "sfx-lane", "effect-lane"]);
  const height = laneModel(q).height;
  expect(height).toBe(CLIP_AREA_HEIGHT + 5 * LANE);
  // The same container style as with one lane apart from the height: no width, no extra padding.
  expect(scroll.props.contentContainerStyle).toEqual({ paddingHorizontal: Dimensions.get("window").width / 2, height, flexDirection: "column" });
  for (const id of ["music-lane", "voice-lane", "sfx-lane"])
    expect(StyleSheet.flatten(screen.getByTestId(id).props.style)).toEqual({ position: "relative", height: LANE_HEIGHT, marginTop: LANE_GAP });
  // Bars and ticks are out of the flow, so they cannot widen the scroll content.
  const bars = within(scroll).getAllByTestId(/^audio-bar-t\d$/);
  expect(bars).toHaveLength(4);
  for (const bar of bars) expect(StyleSheet.flatten(bar.props.style).position).toBe("absolute");
  expect(StyleSheet.flatten(within(scroll).getByTestId("beat-ticks").props.style).position).toBe("absolute");
  expect(within(scroll).getAllByTestId("beat-tick")).toHaveLength(2);
  expect(scrollHandlers(scroll)).toEqual(SCROLL_HANDLERS);
  expect(screen.getByTestId("timeline-root")).toHaveStyle({ height });
  expect(screen.getByTestId("timeline-playhead")).toHaveStyle({ height: height - 16, top: 8, left: Dimensions.get("window").width / 2 - 1 });
});

test("a project with clips only has no lanes at all: the timeline is as high as the clip area", async () => {
  await render(<Timeline />);
  const scroll = screen.getByTestId("timeline-scroll");
  expect(laneIds()).toEqual([]);
  expect(screen.queryAllByTestId(/^audio-bar-/)).toHaveLength(0);
  expect(laneModel(p).height).toBe(CLIP_AREA_HEIGHT);
  expect(scroll.props.contentContainerStyle).toEqual({ paddingHorizontal: Dimensions.get("window").width / 2, height: CLIP_AREA_HEIGHT, flexDirection: "column" });
  expect(screen.getByTestId("timeline-root")).toHaveStyle({ height: CLIP_AREA_HEIGHT });
  expect(screen.getByTestId("timeline-playhead")).toHaveStyle({ height: CLIP_AREA_HEIGHT - 16 });
  expect(scrollHandlers(scroll)).toEqual(SCROLL_HANDLERS);
});

test("an empty project (no clips) has no lanes either", async () => {
  useEditorStore.getState().setProject(makeProject());
  await render(<Timeline />);
  expect(laneIds()).toEqual([]);
  expect(screen.getByTestId("timeline-root")).toHaveStyle({ height: CLIP_AREA_HEIGHT });
  expect(screen.getByTestId("timeline-scroll").props.contentContainerStyle).toEqual({ paddingHorizontal: Dimensions.get("window").width / 2, height: CLIP_AREA_HEIGHT, flexDirection: "column" });
});

test("a project with only a voice track shows just the voice lane, at the one-lane height", async () => {
  useEditorStore.getState().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 10 })], audioTracks: [makeAudioTrack({ id: "v", kind: "voice", sourceDuration: 5 })] }));
  await render(<Timeline />);
  expect(laneIds()).toEqual(["voice-lane"]);
  expect(screen.getByTestId("timeline-root")).toHaveStyle({ height: CLIP_AREA_HEIGHT + LANE });
});

test("a lane appears with its first item and goes with its last — through undo and redo too — and the scroll view is the same instance throughout", async () => {
  await render(<Timeline />);
  const scroll = screen.getByTestId("timeline-scroll");
  const root = screen.getByTestId("timeline-root");
  const strip = screen.getByRole("button", { name: "Clip a" });
  const same = () => {
    expect(screen.getByTestId("timeline-scroll")).toBe(scroll);
    expect(screen.getByTestId("timeline-root")).toBe(root);
    expect(screen.getByRole("button", { name: "Clip a" })).toBe(strip);
    expect(scrollHandlers(screen.getByTestId("timeline-scroll"))).toEqual(SCROLL_HANDLERS);
  };
  const shows = (lanes: string[]) => {
    expect(laneIds()).toEqual(lanes);
    const height = CLIP_AREA_HEIGHT + lanes.length * LANE;
    expect(laneModel(useEditorStore.getState().project).height).toBe(height);
    expect(screen.getByTestId("timeline-root")).toHaveStyle({ height });
    expect(screen.getByTestId("timeline-scroll").props.contentContainerStyle).toEqual({ paddingHorizontal: Dimensions.get("window").width / 2, height, flexDirection: "column" });
    expect(screen.getByTestId("timeline-playhead")).toHaveStyle({ height: height - 16 });
    same();
  };
  const st = () => useEditorStore.getState();
  shows([]);
  await act(() => { st().apply((q) => addTextOverlay(q, text())); });
  shows(["overlay-lane"]);
  const overlayLane = screen.getByTestId("overlay-lane");
  await act(() => { st().apply((q) => addEffect(q, "shake", 1, "e1")); });
  shows(["overlay-lane", "effect-lane"]);
  // A lane that appears above or below another leaves that one mounted (a bar being dragged in it keeps its gesture).
  expect(screen.getByTestId("overlay-lane")).toBe(overlayLane);
  const effectLane = screen.getByTestId("effect-lane");
  await act(() => { st().apply((q) => deleteOverlay(q, "o1")); });
  shows(["effect-lane"]);
  expect(screen.getByTestId("effect-lane")).toBe(effectLane);
  await act(() => { st().undo(); });
  shows(["overlay-lane", "effect-lane"]);
  expect(screen.getByTestId("effect-lane")).toBe(effectLane);
  expect(screen.getByTestId("overlay-pill-o1")).toBeTruthy();
  await act(() => { st().undo(); st().undo(); });
  shows([]);
  await act(() => { st().redo(); });
  shows(["overlay-lane"]);
  await act(() => { st().redo(); st().redo(); });
  shows(["effect-lane"]);
});

test("a project with layers gets a layers lane right under the clips; only heights change", async () => {
  useEditorStore.getState().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 10 })],
    layers: [makeLayer({ id: "l1", sourceDuration: 4, start: 1 }), { ...makePhotoClip({ id: "l2" }), start: 30 }] }));   // l2 lies past the project's end
  await render(<Timeline />);
  const scroll = screen.getByTestId("timeline-scroll");
  expect(laneIds()).toEqual(["layer-lane"]);
  const height = laneModel(useEditorStore.getState().project).height;
  expect(height).toBe(CLIP_AREA_HEIGHT + LANE);
  // The same container style as without layers apart from the height: no width, no extra padding.
  expect(scroll.props.contentContainerStyle).toEqual({ paddingHorizontal: Dimensions.get("window").width / 2, height, flexDirection: "column" });
  expect(StyleSheet.flatten(screen.getByTestId("layer-lane").props.style)).toEqual({ position: "relative", height: LANE_HEIGHT, marginTop: LANE_GAP });
  // Bars are out of the flow, so they cannot widen the scroll content — not even one past the last clip.
  const bars = within(scroll).getAllByTestId(/^layer-bar-l\d$/);
  expect(bars).toHaveLength(2);
  for (const bar of bars) expect(StyleSheet.flatten(bar.props.style).position).toBe("absolute");
  expect(scrollHandlers(scroll)).toEqual(SCROLL_HANDLERS);
  expect(screen.getByTestId("timeline-root")).toHaveStyle({ height });
  expect(screen.getByTestId("timeline-playhead")).toHaveStyle({ height: height - 16, top: 8, left: Dimensions.get("window").width / 2 - 1 });
});

test("the layers lane goes away with the last layer, and stacks with the audio lanes", async () => {
  const withLayer = makeProject({ clips: [makeClip({ id: "a", sourceDuration: 10 })], layers: [makeLayer({ id: "l1", sourceDuration: 4 })],
    audioTracks: [makeAudioTrack({ id: "m", sourceDuration: 5 }), makeAudioTrack({ id: "v", kind: "voice", sourceDuration: 5 })] });
  useEditorStore.getState().setProject(withLayer);
  await render(<Timeline />);
  expect(laneIds()).toEqual(["layer-lane", "music-lane", "voice-lane"]);
  expect(screen.getByTestId("timeline-root")).toHaveStyle({ height: laneModel(withLayer).height });
  expect(laneModel(withLayer).height).toBe(CLIP_AREA_HEIGHT + 3 * LANE);
  await act(() => { useEditorStore.getState().setProject({ ...withLayer, layers: [] }); });
  expect(screen.queryByTestId("layer-lane")).toBeNull();
  expect(laneIds()).toEqual(["music-lane", "voice-lane"]);
  expect(screen.getByTestId("timeline-root")).toHaveStyle({ height: CLIP_AREA_HEIGHT + 2 * LANE });
  expect(screen.getByTestId("timeline-scroll").props.contentContainerStyle).toEqual({ paddingHorizontal: Dimensions.get("window").width / 2, height: CLIP_AREA_HEIGHT + 2 * LANE, flexDirection: "column" });
});

// Jest has no layout, so this pins the stand-ins for the content width: the tile is absolutely positioned and the paddings are untouched.
test("the + tile sits after the last clip, out of the flow, so the scrubbable width is unchanged", async () => {
  const q = makeProject({ clips: [makeClip({ id: "a", sourceDuration: 3 }), makePhotoClip({ id: "b", seconds: 2 })] });
  useEditorStore.getState().setProject(q);
  await render(<Timeline />);
  const scroll = screen.getByTestId("timeline-scroll");
  // The paddings that centre the playhead are untouched.
  expect(scroll.props.contentContainerStyle).toMatchObject({ paddingHorizontal: Dimensions.get("window").width / 2 });
  const tile = within(scroll).getByTestId("add-clips-tile");
  const style = StyleSheet.flatten(tile.props.style);
  const pps = useEditorStore.getState().pixelsPerSecond;
  const clipsEnd = q.clips.reduce((s, c) => s + stripWidth(c, pps), 0);
  expect(style.position).toBe("absolute");
  expect(style.left).toBeGreaterThanOrEqual(clipsEnd);
  expect(style.left + style.width).toBeLessThanOrEqual(clipsEnd + Dimensions.get("window").width / 2);
  expect(style.width).toBe(64);
  expect(style.height).toBe(64);
});

test("tapping the + tile opens the picker without scrubbing or pausing", async () => {
  await render(<Timeline />);
  await act(() => { useEditorStore.getState().seek(2); useEditorStore.getState().setPlaying(true); });
  await fireEvent.press(screen.getByRole("button", { name: "Add clips" }));
  await waitFor(() => expect(pickMedia).toHaveBeenCalled());
  await waitFor(() => expect(screen.queryByTestId("add-clips-busy")).toBeNull());
  expect(useEditorStore.getState().playhead).toBe(2);
  expect(useEditorStore.getState().isPlaying).toBe(true);
});

test("the snap guide is drawn inside the scroll content, out of the flow: width, paddings and scroll handlers are as before", async () => {
  useSnapGuide.setState({ time: null });
  const q = { ...p, overlays: [text()], audioTracks: [makeAudioTrack({ id: "m", sourceDuration: 5 })] };
  useEditorStore.getState().setProject(q);
  const height = laneModel(q).height;
  expect(height).toBe(CLIP_AREA_HEIGHT + 2 * LANE);
  await render(<Timeline />);
  const scroll = screen.getByTestId("timeline-scroll");
  const before = { style: scroll.props.contentContainerStyle, handlers: scrollHandlers(scroll) };
  expect(screen.queryByTestId("snap-guide")).toBeNull();
  await act(() => { useSnapGuide.setState({ time: 4 }); });
  const pad = Dimensions.get("window").width / 2, pps = useEditorStore.getState().pixelsPerSecond;
  const line = within(screen.getByTestId("timeline-scroll")).getByTestId("snap-guide");
  expect(StyleSheet.flatten(line.props.style)).toMatchObject({ position: "absolute", left: pad + 4 * pps - 0.5, top: 0, width: 1, height });
  expect(line.props.pointerEvents).toBe("none");
  expect(screen.getByTestId("timeline-scroll").props.contentContainerStyle).toEqual(before.style);
  expect(before.style).toEqual({ paddingHorizontal: pad, height, flexDirection: "column" });
  expect(scrollHandlers(screen.getByTestId("timeline-scroll"))).toEqual(SCROLL_HANDLERS);
  expect(before.handlers).toEqual(SCROLL_HANDLERS);
  // The guide always spans the whole timeline as it is now: a lane going away while it shows shortens it with the timeline.
  await act(() => { useEditorStore.getState().setProject({ ...q, audioTracks: [] }); useSnapGuide.setState({ time: 4 }); });
  expect(StyleSheet.flatten(screen.getByTestId("snap-guide").props.style)).toMatchObject({ top: 0, height: CLIP_AREA_HEIGHT + LANE });
  await act(() => { useEditorStore.getState().setProject(p); useSnapGuide.setState({ time: 4 }); });
  expect(StyleSheet.flatten(screen.getByTestId("snap-guide").props.style)).toMatchObject({ top: 0, height: CLIP_AREA_HEIGHT });
  await act(() => { useSnapGuide.setState({ time: null }); });
  expect(screen.queryByTestId("snap-guide")).toBeNull();
});

describe("multi-select", () => {
  const two = makeProject({ clips: [makeClip({ id: "a", sourceDuration: 4 }), makeClip({ id: "b", sourceDuration: 4 })] });
  const strip = (id: string) => screen.getByRole("button", { name: `Clip ${id}` });
  beforeEach(() => { useEditorStore.getState().setProject(two); });

  test("in the mode a tap toggles the clip: no seek, no single selection, both strips show as selected", async () => {
    await render(<Timeline />);
    await act(() => { useEditorStore.getState().seek(1); useEditorStore.getState().enterMultiSelect(); });
    await fireEvent.press(strip("a"));
    await fireEvent.press(strip("b"));
    expect(useEditorStore.getState()).toMatchObject({ multiSelect: ["a", "b"], selectedClipId: null, playhead: 1 });
    expect(strip("a")).toBeSelected();
    expect(strip("b")).toBeSelected();
    await fireEvent.press(strip("a"));
    expect(useEditorStore.getState()).toMatchObject({ multiSelect: ["b"], selectedClipId: null, playhead: 1 });
    expect(strip("a")).not.toBeSelected();
    expect(strip("b")).toBeSelected();
    expect(scrollHandlers(screen.getByTestId("timeline-scroll"))).toEqual(SCROLL_HANDLERS);
  });

  test("outside the mode a tap selects the clip and seeks to its start, as before", async () => {
    await render(<Timeline />);
    await fireEvent.press(strip("b"));
    expect(useEditorStore.getState()).toMatchObject({ multiSelect: null, selectedClipId: "b", playhead: 4 });
    expect(strip("b")).toBeSelected();
    expect(strip("a")).not.toBeSelected();
  });
});
