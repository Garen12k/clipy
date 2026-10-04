import { fireEvent, render, screen } from "@testing-library/react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
jest.mock("@react-native-community/slider", () => { const { View } = require("react-native"); return ({ testID, disabled, value, minimumValue, maximumValue, step, onSlidingStart, onValueChange }: { testID?: string; disabled?: boolean; value?: number; minimumValue?: number; maximumValue?: number; step?: number; onSlidingStart?: () => void; onValueChange?: (v: number) => void }) => <View testID={testID} {...{ disabled, value, minimumValue, maximumValue, step }} onTouchStart={() => onSlidingStart?.()} onTouchMove={(e: unknown) => onValueChange?.((e as { v?: number })?.v ?? 0.8)} />; });
import { ANIM_LOOP } from "@/src/editor/effects";
import { ANIM_LOOP_IDS, makeClip, makeOverlay, makeProject, makeSticker } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { OverlayAnimationSheet } from "../components/OverlayAnimationSheet";

const anim = (id: string) => useEditorStore.getState().project!.overlays.find((o) => o.id === id)!.animation;
const past = () => useEditorStore.getState().past.length;
const press = (name: string) => fireEvent.press(screen.getByRole("button", { name }));
const tile = (name: string) => screen.getByRole("button", { name });
const slider = () => screen.getByTestId("animation-slider");

beforeEach(() => {
  useEditorStore.getState().reset();
  useEditorStore.getState().setProject(makeProject({
    clips: [makeClip({ id: "a", sourceDuration: 8 })],
    overlays: [makeOverlay({ id: "t1" }), makeSticker({ id: "s1" }), makeOverlay({ id: "c1", kind: "caption" })],
  }));
});

test("tabs In · Out · Loop, no Apply to all; In opens with None selected and a disabled slider", async () => {
  await render(<OverlayAnimationSheet overlayId="t1" visible onClose={() => {}} />);
  expect(screen.getByText("Animation")).toBeTruthy();
  for (const l of ["In", "Out", "Loop"]) expect(tile(l)).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Combo" })).toBeNull();
  expect(screen.queryByRole("button", { name: /Apply to all/ })).toBeNull();
  expect(tile("In")).toBeSelected();
  expect(tile("None")).toBeSelected();
  expect(slider().props).toMatchObject({ disabled: true, minimumValue: 0.1, maximumValue: 2, step: 0.05 });
});

test("In, Out and Loop are independent; each pick is one undo step", async () => {
  await render(<OverlayAnimationSheet overlayId="t1" visible onClose={() => {}} />);
  await press("Pop");
  await press("Out");
  await press("Fade");
  await press("Loop");
  expect(screen.queryByTestId("animation-slider")).toBeNull();
  for (const id of ANIM_LOOP_IDS) expect(tile(ANIM_LOOP[id].label)).toBeTruthy();
  await press("Wiggle");
  expect(anim("t1")).toEqual({ in: { id: "pop", duration: 0.5 }, out: { id: "fade", duration: 0.5 }, loop: "wiggle" });
  expect(past()).toBe(3);
  expect(tile("Wiggle")).toBeSelected();
  await press("None");
  expect(anim("t1")).toEqual({ in: { id: "pop", duration: 0.5 }, out: { id: "fade", duration: 0.5 }, loop: null });
  await press("In");
  expect(tile("Pop")).toBeSelected();
  expect(anim("s1")).toEqual({ in: null, out: null, loop: null });
});

test("the Length slider is one undo step per drag", async () => {
  await render(<OverlayAnimationSheet overlayId="s1" visible onClose={() => {}} />);
  await press("Out");
  await press("Zoom out");
  const before = past();
  await fireEvent(slider(), "touchStart");
  await fireEvent(slider(), "touchMove", { v: 1 });
  await fireEvent(slider(), "touchMove", { v: 1.5 });
  expect(anim("s1").out).toEqual({ id: "zoomOut", duration: 1.5 });
  expect(past()).toBe(before + 1);
  expect(screen.getByText("Length 1.50 s")).toBeTruthy();
});

test("renders nothing for a caption or a missing overlay", async () => {
  const view = await render(<OverlayAnimationSheet overlayId="c1" visible onClose={() => {}} />);
  expect(screen.queryByText("Animation")).toBeNull();
  await view.rerender(<OverlayAnimationSheet overlayId={null} visible onClose={() => {}} />);
  expect(screen.queryByText("Animation")).toBeNull();
});
