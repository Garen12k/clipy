import { act, fireEvent, render, screen } from "@testing-library/react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
jest.mock("@react-native-community/slider", () => { const { View } = require("react-native"); return ({ testID, value, thumbTintColor, onSlidingStart, onValueChange }: { testID?: string; value?: number; thumbTintColor?: string; onSlidingStart?: () => void; onValueChange?: (v: number) => void }) => <View testID={testID} {...{ value, thumbTintColor }} onTouchStart={() => onSlidingStart?.()} onTouchMove={() => onValueChange?.(1.5)} />; });
import * as Haptics from "expo-haptics";
import { StyleSheet } from "react-native";
import { SPEED_CURVES } from "@/src/editor/effects";
import { setClipSpeedCurve } from "@/src/editor/model/ops";
import { makeClip, makeProject, SPEED_CURVE_IDS } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { theme } from "@/src/theme/theme";
import { useToast } from "@/src/ui/Toast";
import { SpeedSheet } from "../components/SpeedSheet";

const clip = (i = 0) => useEditorStore.getState().project!.clips[i];
const past = () => useEditorStore.getState().past.length;
const press = (name: string) => fireEvent.press(screen.getByRole("button", { name }));
const tile = (name: string) => screen.getByRole("button", { name });
const flat = (id: string) => StyleSheet.flatten(screen.getByTestId(id).props.style);
const impact = Haptics.impactAsync as jest.Mock;

beforeEach(() => {
  impact.mockClear();
  useToast.getState().clear();
  useEditorStore.getState().reset();
  // "a": 8 s. "s": 0.12 s — long enough as it is, too short once Flash in speeds it up.
  useEditorStore.getState().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 8 }), makeClip({ id: "s", sourceDuration: 0.12 })] }));
});

test("chips set the speed; the slider is one undo step", async () => {
  await render(<SpeedSheet clipId="a" visible onClose={() => {}} />);
  await fireEvent.press(screen.getByRole("button", { name: "2×" }));
  expect(useEditorStore.getState().project!.clips[0].speed).toBe(2);
  const slider = screen.getByTestId("speed-slider");
  await fireEvent(slider, "touchStart"); await fireEvent(slider, "touchMove");
  expect(useEditorStore.getState().project!.clips[0].speed).toBe(1.5);
  expect(useEditorStore.getState().past).toHaveLength(2);
  expect(screen.getByText("1.5×")).toBeTruthy();
});

