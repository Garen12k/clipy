import { act, fireEvent, render, screen } from "@testing-library/react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
jest.mock("@react-native-community/slider", () => { const { View } = require("react-native"); return ({ testID, value, thumbTintColor, onSlidingStart, onValueChange }: { testID?: string; value?: number; thumbTintColor?: string; onSlidingStart?: () => void; onValueChange?: (v: number) => void }) => <View testID={testID} {...{ value, thumbTintColor }} onTouchStart={() => onSlidingStart?.()} onTouchMove={() => onValueChange?.(1.5)} />; });
import * as Haptics from "expo-haptics";
import { StyleSheet } from "react-native";
import { SPEED_CURVES } from "@/src/editor/effects";
import { setClipSpeed, setClipSpeedCurve } from "@/src/editor/model/ops";
import { clipDuration, curveProfile, curveSteps, isSmoothCurve, smoothCurveSteps } from "@/src/editor/model/timeline";
import { makeClip, makeLayer, makePhotoClip, makeProject, SPEED_CURVE_IDS } from "@/src/editor/model/types";
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
  expect(screen.getAllByText("1.5×")[0]).toBeTruthy();       // the chip and the slider row's value
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
    expect(clip().speedCurve?.steps.map((s) => s.speed)).toEqual(curveProfile("hero", true));
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

  test("re-picking the active preset after the trim changed re-spreads it over the new trim, as one undo step", async () => {
    const { apply } = useEditorStore.getState();
    apply((p) => ({ ...p, clips: p.clips.map((c) => (c.id === "a" ? { ...c, trimStart: 2, trimEnd: 6 } : c)) }));
    apply((p) => setClipSpeedCurve(p, "a", "hero"));
    apply((p) => ({ ...p, clips: p.clips.map((c) => (c.id === "a" ? { ...c, trimStart: 0, trimEnd: 8 } : c)) }));
    expect(clip().speedCurve?.steps.map((s) => s.from)).toEqual([2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5]);
    const onClose = jest.fn();
    await render(<SpeedSheet clipId="a" visible onClose={onClose} />);
    const before = past();
    impact.mockClear();
    await press("Hero");
    expect(clip().speedCurve).toEqual({ id: "hero", steps: curveSteps("hero", 0, 8) });
    expect(past()).toBe(before + 1);
    expect(impact).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
    expect(useToast.getState().message).toBeNull();
    // Tapping it again changes nothing, silently.
    impact.mockClear();
    await press("Hero");
    expect(past()).toBe(before + 1);
    expect(impact).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(useToast.getState().message).toBeNull();
  });

  test("a preset that would make the clip too short is refused: the strip closes, then a toast shows; no haptic", async () => {
    // The strip closes first so the bar below it shows again, then the message.
    const order: string[] = [];
    const onClose = jest.fn(() => { order.push("close"); });
    const unsub = useToast.subscribe((t) => { if (t.message) order.push("toast"); });
    await render(<SpeedSheet clipId="s" visible onClose={onClose} />);
    await press("Curve");
    await press("Flash in");
    unsub();
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(order).toEqual(["close", "toast"]);
    expect(clip(1).speedCurve).toBeNull();
    expect(past()).toBe(0);
    expect(useToast.getState().message).toBe("This clip is too short for a speed curve.");
    expect(impact).not.toHaveBeenCalled();
    expect(tile("None")).toBeSelected();
  });

  test("an accepted pick does not close the sheet", async () => {
    const onClose = jest.fn();
    await render(<SpeedSheet clipId="a" visible onClose={onClose} />);
    await press("Curve");
    await press("Hero");
    await press("None");
    expect(onClose).not.toHaveBeenCalled();
  });

  test("each preset draws eight bars, speed / 4 of the sparkline's height; None draws a flat line", async () => {
    await render(<SpeedSheet clipId="a" visible onClose={() => {}} />);
    await press("Curve");
    await fireEvent(screen.getByLabelText("Smooth"), "valueChange", false);
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
    expect(screen.queryByText("Audio keeps its pitch in the exported video.")).toBeNull(); // only the curve note
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
    expect(screen.getByText("Audio keeps its pitch in the exported video.")).toBeTruthy();
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
    // Hero over 8 s, smooth (a new pick): 32 pieces of 0.25 s at the speeds of curveProfile("hero", true) → 6.58 s.
    await press("Hero");
    expect(clipDuration(clip())).toBeCloseTo(6.584331, 6);
    expect(screen.getByText("Clip length 6.6 s")).toBeTruthy();
    await press("Normal");   // the curve warning takes the header: no length line here
    expect(screen.queryByText(/Clip length/)).toBeNull();
  });
});

