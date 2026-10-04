import { act, fireEvent, render, screen, within } from "@testing-library/react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
jest.mock("@react-native-community/slider", () => { const { View } = require("react-native"); return ({ testID, onSlidingStart, onValueChange, onSlidingComplete }: { testID?: string; onSlidingStart?: () => void; onValueChange?: (v: number) => void; onSlidingComplete?: (v: number) => void }) => <View testID={testID} onTouchStart={() => onSlidingStart?.()} onTouchMove={(v: number) => onValueChange?.(v)} onTouchEnd={(v: number) => onSlidingComplete?.(v)} />; });
import { CAPTION_STYLE } from "@/src/editor/effects";
import { FONTS } from "@/src/editor/fonts";
import { DEFAULT_SHADOW, makeClip, makeOverlay, makeProject, type TextOverlay } from "@/src/editor/model/types";
import { CAPTION_PRESETS, DEFAULT_HIGHLIGHT_COLOR } from "@/src/editor/textTemplates";
import { useEditorStore } from "@/src/editor/store";
import { CaptionStyleSheet } from "../components/CaptionStyleSheet";

const cap = (id: string, start: number) => makeOverlay({ id, kind: "caption", ...CAPTION_STYLE, start, end: start + 1 });
beforeEach(() => {
  useEditorStore.getState().reset();
  useEditorStore.getState().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 5 })], overlays: [cap("c1", 0), cap("c2", 2)] }));
});
const captions = () => useEditorStore.getState().project!.overlays as TextOverlay[];

async function drag(testID: string, values: number[]) {
  const slider = screen.getByTestId(testID);
  await fireEvent(slider, "touchStart");
  for (const v of values) await fireEvent(slider, "touchMove", v);
  await fireEvent(slider, "touchEnd", values[values.length - 1]);
}

test("a size-slider drag restyles every caption as ONE undo step", async () => {
  await render(<CaptionStyleSheet visible onClose={() => {}} />);
  await drag("caption-size-slider", [0.05, 0.06, 0.07, 0.08]);
  expect(captions().map((o) => o.fontScale)).toEqual([0.08, 0.08]);
  expect(useEditorStore.getState().past).toHaveLength(1);
  await act(() => { useEditorStore.getState().undo(); });
  expect(captions().map((o) => o.fontScale)).toEqual([CAPTION_STYLE.fontScale, CAPTION_STYLE.fontScale]);
});

test("a background-opacity drag is ONE undo step", async () => {
  await render(<CaptionStyleSheet visible onClose={() => {}} />);
  await drag("caption-opacity-slider", [0.3, 0.5, 0.9]);
  expect(captions().map((o) => o.background)).toEqual([{ color: "#000000", opacity: 0.9 }, { color: "#000000", opacity: 0.9 }]);
  expect(useEditorStore.getState().past).toHaveLength(1);
});

