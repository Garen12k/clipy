import { act, fireEvent, render, screen } from "@testing-library/react-native";
jest.mock("@/src/editor/components/thumbnails", () => ({ getThumb: jest.fn(async () => "file:///thumb.jpg") }));
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
// The preset's Modal mock drops its children the instant `visible` is false. The real iOS Modal keeps rendering
// them until the slide-away finishes; `mockModal.keep` imitates that for the close-animation tests.
const mockModal = { keep: false };
jest.mock("react-native/Libraries/Modal/Modal", () => {
  const { createElement } = require("react");
  const { View } = require("react-native");
  const Modal = ({ visible, children }: { visible?: boolean; children?: unknown }) =>
    (visible !== false || mockModal.keep ? createElement(View, { testID: "modal" }, children) : null);
  return { __esModule: true, default: Modal };
});
import { getThumb } from "@/src/editor/components/thumbnails";
import { applyPreset, dragCorner } from "@/src/editor/model/cropBox";
import { FULL_CROP, makeClip, makePhotoClip, makeProject } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { CropScreen } from "../components/CropScreen";
import { EditorToolbar } from "../components/EditorToolbar";

const LANDSCAPE = 16 / 9;
const crop = () => useEditorStore.getState().project!.clips[0].crop;
const past = () => useEditorStore.getState().past.length;
const START = { x: 0.1, y: 0.2, w: 0.5, h: 0.6 };

type Handlers = { onStart: () => void; onUpdate: (e: { translationX: number; translationY: number }) => void };
const handlers = (testID: string) => (screen.getByTestId(testID).props.gesture as { handlers: Handlers }).handlers;
// 16:9 source in a 400 × 600 area: the drawn picture is 356 × 200.25.
const PIC_W = 356, PIC_H = 200.25;

beforeEach(() => {
  mockModal.keep = false;
  jest.clearAllMocks();
  useEditorStore.getState().reset();
  useEditorStore.getState().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 4, width: 1920, height: 1080, trimStart: 1, trimEnd: 4, crop: START })] }));
});

