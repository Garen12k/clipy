import { router } from "expo-router";
import { Alert, ScrollView, View } from "react-native";
import { AccountRow } from "@/src/publish/components/AccountRow";
import { SignInCard } from "@/src/publish/components/SignInCard";
import { signOut } from "@/src/publish/supabase";
import { useAccounts } from "@/src/publish/useAccounts";
import { useSession } from "@/src/publish/useSession";
import { theme } from "@/src/theme/theme";
import { Card } from "@/src/ui/Card";
import { IconButton } from "@/src/ui/IconButton";
import { Screen } from "@/src/ui/Screen";
import { QuietButton } from "@/src/ui/QuietButton";
import { SecondaryButton } from "@/src/ui/SecondaryButton";
import { Spinner } from "@/src/ui/Spinner";
import { Body, Title } from "@/src/ui/Text";
import { ToastHost, useToast } from "@/src/ui/Toast";

export default function AccountsScreen() {
  const session = useSession();
  const signedIn = session.status === "signedIn";
  const { status, platforms, error, busy, refresh, connect, disconnect } = useAccounts(signedIn);

  const goBack = () => (router.canGoBack() ? router.back() : router.replace("/"));
  const confirmSignOut = () => Alert.alert("Sign out of Clipy?", "Your connected accounts stay connected.", [
    { text: "Cancel", style: "cancel" },
    { text: "Sign out", style: "destructive", onPress: async () => {
      try { await signOut(); useToast.getState().show("Signed out."); } catch (e) { useToast.getState().show(e instanceof Error && e.message ? e.message : "Couldn't sign out."); }
    } }]);

  const spinner = <Spinner style={{ marginTop: theme.space.xl }} />;

  return (
    <Screen edges={["top", "bottom"]}>
      <View style={{ height: theme.size.row, flexDirection: "row", alignItems: "center", gap: theme.space.xs, paddingHorizontal: theme.space.sm, marginBottom: theme.space.sm }}>
        <IconButton name="chevron-back-outline" accessibilityLabel="Back" onPress={goBack} />
        <Title size={theme.type.screen} accessibilityRole="header">Accounts</Title>
      </View>
      <ScrollView contentContainerStyle={{ padding: theme.space.gutter, gap: theme.space.lg }}>
        {session.status === "loading" ? spinner : null}
        <SignInCard />
        {!signedIn ? null : status === "error" ? (
          <Card style={{ gap: theme.space.md, alignItems: "flex-start" }}>
            <Body>{error ?? "Something went wrong."}</Body>
            <SecondaryButton title="Try again" onPress={refresh} />
          </Card>
        ) : status !== "ready" ? spinner : (
          <Card style={{ paddingVertical: theme.space.xs }}>
            {platforms.map((p, i) => (
              <View key={p.id} style={i > 0 ? { borderTopWidth: 1, borderTopColor: theme.colors.hairline } : undefined}>
                <AccountRow status={p} busy={busy === p.id} onConnect={() => connect(p.id)} onDisconnect={() => disconnect(p.id)} />
              </View>
            ))}
          </Card>
        )}
      </ScrollView>
      {signedIn ? (
        <View style={{ paddingHorizontal: theme.space.gutter, paddingTop: theme.space.md, gap: theme.space.md, alignItems: "center" }}>
          <Body muted style={{ textAlign: "center" }}>{session.email ? `Signed in as ${session.email}` : "Signed in"}</Body>
          <QuietButton title="Sign out" onPress={confirmSignOut} />
        </View>
      ) : null}
      <ToastHost />
    </Screen>
  );
}
