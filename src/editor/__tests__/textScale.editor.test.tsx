import { render, screen } from "@testing-library/react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-12T10:00:00.000Z" }));
import { makeClip, makeOverlay, makeProject, makeSticker } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { theme } from "@/src/theme/theme";
import { textSize, texts, unruled } from "@/src/ui/testing/textSize";
import { ToneContext } from "@/src/ui/tone";
import { OverlayText } from "../components/OverlayText";
import { StickerView } from "../components/StickerView";
import { TransportRow } from "../components/TransportRow";

const AX5 = 3.571, E = theme.textScale.editor;
const editor = (ui: React.ReactElement) => <ToneContext.Provider value="editor">{ui}</ToneContext.Provider>;
const caption = makeOverlay({ id: "t", kind: "caption", text: "Hello there", fontScale: 0.1, color: "#FFFFFF", outline: true, start: 0, end: 5,
  words: [{ text: "Hello", start: 0, end: 1 }, { text: "there", start: 1, end: 2 }], highlightColor: "#FFFF00" });
afterEach(() => textSize(1));

test("text on the video never follows the phone: the fill, and every karaoke span inside it, is fixed", async () => {
  await textSize(AX5);
  await render(editor(<OverlayText overlay={caption} frameW={200} frameH={400} time={0.5} />));
  const all = texts();
  expect(all.length).toBeGreaterThanOrEqual(3);                                 // the fill and its two spans
  for (const t of all) {
    expect(t.props.allowFontScaling).toBe(false);
    expect(t.props.maxFontSizeMultiplier).toBeUndefined();
  }
  expect(screen.getByText("Hello").props.allowFontScaling).toBe(false);         // a span is told too: a nested text would scale by itself
});

test("the unseen copy that sizes the selection frame is fixed as well, so the frame matches the text", async () => {
  await textSize(AX5);
  await render(editor(<OverlayText overlay={makeOverlay({ id: "p", text: "Plain", fontScale: 0.1, start: 0, end: 5 })} frameW={200} frameH={400} frameOnly />));
  for (const t of texts()) expect(t.props.allowFontScaling).toBe(false);
});

test("an emoji sticker on the video is fixed", async () => {
  await textSize(AX5);
  await render(editor(<StickerView sticker={makeSticker({ id: "s", emoji: "🔥", x: 0.5, y: 0.5, scale: 2 })} frameW={200} frameH={400} />));
  expect(texts().length).toBeGreaterThanOrEqual(1);
  for (const t of texts()) expect(t.props.allowFontScaling).toBe(false);
  expect(screen.getByText("🔥")).toHaveStyle({ fontSize: 96 });                 // its size is still the frame's, to the point
});

test("the play row is the editor's chrome: capped at 1.16 at any phone size, the time's own span included, nothing unruled", async () => {
  useEditorStore.getState().reset();
  useEditorStore.getState().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 21 })] }));
  await textSize(AX5);
  await render(editor(<TransportRow />));
  expect(unruled()).toEqual([]);
  expect(screen.getByText("0:00 / 0:21").props.maxFontSizeMultiplier).toBe(E);
  expect(screen.getByText("0:00").props.maxFontSizeMultiplier).toBe(E);
  expect(screen.getByText("9:16").props).toMatchObject({ maxFontSizeMultiplier: E, numberOfLines: 1, adjustsFontSizeToFit: true });
  for (const name of ["Undo", "Redo", "Play", "Aspect ratio"]) {
    expect(screen.getByRole("button", { name }).props).toMatchObject({ accessibilityShowsLargeContentViewer: true, accessibilityLargeContentTitle: name });
  }
});
