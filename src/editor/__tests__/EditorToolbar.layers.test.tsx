import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
jest.mock("@/src/lib/id", () => ({ newId: () => "dup" }));
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
jest.mock("@/src/projects/pickMedia", () => ({ pickMedia: jest.fn() }));
jest.mock("@/src/projects", () => ({ storage: { importMedia: jest.fn(), saveStill: jest.fn() } }));
jest.mock("expo-video-thumbnails", () => ({ getThumbnailAsync: jest.fn(async () => ({ uri: "file:///thumb.jpg" })) }));
import { storage } from "@/src/projects";
import { pickMedia } from "@/src/projects/pickMedia";
import { useToast } from "@/src/ui/Toast";
import { LAYER_LIMITS, makeClip, makeLayer, makePhotoClip, makeProject, type LayerClip } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { EditorToolbar } from "../components/EditorToolbar";
import { closeStrip } from "../toolStrip";

const pick = pickMedia as jest.Mock;
const importMedia = storage.importMedia as jest.Mock;
const state = () => useEditorStore.getState();
const btn = (name: string) => screen.getByRole("button", { name });
const row = () => screen.getAllByRole("button").map((b) => b.props.accessibilityLabel as string);
const gone = (name: string) => expect(screen.queryByRole("button", { name })).toBeNull();
/** Closes whatever tool is open: a strip's or a panel's ✓. */
const closeTool = async () => { await fireEvent.press(screen.getByRole("button", { name: "Done" })); };
const renderBar = () => render(<EditorToolbar />);
const select = (id: string | null) => act(() => { state().select(id); });
const photoLayer = (id: string, start = 0): LayerClip => ({ ...makePhotoClip({ id }), start });
const BACK = "Back to main tools";
const LAYER = ["Trim", "Speed", "Volume", "Animate", "Filter", "Adjust", "Crop", "Transform", "Opacity", "Mask", "Blend", "Green screen", "Keyframe", "Forward", "Back", "Replace", "Reverse", "Duplicate", "Delete"];

beforeEach(() => {
  closeStrip();
  pick.mockReset(); importMedia.mockReset();
  useToast.getState().clear();
  state().reset();
  state().setProject(makeProject({
    clips: [makeClip({ id: "a", sourceDuration: 4 }), makeClip({ id: "b", sourceDuration: 4 })],
    layers: [makeLayer({ id: "L", sourceDuration: 2, start: 1 }), photoLayer("P", 0), makeLayer({ id: "M", sourceDuration: 2, start: 5 })],
  }));
});

test("Forward / Back only show for a selected layer, whose bar lists the layer tools", async () => {
  await renderBar();
  gone("Forward");
  await select("a");
  gone("Forward");
  gone("Back");
  gone("Blend");
  await select("L");
  expect(row()).toEqual([BACK, ...LAYER]);
});

test("no selection: Opacity and Mask are not there, Overlay is enabled; an empty project has no Overlay", async () => {
  await renderBar();
  gone("Opacity");
  gone("Mask");
  expect(btn("Overlay")).toBeEnabled();
  await act(() => { state().setProject(makeProject()); });
  gone("Overlay");
});

test("a main clip selection: every tool on its bar is enabled", async () => {
  await renderBar();
  await act(() => { state().select("a"); state().seek(1); });
  const labels = row().slice(1);
  expect(labels).toEqual(expect.arrayContaining(["Split", "Trim", "Speed", "Volume", "Filter", "Adjust", "Opacity", "Mask", "Transition", "Freeze"]));
  for (const l of labels) expect(btn(l)).toBeEnabled();
});

test("a video layer selection: the tools that apply are enabled; Split, Freeze, Ratio, Transition, Background and Select are not there", async () => {
  await renderBar();
  await act(() => { state().select("L"); state().seek(1.5); });
  for (const l of ["Split", "Freeze", "Ratio", "Transition", "Background", "Select"]) gone(l);
  for (const l of LAYER) expect(btn(l)).toBeEnabled();
});

