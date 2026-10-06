import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
jest.mock("@/src/lib/id", () => { let n = 0; return { newId: () => `id${++n}` }; });
jest.mock("@/src/projects/pickMedia", () => ({ pickMedia: jest.fn() }));
jest.mock("@/src/projects", () => ({ storage: { importMedia: jest.fn() } }));
jest.mock("@react-native-community/slider", () => { const { View } = require("react-native"); return ({ testID, disabled, value, minimumValue, maximumValue, step, onSlidingStart, onValueChange }: { testID?: string; disabled?: boolean; value?: number; minimumValue?: number; maximumValue?: number; step?: number; onSlidingStart?: () => void; onValueChange?: (v: number) => void }) => <View testID={testID} {...{ disabled, value, minimumValue, maximumValue, step }} onTouchStart={() => onSlidingStart?.()} onTouchMove={(e: unknown) => onValueChange?.((e as { v?: number })?.v ?? 0.8)} />; });
import { addCollage } from "@/src/editor/model/collageOps";
import { makeClip, makePhotoClip, makeProject, type Project } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { storage } from "@/src/projects";
import { pickMedia } from "@/src/projects/pickMedia";
import { useToast } from "@/src/ui/Toast";
import { CollageSheet } from "../components/CollageSheet";

const pick = pickMedia as jest.Mock;
const importMedia = storage.importMedia as jest.Mock;
const st = () => useEditorStore.getState();
const layers = () => st().project!.layers;
const past = () => st().past.length;
const tile = (name: string) => screen.getByRole("button", { name });
const tiles = () => screen.getAllByRole("button").map((b) => b.props.accessibilityLabel as string).filter((l) => l !== "Done" && l !== "Fit to frame");
const border = () => screen.getByTestId("collage-border");
const corner = () => screen.getByTestId("collage-corner");
const base = makeProject({ clips: [makeClip({ id: "a", sourceDuration: 10 })] });
const photos = (...ids: string[]) => ids.map((id) => makePhotoClip({ id }));
const two: Project = addCollage(base, photos("x1", "x2"), "sideBySide", 0, "g");
const three: Project = addCollage(base, photos("y1", "y2", "y3"), "row3", 0, "g3");
const open = (id: string | null) => render(<CollageSheet clipId={id} visible onClose={() => {}} />);

beforeEach(() => { jest.clearAllMocks(); useToast.getState().clear(); st().reset(); st().setProject(base); });

