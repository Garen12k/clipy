import { View } from "react-native";
import { theme } from "@/src/theme/theme";
import { Icon } from "@/src/ui/Icon";
import { PressableScale } from "@/src/ui/PressableScale";
import { Body } from "@/src/ui/Text";
import { largeContent } from "@/src/ui/textScale";
import { TILE_WIDTH } from "@/src/ui/Tile";
import { ringOf, useSurfaces } from "@/src/ui/tone";

/**
 * One of the owner's styles in Quick Edit: the kit Tile's box and ring, but its label is a NAME the owner typed — one line that
 * ends in dots at every size, never shrunk (the kit Tile's label shrinks to fit, which is only for the app's own short words).
 * Touch and hold opens Rename / Delete.
 */
export function StyleTile({ name, selected, onPress, onLongPress }: { name: string; selected: boolean; onPress: () => void; onLongPress: () => void }) {
  const s = useSurfaces();
  return (
    <PressableScale lifted={selected} accessibilityRole="button" accessibilityLabel={name} accessibilityHint="Touch and hold to rename or delete." accessibilityState={{ selected }}
      onPress={onPress} onLongPress={onLongPress} {...largeContent(name)} style={{ alignItems: "center", width: TILE_WIDTH, paddingVertical: theme.space.xs, gap: theme.space.xs }}>
      <View style={[{ width: theme.size.toolBox, height: theme.size.toolBox, borderRadius: theme.radius.box, alignItems: "center", justifyContent: "center",
        backgroundColor: selected ? s.picked : s.tile }, selected ? ringOf(s) : theme.ringClear]}>
        <Icon name="star-outline" size={theme.size.icon.md} color={selected ? s.accentInk : s.text} />
      </View>
      <Body numberOfLines={1} weight={selected ? "semi" : "regular"} style={{ color: s.text, fontSize: theme.type.small, maxWidth: TILE_WIDTH }}>{name}</Body>
    </PressableScale>
  );
}
