import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";

// New Project and Quick Edit never wait for a system sheet's promise (AGENTS.md, Quick edit / Home): the photo picker, the source
// menu and the camera hold Home's guard only while they come up. Jest's FAKE clock: every wait below is an exact step of it, so the
// windows (AFTER_PICKER_MS, AFTER_SHEET_MS) are measured from the moment the app asked, never stretched by a slow machine — on the
// real clock a busy run let the window close between two taps and the sheet arrived before the test looked.
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
jest.mock("@/src/auth/welcomeSeen", () => ({ hasSeenWelcome: () => true, markWelcomeSeen: jest.fn() }));
jest.mock("@/src/projects/pickMedia", () => ({ pickMedia: jest.fn() }));
jest.mock("@/src/projects/camera", () => ({ canUseCamera: jest.fn(() => false), takeMedia: jest.fn() }));
jest.mock("@/src/auth/permissions", () => ({ ...jest.requireActual("@/src/auth/permissions"), readPermission: jest.fn(async () => "granted"), openSettings: jest.fn() }));
jest.mock("@/src/publish/pickVideo", () => ({ pickVideoForPost: jest.fn() }));
jest.mock("@/src/projects", () => ({
  storage: { listProjects: jest.fn(), createProject: jest.fn(), renameProject: jest.fn(), duplicateProject: jest.fn(), deleteProject: jest.fn(), importAudio: jest.fn(), saveProject: jest.fn(),
    packProject: jest.fn(), restoreProject: jest.fn(), sweepProjectFiles: jest.fn(async () => {}) },
  filePhone: { pick: jest.fn(), share: jest.fn(async () => {}), forget: jest.fn(async () => {}) },
}));
jest.mock("@/src/projects/quickEditFlow", () => ({ makeQuickEdit: jest.fn() }));
jest.mock("@/src/lib/id", () => ({ newId: () => "new-id" }));

import { router } from "expo-router";
import { ActionSheetIOS, Alert } from "react-native";
import ProjectsScreen from "@/app/index";
import { filePhone, storage } from "@/src/projects";
import { AFTER_PICKER_MS } from "@/src/projects/AspectRatioSheet";
import { canUseCamera, takeMedia } from "@/src/projects/camera";
import { pickMedia } from "@/src/projects/pickMedia";
import { AFTER_SHEET_MS } from "@/src/projects/ProjectActionsSheet";
import { makeQuickEdit } from "@/src/projects/quickEditFlow";
import { useToast } from "@/src/ui/Toast";

const G = globalThis as unknown as { __homeBlur: (() => void)[] };
const list = storage.listProjects as jest.Mock, createProject = storage.createProject as jest.Mock, packProject = storage.packProject as jest.Mock;
const pick = pickMedia as jest.Mock, take = takeMedia as jest.Mock, camera = canUseCamera as jest.Mock, make = makeQuickEdit as jest.Mock;
const filePick = filePhone.pick as jest.Mock;
const push = router.push as jest.Mock;
const PICKED = [{ uri: "file:///a.jpg", kind: "photo", durationSec: 0, width: 3024, height: 4032 }];
const LATE = [{ uri: "file:///late.mov", kind: "video", durationSec: 3, width: 1080, height: 1920 }];
const TAKEN = { uri: "file:///cache/ImagePicker/v.mov", kind: "video", durationSec: 4.2, width: 1080, height: 1920, fileName: undefined };
const BEACH = { id: "a", name: "Beach", durationSec: 65, updatedAt: new Date().toISOString(), thumbUri: null, broken: false, postedTo: [], coverTitle: "" };
const btn = (name: string) => screen.getByRole("button", { name });
/** The fake clock moved by exactly `ms` (every timer due by then has run, with its promises). */
const step = (ms: number) => act(async () => { await jest.advanceTimersByTimeAsync(ms); });
const wait = (ms: number) => step(ms + 50);
const afterSheet = () => wait(AFTER_PICKER_MS);
const presses: Promise<unknown>[] = [];
/** One turn of the REAL event loop, the fake clock left where it is. */
const realTick = () => new Promise<void>((r) => { jest.requireActual<typeof import("timers")>("timers").setTimeout(r, 0); });
/**
 * A press whose handler may stay pending for ever (a sheet that never answers — the press settles only with its handler): not
 * awaited, but given one real tick — so its act scope has ended before the next one opens (overlapping act scopes leave React unable
 * to draw the next test's screen). The fake clock does not move.
 */
const press = async (el: Parameters<typeof fireEvent.press>[0]) => { presses.push(Promise.resolve(fireEvent.press(el))); await realTick(); };
const tap = (name: string) => press(btn(name));
const aspectSheet = () => screen.queryByRole("header", { name: "Aspect ratio" });
const quickHeader = () => screen.queryByRole("header", { name: "Quick edit" });
/**
 * Sheets that have not answered. A sheet "that never answers" is told to answer as a cancel once its test is over (`afterEach`),
 * so no press is left pending into the next test.
 */
