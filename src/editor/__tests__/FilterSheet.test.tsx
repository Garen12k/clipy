import { act, fireEvent, render, screen } from "@testing-library/react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
jest.mock("@/src/editor/components/thumbnails", () => ({ getThumb: jest.fn(async () => "file:///thumb.jpg") }));
jest.mock("@react-native-community/slider", () => { const { View } = require("react-native"); return ({ testID, disabled, onSlidingStart, onValueChange }: { testID?: string; disabled?: boolean; onSlidingStart?: () => void; onValueChange?: (v: number) => void }) => <View testID={testID} accessibilityState={{ disabled: !!disabled }} onTouchStart={() => onSlidingStart?.()} onTouchMove={() => onValueChange?.(0.8)} />; });
import { Dimensions } from "react-native";
import { FILTERS } from "@/src/editor/effects";
import { FILTER_IDS, makeClip, makeLayer, makePhotoClip, makeProject } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { toolWidth } from "@/src/ui/ToolStrip";
import { FilterSheet } from "../components/FilterSheet";

beforeEach(() => { useEditorStore.getState().reset(); useEditorStore.getState().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 4 }), makeClip({ id: "b", sourceDuration: 4 })] })); });

test("tiles apply a filter to the clip; Apply to all applies to every clip", async () => {
  await render(<FilterSheet clipId="a" visible onClose={() => {}} />);
  await fireEvent.press(screen.getByRole("button", { name: "Warm" }));
  expect(useEditorStore.getState().project!.clips.map((c) => c.filter)).toEqual(["warm", null]);
  await fireEvent.press(screen.getByRole("button", { name: "Apply to All Clips" }));
  expect(useEditorStore.getState().project!.clips.map((c) => c.filter)).toEqual(["warm", "warm"]);
  await fireEvent.press(screen.getByRole("button", { name: "None" }));
  expect(useEditorStore.getState().project!.clips[0].filter).toBeNull();
});

test("a photo clip's tiles use the photo itself, not the video thumbnailer", async () => {
  const { getThumb } = jest.requireMock("@/src/editor/components/thumbnails") as { getThumb: jest.Mock };
  getThumb.mockClear();
  useEditorStore.getState().setProject(makeProject({ clips: [makePhotoClip({ id: "p", sourceUri: "file:///media/p.jpg" })] }));
  await render(<FilterSheet clipId="p" visible onClose={() => {}} />);
  expect(getThumb).not.toHaveBeenCalled();
  expect(screen.getByTestId("filter-thumb-warm").props.source).toEqual({ uri: "file:///media/p.jpg" });
});

test("strength slider is disabled for None and enabled once a filter is picked", async () => {
  await render(<FilterSheet clipId="a" visible onClose={() => {}} />);
  expect(screen.getByTestId("filter-strength").props.accessibilityState.disabled).toBe(true);
  await fireEvent.press(screen.getByRole("button", { name: "Warm" }));
  expect(screen.getByTestId("filter-strength").props.accessibilityState.disabled).toBe(false);
  expect(screen.getByText("Strength 100")).toBeTruthy();
});

test("dragging the strength slider sets filterIntensity as one undo step; picking a filter keeps it", async () => {
  await render(<FilterSheet clipId="a" visible onClose={() => {}} />);
  await fireEvent.press(screen.getByRole("button", { name: "Warm" }));
  const before = useEditorStore.getState().past.length;
  const slider = screen.getByTestId("filter-strength");
  await fireEvent(slider, "touchStart"); await fireEvent(slider, "touchMove");
  expect(useEditorStore.getState().project!.clips[0].filterIntensity).toBe(0.8);
  expect(useEditorStore.getState().past.length).toBe(before + 1);
  expect(screen.getByText("Strength 80")).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: "Cool" }));
  expect(useEditorStore.getState().project!.clips[0]).toMatchObject({ filter: "cool", filterIntensity: 0.8 });
  await act(() => { useEditorStore.getState().undo(); useEditorStore.getState().undo(); });
  expect(useEditorStore.getState().project!.clips[0].filterIntensity).toBe(1);
});

test("Apply to all clips copies the filter and its strength", async () => {
  await render(<FilterSheet clipId="a" visible onClose={() => {}} />);
  await fireEvent.press(screen.getByRole("button", { name: "Warm" }));
  const slider = screen.getByTestId("filter-strength");
  await fireEvent(slider, "touchStart"); await fireEvent(slider, "touchMove");
  await fireEvent.press(screen.getByRole("button", { name: "Apply to All Clips" }));
  expect(useEditorStore.getState().project!.clips.map((c) => [c.filter, c.filterIntensity])).toEqual([["warm", 0.8], ["warm", 0.8]]);
});

