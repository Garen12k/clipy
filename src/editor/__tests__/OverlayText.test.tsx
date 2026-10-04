import { act, fireEvent, render, screen, within } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
import { DEFAULT_TEXT_STYLE, makeClip, makeOverlay, makeProject, type TextOverlay, type TextStyle } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { OverlayLayer } from "../components/OverlayLayer";
import { OverlayText } from "../components/OverlayText";

// Frame 200 × 400, fontScale 0.1 → font 40 px, line height 48 px, base outline 2 / 450 × 400 = 1.7778 px.
const W = 200, H = 400;
const WHITE = "#FFFFFF", BLACK = "#000000", RED = "#FF0000", BLUE = "#0000FF", GREEN = "#00FF00", YELLOW = "#FFFF00";
const FAMILY = "Bangers_400Regular";
const style = (s: Partial<TextStyle>): TextStyle => ({ ...DEFAULT_TEXT_STYLE, ...s });
const text = (p: Partial<TextOverlay> = {}) => makeOverlay({ id: "t", text: "Hello", fontScale: 0.1, color: WHITE, outline: false, start: 0, end: 5, ...p });
const flat = (el: { props: { style?: unknown } }) => (StyleSheet.flatten(el.props.style as object) ?? {}) as Record<string, unknown>;
/** Every `Text` in the rendered tree, hidden ones and nested spans included. */
type Json = { type: string; children?: (Json | string)[] | null };
const countTexts = (n: Json | string | null): number => n === null || typeof n === "string" ? 0 : (n.type === "Text" ? 1 : 0) + (n.children ?? []).reduce((sum: number, c) => sum + countTexts(c), 0);
const textCount = () => countTexts(screen.toJSON() as Json | null);
const hidden = { includeHiddenElements: true };
const layerIds = ["overlay-glow-t", "overlay-shadow-t", "overlay-outline-t"];
const show = (o: TextOverlay, props: { opacity?: number; frameOnly?: boolean; time?: number } = {}) =>
  render(<OverlayText overlay={o} frameW={W} frameH={H} {...props} />);
const layersPresent = () => layerIds.filter((id) => screen.queryByTestId(id, hidden) !== null);

const SHADOW = { color: BLUE, opacity: 0.6, distance: 0.1, blur: 0.25 };   // offset 0.1 × 40 × 0.7071 = 2.8284 px, blur 10 px
const GLOW = { color: RED, size: 0.5 };                                     // radius 20 px

describe("plain text is unchanged", () => {
  test("default style without outline: exactly one Text with the style object from before styles existed", async () => {
    await show(text());
    expect(textCount()).toBe(1);
    expect(flat(screen.getByText("Hello"))).toEqual({ fontFamily: FAMILY, fontSize: 40, lineHeight: 48, color: WHITE, textAlign: "center" });
    expect("opacity" in flat(screen.getByTestId("overlay-t"))).toBe(false);
  });

  test("only outline on: still one Text, carrying the halo", async () => {
    await show(text({ outline: true }));
    expect(textCount()).toBe(1);
    expect(flat(screen.getByText("Hello"))).toEqual({ fontFamily: FAMILY, fontSize: 40, lineHeight: 48, color: WHITE, textAlign: "center",
      textShadowColor: BLACK, textShadowRadius: 1.7778, textShadowOffset: { width: 0, height: 0 } });
  });

  test("an outline colour / thickness alone stays on the single Text", async () => {
    await show(text({ outline: true, style: style({ outlineColor: GREEN, outlineWidth: 2 }) }));
    expect(layersPresent()).toEqual([]);
    expect(screen.getByText("Hello")).toHaveStyle({ textShadowColor: GREEN, textShadowRadius: 3.5556 });
  });

  test("the outline style is ignored while the outline is off", async () => {
    await show(text({ style: style({ outlineColor: GREEN, outlineWidth: 2 }) }));
    expect("textShadowColor" in flat(screen.getByText("Hello"))).toBe(false);
  });
});