const open: (() => void)[] = [];
const hanging = () => new Promise<unknown>((r) => { open.push(() => r(null)); });
const cameraHanging = () => new Promise<unknown>((r) => { open.push(() => r({ status: "cancelled" })); });
/** A sheet that answers only when told (or, at the end of its test, null). */
function later<T>(mock: jest.Mock) {
  let answer: (v: T) => void = () => {};
  mock.mockImplementationOnce(() => new Promise<T>((r) => { answer = r; open.push(() => (r as (v: unknown) => void)(mock === take ? { status: "cancelled" } : null)); }));
  return (v: T) => act(async () => { answer(v); await jest.advanceTimersByTimeAsync(0); });
}
let menu: jest.SpyInstance, warn: jest.SpyInstance, alert: jest.SpyInstance;
const answerMenu = (index: number) => act(async () => { (menu.mock.calls[menu.mock.calls.length - 1][1] as (i: number) => void)(index); });

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks(); pick.mockReset(); take.mockReset(); make.mockReset(); createProject.mockReset(); packProject.mockReset(); filePick.mockReset();
  list.mockReset(); list.mockResolvedValue([BEACH]); camera.mockReturnValue(false);
  G.__homeBlur.length = 0; useToast.getState().clear(); presses.length = 0;
  menu = jest.spyOn(ActionSheetIOS, "showActionSheetWithOptions").mockImplementation(() => {});
  warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
});
afterEach(async () => {
  await act(async () => { open.splice(0).forEach((r) => r()); menu.mock.calls.forEach((c) => (c[1] as (i: number) => void)(2)); await jest.advanceTimersByTimeAsync(AFTER_SHEET_MS + AFTER_PICKER_MS + 50); await Promise.all(presses.splice(0)); await jest.runOnlyPendingTimersAsync(); });
  jest.useRealTimers();
  menu.mockRestore(); warn.mockRestore(); alert.mockRestore();
});
const home = async () => { await render(<ProjectsScreen />); await screen.findByText("Beach"); };
/** Save a Copy started and standing still in its pack: `creating` is held by it. */
const startSave = async () => {
  let finish: (v: unknown) => void = () => {};
  packProject.mockImplementationOnce(() => new Promise((r) => { finish = r; }));
  await fireEvent.press(btn("More for Beach"));
  await press(await screen.findByRole("button", { name: "Save a Copy" }));
  await wait(AFTER_SHEET_MS);
  await screen.findByTestId("home-transfer");
  return () => act(async () => { finish(null); await jest.advanceTimersByTimeAsync(0); });
};

