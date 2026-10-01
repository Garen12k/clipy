import { render, screen } from "@testing-library/react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
import { makeClip, makeOverlay, makeProject } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { OverlayLayer } from "../components/OverlayLayer";

const p = makeProject({ clips: [makeClip({ id: "a", sourceDuration: 10 })], overlays: [
  makeOverlay({ id: "o1", text: "Early", start: 0, end: 2, x: 0.5, y: 0.25, fontScale: 0.1 }),
  makeOverlay({ id: "o2", text: "Late", start: 5, end: 8 }),
] });
beforeEach(() => { useEditorStore.getState().reset(); useEditorStore.getState().setProject(p); });

test("renders only overlays whose time range contains the playhead, at the layout position", async () => {
  useEditorStore.getState().seek(1);
  await render(<OverlayLayer frameW={200} frameH={400} onOpenPanel={() => {}} />);
  expect(screen.getByText("Early")).toBeTruthy();
  expect(screen.queryByText("Late")).toBeNull();
  const box = screen.getByTestId("overlay-o1");
  expect(box).toHaveStyle({ left: 100, top: 100 });
  expect(screen.getByText("Early")).toHaveStyle({ fontSize: 40, fontFamily: "Bangers_400Regular" });
});

test("shows the selection frame only for the selected overlay", async () => {
  useEditorStore.getState().seek(1);
  useEditorStore.getState().selectOverlay("o1");
  await render(<OverlayLayer frameW={200} frameH={400} onOpenPanel={() => {}} />);
  expect(screen.getByTestId("selection-frame-o1")).toBeTruthy();
});
