import { fireEvent, render, screen } from "@testing-library/react-native";
import { Text } from "react-native";
import { withSpring, withTiming } from "react-native-reanimated";
import { settle, Sheet, shouldDismiss } from "../Sheet";

jest.mock("react-native-reanimated", () => {
  const m = require("react-native-reanimated/mock");
  return { ...m, withSpring: jest.fn(m.withSpring), withTiming: jest.fn(m.withTiming) };
});

test("settle (open and cancelled-drag snap-back): spring normally, timing without spring under Reduce Motion", () => {
  (withSpring as jest.Mock).mockClear(); (withTiming as jest.Mock).mockClear();
  settle(false);
  expect(withSpring).toHaveBeenCalledTimes(1);
  expect(withTiming).not.toHaveBeenCalled();
  (withSpring as jest.Mock).mockClear();
  settle(true);
  expect(withTiming).toHaveBeenCalledTimes(1);
  expect(withSpring).not.toHaveBeenCalled();
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
