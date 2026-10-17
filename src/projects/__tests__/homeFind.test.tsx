import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react-native";
import { Alert, Keyboard } from "react-native";

jest.mock("expo-router", () => ({ router: { push: jest.fn() }, useFocusEffect: (cb: () => void) => { const React = require("react"); React.useEffect(cb, []); } }));
// Past first launch: the home route draws the projects, not the welcome screen.
jest.mock("@/src/auth/welcomeSeen", () => ({ hasSeenWelcome: () => true, markWelcomeSeen: jest.fn() }));
jest.mock("@/src/projects/pickMedia", () => ({ pickMedia: jest.fn() }));
jest.mock("@/src/publish/pickVideo", () => ({ pickVideoForPost: jest.fn() }));
jest.mock("@/src/projects", () => ({
  storage: { listProjects: jest.fn(), createProject: jest.fn(), renameProject: jest.fn(), duplicateProject: jest.fn(), deleteProject: jest.fn(), importAudio: jest.fn(), saveProject: jest.fn(), updateProject: jest.fn() },
}));
jest.mock("@/src/projects/quickEditFlow", () => ({ makeQuickEdit: jest.fn() }));
// The real sort sheet, with every `visible` it is drawn with written down: so a test can see it closed first and opened again.
jest.mock("@/src/projects/SortSheet", () => {
  const React = require("react");
  const real = jest.requireActual("@/src/projects/SortSheet");
  const g = globalThis as unknown as { __sortSeen: boolean[] };
  g.__sortSeen = [];
  return { SortSheet: (props: { visible: boolean }) => { g.__sortSeen.push(props.visible); return React.createElement(real.SortSheet, props); } };
});

import { router } from "expo-router";
import ProjectsScreen from "@/app/index";
import { storage } from "@/src/projects";
import { HOME_PREFS_KEY } from "@/src/projects/homePrefs";
import { AFTER_SHEET_MS } from "@/src/projects/ProjectActionsSheet";
import { leftovers, wear } from "@/src/ui/testing/appearance";
import { pickMedia } from "@/src/projects/pickMedia";

/** The pin mark is hidden from VoiceOver (accessibilityElementsHidden), so RNTL finds it only with hidden elements included. */
const HIDDEN = { includeHiddenElements: true } as const;
const list = storage.listProjects as jest.Mock;
const at = (d: number) => `2026-10-${String(d).padStart(2, "0")}T00:00:00.000Z`;
const p = (id: string, name: string, edited: number, created: number, durationSec: number) =>
  ({ id, name, durationSec, updatedAt: at(edited), createdAt: at(created), thumbUri: null, broken: false, postedTo: [], coverTitle: "" });
const SIX = [p("a", "Beach", 6, 1, 30), p("b", "Été à Nice", 5, 6, 12), p("c", "Hills", 4, 5, 65), p("d", "Project 10", 3, 4, 5), p("e", "Project 2", 2, 3, 20), p("f", "Zoo", 1, 2, 40)];
const FIVE = SIX.slice(0, 5);
const EDITED = ["Beach", "Été à Nice", "Hills", "Project 10", "Project 2", "Zoo"];
const BY_NAME = ["Beach", "Été à Nice", "Hills", "Project 2", "Project 10", "Zoo"];
const btn = (name: string) => screen.getByRole("button", { name });
/** The cards in the order they are drawn: the first button of a cell is its picture, labelled with the name. */
const order = () => screen.queryAllByTestId("project-card-cell").map((c) => within(c).getAllByRole("button")[0].props.accessibilityLabel);
const stored = () => JSON.parse(localStorage.getItem(HOME_PREFS_KEY) ?? "null");
const put = (v: unknown) => localStorage.setItem(HOME_PREFS_KEY, JSON.stringify(v));
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, AFTER_SHEET_MS + 50)); });
const home = async (projects: object[] = SIX) => { list.mockResolvedValue(projects); await render(<ProjectsScreen />); await screen.findByText("Beach"); };
let warn: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks(); list.mockReset(); localStorage.removeItem(HOME_PREFS_KEY);
  warn = jest.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => warn.mockRestore());

