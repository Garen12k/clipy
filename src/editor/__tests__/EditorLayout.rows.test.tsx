import { act, fireEvent, render, screen } from "@testing-library/react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-05T10:00:00.000Z" }));
jest.mock("@/src/projects/pickMedia", () => ({ pickMedia: jest.fn(async () => null) }));
jest.mock("@/src/projects", () => ({ storage: { importMedia: jest.fn(), saveStill: jest.fn() } }));
jest.mock("expo-video-thumbnails", () => ({ getThumbnailAsync: jest.fn(async () => ({ uri: "file:///thumb.jpg" })) }));
jest.mock("@/src/projects/prefs", () => ({ prefs: { getRecentEmoji: jest.fn(async () => []), pushRecentEmoji: jest.fn(async () => {}) } }));
import { useEffect } from "react";
import { Dimensions, ScrollView, View } from "react-native";
import { makeClip, makeLayer, makeProject } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { useKeyboard } from "@/src/ui/keyboard";
import { STRIP } from "@/src/ui/ToolStrip";
import { EditorLayout } from "../components/EditorLayout";
import { EditorToolbar } from "../components/EditorToolbar";
import { Timeline } from "../components/Timeline";
import { TransportRow } from "../components/TransportRow";
import { CLIP_AREA_HEIGHT, LANE_GAP, LANE_HEIGHT } from "../timelineLayout";
import { closeStrip } from "../toolStrip";

const st = () => useEditorStore.getState();
const btn = (name: string) => screen.getByRole("button", { name });
const hidden = { includeHiddenElements: true } as const;
const LANE = LANE_HEIGHT + LANE_GAP;
/** The timeline at its cap on the smallest iPhone: the clip area and two and a half rows. */
const CAPPED = CLIP_AREA_HEIGHT + 2.5 * LANE;
let mounts = 0;
function Probe() {
  useEffect(() => { mounts++; }, []);
  return <View testID="probe" />;
}
const ui = () => <EditorLayout top={null} preview={<Probe />} transport={<TransportRow />} timeline={<Timeline />} toolbar={<EditorToolbar />} />;
const layers = (n: number) => Array.from({ length: n }, (_, i) => makeLayer({ id: `l${i}`, sourceDuration: 4 }));
const project = (n: number) => makeProject({ clips: [makeClip({ id: "a", sourceDuration: 4 }), makeClip({ id: "b", sourceDuration: 4 })], layers: layers(n) });

const window = Dimensions.get("window");
let scrollTo: jest.SpyInstance;
beforeEach(() => {
  mounts = 0;
  Dimensions.set({ window: { ...window, width: 375, height: 667 } });
  scrollTo = jest.spyOn(ScrollView.prototype, "scrollTo").mockImplementation(() => {});
  useKeyboard.setState({ height: 0 });
  closeStrip();
  st().reset();
  st().setProject(project(12));
});
afterEach(() => { scrollTo.mockRestore(); Dimensions.set({ window }); });

test("the preview's slot is never asked to give way for rows: three rows and thirty take the same timeline height", async () => {
  await render(ui());
  const probe = screen.getByTestId("probe"), rows = screen.getByTestId("timeline-rows");
  expect(screen.getByTestId("timeline-root")).toHaveStyle({ height: CAPPED });
  for (const n of [3, 30, 7]) {
    await act(() => { st().apply((p) => ({ ...p, layers: layers(n) })); });
    expect(screen.getByTestId("timeline-root")).toHaveStyle({ height: CAPPED });
  }
  expect(screen.getByTestId("slot-preview")).toHaveStyle({ flex: 1 });
  expect(screen.getByTestId("probe")).toBe(probe);
  expect(screen.getByTestId("timeline-rows")).toBe(rows);
  expect(mounts).toBe(1);
});

test("a strip rises over the capped timeline by its usual two rows; a panel collapses the slot and the timeline keeps its capped height, mounted", async () => {
  await render(ui());
  const scroll = screen.getByTestId("timeline-scroll"), rows = screen.getByTestId("timeline-rows"), probe = screen.getByTestId("probe");
  await act(() => { st().select("a"); });
  await fireEvent.press(btn("Opacity"));
  expect(screen.getByTestId("editor-toolbar")).toHaveStyle({ marginTop: -STRIP.lift });
  expect(screen.getByTestId("timeline-root")).toHaveStyle({ height: CAPPED });
  await act(() => { closeStrip(); st().select(null); });
  await fireEvent.press(btn("Stickers"));
  expect(screen.getByTestId("slot-timeline", hidden)).toHaveStyle({ height: 0, overflow: "hidden" });
  expect(screen.getByTestId("slot-timeline", hidden).props.pointerEvents).toBe("none");
  expect(screen.getByTestId("timeline-root", hidden)).toHaveStyle({ height: CAPPED });
  expect(screen.getByTestId("timeline-scroll", hidden)).toBe(scroll);
  expect(screen.getByTestId("timeline-rows", hidden)).toBe(rows);
  expect(screen.getByTestId("probe")).toBe(probe);
  expect(mounts).toBe(1);
});

test("with the keyboard under a strip the slot collapses and comes back with the same rows view", async () => {
  await render(ui());
  const rows = screen.getByTestId("timeline-rows");
  await act(() => { st().select("a"); });
  await fireEvent.press(btn("Trim"));
  await act(() => { useKeyboard.setState({ height: 260 }); });
  expect(screen.getByTestId("slot-timeline", hidden)).toHaveStyle({ height: 0, overflow: "hidden" });
  expect(screen.getByTestId("timeline-root", hidden)).toHaveStyle({ height: CAPPED });
  await act(() => { useKeyboard.setState({ height: 0 }); });
  expect(screen.getByTestId("slot-timeline")).not.toHaveStyle({ height: 0 });
  expect(screen.getByTestId("timeline-rows")).toBe(rows);
  expect(mounts).toBe(1);
});
