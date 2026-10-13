import { act, renderHook } from "@testing-library/react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
const mockCalls: unknown[][] = [];
const mockRecorder = {
  currentTime: 0, uri: "file:///cache/rec.m4a" as string | null, isRecording: false, metering: undefined as number | undefined,
  prepareToRecordAsync: jest.fn(async () => { mockCalls.push(["prepare"]); }),
  record: jest.fn(() => { mockCalls.push(["record"]); mockRecorder.isRecording = true; }),
  stop: jest.fn(async () => { mockCalls.push(["stop"]); mockRecorder.isRecording = false; }),
  getStatus: jest.fn((): Record<string, unknown> => ({ canRecord: true, isRecording: mockRecorder.isRecording, durationMillis: 0, mediaServicesDidReset: false, url: mockRecorder.uri, ...(mockRecorder.metering === undefined ? {} : { metering: mockRecorder.metering }) })),
};
jest.mock("expo-audio", () => ({
  useAudioRecorder: jest.fn(() => mockRecorder),
  // The installed preset, field for field (node_modules/expo-audio/build/RecordingConstants.js): the second test below holds this to the package.
  RecordingPresets: { HIGH_QUALITY: { extension: ".m4a", sampleRate: 44100, numberOfChannels: 2, bitRate: 128000, android: { outputFormat: "mpeg4", audioEncoder: "aac" },
    ios: { outputFormat: "aac ", audioQuality: 127, linearPCMBitDepth: 16, linearPCMIsBigEndian: false, linearPCMIsFloat: false }, web: { mimeType: "audio/webm", bitsPerSecond: 128000 } } },
  requestRecordingPermissionsAsync: jest.fn(async () => { mockCalls.push(["permission"]); return { granted: true, status: "granted" }; }),
  setAudioModeAsync: jest.fn(async (mode: unknown) => { mockCalls.push(["mode", mode]); }),
}));
jest.mock("@/src/projects/audioInfo", () => ({ audioDuration: jest.fn(async () => { throw new Error("unreadable"); }) }));
jest.mock("@/src/projects", () => ({ storage: { importAudio: jest.fn() } }));
import { RecordingPresets, useAudioRecorder } from "expo-audio";
import { RECORDING_AUDIO_MODE } from "@/src/editor/audioMode";
import { AUDIO_LIMITS, makeAudioTrack, makeClip, makeProject } from "@/src/editor/model/types";
import { VOICE_LEVEL } from "@/src/editor/model/voiceLevel";
import { useEditorStore } from "@/src/editor/store";
import { useVoiceLive } from "@/src/editor/voiceLive";
import { useToast } from "@/src/ui/Toast";
import { useVoiceRecorder, VOICE_RECORDING_OPTIONS } from "../useVoiceRecorder";

const st = () => useEditorStore.getState();
const live = () => { const { counting, bars, quiet } = useVoiceLive.getState(); return { counting, bars, quiet }; };
const REST = { counting: false, bars: 0, quiet: false };
const mount = async () => renderHook(() => useVoiceRecorder());
const tick = (ms: number) => act(async () => { await jest.advanceTimersByTimeAsync(ms); });
const START = [["permission"], ["mode", RECORDING_AUDIO_MODE], ["prepare"], ["record"]];

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  mockCalls.length = 0;
  Object.assign(mockRecorder, { currentTime: 0, isRecording: false, metering: undefined });
  useToast.getState().clear();
  st().reset();
  st().setProject(makeProject({ id: "p1", clips: [makeClip({ id: "a", sourceDuration: 60 })] }));
});
afterEach(() => { jest.useRealTimers(); });

describe("the recording options", () => {
  test("the installed HIGH_QUALITY preset with metering switched on — every field that decides the FILE is the preset's own", async () => {
    const { isMeteringEnabled, ...file } = VOICE_RECORDING_OPTIONS;
    expect(isMeteringEnabled).toBe(true);
    expect(file).toEqual(RecordingPresets.HIGH_QUALITY);
    expect(Object.keys(VOICE_RECORDING_OPTIONS).sort()).toEqual([...Object.keys(RecordingPresets.HIGH_QUALITY), "isMeteringEnabled"].sort());
    await mount();
    expect(useAudioRecorder).toHaveBeenCalledWith(VOICE_RECORDING_OPTIONS);
  });

  test("the real package's preset is what the mock above says (so the pin is about the shipped format)", () => {
    const real = jest.requireActual<{ RecordingPresets: { HIGH_QUALITY: unknown } }>("expo-audio/build/RecordingConstants").RecordingPresets.HIGH_QUALITY;
    expect(RecordingPresets.HIGH_QUALITY).toEqual(real);
  });
});

