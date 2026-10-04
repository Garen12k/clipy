import { act, renderHook } from "@testing-library/react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
// The recorder, mocked at the expo-audio boundary: every native call lands, in order, in `mockCalls`.
const mockCalls: unknown[][] = [];
type MockRecorder = { currentTime: number; uri: string | null; isRecording: boolean; durationMillis: number; prepareToRecordAsync: jest.Mock; record: jest.Mock; stop: jest.Mock; getStatus: jest.Mock };
const mockRecorder: MockRecorder = {
  currentTime: 0, uri: "file:///cache/rec.m4a", isRecording: false, durationMillis: 0,
  prepareToRecordAsync: jest.fn(async () => { mockCalls.push(["prepare"]); }),
  record: jest.fn(() => { mockCalls.push(["record"]); mockRecorder.isRecording = true; }),
  stop: jest.fn(async () => { mockCalls.push(["stop"]); mockRecorder.isRecording = false; }),
  getStatus: jest.fn(() => ({ canRecord: true, isRecording: mockRecorder.isRecording, durationMillis: mockRecorder.durationMillis, mediaServicesDidReset: false, url: mockRecorder.uri })),
};
jest.mock("expo-audio", () => ({
  useAudioRecorder: jest.fn(() => mockRecorder),
  RecordingPresets: { HIGH_QUALITY: { extension: ".m4a" } },
  requestRecordingPermissionsAsync: jest.fn(async () => { mockCalls.push(["permission"]); return { granted: true, status: "granted" }; }),
  setAudioModeAsync: jest.fn(async (mode: unknown) => { mockCalls.push(["mode", mode]); }),
}));
let mockN = 0;
jest.mock("@/src/projects", () => ({ storage: { importAudio: jest.fn(async (_id: string, a: { uri: string; title: string; durationSec: number }, kind: string = "music") => ({ id: `v${++mockN}`, sourceUri: `file:///p/v${mockN}.m4a`, title: a.title, sourceDuration: a.durationSec, start: 0, trimStart: 0, trimEnd: a.durationSec, volume: 1, kind, fadeIn: 0, fadeOut: 0 })) } }));
import { requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder } from "expo-audio";
import { PLAYBACK_AUDIO_MODE, RECORDING_AUDIO_MODE } from "@/src/editor/audioMode";
import { AUDIO_LIMITS, makeAudioTrack, makeClip, makeProject } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { storage } from "@/src/projects";
import { useToast } from "@/src/ui/Toast";
import { useVoiceRecorder } from "../useVoiceRecorder";

const importAudio = storage.importAudio as jest.Mock;
const permission = requestRecordingPermissionsAsync as jest.Mock;
const setMode = setAudioModeAsync as jest.Mock;
const st = () => useEditorStore.getState();
const toast = () => useToast.getState().message;
const lastMode = () => setMode.mock.calls[setMode.mock.calls.length - 1]?.[0];
const mount = async (onDismiss?: () => void) => (await renderHook(() => useVoiceRecorder({ onDismiss }))).result;
/** The app is back to normal: nothing recording, preview sound on, playback stopped, audio session in its playback mode. */
const expectRestored = () => {
  expect(st().recording).toBe(false);
  expect(st().isPlaying).toBe(false);
  expect(lastMode()).toEqual(PLAYBACK_AUDIO_MODE);
};

beforeEach(() => {
  jest.clearAllMocks();
  mockCalls.length = 0; mockN = 0;
  Object.assign(mockRecorder, { currentTime: 0, uri: "file:///cache/rec.m4a", isRecording: false, durationMillis: 0 });
  useToast.getState().clear();
  st().reset();
  st().setProject(makeProject({ id: "p1", clips: [makeClip({ id: "a", sourceDuration: 10 })] }));
});

test("the audio modes: playback is what the preview sets; recording is the same with recording allowed", () => {
  expect(PLAYBACK_AUDIO_MODE).toEqual({ interruptionMode: "mixWithOthers", playsInSilentMode: true });
  expect(RECORDING_AUDIO_MODE).toEqual({ interruptionMode: "mixWithOthers", playsInSilentMode: true, allowsRecording: true });
});

