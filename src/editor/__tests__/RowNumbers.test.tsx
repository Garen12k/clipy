import { StyleSheet } from "react-native";
import { act, render, screen, within } from "@testing-library/react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
jest.mock("@/src/projects/pickMedia", () => ({ pickMedia: jest.fn(async () => null) }));
import { deleteLayer } from "@/src/editor/model/ops";
import { makeAudioTrack, makeClip, makeEffect, makeLayer, makeOverlay, makeProject } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { theme } from "@/src/theme/theme";
import { Timeline } from "../components/Timeline";
import { LANE_GAP, LANE_HEIGHT, laneModel, layerRowTops, rowTops } from "../timelineLayout";

// The chips are decoration (the bars say what they are), so they are hidden from VoiceOver — and from the default queries.
const hidden = { includeHiddenElements: true } as const;
const clips = [makeClip({ id: "a", sourceDuration: 10 })];
const layer = (id: string, start: number) => makeLayer({ id, sourceDuration: 2, start });
/** Seven rows: music, voice, two layers, two texts that share time (a row each), one effect. */
const full = makeProject({ clips, layers: [layer("l1", 0), layer("l2", 3)],
  audioTracks: [makeAudioTrack({ id: "v", kind: "voice", sourceDuration: 5 }), makeAudioTrack({ id: "m", sourceDuration: 5 })],
  overlays: [makeOverlay({ id: "o1", text: "Hi", start: 1, end: 4 }), makeOverlay({ id: "o2", text: "Yo", start: 2, end: 5 })], effects: [makeEffect({ id: "e1", start: 2, end: 5 })] });
const st = () => useEditorStore.getState();
const slots = () => screen.queryAllByTestId(/^row-number-slot-\d+$/, hidden);
const numbers = (): number[] => screen.queryAllByTestId(/^row-number-\d+$/, hidden).map((c) => within(c).getByText(/^\d+$/, hidden).props.children);
const chip = (n: number) => StyleSheet.flatten(screen.getByTestId(`row-number-${n}`, hidden).props.style);
/** The numbers of the chips that are filled with the selection colour. */
const lit = () => numbers().filter((n) => chip(n).backgroundColor === theme.colors.text);
beforeEach(() => { st().reset(); st().setProject(full); });

test("a project with clips only has no rows, so no gutter", async () => {
  st().setProject(makeProject({ clips }));
  await render(<Timeline />);
  expect(rowTops(laneModel(st().project))).toEqual([]);
  expect(screen.queryByTestId("row-number-gutter", hidden)).toBeNull();
  expect(slots()).toHaveLength(0);
});

test("music, voice, two layers, two overlapping texts and an effect give the chips 1 to 7, each on its row as the lane model places it", async () => {
  await render(<Timeline />);
  const tops = rowTops(laneModel(full));
  expect(tops).toHaveLength(7);
  expect(numbers()).toEqual([1, 2, 3, 4, 5, 6, 7]);
  // A slot is the whole row (its gap, then its bars) and the chip is centred on the bars' part of it.
  expect(slots().map((s) => StyleSheet.flatten(s.props.style))).toEqual(tops.map((top) => ({ position: "absolute", left: 0, top, height: LANE_GAP + LANE_HEIGHT, justifyContent: "flex-end" })));
  for (const s of slots()) {
    const [bars] = s.children as unknown as { props: { style: object } }[];
    expect(StyleSheet.flatten(bars.props.style)).toEqual({ height: LANE_HEIGHT, justifyContent: "center" });
  }
  for (const n of numbers()) expect(chip(n).height).toBeLessThanOrEqual(LANE_HEIGHT);
});

test("a layer bar's title carries the number of the chip beside it", async () => {
  await render(<Timeline />);
  const tops = rowTops(laneModel(full)), layerTops = layerRowTops(laneModel(full));
  expect(layerTops.map((top) => tops.indexOf(top) + 1)).toEqual([3, 4]);
  expect(within(screen.getByTestId("layer-bar-l1")).getByText("Layer 3")).toBeTruthy();
  expect(within(screen.getByTestId("layer-bar-l2")).getByText("Layer 4")).toBeTruthy();
  expect(screen.queryByText("Layer 1")).toBeNull();
});

