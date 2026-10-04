import { Pressable, View } from "react-native";
import { hasOverlayMotion, overlayBaseAt, resolveOverlayMotion, type KeyValues } from "@/src/editor/model/motion";
import { isSticker, type Overlay } from "@/src/editor/model/types";
import { useEditorStore } from "@/src/editor/store";
import { OverlayText } from "./OverlayText";
import { SelectionFrame } from "./SelectionFrame";
import { StickerView } from "./StickerView";

type Props = { frameW: number; frameH: number; onOpenPanel: (overlayId: string) => void };

/** Preview only: React Native on iOS skips hit-testing for views with alpha below 0.01, so a fully faded overlay could not be tapped. */
const MIN_VIEW_OPACITY = 0.02;

/** The overlay drawn at another placement (a display copy; the project is not changed). */
const placed = <T extends Overlay>(o: T, v: KeyValues): T => ({ ...o, x: v.x, y: v.y, scale: v.scale, rotation: v.rotation });

/**
 * Overlays visible at the playhead, drawn over the video inside the aspect frame. Tap an overlay to select it; tap elsewhere to deselect.
 * An overlay with an animation or keyframes is drawn where `resolveOverlayMotion` puts it at the playhead; its selection frame sits in
 * an unseen sibling copy at the base (static / keyframed) placement, so the handles stay put while the animation plays.
 * Every overlay keeps the key `id` (its frame copy `id-frame`) in one flat list, so motion toggling or other overlays coming and going never remount it.
 */
export function OverlayLayer({ frameW, frameH, onOpenPanel }: Props) {
  const allOverlays = useEditorStore((s) => s.project?.overlays ?? []);
  const playhead = useEditorStore((s) => s.playhead);
  const selectedId = useEditorStore((s) => s.selectedOverlayId);
  const { selectOverlay } = useEditorStore.getState();
  const visible = allOverlays.filter((o) => playhead >= o.start && playhead < o.end);
  return (
    <View pointerEvents="box-none" style={{ position: "absolute", left: 0, top: 0, width: frameW, height: frameH }}>
      {visible.flatMap((o) => {
        const m = hasOverlayMotion(o) ? resolveOverlayMotion(o, playhead) : null;
        const opacity = m ? Math.max(MIN_VIEW_OPACITY, m.opacity) : undefined;
        const frame = o.id === selectedId ? <SelectionFrame overlay={o} frameW={frameW} frameH={frameH} onDoubleTap={() => onOpenPanel(o.id)} /> : null;
        const size = { frameW, frameH };
        if (isSticker(o)) {
          const main = (
            <StickerView key={o.id} sticker={m ? placed(o, m) : o} {...size} opacity={opacity}>
              <Pressable style={{ position: "absolute", inset: 0 }} onPress={() => selectOverlay(o.id)} accessibilityLabel={`Sticker ${o.emoji ?? o.shape}`} />
              {m ? null : frame}
            </StickerView>
          );
          return m && frame ? [main, <StickerView key={`${o.id}-frame`} sticker={placed(o, overlayBaseAt(o, playhead))} {...size} frameOnly>{frame}</StickerView>] : [main];
        }
        // A see-through text (style opacity) fades its whole wrapper, so its frame goes in the unfaded copy too.
        const apart = m !== null || o.style.opacity < 1;
        const time = o.kind === "caption" && o.words.length > 0 && o.highlightColor ? playhead : undefined;
        const main = (
          <OverlayText key={o.id} overlay={m ? placed(o, m) : o} {...size} opacity={opacity} time={time}>
            <Pressable style={{ position: "absolute", inset: 0 }} onPress={() => selectOverlay(o.id)} accessibilityLabel={`Overlay ${o.text}`} />
            {apart ? null : frame}
          </OverlayText>
        );
        return apart && frame ? [main, <OverlayText key={`${o.id}-frame`} overlay={placed(o, overlayBaseAt(o, playhead))} {...size} frameOnly>{frame}</OverlayText>] : [main];
      })}
    </View>
  );
}
