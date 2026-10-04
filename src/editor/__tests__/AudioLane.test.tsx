import { act, fireEvent, render, screen } from "@testing-library/react-native";
import * as Haptics from "expo-haptics";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
import { makeAudioTrack, makeClip, makeEffect, makeLayer, makeOverlay, makeProject, makeSticker } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { theme } from "@/src/theme/theme";
import { AudioLane } from "../components/AudioLane";
import { useSnapGuide } from "../snapping";

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

test("a very short track is drawn 12 pt wide (not half a second long) and stays tappable; a missing file shows the warning badge", async () => {
  useEditorStore.getState().setProject({ ...p, audioTracks: [
    makeAudioTrack({ id: "t", kind: "sfx", title: "Blip", sourceDuration: 0.1, start: 2 }),
    makeAudioTrack({ id: "u", kind: "sfx", title: "Longer", sourceDuration: 0.5, start: 4 }),
  ] });
  useEditorStore.getState().setZoom(50);
  useEditorStore.setState({ missingSourceUris: ["file:///media/t.m4a"] });
  await render(<AudioLane kind="sfx" />);
  expect(screen.getByTestId("audio-bar-t")).toHaveStyle({ left: 100, width: 12 });
  expect(screen.getByTestId("audio-bar-t").props.hitSlop).toBe(8);
  expect(screen.getByTestId("audio-bar-u")).toHaveStyle({ left: 200, width: 25 });
  expect(screen.getByTestId("audio-bar-t-missing")).toBeTruthy();
  // no room for a label on a bar that narrow: it would spill over its neighbours
  expect(screen.queryByText("Blip")).toBeNull();
  await fireEvent.press(screen.getByTestId("audio-bar-t"));
  expect(useEditorStore.getState().selectedAudioId).toBe("t");
  // both handles fit on the narrow bar, side by side
  expect(screen.getByLabelText("Sound effect start handle")).toHaveStyle({ left: 0, width: 6 });
  expect(screen.getByLabelText("Sound effect end handle")).toHaveStyle({ right: 0, width: 6 });
});

test("the selected bar is drawn above its neighbours, so its handles can be reached under an overlapping bar", async () => {
  useEditorStore.getState().setProject({ ...p, audioTracks: [
    makeAudioTrack({ id: "x", sourceDuration: 10, start: 0, trimEnd: 4 }),
    makeAudioTrack({ id: "y", sourceDuration: 10, start: 3, trimEnd: 4 }),   // drawn later: covers x's end handle
  ] });
  await render(<AudioLane kind="music" />);
  expect(screen.getByTestId("audio-bar-x")).toHaveStyle({ zIndex: 0 });
  expect(screen.getByTestId("audio-bar-y")).toHaveStyle({ zIndex: 0 });
  await act(() => { useEditorStore.getState().selectAudio("x"); });
  expect(screen.getByTestId("audio-bar-x")).toHaveStyle({ zIndex: 1 });
  expect(screen.getByTestId("audio-bar-y")).toHaveStyle({ zIndex: 0 });
});

