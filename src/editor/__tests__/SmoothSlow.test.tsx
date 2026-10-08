import { act, fireEvent, render, screen } from "@testing-library/react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-10T10:00:00.000Z" }));
jest.mock("@/modules/clipy-video", () => ({ ...jest.requireActual("@/modules/clipy-video"), isSteadyAvailable: jest.fn(() => true) }));
jest.mock("@/src/editor/steadyRenders", () => ({ retrySteady: jest.fn(), holdSteady: jest.fn() }));
import { isSteadyAvailable } from "@/modules/clipy-video";
import { setClipSpeed } from "@/src/editor/model/ops";
import { makeClip, makeLayer, makeProject } from "@/src/editor/model/types";
import { useSteadyFiles } from "@/src/editor/steadyFiles";
import { holdSteady, retrySteady } from "@/src/editor/steadyRenders";
import { useEditorStore } from "@/src/editor/store";
import { STEADY_TOOLS } from "@/src/lib/buildInfo";
import { useToast } from "@/src/ui/Toast";
import { SMOOTH_TOO_LONG, SMOOTH_WITH_CUTOUT, smoothStatus } from "../components/SmoothSlowSection";
import { SpeedSheet } from "../components/SpeedSheet";

const st = () => useEditorStore.getState();
const item = (id: string) => [...st().project!.clips, ...st().project!.layers].find((c) => c.id === id)!;
const chip = (name: string) => screen.queryByRole("button", { name });
const sw = () => screen.getByLabelText("Smooth slow motion");
const flip = (on: boolean) => fireEvent(sw(), "valueChange", on);
const NAME = "slow-s1-0-60-0-8000.mov";
const open = async (id: string, clipIds?: string[]) => {
  st().setProject(makeProject({
    clips: [makeClip({ id: "a", sourceDuration: 8 }), makeClip({ id: "slow", sourceDuration: 8, speed: 0.5, width: 1080, height: 1920 }),
      makeClip({ id: "long", sourceDuration: 200, speed: 0.5 }), makeClip({ id: "cut", sourceDuration: 8, speed: 0.5, cutout: true })],
    layers: [makeLayer({ id: "L", sourceDuration: 6, speed: 0.25 })],
  }));
  await act(() => { st().select(id); });
  await render(<SpeedSheet clipId={id} clipIds={clipIds} visible onClose={() => {}} />);
};
const openTab = async (id: string) => { await open(id); await fireEvent.press(chip("Slow motion")!); };

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(isSteadyAvailable).mockReturnValue(true);
  jest.mocked(holdSteady).mockReset();
  useSteadyFiles.setState({ files: {} });
  useToast.getState().clear();
  st().reset();
});

test("smoothStatus: what the tab's status row says", () => {
  const more = { cutout: false, refusal: null, file: undefined, bytes: 10578944 };
  expect(smoothStatus(false, more)).toBe("Fills the gaps between frames with blended ones. The copy takes about 11 MB.");
  expect(smoothStatus(true, more)).toBe("Waiting to start.");
  expect(smoothStatus(true, { ...more, blocked: "build" })).toBe(STEADY_TOOLS);
  expect(smoothStatus(true, { ...more, file: { status: "busy", progress: 0.417 } })).toBe("Smoothing the slow motion: 42 %");
  expect(smoothStatus(true, { ...more, file: { status: "ready", uri: "u" } })).toBe("Ready.");
  expect(smoothStatus(true, { ...more, file: { status: "failed", message: "steady writer: boom" } })).toBe("Could not smooth the slow motion. Switch it off and on to try again.");
  expect(smoothStatus(true, { ...more, refusal: "tooLong" })).toBe(SMOOTH_TOO_LONG);
  expect(smoothStatus(false, { ...more, cutout: true })).toBe(SMOOTH_WITH_CUTOUT);
  expect(SMOOTH_TOO_LONG).toBe("Smooth slow motion works on clips up to 60 seconds. Trim or split this clip first.");
  expect(SMOOTH_WITH_CUTOUT).toBe("Smooth slow motion does not work together with Remove background. Switch Remove background off for this clip first.");
});

