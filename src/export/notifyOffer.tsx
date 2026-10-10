import { useCallback, useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { askToNotify, notifyAvailable, notifyState } from "@/src/lib/notify";
import { theme } from "@/src/theme/theme";
import { Card } from "@/src/ui/Card";
import { Icon } from "@/src/ui/Icon";
import { SecondaryButton } from "@/src/ui/SecondaryButton";
import { Body } from "@/src/ui/Text";
import { useSurfaces } from "@/src/ui/tone";

/** The offer's words. It promises only what the app does: a notice when an export finishes. */
export const NOTIFY_OFFER = { title: "Know when it's done", body: "Clipy can tell you when an export finishes.", action: "Continue" } as const;

/**
 * Whether the Export screen offers notifications. The PHONE is the memory — nothing is stored: the offer is there only while iOS
 * says the question has never been asked (and the installed app has notifications at all). It is read when the screen opens and
 * again whenever an export starts or ends, so it is known before the first exporting frame. `accept` — the card's Continue —
 * asks ONCE (Apple's own alert) and the card goes at once, whatever the answer; `kept` then holds the card's room until the export
 * ends, so nothing above or below moves. Ignored, the card may be offered again on a later export.
 */
export function useNotifyOffer(exporting: boolean): { shown: boolean; kept: boolean; accept: () => void } {
  const [open, setOpen] = useState(false);
  const [answered, setAnswered] = useState(false);
  const asking = useRef(false);
  useEffect(() => {
    if (!notifyAvailable()) return;
    let live = true;
    if (!exporting) setAnswered(false);
    notifyState().then((state) => { if (live) setOpen(state === "notAsked"); }, () => {});
    return () => { live = false; };
  }, [exporting]);
  const accept = useCallback(() => {
    if (asking.current) return;
    asking.current = true;
    setAnswered(true);
    askToNotify().then(() => {}, () => {}).then(() => { asking.current = false; });
  }, []);
  return { shown: exporting && open && !answered, kept: exporting && open && answered, accept };
}

/** The offer: a bell, what it is for, and one grey Continue — never gold, and no "Not Now" (leaving it alone is the no). */
export function NotifyOfferCard({ onContinue }: { onContinue: () => void }) {
  const s = useSurfaces();
  return (
    <Card testID="export-notify-offer" style={{ gap: theme.space.md }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: theme.space.md }}>
        <Icon accessibilityElementsHidden importantForAccessibility="no-hide-descendants" name="notifications-outline" size={theme.size.icon.lg} color={s.text} />
        <View style={{ flex: 1, gap: theme.space.xs }}>
          <Body weight="semi">{NOTIFY_OFFER.title}</Body>
          <Body muted style={{ fontSize: theme.type.small }}>{NOTIFY_OFFER.body}</Body>
        </View>
      </View>
      <SecondaryButton title={NOTIFY_OFFER.action} onPress={onContinue} />
    </Card>
  );
}
