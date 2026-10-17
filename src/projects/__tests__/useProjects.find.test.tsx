jest.mock("expo-router", () => ({ useFocusEffect: (cb: () => void) => { const React = require("react"); React.useEffect(cb, []); } }));
jest.mock("@/src/projects", () => ({ storage: { listProjects: jest.fn(), deleteProject: jest.fn() } }));

import { act, renderHook, waitFor } from "@testing-library/react-native";
import { storage } from "@/src/projects";
import { useProjects } from "../useProjects";

const list = storage.listProjects as jest.Mock, del = storage.deleteProject as jest.Mock;
let warn: jest.SpyInstance;
beforeEach(() => { list.mockReset(); del.mockReset(); warn = jest.spyOn(console, "warn").mockImplementation(() => {}); });
afterEach(() => warn.mockRestore());

test("listed is false until a listing has come back (Home's pins are never pruned against the empty list before it)", async () => {
  let answer: (v: unknown) => void = () => {};
  list.mockImplementationOnce(() => new Promise((r) => { answer = r; }));
  const { result } = await renderHook(() => useProjects());
  expect(result.current.listed).toBe(false);
  await act(async () => { answer([]); });
  await waitFor(() => expect(result.current.listed).toBe(true));
});

test("remove answers whether the project was deleted", async () => {
  list.mockResolvedValue([]);
  const { result } = await renderHook(() => useProjects());
  let gone: boolean | undefined;
  del.mockResolvedValueOnce(undefined);
  await act(async () => { gone = await result.current.remove("a"); });
  expect(gone).toBe(true);
  del.mockRejectedValueOnce(new Error("no"));
  await act(async () => { gone = await result.current.remove("b"); });
  expect(gone).toBe(false);
});
