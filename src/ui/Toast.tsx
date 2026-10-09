import { useEffect } from "react";
import { View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue } from "react-native-reanimated";
import { create } from "zustand";
import { theme } from "@/src/theme/theme";
import { useSurfaces } from "./tone";
import { enterTo, fadeOutTo } from "./motion";
import { Body } from "./Text";
import { isReducedMotion } from "./useReducedMotion";

/** What a message is: `done` confirms something that just happened, `problem` says something went wrong. Without one it is plain information. */
export type MessageKind = "done" | "problem";
/**
 * Read only by the editor's message bar (src/editor/components/MessageBar.tsx): its leading symbol, and whether it offers Undo — asked
 * only for a message that confirms ONE undo step the same tap has just applied. `ToastHost` ignores both.
 */
export type MessageOptions = { kind?: MessageKind; undo?: true };
type ToastState = { message: string | null; stamp: number; kind: MessageKind | null; undo: boolean; show: (message: string, options?: MessageOptions) => void; clear: () => void };
export const useToast = create<ToastState>((set) => ({
  message: null, stamp: 0, kind: null, undo: false,
  show: (message, options) => set({ message, stamp: Date.now(), kind: options?.kind ?? null, undo: options?.undo === true }),
  clear: () => set({ message: null, kind: null, undo: false }),
}));

export const TOAST_MS = 2500;
const SHIFT = theme.motion.enterShift;

/** Mount once near the root of a screen (the editor mounts its message bar instead). Shows the latest message for 2.5 s: it eases in, and out over its last moments (timers, not animation callbacks). */
export function ToastHost() {
  const { message, stamp, clear } = useToast();
  const s = useSurfaces();
  const o = useSharedValue(0);
  useEffect(() => {
    if (!message) return;
    const reduced = isReducedMotion();
    o.value = 0;
    o.value = enterTo(reduced);
    const out = reduced ? null : setTimeout(() => { o.value = fadeOutTo(false); }, TOAST_MS - theme.motion.fast);
    const t = setTimeout(clear, TOAST_MS);
    return () => { if (out) clearTimeout(out); clearTimeout(t); };
  }, [message, stamp, clear]);   // not `o`: stable on the device, a new object per render under the Jest mock
  const anim = useAnimatedStyle(() => ({ opacity: o.value, transform: [{ translateY: (1 - o.value) * SHIFT }] }));
  if (!message) return null;
  return (
    <View pointerEvents="none" style={{ position: "absolute", left: theme.space.gutter, right: theme.space.gutter, bottom: 100, alignItems: "center" }}>
      <Animated.View testID="toast" style={[{ backgroundColor: s.tile, borderColor: s.separator, borderWidth: 1, borderRadius: theme.radius.pill, paddingVertical: theme.space.md, paddingHorizontal: theme.space.lg }, anim]}>
        <Body>{message}</Body>
      </Animated.View>
    </View>
  );
}
