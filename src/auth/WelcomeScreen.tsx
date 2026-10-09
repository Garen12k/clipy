import { Icon } from "@/src/ui/Icon";
import * as AppleAuthentication from "expo-apple-authentication";
import { useEffect, useRef, useState } from "react";
import { Keyboard, ScrollView, View } from "react-native";
import { isBackendConfigured, sendEmailCode, SIGN_IN_NOT_SET_UP, signInWithApple, signInWithGoogle, verifyEmailCode } from "@/src/publish/supabase";
import { useSession } from "@/src/publish/useSession";
import { theme } from "@/src/theme/theme";
import { EnterView } from "@/src/ui/Enter";
import { IconButton } from "@/src/ui/IconButton";
import { WORDMARK } from "@/src/ui/LoadingScreen";
import { QuietButton } from "@/src/ui/QuietButton";
import { Screen } from "@/src/ui/Screen";
import { SecondaryButton } from "@/src/ui/SecondaryButton";
import { Spinner } from "@/src/ui/Spinner";
import { Body, Title } from "@/src/ui/Text";
import { ToastHost, useToast } from "@/src/ui/Toast";
import { CODE_LENGTH, CodeStep, digitsOnly, EmailStep, looksLikeEmail, RESEND_COOLDOWN_S } from "./EmailSignIn";
import { markWelcomeSeen } from "./welcomeSeen";

const TAGLINE = "Edit, caption and post your clips.";
const FOOTER = "You only need an account to post. Editing works without one.";
const NO_CODE_SENT = "Sign-in isn't set up yet, so no code was sent.";
const NEW_CODE_SENT = "We sent a new code.";
const FAILED = "Couldn't sign in.";
const BUTTON_HEIGHT = theme.size.control;
/** Where the first step's spinner stands while a sign-in runs: always there, at one height, so nothing moves when it appears. */
const WORKING_SLOT = theme.size.icon.lg;

const sentence = (e: unknown) => (e instanceof Error && e.message ? e.message : FAILED);
const toast = (message: string) => useToast.getState().show(message);
const hidden = { accessibilityElementsHidden: true, importantForAccessibility: "no-hide-descendants" } as const;

type Step = "choose" | "email" | "code";
type Props = {
  /** First launch: this is the root (drawn by app/index.tsx) — no close button, and the quiet link is "Continue without an account". */
  first?: boolean;
  /** Called once, when the screen is left: signed in, skipped or closed. The "seen" flag is already set. */
  onDone: () => void;
};

/**
 * The app's one sign-in page: choose → email → code, three steps of ONE screen (local state, no routes; a step change is instant).
 * Without a backend it is a preview that can be walked through: every sign-in says "Sign-in isn't set up yet." and asks nothing.
 */
