import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react-native";
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
jest.mock("@/src/editor/coverFrame", () => ({ frameUriAt: jest.fn(async (_p: unknown, t: number, exact?: boolean) => `file:///f-${t}-${exact ? "still" : "thumb"}.jpg`) }));
jest.mock("react-native-view-shot", () => ({ captureRef: jest.fn(async () => "file:///tmp/cover.jpg"), releaseCapture: jest.fn() }));
jest.mock("expo-media-library/legacy", () => ({ requestPermissionsAsync: jest.fn(async () => ({ granted: true })), saveToLibraryAsync: jest.fn(async () => {}) }));
import { requestPermissionsAsync, saveToLibraryAsync } from "expo-media-library/legacy";
import { Dimensions, PixelRatio } from "react-native";
import { captureRef, releaseCapture } from "react-native-view-shot";
import { COVER_FONT } from "@/src/editor/coverFont";
import { frameUriAt } from "@/src/editor/coverFrame";
import * as timeline from "@/src/editor/model/timeline";
import { makeClip, makeProject, type Cover } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { theme } from "@/src/theme/theme";
import { useKeyboard } from "@/src/ui/keyboard";
import { PANEL, panelHeight } from "@/src/ui/ToolPanel";
import { ToneContext } from "@/src/ui/tone";
import { CoverSheet } from "../components/CoverSheet";

const frame = frameUriAt as jest.Mock;
const capture = captureRef as jest.Mock;
const release = releaseCapture as jest.Mock;
const permission = requestPermissionsAsync as jest.Mock;
const save = saveToLibraryAsync as jest.Mock;

const H = Dimensions.get("window").height;
const state = () => useEditorStore.getState();
const slider = () => screen.getByTestId("cover-time");
const field = () => screen.getByLabelText("Cover title");
const press = (name: string) => fireEvent.press(screen.getByRole("button", { name }));
/** One drag of the slider through these values: finger down, the values, finger up on the last one. */
const drag = async (...values: number[]) => {
  await fireEvent(slider(), "slidingStart", slider().props.value);
  for (const v of values) await fireEvent(slider(), "valueChange", v);
  await fireEvent(slider(), "slidingComplete", values[values.length - 1]);
};

/** As in the app: the editor says its family once, on its Screen (src/ui/tone.ts); a part rendered bare would be on a navy screen. */
const inEditor = { wrapper: ({ children }: { children: React.ReactNode }) => <ToneContext.Provider value="editor">{children}</ToneContext.Provider> };

async function open(cover: Cover | null = null) {
  state().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 4 }), makeClip({ id: "b", sourceDuration: 6 })], aspectRatio: "9:16", cover }));
  const onClose = jest.fn();
  await render(<CoverSheet visible onClose={onClose} />, inEditor);
  await waitFor(() => expect(frame).toHaveBeenCalled());
  return onClose;
}

// A 3× iPhone: view-shot takes its size in points and multiplies by the screen's scale.
let pixelRatio: jest.SpyInstance;
beforeEach(() => { jest.clearAllMocks(); state().reset(); pixelRatio = jest.spyOn(PixelRatio, "get").mockReturnValue(3); });
afterEach(() => { pixelRatio.mockRestore(); useKeyboard.setState({ height: 0 }); });
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

test("opens on the stored cover (read clamped, nothing written)", async () => {
  await open({ time: 99, title: "Trip" });
  expect(slider().props.value).toBe(10);
  expect(field().props.value).toBe("Trip");
  expect(screen.getByTestId("cover-title")).toHaveTextContent("Trip");
  expect(screen.getByTestId("cover-title")).toHaveStyle({ fontFamily: COVER_FONT });   // the cover is the owner's content: it keeps its own font
  expect(state().project!.cover).toEqual({ time: 99, title: "Trip" });
  expect(state().past).toHaveLength(0);
});

test("Cover is an inline panel: no Modal and no scrim, an explicit height, rows with explicit heights", async () => {
  await open();
  expect(screen.getByRole("header", { name: "Cover" })).toBeTruthy();
  expect(screen.getByTestId("tool-panel")).toHaveStyle({ height: panelHeight("regular", H) - 1 });
  expect(screen.getByTestId("tool-panel-body")).toHaveStyle({ height: panelHeight("regular", H) - 1 - PANEL.header - PANEL.lead });
  expect(screen.queryByLabelText("Close sheet")).toBeNull();
  expect(screen.queryByTestId("tool-strip")).toBeNull();
  expect(JSON.stringify(screen.toJSON())).not.toContain('"type":"Modal"');
  expect(JSON.stringify(screen.toJSON())).toContain('"type":"View"');   // the tree really is in that string
  expect(screen.getByTestId("cover-frame-row")).toHaveStyle({ height: 240 });
  expect(screen.getByTestId("cover-time-row")).toHaveStyle({ height: theme.size.touch });
});