test("permission denied: a toast, nothing is touched, state stays idle", async () => {
  permission.mockResolvedValueOnce({ granted: false, status: "denied" });
  const onDismiss = jest.fn(() => { expect(toast()).toBeNull(); });   // the host closes before the toast shows
  const r = await mount(onDismiss);
  await act(async () => { await r.current.start(); });
  expect(toast()).toBe("Microphone access is needed to record.");
  expect(onDismiss).toHaveBeenCalledTimes(1);
  expect(r.current.state).toBe("idle");
  expect(st().recording).toBe(false);
  expect(st().isPlaying).toBe(false);
  expect(setMode).not.toHaveBeenCalled();
  expect(mockRecorder.record).not.toHaveBeenCalled();
});

test("start: permission, mute flag, recording mode, prepare, record, then playback — in that order", async () => {
  const seen: { recording: boolean; isPlaying: boolean }[] = [];
  mockRecorder.record.mockImplementationOnce(() => { mockCalls.push(["record"]); seen.push({ recording: st().recording, isPlaying: st().isPlaying }); });
  const r = await mount();
  expect(useAudioRecorder).toHaveBeenCalledWith({ extension: ".m4a" });
  await act(async () => { await r.current.start(); });
  expect(mockCalls).toEqual([["permission"], ["mode", RECORDING_AUDIO_MODE], ["prepare"], ["record"]]);
  expect(seen).toEqual([{ recording: true, isPlaying: false }]);   // muted before the recorder runs; playback starts after it
  expect(st().recording).toBe(true);
  expect(st().isPlaying).toBe(true);
  expect(r.current.state).toBe("recording");
  await act(async () => { await r.current.cancel(); });
});

test("stop: the track lands where recording began with the recorder's duration, selected, in one undo step; everything restored", async () => {
  const onDismiss = jest.fn();
  const r = await mount(onDismiss);
  st().seek(2);
  await act(async () => { await r.current.start(); });
  await act(() => { st().seek(5.2); });   // playback moved on
  mockRecorder.currentTime = 3.2;
  mockCalls.length = 0;
  await act(async () => { await r.current.stop(); });
  expect(mockCalls).toEqual([["stop"], ["mode", PLAYBACK_AUDIO_MODE]]);
  expectRestored();
  expect(importAudio).toHaveBeenCalledWith("p1", { uri: "file:///cache/rec.m4a", title: "Voice-over", durationSec: 3.2 }, "voice");
  expect(st().project!.audioTracks).toHaveLength(1);
  expect(st().project!.audioTracks[0]).toMatchObject({ id: "v1", kind: "voice", title: "Voice-over", start: 2, trimStart: 0, trimEnd: 3.2, sourceDuration: 3.2 });
  expect(st().past).toHaveLength(1);
  expect(st().selectedAudioId).toBe("v1");
  expect(onDismiss).toHaveBeenCalledTimes(1);
  expect(toast()).toBeNull();
  expect(r.current.state).toBe("idle");
});

test("the recorder's status duration is used when it has no current time; the wall clock when it reports nothing", async () => {
  const now = jest.spyOn(Date, "now");
  try {
    now.mockReturnValue(1_000_000);
    const r = await mount();
    await act(async () => { await r.current.start(); });
    mockRecorder.durationMillis = 1500;
    await act(async () => { await r.current.stop(); });
    expect(importAudio).toHaveBeenLastCalledWith("p1", expect.objectContaining({ durationSec: 1.5 }), "voice");

    await act(async () => { st().seek(0); await r.current.start(); });
    mockRecorder.durationMillis = 0;
    now.mockReturnValue(1_002_500);
    await act(async () => { await r.current.stop(); });
    expect(importAudio).toHaveBeenLastCalledWith("p1", expect.objectContaining({ durationSec: 2.5 }), "voice");
  } finally { now.mockRestore(); }
});

