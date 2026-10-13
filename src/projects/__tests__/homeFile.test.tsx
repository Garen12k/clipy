import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react-native";

jest.mock("expo-router", () => ({ router: { push: jest.fn() }, useFocusEffect: (cb: () => void | (() => void)) => { const React = require("react"); React.useEffect(cb, []); } }));
jest.mock("@/src/auth/welcomeSeen", () => ({ hasSeenWelcome: () => true, markWelcomeSeen: jest.fn() }));
jest.mock("@/src/projects/pickMedia", () => ({ pickMedia: jest.fn() }));
jest.mock("@/src/publish/pickVideo", () => ({ pickVideoForPost: jest.fn() }));
jest.mock("@/src/projects", () => ({
  storage: { listProjects: jest.fn(), createProject: jest.fn(), renameProject: jest.fn(), duplicateProject: jest.fn(), deleteProject: jest.fn(), importAudio: jest.fn(), saveProject: jest.fn(),
    packProject: jest.fn(), restoreProject: jest.fn(), sweepProjectFiles: jest.fn(async () => {}) },
  filePhone: { pick: jest.fn(), share: jest.fn(async () => {}), forget: jest.fn(async () => {}) },
}));
jest.mock("@/src/projects/quickEditFlow", () => ({ makeQuickEdit: jest.fn() }));
jest.mock("@/src/lib/id", () => ({ newId: () => "new-id" }));

import { router } from "expo-router";
import { Alert } from "react-native";
import ProjectsScreen from "@/app/index";
import { filePhone, storage } from "@/src/projects";
import { AFTER_PICKER_MS } from "@/src/projects/AspectRatioSheet";
import { AFTER_SHEET_MS, ProjectActionsSheet } from "@/src/projects/ProjectActionsSheet";
import { ProjectFileError, type FileRun } from "@/src/projects/projectFile";
import { DISABLED_OPACITY } from "@/src/ui/buttonStyle";
import { useToast } from "@/src/ui/Toast";

const list = storage.listProjects as jest.Mock, packProject = storage.packProject as jest.Mock, restoreProject = storage.restoreProject as jest.Mock, sweep = storage.sweepProjectFiles as jest.Mock;
const pick = filePhone.pick as jest.Mock, share = filePhone.share as jest.Mock, forget = filePhone.forget as jest.Mock;
const BEACH = { id: "a", name: "Beach", durationSec: 65, updatedAt: new Date().toISOString(), thumbUri: null, broken: false, postedTo: [], coverTitle: "" };
const BROKEN = { id: "z", name: "Can't open", durationSec: 0, updatedAt: "", thumbUri: null, broken: true, postedTo: [], coverTitle: "" };
const btn = (name: string) => screen.getByRole("button", { name });
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, AFTER_SHEET_MS + 50)); });
let warn: jest.SpyInstance, alert: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks(); list.mockReset(); list.mockResolvedValue([BEACH, BROKEN]); packProject.mockReset(); restoreProject.mockReset(); pick.mockReset();
  share.mockReset(); share.mockResolvedValue(undefined); useToast.getState().clear();
  warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
});
afterEach(() => { warn.mockRestore(); alert.mockRestore(); });
const home = async () => { await render(<ProjectsScreen />); await screen.findByText("Beach"); };

/**
 * A run that stands still until `finish` or `fail`; `run` is what the screen handed to storage. `pressed` is the press that started
 * it, where the press itself waits for the run (the folder button: `fireEvent.press` resolves only when its handler has).
 */
function held(mock: jest.Mock) {
  let finish: (v: unknown) => void = () => {}, fail: (e: unknown) => void = () => {};
  const box: { run: FileRun | null; pressed: Promise<unknown> | null } = { run: null, pressed: null };
  mock.mockImplementationOnce((_first: string, run: FileRun) => { box.run = run; return new Promise((res, rej) => { finish = res; fail = rej; }); });
  return { box, finish: (v: unknown) => act(async () => { finish(v); await box.pressed; }), fail: (e: unknown) => act(async () => { fail(e); await box.pressed; }) };
}
const startSave = async () => {
  const h = held(packProject);
  await home();
  await fireEvent.press(btn("More for Beach"));
  await fireEvent.press(await screen.findByRole("button", { name: "Save a Copy" }));
  await settle();
  await screen.findByTestId("home-transfer");
  return h;
};

