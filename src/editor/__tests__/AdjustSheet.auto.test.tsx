import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-17T10:00:00.000Z" }));
jest.mock("@/modules/clipy-video/frameStats", () => ({
  isFrameStatsAvailable: jest.fn(() => true), frameStats: jest.fn(), cancelFrameStats: jest.fn(),
  isStatsCancelled: (e: { code?: string }) => e?.code === "E_STATS_CANCELLED",
  isStatsInterrupted: (e: { code?: string }) => e?.code === "E_STATS_INTERRUPTED",
}));
jest.mock("@react-native-community/slider", () => {
  const { View } = require("react-native");
  return ({ testID, minimumValue, maximumValue, value, onSlidingStart, onValueChange, onSlidingComplete }: { testID?: string; minimumValue?: number; maximumValue?: number; value?: number; onSlidingStart?: () => void; onValueChange?: (v: number) => void; onSlidingComplete?: (v: number) => void }) =>
    <View testID={testID} accessibilityValue={{ min: minimumValue, max: maximumValue, now: value }} onTouchStart={() => onSlidingStart?.()} onTouchMove={() => onValueChange?.(0.5)} onTouchEnd={() => onSlidingComplete?.(0.5)} />;
});
import { cancelFrameStats, frameStats, isFrameStatsAvailable } from "@/modules/clipy-video/frameStats";
import { resetAutoLooks } from "@/src/editor/autoLook";
import { makeClip, makeLayer, makePhotoClip, makeProject } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { AUTO_TOOLS } from "@/src/lib/buildInfo";
import { useToast } from "@/src/ui/Toast";
import { VECTORS } from "../model/__tests__/autoEnhance.vectors";
import { AdjustSheet } from "../components/AdjustSheet";
import { AUTO_WORDS } from "../useAutoEnhance";

const fs = frameStats as jest.Mock;
const answer = (i: number) => ({ frames: [VECTORS[i].f], failed: 0 });   // 1 = dark, 0 = well exposed, 5 = blue cast
const st = () => useEditorStore.getState();
const clip = (id: string) => st().project!.clips.find((c) => c.id === id)!;
const btn = (name: string) => screen.getByRole("button", { name });
const deferred = <T,>() => { let resolve!: (v: T) => void; const promise = new Promise<T>((a) => { resolve = a; }); return { promise, resolve }; };

beforeEach(() => {
  st().reset();
  st().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 10, trimEnd: 10 }), makePhotoClip({ id: "b" })], layers: [makeLayer({ id: "L", sourceDuration: 4 })] }));
  fs.mockReset(); (cancelFrameStats as jest.Mock).mockReset(); (isFrameStatsAvailable as jest.Mock).mockReturnValue(true);
  resetAutoLooks(); useToast.getState().clear();
});

test("Auto is the first chip, with the wand; opening reads nothing and Brightness stays picked", async () => {
  await render(<AdjustSheet clipId="a" visible onClose={() => {}} />);
  const chips = screen.getAllByRole("button").map((b) => b.props.accessibilityLabel);
  expect(chips.indexOf("Auto")).toBeLessThan(chips.indexOf("Brightness"));
  expect(btn("Brightness")).toBeSelected();
  expect(fs).not.toHaveBeenCalled();
});

test("without the build the tap says so and changes nothing", async () => {
  (isFrameStatsAvailable as jest.Mock).mockReturnValue(false);
  await render(<AdjustSheet clipId="a" visible onClose={() => {}} />);
  await fireEvent.press(btn("Auto"));
  expect(useToast.getState().message).toBe(AUTO_TOOLS);
  expect(btn("Auto")).not.toBeSelected();
  expect(btn("Brightness")).toBeSelected();
  expect(fs).not.toHaveBeenCalled();
  expect(st().past).toHaveLength(0);
});

