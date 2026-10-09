import { StyleSheet } from "react-native";
import { fireEvent, render, screen, within } from "@testing-library/react-native";
import { withDelay, withSpring, withTiming } from "react-native-reanimated";
import { COVER_FONT } from "@/src/editor/coverFont";
import { theme } from "@/src/theme/theme";
import { ProjectCard } from "../ProjectCard";

jest.mock("react-native-reanimated", () => {
  const m = require("react-native-reanimated/mock");
  return { ...m, withSpring: jest.fn(m.withSpring), withTiming: jest.fn(m.withTiming), withDelay: jest.fn(m.withDelay) };
});

const summary = { id: "p1", name: "Beach day", durationSec: 21, updatedAt: new Date().toISOString(), thumbUri: null, broken: false, postedTo: [] as ("youtube" | "tiktok")[], coverTitle: "" };
const card = (over: Partial<typeof summary> = {}, on: { onPress?: () => void; onLongPress?: () => void; onMore?: () => void } = {}) =>
  <ProjectCard summary={{ ...summary, ...over }} onPress={on.onPress ?? jest.fn()} onLongPress={on.onLongPress ?? jest.fn()} onMore={on.onMore ?? jest.fn()} />;
const damaged = { durationSec: 0, updatedAt: "", broken: true };
const picture = () => screen.getByRole("button", { name: "Beach day" });

test("shows name, duration badge and edited line; press and long-press work", async () => {
  const onPress = jest.fn(), onLongPress = jest.fn();
  await render(card({}, { onPress, onLongPress }));
  expect(screen.getByText("Beach day")).toBeTruthy();
  expect(screen.getByText("0:21")).toBeTruthy();
  expect(screen.getByText("Edited today")).toBeTruthy();
  await fireEvent.press(picture());
  await fireEvent(picture(), "longPress");
  expect(onPress).toHaveBeenCalledTimes(1); expect(onLongPress).toHaveBeenCalledTimes(1);
});

test("the picture is clean: the name and the status are under it, not on it; only the length is on it", async () => {
  await render(card());
  expect(within(picture()).queryByText("Beach day")).toBeNull();
  expect(within(picture()).queryByText("Edited today")).toBeNull();
  expect(within(picture()).getByText("0:21")).toBeTruthy();
  expect(screen.queryByTestId("project-card-fade")).toBeNull();          // no fade without a cover title
  const caption = screen.getByTestId("project-card-caption");
  expect(within(caption).getByText("Beach day")).toBeTruthy();
  expect(within(caption).getByText("Edited today")).toBeTruthy();
});

test("the More button is its own button beside the name: a 44-pt target around a small circle, and it never presses the picture", async () => {
  const onPress = jest.fn(), onLongPress = jest.fn(), onMore = jest.fn();
  await render(card({}, { onPress, onLongPress, onMore }));
  const more = screen.getByRole("button", { name: "More for Beach day" });
  expect(more).toHaveStyle({ width: theme.size.touch, height: theme.size.touch });
  expect(within(picture()).queryByRole("button", { name: "More for Beach day" })).toBeNull();   // a sibling, not nested in the picture
  expect(within(screen.getByTestId("project-card-caption")).getByRole("button", { name: "More for Beach day" })).toBeTruthy();
  expect(within(screen.getByTestId("project-card-words")).queryByRole("button", { name: "More for Beach day" })).toBeNull();
  expect(screen.getByTestId("project-more-circle")).toHaveStyle({ width: theme.size.more, height: theme.size.more, borderRadius: theme.radius.pill, backgroundColor: theme.screen.bar });
  await fireEvent.press(more);
  expect(onMore).toHaveBeenCalledTimes(1);
  expect(onPress).not.toHaveBeenCalled(); expect(onLongPress).not.toHaveBeenCalled();
});

test("the words under the picture open the project too, without being a second button for VoiceOver", async () => {
  const onPress = jest.fn(), onLongPress = jest.fn(), onMore = jest.fn();
  await render(card({}, { onPress, onLongPress, onMore }));
  await fireEvent.press(screen.getByText("Beach day"));
  await fireEvent(screen.getByText("Edited today"), "longPress");
  expect(onPress).toHaveBeenCalledTimes(1); expect(onLongPress).toHaveBeenCalledTimes(1); expect(onMore).not.toHaveBeenCalled();
  expect(screen.getAllByRole("button")).toHaveLength(2);                 // the picture and More
  expect(screen.getByTestId("project-card-words").props.accessible).toBe(false);
});

