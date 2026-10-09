import { act, render, screen } from "@testing-library/react-native";
import { withTiming } from "react-native-reanimated";
import { theme } from "@/src/theme/theme";
import { EASE } from "../motion";
import { TOAST_MS, ToastHost, useToast } from "../Toast";
import { setReducedMotionForTests } from "../useReducedMotion";

jest.mock("react-native-reanimated", () => {
  const m = require("react-native-reanimated/mock");
  return { ...m, withTiming: jest.fn(m.withTiming) };
});
const T = withTiming as jest.Mock;
beforeEach(() => { jest.useFakeTimers(); setReducedMotionForTests(false); useToast.getState().clear(); T.mockClear(); });
afterEach(() => { jest.useRealTimers(); });

test("eases in when shown, eases out just before it goes, and is gone after 2.5 s", async () => {
  expect(TOAST_MS).toBe(2500);
  await render(<ToastHost />);
  await act(() => useToast.getState().show("Saved"));
  expect(screen.getByText("Saved")).toBeTruthy();
  expect(screen.getByTestId("toast")).toHaveStyle({ backgroundColor: theme.screen.tile, paddingVertical: theme.space.md, paddingHorizontal: theme.space.lg });
  expect(T).toHaveBeenLastCalledWith(1, { duration: theme.motion.base, easing: EASE });
  await act(() => { jest.advanceTimersByTime(TOAST_MS - theme.motion.fast - 1); });
  expect(T).toHaveBeenCalledTimes(1);
  await act(() => { jest.advanceTimersByTime(1); });
  expect(T).toHaveBeenLastCalledWith(0, { duration: theme.motion.fast, easing: EASE });
  expect(screen.getByText("Saved")).toBeTruthy();
  await act(() => { jest.advanceTimersByTime(theme.motion.fast); });
  expect(screen.queryByText("Saved")).toBeNull();
});

test("with Reduce Motion: shown and removed without animating", async () => {
  setReducedMotionForTests(true);
  await render(<ToastHost />);
  await act(() => useToast.getState().show("Saved"));
  await act(() => { jest.advanceTimersByTime(TOAST_MS - 1); });
  expect(screen.getByText("Saved")).toBeTruthy();
  await act(() => { jest.advanceTimersByTime(1); });
  expect(screen.queryByText("Saved")).toBeNull();
  expect(T).not.toHaveBeenCalled();
});

// ───────────────────────────── Light: the phone's light setting (src/ui/testing/appearance.ts) ─────────────────────────────
import { leftovers, wear } from "@/src/ui/testing/appearance";

test("in light the toast is a cream tile with a quiet edge and navy words (in dark the audit sees its navy)", async () => {
  const dark = await render(<ToastHost />);
  await act(() => useToast.getState().show("Saved"));
  expect(leftovers().length).toBeGreaterThan(1);
  await dark.unmount();
  useToast.getState().clear();
  wear("light");
  try {
    await render(<ToastHost />);
    await act(() => useToast.getState().show("Saved"));
    expect(leftovers()).toEqual([]);
    expect(screen.getByTestId("toast")).toHaveStyle({ backgroundColor: "#EBE2CC", borderColor: "#D2C5A9" });
    expect(screen.getByText("Saved")).toHaveStyle({ color: "#0A1B33" });
  } finally { wear("dark"); }
});
