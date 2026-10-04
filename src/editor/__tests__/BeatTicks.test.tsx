import { StyleSheet } from "react-native";
import { render, screen } from "@testing-library/react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
import { makeClip, makeProject } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { theme } from "@/src/theme/theme";
import { BeatTicks } from "../components/BeatTicks";

beforeEach(() => { useEditorStore.getState().reset(); });

test("one 2 × 10 pt accent tick per beat marker, centred on its time at the top, out of the flow and untouchable", async () => {
  useEditorStore.getState().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 10 })], beatMarkers: [0.5, 2, 4.25] }));
  useEditorStore.getState().setZoom(40);
  await render(<BeatTicks />);
  const layer = screen.getByTestId("beat-ticks");
  expect(layer.props.pointerEvents).toBe("none");
  expect(StyleSheet.flatten(layer.props.style)).toEqual({ position: "absolute", left: 0, top: 0, width: 0, height: 0 });
  const ticks = screen.getAllByTestId("beat-tick");
  expect(ticks.map((t) => StyleSheet.flatten(t.props.style).left)).toEqual([19, 79, 169]);
  for (const t of ticks) expect(t).toHaveStyle({ position: "absolute", top: 0, width: 2, height: 10, backgroundColor: theme.colors.accent });
});

test("no markers, no ticks", async () => {
  useEditorStore.getState().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 10 })] }));
  await render(<BeatTicks />);
  expect(screen.queryAllByTestId("beat-tick")).toHaveLength(0);
});