describe("stacked layers", () => {
  test("glow adds one layer under the fill: halo and glyphs in the glow colour", async () => {
    await show(text({ style: style({ glow: GLOW }) }));
    expect(layersPresent()).toEqual(["overlay-glow-t"]);
    const glow = screen.getByTestId("overlay-glow-t", hidden);
    expect(flat(glow)).toEqual({ position: "absolute", left: 0, top: 0, right: 0, bottom: 0, fontFamily: FAMILY, fontSize: 40, lineHeight: 48, textAlign: "center",
      color: RED, textShadowColor: RED, textShadowRadius: 20, textShadowOffset: { width: 0, height: 0 } });
    expect(glow.props.children).toBe("Hello");
    expect(glow.props["aria-hidden"]).toBe(true);
    expect(glow.props.pointerEvents).toBe("none");
    // The fill is the same single Text as a plain text: in normal flow, no shadow of its own.
    expect(flat(screen.getByText("Hello"))).toEqual({ fontFamily: FAMILY, fontSize: 40, lineHeight: 48, color: WHITE, textAlign: "center" });
  });

  test("shadow adds one layer: offset down-right, blurred, in the shadow colour at the shadow's opacity", async () => {
    await show(text({ style: style({ shadow: SHADOW }) }));
    expect(layersPresent()).toEqual(["overlay-shadow-t"]);
    const shadow = screen.getByTestId("overlay-shadow-t", hidden);
    expect(flat(shadow)).toEqual({ position: "absolute", left: 0, top: 0, right: 0, bottom: 0, fontFamily: FAMILY, fontSize: 40, lineHeight: 48, textAlign: "center",
      color: BLUE, opacity: 0.6, textShadowColor: BLUE, textShadowRadius: 10, textShadowOffset: { width: 2.8284, height: 2.8284 } });
    expect(shadow.props["aria-hidden"]).toBe(true);
    expect(shadow.props.pointerEvents).toBe("none");
  });

  test("with a shadow or glow the outline gets its own layer and the fill carries no shadow", async () => {
    await show(text({ outline: true, style: style({ shadow: SHADOW, outlineColor: GREEN, outlineWidth: 2 }) }));
    expect(layersPresent()).toEqual(["overlay-shadow-t", "overlay-outline-t"]);
    expect(flat(screen.getByTestId("overlay-outline-t", hidden))).toEqual({ position: "absolute", left: 0, top: 0, right: 0, bottom: 0,
      fontFamily: FAMILY, fontSize: 40, lineHeight: 48, textAlign: "center",
      color: GREEN, textShadowColor: GREEN, textShadowRadius: 3.5556, textShadowOffset: { width: 0, height: 0 } });
    expect("textShadowColor" in flat(screen.getByText("Hello"))).toBe(false);
  });

  test("all three: glow, shadow, outline, fill from bottom to top, after the background", async () => {
    await show(text({ outline: true, background: { color: BLACK, opacity: 0.5 }, style: style({ shadow: SHADOW, glow: GLOW }) }));
    const box = screen.getByTestId("overlay-t").children[0] as unknown as { children: { props: { testID?: string; children?: unknown } }[] };
    const order = box.children.map((c) => c.props.testID ?? (c.props.children === "Hello" ? "fill" : "background"));
    expect(order).toEqual(["background", "overlay-glow-t", "overlay-shadow-t", "overlay-outline-t", "fill"]);
    expect(textCount()).toBe(4);
    // Inside the padding (0.25 × 40 = 10 px), so every layer has the fill's width and wraps the same.
    for (const id of layerIds) expect(screen.getByTestId(id, hidden)).toHaveStyle({ left: 10, top: 10, right: 10, bottom: 10 });
    expect(screen.getByTestId("overlay-outline-t", hidden)).toHaveStyle({ color: BLACK, textShadowColor: BLACK, textShadowRadius: 1.7778 });
  });

  test("letter spacing and line spacing are on every layer and on the fill", async () => {
    await show(text({ outline: true, align: "left", style: style({ letterSpacing: 0.1, lineSpacing: 1.5, shadow: SHADOW, glow: GLOW }) }));
    for (const el of [...layerIds.map((id) => screen.getByTestId(id, hidden)), screen.getByText("Hello")])
      expect(el).toHaveStyle({ letterSpacing: 4, lineHeight: 72, fontSize: 40, fontFamily: FAMILY, textAlign: "left" });
  });

  test("letter spacing on a plain text adds only that key", async () => {
    await show(text({ style: style({ letterSpacing: -0.05 }) }));
    expect(flat(screen.getByText("Hello"))).toEqual({ fontFamily: FAMILY, fontSize: 40, lineHeight: 48, color: WHITE, textAlign: "center", letterSpacing: -2 });
  });
});