test("the slider sits above the body and does not scroll; the body is the frame, the title, then Save to Photos", async () => {
  await open();
  expect(within(screen.getByTestId("tool-panel-lead")).getByTestId("cover-time")).toBeTruthy();
  const body = screen.getByTestId("tool-panel-body");
  expect(within(body).queryByTestId("cover-time")).toBeNull();
  const tree = JSON.stringify(screen.toJSON());
  const at = ["cover-time-row", "tool-panel-body", "cover-frame-row", "Cover title", "Save to Photos"].map((name) => tree.indexOf(`"${name}"`));
  expect(at.every((i) => i >= 0)).toBe(true);
  expect(at).toEqual([...at].sort((a, b) => a - b));
});

test("closed, the panel reads nothing from the clips when the store changes", async () => {
  state().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 4 })], aspectRatio: "9:16", cover: { time: 2, title: "Trip" } }));
  await render(<CoverSheet visible={false} onClose={jest.fn()} />);
  const spies = [jest.spyOn(timeline, "coverTimeOf"), jest.spyOn(timeline, "totalDuration"), jest.spyOn(timeline, "frameAt")];
  try {
    await act(() => { useEditorStore.setState({ pixelsPerSecond: 81 }); });
    await act(() => { useEditorStore.setState({ pixelsPerSecond: 82 }); });
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  } finally { for (const spy of spies) spy.mockRestore(); }
  // Opened, it reads the stored cover.
  await screen.rerender(<CoverSheet visible onClose={jest.fn()} />);
  expect(slider().props.value).toBe(2);
  expect(slider().props.maximumValue).toBe(4);
  await waitFor(() => expect(frame).toHaveBeenLastCalledWith(state().project, 2, true));
});

test("opening and closing leaves the project and the playhead as they were", async () => {
  for (const cover of [null, { time: 5, title: "Trip" }]) {
    const onClose = await open(cover);
    state().seek(2);
    const before = state().project;
    await press("Done");
    expect(onClose).toHaveBeenCalledTimes(1);
    await screen.rerender(<CoverSheet visible={false} onClose={onClose} />);
    expect(screen.queryByTestId("tool-panel")).toBeNull();
    expect(state().project).toBe(before);
    expect(state().past).toHaveLength(0);
    expect(state().playhead).toBe(2);
    await screen.unmount();
  }
});

test("one drag of the slider is one undo step: the cover follows the finger, thumbnails while it moves, the exact still when it is let go", async () => {
  await open();
  const before = state().project;
  await drag(3, 4, 5);
  expect(state().project!.cover).toEqual({ time: 5, title: "" });
  expect(state().past).toHaveLength(1);
  expect(slider().props.value).toBe(5);
  expect(frame).toHaveBeenCalledWith(expect.anything(), 3, false);
  expect(frame).toHaveBeenCalledWith(expect.anything(), 5, false);
  expect(frame).toHaveBeenLastCalledWith(state().project, 5, true);
  await waitFor(() => expect(screen.getByTestId("cover-image").props.source).toEqual({ uri: "file:///f-5-still.jpg" }));
  expect(state().playhead).toBe(0);                                   // the white line is not moved by choosing a cover
  await act(() => { state().undo(); });
  expect(state().project).toBe(before);
  expect(slider().props.value).toBe(0);
  await waitFor(() => expect(frame).toHaveBeenLastCalledWith(before, 0, true));
  // A second drag is its own step.
  await drag(2);
  await drag(7);
  expect(state().past).toHaveLength(2);
});

test("a value that arrives without a drag (VoiceOver's swipe up / down) is its own undo step", async () => {
  await open();
  await fireEvent(slider(), "valueChange", 4);
  expect(state().project!.cover).toEqual({ time: 4, title: "" });
  expect(state().past).toHaveLength(1);
  expect(frame).toHaveBeenLastCalledWith(state().project, 4, true);
});

test("typing a title writes it: on the frame, counted, an unbroken run is one undo step", async () => {
  await open();
  expect(screen.queryByTestId("cover-title")).toBeNull();
  await fireEvent.changeText(field(), "Beach");
  await fireEvent.changeText(field(), "Beach day");
  expect(screen.getByTestId("cover-title")).toHaveTextContent("Beach day");
  expect(screen.getByText("9 / 40")).toBeTruthy();
  expect(state().project!.cover).toEqual({ time: 0, title: "Beach day" });
  expect(state().past).toHaveLength(1);
  await act(() => { state().undo(); });
  expect(field().props.value).toBe("");
  expect(state().project!.cover).toBeNull();
  // Typing after an Undo is a new step.
  await fireEvent.changeText(field(), "Trip");
  expect(state().past).toHaveLength(1);
  expect(state().future).toHaveLength(0);
});

