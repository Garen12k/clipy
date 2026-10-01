import { act, fireEvent, render, screen } from "@testing-library/react-native";
jest.mock("expo-router", () => ({ router: { back: jest.fn() } }));
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
import { setAspectRatio } from "@/src/editor/model/ops";
import { makeProject } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { EditorTopBar } from "../components/EditorTopBar";

beforeEach(() => { useEditorStore.getState().reset(); useEditorStore.getState().setProject(makeProject({ name: "Beach" })); });

test("undo/redo buttons reflect history and work", async () => {
  const onExport = jest.fn();
  await render(<EditorTopBar onExport={onExport} />);
  expect(screen.getByLabelText("Undo")).toBeDisabled();
  await act(() => useEditorStore.getState().apply((p) => setAspectRatio(p, "1:1")));
  expect(screen.getByLabelText("Undo")).toBeEnabled();
  await fireEvent.press(screen.getByLabelText("Undo"));
  expect(useEditorStore.getState().project?.aspectRatio).toBe("9:16");
  expect(screen.getByLabelText("Redo")).toBeEnabled();
  await fireEvent.press(screen.getByText("Export"));
  expect(onExport).toHaveBeenCalled();
  expect(screen.getByText("Beach")).toBeTruthy();
});
