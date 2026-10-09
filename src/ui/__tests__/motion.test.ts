import { withDelay, withSpring, withTiming } from "react-native-reanimated";
import { theme } from "@/src/theme/theme";
import { EASE, enterTo, fadeOutTo, liftTo, pressTo, sheetTo, timing, wizardDrawTo, wizardPopTo, wizardRowTo, wizardStepTo } from "../motion";

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

test("sheet: the sheet spring to 0; with Reduce Motion the panel is placed, not animated", () => {
  expect(sheetTo(false)).toBe(0);
  expect(S).toHaveBeenLastCalledWith(0, theme.motion.sheet);
  S.mockClear(); T.mockClear();
  expect(sheetTo(true)).toBe(0);
  expect(S).not.toHaveBeenCalled();
  expect(T).not.toHaveBeenCalled();
});

describe("the wizard's own builders (not beside the video: longer, in sequence, once)", () => {
  const W = theme.motion.wizard;
  test("the mark: the triangle in 500 ms, then the spark on its spring 350 ms later", () => {
    expect(wizardDrawTo(false)).toBe(1);
    expect(T).toHaveBeenLastCalledWith(1, { duration: 500, easing: EASE });
    expect(wizardPopTo(false)).toBe(1);
    expect(S).toHaveBeenLastCalledWith(1, W.pop);
    expect(D.mock.calls[0][0]).toBe(350);
  });

  test("page 2's tiles: 900 ms each, each 650 ms after the one before; page 3's rows: 300 ms, 120 ms apart; the first of each has no delay", () => {
    wizardStepTo(false, 0);
    expect(T).toHaveBeenLastCalledWith(1, { duration: 900, easing: EASE });
    expect(D).not.toHaveBeenCalled();
    for (const i of [1, 2, 3]) wizardStepTo(false, i);
    expect(D.mock.calls.map((c) => c[0])).toEqual([650, 1300, 1950]);
    D.mockClear();
    wizardRowTo(false, 0);
    expect(T).toHaveBeenLastCalledWith(1, { duration: 300, easing: EASE });
    expect(D).not.toHaveBeenCalled();
    for (const i of [1, 2, 3]) wizardRowTo(false, i);
    expect(D.mock.calls.map((c) => c[0])).toEqual([120, 240, 360]);
  });

  test("every page's whole sequence is over in under 4 s, and the editor's three durations are untouched", () => {
    expect(W).toEqual({ draw: 500, popDelay: 350, pop: { mass: 1, damping: 14, stiffness: 220 }, step: 900, stagger: 650, row: 300, rowStagger: 120 });
    expect(3 * W.stagger + W.step).toBeLessThan(4000);
    expect(3 * W.rowStagger + W.row).toBeLessThan(4000);
    expect(W.popDelay + 1500).toBeLessThan(4000);   // the spark's spring settles well inside 1.5 s
    for (const ms of [theme.motion.fast, theme.motion.base, theme.motion.slow]) expect(ms).toBeLessThanOrEqual(250);
  });

  test("Reduce Motion: each is its end value, and nothing is built", () => {
    expect([wizardDrawTo(true), wizardPopTo(true), wizardStepTo(true, 2), wizardRowTo(true, 3)]).toEqual([1, 1, 1, 1]);
    expect(T).not.toHaveBeenCalled(); expect(S).not.toHaveBeenCalled(); expect(D).not.toHaveBeenCalled();
  });
});
