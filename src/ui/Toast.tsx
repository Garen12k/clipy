import { useEffect } from "react";
import { View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue } from "react-native-reanimated";
import { create } from "zustand";
import { theme } from "@/src/theme/theme";
import { useSurfaces } from "./tone";
import { enterTo, fadeOutTo } from "./motion";
import { Body } from "./Text";
import { isReducedMotion } from "./useReducedMotion";

type ToastState = { message: string | null; stamp: number; show: (message: string) => void; clear: () => void };
export const useToast = create<ToastState>((set) => ({
  message: null, stamp: 0,
  show: (message) => set({ message, stamp: Date.now() }),
  clear: () => set({ message: null }),
}));

export const TOAST_MS = 2500;
const SHIFT = theme.motion.enterShift;

/** Mount once near the root of a screen. Shows the latest message for 2.5 s: it eases in, and out over its last moments (timers, not animation callbacks). */
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
