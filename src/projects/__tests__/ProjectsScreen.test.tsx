import { Alert, StyleSheet } from "react-native";
import { AFTER_PICKER_MS } from "@/src/projects/AspectRatioSheet";
import { AFTER_SHEET_MS } from "@/src/projects/ProjectActionsSheet";
import { theme } from "@/src/theme/theme";
import { RATIO_SHAPE_SIZE } from "@/src/ui/RatioShape";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react-native";

jest.mock("expo-router", () => ({ router: { push: jest.fn() }, useFocusEffect: (cb: () => void) => { const React = require("react"); React.useEffect(cb, []); } }));
jest.mock("@/src/projects/pickMedia", () => ({ pickMedia: jest.fn() }));
jest.mock("@/src/publish/pickVideo", () => ({ pickVideoForPost: jest.fn() }));
jest.mock("@/src/projects", () => ({
  storage: {
    listProjects: jest.fn(), createProject: jest.fn(), renameProject: jest.fn(), duplicateProject: jest.fn(), deleteProject: jest.fn(),
  },
}));

import { router } from "expo-router";
import { useToast } from "@/src/ui/Toast";
import { storage } from "@/src/projects";
import { pickMedia } from "@/src/projects/pickMedia";
import { pickVideoForPost } from "@/src/publish/pickVideo";
import ProjectsScreen from "@/app/index";

const list = storage.listProjects as jest.Mock;
const mockPush = router.push as jest.Mock;

beforeEach(() => jest.clearAllMocks());

test("shows the empty state, then creates a project from picked videos and opens the editor", async () => {
  list.mockResolvedValue([]);
  (pickMedia as jest.Mock).mockResolvedValueOnce([{ uri: "file:///a.mov", kind: "video", durationSec: 3, width: 1080, height: 1920 }]);
  (storage.createProject as jest.Mock).mockResolvedValueOnce({ project: { id: "p9" }, failed: 0 });
  await render(<ProjectsScreen />);
  expect(await screen.findByText("Your voyages")).toBeTruthy();
  expect(await screen.findByText("No clips yet")).toBeTruthy();
  expect(screen.getByText("Pick some photos or videos from your library and start your first edit.")).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: "New project" }));
  await fireEvent.press(await screen.findByRole("button", { name: "Create" }));
  await waitFor(() => expect(storage.createProject).toHaveBeenCalledWith("Project 1", expect.any(Array), "auto"));
  await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/editor/p9"));
});

