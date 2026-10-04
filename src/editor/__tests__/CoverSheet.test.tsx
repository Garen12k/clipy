import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
jest.mock("@/src/editor/coverFrame", () => ({ frameUriAt: jest.fn(async (_p: unknown, t: number, exact?: boolean) => `file:///f-${t}-${exact ? "still" : "thumb"}.jpg`) }));
jest.mock("react-native-view-shot", () => ({ captureRef: jest.fn(async () => "file:///tmp/cover.jpg"), releaseCapture: jest.fn() }));
jest.mock("expo-media-library/legacy", () => ({ requestPermissionsAsync: jest.fn(async () => ({ granted: true })), saveToLibraryAsync: jest.fn(async () => {}) }));
import { requestPermissionsAsync, saveToLibraryAsync } from "expo-media-library/legacy";
import { PixelRatio } from "react-native";
import { captureRef, releaseCapture } from "react-native-view-shot";
import { frameUriAt } from "@/src/editor/coverFrame";
import { makeClip, makeProject, type Cover } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { CoverSheet } from "../components/CoverSheet";

const frame = frameUriAt as jest.Mock;
const capture = captureRef as jest.Mock;
const release = releaseCapture as jest.Mock;
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

// A 3× iPhone: view-shot takes its size in points and multiplies by the screen's scale.
let pixelRatio: jest.SpyInstance;
beforeEach(() => { jest.clearAllMocks(); state().reset(); pixelRatio = jest.spyOn(PixelRatio, "get").mockReturnValue(3); });
afterEach(() => { pixelRatio.mockRestore(); });
const saveButton = () => screen.getByRole("button", { name: "Save to Photos" });

test("opens on the first frame with an empty title when there is no cover", async () => {
  await open();
  expect(slider().props.value).toBe(0);
  expect(slider().props.maximumValue).toBe(10);
  expect(field().props.value).toBe("");
  expect(screen.getByLabelText("Cover time")).toBe(slider());
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
  expect(state().past).toHaveLength(0);
});

test("the title is cut to 40 whole characters as it is typed: an emoji is one, and is never cut in half", async () => {
  await open();
  expect(field().props.maxLength).toBeUndefined();   // maxLength counts UTF-16 units: it would stop 20 emoji in
  await fireEvent.changeText(field(), "😀".repeat(45));
  expect(field().props.value).toBe("😀".repeat(40));
  expect(screen.getByText("40 / 40")).toBeTruthy();
  await fireEvent.changeText(field(), "a".repeat(39) + "😀😀");
  expect(field().props.value).toBe("a".repeat(39) + "😀");
});

test("Done on an untouched sheet of a project without a cover makes no cover and no undo step", async () => {
  const onClose = await open();
  const before = state().project;
  await press("Done");
  expect(state().project).toBe(before);
  expect(state().project!.cover).toBeNull();
  expect(state().past).toHaveLength(0);
  expect(onClose).toHaveBeenCalledTimes(1);
  // A title of spaces only is still nothing.
  await fireEvent.changeText(field(), "   ");
  await press("Done");
  expect(state().project!.cover).toBeNull();
  expect(state().past).toHaveLength(0);
});

test("without a cover, a title alone or a time alone is a cover", async () => {
  await open();
  await fireEvent.changeText(field(), "Trip");
  await press("Done");
  expect(state().project!.cover).toEqual({ time: 0, title: "Trip" });
  expect(state().past).toHaveLength(1);
  await open();
  await fireEvent(slider(), "valueChange", 3);
  await press("Done");
  expect(state().project!.cover).toEqual({ time: 3, title: "" });
});

test("Done on the first frame without a title keeps a cover the project already has at 0 as it is, and can clear its title", async () => {
  await open({ time: 0, title: "Trip" });
  await fireEvent.changeText(field(), "");
  await press("Done");
  expect(state().project!.cover).toEqual({ time: 0, title: "" });
  expect(state().past).toHaveLength(1);
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
  await waitFor(() => expect(screen.getByTestId("cover-image").props.source).toEqual({ uri: "file:///f-2-thumb.jpg" }));
  await screen.rerender(<CoverSheet visible={false} onClose={onClose} />);
  frame.mockReturnValueOnce(new Promise(() => {}));   // the stored cover's still is slow to come
  await screen.rerender(<CoverSheet visible onClose={onClose} />);
  expect(slider().props.value).toBe(5);
  expect(field().props.value).toBe("Trip");
  // The frame of the discarded draft is not shown (nor saved) while the right one loads.
  expect(screen.queryByTestId("cover-image")).toBeNull();
});

