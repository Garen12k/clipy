import { Icon, type IconName } from "@/src/ui/Icon";
import { useEffect } from "react";
import { AccessibilityInfo, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MESSAGE, messageAnchor } from "@/src/editor/messageBar";
import { useEditorStore } from "@/src/editor/store";
import { useToolStrip } from "@/src/editor/toolStrip";
import { theme } from "@/src/theme/theme";
import { useKeyboard } from "@/src/ui/keyboard";
import { enterTo, fadeOutTo } from "@/src/ui/motion";
import { QuietButton } from "@/src/ui/QuietButton";
import { Body } from "@/src/ui/Text";
import { TOAST_MS, useToast, type MessageKind } from "@/src/ui/Toast";
import { usePanelPresence } from "@/src/ui/ToolPanel";
import { useStripPresence } from "@/src/ui/ToolStrip";
import { isReducedMotion } from "@/src/ui/useReducedMotion";

const SHIFT = theme.motion.enterShift;
/** The leading symbol says the kind — never the colour alone. */
const SYMBOL: Record<MessageKind | "plain", IconName> = { done: "checkmark-circle-outline", problem: "alert-circle-outline", plain: "information-circle-outline" };
const gone = () => { if (useToast.getState().message !== null) useToast.getState().clear(); };

/**
 * The editor's messages: a rounded bar just above whatever the bottom area shows (`messageAnchor`), in place of the toast. Mount it
 * once, as the LAST child of the editor's Screen — a sibling of the layout, never an ancestor of the preview or the timeline; it is
 * absolutely placed, so it moves and resizes nothing. It shows what `useToast().show(message, { kind, undo })` was given: a symbol
 * for the kind, the sentence on one or two lines, and — only when asked — Undo.
 * It takes touches ONLY on Undo: the bar and its anchor are `box-none` and the words are `none`, so a tap anywhere else reaches what
 * lies beneath. Undo calls the store's `undo()` once and the bar is gone.
 * It stays 2.5 s, or `MESSAGE.undoMs` with Undo (timers, not animation callbacks); a new message takes its place and starts again.
 * It goes at once when the project's history changes (a new undo step, an undo, a redo — so its Undo can never undo another step),
 * when playback starts, when a tool opens or closes, when another project is loaded and when the editor is left.
 * Only the bar itself eases in and out (opacity and a small shift, through motion.ts); with Reduce Motion it is simply there.
 */
export function MessageBar() {
  const { message, stamp, kind, undo, clear } = useToast();
  const panel = usePanelPresence((s) => s.count > 0);
  const strip = useStripPresence((s) => s.count > 0);
  const keyboard = useKeyboard((s) => s.height);
  const multi = useEditorStore((s) => s.multiSelect !== null);
  const insets = useSafeAreaInsets();
  const o = useSharedValue(0);
  useEffect(() => {
    if (!message) return;
    const reduced = isReducedMotion();
    const life = undo ? MESSAGE.undoMs : TOAST_MS;
    o.value = 0;
    o.value = enterTo(reduced);
    AccessibilityInfo.announceForAccessibility(message);
    const out = reduced ? null : setTimeout(() => { o.value = fadeOutTo(false); }, life - theme.motion.fast);
    const t = setTimeout(clear, life);
    return () => { if (out) clearTimeout(out); clearTimeout(t); };
  }, [message, stamp, undo, clear]);   // not `o`: stable on the device, a new object per render under the Jest mock
  // What makes a message stale. Store subscriptions, so they run in the same call as the change — a message said right after it stays.
  useEffect(() => {
    const offEditor = useEditorStore.subscribe((s, was) => {
      if (s.past !== was.past || s.future !== was.future || (s.isPlaying && !was.isPlaying) || s.project?.id !== was.project?.id) gone();
    });
    const offTool = useToolStrip.subscribe((s, was) => { if ((s.open?.id ?? null) !== (was.open?.id ?? null)) gone(); });
    return () => { offEditor(); offTool(); gone(); };
  }, []);
  const anim = useAnimatedStyle(() => ({ opacity: o.value, transform: [{ translateY: (1 - o.value) * SHIFT }] }));
  if (!message) return null;
  const { bottom, side } = messageAnchor({ panel, strip, keyboard, multi, insetBottom: insets.bottom });
  const onUndo = () => {
    const now = useToast.getState();
    if (now.message === null || !now.undo) return;
    clear();
    useEditorStore.getState().undo();
  };
  return (
    <View testID="message-anchor" pointerEvents="box-none" style={{ position: "absolute", left: side, right: side, bottom }}>
      <Animated.View testID="message-bar" pointerEvents="box-none"
        style={[{ minHeight: MESSAGE.minHeight, flexDirection: "row", alignItems: "center", gap: theme.space.xs, paddingVertical: MESSAGE.pad, paddingLeft: theme.space.md, paddingRight: undo ? theme.space.xs : theme.space.md,
          borderRadius: theme.radius.card, backgroundColor: theme.elevation.lifted }, anim]}>
        <View testID="message-words" pointerEvents="none" style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: theme.space.sm }}>
          <Icon testID={`message-symbol-${kind ?? "plain"}`} name={SYMBOL[kind ?? "plain"]} size={theme.size.icon.md} color={theme.colors.text} />
          <Body numberOfLines={2} style={{ flex: 1 }}>{message}</Body>
        </View>
        {undo ? <QuietButton compact title="Undo" onPress={onUndo} /> : null}
      </Animated.View>
    </View>
  );
}