test("renders nothing when the clip is gone", async () => {
  await render(<SpeedSheet clipId="zzz" visible onClose={() => {}} />);
  expect(screen.queryByText("Speed")).toBeNull();
});

test("without clipIds the title is Speed", async () => {
  await render(<SpeedSheet clipId="a" visible onClose={() => {}} />);
  expect(screen.getByRole("header", { name: "Speed" })).toBeTruthy();
});

describe("clipIds (multi-select)", () => {
  const speeds = () => useEditorStore.getState().project!.clips.map((c) => c.speed);
  const curves = () => useEditorStore.getState().project!.clips.map((c) => c.speedCurve?.id ?? null);
  beforeEach(() => {
    // a: 8 s, b: 6 s, s: 0.12 s (too short for Flash in), p: a photo; l: a layer.
    useEditorStore.getState().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 8 }), makeClip({ id: "b", sourceDuration: 6 }), makeClip({ id: "s", sourceDuration: 0.12 }), makePhotoClip({ id: "p" })],
      layers: [makeLayer({ id: "l", sourceDuration: 2 })] }));
  });

  test("a chip and the slider write every listed video clip, one undo step each; photos and a layer id are skipped", async () => {
    await render(<SpeedSheet clipId="a" clipIds={["a", "b", "p", "l"]} visible onClose={() => {}} />);
    expect(screen.getByRole("header", { name: "Speed · 3 clips" })).toBeTruthy();
    await press("2×");
    expect(speeds()).toEqual([2, 2, 1, 1]);
    expect(useEditorStore.getState().project!.layers[0].speed).toBe(1);
    expect(past()).toBe(1);
    expect(screen.getByText("Clip length 4.0 s")).toBeTruthy();   // the shown clip only
    const slider = screen.getByTestId("speed-slider");
    await fireEvent(slider, "touchStart"); await fireEvent(slider, "touchMove"); await fireEvent(slider, "touchMove");
    expect(speeds()).toEqual([1.5, 1.5, 1, 1]);
    expect(past()).toBe(2);
    await act(() => { useEditorStore.getState().undo(); });
    expect(speeds()).toEqual([2, 2, 1, 1]);
  });

  test("a curve tile sets the curve on the clips that can take it, in one undo step; the too-short one is skipped silently", async () => {
    const onClose = jest.fn();
    await render(<SpeedSheet clipId="a" clipIds={["a", "b", "s", "p"]} visible onClose={onClose} />);
    await press("Curve");
    await press("Flash in");
    expect(curves()).toEqual(["flashIn", "flashIn", null, null]);
    expect(past()).toBe(1);
    expect(impact).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
    expect(useToast.getState().message).toBeNull();
  });

  test("when no listed clip can take the curve the sheet closes with a toast and nothing changes", async () => {
    const onClose = jest.fn();
    await render(<SpeedSheet clipId="s" clipIds={["s", "p"]} visible onClose={onClose} />);
    await press("Curve");
    await press("None");                                          // the shown clip's own tile: silent
    expect(onClose).not.toHaveBeenCalled();
    await press("Flash in");
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(useToast.getState().message).toBe("These clips are too short for a speed curve.");
    expect(past()).toBe(0);
    expect(impact).not.toHaveBeenCalled();
  });
});

