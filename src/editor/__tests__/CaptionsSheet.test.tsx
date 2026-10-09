import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { Linking, StyleSheet } from "react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
let mockNative = false;
jest.mock("@/modules/clipy-video", () => ({ isNativeAvailable: () => mockNative, transcribe: jest.fn(), cancelTranscribe: jest.fn() }));
import { cancelTranscribe, transcribe } from "@/modules/clipy-video";
import { makeClip, makeOverlay, makeProject } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { theme } from "@/src/theme/theme";
import { PANEL } from "@/src/ui/ToolPanel";
import { SPEECH_DENIED_MESSAGE } from "@/src/editor/useCaptions";
import { CaptionsSheet } from "../components/CaptionsSheet";

function load(withCaptions: boolean) {
  useEditorStore.getState().reset();
  useEditorStore.getState().setProject(makeProject({
    clips: [makeClip({ id: "a", sourceDuration: 2 })],
    overlays: withCaptions ? [makeOverlay({ id: "c1", kind: "caption", start: 0, end: 1 })] : [],
  }));
}
beforeEach(() => { jest.clearAllMocks(); mockNative = false; });

test("shows the fallback card in Expo Go", async () => {
  load(false);
  await render(<CaptionsSheet visible onClose={() => {}} />);
  expect(screen.getByText("Captions need the native build")).toBeTruthy();
});

test("Expo Go: the caption style sheet can still be opened from the fallback card", async () => {
  load(false);
  await render(<CaptionsSheet visible onClose={() => {}} />);
  expect(screen.queryByText("Caption style")).toBeNull();
  await fireEvent.press(screen.getByRole("button", { name: "Style Captions" }));
  expect(screen.getByText("Caption style")).toBeTruthy();
  expect(screen.getByText("This is how captions look")).toBeTruthy();
});

test("offers Style captions next to Replace when captions already exist", async () => {
  mockNative = true; load(true);
  await render(<CaptionsSheet visible onClose={() => {}} />);
  expect(screen.getByText("Replace")).toBeTruthy();
  // The three actions are stacked (no horizontal row), so none can be pushed off a 327 pt sheet.
  for (const name of ["Replace", "Style Captions", "Cancel"]) {
    const parentStyle = StyleSheet.flatten(screen.getByRole("button", { name }).parent?.props.style) ?? {};
    expect(parentStyle.flexDirection).not.toBe("row");
  }
  // One main button on the card: Replace. Style captions is the grey button, Cancel is text only.
  expect(screen.getAllByTestId("primary-button")).toHaveLength(1);
  expect(screen.getByText("Cancel")).toHaveStyle({ color: theme.colors.accent });
  // All three are the same height (compact), and the card fits the compact panel's body without scrolling:
  // 239 − 44 (header) − 2 × 12 (the body's padding) = 171 ≥ one line of text (18) + 3 × 12 (gaps) + 3 × 36 = 162.
  for (const name of ["Replace", "Style Captions", "Cancel"]) expect(screen.getByRole("button", { name })).toHaveStyle({ height: theme.size.controlCompact });
  expect(18 + 3 * theme.space.md + 3 * theme.size.controlCompact).toBeLessThanOrEqual(PANEL.compact - 1 - PANEL.header - 2 * theme.space.md);
  await fireEvent.press(screen.getByText("Style Captions"));
  expect(screen.getByText("Caption style")).toBeTruthy();
});

test("closing the sheet mid-run cancels the transcription", async () => {
  mockNative = true; load(false);
  let finish!: () => void;
  jest.mocked(transcribe).mockImplementation(() => new Promise((res) => { finish = () => res([{ text: "late", start: 0, end: 1 }]); }));
  const onClose = jest.fn();
  await render(<CaptionsSheet visible onClose={onClose} />);
  // fireEvent resolves with the handler's return value (run's promise), so don't await it while the run is pending.
  const pressed = fireEvent.press(screen.getByText("Transcribe"));
  await new Promise((r) => setImmediate(r));   // let fireEvent's own act() settle; plain wait avoids overlapping act scopes
  expect(screen.getByText(/Transcribing clip 1 of 1/)).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: "Done" }));
  expect(cancelTranscribe).toHaveBeenCalledTimes(1);
  expect(onClose).toHaveBeenCalledTimes(1);
  await act(async () => { finish(); await pressed; });
  expect(useEditorStore.getState().project!.overlays).toEqual([]);   // the cancelled run applied nothing
});

test("permission denied explains and links to Settings", async () => {
  mockNative = true; load(false);
  jest.mocked(transcribe).mockRejectedValue(Object.assign(new Error("Speech recognition permission denied"), { code: "E_SPEECH_DENIED" }));
  const open = jest.spyOn(Linking, "openSettings").mockResolvedValue(undefined);
  await render(<CaptionsSheet visible onClose={() => {}} />);
  await fireEvent.press(screen.getByText("Transcribe"));   // run rejects at once, so this settles
  expect(screen.getByText(SPEECH_DENIED_MESSAGE)).toBeTruthy();
  expect(screen.queryByText("Try Again")).toBeNull();
  await fireEvent.press(screen.getByText("Open Settings"));
  expect(open).toHaveBeenCalledTimes(1);
});

test("the Replace card leaves room under Cancel for its hit slop, and still fits the compact body", async () => {
  mockNative = true; load(true);
  await render(<CaptionsSheet visible onClose={() => {}} />);
  const card = StyleSheet.flatten(screen.getByRole("button", { name: "Cancel" }).parent?.props.style);
  expect(card.paddingBottom).toBe(theme.space.xs);
  // 162 + 4 = 166 <= 171.
  expect(18 + 3 * theme.space.md + 3 * theme.size.controlCompact + theme.space.xs).toBeLessThanOrEqual(PANEL.compact - 1 - PANEL.header - 2 * theme.space.md);
});
