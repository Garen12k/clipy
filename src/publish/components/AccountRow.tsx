import { Alert, View } from "react-native";
import { theme } from "@/src/theme/theme";
import { QuietButton } from "@/src/ui/QuietButton";
import { Spinner } from "@/src/ui/Spinner";
import type { PlatformStatus } from "../api";
import { PLATFORMS } from "../platforms";
import { PlatformIdentity } from "./PlatformIdentity";

type Props = { status: PlatformStatus; busy: boolean; onConnect: () => void; onDisconnect: () => void };

/** One platform: its logo tile and name (+ account, + state), and the one plain text action that fits its state — gold to connect, red to disconnect. Never a filled button: several rows can need Reconnect at once. */
export function AccountRow({ status, busy, onConnect, onDisconnect }: Props) {
  const { label } = PLATFORMS[status.id];
  const { available, connected, name, needsReconnect } = status;
  const detail = !available ? "Not available yet" : needsReconnect ? "Sign-in expired" : null;
  const summary = [label, connected && name ? name : null, detail ?? (available && !connected ? "Not connected" : null)].filter(Boolean).join(", ");

  const confirmDisconnect = () => Alert.alert(`Disconnect ${label}?`, "Clipy will stop posting to this account.", [
    { text: "Cancel", style: "cancel" }, { text: "Disconnect", style: "destructive", onPress: onDisconnect }]);

  let action: React.ReactNode = null;
  if (busy) action = <Spinner label={`Working on ${label}`} />;
  else if (!available) action = null;
  else if (needsReconnect) action = <QuietButton compact title="Reconnect" accessibilityLabel={`Reconnect ${label}`} onPress={onConnect} />;
  else if (connected) action = <QuietButton compact danger title="Disconnect" accessibilityLabel={`Disconnect ${label}`} onPress={confirmDisconnect} />;
  else action = <QuietButton compact title="Connect" accessibilityLabel={`Connect ${label}`} onPress={onConnect} />;

  return (
    <View testID={`account-row-${status.id}`} style={{ minHeight: theme.size.listRow, paddingVertical: theme.space.sm, flexDirection: "row", alignItems: "center", gap: theme.space.md }}>
      <View accessible accessibilityLabel={summary} style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: theme.space.md }}>
        <PlatformIdentity status={status} detail={detail} dim={!available} />
      </View>
      {action}
    </View>
  );
}
