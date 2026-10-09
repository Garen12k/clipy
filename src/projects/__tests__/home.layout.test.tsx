import { StyleSheet } from "react-native";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react-native";
import { withTiming } from "react-native-reanimated";

jest.mock("react-native-reanimated", () => {
  const m = require("react-native-reanimated/mock");
  return { ...m, withTiming: jest.fn(m.withTiming) };
});

jest.mock("expo-router", () => ({ router: { push: jest.fn() }, useFocusEffect: (cb: () => void) => { const React = require("react"); React.useEffect(cb, []); } }));
// Past first launch: the home route draws the projects, not the welcome screen (src/auth/__tests__/firstLaunch.test.tsx).
jest.mock("@/src/auth/welcomeSeen", () => ({ hasSeenWelcome: () => true, markWelcomeSeen: jest.fn() }));
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
import { makeQuickEdit } from "@/src/projects/quickEditFlow";
import { theme } from "@/src/theme/theme";
import { DISABLED_OPACITY } from "@/src/ui/buttonStyle";

const list = storage.listProjects as jest.Mock;
const createProject = storage.createProject as jest.Mock;
const pick = pickMedia as jest.Mock;
const make = makeQuickEdit as jest.Mock;
const push = router.push as jest.Mock;
const p = (id: string, name: string, over: object = {}) => ({ id, name, durationSec: 65, updatedAt: new Date().toISOString(), thumbUri: null, broken: false, postedTo: [], coverTitle: "", ...over });
const BEACH = p("a", "Beach"), HILLS = p("b", "Hills"), BROKEN = p("c", "Lost", { durationSec: 0, updatedAt: "", broken: true });
const PICKED = [{ uri: "file:///a.jpg", kind: "photo", durationSec: 0, width: 3024, height: 4032 }];
const btn = (name: string) => screen.getByRole("button", { name });
const sheetTitle = (name: string) => screen.queryByRole("header", { name });
let warn: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks(); pick.mockReset(); make.mockReset(); createProject.mockReset(); list.mockReset(); list.mockResolvedValue([BEACH, HILLS, BROKEN]);
  warn = jest.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => warn.mockRestore());
const home = async () => { await render(<ProjectsScreen />); await screen.findByText("Beach"); };

describe("the header", () => {
  test("the two actions keep their labels and share one pill, top right; each has a 44-pt target", async () => {
    await home();
    const pill = screen.getByTestId("home-header-actions");
    expect(within(pill).getAllByRole("button").map((b) => b.props.accessibilityLabel)).toEqual(["Post a video", "Accounts"]);
    expect(pill).toHaveStyle({ height: theme.size.touch, flexDirection: "row", borderRadius: theme.radius.pill, backgroundColor: theme.screen.bar });
    expect(pill.parent).toHaveStyle({ flexDirection: "row", justifyContent: "flex-end" });
    // 40-pt buttons with 8 pt of slop, in a pill 44 high with 4 pt at each end and between them: 44 by 44 each, inside the pill.
    for (const b of within(pill).getAllByRole("button")) {
      const s = StyleSheet.flatten(b.props.style);
      expect(s.width + theme.space.xs).toBeGreaterThanOrEqual(theme.size.touch);
      expect(b.props.hitSlop).toBeGreaterThanOrEqual((theme.size.touch - s.height) / 2);
    }
  });

  test("the title is a large title on its own line under them, on the gutter", async () => {
    await home();
    const header = screen.getByTestId("home-header");
    expect(header).toHaveStyle({ paddingHorizontal: theme.space.gutter });
    expect(StyleSheet.flatten(header.props.style).flexDirection).toBeUndefined();          // a column: the pill's row, then the title
    const title = screen.getByRole("header", { name: "Projects" });
    expect(title).toHaveStyle({ fontSize: theme.type.screen, fontWeight: theme.weight.bold, lineHeight: theme.text.largeTitle.leading });
    expect(within(screen.getByTestId("home-header-actions")).queryByText("Projects")).toBeNull();
    expect(within(screen.getByTestId("home-list")).queryByText("Projects")).toBeNull();     // it does not scroll with the list
  });
});

