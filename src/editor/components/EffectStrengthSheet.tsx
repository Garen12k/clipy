import Slider from "@react-native-community/slider";
import { updateEffect } from "@/src/editor/model/ops";
import { useEditorStore } from "@/src/editor/store";
import { theme } from "@/src/theme/theme";
import { StripSlider, ToolStrip } from "@/src/ui/ToolStrip";

/** One slider for the selected effect's intensity (0–1, shown as 0–100); one undo step per drag. */
export function EffectStrengthSheet({ effectId, visible, onClose }: { effectId: string | null; visible: boolean; onClose: () => void }) {
  const effect = useEditorStore((s) => s.project?.effects.find((e) => e.id === effectId) ?? null);
  const { beginTransaction, applyTransient } = useEditorStore.getState();
  if (!effect) return null;

  return (
    <ToolStrip visible={visible} onClose={onClose} title="Strength">
      <StripSlider label={`Strength ${Math.round(effect.intensity * 100)}`}>
        <Slider
          testID="effect-strength"
          minimumValue={0} maximumValue={1} step={0.01}
          value={effect.intensity}
          onSlidingStart={beginTransaction}
          onValueChange={(v) => applyTransient((p) => updateEffect(p, effect.id, { intensity: v }))}
          minimumTrackTintColor={theme.colors.accent} maximumTrackTintColor={theme.colors.surfaceAlt} thumbTintColor={theme.colors.accent}
        />
      </StripSlider>
    </ToolStrip>
  );
}