test("a photo layer selection follows the photo rules: no Reverse, Speed or Volume", async () => {
  await renderBar();
  await select("P");
  for (const l of ["Trim", "Transform", "Animate", "Filter", "Crop", "Opacity", "Mask", "Replace", "Duplicate", "Delete", "Forward", "Back"]) expect(btn(l)).toBeEnabled();
  for (const l of ["Split", "Reverse", "Freeze", "Ratio", "Speed", "Volume"]) gone(l);
});

test("a reversed layer shows Reverse active and has no Volume", async () => {
  await renderBar();
  await select("L");
  await fireEvent.press(btn("Reverse"));
  expect(state().project!.layers[0].reversed).toBe(true);
  expect(state().selectedClipId).toBe("L");
  expect(btn("Reverse")).toBeSelected();
  gone("Volume");
});

test("Forward and Back move the layer in draw order, one undo step each; at the end nothing happens", async () => {
  await renderBar();
  await select("L");
  const order = () => state().project!.layers.map((l) => l.id);
  await fireEvent.press(btn("Forward"));
  expect(order()).toEqual(["P", "L", "M"]);
  expect(state().past).toHaveLength(1);
  expect(state().selectedClipId).toBe("L");
  await fireEvent.press(btn("Forward"));
  expect(order()).toEqual(["P", "M", "L"]);
  await fireEvent.press(btn("Forward"));
  expect(order()).toEqual(["P", "M", "L"]);
  expect(state().past).toHaveLength(2);
  await fireEvent.press(btn("Back"));
  expect(order()).toEqual(["P", "L", "M"]);
  expect(state().past).toHaveLength(3);
});

test("Keyframe on a layer: enabled while the playhead is on the layer, pins at the offset inside it", async () => {
  await renderBar();
  await act(() => { state().select("L"); state().seek(0.5); });
  expect(btn("Animate")).toBeEnabled();
  expect(btn("Keyframe")).toBeDisabled();   // the layer starts at 1 s
  await act(() => { state().seek(1.75); });
  expect(btn("Keyframe")).toBeEnabled();
  expect(btn("Keyframe")).not.toBeSelected();
  await fireEvent.press(btn("Keyframe"));
  const pins = () => state().project!.layers[0].keyframes;
  expect(pins()).toHaveLength(1);
  expect(pins()[0].t).toBeCloseTo(0.75);
  expect(state().project!.clips[0].keyframes).toHaveLength(0);
  expect(state().past).toHaveLength(1);
  expect(btn("Keyframe")).toBeSelected();
  await fireEvent.press(btn("Keyframe"));
  expect(pins()).toHaveLength(0);
  await act(() => { state().seek(3.5); });
  expect(btn("Keyframe")).toBeDisabled();   // past the layer's end
});

test("Delete removes the layer and clears the selection; Duplicate copies it", async () => {
  await renderBar();
  await select("L");
  await fireEvent.press(btn("Duplicate"));
  expect(state().project!.layers.map((l) => l.id)).toEqual(["L", "dup", "P", "M"]);
  expect(state().project!.clips).toHaveLength(2);
  expect(state().selectedClipId).toBe("L");
  await fireEvent.press(btn("Delete"));
  expect(state().project!.layers.map((l) => l.id)).toEqual(["dup", "P", "M"]);
  expect(state().selectedClipId).toBeNull();
  expect(screen.queryByRole("button", { name: "Forward" })).toBeNull();
});

test("Duplicate at the layer limit toasts and changes nothing", async () => {
  await act(() => { state().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 4 })], layers: Array.from({ length: LAYER_LIMITS.max }, (_, i) => photoLayer(`l${i}`)) })); });
  await renderBar();
  await select("l0");
  await fireEvent.press(btn("Duplicate"));
  expect(state().project!.layers).toHaveLength(LAYER_LIMITS.max);
  expect(state().past).toHaveLength(0);
  expect(useToast.getState().message).toBe("You've reached the layer limit.");
});

