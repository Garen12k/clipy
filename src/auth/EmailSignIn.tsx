import { useEffect } from "react";
import { AccessibilityInfo, View } from "react-native";
import { theme } from "@/src/theme/theme";
import { useSurfaces } from "@/src/ui/tone";
import { EnterView } from "@/src/ui/Enter";
import { Field } from "@/src/ui/Field";
import { PrimaryButton } from "@/src/ui/PrimaryButton";
import { QuietButton } from "@/src/ui/QuietButton";
import { Spinner } from "@/src/ui/Spinner";
import { Body, Title } from "@/src/ui/Text";

export const CODE_LENGTH = 6;
/** Seconds before "Resend code" can be pressed again: the server's default minimum gap between two emails to one address (supabase/README.md §2a). */
export const RESEND_COOLDOWN_S = 60;

/** something@something.tld — a hint that the address is complete, not a validation (the server decides). */
export const looksLikeEmail = (text: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(text.trim());
export const digitsOnly = (text: string) => text.replace(/\D/g, "").slice(0, CODE_LENGTH);

/** One line under a field: an error (red) or a note (muted). VoiceOver announces it when it appears or changes. */
function Message({ text, error }: { text: string; error?: boolean }) {
  // iOS reads a new line of text only when asked to (the live region is Android's way).
  useEffect(() => { AccessibilityInfo.announceForAccessibility(text); }, [text]);
  const s = useSurfaces();
  return (
    <Body testID={error ? "welcome-error" : "welcome-note"} muted={!error} accessibilityRole="alert" accessibilityLiveRegion="polite"
      style={error ? { color: s.dangerText } : undefined}>{text}</Body>
  );
}

/** The spinner that stands where the gold button was, at the same height, so nothing below it moves. */
function Working({ label }: { label: string }) {
  return <View style={{ height: theme.size.control, justifyContent: "center" }}><Spinner label={label} /></View>;
}

type EmailProps = { email: string; onChange: (text: string) => void; note: string | null; error: string | null; busy: boolean; onSend: () => void };

/** Step two: the address. The gold button is "Send Code". */
export function EmailStep({ email, onChange, note, error, busy, onSend }: EmailProps) {
  const ready = looksLikeEmail(email);
  return (
    <EnterView style={{ gap: theme.space.lg }}>
      <Title size={theme.type.title} accessibilityRole="header">Sign in with email</Title>
      <Field accessibilityLabel="Email" value={email} onChangeText={onChange} placeholder="you@example.com" editable={!busy} autoFocus
        keyboardType="email-address" autoCapitalize="none" autoCorrect={false} textContentType="emailAddress" autoComplete="email"
        returnKeyType="send" onSubmitEditing={() => { if (ready) onSend(); }} />
      {error ? <Message text={error} error /> : note ? <Message text={note} /> : null}
      {busy ? <Working label="Sending code" /> : <PrimaryButton title="Send Code" onPress={onSend} disabled={!ready} />}
    </EnterView>
  );
}

type CodeProps = {
  email: string; code: string; onChange: (text: string) => void; note: string | null; error: string | null;
  /** What is running, as the spinner's label ("Signing in" / "Sending code"); null = nothing. */ working: string | null;
  /** Seconds until the code can be sent again (0 = now). */ resendIn: number;
  /** No backend: no code was sent, so the first line does not say one was. */ preview?: boolean;
  onVerify: () => void; onResend: () => void; onChangeEmail: () => void;
};

/** Step three: the code. The gold button is "Sign In". */
export function CodeStep({ email, code, onChange, note, error, working, resendIn, preview = false, onVerify, onResend, onChangeEmail }: CodeProps) {
  const busy = working !== null;
  return (
    <EnterView style={{ gap: theme.space.lg }}>
      <Body accessibilityRole="header" style={{ fontSize: theme.type.input }}>{preview ? "Enter the 6-digit code from the email." : `Enter the 6-digit code we sent to ${email}`}</Body>
      <Field accessibilityLabel="6-digit code" value={code} onChangeText={onChange} placeholder="000000" editable={!busy} autoFocus
        keyboardType="number-pad" textContentType="oneTimeCode" autoComplete="one-time-code" maxLength={CODE_LENGTH}
        style={{ fontVariant: ["tabular-nums"], letterSpacing: theme.space.sm }} />
      {error ? <Message text={error} error /> : note ? <Message text={note} /> : null}
      {working !== null ? <Working label={working} /> : <PrimaryButton title="Sign In" onPress={onVerify} disabled={code.length !== CODE_LENGTH} />}
      <View style={{ alignItems: "center" }}>
        <QuietButton title={resendIn > 0 ? `Resend Code in ${resendIn} s` : "Resend Code"} onPress={onResend} disabled={busy || resendIn > 0} />
        <QuietButton title="Use a Different Email" onPress={onChangeEmail} disabled={busy} />
      </View>
    </EnterView>
  );
}
