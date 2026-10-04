import Slider from "@react-native-community/slider";
import { useEffect, useState } from "react";
import { Image, Pressable, ScrollView, View } from "react-native";
import { FILTERS } from "@/src/editor/effects";
import { forClips, mainClipIds, setClipFilter, setClipFilterIntensity, setFilterForAllClips } from "@/src/editor/model/ops";
import { FILTER_IDS, isPhoto, type Project } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { useIsLayer, useItemClip } from "@/src/editor/useItem";
import { theme } from "@/src/theme/theme";
import { haptic } from "@/src/ui/haptics";
import { Sheet } from "@/src/ui/Sheet";
import { Body } from "@/src/ui/Text";
import { FilterLayer } from "./FilterLayer";
import { getThumb } from "./thumbnails";

const TILE_W = 72;
const TILE_H = 96;

/** `clipIds` (multi-select): every change is written to all of these main clips; `clipId` is the clip whose values are shown. */
export function FilterSheet({ clipId, clipIds, visible, onClose }: { clipId: string | null; clipIds?: string[]; visible: boolean; onClose: () => void }) {
  const clip = useItemClip(clipId);
  const layer = useIsLayer(clipId);
  const count = useEditorStore((s) => (clipIds && s.project ? mainClipIds(s.project, clipIds).length : 0));
  const { apply, beginTransaction, applyTransient } = useEditorStore.getState();
  const [thumb, setThumb] = useState<string | null>(null);

  useEffect(() => {
    setThumb(null);
    if (!clip) return;
    if (isPhoto(clip)) { setThumb(clip.sourceUri); return; }
    let alive = true;
    getThumb(clip.sourceUri, clip.trimStart).then((uri) => { if (alive) setThumb(uri); }).catch(() => {});
    return () => { alive = false; };
  }, [clip?.sourceUri, clip?.trimStart, clip?.kind]);

  if (!clip) return null;
  const current = clip.filter ?? "none";
  /** One clip op on the shown clip, or on every clip of the multi-selection (one project out, so one undo step). */
  const write = (op: (p: Project, id: string) => Project) => (p: Project) => (clipIds ? forClips(p, clipIds, op) : op(p, clip.id));

  return (
    <Sheet visible={visible} onClose={onClose} title={clipIds ? `Filter · ${count} ${count === 1 ? "clip" : "clips"}` : "Filter"}
      // "Apply to all" writes the main clips: it is not offered for a layer, nor for a multi-selection (which names its own clips).
      action={layer || clipIds ? undefined : { label: "Apply to all clips", onPress: () => apply((p) => setFilterForAllClips(p, clip.filter, clip.filterIntensity)) }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: theme.space.sm }}>
        {FILTER_IDS.map((id) => {
          const def = FILTERS[id];
          const selected = current === id;
          return (
            <Pressable
              key={id}
              accessibilityRole="button"
              accessibilityLabel={def.label}
              accessibilityState={{ selected }}
              onPress={() => { haptic("light"); apply(write((p, cid) => setClipFilter(p, cid, id))); }}
              style={{ width: TILE_W, alignItems: "center", gap: theme.space.xs }}
            >
              <View testID={`filter-tile-${id}`} style={[{ width: TILE_W, height: TILE_H, borderRadius: theme.radius.chip, overflow: "hidden", backgroundColor: theme.colors.surfaceAlt }, selected ? theme.ring : { borderWidth: 2, borderColor: "transparent" }]}>
                {thumb ? <Image testID={`filter-thumb-${id}`} source={{ uri: thumb }} style={{ width: TILE_W, height: TILE_H }} resizeMode="cover" /> : null}
                <FilterLayer filter={id} />
              </View>
              <Body style={{ fontSize: 12 }}>{def.label}</Body>
            </Pressable>
          );
        })}
      </ScrollView>
      <Slider
        testID="filter-strength"
        minimumValue={0} maximumValue={1} step={0.01}
        value={clip.filterIntensity}
        disabled={current === "none"}
        onSlidingStart={beginTransaction}
        onValueChange={(v) => applyTransient(write((p, cid) => setClipFilterIntensity(p, cid, v)))}
        minimumTrackTintColor={theme.colors.accent} maximumTrackTintColor={theme.colors.surfaceAlt} thumbTintColor={theme.colors.accent}
      />
      <Body muted style={{ fontSize: 12 }}>Strength {Math.round(clip.filterIntensity * 100)}</Body>
    </Sheet>
  );
}
