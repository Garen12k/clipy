import { act, fireEvent, render, screen } from "@testing-library/react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
jest.mock("@/src/lib/id", () => ({ newId: () => "st1" }));
jest.mock("@/src/projects/prefs", () => ({ prefs: { getRecentEmoji: jest.fn(async () => ["🎉"]), pushRecentEmoji: jest.fn(async () => {}) } }));
import { Dimensions } from "react-native";
import { EMOJI_BY_PACK, EMOJI_PACK_IDS, EMOJI_PACKS } from "@/src/editor/emoji";
import { makeClip, makeProject } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { useKeyboard } from "@/src/ui/keyboard";
import { PANEL, panelHeight } from "@/src/ui/ToolPanel";
import { StickerSheet } from "../components/StickerSheet";

beforeEach(() => { useEditorStore.getState().reset(); useEditorStore.getState().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 10 })] })); useEditorStore.getState().seek(2); });
afterEach(() => { useKeyboard.setState({ height: 0 }); });
const show = () => render(<StickerSheet visible onClose={() => {}} onAdded={() => {}} />);
const grid = () => screen.getByTestId("emoji-grid");
const chip = (id: (typeof EMOJI_PACK_IDS)[number]) => screen.getByRole("button", { name: `${EMOJI_PACKS[id].label} pack` });
const H = Dimensions.get("window").height;

test("the Emoji tab opens on Faces with the seven pack chips in the lead row, after the two tabs; Recently used is on top", async () => {
  await show();
  expect(await screen.findByLabelText("Recent 🎉")).toBeTruthy();
  for (const id of EMOJI_PACK_IDS) { expect(chip(id)).toBeTruthy(); expect(screen.getByText(EMOJI_PACKS[id].label)).toBeTruthy(); }
  expect(chip("faces")).toBeSelected();
  expect(chip("hearts")).not.toBeSelected();
  expect(grid().props.data).toBe(EMOJI_BY_PACK.faces);
  const packs = screen.getByTestId("emoji-packs");
  expect(packs.props.horizontal).toBe(true);
  expect(packs).toHaveStyle({ height: PANEL.lead });                                    // an explicit height; its flex is the row's spare width
  expect(Object.keys(packs.props).filter((k) => /^on.*Scroll/.test(k))).toEqual([]);
  expect(chip("faces")).toHaveStyle({ height: 28 });                                    // compact chips: they read as packs, not as tabs
});

test("a pack chip swaps the grid's emoji; the grid keeps its explicit height and Recently used stays", async () => {
  await show();
  await screen.findByLabelText("Recent 🎉");
  await fireEvent.press(chip("hearts"));
  expect(chip("hearts")).toBeSelected();
  expect(chip("faces")).not.toBeSelected();
  expect(grid().props.data).toBe(EMOJI_BY_PACK.hearts);
  expect(screen.getByLabelText("Emoji red heart")).toBeTruthy();
  expect(screen.queryByLabelText("Emoji grinning face")).toBeNull();
  expect(screen.getByLabelText("Recent 🎉")).toBeTruthy();
  expect(grid()).toHaveStyle({ height: panelHeight("regular", H) - 1 - PANEL.header - PANEL.lead - 52 });
});

test("picking from a pack adds the sticker, exactly as picking from a search does", async () => {
  await show();
  await fireEvent.press(chip("food"));
  await fireEvent.press(screen.getByLabelText("Emoji grapes"));
  expect(useEditorStore.getState().project!.overlays[0]).toMatchObject({ kind: "sticker", emoji: "🍇", shape: null, start: 2, end: 5 });
  expect(useEditorStore.getState().past).toHaveLength(1);
});

test("the More pack hands the list all its emoji but mounts only the first rows", async () => {
  await show();
  await fireEvent.press(chip("more"));
  expect(grid().props.data).toHaveLength(1125);
  // numColumns is consumed by FlatList and not passed to the host list; eight columns show as 9 rows x 8 = 72 mounted below.
  expect(grid().props.initialNumToRender).toBe(9);
  const mounted = screen.getAllByLabelText(/^Emoji /).length;
  expect(mounted).toBe(9 * 8);
});

test("search looks through every emoji whatever the pack; no pack is selected meanwhile; a pack chip clears the search", async () => {
  await show();
  await fireEvent.press(chip("hearts"));
  await fireEvent.changeText(screen.getByLabelText("Search emoji"), "pizza");
  expect(screen.getByLabelText("Emoji pizza")).toBeTruthy();                             // a Food emoji, found from Hearts
  for (const id of EMOJI_PACK_IDS) expect(chip(id)).not.toBeSelected();
  expect(screen.queryByLabelText("Recent 🎉")).toBeNull();
  await fireEvent.changeText(screen.getByLabelText("Search emoji"), "");
  expect(chip("hearts")).toBeSelected();                                                  // back in the pack it was in
  expect(grid().props.data).toBe(EMOJI_BY_PACK.hearts);
  await fireEvent.changeText(screen.getByLabelText("Search emoji"), "pizza");
  await fireEvent.press(chip("travel"));
  expect(screen.getByLabelText("Search emoji").props.value).toBe("");
  expect(grid().props.data).toBe(EMOJI_BY_PACK.travel);
});

test("with the keyboard up the lead row (tabs and packs) is gone and Recently used hides; the pack is still the one shown", async () => {
  await show();
  await fireEvent.press(chip("hands"));
  await act(() => { useKeyboard.setState({ height: 336 }); });
  expect(screen.queryByTestId("emoji-packs")).toBeNull();
  expect(screen.queryByLabelText("Recent 🎉")).toBeNull();
  expect(grid().props.data).toBe(EMOJI_BY_PACK.hands);
  expect(grid()).toHaveStyle({ height: panelHeight("regular", H, true) - 1 - PANEL.header - 52 });
  await act(() => { useKeyboard.setState({ height: 0 }); });
  expect(chip("hands")).toBeSelected();
});

test("the Shapes tab has no pack chips; coming back to Emoji keeps the pack", async () => {
  await show();
  await fireEvent.press(chip("symbols"));
  await fireEvent.press(screen.getByRole("button", { name: "Shapes" }));
  expect(screen.queryByTestId("emoji-packs")).toBeNull();
  await fireEvent.press(screen.getByRole("button", { name: "Emoji" }));
  expect(chip("symbols")).toBeSelected();
});
