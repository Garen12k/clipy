import { act, fireEvent, render, screen } from "@testing-library/react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-05T10:00:00.000Z" }));
import { Dimensions } from "react-native";
import { isTextOverlay, makeClip, makeOverlay, makeProject, makeSticker } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { useKeyboard } from "@/src/ui/keyboard";
import { PANEL, panelHeight } from "@/src/ui/ToolPanel";
import { StickerPanel } from "../components/StickerPanel";
import { TextPanel } from "../components/TextPanel";

const st = () => useEditorStore.getState();
const H = Dimensions.get("window").height;
const text = () => { const o = st().project!.overlays.find((x) => x.id === "o1")!; return isTextOverlay(o) ? o.text : ""; };

beforeEach(() => {
  st().reset();
  st().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 10 })], overlays: [makeOverlay({ id: "o1", text: "Hi", start: 1, end: 4 }), makeSticker({ id: "s1", start: 1, end: 4 })] }));
});
afterEach(() => { useKeyboard.setState({ height: 0 }); });

test("the text panel is a regular panel: inline, no scrim, one vertical scroll that keeps its test id", async () => {
  await render(<TextPanel overlayId="o1" visible onClose={() => {}} />);
  expect(screen.getByRole("header", { name: "Text" })).toBeTruthy();
  expect(screen.getByTestId("tool-panel")).toHaveStyle({ height: panelHeight("regular", H) - 1 });
  expect(screen.queryByLabelText("Close sheet")).toBeNull();
  expect(screen.getByTestId("text-panel-scroll")).toHaveStyle({ height: panelHeight("regular", H) - 1 - PANEL.header });
});

test("the text field comes first in the body, so it is in view at the typing height", async () => {
  await render(<TextPanel overlayId="o1" visible onClose={() => {}} />);
  const field = screen.getByLabelText("Overlay text");
  expect(field.parent?.children[0]).toBe(field);                       // first child of the body's content view: nothing above it
  await act(() => { useKeyboard.setState({ height: 336 }); });
  expect(screen.getByTestId("tool-panel")).toHaveStyle({ height: panelHeight("regular", H, true) - 1 });
  expect(screen.getByLabelText("Overlay text")).toBeTruthy();
});

test("an unbroken run of typing is one undo step; typing after an Undo is a new step", async () => {
  await render(<TextPanel overlayId="o1" visible onClose={() => {}} />);
  const field = screen.getByLabelText("Overlay text");
  await fireEvent(field, "focus");
  await fireEvent.changeText(field, "Hi t");
  await fireEvent.changeText(field, "Hi there");
  expect(st().past).toHaveLength(1);
  await act(() => { st().undo(); });
  expect(text()).toBe("Hi");
  expect(st().past).toHaveLength(0);
  await fireEvent.changeText(field, "Hi you");
  expect(st().past).toHaveLength(1);
  await act(() => { st().undo(); });
  expect(text()).toBe("Hi");
});

test("the sticker editor is a compact panel: inline, no scrim, Done closes", async () => {
  const onClose = jest.fn();
  await render(<StickerPanel overlayId="s1" visible onClose={onClose} />);
  expect(screen.getByRole("header", { name: "Sticker" })).toBeTruthy();
  expect(screen.getByTestId("tool-panel")).toHaveStyle({ height: 239 });
  expect(screen.queryByLabelText("Close sheet")).toBeNull();
  expect(screen.getByTestId("sticker-size-slider")).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: "Done" }));
  expect(onClose).toHaveBeenCalledTimes(1);
});