test("without clipIds the title is Filter and Apply to all clips is offered", async () => {
  await render(<FilterSheet clipId="a" visible onClose={() => {}} />);
  expect(screen.getByRole("header", { name: "Filter" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Apply to All Clips" })).toBeTruthy();
});

test("clipIds: a tile and the slider write every listed main clip, one undo step each; a layer id is skipped; no Apply to all", async () => {
  useEditorStore.getState().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 4 }), makeClip({ id: "b", sourceDuration: 4 }), makePhotoClip({ id: "c" })], layers: [makeLayer({ id: "l", sourceDuration: 2 })] }));
  await render(<FilterSheet clipId="a" clipIds={["a", "c", "l"]} visible onClose={() => {}} />);
  expect(screen.getByRole("header", { name: "Filter · 2 clips" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Apply to All Clips" })).toBeNull();
  await fireEvent.press(screen.getByRole("button", { name: "Warm" }));
  const st = () => useEditorStore.getState();
  expect(st().project!.clips.map((c) => c.filter)).toEqual(["warm", null, "warm"]);
  expect(st().project!.layers[0].filter).toBeNull();
  expect(st().past).toHaveLength(1);
  const slider = screen.getByTestId("filter-strength");
  await fireEvent(slider, "touchStart"); await fireEvent(slider, "touchMove"); await fireEvent(slider, "touchMove");
  expect(st().project!.clips.map((c) => c.filterIntensity)).toEqual([0.8, 1, 0.8]);
  expect(st().project!.layers[0].filterIntensity).toBe(1);
  expect(st().past).toHaveLength(2);
  await act(() => { st().undo(); });
  expect(st().project!.clips.map((c) => [c.filter, c.filterIntensity])).toEqual([["warm", 1], [null, 1], ["warm", 1]]);
});

type Inst = ReturnType<typeof screen.getByTestId>;
const findScroll = (n: Inst): Inst | null => { if (n.props.contentOffset !== undefined) return n; for (const c of n.children) { if (typeof c === "string") continue; const f = findScroll(c as Inst); if (f) return f; } return null; };
const startX = () => findScroll(screen.getByTestId("strip-tiles"))!.props.contentOffset.x as number;
/** As the kit computes it: 32 tiles of 52, gaps of 8, a 16 gutter each side — in a row as wide as the strip's card, not the window. */
const rowEnd = () => 32 * 52 + 31 * 8 + 32 - toolWidth(Dimensions.get("window").width);

test("32 tiles: the twenty old filters first, in their order, then the twelve new ones; one thumbnail request for all of them", async () => {
  const { getThumb } = jest.requireMock("@/src/editor/components/thumbnails") as { getThumb: jest.Mock };
  getThumb.mockClear();
  await render(<FilterSheet clipId="a" visible onClose={() => {}} />);
  const labels = screen.getAllByRole("button").map((b) => b.props.accessibilityLabel).filter((l) => l !== "Done" && l !== "Apply to All Clips");
  expect(labels).toEqual(FILTER_IDS.map((id) => FILTERS[id].label));
  expect(labels).toHaveLength(32);
  expect(labels.slice(0, 20)).toEqual(["None", "Warm", "Cool", "Vivid", "Faded", "Mono", "Noir", "Vintage", "Sunset", "Golden", "Teal", "Pastel", "Film", "Chrome", "Instant", "Process", "Tonal", "Sepia", "Crisp", "Dream"]);
  expect(getThumb).toHaveBeenCalledTimes(1);
});

test("a new filter is picked like an old one and keeps the strength", async () => {
  await render(<FilterSheet clipId="a" visible onClose={() => {}} />);
  await fireEvent.press(screen.getByRole("button", { name: "Cinema" }));
  expect(useEditorStore.getState().project!.clips[0]).toMatchObject({ filter: "tealOrange", filterIntensity: 1 });
  expect(screen.getByTestId("filter-strength").props.accessibilityState.disabled).toBe(false);
  expect(useEditorStore.getState().past).toHaveLength(1);
});

test("the row opens with the selected filter in view — worked out once per opening, never past the row's end", async () => {
  useEditorStore.getState().apply((p) => ({ ...p, clips: p.clips.map((c) => (c.id === "a" ? { ...c, filter: "kodak" as const } : c)) }));
  const view = await render(<FilterSheet clipId="a" visible onClose={() => {}} />);
  expect(startX()).toBe(Math.min(20 * 60 - 52, rowEnd()));             // Amber (id kodak) is tile 20
  // Picking another filter does not move the row under the finger.
  await fireEvent.press(screen.getByRole("button", { name: "Warm" }));
  expect(startX()).toBe(Math.min(20 * 60 - 52, rowEnd()));
  // Closed and opened again: now it starts at Warm (tile 1 → 1·60 − 52 = 8).
  await view.rerender(<FilterSheet clipId="a" visible={false} onClose={() => {}} />);
  await view.rerender(<FilterSheet clipId="a" visible onClose={() => {}} />);
  expect(startX()).toBe(8);
  // The last filter: clamped to the row's end. Another clip (no filter): the start of the row.
  await fireEvent.press(screen.getByRole("button", { name: "Drama" }));
  await view.rerender(<FilterSheet clipId="a" visible={false} onClose={() => {}} />);
  await view.rerender(<FilterSheet clipId="a" visible onClose={() => {}} />);
  expect(startX()).toBe(Math.min(31 * 60 - 52, rowEnd()));
  await view.rerender(<FilterSheet clipId="b" visible onClose={() => {}} />);
  expect(startX()).toBe(0);
});