test("shows the presets and the buttons; Free is selected", async () => {
  await render(<CropScreen clipId="a" visible onClose={() => {}} />);
  for (const l of ["Free", "9:16", "1:1", "4:5", "16:9", "Reset", "Cancel", "Done"]) expect(screen.getByRole("button", { name: l })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Free" })).toBeSelected();
});

test("Done applies the working crop as one undo step and closes", async () => {
  const onClose = jest.fn();
  await render(<CropScreen clipId="a" visible onClose={onClose} />);
  await fireEvent.press(screen.getByRole("button", { name: "1:1" }));
  expect(screen.getByRole("button", { name: "1:1" })).toBeSelected();
  expect(crop()).toEqual(START);   // working state only
  const n = past();
  await fireEvent.press(screen.getByRole("button", { name: "Done" }));
  expect(crop()).toEqual(applyPreset(START, 1, LANDSCAPE));
  expect(past()).toBe(n + 1);
  expect(onClose).toHaveBeenCalledTimes(1);
  await act(() => { useEditorStore.getState().undo(); });
  expect(crop()).toEqual(START);
});

test("Done with an unchanged crop adds no undo step", async () => {
  const onClose = jest.fn();
  await render(<CropScreen clipId="a" visible onClose={onClose} />);
  const before = useEditorStore.getState().project;
  await fireEvent.press(screen.getByRole("button", { name: "Done" }));
  expect(useEditorStore.getState().project).toBe(before);
  expect(past()).toBe(0);
  expect(onClose).toHaveBeenCalledTimes(1);
});

test("Cancel changes nothing", async () => {
  const onClose = jest.fn();
  await render(<CropScreen clipId="a" visible onClose={onClose} />);
  await fireEvent.press(screen.getByRole("button", { name: "16:9" }));
  await fireEvent.press(screen.getByRole("button", { name: "Cancel" }));
  expect(crop()).toEqual(START);
  expect(past()).toBe(0);
  expect(onClose).toHaveBeenCalledTimes(1);
});

test("Reset gives the full picture and unlocks the shape", async () => {
  await render(<CropScreen clipId="a" visible onClose={() => {}} />);
  await fireEvent.press(screen.getByRole("button", { name: "1:1" }));
  await fireEvent.press(screen.getByRole("button", { name: "Reset" }));
  expect(screen.getByRole("button", { name: "Free" })).toBeSelected();
  await fireEvent.press(screen.getByRole("button", { name: "Done" }));
  expect(crop()).toEqual(FULL_CROP);
});

test("the box is drawn from the clip's crop over the letterboxed still", async () => {
  await render(<CropScreen clipId="a" visible onClose={() => {}} />);
  // 16:9 source in a 400 × 600 area: inset by the 22 pt handle margin → 356 wide, 200.25 tall, centred.
  await fireEvent(screen.getByTestId("crop-area"), "layout", { nativeEvent: { layout: { x: 0, y: 0, width: 400, height: 600 } } });
  const pic = screen.getByTestId("crop-picture");
  expect(pic).toHaveStyle({ left: 22, width: 356, height: 200.25, top: (600 - 200.25) / 2 });
  expect(screen.getByTestId("crop-box")).toHaveStyle({ left: 0.1 * 356, top: 0.2 * 200.25, width: 0.5 * 356, height: 0.6 * 200.25 });
  for (const c of ["tl", "tr", "bl", "br"]) expect(screen.getByTestId(`crop-handle-${c}`)).toBeTruthy();
});

const layout = () => fireEvent(screen.getByTestId("crop-area"), "layout", { nativeEvent: { layout: { x: 0, y: 0, width: 400, height: 600 } } });

test("a video shows a still at the playhead's source time; a photo uses its own picture", async () => {
  await act(() => { useEditorStore.getState().seek(1); });   // 1 s into clip a → source 2 s
  await render(<CropScreen clipId="a" visible onClose={() => {}} />);
  await layout();
  expect(getThumb).toHaveBeenCalledWith("file:///media/a.mp4", 2);
  expect(await screen.findByTestId("crop-still")).toHaveProp("source", { uri: "file:///thumb.jpg" });

  await act(() => { useEditorStore.getState().setProject(makeProject({ clips: [makePhotoClip({ id: "p" })] })); });
  jest.clearAllMocks();
  await render(<CropScreen clipId="p" visible onClose={() => {}} />);
  await layout();
  expect(getThumb).not.toHaveBeenCalled();
  expect(screen.getByTestId("crop-still")).toHaveProp("source", { uri: "file:///media/p.jpg" });
});

test("renders nothing when hidden or without a clip", async () => {
  await render(<CropScreen clipId="a" visible={false} onClose={() => {}} />);
  expect(screen.queryByRole("button", { name: "Done" })).toBeNull();
  await render(<CropScreen clipId={null} visible onClose={() => {}} />);
  expect(screen.queryByRole("button", { name: "Done" })).toBeNull();
});

test("the Crop tool is not on the main bar and opens the screen for a video or a photo", async () => {
  useEditorStore.getState().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 4 }), makePhotoClip({ id: "p" })] }));
  await render(<EditorToolbar />);
  expect(screen.queryByRole("button", { name: "Crop" })).toBeNull();
  for (const id of ["a", "p"]) {
    await act(() => { useEditorStore.getState().select(id); });
    // Crop is in the clip's Frame group: the group button, then the group.
    await fireEvent.press(screen.getByRole("button", { name: "Tool groups, Basics" }));
    await fireEvent.press(screen.getByRole("button", { name: "Frame" }));
    expect(screen.getByRole("button", { name: "Crop" })).toBeEnabled();
    await fireEvent.press(screen.getByRole("button", { name: "Crop" }));
    expect(screen.getByRole("button", { name: "Done" })).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("button", { name: "Done" })).toBeNull();
  }
});

test("a pan on the box moves the working crop; successive updates do not stack", async () => {
  await render(<CropScreen clipId="a" visible onClose={() => {}} />);
  await layout();
  const box = handlers("crop-box");
  await act(() => { box.onStart(); box.onUpdate({ translationX: 0.1 * PIC_W, translationY: 0 }); });
  expect(screen.getByTestId("crop-box")).toHaveStyle({ left: 0.2 * PIC_W });
  await act(() => { handlers("crop-box").onUpdate({ translationX: 0.2 * PIC_W, translationY: 0.1 * PIC_H }); });
  // A new pan starts from where the box now is (translation restarts at 0).
  const again = handlers("crop-box");
  await act(() => { again.onStart(); again.onUpdate({ translationX: 0.1 * PIC_W, translationY: 0 }); });
  await fireEvent.press(screen.getByRole("button", { name: "Done" }));
  expect(crop().x).toBeCloseTo(0.4, 6);
  expect(crop().y).toBeCloseTo(0.3, 6);
  expect(crop().w).toBeCloseTo(0.5, 6);
});

