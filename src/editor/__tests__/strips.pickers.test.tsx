import { fireEvent, render, screen } from "@testing-library/react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-05T10:00:00.000Z" }));
jest.mock("@/src/editor/components/thumbnails", () => ({ getThumb: jest.fn(async () => "file:///thumb.jpg") }));
import { makeClip, makeLayer, makeOverlay, makeProject } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { ClipAnimationSheet } from "../components/ClipAnimationSheet";
import { FilterSheet } from "../components/FilterSheet";
import { OverlayAnimationSheet } from "../components/OverlayAnimationSheet";
import { SpeedSheet } from "../components/SpeedSheet";

const st = () => useEditorStore.getState();
const btn = (name: string) => screen.getByRole("button", { name });
beforeEach(() => {
  st().reset();
  st().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 8 }), makeClip({ id: "b", sourceDuration: 8 })], layers: [makeLayer({ id: "L", sourceDuration: 2 })], overlays: [makeOverlay({ id: "t", start: 0, end: 3 })] }));
});
const expectStrip = async (title: string, onClose: jest.Mock) => {
  expect(screen.getByTestId("tool-strip")).toBeTruthy();
  expect(screen.getByRole("header", { name: title })).toBeTruthy();
  expect(screen.queryByLabelText("Close sheet")).toBeNull();
  expect(screen.getAllByTestId("strip-tiles")).toHaveLength(1);
  await fireEvent.press(btn("Done"));
  expect(onClose).toHaveBeenCalledTimes(1);
};

test("Filter: one row of tiles over the strength row; Apply to all clips is the strip's action", async () => {
  const onClose = jest.fn();
  await render(<FilterSheet clipId="a" visible onClose={onClose} />);
  expect(screen.getAllByTestId("strip-slider")).toHaveLength(1);
  await fireEvent.press(btn("Warm"));
  await fireEvent.press(btn("Apply to all clips"));
  expect(st().project!.clips.map((c) => c.filter)).toEqual(["warm", "warm"]);
  expect(st().past).toHaveLength(2);
  await expectStrip("Filter", onClose);
});

test("Filter in clipIds mode and on a layer has no action", async () => {
  const view = await render(<FilterSheet clipId="a" clipIds={["a", "b"]} visible onClose={() => {}} />);
  expect(screen.getByRole("header", { name: "Filter · 2 clips" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Apply to all clips" })).toBeNull();
  await view.rerender(<FilterSheet clipId="L" visible onClose={() => {}} />);
  expect(screen.queryByRole("button", { name: "Apply to all clips" })).toBeNull();
});

test("Speed: tabs at the left of the row; Normal has the slider row, Curve has none; the length and the note sit in the header", async () => {
  const onClose = jest.fn();
  await render(<SpeedSheet clipId="a" visible onClose={onClose} />);
  expect(btn("Normal")).toBeSelected();
  expect(screen.getAllByTestId("strip-slider")).toHaveLength(1);
  expect(screen.getByText("Clip length 8.0 s")).toBeTruthy();
  expect(screen.getByText("Audio keeps its pitch in the exported video.")).toBeTruthy();
  expect(screen.getByText("Current speed: 1×")).toBeTruthy();
  await fireEvent.press(btn("2×"));
  expect(screen.getByText("Clip length 4.0 s")).toBeTruthy();
  expect(screen.getByText("Current speed: 2×")).toBeTruthy();
  await fireEvent.press(btn("Curve"));
  expect(screen.queryByTestId("strip-slider")).toBeNull();
  expect(screen.queryByText("Audio keeps its pitch in the exported video.")).toBeNull();
  expect(screen.getByText("Clip length 4.0 s")).toBeTruthy();
  expect(btn("Hero")).toBeTruthy();
  await expectStrip("Speed", onClose);
});

test("Speed renders nothing while hidden and opens on Curve for a clip with a curve", async () => {
  const view = await render(<SpeedSheet clipId="a" visible={false} onClose={() => {}} />);
  expect(screen.queryByTestId("tool-strip")).toBeNull();
  await view.rerender(<SpeedSheet clipId="a" visible onClose={() => {}} />);
  await fireEvent.press(btn("Curve"));
  await fireEvent.press(btn("Hero"));
  await view.rerender(<SpeedSheet clipId="a" visible={false} onClose={() => {}} />);
  await view.rerender(<SpeedSheet clipId="a" visible onClose={() => {}} />);
  expect(btn("Curve")).toBeSelected();
});

test("clip Animation: In / Out / Combo tabs, tiles in one row, the length row only for In and Out", async () => {
  const onClose = jest.fn();
  await render(<ClipAnimationSheet clipId="a" visible onClose={onClose} />);
  for (const t of ["In", "Out", "Combo"]) expect(btn(t)).toBeTruthy();
  expect(screen.getAllByTestId("strip-slider")).toHaveLength(1);
  expect(screen.getByText("Length 0.50 s")).toBeTruthy();
  await fireEvent.press(btn("Combo"));
  expect(screen.queryByTestId("strip-slider")).toBeNull();
  expect(btn("Apply to all clips")).toBeTruthy();
  await expectStrip("Animation", onClose);
});

test("overlay Animation: In / Out / Loop tabs; no action", async () => {
  const onClose = jest.fn();
  await render(<OverlayAnimationSheet overlayId="t" visible onClose={onClose} />);
  for (const t of ["In", "Out", "Loop"]) expect(btn(t)).toBeTruthy();
  await fireEvent.press(btn("Loop"));
  expect(screen.queryByTestId("strip-slider")).toBeNull();
  expect(screen.queryByRole("button", { name: "Apply to all clips" })).toBeNull();
  await expectStrip("Animation", onClose);
});
