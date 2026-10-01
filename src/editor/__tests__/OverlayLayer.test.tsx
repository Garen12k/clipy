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

test("the selection frame claims the touch responder so a tap does not bubble to the preview and deselect it", async () => {
  // On device, RNGH's native gesture recognizer needs the frame to be a candidate responder
  // (deepest-view-wins in RN's responder negotiation) so PreviewPlayer's outer Pressable never
  // starts its own press and deselects the overlay before a second tap can land.
  // @testing-library/react-native's `fireEvent.press` does not model that deepest-view-wins
  // negotiation (verified: a nested `onStartShouldSetResponder={() => true}` view still lets an
  // ancestor Pressable's onPress fire via its own event handlers), so this asserts the responder
  // claim directly rather than through a simulated bubbling press.
  useEditorStore.getState().seek(1);
  useEditorStore.getState().selectOverlay("o1");
  await render(<OverlayLayer frameW={200} frameH={400} onOpenPanel={() => {}} />);
  const frame = screen.getByTestId("selection-frame-o1");
  expect(frame.props.onStartShouldSetResponder?.()).toBe(true);
});
