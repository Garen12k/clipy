import Slider from "@react-native-community/slider";
import { Switch, View } from "react-native";
import { setClipFade, setClipMuted, setClipVolume } from "@/src/editor/model/ops";
import { clipDuration } from "@/src/editor/model/timeline";
import { CLIP_VOLUME, isPhoto } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { useItemClip } from "@/src/editor/useItem";
import { theme } from "@/src/theme/theme";
import { Sheet } from "@/src/ui/Sheet";
import { Body } from "@/src/ui/Text";
import { FadeSliders } from "./AudioFadeSheet";

export function VolumeSheet({ clipId, visible, onClose }: { clipId: string | null; visible: boolean; onClose: () => void }) {
  const clip = useItemClip(clipId);
  const { apply, beginTransaction, applyTransient } = useEditorStore.getState();
  if (!clip) return null;
  return (
    <Sheet visible={visible} onClose={onClose} title="Volume">
      <Body muted>{Math.round(clip.volume * 100)}%</Body>
      <Slider testID="volume-slider" minimumValue={CLIP_VOLUME[0]} maximumValue={CLIP_VOLUME[1]} value={clip.volume} step={0.05}
        onSlidingStart={beginTransaction} onValueChange={(v) => applyTransient((p) => setClipVolume(p, clip.id, v))}
        minimumTrackTintColor={theme.colors.accent} maximumTrackTintColor={theme.colors.surfaceAlt} thumbTintColor={theme.colors.accent} />
      <Body muted style={{ fontSize: 12 }}>Above 100% only applies in the exported video.</Body>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Body>Mute</Body>
        <Switch accessibilityLabel="Mute" value={clip.muted} onValueChange={(m) => apply((p) => setClipMuted(p, clip.id, m))} trackColor={{ true: theme.colors.accent }} />
      </View>
      {/* A photo has no sound of its own to fade. */}
      {!isPhoto(clip) && (
        <FadeSliders fadeIn={clip.fadeIn} fadeOut={clip.fadeOut} length={clipDuration(clip)}
          onStart={beginTransaction} onChange={(patch) => applyTransient((p) => setClipFade(p, clip.id, patch))} />
      )}
    </Sheet>
  );
}