describe("the aspect-ratio picker when a project is created", () => {
  const LABELS = ["Auto", "1:1", "3:2", "2:3", "16:9", "9:16", "4:3", "3:4", "21:9"];
  const picked = [{ uri: "file:///a.mov", kind: "video", durationSec: 3, width: 1920, height: 1080 }, { uri: "file:///b.jpg", kind: "photo", durationSec: 0, width: 3024, height: 4032 }];
  const start = async () => {
    list.mockResolvedValue([]);
    (pickMedia as jest.Mock).mockResolvedValueOnce(picked);
    (storage.createProject as jest.Mock).mockResolvedValueOnce({ project: { id: "p9" }, failed: 0 });
    await render(<ProjectsScreen />);
    await fireEvent.press(await screen.findByRole("button", { name: "New project" }));
    return screen.findByRole("header", { name: "Aspect ratio" });
  };
  const options = () => within(screen.getByTestId("aspect-options")).getAllByRole("button");
  // A queued result a test did not use must not leak into the next one (clearAllMocks keeps the queue).
  afterEach(() => { (storage.createProject as jest.Mock).mockReset(); (pickMedia as jest.Mock).mockReset(); });

  test("nothing is shown before media is picked; a cancelled library creates nothing and shows no picker", async () => {
    list.mockResolvedValue([]);
    (pickMedia as jest.Mock).mockResolvedValueOnce(null);
    await render(<ProjectsScreen />);
    expect(screen.queryByRole("header", { name: "Aspect ratio" })).toBeNull();
    await fireEvent.press(await screen.findByRole("button", { name: "New project" }));
    await waitFor(() => expect(pickMedia).toHaveBeenCalledTimes(1));
    await act(async () => { await new Promise((r) => setTimeout(r, AFTER_PICKER_MS + 50)); });
    expect(screen.queryByRole("header", { name: "Aspect ratio" })).toBeNull();
    expect(storage.createProject).not.toHaveBeenCalled();
  });

  test("after the media is picked: nine choices in order, Auto preselected and drawn in the first item's shape; nothing is created yet", async () => {
    expect(await start()).toBeTruthy();
    expect(options().map((o) => o.props.accessibilityLabel)).toEqual(LABELS);
    expect(options().map((o) => o.props.accessibilityState.selected)).toEqual(LABELS.map((l) => l === "Auto"));
    expect(within(options()[0]).getByTestId("ratio-shape")).toHaveStyle({ width: RATIO_SHAPE_SIZE, height: RATIO_SHAPE_SIZE / (16 / 9) });
    expect(within(options()[5]).getByTestId("ratio-shape")).toHaveStyle({ width: RATIO_SHAPE_SIZE * 9 / 16, height: RATIO_SHAPE_SIZE });
    expect(storage.createProject).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  test("picking a ratio marks it; Create makes the project with it and opens the editor", async () => {
    await start();
    await fireEvent.press(screen.getByRole("button", { name: "21:9" }));
    expect(options().map((o) => o.props.accessibilityState.selected)).toEqual(LABELS.map((l) => l === "21:9"));
    expect(storage.createProject).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole("button", { name: "Create" }));
    await waitFor(() => expect(storage.createProject).toHaveBeenCalledWith("Project 1", picked, "21:9"));
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/editor/p9"));
    expect(storage.createProject).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole("header", { name: "Aspect ratio" })).toBeNull());
  });

  test("cancelling the picker creates nothing; the next time starts from Auto again", async () => {
    await start();
    await fireEvent.press(screen.getByRole("button", { name: "1:1" }));
    await fireEvent.press(screen.getByLabelText("Close sheet"));
    await waitFor(() => expect(screen.queryByRole("header", { name: "Aspect ratio" })).toBeNull());
    expect(storage.createProject).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
    (pickMedia as jest.Mock).mockResolvedValueOnce(picked);
    await fireEvent.press(screen.getByRole("button", { name: "New project" }));
    await screen.findByRole("header", { name: "Aspect ratio" });
    expect(options().map((o) => o.props.accessibilityState.selected)).toEqual(LABELS.map((l) => l === "Auto"));
  });

  test("a second tap on Create while the project is being made does not make two", async () => {
    await start();
    await fireEvent.press(screen.getByRole("button", { name: "Create" }));
    const again = screen.queryByRole("button", { name: "Create" });
    if (again) await fireEvent.press(again);
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/editor/p9"));
    expect(storage.createProject).toHaveBeenCalledTimes(1);
  });

  test("a sheet iOS never presented cannot block New project: the next press opens the library again and its pick replaces the stale one", async () => {
    await start(); // media is waiting for its ratio — on the phone the sheet may never have appeared
    const other = [{ uri: "file:///c.mov", kind: "video", durationSec: 5, width: 1080, height: 1080 }];
    let pick: (v: unknown) => void = () => {};
    (pickMedia as jest.Mock).mockImplementationOnce(() => new Promise((r) => { pick = r; }));
    // (A press resolves only when its handler has finished: this one is awaited once the library has answered.)
    const pressed = fireEvent.press(screen.getByRole("button", { name: "New project" }));
    await waitFor(() => expect(pickMedia).toHaveBeenCalledTimes(2));
    // The stale pick is dropped as the library opens (so the sheet is presented afresh afterwards) …
    await waitFor(() => expect(screen.queryByRole("header", { name: "Aspect ratio" })).toBeNull());
    // … and a third press while the library is up does nothing.
    await fireEvent.press(screen.getByRole("button", { name: "New project" }));
    expect(pickMedia).toHaveBeenCalledTimes(2);
    pick(other);
    await pressed;
    await screen.findByRole("header", { name: "Aspect ratio" });
    await fireEvent.press(screen.getByRole("button", { name: "Create" }));
    await waitFor(() => expect(storage.createProject).toHaveBeenCalledWith("Project 1", other, "auto"));
    expect(storage.createProject).toHaveBeenCalledTimes(1);
  });

  test("a lost sheet and then a cancelled library: nothing is waiting any more, and New project still works", async () => {
    await start();
    (pickMedia as jest.Mock).mockResolvedValueOnce(null).mockResolvedValueOnce(picked);
    await fireEvent.press(screen.getByRole("button", { name: "New project" }));
    await waitFor(() => expect(pickMedia).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole("header", { name: "Aspect ratio" })).toBeNull());
    await fireEvent.press(screen.getByRole("button", { name: "New project" }));
    await waitFor(() => expect(pickMedia).toHaveBeenCalledTimes(3));
    await screen.findByRole("header", { name: "Aspect ratio" });
    expect(storage.createProject).not.toHaveBeenCalled();
  });

  test("while the project is being made (the media is copied) New project does nothing", async () => {
    await start();
    let made: (v: unknown) => void = () => {};
    (storage.createProject as jest.Mock).mockReset();
    (storage.createProject as jest.Mock).mockImplementationOnce(() => new Promise((r) => { made = r; }));
    const pressed = fireEvent.press(screen.getByRole("button", { name: "Create" }));
    await waitFor(() => expect(storage.createProject).toHaveBeenCalledTimes(1));
    await fireEvent.press(screen.getByRole("button", { name: "New project" }));
    expect(pickMedia).toHaveBeenCalledTimes(1);
    made({ project: { id: "p9" }, failed: 0 });
    await pressed;
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/editor/p9"));
    // Afterwards it works again.
    (pickMedia as jest.Mock).mockResolvedValueOnce(picked);
    await fireEvent.press(screen.getByRole("button", { name: "New project" }));
    await waitFor(() => expect(pickMedia).toHaveBeenCalledTimes(2));
  });

  test("every choice is a 44-pt target or larger", async () => {
    await start();
    for (const o of options()) {
      const style = StyleSheet.flatten(o.props.style);
      expect(style.height).toBeGreaterThanOrEqual(theme.size.touch);
      expect(style.width).toBeGreaterThanOrEqual(theme.size.touch);
    }
  });
});