describe("snapping", () => {
  // The project of model/__tests__/snap.test.ts. Main track a 0–4, b 4–7. Text o 1–2.5. Sticker s 6–6.5. Music m 0.5–9.5. Layer l 3–5.
  // Effect e 5.5–6.5. Beats 2 and 6. Playhead 3.3. Zoom 80 → an edge within 0.1 s of a target snaps.
  const snapProject = makeProject({
    clips: [makeClip({ id: "a", sourceDuration: 4 }), makeClip({ id: "b", sourceDuration: 6, speed: 2 })],
    overlays: [makeOverlay({ id: "o", start: 1, end: 2.5 }), makeSticker({ id: "s", start: 6, end: 6.5 })],
    audioTracks: [makeAudioTrack({ id: "m", sourceDuration: 9, start: 0.5 })],
    layers: [makeLayer({ id: "l", sourceDuration: 2, start: 3 })],
    effects: [makeEffect({ id: "e", start: 5.5, end: 6.5 })],
    beatMarkers: [2, 6],
  });
  const buzz = Haptics.impactAsync as jest.Mock;
  const guide = () => useSnapGuide.getState().time;
  type SnapG = { handlers: { onStart: () => void; onUpdate: (e: { translationX: number }) => void; onEnd?: () => void; onFinalize: () => void } };
  /** One whole gesture at zoom 80, `seconds` of drag per frame; returns what was showing just before the finger lifted. */
  const snapDrag = async (g: SnapG, ...seconds: number[]) => {
    await act(() => { g.handlers.onStart(); for (const s of seconds) g.handlers.onUpdate({ translationX: s * 80 }); });
    const held = { guide: guide(), buzzes: buzz.mock.calls.length };
    await act(() => { g.handlers.onEnd?.(); g.handlers.onFinalize(); });
    expect(guide()).toBeNull();
    expect(useEditorStore.getState().past).toHaveLength(1);
    return held;
  };
  beforeEach(() => {
    useEditorStore.getState().reset(); useEditorStore.getState().setProject(snapProject); useEditorStore.getState().seek(3.3); useEditorStore.getState().setZoom(80);
    useSnapGuide.setState({ time: null }); buzz.mockClear();
  });
  const m = () => useEditorStore.getState().project!.audioTracks.find((v) => v.id === "m")!;
  const handle = async (label: string) => { await act(() => { useEditorStore.getState().selectAudio("m"); }); return screen.getByLabelText(label).props.gesture as SnapG; };

  test("a move snaps the start onto the text's start", async () => {
    await render(<AudioLane kind="music" />);
    const held = await snapDrag(screen.getByTestId("audio-bar-m").props.gesture as SnapG, 0.46);   // start 0.96 → 1
    expect(m()).toMatchObject({ start: 1, trimStart: 0, trimEnd: 9 });
    expect(held).toEqual({ guide: 1, buzzes: 1 });
  });

  test("the end handle snaps the bar's end to the project's end", async () => {
    await render(<AudioLane kind="music" />);
    const held = await snapDrag(await handle("Music end handle"), -2.46);   // end 7.04 → 7
    expect(m()).toMatchObject({ start: 0.5, trimStart: 0, trimEnd: 6.5 });
    expect(held).toEqual({ guide: 7, buzzes: 1 });
  });

  test("the start handle moves the bar's END (the start stays), so the end is what snaps", async () => {
    await render(<AudioLane kind="music" />);
    const held = await snapDrag(await handle("Music start handle"), 2.46);   // end 9.5 − 2.46 = 7.04 → 7
    expect(m()).toMatchObject({ start: 0.5, trimStart: 2.5, trimEnd: 9 });
    expect(held).toEqual({ guide: 7, buzzes: 1 });
  });

  test("a snap past the end of the song is not taken", async () => {
    // The song is already at its full length: its end (9.5) cannot reach the beat at 9.55.
    useEditorStore.getState().setProject({ ...snapProject, beatMarkers: [2, 6, 9.55] });
    useEditorStore.getState().seek(3.3); useEditorStore.getState().setZoom(80);
    await render(<AudioLane kind="music" />);
    const held = await snapDrag(await handle("Music end handle"), 0.03);   // end 9.53 → 9.55, which the op clamps back to 9.5
    expect(m()).toMatchObject({ start: 0.5, trimStart: 0, trimEnd: 9 });
    expect(held).toEqual({ guide: null, buzzes: 0 });
  });

  test("touching a handle also begins the body's pan, which fails: its finalize does not stop the handle snapping", async () => {
    await render(<AudioLane kind="music" />);
    const g = await handle("Music end handle");
    await act(() => { g.handlers.onStart(); (screen.getByTestId("audio-bar-m").props.gesture as SnapG).handlers.onFinalize(); g.handlers.onUpdate({ translationX: -2.46 * 80 }); });   // end 7.04 → 7
    expect(m()).toMatchObject({ start: 0.5, trimStart: 0, trimEnd: 6.5 });
    expect(guide()).toBe(7);
    expect(buzz).toHaveBeenCalledTimes(1);
    await act(() => { g.handlers.onFinalize(); });
    expect(guide()).toBeNull();
  });

  test("a bar removed in the middle of a drag takes its guide with it", async () => {
    const view = await render(<AudioLane kind="music" />);
    const g = await handle("Music end handle");
    await act(() => { g.handlers.onStart(); g.handlers.onUpdate({ translationX: -2.46 * 80 }); });
    expect(guide()).toBe(7);
    await view.unmount();
    expect(guide()).toBeNull();
  });
});
