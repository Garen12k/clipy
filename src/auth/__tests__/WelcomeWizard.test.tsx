import { act, fireEvent, render, screen, within } from "@testing-library/react-native";
jest.mock("@/src/publish/useSession", () => ({ useSession: jest.fn() }));
jest.mock("@/src/publish/supabase", () => ({
  isBackendConfigured: jest.fn(), signInWithApple: jest.fn(), signInWithGoogle: jest.fn(), sendEmailCode: jest.fn(), verifyEmailCode: jest.fn(), signOut: jest.fn(),
  SIGN_IN_NOT_SET_UP: "Sign-in isn't set up yet.",
}));
jest.mock("@/src/ui/motion", () => {
  const m = jest.requireActual("@/src/ui/motion");
  return { ...m, wizardDrawTo: jest.fn(m.wizardDrawTo), wizardPopTo: jest.fn(m.wizardPopTo), wizardStepTo: jest.fn(m.wizardStepTo), wizardRowTo: jest.fn(m.wizardRowTo) };
});
import * as Apple from "expo-apple-authentication";
import { AccessibilityInfo, Dimensions } from "react-native";
import { isBackendConfigured, sendEmailCode, signInWithApple, signInWithGoogle, signOut, verifyEmailCode } from "@/src/publish/supabase";
import { useSession } from "@/src/publish/useSession";
import { theme } from "@/src/theme/theme";
import { wizardDrawTo, wizardPopTo, wizardStepTo } from "@/src/ui/motion";
import { leftovers, wear } from "@/src/ui/testing/appearance";
import { useToast } from "@/src/ui/Toast";
import { setReducedMotionForTests } from "@/src/ui/useReducedMotion";
import { hasSeenWelcome, markWelcomeSeen, WELCOME_SEEN_KEY } from "../welcomeSeen";
import { WelcomeWizard } from "../WelcomeWizard";
import { FEATURES } from "../WizardArt";
import { TOOL_META } from "@/src/editor/toolGroups";

/** Shapes drawn in the page's INK (the current dot, a figure's head, a caption line): on cream that ink is navy, which the audit would take for a navy surface. */
const INK_SHAPES = ["wizard-dot-current", "wizard-scene-cutout", "wizard-scene-captions"];

const NOT_SET_UP = "Sign-in isn't set up yet.";
const mocked = <T extends (...a: never[]) => unknown>(f: T) => f as unknown as jest.Mock;
const button = (name: string) => screen.getByRole("button", { name });
const noButton = (name: string) => expect(screen.queryByRole("button", { name })).toBeNull();
const store = (globalThis as unknown as { localStorage: { removeItem: (k: string) => void } }).localStorage;
const WIDTH = Dimensions.get("window").width;
/** Which page the dots say is the current one. */
const pageNow = () => screen.getByTestId("wizard-dots").props.accessibilityLabel as string;
/** The finger leaves the pager on page `n` (1-based). */
const swipeTo = (n: number) => fireEvent.scroll(screen.getByTestId("wizard-pager"), { nativeEvent: { contentOffset: { x: (n - 1) * WIDTH, y: 0 } } });

function configure(on: boolean) {
  mocked(isBackendConfigured).mockReturnValue(on);
  mocked(useSession).mockReturnValue({ status: on ? "signedOut" : "unconfigured" });
}
beforeEach(() => {
  jest.clearAllMocks(); useToast.getState().clear(); store.removeItem(WELCOME_SEEN_KEY); setReducedMotionForTests(false); wear("dark");
  jest.spyOn(AccessibilityInfo, "announceForAccessibility").mockImplementation(() => {});
  mocked(Apple.isAvailableAsync).mockResolvedValue(true);
  configure(true);
  mocked(sendEmailCode).mockResolvedValue(undefined); mocked(verifyEmailCode).mockResolvedValue(undefined);
  mocked(signInWithApple).mockResolvedValue("cancelled"); mocked(signInWithGoogle).mockResolvedValue("cancelled");
});
afterAll(() => { setReducedMotionForTests(false); wear("dark"); });

