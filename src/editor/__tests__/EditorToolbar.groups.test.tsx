import { act, fireEvent, render, screen, within } from "@testing-library/react-native";
jest.mock("@/src/lib/id", () => ({ newId: () => "dup" }));
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-09T10:00:00.000Z" }));
jest.mock("@/src/projects/pickMedia", () => ({ pickMedia: jest.fn() }));
jest.mock("@/src/projects", () => ({ storage: { importMedia: jest.fn(), saveStill: jest.fn() } }));
jest.mock("expo-video-thumbnails", () => ({ getThumbnailAsync: jest.fn(async () => ({ uri: "file:///thumb.jpg" })) }));
import { makeAudioTrack, makeClip, makeEffect, makeLayer, makeOverlay, makePhotoClip, makeProject, makeSticker } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { PALETTES, theme } from "@/src/theme/theme";
import { TOOLBAR } from "@/src/ui/ToolButton";
import { BAR_HEIGHT } from "@/src/ui/ToolStrip";
import { EditorToolbar } from "../components/EditorToolbar";
import { currentGroup, groupNames, scrolled, showGroup, toolsByGroup } from "../testing/toolbar";
import { closeStrip, useToolStrip } from "../toolStrip";

const st = () => useEditorStore.getState();
const btn = (name: string) => screen.getByRole("button", { name });
const row = () => screen.getAllByRole("button").map((b) => b.props.accessibilityLabel as string);
const BACK = "Back to main tools";
const BASICS = ["Split", "Trim", "Select", "Speed", "Volume", "Filter", "Cut out", "Stabilize"];
const layoutOf = (testID: string, width: number) => fireEvent(screen.getByTestId(testID), "layout", { nativeEvent: { layout: { x: 0, y: 0, width, height: TOOLBAR.tool } } });

beforeEach(() => {
  closeStrip();
  st().reset();
  st().setProject(makeProject({
    clips: [makeClip({ id: "a", sourceDuration: 4 }), makeClip({ id: "b", sourceDuration: 4 }), makePhotoClip({ id: "p" })],
    layers: [makeLayer({ id: "L", sourceDuration: 2, start: 1 })],
    overlays: [makeOverlay({ id: "t1", start: 1, end: 3 }), makeSticker({ id: "s1", start: 1, end: 3 }), makeOverlay({ id: "c1", kind: "caption", start: 1, end: 3 })],
    effects: [makeEffect({ id: "e1", type: "glow", start: 1, end: 3 })],
    audioTracks: [makeAudioTrack({ id: "m1", sourceDuration: 5 })],
  }));
});

test("a selected video clip: Back, the group button on Basics, Basics' tools, and Delete — nothing else", async () => {
  await render(<EditorToolbar />);
  await act(() => { st().select("a"); });
  expect(row()).toEqual([BACK, "Tool groups, Basics", ...BASICS, "Delete"]);
  expect(scrolled()).toEqual(BASICS);
  // The most used tools are one tap away, as they were: Select is the third tool.
  await fireEvent.press(btn("Select"));
  expect(st().multiSelect).toEqual(["a"]);
});

test("the group button swaps the row for the chooser, in place; a group swaps it back to that group's tools", async () => {
  await render(<EditorToolbar />);
  await act(() => { st().select("a"); });
  await fireEvent.press(btn("Tool groups, Basics"));
  // The chooser: Back, one button per group, Delete — the group button itself gives its place.
  expect(row()).toEqual([BACK, "Basics", "Edit", "Audio", "Look", "Frame", "Delete"]);
  expect(btn("Basics")).toBeSelected();                                   // the current one is marked
  for (const g of ["Edit", "Audio", "Look", "Frame"]) expect(btn(g)).not.toBeSelected();
  await fireEvent.press(btn("Look"));
  expect(row()).toEqual([BACK, "Tool groups, Look", "Animate", "Adjust", "Templates", "Delete"]);
  // Choosing the group that already shows simply goes back to it.
  await fireEvent.press(btn("Tool groups, Look"));
  expect(btn("Look")).toBeSelected();
  await fireEvent.press(btn("Look"));
  expect(currentGroup()).toBe("Look");
  // A tool in another group is two taps, and does what it always did.
  await fireEvent.press(btn("Adjust"));
  expect(useToolStrip.getState().open).toEqual({ id: "adjust", key: "clip:a" });
  expect(st().past).toHaveLength(0);                                      // choosing a group is not an edit
});

