import { View } from "react-native";
import { timeToX } from "@/src/editor/model/timeline";
import { useEditorStore } from "@/src/editor/store";
import { theme } from "@/src/theme/theme";

const NONE: number[] = [];
const TICK_W = 2, TICK_H = 10;

/**
 * Beat markers as small ticks along the top of the clip area. Purely decorative: the layer has no size and takes no touches,
 * and every tick is out of the flow, so the scroll content's width is untouched.
 */
export function BeatTicks() {
  const markers = useEditorStore((s) => s.project?.beatMarkers ?? NONE);
  const pps = useEditorStore((s) => s.pixelsPerSecond);
  return (
    <View testID="beat-ticks" pointerEvents="none" style={{ position: "absolute", left: 0, top: 0, width: 0, height: 0 }}>
      {markers.map((m) => (
        <View key={m} testID="beat-tick" style={{ position: "absolute", left: timeToX(m, pps) - TICK_W / 2, top: 0, width: TICK_W, height: TICK_H, backgroundColor: theme.colors.accent }} />
      ))}
    </View>
  );
}
