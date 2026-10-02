import { act, renderHook, waitFor } from "@testing-library/react-native";
import * as WebBrowser from "expo-web-browser";
jest.mock("expo-linking", () => ({ createURL: (p: string) => `exp://192.168.1.142:8090/--/${p}`, parse: (u: string) => ({ queryParams: Object.fromEntries(new URL(u.replace(/^exp:/, "http:")).searchParams) }) }));
jest.mock("../api", () => ({ ...jest.requireActual("../api"), api: { accounts: jest.fn(), oauthStart: jest.fn(), disconnect: jest.fn() } }));
import { api, ApiFailure } from "../api";
import { useAccounts } from "../useAccounts";
import { useToast } from "@/src/ui/Toast";

const yt = (over = {}) => ({ id: "youtube", available: true, connected: false, name: null, avatarUrl: null, needsReconnect: false, ...over });
beforeEach(() => { jest.clearAllMocks(); useToast.getState().clear(); (api.accounts as jest.Mock).mockResolvedValue([yt()]); });

test("loads when enabled; stays idle when not", async () => {
  const off = await renderHook(() => useAccounts(false));
  expect(off.result.current.status).toBe("idle");
  expect(api.accounts).not.toHaveBeenCalled();
  const on = await renderHook(() => useAccounts(true));
  await waitFor(() => expect(on.result.current.status).toBe("ready"));
  expect(on.result.current.platforms).toHaveLength(1);
});

test("a load failure is kept as an error message", async () => {
  (api.accounts as jest.Mock).mockRejectedValue(new ApiFailure("unreachable", "Clipy's server is asleep or unreachable."));
  const h = await renderHook(() => useAccounts(true));
  await waitFor(() => expect(h.result.current.status).toBe("error"));
  expect(h.result.current.error).toBe("Clipy's server is asleep or unreachable.");
});

test("connect opens the platform login with the app's return address and refreshes on success", async () => {
  (api.oauthStart as jest.Mock).mockResolvedValue("https://accounts.google.com/o/oauth2/v2/auth?state=s");
  (WebBrowser.openAuthSessionAsync as jest.Mock).mockResolvedValue({ type: "success", url: "exp://192.168.1.142:8090/--/oauth?status=ok&platform=youtube" });
  const h = await renderHook(() => useAccounts(true));
  await waitFor(() => expect(h.result.current.status).toBe("ready"));
  (api.accounts as jest.Mock).mockResolvedValue([yt({ connected: true, name: "My Channel" })]);
  await act(() => h.result.current.connect("youtube"));
  expect(api.oauthStart).toHaveBeenCalledWith("youtube", "exp://192.168.1.142:8090/--/oauth");
  expect(WebBrowser.openAuthSessionAsync).toHaveBeenCalledWith("https://accounts.google.com/o/oauth2/v2/auth?state=s", "exp://192.168.1.142:8090/--/oauth");
  expect(h.result.current.platforms[0]).toMatchObject({ connected: true, name: "My Channel" });
  expect(h.result.current.busy).toBeNull();
});

test("an error from the platform is shown; closing the sheet is silent", async () => {
  (api.oauthStart as jest.Mock).mockResolvedValue("https://x");
  (WebBrowser.openAuthSessionAsync as jest.Mock).mockResolvedValueOnce({ type: "success", url: "exp://h/--/oauth?status=error&platform=youtube&message=Bad%20Request" });
  const h = await renderHook(() => useAccounts(true));
  await waitFor(() => expect(h.result.current.status).toBe("ready"));
  await act(() => h.result.current.connect("youtube"));
  expect(useToast.getState().message).toBe("Bad Request");
  useToast.getState().clear();
  (WebBrowser.openAuthSessionAsync as jest.Mock).mockResolvedValueOnce({ type: "cancel" });
  await act(() => h.result.current.connect("youtube"));
  expect(useToast.getState().message).toBeNull();
});

test("a thrown browser error clears busy and shows the message", async () => {
  (api.oauthStart as jest.Mock).mockResolvedValue("https://x");
  (WebBrowser.openAuthSessionAsync as jest.Mock).mockRejectedValueOnce(new Error("Browser unavailable"));
  const h = await renderHook(() => useAccounts(true));
  await waitFor(() => expect(h.result.current.status).toBe("ready"));
  await act(() => h.result.current.connect("youtube"));
  expect(h.result.current.busy).toBeNull();
  expect(useToast.getState().message).toBe("Browser unavailable");
});

