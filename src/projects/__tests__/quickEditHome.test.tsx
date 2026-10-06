import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react-native";

jest.mock("expo-router", () => ({ router: { push: jest.fn() }, useFocusEffect: (cb: () => void) => { const React = require("react"); React.useEffect(cb, []); } }));
jest.mock("@/src/projects/pickMedia", () => ({ pickMedia: jest.fn() }));
jest.mock("@/src/publish/pickVideo", () => ({ pickVideoForPost: jest.fn() }));
jest.mock("@/src/projects", () => ({
  storage: { listProjects: jest.fn(), createProject: jest.fn(), renameProject: jest.fn(), duplicateProject: jest.fn(), deleteProject: jest.fn(), importAudio: jest.fn(), saveProject: jest.fn() },
}));
jest.mock("@/src/projects/quickEditFlow", () => ({ makeQuickEdit: jest.fn() }));
jest.mock("@/src/lib/id", () => ({ newId: () => "new-id" }));

import { router } from "expo-router";
import ProjectsScreen from "@/app/index";
import { storage } from "@/src/projects";
import { pickMedia } from "@/src/projects/pickMedia";
import { AFTER_SHEET_MS } from "@/src/projects/ProjectActionsSheet";
import { makeQuickEdit } from "@/src/projects/quickEditFlow";
import { theme } from "@/src/theme/theme";
import { useToast } from "@/src/ui/Toast";

const list = storage.listProjects as jest.Mock;
const pick = pickMedia as jest.Mock;
const make = makeQuickEdit as jest.Mock;
const push = router.push as jest.Mock;
const PICKED = [{ uri: "file:///a.jpg", kind: "photo", durationSec: 0, width: 3024, height: 4032 }, { uri: "file:///b.mov", kind: "video", durationSec: 5, width: 1920, height: 1080 }];
const btn = (name: string) => screen.getByRole("button", { name });
const styles = () => within(screen.getByTestId("quick-styles")).getAllByRole("button");
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, AFTER_SHEET_MS + 50)); });
let warn: jest.SpyInstance;

beforeEach(() => { jest.clearAllMocks(); pick.mockReset(); make.mockReset(); list.mockResolvedValue([]); useToast.getState().clear(); warn = jest.spyOn(console, "warn").mockImplementation(() => {}); });
afterEach(() => warn.mockRestore());

const openSheet = async () => {
  await render(<ProjectsScreen />);
  await screen.findByText("No clips yet");
  await fireEvent.press(btn("Quick edit"));
  return screen.findByRole("header", { name: "Quick edit" });
};

test("Quick edit sits beside New clip: an outlined button on a pill of its own; New clip stays the one gold button", async () => {
  await render(<ProjectsScreen />);
  await screen.findByText("No clips yet");
  expect(screen.getAllByTestId("primary-button")).toHaveLength(1);
  expect(screen.getByTestId("primary-button")).toHaveAccessibleName("New clip");
  expect(screen.getByTestId("home-actions")).toHaveStyle({ flexDirection: "row", justifyContent: "center", gap: theme.space.md });
  expect(btn("Quick edit").parent).toHaveStyle({ borderRadius: theme.radius.pill, backgroundColor: theme.elevation.bar });
  expect(screen.queryByRole("header", { name: "Quick edit" })).toBeNull();
});

test("the sheet: six styles in order, Travel preselected, its music named; picking another one moves the ring", async () => {
  expect(await openSheet()).toBeTruthy();
  expect(styles().map((s) => s.props.accessibilityLabel)).toEqual(["Travel", "Party", "Calm", "Cinematic", "Retro", "Vlog"]);
  expect(styles().map((s) => s.props.accessibilityState.selected)).toEqual([true, false, false, false, false, false]);
  expect(screen.getByText(/^Music: The Field of Dreams\. /)).toBeTruthy();
  await fireEvent.press(btn("Party"));
  expect(styles().map((s) => s.props.accessibilityState.selected)).toEqual([false, true, false, false, false, false]);
  expect(screen.getByText(/^Music: Party Sector\. /)).toBeTruthy();
  expect(pick).not.toHaveBeenCalled();
  expect(make).not.toHaveBeenCalled();
});

test("closing the sheet makes nothing", async () => {
  await openSheet();
  await fireEvent.press(screen.getByLabelText("Close sheet"));
  await settle();
  expect(pick).not.toHaveBeenCalled();
  expect(make).not.toHaveBeenCalled();
});

test("style, then media, then the draft: up to 30 items in the order tapped, a spinner while it is made, and the editor opens on it", async () => {
  pick.mockResolvedValueOnce(PICKED);
  make.mockImplementationOnce(() => new Promise((r) => setTimeout(() => r({ id: "q1", failed: 0 }), 300)));   // long enough to see the spinner
  await openSheet();
  await fireEvent.press(btn("Retro"));
  // RNTL awaits an async press handler to its end, so the press is awaited only after the spinner has been seen.
  const pressed = fireEvent.press(btn("Choose photos and videos"));
  expect(await screen.findByTestId("home-making")).toBeTruthy();
  expect(pick).toHaveBeenCalledWith({ limit: 30 });
  expect(make).toHaveBeenCalledTimes(1);
  expect(make.mock.calls[0].slice(1)).toEqual(["Project 1", PICKED, "retro"]);
  expect(screen.getByText("Making your quick edit")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "New clip" })).toBeNull();   // nothing else can be started meanwhile
  expect(screen.queryByRole("button", { name: "Quick edit" })).toBeNull();
  await pressed;
  await waitFor(() => expect(push).toHaveBeenCalledWith("/editor/q1"));
  expect(screen.queryByTestId("home-making")).toBeNull();
  expect(btn("New clip")).toBeTruthy();
});

test("the library is cancelled: no draft, no spinner, the buttons are back", async () => {
  pick.mockResolvedValueOnce(null);
  await openSheet();
  await fireEvent.press(btn("Choose photos and videos"));
  await settle();
  expect(pick).toHaveBeenCalledTimes(1);
  expect(make).not.toHaveBeenCalled();
  expect(push).not.toHaveBeenCalled();
  expect(btn("Quick edit")).toBeTruthy();
});

test("the draft cannot be made: a toast, no editor, the buttons are back", async () => {
  pick.mockResolvedValueOnce(PICKED);
  make.mockRejectedValueOnce(new Error("disk full"));
  await openSheet();
  await fireEvent.press(btn("Choose photos and videos"));
  await settle();
  await waitFor(() => expect(useToast.getState().message).toBe("Couldn't make the quick edit"));
  expect(push).not.toHaveBeenCalled();
  expect(btn("Quick edit")).toBeTruthy();
});

test("nothing could be imported: the toast says so; some could not: the draft opens and the toast counts them", async () => {
  pick.mockResolvedValueOnce(PICKED);
  make.mockRejectedValueOnce(new Error("Couldn't import any of the selected items."));
  await openSheet();
  await fireEvent.press(btn("Choose photos and videos"));
  await settle();
  await waitFor(() => expect(useToast.getState().message).toBe("Couldn't import any of the selected items."));
  pick.mockResolvedValueOnce(PICKED);
  make.mockResolvedValueOnce({ id: "q2", failed: 1 });
  await fireEvent.press(btn("Quick edit"));
  await fireEvent.press(await screen.findByRole("button", { name: "Choose photos and videos" }));
  await settle();
  await waitFor(() => expect(push).toHaveBeenCalledWith("/editor/q2"));
  expect(useToast.getState().message).toBe("1 of 2 clips added; 1 couldn't be read");
});
