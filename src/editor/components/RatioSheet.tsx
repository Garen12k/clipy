import { useMemo } from "react";
import { setAspectRatio } from "@/src/editor/model/ops";
import { ASPECT_RATIOS, aspectLabel, frameAspect } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { RatioShape } from "@/src/ui/RatioShape";
import { Tile, TILE_WIDTH } from "@/src/ui/Tile";
import { StripNote, StripTiles, ToolStrip, tilesStartX } from "@/src/ui/ToolStrip";

/** The frame's shape: nine tiles (Auto first), one undo step per pick. The strip stays open so shapes can be tried one after another; ✓ closes it. */
export function RatioSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const current = useEditorStore((s) => s.project?.aspectRatio);
  const clips = useEditorStore((s) => s.project?.clips);
  const apply = useEditorStore((s) => s.apply);
  // Where the row starts: the selected tile in view. Worked out when the strip opens — NOT on every pick: a
  // ScrollView applies a changed contentOffset at once, and the row must not move under the finger.
  const startX = useMemo(
    () => tilesStartX(current ? Math.max(0, ASPECT_RATIOS.indexOf(current)) : 0, TILE_WIDTH),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visible],
  );
  return (
    <ToolStrip visible={visible} onClose={onClose} title="Aspect ratio" note={<StripNote numberOfLines={2}>Auto fits your first clip. 9:16 for TikTok, Reels and Shorts. 16:9 for YouTube.</StripNote>}>
      <StripTiles initialX={startX}>
        {ASPECT_RATIOS.map((id) => (
          <Tile key={id} label={aspectLabel(id)} selected={id === current} boxTestID={`ratio-tile-${id}`} onPress={() => apply((p) => setAspectRatio(p, id))}>
            {/* Each tile draws the frame it would give this project: Auto shows the first clip's shape. */}
            <RatioShape aspect={frameAspect({ aspectRatio: id, clips: clips ?? [] })} selected={id === current} dashed={id === "auto"} />
          </Tile>
        ))}
      </StripTiles>
    </ToolStrip>
  );
}