test("Save to Photos captures the frame view and saves it", async () => {
  await open();
  await press("Save to Photos");
  await waitFor(() => expect(screen.getByText("Saved to Photos")).toBeTruthy());
  expect(permission).toHaveBeenCalledWith(true);
  expect(capture).toHaveBeenCalledTimes(1);
  // 1080 × 1920 pixels on a 3× screen is 360 × 640 points.
  expect(capture.mock.calls[0][1]).toEqual({ format: "jpg", quality: 0.92, result: "tmpfile", width: 360, height: 640 });
  expect(save).toHaveBeenCalledWith("file:///tmp/cover.jpg");
  expect(release).toHaveBeenCalledTimes(1);
  expect(release).toHaveBeenCalledWith("file:///tmp/cover.jpg");
  expect(state().past).toHaveLength(0);
});

test("the saved picture is 1080 pixels wide at any screen scale and aspect ratio", async () => {
  pixelRatio.mockReturnValue(2);
  state().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 4 })], aspectRatio: "1:1" }));
  await render(<CoverSheet visible onClose={jest.fn()} />);
  await press("Save to Photos");
  await waitFor(() => expect(screen.getByText("Saved to Photos")).toBeTruthy());
  expect(capture.mock.calls[0][1]).toMatchObject({ width: 540, height: 540 });
});

test("the temporary capture is removed even when saving it fails; nothing to remove when the capture itself fails", async () => {
  await open();
  save.mockRejectedValueOnce(new Error("no room"));
  await press("Save to Photos");
  await waitFor(() => expect(screen.getByText("Couldn't save the cover.")).toBeTruthy());
  expect(release).toHaveBeenCalledWith("file:///tmp/cover.jpg");
  release.mockClear();
  capture.mockRejectedValueOnce(new Error("no view"));
  await press("Save to Photos");
  await waitFor(() => expect(capture).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(saveButton()).toBeEnabled());
  expect(release).not.toHaveBeenCalled();
});

test("while the title is being typed the frame is small (the keyboard must not hide Done) and Save waits for the full-size frame", async () => {
  await open();
  expect(screen.getByTestId("cover-frame")).toHaveStyle({ width: 135, height: 240 });
  expect(field().props.returnKeyType).toBe("done");
  await fireEvent(field(), "focus");
  expect(screen.getByTestId("cover-frame")).toHaveStyle({ width: 67.5, height: 120 });
  expect(saveButton()).toBeDisabled();
  await press("Save to Photos");
  expect(permission).not.toHaveBeenCalled();
  expect(capture).not.toHaveBeenCalled();
  // The return key ends the typing: full size again, Save usable.
  await fireEvent(field(), "submitEditing");
  expect(screen.getByTestId("cover-frame")).toHaveStyle({ width: 135, height: 240 });
  expect(saveButton()).toBeEnabled();
  await fireEvent(field(), "focus");
  await fireEvent(field(), "blur");
  expect(screen.getByTestId("cover-frame")).toHaveStyle({ height: 240 });
  await press("Save to Photos");
  await waitFor(() => expect(screen.getByText("Saved to Photos")).toBeTruthy());
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
  expect(saveButton()).toBeDisabled();   // and looks it
  await press("Save to Photos");
  allow({ granted: true });
  await waitFor(() => expect(screen.getByText("Saved to Photos")).toBeTruthy());
  expect(permission).toHaveBeenCalledTimes(1);
  expect(capture).toHaveBeenCalledTimes(1);
  expect(saveButton()).toBeEnabled();
});

test("renders nothing for an empty project", async () => {
  state().setProject(makeProject());
  await render(<CoverSheet visible onClose={jest.fn()} />);
  expect(screen.queryByRole("header", { name: "Cover" })).toBeNull();
  expect(screen.queryByTestId("cover-time")).toBeNull();
});
