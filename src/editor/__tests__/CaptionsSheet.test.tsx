import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { Linking, StyleSheet } from "react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
let mockNative = false;
jest.mock("@/modules/clipy-video", () => ({ isNativeAvailable: () => mockNative, transcribe: jest.fn(), cancelTranscribe: jest.fn() }));
import { cancelTranscribe, transcribe } from "@/modules/clipy-video";
import { makeClip, makeOverlay, makeProject } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
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

test("offers Style captions next to Replace when captions already exist", async () => {
  mockNative = true; load(true);
  await render(<CaptionsSheet visible onClose={() => {}} />);
  expect(screen.getByText("Replace")).toBeTruthy();
  // The three actions are stacked (no horizontal row), so none can be pushed off a 327 pt sheet.
  for (const name of ["Replace", "Style captions", "Cancel"]) {
    const parentStyle = StyleSheet.flatten(screen.getByRole("button", { name }).parent?.props.style) ?? {};
    expect(parentStyle.flexDirection).not.toBe("row");
  }
  await fireEvent.press(screen.getByText("Style captions"));
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
  await fireEvent.press(screen.getAllByLabelText("Close sheet")[0]);
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
  expect(screen.queryByText("Try again")).toBeNull();
  await fireEvent.press(screen.getByText("Open Settings"));
  expect(open).toHaveBeenCalledTimes(1);
});
