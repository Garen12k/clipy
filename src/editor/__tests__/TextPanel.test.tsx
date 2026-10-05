import { act, fireEvent, render, screen } from "@testing-library/react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
jest.mock("@/src/lib/id", () => ({ newId: () => "dup" }));
jest.mock("@react-native-community/slider", () => { const { View } = require("react-native"); return ({ testID, onValueChange }: { testID?: string; onValueChange?: (v: number) => void }) => <View testID={testID} onTouchEnd={() => onValueChange?.(0.12)} />; });
import { isTextOverlay, makeClip, makeOverlay, makeProject, type Keyframe, type TextOverlay } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { TextPanel } from "../components/TextPanel";

const p = makeProject({ clips: [makeClip({ id: "a", sourceDuration: 10 })], overlays: [makeOverlay({ id: "o1", text: "Hi", start: 1, end: 4 })] });
beforeEach(() => { useEditorStore.getState().reset(); useEditorStore.getState().setProject(p); useEditorStore.getState().selectOverlay("o1"); });
const ov = (): TextOverlay => {
  const o = useEditorStore.getState().project!.overlays.find((o) => o.id === "o1")!;
  if (!isTextOverlay(o)) throw new Error("expected a text overlay");
  return o;
};

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

test("Duplicate is disabled while the text is empty (an empty text is removed when the panel leaves it); Delete is not", async () => {
  const onRetarget = jest.fn();
  await render(<TextPanel overlayId="o1" visible onClose={() => {}} onRetarget={onRetarget} />);
  expect(screen.getByRole("button", { name: "Duplicate" })).toBeEnabled();
  await fireEvent.changeText(screen.getByLabelText("Overlay text"), " ");
  const past = useEditorStore.getState().past.length;
  expect(screen.getByRole("button", { name: "Duplicate" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Delete" })).toBeEnabled();
  await fireEvent.press(screen.getByRole("button", { name: "Duplicate" }));
  expect(useEditorStore.getState().project!.overlays).toHaveLength(1);
  expect(useEditorStore.getState().past).toHaveLength(past);
  expect(useEditorStore.getState().selectedOverlayId).toBe("o1");
  expect(onRetarget).not.toHaveBeenCalled();
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

test("there is one Done — the panel's ✓ — and it closes even while the text is empty (the host removes an empty text)", async () => {
  const onClose = jest.fn();
  await render(<TextPanel overlayId="o1" visible onClose={onClose} />);
  await fireEvent.changeText(screen.getByLabelText("Overlay text"), "");
  expect(screen.getAllByRole("button", { name: "Done" })).toHaveLength(1);
  await fireEvent.press(screen.getByRole("button", { name: "Done" }));
  expect(onClose).toHaveBeenCalledTimes(1);
});

describe("fine-tune placement on a keyframed text", () => {
  const pin = (t: number, v: Partial<Keyframe> = {}): Keyframe => ({ t, x: 0.5, y: 0.5, scale: 1, rotation: 0, opacity: 1, ...v });
  const pins = [pin(0, { x: 0.2, y: 0.2 }), pin(2, { x: 0.6, y: 0.4, scale: 2, rotation: 90 })];
  const field = (label: string) => screen.getByLabelText(label);
  const commit = async (label: string, text: string) => { await fireEvent.changeText(field(label), text); await fireEvent(field(label), "blur"); };
  beforeEach(() => {
    useEditorStore.getState().setProject({ ...p, overlays: [makeOverlay({ id: "o1", text: "Hi", start: 1, end: 4, x: 0.9, y: 0.9, scale: 3, rotation: 10, keyframes: pins })] });
    useEditorStore.getState().seek(2);   // 1 s into the text: half way between the pins
  });

  test("X / Y / Scale / Rotation show the value at the playhead, not the hidden static one", async () => {
    await render(<TextPanel overlayId="o1" visible onClose={() => {}} />);
    await fireEvent.press(screen.getByText("Fine-tune"));
    expect(field("X %").props.value).toBe("40");
    expect(field("Y %").props.value).toBe("30");
    expect(field("Scale").props.value).toBe("1.5");
    expect(field("Rotation °").props.value).toBe("45");
    await act(() => { useEditorStore.getState().seek(3); });
    expect(field("X %").props.value).toBe("60");
    expect(field("Rotation °").props.value).toBe("90");
  });

  test("a commit writes the pin at the playhead in one undo step and leaves the static values alone", async () => {
    await render(<TextPanel overlayId="o1" visible onClose={() => {}} />);
    await fireEvent.press(screen.getByText("Fine-tune"));
    const before = useEditorStore.getState().past.length;
    await commit("X %", "25");
    expect(ov().keyframes.map((k) => k.t)).toEqual([0, 1, 2]);
    expect(ov().keyframes[1]).toMatchObject({ x: 0.25, y: expect.closeTo(0.3, 9), scale: expect.closeTo(1.5, 9), rotation: expect.closeTo(45, 9) });
    expect(ov()).toMatchObject({ x: 0.9, y: 0.9, scale: 3, rotation: 10 });
    expect(useEditorStore.getState().past.length).toBe(before + 1);
    await commit("Rotation °", "400");
    expect(ov().keyframes[1].rotation).toBe(400);
    expect(ov().rotation).toBe(10);
    expect(field("X %").props.value).toBe("25");
  });

  test("Start / End still write the overlay's own range", async () => {
    await render(<TextPanel overlayId="o1" visible onClose={() => {}} />);
    await fireEvent.press(screen.getByText("Fine-tune"));
    await commit("End s", "3");
    expect(ov().end).toBe(3);
    expect(ov().keyframes).toEqual(pins);
  });
});

test("without keyframes the fine-tune fields show and write the static placement, whatever the playhead", async () => {
  useEditorStore.getState().seek(3);
  await render(<TextPanel overlayId="o1" visible onClose={() => {}} />);
  await fireEvent.press(screen.getByText("Fine-tune"));
  expect(screen.getByLabelText("X %").props.value).toBe("50");
  await fireEvent.changeText(screen.getByLabelText("Scale"), "2");
  await fireEvent(screen.getByLabelText("Scale"), "blur");
  await fireEvent.changeText(screen.getByLabelText("Rotation °"), "30");
  await fireEvent(screen.getByLabelText("Rotation °"), "blur");
  expect(ov()).toMatchObject({ scale: 2, rotation: 30, keyframes: [] });
});

test("a caption's fine-tune fields still write its placement", async () => {
  useEditorStore.getState().setProject({ ...p, overlays: [makeOverlay({ id: "o1", kind: "caption", text: "Cap", start: 1, end: 4 })] });
  await render(<TextPanel overlayId="o1" visible onClose={() => {}} />);
  await fireEvent.press(screen.getByText("Fine-tune"));
  await fireEvent.changeText(screen.getByLabelText("Y %"), "80");
  await fireEvent(screen.getByLabelText("Y %"), "blur");
  expect(ov().y).toBe(0.8);
});

describe("typing undo steps begin on the first keystroke", () => {
  const st = () => useEditorStore.getState();
  const textOf = (id: string) => { const o = st().project!.overlays.find((x) => x.id === id)!; return isTextOverlay(o) ? o.text : ""; };
  const two = () => st().setProject({ ...p, overlays: [makeOverlay({ id: "o1", text: "Hi", start: 1, end: 4 }), makeOverlay({ id: "o2", text: "Yo", start: 1, end: 4 })] });

  test("an unbroken run of keystrokes is one history entry", async () => {
    await render(<TextPanel overlayId="o1" visible onClose={() => {}} />);
    const input = screen.getByLabelText("Overlay text");
    await fireEvent.changeText(input, "ab");
    await fireEvent.changeText(input, "abc");
    expect(st().past).toHaveLength(1);
    expect(textOf("o1")).toBe("abc");
  });

  test("focusing the field without typing leaves no history entry; nor does a keystroke that changes nothing", async () => {
    await render(<TextPanel overlayId="o1" visible onClose={() => {}} />);
    const input = screen.getByLabelText("Overlay text");
    await fireEvent(input, "focus");
    expect(st().past).toHaveLength(0);
    await fireEvent.changeText(input, "Hi");
    expect(st().past).toHaveLength(0);
    expect(st().dirty).toBe(false);
  });

  test("the panel re-targeted to another text while the field keeps focus: its typing is its own step", async () => {
    two();
    const view = await render(<TextPanel overlayId="o1" visible onClose={() => {}} />);
    await fireEvent.changeText(screen.getByLabelText("Overlay text"), "Hi there");
    await view.rerender(<TextPanel overlayId="o2" visible onClose={() => {}} />);
    await fireEvent.changeText(screen.getByLabelText("Overlay text"), "Yo y");
    await fireEvent.changeText(screen.getByLabelText("Overlay text"), "Yo you");
    expect(st().past).toHaveLength(2);
    await act(() => { st().undo(); });
    expect([textOf("o1"), textOf("o2")]).toEqual(["Hi there", "Yo"]);
    await act(() => { st().undo(); });
    expect([textOf("o1"), textOf("o2")]).toEqual(["Hi", "Yo"]);
  });

  test("type, a colour, type: three entries in order", async () => {
    await render(<TextPanel overlayId="o1" visible onClose={() => {}} />);
    const input = screen.getByLabelText("Overlay text");
    const white = ov().color;
    await fireEvent.changeText(input, "Hi a");
    await fireEvent.changeText(input, "Hi ab");
    await fireEvent.press(screen.getByLabelText("Color #F5C542"));
    await fireEvent.changeText(input, "Hi abc");
    await fireEvent.changeText(input, "Hi abcd");
    expect(st().past).toHaveLength(3);
    await act(() => { st().undo(); });
    expect(ov()).toMatchObject({ text: "Hi ab", color: "#F5C542" });
    await act(() => { st().undo(); });
    expect(ov()).toMatchObject({ text: "Hi ab", color: white });
    await act(() => { st().undo(); });
    expect(ov()).toMatchObject({ text: "Hi", color: white });
    expect(st().past).toHaveLength(0);
  });

  test("type, Undo, type: Redo is empty and the history is coherent", async () => {
    await render(<TextPanel overlayId="o1" visible onClose={() => {}} />);
    const input = screen.getByLabelText("Overlay text");
    await fireEvent.changeText(input, "Hi a");
    await fireEvent.press(screen.getByLabelText("Color #F5C542"));
    await act(() => { st().undo(); });
    expect(st().future).toHaveLength(1);
    await fireEvent.changeText(input, "Hi ab");
    await fireEvent.changeText(input, "Hi abc");
    expect(st().future).toHaveLength(0);
    expect(st().past).toHaveLength(2);
    await act(() => { st().redo(); });
    expect(ov().text).toBe("Hi abc");
    await act(() => { st().undo(); });
    expect(ov().text).toBe("Hi a");
    await act(() => { st().undo(); });
    expect(ov().text).toBe("Hi");
  });

  test("type, Undo, a colour, type: the typing does not join the colour step", async () => {
    await render(<TextPanel overlayId="o1" visible onClose={() => {}} />);
    const input = screen.getByLabelText("Overlay text");
    await fireEvent.changeText(input, "Hi a");
    await act(() => { st().undo(); });
    await fireEvent.press(screen.getByLabelText("Color #F5C542"));
    await fireEvent.changeText(input, "Hi b");
    expect(st().past).toHaveLength(2);
    await act(() => { st().undo(); });
    expect(ov()).toMatchObject({ text: "Hi", color: "#F5C542" });
  });
});
