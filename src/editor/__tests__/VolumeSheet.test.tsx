import { fireEvent, render, screen } from "@testing-library/react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
jest.mock("@react-native-community/slider", () => { const { View } = require("react-native"); return ({ testID, onSlidingStart, onValueChange, onSlidingComplete }: { testID?: string; onSlidingStart?: () => void; onValueChange?: (v: number) => void; onSlidingComplete?: (v: number) => void }) => <View testID={testID} onTouchStart={() => onSlidingStart?.()} onTouchMove={() => onValueChange?.(1.5)} onTouchEnd={() => onSlidingComplete?.(1.5)} />; });
import { makeClip, makeProject } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { VolumeSheet } from "../components/VolumeSheet";

beforeEach(() => { useEditorStore.getState().reset(); useEditorStore.getState().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 5 })] })); });

test("slider drag is one undo step; mute toggles", async () => {
  await render(<VolumeSheet clipId="a" visible onClose={() => {}} />);
  const slider = screen.getByTestId("volume-slider");
  await fireEvent(slider, "touchStart"); await fireEvent(slider, "touchMove"); await fireEvent(slider, "touchEnd");
  expect(useEditorStore.getState().project!.clips[0].volume).toBe(1.5);
  expect(useEditorStore.getState().past).toHaveLength(1);
  await fireEvent(screen.getByLabelText("Mute"), "valueChange", true);
  expect(useEditorStore.getState().project!.clips[0].muted).toBe(true);
  expect(screen.getByText("150%")).toBeTruthy();
});
