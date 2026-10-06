import { act, fireEvent, render, screen } from "@testing-library/react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
jest.mock("@react-native-community/slider", () => { const { View } = require("react-native"); return ({ testID, disabled, value, minimumValue, maximumValue, step, onSlidingStart, onValueChange }: { testID?: string; disabled?: boolean; value?: number; minimumValue?: number; maximumValue?: number; step?: number; onSlidingStart?: () => void; onValueChange?: (v: number) => void }) => <View testID={testID} {...{ disabled, value, minimumValue, maximumValue, step }} onTouchStart={() => onSlidingStart?.()} onTouchMove={(e: unknown) => onValueChange?.((e as { v?: number })?.v ?? 0.8)} />; });
import { ANIM_COMBO, ANIM_IN } from "@/src/editor/effects";
import { ANIM_COMBO_IDS, ANIM_IN_IDS, makeClip, makePhotoClip, makeProject } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { setClipAnimation } from "@/src/editor/model/ops";
import { TILE_WIDTH } from "@/src/ui/Tile";
import { tilesStartX } from "@/src/ui/ToolStrip";
import { ClipAnimationSheet } from "../components/ClipAnimationSheet";

const anim = (i = 0) => useEditorStore.getState().project!.clips[i].animation;
const past = () => useEditorStore.getState().past.length;
const press = (name: string) => fireEvent.press(screen.getByRole("button", { name }));
const tile = (name: string) => screen.getByRole("button", { name });
const slider = () => screen.getByTestId("animation-slider");

beforeEach(() => {
  useEditorStore.getState().reset();
  useEditorStore.getState().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 4 }), makeClip({ id: "b", sourceDuration: 4 })] }));
});

test("titled Animation; opens on In with None selected, every In tile and a disabled Length slider", async () => {
  await render(<ClipAnimationSheet clipId="a" visible onClose={() => {}} />);
  expect(screen.getByText("Animation")).toBeTruthy();
  expect(tile("In")).toBeSelected();
  expect(tile("None")).toBeSelected();
  for (const id of ANIM_IN_IDS) expect(tile(ANIM_IN[id].label)).not.toBeSelected();
  expect(slider().props).toMatchObject({ disabled: true, minimumValue: 0.1, maximumValue: 2, step: 0.05 });
  expect(screen.getByText("Length 0.50 s")).toBeTruthy();
});

test("picking an In tile sets the edge with the default length in one undo step; None clears it", async () => {
  await render(<ClipAnimationSheet clipId="a" visible onClose={() => {}} />);
  await press("Fade");
  expect(anim()).toEqual({ in: { id: "fade", duration: 0.5 }, out: null, combo: null });
  expect(past()).toBe(1);
  expect(tile("Fade")).toBeSelected();
  expect(tile("None")).not.toBeSelected();
  expect(slider().props.disabled).toBe(false);
  await press("None");
  expect(anim()).toEqual({ in: null, out: null, combo: null });
  expect(past()).toBe(2);
  expect(anim(1)).toEqual({ in: null, out: null, combo: null });
});

test("the Out tab edits the out edge and leaves In alone", async () => {
  await render(<ClipAnimationSheet clipId="a" visible onClose={() => {}} />);
  await press("Fade");
  await press("Out");
  expect(tile("None")).toBeSelected();
  await press("Slide left");
  expect(anim()).toEqual({ in: { id: "fade", duration: 0.5 }, out: { id: "slideLeft", duration: 0.5 }, combo: null });
});

test("the Length slider is one undo step per drag and picking another tile keeps the length", async () => {
  await render(<ClipAnimationSheet clipId="a" visible onClose={() => {}} />);
  await press("Fade");
  const before = past();
  await fireEvent(slider(), "touchStart");
  await fireEvent(slider(), "touchMove", { v: 0.8 });
  await fireEvent(slider(), "touchMove", { v: 1.2 });
  expect(anim().in).toEqual({ id: "fade", duration: 1.2 });
  expect(past()).toBe(before + 1);
  expect(screen.getByText("Length 1.20 s")).toBeTruthy();
  await press("Spin");
  expect(anim().in).toEqual({ id: "spin", duration: 1.2 });
  await act(() => { useEditorStore.getState().undo(); useEditorStore.getState().undo(); });
  expect(anim().in).toEqual({ id: "fade", duration: 0.5 });
});

