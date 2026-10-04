import { View } from "react-native";
import { timeToX } from "@/src/editor/model/timeline";
import { useEditorStore } from "@/src/editor/store";
import { theme } from "@/src/theme/theme";
import { useSnapGuide } from "../snapping";

/**
 * The thin line across the timeline at the time a dragged bar has snapped to. Out of the flow (it cannot widen the scroll content) and
 * the only subscriber of the guide's time: a snap re-renders this line, not the timeline.
 */
export function SnapGuide({ left, height }: { left: number; height: number }) {
  const time = useSnapGuide((s) => s.time);
  const pps = useEditorStore((s) => s.pixelsPerSecond);
  if (time === null) return null;
  return <View testID="snap-guide" pointerEvents="none" style={{ position: "absolute", left: left + timeToX(time, pps) - 0.5, top: 0, width: 1, height, backgroundColor: theme.colors.accent }} />;
}
