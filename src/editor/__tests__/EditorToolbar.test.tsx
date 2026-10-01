import { act, fireEvent, render, screen } from "@testing-library/react-native";
jest.mock("@/src/lib/id", () => ({ newId: () => "dup" }));
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
import { makeClip, makeProject } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { EditorToolbar } from "../components/EditorToolbar";

beforeEach(() => {
  useEditorStore.getState().reset();
  useEditorStore.getState().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 4 }), makeClip({ id: "b", sourceDuration: 4 })] }));
});

test("clip tools are disabled without a selection; Ratio is always enabled", async () => {
  await render(<EditorToolbar panelFor={null} onPanelChange={() => {}} transitionFor={null} onTransitionChange={() => {}} />);
  for (const l of ["Split", "Trim", "Duplicate", "Delete", "Volume"]) expect(screen.getByRole("button", { name: l })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Ratio" })).toBeEnabled();
  expect(screen.getByRole("button", { name: "Text" })).toBeEnabled();
});

test("Text is disabled for an empty project", async () => {
  useEditorStore.getState().reset();
  useEditorStore.getState().setProject(makeProject());
  await render(<EditorToolbar panelFor={null} onPanelChange={() => {}} transitionFor={null} onTransitionChange={() => {}} />);
  expect(screen.getByRole("button", { name: "Text" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Templates" })).toBeDisabled();
});

test("Templates is enabled without a selection when the project has clips and opens the sheet", async () => {
  await render(<EditorToolbar panelFor={null} onPanelChange={() => {}} transitionFor={null} onTransitionChange={() => {}} />);
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
  await fireEvent.press(screen.getByRole("button", { name: "Text" }));
  const ovs = useEditorStore.getState().project!.overlays;
  expect(ovs).toHaveLength(1);
  expect(ovs[0]).toMatchObject({ start: 2, end: 5, text: "Your text" });
  expect(useEditorStore.getState().selectedOverlayId).toBe(ovs[0].id);
});

test("Volume is enabled after selecting a clip", async () => {
  await render(<EditorToolbar panelFor={null} onPanelChange={() => {}} transitionFor={null} onTransitionChange={() => {}} />);
  expect(screen.getByRole("button", { name: "Volume" })).toBeDisabled();
  await act(() => { useEditorStore.getState().select("a"); });
  expect(screen.getByRole("button", { name: "Volume" })).toBeEnabled();
});

test("Speed is disabled without a selection and enabled after selecting a clip", async () => {
  await render(<EditorToolbar panelFor={null} onPanelChange={() => {}} transitionFor={null} onTransitionChange={() => {}} />);
  expect(screen.getByRole("button", { name: "Speed" })).toBeDisabled();
  await act(() => { useEditorStore.getState().select("a"); });
  expect(screen.getByRole("button", { name: "Speed" })).toBeEnabled();
});
