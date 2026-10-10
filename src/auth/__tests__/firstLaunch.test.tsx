import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

jest.mock("expo-router", () => ({ router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true) }, useFocusEffect: (cb: () => void) => { const React = require("react"); React.useEffect(cb, []); } }));
jest.mock("@/src/projects/pickMedia", () => ({ pickMedia: jest.fn() }));
jest.mock("@/src/publish/pickVideo", () => ({ pickVideoForPost: jest.fn() }));
jest.mock("@/src/projects", () => ({ storage: { listProjects: jest.fn(async () => []), createProject: jest.fn(), renameProject: jest.fn(), duplicateProject: jest.fn(), deleteProject: jest.fn() } }));
jest.mock("@/src/publish/useSession", () => ({ useSession: jest.fn() }));
// The wizard's third page reads the phone's permissions (WizardPermissions.test.tsx): here the app simply has no notifications.
jest.mock("@/src/lib/notify", () => ({ notifyAvailable: () => false, notifyState: jest.fn(), askToNotify: jest.fn() }));
jest.mock("@/src/publish/supabase", () => ({
  isBackendConfigured: jest.fn(() => false), signInWithApple: jest.fn(), signInWithGoogle: jest.fn(), sendEmailCode: jest.fn(), verifyEmailCode: jest.fn(async () => {}),
  SIGN_IN_NOT_SET_UP: "Sign-in isn't set up yet.",
}));
import { router } from "expo-router";
import Home from "@/app/index";
import Tour from "@/app/tour";
import Welcome from "@/app/welcome";
import { storage } from "@/src/projects";
import { isBackendConfigured } from "@/src/publish/supabase";
import { useSession } from "@/src/publish/useSession";
import { hasSeenWelcome, markWelcomeSeen, WELCOME_SEEN_KEY } from "../welcomeSeen";

const TAGLINE = "Edit, caption and post your clips.";
/** The first-launch wizard's first page, and the way to its last one (the sign-in choices). */
const WIZARD_TITLE = "Make clips worth sharing";
const toSignIn = () => fireEvent.press(screen.getByRole("button", { name: "Skip to sign in" }));
const store = (globalThis as unknown as { localStorage: { removeItem: (k: string) => void } }).localStorage;
beforeEach(() => {
  jest.clearAllMocks(); store.removeItem(WELCOME_SEEN_KEY);
  (isBackendConfigured as jest.Mock).mockReturnValue(false);
  (useSession as jest.Mock).mockReturnValue({ status: "unconfigured" });
  (router.canGoBack as jest.Mock).mockReturnValue(true);
});

