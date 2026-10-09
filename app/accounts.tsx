import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Alert, ScrollView, View } from "react-native";
import { buildLabel, buildName } from "@/src/lib/buildInfo";
import { AccountRow } from "@/src/publish/components/AccountRow";
import { SignInCard } from "@/src/publish/components/SignInCard";
import { signOut } from "@/src/publish/supabase";
import { useAccounts } from "@/src/publish/useAccounts";
import { useSession } from "@/src/publish/useSession";
import { theme } from "@/src/theme/theme";
import { Card } from "@/src/ui/Card";
import { Group } from "@/src/ui/Group";
import { PressableScale } from "@/src/ui/PressableScale";
import { Screen } from "@/src/ui/Screen";
import { ScreenBar } from "@/src/ui/ScreenBar";
import { SecondaryButton } from "@/src/ui/SecondaryButton";
import { Spinner } from "@/src/ui/Spinner";
import { Body } from "@/src/ui/Text";
import { ToastHost, useToast } from "@/src/ui/Toast";

/** A one-line row of a group: a symbol and a word, or a name and its value. */
const row = { minHeight: theme.size.row, flexDirection: "row", alignItems: "center", gap: theme.space.md } as const;

export default function AccountsScreen() {
  const session = useSession();
  const signedIn = session.status === "signedIn";
  const { status, platforms, error, busy, refresh, connect, disconnect } = useAccounts(signedIn);

  const goBack = () => (router.canGoBack() ? router.back() : router.replace("/"));
  const confirmSignOut = () => Alert.alert("Sign out of Clipy?", "Your connected accounts stay connected.", [
    { text: "Cancel", style: "cancel" },
    { text: "Sign Out", style: "destructive", onPress: async () => {
      try { await signOut(); useToast.getState().show("Signed out."); } catch (e) { useToast.getState().show(e instanceof Error && e.message ? e.message : "Couldn't sign out."); }
    } }]);

  const spinner = <Spinner style={{ marginTop: theme.space.xl }} />;

  return (
    <Screen edges={["top", "bottom"]}>
      <ScreenBar title="Accounts" leading="back" onLeading={goBack} />
      <ScrollView contentContainerStyle={{ padding: theme.space.gutter, gap: theme.space.xl }}>
        {session.status === "loading" ? spinner : null}
        <SignInCard />
        {signedIn ? (
          <Group label="Clipy account" testID="clipy-account">
            {/* The row shows the address alone; VoiceOver hears the whole sentence. */}
            <View testID="signed-in-row" accessible accessibilityLabel={session.email ? `Signed in as ${session.email}` : "Signed in"} style={row}>
              <Ionicons name="person-circle-outline" size={theme.size.icon.lg} color={theme.colors.text} />
              <Body numberOfLines={1} style={{ flex: 1 }}>{session.email ?? "Signed in"}</Body>
            </View>
            <PressableScale accessibilityRole="button" accessibilityLabel="Sign Out" onPress={confirmSignOut} style={row}>
              <Ionicons name="log-out-outline" size={theme.size.icon.lg} color={theme.colors.danger} />
              <Body style={{ flex: 1, color: theme.screen.dangerText }}>Sign Out</Body>
            </PressableScale>
          </Group>
        ) : null}
        {!signedIn ? null : status === "error" ? (
          <Card style={{ gap: theme.space.md, alignItems: "flex-start" }}>
            <Body>{error ?? "Something went wrong."}</Body>
            <SecondaryButton title="Try Again" onPress={refresh} />
          </Card>
        ) : status !== "ready" ? spinner : (
          <Group label="Platforms" testID="platforms">
            {platforms.map((p) => (
              <AccountRow key={p.id} status={p} busy={busy === p.id} onConnect={() => connect(p.id)} onDisconnect={() => disconnect(p.id)} />
            ))}
          </Group>
        )}
        {/* Which app is installed: a tool can be on screen in a build too old to run it. In every state of the screen. */}
        <Group>
          <View testID="build-row" accessible accessibilityLabel={buildLabel()} style={row}>
            <Body style={{ flex: 1 }}>Build</Body>
            <Body testID="build-label" muted numberOfLines={1}>{buildName()}</Body>
          </View>
        </Group>
      </ScrollView>
      <ToastHost />
    </Screen>
  );
}