test("a cancelled status in the return url is silent", async () => {
  (api.oauthStart as jest.Mock).mockResolvedValue("https://x");
  (WebBrowser.openAuthSessionAsync as jest.Mock).mockResolvedValueOnce({ type: "success", url: "exp://h/--/oauth?status=cancelled&platform=youtube" });
  const h = await renderHook(() => useAccounts(true));
  await waitFor(() => expect(h.result.current.status).toBe("ready"));
  await act(() => h.result.current.connect("youtube"));
  expect(useToast.getState().message).toBeNull();
});

test("results arriving after unmount are ignored", async () => {
  let resolve!: (v: unknown) => void;
  (api.accounts as jest.Mock).mockReturnValue(new Promise((r) => { resolve = r; }));
  const err = jest.spyOn(console, "error").mockImplementation(() => {});
  const h = await renderHook(() => useAccounts(true));
  await h.unmount();
  await act(async () => { resolve([yt()]); });
  expect(err).not.toHaveBeenCalled();
  err.mockRestore();
});

test("last refresh wins over a slower earlier one", async () => {
  const h = await renderHook(() => useAccounts(true));
  await waitFor(() => expect(h.result.current.status).toBe("ready"));
  let slow!: (v: unknown) => void;
  (api.accounts as jest.Mock).mockReturnValueOnce(new Promise((r) => { slow = r; })).mockResolvedValueOnce([yt({ name: "New" })]);
  await act(async () => {
    const first = h.result.current.refresh();
    await h.result.current.refresh();
    slow([yt({ name: "Old" })]);
    await first;
  });
  expect(h.result.current.platforms[0].name).toBe("New");
});

test("platforms are cleared when disabled", async () => {
  const h = await renderHook(({ on }: { on: boolean }) => useAccounts(on), { initialProps: { on: true } });
  await waitFor(() => expect(h.result.current.platforms).toHaveLength(1));
  await h.rerender({ on: false });
  expect(h.result.current.platforms).toEqual([]);
  expect(h.result.current.status).toBe("idle");
});

test("a disconnect error is shown and busy is cleared", async () => {
  (api.disconnect as jest.Mock).mockRejectedValueOnce(new Error("Nope"));
  const h = await renderHook(() => useAccounts(true));
  await waitFor(() => expect(h.result.current.status).toBe("ready"));
  await act(() => h.result.current.disconnect("youtube"));
  expect(useToast.getState().message).toBe("Nope");
  expect(h.result.current.busy).toBeNull();
});

test("connect / disconnect are ignored while another one is in flight", async () => {
  let finish!: (v: unknown) => void;
  (api.oauthStart as jest.Mock).mockResolvedValue("https://x");
  (WebBrowser.openAuthSessionAsync as jest.Mock).mockReturnValueOnce(new Promise((r) => { finish = r; }));
  const h = await renderHook(() => useAccounts(true));
  await waitFor(() => expect(h.result.current.status).toBe("ready"));
  let first!: Promise<void>;
  await act(async () => { first = h.result.current.connect("youtube"); });
  expect(h.result.current.busy).toBe("youtube");
  await act(async () => { await h.result.current.connect("youtube"); await h.result.current.disconnect("youtube"); });
  expect(api.oauthStart).toHaveBeenCalledTimes(1);
  expect(api.disconnect).not.toHaveBeenCalled();
  await act(async () => { finish({ type: "cancel" }); await first; });
  expect(h.result.current.busy).toBeNull();
  await act(() => h.result.current.disconnect("youtube"));
  expect(api.disconnect).toHaveBeenCalledWith("youtube");
});

test("disconnect calls the server and refreshes", async () => {
  const h = await renderHook(() => useAccounts(true));
  await waitFor(() => expect(h.result.current.status).toBe("ready"));
  await act(() => h.result.current.disconnect("youtube"));
  expect(api.disconnect).toHaveBeenCalledWith("youtube");
  expect(api.accounts).toHaveBeenCalledTimes(2);
});
