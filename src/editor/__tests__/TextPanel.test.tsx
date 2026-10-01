import { act, fireEvent, render, screen } from "@testing-library/react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
jest.mock("@/src/lib/id", () => ({ newId: () => "dup" }));
jest.mock("@react-native-community/slider", () => { const { View } = require("react-native"); return ({ testID, onValueChange }: { testID?: string; onValueChange?: (v: number) => void }) => <View testID={testID} onTouchEnd={() => onValueChange?.(0.12)} />; });
import { makeClip, makeOverlay, makeProject } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { TextPanel } from "../components/TextPanel";

const p = makeProject({ clips: [makeClip({ id: "a", sourceDuration: 10 })], overlays: [makeOverlay({ id: "o1", text: "Hi", start: 1, end: 4 })] });
beforeEach(() => { useEditorStore.getState().reset(); useEditorStore.getState().setProject(p); useEditorStore.getState().selectOverlay("o1"); });
const ov = () => useEditorStore.getState().project!.overlays.find((o) => o.id === "o1")!;

test("edits text, font, color, alignment, outline, background through the store", async () => {
  await render(<TextPanel overlayId="o1" visible onClose={() => {}} />);
  await fireEvent.changeText(screen.getByLabelText("Overlay text"), "Hello world");
  expect(ov().text).toBe("Hello world");
  await fireEvent.press(screen.getByRole("button", { name: "Anton" }));
  expect(ov().fontId).toBe("anton");
  await fireEvent.press(screen.getByLabelText("Color #F5C542"));
  expect(ov().color).toBe("#F5C542");
  await fireEvent.press(screen.getByRole("button", { name: "Align left" }));
  expect(ov().align).toBe("left");
  await fireEvent(screen.getByLabelText("Outline"), "valueChange", false);
  expect(ov().outline).toBe(false);
  await fireEvent(screen.getByLabelText("Background"), "valueChange", true);
  expect(ov().background).toEqual({ color: "#000000", opacity: 0.6 });
});

test("fine-tune fields and duplicate/delete", async () => {
  const onRetarget = jest.fn();
  await render(<TextPanel overlayId="o1" visible onClose={() => {}} onRetarget={onRetarget} />);
  await fireEvent.press(screen.getByText("Fine-tune"));
  await fireEvent.changeText(screen.getByLabelText("X %"), "25");
  await fireEvent(screen.getByLabelText("X %"), "blur");
  expect(ov().x).toBe(0.25);
  await fireEvent.changeText(screen.getByLabelText("Start s"), "2");
  await fireEvent(screen.getByLabelText("Start s"), "blur");
  expect(ov().start).toBe(2);
  await fireEvent.press(screen.getByRole("button", { name: "Duplicate" }));
  expect(useEditorStore.getState().project!.overlays).toHaveLength(2);
  expect(useEditorStore.getState().selectedOverlayId).toBe("dup");
  expect(onRetarget).toHaveBeenCalledWith("dup");
});

test("a typing session is a single undo step", async () => {
  await render(<TextPanel overlayId="o1" visible onClose={() => {}} />);
  const before = useEditorStore.getState().past.length;
  const input = screen.getByLabelText("Overlay text");
  await fireEvent(input, "focus");
  await fireEvent.changeText(input, "Hi t");
  await fireEvent.changeText(input, "Hi th");
  await fireEvent.changeText(input, "Hi there");
  expect(useEditorStore.getState().past.length).toBe(before + 1);
  expect(ov().text).toBe("Hi there");
  await act(() => { useEditorStore.getState().undo(); });
  expect(ov().text).toBe("Hi");
});

test("Done is disabled while the text is empty", async () => {
  await render(<TextPanel overlayId="o1" visible onClose={() => {}} />);
  await fireEvent.changeText(screen.getByLabelText("Overlay text"), "");
  expect(screen.getByRole("button", { name: "Done" })).toBeDisabled();
});
