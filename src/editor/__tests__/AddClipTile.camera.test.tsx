jest.mock("@/src/projects/pickMedia", () => ({ pickMedia: jest.fn() }));
jest.mock("@/src/projects/camera", () => ({ canUseCamera: jest.fn(() => true), takeMedia: jest.fn() }));
jest.mock("@/src/auth/permissions", () => ({ readPermission: jest.fn(async () => "granted"), openSettings: jest.fn() }));
jest.mock("@/src/projects", () => ({ storage: { importMedia: jest.fn() } }));
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { ActionSheetIOS } from "react-native";
import { openSettings, readPermission } from "@/src/auth/permissions";
import { makeClip, makePhotoClip, makeProject } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { storage } from "@/src/projects";
import { canUseCamera, takeMedia } from "@/src/projects/camera";
import { pickMedia } from "@/src/projects/pickMedia";
import { AFTER_SHEET_MS } from "@/src/projects/ProjectActionsSheet";
import { useToast } from "@/src/ui/Toast";
import { AddClipTile } from "../components/AddClipTile";

const pick = pickMedia as jest.Mock;
const take = takeMedia as jest.Mock;
const camera = canUseCamera as jest.Mock;
const read = readPermission as jest.Mock;
const importMedia = storage.importMedia as jest.Mock;
const TAKEN = { uri: "file:///cache/ImagePicker/v.mov", kind: "video" as const, durationSec: 3, width: 1080, height: 1920, fileName: undefined };
const a = makeClip({ id: "a", sourceDuration: 4 });
const b = makeClip({ id: "b", sourceDuration: 4 });
const ids = () => useEditorStore.getState().project!.clips.map((c) => c.id);
let menu: jest.SpyInstance;
/** Answers the menu that is up: 0 = Choose from Library, 1 = Take Photo or Video, 2 = Cancel. */
const answer = (index: number) => act(async () => { (menu.mock.calls[menu.mock.calls.length - 1][1] as (i: number) => void)(index); });
/** Real time, a little more than asked, so a timer of `ms` has run. */
const wait = (ms: number) => act(async () => { await new Promise((r) => setTimeout(r, ms + 50)); });
/** A press whose handler stays pending while the menu is up: not awaited, but given one tick. */
const tap = async () => { void fireEvent.press(screen.getByRole("button", { name: "Add clips" })); await new Promise((r) => setTimeout(r, 0)); };

beforeEach(() => {
  jest.clearAllMocks(); pick.mockReset(); take.mockReset(); importMedia.mockReset();
  camera.mockReturnValue(true); read.mockResolvedValue("granted");
  useToast.getState().clear();
  useEditorStore.getState().reset();
  useEditorStore.getState().setProject(makeProject({ clips: [a, b] }));
  useEditorStore.getState().select("a");
  useEditorStore.getState().seek(1);
  menu = jest.spyOn(ActionSheetIOS, "showActionSheetWithOptions").mockImplementation(() => {});
});
afterEach(() => menu.mockRestore());

test("an installed app that cannot open the camera shows NO menu: the tile goes straight to the library, as ever", async () => {
  camera.mockReturnValue(false);
  pick.mockResolvedValueOnce(null);
  await render(<AddClipTile left={0} />);
  await fireEvent.press(screen.getByRole("button", { name: "Add clips" }));
  expect(menu).not.toHaveBeenCalled();
  expect(pick).toHaveBeenCalledTimes(1);
  expect(pick).toHaveBeenCalledWith();
  expect(take).not.toHaveBeenCalled();
});

test("with a camera the tile shows the same two-item menu; the tile is busy from the tap, and a second tap opens nothing", async () => {
  await render(<AddClipTile left={0} />);
  await tap();
  expect(menu).toHaveBeenCalledTimes(1);
  expect(menu.mock.calls[0][0]).toEqual({ options: ["Choose from Library", "Take Photo or Video", "Cancel"], cancelButtonIndex: 2 });
  expect(screen.getByTestId("add-clips-busy")).toBeTruthy();
  await tap();
  expect(menu).toHaveBeenCalledTimes(1);
  await answer(2);
  expect(screen.queryByTestId("add-clips-busy")).toBeNull();
  await wait(AFTER_SHEET_MS);
  expect(pick).not.toHaveBeenCalled();
  expect(take).not.toHaveBeenCalled();
  expect(useEditorStore.getState().past).toHaveLength(0);
  expect(useToast.getState().message).toBeNull();
});

