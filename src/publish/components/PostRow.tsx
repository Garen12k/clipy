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
  const { status, reason, checked, error, blocker, canPost, note, canResume } = view;
  const { label, icon } = PLATFORMS[status.id];
  const active = ACTIVE.includes(row.phase);
  const done = row.phase === "done";
  const pct = Math.round(Math.min(1, Math.max(0, row.progress)) * 100);
  const msg = (text: string, red = false) => <Body muted={!red} style={[small, red ? danger : null]}>{text}</Body>;

  let side: React.ReactNode = null;
  const below: React.ReactNode[] = [];
  if (row.phase === "preparing") side = <Body muted>Preparing…</Body>;
  else if (row.phase === "uploading") {
    side = <Body muted>{`${pct}%`}</Body>;
    below.push(
      <View key="bar" accessible accessibilityRole="progressbar" accessibilityLabel={`Uploading to ${label}`} accessibilityValue={{ min: 0, max: 100, now: pct }}
        style={{ height: 3, borderRadius: 2, backgroundColor: theme.colors.surfaceAlt, overflow: "hidden" }}>
        <View style={{ width: `${pct}%` as const, height: "100%", backgroundColor: theme.colors.accent }} />
      </View>,
    );
  } else if (row.phase === "publishing") side = <Body muted>Publishing…</Body>;
  else if (done) {
    const url = row.url;
    side = url ? (
      <View style={{ flexDirection: "row", alignItems: "center", gap: theme.space.sm }}>
        <Body weight="semi" style={{ color: theme.colors.accent }}>Done</Body>
        <SecondaryButton title="View" accessibilityLabel={`View on ${label}`} onPress={() => onView(url)} />
      </View>
    ) : <Body weight="semi" style={{ color: theme.colors.accent }}>Done</Body>;
    if (!url && row.message) below.push(<View key="m">{msg(row.message)}</View>);
  } else if (row.phase === "failed" || row.phase === "needsReconnect") {
    const verb = row.phase === "failed" ? (row.resumable ? "Resume" : "Retry") : canResume ? "Resume" : null;
    // Retry / Resume follow the same rule as Post: not while the row is invalid or the caption is too long.
    side = verb
      ? <SecondaryButton title={verb} accessibilityLabel={`${verb} ${label}`} disabled={!canPost} onPress={onRetry} />
      : <SecondaryButton title="Reconnect" accessibilityLabel={`Reconnect ${label}`} onPress={onReconnect} />;
    below.push(<View key="m">{msg(row.message ?? (row.phase === "failed" ? "Something went wrong." : `Reconnect ${label} in Accounts.`), true)}</View>);
    if (blocker) below.push(<View key="b">{msg(blocker, true)}</View>);
  } else if (reason) {
    side = (
      <View style={{ alignItems: "flex-end", gap: theme.space.xs }}>
        <Body muted style={[small, reason === "Sign-in expired" ? danger : null]}>{reason}</Body>
        {reason === "Not connected" ? <SecondaryButton title="Connect" accessibilityLabel={`Connect ${label}`} onPress={onConnect} /> : null}
        {reason === "Sign-in expired" ? <SecondaryButton title="Reconnect" accessibilityLabel={`Reconnect ${label}`} onPress={onReconnect} /> : null}
      </View>
    );
  } else {
    if (hasOptions(status.id)) side = <SecondaryButton title="Options" accessibilityLabel={`${label} options`} onPress={onOptions} />;
    if (blocker) below.push(<View key="b">{msg(blocker, true)}</View>);
  }
  // The platform's standing note stays visible whenever the row is ticked, next to any validation message.
  if (note && !done) below.push(<View key="n">{msg(note)}</View>);

  const identity = (<>
    <Ionicons name={icon} size={24} color={reason && !done ? theme.colors.textMuted : theme.colors.text} />
    <View style={{ flex: 1, gap: 2 }}>
      <Body weight="semi" muted={!!reason && !done}>{label}</Body>
      {status.connected && status.name ? <Body muted numberOfLines={1} style={small}>{status.name}</Body> : null}
    </View>
  </>);
  const rowStyle = { flex: 1, flexDirection: "row", alignItems: "center", gap: theme.space.md } as const;

  return (
    <View style={{ paddingVertical: theme.space.sm, gap: theme.space.sm }}>
      <View style={{ minHeight: 48, flexDirection: "row", alignItems: "center", gap: theme.space.md }}>
        {done ? (
          // Posted: a static mark, not a toggle.
          <View accessible accessibilityLabel={`${label}, posted`} style={rowStyle}>
            <Ionicons name="checkmark-circle" size={22} color={theme.colors.accent} />
            {identity}
          </View>
        ) : (
          // A row held back by a validation message opens its options (when it has any) instead of unticking.
          <Pressable accessibilityRole="checkbox" accessibilityLabel={label} accessibilityState={{ checked, disabled: !!reason || active }}
            disabled={!!reason || active} onPress={error && hasOptions(status.id) ? onOptions : onToggle} hitSlop={8} style={rowStyle}>
            <Ionicons name={checked ? "checkbox" : "square-outline"} size={22} color={reason ? theme.colors.textMuted : theme.colors.accent} />
            {identity}
          </Pressable>
        )}
        {side}
      </View>
      {below}
    </View>
  );
}
