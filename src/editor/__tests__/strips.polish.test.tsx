import { fireEvent, render, screen } from "@testing-library/react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-05T10:00:00.000Z" }));
import * as Haptics from "expo-haptics";
import { makeClip, makeProject } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { theme } from "@/src/theme/theme";
import { TILE_WIDTH } from "@/src/ui/Tile";
import { ToneContext } from "@/src/ui/tone";
import { AdjustSheet } from "../components/AdjustSheet";
import { MaskSheet } from "../components/MaskSheet";
import { OpacitySheet } from "../components/OpacitySheet";
import { VolumeSheet } from "../components/VolumeSheet";

const st = () => useEditorStore.getState();
const ticks = () => (Haptics.impactAsync as jest.Mock).mock.calls.length;
beforeEach(() => {
  st().reset();
  st().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 4 }), makeClip({ id: "b", sourceDuration: 4 })] }));
  (Haptics.impactAsync as jest.Mock).mockClear();
});

test("a strip's slider is the kit's: themed, and its name and value are one text with the value picked out", async () => {
  await render(<OpacitySheet clipId="a" visible onClose={() => {}} />);
  expect(screen.getByTestId("opacity-slider").props).toMatchObject({ minimumTrackTintColor: theme.colors.accent, maximumTrackTintColor: theme.colors.track, thumbTintColor: theme.colors.accent });
  expect(screen.getByText("Opacity 100 %")).toBeTruthy();
  expect(screen.getByText("100 %")).toHaveStyle({ color: theme.colors.text, fontVariant: ["tabular-nums"] });
});

test("Volume ticks at 100 %; the drag is still one undo step and the value is not snapped", async () => {
  await render(<VolumeSheet clipId="a" visible onClose={() => {}} />);
  const s = screen.getByTestId("volume-slider");
  await fireEvent(s, "slidingStart", 1);
  await fireEvent(s, "valueChange", 0.6);
  expect(ticks()).toBe(0);
  await fireEvent(s, "valueChange", 1.05);                       // passes 100 %
  expect(ticks()).toBe(1);
  expect(st().project!.clips[0].volume).toBeCloseTo(1.05);
  expect(st().past).toHaveLength(1);
  expect(screen.getAllByText("105%").length).toBeGreaterThanOrEqual(1);
});

test("Adjust ticks at 0 for a two-sided control; Reset is a quiet button, disabled while nothing is adjusted", async () => {
  await render(<AdjustSheet clipId="a" visible onClose={() => {}} />);
  expect(screen.getByRole("button", { name: "Reset" })).toBeDisabled();
  expect(screen.getByText("Reset")).toHaveStyle({ color: theme.colors.accent, fontWeight: theme.weight.semi });
  const s = screen.getByTestId("adjust-slider");
  await fireEvent(s, "slidingStart", 0);
  await fireEvent(s, "valueChange", 0.35);
  expect(ticks()).toBe(0);                                       // moving away from 0
  await fireEvent(s, "valueChange", -0.1);                       // back through 0
  expect(ticks()).toBe(1);
  expect(screen.getByText("Brightness -10")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Reset" })).not.toBeDisabled();
});

/** As in the app: the editor says its family once, on its Screen (src/ui/tone.ts); a part rendered bare would be on a navy screen. */
const inEditor = { wrapper: ({ children }: { children: React.ReactNode }) => <ToneContext.Provider value="editor">{children}</ToneContext.Provider> };

test("Mask uses the kit tile: the ring and the lighter box on the selected one, one undo step per pick", async () => {
  await render(<MaskSheet clipId="a" visible onClose={() => {}} />, inEditor);
  expect(screen.getByRole("button", { name: "None" })).toBeSelected();
  expect(screen.getByRole("button", { name: "None" })).toHaveStyle({ width: TILE_WIDTH });
  expect(screen.getByTestId("mask-tile-none")).toHaveStyle({ backgroundColor: theme.elevation.lifted, ...theme.ring });
  expect(screen.getByTestId("mask-tile-circle")).toHaveStyle({ backgroundColor: theme.elevation.tile, ...theme.ringClear });
  await fireEvent.press(screen.getByRole("button", { name: "Circle" }));
  expect(st().project!.clips[0].mask).toBe("circle");
  expect(st().past).toHaveLength(1);
  expect(screen.getByTestId("mask-tile-circle")).toHaveStyle({ ...theme.ring });
});
