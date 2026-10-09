import { act, fireEvent, render, screen } from "@testing-library/react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-07T10:00:00.000Z" }));
jest.mock("@/src/lib/id", () => ({ newId: jest.fn(() => "new-track") }));
jest.mock("@/src/ui/haptics", () => ({ haptic: jest.fn() }));
jest.mock("@/modules/clipy-video", () => ({
  ...jest.requireActual("@/modules/clipy-video"),
  isSoundAvailable: jest.fn(() => true), soundInfo: jest.fn(async () => ({ hasSound: true, seconds: 4 })),
  probeNoiseReduction: jest.fn(async () => ({ ok: false, stage: "find", detail: "test" })),
}));
import { isSoundAvailable, soundInfo } from "@/modules/clipy-video";
import { setTrackSound } from "@/src/editor/model/ops";
import { makeAudioTrack, makeClip, makeLayer, makeProject } from "@/src/editor/model/types";
import { SOUND_UNAVAILABLE } from "@/src/editor/soundRenders";
import { useEditorStore } from "@/src/editor/store";
import { closeStrip, useToolStrip } from "@/src/editor/toolStrip";
import { EXTRACT_MESSAGES } from "@/src/editor/useExtractAudio";
import { useToast } from "@/src/ui/Toast";
import { EditorToolbar } from "../components/EditorToolbar";
import { tool } from "../testing/toolbar";

const st = () => useEditorStore.getState();
const btn = (name: string) => screen.getByRole("button", { name });
/** A tap on a tool, wherever it is on the bar (Extract audio, Voice and Sound are in a clip's Audio group; a sound's bar is flat). */
const tap = async (name: string) => { await fireEvent.press(await tool(name)); for (let i = 0; i < 6; i++) await act(async () => { await Promise.resolve(); }); };
const toast = () => useToast.getState().message;
const openTool = () => useToolStrip.getState().open?.id ?? null;
/** Every sentence said from now on, in order (the store is not spied on: zustand copies its functions into each new state). */
const listen = () => { const said: string[] = []; const off = useToast.subscribe((s) => { if (s.message) said.push(s.message); }); return { said, off }; };

let log: jest.SpyInstance;
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(isSoundAvailable).mockReturnValue(true);
  log = jest.spyOn(console, "log").mockImplementation(() => {});   // the noise test writes there when the Sound strip opens
  closeStrip();
  useToast.getState().clear();
  st().reset();
  st().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 4 }), makeClip({ id: "b", sourceDuration: 4 })], audioTracks: [makeAudioTrack({ id: "m", sourceDuration: 9, kind: "voice" })] }));
});
afterEach(() => log.mockRestore());

test("Extract audio on a clip: the new bar is selected, the clip is muted, one undo step, no tool opens", async () => {
  st().select("a");
  await render(<EditorToolbar />);
  await tap("Extract audio");
  expect(st().selectedAudioId).toBe("new-track");
  expect(st().project!.clips[0].muted).toBe(true);
  expect(st().past).toHaveLength(1);
  expect(openTool()).toBeNull();
  expect(toast()).toBeNull();
});

test("Extract audio again on the same clip: the bar that is there is selected and it says so, once", async () => {
  st().select("a");
  await render(<EditorToolbar />);
  await tap("Extract audio");
  await act(async () => { st().select("a"); });
  const { said, off } = listen();
  await tap("Extract audio");
  off();
  expect(st().project!.audioTracks).toHaveLength(2);
  expect(st().selectedAudioId).toBe("new-track");
  expect(toast()).toBe(EXTRACT_MESSAGES.already);
  expect(said).toEqual([EXTRACT_MESSAGES.already]);
  expect(st().past).toHaveLength(1);
});

test("Voice on a sound bar opens the Voice panel on that bar", async () => {
  st().selectAudio("m");
  await render(<EditorToolbar />);
  await tap("Voice");
  expect(useToolStrip.getState().open).toEqual({ id: "voice", key: "audio:m" });
  expect(screen.getByRole("button", { name: "Chipmunk" })).toBeTruthy();
  await tap("Deep");
  expect(st().project!.audioTracks[0].sound?.voice).toBe("deep");
});

test("Sound on a sound bar opens the Sound strip on that bar", async () => {
  st().selectAudio("m");
  await render(<EditorToolbar />);
  await tap("Sound");
  expect(useToolStrip.getState().open).toEqual({ id: "soundQuality", key: "audio:m" });
  expect(screen.getByText("Sound quality")).toBeTruthy();
});

