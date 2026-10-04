import { Pressable, View } from "react-native";
import { hasOverlayMotion, overlayBaseAt, resolveOverlayMotion, type KeyValues } from "@/src/editor/model/motion";
import { isSticker, type Overlay } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { OverlayText } from "./OverlayText";
import { SelectionFrame } from "./SelectionFrame";
import { StickerView } from "./StickerView";

type Props = { frameW: number; frameH: number; onOpenPanel: (overlayId: string) => void };

/** The overlay drawn at another placement (a display copy; the project is not changed). */
const placed = <T extends Overlay>(o: T, v: KeyValues): T => ({ ...o, x: v.x, y: v.y, scale: v.scale, rotation: v.rotation });

/**
 * Overlays visible at the playhead, drawn over the video inside the aspect frame. Tap an overlay to select it; tap elsewhere to deselect.
 * An overlay with an animation or keyframes is drawn where `resolveOverlayMotion` puts it at the playhead; its selection frame sits in
 * an unseen copy at the base (static / keyframed) placement, so the handles stay put while the animation plays.
 */
export function OverlayLayer({ frameW, frameH, onOpenPanel }: Props) {
  const allOverlays = useEditorStore((s) => s.project?.overlays ?? []);
  const playhead = useEditorStore((s) => s.playhead);
  const selectedId = useEditorStore((s) => s.selectedOverlayId);
  const { selectOverlay } = useEditorStore.getState();
  const visible = allOverlays.filter((o) => playhead >= o.start && playhead < o.end);
  return (
    <View pointerEvents="box-none" style={{ position: "absolute", left: 0, top: 0, width: frameW, height: frameH }}>
      {visible.map((o) => {
        const frame = o.id === selectedId ? <SelectionFrame overlay={o} frameW={frameW} frameH={frameH} onDoubleTap={() => onOpenPanel(o.id)} /> : null;
        if (!hasOverlayMotion(o)) {
          return isSticker(o) ? (
            <StickerView key={o.id} sticker={o} frameW={frameW} frameH={frameH}>
              <Pressable style={{ position: "absolute", inset: 0 }} onPress={() => selectOverlay(o.id)} accessibilityLabel={`Sticker ${o.emoji ?? o.shape}`} />
              {frame}
            </StickerView>
          ) : (
            <OverlayText key={o.id} overlay={o} frameW={frameW} frameH={frameH}>
              <Pressable style={{ position: "absolute", inset: 0 }} onPress={() => selectOverlay(o.id)} accessibilityLabel={`Overlay ${o.text}`} />
              {frame}
            </OverlayText>
          );
        }
        const m = resolveOverlayMotion(o, playhead);
        const base = overlayBaseAt(o, playhead);
        return isSticker(o) ? [
          <StickerView key={o.id} sticker={placed(o, m)} frameW={frameW} frameH={frameH} opacity={m.opacity}>
            <Pressable style={{ position: "absolute", inset: 0 }} onPress={() => selectOverlay(o.id)} accessibilityLabel={`Sticker ${o.emoji ?? o.shape}`} />
          </StickerView>,
          frame && <StickerView key={`${o.id}-base`} sticker={placed(o, base)} frameW={frameW} frameH={frameH} frameOnly>{frame}</StickerView>,
        ] : [
          <OverlayText key={o.id} overlay={placed(o, m)} frameW={frameW} frameH={frameH} opacity={m.opacity}>
            <Pressable style={{ position: "absolute", inset: 0 }} onPress={() => selectOverlay(o.id)} accessibilityLabel={`Overlay ${o.text}`} />
          </OverlayText>,
          frame && <OverlayText key={`${o.id}-base`} overlay={placed(o, base)} frameW={frameW} frameH={frameH} frameOnly>{frame}</OverlayText>,
        ];
      })}
    </View>
  );
}
