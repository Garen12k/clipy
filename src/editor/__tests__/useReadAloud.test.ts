jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-08T10:00:00.000Z" }));
jest.mock("@/src/lib/id", () => ({ newId: jest.fn() }));
jest.mock("@/src/ui/haptics", () => ({ haptic: jest.fn() }));
jest.mock("@/src/projects", () => ({ storage: { projectDir: (id: string) => `file:///doc/projects/${id}` } }));
jest.mock("@/src/projects/expoFs", () => ({ expoFs: { mkdir: jest.fn(async () => {}), remove: jest.fn(async () => {}) } }));
jest.mock("@/modules/clipy-video", () => ({
  isSpeechAvailable: jest.fn(() => true), speakToFile: jest.fn(), cancelSpeech: jest.fn(), isNativeAvailable: jest.fn(() => true), isSoundAvailable: jest.fn(() => true),
  isSpeechCancelled: (e: unknown) => typeof e === "object" && e !== null && (e as { code?: string }).code === "E_READ_ALOUD_CANCELLED",
}));
import { act, renderHook } from "@testing-library/react-native";
import { cancelSpeech, isSpeechAvailable, speakToFile } from "@/modules/clipy-video";
import { updateOverlay } from "@/src/editor/model/ops";
import { makeAudioTrack, makeClip, makeOverlay, makeProject } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { newId } from "@/src/lib/id";
import { expoFs } from "@/src/projects/expoFs";
import { useToast } from "@/src/ui/Toast";
import { READ_ALOUD, SPEECH_DEADLINE_MS, useReadAloud } from "../useReadAloud";

const st = () => useEditorStore.getState();
const tracks = () => st().project!.audioTracks;
const said = () => useToast.getState().message;
const speak = jest.mocked(speakToFile);
const MEDIA = "file:///doc/projects/p1/media";
const FILE = `${MEDIA}/speech-o1-id1.caf`;
/** Lets the awaits inside `read` (the folder, the phone's answer, the clean-up) run. */
const settle = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
const cancelled = () => Object.assign(new Error("Speech cancelled"), { code: "E_READ_ALOUD_CANCELLED" });
const project = (id = "p1") => makeProject({ id, clips: [makeClip({ id: "a", sourceDuration: 20 })], overlays: [makeOverlay({ id: "o1", text: "Hello  \u{1F600} there", start: 2, end: 5 }), makeOverlay({ id: "empty", text: "\u{1F600}", start: 0, end: 2 })] });
let ids = 0;

beforeEach(() => {
  jest.clearAllMocks();
  ids = 0;
  jest.mocked(newId).mockImplementation(() => `id${++ids}`);
  jest.mocked(isSpeechAvailable).mockReturnValue(true);
  jest.mocked(expoFs.mkdir).mockImplementation(async () => {});
  jest.mocked(expoFs.remove).mockImplementation(async () => {});
  jest.mocked(cancelSpeech).mockImplementation(() => {});
  speak.mockReset();
  useToast.setState({ message: null, stamp: 0 });
  st().reset();
  st().setProject(project());
  st().selectOverlay("o1");
});
afterEach(() => { jest.useRealTimers(); });

test("the fixture's project is p1 (the media folder below depends on it)", () => {
  expect(st().project!.id).toBe("p1");
});

test("a reading: the cleaned text, the voice, the rate and a new file in the media folder go to the phone; one voice bar comes back, in one undo step", async () => {
  speak.mockResolvedValue({ fileUri: FILE, seconds: 1.8 });
  const { result } = await renderHook(() => useReadAloud());
  st().setPlaying(true);
  let ok = false;
  await act(async () => { ok = await result.current.read("o1", "en.ava", 0.75); });
  expect(ok).toBe(true);
  expect(expoFs.mkdir).toHaveBeenCalledWith(MEDIA);
  expect(speak).toHaveBeenCalledWith({ jobId: "id2", text: "Hello there", voiceId: "en.ava", rate: 0.575, outputPath: FILE });
  expect(tracks()).toEqual([{ id: "id3", sourceUri: FILE, title: "Hello there", sourceDuration: 1.8, start: 2, trimStart: 0, trimEnd: 1.8, volume: 1, kind: "voice", fadeIn: 0, fadeOut: 0 }]);
  expect(st().past).toHaveLength(1);
  expect(st().isPlaying).toBe(false);                         // the preview was paused first
  expect(st().selectedOverlayId).toBe("o1");                  // the text stays selected: the panel stays open
  expect(said()).toBe(READ_ALOUD.done);
  expect(result.current.busy).toBe(false);
  expect(expoFs.remove).not.toHaveBeenCalled();               // the file that became the bar is kept
  expect(cancelSpeech).not.toHaveBeenCalled();
});

