import { fireEvent, render, screen } from "@testing-library/react-native";
import { ProjectCard } from "../ProjectCard";

const summary = { id: "p1", name: "Beach day", durationSec: 21, updatedAt: new Date().toISOString(), thumbUri: null, broken: false };

test("shows name, duration badge and edited line; press and long-press work", async () => {
  const onPress = jest.fn(), onLongPress = jest.fn();
  await render(<ProjectCard summary={summary} index={0} onPress={onPress} onLongPress={onLongPress} />);
  expect(screen.getByText("Beach day")).toBeTruthy();
  expect(screen.getByText("0:21")).toBeTruthy();
  expect(screen.getByText("Edited today")).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: "Beach day" }));
  await fireEvent(screen.getByRole("button", { name: "Beach day" }), "longPress");
  expect(onPress).toHaveBeenCalled(); expect(onLongPress).toHaveBeenCalled();
});