test("it all happens inside the bar: no menu, no sheet, no modal — and the bottom area does not change", async () => {
  await render(<EditorToolbar />);
  await act(() => { st().select("a"); });
  const area = screen.getByTestId("editor-toolbar"), capsule = screen.getByTestId("toolbar-row");
  await fireEvent.press(btn("Tool groups, Basics"));
  expect(screen.getByTestId("editor-toolbar")).toBe(area);
  expect(screen.getByTestId("toolbar-row")).toBe(capsule);
  expect(within(capsule).getByRole("button", { name: "Frame" })).toBeTruthy();
  expect(screen.queryByTestId("modal")).toBeNull();
  expect(screen.queryByTestId("tool-strip")).toBeNull();
  expect(screen.queryByTestId("tool-panel")).toBeNull();
  expect(useToolStrip.getState().open).toBeNull();
  expect(area).toHaveStyle({ height: BAR_HEIGHT + 8, marginTop: 0 });
});

test("a NEW selection starts at the first group; the same selection keeps its group while its tools change", async () => {
  await render(<EditorToolbar />);
  await act(() => { st().select("a"); });
  await showGroup("Frame");
  // The same clip, other tools (the playhead moves, a strip opens and closes, the clip is edited): still Frame.
  await act(() => { st().seek(1); });
  expect(currentGroup()).toBe("Frame");
  await fireEvent.press(btn("Opacity"));
  await fireEvent.press(btn("Done"));
  expect(currentGroup()).toBe("Frame");
  await act(() => { st().apply((p) => ({ ...p, clips: p.clips.map((c) => (c.id === "a" ? { ...c, cutout: true as const } : c)) })); });
  expect(currentGroup()).toBe("Frame");
  // Another clip, another kind, and back again: Basics each time.
  await act(() => { st().select("b"); });
  expect(currentGroup()).toBe("Basics");
  await showGroup("Edit");
  await act(() => { st().select("L"); });
  expect(currentGroup()).toBe("Basics");
  await showGroup("Frame");
  await act(() => { st().selectOverlay("t1"); });
  await act(() => { st().select("L"); });
  expect(currentGroup()).toBe("Basics");
  // The chooser does not survive a new selection either.
  await fireEvent.press(btn("Tool groups, Basics"));
  expect(currentGroup()).toBeNull();
  await act(() => { st().select("a"); });
  expect(row().slice(0, 3)).toEqual([BACK, "Tool groups, Basics", "Split"]);
});

test("an empty group is not offered, and a group that empties under the row gives way to the first one", async () => {
  await render(<EditorToolbar />);
  await act(() => { st().select("p"); });                                  // a photo has no sound
  expect(await groupNames()).toEqual(["Basics", "Edit", "Look", "Frame"]);
  expect((await toolsByGroup()).Look).toEqual(["Animate", "Motion", "Adjust", "Templates"]);
  await act(() => { st().select("a"); });
  expect(await groupNames()).toEqual(["Basics", "Edit", "Audio", "Look", "Frame"]);
  await showGroup("Audio");
  expect(scrolled()).toEqual(["Extract audio", "Voice", "Sound"]);
  await act(() => { st().apply((p) => ({ ...p, clips: p.clips.map((c) => (c.id === "a" ? { ...c, reversed: true } : c)) })); });   // reversed: no sound tools
  expect(currentGroup()).toBe("Basics");
  expect(await groupNames()).toEqual(["Basics", "Edit", "Look", "Frame"]);
});

test("flat bars have no group button: the main bar, the sections, a text, a caption, a sticker, a sound (its own order), an effect", async () => {
  await render(<EditorToolbar />);
  const flat = (labels: string[]) => { expect(screen.queryByTestId("toolbar-group")).toBeNull(); expect(row()).toEqual(labels); };
  // The main bar: thirteen tools in one scrolling row, as it was — no Back, no groups, no Delete.
  flat(["Edit", "Audio", "Text", "Stickers", "Overlay", "Collage", "Effects", "Filter", "Adjust", "Ratio", "Background", "Cover", "Templates"]);
  expect(scrolled()).toHaveLength(13);
  await fireEvent.press(btn("Audio"));
  flat([BACK, "Add audio", "Ducking", "Beats"]);
  await fireEvent.press(btn(BACK));
  await fireEvent.press(btn("Text"));
  flat([BACK, "Add text", "Captions"]);
  await act(() => { st().selectOverlay("t1"); });
  flat([BACK, "Edit", "Animate", "Keyframe", "Duplicate", "Add text", "Delete"]);
  await act(() => { st().selectOverlay("c1"); });
  flat([BACK, "Edit", "Captions", "Duplicate", "Add text", "Delete"]);
  await act(() => { st().selectOverlay("s1"); });
  flat([BACK, "Edit", "Animate", "Keyframe", "Duplicate", "Delete"]);
  await act(() => { st().selectAudio("m1"); });                            // nine tools beside Delete, flat by rule
  flat([BACK, "Split", "Volume", "Fade", "Voice", "Sound", "Duplicate", "Add audio", "Ducking", "Beats", "Delete"]);
  await act(() => { st().selectEffect("e1"); });
  flat([BACK, "Strength", "Duplicate", "Delete"]);
  await act(() => { st().setProject(makeProject()); });
  flat(["Audio", "Effects", "Ratio"]);
});