test("the preview is paused before the phone is asked, and stays paused", async () => {
  let playingWhenAsked: boolean | null = null;
  speak.mockImplementation(async () => { playingWhenAsked = st().isPlaying; return { fileUri: FILE, seconds: 1.8 }; });
  const { result } = await renderHook(() => useReadAloud());
  st().setPlaying(true);
  await act(async () => { await result.current.read("o1", "en.ava", 0.5); });
  expect(playingWhenAsked).toBe(false);
  expect(st().isPlaying).toBe(false);
});

test("a second reading of the same text replaces the first bar; Undo brings it back", async () => {
  speak.mockResolvedValueOnce({ fileUri: "x", seconds: 1.8 }).mockResolvedValueOnce({ fileUri: "y", seconds: 2.4 });
  const { result } = await renderHook(() => useReadAloud());
  await act(async () => { await result.current.read("o1", "en.ava", 0.5); });
  await act(async () => { await result.current.read("o1", "en.daniel", 0.5); });
  expect(tracks()).toHaveLength(1);
  expect(tracks()[0]).toMatchObject({ sourceUri: `${MEDIA}/speech-o1-id4.caf`, sourceDuration: 2.4, start: 2 });
  expect(st().past).toHaveLength(2);
  await act(async () => { st().undo(); });
  expect(tracks()[0].sourceUri).toBe(FILE);
});

test("refusals are said before anything native runs", async () => {
  const { result } = await renderHook(() => useReadAloud());
  await act(async () => { expect(await result.current.read("empty", "en.ava", 0.5)).toBe(false); });
  expect(said()).toBe(READ_ALOUD.noText);
  await act(async () => { expect(await result.current.read("nobody", "en.ava", 0.5)).toBe(false); });
  expect(said()).toBe(READ_ALOUD.notText);
  await act(async () => { expect(await result.current.read("o1", null, 0.5)).toBe(false); });
  expect(said()).toBe(READ_ALOUD.noVoice);
  st().apply((p) => ({ ...p, audioTracks: Array.from({ length: 12 }, (_, i) => makeAudioTrack({ id: `m${i}`, sourceDuration: 5 })) }));
  await act(async () => { expect(await result.current.read("o1", "en.ava", 0.5)).toBe(false); });
  expect(said()).toBe(READ_ALOUD.limit);
  jest.mocked(isSpeechAvailable).mockReturnValue(false);
  await act(async () => { expect(await result.current.read("o1", "en.ava", 0.5)).toBe(false); });
  expect(said()).toBe("Reduce noise and Read aloud need the latest Clipy build. Install it from the newest build link.");
  expect(speak).not.toHaveBeenCalled();
  expect(expoFs.mkdir).not.toHaveBeenCalled();
  expect(cancelSpeech).not.toHaveBeenCalled();
  expect(result.current.busy).toBe(false);
  expect(READ_ALOUD.tooLong).toBe("This text is too long to read aloud.");
});

test("a refusal leaves the preview playing: nothing was started", async () => {
  const { result } = await renderHook(() => useReadAloud());
  st().setPlaying(true);
  await act(async () => { await result.current.read("empty", "en.ava", 0.5); });
  expect(st().isPlaying).toBe(true);
});

test("while it is busy a second tap is ignored, and Stop cancels: no bar, the file is removed, nothing is said", async () => {
  let reject: (e: unknown) => void = () => {};
  speak.mockReturnValue(new Promise((_, r) => { reject = r; }));
  const { result } = await renderHook(() => useReadAloud());
  let first: Promise<boolean> = Promise.resolve(true);
  await act(async () => { first = result.current.read("o1", "en.ava", 0.5); await settle(); });
  expect(result.current.busy).toBe(true);
  await act(async () => { expect(await result.current.read("o1", "en.ava", 0.5)).toBe(false); });
  expect(speak).toHaveBeenCalledTimes(1);
  expect(said()).toBeNull();
  await act(async () => { result.current.stop(); });
  expect(cancelSpeech).toHaveBeenCalledWith("id2");
  await act(async () => { reject(cancelled()); expect(await first).toBe(false); });
  expect(tracks()).toEqual([]);
  expect(expoFs.remove).toHaveBeenCalledWith(FILE);
  expect(said()).toBeNull();
  expect(result.current.busy).toBe(false);
});

