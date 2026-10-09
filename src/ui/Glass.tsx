import type { ReactNode } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import { GLASS, type GlassSide } from "@/src/theme/theme";
import { glassView } from "./systemGlass";

type Props = {
  /** Which side of the app this surface is on: its switch in `GLASS` (theme.ts) decides whether glass is used at all. */
  side: GlassSide;
  /** The solid colour drawn when there is no glass — a theme colour, never a literal. */
  color: string;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
  testID?: string;
};

/**
 * A surface that is system glass where that is switched on (`GLASS[side]`) and the phone can draw it, and otherwise the solid colour
 * it is given. The layout box is the same either way: the same `style` goes to whichever view is drawn. `GLASS` is off for both
 * sides, so today this is always the solid colour.
 */
export function Glass({ side, color, style, children, testID }: Props) {
  const GlassView = GLASS[side] ? glassView() : null;
  if (!GlassView) return <View testID={testID} style={[style, { backgroundColor: color }]}>{children}</View>;
  return <GlassView testID={testID} style={style} glassEffectStyle="regular">{children}</GlassView>;
}
