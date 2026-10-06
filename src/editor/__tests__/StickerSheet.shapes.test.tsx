import { fireEvent, render, screen } from "@testing-library/react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
jest.mock("@/src/lib/id", () => ({ newId: () => "st1" }));
jest.mock("@/src/projects/prefs", () => ({ prefs: { getRecentEmoji: jest.fn(async () => []), pushRecentEmoji: jest.fn(async () => {}) } }));
import { Dimensions } from "react-native";
import { SHAPES } from "@/src/editor/effects";
import { makeClip, makeProject, makeSticker, SHAPE_IDS } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { PANEL, panelHeight } from "@/src/ui/ToolPanel";
import { StickerSheet } from "../components/StickerSheet";
import { StickerView } from "../components/StickerView";

beforeEach(() => { useEditorStore.getState().reset(); useEditorStore.getState().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 10 })] })); useEditorStore.getState().seek(2); });

test("the Shapes tab offers all twenty shapes in the registry's order, inside the scroll at its explicit height", async () => {
  await render(<StickerSheet visible onClose={() => {}} onAdded={() => {}} />);
  await fireEvent.press(screen.getByRole("button", { name: "Shapes" }));
  for (const id of SHAPE_IDS) expect(screen.getByRole("button", { name: SHAPES[id].label })).toBeTruthy();
  expect(SHAPE_IDS).toHaveLength(20);
  expect(screen.getByTestId("shape-list")).toHaveStyle({ height: panelHeight("regular", Dimensions.get("window").height) - 1 - PANEL.header - PANEL.lead });
});

test.each([["Ring", "ring"], ["Thought bubble", "bubbleThought"], ["Corner marks", "brackets"], ["Two-way arrow", "arrowDouble"]] as const)(
  "tapping %s adds that shape as a selected sticker at the playhead, in the chosen colour — one undo step", async (label, shape) => {
    const onAdded = jest.fn();
    await render(<StickerSheet visible onClose={() => {}} onAdded={onAdded} />);
    await fireEvent.press(screen.getByRole("button", { name: "Shapes" }));
    await fireEvent.press(screen.getByLabelText("Color #2E86AB"));
    await fireEvent.press(screen.getByRole("button", { name: label }));
    expect(useEditorStore.getState().project!.overlays).toHaveLength(1);
    expect(useEditorStore.getState().project!.overlays[0]).toMatchObject({ kind: "sticker", emoji: null, shape, color: "#2E86AB", start: 2, end: 5, scale: 1, rotation: 0 });
    expect(useEditorStore.getState().past).toHaveLength(1);
    expect(onAdded).toHaveBeenCalledWith("st1");
  });

test("the preview draws a compound shape as ONE path with no fill rule: the counter-wound inner subpath is the hole", async () => {
  await render(<StickerView sticker={makeSticker({ id: "r", emoji: null, shape: "ring", color: "#FF0000", scale: 2 })} frameW={200} frameH={400} />);
  const path = screen.getByTestId("sticker-shape-r");
  expect(path.props.d).toBe(SHAPES.ring.path);
  expect(path.props.fill).toBe("#FF0000");
  expect(path.props.fillRule).toBeUndefined();
});

test("the emoji grid renders at most twenty rows per batch, so a hard fling shows no blank bands", async () => {
  await render(<StickerSheet visible onClose={() => {}} onAdded={() => {}} />);
  expect(screen.getByTestId("emoji-grid").props.maxToRenderPerBatch).toBe(20);
});
