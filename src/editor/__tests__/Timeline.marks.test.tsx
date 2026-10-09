import { Dimensions, StyleSheet } from "react-native";
import { act, fireEvent, render, screen, within } from "@testing-library/react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
jest.mock("@/src/projects/pickMedia", () => ({ pickMedia: jest.fn(async () => null) }));
jest.mock("../timelineMarks", () => { const real = jest.requireActual("../timelineMarks"); return { ...real, rulerMarks: jest.fn(real.rulerMarks) }; });
import { makeAudioTrack, makeClip, makeEffect, makeLayer, makeOverlay, makeProject, makeSticker, type Overlay } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { theme } from "@/src/theme/theme";
import { AudioBar } from "../components/AudioBar";
import { EffectPill } from "../components/EffectPill";
import { LayerBar } from "../components/LayerBar";
import { OverlayPill } from "../components/OverlayPill";
import { Timeline } from "../components/Timeline";
import { TrimHandles } from "../components/TrimHandles";
import { CLIP_AREA_HEIGHT, LANE_GAP, LANE_HEIGHT, STRIP_HEIGHT } from "../timelineLayout";
import { BAR, BAR_GLYPH, CUT, RULER, rulerMarks, type BarKind } from "../timelineMarks";
import { useToolStrip } from "../toolStrip";
import { selectionKey } from "../toolbarContext";

const GLYPHS: Record<string, number> = require("@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/Ionicons.json");
const st = () => useEditorStore.getState();
/** The character an Ionicons glyph draws (the icon font renders a Text whose first child is that character). */
const drawn = (node: { props: { children?: unknown } }) => [node.props.children].flat()[0];
const glyph = (name: string) => String.fromCodePoint(GLYPHS[name]);
const flat = (testID: string) => StyleSheet.flatten(screen.getByTestId(testID).props.style);
const three = makeProject({ clips: [
  makeClip({ id: "a", sourceDuration: 4, transitionOut: { type: "fade", duration: 0.5 } }),
  makeClip({ id: "b", sourceDuration: 2 }),
  makeClip({ id: "c", sourceDuration: 3 }),
] });
beforeEach(() => { st().reset(); st().setProject(three); st().setZoom(50); useToolStrip.setState({ open: null }); (rulerMarks as jest.Mock).mockClear(); });

describe("the time ruler", () => {
  test("sits at the top of the pinned clip area, inside the sideways scroll, out of the flow, with no size and no touches", async () => {
    await render(<Timeline />);
    const ruler = within(within(screen.getByTestId("timeline-scroll")).getByTestId("timeline-clips")).getByTestId("time-ruler");
    expect(ruler.props.pointerEvents).toBe("none");
    expect(StyleSheet.flatten(ruler.props.style)).toEqual({ position: "absolute", left: 0, top: 0, width: 0, height: 0 });
    // Not inside the rows that scroll up and down: it stays pinned with the clips.
    expect(within(screen.getByTestId("timeline-rows")).queryByTestId("time-ruler")).toBeNull();
  });
  test("labels at the smallest size, muted, tabular; each at its time on the clips' own scale", async () => {
    await render(<Timeline />);
    const labels = screen.getAllByTestId("ruler-label");
    expect(labels.map((l) => l.props.children)).toEqual(["0:00", "0:02", "0:04", "0:06", "0:08"]);
    expect(labels.map((l) => StyleSheet.flatten(l.props.style).left)).toEqual([0, 2, 4, 6, 8].map((t) => t * 50 + 3));
    for (const l of labels) expect(l).toHaveStyle({ fontSize: theme.type.micro, color: theme.colors.textMuted, fontVariant: ["tabular-nums"], position: "absolute", top: 0 });
    const ticks = screen.getAllByTestId("ruler-tick");
    expect(ticks).toHaveLength(19);                                // every half second of 9 s
    expect(ticks.map((t) => StyleSheet.flatten(t.props.style).left).slice(0, 4)).toEqual([0, 25, 50, 75]);
    // Every mark ends where the ruler does, above the beat ticks and the clips.
    for (const t of ticks) { const s = StyleSheet.flatten(t.props.style); expect(s.top + s.height).toBe(RULER.height); }
  });
  test("it changes no height and no width: the timeline, its content and the clips are what they were", async () => {
    await render(<Timeline />);
    expect(screen.getByTestId("timeline-root")).toHaveStyle({ height: CLIP_AREA_HEIGHT });
    expect(screen.getByTestId("timeline-scroll").props.contentContainerStyle).toEqual({ paddingHorizontal: Dimensions.get("window").width / 2, height: CLIP_AREA_HEIGHT, flexDirection: "column" });
    expect(flat("timeline-clips")).toEqual({ height: CLIP_AREA_HEIGHT, flexDirection: "row", alignItems: "center" });
    expect(screen.getByRole("button", { name: "Clip a" })).toHaveStyle({ width: 200, height: STRIP_HEIGHT });
  });
  test("drawn once: the playhead, playing, a selection and an edit that keeps the length do not draw it again; the zoom and the length do", async () => {
    await render(<Timeline />);
    expect(rulerMarks).toHaveBeenCalledTimes(1);
    const first = screen.getAllByTestId("ruler-label")[1];
    await act(() => { for (const t of [0.1, 0.5, 3, 7.9]) st().seek(t); });
    await act(() => { st().select("b"); });
    await act(() => { st().apply((p) => ({ ...p, overlays: [makeOverlay({ id: "o", start: 0, end: 2 })] })); });
    expect(rulerMarks).toHaveBeenCalledTimes(1);
    expect(screen.getAllByTestId("ruler-label")[1]).toBe(first);
    await act(() => { st().setZoom(120); });
    expect(rulerMarks).toHaveBeenCalledTimes(2);
    expect(screen.getAllByTestId("ruler-label").slice(0, 3).map((l) => l.props.children)).toEqual(["0:00", "0:01", "0:02"]);
    await act(() => { st().apply((p) => ({ ...p, clips: p.clips.slice(0, 2) })); });
    expect(rulerMarks).toHaveBeenCalledTimes(3);
    expect(screen.getAllByTestId("ruler-label")).toHaveLength(7);   // 0–6 s, every second
  });
});

