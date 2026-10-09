import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { Alert } from "react-native";
jest.mock("expo-router", () => ({ router: { back: jest.fn(), push: jest.fn() }, Redirect: () => null, useFocusEffect: (cb: () => void) => { require("react").useEffect(() => { cb(); }, []); } }));
jest.mock("../useSession", () => ({ useSession: jest.fn() }));
jest.mock("../useAccounts", () => ({ useAccounts: jest.fn() }));
jest.mock("../supabase", () => ({ signInWithApple: jest.fn(), signOut: jest.fn() }));
import { router } from "expo-router";
import AccountsScreen from "@/app/accounts";
import { useToast } from "@/src/ui/Toast";
import { signOut } from "../supabase";
import { useAccounts } from "../useAccounts";
import { theme } from "@/src/theme/theme";
import { useSession } from "../useSession";

const p = (id: string, over = {}) => ({ id, available: false, connected: false, name: null, avatarUrl: null, needsReconnect: false, ...over });
const hook = (over = {}) => ({ status: "ready", platforms: [p("youtube", { available: true }), p("tiktok"), p("instagram"), p("facebook"), p("x")], error: null, busy: null, refresh: jest.fn(), connect: jest.fn(), disconnect: jest.fn(), ...over });
const alertSpy = () => jest.spyOn(Alert, "alert");
afterEach(() => { if (jest.isMockFunction(Alert.alert)) (Alert.alert as jest.Mock).mockRestore(); });
beforeEach(() => { jest.clearAllMocks(); useToast.getState().clear();(useSession as jest.Mock).mockReturnValue({ status: "signedIn", email: "me@icloud.com" }); });

test("signed out: sign-in card only, accounts not requested", async () => {
  (useSession as jest.Mock).mockReturnValue({ status: "signedOut" });
  (useAccounts as jest.Mock).mockReturnValue(hook({ status: "idle", platforms: [] }));
  await render(<AccountsScreen />);
  expect(useAccounts).toHaveBeenCalledWith(false);
  expect(screen.queryByText("YouTube")).toBeNull();
  expect(screen.queryByRole("button", { name: "Sign Out" })).toBeNull();
  await fireEvent.press(screen.getByRole("button", { name: "Sign In" }));
  expect(router.push).toHaveBeenCalledWith("/welcome");
});

test("five rows: Connect for available, Not available yet for the rest", async () => {
  const h = hook(); (useAccounts as jest.Mock).mockReturnValue(h);
  await render(<AccountsScreen />);
  for (const label of ["YouTube", "TikTok", "Instagram", "Facebook", "X"]) expect(screen.getByText(label)).toBeTruthy();
  expect(screen.getAllByText("Not available yet")).toHaveLength(4);
  await fireEvent.press(screen.getByRole("button", { name: "Connect YouTube" }));
  expect(h.connect).toHaveBeenCalledWith("youtube");
});

test("connected row shows the name and disconnects after confirmation", async () => {
  const h = hook({ platforms: [p("youtube", { available: true, connected: true, name: "My Channel" })] });
  (useAccounts as jest.Mock).mockReturnValue(h);
  const alert = alertSpy().mockImplementation((_t, _m, buttons) => { buttons?.find((b) => b.style === "destructive")?.onPress?.(); });
  await render(<AccountsScreen />);
  expect(screen.getByText("My Channel")).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: "Disconnect YouTube" }));
  expect(alert).toHaveBeenCalledWith("Disconnect YouTube?", expect.any(String), expect.any(Array));
  expect(h.disconnect).toHaveBeenCalledWith("youtube");
});

test("expired sign-in offers Reconnect", async () => {
  const h = hook({ platforms: [p("youtube", { available: true, connected: true, name: "My Channel", needsReconnect: true })] });
  (useAccounts as jest.Mock).mockReturnValue(h);
  await render(<AccountsScreen />);
  expect(screen.getByText("Sign-in expired")).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: "Reconnect YouTube" }));
  expect(h.connect).toHaveBeenCalledWith("youtube");
});

test("busy row shows a spinner instead of its button", async () => {
  const h = hook({ busy: "youtube" });
  (useAccounts as jest.Mock).mockReturnValue(h);
  await render(<AccountsScreen />);
  expect(screen.queryByRole("button", { name: "Connect YouTube" })).toBeNull();
  expect(screen.getByLabelText("Working on YouTube")).toBeTruthy();
});

