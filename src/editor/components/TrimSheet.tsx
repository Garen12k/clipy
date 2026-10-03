import { useEffect, useState } from "react";
import { TextInput, View } from "react-native";
import { isPhoto } from "@/src/editor/model/types";
import { trimClip } from "@/src/editor/model/ops";
import { useEditorStore } from "@/src/editor/store";
import { theme } from "@/src/theme/theme";
import { PrimaryButton } from "@/src/ui/PrimaryButton";
import { Sheet } from "@/src/ui/Sheet";
import { Body } from "@/src/ui/Text";

const field = { backgroundColor: theme.colors.surfaceAlt, color: theme.colors.text, borderRadius: theme.radius.chip, padding: 12, fontSize: 18, flex: 1, fontFamily: theme.fonts.body } as const;

export function TrimSheet({ clipId, visible, onClose }: { clipId: string | null; visible: boolean; onClose: () => void }) {
  const clip = useEditorStore((s) => s.project?.clips.find((c) => c.id === clipId) ?? null);
  const apply = useEditorStore((s) => s.apply);
  const [start, setStart] = useState("0"); const [end, setEnd] = useState("0");
  useEffect(() => { if (clip) { setStart(clip.trimStart.toFixed(1)); setEnd(clip.trimEnd.toFixed(1)); } }, [clip?.id, visible]);
  if (!clip) return null;
  if (isPhoto(clip)) {
    return (
      <Sheet visible={visible} onClose={onClose} title="Trim">
        <Body muted>How long the photo stays on screen (0.5 – 60 s)</Body>
        <TextInput accessibilityLabel="Length" keyboardType="decimal-pad" value={end} onChangeText={setEnd} style={field} />
        <PrimaryButton compact title="Apply" onPress={() => { apply((p) => trimClip(p, clip.id, 0, Number(end) || 0)); onClose(); }} />
      </Sheet>
    );
  }
  return (
    <Sheet visible={visible} onClose={onClose} title="Trim">
      <Body muted>Seconds into the original clip (0 – {clip.sourceDuration.toFixed(1)})</Body>
      <View style={{ flexDirection: "row", gap: theme.space.md }}>
        <TextInput accessibilityLabel="Trim start" keyboardType="decimal-pad" value={start} onChangeText={setStart} style={field} />
        <TextInput accessibilityLabel="Trim end" keyboardType="decimal-pad" value={end} onChangeText={setEnd} style={field} />
      </View>
      <PrimaryButton compact title="Apply" onPress={() => { apply((p) => trimClip(p, clip.id, Number(start) || 0, Number(end) || 0)); onClose(); }} />
    </Sheet>
  );
}