describe("the time ruler while the timeline is pinched", () => {
  const PLAIN = { position: "absolute", left: 0, top: 0, width: 0, height: 0 };
  type Pinch = { handlers: Record<"onBegin" | "onStart" | "onUpdate" | "onFinalize", (e?: { scale: number }) => void> };
  const pinch = () => (screen.getByTestId("timeline-root").props.gesture as Pinch).handlers;
  const ruler = () => StyleSheet.flatten(screen.getByTestId("time-ruler").props.style);
  const lefts = () => screen.getAllByTestId("ruler-label").map((l) => StyleSheet.flatten(l.props.style).left as number);

  test("the marks are not built again on every frame: they stretch with the content, and are built again a step away and when the pinch ends", async () => {
    await render(<Timeline />);
    expect(rulerMarks).toHaveBeenCalledTimes(1);
    const first = screen.getAllByTestId("ruler-label")[1], tick = screen.getAllByTestId("ruler-tick")[3];
    await act(() => { pinch().onBegin(); pinch().onStart(); });
    expect(rulerMarks).toHaveBeenCalledTimes(1);
    expect(ruler()).toEqual(PLAIN);
    for (const scale of [1.02, 1.1, 1.2, 1.25, 0.9, 0.8]) {
      await act(() => { pinch().onUpdate({ scale }); });
      expect(st().pixelsPerSecond).toBeCloseTo(50 * scale, 9);
      expect(rulerMarks).toHaveBeenCalledTimes(1);                                         // the same marks …
      expect(screen.getAllByTestId("ruler-label")[1]).toBe(first);
      expect(screen.getAllByTestId("ruler-tick")[3]).toBe(tick);
      expect(lefts()).toEqual([0, 2, 4, 6, 8].map((t) => t * 50 + 3));                     // … where they were built …
      expect(ruler()).toEqual({ ...PLAIN, transform: [{ scaleX: st().pixelsPerSecond / 50 }] });   // … stretched as one, about the ruler's own start (it has no width)
    }
    // More than a step (1.25×) from the zoom they were built at: built again, at the zoom — no stretch left.
    await act(() => { pinch().onUpdate({ scale: 1.3 }); });
    expect(rulerMarks).toHaveBeenCalledTimes(2);
    expect(ruler()).toEqual(PLAIN);
    expect(lefts()).toEqual([0, 2, 4, 6, 8].map((t) => t * 65 + 3));
    await act(() => { pinch().onUpdate({ scale: 1.4 }); });
    expect(rulerMarks).toHaveBeenCalledTimes(2);
    expect(ruler()).toEqual({ ...PLAIN, transform: [{ scaleX: 70 / 65 }] });
    // The pinch ends: built once more, exactly at the zoom it ended on.
    await act(() => { pinch().onFinalize(); });
    expect(rulerMarks).toHaveBeenCalledTimes(3);
    expect(ruler()).toEqual(PLAIN);
    expect(lefts()).toEqual([0, 2, 4, 6, 8].map((t) => t * 70 + 3));
    // No pinch: every change of zoom builds the ruler, as before.
    await act(() => { st().setZoom(72); });
    expect(rulerMarks).toHaveBeenCalledTimes(4);
    expect(ruler()).toEqual(PLAIN);
  });
  test("a touch that never becomes a pinch changes nothing, and a pinch that ends where it began builds nothing", async () => {
    await render(<Timeline />);
    const root = screen.getByTestId("timeline-root"), first = screen.getAllByTestId("ruler-label")[1];
    await act(() => { pinch().onBegin(); pinch().onFinalize(); });
    await act(() => { pinch().onBegin(); pinch().onStart(); pinch().onUpdate({ scale: 1.1 }); pinch().onUpdate({ scale: 1 }); pinch().onFinalize(); });
    expect(rulerMarks).toHaveBeenCalledTimes(1);
    expect(screen.getAllByTestId("ruler-label")[1]).toBe(first);
    expect(screen.getByTestId("timeline-root")).toBe(root);                                // nothing remounted
    expect(ruler()).toEqual(PLAIN);
  });
  test("after a pinch every label stands on its own second at every zoom — on the clips' scale, behind the leading half-screen padding", async () => {
    await render(<Timeline />);
    const pad = Dimensions.get("window").width / 2;
    let from = 50;
    for (const to of [20, 23.7, 33, 48, 61, 119, 120, 163.5, 200]) {
      await act(() => { pinch().onBegin(); pinch().onStart(); });
      // Many small frames, as a finger does.
      for (let i = 1; i <= 12; i++) await act(() => { pinch().onUpdate({ scale: (from + ((to - from) * i) / 12) / from }); });
      await act(() => { pinch().onFinalize(); });
      const pps = st().pixelsPerSecond;
      expect(pps).toBeCloseTo(to, 9);
      expect(ruler()).toEqual(PLAIN);
      const fresh = jest.requireActual("../timelineMarks").rulerMarks(pps, 9) as ReturnType<typeof rulerMarks>;
      const labels = screen.getAllByTestId("ruler-label");
      expect(labels.map((l) => l.props.children)).toEqual(fresh.labels.map((l) => l.text));
      labels.forEach((l, i) => {
        const t = fresh.labels[i].t;
        expect(l.props.children).toBe(`0:0${t}`);                                          // the second it names …
        expect(StyleSheet.flatten(l.props.style).left).toBeCloseTo(t * pps + 3, 9);        // … is where it stands (3 pt after its tick)
      });
      expect(screen.getAllByTestId("ruler-tick").map((t) => StyleSheet.flatten(t.props.style).left)).toEqual(fresh.ticks.map((t) => t.x));
      // The clips' own scale: clip b starts where second 4 is, clip c where second 6 is.
      const a = StyleSheet.flatten(screen.getByRole("button", { name: "Clip a" }).props.style).width, b = StyleSheet.flatten(screen.getByRole("button", { name: "Clip b" }).props.style).width;
      expect(a).toBeCloseTo(4 * pps, 9);
      expect(a + b).toBeCloseTo(6 * pps, 9);
      const four = labels.find((l) => l.props.children === "0:04");
      if (four) expect(StyleSheet.flatten(four.props.style).left - 3).toBeCloseTo(a, 9);
      // The padding is the content's, the ruler starts with the clips inside it: second 0 is half a screen in, under the playhead.
      expect(screen.getByTestId("timeline-scroll").props.contentContainerStyle.paddingHorizontal).toBe(pad);
      expect(within(screen.getByTestId("timeline-clips")).getByTestId("time-ruler")).toBeTruthy();
      expect(StyleSheet.flatten(screen.getByTestId("timeline-playhead").props.style).left).toBe(pad - 1);
      from = to;
    }
  });
});