describe("a card's actions", () => {
  test("the More button opens the actions for ITS project, and does not open the editor", async () => {
    await home();
    await fireEvent.press(btn("More for Hills"));
    expect(await screen.findByRole("header", { name: "Hills" })).toBeTruthy();
    expect(btn("Rename")).toBeTruthy(); expect(btn("Duplicate")).toBeTruthy(); expect(btn("Delete")).toBeTruthy();
    expect(sheetTitle("Beach")).toBeNull();
    expect(push).not.toHaveBeenCalled();
  });

  test("More then Duplicate duplicates that project", async () => {
    (storage.duplicateProject as jest.Mock).mockResolvedValue(undefined);
    await home();
    await fireEvent.press(btn("More for Hills"));
    await fireEvent.press(await screen.findByRole("button", { name: "Duplicate" }));
    await waitFor(() => expect(storage.duplicateProject).toHaveBeenCalledWith("b"));
  });

  test("a long press still opens them", async () => {
    await home();
    await fireEvent(btn("Beach"), "longPress");
    expect(await screen.findByRole("header", { name: "Beach" })).toBeTruthy();
    expect(push).not.toHaveBeenCalled();
  });

  test("a tap on the picture opens the editor; no sheet", async () => {
    await home();
    await fireEvent.press(btn("Hills"));
    expect(push).toHaveBeenCalledWith("/editor/b");
    expect(push).toHaveBeenCalledTimes(1);
    expect(sheetTitle("Hills")).toBeNull();
  });

  test("a damaged project: a tap on the picture opens the actions, and so does More — Delete only, never the editor", async () => {
    await home();
    await fireEvent.press(btn("Lost"));
    expect(await screen.findByRole("header", { name: "Lost" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Rename" })).toBeNull();
    expect(btn("Delete")).toBeTruthy();
    await fireEvent.press(screen.getByLabelText("Close sheet"));
    await waitFor(() => expect(sheetTitle("Lost")).toBeNull());
    await fireEvent.press(btn("More for Lost"));
    expect(await screen.findByRole("header", { name: "Lost" })).toBeTruthy();
    expect(push).not.toHaveBeenCalled();
  });

  test("the grid is two columns in the one list; a damaged card has no length pill", async () => {
    await home();
    expect(screen.getAllByTestId("project-card-cell")).toHaveLength(3);
    for (const cell of screen.getAllByTestId("project-card-cell")) expect(cell).toHaveStyle({ width: "50%" });
    expect(screen.getAllByTestId("project-length")).toHaveLength(2);
    expect(within(btn("Lost")).getByText("Damaged")).toBeTruthy();
  });
});

describe("the bottom actions", () => {
  test("Quick Edit at the leading corner with a wand, New Project at the trailing one — the one gold button, with its plus — on the gutter", async () => {
    await home();
    const row = screen.getByTestId("home-actions");
    expect(row).toHaveStyle({ position: "absolute", left: theme.space.gutter, right: theme.space.gutter, flexDirection: "row", justifyContent: "space-between" });
    expect(within(row).getAllByRole("button").map((b) => b.props.accessibilityLabel)).toEqual(["Quick Edit", "New Project"]);
    expect(screen.getAllByTestId("primary-button")).toHaveLength(1);
    expect(screen.getByTestId("primary-button")).toHaveAccessibleName("New Project");
    expect(btn("Quick Edit").parent).toHaveStyle({ borderRadius: theme.radius.pill, backgroundColor: theme.screen.bar });   // the readable backing over the cards
    expect(StyleSheet.flatten(row.props.style).bottom).toBeGreaterThanOrEqual(theme.space.lg);                                // never on the screen's edge
  });

  test("the list's last row clears them", async () => {
    await home();
    const row = StyleSheet.flatten(screen.getByTestId("home-actions").props.style);
    const grid = screen.getByTestId("home-grid");
    const content = StyleSheet.flatten(grid.props.contentContainerStyle ?? (grid.children[0] as typeof grid).props.style);
    const listPad = content.paddingBottom;
    expect(content.paddingHorizontal).toBe(theme.space.sm);   // 8 + 8 from the cell = the gutter
    expect(listPad).toBeGreaterThanOrEqual(row.bottom + theme.size.control + theme.space.sm);
  });
});

describe("the states", () => {
  test("loading: a spinner and the words Loading projects, read once", async () => {
    let answer: (v: unknown) => void = () => {};
    list.mockImplementationOnce(() => new Promise((r) => { answer = r; }));
    await render(<ProjectsScreen />);
    expect(await screen.findByText("Loading projects")).toBeTruthy();
    expect(screen.getAllByLabelText("Loading projects")).toHaveLength(1);
    expect(screen.getByTestId("home-loading").props.accessible).toBe(true);
    expect(screen.getByRole("header", { name: "Projects" })).toBeTruthy();
    await act(async () => { answer([BEACH]); });
    await screen.findByText("Beach");
    expect(screen.queryByText("Loading projects")).toBeNull();
  });

  test("empty: a gold boat on a rounded tile, today's title and hint, and a quiet pointer to the two buttons below", async () => {
    list.mockResolvedValue([]);
    await render(<ProjectsScreen />);
    expect(await screen.findByText("No clips yet")).toBeTruthy();
    expect(screen.getByText("Pick some photos or videos from your library and start your first edit.")).toBeTruthy();
    expect(screen.getByText("New Project or Quick Edit, below")).toHaveStyle({ color: theme.screen.muted });
    expect(screen.getByTestId("empty-emblem", { includeHiddenElements: true })).toHaveStyle({ width: theme.size.emblem, height: theme.size.emblem, borderRadius: theme.radius.emblem, backgroundColor: theme.screen.tile });
    expect(btn("Quick Edit")).toBeTruthy(); expect(btn("New Project")).toBeTruthy();
  });

  test("at rest nothing is dimmed", async () => {
    await home();
    expect(screen.getByTestId("home-list")).toHaveStyle({ opacity: 1, flex: 1 });
    expect(screen.getByTestId("home-header-actions")).toHaveStyle({ opacity: 1 });
    expect(screen.queryByTestId("home-making")).toBeNull();
  });

  test("busy, New project: one full-width capsule with a spinner and Creating your project replaces the two actions; header and list are inert and dimmed", async () => {
    let finish: (v: unknown) => void = () => {};
    pick.mockResolvedValueOnce(PICKED);
    createProject.mockImplementationOnce(() => new Promise((r) => { finish = r; }));
    await home();
    await fireEvent.press(btn("New Project"));
    const pressed = fireEvent.press(await screen.findByRole("button", { name: "Create" }));
    const capsule = await screen.findByTestId("home-making");
    expect(capsule).toHaveStyle({ flex: 1, height: theme.size.control, borderRadius: theme.radius.pill, backgroundColor: theme.screen.bar });
    expect(within(capsule).getByText("Creating your project")).toBeTruthy();
    expect(screen.getAllByLabelText("Creating your project")).toHaveLength(1);              // read once
    expect(within(screen.getByTestId("home-actions")).queryAllByRole("button")).toHaveLength(0);
    expect(screen.queryByRole("button", { name: "New Project" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Quick Edit" })).toBeNull();
    for (const id of ["home-header-actions", "home-list"]) {
      expect(screen.getByTestId(id).props.pointerEvents).toBe("none");
      expect(screen.getByTestId(id)).toHaveStyle({ opacity: DISABLED_OPACITY });
    }
    await fireEvent.press(btn("More for Beach"));                                             // inert: no sheet
    expect(sheetTitle("Beach")).toBeNull();
    await act(async () => { finish({ project: { id: "p9" }, failed: 0 }); await pressed; });
    await waitFor(() => expect(push).toHaveBeenCalledWith("/editor/p9"));
    expect(screen.queryByTestId("home-making")).toBeNull();
    expect(btn("Quick Edit")).toBeTruthy(); expect(btn("New Project")).toBeTruthy();
    expect(screen.getByTestId("home-list")).toHaveStyle({ opacity: 1 });
    expect(screen.getByTestId("home-list").props.pointerEvents).toBe("auto");
  });

  test("busy, Quick edit: the same capsule says Making your quick edit — and no number the app does not have", async () => {
    let finish: (v: unknown) => void = () => {};
    pick.mockResolvedValueOnce(PICKED);
    make.mockImplementationOnce(() => new Promise((r) => { finish = r; }));
    await home();
    await fireEvent.press(btn("Quick Edit"));
    const pressed = fireEvent.press(await screen.findByRole("button", { name: "Choose Photos and Videos" }));
    const capsule = await screen.findByTestId("home-making");
    expect(within(capsule).getByText("Making your quick edit")).toBeTruthy();
    expect(within(capsule).queryByText(/\d/)).toBeNull();
    expect(within(screen.getByTestId("home-actions")).queryAllByRole("button")).toHaveLength(0);
    expect(screen.getByTestId("home-list")).toHaveStyle({ opacity: DISABLED_OPACITY });
    expect(screen.getByTestId("home-header-actions").props.pointerEvents).toBe("none");
    await act(async () => { finish({ id: "q1", failed: 0 }); await pressed; });
    await waitFor(() => expect(push).toHaveBeenCalledWith("/editor/q1"));
    expect(screen.queryByTestId("home-making")).toBeNull();
  });

  test("the list is the same list before, during and after: it eases in once and never again (it never remounts)", async () => {
    (withTiming as jest.Mock).mockClear();
    let finish: (v: unknown) => void = () => {};
    pick.mockResolvedValueOnce(PICKED);
    createProject.mockImplementationOnce(() => new Promise((r) => { finish = r; }));
    await home();
    expect(withTiming).toHaveBeenCalledTimes(1);
    expect(within(screen.getByTestId("home-list")).getByTestId("home-grid")).toBeTruthy();
    await fireEvent.press(btn("New Project"));
    const pressed = fireEvent.press(await screen.findByRole("button", { name: "Create" }));
    await screen.findByTestId("home-making");
    expect(withTiming).toHaveBeenCalledTimes(1);
    await act(async () => { finish({ project: { id: "p9" }, failed: 0 }); await pressed; });
    await waitFor(() => expect(screen.queryByTestId("home-making")).toBeNull());
    expect(withTiming).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Beach")).toBeTruthy();
  });
});
