import { act, fireEvent, render, screen } from "@testing-library/react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
jest.mock("@/src/editor/components/thumbnails", () => ({ getThumb: jest.fn(async () => "file:///thumb.jpg") }));
jest.mock("@react-native-community/slider", () => { const { View } = require("react-native"); return ({ testID, disabled, onSlidingStart, onValueChange }: { testID?: string; disabled?: boolean; onSlidingStart?: () => void; onValueChange?: (v: number) => void }) => <View testID={testID} accessibilityState={{ disabled: !!disabled }} onTouchStart={() => onSlidingStart?.()} onTouchMove={() => onValueChange?.(0.8)} />; });
import { makeClip, makePhotoClip, makeProject } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { FilterSheet } from "../components/FilterSheet";

beforeEach(() => { useEditorStore.getState().reset(); useEditorStore.getState().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 4 }), makeClip({ id: "b", sourceDuration: 4 })] })); });

test("tiles apply a filter to the clip; Apply to all applies to every clip", async () => {
  await render(<FilterSheet clipId="a" visible onClose={() => {}} />);
  await fireEvent.press(screen.getByRole("button", { name: "Warm" }));
  expect(useEditorStore.getState().project!.clips.map((c) => c.filter)).toEqual(["warm", null]);
  await fireEvent.press(screen.getByRole("button", { name: "Apply to all clips" }));
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
  await fireEvent.press(screen.getByRole("button", { name: "Apply to all clips" }));
  expect(useEditorStore.getState().project!.clips.map((c) => [c.filter, c.filterIntensity])).toEqual([["warm", 0.8], ["warm", 0.8]]);
});
