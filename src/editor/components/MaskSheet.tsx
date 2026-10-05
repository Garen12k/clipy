import { View } from "react-native";
import { maskRadius } from "@/src/editor/model/clipLayout";
import { setClipMask } from "@/src/editor/model/ops";
import { MASK_IDS, type MaskId } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { useItemClip } from "@/src/editor/useItem";
import { theme } from "@/src/theme/theme";
import { haptic } from "@/src/ui/haptics";
import { Tile } from "@/src/ui/Tile";
import { StripTiles, ToolStrip } from "@/src/ui/ToolStrip";

const LABELS: Record<MaskId, string> = { none: "None", rounded: "Rounded", circle: "Circle" };
/** The square shape preview inside a tile's box (points). */
const SHAPE = { width: 26, height: 26 };

/** The selected clip's or layer's mask: None, Rounded or Circle. Each tile draws the shape with the radius the preview and the export use. */
export function MaskSheet({ clipId, visible, onClose }: { clipId: string | null; visible: boolean; onClose: () => void }) {
  const clip = useItemClip(clipId);
  const apply = useEditorStore((s) => s.apply);
  if (!clip) return null;
  const pick = (id: MaskId) => {
    if (clip.mask === id) return;   // already the mask: no buzz, no undo step
    haptic("light");
    apply((p) => setClipMask(p, clip.id, id));
  };

  return (
    <ToolStrip visible={visible} onClose={onClose} title="Mask">
      <StripTiles>
        {MASK_IDS.map((id) => {
          const selected = clip.mask === id;
          return (
            <Tile key={id} label={LABELS[id]} selected={selected} onPress={() => pick(id)} boxTestID={`mask-tile-${id}`}>
              <View testID={`mask-shape-${id}`} style={{ ...SHAPE, borderRadius: maskRadius(SHAPE, id), backgroundColor: selected ? theme.colors.accent : theme.colors.textMuted }} />
            </Tile>
          );
        })}
      </StripTiles>
    </ToolStrip>
  );
}
