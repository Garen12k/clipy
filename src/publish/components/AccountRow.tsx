import { Ionicons } from "@expo/vector-icons";
import { Alert, Image, View } from "react-native";
import { theme } from "@/src/theme/theme";
import { QuietButton } from "@/src/ui/QuietButton";
import { SecondaryButton } from "@/src/ui/SecondaryButton";
import { Spinner } from "@/src/ui/Spinner";
import { Body } from "@/src/ui/Text";
import type { PlatformStatus } from "../api";
import { PLATFORMS } from "../platforms";

type Props = { status: PlatformStatus; busy: boolean; onConnect: () => void; onDisconnect: () => void };

const AVATAR = theme.size.avatar;

/** One platform: icon + label (+ account), and the one (compact) action that fits its state. Never a gold button: several rows can need Reconnect at once. */
export function AccountRow({ status, busy, onConnect, onDisconnect }: Props) {
  const { label, icon } = PLATFORMS[status.id];
  const { available, connected, name, avatarUrl, needsReconnect } = status;
  const detail = !available ? "Not available yet" : needsReconnect ? "Sign-in expired" : null;
  const summary = [label, connected && name ? name : null, detail ?? (available && !connected ? "Not connected" : null)].filter(Boolean).join(", ");

  const confirmDisconnect = () => Alert.alert(`Disconnect ${label}?`, "Clipy will stop posting to this account.", [
    { text: "Cancel", style: "cancel" }, { text: "Disconnect", style: "destructive", onPress: onDisconnect }]);

  let action: React.ReactNode = null;
  if (busy) action = <Spinner label={`Working on ${label}`} />;
  else if (!available) action = null;
  else if (needsReconnect) action = <SecondaryButton compact title="Reconnect" accessibilityLabel={`Reconnect ${label}`} onPress={onConnect} />;
  else if (connected) action = <QuietButton compact danger title="Disconnect" accessibilityLabel={`Disconnect ${label}`} onPress={confirmDisconnect} />;
  else action = <SecondaryButton compact title="Connect" accessibilityLabel={`Connect ${label}`} onPress={onConnect} />;

  return (
    <View testID={`account-row-${status.id}`} style={{ minHeight: theme.size.listRow, flexDirection: "row", alignItems: "center", gap: theme.space.md }}>
      <View accessible accessibilityLabel={summary} style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: theme.space.md }}>
        <Ionicons name={icon} size={theme.size.icon.lg} color={available ? theme.colors.text : theme.colors.textMuted} />
        {connected && avatarUrl ? <Image source={{ uri: avatarUrl }} style={{ width: AVATAR, height: AVATAR, borderRadius: theme.radius.pill }} /> : null}
        <View style={{ flex: 1, gap: theme.space.xs }}>
          <Body weight="semi" muted={!available}>{label}</Body>
          {connected && name ? <Body muted numberOfLines={1} style={{ fontSize: theme.type.small }}>{name}</Body> : null}
          {detail ? <Body muted style={[{ fontSize: theme.type.small }, needsReconnect ? { color: theme.colors.danger } : null]}>{detail}</Body> : null}
        </View>
      </View>
      {action}
    </View>
  );
}