test("load error offers Try again; footer signs out after confirmation", async () => {
  const h = hook({ status: "error", platforms: [], error: "Clipy's server is asleep or unreachable." });
  (useAccounts as jest.Mock).mockReturnValue(h);
  const alert = alertSpy().mockImplementation(() => {});
  await render(<AccountsScreen />);
  expect(screen.getByText("Clipy's server is asleep or unreachable.")).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: "Try Again" }));
  expect(h.refresh).toHaveBeenCalled();
  expect(screen.getByText("Signed in as me@icloud.com")).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: "Sign Out" }));
  expect(alert).toHaveBeenCalledWith("Sign out of Clipy?", expect.any(String), expect.any(Array));
  expect(signOut).not.toHaveBeenCalled();
  const buttons = alert.mock.calls[0][2] as { text: string; style?: string; onPress?: () => void }[];
  await act(async () => { await buttons.find((b) => b.style === "destructive")!.onPress!(); });
  expect(signOut).toHaveBeenCalled();
  expect(useToast.getState().message).toBe("Signed out.");
});

test("signed in without an email (Apple can hide it): just 'Signed in'", async () => {
  (useSession as jest.Mock).mockReturnValue({ status: "signedIn", email: null });
  (useAccounts as jest.Mock).mockReturnValue(hook());
  await render(<AccountsScreen />);
  expect(screen.getByText("Signed in")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Sign Out" })).toBeTruthy();
});

test("a failed sign-out says so and does not claim to have signed out", async () => {
  (useAccounts as jest.Mock).mockReturnValue(hook());
  (signOut as jest.Mock).mockRejectedValueOnce(new Error("Couldn't reach Clipy. Check your connection."));
  const alert = alertSpy().mockImplementation(() => {});
  await render(<AccountsScreen />);
  await fireEvent.press(screen.getByRole("button", { name: "Sign Out" }));
  const buttons = alert.mock.calls[0][2] as { style?: string; onPress?: () => void }[];
  await act(async () => { await buttons.find((b) => b.style === "destructive")!.onPress!(); });
  expect(useToast.getState().message).toBe("Couldn't reach Clipy. Check your connection.");
});

describe("round 2 look (no behaviour)", () => {
  test("a row is 56 pt and Connect is a compact grey button", async () => {
    (useAccounts as jest.Mock).mockReturnValue(hook());
    await render(<AccountsScreen />);
    expect(screen.getByTestId("account-row-youtube")).toHaveStyle({ minHeight: theme.size.listRow });
    expect(screen.getByRole("button", { name: "Connect YouTube" })).toHaveStyle({ height: theme.size.controlCompact, backgroundColor: theme.elevation.lifted });
    expect(screen.getByRole("header", { name: "Accounts" })).toHaveStyle({ fontSize: theme.type.screen });
  });

  test("no gold button: Reconnect is grey, Disconnect and Sign out are text only", async () => {
    (useAccounts as jest.Mock).mockReturnValue(hook({ platforms: [
      p("youtube", { available: true, connected: true, name: "My Channel", needsReconnect: true }),
      p("tiktok", { available: true, connected: true, name: "@sunny" }),
    ] }));
    await render(<AccountsScreen />);
    expect(screen.queryAllByTestId("primary-button")).toHaveLength(0);
    expect(screen.getByRole("button", { name: "Reconnect YouTube" })).toHaveStyle({ height: theme.size.controlCompact, backgroundColor: theme.elevation.lifted });
    expect(screen.getByRole("button", { name: "Disconnect TikTok" })).toHaveStyle({ height: theme.size.controlCompact });
    expect(screen.getByRole("button", { name: "Disconnect TikTok" })).not.toHaveStyle({ backgroundColor: theme.elevation.lifted });
    expect(screen.getByRole("button", { name: "Sign Out" })).not.toHaveStyle({ backgroundColor: theme.elevation.lifted });
    expect(screen.getByText("Sign-in expired")).toHaveStyle({ fontSize: theme.type.label, color: theme.colors.dangerText });
  });
});

test("the installed build is named at the bottom, signed in or not", async () => {
  (useAccounts as jest.Mock).mockReturnValue(hook());
  await render(<AccountsScreen />);
  expect(screen.getByTestId("build-label")).toHaveTextContent(/^(App build: |Expo Go)/);
  (useSession as jest.Mock).mockReturnValue({ status: "signedOut" });
  (useAccounts as jest.Mock).mockReturnValue(hook({ status: "idle", platforms: [] }));
  await render(<AccountsScreen />);
  expect(screen.getAllByTestId("build-label").length).toBeGreaterThan(0);
});
