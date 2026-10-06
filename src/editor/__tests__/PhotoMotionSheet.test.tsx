import { fireEvent, render, screen } from "@testing-library/react-native";
import { Dimensions } from "react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
jest.mock("@react-native-community/slider", () => { const { View } = require("react-native"); return ({ testID, disabled, value, minimumValue, maximumValue, step, onSlidingStart, onValueChange }: { testID?: string; disabled?: boolean; value?: number; minimumValue?: number; maximumValue?: number; step?: number; onSlidingStart?: () => void; onValueChange?: (v: number) => void }) => <View testID={testID} {...{ disabled, value, minimumValue, maximumValue, step }} onTouchStart={() => onSlidingStart?.()} onTouchMove={(e: unknown) => onValueChange?.((e as { v?: number })?.v ?? 0.8)} />; });
import { makeClip, makePhotoClip, makeProject, PHOTO_MOTION_IDS, type Clip } from "@/src/editor/model/types";
import { PHOTO_MOTIONS } from "@/src/editor/photoTools";
import { useEditorStore } from "@/src/editor/store";
import { TILE_WIDTH } from "@/src/ui/Tile";
import { tilesStartXIn } from "@/src/ui/ToolStrip";
import { PhotoMotionSheet } from "../components/PhotoMotionSheet";

type Inst = ReturnType<typeof screen.getByTestId>;
const findScroll = (n: Inst): Inst | null => { if (n.props.contentOffset !== undefined) return n; for (const c of n.children) { if (typeof c === "string") continue; const f = findScroll(c as Inst); if (f) return f; } return null; };

const st = () => useEditorStore.getState();
const clip = (id: string): Clip => [...st().project!.clips, ...st().project!.layers].find((c) => c.id === id)!;
const past = () => st().past.length;
const tile = (name: string) => screen.getByRole("button", { name });
const press = (name: string) => fireEvent.press(tile(name));
const slider = () => screen.getByTestId("motion-strength");
const open = (id: string) => render(<PhotoMotionSheet clipId={id} visible onClose={() => {}} />);

beforeEach(() => {
  st().reset();
  st().setProject(makeProject({
    clips: [makePhotoClip({ id: "p" }), makePhotoClip({ id: "q" }), makeClip({ id: "v", sourceDuration: 4 }), makePhotoClip({ id: "old", animation: { in: null, out: null, combo: "panLeft" } })],
    layers: [{ ...makePhotoClip({ id: "L" }), start: 0 }],
  }));
});

test("titled Motion: None is ringed, the seven motions follow in order, Strength is off at 50 %", async () => {
  await open("p");
  expect(screen.getByText("Motion")).toBeTruthy();
  const labels = screen.getAllByRole("button").map((b) => b.props.accessibilityLabel as string).filter((l) => l !== "Done" && l !== "Apply to all photos");
  expect(labels).toEqual(["None", "Zoom in", "Zoom out", "Pan left", "Pan right", "Pan up", "Pan down", "Corner zoom"]);
  expect(tile("None")).toBeSelected();
  for (const id of PHOTO_MOTION_IDS) expect(tile(PHOTO_MOTIONS[id].label)).not.toBeSelected();
  expect(slider().props).toMatchObject({ disabled: true, minimumValue: 0, maximumValue: 1, step: 0.05, value: 0.5 });
  expect(screen.getByText("Strength 50 %")).toBeTruthy();
});

test("a tile sets the motion in one undo step; the ringed tile again does nothing; None removes it", async () => {
  await open("p");
  await press("Zoom in");
  expect(clip("p").motion).toEqual({ id: "zoomIn", strength: 0.5 });
  expect(past()).toBe(1);
  expect(tile("Zoom in")).toBeSelected();
  expect(tile("None")).not.toBeSelected();
  expect(slider().props.disabled).toBe(false);
  await press("Zoom in");
  expect(past()).toBe(1);
  await press("None");
  expect("motion" in clip("p")).toBe(false);
  expect(past()).toBe(2);
  expect(clip("q")).toEqual(makePhotoClip({ id: "q" }));              // nothing else moved
});

