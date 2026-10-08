import { act, fireEvent, render, screen } from "@testing-library/react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-08T10:00:00.000Z" }));
jest.mock("@/src/lib/id", () => ({ newId: jest.fn() }));
jest.mock("@/src/ui/haptics", () => ({ haptic: jest.fn() }));
jest.mock("@/src/projects", () => ({ storage: { projectDir: (id: string) => `file:///doc/projects/${id}` } }));
jest.mock("@/src/projects/expoFs", () => ({ expoFs: { mkdir: jest.fn(async () => {}), remove: jest.fn(async () => {}) } }));
jest.mock("@react-native-community/slider", () => { const { View } = require("react-native"); return ({ testID, value, onValueChange, onSlidingComplete }: { testID?: string; value?: number; onValueChange?: (v: number) => void; onSlidingComplete?: (v: number) => void }) => <View testID={testID} {...{ value }} onTouchMove={() => onValueChange?.(0.8)} onTouchEnd={() => onSlidingComplete?.(0.8)} />; });
jest.mock("@/modules/clipy-video", () => ({
  isSpeechAvailable: jest.fn(() => true), listVoices: jest.fn(), speakToFile: jest.fn(), cancelSpeech: jest.fn(), isNativeAvailable: jest.fn(() => true), isSoundAvailable: jest.fn(() => true),
  isSpeechCancelled: (e: unknown) => typeof e === "object" && e !== null && (e as { code?: string }).code === "E_READ_ALOUD_CANCELLED",
}));
import { cancelSpeech, isSpeechAvailable, listVoices, speakToFile } from "@/modules/clipy-video";
import { makeClip, makeOverlay, makeProject } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { newId } from "@/src/lib/id";
import { theme } from "@/src/theme/theme";
import { useToast } from "@/src/ui/Toast";
import { ReadAloudSection } from "../components/ReadAloudSection";
import { loadSpeechPrefs, SPEECH_PREFS_KEY } from "../speechPrefs";

const VOICES = { current: "en-US", voices: [
  { id: "en.samantha", name: "Samantha", language: "en-US", languageName: "English (United States)", quality: 1 },
  { id: "en.ava", name: "Ava", language: "en-US", languageName: "English (United States)", quality: 3 },
  { id: "el.melina", name: "Melina", language: "el-GR", languageName: "Greek (Greece)", quality: 1 },
] };
const st = () => useEditorStore.getState();
const row = () => screen.getByRole("button", { name: "Read aloud options" });
const chip = (name: string) => screen.getByRole("button", { name });
const flush = async () => { for (let i = 0; i < 4; i++) await act(async () => { await Promise.resolve(); }); };
const openSection = async () => { await render(<ReadAloudSection overlayId="o1" />); await fireEvent.press(row()); await flush(); };
let ids = 0;

beforeEach(() => {
  jest.clearAllMocks();
  ids = 0;
  jest.mocked(newId).mockImplementation(() => `id${++ids}`);
  jest.mocked(isSpeechAvailable).mockReturnValue(true);
  jest.mocked(listVoices).mockResolvedValue(VOICES);
  localStorage.removeItem(SPEECH_PREFS_KEY);
  useToast.setState({ message: null, stamp: 0 });
  st().reset();
  st().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 20 })], overlays: [makeOverlay({ id: "o1", text: "Hello there", start: 2, end: 5 })] }));
});

test("closed at first: one row of touch height, nothing asked of the phone", async () => {
  await render(<ReadAloudSection overlayId="o1" />);
  expect(screen.getByTestId("read-aloud-row")).toHaveStyle({ height: theme.size.touch });
  expect(row().props.accessibilityState).toMatchObject({ expanded: false });
  expect(screen.queryByTestId("read-aloud-speed")).toBeNull();
  expect(listVoices).not.toHaveBeenCalled();
});