test("Stop does not wait for the phone: it is idle at once though the phone never answers, and the next reading starts", async () => {
  speak.mockReturnValueOnce(new Promise(() => {})).mockResolvedValueOnce({ fileUri: "y", seconds: 2 });
  const { result } = await renderHook(() => useReadAloud());
  let outcome: boolean | null = null;
  await act(async () => { void result.current.read("o1", "en.ava", 0.5).then((v) => { outcome = v; }); await settle(); });
  await act(async () => { result.current.stop(); result.current.stop(); await settle(); });
  expect(outcome).toBe(false);
  expect(result.current.busy).toBe(false);
  expect(cancelSpeech).toHaveBeenCalledTimes(1);              // a second Stop has nothing left to stop
  expect(expoFs.remove).toHaveBeenCalledWith(FILE);
  expect(said()).toBeNull();
  await act(async () => { expect(await result.current.read("o1", "en.ava", 0.5)).toBe(true); });
  expect(tracks()).toHaveLength(1);
  expect(tracks()[0].sourceUri).toBe(`${MEDIA}/speech-o1-id3.caf`);
});

test("an answer that comes after Stop is dropped: no bar out of nowhere, and the file it wrote is removed", async () => {
  let resolve: (v: { fileUri: string; seconds: number }) => void = () => {};
  speak.mockReturnValue(new Promise((r) => { resolve = r; }));
  const { result } = await renderHook(() => useReadAloud());
  await act(async () => { void result.current.read("o1", "en.ava", 0.5); await settle(); });
  await act(async () => { result.current.stop(); await settle(); });
  expect(expoFs.remove).toHaveBeenCalledTimes(1);
  await act(async () => { resolve({ fileUri: FILE, seconds: 2 }); await settle(); });
  expect(expoFs.remove).toHaveBeenCalledTimes(2);             // the phone finished the file after all: removed again
  expect(expoFs.remove).toHaveBeenLastCalledWith(FILE);
  expect(tracks()).toEqual([]);
  expect(st().past).toHaveLength(0);
  expect(said()).toBeNull();
});

test("Stop that the phone refuses still ends the reading", async () => {
  const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  jest.mocked(cancelSpeech).mockImplementation(() => { throw new Error("no such job"); });
  speak.mockReturnValue(new Promise(() => {}));
  const { result } = await renderHook(() => useReadAloud());
  let outcome: boolean | null = null;
  await act(async () => { void result.current.read("o1", "en.ava", 0.5).then((v) => { outcome = v; }); await settle(); });
  await act(async () => { expect(() => result.current.stop()).not.toThrow(); await settle(); });
  expect(outcome).toBe(false);
  expect(result.current.busy).toBe(false);
  warn.mockRestore();
});

test("Stop while the folder is still being made: the phone is never asked", async () => {
  let made: () => void = () => {};
  jest.mocked(expoFs.mkdir).mockReturnValue(new Promise<void>((r) => { made = r; }));
  const { result } = await renderHook(() => useReadAloud());
  let pending: Promise<boolean> = Promise.resolve(true);
  await act(async () => { pending = result.current.read("o1", "en.ava", 0.5); await settle(); });
  expect(result.current.busy).toBe(true);
  await act(async () => { result.current.stop(); });
  await act(async () => { made(); expect(await pending).toBe(false); });
  expect(speak).not.toHaveBeenCalled();
  expect(cancelSpeech).not.toHaveBeenCalled();
  expect(said()).toBeNull();
  expect(result.current.busy).toBe(false);
});

test("Stop with nothing running does nothing", async () => {
  const { result } = await renderHook(() => useReadAloud());
  await act(async () => { result.current.stop(); });
  expect(cancelSpeech).not.toHaveBeenCalled();
  expect(result.current.busy).toBe(false);
});