describe("opacity", () => {
  const wrapperOpacity = () => flat(screen.getByTestId("overlay-t")).opacity;
  test("the style's opacity alone", async () => { await show(text({ style: style({ opacity: 0.5 }) })); expect(wrapperOpacity()).toBe(0.5); });
  test("the animated opacity alone", async () => { await show(text(), { opacity: 0.4 }); expect(wrapperOpacity()).toBe(0.4); });
  test("both multiply", async () => { await show(text({ style: style({ opacity: 0.5 }) }), { opacity: 0.5 }); expect(wrapperOpacity()).toBe(0.25); });
  test("an animated opacity of 1 keeps its key", async () => { await show(text(), { opacity: 1 }); expect(wrapperOpacity()).toBe(1); });
  test("a fully transparent text is drawn at the 0.02 floor so it can still be tapped", async () => {
    await show(text({ style: style({ opacity: 0 }) }));
    expect(wrapperOpacity()).toBe(0.02);
  });
});

describe("the frame-only copy", () => {
  test("is one unseen Text with the metrics that size the box, whatever the style", async () => {
    await show(text({ outline: true, style: style({ opacity: 0.3, letterSpacing: 0.1, lineSpacing: 1.5, shadow: SHADOW, glow: GLOW }),
      kind: "caption", words: [{ text: "Hello", start: 0, end: 1 }], highlightColor: YELLOW }), { frameOnly: true, time: 0.5 });
    expect(textCount()).toBe(1);
    const copy = screen.getByText("Hello", hidden);
    expect(flat(copy)).toEqual({ fontFamily: FAMILY, fontSize: 40, lineHeight: 72, textAlign: "center", letterSpacing: 4, opacity: 0 });
    expect(copy.props.children).toBe("Hello");
    expect("opacity" in flat(screen.getByTestId("overlay-base-t"))).toBe(false);   // the selection frame inside is not faded
  });

  test("with the default style it is the copy from before", async () => {
    await show(text({ outline: true }), { frameOnly: true });
    expect(flat(screen.getByText("Hello", hidden))).toEqual({ fontFamily: FAMILY, fontSize: 40, lineHeight: 48, textAlign: "center", opacity: 0 });
  });
});

