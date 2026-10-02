import { Ionicons } from "@expo/vector-icons";
import { Pressable, View } from "react-native";
import { theme } from "@/src/theme/theme";
import { SecondaryButton } from "@/src/ui/SecondaryButton";
import { Body } from "@/src/ui/Text";
import { PLATFORMS } from "../platforms";
import type { RowState } from "../runPost";
import type { PlatformView } from "../usePostForm";
import { hasOptions } from "./PostOptionsSheet";

type Props = {
  view: PlatformView; row: RowState;
  onToggle: () => void; onOptions: () => void;
  /** Opens Accounts: plain for Connect, remembered for Reconnect so the row can offer Resume on return. */
  onConnect: () => void; onReconnect: () => void;
  onRetry: () => void; onView: (url: string) => void;
};

const ACTIVE = ["preparing", "uploading", "publishing"];
const danger = { color: theme.colors.danger };
const small = { fontSize: 12 };

/** One platform on the Post screen: tick box + account on the left, its state and one action on the right, messages below. */
export function PostRow({ view, row, onToggle, onOptions, onConnect, onReconnect, onRetry, onView }: Props) {
  const { status, reason, checked, error, note, canResume } = view;
  const { label, icon } = PLATFORMS[status.id];
  const active = ACTIVE.includes(row.phase);
  const pct = Math.round(Math.min(1, Math.max(0, row.progress)) * 100);

  let side: React.ReactNode = null;
  let below: React.ReactNode = null;
  if (row.phase === "preparing") side = <Body muted>Preparing…</Body>;
  else if (row.phase === "uploading") {
    side = <Body muted>{`${pct}%`}</Body>;
    below = (
      <View accessible accessibilityRole="progressbar" accessibilityLabel={`Uploading to ${label}`} accessibilityValue={{ min: 0, max: 100, now: pct }}
        style={{ height: 3, borderRadius: 2, backgroundColor: theme.colors.surfaceAlt, overflow: "hidden" }}>
        <View style={{ width: `${pct}%` as const, height: "100%", backgroundColor: theme.colors.accent }} />
      </View>
    );
  } else if (row.phase === "publishing") side = <Body muted>Publishing…</Body>;
  else if (row.phase === "done") {
    const url = row.url;
    side = url ? (
      <View style={{ flexDirection: "row", alignItems: "center", gap: theme.space.sm }}>
        <Body weight="semi" style={{ color: theme.colors.accent }}>Done</Body>
        <SecondaryButton title="View" accessibilityLabel={`View on ${label}`} onPress={() => onView(url)} />
      </View>
    ) : <Body weight="semi" style={{ color: theme.colors.accent }}>Done</Body>;
    if (!url && row.message) below = <Body muted style={small}>{row.message}</Body>;
  } else if (row.phase === "failed") {
    side = <SecondaryButton title={row.resumable ? "Resume" : "Retry"} accessibilityLabel={`${row.resumable ? "Resume" : "Retry"} ${label}`} onPress={onRetry} />;
    below = <Body style={[small, danger]}>{row.message ?? "Something went wrong."}</Body>;
  } else if (row.phase === "needsReconnect") {
    side = canResume
      ? <SecondaryButton title="Resume" accessibilityLabel={`Resume ${label}`} onPress={onRetry} />
      : <SecondaryButton title="Reconnect" onPress={onReconnect} />;
    below = <Body style={[small, danger]}>{row.message ?? `Reconnect ${label} in Accounts.`}</Body>;
  } else if (reason) {
    side = (
      <View style={{ alignItems: "flex-end", gap: theme.space.xs }}>
        <Body muted style={[small, reason === "Sign-in expired" ? danger : null]}>{reason}</Body>
        {reason === "Not connected" ? <SecondaryButton title="Connect" onPress={onConnect} /> : null}
        {reason === "Sign-in expired" ? <SecondaryButton title="Reconnect" onPress={onReconnect} /> : null}
      </View>
    );
  } else {
    if (hasOptions(status.id)) side = <SecondaryButton title="Options" accessibilityLabel={`${label} options`} onPress={onOptions} />;
    if (error) below = <Body style={[small, danger]}>{error}</Body>;
    else if (note) below = <Body muted style={small}>{note}</Body>;
  }

  return (
    <View style={{ paddingVertical: theme.space.sm, gap: theme.space.sm }}>
      <View style={{ minHeight: 48, flexDirection: "row", alignItems: "center", gap: theme.space.md }}>
        <Pressable accessibilityRole="checkbox" accessibilityLabel={label} accessibilityState={{ checked, disabled: !!reason || active }}
          disabled={!!reason || active} onPress={onToggle} hitSlop={8}
          style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: theme.space.md }}>
          <Ionicons name={checked ? "checkbox" : "square-outline"} size={22} color={reason ? theme.colors.textMuted : theme.colors.accent} />
          <Ionicons name={icon} size={24} color={reason ? theme.colors.textMuted : theme.colors.text} />
          <View style={{ flex: 1, gap: 2 }}>
            <Body weight="semi" muted={!!reason}>{label}</Body>
            {status.connected && status.name ? <Body muted numberOfLines={1} style={small}>{status.name}</Body> : null}
          </View>
        </Pressable>
        {side}
      </View>
      {below}
    </View>
  );
}
