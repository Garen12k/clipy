import { fireEvent, render, screen } from "@testing-library/react-native";
import { Text } from "react-native";
import { withSpring, withTiming } from "react-native-reanimated";
import { theme } from "@/src/theme/theme";
import { Sheet, shouldDismiss } from "../Sheet";
import { setReducedMotionForTests } from "../useReducedMotion";

jest.mock("react-native-reanimated", () => {
  const m = require("react-native-reanimated/mock");
  return { ...m, withSpring: jest.fn(m.withSpring), withTiming: jest.fn(m.withTiming) };
});
const S = withSpring as jest.Mock, T = withTiming as jest.Mock;
beforeEach(() => { setReducedMotionForTests(false); S.mockClear(); T.mockClear(); });

test("opening brings the panel to rest with the sheet spring, once; hidden, nothing animates", async () => {
  const view = await render(<Sheet visible={false} onClose={() => {}} title="Filter"><Text>body</Text></Sheet>);
  expect(S).not.toHaveBeenCalled();
  await view.rerender(<Sheet visible onClose={() => {}} title="Filter"><Text>body</Text></Sheet>);
  expect(S).toHaveBeenCalledTimes(1);
  expect(S).toHaveBeenLastCalledWith(0, theme.motion.sheet);
  await view.rerender(<Sheet visible onClose={() => {}} title="Other"><Text>more</Text></Sheet>);     // a re-render while open
  expect(S).toHaveBeenCalledTimes(1);
  expect(T).not.toHaveBeenCalled();
});

test("with Reduce Motion the panel is placed at once: no spring, no timing", async () => {
  setReducedMotionForTests(true);
  await render(<Sheet visible onClose={() => {}} title="Filter"><Text>body</Text></Sheet>);
  expect(S).not.toHaveBeenCalled();
  expect(T).not.toHaveBeenCalled();
});

test("a short drag springs back with the same spring; a long one closes", async () => {
  const onClose = jest.fn();
  await render(<Sheet visible onClose={onClose} title="Filter"><Text>body</Text></Sheet>);
  S.mockClear();
  const drag = screen.getByTestId("sheet-header").props.gesture.handlers;     // jest.setup's GestureDetector hands the gesture to its child
  drag.onEnd({ translationY: 10, velocityY: 0 });
  expect(S).toHaveBeenCalledTimes(1);
  expect(S).toHaveBeenLastCalledWith(0, theme.motion.sheet);
  expect(onClose).not.toHaveBeenCalled();
  drag.onEnd({ translationY: 300, velocityY: 0 });
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(S).toHaveBeenCalledTimes(1);
});

test("the sheet sits on the bar colour; the header action is a text-only button", async () => {
  await render(<Sheet visible onClose={() => {}} title="Filter" action={{ label: "Apply to all", onPress: () => {} }}><Text>body</Text></Sheet>);
  expect(screen.getByTestId("sheet-panel")).toHaveStyle({ backgroundColor: theme.screen.bar, borderTopLeftRadius: theme.radius.sheet });
  expect(screen.getByRole("header", { name: "Filter" })).toHaveStyle({ fontSize: theme.type.heading });
  expect(screen.getByRole("button", { name: "Apply to all" })).toHaveStyle({ height: theme.size.controlCompact });
});

test("renders title, content and optional action; backdrop closes", async () => {
  const onClose = jest.fn(), onAction = jest.fn();
  await render(<Sheet visible onClose={onClose} title="Filter" action={{ label: "Apply to all", onPress: onAction }}><Text>body</Text></Sheet>);
  expect(screen.getByText("Filter")).toBeTruthy();
  expect(screen.getByText("body")).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: "Apply to all" }));
  expect(onAction).toHaveBeenCalled();
  await fireEvent.press(screen.getByLabelText("Close sheet"));
  expect(onClose).toHaveBeenCalledTimes(1);
});

test("hidden sheet renders nothing", async () => {
  await render(<Sheet visible={false} onClose={() => {}} title="Filter"><Text>body</Text></Sheet>);
  expect(screen.queryByText("body")).toBeNull();
});

test("shouldDismiss: past a quarter of the height or a fast flick", () => {
  expect(shouldDismiss(50, 0, 400)).toBe(false);
  expect(shouldDismiss(101, 0, 400)).toBe(true);
  expect(shouldDismiss(20, 900, 400)).toBe(true);
  expect(shouldDismiss(-30, 900, 400)).toBe(false);
});
