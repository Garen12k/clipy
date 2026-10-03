import { Dimensions, StyleSheet } from "react-native";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
jest.mock("@/src/projects/pickMedia", () => ({ pickMedia: jest.fn(async () => null) }));
import { makeClip, makeEffect, makePhotoClip, makeProject } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { pickMedia } from "@/src/projects/pickMedia";
import { Timeline } from "../components/Timeline";
import { CLIP_AREA_HEIGHT, LANE_GAP, LANE_HEIGHT, stripWidth, TIMELINE_HEIGHT } from "../timelineLayout";

const p = makeProject({ clips: [makeClip({ id: "a", sourceDuration: 10 })] });
beforeEach(() => { useEditorStore.getState().reset(); useEditorStore.getState().setProject(p); });

test("timeline content container stacks the clip row and lanes vertically", async () => {
  await render(<Timeline />);
  const scrollView = screen.getByTestId("timeline-scroll");
  expect(scrollView.props.contentContainerStyle).toMatchObject({ flexDirection: "column" });
  expect(screen.getByTestId("overlay-lane")).toBeTruthy();
  expect(screen.getByTestId("music-lane")).toBeTruthy();
});

test("the effects lane is the third lane and only adds height: paddings and width stand-ins are unchanged", async () => {
  useEditorStore.getState().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 10 })], effects: [makeEffect({ id: "e1", start: 2, end: 5 })] }));
  await render(<Timeline />);
  const scroll = screen.getByTestId("timeline-scroll");
  expect(screen.getAllByTestId(/-lane$/).map((l) => l.props.testID)).toEqual(["overlay-lane", "music-lane", "effect-lane"]);
  expect(TIMELINE_HEIGHT).toBe(CLIP_AREA_HEIGHT + 3 * (LANE_HEIGHT + LANE_GAP));
  // Exactly the same container style as before, with the taller height: no width, no extra padding.
  expect(scroll.props.contentContainerStyle).toEqual({ paddingHorizontal: Dimensions.get("window").width / 2, height: TIMELINE_HEIGHT, flexDirection: "column" });
  const lane = StyleSheet.flatten(screen.getByTestId("effect-lane").props.style);
  expect(lane).toEqual(StyleSheet.flatten(screen.getByTestId("overlay-lane").props.style));
  expect(lane).toEqual({ position: "relative", height: LANE_HEIGHT, marginTop: LANE_GAP });
  // The pill is out of the flow, so it cannot widen the scroll content.
  expect(StyleSheet.flatten(within(scroll).getByTestId("effect-pill-e1").props.style).position).toBe("absolute");
  // The scroll handlers are the same five, none added.
  expect(Object.keys(scroll.props).filter((k) => /^on.*Scroll|^onScroll/.test(k)).sort()).toEqual(["onMomentumScrollBegin", "onMomentumScrollEnd", "onScroll", "onScrollBeginDrag", "onScrollEndDrag"]);
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
