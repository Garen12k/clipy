import { fireEvent, render, screen } from "@testing-library/react-native";
jest.mock("expo-router", () => ({ router: { back: jest.fn() } }));
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
import { makeProject } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { EditorTopBar } from "../components/EditorTopBar";

beforeEach(() => { useEditorStore.getState().reset(); useEditorStore.getState().setProject(makeProject({ name: "Beach" })); });

test("shows back, the project name and an Export button", async () => {
  const onExport = jest.fn();
  await render(<EditorTopBar onExport={onExport} />);
  expect(screen.getByRole("button", { name: "Back" })).toBeTruthy();
  expect(screen.getByText("Beach")).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: "Export" }));
  expect(onExport).toHaveBeenCalled();
});
