import { renderHook } from "@testing-library/react-native";
const mockNative: { there: boolean } = { there: true };
jest.mock("expo-modules-core", () => ({ ...jest.requireActual("expo-modules-core"), requireOptionalNativeModule: jest.fn((name: string) => (name === "ExpoKeepAwake" && mockNative.there ? {} : null)) }));
jest.mock("expo-keep-awake", () => ({ activateKeepAwakeAsync: jest.fn(async () => {}), deactivateKeepAwake: jest.fn(async () => {}) }));
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import { AWAKE_TAG, stayAwake, useStayAwake } from "../exportAwake";

const on = activateKeepAwakeAsync as jest.Mock;
const off = deactivateKeepAwake as jest.Mock;
beforeEach(() => { stayAwake(false); jest.clearAllMocks(); });

test("the screen is held under the export's own tag, once, and let go once", () => {
  stayAwake(true); stayAwake(true);
  expect(on).toHaveBeenCalledTimes(1);
  expect(on).toHaveBeenCalledWith(AWAKE_TAG);
  expect(AWAKE_TAG).toBe("clipy-export");
  stayAwake(false); stayAwake(false);
  expect(off).toHaveBeenCalledTimes(1);
  expect(off).toHaveBeenCalledWith(AWAKE_TAG);
});

test("the hook: on while exporting, off on EVERY way out — done, error, cancel (idle) and the screen going away", async () => {
  for (const end of ["done", "error", "idle"] as const) {
    jest.clearAllMocks();
    const h = await renderHook(({ status }: { status: string }) => useStayAwake(status === "exporting"), { initialProps: { status: "idle" } });
    expect(on).not.toHaveBeenCalled();
    await h.rerender({ status: "exporting" });
    expect(on).toHaveBeenCalledTimes(1);
    expect(off).not.toHaveBeenCalled();
    await h.rerender({ status: end });
    expect(off).toHaveBeenCalledTimes(1);
    await h.unmount();
    expect(off).toHaveBeenCalledTimes(1);          // already let go: not said twice
  }
  jest.clearAllMocks();
  const h = await renderHook(() => useStayAwake(true));
  expect(on).toHaveBeenCalledTimes(1);
  await h.unmount();                                // the screen is left in the middle of an export
  expect(off).toHaveBeenCalledTimes(1);
});

test("a module that refuses does not break the export: nothing is thrown", async () => {
  on.mockRejectedValueOnce(new Error("no"));
  expect(() => stayAwake(true)).not.toThrow();
  off.mockImplementationOnce(() => { throw new Error("gone"); });
  expect(() => stayAwake(false)).not.toThrow();
  await Promise.resolve();
});
