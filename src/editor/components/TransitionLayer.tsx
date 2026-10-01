import { View } from "react-native";
import { transitionProgress } from "@/src/editor/model/timeline";
import { useEditorStore } from "@/src/editor/store";

/** Black fade overlay across a transition window, peaking at the cut. */
export function TransitionLayer() {
  const project = useEditorStore((s) => s.project);
  const playhead = useEditorStore((s) => s.playhead);
  const tp = project ? transitionProgress(project, playhead) : null;
  if (!tp) return null;
  return (
    <View pointerEvents="none" testID="transition-layer" style={{ position: "absolute", inset: 0, backgroundColor: "#000000", opacity: 1 - Math.abs(2 * tp.progress - 1) }} />
  );
}