test("a playhead at the project's end rewinds: recording starts at 0", async () => {
  const r = await mount();
  st().seek(10);
  await act(async () => { await r.current.start(); });
  expect(st().playhead).toBe(0);
  mockRecorder.currentTime = 1;
  await act(async () => { await r.current.stop(); });
  expect(st().project!.audioTracks[0]).toMatchObject({ start: 0 });
});

test("a recording shorter than the minimum is discarded with a toast, and everything is restored", async () => {
  const onDismiss = jest.fn();
  const r = await mount(onDismiss);
  await act(async () => { await r.current.start(); });
  mockRecorder.currentTime = AUDIO_LIMITS.minDuration - 0.1;
  await act(async () => { await r.current.stop(); });
  expect(toast()).toBe("That recording was too short.");
  expect(onDismiss).toHaveBeenCalledTimes(1);
  expect(importAudio).not.toHaveBeenCalled();
  expect(st().project!.audioTracks).toEqual([]);
  expect(st().past).toHaveLength(0);
  expectRestored();
  expect(r.current.state).toBe("idle");
});

test("an error while starting restores the mode and clears the flag", async () => {
  const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  mockRecorder.prepareToRecordAsync.mockRejectedValueOnce(new Error("no mic"));
  const r = await mount();
  await act(async () => { await r.current.start(); });
  expect(toast()).toBe("Couldn't start recording.");
  expectRestored();
  expect(r.current.state).toBe("idle");
  // …and it can be tried again.
  await act(async () => { await r.current.start(); });
  expect(r.current.state).toBe("recording");
  await act(async () => { await r.current.cancel(); });
  warn.mockRestore();
});

test("an error while stopping restores the mode and clears the flag", async () => {
  const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  const r = await mount();
  await act(async () => { await r.current.start(); });
  mockRecorder.currentTime = 3;
  mockRecorder.stop.mockRejectedValueOnce(new Error("released"));
  await act(async () => { await r.current.stop(); });
  expect(toast()).toBe("Couldn't save that recording.");
  expect(importAudio).not.toHaveBeenCalled();
  expectRestored();
  expect(r.current.state).toBe("idle");
  warn.mockRestore();
});

test("an import that fails is a toast; the mode was already restored", async () => {
  const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  importAudio.mockRejectedValueOnce(new Error("disk full"));
  const r = await mount();
  await act(async () => { await r.current.start(); });
  mockRecorder.currentTime = 3;
  await act(async () => { await r.current.stop(); });
  expect(toast()).toBe("Couldn't save that recording.");
  expect(st().project!.audioTracks).toEqual([]);
  expectRestored();
  expect(r.current.state).toBe("idle");
  warn.mockRestore();
});

test("unmount while recording: the recorder is stopped (even if already released), the flag cleared, the mode restored, nothing saved", async () => {
  const view = await renderHook(() => useVoiceRecorder());
  await act(async () => { await view.result.current.start(); });
  mockRecorder.stop.mockImplementationOnce(() => { throw new Error("released"); });
  await act(async () => { await view.unmount(); });
  expect(mockRecorder.stop).toHaveBeenCalledTimes(1);
  expectRestored();
  expect(importAudio).not.toHaveBeenCalled();
});

test("unmount while idle touches nothing", async () => {
  const view = await renderHook(() => useVoiceRecorder());
  await act(async () => { await view.unmount(); });
  expect(mockRecorder.stop).not.toHaveBeenCalled();
  expect(setMode).not.toHaveBeenCalled();
});

test("playback reaching the project's end stops and saves the recording, once", async () => {
  const r = await mount();
  st().seek(4);
  await act(async () => { await r.current.start(); });
  mockRecorder.currentTime = 6;
  await act(async () => { st().seek(10); st().setPlaying(false); });   // what the preview does at the end
  expect(mockRecorder.stop).toHaveBeenCalledTimes(1);
  expect(importAudio).toHaveBeenCalledTimes(1);
  expect(st().project!.audioTracks[0]).toMatchObject({ kind: "voice", start: 4, trimEnd: 6 });
  expectRestored();
  expect(r.current.state).toBe("idle");
  // A later stop() is a no-op.
  await act(async () => { await r.current.stop(); });
  expect(importAudio).toHaveBeenCalledTimes(1);
});

