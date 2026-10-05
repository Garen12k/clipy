import { useState } from "react";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { deleteClips, duplicateClips, mainClipIds } from "@/src/editor/model/ops";
import { isPhoto, type Project } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { laneLift, laneModel } from "@/src/editor/timelineLayout";
import { theme } from "@/src/theme/theme";
import { haptic } from "@/src/ui/haptics";
import { Body } from "@/src/ui/Text";
import { ToolButton } from "@/src/ui/ToolButton";
import { STRIP, useStripPresence } from "@/src/ui/ToolStrip";
import { FilterSheet } from "./FilterSheet";
import { SpeedSheet } from "./SpeedSheet";
import { VolumeSheet } from "./VolumeSheet";

const firstVideoOf = (project: Project, multi: string[]) => { const ids = mainClipIds(project, multi); return project.clips.find((c) => ids.includes(c.id) && !isPhoto(c))?.id ?? null; };
const firstSoundingOf = (project: Project, multi: string[]) => { const ids = mainClipIds(project, multi); return project.clips.find((c) => ids.includes(c.id) && !isPhoto(c) && !c.reversed)?.id ?? null; };

/** The bar's height (the "N selected" line and one row of tool buttons), without the bottom safe-area padding. */
export const MULTI_BAR_HEIGHT = 104;

/**
 * Multi-select mode's action bar: it takes the toolbar's place while `multiSelect` is not null. Every action is one undo step for all
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
    <View testID="multi-select-bar" style={{ backgroundColor: theme.elevation.bar, borderTopWidth: 1, borderTopColor: theme.colors.hairline, paddingBottom: pad,
      height: (stripShown ? STRIP.height : MULTI_BAR_HEIGHT) + pad, marginTop: stripShown && lift > 0 ? -lift : 0 }}>
      {stripShown ? null : <Body weight="semi" accessibilityRole="header" style={{ textAlign: "center", paddingTop: theme.space.sm }}>{`${ids.length} selected`}</Body>}
      {stripShown ? null : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }}>
          <ToolButton label="Delete" icon="trash-outline" disabled={none} onPress={() => { haptic("medium"); apply((p) => deleteClips(p, ids)); }} />
          <ToolButton label="Duplicate" icon="copy-outline" disabled={none} onPress={() => { haptic("light"); apply((p) => duplicateClips(p, ids)); }} />
          <ToolButton label="Filter" icon="color-filter-outline" disabled={none} onPress={() => setSheet("filter")} />
          <ToolButton label="Speed" icon="speedometer-outline" disabled={!firstVideo} onPress={() => setSheet("speed")} />
          <ToolButton label="Volume" icon="volume-high-outline" disabled={!firstSounding} onPress={() => setSheet("volume")} />
          <ToolButton label="Select all" icon="albums-outline" onPress={selectAllClips} />
          <ToolButton label="Done" icon="checkmark-outline" onPress={exitMultiSelect} />
        </ScrollView>
      )}
      <FilterSheet clipId={ids[0] ?? null} clipIds={ids} visible={sheet === "filter"} onClose={() => setSheet(null)} />
      <SpeedSheet clipId={firstVideo} clipIds={ids} visible={sheet === "speed"} onClose={() => setSheet(null)} />
      <VolumeSheet clipId={firstSounding} clipIds={ids} visible={sheet === "volume"} onClose={() => setSheet(null)} />
    </View>
  );
}
