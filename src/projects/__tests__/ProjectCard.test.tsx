import { StyleSheet } from "react-native";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { ProjectCard } from "../ProjectCard";

const summary = { id: "p1", name: "Beach day", durationSec: 21, updatedAt: new Date().toISOString(), thumbUri: null, broken: false, postedTo: [] as ("youtube" | "tiktok")[], coverTitle: "" };

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

test("a damaged project has no duration badge", async () => {
  await render(<ProjectCard summary={{ ...summary, durationSec: 0, updatedAt: "", broken: true }} index={0} onPress={jest.fn()} onLongPress={jest.fn()} />);
  expect(screen.getByText("Damaged")).toBeTruthy();
  expect(screen.queryByText("0:00")).toBeNull();
});

test("cell is exactly half the row (not flex:1) so an odd last card does not stretch", async () => {
  await render(<ProjectCard summary={summary} index={0} onPress={jest.fn()} onLongPress={jest.fn()} />);
  const style = StyleSheet.flatten(screen.getByTestId("project-card-cell").props.style);
  expect(style.width).toBe("50%");
  expect(style.flex).toBeUndefined();
});

test("posted platforms replace the edited line", async () => {
  await render(<ProjectCard summary={{ ...summary, postedTo: ["youtube", "tiktok"] }} index={0} onPress={jest.fn()} onLongPress={jest.fn()} />);
  expect(screen.getByText("Posted · YouTube, TikTok")).toBeTruthy();
  expect(screen.queryByText("Edited today")).toBeNull();
});

test("a cover title is drawn on the card; none without one", async () => {
  const { rerender } = await render(<ProjectCard summary={{ ...summary, coverTitle: "Trip" }} index={0} onPress={jest.fn()} onLongPress={jest.fn()} />);
  expect(screen.getByTestId("project-cover-title")).toHaveTextContent("Trip");
  await rerender(<ProjectCard summary={summary} index={0} onPress={jest.fn()} onLongPress={jest.fn()} />);
  expect(screen.queryByTestId("project-cover-title")).toBeNull();
});