test("dragging the Length slider on the Out tab changes Out only, as one undo step", async () => {
  await render(<ClipAnimationSheet clipId="a" visible onClose={() => {}} />);
  await press("Fade");
  await press("Out");
  await press("Slide left");
  expect(slider().props).toMatchObject({ disabled: false, value: 0.5 });
  const before = past();
  await fireEvent(slider(), "touchStart");
  await fireEvent(slider(), "touchMove", { v: 0.8 });
  await fireEvent(slider(), "touchMove", { v: 1.5 });
  expect(anim()).toEqual({ in: { id: "fade", duration: 0.5 }, out: { id: "slideLeft", duration: 1.5 }, combo: null });
  expect(past()).toBe(before + 1);
  expect(screen.getByText("Length 1.50 s")).toBeTruthy();
  await press("In");
  expect(slider().props.value).toBe(0.5);
  expect(tile("Fade")).toBeSelected();
});

test("the Combo tab lists the combos without a slider; picking one clears In / Out and the tabs reflect it", async () => {
  await render(<ClipAnimationSheet clipId="a" visible onClose={() => {}} />);
  await press("Fade");
  await press("Combo");
  expect(screen.queryByTestId("animation-slider")).toBeNull();
  for (const id of ANIM_COMBO_IDS) expect(tile(ANIM_COMBO[id].label)).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Fade" })).toBeNull();
  await press("Sway");
  expect(anim()).toEqual({ in: null, out: null, combo: "sway" });
  expect(tile("Sway")).toBeSelected();
  await press("In");
  expect(tile("None")).toBeSelected();
  expect(tile("Fade")).not.toBeSelected();
  expect(slider().props.disabled).toBe(true);
  await press("Out");
  expect(tile("None")).toBeSelected();
  expect(slider().props.disabled).toBe(true);
});

test("picking an In tile clears the combo", async () => {
  await render(<ClipAnimationSheet clipId="a" visible onClose={() => {}} />);
  await press("Combo");
  await press("Pulse");
  await press("In");
  await press("Pop");
  expect(anim()).toEqual({ in: { id: "pop", duration: 0.5 }, out: null, combo: null });
  await press("Combo");
  expect(tile("None")).toBeSelected();
  expect(tile("Pulse")).not.toBeSelected();
});

test("Apply to all clips gives every clip its own copy in one undo step", async () => {
  await render(<ClipAnimationSheet clipId="a" visible onClose={() => {}} />);
  await press("Fade");
  const before = past();
  await press("Apply to all clips");
  expect(anim(1)).toEqual({ in: { id: "fade", duration: 0.5 }, out: null, combo: null });
  expect(anim(1)).not.toBe(anim(0));
  expect(anim(1).in).not.toBe(anim(0).in);
  expect(past()).toBe(before + 1);
  await act(() => { useEditorStore.getState().undo(); });
  expect(anim(1)).toEqual({ in: null, out: null, combo: null });
  expect(anim(0).in).toEqual({ id: "fade", duration: 0.5 });
});

test("re-picking the selected tile adds no undo step", async () => {
  await render(<ClipAnimationSheet clipId="a" visible onClose={() => {}} />);
  await press("Fade");
  await press("Fade");
  expect(past()).toBe(1);
});

test("renders nothing when the clip is gone", async () => {
  await render(<ClipAnimationSheet clipId="zzz" visible onClose={() => {}} />);
  expect(screen.queryByText("Animation")).toBeNull();
});

