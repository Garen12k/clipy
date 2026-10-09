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
  expect(screen.getByText("Clipy")).toBeTruthy();
  expect(screen.getByText("Edit · Set sail · Share")).toBeTruthy();
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

// ───────────────────────────── Light: the phone's light setting (src/ui/testing/appearance.ts) ─────────────────────────────
import { readFileSync } from "fs";
import { join } from "path";
import { LAUNCH_APPEARANCE } from "@/src/theme/appearance";
import { hasSurface, leftovers, wear } from "@/src/ui/testing/appearance";
import { ShownContext } from "../tone";

test("the loading screen continues the navy launch screen: the layout draws it navy even when the phone is light — white wordmark, navy waves, the gold ring", async () => {
  const layout = readFileSync(join(__dirname, "..", "..", "..", "app", "_layout.tsx"), "utf8");
  expect(layout).toContain("<ShownContext.Provider value={LAUNCH_APPEARANCE}><LoadingScreen leaving={ready} onGone={onGone} /></ShownContext.Provider>");
  expect(LAUNCH_APPEARANCE).toBe("dark");
  wear("light");
  try {
    await render(<ShownContext.Provider value={LAUNCH_APPEARANCE}><LoadingScreen leaving={false} onGone={() => {}} /></ShownContext.Provider>);
    expect(hasSurface("#0A1B33")).toBe(true);
    expect(hasSurface("#F7F1E3")).toBe(false);
    expect(screen.getByText("Clipy")).toHaveStyle({ color: "#FFFFFF" });
    expect(leftovers().length).toBeGreaterThan(3);                  // it IS the dark screen
  } finally { wear("dark"); }
});

test("its parts follow whoever draws them: the same screen without that word is cream in light (the compass and the waves are the welcome screen's too)", async () => {
  wear("light");
  try {
    await render(<LoadingScreen leaving={false} onGone={() => {}} />);
    expect(leftovers()).toEqual([]);
    expect(hasSurface("#F7F1E3")).toBe(true);
    expect(screen.getByText("Clipy")).toHaveStyle({ color: "#0A1B33" });
    expect(screen.getByTestId("compass-ring").props.stroke).toBeDefined();
  } finally { wear("dark"); }
});
