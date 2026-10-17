import { fireEvent, render, screen, within } from "@testing-library/react-native";
import { theme } from "@/src/theme/theme";
import { SortSheet } from "../SortSheet";

test("Sort by: the four rows in order, only the picked one ticked — by the mark, not by colour alone; any row picks", async () => {
  const onPick = jest.fn();
  await render(<SortSheet visible sort="length" onPick={onPick} onClose={jest.fn()} />);
  expect(screen.getByRole("header", { name: "Sort by" })).toBeTruthy();
  expect(["sort-edited", "sort-created", "sort-name", "sort-length"].map((id) => screen.getByTestId(id).props.accessibilityLabel)).toEqual(["Last edited", "Date created", "Name", "Length"]);
  expect(screen.getAllByTestId("sort-check")).toHaveLength(1);
  expect(within(screen.getByTestId("sort-length")).getByTestId("sort-check")).toBeTruthy();
  expect(screen.getByTestId("sort-length").props.accessibilityState).toMatchObject({ selected: true });
  expect(screen.getByTestId("sort-edited").props.accessibilityState).toMatchObject({ selected: false });
  expect(screen.getByTestId("sort-edited")).toHaveStyle({ minHeight: theme.size.row });
  await fireEvent.press(screen.getByTestId("sort-name"));
  expect(onPick).toHaveBeenCalledWith("name");
  await fireEvent.press(screen.getByTestId("sort-length"));
  expect(onPick).toHaveBeenLastCalledWith("length");
});
