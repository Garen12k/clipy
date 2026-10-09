import { render, screen } from "@testing-library/react-native";
import { Dimensions, Text } from "react-native";
import { theme } from "@/src/theme/theme";
import { useKeyboard } from "../keyboard";
import { PANEL, panelBodyWidth, panelHeight, ToolPanel } from "../ToolPanel";
import { BAR_HEIGHT, STRIP, StripSlider, StripTiles, TOOL_CARD, ToolStrip, tilesStartX, tilesStartXIn, toolWidth } from "../ToolStrip";

const H = Dimensions.get("window").height;
/** The three iPhone widths: 375 (SE, mini), 393 (the regular phone), 430 (the large one). */
const WIDTHS = [375, 393, 430] as const;

afterEach(() => { useKeyboard.setState({ height: 0 }); });

test("the card is drawn INSIDE the unchanged boxes: not one height moved", () => {
  expect(BAR_HEIGHT).toBe(90);
  expect(STRIP).toEqual({ header: 44, tiles: 72, slider: 36, height: 154, lift: 64 });
  expect(PANEL).toEqual({ header: 44, lead: 44, compact: 240, regularShare: 0.46, regularMin: 300, regularMax: 430, typingShare: 0.22, typingMin: 148, typingMax: 200 });
  expect([667, 812, 852, 932].map((h) => [panelHeight("regular", h), panelHeight("compact", h), panelHeight("regular", h, true)])).toEqual([[307, 240, 148], [374, 240, 179], [392, 240, 187], [429, 240, 200]]);
});

test("the card: a small side margin and a large radius on all four corners, the capsule's family; the margin is from the spacing scale", () => {
  expect(TOOL_CARD.margin).toBe(theme.space.sm);
  expect(TOOL_CARD.radius).toBe(theme.radius.sheet);
  expect(TOOL_CARD.radius).toBeGreaterThanOrEqual(theme.radius.card);
  for (const w of WIDTHS) expect(toolWidth(w)).toBe(w - 16);
  expect(WIDTHS.map(panelBodyWidth)).toEqual([327, 345, 382]);          // less the body's two gutters
});

test("a strip: the box keeps its height and is the page, opaque; the card fills that height on the bar step, rounded, and clips to its corners", async () => {
  await render(
    <ToolStrip visible onClose={() => {}} title="Adjust">
      <StripTiles><Text>tile</Text></StripTiles>
      <StripSlider label="Brightness" value="+35"><Text>slider</Text></StripSlider>
    </ToolStrip>,
  );
  const height = STRIP.height - 2;                                      // the host owns the hairline and the spare point
  const box = screen.getByTestId("tool-strip");
  expect(box).toHaveStyle({ height, backgroundColor: theme.elevation.page });
  expect(box.props.style.marginHorizontal).toBeUndefined();              // edge to edge: nothing of the timeline shows beside the card
  expect(box.props.pointerEvents).toBeUndefined();                       // and it takes its touches, as it always did
  const card = screen.getByTestId("tool-card");
  expect(card).toHaveStyle({ height, marginHorizontal: TOOL_CARD.margin, borderRadius: TOOL_CARD.radius, backgroundColor: theme.elevation.bar, overflow: "hidden" });
  for (const k of ["marginTop", "marginBottom", "marginVertical", "margin", "padding", "paddingVertical", "paddingTop", "paddingBottom"]) expect(card.props.style[k]).toBeUndefined();
  // The rows keep their explicit heights, and together they are the card's height: nothing was taken from a row.
  expect(screen.getByTestId("tool-strip-content")).toHaveStyle({ height });
  expect(screen.getByTestId("tool-strip-header")).toHaveStyle({ height: STRIP.header });
  expect(screen.getByTestId("strip-tiles")).toHaveStyle({ height: STRIP.tiles });
  expect(screen.getByTestId("strip-slider")).toHaveStyle({ height: STRIP.slider });
  expect(STRIP.header + STRIP.tiles + STRIP.slider).toBe(height);
});

test("the page colour is painted over the host's hairline and its bottom padding, by a view that takes no touches", async () => {
  await render(<ToolStrip visible onClose={() => {}} title="Opacity"><Text>body</Text></ToolStrip>);
  const page = screen.getByTestId("tool-card-page");
  expect(page).toHaveStyle({ position: "absolute", left: 0, right: 0, top: -1, bottom: -TOOL_CARD.bleed, backgroundColor: theme.elevation.page });
  expect(page.props.pointerEvents).toBe("none");
  expect(TOOL_CARD.bleed).toBeGreaterThan(400);                         // taller than any keyboard the host pads by
});

