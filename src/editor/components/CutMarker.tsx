import { Pressable, View } from "react-native";
import { clipDuration, clipStartTimes, timeToX } from "@/src/editor/model/timeline";
import { useEditorStore } from "@/src/editor/store";
import { theme } from "@/src/theme/theme";
import { CLIP_AREA_HEIGHT } from "../timelineLayout";

type Props = { index: number; pixelsPerSecond: number; onPress?: (index: number) => void };

/** Diamond marker drawn on the cut after clip `index`, when that cut carries a transition. */
export function CutMarker({ index, pixelsPerSecond, onPress }: Props) {
  const project = useEditorStore((s) => s.project);
  if (!project) return null;
  const starts = clipStartTimes(project);
  const clip = project.clips[index];
  if (!clip) return null;
  const cutTime = starts[index] + clipDuration(clip);
  const left = timeToX(cutTime, pixelsPerSecond) - 6;
  const top = (CLIP_AREA_HEIGHT - 12) / 2;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Transition after clip ${index}`}
      onPress={() => onPress?.(index)}
      style={{ position: "absolute", left, top, width: 12, height: 12 }}
    >
      <View style={{ width: 12, height: 12, backgroundColor: theme.colors.highlight, transform: [{ rotate: "45deg" }] }} />
    </Pressable>
  );
}
