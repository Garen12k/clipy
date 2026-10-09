import { fireEvent, render, screen } from "@testing-library/react-native";
const mockNav = { setOptions: jest.fn() };
jest.mock("expo-router", () => ({ router: { back: jest.fn(), push: jest.fn(), dismiss: jest.fn() }, useNavigation: () => mockNav }));
jest.mock("expo-media-library/legacy", () => ({ requestPermissionsAsync: jest.fn(), saveToLibraryAsync: jest.fn() }));
jest.mock("expo-sharing", () => ({ shareAsync: jest.fn() }));
jest.mock("@/src/lib/fileInfo", () => ({ fileSize: () => 14000000 }));
jest.mock("@/src/publish/supabase", () => ({ isBackendConfigured: jest.fn() }));
const DONE = { status: "done", progress: 1, fileUri: "file:///out.mp4" };
let mockState: { status: string; progress: number; fileUri?: string } = DONE;
jest.mock("@/src/export/useExport", () => ({ useExport: () => ({ state: mockState, start: jest.fn(), cancel: jest.fn(), reset: jest.fn() }) }));
import { router } from "expo-router";
import ExportScreen from "@/app/editor/[id]/export";
import { makeClip, makeProject } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { isBackendConfigured } from "@/src/publish/supabase";

beforeEach(() => {
  jest.clearAllMocks();
  mockState = DONE;
  useEditorStore.getState().reset();
  useEditorStore.getState().setProject(makeProject({ id: "p1", name: "Beach day", clips: [makeClip({ id: "a", sourceDuration: 21 })] }));
});

test("without a posting backend the finish screen has no Post button", async () => {
  (isBackendConfigured as jest.Mock).mockReturnValue(false);
  await render(<ExportScreen />);
  expect(screen.queryByRole("button", { name: "Post to…" })).toBeNull();
  expect(screen.getByTestId("primary-button")).toHaveAccessibleName("Save to Photos");
});

test("Post to… closes the export modal, then opens the Post screen for the exported file and project", async () => {
  (isBackendConfigured as jest.Mock).mockReturnValue(true);
  const order: string[] = [];
  (router.dismiss as jest.Mock).mockImplementation(() => order.push("dismiss"));
  (router.push as jest.Mock).mockImplementation(() => order.push("push"));
  await render(<ExportScreen />);
  await fireEvent.press(screen.getByRole("button", { name: "Post to…" }));
  expect(order).toEqual(["dismiss", "push"]);
  expect(router.dismiss).toHaveBeenCalledWith();
  expect(router.push).toHaveBeenCalledWith({ pathname: "/post", params: { fileUri: "file:///out.mp4", durationSec: "21", mimeType: "video/mp4", projectId: "p1", title: "Beach day" } });
});

describe("cover hand-off", () => {
  const press = async () => {
    (isBackendConfigured as jest.Mock).mockReturnValue(true);
    await render(<ExportScreen />);
    await fireEvent.press(screen.getByRole("button", { name: "Post to…" }));
    return (router.push as jest.Mock).mock.calls[0][0].params;
  };
  test("a cover time goes along in whole milliseconds", async () => {
    useEditorStore.getState().setProject(makeProject({ id: "p1", name: "Beach day", clips: [makeClip({ id: "a", sourceDuration: 21 })], cover: { time: 5, title: "" } }));
    expect((await press()).coverMs).toBe("5000");
  });
  test("a cover at or past the end goes as the last frame the cover itself shows: the end less the last-frame slack, inside the video", async () => {
    useEditorStore.getState().setProject(makeProject({ id: "p1", name: "Beach day", clips: [makeClip({ id: "a", sourceDuration: 21 })], cover: { time: 99, title: "" } }));
    expect((await press()).coverMs).toBe("20950");   // 21 s − LAST_FRAME_SLACK (0.05 s)
  });
  test("a cover exactly at the end is not sent as the video's length", async () => {
    useEditorStore.getState().setProject(makeProject({ id: "p1", name: "Beach day", clips: [makeClip({ id: "a", sourceDuration: 21 })], cover: { time: 21, title: "" } }));
    expect((await press()).coverMs).toBe("20950");
  });
  test("just before the slack the time is its own", async () => {
    useEditorStore.getState().setProject(makeProject({ id: "p1", name: "Beach day", clips: [makeClip({ id: "a", sourceDuration: 21 })], cover: { time: 20.9, title: "" } }));
    expect((await press()).coverMs).toBe("20900");
  });
  test("no cover, no key", async () => {
    expect("coverMs" in (await press())).toBe(false);
  });
});

test("while exporting, the sheet's swipe-down is switched off", async () => {
  (isBackendConfigured as jest.Mock).mockReturnValue(false);
  mockState = { status: "exporting", progress: 0.3 };
  await render(<ExportScreen />);
  expect(mockNav.setOptions).toHaveBeenLastCalledWith({ gestureEnabled: false });
  expect(screen.getByRole("button", { name: "Cancel" })).toBeTruthy();      // the way out
});

test("when the export is finished (or has not started) the sheet can be swiped down again", async () => {
  (isBackendConfigured as jest.Mock).mockReturnValue(false);
  mockState = { status: "exporting", progress: 0.9 };
  const view = await render(<ExportScreen />);
  mockState = DONE;
  await view.rerender(<ExportScreen />);
  expect(mockNav.setOptions).toHaveBeenLastCalledWith({ gestureEnabled: true });
  mockState = { status: "idle", progress: 0 };
  await view.rerender(<ExportScreen />);
  expect(mockNav.setOptions).toHaveBeenLastCalledWith({ gestureEnabled: true });
});

test.each(["error", "unavailable"])("after an export that is %s the sheet can be swiped down", async (status) => {
  (isBackendConfigured as jest.Mock).mockReturnValue(false);
  mockState = { status: "exporting", progress: 0.4 };
  const view = await render(<ExportScreen />);
  expect(mockNav.setOptions).toHaveBeenLastCalledWith({ gestureEnabled: false });
  mockState = { status, progress: 0 };
  await view.rerender(<ExportScreen />);
  expect(mockNav.setOptions).toHaveBeenLastCalledWith({ gestureEnabled: true });
});

test("Close leaves the sheet, as Done does", async () => {
  (isBackendConfigured as jest.Mock).mockReturnValue(false);
  mockState = { status: "idle", progress: 0 };
  await render(<ExportScreen />);
  await fireEvent.press(screen.getByRole("button", { name: "Close" }));
  expect(router.back).toHaveBeenCalledTimes(1);
});

test("while exporting, Close is as inert as the swipe", async () => {
  (isBackendConfigured as jest.Mock).mockReturnValue(false);
  mockState = { status: "exporting", progress: 0.3 };
  await render(<ExportScreen />);
  expect(screen.getByRole("button", { name: "Close" })).toBeDisabled();
  await fireEvent.press(screen.getByRole("button", { name: "Close" }));
  expect(router.back).not.toHaveBeenCalled();
});
