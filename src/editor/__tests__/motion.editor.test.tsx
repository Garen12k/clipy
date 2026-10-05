import { act, fireEvent, render, screen, within } from "@testing-library/react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-05T10:00:00.000Z" }));
jest.mock("@/src/projects/pickMedia", () => ({ pickMedia: jest.fn(async () => null) }));
jest.mock("@/src/projects", () => ({ storage: { importMedia: jest.fn(), saveStill: jest.fn() } }));
jest.mock("expo-video-thumbnails", () => ({ getThumbnailAsync: jest.fn(async () => ({ uri: "file:///thumb.jpg" })) }));
import { useEffect } from "react";
import { Text, View } from "react-native";
import { withTiming } from "react-native-reanimated";
import { makeClip, makeProject } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { theme } from "@/src/theme/theme";
import { useKeyboard } from "@/src/ui/keyboard";
import { ToolPanel } from "@/src/ui/ToolPanel";
import { BAR_HEIGHT, STRIP, ToolStrip } from "@/src/ui/ToolStrip";
import { setReducedMotionForTests } from "@/src/ui/useReducedMotion";
import { EditorLayout } from "../components/EditorLayout";
import { EditorToolbar } from "../components/EditorToolbar";
import { Timeline } from "../components/Timeline";
import { TransportRow } from "../components/TransportRow";
import { closeStrip, useToolStrip } from "../toolStrip";

jest.mock("react-native-reanimated", () => {
  const m = require("react-native-reanimated/mock");
  return { ...m, withTiming: jest.fn(m.withTiming) };
});
const T = withTiming as jest.Mock;
/** Enter animations only: the ones that go to 1 in the base duration (a press goes to 0.96 or to 1 in the fast one). */
const enters = () => T.mock.calls.filter(([to, cfg]) => to === 1 && cfg?.duration === theme.motion.base).length;
const st = () => useEditorStore.getState();
const btn = (name: string) => screen.getByRole("button", { name });
let mounts = 0;
function Probe() { useEffect(() => { mounts++; }, []); return <View testID="probe" />; }

beforeEach(() => {
  mounts = 0;
  setReducedMotionForTests(false);
  useKeyboard.setState({ height: 0 });
  closeStrip();
  st().reset();
  st().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 4 }), makeClip({ id: "b", sourceDuration: 4 })] }));
  T.mockClear();
});

test("a strip's content enters once; the strip's own box is not animated and keeps its explicit height", async () => {
  const view = await render(<ToolStrip visible onClose={() => {}} title="Opacity"><Text>row</Text></ToolStrip>);
  expect(enters()).toBe(1);
  const content = screen.getByTestId("tool-strip-content");
  expect(content).toHaveStyle({ height: STRIP.header + STRIP.tiles + STRIP.slider });
  expect(within(content).getByRole("header", { name: "Opacity" })).toBeTruthy();
  expect(within(content).getByText("row")).toBeTruthy();
  expect(screen.getByTestId("tool-strip").props.style).not.toEqual(expect.objectContaining({ opacity: expect.anything() }));
  await view.rerender(<ToolStrip visible onClose={() => {}} title="Opacity"><Text>row 2</Text></ToolStrip>);   // a slider tick re-renders the strip
  expect(enters()).toBe(1);
});

test("a panel's content enters once — the keyboard resizing it does not replay it", async () => {
  await render(<ToolPanel visible onClose={() => {}} title="Text"><Text>body</Text></ToolPanel>);
  expect(enters()).toBe(1);
  expect(within(screen.getByTestId("tool-panel-content")).getByText("body")).toBeTruthy();
  await act(() => { useKeyboard.setState({ height: 336 }); });
  await act(() => { useKeyboard.setState({ height: 0 }); });
  expect(enters()).toBe(1);
});

test("the row of tools enters when the bar changes; the back arrow is outside it; a playhead tick does nothing", async () => {
  await render(<EditorToolbar />);
  expect(enters()).toBe(1);
  const tools = screen.getByTestId("toolbar-tools");
  expect(tools).toHaveStyle({ flex: 1, height: BAR_HEIGHT - 1 });
  expect(screen.getByTestId("toolbar-scroll")).toHaveStyle({ height: BAR_HEIGHT - 1 });
  expect(within(tools).getByRole("button", { name: "Filter" })).toBeTruthy();
  await act(() => { st().seek(1); });
  await act(() => { st().seek(1.5); });
  expect(enters()).toBe(1);
  await act(() => { st().select("a"); });                    // main → clip
  expect(enters()).toBe(2);
  expect(btn("Back to main tools")).toBeTruthy();
  expect(within(screen.getByTestId("toolbar-tools")).queryByRole("button", { name: "Back to main tools" })).toBeNull();
  await act(() => { st().select("b"); });                    // clip → clip: the same bar, nothing replays
  expect(enters()).toBe(2);
});

test("opening and closing a strip: the tool store closes at once, the bar's tools come back with their own entrance, the preview mounts once", async () => {
  await render(<EditorLayout top={null} preview={<Probe />} transport={<TransportRow />} timeline={<Timeline />} toolbar={<EditorToolbar />} />);
  await act(() => { st().select("a"); });
  const before = enters();
  await fireEvent.press(btn("Opacity"));
  expect(screen.getByTestId("tool-strip-content")).toBeTruthy();
  expect(enters()).toBe(before + 1);
  await fireEvent.press(btn("Done"));
  expect(useToolStrip.getState().open).toBeNull();           // closed in the same tick
  expect(screen.queryByTestId("tool-strip")).toBeNull();     // nothing lingers to animate out
  expect(screen.getByTestId("toolbar-tools")).toBeTruthy();
  expect(enters()).toBe(before + 2);
  expect(mounts).toBe(1);
});

test("with Reduce Motion nothing enters", async () => {
  setReducedMotionForTests(true);
  await render(<EditorToolbar />);
  await act(() => { st().select("a"); });
  await fireEvent.press(btn("Opacity"));
  expect(enters()).toBe(0);
});
