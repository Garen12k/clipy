import Slider from "@react-native-community/slider";
import { useState } from "react";
import { ScrollView } from "react-native";
import { resetClipAdjust, setAdjustForAllClips, setClipAdjust } from "@/src/editor/model/ops";
import { ADJUST_KEYS, ADJUST_RANGE, isNeutralAdjust, type AdjustKey } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { theme } from "@/src/theme/theme";
import { Chip } from "@/src/ui/Chip";
import { haptic } from "@/src/ui/haptics";
import { SecondaryButton } from "@/src/ui/SecondaryButton";
import { Sheet } from "@/src/ui/Sheet";
import { Body } from "@/src/ui/Text";

export const ADJUST_LABELS: Record<AdjustKey, string> = {
  brightness: "Brightness", contrast: "Contrast", saturation: "Saturation", exposure: "Exposure", temperature: "Warmth", tint: "Tint",
  highlights: "Highlights", shadows: "Shadows", sharpen: "Sharpen", vignette: "Vignette", fade: "Fade", grain: "Grain",
};

export function AdjustSheet({ clipId, visible, onClose }: { clipId: string | null; visible: boolean; onClose: () => void }) {
  const clip = useEditorStore((s) => s.project?.clips.find((c) => c.id === clipId) ?? null);
  const { apply, beginTransaction, applyTransient } = useEditorStore.getState();
  const [key, setKey] = useState<AdjustKey>("brightness");
  if (!clip) return null;
  const [lo, hi] = ADJUST_RANGE[key];
  const value = clip.adjust[key];
  const pct = Math.round(value * 100);
  const neutral = isNeutralAdjust(clip.adjust);

  return (
    <Sheet visible={visible} onClose={onClose} title="Adjust" action={{ label: "Apply to all", onPress: () => { haptic("light"); apply((p) => setAdjustForAllClips(p, clip.adjust)); } }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: theme.space.sm }}>
        {ADJUST_KEYS.map((k) => (
          <Chip key={k} label={clip.adjust[k] !== 0 ? `${ADJUST_LABELS[k]} •` : ADJUST_LABELS[k]} accessibilityLabel={ADJUST_LABELS[k]} selected={key === k} onPress={() => setKey(k)} />
        ))}
      </ScrollView>
      <Slider
        testID="adjust-slider"
        minimumValue={lo} maximumValue={hi} step={0.01}
        value={value}
        onSlidingStart={beginTransaction}
        onValueChange={(v) => applyTransient((p) => setClipAdjust(p, clip.id, { [key]: v }))}
        minimumTrackTintColor={theme.colors.accent} maximumTrackTintColor={theme.colors.surfaceAlt} thumbTintColor={theme.colors.accent}
      />
      <Body muted style={{ fontSize: 12 }}>{ADJUST_LABELS[key]} {lo < 0 && pct > 0 ? "+" : ""}{pct}</Body>
      <SecondaryButton title="Reset" disabled={neutral} onPress={() => { haptic("light"); apply((p) => resetClipAdjust(p, clip.id)); }} />
    </Sheet>
  );
}
