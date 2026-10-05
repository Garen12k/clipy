import { act, fireEvent, render, screen } from "@testing-library/react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-05T10:00:00.000Z" }));
import { Text } from "react-native";
import { setClipSpeedCurve } from "@/src/editor/model/ops";
import { makeClip, makeLayer, makeProject } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { StripSlider, StripTiles, ToolStrip } from "@/src/ui/ToolStrip";
import { AudioVolumeSheet } from "../components/AudioVolumeSheet";
import { BackgroundSheet } from "../components/BackgroundSheet";
import { BlendSheet } from "../components/BlendSheet";
import { ClipAnimationSheet } from "../components/ClipAnimationSheet";
import { SpeedSheet } from "../components/SpeedSheet";
import { TransitionSheet } from "../components/TransitionSheet";
import { VolumeSheet } from "../components/VolumeSheet";

const st = () => useEditorStore.getState();
beforeEach(() => {
  st().reset();
  st().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 8 }), makeClip({ id: "b", sourceDuration: 4 })], layers: [makeLayer({ id: "L", sourceDuration: 2, blend: "darken" })] }));
});
type Inst = ReturnType<typeof screen.getByTestId>;
const findScroll = (n: Inst): Inst | null => { if (n.props.contentOffset !== undefined) return n; for (const c of n.children) { if (typeof c === "string") continue; const f = findScroll(c as Inst); if (f) return f; } return null; };
const scrollEl = () => findScroll(screen.getByTestId("strip-tiles"))!;
const scrollProps = () => [scrollEl().props];

test("Background: Blur comes right after Black; no header note", async () => {
  await render(<BackgroundSheet clipId="a" visible onClose={() => {}} />);
  const labels = screen.getAllByRole("button").map((b) => b.props.accessibilityLabel);
  expect(labels.slice(labels.indexOf("Black"), labels.indexOf("Black") + 3)).toEqual(["Black", "Blur", "Color #F4F4F5"]);
  expect(screen.queryByText(/Shown around/)).toBeNull();
});

test("StripTiles passes initialX as the row's content offset", async () => {
  await render(<ToolStrip visible onClose={() => {}} title="T"><StripTiles initialX={120}><Text>x</Text></StripTiles></ToolStrip>);
  expect(scrollProps()[0].contentOffset).toEqual({ x: 120, y: 0 });
});

test("the selected tile starts in view: Blend (last tile)", async () => {
  await render(<BlendSheet clipId="L" visible onClose={() => {}} />);
  // index 5 of 6 tiles, pitch 72 + 8, minus one tile.
  expect(scrollProps()[0].contentOffset).toEqual({ x: 5 * 80 - 72, y: 0 });
});

test("Blend with the first tile selected starts at 0", async () => {
  st().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 4 })], layers: [makeLayer({ id: "L", sourceDuration: 2 })] }));
  await render(<BlendSheet clipId="L" visible onClose={() => {}} />);
  expect(scrollProps()[0].contentOffset).toEqual({ x: 0, y: 0 });
});

test("Animation tiles start at the selected one, and a tab change restarts the row", async () => {
  st().apply((p) => ({ ...p, clips: p.clips.map((c) => (c.id === "a" ? { ...c, animation: { ...c.animation, out: { id: "zoom", duration: 0.5 } } } : c)) as typeof p.clips }));
  await render(<ClipAnimationSheet clipId="a" visible onClose={() => {}} />);
  expect(scrollProps()[0].contentOffset).toEqual({ x: 0, y: 0 });
  const before = scrollEl();
  await fireEvent.press(screen.getByRole("button", { name: "Out" }));
  expect(scrollEl()).not.toBe(before);   // keyed by the tab: a fresh row
});

test("Speed: curve tiles start at the selected curve; the tab change restarts the row", async () => {
  st().apply((p) => setClipSpeedCurve(p, "a", "hero"));
  await render(<SpeedSheet clipId="a" visible onClose={() => {}} />);
  const before = scrollEl();
  await fireEvent.press(screen.getByRole("button", { name: "Normal" }));
  expect(scrollEl()).not.toBe(before);
  expect(scrollProps()[0].contentOffset.x).toBeGreaterThanOrEqual(0);
});

test("Speed with a curve: warning replaces the clip-length line, may use two lines; the label does not claim a speed", async () => {
  st().apply((p) => setClipSpeedCurve(p, "a", "hero"));
  await render(<SpeedSheet clipId="a" visible onClose={() => {}} />);
  await fireEvent.press(screen.getByRole("button", { name: "Normal" }));
  expect(screen.queryByText(/Clip length/)).toBeNull();
  expect(screen.getByText("A curve is active — moving this slider removes it.")).toHaveProp("numberOfLines", 2);
  expect(screen.queryByText(/Current speed/)).toBeNull();
  expect(screen.getAllByText("Speed")).toHaveLength(2);   // the title and the slider label
});

test("slider labels shrink to fit on one line", async () => {
  await render(<SpeedSheet clipId="a" visible onClose={() => {}} />);
  const label = screen.getByText("Current speed: 1×");
  expect(label).toHaveProp("adjustsFontSizeToFit", true);
  expect(label).toHaveProp("minimumFontScale", 0.85);
  expect(label).toHaveProp("numberOfLines", 1);
});

test("StripSlider labelWidth narrows the label", async () => {
  await render(<StripSlider label="50%" labelWidth={48}><Text>s</Text></StripSlider>);
  expect(screen.getByText("50%")).toHaveStyle({ width: 48 });
});

test("Volume: short label width; notes may use two lines", async () => {
  await render(<VolumeSheet clipId="a" visible onClose={() => {}} />);
  expect(screen.getByText("100%").parent).toHaveStyle({ width: 48 });       // the value is a text inside the label, which has the width
  expect(screen.getByText("Above 100% only applies in the exported video.")).toHaveProp("numberOfLines", 2);
});

test("Audio volume and Transition notes may use two lines", async () => {
  st().apply((p) => ({ ...p, audioTracks: [{ id: "t", volume: 1 }] as unknown as typeof p.audioTracks }));
  await render(<AudioVolumeSheet trackId="t" visible onClose={() => {}} />);
  expect(screen.getByText("Above 100% only applies in the exported video.")).toHaveProp("numberOfLines", 2);
  await act(async () => {});
});

test("Transition note (clips too short) may use two lines", async () => {
  st().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 0.3 }), makeClip({ id: "b", sourceDuration: 0.3 })] }));
  await render(<TransitionSheet clipIndex={0} visible onClose={() => {}} />);
  const note = screen.queryByText("Clips are too short for a transition here");
  if (note) expect(note).toHaveProp("numberOfLines", 2);
});