test("Strength is one undo step per drag, and another tile keeps it", async () => {
  await open("p");
  await press("Pan up");
  const before = past();
  await fireEvent(slider(), "touchStart");
  await fireEvent(slider(), "touchMove", { v: 0.8 });
  await fireEvent(slider(), "touchMove", { v: 0.25 });
  expect(clip("p").motion).toEqual({ id: "panUp", strength: 0.25 });
  expect(past()).toBe(before + 1);
  expect(screen.getByText("Strength 25 %")).toBeTruthy();
  await press("Zoom out");
  expect(clip("p").motion).toEqual({ id: "zoomOut", strength: 0.25 });
});

test("a photo with an older zoom / pan Combo: its twin tile is ringed and tapping it changes nothing; a drag or another tile takes the Combo's place", async () => {
  await open("old");
  expect(tile("Pan left")).toBeSelected();
  expect(screen.getByText("Strength 50 %")).toBeTruthy();
  expect(slider().props.disabled).toBe(false);
  await press("Pan left");
  expect(past()).toBe(0);
  expect(clip("old").animation.combo).toBe("panLeft");                // still the Combo, exactly as it was
  await fireEvent(slider(), "touchStart");
  await fireEvent(slider(), "touchMove", { v: 0.8 });
  expect(clip("old")).toMatchObject({ motion: { id: "panLeft", strength: 0.8 }, animation: { combo: null } });
  expect(tile("Pan left")).toBeSelected();
});

test("None clears an older zoom / pan Combo too", async () => {
  await open("old");
  await press("None");
  expect(clip("old").animation.combo).toBeNull();
  expect("motion" in clip("old")).toBe(false);
  expect(tile("None")).toBeSelected();
});

test("Apply to all photos: every main-track photo gets the motion shown, in one undo step; videos and layers do not", async () => {
  await open("p");
  await press("Corner zoom");
  await press("Apply to all photos");
  for (const id of ["p", "q", "old"]) expect(clip(id).motion).toEqual({ id: "zoomCorner", strength: 0.5 });
  expect("motion" in clip("v")).toBe(false);
  expect("motion" in clip("L")).toBe(false);
  expect(past()).toBe(2);
});

test("a photo layer: the same tiles, no Apply to all photos", async () => {
  await open("L");
  expect(screen.queryByRole("button", { name: "Apply to all photos" })).toBeNull();
  await press("Pan down");
  expect(clip("L").motion).toEqual({ id: "panDown", strength: 0.5 });
});

test("renders nothing for a video, for no clip and while hidden", async () => {
  const view = await open("v");
  expect(screen.queryByText("Motion")).toBeNull();
  await view.rerender(<PhotoMotionSheet clipId={null} visible onClose={() => {}} />);
  expect(screen.queryByText("Motion")).toBeNull();
  await view.rerender(<PhotoMotionSheet clipId="p" visible={false} onClose={() => {}} />);
  expect(screen.queryByText("Motion")).toBeNull();
});

test("the tile row starts on the ringed tile and stays where it is across picks", async () => {
  const window = Dimensions.get("window");
  Dimensions.set({ window: { ...window, width: 320 } });               // narrower than the eight tiles, so the row can start anywhere
  try {
    await open("old");
    const startX = () => findScroll(screen.getByTestId("strip-tiles"))!.props.contentOffset.x as number;
    const atPanLeft = tilesStartXIn(3, TILE_WIDTH, 8, 320);
    expect(atPanLeft).toBeGreaterThan(0);
    expect(tilesStartXIn(7, TILE_WIDTH, 8, 320)).not.toBe(atPanLeft);
    expect(startX()).toBe(atPanLeft);
    await press("Corner zoom");
    expect(startX()).toBe(atPanLeft);
    await press("None");
    expect(startX()).toBe(atPanLeft);
  } finally {
    await screen.unmount();
    Dimensions.set({ window });
  }
});

test("dragging Strength on a photo that shows an older Combo as a Motion tile is one undo step", async () => {
  await open("old");
  await fireEvent(slider(), "touchStart");
  await fireEvent(slider(), "touchMove", { v: 0.8 });
  await fireEvent(slider(), "touchMove", { v: 0.3 });
  expect(clip("old")).toMatchObject({ motion: { id: "panLeft", strength: 0.3 }, animation: { combo: null } });
  expect(past()).toBe(1);
});