describe("the header's folder button and the sheet's button", () => {
  test("the pill holds three buttons; Open Project File is the middle one", async () => {
    await home();
    expect(within(screen.getByTestId("home-header-actions")).getAllByRole("button").map((b) => b.props.accessibilityLabel)).toEqual(["Post a video", "Open Project File", "Accounts"]);
  });
  test("Save a Copy is offered for a project and not for one that cannot be opened", async () => {
    await home();
    await fireEvent.press(btn("More for Beach"));
    expect(await screen.findByRole("button", { name: "Save a Copy" })).toBeTruthy();
    for (const name of ["Rename", "Duplicate", "Delete"]) expect(btn(name)).toBeTruthy();
  });
  test("the sheet of a project that cannot be opened has Delete only", async () => {
    await render(<ProjectActionsSheet project={BROKEN} onClose={jest.fn()} onRename={jest.fn()} onDuplicate={jest.fn()} onSaveCopy={jest.fn()} onDelete={jest.fn()} />);
    for (const name of ["Rename", "Duplicate", "Save a Copy"]) expect(screen.queryByRole("button", { name })).toBeNull();
    expect(btn("Delete")).toBeTruthy();
  });
});

describe("Save a Copy", () => {
  test("while it runs: the card with the name, the size and the percent; Home takes no touches and is dimmed; the two actions are gone", async () => {
    const h = await startSave();
    expect(packProject).toHaveBeenCalledWith("a", expect.objectContaining({ cancelled: false }));
    await act(async () => { h.box.run!.onStart!({ name: "Beach", bytes: 2e9 }); h.box.run!.onProgress!(1e9); });
    expect(screen.getByText("Saving a copy")).toBeTruthy();
    expect(screen.getByText("Beach · 2.0 GB")).toBeTruthy();
    expect(screen.getByTestId("home-transfer-bar")).toHaveProp("accessibilityValue", { min: 0, max: 100, now: 50 });
    for (const id of ["home-header-actions", "home-list"]) { expect(screen.getByTestId(id).props.pointerEvents).toBe("none"); expect(screen.getByTestId(id)).toHaveStyle({ opacity: DISABLED_OPACITY }); }
    expect(screen.queryByRole("button", { name: "New Project" })).toBeNull();
    expect(screen.queryByTestId("home-making")).toBeNull();
    await h.finish({ uri: "file:///cache/project-files/r/Beach.clipy", name: "Beach", bytes: 2e9, missing: 0 });
  });

  test("done: the share sheet gets the file; Home is itself again at once; the copy is NOT removed when the sheet closes (a share target may still be reading it); nothing is said", async () => {
    const h = await startSave();
    let closeSheet: () => void = () => {};
    share.mockImplementationOnce(() => new Promise<void>((r) => { closeSheet = r; }));
    await h.finish({ uri: "file:///cache/project-files/r/Beach.clipy", name: "Beach", bytes: 5e6, missing: 0 });
    await waitFor(() => expect(share).toHaveBeenCalledWith("file:///cache/project-files/r/Beach.clipy"));
    expect(screen.queryByTestId("home-transfer")).toBeNull();
    expect(screen.getByTestId("home-list").props.pointerEvents).toBe("auto");
    expect(sweep).not.toHaveBeenCalled();
    await act(async () => { closeSheet(); });
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    // Review m1: the copy stays in the cache until the next save or open, or the next launch — storage sweeps there.
    expect(sweep).not.toHaveBeenCalled();
    expect(useToast.getState().message).toBeNull();
    expect(alert).not.toHaveBeenCalled();
  });

  test("files were missing: said once, after the share sheet", async () => {
    const h = await startSave();
    let closeSheet: () => void = () => {};
    share.mockImplementationOnce(() => new Promise<void>((r) => { closeSheet = r; }));
    await h.finish({ uri: "file:///c/Beach.clipy", name: "Beach", bytes: 5e6, missing: 2 });
    await waitFor(() => expect(share).toHaveBeenCalled());
    expect(useToast.getState().message).toBeNull();      // not while the sheet is up
    await act(async () => { closeSheet(); });
    await waitFor(() => expect(useToast.getState().message).toBe("2 files of this project are missing and are not in the copy"));
  });

  test("Cancel sets the run's flag; a cancelled run says nothing and shares nothing", async () => {
    const h = await startSave();
    await fireEvent.press(btn("Cancel"));
    expect(h.box.run!.cancelled).toBe(true);
    await h.fail(new ProjectFileError("cancelled"));
    await waitFor(() => expect(screen.queryByTestId("home-transfer")).toBeNull());
    expect(share).not.toHaveBeenCalled(); expect(alert).not.toHaveBeenCalled(); expect(useToast.getState().message).toBeNull();
    expect(btn("New Project")).toBeTruthy();
  });

  test("after Cancel, until the cancelled run has really ended (its files removed), the card stays and nothing else starts", async () => {
    const h = await startSave();
    await fireEvent.press(btn("Cancel"));
    expect(screen.getByTestId("home-transfer")).toBeTruthy();
    expect(screen.getByTestId("home-list").props.pointerEvents).toBe("none");
    await fireEvent.press(btn("Open Project File"));
    expect(pick).not.toHaveBeenCalled();
    expect(packProject).toHaveBeenCalledTimes(1);
    await h.fail(new ProjectFileError("cancelled"));
    await waitFor(() => expect(screen.queryByTestId("home-transfer")).toBeNull());
    // …and afterwards the next one starts.
    pick.mockResolvedValueOnce(null);
    await fireEvent.press(btn("Open Project File"));
    await waitFor(() => expect(pick).toHaveBeenCalledTimes(1));
  });

  test("no room: the alert with both sizes; any other failure: the plain alert, never the system's words", async () => {
    let h = await startSave();
    await h.fail(new ProjectFileError("space", 2.1e9, 1.4e9));
    await waitFor(() => expect(alert).toHaveBeenCalledWith("Not enough free space", "Saving a copy needs 2.1 GB. This iPhone has 1.4 GB free."));
    alert.mockClear();
    h = held(packProject);
    await fireEvent.press(btn("More for Beach"));
    await fireEvent.press(await screen.findByRole("button", { name: "Save a Copy" }));
    await settle();
    await h.fail(new Error("NSCocoaErrorDomain 640"));
    await waitFor(() => expect(alert).toHaveBeenCalledWith("Couldn't save a copy", "Something went wrong while saving. Try again."));
    expect(share).not.toHaveBeenCalled();
  });

  test("a share sheet that cannot be shown: the plain alert (the file is swept by the next run or launch)", async () => {
    const h = await startSave();
    share.mockRejectedValueOnce(new Error("no view controller"));
    await h.finish({ uri: "file:///c/Beach.clipy", name: "Beach", bytes: 5e6, missing: 0 });
    await waitFor(() => expect(alert).toHaveBeenCalledWith("Couldn't save a copy", "The share sheet couldn't be opened. Try again."));
    expect(sweep).not.toHaveBeenCalled();
  });

  test("while a copy is saved nothing else starts: the folder button's picker is not opened", async () => {
    const h = await startSave();
    await fireEvent.press(btn("Open Project File"));     // inert by pointerEvents on a phone; the guard holds here too
    expect(pick).not.toHaveBeenCalled();
    await h.finish({ uri: "file:///c/Beach.clipy", name: "Beach", bytes: 5e6, missing: 0 });
  });
});

