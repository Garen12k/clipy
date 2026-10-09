import { act, fireEvent, render, screen, within } from "@testing-library/react-native";
jest.mock("@/src/lib/id", () => { let n = 0; return { newId: () => `copy${++n}` }; });
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-04T10:00:00.000Z" }));
jest.mock("@/src/editor/components/thumbnails", () => ({ getThumb: jest.fn(async () => "file:///thumb.jpg") }));
import * as Haptics from "expo-haptics";
import { makeAudioTrack, makeClip, makeEffect, makePhotoClip, makeProject } from "@/src/editor/model/types";
import { Text } from "react-native";
import { useEditorStore } from "@/src/editor/store";
import { theme } from "@/src/theme/theme";
import { TOOLBAR } from "@/src/ui/ToolButton";
import { BAR_HEIGHT, STRIP, ToolStrip } from "@/src/ui/ToolStrip";
import { MULTI_BAR_HEIGHT, MultiSelectBar } from "../components/MultiSelectBar";
import { LANE_GAP, LANE_HEIGHT } from "../timelineLayout";

const st = () => useEditorStore.getState();
const clips = () => st().project!.clips;
const past = () => st().past.length;
const btn = (name: string) => screen.getByRole("button", { name });
const press = (name: string) => fireEvent.press(btn(name));
const header = (name: string) => screen.getByRole("header", { name });
const impact = Haptics.impactAsync as jest.Mock;
const drag = async (testID: string, ...values: number[]) => {
  const slider = screen.getByTestId(testID);
  await fireEvent(slider, "slidingStart");
  for (const v of values) await fireEvent(slider, "valueChange", v);
};
/** The bar with the store in the mode and these clips chosen. */
const renderWith = async (...ids: string[]) => {
  st().enterMultiSelect();
  for (const id of ids) st().toggleMultiSelect(id);
  await render(<MultiSelectBar />);
};

beforeEach(() => {
  impact.mockClear();
  st().reset();
  st().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 4 }), makeClip({ id: "b", sourceDuration: 6 }), makePhotoClip({ id: "c" })] }));
});

test("renders nothing outside the mode", async () => {
  await render(<MultiSelectBar />);
  expect(screen.queryByRole("header")).toBeNull();
  expect(screen.queryByRole("button", { name: "Done" })).toBeNull();
});

test("nothing selected: the clip actions are disabled; Select all and Done are enabled", async () => {
  await renderWith();
  expect(header("0 selected")).toBeTruthy();
  for (const l of ["Delete", "Duplicate", "Filter", "Speed", "Volume"]) expect(btn(l)).toBeDisabled();
  for (const l of ["Select all", "Done"]) expect(btn(l)).toBeEnabled();
  // Done at the leading end, right after the count; the actions scroll; Delete is pinned alone at the trailing end.
  expect(screen.getAllByRole("button").map((b) => b.props.accessibilityLabel)).toEqual(["Done", "Speed", "Volume", "Filter", "Duplicate", "Select all", "Delete"]);
});

test("Select all chooses every clip", async () => {
  await renderWith();
  await press("Select all");
  expect(header("3 selected")).toBeTruthy();
  expect(st().multiSelect).toEqual(["a", "b", "c"]);
  for (const l of ["Delete", "Duplicate", "Filter", "Speed", "Volume"]) expect(btn(l)).toBeEnabled();
});

test("Delete removes the chosen clips in one undo step with a medium haptic and ends the mode", async () => {
  await renderWith("a", "c");
  expect(header("2 selected")).toBeTruthy();
  await press("Delete");
  expect(clips().map((c) => c.id)).toEqual(["b"]);
  expect(past()).toBe(1);
  expect(st().multiSelect).toBeNull();
  expect(impact).toHaveBeenCalledTimes(1);
  expect(impact).toHaveBeenCalledWith("medium");
  expect(screen.queryByRole("header")).toBeNull();
});

test("Duplicate puts each copy right after its original in one undo step and keeps the originals chosen", async () => {
  await renderWith("b", "a");
  await press("Duplicate");
  expect(clips().map((c) => c.id)).toEqual(["a", "copy1", "b", "copy2", "c"]);
  expect(past()).toBe(1);
  expect(st().multiSelect).toEqual(["b", "a"]);
  expect(header("2 selected")).toBeTruthy();
  expect(impact).toHaveBeenCalledWith("light");
});

test("only the photo selected: Speed and Volume are disabled, Filter is enabled", async () => {
  await renderWith("c");
  expect(btn("Speed")).toBeDisabled();
  expect(btn("Volume")).toBeDisabled();
  for (const l of ["Delete", "Duplicate", "Filter"]) expect(btn(l)).toBeEnabled();
});

