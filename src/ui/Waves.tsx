import { useEffect } from "react";
import { useWindowDimensions, View } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";
import { theme } from "@/src/theme/theme";

const PERIOD = 120, H = 54;
function wavePath(width: number): string {
  let d = `M0 ${H} L0 18`;
  for (let x = 0; x < width; x += PERIOD) d += ` Q${x + PERIOD / 4} 0 ${x + PERIOD / 2} 18 Q${x + (3 * PERIOD) / 4} 36 ${x + PERIOD} 18`;
  return `${d} L${width} ${H} Z`;
}

function Layer({ color, duration, bottom, opacity, still }: { color: string; duration: number; bottom: number; opacity: number; still: boolean }) {
  const { width } = useWindowDimensions();
  const w = Math.ceil(width / PERIOD + 2) * PERIOD;
  const x = useSharedValue(0);
  useEffect(() => { if (!still) x.value = withRepeat(withTiming(-PERIOD, { duration, easing: Easing.linear }), -1); }, [still, duration, x]);
  const anim = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  return (
    <Animated.View style={[{ position: "absolute", left: 0, bottom, opacity }, anim]}>
      <Svg width={w} height={H}><Path d={wavePath(w)} fill={color} /></Svg>
    </Animated.View>
  );
}

/** Two rolling wave layers pinned to the bottom of their parent. */
export function Waves({ still = false }: { still?: boolean }) {
  return (
    <View pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: H + 12, overflow: "hidden" }}>
      <Layer color={theme.colors.seaLight} duration={5000} bottom={8} opacity={0.55} still={still} />
      <Layer color={theme.colors.sea} duration={3000} bottom={0} opacity={1} still={still} />
    </View>
  );
}
