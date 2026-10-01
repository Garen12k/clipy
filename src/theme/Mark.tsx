import Svg, { Line } from "react-native-svg";
import { theme } from "./theme";

type Props = { size?: number; color?: string };

/** Three slashes: Clipy's original mark. */
export function Mark({ size = 24, color = theme.colors.accent }: Props) {
  const w = size, h = size, sw = Math.max(2, size / 8);
  const xs = [0.2, 0.45, 0.7];
  return (
    <Svg width={w} height={h} viewBox="0 0 100 100" accessibilityLabel="Clipy mark">
      {xs.map((x, i) => (
        <Line key={i} testID="mark-slash" x1={x * 100} y1={15} x2={x * 100 + 22} y2={85}
          stroke={color} strokeWidth={sw * 4} strokeLinecap="round" />
      ))}
    </Svg>
  );
}
