import * as AppleAuthentication from "expo-apple-authentication";
import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { theme } from "@/src/theme/theme";
import { Card } from "@/src/ui/Card";
import { Body, Title } from "@/src/ui/Text";
import { useToast } from "@/src/ui/Toast";
import { signInWithApple } from "../supabase";
import { useSession } from "../useSession";

const BUTTON_HEIGHT = theme.size.control;

/** Sign in with Apple when signed out; an explanation when the backend isn't configured; nothing otherwise. */
export function SignInCard() {
  const session = useSession();
  const signedOut = session.status === "signedOut";
  // null = still asking the OS; the button slot keeps its height meanwhile so the card doesn't jump.
  const [available, setAvailable] = useState<boolean | null>(null);
  const pending = useRef(false);

  useEffect(() => {
    if (!signedOut) return;
    let live = true;
    AppleAuthentication.isAvailableAsync().then((v) => { if (live) setAvailable(v); }, () => { if (live) setAvailable(false); });
    return () => { live = false; };
  }, [signedOut]);

  async function onSignIn() {
    if (pending.current) return; // the native sheet is already up
    pending.current = true;
    try { await signInWithApple(); } // "ok" → useSession flips to signedIn; "cancelled" → nothing to say
    catch (e) { useToast.getState().show(e instanceof Error && e.message ? e.message : "Couldn't sign in."); }
    finally { pending.current = false; }
  }

  if (session.status === "unconfigured") {
    return (
      <Card style={{ gap: theme.space.sm }}>
        <Title size={theme.type.heading}>Posting isn't set up yet</Title>
        <Body muted>Clipy's posting server hasn't been connected. You can still share with the Share button.</Body>
      </Card>
    );
  }
  if (!signedOut) return null;
  return (
    <Card style={{ gap: theme.space.md }}>
      <Title size={theme.type.heading}>Sign in to Clipy</Title>
      <Body muted>Clipy keeps your connected accounts safe on its server.</Body>
      {available === null ? <View style={{ height: BUTTON_HEIGHT }} /> : available ? (
        <AppleAuthentication.AppleAuthenticationButton
          buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
          buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
          cornerRadius={BUTTON_HEIGHT / 2} style={{ height: BUTTON_HEIGHT, width: "100%" }}
          accessibilityLabel="Sign in with Apple" onPress={onSignIn} />
      ) : (
        <Body>Sign in with Apple isn't available on this device.</Body>
      )}
    </Card>
  );
}
