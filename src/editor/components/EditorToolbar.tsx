import { useEffect, useState } from "react";
import { View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { addTextOverlay, defaultOverlayRange, deleteClip, deleteOverlay, duplicateClip, splitClipAt } from "@/src/editor/model/ops";
import { isTextOverlay, makeOverlay } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { TOOL_GROUPS, groupForSelection, type IoniconName, type ToolGroupId, type ToolId } from "@/src/editor/toolGroups";
import { newId } from "@/src/lib/id";
import { theme } from "@/src/theme/theme";
import { haptic } from "@/src/ui/haptics";
import { ToolButton } from "@/src/ui/ToolButton";
import { useReducedMotion } from "@/src/ui/useReducedMotion";
import { CaptionsSheet } from "./CaptionsSheet";
import { MusicSheet } from "./MusicSheet";
import { RatioSheet } from "./RatioSheet";
import { SpeedSheet } from "./SpeedSheet";
import { FilterSheet } from "./FilterSheet";
import { StickerPanel } from "./StickerPanel";
import { StickerSheet } from "./StickerSheet";
import { TemplateSheet } from "./TemplateSheet";
import { TextPanel } from "./TextPanel";
import { TransitionSheet } from "./TransitionSheet";
import { TrimSheet } from "./TrimSheet";
import { VolumeSheet } from "./VolumeSheet";

type PanelFor = { id: string; kind: "text" | "sticker" } | null;
type Props = { panelFor: PanelFor; onPanelChange: (next: PanelFor) => void; transitionFor: number | null; onTransitionChange: (index: number | null) => void };

export function EditorToolbar({ panelFor, onPanelChange, transitionFor, onTransitionChange }: Props) {
  const selectedId = useEditorStore((s) => s.selectedClipId);
  const selectedIndex = useEditorStore((s) => s.project?.clips.findIndex((c) => c.id === s.selectedClipId) ?? -1);
  const clipCount = useEditorStore((s) => s.project?.clips.length ?? 0);
  const hasClips = useEditorStore((s) => (s.project?.clips.length ?? 0) > 0);
  const apply = useEditorStore((s) => s.apply);
  const [sheet, setSheet] = useState<"ratio" | "trim" | "speed" | "music" | "volume" | "filter" | "sticker" | "captions" | "templates" | null>(null);
  const noSel = !selectedId;
  const reduced = useReducedMotion();
  const [group, setGroup] = useState<ToolGroupId>("edit");
  const overlayKind = useEditorStore((s) => s.project?.overlays.find((o) => o.id === s.selectedOverlayId)?.kind ?? null);
  useEffect(() => { setGroup((cur) => groupForSelection({ clipId: selectedId, overlayKind }, cur) ?? cur); }, [selectedId, overlayKind]);

  const addText = () => {
    const { project, playhead, selectOverlay } = useEditorStore.getState();
    if (!project) return;
    const id = newId();
    const range = defaultOverlayRange(project, playhead);
    apply((x) => addTextOverlay(x, { ...makeOverlay({ id }), ...range }));
    selectOverlay(id);
    onPanelChange({ id, kind: "text" });
  };

  const textPanelFor = panelFor?.kind === "text" ? panelFor.id : null;
  const stickerPanelFor = panelFor?.kind === "sticker" ? panelFor.id : null;

  const closeText = () => {
    if (textPanelFor) {
      const overlay = useEditorStore.getState().project?.overlays.find((o) => o.id === textPanelFor);
      if (overlay && isTextOverlay(overlay) && overlay.text.trim().length === 0) apply((x) => deleteOverlay(x, textPanelFor));
    }
    onPanelChange(null);
  };

  const TOOLS: Record<ToolId, { label: string; icon: IoniconName; disabled?: boolean; onPress: () => void }> = {
    split: { label: "Split", icon: "cut", disabled: noSel, onPress: () => { haptic("light"); apply((p) => splitClipAt(p, useEditorStore.getState().playhead)); } },
    trim: { label: "Trim", icon: "crop", disabled: noSel, onPress: () => setSheet("trim") },
    duplicate: { label: "Duplicate", icon: "copy", disabled: noSel, onPress: () => selectedId && apply((p) => duplicateClip(p, selectedId)) },
    delete: { label: "Delete", icon: "trash", disabled: noSel, onPress: () => { if (selectedId) { haptic("medium"); apply((p) => deleteClip(p, selectedId)); } } },
    ratio: { label: "Ratio", icon: "phone-portrait", onPress: () => setSheet("ratio") },
    filter: { label: "Filter", icon: "color-filter", disabled: noSel, onPress: () => setSheet("filter") },
    speed: { label: "Speed", icon: "speedometer", disabled: noSel, onPress: () => setSheet("speed") },
    transition: { label: "Transition", icon: "swap-horizontal", disabled: noSel || selectedIndex === clipCount - 1, onPress: () => onTransitionChange(selectedIndex) },
    templates: { label: "Templates", icon: "color-wand", disabled: !hasClips, onPress: () => setSheet("templates") },
    text: { label: "Text", icon: "text", disabled: !hasClips, onPress: addText },
    captions: { label: "Captions", icon: "chatbox-ellipses", disabled: !hasClips, onPress: () => setSheet("captions") },
    sticker: { label: "Sticker", icon: "happy", disabled: !hasClips, onPress: () => setSheet("sticker") },
    music: { label: "Music", icon: "musical-notes", onPress: () => setSheet("music") },
    volume: { label: "Volume", icon: "volume-high", disabled: noSel, onPress: () => setSheet("volume") },
  };
  const active = TOOL_GROUPS.find((g) => g.id === group)!;

  return (
    <View style={{ backgroundColor: theme.colors.surface, borderTopWidth: 1, borderTopColor: theme.colors.hairline, paddingBottom: 24 }}>
      <Animated.View key={group} entering={reduced ? undefined : FadeIn.duration(150)}
        style={{ flexDirection: "row", justifyContent: "center", paddingVertical: theme.space.xs, borderBottomWidth: 1, borderBottomColor: theme.colors.surfaceAlt }}>
        {active.tools.map((id) => <ToolButton key={id} {...TOOLS[id]} />)}
      </Animated.View>
      <View accessibilityRole="tablist" style={{ flexDirection: "row", justifyContent: "space-around", paddingTop: theme.space.xs }}>
        {TOOL_GROUPS.map((g) => <ToolButton key={g.id} role="tab" label={g.label} icon={g.icon} active={g.id === group} onPress={() => { if (g.id !== group) haptic("light"); setGroup(g.id); }} />)}
      </View>
      <RatioSheet visible={sheet === "ratio"} onClose={() => setSheet(null)} />
      <TrimSheet clipId={selectedId} visible={sheet === "trim"} onClose={() => setSheet(null)} />
      <SpeedSheet clipId={selectedId} visible={sheet === "speed"} onClose={() => setSheet(null)} />
      <FilterSheet clipId={selectedId} visible={sheet === "filter"} onClose={() => setSheet(null)} />
      <TemplateSheet clipId={selectedId} visible={sheet === "templates"} onClose={() => setSheet(null)} />
      <MusicSheet visible={sheet === "music"} onClose={() => setSheet(null)} />
      <VolumeSheet clipId={selectedId} visible={sheet === "volume"} onClose={() => setSheet(null)} />
      <StickerSheet visible={sheet === "sticker"} onClose={() => setSheet(null)} onAdded={() => {}} />
      <CaptionsSheet visible={sheet === "captions"} onClose={() => setSheet(null)} />
      <TransitionSheet clipIndex={transitionFor ?? 0} visible={transitionFor !== null} onClose={() => onTransitionChange(null)} />
      <TextPanel overlayId={textPanelFor} visible={!!textPanelFor} onClose={closeText} onRetarget={(id) => onPanelChange({ id, kind: "text" })} />
      <StickerPanel overlayId={stickerPanelFor} visible={!!stickerPanelFor} onClose={() => onPanelChange(null)} onRetarget={(id) => onPanelChange({ id, kind: "sticker" })} />
    </View>
  );
}
