import { act, renderHook } from "@testing-library/react-native";
import { HOME_PREFS_KEY } from "../homePrefs";
import type { ProjectSummary } from "../storage";
import { useHomeFind } from "../useHomeFind";

const p = (id: string, name: string): ProjectSummary => ({ id, name, durationSec: 10, updatedAt: "2026-10-01T00:00:00.000Z", createdAt: "2026-10-01T00:00:00.000Z", thumbUri: null, broken: false, postedTo: [], coverTitle: "" });
const stored = () => JSON.parse(localStorage.getItem(HOME_PREFS_KEY) ?? "null");
const put = (v: unknown) => localStorage.setItem(HOME_PREFS_KEY, JSON.stringify(v));
beforeEach(() => localStorage.removeItem(HOME_PREFS_KEY));

test("the first render already has the stored sort and pins", async () => {
  put({ version: 1, sort: "name", pins: ["b"] });
  const { result } = await renderHook(() => useHomeFind([p("a", "Zoo"), p("b", "Beach")], false));
  expect(result.current.sort).toBe("name");
  expect(result.current.isPinned("b")).toBe(true);
  expect(result.current.rows.map((r) => r.key)).toEqual(["heading:pinned", "cards:b", "heading:rest", "cards:a"]);
});

test("pins are pruned only once a listing came back, and written only when one was dropped", async () => {
  put({ version: 1, sort: "edited", pins: ["a", "gone"] });
  const setItem = jest.spyOn(localStorage, "setItem");
  const { rerender } = await renderHook(({ list, listed }: { list: ProjectSummary[]; listed: boolean }) => useHomeFind(list, listed), { initialProps: { list: [], listed: false } });
  expect(stored().pins).toEqual(["a", "gone"]);   // the list before the first listing is empty: it never prunes
  await rerender({ list: [p("a", "A")], listed: true });
  expect(stored().pins).toEqual(["a"]);
  setItem.mockClear();
  await rerender({ list: [p("a", "A"), p("c", "C")], listed: true });
  expect(setItem).not.toHaveBeenCalled();
  setItem.mockRestore();
});

test("pin, unpin and the sort are written at once", async () => {
  const { result } = await renderHook(() => useHomeFind([p("a", "A"), p("b", "B")], true));
  await act(async () => { result.current.togglePin("b"); });
  expect(stored()).toEqual({ version: 1, sort: "edited", pins: ["b"] });
  await act(async () => { result.current.setSort("length"); });
  expect(stored()).toEqual({ version: 1, sort: "length", pins: ["b"] });
  await act(async () => { result.current.togglePin("b"); });
  expect(stored().pins).toEqual([]);
  await act(async () => { result.current.togglePin("a"); result.current.unpin("a"); });
  expect(stored().pins).toEqual([]);
  expect(result.current.isPinned("a")).toBe(false);
});

test("the query filters; nothing matching is noMatch; spaces match everything; the row stays while anything is typed", async () => {
  const { result } = await renderHook(() => useHomeFind([p("a", "Beach"), p("b", "Hills")], true));
  expect(result.current.showFind).toBe(false);
  await act(async () => { result.current.setQuery("HIL"); });
  expect(result.current.rows.map((r) => r.key)).toEqual(["cards:b"]);
  expect(result.current.showFind).toBe(true);
  await act(async () => { result.current.setQuery("xyz"); });
  expect(result.current.rows).toEqual([]);
  expect(result.current.noMatch).toBe(true);
  await act(async () => { result.current.setQuery("  "); });
  expect(result.current.noMatch).toBe(false);
  expect(result.current.rows.map((r) => r.key)).toEqual(["cards:a,b"]);
  await act(async () => { result.current.clearQuery(); });
  expect(result.current.query).toBe("");
});

test("a value written by a newer Clipy stays as it is; this session's pins live in memory", async () => {
  const newer = JSON.stringify({ version: 2, sort: "name", pins: [] });
  localStorage.setItem(HOME_PREFS_KEY, newer);
  const { result } = await renderHook(() => useHomeFind([p("a", "A")], true));
  await act(async () => { result.current.togglePin("a"); });
  expect(result.current.isPinned("a")).toBe(true);
  expect(localStorage.getItem(HOME_PREFS_KEY)).toBe(newer);
});
