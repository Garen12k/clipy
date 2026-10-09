import { act, fireEvent, render, screen } from "@testing-library/react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-05T10:00:00.000Z" }));
// expo-crypto gives no id under jest: every new item gets its own.
let mockIds = 0;
jest.mock("@/src/lib/id", () => ({ newId: () => `new${++mockIds}` }));
jest.mock("@/src/projects/pickMedia", () => ({ pickMedia: jest.fn() }));
jest.mock("@/src/projects", () => ({ storage: { importMedia: jest.fn(), saveStill: jest.fn() } }));
jest.mock("expo-video-thumbnails", () => ({ getThumbnailAsync: jest.fn(async () => ({ uri: "file:///thumb.jpg" })) }));
import { useEffect } from "react";
import { View } from "react-native";
import { deleteClip } from "@/src/editor/model/ops";
import { makeClip, makeLayer, makeOverlay, makeProject } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { EditorToolbar } from "../components/EditorToolbar";
import { OpacitySheet } from "../components/OpacitySheet";
import { closeForExport, closeStrip, openStrip, rekeyStrip, useStripCloser, useToolStrip } from "../toolStrip";

const st = () => useEditorStore.getState();
const open = () => useToolStrip.getState().open;
/** What the bottom area does: the closer, and the strip for the selected clip. */
function Host() {
  useStripCloser();
  const strip = useToolStrip((s) => s.open);
  const id = useEditorStore((s) => s.selectedClipId);
  return <OpacitySheet clipId={id} visible={strip?.id === "opacity"} onClose={closeStrip} />;
}

beforeEach(() => {
  closeStrip();
  st().setRecording(false);
  st().reset();
  st().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 4 }), makeClip({ id: "b", sourceDuration: 4 })], layers: [makeLayer({ id: "L", sourceDuration: 2 })], overlays: [makeOverlay({ id: "t" })] }));
});

test("openStrip remembers the selection it opened with; closeStrip clears it", () => {
  st().select("a");
  openStrip("opacity");
  expect(open()).toEqual({ id: "opacity", key: "clip:a" });
  openStrip("transition");
  expect(open()).toEqual({ id: "transition", key: "clip:a" });
  closeStrip();
  expect(open()).toBeNull();
  st().select(null);
  openStrip("ratio");
  expect(open()?.key).toBe("none");
});

test("the strip shows inline for the selected clip and Done closes it", async () => {
  st().select("a");
  await render(<Host />);
  expect(screen.queryByTestId("tool-strip")).toBeNull();
  await act(() => { openStrip("opacity"); });
  expect(screen.getByRole("header", { name: "Opacity" })).toBeTruthy();
  expect(screen.queryByLabelText("Close sheet")).toBeNull();
  await fireEvent.press(screen.getByRole("button", { name: "Done" }));
  expect(open()).toBeNull();
  expect(screen.queryByTestId("tool-strip")).toBeNull();
});

test("it stays open through value changes, seeking and an undo that keeps the item", async () => {
  st().select("a");
  await render(<Host />);
  await act(() => { openStrip("opacity"); });
  await fireEvent(screen.getByTestId("opacity-slider"), "slidingStart");
  await fireEvent(screen.getByTestId("opacity-slider"), "valueChange", 0.4);
  await act(() => { st().seek(2); st().setPlaying(true); });
  expect(screen.getByText("Opacity 40 %")).toBeTruthy();
  expect(st().past).toHaveLength(1);
  await act(() => { st().undo(); });
  expect(screen.getByText("Opacity 100 %")).toBeTruthy();
  expect(open()?.id).toBe("opacity");
});

test("it closes when another item is selected, when the selection is cleared, and when the item is deleted", async () => {
  await render(<Host />);
  for (const change of [() => st().select("b"), () => st().select("L"), () => st().selectOverlay("t"), () => st().select(null), () => st().apply((p) => deleteClip(p, "a"))]) {
    await act(() => { st().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 4 }), makeClip({ id: "b", sourceDuration: 4 })], layers: [makeLayer({ id: "L", sourceDuration: 2 })], overlays: [makeOverlay({ id: "t" })] })); st().select("a"); openStrip("opacity"); });
    expect(open()?.id).toBe("opacity");
    await act(() => { change(); });
    expect(open()).toBeNull();
    expect(screen.queryByTestId("tool-strip")).toBeNull();
  }
});

test("it closes when multi-select is entered and when the host unmounts", async () => {
  st().select("a");
  const view = await render(<Host />);
  await act(() => { openStrip("opacity"); });
  await act(() => { st().enterMultiSelect(); });
  expect(open()).toBeNull();
  await act(() => { st().exitMultiSelect(); st().select("a"); openStrip("opacity"); });
  expect(open()?.id).toBe("opacity");
  await view.unmount();
  expect(open()).toBeNull();
});

test("opening a strip in multi-select leaves the mode first, so its key is not the mode's and it stays open", async () => {
  st().select("a");
  await render(<Host />);
  await act(() => { st().enterMultiSelect(); });
  await act(() => { openStrip("ratio"); });
  expect(st().multiSelect).toBeNull();
  expect(open()).toEqual({ id: "ratio", key: "none" });
});

test("a strip opened with nothing selected closes when something is selected", async () => {
  await render(<Host />);
  await act(() => { openStrip("ratio"); });
  expect(open()?.key).toBe("none");
  await act(() => { st().select("a"); });
  expect(open()).toBeNull();
});

