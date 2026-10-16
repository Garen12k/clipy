jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-16T10:00:00.000Z" }));
jest.mock("@/modules/clipy-video", () => ({ ...jest.requireActual("@/modules/clipy-video"), isPeaksAvailable: jest.fn(() => true) }));
jest.mock("@/src/editor/soundPeaks", () => ({ listenForPauses: jest.fn(), stopPauses: jest.fn(), heardPauses: jest.fn(() => null) }));
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { isPeaksAvailable } from "@/modules/clipy-video";
import { makeAudioTrack, makeClip, makeLayer, makeProject, type Clip } from "@/src/editor/model/types";
import { listenForPauses, type PauseListening } from "@/src/editor/soundPeaks";
import { useEditorStore } from "@/src/editor/store";
import { PAUSES_TOOLS } from "@/src/lib/buildInfo";
import { useToast } from "@/src/ui/Toast";
import { PAUSE_CHANGED, PAUSE_WORDS, pauseStatus, RemovePausesSheet } from "../components/RemovePausesSheet";
import { usePauses } from "../pausesState";
import { DEFAULT_PAUSE_CHOICE, PAUSES } from "../model/pauses";

const st = () => useEditorStore.getState();
/** Speech 1 s, silence 1 s, speech 1 s, silence 0.5 s, speech 1 s over the clip's trim 0 … 4.5. */
function talk(): Float32Array {
  const l = new Float32Array(450).fill(0.5);
  l.fill(0.001, 100, 200); l.fill(0.001, 300, 350);
  return l;
}
let finish: (r: PauseListening) => void = () => {};
const onClose = jest.fn();
const open = async (id = "a") => {
  await render(<RemovePausesSheet clipId={id} visible onClose={onClose} />);
};
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(isPeaksAvailable).mockReturnValue(true);
  jest.mocked(listenForPauses).mockImplementation(() => new Promise((r) => { finish = r; }));
  usePauses.setState({ choice: DEFAULT_PAUSE_CHOICE, shades: null });
  useToast.getState().clear();
  st().reset();
  st().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 4.5 }), makeClip({ id: "b", sourceDuration: 3 })], layers: [makeLayer({ id: "L", sourceDuration: 2 })] }));
});
const heard = async () => { await act(async () => { finish({ status: "ready", outline: { from: 0, to: 4.5, levels: talk() } }); }); };

test("the drawing: title, two rows of chips with the defaults picked, Listening…, no button yet", async () => {
  await open();
  expect(screen.getByText("Remove pauses")).toBeTruthy();
  expect(screen.getByText("Cut pauses longer than")).toBeTruthy();
  expect(screen.getByText("What counts as quiet")).toBeTruthy();
  for (const l of ["0.3 s", "0.6 s", "1 s", "Silent", "Quiet", "Noisy Room"]) expect(screen.getByText(l)).toBeTruthy();
  expect(screen.getByRole("button", { name: "Longer than 0.6 seconds" }).props.accessibilityState.selected).toBe(true);
  expect(screen.getByRole("button", { name: "Quiet" }).props.accessibilityState.selected).toBe(true);
  expect(screen.getByText(PAUSE_WORDS.listening)).toBeTruthy();
  expect(screen.queryByTestId("main-button")).toBeNull();
  expect(listenForPauses).toHaveBeenCalledWith({ uri: "file:///media/a.mp4", from: 0, to: 4.5 });
});

