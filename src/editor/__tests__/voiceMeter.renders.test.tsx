import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
jest.mock("expo-document-picker", () => ({ getDocumentAsync: jest.fn() }));
// The REAL Add audio panel, Record tab and recorder hook: only the native boundary is mocked. Each hook below is called once per
// render of the component that owns it, so its call count IS that component's render count:
// `useAudioPlayer` — the panel (AddAudioSheet); `useAudioRecorder` — the Record tab (through useVoiceRecorder).
const mockRenders = { panel: 0, tab: 0 };
const mockPlayer = { play: jest.fn(), pause: jest.fn(), playing: false, replace: jest.fn() };
const mockRecorder = {
  currentTime: 0, uri: "file:///cache/rec.m4a", metering: undefined as number | undefined,
  prepareToRecordAsync: jest.fn(async () => {}), record: jest.fn(), stop: jest.fn(async () => {}),
  getStatus: jest.fn((): Record<string, unknown> => ({ durationMillis: 0, ...(mockRecorder.metering === undefined ? {} : { metering: mockRecorder.metering }) })),
};
jest.mock("expo-audio", () => ({
  useAudioPlayer: () => { mockRenders.panel++; return mockPlayer; }, createAudioPlayer: jest.fn(),
  useAudioRecorder: () => { mockRenders.tab++; return mockRecorder; }, RecordingPresets: { HIGH_QUALITY: {} },
  requestRecordingPermissionsAsync: jest.fn(async () => ({ granted: true })), setAudioModeAsync: jest.fn(async () => {}),
}));
jest.mock("expo-asset", () => ({ Asset: { fromModule: (file: number) => ({ downloadAsync: async () => {}, localUri: `file:///bundled/${file}.wav`, uri: `file:///bundled/${file}.wav` }) } }));
jest.mock("@/src/editor/music", () => ({ BUNDLED_TRACKS: [{ id: "t1", title: "Sunny Loop", durationSec: 30, license: "CC0", source: "https://x", file: 1 }] }));
jest.mock("@/src/projects", () => ({ storage: { importAudio: jest.fn() } }));
jest.mock("@/src/projects/audioInfo", () => ({ audioDuration: jest.fn(async () => 12) }));
import { makeClip, makeProject } from "@/src/editor/model/types";
import { VOICE_LEVEL } from "@/src/editor/model/voiceLevel";
import { useEditorStore } from "@/src/editor/store";
import { theme } from "@/src/theme/theme";
import { useToast } from "@/src/ui/Toast";
import { AddAudioSheet } from "../components/AddAudioSheet";
import { closeStrip } from "../toolStrip";
import { useVoiceLive } from "../voiceLive";

const btn = (name: string) => screen.getByRole("button", { name });
const st = () => useEditorStore.getState();
const tick = (ms: number) => act(async () => { await jest.advanceTimersByTimeAsync(ms); });
const litBars = () => screen.queryAllByTestId(/^voice-meter-bar-/, { includeHiddenElements: true }).filter((b) => StyleSheet.flatten(b.props.style).backgroundColor === theme.colors.text).length;
const openRecord = async (onClose: () => void = () => {}) => { await render(<AddAudioSheet visible onClose={onClose} />); await fireEvent.press(btn("Record")); };

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  mockRecorder.metering = undefined;
  useToast.getState().clear();
  closeStrip();
  useVoiceLive.getState().reset();
  st().reset();
  st().setProject(makeProject({ id: "p1", clips: [makeClip({ id: "a", sourceDuration: 60 })] }));
});
afterEach(() => { jest.useRealTimers(); });

test("the whole way on the real panel: tap, 3, 2, 1, recording — and the video does not start before the 1 is over", async () => {
  await openRecord();
  await fireEvent.press(btn("Start recording"));
  expect(screen.getByText("3")).toBeTruthy();
  expect(screen.getByText("Get ready")).toBeTruthy();
  expect(btn("Cancel countdown")).toBeEnabled();
  await tick(1000);
  expect(screen.getByText("2")).toBeTruthy();
  await tick(1000);
  expect(screen.getByText("1")).toBeTruthy();
  await tick(999);
  expect(st()).toMatchObject({ recording: false, isPlaying: false });
  expect(mockRecorder.record).not.toHaveBeenCalled();
  await tick(1);
  expect(btn("Stop recording")).toBeEnabled();
  expect(screen.getByText("Recording…")).toBeTruthy();
  expect(st()).toMatchObject({ recording: true, isPlaying: true });
  expect(mockRecorder.record).toHaveBeenCalledTimes(1);
});