describe("tabs", () => {
  test("opens on Normal for a clip without a curve: the slider, no curve tiles", async () => {
    await render(<SpeedSheet clipId="a" visible onClose={() => {}} />);
    expect(tile("Normal")).toBeSelected();
    expect(tile("Curve")).not.toBeSelected();
    expect(screen.getByTestId("speed-slider")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Montage" })).toBeNull();
  });

  test("the Curve tab lists None and the six presets with None selected, and no slider", async () => {
    await render(<SpeedSheet clipId="a" visible onClose={() => {}} />);
    await press("Curve");
    expect(tile("Curve")).toBeSelected();
    expect(screen.queryByTestId("speed-slider")).toBeNull();
    expect(tile("None")).toBeSelected();
    expect(SPEED_CURVE_IDS).toHaveLength(6);
    for (const id of SPEED_CURVE_IDS) expect(tile(SPEED_CURVES[id].label)).not.toBeSelected();
  });

  test("opens on Curve when the clip has a curve", async () => {
    useEditorStore.getState().apply((p) => setClipSpeedCurve(p, "a", "bullet"));
    await render(<SpeedSheet clipId="a" visible onClose={() => {}} />);
    expect(tile("Curve")).toBeSelected();
    expect(tile("Bullet")).toBeSelected();
    expect(tile("None")).not.toBeSelected();
  });
});

describe("curve tiles", () => {
  test("a pick sets the curve in one undo step with a light haptic and the ring; None clears it", async () => {
    await render(<SpeedSheet clipId="a" visible onClose={() => {}} />);
    await press("Curve");
    await press("Hero");
    expect(clip().speedCurve?.id).toBe("hero");
    expect(clip().speedCurve?.steps.map((s) => s.speed)).toEqual([1, 2, 3, 0.5, 0.5, 3, 2, 1]);
    expect(clip().speed).toBe(1);
    expect(past()).toBe(1);
    expect(impact).toHaveBeenCalledTimes(1);
    expect(tile("Hero")).toBeSelected();
    expect(tile("None")).not.toBeSelected();
    expect(screen.getByTestId("curve-tile-hero")).toHaveStyle(theme.ring);
    expect(screen.getByTestId("curve-tile-none")).not.toHaveStyle({ borderColor: theme.ring.borderColor });
    await press("None");
    expect(clip().speedCurve).toBeNull();
    expect(past()).toBe(2);
    expect(screen.getByTestId("curve-tile-none")).toHaveStyle(theme.ring);
    await act(() => { useEditorStore.getState().undo(); });
    expect(clip().speedCurve?.id).toBe("hero");
  });

  test("re-picking the selected tile is a no-op: no undo step, no haptic, no toast", async () => {
    await render(<SpeedSheet clipId="a" visible onClose={() => {}} />);
    await press("Curve");
    await press("None");
    expect(past()).toBe(0);
    await press("Montage");
    impact.mockClear();
    await press("Montage");
    expect(past()).toBe(1);
    expect(impact).not.toHaveBeenCalled();
    expect(useToast.getState().message).toBeNull();
  });

  test("a preset that would make the clip too short is refused with a toast and no haptic", async () => {
    await render(<SpeedSheet clipId="s" visible onClose={() => {}} />);
    await press("Curve");
    await press("Flash in");
    expect(clip(1).speedCurve).toBeNull();
    expect(past()).toBe(0);
    expect(useToast.getState().message).toBe("This clip is too short for a speed curve.");
    expect(impact).not.toHaveBeenCalled();
    expect(tile("None")).toBeSelected();
  });

  test("each preset draws eight bars, speed / 4 of the sparkline's height; None draws a flat line", async () => {
    await render(<SpeedSheet clipId="a" visible onClose={() => {}} />);
    await press("Curve");
    const h = flat("curve-spark-hero").height as number;
    expect(h).toBeGreaterThan(0);
    for (const id of SPEED_CURVE_IDS) {
      SPEED_CURVES[id].shape.forEach((speed, i) => expect(flat(`curve-bar-${id}-${i}`).height).toBeCloseTo((speed / 4) * h, 10));
      expect(screen.queryByTestId(`curve-bar-${id}-8`)).toBeNull();
    }
    expect(screen.getByTestId("curve-flat-none")).toBeTruthy();
    expect(screen.queryByTestId("curve-bar-none-0")).toBeNull();
  });

  test("the bars are accent on the selected tile and muted on the others", async () => {
    await render(<SpeedSheet clipId="a" visible onClose={() => {}} />);
    await press("Curve");
    expect(flat("curve-flat-none").backgroundColor).toBe(theme.colors.accent);
    expect(flat("curve-bar-hero-0").backgroundColor).toBe(theme.colors.textMuted);
    await press("Hero");
    expect(flat("curve-bar-hero-0").backgroundColor).toBe(theme.colors.accent);
    expect(flat("curve-bar-montage-0").backgroundColor).toBe(theme.colors.textMuted);
    expect(flat("curve-flat-none").backgroundColor).toBe(theme.colors.textMuted);
  });
});

describe("Normal tab while a curve is active", () => {
  beforeEach(() => { useEditorStore.getState().apply((p) => setClipSpeedCurve(p, "a", "hero")); });

  test("the slider shows 1× with a muted look and a note; no speed chip is selected", async () => {
    await render(<SpeedSheet clipId="a" visible onClose={() => {}} />);
    await press("Normal");
    const slider = screen.getByTestId("speed-slider");
    expect(slider.props.value).toBe(1);
    expect(slider.props.thumbTintColor).toBe(theme.colors.textMuted);
    expect(screen.getByText("A curve is active — moving this slider removes it.")).toBeTruthy();
    expect(tile("1×")).not.toBeSelected();
  });

  test("moving the slider clears the curve and sets the speed, as one undo step", async () => {
    await render(<SpeedSheet clipId="a" visible onClose={() => {}} />);
    await press("Normal");
    const before = past();
    const slider = screen.getByTestId("speed-slider");
    await fireEvent(slider, "touchStart"); await fireEvent(slider, "touchMove"); await fireEvent(slider, "touchMove");
    expect(clip().speedCurve).toBeNull();
    expect(clip().speed).toBe(1.5);
    expect(past()).toBe(before + 1);
    expect(screen.queryByText("A curve is active — moving this slider removes it.")).toBeNull();
    expect(screen.getByTestId("speed-slider").props.thumbTintColor).toBe(theme.colors.accent);
    await act(() => { useEditorStore.getState().undo(); });
    expect(clip().speedCurve?.id).toBe("hero");
  });

  test("a speed chip clears the curve too", async () => {
    await render(<SpeedSheet clipId="a" visible onClose={() => {}} />);
    await press("Normal");
    await press("1×");
    expect(clip().speedCurve).toBeNull();
    expect(clip().speed).toBe(1);
  });
});

describe("length label", () => {
  test("shows the clip's output length under either tab and follows speed and curve", async () => {
    await render(<SpeedSheet clipId="a" visible onClose={() => {}} />);
    expect(screen.getByText("Clip length 8.0 s")).toBeTruthy();
    await press("2×");
    expect(screen.getByText("Clip length 4.0 s")).toBeTruthy();
    await press("Curve");
    expect(screen.getByText("Clip length 4.0 s")).toBeTruthy();
    // Hero over 8 s: 1 s slices at 1, 2, 3, 0.5, 0.5, 3, 2, 1 → 1 + 0.5 + 0.333 + 2 + 2 + 0.333 + 0.5 + 1 = 7.67 s.
    await press("Hero");
    expect(screen.getByText("Clip length 7.7 s")).toBeTruthy();
    await press("Normal");
    expect(screen.getByText("Clip length 7.7 s")).toBeTruthy();
  });
});

test("renders nothing when the clip is gone", async () => {
  await render(<SpeedSheet clipId="zzz" visible onClose={() => {}} />);
  expect(screen.queryByText("Speed")).toBeNull();
});
