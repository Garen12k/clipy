import { useEffect, useState } from "react";
import { Image, Pressable, ScrollView, View } from "react-native";
import { FILTERS } from "@/src/editor/effects";
import { setClipFilter, setFilterForAllClips } from "@/src/editor/model/ops";
import { FILTER_IDS, isPhoto } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { theme } from "@/src/theme/theme";
import { haptic } from "@/src/ui/haptics";
import { Sheet } from "@/src/ui/Sheet";
import { Body } from "@/src/ui/Text";
import { FilterLayer } from "./FilterLayer";
import { getThumb } from "./thumbnails";

const TILE_W = 72;
const TILE_H = 96;

export function FilterSheet({ clipId, visible, onClose }: { clipId: string | null; visible: boolean; onClose: () => void }) {
  const clip = useEditorStore((s) => s.project?.clips.find((c) => c.id === clipId) ?? null);
  const { apply } = useEditorStore.getState();
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

  return (
    <Sheet visible={visible} onClose={onClose} title="Filter" action={{ label: "Apply to all clips", onPress: () => apply((p) => setFilterForAllClips(p, clip.filter)) }}>
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
              onPress={() => { haptic("light"); apply((p) => setClipFilter(p, clip.id, id)); }}
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
    </Sheet>
  );
}
