import { View } from "react-native";
import { theme } from "@/src/theme/theme";
import { Icon, type IconName } from "./Icon";
import { useSurfaces } from "./tone";
import { PressableScale } from "./PressableScale";
import { Body } from "./Text";

/** The column a tile takes in a row (use it with `tilesStartX`). */
export const TILE_WIDTH = theme.size.toolColumn;

type Props = { label: string; selected: boolean; onPress: () => void; icon?: IconName; /** On the box (the ring is on it). */ boxTestID?: string;
  /** The box's content when there is no icon (a shape, a sparkline). */ children?: React.ReactNode };

/**
 * A pick-one tile for a strip's row: a rounded box over a one-line label. Picked = the 2-pt gold ring on a soft gold tint (`picked`), the
 * label WHITE and semibold, 3 % larger — never colour alone. The glyph in the box keeps the gold, like the shapes and meters tools draw there.
 */
export function Tile({ label, selected, onPress, icon, boxTestID, children }: Props) {
  const s = useSurfaces();
  const glyph = selected ? theme.colors.accent : theme.colors.text;
  return (
    <PressableScale lifted={selected} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected }} onPress={onPress}
      style={{ alignItems: "center", width: TILE_WIDTH, paddingVertical: theme.space.xs, gap: theme.space.xs }}>
      <View testID={boxTestID} style={[{ width: theme.size.toolBox, height: theme.size.toolBox, borderRadius: theme.radius.box, alignItems: "center", justifyContent: "center",
        backgroundColor: selected ? s.picked : s.tile }, selected ? theme.ring : theme.ringClear]}>
        {icon ? <Icon name={icon} size={theme.size.icon.md} color={glyph} /> : children}
      </View>
      <Body numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85} weight={selected ? "semi" : "regular"} style={{ color: theme.colors.text, fontSize: theme.type.small }}>{label}</Body>
    </PressableScale>
  );
}
