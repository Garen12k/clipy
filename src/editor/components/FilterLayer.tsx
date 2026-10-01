import { View } from "react-native";
import { FILTERS } from "@/src/editor/effects";
import type { FilterId } from "@/src/editor/model/types";

/** Preview-only approximation of a filter: tint, desaturation (grey) and brightness (black/white) layers. */
export function FilterLayer({ filter }: { filter: FilterId | null }) {
  if (!filter || filter === "none") return null;
  const f = FILTERS[filter].preview;
  const full = { position: "absolute" as const, inset: 0 };
  return (
    <View pointerEvents="none" style={full}>
      <View testID="filter-desaturate" style={{ ...full, backgroundColor: "#808080", opacity: Math.max(0, Math.min(0.55, 0.55 * (1 - f.saturation))) }} />
      <View testID="filter-tint" style={{ ...full, backgroundColor: f.tint, opacity: f.tintOpacity }} />
      <View testID="filter-brightness" style={{ ...full, backgroundColor: f.brightness >= 0 ? "#FFFFFF" : "#000000", opacity: Math.abs(f.brightness) }} />
    </View>
  );
}