describe("the find row", () => {
  test("under six projects Home is as before: no search and no sort", async () => {
    await home(FIVE);
    expect(screen.queryByTestId("home-find")).toBeNull();
    expect(screen.queryByLabelText("Search projects")).toBeNull();
    expect(screen.queryByRole("button", { name: "Sort projects" })).toBeNull();
  });

  test("from six: the field and the sort button at the top of the LIST (inert with it while busy), not in the header; the header pill keeps its three", async () => {
    await home();
    expect(within(screen.getByTestId("home-list")).getByTestId("home-find")).toBeTruthy();
    expect(within(screen.getByTestId("home-header")).queryByTestId("home-find")).toBeNull();
    const field = within(screen.getByTestId("home-find")).getByTestId("home-search");
    expect(field.props.placeholder).toBe("Search projects");
    expect(field.props.accessibilityLabel).toBe("Search projects");
    expect(within(screen.getByTestId("home-find")).getByRole("button", { name: "Sort projects" })).toBeTruthy();
    expect(within(screen.getByTestId("home-header-actions")).getAllByRole("button")).toHaveLength(3);
    expect(order()).toEqual(EDITED);
  });

  test("typing matches names as you type, case and accents aside; nothing matching says so, and Clear Search empties the field", async () => {
    await home();
    await fireEvent.changeText(screen.getByTestId("home-search"), "ETE");
    expect(order()).toEqual(["Été à Nice"]);
    await fireEvent.changeText(screen.getByTestId("home-search"), "proj");
    expect(order()).toEqual(["Project 10", "Project 2"]);
    await fireEvent.changeText(screen.getByTestId("home-search"), "xyz");
    expect(order()).toEqual([]);
    expect(within(screen.getByTestId("home-no-match")).getByText("No projects match")).toBeTruthy();
    await fireEvent.press(btn("Clear Search"));
    expect(order()).toEqual(EDITED);
    expect(screen.getByTestId("home-search").props.value).toBe("");
    expect(screen.queryByTestId("home-no-match")).toBeNull();
  });

  test("the keyboard goes when the list is dragged and when a project is opened; a tap on a card opens it with the keyboard up", async () => {
    const dismiss = jest.spyOn(Keyboard, "dismiss");
    await home();
    const grid = screen.getByTestId("home-grid");
    expect(grid.props.keyboardDismissMode).toBe("on-drag");
    expect(grid.props.keyboardShouldPersistTaps).toBe("handled");
    await fireEvent.press(btn("Beach"));
    expect(dismiss).toHaveBeenCalled();
    expect(router.push).toHaveBeenCalledWith("/editor/a");
    dismiss.mockRestore();
  });
});

describe("the sort", () => {
  test("Sort by: Last edited is ticked; Name closes the sheet, re-orders, and is remembered on the phone", async () => {
    await home();
    await fireEvent.press(btn("Sort projects"));
    expect(await screen.findByRole("header", { name: "Sort by" })).toBeTruthy();
    expect(within(screen.getByTestId("sort-edited")).getByTestId("sort-check")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("sort-name"));
    await waitFor(() => expect(screen.queryByRole("header", { name: "Sort by" })).toBeNull());
    expect(order()).toEqual(BY_NAME);
    expect(stored()).toEqual({ version: 1, sort: "name", pins: [] });
    await screen.unmount();   // RNTL v14: unmount is async too
    await home();
    expect(order()).toEqual(BY_NAME);
  });

  test.each([
    ["sort-created", ["Été à Nice", "Hills", "Project 10", "Project 2", "Zoo", "Beach"]],
    ["sort-length", ["Hills", "Zoo", "Beach", "Project 2", "Été à Nice", "Project 10"]],
  ])("%s", async (row, expected) => {
    await home();
    await fireEvent.press(btn("Sort projects"));
    await fireEvent.press(await screen.findByTestId(row));
    await waitFor(() => expect(order()).toEqual(expected));
  });
});

