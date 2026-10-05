import { Switch, View } from "react-native";
import { forClips, mainClipIds, setClipFade, setClipMuted, setClipVolume } from "@/src/editor/model/ops";
import { clipDuration } from "@/src/editor/model/timeline";
import { CLIP_VOLUME, isPhoto, type Project } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { useItemClip } from "@/src/editor/useItem";
import { theme } from "@/src/theme/theme";
import { Slider } from "@/src/ui/Slider";
import { Body } from "@/src/ui/Text";
import { StripNote, StripSlider, ToolStrip } from "@/src/ui/ToolStrip";
import { FadeSliders } from "./AudioFadeSheet";

/** 100 %: the slider ticks lightly when a drag reaches or passes it. */
const REST = [1] as const;

/** `clipIds` (multi-select): every change is written to all of these main clips (the ops skip photos); `clipId` is the clip whose values are shown. */
export function VolumeSheet({ clipId, clipIds, visible, onClose }: { clipId: string | null; clipIds?: string[]; visible: boolean; onClose: () => void }) {
  const clip = useItemClip(clipId);
  const count = useEditorStore((s) => (clipIds && s.project ? mainClipIds(s.project, clipIds).length : 0));
  const { apply, beginTransaction, applyTransient } = useEditorStore.getState();
  if (!clip) return null;
  /** One clip op on the shown clip, or on every clip of the multi-selection (one project out, so one undo step). */
  const write = (op: (p: Project, id: string) => Project) => (p: Project) => (clipIds ? forClips(p, clipIds, op) : op(p, clip.id));
  return (
    <ToolStrip visible={visible} onClose={onClose} title={clipIds ? `Volume · ${count} ${count === 1 ? "clip" : "clips"}` : "Volume"}
      note={<StripNote lines={2}>Above 100% only applies in the exported video.</StripNote>}>
      <StripSlider label="" value={`${Math.round(clip.volume * 100)}%`} labelWidth={48}
        trailing={(
          <View style={{ flexDirection: "row", alignItems: "center", gap: theme.space.sm }}>
            <Body style={{ fontSize: theme.type.small }}>Mute</Body>
            <Switch accessibilityLabel="Mute" value={clip.muted} onValueChange={(m) => apply(write((p, cid) => setClipMuted(p, cid, m)))} trackColor={{ true: theme.colors.accent }} />
          </View>
        )}>
        <Slider testID="volume-slider" minimumValue={CLIP_VOLUME[0]} maximumValue={CLIP_VOLUME[1]} value={clip.volume} step={0.05}
          onSlidingStart={beginTransaction} onValueChange={(v) => applyTransient(write((p, cid) => setClipVolume(p, cid, v)))} detents={REST} />
      </StripSlider>
      {/* A photo has no sound of its own to fade. A multi-selection has no fade sliders either: the clips' lengths differ. */}
      {!isPhoto(clip) && !clipIds && (
        <FadeSliders fadeIn={clip.fadeIn} fadeOut={clip.fadeOut} length={clipDuration(clip)}
          onStart={beginTransaction} onChange={(patch) => applyTransient((p) => setClipFade(p, clip.id, patch))} />
      )}
    </ToolStrip>
  );
}