describe("a photo: zoom and pan live in the Motion tool", () => {
  const rowLabels = () => screen.getAllByRole("button").map((b) => b.props.accessibilityLabel as string).filter((l) => !["In", "Out", "Combo", "Done", "Apply to all clips"].includes(l));

  test("the Combo tab lists None, Sway and Pulse for a photo; a video still sees all six", async () => {
    useEditorStore.getState().setProject(makeProject({ clips: [makePhotoClip({ id: "p" }), makeClip({ id: "a", sourceDuration: 4 })] }));
    const view = await render(<ClipAnimationSheet clipId="p" visible onClose={() => {}} />);
    await press("Combo");
    expect(rowLabels()).toEqual(["None", "Sway", "Pulse"]);
    await view.rerender(<ClipAnimationSheet clipId="a" visible onClose={() => {}} />);
    expect(rowLabels()).toEqual(["None", ...ANIM_COMBO_IDS.map((id) => ANIM_COMBO[id].label)]);
  });

  test("a photo that already has a zoom / pan Combo keeps that tile, ringed, until it is removed", async () => {
    useEditorStore.getState().setProject(makeProject({ clips: [makePhotoClip({ id: "p", animation: { in: null, out: null, combo: "zoomOutSlow" } })] }));
    await render(<ClipAnimationSheet clipId="p" visible onClose={() => {}} />);
    await press("Combo");
    expect(rowLabels()).toEqual(["None", "Slow zoom out", "Sway", "Pulse"]);
    expect(tile("Slow zoom out")).toBeSelected();
    await press("None");
    expect(anim().combo).toBeNull();
    expect(rowLabels()).toEqual(["None", "Sway", "Pulse"]);
  });

  test("picking a Combo on a photo removes its Motion (one undo step)", async () => {
    useEditorStore.getState().setProject(makeProject({ clips: [{ ...makePhotoClip({ id: "p" }), motion: { id: "zoomIn", strength: 0.5 } }] }));
    await render(<ClipAnimationSheet clipId="p" visible onClose={() => {}} />);
    await press("Combo");
    await press("Sway");
    expect(anim().combo).toBe("sway");
    expect("motion" in useEditorStore.getState().project!.clips[0]).toBe(false);
    expect(past()).toBe(1);
  });
});

type ScrollInst = ReturnType<typeof screen.getByTestId>;
const findRowScroll = (n: ScrollInst): ScrollInst | null => { if (n.props.contentOffset !== undefined) return n; for (const c of n.children) { if (typeof c === "string") continue; const f = findRowScroll(c as ScrollInst); if (f) return f; } return null; };
/** Where the tile row starts (the kit hands it to its ScrollView as contentOffset). */
const rowStartX = () => findRowScroll(screen.getByTestId("strip-tiles"))!.props.contentOffset.x as number;

test("the tile row keeps its offset across picks; a tab, another clip or the next opening works it out again", async () => {
  useEditorStore.getState().apply((p) => setClipAnimation(p, "a", { in: { id: "rise", duration: 0.5 } }));
  const view = await render(<ClipAnimationSheet clipId="a" visible onClose={() => {}} />);
  const atRise = tilesStartX(ANIM_IN_IDS.indexOf("rise") + 1, TILE_WIDTH);
  expect(atRise).toBeGreaterThan(0);
  expect(rowStartX()).toBe(atRise);
  await press("Fade");
  expect(anim().in?.id).toBe("fade");
  expect(rowStartX()).toBe(atRise);                           // the row did not move under the finger
  await press("Combo");
  expect(rowStartX()).toBe(0);
  await press("Pulse");
  expect(anim().combo).toBe("pulse");
  expect(rowStartX()).toBe(0);
  await view.rerender(<ClipAnimationSheet clipId="a" visible={false} onClose={() => {}} />);
  await view.rerender(<ClipAnimationSheet clipId="a" visible onClose={() => {}} />);
  await press("Combo");
  expect(rowStartX()).toBe(tilesStartX(ANIM_COMBO_IDS.indexOf("pulse") + 1, TILE_WIDTH));
  await view.rerender(<ClipAnimationSheet clipId="b" visible onClose={() => {}} />);
  expect(rowStartX()).toBe(0);
});
