import { act, fireEvent, render, screen } from "@testing-library/react-native";

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
jest.mock("@/src/projects/camera", () => ({ canUseCamera: jest.fn(() => true), takeMedia: jest.fn() }));
jest.mock("@/src/auth/permissions", () => ({ ...jest.requireActual("@/src/auth/permissions"), readPermission: jest.fn(async () => "granted"), openSettings: jest.fn() }));
jest.mock("@/src/publish/pickVideo", () => ({ pickVideoForPost: jest.fn() }));
jest.mock("@/src/projects", () => ({
  storage: { listProjects: jest.fn(), createProject: jest.fn(), renameProject: jest.fn(), duplicateProject: jest.fn(), deleteProject: jest.fn(), importAudio: jest.fn(), saveProject: jest.fn() },
}));
jest.mock("@/src/projects/quickEditFlow", () => ({ makeQuickEdit: jest.fn() }));
jest.mock("@/src/lib/id", () => ({ newId: () => "new-id" }));

import { router } from "expo-router";
import { ActionSheetIOS } from "react-native";
import ProjectsScreen from "@/app/index";
import { openSettings, readPermission } from "@/src/auth/permissions";
import { storage } from "@/src/projects";
import { AFTER_PICKER_MS } from "@/src/projects/AspectRatioSheet";
import { canUseCamera, takeMedia } from "@/src/projects/camera";
import { pickMedia } from "@/src/projects/pickMedia";
import { AFTER_SHEET_MS } from "@/src/projects/ProjectActionsSheet";
import { useToast } from "@/src/ui/Toast";

const G = globalThis as unknown as { __homeBlur: (() => void)[] };
const list = storage.listProjects as jest.Mock;
const createProject = storage.createProject as jest.Mock;
const pick = pickMedia as jest.Mock;
const take = takeMedia as jest.Mock;
const camera = canUseCamera as jest.Mock;
const read = readPermission as jest.Mock;
const push = router.push as jest.Mock;
const PICKED = [{ uri: "file:///a.jpg", kind: "photo", durationSec: 0, width: 3024, height: 4032 }];
const TAKEN = { uri: "file:///cache/ImagePicker/v.mov", kind: "video", durationSec: 4.2, width: 1080, height: 1920, fileName: undefined };
const BEACH = { id: "a", name: "Beach", durationSec: 65, updatedAt: new Date().toISOString(), thumbUri: null, broken: false, postedTo: [], coverTitle: "" };
const btn = (name: string) => screen.getByRole("button", { name });
let menu: jest.SpyInstance;
/** Answers the menu that is up: 0 = Choose from Library, 1 = Take Photo or Video, 2 = Cancel. */
const answer = (index: number) => act(async () => { (menu.mock.calls[menu.mock.calls.length - 1][1] as (i: number) => void)(index); });
/** Real time (as the other Home suites wait): a little more than asked, so a timer of `ms` has run. */
const wait = (ms: number) => act(async () => { await new Promise((r) => setTimeout(r, ms + 50)); });
/**
 * A press whose handler may stay pending (the menu is up, the camera is open): not awaited — it ends when the flow does — but
 * given one tick, so everything the press starts at once has started. Every test ends with nothing pending (`done`).
 */
const presses: Promise<unknown>[] = [];
const tap = async (name: string) => { presses.push(Promise.resolve(fireEvent.press(btn(name)))); await new Promise((r) => setTimeout(r, 0)); };
const done = () => act(async () => { await Promise.all(presses.splice(0)); });
let warn: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks(); pick.mockReset(); take.mockReset(); createProject.mockReset(); list.mockReset(); list.mockResolvedValue([BEACH]);
  camera.mockReturnValue(true); read.mockResolvedValue("granted");
  G.__homeBlur.length = 0; useToast.getState().clear();
  menu = jest.spyOn(ActionSheetIOS, "showActionSheetWithOptions").mockImplementation(() => {});
  warn = jest.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => { warn.mockRestore(); menu.mockRestore(); });

const home = async () => { await render(<ProjectsScreen />); await screen.findByText("Beach"); };

test("an installed app that cannot open the camera shows NO menu: New Project goes straight to the library, as ever", async () => {
  camera.mockReturnValue(false);
  pick.mockResolvedValueOnce(PICKED);
  await home();
  await tap("New Project");
  expect(menu).not.toHaveBeenCalled();
  expect(pick).toHaveBeenCalledTimes(1);
  expect(pick).toHaveBeenCalledWith();
  expect(take).not.toHaveBeenCalled();
  await wait(AFTER_PICKER_MS);
  expect(screen.getByRole("button", { name: "Create" })).toBeTruthy();
});

test("with a camera, New Project shows the two-item menu and starts nothing by itself", async () => {
  await home();
  await tap("New Project");
  expect(menu).toHaveBeenCalledTimes(1);
  expect(menu.mock.calls[0][0]).toEqual({ options: ["Choose from Library", "Take Photo or Video", "Cancel"], cancelButtonIndex: 2 });
  await wait(AFTER_SHEET_MS * 3);
  expect(pick).not.toHaveBeenCalled();
  expect(take).not.toHaveBeenCalled();
});

