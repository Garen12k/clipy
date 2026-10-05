import { useState } from "react";
import { resetClipAdjust, setAdjustForAllClips, setClipAdjust } from "@/src/editor/model/ops";
import { ADJUST_KEYS, ADJUST_RANGE, isNeutralAdjust, type AdjustKey } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { useIsLayer, useItemClip } from "@/src/editor/useItem";
import { Chip } from "@/src/ui/Chip";
import { haptic } from "@/src/ui/haptics";
import { QuietButton } from "@/src/ui/QuietButton";
import { Slider } from "@/src/ui/Slider";
import { StripSlider, StripTiles, ToolStrip } from "@/src/ui/ToolStrip";

export const ADJUST_LABELS: Record<AdjustKey, string> = {
  brightness: "Brightness", contrast: "Contrast", saturation: "Saturation", exposure: "Exposure", temperature: "Warmth", tint: "Tint",
  highlights: "Highlights", shadows: "Shadows", sharpen: "Sharpen", vignette: "Vignette", fade: "Fade", grain: "Grain",
};
/** 0: a two-sided control ticks lightly when a drag reaches or passes its centre. */
const CENTRE = [0] as const;

export function AdjustSheet({ clipId, visible, onClose }: { clipId: string | null; visible: boolean; onClose: () => void }) {
  const clip = useItemClip(clipId);
  const layer = useIsLayer(clipId);
  const { apply, beginTransaction, applyTransient } = useEditorStore.getState();
  const [key, setKey] = useState<AdjustKey>("brightness");
  if (!clip) return null;
  const [lo, hi] = ADJUST_RANGE[key];
  const value = clip.adjust[key];
  const pct = Math.round(value * 100);
  const neutral = isNeutralAdjust(clip.adjust);

  return (
    <ToolStrip visible={visible} onClose={onClose} title="Adjust"
      // "Apply to all" writes the main clips: it is not offered for a layer.
      action={layer ? undefined : { label: "Apply to all", onPress: () => { haptic("light"); apply((p) => setAdjustForAllClips(p, clip.adjust)); } }}>
      <StripTiles>
        {ADJUST_KEYS.map((k) => (
          <Chip key={k} label={clip.adjust[k] !== 0 ? `${ADJUST_LABELS[k]} •` : ADJUST_LABELS[k]} accessibilityLabel={ADJUST_LABELS[k]} selected={key === k} onPress={() => setKey(k)} />
        ))}
      </StripTiles>
      <StripSlider label={ADJUST_LABELS[key]} value={`${lo < 0 && pct > 0 ? "+" : ""}${pct}`}
        trailing={<QuietButton compact title="Reset" disabled={neutral} onPress={() => { haptic("light"); apply((p) => resetClipAdjust(p, clip.id)); }} />}>
        <Slider
          testID="adjust-slider"
          minimumValue={lo} maximumValue={hi} step={0.01}
          value={value}
          onSlidingStart={beginTransaction}
          onValueChange={(v) => applyTransient((p) => setClipAdjust(p, clip.id, { [key]: v }))}
          detents={lo < 0 ? CENTRE : undefined}
        />
      </StripSlider>
    </ToolStrip>
  );
}
