import { View } from "react-native";
import { fillClip, fitClip, flipClip, resetClipTransform, rotateClip90 } from "@/src/editor/model/ops";
import { clipAt } from "@/src/editor/model/timeline";
import type { Project } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { theme } from "@/src/theme/theme";
import { haptic } from "@/src/ui/haptics";
import { Sheet } from "@/src/ui/Sheet";
import { ToolButton } from "@/src/ui/ToolButton";
import type { IoniconName } from "../toolGroups";

/** `offset` = the playhead's offset inside the clip (undefined when the playhead is elsewhere): Fit / Fill / Reset write the pin there when the clip has keyframes. */
type Item = { label: string; icon: IoniconName; run: (p: Project, id: string, offset?: number) => Project };
const offsetAtPlayhead = (clipId: string): number | undefined => {
  const s = useEditorStore.getState();
  const hit = s.project ? clipAt(s.project, s.playhead) : null;
  return hit && hit.clip.id === clipId ? hit.offsetInClip : undefined;
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
  const exists = useEditorStore((s) => !!clipId && !!s.project?.clips.some((c) => c.id === clipId));
  const apply = useEditorStore((s) => s.apply);
  if (!clipId || !exists) return null;
  return (
    <Sheet visible={visible} onClose={onClose} title="Transform">
      <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: theme.space.sm }}>
        {ITEMS.map((it) => <ToolButton key={it.label} label={it.label} icon={it.icon} onPress={() => { haptic("light"); const offset = offsetAtPlayhead(clipId); apply((p) => it.run(p, clipId, offset)); }} />)}
      </View>
    </Sheet>
  );
}
