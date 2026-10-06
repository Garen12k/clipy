import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";

// Focus that a test can take away: every focus effect runs on mount, and `blurScreen()` runs their clean-ups (the screen is no
// longer the one in front).
jest.mock("expo-router", () => {
  const g = globalThis as unknown as { __homeBlur: (() => void)[] };
  g.__homeBlur = [];
  return {
    router: { push: jest.fn() },
    useFocusEffect: (cb: () => void | (() => void)) => {
      const React = require("react");
      React.useEffect(() => { const off = cb(); if (typeof off === "function") g.__homeBlur.push(off); }, []);
    },
  };
});
jest.mock("@/src/projects/pickMedia", () => ({ pickMedia: jest.fn() }));
jest.mock("@/src/publish/pickVideo", () => ({ pickVideoForPost: jest.fn() }));
jest.mock("@/src/projects", () => ({
  storage: { listProjects: jest.fn(), createProject: jest.fn(), renameProject: jest.fn(), duplicateProject: jest.fn(), deleteProject: jest.fn(), importAudio: jest.fn(), saveProject: jest.fn() },
}));
jest.mock("@/src/projects/quickEditFlow", () => ({ makeQuickEdit: jest.fn() }));
jest.mock("@/src/lib/id", () => ({ newId: () => "new-id" }));
// The real sheet, with every `visible` it is rendered with written down (a sheet that closes and opens again within one tick) and
// its `onChoose` kept (two presses before the sheet has re-rendered).
jest.mock("@/src/projects/QuickEditSheet", () => {
  const React = require("react");
  const actual = jest.requireActual("@/src/projects/QuickEditSheet");
  const g = globalThis as unknown as { __quickSeen: boolean[]; __quickChoose: (id: string) => Promise<void> };
  g.__quickSeen = [];
  return { QuickEditSheet: (props: { visible: boolean; onChoose: (id: string) => Promise<void> }) => { g.__quickSeen.push(props.visible); g.__quickChoose = props.onChoose; return React.createElement(actual.QuickEditSheet, props); } };
});

import { router } from "expo-router";
import ProjectsScreen from "@/app/index";
import { storage } from "@/src/projects";
import { pickMedia } from "@/src/projects/pickMedia";
import { AFTER_SHEET_MS } from "@/src/projects/ProjectActionsSheet";
import { makeQuickEdit } from "@/src/projects/quickEditFlow";
import { useToast } from "@/src/ui/Toast";

const G = globalThis as unknown as { __homeBlur: (() => void)[]; __quickSeen: boolean[]; __quickChoose: (id: string) => Promise<void> };
const blurScreen = () => act(() => { G.__homeBlur.splice(0).forEach((off) => off()); });
const list = storage.listProjects as jest.Mock;
const createProject = storage.createProject as jest.Mock;
const pick = pickMedia as jest.Mock;
const make = makeQuickEdit as jest.Mock;
const push = router.push as jest.Mock;
const PICKED = [{ uri: "file:///a.jpg", kind: "photo", durationSec: 0, width: 3024, height: 4032 }, { uri: "file:///b.mov", kind: "video", durationSec: 5, width: 1920, height: 1080 }];
const BEACH = { id: "a", name: "Beach", durationSec: 65, updatedAt: new Date().toISOString(), thumbUri: null, broken: false, postedTo: [], coverTitle: "" };
const btn = (name: string) => screen.getByRole("button", { name });
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, AFTER_SHEET_MS + 50)); });
const quickHeader = () => screen.queryByRole("header", { name: "Quick edit" });
let warn: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks(); pick.mockReset(); make.mockReset(); createProject.mockReset(); list.mockReset(); list.mockResolvedValue([BEACH]);
  G.__homeBlur.length = 0; G.__quickSeen.length = 0; useToast.getState().clear();
  warn = jest.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => warn.mockRestore());

const home = async () => { await render(<ProjectsScreen />); await screen.findByText("Beach"); };
/** Quick edit up to the moment the draft is being made; `finish` ends the making. */
const startMaking = async () => {
  let finish: (v: unknown) => void = () => {};
  pick.mockResolvedValueOnce(PICKED);
  make.mockImplementationOnce(() => new Promise((r) => { finish = r; }));
  await home();
  await fireEvent.press(btn("Quick edit"));
  const pressed = fireEvent.press(await screen.findByRole("button", { name: "Choose photos and videos" }));
  await screen.findByTestId("home-making");
  return { pressed, finish: (v: unknown) => act(async () => { finish(v); await pressed; }) };
};
/** New clip up to the moment the project is being made (its media copied). */
const startCreating = async () => {
  let finish: (v: unknown) => void = () => {};
  pick.mockResolvedValueOnce(PICKED);
  createProject.mockImplementationOnce(() => new Promise((r) => { finish = r; }));
  await home();
  await fireEvent.press(btn("New clip"));
  const pressed = fireEvent.press(await screen.findByRole("button", { name: "Create" }));
  await waitFor(() => expect(createProject).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(screen.getByTestId("home-list").props.pointerEvents).toBe("none"));
  return { pressed, finish: (v: unknown) => act(async () => { finish(v); await pressed; }) };
};