describe("the home route", () => {
  test("first launch (no flag): the welcome wizard, and the projects are neither drawn nor loaded", async () => {
    await render(<Home />);
    expect(screen.getByRole("header", { name: WIZARD_TITLE })).toBeTruthy();
    expect(screen.getByTestId("wizard-dots").props.accessibilityLabel).toBe("Page 1 of 4");
    expect(screen.queryByText(TAGLINE, { includeHiddenElements: true })).toBeNull();   // the standalone sign-in page is not what is drawn
    await toSignIn();
    expect(screen.getByRole("button", { name: "Continue Without an Account" })).toBeTruthy();
    expect(screen.queryByText("Projects")).toBeNull();
    expect(storage.listProjects).not.toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled(); expect(router.push).not.toHaveBeenCalled();
  });

  test("with the flag: the projects, at once", async () => {
    markWelcomeSeen();
    await render(<Home />);
    expect(screen.getByText("Projects")).toBeTruthy();
    expect(screen.queryByText(WIZARD_TITLE, { includeHiddenElements: true })).toBeNull();
    expect(screen.queryByTestId("wizard-pager")).toBeNull();
    expect(await screen.findByText("No clips yet")).toBeTruthy();
  });

  test("'Continue without an account' sets the flag and lands on the projects — and the next launch opens on them", async () => {
    const first = await render(<Home />);
    await toSignIn();
    await fireEvent.press(screen.getByRole("button", { name: "Continue Without an Account" }));
    expect(hasSeenWelcome()).toBe(true);
    expect(await screen.findByText("Projects")).toBeTruthy();
    expect(screen.queryByTestId("wizard-pager")).toBeNull();
    // The swap mounts the real projects screen: the projects are loaded now, and the (empty) list is shown.
    expect(storage.listProjects).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("No clips yet")).toBeTruthy();
    await first.unmount();
    await render(<Home />);
    expect(screen.getByText("Projects")).toBeTruthy();
  });

  test("the swap with projects on the phone: they are loaded then, and listed", async () => {
    (storage.listProjects as jest.Mock).mockResolvedValueOnce([{ id: "p1", name: "Beach day", durationSec: 12, updatedAt: "2026-10-01T10:00:00.000Z", thumbUri: null, broken: false, postedTo: [], coverTitle: "" }]);
    await render(<Home />);
    expect(storage.listProjects).not.toHaveBeenCalled();
    await toSignIn();
    await fireEvent.press(screen.getByRole("button", { name: "Continue Without an Account" }));
    expect(await screen.findByText("Beach day")).toBeTruthy();
    expect(storage.listProjects).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("No clips yet")).toBeNull();
  });

  test("signed in but no flag (a reinstall that kept its session): never the welcome wizard — the projects, and the flag is set", async () => {
    (isBackendConfigured as jest.Mock).mockReturnValue(true);
    (useSession as jest.Mock).mockReturnValue({ status: "loading" });
    const v = await render(<Home />);
    expect(screen.queryByTestId("wizard-pager")).toBeNull(); expect(screen.queryByText("Projects")).toBeNull();
    (useSession as jest.Mock).mockReturnValue({ status: "signedIn", email: null });
    await v.rerender(<Home />);
    expect(await screen.findByText("Projects")).toBeTruthy();
    expect(screen.queryByTestId("wizard-pager")).toBeNull();
    expect(hasSeenWelcome()).toBe(true);
  });

  test("signed out and no flag, with a backend: the welcome wizard once the session is read; a code signs in and lands on the projects", async () => {
    (isBackendConfigured as jest.Mock).mockReturnValue(true);
    (useSession as jest.Mock).mockReturnValue({ status: "signedOut" });
    await render(<Home />);
    await toSignIn();
    await fireEvent.press(screen.getByRole("button", { name: "Continue with Email" }));
    await fireEvent.changeText(screen.getByLabelText("Email"), "me@icloud.com");
    await fireEvent.press(screen.getByRole("button", { name: "Send Code" }));
    await fireEvent.changeText(await screen.findByLabelText("6-digit code"), "123456");
    expect(await screen.findByText("Projects")).toBeTruthy();
    expect(hasSeenWelcome()).toBe(true);
    expect(router.replace).not.toHaveBeenCalled();
  });
});

describe("the /welcome route (opened from Accounts or Post)", () => {
  test("has a close button and 'Not now'; leaving goes back to where it was opened from, once, with the flag set", async () => {
    await render(<Welcome />);
    expect(screen.getByText(TAGLINE)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Close" })).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Not Now" }));
    await fireEvent.press(screen.getByRole("button", { name: "Not Now" }));
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
    await fireEvent.press(screen.getByRole("button", { name: "Continue with Email" }));
    await fireEvent.changeText(screen.getByLabelText("Email"), "me@icloud.com");
    await fireEvent.press(screen.getByRole("button", { name: "Send Code" }));
    await fireEvent.changeText(await screen.findByLabelText("6-digit code"), "123456");
    await waitFor(() => expect(router.back).toHaveBeenCalledTimes(1));
  });
});

describe("the /tour route (Show welcome again, on Accounts)", () => {
  test("the wizard from page 1 with a close button — for someone who has seen it and is signed in; closing goes back once, the flag as it was", async () => {
    markWelcomeSeen();
    (isBackendConfigured as jest.Mock).mockReturnValue(true);
    (useSession as jest.Mock).mockReturnValue({ status: "signedIn", email: "me@icloud.com" });
    await render(<Tour />);
    expect(screen.getByRole("header", { name: WIZARD_TITLE })).toBeTruthy();
    expect(screen.getByTestId("wizard-dots").props.accessibilityLabel).toBe("Page 1 of 4");
    expect(router.back).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole("button", { name: "Close" }));
    await fireEvent.press(screen.getByRole("button", { name: "Close" }));
    expect(router.back).toHaveBeenCalledTimes(1);
    expect(router.replace).not.toHaveBeenCalled();
    expect(hasSeenWelcome()).toBe(true);
  });

  test("finishing ('Continue Without an Account') goes back too; the flag is not set by a replay", async () => {
    await render(<Tour />);
    await toSignIn();
    await fireEvent.press(screen.getByRole("button", { name: "Continue Without an Account" }));
    expect(router.back).toHaveBeenCalledTimes(1);
    expect(hasSeenWelcome()).toBe(false);
  });

  test("opened by a link with nothing behind it: leaving goes home", async () => {
    (router.canGoBack as jest.Mock).mockReturnValue(false);
    await render(<Tour />);
    await fireEvent.press(screen.getByRole("button", { name: "Close" }));
    expect(router.replace).toHaveBeenCalledWith("/");
  });
});
