import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

jest.mock("expo-router", () => ({ router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true) }, useFocusEffect: (cb: () => void) => { const React = require("react"); React.useEffect(cb, []); } }));
jest.mock("@/src/projects/pickMedia", () => ({ pickMedia: jest.fn() }));
jest.mock("@/src/publish/pickVideo", () => ({ pickVideoForPost: jest.fn() }));
jest.mock("@/src/projects", () => ({ storage: { listProjects: jest.fn(async () => []), createProject: jest.fn(), renameProject: jest.fn(), duplicateProject: jest.fn(), deleteProject: jest.fn() } }));
jest.mock("@/src/publish/useSession", () => ({ useSession: jest.fn() }));
jest.mock("@/src/publish/supabase", () => ({
  isBackendConfigured: jest.fn(() => false), signInWithApple: jest.fn(), signInWithGoogle: jest.fn(), sendEmailCode: jest.fn(), verifyEmailCode: jest.fn(async () => {}),
  SIGN_IN_NOT_SET_UP: "Sign-in isn't set up yet.",
}));
import { router } from "expo-router";
import Home from "@/app/index";
import Welcome from "@/app/welcome";
import { storage } from "@/src/projects";
import { isBackendConfigured } from "@/src/publish/supabase";
import { useSession } from "@/src/publish/useSession";
import { hasSeenWelcome, markWelcomeSeen, WELCOME_SEEN_KEY } from "../welcomeSeen";

const TAGLINE = "Edit, caption and post your clips.";
const store = (globalThis as unknown as { localStorage: { removeItem: (k: string) => void } }).localStorage;
beforeEach(() => {
  jest.clearAllMocks(); store.removeItem(WELCOME_SEEN_KEY);
  (isBackendConfigured as jest.Mock).mockReturnValue(false);
  (useSession as jest.Mock).mockReturnValue({ status: "unconfigured" });
  (router.canGoBack as jest.Mock).mockReturnValue(true);
});

describe("the home route", () => {
  test("first launch (no flag): the welcome screen, and the projects are neither drawn nor loaded", async () => {
    await render(<Home />);
    expect(screen.getByText(TAGLINE)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Continue without an account" })).toBeTruthy();
    expect(screen.queryByText("Your voyages")).toBeNull();
    expect(storage.listProjects).not.toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled(); expect(router.push).not.toHaveBeenCalled();
  });

  test("with the flag: the projects, at once", async () => {
    markWelcomeSeen();
    await render(<Home />);
    expect(screen.getByText("Your voyages")).toBeTruthy();
    expect(screen.queryByText(TAGLINE)).toBeNull();
    expect(await screen.findByText("No clips yet")).toBeTruthy();
  });

  test("'Continue without an account' sets the flag and lands on the projects — and the next launch opens on them", async () => {
    const first = await render(<Home />);
    await fireEvent.press(screen.getByRole("button", { name: "Continue without an account" }));
    expect(hasSeenWelcome()).toBe(true);
    expect(await screen.findByText("Your voyages")).toBeTruthy();
    expect(screen.queryByText(TAGLINE)).toBeNull();
    await first.unmount();
    await render(<Home />);
    expect(screen.getByText("Your voyages")).toBeTruthy();
  });

  test("signed in but no flag (a reinstall that kept its session): never the welcome screen — the projects, and the flag is set", async () => {
    (isBackendConfigured as jest.Mock).mockReturnValue(true);
    (useSession as jest.Mock).mockReturnValue({ status: "loading" });
    const v = await render(<Home />);
    expect(screen.queryByText(TAGLINE)).toBeNull(); expect(screen.queryByText("Your voyages")).toBeNull();
    (useSession as jest.Mock).mockReturnValue({ status: "signedIn", email: null });
    await v.rerender(<Home />);
    expect(await screen.findByText("Your voyages")).toBeTruthy();
    expect(screen.queryByText(TAGLINE)).toBeNull();
    expect(hasSeenWelcome()).toBe(true);
  });

  test("signed out and no flag, with a backend: the welcome screen once the session is read; a code signs in and lands on the projects", async () => {
    (isBackendConfigured as jest.Mock).mockReturnValue(true);
    (useSession as jest.Mock).mockReturnValue({ status: "signedOut" });
    await render(<Home />);
    await fireEvent.press(screen.getByRole("button", { name: "Continue with email" }));
    await fireEvent.changeText(screen.getByLabelText("Email"), "me@icloud.com");
    await fireEvent.press(screen.getByRole("button", { name: "Send code" }));
    await fireEvent.changeText(await screen.findByLabelText("6-digit code"), "123456");
    expect(await screen.findByText("Your voyages")).toBeTruthy();
    expect(hasSeenWelcome()).toBe(true);
    expect(router.replace).not.toHaveBeenCalled();
  });
});

describe("the /welcome route (opened from Accounts or Post)", () => {
  test("has a close button and 'Not now'; leaving goes back to where it was opened from, once, with the flag set", async () => {
    await render(<Welcome />);
    expect(screen.getByText(TAGLINE)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Close" })).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Not now" }));
    await fireEvent.press(screen.getByRole("button", { name: "Not now" }));
    expect(router.back).toHaveBeenCalledTimes(1);
    expect(router.replace).not.toHaveBeenCalled();
    expect(hasSeenWelcome()).toBe(true);
  });

  test("opened by a link with nothing behind it: leaving goes home", async () => {
    (router.canGoBack as jest.Mock).mockReturnValue(false);
    await render(<Welcome />);
    await fireEvent.press(screen.getByRole("button", { name: "Close" }));
    expect(router.replace).toHaveBeenCalledWith("/");
    expect(router.back).not.toHaveBeenCalled();
  });

  test("signing in goes back once", async () => {
    (isBackendConfigured as jest.Mock).mockReturnValue(true);
    (useSession as jest.Mock).mockReturnValue({ status: "signedOut" });
    await render(<Welcome />);
    await fireEvent.press(screen.getByRole("button", { name: "Continue with email" }));
    await fireEvent.changeText(screen.getByLabelText("Email"), "me@icloud.com");
    await fireEvent.press(screen.getByRole("button", { name: "Send code" }));
    await fireEvent.changeText(await screen.findByLabelText("6-digit code"), "123456");
    await waitFor(() => expect(router.back).toHaveBeenCalledTimes(1));
  });
});