test("when nothing could be imported, the toast says so and the editor doesn't open", async () => {
  list.mockResolvedValue([]);
  (pickMedia as jest.Mock).mockResolvedValueOnce([{ uri: "file:///a.mov", kind: "video", durationSec: 3, width: 1080, height: 1920 }]);
  (storage.createProject as jest.Mock).mockRejectedValueOnce(new Error("Couldn't import any of the selected items."));
  const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  await render(<ProjectsScreen />);
  await fireEvent.press(await screen.findByRole("button", { name: "New project" }));
  await fireEvent.press(await screen.findByRole("button", { name: "Create" }));
  await waitFor(() => expect(useToast.getState().message).toBe("Couldn't import any of the selected items."));
  expect(mockPush).not.toHaveBeenCalled();
  warn.mockRestore();
});

test("the header's Accounts button opens the Accounts screen", async () => {
  list.mockResolvedValue([]);
  await render(<ProjectsScreen />);
  await fireEvent.press(await screen.findByRole("button", { name: "Accounts" }));
  expect(mockPush).toHaveBeenCalledWith("/accounts");
});

test("the header's Post a video button picks a video and opens the Post screen; cancelling stays home", async () => {
  list.mockResolvedValue([]);
  (pickVideoForPost as jest.Mock).mockResolvedValueOnce(null).mockResolvedValueOnce({ fileUri: "file:///pick.mov", durationSec: 21, fileSize: 14000000, mimeType: "video/quicktime" });
  await render(<ProjectsScreen />);
  const button = await screen.findByRole("button", { name: "Post a video" });
  await fireEvent.press(button);
  await waitFor(() => expect(pickVideoForPost).toHaveBeenCalledTimes(1));
  expect(mockPush).not.toHaveBeenCalled();
  await fireEvent.press(button);
  await waitFor(() => expect(mockPush).toHaveBeenCalledWith({ pathname: "/post", params: { fileUri: "file:///pick.mov", durationSec: "21", mimeType: "video/quicktime" } }));
});

test("lists projects with duration and marks broken ones", async () => {
  list.mockResolvedValueOnce([
    { id: "a", name: "Beach", durationSec: 65, updatedAt: new Date().toISOString(), thumbUri: null, broken: false, postedTo: [], coverTitle: "" },
    { id: "b", name: "Can't open", durationSec: 0, updatedAt: "", thumbUri: null, broken: true, postedTo: [], coverTitle: "" },
  ]);
  await render(<ProjectsScreen />);
  expect(await screen.findByText("Beach")).toBeTruthy();
  expect(screen.getByText("1:05")).toBeTruthy();
  expect(screen.getByText("Can't open")).toBeTruthy();
  await fireEvent.press(screen.getByText("Beach"));
  expect(mockPush).toHaveBeenCalledWith("/editor/a");
});

test("long-press opens the actions sheet; Delete confirms via Alert and removes", async () => {
  list.mockResolvedValue([{ id: "a", name: "Beach", durationSec: 65, updatedAt: new Date().toISOString(), thumbUri: null, broken: false, postedTo: [], coverTitle: "" }]);
  const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
  await render(<ProjectsScreen />);
  const card = await screen.findByRole("button", { name: "Beach" });
  await fireEvent(card, "longPress");
  expect(await screen.findByRole("button", { name: "Rename" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Duplicate" })).toBeTruthy();
  jest.useFakeTimers();
  await fireEvent.press(screen.getByRole("button", { name: "Delete" }));
  expect(alert).not.toHaveBeenCalled();
  await act(async () => { jest.advanceTimersByTime(AFTER_SHEET_MS); });
  expect(alert).toHaveBeenCalledWith("Delete project?", "This can't be undone.", expect.any(Array));
  const buttons = alert.mock.calls[0][2] as { text: string; onPress?: () => void }[];
  await buttons.find((b) => b.text === "Delete")!.onPress!();
  await waitFor(() => expect(storage.deleteProject).toHaveBeenCalledWith("a"));
  alert.mockRestore();
  jest.useRealTimers();
});
