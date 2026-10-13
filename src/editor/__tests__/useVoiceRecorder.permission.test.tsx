import { act, renderHook } from "@testing-library/react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
// The microphone is settled AT THE TAP, before any counting. The phone is mocked at the expo-audio boundary: `get…` reads (never an
// alert), `request…` is Apple's question. Every native call lands, in order, in `mockCalls`.
const mockCalls: string[] = [];
const mockRecorder = {
  currentTime: 0, uri: "file:///cache/rec.m4a" as string | null, isRecording: false,
  prepareToRecordAsync: jest.fn(async () => { mockCalls.push("prepare"); }),
  record: jest.fn(() => { mockCalls.push("record"); mockRecorder.isRecording = true; }),
  stop: jest.fn(async () => { mockCalls.push("stop"); mockRecorder.isRecording = false; }),
  getStatus: jest.fn((): Record<string, unknown> => ({ canRecord: true, isRecording: mockRecorder.isRecording, durationMillis: 0, mediaServicesDidReset: false, url: mockRecorder.uri })),
};
type Answer = { granted: boolean; status: string; canAskAgain: boolean };
const GRANTED: Answer = { granted: true, status: "granted", canAskAgain: true };
const NOT_ASKED: Answer = { granted: false, status: "undetermined", canAskAgain: true };
const DENIED: Answer = { granted: false, status: "denied", canAskAgain: false };
/** What the phone says now; Apple's alert (`request`) stays up until `mockAnswer` is called, and then the phone says that. */
let mockPhone: Answer = GRANTED;
let mockAnswer: ((a: Answer) => void) | null = null;
jest.mock("expo-audio", () => ({
  useAudioRecorder: jest.fn(() => mockRecorder),
  RecordingPresets: { HIGH_QUALITY: { extension: ".m4a" } },
  getRecordingPermissionsAsync: jest.fn(async () => { mockCalls.push("read"); return mockPhone; }),
  requestRecordingPermissionsAsync: jest.fn(() => { mockCalls.push("ask"); return new Promise<Answer>((resolve) => { mockAnswer = (a) => { mockPhone = a; mockAnswer = null; resolve(a); }; }); }),
  setAudioModeAsync: jest.fn(async () => { mockCalls.push("mode"); }),
}));
jest.mock("@/src/projects/audioInfo", () => ({ audioDuration: jest.fn(async () => { throw new Error("unreadable"); }) }));
jest.mock("@/src/projects", () => ({ storage: { importAudio: jest.fn() } }));
import { getRecordingPermissionsAsync, requestRecordingPermissionsAsync } from "expo-audio";
import { makeClip, makeProject } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { useVoiceLive } from "@/src/editor/voiceLive";
import { useToast } from "@/src/ui/Toast";
import { useVoiceRecorder } from "../useVoiceRecorder";

const read = getRecordingPermissionsAsync as jest.Mock;
const request = requestRecordingPermissionsAsync as jest.Mock;
const st = () => useEditorStore.getState();
const toast = () => useToast.getState().message;
const REFUSED = "Microphone access is needed to record.";
const mount = async (onDismiss?: () => void) => renderHook(() => useVoiceRecorder({ onDismiss }));
const tick = (ms: number) => act(async () => { await jest.advanceTimersByTimeAsync(ms); });
const answer = (a: Answer) => act(async () => { mockAnswer!(a); await jest.advanceTimersByTimeAsync(0); });
/** Nothing of a recording exists. */
const expectUntouched = () => {
  expect(mockCalls.filter((c) => c !== "read" && c !== "ask")).toEqual([]);
  expect(st()).toMatchObject({ recording: false, isPlaying: false });
  expect(useVoiceLive.getState().counting).toBe(false);
};

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  mockCalls.length = 0;
  mockPhone = GRANTED;
  mockAnswer = null;
  Object.assign(mockRecorder, { currentTime: 0, isRecording: false });
  useToast.getState().clear();
  useVoiceLive.getState().reset();
  st().reset();
  st().setProject(makeProject({ id: "p1", clips: [makeClip({ id: "a", sourceDuration: 60 })] }));
});
afterEach(() => { jest.useRealTimers(); });

test("already allowed: the countdown starts at the tap and the microphone is never asked for — not at the tap, not at the start", async () => {
  const { result: r } = await mount();
  await act(async () => { r.current.begin(); });
  expect(r.current).toMatchObject({ state: "counting", count: 3 });
  expect(mockCalls).toEqual(["read"]);
  await tick(3000);
  expect(r.current).toMatchObject({ state: "recording", count: 0 });
  expect(mockRecorder.record).toHaveBeenCalledTimes(1);
  expect(request).not.toHaveBeenCalled();
  expect(mockCalls.slice(-3)).toEqual(["mode", "prepare", "record"]);
  await act(async () => { await r.current.cancel(); });
});

test("not asked yet, then allowed: Apple's question at the tap with no number showing; the full 3, 2, 1 only after the yes; one start; asked exactly once", async () => {
  mockPhone = NOT_ASKED;
  const { result: r } = await mount();
  await act(async () => { r.current.begin(); });
  expect(mockCalls).toEqual(["read", "ask"]);
  expect(r.current).toMatchObject({ state: "starting", count: 0 });   // the button's disabled look, no countdown
  await tick(10_000);                                                  // however long the alert is up, nothing counts
  expect(r.current).toMatchObject({ state: "starting", count: 0 });
  expectUntouched();
  await answer(GRANTED);
  expect(r.current).toMatchObject({ state: "counting", count: 3 });
  expect(useVoiceLive.getState().counting).toBe(true);
  await tick(1000);
  expect(r.current.count).toBe(2);
  await tick(1000);
  expect(r.current.count).toBe(1);
  await tick(999);
  expect(mockRecorder.record).not.toHaveBeenCalled();
  await tick(1);
  expect(r.current).toMatchObject({ state: "recording", count: 0 });
  expect(st()).toMatchObject({ recording: true, isPlaying: true });
  await tick(5000);
  expect(mockRecorder.record).toHaveBeenCalledTimes(1);
  expect(request).toHaveBeenCalledTimes(1);
  expect(toast()).toBeNull();
  await act(async () => { await r.current.cancel(); });
});

