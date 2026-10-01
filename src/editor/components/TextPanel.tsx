import Slider from "@react-native-community/slider";
import { useState } from "react";
import { Pressable, ScrollView, Switch, TextInput, View } from "react-native";
import { deleteOverlay, duplicateOverlay, updateOverlay } from "@/src/editor/model/ops";
import { OVERLAY_LIMITS, type Align } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { theme } from "@/src/theme/theme";
import { Chip } from "@/src/ui/Chip";
import { NumField } from "@/src/ui/NumField";
import { PrimaryButton } from "@/src/ui/PrimaryButton";
import { Sheet } from "@/src/ui/Sheet";
import { Body } from "@/src/ui/Text";
import { ColorRow } from "./ColorRow";
import { FontStrip } from "./FontStrip";

type Props = { overlayId: string | null; visible: boolean; onClose: () => void; onRetarget?: (id: string) => void };
const field = { backgroundColor: theme.colors.surfaceAlt, color: theme.colors.text, borderRadius: theme.radius.chip, padding: 10, fontSize: 16, minWidth: 72 } as const;

export function TextPanel({ overlayId, visible, onClose, onRetarget }: Props) {
  const overlay = useEditorStore((s) => s.project?.overlays.find((o) => o.id === overlayId) ?? null);
  const { apply, beginTransaction, applyTransient, selectOverlay } = useEditorStore.getState();
  const [fine, setFine] = useState(false);
  if (!overlay) return null;
  const id = overlay.id;
  const patch = (p: Parameters<typeof updateOverlay>[2]) => apply((x) => updateOverlay(x, id, p));
  const slider = (key: "fontScale" | "opacity") => ({
    onSlidingStart: () => beginTransaction(),
    onValueChange: (v: number) => applyTransient((x) => updateOverlay(x, id, key === "fontScale" ? { fontScale: v } : { background: { color: overlay.background?.color ?? "#000000", opacity: v } })),
  });

  return (
    <Sheet visible={visible} onClose={onClose} title="Text" height="55%">
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: theme.space.lg, paddingBottom: theme.space.xl }}>
        <TextInput accessibilityLabel="Overlay text" multiline autoFocus value={overlay.text}
          onFocus={() => beginTransaction()} onChangeText={(t) => applyTransient((x) => updateOverlay(x, id, { text: t }))}
          style={{ ...field, minHeight: 64, textAlignVertical: "top" }} placeholder="Your text" placeholderTextColor={theme.colors.textMuted} />
        <FontStrip value={overlay.fontId} onChange={(fontId) => patch({ fontId })} />
        <View><Body muted>Size {Math.round(overlay.fontScale * 100)}%</Body>
          <Slider testID="size-slider" minimumValue={OVERLAY_LIMITS.fontScale[0]} maximumValue={OVERLAY_LIMITS.fontScale[1]} value={overlay.fontScale} {...slider("fontScale")} minimumTrackTintColor={theme.colors.accent} /></View>
        <ColorRow value={overlay.color} onChange={(color) => patch({ color })} />
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Body>Background</Body>
          <Switch accessibilityLabel="Background" value={!!overlay.background} onValueChange={(on) => patch({ background: on ? { color: "#000000", opacity: 0.6 } : null })} trackColor={{ true: theme.colors.accent }} />
        </View>
        {overlay.background && (<>
          <ColorRow value={overlay.background.color} onChange={(color) => patch({ background: { color, opacity: overlay.background!.opacity } })} />
          <Slider testID="opacity-slider" minimumValue={0.2} maximumValue={1} value={overlay.background.opacity} {...slider("opacity")} minimumTrackTintColor={theme.colors.accent} />
        </>)}
        <View style={{ flexDirection: "row", alignItems: "center", gap: theme.space.md }}>
          {(["left", "center", "right"] as Align[]).map((a) => <Chip key={a} label={`Align ${a}`} selected={overlay.align === a} onPress={() => patch({ align: a })} />)}
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Body>Outline</Body>
          <Switch accessibilityLabel="Outline" value={overlay.outline} onValueChange={(outline) => patch({ outline })} trackColor={{ true: theme.colors.accent }} />
        </View>
        <Pressable onPress={() => setFine((f) => !f)} accessibilityRole="button" style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <Body style={{ color: theme.colors.sea }}>Fine-tune</Body>
          <Body style={{ color: theme.colors.sea }}>{fine ? "▲" : "▼"}</Body>
        </Pressable>
        {fine && (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.space.md }}>
            <NumField label="X %" value={Math.round(overlay.x * 100)} onCommit={(v) => patch({ x: v / 100 })} />
            <NumField label="Y %" value={Math.round(overlay.y * 100)} onCommit={(v) => patch({ y: v / 100 })} />
            <NumField label="Scale" value={Number(overlay.scale.toFixed(2))} step={0.01} onCommit={(v) => patch({ scale: v })} />
            <NumField label="Rotation °" value={Math.round(overlay.rotation)} onCommit={(v) => patch({ rotation: v })} />
            <NumField label="Start s" value={Number(overlay.start.toFixed(1))} step={0.1} onCommit={(v) => patch({ start: v })} />
            <NumField label="End s" value={Number(overlay.end.toFixed(1))} step={0.1} onCommit={(v) => patch({ end: v })} />
          </View>
        )}
        <View style={{ flexDirection: "row", gap: theme.space.md }}>
          <Chip label="Duplicate" selected={false} onPress={() => {
            apply((x) => duplicateOverlay(x, id));
            const overlays = useEditorStore.getState().project?.overlays ?? [];
            const dup = overlays[overlays.findIndex((o) => o.id === id) + 1];
            if (dup) { selectOverlay(dup.id); onRetarget?.(dup.id); }
          }} />
          <Chip label="Delete" selected={false} onPress={() => { apply((x) => deleteOverlay(x, id)); onClose(); }} />
        </View>
        <PrimaryButton title="Done" disabled={overlay.text.trim().length === 0} onPress={onClose} />
      </ScrollView>
    </Sheet>
  );
}
