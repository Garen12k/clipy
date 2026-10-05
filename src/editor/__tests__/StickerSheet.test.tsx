import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
jest.mock("@/src/lib/id", () => ({ newId: () => "st1" }));
jest.mock("@/src/projects/prefs", () => ({ prefs: { getRecentEmoji: jest.fn(async () => ["🎉"]), pushRecentEmoji: jest.fn(async () => {}) } }));
import { Dimensions } from "react-native";
import { makeClip, makeProject } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { useKeyboard } from "@/src/ui/keyboard";
import { PANEL, panelHeight } from "@/src/ui/ToolPanel";
import { StickerSheet } from "../components/StickerSheet";
import { closeStrip, openStrip, useStripCloser, useToolStrip } from "../toolStrip";

beforeEach(() => { useEditorStore.getState().reset(); useEditorStore.getState().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 10 })] })); useEditorStore.getState().seek(2); });
afterEach(() => { useKeyboard.setState({ height: 0 }); closeStrip(); });

test("picking an emoji adds a selected sticker at the playhead and records it as recent", async () => {
  const onAdded = jest.fn();
  await render(<StickerSheet visible onClose={() => {}} onAdded={onAdded} />);
  expect(await screen.findByText("🎉")).toBeTruthy();   // recents row
  await fireEvent.changeText(screen.getByLabelText("Search emoji"), "fire");
  await fireEvent.press(await screen.findByLabelText("Emoji fire"));
  const ov = useEditorStore.getState().project!.overlays[0];
  expect(ov).toMatchObject({ kind: "sticker", emoji: "🔥", start: 2, end: 5 });
  expect(useEditorStore.getState().selectedOverlayId).toBe("st1");
  expect(onAdded).toHaveBeenCalledWith("st1");
});

test("shapes tab adds a shape sticker with the chosen color", async () => {
  await render(<StickerSheet visible onClose={() => {}} onAdded={() => {}} />);
  await fireEvent.press(screen.getByRole("button", { name: "Shapes" }));
  await fireEvent.press(screen.getByLabelText("Color #2E86AB"));
  await fireEvent.press(screen.getByRole("button", { name: "Heart" }));
  expect(useEditorStore.getState().project!.overlays[0]).toMatchObject({ kind: "sticker", emoji: null, shape: "heart", color: "#2E86AB" });
});

const H = Dimensions.get("window").height;

test("it is a panel: inline, no scrim, tabs in the lead, the grid at an explicit height, Done closes", async () => {
  const onClose = jest.fn();
  await render(<StickerSheet visible onClose={onClose} onAdded={() => {}} />);
  expect(screen.getByRole("header", { name: "Sticker" })).toBeTruthy();
  expect(screen.getByTestId("tool-panel")).toHaveStyle({ height: panelHeight("regular", H) - 1 });
  expect(screen.queryByLabelText("Close sheet")).toBeNull();
  const bodyH = panelHeight("regular", H) - 1 - PANEL.header - PANEL.lead;
  expect(screen.getByTestId("emoji-grid")).toHaveStyle({ height: bodyH - 52 });
  await fireEvent.press(screen.getByRole("button", { name: "Done" }));
  expect(onClose).toHaveBeenCalledTimes(1);
});

test("searching with the keyboard up: the tabs give their place, the search field and the grid stay", async () => {
  await render(<StickerSheet visible onClose={() => {}} onAdded={() => {}} />);
  await act(() => { useKeyboard.setState({ height: 336 }); });
  expect(screen.queryByRole("button", { name: "Shapes" })).toBeNull();
  expect(screen.getByLabelText("Search emoji")).toBeTruthy();
  expect(screen.getByTestId("emoji-grid")).toHaveStyle({ height: panelHeight("regular", H, true) - 1 - PANEL.header - 52 });
  expect(screen.getByTestId("emoji-grid").props.keyboardShouldPersistTaps).toBe("handled");
  expect(screen.getByTestId("emoji-grid").props.keyboardDismissMode).toBe("on-drag");
});

test("while the keyboard is up the recents row gives its place to the results; it is back when the keyboard goes down", async () => {
  await render(<StickerSheet visible onClose={() => {}} onAdded={() => {}} />);
  expect(await screen.findByLabelText("Recent 🎉")).toBeTruthy();
  await act(() => { useKeyboard.setState({ height: 336 }); });
  expect(screen.queryByLabelText("Recent 🎉")).toBeNull();
  expect(screen.getByTestId("emoji-grid").props.ListHeaderComponent).toBeNull();
  expect(screen.getByTestId("emoji-grid").props.data.length).toBeGreaterThan(0);   // the results are still there
  await act(() => { useKeyboard.setState({ height: 0 }); });
  expect(screen.getByLabelText("Recent 🎉")).toBeTruthy();
});

test("the shapes scroll inside the panel body, at its explicit height", async () => {
  await render(<StickerSheet visible onClose={() => {}} onAdded={() => {}} />);
  await fireEvent.press(screen.getByRole("button", { name: "Shapes" }));
  expect(screen.getByTestId("shape-list")).toHaveStyle({ height: panelHeight("regular", H) - 1 - PANEL.header - PANEL.lead });
});

test("adding selects the new sticker and closes the panel in one go: the closer has nothing left to close", async () => {
  function Host() {
    useStripCloser();
    const open = useToolStrip((s) => s.open);
    return <StickerSheet visible={open?.id === "sticker"} onClose={closeStrip} onAdded={() => {}} />;
  }
  await render(<Host />);
  await act(() => { openStrip("sticker"); });
  await fireEvent.changeText(screen.getByLabelText("Search emoji"), "fire");
  await fireEvent.press(await screen.findByLabelText("Emoji fire"));
  expect(useEditorStore.getState().selectedOverlayId).toBe("st1");
  expect(useToolStrip.getState().open).toBeNull();
  expect(screen.queryByTestId("tool-panel")).toBeNull();
});