test("one tap: pauses, looks once, sets the sliders as ONE step, says it with Undo, shows the line and the strength", async () => {
  fs.mockResolvedValue(answer(1));
  st().setPlaying(true);
  await render(<AdjustSheet clipId="a" visible onClose={() => {}} />);
  await fireEvent.press(btn("Auto"));
  expect(st().isPlaying).toBe(false);
  await screen.findByTestId("auto-strength");
  expect(fs).toHaveBeenCalledTimes(1);
  expect(fs.mock.calls[0][0]).toMatchObject({ kind: "video", times: [1, 3, 5, 7, 9], maxSide: 256, uri: clip("a").sourceUri });
  expect(clip("a").adjust).toMatchObject({ exposure: 0.3, contrast: 0.2, saturation: 0.2, temperature: 0, tint: 0, brightness: 0 });
  expect(st().past).toHaveLength(1);
  expect(useToast.getState()).toMatchObject({ message: AUTO_WORDS.done, kind: "done", undo: true });
  expect(screen.getByText("Set exposure +30, contrast +20, saturation +20")).toBeTruthy();
  expect(screen.getByText(`${AUTO_WORDS.strength} 100%`)).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Reset" })).toBeNull();
  expect(screen.getAllByRole("button", { name: "Apply to All" })).toHaveLength(1);   // in the row, not in the header
});

test("the strength rescales from the values before Auto, one step per drag; Undo walks back; a hand-moved slider ends it", async () => {
  fs.mockResolvedValue(answer(1));
  await render(<AdjustSheet clipId="a" visible onClose={() => {}} />);
  await fireEvent.press(btn("Auto"));
  const s = await screen.findByTestId("auto-strength");
  await fireEvent(s, "touchStart"); await fireEvent(s, "touchMove"); await fireEvent(s, "touchEnd");
  expect(clip("a").adjust).toMatchObject({ exposure: 0.15, contrast: 0.1, saturation: 0.1 });
  expect(st().past).toHaveLength(2);
  expect(screen.getByText(`${AUTO_WORDS.strength} 50%`)).toBeTruthy();
  st().undo();
  expect(await screen.findByText(`${AUTO_WORDS.strength} 100%`)).toBeTruthy();
  st().undo();
  await waitFor(() => expect(screen.queryByTestId("auto-strength")).toBeNull());
  expect(screen.getByText(AUTO_WORDS.hint)).toBeTruthy();
  st().redo();
  expect(await screen.findByTestId("auto-strength")).toBeTruthy();
  await fireEvent.press(btn("Contrast"));
  const manual = screen.getByTestId("adjust-slider");
  await fireEvent(manual, "touchStart"); await fireEvent(manual, "touchMove");
  await fireEvent.press(btn("Auto"));   // the memory no longer holds: a new tap, from today's values, no second read
  await screen.findByTestId("auto-strength");
  expect(fs).toHaveBeenCalledTimes(1);
  expect(clip("a").adjust.contrast).toBe(0.2);
});

test("a clip that already looks good: no step, no message, the line says so", async () => {
  fs.mockResolvedValue(answer(0));
  await render(<AdjustSheet clipId="a" visible onClose={() => {}} />);
  await fireEvent.press(btn("Auto"));
  expect(await screen.findByText(AUTO_WORDS.good)).toBeTruthy();
  expect(st().past).toHaveLength(0);
  expect(useToast.getState().message).toBeNull();
});

test("closing while looking tells the phone and drops the late answer", async () => {
  const d = deferred<ReturnType<typeof answer>>();
  fs.mockReturnValue(d.promise);
  const view = await render(<AdjustSheet clipId="a" visible onClose={() => {}} />);
  await fireEvent.press(btn("Auto"));
  expect(screen.getByText(AUTO_WORDS.looking)).toBeTruthy();
  await view.rerender(<AdjustSheet clipId="a" visible={false} onClose={() => {}} />);
  expect(cancelFrameStats).toHaveBeenCalledTimes(1);
  d.resolve(answer(1));
  await new Promise((r) => setImmediate(r));
  expect(st().past).toHaveLength(0);
});

