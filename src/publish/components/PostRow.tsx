import { Ionicons } from "@expo/vector-icons";
import { View } from "react-native";
import { theme } from "@/src/theme/theme";
import { PressableScale } from "@/src/ui/PressableScale";
import { QuietButton } from "@/src/ui/QuietButton";
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
/** The upload bar's thickness. */
const BAR = 4;
/** A standing note under a row. */
const note = { fontSize: theme.type.small } as const;
/** Something went wrong, or needs checking before posting again: red and a size larger than a note. */
const alarm = { fontSize: theme.type.label, color: theme.colors.dangerText } as const;
/** The row's state on the right ("Preparing…", "42%"). */
const status = { fontSize: theme.type.label } as const;
const ICON = theme.size.icon.lg;

/** One platform on the Post screen: tick box + account on the left, its state and one (compact) action on the right, messages below. */
export function PostRow({ view, row, onToggle, onOptions, onConnect, onReconnect, onRetry, onView }: Props) {
  const { status: account, reason, checked, error, blocker, canPost, note: standing, captionNote, canResume } = view;
  const { label, icon } = PLATFORMS[account.id];
  const active = ACTIVE.includes(row.phase);
  const done = row.phase === "done";
  const pct = Math.round(Math.min(1, Math.max(0, row.progress)) * 100);
  const msg = (text: string, red = false) => <Body muted={!red} style={red ? alarm : note}>{text}</Body>;

  let side: React.ReactNode = null;
  const below: React.ReactNode[] = [];
  if (row.phase === "preparing") side = <Body muted style={status}>Preparing…</Body>;
  else if (row.phase === "uploading") {
    side = <Body muted style={[status, { fontVariant: ["tabular-nums"] }]}>{`${pct}%`}</Body>;
    below.push(
      <View key="bar" accessible accessibilityRole="progressbar" accessibilityLabel={`Uploading to ${label}`} accessibilityValue={{ min: 0, max: 100, now: pct }}
        style={{ height: BAR, borderRadius: theme.radius.pill, backgroundColor: theme.elevation.tile, overflow: "hidden" }}>
        <View style={{ width: `${pct}%` as const, height: "100%", backgroundColor: theme.colors.accent }} />
      </View>,
    );
  } else if (row.phase === "publishing") side = <Body muted style={status}>Publishing…</Body>;
  else if (done) {
    const url = row.url;
    side = url ? (
      <View style={{ flexDirection: "row", alignItems: "center", gap: theme.space.sm }}>
        <Body weight="semi" style={{ color: theme.colors.accent }}>Done</Body>
        <SecondaryButton compact title="View" accessibilityLabel={`View on ${label}`} onPress={() => onView(url)} />
      </View>
    ) : <Body weight="semi" style={{ color: theme.colors.accent }}>Done</Body>;
    // No link (e.g. a TikTok draft): the row's own message, else the platform's done note.
    const doneText = url ? null : row.message ?? view.adapter?.doneNote ?? null;
    if (doneText) below.push(<View key="m">{msg(doneText)}</View>);
  } else if (row.phase === "failed" || row.phase === "needsReconnect") {
    const verb = row.phase === "failed" ? (row.resumable ? "Resume" : "Retry") : canResume ? "Resume" : null;
    // Retry / Resume follow the same rule as Post: not while the row is invalid or the caption is too long.
    side = verb
      ? <SecondaryButton compact title={verb} accessibilityLabel={`${verb} ${label}`} disabled={!canPost} onPress={onRetry} />
      : <SecondaryButton compact title="Reconnect" accessibilityLabel={`Reconnect ${label}`} onPress={onReconnect} />;
    below.push(<View key="m">{msg(row.message ?? (row.phase === "failed" ? "Something went wrong." : `Reconnect ${label} in Accounts.`), true)}</View>);
    if (blocker) below.push(<View key="b">{msg(blocker, true)}</View>);
  } else if (reason) {
    side = (
      // paddingBottom: the compact button's 4-pt bottom slop stays inside its parent, so the target is the full 44.
      <View style={{ alignItems: "flex-end", gap: theme.space.xs, paddingBottom: theme.space.xs }}>
        <Body muted style={[note, reason === "Sign-in expired" ? { color: theme.colors.dangerText } : null]}>{reason}</Body>
        {reason === "Not connected" ? <SecondaryButton compact title="Connect" accessibilityLabel={`Connect ${label}`} onPress={onConnect} /> : null}
        {reason === "Sign-in expired" ? <SecondaryButton compact title="Reconnect" accessibilityLabel={`Reconnect ${label}`} onPress={onReconnect} /> : null}
      </View>
    );
  } else {
    if (hasOptions(account.id)) side = <QuietButton compact title="Options" accessibilityLabel={`${label} options`} onPress={onOptions} />;
    if (blocker) below.push(<View key="b">{msg(blocker, true)}</View>);
  }
  // The platform's standing note stays visible whenever the row is ticked, next to any validation message.
  if (standing && !done) below.push(<View key="n">{msg(standing)}</View>);
  if (captionNote && !done) below.push(<View key="c">{msg(captionNote)}</View>);

  const identity = (<>
    <Ionicons name={icon} size={ICON} color={reason && !done ? theme.colors.textMuted : theme.colors.text} />
    <View style={{ flex: 1, gap: theme.space.xs }}>
      <Body weight="semi" muted={!!reason && !done}>{label}</Body>
      {account.connected && account.name ? <Body muted numberOfLines={1} style={note}>{account.name}</Body> : null}
    </View>
  </>);
  // alignSelf stretch: the tick row is the row's full height (56), not just its content's; the content stays centred inside it.
  const rowStyle = { flex: 1, alignSelf: "stretch", flexDirection: "row", alignItems: "center", gap: theme.space.md } as const;

  return (
    <View style={{ gap: theme.space.xs, paddingBottom: below.length > 0 ? theme.space.md : 0 }}>
      <View testID={`post-row-${account.id}`} style={{ minHeight: theme.size.listRow, flexDirection: "row", alignItems: "center", gap: theme.space.md }}>
        {done ? (
          // Posted: a static mark, not a toggle.
          <View accessible accessibilityLabel={`${label}, posted`} style={rowStyle}>
            <Ionicons name="checkmark-circle-outline" size={ICON} color={theme.colors.accent} />
            {identity}
          </View>
        ) : (
          // A row held back by a validation message opens its options (when it has any) instead of unticking.
          <PressableScale accessibilityRole="checkbox" accessibilityLabel={label} accessibilityState={{ checked, disabled: !!reason || active }}
            disabled={!!reason || active} onPress={error && hasOptions(account.id) ? onOptions : onToggle} style={rowStyle}>
            {/* Gold = on (ticked); cream = can be ticked; muted = cannot. */}
            <Ionicons name={checked ? "checkbox-outline" : "square-outline"} size={ICON} color={reason ? theme.colors.textMuted : checked ? theme.colors.accent : theme.colors.text} />
            {identity}
          </PressableScale>
        )}
        {side}
      </View>
      {below}
    </View>
  );
}
