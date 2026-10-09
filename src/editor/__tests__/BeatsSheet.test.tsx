import { act, fireEvent, render, screen } from "@testing-library/react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
import * as Haptics from "expo-haptics";
import { makeClip, makeProject } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { theme } from "@/src/theme/theme";
import { StyleSheet } from "react-native";
import { useToast } from "@/src/ui/Toast";
import { BeatsSheet } from "../components/BeatsSheet";

const st = () => useEditorStore.getState();
const markers = () => st().project!.beatMarkers;
const btn = (name: string) => screen.getByRole("button", { name });
const impact = Haptics.impactAsync as jest.Mock;

beforeEach(() => {
  impact.mockClear();
  useToast.getState().clear();
  st().reset();
  st().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 10 })] }));
});

test("title, Tap, a count, and Remove nearest / Clear all disabled while there are no markers", async () => {
  await render(<BeatsSheet visible onClose={() => {}} />);
  expect(screen.getByRole("header", { name: "Beat markers" })).toBeTruthy();
  expect(btn("Tap")).toBeEnabled();
  expect(screen.getByText("0 markers")).toBeTruthy();
  expect(btn("Remove Nearest")).toBeDisabled();
  expect(btn("Clear All")).toBeDisabled();
});

test("Remove nearest and Clear all are compact, so the pair fits between the gutters of a 375-pt phone; Tap stays the regular main button", async () => {
  await render(<BeatsSheet visible onClose={() => {}} />);
  for (const name of ["Remove Nearest", "Clear All"]) {
    expect(btn(name)).toHaveStyle({ height: theme.size.controlCompact, paddingHorizontal: theme.space.lg });
    expect(screen.getByText(name)).toHaveStyle({ fontSize: theme.type.body });
  }
  expect(btn("Tap")).toHaveStyle({ height: theme.size.control });
});

test("Tap adds a marker at the playhead as it is at press time (also while playing), one undo step each, with a light haptic", async () => {
  await render(<BeatsSheet visible onClose={() => {}} />);
  await act(() => { st().seek(1.5); st().setPlaying(true); });
  await fireEvent.press(btn("Tap"));
  await act(() => { st().seek(3); });   // the playhead moved on without the sheet re-rendering for it
  await fireEvent.press(btn("Tap"));
  expect(markers()).toEqual([1.5, 3]);
  expect(st().past).toHaveLength(2);
  expect(impact).toHaveBeenCalledTimes(2);
  expect(impact).toHaveBeenLastCalledWith("light");
  expect(st().isPlaying).toBe(true);
  expect(screen.getByText("2 markers")).toBeTruthy();
  expect(btn("Remove Nearest")).toBeEnabled();
  expect(btn("Clear All")).toBeEnabled();
});

test("one marker reads “1 marker”", async () => {
  st().apply((p) => ({ ...p, beatMarkers: [2] }));
  await render(<BeatsSheet visible onClose={() => {}} />);
  expect(screen.getByText("1 marker")).toBeTruthy();
});

test("a tap within the minimum gap of a marker is refused silently: no marker, no undo step, no haptic, no toast", async () => {
  st().apply((p) => ({ ...p, beatMarkers: [2] }));
  await render(<BeatsSheet visible onClose={() => {}} />);
  await act(() => { st().seek(2.02); });
  await fireEvent.press(btn("Tap"));
  expect(markers()).toEqual([2]);
  expect(st().past).toHaveLength(1);
  expect(impact).not.toHaveBeenCalled();
  expect(useToast.getState().message).toBeNull();
});

test("Remove nearest removes the marker closest to the playhead in one undo step; out of reach nothing happens", async () => {
  st().apply((p) => ({ ...p, beatMarkers: [1, 2, 6] }));
  await render(<BeatsSheet visible onClose={() => {}} />);
  await act(() => { st().seek(2.1); });
  await fireEvent.press(btn("Remove Nearest"));
  expect(markers()).toEqual([1, 6]);
  expect(st().past).toHaveLength(2);
  await act(() => { st().seek(4); });
  await fireEvent.press(btn("Remove Nearest"));
  expect(markers()).toEqual([1, 6]);
  expect(st().past).toHaveLength(2);
});

test("Clear all removes every marker in one undo step", async () => {
  st().apply((p) => ({ ...p, beatMarkers: [1, 2, 6] }));
  await render(<BeatsSheet visible onClose={() => {}} />);
  await fireEvent.press(btn("Clear All"));
  expect(markers()).toEqual([]);
  expect(st().past).toHaveLength(2);
  expect(screen.getByText("0 markers")).toBeTruthy();
  await act(() => { st().undo(); });
  expect(markers()).toEqual([1, 2, 6]);
});

test("it is a panel: inline, no scrim, regular height (it holds Find beats and Cut to beats too; the body scrolls), Done closes", async () => {
  const onClose = jest.fn();
  await render(<BeatsSheet visible onClose={onClose} />);
  expect(screen.getByTestId("tool-panel")).toHaveStyle({ height: 429 });
  expect(screen.queryByLabelText("Close sheet")).toBeNull();
  await fireEvent.press(btn("Done"));
  expect(onClose).toHaveBeenCalledTimes(1);
});

test("the compact pair sits in a row as tall as a touch target, so the buttons' hit slop has room", async () => {
  await render(<BeatsSheet visible onClose={() => {}} />);
  const row = StyleSheet.flatten(btn("Clear All").parent?.props.style);
  expect(row).toMatchObject({ height: theme.size.touch, alignItems: "center" });
});
