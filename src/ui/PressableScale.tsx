import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import { theme } from "@/src/theme/theme";

const APressable = Animated.createAnimatedComponent(Pressable);
type Props = Omit<PressableProps, "style"> & { style?: StyleProp<ViewStyle> };

/** Pressable that dips to 0.96 while held. */
export function PressableScale({ style, onPressIn, onPressOut, ...rest }: Props) {
  const s = useSharedValue(1);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return (
    <APressable {...rest} style={[style, anim]}
      onPressIn={(e) => { s.value = withTiming(0.96, { duration: theme.motion.press }); onPressIn?.(e); }}
      onPressOut={(e) => { s.value = withSpring(1); onPressOut?.(e); }} />
  );
}