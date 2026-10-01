import { fireEvent, render, screen } from "@testing-library/react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
jest.mock("@react-native-community/slider", () => { const { View } = require("react-native"); return ({ testID, onSlidingStart, onValueChange }: { testID?: string; onSlidingStart?: () => void; onValueChange?: (v: number) => void }) => <View testID={testID} onTouchStart={() => onSlidingStart?.()} onTouchMove={() => onValueChange?.(1.5)} />; });
import { makeClip, makeProject } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { SpeedSheet } from "../components/SpeedSheet";

beforeEach(() => { useEditorStore.getState().reset(); useEditorStore.getState().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 8 })] })); });

test("chips set the speed; the slider is one undo step", async () => {
  await render(<SpeedSheet clipId="a" visible onClose={() => {}} />);
  await fireEvent.press(screen.getByRole("button", { name: "2×" }));
  expect(useEditorStore.getState().project!.clips[0].speed).toBe(2);
  const slider = screen.getByTestId("speed-slider");
  await fireEvent(slider, "touchStart"); await fireEvent(slider, "touchMove");
  expect(useEditorStore.getState().project!.clips[0].speed).toBe(1.5);
  expect(useEditorStore.getState().past).toHaveLength(2);
  expect(screen.getByText("1.5×")).toBeTruthy();
});