test("the gutter is pinned: a sibling above the scroll view, not in its content, and it takes no touch", async () => {
  await render(<Timeline />);
  const gutter = screen.getByTestId("row-number-gutter", hidden);
  const root = screen.getByTestId("timeline-root"), scroll = screen.getByTestId("timeline-scroll");
  expect(gutter.parent).toBe(root);
  expect(within(scroll).queryAllByTestId(/^row-number-/, hidden)).toHaveLength(0);
  // Drawn after (so above) the scroll view, like the playhead line.
  const order = root.children.map((c) => (typeof c === "string" ? c : c.props.testID));
  expect(order.indexOf("row-number-gutter")).toBeGreaterThan(order.indexOf("timeline-scroll"));
  expect(gutter.props.pointerEvents).toBe("none");
  // At the left edge of the viewport, in the lead-in that is empty at scroll 0 (the content starts at half the width).
  const style = StyleSheet.flatten(gutter.props.style);
  expect(style).toMatchObject({ position: "absolute", left: theme.space.xs, top: 0 });
  expect(style.left + chip(1).minWidth).toBeLessThan(scroll.props.contentContainerStyle.paddingHorizontal);
});

test("the chips are hidden from VoiceOver", async () => {
  await render(<Timeline />);
  const gutter = screen.getByTestId("row-number-gutter", hidden);
  expect(gutter.props.accessibilityElementsHidden).toBe(true);
  expect(gutter.props.importantForAccessibility).toBe("no-hide-descendants");
  expect(screen.queryByTestId("row-number-gutter")).toBeNull();
  expect(screen.queryByText("2")).toBeNull();
});

test("the chip of the row that holds the selected item is the cream one, whatever kind of item it is; nothing changes size", async () => {
  await render(<Timeline />);
  const plain = chip(1);
  expect(lit()).toEqual([]);
  for (const n of numbers()) expect(chip(n)).toEqual(plain);
  const expectLit = (n: number) => {
    expect(lit()).toEqual([n]);
    expect(chip(n)).toEqual({ ...plain, backgroundColor: theme.colors.text, borderColor: theme.colors.text });
    for (const other of numbers().filter((x) => x !== n)) expect(chip(other)).toEqual(plain);
  };
  await act(() => { st().selectAudio("m"); });
  expectLit(1);
  await act(() => { st().selectAudio("v"); });
  expectLit(2);
  await act(() => { st().select("l1"); });
  expectLit(3);
  await act(() => { st().select("l2"); });
  expectLit(4);
  await act(() => { st().selectOverlay("o1"); });
  expectLit(5);
  await act(() => { st().selectOverlay("o2"); });
  expectLit(6);
  await act(() => { st().selectEffect("e1"); });
  expectLit(7);
  // A selected main clip (the same store field as a layer) is in no row.
  await act(() => { st().select("a"); });
  expect(lit()).toEqual([]);
});

test("removing the music renumbers every row, the layer titles with them, and the selection keeps its row's chip", async () => {
  await render(<Timeline />);
  await act(() => { st().select("l2"); });
  expect(lit()).toEqual([4]);
  await act(() => { st().apply((q) => ({ ...q, audioTracks: q.audioTracks.filter((t) => t.id !== "m") })); });
  const tops = rowTops(laneModel(st().project));
  expect(tops).toHaveLength(6);
  expect(numbers()).toEqual([1, 2, 3, 4, 5, 6]);
  expect(slots().map((s) => StyleSheet.flatten(s.props.style).top)).toEqual(tops);
  expect(within(screen.getByTestId("layer-bar-l1")).getByText("Layer 2")).toBeTruthy();
  expect(within(screen.getByTestId("layer-bar-l2")).getByText("Layer 3")).toBeTruthy();
  expect(lit()).toEqual([3]);
  // Deleting the first layer moves the second one up a row.
  await act(() => { st().apply((q) => deleteLayer(q, "l1")); });
  expect(numbers()).toEqual([1, 2, 3, 4, 5]);
  expect(within(screen.getByTestId("layer-bar-l2")).getByText("Layer 2")).toBeTruthy();
  expect(st().selectedClipId).toBe("l2");
  expect(lit()).toEqual([2]);
});