test("the Slow motion tab is there only while the clip is slowed, and never for several clips at once", async () => {
  await open("a");
  expect(chip("Normal")).toBeTruthy();
  expect(chip("Curve")).toBeTruthy();
  expect(chip("Slow motion")).toBeNull();
  await act(() => { st().apply((p) => setClipSpeed(p, "a", 0.5)); });
  expect(chip("Slow motion")).toBeTruthy();
  await act(() => { st().apply((p) => setClipSpeed(p, "a", 1)); });
  expect(chip("Slow motion")).toBeNull();
  await screen.unmount();
  await open("slow", ["slow", "long"]);
  expect(chip("Slow motion")).toBeNull();
});

test("the tab holds one switch and one status line; switching on is one undo step and only writes the switch", async () => {
  await openTab("slow");
  expect(chip("Slow motion")).toBeSelected();
  expect(screen.getByText("Smooth slow motion")).toBeTruthy();
  expect(screen.getByText("Fills the gaps between frames with blended ones. The copy takes about 11 MB.")).toBeTruthy();
  expect(screen.queryByTestId("speed-slider")).toBeNull();
  await flip(true);
  expect(item("slow").smooth).toBe(true);
  expect(item("slow").speed).toBe(0.5);
  expect(st().past).toHaveLength(1);
  expect(screen.getByText("Waiting to start.")).toBeTruthy();
  await act(() => { useSteadyFiles.setState({ files: { [NAME]: { status: "busy", progress: 0.5 } } }); });
  expect(screen.getByText("Smoothing the slow motion: 50 %")).toBeTruthy();
  await flip(false);
  expect("smooth" in item("slow")).toBe(false);
  expect(st().past).toHaveLength(2);
});

test("switching on asks again for a copy that failed before", async () => {
  await openTab("slow");
  await flip(true);
  expect(retrySteady).toHaveBeenCalledWith(NAME);
});

test("a clip that stops being slowed while its tab is open falls back to Normal", async () => {
  await openTab("slow");
  await act(() => { st().apply((p) => setClipSpeed(p, "slow", 1)); });
  expect(chip("Slow motion")).toBeNull();
  expect(chip("Normal")).toBeSelected();
  expect(screen.getByTestId("speed-slider")).toBeTruthy();
});

test("an older build, a clip over 60 seconds and a clip with Remove background each say why, and the switch stays off", async () => {
  jest.mocked(isSteadyAvailable).mockReturnValue(false);
  await openTab("slow");
  await flip(true);
  expect(useToast.getState().message).toBe(STEADY_TOOLS);
  expect("smooth" in item("slow")).toBe(false);
  await screen.unmount();
  jest.mocked(isSteadyAvailable).mockReturnValue(true);
  await openTab("long");
  await flip(true);
  expect(useToast.getState().message).toBe(SMOOTH_TOO_LONG);
  await screen.unmount();
  await openTab("cut");
  await flip(true);
  expect(useToast.getState().message).toBe(SMOOTH_WITH_CUTOUT);
  expect(st().past).toHaveLength(0);
});

test("a slowed layer has the tab too", async () => {
  await openTab("L");
  await flip(true);
  expect(item("L").smooth).toBe(true);
});

test("the Curve tab's own Smooth switch is still there, under its own name", async () => {
  await open("slow");
  await fireEvent.press(chip("Curve")!);
  expect(screen.getByLabelText("Smooth")).toBeTruthy();
  expect(screen.queryByLabelText("Smooth slow motion")).toBeNull();
});

test("a clip that fell back to Normal stays there when the slider slows it again: the slider is not taken from under the finger", async () => {
  await openTab("slow");
  await act(() => { st().apply((p) => setClipSpeed(p, "slow", 1)); });
  const slider = screen.getByTestId("speed-slider");
  await fireEvent(slider, "slidingStart", 1);
  await fireEvent(slider, "valueChange", 0.5);
  expect(item("slow").speed).toBe(0.5);
  expect(chip("Slow motion")).toBeTruthy();
  expect(chip("Normal")).toBeSelected();
  expect(screen.getByTestId("speed-slider")).toBeTruthy();
  await fireEvent(slider, "slidingComplete", 0.5);
});

// The copies' queue is held for as long as a finger is on the Speed slider (a Smooth clip's copy changes its name at 0.5×).
const holds = () => jest.mocked(holdSteady).mock.calls.map((c) => c[0]);

