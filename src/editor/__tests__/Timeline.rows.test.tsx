import { Dimensions, ScrollView, StyleSheet } from "react-native";
import { act, fireEvent, render, screen, within } from "@testing-library/react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
jest.mock("@/src/projects/pickMedia", () => ({ pickMedia: jest.fn(async () => null) }));
import { moveOverlay } from "@/src/editor/model/ops";
import { makeAudioTrack, makeClip, makeEffect, makeLayer, makeOverlay, makeProject, type Project } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { useRowsScroll } from "../components/RowsThumb";
import { Timeline } from "../components/Timeline";
import { CLIP_AREA_HEIGHT, LANE_GAP, LANE_HEIGHT, laneModel, rowsThumb } from "../timelineLayout";

const LANE = LANE_HEIGHT + LANE_GAP;
const st = () => useEditorStore.getState();
const layersOf = (n: number, from = 0) => Array.from({ length: n }, (_, i) => makeLayer({ id: `l${from + i}`, sourceDuration: 4, start: 0 }));
const base = makeProject({ clips: [makeClip({ id: "a", sourceDuration: 10 })] });
const twelve: Project = { ...base, layers: layersOf(12) };
const flat = (id: string) => StyleSheet.flatten(screen.getByTestId(id).props.style);
/** Every vertical jump the timeline asked its rows for. */
const jumps = () => scrollTo.mock.calls.map(([arg]) => arg as { x?: number; y?: number; animated?: boolean }).filter((a) => a.y !== undefined);

const window = Dimensions.get("window");
let scrollTo: jest.SpyInstance;
beforeEach(() => {
  Dimensions.set({ window: { ...window, width: 375, height: 667 } });   // the smallest iPhone: two and a half rows show
  scrollTo = jest.spyOn(ScrollView.prototype, "scrollTo").mockImplementation(() => {});
  st().reset();
  useRowsScroll.setState({ y: 0 });
});
afterEach(() => { scrollTo.mockRestore(); Dimensions.set({ window }); });

test("rows that fit: the timeline is as high as before, the rows view is as high as they are and cannot scroll, no thumb", async () => {
  st().setProject({ ...base, layers: layersOf(2) });
  await render(<Timeline />);
  expect(screen.getByTestId("timeline-root")).toHaveStyle({ height: CLIP_AREA_HEIGHT + 2 * LANE });
  expect(screen.getByTestId("timeline-scroll").props.contentContainerStyle).toEqual({ paddingHorizontal: 375 / 2, height: CLIP_AREA_HEIGHT + 2 * LANE, flexDirection: "column" });
  const rows = screen.getByTestId("timeline-rows");
  expect(rows.props.scrollEnabled).toBe(false);
  expect(flat("timeline-rows")).toMatchObject({ height: 2 * LANE });
  expect(screen.queryByTestId("timeline-rows-thumb")).toBeNull();
  expect(jumps()).toEqual([]);
});

test("no rows at all: the rows view is still there (never mounted later), with no height", async () => {
  st().setProject(base);
  await render(<Timeline />);
  expect(screen.getByTestId("timeline-root")).toHaveStyle({ height: CLIP_AREA_HEIGHT });
  expect(flat("timeline-rows")).toMatchObject({ height: 0 });
  expect(screen.getByTestId("timeline-rows").props.scrollEnabled).toBe(false);
});

test("twelve layers: the timeline stops at the cap, every row is still mounted inside the rows view, and the clips are not in it", async () => {
  st().setProject(twelve);
  await render(<Timeline />);
  const height = CLIP_AREA_HEIGHT + 2.5 * LANE;
  expect(laneModel(twelve).height).toBe(CLIP_AREA_HEIGHT + 12 * LANE);
  expect(screen.getByTestId("timeline-root")).toHaveStyle({ height });
  expect(screen.getByTestId("timeline-scroll").props.contentContainerStyle).toEqual({ paddingHorizontal: 375 / 2, height, flexDirection: "column" });
  expect(screen.getByTestId("timeline-playhead")).toHaveStyle({ top: 8, height: height - 16 });
  const rows = screen.getByTestId("timeline-rows");
  expect(rows.props.scrollEnabled).toBe(true);
  expect(rows.props.horizontal).toBeFalsy();
  expect(rows.props.bounces).toBe(false);
  expect(rows.props.directionalLockEnabled).toBe(true);
  expect(rows.props.scrollsToTop).toBe(false);
  // As wide as before for the bars: it reaches through the side paddings and pads its own content by the same amount.
  expect(flat("timeline-rows")).toMatchObject({ height: 2.5 * LANE, marginHorizontal: -375 / 2, flexGrow: 0 });
  expect(rows.props.contentContainerStyle).toEqual({ paddingHorizontal: 375 / 2 });
  for (let i = 0; i < 12; i++) expect(within(rows).getByTestId(`layer-row-l${i}`)).toBeTruthy();
  // Pinned: the clip area is a sibling above the rows view, inside the one sideways scroll.
  expect(within(rows).queryByTestId("timeline-clips")).toBeNull();
  expect(within(screen.getByTestId("timeline-scroll")).getByTestId("timeline-clips")).toHaveStyle({ height: CLIP_AREA_HEIGHT });
  expect(within(screen.getByTestId("timeline-scroll")).getByTestId("timeline-rows")).toBeTruthy();
  // The playhead and the thumb are outside both scroll views.
  expect(within(screen.getByTestId("timeline-scroll")).queryByTestId("timeline-playhead")).toBeNull();
  expect(within(screen.getByTestId("timeline-scroll")).queryByTestId("timeline-rows-thumb")).toBeNull();
});