describe("Open Project File", () => {
  const startOpen = async () => {
    pick.mockResolvedValueOnce("file:///tmp/inbox/Beach.clipy");
    const h = held(restoreProject);
    await home();
    h.box.pressed = fireEvent.press(btn("Open Project File"));
    await screen.findByTestId("home-transfer");
    return h;
  };
  test("the picker closed: nothing happens", async () => {
    pick.mockResolvedValueOnce(null);
    await home();
    await fireEvent.press(btn("Open Project File"));
    await waitFor(() => expect(pick).toHaveBeenCalledTimes(1));
    expect(restoreProject).not.toHaveBeenCalled(); expect(screen.queryByTestId("home-transfer")).toBeNull(); expect(alert).not.toHaveBeenCalled();
  });
  test("a second tap while the picker is up opens no second picker", async () => {
    let answer: (v: string | null) => void = () => {};
    pick.mockImplementationOnce(() => new Promise((r) => { answer = r; }));
    await home();
    const first = fireEvent.press(btn("Open Project File"));
    await waitFor(() => expect(pick).toHaveBeenCalledTimes(1));
    await fireEvent.press(btn("Open Project File"));
    expect(pick).toHaveBeenCalledTimes(1);
    await act(async () => { answer(null); await first; });
    expect(restoreProject).not.toHaveBeenCalled();
  });
  test("the file is opened only once the picker has had time to leave (an alert presented while it leaves is dropped by iOS)", async () => {
    pick.mockResolvedValueOnce("file:///tmp/inbox/Beach.clipy");
    const h = held(restoreProject);
    await home();
    h.box.pressed = fireEvent.press(btn("Open Project File"));
    await waitFor(() => expect(pick).toHaveBeenCalledTimes(1));
    await act(async () => { await new Promise((r) => setTimeout(r, AFTER_PICKER_MS - 150)); });
    expect(restoreProject).not.toHaveBeenCalled();
    await fireEvent.press(btn("Open Project File"));      // still held by the guard
    expect(pick).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(restoreProject).toHaveBeenCalledTimes(1));
    await h.fail(new ProjectFileError("cancelled"));
  });
  test("opened: the card, then the list is read again, the toast names the project, the picked copy is removed — and the editor is NOT opened", async () => {
    const h = await startOpen();
    expect(restoreProject).toHaveBeenCalledWith("file:///tmp/inbox/Beach.clipy", expect.objectContaining({ cancelled: false }));
    expect(screen.getByText("Opening project file")).toBeTruthy();
    expect(screen.getByTestId("home-list").props.pointerEvents).toBe("none");
    list.mockClear();
    await h.finish({ id: "n", name: "Beach copy" });
    await waitFor(() => expect(useToast.getState().message).toBe("Beach copy was added to your projects"));
    expect(list).toHaveBeenCalled();
    expect(forget).toHaveBeenCalledWith("file:///tmp/inbox/Beach.clipy");
    expect(router.push).not.toHaveBeenCalled();
    expect(screen.queryByTestId("home-transfer")).toBeNull();
  });
  test.each([
    ["notClipy", "Can't open this file", "That isn't a Clipy project file."],
    ["damaged", "Can't open this file", "This project file is damaged or incomplete."],
    ["newer", "Can't open this file", "It was made with a newer version of Clipy. Update the app to open it."],
  ] as const)("%s: its own alert; the picked copy is removed; no toast", async (code, title, message) => {
    const h = await startOpen();
    await h.fail(new ProjectFileError(code));
    await waitFor(() => expect(alert).toHaveBeenCalledWith(title, message));
    expect(forget).toHaveBeenCalledWith("file:///tmp/inbox/Beach.clipy");
    expect(useToast.getState().message).toBeNull();
    expect(btn("New Project")).toBeTruthy();
  });
  test("no room says both sizes; Cancel says nothing", async () => {
    let h = await startOpen();
    await h.fail(new ProjectFileError("space", 3e9, 1e9));
    await waitFor(() => expect(alert).toHaveBeenCalledWith("Not enough free space", "Opening this project needs 3.0 GB. This iPhone has 1.0 GB free."));
    alert.mockClear();
    pick.mockResolvedValueOnce("file:///tmp/inbox/Beach.clipy");
    h = held(restoreProject);
    h.box.pressed = fireEvent.press(btn("Open Project File"));
    await screen.findByTestId("home-transfer");
    await fireEvent.press(btn("Cancel"));
    expect(h.box.run!.cancelled).toBe(true);
    await h.fail(new ProjectFileError("cancelled"));
    await waitFor(() => expect(screen.queryByTestId("home-transfer")).toBeNull());
    expect(alert).not.toHaveBeenCalled();
  });
});
