import { act, fireEvent, render, screen, within } from "@testing-library/react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-02T10:00:00.000Z" }));
import { renameProject } from "@/src/editor/model/ops";
import { makeClip, makeProject } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { theme } from "@/src/theme/theme";
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

test("the ratio pill shows the choice's label: Auto, or the ratio", async () => {
  useEditorStore.getState().setProject(makeProject({ aspectRatio: "auto", clips: [makeClip({ id: "a", sourceDuration: 21, width: 1920, height: 1080 })] }));
  await render(<TransportRow />);
  expect(screen.getByRole("button", { name: "Aspect ratio" })).toHaveTextContent("Auto");
  await act(() => { useEditorStore.getState().setProject(makeProject({ aspectRatio: "21:9", clips: [makeClip({ id: "a", sourceDuration: 21 })] })); });
  expect(screen.getByRole("button", { name: "Aspect ratio" })).toHaveTextContent("21:9");
});

test("Undo and Redo sit side by side in one slate capsule at the leading edge, each a 44-pt target, dimmed while there is nothing to undo or redo", async () => {
  await render(<TransportRow />);
  const capsule = screen.getByTestId("transport-history");
  expect(capsule).toHaveStyle({ flexDirection: "row", borderRadius: theme.radius.pill, backgroundColor: theme.elevation.bar });
  expect(within(screen.getByTestId("transport-leading")).getByTestId("transport-history")).toBeTruthy();
  for (const name of ["Undo", "Redo"]) {
    const b = within(capsule).getByRole("button", { name });
    expect(b).toBeDisabled();
    expect(b).toHaveStyle({ width: theme.size.touch, opacity: 0.35 });
    const slop = b.props.hitSlop as { top: number; bottom: number };
    expect((b.props.style as { height: number }[]).reduce((h, s) => s?.height ?? h, 0) + slop.top + slop.bottom).toBeGreaterThanOrEqual(theme.size.touch);
  }
  await act(() => { useEditorStore.getState().apply((p) => renameProject(p, "X")); });
  expect(within(capsule).getByRole("button", { name: "Undo" })).toBeEnabled();
  expect(within(capsule).getByRole("button", { name: "Undo" })).toHaveStyle({ opacity: 1 });
  expect(within(capsule).getByRole("button", { name: "Redo" })).toBeDisabled();
  await fireEvent.press(within(capsule).getByRole("button", { name: "Undo" }));
  expect(within(capsule).getByRole("button", { name: "Redo" })).toBeEnabled();
  await fireEvent.press(within(capsule).getByRole("button", { name: "Redo" }));
  expect(useEditorStore.getState().project?.name).toBe("X");
});

test("Play is a white disc with a dark glyph between the two sides, and its target is 44 pt", async () => {
  await render(<TransportRow />);
  const play = screen.getByRole("button", { name: "Play" });
  expect(play).toHaveStyle({ width: theme.size.iconButton, height: theme.size.iconButton, borderRadius: theme.radius.pill, backgroundColor: theme.colors.text });
  expect(theme.size.iconButton + 2 * (play.props.hitSlop as number)).toBeGreaterThanOrEqual(theme.size.touch);
  expect(within(screen.getByTestId("transport-leading")).queryByRole("button", { name: "Play" })).toBeNull();
  expect(within(screen.getByTestId("transport-trailing")).queryByRole("button", { name: "Play" })).toBeNull();
  // The two sides share the room equally, so the disc is in the middle whatever they hold.
  expect(screen.getByTestId("transport-leading")).toHaveStyle({ flex: 1 });
  expect(screen.getByTestId("transport-trailing")).toHaveStyle({ flex: 1 });
});

test("Play does nothing with no clips", async () => {
  useEditorStore.getState().setProject(makeProject());
  await render(<TransportRow />);
  await fireEvent.press(screen.getByRole("button", { name: "Play" }));
  expect(useEditorStore.getState().isPlaying).toBe(false);
});

test("the time sits at the trailing edge before the ratio pill: the current time white and semibold, the total muted, tabular digits", async () => {
  await render(<TransportRow />);
  await act(() => { useEditorStore.getState().seek(7); });
  const trailing = screen.getByTestId("transport-trailing");
  const time = within(trailing).getByTestId("transport-time");
  expect(time).toHaveTextContent("0:07 / 0:21");
  expect(time).toHaveStyle({ fontVariant: ["tabular-nums"], fontSize: theme.type.small, color: theme.colors.textMuted });
  expect(time.props.numberOfLines).toBe(1);
  expect(within(time).getByText("0:07")).toHaveStyle({ color: theme.colors.text, fontWeight: theme.weight.semi });
  expect(within(trailing).getByRole("button", { name: "Aspect ratio" })).toBeTruthy();
  expect(within(trailing).queryByRole("button", { name: "Redo" })).toBeNull();
});

test("the ratio pill is an outlined capsule whose line can be seen", async () => {
  await render(<TransportRow />);
  expect(screen.getByTestId("transport-ratio")).toHaveStyle({ height: theme.size.chipCompact, borderWidth: 1, borderColor: theme.colors.track, borderRadius: theme.radius.pill });
});

test("the row keeps its height", async () => {
  await render(<TransportRow />);
  expect(screen.getByTestId("transport-row")).toHaveStyle({ height: theme.size.row });
});
