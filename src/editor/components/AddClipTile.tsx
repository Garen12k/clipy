import { Ionicons } from "@expo/vector-icons";
import { ActivityIndicator, View } from "react-native";
import { theme } from "@/src/theme/theme";
import { PressableScale } from "@/src/ui/PressableScale";
import { CLIP_AREA_HEIGHT, STRIP_HEIGHT } from "../timelineLayout";
import { useClipMedia } from "../useClipMedia";

const ADD_TILE_SIZE = STRIP_HEIGHT;

/**
 * The "+" after the last clip. Absolutely positioned at `left` (inside the timeline's trailing padding), so it never
 * changes the scroll content's width or the time ↔ x maths.
 */
export function AddClipTile({ left }: { left: number }) {
  const { addMedia, busy } = useClipMedia();
  return (
    <View testID="add-clips-tile" style={{ position: "absolute", left, top: (CLIP_AREA_HEIGHT - ADD_TILE_SIZE) / 2, width: ADD_TILE_SIZE, height: ADD_TILE_SIZE }}>
      <PressableScale accessibilityRole="button" accessibilityLabel="Add clips" accessibilityState={{ busy, disabled: busy }} disabled={busy}
        onPress={() => { void addMedia(); }}
        style={{ flex: 1, borderRadius: theme.radius.card, backgroundColor: theme.colors.surfaceAlt, borderWidth: 1, borderColor: theme.colors.hairline,
          alignItems: "center", justifyContent: "center" }}>
        {busy ? <ActivityIndicator testID="add-clips-busy" color={theme.colors.accent} /> : <Ionicons name="add" size={28} color={theme.colors.text} />}
      </PressableScale>
    </View>
  );
}