export function WelcomeScreen({ first = false, onDone }: Props) {
  const session = useSession();
  /** Keyed on the backend alone: when it IS configured, a failed request never moves on. */
  const preview = !isBackendConfigured();
  const [step, setStep] = useState<Step>("choose");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [emailNote, setEmailNote] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [codeNote, setCodeNote] = useState<string | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);
  /** What is running, as a spinner label; null = nothing. While set, every button is inert. */
  const [working, setWorking] = useState<string | null>(null);
  const busy = working !== null;

  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  // Leaving happens once, whoever asks first: a button, a finished request or the session turning signed in.
  const left = useRef(false);
  function leave() {
    if (left.current || !alive.current) return;
    left.current = true;
    markWelcomeSeen();
    useToast.getState().clear(); // the store is app-wide: a toast still up would show again on the screen that follows
    onDone();
  }
  const signedIn = session.status === "signedIn";
  useEffect(() => { if (signedIn) leave(); }, [signedIn]);

  // One request at a time: a ref, so two taps in the same frame cannot both get through (`busy` only shows it).
  const pending = useRef(false);
  async function run(label: string, work: () => Promise<void>) {
    if (pending.current || left.current) return;
    pending.current = true;
    setWorking(label);
    try { await work(); }
    finally { pending.current = false; if (alive.current) setWorking(null); }
  }

  // null = still asking the phone; the slot keeps its height meanwhile so nothing jumps.
  const [apple, setApple] = useState<boolean | null>(null);
  useEffect(() => {
    let live = true;
    AppleAuthentication.isAvailableAsync().then((v) => { if (live) setApple(v); }, () => { if (live) setApple(false); });
    return () => { live = false; };
  }, []);

  function provider(label: string, signIn: () => Promise<"ok" | "cancelled">) {
    if (pending.current) return;
    if (preview) { toast(SIGN_IN_NOT_SET_UP); return; }
    run(label, async () => {
      try { if ((await signIn()) === "ok") leave(); } // "cancelled": nothing to say
      catch (e) { if (alive.current) toast(sentence(e)); }
    });
  }

  // The resend cool-down: a 1-second timer that lives only on the code step; `round` restarts it after a new code.
  const [resendIn, setResendIn] = useState(0);
  const [round, setRound] = useState(0);
  useEffect(() => {
    if (step !== "code" || round === 0) return;
    setResendIn(RESEND_COOLDOWN_S);
    let n = RESEND_COOLDOWN_S;
    const t = setInterval(() => { n -= 1; if (n <= 0) clearInterval(t); setResendIn(Math.max(n, 0)); }, 1000);
    return () => clearInterval(t);
  }, [step, round]);

  function openCode(note: string | null) {
    setCode(""); setCodeError(null); setCodeNote(note);
    setRound((r) => r + 1);
    setStep("code");
  }
  function onSend() {
    if (pending.current || !looksLikeEmail(email)) return;
    const address = email.trim();
    if (preview) { setEmail(address); setEmailError(null); setEmailNote(SIGN_IN_NOT_SET_UP); openCode(NO_CODE_SENT); return; }
    run("Sending code", async () => {
      try { await sendEmailCode(address); }
      catch (e) { if (alive.current) { setEmailNote(null); setEmailError(sentence(e)); } return; }
      if (alive.current) { setEmail(address); openCode(null); }
    });
  }
  function verify(digits: string) {
    if (pending.current || digits.length !== CODE_LENGTH) return;
    // Said under the field, with the keyboard put away: a toast would sit behind the number pad and the button would look dead.
    if (preview) { Keyboard.dismiss(); setCodeError(SIGN_IN_NOT_SET_UP); return; }
    run("Signing in", async () => {
      try { await verifyEmailCode(email, digits); }
      catch (e) { if (alive.current) setCodeError(sentence(e)); return; }
      leave();
    });
  }
  function onResend() {
    if (pending.current || resendIn > 0) return;
    if (preview) { setRound((r) => r + 1); return; }
    run("Sending code", async () => {
      try { await sendEmailCode(email); }
      catch (e) { if (alive.current) setCodeError(sentence(e)); return; }
      if (alive.current) { setCodeError(null); setCodeNote(NEW_CODE_SENT); setRound((r) => r + 1); }
    });
  }
  function onCode(text: string) {
    const digits = digitsOnly(text);
    setCodeError(null);
    setCode(digits);
    // The sixth digit signs in (a paste or the keyboard's code suggestion too). `run` lets only one request through.
    if (digits.length === CODE_LENGTH && code.length < CODE_LENGTH) verify(digits);
  }

  // First launch is drawn in place, full screen: the status bar's inset applies. From Accounts / Post it is a modal sheet, which
  // already sits below the status bar (as Export's does): only the bottom inset, and a little room above the close button.
  const edges = first ? (["top", "bottom"] as const) : (["bottom"] as const);
  const top = first ? undefined : { paddingTop: theme.space.md };

  // First launch with a backend: nothing is drawn until the stored session is read, so a signed-in user never sees this screen.
  if (signedIn || (first && session.status === "loading")) return <Screen edges={edges} style={top}>{null}</Screen>;

  const iconColor = theme.colors.text;
  return (
    <Screen edges={edges} style={top}>
      <View style={{ height: theme.size.row, flexDirection: "row", alignItems: "center", paddingHorizontal: theme.space.sm }}>
        {step === "email" ? <IconButton name="chevron-back-outline" accessibilityLabel="Back" disabled={busy} onPress={() => setStep("choose")} />
          : step === "code" ? <IconButton name="chevron-back-outline" accessibilityLabel="Back" disabled={busy} onPress={() => setStep("email")} />
          : first ? null : <IconButton name="close-outline" accessibilityLabel="Close" disabled={busy} onPress={leave} />}
      </View>
      {/* The scroll view makes room for the keyboard itself (iOS): the field and its buttons stay reachable on a small phone. */}
      <ScrollView automaticallyAdjustKeyboardInsets keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive"
        contentContainerStyle={{ flexGrow: 1, paddingHorizontal: theme.space.gutter, paddingBottom: theme.space.lg }}>
        {step === "choose" ? (
          <EnterView style={{ flexGrow: 1, gap: theme.space.xl }}>
            <View style={{ flexGrow: 1, alignItems: "center", justifyContent: "center", gap: theme.space.sm, paddingVertical: theme.space.xxl }}>
              <Title size={WORDMARK.size} accessibilityRole="header">Clipy</Title>
              <Body muted style={{ fontSize: theme.type.input, textAlign: "center" }}>{TAGLINE}</Body>
              {/* Google's session is completed after its browser has closed: this is what shows that something is happening. */}
              <View testID="welcome-working" style={{ height: WORKING_SLOT, justifyContent: "center" }}>
                {working !== null ? <Spinner label={working} /> : null}
              </View>
            </View>
            <View style={{ gap: theme.space.md }}>
              {/* Apple's own button (white, as Apple requires): it is the visual primary, so this step has no gold button. */}
              {apple === null ? <View testID="welcome-apple-slot" style={{ height: BUTTON_HEIGHT }} /> : apple ? (
                // Apple's control cannot be dimmed or disabled: while busy its wrapper takes no touch and is what VoiceOver meets, as a disabled button.
                <View testID="welcome-apple" pointerEvents={busy ? "none" : "auto"}
                  {...(busy ? { accessible: true, accessibilityRole: "button" as const, accessibilityLabel: "Continue with Apple", accessibilityState: { disabled: true } } : null)}>
                  <AppleAuthentication.AppleAuthenticationButton
                    buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
                    buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
                    cornerRadius={BUTTON_HEIGHT / 2} style={{ height: BUTTON_HEIGHT, width: "100%" }}
                    accessibilityRole="button" accessibilityLabel="Continue with Apple" onPress={() => provider("Signing in", signInWithApple)} />
                </View>
              ) : null}
              <SecondaryButton title="Continue with Google" disabled={busy} onPress={() => provider("Signing in", signInWithGoogle)}
                icon={<Icon name="logo-google" size={theme.size.icon.md} color={iconColor} {...hidden} />} />
              <SecondaryButton title="Continue with Email" disabled={busy} onPress={() => setStep("email")}
                icon={<Icon name="mail-outline" size={theme.size.icon.md} color={iconColor} {...hidden} />} />
              <QuietButton title={first ? "Continue Without an Account" : "Not Now"} disabled={busy} onPress={leave} />
            </View>
            <Body muted style={{ fontSize: theme.type.small, textAlign: "center" }}>{FOOTER}</Body>
          </EnterView>
        ) : step === "email" ? (
          <EmailStep email={email} onChange={(text) => { setEmail(text); setEmailError(null); setEmailNote(null); }}
            note={emailNote} error={emailError} busy={busy} onSend={onSend} />
        ) : (
          <CodeStep email={email} code={code} onChange={onCode} note={codeNote} error={codeError} working={working} resendIn={resendIn} preview={preview}
            onVerify={() => verify(code)} onResend={onResend} onChangeEmail={() => setStep("email")} />
        )}
      </ScrollView>
      <ToastHost />
    </Screen>
  );
}