test("a damaged project has no duration badge: a warning and Damaged on the picture instead", async () => {
  await render(card(damaged));
  expect(within(picture()).getByText("Damaged")).toHaveStyle({ color: theme.screen.dangerText, fontWeight: theme.weight.semi });
  expect(within(picture()).getByTestId("project-damaged")).toBeTruthy();
  expect(screen.queryByTestId("project-length")).toBeNull();
  expect(screen.queryByText("0:00")).toBeNull();
  expect(screen.getByRole("button", { name: "More for Beach day" })).toBeTruthy();
});

test("cell is exactly half the row (not flex:1) so an odd last card does not stretch", async () => {
  await render(card());
  const style = StyleSheet.flatten(screen.getByTestId("project-card-cell").props.style);
  expect(style.width).toBe("50%");
  expect(style.flex).toBeUndefined();
});

test("posted platforms replace the edited line", async () => {
  await render(card({ postedTo: ["youtube", "tiktok"] }));
  expect(screen.getByText("Posted · YouTube, TikTok")).toBeTruthy();
  expect(screen.queryByText("Edited today")).toBeNull();
});

test("a cover title is drawn on the picture, at the bottom over a dark fade, in the cover's own font; none without one", async () => {
  const { rerender } = await render(card({ coverTitle: "Trip" }));
  const title = screen.getByTestId("project-cover-title");
  expect(title).toHaveTextContent("Trip");
  expect(title).toHaveStyle({ fontFamily: COVER_FONT, color: theme.colors.text });
  const fade = within(picture()).getByTestId("project-card-fade");
  expect(within(fade).getByTestId("project-cover-title")).toBeTruthy();
  expect(fade.props.colors).toEqual(["transparent", theme.colors.scrimStrong]);
  expect(fade).toHaveStyle({ position: "absolute", bottom: 0, left: 0, right: 0 });
  await rerender(card());
  expect(screen.queryByTestId("project-cover-title")).toBeNull();
});

test("a card starts no animation of its own: not on mount, not on a re-render (the list eases in, not the cards)", async () => {
  for (const f of [withTiming, withDelay, withSpring]) (f as jest.Mock).mockClear();
  const view = await render(card());
  await view.rerender(card({ name: "Beach night" }));
  for (const f of [withTiming, withDelay, withSpring]) expect(f).not.toHaveBeenCalled();
});

test("the new look: a 3:4 picture with the cover radius and no border; the length is a solid dark pill with tabular digits", async () => {
  await render(card());
  expect(picture()).toHaveStyle({ aspectRatio: 3 / 4, borderRadius: theme.radius.cover, borderWidth: 0, backgroundColor: theme.screen.tile, overflow: "hidden" });
  expect(theme.radius.cover).toBe(20);
  expect(screen.getByText("0:21")).toHaveStyle({ fontSize: theme.type.small, color: theme.colors.text, fontWeight: theme.weight.semi, fontVariant: ["tabular-nums"] });
  expect(screen.getByTestId("project-length")).toHaveStyle({ height: theme.size.badge, borderRadius: theme.radius.pill, backgroundColor: theme.colors.scrimStrong, top: theme.space.sm, right: theme.space.sm });
  expect(screen.getByText("Edited today")).toHaveStyle({ fontSize: theme.type.label, color: theme.screen.muted });
  expect(screen.getByText("Beach day")).toHaveStyle({ fontSize: theme.type.body, fontWeight: theme.weight.semi, color: theme.colors.text });
});

test("rows line up: the name is one line, the status at most two, and the words keep room for all three whatever they hold", async () => {
  await render(card({ name: "A very long project name that cannot fit beside the More button", postedTo: ["youtube", "tiktok"] }));
  expect(screen.getByText(/^A very long/).props.numberOfLines).toBe(1);
  expect(screen.getByText("Posted · YouTube, TikTok").props.numberOfLines).toBe(2);
  const room = theme.space.sm + theme.text.subhead.leading + 2 * theme.text.footnote.leading;
  expect(screen.getByTestId("project-card-caption")).toHaveStyle({ minHeight: room, flexDirection: "row", alignItems: "flex-start" });
  expect(screen.getByText(/^A very long/)).toHaveStyle({ lineHeight: theme.text.subhead.leading });
  expect(screen.getByText("Posted · YouTube, TikTok")).toHaveStyle({ lineHeight: theme.text.footnote.leading });
});

test("a damaged project has a red border and a red name", async () => {
  await render(card(damaged));
  expect(picture()).toHaveStyle({ borderWidth: 2, borderColor: theme.colors.danger });
  expect(within(screen.getByTestId("project-card-caption")).getByText("Beach day")).toHaveStyle({ color: theme.screen.dangerText });
});
