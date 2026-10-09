import { act, fireEvent, render, screen } from "@testing-library/react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-09T10:00:00.000Z" }));
jest.mock("@react-native-community/slider", () => { const { View } = require("react-native"); return ({ testID, disabled }: { testID?: string; disabled?: boolean }) => <View testID={testID} accessibilityState={{ disabled: !!disabled }} />; });
jest.mock("@/modules/clipy-video", () => ({ ...jest.requireActual("@/modules/clipy-video"), isBeatEnvelopeAvailable: jest.fn(() => true) }));
jest.mock("@/src/editor/ownBeats", () => ({ ...jest.requireActual("@/src/editor/ownBeats"), listenForBeats: jest.fn(), stopListening: jest.fn() }));
import { isBeatEnvelopeAvailable } from "@/modules/clipy-video";
import { makeAudioTrack, makeClip, makeProject, type Project } from "@/src/editor/model/types";
import { beatKey, listenForBeats, stopListening, useOwnBeats, type ListenAnswer } from "@/src/editor/ownBeats";
import { useEditorStore } from "@/src/editor/store";
import { BEATS_BACKGROUND_TOOLS } from "@/src/lib/buildInfo";
import { useToast } from "@/src/ui/Toast";
import { BEAT_MESSAGES, BeatsSheet, findHint } from "../components/BeatsSheet";

const st = () => useEditorStore.getState();
const markers = () => st().project!.beatMarkers;
const btn = (name: string) => screen.getByRole("button", { name });
const listen = jest.mocked(listenForBeats);
const song = makeAudioTrack({ id: "own", title: "my song.m4a", sourceDuration: 20, sourceUri: "file:///doc/projects/p1/media/song.m4a" });
const BEATS = { bpm: 120, first: 0.5, confidence: 3, beats: [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4] };
const open = async (extra: Partial<Project> = {}) => {
  st().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 10 })], audioTracks: [song], ...extra }));
  await render(<BeatsSheet visible onClose={() => {}} />);
};
/** A listening that ends when the test says so, with what it found remembered first (as the real one does). */
const pending = () => {
  let end: (v: ListenAnswer) => void = () => {};
  listen.mockReturnValueOnce(new Promise((resolve) => { end = resolve; }));
  return { finish: async (answer: ListenAnswer, found?: typeof BEATS | null) => {
    await act(async () => {
      if (found !== undefined) useOwnBeats.setState({ found: { [beatKey(song)]: found } });
      end(answer);
      await Promise.resolve();
    });
  } };
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(isBeatEnvelopeAvailable).mockReturnValue(true);
  useOwnBeats.setState({ found: {} });
  useToast.getState().clear();
  st().reset();
});

test("the sentences", () => {
  expect(findHint("own", "my song.m4a")).toBe("Find beats listens to my song.m4a for a few seconds.");
  expect(findHint("own", "my song.m4a", false)).toBe("For your own music, Find beats needs the latest Clipy build. Until then, tap the beat with Tap.");
  expect(findHint("ok", "Party Sector", false)).toBe("Find beats marks the beats of Party Sector.");
  expect(BEAT_MESSAGES).toEqual({ tooShort: "This sound is too short to find a beat in.", failed: "Could not listen to this sound.",
    ownNeedsBuild: "For your own music, Find beats needs the latest Clipy build. Until then, tap the beat with Tap.",
    gaveUp: "Couldn't finish listening to this song. Try a shorter piece." });
});

test("own music: the button is on and the hint says it will listen; a tap listens, shows the spinner, then places the markers in one undo step", async () => {
  await open();
  expect(btn("Find Beats")).toBeEnabled();
  expect(screen.getByText("Find beats listens to my song.m4a for a few seconds.")).toBeTruthy();
  const run = pending();
  await fireEvent.press(btn("Find Beats"));
  expect(listen).toHaveBeenCalledWith(expect.objectContaining({ id: "own", sourceUri: song.sourceUri }));
  expect(screen.getByLabelText("Listening to the music")).toBeTruthy();
  expect(btn("Find Beats")).toBeDisabled();
  expect(markers()).toEqual([]);
  await run.finish("ok", BEATS);
  expect(screen.queryByLabelText("Listening to the music")).toBeNull();
  expect(markers()).toEqual([0.5, 1.5, 2.5, 3.5]);            // every 2nd beat: the slider rests in the middle
  expect(st().past).toHaveLength(1);
  expect(screen.getByText("Find beats marks the beats of my song.m4a.")).toBeTruthy();
});

test("once listened to, Find beats is instant and the slider is on", async () => {
  useOwnBeats.setState({ found: { [beatKey(song)]: BEATS } });
  await open();
  expect(screen.getByTestId("beats-density").props.accessibilityState.disabled).toBe(false);
  await fireEvent.press(btn("Find Beats"));
  expect(listen).not.toHaveBeenCalled();
  expect(markers()).toEqual([0.5, 1.5, 2.5, 3.5]);
});