test("opened: the languages (the phone's first), the voices of that language (best first, ringed), Speed at Normal, the button", async () => {
  await openSection();
  expect(listVoices).toHaveBeenCalledTimes(1);
  expect(chip("English (United States)")).toBeSelected();
  expect(chip("Greek (Greece)")).not.toBeSelected();
  expect(chip("Ava · Premium")).toBeSelected();
  expect(chip("Samantha")).not.toBeSelected();
  expect(screen.queryByRole("button", { name: "Melina" })).toBeNull();
  expect(screen.getByTestId("read-aloud-speed").props.value).toBe(0.5);
  expect(screen.getByText("Speed Normal")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Read aloud" })).toBeTruthy();
  expect(screen.getByTestId("read-aloud-languages")).toHaveStyle({ height: theme.size.touch });
  expect(screen.getByTestId("read-aloud-voices")).toHaveStyle({ height: theme.size.touch });
});

test("another language shows its voices and picks its best; the choice and the speed are remembered on the phone, not in the project", async () => {
  await openSection();
  await fireEvent.press(chip("Greek (Greece)"));
  expect(chip("Melina")).toBeSelected();
  await fireEvent(screen.getByTestId("read-aloud-speed"), "touchMove");
  await fireEvent(screen.getByTestId("read-aloud-speed"), "touchEnd");
  expect(screen.getByText("Speed Faster")).toBeTruthy();
  expect(loadSpeechPrefs()).toEqual({ voiceId: "el.melina", pace: 0.8 });
  expect(st().past).toHaveLength(0);
});

test("the remembered voice is the one ringed at the next opening", async () => {
  localStorage.setItem(SPEECH_PREFS_KEY, JSON.stringify({ voiceId: "el.melina", pace: 0.3 }));
  await openSection();
  expect(chip("Greek (Greece)")).toBeSelected();
  expect(chip("Melina")).toBeSelected();
  expect(screen.getByTestId("read-aloud-speed").props.value).toBe(0.3);
  expect(screen.getByText("Speed Slower")).toBeTruthy();
});

test("Read aloud: the chosen voice and speed go to the phone, one voice bar lands at the text's start", async () => {
  jest.mocked(speakToFile).mockResolvedValue({ fileUri: "x", seconds: 1.5 });
  await openSection();
  await fireEvent.press(chip("Samantha"));
  await fireEvent.press(screen.getByRole("button", { name: "Read aloud" }));
  await flush();
  expect(speakToFile).toHaveBeenCalledWith(expect.objectContaining({ text: "Hello there", voiceId: "en.samantha", rate: 0.5 }));
  expect(st().project!.audioTracks).toHaveLength(1);
  expect(st().project!.audioTracks[0]).toMatchObject({ kind: "voice", start: 2, sourceDuration: 1.5, title: "Hello there" });
  expect(st().past).toHaveLength(1);
});

test("while the phone is speaking: a spinner and Stop in the button's place; Stop cancels", async () => {
  jest.mocked(speakToFile).mockReturnValue(new Promise(() => {}));
  await openSection();
  await fireEvent.press(screen.getByRole("button", { name: "Read aloud" }));
  await flush();
  expect(screen.getByLabelText("Preparing the voice")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Read aloud" })).toBeNull();
  await fireEvent.press(screen.getByRole("button", { name: "Stop" }));
  expect(cancelSpeech).toHaveBeenCalledTimes(1);
});

test("no voices on the phone: it says so and offers no button", async () => {
  jest.mocked(listVoices).mockResolvedValue({ current: "en-US", voices: [] });
  await openSection();
  expect(screen.getByText("No voices are installed on this iPhone.")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Read aloud" })).toBeNull();
});

test("the list cannot be read: it says so, and the row can be closed and opened to try again", async () => {
  jest.mocked(listVoices).mockRejectedValueOnce(new Error("boom"));
  await openSection();
  expect(screen.getByText("Could not read the list of voices.")).toBeTruthy();
  await fireEvent.press(row());
  await fireEvent.press(row());
  await flush();
  expect(chip("Ava · Premium")).toBeTruthy();
});

test("in Expo Go or an older build the row stays closed and says what is needed", async () => {
  jest.mocked(isSpeechAvailable).mockReturnValue(false);
  await render(<ReadAloudSection overlayId="o1" />);
  await fireEvent.press(row());
  await flush();
  expect(screen.queryByTestId("read-aloud-speed")).toBeNull();
  expect(listVoices).not.toHaveBeenCalled();
  expect(useToast.getState().message).toBe("Reduce noise and Read aloud need the latest Clipy build. Install it from the newest build link.");
});

test("opening the row and choosing a language, a voice or a speed leave the project the very object it was", async () => {
  const before = st().project;
  await openSection();
  await fireEvent.press(chip("Greek (Greece)"));
  await fireEvent.press(chip("English (United States)"));
  await fireEvent.press(chip("Samantha"));
  await fireEvent(screen.getByTestId("read-aloud-speed"), "touchMove");
  await fireEvent(screen.getByTestId("read-aloud-speed"), "touchEnd");
  await fireEvent.press(row());
  expect(st().project).toBe(before);
  expect(st().past).toHaveLength(0);
  expect(st().future).toHaveLength(0);
  expect(speakToFile).not.toHaveBeenCalled();
});

test("a speed is remembered when the drag ends, not while it moves", async () => {
  await openSection();
  await fireEvent(screen.getByTestId("read-aloud-speed"), "touchMove");
  expect(screen.getByText("Speed Faster")).toBeTruthy();
  expect(localStorage.getItem(SPEECH_PREFS_KEY)).toBeNull();
  await fireEvent(screen.getByTestId("read-aloud-speed"), "touchEnd");
  expect(loadSpeechPrefs().pace).toBe(0.8);
});

test("the voice the phone starts on is not written anywhere until a chip is tapped", async () => {
  await openSection();
  expect(chip("Ava · Premium")).toBeSelected();
  expect(localStorage.getItem(SPEECH_PREFS_KEY)).toBeNull();
});

test("a remembered voice that is no longer installed: the best of the phone's language is ringed", async () => {
  localStorage.setItem(SPEECH_PREFS_KEY, JSON.stringify({ voiceId: "gone", pace: 0.5 }));
  await openSection();
  expect(chip("English (United States)")).toBeSelected();
  expect(chip("Ava · Premium")).toBeSelected();
});

test("nothing to read (only an emoji): the reason is said, nothing is asked of the phone, nothing changes", async () => {
  st().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 20 })], overlays: [makeOverlay({ id: "o1", text: "\u{1F600}", start: 2, end: 5 })] }));
  const before = st().project;
  await openSection();
  await fireEvent.press(screen.getByRole("button", { name: "Read aloud" }));
  await flush();
  expect(useToast.getState().message).toBe("There is nothing to read in this text.");
  expect(speakToFile).not.toHaveBeenCalled();
  expect(st().project).toBe(before);
  expect(screen.getByRole("button", { name: "Read aloud" })).toBeTruthy();
});

