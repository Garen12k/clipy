jest.mock("@/src/projects/pickMedia", () => ({ pickMedia: jest.fn() }));
jest.mock("@/src/projects/camera", () => ({ canUseCamera: jest.fn(() => false), takeMedia: jest.fn() }));
jest.mock("@/src/auth/permissions", () => ({ readPermission: jest.fn(async () => "granted"), openSettings: jest.fn() }));
jest.mock("@/src/projects", () => ({ storage: { importMedia: jest.fn() } }));
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
import { act, renderHook } from "@testing-library/react-native";
import { ActionSheetIOS } from "react-native";
import { makeClip, makeProject } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { storage } from "@/src/projects";
import { AFTER_PICKER_MS } from "@/src/projects/AspectRatioSheet";
import { canUseCamera, takeMedia } from "@/src/projects/camera";
import { pickMedia } from "@/src/projects/pickMedia";
import { AFTER_SHEET_MS } from "@/src/projects/ProjectActionsSheet";
import { useToast } from "@/src/ui/Toast";
import { useClipMedia } from "../useClipMedia";

// The editor's media lock (the "+" tile, Replace, Overlay, Collage) is module-wide and outlives the editor: it never waits for a
// system sheet's promise either (AGENTS.md, Camera line; `sheetRun`).
const pick = pickMedia as jest.Mock, take = takeMedia as jest.Mock, camera = canUseCamera as jest.Mock;
const importMedia = storage.importMedia as jest.Mock;
const PICKED = [{ uri: "file:///a.jpg", kind: "photo" as const, durationSec: 0, width: 3024, height: 4032 }];
const c1 = makeClip({ id: "c1", sourceDuration: 3 });
const ids = () => useEditorStore.getState().project!.clips.map((c) => c.id);
const wait = (ms: number) => act(async () => { await new Promise((r) => setTimeout(r, ms + 50)); });
const afterSheet = () => wait(AFTER_PICKER_MS);
const open: (() => void)[] = [];
const runs: Promise<unknown>[] = [];
/** A sheet that answers only when told — or, at the end of its test, as a cancel. */
function later<T>(mock: jest.Mock, cancel: unknown = null) {
  let answer: (v: T) => void = () => {};
  mock.mockImplementationOnce(() => new Promise<T>((r) => { answer = r; open.push(() => (r as (v: unknown) => void)(cancel)); }));
  return (v: T) => act(async () => { answer(v); await new Promise((r) => setTimeout(r, 0)); });
}
/** Starts an action that may stay pending (its sheet does not answer): not awaited, given one tick. */
const start = (run: () => Promise<unknown>) => act(async () => { runs.push(run()); await new Promise((r) => setTimeout(r, 0)); });
let menu: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks(); pick.mockReset(); take.mockReset(); importMedia.mockReset(); camera.mockReturnValue(false);
  useToast.getState().clear();
  useEditorStore.getState().reset();
  useEditorStore.getState().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 4 })] }));
  menu = jest.spyOn(ActionSheetIOS, "showActionSheetWithOptions").mockImplementation(() => {});
});
afterEach(async () => {
  await act(async () => { open.splice(0).forEach((r) => r()); menu.mock.calls.forEach((c) => (c[1] as (i: number) => void)(2)); await Promise.all(runs.splice(0)); });
  menu.mockRestore();
});

test("a picker that never answers holds the lock only while it comes up: then the \"+\", Replace, Overlay and Collage work again", async () => {
  later(pick);
  const { result } = await renderHook(() => useClipMedia());
  await start(() => result.current.addMedia());
  expect(result.current.busy).toBe(true);
  await start(() => result.current.replaceMedia("a"));
  expect(pick).toHaveBeenCalledTimes(1);                // still coming up
  await afterSheet();
  expect(result.current.busy).toBe(false);
  for (const run of [() => result.current.addMedia(), () => result.current.replaceMedia("a"), () => result.current.addOverlay(), () => result.current.makeCollage("sideBySide")]) {
    pick.mockResolvedValueOnce(null);
    await act(async () => { await run(); });
  }
  expect(pick).toHaveBeenCalledTimes(5);
});

test("a LATE answer while another pick holds the lock is dropped: nothing imported, no step", async () => {
  const first = later<unknown>(pick);
  const { result } = await renderHook(() => useClipMedia());
  await start(() => result.current.addMedia());
  await afterSheet();
  later(pick);
  await start(() => result.current.addOverlay());       // its library is coming up: it holds the lock
  await first(PICKED);
  await wait(0);
  expect(importMedia).not.toHaveBeenCalled();
  expect(useEditorStore.getState().past).toHaveLength(0);
  expect(useToast.getState().message).toBeNull();
});

test("a LATE answer with nothing else running is added as ever, the lock taken again for the import", async () => {
  const answer = later<unknown>(pick);
  let imported: (v: unknown) => void = () => {};
  importMedia.mockImplementationOnce(() => new Promise((r) => { imported = r; }));
  const { result } = await renderHook(() => useClipMedia());
  await start(() => result.current.addMedia());
  await afterSheet();
  await answer(PICKED);
  expect(importMedia).toHaveBeenCalledWith("p1", PICKED);
  expect(result.current.busy).toBe(true);
  await act(async () => { imported({ clips: [c1], failed: 0 }); await Promise.all(runs.splice(0)); });
  expect(ids()).toEqual(["a", "c1"]);
  expect(useEditorStore.getState().past).toHaveLength(1);
  expect(result.current.busy).toBe(false);
});

test("a LATE answer once another project is open copies nothing into the old one", async () => {
  const answer = later<unknown>(pick);
  const { result } = await renderHook(() => useClipMedia());
  await start(() => result.current.addMedia());
  await afterSheet();
  await act(async () => { useEditorStore.getState().setProject(makeProject({ id: "p2", clips: [makeClip({ id: "b", sourceDuration: 4 })] })); });
  await answer(PICKED);
  expect(importMedia).not.toHaveBeenCalled();
});

describe("with the camera offered", () => {
  beforeEach(() => camera.mockReturnValue(true));

  test("a menu that never answers: after AFTER_PICKER_MS the \"+\" shows the menu afresh, and its choice goes on", async () => {
    const { result } = await renderHook(() => useClipMedia());
    await start(() => result.current.addMedia());
    expect(menu).toHaveBeenCalledTimes(1);
    await afterSheet();
    expect(result.current.busy).toBe(false);
    await start(() => result.current.addMedia());
    expect(menu).toHaveBeenCalledTimes(2);
    pick.mockResolvedValueOnce(null);
    await act(async () => { (menu.mock.calls[1][1] as (i: number) => void)(0); });
    await wait(AFTER_SHEET_MS);
    expect(pick).toHaveBeenCalledTimes(1);
  });

  test("a camera that never answers frees the lock; its late answer while another pick holds it is dropped", async () => {
    const shot = later<unknown>(take, { status: "cancelled" });
    const { result } = await renderHook(() => useClipMedia());
    await start(() => result.current.addMedia());
    await act(async () => { (menu.mock.calls[0][1] as (i: number) => void)(1); });
    await wait(AFTER_SHEET_MS);
    expect(take).toHaveBeenCalledTimes(1);
    await afterSheet();
    expect(result.current.busy).toBe(false);
    later(pick);
    await start(() => result.current.replaceMedia("a"));
    await shot({ status: "taken", asset: { ...PICKED[0], uri: "file:///cache/v.mov" } });
    expect(importMedia).not.toHaveBeenCalled();
    expect(useEditorStore.getState().past).toHaveLength(0);
  });
});
