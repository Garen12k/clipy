import { useState } from "react";
import { ScrollView, View } from "react-native";
import { addTextOverlay, defaultOverlayRange, deleteClip, deleteOverlay, duplicateClip, splitClipAt } from "@/src/editor/model/ops";
import { makeOverlay } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { newId } from "@/src/lib/id";
import { theme } from "@/src/theme/theme";
import { ToolButton } from "@/src/ui/ToolButton";
import { RatioSheet } from "./RatioSheet";
import { TextPanel } from "./TextPanel";
import { TrimSheet } from "./TrimSheet";

type Props = { textPanelFor: string | null; onTextPanelChange: (id: string | null) => void };

export function EditorToolbar({ textPanelFor, onTextPanelChange }: Props) {
  const selectedId = useEditorStore((s) => s.selectedClipId);
  const hasClips = useEditorStore((s) => (s.project?.clips.length ?? 0) > 0);
  const apply = useEditorStore((s) => s.apply);
  const [sheet, setSheet] = useState<"ratio" | "trim" | null>(null);
  const noSel = !selectedId;

  const addText = () => {
    const { project, playhead, selectOverlay } = useEditorStore.getState();
    if (!project) return;
    const id = newId();
    const range = defaultOverlayRange(project, playhead);
    apply((x) => addTextOverlay(x, { ...makeOverlay({ id }), color: theme.colors.text, ...range }));
    selectOverlay(id);
    onTextPanelChange(id);
  };

  const closeText = () => {
    if (textPanelFor) {
      const overlay = useEditorStore.getState().project?.overlays.find((o) => o.id === textPanelFor);
      if (overlay && overlay.text.trim().length === 0) apply((x) => deleteOverlay(x, textPanelFor));
    }
    onTextPanelChange(null);
  };

  return (
    <View style={{ backgroundColor: theme.colors.surface, borderTopWidth: 1, borderTopColor: theme.colors.surfaceAlt, paddingBottom: 24 }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 8 }}>
        <ToolButton label="Split" icon="cut" disabled={noSel} onPress={() => apply((p) => splitClipAt(p, useEditorStore.getState().playhead))} />
        <ToolButton label="Trim" icon="crop" disabled={noSel} onPress={() => setSheet("trim")} />
        <ToolButton label="Ratio" icon="phone-portrait" onPress={() => setSheet("ratio")} />
        <ToolButton label="Text" icon="text" disabled={!hasClips} onPress={addText} />
        <ToolButton label="Duplicate" icon="copy" disabled={noSel} onPress={() => selectedId && apply((p) => duplicateClip(p, selectedId))} />
        <ToolButton label="Delete" icon="trash" disabled={noSel} onPress={() => selectedId && apply((p) => deleteClip(p, selectedId))} />
      </ScrollView>
      <RatioSheet visible={sheet === "ratio"} onClose={() => setSheet(null)} />
      <TrimSheet clipId={selectedId} visible={sheet === "trim"} onClose={() => setSheet(null)} />
      <TextPanel overlayId={textPanelFor} visible={!!textPanelFor} onClose={closeText} />
    </View>
  );
}
