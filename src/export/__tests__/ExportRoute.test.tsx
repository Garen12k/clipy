import { fireEvent, render, screen } from "@testing-library/react-native";
jest.mock("expo-router", () => ({ router: { back: jest.fn(), push: jest.fn(), dismiss: jest.fn() } }));
jest.mock("expo-media-library/legacy", () => ({ requestPermissionsAsync: jest.fn(), saveToLibraryAsync: jest.fn() }));
jest.mock("expo-sharing", () => ({ shareAsync: jest.fn() }));
jest.mock("@/src/lib/fileInfo", () => ({ fileSize: () => 14000000 }));
jest.mock("@/src/publish/supabase", () => ({ isBackendConfigured: jest.fn() }));
jest.mock("@/src/export/useExport", () => ({ useExport: () => ({ state: { status: "done", progress: 1, fileUri: "file:///out.mp4" }, start: jest.fn(), cancel: jest.fn(), reset: jest.fn() }) }));
import { router } from "expo-router";
import ExportScreen from "@/app/editor/[id]/export";
import { makeClip, makeProject } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { isBackendConfigured } from "@/src/publish/supabase";

beforeEach(() => {
  jest.clearAllMocks();
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
  test("a cover time past the exported length is clamped to it", async () => {
    useEditorStore.getState().setProject(makeProject({ id: "p1", name: "Beach day", clips: [makeClip({ id: "a", sourceDuration: 21 })], cover: { time: 99, title: "" } }));
    expect((await press()).coverMs).toBe("21000");
  });
  test("no cover, no key", async () => {
    expect("coverMs" in (await press())).toBe(false);
  });
});
