import Slider from "@react-native-community/slider";
import { updateAudioTrackById } from "@/src/editor/model/ops";
import { AUDIO_LIMITS } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { theme } from "@/src/theme/theme";
import { StripNote, StripSlider, ToolStrip } from "@/src/ui/ToolStrip";

/** One slider for the selected audio track's volume (0–200 %); one undo step per drag. */
export function AudioVolumeSheet({ trackId, visible, onClose }: { trackId: string | null; visible: boolean; onClose: () => void }) {
  const track = useEditorStore((s) => s.project?.audioTracks.find((t) => t.id === trackId) ?? null);
  const { beginTransaction, applyTransient } = useEditorStore.getState();
  if (!track) return null;

  return (
    <ToolStrip visible={visible} onClose={onClose} title="Volume" note={<StripNote>Above 100% only applies in the exported video.</StripNote>}>
      <StripSlider label={`Volume ${Math.round(track.volume * 100)} %`}>
        <Slider
          testID="audio-volume"
          minimumValue={AUDIO_LIMITS.volume[0]} maximumValue={AUDIO_LIMITS.volume[1]} step={0.05}
          value={track.volume}
          onSlidingStart={beginTransaction}
          onValueChange={(v) => applyTransient((p) => updateAudioTrackById(p, track.id, { volume: v }))}
          minimumTrackTintColor={theme.colors.accent} maximumTrackTintColor={theme.colors.surfaceAlt} thumbTintColor={theme.colors.accent}
        />
      </StripSlider>
    </ToolStrip>
  );
}
