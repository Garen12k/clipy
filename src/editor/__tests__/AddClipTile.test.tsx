jest.mock("@/src/projects/pickMedia", () => ({ pickMedia: jest.fn() }));
jest.mock("@/src/projects", () => ({ storage: { importMedia: jest.fn() } }));
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { makeClip, makePhotoClip, makeProject } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { storage } from "@/src/projects";
import { pickMedia } from "@/src/projects/pickMedia";
import { useToast } from "@/src/ui/Toast";
import { AddClipTile } from "../components/AddClipTile";

const pick = pickMedia as jest.Mock;
const importMedia = storage.importMedia as jest.Mock;
const asset = (uri: string) => ({ uri, kind: "video" as const, durationSec: 3, width: 1080, height: 1920 });
const a = makeClip({ id: "a", sourceDuration: 4 });
const b = makeClip({ id: "b", sourceDuration: 4 });

beforeEach(() => {
  jest.clearAllMocks();
  useToast.getState().clear();
  useEditorStore.getState().reset();
  useEditorStore.getState().setProject(makeProject({ clips: [a, b] }));
  useEditorStore.getState().select("a");
  useEditorStore.getState().seek(1);
});

test("pressing the tile appends the picked clips in one undo step without moving the playhead or selection", async () => {
  const c1 = makeClip({ id: "c1", sourceDuration: 3 });
  const c2 = makePhotoClip({ id: "c2" });
  pick.mockResolvedValueOnce([asset("file:///x.mov"), asset("file:///y.jpg")]);
  importMedia.mockResolvedValueOnce({ clips: [c1, c2], failed: 0 });
  await render(<AddClipTile left={0} />);
  await fireEvent.press(screen.getByRole("button", { name: "Add clips" }));
  await waitFor(() => expect(useEditorStore.getState().project!.clips.map((c) => c.id)).toEqual(["a", "b", "c1", "c2"]));
  expect(pick).toHaveBeenCalledWith();
  expect(importMedia).toHaveBeenCalledWith("p1", [asset("file:///x.mov"), asset("file:///y.jpg")]);
  const s = useEditorStore.getState();
  expect(s.playhead).toBe(1);
  expect(s.selectedClipId).toBe("a");
  expect(s.past).toHaveLength(1);
  expect(useToast.getState().message).toBeNull();
  await act(() => { s.undo(); });
  expect(useEditorStore.getState().project!.clips.map((c) => c.id)).toEqual(["a", "b"]);
});

test("some items failing shows how many were added", async () => {
  pick.mockResolvedValueOnce([asset("file:///x.mov"), asset("file:///y.mov"), asset("file:///z.mov")]);
  importMedia.mockResolvedValueOnce({ clips: [makeClip({ id: "c1", sourceDuration: 3 })], failed: 2 });
  await render(<AddClipTile left={0} />);
  await fireEvent.press(screen.getByRole("button", { name: "Add clips" }));
  await waitFor(() => expect(useToast.getState().message).toBe("1 of 3 added"));
  expect(useEditorStore.getState().project!.clips).toHaveLength(3);
});

test("nothing importable leaves the project alone and says so", async () => {
  pick.mockResolvedValueOnce([asset("file:///x.mov")]);
  importMedia.mockResolvedValueOnce({ clips: [], failed: 1 });
  await render(<AddClipTile left={0} />);
  await fireEvent.press(screen.getByRole("button", { name: "Add clips" }));
  await waitFor(() => expect(useToast.getState().message).toBe("Couldn't add those items."));
  expect(useEditorStore.getState().project!.clips).toHaveLength(2);
  expect(useEditorStore.getState().past).toHaveLength(0);
});

test("a cancelled pick changes nothing", async () => {
  pick.mockResolvedValueOnce(null);
  await render(<AddClipTile left={0} />);
  await fireEvent.press(screen.getByRole("button", { name: "Add clips" }));
  await waitFor(() => expect(pick).toHaveBeenCalledTimes(1));
  expect(importMedia).not.toHaveBeenCalled();
  expect(useEditorStore.getState().past).toHaveLength(0);
  expect(useToast.getState().message).toBeNull();
});

test("while busy the tile shows a spinner and ignores a second tap", async () => {
  let resolve: (v: unknown) => void = () => {};
  pick.mockReturnValueOnce(new Promise((r) => { resolve = r; }));
  await render(<AddClipTile left={0} />);
  await fireEvent.press(screen.getByRole("button", { name: "Add clips" }));
  expect(screen.getByTestId("add-clips-busy")).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: "Add clips" }));
  expect(pick).toHaveBeenCalledTimes(1);
  await act(async () => { resolve(null); });
  await waitFor(() => expect(screen.queryByTestId("add-clips-busy")).toBeNull());
});
