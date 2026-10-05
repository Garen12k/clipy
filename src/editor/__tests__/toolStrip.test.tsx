import { act, fireEvent, render, screen } from "@testing-library/react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-05T10:00:00.000Z" }));
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
import { closeStrip, openStrip, useStripCloser, useToolStrip } from "../toolStrip";

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
  st().reset();
  st().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 4 }), makeClip({ id: "b", sourceDuration: 4 })], layers: [makeLayer({ id: "L", sourceDuration: 2 })], overlays: [makeOverlay({ id: "t" })] }));
});

test("openStrip remembers the selection it opened with; closeStrip clears it", () => {
  st().select("a");
  openStrip("opacity");
  expect(open()).toEqual({ id: "opacity", key: "clip:a", clipIndex: null });
  openStrip("transition", 0);
  expect(open()).toEqual({ id: "transition", key: "clip:a", clipIndex: 0 });
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
  await render(<><Probe /><EditorToolbar panelFor={null} onPanelChange={() => {}} transitionFor={null} onTransitionChange={() => {}} /></>);
  const before = screen.getByTestId("probe");
  await fireEvent.press(screen.getByRole("button", { name: "Opacity" }));
  expect(screen.getByTestId("tool-strip")).toBeTruthy();
  expect(screen.getByTestId("probe")).toBe(before);
  await fireEvent.press(screen.getByRole("button", { name: "Done" }));
  expect(screen.queryByTestId("tool-strip")).toBeNull();
  expect(screen.getByTestId("probe")).toBe(before);
  expect(mounts).toBe(1);
});
