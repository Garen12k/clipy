import { render, screen } from "@testing-library/react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-02T10:00:00.000Z" }));
import { makeClip, makeProject } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { theme } from "@/src/theme/theme";
import { FilterSheet } from "../components/FilterSheet";
import { SpeedSheet } from "../components/SpeedSheet";

beforeEach(() => {
  useEditorStore.getState().reset();
  useEditorStore.getState().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 4, filter: "warm" })] }));
});

test("the selected filter tile carries the gold ring", async () => {
  await render(<FilterSheet clipId="a" visible onClose={() => {}} />);
  expect(screen.getByTestId("filter-tile-warm")).toHaveStyle(theme.ring);
  expect(screen.getByTestId("filter-tile-none")).not.toHaveStyle({ borderColor: theme.ring.borderColor });
});

test("sliders use the accent track and thumb", async () => {
  await render(<SpeedSheet clipId="a" visible onClose={() => {}} />);
  const s = screen.getByTestId("speed-slider");
  expect(s.props.minimumTrackTintColor).toBe(theme.colors.accent);
  expect(s.props.thumbTintColor).toBe(theme.colors.accent);
  expect(s.props.maximumTrackTintColor).toBe(theme.colors.sea);
});