test("found: the line, the white button, the shades; a chip re-computes at once without listening again", async () => {
  await open(); await heard();
  expect(screen.getByText("1 pause found · 0.8 s shorter")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Remove 1 Pause" })).toBeTruthy();
  expect(usePauses.getState().shades).toEqual({ clipId: "a", cuts: [[1.1, 1.9]] });
  await fireEvent.press(screen.getByRole("button", { name: "Longer than 0.3 seconds" }));
  expect(screen.getByText("2 pauses found · 1.1 s shorter")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Remove 2 Pauses" })).toBeTruthy();
  expect(listenForPauses).toHaveBeenCalledTimes(1);
  expect(usePauses.getState().choice).toEqual({ gap: "short", quiet: "quiet" });
});

test("Remove: ONE undo step, the strip closes, then the message with Undo", async () => {
  await open(); await heard();
  await fireEvent.press(screen.getByRole("button", { name: "Longer than 0.3 seconds" }));
  await fireEvent.press(screen.getByRole("button", { name: "Remove 2 Pauses" }));
  expect(st().past).toHaveLength(1);
  expect(st().project!.clips.map((c) => [c.trimStart, c.trimEnd])).toEqual([[0, 1.1], [1.9, 3.1], [3.4, 4.5], [0, 3]]);
  expect(st().project!.clips[0].id).toBe("a");
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(useToast.getState()).toMatchObject({ message: "2 pauses removed", kind: "done", undo: true });
});

test("closing clears the shades", async () => {
  const r = await render(<RemovePausesSheet clipId="a" visible onClose={onClose} />);
  await heard();
  expect(usePauses.getState().shades).not.toBeNull();
  await r.rerender(<RemovePausesSheet clipId="a" visible={false} onClose={onClose} />);
  expect(usePauses.getState().shades).toBeNull();
});

test("without the function: the sentence, nothing asked, no button", async () => {
  jest.mocked(isPeaksAvailable).mockReturnValue(false);
  await open();
  expect(screen.getByText(PAUSES_TOOLS)).toBeTruthy();
  expect(PAUSES_TOOLS).toBe("Remove pauses and sound outlines need the latest Clipy build. Install it from the newest build link.");
  expect(listenForPauses).not.toHaveBeenCalled();
  expect(screen.queryByTestId("main-button")).toBeNull();
});

test("a layer's id draws nothing", async () => {
  await open("L");
  expect(screen.queryByText("Remove pauses")).toBeNull();
});

test("pauseStatus: every line", () => {
  const base = { build: false, missing: false, state: null, found: null, saving: 0 } as const;
  expect(pauseStatus({ ...base, build: true })).toBe(PAUSES_TOOLS);
  expect(pauseStatus({ ...base, missing: true })).toBe("The file of this clip is missing.");
  expect(pauseStatus(base)).toBe("Listening…");
  expect(pauseStatus({ ...base, state: { status: "failed", reason: "tooLong" } })).toBe("Remove pauses works on clips up to 10 minutes. Trim or split this clip first.");
  expect(pauseStatus({ ...base, state: { status: "failed", reason: "noSound" } })).toBe("This clip has no sound.");
  expect(pauseStatus({ ...base, state: { status: "failed", reason: "failed" } })).toBe("Could not listen to this clip. Close and open Remove pauses to try again.");
  const ready = { status: "ready", outline: { from: 0, to: 1, levels: new Float32Array(100) } } as const;
  expect(pauseStatus({ ...base, state: ready, found: { cuts: [], silent: true } })).toBe("This clip is silent.");
  expect(pauseStatus({ ...base, state: ready, found: { cuts: [], silent: false } })).toBe("No pauses found");
  expect(pauseStatus({ ...base, state: ready, found: { cuts: Array(6).fill([0, 1]), silent: false }, saving: 8.44 })).toBe("6 pauses found · 8.4 s shorter");
  expect(PAUSES.maxCuts).toBe(60);
});

const NO_LONGER: [string, (c: Clip) => Partial<Clip>][] = [
  ["reversed", () => ({ reversed: true })],
  ["a speed curve", (c) => ({ speedCurve: { id: "montage", steps: [{ from: 0, to: c.trimEnd, speed: 1 }] } as never })],
  ["its sound on its own bar", () => ({ muted: true })],
];
test.each(NO_LONGER)("Remove asks again what showed the tool — %s since (Undo / Redo under the open strip): the strip closes, says so, nothing changes", async (_, change) => {
  await open(); await heard();
  const button = screen.getByRole("button", { name: "Remove 1 Pause" });
  const p = st().project!;
  const a = { ...p.clips[0], ...change(p.clips[0]) };
  const audioTracks = a.muted ? [makeAudioTrack({ id: "x", sourceUri: a.sourceUri, sourceDuration: 4.5, start: 0, trimStart: 0, trimEnd: 4.5 })] : p.audioTracks;
  const changed = { ...p, clips: [a, p.clips[1]], audioTracks };
  useEditorStore.setState({ project: changed });   // the press lands before the strip draws again
  await fireEvent.press(button);
  expect(st().project).toBe(changed);
  expect(st().past).toHaveLength(0);
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(useToast.getState()).toMatchObject({ message: PAUSE_CHANGED, kind: "problem" });
  expect(useToast.getState().undo).toBeFalsy();
  expect(PAUSE_CHANGED).toBe("This clip has changed. Nothing was removed.");
});

test("Remove asks again: a trim changed since listening (the cuts belong to the old one) closes the strip, changes nothing", async () => {
  await open(); await heard();
  const button = screen.getByRole("button", { name: "Remove 1 Pause" });
  const p = st().project!;
  // The store moves on before the strip has drawn again (the press lands first).
  useEditorStore.setState({ project: { ...p, clips: [{ ...p.clips[0], trimStart: 0.2 }, p.clips[1]] } });
  const before = st().project;
  await fireEvent.press(button);
  expect(st().project).toBe(before);
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(useToast.getState()).toMatchObject({ message: PAUSE_CHANGED, kind: "problem" });
});