describe("the four pages", () => {
  test("page 1: the mark, the title as a header, the line, 'Get Started' — and Skip", async () => {
    await render(<WelcomeWizard onDone={jest.fn()} />);
    expect(pageNow()).toBe("Page 1 of 4");
    expect(screen.getByRole("header", { name: "Make clips worth sharing" })).toBeTruthy();
    expect(screen.getByText("Cut, style and post your videos, all on your iPhone.")).toBeTruthy();
    expect(screen.getByTestId("wizard-mark", { includeHiddenElements: true })).toBeTruthy();
    expect(button("Get Started")).toBeTruthy();
    expect(button("Skip to sign in")).toBeTruthy();
    expect(screen.getByText("Skip")).toBeTruthy();
    // The pages that are not the current one are there (the finger can pull them in) but are not offered to VoiceOver.
    expect(screen.queryByRole("header", { name: "Everything you need to edit" })).toBeNull();
    expect(screen.getByText("Everything you need to edit", { includeHiddenElements: true })).toBeTruthy();
    noButton("Close");
  });

  test("page 2: the title and the four tiles, each with its tool's icon; 'Continue'", async () => {
    await render(<WelcomeWizard onDone={jest.fn()} />);
    await fireEvent.press(button("Get Started"));
    expect(pageNow()).toBe("Page 2 of 4");
    expect(screen.getByRole("header", { name: "Everything you need to edit" })).toBeTruthy();
    const tiles = [["beats", "Cut to the beat", "pulse-outline"], ["cutout", "Remove background", "body-outline"], ["captions", "Captions", "chatbox-ellipses-outline"], ["stabilize", "Stabilize", "hand-left-outline"]];
    for (const [id, label, icon] of tiles) {
      const tile = screen.getByTestId(`wizard-tile-${id}`);
      expect(tile.props.accessibilityLabel).toBe(label);
      expect(within(tile).getByText(label)).toBeTruthy();
      expect(FEATURES.find((f) => f.id === id)?.icon).toBe(icon);
      expect(TOOL_META[id as "beats"].icon).toBe(icon);   // the tool's own icon in the editor's bar
    }
    expect(button("Continue")).toBeTruthy();
    expect(button("Skip to sign in")).toBeTruthy();
  });

  test("page 3: the title and 'Continue'", async () => {
    await render(<WelcomeWizard onDone={jest.fn()} />);
    await fireEvent.press(button("Get Started"));
    await fireEvent.press(button("Continue"));
    expect(pageNow()).toBe("Page 3 of 4");
    expect(screen.getByRole("header", { name: "Allow what Clipy needs" })).toBeTruthy();
    expect(button("Skip to sign in")).toBeTruthy();
    await fireEvent.press(button("Continue"));
    expect(pageNow()).toBe("Page 4 of 4");
  });

  test("page 4: 'Sign in to post', its line, the sign-in page's own choices — no Skip, no gold button", async () => {
    await render(<WelcomeWizard onDone={jest.fn()} />);
    await fireEvent.press(button("Skip to sign in"));
    expect(pageNow()).toBe("Page 4 of 4");
    expect(screen.getByRole("header", { name: "Sign in to post" })).toBeTruthy();
    expect(screen.getByText("Post to YouTube, TikTok and more straight from Clipy.")).toBeTruthy();
    expect(await screen.findByLabelText("Continue with Apple")).toBeTruthy();
    expect(screen.getByLabelText("Continue with Apple").props).toMatchObject({ buttonStyle: Apple.AppleAuthenticationButtonStyle.WHITE });
    expect(button("Continue with Google")).toBeTruthy();
    expect(button("Continue with Email")).toBeTruthy();
    expect(button("Continue Without an Account")).toBeTruthy();
    noButton("Skip to sign in"); noButton("Not Now"); noButton("Close");
    expect(screen.queryAllByTestId("primary-button")).toHaveLength(0);
    // The standalone page's wordmark and line are not on this page.
    expect(screen.queryByText("Clipy", { includeHiddenElements: true })).toBeNull();
    expect(screen.queryByText("Edit, caption and post your clips.", { includeHiddenElements: true })).toBeNull();
  });
});

