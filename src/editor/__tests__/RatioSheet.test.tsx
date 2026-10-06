import { act, fireEvent, render, screen, within } from "@testing-library/react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
import { ASPECT_RATIOS, frameAspect, makeClip, makeProject } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { theme } from "@/src/theme/theme";
import { RATIO_SHAPE_SIZE } from "@/src/ui/RatioShape";
import { TILE_WIDTH } from "@/src/ui/Tile";
import { tilesStartX } from "@/src/ui/ToolStrip";
import { RatioSheet } from "../components/RatioSheet";

const LABELS = ["Auto", "1:1", "3:2", "2:3", "16:9", "9:16", "4:3", "3:4", "21:9"];
const st = () => useEditorStore.getState();
const tiles = () => within(screen.getByTestId("strip-tiles")).getAllByRole("button");
beforeEach(() => {
  st().reset();
  st().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 4, width: 1920, height: 1080 })] }));
});

test("choosing a chip sets the aspect ratio and the strip stays open", async () => {
  const onClose = jest.fn();
  await render(<RatioSheet visible onClose={onClose} />);
  await fireEvent.press(screen.getByRole("button", { name: "1:1" }));
  expect(st().project?.aspectRatio).toBe("1:1");
  expect(onClose).not.toHaveBeenCalled();
});

test("nine tiles in the menu's order, each a shape over its label; the project's ratio is the selected one", async () => {
  await render(<RatioSheet visible onClose={() => {}} />);
  expect(tiles().map((t) => t.props.accessibilityLabel)).toEqual(LABELS);
  expect(tiles().map((t) => t.props.accessibilityState.selected)).toEqual(LABELS.map((l) => l === "9:16"));
  expect(screen.getByTestId("ratio-tile-9:16")).toHaveStyle(theme.ring);
  expect(screen.getByTestId("ratio-tile-auto")).toHaveStyle(theme.ringClear);
  for (const id of ASPECT_RATIOS) {
    const shape = within(screen.getByTestId(`ratio-tile-${id}`)).getByTestId("ratio-shape");
    const a = frameAspect({ aspectRatio: id, clips: st().project!.clips });
    // The longer side is the icon's size; the other follows the ratio. Auto draws the first clip's shape (16:9 here).
    expect(shape).toHaveStyle(a >= 1 ? { width: RATIO_SHAPE_SIZE, height: RATIO_SHAPE_SIZE / a } : { width: RATIO_SHAPE_SIZE * a, height: RATIO_SHAPE_SIZE });
  }
  expect(within(screen.getByTestId("ratio-tile-auto")).getByTestId("ratio-shape")).toHaveStyle({ width: RATIO_SHAPE_SIZE, height: RATIO_SHAPE_SIZE / (16 / 9), borderStyle: "dashed" });
  expect(within(screen.getByTestId("ratio-tile-1:1")).getByTestId("ratio-shape")).toHaveStyle({ borderStyle: "solid", borderColor: theme.colors.text });
  expect(within(screen.getByTestId("ratio-tile-9:16")).getByTestId("ratio-shape")).toHaveStyle({ borderColor: theme.colors.accent });
});

test("every tile is a real target: at least 44 pt wide in a 72 pt row", async () => {
  await render(<RatioSheet visible onClose={() => {}} />);
  expect(TILE_WIDTH).toBeGreaterThanOrEqual(theme.size.touch);
  expect(screen.getByTestId("strip-tiles")).toHaveStyle({ height: 72 });
});

test("the row opens with the selected tile in view", async () => {
  st().setProject(makeProject({ aspectRatio: "21:9" }));
  await render(<RatioSheet visible onClose={() => {}} />);
  type Inst = ReturnType<typeof screen.getByTestId>;
  const findScroll = (n: Inst): Inst | null => { if (n.props.contentOffset !== undefined) return n; for (const c of n.children) { if (typeof c === "string") continue; const f = findScroll(c as Inst); if (f) return f; } return null; };
  expect(findScroll(screen.getByTestId("strip-tiles"))!.props.contentOffset).toEqual({ x: tilesStartX(8, TILE_WIDTH), y: 0 });
});

const OTHERS = ASPECT_RATIOS.map((id, i) => [id, LABELS[i]] as const).filter(([id]) => id !== "9:16");
test.each(OTHERS)("picking %s is one undo step and the strip stays open", async (id, label) => {
  const onClose = jest.fn();
  await render(<RatioSheet visible onClose={onClose} />);
  await fireEvent.press(screen.getByRole("button", { name: label }));
  expect(st().project?.aspectRatio).toBe(id);
  expect(st().past).toHaveLength(1);
  expect(onClose).not.toHaveBeenCalled();
  await act(() => { st().undo(); });
  expect(st().project?.aspectRatio).toBe("9:16");
});

test("picking the ratio the project already has makes no undo step, and the strip stays open", async () => {
  const onClose = jest.fn();
  await render(<RatioSheet visible onClose={onClose} />);
  await fireEvent.press(screen.getByRole("button", { name: "9:16" }));
  expect(st().past).toHaveLength(0);
  expect(onClose).not.toHaveBeenCalled();
});

test("several ratios can be tried one after another; Done closes", async () => {
  const onClose = jest.fn();
  await render(<RatioSheet visible onClose={onClose} />);
  await fireEvent.press(screen.getByRole("button", { name: "1:1" }));
  await fireEvent.press(screen.getByRole("button", { name: "16:9" }));
  await fireEvent.press(screen.getByRole("button", { name: "4:3" }));
  expect(st().project?.aspectRatio).toBe("4:3");
  expect(st().past).toHaveLength(3);
  expect(onClose).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole("button", { name: "Done" }));
  expect(onClose).toHaveBeenCalledTimes(1);
});

type ScrollInst = ReturnType<typeof screen.getByTestId>;
const findRowScroll = (n: ScrollInst): ScrollInst | null => { if (n.props.contentOffset !== undefined) return n; for (const c of n.children) { if (typeof c === "string") continue; const f = findRowScroll(c as ScrollInst); if (f) return f; } return null; };
/** Where the tile row starts (the kit hands it to its ScrollView as contentOffset). */
const rowStartX = () => findRowScroll(screen.getByTestId("strip-tiles"))!.props.contentOffset.x as number;

test("the tile row keeps its offset across picks (and the strip stays open); it is worked out again at the next opening", async () => {
  st().setProject(makeProject({ aspectRatio: "21:9" }));
  const onClose = jest.fn();
  const view = await render(<RatioSheet visible onClose={onClose} />);
  expect(rowStartX()).toBe(tilesStartX(8, TILE_WIDTH));
  await fireEvent.press(screen.getByRole("button", { name: "1:1" }));
  expect(st().project?.aspectRatio).toBe("1:1");
  expect(rowStartX()).toBe(tilesStartX(8, TILE_WIDTH));       // the row did not move under the finger
  expect(onClose).not.toHaveBeenCalled();
  await view.rerender(<RatioSheet visible={false} onClose={onClose} />);
  await view.rerender(<RatioSheet visible onClose={onClose} />);
  expect(rowStartX()).toBe(tilesStartX(1, TILE_WIDTH));
  expect(tilesStartX(1, TILE_WIDTH)).not.toBe(tilesStartX(8, TILE_WIDTH));
});
