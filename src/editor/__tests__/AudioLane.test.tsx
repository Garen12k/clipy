import { act, fireEvent, render, screen } from "@testing-library/react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
import { makeAudioTrack, makeClip, makeEffect, makeProject } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { theme } from "@/src/theme/theme";
import { AudioLane } from "../components/AudioLane";

const p = makeProject({ clips: [makeClip({ id: "a", sourceDuration: 20 })], effects: [makeEffect({ id: "e1", start: 1, end: 3 })],
  audioTracks: [
    makeAudioTrack({ id: "m1", title: "Song", sourceDuration: 30, start: 1, trimStart: 0, trimEnd: 4 }),
    makeAudioTrack({ id: "v1", kind: "voice", title: "Voice-over 1", sourceDuration: 6, start: 2, trimStart: 1, trimEnd: 3 }),
    makeAudioTrack({ id: "m2", title: "Second", sourceDuration: 30, start: 8, trimStart: 2, trimEnd: 5 }),
    makeAudioTrack({ id: "s1", kind: "sfx", title: "Whoosh", sourceDuration: 1, start: 4 }),
  ] });
beforeEach(() => { useEditorStore.getState().reset(); useEditorStore.getState().setProject(p); useEditorStore.getState().setZoom(50); });

const track = (id: string) => useEditorStore.getState().project!.audioTracks.find((t) => t.id === id)!;
type G = { handlers: { onStart: () => void; onUpdate: (e: { translationX: number }) => void } };
const gestureOf = (node: { props: { gesture?: unknown } }) => node.props.gesture as G;

test("a lane holds one bar per track of its kind, placed by start and trimmed length, labelled and coloured by kind", async () => {
  await render(<><AudioLane kind="music" /><AudioLane kind="voice" /><AudioLane kind="sfx" /></>);
  for (const id of ["music-lane", "voice-lane", "sfx-lane"]) expect(screen.getByTestId(id)).toHaveStyle({ position: "relative", height: 28, marginTop: 4 });
  expect(screen.getByTestId("audio-bar-m1")).toHaveStyle({ position: "absolute", left: 50, width: 200, backgroundColor: theme.colors.laneMusic });
  expect(screen.getByTestId("audio-bar-m2")).toHaveStyle({ position: "absolute", left: 400, width: 150, backgroundColor: theme.colors.laneMusic });
  expect(screen.getByTestId("audio-bar-v1")).toHaveStyle({ position: "absolute", left: 100, width: 100, backgroundColor: theme.colors.laneVoice });
  expect(screen.getByTestId("audio-bar-s1")).toHaveStyle({ position: "absolute", left: 200, width: 50, backgroundColor: theme.colors.laneSfx });
  for (const title of ["Song", "Second", "Voice-over 1", "Whoosh"]) expect(screen.getByText(title)).toBeTruthy();
});

test("a lane shows only its own kind", async () => {
  await render(<AudioLane kind="voice" />);
  expect(screen.getAllByTestId(/^audio-bar-[a-z0-9]+$/).map((b) => b.props.testID)).toEqual(["audio-bar-v1"]);
});

test("tapping a bar selects it (exclusively); tapping the selected bar deselects", async () => {
  useEditorStore.getState().selectEffect("e1");
  await render(<AudioLane kind="music" />);
  await fireEvent.press(screen.getByTestId("audio-bar-m1"));
  expect(useEditorStore.getState()).toMatchObject({ selectedAudioId: "m1", selectedEffectId: null, selectedClipId: null, selectedOverlayId: null });
  expect(screen.getByTestId("audio-bar-m1")).toHaveStyle({ borderColor: theme.colors.text });
  expect(screen.getByTestId("audio-bar-m2")).toHaveStyle({ borderColor: theme.colors.laneMusic });
  await fireEvent.press(screen.getByTestId("audio-bar-m2"));
  expect(useEditorStore.getState().selectedAudioId).toBe("m2");
  await fireEvent.press(screen.getByTestId("audio-bar-m2"));
  expect(useEditorStore.getState().selectedAudioId).toBeNull();
});