describe("moving between the pages", () => {
  test.each([[1], [2], [3]])("Skip on page %i lands on page 4", async (from) => {
    await render(<WelcomeWizard onDone={jest.fn()} />);
    if (from > 1) await swipeTo(from);
    expect(pageNow()).toBe(`Page ${from} of 4`);
    await fireEvent.press(button("Skip to sign in"));
    expect(pageNow()).toBe("Page 4 of 4");
    noButton("Skip to sign in");
  });

  test("the dots follow the finger: one wider pill for the current page, three small dots", async () => {
    await render(<WelcomeWizard onDone={jest.fn()} />);
    const dots = screen.getByTestId("wizard-dots");
    expect(dots.props.accessibilityRole).toBe("adjustable");
    expect(screen.getAllByTestId("wizard-dot-current", { includeHiddenElements: true })).toHaveLength(1);
    expect(screen.getAllByTestId("wizard-dot", { includeHiddenElements: true })).toHaveLength(3);
    expect(screen.getByTestId("wizard-dot-current", { includeHiddenElements: true })).toHaveStyle({ width: 24, height: 8, backgroundColor: theme.screens.dark.text });
    await swipeTo(3);
    expect(pageNow()).toBe("Page 3 of 4");
    expect(screen.getByRole("header", { name: "Allow what Clipy needs" })).toBeTruthy();
    await swipeTo(2);
    expect(pageNow()).toBe("Page 2 of 4");
  });

  test("VoiceOver changes page on the dots; never past either end", async () => {
    await render(<WelcomeWizard onDone={jest.fn()} />);
    const act_ = (actionName: string) => fireEvent(screen.getByTestId("wizard-dots"), "accessibilityAction", { nativeEvent: { actionName } });
    await act_("decrement");
    expect(pageNow()).toBe("Page 1 of 4");
    await act_("increment"); await act_("increment"); await act_("increment"); await act_("increment");
    expect(pageNow()).toBe("Page 4 of 4");
    await act_("decrement");
    expect(pageNow()).toBe("Page 3 of 4");
  });

  test("while a button's scroll is on its way, the pages it passes are not the current one", async () => {
    await render(<WelcomeWizard onDone={jest.fn()} />);
    await fireEvent.press(button("Skip to sign in"));
    await swipeTo(2);                                   // the native scroll reports page 2 as it passes
    expect(pageNow()).toBe("Page 4 of 4");
    expect(wizardStepTo).not.toHaveBeenCalled();        // so page 2's pictures did not play
    await swipeTo(4);                                   // arrived
    await swipeTo(3);                                   // and now the finger pulls back
    expect(pageNow()).toBe("Page 3 of 4");
  });

  test("the pages hold still while the email or the code is typed", async () => {
    await render(<WelcomeWizard onDone={jest.fn()} />);
    await fireEvent.press(button("Skip to sign in"));
    expect(screen.getByTestId("wizard-pager").props.scrollEnabled).toBe(true);
    await fireEvent.press(button("Continue with Email"));
    expect(screen.getByTestId("wizard-pager").props.scrollEnabled).toBe(false);
    await fireEvent.press(button("Back"));
    expect(screen.getByTestId("wizard-pager").props.scrollEnabled).toBe(true);
  });
});

