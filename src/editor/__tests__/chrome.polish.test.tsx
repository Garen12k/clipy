import { fireEvent, render, screen } from "@testing-library/react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-05T10:00:00.000Z" }));
jest.mock("expo-router", () => ({ router: { back: jest.fn(), push: jest.fn() } }));
import { makeClip, makeProject } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { theme } from "@/src/theme/theme";
import { EditorTopBar } from "../components/EditorTopBar";
import { TransportRow } from "../components/TransportRow";
import { closeStrip, useToolStrip } from "../toolStrip";

const st = () => useEditorStore.getState();
beforeEach(() => { closeStrip(); st().reset(); st().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 4 })] })); });

test("the top bar is an explicit 48-pt row on the gutter; Export is still its one main button", async () => {
  const onExport = jest.fn();
  await render(<EditorTopBar onExport={onExport} />);
  expect(screen.getByTestId("editor-top-bar")).toHaveStyle({ height: theme.size.row, paddingLeft: theme.space.sm, paddingRight: theme.space.gutter, paddingBottom: theme.space.sm });
  expect(screen.getByRole("button", { name: "Back" })).toBeTruthy();
  expect(screen.getAllByTestId("primary-button")).toHaveLength(1);
  await fireEvent.press(screen.getByRole("button", { name: "Export" }));
  expect(onExport).toHaveBeenCalledTimes(1);
});

test("the play row is an explicit 48-pt row; undo, play, the ratio pill and redo work as before", async () => {
  await render(<TransportRow />);
  expect(screen.getByTestId("transport-row")).toHaveStyle({ height: theme.size.row, paddingHorizontal: theme.space.sm });
  expect(screen.getByRole("button", { name: "Undo" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Redo" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Play" })).toHaveStyle({ width: theme.size.iconButton, height: theme.size.iconButton });
  await fireEvent.press(screen.getByRole("button", { name: "Play" }));
  expect(st().isPlaying).toBe(true);
  const pill = screen.getByRole("button", { name: "Aspect ratio" });
  const slop = pill.props.hitSlop as { top: number; bottom: number };
  expect(theme.size.chipCompact + slop.top + slop.bottom).toBeGreaterThanOrEqual(theme.size.touch);
  await fireEvent.press(pill);
  expect(useToolStrip.getState().open?.id).toBe("ratio");
});
