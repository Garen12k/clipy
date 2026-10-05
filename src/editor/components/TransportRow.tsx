import { Ionicons } from "@expo/vector-icons";
import { View } from "react-native";
import { totalDuration } from "@/src/editor/model/timeline";
import { useEditorStore } from "@/src/editor/store";
import { openStrip } from "@/src/editor/toolStrip";
import { formatDuration } from "@/src/lib/format";
import { theme } from "@/src/theme/theme";
import { IconButton } from "@/src/ui/IconButton";
import { PressableScale } from "@/src/ui/PressableScale";
import { Body } from "@/src/ui/Text";

/** Undo · time · play/pause · ratio · redo, between the preview and the timeline. */
export function TransportRow() {
  const project = useEditorStore((s) => s.project);
  const playhead = useEditorStore((s) => s.playhead);
  const isPlaying = useEditorStore((s) => s.isPlaying);
  const canUndo = useEditorStore((s) => s.past.length > 0);
  const canRedo = useEditorStore((s) => s.future.length > 0);
  if (!project) return null;
  const { undo, redo, seek, setPlaying } = useEditorStore.getState();
  const total = totalDuration(project);
  const empty = project.clips.length === 0;
  const toggle = () => { if (!isPlaying && playhead >= total) seek(0); setPlaying(!isPlaying); };
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: theme.space.md, paddingVertical: theme.space.xs }}>
      <IconButton name="arrow-undo" accessibilityLabel="Undo" disabled={!canUndo} onPress={undo} />
      <Body style={{ fontVariant: ["tabular-nums"], fontSize: 12, minWidth: 84, textAlign: "center" }}>{`${formatDuration(playhead)} / ${formatDuration(total)}`}</Body>
      <PressableScale accessibilityRole="button" accessibilityLabel={isPlaying ? "Pause" : "Play"} accessibilityState={{ disabled: empty }} disabled={empty} onPress={toggle}
        style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: theme.colors.text, alignItems: "center", justifyContent: "center", opacity: empty ? 0.35 : 1 }}>
        <Ionicons name={isPlaying ? "pause" : "play"} size={20} color={theme.colors.onAccent} />
      </PressableScale>
      <PressableScale accessibilityRole="button" accessibilityLabel="Aspect ratio" onPress={() => openStrip("ratio")}
        style={{ minWidth: 84, alignItems: "center" }}>
        <View style={{ borderWidth: 1, borderColor: theme.colors.hairline, borderRadius: theme.radius.pill, paddingHorizontal: theme.space.md, paddingVertical: 3 }}>
          <Body weight="semi" style={{ fontSize: 12 }}>{project.aspectRatio}</Body>
        </View>
      </PressableScale>
      <IconButton name="arrow-redo" accessibilityLabel="Redo" disabled={!canRedo} onPress={redo} />
    </View>
  );
}
