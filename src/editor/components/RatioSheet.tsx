import { setAspectRatio } from "@/src/editor/model/ops";
import { ASPECT_RATIOS } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { Chip } from "@/src/ui/Chip";
import { StripNote, StripTiles, ToolStrip } from "@/src/ui/ToolStrip";

export function RatioSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const current = useEditorStore((s) => s.project?.aspectRatio);
  const apply = useEditorStore((s) => s.apply);
  return (
    <ToolStrip visible={visible} onClose={onClose} title="Aspect ratio" note={<StripNote numberOfLines={2}>9:16 for TikTok, Reels and Shorts. 1:1 for feeds. 16:9 for YouTube.</StripNote>}>
      <StripTiles>
        {ASPECT_RATIOS.map((r) => <Chip key={r} label={r} selected={r === current} onPress={() => { apply((p) => setAspectRatio(p, r)); onClose(); }} />)}
      </StripTiles>
    </ToolStrip>
  );
}
