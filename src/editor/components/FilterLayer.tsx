import { View } from "react-native";
import { FILTERS } from "@/src/editor/effects";
import type { FilterId } from "@/src/editor/model/types";

/**
 * Preview-only approximation of a filter: tint, desaturation (grey) and brightness (black/white) layers,
 * each scaled by the clip's filter strength (`intensity`, 0–1).
 */
export function FilterLayer({ filter, intensity = 1 }: { filter: FilterId | null; intensity?: number }) {
  if (!filter || filter === "none" || !(intensity > 0)) return null;
  const f = FILTERS[filter].preview;
  const full = { position: "absolute" as const, inset: 0 };
  return (
    <View pointerEvents="none" style={full}>
      <View testID="filter-desaturate" style={{ ...full, backgroundColor: "#808080", opacity: Math.max(0, Math.min(0.55, 0.55 * (1 - f.saturation))) * intensity }} />
      <View testID="filter-tint" style={{ ...full, backgroundColor: f.tint, opacity: f.tintOpacity * intensity }} />
      <View testID="filter-brightness" style={{ ...full, backgroundColor: f.brightness >= 0 ? "#FFFFFF" : "#000000", opacity: Math.abs(f.brightness) * intensity }} />
    </View>
  );
}
