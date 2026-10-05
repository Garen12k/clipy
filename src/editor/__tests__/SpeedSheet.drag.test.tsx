import { fireEvent, render, screen } from "@testing-library/react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-05T10:00:00.000Z" }));
import { withSpring } from "react-native-reanimated";
import { makeClip, makeProject } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { theme } from "@/src/theme/theme";
import { setReducedMotionForTests } from "@/src/ui/useReducedMotion";
import { SpeedSheet } from "../components/SpeedSheet";

jest.mock("react-native-reanimated", () => {
  const m = require("react-native-reanimated/mock");
  return { ...m, withSpring: jest.fn(m.withSpring) };
});
const S = withSpring as jest.Mock;
const chip = (name: string) => screen.getByRole("button", { name });
const speed = () => useEditorStore.getState().project!.clips[0].speed;

beforeEach(() => {
  setReducedMotionForTests(false);
  useEditorStore.getState().reset();
  useEditorStore.getState().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 8 })] }));
  S.mockClear();
});

test("dragging the Speed slider over the presets moves the ring at once and springs nothing; a pick after the drag springs again", async () => {
  await render(<SpeedSheet clipId="a" visible onClose={() => {}} />);
  expect(chip("1×")).toBeSelected();
  const slider = screen.getByTestId("speed-slider");
  await fireEvent(slider, "slidingStart", 1);
  expect(S).not.toHaveBeenCalled();                                    // the drag starting changes no chip
  await fireEvent(slider, "valueChange", 1.3);                         // leaves 1×
  expect(chip("1×")).not.toBeSelected();
  await fireEvent(slider, "valueChange", 2);                           // lands on 2×
  expect(chip("2×")).toBeSelected();
  expect(chip("2×")).toHaveStyle(theme.ring);
  await fireEvent(slider, "valueChange", 2.6);
  await fireEvent(slider, "valueChange", 4);                           // ends on 4×
  expect(chip("4×")).toBeSelected();
  expect(S).not.toHaveBeenCalled();
  await fireEvent(slider, "slidingComplete", 4);
  expect(S).not.toHaveBeenCalled();                                    // the drag ending changes no chip either
  expect(speed()).toBe(4);
  expect(useEditorStore.getState().past).toHaveLength(1);              // still one undo step
  await fireEvent.press(chip("0.5×"));                                 // a pick: 4× lets go, 0.5× lifts
  expect(speed()).toBe(0.5);
  expect(S).toHaveBeenCalledTimes(2);
  expect(S).toHaveBeenCalledWith(1, theme.motion.spring);
  expect(S).toHaveBeenCalledWith(0, theme.motion.spring);
});

test("a second drag is still again", async () => {
  await render(<SpeedSheet clipId="a" visible onClose={() => {}} />);
  const slider = screen.getByTestId("speed-slider");
  await fireEvent(slider, "slidingStart", 1);
  await fireEvent(slider, "valueChange", 2);
  await fireEvent(slider, "slidingComplete", 2);
  await fireEvent(slider, "slidingStart", 2);
  await fireEvent(slider, "valueChange", 1.5);
  await fireEvent(slider, "slidingComplete", 1.5);
  expect(chip("1.5×")).toBeSelected();
  expect(S).not.toHaveBeenCalled();
});
