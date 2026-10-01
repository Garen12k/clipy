import { fireEvent, render, screen } from "@testing-library/react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
jest.mock("@react-native-community/slider", () => { const { View } = require("react-native"); return ({ testID, onSlidingStart, onValueChange }: { testID?: string; onSlidingStart?: () => void; onValueChange?: (v: number) => void }) => <View testID={testID} onTouchStart={() => onSlidingStart?.()} onTouchMove={() => onValueChange?.(0.8)} />; });
import { makeClip, makeProject } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { TransitionSheet } from "../components/TransitionSheet";

beforeEach(() => { useEditorStore.getState().reset(); useEditorStore.getState().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 4 }), makeClip({ id: "b", sourceDuration: 4 })] })); });

test("chips set the type with a default duration; the slider adjusts within the cap", async () => {
  await render(<TransitionSheet clipIndex={0} visible onClose={() => {}} />);
  await fireEvent.press(screen.getByRole("button", { name: "Dissolve" }));
  expect(useEditorStore.getState().project!.clips[0].transitionOut).toEqual({ type: "dissolve", duration: 0.5 });
  const slider = screen.getByTestId("transition-slider");
  await fireEvent(slider, "touchStart"); await fireEvent(slider, "touchMove");
  expect(useEditorStore.getState().project!.clips[0].transitionOut.duration).toBe(0.8);
  await fireEvent.press(screen.getByRole("button", { name: "None" }));
  expect(useEditorStore.getState().project!.clips[0].transitionOut).toEqual({ type: "none", duration: 0 });
});

test("last clip shows the no-next-clip message", async () => {
  await render(<TransitionSheet clipIndex={1} visible onClose={() => {}} />);
  expect(screen.getByText("No clip after this one")).toBeTruthy();
});