describe("the countdown", () => {
  test("begin: 3, 2, 1 a second apart — nothing of the start happens meanwhile — then today's start, once", async () => {
    const { result: r } = await mount();
    await act(async () => { r.current.begin(); });
    expect(r.current).toMatchObject({ state: "counting", count: 3, elapsed: 0 });
    expect(live().counting).toBe(true);
    await tick(999);
    expect(r.current.count).toBe(3);
    await tick(1);
    expect(r.current).toMatchObject({ state: "counting", count: 2 });
    await tick(1000);
    expect(r.current).toMatchObject({ state: "counting", count: 1 });
    await tick(999);
    expect(mockCalls).toEqual([]);
    expect(st()).toMatchObject({ recording: false, isPlaying: false });
    await tick(1);
    expect(mockCalls).toEqual(START);
    expect(r.current).toMatchObject({ state: "recording", count: 0 });
    expect(st()).toMatchObject({ recording: true, isPlaying: true });
    expect(live().counting).toBe(false);
    await tick(5000);
    expect(mockRecorder.record).toHaveBeenCalledTimes(1);
    await act(async () => { await r.current.cancel(); });
  });

  test("a second begin while counting starts no second countdown", async () => {
    const { result: r } = await mount();
    await act(async () => { r.current.begin(); });
    await tick(500);
    await act(async () => { r.current.begin(); r.current.begin(); });
    expect(r.current.count).toBe(3);
    await tick(500);
    expect(r.current.count).toBe(2);
    await tick(2000);
    expect(mockCalls).toEqual(START);
    await tick(4000);
    expect(mockRecorder.record).toHaveBeenCalledTimes(1);
    await act(async () => { await r.current.cancel(); });
  });

  test("cancelCount: back to idle, nothing started, no message — and the next begin counts from 3 again", async () => {
    const { result: r } = await mount();
    await act(async () => { r.current.begin(); });
    await tick(1500);
    await act(async () => { r.current.cancelCount(); });
    expect(r.current).toMatchObject({ state: "idle", count: 0, elapsed: 0 });
    expect(live()).toEqual(REST);
    await tick(10000);
    expect(mockCalls).toEqual([]);
    expect(st()).toMatchObject({ recording: false, isPlaying: false });
    expect(useToast.getState().message).toBeNull();
    await act(async () => { r.current.begin(); });
    expect(r.current).toMatchObject({ state: "counting", count: 3 });
    await tick(3000);
    expect(mockCalls).toEqual(START);
    await act(async () => { await r.current.cancel(); });
  });

  test("cancelCount outside the countdown does nothing (idle, recording)", async () => {
    const { result: r } = await mount();
    await act(async () => { r.current.cancelCount(); });
    expect(r.current.state).toBe("idle");
    await act(async () => { await r.current.start(); });
    await act(async () => { r.current.cancelCount(); });
    expect(r.current.state).toBe("recording");
    expect(mockRecorder.stop).not.toHaveBeenCalled();
    await act(async () => { await r.current.cancel(); });
  });

  test("unmount while counting: the countdown is gone, nothing ever starts", async () => {
    const { result: r, unmount } = await mount();
    await act(async () => { r.current.begin(); });
    await tick(2500);
    await unmount();
    expect(live()).toEqual(REST);
    await tick(10000);
    expect(mockCalls).toEqual([]);
    expect(st()).toMatchObject({ recording: false, isPlaying: false });
  });

  test("what would be refused is refused at the tap, before any counting: no clip, a full track list", async () => {
    st().setProject(makeProject({ id: "p1" }));
    const { result: r } = await mount();
    await act(async () => { r.current.begin(); });
    expect(useToast.getState().message).toBe("Add a clip before recording.");
    expect(r.current.state).toBe("idle");
    expect(live().counting).toBe(false);
    useToast.getState().clear();
    st().setProject(makeProject({ id: "p1", clips: [makeClip({ id: "a", sourceDuration: 10 })], audioTracks: Array.from({ length: AUDIO_LIMITS.maxTracks }, (_, i) => makeAudioTrack({ id: `x${i}`, sourceDuration: 5 })) }));
    await act(async () => { r.current.begin(); });
    expect(useToast.getState().message).toBe("You've reached the audio track limit.");
    expect(r.current.state).toBe("idle");
    await tick(5000);
    expect(mockCalls).toEqual([]);
  });

  test("begin does nothing while recording; start() itself is still the immediate start", async () => {
    const { result: r } = await mount();
    await act(async () => { await r.current.start(); });
    expect(mockCalls).toEqual(START);
    await act(async () => { r.current.begin(); });
    expect(r.current).toMatchObject({ state: "recording", count: 0 });
    expect(live().counting).toBe(false);
    await act(async () => { await r.current.cancel(); });
  });

  test("start() during the countdown does not jump the queue", async () => {
    const { result: r } = await mount();
    await act(async () => { r.current.begin(); });
    await act(async () => { await r.current.start(); });
    expect(mockCalls).toEqual([]);
    expect(r.current.state).toBe("counting");
    await act(async () => { r.current.cancelCount(); });
  });
});