describe("New Project: a photo picker that never answers", () => {
  test("holds the guard while it comes up: a second tap opens nothing, nor do Quick Edit and Open Project File", async () => {
    pick.mockImplementationOnce(hanging);
    await home();
    await tap("New Project");
    expect(pick).toHaveBeenCalledTimes(1);
    await tap("New Project");
    await tap("Quick Edit");
    await tap("Open Project File");
    await wait(0);
    expect(pick).toHaveBeenCalledTimes(1);
    expect(quickHeader()).toBeNull();
    expect(filePick).not.toHaveBeenCalled();
  });

  test("after AFTER_PICKER_MS New Project, Quick Edit, Open Project File and Save a Copy work again", async () => {
    pick.mockImplementationOnce(hanging);
    await home();
    await tap("New Project");
    await afterSheet();
    pick.mockResolvedValueOnce(PICKED);
    await tap("New Project");
    expect(pick).toHaveBeenCalledTimes(2);
    await afterSheet();
    expect(aspectSheet()).toBeTruthy();
    await fireEvent.press(screen.getByLabelText("Close sheet"));
    await wait(0);
    filePick.mockResolvedValueOnce(null);
    await tap("Open Project File");
    expect(filePick).toHaveBeenCalledTimes(1);
    await wait(0);
    await tap("Quick Edit");
    await waitFor(() => expect(quickHeader()).toBeTruthy());
    await fireEvent.press(screen.getByLabelText("Close sheet"));
    await wait(AFTER_SHEET_MS);
    const finishSave = await startSave();
    expect(packProject).toHaveBeenCalledTimes(1);
    await finishSave();
  });

  test("a LATE answer while another run holds the guard is dropped: nothing reaches the aspect-ratio sheet, nothing is created, nothing is said", async () => {
    const answer = later<unknown>(pick);
    await home();
    await tap("New Project");
    await afterSheet();
    const finishSave = await startSave();               // Save a Copy now holds the guard (its pack)
    await answer(LATE);
    await afterSheet();
    expect(aspectSheet()).toBeNull();
    expect(createProject).not.toHaveBeenCalled();
    expect(useToast.getState().message).toBeNull();
    await finishSave();
    await wait(0);
    pick.mockResolvedValueOnce(PICKED);                 // and New Project is itself again
    await tap("New Project");
    expect(pick).toHaveBeenCalledTimes(2);
  });

  test("a LATE answer while a newer New Project's picker is coming up is dropped; the newer pick is the one that continues", async () => {
    const first = later<unknown>(pick);
    await home();
    await tap("New Project");
    await afterSheet();
    const second = later<unknown>(pick);
    await tap("New Project");
    expect(pick).toHaveBeenCalledTimes(2);
    await first(LATE);                                  // the second picker is still coming up: it holds the guard
    await second(PICKED);
    await afterSheet();
    createProject.mockResolvedValueOnce({ project: { id: "p9" }, failed: 0 });
    await fireEvent.press(btn("Create"));
    await wait(0);
    expect(createProject).toHaveBeenCalledTimes(1);
    expect(createProject).toHaveBeenCalledWith("Project 1", PICKED, "auto");
  });

  test("a LATE answer with nothing else running continues as normal — the guard taken again — to the aspect-ratio sheet and the project", async () => {
    const answer = later<unknown>(pick);
    await home();
    await tap("New Project");
    await afterSheet();
    await answer(LATE);
    await tap("Open Project File");                     // the late pick holds the guard again while the picker slides away
    expect(filePick).not.toHaveBeenCalled();
    expect(aspectSheet()).toBeNull();
    await afterSheet();
    expect(aspectSheet()).toBeTruthy();
    createProject.mockResolvedValueOnce({ project: { id: "p9" }, failed: 0 });
    await fireEvent.press(btn("Create"));
    await wait(0);
    expect(createProject).toHaveBeenCalledWith("Project 1", LATE, "auto");
    expect(push).toHaveBeenCalledWith("/editor/p9");
  });

  test("a LATE answer once Home is no longer in front is dropped", async () => {
    const answer = later<unknown>(pick);
    await home();
    await tap("New Project");
    await afterSheet();
    await act(async () => { G.__homeBlur.splice(0).forEach((off) => off()); });
    await answer(LATE);
    await afterSheet();
    expect(aspectSheet()).toBeNull();
    expect(createProject).not.toHaveBeenCalled();
  });
});

describe("New Project: the happy path is today's", () => {
  test("the picker answers in time: the exact sequence and timing — picker at the tap, the aspect-ratio sheet AFTER_PICKER_MS after its answer, the project on Create", async () => {
    const order: string[] = [];
    pick.mockImplementationOnce(() => { order.push("pick"); return new Promise((r) => setTimeout(() => { order.push("picked"); r(PICKED); }, 200)); });
    createProject.mockImplementationOnce(async () => { order.push("create"); return { project: { id: "p9" }, failed: 0 }; });
    push.mockImplementationOnce(() => { order.push("push"); });
    await home();
    await tap("New Project");
    expect(order).toEqual(["pick"]);
    await step(199);
    expect(order).toEqual(["pick"]);
    await step(1);
    expect(order).toEqual(["pick", "picked"]);
    await tap("New Project");                           // the picker has answered; the guard is still held while it slides away
    await tap("Open Project File");
    expect(pick).toHaveBeenCalledTimes(1);
    expect(filePick).not.toHaveBeenCalled();
    await step(AFTER_PICKER_MS - 1);                    // to the millisecond: the clock is Jest's, so no slow run can stretch it
    expect(aspectSheet()).toBeNull();
    await step(1);
    expect(aspectSheet()).toBeTruthy();
    await fireEvent.press(btn("Create"));
    await wait(0);
    expect(order).toEqual(["pick", "picked", "create", "push"]);
    expect(createProject).toHaveBeenCalledWith("Project 1", PICKED, "auto");
  });
});