describe("the Sort button cannot stick", () => {
  const G = globalThis as unknown as { __sortSeen: boolean[] };
  const sortHeader = () => screen.queryByRole("header", { name: "Sort by" });
  test("a sheet iOS never presented cannot block Sort: the next press closes it first and opens it afresh", async () => {
    await home();
    await fireEvent.press(btn("Sort projects")); // on the phone the sheet may never have appeared; `sortOpen` is set all the same
    await waitFor(() => expect(sortHeader()).toBeTruthy());
    G.__sortSeen.length = 0;
    await fireEvent.press(btn("Sort projects"));
    await waitFor(() => expect(sortHeader()).toBeTruthy());
    const closedAt = G.__sortSeen.indexOf(false);
    expect(closedAt).toBeGreaterThanOrEqual(0);                         // it was closed …
    expect(G.__sortSeen.lastIndexOf(true)).toBeGreaterThan(closedAt);   // … and then opened again
  });

  test.each([
    ["New Project", () => btn("New Project")],
    ["Quick Edit", () => btn("Quick Edit")],
    ["Open Project File", () => btn("Open Project File")],
    ["a project's sheet", () => btn("More for Hills")],
    ["Post a video", () => btn("Post a video")],
  ])("%s clears a Sort sheet that is (or is thought to be) open", async (_name, target) => {
    (pickMedia as jest.Mock).mockResolvedValue(null);
    await home();
    await fireEvent.press(btn("Sort projects"));
    await waitFor(() => expect(sortHeader()).toBeTruthy());
    await fireEvent.press(target());
    await waitFor(() => expect(sortHeader()).toBeNull());
  });
});