describe("page 4 is the sign-in page's own body", () => {
  test("the same handlers: Apple and Google sign in once each, a cancel says nothing and stays", async () => {
    const onDone = jest.fn();
    await render(<WelcomeWizard onDone={onDone} />);
    await fireEvent.press(button("Skip to sign in"));
    await fireEvent.press(button("Continue with Google"));
    expect(signInWithGoogle).toHaveBeenCalledTimes(1);
    await act(async () => { (await screen.findByLabelText("Continue with Apple")).props.onPress(); });
    expect(signInWithApple).toHaveBeenCalledTimes(1);
    expect(onDone).not.toHaveBeenCalled();
    expect(hasSeenWelcome()).toBe(false);
  });

  test("a sign-in that works marks the welcome as seen and leaves, once", async () => {
    mocked(signInWithGoogle).mockResolvedValue("ok");
    const onDone = jest.fn();
    await render(<WelcomeWizard onDone={onDone} />);
    await fireEvent.press(button("Skip to sign in"));
    await fireEvent.press(button("Continue with Google"));
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(hasSeenWelcome()).toBe(true);
  });

  test("a failure is the page's own message", async () => {
    mocked(signInWithGoogle).mockRejectedValue(new Error("Google said no."));
    await render(<WelcomeWizard onDone={jest.fn()} />);
    await fireEvent.press(button("Skip to sign in"));
    await fireEvent.press(button("Continue with Google"));
    expect(useToast.getState().message).toBe("Google said no.");
  });

  test("email, then its code step, signs in and leaves", async () => {
    const onDone = jest.fn();
    await render(<WelcomeWizard onDone={onDone} />);
    await fireEvent.press(button("Skip to sign in"));
    await fireEvent.press(button("Continue with Email"));
    await fireEvent.changeText(screen.getByLabelText("Email"), "me@icloud.com");
    await fireEvent.press(button("Send Code"));
    expect(sendEmailCode).toHaveBeenCalledWith("me@icloud.com");
    await fireEvent.changeText(await screen.findByLabelText("6-digit code"), "123456");
    expect(verifyEmailCode).toHaveBeenCalledWith("me@icloud.com", "123456");
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(hasSeenWelcome()).toBe(true);
  });

  test("not set up: every choice says so and asks nothing", async () => {
    configure(false);
    await render(<WelcomeWizard onDone={jest.fn()} />);
    await fireEvent.press(button("Skip to sign in"));
    await fireEvent.press(button("Continue with Google"));
    expect(useToast.getState().message).toBe(NOT_SET_UP);
    expect(signInWithGoogle).not.toHaveBeenCalled();
  });

  test("'Continue Without an Account' marks the welcome as seen and leaves, once", async () => {
    const onDone = jest.fn();
    await render(<WelcomeWizard onDone={onDone} />);
    await fireEvent.press(button("Skip to sign in"));
    expect(hasSeenWelcome()).toBe(false);
    await fireEvent.press(button("Continue Without an Account"));
    await fireEvent.press(button("Continue Without an Account"));
    expect(hasSeenWelcome()).toBe(true);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  test("first launch, the stored session still being read: nothing is drawn; signed in: straight on, with the flag set", async () => {
    mocked(useSession).mockReturnValue({ status: "loading" });
    const onDone = jest.fn();
    const v = await render(<WelcomeWizard onDone={onDone} />);
    expect(screen.queryByTestId("wizard-pager")).toBeNull();
    mocked(useSession).mockReturnValue({ status: "signedIn", email: "me@icloud.com" });
    await v.rerender(<WelcomeWizard onDone={onDone} />);
    expect(screen.queryByTestId("wizard-pager")).toBeNull();
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(hasSeenWelcome()).toBe(true);
  });
});

describe("shown again from Accounts (replay)", () => {
  test("from page 1, with a close button; closing leaves once and touches neither the flag nor the session", async () => {
    const onDone = jest.fn();
    await render(<WelcomeWizard replay onDone={onDone} />);
    expect(pageNow()).toBe("Page 1 of 4");
    expect(hasSeenWelcome()).toBe(false);               // not set here, to see that a replay does not set it either
    await fireEvent.press(button("Close"));
    await fireEvent.press(button("Close"));
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(hasSeenWelcome()).toBe(false);
    expect(signOut).not.toHaveBeenCalled();
  });

  test.each([[true], [false]])("'Continue Without an Account' leaves, and the flag is as it was (set: %s)", async (set) => {
    if (set) markWelcomeSeen();
    const onDone = jest.fn();
    await render(<WelcomeWizard replay onDone={onDone} />);
    await fireEvent.press(button("Skip to sign in"));
    await fireEvent.press(button("Continue Without an Account"));
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(hasSeenWelcome()).toBe(set);
  });

  test("signed in: the wizard is still shown; its last page says so and ends with Done — nobody is signed out", async () => {
    mocked(useSession).mockReturnValue({ status: "signedIn", email: "me@icloud.com" });
    const onDone = jest.fn();
    await render(<WelcomeWizard replay onDone={onDone} />);
    expect(screen.getByRole("header", { name: "Make clips worth sharing" })).toBeTruthy();
    expect(onDone).not.toHaveBeenCalled();
    await fireEvent.press(button("Skip to sign in"));
    expect(screen.getByRole("header", { name: "Sign in to post" })).toBeTruthy();
    expect(screen.getByText("You're signed in.")).toBeTruthy();
    noButton("Continue with Google"); noButton("Continue Without an Account");
    await fireEvent.press(button("Done"));
    expect(onDone).toHaveBeenCalledTimes(1);
    for (const f of [signOut, signInWithApple, signInWithGoogle, sendEmailCode]) expect(f).not.toHaveBeenCalled();
  });

  test("signed out, then signed in on the last page: it leaves, as the sign-in page does", async () => {
    const onDone = jest.fn();
    const v = await render(<WelcomeWizard replay onDone={onDone} />);
    await fireEvent.press(button("Skip to sign in"));
    mocked(useSession).mockReturnValue({ status: "signedIn", email: "me@icloud.com" });
    await v.rerender(<WelcomeWizard replay onDone={onDone} />);
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});

describe("the pictures play once, when their page first becomes the current one", () => {
  test("page 1 at once; page 2's four tiles in turn when it is reached — and never again", async () => {
    await render(<WelcomeWizard onDone={jest.fn()} />);
    expect(wizardDrawTo).toHaveBeenCalledTimes(1); expect(wizardDrawTo).toHaveBeenCalledWith(false);
    expect(wizardPopTo).toHaveBeenCalledTimes(1); expect(wizardPopTo).toHaveBeenCalledWith(false);
    expect(wizardStepTo).not.toHaveBeenCalled();
    await fireEvent.press(button("Get Started"));
    expect(mocked(wizardStepTo).mock.calls).toEqual([[false, 0], [false, 1], [false, 2], [false, 3]]);
    await swipeTo(2);                                   // the button's scroll arrives
    await swipeTo(3);
    await swipeTo(2); await swipeTo(1); await swipeTo(2); await swipeTo(3);
    expect(wizardDrawTo).toHaveBeenCalledTimes(1); expect(wizardPopTo).toHaveBeenCalledTimes(1);
    expect(wizardStepTo).toHaveBeenCalledTimes(4);
  });

  test("Reduce Motion: every picture is asked for its finished state — nothing tweens — and a button's scroll is not animated", async () => {
    setReducedMotionForTests(true);
    await render(<WelcomeWizard onDone={jest.fn()} />);
    expect(wizardDrawTo).toHaveBeenCalledWith(true); expect(wizardPopTo).toHaveBeenCalledWith(true);
    await swipeTo(2); await swipeTo(3);
    expect(mocked(wizardStepTo).mock.calls).toEqual([[true, 0], [true, 1], [true, 2], [true, 3]]);
    for (const f of [wizardDrawTo, wizardPopTo, wizardStepTo]) for (const r of mocked(f).mock.results) expect(r.value).toBe(1);
  });
});

test("light: every page is cream — no navy surface, no white or bright-gold ink — and Apple's button is the black one", async () => {
  wear("light");
  await render(<WelcomeWizard onDone={jest.fn()} />);
  expect(leftovers({ onPicture: INK_SHAPES })).toEqual([]);
  await swipeTo(4);
  expect((await screen.findByLabelText("Continue with Apple")).props).toMatchObject({ buttonStyle: Apple.AppleAuthenticationButtonStyle.BLACK });
  expect(leftovers({ onPicture: INK_SHAPES })).toEqual([]);
});
