import { setClipOpacity } from "@/src/editor/model/ops";
import { useEditorStore } from "@/src/editor/store";
import { useItemClip } from "@/src/editor/useItem";
import { Slider } from "@/src/ui/Slider";
import { StripSlider, ToolStrip } from "@/src/ui/ToolStrip";

/** One slider for the selected clip's or layer's own opacity (0–1, shown as 0–100 %); one undo step per drag. */
export function OpacitySheet({ clipId, visible, onClose }: { clipId: string | null; visible: boolean; onClose: () => void }) {
  const clip = useItemClip(clipId);
  const { beginTransaction, applyTransient } = useEditorStore.getState();
  if (!clip) return null;

  return (
    <ToolStrip visible={visible} onClose={onClose} title="Opacity">
      <StripSlider label="Opacity" value={`${Math.round(clip.opacity * 100)} %`}>
        <Slider
          testID="opacity-slider"
          minimumValue={0} maximumValue={1} step={0.01}
          value={clip.opacity}
          onSlidingStart={beginTransaction}
          onValueChange={(v) => applyTransient((p) => setClipOpacity(p, clip.id, v))}
        />
      </StripSlider>
    </ToolStrip>
  );
}