test("typing after a drag was undone is a new undo step: the step the earlier typing opened is not continued while Redo is armed", async () => {
  await open();
  await fireEvent.changeText(field(), "Trip");
  expect(state().past).toHaveLength(1);
  await drag(5);
  expect(state().past).toHaveLength(2);
  await act(() => { state().undo(); });
  expect(state().project!.cover).toEqual({ time: 0, title: "Trip" });
  expect(state().future).toHaveLength(1);
  await fireEvent.changeText(field(), "Trip 2");
  // A new step, and the undone drag can no longer be redone over it.
  expect(state().past).toHaveLength(2);
  expect(state().future).toHaveLength(0);
  expect(state().project!.cover).toEqual({ time: 0, title: "Trip 2" });
  expect(field().props.value).toBe("Trip 2");
  // The run goes on as that one step.
  await fireEvent.changeText(field(), "Trip 23");
  expect(state().past).toHaveLength(2);
  // Each Undo lands on a whole state: the first typing, then no cover.
  await act(() => { state().undo(); });
  expect(state().project!.cover).toEqual({ time: 0, title: "Trip" });
  expect(field().props.value).toBe("Trip");
  await act(() => { state().undo(); });
  expect(state().project!.cover).toBeNull();
  expect(state().past).toHaveLength(0);
  expect(state().future).toHaveLength(2);
});