test("nothing made yet: the six layouts, none ringed, both sliders off at 0 % and Square", async () => {
  await open(null);
  expect(screen.getByText("Collage")).toBeTruthy();
  expect(tiles()).toEqual(["Side by side", "Stacked", "Big and two", "Row of three", "Grid of four", "Inset"]);
  for (const name of tiles()) expect(tile(name)).not.toBeSelected();
  expect(border().props).toMatchObject({ disabled: true, minimumValue: 0, maximumValue: 0.06, step: 0.005, value: 0 });
  expect(corner().props).toMatchObject({ disabled: true, minimumValue: 0, maximumValue: 2, step: 1, value: 0 });
  expect(screen.getByText("Border 0 %")).toBeTruthy();
  expect(screen.getByText("Corner Square")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Fit to frame" })).toBeNull();
  for (const id of ["sideBySide", "stacked", "bigTwo", "row3", "grid4", "inset"]) expect(screen.getByTestId(`collage-diagram-${id}`)).toBeTruthy();
});

test("tapping a layout opens the picker for that many items and lands them in the cells", async () => {
  pick.mockResolvedValueOnce([{ uri: "file:///1.jpg", kind: "photo", durationSec: 0, width: 1080, height: 1920 }, { uri: "file:///2.jpg", kind: "photo", durationSec: 0, width: 1080, height: 1920 }]);
  importMedia.mockResolvedValueOnce({ clips: photos("n1", "n2"), failed: 0 });
  await open(null);
  await fireEvent.press(tile("Stacked"));
  await waitFor(() => expect(layers()).toHaveLength(2));
  expect(pick).toHaveBeenCalledWith({ limit: 2 });
  expect(layers().map((l) => l.collage!.layout)).toEqual(["stacked", "stacked"]);
  expect(st().selectedClipId).toBe("n1");
  expect(past()).toBe(1);
});

test("a cell selected: only the layouts with as many cells, the current one ringed; another one re-lays the collage in one undo step", async () => {
  st().setProject(two);
  const view = await open("x1");
  expect(tiles()).toEqual(["Side by side", "Stacked", "Inset"]);
  expect(tile("Side by side")).toBeSelected();
  await fireEvent.press(tile("Side by side"));
  expect(past()).toBe(0);
  await fireEvent.press(tile("Stacked"));
  expect(layers().map((l) => l.collage!.layout)).toEqual(["stacked", "stacked"]);
  expect(tile("Stacked")).toBeSelected();
  expect(past()).toBe(1);
  expect(pick).not.toHaveBeenCalled();
  await act(async () => { st().setProject(three); });
  await view.rerender(<CollageSheet clipId="y2" visible onClose={() => {}} />);
  expect(tiles()).toEqual(["Big and two", "Row of three"]);
  expect(tile("Row of three")).toBeSelected();
});

test("Border: one undo step per drag, every cell follows, the label shows per cent", async () => {
  st().setProject(two);
  await open("x2");
  expect(border().props.disabled).toBe(false);
  await fireEvent(border(), "touchStart");
  await fireEvent(border(), "touchMove", { v: 0.02 });
  await fireEvent(border(), "touchMove", { v: 0.04 });
  expect(layers().map((l) => l.collage!.border)).toEqual([0.04, 0.04]);
  expect(layers()[0].transform).toMatchObject({ scale: 0.44, x: -0.24 });
  expect(screen.getByText("Border 4 %")).toBeTruthy();
  expect(past()).toBe(1);
});

test("Corner: three stops that write the masks", async () => {
  st().setProject(two);
  await open("x1");
  await fireEvent(corner(), "touchStart");
  await fireEvent(corner(), "touchMove", { v: 1 });
  expect(layers().map((l) => l.mask)).toEqual(["rounded", "rounded"]);
  expect(screen.getByText("Corner Rounded")).toBeTruthy();
  await fireEvent(corner(), "touchMove", { v: 2 });
  expect(layers().map((l) => l.mask)).toEqual(["circle", "circle"]);
  expect(screen.getByText("Corner Round")).toBeTruthy();
  expect(past()).toBe(1);
});

test("Fit to frame shows only after the frame's shape changed, and one tap re-lays the cells for it", async () => {
  st().setProject({ ...two, aspectRatio: "1:1" });
  await open("x1");
  await fireEvent.press(screen.getByRole("button", { name: "Fit to frame" }));
  expect(layers().map((l) => l.collage!.aspect)).toEqual([1, 1]);
  expect(layers()[0].crop).toEqual({ x: 0.055556, y: 0, w: 0.888889, h: 1 });
  expect(screen.queryByRole("button", { name: "Fit to frame" })).toBeNull();
  expect(past()).toBe(1);
});

test("renders nothing while hidden", async () => {
  await render(<CollageSheet clipId={null} visible={false} onClose={() => {}} />);
  expect(screen.queryByText("Collage")).toBeNull();
});

test("a cell moved by hand: the panel shows its own tag, the others follow the sliders, and Fit to frame goes once nothing is left to fit", async () => {
  const moved: Project = { ...two, aspectRatio: "1:1", layers: two.layers.map((l) => (l.id === "x1" ? { ...l, transform: { ...l.transform, x: 0.1 } } : l)) };
  st().setProject(moved);
  await open("x1");
  await fireEvent.press(screen.getByRole("button", { name: "Fit to frame" }));
  expect(layers().map((l) => l.collage!.aspect)).toEqual([two.layers[0].collage!.aspect, 1]);
  expect(layers()[0]).toBe(moved.layers[0]);
  expect(screen.queryByRole("button", { name: "Fit to frame" })).toBeNull();
  expect(past()).toBe(1);
  await fireEvent.press(tile("Stacked"));
  expect(layers().map((l) => l.collage!.layout)).toEqual(["sideBySide", "stacked"]);
  expect(tile("Side by side")).toBeSelected();
  await fireEvent(border(), "touchStart");
  await fireEvent(border(), "touchMove", { v: 0.03 });
  expect(layers().map((l) => l.collage!.border)).toEqual([0, 0.03]);
  expect(screen.getByText("Border 0 %")).toBeTruthy();
  expect(past()).toBe(3);
});

test("a selected item that is not a collage cell: the panel makes a new collage (six tiles, sliders off)", async () => {
  await open("a");
  expect(tiles()).toHaveLength(6);
  expect(border().props.disabled).toBe(true);
  expect(corner().props.disabled).toBe(true);
});

test("a tile tapped while a pick is open does not open a second one", async () => {
  let resolve: (v: unknown) => void = () => {};
  pick.mockReturnValueOnce(new Promise((r) => { resolve = r; }));
  await open(null);
  await fireEvent.press(tile("Stacked"));
  await fireEvent.press(tile("Inset"));
  expect(pick).toHaveBeenCalledTimes(1);
  await act(async () => { resolve(null); });
  expect(layers()).toHaveLength(0);
  expect(past()).toBe(0);
  expect(useToast.getState().message).toBeNull();
});
