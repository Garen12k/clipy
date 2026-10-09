import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { deleteClips, duplicateClips, mainClipIds } from "@/src/editor/model/ops";
import { isPhoto, type Project } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { laneLift, laneModel } from "@/src/editor/timelineLayout";
import { theme } from "@/src/theme/theme";
import { haptic } from "@/src/ui/haptics";
import { Body } from "@/src/ui/Text";
import { ToolButton } from "@/src/ui/ToolButton";
import { BAR_HEIGHT, STRIP, useStripPresence } from "@/src/ui/ToolStrip";
import { FilterSheet } from "./FilterSheet";
import { SpeedSheet } from "./SpeedSheet";
import { BarCapsule, BarSeparator, ToolScroll } from "./ToolbarRow";
import { VolumeSheet } from "./VolumeSheet";

const firstVideoOf = (project: Project, multi: string[]) => { const ids = mainClipIds(project, multi); return project.clips.find((c) => ids.includes(c.id) && !isPhoto(c))?.id ?? null; };
const firstSoundingOf = (project: Project, multi: string[]) => { const ids = mainClipIds(project, multi); return project.clips.find((c) => ids.includes(c.id) && !isPhoto(c) && !c.reversed)?.id ?? null; };

/** The bar's height without the bottom safe-area padding: the toolbar's own, so entering the mode moves neither the preview nor the timeline. */
export const MULTI_BAR_HEIGHT = BAR_HEIGHT;

/**
 * Multi-select mode's action bar: it takes the toolbar's place while `multiSelect` is not null — the same capsule, one row: the count
 * ("3 selected", a small capsule) at the leading end, the actions in a sideways scroll, and Delete and Done pinned at the trailing end,
 * outside the scroll, so both are in view on the narrowest phone. Every action is one undo step for all
 * the chosen main clips. Delete ends the mode (the store does, once none of the chosen clips exists); Duplicate keeps the originals chosen.
 * Its height is explicit; while a tool strip shows, the line and the buttons give their place to it and the bar grows upwards
 * (a negative top margin, over the timeline's lowest lanes) instead of pushing the preview. It never rises over the clips: with too
 * few lanes under them, the rest of the growth comes out of the preview.
 */
export function MultiSelectBar() {
  const project = useEditorStore((s) => s.project);
  const multi = useEditorStore((s) => s.multiSelect);
  const insets = useSafeAreaInsets();
  const [sheet, setSheet] = useState<"filter" | "speed" | "volume" | null>(null);
  const stripShown = useStripPresence((s) => s.count > 0);
  const lift = useEditorStore((s) => laneLift(laneModel(s.project), STRIP.height - MULTI_BAR_HEIGHT));
  // A strip whose clip is gone (the selection changed under it) must not stay remembered, or it would reopen by itself later.
  const gone = !project || !multi
    ? sheet !== null
    : (sheet === "speed" && !firstVideoOf(project, multi)) || (sheet === "volume" && !firstSoundingOf(project, multi)) || (sheet === "filter" && mainClipIds(project, multi).length === 0);
  if (gone) setSheet(null);
  if (!project || !multi) return null;

  const { apply, selectAllClips, exitMultiSelect } = useEditorStore.getState();
  // Timeline order, main clips only.
  const ids = mainClipIds(project, multi);
  const none = ids.length === 0;
  // Speed and Volume do nothing to a photo: they need a video clip, and their sheets show the first one's values.
  const firstVideo = project.clips.find((c) => ids.includes(c.id) && !isPhoto(c))?.id ?? null;
  // A reversed clip's sound is never played or exported, so Volume needs a video clip that is not reversed, and shows that one's values.
  const firstSounding = project.clips.find((c) => ids.includes(c.id) && !isPhoto(c) && !c.reversed)?.id ?? null;

  const pad = Math.max(insets.bottom, theme.space.sm);

  return (
    // While the bar shows, the area is the page and the capsule floats on it; a strip is the bar's colour edge to edge, under its hairline.
    <View testID="multi-select-bar" style={{ backgroundColor: stripShown ? theme.elevation.bar : theme.elevation.page, borderTopWidth: 1, borderTopColor: stripShown ? theme.colors.hairline : theme.elevation.page, paddingBottom: pad,
      height: (stripShown ? STRIP.height : MULTI_BAR_HEIGHT) + pad, marginTop: stripShown && lift > 0 ? -lift : 0 }}>
      {stripShown ? null : (
        <BarCapsule testID="multi-row">
          <View testID="multi-count" style={{ height: theme.size.touch, flexDirection: "row", alignItems: "center", gap: theme.space.xs, paddingHorizontal: theme.space.sm, borderRadius: theme.radius.pill, backgroundColor: theme.elevation.tile }}>
            <Ionicons name="checkmark-circle-outline" size={theme.size.icon.sm} color={theme.colors.accent} />
            <Body weight="semi" accessibilityRole="header" numberOfLines={1} style={{ fontSize: theme.type.label, fontVariant: ["tabular-nums"] }}>{`${ids.length} selected`}</Body>
          </View>
          <ToolScroll testID="multi-scroll">
            <ToolButton variant="bar" label="Speed" icon="speedometer-outline" disabled={!firstVideo} onPress={() => setSheet("speed")} />
            <ToolButton variant="bar" label="Volume" icon="volume-high-outline" disabled={!firstSounding} onPress={() => setSheet("volume")} />
            <ToolButton variant="bar" label="Filter" icon="color-filter-outline" disabled={none} onPress={() => setSheet("filter")} />
            <ToolButton variant="bar" label="Duplicate" icon="copy-outline" disabled={none} onPress={() => { haptic("light"); apply((p) => duplicateClips(p, ids)); }} />
            <ToolButton variant="bar" label="Select all" icon="albums-outline" onPress={selectAllClips} />
          </ToolScroll>
          <BarSeparator />
          <ToolButton variant="bar" danger label="Delete" icon="trash-outline" disabled={none} onPress={() => { haptic("medium"); apply((p) => deleteClips(p, ids)); }} />
          <ToolButton variant="bar" label="Done" icon="checkmark-outline" onPress={exitMultiSelect} />
        </BarCapsule>
      )}
      <FilterSheet clipId={ids[0] ?? null} clipIds={ids} visible={sheet === "filter"} onClose={() => setSheet(null)} />
      <SpeedSheet clipId={firstVideo} clipIds={ids} visible={sheet === "speed"} onClose={() => setSheet(null)} />
      <VolumeSheet clipId={firstSounding} clipIds={ids} visible={sheet === "volume"} onClose={() => setSheet(null)} />
    </View>
  );
}
