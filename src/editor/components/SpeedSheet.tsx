import Slider from "@react-native-community/slider";
import { View } from "react-native";
import { formatSpeed } from "@/src/lib/format";
import { setClipSpeed } from "@/src/editor/model/ops";
import { SPEED_LIMITS } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { theme } from "@/src/theme/theme";
import { Chip } from "@/src/ui/Chip";
import { Sheet } from "@/src/ui/Sheet";
import { Body } from "@/src/ui/Text";

const PRESETS = [0.25, 0.5, 1, 1.5, 2, 4];

export function SpeedSheet({ clipId, visible, onClose }: { clipId: string | null; visible: boolean; onClose: () => void }) {
  const clip = useEditorStore((s) => s.project?.clips.find((c) => c.id === clipId) ?? null);
  const { apply, beginTransaction, applyTransient } = useEditorStore.getState();
  if (!clip) return null;
  return (
    <Sheet visible={visible} onClose={onClose} title="Speed">
      <Body muted>Current speed: {formatSpeed(clip.speed)}</Body>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.space.sm }}>
        {PRESETS.map((s) => <Chip key={s} label={formatSpeed(s)} selected={clip.speed === s} onPress={() => apply((p) => setClipSpeed(p, clip.id, s))} />)}
      </View>
      <Slider testID="speed-slider" minimumValue={SPEED_LIMITS[0]} maximumValue={SPEED_LIMITS[1]} step={0.05} value={clip.speed}
        onSlidingStart={beginTransaction} onValueChange={(v) => applyTransient((p) => setClipSpeed(p, clip.id, v))}
        minimumTrackTintColor={theme.colors.accent} maximumTrackTintColor={theme.colors.surfaceAlt} thumbTintColor={theme.colors.highlight} />
      <Body muted style={{ fontSize: 12 }}>Audio keeps its pitch in the exported video.</Body>
    </Sheet>
  );
}
