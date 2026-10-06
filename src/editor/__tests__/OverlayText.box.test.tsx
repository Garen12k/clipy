import { render, screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import { DEFAULT_TEXT_STYLE, makeOverlay, type TextOverlay, type TextStyle } from "@/src/editor/model/types";
import { layoutOverlay } from "@/src/editor/model/overlayLayout";
import { CAPTION_PRESET_IDS, CAPTION_PRESETS, TEXT_TEMPLATE_IDS, TEXT_TEMPLATES } from "@/src/editor/textTemplates";
import { OverlayText } from "../components/OverlayText";

// Frame 200 × 400, fontScale 0.1 → font 40 px: default padding 0.25 × 40 = 10 px, round corner 10 × 0.5 = 5 px.
const W = 200, H = 400;
const hidden = { includeHiddenElements: true };
const flat = (el: { props: { style?: unknown } }) => (StyleSheet.flatten(el.props.style as object) ?? {}) as Record<string, number | string>;
const boxed = (style: Partial<TextStyle> = {}, p: Partial<TextOverlay> = {}) => makeOverlay({ id: "t", text: "Hello", fontScale: 0.1, color: "#FFFFFF", outline: false, start: 0, end: 5,
  background: { color: "#112233", opacity: 0.4 }, style: { ...DEFAULT_TEXT_STYLE, ...style }, ...p });
type Json = { type: string; children?: (Json | string)[] | null };
const countTexts = (n: Json | string | null): number => n === null || typeof n === "string" ? 0 : (n.type === "Text" ? 1 : 0) + (n.children ?? []).reduce((sum: number, c) => sum + countTexts(c), 0);
type Node = { children: (Node | string)[]; props: { testID?: string; style?: unknown } };
const boxes = () => (screen.queryAllByTestId(/^overlay-(base-)?body-/, hidden) as unknown as Node[])
  .flatMap((b) => b.children.filter((c): c is Node => typeof c !== "string" && c.props.testID === undefined && flat(c).backgroundColor !== undefined));
const box = () => boxes()[0];
const show = (o: TextOverlay, frameOnly = false) => render(<OverlayText overlay={o} frameW={W} frameH={H} frameOnly={frameOnly} />);

test("the default box is the box from before: padding a quarter of the font size, corners half of that", async () => {
  await show(boxed());
  expect(flat(screen.getByTestId("overlay-body-t"))).toMatchObject({ padding: 10, borderRadius: 5, maxWidth: 180 });
  expect(flat(box())).toMatchObject({ backgroundColor: "#112233", opacity: 0.4, borderRadius: 5 });
});

test("a default text with a background draws the numbers the component used before (padding = layout padding, radius = padding / 2) at two frame sizes", async () => {
  for (const [w, h] of [[200, 400], [390, 844]]) {
    const o = boxed();
    const l = layoutOverlay(o, w, h);
    const view = await render(<OverlayText overlay={o} frameW={w} frameH={h} />);
    expect(l.boxRadius).toBe(l.padding / 2);                                   // the old expression
    expect(flat(screen.getByTestId("overlay-body-t"))).toMatchObject({ padding: l.padding, borderRadius: l.padding / 2 });
    expect(flat(box()).borderRadius).toBe(l.padding / 2);
    await view.unmount();
  }
});

test("square corners; a wider and a zero padding; the round corner does not follow the padding", async () => {
  const a = await show(boxed({ boxCorner: "square", boxPadding: 0.5 }));
  expect(flat(screen.getByTestId("overlay-body-t"))).toMatchObject({ padding: 20, borderRadius: 0 });
  expect(flat(box())).toMatchObject({ borderRadius: 0 });
  await a.rerender(<OverlayText overlay={boxed({ boxPadding: 0 })} frameW={W} frameH={H} />);
  expect(flat(screen.getByTestId("overlay-body-t"))).toMatchObject({ padding: 0, borderRadius: 5 });
  await a.rerender(<OverlayText overlay={boxed({ boxPadding: 0.6 })} frameW={W} frameH={H} />);
  expect(flat(screen.getByTestId("overlay-body-t"))).toMatchObject({ padding: 24, borderRadius: 5 });
});

test("no background: no box and no padding, whatever the style says", async () => {
  await show(boxed({ boxPadding: 0.5, boxCorner: "square" }, { background: null }));
  expect(boxes()).toHaveLength(0);
  expect(flat(screen.getByTestId("overlay-body-t"))).toMatchObject({ padding: 0, borderRadius: 0 });
});

test("the under-layers move with the padding: each starts `room` px outside the fill and pads the same back in", async () => {
  // Shadow: offset 0.1 × 40 × 0.7071 = 2.8284 px, blur 0.25 × 40 = 10 px → room = ceil(12.8284) = 13 px. Padding 0.5 × 40 = 20 px → inset 20 − 13 = 7.
  const shadow = { color: "#0000FF", opacity: 0.6, distance: 0.1, blur: 0.25 };
  const a = await show(boxed({ boxPadding: 0.5, shadow }));
  expect(flat(screen.getByTestId("overlay-shadow-t", hidden))).toMatchObject({ left: 7, top: 7, right: 7, bottom: 7, padding: 13 });
  await a.rerender(<OverlayText overlay={boxed({ boxPadding: 0, shadow })} frameW={W} frameH={H} />);
  expect(flat(screen.getByTestId("overlay-shadow-t", hidden))).toMatchObject({ left: -13, top: -13, right: -13, bottom: -13, padding: 13 });
});

test("the unseen frame copy measures the same box, so the selection frame follows the padding and the corner", async () => {
  await show(boxed({ boxPadding: 0.5, boxCorner: "square" }), true);
  expect(flat(screen.getByTestId("overlay-base-body-t"))).toMatchObject({ padding: 20, borderRadius: 0, maxWidth: 180 });
  expect(boxes()).toHaveLength(0);          // the copy draws nothing
});

test("letter spacing and line height are the same on every layer, the frame copy included: all wrap alike", async () => {
  const style = { letterSpacing: 0.1, lineSpacing: 1.5, shadow: { color: "#0000FF", opacity: 0.6, distance: 0.1, blur: 0.25 }, glow: { color: "#FF0000", size: 0.5 } };
  const a = await show(boxed(style, { outline: true }));
  const metrics = (el: { props: { style?: unknown } }) => { const s = flat(el); return [s.fontFamily, s.fontSize, s.lineHeight, s.letterSpacing, s.textAlign]; };
  const want = ["Bangers_400Regular", 40, 72, 4, "center"];                   // line height 1.2 × 40 × 1.5; letter spacing 0.1 × 40
  for (const id of ["overlay-glow-t", "overlay-shadow-t", "overlay-outline-t"]) expect(metrics(screen.getByTestId(id, hidden))).toEqual(want);
  expect(metrics(screen.getByText("Hello"))).toEqual(want);
  await a.rerender(<OverlayText overlay={boxed(style, { outline: true })} frameW={W} frameH={H} frameOnly />);
  expect(metrics(screen.getByText("Hello", hidden))).toEqual(want);
});

test("THE CAP: glow + shadow + outline + fill is four text layers, and the thickest, blurriest values add none", async () => {
  await show(boxed({ outlineWidth: 3, shadow: { color: "#000000", opacity: 1, distance: 0.3, blur: 0.5 }, glow: { color: "#FFFFFF", size: 0.6 } }, { outline: true }));
  expect(countTexts(screen.toJSON() as Json | null)).toBe(4);
  expect(boxes()).toHaveLength(1);
});

test.each([...TEXT_TEMPLATE_IDS.map((id) => [id, TEXT_TEMPLATES[id].patch] as const), ...CAPTION_PRESET_IDS.map((id) => [id, CAPTION_PRESETS[id].patch] as const)])(
  "%s draws at most four text layers and at most one box", async (_id, look) => {
    await show(makeOverlay({ id: "t", text: "Aa", fontId: look.fontId, color: look.color, background: look.background, outline: look.outline, style: look.style }));
    expect(countTexts(screen.toJSON() as Json | null)).toBeLessThanOrEqual(4);
    expect(boxes()).toHaveLength(look.background ? 1 : 0);
  });
