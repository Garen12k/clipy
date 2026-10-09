import Svg, { Circle, G, Polygon } from "react-native-svg";
import { theme } from "./theme";

/** Clipy's mark: a gold ring with a red/white needle. `needleRotation` in degrees. */
export function Compass({ size = 24, needleRotation = 0 }: { size?: number; needleRotation?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" accessibilityLabel="Clipy compass">
      <Circle testID="compass-ring" cx={50} cy={50} r={44} stroke={theme.colors.accent} strokeWidth={6} fill="none" />
      <G rotation={needleRotation} origin="50, 50">
        <Polygon testID="compass-needle" points="50,14 60,50 40,50" fill={theme.colors.danger} />
        <Polygon testID="compass-needle" points="50,86 60,50 40,50" fill={theme.colors.text} />
      </G>
    </Svg>
  );
}
