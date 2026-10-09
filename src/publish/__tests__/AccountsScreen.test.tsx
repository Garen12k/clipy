import { act, fireEvent, render, screen, within } from "@testing-library/react-native";
import { Alert } from "react-native";
jest.mock("expo-router", () => ({ router: { back: jest.fn(), push: jest.fn(), replace: jest.fn(), canGoBack: () => true }, Redirect: () => null, useFocusEffect: (cb: () => void) => { require("react").useEffect(() => { cb(); }, []); } }));
jest.mock("../useSession", () => ({ useSession: jest.fn() }));
jest.mock("../useAccounts", () => ({ useAccounts: jest.fn() }));
jest.mock("../supabase", () => ({ signInWithApple: jest.fn(), signOut: jest.fn() }));
// The engine is not linked under Jest (the build is "Expo Go"); one ability can be switched on to name a build.
jest.mock("@/modules/clipy-video", () => ({ ...jest.requireActual("@/modules/clipy-video"), isSteadyAvailable: jest.fn(() => false) }));
import { isSteadyAvailable } from "@/modules/clipy-video";
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
beforeEach(() => { jest.clearAllMocks(); useToast.getState().clear(); (isSteadyAvailable as jest.Mock).mockReturnValue(false); (useSession as jest.Mock).mockReturnValue({ status: "signedIn", email: "me@icloud.com" }); });

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

test("load error offers Try again; the Sign Out row signs out after confirmation", async () => {
  const h = hook({ status: "error", platforms: [], error: "Clipy's server is asleep or unreachable." });
  (useAccounts as jest.Mock).mockReturnValue(h);
  const alert = alertSpy().mockImplementation(() => {});
  await render(<AccountsScreen />);
  expect(screen.getByText("Clipy's server is asleep or unreachable.")).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: "Try Again" }));
  expect(h.refresh).toHaveBeenCalled();
  // The row shows the address; VoiceOver hears the whole sentence.
  expect(screen.getByText("me@icloud.com")).toBeTruthy();
  expect(screen.getByLabelText("Signed in as me@icloud.com")).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: "Sign Out" }));
  expect(alert).toHaveBeenCalledWith("Sign out of Clipy?", "Your connected accounts stay connected.", expect.any(Array));
  expect((alert.mock.calls[0][2] as { text: string; style?: string }[]).map((b) => [b.text, b.style])).toEqual([["Cancel", "cancel"], ["Sign Out", "destructive"]]);
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

