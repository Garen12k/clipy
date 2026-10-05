import { withDelay, withSpring, withTiming } from "react-native-reanimated";
import { theme } from "@/src/theme/theme";
import { EASE, enterTo, fadeOutTo, liftTo, pressTo, timing } from "../motion";

jest.mock("react-native-reanimated", () => {
  const m = require("react-native-reanimated/mock");
  return { ...m, withSpring: jest.fn(m.withSpring), withTiming: jest.fn(m.withTiming), withDelay: jest.fn(m.withDelay) };
});
const T = withTiming as jest.Mock, S = withSpring as jest.Mock, D = withDelay as jest.Mock;
beforeEach(() => { T.mockClear(); S.mockClear(); D.mockClear(); });

test("timing: a duration with the one easing", () => {
  expect(timing(180)).toEqual({ duration: 180, easing: EASE });
});

test("press: a fast dip to 0.96 and back; with Reduce Motion the value is set, not animated", () => {
  expect(pressTo(true, false)).toBe(theme.motion.pressScale);
  expect(T).toHaveBeenLastCalledWith(0.96, { duration: theme.motion.fast, easing: EASE });
  expect(pressTo(false, false)).toBe(1);
  expect(T).toHaveBeenLastCalledWith(1, { duration: theme.motion.fast, easing: EASE });
  T.mockClear();
  expect(pressTo(true, true)).toBe(0.96);
  expect(pressTo(false, true)).toBe(1);
  expect(T).not.toHaveBeenCalled();
});

test("lift: the one spring between 0 and 1; set at once with Reduce Motion", () => {
  expect(liftTo(true, false)).toBe(1);
  expect(S).toHaveBeenLastCalledWith(1, theme.motion.spring);
  expect(liftTo(false, false)).toBe(0);
  expect(S).toHaveBeenLastCalledWith(0, theme.motion.spring);
  S.mockClear();
  expect(liftTo(true, true)).toBe(1);
  expect(S).not.toHaveBeenCalled();
});

test("enter: to 1 in the base duration, optionally delayed; fade out: to 0, fast; neither animates with Reduce Motion", () => {
  expect(enterTo(false)).toBe(1);
  expect(T).toHaveBeenLastCalledWith(1, { duration: theme.motion.base, easing: EASE });
  expect(D).not.toHaveBeenCalled();
  enterTo(false, theme.motion.slow, 30);
  expect(T).toHaveBeenLastCalledWith(1, { duration: theme.motion.slow, easing: EASE });
  expect(D).toHaveBeenCalledTimes(1);
  expect(D.mock.calls[0][0]).toBe(30);
  expect(fadeOutTo(false)).toBe(0);
  expect(T).toHaveBeenLastCalledWith(0, { duration: theme.motion.fast, easing: EASE });
  T.mockClear(); D.mockClear();
  expect(enterTo(true)).toBe(1);
  expect(fadeOutTo(true)).toBe(0);
  expect(T).not.toHaveBeenCalled();
  expect(D).not.toHaveBeenCalled();
});
