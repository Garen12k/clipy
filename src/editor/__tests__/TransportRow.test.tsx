import { act, fireEvent, render, screen } from "@testing-library/react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-02T10:00:00.000Z" }));
import { renameProject } from "@/src/editor/model/ops";
import { makeClip, makeProject } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { TransportRow } from "../components/TransportRow";
import { closeStrip, useToolStrip } from "../toolStrip";

beforeEach(() => {
  useEditorStore.getState().reset();
  useEditorStore.getState().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 21 })] }));
});

test("shows time and ratio; play toggles; undo/redo follow history", async () => {
  await render(<TransportRow />);
  expect(screen.getByText("0:00 / 0:21")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Aspect ratio" })).toHaveTextContent("9:16");
  expect(screen.getByRole("button", { name: "Undo" })).toBeDisabled();
  await fireEvent.press(screen.getByRole("button", { name: "Play" }));
  expect(useEditorStore.getState().isPlaying).toBe(true);
  expect(screen.getByRole("button", { name: "Pause" })).toBeTruthy();
  await act(() => { useEditorStore.getState().apply((p) => renameProject(p, "X")); });
  await fireEvent.press(screen.getByRole("button", { name: "Undo" }));
  expect(useEditorStore.getState().project?.name).toBe("Project 1");
  expect(screen.getByRole("button", { name: "Redo" })).toBeEnabled();
});

test("play is disabled for an empty project", async () => {
  useEditorStore.getState().setProject(makeProject());
  await render(<TransportRow />);
  expect(screen.getByRole("button", { name: "Play" })).toBeDisabled();
});

test("play at the end restarts from 0", async () => {
  await render(<TransportRow />);
  await act(() => { useEditorStore.getState().seek(21); });
  expect(useEditorStore.getState().playhead).toBe(21);
  await fireEvent.press(screen.getByRole("button", { name: "Play" }));
  expect(useEditorStore.getState().playhead).toBe(0);
  expect(useEditorStore.getState().isPlaying).toBe(true);
});

test("the ratio pill opens the ratio strip", async () => {
  await render(<TransportRow />);
  await fireEvent.press(screen.getByRole("button", { name: "Aspect ratio" }));
  expect(useToolStrip.getState().open).toMatchObject({ id: "ratio" });
  expect(screen.queryByRole("button", { name: "1:1" })).toBeNull();     // the row no longer owns a sheet
  closeStrip();
});
