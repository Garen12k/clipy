import { fireEvent, render, screen } from "@testing-library/react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
jest.mock("@/modules/clipy-video/reveal", () => ({ revealNeedsBuild: jest.fn(() => true), isTextRevealBuild: jest.fn(() => false) }));
import { makeClip, makeOverlay, makeProject } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { REVEAL_TOOLS } from "@/src/lib/buildInfo";
import { useToast } from "@/src/ui/Toast";
import { OverlayAnimationSheet } from "../components/OverlayAnimationSheet";

beforeEach(() => {
  useEditorStore.getState().reset();
  useToast.getState().clear();
  useEditorStore.getState().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 8 })], overlays: [makeOverlay({ id: "t1" })] }));
});

test("an installed build from before reveals: the tile says so and changes nothing", async () => {
  await render(<OverlayAnimationSheet overlayId="t1" visible onClose={() => {}} />);
  const before = useEditorStore.getState().past.length;
  await fireEvent.press(screen.getByRole("button", { name: "Typewriter" }));
  expect(useToast.getState().message).toBe(REVEAL_TOOLS);
  expect(useEditorStore.getState().project!.overlays[0].animation.in).toBeNull();
  expect(useEditorStore.getState().past.length).toBe(before);
  await fireEvent.press(screen.getByRole("button", { name: "Pop" }));   // the whole-text animations are not gated
  expect(useEditorStore.getState().project!.overlays[0].animation.in).toEqual({ id: "pop", duration: 0.5 });
});
