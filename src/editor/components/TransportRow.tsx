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

/** The time and the ratio pill take the same width, so play stays in the middle. */
const SIDE_WIDTH = 84;

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
    <View testID="transport-row" style={{ height: theme.size.row, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: theme.space.sm }}>
      <IconButton name="arrow-undo-outline" accessibilityLabel="Undo" disabled={!canUndo} onPress={undo} />
      <Body style={{ fontVariant: ["tabular-nums"], fontSize: theme.type.small, minWidth: SIDE_WIDTH, textAlign: "center" }}>{`${formatDuration(playhead)} / ${formatDuration(total)}`}</Body>
      {/* A filled glyph on a filled disc, on purpose: an outline glyph would read as a hole. */}
      <PressableScale accessibilityRole="button" accessibilityLabel={isPlaying ? "Pause" : "Play"} accessibilityState={{ disabled: empty }} disabled={empty} onPress={toggle}
        style={{ width: theme.size.iconButton, height: theme.size.iconButton, borderRadius: theme.radius.pill, backgroundColor: theme.colors.text, alignItems: "center", justifyContent: "center", opacity: empty ? 0.35 : 1 }}>
        <Ionicons name={isPlaying ? "pause" : "play"} size={theme.size.icon.md} color={theme.colors.onAccent} />
      </PressableScale>
      <PressableScale accessibilityRole="button" accessibilityLabel="Aspect ratio" onPress={() => openStrip("ratio")} hitSlop={{ top: theme.space.sm, bottom: theme.space.sm }}
        style={{ minWidth: SIDE_WIDTH, alignItems: "center" }}>
        <View style={{ height: theme.size.chipCompact, justifyContent: "center", borderWidth: 1, borderColor: theme.colors.hairline, borderRadius: theme.radius.pill, paddingHorizontal: theme.space.md }}>
          <Body weight="semi" style={{ fontSize: theme.type.small }}>{project.aspectRatio}</Body>
        </View>
      </PressableScale>
      <IconButton name="arrow-redo-outline" accessibilityLabel="Redo" disabled={!canRedo} onPress={redo} />
    </View>
  );
}
