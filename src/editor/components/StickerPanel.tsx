import Slider from "@react-native-community/slider";
import { useRef, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { overlayBaseAt } from "@/src/editor/model/motion";
import { deleteOverlay, duplicateOverlay, editOverlayAt, updateOverlayShared, updateSticker } from "@/src/editor/model/ops";
import { isSticker, OVERLAY_LIMITS } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { theme } from "@/src/theme/theme";
import { SecondaryButton } from "@/src/ui/SecondaryButton";
import { NumField } from "@/src/ui/NumField";
import { Sheet } from "@/src/ui/Sheet";
import { Body } from "@/src/ui/Text";
import { ColorRow } from "./ColorRow";

type Props = { overlayId: string | null; visible: boolean; onClose: () => void; onRetarget?: (id: string) => void };

export function StickerPanel({ overlayId, visible, onClose, onRetarget }: Props) {
  const found = useEditorStore((s) => s.project?.overlays.find((o) => o.id === overlayId) ?? null);
  const { apply, beginTransaction, applyTransient, selectOverlay } = useEditorStore.getState();
  // The playhead, followed only while the overlay has keyframes (else nothing shown here depends on it).
  const playhead = useEditorStore((s) => ((s.project?.overlays.find((o) => o.id === overlayId)?.keyframes.length ?? 0) > 0 ? s.playhead : 0));
  const [fine, setFine] = useState(false);
  // The playhead when the Size drag started: the whole drag writes that moment (one pin, even if the playhead moves).
  const dragTime = useRef(0);
  if (!found || !isSticker(found)) return null;
  const sticker = found;
  const id = sticker.id;
  const patchShared = (p: Parameters<typeof updateOverlayShared>[2]) => apply((x) => updateOverlayShared(x, id, p));
  // Placement (x / y / scale / rotation) is read and written at the playhead: the pin there when the overlay has keyframes — its own
  // values are hidden then and must never be edited silently — otherwise its own values (`editOverlayAt` is the plain update then).
  const base = overlayBaseAt(sticker, playhead);
  const place = (p: Parameters<typeof editOverlayAt>[3]) => apply((x) => editOverlayAt(x, id, useEditorStore.getState().playhead, p));

  return (
    <Sheet visible={visible} onClose={onClose} title="Sticker" height="50%">
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: theme.space.lg, paddingBottom: theme.space.xl }}>
        {sticker.shape && (
          <ColorRow value={sticker.color} onChange={(color) => apply((x) => updateSticker(x, id, { color }))} />
        )}
        <View><Body muted>Size {Math.round(base.scale * 100)}%</Body>
          <Slider testID="sticker-size-slider" minimumValue={OVERLAY_LIMITS.scale[0]} maximumValue={OVERLAY_LIMITS.scale[1]} value={base.scale}
            onSlidingStart={() => { dragTime.current = useEditorStore.getState().playhead; beginTransaction(); }}
            onValueChange={(v: number) => applyTransient((x) => editOverlayAt(x, id, dragTime.current, { scale: v }))}
            minimumTrackTintColor={theme.colors.accent} maximumTrackTintColor={theme.colors.surfaceAlt} thumbTintColor={theme.colors.accent} /></View>
        <Pressable onPress={() => setFine((f) => !f)} accessibilityRole="button" style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <Body style={{ color: theme.colors.sea }}>Fine-tune</Body>
          <Body style={{ color: theme.colors.sea }}>{fine ? "▲" : "▼"}</Body>
        </Pressable>
        {fine && (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.space.md }}>
            <NumField label="X %" value={Math.round(base.x * 100)} onCommit={(v) => place({ x: v / 100 })} />
            <NumField label="Y %" value={Math.round(base.y * 100)} onCommit={(v) => place({ y: v / 100 })} />
            <NumField label="Scale" value={Number(base.scale.toFixed(2))} step={0.01} onCommit={(v) => place({ scale: v })} />
            <NumField label="Rotation °" value={Math.round(base.rotation)} onCommit={(v) => place({ rotation: v })} />
            <NumField label="Start s" value={Number(sticker.start.toFixed(1))} step={0.1} onCommit={(v) => patchShared({ start: v })} />
            <NumField label="End s" value={Number(sticker.end.toFixed(1))} step={0.1} onCommit={(v) => patchShared({ end: v })} />
          </View>
        )}
        <View style={{ flexDirection: "row", gap: theme.space.md }}>
          <SecondaryButton title="Duplicate" onPress={() => {
            apply((x) => duplicateOverlay(x, id));
            const overlays = useEditorStore.getState().project?.overlays ?? [];
            const dup = overlays[overlays.findIndex((o) => o.id === id) + 1];
            if (dup) { selectOverlay(dup.id); onRetarget?.(dup.id); }
          }} />
          <SecondaryButton danger title="Delete" onPress={() => { apply((x) => deleteOverlay(x, id)); onClose(); }} />
        </View>
      </ScrollView>
    </Sheet>
  );
}