describe("the level", () => {
  const status = mockRecorder.getStatus.getMockImplementation()!;
  const record = async () => { const m = await mount(); await act(async () => { await m.result.current.start(); }); return m; };

  test("read from the recorder's status every 100 ms while recording, as bars; never before, never after", async () => {
    mockRecorder.metering = -27.5;
    const { result: r } = await mount();
    await tick(1000);
    expect(mockRecorder.getStatus).not.toHaveBeenCalled();
    await act(async () => { r.current.begin(); });
    await tick(2999);
    expect(mockRecorder.getStatus).not.toHaveBeenCalled();
    expect(live().bars).toBe(0);
    await tick(1);
    expect(r.current.state).toBe("recording");
    await tick(VOICE_LEVEL.sampleMs);
    expect(live()).toEqual({ counting: false, bars: 4, quiet: false });
    mockRecorder.metering = -5;
    await tick(VOICE_LEVEL.sampleMs);
    expect(live().bars).toBe(8);
    const reads = mockRecorder.getStatus.mock.calls.length;
    await tick(1000);
    expect(mockRecorder.getStatus.mock.calls.length - reads).toBe(10);          // 10 a second, no more
    await act(async () => { await r.current.cancel(); });
    expect(live()).toEqual(REST);
    const after = mockRecorder.getStatus.mock.calls.length;
    await tick(2000);
    expect(mockRecorder.getStatus.mock.calls.length).toBe(after);
  });

  test("too quiet: 3 s without a bar from the start of the recording; heard again, it goes at once; and it can come back", async () => {
    mockRecorder.metering = -90;
    const { result: r } = await record();
    await tick(2900);
    expect(live()).toEqual({ counting: false, bars: 0, quiet: false });
    await tick(100);
    expect(live().quiet).toBe(true);
    mockRecorder.metering = -20;
    await tick(100);
    expect(live()).toEqual({ counting: false, bars: 5, quiet: false });
    mockRecorder.metering = -90;
    await tick(3000);
    expect(live().quiet).toBe(false);
    await tick(100);
    expect(live().quiet).toBe(true);
    await act(async () => { await r.current.cancel(); });
    expect(live()).toEqual(REST);
  });

  test("a recorder that reports no level (no metering in its status) lights nothing and is never called too quiet", async () => {
    const { result: r } = await record();
    await tick(6000);
    expect(live()).toEqual(REST);
    await act(async () => { await r.current.cancel(); });
  });

  test("a status that throws (a released recorder) is ignored", async () => {
    mockRecorder.metering = -20;
    const { result: r } = await record();
    await tick(100);
    expect(live().bars).toBe(5);
    mockRecorder.getStatus.mockImplementation(() => { throw new Error("released"); });
    await tick(500);
    expect(live().bars).toBe(5);
    mockRecorder.getStatus.mockImplementation(status);
    await act(async () => { await r.current.cancel(); });
  });

  test("unmount while recording puts the level back to nothing", async () => {
    mockRecorder.metering = -5;
    const { unmount } = await record();
    await tick(100);
    expect(live().bars).toBe(8);
    await unmount();
    expect(live()).toEqual(REST);
    await tick(1000);
    expect(live()).toEqual(REST);
  });

  test("the hook's own consumer is not drawn again for a level: only the elapsed tick does that", async () => {
    mockRecorder.metering = -27.5;
    let renders = 0;
    const { result: r } = await renderHook(() => { renders++; return useVoiceRecorder(); });
    await act(async () => { await r.current.start(); });
    const before = renders;
    await tick(100);                       // one level sample, before the first 200-ms elapsed tick
    expect(live().bars).toBe(4);
    expect(renders).toBe(before);
    await act(async () => { await r.current.cancel(); });
  });
});
