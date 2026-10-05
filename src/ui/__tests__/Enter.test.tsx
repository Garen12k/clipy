import { render, screen } from "@testing-library/react-native";
import { Text } from "react-native";
import { withTiming } from "react-native-reanimated";
import { theme } from "@/src/theme/theme";
import { EnterView } from "../Enter";
import { EASE } from "../motion";
import { setReducedMotionForTests } from "../useReducedMotion";

jest.mock("react-native-reanimated", () => {
  const m = require("react-native-reanimated/mock");
  return { ...m, withTiming: jest.fn(m.withTiming) };
});
const T = withTiming as jest.Mock;
beforeEach(() => { setReducedMotionForTests(false); T.mockClear(); });

test("animates in once, on mount: to 1 in the base duration — and never again on a re-render", async () => {
  const view = await render(<EnterView testID="e" style={{ height: 40 }}><Text>one</Text></EnterView>);
  expect(T).toHaveBeenCalledTimes(1);
  expect(T).toHaveBeenLastCalledWith(1, { duration: theme.motion.base, easing: EASE });
  expect(screen.getByTestId("e")).toHaveStyle({ height: 40 });
  expect(screen.getByText("one")).toBeTruthy();
  await view.rerender(<EnterView testID="e" style={{ height: 60 }}><Text>two</Text></EnterView>);
  expect(screen.getByTestId("e")).toHaveStyle({ height: 60 });
  expect(T).toHaveBeenCalledTimes(1);
});

test("starts 8 pt off: below by default, to the right with axis x", async () => {
  await render(<><EnterView testID="y"><Text>y</Text></EnterView><EnterView testID="x" axis="x"><Text>x</Text></EnterView></>);
  expect(screen.getByTestId("y")).toHaveStyle({ transform: [{ translateY: theme.motion.enterShift }] });
  expect(screen.getByTestId("x")).toHaveStyle({ transform: [{ translateX: theme.motion.enterShift }] });
});

test("with Reduce Motion it is simply there: no animation, no offset", async () => {
  setReducedMotionForTests(true);
  await render(<EnterView testID="e"><Text>one</Text></EnterView>);
  expect(T).not.toHaveBeenCalled();
  expect(screen.getByTestId("e")).toHaveStyle({ opacity: 1, transform: [{ translateY: 0 }] });
});

test("a new key is a new mount: it animates again", async () => {
  const view = await render(<EnterView key="a"><Text>a</Text></EnterView>);
  await view.rerender(<EnterView key="b"><Text>b</Text></EnterView>);
  expect(T).toHaveBeenCalledTimes(2);
});
