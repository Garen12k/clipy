import { useEffect, useRef } from "react";
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue } from "react-native-reanimated";
import { theme } from "@/src/theme/theme";
import { liftTo, pressTo } from "./motion";
import { isReducedMotion } from "./useReducedMotion";

const APressable = Animated.createAnimatedComponent(Pressable);
const LIFT = theme.motion.selectedScale - 1;
type Props = Omit<PressableProps, "style"> & { style?: StyleProp<ViewStyle>; /** The selected chip / tile sits 3 % larger. */ lifted?: boolean };

/**
 * THE pressable of the kit: it dips to 0.96 while held, and sits 3 % larger while `lifted` (the selected chip or tile).
 * Both are shared values set from the handlers / an effect — pressing never re-renders. Motion comes from motion.ts (Reduce Motion: no tween).
 */
export function PressableScale({ style, onPressIn, onPressOut, lifted = false, ...rest }: Props) {
  const press = useSharedValue(1);
  const lift = useSharedValue(lifted ? 1 : 0);
  const mounted = useRef(false);
  // Only a CHANGE of `lifted` animates: not the mount, not another re-render. The shared value is deliberately not a dependency:
  // it is stable on the device, but the Jest mock hands out a new one on every render, which would re-run this.
  useEffect(() => {
    if (!mounted.current) { mounted.current = true; return; }
    lift.value = liftTo(lifted, isReducedMotion());
  }, [lifted]);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: press.value * (1 + LIFT * lift.value) }] }));
  return (
    <APressable {...rest} style={[style, anim]}
      onPressIn={(e) => { press.value = pressTo(true, isReducedMotion()); onPressIn?.(e); }}
      onPressOut={(e) => { press.value = pressTo(false, isReducedMotion()); onPressOut?.(e); }} />
  );
}