test("a text over the limit: the reason is said and the phone is not asked", async () => {
  st().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 20 })], overlays: [makeOverlay({ id: "o1", text: "word ".repeat(250), start: 2, end: 5 })] }));
  await openSection();
  await fireEvent.press(screen.getByRole("button", { name: "Read aloud" }));
  await flush();
  expect(useToast.getState().message).toBe("This text is too long to read aloud.");
  expect(speakToFile).not.toHaveBeenCalled();
});

test("the row leaving the screen while the phone is speaking (the panel closed) cancels: no bar", async () => {
  jest.mocked(speakToFile).mockReturnValue(new Promise(() => {}));
  const view = await render(<ReadAloudSection overlayId="o1" />);
  await fireEvent.press(row());
  await flush();
  await fireEvent.press(screen.getByRole("button", { name: "Read aloud" }));
  await flush();
  await view.unmount();
  await flush();
  expect(cancelSpeech).toHaveBeenCalledTimes(1);
  expect(st().project!.audioTracks).toHaveLength(0);
  expect(useToast.getState().message).toBeNull();
});

test("the panel moving to another text while the phone is speaking cancels: the row stays open, no bar on either text", async () => {
  st().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 20 })], overlays: [makeOverlay({ id: "o1", text: "Hello there", start: 2, end: 5 }), makeOverlay({ id: "o2", text: "Second", start: 6, end: 8 })] }));
  let answer: (v: { fileUri: string; seconds: number }) => void = () => {};
  jest.mocked(speakToFile).mockReturnValue(new Promise((r) => { answer = r; }));
  const view = await render(<ReadAloudSection overlayId="o1" />);
  await fireEvent.press(row());
  await flush();
  await fireEvent.press(screen.getByRole("button", { name: "Read aloud" }));
  await flush();
  await view.rerender(<ReadAloudSection overlayId="o2" />);
  await flush();
  expect(cancelSpeech).toHaveBeenCalledTimes(1);
  await act(async () => { answer({ fileUri: "x", seconds: 1.5 }); });
  await flush();
  expect(st().project!.audioTracks).toHaveLength(0);
  expect(row().props.accessibilityState).toMatchObject({ expanded: true });
  expect(screen.getByRole("button", { name: "Read aloud" })).toBeTruthy();
  expect(useToast.getState().message).toBeNull();
});

test("the words changed while the phone was speaking: no bar, and it says why", async () => {
  let answer: (v: { fileUri: string; seconds: number }) => void = () => {};
  jest.mocked(speakToFile).mockReturnValue(new Promise((r) => { answer = r; }));
  await openSection();
  await fireEvent.press(screen.getByRole("button", { name: "Read aloud" }));
  await flush();
  await act(async () => { st().apply((x) => ({ ...x, overlays: x.overlays.map((o) => (o.id === "o1" ? ({ ...o, text: "Hello there, you" } as typeof o) : o)) })); });
  await act(async () => { answer({ fileUri: "x", seconds: 1.5 }); });
  await flush();
  expect(st().project!.audioTracks).toHaveLength(0);
  expect(useToast.getState().message).toBe("The text changed, so nothing was read. Tap Read aloud again.");
  expect(screen.getByRole("button", { name: "Read aloud" })).toBeTruthy();
});

test("Stop says nothing more, even when the words had changed", async () => {
  jest.mocked(speakToFile).mockReturnValue(new Promise(() => {}));
  await openSection();
  await fireEvent.press(screen.getByRole("button", { name: "Read aloud" }));
  await flush();
  await act(async () => { st().apply((x) => ({ ...x, overlays: x.overlays.map((o) => (o.id === "o1" ? ({ ...o, text: "Other words" } as typeof o) : o)) })); });
  await fireEvent.press(screen.getByRole("button", { name: "Stop" }));
  await flush();
  expect(useToast.getState().message).toBeNull();
  expect(screen.getByRole("button", { name: "Read aloud" })).toBeTruthy();
});

test("a second reading with another voice replaces the bar: one bar, one more undo step", async () => {
  jest.mocked(speakToFile).mockResolvedValue({ fileUri: "x", seconds: 1.5 });
  await openSection();
  await fireEvent.press(screen.getByRole("button", { name: "Read aloud" }));
  await flush();
  await fireEvent.press(chip("Samantha"));
  await fireEvent.press(screen.getByRole("button", { name: "Read aloud" }));
  await flush();
  expect(speakToFile).toHaveBeenCalledTimes(2);
  expect(st().project!.audioTracks).toHaveLength(1);
  expect(st().past).toHaveLength(2);
});
