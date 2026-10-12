// Home's two bottom actions at a larger text size. At the default the row holds them with nothing to spare on a 375-pt phone
// (158 + 12 + 173 = 343); larger, each would keep its natural width and the gold one would leave the screen. So above the default —
// and only there — both may give way and their labels shrink to the room each is given. Jest has no layout: these tests pin the
// PROPS that make it possible, and that the default tree has none of them.
jest.mock("expo-router", () => ({ router: { push: jest.fn() }, useFocusEffect: (cb: () => void) => { const React = require("react"); React.useEffect(cb, []); } }));
jest.mock("@/src/auth/welcomeSeen", () => ({ hasSeenWelcome: () => true, markWelcomeSeen: jest.fn() }));
jest.mock("@/src/projects/pickMedia", () => ({ pickMedia: jest.fn() }));
jest.mock("@/src/publish/pickVideo", () => ({ pickVideoForPost: jest.fn() }));
jest.mock("@/src/projects", () => ({
  storage: { listProjects: jest.fn(), createProject: jest.fn(), renameProject: jest.fn(), duplicateProject: jest.fn(), deleteProject: jest.fn(), importAudio: jest.fn(), saveProject: jest.fn() },
}));
jest.mock("@/src/projects/quickEditFlow", () => ({ makeQuickEdit: jest.fn() }));
jest.mock("@/src/lib/id", () => ({ newId: () => "new-id" }));

import { render, screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import ProjectsScreen from "@/app/index";
import { storage } from "@/src/projects";
import { theme } from "@/src/theme/theme";
import { textSize, unruled } from "@/src/ui/testing/textSize";

const list = storage.listProjects as jest.Mock;
const BEACH = { id: "a", name: "Beach", durationSec: 65, updatedAt: new Date().toISOString(), thumbUri: null, broken: false, postedTo: [], coverTitle: "" };
const XL = 1.118, XXXL = 1.353, AX5 = 3.571;
let warn: jest.SpyInstance;
beforeEach(() => { jest.clearAllMocks(); list.mockReset(); list.mockResolvedValue([BEACH]); warn = jest.spyOn(console, "warn").mockImplementation(() => {}); });
afterEach(async () => { warn.mockRestore(); await textSize(1); });

const home = async () => { await render(<ProjectsScreen />); await screen.findByText("Beach"); };
const flat = (node: { props: { style?: unknown } }) => StyleSheet.flatten(node.props.style as never) as Record<string, unknown>;
const backing = () => flat(screen.getByTestId("home-quick-backing"));
const button = (name: string) => flat(screen.getByRole("button", { name }));
const label = (text: string) => screen.getByText(text);

test("at the default size the row is what it always was: nothing shrinks, nothing is limited to a line", async () => {
  await home();
  expect(backing()).toEqual({ borderRadius: theme.radius.pill, backgroundColor: theme.screen.bar });
  for (const name of ["Quick Edit", "New Project"]) {
    expect(button(name)).not.toHaveProperty("flexShrink");
    expect(button(name).height).toBe(theme.size.control);
    expect(label(name).props.numberOfLines).toBeUndefined();
    expect(label(name).props.adjustsFontSizeToFit).toBeUndefined();
    expect(flat(label(name))).not.toHaveProperty("flexShrink");
  }
});

test.each([XL, XXXL, AX5])("at %s both actions share the row: each may give way, and its label shrinks to the room it gets", async (size) => {
  await home();
  await textSize(size);
  expect(flat(screen.getByTestId("home-actions"))).toMatchObject({ left: theme.space.gutter, right: theme.space.gutter, flexDirection: "row", gap: theme.space.md });
  expect(backing()).toMatchObject({ flexShrink: 1, borderRadius: theme.radius.pill });       // Quick Edit's pill gives way; the button in it is as wide as the pill
  expect(button("New Project")).toMatchObject({ flexShrink: 1 });                            // and so does the gold one: neither can leave the screen
  for (const name of ["Quick Edit", "New Project"]) {
    expect(button(name).height).toBe(theme.size.control);                                   // no height changed
    expect(label(name).props).toMatchObject({ numberOfLines: 1, adjustsFontSizeToFit: true, maxFontSizeMultiplier: theme.textScale.screen });
    expect(flat(label(name))).toMatchObject({ flexShrink: 1 });                              // the label is offered what is left beside the symbol
  }
  expect(unruled()).toEqual([]);
});

test("back at the default the row is the default row again", async () => {
  await home();
  await textSize(AX5);
  await textSize(1);
  expect(backing()).not.toHaveProperty("flexShrink");
  expect(button("New Project")).not.toHaveProperty("flexShrink");
});
