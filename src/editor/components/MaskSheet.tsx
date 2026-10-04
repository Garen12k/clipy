import { View } from "react-native";
import { maskRadius } from "@/src/editor/model/clipLayout";
import { setClipMask } from "@/src/editor/model/ops";
import { MASK_IDS, type MaskId } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { useItemClip } from "@/src/editor/useItem";
import { theme } from "@/src/theme/theme";
import { haptic } from "@/src/ui/haptics";
import { PressableScale } from "@/src/ui/PressableScale";
import { Sheet } from "@/src/ui/Sheet";
import { Body } from "@/src/ui/Text";

const LABELS: Record<MaskId, string> = { none: "None", rounded: "Rounded", circle: "Circle" };
/** Tile geometry (points): the column a tile takes, its rounded box, and the square shape preview inside it. */
const TILE_WIDTH = 84;
const TILE_BOX = 64;
const SHAPE = { width: 36, height: 36 };
const LABEL_SIZE = 12;
const clearRing = { borderWidth: theme.ring.borderWidth, borderColor: "transparent" };

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
    <Sheet visible={visible} onClose={onClose} title="Mask">
      <View style={{ flexDirection: "row", justifyContent: "center", gap: theme.space.sm }}>
        {MASK_IDS.map((id) => {
          const selected = clip.mask === id;
          return (
            <PressableScale key={id} accessibilityRole="button" accessibilityLabel={LABELS[id]} accessibilityState={{ selected }} onPress={() => pick(id)}
              style={{ alignItems: "center", width: TILE_WIDTH, paddingVertical: theme.space.xs }}>
              <View testID={`mask-tile-${id}`} style={[{ width: TILE_BOX, height: TILE_BOX, borderRadius: theme.radius.card, alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.surfaceAlt }, selected ? theme.ring : clearRing]}>
                <View testID={`mask-shape-${id}`} style={{ ...SHAPE, borderRadius: maskRadius(SHAPE, id), backgroundColor: selected ? theme.colors.accent : theme.colors.textMuted }} />
              </View>
              <Body numberOfLines={1} weight={selected ? "semi" : "regular"} style={{ color: selected ? theme.colors.accent : theme.colors.text, fontSize: LABEL_SIZE, marginTop: theme.space.xs }}>{LABELS[id]}</Body>
            </PressableScale>
          );
        })}
      </View>
    </Sheet>
  );
}