describe("the markers on the cuts", () => {
  const top = (CLIP_AREA_HEIGHT - CUT.targetHeight) / 2;
  test("a diamond in a dark disc on a cut with a transition, a plus in a slate disc with a track outline on a cut without", async () => {
    await render(<Timeline />);
    expect(screen.getAllByTestId(/^cut-marker-/).map((m) => m.props.testID)).toEqual(["cut-marker-0", "cut-marker-1"]);
    expect(screen.getByTestId("cut-diamond-0")).toHaveStyle({ backgroundColor: theme.colors.accent, transform: [{ rotate: "45deg" }] });
    expect(screen.queryByTestId("cut-add-0")).toBeNull();
    expect(screen.getByTestId("cut-disc-0")).toHaveStyle({ backgroundColor: theme.elevation.page, width: CUT.disc, height: CUT.disc, borderRadius: CUT.disc / 2 });
    expect(drawn(screen.getByTestId("cut-add-1"))).toBe(glyph("add-outline"));
    expect(screen.queryByTestId("cut-diamond-1")).toBeNull();
    expect(screen.getByTestId("cut-disc-1")).toHaveStyle({ backgroundColor: theme.elevation.tile, borderWidth: 1, borderColor: theme.colors.track });
    expect(screen.getByLabelText("Transition after clip 0")).toBeTruthy();
    expect(screen.getByLabelText("Add transition after clip 1")).toBeTruthy();
  });
  test("each is a target 44 pt high centred on its cut, out of the flow, with no hit slop", async () => {
    await render(<Timeline />);
    expect(flat("cut-marker-0")).toMatchObject({ position: "absolute", left: 200 - CUT.targetWidth / 2, top, width: CUT.targetWidth, height: 44 });
    expect(flat("cut-marker-1")).toMatchObject({ position: "absolute", left: 300 - CUT.targetWidth / 2, top, width: CUT.targetWidth, height: 44 });
    expect(top).toBeGreaterThanOrEqual(RULER.height);              // under the ruler
    for (const id of ["cut-marker-0", "cut-marker-1"]) expect(screen.getByTestId(id).props.hitSlop).toBeUndefined();
  });
  test("the plus opens the Transition strip for THAT cut: the clip before it is selected first, so the strip is keyed to it", async () => {
    await render(<Timeline />);
    await fireEvent.press(screen.getByTestId("cut-marker-1"));
    expect(st().selectedClipId).toBe("b");
    expect(useToolStrip.getState().open).toEqual({ id: "transition", key: selectionKey(st()) });
    expect(st().project).toBe(three);                              // opening changes nothing
    expect(st().past).toHaveLength(0);
  });
  test("the diamond opens the same strip for its cut", async () => {
    await render(<Timeline />);
    await act(() => { st().select("c"); });
    await fireEvent.press(screen.getByTestId("cut-marker-0"));
    expect(st().selectedClipId).toBe("a");
    expect(useToolStrip.getState().open).toEqual({ id: "transition", key: selectionKey(st()) });
  });
  test("a handler given by the screen is the one called, with the cut's index", async () => {
    const onCutPress = jest.fn();
    await render(<Timeline onCutPress={onCutPress} />);
    await fireEvent.press(screen.getByTestId("cut-marker-1"));
    expect(onCutPress).toHaveBeenCalledWith(1);
    expect(useToolStrip.getState().open).toBeNull();
  });
  test("at the selected clip's cuts the marker stands beside the trim handle, never on it", async () => {
    await render(<Timeline renderStripExtras={(id) => (id === st().selectedClipId ? <TrimHandles clip={st().project!.clips.find((c) => c.id === id)!} /> : null)} />);
    await act(() => { st().select("b"); });
    // b runs 200–300. Its handles are the 16 pt inside each edge; the markers' targets lie wholly outside the clip.
    const handle = StyleSheet.flatten(screen.getByLabelText("Trim start handle").props.style);
    expect(handle.width).toBe(16);
    const before = flat("cut-marker-0"), after = flat("cut-marker-1");
    expect(before.left + before.width).toBeLessThanOrEqual(200 - 2);
    expect(after.left).toBeGreaterThanOrEqual(300 + 2);
    expect(before.width).toBe(CUT.shiftedWidth);
    // The marker did not remount to move: a style only.
    const marker = screen.getByTestId("cut-marker-1");
    await act(() => { st().select(null); });
    expect(screen.getByTestId("cut-marker-1")).toBe(marker);
    expect(flat("cut-marker-1").left).toBe(300 - CUT.targetWidth / 2);
  });
  test("the target is 24 pt wide: a tap 12 pt or more from a cut is the clip's own, and each clip's press still selects that clip", async () => {
    await render(<Timeline />);
    expect(flat("cut-marker-0").width).toBe(24);
    expect(flat("cut-marker-1").width).toBe(24);
    // b runs 200–300: the markers take 200–212 and 288–300 of it; 76 pt stay b's.
    expect(flat("cut-marker-0").left + 24).toBe(212);
    expect(flat("cut-marker-1").left).toBe(288);
    await fireEvent.press(screen.getByRole("button", { name: "Clip b" }));
    expect(st().selectedClipId).toBe("b");
    expect(useToolStrip.getState().open).toBeNull();
  });
  test("no marker on a cut beside a clip under 68 pt, and none in multi-select", async () => {
    await render(<Timeline />);
    await act(() => { st().setZoom(33); });                         // b is 66 pt wide
    expect(screen.queryAllByTestId(/^cut-marker-/)).toHaveLength(0);
    await act(() => { st().setZoom(34); });
    expect(screen.queryAllByTestId(/^cut-marker-/)).toHaveLength(2);
    // The clip between them keeps 44 pt of its own.
    expect(flat("cut-marker-1").left - (flat("cut-marker-0").left + flat("cut-marker-0").width)).toBe(44);
    await act(() => { st().enterMultiSelect(); });
    expect(screen.queryAllByTestId(/^cut-marker-/)).toHaveLength(0);
  });
  test("markers add nothing to the scroll: out of the flow, same handlers", async () => {
    await render(<Timeline />);
    const scroll = screen.getByTestId("timeline-scroll");
    expect(Object.keys(scroll.props).filter((k) => /^on.*Scroll|^onScroll/.test(k)).sort()).toEqual(["onMomentumScrollBegin", "onMomentumScrollEnd", "onScroll", "onScrollBeginDrag", "onScrollEndDrag"]);
    expect(scroll.props.contentContainerStyle).toEqual({ paddingHorizontal: Dimensions.get("window").width / 2, height: CLIP_AREA_HEIGHT, flexDirection: "column" });
  });
});