test("a corner pan after a move starts from the moved box", async () => {
  await render(<CropScreen clipId="a" visible onClose={() => {}} />);
  await layout();
  const box = handlers("crop-box"), br = handlers("crop-handle-br");
  await act(() => { box.onStart(); box.onUpdate({ translationX: 0.1 * PIC_W, translationY: 0 }); });
  await act(() => { br.onStart(); br.onUpdate({ translationX: -0.1 * PIC_W, translationY: 0 }); });
  await fireEvent.press(screen.getByRole("button", { name: "Done" }));
  for (const [k, v] of Object.entries({ x: 0.2, y: 0.2, w: 0.4, h: 0.6 })) expect(crop()[k as "x"]).toBeCloseTo(v, 6);
});

test("each gesture keeps its own starting crop", async () => {
  await render(<CropScreen clipId="a" visible onClose={() => {}} />);
  await layout();
  // Both read from the same render, so they come from the same set of gestures.
  const box = handlers("crop-box");
  const br = handlers("crop-handle-br");
  await act(() => { box.onStart(); box.onUpdate({ translationX: 0.1 * PIC_W, translationY: 0 }); });
  // A second finger lands on a handle after the box moved; the box's own snapshot must stay START.
  await act(() => { br.onStart(); });
  await act(() => { box.onUpdate({ translationX: 0.2 * PIC_W, translationY: 0 }); });
  await fireEvent.press(screen.getByRole("button", { name: "Done" }));
  expect(crop().x).toBeCloseTo(0.3, 6);   // START.x + 0.2, not the moved 0.2 + 0.2
});

test("a corner pan resizes, locked to the chosen preset", async () => {
  await render(<CropScreen clipId="a" visible onClose={() => {}} />);
  await layout();
  await fireEvent.press(screen.getByRole("button", { name: "1:1" }));
  const from = applyPreset(START, 1, LANDSCAPE);
  const tl = handlers("crop-handle-tl");
  await act(() => { tl.onStart(); tl.onUpdate({ translationX: 0.05 * PIC_W, translationY: 0.1 * PIC_H }); });
  await fireEvent.press(screen.getByRole("button", { name: "Done" }));
  const want = dragCorner(from, "tl", 0.05, 0.1, 1, LANDSCAPE);
  for (const k of ["x", "y", "w", "h"] as const) expect(crop()[k]).toBeCloseTo(want[k], 6);
  expect((crop().w * LANDSCAPE) / crop().h).toBeCloseTo(1, 6);
});

test("a preset the picture cannot hold keeps Free selected and corner drags unlocked", async () => {
  await act(() => { useEditorStore.getState().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 4, width: 4000, height: 100, crop: START })] })); });
  await render(<CropScreen clipId="a" visible onClose={() => {}} />);
  await layout();
  await fireEvent.press(screen.getByRole("button", { name: "9:16" }));
  expect(screen.getByRole("button", { name: "Free" })).toBeSelected();
  expect(screen.getByRole("button", { name: "9:16" })).not.toBeSelected();
  const br = handlers("crop-handle-br");
  const picW = 356, picH = 356 / 40;
  await act(() => { br.onStart(); br.onUpdate({ translationX: 0.1 * picW, translationY: 0.1 * picH }); });
  await fireEvent.press(screen.getByRole("button", { name: "Done" }));
  const want = dragCorner(START, "br", 0.1, 0.1, null, 40);
  for (const k of ["x", "y", "w", "h"] as const) expect(crop()[k]).toBeCloseTo(want[k], 6);
});

test("the content stays during the close animation; reopening after Cancel starts from the clip's crop", async () => {
  mockModal.keep = true;
  const onClose = jest.fn();
  await render(<CropScreen clipId="a" visible onClose={onClose} />);
  await fireEvent.press(screen.getByRole("button", { name: "1:1" }));
  await fireEvent.press(screen.getByRole("button", { name: "Cancel" }));
  await screen.rerender(<CropScreen clipId="a" visible={false} onClose={onClose} />);
  // Still drawn (sliding away), with the working state it had.
  expect(screen.getByRole("button", { name: "1:1" })).toBeSelected();
  await screen.rerender(<CropScreen clipId="a" visible onClose={onClose} />);
  expect(screen.getByRole("button", { name: "Free" })).toBeSelected();
  await fireEvent.press(screen.getByRole("button", { name: "Done" }));
  expect(crop()).toEqual(START);
  expect(past()).toBe(0);
});

test("a clip with no stored size neither crashes nor changes its crop", async () => {
  await act(() => { useEditorStore.getState().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 4, width: 0, height: 0, crop: START })] })); });
  await render(<CropScreen clipId="a" visible onClose={() => {}} />);
  await layout();
  await fireEvent.press(screen.getByRole("button", { name: "1:1" }));
  expect(screen.getByRole("button", { name: "Free" })).toBeSelected();
  await fireEvent.press(screen.getByRole("button", { name: "Done" }));
  expect(crop()).toEqual(START);
});