describe("caption word highlight", () => {
  const words = [{ text: "one", start: 0, end: 0.5 }, { text: "two", start: 0.5, end: 1 }, { text: "three", start: 1.4, end: 2 }];
  const caption = (p: Partial<TextOverlay> = {}) => text({ kind: "caption", text: "one two three", start: 2, end: 5, words, highlightColor: YELLOW, ...p });
  const fill = () => screen.getByText("one two three");
  const colours = () => ["one", "two", "three"].map((w) => flat(within(fill()).getByText(w)).color);

  test("the fill is one Text with a span per word, joined by spaces", async () => {
    await show(caption(), { time: 2 });
    const kids = fill().props.children as unknown[];
    expect(kids.filter((k) => typeof k === "string")).toEqual([" ", " "]);
    expect(kids).toHaveLength(5);
    expect(flat(fill())).toEqual({ fontFamily: FAMILY, fontSize: 40, lineHeight: 48, color: WHITE, textAlign: "center" });
  });

  test("the active word is the one whose [start, end) holds the time inside the caption", async () => {
    const view = await show(caption(), { time: 2 });                       // 0 s into the caption
    expect(colours()).toEqual([YELLOW, undefined, undefined]);
    await view.rerender(<OverlayText overlay={caption()} frameW={W} frameH={H} time={2.5} />);   // an end is exclusive, a start inclusive
    expect(colours()).toEqual([undefined, YELLOW, undefined]);
    await view.rerender(<OverlayText overlay={caption()} frameW={W} frameH={H} time={3.75} />);
    expect(colours()).toEqual([undefined, undefined, YELLOW]);
  });

  test("no word is highlighted in a gap, after the last word, or without a time", async () => {
    const view = await show(caption(), { time: 3.2 });
    expect(colours()).toEqual([undefined, undefined, undefined]);
    await view.rerender(<OverlayText overlay={caption()} frameW={W} frameH={H} time={4} />);
    expect(colours()).toEqual([undefined, undefined, undefined]);
    await view.rerender(<OverlayText overlay={caption()} frameW={W} frameH={H} />);
    expect(colours()).toEqual([undefined, undefined, undefined]);
  });

  test.each([
    ["no words", { words: [] }],
    ["no highlight colour", { highlightColor: null }],
    ["a plain text", { kind: "text" as const }],
  ])("%s: the fill is the plain string", async (_name, p) => {
    await show(caption(p), { time: 2 });
    expect(fill().props.children).toBe("one two three");
  });

  test("under-layers keep the plain string", async () => {
    await show(caption({ outline: true, style: style({ glow: GLOW }) }), { time: 2 });
    expect(screen.getByTestId("overlay-glow-t", hidden).props.children).toBe("one two three");
    expect(screen.getByTestId("overlay-outline-t", hidden).props.children).toBe("one two three");
    expect(colours()).toEqual([YELLOW, undefined, undefined]);
  });
});

describe("in the overlay layer", () => {
  async function layer(overlays: TextOverlay[], playhead: number, selected?: string) {
    useEditorStore.getState().reset();
    useEditorStore.getState().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 10 })], overlays }));
    useEditorStore.getState().seek(playhead);
    if (selected) useEditorStore.getState().selectOverlay(selected);
    await render(<OverlayLayer frameW={W} frameH={H} onOpenPanel={() => {}} />);
  }
  const words = [{ text: "one", start: 0, end: 0.5 }, { text: "two", start: 0.5, end: 1 }];
  const caption = () => text({ id: "c", kind: "caption", text: "one two", start: 2, end: 5, words, highlightColor: YELLOW });

  test("the playhead drives a caption's highlight", async () => {
    await layer([caption()], 2.1);
    const colours = () => ["one", "two"].map((w) => flat(within(screen.getByText("one two")).getByText(w)).color);
    expect(colours()).toEqual([YELLOW, undefined]);
    await act(() => { useEditorStore.getState().seek(2.6); });
    expect(colours()).toEqual([undefined, YELLOW]);
  });

  test("a fully transparent text keeps its tap target", async () => {
    await layer([text({ style: style({ opacity: 0 }) })], 1);
    expect(flat(screen.getByTestId("overlay-t")).opacity).toBe(0.02);
    await fireEvent.press(screen.getByLabelText("Overlay Hello"));
    expect(useEditorStore.getState().selectedOverlayId).toBe("t");
  });

  test("a see-through text's selection frame sits in the unfaded base copy", async () => {
    await layer([text({ style: style({ opacity: 0.3 }) })], 1, "t");
    expect(flat(screen.getByTestId("overlay-t")).opacity).toBe(0.3);
    const base = screen.getByTestId("overlay-base-t");
    expect("opacity" in flat(base)).toBe(false);
    expect(within(base).getByTestId("selection-frame-t")).toBeTruthy();
    expect(screen.getAllByTestId("selection-frame-t")).toHaveLength(1);
  });

  test("an opaque text without motion still has no base copy", async () => {
    await layer([text({ outline: true, style: style({ glow: GLOW }) })], 1, "t");
    expect(screen.queryByTestId("overlay-base-t")).toBeNull();
    expect(within(screen.getByTestId("overlay-t")).getByTestId("selection-frame-t")).toBeTruthy();
  });
});