test("a failure is said once in plain words, the reason goes to the log, and nothing changes", async () => {
  const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  const shown: string[] = [];
  const off = useToast.subscribe((s, prev) => { if (s.message && s !== prev) shown.push(s.message); });
  speak.mockRejectedValue(Object.assign(new Error("speech render: no sound came out"), { code: "E_READ_ALOUD" }));
  const { result } = await renderHook(() => useReadAloud());
  await act(async () => { expect(await result.current.read("o1", "en.ava", 0.5)).toBe(false); });
  expect(said()).toBe(READ_ALOUD.failed);
  expect(warn).toHaveBeenCalledWith("read aloud failed", "speech render: no sound came out");
  expect(tracks()).toEqual([]);
  expect(st().past).toHaveLength(0);
  expect(expoFs.remove).toHaveBeenCalledWith(FILE);
  expect(result.current.busy).toBe(false);
  expect(shown).toEqual([READ_ALOUD.failed]);                 // once
  expect(cancelSpeech).not.toHaveBeenCalled();                // the job has ended by itself: nothing to stop
  off();
  warn.mockRestore();
});

test("the phone refusing outright (an older build's error) and a folder that cannot be made are failures too", async () => {
  const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  speak.mockImplementation(() => { throw new Error("This build of the app cannot do that yet."); });
  const { result } = await renderHook(() => useReadAloud());
  await act(async () => { expect(await result.current.read("o1", "en.ava", 0.5)).toBe(false); });
  expect(said()).toBe(READ_ALOUD.failed);
  expect(cancelSpeech).not.toHaveBeenCalled();                // the phone never took the job: nothing to stop
  useToast.setState({ message: null });
  speak.mockReset();
  jest.mocked(expoFs.mkdir).mockRejectedValue(new Error("disk full"));
  await act(async () => { expect(await result.current.read("o1", "en.ava", 0.5)).toBe(false); });
  expect(said()).toBe(READ_ALOUD.failed);
  expect(speak).not.toHaveBeenCalled();
  expect(result.current.busy).toBe(false);
  expect(tracks()).toEqual([]);
  warn.mockRestore();
});

test("an answer with no length is a failure: said, the file removed, nothing changed", async () => {
  const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  speak.mockResolvedValue({ fileUri: FILE, seconds: 0 });
  const { result } = await renderHook(() => useReadAloud());
  await act(async () => { expect(await result.current.read("o1", "en.ava", 0.5)).toBe(false); });
  expect(said()).toBe(READ_ALOUD.failed);
  expect(expoFs.remove).toHaveBeenCalledWith(FILE);
  expect(tracks()).toEqual([]);
  expect(st().past).toHaveLength(0);
  warn.mockRestore();
});

test("the phone never answers: after the deadline it is told to stop and the reading counts as failed", async () => {
  const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  jest.useFakeTimers();
  speak.mockReturnValue(new Promise(() => {}));
  const { result } = await renderHook(() => useReadAloud());
  let outcome: boolean | null = null;
  await act(async () => { void result.current.read("o1", "en.ava", 0.5).then((v) => { outcome = v; }); await settle(); });
  await act(async () => { jest.advanceTimersByTime(SPEECH_DEADLINE_MS - 1); await settle(); });
  expect(outcome).toBeNull();
  await act(async () => { jest.advanceTimersByTime(2); await settle(); });
  expect(SPEECH_DEADLINE_MS).toBe(90000);
  expect(outcome).toBe(false);
  expect(cancelSpeech).toHaveBeenCalledWith("id2");
  expect(cancelSpeech).toHaveBeenCalledTimes(1);
  expect(said()).toBe(READ_ALOUD.failed);
  expect(expoFs.remove).toHaveBeenCalledWith(FILE);
  expect(result.current.busy).toBe(false);
  expect(tracks()).toEqual([]);
  warn.mockRestore();
});

test("no deadline is left running after an answer", async () => {
  jest.useFakeTimers();
  speak.mockResolvedValue({ fileUri: FILE, seconds: 1.8 });
  const { result } = await renderHook(() => useReadAloud());
  await act(async () => { await result.current.read("o1", "en.ava", 0.5); });
  await act(async () => { jest.advanceTimersByTime(SPEECH_DEADLINE_MS * 2); await settle(); });
  expect(cancelSpeech).not.toHaveBeenCalled();
  expect(said()).toBe(READ_ALOUD.done);
  expect(tracks()).toHaveLength(1);
});

test("an answer for a text that is gone meanwhile is dropped: no bar, the file removed, nothing said", async () => {
  let resolve: (v: { fileUri: string; seconds: number }) => void = () => {};
  speak.mockReturnValue(new Promise((r) => { resolve = r; }));
  const { result } = await renderHook(() => useReadAloud());
  let pending: Promise<boolean> = Promise.resolve(true);
  await act(async () => { pending = result.current.read("o1", "en.ava", 0.5); await settle(); });
  await act(async () => { st().apply((p) => ({ ...p, overlays: p.overlays.filter((o) => o.id !== "o1") })); });
  await act(async () => { resolve({ fileUri: "x", seconds: 2 }); expect(await pending).toBe(false); });
  expect(tracks()).toEqual([]);
  expect(expoFs.remove).toHaveBeenCalledWith(FILE);
  expect(said()).toBeNull();
});

