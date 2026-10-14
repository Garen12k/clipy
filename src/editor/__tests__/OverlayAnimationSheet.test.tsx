import { fireEvent, render, screen } from "@testing-library/react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
jest.mock("@react-native-community/slider", () => { const { View } = require("react-native"); return ({ testID, disabled, value, minimumValue, maximumValue, step, onSlidingStart, onValueChange }: { testID?: string; disabled?: boolean; value?: number; minimumValue?: number; maximumValue?: number; step?: number; onSlidingStart?: () => void; onValueChange?: (v: number) => void }) => <View testID={testID} {...{ disabled, value, minimumValue, maximumValue, step }} onTouchStart={() => onSlidingStart?.()} onTouchMove={(e: unknown) => onValueChange?.((e as { v?: number })?.v ?? 0.8)} />; });
import { ANIM_LOOP } from "@/src/editor/effects";
import { ANIM_LOOP_IDS, makeClip, makeOverlay, makeProject, makeSticker } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { setOverlayAnimation } from "@/src/editor/model/ops";
import { TILE_WIDTH } from "@/src/ui/Tile";
import { tilesStartX } from "@/src/ui/ToolStrip";
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
  expect(screen.queryByRole("button", { name: /Apply to All/ })).toBeNull();
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

type ScrollInst = ReturnType<typeof screen.getByTestId>;
const findRowScroll = (n: ScrollInst): ScrollInst | null => { if (n.props.contentOffset !== undefined) return n; for (const c of n.children) { if (typeof c === "string") continue; const f = findRowScroll(c as ScrollInst); if (f) return f; } return null; };
/** Where the tile row starts (the kit hands it to its ScrollView as contentOffset). */
const rowStartX = () => findRowScroll(screen.getByTestId("strip-tiles"))!.props.contentOffset.x as number;

test("the tile row keeps its offset across picks; a tab, another overlay or the next opening works it out again", async () => {
  useEditorStore.getState().apply((p) => setOverlayAnimation(p, "t1", { in: { id: "rise", duration: 0.5 } }));
  const view = await render(<OverlayAnimationSheet overlayId="t1" visible onClose={() => {}} />);
  const atRise = tilesStartX(10, TILE_WIDTH);                 // None, then the ten In ids: Rise is tile 10
  expect(rowStartX()).toBe(atRise);
  await press("Fade");
  expect(anim("t1").in?.id).toBe("fade");
  expect(rowStartX()).toBe(atRise);                           // the row did not move under the finger
  await press("Loop");
  expect(rowStartX()).toBe(0);
  await press("Shake");
  expect(anim("t1").loop).toBe("shake");
  expect(rowStartX()).toBe(0);
  await view.rerender(<OverlayAnimationSheet overlayId="t1" visible={false} onClose={() => {}} />);
  await view.rerender(<OverlayAnimationSheet overlayId="t1" visible onClose={() => {}} />);
  await press("Loop");
  expect(rowStartX()).toBe(tilesStartX(ANIM_LOOP_IDS.indexOf("shake") + 1, TILE_WIDTH));
  await view.rerender(<OverlayAnimationSheet overlayId="s1" visible onClose={() => {}} />);
  expect(rowStartX()).toBe(0);
});

test("a text's In row ends with Typewriter and Word by word; a pick is one undo step and keeps the Length", async () => {
  await render(<OverlayAnimationSheet overlayId="t1" visible onClose={() => {}} />);
  expect(tile("Typewriter")).toBeTruthy();
  expect(tile("Word by word")).toBeTruthy();
  const before = past();
  await press("Typewriter");
  expect(anim("t1").in).toEqual({ id: "typewriter", duration: 0.5 });
  expect(past()).toBe(before + 1);
  expect(tile("Typewriter")).toBeSelected();
  expect(slider().props).toMatchObject({ disabled: false });
  await press("Word by word");
  expect(anim("t1").in).toEqual({ id: "wordByWord", duration: 0.5 });
  await press("Pop");
  expect(anim("t1").in).toEqual({ id: "pop", duration: 0.5 });     // one In at a time
});

test("never on a text's Out row, nor anywhere for a sticker", async () => {
  const view = await render(<OverlayAnimationSheet overlayId="t1" visible onClose={() => {}} />);
  await press("Out");
  expect(screen.queryByRole("button", { name: "Typewriter" })).toBeNull();
  await view.rerender(<OverlayAnimationSheet overlayId="s1" visible onClose={() => {}} />);
  await press("In");
  expect(screen.queryByRole("button", { name: "Typewriter" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Word by word" })).toBeNull();
});

test("the Length slider changes a reveal's length like any In", async () => {
  useEditorStore.getState().apply((p) => setOverlayAnimation(p, "t1", { in: { id: "typewriter", duration: 0.5 } }));
  await render(<OverlayAnimationSheet overlayId="t1" visible onClose={() => {}} />);
  await fireEvent(slider(), "touchStart");
  await fireEvent(slider(), "touchMove", { v: 1.2 });
  expect(anim("t1").in).toEqual({ id: "typewriter", duration: 1.2 });
});

test("a stored reveal: its tile alone is picked, the row starts on it, and another In replaces it in one step at its Length", async () => {
  useEditorStore.getState().apply((p) => setOverlayAnimation(p, "t1", { in: { id: "wordByWord", duration: 1.5 } }));
  await render(<OverlayAnimationSheet overlayId="t1" visible onClose={() => {}} />);
  expect(tile("Word by word")).toBeSelected();
  for (const name of ["None", "Typewriter", "Fade", "Pop", "Rise"]) expect(tile(name)).not.toBeSelected();
  expect(rowStartX()).toBe(tilesStartX(12, TILE_WIDTH));    // None, the ten In ids, Typewriter, then Word by word: tile 12
  const before = past();
  await press("Fade");
  expect(anim("t1").in).toEqual({ id: "fade", duration: 1.5 });
  expect(past()).toBe(before + 1);
  expect(tile("Word by word")).not.toBeSelected();
});

test("the reveal tiles carry their name to VoiceOver and to the large-content viewer", async () => {
  await render(<OverlayAnimationSheet overlayId="t1" visible onClose={() => {}} />);
  for (const name of ["Typewriter", "Word by word"]) {
    expect(tile(name).props).toMatchObject({ accessibilityLabel: name, accessibilityShowsLargeContentViewer: true, accessibilityLargeContentTitle: name });
  }
});

test("a caption has no animation strip, so no reveal tiles", async () => {
  await render(<OverlayAnimationSheet overlayId="c1" visible onClose={() => {}} />);
  expect(screen.queryByRole("button", { name: "Typewriter" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Word by word" })).toBeNull();
});
