import { act, renderHook } from "@testing-library/react-native";
import { ApiFailure, type CreatorInfo } from "../api";
import { useCreatorInfo } from "../useCreatorInfo";

const INFO: CreatorInfo = { nickname: "Sunny", username: "sunny", avatarUrl: null, privacyOptions: ["SELF_ONLY"], commentDisabled: false, duetDisabled: true, stitchDisabled: true, maxDurationSec: 300 };
function deferred<T>() { let resolve!: (v: T) => void, reject!: (e: unknown) => void; const promise = new Promise<T>((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }

test("idle until asked; loading, then ready", async () => {
  const d = deferred<CreatorInfo>();
  const ask = jest.fn(() => d.promise);
  const h = await renderHook(() => useCreatorInfo("tiktok", ask));
  expect(h.result.current.state).toEqual({ status: "idle" });
  expect(ask).not.toHaveBeenCalled();
  await act(async () => { h.result.current.load(); });
  expect(h.result.current.state).toEqual({ status: "loading" });
  expect(ask).toHaveBeenCalledWith("tiktok");
  await act(async () => { d.resolve(INFO); });
  expect(h.result.current.state).toEqual({ status: "ready", info: INFO });
});

test("a missing permission is its own state; any other failure keeps the server's sentence", async () => {
  const ask = jest.fn().mockRejectedValueOnce(new ApiFailure("needs_permission", "Reconnect TikTok to allow posting directly, or choose Send as draft in the TikTok options."))
    .mockRejectedValueOnce(new ApiFailure("platform_unavailable", "TikTok is busy — wait a minute, then try again.")).mockRejectedValueOnce("odd");
  const h = await renderHook(() => useCreatorInfo("tiktok", ask));
  await act(async () => { h.result.current.load(); });
  expect(h.result.current.state).toEqual({ status: "needsPermission" });
  await act(async () => { h.result.current.load(); });
  expect(h.result.current.state).toEqual({ status: "error", message: "TikTok is busy — wait a minute, then try again." });
  await act(async () => { h.result.current.load(); });
  expect(h.result.current.state).toEqual({ status: "error", message: "Something went wrong." });
});

test("the newest request wins, and nothing is set after unmount", async () => {
  const first = deferred<CreatorInfo>(), second = deferred<CreatorInfo>();
  const ask = jest.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
  const h = await renderHook(() => useCreatorInfo("tiktok", ask));
  await act(async () => { h.result.current.load(); });
  await act(async () => { h.result.current.load(); });
  await act(async () => { second.resolve({ ...INFO, nickname: "Second" }); });
  await act(async () => { first.resolve(INFO); });
  expect(h.result.current.state).toEqual({ status: "ready", info: { ...INFO, nickname: "Second" } });
  const late = deferred<CreatorInfo>();
  ask.mockReturnValueOnce(late.promise);
  await act(async () => { h.result.current.load(); });
  await h.unmount();
  await act(async () => { late.resolve(INFO); }); // must not warn or throw
});