test("a long-press drag moves that track only, as one undo step; a second drag starts from the new position", async () => {
  await render(<AudioLane kind="music" />);
  const g = gestureOf(screen.getByTestId("audio-bar-m2"));
  await act(() => { g.handlers.onStart(); g.handlers.onUpdate({ translationX: 25 }); g.handlers.onUpdate({ translationX: 50 }); });
  expect(track("m2")).toMatchObject({ start: 9, trimStart: 2, trimEnd: 5 });
  expect(track("m1")).toMatchObject({ start: 1, trimStart: 0, trimEnd: 4 });
  expect(useEditorStore.getState().past).toHaveLength(1);
  await act(() => { g.handlers.onStart(); g.handlers.onUpdate({ translationX: -100 }); });
  expect(track("m2").start).toBe(7);
  expect(useEditorStore.getState().past).toHaveLength(2);
  await act(() => { useEditorStore.getState().undo(); });
  expect(track("m2").start).toBe(9);
  // Never before the start of the video.
  await act(() => { g.handlers.onStart(); g.handlers.onUpdate({ translationX: -5000 }); });
  expect(track("m2").start).toBe(0);
});

test("handles show only on the selected bar and trim one edge each, one undo step per drag", async () => {
  await render(<AudioLane kind="music" />);
  expect(screen.queryByLabelText("Music start handle")).toBeNull();
  expect(screen.queryByLabelText("Music end handle")).toBeNull();
  await act(() => { useEditorStore.getState().selectAudio("m2"); });
  expect(screen.getAllByLabelText("Music start handle")).toHaveLength(1);
  const left = gestureOf(screen.getByLabelText("Music start handle"));
  await act(() => { left.handlers.onStart(); left.handlers.onUpdate({ translationX: 25 }); left.handlers.onUpdate({ translationX: 50 }); });
  expect(track("m2")).toMatchObject({ start: 8, trimStart: 3, trimEnd: 5 });
  const right = gestureOf(screen.getByLabelText("Music end handle"));
  await act(() => { right.handlers.onStart(); right.handlers.onUpdate({ translationX: 100 }); });
  expect(track("m2")).toMatchObject({ start: 8, trimStart: 3, trimEnd: 7 });
  expect(useEditorStore.getState().past).toHaveLength(2);
  // A second trim starts from the new edge.
  await act(() => { right.handlers.onStart(); right.handlers.onUpdate({ translationX: -50 }); });
  expect(track("m2").trimEnd).toBe(6);
  expect(track("m1")).toMatchObject({ start: 1, trimStart: 0, trimEnd: 4 });
});

test("the trim minimum is the op's, per kind: 0.1 s for a sound effect", async () => {
  useEditorStore.getState().selectAudio("s1");
  await render(<AudioLane kind="sfx" />);
  const right = gestureOf(screen.getByLabelText("Sound effect end handle"));
  await act(() => { right.handlers.onStart(); right.handlers.onUpdate({ translationX: -5000 }); });
  expect(track("s1")).toMatchObject({ trimStart: 0, trimEnd: 0.1 });
});

test("a bar overlapping an earlier one of its kind is drawn later (on top) at 85 % opacity", async () => {
  useEditorStore.getState().setProject({ ...p, audioTracks: [
    makeAudioTrack({ id: "x", sourceDuration: 10, start: 0, trimEnd: 4 }),
    makeAudioTrack({ id: "y", sourceDuration: 10, start: 3, trimEnd: 4 }),
    makeAudioTrack({ id: "z", sourceDuration: 10, start: 7, trimEnd: 2 }),   // touches y's end: not an overlap
    makeAudioTrack({ id: "w", kind: "voice", sourceDuration: 10, start: 0, trimEnd: 9 }),   // another kind never counts
  ] });
  await render(<AudioLane kind="music" />);
  expect(screen.getAllByTestId(/^audio-bar-[a-z0-9]+$/).map((b) => b.props.testID)).toEqual(["audio-bar-x", "audio-bar-y", "audio-bar-z"]);
  expect(screen.getByTestId("audio-bar-x")).toHaveStyle({ opacity: 1 });
  expect(screen.getByTestId("audio-bar-y")).toHaveStyle({ opacity: 0.85 });
  expect(screen.getByTestId("audio-bar-z")).toHaveStyle({ opacity: 1 });
});

test("a very short track still gets a 28 pt bar; a missing file shows the warning badge", async () => {
  useEditorStore.getState().setProject({ ...p, audioTracks: [makeAudioTrack({ id: "t", kind: "sfx", sourceDuration: 0.2, start: 2 })] });
  useEditorStore.getState().setZoom(50);
  useEditorStore.setState({ missingSourceUris: ["file:///media/t.m4a"] });
  await render(<AudioLane kind="sfx" />);
  expect(screen.getByTestId("audio-bar-t")).toHaveStyle({ left: 100, width: 28 });
  expect(screen.getByTestId("audio-bar-t-missing")).toBeTruthy();
});
