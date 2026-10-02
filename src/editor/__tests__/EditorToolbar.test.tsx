import { act, fireEvent, render, screen } from "@testing-library/react-native";
jest.mock("@/src/lib/id", () => ({ newId: () => "dup" }));
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
import { makeClip, makeOverlay, makeProject, makeSticker } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { EditorToolbar } from "../components/EditorToolbar";

const openGroup = async (name: string) => { await fireEvent.press(screen.getByRole("tab", { name })); };

beforeEach(() => {
  useEditorStore.getState().reset();
  useEditorStore.getState().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 4 }), makeClip({ id: "b", sourceDuration: 4 })] }));
});

test("clip tools are disabled without a selection; Ratio is always enabled", async () => {
  await render(<EditorToolbar panelFor={null} onPanelChange={() => {}} transitionFor={null} onTransitionChange={() => {}} />);
  for (const l of ["Split", "Trim", "Duplicate", "Delete"]) expect(screen.getByRole("button", { name: l })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Ratio" })).toBeEnabled();
  await openGroup("Audio");
  expect(screen.getByRole("button", { name: "Volume" })).toBeDisabled();
  await openGroup("Text");
  expect(screen.getByRole("button", { name: "Text" })).toBeEnabled();
});

test("Text is disabled for an empty project", async () => {
  useEditorStore.getState().reset();
  useEditorStore.getState().setProject(makeProject());
  await render(<EditorToolbar panelFor={null} onPanelChange={() => {}} transitionFor={null} onTransitionChange={() => {}} />);
  await openGroup("Text");
  expect(screen.getByRole("button", { name: "Text" })).toBeDisabled();
  await openGroup("Effects");
  expect(screen.getByRole("button", { name: "Templates" })).toBeDisabled();
});

test("Templates is enabled without a selection when the project has clips and opens the sheet", async () => {
  await render(<EditorToolbar panelFor={null} onPanelChange={() => {}} transitionFor={null} onTransitionChange={() => {}} />);
  await openGroup("Effects");
  expect(screen.getByRole("button", { name: "Templates" })).toBeEnabled();
  await fireEvent.press(screen.getByRole("button", { name: "Templates" }));
  expect(screen.getByRole("button", { name: "Random template" })).toBeTruthy();
});

test("Split cuts at the playhead; Duplicate and Delete act on the selection", async () => {
  await render(<EditorToolbar panelFor={null} onPanelChange={() => {}} transitionFor={null} onTransitionChange={() => {}} />);
  await act(() => { useEditorStore.getState().select("a"); useEditorStore.getState().seek(1.5); });
  await fireEvent.press(screen.getByRole("button", { name: "Split" }));
  expect(useEditorStore.getState().project?.clips).toHaveLength(3);
  await fireEvent.press(screen.getByRole("button", { name: "Duplicate" }));
  expect(useEditorStore.getState().project?.clips).toHaveLength(4);
  await fireEvent.press(screen.getByRole("button", { name: "Delete" }));
  expect(useEditorStore.getState().project?.clips).toHaveLength(3);
  expect(useEditorStore.getState().selectedClipId).toBeNull();
});

test("Text adds an overlay at the playhead and selects it", async () => {
  await render(<EditorToolbar panelFor={null} onPanelChange={() => {}} transitionFor={null} onTransitionChange={() => {}} />);
  useEditorStore.getState().seek(2);
  await openGroup("Text");
  await fireEvent.press(screen.getByRole("button", { name: "Text" }));
  const ovs = useEditorStore.getState().project!.overlays;
  expect(ovs).toHaveLength(1);
  expect(ovs[0]).toMatchObject({ start: 2, end: 5, text: "Your text" });
  expect(useEditorStore.getState().selectedOverlayId).toBe(ovs[0].id);
});

test("Volume is enabled after selecting a clip", async () => {
  await render(<EditorToolbar panelFor={null} onPanelChange={() => {}} transitionFor={null} onTransitionChange={() => {}} />);
  await openGroup("Audio");
  expect(screen.getByRole("button", { name: "Volume" })).toBeDisabled();
  await act(() => { useEditorStore.getState().select("a"); });
  expect(screen.getByRole("button", { name: "Volume" })).toBeEnabled();
});

test("Speed is disabled without a selection and enabled after selecting a clip", async () => {
  await render(<EditorToolbar panelFor={null} onPanelChange={() => {}} transitionFor={null} onTransitionChange={() => {}} />);
  await openGroup("Effects");
  expect(screen.getByRole("button", { name: "Speed" })).toBeDisabled();
  await act(() => { useEditorStore.getState().select("a"); });
  expect(screen.getByRole("button", { name: "Speed" })).toBeEnabled();
});

test("five group tabs; Edit is selected by default and only its tools show", async () => {
  await render(<EditorToolbar panelFor={null} onPanelChange={() => {}} transitionFor={null} onTransitionChange={() => {}} />);
  expect(screen.getAllByRole("tab").map((t) => t.props.accessibilityLabel)).toEqual(["Edit", "Effects", "Text", "Stickers", "Audio"]);
  expect(screen.getByRole("tab", { name: "Edit" })).toBeSelected();
  expect(screen.getByRole("button", { name: "Split" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Filter" })).toBeNull();
});

test("selecting a clip keeps Effects/Audio, but leaves Text/Stickers for Edit", async () => {
  await render(<EditorToolbar panelFor={null} onPanelChange={() => {}} transitionFor={null} onTransitionChange={() => {}} />);
  await openGroup("Effects");
  await act(() => { useEditorStore.getState().select("a"); });
  expect(screen.getByRole("tab", { name: "Effects" })).toBeSelected();
  await openGroup("Text");
  await act(() => { useEditorStore.getState().select("b"); });
  expect(screen.getByRole("tab", { name: "Edit" })).toBeSelected();
  await openGroup("Audio");
  await act(() => { useEditorStore.getState().select(null); });
  expect(screen.getByRole("tab", { name: "Audio" })).toBeSelected();
});

test("selecting a sticker overlay shows Stickers; a text overlay shows Text", async () => {
  useEditorStore.getState().setProject(makeProject({
    clips: [makeClip({ id: "a", sourceDuration: 4 })],
    overlays: [makeSticker({ id: "s1" }), makeOverlay({ id: "t1" })],
  }));
  await render(<EditorToolbar panelFor={null} onPanelChange={() => {}} transitionFor={null} onTransitionChange={() => {}} />);
  await act(() => { useEditorStore.getState().selectOverlay("s1"); });
  expect(screen.getByRole("tab", { name: "Stickers" })).toBeSelected();
  await act(() => { useEditorStore.getState().selectOverlay("t1"); });
  expect(screen.getByRole("tab", { name: "Text" })).toBeSelected();
});