type ScrollInst = ReturnType<typeof screen.getByTestId>;
const findRowScroll = (n: ScrollInst): ScrollInst | null => { if (n.props.contentOffset !== undefined) return n; for (const c of n.children) { if (typeof c === "string") continue; const f = findRowScroll(c as ScrollInst); if (f) return f; } return null; };
/** Where the tile row starts (the kit hands it to its ScrollView as contentOffset). */
const rowStartX = () => findRowScroll(screen.getByTestId("strip-tiles"))!.props.contentOffset.x as number;

test("the tile row keeps its offset across picks, on both tabs; the next opening works it out again", async () => {
  useEditorStore.getState().apply((p) => setClipSpeed(p, "a", 4));
  const view = await render(<SpeedSheet clipId="a" visible onClose={() => {}} />);
  const at4x = 5 * (64 + 8) - 64;                             // 4× is chip 5; a chip counts as 64 wide
  expect(rowStartX()).toBe(at4x);
  await press("0.5×");
  expect(clip().speed).toBe(0.5);
  expect(rowStartX()).toBe(at4x);                             // the row did not move under the finger
  await press("Curve");
  expect(rowStartX()).toBe(0);
  await press("Flash out");
  expect(clip().speedCurve?.id).toBe("flashOut");
  expect(rowStartX()).toBe(0);
  await view.rerender(<SpeedSheet clipId="a" visible={false} onClose={() => {}} />);
  await view.rerender(<SpeedSheet clipId="a" visible onClose={() => {}} />);
  expect(rowStartX()).toBe(6 * 80 - 72);                      // opens on Curve: None, then Flash out as tile 6
});