test("Choose from Library opens the same picker, only once the menu has had AFTER_SHEET_MS to close, and continues as before", async () => {
  pick.mockResolvedValueOnce(PICKED);
  createProject.mockResolvedValueOnce({ project: { id: "p9" }, failed: 0 });
  await home();
  await tap("New Project");
  await answer(0);
  await wait(AFTER_SHEET_MS - 200);
  expect(pick).not.toHaveBeenCalled();
  await wait(200);
  expect(pick).toHaveBeenCalledTimes(1);
  expect(pick).toHaveBeenCalledWith();
  expect(take).not.toHaveBeenCalled();
  await wait(AFTER_PICKER_MS);
  await fireEvent.press(btn("Create"));
  await wait(0);
  expect(createProject).toHaveBeenCalledWith("Project 1", PICKED, "auto");
  expect(push).toHaveBeenCalledWith("/editor/p9");
});

test("Take Photo or Video opens the camera after the same wait; the one taken item reaches the aspect-ratio sheet and the project exactly as a picked one", async () => {
  take.mockResolvedValueOnce({ status: "taken", asset: TAKEN });
  createProject.mockResolvedValueOnce({ project: { id: "p9" }, failed: 0 });
  await home();
  await tap("New Project");
  await answer(1);
  await wait(AFTER_SHEET_MS - 200);
  expect(take).not.toHaveBeenCalled();
  await wait(200);
  expect(take).toHaveBeenCalledTimes(1);
  expect(pick).not.toHaveBeenCalled();
  expect(screen.queryByRole("button", { name: "Create" })).toBeNull();   // the camera is still sliding away
  await wait(AFTER_PICKER_MS);
  expect(screen.getByRole("header", { name: "Aspect ratio" })).toBeTruthy();
  expect(createProject).not.toHaveBeenCalled();                          // nothing exists until Create
  await fireEvent.press(btn("Create"));
  await wait(0);
  expect(createProject).toHaveBeenCalledTimes(1);
  expect(createProject).toHaveBeenCalledWith("Project 1", [TAKEN], "auto");
  expect(push).toHaveBeenCalledWith("/editor/p9");
  expect(useToast.getState().message).toBeNull();
});

test("Cancel in the menu, and closing the camera, create nothing and say nothing — and the button works again", async () => {
  await home();
  await tap("New Project");
  await answer(2);
  await wait(AFTER_SHEET_MS + AFTER_PICKER_MS);
  expect(pick).not.toHaveBeenCalled();
  expect(take).not.toHaveBeenCalled();
  take.mockResolvedValueOnce({ status: "cancelled" });
  await tap("New Project");
  expect(menu).toHaveBeenCalledTimes(2);
  await answer(1);
  await wait(AFTER_SHEET_MS + AFTER_PICKER_MS);
  expect(take).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole("button", { name: "Create" })).toBeNull();
  expect(createProject).not.toHaveBeenCalled();
  expect(useToast.getState().message).toBeNull();
  await tap("New Project");
  expect(menu).toHaveBeenCalledTimes(3);
});

test("a camera refused before: the one sentence, and Settings — as a Photos refusal is said", async () => {
  read.mockResolvedValue("denied");
  take.mockResolvedValueOnce({ status: "denied", canAskAgain: false });
  await home();
  await tap("New Project");
  await answer(1);
  await wait(AFTER_SHEET_MS);
  expect(useToast.getState().message).toBe("Clipy needs Camera access to take photos and videos. Open Settings to allow it.");
  expect(openSettings).toHaveBeenCalledTimes(1);
  expect(createProject).not.toHaveBeenCalled();
});

test("someone who has just answered Apple's alert with Don't Allow is told nothing more", async () => {
  read.mockResolvedValue("notAsked");
  take.mockResolvedValueOnce({ status: "denied", canAskAgain: false });   // iOS says "cannot ask again" from the first refusal on
  await home();
  await tap("New Project");
  await answer(1);
  await wait(AFTER_SHEET_MS);
  expect(take).toHaveBeenCalledTimes(1);
  expect(useToast.getState().message).toBeNull();
  expect(openSettings).not.toHaveBeenCalled();
  take.mockResolvedValueOnce({ status: "denied", canAskAgain: true });
  read.mockResolvedValue("denied");
  await tap("New Project");
  await answer(1);
  await wait(AFTER_SHEET_MS);
  expect(useToast.getState().message).toBeNull();
  expect(openSettings).not.toHaveBeenCalled();
});

test("a camera that cannot open says so, as a problem", async () => {
  take.mockResolvedValueOnce({ status: "unavailable" });
  await home();
  await tap("New Project");
  await answer(1);
  await wait(AFTER_SHEET_MS);
  expect(useToast.getState()).toMatchObject({ message: "Couldn't open the camera.", kind: "problem" });
  expect(openSettings).not.toHaveBeenCalled();
});

test("a second tap while the menu is up or closing opens nothing; nor does Quick Edit; the menu's answer counts once", async () => {
  take.mockResolvedValueOnce({ status: "cancelled" });
  await home();
  await tap("New Project");
  await tap("New Project");
  expect(menu).toHaveBeenCalledTimes(1);
  await answer(1);
  await answer(0);                                    // a second answer from the same menu
  await tap("New Project");          // during the wait
  await tap("Quick Edit");
  await wait(AFTER_SHEET_MS);
  expect(menu).toHaveBeenCalledTimes(1);
  expect(take).toHaveBeenCalledTimes(1);
  expect(pick).not.toHaveBeenCalled();
  expect(screen.queryByRole("header", { name: "Quick edit" })).toBeNull();
});

test("leaving Home during the wait drops it: nothing is presented later", async () => {
  await home();
  await tap("New Project");
  await answer(1);
  await act(async () => { G.__homeBlur.splice(0).forEach((off) => off()); });
  await wait(AFTER_SHEET_MS * 2);
  expect(take).not.toHaveBeenCalled();
  expect(pick).not.toHaveBeenCalled();
});
