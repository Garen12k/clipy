import { act, fireEvent, render, screen, within } from "@testing-library/react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
jest.mock("@react-native-community/slider", () => { const { View } = require("react-native"); return ({ testID, onSlidingStart, onValueChange, onSlidingComplete }: { testID?: string; onSlidingStart?: () => void; onValueChange?: (v: number) => void; onSlidingComplete?: (v: number) => void }) => <View testID={testID} onTouchStart={() => onSlidingStart?.()} onTouchMove={(v: number) => onValueChange?.(v)} onTouchEnd={(v: number) => onSlidingComplete?.(v)} />; });
import { DEFAULT_GLOW, DEFAULT_SHADOW, DEFAULT_TEXT_STYLE, isTextOverlay, makeClip, makeOverlay, makeProject, type TextOverlay } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { TEXT_TEMPLATES } from "@/src/editor/textTemplates";
import { TextPanel } from "../components/TextPanel";

const p = makeProject({ clips: [makeClip({ id: "a", sourceDuration: 10 })], overlays: [makeOverlay({ id: "o1", text: "Hi", start: 1, end: 4, x: 0.3, rotation: 12 })] });
beforeEach(() => { useEditorStore.getState().reset(); useEditorStore.getState().setProject(p); });
const ov = (): TextOverlay => {
  const o = useEditorStore.getState().project!.overlays.find((o) => o.id === "o1")!;
  if (!isTextOverlay(o)) throw new Error("expected a text overlay");
  return o;
};
const past = () => useEditorStore.getState().past.length;
const open = async () => { await render(<TextPanel overlayId="o1" visible onClose={() => {}} />); for (const b of screen.getAllByRole("button", { name: / options$|^Spacing and opacity$/ })) await fireEvent.press(b); };
async function drag(testID: string, values: number[]) {
  const slider = screen.getByTestId(testID);
  await fireEvent(slider, "touchStart");
  for (const v of values) await fireEvent(slider, "touchMove", v);
  await fireEvent(slider, "touchEnd", values[values.length - 1]);
}

test("the style rows are closed until asked for", async () => {
  await render(<TextPanel overlayId="o1" visible onClose={() => {}} />);
  expect(screen.queryByTestId("style-opacity-slider")).toBeNull();
  await fireEvent.press(screen.getByRole("button", { name: "Spacing and opacity" }));
  expect(screen.getByTestId("style-opacity-slider")).toBeTruthy();
});

test("a template tile restyles the text in ONE undo step and keeps its text and placement", async () => {
  await render(<TextPanel overlayId="o1" visible onClose={() => {}} />);
  await fireEvent.press(screen.getByRole("button", { name: "Neon" }));
  const t = TEXT_TEMPLATES.neon.patch;
  expect(ov()).toMatchObject({ fontId: t.fontId, color: t.color, outline: t.outline, style: t.style, text: "Hi", x: 0.3, rotation: 12, start: 1, end: 4 });
  expect(past()).toBe(1);
  await act(() => { useEditorStore.getState().undo(); });
  expect(ov()).toMatchObject({ fontId: "bangers", style: DEFAULT_TEXT_STYLE });
});

test("a caption has no template strip (templates are for texts)", async () => {
  useEditorStore.getState().setProject({ ...p, overlays: [makeOverlay({ id: "o1", kind: "caption", text: "Cap", start: 1, end: 4 })] });
  await render(<TextPanel overlayId="o1" visible onClose={() => {}} />);
  expect(screen.queryByTestId("template-strip")).toBeNull();
  expect(screen.getByRole("button", { name: "Spacing and opacity" })).toBeTruthy();
});

test.each([
  ["style-opacity-slider", [0.9, 0.5], { opacity: 0.5 }],
  ["style-letter-spacing-slider", [0.05, 0.1], { letterSpacing: 0.1 }],
  ["style-line-spacing-slider", [1.2, 1.5], { lineSpacing: 1.5 }],
  ["style-outline-width-slider", [1.5, 2.5], { outlineWidth: 2.5 }],
] as const)("a %s drag is ONE undo step", async (testID, values, want) => {
  await open();
  await drag(testID, [...values]);
  expect(ov().style).toEqual({ ...DEFAULT_TEXT_STYLE, ...want });
  expect(past()).toBe(1);
  await act(() => { useEditorStore.getState().undo(); });
  expect(ov().style).toEqual(DEFAULT_TEXT_STYLE);
});

test("outline colour, then Auto: one undo step each", async () => {
  await open();
  await fireEvent.press(within(screen.getByTestId("style-outline-color")).getByLabelText("Color #C8102E"));
  expect(ov().style.outlineColor).toBe("#C8102E");
  expect(past()).toBe(1);
  await fireEvent.press(screen.getByRole("button", { name: "Auto" }));
  expect(ov().style.outlineColor).toBeNull();
  expect(past()).toBe(2);
});

test("the outline controls follow the Outline switch", async () => {
  await open();
  await fireEvent(screen.getByLabelText("Outline"), "valueChange", false);
  expect(screen.queryByTestId("style-outline-width-slider")).toBeNull();
});

test("shadow: switch, colour and a drag, one undo step each", async () => {
  await open();
  await fireEvent(screen.getByLabelText("Shadow"), "valueChange", true);
  expect(ov().style.shadow).toEqual(DEFAULT_SHADOW);
  expect(past()).toBe(1);
  await fireEvent.press(within(screen.getByTestId("style-shadow-color")).getByLabelText("Color #2E86AB"));
  expect(ov().style.shadow).toEqual({ ...DEFAULT_SHADOW, color: "#2E86AB" });
  expect(past()).toBe(2);
  await drag("style-shadow-blur-slider", [0.2, 0.3, 0.4]);
  expect(ov().style.shadow).toEqual({ ...DEFAULT_SHADOW, color: "#2E86AB", blur: 0.4 });
  expect(past()).toBe(3);
  await fireEvent(screen.getByLabelText("Shadow"), "valueChange", false);
  expect(ov().style.shadow).toBeNull();
  expect(past()).toBe(4);
});

test("glow: switch and a size drag, one undo step each", async () => {
  await open();
  await fireEvent(screen.getByLabelText("Glow"), "valueChange", true);
  expect(ov().style.glow).toEqual(DEFAULT_GLOW);
  await drag("style-glow-size-slider", [0.3, 0.5]);
  expect(ov().style.glow).toEqual({ ...DEFAULT_GLOW, size: 0.5 });
  expect(past()).toBe(2);
});

test("the panel stays one vertical scroll without scroll handlers", async () => {
  await open();
  const scroll = screen.getByTestId("text-panel-scroll");
  expect(scroll.props.horizontal).toBeFalsy();
  expect(Object.keys(scroll.props).filter((k) => /^on.*Scroll/.test(k))).toEqual([]);
});
