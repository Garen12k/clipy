import { router, useFocusEffect } from "expo-router";
import { useCallback, useRef } from "react";
import { theme } from "@/src/theme/theme";
import { Card } from "@/src/ui/Card";
import { PrimaryButton } from "@/src/ui/PrimaryButton";
import { SecondaryButton } from "@/src/ui/SecondaryButton";
import { Body, Title } from "@/src/ui/Text";
import { useSession } from "../useSession";

/** An invitation to sign in when signed out; an explanation when the backend isn't configured; nothing otherwise. */
export function SignInCard() {
  const session = useSession();
  // The app has ONE sign-in page (app/welcome.tsx); this card only opens it — once: a second tap before the sheet is up would push
  // a second one. The ref is cleared when this screen is in front again (the sheet was closed).
  const opening = useRef(false);
  useFocusEffect(useCallback(() => { opening.current = false; }, []));
  const openSignIn = () => {
    if (opening.current) return;
    opening.current = true;
    router.push("/welcome");
  };
  if (session.status === "unconfigured") {
    return (
      <Card style={{ gap: theme.space.md, alignItems: "flex-start" }}>
        <Title size={theme.type.heading}>Sign-in isn't set up yet</Title>
        <Body muted>Clipy's server hasn't been connected, so signing in and posting don't work yet. You can still share with the Share button.</Body>
        {/* Not gold: until the server exists the page it opens is a preview. */}
        <SecondaryButton title="Sign In" onPress={openSignIn} />
      </Card>
    );
  }
  if (session.status !== "signedOut") return null;
  return (
    <Card style={{ gap: theme.space.md }}>
      <Title size={theme.type.heading}>Sign in to Clipy</Title>
      <Body muted>Clipy keeps your connected accounts safe on its server.</Body>
      <PrimaryButton title="Sign In" onPress={openSignIn} />
    </Card>
  );
}
