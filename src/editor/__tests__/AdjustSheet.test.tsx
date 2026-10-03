import { fireEvent, render, screen } from "@testing-library/react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
jest.mock("@react-native-community/slider", () => { const { View } = require("react-native"); return ({ testID, minimumValue, maximumValue, value, onSlidingStart, onValueChange }: { testID?: string; minimumValue?: number; maximumValue?: number; value?: number; onSlidingStart?: () => void; onValueChange?: (v: number) => void }) => <View testID={testID} accessibilityValue={{ min: minimumValue, max: maximumValue, now: value }} onTouchStart={() => onSlidingStart?.()} onTouchMove={() => onValueChange?.(0.35)} />; });
import { makeClip, makeProject } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { AdjustSheet } from "../components/AdjustSheet";

const LABELS = ["Brightness", "Contrast", "Saturation", "Exposure", "Warmth", "Tint", "Highlights", "Shadows", "Sharpen", "Vignette", "Fade", "Grain"];
const clips = () => useEditorStore.getState().project!.clips;
const drag = async () => { const s = screen.getByTestId("adjust-slider"); await fireEvent(s, "touchStart"); await fireEvent(s, "touchMove"); };

beforeEach(() => { useEditorStore.getState().reset(); useEditorStore.getState().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 4 }), makeClip({ id: "b", sourceDuration: 4 })] })); });

test("shows twelve chips with brightness selected", async () => {
  await render(<AdjustSheet clipId="a" visible onClose={() => {}} />);
  for (const l of LABELS) expect(screen.getByRole("button", { name: l })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Brightness" })).toBeSelected();
  expect(screen.getByText("Brightness 0")).toBeTruthy();
});

test("selecting a key changes the slider range and label format", async () => {
  await render(<AdjustSheet clipId="a" visible onClose={() => {}} />);
  expect(screen.getByTestId("adjust-slider").props.accessibilityValue).toMatchObject({ min: -1, max: 1 });
  await fireEvent.press(screen.getByRole("button", { name: "Vignette" }));
  expect(screen.getByTestId("adjust-slider").props.accessibilityValue).toMatchObject({ min: 0, max: 1 });
});

test("a drag sets only the selected key as one undo step, with a signed label and a dot", async () => {
  await render(<AdjustSheet clipId="a" visible onClose={() => {}} />);
  const before = useEditorStore.getState().past.length;
  await drag();
  expect(clips()[0].adjust.brightness).toBe(0.35);
  expect(Object.entries(clips()[0].adjust).filter(([, v]) => v !== 0)).toHaveLength(1);
  expect(clips()[1].adjust.brightness).toBe(0);
  expect(useEditorStore.getState().past.length).toBe(before + 1);
  expect(screen.getByText("Brightness +35")).toBeTruthy();
  expect(screen.getByText("Brightness •")).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: "Vignette" }));
  await drag();
  expect(screen.getByText("Vignette 35")).toBeTruthy();
});

test("Reset zeroes every key in one step and is disabled when neutral", async () => {
  await render(<AdjustSheet clipId="a" visible onClose={() => {}} />);
  expect(screen.getByRole("button", { name: "Reset" })).toBeDisabled();
  await drag();
  await fireEvent.press(screen.getByRole("button", { name: "Vignette" }));
  await drag();
  const before = useEditorStore.getState().past.length;
  await fireEvent.press(screen.getByRole("button", { name: "Reset" }));
  expect(Object.values(clips()[0].adjust).every((v) => v === 0)).toBe(true);
  expect(useEditorStore.getState().past.length).toBe(before + 1);
  expect(screen.getByRole("button", { name: "Reset" })).toBeDisabled();
});

test("Apply to all copies the adjust to every clip", async () => {
  await render(<AdjustSheet clipId="a" visible onClose={() => {}} />);
  await drag();
  await fireEvent.press(screen.getByRole("button", { name: "Apply to all" }));
  expect(clips().map((c) => c.adjust.brightness)).toEqual([0.35, 0.35]);
});