test("Delete is always in view where the bar has one: pinned outside the scrolling row, in every group and in the chooser", async () => {
  await render(<EditorToolbar />);
  const pinned = () => {
    const del = btn("Delete");
    expect(within(screen.getByTestId("toolbar-scroll")).queryByRole("button", { name: "Delete" })).toBeNull();
    expect(within(screen.getByTestId("toolbar-row")).getByRole("button", { name: "Delete" })).toBe(del);
    expect(row()[row().length - 1]).toBe("Delete");
    expect(screen.getByTestId("toolbar-separator")).toBeTruthy();
  };
  expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();     // the main bar has none
  expect(screen.queryByTestId("toolbar-separator")).toBeNull();
  for (const pick of [() => st().select("a"), () => st().select("L"), () => st().select("p")]) {
    await act(() => { pick(); });
    for (const g of await groupNames()) { await showGroup(g); pinned(); }
    await fireEvent.press(screen.getByTestId("toolbar-group"));
    pinned();
  }
  for (const pick of [() => st().selectOverlay("t1"), () => st().selectOverlay("c1"), () => st().selectOverlay("s1"), () => st().selectAudio("m1"), () => st().selectEffect("e1")]) {
    await act(() => { pick(); });
    pinned();
  }
  // … and it deletes from any group, as it always did.
  await act(() => { st().select("a"); });
  await showGroup("Frame");
  await fireEvent.press(btn("Delete"));
  expect(st().project!.clips.map((c) => c.id)).toEqual(["b", "p"]);
  expect(st().past).toHaveLength(1);
});

test("the bar is one capsule: a slate step on the page, 64 pt, floating at the bottom of the bottom area's slot", async () => {
  await render(<EditorToolbar />);
  await act(() => { st().select("a"); });
  expect(TOOLBAR).toEqual({ height: 64, tool: 56, group: 52 });
  expect(screen.getByTestId("editor-toolbar")).toHaveStyle({ backgroundColor: theme.elevation.page, borderTopColor: theme.elevation.page, height: BAR_HEIGHT + 8 });
  expect(screen.getByTestId("toolbar-slot")).toHaveStyle({ height: BAR_HEIGHT - 1, justifyContent: "flex-end" });
  expect(screen.getByTestId("toolbar-row")).toHaveStyle({ height: 64, borderRadius: theme.radius.pill, backgroundColor: theme.elevation.bar, marginHorizontal: theme.space.xs, flexDirection: "row" });
  expect([PALETTES.dark.bg, PALETTES.dark.surfaceBar]).toEqual([theme.elevation.page, theme.elevation.bar]);     // soft slate: the bar a step above the page
  // A strip is the bar's colour edge to edge, under its hairline, as it was.
  await fireEvent.press(btn("Speed"));
  expect(screen.getByTestId("editor-toolbar")).toHaveStyle({ backgroundColor: theme.elevation.bar, borderTopColor: theme.colors.hairline });
});

