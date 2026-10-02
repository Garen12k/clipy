import { Ionicons } from "@expo/vector-icons";
import { ActivityIndicator, Alert, Image, View } from "react-native";
import { theme } from "@/src/theme/theme";
import { PrimaryButton } from "@/src/ui/PrimaryButton";
import { SecondaryButton } from "@/src/ui/SecondaryButton";
import { Body } from "@/src/ui/Text";
import type { PlatformStatus } from "../api";
import { PLATFORMS } from "../platforms";

type Props = { status: PlatformStatus; busy: boolean; onConnect: () => void; onDisconnect: () => void };

const AVATAR = 32;

/** One platform: icon + label (+ account), and the one action that fits its state. */
export function AccountRow({ status, busy, onConnect, onDisconnect }: Props) {
  const { label, icon } = PLATFORMS[status.id];
  const { available, connected, name, avatarUrl, needsReconnect } = status;
  const detail = !available ? "Not available yet" : needsReconnect ? "Sign-in expired" : null;
  const summary = [label, connected && name ? name : null, detail ?? (available && !connected ? "Not connected" : null)].filter(Boolean).join(", ");

  const confirmDisconnect = () => Alert.alert(`Disconnect ${label}?`, "Clipy will stop posting to this account.", [
    { text: "Cancel", style: "cancel" }, { text: "Disconnect", style: "destructive", onPress: onDisconnect }]);

  let action: React.ReactNode = null;
  if (busy) action = <ActivityIndicator color={theme.colors.accent} accessibilityLabel={`Working on ${label}`} />;
  else if (!available) action = null;
  else if (needsReconnect) action = <PrimaryButton compact title="Reconnect" accessibilityLabel={`Reconnect ${label}`} onPress={onConnect} />;
  else if (connected) action = <SecondaryButton danger title="Disconnect" accessibilityLabel={`Disconnect ${label}`} onPress={confirmDisconnect} />;
  else action = <SecondaryButton title="Connect" accessibilityLabel={`Connect ${label}`} onPress={onConnect} />;

  return (
    <View style={{ minHeight: 56, flexDirection: "row", alignItems: "center", gap: theme.space.md, paddingVertical: theme.space.sm }}>
      <View accessible accessibilityLabel={summary} style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: theme.space.md }}>
        <Ionicons name={icon} size={24} color={available ? theme.colors.text : theme.colors.textMuted} />
        {connected && avatarUrl ? <Image source={{ uri: avatarUrl }} style={{ width: AVATAR, height: AVATAR, borderRadius: AVATAR / 2 }} /> : null}
        <View style={{ flex: 1, gap: 2 }}>
          <Body weight="semi" muted={!available}>{label}</Body>
          {connected && name ? <Body muted numberOfLines={1}>{name}</Body> : null}
          {detail ? <Body muted style={needsReconnect ? { color: theme.colors.danger } : undefined}>{detail}</Body> : null}
        </View>
      </View>
      {action}
    </View>
  );
}
