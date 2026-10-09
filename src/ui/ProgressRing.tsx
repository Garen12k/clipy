import { Ionicons } from "@expo/vector-icons";
import { View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { theme } from "@/src/theme/theme";
import { Title } from "./Text";

/** Circular progress, 0..1. Shows the percentage, or a check when `done`. */
export function ProgressRing({ progress, size = 120, done }: { progress: number; size?: number; done?: boolean }) {
  const p = Math.min(1, Math.max(0, progress));
  const stroke = 8, r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const pct = Math.round(p * 100);
  return (
    <View accessible accessibilityRole="progressbar" accessibilityLabel={done ? "Done" : undefined} accessibilityValue={{ min: 0, max: 100, now: done ? 100 : pct }} style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Svg width={size} height={size} style={{ position: "absolute", transform: [{ rotate: "-90deg" }] }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={theme.colors.surfaceAlt} strokeWidth={stroke} fill="none" />
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={theme.colors.accent} strokeWidth={stroke} fill="none" strokeLinecap="round"
          strokeDasharray={`${c} ${c}`} strokeDashoffset={c * (1 - (done ? 1 : p))} />
      </Svg>
      {done ? <Ionicons name="checkmark" size={size * 0.4} color={theme.colors.accent} /> : <Title size={size * 0.22} style={{ fontVariant: ["tabular-nums"] }}>{`${pct}%`}</Title>}
    </View>
  );
}