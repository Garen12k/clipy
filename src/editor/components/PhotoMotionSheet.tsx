import { useMemo } from "react";
import { useWindowDimensions } from "react-native";
import { setMotionForAllPhotos, setPhotoMotion } from "@/src/editor/model/ops";
import { isPhoto, PHOTO_MOTION_IDS, PHOTO_MOTION_LIMITS, shownPhotoMotion, type PhotoMotionId } from "@/src/editor/model/types";
import { PHOTO_MOTIONS } from "@/src/editor/photoTools";
import { useEditorStore } from "@/src/editor/store";
import { useIsLayer, useItemClip } from "@/src/editor/useItem";
import { haptic } from "@/src/ui/haptics";
import { Slider } from "@/src/ui/Slider";
import { Tile, TILE_WIDTH } from "@/src/ui/Tile";
import { StripSlider, StripTiles, ToolStrip, tilesStartXIn } from "@/src/ui/ToolStrip";

/**
 * A photo's Motion: None or one of seven slow moves over its whole length, and how strong. What is ringed is `shownPhotoMotion` —
 * the motion that plays, or the twin of an older zoom / pan Combo (tapping that ringed tile leaves the Combo exactly as it is; a
 * Strength drag or another tile replaces it, in the op). A tile is one undo step, a Strength drag one, Apply to all photos one.
 */
export function PhotoMotionSheet({ clipId, visible, onClose }: { clipId: string | null; visible: boolean; onClose: () => void }) {
  const clip = useItemClip(clipId);
  const layer = useIsLayer(clipId);
  const { apply, beginTransaction, applyTransient } = useEditorStore.getState();
  const { width: windowW } = useWindowDimensions();
  const shown = clip && isPhoto(clip) ? shownPhotoMotion(clip) : null;
  // Where the row starts: the ringed tile in view (None is tile 0). Worked out when the strip opens (and for another photo) — NOT on
  // every pick: a ScrollView applies a changed contentOffset at once, and the row must not move under the finger.
  const startX = useMemo(
    () => tilesStartXIn(shown ? PHOTO_MOTION_IDS.indexOf(shown.id) + 1 : 0, TILE_WIDTH, PHOTO_MOTION_IDS.length + 1, windowW),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visible, clip?.id, windowW],
  );
  if (!clip || !isPhoto(clip)) return null;
  const strength = shown?.strength ?? PHOTO_MOTION_LIMITS.defaultStrength;

  const pick = (id: PhotoMotionId | null) => {
    if ((shown?.id ?? null) === id) return;   // already ringed: no buzz, no undo step (and an older Combo stays what it is)
    haptic("light");
    apply((p) => setPhotoMotion(p, clip.id, id === null ? null : { id, strength }));
  };

  return (
    <ToolStrip visible={visible} onClose={onClose} title="Motion"
      // "Apply to all photos" writes the photos on the main track: it is not offered for a layer.
      action={layer ? undefined : { label: "Apply to all photos", onPress: () => { haptic("light"); apply((p) => setMotionForAllPhotos(p, shown)); } }}>
      <StripTiles initialX={startX}>
        <Tile label="None" icon="ban-outline" selected={shown === null} onPress={() => pick(null)} />
        {PHOTO_MOTION_IDS.map((id) => <Tile key={id} label={PHOTO_MOTIONS[id].label} icon={PHOTO_MOTIONS[id].icon} selected={shown?.id === id} onPress={() => pick(id)} />)}
      </StripTiles>
      <StripSlider label="Strength" value={`${Math.round(strength * 100)} %`}>
        <Slider
          testID="motion-strength"
          minimumValue={PHOTO_MOTION_LIMITS.strength[0]} maximumValue={PHOTO_MOTION_LIMITS.strength[1]} step={0.05}
          value={strength}
          disabled={!shown}
          detents={[PHOTO_MOTION_LIMITS.defaultStrength]}
          onSlidingStart={beginTransaction}
          onValueChange={(v) => { if (shown) applyTransient((p) => setPhotoMotion(p, clip.id, { id: shown.id, strength: v })); }}
        />
      </StripSlider>
    </ToolStrip>
  );
}
