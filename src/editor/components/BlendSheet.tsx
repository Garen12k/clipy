import { View } from "react-native";
import { BLENDS } from "@/src/editor/effects";
import { setClipBlend } from "@/src/editor/model/ops";
import { BLEND_IDS, type BlendId } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { useItemClip } from "@/src/editor/useItem";
import { theme } from "@/src/theme/theme";
import { haptic } from "@/src/ui/haptics";
import { PressableScale } from "@/src/ui/PressableScale";
import { Body } from "@/src/ui/Text";
import { StripNote, StripTiles, ToolStrip, tilesStartX } from "@/src/ui/ToolStrip";

/** Tile geometry (points): the column a tile takes, its rounded box, and the two overlapping squares inside it. */
const TILE_WIDTH = 68;
const TILE_BOX = 44;
const SQUARE = 18;
const OVERLAP = 8;
const LABEL_SIZE = 11;
const clearRing = { borderWidth: theme.ring.borderWidth, borderColor: "transparent" };

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
            <PressableScale key={id} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected }} onPress={() => pick(id)}
              style={{ alignItems: "center", width: TILE_WIDTH, paddingVertical: theme.space.xs }}>
              <View testID={`blend-tile-${id}`} style={[{ width: TILE_BOX, height: TILE_BOX, borderRadius: theme.radius.card, alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.surfaceAlt }, selected ? theme.ring : clearRing]}>
                <View style={{ width: SQUARE * 2 - OVERLAP, height: SQUARE * 2 - OVERLAP }}>
                  <View style={{ position: "absolute", left: 0, top: 0, width: SQUARE, height: SQUARE, borderRadius: theme.radius.tile, backgroundColor: theme.colors.textMuted }} />
                  <View style={{ position: "absolute", right: 0, bottom: 0, width: SQUARE, height: SQUARE, borderRadius: theme.radius.tile, backgroundColor: theme.colors.accent, opacity: 0.8 }} />
                </View>
              </View>
              <Body numberOfLines={1} weight={selected ? "semi" : "regular"} style={{ color: selected ? theme.colors.accent : theme.colors.text, fontSize: LABEL_SIZE, marginTop: theme.space.xs }}>{label}</Body>
            </PressableScale>
          );
        })}
      </StripTiles>
    </ToolStrip>
  );
}