describe("Quick Edit: a photo picker that never answers", () => {
  const choose = async () => {
    await tap("Quick Edit");                            // its sheet opens on the next tick of the clock
    await press(await screen.findByRole("button", { name: "Choose Photos and Videos" }));
    await wait(AFTER_SHEET_MS);                         // the sheet fades out, then the library is asked for
    expect(pick).toHaveBeenCalledWith({ limit: 30 });
  };

  test("after AFTER_PICKER_MS New Project and Open Project File work again", async () => {
    pick.mockImplementationOnce(hanging);
    await home();
    await choose();
    await tap("New Project");
    expect(pick).toHaveBeenCalledTimes(1);              // still coming up
    await afterSheet();
    pick.mockResolvedValueOnce(null);
    await tap("New Project");
    expect(pick).toHaveBeenCalledTimes(2);
    await wait(0);
    filePick.mockResolvedValueOnce(null);
    await tap("Open Project File");
    expect(filePick).toHaveBeenCalledTimes(1);
  });

  test("a LATE answer while another run holds the guard is dropped: no quick edit is made", async () => {
    const answer = later<unknown>(pick);
    await home();
    await choose();
    await afterSheet();
    const finishSave = await startSave();
    await answer(PICKED);
    await afterSheet();
    expect(make).not.toHaveBeenCalled();
    expect(screen.queryByTestId("home-making")).toBeNull();
    expect(useToast.getState().message).toBeNull();
    await finishSave();
  });

  test("a LATE answer with nothing else running makes the quick edit and opens it", async () => {
    const answer = later<unknown>(pick);
    make.mockResolvedValueOnce({ id: "q1", failed: 0 });
    await home();
    await choose();
    await afterSheet();
    await answer(PICKED);
    await waitFor(() => expect(push).toHaveBeenCalledWith("/editor/q1"));
    expect(make.mock.calls[0].slice(1)).toEqual(["Project 1", PICKED, "travel"]);
  });
});

describe("New Project with the camera offered: the menu and the camera", () => {
  beforeEach(() => camera.mockReturnValue(true));

  test("a menu that never answers: after AFTER_PICKER_MS Open Project File works, and New Project shows the menu afresh", async () => {
    await home();
    await tap("New Project");
    expect(menu).toHaveBeenCalledTimes(1);
    await tap("Open Project File");
    expect(filePick).not.toHaveBeenCalled();
    await afterSheet();
    filePick.mockResolvedValueOnce(null);
    await tap("Open Project File");
    expect(filePick).toHaveBeenCalledTimes(1);
    await wait(0);
    await tap("New Project");
    expect(menu).toHaveBeenCalledTimes(2);
    take.mockResolvedValueOnce({ status: "taken", asset: TAKEN });
    await answerMenu(1);
    await wait(AFTER_SHEET_MS + AFTER_PICKER_MS);
    expect(take).toHaveBeenCalledTimes(1);
    expect(aspectSheet()).toBeTruthy();
  });

  test("the menu answering late takes the guard back at once: nothing else starts while it closes, and the choice continues", async () => {
    await home();
    await tap("New Project");
    await afterSheet();
    pick.mockResolvedValueOnce(PICKED);
    await answerMenu(0);
    await tap("Open Project File");                     // the menu is closing: the guard is held again
    await tap("Quick Edit");
    expect(filePick).not.toHaveBeenCalled();
    await wait(AFTER_SHEET_MS);
    expect(pick).toHaveBeenCalledTimes(1);
    expect(quickHeader()).toBeNull();
    await afterSheet();
    expect(aspectSheet()).toBeTruthy();
  });

  test("a menu answering late while another run holds the guard: dropped — no picker, no camera", async () => {
    await home();
    await tap("New Project");
    await afterSheet();
    const finishSave = await startSave();
    await answerMenu(1);
    await wait(AFTER_SHEET_MS + AFTER_PICKER_MS);
    expect(take).not.toHaveBeenCalled();
    expect(pick).not.toHaveBeenCalled();
    await finishSave();
  });

  test("a camera that never answers: after AFTER_PICKER_MS Open Project File works again", async () => {
    take.mockImplementationOnce(cameraHanging);
    await home();
    await tap("New Project");
    await answerMenu(1);
    await wait(AFTER_SHEET_MS);
    expect(take).toHaveBeenCalledTimes(1);
    await tap("Open Project File");
    expect(filePick).not.toHaveBeenCalled();
    await afterSheet();
    filePick.mockResolvedValueOnce(null);
    await tap("Open Project File");
    expect(filePick).toHaveBeenCalledTimes(1);
  });

  test("a camera answering late while another run holds the guard: dropped; with nothing else running: on to the aspect-ratio sheet", async () => {
    const answer = later<unknown>(take);
    await home();
    await tap("New Project");
    await answerMenu(1);
    await wait(AFTER_SHEET_MS);
    await afterSheet();
    const finishSave = await startSave();
    await answer({ status: "taken", asset: TAKEN });
    await afterSheet();
    expect(aspectSheet()).toBeNull();
    await finishSave();
    await wait(0);
    const again = later<unknown>(take);
    await tap("New Project");
    await answerMenu(1);
    await wait(AFTER_SHEET_MS);
    await afterSheet();
    await again({ status: "taken", asset: TAKEN });
    await afterSheet();
    expect(aspectSheet()).toBeTruthy();
    createProject.mockResolvedValueOnce({ project: { id: "p9" }, failed: 0 });
    await fireEvent.press(btn("Create"));
    await wait(0);
    expect(createProject).toHaveBeenCalledWith("Project 1", [TAKEN], "auto");
  });
});