test("a tap during the countdown cancels it: idle again, nothing recorded, the video never started, no message, the panel still open", async () => {
  const onClose = jest.fn();
  await openRecord(onClose);
  await fireEvent.press(btn("Start recording"));
  await tick(1400);
  await fireEvent.press(btn("Cancel countdown"));
  expect(btn("Start recording")).toBeEnabled();
  expect(screen.queryByText("Get ready")).toBeNull();
  await tick(10000);
  expect(mockRecorder.record).not.toHaveBeenCalled();
  expect(st()).toMatchObject({ recording: false, isPlaying: false });
  expect(useToast.getState().message).toBeNull();
  expect(onClose).not.toHaveBeenCalled();
});

test("Done during the countdown closes the panel at once and silently; nothing starts afterwards", async () => {
  const onClose = jest.fn();
  await openRecord(onClose);
  await fireEvent.press(btn("Start recording"));
  await tick(1400);
  await fireEvent.press(btn("Done"));
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(useVoiceLive.getState().counting).toBe(false);
  await tick(10000);
  expect(mockRecorder.record).not.toHaveBeenCalled();
  expect(st()).toMatchObject({ recording: false, isPlaying: false });
  expect(useToast.getState().message).toBeNull();
});

test("another tab during the countdown: the tab changes and the countdown is gone", async () => {
  await openRecord();
  await fireEvent.press(btn("Start recording"));
  await tick(2400);
  await fireEvent.press(btn("Music"));
  expect(btn("Music")).toBeSelected();
  expect(screen.queryByText("Get ready")).toBeNull();
  expect(useVoiceLive.getState().counting).toBe(false);
  await tick(10000);
  expect(mockRecorder.record).not.toHaveBeenCalled();
  expect(st().recording).toBe(false);
});

test("the panel going away during the countdown (the host hides or unmounts it) ends the countdown", async () => {
  const view = await render(<AddAudioSheet visible onClose={() => {}} />);
  await fireEvent.press(btn("Record"));
  await fireEvent.press(btn("Start recording"));
  await tick(500);
  await view.unmount();
  expect(useVoiceLive.getState().counting).toBe(false);
  await tick(10000);
  expect(mockRecorder.record).not.toHaveBeenCalled();
});

test("PROOF — a level sample draws the meter again and neither the Record tab nor the panel", async () => {
  mockRecorder.metering = -90;
  await openRecord();
  await fireEvent.press(btn("Start recording"));
  await tick(3000);
  expect(screen.getByText("Recording…")).toBeTruthy();
  expect(litBars()).toBe(0);
  const before = { ...mockRenders };
  expect(before.panel).toBeGreaterThan(0);
  expect(before.tab).toBeGreaterThan(0);
  mockRecorder.metering = -27.5;
  await tick(VOICE_LEVEL.sampleMs);          // one sample; the tab's own 200-ms clock has not ticked yet
  expect(litBars()).toBe(4);
  expect(mockRenders).toEqual(before);
  // Through a whole second of samples the panel is never drawn; the tab only for its clock (five ticks of 200 ms), not ten times.
  for (const db of [-5, -40, -15, -30, -5, -50, -20, -10, -35]) { mockRecorder.metering = db; await tick(VOICE_LEVEL.sampleMs); }
  expect(mockRenders.panel).toBe(before.panel);
  expect(mockRenders.tab - before.tab).toBeLessThanOrEqual(5);
  expect(litBars()).toBe(3);
});

test("too quiet on the real panel: the line changes after 3 s of silence and comes back with the first sound — the panel is not drawn for it", async () => {
  mockRecorder.metering = -90;
  await openRecord();
  await fireEvent.press(btn("Start recording"));
  await tick(3000);
  const panel = mockRenders.panel;
  await tick(2900);
  expect(screen.getByText("Recording…")).toBeTruthy();
  await tick(100);
  expect(screen.getByText("Too quiet — check the microphone")).toBeTruthy();
  mockRecorder.metering = -20;
  await tick(100);
  expect(screen.getByText("Recording…")).toBeTruthy();
  expect(mockRenders.panel).toBe(panel);
});
