import { fireEvent, render, screen } from "@testing-library/react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
jest.mock("@/src/lib/id", () => ({ newId: () => "dup" }));
jest.mock("@react-native-community/slider", () => { const { View } = require("react-native"); return ({ testID, onSlidingStart, onValueChange }: { testID?: string; onSlidingStart?: () => void; onValueChange?: (v: number) => void }) => <View testID={testID} onTouchStart={() => onSlidingStart?.()} onTouchMove={() => onValueChange?.(2)} />; });
import { makeClip, makeProject, makeSticker } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { StickerPanel } from "../components/StickerPanel";

beforeEach(() => { useEditorStore.getState().reset(); useEditorStore.getState().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 10 })], overlays: [makeSticker({ id: "s1", emoji: null, shape: "star", start: 1, end: 4 })] })); useEditorStore.getState().selectOverlay("s1"); });
const st = () => useEditorStore.getState().project!.overlays.find((o) => o.id === "s1")!;

test("color (shapes only), size slider, fine-tune, duplicate", async () => {
  const onRetarget = jest.fn();
  await render(<StickerPanel overlayId="s1" visible onClose={() => {}} onRetarget={onRetarget} />);
  await fireEvent.press(screen.getByLabelText("Color #C8102E"));
  expect(st()).toMatchObject({ color: "#C8102E" });
  const slider = screen.getByTestId("sticker-size-slider");
  await fireEvent(slider, "touchStart"); await fireEvent(slider, "touchMove");
  expect(st()).toMatchObject({ scale: 2 });
  await fireEvent.press(screen.getByText("Fine-tune"));
  await fireEvent.changeText(screen.getByLabelText("Rotation °"), "90");
  await fireEvent(screen.getByLabelText("Rotation °"), "blur");
  expect(st()).toMatchObject({ rotation: 90 });
  await fireEvent.press(screen.getByRole("button", { name: "Duplicate" }));
  expect(useEditorStore.getState().project!.overlays).toHaveLength(2);
  expect(onRetarget).toHaveBeenCalledWith("dup");
});
test("emoji stickers hide the color row", async () => {
  useEditorStore.getState().apply((p) => ({ ...p, overlays: [makeSticker({ id: "s1", emoji: "🔥", start: 1, end: 4 })] }));
  await render(<StickerPanel overlayId="s1" visible onClose={() => {}} />);
  expect(screen.queryByLabelText("Color #C8102E")).toBeNull();
});