test("the thumb shows where the rows are and follows a scroll without a jump being asked for", async () => {
  st().setProject(twelve);
  await render(<Timeline />);
  const viewport = 2.5 * LANE, content = 12 * LANE;
  const at = (y: number) => { const t = rowsThumb({ y, viewport, content })!; return { top: CLIP_AREA_HEIGHT + t.top, height: t.height }; };
  expect(screen.getByTestId("timeline-rows-thumb")).toHaveStyle(at(0));
  expect(screen.getByTestId("timeline-rows-thumb").props.pointerEvents).toBe("none");
  await act(() => { fireEvent.scroll(screen.getByTestId("timeline-rows"), { nativeEvent: { contentOffset: { x: 0, y: 100 } } }); });
  expect(screen.getByTestId("timeline-rows-thumb")).toHaveStyle(at(100));
  expect(jumps()).toEqual([]);
  // Scrolling the rows is not a scrub: the playhead and playback are untouched.
  expect(st().playhead).toBe(0);
});

test("selecting a bar brings its row into view in one jump, not animated; one already in view moves nothing", async () => {
  st().setProject(twelve);
  await render(<Timeline />);
  expect(jumps()).toEqual([]);                                   // opening the project scrolls nothing
  await act(() => { st().select("l1"); });
  expect(jumps()).toEqual([]);                                   // row 1 shows whole
  await act(() => { st().select("l11"); });
  expect(jumps()).toEqual([{ y: 12 * LANE - 2.5 * LANE, animated: false }]);
  await act(() => { st().select("l10"); });
  expect(jumps()).toHaveLength(1);                               // already in view after the jump
  await act(() => { st().select("l0"); });
  expect(jumps()[1]).toEqual({ y: 0, animated: false });
  // A main clip is in no row: selecting it leaves the rows where they are.
  await act(() => { st().select("l11"); });
  await act(() => { st().select("a"); });
  expect(jumps()).toHaveLength(3);
});

test("the row is found in every lane: a sound, a text and an effect", async () => {
  const p: Project = { ...twelve, audioTracks: [makeAudioTrack({ id: "m", sourceDuration: 5 })],
    overlays: [makeOverlay({ id: "t0", text: "a", start: 0, end: 2 }), makeOverlay({ id: "t1", text: "b", start: 1, end: 3 })], effects: [makeEffect({ id: "e0" })] };
  st().setProject(p);
  await render(<Timeline />);
  const viewport = 2.5 * LANE;
  await act(() => { st().selectEffect("e0"); });                 // music 0, layers 1–12, texts 13–14, effects 15
  expect(jumps()[0]).toEqual({ y: 16 * LANE - viewport, animated: false });
  await act(() => { st().selectOverlay("t1"); });                // row 14 = 448…480 is inside 432…512
  expect(jumps()).toHaveLength(1);
  await act(() => { st().selectAudio("m"); });
  expect(jumps()[1]).toEqual({ y: 0, animated: false });
  await act(() => { st().selectOverlay("t0"); });
  expect(jumps()[2]).toEqual({ y: 14 * LANE - viewport, animated: false });
});