test("Voice on a clip: the clip's sound is put on the audio row first (one undo step), selected, the panel opens on it, and it says so", async () => {
  st().select("b");
  await render(<EditorToolbar />);
  const { said, off } = listen();
  await tap("Voice");
  expect(st().project!.audioTracks.map((t) => t.id)).toEqual(["m", "new-track"]);
  expect(st().project!.audioTracks[1]).toMatchObject({ kind: "sfx", start: 4, sourceUri: "file:///media/b.mp4" });
  expect(st().project!.clips[1].muted).toBe(true);
  expect(st().past).toHaveLength(1);
  expect(st().selectedAudioId).toBe("new-track");
  expect(useToolStrip.getState().open).toEqual({ id: "voice", key: "audio:new-track" });
  expect(said).toEqual([EXTRACT_MESSAGES.moved]);
  off();
  // The panel is on the new bar, and it stays open (the closer saw the bar's key, not the clip's).
  await tap("Deep");
  expect(st().project!.audioTracks[1].sound?.voice).toBe("deep");
  expect(openTool()).toBe("voice");
});

test("Sound on a video layer: the same, on the layer's own sound", async () => {
  await act(async () => { st().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 4 })], layers: [makeLayer({ id: "L", sourceDuration: 3, start: 1 })] })); });
  st().select("L");
  await render(<EditorToolbar />);
  await tap("Sound");
  expect(st().project!.audioTracks).toHaveLength(1);
  expect(st().project!.audioTracks[0]).toMatchObject({ id: "new-track", kind: "sfx", start: 1 });
  expect(st().project!.layers[0].muted).toBe(true);
  expect(st().past).toHaveLength(1);
  expect(useToolStrip.getState().open).toEqual({ id: "soundQuality", key: "audio:new-track" });
  expect(toast()).toBe(EXTRACT_MESSAGES.moved);
});

test("Sound on a clip whose sound is already on the audio row: that bar is selected and the strip opens, nothing is added, nothing is said", async () => {
  st().select("a");
  await render(<EditorToolbar />);
  await tap("Extract audio");
  await act(async () => { st().select("a"); });
  await tap("Sound");
  expect(st().project!.audioTracks).toHaveLength(2);
  expect(st().past).toHaveLength(1);
  expect(st().selectedAudioId).toBe("new-track");
  expect(useToolStrip.getState().open).toEqual({ id: "soundQuality", key: "audio:new-track" });
  expect(toast()).toBeNull();
});

test("a refused extract opens nothing and is said once: a clip that is not at 1x, a file without sound", async () => {
  await act(async () => { st().setProject(makeProject({ clips: [makeClip({ id: "fast", sourceDuration: 4, speed: 2 }), makeClip({ id: "mute", sourceDuration: 4 })] })); });
  st().select("fast");
  await render(<EditorToolbar />);
  const { said, off } = listen();
  for (const name of ["Voice", "Sound", "Extract audio"]) {
    await tap(name);
    expect(toast()).toBe(EXTRACT_MESSAGES.speed);
    expect(openTool()).toBeNull();
  }
  expect(said).toEqual([EXTRACT_MESSAGES.speed, EXTRACT_MESSAGES.speed, EXTRACT_MESSAGES.speed]);
  jest.mocked(soundInfo).mockResolvedValueOnce({ hasSound: false, seconds: 4 } as Awaited<ReturnType<typeof soundInfo>>);
  await act(async () => { st().select("mute"); });
  await tap("Voice");
  expect(toast()).toBe(EXTRACT_MESSAGES.silent);
  expect(said).toHaveLength(4);
  expect(openTool()).toBeNull();
  expect(st().selectedClipId).toBe("mute");
  expect(st().project!.audioTracks).toHaveLength(0);
  expect(st().past).toHaveLength(0);
  off();
});

test("the three buttons are off while the file is asked whether it has sound", async () => {
  let answer: (v: { hasSound: boolean; seconds: number }) => void = () => {};
  jest.mocked(soundInfo).mockImplementationOnce((() => new Promise((r) => { answer = r; })) as unknown as typeof soundInfo);
  st().select("a");
  await render(<EditorToolbar />);
  await fireEvent.press((await tool("Voice")));
  for (const name of ["Extract audio", "Voice", "Sound"]) expect(btn(name).props.accessibilityState?.disabled).toBe(true);
  await act(async () => { answer({ hasSound: true, seconds: 4 }); await Promise.resolve(); });
  for (let i = 0; i < 6; i++) await act(async () => { await Promise.resolve(); });
  expect(st().project!.audioTracks).toHaveLength(2);
  expect(openTool()).toBe("voice");
});

