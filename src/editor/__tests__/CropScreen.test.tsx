import { act, fireEvent, render, screen } from "@testing-library/react-native";
jest.mock("@/src/editor/components/thumbnails", () => ({ getThumb: jest.fn(async () => "file:///thumb.jpg") }));
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
import { getThumb } from "@/src/editor/components/thumbnails";
import { applyPreset } from "@/src/editor/model/cropBox";
import { FULL_CROP, makeClip, makePhotoClip, makeProject } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { CropScreen } from "../components/CropScreen";
import { EditorToolbar } from "../components/EditorToolbar";

const LANDSCAPE = 16 / 9;
const crop = () => useEditorStore.getState().project!.clips[0].crop;
const past = () => useEditorStore.getState().past.length;
const START = { x: 0.1, y: 0.2, w: 0.5, h: 0.6 };

beforeEach(() => {
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

test("the Crop tool is disabled without a selection and opens the screen for a video or a photo", async () => {
  useEditorStore.getState().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 4 }), makePhotoClip({ id: "p" })] }));
  await render(<EditorToolbar panelFor={null} onPanelChange={() => {}} transitionFor={null} onTransitionChange={() => {}} />);
  expect(screen.getByRole("button", { name: "Crop" })).toBeDisabled();
  for (const id of ["a", "p"]) {
    await act(() => { useEditorStore.getState().select(id); });
    expect(screen.getByRole("button", { name: "Crop" })).toBeEnabled();
    await fireEvent.press(screen.getByRole("button", { name: "Crop" }));
    expect(screen.getByRole("button", { name: "Done" })).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("button", { name: "Done" })).toBeNull();
  }
});
