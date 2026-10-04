import { fireEvent, render, screen } from "@testing-library/react-native";
import type { VoiceRecorder } from "../useVoiceRecorder";
const mockRec: VoiceRecorder = { state: "idle", elapsed: 0, start: jest.fn(async () => {}), stop: jest.fn(async () => {}), cancel: jest.fn(async () => {}) };
jest.mock("../useVoiceRecorder", () => ({ useVoiceRecorder: () => mockRec }));
import { RecordTab } from "../components/RecordTab";

const btn = (name: string) => screen.getByRole("button", { name });
const HINT = "Plays your video while you talk. Other sound is muted while recording.";

beforeEach(() => { jest.clearAllMocks(); Object.assign(mockRec, { state: "idle", elapsed: 0 }); });

test("idle: a record button, 0:00 and the hint; pressing starts", async () => {
  await render(<RecordTab onDone={() => {}} />);
  expect(screen.getByText("0:00")).toBeTruthy();
  expect(screen.getByText(HINT)).toBeTruthy();
  expect(screen.queryByText("Recording…")).toBeNull();
  expect(btn("Start recording")).toBeEnabled();
  await fireEvent.press(btn("Start recording"));
  expect(mockRec.start).toHaveBeenCalledTimes(1);
  expect(mockRec.stop).not.toHaveBeenCalled();
});

test("recording: a stop button, the elapsed time and “Recording…”; pressing stops", async () => {
  Object.assign(mockRec, { state: "recording", elapsed: 65.4 });
  await render(<RecordTab onDone={() => {}} />);
  expect(screen.getByText("1:05")).toBeTruthy();
  expect(screen.getByText("Recording…")).toBeTruthy();
  await fireEvent.press(btn("Stop recording"));
  expect(mockRec.stop).toHaveBeenCalledTimes(1);
  expect(mockRec.start).not.toHaveBeenCalled();
});

test("the button is disabled while starting and while saving", async () => {
  Object.assign(mockRec, { state: "starting" });
  const view = await render(<RecordTab onDone={() => {}} />);
  expect(btn("Start recording")).toBeDisabled();
  Object.assign(mockRec, { state: "saving", elapsed: 3 });
  await view.rerender(<RecordTab onDone={() => {}} />);
  expect(btn("Stop recording")).toBeDisabled();
  expect(screen.getByText("Saving…")).toBeTruthy();
});

test("the close guard: free to close when idle; while recording it stops instead; while starting / saving it just holds", async () => {
  const guard: { current: (() => boolean) | null } = { current: null };
  const view = await render(<RecordTab onDone={() => {}} closeGuard={guard} />);
  expect(guard.current!()).toBe(false);
  Object.assign(mockRec, { state: "recording" });
  await view.rerender(<RecordTab onDone={() => {}} closeGuard={guard} />);
  expect(guard.current!()).toBe(true);
  expect(mockRec.stop).toHaveBeenCalledTimes(1);
  Object.assign(mockRec, { state: "saving" });
  await view.rerender(<RecordTab onDone={() => {}} closeGuard={guard} />);
  expect(guard.current!()).toBe(true);
  expect(mockRec.stop).toHaveBeenCalledTimes(1);
  await view.unmount();
  expect(guard.current).toBeNull();
});