describe("presets, sample, highlight and the style section", () => {
  const WORDS = ["This", "is", "how", "captions", "look"];
  const show = () => render(<CaptionStyleSheet visible onClose={() => {}} />);
  const past = () => useEditorStore.getState().past.length;

  test("a preset restyles every caption as ONE undo step", async () => {
    await show();
    await fireEvent.press(screen.getByRole("button", { name: "Karaoke" }));
    const k = CAPTION_PRESETS.karaoke.patch;
    for (const c of captions()) expect(c).toMatchObject({ fontId: k.fontId, fontScale: k.fontScale, color: k.color, background: null, outline: true, style: k.style, highlightColor: k.highlightColor });
    expect(captions().map((c) => c.start)).toEqual([0, 2]);
    expect(past()).toBe(1);
    await act(() => { useEditorStore.getState().undo(); });
    expect(captions().map((c) => c.highlightColor)).toEqual([null, null]);
  });

  test("the sample shows the caption text with the current style", async () => {
    await show();
    expect(screen.getByText("This is how captions look")).toHaveStyle({ color: CAPTION_STYLE.color, fontFamily: FONTS[CAPTION_STYLE.fontId].family });
    expect(screen.queryByText("Add captions to style them")).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Neon glow" }));
    const n = CAPTION_PRESETS.neonGlow.patch;
    expect(screen.getByText("This is how captions look")).toHaveStyle({ color: n.color, fontFamily: FONTS[n.fontId].family });
    expect(screen.getByTestId("overlay-glow-caption-sample", { includeHiddenElements: true })).toHaveStyle({ color: n.style.glow!.color });
  });

  test("the highlight switch colours the sample's second word; one undo step; then a colour", async () => {
    await show();
    await fireEvent(screen.getByLabelText("Highlight spoken word"), "valueChange", true);
    expect(captions().map((c) => c.highlightColor)).toEqual([DEFAULT_HIGHLIGHT_COLOR, DEFAULT_HIGHLIGHT_COLOR]);
    expect(past()).toBe(1);
    const sample = within(screen.getByTestId("caption-sample"));
    expect(sample.getByText("is")).toHaveStyle({ color: DEFAULT_HIGHLIGHT_COLOR });
    for (const w of WORDS.filter((w) => w !== "is")) expect(sample.getByText(w)).not.toHaveStyle({ color: DEFAULT_HIGHLIGHT_COLOR });
    await fireEvent.press(within(screen.getByTestId("caption-highlight-color")).getByLabelText("Color #00E5A0"));
    expect(captions().map((c) => c.highlightColor)).toEqual(["#00E5A0", "#00E5A0"]);
    expect(sample.getByText("is")).toHaveStyle({ color: "#00E5A0" });
    expect(past()).toBe(2);
    await fireEvent(screen.getByLabelText("Highlight spoken word"), "valueChange", false);
    expect(captions().map((c) => c.highlightColor)).toEqual([null, null]);
    expect(screen.queryByTestId("caption-highlight-color")).toBeNull();
    expect(past()).toBe(3);
  });

  test("the style section writes every caption: a switch and a drag, one undo step each", async () => {
    await show();
    expect(screen.queryByTestId("style-opacity-slider")).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Style" }));
    await fireEvent(screen.getByLabelText("Shadow"), "valueChange", true);
    expect(captions().map((c) => c.style.shadow)).toEqual([DEFAULT_SHADOW, DEFAULT_SHADOW]);
    expect(past()).toBe(1);
    await drag("style-letter-spacing-slider", [0.05, 0.1, 0.2]);
    expect(captions().map((c) => c.style.letterSpacing)).toEqual([0.2, 0.2]);
    expect(past()).toBe(2);
    expect(screen.getByTestId("overlay-shadow-caption-sample", { includeHiddenElements: true })).toBeTruthy();
  });

  test("captions keep their words when restyled", async () => {
    const words = [{ text: "Your", start: 0, end: 0.5 }, { text: "text", start: 0.5, end: 1 }];
    useEditorStore.getState().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 5 })], overlays: [{ ...cap("c1", 0), words }] }));
    await show();
    await fireEvent.press(screen.getByRole("button", { name: "Yellow pop" }));
    expect(captions()[0].words).toEqual(words);
  });

  test("with no captions: a note, the default look on the sample, and nothing is written", async () => {
    useEditorStore.getState().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 5 })], overlays: [makeOverlay({ id: "t" })] }));
    await show();
    expect(screen.getByText("Add captions to style them")).toBeTruthy();
    expect(screen.getByText("This is how captions look")).toHaveStyle({ color: CAPTION_STYLE.color });
    await fireEvent.press(screen.getByRole("button", { name: "Karaoke" }));
    await fireEvent(screen.getByLabelText("Highlight spoken word"), "valueChange", true);
    expect(past()).toBe(0);
    expect(captions()).toEqual([makeOverlay({ id: "t" })]);
  });

  test("one vertical scroll without scroll handlers", async () => {
    await show();
    const scroll = screen.getByTestId("caption-style-scroll");
    expect(scroll.props.horizontal).toBeFalsy();
    expect(Object.keys(scroll.props).filter((k) => /^on.*Scroll/.test(k))).toEqual([]);
  });
});
