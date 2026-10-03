import { View } from "react-native";
import { EFFECTS } from "@/src/editor/effects";
import { addEffect } from "@/src/editor/model/ops";
import { EFFECT_IDS, type EffectId } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { newId } from "@/src/lib/id";
import { theme } from "@/src/theme/theme";
import { haptic } from "@/src/ui/haptics";
import { Sheet } from "@/src/ui/Sheet";
import { useToast } from "@/src/ui/Toast";
import { ToolButton } from "@/src/ui/ToolButton";

/** Picker for timeline effects: a tile adds the effect at the playhead, selects it and closes the sheet. */
export function EffectSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const add = (type: EffectId) => {
    const { project, playhead, apply, selectEffect } = useEditorStore.getState();
    if (!project) return;
    const id = newId();
    // The op returns the same project when it refuses: say why and stay open.
    if (addEffect(project, type, playhead, id) === project) {
      useToast.getState().show(project.clips.length === 0 ? "Add a clip first." : "No room for an effect here.");
      return;
    }
    apply((p) => addEffect(p, type, playhead, id));
    selectEffect(id);
    haptic("light");
    onClose();
  };

  return (
    <Sheet visible={visible} onClose={onClose} title="Effects">
      <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", rowGap: theme.space.sm }}>
        {EFFECT_IDS.map((id) => <ToolButton key={id} label={EFFECTS[id].label} icon={EFFECTS[id].icon} onPress={() => add(id)} />)}
      </View>
    </Sheet>
  );
}
