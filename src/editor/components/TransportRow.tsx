import { Icon, type IconName } from "@/src/ui/Icon";
import { Text, View } from "react-native";
import { totalDuration } from "@/src/editor/model/timeline";
import { aspectLabel } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { openStrip } from "@/src/editor/toolStrip";
import { formatDuration } from "@/src/lib/format";
import { theme } from "@/src/theme/theme";
import { PressableScale } from "@/src/ui/PressableScale";
import { Body } from "@/src/ui/Text";

/** The capsule and the disc are 40 pt high in a 48-pt row: this much slop each way makes a target 44. */
const SLOP = (theme.size.touch - theme.size.iconButton) / 2;

/** Undo or Redo inside their capsule: 44 pt wide, so the two targets touch and never overlap. */
function HistoryButton({ name, label, enabled, onPress }: { name: IconName; label: string; enabled: boolean; onPress: () => void }) {
  return (
    <PressableScale accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: !enabled }} disabled={!enabled} onPress={onPress} hitSlop={{ top: SLOP, bottom: SLOP }}
      style={{ width: theme.size.touch, height: theme.size.iconButton, alignItems: "center", justifyContent: "center", opacity: enabled ? 1 : 0.35 }}>
      <Icon name={name} size={theme.size.icon.md} color={theme.colors.text} />
    </PressableScale>
  );
}

/** Undo and Redo in one capsule · play / pause in the middle · the time and the ratio pill, between the preview and the timeline. */
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
    <View testID="transport-row" style={{ height: theme.size.row, flexDirection: "row", alignItems: "center", paddingHorizontal: theme.space.gutter, gap: theme.space.sm }}>
      {/* The two sides take equal room, so play stays in the middle whatever they hold. */}
      <View testID="transport-leading" style={{ flex: 1, flexDirection: "row", alignItems: "center" }}>
        <View testID="transport-history" style={{ flexDirection: "row", alignItems: "center", borderRadius: theme.radius.pill, backgroundColor: theme.elevation.bar }}>
          <HistoryButton name="arrow-undo-outline" label="Undo" enabled={canUndo} onPress={undo} />
          <HistoryButton name="arrow-redo-outline" label="Redo" enabled={canRedo} onPress={redo} />
        </View>
      </View>
      {/* A filled glyph on a filled disc, on purpose: an outline glyph would read as a hole. */}
      <PressableScale accessibilityRole="button" accessibilityLabel={isPlaying ? "Pause" : "Play"} accessibilityState={{ disabled: empty }} disabled={empty} onPress={toggle} hitSlop={SLOP}
        style={{ width: theme.size.iconButton, height: theme.size.iconButton, borderRadius: theme.radius.pill, backgroundColor: theme.colors.text, alignItems: "center", justifyContent: "center", opacity: empty ? 0.35 : 1 }}>
        <Icon name={isPlaying ? "pause" : "play"} size={theme.size.icon.md} color={theme.colors.onAccent} />
      </PressableScale>
      <View testID="transport-trailing" style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: theme.space.sm }}>
        <Body testID="transport-time" muted numberOfLines={1} style={{ flexShrink: 1, fontVariant: ["tabular-nums"], fontSize: theme.type.small }}>
          <Text style={{ color: theme.colors.text, fontWeight: theme.weight.semi }}>{formatDuration(playhead)}</Text>{` / ${formatDuration(total)}`}
        </Body>
        <PressableScale accessibilityRole="button" accessibilityLabel="Aspect ratio" onPress={() => openStrip("ratio")} hitSlop={{ top: theme.space.sm, bottom: theme.space.sm }}>
          {/* `track`, not `hairline`: this outline stands alone and must be seen. */}
          <View testID="transport-ratio" style={{ height: theme.size.chipCompact, justifyContent: "center", borderWidth: 1, borderColor: theme.colors.track, borderRadius: theme.radius.pill, paddingHorizontal: theme.space.md }}>
            <Body weight="semi" style={{ fontSize: theme.type.small }}>{aspectLabel(project.aspectRatio)}</Body>
          </View>
        </PressableScale>
      </View>
    </View>
  );
}