test("Duplicate refused by the overlap rule says so", async () => {
  await act(() => { state().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 8 })],
    layers: [makeLayer({ id: "x", sourceDuration: 2, start: 0 }), makeLayer({ id: "y", sourceDuration: 3, start: 2 }), makeLayer({ id: "z", sourceDuration: 3, start: 2.5 })] })); });
  await renderBar();
  await select("x");
  await fireEvent.press(btn("Duplicate"));
  expect(state().project!.layers).toHaveLength(3);
  expect(state().past).toHaveLength(0);
  expect(useToast.getState().message).toBe("Only two video layers can play at the same time.");
});

test("Duplicate with no room after the layer (the copy would start at the video's end) says so", async () => {
  await act(() => { state().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 4 })], layers: [makeLayer({ id: "end", sourceDuration: 2, start: 2 })] })); });
  await renderBar();
  await select("end");
  await fireEvent.press(btn("Duplicate"));
  expect(state().project!.layers).toHaveLength(1);
  expect(state().past).toHaveLength(0);
  expect(useToast.getState().message).toBe("There's no room after this layer.");
});

test("Overlay picks one item and adds it as a selected layer at the playhead", async () => {
  pick.mockResolvedValueOnce([{ uri: "file:///x.mov", kind: "video", durationSec: 1, width: 1080, height: 1920 }]);
  importMedia.mockResolvedValueOnce({ clips: [makeClip({ id: "new", sourceDuration: 1 })], failed: 0 });
  await renderBar();
  await act(() => { state().seek(3.5); });
  await fireEvent.press(btn("Overlay"));
  await waitFor(() => expect(state().project!.layers).toHaveLength(4));
  expect(pick).toHaveBeenCalledWith({ multiple: false });
  expect(state().project!.layers[3]).toMatchObject({ id: "new", start: 3.5 });
  expect(state().selectedClipId).toBe("new");
  expect(state().past).toHaveLength(1);
  expect(btn("Forward")).toBeTruthy();
});

test("Opacity, Mask and Trim open their strips on the selected layer", async () => {
  await renderBar();
  await select("L");
  await fireEvent.press(btn("Opacity"));
  expect(screen.getByText("Opacity 100 %")).toBeTruthy();
  await fireEvent(screen.getByTestId("opacity-slider"), "slidingStart");
  await fireEvent(screen.getByTestId("opacity-slider"), "valueChange", 0.5);
  expect(state().project!.layers[0].opacity).toBe(0.5);
  expect(screen.getByTestId("tool-strip")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Mask" })).toBeNull();     // the bar is hidden while the strip shows
  await closeTool();
  await fireEvent.press(btn("Mask"));
  await fireEvent.press(btn("Circle"));
  expect(state().project!.layers[0].mask).toBe("circle");
  await closeTool();
  await fireEvent.press(btn("Trim"));
  await fireEvent.changeText(screen.getByLabelText("Trim end"), "1.5");
  await fireEvent.press(btn("Apply"));
  expect(state().project!.layers[0]).toMatchObject({ trimEnd: 1.5, start: 1 });
});

test("Blend only shows for a layer; Green screen for any clip or layer", async () => {
  await renderBar();
  gone("Blend");
  gone("Green screen");
  await select("a");
  gone("Blend");
  expect(btn("Green screen")).toBeEnabled();
  await select("L");
  expect(btn("Blend")).toBeEnabled();
  expect(btn("Green screen")).toBeEnabled();
  await select("P");
  expect(btn("Blend")).toBeEnabled();
  expect(btn("Green screen")).toBeEnabled();
});

test("Blend and Green screen open their sheets on the selected layer", async () => {
  await renderBar();
  await select("L");
  await fireEvent.press(btn("Blend"));
  await fireEvent.press(btn("Multiply"));
  expect(state().project!.layers[0].blend).toBe("multiply");
  await closeTool();
  await fireEvent.press(btn("Green screen"));
  await fireEvent(screen.getAllByLabelText("Green screen").find((n) => typeof n.props.value === "boolean")!, "valueChange", true);
  expect(state().project!.layers[0].chroma).toEqual({ color: "#00FF00", strength: 0.5 });
});