test("Filter: a tile and the strength slider write every chosen clip, one undo step each; no Apply to all", async () => {
  await renderWith("a", "c");
  expect(screen.queryByRole("header", { name: "Filter · 2 clips" })).toBeNull();
  await press("Filter");
  expect(header("Filter · 2 clips")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Apply to All Clips" })).toBeNull();
  await press("Warm");
  expect(clips().map((c) => c.filter)).toEqual(["warm", null, "warm"]);
  expect(past()).toBe(1);
  await drag("filter-strength", 0.5, 0.4);
  expect(clips().map((c) => c.filterIntensity)).toEqual([0.4, 1, 0.4]);
  expect(past()).toBe(2);
  expect(st().multiSelect).toEqual(["a", "c"]);
});

test("Speed: a chip sets the speed of every chosen video clip in one undo step; the photo is skipped", async () => {
  await renderWith("c", "b", "a");
  const photo = clips()[2];
  await press("Speed");
  expect(header("Speed · 3 clips")).toBeTruthy();
  expect(screen.getByText("Clip length 4.0 s")).toBeTruthy();   // the first chosen video clip, in timeline order
  await press("2×");
  expect(clips().map((c) => c.speed)).toEqual([2, 2, 1]);
  expect(clips()[2]).toBe(photo);
  expect(past()).toBe(1);
});

test("Speed and Volume show the first chosen VIDEO clip when a photo comes first", async () => {
  st().setProject(makeProject({ clips: [makePhotoClip({ id: "c" }), makeClip({ id: "b", sourceDuration: 6 })] }));
  await renderWith("c", "b");
  await press("Speed");
  expect(screen.getByText("Clip length 6.0 s")).toBeTruthy();
});

test("Volume: the slider and Mute write every chosen clip, one undo step each; no fade sliders", async () => {
  await renderWith("a", "b");
  const photo = clips()[2];
  await press("Volume");
  expect(header("Volume · 2 clips")).toBeTruthy();
  expect(screen.queryByTestId("fade-in")).toBeNull();
  await drag("volume-slider", 0.7, 0.5);
  expect(clips().map((c) => c.volume)).toEqual([0.5, 0.5, 1]);
  expect(past()).toBe(1);
  await fireEvent(screen.getByLabelText("Mute"), "valueChange", true);
  expect(clips().slice(0, 2).map((c) => c.muted)).toEqual([true, true]);
  expect(clips()[2]).toBe(photo);                               // not chosen: untouched
  expect(past()).toBe(2);
});

test("Done leaves the mode", async () => {
  await renderWith("a");
  await press("Done");
  expect(st().multiSelect).toBeNull();
  expect(past()).toBe(0);
});

test("Volume ignores reversed clips (their sound is never played): only reversed chosen → disabled", async () => {
  st().setProject(makeProject({ clips: [makeClip({ id: "r", sourceDuration: 4, reversed: true, volume: 0.3 }), makeClip({ id: "n", sourceDuration: 6, volume: 0.8 })] }));
  await renderWith("r");
  expect(btn("Volume")).toBeDisabled();
  expect(btn("Speed")).toBeEnabled();
});

test("Volume: reversed + normal chosen → enabled, and the sheet shows the normal clip's volume", async () => {
  st().setProject(makeProject({ clips: [makeClip({ id: "r", sourceDuration: 4, reversed: true, volume: 0.3 }), makeClip({ id: "n", sourceDuration: 6, volume: 0.8 })] }));
  await renderWith("r", "n");
  expect(btn("Volume")).toBeEnabled();
  await press("Volume");
  expect(screen.getByText("80%")).toBeTruthy();
});

test("the bar has an explicit height; while a strip shows it hides its buttons and lifts by the difference", async () => {
  // Two lanes under the clips: room for the whole rise.
  st().setProject({ ...st().project!, audioTracks: [makeAudioTrack({ id: "m", sourceDuration: 5 })], effects: [makeEffect({ id: "e1", start: 0, end: 1 })] });
  st().enterMultiSelect(); st().toggleMultiSelect("a");
  const view = await render(<><MultiSelectBar /><ToolStrip visible={false} onClose={() => {}} title="X"><Text>x</Text></ToolStrip></>);
  expect(MULTI_BAR_HEIGHT).toBe(BAR_HEIGHT);                  // the toolbar's own height: entering the mode moves nothing
  expect(screen.getByTestId("multi-select-bar")).toHaveStyle({ height: BAR_HEIGHT + 8, marginTop: 0 });
  expect(header("1 selected")).toBeTruthy();
  await view.rerender(<><MultiSelectBar /><ToolStrip visible onClose={() => {}} title="X"><Text>x</Text></ToolStrip></>);
  expect(screen.getByTestId("multi-select-bar")).toHaveStyle({ height: STRIP.height + 8, marginTop: -STRIP.lift });
  expect(screen.queryByRole("header", { name: "1 selected" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Select all" })).toBeNull();
});

test("the lift never reaches over the clip area: none without lanes, one lane's height with one", async () => {
  st().enterMultiSelect(); st().toggleMultiSelect("a");
  await render(<><MultiSelectBar /><ToolStrip visible onClose={() => {}} title="X"><Text>x</Text></ToolStrip></>);
  expect(screen.getByTestId("multi-select-bar")).toHaveStyle({ height: STRIP.height + 8, marginTop: 0 });
  await act(() => { st().apply((p) => ({ ...p, effects: [makeEffect({ id: "e1", start: 0, end: 1 })] })); });
  expect(screen.getByTestId("multi-select-bar")).toHaveStyle({ height: STRIP.height + 8, marginTop: -(LANE_HEIGHT + LANE_GAP) });
});

test("a strip whose clip vanishes closes and does not reopen by itself later", async () => {
  await renderWith("a", "b");
  await press("Speed");
  expect(header("Speed · 2 clips")).toBeTruthy();
  // The selection changes under the strip: only the photo is left, so Speed has no clip to show.
  await act(async () => { st().toggleMultiSelect("a"); st().toggleMultiSelect("b"); st().toggleMultiSelect("c"); });
  expect(screen.queryByRole("header", { name: /Speed/ })).toBeNull();
  await act(async () => { st().toggleMultiSelect("a"); });
  expect(screen.queryByRole("header", { name: /Speed/ })).toBeNull();
  expect(btn("Speed")).toBeEnabled();
});

test("the same capsule as the toolbar: the count is a small capsule with a check at the leading end, and it is still the bar's header", async () => {
  await renderWith("a", "b", "c");
  expect(screen.getByTestId("multi-select-bar")).toHaveStyle({ backgroundColor: theme.elevation.page, height: BAR_HEIGHT + 8 });
  const capsule = screen.getByTestId("multi-row");
  expect(capsule).toHaveStyle({ height: TOOLBAR.height, borderRadius: theme.radius.pill, backgroundColor: theme.elevation.bar, marginHorizontal: theme.space.xs, flexDirection: "row" });
  const count = screen.getByTestId("multi-count");
  expect(capsule.props.children[0].props.testID).toBe("multi-count");                    // first in the row
  expect(count).toHaveStyle({ height: theme.size.touch, borderRadius: theme.radius.pill, backgroundColor: theme.elevation.tile });
  expect(within(count).getByRole("header", { name: "3 selected" })).toBeTruthy();
  expect(within(count).getByText("3 selected")).toHaveStyle({ fontWeight: theme.weight.semi, color: theme.colors.text });
  expect(count.props.children[0].props.name).toBe("checkmark-circle-outline");
});

test("Done and Delete are never neighbours: Done right after the count at the leading end, Delete alone after the separator at the trailing end", async () => {
  await renderWith("a", "b");
  const kids = (screen.getByTestId("multi-row").props.children as { props: { testID?: string; label?: string } }[]).map((k) => k.props.testID ?? k.props.label ?? "separator");
  expect(kids).toEqual(["multi-count", "Done", "multi-scroll", "separator", "Delete"]);
  expect(screen.getAllByTestId("toolbar-separator")).toHaveLength(1);
  const order = screen.getAllByRole("button").map((b) => b.props.accessibilityLabel as string);
  expect(order[0]).toBe("Done");
  expect(order[order.length - 1]).toBe("Delete");
  expect(Math.abs(order.indexOf("Done") - order.indexOf("Delete"))).toBe(order.length - 1);   // the whole row between them
  // What they do is what they did.
  await press("Done");
  expect(st().multiSelect).toBeNull();
  expect(clips().map((c) => c.id)).toEqual(["a", "b", "c"]);
  expect(past()).toBe(0);
});

test("Done and Delete are pinned outside the scrolling actions, so both are in view on a 375-pt screen", async () => {
  await renderWith("a");
  const inScroll = within(screen.getByTestId("multi-scroll")).getAllByRole("button").map((b) => b.props.accessibilityLabel);
  expect(inScroll).toEqual(["Speed", "Volume", "Filter", "Duplicate", "Select all"]);
  const capsule = within(screen.getByTestId("multi-row"));
  for (const l of ["Delete", "Done"]) {
    expect(capsule.getByRole("button", { name: l })).toBeTruthy();
    expect(within(screen.getByTestId("multi-scroll")).queryByRole("button", { name: l })).toBeNull();
  }
  expect(screen.getAllByRole("button").map((b) => b.props.accessibilityLabel).slice(-2)).toEqual(["Select all", "Delete"]);
  expect(screen.getByTestId("toolbar-separator")).toBeTruthy();
  expect(screen.getByText("Delete")).toHaveStyle({ color: theme.colors.dangerText });
  expect(screen.getByText("Done")).toHaveStyle({ color: theme.colors.text });
  // The pinned parts are a tool's smallest width each; the scrolling part takes what is left (`flex: 1`), so however wide the count
  // grows, it is the actions that scroll — never Delete or Done that leave the screen. At 375 pt beside "3 selected": 140 pt, two
  // actions whole and 44 of the third's 48 (the separator's clear side took 4 pt; the third already ended under the 16-pt fade).
  expect(btn("Done")).toHaveStyle({ minWidth: theme.size.control });
  expect(btn("Delete")).toHaveStyle({ minWidth: theme.size.control });
  expect(screen.getByTestId("multi-scroll").parent).toHaveStyle({ flex: 1 });
  const inside = 375 - 4 * theme.space.xs, pinned = 2 * theme.size.control + 1 + theme.space.xs, gaps = 4 * theme.space.xs, count = 102;
  expect(inside - count - pinned - gaps).toBe(140);
  expect(140 - 2 * theme.size.control).toBe(44);
});