test("a strip that closes in the middle of a slider drag keeps that drag as one undo step, and the next drag is its own step", async () => {
  st().select("a");
  await render(<Host />);
  await act(() => { openStrip("opacity"); });
  await fireEvent(screen.getByTestId("opacity-slider"), "slidingStart");
  await fireEvent(screen.getByTestId("opacity-slider"), "valueChange", 0.4);
  await act(() => { st().select("b"); });                             // closes with the finger still down: no slidingComplete
  expect(screen.queryByTestId("tool-strip")).toBeNull();
  expect(st().past).toHaveLength(1);
  await act(() => { st().select("a"); openStrip("opacity"); });
  await fireEvent(screen.getByTestId("opacity-slider"), "slidingStart");
  await fireEvent(screen.getByTestId("opacity-slider"), "valueChange", 0.2);
  expect(st().past).toHaveLength(2);
  await act(() => { st().undo(); });
  expect(st().project!.clips[0].opacity).toBe(0.4);
  await act(() => { st().undo(); });
  expect(st().project!.clips[0].opacity).toBe(1);
});

test("opening and closing a strip in the toolbar does not remount what is beside it (the preview's place on the editor screen)", async () => {
  let mounts = 0;
  function Probe() {
    useEffect(() => { mounts++; }, []);
    return <View testID="probe" />;
  }
  st().select("a");
  await render(<><Probe /><EditorToolbar /></>);
  const before = screen.getByTestId("probe");
  // Opacity is in the clip's Frame group: the group button, then the group — neither remounts what is beside the bar.
  await fireEvent.press(screen.getByRole("button", { name: "Tool groups, Basics" }));
  await fireEvent.press(screen.getByRole("button", { name: "Frame" }));
  expect(screen.getByTestId("probe")).toBe(before);
  await fireEvent.press(screen.getByRole("button", { name: "Opacity" }));
  expect(screen.getByTestId("tool-strip")).toBeTruthy();
  expect(screen.getByTestId("probe")).toBe(before);
  await fireEvent.press(screen.getByRole("button", { name: "Done" }));
  expect(screen.queryByTestId("tool-strip")).toBeNull();
  expect(screen.getByTestId("probe")).toBe(before);
  expect(mounts).toBe(1);
});

test("a panel is opened and closed through the same store, keyed on the selection", () => {
  st().select("a");
  openStrip("templates");
  expect(open()).toEqual({ id: "templates", key: "clip:a" });
  st().select(null);
  openStrip("beats");
  expect(open()).toEqual({ id: "beats", key: "none" });
});

test("rekeyStrip moves the open tool to the current selection, so the closer leaves it alone", async () => {
  st().selectOverlay("t");
  await render(<Host />);
  await act(() => { openStrip("text"); });
  await act(() => { st().select("a"); rekeyStrip(); });
  expect(open()).toEqual({ id: "text", key: "clip:a" });
  await act(() => { closeStrip(); rekeyStrip(); });                     // nothing open: nothing to re-key
  expect(open()).toBeNull();
});

test("while a voice-over is being recorded nothing closes or replaces the open tool; it closes once recording has ended", async () => {
  await render(<Host />);
  await act(() => { openStrip("addAudio"); st().setRecording(true); });
  await act(() => { st().select("a"); });
  expect(open()).toEqual({ id: "addAudio", key: "none" });
  await act(() => { openStrip("ratio"); });
  expect(open()?.id).toBe("addAudio");
  await act(() => { st().setRecording(false); });
  expect(open()).toBeNull();
});

test("closeForExport closes the tool; while recording it pauses playback instead and says no", () => {
  st().select("a");
  openStrip("opacity");
  expect(closeForExport()).toBe(true);
  expect(open()).toBeNull();
  openStrip("addAudio");
  st().setRecording(true); st().setPlaying(true);
  expect(closeForExport()).toBe(false);
  expect(open()?.id).toBe("addAudio");
  expect(st().isPlaying).toBe(false);
  st().setRecording(false);
});

test("adding selects the new item: the Effects picker adds, selects and closes — the effect's bar shows and nothing reopens", async () => {
  await render(<EditorToolbar />);
  await fireEvent.press(screen.getByRole("button", { name: "Effects" }));
  expect(open()).toEqual({ id: "effect", key: "none" });
  await fireEvent.press(screen.getByRole("button", { name: "Glow" }));
  expect(st().selectedEffectId).toBe(st().project!.effects[0].id);
  expect(open()).toBeNull();
  expect(screen.getByRole("button", { name: "Strength" })).toBeTruthy();
});

test("Add text selects the new text first and opens the panel second, so its own selection change does not close it", async () => {
  await render(<EditorToolbar />);
  await fireEvent.press(screen.getByRole("button", { name: "Text" }));
  await fireEvent.press(screen.getByRole("button", { name: "Add text" }));
  const id = st().selectedOverlayId!;
  await act(async () => {});                                            // the closer's effect has run
  expect(open()).toEqual({ id: "text", key: `overlay:${id}` });
  // Duplicate inside the panel selects the copy and re-keys: still open, now on the copy.
  // (While the text panel is still a modal sheet the bar under it has a Duplicate too: the panel's is the last one.)
  await fireEvent.press(screen.getAllByRole("button", { name: "Duplicate" }).at(-1)!);
  const copy = st().selectedOverlayId!;
  expect(copy).not.toBe(id);
  expect(open()).toEqual({ id: "text", key: `overlay:${copy}` });
});
