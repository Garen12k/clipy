import { useEffect, useRef } from "react";
import { EFFECTS } from "@/src/editor/effects";
import { addEffect } from "@/src/editor/model/ops";
import { EFFECT_IDS, type EffectId } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { newId } from "@/src/lib/id";
import { haptic } from "@/src/ui/haptics";
import { StripTiles, ToolStrip } from "@/src/ui/ToolStrip";
import { useToast } from "@/src/ui/Toast";
import { ToolButton } from "@/src/ui/ToolButton";

/** Picker for timeline effects: a tile adds the effect at the playhead, selects it and closes the strip. */
export function EffectSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  // One tile per opening: two tiles pressed in the same frame must not add two effects.
  const done = useRef(false);
  useEffect(() => { if (visible) done.current = false; }, [visible]);

  const add = (type: EffectId) => {
    const { project, playhead, apply, selectEffect } = useEditorStore.getState();
    if (!project || done.current) return;
    done.current = true;
    const id = newId();
    // The op returns the same project when it refuses. Close first: the toast shows where the strip was.
    const next = addEffect(project, type, playhead, id);
    if (next === project) {
      onClose();
      useToast.getState().show(project.clips.length === 0 ? "Add a clip first." : "No room for an effect here.");
      return;
    }
    apply(() => next);
    selectEffect(id);
    haptic("light");
    onClose();
  };

  return (
    <ToolStrip visible={visible} onClose={onClose} title="Effects">
      <StripTiles>
        {EFFECT_IDS.map((id) => <ToolButton key={id} label={EFFECTS[id].label} icon={EFFECTS[id].icon} onPress={() => add(id)} />)}
      </StripTiles>
    </ToolStrip>
  );
}
