import { useEffect } from "react";
import { Image, Linking, ScrollView, Switch, useWindowDimensions, View } from "react-native";
import { theme } from "@/src/theme/theme";
import { DISABLED_OPACITY } from "@/src/ui/buttonStyle";
import { Icon } from "@/src/ui/Icon";
import { PressableScale } from "@/src/ui/PressableScale";
import { QuietButton } from "@/src/ui/QuietButton";
import { Segmented } from "@/src/ui/Segmented";
import { Spinner } from "@/src/ui/Spinner";
import { Body } from "@/src/ui/Text";
import { useToast } from "@/src/ui/Toast";
import { useSurfaces } from "@/src/ui/tone";
import type { TikTokPrivacy } from "../api";
import { ALLOW, BRAND_PICK, BRAND_SWITCH, BRANDED_CONTENT, BRANDED_PRIVATE, BRANDED_URL, CHECKING, consentLine, DRAFT_EXPLAINED, HOW_TO_SEND, isBranded, isDirect, labelLine, MUSIC_URL, NEEDS_PERMISSION_HERE, PRIVACY_LABEL, PRIVACY_ORDER, readDirect, reconcile, SEND_MODES, TAKES_MINUTES, TURNED_OFF, WHO_CAN_SEE, YOUR_BRAND } from "../tiktokDirect";
import type { CreatorState } from "../useCreatorInfo";

type Props = { options: Record<string, unknown>; onChange: (patch: Record<string, unknown>) => void; creator: CreatorState; onLoad: () => void; onReconnect: () => void };

const ROW = theme.size.touch;
const small = { fontSize: theme.type.small } as const;
/** The sheet's body may be taller than a small phone: it scrolls inside this share of the window. */
const BODY_SHARE = 0.68;
const open = (url: string) => { Linking.openURL(url).catch(() => useToast.getState().show("Couldn't open the link.")); };

/** One choice of "Who can see it": a radio row; the picked one is semibold with a check (never colour alone). Only "Only me" is ever disabled (branded content), and says why as its hint. */
function ChoiceRow({ value, picked, disabled, onPress }: { value: TikTokPrivacy; picked: boolean; disabled: boolean; onPress: () => void }) {
  const s = useSurfaces();
  return (
    <PressableScale accessibilityRole="radio" accessibilityLabel={PRIVACY_LABEL[value]} accessibilityHint={disabled ? BRANDED_PRIVATE : undefined} accessibilityState={{ checked: picked, disabled }} disabled={disabled} onPress={onPress}
      style={{ minHeight: ROW, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: theme.space.md, opacity: disabled ? DISABLED_OPACITY : 1 }}>
      <Body weight={picked ? "semi" : "regular"}>{PRIVACY_LABEL[value]}</Body>
      {picked ? <Icon testID={`tiktok-picked-${value}`} name="checkmark-circle-outline" size={theme.size.icon.md} color={s.accentInk} /> : null}
    </PressableScale>
  );
}

/** A labelled switch; `off` = the creator has it disabled in TikTok: greyed out, inert, and it says why (to VoiceOver as the hint). */
function SwitchRow({ label, value, off, onChange }: { label: string; value: boolean; off?: boolean; onChange: (next: boolean) => void }) {
  const s = useSurfaces();
  return (
    <View style={{ opacity: off ? DISABLED_OPACITY : 1 }}>
      <View style={{ minHeight: ROW, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: theme.space.md }}>
        <Body style={{ flex: 1 }}>{label}</Body>
        <Switch accessibilityLabel={label} accessibilityHint={off ? TURNED_OFF : undefined} accessibilityState={{ checked: value && !off, disabled: !!off }} value={value && !off} disabled={!!off} onValueChange={onChange} trackColor={{ true: s.accentInk }} />
      </View>
      {off ? <Body muted style={small}>{TURNED_OFF}</Body> : null}
    </View>
  );
}

/** A tick box, drawn as the Post screen's platform rows draw theirs. Only "Branded content" is ever disabled (Only me is picked), and says why as its hint. */
function TickRow({ label, checked, disabled, onPress }: { label: string; checked: boolean; disabled?: boolean; onPress: () => void }) {
  const s = useSurfaces();
  return (
    <PressableScale accessibilityRole="checkbox" accessibilityLabel={label} accessibilityHint={disabled ? BRANDED_PRIVATE : undefined} accessibilityState={{ checked, disabled: !!disabled }} disabled={disabled} onPress={onPress}
      style={{ minHeight: ROW, flexDirection: "row", alignItems: "center", gap: theme.space.md, opacity: disabled ? DISABLED_OPACITY : 1 }}>
      <Icon name={checked ? "checkbox-outline" : "square-outline"} size={theme.size.icon.lg} color={checked ? s.accentInk : s.text} />
      <Body>{label}</Body>
    </PressableScale>
  );
}

/**
 * The TikTok options: "How to send" first. A draft needs nothing else. "Post now" asks the server what the account may post each time
 * it is shown (`onLoad`), then offers ONLY what TikTok returned, with nothing chosen and every switch off until the user decides —
 * TikTok's rules for apps that post directly. Every change is one `onChange` patch; nothing is sent to TikTok from here.
 */
