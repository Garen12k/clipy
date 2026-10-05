import { Ionicons } from "@expo/vector-icons";
import { View } from "react-native";
import { theme } from "@/src/theme/theme";
import { PressableScale } from "./PressableScale";
import { Body } from "./Text";

/** The column a tile takes in a row (use it with `tilesStartX`). */
export const TILE_WIDTH = theme.size.toolColumn;

type Props = { label: string; selected: boolean; onPress: () => void; icon?: keyof typeof Ionicons.glyphMap; /** On the box (the ring is on it). */ boxTestID?: string;
  /** The box's content when there is no icon (a shape, a sparkline). */ children?: React.ReactNode };

/** A pick-one tile for a strip's row: a rounded box over a one-line label. Selected = the gold ring, a lighter box, a gold label, 3 % larger. */
export function Tile({ label, selected, onPress, icon, boxTestID, children }: Props) {
  const tint = selected ? theme.colors.accent : theme.colors.text;
  return (
    <PressableScale lifted={selected} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected }} onPress={onPress}
      style={{ alignItems: "center", width: TILE_WIDTH, paddingVertical: theme.space.xs, gap: theme.space.xs }}>
      <View testID={boxTestID} style={[{ width: theme.size.toolBox, height: theme.size.toolBox, borderRadius: theme.radius.box, alignItems: "center", justifyContent: "center",
        backgroundColor: selected ? theme.elevation.lifted : theme.elevation.tile }, selected ? theme.ring : theme.ringClear]}>
        {icon ? <Ionicons name={icon} size={theme.size.icon.md} color={tint} /> : children}
      </View>
      <Body numberOfLines={1} weight={selected ? "semi" : "regular"} style={{ color: tint, fontSize: theme.type.micro }}>{label}</Body>
    </PressableScale>
  );
}
