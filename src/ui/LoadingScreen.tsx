import { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from "react-native-reanimated";
import { Compass } from "@/src/theme/Compass";
import { theme } from "@/src/theme/theme";
import { Screen } from "./Screen";
import { useReducedMotion } from "./useReducedMotion";
import { Waves } from "./Waves";

const EXIT_MS = 300;

/** Animated brand screen shown over the app until it is ready; fades out when `leaving` turns true. */
export function LoadingScreen({ leaving, onGone }: { leaving: boolean; onGone: () => void }) {
  const reduced = useReducedMotion();
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
      <Screen style={{ alignItems: "center", justifyContent: "center" }}>
        <View style={{ alignItems: "center", gap: theme.space.lg }}>
          <Animated.View testID="loading-compass" style={spin}><Compass size={96} /></Animated.View>
          <Animated.View style={[{ alignItems: "center", gap: theme.space.sm }, up]}>
            {/* Font families fall back to the system font until the UI fonts finish loading. */}
            <Text style={{ fontFamily: theme.fonts.title, fontSize: 48, letterSpacing: 8, color: theme.colors.text }}>CLIPY</Text>
            <Text style={{ fontFamily: theme.fonts.bodySemi, fontSize: 11, letterSpacing: 3, color: theme.colors.accent }}>EDIT · SET SAIL · SHARE</Text>
          </Animated.View>
        </View>
        <Waves still={reduced} />
      </Screen>
    </Animated.View>
  );
}