test("a bar that is added is brought into view even when it is not selected; a drag or a trim of a bar is not", async () => {
  st().setProject({ ...twelve, overlays: [makeOverlay({ id: "t0", text: "a", start: 0, end: 2 })] });
  await render(<Timeline />);
  // A drag: the same bars, other times.
  await act(() => { st().beginTransaction(); st().applyTransient((p) => moveOverlay(p, "t0", 3)); });
  await act(() => { st().applyTransient((p) => moveOverlay(p, "t0", 5)); });
  expect(jumps()).toEqual([]);
  // The playhead and the zoom move nothing either.
  await act(() => { st().seek(2); st().setZoom(80); });
  expect(jumps()).toEqual([]);
  await act(() => { st().apply((p) => ({ ...p, effects: [makeEffect({ id: "e0" })] })); });
  expect(jumps()).toEqual([{ y: 14 * LANE - 2.5 * LANE, animated: false }]);
  await act(() => { st().apply((p) => ({ ...p, layers: [...p.layers, makeLayer({ id: "new", sourceDuration: 4 })] })); });
  expect(jumps()).toHaveLength(1);                               // the new layer's row (12: 384…416) already shows in 368…448
  await act(() => { fireEvent.scroll(screen.getByTestId("timeline-rows"), { nativeEvent: { contentOffset: { x: 0, y: 0 } } }); });
  await act(() => { st().apply((p) => ({ ...p, layers: [...p.layers, makeLayer({ id: "new2", sourceDuration: 4 })] })); });
  // From the top, the newest layer (row 13 of 16) comes up just far enough to show whole.
  expect(jumps()[1]).toEqual({ y: 14 * LANE - 2.5 * LANE, animated: false });
});

test("rows removed under the scroll position bring it back inside what is left; back under the cap it returns to the top", async () => {
  st().setProject(twelve);
  await render(<Timeline />);
  await act(() => { fireEvent.scroll(screen.getByTestId("timeline-rows"), { nativeEvent: { contentOffset: { x: 0, y: 12 * LANE - 2.5 * LANE } } }); });
  await act(() => { st().apply((p) => ({ ...p, layers: p.layers.slice(0, 6) })); });
  expect(jumps()).toEqual([{ y: 6 * LANE - 2.5 * LANE, animated: false }]);
  await act(() => { st().apply((p) => ({ ...p, layers: p.layers.slice(0, 2) })); });
  expect(jumps()[1]).toEqual({ y: 0, animated: false });
  expect(screen.getByTestId("timeline-rows").props.scrollEnabled).toBe(false);
  expect(screen.getByTestId("timeline-root")).toHaveStyle({ height: CLIP_AREA_HEIGHT + 2 * LANE });
});

test("crossing the cap remounts nothing: the same rows view and the same bars before and after", async () => {
  let mounts = 0;
  const React = require("react") as typeof import("react");
  const Probe = () => { React.useEffect(() => { mounts++; }, []); return null; };
  st().setProject({ ...base, layers: layersOf(2) });
  await render(<Timeline renderStripExtras={() => <Probe />} />);
  const rowsBefore = screen.getByTestId("timeline-rows"), barBefore = screen.getByTestId("layer-bar-l0");
  expect(mounts).toBe(1);
  await act(() => { st().apply((p) => ({ ...p, layers: [...p.layers, ...layersOf(8, 2)] })); });
  expect(screen.getByTestId("timeline-root")).toHaveStyle({ height: CLIP_AREA_HEIGHT + 2.5 * LANE });
  expect(mounts).toBe(1);
  expect(screen.getByTestId("timeline-rows")).toBe(rowsBefore);
  expect(screen.getByTestId("layer-bar-l0")).toBe(barBefore);
  await act(() => { st().apply((p) => ({ ...p, layers: p.layers.slice(0, 1) })); });
  expect(mounts).toBe(1);
  expect(screen.getByTestId("layer-bar-l0")).toBe(barBefore);
});

test("a larger iPhone shows more rows before they scroll", async () => {
  Dimensions.set({ window: { ...window, width: 440, height: 956 } });
  st().setProject({ ...base, layers: layersOf(5) });
  await render(<Timeline />);
  expect(screen.getByTestId("timeline-root")).toHaveStyle({ height: CLIP_AREA_HEIGHT + 5 * LANE });
  expect(screen.getByTestId("timeline-rows").props.scrollEnabled).toBe(false);
  await act(() => { st().apply((p) => ({ ...p, layers: layersOf(6) })); });
  expect(screen.getByTestId("timeline-root")).toHaveStyle({ height: CLIP_AREA_HEIGHT + 5.5 * LANE });
  expect(screen.getByTestId("timeline-rows").props.scrollEnabled).toBe(true);
});
