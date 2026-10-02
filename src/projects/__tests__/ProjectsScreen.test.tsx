import { Alert } from "react-native";
import { AFTER_SHEET_MS } from "@/src/projects/ProjectActionsSheet";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";

jest.mock("expo-router", () => ({ router: { push: jest.fn() }, useFocusEffect: (cb: () => void) => { const React = require("react"); React.useEffect(cb, []); } }));
jest.mock("@/src/projects/pickVideos", () => ({ pickVideos: jest.fn() }));
jest.mock("@/src/projects", () => ({
  storage: {
    listProjects: jest.fn(), createProject: jest.fn(), renameProject: jest.fn(), duplicateProject: jest.fn(), deleteProject: jest.fn(),
  },
}));

import { router } from "expo-router";
import { storage } from "@/src/projects";
import { pickVideos } from "@/src/projects/pickVideos";
import ProjectsScreen from "@/app/index";

const list = storage.listProjects as jest.Mock;
const mockPush = router.push as jest.Mock;

beforeEach(() => jest.clearAllMocks());

test("shows the empty state, then creates a project from picked videos and opens the editor", async () => {
  list.mockResolvedValue([]);
  (pickVideos as jest.Mock).mockResolvedValueOnce([{ uri: "file:///a.mov", durationSec: 3, width: 1080, height: 1920 }]);
  (storage.createProject as jest.Mock).mockResolvedValueOnce({ project: { id: "p9" }, failed: 0 });
  await render(<ProjectsScreen />);
  expect(await screen.findByText("Your voyages")).toBeTruthy();
  expect(await screen.findByText("No clips yet")).toBeTruthy();
  expect(screen.getByText("Pick some videos from your library and start your first edit.")).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: "New clip" }));
  await waitFor(() => expect(storage.createProject).toHaveBeenCalledWith("Project 1", expect.any(Array)));
  expect(mockPush).toHaveBeenCalledWith("/editor/p9");
});

test("lists projects with duration and marks broken ones", async () => {
  list.mockResolvedValueOnce([
    { id: "a", name: "Beach", durationSec: 65, updatedAt: new Date().toISOString(), thumbUri: null, broken: false, postedTo: [] },
    { id: "b", name: "Can't open", durationSec: 0, updatedAt: "", thumbUri: null, broken: true, postedTo: [] },
  ]);
  await render(<ProjectsScreen />);
  expect(await screen.findByText("Beach")).toBeTruthy();
  expect(screen.getByText("1:05")).toBeTruthy();
  expect(screen.getByText("Can't open")).toBeTruthy();
  await fireEvent.press(screen.getByText("Beach"));
  expect(mockPush).toHaveBeenCalledWith("/editor/a");
});

test("long-press opens the actions sheet; Delete confirms via Alert and removes", async () => {
  list.mockResolvedValue([{ id: "a", name: "Beach", durationSec: 65, updatedAt: new Date().toISOString(), thumbUri: null, broken: false, postedTo: [] }]);
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
