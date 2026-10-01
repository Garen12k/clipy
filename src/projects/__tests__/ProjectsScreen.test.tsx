import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

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
  expect(await screen.findByText("No projects yet")).toBeTruthy();
  await fireEvent.press(screen.getByText("New Project"));
  await waitFor(() => expect(storage.createProject).toHaveBeenCalledWith("Project 1", expect.any(Array)));
  expect(mockPush).toHaveBeenCalledWith("/editor/p9");
});

test("lists projects with duration and marks broken ones", async () => {
  list.mockResolvedValueOnce([
    { id: "a", name: "Beach", durationSec: 65, updatedAt: new Date().toISOString(), thumbUri: null, broken: false },
    { id: "b", name: "Can't open", durationSec: 0, updatedAt: "", thumbUri: null, broken: true },
  ]);
  await render(<ProjectsScreen />);
  expect(await screen.findByText("Beach")).toBeTruthy();
  expect(screen.getByText("1:05")).toBeTruthy();
  expect(screen.getByText("Can't open")).toBeTruthy();
  await fireEvent.press(screen.getByText("Beach"));
  expect(mockPush).toHaveBeenCalledWith("/editor/a");
});