test("the field keeps the spaces being typed; the cover holds the title trimmed, and a space alone makes no undo step", async () => {
  await open({ time: 5, title: "Trip" });
  await fireEvent.changeText(field(), "Trip ");
  expect(field().props.value).toBe("Trip ");
  expect(state().past).toHaveLength(0);
  await fireEvent.changeText(field(), "Trip to");
  expect(state().project!.cover).toEqual({ time: 5, title: "Trip to" });
  expect(state().past).toHaveLength(1);
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

test("a title of spaces only on the first frame makes no cover and no undo step", async () => {
  await open();
  const before = state().project;
  await fireEvent.changeText(field(), "   ");
  expect(state().project).toBe(before);
  expect(state().past).toHaveLength(0);
});

test("without a cover, a title alone or a time alone is a cover", async () => {
  await open();
  await fireEvent.changeText(field(), "Trip");
  expect(state().project!.cover).toEqual({ time: 0, title: "Trip" });
  expect(state().past).toHaveLength(1);
  await screen.unmount();
  await open();
  await drag(3);
  expect(state().project!.cover).toEqual({ time: 3, title: "" });
});

test("the first frame with the title cleared is no cover (a blank cover is no cover), as one undo step", async () => {
  await open({ time: 0, title: "Trip" });
  await fireEvent.changeText(field(), "");
  expect(state().project!.cover).toBeNull();
  expect(state().past).toHaveLength(1);
});

test("the slider and the title each keep what the other set", async () => {
  await open();
  await drag(5);
  await fireEvent.changeText(field(), "  Beach day ");
  expect(state().project!.cover).toEqual({ time: 5, title: "Beach day" });
  await drag(2);
  expect(state().project!.cover).toEqual({ time: 2, title: "Beach day" });
  expect(state().past).toHaveLength(3);
});

test("Done only closes: what was chosen is already the cover", async () => {
  const onClose = await open({ time: 5, title: "Trip" });
  await drag(2);
  const chosen = state().project;
  await press("Done");
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(state().project).toBe(chosen);
  expect(state().past).toHaveLength(1);
});

test("Reset clears the cover (one undo step); a second Reset does nothing; the panel stays open", async () => {
  const onClose = await open({ time: 5, title: "Trip" });
  await press("Reset");
  expect(state().project!.cover).toBeNull();
  expect(state().past).toHaveLength(1);
  expect(slider().props.value).toBe(0);
  expect(field().props.value).toBe("");
  expect(screen.queryByTestId("cover-title")).toBeNull();
  await waitFor(() => expect(frame).toHaveBeenLastCalledWith(state().project, 0, true));
  await press("Reset");
  expect(state().past).toHaveLength(1);
  expect(onClose).not.toHaveBeenCalled();
});

test("an Undo while the panel is open shows in the slider, the field and the frame", async () => {
  await open({ time: 5, title: "Trip" });
  await press("Reset");
  await act(() => { state().undo(); });
  expect(slider().props.value).toBe(5);
  expect(field().props.value).toBe("Trip");
  expect(screen.getByTestId("cover-title")).toHaveTextContent("Trip");
  await waitFor(() => expect(screen.getByTestId("cover-image").props.source).toEqual({ uri: "file:///f-5-still.jpg" }));
});

test("reopening starts from the stored cover, and never shows the frame of the last opening while this one loads", async () => {
  const onClose = await open({ time: 5, title: "Trip" });
  await waitFor(() => expect(screen.getByTestId("cover-image").props.source).toEqual({ uri: "file:///f-5-still.jpg" }));
  await screen.rerender(<CoverSheet visible={false} onClose={onClose} />);
  await act(() => { state().apply((p) => ({ ...p, cover: { time: 2, title: "Other" } })); });
  frame.mockReturnValueOnce(new Promise(() => {}));   // the stored cover's still is slow to come
  await screen.rerender(<CoverSheet visible onClose={onClose} />);
  expect(slider().props.value).toBe(2);
  expect(field().props.value).toBe("Other");
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

test("the frame is the same size whatever happens (it is the picture that is saved); Save waits while the keyboard is up", async () => {
  await open();
  expect(screen.getByTestId("cover-frame")).toHaveStyle({ width: 135, height: 240 });
  expect(field().props.returnKeyType).toBe("done");
  await fireEvent(field(), "focus");
  await act(() => { useKeyboard.setState({ height: 336 }); });
  // The panel takes its typing height (the host pads the keyboard); the frame is still there, full size, scrolled out of the way.
  expect(screen.getByTestId("tool-panel")).toHaveStyle({ height: panelHeight("regular", H, true) - 1 });
  expect(screen.getByTestId("cover-frame")).toHaveStyle({ width: 135, height: 240 });
  expect(saveButton()).toBeDisabled();
  expect(screen.getByText("Close the keyboard to save.")).toBeTruthy();   // why it is disabled, said above the button
  await press("Save to Photos");
  expect(permission).not.toHaveBeenCalled();
  expect(capture).not.toHaveBeenCalled();
  // The keyboard gone: Save usable, and the reason gone with it.
  await act(() => { useKeyboard.setState({ height: 0 }); });
  expect(saveButton()).toBeEnabled();
  expect(screen.queryByText("Close the keyboard to save.")).toBeNull();
  await press("Save to Photos");
  await waitFor(() => expect(screen.getByText("Saved to Photos")).toBeTruthy());
});

test("a refused permission or a failed capture is said in the panel, which stays usable", async () => {
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
  expect(screen.queryByTestId("tool-panel")).toBeNull();
});

test("an Auto project's cover has the first clip's shape; a wide cover is saved 1080 pixels high", async () => {
  state().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 4, width: 1920, height: 1080 })], aspectRatio: "auto" }));
  const view = await render(<CoverSheet visible onClose={jest.fn()} />);
  await press("Save to Photos");
  await waitFor(() => expect(screen.getByText("Saved to Photos")).toBeTruthy());
  expect(capture.mock.calls[0][1]).toMatchObject({ width: 640, height: 360 });   // 1920 × 1080 pixels on a 3× screen
  await view.unmount();
  capture.mockClear();
  state().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 4 })], aspectRatio: "21:9" }));
  await render(<CoverSheet visible onClose={jest.fn()} />);
  await press("Save to Photos");
  await waitFor(() => expect(screen.getByText("Saved to Photos")).toBeTruthy());
  expect(capture.mock.calls[0][1]).toMatchObject({ width: 840, height: 360 });   // 2520 × 1080
});

describe("look", () => {
  test("the title is the kit field, the slider is the kit's, Reset is text only in the header, Save to Photos is the one main button, white", async () => {
    await open();
    expect(field()).toHaveStyle({ backgroundColor: theme.elevation.tile, fontSize: theme.type.input, paddingHorizontal: theme.space.md, paddingVertical: theme.space.md });
    expect(field()).toHaveProp("placeholder", "Add a title");
    expect(slider()).toHaveProp("maximumTrackTintColor", theme.colors.track);
    expect(slider()).toHaveProp("minimumTrackTintColor", theme.colors.accent);
    expect(screen.getByText("0 / 40")).toHaveStyle({ fontSize: theme.type.small });
    expect(screen.getByRole("button", { name: "Reset" })).not.toHaveStyle({ borderWidth: 1.5 });
    expect(screen.getAllByTestId("main-button")).toHaveLength(1);
    expect(screen.getByTestId("main-button")).toHaveAccessibleName("Save to Photos");
    expect(screen.getByTestId("main-button")).toHaveStyle({ backgroundColor: theme.plain.fill, height: theme.size.control });
    expect(screen.queryAllByTestId("primary-button")).toHaveLength(0);          // no gold fill inside a tool
  });
});