test("a speed drag holds the copies before its first value and lets go on release", async () => {
  await open("slow");
  const seen: string[] = [];
  jest.mocked(holdSteady).mockImplementation((on) => { seen.push(`hold ${on} at ${item("slow").speed}`); });
  const slider = screen.getByTestId("speed-slider");
  await fireEvent(slider, "slidingStart", 0.5);
  await fireEvent(slider, "valueChange", 0.4);
  await fireEvent(slider, "valueChange", 0.3);
  expect(seen).toEqual(["hold true at 0.5"]);
  await fireEvent(slider, "slidingComplete", 0.3);
  expect(seen).toEqual(["hold true at 0.5", "hold false at 0.3"]);
  await fireEvent(slider, "slidingStart", 0.3);
  await fireEvent(slider, "slidingComplete", 0.3);
  expect(holds()).toEqual([true, false, true, false]);
  await screen.unmount();
  expect(holds()).toEqual([true, false, true, false]);   // nothing held: nothing to let go
});

test("a drag that takes the clip to 1× and over loses the Slow motion chip and still lets go", async () => {
  await open("slow");
  const slider = screen.getByTestId("speed-slider");
  await fireEvent(slider, "slidingStart", 0.5);
  await fireEvent(slider, "valueChange", 1.5);
  expect(chip("Slow motion")).toBeNull();
  expect(chip("Normal")).toBeSelected();
  await fireEvent(slider, "slidingComplete", 1.5);
  expect(holds()).toEqual([true, false]);
});

test("a drag that never ends lets go: the strip closes, another tab takes the slider away, the clip goes", async () => {
  await open("slow");
  await fireEvent(screen.getByTestId("speed-slider"), "slidingStart", 0.5);
  await screen.unmount();
  expect(holds()).toEqual([true, false]);

  jest.mocked(holdSteady).mockClear();
  await open("slow");
  await fireEvent(screen.getByTestId("speed-slider"), "slidingStart", 0.5);
  await fireEvent.press(chip("Curve")!);
  expect(screen.queryByTestId("speed-slider")).toBeNull();
  expect(holds()).toEqual([true, false]);
  await screen.unmount();
  expect(holds()).toEqual([true, false]);

  jest.mocked(holdSteady).mockClear();
  await open("slow");
  await fireEvent(screen.getByTestId("speed-slider"), "slidingStart", 0.5);
  await act(() => { st().apply((p) => ({ ...p, clips: p.clips.filter((c) => c.id !== "slow") })); });
  expect(screen.queryByTestId("speed-slider")).toBeNull();
  expect(holds()).toEqual([true, false]);
});

test("a tab without a slider holds nothing", async () => {
  await openTab("slow");
  await flip(true);
  await screen.unmount();
  expect(holdSteady).not.toHaveBeenCalled();
});

// Spec M3 / §8: "A reversed clip: no Stabilize tool, no Slow motion tab". `isSlowed` does not look at `reversed`, and
// `setClipSmooth` refuses a reversed clip without a word — the switch would spring back and say nothing.
test("a reversed clip has no Slow motion tab, however slow it is; reversed while the tab is open, it falls back to Normal", async () => {
  st().setProject(makeProject({ clips: [makeClip({ id: "rev", sourceDuration: 8, speed: 0.5, reversed: true }), makeClip({ id: "fwd", sourceDuration: 8, speed: 0.5 })] }));
  await act(() => { st().select("rev"); });
  await render(<SpeedSheet clipId="rev" visible onClose={() => {}} />);
  expect(chip("Normal")).toBeTruthy();
  expect(chip("Curve")).toBeTruthy();
  expect(chip("Slow motion")).toBeNull();
  await screen.unmount();
  await act(() => { st().select("fwd"); });
  await render(<SpeedSheet clipId="fwd" visible onClose={() => {}} />);
  await fireEvent.press(chip("Slow motion")!);
  expect(screen.queryByLabelText("Smooth slow motion")).toBeTruthy();
  await act(() => { st().apply((p) => ({ ...p, clips: p.clips.map((c) => (c.id === "fwd" ? { ...c, reversed: true } : c)) })); });
  expect(chip("Slow motion")).toBeNull();
  expect(screen.queryByLabelText("Smooth slow motion")).toBeNull();
});
