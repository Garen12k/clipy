import { useState } from "react";
import { ScrollView, View } from "react-native";
import { deleteClip, duplicateClip, splitClipAt } from "@/src/editor/model/ops";
import { useEditorStore } from "@/src/editor/store";
import { theme } from "@/src/theme/theme";
import { ToolButton } from "@/src/ui/ToolButton";
import { RatioSheet } from "./RatioSheet";
import { TrimSheet } from "./TrimSheet";

export function EditorToolbar() {
  const selectedId = useEditorStore((s) => s.selectedClipId);
  const apply = useEditorStore((s) => s.apply);
  const [sheet, setSheet] = useState<"ratio" | "trim" | null>(null);
  const noSel = !selectedId;
  return (
    <View style={{ backgroundColor: theme.colors.surface, borderTopWidth: 1, borderTopColor: theme.colors.surfaceAlt, paddingBottom: 24 }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 8 }}>
        <ToolButton label="Split" icon="cut" disabled={noSel} onPress={() => apply((p) => splitClipAt(p, useEditorStore.getState().playhead))} />
        <ToolButton label="Trim" icon="crop" disabled={noSel} onPress={() => setSheet("trim")} />
        <ToolButton label="Ratio" icon="phone-portrait" onPress={() => setSheet("ratio")} />
        <ToolButton label="Duplicate" icon="copy" disabled={noSel} onPress={() => selectedId && apply((p) => duplicateClip(p, selectedId))} />
        <ToolButton label="Delete" icon="trash" disabled={noSel} onPress={() => selectedId && apply((p) => deleteClip(p, selectedId))} />
      </ScrollView>
      <RatioSheet visible={sheet === "ratio"} onClose={() => setSheet(null)} />
      <TrimSheet clipId={selectedId} visible={sheet === "trim"} onClose={() => setSheet(null)} />
    </View>
  );
}