test("a tool is a symbol over its label with no tile behind it, a 44-pt target at least, one line that shrinks to fit", async () => {
  await render(<EditorToolbar />);
  await act(() => { st().select("a"); });
  const split = btn("Split");
  expect(split).toHaveStyle({ height: 56, minWidth: theme.size.control });
  expect(theme.size.control).toBeGreaterThanOrEqual(theme.size.touch);
  expect(TOOLBAR.tool).toBeGreaterThanOrEqual(theme.size.touch);
  expect(split.props.style).not.toEqual(expect.objectContaining({ backgroundColor: expect.anything() }));
  expect(screen.getByText("Split")).toHaveStyle({ color: theme.colors.text, fontSize: theme.type.small, fontWeight: theme.weight.regular });
  expect(screen.getByText("Split").props).toMatchObject({ numberOfLines: 1, adjustsFontSizeToFit: true, minimumFontScale: 0.85 });
  // The group button: a tool on its own tile, its name with a chevron, and what VoiceOver reads.
  expect(screen.getByTestId("toolbar-group")).toHaveStyle({ width: 52, height: 56, backgroundColor: theme.elevation.tile });
  expect(screen.getByTestId("toolbar-group").props.accessibilityLabel).toBe("Tool groups, Basics");
  expect(within(screen.getByTestId("toolbar-group")).getByText("Basics")).toBeTruthy();
  // Delete: red, and its label too.
  expect(screen.getByText("Delete")).toHaveStyle({ color: theme.colors.dangerText });
  // Back: a 44-pt disc.
  expect(btn(BACK)).toHaveStyle({ width: theme.size.touch, height: theme.size.touch, borderRadius: theme.radius.pill });
});

test("an active tool is marked by more than colour: a lighter capsule behind it, a heavier label, the selected state — and gold", async () => {
  await render(<EditorToolbar />);
  await act(() => { st().select("a"); });
  await showGroup("Edit");
  expect(btn("Reverse")).not.toBeSelected();
  await fireEvent.press(btn("Reverse"));
  expect(btn("Reverse")).toBeSelected();
  expect(btn("Reverse")).toHaveStyle({ backgroundColor: theme.elevation.lifted, borderRadius: theme.radius.box });
  expect(screen.getByText("Reverse")).toHaveStyle({ color: theme.colors.accent, fontWeight: theme.weight.semi });
  expect(screen.getByText("Replace")).toHaveStyle({ color: theme.colors.text, fontWeight: theme.weight.regular });
});

test("the trailing fade shows only while more tools follow: not when they fit, not at the row's end", async () => {
  await render(<EditorToolbar />);
  await act(() => { st().select("a"); });
  const scroll = () => screen.getByTestId("toolbar-scroll");
  expect(screen.queryByTestId("toolbar-fade")).toBeNull();                 // nothing measured yet
  await layoutOf("toolbar-scroll", 198);
  await fireEvent(scroll(), "contentSizeChange", 400, TOOLBAR.tool);
  const fade = screen.getByTestId("toolbar-fade");
  expect(fade.props.pointerEvents).toBe("none");
  // Slices of the bar's own colour, each more opaque: not a blur, not a gradient.
  const slices = fade.props.children as { props: { style: { backgroundColor: string; opacity: number; width: number } } }[];
  expect(slices.map((s) => s.props.style.backgroundColor)).toEqual(slices.map(() => theme.elevation.bar));
  expect(slices.map((s) => s.props.style.opacity)).toEqual([...slices.map((s) => s.props.style.opacity)].sort((x, y) => x - y));
  expect(slices.reduce((w, s) => w + s.props.style.width, 0)).toBe(16);
  await fireEvent.scroll(scroll(), { nativeEvent: { contentOffset: { x: 100, y: 0 } } });
  expect(screen.getByTestId("toolbar-fade")).toBeTruthy();
  await fireEvent.scroll(scroll(), { nativeEvent: { contentOffset: { x: 202, y: 0 } } });      // the end of the row
  expect(screen.queryByTestId("toolbar-fade")).toBeNull();
  // Another group is a new row, from the left; three tools fit.
  await showGroup("Audio");
  await layoutOf("toolbar-scroll", 198);
  await fireEvent(scroll(), "contentSizeChange", 170, TOOLBAR.tool);
  expect(screen.queryByTestId("toolbar-fade")).toBeNull();
});

test("on a 375-pt screen four tools show beside Back, the group button and Delete", () => {
  // The capsule: the screen less its two margins and its two paddings; five parts beside the row, so five gaps.
  const inside = 375 - 2 * theme.space.xs - 2 * theme.space.xs;
  const fixed = theme.size.touch + TOOLBAR.group + 1 + theme.size.control;     // Back, the group button, the separator, Delete
  const forTools = inside - fixed - 4 * theme.space.xs;
  expect(forTools).toBe(198);
  expect(Math.floor(forTools / theme.size.control)).toBe(4);                 // Split, Trim, Select, Speed — a short label's tool is 48 wide
});
