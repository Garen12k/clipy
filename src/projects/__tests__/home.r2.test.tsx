import { fireEvent, render, screen } from "@testing-library/react-native";
import { withDelay, withTiming } from "react-native-reanimated";

jest.mock("react-native-reanimated", () => {
  const m = require("react-native-reanimated/mock");
  return { ...m, withTiming: jest.fn(m.withTiming), withDelay: jest.fn(m.withDelay) };
});
jest.mock("expo-router", () => ({ router: { push: jest.fn() }, useFocusEffect: (cb: () => void) => { const React = require("react"); React.useEffect(cb, []); } }));
// Past first launch: the home route draws the projects, not the welcome screen (src/auth/__tests__/firstLaunch.test.tsx).
jest.mock("@/src/auth/welcomeSeen", () => ({ hasSeenWelcome: () => true, markWelcomeSeen: jest.fn() }));
jest.mock("@/src/projects/pickMedia", () => ({ pickMedia: jest.fn() }));
jest.mock("@/src/publish/pickVideo", () => ({ pickVideoForPost: jest.fn() }));
jest.mock("@/src/projects", () => ({
  storage: { listProjects: jest.fn(), createProject: jest.fn(), renameProject: jest.fn(), duplicateProject: jest.fn(), deleteProject: jest.fn() },
}));

import ProjectsScreen from "@/app/index";
import { storage } from "@/src/projects";
import { theme } from "@/src/theme/theme";
import { EASE } from "@/src/ui/motion";
import { setReducedMotionForTests } from "@/src/ui/useReducedMotion";

const list = storage.listProjects as jest.Mock;
const T = withTiming as jest.Mock, D = withDelay as jest.Mock;
const p = (id: string, name: string) => ({ id, name, durationSec: 65, updatedAt: new Date().toISOString(), thumbUri: null, broken: false, postedTo: [], coverTitle: "" });

beforeEach(() => { jest.clearAllMocks(); setReducedMotionForTests(false); });

test("the list eases in once when it first appears — not per card, not on a re-render, not after a duplicate", async () => {
  list.mockResolvedValue([p("a", "Beach"), p("b", "Hills"), p("c", "City")]);
  (storage.duplicateProject as jest.Mock).mockResolvedValue(undefined);
  const view = await render(<ProjectsScreen />);
  await screen.findByText("Beach");
  expect(T).toHaveBeenCalledTimes(1);                                              // one animation for three cards
  expect(T).toHaveBeenLastCalledWith(1, { duration: theme.motion.base, easing: EASE });
  expect(D).not.toHaveBeenCalled();                                                // no stagger
  await view.rerender(<ProjectsScreen />);
  list.mockResolvedValue([p("a", "Beach"), p("b", "Hills"), p("c", "City"), p("d", "Beach copy")]);
  await fireEvent(screen.getByRole("button", { name: "Beach" }), "longPress");
  await fireEvent.press(await screen.findByRole("button", { name: "Duplicate" }));
  await screen.findByText("Beach copy");                                           // the list was re-read and a card was added
  expect(T).toHaveBeenCalledTimes(1);
  expect(D).not.toHaveBeenCalled();
});

test("with Reduce Motion the list is simply there", async () => {
  setReducedMotionForTests(true);
  list.mockResolvedValue([p("a", "Beach")]);
  await render(<ProjectsScreen />);
  await screen.findByText("Beach");
  expect(T).not.toHaveBeenCalled();
});

test("one gold button, with and without projects; the header is a 48-pt row on the gutter", async () => {
  list.mockResolvedValue([]);
  const empty = await render(<ProjectsScreen />);
  await screen.findByText("No clips yet");
  expect(screen.getAllByTestId("primary-button")).toHaveLength(1);
  expect(screen.getByTestId("primary-button")).toHaveAccessibleName("New Project");
  expect(screen.getByTestId("home-header")).toHaveStyle({ height: theme.size.row, paddingLeft: theme.space.gutter, paddingRight: theme.space.sm, alignItems: "center" });
  expect(screen.getByRole("header", { name: "Projects" })).toHaveStyle({ fontSize: theme.type.screen });
  await empty.unmount();
  list.mockResolvedValue([p("a", "Beach")]);
  await render(<ProjectsScreen />);
  await screen.findByText("Beach");
  expect(screen.getAllByTestId("primary-button")).toHaveLength(1);
});
