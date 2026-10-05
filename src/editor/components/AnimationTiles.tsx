import { ANIM_LIMITS, type AnimEdge } from "@/src/editor/model/types";
import type { IoniconName } from "@/src/editor/toolGroups";
import { Slider } from "@/src/ui/Slider";
import { Tile, TILE_WIDTH } from "@/src/ui/Tile";
import { StripSlider, tilesStartX } from "@/src/ui/ToolStrip";

const NONE_ICON: IoniconName = "ban-outline";

type TilesProps<T extends string> = { ids: readonly T[]; registry: Record<T, { label: string; icon: IoniconName }>; selected: T | null; onPick: (id: T | null) => void };

/** The tiles shared by the animation strips (the caller puts them in a `StripTiles` row): "None" first, then one per id; the selected tile carries the gold ring. */
export function AnimationTiles<T extends string>({ ids, registry, selected, onPick }: TilesProps<T>) {
  return (
    <>
      <Tile label="None" icon={NONE_ICON} selected={selected === null} onPress={() => onPick(null)} />
      {ids.map((id) => <Tile key={id} label={registry[id].label} icon={registry[id].icon} selected={selected === id} onPress={() => onPick(id)} />)}
    </>
  );
}

/** Where the animation row starts so the selected tile (None is first) shows. */
export const animationStartX = <T extends string>(ids: readonly T[], selected: T | null): number => tilesStartX(selected === null ? 0 : ids.indexOf(selected) + 1, TILE_WIDTH);

/** The duration an In / Out tile is picked with: the edge's current one, or the default when the edge is empty. */
export const edgeDuration = (edge: AnimEdge | null): number => edge?.duration ?? ANIM_LIMITS.defaultDuration;

/** The "Length" slider row under the In / Out tiles; disabled while the edge is None. The caller makes one undo step per drag. */
export function AnimationLength({ edge, onStart, onChange }: { edge: AnimEdge | null; onStart: () => void; onChange: (duration: number) => void }) {
  return (
    <StripSlider label="Length" value={`${edgeDuration(edge).toFixed(2)} s`}>
      <Slider
        testID="animation-slider"
        minimumValue={ANIM_LIMITS.minDuration} maximumValue={ANIM_LIMITS.maxDuration} step={0.05}
        value={edgeDuration(edge)}
        disabled={!edge}
        onSlidingStart={onStart}
        onValueChange={onChange}
      />
    </StripSlider>
  );
}
