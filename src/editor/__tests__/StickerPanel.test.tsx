import { act, fireEvent, render, screen } from "@testing-library/react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
jest.mock("@/src/lib/id", () => ({ newId: () => "dup" }));
jest.mock("@react-native-community/slider", () => { const { View } = require("react-native"); return ({ testID, onSlidingStart, onValueChange }: { testID?: string; onSlidingStart?: () => void; onValueChange?: (v: number) => void }) => <View testID={testID} onTouchStart={() => onSlidingStart?.()} onTouchMove={() => onValueChange?.(2)} />; });
import { makeClip, makeProject, makeSticker, type Keyframe } from "@/src/editor/model/types";
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

describe("a keyframed sticker", () => {
  const pin = (t: number, v: Partial<Keyframe> = {}): Keyframe => ({ t, x: 0.5, y: 0.5, scale: 1, rotation: 0, opacity: 1, ...v });
  const pins = [pin(0, { x: 0.2, y: 0.2 }), pin(2, { x: 0.6, y: 0.4, scale: 3, rotation: 90 })];
  const field = (label: string) => screen.getByLabelText(label);
  beforeEach(() => {
    useEditorStore.getState().apply((p) => ({ ...p, overlays: [makeSticker({ id: "s1", emoji: null, shape: "star", start: 1, end: 4, x: 0.9, y: 0.9, scale: 4, rotation: 10, keyframes: pins })] }));
    useEditorStore.getState().seek(2);   // 1 s into the sticker: half way between the pins
  });

  test("the fields and the Size label show the value at the playhead", async () => {
    await render(<StickerPanel overlayId="s1" visible onClose={() => {}} />);
    expect(screen.getByText("Size 200%")).toBeTruthy();
    await fireEvent.press(screen.getByText("Fine-tune"));
    expect(field("X %").props.value).toBe("40");
    expect(field("Y %").props.value).toBe("30");
    expect(field("Scale").props.value).toBe("2");
    expect(field("Rotation °").props.value).toBe("45");
  });

  test("the Size slider writes ONE pin at the playhead the drag started at, as one undo step; the static scale is untouched", async () => {
    await render(<StickerPanel overlayId="s1" visible onClose={() => {}} />);
    const before = useEditorStore.getState().past.length;
    const slider = screen.getByTestId("sticker-size-slider");
    await fireEvent(slider, "touchStart");
    await fireEvent(slider, "touchMove");
    await act(() => { useEditorStore.getState().seek(2.5); });
    await fireEvent(slider, "touchMove");
    expect(st().keyframes.map((k) => k.t)).toEqual([0, 1, 2]);
    expect(st().keyframes[1]).toMatchObject({ scale: 2, x: expect.closeTo(0.4, 9) });
    expect(st().scale).toBe(4);
    expect(useEditorStore.getState().past.length).toBe(before + 1);
  });

  test("a field commit writes the pin and leaves the static values alone", async () => {
    await render(<StickerPanel overlayId="s1" visible onClose={() => {}} />);
    await fireEvent.press(screen.getByText("Fine-tune"));
    await fireEvent.changeText(field("Y %"), "80");
    await fireEvent(field("Y %"), "blur");
    expect(st().keyframes[1]).toMatchObject({ t: 1, y: 0.8 });
    expect(st()).toMatchObject({ x: 0.9, y: 0.9, scale: 4, rotation: 10 });
  });
});

test("the Fine-tune toggle has hit slop", async () => {
  await render(<StickerPanel overlayId="s1" visible onClose={() => {}} />);
  let n = screen.getByText("Fine-tune").parent; while (n && n.props.hitSlop === undefined) n = n.parent;
  expect(n?.props.hitSlop).toBe(12);
});
