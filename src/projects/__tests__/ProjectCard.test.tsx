import { StyleSheet } from "react-native";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { withDelay, withSpring, withTiming } from "react-native-reanimated";
import { theme } from "@/src/theme/theme";
import { ProjectCard } from "../ProjectCard";

jest.mock("react-native-reanimated", () => {
  const m = require("react-native-reanimated/mock");
  return { ...m, withSpring: jest.fn(m.withSpring), withTiming: jest.fn(m.withTiming), withDelay: jest.fn(m.withDelay) };
});

const summary = { id: "p1", name: "Beach day", durationSec: 21, updatedAt: new Date().toISOString(), thumbUri: null, broken: false, postedTo: [] as ("youtube" | "tiktok")[], coverTitle: "" };

test("shows name, duration badge and edited line; press and long-press work", async () => {
  const onPress = jest.fn(), onLongPress = jest.fn();
  await render(<ProjectCard summary={summary} onPress={onPress} onLongPress={onLongPress} />);
  expect(screen.getByText("Beach day")).toBeTruthy();
  expect(screen.getByText("0:21")).toBeTruthy();
  expect(screen.getByText("Edited today")).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: "Beach day" }));
  await fireEvent(screen.getByRole("button", { name: "Beach day" }), "longPress");
  expect(onPress).toHaveBeenCalled(); expect(onLongPress).toHaveBeenCalled();
});

test("a damaged project has no duration badge", async () => {
  await render(<ProjectCard summary={{ ...summary, durationSec: 0, updatedAt: "", broken: true }} onPress={jest.fn()} onLongPress={jest.fn()} />);
  expect(screen.getByText("Damaged")).toBeTruthy();
  expect(screen.queryByText("0:00")).toBeNull();
});

test("cell is exactly half the row (not flex:1) so an odd last card does not stretch", async () => {
  await render(<ProjectCard summary={summary} onPress={jest.fn()} onLongPress={jest.fn()} />);
  const style = StyleSheet.flatten(screen.getByTestId("project-card-cell").props.style);
  expect(style.width).toBe("50%");
  expect(style.flex).toBeUndefined();
});

test("posted platforms replace the edited line", async () => {
  await render(<ProjectCard summary={{ ...summary, postedTo: ["youtube", "tiktok"] }} onPress={jest.fn()} onLongPress={jest.fn()} />);
  expect(screen.getByText("Posted · YouTube, TikTok")).toBeTruthy();
  expect(screen.queryByText("Edited today")).toBeNull();
});

test("a cover title is drawn on the card; none without one", async () => {
  const { rerender } = await render(<ProjectCard summary={{ ...summary, coverTitle: "Trip" }} onPress={jest.fn()} onLongPress={jest.fn()} />);
  expect(screen.getByTestId("project-cover-title")).toHaveTextContent("Trip");
  await rerender(<ProjectCard summary={summary} onPress={jest.fn()} onLongPress={jest.fn()} />);
  expect(screen.queryByTestId("project-cover-title")).toBeNull();
});

test("a card starts no animation of its own: not on mount, not on a re-render (the list eases in, not the cards)", async () => {
  for (const f of [withTiming, withDelay, withSpring]) (f as jest.Mock).mockClear();
  const view = await render(<ProjectCard summary={summary} onPress={jest.fn()} onLongPress={jest.fn()} />);
  await view.rerender(<ProjectCard summary={{ ...summary, name: "Beach night" }} onPress={jest.fn()} onLongPress={jest.fn()} />);
  for (const f of [withTiming, withDelay, withSpring]) expect(f).not.toHaveBeenCalled();
});

test("round 2 look: softer corners with a hairline; the length and the second line are readable sizes", async () => {
  await render(<ProjectCard summary={summary} onPress={jest.fn()} onLongPress={jest.fn()} />);
  expect(screen.getByRole("button", { name: "Beach day" })).toHaveStyle({ borderRadius: theme.radius.cover, borderWidth: 1, borderColor: theme.colors.hairline, backgroundColor: theme.elevation.tile });
  expect(screen.getByText("0:21")).toHaveStyle({ fontSize: theme.type.small, color: theme.colors.text, fontWeight: theme.weight.semi, fontVariant: ["tabular-nums"] });
  expect(screen.getByText("Edited today")).toHaveStyle({ fontSize: theme.type.small, color: theme.colors.textMuted });
  expect(screen.getByText("Beach day")).toHaveStyle({ fontSize: theme.type.body, fontWeight: theme.weight.semi });
});

test("the second line may wrap to two lines, and the fade is strongest right under the text", async () => {
  await render(<ProjectCard summary={{ ...summary, postedTo: ["youtube", "tiktok"] }} onPress={jest.fn()} onLongPress={jest.fn()} />);
  expect(screen.getByText("Posted · YouTube, TikTok").props.numberOfLines).toBe(2);
  const fade = screen.getByTestId("project-card-fade");
  expect(fade.props.colors).toEqual(["transparent", theme.colors.scrimStrong, theme.colors.scrimStrong]);
  expect(fade.props.locations).toEqual([0, 0.3, 1]);
});

test("a damaged project keeps its red border and red name", async () => {
  await render(<ProjectCard summary={{ ...summary, durationSec: 0, updatedAt: "", broken: true }} onPress={jest.fn()} onLongPress={jest.fn()} />);
  expect(screen.getByRole("button", { name: "Beach day" })).toHaveStyle({ borderWidth: 1.5, borderColor: theme.colors.danger });
  expect(screen.getByText("Beach day")).toHaveStyle({ color: theme.colors.dangerText });
});