test("an answer that comes after the editor was left opens nothing", async () => {
  let answer: (v: { hasSound: boolean; seconds: number }) => void = () => {};
  jest.mocked(soundInfo).mockImplementationOnce((() => new Promise((r) => { answer = r; })) as unknown as typeof soundInfo);
  st().select("a");
  const view = await render(<EditorToolbar />);
  await fireEvent.press((await tool("Voice")));
  await view.unmount();
  await act(async () => { answer({ hasSound: true, seconds: 4 }); await Promise.resolve(); });
  for (let i = 0; i < 6; i++) await act(async () => { await Promise.resolve(); });
  expect(openTool()).toBeNull();
  expect(toast()).toBeNull();
});

test("without the engine Voice and Sound say so and change nothing — on a clip and on a sound bar; Extract audio still works", async () => {
  jest.mocked(isSoundAvailable).mockReturnValue(false);
  st().select("a");
  await render(<EditorToolbar />);
  for (const name of ["Voice", "Sound"]) {
    await tap(name);
    expect(toast()).toBe(SOUND_UNAVAILABLE);
    expect(openTool()).toBeNull();
    expect(st().project!.audioTracks).toHaveLength(1);
    expect(st().past).toHaveLength(0);
    expect(st().selectedClipId).toBe("a");
    useToast.getState().clear();
  }
  await act(async () => { st().selectAudio("m"); });
  for (const name of ["Voice", "Sound"]) {
    await tap(name);
    expect(toast()).toBe(SOUND_UNAVAILABLE);
    expect(openTool()).toBeNull();
    useToast.getState().clear();
  }
  await act(async () => { st().select("a"); });
  await tap("Extract audio");
  expect(st().project!.audioTracks).toHaveLength(2);
  expect(st().project!.clips[0].muted).toBe(true);
  expect(soundInfo).not.toHaveBeenCalled();
});

test("a stored setting stays stored where the engine is missing", async () => {
  await act(async () => { st().apply((p) => setTrackSound(p, "m", { voice: "deep" })); });
  jest.mocked(isSoundAvailable).mockReturnValue(false);
  st().selectAudio("m");
  await render(<EditorToolbar />);
  await tap("Voice");
  expect(st().project!.audioTracks[0].sound).toEqual({ voice: "deep", strength: 0.5, pitch: 0, eq: null, level: false });
});

test("Voice on a duplicate that still has its sound: it gets a bar of its own (not the other clip's), and that is what it says", async () => {
  // "a" and its copy share one file and one range; "a" is extracted, the copy is not.
  await act(async () => {
    st().setProject(makeProject({ clips: [{ ...makeClip({ id: "a", sourceDuration: 4 }), muted: true }, { ...makeClip({ id: "copy", sourceDuration: 4 }), sourceUri: "file:///media/a.mp4" }],
      audioTracks: [makeAudioTrack({ id: "bar-a", sourceDuration: 4, sourceUri: "file:///media/a.mp4", kind: "sfx" })] }));
  });
  st().select("copy");
  await render(<EditorToolbar />);
  const { said, off } = listen();
  await tap("Voice");
  off();
  expect(st().project!.audioTracks.map((t) => [t.id, t.start])).toEqual([["bar-a", 0], ["new-track", 4]]);
  expect(st().project!.clips[1].muted).toBe(true);
  expect(useToolStrip.getState().open).toEqual({ id: "voice", key: "audio:new-track" });
  expect(said).toEqual([EXTRACT_MESSAGES.moved]);
});

test("Voice on a clip, and another clip is selected before the file has answered: nothing is made, nothing opens, nothing is said", async () => {
  let answer: (v: { hasSound: boolean; seconds: number }) => void = () => {};
  jest.mocked(soundInfo).mockImplementationOnce((() => new Promise((r) => { answer = r; })) as unknown as typeof soundInfo);
  st().select("a");
  await render(<EditorToolbar />);
  await fireEvent.press((await tool("Voice")));
  await act(async () => { st().select("b"); });
  await act(async () => { answer({ hasSound: true, seconds: 4 }); await Promise.resolve(); });
  for (let i = 0; i < 6; i++) await act(async () => { await Promise.resolve(); });
  expect(st().project!.audioTracks).toHaveLength(1);
  expect(st().project!.clips[0].muted).toBe(false);
  expect(st().past).toHaveLength(0);
  expect(st().selectedClipId).toBe("b");
  expect(openTool()).toBeNull();
  expect(toast()).toBeNull();
});