test("a panel: the same card inside panelHeight's box; header, lead, pinned and body keep their heights", async () => {
  await render(<ToolPanel visible onClose={() => {}} title="Caption style" lead={<Text>tabs</Text>} pinned={{ height: 96, content: <Text>sample</Text> }}><Text>body</Text></ToolPanel>);
  const height = panelHeight("regular", H) - 1;
  expect(screen.getByTestId("tool-panel")).toHaveStyle({ height, backgroundColor: theme.elevation.page });
  expect(screen.getByTestId("tool-card")).toHaveStyle({ height, marginHorizontal: TOOL_CARD.margin, borderRadius: TOOL_CARD.radius, backgroundColor: theme.elevation.bar, overflow: "hidden" });
  expect(screen.getByTestId("tool-panel-content")).toHaveStyle({ height });
  expect(screen.getByTestId("tool-panel-header")).toHaveStyle({ height: PANEL.header });
  expect(screen.getByTestId("tool-panel-lead")).toHaveStyle({ height: PANEL.lead });
  expect(screen.getByTestId("tool-panel-pinned")).toHaveStyle({ height: 96 });
  expect(screen.getByTestId("tool-panel-body")).toHaveStyle({ height: height - PANEL.header - PANEL.lead - 96 });
  // No grabber, and nothing that listens for a swipe.
  expect(screen.queryByTestId("tool-panel-grabber")).toBeNull();
  for (const id of ["tool-panel", "tool-card", "tool-panel-content", "tool-panel-header"]) expect(Object.keys(screen.getByTestId(id).props).filter((k) => /^on(Responder|StartShould|MoveShould|Gesture)/.test(k))).toEqual([]);
});

test("a compact panel and a typing panel are cards of exactly their box", async () => {
  const view = await render(<ToolPanel visible onClose={() => {}} title="Voice" size="compact" scroll={false}><Text>body</Text></ToolPanel>);
  expect(screen.getByTestId("tool-card")).toHaveStyle({ height: PANEL.compact - 1 });
  expect(screen.getByTestId("tool-panel-body")).toHaveStyle({ height: PANEL.compact - 1 - PANEL.header, paddingHorizontal: theme.space.gutter });
  await view.unmount();
  useKeyboard.setState({ height: 336 });
  await render(<ToolPanel visible onClose={() => {}} title="Text"><Text>body</Text></ToolPanel>);
  expect(screen.getByTestId("tool-card")).toHaveStyle({ height: panelHeight("regular", H, true) - 1 });
});

test("a function child is told the body's real width at each phone width", async () => {
  const window = Dimensions.get("window");
  try {
    for (const w of WIDTHS) {
      Dimensions.set({ window: { ...window, width: w } });
      const child = jest.fn(() => <Text>grid</Text>);
      const view = await render(<ToolPanel visible onClose={() => {}} title="Sticker" scroll={false}>{child}</ToolPanel>);
      expect(child).toHaveBeenLastCalledWith(expect.any(Number), w - 2 * TOOL_CARD.margin - 2 * theme.space.gutter);
      await view.unmount();
    }
  } finally { Dimensions.set({ window }); }
});

describe("tilesStartXIn in a row as wide as the card", () => {
  // 32 tiles of 52 (Filter), gaps of 8, a 16 gutter each side: 1944 wide.
  const CONTENT = 32 * 52 + 31 * 8 + 2 * theme.space.gutter;

  test.each(WIDTHS)("at %i pt: the row can scroll to its very end, and no further", (w) => {
    const end = CONTENT - toolWidth(w);
    expect(tilesStartXIn(31, 52, 32, toolWidth(w))).toBe(end);           // the last tile: clamped to the end of what the card shows
    expect(end).toBe(CONTENT - w + 16);                                 // 16 pt further than a window-wide row would stop
    // Had the window's width been passed, the row would stop short and the last tile's far gutter would never come into view.
    expect(tilesStartXIn(31, 52, 32, w)).toBe(end - 2 * TOOL_CARD.margin);
  });

  test.each(WIDTHS)("at %i pt: the selected tile lands wholly inside the card, one tile from its left edge where the row allows", (w) => {
    const inner = toolWidth(w), pitch = 52 + theme.space.sm;
    for (let i = 0; i < 32; i++) {
      const x = tilesStartXIn(i, 52, 32, inner);
      const left = theme.space.gutter + i * pitch - x, right = left + 52;   // the tile's edges in the card
      expect(left).toBeGreaterThanOrEqual(0);
      expect(right).toBeLessThanOrEqual(inner);
      if (x === tilesStartX(i, 52) && i > 0) expect(left).toBe(theme.space.gutter + 52);   // one tile (and the gutter) from the edge
    }
  });

  test.each(WIDTHS)("at %i pt: eight 72-pt tiles (Voice, Motion) — a row longer than the card ends at the card's edge", (w) => {
    const content = 8 * 72 + 7 * 8 + 32;                                // 664
    expect(tilesStartXIn(7, 72, 8, toolWidth(w))).toBe(content - toolWidth(w));
    expect(tilesStartXIn(0, 72, 8, toolWidth(w))).toBe(0);
  });

  test("a row that fits the card never scrolls", () => {
    for (const w of WIDTHS) expect(tilesStartXIn(2, 72, 3, toolWidth(w))).toBe(0);   // 3·72 + 2·8 + 32 = 264
  });
});
