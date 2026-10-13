import { fireEvent, render, screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import { theme } from "@/src/theme/theme";
import { leftovers, wear } from "@/src/ui/testing/appearance";
import { TransferCard } from "../TransferCard";

const flat = (id: string) => StyleSheet.flatten(screen.getByTestId(id).props.style);

test("saving: the title, the name with the size, a bar at its percent, Cancel — on the screen family's own colours", async () => {
  const onCancel = jest.fn();
  await render(<TransferCard transfer={{ kind: "save", name: "Beach trip", bytes: 2.1e9, done: 0.525e9 }} onCancel={onCancel} />);
  expect(screen.getByText("Saving a copy")).toBeTruthy();
  expect(screen.getByText("Beach trip · 2.1 GB")).toBeTruthy();
  expect(flat("home-transfer")).toMatchObject({ backgroundColor: theme.screen.bar, borderRadius: theme.radius.card });
  expect(screen.getByTestId("home-transfer-bar")).toHaveProp("accessibilityValue", { min: 0, max: 100, now: 25 });
  expect(flat("home-transfer-bar")).toMatchObject({ height: theme.space.xs, backgroundColor: theme.screen.tile });
  expect(flat("home-transfer-fill")).toMatchObject({ width: "25%", backgroundColor: theme.screen.accentInk });
  await fireEvent.press(screen.getByRole("button", { name: "Cancel" }));
  expect(onCancel).toHaveBeenCalledTimes(1);
  expect(screen.queryAllByTestId("primary-button")).toHaveLength(0);
});
test("opening, before the file has said what it is: the title alone, the bar at 0; a small project shows no size", async () => {
  const view = await render(<TransferCard transfer={{ kind: "open", name: "", bytes: 0, done: 0 }} onCancel={jest.fn()} />);
  expect(screen.getByText("Opening project file")).toBeTruthy();
  expect(flat("home-transfer-fill").width).toBe("0%");
  await view.rerender(<TransferCard transfer={{ kind: "open", name: "Beach", bytes: 4000, done: 4000 }} onCancel={jest.fn()} />);
  expect(screen.getByText("Beach")).toBeTruthy();
  expect(flat("home-transfer-fill").width).toBe("100%");
});
test("the bar never leaves 0 … 100, whatever the numbers say", async () => {
  const view = await render(<TransferCard transfer={{ kind: "save", name: "Beach", bytes: 1000, done: 5000 }} onCancel={jest.fn()} />);
  expect(screen.getByTestId("home-transfer-bar")).toHaveProp("accessibilityValue", { min: 0, max: 100, now: 100 });
  await view.rerender(<TransferCard transfer={{ kind: "save", name: "Beach", bytes: 1000, done: -5 }} onCancel={jest.fn()} />);
  expect(flat("home-transfer-fill").width).toBe("0%");
});
describe("in light", () => {
  afterEach(() => wear("dark"));
  test("cream card, deep-gold fill, nothing navy left", async () => {
    wear("light");
    await render(<TransferCard transfer={{ kind: "save", name: "Beach", bytes: 5e6, done: 1e6 }} onCancel={jest.fn()} />);
    expect(flat("home-transfer")).toMatchObject({ backgroundColor: theme.screens.light.bar });
    expect(flat("home-transfer-fill")).toMatchObject({ backgroundColor: theme.screens.light.accentInk });
    expect(leftovers()).toEqual([]);
  });
});
