import Slider from "@react-native-community/slider";
import { View } from "react-native";
import { TRANSITIONS } from "@/src/editor/effects";
import { setTransition, transitionCap } from "@/src/editor/model/ops";
import { TRANSITION_LIMITS, TRANSITION_TYPES } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { theme } from "@/src/theme/theme";
import { Chip } from "@/src/ui/Chip";
import { Sheet } from "@/src/ui/Sheet";
import { Body } from "@/src/ui/Text";

type Props = { clipIndex: number; visible: boolean; onClose: () => void };

export function TransitionSheet({ clipIndex, visible, onClose }: Props) {
  const project = useEditorStore((s) => s.project);
  const { apply, beginTransaction, applyTransient } = useEditorStore.getState();
  if (!project) return null;
  const clip = project.clips[clipIndex];
  if (!clip) return null;

  if (clipIndex >= project.clips.length - 1) {
    return (
      <Sheet visible={visible} onClose={onClose} title="Transition">
        <Body muted>No clip after this one</Body>
      </Sheet>
    );
  }

  const cap = transitionCap(project, clipIndex);
  const current = clip.transitionOut;

  return (
    <Sheet visible={visible} onClose={onClose} title="Transition">
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.space.sm }}>
        {TRANSITION_TYPES.map((type) => (
          <Chip
            key={type}
            label={TRANSITIONS[type].label}
            selected={current.type === type}
            onPress={() => apply((p) => setTransition(p, clip.id, { type, duration: type === "none" ? 0 : Math.min(0.5, cap) }))}
          />
        ))}
      </View>
      <Slider
        testID="transition-slider"
        minimumValue={TRANSITION_LIMITS.min}
        maximumValue={cap}
        step={0.05}
        value={current.duration}
        disabled={current.type === "none" || cap < 0.3}
        onSlidingStart={beginTransaction}
        onValueChange={(v) => applyTransient((p) => setTransition(p, clip.id, { type: current.type, duration: v }))}
        minimumTrackTintColor={theme.colors.accent} maximumTrackTintColor={theme.colors.surfaceAlt} thumbTintColor={theme.colors.accent}
      />
      <Body muted style={{ fontSize: 12 }}>{current.duration.toFixed(2)} s</Body>
      {cap < TRANSITION_LIMITS.min && <Body muted>Clips are too short for a transition here</Body>}
    </Sheet>
  );
}
