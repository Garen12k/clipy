import { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from "react-native-reanimated";
import { Compass } from "@/src/theme/Compass";
import { theme } from "@/src/theme/theme";
import { Screen } from "./Screen";
import { useSurfaces } from "./tone";
import { useReducedMotion } from "./useReducedMotion";
import { Waves } from "./Waves";

const EXIT_MS = 300;
/** The wordmark's size. The welcome screen, which can follow this one, draws the name with the same number. */
export const WORDMARK = { size: 48 } as const;

/** Animated brand screen shown over the app until it is ready; fades out when `leaving` turns true. */
export function LoadingScreen({ leaving, onGone }: { leaving: boolean; onGone: () => void }) {
  const reduced = useReducedMotion();
  const s = useSurfaces();
  const needle = useSharedValue(reduced ? 0 : -14), rise = useSharedValue(0), opacity = useSharedValue(1);

  useEffect(() => {
    rise.value = withDelay(150, withTiming(1, { duration: 500 }));
    // Reduce Motion: stop any running swing and hold the needle upright; only the fades remain.
    if (reduced) { cancelAnimation(needle); needle.value = 0; return; }
    needle.value = withRepeat(withSequence(
      withTiming(18, { duration: 1300, easing: Easing.inOut(Easing.quad) }), withTiming(-14, { duration: 1300, easing: Easing.inOut(Easing.quad) })), -1);
  }, [reduced, needle, rise]);

  // A timer (not an animation callback) ends the screen, so the hand-off cannot hang if an animation is skipped.
  useEffect(() => {
    if (!leaving) return;
    opacity.value = withTiming(0, { duration: EXIT_MS });
    const t = setTimeout(onGone, EXIT_MS);
    return () => clearTimeout(t);
  }, [leaving, onGone, opacity]);

  const fade = useAnimatedStyle(() => ({ opacity: opacity.value }));
  const spin = useAnimatedStyle(() => ({ transform: [{ rotate: `${needle.value}deg` }] }));
  const up = useAnimatedStyle(() => ({ opacity: rise.value, transform: [{ translateY: (1 - rise.value) * 8 }] }));

  return (
    <Animated.View style={[StyleSheet.absoluteFill, fade]} pointerEvents={leaving ? "none" : "auto"}>
      <Screen edges={[]} style={{ alignItems: "center", justifyContent: "center" }}>
        <View style={{ alignItems: "center", gap: theme.space.lg }}>
          <Animated.View testID="loading-compass" style={spin}><Compass size={96} /></Animated.View>
          <Animated.View style={[{ alignItems: "center", gap: theme.space.sm }, up]}>
            <Text style={{ fontSize: WORDMARK.size, fontWeight: theme.weight.bold, color: s.text }}>Clipy</Text>
            <Text style={{ fontSize: theme.type.label, fontWeight: theme.weight.semi, color: s.muted }}>Edit · Set sail · Share</Text>
          </Animated.View>
        </View>
        <Waves still={reduced} />
      </Screen>
    </Animated.View>
  );
}