test("start and stop ignore re-entry", async () => {
  const r = await mount();
  await act(async () => { await Promise.all([r.current.start(), r.current.start()]); });
  expect(mockRecorder.record).toHaveBeenCalledTimes(1);
  mockRecorder.currentTime = 2;
  await act(async () => { await Promise.all([r.current.stop(), r.current.stop()]); });
  expect(mockRecorder.stop).toHaveBeenCalledTimes(1);
  expect(st().project!.audioTracks).toHaveLength(1);
});

test("at the track limit recording does not start", async () => {
  st().apply((p) => ({ ...p, audioTracks: Array.from({ length: AUDIO_LIMITS.maxTracks }, (_, i) => makeAudioTrack({ id: `x${i}`, sourceDuration: 5 })) }));
  const r = await mount();
  await act(async () => { await r.current.start(); });
  expect(toast()).toBe("You've reached the audio track limit.");
  expect(permission).not.toHaveBeenCalled();
  expect(st().recording).toBe(false);
  expect(r.current.state).toBe("idle");
});

test("a limit reached while recording is refused with the toast", async () => {
  const r = await mount();
  await act(async () => { await r.current.start(); });
  mockRecorder.currentTime = 2;
  await act(() => { st().apply((p) => ({ ...p, audioTracks: Array.from({ length: AUDIO_LIMITS.maxTracks }, (_, i) => makeAudioTrack({ id: `x${i}`, sourceDuration: 5 })) })); });
  await act(async () => { await r.current.stop(); });
  expect(toast()).toBe("You've reached the audio track limit.");
  expect(st().project!.audioTracks).toHaveLength(AUDIO_LIMITS.maxTracks);
  expect(st().selectedAudioId).toBeNull();
  expectRestored();
});

test("a project that changed while the file was being saved drops the result silently", async () => {
  const onDismiss = jest.fn();
  const r = await mount(onDismiss);
  await act(async () => { await r.current.start(); });
  mockRecorder.currentTime = 2;
  importAudio.mockImplementationOnce(async () => {
    st().setProject(makeProject({ id: "p2", clips: [makeClip({ id: "z", sourceDuration: 3 })] }));
    return makeAudioTrack({ id: "late", sourceDuration: 2, kind: "voice" });
  });
  await act(async () => { await r.current.stop(); });
  expect(st().project!.id).toBe("p2");
  expect(st().project!.audioTracks).toEqual([]);
  expect(toast()).toBeNull();
  expect(onDismiss).not.toHaveBeenCalled();
  expect(st().recording).toBe(false);
  expect(r.current.state).toBe("idle");
});

test("cancel stops without saving and restores everything", async () => {
  const r = await mount();
  await act(async () => { await r.current.start(); });
  mockRecorder.currentTime = 4;
  await act(async () => { await r.current.cancel(); });
  expect(mockRecorder.stop).toHaveBeenCalledTimes(1);
  expect(importAudio).not.toHaveBeenCalled();
  expectRestored();
  expect(r.current.state).toBe("idle");
});

test("elapsed counts up every 200 ms while recording and stops afterwards", async () => {
  jest.useFakeTimers();
  try {
    const r = await mount();
    await act(async () => { await r.current.start(); });
    expect(r.current.elapsed).toBe(0);
    await act(async () => { jest.advanceTimersByTime(1000); });
    expect(r.current.elapsed).toBeCloseTo(1, 1);
    await act(async () => { await r.current.cancel(); });
    const after = r.current.elapsed;
    await act(async () => { jest.advanceTimersByTime(1000); });
    expect(r.current.elapsed).toBe(after);
  } finally { jest.useRealTimers(); }
});

test("without a clip there is nothing to play along to", async () => {
  st().setProject(makeProject({ id: "p1" }));
  const r = await mount();
  await act(async () => { await r.current.start(); });
  expect(toast()).toBe("Add a clip before recording.");
  expect(permission).not.toHaveBeenCalled();
  expect(r.current.state).toBe("idle");
});