test("no steady beat: nothing is placed and the hint says so; too short says so in a toast", async () => {
  await open();
  const first = pending();
  await fireEvent.press(btn("Find Beats"));
  await first.finish("unsteady", null);
  expect(markers()).toEqual([]);
  expect(st().past).toHaveLength(0);
  expect(screen.getByText("my song.m4a has no steady beat. Tap the beat with Tap instead.")).toBeTruthy();
  // The row is 36 pt and the sentence carries the owner's file name: two lines at most, so a long name never runs over the row below.
  expect(screen.getByText("my song.m4a has no steady beat. Tap the beat with Tap instead.").props.numberOfLines).toBe(2);
  expect(btn("Find Beats")).toBeDisabled();
  await act(async () => { useOwnBeats.setState({ found: {} }); });
  const second = pending();
  await fireEvent.press(btn("Find Beats"));
  await second.finish("short", null);
  expect(useToast.getState().message).toBe(BEAT_MESSAGES.tooShort);
});

test("a file that cannot be listened to: one plain toast, nothing placed, the button is back", async () => {
  await open();
  listen.mockRejectedValueOnce(new Error("beats source: this file has no sound"));
  const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  try {
    await fireEvent.press(btn("Find Beats"));
    await act(async () => { await Promise.resolve(); });
    expect(useToast.getState().message).toBe(BEAT_MESSAGES.failed);
    expect(markers()).toEqual([]);
    expect(btn("Find Beats")).toBeEnabled();
  } finally { warn.mockRestore(); }
});

test("on a build without it: the hint says so, a tap says the sentence, and nothing is listened to", async () => {
  jest.mocked(isBeatEnvelopeAvailable).mockReturnValue(false);
  await open();
  expect(screen.getByText(BEAT_MESSAGES.ownNeedsBuild)).toBeTruthy();
  await fireEvent.press(btn("Find Beats"));
  expect(useToast.getState().message).toBe(BEATS_BACKGROUND_TOOLS);
  expect(listen).not.toHaveBeenCalled();
  expect(markers()).toEqual([]);
});

test("closing the panel while it listens stops the listening, and an answer that still comes places nothing", async () => {
  st().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 10 })], audioTracks: [song] }));
  const view = await render(<BeatsSheet visible onClose={() => {}} />);
  const run = pending();
  await fireEvent.press(btn("Find Beats"));
  await view.rerender(<BeatsSheet visible={false} onClose={() => {}} />);
  expect(stopListening).toHaveBeenCalled();
  await run.finish("ok", BEATS);
  expect(markers()).toEqual([]);
});

test("the track deleted while it listens: the answer is dropped", async () => {
  await open();
  const run = pending();
  await fireEvent.press(btn("Find Beats"));
  await act(() => { st().apply((p) => ({ ...p, audioTracks: [] })); });
  await run.finish("ok", BEATS);
  expect(markers()).toEqual([]);
});

// —— Beyond the brief: the two answers it did not name ——

test("the listening ended on its own (the deadline) with the panel still open: one sentence in the hint's place, nothing placed, the button is back; the next tap listens again", async () => {
  await open();
  const run = pending();
  await fireEvent.press(btn("Find Beats"));
  await run.finish("stopped");
  expect(screen.queryByLabelText("Listening to the music")).toBeNull();
  expect(screen.getByText(BEAT_MESSAGES.gaveUp)).toBeTruthy();
  expect(useToast.getState().message).toBeNull();
  expect(markers()).toEqual([]);
  expect(st().past).toHaveLength(0);
  expect(btn("Find Beats")).toBeEnabled();
  const again = pending();
  await fireEvent.press(btn("Find Beats"));
  expect(screen.queryByText(BEAT_MESSAGES.gaveUp)).toBeNull();
  await again.finish("ok", BEATS);
  expect(markers()).toEqual([0.5, 1.5, 2.5, 3.5]);
  expect(screen.queryByText(BEAT_MESSAGES.gaveUp)).toBeNull();
});

test("a stopped listening says nothing once the panel has been closed and opened again", async () => {
  st().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 10 })], audioTracks: [song] }));
  const view = await render(<BeatsSheet visible onClose={() => {}} />);
  const run = pending();
  await fireEvent.press(btn("Find Beats"));
  await view.rerender(<BeatsSheet visible={false} onClose={() => {}} />);
  await run.finish("stopped");
  await view.rerender(<BeatsSheet visible onClose={() => {}} />);
  expect(screen.queryByText(BEAT_MESSAGES.gaveUp)).toBeNull();
  expect(screen.getByText("Find beats listens to my song.m4a for a few seconds.")).toBeTruthy();
  expect(btn("Find Beats")).toBeEnabled();
});

test("the listener answers that this app has none: the build sentence, nothing placed", async () => {
  await open();
  listen.mockResolvedValueOnce("unavailable");
  await fireEvent.press(btn("Find Beats"));
  await act(async () => { await Promise.resolve(); });
  expect(useToast.getState().message).toBe(BEATS_BACKGROUND_TOOLS);
  expect(markers()).toEqual([]);
  expect(btn("Find Beats")).toBeEnabled();
});
