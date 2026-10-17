import { act, fireEvent, render, screen } from "@testing-library/react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-17T10:00:00.000Z" }));
let mockEnglish = true;
jest.mock("@/src/editor/captionLanguage", () => ({ fillersSpoken: () => mockEnglish }));
jest.mock("@/modules/clipy-video", () => ({ isNativeAvailable: () => true, transcribe: jest.fn(), cancelTranscribe: jest.fn() }));
// The row's latest onRemove, so a test can hold an OLD handler (the kit's host button carries no onPress to read back).
let mockRemove: (() => void) | null = null;
jest.mock("../components/FillerWordsRow", () => {
  const actual = jest.requireActual("../components/FillerWordsRow");
  return { ...actual, FillerWordsRow: (props: { onRemove: () => void }) => { mockRemove = props.onRemove; return actual.FillerWordsRow(props); } };
});
import { makeClip, makeOverlay, makePhotoClip, makeProject, type CaptionWord, type Clip, type TextOverlay } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { theme } from "@/src/theme/theme";
import { useToast } from "@/src/ui/Toast";
import { CaptionsSheet } from "../components/CaptionsSheet";
import { FILLER_CHANGED, FILLER_WORDS } from "../components/FillerWordsRow";

const st = () => useEditorStore.getState();
const W = (text: string, start: number, end: number): CaptionWord => ({ text, start, end });
const cap = (words: CaptionWord[], id = "c", start = 1, end = 4): TextOverlay => makeOverlay({ id, kind: "caption", start, end, text: words.map((w) => w.text).join(" "), words });
const SENTENCE = [W("so", 0, 0.3), W("um", 0.5, 0.8), W("we", 1, 1.3), W("uh", 1.4, 1.6), W("go", 2, 2.4)];
const load = (overlays: TextOverlay[], clips: Clip[] = [makeClip({ id: "a", sourceDuration: 10 })]) => {
  st().reset(); st().setProject(makeProject({ clips, overlays }));
};
const onClose = jest.fn();
const open = async () => { await render(<CaptionsSheet visible onClose={onClose} />); };
beforeEach(() => { jest.clearAllMocks(); mockEnglish = true; useToast.getState().clear(); });

test("the drawing: first in the body, the count, the note, the white button — and Replace turns grey so one white button is in view", async () => {
  load([cap(SENTENCE)]); await open();
  expect(screen.getByTestId("filler-words")).toBeTruthy();
  for (const t of [FILLER_WORDS.title, "2 found", FILLER_WORDS.note]) expect(screen.getByText(t)).toBeTruthy();
  expect(screen.getAllByTestId("main-button")).toHaveLength(1);
  expect(screen.getByTestId("main-button")).toHaveAccessibleName("Remove 2 Filler Words");
  expect(screen.getByRole("button", { name: "Replace" })).not.toHaveStyle({ backgroundColor: theme.plain.fill });
});

test("Remove: one step for the clip and the caption, the panel closes, then the message with Undo; Undo brings both back", async () => {
  load([cap(SENTENCE)]); await open();
  const before = st().project!;
  await fireEvent.press(screen.getByRole("button", { name: "Remove 2 Filler Words" }));
  const p = st().project!;
  expect(p.clips).toHaveLength(3);
  expect((p.overlays[0] as TextOverlay).text).toBe("so we go");
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(useToast.getState()).toMatchObject({ message: "2 filler words removed", kind: "done", undo: true });
  st().undo();
  expect(st().project).toBe(before);
});

test("one filler: singular words", async () => {
  load([cap([W("um", 0.5, 0.8), W("okay", 1, 1.5)])]); await open();
  expect(screen.getByText("1 found")).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: "Remove 1 Filler Word" }));
  expect(useToast.getState().message).toBe("1 filler word removed");
});

test("none found: the row stays, no button, Replace is the white one as before", async () => {
  load([cap([W("so", 0, 0.3), W("we", 1, 1.3)])]); await open();
  expect(screen.getByText(FILLER_WORDS.none)).toBeTruthy();
  expect(screen.getByTestId("main-button")).toHaveAccessibleName("Replace");
});

test("can't be cut: counted and said, no button", async () => {
  load([cap([W("so", 0, 0.3), W("um", 0.5, 0.8), W("go", 1, 1.5)], "c", 3.5, 5.5)], [makeClip({ id: "a", sourceDuration: 3 }), makePhotoClip({ id: "ph", seconds: 3 })]);
  await open();
  expect(screen.getByText("1 found")).toBeTruthy();
  expect(screen.getByText("1 is over a part that can't be cut.")).toBeTruthy();
  expect(screen.queryByRole("button", { name: /Filler Word/ })).toBeNull();
});

test("not English: the one sentence, no count, no button", async () => {
  mockEnglish = false;
  load([cap(SENTENCE)]); await open();
  expect(screen.getByText(FILLER_WORDS.englishOnly)).toBeTruthy();
  expect(screen.queryByText("2 found")).toBeNull();
  expect(screen.queryByRole("button", { name: /Filler Word/ })).toBeNull();
});

test("no row when the captions have no word timings (the existing panel, unchanged)", async () => {
  load([makeOverlay({ id: "c", kind: "caption", start: 0, end: 1, text: "um", words: [] })]); await open();
  expect(screen.queryByTestId("filler-words")).toBeNull();
});

test("a stale tap: the panel closes, says the captions changed, and nothing changes", async () => {
  load([cap(SENTENCE)]); await open();
  expect(screen.getByRole("button", { name: "Remove 2 Filler Words" })).toBeTruthy();
  const press = mockRemove!;
  const changed = makeProject({ clips: [makeClip({ id: "a", sourceDuration: 10 })], overlays: [cap([W("so", 0, 0.3), W("um", 0.5, 0.8), W("we", 1, 1.3)])] });
  // The store changes and the captured handler (the old plan) is called before a new render could replace it.
  act(() => { useEditorStore.setState({ project: changed }); });
  act(() => press());
  expect(st().project).toBe(changed);
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(useToast.getState()).toMatchObject({ message: FILLER_CHANGED, kind: "problem" });
  expect(useToast.getState().undo).toBeFalsy();
});
