import { View } from "react-native";
import { BLENDS } from "@/src/editor/effects";
import { setClipBlend } from "@/src/editor/model/ops";
import { BLEND_IDS, type BlendId } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { useItemClip } from "@/src/editor/useItem";
import { theme } from "@/src/theme/theme";
import { haptic } from "@/src/ui/haptics";
import { Tile, TILE_WIDTH } from "@/src/ui/Tile";
import { StripNote, StripTiles, ToolStrip, tilesStartX } from "@/src/ui/ToolStrip";

/** The two overlapping squares inside a tile's box (points). */
const SQUARE = 18;
const OVERLAP = 8;

/** How the selected layer mixes with what is below it: six tiles, one undo step per pick. Only layers have a blend (the tool is only on a layer's bar). */
export function BlendSheet({ clipId, visible, onClose }: { clipId: string | null; visible: boolean; onClose: () => void }) {
  const clip = useItemClip(clipId);
  const apply = useEditorStore((s) => s.apply);
  if (!clip) return null;
  const pick = (id: BlendId) => {
    const project = useEditorStore.getState().project;
    // Already the blend, or refused (a main clip has none): no buzz, no undo step.
    if (!project || setClipBlend(project, clip.id, id) === project) return;
    haptic("light");
    apply((p) => setClipBlend(p, clip.id, id));
  };

  return (
    <ToolStrip visible={visible} onClose={onClose} title="Blend" note={<StripNote>Shows in the exported video</StripNote>}>
      <StripTiles initialX={tilesStartX(BLEND_IDS.indexOf(clip.blend), TILE_WIDTH)}>
        {BLEND_IDS.map((id) => {
          const selected = clip.blend === id;
          const label = BLENDS[id].label;
          return (
            <Tile key={id} label={label} selected={selected} onPress={() => pick(id)} boxTestID={`blend-tile-${id}`}>
              <View style={{ width: SQUARE * 2 - OVERLAP, height: SQUARE * 2 - OVERLAP }}>
                <View style={{ position: "absolute", left: 0, top: 0, width: SQUARE, height: SQUARE, borderRadius: theme.radius.tile, backgroundColor: theme.colors.textMuted }} />
                <View style={{ position: "absolute", right: 0, bottom: 0, width: SQUARE, height: SQUARE, borderRadius: theme.radius.tile, backgroundColor: theme.colors.accent, opacity: 0.8 }} />
              </View>
            </Tile>
          );
        })}
      </StripTiles>
    </ToolStrip>
  );
}
