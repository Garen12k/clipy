import { act, renderHook } from "@testing-library/react-native";
import { theme } from "@/src/theme/theme";
import { useAppReady } from "../useAppReady";

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

test("waits for the minimum loading time even when fonts are ready", async () => {
  const { result } = await renderHook(() => useAppReady(true));
  expect(result.current.ready).toBe(false);
  await act(() => { jest.advanceTimersByTime(theme.motion.minLoading - 1); });
  expect(result.current.ready).toBe(false);
  await act(() => { jest.advanceTimersByTime(1); });
  expect(result.current.ready).toBe(true);
});

test("gives up on fonts after the timeout", async () => {
  const { result } = await renderHook(() => useAppReady(false));
  await act(() => { jest.advanceTimersByTime(theme.motion.fontTimeout - 1); });
  expect(result.current.ready).toBe(false);
  await act(() => { jest.advanceTimersByTime(1); });
  expect(result.current.ready).toBe(true);
});
