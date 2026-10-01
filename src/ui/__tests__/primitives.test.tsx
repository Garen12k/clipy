import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { Chip } from "../Chip";
import { PrimaryButton } from "../PrimaryButton";
import { ToolButton } from "../ToolButton";
import { ToastHost, useToast } from "../Toast";
import { theme } from "@/src/theme/theme";

test("PrimaryButton calls onPress and respects disabled", async () => {
  const onPress = jest.fn();
  await render(<PrimaryButton title="New Project" onPress={onPress} />);
  await fireEvent.press(screen.getByText("New Project"));
  expect(onPress).toHaveBeenCalledTimes(1);
  await render(<PrimaryButton title="Off" onPress={onPress} disabled />);
  await fireEvent.press(screen.getByText("Off"));
  expect(onPress).toHaveBeenCalledTimes(1);
});

test("ToolButton is dimmed and inert when disabled", async () => {
  const onPress = jest.fn();
  await render(<ToolButton label="Split" icon="cut" onPress={onPress} disabled />);
  const btn = screen.getByRole("button", { name: "Split" });
  expect(btn).toBeDisabled();
  await fireEvent.press(btn);
  expect(onPress).not.toHaveBeenCalled();
});

test("Chip shows selection state", async () => {
  await render(<Chip label="9:16" selected onPress={() => {}} />);
  expect(screen.getByRole("button", { name: "9:16" })).toBeSelected();
});

test("ToastHost shows the latest message", async () => {
  await render(<ToastHost />);
  await act(() => useToast.getState().show("2 of 3 clips added"));
  expect(screen.getByText("2 of 3 clips added")).toBeTruthy();
});

test("theme accent is used by PrimaryButton", async () => {
  await render(<PrimaryButton title="Go" onPress={() => {}} />);
  expect(screen.getByTestId("primary-button")).toHaveStyle({ backgroundColor: theme.colors.accent });
});
