import Svg, { Circle, G, Polygon } from "react-native-svg";
import { useSurfaces } from "@/src/ui/tone";
import { theme } from "./theme";

/** Clipy's mark: a gold ring with a two-coloured needle — red to the north (the mark's own red, the same on navy and on cream), the text colour to the south; the ring is the gold as ink. `needleRotation` in degrees. */
export function Compass({ size = 24, needleRotation = 0 }: { size?: number; needleRotation?: number }) {
  const s = useSurfaces();
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" accessibilityLabel="Clipy compass">
      <Circle testID="compass-ring" cx={50} cy={50} r={44} stroke={s.accentInk} strokeWidth={6} fill="none" />
      <G rotation={needleRotation} origin="50, 50">
        <Polygon testID="compass-needle" points="50,14 60,50 40,50" fill={theme.colors.danger} />
        <Polygon testID="compass-needle" points="50,86 60,50 40,50" fill={s.text} />
      </G>
    </Svg>
  );
}