describe("Smooth", () => {
  const smooth = () => screen.getByLabelText("Smooth");
  const setSmooth = (on: boolean) => fireEvent(smooth(), "valueChange", on);
  const stepped = (id: string, seconds: number, curve: "bullet" | "flashOut") => ({ ...makeClip({ id, sourceDuration: seconds }), speedCurve: { id: curve, steps: curveSteps(curve, 0, seconds) } });

  test("the Curve tab has a Smooth row of the slider row's height; the Normal tab has none", async () => {
    await render(<SpeedSheet clipId="a" visible onClose={() => {}} />);
    expect(screen.queryByLabelText("Smooth")).toBeNull();
    await press("Curve");
    expect(flat("speed-smooth-row").height).toBe(36);
    expect(flat("speed-smooth-row").paddingHorizontal).toBe(theme.space.gutter);
    expect(screen.queryByTestId("speed-slider")).toBeNull();
  });

  test("on for a clip without a curve: a tile writes the smooth form, in one undo step", async () => {
    await render(<SpeedSheet clipId="a" visible onClose={() => {}} />);
    await press("Curve");
    expect(smooth().props.value).toBe(true);
    await press("Hero");
    expect(clip().speedCurve).toEqual({ id: "hero", steps: smoothCurveSteps("hero", 0, 8) });
    expect(isSmoothCurve(clip())).toBe(true);
    expect(past()).toBe(1);
  });

  test("a clip from an old project: its stepped curve is shown as it is — the switch is off, and opening the strip changes nothing", async () => {
    useEditorStore.getState().setProject(makeProject({ clips: [stepped("a", 8, "bullet")] }));
    const stored = clip();
    await render(<SpeedSheet clipId="a" visible onClose={() => {}} />);
    expect(tile("Bullet")).toBeSelected();
    expect(smooth().props.value).toBe(false);
    expect(clip()).toBe(stored);
    expect(past()).toBe(0);
    // Its tile again, in the form it has: still nothing.
    await press("Bullet");
    expect(clip()).toBe(stored);
  });

  test("opening the strip, changing tabs and closing it write nothing: the same project object, no undo step, no haptic", async () => {
    useEditorStore.getState().setProject(makeProject({ clips: [stepped("a", 8, "bullet"), makeClip({ id: "b", sourceDuration: 6 })] }));
    const stored = useEditorStore.getState().project;
    for (const id of ["a", "b"]) {
      const view = await render(<SpeedSheet clipId={id} visible onClose={() => {}} />);
      await press("Normal"); await press("Curve"); await press("Normal"); await press("Curve");
      await view.rerender(<SpeedSheet clipId={id} visible={false} onClose={() => {}} />);
      await view.unmount();
    }
    expect(useEditorStore.getState().project).toBe(stored);
    expect(past()).toBe(0);
    expect(impact).not.toHaveBeenCalled();
    expect(useToast.getState().message).toBeNull();
  });

  test("the switch rewrites the clip's curve in the other form: one undo step each way, the same preset", async () => {
    useEditorStore.getState().apply((p) => setClipSpeedCurve(p, "a", "hero"));
    await render(<SpeedSheet clipId="a" visible onClose={() => {}} />);
    const before = past();
    await setSmooth(true);
    expect(clip().speedCurve).toEqual({ id: "hero", steps: smoothCurveSteps("hero", 0, 8) });
    expect(past()).toBe(before + 1);
    expect(tile("Hero")).toBeSelected();
    await setSmooth(false);
    expect(clip().speedCurve).toEqual({ id: "hero", steps: curveSteps("hero", 0, 8) });
    expect(past()).toBe(before + 2);
    await act(() => { useEditorStore.getState().undo(); });
    expect(isSmoothCurve(clip())).toBe(true);
  });

  test("the switch shows the form the clip's curve has, also after an undo", async () => {
    useEditorStore.getState().apply((p) => setClipSpeedCurve(p, "a", "hero"));
    await render(<SpeedSheet clipId="a" visible onClose={() => {}} />);
    await setSmooth(true);
    expect(smooth().props.value).toBe(true);
    await act(() => { useEditorStore.getState().undo(); });
    expect(isSmoothCurve(clip())).toBe(false);
    expect(smooth().props.value).toBe(false);
    expect(flat("curve-bar-hero-0").width).toBe(3);
    // A tile now writes the form shown: stepped.
    await press("Montage");
    expect(clip().speedCurve).toEqual({ id: "montage", steps: curveSteps("montage", 0, 8) });
  });

  test("with no curve the switch only chooses the form of the next pick: no undo step", async () => {
    await render(<SpeedSheet clipId="a" visible onClose={() => {}} />);
    await press("Curve");
    await setSmooth(false);
    expect(past()).toBe(0);
    expect(clip().speedCurve).toBeNull();
    expect(impact).not.toHaveBeenCalled();
    await press("Montage");
    expect(clip().speedCurve).toEqual({ id: "montage", steps: curveSteps("montage", 0, 8) });
  });

  test("the pictures follow the switch: 32 thin bars from the stored numbers when on, the eight bars of before when off", async () => {
    await render(<SpeedSheet clipId="a" visible onClose={() => {}} />);
    await press("Curve");
    const h = flat("curve-spark-hero").height as number;
    for (const id of SPEED_CURVE_IDS) {
      curveProfile(id, true).forEach((speed, i) => expect(flat(`curve-bar-${id}-${i}`).height).toBeCloseTo((speed / 4) * h, 10));
      expect(screen.queryByTestId(`curve-bar-${id}-32`)).toBeNull();
    }
    expect(flat("curve-bar-hero-0").width).toBe(1);
    await setSmooth(false);
    for (const id of SPEED_CURVE_IDS) {
      SPEED_CURVES[id].shape.forEach((speed, i) => expect(flat(`curve-bar-${id}-${i}`).height).toBeCloseTo((speed / 4) * h, 10));
      expect(screen.queryByTestId(`curve-bar-${id}-8`)).toBeNull();
    }
    expect(flat("curve-bar-hero-0").width).toBe(3);
    expect(screen.getByTestId("curve-flat-none")).toBeTruthy();
  });

  test("a clip too short for the smooth form is refused like any curve that does not fit; the stepped form still goes on", async () => {
    useEditorStore.getState().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 8 }), makeClip({ id: "t", sourceDuration: 0.25 })] }));
    const onClose = jest.fn();
    const view = await render(<SpeedSheet clipId="t" visible onClose={onClose} />);
    await press("Curve");
    await press("Flash out");
    expect(clip(1).speedCurve).toBeNull();
    expect(past()).toBe(0);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(useToast.getState().message).toBe("This clip is too short for a speed curve.");
    // The next opening, Smooth switched off: the eight steps fit.
    await view.rerender(<SpeedSheet clipId="t" visible={false} onClose={onClose} />);
    await view.rerender(<SpeedSheet clipId="t" visible onClose={onClose} />);
    await press("Curve");
    await setSmooth(false);
    await press("Flash out");
    expect(clip(1).speedCurve).toEqual({ id: "flashOut", steps: curveSteps("flashOut", 0, 0.25) });
    expect(past()).toBe(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test("the switch on a stepped clip too short for the smooth form: said once, the stepped curve stays", async () => {
    useEditorStore.getState().setProject(makeProject({ clips: [stepped("t", 0.25, "flashOut")] }));
    const stored = useEditorStore.getState().project;
    const onClose = jest.fn();
    await render(<SpeedSheet clipId="t" visible onClose={onClose} />);
    await setSmooth(true);
    expect(useEditorStore.getState().project).toBe(stored);
    expect(past()).toBe(0);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(useToast.getState().message).toBe("This clip is too short for a speed curve.");
    expect(impact).not.toHaveBeenCalled();
    expect(smooth().props.value).toBe(false);
  });

  test("the limit is said while Smooth is on, in the header", async () => {
    await render(<SpeedSheet clipId="a" visible onClose={() => {}} />);
    await press("Curve");
    expect(screen.getByText("Slow parts can look choppy.")).toBeTruthy();
    await setSmooth(false);
    expect(screen.queryByText("Slow parts can look choppy.")).toBeNull();
  });

  test("several clips: a tile writes the form the switch shows to every clip that can take it", async () => {
    useEditorStore.getState().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 8 }), makeClip({ id: "b", sourceDuration: 6 }), makeClip({ id: "t", sourceDuration: 0.25 })] }));
    await render(<SpeedSheet clipId="a" clipIds={["a", "b", "t"]} visible onClose={() => {}} />);
    await press("Curve");
    await press("Hero");
    expect(isSmoothCurve(clip(0))).toBe(true);
    expect(isSmoothCurve(clip(1))).toBe(true);
    expect(clip(2).speedCurve).toBeNull();                      // too short for 32 steps: skipped silently
    expect(past()).toBe(1);
  });

  test("several clips: the switch changes the form only — each clip keeps its own preset, a clip without a curve gets none", async () => {
    useEditorStore.getState().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 8 }), makeClip({ id: "b", sourceDuration: 6 }), makeClip({ id: "c", sourceDuration: 6 })] }));
    useEditorStore.getState().apply((p) => setClipSpeedCurve(setClipSpeedCurve(p, "a", "hero"), "b", "bullet"));
    await render(<SpeedSheet clipId="a" clipIds={["a", "b", "c"]} visible onClose={() => {}} />);
    const before = past();
    await setSmooth(true);
    expect(clip(0).speedCurve).toEqual({ id: "hero", steps: smoothCurveSteps("hero", 0, 8) });
    expect(clip(1).speedCurve).toEqual({ id: "bullet", steps: smoothCurveSteps("bullet", 0, 6) });
    expect(clip(2).speedCurve).toBeNull();
    expect(past()).toBe(before + 1);
  });

  test("the tile row keeps its offset when the switch is flipped", async () => {
    useEditorStore.getState().apply((p) => setClipSpeedCurve(p, "a", "flashOut"));
    await render(<SpeedSheet clipId="a" visible onClose={() => {}} />);
    const at = rowStartX();
    expect(at).toBe(6 * 80 - 72);
    const row = findRowScroll(screen.getByTestId("strip-tiles"));
    await setSmooth(true);
    expect(isSmoothCurve(clip())).toBe(true);
    expect(rowStartX()).toBe(at);
    expect(findRowScroll(screen.getByTestId("strip-tiles"))).toBe(row);   // the same row: it was not remounted
    await setSmooth(false);
    await press("None");
    await setSmooth(true);
    expect(rowStartX()).toBe(at);
  });
});
