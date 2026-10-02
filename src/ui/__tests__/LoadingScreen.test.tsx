import { act, render, screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import { cancelAnimation, withRepeat } from "react-native-reanimated";
import { LoadingScreen } from "../LoadingScreen";
import { useReducedMotion } from "../useReducedMotion";

jest.mock("../useReducedMotion", () => ({ useReducedMotion: jest.fn(() => false) }));
jest.mock("react-native-reanimated", () => {
  const m = require("react-native-reanimated/mock");
  return { ...m, withRepeat: jest.fn(m.withRepeat), cancelAnimation: jest.fn() };
});

const reducedMock = useReducedMotion as jest.Mock;

beforeEach(() => {
  jest.useFakeTimers();
  reducedMock.mockReturnValue(false);
  (withRepeat as jest.Mock).mockClear();
  (cancelAnimation as jest.Mock).mockClear();
});
afterEach(() => jest.useRealTimers());

/** Rotation applied to the Animated.View that wraps the compass. */
function compassRotation(): string | undefined {
  const style = StyleSheet.flatten(screen.getByTestId("loading-compass").props.style) as { transform?: { rotate?: string }[] } | undefined;
  return style?.transform?.find((t) => t.rotate !== undefined)?.rotate;
}

test("shows the brand and calls onGone after leaving", async () => {
  const onGone = jest.fn();
  const view = await render(<LoadingScreen leaving={false} onGone={onGone} />);
  expect(screen.getByText("CLIPY")).toBeTruthy();
  expect(screen.getByText("EDIT · SET SAIL · SHARE")).toBeTruthy();
  expect(screen.getByLabelText("Clipy compass")).toBeTruthy();
  expect(onGone).not.toHaveBeenCalled();
  await view.rerender(<LoadingScreen leaving onGone={onGone} />);
  await act(() => { jest.advanceTimersByTime(400); });
  expect(onGone).toHaveBeenCalledTimes(1);
});

test("without Reduce Motion the needle and both wave layers loop", async () => {
  await render(<LoadingScreen leaving={false} onGone={() => {}} />);
  expect(withRepeat).toHaveBeenCalledTimes(3);
});

test("under Reduce Motion no loop starts and the compass is upright", async () => {
  reducedMock.mockReturnValue(true);
  const onGone = jest.fn();
  const view = await render(<LoadingScreen leaving={false} onGone={onGone} />);
  expect(withRepeat).not.toHaveBeenCalled();
  expect(compassRotation()).toBe("0deg");
  // The fade-out hand-off still works.
  await view.rerender(<LoadingScreen leaving onGone={onGone} />);
  await act(() => { jest.advanceTimersByTime(400); });
  expect(onGone).toHaveBeenCalledTimes(1);
});

test("turning Reduce Motion on cancels the running loops", async () => {
  const view = await render(<LoadingScreen leaving={false} onGone={() => {}} />);
  expect(cancelAnimation).not.toHaveBeenCalled();
  reducedMock.mockReturnValue(true);
  await view.rerender(<LoadingScreen leaving={false} onGone={() => {}} />);
  expect(cancelAnimation).toHaveBeenCalledTimes(3); // needle + two wave layers
});
