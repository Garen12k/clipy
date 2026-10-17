jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-17T10:00:00.000Z" }));
jest.mock("@/modules/clipy-video", () => ({ ...jest.requireActual("@/modules/clipy-video"), isPeaksAvailable: jest.fn(() => true) }));
jest.mock("@/src/editor/soundPeaks", () => ({ listenForPauses: jest.fn(), stopPauses: jest.fn(), heardPauses: jest.fn(() => null) }));
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { makeAudioTrack, makeClip, makeOverlay, makeProject, type TextOverlay } from "@/src/editor/model/types";
import { listenForPauses, type PauseListening } from "@/src/editor/soundPeaks";
import { useEditorStore } from "@/src/editor/store";
import { useToast } from "@/src/ui/Toast";
import { RemovePausesSheet } from "../components/RemovePausesSheet";
import { usePauses } from "../pausesState";
import { DEFAULT_PAUSE_CHOICE } from "../model/pauses";

const st = () => useEditorStore.getState();
/** Speech 1 s, silence 1 s, speech 1 s, silence 0.5 s, speech 1 s over the clip's trim 0 … 4.5 (one pause at 0.6 s: 1.1 … 1.9). */
function talk(): Float32Array { const l = new Float32Array(450).fill(0.5); l.fill(0.001, 100, 200); l.fill(0.001, 300, 350); return l; }
let finish: (r: PauseListening) => void = () => {};
const caption = makeOverlay({ id: "c", kind: "caption", start: 0, end: 4, text: "one two three", words: [
  { text: "one", start: 0, end: 0.9 }, { text: "two", start: 2, end: 2.9 }, { text: "three", start: 3.1, end: 3.9 }] });
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(listenForPauses).mockImplementation(() => new Promise((r) => { finish = r; }));
  usePauses.setState({ choice: DEFAULT_PAUSE_CHOICE, shades: null });
  useToast.getState().clear();
  st().reset();
  st().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 4.5 }), makeClip({ id: "b", sourceDuration: 3 })],
    overlays: [caption, makeOverlay({ id: "t", start: 5, end: 6 })], audioTracks: [makeAudioTrack({ id: "m", sourceDuration: 30 })], beatMarkers: [5] }));
});

test("Remove: the caption and the text over the later clip move with the picture; music and markers stay; ONE undo brings all back", async () => {
  const before = st().project!;
  await render(<RemovePausesSheet clipId="a" visible onClose={() => {}} />);
  await act(async () => { finish({ status: "ready", outline: { from: 0, to: 4.5, levels: talk() } }); });
  await fireEvent.press(screen.getByRole("button", { name: "Remove 1 Pause" }));
  const p = st().project!;
  const cap = p.overlays.find((o) => o.id === "c") as TextOverlay;
  expect([cap.start, cap.end, cap.text]).toEqual([0, 3.2, "one two three"]);
  expect(cap.words).toEqual([{ text: "one", start: 0, end: 0.9 }, { text: "two", start: 1.2, end: 2.1 }, { text: "three", start: 2.3, end: 3.1 }]);
  expect(p.overlays.find((o) => o.id === "t")).toMatchObject({ start: 4.2, end: 5.2 });
  expect(p.audioTracks).toBe(before.audioTracks);
  expect(p.beatMarkers).toBe(before.beatMarkers);
  expect(useToast.getState()).toMatchObject({ message: "1 pause removed", kind: "done", undo: true });
  st().undo();
  expect(st().project).toBe(before);
});
