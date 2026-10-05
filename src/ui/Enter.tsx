import { useEffect } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue } from "react-native-reanimated";
import { theme } from "@/src/theme/theme";
import { enterTo } from "./motion";
import { isReducedMotion } from "./useReducedMotion";

const SHIFT = theme.motion.enterShift;
type Props = { children: React.ReactNode; style?: StyleProp<ViewStyle>; /** Where it comes from: below ("y", default) or the right ("x"). */ axis?: "x" | "y"; testID?: string };

/**
 * Fades its content in and slides it 8 pt into place, ONCE, when it mounts (key it to replay). Opacity and transform only, on the
 * UI thread; a re-render or a prop change never replays it, and it subscribes to nothing. With Reduce Motion the content is simply there.
 * It is a plain wrapper for layout: give it the explicit height (or the width share) its content had. Never put it around the preview.
 */
export function EnterView({ children, style, axis = "y", testID }: Props) {
  const p = useSharedValue(isReducedMotion() ? 1 : 0);
  // Mount only — an empty dependency list on purpose (the Jest mock's shared value is a new object on every render).
  useEffect(() => { p.value = enterTo(isReducedMotion()); }, []);
  const anim = useAnimatedStyle(() => {
    const d = (1 - p.value) * SHIFT;
    return { opacity: p.value, transform: [axis === "x" ? { translateX: d } : { translateY: d }] };
  });
  return <Animated.View testID={testID} style={[style, anim]}>{children}</Animated.View>;
}
