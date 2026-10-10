import { act, render, renderHook } from "@testing-library/react-native";
const mockNav = { setOptions: jest.fn() };
jest.mock("expo-router", () => ({ router: { back: jest.fn(), push: jest.fn(), dismiss: jest.fn() }, useNavigation: () => mockNav }));
jest.mock("expo-sharing", () => ({ shareAsync: jest.fn() }));
jest.mock("@/src/lib/fileInfo", () => ({ fileSize: () => 0 }));
jest.mock("@/src/publish/supabase", () => ({ isBackendConfigured: () => false }));
jest.mock("@/src/lib/notify", () => ({ notifyAvailable: jest.fn(() => true), notifyState: jest.fn(), askToNotify: jest.fn(), notifyDone: jest.fn() }));
let mockState: { status: string; progress: number; fileUri?: string; message?: string } = { status: "idle", progress: 0 };
jest.mock("@/src/export/useExport", () => ({ useExport: () => ({ state: mockState, start: jest.fn(), cancel: jest.fn(), reset: jest.fn() }) }));
import { AppState, type AppStateStatus } from "react-native";
import ExportScreen from "@/app/editor/[id]/export";
import { makeClip, makeProject } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { askToNotify, notifyDone, notifyState } from "@/src/lib/notify";
import { useExportNotice } from "../exportNotice";
import type { ExportState } from "../useExport";

const state = notifyState as jest.Mock;
const done = notifyDone as jest.Mock;
type Status = ExportState["status"];
/** Where the app is when the export ends. */
const app = (now: AppStateStatus) => { Object.defineProperty(AppState, "currentState", { configurable: true, get: () => now }); };
const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });
const hook = (first: Status = "idle", name = "Beach day") => renderHook(({ status, name: n }: { status: Status; name: string }) => useExportNotice(status, n), { initialProps: { status: first, name } });

beforeEach(() => { jest.clearAllMocks(); state.mockResolvedValue("granted"); done.mockResolvedValue(true); app("background"); mockState = { status: "idle", progress: 0 }; });
afterAll(() => app("active"));

test("an export that finishes while the app is not in front: ONE notification, with the project's name", async () => {
  const h = await hook();
  await h.rerender({ status: "exporting", name: "Beach day" });
  await flush();
  expect(done).not.toHaveBeenCalled();
  await h.rerender({ status: "done", name: "Beach day" });
  await flush();
  expect(done).toHaveBeenCalledTimes(1);
  expect(done).toHaveBeenCalledWith("Your video is ready", "Beach day finished exporting.");
  expect(askToNotify).not.toHaveBeenCalled();                    // it never asks
});

test("once per export: more renders of the done screen, a new name, or done seen again say nothing more", async () => {
  const h = await hook("exporting");
  await h.rerender({ status: "done", name: "Beach day" });
  await h.rerender({ status: "done", name: "Beach day" });
  await h.rerender({ status: "done", name: "Renamed" });
  await flush();
  expect(done).toHaveBeenCalledTimes(1);
  // Back to the options and a second export: that one has its own notice.
  await h.rerender({ status: "idle", name: "Renamed" });
  await h.rerender({ status: "done", name: "Renamed" });        // done without an export before it: nothing
  await flush();
  expect(done).toHaveBeenCalledTimes(1);
  await h.rerender({ status: "idle", name: "Renamed" });
  await h.rerender({ status: "exporting", name: "Renamed" });
  await h.rerender({ status: "done", name: "Renamed" });
  await flush();
  expect(done).toHaveBeenCalledTimes(2);
  expect(done).toHaveBeenLastCalledWith("Your video is ready", "Renamed finished exporting.");
});

test("a screen opened on a finished export says nothing", async () => {
  await hook("done");
  await flush();
  expect(done).not.toHaveBeenCalled();
});

test("in front, the Export screen itself shows the end: no notification, and the phone is not even asked", async () => {
  app("active");
  const h = await hook("exporting");
  await h.rerender({ status: "done", name: "Beach day" });
  await flush();
  expect(done).not.toHaveBeenCalled();
  expect(state).not.toHaveBeenCalled();
});

test("inactive counts as not in front (the app switcher, a call)", async () => {
  app("inactive");
  const h = await hook("exporting");
  await h.rerender({ status: "done", name: "Beach day" });
  await flush();
  expect(done).toHaveBeenCalledTimes(1);
});

test.each(["notAsked", "denied", "unavailable"])("notifications that are %s: nothing is shown and nothing is asked", async (answer) => {
  state.mockResolvedValue(answer);
  const h = await hook("exporting");
  await h.rerender({ status: "done", name: "Beach day" });
  await flush();
  expect(done).not.toHaveBeenCalled();
  expect(askToNotify).not.toHaveBeenCalled();
});

test("a failure and a cancel say nothing", async () => {
  const h = await hook("exporting");
  await h.rerender({ status: "error", name: "Beach day" });
  await flush();
  await h.rerender({ status: "idle", name: "Beach day" });
  await h.rerender({ status: "exporting", name: "Beach day" });
  await h.rerender({ status: "idle", name: "Beach day" });      // cancelled
  await flush();
  expect(done).not.toHaveBeenCalled();
  expect(state).not.toHaveBeenCalled();
});

test("a read that fails is swallowed", async () => {
  state.mockRejectedValue(new Error("boom"));
  const h = await hook("exporting");
  await h.rerender({ status: "done", name: "Beach day" });
  await flush();
  expect(done).not.toHaveBeenCalled();
});

test("the export route is where it is hooked: its export's state and the open project's name", async () => {
  useEditorStore.getState().reset();
  useEditorStore.getState().setProject(makeProject({ id: "p1", name: "Harbour", clips: [makeClip({ id: "a", sourceDuration: 21 })] }));
  mockState = { status: "exporting", progress: 0.5 };
  const view = await render(<ExportScreen />);
  await flush();
  expect(done).not.toHaveBeenCalled();
  mockState = { status: "done", progress: 1, fileUri: "file:///out.mp4" };
  await view.rerender(<ExportScreen />);
  await flush();
  await view.rerender(<ExportScreen />);
  await flush();
  expect(done).toHaveBeenCalledTimes(1);
  expect(done).toHaveBeenCalledWith("Your video is ready", "Harbour finished exporting.");
});
