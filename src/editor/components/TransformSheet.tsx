import { fillClip, fitClip, flipClip, resetClipTransform, rotateClip90 } from "@/src/editor/model/ops";
import { findItem, itemOffsetAt } from "@/src/editor/model/timeline";
import type { Project } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { haptic } from "@/src/ui/haptics";
import { ToolButton } from "@/src/ui/ToolButton";
import { StripTiles, ToolStrip } from "@/src/ui/ToolStrip";
import type { IoniconName } from "../toolGroups";

/** `offset` = the playhead's offset inside the clip or layer (undefined when the playhead is elsewhere): Fit / Fill / Reset write the pin there when the clip has keyframes. */
type Item = { label: string; icon: IoniconName; run: (p: Project, id: string, offset?: number) => Project };
const offsetAtPlayhead = (clipId: string): number | undefined => {
  const s = useEditorStore.getState();
  return (s.project ? itemOffsetAt(s.project, clipId, s.playhead) : null) ?? undefined;
};
const ITEMS: Item[] = [
  { label: "Rotate 90°", icon: "refresh", run: (p, id) => rotateClip90(p, id) },
  { label: "Flip horizontal", icon: "swap-horizontal", run: (p, id) => flipClip(p, id, "h") },
  { label: "Flip vertical", icon: "swap-vertical", run: (p, id) => flipClip(p, id, "v") },
  { label: "Fit", icon: "contract", run: fitClip },
  { label: "Fill", icon: "expand", run: fillClip },
  { label: "Reset", icon: "arrow-undo", run: resetClipTransform },
];

export function TransformSheet({ clipId, visible, onClose }: { clipId: string | null; visible: boolean; onClose: () => void }) {
  const exists = useEditorStore((s) => !!clipId && !!s.project && !!findItem(s.project, clipId));
  const apply = useEditorStore((s) => s.apply);
  if (!clipId || !exists) return null;
  const press = (it: Item) => {
    const project = useEditorStore.getState().project;
    const offset = offsetAtPlayhead(clipId);
    if (!project || it.run(project, clipId, offset) === project) return; // nothing to change: no buzz, no undo step
    haptic("light");
    apply((p) => it.run(p, clipId, offset));
  };
  return (
    <ToolStrip visible={visible} onClose={onClose} title="Transform">
      <StripTiles>
        {ITEMS.map((it) => <ToolButton key={it.label} label={it.label} icon={it.icon} onPress={() => press(it)} />)}
      </StripTiles>
    </ToolStrip>
  );
}
