import { Ionicons } from "@expo/vector-icons";
import Slider from "@react-native-community/slider";
import { Text, View } from "react-native";
import { ANIM_LIMITS, type AnimEdge } from "@/src/editor/model/types";
import type { IoniconName } from "@/src/editor/toolGroups";
import { theme } from "@/src/theme/theme";
import { PressableScale } from "@/src/ui/PressableScale";
import { Body } from "@/src/ui/Text";

const NONE_ICON: IoniconName = "ban-outline";
const clearRing = { borderWidth: theme.ring.borderWidth, borderColor: "transparent" };

function Tile({ label, icon, selected, onPress }: { label: string; icon: IoniconName; selected: boolean; onPress: () => void }) {
  return (
    <PressableScale accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected }} onPress={onPress}
      style={{ alignItems: "center", width: 68, paddingVertical: theme.space.xs }}>
      <View style={[{ width: 44, height: 44, borderRadius: theme.radius.tile + 5, alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.surfaceAlt }, selected ? theme.ring : clearRing]}>
        <Ionicons name={icon} size={20} color={selected ? theme.colors.accent : theme.colors.text} />
      </View>
      <Text numberOfLines={1} style={{ fontFamily: selected ? theme.fonts.bodySemi : theme.fonts.body, color: selected ? theme.colors.accent : theme.colors.text, fontSize: 11, marginTop: 4 }}>{label}</Text>
    </PressableScale>
  );
}

type TilesProps<T extends string> = { ids: readonly T[]; registry: Record<T, { label: string; icon: IoniconName }>; selected: T | null; onPick: (id: T | null) => void };

/** The grid shared by the animation sheets: "None" first, then one tile per id; the selected tile carries the gold ring. */
export function AnimationTiles<T extends string>({ ids, registry, selected, onPick }: TilesProps<T>) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", rowGap: theme.space.xs }}>
      <Tile label="None" icon={NONE_ICON} selected={selected === null} onPress={() => onPick(null)} />
      {ids.map((id) => <Tile key={id} label={registry[id].label} icon={registry[id].icon} selected={selected === id} onPress={() => onPick(id)} />)}
    </View>
  );
}

/** The duration an In / Out tile is picked with: the edge's current one, or the default when the edge is empty. */
export const edgeDuration = (edge: AnimEdge | null): number => edge?.duration ?? ANIM_LIMITS.defaultDuration;

/** "Length" slider under the In / Out tiles; disabled while the edge is None. The caller makes one undo step per drag. */
export function AnimationLength({ edge, onStart, onChange }: { edge: AnimEdge | null; onStart: () => void; onChange: (duration: number) => void }) {
  return (
    <>
      <Slider
        testID="animation-slider"
        minimumValue={ANIM_LIMITS.minDuration} maximumValue={ANIM_LIMITS.maxDuration} step={0.05}
        value={edgeDuration(edge)}
        disabled={!edge}
        onSlidingStart={onStart}
        onValueChange={onChange}
        minimumTrackTintColor={theme.colors.accent} maximumTrackTintColor={theme.colors.surfaceAlt} thumbTintColor={theme.colors.accent}
      />
      <Body muted style={{ fontSize: 12 }}>Length {edgeDuration(edge).toFixed(2)} s</Body>
    </>
  );
}
