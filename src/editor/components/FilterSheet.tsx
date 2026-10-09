import { useEffect, useMemo, useState } from "react";
import { Image, useWindowDimensions, View } from "react-native";
import { FILTERS } from "@/src/editor/effects";
import { forClips, mainClipIds, setClipFilter, setClipFilterIntensity, setFilterForAllClips } from "@/src/editor/model/ops";
import { FILTER_IDS, isPhoto, type Project } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { useIsLayer, useItemClip } from "@/src/editor/useItem";
import { theme } from "@/src/theme/theme";
import { haptic } from "@/src/ui/haptics";
import { PressableScale } from "@/src/ui/PressableScale";
import { Slider } from "@/src/ui/Slider";
import { Body } from "@/src/ui/Text";
import { StripSlider, StripTiles, ToolStrip, tilesStartXIn } from "@/src/ui/ToolStrip";
import { FilterLayer } from "./FilterLayer";
import { getThumb } from "./thumbnails";

/** A tile is 52 + 4 + one 11-pt line: it fits the strip's tile row. */
const TILE_W = 52;
const TILE_H = 52;

/** `clipIds` (multi-select): every change is written to all of these main clips; `clipId` is the clip whose values are shown. */
export function FilterSheet({ clipId, clipIds, visible, onClose }: { clipId: string | null; clipIds?: string[]; visible: boolean; onClose: () => void }) {
  const clip = useItemClip(clipId);
  const layer = useIsLayer(clipId);
  const count = useEditorStore((s) => (clipIds && s.project ? mainClipIds(s.project, clipIds).length : 0));
  const { apply, beginTransaction, applyTransient } = useEditorStore.getState();
  // The tiles' picture: the photo itself, or a thumbnail of the clip's first frame — the one loaded for THIS source and start, so
  // nothing is shown while another is on its way. No effect here sets state synchronously: the strip is mounted (closed) for every
  // selected item, and clearing the picture from an effect on each frame of a start-handle drag trips React's update-depth limit
  // (LayerBar.updateDepth.test.tsx).
  const [loaded, setLoaded] = useState<{ key: string; uri: string } | null>(null);
  const photo = !!clip && isPhoto(clip);
  const thumbKey = clip ? `${clip.sourceUri}|${clip.trimStart}|${clip.kind}` : null;
  useEffect(() => {
    if (!clip || photo || thumbKey === null) return;
    let alive = true;
    getThumb(clip.sourceUri, clip.trimStart).then((uri) => { if (alive) setLoaded({ key: thumbKey, uri }); }).catch(() => {});
    return () => { alive = false; };
  }, [clip?.sourceUri, clip?.trimStart, clip?.kind]);
  const thumb = !clip ? null : photo ? clip.sourceUri : loaded?.key === thumbKey ? loaded.uri : null;

  const { width: windowW } = useWindowDimensions();
  // Where the row starts: the selected tile in view. Worked out when the strip opens (and for another clip) — NOT on every pick: a
  // ScrollView applies a changed contentOffset at once, and the row must not move under the finger.
  const startX = useMemo(
    () => tilesStartXIn(Math.max(0, FILTER_IDS.indexOf(clip?.filter ?? "none")), TILE_W, FILTER_IDS.length, windowW),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visible, clip?.id, windowW],
  );

  if (!clip) return null;
  const current = clip.filter ?? "none";
  /** One clip op on the shown clip, or on every clip of the multi-selection (one project out, so one undo step). */
  const write = (op: (p: Project, id: string) => Project) => (p: Project) => (clipIds ? forClips(p, clipIds, op) : op(p, clip.id));

  return (
    <ToolStrip visible={visible} onClose={onClose} title={clipIds ? `Filter · ${count} ${count === 1 ? "clip" : "clips"}` : "Filter"}
      // "Apply to all" writes the main clips: it is not offered for a layer, nor for a multi-selection (which names its own clips).
      action={layer || clipIds ? undefined : { label: "Apply to All Clips", onPress: () => apply((p) => setFilterForAllClips(p, clip.filter, clip.filterIntensity)) }}>
      <StripTiles initialX={startX}>
        {FILTER_IDS.map((id) => {
          const def = FILTERS[id];
          const selected = current === id;
          return (
            <PressableScale
              key={id}
              lifted={selected}
              accessibilityRole="button"
              accessibilityLabel={def.label}
              accessibilityState={{ selected }}
              onPress={() => { haptic("light"); apply(write((p, cid) => setClipFilter(p, cid, id))); }}
              style={{ width: TILE_W, alignItems: "center", gap: theme.space.xs }}
            >
              <View testID={`filter-tile-${id}`} style={[{ width: TILE_W, height: TILE_H, borderRadius: theme.radius.chip, overflow: "hidden", backgroundColor: theme.elevation.tile }, selected ? theme.ring : theme.ringClear]}>
                {thumb ? <Image testID={`filter-thumb-${id}`} source={{ uri: thumb }} style={{ width: TILE_W, height: TILE_H }} resizeMode="cover" /> : null}
                <FilterLayer filter={id} />
              </View>
              <Body numberOfLines={1} style={[{ fontSize: theme.type.micro }, selected ? { color: theme.colors.accent } : null]}>{def.label}</Body>
            </PressableScale>
          );
        })}
      </StripTiles>
      <StripSlider label="Strength" value={`${Math.round(clip.filterIntensity * 100)}`}>
        <Slider
          testID="filter-strength"
          minimumValue={0} maximumValue={1} step={0.01}
          value={clip.filterIntensity}
          disabled={current === "none"}
          onSlidingStart={beginTransaction}
          onValueChange={(v) => applyTransient(write((p, cid) => setClipFilterIntensity(p, cid, v)))}
        />
      </StripSlider>
    </ToolStrip>
  );
}
