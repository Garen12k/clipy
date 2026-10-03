jest.mock("@/src/projects/pickMedia", () => ({ pickMedia: jest.fn() }));
jest.mock("@/src/projects", () => ({ storage: { importMedia: jest.fn() } }));
jest.mock("@/src/lib/clock", () => ({ nowIso: () => "2026-10-01T10:00:00.000Z" }));
import { act, renderHook } from "@testing-library/react-native";
import { makeClip, makeProject } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { storage } from "@/src/projects";
import { pickMedia } from "@/src/projects/pickMedia";
import { useToast } from "@/src/ui/Toast";
import { useClipMedia } from "../useClipMedia";

const pick = pickMedia as jest.Mock;
const importMedia = storage.importMedia as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  useToast.getState().clear();
  useEditorStore.getState().reset();
  useEditorStore.getState().setProject(makeProject({ clips: [makeClip({ id: "a", sourceDuration: 4 })] }));
});

test("a second pick while one is open is ignored (add and replace share the lock)", async () => {
  let resolve: (v: unknown) => void = () => {};
  pick.mockReturnValueOnce(new Promise((r) => { resolve = r; }));
  const { result } = await renderHook(() => useClipMedia());
  let first: Promise<void> = Promise.resolve();
  await act(async () => { first = result.current.addMedia(); });
  expect(result.current.busy).toBe(true);
  await act(async () => { await result.current.addMedia(); await result.current.replaceMedia("a"); });
  expect(pick).toHaveBeenCalledTimes(1);
  await act(async () => { resolve(null); await first; });
  expect(result.current.busy).toBe(false);
});

test("a picker error is reported and releases the lock", async () => {
  jest.spyOn(console, "warn").mockImplementation(() => {});
  pick.mockRejectedValueOnce(new Error("boom"));
  const { result } = await renderHook(() => useClipMedia());
  await act(async () => { await result.current.addMedia(); });
  expect(useToast.getState().message).toBe("Couldn't add those items.");
  expect(result.current.busy).toBe(false);
  (console.warn as jest.Mock).mockRestore();
});
