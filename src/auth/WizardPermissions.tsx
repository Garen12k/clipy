import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue } from "react-native-reanimated";
import { theme } from "@/src/theme/theme";
import { DISABLED_OPACITY } from "@/src/ui/buttonStyle";
import { Card } from "@/src/ui/Card";
import { Icon, type IconName } from "@/src/ui/Icon";
import { wizardRowTo } from "@/src/ui/motion";
import { QuietButton } from "@/src/ui/QuietButton";
import { Body } from "@/src/ui/Text";
import { useSurfaces } from "@/src/ui/tone";
import { isReducedMotion } from "@/src/ui/useReducedMotion";
import { askPermission, managePhotos, openSettings, PERMISSION_IDS, readPermission, type PermissionId, type PermissionState } from "./permissions";

/** The four rows of the wizard's third page: what is asked for, and the one line that says why. */
export const PERMISSION_ROWS: Record<PermissionId, { name: string; reason: string; icon: IconName }> = {
  photos: { name: "Photos and videos", reason: "To add your clips", icon: "image-outline" },
  microphone: { name: "Microphone", reason: "For voice-overs", icon: "mic-outline" },
  camera: { name: "Camera", reason: "To film new clips", icon: "camera-outline" },
  notifications: { name: "Notifications", reason: "When an export is done", icon: "notifications-outline" },
};
export const SETTINGS_NOTE = "You can change these any time in Settings.";
const SHIFT = theme.motion.enterShift;
const hidden = { accessibilityElementsHidden: true, importantForAccessibility: "no-hide-descendants" } as const;

type States = Record<PermissionId, PermissionState | null>;
const UNREAD: States = { photos: null, microphone: null, camera: null, notifications: null };

/**
 * The state of the four, READ from the phone: when the page is drawn, after every question, and whenever the app comes back to the
 * front (from Settings, or from the system's own alert or picker). `null` = not read yet. One question at a time: while one of
 * Apple's alerts is up, a second tap asks nothing.
 */
function usePermissions() {
  const [states, setStates] = useState<States>(UNREAD);
  const alive = useRef(true);
  const read = useCallback(async () => {
    const found = await Promise.all(PERMISSION_IDS.map(readPermission));
    if (alive.current) setStates({ photos: found[0], microphone: found[1], camera: found[2], notifications: found[3] });
  }, []);
  useEffect(() => {
    alive.current = true;
    read();
    const sub = AppState.addEventListener("change", (now) => { if (now === "active") read(); });
    return () => { alive.current = false; sub.remove(); };
  }, [read]);

  const asking = useRef(false);
  const once = useCallback(async (work: () => Promise<void>) => {
    if (asking.current) return;
    asking.current = true;
    try { await work(); } finally { asking.current = false; }
  }, []);
  const allow = useCallback((id: PermissionId) => once(async () => {
    const answer = await askPermission(id);
    if (alive.current) setStates((s) => ({ ...s, [id]: answer }));
    await read();
  }), [once, read]);
  const manage = useCallback(() => once(async () => { await managePhotos(); await read(); }), [once, read]);
  return { states, allow, manage };
}

/** Page 3's rows and the line under them. `play`: the page has become the current one — the rows come in, once. */
export function PermissionRows({ play }: { play: boolean }) {
  const { states, allow, manage } = usePermissions();
  return (
    <View style={{ gap: theme.space.md }}>
      <Card testID="wizard-permissions" style={{ paddingVertical: theme.space.xs }}>
        {PERMISSION_IDS.map((id, i) => <Row key={id} id={id} index={i} play={play} state={states[id]} onAllow={() => { allow(id); }} onManage={() => { manage(); }} />)}
      </Card>
      <Body muted style={{ fontSize: theme.type.label, textAlign: "center" }}>{SETTINGS_NOTE}</Body>
    </View>
  );
}

function Row({ id, index, play, state, onAllow, onManage }: { id: PermissionId; index: number; play: boolean; state: PermissionState | null; onAllow: () => void; onManage: () => void }) {
  const s = useSurfaces();
  const { name, reason, icon } = PERMISSION_ROWS[id];
  const p = useSharedValue(isReducedMotion() ? 1 : 0);
  const played = useRef(false);
  // `play` alone: a shared value is never a dependency (the Jest mock hands out a new one on every render).
  useEffect(() => { if (!play || played.current) return; played.current = true; p.value = wizardRowTo(isReducedMotion(), index); }, [play]);
  const enter = useAnimatedStyle(() => ({ opacity: p.value, transform: [{ translateY: (1 - p.value) * SHIFT }] }));
  const off = state === "unavailable";
  const lower = name.toLowerCase();
  return (
    <Animated.View style={enter}>
      {/* A row the installed app cannot ask for is shown, dimmed, with no action: it is said, not hidden. */}
      <View testID={`permission-${id}`} style={{ minHeight: theme.size.listRow, flexDirection: "row", alignItems: "center", gap: theme.space.md, paddingVertical: theme.space.sm,
        borderTopWidth: index > 0 ? 1 : 0, borderTopColor: s.separator, opacity: off ? DISABLED_OPACITY : 1 }}>
        <Icon name={icon} size={theme.size.icon.lg} color={s.text} {...hidden} />
        {/* One element for VoiceOver: the name and why. What the phone says now, or the action, follows as its own element. */}
        <View accessible accessibilityLabel={`${name}. ${reason}.`} style={{ flex: 1, gap: theme.space.xs }}>
          <Body weight="semi">{name}</Body>
          <Body muted style={{ fontSize: theme.type.label }}>{reason}</Body>
        </View>
        <View testID={`permission-${id}-state`} style={{ flexDirection: "row", alignItems: "center", gap: theme.space.xs, minHeight: theme.size.touch }}>
          {state === "notAsked" ? <QuietButton compact title="Allow" accessibilityLabel={`Allow ${lower}`} onPress={onAllow} />
            : state === "granted" ? <><Icon name="checkmark-circle-outline" size={theme.size.icon.md} color={s.accentInk} {...hidden} /><Body>Allowed</Body></>
            : state === "limited" ? <><Body muted>Limited</Body><QuietButton compact title="Manage" accessibilityLabel="Manage which photos Clipy can use" onPress={onManage} /></>
            : state === "denied" ? <QuietButton compact title="Open Settings" accessibilityLabel={`Open Settings to allow ${lower}`} onPress={openSettings} />
            : state === "unavailable" ? <Body muted>Not available</Body>
            : null}
        </View>
      </View>
    </Animated.View>
  );
}