describe("the home screen takes no touches while a project is being made", () => {
  test("at rest the header actions and the list are touchable", async () => {
    await home();
    expect(screen.getByTestId("home-header-actions").props.pointerEvents).toBe("auto");
    expect(screen.getByTestId("home-list").props.pointerEvents).toBe("auto");
  });

  test("while a Quick edit draft is made: a card press and a header press do nothing; afterwards the editor opens exactly once and the screen is live again", async () => {
    const { finish } = await startMaking();
    expect(screen.getByTestId("home-header-actions").props.pointerEvents).toBe("none");
    expect(screen.getByTestId("home-list").props.pointerEvents).toBe("none");   // long presses too
    await fireEvent.press(btn("Beach"));
    await fireEvent.press(btn("Accounts"));
    expect(push).not.toHaveBeenCalled();
    await finish({ id: "q1", failed: 0 });
    await waitFor(() => expect(push).toHaveBeenCalledWith("/editor/q1"));
    expect(push).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("home-list").props.pointerEvents).toBe("auto");
    await fireEvent.press(btn("Accounts"));
    expect(push).toHaveBeenLastCalledWith("/accounts");
  });

  test("while New clip makes its project: the same", async () => {
    const { finish } = await startCreating();
    expect(screen.getByTestId("home-header-actions").props.pointerEvents).toBe("none");
    await fireEvent.press(btn("Beach"));
    await fireEvent.press(btn("Accounts"));
    expect(push).not.toHaveBeenCalled();
    await finish({ project: { id: "p9" }, failed: 0 });
    await waitFor(() => expect(push).toHaveBeenCalledWith("/editor/p9"));
    expect(push).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("home-list").props.pointerEvents).toBe("auto");
    expect(screen.getByTestId("home-header-actions").props.pointerEvents).toBe("auto");
  });

  test("a draft that fails gives the touches back", async () => {
    pick.mockResolvedValueOnce(PICKED);
    make.mockRejectedValueOnce(new Error("disk full"));
    await home();
    await fireEvent.press(btn("Quick edit"));
    await fireEvent.press(await screen.findByRole("button", { name: "Choose photos and videos" }));
    await settle();
    await waitFor(() => expect(useToast.getState().message).toBe("Couldn't make the quick edit"));
    expect(screen.getByTestId("home-list").props.pointerEvents).toBe("auto");
    expect(screen.getByTestId("home-header-actions").props.pointerEvents).toBe("auto");
    expect(push).not.toHaveBeenCalled();
  });
});

describe("the editor opens only if the home screen is still in front", () => {
  test("Quick edit: the screen lost focus while the draft was made — no navigation, and the buttons are back", async () => {
    const { finish } = await startMaking();
    await blurScreen();
    await finish({ id: "q1", failed: 0 });
    await waitFor(() => expect(screen.queryByTestId("home-making")).toBeNull());
    expect(push).not.toHaveBeenCalled();
    expect(btn("Quick edit")).toBeTruthy();
  });

  test("New clip: the screen lost focus while the project was made — no navigation", async () => {
    const { finish } = await startCreating();
    await blurScreen();
    await finish({ project: { id: "p9" }, failed: 0 });
    await waitFor(() => expect(screen.getByTestId("home-list").props.pointerEvents).toBe("auto"));
    expect(push).not.toHaveBeenCalled();
  });
});