describe("pins", () => {
  test("Pin writes nothing of the project: the card goes under Pinned with its mark, the rest under Last edited; Unpin undoes it", async () => {
    await home();
    await fireEvent.press(btn("More for Hills"));
    await fireEvent.press(await screen.findByRole("button", { name: "Pin" }));
    await waitFor(() => expect(screen.getByRole("header", { name: "Pinned" })).toBeTruthy());
    expect(screen.getByRole("header", { name: "Last edited" })).toBeTruthy();
    expect(order()).toEqual(["Hills", "Beach", "Été à Nice", "Project 10", "Project 2", "Zoo"]);
    for (const write of [storage.saveProject, storage.renameProject, storage.updateProject]) expect(write).not.toHaveBeenCalled();
    expect(stored()).toEqual({ version: 1, sort: "edited", pins: ["c"] });
    expect(within(screen.getAllByTestId("project-card-cell")[0]).getByTestId("project-pin", HIDDEN)).toBeTruthy();
    expect(screen.getAllByTestId("project-pin", HIDDEN)).toHaveLength(1);
    expect(btn("Hills").props.accessibilityValue).toEqual({ text: "Pinned" });
    await fireEvent.press(btn("More for Hills"));
    await fireEvent.press(await screen.findByRole("button", { name: "Unpin" }));
    await waitFor(() => expect(screen.queryByRole("header", { name: "Pinned" })).toBeNull());
    expect(screen.queryByRole("header", { name: "Last edited" })).toBeNull();
    expect(screen.queryAllByTestId("project-pin", HIDDEN)).toHaveLength(0);
    expect(stored().pins).toEqual([]);
  });

  test("pins of projects no longer listed are dropped when the list arrives", async () => {
    put({ version: 1, sort: "edited", pins: ["gone", "c"] });
    await home();
    await waitFor(() => expect(stored().pins).toEqual(["c"]));
  });

  test("a damaged project's sheet offers no Pin", async () => {
    await home([...FIVE, { ...p("x", "Can't open", 1, 1, 0), updatedAt: "", createdAt: "", broken: true }]);
    await fireEvent.press(btn("More for Can't open"));
    await screen.findByRole("button", { name: "Delete" });
    expect(screen.queryByRole("button", { name: "Pin" })).toBeNull();
  });

  test("deleting a pinned project removes its pin; the search stays while a query is typed, even under six", async () => {
    put({ version: 1, sort: "edited", pins: ["f", "c"] });
    const alert = jest.spyOn(Alert, "alert").mockImplementation((_t, _m, buttons) => { buttons?.find((b) => b.style === "destructive")?.onPress?.(); });
    (storage.deleteProject as jest.Mock).mockResolvedValue(undefined);
    await home();
    await fireEvent.changeText(screen.getByTestId("home-search"), "o");
    list.mockResolvedValue(FIVE);
    await fireEvent.press(btn("More for Zoo"));
    await fireEvent.press(await screen.findByRole("button", { name: "Delete" }));
    await settle();
    await waitFor(() => expect(storage.deleteProject).toHaveBeenCalledWith("f"));
    await waitFor(() => expect(stored().pins).toEqual(["c"]));
    expect(screen.getByTestId("home-find")).toBeTruthy();
    expect(order()).toEqual(["Project 10", "Project 2"]);
    alert.mockRestore();
  });

  test("a field with the keyboard stays when a delete brings the list under six; it goes when it loses the keyboard", async () => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation((_t, _m, buttons) => { buttons?.find((b) => b.style === "destructive")?.onPress?.(); });
    (storage.deleteProject as jest.Mock).mockResolvedValue(undefined);
    await home();
    await fireEvent(screen.getByTestId("home-search"), "focus");
    list.mockResolvedValue(FIVE);
    await fireEvent.press(btn("More for Zoo"));
    await fireEvent.press(await screen.findByRole("button", { name: "Delete" }));
    await settle();
    await waitFor(() => expect(order()).toHaveLength(5));
    expect(screen.getByTestId("home-search")).toBeTruthy();
    await fireEvent(screen.getByTestId("home-search"), "blur");
    expect(screen.queryByTestId("home-search")).toBeNull();
    alert.mockRestore();
  });

  test("a delete that fails keeps the pin", async () => {
    put({ version: 1, sort: "edited", pins: ["f"] });
    const alert = jest.spyOn(Alert, "alert").mockImplementation((_t, _m, buttons) => { buttons?.find((b) => b.style === "destructive")?.onPress?.(); });
    (storage.deleteProject as jest.Mock).mockRejectedValue(new Error("no"));
    await home();
    await fireEvent.press(btn("More for Zoo"));
    await fireEvent.press(await screen.findByRole("button", { name: "Delete" }));
    await settle();
    await waitFor(() => expect(storage.deleteProject).toHaveBeenCalledWith("f"));
    expect(stored().pins).toEqual(["f"]);
    alert.mockRestore();
  });

  test("a duplicate of a pinned project is not pinned", async () => {
    put({ version: 1, sort: "edited", pins: ["c"] });
    (storage.duplicateProject as jest.Mock).mockResolvedValue({ id: "c2" });
    await home();
    list.mockResolvedValue([...SIX, p("c2", "Hills copy", 7, 7, 65)]);
    await fireEvent.press(btn("More for Hills"));
    await fireEvent.press(await screen.findByRole("button", { name: "Duplicate" }));
    await screen.findByText("Hills copy");
    expect(order().slice(0, 3)).toEqual(["Hills", "Hills copy", "Beach"]);
    expect(screen.getAllByTestId("project-pin", HIDDEN)).toHaveLength(1);
    expect(stored().pins).toEqual(["c"]);
  });
});

describe("light", () => {
  afterEach(() => wear("dark"));
  test("cream: the find row, both headings, a pinned card and the sort sheet — no navy anywhere", async () => {
    put({ version: 1, sort: "edited", pins: ["c"] });
    wear("light");
    await home();
    expect(screen.getByRole("header", { name: "Pinned" })).toBeTruthy();
    expect(leftovers({ onPicture: ["project-length", "project-pin"] })).toEqual([]);
    await fireEvent.press(btn("Sort projects"));
    await screen.findByRole("header", { name: "Sort by" });
    expect(leftovers({ onPicture: ["project-length", "project-pin"] })).toEqual([]);
  });
});
