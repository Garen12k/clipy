import { act, fireEvent, render, screen } from "@testing-library/react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
jest.mock("@react-native-community/slider", () => { const { View } = require("react-native"); return ({ testID, onSlidingStart, onValueChange, onSlidingComplete }: { testID?: string; onSlidingStart?: () => void; onValueChange?: (v: number) => void; onSlidingComplete?: (v: number) => void }) => <View testID={testID} onTouchStart={() => onSlidingStart?.()} onTouchMove={(v: number) => onValueChange?.(v)} onTouchEnd={(v: number) => onSlidingComplete?.(v)} />; });
import { CAPTION_STYLE } from "@/src/editor/effects";
import { makeClip, makeOverlay, makeProject, type TextOverlay } from "@/src/editor/model/types";
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
