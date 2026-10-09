import { View } from "react-native";
import { theme } from "@/src/theme/theme";
import { useSurfaces } from "./tone";

/** The longer side of the icon, in points. */
export const RATIO_SHAPE_SIZE = theme.size.icon.lg;
const LINE = 1.5, CORNER = 2;

type Props = {
  /** Width / height of the frame it stands for. */ aspect: number;
  /** The gold of a selected tile. */ selected?: boolean;
  /** A dashed outline: the shape is not fixed (Auto follows the first clip). */ dashed?: boolean;
};

/** A small outlined rectangle drawn at a frame's shape: the icon of an aspect-ratio choice. Its longer side is always RATIO_SHAPE_SIZE. */
export function RatioShape({ aspect, selected = false, dashed = false }: Props) {
  const s = useSurfaces();
  const a = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  return (
    <View testID="ratio-shape" style={{ width: a >= 1 ? RATIO_SHAPE_SIZE : RATIO_SHAPE_SIZE * a, height: a >= 1 ? RATIO_SHAPE_SIZE / a : RATIO_SHAPE_SIZE,
      borderWidth: LINE, borderRadius: CORNER, borderStyle: dashed ? "dashed" : "solid", borderColor: selected ? s.accentInk : s.text }} />
  );
}
