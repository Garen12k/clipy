import { Icon } from "@/src/ui/Icon";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { clipStartTimes, timeToX } from "@/src/editor/model/timeline";
import { moveClip } from "@/src/editor/model/ops";
import { useEditorStore } from "@/src/editor/store";
import { theme } from "@/src/theme/theme";
import { indexFromDrop, stripWidth } from "../timelineLayout";

const HANDLE_W = 28;

/** Grip shown on the selected clip. Long-press then drag horizontally to move the clip. */
export function ReorderHandle({ clipId, index }: { clipId: string; index: number }) {
  const tx = useSharedValue(0);
  const lifted = useSharedValue(false);
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: tx.value }, { scale: lifted.value ? 1.05 : 1 }], opacity: lifted.value ? 0.85 : 1 }));

  const pan = Gesture.Pan().activateAfterLongPress(250)
    .onStart(() => { lifted.value = true; })
    .onUpdate((e) => { tx.value = e.translationX; })
    .onEnd((e) => {
      const s = useEditorStore.getState();
      if (!s.project) return;
      const pps = s.pixelsPerSecond;
      const starts = clipStartTimes(s.project).map((t) => timeToX(t, pps));
      const widths = s.project.clips.map((c) => stripWidth(c, pps));
      const center = starts[index] + widths[index] / 2 + e.translationX;
      const to = indexFromDrop(starts, widths, center);
      s.apply((p) => moveClip(p, clipId, to));
    })
    .onFinalize(() => { lifted.value = false; tx.value = withTiming(0, { duration: 150 }); })
    .runOnJS(true);

  return (
    <GestureDetector gesture={pan}>
      <Animated.View accessibilityLabel="Move clip" style={[{ position: "absolute", bottom: 4, alignSelf: "center", left: "50%", marginLeft: -HANDLE_W / 2, width: HANDLE_W, height: 20, borderRadius: 10, backgroundColor: theme.colors.accent, alignItems: "center", justifyContent: "center" }, style]}>
        <Icon plain name="reorder-two-outline" size={16} color={theme.colors.onAccent} />
      </Animated.View>
    </GestureDetector>
  );
}
