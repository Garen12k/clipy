import { View } from "react-native";
import { addBeatMarker, clearBeatMarkers, removeBeatMarkerNear } from "@/src/editor/model/ops";
import type { Project } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { theme } from "@/src/theme/theme";
import { haptic, type HapticKind } from "@/src/ui/haptics";
import { PrimaryButton } from "@/src/ui/PrimaryButton";
import { SecondaryButton } from "@/src/ui/SecondaryButton";
import { Body } from "@/src/ui/Text";
import { ToolPanel } from "@/src/ui/ToolPanel";

/**
 * Beat markers: tap along while the video plays to drop a marker at the playhead. The playhead is read from the store at press
 * time (the panel does not re-render on every tick). Each press is one undo step; a press the model refuses (too close to a
 * marker, nothing in reach, the limit) does nothing at all.
 */
export function BeatsSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const count = useEditorStore((s) => s.project?.beatMarkers.length ?? 0);

  const run = (op: (p: Project, playhead: number) => Project, feel: HapticKind) => {
    const { project, playhead, apply } = useEditorStore.getState();
    if (!project) return;
    // The ops return the same project when they refuse.
    const next = op(project, playhead);
    if (next === project) return;
    haptic(feel);
    apply(() => next);
  };

  return (
    <ToolPanel visible={visible} onClose={onClose} title="Beat markers" size="compact">
      <PrimaryButton title="Tap" onPress={() => run(addBeatMarker, "light")} />
      <Body muted style={{ textAlign: "center" }}>{count === 1 ? "1 marker" : `${count} markers`}</Body>
      {/* Compact: at the regular size the pair is wider than a 375-pt phone leaves between its gutters. */}
      <View style={{ flexDirection: "row", justifyContent: "center", gap: theme.space.md }}>
        <SecondaryButton compact title="Remove nearest" disabled={count === 0} onPress={() => run(removeBeatMarkerNear, "light")} />
        <SecondaryButton compact title="Clear all" disabled={count === 0} onPress={() => run((p) => clearBeatMarkers(p), "medium")} />
      </View>
    </ToolPanel>
  );
}
