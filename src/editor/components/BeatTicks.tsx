import { View } from "react-native";
import { timeToX } from "@/src/editor/model/timeline";
import { useEditorStore } from "@/src/editor/store";
import { theme } from "@/src/theme/theme";
import { BEAT_BAND } from "../timelineMarks";

const NONE: number[] = [];
const TICK_W = 2, TICK_H = BEAT_BAND.height;

/**
 * Beat markers as small ticks right above the clips, under the time ruler (`BEAT_BAND`). Purely decorative: the layer has no size and takes no touches,
 * and every tick is out of the flow, so the scroll content's width is untouched.
 */
export function BeatTicks() {
  const markers = useEditorStore((s) => s.project?.beatMarkers ?? NONE);
  const pps = useEditorStore((s) => s.pixelsPerSecond);
  return (
    <View testID="beat-ticks" pointerEvents="none" style={{ position: "absolute", left: 0, top: 0, width: 0, height: 0 }}>
      {markers.map((m) => (
        <View key={m} testID="beat-tick" style={{ position: "absolute", left: timeToX(m, pps) - TICK_W / 2, top: BEAT_BAND.top, width: TICK_W, height: TICK_H, backgroundColor: theme.colors.accent }} />
      ))}
    </View>
  );
}
