import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
jest.mock("@/src/editor/coverFrame", () => ({ frameUriAt: jest.fn(async (_p: unknown, t: number, exact?: boolean) => `file:///f-${t}-${exact ? "still" : "thumb"}.jpg`) }));
jest.mock("react-native-view-shot", () => ({ captureRef: jest.fn(async () => "file:///tmp/cover.jpg") }));
jest.mock("expo-media-library/legacy", () => ({ requestPermissionsAsync: jest.fn(async () => ({ granted: true })), saveToLibraryAsync: jest.fn(async () => {}) }));
import { requestPermissionsAsync, saveToLibraryAsync } from "expo-media-library/legacy";
import { captureRef } from "react-native-view-shot";
import { frameUriAt } from "@/src/editor/coverFrame";
import { makeClip, makeProject, type Cover } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { CoverSheet } from "../components/CoverSheet";

const frame = frameUriAt as jest.Mock;
const capture = captureRef as jest.Mock;
const permission = requestPermissionsAsync as jest.Mock;
const save = saveToLibraryAsync as jest.Mock;

const state = () => useEditorStore.getState();
const slider = () => screen.getByTestId("cover-time");
const field = () => screen.getByLabelText("Cover title");
const press = (name: string) => fireEvent.press(screen.getByRole("button", { name }));

async function open(cover: Cover | null = null) {
  state().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 4 }), makeClip({ id: "b", sourceDuration: 6 })], aspectRatio: "9:16", cover }));
  const onClose = jest.fn();
  await render(<CoverSheet visible onClose={onClose} />);
  await waitFor(() => expect(frame).toHaveBeenCalled());
  return onClose;
}

beforeEach(() => { jest.clearAllMocks(); state().reset(); });

test("opens on the first frame with an empty title when there is no cover", async () => {
  await open();
  expect(slider().props.value).toBe(0);
  expect(slider().props.maximumValue).toBe(10);
  expect(field().props.value).toBe("");
  expect(screen.getByText("0 / 40")).toBeTruthy();
  expect(frame).toHaveBeenCalledWith(state().project, 0, true);
  await waitFor(() => expect(screen.getByTestId("cover-image").props.source).toEqual({ uri: "file:///f-0-still.jpg" }));
});

test("opens on the stored cover (clamped)", async () => {
  await open({ time: 99, title: "Trip" });
  expect(slider().props.value).toBe(10);
  expect(field().props.value).toBe("Trip");
  expect(screen.getByTestId("cover-title")).toHaveTextContent("Trip");
});

test("moving the slider changes the frame, not the project", async () => {
  await open();
  const before = state().project;
  await fireEvent(slider(), "valueChange", 5);
  await waitFor(() => expect(frame).toHaveBeenCalledWith(before, 5, false));
  await fireEvent(slider(), "slidingComplete", 5);
  await waitFor(() => expect(frame).toHaveBeenCalledWith(before, 5, true));
  await waitFor(() => expect(screen.getByTestId("cover-image").props.source).toEqual({ uri: "file:///f-5-still.jpg" }));
  expect(state().project).toBe(before);
  expect(state().past).toHaveLength(0);
});

test("typing a title shows it on the frame; the field is limited to 40", async () => {
  await open();
  expect(screen.queryByTestId("cover-title")).toBeNull();
  await fireEvent.changeText(field(), "Beach day");
  expect(screen.getByTestId("cover-title")).toHaveTextContent("Beach day");
  expect(screen.getByText("9 / 40")).toBeTruthy();
  expect(field().props.maxLength).toBe(40);
  expect(state().past).toHaveLength(0);
});

test("Done saves time and title as one undo step and closes", async () => {
  const onClose = await open();
  await fireEvent(slider(), "valueChange", 5);
  await fireEvent.changeText(field(), "  Beach day ");
  await press("Done");
  expect(state().project!.cover).toEqual({ time: 5, title: "Beach day" });
  expect(state().past).toHaveLength(1);
  expect(onClose).toHaveBeenCalledTimes(1);
});