test("not asked yet, then refused: no countdown, the refusal as it always was", async () => {
  mockPhone = NOT_ASKED;
  const onDismiss = jest.fn(() => { expect(toast()).toBeNull(); });   // the host closes before the toast shows
  const { result: r } = await mount(onDismiss);
  await act(async () => { r.current.begin(); });
  await answer(DENIED);
  expect(r.current).toMatchObject({ state: "idle", count: 0 });
  expect(toast()).toBe(REFUSED);
  expect(useToast.getState()).toMatchObject({ kind: null, undo: false });
  expect(onDismiss).toHaveBeenCalledTimes(1);
  await tick(5000);
  expect(r.current).toMatchObject({ state: "idle", count: 0 });
  expectUntouched();
  expect(request).toHaveBeenCalledTimes(1);
});

test("refused earlier: the refusal at once — no countdown and no question", async () => {
  mockPhone = DENIED;
  const { result: r } = await mount();
  await act(async () => { r.current.begin(); });
  expect(r.current).toMatchObject({ state: "idle", count: 0 });
  expect(toast()).toBe(REFUSED);
  await tick(5000);
  expectUntouched();
  expect(request).not.toHaveBeenCalled();
  expect(mockCalls).toEqual(["read"]);
});

test("the panel is closed while Apple's alert is up: the answer, when it comes, starts nothing and says nothing", async () => {
  mockPhone = NOT_ASKED;
  const onDismiss = jest.fn();
  const view = await mount(onDismiss);
  await act(async () => { view.result.current.begin(); });
  expect(mockCalls).toEqual(["read", "ask"]);
  await view.unmount();
  await answer(GRANTED);
  await tick(10_000);
  expectUntouched();
  expect(toast()).toBeNull();
  expect(onDismiss).not.toHaveBeenCalled();
});

test("closed while the alert is up, then refused: no message for a panel that is gone", async () => {
  mockPhone = NOT_ASKED;
  const view = await mount();
  await act(async () => { view.result.current.begin(); });
  await view.unmount();
  await answer(DENIED);
  await tick(5000);
  expectUntouched();
  expect(toast()).toBeNull();
});

test("taps while the question is up do nothing: one question, one countdown, one start", async () => {
  mockPhone = NOT_ASKED;
  const { result: r } = await mount();
  await act(async () => { r.current.begin(); r.current.begin(); });
  await act(async () => { r.current.begin(); void r.current.start(); r.current.cancelCount(); });
  expect(r.current).toMatchObject({ state: "starting", count: 0 });
  expect(request).toHaveBeenCalledTimes(1);
  expect(read).toHaveBeenCalledTimes(1);
  await answer(GRANTED);
  expect(r.current).toMatchObject({ state: "counting", count: 3 });
  await tick(3000);
  expect(r.current.state).toBe("recording");
  await tick(5000);
  expect(mockRecorder.record).toHaveBeenCalledTimes(1);
  expect(request).toHaveBeenCalledTimes(1);
  await act(async () => { await r.current.cancel(); });
});

test("two taps before the phone has even answered the read: one flow", async () => {
  const { result: r } = await mount();
  await act(async () => { r.current.begin(); r.current.begin(); r.current.begin(); });
  expect(read).toHaveBeenCalledTimes(1);
  expect(r.current).toMatchObject({ state: "counting", count: 3 });
  await tick(8000);
  expect(mockRecorder.record).toHaveBeenCalledTimes(1);
  await act(async () => { await r.current.cancel(); });
});

test("taken away in Settings during the countdown: the start reads, does not ask, and refuses as a denied microphone always did", async () => {
  const { result: r } = await mount();
  await act(async () => { r.current.begin(); });
  await tick(2000);
  mockPhone = DENIED;
  await tick(1000);
  expect(r.current).toMatchObject({ state: "idle", count: 0 });
  expect(toast()).toBe(REFUSED);
  expect(request).not.toHaveBeenCalled();
  expectUntouched();
});

test("the instant refusals come before any look at the microphone", async () => {
  st().setProject(makeProject({ id: "p2", clips: [] }));
  const { result: r } = await mount();
  await act(async () => { r.current.begin(); });
  expect(toast()).toBe("Add a clip before recording.");
  expect(mockCalls).toEqual([]);
  expect(r.current.state).toBe("idle");
});

test("a phone that cannot say (the read fails) is asked at the tap, as the start used to ask — and the start goes on without a second question", async () => {
  read.mockRejectedValue(new Error("no such call"));
  const { result: r } = await mount();
  await act(async () => { r.current.begin(); });
  expect(request).toHaveBeenCalledTimes(1);
  expect(r.current).toMatchObject({ state: "starting", count: 0 });
  await answer(GRANTED);
  expect(r.current).toMatchObject({ state: "counting", count: 3 });
  await tick(3000);
  expect(r.current.state).toBe("recording");
  expect(request).toHaveBeenCalledTimes(1);
  await act(async () => { await r.current.cancel(); });
});