test("Apply to All: every main clip looked at on its own, one at a time, ONE step, said with Undo", async () => {
  const first = deferred<ReturnType<typeof answer>>();
  fs.mockReturnValueOnce(first.promise).mockResolvedValueOnce(answer(5));
  await render(<AdjustSheet clipId="a" visible onClose={() => {}} />);
  await fireEvent.press(btn("Auto"));
  await waitFor(() => expect(screen.getByText(AUTO_WORDS.looking)).toBeTruthy());
  first.resolve(answer(1));
  await screen.findByTestId("auto-strength");
  const before = st().past.length;
  await fireEvent.press(btn("Apply to All"));
  await waitFor(() => expect(useToast.getState().message).toBe(AUTO_WORDS.allDone(2, 0)));
  expect(fs).toHaveBeenCalledTimes(2);                                   // "a" was remembered: only the photo is read
  expect(fs.mock.calls[1][0]).toMatchObject({ kind: "photo", times: [0] });
  expect(st().past.length).toBe(before + 1);
  expect(clip("b").adjust.temperature).toBe(0.15);
  expect(useToast.getState()).toMatchObject({ kind: "done", undo: true });
  expect(st().project!.layers[0].adjust.exposure).toBe(0);             // layers are not included
});

test("Apply to All: a clip that cannot be read is skipped and counted; nothing new to set is said plainly; Cancel applies nothing", async () => {
  st().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 10 }), makePhotoClip({ id: "b" }), makeClip({ id: "c", sourceDuration: 4 })] }));
  fs.mockResolvedValueOnce(answer(1)).mockRejectedValueOnce(new Error("stats source: this picture cannot be read")).mockResolvedValueOnce(answer(5));
  jest.spyOn(console, "warn").mockImplementation(() => {});
  await render(<AdjustSheet clipId="a" visible onClose={() => {}} />);
  await fireEvent.press(btn("Auto"));
  await screen.findByTestId("auto-strength");
  await fireEvent.press(btn("Apply to All"));
  await waitFor(() => expect(useToast.getState().message).toBe(AUTO_WORDS.allDone(2, 1)));   // a (already Auto's) and c; b skipped
  expect(useToast.getState()).toMatchObject({ kind: "done", undo: true });
  expect(clip("c").adjust.temperature).toBe(0.15);
  // Again: everything is already Auto's (b still fails) — no step, said plainly.
  fs.mockRejectedValueOnce(new Error("stats source: this picture cannot be read"));
  const steps = st().past.length;
  await fireEvent.press(btn("Apply to All"));
  await waitFor(() => expect(useToast.getState().message).toBe(AUTO_WORDS.nothing(1)));
  expect(st().past.length).toBe(steps);
  // Cancel: with the memory gone the row offers Apply to All again; cancelling it changes nothing.
  const d = deferred<ReturnType<typeof answer>>();
  resetAutoLooks(); fs.mockReset(); fs.mockReturnValue(d.promise);
  await screen.findByText(AUTO_WORDS.hint);   // the row redrawn without the strength (a press on the old row's button is lost)
  await fireEvent.press(await screen.findByRole("button", { name: "Apply to All" }));
  await fireEvent.press(btn("Cancel"));
  d.resolve(answer(1));
  await new Promise((r) => setImmediate(r));
  expect(st().past.length).toBe(steps);
  (console.warn as jest.Mock).mockRestore();
});

test("a layer: Auto works on the layer, with no Apply to All", async () => {
  fs.mockResolvedValue(answer(1));
  await render(<AdjustSheet clipId="L" visible onClose={() => {}} />);
  await fireEvent.press(btn("Auto"));
  await screen.findByTestId("auto-strength");
  expect(st().project!.layers[0].adjust.exposure).toBe(0.3);
  expect(screen.queryByRole("button", { name: "Apply to All" })).toBeNull();
});
