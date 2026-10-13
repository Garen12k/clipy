import { View } from "react-native";
import { theme } from "@/src/theme/theme";
import { Icon, type IconName } from "./Icon";
import { ringOf, useSurfaces } from "./tone";
import { PressableScale } from "./PressableScale";
import { Body } from "./Text";
import { largeContent } from "./textScale";

/** The column a tile takes in a row (use it with `tilesStartX`). */
export const TILE_WIDTH = theme.size.toolColumn;

type Props = { label: string; selected: boolean; onPress: () => void; icon?: IconName; /** On the box (the ring is on it). */ boxTestID?: string;
  /** The box's content when there is no icon (a shape, a sparkline). */ children?: React.ReactNode;
  /** A small muted second line under the label — a SHORT FIXED label the app writes ("720p · 30 · Small"), never a name: one line, which may shrink to fit above the default text size (the kit's `fit`). Absent = the tile as it always was. */ note?: string;
  /** VoiceOver's hint. */ hint?: string; /** What VoiceOver reads instead of the label alone. */ accessibilityLabel?: string;
  /** An equal share of its row instead of the fixed column, and the row's height: the tiles of a row are equally tall. */ fill?: boolean };

/**
 * A pick-one tile for a strip's row: a rounded box over a one-line label. Picked = the 2-pt gold ring on a soft gold tint (`picked`), the
 * label WHITE and semibold, 3 % larger — never colour alone. The glyph in the box keeps the gold, like the shapes and meters tools draw there.
 */
export function Tile({ label, selected, onPress, icon, boxTestID, children, note, hint, accessibilityLabel, fill }: Props) {
  const s = useSurfaces();
  const glyph = selected ? s.accentInk : s.text;
  return (
    <PressableScale lifted={selected} accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? label} accessibilityHint={hint} accessibilityState={{ selected }} onPress={onPress} {...largeContent(label)}
      style={{ alignItems: "center", ...(fill ? { flex: 1, alignSelf: "stretch" as const } : { width: TILE_WIDTH }), paddingVertical: theme.space.xs, gap: theme.space.xs }}>
      <View testID={boxTestID} style={[{ width: theme.size.toolBox, height: theme.size.toolBox, borderRadius: theme.radius.box, alignItems: "center", justifyContent: "center",
        backgroundColor: selected ? s.picked : s.tile }, selected ? ringOf(s) : theme.ringClear]}>
        {icon ? <Icon name={icon} size={theme.size.icon.md} color={glyph} /> : children}
      </View>
      <Body numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85} weight={selected ? "semi" : "regular"} style={{ color: s.text, fontSize: theme.type.small }}>{label}</Body>
      {note === undefined ? null : <Body fit muted numberOfLines={1} style={{ fontSize: theme.type.micro, textAlign: "center" }}>{note}</Body>}
    </PressableScale>
  );
}