test("Choose from Library is today's add, after the menu has had AFTER_SHEET_MS to close", async () => {
  const c1 = makeClip({ id: "c1", sourceDuration: 3 });
  const c2 = makePhotoClip({ id: "c2" });
  const picked = [{ ...TAKEN, uri: "file:///x.mov" }, { ...TAKEN, uri: "file:///y.jpg" }];
  pick.mockResolvedValueOnce(picked);
  importMedia.mockResolvedValueOnce({ clips: [c1, c2], failed: 0 });
  await render(<AddClipTile left={0} />);
  await tap();
  await answer(0);
  await wait(AFTER_SHEET_MS - 200);
  expect(pick).not.toHaveBeenCalled();
  await wait(200);
  expect(pick).toHaveBeenCalledWith();
  expect(take).not.toHaveBeenCalled();
  expect(importMedia).toHaveBeenCalledWith("p1", picked);
  expect(ids()).toEqual(["a", "b", "c1", "c2"]);
  expect(useEditorStore.getState().past).toHaveLength(1);
});

test("Take Photo or Video adds the one taken item as a picked one is: the same import, ONE undo step, playhead and selection left alone", async () => {
  const c1 = makeClip({ id: "c1", sourceDuration: 3 });
  take.mockResolvedValueOnce({ status: "taken", asset: TAKEN });
  importMedia.mockResolvedValueOnce({ clips: [c1], failed: 0 });
  await render(<AddClipTile left={0} />);
  await tap();
  await answer(1);
  await wait(AFTER_SHEET_MS - 200);
  expect(take).not.toHaveBeenCalled();
  await wait(200);
  expect(take).toHaveBeenCalledTimes(1);
  expect(pick).not.toHaveBeenCalled();
  expect(importMedia).toHaveBeenCalledWith("p1", [TAKEN]);     // copied into the project at once, from the camera's temporary file
  expect(ids()).toEqual(["a", "b", "c1"]);
  const s = useEditorStore.getState();
  expect(s.playhead).toBe(1);
  expect(s.selectedClipId).toBe("a");
  expect(s.past).toHaveLength(1);
  expect(useToast.getState().message).toBeNull();
  expect(screen.queryByTestId("add-clips-busy")).toBeNull();
  await act(() => { s.undo(); });
  expect(ids()).toEqual(["a", "b"]);
});

test("a taken item that cannot be read says what a picked one says", async () => {
  take.mockResolvedValueOnce({ status: "taken", asset: TAKEN });
  importMedia.mockResolvedValueOnce({ clips: [], failed: 1 });
  await render(<AddClipTile left={0} />);
  await tap();
  await answer(1);
  await wait(AFTER_SHEET_MS);
  expect(useToast.getState()).toMatchObject({ message: "Couldn't add those items.", kind: "problem" });
  expect(ids()).toEqual(["a", "b"]);
  expect(useEditorStore.getState().past).toHaveLength(0);
});

test("closing the camera changes nothing and says nothing", async () => {
  take.mockResolvedValueOnce({ status: "cancelled" });
  await render(<AddClipTile left={0} />);
  await tap();
  await answer(1);
  await wait(AFTER_SHEET_MS);
  expect(take).toHaveBeenCalledTimes(1);
  expect(importMedia).not.toHaveBeenCalled();
  expect(useEditorStore.getState().past).toHaveLength(0);
  expect(useToast.getState().message).toBeNull();
  expect(screen.queryByTestId("add-clips-busy")).toBeNull();
});

test("a camera refused before says the sentence and opens Settings; one refused just now says nothing; one that cannot open says so", async () => {
  await render(<AddClipTile left={0} />);
  read.mockResolvedValue("denied");
  take.mockResolvedValueOnce({ status: "denied", canAskAgain: false });
  await tap(); await answer(1); await wait(AFTER_SHEET_MS);
  expect(useToast.getState().message).toBe("Clipy needs Camera access to take photos and videos. Open Settings to allow it.");
  expect(openSettings).toHaveBeenCalledTimes(1);
  useToast.getState().clear();
  read.mockResolvedValue("notAsked");
  take.mockResolvedValueOnce({ status: "denied", canAskAgain: false });
  await tap(); await answer(1); await wait(AFTER_SHEET_MS);
  expect(useToast.getState().message).toBeNull();
  expect(openSettings).toHaveBeenCalledTimes(1);
  take.mockResolvedValueOnce({ status: "unavailable" });
  await tap(); await answer(1); await wait(AFTER_SHEET_MS);
  expect(useToast.getState()).toMatchObject({ message: "Couldn't open the camera.", kind: "problem" });
  expect(importMedia).not.toHaveBeenCalled();
  expect(useEditorStore.getState().past).toHaveLength(0);
});

test("leaving the editor during the wait drops it and frees the lock: nothing is presented later", async () => {
  const view = await render(<AddClipTile left={0} />);
  await tap();
  await answer(1);
  await view.unmount();
  await wait(AFTER_SHEET_MS * 2);
  expect(take).not.toHaveBeenCalled();
  expect(pick).not.toHaveBeenCalled();
  pick.mockResolvedValueOnce(null);
  camera.mockReturnValue(false);
  await render(<AddClipTile left={0} />);
  await fireEvent.press(screen.getByRole("button", { name: "Add clips" }));
  expect(pick).toHaveBeenCalledTimes(1);          // the shared lock was released
});