test("Done with nothing changed adds no undo step", async () => {
  const onClose = await open({ time: 5, title: "Trip" });
  await press("Done");
  expect(state().past).toHaveLength(0);
  expect(onClose).toHaveBeenCalledTimes(1);
});

test("Reset clears the cover (one undo step) and the draft", async () => {
  const onClose = await open({ time: 5, title: "Trip" });
  await press("Reset");
  expect(state().project!.cover).toBeNull();
  expect(state().past).toHaveLength(1);
  expect(slider().props.value).toBe(0);
  expect(field().props.value).toBe("");
  expect(screen.queryByTestId("cover-title")).toBeNull();
  await press("Reset");
  expect(state().past).toHaveLength(1);
  expect(onClose).not.toHaveBeenCalled();
});

test("closing without Done discards the draft", async () => {
  const onClose = await open({ time: 5, title: "Trip" });
  const before = state().project;
  await fireEvent(slider(), "valueChange", 2);
  await fireEvent.changeText(field(), "Other");
  await fireEvent.press(screen.getByLabelText("Close sheet"));
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(state().project).toBe(before);
  expect(state().past).toHaveLength(0);
});

test("reopening starts again from the stored cover", async () => {
  const onClose = await open({ time: 5, title: "Trip" });
  await fireEvent(slider(), "valueChange", 2);
  await fireEvent.changeText(field(), "Other");
  await screen.rerender(<CoverSheet visible={false} onClose={onClose} />);
  await screen.rerender(<CoverSheet visible onClose={onClose} />);
  expect(slider().props.value).toBe(5);
  expect(field().props.value).toBe("Trip");
});

test("Save to Photos captures the frame view and saves it", async () => {
  await open();
  await press("Save to Photos");
  await waitFor(() => expect(screen.getByText("Saved to Photos")).toBeTruthy());
  expect(permission).toHaveBeenCalledWith(true);
  expect(capture).toHaveBeenCalledTimes(1);
  expect(capture.mock.calls[0][1]).toEqual({ format: "jpg", quality: 0.92, result: "tmpfile", width: 1080, height: 1920 });
  expect(save).toHaveBeenCalledWith("file:///tmp/cover.jpg");
  expect(state().past).toHaveLength(0);
});

test("a refused permission or a failed capture is said in the sheet, which stays usable", async () => {
  await open();
  permission.mockResolvedValueOnce({ granted: false });
  await press("Save to Photos");
  await waitFor(() => expect(screen.getByText("Allow Photos access in Settings to save.")).toBeTruthy());
  expect(capture).not.toHaveBeenCalled();
  expect(save).not.toHaveBeenCalled();
  capture.mockRejectedValueOnce(new Error("no view"));
  await press("Save to Photos");
  await waitFor(() => expect(screen.getByText("Couldn't save the cover.")).toBeTruthy());
  expect(save).not.toHaveBeenCalled();
  await press("Save to Photos");
  await waitFor(() => expect(screen.getByText("Saved to Photos")).toBeTruthy());
  expect(save).toHaveBeenCalledTimes(1);
});

test("a second press while saving is ignored", async () => {
  await open();
  let allow!: (v: { granted: boolean }) => void;
  permission.mockReturnValueOnce(new Promise((r) => { allow = r; }));
  await press("Save to Photos");
  await press("Save to Photos");
  allow({ granted: true });
  await waitFor(() => expect(screen.getByText("Saved to Photos")).toBeTruthy());
  expect(permission).toHaveBeenCalledTimes(1);
  expect(capture).toHaveBeenCalledTimes(1);
});

test("renders nothing for an empty project", async () => {
  state().setProject(makeProject());
  await render(<CoverSheet visible onClose={jest.fn()} />);
  expect(screen.queryByRole("header", { name: "Cover" })).toBeNull();
  expect(screen.queryByTestId("cover-time")).toBeNull();
});