describe("the Quick edit button cannot stick", () => {
  test("a sheet iOS never presented cannot block Quick edit: the next press closes it first and opens it afresh", async () => {
    await home();
    await fireEvent.press(btn("Quick edit")); // on the phone the sheet may never have appeared; `quickOpen` is set all the same
    await waitFor(() => expect(quickHeader()).toBeTruthy());
    G.__quickSeen.length = 0;
    await fireEvent.press(btn("Quick edit"));
    await waitFor(() => expect(quickHeader()).toBeTruthy());
    const closedAt = G.__quickSeen.indexOf(false);
    expect(closedAt).toBeGreaterThanOrEqual(0);                         // it was closed …
    expect(G.__quickSeen.lastIndexOf(true)).toBeGreaterThan(closedAt);  // … and then opened again
    expect(pick).not.toHaveBeenCalled();
  });

  test("New clip clears a Quick edit sheet that is (or is thought to be) open", async () => {
    pick.mockResolvedValueOnce(null);
    await home();
    await fireEvent.press(btn("Quick edit"));
    await waitFor(() => expect(quickHeader()).toBeTruthy());
    await fireEvent.press(btn("New clip"));
    await waitFor(() => expect(pick).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(quickHeader()).toBeNull());
  });

  test("Quick edit clears media that is waiting for its aspect ratio", async () => {
    pick.mockResolvedValueOnce(PICKED);
    await home();
    await fireEvent.press(btn("New clip"));
    await screen.findByRole("header", { name: "Aspect ratio" });
    await fireEvent.press(btn("Quick edit"));
    await waitFor(() => expect(quickHeader()).toBeTruthy());
    expect(screen.queryByRole("header", { name: "Aspect ratio" })).toBeNull();
    expect(createProject).not.toHaveBeenCalled();
  });
});

describe("one thing at a time", () => {
  test("a double press on Choose photos and videos opens one library", async () => {
    let answer: (v: unknown) => void = () => {};
    pick.mockImplementation(() => new Promise((r) => { answer = r; }));
    await home();
    await fireEvent.press(btn("Quick edit"));
    await screen.findByRole("button", { name: "Choose photos and videos" });
    // Both presses arrive before the sheet has re-rendered: the same handler, twice.
    let both: Promise<unknown> = Promise.resolve();
    await act(async () => {
      both = Promise.all([G.__quickChoose("travel"), G.__quickChoose("travel")]);
      await new Promise((r) => setTimeout(r, 2 * AFTER_SHEET_MS + 50));
    });
    expect(pick).toHaveBeenCalledTimes(1);
    await act(async () => { answer(null); await both; });
    await settle();
    expect(pick).toHaveBeenCalledTimes(1);
    expect(make).not.toHaveBeenCalled();
  });

  test("while the Quick edit library is opening or up, New clip and Quick edit do nothing", async () => {
    let answer: (v: unknown) => void = () => {};
    pick.mockImplementation(() => new Promise((r) => { answer = r; }));
    await home();
    await fireEvent.press(btn("Quick edit"));
    const pressed = fireEvent.press(await screen.findByRole("button", { name: "Choose photos and videos" }));
    await waitFor(() => expect(quickHeader()).toBeNull());
    // The sheet is fading out: the library is not up yet.
    await fireEvent.press(btn("New clip"));
    await fireEvent.press(btn("Quick edit"));
    await settle();
    expect(pick).toHaveBeenCalledTimes(1);   // the Quick edit one
    expect(pick).toHaveBeenCalledWith({ limit: 30 });
    // The library is up.
    await fireEvent.press(btn("New clip"));
    await fireEvent.press(btn("Quick edit"));
    await settle();
    expect(pick).toHaveBeenCalledTimes(1);
    expect(quickHeader()).toBeNull();
    expect(screen.queryByRole("header", { name: "Aspect ratio" })).toBeNull();
    answer(null);
    await pressed;
    // Afterwards both work again.
    await fireEvent.press(btn("Quick edit"));
    await waitFor(() => expect(quickHeader()).toBeTruthy());
  });
});

test("the draft was made but the list could not be re-read: the owner still lands in the draft", async () => {
  list.mockReset();
  list.mockResolvedValueOnce([BEACH]).mockRejectedValueOnce(new Error("io")).mockResolvedValue([BEACH]);
  pick.mockResolvedValueOnce(PICKED);
  make.mockResolvedValueOnce({ id: "q7", failed: 0 });
  await home();
  await fireEvent.press(btn("Quick edit"));
  await fireEvent.press(await screen.findByRole("button", { name: "Choose photos and videos" })).catch(() => {});
  await settle();
  await waitFor(() => expect(push).toHaveBeenCalledWith("/editor/q7"));
  expect(push).toHaveBeenCalledTimes(1);
  expect(screen.queryByTestId("home-making")).toBeNull();
});

test("Making your quick edit is read once: the pill is one accessible element and the spinner carries no label of its own", async () => {
  const { finish } = await startMaking();
  const pill = screen.getByTestId("home-making");
  expect(pill.props.accessible).toBe(true);
  expect(pill.props.accessibilityLabel).toBe("Making your quick edit");
  expect(screen.getAllByLabelText("Making your quick edit")).toHaveLength(1);   // the pill itself: the spinner inside carries none
  expect(screen.getByLabelText("Making your quick edit").props.testID).toBe("home-making");
  expect(screen.getByText("Making your quick edit")).toBeTruthy();
  await finish({ id: "q1", failed: 0 });
});
