import { TRANSITIONS } from "@/src/editor/effects";
import { setTransition, transitionCap } from "@/src/editor/model/ops";
import { TRANSITION_LIMITS, TRANSITION_TYPES } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { theme } from "@/src/theme/theme";
import { Chip } from "@/src/ui/Chip";
import { haptic } from "@/src/ui/haptics";
import { Slider } from "@/src/ui/Slider";
import { Body } from "@/src/ui/Text";
import { StripNote, StripSlider, StripTiles, ToolStrip } from "@/src/ui/ToolStrip";

type Props = { clipIndex: number; visible: boolean; onClose: () => void };

export function TransitionSheet({ clipIndex, visible, onClose }: Props) {
  const project = useEditorStore((s) => s.project);
  const { apply, beginTransaction, applyTransient } = useEditorStore.getState();
  if (!project) return null;
  const clip = project.clips[clipIndex];
  if (!clip) return null;

  if (clipIndex >= project.clips.length - 1) {
    return (
      <ToolStrip visible={visible} onClose={onClose} title="Transition">
        <Body muted style={{ paddingHorizontal: theme.space.gutter }}>No clip after this one</Body>
      </ToolStrip>
    );
  }

  const cap = transitionCap(project, clipIndex);
  const current = clip.transitionOut;

  return (
    <ToolStrip visible={visible} onClose={onClose} title="Transition" note={cap < TRANSITION_LIMITS.min ? <StripNote lines={2}>Clips are too short for a transition here</StripNote> : undefined}>
      <StripTiles>
        {TRANSITION_TYPES.map((type) => (
          <Chip
            key={type}
            label={TRANSITIONS[type].label}
            selected={current.type === type}
            onPress={() => { if (current.type !== type) haptic("light"); apply((p) => setTransition(p, clip.id, { type, duration: type === "none" ? 0 : Math.min(0.5, cap) })); }}
          />
        ))}
      </StripTiles>
      <StripSlider label="" value={`${current.duration.toFixed(2)} s`}>
        <Slider
          testID="transition-slider"
          minimumValue={TRANSITION_LIMITS.min}
          maximumValue={cap}
          step={0.05}
          value={current.duration}
          disabled={current.type === "none" || cap < 0.3}
          onSlidingStart={beginTransaction}
          onValueChange={(v) => applyTransient((p) => setTransition(p, clip.id, { type: current.type, duration: v }))}
        />
      </StripSlider>
    </ToolStrip>
  );
}