test("an answer for words that were changed meanwhile is dropped: the bar would say what the text no longer says", async () => {
  let resolve: (v: { fileUri: string; seconds: number }) => void = () => {};
  speak.mockReturnValue(new Promise((r) => { resolve = r; }));
  const { result } = await renderHook(() => useReadAloud());
  let pending: Promise<boolean> = Promise.resolve(true);
  await act(async () => { pending = result.current.read("o1", "en.ava", 0.5); await settle(); });
  await act(async () => { st().apply((p) => updateOverlay(p, "o1", { text: "Goodbye" })); });
  const pastBefore = st().past.length;
  await act(async () => { resolve({ fileUri: "x", seconds: 2 }); expect(await pending).toBe(false); });
  expect(tracks()).toEqual([]);
  expect(st().past).toHaveLength(pastBefore);
  expect(expoFs.remove).toHaveBeenCalledWith(FILE);
  expect(said()).toBeNull();
  expect(result.current.busy).toBe(false);
});

test("a change that leaves the words as they are (the text moved, an emoji added) keeps the answer", async () => {
  let resolve: (v: { fileUri: string; seconds: number }) => void = () => {};
  speak.mockReturnValue(new Promise((r) => { resolve = r; }));
  const { result } = await renderHook(() => useReadAloud());
  let pending: Promise<boolean> = Promise.resolve(false);
  await act(async () => { pending = result.current.read("o1", "en.ava", 0.5); await settle(); });
  await act(async () => { st().apply((p) => updateOverlay(p, "o1", { text: "Hello there \u{1F389}", start: 4, end: 7 })); });
  await act(async () => { resolve({ fileUri: "x", seconds: 2 }); expect(await pending).toBe(true); });
  expect(tracks()).toHaveLength(1);
  expect(tracks()[0]).toMatchObject({ start: 4, title: "Hello there" });   // where the text is NOW
});

test("an answer for another project (the editor moved on) is dropped", async () => {
  let resolve: (v: { fileUri: string; seconds: number }) => void = () => {};
  speak.mockReturnValue(new Promise((r) => { resolve = r; }));
  const { result } = await renderHook(() => useReadAloud());
  let pending: Promise<boolean> = Promise.resolve(true);
  await act(async () => { pending = result.current.read("o1", "en.ava", 0.5); await settle(); });
  await act(async () => { st().setProject(project("p2")); });   // the same text id, another project
  await act(async () => { resolve({ fileUri: "x", seconds: 2 }); expect(await pending).toBe(false); });
  expect(tracks()).toEqual([]);
  expect(expoFs.remove).toHaveBeenCalledWith(FILE);
  expect(said()).toBeNull();
});

test("leaving while it is busy cancels the reading", async () => {
  speak.mockReturnValue(new Promise(() => {}));
  const { result, unmount } = await renderHook(() => useReadAloud());
  await act(async () => { void result.current.read("o1", "en.ava", 0.5); await settle(); });
  await unmount();
  expect(cancelSpeech).toHaveBeenCalledWith("id2");
});

test("an answer that comes after leaving: no bar, nothing said, no state set, the file removed", async () => {
  const error = jest.spyOn(console, "error").mockImplementation(() => {});
  let resolve: (v: { fileUri: string; seconds: number }) => void = () => {};
  speak.mockReturnValue(new Promise((r) => { resolve = r; }));
  const { result, unmount } = await renderHook(() => useReadAloud());
  let pending: Promise<boolean> = Promise.resolve(true);
  await act(async () => { pending = result.current.read("o1", "en.ava", 0.5); await settle(); });
  await unmount();
  await act(async () => { resolve({ fileUri: FILE, seconds: 2 }); expect(await pending).toBe(false); await settle(); });
  expect(tracks()).toEqual([]);
  expect(st().past).toHaveLength(0);
  expect(said()).toBeNull();
  expect(expoFs.remove).toHaveBeenLastCalledWith(FILE);
  expect(error).not.toHaveBeenCalled();
  error.mockRestore();
});
