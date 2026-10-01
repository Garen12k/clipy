import { act, renderHook } from "@testing-library/react-native";
jest.mock("@/modules/clipy-video", () => ({
  isNativeAvailable: () => true,
  exportTimeline: jest.fn(async () => "job1"),
  addExportListener: jest.fn(() => ({ remove() {} })),
  cancelExport: jest.fn(),
}));
jest.mock("@/src/projects/expoFs", () => ({
  expoFs: { cacheDir: "file:///cache/", freeBytes: async () => 1e12, mkdir: async () => {} },
}));
import { exportTimeline } from "@/modules/clipy-video";
import { makeClip, makeProject } from "@/src/editor/model/types";
import { useExport } from "../useExport";

const a = makeClip({ id: "a", sourceDuration: 4 });
const b = makeClip({ id: "b", sourceDuration: 6 }); // sourceUri file:///media/b.mp4
const project = makeProject({ id: "p1", clips: [a, b] });

beforeEach(() => jest.clearAllMocks());

test("exports only clips whose source file is present", async () => {
  const { result } = await renderHook(() => useExport(project, ["file:///media/b.mp4"]));
  await act(() => result.current.start(1080));
  expect(exportTimeline).toHaveBeenCalledTimes(1);
  expect((exportTimeline as jest.Mock).mock.calls[0][0].clips).toEqual([{ sourceUri: a.sourceUri, trimStart: 0, trimEnd: 4 }]);
  expect(result.current.state.status).toBe("exporting");
});

test("errors when every clip's source is missing", async () => {
  const { result } = await renderHook(() => useExport(project, [a.sourceUri, b.sourceUri]));
  await act(() => result.current.start(1080));
  expect(exportTimeline).not.toHaveBeenCalled();
  expect(result.current.state.status).toBe("error");
});