describe("the trim handles as drawn", () => {
  test("16 pt of gold with a dark grip line that takes no touches; the gesture's host and its hit slop are what they were", async () => {
    const clip = three.clips[0];
    await render(<TrimHandles clip={clip} />);
    for (const edge of ["start", "end"] as const) {
      const handle = screen.getByLabelText(`Trim ${edge} handle`);
      expect(handle).toHaveStyle({ width: 16, height: STRIP_HEIGHT + 4, top: -2, backgroundColor: theme.colors.accent, position: "absolute" });
      expect(handle.props.hitSlop).toEqual({ left: 12, right: 12, top: 12, bottom: 12 });
      expect(handle.props.gesture).toBeDefined();
      const grip = within(handle).getByTestId(`trim-grip-${edge}`);
      expect(grip.props.pointerEvents).toBe("none");
      expect(grip).toHaveStyle({ backgroundColor: theme.colors.onAccent });
    }
    expect(screen.getByLabelText("Trim start handle")).toHaveStyle({ left: -2 });
    expect(screen.getByLabelText("Trim end handle")).toHaveStyle({ right: -2 });
  });
});

describe("the glyph on every bar", () => {
  const glyphOf = (id: string) => screen.getByTestId(`bar-glyph-${id}`);
  const shows = (id: string, kind: BarKind) => {
    expect(drawn(glyphOf(id))).toBe(glyph(BAR_GLYPH[kind]));
    expect(glyphOf(id)).toHaveStyle({ color: theme.colors.onKind, fontSize: BAR.glyph });
  };
  const caption = { ...makeOverlay({ id: "cap", text: "Said", start: 0, end: 4 }), kind: "caption" } as Overlay;
  test("text, caption and sticker: three different symbols before today's words", async () => {
    await render(<>
      <OverlayPill overlay={makeOverlay({ id: "txt", text: "Hello", start: 0, end: 4 })} selected={false} onPress={() => {}} />
      <OverlayPill overlay={caption} selected={false} onPress={() => {}} />
      <OverlayPill overlay={makeSticker({ id: "stk", start: 0, end: 4 })} selected={false} onPress={() => {}} />
    </>);
    shows("txt", "text"); shows("cap", "caption"); shows("stk", "sticker");
    expect(screen.getByText("Hello")).toHaveStyle({ color: theme.colors.onKind });
    expect(screen.getByText("Said")).toBeTruthy();
    expect(screen.getByText("⭐")).toBeTruthy();
    // The glyph comes before the label.
    const kids = within(screen.getByTestId("overlay-pill-txt")).getAllByText(/./);
    expect(kids[0].props.testID).toBe("bar-glyph-txt");
  });
  test("music, voice and sound effect: a note, a microphone, a speaker, then the volume and the title as before", async () => {
    await render(<>
      {(["music", "voice", "sfx"] as const).map((kind) => <AudioBar key={kind} track={makeAudioTrack({ id: kind, kind, title: `T ${kind}`, sourceDuration: 4 })} missing={false} selected={false} onPress={() => {}} />)}
    </>);
    shows("music", "music"); shows("voice", "voice"); shows("sfx", "sfx");
    for (const kind of ["music", "voice", "sfx"]) {
      expect(within(screen.getByTestId(`audio-bar-${kind}`)).getByText("100%")).toBeTruthy();
      expect(screen.getByText(`T ${kind}`)).toBeTruthy();
    }
  });
  test("a layer and a timeline effect", async () => {
    await render(<>
      <LayerBar layer={makeLayer({ id: "lay", sourceDuration: 4 })} selected={false} onPress={() => {}} />
      <EffectPill effect={makeEffect({ id: "fx", type: "glitch", start: 0, end: 4 })} selected={false} onPress={() => {}} />
    </>);
    shows("lay", "layer"); shows("fx", "effect");
    expect(screen.getByText("Layer")).toBeTruthy();
    expect(screen.getByText("Glitch")).toBeTruthy();
  });
  test("a narrow bar leaves its label out first, then its glyph — on every kind of bar", async () => {
    // Zoom 50: 1.3 s = 65 pt (glyph only), 0.8 s = 40 pt (neither); 1.32 s = 66 pt (both).
    const sizes = [{ len: 1.32, icon: true, label: true }, { len: 1.3, icon: true, label: false }, { len: 0.8, icon: false, label: false }];
    for (const { len, icon, label } of sizes) {
      const view = await render(<>
        <OverlayPill overlay={makeOverlay({ id: "txt", text: "Hello", start: 0, end: len })} selected={false} onPress={() => {}} />
        <AudioBar track={makeAudioTrack({ id: "mus", title: "Song", sourceDuration: 9, trimStart: 0, trimEnd: len })} missing={false} selected={false} onPress={() => {}} />
        <LayerBar layer={makeLayer({ id: "lay", sourceDuration: 9, trimStart: 0, trimEnd: len })} selected={false} onPress={() => {}} />
        <EffectPill effect={makeEffect({ id: "fx", type: "glitch", start: 0, end: len })} selected={false} onPress={() => {}} />
      </>);
      for (const id of ["txt", "mus", "lay", "fx"]) expect(screen.queryAllByTestId(`bar-glyph-${id}`)).toHaveLength(icon ? 1 : 0);
      for (const words of ["Hello", "Song", "100%", "Layer", "Glitch"]) expect(screen.queryAllByText(words)).toHaveLength(label ? 1 : 0);
      await view.unmount();
    }
  });
  test("a selected bar keeps its white border and white handles; the handles carry a dark grip that takes no touches", async () => {
    await render(<OverlayPill overlay={makeOverlay({ id: "txt", text: "Hello", start: 0, end: 4 })} selected onPress={() => {}} />);
    expect(screen.getByTestId("overlay-pill-txt")).toHaveStyle({ borderColor: theme.colors.text, borderWidth: 2, height: LANE_HEIGHT });
    for (const name of ["Text start handle", "Text end handle"]) {
      const handle = screen.getByLabelText(name);
      expect(handle).toHaveStyle({ backgroundColor: theme.colors.text, width: 12 });
      expect(handle.props.gesture).toBeDefined();
      const grip = within(handle).getByTestId("bar-grip");
      expect(grip.props.pointerEvents).toBe("none");
      expect(grip).toHaveStyle({ backgroundColor: theme.colors.onKind });
    }
    expect(LANE_HEIGHT + LANE_GAP).toBe(32);                        // the rows are as high as they were
  });
});