describe("the layout: a small bar, your account on top, platforms in their own group, the build as a row", () => {
  test("the title is a small centred header in the bar; Back goes back", async () => {
    (useAccounts as jest.Mock).mockReturnValue(hook());
    await render(<AccountsScreen />);
    expect(screen.getByRole("header", { name: "Accounts" })).toHaveStyle({ fontSize: theme.type.headline, textAlign: "center" });
    await fireEvent.press(screen.getByRole("button", { name: "Back" }));
    expect(router.back).toHaveBeenCalledTimes(1);
  });

  test("signed in: 'Clipy account' holds the address and a red Sign Out row, above 'Platforms'", async () => {
    (useAccounts as jest.Mock).mockReturnValue(hook());
    await render(<AccountsScreen />);
    expect(screen.getByRole("header", { name: "Clipy account" })).toHaveStyle({ fontSize: theme.type.label, color: theme.screen.muted });
    expect(screen.getByRole("header", { name: "Platforms" })).toHaveStyle({ fontSize: theme.type.label, color: theme.screen.muted });
    const account = within(screen.getByTestId("clipy-account"));
    expect(account.getByText("me@icloud.com")).toBeTruthy();
    expect(account.getByText("Sign Out")).toHaveStyle({ color: theme.screen.dangerText });
    expect(account.getByRole("button", { name: "Sign Out" })).toHaveStyle({ minHeight: theme.size.row });
    expect(within(screen.getByTestId("platforms")).getByText("YouTube")).toBeTruthy();
    expect(screen.getByTestId("clipy-account")).toHaveStyle({ backgroundColor: theme.screen.bar, borderRadius: theme.radius.card });
    // The old line and button at the bottom are gone: one Sign Out, no sentence on screen.
    expect(screen.getAllByRole("button", { name: "Sign Out" })).toHaveLength(1);
    expect(screen.queryByText("Signed in as me@icloud.com")).toBeNull();
  });

  test("signed out, not set up or still loading: no 'Clipy account' group, no 'Platforms' group", async () => {
    for (const status of ["signedOut", "unconfigured", "loading"]) {
      (useSession as jest.Mock).mockReturnValue({ status });
      (useAccounts as jest.Mock).mockReturnValue(hook({ status: "idle", platforms: [] }));
      const view = await render(<AccountsScreen />);
      expect(screen.queryByText("Clipy account")).toBeNull();
      expect(screen.queryByText("Platforms")).toBeNull();
      expect(screen.queryByRole("button", { name: "Sign Out" })).toBeNull();
      await view.unmount();
    }
  });

  test("a row is 56 pt with a logo tile; Connect is a plain gold word with a 44-pt target", async () => {
    (useAccounts as jest.Mock).mockReturnValue(hook());
    await render(<AccountsScreen />);
    expect(screen.getByTestId("account-row-youtube")).toHaveStyle({ minHeight: theme.size.listRow });
    expect(screen.getByTestId("platform-tile-youtube")).toHaveStyle({ width: theme.size.chip, height: theme.size.chip, borderRadius: theme.radius.chip, backgroundColor: theme.screen.tile });
    const connect = screen.getByRole("button", { name: "Connect YouTube" });
    expect(connect).toHaveStyle({ height: theme.size.controlCompact });
    expect(connect).toHaveProp("hitSlop", { top: 4, bottom: 4 });
    expect(connect).not.toHaveStyle({ backgroundColor: theme.screen.lifted });
    expect(within(connect).getByText("Connect")).toHaveStyle({ color: theme.colors.accent });
  });

  test("no filled button: Reconnect is gold text, Disconnect red text; the account's picture sits on its tile", async () => {
    (useAccounts as jest.Mock).mockReturnValue(hook({ platforms: [
      p("youtube", { available: true, connected: true, name: "My Channel", needsReconnect: true }),
      p("tiktok", { available: true, connected: true, name: "@sunny", avatarUrl: "https://example.com/a.png" }),
      p("instagram", { available: true, avatarUrl: "https://example.com/stale.png" }),
    ] }));
    await render(<AccountsScreen />);
    expect(screen.queryAllByTestId("primary-button")).toHaveLength(0);
    const reconnect = screen.getByRole("button", { name: "Reconnect YouTube" });
    expect(reconnect).not.toHaveStyle({ backgroundColor: theme.screen.lifted });
    expect(within(reconnect).getByText("Reconnect")).toHaveStyle({ color: theme.colors.accent });
    const disconnect = screen.getByRole("button", { name: "Disconnect TikTok" });
    expect(disconnect).toHaveStyle({ height: theme.size.controlCompact });
    expect(disconnect).not.toHaveStyle({ backgroundColor: theme.screen.lifted });
    expect(within(disconnect).getByText("Disconnect")).toHaveStyle({ color: theme.screen.dangerText });
    expect(screen.getByText("Sign-in expired")).toHaveStyle({ fontSize: theme.type.label, color: theme.screen.dangerText });
    expect(screen.getByText("My Channel")).toBeTruthy(); // the name stays above the state
    expect(within(screen.getByTestId("platform-tile-tiktok")).getByTestId("platform-picture-tiktok")).toHaveProp("source", { uri: "https://example.com/a.png" });
    expect(screen.queryByTestId("platform-picture-youtube")).toBeNull();   // connected, no picture
    expect(screen.queryByTestId("platform-picture-instagram")).toBeNull(); // a picture, not connected
  });
});

test("the Build row names the installed build in every state of the screen", async () => {
  const states: [string, object, object][] = [
    ["signed in", { status: "signedIn", email: "me@icloud.com" }, hook()],
    ["platforms loading", { status: "signedIn", email: "me@icloud.com" }, hook({ status: "loading", platforms: [] })],
    ["platforms failed", { status: "signedIn", email: "me@icloud.com" }, hook({ status: "error", platforms: [], error: "No." })],
    ["signed out", { status: "signedOut" }, hook({ status: "idle", platforms: [] })],
    ["not set up", { status: "unconfigured" }, hook({ status: "idle", platforms: [] })],
    ["loading", { status: "loading" }, hook({ status: "idle", platforms: [] })],
  ];
  for (const [, session, accounts] of states) {
    (useSession as jest.Mock).mockReturnValue(session);
    (useAccounts as jest.Mock).mockReturnValue(accounts);
    (isSteadyAvailable as jest.Mock).mockReturnValue(false);
    const a = await render(<AccountsScreen />);
    expect(within(screen.getByTestId("build-row")).getByText("Build")).toBeTruthy();
    expect(screen.getByTestId("build-label")).toHaveTextContent("Expo Go (no video engine)", { exact: true });
    expect(screen.getByTestId("build-label")).toHaveStyle({ color: theme.screen.muted });
    expect(screen.getByLabelText("Expo Go (no video engine)")).toBeTruthy();
    await a.unmount();
    (isSteadyAvailable as jest.Mock).mockReturnValue(true);
    const b = await render(<AccountsScreen />);
    // The value is the build's name alone; the whole line of buildLabel() is what VoiceOver reads.
    expect(screen.getByTestId("build-label")).toHaveTextContent("stabilize and smooth", { exact: true });
    expect(screen.getByLabelText("App build: stabilize and smooth")).toBeTruthy();
    await b.unmount();
  }
});