export function TikTokOptions({ options, onChange, creator, onLoad, onReconnect }: Props) {
  const { height } = useWindowDimensions();
  const direct = isDirect(options);
  const o = readDirect(options);
  // Asked when Post now is first shown and each time the user switches to it. Only `direct` starts it.
  useEffect(() => { if (direct) onLoad(); }, [direct]);
  // An answer is kept in the options (the Post screen validates against it) and drops only what is no longer possible: each new
  // answer, and the one already there when Post now is switched to (the fresh one asked above then replaces it).
  useEffect(() => { if (direct && creator.status === "ready") onChange(reconcile(readDirect(options), creator.info)); }, [direct, creator]);

  const info = creator.status === "ready" ? creator.info : null;
  const branded = isBranded(o);
  const label = labelLine(o);
  return (
    <ScrollView style={{ maxHeight: Math.round(height * BODY_SHARE) }} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: theme.space.lg }}>
      <View style={{ gap: theme.space.sm }}>
        <Body muted style={small}>{HOW_TO_SEND}</Body>
        <Segmented options={SEND_MODES} value={direct ? "direct" : "draft"} onChange={(mode) => onChange({ mode })} testID="tiktok-mode" />
      </View>
      {!direct ? <Body muted>{DRAFT_EXPLAINED}</Body> : null}
      {direct && (creator.status === "loading" || creator.status === "idle") ? <Spinner label={CHECKING} /> : null}
      {direct && creator.status === "needsPermission" ? (
        <View style={{ gap: theme.space.sm, alignItems: "flex-start" }}>
          <Body>{NEEDS_PERMISSION_HERE}</Body>
          <QuietButton title="Reconnect" accessibilityLabel="Reconnect TikTok" onPress={onReconnect} />
        </View>
      ) : null}
      {direct && creator.status === "error" ? (
        <View style={{ gap: theme.space.sm, alignItems: "flex-start" }}>
          <Body>{creator.message}</Body>
          <QuietButton title="Try Again" onPress={onLoad} />
        </View>
      ) : null}
      {direct && info ? (<>
        <View style={{ flexDirection: "row", alignItems: "center", gap: theme.space.md }}>
          {info.avatarUrl ? <Image testID="tiktok-avatar" source={{ uri: info.avatarUrl }} style={{ width: theme.size.avatar, height: theme.size.avatar, borderRadius: theme.radius.pill }} /> : null}
          <Body weight="semi" numberOfLines={1} style={{ flex: 1 }}>{`Posting to ${info.nickname}`}</Body>
        </View>
        <View accessibilityRole="radiogroup" accessibilityLabel={WHO_CAN_SEE}>
          <Body muted style={small}>{WHO_CAN_SEE}</Body>
          {PRIVACY_ORDER.filter((p) => info.privacyOptions.includes(p)).map((p) => (
            <ChoiceRow key={p} value={p} picked={o.privacy === p} disabled={p === "SELF_ONLY" && branded} onPress={() => onChange({ privacy: p })} />
          ))}
          {branded && info.privacyOptions.includes("SELF_ONLY") ? <Body muted style={small}>{BRANDED_PRIVATE}</Body> : null}
        </View>
        <View>
          <SwitchRow label={ALLOW.comment} value={o.allowComment} off={info.commentDisabled} onChange={(v) => onChange({ allowComment: v })} />
          <SwitchRow label={ALLOW.duet} value={o.allowDuet} off={info.duetDisabled} onChange={(v) => onChange({ allowDuet: v })} />
          <SwitchRow label={ALLOW.stitch} value={o.allowStitch} off={info.stitchDisabled} onChange={(v) => onChange({ allowStitch: v })} />
        </View>
        <View>
          <SwitchRow label={BRAND_SWITCH} value={o.brand} onChange={(v) => onChange({ brand: v })} />
          {o.brand ? (<>
            <TickRow label={YOUR_BRAND} checked={o.brandOrganic} onPress={() => onChange({ brandOrganic: !o.brandOrganic })} />
            <TickRow label={BRANDED_CONTENT} checked={o.brandContent} disabled={o.privacy === "SELF_ONLY" && !o.brandContent} onPress={() => onChange({ brandContent: !o.brandContent })} />
            {o.privacy === "SELF_ONLY" && !o.brandContent ? <Body muted style={small}>{BRANDED_PRIVATE}</Body> : null}
            {!o.brandOrganic && !o.brandContent ? <Body muted style={small}>{BRAND_PICK}</Body> : null}
            {label ? <Body muted style={small}>{label}</Body> : null}
          </>) : null}
        </View>
        <View style={{ gap: theme.space.xs, alignItems: "flex-start" }}>
          <Body muted style={small}>{consentLine(o)}</Body>
          <QuietButton compact title="Music Usage Confirmation" onPress={() => open(MUSIC_URL)} />
          {branded ? <QuietButton compact title="Branded Content Policy" onPress={() => open(BRANDED_URL)} /> : null}
          <Body muted style={small}>{TAKES_MINUTES}</Body>
        </View>
      </>) : null}
    </ScrollView>
  );
}
