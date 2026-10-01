import Slider from "@react-native-community/slider";
import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { deleteOverlay, duplicateOverlay, updateOverlayShared, updateSticker } from "@/src/editor/model/ops";
import { isSticker, OVERLAY_LIMITS } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { theme } from "@/src/theme/theme";
import { Chip } from "@/src/ui/Chip";
import { NumField } from "@/src/ui/NumField";
import { Sheet } from "@/src/ui/Sheet";
import { Body } from "@/src/ui/Text";
import { ColorRow } from "./ColorRow";

type Props = { overlayId: string | null; visible: boolean; onClose: () => void; onRetarget?: (id: string) => void };

export function StickerPanel({ overlayId, visible, onClose, onRetarget }: Props) {
  const found = useEditorStore((s) => s.project?.overlays.find((o) => o.id === overlayId) ?? null);
  const { apply, beginTransaction, applyTransient, selectOverlay } = useEditorStore.getState();
  const [fine, setFine] = useState(false);
  if (!found || !isSticker(found)) return null;
  const sticker = found;
  const id = sticker.id;
  const patchShared = (p: Parameters<typeof updateOverlayShared>[2]) => apply((x) => updateOverlayShared(x, id, p));

  return (
    <Sheet visible={visible} onClose={onClose} title="Sticker" height="50%">
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: theme.space.lg, paddingBottom: theme.space.xl }}>
        {sticker.shape && (
          <ColorRow value={sticker.color} onChange={(color) => apply((x) => updateSticker(x, id, { color }))} />
        )}
        <View><Body muted>Size {Math.round(sticker.scale * 100)}%</Body>
          <Slider testID="sticker-size-slider" minimumValue={OVERLAY_LIMITS.scale[0]} maximumValue={OVERLAY_LIMITS.scale[1]} value={sticker.scale}
            onSlidingStart={() => beginTransaction()}
            onValueChange={(v: number) => applyTransient((x) => updateOverlayShared(x, id, { scale: v }))}
            minimumTrackTintColor={theme.colors.accent} /></View>
        <Pressable onPress={() => setFine((f) => !f)} accessibilityRole="button" style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <Body style={{ color: theme.colors.sea }}>Fine-tune</Body>
          <Body style={{ color: theme.colors.sea }}>{fine ? "▲" : "▼"}</Body>
        </Pressable>
        {fine && (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.space.md }}>
            <NumField label="X %" value={Math.round(sticker.x * 100)} onCommit={(v) => patchShared({ x: v / 100 })} />
            <NumField label="Y %" value={Math.round(sticker.y * 100)} onCommit={(v) => patchShared({ y: v / 100 })} />
            <NumField label="Scale" value={Number(sticker.scale.toFixed(2))} step={0.01} onCommit={(v) => patchShared({ scale: v })} />
            <NumField label="Rotation °" value={Math.round(sticker.rotation)} onCommit={(v) => patchShared({ rotation: v })} />
            <NumField label="Start s" value={Number(sticker.start.toFixed(1))} step={0.1} onCommit={(v) => patchShared({ start: v })} />
            <NumField label="End s" value={Number(sticker.end.toFixed(1))} step={0.1} onCommit={(v) => patchShared({ end: v })} />
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
      </ScrollView>
    </Sheet>
  );
}
