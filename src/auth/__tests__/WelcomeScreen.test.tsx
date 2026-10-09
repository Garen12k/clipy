import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
jest.mock("@/src/publish/useSession", () => ({ useSession: jest.fn() }));
jest.mock("@/src/publish/supabase", () => ({
  isBackendConfigured: jest.fn(), signInWithApple: jest.fn(), signInWithGoogle: jest.fn(), sendEmailCode: jest.fn(), verifyEmailCode: jest.fn(),
  SIGN_IN_NOT_SET_UP: "Sign-in isn't set up yet.",
}));
import * as Apple from "expo-apple-authentication";
import { AccessibilityInfo, Keyboard, StyleSheet } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { WORDMARK } from "@/src/ui/LoadingScreen";
import { isBackendConfigured, sendEmailCode, signInWithApple, signInWithGoogle, verifyEmailCode } from "@/src/publish/supabase";
import { useSession } from "@/src/publish/useSession";
import { theme } from "@/src/theme/theme";
import { useToast } from "@/src/ui/Toast";
import { RESEND_COOLDOWN_S } from "../EmailSignIn";
import { hasSeenWelcome, WELCOME_SEEN_KEY } from "../welcomeSeen";
import { WelcomeScreen } from "../WelcomeScreen";

const NOT_SET_UP = "Sign-in isn't set up yet.";
const mocked = <T extends (...a: never[]) => unknown>(f: T) => f as unknown as jest.Mock;
const button = (name: string) => screen.getByRole("button", { name });
const deferred = <T,>() => { let resolve!: (v: T) => void, reject!: (e: unknown) => void; const promise = new Promise<T>((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const store = (globalThis as unknown as { localStorage: { removeItem: (k: string) => void } }).localStorage;

function configure(on: boolean) {
  mocked(isBackendConfigured).mockReturnValue(on);
  mocked(useSession).mockReturnValue({ status: on ? "signedOut" : "unconfigured" });
}
async function toEmail() { await fireEvent.press(button("Continue with Email")); }
async function toCode(email = "me@icloud.com") {
  await toEmail();
  await fireEvent.changeText(screen.getByLabelText("Email"), email);
  await fireEvent.press(button("Send Code"));
}

beforeEach(() => {
  jest.clearAllMocks(); useToast.getState().clear(); store.removeItem(WELCOME_SEEN_KEY);
  jest.spyOn(AccessibilityInfo, "announceForAccessibility").mockImplementation(() => {});
  mocked(Apple.isAvailableAsync).mockResolvedValue(true);
  configure(true);
  mocked(sendEmailCode).mockResolvedValue(undefined); mocked(verifyEmailCode).mockResolvedValue(undefined);
  mocked(signInWithApple).mockResolvedValue("cancelled"); mocked(signInWithGoogle).mockResolvedValue("cancelled");
});
afterEach(() => { jest.useRealTimers(); });

describe("the first step", () => {
  test("first launch: the name, the line under it, three sign-in buttons, the skip link and the footer — and no gold button, no close", async () => {
    const onDone = jest.fn();
    await render(<WelcomeScreen first onDone={onDone} />);
    // The wordmark is the loading screen's: the same numbers, shared, not copied.
    expect(WORDMARK.size).toBe(48);
    expect(screen.getByRole("header", { name: "Clipy" })).toHaveStyle({ fontSize: WORDMARK.size });
    expect(screen.getByText("Edit, caption and post your clips.")).toBeTruthy();
    expect(await screen.findByLabelText("Continue with Apple")).toHaveStyle({ height: theme.size.control, width: "100%" });
    expect(screen.getByLabelText("Continue with Apple").props).toMatchObject({ buttonType: Apple.AppleAuthenticationButtonType.CONTINUE, buttonStyle: Apple.AppleAuthenticationButtonStyle.WHITE, cornerRadius: theme.size.control / 2 });
    expect(button("Continue with Google")).toHaveStyle({ backgroundColor: theme.elevation.lifted });
    expect(button("Continue with Email")).toHaveStyle({ backgroundColor: theme.elevation.lifted });
    expect(button("Continue Without an Account")).not.toHaveStyle({ backgroundColor: theme.elevation.lifted });
    expect(screen.getByText("You only need an account to post. Editing works without one.")).toHaveStyle({ fontSize: theme.type.small });
    expect(screen.queryAllByTestId("primary-button")).toHaveLength(0);
    expect(screen.queryByRole("button", { name: "Close" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Not Now" })).toBeNull();
  });

  test("the Apple slot keeps its height while the phone is asked, and is gone when Apple sign-in is not available", async () => {
    const asked = deferred<boolean>();
    mocked(Apple.isAvailableAsync).mockReturnValue(asked.promise);
    await render(<WelcomeScreen first onDone={jest.fn()} />);
    expect(screen.queryByLabelText("Continue with Apple")).toBeNull();
    expect(screen.getByTestId("welcome-apple-slot")).toHaveStyle({ height: theme.size.control });
    await act(async () => { asked.resolve(false); });
    expect(screen.queryByTestId("welcome-apple-slot")).toBeNull();
    expect(screen.queryByLabelText("Continue with Apple")).toBeNull();
    expect(button("Continue with Google")).toBeTruthy();
  });

  test("'Continue without an account' sets the flag and leaves, once", async () => {
    const onDone = jest.fn();
    await render(<WelcomeScreen first onDone={onDone} />);
    expect(hasSeenWelcome()).toBe(false);
    await fireEvent.press(button("Continue Without an Account"));
    await fireEvent.press(button("Continue Without an Account"));
    expect(hasSeenWelcome()).toBe(true);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  test("opened from Accounts or Post: a close button, and the quiet link says 'Not now' — both simply leave", async () => {
    const onDone = jest.fn();
    const first = await render(<WelcomeScreen onDone={onDone} />);
    expect(screen.queryByRole("button", { name: "Continue Without an Account" })).toBeNull();
    await fireEvent.press(button("Not Now"));
    expect(onDone).toHaveBeenCalledTimes(1);
    await first.unmount();
    await render(<WelcomeScreen onDone={onDone} />);
    await fireEvent.press(button("Close"));
    expect(onDone).toHaveBeenCalledTimes(2);
  });

  test("Apple and Google: 'ok' sets the flag and leaves once; a cancel says nothing; a failure is toasted and the screen stays", async () => {
    const onDone = jest.fn();
    await render(<WelcomeScreen first onDone={onDone} />);
    await fireEvent.press(await screen.findByLabelText("Continue with Apple"));
    await fireEvent.press(button("Continue with Google"));
    expect(signInWithApple).toHaveBeenCalledTimes(1); expect(signInWithGoogle).toHaveBeenCalledTimes(1);
    expect(useToast.getState().message).toBeNull(); expect(onDone).not.toHaveBeenCalled(); expect(hasSeenWelcome()).toBe(false);
    mocked(signInWithApple).mockRejectedValueOnce(new Error("Apple sign-in works in the installed app, not in Expo Go."));
    await fireEvent.press(screen.getByLabelText("Continue with Apple"));
    await waitFor(() => expect(useToast.getState().message).toBe("Apple sign-in works in the installed app, not in Expo Go."));
    expect(onDone).not.toHaveBeenCalled();
    mocked(signInWithGoogle).mockResolvedValueOnce("ok");
    await fireEvent.press(button("Continue with Google"));
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(hasSeenWelcome()).toBe(true);
  });

  test("the top safe-area edge is padded only on first launch (full screen); in the sheet, which already sits below the status bar, a theme space", async () => {
    const metrics = { frame: { x: 0, y: 0, width: 393, height: 852 }, insets: { top: 59, bottom: 34, left: 0, right: 0 } };
    type Node = { props: { style?: unknown }; children: (Node | string)[] | null };
    /** The Screen: the outermost view that pads its bottom edge. */
    const padding = () => {
      let node = screen.toJSON() as unknown as Node | null;
      for (;;) {
        if (!node) throw new Error("no Screen");
        const style = StyleSheet.flatten(node.props.style as never) as { paddingTop?: number; paddingBottom?: number } | undefined;
        if (style?.paddingBottom !== undefined) return { paddingTop: style.paddingTop, paddingBottom: style.paddingBottom };
        const child: Node | string | undefined = node.children?.[0];
        node = child && typeof child !== "string" ? child : null;
      }
    };
    const first = await render(<SafeAreaProvider initialMetrics={metrics}><WelcomeScreen first onDone={jest.fn()} /></SafeAreaProvider>);
    expect(padding()).toEqual({ paddingTop: 59 + theme.space.sm, paddingBottom: 34 + theme.space.sm });
    await first.unmount();
    await render(<SafeAreaProvider initialMetrics={metrics}><WelcomeScreen onDone={jest.fn()} /></SafeAreaProvider>);
    expect(padding()).toEqual({ paddingTop: theme.space.md, paddingBottom: 34 + theme.space.sm });
    expect(button("Close")).toBeTruthy();
  });

  test("a toast still showing when the screen is left is cleared, so the next screen does not replay it", async () => {
    configure(false);
    await render(<WelcomeScreen first onDone={jest.fn()} />);
    await fireEvent.press(button("Continue with Google"));
    expect(useToast.getState().message).toBe(NOT_SET_UP);
    await fireEvent.press(button("Continue Without an Account"));
    expect(useToast.getState().message).toBeNull();
  });

  test("a session that becomes signed in leaves the screen once, with the flag set (and on first launch nothing is drawn while it is read)", async () => {
    const onDone = jest.fn();
    mocked(useSession).mockReturnValue({ status: "loading" });
    const v = await render(<WelcomeScreen first onDone={onDone} />);
    expect(screen.queryByText("Edit, caption and post your clips.")).toBeNull();
    expect(onDone).not.toHaveBeenCalled();
    mocked(useSession).mockReturnValue({ status: "signedIn", email: "me@icloud.com" });
    await v.rerender(<WelcomeScreen first onDone={onDone} />);
    await v.rerender(<WelcomeScreen first onDone={onDone} />);
    expect(screen.queryByText("Edit, caption and post your clips.")).toBeNull();
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(hasSeenWelcome()).toBe(true);
  });
});

describe("busy", () => {
  test("while a sign-in runs every button is inert and a second tap sends nothing; afterwards they work again", async () => {
    const google = deferred<"ok" | "cancelled">();
    mocked(signInWithGoogle).mockReturnValueOnce(google.promise);
    const onDone = jest.fn();
    await render(<WelcomeScreen onDone={onDone} />);
    const apple = await screen.findByLabelText("Continue with Apple");
    // The progress slot is always there at one height (nothing jumps); Apple's wrapper says nothing of its own while idle.
    const slot = { height: theme.size.icon.lg };
    expect(screen.getByTestId("welcome-working")).toHaveStyle(slot);
    expect(screen.queryByLabelText("Signing in")).toBeNull();
    expect(screen.getByTestId("welcome-apple").props.accessible).not.toBe(true);
    await fireEvent.press(button("Continue with Google"));
    expect(screen.getByTestId("welcome-working")).toHaveStyle(slot);
    expect(screen.getByLabelText("Signing in")).toBeTruthy();
    // VoiceOver: Apple's own button cannot be dimmed, so its wrapper is the (disabled) button while busy.
    expect(screen.getByTestId("welcome-apple").props).toMatchObject({ accessible: true, accessibilityRole: "button", accessibilityLabel: "Continue with Apple", accessibilityState: { disabled: true }, pointerEvents: "none" });
    for (const name of ["Continue with Google", "Continue with Email", "Not Now", "Close"]) expect(button(name)).toBeDisabled();
    await fireEvent.press(button("Continue with Google"));
    await fireEvent.press(apple);
    await fireEvent.press(button("Continue with Email"));
    await fireEvent.press(button("Not Now"));
    expect(signInWithGoogle).toHaveBeenCalledTimes(1);
    expect(signInWithApple).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("Email")).toBeNull();
    expect(onDone).not.toHaveBeenCalled();
    await act(async () => { google.resolve("cancelled"); });
    for (const name of ["Continue with Google", "Continue with Email", "Not Now", "Close"]) expect(button(name)).not.toBeDisabled();
    expect(screen.queryByLabelText("Signing in")).toBeNull();
    expect(screen.getByTestId("welcome-working")).toHaveStyle(slot);
    expect(screen.getByTestId("welcome-apple").props.accessible).not.toBe(true);
  });

  test("leaving mid-request: nothing is set, toasted or left a second time when the request ends", async () => {
    const google = deferred<"ok" | "cancelled">();
    mocked(signInWithGoogle).mockReturnValueOnce(google.promise);
    const onDone = jest.fn();
    const errors = jest.spyOn(console, "error").mockImplementation(() => {});
    const v = await render(<WelcomeScreen onDone={onDone} />);
    await fireEvent.press(button("Continue with Google"));
    await v.unmount();
    await act(async () => { google.reject(new Error("Couldn't sign in.")); });
    expect(useToast.getState().message).toBeNull();
    expect(onDone).not.toHaveBeenCalled();
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });
});

describe("email", () => {
  test("the email step: a back control, the title, an email field, and 'Send code' — the one gold button — off until the text looks like an address", async () => {
    await render(<WelcomeScreen first onDone={jest.fn()} />);
    await toEmail();
    // A heading like every other: the kit Title, as typed.
    const heading = StyleSheet.flatten(screen.getByRole("header", { name: "Sign in with email" }).props.style);
    expect(heading).toMatchObject({ fontSize: theme.type.title });
    expect(heading).not.toHaveProperty("textTransform");
    expect(heading).not.toHaveProperty("letterSpacing");
    expect(screen.queryByRole("button", { name: "Continue with Google" })).toBeNull();
    expect(screen.getByLabelText("Email").props).toMatchObject({ keyboardType: "email-address", autoCapitalize: "none", autoCorrect: false, textContentType: "emailAddress", autoComplete: "email", returnKeyType: "send" });
    expect(screen.getAllByTestId("primary-button")).toHaveLength(1);
    for (const [text, ok] of [["", false], ["me", false], ["me@icloud", false], ["me@icloud.", false], ["me @icloud.com", false], ["  me@icloud.com ", true], ["a@b.co", true]] as const) {
      await fireEvent.changeText(screen.getByLabelText("Email"), text);
      if (ok) expect(button("Send Code")).not.toBeDisabled(); else expect(button("Send Code")).toBeDisabled();
    }
    await fireEvent.press(button("Back"));
    expect(button("Continue with Email")).toBeTruthy();
  });

  test("a sent code moves to the code step; a failed send stays, with the reason under the field until the text is edited", async () => {
    mocked(sendEmailCode).mockRejectedValueOnce(new Error("Too many tries. Wait a minute, then try again."));
    await render(<WelcomeScreen first onDone={jest.fn()} />);
    await toCode("me@icloud.com");
    expect(sendEmailCode).toHaveBeenCalledWith("me@icloud.com");
    expect(screen.queryByLabelText("6-digit code")).toBeNull();
    expect(screen.getByTestId("welcome-error")).toHaveTextContent("Too many tries. Wait a minute, then try again.");
    expect(screen.getByTestId("welcome-error").props).toMatchObject({ accessibilityRole: "alert", accessibilityLiveRegion: "polite" });
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith("Too many tries. Wait a minute, then try again.");
    expect(useToast.getState().message).toBeNull();
    await fireEvent.changeText(screen.getByLabelText("Email"), "me2@icloud.com ");
    expect(screen.queryByTestId("welcome-error")).toBeNull();
    await fireEvent(screen.getByLabelText("Email"), "submitEditing");
    expect(sendEmailCode).toHaveBeenLastCalledWith("me2@icloud.com");
    expect(screen.getByText("Enter the 6-digit code we sent to me2@icloud.com")).toBeTruthy();
  });

  test("while the code is sent a spinner stands in the button's place and a second send does nothing", async () => {
    const sending = deferred<void>();
    mocked(sendEmailCode).mockReturnValueOnce(sending.promise);
    await render(<WelcomeScreen first onDone={jest.fn()} />);
    await toCode();
    expect(screen.queryByRole("button", { name: "Send Code" })).toBeNull();
    expect(screen.getByLabelText("Sending code")).toBeTruthy();
    expect(button("Back")).toBeDisabled();
    await fireEvent(screen.getByLabelText("Email"), "submitEditing");
    expect(sendEmailCode).toHaveBeenCalledTimes(1);
    await act(async () => { sending.resolve(); });
    expect(screen.getByLabelText("6-digit code")).toBeTruthy();
  });
});

describe("the code", () => {
  test("the code step: a number field for six digits, 'Sign in' on at six, Resend, and a way back to the address", async () => {
    await render(<WelcomeScreen first onDone={jest.fn()} />);
    await toCode();
    const field = () => screen.getByLabelText("6-digit code");
    expect(field().props).toMatchObject({ keyboardType: "number-pad", textContentType: "oneTimeCode", autoComplete: "one-time-code", maxLength: 6 });
    expect(screen.getAllByTestId("primary-button")).toHaveLength(1);
    expect(button("Sign In")).toBeDisabled();
    await fireEvent.changeText(field(), "12a 34");
    expect(field().props.value).toBe("1234");
    expect(button("Sign In")).toBeDisabled();
    expect(verifyEmailCode).not.toHaveBeenCalled();
    await fireEvent.press(button("Use a Different Email"));
    expect(screen.getByLabelText("Email").props.value).toBe("me@icloud.com");
  });

  test("the sixth digit signs in: the flag is set and the screen is left once", async () => {
    const onDone = jest.fn();
    await render(<WelcomeScreen first onDone={onDone} />);
    await toCode(" me@icloud.com ");
    await fireEvent.changeText(screen.getByLabelText("6-digit code"), "123456");
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(verifyEmailCode).toHaveBeenCalledTimes(1);
    expect(verifyEmailCode).toHaveBeenCalledWith("me@icloud.com", "123456");
    expect(hasSeenWelcome()).toBe(true);
  });

  test("a wrong code stays, with the reason under the field until it is edited; 'Sign in' tries again", async () => {
    const onDone = jest.fn();
    mocked(verifyEmailCode).mockRejectedValueOnce(new Error("That code didn't work. Check it or send a new one."));
    await render(<WelcomeScreen first onDone={onDone} />);
    await toCode();
    await fireEvent.changeText(screen.getByLabelText("6-digit code"), "111111");
    expect(await screen.findByTestId("welcome-error")).toHaveTextContent("That code didn't work. Check it or send a new one.");
    expect(onDone).not.toHaveBeenCalled(); expect(hasSeenWelcome()).toBe(false);
    await fireEvent.press(button("Sign In"));
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(verifyEmailCode).toHaveBeenCalledTimes(2);
  });

  test("while it signs in a spinner stands in the button's place, every button is inert and nothing is sent twice", async () => {
    const checking = deferred<void>();
    mocked(verifyEmailCode).mockReturnValueOnce(checking.promise);
    const onDone = jest.fn();
    await render(<WelcomeScreen first onDone={onDone} />);
    await toCode();
    await fireEvent.changeText(screen.getByLabelText("6-digit code"), "123456");
    expect(screen.queryByRole("button", { name: "Sign In" })).toBeNull();
    expect(screen.getByLabelText("Signing in")).toBeTruthy();
    for (const name of ["Use a Different Email", "Back"]) expect(button(name)).toBeDisabled();
    expect(screen.getByRole("button", { name: /^Resend Code/ })).toBeDisabled();
    await fireEvent.changeText(screen.getByLabelText("6-digit code"), "123456");
    expect(verifyEmailCode).toHaveBeenCalledTimes(1);
    await act(async () => { checking.resolve(); });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  test("Resend waits 60 seconds, counting down in its label, then sends again and waits again; the timer stops with the step", async () => {
    expect(RESEND_COOLDOWN_S).toBe(60);
    jest.useFakeTimers();
    const started = jest.spyOn(globalThis, "setInterval"), stopped = jest.spyOn(globalThis, "clearInterval");
    /** Intervals started and not yet cleared. */
    const running = () => started.mock.results.map((r) => r.value).filter((id) => !stopped.mock.calls.some(([c]) => c === id)).length;
    const v = await render(<WelcomeScreen first onDone={jest.fn()} />);
    await toCode();
    expect(button("Resend Code in 60 s")).toBeDisabled();
    await act(async () => { jest.advanceTimersByTime(6000); });
    expect(button("Resend Code in 54 s")).toBeDisabled();
    await fireEvent.press(button("Resend Code in 54 s"));
    expect(sendEmailCode).toHaveBeenCalledTimes(1);
    await act(async () => { jest.advanceTimersByTime(54000); });
    expect(button("Resend Code")).not.toBeDisabled();
    await act(async () => { jest.advanceTimersByTime(5000); });
    expect(button("Resend Code")).not.toBeDisabled();
    await fireEvent.press(button("Resend Code"));
    expect(sendEmailCode).toHaveBeenCalledTimes(2);
    expect(button("Resend Code in 60 s")).toBeDisabled();
    expect(screen.getByTestId("welcome-note")).toHaveTextContent("We sent a new code.");
    // A failed resend says why, and can be tried again at once.
    await act(async () => { jest.advanceTimersByTime(60000); });
    mocked(sendEmailCode).mockRejectedValueOnce(new Error("Couldn't reach Clipy. Check your connection."));
    await fireEvent.press(button("Resend Code"));
    expect(screen.getByTestId("welcome-error")).toHaveTextContent("Couldn't reach Clipy. Check your connection.");
    expect(button("Resend Code")).not.toBeDisabled();
    // Going back to the address stops the countdown; a new code starts it afresh. Unmounting leaves no timer behind.
    await fireEvent.press(button("Resend Code"));
    await act(async () => { jest.advanceTimersByTime(3000); });
    expect(button("Resend Code in 57 s")).toBeTruthy();
    expect(running()).toBe(1);
    await fireEvent.press(button("Use a Different Email"));
    expect(running()).toBe(0);
    await fireEvent.press(button("Send Code"));
    expect(button("Resend Code in 60 s")).toBeTruthy();
    expect(running()).toBe(1);
    await v.unmount();
    expect(running()).toBe(0);
    started.mockRestore(); stopped.mockRestore();
  });
});

describe("preview: no backend (the owner's phone today)", () => {
  beforeEach(() => configure(false));

  test("Apple and Google say 'Sign-in isn't set up yet.' and ask nothing", async () => {
    await render(<WelcomeScreen first onDone={jest.fn()} />);
    await fireEvent.press(await screen.findByLabelText("Continue with Apple"));
    expect(useToast.getState().message).toBe(NOT_SET_UP);
    await act(async () => { useToast.getState().clear(); });
    await fireEvent.press(button("Continue with Google"));
    expect(useToast.getState().message).toBe(NOT_SET_UP);
    expect(signInWithApple).not.toHaveBeenCalled(); expect(signInWithGoogle).not.toHaveBeenCalled();
    expect(screen.getByText("Edit, caption and post your clips.")).toBeTruthy();
  });

  test("the whole email walk: 'Send code' still opens the code step, which says no code was sent; 'Sign in' answers under the field (no toast behind the number pad) and puts the keyboard away; nothing is requested", async () => {
    const onDone = jest.fn();
    const dismiss = jest.spyOn(Keyboard, "dismiss").mockImplementation(() => {});
    await render(<WelcomeScreen first onDone={onDone} />);
    await toCode("me@icloud.com");
    // No code was sent, so the line above the field does not say one was.
    expect(screen.getByText("Enter the 6-digit code from the email.")).toBeTruthy();
    expect(screen.queryByText(/we sent to/)).toBeNull();
    expect(screen.getByTestId("welcome-note")).toHaveTextContent("Sign-in isn't set up yet, so no code was sent.");
    await fireEvent.changeText(screen.getByLabelText("6-digit code"), "12345");
    expect(screen.queryByTestId("welcome-error")).toBeNull();
    expect(dismiss).not.toHaveBeenCalled();
    // The sixth digit: the sentence, inline, and the keyboard goes.
    await fireEvent.changeText(screen.getByLabelText("6-digit code"), "123456");
    expect(screen.getByTestId("welcome-error")).toHaveTextContent(NOT_SET_UP);
    expect(screen.getByTestId("welcome-error").props).toMatchObject({ accessibilityRole: "alert" });
    expect(dismiss).toHaveBeenCalledTimes(1);
    expect(useToast.getState().message).toBeNull();
    // Editing takes it away again (the note returns); the button says it again.
    await fireEvent.changeText(screen.getByLabelText("6-digit code"), "12345");
    expect(screen.queryByTestId("welcome-error")).toBeNull();
    expect(screen.getByTestId("welcome-note")).toHaveTextContent("Sign-in isn't set up yet, so no code was sent.");
    await fireEvent.changeText(screen.getByLabelText("6-digit code"), "123456");
    await fireEvent.press(button("Sign In"));
    expect(screen.getByTestId("welcome-error")).toHaveTextContent(NOT_SET_UP);
    expect(dismiss).toHaveBeenCalledTimes(3);
    expect(useToast.getState().message).toBeNull();
    expect(button("Sign In")).not.toBeDisabled();
    dismiss.mockRestore();
    // Back on the address, the same sentence is the note under the field.
    await fireEvent.press(button("Use a Different Email"));
    expect(screen.getByTestId("welcome-note")).toHaveTextContent(NOT_SET_UP);
    await fireEvent.press(button("Back"));
    await fireEvent.press(button("Continue Without an Account"));
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(hasSeenWelcome()).toBe(true);
    expect(sendEmailCode).not.toHaveBeenCalled(); expect(verifyEmailCode).not.toHaveBeenCalled();
  });

  test("configured, a failed send must NOT open the code step (the preview is keyed on the backend alone)", async () => {
    configure(true);
    mocked(sendEmailCode).mockRejectedValueOnce(new Error(NOT_SET_UP));
    await render(<WelcomeScreen first onDone={jest.fn()} />);
    await toCode();
    expect(screen.queryByLabelText("6-digit code")).toBeNull();
    expect(screen.getByTestId("welcome-error")).toHaveTextContent(NOT_SET_UP);
  });
});
