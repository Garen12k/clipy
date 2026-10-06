import { StyleSheet } from "react-native";
import { act, render, screen, within } from "@testing-library/react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
jest.mock("@/src/projects/pickMedia", () => ({ pickMedia: jest.fn(async () => null) }));
import { deleteLayer } from "@/src/editor/model/ops";
import { makeAudioTrack, makeClip, makeEffect, makeLayer, makeOverlay, makeProject } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { theme } from "@/src/theme/theme";
import { Timeline } from "../components/Timeline";
import { LANE_GAP, LANE_HEIGHT, laneModel, layerRowTops } from "../timelineLayout";

// The chips repeat the bar titles, so they are hidden from VoiceOver — and from the default queries.
const hidden = { includeHiddenElements: true } as const;
const clips = [makeClip({ id: "a", sourceDuration: 10 })];
const layer = (id: string, start: number) => makeLayer({ id, sourceDuration: 2, start });
/** Three layers under a music lane, above a text and an effect row: the layer rows are neither the first nor the last. */
const three = makeProject({ clips, layers: [layer("l1", 0), layer("l2", 3), layer("l3", 6)], audioTracks: [makeAudioTrack({ id: "m", sourceDuration: 5 })],
  overlays: [makeOverlay({ id: "o1", text: "Hi", start: 1, end: 3 })], effects: [makeEffect({ id: "e1", start: 2, end: 5 })] });
const st = () => useEditorStore.getState();
const slots = () => screen.queryAllByTestId(/^layer-number-slot-\d+$/, hidden);
const numbers = () => screen.queryAllByTestId(/^layer-number-\d+$/, hidden).map((c) => within(c).getByText(/^\d+$/, hidden).props.children);
const chip = (n: number) => StyleSheet.flatten(screen.getByTestId(`layer-number-${n}`, hidden).props.style);
beforeEach(() => { st().reset(); st().setProject(three); });

test("without layers there is no gutter — not for audio, text or effect rows either", async () => {
  st().setProject({ ...three, layers: [] });
  await render(<Timeline />);
  expect(laneModel(st().project).lanes.map((l) => l.id)).toEqual(["music", "overlays", "effects"]);
  expect(screen.queryByTestId("layer-number-gutter", hidden)).toBeNull();
  expect(slots()).toHaveLength(0);
});

test("three layers give the chips 1 2 3, each on its row as the lane model places it", async () => {
  await render(<Timeline />);
  const tops = layerRowTops(laneModel(three));
  expect(tops).toHaveLength(3);
  expect(numbers()).toEqual([1, 2, 3]);
  // A slot is the whole row (its gap, then its bars) and the chip is centred on the bars' part of it.
  expect(slots().map((s) => StyleSheet.flatten(s.props.style))).toEqual(tops.map((top) => ({ position: "absolute", left: 0, top, height: LANE_GAP + LANE_HEIGHT, justifyContent: "flex-end" })));
  for (const s of slots()) {
    const [bars] = s.children as unknown as { props: { style: object } }[];
    expect(StyleSheet.flatten(bars.props.style)).toEqual({ height: LANE_HEIGHT, justifyContent: "center" });
  }
  for (const n of [1, 2, 3]) expect(chip(n).height).toBeLessThanOrEqual(LANE_HEIGHT);
});

test("the gutter is pinned: a sibling above the scroll view, not in its content, and it takes no touch", async () => {
  await render(<Timeline />);
  const gutter = screen.getByTestId("layer-number-gutter", hidden);
  const root = screen.getByTestId("timeline-root"), scroll = screen.getByTestId("timeline-scroll");
  expect(gutter.parent).toBe(root);
  expect(within(scroll).queryByTestId("layer-number-gutter", hidden)).toBeNull();
  expect(within(scroll).queryAllByTestId(/^layer-number-/, hidden)).toHaveLength(0);
  // Drawn after (so above) the scroll view, like the playhead line.
  const order = root.children.map((c) => (typeof c === "string" ? c : c.props.testID));
  expect(order.indexOf("layer-number-gutter")).toBeGreaterThan(order.indexOf("timeline-scroll"));
  expect(gutter.props.pointerEvents).toBe("none");
  // At the left edge of the viewport, in the lead-in that is empty at scroll 0 (the content starts at half the width).
  const style = StyleSheet.flatten(gutter.props.style);
  expect(style).toMatchObject({ position: "absolute", left: theme.space.xs, top: 0 });
  expect(style.left + chip(1).minWidth).toBeLessThan(scroll.props.contentContainerStyle.paddingHorizontal);
  // The bar titles are still there.
  for (const n of [1, 2, 3]) expect(screen.getByText(`Layer ${n}`)).toBeTruthy();
});

test("the chips are hidden from VoiceOver: the bar titles already say the number", async () => {
  await render(<Timeline />);
  const gutter = screen.getByTestId("layer-number-gutter", hidden);
  expect(gutter.props.accessibilityElementsHidden).toBe(true);
  expect(gutter.props.importantForAccessibility).toBe("no-hide-descendants");
  expect(screen.queryByTestId("layer-number-gutter")).toBeNull();
  expect(screen.queryByText("2")).toBeNull();
});

test("the selected layer's chip is emphasised like its bar; the others are not, and nothing changes size", async () => {
  await render(<Timeline />);
  const plain = chip(2);
  expect([chip(1), chip(3)]).toEqual([plain, plain]);
  await act(() => { st().select("l2"); });
  expect(chip(2)).toEqual({ ...plain, backgroundColor: theme.colors.text, borderColor: theme.colors.text });
  expect(chip(2).backgroundColor).not.toBe(plain.backgroundColor);
  expect([chip(1), chip(3)]).toEqual([plain, plain]);
  // A selected clip (the same store field) is not a layer: no chip is emphasised.
  await act(() => { st().select("a"); });
  expect([chip(1), chip(2), chip(3)]).toEqual([plain, plain, plain]);
});

test("deleting the first layer renumbers: two chips, 1 and 2, and the selection follows its layer", async () => {
  await render(<Timeline />);
  await act(() => { st().select("l2"); });
  const plain = chip(1);
  await act(() => { st().apply((q) => deleteLayer(q, "l1")); });
  const tops = layerRowTops(laneModel(st().project));
  expect(tops).toHaveLength(2);
  expect(numbers()).toEqual([1, 2]);
  expect(slots().map((s) => StyleSheet.flatten(s.props.style).top)).toEqual(tops);
  // l2 is now the first row.
  expect(st().selectedClipId).toBe("l2");
  expect(chip(1).backgroundColor).toBe(theme.colors.text);
  expect(chip(2)).toEqual(plain);
});
